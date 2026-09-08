//=============================================================================
// FastTravelSystem.js
// Version: 1.7.0 (Persistent Travel Timer + Fuel System)
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Fast Travel System v1.7.0
 * @author Omni-Lex (Reworked by OmniLex, Enhanced with Persistent Timer)
 * @version 1.7.0
 * @description A comprehensive fast travel system with persistent travel countdown, travel maps, manual completion, and fuel system.
 *
 * @param baseDistancePrice
 * @text Base Distance Price
 * @desc Base price per distance unit (in gold)
 * @type number
 * @default 10
 *
 * @param playerXVar
 * @text Player X Variable
 * @desc Variable ID that stores player X position
 * @type variable
 * @default 43
 *
 * @param playerYVar
 * @text Player Y Variable
 * @desc Variable ID that stores player Y position
 * @type variable
 * @default 44
 *
 * @param maxTravelTime
 * @text Max Travel Time
 * @desc Maximum travel time in seconds
 * @type number
 * @default 120
 *
 * @param fuelConsumptionRate
 * @text Fuel Consumption Rate
 * @desc Liters consumed per distance unit for car sharing
 * @type number
 * @decimals 4
 * @default 0.0015
 *

 * @command StartFastTravel
 * @text Start Fast Travel
 * @desc Opens the fast travel destination window directly.
 *
 * @arg transportType
 * @text Transport Type
 * @desc The type of transportation to use
 * @type select
 * @option Walking
 * @value walking
 * @option Bicycle
 * @value bicycle
 * @option Horse
 * @value horse
 * @option Car Sharing
 * @value carsharing
 * @option Camper
 * @value camper
 * @option Bus
 * @value bus
 * @option Train
 * @value train
 * @option Taxi
 * @value taxi
 * @option Boat
 * @value boat
 * @option Ferry
 * @value ferry
 * @option Airplane (Economy)
 * @value airplane_economy
 * @option Airplane (Business)
 * @value airplane_business
 * @option Private Jet
 * @value private_jet
 * @option Limousine
 * @value limousine
 * @option Helicopter
 * @value helicopter
 * @option Cruise Ship
 * @value cruise
 * @option Submarine
 * @value submarine
 * @option Hot Air Balloon
 * @value balloon
 * @option Zeppelin
 * @value zeppelin
 * @option Magic Carpet
 * @value magic_carpet
 * @option Dragon Mount
 * @value dragon
 * @option Teleportation Circle
 * @value teleport_circle
 * @option Hypermetro Network
 * @value hypermetro
 * @option Maglev Train
 * @value maglev
 * @option Hyperloop
 * @value hyperloop
 * @option Low Orbit Starship
 * @value starship
 * @option Wormhole Portal
 * @value wormhole
 * @option Quantum Teleportation
 * @value quantum
 * @option Time Machine
 * @value time_machine
 * @option Dimensional Gateway
 * @value dimensional
 * @default walking
 *
 * @command RefreshDestinations
 * @text Refresh Destinations
 * @desc Forces a refresh of the destination cache (use after adding new teleport events).
 *
 * @command EndTravel
 * @text End Travel
 * @desc Completes the travel when called on a transportation map after timer reaches zero.
 * 
 * @command EndTravelCamper
 * @text End Travel Camper
 * @desc Completes the travel when called on a transportation map after timer reaches zero.
 * 
 * 
 * @command EndTravelCar
 * @text End Travel Car
 * @desc Completes the travel when called on a transportation map after timer reaches zero.
 *
 * @command EndTravelAirship
 * @text End Travel Airship
 * @desc Completes the travel when called on a transportation map after timer reaches zero.
 *
 * @command TeleportToAirship
 * @text Teleport To Airship
 * @desc Teleports the player to the airship's current location on map 315.
 *
 * @command TeleportToAirshipAndRide
 * @text Teleport To Airship And Ride
 * @desc Teleports the player to the airship's location and boards it.
 *

 * @command ShowDestinationPicture
 * @text Show Destination Picture
 * @desc Shows a picture window for the specified destination.
 *
 * @arg locationName
 * @text Location Name
 * @desc The name of the location to display
 * @type text
 * @default Antwerpen
 *
 * @command HideDestinationPicture
 * @text Hide Destination Picture
 * @desc Hides the destination picture window.
 *
 * @command StoryModeStation
 * @text Story mode Station
 * @desc Opens the fast travel destination window via train, restricted to Ghent and Omega Tower.
 *
 * @help FastTravelSystem.js (v1.7.0)
 *
 * * New in v1.7.0:
 * - Completely refactored timer system to be truly persistent across all scenes
 * - Timer window now stays visible when opening menus, battles, or other scenes
 * - Travel data is now stored in $gameSystem for complete persistence
 * - Improved timer synchronization and refresh logic
 * - Fixed timer disappearing issues during gameplay
 *
 * * Features from v1.6.0:
 * - Car sharing uses fuel instead of money for travel costs
 * - Added fuel system with RV camper capacity (100 liters)
 * - Added refueling window accessible via plugin command
 * - Fuel price is influenced by Variable 53
 * - Fuel consumption rate: 0.02 liters per distance unit
 *
 * * Core Features:
 * - Events with names starting with "Teleport" are destinations
 * - Player is first teleported to a travel map specific to the transport type
 * - Persistent timer that survives menu operations and scene changes
 * - Travel costs are calculated based on distance and transport type
 * - Car sharing uses fuel instead of money
 * - Use the "EndTravel" command to complete travel once timer reaches zero
 * - Use the "ShowRefuelWindow" command to refuel your vehicle
 */

(() => {
    'use strict';

    const X_OFFSET = 0;
    const Y_OFFSET = 0;
    const SCALE_FACTOR = 1.0;
    // Calibrated from: Ghent tile(84,119)→pixel(404,487), Bologna tile(124,167)→pixel(597,682)
    const MAP_SCALE_X  = 4.825;    // px per world tile on X
    const MAP_SCALE_Y  = 4.0625;   // px per world tile on Y
    const MAP_OFFSET_X = -1.3;
    const MAP_OFFSET_Y = -20.5625;

    const pluginName = 'FastTravelSystem';
    const parameters = PluginManager.parameters(pluginName);
    const baseDistancePrice = parseInt(parameters['baseDistancePrice']) || 10;
    const playerXVar = parseInt(parameters['playerXVar']) || 43;
    const playerYVar = parseInt(parameters['playerYVar']) || 44;
    const maxTravelTime = parseInt(parameters['maxTravelTime']) || 600;
    const fuelConsumptionRate = parseFloat(parameters['fuelConsumptionRate']) || 0.0015;

    // Base time in seconds it takes to travel one tile. Used in timer calculation.
    // Adjusted to 0.666 so that 100km (tiles) with Train (3.33x) takes 20 seconds.
    const baseTimePerTile = 0.666;
    const TRANSPORT_DESTINATIONS = window.WorkSystem.Destinations || {};

    // The Destinations.json key is the identity of a place (lookups, save data,
    // "Teleport - <key>" event names); its "name" field is what the player reads.
    const destLabel = (name) =>
        (window.WorkSystem && window.WorkSystem.destinationName)
            ? window.WorkSystem.destinationName(name)
            : String(name == null ? '' : name);

    // What a row, a pin and a confirmation call the place. A point the party
    // wrote down themselves carries its own name and never goes near the
    // Destinations.json index, which knows nothing about it.
    const rowLabel = (dest) =>
        (dest && dest.customName) ? dest.customName : destLabel(dest && dest.name);

    // ------------------------------------------------------------------------
    // AFTER THE IMPACT
    // ------------------------------------------------------------------------
    // Once Earth has been struck out (switch 199, WorldMapTransfer.earthLost)
    // there is no continent to cross and nothing left on it: the network is one
    // stop. The book still opens, but the right page is not a map of Europe any
    // more - it is the space the Earth used to be in, with the Omega Tower
    // hanging at the middle of it, and that is the only place anything goes.
    const OMEGA_TOWER_DEST = 'Omega Tower';   // i18n-ignore  Destinations.json key
    // Middle of the 1232x1039 page the markers are laid out on.
    const SPACE_CENTRE = { x: 616, y: 520 };

    function earthLost() {
        const WMT = window.WorldMapTransfer;
        return !!(WMT && WMT.earthLost && WMT.earthLost());
    }
    // Where a destination's pin sits on the page. Off Earth every pin is the
    // same pin, so the map is drawn from this rather than from the world tile
    // the entry names.
    function destPixel(dest) {
        if (earthLost()) return { x: SPACE_CENTRE.x, y: SPACE_CENTRE.y };
        const original = TRANSPORT_DESTINATIONS[dest && dest.name] || dest || {};
        const image = original.image ||
            (dest && dest.transportOverrides && dest.transportOverrides.image) || { x: 0, y: 0 };
        return {
            x: parseFloat(image.x) * SCALE_FACTOR + X_OFFSET,
            y: parseFloat(image.y) * SCALE_FACTOR + Y_OFFSET,
        };
    }
    // The party's own pin. They are already at the tower, so it is the same one.
    function playerPixel() {
        if (earthLost()) return { x: SPACE_CENTRE.x, y: SPACE_CENTRE.y };
        return {
            x: Math.round($gameVariables.value(playerXVar) * MAP_SCALE_X + MAP_OFFSET_X),
            y: Math.round($gameVariables.value(playerYVar) * MAP_SCALE_Y + MAP_OFFSET_Y),
        };
    }

    let _travelSelectedIndex = 0;
    // Cached reference to the travel overlay element, set when it is created and
    // cleared when removed, so the per-frame Scene_Map hooks below avoid a
    // document.getElementById('travel-overlay') lookup every frame.
    let _travelOverlayEl = null;

    // Dynamically convert existing x and y of const TRANSPORT_DESTINATIONS to image pixel coordinates (1232x1039p)
    // and add them as image: { x: "...", y: "..." } inside TRANSPORT_DESTINATIONS.
// Dynamically convert existing x and y of const TRANSPORT_DESTINATIONS to image pixel coordinates (1232x1039p)
    // and add them as image: { x: "...", y: "..." } inside TRANSPORT_DESTINATIONS.
    for (const name in TRANSPORT_DESTINATIONS) {
        const dest = TRANSPORT_DESTINATIONS[name];
        
        // Prioritize explicit mapOffset coordinates if they have been set
        if (dest.mapOffset && (dest.mapOffset.x !== 0 || dest.mapOffset.y !== 0)) {
            dest.image = {
                x: String(dest.mapOffset.x),
                y: String(dest.mapOffset.y)
            };
        }
        // Fallback to calculating from base tile coordinates
        else if (dest.base) {
            const x = Math.round(dest.base.x * MAP_SCALE_X + MAP_OFFSET_X);
            const y = Math.round(dest.base.y * MAP_SCALE_Y + MAP_OFFSET_Y);
            dest.image = { x: String(x), y: String(y) };
        } 
        // Ultimate fallback
        else {
            dest.image = { x: "0", y: "0" };
        }
    }
    const travelMaps = {
        walking: { mapId: 0, x: 10, y: 10 },
        bicycle: { mapId: 0, x: 10, y: 10 },
        horse: { mapId: 0, x: 10, y: 10 },
        carsharing: { mapId: 0, x: 10, y: 10 },
        camper: { mapId: 0, x: 10, y: 10 },
        bus: { mapId: 719, x: 8, y: 7 },
        train: { mapId: 718, x: 7, y: 7 },
        taxi: { mapId: 720, x: 10, y: 10 },
        boat: { mapId: 0, x: 10, y: 10 },
        ferry: { mapId: 0, x: 10, y: 10 },
        airplane_economy: { mapId: 0, x: 10, y: 10 },
        airplane_business: { mapId: 0, x: 10, y: 10 },
        private_jet: { mapId: 0, x: 10, y: 10 },
        limousine: { mapId: 0, x: 10, y: 10 },
        helicopter: { mapId: 0, x: 10, y: 10 },
        cruise: { mapId: 0, x: 10, y: 10 },
        submarine: { mapId: 0, x: 10, y: 10 },
        balloon: { mapId: 0, x: 10, y: 10 },
        zeppelin: { mapId: 0, x: 10, y: 10 },
        magic_carpet: { mapId: 0, x: 10, y: 10 },
        dragon: { mapId: 0, x: 10, y: 10 },
        teleport_circle: { mapId: 0, x: 10, y: 10 },
        hypermetro: { mapId: 0, x: 10, y: 10 },
        maglev: { mapId: 0, x: 10, y: 10 },
        hyperloop: { mapId: 0, x: 10, y: 10 },
        starship: { mapId: 0, x: 10, y: 10 },
        wormhole: { mapId: 0, x: 10, y: 10 },
        quantum: { mapId: 0, x: 10, y: 10 },
        time_machine: { mapId: 0, x: 10, y: 10 },
        dimensional: { mapId: 0, x: 10, y: 10 }
    };

    const transportMultipliers = {
        walking: 0.0, bicycle: 0.1, horse: 0.5, carsharing: 0.0, camper: 0.0, // Car sharing now costs no money
        bus: 0.8, train: 1.2, taxi: 2.5, boat: 1.5, ferry: 1.3, airplane_economy: 3.0,
        airplane_business: 6.0, private_jet: 25.0, limousine: 5.0, helicopter: 1.0,
        cruise: 8.0, submarine: 20.0, balloon: 4.0, zeppelin: 7.0,
        magic_carpet: 10.0, dragon: 12.0, teleport_circle: 1.0, hypermetro: 2.0,
        maglev: 2.5, hyperloop: 3.5, starship: 50.0, wormhole: 100.0,
        quantum: 200.0, time_machine: 500.0, dimensional: 1000.0
    };

    // The transport ids a Destinations.json entry may carry as an arrival
    // override. Every other key in an entry ("name", "type", "base",
    // "mapOffset", "picture", "minLevel", ...) describes the place itself
    // and must never be mistaken for a transport stop.
    const TRANSPORT_KEYS = Object.keys(transportMultipliers);

    // Speed multipliers for travel duration. Higher value = faster travel.
    const speedMultipliers = {
        walking: 1.0, bicycle: 1.25, horse: 1.67, carsharing: 3.5, camper: 2.5,
        bus: 2.0, train: 3.33, taxi: 3.33, boat: 1.43, ferry: 1.67,
        airplane_economy: 5.0, airplane_business: 6.67, private_jet: 10.0,
        limousine: 4.0, helicopter: 6.67, cruise: 1.25, submarine: 1.67,
        balloon: 1.11, zeppelin: 1.43, magic_carpet: 5.0, dragon: 10.0,
        teleport_circle: 20.0, hypermetro: 6.67, maglev: 10.0, hyperloop: 12.5,
        starship: 20.0, wormhole: 50.0, quantum: 100.0, time_machine: 200.0,
        dimensional: 1000.0
    };

    // The mode id is the key everywhere else in the plugin; only the
    // label is display copy, so it resolves on read.
    const transportNames = new Proxy({}, {
        get: (_, id) => T('FastTravel.transport.' + String(id)),
        has: () => true
    });

    // The camper answers to its name for the crew that gave it one
    // (CharacterCreationPresets.camperName, switches 48/49); every other
    // transport keeps the label above.
    function transportLabel(transportType) {
        const base = transportNames[transportType] || transportType;
        if (transportType !== 'camper') return base;
        return window.CharacterPresets?.camperName?.(base) ?? base;
    }

    let destinationCache = null;
    let cacheInitialized = false;
    let globalTravelTimer = null;

    //=============================================================================
    // Game_System - Enhanced for persistent travel data
    //=============================================================================
    const _Game_System_initialize_FTS = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize_FTS.call(this);
        this.initializeFastTravelData();
    };

    Game_System.prototype.initializeFastTravelData = function () {
        this._fastTravelData = {
            destinations: [],
            selectedTransport: 'walking',
            isActive: false,
            finalDestination: null,
            originalMap: null,
            travelStartTime: null,
            totalDistanceKm: 0,
            travelCompleted: false,
            currentTravelMapId: null,

            // Timer specific data
            timerActive: false,
            timerStartTime: 0,
            timerDuration: 0,
            timerRemainingTime: 0,
            timerDestination: '',
            timerTransport: 'walking',

            // TimeDateSystem integration data
            travelStartGameTime: 0,
            totalTravelMinutes: 0,
            minutesPerSecond: 0
        };
    };

    Game_System.prototype.getFastTravelData = function () {
        if (!this._fastTravelData) {
            this.initializeFastTravelData();
        }
        return this._fastTravelData;
    };

    Game_System.prototype.startTravelTimer = function (duration, transport, destination, totalKm) {
        const data = this.getFastTravelData();
        data.timerActive = true;
        data.timerStartTime = Date.now();
        data.timerDuration = duration;
        data.timerRemainingTime = duration;
        data.timerDestination = destination;
        data.timerTransport = transport;
        data.totalDistanceKm = totalKm;

        // Calculate time advancement for TimeDateSystem integration
        // Each tile of distance = 1 minutes of game time
        // Time advancement scales with transport speed:
        // - Faster transports advance time faster per second
        // - Slower transports advance time slower per second
        const distanceInTiles = totalKm / 1; // Convert back from "km" to tiles
        const baseMinutesPerTile = 1; // Base game minutes per tile
        const totalGameMinutes = distanceInTiles * baseMinutesPerTile;

        // Calculate minutes per real second based on actual travel duration
        // Faster transports have shorter durations, so more minutes per second
        // Slower transports have longer durations, so fewer minutes per second
        const minutesPerSecond = duration > 0 ? totalGameMinutes / duration : totalGameMinutes;

        data.travelStartGameTime = $gameVariables.value(114) || 0; // Variable 114 = gameTimeVariable
        data.totalTravelMinutes = totalGameMinutes;
        data.minutesPerSecond = minutesPerSecond;

        // Start global interval timer
        if (globalTravelTimer) {
            clearInterval(globalTravelTimer);
        }

        globalTravelTimer = setInterval(() => {
            this.updateTravelTimer();
        }, 1000);

        // Force immediate update of any visible timer windows
        this.updateAllTravelTimerWindows();
    };

    Game_System.prototype.updateTravelTimer = function () {
        const data = this.getFastTravelData();
        if (!data.timerActive) return;

        const elapsed = Math.floor((Date.now() - data.timerStartTime) / 1000);
        data.timerRemainingTime = Math.max(0, data.timerDuration - elapsed);

        // Update game variable
        $gameVariables.setValue(45, data.timerRemainingTime);

        // Advance game time for TimeDateSystem integration
        // Time advancement is scaled by transport speed
        // - Faster transports advance time faster per second
        // - Slower transports advance time slower per second
        if (data.timerDuration > 0 && data.minutesPerSecond) {
            const minutesToAdd = elapsed * data.minutesPerSecond;
            const newGameTime = data.travelStartGameTime + minutesToAdd;
            $gameVariables.setValue(114, Math.floor(newGameTime)); // Variable 114 = gameTimeVariable
        }

        // Update all timer windows
        this.updateAllTravelTimerWindows();

        // Check for completion
        if (data.timerRemainingTime <= 0) {
            this.completeTravelTimer();
        }

    };

    Game_System.prototype.completeTravelTimer = function () {
        const data = this.getFastTravelData();
        if (globalTravelTimer) {
            clearInterval(globalTravelTimer);
            globalTravelTimer = null;
        }

        data.travelCompleted = true;
        $gameSwitches.setValue(55, false);

        if (window.ParchmentToast) {
            const destName = data.timerDestination
                ? destLabel(data.timerDestination) : T('FastTravel.yourDestination');
            ParchmentToast.show(T('FastTravel.arrivedAt', { place: destName }), { severity: 'good' });
        }

        this.updateAllTravelTimerWindows();
    };

    Game_System.prototype.stopTravelTimer = function () {
        const data = this.getFastTravelData();
        data.timerActive = false;
        data.timerRemainingTime = 0;
        data.travelCompleted = false;

        if (globalTravelTimer) {
            clearInterval(globalTravelTimer);
            globalTravelTimer = null;
        }

        this.updateAllTravelTimerWindows();
    };

    Game_System.prototype.updateAllTravelTimerWindows = function () {
        // Update timer windows in all scenes
        if (SceneManager._scene && SceneManager._scene._travelTimerWindow) {
            SceneManager._scene._travelTimerWindow.refreshFromGameSystem();
        }
    };

    Game_System.prototype.clearFastTravelData = function () {
        this.stopTravelTimer();
        this.initializeFastTravelData();
        $gameSwitches.setValue(55, false);
        if ($gamePlayer) {
            $gamePlayer.setMovementLock(false);
        }
    };

    const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;
    Game_System.prototype.onAfterLoad = function () {
        _Game_System_onAfterLoad.call(this);
        cacheInitialized = false;
        destinationCache = null;

        // Restart timer if it was active
        const data = this.getFastTravelData();
        if (data.timerActive && data.timerRemainingTime > 0) {
            const elapsed = Math.floor((Date.now() - data.timerStartTime) / 1000);
            const remaining = Math.max(0, data.timerDuration - elapsed);

            if (remaining > 0) {
                data.timerRemainingTime = remaining;
                // Clear any already-running interval first (like startTravelTimer)
                // so loading a save mid-travel doesn't double-schedule the timer.
                if (globalTravelTimer) {
                    clearInterval(globalTravelTimer);
                    globalTravelTimer = null;
                }
                globalTravelTimer = setInterval(() => {
                    this.updateTravelTimer();
                }, 1000);
            } else {
                this.completeTravelTimer();
            }
        }
    };

    // Utility functions now use $gameSystem
    function getFastTravelData() {
        return $gameSystem.getFastTravelData();
    }

    function clearFastTravelData() {
        $gameSystem.clearFastTravelData();
    }

    // Plugin commands
    PluginManager.registerCommand(pluginName, "StartFastTravel", args => {
        const transportType = args.transportType || 'walking';
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.startFastTravel(transportType);
        }
    });

    PluginManager.registerCommand(pluginName, "RefreshDestinations", () => {
        refreshDestinationCache();
    });





    PluginManager.registerCommand(pluginName, "EndTravel", () => {
        if (!canEndTravel()) {
            return;
        }

        completeTravelToDestination();
    });

    PluginManager.registerCommand(pluginName, "EndTravelCamper", () => {
        completeTravelCamper();
    });

    PluginManager.registerCommand(pluginName, "EndTravelCar", () => {
        completeTravelCar();
    });

    PluginManager.registerCommand(pluginName, "EndTravelAirship", () => {
        completeTravelAirship();
    });

    PluginManager.registerCommand(pluginName, "TeleportToAirship", () => {
        teleportToAirship();
    });

    PluginManager.registerCommand(pluginName, "TeleportToAirshipAndRide", () => {
        teleportToAirshipAndRide();
    });



    PluginManager.registerCommand(pluginName, "ShowDestinationPicture", args => {
        const locationName = T.param(args.locationName, 'FastTravel.defaultDestination');
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.showDestinationPicture(locationName);
        }
    });

    PluginManager.registerCommand(pluginName, "StoryModeStation", () => {
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.startStoryModeTravel();
        }
    });

    PluginManager.registerCommand(pluginName, "HideDestinationPicture", () => {
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.hideDestinationPicture();
        }
    });

    // Helper functions
    function canEndTravel() {
        const data = getFastTravelData();

        if (!data.finalDestination) {
            return false;
        }

        if (!data.travelCompleted) {
            return false;
        }

        if (data.selectedTransport === 'carsharing' || data.selectedTransport === 'camper') {
            const currentMapId = $gameMap.mapId();
            if (currentMapId !== data.currentTravelMapId) {
                return false;
            }
            return true;
        }

        const currentMapId = $gameMap.mapId();
        if (currentMapId !== data.currentTravelMapId) {
            return false;
        }

        return true;
    }

    function calculateDistance(x1, y1, x2, y2) {
        const d = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        // A malformed destination must not poison the price with NaN: an
        // unreadable distance costs nothing rather than costing more gold than
        // the party can ever hold.
        return Number.isFinite(d) ? d : 0;
    }

    function goldToEuros(gold) {
        return (gold / 100).toFixed(2);
    }

    // Vehicle fuel/position are owned by VehicleSystem's per-vehicle stores
    // (window.VehicleFuel / window.VehiclePosition), NOT RPG Maker variables.
    // These helpers route through those stores.
    // worldX/worldY are the map-315 square the vehicle is now parked on. They are
    // passed explicitly wherever the destination knows them: a station or helipad
    // map cannot be asked where in the world it is (most maps still carry the
    // editor template's <Coords>, which is not an answer), so leaving it to be
    // guessed is what stranded fast-travelled vehicles on the wrong square.
    function setVehiclePos(key, mapId, x, y, worldX, worldY) {
        if (window.VehiclePosition) window.VehiclePosition.set(key, mapId, x, y, worldX, worldY);
    }
    function vehPosMap(key) { return window.VehiclePosition ? window.VehiclePosition.mapId(key) : 0; }
    function vehPosX(key)   { return window.VehiclePosition ? window.VehiclePosition.x(key) : 0; }
    function vehPosY(key)   { return window.VehiclePosition ? window.VehiclePosition.y(key) : 0; }
    // Where stepping out of a vehicle's interior leaves the player: the spot they
    // got in at, or the vehicle's own tile when it has been moved since.
    function vehExit(key) {
        if (window.VehiclePosition && window.VehiclePosition.exit) {
            return window.VehiclePosition.exit(key);
        }
        return { mapId: vehPosMap(key), x: vehPosX(key), y: vehPosY(key) };
    }

    function getCurrentFuel() {
        if (window.VehicleSystemRefuel) return window.VehicleSystemRefuel.getCurrentFuel();
        return window.VehicleFuel ? window.VehicleFuel.get('camper') : 0;
    }
    function getCurrentCarFuel() {
        if (window.VehicleSystemRefuel) return window.VehicleSystemRefuel.getCurrentCarFuel();
        return window.VehicleFuel ? window.VehicleFuel.get('car') : 0;
    }
    function setCurrentFuel(amount) {
        if (window.VehicleSystemRefuel) {
            window.VehicleSystemRefuel.setCurrentFuel(amount);
        } else if (window.VehicleFuel) {
            window.VehicleFuel.set('camper', amount);
        }
    }
    function setCurrentCarFuel(amount) {
        if (window.VehicleSystemRefuel) {
            window.VehicleSystemRefuel.setCurrentCarFuel(amount);
        } else if (window.VehicleFuel) {
            window.VehicleFuel.set('car', amount);
        }
    }


    // Fuel liters this vehicle currently holds, picked by transport type.
    function currentFuelForTransport(transportType) {
        return transportType === 'carsharing' ? getCurrentCarFuel() : getCurrentFuel();
    }

    function calculateFuelCost(destination, transportType) {
        if (transportType !== 'carsharing' && transportType !== 'camper') return 0;

        const playerX = $gameVariables.value(playerXVar);
        const playerY = $gameVariables.value(playerYVar);
        const worldDest = getWorldPosition(destination);
        const distance = calculateDistance(playerX, playerY, worldDest.x, worldDest.y);
        return calculateTravelCostFromDistance(distance, transportType);
    }

    function calculateTravelTime(destination, transportType) {
        const playerX = $gameVariables.value(playerXVar);
        const playerY = $gameVariables.value(playerYVar);
        const worldDest = getWorldPosition(destination);
        const distance = calculateDistance(playerX, playerY, worldDest.x, worldDest.y);
        const speedMultiplier = speedMultipliers[transportType] || 1.0;

        const travelTime = Math.min(Math.floor((distance * baseTimePerTile) / speedMultiplier), maxTravelTime);
        return Math.max(travelTime, 3);
    }


    function initializeDestinationCache() {
        if (cacheInitialized && destinationCache !== null) {
            return destinationCache;
        }

        const destinations = [];

        // Build destinations directly from TRANSPORT_DESTINATIONS
        for (const [destinationName, transportData] of Object.entries(TRANSPORT_DESTINATIONS)) {
            // The place itself sits on the world map at its "base" tile; the
            // transport entries are arrival overrides on top of it. Only fall
            // back to an override when an entry carries no base at all.
            const firstTransport = TRANSPORT_KEYS.find(key => transportData[key]);
            const defaultLocation = transportData.base
                ? { mapId: 315, x: transportData.base.x, y: transportData.base.y }
                : (firstTransport ? transportData[firstTransport] : { mapId: 0, x: 0, y: 0 });

            destinations.push({
                name: destinationName,
                fullName: 'Teleport - ' + destinationName,  // i18n-ignore  event name prefix
                // What kind of place it is, straight off the entry: "city" for a
                // town spanning four or more world-map tiles, "village" for a
                // smaller one, "dungeon" for a delve nobody lives in,
                // "gasStation" for a stop on the road.
                type: transportData.type || 'village',   // i18n-ignore  Destinations.json id
                mapId: defaultLocation.mapId,
                x: defaultLocation.x,
                y: defaultLocation.y,
                eventId: 0, // No event ID needed for hardcoded destinations
                transportOverrides: transportData
            });
        }

        // Towns the party founded themselves (Crafting/FurnitureSystem.js).
        // They belong to the world folder rather than to Destinations.json, so
        // they are appended here: a pin of their own on the same sheet, sitting
        // on the world square the charter was signed on. Only Earth ones: a
        // town on another planet has no square of this map to stand on.
        const TF = window.TownFounding;
        if (TF && TF.list) {
            for (const town of TF.list()) {
                if (town.planet) continue;
                if (destinations.some(d => d.name === town.name)) continue;
                destinations.push({
                    name: town.name,
                    fullName: 'Teleport - ' + town.name,  // i18n-ignore  event name prefix
                    type: 'village',   // i18n-ignore  Destinations.json id
                    mapId: 315,
                    x: town.worldX,
                    y: town.worldY,
                    eventId: 0,
                    founded: true,
                    transportOverrides: { base: { x: town.worldX, y: town.worldY } }
                });
            }
        }

        destinationCache = destinations;
        cacheInitialized = true;
        return destinations;
    }

    function refreshDestinationCache() {
        cacheInitialized = false;
        destinationCache = null;
        return initializeDestinationCache();
    }

    function getTeleportDestinations() {
        return initializeDestinationCache();
    }

    // ── Places of the party's own ───────────────────────────────────────────
    //
    // A vehicle needs no station: it can be pointed at any square of the world
    // map. So the picker opened from the camper or the car offers a coordinate
    // of the party's own choosing, written down with a name (the nation and the
    // ground standing there, by default) and kept in THIS savegame alone. From
    // then on the square is a pin of its own colour, offered to a vehicle and to
    // nothing else, because nothing else stops in open country.
    const CUSTOM_ADD_KEY = '__customAdd__';   // i18n-ignore  internal row id
    const CUSTOM_KEY_PREFIX = 'custom:';      // i18n-ignore  internal id prefix
    const CUSTOM_COORD_MIN = 1;
    const CUSTOM_COORD_MAX = 256;
    // The world map's own bounds. A square outside them is not a place.
    const WORLD_TILE_MAX = 255;

    function customTravelPoints() {
        if (!$gameSystem) return [];
        if (!Array.isArray($gameSystem._customTravelPoints)) $gameSystem._customTravelPoints = [];
        return $gameSystem._customTravelPoints;
    }

    function isVehicleTravel(transportType) {
        return transportType === 'camper' || transportType === 'carsharing';
    }

    // Every world square a Destinations.json entry already claims: its own base
    // tile and every tile it reserves. A place already stands there, with a name
    // and a door of its own, so nothing of the party's may be written over it.
    let _reservedSquares = null;
    function reservedSquares() {
        if (_reservedSquares) return _reservedSquares;
        const set = new Set();
        for (const entry of Object.values(TRANSPORT_DESTINATIONS)) {
            if (!entry) continue;
            if (entry.base && typeof entry.base.x === 'number') {
                set.add(entry.base.x + ',' + entry.base.y);   // i18n-ignore  coordinate key
            }
            const tiles = entry.reservedTiles ||
                (entry.transportOverrides && entry.transportOverrides.reservedTiles);
            if (Array.isArray(tiles)) tiles.forEach(t => set.add(String(t).replace(/\s+/g, '')));
        }
        _reservedSquares = set;
        return set;
    }

    // The ground on a world square, read off the biome snapshot rather than the
    // live tile column: the picker is open on some other map entirely.
    function worldBiomeAt(x, y) {
        try {
            if ($gameSystem && $gameSystem.getBiomeFromCache) return $gameSystem.getBiomeFromCache(x, y);
        } catch (e) { /* no snapshot loaded */ }
        return null;
    }

    function hasRiverAt(x, y) {
        const pg = $gameSystem && $gameSystem._procGenData;
        const rivers = pg && pg.riverCoordMap;
        return !!(rivers && rivers[x + ',' + y]);   // i18n-ignore  coordinate key
    }

    // Why a square cannot be written down, or null when it can. A mountain
    // cannot be driven up, water cannot be driven across, a river cuts the
    // square in two, and a named place is already there.
    function customPointRefusal(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return 'range';
        if (x < 0 || y < 0 || x > WORLD_TILE_MAX || y > WORLD_TILE_MAX) return 'range';
        if (reservedSquares().has(x + ',' + y)) return 'reserved';   // i18n-ignore  coordinate key
        if (customTravelPoints().some(p => p.x === x && p.y === y)) return 'duplicate';
        if (hasRiverAt(x, y)) return 'river';
        const biome = String(worldBiomeAt(x, y) || '');
        if (/^(ocean|sea|water|lake|river)/i.test(biome)) return 'water';
        if (/^mountain/i.test(biome)) return 'mountain';
        return null;
    }

    // The nation painted on a world square (map 315's region plane, cached in
    // BiomesMap.json), or null on unclaimed ground.
    function nationNameAt(x, y) {
        const country = ($gameSystem && $gameSystem.getCountryFromWorldCoordinates)
            ? $gameSystem.getCountryFromWorldCoordinates(x, y) : null;
        return (country && country.name) ? country.name : null;
    }

    function biomeLabelAt(x, y) {
        const biome = worldBiomeAt(x, y);
        if (!biome) return null;
        return (window.BiomeNames && window.BiomeNames.display)
            ? window.BiomeNames.display(biome) : biome;
    }

    // "Austria - Fields (34, 56)": what a square is called until the party calls
    // it something else.
    function defaultCustomName(x, y) {
        return T('FastTravel.custom.defaultName', {
            nation: nationNameAt(x, y) || T('FastTravel.custom.unclaimed'),
            biome: biomeLabelAt(x, y) || T('FastTravel.custom.unknownBiome'),
            x: x, y: y,
        });
    }

    // A written-down square, dressed as a destination: its world tile is its
    // `base`, so distance, fuel and the arrival all work out exactly as they do
    // for a town, and a vehicle is set down on the square itself.
    function customDestination(point) {
        return {
            name: CUSTOM_KEY_PREFIX + point.x + ',' + point.y,   // i18n-ignore  internal id
            customName: point.name,
            custom: true,
            type: 'custom',   // i18n-ignore  pin shape class
            mapId: 315,
            x: point.x,
            y: point.y,
            image: {
                x: String(Math.round(point.x * MAP_SCALE_X + MAP_OFFSET_X)),
                y: String(Math.round(point.y * MAP_SCALE_Y + MAP_OFFSET_Y)),
            },
            transportOverrides: { base: { x: point.x, y: point.y } },
        };
    }

    function customDestinations() {
        return customTravelPoints().map(customDestination);
    }

    // Every arrival carries the town's WORLD square alongside the tile it lands
    // on. A transport override points at an interior map (a platform, a helipad)
    // whose local coordinates say nothing about where in the world the party now
    // is, and writing those into the world-coordinate variables is what used to
    // leave "return to the world map" pointing at a tile picked out of a station
    // floor plan.
    function withWorldPosition(destination, dest) {
        const world = getWorldPosition(destination);
        dest.worldX = world.x;
        dest.worldY = world.y;
        return dest;
    }

    // ── Which places a transport actually serves ────────────────────────────
    //
    // A bus is not a train. A train needs a platform and a helicopter needs a
    // pad, so both list only the entries that declare one of their own. The bus
    // serves every TOWN, because every town has somewhere to stand and wait: the
    // city generator guarantees a BusStop on every procedural city and burg it
    // builds (ProceduralMapStructureGenerator.cityBusStops), so a procedural
    // town is reachable whether or not anybody ever wrote a "bus" block for it,
    // and the bus puts the party down at that shelter rather than on the world
    // map outside it.
    //
    // A NON-procedural town is a hand-made map with no generated shelter
    // anywhere in it, and nothing can invent a bus bay in an authored map. Such
    // a town is listed only where its entry names the bay the bus pulls into,
    // and the journey ends there exactly as it always did.
    const PROC_TOWN_TYPES = ['city', 'village'];   // i18n-ignore  Destinations.json ids

    function isProceduralTown(dest) {
        const o = dest && dest.transportOverrides;
        if (!o || o.procedural !== true) return false;
        return PROC_TOWN_TYPES.includes(String(dest.type || '').toLowerCase());
    }

    function servesTransport(dest, transportType) {
        const o = dest && dest.transportOverrides;
        if (!o) return false;
        if (o[transportType]) return true;
        return transportType === 'bus' && isProceduralTown(dest);
    }

    // The door of a hardcoded, named place: a Destinations.json entry that
    // carries `reservedTiles` (its old js/db/WorldGen/HardcodedBiomeNames.json
    // world-map footprint, now folded straight into the entry) AND its own
    // `entrance` {id, x, y, direction}. A transport with nowhere more specific
    // of its own to arrive at would otherwise leave the traveller standing on
    // the open world tile the town's `base` pin only approximates; stepping
    // through the door it actually names reads far better, so this is checked
    // ahead of that fallback in getActualDestination.
    function entranceFor(destination) {
        const o = destination && destination.transportOverrides;
        const tiles = o && o.reservedTiles;
        const entrance = o && o.entrance;
        if (!entrance || !Array.isArray(tiles) || !tiles.length) return null;
        if (!entrance.id || !$dataMapInfos[entrance.id]) return null;
        return entrance;
    }

    // Where a character being CREATED actually lands, given the arrival the
    // ordinary rules worked out. Anything that is not the world map is already
    // a place to stand and is taken as it is. The world map is not: the party is
    // put on the ground of the square instead, either through the place's own
    // door or, where it has none, on the procedural square itself , which is
    // exactly what walking onto that square from the map would give them.
    //
    // Answers null when neither is possible, leaving the caller to fall back.
    function ccCreationLanding(destination, actualDest) {
        if (!actualDest || actualDest.mapId !== 315) return actualDest;

        const entrance = entranceFor(destination);
        if (entrance) {
            return { mapId: entrance.id, x: entrance.x, y: entrance.y, direction: entrance.direction };
        }

        const built = $gameSystem && $gameSystem.generateOriginBiomeMap
            ? $gameSystem.generateOriginBiomeMap({ worldX: actualDest.x, worldY: actualDest.y })
            : null;
        if (!built) return null;
        // The two "the procedural map is live" flags (see WorldMapReturn's
        // startProcGen); without them the square loads with no borders out of it.
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        // The centre is only where the party is aimed: which tile they are set
        // down on is settled once the terrain exists, by CharacterCreation's
        // map-load hook, so nobody begins the game inside a boulder.
        $gameTemp._ccProcSquareLanding = true;
        return { mapId: 636, x: 32, y: 32, direction: 2 };
    }

    // The world square a character-creation arrival begins the game on, written
    // down once as this savegame's start anchor. It is a fact about the party
    // that nothing afterwards may move - not walking, not fast travel, not the
    // respawn point the wait menu sets - so an anchor that is already there
    // (every origin that knew its own square wrote one in the origin step) is
    // left exactly as it is.
    function ccAnchorStart(actualDest) {
        const BSEH = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
        if (!BSEH || typeof BSEH.setStartAnchor !== 'function') return;
        if ($gameSystem && $gameSystem._bseStartAnchor) return;
        const world = destWorld(actualDest);
        if (!world || (!world.x && !world.y)) return;
        BSEH.setStartAnchor(world.x, world.y);
    }

    function getActualDestination(destination, transportType) {
        // One arrival, whatever was picked and whatever it was picked on: the
        // stations, the stops and the helipads were all on the ground.
        if (earthLost()) {
            const t = window.WorldMapTransfer.towerLanding();
            return { mapId: t.mapId, x: t.x, y: t.y, name: destination.name };
        }
        const overrides = destination.transportOverrides || {};
        const base = overrides['base'];

        // Vehicles always arrive on the world map, on the town's own tile.
        if (transportType === 'camper' || transportType === 'carsharing') {
            if (base) return withWorldPosition(destination, { mapId: 315, x: base.x, y: base.y, name: destination.name });
        }

        // A transport with its own station/stop/pad in the entry arrives there.
        if (TRANSPORT_KEYS.includes(transportType) && overrides[transportType]) {
            const override = overrides[transportType];
            return withWorldPosition(destination, { mapId: override.mapId, x: override.x, y: override.y, name: destination.name });
        }

        // A named place with a door of its own is walked through it, rather
        // than left standing on the open world tile.
        const entrance = entranceFor(destination);
        if (entrance) {
            return withWorldPosition(destination, {
                mapId: entrance.id, x: entrance.x, y: entrance.y, direction: entrance.direction,
                name: destination.name
            });
        }

        // Everything else arrives on the world map at the town's base tile.
        if (base) return withWorldPosition(destination, { mapId: 315, x: base.x, y: base.y, name: destination.name });

        // Default destination
        return withWorldPosition(destination, { mapId: destination.mapId, x: destination.x, y: destination.y + 1, name: destination.name });
    }

    // The world square an arrival lands on, for the world-coordinate variables and
    // for a vehicle parked there: the destination's own square, falling back to
    // the arrival tile when the trip is to the world map itself.
    function destWorld(dest) {
        if (!dest) return { x: 0, y: 0 };
        if (typeof dest.worldX === 'number' && typeof dest.worldY === 'number') {
            return { x: dest.worldX, y: dest.worldY };
        }
        if (dest.mapId === 315) return { x: dest.x, y: dest.y };
        return { x: $gameVariables.value(playerXVar), y: $gameVariables.value(playerYVar) };
    }

    // Move the party's world square to where an arrival really is.
    function setPlayerWorldFromDest(dest) {
        const world = destWorld(dest);
        if (window.WorldMapTransfer) {
            window.WorldMapTransfer.setPlayerWorld(world.x, world.y);
            return;
        }
        $gameVariables.setValue(playerXVar, world.x);
        $gameVariables.setValue(playerYVar, world.y);
    }

    // World-map (map 315) tile of a destination. Distance, cost and travel time
    // are always measured here: a transport override points at an interior map
    // (a platform, a helipad) whose local coordinates say nothing about how far
    // the place is.
    function getWorldPosition(destination) {
        const base = destination.transportOverrides && destination.transportOverrides['base'];
        // Off Earth there is no world tile to measure to and nothing to measure
        // from: the party's own square is returned, so the distance is zero and
        // with it the fare, the fuel and the hours (see calculateTravelCost).
        if (earthLost()) {
            return { x: $gameVariables.value(playerXVar), y: $gameVariables.value(playerYVar) };
        }
        if (base) return { x: base.x, y: base.y };
        return { x: destination.x, y: destination.y };
    }

    function calculateTravelCost(destination, transportType) {
        if (transportType === 'carsharing' || transportType === 'camper') {
            return calculateFuelCost(destination, transportType);
        }

        const playerX = $gameVariables.value(playerXVar);
        const playerY = $gameVariables.value(playerYVar);
        const worldDest = getWorldPosition(destination);
        const distance = calculateDistance(playerX, playerY, worldDest.x, worldDest.y);
        const multiplier = transportMultipliers[transportType] || 1.0;
        return Math.floor(distance * baseDistancePrice * multiplier);
    }

    function calculateTravelCostFromDistance(distance, transportType) {
        if (transportType === 'carsharing' || transportType === 'camper') {
            return distance * fuelConsumptionRate;
        }

        const multiplier = transportMultipliers[transportType] || 1.0;
        return Math.floor(distance * baseDistancePrice * multiplier);
    }

    // ---- Who is allowed on board -------------------------------------------
    // A ticket is a written record with the party's name on it, checked at a
    // counter by somebody whose job includes noticing. A wanted party walks,
    // rides, drives or flies itself; it does not queue for a boarding pass.
    // Everything not listed here is private transport and never asks.
    const TICKETED_TRANSPORT = new Set([
        'bus', 'train', 'ferry', 'cruise', 'zeppelin',
        'airplane_economy', 'airplane_business',
        'hypermetro', 'maglev', 'hyperloop',
    ]);

    function isTicketedTransport(transportType) {
        return TICKETED_TRANSPORT.has(String(transportType || ''));
    }

    // Null when the party may board, otherwise the reason they may not.
    function boardingRefusal(transportType) {
        if ($gameTemp && $gameTemp._characterCreationTravelMode) return null;
        if (!isTicketedTransport(transportType)) return null;
        const c = window.CrimeSystem;
        if (c && typeof c.refusesRegisteredService === 'function' && c.refusesRegisteredService()) {
            return 'wanted';
        }
        return null;
    }

    function canAffordTravel(destination, transportType) {
        if ($gameTemp && $gameTemp._characterCreationTravelMode) {
            return true;
        }
        if (transportType === 'carsharing' || transportType === 'camper') {
            const fuelNeeded = calculateFuelCost(destination, transportType);
            return currentFuelForTransport(transportType) >= fuelNeeded;
        }

        const cost = calculateTravelCost(destination, transportType);
        return $gameParty.gold() >= cost;
    }

    function executeTravel(destination, cost) {
        const data = getFastTravelData();

        if ($gameTemp && $gameTemp._characterCreationTravelMode) {
            $gameTemp._characterCreationTravelMode = false;
            // One journey per confirmation. The button can be clicked and the OK
            // key read in the same handful of frames the overlay takes to fade
            // out, and a second pass through here no longer reads as creation
            // (the flag above is already down), so it would fall through to the
            // paying traveller's path and start a timed trip the party is not on.
            if (data.ccLandingPending) return;
            data.ccLandingPending = true;
            // The party is on its way: the origin is settled and the copy kept
            // to undo it is not needed any more.
            if (window.CharacterCreationOrigin && window.CharacterCreationOrigin.clearSnapshot) {
                window.CharacterCreationOrigin.clearSnapshot();
            }
            $gamePlayer.setMovementLock(true);
            $gameScreen.startFadeOut(24);
            const actualDest = getActualDestination(destination, data.selectedTransport);
            setTimeout(() => {
              try {
                // A character being created is never put down ON the world map:
                // it is what a journey is looked at on, not a place to begin
                // standing in. A picked place that has a door of its own is
                // walked through it; one that has not is begun on the ground of
                // its own square, the way walking onto that square from the map
                // would put the party there. See ccCreationLanding below.
                const landing = ccCreationLanding(destination, actualDest);
                if (!landing) {
                    // Its square could not be built and it has no door: the plain
                    // arrival is all that is left, world map or not.
                    $gamePlayer.reserveTransfer(actualDest.mapId, actualDest.x, actualDest.y, actualDest.direction || 2, 0);
                    setPlayerWorldFromDest(actualDest);
                    $gameVariables.setValue(45, actualDest.mapId);
                } else {
                    $gamePlayer.reserveTransfer(landing.mapId, landing.x, landing.y, landing.direction || 2, 0);
                    setPlayerWorldFromDest(actualDest);
                    $gameVariables.setValue(45, landing.mapId);
                }
                // The picker origins (train, mayor, warlord, the factions, and
                // everything else that ends in "say where you begin") do not
                // know their own starting square until this moment, so this is
                // where they write it down: the square the place they picked
                // stands on becomes the anchor the "Distance from spawn"
                // encounter mode measures their whole world from
                // (BattleSystemEnhancedEncounters, getStartAnchor). Every other
                // origin anchors itself in CharacterCreation's own origin step.
                ccAnchorStart(actualDest);
                clearFastTravelData();
              } catch (e) {
                // Whatever went wrong, the one thing that must not happen is the
                // party being left standing on the creation map, which is an
                // empty black room with no way out of it. The plain arrival is
                // always somewhere, so it is what a failure falls back to.
                console.error("FastTravel: the character-creation landing failed; the party was put down at the plain arrival instead.", e);
                try {
                    $gamePlayer.reserveTransfer(actualDest.mapId, actualDest.x, actualDest.y, actualDest.direction || 2, 0);
                } catch (e2) {
                    console.error("FastTravel: and the plain arrival could not be reserved either.", e2);
                }
              }
              $gameScreen.startFadeIn(24);
              $gamePlayer.setMovementLock(false);
            }, 500);
            SceneManager._scene.closeTravelUIOverlay(true);
            return;
        }

        $gameSwitches.setValue(55, true);

        if (data.selectedTransport === 'camper') {
            const currentFuel = getCurrentFuel();
            setCurrentFuel(currentFuel - cost);
            const actualDest = getActualDestination(destination, data.selectedTransport);
            setVehiclePos('camper', 315, actualDest.x, actualDest.y, actualDest.x, actualDest.y);

        }
        else if (data.selectedTransport === 'carsharing') {
            const currentFuel = getCurrentCarFuel();
            setCurrentCarFuel(currentFuel - cost);
            const actualDest = getActualDestination(destination, data.selectedTransport);
            setVehiclePos('car', 315, actualDest.x, actualDest.y, actualDest.x, actualDest.y);

        } else {
            $gameParty.loseGold(cost);
        }

        SceneManager._scene.closeFastTravelWindow();
        data.finalDestination = getActualDestination(destination, data.selectedTransport);
        data.originalMap = { mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y };

        // A procedural place has no map to walk into, so the arrival worked out
        // above is the world square it stands on. The journey does not end
        // there: the transport that carried the party is remembered on the
        // arrival, and the square is built and stepped into when they get there
        // (arrivalLanding). Marked only on the real travel path - the character
        // creation and vehicle paths above all return before this line.
        if (landsOnProcSquare(destination, data.finalDestination, data.selectedTransport)) {
            data.finalDestination.procTown = data.selectedTransport;
        }

        // The bus's own second leg, kept as the backstop for the one case the
        // descent above cannot cover: a square the biome snapshot refuses to
        // build, where the coach really does put the party down on the world
        // map. It is taken on the next map load, and arrivalLanding cancels it
        // whenever the direct descent worked.
        $gameSystem._busTownArrival =
            (data.selectedTransport === 'bus' && isProceduralTown(destination))
                ? { name: destination.name,
                    x: data.finalDestination.x, y: data.finalDestination.y }
                : null;

        // Always use stored player coordinates from variables for distance calculation
        const playerX = $gameVariables.value(playerXVar);
        const playerY = $gameVariables.value(playerYVar);
        const worldDest = getWorldPosition(destination);
        const distance = calculateDistance(playerX, playerY, worldDest.x, worldDest.y);
        data.totalDistanceKm = Math.round(distance * 1);

        const travelTime = calculateTravelTime(destination, data.selectedTransport);
        data.travelStartTime = Date.now();
        data.travelCompleted = false;

        if (data.selectedTransport === 'carsharing' || data.selectedTransport === 'camper') {
            data.currentTravelMapId = $gameMap.mapId();
            $gamePlayer.setMovementLock(false);
        } else {
            const travelMap = travelMaps[data.selectedTransport];
            if (travelMap && travelMap.mapId > 0 && $dataMapInfos[travelMap.mapId]) {
                data.currentTravelMapId = travelMap.mapId;
                $gamePlayer.reserveTransfer(travelMap.mapId, travelMap.x, travelMap.y, 2, 0);
                $gamePlayer.setMovementLock(false);
            } else {
                console.warn(`FastTravel: Travel map for ${data.selectedTransport} not found. Using direct travel.`);
                executeDirectTravel();
                return;
            }
        }

        // Start the persistent timer
        $gameSystem.startTravelTimer(travelTime, data.selectedTransport, destination.name, data.totalDistanceKm);
    }
    function completeTravelToDestination() {
        const data = getFastTravelData();
        if (!data.finalDestination) {
            console.error("FastTravel: No final destination stored!");
            return;
        }

        // Check for specific map teleport overrides
        // Teleport immediately to original destination. A procedural place is
        // arrived INSIDE, on the square built from its own base coordinates,
        // rather than on the world map above it.
        const arrival = arrivalLanding(data.finalDestination);
        $gamePlayer.reserveTransfer(
            arrival.mapId,
            arrival.x,
            arrival.y,
            arrival.direction || 2, 0
        );

        setPlayerWorldFromDest(arrival);
        $gameVariables.setValue(45, arrival.mapId);
        clearFastTravelData();
    }
    function completeTravelCamper() {
        const data = getFastTravelData();

        // If no fast travel was selected, teleport to ship location
        if (!data.finalDestination) {

            // Step back out to where the camper was boarded / entered from.
            const spot = vehExit('camper');
            $gamePlayer.reserveTransfer(spot.mapId, spot.x, spot.y, 2, 0);
            return;
        }

        // If timer is in progress, do nothing
        if (data.timerActive && data.timerRemainingTime > 0) {
            return;
        }

        // If timer has started and ended, ask how they want to get out
        if (data.timerActive && data.timerRemainingTime <= 0) {
            offerArrival('camper', data.finalDestination);
        }

    }

    function completeTravelCar() {
        const data = getFastTravelData();

        // If no fast travel was selected, teleport to ship location
        if (!data.finalDestination) {

            // Step back out to where the car was boarded / entered from.
            const spot = vehExit('car');
            $gamePlayer.reserveTransfer(spot.mapId, spot.x, spot.y, 2, 0);
            return;
        }

        // If timer is in progress, do nothing
        if (data.timerActive && data.timerRemainingTime > 0) {
            return;
        }

        // If timer has started and ended, ask how they want to get out
        if (data.timerActive && data.timerRemainingTime <= 0) {
            offerArrival('car', data.finalDestination);
        }
    }

    function completeTravelAirship() {
        const data = getFastTravelData();

        // If no fast travel was selected, teleport to airship location
        if (!data.finalDestination) {

            // Step back out to where the starship was boarded / entered from.
            const spot = vehExit('airship');
            $gamePlayer.reserveTransfer(spot.mapId, spot.x, spot.y, 2, 0);
            return;
        }

        // If timer is in progress, do nothing
        if (data.timerActive && data.timerRemainingTime > 0) {
            return;
        }

        // If timer has started and ended, ask how they want to get out
        if (data.timerActive && data.timerRemainingTime <= 0) {
            offerArrival('airship', data.finalDestination);
        }
    }

    // -- Getting out where the journey ended ---------------------------------
    //
    // A vehicle arriving somewhere used to put the party straight down on the
    // world map, which is a thing a journey is looked at ON rather than a place
    // to stand. So the end of a drive or a flight asks: walk into the ground
    // that is actually there, or stay up on the map. Either way the vehicle is
    // parked where the party is - on the square itself, or on the world tile -
    // and its world coordinates are written down, so it is drawn both inside the
    // procedural square and on the world map above it.
    //
    // The engine slot each vehicle key is physically drawn in.
    const ARRIVAL_ENGINE_SLOT = { camper: 'ship', car: 'boat', airship: 'airship' };   // i18n-ignore  engine slot ids

    // The plain arrival: the world map, exactly where the journey was booked to.
    function landOnWorldMap(key, dest) {
        $gamePlayer.reserveTransfer(dest.mapId, dest.x, dest.y, dest.direction || 2, 0);
        // The shared engine slot must stand for the car before it is moved, so
        // the move is recorded against the car rather than the bike or the boat.
        if (key === 'car') $gameSystem._boatType = 'car';
        const vehicle = $gameMap.vehicle(ARRIVAL_ENGINE_SLOT[key]);
        if (vehicle) vehicle.setLocation(dest.mapId, dest.x, dest.y + 1);

        const world = destWorld(dest);
        setVehiclePos(key, dest.mapId, dest.x, dest.y + 1, world.x, world.y);
        setPlayerWorldFromDest(dest);
        $gameVariables.setValue(45, dest.mapId);
        clearFastTravelData();
    }

    // Walking into the ground the journey ended on: the square is built from the
    // biome snapshot and the party is set down inside it, with the vehicle
    // parked beside them. Answers false when the square cannot be built, leaving
    // the plain world-map arrival as the only way out.
    function landInsideSquare(key, dest) {
        if (!$gameSystem || !$gameSystem.generateOriginBiomeMap) return false;
        const world = destWorld(dest);
        const built = $gameSystem.generateOriginBiomeMap({ worldX: world.x, worldY: world.y });
        if (!built) return false;
        // The two "the procedural map is live" flags (see WorldMapReturn's
        // startProcGen); without them the square loads with no borders out of it.
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        const tile = procSquareCentre();
        bookProcLandingFixup();
        // Which tile of the square anybody stands on is only settled once the
        // houses and the prefabs are stamped onto it, so the vehicle is dropped
        // by the same map-load pass that settles the party (dropVehicleBeside).
        if ($gameTemp) $gameTemp._ftVehicleDrop = key;
        if (key === 'car') $gameSystem._boatType = 'car';
        setVehiclePos(key, PROC_MAP_ID_FT, tile.x, tile.y, world.x, world.y);
        $gamePlayer.reserveTransfer(PROC_MAP_ID_FT, tile.x, tile.y, 2, 0);
        if (window.WorldMapTransfer) window.WorldMapTransfer.setPlayerWorld(world.x, world.y);
        $gameVariables.setValue(45, PROC_MAP_ID_FT);
        clearFastTravelData();
        return true;
    }

    // Park the arriving vehicle on a tile the party can walk off, next to where
    // they ended up standing, and put it on the map at once.
    function dropVehicleBeside(key) {
        const world = {
            x: $gameVariables.value(playerXVar),
            y: $gameVariables.value(playerYVar),
        };
        const passable = (x, y) =>
            x >= 0 && y >= 0 && x < $gameMap.width() && y < $gameMap.height() &&
            $gameMap.checkPassage(x, y, 0x0f) && $gameMap.eventsXy(x, y).length === 0;
        let spot = { x: $gamePlayer.x, y: $gamePlayer.y };
        const around = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        for (const [dx, dy] of around) {
            const x = $gamePlayer.x + dx;
            const y = $gamePlayer.y + dy;
            if (passable(x, y)) { spot = { x: x, y: y }; break; }
        }
        setVehiclePos(key, $gameMap.mapId(), spot.x, spot.y, world.x, world.y);
        const manager = window.MergedVehicleSystem && window.MergedVehicleSystem.manager;
        if (manager && manager.reconcileToStore) manager.reconcileToStore();
    }

    // The question itself, asked as its own small overlay so a pad answers it
    // the same way it answers the picker.
    let _arrivalOverlayEl = null;

    function offerArrival(key, dest) {
        if (!dest) return;
        if (_arrivalOverlayEl) return;
        const world = destWorld(dest);
        const biome = biomeLabelAt(world.x, world.y) || T('FastTravel.custom.unknownBiome');

        const overlay = document.createElement('div');
        overlay.id = 'travel-arrival-overlay';
        overlay.innerHTML = `
            <div class="ui-panel travel-arrival-box">
                <div class="page-header-bar">
                    <h2 class="title">${T('FastTravel.arrival.title')}</h2>
                </div>
                <div class="travel-arrival-place">${dest.name ? destLabel(dest.name) : biome}</div>
                <div class="inspect-actions travel-arrival-options">
                    <div class="inspect-btn focusable travel-arrival-option selected" data-answer="visit"
                         onclick="SceneManager._scene.answerTravelArrival('visit')">${T('FastTravel.arrival.visit', { biome: biome })}</div>
                    <div class="inspect-btn inspect-btn--secondary focusable travel-arrival-option" data-answer="world"
                         onclick="SceneManager._scene.answerTravelArrival('world')">${T('FastTravel.arrival.worldMap')}</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        _arrivalOverlayEl = overlay;
        _arrivalAnswerIndex = 0;
        _arrivalPending = { key: key, dest: dest };
        $gamePlayer.setMovementLock(true);
    }

    let _arrivalAnswerIndex = 0;
    let _arrivalPending = null;

    function closeArrivalOverlay() {
        if (_arrivalOverlayEl && _arrivalOverlayEl.parentNode) {
            _arrivalOverlayEl.parentNode.removeChild(_arrivalOverlayEl);
        }
        _arrivalOverlayEl = null;
        _arrivalPending = null;
        $gamePlayer.setMovementLock(false);
    }

    Scene_Map.prototype.answerTravelArrival = function (answer) {
        const pending = _arrivalPending;
        if (!pending) return;
        SoundManager.playOk();
        closeArrivalOverlay();
        if (answer === 'visit' && landInsideSquare(pending.key, pending.dest)) return;
        landOnWorldMap(pending.key, pending.dest);
    };

    // The overlay's own buttons, driven by the pad: left/right and up/down move
    // between the two answers, OK takes the one under the cursor. There is no
    // cancel: the journey is over and the party is getting out somewhere.
    function updateArrivalInput() {
        if (!_arrivalOverlayEl) return false;
        const options = Array.from(document.querySelectorAll('.travel-arrival-option'));
        if (options.length === 0) return true;
        const move = (delta) => {
            _arrivalAnswerIndex = (_arrivalAnswerIndex + delta + options.length) % options.length;
            options.forEach((el, i) => el.classList.toggle('selected', i === _arrivalAnswerIndex));
            SoundManager.playCursor();
        };
        if (Input.isRepeated('right') || Input.isRepeated('down')) { move(1); return true; }
        if (Input.isRepeated('left') || Input.isRepeated('up')) { move(-1); return true; }
        if (Input.isTriggered('ok')) {
            const answer = options[_arrivalAnswerIndex].getAttribute('data-answer');
            Input.clear();
            if (SceneManager._scene && SceneManager._scene.answerTravelArrival) {
                SceneManager._scene.answerTravelArrival(answer);
            }
            return true;
        }
        return true;
    }

    function teleportToAirship() {
        // Teleport to airship's current location
        const airshipMapId = vehPosMap('airship') || 315; // Default to map 315 if not set
        const airshipX = vehPosX('airship') || 0;
        const airshipY = vehPosY('airship') || 0;

        $gamePlayer.reserveTransfer(airshipMapId, airshipX, airshipY, 2, 0);
    }

    function teleportToAirshipAndRide() {
        // Teleport to airship's current location and board it
        const airshipMapId = vehPosMap('airship') || 315; // Default to map 315 if not set
        const airshipX = vehPosX('airship') || 0;
        const airshipY = vehPosY('airship') || 0;

        // Make sure the airship Game_Vehicle actually sits where we transfer to,
        // so boarding on arrival lands the player on it.
        const airshipVehicle = $gameMap.vehicle("airship");
        if (airshipVehicle) airshipVehicle.setLocation(airshipMapId, airshipX, airshipY);

        $gamePlayer.reserveTransfer(airshipMapId, airshipX, airshipY, 2, 0);

        // Wait for transfer to complete, then board the airship
        const interpreter = new Game_Interpreter();
        interpreter.setup([
            { code: 201, indent: 0, parameters: [0, airshipMapId, airshipX, airshipY, 2, 0] }, // Transfer
            { code: 205, indent: 0, parameters: [2] } // Set Vehicle Location (2 = airship)
        ], 0);

        // Board the airship
        setTimeout(() => {
            const airship = $gameMap.vehicle("airship");
            if (airship) {
                $gamePlayer._vehicleType = "airship";
                $gamePlayer._vehicleGettingOn = true;
                $gamePlayer.setThrough(false);
                $gamePlayer.setMoveSpeed(airship.moveSpeed());
            }
        }, 100);
    }

    function executeDirectTravel() {
        const data = getFastTravelData();
        if (!data.finalDestination || !data.finalDestination.mapId) {
            console.error("FastTravel: Cannot execute direct travel - no valid destination!");
            clearFastTravelData();
            return;
        }

        const arrival = arrivalLanding(data.finalDestination);
        $gamePlayer.reserveTransfer(
            arrival.mapId,
            arrival.x,
            arrival.y,
            arrival.direction || 2, 0
        );
        setPlayerWorldFromDest(arrival);
        clearFastTravelData();
    }

    // ── Landing inside a procedural town ────────────────────────────────────
    // A procedural place is a square the world generates rather than a map
    // somebody drew, so a journey to one ends on the ground of that square: at
    // the bus shelter when a coach brought the party, in the middle of it when
    // anything else did, and always on a tile they can stand on.
    const PROC_MAP_ID_FT = 636;

    // Every tile id the tileset draws a bus shelter with, single and grid alike.
    function busStopTileIds(tilesetId) {
        const U = window.ProcGenUtils;
        if (!U || !U.Cache || !tilesetId) return null;
        const all = U.Cache.getTilesetFeatures(tilesetId) || {};
        const ids = new Set();
        for (const v of all["BusStop"] || []) {  // i18n-ignore  Features.json id
            if (v.type === "single" && v.tileId) ids.add(v.tileId);
            else if (v.grid) for (const row of v.grid) for (const t of row) if (t) ids.add(t);
        }
        return ids.size ? ids : null;
    }

    // Where a passenger steps off: an open tile beside the shelter, never inside
    // it. Returns null when the square holds no shelter at all, and the caller
    // then falls back to the middle of the map, which is what walking in does.
    function busStopArrivalTile() {
        const pg = $gameSystem && $gameSystem._procGenData;
        const data = pg && pg.generatedMapData;
        if (!data) return null;
        const U = window.ProcGenUtils;
        const W = (U && U.PROC_MAP_WIDTH) || 64;
        const H = (U && U.PROC_MAP_HEIGHT) || 64;
        const ids = busStopTileIds(pg.currentBiomeTileset);
        if (!ids) return null;

        const layer = W * H;
        const shelters = [];
        for (let z = 1; z <= 3; z++) {
            for (let i = 0; i < layer; i++) {
                if (ids.has(data[z * layer + i])) shelters.push({ x: i % W, y: Math.floor(i / W) });
            }
        }
        if (!shelters.length) return null;

        const open = (x, y) =>
            x > 0 && y > 0 && x < W - 1 && y < H - 1 &&
            data[y * W + x] !== 0 &&
            data[layer + y * W + x] === 0 &&
            data[2 * layer + y * W + x] === 0 &&
            data[3 * layer + y * W + x] === 0;

        // Outward from the shelter a ring at a time, so the party lands as close
        // to it as the street allows.
        for (let r = 1; r <= 4; r++) {
            for (const s of shelters) {
                for (const [dx, dy] of [[0, r], [r, 0], [-r, 0], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
                    if (open(s.x + dx, s.y + dy)) return { x: s.x + dx, y: s.y + dy };
                }
            }
        }
        // A shelter hemmed in on every side the terrain knew about: aimed at it
        // anyway, because getting off the coach beside the stop is the point and
        // the post-load pass (placeOnStandableTile) settles the exact tile once
        // the houses and events are on the square. Only a town with no shelter
        // at all answers null, and the caller then walks in at the middle.
        return shelters[0];
    }

    // The middle of a procedural square: where walking into a town from the
    // world map puts the party, and the arrival for everything that is not a
    // coach pulling into a shelter.
    function procSquareCentre() {
        const U = window.ProcGenUtils;
        return {
            x: Math.floor(((U && U.PROC_MAP_WIDTH) || 64) / 2),
            y: Math.floor(((U && U.PROC_MAP_HEIGHT) || 64) / 2),
        };
    }

    // The tile a journey ends on inside the square, read off the terrain that
    // was just generated: the open ground beside the bus shelter for a coach,
    // the middle of the square for every other way in.
    function procArrivalTile(transportType) {
        return (transportType === 'bus' && busStopArrivalTile()) || procSquareCentre();
    }

    // Book the "put them somewhere they can actually stand" pass below. The
    // tiles read out of the generator are the terrain as it left them; the
    // houses, the prefabs and the events are stamped onto the square during the
    // map load that follows, so whether a tile can be stood on is only settled
    // once that load is done.
    function bookProcLandingFixup() {
        if ($gameTemp) $gameTemp._ftProcLanding = true;
    }

    // ── Arriving inside a procedural town, without the world map ────────────
    //
    // A procedural place has no authored map to walk into: no `entrance`, only
    // the world square it stands on. Journeys to one used to END on that square
    // - map 315, the thing a journey is looked at ON rather than a place to be
    // put down in - and the party then walked in themselves. Only the bus went
    // further, and only on the map load after the arrival.
    //
    // Now every such journey goes straight in. The square is built from the
    // entry's own `base` coordinates through generateOriginBiomeMap, which reads
    // the biome snapshot rather than the live map-315 tile column and so does
    // not need the party standing there, the world coordinate vars are moved
    // onto it, and the arrival lands on the ground of the town itself.
    function isProceduralDest(destination) {
        const o = destination && destination.transportOverrides;
        return !!(o && o.procedural === true);
    }

    // Transports the party arrives WITH a vehicle on: the vehicle lives on the
    // world map and cannot follow anybody down into a square, so these keep the
    // old world-map arrival and park it there. (See the vehicle completions,
    // which set the camper, car and airship down on the arrival tile.)
    const VEHICLE_TRANSPORTS = ['camper', 'carsharing', 'bicycle'];

    // Does an arrival worked out by getActualDestination end on the open world
    // map at a procedural place's own square?
    function landsOnProcSquare(destination, dest, transportType) {
        if (!dest || dest.mapId !== 315) return false;
        if (earthLost()) return false;
        if (VEHICLE_TRANSPORTS.includes(transportType)) return false;
        return isProceduralDest(destination);
    }

    // Build the square and answer the arrival inside it, or null when it cannot
    // be built (a coordinate the biome snapshot has nothing for, or one it calls
    // water), leaving the caller with the plain world-map arrival it started
    // from.
    function proceduralTownLanding(dest) {
        if (!$gameSystem || !$gameSystem.generateOriginBiomeMap) return null;
        const world = destWorld(dest);
        const built = $gameSystem.generateOriginBiomeMap({ worldX: world.x, worldY: world.y });
        if (!built) return null;
        // The two "the procedural map is live" flags (see WorldMapReturn's
        // startProcGen); without them the square loads with no borders out of it.
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        const tile = procArrivalTile(dest.procTown);
        bookProcLandingFixup();
        return {
            mapId: PROC_MAP_ID_FT, x: tile.x, y: tile.y, direction: 2,
            worldX: world.x, worldY: world.y, name: dest.name,
        };
    }

    // Where a stored arrival really puts the party: inside the town when the
    // trip ends at a procedural square, the stored arrival itself otherwise.
    function arrivalLanding(dest) {
        if (!dest || !dest.procTown) return dest;
        // Riding something at the moment of arrival (a boat, the bike) means the
        // party lands on the world map with it, whatever they booked: a vehicle
        // cannot be taken down into a square, and stepping off one that is not
        // there strands them.
        if ($gamePlayer.isInVehicle()) return dest;
        const landing = proceduralTownLanding(dest);
        if (!landing) return dest;
        // The descent has happened, so the bus's own second leg must not be
        // left booked: the party never touches the town's world square now, and
        // a booking nobody spends would pull them back down into the town the
        // next time they happened to walk onto it.
        if ($gameSystem) $gameSystem._busTownArrival = null;
        return landing;
    }

    // The bus's second leg, for a trip booked before arrivals went straight in
    // (a save made mid-journey) or one whose square could not be built: the
    // coach has put the party down on the town's world square, and they get off
    // at the shelter on the map load that follows.
    function descendIntoBusTown() {
        if (!$gameSystem.generateProceduralMap || !$gameSystem.generateProceduralMap()) return false;
        const tile = procArrivalTile('bus');
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        bookProcLandingFixup();
        $gamePlayer.reserveTransfer(PROC_MAP_ID_FT, tile.x, tile.y, 2, 0);
        return true;
    }

    // Nobody is set down in a boulder, a wall, a pond or the inside of the very
    // shelter they got off at. CharacterCreation settles its own origins on a
    // square the same way, and its test is the one that reads the terrain as the
    // player does (Game_CharacterBase.canPass, so water regions, cliffs and
    // mountain tags all count), so it is used where it is loaded; the plain
    // tileset-flag test below only stands in where it is not.
    function placeOnStandableTile() {
        const CCP = window.CCOriginPlacement;
        if (CCP && typeof CCP.placeOnStandableTile === 'function') {
            CCP.placeOnStandableTile();
            return;
        }
        const passable = (x, y) =>
            x >= 0 && y >= 0 && x < $gameMap.width() && y < $gameMap.height() &&
            $gameMap.checkPassage(x, y, 0x0f) && $gameMap.eventsXy(x, y).length === 0;
        if (passable($gamePlayer.x, $gamePlayer.y)) return;
        const reach = Math.max($gameMap.width(), $gameMap.height());
        for (let ring = 1; ring < reach; ring++) {
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dy = -ring; dy <= ring; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                    if (passable($gamePlayer.x + dx, $gamePlayer.y + dy)) {
                        $gamePlayer.locate($gamePlayer.x + dx, $gamePlayer.y + dy);
                        return;
                    }
                }
            }
        }
        console.warn("FastTravel: nowhere to stand on the arrival square; the party was left where it landed.");
    }

    const _Scene_Map_onMapLoaded_FTBus = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded_FTBus.call(this);
        // The square a journey arrived on is real now, events and all: settle
        // which tile of it the party is standing on.
        if ($gameTemp && $gameTemp._ftProcLanding && $gameMap.mapId() === PROC_MAP_ID_FT) {
            $gameTemp._ftProcLanding = false;
            placeOnStandableTile();
            // A vehicle that carried them here is parked where they can see it.
            if ($gameTemp._ftVehicleDrop) {
                const key = $gameTemp._ftVehicleDrop;
                $gameTemp._ftVehicleDrop = null;
                dropVehicleBeside(key);
            }
        }
        const booking = $gameSystem && $gameSystem._busTownArrival;
        if (!booking) return;
        // Only on the town's own world square, and only once. The square is
        // checked as well as the map so a booking left behind by an abandoned
        // trip cannot pull the party into some unrelated town later, and the
        // booking is spent whether or not the descent works, so a square with no
        // shelter on it never traps them in a loop of re-entering it.
        if ($gameMap.mapId() !== 315) return;
        if ($gamePlayer.x !== booking.x || $gamePlayer.y !== booking.y) return;
        $gameSystem._busTownArrival = null;
        descendIntoBusTown();
    };

    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function () {
        _DataManager_createGameObjects.call(this);
        cacheInitialized = false;
        destinationCache = null;
    };

    //=============================================================================
    // Game_Player modifications for movement lock
    //=============================================================================
    const _Game_Player_initMembers_FTS = Game_Player.prototype.initMembers;
    Game_Player.prototype.initMembers = function () {
        _Game_Player_initMembers_FTS.call(this);
        this._movementLocked = false;
    };

    Game_Player.prototype.setMovementLock = function (locked) {
        this._movementLocked = locked;
    };

    const _Game_Player_canMove_FTS = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function () {
        if (this._movementLocked) {
            return false;
        }
        return _Game_Player_canMove_FTS.call(this);
    };

    // Track airship position when moving on map 315
    const _Game_Player_increaseSteps_FTS = Game_Player.prototype.increaseSteps;
    Game_Player.prototype.increaseSteps = function () {
        _Game_Player_increaseSteps_FTS.call(this);

        // Update airship position when riding it on map 315
        if ($gameMap.mapId() === 315 && this.isInVehicle() && this.vehicle() === $gameMap.vehicle("airship")) {
            const airship = $gameMap.vehicle("airship");
            if (airship) {
                setVehiclePos('airship', 315, airship.x, airship.y);
            }
        }
    };

    //=============================================================================
    // Scene_Map modifications - Enhanced for persistent timer
    //=============================================================================
    const _Scene_Map_createAllWindows_FTS = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows_FTS.call(this);
        this.createFastTravelDestinationWindow();
        this.createTravelTimerWindow();
    };

    const _Scene_Map_start_FTS = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start_FTS.call(this);
        this.checkForActiveTimer();
    };
    Scene_Map.prototype.checkForActiveTimer = function () {
        const data = getFastTravelData();
        if (data.timerActive && this._travelTimerWindow) {
            // For car sharing, always show timer
            if (data.selectedTransport === 'carsharing' || data.selectedTransport === 'camper') {
                this._travelTimerWindow.refreshFromGameSystem();
                this._travelTimerWindow.show();
            }
            // For other transport types, only show timer when on travel map
            else if ($gameMap.mapId() === data.currentTravelMapId) {
                this._travelTimerWindow.refreshFromGameSystem();
                this._travelTimerWindow.show();
            }
            // Hide timer when not on travel map (for non-carsharing transport)
            else {
                this._travelTimerWindow.hide();
            }
        }
    };


    Scene_Map.prototype.createFastTravelDestinationWindow = function () {
        const ww = 600;
        const wh = Graphics.boxHeight - 100;
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = 50;
        this._fastTravelDestWindow = new Window_FastTravelDestination(new Rectangle(wx, wy, ww, wh));
        this._fastTravelDestWindow.setHandler('ok', this.onFastTravelOk.bind(this));
        this._fastTravelDestWindow.setHandler('cancel', this.onFastTravelCancel.bind(this));
        this._fastTravelDestWindow.hide();
        this.addWindow(this._fastTravelDestWindow);
    };

    Scene_Map.prototype.onFastTravelOk = function () {
        // Obsoleted by D&D map overlay
    };

    Scene_Map.prototype.onFastTravelCancel = function () {
        this.closeFastTravelWindow();
        clearFastTravelData();
    };

    Scene_Map.prototype.createTravelTimerWindow = function () {
        const rect = new Rectangle(10, 0, 300, this.calcWindowHeight(3, false));
        this._travelTimerWindow = new Window_TravelTimer(rect);
        this._travelTimerWindow.hide();
        this.addWindow(this._travelTimerWindow);
    };



    const _Scene_Map_onTransferEnd_FTS = Scene_Map.prototype.onTransferEnd;
    Scene_Map.prototype.onTransferEnd = function () {
        _Scene_Map_onTransferEnd_FTS.call(this);
        this.checkForActiveTimer();
    };

    // Character creation train origin: the starting train only runs to the three
    // beginner stations, so the origin picker is whitelisted to them instead of
    // offering the whole rail network.
    const CC_TRAIN_START_DESTINATIONS = ['Ghent', 'Frozen Station', 'Omega Tower'];  // i18n-ignore  destination ids

    Scene_Map.prototype.startFastTravel = function (transportType) {
        const data = getFastTravelData();
        $gamePlayer.setMovementLock(true);
        data.selectedTransport = transportType;
        // A journey that never landed must not lock the next one out: opening
        // the picker is a fresh confirmation, whatever became of the last.
        data.ccLandingPending = false;

        // Only update player coordinates if on map 315
        if ($gameMap.mapId() === 315) {
            $gameVariables.setValue(playerXVar, $gamePlayer.x);
            $gameVariables.setValue(playerYVar, $gamePlayer.y);
        }
        // If not on map 315, use the existing stored coordinates without updating

        data.destinations = getTeleportDestinations();
        // The camper/carsharing character-creation pickers (vehicle origins and
        // the hometown pick) keep the full city list; only the train origin is
        // restricted.
        data.allowedDestinations =
            ($gameTemp && $gameTemp._characterCreationTravelMode && transportType === 'train')
                ? CC_TRAIN_START_DESTINATIONS.slice()
                : null;
        data.isActive = true;

        this.openFastTravelUIOverlay();
    };

    Scene_Map.prototype.startStoryModeTravel = function () {
        const data = getFastTravelData();
        $gamePlayer.setMovementLock(true);
        data.selectedTransport = 'train';
        data.allowedDestinations = ['Ghent', 'Omega Tower'];  // i18n-ignore  destination ids

        if ($gameMap.mapId() === 315) {
            $gameVariables.setValue(playerXVar, $gamePlayer.x);
            $gameVariables.setValue(playerYVar, $gamePlayer.y);
        }

        data.destinations = getTeleportDestinations();
        data.isActive = true;

        this.openFastTravelUIOverlay();
    };

    Scene_Map.prototype.openFastTravelUIOverlay = function () {
        const isCCTravel = $gameTemp && $gameTemp._characterCreationTravelMode;
        // Lent out as a CHOOSER (see FastTravelPicker below): the map is
        // opened only to point at a place. Nothing is boarded, nothing is
        // charged and no journey is started, so every stop is affordable.
        const isPick = !!this._travelPickHandler;
        const isSandbox = ($gameSystem && $gameSystem._isSandboxMode) || 
                          ($gameParty && $gameParty.allMembers().some(actor => actor && actor.name() && actor.name().toLowerCase() === "test")) ||
                          ($gameActors && $gameActors.actor(1) && $gameActors.actor(1).name() && $gameActors.actor(1).name().toLowerCase() === "test");

        const data = getFastTravelData();
        const transportType = data.selectedTransport;
        const playerX = $gameVariables.value(playerXVar);
        const playerY = $gameVariables.value(playerYVar);
        const offEarth = earthLost();

        const playerPix = playerPixel();
        const playerPixelX = playerPix.x;
        const playerPixelY = playerPix.y;

        // Filter and sort destinations
        const currentMapName = $dataMapInfos[$gameMap.mapId()]?.name || '';
        let filtered = data.destinations;

        if (offEarth) {
            // Every filter below asks a question about a network that no longer
            // exists, so none of them is asked: one stop, always listed,
            // whichever transport the party thinks they are taking.
            filtered = data.destinations.filter(dest => dest.name === OMEGA_TOWER_DEST);
        } else {
            if (transportType === 'bus' || transportType === 'train' || transportType === 'helicopter') {
                filtered = data.destinations.filter(dest => {
                    return servesTransport(dest, transportType);
                });
            }

            filtered = filtered.filter(dest => {
                return !currentMapName.toLowerCase().includes(dest.name.toLowerCase());
            });

            if (data.allowedDestinations && data.allowedDestinations.length > 0) {
                filtered = filtered.filter(dest =>
                    data.allowedDestinations.includes(dest.name)
                );
            }
        }

        // The party's own squares ride along with the network's stops, but only
        // for a vehicle: nothing else can be told to stop in open country. They
        // are rebuilt from the store on every open, so a renamed point reads as
        // its new name straight away.
        const vehicleTravel = isVehicleTravel(transportType) && !offEarth && !isCCTravel;
        if (vehicleTravel) {
            data.destinations = data.destinations.filter(d => !d.custom);
            const own = customDestinations();
            own.forEach(dest => data.destinations.push(dest));
            filtered = filtered.concat(own);
        }

        // Gold is the transport network, and nothing else. A place reads as a hub
        // when its Destinations.json entry declares an arrival stop of its own -
        // any of them, a platform, a bus bay, a helipad - and that is the only
        // thing that colours a pin or a row. It does not depend on which
        // transport the player is taking, so the network reads the same however
        // they are travelling.
        const isHub = dest => !!(dest && dest.transportOverrides
            && TRANSPORT_KEYS.some(key => dest.transportOverrides[key]));

        // The places the network actually reaches are read first: every hub
        // heads the list, everything else follows, and inside each of the two
        // groups the nearest stop still comes first. A hub pin is also drawn
        // last so it lies OVER the plain stops it shares a corner of the map
        // with, and stays the one the click lands on.
        const destinationsWithDistance = filtered
            .map(dest => {
                const worldDest = getWorldPosition(dest);
                const distance = calculateDistance(playerX, playerY, worldDest.x, worldDest.y);
                return { destination: dest, distance: distance };
            })
            .sort((a, b) => {
                const hubDelta = (isHub(b.destination) ? 1 : 0) - (isHub(a.destination) ? 1 : 0);
                if (hubDelta !== 0) return hubDelta;
                return a.distance - b.distance;
            });

        // Build the HTML overlay
        const overlay = document.createElement('div');
        overlay.id = 'travel-overlay';
        _travelOverlayEl = overlay;

        // What kind of place it is comes from the entry's own "type" (city,
        // village, dungeon, gasStation), which decides the SHAPE of the pin.
        // Shape and colour are independent: a gold pin still reads as a city, a
        // village or a delve.
        const kindClass = dest => ' travel-kind-' +
            String(dest && dest.type ? dest.type : 'village').toLowerCase();

        const listItemsHTML = destinationsWithDistance.map(item => {
            const dest = item.destination;
            const distanceInTiles = item.distance;
            const distanceInKm = Math.round(distanceInTiles * 1);

            let costText = "";
            let enabled = true;

            if (isPick) {
                enabled = true;
                costText = "";
            } else if (isCCTravel) {
                enabled = true;
                costText = "0€";
            } else if (transportType === 'carsharing' || transportType === 'camper') {
                const fuelNeeded = calculateTravelCostFromDistance(distanceInTiles, transportType);
                enabled = currentFuelForTransport(transportType) >= fuelNeeded;
                costText = `${fuelNeeded.toFixed(1)}L`;
            } else {
                const cost = calculateTravelCostFromDistance(distanceInTiles, transportType);
                const costEuros = goldToEuros(cost);
                enabled = $gameParty.gold() >= cost;
                costText = `${costEuros}€`;
            }

            const disabledClass = enabled ? "" : "disabled";
            const customClass = dest.custom ? " is-custom" : "";
            const hub = isHub(dest);
            const hubClass = hub ? " is-hub" : "";
            const hubBadge = hub
                ? `<span class="travel-dest-hub" title="${T('FastTravel.hubTitle')}">${T('FastTravel.hubBadge')}</span>`
                : "";

            return `
                <div class="travel-dest-item ${disabledClass}${hubClass}${customClass}${kindClass(dest)}" data-name="${dest.name}" onclick="SceneManager._scene.selectTravelDestination('${dest.name}')">
                    <span class="travel-dest-name">${rowLabel(dest)}${hubBadge}</span>
                    <span class="travel-dest-meta">
                        <span>Distance: ${distanceInKm} km</span>
                        <span class="travel-dest-cost">${costText}</span>
                    </span>
                </div>
            `;
        }).join('');

        // The row that opens the coordinate box. First in the list, so a pad
        // reaches it with one press of up.
        const addCustomHTML = vehicleTravel ? `
                <div class="travel-dest-item travel-custom-add" data-name="${CUSTOM_ADD_KEY}" onclick="SceneManager._scene.selectTravelDestination('${CUSTOM_ADD_KEY}')">
                    <span class="travel-dest-name">${T('FastTravel.custom.add')}</span>
                </div>
            ` : '';

        const markersHTML = destinationsWithDistance.slice().reverse().map(item => {
            const dest = item.destination;
            const pix = destPixel(dest);
            const x = pix.x;
            const y = pix.y;

            const hub = isHub(dest);
            const hubClass = (hub ? " is-hub" : "") + (dest.custom ? " is-custom" : "");
            const baseLabel = hub
                ? T('FastTravel.hubLabel', { place: rowLabel(dest) }) : rowLabel(dest);
            const label = isSandbox ? `${baseLabel} (X: ${Math.round(x)}, Y: ${Math.round(y)})` : baseLabel;

            return `
                <div class="travel-marker${hubClass}${kindClass(dest)}" id="marker-${dest.name}" style="left:${x}px; top:${y}px" onclick="SceneManager._scene.selectTravelDestination('${dest.name}')">
                    <div class="travel-marker-tooltip">${label}</div>
                </div>
            `;
        }).join('');

        const transportDisplayName = transportLabel(transportType);
        const multiplier = transportMultipliers[transportType] || 1.0;
        const multiplierText = (transportType === 'carsharing' || transportType === 'camper')
            ? T('FastTravel.fuelRate', { rate: fuelConsumptionRate })
            : T('FastTravel.rateMultiplier', { multiplier: multiplier.toFixed(1) });

        // The picker a character is created in cannot be cancelled - a party has
        // to begin SOMEWHERE - but the choice that opened it can still be taken
        // back: the Back button here hands the player to the origin list again,
        // and CharacterCreation undoes everything the chosen origin granted on
        // the way (CharacterCreationOrigin.reopen).
        const ccCanReopenOrigin = isCCTravel
            && !!(window.CharacterCreationOrigin
                && window.CharacterCreationOrigin.canReopen
                && window.CharacterCreationOrigin.canReopen());

        const backButtonLabel = isCCTravel ? T('FastTravel.ui.backToOrigin') : T('FastTravel.ui.back');
        const backButtonAction = isCCTravel
            ? "SceneManager._scene.reopenCreationOriginStep()"
            : "SceneManager._scene.closeTravelUIOverlay()";

        // The one way out of the picker, in the place every other spread keeps
        // it: the left of the page header, never a button at the foot of the
        // list.
        const backButtonHTML = (isCCTravel && !ccCanReopenOrigin)
            ? ""
            : `<div class="back-button focusable" onclick="${backButtonAction}">${backButtonLabel}</div>`;

        const editToolbarHTML = isSandbox ? `
            <div class="travel-edit-toolbar" id="travel-edit-toolbar">
                <button class="travel-edit-btn" id="btn-edit-mode" onclick="SceneManager._scene.toggleTravelEditMode()">${T('FastTravel.ui.edit')}</button>
                <button class="travel-edit-btn" id="btn-print-coords" onclick="SceneManager._scene.printTravelCoordinates()">${T('FastTravel.ui.print')}</button>
            </div>
        ` : '';

        overlay.innerHTML = `
            <div class="travel-book-spread">
                <div class="left-page travel-left-page">
                    <!-- LIST PANEL -->
                    <div class="travel-list-panel" id="panel-list">
                        <div class="page-header-bar">
                            ${backButtonHTML}
                            <h2 class="title">${T('FastTravel.ui.stations')}</h2>
                        </div>
                        <div class="travel-transport-info">
                            <span class="travel-transport-name">${transportDisplayName}</span>
                            <span class="travel-transport-rate">${multiplierText}</span>
                        </div>
                        <div class="ui-list travel-dest-list">
                            ${addCustomHTML}
                            ${listItemsHTML}
                        </div>
                    </div>

                    <!-- CONFIRM PANEL (initially hidden) -->
                    <div class="ui-detail travel-confirm-panel" id="panel-confirm">
                        <div class="page-header-bar">
                            <div class="back-button focusable" onclick="SceneManager._scene.closeTravelConfirmModal()">${T('FastTravel.ui.back')}</div>
                            <h2 class="title">${T('FastTravel.ui.confirmJourney')}</h2>
                        </div>
                        <div class="travel-confirm-dest" id="sidebar-dest-title">${T('FastTravel.ui.travelToPlaceholder')}</div>
                        <div class="travel-confirm-picture" id="sidebar-dest-picture"></div>

                        <div class="ui-detail-scroll travel-confirm-details">
                            <div class="inspect-spec-row">
                                <span class="inspect-spec-label">${T('FastTravel.ui.transport')}</span>
                                <span class="inspect-spec-value" id="sidebar-transport-val">${T('FastTravel.ui.transportPlaceholder')}</span>
                            </div>
                            <div class="inspect-spec-row">
                                <span class="inspect-spec-label">${T('FastTravel.ui.distance')}</span>
                                <span class="inspect-spec-value" id="sidebar-distance-val">12 km</span>
                            </div>
                            <div class="inspect-spec-row">
                                <span class="inspect-spec-label">${T('FastTravel.ui.cost')}</span>
                                <span class="inspect-spec-value travel-dest-cost" id="sidebar-cost-val">1.20&euro;</span>
                            </div>
                            <div class="inspect-spec-row">
                                <span class="inspect-spec-label">${T('FastTravel.ui.travelTime')}</span>
                                <span class="inspect-spec-value" id="sidebar-time-val">4s</span>
                            </div>
                        </div>

                        <div class="inspect-actions travel-confirm-actions">
                            <div class="inspect-btn focusable" id="sidebar-confirm-action-btn">${T('FastTravel.ui.travel')}</div>
                        </div>
                    </div>
                </div>

                <div class="right-page travel-right-page">
                    <div class="travel-map-viewer" id="travel-viewer">
                        <div class="travel-map-wrapper" id="travel-wrapper">
                            ${offEarth
                                ? `<div class="travel-map-space"><div class="travel-space-tower"
                                        style="left:${SPACE_CENTRE.x}px; top:${SPACE_CENTRE.y}px"></div></div>`
                                : `<img class="travel-map-img" src="img/worldmap/OldEuropeParacetamolo.png">`}

                            <svg class="travel-svg-layer" viewBox="0 0 1232 1039">
                                <path class="travel-route-line-bg" id="travel-route-bg" d=""></path>
                                <path class="travel-route-line" id="travel-route" d=""></path>
                            </svg>

                            ${markersHTML}

                            <div class="travel-player-marker" style="left:${playerPixelX}px; top:${playerPixelY}px">
                                <div class="travel-player-pulse"></div>
                                <div class="travel-player-dot"></div>
                            </div>
                        </div>

                        <div class="travel-zoom-controls">
                            <div class="travel-zoom-btn" onclick="SceneManager._scene.adjustTravelZoom(1.3)">+</div>
                            <div class="travel-zoom-btn" onclick="SceneManager._scene.adjustTravelZoom(0.7)">-</div>
                        </div>
                        ${editToolbarHTML}
                    </div>
                </div>
            </div>

            <!-- COORDINATE BOX (initially hidden) -->
            <div class="ui-overlay travel-custom-modal" id="travel-custom-modal">
                <div class="ui-panel travel-custom-box">
                    <div class="page-header-bar">
                        <h2 class="title">${T('FastTravel.custom.title')}</h2>
                    </div>
                    <div class="travel-custom-field focusable" id="travel-custom-field-0" onclick="SceneManager._scene.focusCustomField(0)">
                        <span class="travel-custom-label">${T('FastTravel.custom.x')}</span>
                        <span class="travel-custom-stepper">
                            <span class="travel-custom-arrow" onclick="SceneManager._scene.stepCustomField(0, -1)">&#9664;</span>
                            <span class="travel-custom-value" id="travel-custom-x">1</span>
                            <span class="travel-custom-arrow" onclick="SceneManager._scene.stepCustomField(0, 1)">&#9654;</span>
                        </span>
                    </div>
                    <div class="travel-custom-field focusable" id="travel-custom-field-1" onclick="SceneManager._scene.focusCustomField(1)">
                        <span class="travel-custom-label">${T('FastTravel.custom.y')}</span>
                        <span class="travel-custom-stepper">
                            <span class="travel-custom-arrow" onclick="SceneManager._scene.stepCustomField(1, -1)">&#9664;</span>
                            <span class="travel-custom-value" id="travel-custom-y">1</span>
                            <span class="travel-custom-arrow" onclick="SceneManager._scene.stepCustomField(1, 1)">&#9654;</span>
                        </span>
                    </div>
                    <div class="travel-custom-field focusable" id="travel-custom-field-2" onclick="SceneManager._scene.focusCustomField(2)">
                        <span class="travel-custom-label">${T('FastTravel.custom.name')}</span>
                        <input class="ui-input travel-custom-input" id="travel-custom-name" type="text" maxlength="48">
                    </div>
                    <div class="travel-custom-status" id="travel-custom-status"></div>
                    <div class="inspect-actions">
                        <div class="inspect-btn focusable" id="travel-custom-save" onclick="SceneManager._scene.saveCustomPoint()">${T('FastTravel.custom.save')}</div>
                        <div class="inspect-btn inspect-btn--secondary focusable" onclick="SceneManager._scene.closeCustomPointModal()">${T('FastTravel.ui.cancel')}</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Character creation steps out to this picker behind a full-screen black
        // veil (CCTransitionVeil), so the map it briefly returns to never shows.
        // The veil is the destination screen's to lift, and this is that screen:
        // the list is attached and painted, so there is nothing left to hide.
        // Without this the picker sat under an opaque sheet until the veil's own
        // 8-second watchdog fired, which read as the game failing to load.
        if (window.CCTransitionVeil) window.CCTransitionVeil.hide();

        this._travelEditModeActive = false;
        this._travelEditPositions = {};

        // Initialize dragging and zooming
        this.initTravelMapInteractions(playerPixelX, playerPixelY);

        // Pre-select + fully highlight the first destination on open (same as
        // navigating to it: list selection, map marker, route line and pan).
        _travelSelectedIndex = 0;
        const firstItem = document.querySelector('.travel-dest-item');
        if (firstItem) this.highlightTravelDestination(firstItem.getAttribute('data-name'));

        // W / S / ArrowUp / ArrowDown keyboard navigation
        this._travelKeyHandler = (e) => {
            const overlay = document.getElementById('travel-overlay');
            if (!overlay) return;
            const listPanel = document.getElementById('panel-list');
            const isListVisible = listPanel && listPanel.style.display !== 'none';
            const customBox = document.getElementById('travel-custom-modal');
            if (customBox && customBox.style.display === 'flex') return;

            // Up/Down navigation (ArrowUp/ArrowDown and W/S remapped to up/down) is
            // handled solely by the RMMZ Input handler in Scene_Map.update so the
            // selection moves exactly one station per press. Handling W/S here too
            // double-counted the move (DOM keydown + RMMZ isRepeated), which made up
            // and down behave inconsistently (#89). This handler now only covers confirm.
            if (e.key === 'Enter' || e.key === 'z' || e.key === 'Z') {
                if (isListVisible) {
                    e.preventDefault();
                    Input.clear(); // Prevent RMMZ Input from also processing this
                    const items = Array.from(document.querySelectorAll('.travel-dest-item'));
                    if (items.length > 0) this.selectTravelDestination(items[_travelSelectedIndex].getAttribute('data-name'));
                }
            }
        };
        document.addEventListener('keydown', this._travelKeyHandler);
    };

    Scene_Map.prototype.initTravelMapInteractions = function (playerX, playerY) {
        const viewer = document.getElementById('travel-viewer');
        const wrapper = document.getElementById('travel-wrapper');
        if (!viewer || !wrapper) return;

        this._travelZoom = 1.0;
        // Center on player initially
        const rect = viewer.getBoundingClientRect();
        const centerX = rect.width / 2 || 432;
        const centerY = rect.height / 2 || 400;
        this._travelPanX = centerX - playerX;
        this._travelPanY = centerY - playerY;

        const updateTransform = () => {
            wrapper.style.transform = `translate(${this._travelPanX}px, ${this._travelPanY}px) scale(${this._travelZoom})`;
        };

        updateTransform();

        // Dragging variables
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        let isDraggingMarker = false;
        let draggedMarker = null;
        let markerStartClientX = 0, markerStartClientY = 0;
        let markerStartLeft = 0, markerStartTop = 0;

        viewer.addEventListener('mousedown', (e) => {
            const markerEl = e.target.closest('.travel-marker');
            if (this._travelEditModeActive && markerEl) {
                e.preventDefault();
                e.stopPropagation();
                isDraggingMarker = true;
                draggedMarker = markerEl;
                markerStartClientX = e.clientX;
                markerStartClientY = e.clientY;
                markerStartLeft = parseFloat(markerEl.style.left) || 0;
                markerStartTop = parseFloat(markerEl.style.top) || 0;
                return;
            }
            if (e.target.closest('.travel-marker') || e.target.closest('.inspect-btn') || e.target.closest('.travel-zoom-btn') || e.target.closest('.travel-edit-btn')) return;
            isDragging = true;
            viewer.style.cursor = 'grabbing';
            startX = e.clientX - this._travelPanX;
            startY = e.clientY - this._travelPanY;
        });

        // Remove any stale window-level drag handlers from a prior open (prevents accumulation/leak)
        if (this._travelMouseMoveHandler) window.removeEventListener('mousemove', this._travelMouseMoveHandler);
        if (this._travelMouseUpHandler) window.removeEventListener('mouseup', this._travelMouseUpHandler);

        this._travelMouseMoveHandler = (e) => {
            if (isDraggingMarker && draggedMarker) {
                const dx = (e.clientX - markerStartClientX) / this._travelZoom;
                const dy = (e.clientY - markerStartClientY) / this._travelZoom;
                const newLeft = markerStartLeft + dx;
                const newTop = markerStartTop + dy;
                draggedMarker.style.left = `${newLeft}px`;
                draggedMarker.style.top = `${newTop}px`;
                const markerName = draggedMarker.id.replace('marker-', '');
                if (!this._travelEditPositions) this._travelEditPositions = {};
                this._travelEditPositions[markerName] = { x: newLeft, y: newTop };
                const tooltip = draggedMarker.querySelector('.travel-marker-tooltip');
                if (tooltip) tooltip.textContent = `${markerName} (X: ${Math.round(newLeft)}, Y: ${Math.round(newTop)})`;
                return;
            }
            if (!isDragging) return;
            this._travelPanX = e.clientX - startX;
            this._travelPanY = e.clientY - startY;
            updateTransform();
        };
        window.addEventListener('mousemove', this._travelMouseMoveHandler);

        this._travelMouseUpHandler = () => {
            isDraggingMarker = false;
            draggedMarker = null;
            isDragging = false;
            if (viewer) viewer.style.cursor = this._travelEditModeActive ? 'default' : 'grab';
        };
        window.addEventListener('mouseup', this._travelMouseUpHandler);

        // Wheel zoom
        viewer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = 1.15;
            const oldZoom = this._travelZoom;

            if (e.deltaY < 0) {
                this._travelZoom = Math.min(this._travelZoom * zoomFactor, 3.5);
            } else {
                this._travelZoom = Math.max(this._travelZoom / zoomFactor, 0.5);
            }

            const vRect = viewer.getBoundingClientRect();
            const mouseX = e.clientX - vRect.left;
            const mouseY = e.clientY - vRect.top;

            this._travelPanX = mouseX - (mouseX - this._travelPanX) * (this._travelZoom / oldZoom);
            this._travelPanY = mouseY - (mouseY - this._travelPanY) * (this._travelZoom / oldZoom);

            updateTransform();
        });

        this._updateTravelTransform = updateTransform;
    };

    Scene_Map.prototype.adjustTravelZoom = function (factor) {
        const viewer = document.getElementById('travel-viewer');
        if (!viewer || !this._updateTravelTransform) return;

        const oldZoom = this._travelZoom;
        this._travelZoom = Math.max(0.5, Math.min(3.5, this._travelZoom * factor));

        const rect = viewer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        this._travelPanX = centerX - (centerX - this._travelPanX) * (this._travelZoom / oldZoom);
        this._travelPanY = centerY - (centerY - this._travelPanY) * (this._travelZoom / oldZoom);

        this._updateTravelTransform();
    };

    Scene_Map.prototype.toggleTravelEditMode = function () {
        this._travelEditModeActive = !this._travelEditModeActive;
        const btn = document.getElementById('btn-edit-mode');
        const viewer = document.getElementById('travel-viewer');
        if (btn) {
            btn.classList.toggle('active', this._travelEditModeActive);
            btn.textContent = this._travelEditModeActive
                ? T('FastTravel.editing') : T('FastTravel.edit');
        }
        if (viewer) {
            viewer.style.cursor = this._travelEditModeActive ? 'default' : 'grab';
            viewer.classList.toggle('edit-mode', this._travelEditModeActive);
        }
    };

Scene_Map.prototype.printTravelCoordinates = function () {
        const positions = this._travelEditPositions || {};
        
        // Build a complete copy of the original destinations to avoid modifying the live game state
        const updatedDestinations = {};
        
        for (const [name, originalData] of Object.entries(TRANSPORT_DESTINATIONS)) {
            // Deep copy the original destination data
            updatedDestinations[name] = JSON.parse(JSON.stringify(originalData));
            
            // Clean up the temporary 'image' property added during initialization so it doesn't print to JSON
            if (updatedDestinations[name].image) {
                delete updatedDestinations[name].image;
            }
            
            // If this location was moved in the current edit session, update its mapOffset coordinates
            if (positions[name]) {
                updatedDestinations[name].mapOffset = {
                    x: Math.round(positions[name].x),
                    y: Math.round(positions[name].y)
                };
            }
        }

    };

    Scene_Map.prototype.highlightTravelDestination = function (destName) {
        const data = getFastTravelData();

        // The row that opens the coordinate box is not a place: it highlights
        // like any other row and moves nothing on the map.
        if (destName === CUSTOM_ADD_KEY) {
            SoundManager.playCursor();
            document.querySelectorAll('.travel-dest-item').forEach(item => {
                item.classList.toggle('selected', item.getAttribute('data-name') === destName);
            });
            return;
        }

        const dest = data.destinations.find(d => d.name === destName);
        if (!dest) return;

        const destPix = destPixel(dest);

        SoundManager.playCursor();

        const items = document.querySelectorAll('.travel-dest-item');
        items.forEach(item => {
            if (item.getAttribute('data-name') === destName) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected');
            }
        });

        const markers = document.querySelectorAll('.travel-marker');
        markers.forEach(m => {
            if (m.id === `marker-${destName}`) m.classList.add('selected');
            else m.classList.remove('selected');
        });

        const viewer = document.getElementById('travel-viewer');
        if (viewer && this._updateTravelTransform) {
            const rect = viewer.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const destX = destPix.x;
            const destY = destPix.y;
            const startPanX = this._travelPanX;
            const startPanY = this._travelPanY;
            const targetPanX = centerX - destX * this._travelZoom;
            const targetPanY = centerY - destY * this._travelZoom;
            const startTime = Date.now();
            const duration = 300;
            const animatePan = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress * (2 - progress);
                this._travelPanX = startPanX + (targetPanX - startPanX) * ease;
                this._travelPanY = startPanY + (targetPanY - startPanY) * ease;
                this._updateTravelTransform();
                if (progress < 1) requestAnimationFrame(animatePan);
            };
            animatePan();
        }

        const playerX = $gameVariables.value(playerXVar);
        const playerY = $gameVariables.value(playerYVar);
        const playerPix = playerPixel();
        const playerPixelX = playerPix.x;
        const playerPixelY = playerPix.y;
        const destPixelX = destPix.x;
        const destPixelY = destPix.y;

        const routeLine = document.getElementById('travel-route');
        const routeLineBg = document.getElementById('travel-route-bg');
        if (routeLine && routeLineBg) {
            const d = `M ${playerPixelX} ${playerPixelY} L ${destPixelX} ${destPixelY}`;
            routeLine.setAttribute('d', d);
            routeLineBg.setAttribute('d', d);
            const length = routeLine.getTotalLength();
            routeLine.style.transition = 'none';
            routeLine.style.strokeDasharray = `${length} ${length}`;
            routeLine.style.strokeDashoffset = length;
            routeLine.getBoundingClientRect();
            routeLine.style.transition = 'stroke-dashoffset 0.6s ease-in-out';
            routeLine.style.strokeDashoffset = '0';
            setTimeout(() => {
                routeLine.style.transition = 'none';
                routeLine.style.strokeDasharray = '8, 8';
            }, 600);
        }
    };

    Scene_Map.prototype.selectTravelDestination = function (destName) {
        const data = getFastTravelData();
        const transportType = data.selectedTransport;

        if (destName === CUSTOM_ADD_KEY) {
            this.openCustomPointModal();
            return;
        }

        const dest = data.destinations.find(d => d.name === destName);
        if (!dest) return;

        const destPix = destPixel(dest);

        // Play cursor sound
        SoundManager.playCursor();

        // Highlight in the list
        const items = document.querySelectorAll('.travel-dest-item');
        items.forEach(item => {
            if (item.getAttribute('data-name') === destName) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected');
            }
        });

        // Highlight on the map
        const markers = document.querySelectorAll('.travel-marker');
        markers.forEach(m => {
            if (m.id === `marker-${destName}`) {
                m.classList.add('selected');
            } else {
                m.classList.remove('selected');
            }
        });

        // Center the view on the selected destination with a slight animation!
        const viewer = document.getElementById('travel-viewer');
        if (viewer && this._updateTravelTransform) {
            const rect = viewer.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const destX = destPix.x;
            const destY = destPix.y;

            const startPanX = this._travelPanX;
            const startPanY = this._travelPanY;
            const targetPanX = centerX - destX * this._travelZoom;
            const targetPanY = centerY - destY * this._travelZoom;

            const startTime = Date.now();
            const duration = 300; // ms

            const animatePan = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress * (2 - progress);

                this._travelPanX = startPanX + (targetPanX - startPanX) * ease;
                this._travelPanY = startPanY + (targetPanY - startPanY) * ease;

                this._updateTravelTransform();

                if (progress < 1) {
                    requestAnimationFrame(animatePan);
                }
            };

            animatePan();
        }

        // Draw animated SVG route line
        const playerX = $gameVariables.value(playerXVar);
        const playerY = $gameVariables.value(playerYVar);
        const playerPix = playerPixel();
        const playerPixelX = playerPix.x;
        const playerPixelY = playerPix.y;
        const destPixelX = destPix.x;
        const destPixelY = destPix.y;

        const routeLine = document.getElementById('travel-route');
        const routeLineBg = document.getElementById('travel-route-bg');
        if (routeLine && routeLineBg) {
            const d = `M ${playerPixelX} ${playerPixelY} L ${destPixelX} ${destPixelY}`;
            routeLine.setAttribute('d', d);
            routeLineBg.setAttribute('d', d);

            const length = routeLine.getTotalLength();
            routeLine.style.transition = 'none';
            routeLine.style.strokeDasharray = `${length} ${length}`;
            routeLine.style.strokeDashoffset = length;

            routeLine.getBoundingClientRect(); // Trigger reflow
            routeLine.style.transition = 'stroke-dashoffset 0.6s ease-in-out';
            routeLine.style.strokeDashoffset = '0';

            setTimeout(() => {
                routeLine.style.transition = 'none';
                routeLine.style.strokeDasharray = '8, 8';
            }, 600);
        }

        // Open travel confirmation sidebar panel instead of a modal
        const cost = calculateTravelCost(dest, transportType);
        const travelTime = calculateTravelTime(dest, transportType);

        const transportDisplayName = transportLabel(transportType);
        const worldDest = getWorldPosition(dest);
        const distance = calculateDistance(playerX, playerY, worldDest.x, worldDest.y);
        const distanceInKm = Math.round(distance * 1);

        let costValueText = "";
        if (this._travelPickHandler) {
            costValueText = T('FastTravel.ui.free');
        } else if ($gameTemp && $gameTemp._characterCreationTravelMode) {
            costValueText = "0 €";
        } else if (transportType === 'carsharing' || transportType === 'camper') {
            costValueText = T('FastTravel.litersOfFuel', { liters: cost.toFixed(1) });
        } else {
            costValueText = `${goldToEuros(cost)} €`;
        }

        let timeText = "";
        if (travelTime >= 60) {
            const m = Math.floor(travelTime / 60);
            const s = travelTime % 60;
            timeText = `${m}m ${s}s`;
        } else {
            timeText = `${travelTime}s`;
        }

        document.getElementById('sidebar-dest-title').innerText = T('FastTravel.ui.travelTo', { name: rowLabel(dest) });

        // The place is shown before its numbers: the 4:3 plate the entry names,
        // and nothing at all when it names none (a square written down by hand).
        // A plate that was never drawn is simply not shown: a missing file takes
        // the box away and the journey is confirmed exactly as before.
        try {
            const pictureBox = document.getElementById('sidebar-dest-picture');
            if (pictureBox) {
                const pictureName = dest.picture || (TRANSPORT_DESTINATIONS[dest.name] || {}).picture;
                pictureBox.innerHTML = '';
                if (pictureName) {
                    const plate = document.createElement('img');
                    plate.className = 'travel-confirm-plate';
                    plate.onerror = () => { pictureBox.style.display = 'none'; };
                    plate.onload = () => { pictureBox.style.display = ''; };
                    plate.src = `img/pictures/${encodeURI(pictureName)}.png`;
                    pictureBox.appendChild(plate);
                } else {
                    pictureBox.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn('FastTravel: destination plate failed', e);
        }
        document.getElementById('sidebar-transport-val').innerText = transportDisplayName;
        document.getElementById('sidebar-distance-val').innerText = `${distanceInKm} km`;
        document.getElementById('sidebar-cost-val').innerText = costValueText;
        document.getElementById('sidebar-time-val').innerText =
            this._travelPickHandler ? '-' : timeText;

        const confirmBtn = document.getElementById('sidebar-confirm-action-btn');
        if (this._travelPickHandler) confirmBtn.textContent = T('FastTravel.ui.startHere');
        confirmBtn.onclick = () => {
            // Lent out as a chooser: the answer is the place itself. The overlay
            // comes down and whoever borrowed it is handed the entry and the
            // world square it stands on; no fare, no fuel, no journey.
            if (this._travelPickHandler) {
                const pick = this._travelPickHandler;
                this._travelPickHandler = null;
                this._travelPickCancel = null;
                SoundManager.playOk();
                this.closeTravelUIOverlay(true);
                pick(dest, getWorldPosition(dest));
                return;
            }
            // Character-creation travel is always free, regardless of fuel/gold.
            const ccFree = $gameTemp && $gameTemp._characterCreationTravelMode;
            const refusal = boardingRefusal(transportType);
            if (refusal) {
                SoundManager.playBuzzer();
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(T('FastTravel.refused.' + refusal), {
                        title: T('FastTravel.refused.title'), duration: 240,
                    });
                }
                return;
            }
            if (ccFree || canAffordTravel(dest, transportType)) {
                SoundManager.playOk();
                executeTravel(dest, cost);
                this.closeTravelUIOverlay(true); // Don't play cancel sound, travel was confirmed!
            } else {
                SoundManager.playBuzzer();
                const costVal = document.getElementById('sidebar-cost-val');
                costVal.classList.add('cost--short');
                setTimeout(() => {
                    costVal.classList.remove('cost--short');
                }, 1000);
            }
        };

        // Hide list panel and show confirmation panel in sidebar
        document.getElementById('panel-list').style.display = 'none';
        document.getElementById('panel-confirm').style.display = 'flex';
    };

    // -- The coordinate box --------------------------------------------------
    //
    // Three fields, driven the same way by a keyboard and by a pad: up and down
    // move between them, left and right change the number under the cursor, the
    // shoulders move it ten at a time, and OK writes the square down. The name
    // begins as the nation and the ground standing there and stays that way
    // until somebody types over it.
    Scene_Map.prototype.openCustomPointModal = function () {
        const modal = document.getElementById('travel-custom-modal');
        if (!modal) return;
        SoundManager.playOk();
        const px = $gameVariables.value(playerXVar);
        const py = $gameVariables.value(playerYVar);
        this._customPoint = {
            x: Math.max(CUSTOM_COORD_MIN, Math.min(CUSTOM_COORD_MAX, px || CUSTOM_COORD_MIN)),
            y: Math.max(CUSTOM_COORD_MIN, Math.min(CUSTOM_COORD_MAX, py || CUSTOM_COORD_MIN)),
        };
        this._customPointField = 0;
        this._customNameEdited = false;
        modal.style.display = 'flex';

        const nameInput = document.getElementById('travel-custom-name');
        if (nameInput) {
            nameInput.oninput = () => { this._customNameEdited = true; };
            nameInput.onkeydown = (e) => {
                // Enter finishes the name rather than travelling: the box still
                // has a Save button of its own to press.
                if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
                e.stopPropagation();
            };
        }
        this.refreshCustomPointModal();
    };

    Scene_Map.prototype.refreshCustomPointModal = function () {
        const point = this._customPoint;
        if (!point) return;
        const xEl = document.getElementById('travel-custom-x');
        const yEl = document.getElementById('travel-custom-y');
        if (xEl) xEl.textContent = String(point.x);
        if (yEl) yEl.textContent = String(point.y);

        const nameInput = document.getElementById('travel-custom-name');
        if (nameInput && !this._customNameEdited) nameInput.value = defaultCustomName(point.x, point.y);

        for (let i = 0; i < 3; i++) {
            const field = document.getElementById('travel-custom-field-' + i);
            if (field) field.classList.toggle('selected', i === this._customPointField);
        }

        const refusal = customPointRefusal(point.x, point.y);
        const status = document.getElementById('travel-custom-status');
        if (status) {
            status.textContent = refusal
                ? T('FastTravel.custom.refused.' + refusal)
                : T('FastTravel.custom.allowed', {
                    biome: biomeLabelAt(point.x, point.y) || T('FastTravel.custom.unknownBiome') });
            status.classList.toggle('refused', !!refusal);
        }
        const save = document.getElementById('travel-custom-save');
        if (save) save.classList.toggle('disabled', !!refusal);
    };

    Scene_Map.prototype.focusCustomField = function (index) {
        if (!this._customPoint) return;
        this._customPointField = index;
        SoundManager.playCursor();
        this.refreshCustomPointModal();
    };

    Scene_Map.prototype.stepCustomField = function (field, delta) {
        const point = this._customPoint;
        if (!point || field > 1) return;
        const key = field === 0 ? 'x' : 'y';   // i18n-ignore  field id
        let value = point[key] + delta;
        // The numbers wrap, so a pad reaches 256 from 1 without crossing the map.
        const span = CUSTOM_COORD_MAX - CUSTOM_COORD_MIN + 1;
        value = ((value - CUSTOM_COORD_MIN) % span + span) % span + CUSTOM_COORD_MIN;
        point[key] = value;
        this._customPointField = field;
        SoundManager.playCursor();
        this.refreshCustomPointModal();
    };

    Scene_Map.prototype.saveCustomPoint = function () {
        const point = this._customPoint;
        if (!point) return;
        const refusal = customPointRefusal(point.x, point.y);
        if (refusal) {
            SoundManager.playBuzzer();
            return;
        }
        const nameInput = document.getElementById('travel-custom-name');
        const name = (nameInput && nameInput.value.trim()) || defaultCustomName(point.x, point.y);
        customTravelPoints().push({ x: point.x, y: point.y, name: name });
        SoundManager.playOk();
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T('FastTravel.custom.saved', { name: name }), {
                title: T('FastTravel.custom.savedTitle'), duration: 180,
            });
        }
        this.closeCustomPointModal(true);
        // The list and the pins are rebuilt so the new square stands on both.
        this.refreshTravelOverlay();
    };

    Scene_Map.prototype.closeCustomPointModal = function (skipSound) {
        const modal = document.getElementById('travel-custom-modal');
        const nameInput = document.getElementById('travel-custom-name');
        if (nameInput) nameInput.blur();
        if (modal) modal.style.display = 'none';
        this._customPoint = null;
        if (!skipSound) SoundManager.playCancel();
    };

    // Draw the picker again from the data behind it, without ending the visit to
    // it: the overlay is replaced in place and the world stays frozen under it.
    Scene_Map.prototype.refreshTravelOverlay = function () {
        const overlay = document.getElementById('travel-overlay');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        _travelOverlayEl = null;
        if (this._travelKeyHandler) {
            document.removeEventListener('keydown', this._travelKeyHandler);
            this._travelKeyHandler = null;
        }
        this.openFastTravelUIOverlay();
    };

    Scene_Map.prototype.closeTravelConfirmModal = function () {
        SoundManager.playCancel();

        // Show list panel and hide confirmation panel in sidebar
        const listPanel = document.getElementById('panel-list');
        const confirmPanel = document.getElementById('panel-confirm');
        if (listPanel && confirmPanel) {
            listPanel.style.display = 'flex';
            confirmPanel.style.display = 'none';
        }

        const items = document.querySelectorAll('.travel-dest-item');
        items.forEach(item => item.classList.remove('selected'));

        const markers = document.querySelectorAll('.travel-marker');
        markers.forEach(m => m.classList.remove('selected'));

        const routeLine = document.getElementById('travel-route');
        const routeLineBg = document.getElementById('travel-route-bg');
        if (routeLine) routeLine.setAttribute('d', '');
        if (routeLineBg) routeLineBg.setAttribute('d', '');
    };

    // Back out of the starting place picker and into the origin list. Only
    // character creation ever gets here, and only while the origin it opened the
    // picker for can still be undone.
    Scene_Map.prototype.reopenCreationOriginStep = function () {
        const CCOrigin = window.CharacterCreationOrigin;
        if (!CCOrigin || !CCOrigin.canReopen || !CCOrigin.canReopen()) return;
        clearFastTravelData();
        this.closeTravelUIOverlay();
        // Failing here would leave the player on the map with no picker and no
        // origin list, so the picker is put back rather than abandoned.
        if (!CCOrigin.reopen()) {
            $gameTemp._openCharacterCreationTrainTravel = true;
            $gameTemp._characterCreationTravelMode = true;
        }
    };

    Scene_Map.prototype.closeTravelUIOverlay = function (skipSound) {
        if (!skipSound) SoundManager.playCancel();
        const overlay = document.getElementById('travel-overlay');
        if (overlay) {
            overlay.style.transition = "opacity 0.25s ease-out";
            overlay.style.opacity = "0";
            overlay.style.pointerEvents = "none";
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                // Clear the cache when the element is actually removed, so the
                // per-frame hooks keep the world frozen through the fade-out
                // exactly as the previous getElementById checks did.
                if (_travelOverlayEl === overlay) _travelOverlayEl = null;
            }, 250);
        } else {
            _travelOverlayEl = null;
        }

        // Remove W/S/Arrow key listener
        if (this._travelKeyHandler) {
            document.removeEventListener('keydown', this._travelKeyHandler);
            this._travelKeyHandler = null;
        }

        // Remove window-level drag listeners (prevents accumulation across opens)
        if (this._travelMouseMoveHandler) {
            window.removeEventListener('mousemove', this._travelMouseMoveHandler);
            this._travelMouseMoveHandler = null;
        }
        if (this._travelMouseUpHandler) {
            window.removeEventListener('mouseup', this._travelMouseUpHandler);
            this._travelMouseUpHandler = null;
        }

        $gamePlayer.setMovementLock(false);
        const data = getFastTravelData();
        data.isActive = false;

        // Lent out as a chooser and closed without a choice: whoever borrowed
        // the map is told so, once. A confirmed pick clears both handlers before
        // it closes, so this only ever fires on a real cancel.
        this._travelPickHandler = null;
        const back = this._travelPickCancel;
        this._travelPickCancel = null;
        if (back) back();
    };

    Scene_Map.prototype.closeFastTravelWindow = function () {
        this.closeTravelUIOverlay(true);
        this._fastTravelDestWindow.hide();
        this._fastTravelDestWindow.deactivate();
    };

    // The picker's own keyboard / pad / stick handling, pulled out of the map's
    // update so any scene that borrows the map can drive it too (see
    // FastTravelPicker below). Returns true when it has taken the frame.
    function updateTravelPickerInput(scene) {
        if (!_travelOverlayEl) return false;
        const self = scene;

        // The coordinate box takes every button while it is up: the list under
        // it must not scroll, and cancel closes the box rather than the map.
        const customModal = document.getElementById('travel-custom-modal');
        if (customModal && customModal.style.display === 'flex') {
            const nameInput = document.getElementById('travel-custom-name');
            if (nameInput && document.activeElement === nameInput) {
                // The name is being typed: only cancel is ours, and all it does
                // is hand the keyboard back.
                if (Input.isTriggered('cancel')) { nameInput.blur(); Input.clear(); }
                return true;
            }
            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                self.closeCustomPointModal();
                Input.clear();
                TouchInput.clear();
                return true;
            }
            if (Input.isRepeated('left'))  { self.stepCustomField(self._customPointField, -1); return true; }
            if (Input.isRepeated('right')) { self.stepCustomField(self._customPointField, 1); return true; }
            // The shoulders move ten at a time, so the far side of a 256 square
            // world is a few presses away rather than a hundred.
            if (Input.isRepeated('pageup'))   { self.stepCustomField(self._customPointField, -10); return true; }
            if (Input.isRepeated('pagedown')) { self.stepCustomField(self._customPointField, 10); return true; }
            if (Input.isRepeated('down')) { self.focusCustomField((self._customPointField + 1) % 3); return true; }
            if (Input.isRepeated('up'))   { self.focusCustomField((self._customPointField + 2) % 3); return true; }
            if (Input.isTriggered('ok')) {
                // OK on the name field is "let me type it"; anywhere else it
                // writes the square down.
                if (self._customPointField === 2 && nameInput) nameInput.focus();
                else self.saveCustomPoint();
                Input.clear();
                return true;
            }
            return true;
        }

        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            const confirmPanel = document.getElementById('panel-confirm');
            if (confirmPanel && confirmPanel.style.display !== 'none') {
                self.closeTravelConfirmModal();
            } else if (!($gameTemp && $gameTemp._characterCreationTravelMode)) {
                self.closeTravelUIOverlay();
            } else {
                // Creation's own picker: cancel is not "close", it is the
                // Back button drawn beside the list - the origin list again,
                // with the origin undone. Where there is no origin to go
                // back to it does nothing, as before.
                self.reopenCreationOriginStep();
            }
            Input.clear();
            TouchInput.clear();
            return true;
        }

        const listPanel = document.getElementById('panel-list');
        const confirmPanel2 = document.getElementById('panel-confirm');
        const isListVisible = listPanel && listPanel.style.display !== 'none';
        const isConfirmVisible = confirmPanel2 && confirmPanel2.style.display !== 'none';

        if (isListVisible) {
            const items = Array.from(document.querySelectorAll('.travel-dest-item'));
            if (items.length > 0) {
                // Only handle direction/ok via RMMZ Input for arrow keys and controller (not WASD)
                // WASD is handled by _travelKeyHandler which clears Input to prevent double-consumption
                // Don't call Input.clear() here: it resets the repeat timer
                // (_pressedTime) and gamepad state, so a held d-pad/stick reads
                // as a fresh press every frame and skips items. Let RMMZ's
                // built-in keyRepeatWait/keyRepeatInterval pace navigation.
                if (Input.isRepeated('down')) {
                    _travelSelectedIndex = (_travelSelectedIndex + 1) % items.length;
                    self.highlightTravelDestination(items[_travelSelectedIndex].getAttribute('data-name'));
                    return true;
                }
                if (Input.isRepeated('up')) {
                    _travelSelectedIndex = (_travelSelectedIndex - 1 + items.length) % items.length;
                    self.highlightTravelDestination(items[_travelSelectedIndex].getAttribute('data-name'));
                    return true;
                }
                if (Input.isTriggered('ok')) {
                    const destName = items[_travelSelectedIndex].getAttribute('data-name');
                    self.selectTravelDestination(destName);
                    Input.clear();
                    return true;
                }
            }
        }

        if (isConfirmVisible) {
            if (Input.isTriggered('ok')) {
                const confirmBtn = document.getElementById('sidebar-confirm-action-btn');
                if (confirmBtn) confirmBtn.click();
                Input.clear();
                return true;
            }
        }

        // Left analog stick pans the travel map when no panel has keyboard focus
        // (list up/down already drives selection via Input). Uses the shared
        // AnalogStickInput helper for raw, deadzoned axis values.
        if (!isListVisible && !isConfirmVisible && self._updateTravelTransform && window.AnalogStickInput) {
            const ax = AnalogStickInput.leftX();
            const ay = AnalogStickInput.leftY();
            if (ax !== 0 || ay !== 0) {
                const panSpeed = 14; // px/frame at full deflection
                self._travelPanX -= ax * panSpeed;
                self._travelPanY -= ay * panSpeed;
                self._updateTravelTransform();
            }
        }
        return false;
    }

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        if ($gameTemp && $gameTemp._openCharacterCreationTrainTravel) {
            $gameTemp._openCharacterCreationTrainTravel = false;
            // Character creation can request a specific network (e.g. the camper
            // or carsharing picker for the vehicle origins); default to train.
            const ccType = $gameTemp._characterCreationTravelType || 'train';
            $gameTemp._characterCreationTravelType = null;
            this.startFastTravel(ccType);
        }
        if (updateArrivalInput()) return;
        if (updateTravelPickerInput(this)) return;
        _Scene_Map_update.call(this);
    };

    // While the fast-travel map overlay is open, freeze the game world so no
    // events run, no time passes, and no encounter/battle can trigger under it.
    // Overlay navigation is handled in the update() override above (which runs
    // before this), so the picker stays interactive while the world is paused (#34).
    const _Scene_Map_updateMain_FTS = Scene_Map.prototype.updateMain;
    Scene_Map.prototype.updateMain = function () {
        if (_travelOverlayEl || _arrivalOverlayEl) {
            return;
        }
        _Scene_Map_updateMain_FTS.call(this);
    };

    const _Scene_Map_isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function () {
        if (_travelOverlayEl || _arrivalOverlayEl) {
            return false;
        }
        return _Scene_Map_isMenuEnabled.call(this);
    };

    //=============================================================================
    // Scene_Base modifications - Ensure timer persists across all scenes
    //=============================================================================
    const _Scene_Base_createWindowLayer_FTS = Scene_Base.prototype.createWindowLayer;
    Scene_Base.prototype.createWindowLayer = function () {
        _Scene_Base_createWindowLayer_FTS.call(this);
        this.createPersistentTravelTimer();
    };


    Scene_Base.prototype.createPersistentTravelTimer = function () {
        // Only create in scenes that don't already have their own timer window
        if (!(this instanceof Scene_Map)) {
            const data = getFastTravelData();
            if (data.timerActive) {
                // For car sharing, show timer in all scenes
                if (data.selectedTransport === 'carsharing' || data.selectedTransport === 'camper') {
                    const rect = new Rectangle(10, 0, 300, Window_Base.prototype.fittingHeight(3));
                    this._persistentTimerWindow = new Window_TravelTimer(rect);
                    this._persistentTimerWindow.refreshFromGameSystem();
                    this._persistentTimerWindow.show();
                    this.addWindow(this._persistentTimerWindow);
                }
                // For other transport types, don't show timer outside of travel map
            }
        }
    };
    //=============================================================================
    // Window_TravelTimer - Enhanced with persistent data sync
    //=============================================================================
    class Window_TravelTimer extends Window_Base {
        initialize(rect) {
            super.initialize(new Rectangle(0, 0, 0, 0));
            this.opacity = 0;
            this.visible = false;
            this._forceHide = true;

            const old = document.getElementById('html-travel-timer');
            if (old) old.remove();
            const el = document.createElement('div');
            el.id = 'html-travel-timer';
            el.className = 'html-parchment-overlay';
            this._htmlEl = el;
            document.body.appendChild(el);
        }

        destroy(options) {
            if (this._htmlEl && this._htmlEl.parentNode) this._htmlEl.parentNode.removeChild(this._htmlEl);
            this._htmlEl = null;
            super.destroy(options);
        }

        show() { this._forceHide = false; this.refresh(); }
        hide() { this._forceHide = true; if (this._htmlEl) this._htmlEl.style.display = 'none'; }

        refreshFromGameSystem() {
            const data = getFastTravelData();
            if (data.timerActive) { this._forceHide = false; this.refresh(); }
            else                  { this.hide(); }
        }

        refresh() {
            if (!this._htmlEl || this._forceHide) return;
            const data = getFastTravelData();
            if (!data.timerActive) { this._htmlEl.style.display = 'none'; return; }

            if (data.timerRemainingTime <= 0 && data.travelCompleted) {
                // The arrival itself is announced by the toast fired in
                // completeTravelTimer; the countdown box just goes away.
                this._htmlEl.style.display = 'none';
                return;
            }

            const t = data.timerRemainingTime;
            const mm = String(Math.floor(t / 60)).padStart(2, '0');
            const ss = String(t % 60).padStart(2, '0');
            let kmHtml = '';
            if (data.totalDistanceKm > 0 && data.timerDuration > 0) {
                const progress = (data.timerDuration - t) / data.timerDuration;
                const remKm = Math.max(0, Math.round(data.totalDistanceKm * (1 - progress)));
                kmHtml = `<div class="travel-timer-km">${T('FastTravel.kmRemaining', { km: remKm })}</div>`;
            }
            this._htmlEl.innerHTML =
                `<div class="travel-timer-label">${T('FastTravel.timeToArrival')}</div>` +
                `<div class="travel-timer-time">${mm}:${ss}</div>` +
                kmHtml;
            this._htmlEl.style.display = 'block';
            this._syncPos();
        }

        _syncPos() {
            const canvas = document.getElementById('gameCanvas');
            if (!canvas || !this._htmlEl) return;
            const r = canvas.getBoundingClientRect();
            const sx = r.width / Graphics.width, sy = r.height / Graphics.height;
            const s = this._htmlEl.style;
            s.left     = (r.left + 20 * sx) + 'px';
            s.top      = 'auto';
            s.bottom   = (window.innerHeight - r.bottom + 20 * sy) + 'px';
            s.padding  = `${Math.round(12 * sy)}px ${Math.round(20 * sx)}px`;  // i18n-ignore  css value
            s.minWidth = Math.round(200 * sx) + 'px';
            s.fontSize = Math.round(16 * sy) + 'px';
        }

        update() {
            super.update();
            if (Graphics.frameCount % 60 === 0) this.refreshFromGameSystem();
            if (this._htmlEl && this._htmlEl.style.display !== 'none') this._syncPos();
        }
    }

    //=============================================================================
    // Window_FastTravelDestination - Destination selection window
    //=============================================================================
    class Window_FastTravelDestination extends Window_Command {
        initialize(rect) {
            super.initialize(rect);
        }

        makeCommandList() {
            const data = getFastTravelData();
            const transportType = data.selectedTransport;
            if (!data.destinations) return;

            // Always use stored player coordinates from variables, not current position
            const playerX = $gameVariables.value(playerXVar);
            const playerY = $gameVariables.value(playerYVar);

            // Get current map name
            const currentMapName = $dataMapInfos[$gameMap.mapId()]?.name || '';

            // Filter destinations based on transport type requirements
            let filteredDestinations = data.destinations;

            // Off Earth the network is one stop and no filter below applies
            // (see openFastTravelUIOverlay, which does the same for the book).
            if (earthLost()) {
                const tower = data.destinations.find(d => d.name === OMEGA_TOWER_DEST);
                if (tower) {
                    this.addCommand(T('FastTravel.destCost',
                        { place: destLabel(tower.name), cost: '0.00', km: 0 }),
                        "destination", true, tower);
                }
                return;
            }

            if (transportType === 'bus' || transportType === 'train' || transportType === 'helicopter') {
                filteredDestinations = data.destinations.filter(dest => {
                    return servesTransport(dest, transportType);
                });
            }

            // Filter out destinations whose name is contained in current map name
            filteredDestinations = filteredDestinations.filter(dest => {
                return !currentMapName.toLowerCase().includes(dest.name.toLowerCase());
            });

            // If a destination whitelist is set (e.g. story mode station), apply it
            if (data.allowedDestinations && data.allowedDestinations.length > 0) {
                filteredDestinations = filteredDestinations.filter(dest =>
                    data.allowedDestinations.includes(dest.name)
                );
            }

            const destinationsWithDistance = filteredDestinations
                .map(dest => {
                    // Use stored coordinates for distance calculation
                    const worldDest = getWorldPosition(dest);
                    const distance = calculateDistance(playerX, playerY, worldDest.x, worldDest.y);
                    return { destination: dest, distance: distance };
                })
                .sort((a, b) => a.distance - b.distance);

            destinationsWithDistance.forEach(item => {
                const dest = item.destination;
                const distanceInTiles = item.distance;
                const distanceInKm = Math.round(distanceInTiles * 1);

                let text, enabled;

                if (transportType === 'carsharing' || transportType === 'camper') {
                    const fuelNeeded = calculateTravelCostFromDistance(distanceInTiles, transportType);
                    enabled = currentFuelForTransport(transportType) >= fuelNeeded;
                    text = T('FastTravel.destFuel', { place: destLabel(dest.name),
                        liters: fuelNeeded.toFixed(1), km: distanceInKm });
                } else {
                    const cost = calculateTravelCostFromDistance(distanceInTiles, transportType);
                    const costEuros = goldToEuros(cost);
                    enabled = $gameParty.gold() >= cost;
                    text = T('FastTravel.destCost', { place: destLabel(dest.name),
                        cost: costEuros, km: distanceInKm });
                }

                this.addCommand(text, "destination", enabled, dest);
            });
        }

        // Highlight destinations reachable by train: bigger and red
        drawItem(index) {
            const dest = this._list[index].ext;
            const hasTrain = !!(dest && dest.transportOverrides && dest.transportOverrides.train);
            const rect = this.itemLineRect(index);
            const align = this.itemTextAlign();
            this.resetTextColor();
            this.changePaintOpacity(this.isCommandEnabled(index));
            if (hasTrain) {
                this.contents.fontSize = $gameSystem.mainFontSize() + 8;
                this.changeTextColor(ColorManager.textColor(18)); // red
            }
            this.drawText(this.commandName(index), rect.x, rect.y, rect.width, align);
            if (hasTrain) {
                this.resetFontSettings();
            }
        }
    }



    // ===========================
    // Window_DestinationPicture
    // ===========================
    class Window_DestinationPicture extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._locationName = "";
            this._bitmap = null;
            this.opacity = 255;
            this.hide();
        }

        setLocation(locationName) {
            this._locationName = locationName;
            try {
                this.loadPicture();
                this.refresh();
            } catch (e) {
                console.warn('FastTravel: destination picture could not be drawn', locationName, e);
            }
            this.show();
        }

        loadPicture() {
            // Get picture filename from TRANSPORT_DESTINATIONS
            const destinationData = TRANSPORT_DESTINATIONS[this._locationName];
            const filename = destinationData && destinationData.picture ? destinationData.picture : this._locationName;

            // A destination whose plate was never drawn must cost the player
            // nothing: the file is loaded OUTSIDE ImageManager's cache, so a
            // missing one can never reach ImageManager.isReady and raise the
            // game-wide load error screen. It simply draws no picture.
            this._bitmap = null;
            try {
                const url = `img/pictures/${encodeURI(filename)}.png`;
                const bitmap = Bitmap.load(url);
                this._bitmap = bitmap;
                bitmap.addLoadListener(() => {
                    try {
                        if (bitmap.isError && bitmap.isError()) {
                            if (this._bitmap === bitmap) this._bitmap = null;
                        }
                        this.refresh();
                    } catch (e) {
                        console.warn('FastTravel: destination picture failed', filename, e);
                    }
                });
            } catch (e) {
                console.warn('FastTravel: destination picture missing', filename, e);
                this._bitmap = null;
            }
        }

        refresh() {
            this.contents.clear();

            if (!this._bitmap || (this._bitmap.isError && this._bitmap.isError())) {
                this._bitmap = null;
                return;
            }
            if (!this._bitmap.isReady()) {
                return;
            }

            // Draw the location name at the top
            this.drawLocationName();

            // Draw the picture
            this.drawPicture();
        }

        drawLocationName() {
            const textY = 10;
            this.contents.fontSize = 28;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(destLabel(this._locationName), 0, textY, this.contentsWidth(), 'center');
            this.resetTextColor();
        }

        drawPicture() {
            if (!this._bitmap || !this._bitmap.isReady()) {
                return;
            }

            // Calculate position to center the image
            const imageY = 50; // Below the title
            const availableWidth = this.contentsWidth();
            const availableHeight = this.contentsHeight() - imageY - 10;

            // Calculate scaling to fit within window while maintaining aspect ratio
            const scaleX = availableWidth / this._bitmap.width;
            const scaleY = availableHeight / this._bitmap.height;
            const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

            const scaledWidth = this._bitmap.width * scale;
            const scaledHeight = this._bitmap.height * scale;

            // Center the image
            const imageX = (availableWidth - scaledWidth) / 2;

            // Draw the bitmap
            const sx = 0;
            const sy = 0;
            const sw = this._bitmap.width;
            const sh = this._bitmap.height;

            this.contents.blt(this._bitmap, sx, sy, sw, sh, imageX, imageY, scaledWidth, scaledHeight);
        }

        update() {
            super.update();
            // This window doesn't consume input - it's overlay only
        }

        // Override to prevent input processing
        processHandling() {
            return false;
        }

        isOkEnabled() {
            return false;
        }

        isCancelEnabled() {
            return false;
        }
    }

    // ===========================
    // Scene_Map - Destination Picture Methods
    // ===========================
    Scene_Map.prototype.showDestinationPicture = function (locationName) {
        if (!this._destinationPictureWindow) {
            this.createDestinationPictureWindow();
        }
        this._destinationPictureWindow.setLocation(locationName);
    };

    Scene_Map.prototype.hideDestinationPicture = function () {
        if (this._destinationPictureWindow) {
            this._destinationPictureWindow.hide();
        }
    };

    Scene_Map.prototype.createDestinationPictureWindow = function () {
        // Create window in center of screen
        const width = 600;
        const height = 500;
        const x = (Graphics.boxWidth - width) / 2;
        const y = (Graphics.boxHeight - height) / 2;
        const rect = new Rectangle(x, y, width, height);

        this._destinationPictureWindow = new Window_DestinationPicture(rect);
        this.addWindow(this._destinationPictureWindow);
    };

    // Hook into Scene_Map.createAllWindows to ensure window is created
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        this.createDestinationPictureWindow();
    };


    //=============================================================================
    // window.FastTravelPicker - the map, lent out
    //
    // The travel map is the game's one picture of where the places are, and it
    // is worth more than one use. Anything that needs the player to POINT AT A
    // PLACE - the Liminal World free play, which asks where in the world to be
    // dropped - borrows it here instead of drawing a second map of its own.
    //
    // It is the same overlay: the same pins, the same list, the same drag and
    // zoom. What is taken out of it is the journey. Nothing is boarded, no fare
    // or fuel is charged and no travel timer starts; the chosen entry and the
    // world square it stands on are handed straight back to the caller.
    //
    // The overlay's own markup calls SceneManager._scene.<method>(), so every
    // method it needs is copied onto whatever scene borrows it.
    //=============================================================================
    const TRAVEL_PICKER_METHODS = [
        'openFastTravelUIOverlay', 'initTravelMapInteractions', 'adjustTravelZoom',
        'toggleTravelEditMode', 'printTravelCoordinates', 'highlightTravelDestination',
        'selectTravelDestination', 'closeTravelConfirmModal', 'reopenCreationOriginStep',
        'closeTravelUIOverlay'
    ];

    // A town founded mid-session is a new pin: the cache built before it was
    // signed for has to be dropped (Crafting/FurnitureSystem.js calls this).
    window.FastTravelSystem = window.FastTravelSystem || {};
    window.FastTravelSystem.refreshDestinations = refreshDestinationCache;

    window.FastTravelPicker = {
        // Teach a scene the map. Idempotent: a scene class is only ever taught
        // once, however many times it is pushed.
        install(sceneClass) {
            const proto = sceneClass && sceneClass.prototype;
            if (!proto || proto._travelPickerInstalled) return;
            for (const key of TRAVEL_PICKER_METHODS) proto[key] = Scene_Map.prototype[key];
            proto.updateTravelPickerInput = function () {
                return updateTravelPickerInput(this);
            };
            proto._travelPickerInstalled = true;
        },

        // True while the overlay is up, whoever it is up over.
        isOpen() { return !!_travelOverlayEl; },

        /**
         * Open the map as a chooser.
         *
         *   scene          the scene to draw it over (must have been install()ed)
         *   transportType  which network's labels to show ('walking', 'camper'...)
         *   onPick         (destination, {x, y}) - the entry and its world square
         *   onCancel       backed out of without choosing
         */
        open(scene, transportType, onPick, onCancel) {
            if (!scene || !scene.openFastTravelUIOverlay) return false;
            const data = getFastTravelData();
            data.selectedTransport = transportType || 'walking';
            data.destinations = getTeleportDestinations();
            data.allowedDestinations = null;
            data.isActive = true;
            scene._travelPickHandler = onPick || null;
            scene._travelPickCancel = onCancel || null;
            scene.openFastTravelUIOverlay();
            return true;
        },

        // Shut it, without telling the caller anything was cancelled: for a
        // scene being torn down under an open map.
        close(scene) {
            if (!scene || !scene.closeTravelUIOverlay) return;
            scene._travelPickHandler = null;
            scene._travelPickCancel = null;
            scene.closeTravelUIOverlay(true);
        }
    };

})();