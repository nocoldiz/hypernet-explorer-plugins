/*:
 * @plugindesc Merged Vehicle & Movement System v3.4
 * @author Omni-Lex (Merged)
 * @target MZ
 *
 * @param CamperSettings
 * @text Camper Settings
 * 
 * @param CamperMaxFuel
 * @parent CamperSettings
 * @desc Maximum fuel capacity for camper in liters
 * @type number
 * @min 1
 * @default 100
 *
 * @param CamperFuelRate
 * @parent CamperSettings
 * @desc Fuel consumption rate per second for camper
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 0.5
 *
 * @param CarSettings
 * @text Car Settings
 *
 * @param CarMaxFuel
 * @parent CarSettings
 * @desc Maximum fuel capacity for car in liters
 * @type number
 * @min 1
 * @default 60
 *
 * @param CarFuelRate
 * @parent CarSettings
 * @desc Fuel consumption rate per second for car
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 0.3
 *
 * @param GeneralSettings
 * @text General Settings
 *
 * @param SearchRadius
 * @parent GeneralSettings
 * @desc Maximum search radius for finding valid position
 * @type number
 * @min 1
 * @default 5
 *
 * @param MovementSettings
 * @text Movement Settings
 *
 * @param speedBoostMultiplier
 * @parent MovementSettings
 * @text Speed Boost Multiplier
 * @type number
 * @decimals 2
 * @min 1.00
 * @max 5.00
 * @default 1.5
 * @desc Movement speed multiplier when holding Shift (1.5 = 50% faster)
 *
 * @command summonCamper
 * @text Summon Camper
 * @desc Teleports the camper to a nearby location
 *
 * @command summonCar
 * @text Summon Car
 * @desc Teleports the car to a nearby location
 *
 * @command summonBike
 * @text Summon Bike
 * @desc Teleports the bike to a nearby location
 *
 * @command summonBoat
 * @text Summon Boat
 * @desc Teleports the boat to a nearby water tile
 *
 * @command summonBroom
 * @text Summon Flying Broom
 * @desc Teleports the flying broom to a nearby tile (indoors included)
 *
 * @command summonAirship
 * @text Summon Airship
 * @desc Teleports the airship (Starship) to a nearby location
 *
 * @command summonLastVehicle
 * @text Summon Last Used Vehicle
 * @desc Teleports the last vehicle driven (never the Starship or the Boat) to a nearby location. Used by roadside parking signs.
 *
 * @command teleportToVehicle
 * @text Teleport To Vehicle
 * @desc Teleports player to specified vehicle
 * @arg vehicleType
 * @type select
 * @option Camper
 * @value ship
 * @option Car
 * @value boat
 * @option Airship
 * @value airship
 * @default ship
 *
 * @command saveCamperAndTravel
 * @text Save Camper and Travel
 * @desc Save camper position and enter interior
 *
 * @command saveCarAndTravel
 * @text Save Car and Travel
 * @desc Save car position and enter interior
 *
 * @command saveAirshipAndTravel
 * @text Save Airship and Travel
 * @desc Save airship position and enter interior (map 721)
 *
 * @command returnToCamper
 * @text Return to Camper
 * @desc Return to last camper position
 *
 * @command returnToCar
 * @text Return to Car
 * @desc Return to last car position
 *
 * @command returnToAirship
 * @text Return to Airship
 * @desc Return to last airship position
 *
 * @command returnAndRideCamper
 * @text Return and Ride Camper
 * @desc Return and automatically ride camper
 *
 * @command returnAndRideCar
 * @text Return and Ride Car
 * @desc Return and automatically ride car
 *
 * @command returnAndRideAirship
 * @text Return and Ride Airship
 * @desc Return and automatically ride airship
 *
 * @command initializeCamperPosition
 * @text Initialize Camper Position
 * @desc Spawns camper at current location of event with no animation
 *
 * @command showTravelOptions
 * @text Show Travel Options (Interior)
 * @desc Opens the travel/utility menu while inside a vehicle interior. Options depend on which interior map the player is in.
 *
 * @command openVehicleMenu
 * @text Open Vehicle Menu
 * @desc Opens the vehicle action menu (drive / enter / fast travel / storage / repairs...).
 * @arg vehicleType
 * @text Vehicle
 * @type select
 * @option Auto (ridden, interior or nearby vehicle)
 * @value auto
 * @option Camper
 * @value ship
 * @option Car
 * @value boat
 * @option Airship
 * @value airship
 * @default auto
 *
 * @help
 * ============================================================================
 * Merged Vehicle & Movement System v3.1
 * ============================================================================
 * 
 * Combines vehicle system with custom movement controls:
 * - Multiple vehicles with fuel systems (Camper, Car, Bike, Airship)
 * - Custom autorun behavior (disabled on map 315)
 * - Speed boost with Shift key when on foot
 * - Vehicles move at their full speed on non-315 maps
 * - Map 315 special rules:
 *   - On foot: Speed locked at 4, no dash
 *   - In vehicle: Speed locked at 5
 * 
 * ============================================================================
 * CHANGELOG v3.4:
 * - Added: the Flying Broom, a fifth vehicle sharing the engine 'boat' slot with
 *   the Car, the Bike and the Boat. It is the Bike with the ground taken away:
 *   fuel-free, allowed indoors, and stowed back into the pack as item 168.
 * - Added: a `flying` config flag. A flying vehicle passes over every tile of
 *   every map (walls, water, cliffs and events alike), and lands on anything its
 *   rider could stand on, including rooftops (terrain tag 7), cliff tops
 *   (region 11) and bridges (region 12). It sets down where it hovers, the way
 *   the airship does, and is boarded again from the tile it landed on.
 * ============================================================================
 * CHANGELOG v3.3:
 * - Fixed: a vehicle left in one procedural biome no longer stands in the next
 *   one. Every biome shares map id 636, so a parked vehicle is now taken off the
 *   map whenever the loaded biome is not the one it was left in (world square,
 *   layer depth and alien/Earth realm all have to match).
 * - Added: a park record carries the world-map tile its map corresponds to, read
 *   from the map's <Coords x y> notetag, so parking on an authored map shows the
 *   vehicle at that world tile on map 315.
 * - Added: when several vehicles are parked on one tile, only the last one parked
 *   is drawn and interacting asks which one is meant.
 * - Fixed: entering a vehicle interior no longer overwrites the vehicle's parked
 *   tile with the player's; the way back out is its own record.
 * ============================================================================
 * CHANGELOG v3.2:
 * - Added: persistent fuel gauge HUD (top-left) while driving a fuel vehicle;
 *   removed the "What would you like to do?" prompt text from the menu.
 * - Added: interacting with a parked vehicle from outside opens the action menu
 *   with "Start driving" (mounts it); "Stop driving" only shows while driving.
 * - Added: per-vehicle usesFuel / canRefuelAtPump flags.
 * - Changed: the Bike is fuel-free (never consumes or runs out of fuel).
 * - Changed: the Starship can no longer be refueled at a gas pump.
 * - Changed: parked airship now blocks the player (cannot walk over it).
 * ============================================================================
 * CHANGELOG v3.1:
 * - Fixed: summon() calls getConfig() before null-checking vehicle
 * - Fixed: checkVehicleInteriorBlock crashes when config is null
 * - Fixed: _returnToVehicle flag mapping for non-Camper/Car vehicles
 * - Fixed: _handleAutoRide skips Bike/Airship vehicle flags
 * - Fixed: Desynchronized help text vs actual default speed values
 * - Refactored: Extracted sprite selection helper to eliminate 4x duplication
 * - Refactored: Extracted showLocalizedMessage helper for skipLocalization pattern
 * - Refactored: Consolidated duplicate speedBoostMultiplier param binding
 * - Refactored: Removed fragile private property mutations for out-of-fuel
 * - Refactored: Named constant for AUTO_RIDE_DELAY_FRAMES
 * - Refactored: Safer vehicle null-guard pattern in all hooks
 * ============================================================================
 */

(() => {
  'use strict';

  const PLUGIN_NAME = 'VehicleSystem';
  const params = PluginManager.parameters(PLUGIN_NAME);

  // Shared constants
  const AUTO_RIDE_DELAY_FRAMES = 15;

  // Global fuel-consumption scale. Lower = vehicles burn less fuel per step.
  // Now that fuel lives in its own per-vehicle store (window.VehicleFuel) instead
  // of a shared RPG Maker variable that other events silently drained, the rate is
  // raised so on-map driving actually consumes the tank at a meaningful pace.
  const FUEL_CONSUMPTION_MULTIPLIER = 0.03;

  // ============================================================================
  // Configuration
  // ============================================================================
  //
  // SPEED SETTINGS GUIDE:
  // All movement speeds are centralized in VehicleConfig.SPEED (around line 263)
  // Edit the values there to change speeds everywhere:
  //   - onFootBase: Walking speed when not holding Shift
  //   - onFootAutorunBoost: Speed added by autorun system
  //   - map315OnFootSpeed: Walking speed on map 315 (restricted area)
  //   - vehicleMaxSpeed: Vehicle speed on maps other than 315
  //   - map315VehicleSpeed: Vehicle speed on map 315
  //   - speedBoostMultiplier: Speed multiplier when holding Shift
  // ============================================================================

  class VehicleConfig {
    static CAMPER = {
      type: 'ship',
      name: 'Camper',  // i18n-ignore  vehicle id
      maxFuel: Number(params.CamperMaxFuel || 100),
      fuelRate: Number(params.CamperFuelRate || 0.5),
      interior: {
        mapId: 327,
        x: 8,
        y: 7
      },
      sprites: {
        normal: { name: 'Vehicles/!$RV', index: 2 },  // i18n-ignore  sprite asset path
        large: { name: 'Vehicles/!$RV_large', index: 2 }  // i18n-ignore  sprite asset path
      },
      refuelEvent: 104,
      storageEvent: 118,
      repairEvent: 120,
      usesFuel: true,
      canRefuelAtPump: true,
      // Ground vehicles spend less game-time per tile while driving over a
      // world-map road biome. The Airship (flies) and Boat (water-only) do not.
      roadBoost: true,
      // Item that proves party ownership of this vehicle (see Items.json
      // <category:Vehicles>). Owning the item is what makes the vehicle appear in
      // the Vehicles menu and drivable/summonable.
      summonItemId: 111
    };

    static AIRSHIP = {
      type: 'airship',
      name: 'Starship',  // i18n-ignore  vehicle id
      maxFuel: 200,
      fuelRate: 0.8,
      interior: {
        mapId: 721,
        x: 28,
        y: 10,
        direction: 8  // Facing right (6 = right, 2 = down, 4 = left, 8 = up)
      },
      sprites: {
        normal: { name: 'Vehicles/!$Airship', index: 0 },  // i18n-ignore  sprite asset path
        large: { name: 'Vehicles/!$Airship', index: 0 }  // i18n-ignore  sprite asset path
      },
      refuelEvent: 122,
      storageEvent: 123,
      repairEvent: 124,
      usesFuel: true,
      // The Starship cannot be refueled at a roadside gas pump.
      canRefuelAtPump: false,
      summonItemId: 166
    };

    static CAR = {
      type: 'boat',
      name: 'Car',  // i18n-ignore  vehicle id
      maxFuel: Number(params.CarMaxFuel || 60),
      fuelRate: Number(params.CarFuelRate || 0.3),
      interior: {
        mapId: 1094,
        x: 8,
        y: 8
      },
      sprites: {
        normal: { name: 'Vehicles/!$Car', index: 0 },  // i18n-ignore  sprite asset path
        large: { name: 'Vehicles/!$Car_large', index: 0 }  // i18n-ignore  sprite asset path
      },
      refuelEvent: 116,
      storageEvent: 119,
      repairEvent: 121,
      maxSpeed: 6,
      usesFuel: true,
      canRefuelAtPump: true,
      roadBoost: true,
      // The Car, Bike and Boat all share the single engine 'boat' vehicle slot;
      // boatSubType is the discriminator stored in $gameSystem._boatType.
      boatSubType: 'car',
      summonItemId: 164
    };

    static BIKE = {
      type: 'boat',
      name: 'Bike',  // i18n-ignore  vehicle id
      maxFuel: 30,
      fuelRate: 0.15,
      interior: {
        mapId: 0,
        x: 0,
        y: 0
      },
      sprites: {
        normal: { name: 'Vehicles/!$Bike', index: 0 },  // i18n-ignore  sprite asset path
        riding: { name: 'Vehicles/!$BikeRiding', index: 0 }  // i18n-ignore  sprite asset path
      },
      refuelEvent: 0,
      storageEvent: 0,
      repairEvent: 0,
      maxSpeed: 6.5,
      // The bike is human-powered: it never needs fuel.
      usesFuel: false,
      canRefuelAtPump: false,
      roadBoost: true,
      boatSubType: 'bike',
      summonItemId: 131
    };

    // The Flying Broom shares the engine 'boat' vehicle slot with the Car, the
    // Bike and the Boat (discriminated by $gameSystem._boatType === 'broom'). It
    // is the Bike with the ground taken away: human-powered, fuel-free, stowed
    // back into the pack as an item, and welcome indoors. What sets it apart is
    // the `flying` flag: a flying vehicle answers true to every tile on the map
    // and its rider passes through walls, cliffs, water and events alike (see
    // isFlyingConfig / isFlyingLandingTile). It lands on anything the party could
    // conceivably stand on, rooftops (terrain tag 7), cliff tops (region 11) and
    // bridges (region 12) included, which no other vehicle can reach.
    static BROOM = {
      type: 'boat',
      name: 'Broom',  // i18n-ignore  vehicle id
      maxFuel: 0,
      fuelRate: 0,
      interior: {
        mapId: 0,
        x: 0,
        y: 0
      },
      sprites: {
        normal: { name: 'Vehicles/!$BroomStick', index: 0 },  // i18n-ignore  sprite asset path
        riding: { name: 'Vehicles/!$BroomStickRiding', index: 0 },  // i18n-ignore  sprite asset path
        // A broom flown by someone whose class is `<Nature: Magical>` (a Witch,
        // a Nun, a Convoker) is drawn in the pointed hat and robes instead of
        // the hard hat: the leader's class dresses the whole party (see
        // ridingSprite()).
        ridingArcane: { name: 'Vehicles/!$BroomStickRidingArcane', index: 0 }  // i18n-ignore  sprite asset path
      },
      refuelEvent: 0,
      storageEvent: 0,
      repairEvent: 0,
      maxSpeed: 6.5,
      // Witchcraft is its own engine: the broom never needs fuel.
      usesFuel: false,
      canRefuelAtPump: false,
      // A road is no shortcut to something that never touches one.
      roadBoost: false,
      boatSubType: 'broom',
      // Ignores terrain, walls, water and events, and lands where it likes.
      flying: true,
      summonItemId: 168
    };

    // The Boat (inflatable dinghy) shares the engine 'boat' vehicle slot with the
    // Car and Bike (discriminated by $gameSystem._boatType === 'boat'). It needs no
    // fuel, has no interior/storage/repair, and can only travel on open water:
    // terrain tag 3 on the world (315) / procedural (636) maps, or region 99 anywhere.
    static BOAT = {
      type: 'boat',
      name: 'Boat',  // i18n-ignore  vehicle id
      maxFuel: 0,
      fuelRate: 0,
      interior: {
        mapId: 0,
        x: 0,
        y: 0
      },
      sprites: {
        normal: { name: 'Vehicles/!$Boat', index: 0 },  // i18n-ignore  sprite asset path
        large: { name: 'Vehicles/!$Boat_large', index: 0 }  // i18n-ignore  sprite asset path
      },
      refuelEvent: 0,
      storageEvent: 0,
      repairEvent: 0,
      maxSpeed: 5,
      // The boat is wind/paddle powered: it never needs fuel.
      usesFuel: false,
      canRefuelAtPump: false,
      boatSubType: 'boat',
      summonItemId: 167,
      // Where the crew sits. A vehicle that declares riderSeats has its party
      // drawn aboard it (see "Riders aboard" near the end of this file) instead
      // of vanishing into the hull the way the engine hides them.
      //
      // Offsets are in pixels from the sprite's anchor point - the middle of its
      // bottom edge - on the LARGE sheet (Vehicles/!$Boat_large, 231x216 per
      // frame), which is the sheet used everywhere except the world map. They
      // were measured off the three bench slats in each of the four direction
      // rows, listed bow first: the first seat is the one at the end the boat is
      // pointing (the bow ring marks it), so the party always faces the way it
      // is travelling. The fourth is the stern, one bench-space on, for the pet.
      // The fourth seat sits in the tapering end past the last bench, which is
      // where a dog rides anyway, so it is pulled a few pixels back towards the
      // middle to keep a sprite from hanging over the tip of the hull.
      riderSeats: {
        2: [[10, -77], [10, -104], [10, -132], [10, -152]],   // facing down: bow at the bottom
        4: [[-24, -64], [10, -64], [41, -64], [66, -64]],     // facing left: bow to the left
        6: [[34, -76], [0, -76], [-34, -76], [-60, -76]],     // facing right: bow to the right
        8: [[4, -130], [4, -103], [4, -77], [4, -57]]         // facing up: bow at the top
      }
    };

    static GENERAL = {
      searchRadius: Number(params.SearchRadius || 5),
      map315: {
        xVar: 43,
        yVar: 44,
        defaultX: 88,
        defaultY: 130
      }
    };

    // ========================================================================
    // Centralized Speed Settings - Edit these to adjust all movement speeds
    // ========================================================================
    static SPEED = {
      // ON FOOT SPEEDS (non-map 315)
      onFootBase: 4,                    // Base walking speed
      onFootAutorunBoost: 1,            // Boost from autorun (added to base)
      onFootMaxWithShift: null,         // Max speed with Shift (uses multiplier below)

      // ON FOOT SPEEDS (map 315 only)
      map315OnFootSpeed: 4,             // On foot walking speed on map 315

      // VEHICLE SPEEDS (non-map 315)
      vehicleMaxSpeed: 6,               // Default vehicle speed (per-vehicle maxSpeed overrides)
      bikeMaxSpeed: 6.5,                // Maximum speed for bike (see BIKE.maxSpeed)

      // VEHICLE SPEEDS (map 315 only)
      map315VehicleSpeed: 5,            // Vehicle speed on map 315

      // BOOST
      speedBoostMultiplier: Number(params.speedBoostMultiplier || 1.3)  // Shift key multiplier (#114: reduced from 1.5)
    };

    // The Mount is a living animal, not a machine, and it is the one vehicle
    // that can never be summoned: there is no item to own and no entry in the
    // Vehicles menu. The party rides whatever ridable companion it is already
    // travelling with, and it climbs on from the Pets page (see mountPet below).
    // A party MEMBER is never a mount: only records in the pet registry are
    // offered, and a person is an actor, not one of those.
    //
    // Mechanically it is the Bike with a pulse: it shares the engine's 'boat'
    // slot (discriminated by $gameSystem._boatType === 'mount'), needs no fuel,
    // has no interior, no storage and no workshop, and gains on a road the way
    // any other overland traveller does. Its sprite is not written here at all:
    // it is whatever sheet the companion being ridden wears (see mountSprite).
    static MOUNT = {
      type: 'boat',
      name: 'Mount',  // i18n-ignore  vehicle id
      maxFuel: 0,
      fuelRate: 0,
      interior: { mapId: 0, x: 0, y: 0 },
      // Filled in per ride from the companion's own sheet; the fallback keeps
      // selectVehicleSprite honest when nothing is being ridden.
      sprites: {
        normal: { name: '', index: 0 }
      },
      refuelEvent: 0,
      storageEvent: 0,
      repairEvent: 0,
      maxSpeed: 5.5,
      // A horse eats, it does not refuel.
      usesFuel: false,
      canRefuelAtPump: false,
      roadBoost: true,
      boatSubType: 'mount',
      // No summoning item: ownership is "a ridable companion is registered".
      summonItemId: 0,
      // The one flag every other branch keys off, so no literal 'Mount' string
      // has to be repeated to ask "is this the living one".
      mount: true
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Selects the appropriate sprite info for a vehicle config based on the current map.
   * On map 315, uses normal sprites; on other maps, prefers large sprites with fallback.
   * `driving` says whether the party is at the wheel of it right now, which only
   * the Starship cares about (see starshipSprite below).
   */
  function selectVehicleSprite(config, driving) {
    if (!config) return null;
    // A mount wears the companion's own sheet, at every size: an animal is not
    // drawn twice over for the world map the way a vehicle is.
    if (config.mount) return mountSprite();
    if (!config.sprites) return null;
    const isMap315 = $gameMap.mapId() === 315;
    if (config.type === 'airship') return starshipSprite(isMap315, !!driving);
    return isMap315 ? config.sprites.normal : (config.sprites.large || config.sprites.normal);
  }

  /**
   * The sheet a vehicle that is RIDDEN rather than sat in wears, or null when it
   * has none (a car is not ridden). A vehicle may declare a second riding sheet
   * for a magical rider, `ridingArcane`: the broom is flown in a witch's hat by
   * anyone whose class carries `<Nature: Magical>` and in a workman's hard hat
   * by everyone else. The PARTY LEADER decides it, not each rider, so a flight
   * reads as one party under one broom-master rather than a costume per body.
   */
  function ridingSprite(config) {
    if (!config || !config.sprites || !config.sprites.riding) return null;
    const arcane = config.sprites.ridingArcane;
    if (arcane && isMagicalLeader()) return arcane;
    return config.sprites.riding;
  }

  /** True when the party leader's class is tagged `<Nature: Magical>`. */
  function isMagicalLeader() {
    const leader = $gameParty && $gameParty.leader();
    const klass = (leader && typeof leader.currentClass === 'function') ? leader.currentClass() : null;
    if (!klass) return false;
    if (window.MagicNature && typeof window.MagicNature.isMagicalData === 'function') {
      return window.MagicNature.isMagicalData(klass);
    }
    return /<Nature:\s*Magical\s*>/i.test(klass.note || '');
  }

  // ============================================================================
  // The Starship, as a 2D map draws it
  // ============================================================================
  //
  // The Starship is the one vehicle in the game that is not the size of a
  // vehicle. It is a hull the party lives inside, generated per world by
  // GalaxySim_ShipModel, and no 48-pixel tile was ever going to hold it. So the
  // two kinds of map show two different things:
  //
  //   THE WORLD MAP (315) shows the ship itself, shrunk. A tile up there is a
  //   whole region, so a starship really does fit on one, and it is drawn from
  //   the actual 3D hull - rendered out to a directional character sheet, one
  //   row per facing, so it banks the way it is heading instead of wearing a
  //   stock airship sprite that looks nothing like the ship the player built.
  //
  //   EVERY OTHER MAP never draws the ship at all, because there is no drawing
  //   it: what is on the ground is its SHADOW, and the shadow is the ship. It
  //   lies across the map wherever the hull is overhead, moored or under way,
  //   turning with it as it flies (see Sprite_StarshipShadow). Moored, one more
  //   thing is added, and it is not a picture of the ship: the turning info icon,
  //   a mark on the ground standing where the party goes up and where the vehicle
  //   menu is opened from. Drawing a second, tiny hull under a shadow thirty
  //   tiles wide only made the ship look like a toy; a marker says "the way in is
  //   here" and lets the shadow be the ship. Take off and it goes, leaving nothing
  //   under way but the dark sliding over the fields. Land, and it is put back.
  //
  //   AND NOT INDOORS AT ALL. A starship is not brought into a house, a cave or
  //   a dungeon: it cannot be summoned onto an interior map and it cannot be
  //   flown onto one (see starshipBarredHere).

  // "Draw nothing." A blank sheet name is the engine's own way of saying it, and
  // it has to be said out loud rather than by declining to answer: the vehicle
  // keeps the last name it was given until something overwrites it, so a ship
  // taking off would otherwise fly away still wearing its own mooring mark.
  const STARSHIP_NO_SPRITE = { name: '', index: 0 };

  // The mark a moored ship leaves on the ground off the world map: the 16-frame
  // info icon, turned into a character sheet by UI/InfoIconRenderer.js, which
  // animates any character wearing this sheet. It is one tile wide, so it is
  // kept out of the oversized-sprite collision (see footprintRect) and the
  // party walks up to it rather than around a hull-sized box.
  const STARSHIP_MOORED_MARK = { name: 'Objects/info', index: 0 };  // i18n-ignore  sprite asset path

  // The name the world-map sheet is registered under. NOTHING of that name
  // exists in img/characters: the sheet is rendered out of the procedural hull
  // the first time it is asked for and handed to ImageManager under this name,
  // so every ordinary sprite path (Sprite_Character, the menu portrait) reads it
  // exactly like a file on disk. The `!$` prefix is what marks it as a
  // single-character 3x4 sheet.
  const STARSHIP_SHEET = 'Vehicles/!$Starship3D';  // i18n-ignore  virtual sprite name
  // One frame of that sheet, in pixels. Two world-map tiles and a bit: a region
  // up there is a country, and a starship standing over one reads as a starship
  // rather than as a speck.
  const STARSHIP_SHEET_FRAME = 112;

  // How far the ship's shadow reaches, in tiles, and how dark it lies. Tuned by
  // eye against the map it falls on: big enough that the thing overhead reads as
  // a starship, not so big that the screen simply goes dark. Change the number
  // and the shadow changes with it; nothing else is measured off it.
  const STARSHIP_SHADOW_TILES = 30;
  const STARSHIP_SHADOW_OPACITY = 96;
  // The silhouette is rendered once at this size and scaled from there.
  const STARSHIP_SHADOW_PX = 256;
  // The silhouette is drawn nose-down, so turning it to face the other three
  // ways is a plain 2D rotation of the same picture (PIXI turns clockwise).
  const STARSHIP_SHADOW_ROTATION = { 2: 0, 4: Math.PI / 2, 6: -Math.PI / 2, 8: Math.PI };

  function shipModel() {
    const GS = window.GalaxySim;
    return (GS && GS.ShipModel) || null;
  }

  /** Wraps a finished 2D canvas as an engine Bitmap, or null if there is none. */
  function bitmapFromCanvas(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return null;
    const bitmap = new Bitmap(canvas.width, canvas.height);
    bitmap.context.drawImage(canvas, 0, 0);
    if (bitmap._baseTexture && bitmap._baseTexture.update) bitmap._baseTexture.update();
    return bitmap;
  }

  // Both renders are kept until the player changes the ship's appearance, which
  // is exactly what ShipModel.revision counts. A failed render caches its own
  // failure too, so a machine that cannot render one is not asked every frame.
  let starshipSheetBmp = null;
  let starshipSheetRev = -1;
  let starshipShadowBmp = null;
  let starshipShadowRev = -1;

  function starshipSheetBitmap() {
    const model = shipModel();
    if (!model || typeof model.renderSheet !== 'function') return null;
    if (starshipSheetRev === model.revision) return starshipSheetBmp;
    starshipSheetRev = model.revision;
    let canvas = null;
    try {
      canvas = model.renderSheet(null, STARSHIP_SHEET_FRAME, STARSHIP_SHEET_FRAME);
    } catch (e) {
      canvas = null;
    }
    if (canvas && starshipSheetBmp &&
        starshipSheetBmp.width === canvas.width && starshipSheetBmp.height === canvas.height) {
      // Re-roll the hull from the appearance editor and the sheet's NAME does
      // not change, so a sprite already holding this bitmap would never think to
      // ask for it again. Repaint the one it is holding instead of handing out a
      // second one, and the ship on the map changes under the player's eyes.
      starshipSheetBmp.clear();
      starshipSheetBmp.context.drawImage(canvas, 0, 0);
      if (starshipSheetBmp._baseTexture && starshipSheetBmp._baseTexture.update) {
        starshipSheetBmp._baseTexture.update();
      }
    } else {
      starshipSheetBmp = bitmapFromCanvas(canvas);
    }
    // A new hull is a new outline, and the collision footprint is measured off
    // the pixels of the sheet under this name (see forgetFootprintSheet).
    forgetFootprintSheet(STARSHIP_SHEET);
    return starshipSheetBmp;
  }

  function starshipShadowBitmap() {
    const model = shipModel();
    if (!model || typeof model.renderTopShadow !== 'function') return null;
    if (starshipShadowRev === model.revision) return starshipShadowBmp;
    starshipShadowRev = model.revision;
    starshipShadowBmp = null;
    try {
      starshipShadowBmp = bitmapFromCanvas(model.renderTopShadow(null, STARSHIP_SHADOW_PX));
    } catch (e) {
      starshipShadowBmp = null;
    }
    return starshipShadowBmp;
  }

  /**
   * Which sheet the Starship wears here, or the blank one, which is what a ship
   * under way off the world map wears: only its shadow is on the ground. See the
   * section comment above; the one fallback is a machine with no working 3D,
   * which gets the drawn airship sprite on the world map rather than nothing.
   */
  function starshipSprite(isMap315, driving) {
    const sprites = VehicleConfig.AIRSHIP.sprites;
    if (isMap315) {
      return starshipSheetBitmap() ? { name: STARSHIP_SHEET, index: 0 } : sprites.normal;
    }
    return driving ? STARSHIP_NO_SPRITE : STARSHIP_MOORED_MARK;
  }

  /**
   * True where a starship has no business being: indoors. A house, a shop, a
   * cave, a dungeon, a sewer, another vehicle's cabin - mapCache.isInterior is
   * the game's one answer to that question, and it covers the procedural
   * interiors that share map 636's id as well as `<Interior>`-noted maps.
   */
  function starshipBarredHere() {
    if (typeof $gameMap === 'undefined' || !$gameMap) return false;
    return mapCache.isInterior($gameMap.mapId());
  }

  // The generated sheet is served from memory. Falling back to the drawn airship
  // sheet keeps the shape of the answer right (both are `!$` 3x4 sheets) on a
  // machine where the render did not come off.
  const _ImageManager_loadCharacter_VS = ImageManager.loadCharacter;
  ImageManager.loadCharacter = function (filename) {
    if (filename === STARSHIP_SHEET) {
      const bitmap = starshipSheetBitmap();
      if (bitmap) return bitmap;
      return _ImageManager_loadCharacter_VS.call(this, VehicleConfig.AIRSHIP.sprites.normal.name);
    }
    return _ImageManager_loadCharacter_VS.call(this, filename);
  };

  /**
   * Shows a localized (or skip-localized) message via the game message system.
   */
  function showLocalizedMessage(text) {
    window.skipLocalization = true;
    $gameMessage.add(text);
    window.skipLocalization = false;
  }

  /**
   * Refueling availability (replaces the old "Camper Refuel" common event 104).
   * Refueling is allowed when a "Fuel Pump" event is present on the current map,
   * or when standing over a City / Burg / Village biome tile on the world map (315).
   */
  function canRefuelHere() {
    const events = ($dataMap && $dataMap.events) ? $dataMap.events : [];
    if (events.some(e => e && e.name === 'Fuel Pump')) return true;  // i18n-ignore  event name

    if ($gameMap.mapId() === 315 && $gameSystem.getBiomeFromWorldCoordinates) {
      const biome = ($gameSystem.getBiomeFromWorldCoordinates($gamePlayer.x, $gamePlayer.y) || '').toLowerCase();
      if (biome.startsWith('city') || biome.startsWith('burg') || biome.startsWith('village')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Opens the refuel station UI in code, or reports that no pump is nearby.
   */
  function openVehicleRefuel() {
    if (!canRefuelHere()) {
      showLocalizedMessage(T('VehicleSystem.noGasPump'));
      return;
    }
    const scene = SceneManager._scene;
    if (scene && scene.showRefuelWindow) {
      $gamePlayer.setMovementLock(true);
      scene.showRefuelWindow();
    }
  }

  // What a vehicle is CALLED. config.name is an identifier (every branch below
  // and half this plugin switch on it), so display sites go through this
  // instead: Em's and Bubba's camper is The Beast, and it says so on the HUD,
  // in the action menu, in the vehicles pockets and on its own interior map
  // (CharacterCreationPresets.camperName, switches 48/49).
  function vehicleDisplayName(config) {
    if (!config) return '';
    // config.name is the id (matched by upgradeTypeForConfig, getReturnFlagName
    // and the config.name === 'X' guards); this is the only place it is shown.
    const label = T('VehicleSystem.vehicle.' + config.name);
    if (config.name !== 'Camper') return label;  // i18n-ignore  vehicle id
    return window.CharacterPresets?.camperName?.(label) ?? label;
  }

  // The same name for sentences that already supply the article ("The %1 is not
  // here"): the common noun lowercased, or the proper name with its own article
  // stripped, so The Beast never comes out as "the the beast".
  function vehicleNounName(config) {
    const shown = vehicleDisplayName(config);
    if (!config || shown === config.name) return String(shown).toLowerCase();
    return shown.replace(/^(the|la|il|lo)\s+/i, '');
  }

  // Maps a vehicle config to the VehicleUpgrades / maintenance type key.
  function upgradeTypeForConfig(config) {
    if (!config) return null;
    switch (config.name) {
      case 'Camper': return 'camper';  // i18n-ignore  vehicle id
      case 'Car': return 'car';  // i18n-ignore  vehicle id
      case 'Bike': return 'bike';  // i18n-ignore  vehicle id
      case 'Boat': return 'boat';  // i18n-ignore  vehicle id
      case 'Broom': return 'broom';  // i18n-ignore  vehicle id
      case 'Starship': return 'airship';  // i18n-ignore  vehicle id
      case 'Mount': return 'mount';  // i18n-ignore  vehicle id
      default: return null;
    }
  }

  // Effective max fuel for a config, accounting for the Expanded Tank upgrade.
  function configMaxFuel(config) {
    const base = config ? (config.maxFuel || 0) : 0;
    const type = upgradeTypeForConfig(config);
    if (type && window.VehicleUpgrades) return window.VehicleUpgrades.effectiveMaxFuel(type, base);
    return base;
  }

  // ============================================================================
  // Per-vehicle fuel store (window.VehicleFuel)
  // ============================================================================
  //
  // Fuel is NO LONGER kept in RPG Maker variables (the old Camper=65 / Car=71 /
  // Airship=146 / Bike=152 slots). Those were shared, unnamespaced globals: any
  // other event or plugin writing to variable 65 silently drained the camper's
  // tank, which is what emptied a full tank within a couple of metres.
  //
  // Instead each vehicle owns its own tank in a dedicated object on $gameSystem
  // (so it persists in saves) keyed by vehicle: 'camper' | 'car' | 'bike' |
  // 'airship'. Tanks are fully independent; the bike is human-powered and never
  // consumes or stores fuel. All fuel access across the vehicle plugins goes
  // through this one API.

  // The config a vehicle key names. The same keys address the fuel store, the
  // position store and the upgrade/maintenance types, so one lookup serves all.
  function configForVehicleKey(key) {
    switch (key) {
      case 'camper':  return VehicleConfig.CAMPER;
      case 'car':     return VehicleConfig.CAR;
      case 'bike':    return VehicleConfig.BIKE;
      case 'boat':    return VehicleConfig.BOAT;
      case 'broom':   return VehicleConfig.BROOM;
      case 'airship': return VehicleConfig.AIRSHIP;
      case 'mount':   return VehicleConfig.MOUNT;
      default:        return null;
    }
  }

  const VehicleFuel = {
    // Fuel key for a Game_Vehicle config (or null for unsupported types).
    keyForConfig(config) { return upgradeTypeForConfig(config); },

    // Backing store, lazily created so it also appears in older saves.
    _store() {
      if (!$gameSystem._vehicleFuelData) $gameSystem._vehicleFuelData = {};
      return $gameSystem._vehicleFuelData;
    },

    usesFuel(key) {
      const c = configForVehicleKey(key);
      return !!(c && c.usesFuel);
    },

    // Effective tank capacity (honors the Expanded Tank upgrade).
    max(key) {
      return configMaxFuel(configForVehicleKey(key));
    },

    // Current litres in the tank. Fuel-free vehicles (bike) always read as full.
    get(key) {
      if (!this.usesFuel(key)) return this.max(key);
      const store = this._store();
      if (typeof store[key] !== 'number' || !isFinite(store[key])) {
        // Fresh tank (new save, or first access): start full.
        store[key] = this.max(key);
      }
      return store[key];
    },

    // Set the tank level, clamped to [0, max]. No-op for fuel-free vehicles.
    set(key, litres) {
      if (!this.usesFuel(key)) return;
      const v = Math.max(0, Math.min(this.max(key), isFinite(litres) ? litres : 0));
      this._store()[key] = v;
    },

    // Add fuel (refuel), clamped to the tank capacity.
    add(key, amount) { this.set(key, this.get(key) + (Number(amount) || 0)); },

    // Burn fuel, never below empty. No-op for fuel-free vehicles.
    consume(key, amount) {
      if (!this.usesFuel(key) || !(amount > 0)) return;
      this.set(key, this.get(key) - amount);
    },

    // True while the tank has fuel (or the vehicle needs none).
    has(key) {
      if (!this.usesFuel(key)) return true;
      return this.get(key) > 0;
    }
  };
  window.VehicleFuel = VehicleFuel;

  // ============================================================================
  // Per-vehicle position store (window.VehiclePosition)
  // ============================================================================
  //
  // A vehicle's parked map + tile coordinates are NOT kept in RPG Maker variables
  // (the old Camper 63/64/67, Car 69/70/72, Airship 144/145/147, Bike 150/151/153
  // slots) and are NOT world data either: like fuel, each vehicle owns its parked
  // location in a dedicated object on $gameSystem, so it lives in the savegame
  // alone and never leaks into the shared world folder. Keys are the vehicle keys
  // 'camper' | 'car' | 'bike' | 'boat' | 'airship'.
  //
  // This store is the single source of truth for where a parked vehicle sits.
  // Scene_Map re-places every Game_Vehicle from it on map load
  // (VehicleManager.reconcileToStore) AND takes off the map any vehicle that
  // belongs elsewhere: the procedural map is one reused map id (636), so without
  // that eviction a camper left in one biome keeps standing on the next biome's
  // terrain (over open water, half of it not even solid) as the player walks on.
  //
  // A park record is { mapId, x, y, worldX, worldY, alien, order }:
  //   mapId/x/y      the canonical parked tile, on whatever map it was left on
  //                  (world map, a procedural biome, or any authored map)
  //   worldX/worldY  the world-map (315) tile that map corresponds to. This is
  //                  where the vehicle is shown on the world map, and for a
  //                  procedural park it also says WHICH biome it was left in
  //   alien/planet   parked on an alien landing grid, which reuses map 636 and the
  //                  world-coordinate variables as grid cells: such a park has no
  //                  world-map tile and is never shown on map 315. `planet` names
  //                  the world it was left on, so flying back to the same grid
  //                  square of the same planet finds it and every other planet
  //                  (which reuses the same small grid coordinates) does not
  //   layer          depth in the procedural layer stack, since one world square
  //                  generates a different map per cave floor / ocean depth
  //   interior       the procedural interior the park was made in ("" in the open
  //                  air). A dungeon, cellar or sewer is generated onto the same
  //                  map id, world square and layer as the field it was entered
  //                  from, so only this tells the two apart.
  //   order          park sequence, so when several vehicles share one tile the
  //                  last one parked there is the one drawn

  const VEHICLE_KEYS = ['camper', 'car', 'bike', 'boat', 'broom', 'airship', 'mount'];

  // Every vehicle key that shares the engine's single 'boat' slot, so only one
  // of them can be physically on a map at a time.
  const BOAT_SLOT_KEYS = ['car', 'bike', 'boat', 'broom', 'mount'];

  // Where a thing is, in world terms, is not this plugin's question to answer:
  // window.WorldMapTransfer (WorldMapReturn.js) owns the one rule for the world
  // map, the reused procedural map, its underground layers, its interiors, the
  // authored maps and an alien planet's landing grid alike. It loads after this
  // plugin, so it is always reached through this getter rather than captured.
  function transfer() { return window.WorldMapTransfer || null; }

  // The reused procedural map's id (owned by WorldMapReturn; 636 by default).
  function proceduralMapId() {
    return (window.WorldMapReturn && window.WorldMapReturn.procMapId) || 636;
  }

  // The world map's id (owned by WorldMapReturn; 315 by default).
  function worldMapId() {
    return (window.WorldMapReturn && window.WorldMapReturn.worldMapId) || 315;
  }

  // True while the loaded procedural map is an alien planet's landing grid.
  function isAlienSurfaceNow() {
    const wmt = transfer();
    if (wmt) return wmt.isAlienSurface();
    return !!(window.GalaxySim && window.GalaxySim.isAlienSurface &&
      window.GalaxySim.isAlienSurface());
  }

  // True while the loaded procedural map is a PROCEDURAL INTERIOR: a dungeon,
  // crypt, sewer, loot cellar, temple inside, cave den, patron vault, any cave,
  // or any layer below the surface. No vehicle is ever summoned into, parked in
  // or drawn inside one of these (ProceduralMapBiomeGenerator.js).
  function isProceduralInteriorNow() {
    const api = window.ProceduralInteriors;
    if (api && typeof api.isCurrent === 'function') return !!api.isCurrent();
    return typeof window.isProceduralInteriorMap === 'function' &&
      !!window.isProceduralInteriorMap();
  }

  // The name of the procedural interior the player is standing in, or "" in the
  // open air and off the procedural map. A park record carries this so a bike
  // left in the cellar and a camper left on the field above it can be told
  // apart: both are map 636, the same world square and the same layer depth.
  function currentProcInterior() {
    const wmt = transfer();
    if (wmt) return wmt.currentInterior();
    const api = window.ProceduralInteriors;
    return (api && typeof api.currentBiome === 'function' && api.currentBiome()) || '';
  }

  // How deep in the layer stack (cave floors, ocean depths) the loaded procedural
  // map is. One world square generates a different map per depth, so a vehicle
  // left on the surface must not turn up in the cave under it.
  function currentProcLayer() {
    const wmt = transfer();
    if (wmt) return wmt.currentLayer();
    const pg = $gameSystem._procGenData;
    return (pg && pg.biomeLayerStack && pg.biomeLayerStack.length) || 0;
  }

  // World-map (map 315) coordinates the CURRENT map corresponds to. These are the
  // coords a parked vehicle is shown at on the world map, and the key that decides
  // whether a proc-map (636) vehicle belongs to the biome currently loaded:
  //   - Map 315:  the tile IS the world coord (use the player's tile).
  //   - Proc map: the world tile the biome was generated from, taken from
  //               procGenData (authoritative) and falling back to Vars 43/44.
  //   - Any other map: its <Coords x y> notetag if present, else the last known
  //               player world coords (Vars 43/44), else the map315 default spawn.
  function currentWorldCoords() {
    const wmt = transfer();
    if (wmt) return wmt.currentWorldCoords();
    const xVar = VehicleConfig.GENERAL.map315.xVar;
    const yVar = VehicleConfig.GENERAL.map315.yVar;
    if ($gameMap.mapId() === 315) return { x: $gamePlayer.x, y: $gamePlayer.y };
    return {
      x: $gameVariables.value(xVar) || VehicleConfig.GENERAL.map315.defaultX,
      y: $gameVariables.value(yVar) || VehicleConfig.GENERAL.map315.defaultY
    };
  }

  /**
   * The world-map tile a given map corresponds to, for a map that is not
   * necessarily the one loaded (fast travel parks a vehicle on its destination
   * map before the transfer happens). Reads that map's <Coords x y> notetag
   * straight from its data file when it has to, so parking on a map tagged
   * <Coords 62 117> always puts the vehicle at 62,117 on the world map.
   */
  function worldCoordsForMap(mapId, x, y) {
    const wmt = transfer();
    if (wmt) return wmt.worldCoordsForMap(mapId, x, y);
    if (mapId === 315) return { x: Number(x) || 0, y: Number(y) || 0 };
    return currentWorldCoords();
  }

  /**
   * The full address a park record is made of: the tile, the world square it
   * stands on, and everything that tells one map-636 square from another (cave
   * depth, procedural interior, alien planet). Resolved through WorldMapTransfer
   * so a vehicle and the party answer the same question the same way.
   */
  function parkAddress(mapId, x, y, worldX, worldY) {
    const wmt = transfer();
    const loc = wmt
      ? wmt.locateOnMap(mapId, x, y)
      : { mapId, x, y, worldX: 0, worldY: 0, layer: 0, interior: '', alien: false, planet: '' };
    if (worldX !== undefined && worldY !== undefined) {
      loc.worldX = Number(worldX) || 0;
      loc.worldY = Number(worldY) || 0;
    } else if (Number(mapId) === worldMapId()) {
      // On the world map a tile IS a world square, so the park answers for
      // itself. Asked without world coords, locateOnMap() would hand back the
      // PARTY's square (where the player stands), which is only the same tile
      // while they are still aboard: a caller recording a vehicle the player
      // has just stepped away from would otherwise file it under the player's
      // new tile and the vehicle would be shown one step off, underneath them.
      loc.worldX = loc.x;
      loc.worldY = loc.y;
    }
    return loc;
  }

  // Park sequence counter, kept in the save so the "last one parked here" answer
  // survives reloading.
  function nextParkOrder() {
    const current = Number($gameSystem._vehicleParkOrder) || 0;
    $gameSystem._vehicleParkOrder = current + 1;
    return $gameSystem._vehicleParkOrder;
  }

  const VehiclePosition = {
    // Position key for a Game_Vehicle config (matches the fuel keys).
    keyForConfig(config) { return upgradeTypeForConfig(config); },

    // Backing store, lazily created so it also appears in older saves.
    _store() {
      if (!$gameSystem._vehiclePositionData) $gameSystem._vehiclePositionData = {};
      return $gameSystem._vehiclePositionData;
    },

    // The park record for a vehicle, or null if it was never parked.
    get(key) { return (key && this._store()[key]) || null; },

    // worldX / worldY are optional: when omitted they are resolved from the map
    // being parked on (its own tile on map 315, its <Coords> tag elsewhere), so
    // legacy callers that only pass a tile still get correct world coords.
    set(key, mapId, x, y, worldX, worldY) {
      if (!key) return;
      // There is no world map to park on once Earth has been struck out
      // (WorldMapTransfer.earthLost): the vehicle is left at the Omega Tower,
      // the only ground the party can reach it on.
      const WMT = window.WorldMapTransfer;
      if (Number(mapId) === 315 && WMT && WMT.earthLost && WMT.earthLost()) {
        const t = WMT.towerLanding();
        mapId = t.mapId; x = t.x; y = t.y; worldX = undefined; worldY = undefined;
      }
      const loc = parkAddress(Number(mapId) || 0, Number(x) || 0, Number(y) || 0, worldX, worldY);
      this._store()[key] = {
        mapId: loc.mapId, x: loc.x, y: loc.y,
        worldX: loc.worldX, worldY: loc.worldY,
        alien: loc.alien, planet: loc.planet, layer: loc.layer, interior: loc.interior,
        order: nextParkOrder()
      };
    },

    // The park record as a WorldMapTransfer address, so it can be named and
    // compared with the party's own position by the one service that knows how.
    location(key) {
      const p = this.get(key);
      if (!p) return null;
      return {
        mapId: p.mapId, x: p.x, y: p.y,
        worldX: this.worldX(key), worldY: this.worldY(key),
        layer: p.layer || 0, interior: p.interior || '',
        alien: !!p.alien, planet: p.planet || ''
      };
    },

    mapId(key) { const p = this.get(key); return p ? p.mapId : 0; },
    x(key)     { const p = this.get(key); return p ? p.x : 0; },
    y(key)     { const p = this.get(key); return p ? p.y : 0; },
    order(key) { const p = this.get(key); return (p && Number(p.order)) || 0; },
    // World coords for map-315 display. A legacy record with no world coords only
    // has a usable one when it was parked on the world map itself.
    worldX(key) {
      const p = this.get(key);
      if (!p) return 0;
      if (typeof p.worldX === 'number') return p.worldX;
      return p.mapId === 315 ? p.x : 0;
    },
    worldY(key) {
      const p = this.get(key);
      if (!p) return 0;
      if (typeof p.worldY === 'number') return p.worldY;
      return p.mapId === 315 ? p.y : 0;
    },

    // ------------------------------------------------------------------------
    // Where the PLAYER stood when they boarded / entered the vehicle. This is a
    // separate record on purpose: the parked tile belongs to the vehicle and must
    // stay exactly where the vehicle is, so the "step back out of the interior"
    // destination can no longer overwrite it.
    // ------------------------------------------------------------------------
    setEntry(key, mapId, x, y) {
      if (!key) return;
      if (!$gameSystem._vehicleEntryData) $gameSystem._vehicleEntryData = {};
      $gameSystem._vehicleEntryData[key] = {
        mapId: Number(mapId) || 0, x: Number(x) || 0, y: Number(y) || 0
      };
    },

    // The spot to drop the player when they leave the vehicle's interior: where
    // they got in, as long as the vehicle is still parked on that same map,
    // otherwise wherever the vehicle has since been taken.
    exit(key) {
      const entry = key && $gameSystem._vehicleEntryData && $gameSystem._vehicleEntryData[key];
      if (entry && entry.mapId && entry.mapId === this.mapId(key)) {
        return { mapId: entry.mapId, x: entry.x, y: entry.y };
      }
      return resolveReturnDestination(key);
    }
  };
  window.VehiclePosition = VehiclePosition;

  /**
   * Where a "return to / teleport to" command should drop the player for a parked
   * vehicle. The canonical park may be the transient procedural map (636), which
   * cannot be entered directly without regenerating its biome. In that case send
   * the player to map 315 at the vehicle's world coords instead, where the vehicle
   * is always shown (reconcileToStore) and can be boarded. Otherwise use the stored
   * map/tile as-is.
   */
  function resolveReturnDestination(key) {
    const pos = VehiclePosition.get(key);
    if (!pos) return { mapId: 315, x: 0, y: 0 };
    // Left on a planet: its world coordinates are a cell of that planet's landing
    // grid, not an Earth square, so map 315 is not where it is and sending the
    // party there would drop them in the sea. The tile only exists while that
    // planet's surface is the one loaded; anywhere else the party stays put and
    // has to fly back.
    if (pos.alien) {
      const tile = parkedTileOnCurrentMap(key);
      if (tile) return { mapId: $gameMap.mapId(), x: tile.x, y: tile.y };
      return { mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y };
    }
    if (pos.mapId === proceduralMapId() || !pos.mapId) {
      return { mapId: 315, x: VehiclePosition.worldX(key), y: VehiclePosition.worldY(key) };
    }
    return { mapId: pos.mapId, x: pos.x, y: pos.y };
  }

  /**
   * The tile a parked vehicle occupies on the map that is loaded right now, or
   * null when it is parked somewhere else. This is the one rule that decides
   * where a vehicle is visible:
   *   - map 315:    at its world coordinates, wherever it is actually parked
   *                 (an alien landing grid has no world tile, so it shows nothing)
   *   - proc map:   only when it was left in THIS biome (same world coordinates,
   *                 same realm, same layer, and the same procedural interior or
   *                 the open air alike), at the internal tile it was left on
   *   - any other:  only when it was parked on that very map
   */
  function parkedTileOnCurrentMap(key) {
    const pos = VehiclePosition.get(key);
    if (!pos || !pos.mapId) return null;

    const currentMap = $gameMap.mapId();
    const procMap = proceduralMapId();
    let tx, ty;

    if (currentMap === 315) {
      if (pos.alien) return null;
      tx = VehiclePosition.worldX(key);
      ty = VehiclePosition.worldY(key);
    } else if (currentMap === procMap) {
      if (pos.mapId !== procMap) return null;
      // Which realm the park is in: the same planet, the same depth in the layer
      // stack, and the same side of the hatch. The dungeon, the cellar and the
      // field they were entered from all answer to map 636, the same world square
      // and the same layer, so without the interior the camper left on the
      // surface would be re-placed in the middle of the dungeon. A record made
      // before these fields existed reads as the open surface of Earth.
      const wmt = transfer();
      if (wmt) {
        if (!wmt.sameRealm(VehiclePosition.location(key), wmt.locate())) return null;
      } else {
        if (!!pos.alien !== isAlienSurfaceNow()) return null;
        if ((pos.layer || 0) !== currentProcLayer()) return null;
        if ((pos.interior || '') !== currentProcInterior()) return null;
      }
      const wc = currentWorldCoords();
      if (VehiclePosition.worldX(key) !== wc.x || VehiclePosition.worldY(key) !== wc.y) return null;
      tx = pos.x; ty = pos.y;
    } else {
      if (pos.mapId !== currentMap) return null;
      tx = pos.x; ty = pos.y;
    }

    if (!(tx > 0 || ty > 0)) return null;
    if (!$gameMap.isValid(tx, ty)) return null;
    return { x: tx, y: ty };
  }

  // Set while THIS plugin re-places a vehicle from the store, so the setLocation
  // hook below does not write those moves straight back into the store (an
  // eviction to map 0 would otherwise be recorded as the vehicle's parked spot).
  let movingVehicleInternally = false;

  function moveVehicleInternally(vehicle, mapId, x, y) {
    movingVehicleInternally = true;
    try {
      vehicle.setLocation(mapId, x, y);
    } finally {
      movingVehicleInternally = false;
    }
  }

  /**
   * Re-decides which vehicle is drawn on each tile of the current map, with
   * `preferred` (the one just parked or just picked) always on top.
   */
  function restackCurrentMap(preferred) {
    const mapId = $gameMap.mapId();
    vehicleManager.applyStacking(
      vehicleManager.activeSlots().filter(slot => slot.vehicle._mapId === mapId),
      preferred
    );
  }

  /**
   * Opens the repair + upgrade workshop for a vehicle. Prefers the in-code
   * scene (VehicleSystemRepair) and falls back to the legacy common event.
   */
  function openVehicleMaintenance(config) {
    const type = upgradeTypeForConfig(config);
    if (type && window.VehicleMaintenance) {
      window.VehicleMaintenance.open(type);
    } else if (config && config.repairEvent) {
      $gameTemp.reserveCommonEvent(config.repairEvent);
    }
  }

  // Camper aquatic mode: extra fuel drain while crossing water.
  const AQUATIC_FUEL_MULTIPLIER = 1.5;

  /**
   * True when the tile is open water the camper should cross in aquatic mode.
   * Mirrors the project's two water markers: terrain tag 3 and region 99.
   * Region 10 (blocked water) is deliberately excluded.
   */
  function isWaterTileForVehicle(x, y) {
    if ($gameMap.regionId(x, y) === 10) return false;
    if ($gameMap.regionId(x, y) === 99) return true;
    return $gameMap.terrainTag(x, y) === 3;
  }

  /**
   * True when the world-map (315) tile at (x, y) is a river: either the biome
   * tile itself is a river marker ("River horizontal/vertical/cross", with no
   * land underneath) or a river is painted as an overlay over a land biome at
   * that column (see ProcGenUtils.classifyWorldColumn / the river-overlay
   * system). Rivers are the Boat's alone; every other vehicle is blocked from
   * them regardless of what their own terrain-tag/region rules would otherwise
   * allow.
   */
  function isWorldRiverTile(x, y) {
    if ($gameMap.mapId() !== 315) return false;
    if (!$gameMap.isValid(x, y)) return false;
    const utils = window.ProcGenUtils;
    if (!utils || !utils.classifyWorldColumn) return false;
    const cls = utils.classifyWorldColumn((z) => $gameMap.tileId(x, y, z));
    if (cls.riverTileId) return true;
    return typeof cls.biome === 'string' && cls.biome.toLowerCase().indexOf('river') === 0;
  }

  /**
   * True when the world-map column carries a bridge marker, i.e. it is a river
   * crossing rather than plain river. Map 315 paints its bridges as tile
   * annotations over the river overlay instead of stamping region 12, so the
   * region rule alone never sees them and every vehicle was turned back at the
   * water's edge. The column still reads as a river underneath (the Boat keeps
   * passing beneath the span), so this is a separate answer, not a change to
   * isWorldRiverTile.
   */
  function isWorldBridgeTile(x, y) {
    if ($gameMap.mapId() !== 315) return false;
    if (!$gameMap.isValid(x, y)) return false;
    const utils = window.ProcGenUtils;
    if (!utils || !utils.classifyWorldColumn) return false;
    const cls = utils.classifyWorldColumn((z) => $gameMap.tileId(x, y, z));
    return !!cls.bridge;
  }

  /**
   * True when the tile is open water in its own right: open-water terrain (tag 3)
   * but ONLY on the world map (315) and the procedural map (636), region 99 water
   * on ANY map, or a world-map river tile. Every other tile (dry land, blocked
   * water region 10, etc.) is not water.
   */
  function isBoatWaterTile(x, y) {
    if (!$gameMap.isValid(x, y)) return false;
    if ($gameMap.regionId(x, y) === 10) return false;
    if ($gameMap.regionId(x, y) === 99) return true;
    if (isWorldRiverTile(x, y)) return true;
    const mapId = $gameMap.mapId();
    if ((mapId === 315 || mapId === proceduralMapId()) && $gameMap.terrainTag(x, y) === 3) return true;
    return false;
  }

  // How far a bridge deck may run before the search for the water on the far
  // side of it gives up. No bridge in the project is anywhere near this wide.
  const BRIDGE_SPAN_LIMIT = 16;

  /**
   * True when the tile is a bridge deck (region 12) thrown ACROSS a waterway, so
   * the boat passes underneath it exactly as a swimmer does (the on/under layer
   * itself belongs to Map/MovementInteractionSystem.js). The water is painted
   * over with the deck's region, so the tile no longer reads as water at all,
   * which is what would otherwise dam a river at every bridge.
   *
   * The run of deck tiles the tile belongs to must come out on open water at
   * BOTH ends of one axis, so a dry overpass, a deck that merely touches a bank
   * and a bridge approached along its length are all still refused: only the
   * span actually laid over the water is navigable.
   */
  function isUnderBridgeCrossing(x, y) {
    if (!$gameMap.isValid(x, y) || $gameMap.regionId(x, y) !== 12) return false;
    const endsOnWater = (dx, dy) => {
      let cx = x;
      let cy = y;
      for (let i = 0; i < BRIDGE_SPAN_LIMIT; i++) {
        cx += dx;
        cy += dy;
        if (!$gameMap.isValid(cx, cy)) return false;
        if ($gameMap.regionId(cx, cy) !== 12) return isBoatWaterTile(cx, cy);
      }
      return false;
    };
    return (endsOnWater(-1, 0) && endsOnWater(1, 0)) ||
           (endsOnWater(0, -1) && endsOnWater(0, 1));
  }

  /**
   * True when the tile is navigable by the Boat (inflatable dinghy): open water,
   * or the underside of a bridge deck laid across it.
   */
  function isBoatPassableTile(x, y) {
    if (!$gameMap.isValid(x, y)) return false;
    if ($gameMap.regionId(x, y) === 10) return false;
    if (isBoatWaterTile(x, y)) return true;
    return isUnderBridgeCrossing(x, y);
  }

  /**
   * True when the given engine 'boat'-slot vehicle is currently the Boat subtype
   * (as opposed to the Car or the Bike, which share the same slot).
   */
  function isBoatSubType(vehicle) {
    return !!(vehicle && vehicle.isBoat() && $gameSystem._boatType === 'boat');
  }

  /**
   * True for a vehicle config that flies over the map instead of across it (the
   * Flying Broom). A flying vehicle ignores terrain, walls, water and events.
   */
  function isFlyingConfig(config) {
    return !!(config && config.flying);
  }

  /**
   * True when the given Game_Vehicle is currently a flying one. The Broom shares
   * the engine 'boat' slot, so what the slot stands for right now is the answer.
   */
  function isFlyingVehicle(vehicle) {
    return !!vehicle && isFlyingConfig(vehicleManager.getConfig(vehicle));
  }

  /** True while the player is riding a flying vehicle (the Broom). */
  function isPlayerRidingFlying() {
    if (!$gamePlayer || !$gamePlayer.isInVehicle() || $gamePlayer._vehicleGettingOff) return false;
    const vehicle = $gamePlayer.vehicle();
    return !!(vehicle && vehicle._driving && isFlyingVehicle(vehicle));
  }

  /**
   * Where a flying vehicle may set down. It flies over everything, so the only
   * question is what the rider can stand on once it stops, and the answer is
   * deliberately generous: anything the party could walk on, PLUS the three
   * layered surfaces nothing else in the game can reach, rooftops (terrain tag
   * 7, the "no furniture" marker the project puts on roofs), cliff tops
   * (region 11) and bridges (region 12). Region 10 stays a hard no-go, and an
   * off-map tile is never valid.
   */
  function isFlyingLandingTile(x, y) {
    if (!$gameMap.isValid(x, y)) return false;
    if ($gameMap.regionId(x, y) === 10) return false;
    const region = $gameMap.regionId(x, y);
    if (region === 11 || region === 12) return true;
    if ($gameMap.terrainTag(x, y) === 7) return true;
    // Any tile that can be walked off in at least one direction is standable.
    return [2, 4, 6, 8].some(d => $gameMap.isPassable(x, y, d));
  }

  // Ground vehicles burn less game-time per tile while over a world-map (315)
  // road biome. Their move speed is unchanged: a road saves time, not distance.
  // The Airship (flies) and Boat (water-only) are excluded via their config's
  // missing roadBoost flag.
  const ROAD_TIME_FACTOR = 0.5;  // fraction of the normal per-tile game-minutes on roads

  // Hard ceiling on the player's move speed. RPG Maker walks the player
  // 2^speed / 256 tiles per frame, so a speed of 8 covers a full tile in a
  // single frame: the player appears to jump straight over the tile they just
  // entered. Staying below 8 keeps every tile step visible.
  const MAX_MOVE_SPEED = 7;

  // True when the given world-map tile sits on a road biome.
  function isWorldRoadTile(x, y) {
    if ($gameMap.mapId() !== 315) return false;
    if (!$gameSystem.getBiomeFromWorldCoordinates) return false;
    const biome = ($gameSystem.getBiomeFromWorldCoordinates(x, y) || '').toLowerCase();
    return biome.includes('road');
  }

  // True when the player is driving a road-boostable vehicle over a world-map road.
  function isRidingOnWorldRoad() {
    if ($gameMap.mapId() !== 315 || !isPlayerRidingCustomVehicle()) return false;
    const config = vehicleManager.getConfig($gamePlayer.vehicle());
    if (!config || !config.roadBoost) return false;
    return isWorldRoadTile($gamePlayer.x, $gamePlayer.y);
  }

  /**
   * Safe region/terrain check for vehicle passability.
   * Returns true if the tile is blocked for vehicles.
   */
  function isVehicleBlockedTile(x, y, mapId) {
    const regionId = $gameMap.regionId(x, y);
    if (regionId === 10) return true;
    if (regionId === 4) return false;
    if (mapId === 315) {
      return $gameMap.terrainTag(x, y) === 3;
    }
    return false;
  }

  /**
   * Returns the first {x, y} tile in a (possibly unloaded) map with the given region ID,
   * or null if none found. Uses the synchronous mapCache loader.
   */
  function findRegionTile(mapId, regionId) {
    const mapData = mapCache.getMapData(mapId);
    if (!mapData) return null;
    const w = mapData.width;
    const h = mapData.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mapData.data[(5 * h + y) * w + x] === regionId) return { x, y };
      }
    }
    return null;
  }

  /**
   * Checks if a vehicle type uses our custom system (ship, boat, airship).
   */
  function isCustomVehicle(vehicle) {
    return vehicle && (vehicle.isShip() || vehicle.isBoat() || vehicle.isAirship());
  }

  /**
   * Checks if the player is riding a custom vehicle.
   */
  function isPlayerRidingCustomVehicle() {
    if (!$gamePlayer || !$gamePlayer.isInVehicle() || $gamePlayer._vehicleGettingOff) return false;
    const vehicle = $gamePlayer.vehicle();
    if (!vehicle || !vehicle._driving) return false;
    return isCustomVehicle(vehicle);
  }

  // ============================================================================
  // ConfigManager - Remove autorun from options
  // ============================================================================

  const _ConfigManager_makeData = ConfigManager.makeData;
  ConfigManager.makeData = function () {
    const config = _ConfigManager_makeData.call(this);
    delete config.alwaysDash;
    return config;
  };

  const _ConfigManager_applyData = ConfigManager.applyData;
  ConfigManager.applyData = function (config) {
    _ConfigManager_applyData.call(this, config);
    this.alwaysDash = true;
  };

  // ============================================================================
  // Window_Options - Remove autorun option
  // ============================================================================

  if (window.GameOptions) {
    const videoTab = window.GameOptions.tabs.find(t => t.id === 'video');
    if (videoTab) {
      videoTab.symbols = videoTab.symbols.filter(s => s !== 'alwaysDash');
    }
  } else {
    const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function () {
      _Window_Options_addGeneralOptions.call(this);
      this._list = this._list.filter(option => option.symbol !== 'alwaysDash');
    };
  }

  // ============================================================================
  // Cache Manager
  // ============================================================================

  class MapDataCache {
    constructor() {
      this._cache = new Map();
      this._interiorCache = new Map();
    }

    getMapData(mapId) {
      if (!this._cache.has(mapId)) {
        this._loadMapData(mapId);
      }
      return this._cache.get(mapId);
    }

    isInterior(mapId) {
      if (mapId === VehicleConfig.CAMPER.interior.mapId ||
        mapId === VehicleConfig.CAR.interior.mapId ||
        mapId === VehicleConfig.AIRSHIP.interior.mapId) {
        return true;
      }

      // Procedural interiors (dungeon, crypt, sewer, loot cellar, temple
      // inside, cave den, patron vault, caves, every layer below the surface)
      // are generated onto the SAME map id as the open-air square they were
      // entered from, so map 636's own <Exterior> note says nothing about
      // them. window.ProceduralInteriors is the only thing that can tell, and
      // it only ever speaks about the map currently loaded.
      if (mapId === $gameMap.mapId() && isProceduralInteriorNow()) return true;

      if (mapId === $gameMap.mapId() && $dataMap) {
        const note = $dataMap.note;
        if (note && note.includes('<Interior>') && !note.includes('<Covered>')) {
          return true;
        }
      }

      if (!this._interiorCache.has(mapId)) {
        const data = this.getMapData(mapId);
        const isInt = data && data.note &&
          data.note.includes('<Interior>') &&
          !data.note.includes('<Covered>');
        this._interiorCache.set(mapId, isInt);
      }
      return this._interiorCache.get(mapId);
    }

    _loadMapData(mapId) {
      if (!$dataMapInfos[mapId]) {
        this._cache.set(mapId, null);
        return;
      }

      try {
        const filename = 'Map%1.json'.format(mapId.padZero(3));
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'data/' + filename, false);
        xhr.overrideMimeType('application/json');
        xhr.send();

        if (xhr.status < 400) {
          this._cache.set(mapId, JSON.parse(xhr.responseText));
        } else {
          this._cache.set(mapId, null);
        }
      } catch (e) {
        this._cache.set(mapId, null);
      }
    }

    clear() {
      this._cache.clear();
      this._interiorCache.clear();
    }
  }

  const mapCache = new MapDataCache();

  // ============================================================================
  // Vehicle Manager
  // ============================================================================

  class VehicleManager {
    constructor() {
      this._initialized = false;
    }

    initialize() {
      if (this._initialized) return;

      if (!$gameSystem._boatType) $gameSystem._boatType = 'car';

      this._initializeVehicle(VehicleConfig.CAMPER);
      this._initializeVehicle(VehicleConfig.CAR);
      this._initializeVehicle(VehicleConfig.BIKE);
      this._initializeVehicle(VehicleConfig.BOAT);
      this._initializeVehicle(VehicleConfig.BROOM);
      this._initializeVehicle(VehicleConfig.MOUNT);
      this._initializeVehicle(VehicleConfig.AIRSHIP);

      this._initialized = true;
    }

    _initializeVehicle(config) {
      // Touch the fuel store so a fresh vehicle starts with a full tank. The
      // level lives in window.VehicleFuel (per-vehicle data), not a shared
      // RPG Maker variable. VehicleFuel.get() lazily fills the tank on first read.
      if (config.usesFuel) {
        VehicleFuel.get(VehicleFuel.keyForConfig(config));
      }

      // The first time a vehicle is seen it adopts wherever the engine has it,
      // i.e. its System.json start position, so a vehicle the player has never
      // parked still stands where the project put it. The Car, Bike and Boat
      // share one engine slot, so only the sub-type that slot currently stands
      // for may claim its tile; the other two start unplaced (tile 0,0).
      const posKey = VehiclePosition.keyForConfig(config);
      if (VehiclePosition.get(posKey)) return;

      const vehicle = this.getVehicle(config.type);
      const slotIsThisVehicle = config.type !== 'boat' || $gameSystem._boatType === config.boatSubType;
      const adopt = !!vehicle && vehicle._mapId > 0 && slotIsThisVehicle &&
        !mapCache.isInterior(vehicle._mapId);
      if (adopt) {
        VehiclePosition.set(posKey, vehicle._mapId, vehicle.x, vehicle.y);
      } else {
        VehiclePosition.set(posKey, 315, 0, 0);
      }
    }

    // The vehicle key the engine's single 'boat' slot currently stands for. The
    // Car, the Bike, the Boat and the Broom all share that one Game_Vehicle, so
    // only one of them can be physically present at a time.
    boatKey() {
      if ($gameSystem._boatType === 'bike') return 'bike';
      if ($gameSystem._boatType === 'boat') return 'boat';
      if ($gameSystem._boatType === 'broom') return 'broom';
      if ($gameSystem._boatType === 'mount') return 'mount';
      return 'car';
    }

    // Points the shared 'boat' slot at another sub-type (car / bike / boat),
    // rebuilding the config and sprite that go with it. Never runs while the
    // player is riding that slot.
    setBoatKey(key) {
      const config = configForVehicleKey(key);
      if (!config || config.type !== 'boat') return;
      if ($gameSystem._boatType === config.boatSubType) return;
      const vehicle = this.getVehicle('boat');
      if (vehicle && $gamePlayer.isInVehicle() && $gamePlayer.vehicle() === vehicle) return;
      $gameSystem._boatType = config.boatSubType;
      if (!vehicle) return;
      vehicle._config = this.getConfig(vehicle);
      const sprite = selectVehicleSprite(config);
      if (sprite) {
        vehicle._characterName = sprite.name;
        vehicle._characterIndex = sprite.index;
      }
    }

    // The three engine slots and the vehicle key each of them stands for now.
    activeSlots() {
      return [
        { key: 'camper', vehicle: this.getVehicle('ship') },
        { key: 'airship', vehicle: this.getVehicle('airship') },
        { key: this.boatKey(), vehicle: this.getVehicle('boat') }
      ].filter(slot => !!slot.vehicle);
    }

    // Re-place every parked (non-ridden) vehicle on the current map from the
    // internal position store, and take off the map any vehicle parked elsewhere
    // or standing in an interior. Placing is what stops a memorized vehicle
    // vanishing across map changes; evicting is what stops a vehicle left in one
    // procedural biome from standing in the middle of the next one, or inside
    // the dungeon generated under it (all biomes share map id 636).
    //
    // Interiors are no longer skipped: they need the eviction most of all, since
    // a dungeon is generated over the very square the camper was parked on. Only
    // the Bike can hold a park record made indoors, so only the Bike is placed
    // there; everything else fails parkedTileOnCurrentMap and is taken off.
    reconcileToStore() {
      const currentMap = $gameMap.mapId();
      const ridden = $gamePlayer.isInVehicle() ? $gamePlayer.vehicle() : null;
      const boatVehicle = this.getVehicle('boat');

      // Decide which of the shared-slot vehicles the 'boat' slot should be:
      // the one parked here, most recently parked first. With none parked here the
      // slot keeps its current sub-type and is simply taken off the map below.
      if (boatVehicle && ridden !== boatVehicle) {
        const parkedHere = BOAT_SLOT_KEYS
          .filter(key => ownsVehicleKey(key) && !!parkedTileOnCurrentMap(key))
          .sort((a, b) => VehiclePosition.order(b) - VehiclePosition.order(a));
        if (parkedHere.length > 0) this.setBoatKey(parkedHere[0]);
      }

      const placed = [];
      this.activeSlots().forEach(({ key, vehicle }) => {
        vehicle._vsStacked = false;
        // Never move the vehicle the player is currently riding.
        if (vehicle === ridden) return;

        // A vehicle the party does not own is not theirs to find standing about:
        // only what the Vehicles menu lists is ever placed on a map. The engine
        // starts the Camper and the Starship on map 315 out of System.json, which
        // used to put both of them on the world map for a party that owns neither.
        const tile = ownsVehicleKey(key) ? parkedTileOnCurrentMap(key) : null;
        if (!tile) {
          // Parked elsewhere: map id 0 makes Game_Vehicle.pos() stop matching, so
          // the vehicle is neither drawn nor solid nor boardable here. The store
          // still holds its real spot, and it is put back when the player returns.
          if (vehicle._mapId === currentMap) moveVehicleInternally(vehicle, 0, vehicle.x, vehicle.y);
          return;
        }

        if (vehicle._mapId !== currentMap || vehicle.x !== tile.x || vehicle.y !== tile.y) {
          moveVehicleInternally(vehicle, currentMap, tile.x, tile.y);
        }
        placed.push({ key, vehicle });
      });

      this.applyStacking(placed);
    }

    // Several vehicles can be parked on one tile (most easily on the world map,
    // where every park is shown at its world coordinates). Only the last one
    // parked there is drawn; the others stay boardable through the chooser.
    // `preferred` is the Game_Vehicle that must be the one drawn regardless of
    // park order, which is how the vehicle picked out of the chooser comes to the top.
    applyStacking(placed, preferred) {
      const shown = new Map();  // "x,y" -> the slot currently drawn there
      placed.forEach(slot => {
        const tileKey = `${slot.vehicle.x},${slot.vehicle.y}`;
        const rival = shown.get(tileKey);
        if (!rival) {
          slot.vehicle._vsStacked = false;
          shown.set(tileKey, slot);
          return;
        }
        const slotWins = slot.vehicle === preferred ? true
          : rival.vehicle === preferred ? false
            : VehiclePosition.order(slot.key) > VehiclePosition.order(rival.key);
        const winner = slotWins ? slot : rival;
        const loser = slotWins ? rival : slot;
        winner.vehicle._vsStacked = false;
        loser.vehicle._vsStacked = true;
        shown.set(tileKey, winner);
      });
      placed.forEach(slot => slot.vehicle.refresh());
    }

    getVehicle(type) {
      return $gameMap.vehicle(type);
    }

    getConfig(vehicle) {
      if (!vehicle) return null;
      if (vehicle.isShip()) return VehicleConfig.CAMPER;
      if (vehicle.isBoat()) {
        if ($gameSystem._boatType === 'bike') return VehicleConfig.BIKE;
        if ($gameSystem._boatType === 'boat') return VehicleConfig.BOAT;
        if ($gameSystem._boatType === 'broom') return VehicleConfig.BROOM;
        if ($gameSystem._boatType === 'mount') return VehicleConfig.MOUNT;
        return VehicleConfig.CAR;
      }
      if (vehicle.isAirship()) return VehicleConfig.AIRSHIP;
      return null;
    }

    /**
     * Returns the flag name prefix for auto-ride/spawn-after-transfer.
     * Returns null if the config/vehicle type is not supported for return commands.
     */
    getReturnFlagName(config) {
      if (!config) return null;
      if (config.type === 'ship') return 'Camper';  // i18n-ignore  vehicle id
      if (config.type === 'boat') return 'Car';  // i18n-ignore  vehicle id
      if (config.type === 'airship') return 'Starship';  // i18n-ignore  vehicle id
      return null;
    }

    // Only write when the value actually changed: Game_Variables.onChange
    // triggers a full map event-page refresh, which is expensive per frame.
    _setVarIfChanged(variableId, value) {
      if ($gameVariables.value(variableId) !== value) {
        $gameVariables.setValue(variableId, value);
      }
    }

    savePosition(vehicle) {
      const config = this.getConfig(vehicle);
      if (!config) return;
      const key = VehiclePosition.keyForConfig(config);
      const mapId = $gameMap.mapId();

      // Store the canonical parked tile on WHATEVER map we are on (world map 315,
      // the reused procedural map 636, or any regular map) together with the world
      // coordinates that map corresponds to. The world coords let the vehicle be
      // shown on map 315 no matter where it is actually parked, and (for the proc
      // map) identify which biome it was left in so it is only re-placed in that
      // biome, at the same internal tile, when that world square is revisited.
      // The world square of the VEHICLE's tile, not of the party: on the world
      // map they part company the instant the player steps out of the vehicle,
      // and the "stop driving" flow saves the park again after that step.
      const wc = worldCoordsForMap(mapId, vehicle.x, vehicle.y);
      VehiclePosition.set(key, mapId, vehicle.x, vehicle.y, wc.x, wc.y);
      // The vehicle just parked is the one drawn where it stands, so it comes out
      // on top of anything already parked on that tile.
      if (!vehicle._driving) restackCurrentMap(vehicle);

      // Vars 43/44 are the PLAYER's world coordinates (shared across systems),
      // not vehicle-owned data; keep them in sync while driving on the world map.
      if (mapId === 315) {
        this._setVarIfChanged(VehicleConfig.GENERAL.map315.xVar, vehicle.x);
        this._setVarIfChanged(VehicleConfig.GENERAL.map315.yVar, vehicle.y);
      }
    }

    summon(vehicleType, subType) {
      // A starship is not called down into a house, a cave or a dungeon. Checked
      // here rather than at each caller so a plugin command cannot go round it.
      if (vehicleType === 'airship' && starshipBarredHere()) {
        showLocalizedMessage(T('VehicleSystem.noStarshipIndoors'));
        return;
      }
      // A mount is not called out of thin air: it is a companion already
      // walking with the party, and it is climbed onto from the Pets page.
      if (subType === 'mount') return;
      if (vehicleType === 'boat') {
        $gameSystem._boatType = subType || 'car';
      }

      const vehicle = this.getVehicle(vehicleType);
      if (!vehicle) return;

      const config = this.getConfig(vehicle);

      // Update graphic before teleport
      if (vehicle.refresh) vehicle.refresh();

      const pos = PositionFinder.findNearPlayer(vehicle);
      if (pos) {
        vehicle.setLocation($gameMap.mapId(), pos.x, pos.y);
        this.savePosition(vehicle);
        this._playTeleportEffect(vehicle);
      } else {
        showLocalizedMessage(T('VehicleSystem.noValidPosition'));
      }
    }

    _playTeleportEffect(/*target*/) {
      AudioManager.playSe({
        name: "Teleport",
        pan: 0,
        pitch: 100,
        volume: 90
      });
      // Animation removed from summoning as per request
      // $gameTemp.requestAnimation([target], 52);
    }
  }

  // ============================================================================
  // Position Finder
  // ============================================================================

  class PositionFinder {
    static findNearPlayer(character) {
      // Summoned IN FRONT of whoever asked for it. The search used to try south,
      // west, east and north in that fixed order whatever way the player was
      // facing, so a vehicle called up while walking north appeared behind them
      // and had to be walked round.
      return this.findValidPosition($gamePlayer.x, $gamePlayer.y, character,
        $gamePlayer.direction());
    }

    static findValidPosition(targetX, targetY, character, facing) {
      const adjacent = this._checkAdjacent(targetX, targetY, character, facing);
      if (adjacent) return adjacent;
      return this._spiralSearch(targetX, targetY, character);
    }

    // The tile in front comes first, then the two beside, then the one behind:
    // a vehicle should appear where you are looking, and only end up behind you
    // when there is nowhere else for it to stand.
    static _facingOrder(facing) {
      const BEHIND = { 2: 8, 4: 6, 6: 4, 8: 2 };
      const BESIDE = { 2: [4, 6], 4: [2, 8], 6: [2, 8], 8: [4, 6] };
      if (!BEHIND[facing]) return [2, 4, 6, 8];
      return [facing, ...BESIDE[facing], BEHIND[facing]];
    }

    static _checkAdjacent(x, y, character, facing) {
      const directions = this._facingOrder(facing);
      for (const d of directions) {
        const nx = $gameMap.roundXWithDirection(x, d);
        const ny = $gameMap.roundYWithDirection(y, d);
        if (this._isValidPosition(nx, ny, character)) {
          return { x: nx, y: ny };
        }
      }
      return null;
    }

    static _spiralSearch(centerX, centerY, character) {
      const maxRadius = VehicleConfig.GENERAL.searchRadius;

      for (let radius = 2; radius <= maxRadius; radius++) {
        for (let i = 0; i < radius * 2; i++) {
          const positions = [
            { x: centerX - radius + i, y: centerY - radius },
            { x: centerX + radius, y: centerY - radius + i },
            { x: centerX + radius - i, y: centerY + radius },
            { x: centerX - radius, y: centerY + radius - i }
          ];

          for (const pos of positions) {
            const x = $gameMap.roundX(pos.x);
            const y = $gameMap.roundY(pos.y);
            if (this._isValidPosition(x, y, character)) {
              return { x, y };
            }
          }
        }
      }
      return null;
    }

    static _isValidPosition(x, y, character) {
      if (!character) return false;
      // The airship (Starship) flies over everything, so any in-bounds tile is a
      // valid park/return spot. Region 10 stays blocked to avoid hard no-go zones (#135).
      if (character.isAirship && character.isAirship()) {
        if (!$gameMap.isValid(x, y)) return false;
        return $gameMap.regionId(x, y) !== 10;
      }
      // The Broom flies, so it is summoned and parked wherever it could land.
      if (isFlyingVehicle(character)) {
        return isFlyingLandingTile(x, y);
      }
      // A bridge deck is drivable by everything that rolls or floats (see
      // Game_Vehicle.isMapPassable), so it is a park and return spot for them
      // too: a vehicle left on a bridge is still on it when the party comes
      // back, instead of being evicted the next time the map loads.
      if ($gameMap.isValid(x, y) &&
        ($gameMap.regionId(x, y) === 12 || isWorldBridgeTile(x, y))) return true;
      // The Boat can only ever park/spawn on navigable water (see isBoatPassableTile).
      if (isBoatSubType(character)) {
        return isBoatPassableTile(x, y);
      }
      if (character.isShip() || character.isBoat()) {
        if (isVehicleBlockedTile(x, y, $gameMap.mapId())) return false;
        // World-map rivers are the Boat's alone; Car/Bike/Camper never park there.
        if (isWorldRiverTile(x, y)) return false;
        if ($gameMap.regionId(x, y) === 4) return true;
        if ($gameMap.terrainTag(x, y) === 3) return false;
        return $gameMap.isPassable(x, y, 0);
      }
      return $gameMap.isPassable(x, y, 0);
    }

    // Top-left of a 4x4 block of tiles that are all valid for both the player and
    // the given vehicle, so the player has room and the bike can sit beside them.
    // Returns null if no such block exists.
    static findPassable4x4(vehicle) {
      const w = $gameMap.width();
      const h = $gameMap.height();
      const blockValid = (ox, oy) => {
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 4; dx++) {
            const x = ox + dx, y = oy + dy;
            if (!$gameMap.isPassable(x, y, 0)) return false;
            if (vehicle && !this._isValidPosition(x, y, vehicle)) return false;
          }
        }
        return true;
      };
      // Random scan first (variety), then a deterministic sweep as a fallback.
      for (let i = 0; i < 500; i++) {
        const ox = Math.floor(Math.random() * (w - 4));
        const oy = Math.floor(Math.random() * (h - 4));
        if (blockValid(ox, oy)) return { x: ox, y: oy };
      }
      for (let oy = 0; oy <= h - 4; oy++) {
        for (let ox = 0; ox <= w - 4; ox++) {
          if (blockValid(ox, oy)) return { x: ox, y: oy };
        }
      }
      return null;
    }

    // Random tile the given vehicle could sit on, scanning the current map.
    // Falls back to the world-map default spawn if no tile is found.
    static findRandomValidTile(character) {
      const w = $gameMap.width();
      const h = $gameMap.height();
      for (let i = 0; i < 500; i++) {
        const x = Math.floor(Math.random() * w);
        const y = Math.floor(Math.random() * h);
        if (this._isValidPosition(x, y, character)) {
          return { x, y };
        }
      }
      return { x: VehicleConfig.GENERAL.map315.defaultX, y: VehicleConfig.GENERAL.map315.defaultY };
    }
  }

  // ============================================================================
  // Fuel System
  // ============================================================================

  class FuelSystem {
    static consumeFuel(vehicle, deltaTime) {
      const config = vehicleManager.getConfig(vehicle);
      if (!config || !config.usesFuel) return;

      const key = VehicleFuel.keyForConfig(config);
      if (!VehicleFuel.has(key)) return;

      let consumption = config.fuelRate * deltaTime * FUEL_CONSUMPTION_MULTIPLIER;

      if ($gameMap.mapId() !== 315) {
        consumption /= 25;
      }

      // Camper in aquatic mode (crossing water) burns fuel faster.
      if (vehicle.isShip() && vehicle._isAquatic) {
        consumption *= AQUATIC_FUEL_MULTIPLIER;
      }

      VehicleFuel.consume(key, consumption);
    }

    static refuel(vehicle, amount) {
      const config = vehicleManager.getConfig(vehicle);
      if (!config) return;
      VehicleFuel.add(VehicleFuel.keyForConfig(config), amount);
    }

    static hasFuel(vehicle) {
      const config = vehicleManager.getConfig(vehicle);
      if (!config) return false;
      return VehicleFuel.has(VehicleFuel.keyForConfig(config));
    }

    static getFuel(vehicle) {
      const config = vehicleManager.getConfig(vehicle);
      if (!config) return 0;
      return VehicleFuel.get(VehicleFuel.keyForConfig(config));
    }
  }

  // ============================================================================
  // Vehicle Speed
  // ============================================================================

  /**
   * Speed a vehicle travels at: its own maxSpeed if it declares one, otherwise
   * the shared default. Vehicles reach this speed immediately.
   */
  function vehicleSpeedFor(vehicle) {
    const config = (vehicle && vehicle._config) || vehicleManager.getConfig(vehicle);
    return (config && config.maxSpeed) ? config.maxSpeed : VehicleConfig.SPEED.vehicleMaxSpeed;
  }

  // ============================================================================
  // Vehicle Extensions
  // ============================================================================

  const vehicleManager = new VehicleManager();

  const _Game_Vehicle_initialize = Game_Vehicle.prototype.initialize;
  Game_Vehicle.prototype.initialize = function (type) {
    _Game_Vehicle_initialize.call(this, type);

    if (this.isShip() || this.isBoat() || this.isAirship()) {
      this._config = vehicleManager.getConfig(this);
      this._fuelTimer = 0;
    }
  };

  // Anything that moves a vehicle (an event's "Set Vehicle Location", the fast
  // travel network, the 3D driving scene) parks it: record it, so the position
  // store stays the one description of where every vehicle is and reconcileToStore
  // can never evict a vehicle somebody else legitimately placed.
  const _Game_Vehicle_setLocation = Game_Vehicle.prototype.setLocation;
  Game_Vehicle.prototype.setLocation = function (mapId, x, y) {
    _Game_Vehicle_setLocation.call(this, mapId, x, y);
    if (movingVehicleInternally || this._driving) return;
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
    if (!mapId) return;
    const config = vehicleManager.getConfig(this);
    const key = VehiclePosition.keyForConfig(config);
    if (!key) return;
    const pos = VehiclePosition.get(key);
    if (pos && pos.mapId === mapId && pos.x === x && pos.y === y) return;
    VehiclePosition.set(key, mapId, x, y);
  };

  const _Game_Vehicle_update = Game_Vehicle.prototype.update;
  Game_Vehicle.prototype.update = function () {
    _Game_Vehicle_update.call(this);

    // Track whether the camper is currently sitting on a water tile so the
    // sprite (half-size) and fuel drain (1.5x) can react to aquatic travel.
    if (this.isShip()) {
      this._isAquatic = !mapCache.isInterior($gameMap.mapId()) &&
        isWaterTileForVehicle(this.x, this.y);
    }

    if (isPlayerRidingCustomVehicle() && $gamePlayer.vehicle() === this) {

      // Force speed on map 315
      const speed = $gameMap.mapId() === 315
        ? VehicleConfig.SPEED.map315VehicleSpeed
        : vehicleSpeedFor(this);
      if ($gamePlayer._moveSpeed !== speed) {
        $gamePlayer.setMoveSpeed(speed);
      }

      // Fuel consumption is handled per-step in Game_Player.increaseSteps below.
    }
  };

  const _Game_Vehicle_updateMove = Game_Vehicle.prototype.updateMove;
  Game_Vehicle.prototype.updateMove = function () {
    _Game_Vehicle_updateMove.call(this);

    if (isPlayerRidingCustomVehicle() &&
      $gamePlayer.vehicle() === this &&
      this.isMoving() &&
      (this._lastSavedX !== this.x || this._lastSavedY !== this.y)) {
      this._lastSavedX = this.x;
      this._lastSavedY = this.y;
      vehicleManager.savePosition(this);
    }
  };

  const _Game_Player_increaseSteps_VS = Game_Player.prototype.increaseSteps;
  Game_Player.prototype.increaseSteps = function () {
    _Game_Player_increaseSteps_VS.call(this);
    if (isPlayerRidingCustomVehicle()) {
      const vehicle = this.vehicle();
      if (vehicle) FuelSystem.consumeFuel(vehicle, 1);
    }
  };

  const _Game_Vehicle_updateAnimation = Game_Vehicle.prototype.updateAnimation;
  Game_Vehicle.prototype.updateAnimation = function () {
    if (isPlayerRidingCustomVehicle() && $gamePlayer.vehicle() === this) {
      if (this.isMoving()) {
        _Game_Vehicle_updateAnimation.call(this);
      } else {
        this._animationCount = 0;
        this._pattern = 1;
      }
    } else {
      _Game_Vehicle_updateAnimation.call(this);
    }
  };

  const _Game_Vehicle_isMapPassable = Game_Vehicle.prototype.isMapPassable;
  Game_Vehicle.prototype.isMapPassable = function (x, y, d) {
    if (this.isShip() || this.isBoat() || this.isAirship()) {
      if (!FuelSystem.hasFuel(this)) return false;

      const x2 = $gameMap.roundXWithDirection(x, d);
      const y2 = $gameMap.roundYWithDirection(y, d);

      // The Broom flies, and it flies indoors too: nothing on the map stops it,
      // so the only question left is whether the tile exists at all. This sits
      // above the interior rule below because a corridor wall is exactly the
      // sort of thing it is meant to go straight over.
      if (isFlyingVehicle(this)) return $gameMap.isValid(x2, y2);

      // A bridge deck (region 12) is always drivable. Everything that rolls or
      // floats crosses a bridge, indoors or out, whatever the tile's own
      // passability, its terrain tag or the water rules below would otherwise
      // say about it: a bridge exists to be crossed, and a deck that turned a
      // vehicle back would cut the road it carries in half. The two that fly
      // are the exceptions that never needed the rule, the Broom answered just
      // above and the Starship a few lines down.
      if (!this.isAirship() &&
        ($gameMap.regionId(x2, y2) === 12 || isWorldBridgeTile(x2, y2))) return true;

      // Indoors (a house, a dungeon, a cave) every vehicle simply goes wherever
      // the player could walk: the outdoor terrain-tag whitelist below describes
      // open country and would refuse every corridor tile. Every vehicle but
      // the Starship, which is not brought indoors at all - it answers false to
      // every interior tile, so one somehow left standing in a cave cannot be
      // flown a step further into it.
      if (mapCache.isInterior($gameMap.mapId())) {
        if (this.isAirship()) return false;
        if (isVehicleBlockedTile(x2, y2, $gameMap.mapId())) return false;
        return $gameMap.isPassable(x2, y2, this.reverseDir(d));
      }

      // The Starship is an airship: it flies over everything (blocked tiles and
      // water alike) outdoors. Only fuel and the interior-map rule above restrict it (#156).
      if (this.isAirship()) return true;

      // The Boat (dinghy) is water-only: passability is fully defined by
      // isBoatPassableTile (terrain 3 on the world/procedural maps, region 99
      // anywhere, or a world-map river tile).
      if (isBoatSubType(this)) return isBoatPassableTile(x2, y2);

      // World-map rivers are the Boat's alone: every other non-flying vehicle
      // (Car, Bike, Camper) is refused, whatever else the tile would allow.
      if (isWorldRiverTile(x2, y2)) return false;

      // Camper enters aquatic mode automatically: open water is passable for it
      // (region 10 stays blocked, handled inside isWaterTileForVehicle).
      if (this.isShip() && isWaterTileForVehicle(x2, y2)) return true;

      if (isVehicleBlockedTile(x2, y2, $gameMap.mapId())) return false;

      if ($gameMap.mapId() !== 315) {
        const terrainTag = $gameMap.terrainTag(x2, y2);
        if (this.isShip()) {
          if (![0, 1, 2, 5, 6].includes(terrainTag)) return false;
        } else {
          if (![1, 5, 2, 6, 7].includes(terrainTag)) return false;
        }
      }

      return $gameMap.isPassable(x2, y2, this.reverseDir(d));
    }
    return _Game_Vehicle_isMapPassable.call(this, x, y, d);
  };

  // ============================================================================
  // Flight (the Broom)
  // ============================================================================
  //
  // The engine knows exactly one flying vehicle, the airship, and it is welded to
  // the 'airship' slot: isInAirship() is what makes the player pass through the
  // map, land in place rather than a step forward, and board from the tile they
  // are standing on. The Broom is a 'boat'-slot vehicle, so each of those three
  // behaviours is granted to it here instead of being inherited.

  // Passing through the world is what "flying" means. The engine hands the
  // airship its through-flag in updateVehicleGetOn; the Broom takes it the same
  // way, and getOffVehicle clears it again on landing (core behaviour).
  const _Game_Player_updateVehicleGetOn = Game_Player.prototype.updateVehicleGetOn;
  Game_Player.prototype.updateVehicleGetOn = function () {
    const wasGettingOn = this._vehicleGettingOn;
    _Game_Player_updateVehicleGetOn.call(this);
    if (wasGettingOn && !this._vehicleGettingOn && isPlayerRidingFlying()) {
      this.setThrough(true);
    }
  };

  // A flying vehicle sets down where it hovers, on any tile the rider could
  // stand on: rooftops, cliff tops and bridges included (isFlyingLandingTile).
  const _Game_Vehicle_isLandOk = Game_Vehicle.prototype.isLandOk;
  Game_Vehicle.prototype.isLandOk = function (x, y, d) {
    if (isFlyingVehicle(this)) return isFlyingLandingTile(x, y);
    return _Game_Vehicle_isLandOk.call(this, x, y, d);
  };

  // Landing is the airship's dismount, not the boat's: the party steps off onto
  // the tile the broom is hovering over instead of being pushed one tile forward
  // (which is the whole point of being able to set down on a roof).
  const _Game_Player_getOffVehicle = Game_Player.prototype.getOffVehicle;
  Game_Player.prototype.getOffVehicle = function () {
    if (!isPlayerRidingFlying()) return _Game_Player_getOffVehicle.call(this);

    const vehicle = this.vehicle();
    if (!vehicle.isLandOk(this.x, this.y, this.direction())) {
      showLocalizedMessage(T('VehicleSystem.cannotLandHere'));
      return false;
    }
    this._followers.synchronize(this.x, this.y, this.direction());
    vehicle.getOff();
    this.setTransparent(false);
    this._vehicleGettingOff = true;
    const onFootSpeed = $gameMap.mapId() === 315
      ? VehicleConfig.SPEED.map315OnFootSpeed
      : VehicleConfig.SPEED.onFootBase;
    this.setMoveSpeed(onFootSpeed);
    this.setThrough(false);
    this.makeEncounterCount();
    this.gatherFollowers();
    return true;
  };

  const _Game_Player_updateVehicleGetOff_VS = Game_Player.prototype.updateVehicleGetOff;
  Game_Player.prototype.updateVehicleGetOff = function () {
    const wasGettingOff = this._vehicleGettingOff;
    _Game_Player_updateVehicleGetOff_VS.call(this);
    if (wasGettingOff && !this._vehicleGettingOff) {
      if ($gameMap.mapId() === 315) {
        this.setMoveSpeed(VehicleConfig.SPEED.map315OnFootSpeed);
      } else {
        this.setMoveSpeed(VehicleConfig.SPEED.onFootBase);
      }
    }
  };

  // Aquatic camper sprite: crop to the top half so it looks half-submerged while
  // crossing water, the same way the player sprite is cropped when swimming.
  const _Sprite_Character_updateFrame_VS = Sprite_Character.prototype.updateFrame;
  Sprite_Character.prototype.updateFrame = function () {
    _Sprite_Character_updateFrame_VS.call(this);
    const ch = this._character;
    if (ch instanceof Game_Vehicle && ch.isShip() && ch._isAquatic) {
      const frame = this._frame;
      if (frame.width > 0 && frame.height > 0) {
        this.setFrame(frame.x, frame.y, frame.width, Math.floor(frame.height / 2));
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Time at the wheel trains the matching specialization (SpecializationMenu.js).
  // Every vehicle teaches its own handling; the road vehicles also share the
  // general Car Driving skill, so a camper crew is not learning from scratch
  // when it takes the car out.
  // ---------------------------------------------------------------------------
  // Taking a boat out is three skills at once: working the hull, working the
  // wind, and knowing where you are once the shore is behind you.
  // i18n-ignore-start  Specialization.json ids awarded per ridden vehicle
  const RIDE_SPECS = {
    camper: ["RV Driving", "Car Driving"],
    car: ["Car Driving"],
    bike: ["Cycling"],
    boat: ["Boat Piloting", "Sailing", "Celestial Navigation"],
    airship: ["Aircraft Piloting", "Celestial Navigation"],
    mount: ["Horse Riding", "Animal Training"],
  };
  // i18n-ignore-end
  const RIDE_STEPS_PER_POINT = 50;

  const _Game_Player_increaseSteps = Game_Player.prototype.increaseSteps;
  Game_Player.prototype.increaseSteps = function () {
    _Game_Player_increaseSteps.call(this);
    if (!window.SpecializationXP || !window.VehicleUpgrades) return;
    const type = window.VehicleUpgrades.currentRiddenType();
    const specs = type && RIDE_SPECS[type];
    if (!specs) { this._rideSpecSteps = 0; return; }
    this._rideSpecSteps = (this._rideSpecSteps || 0) + 1;
    if (this._rideSpecSteps < RIDE_STEPS_PER_POINT) return;
    this._rideSpecSteps = 0;
    // Only the member at the wheel is learning to drive or to sail; the rest of
    // the party is asleep in the back (VehicleCrew.js names the driver, and
    // returns undefined for the vehicles nobody drives for anybody else - the
    // Bike, the Broom, the Starship - which keeps the party-wide split).
    const opts = window.VehicleCrew?.xpOptions?.();
    specs.forEach((name) => window.SpecializationXP.award(name, 1, opts));
  };

  const _Game_Vehicle_getOn = Game_Vehicle.prototype.getOn;
  Game_Vehicle.prototype.getOn = function () {
    const result = _Game_Vehicle_getOn.call(this);

    if (this.isShip() || this.isBoat() || this.isAirship()) {
      vehicleManager.savePosition(this);

      // Remember where the player got in, so leaving the interior puts them back
      // there. This is deliberately NOT the vehicle's parked position: that one
      // belongs to the vehicle and must keep pointing at the tile it stands on.
      const config = vehicleManager.getConfig(this);
      if (config && !mapCache.isInterior($gameMap.mapId()) && $gameMap.mapId() !== proceduralMapId()) {
        VehiclePosition.setEntry(VehiclePosition.keyForConfig(config), $gameMap.mapId(), $gamePlayer.x, $gamePlayer.y);
      }

      this._fuelTimer = 0;

      if ($gameMap.mapId() === 315) {
        $gamePlayer.setMoveSpeed(VehicleConfig.SPEED.map315VehicleSpeed);
        $gamePlayer._dashing = true;
      } else {
        $gamePlayer.setMoveSpeed(vehicleSpeedFor(this));
      }
    }

    return result;
  };

  const _Game_Vehicle_getOff = Game_Vehicle.prototype.getOff;
  Game_Vehicle.prototype.getOff = function () {
    if (this.isShip() || this.isBoat() || this.isAirship()) {
      // A vehicle being stepped out of is standing on the map that is loaded,
      // whichever map it was boarded on. Claim it before the refresh below
      // decides whether to draw the parked sprite.
      if (this._driving) this._mapId = $gameMap.mapId();
      vehicleManager.savePosition(this);
      $gamePlayer._dashing = false;
    }

    const result = _Game_Vehicle_getOff.call(this);

    // Restore the parked sprite. While driving, refresh() blanks _characterName
    // (so the ridden graphic hides under the player); nothing else refreshes the
    // vehicle when the player stops on the same map, so without this the parked
    // vehicle turns invisible the instant the player stops driving.
    if (this.isShip() || this.isBoat() || this.isAirship()) {
      this.refresh();
      // The vehicle just left is the one on show where it now stands.
      restackCurrentMap(this);
    }

    // Set appropriate on-foot speed based on map
    if ($gameMap.mapId() === 315) {
      $gamePlayer.setMoveSpeed(VehicleConfig.SPEED.map315OnFootSpeed);
    } else {
      $gamePlayer.setMoveSpeed(VehicleConfig.SPEED.onFootBase);
    }

    $gamePlayer.followers().show();
    $gamePlayer.refresh();

    return result;
  };

  // ============================================================================
  // Player Movement Extensions
  // ============================================================================

  // Check for autorun enabled based on map
  Game_Player.prototype.isAutorunEnabled = function () {
    return $gameMap.mapId() !== 315;
  };

  // Block walking over a parked airship (default only checks boat/ship)
  const _Game_CharacterBase_isCollidedWithVehicles =
    Game_CharacterBase.prototype.isCollidedWithVehicles;
  Game_CharacterBase.prototype.isCollidedWithVehicles = function (x, y) {
    if (_Game_CharacterBase_isCollidedWithVehicles.call(this, x, y)) return true;
    const airship = $gameMap.airship();
    return !!airship && airship.posNt(x, y);
  };

  // ============================================================================
  // Sprite-sized collision
  // ============================================================================
  //
  // A parked camper is drawn six tiles long but stands on one tile, so the player
  // and every event walk straight through its body. window.VehicleFootprint reads
  // the opaque pixels of a character's current frame and turns them into the tiles
  // that frame really covers, so a big vehicle blocks what it looks like it blocks.
  //
  // Deliberately narrow: only the PLAYER and EVENTS are held to a footprint. Map
  // passability, vehicles under way and everything else keep the engine's one-tile
  // logic, and a character already standing inside a footprint is never held by it
  // (otherwise stepping off a camper would box the player in under its own body).
  //
  // RoadCarAI.js feeds its cars in through addSource(); anything else with an
  // oversized sprite can do the same.

  // Share of a tile the sprite must cover before that tile counts as solid, so a
  // few pixels of overhang do not steal a whole tile from the player.
  const FOOTPRINT_MIN_COVERAGE = 0.4;
  const FOOTPRINT_ALPHA = 8; // pixels below this alpha are not part of the sprite

  const footprintSheets = new Map(); // sheet name -> measured pixel boxes
  const footprintRects = new Map();  // sheet|index|direction|tiles -> tile offsets
  const footprintSources = [];       // extra suppliers of oversized characters

  /**
   * Measures the opaque bounding box of every frame in a character sheet. One
   * pass over the image, cached forever after (the result only depends on the
   * pixels). Returns null when the sheet cannot be read, which pins that sheet
   * to the engine's one-tile collision.
   */
  function measureCharacterSheet(name, bitmap) {
    const big = ImageManager.isBigCharacter(name);
    const cols = big ? 3 : 12;
    const rows = big ? 4 : 8;
    const w = bitmap.width;
    const h = bitmap.height;
    const fw = Math.floor(w / cols);
    const fh = Math.floor(h / rows);
    if (fw < 1 || fh < 1) return null;

    let pixels;
    try {
      const source = bitmap.image || bitmap.canvas;
      if (!source) return null;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      context.drawImage(source, 0, 0);
      pixels = context.getImageData(0, 0, w, h).data;
    } catch (e) {
      return null;
    }

    const cells = new Array(cols * rows).fill(null);
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / fh);
      if (row >= rows) break;
      for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4 + 3] <= FOOTPRINT_ALPHA) continue;
        const col = Math.floor(x / fw);
        if (col >= cols) continue;
        const i = row * cols + col;
        const lx = x - col * fw;
        const ly = y - row * fh;
        const cell = cells[i];
        if (!cell) {
          cells[i] = { left: lx, right: lx, top: ly, bottom: ly };
        } else {
          if (lx < cell.left) cell.left = lx;
          if (lx > cell.right) cell.right = lx;
          if (ly < cell.top) cell.top = ly;
          if (ly > cell.bottom) cell.bottom = ly;
        }
      }
    }
    return { fw, fh, cols, cells };
  }

  /**
   * Drops everything measured off one sheet. A sheet on disk never changes under
   * the cache, but a GENERATED one does: the Starship's world-map sheet is
   * re-rendered whenever the player re-rolls the hull, under the same name.
   */
  function forgetFootprintSheet(name) {
    footprintSheets.delete(name);
    for (const key of Array.from(footprintRects.keys())) {
      if (key.startsWith(name + '|')) footprintRects.delete(key);
    }
  }

  /**
   * The pixel box one character index faces one way, taken as the union of its
   * three walking patterns so an animated frame never pokes out of its own
   * footprint. Null while the sheet is still loading.
   */
  function footprintPixelBox(name, index, direction) {
    if (!footprintSheets.has(name)) {
      const bitmap = ImageManager.loadCharacter(name);
      if (!bitmap || !bitmap.isReady() || !bitmap.width) return null;
      footprintSheets.set(name, measureCharacterSheet(name, bitmap));
    }
    const sheet = footprintSheets.get(name);
    if (!sheet) return null;

    const big = ImageManager.isBigCharacter(name);
    const blockX = big ? 0 : (index % 4) * 3;
    const blockY = big ? 0 : Math.floor(index / 4) * 4;
    const row = blockY + (direction - 2) / 2;
    let box = null;
    for (let pattern = 0; pattern < 3; pattern++) {
      const cell = sheet.cells[row * sheet.cols + blockX + pattern];
      if (!cell) continue;
      if (!box) {
        box = { left: cell.left, right: cell.right, top: cell.top, bottom: cell.bottom };
      } else {
        box.left = Math.min(box.left, cell.left);
        box.right = Math.max(box.right, cell.right);
        box.top = Math.min(box.top, cell.top);
        box.bottom = Math.max(box.bottom, cell.bottom);
      }
    }
    return box ? { box, fw: sheet.fw, fh: sheet.fh } : null;
  }

  /**
   * Tile offsets a pixel span [low, high) reaches, relative to the tile the
   * character stands on. The character's own tile is always part of it.
   */
  function coveredTileRange(low, high, size) {
    const need = size * FOOTPRINT_MIN_COVERAGE;
    let first = 0;
    let last = 0;
    for (let t = Math.floor(low / size); t <= Math.floor((high - 1) / size); t++) {
      const overlap = Math.min(high, (t + 1) * size) - Math.max(low, t * size);
      if (overlap < need) continue;
      if (t < first) first = t;
      if (t > last) last = t;
    }
    return { first, last };
  }

  /**
   * Tile offsets the character's current frame covers, or null when the sprite
   * is not measurable yet. The sprite is drawn anchored bottom-centre on its
   * tile, so the frame is placed the same way here.
   */
  function footprintRect(character) {
    const name = character.characterName ? character.characterName() : '';
    if (!name) return null;
    // The moored-ship mark is not a character sheet at all (16 frames in one
    // row), so measuring it as one would read a nonsense box off it. One tile,
    // like the engine's own collision.
    if (name === STARSHIP_MOORED_MARK.name) return null;
    const index = character.characterIndex ? character.characterIndex() : 0;
    const direction = character.direction();
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();
    const shiftY = character.shiftY ? character.shiftY() : 0;
    const key = `${name}|${index}|${direction}|${tw}x${th}|${shiftY}`;
    if (footprintRects.has(key)) return footprintRects.get(key);

    const measured = footprintPixelBox(name, index, direction);
    if (!measured) return null; // still loading: retry on the next check
    const { box, fw, fh } = measured;
    const left = tw / 2 - fw / 2 + box.left;
    const right = tw / 2 - fw / 2 + box.right + 1;
    const bottomEdge = th - shiftY;
    const top = bottomEdge - (fh - box.top);
    const bottom = bottomEdge - (fh - box.bottom - 1);

    const horizontal = coveredTileRange(left, right, tw);
    const vertical = coveredTileRange(top, bottom, th);
    const rect = {
      minDx: horizontal.first,
      maxDx: horizontal.last,
      minDy: vertical.first,
      maxDy: vertical.last
    };
    footprintRects.set(key, rect);
    return rect;
  }

  /** True when the character's sprite covers tile (x, y) on the current map. */
  function footprintCovers(character, x, y) {
    if (!character) return false;
    const dx = $gameMap.deltaX(x, character.x);
    const dy = $gameMap.deltaY(y, character.y);
    const rect = footprintRect(character);
    if (!rect) return dx === 0 && dy === 0;
    return dx >= rect.minDx && dx <= rect.maxDx && dy >= rect.minDy && dy <= rect.maxDy;
  }

  /**
   * Every character on this map whose whole sprite is solid right now: the parked
   * custom vehicles, plus whatever the registered sources add. A vehicle under
   * way is not in the list, so driving keeps the engine's one-tile collision.
   */
  function solidFootprintCharacters() {
    const list = [];
    const mapId = $gameMap.mapId();
    [$gameMap.boat(), $gameMap.ship(), $gameMap.airship()].forEach((vehicle) => {
      if (!vehicle || vehicle._mapId !== mapId) return;
      if (vehicle._driving || $gamePlayer.vehicle() === vehicle) return;
      if (vehicle._vsStacked) return;  // parked under another vehicle: not drawn
      if (!vehicle.characterName()) return;
      list.push(vehicle);
    });
    footprintSources.forEach((source) => {
      try {
        source(list);
      } catch (e) {
        /* a broken source must never block movement */
      }
    });
    return list;
  }

  window.VehicleFootprint = {
    /** Registers a supplier that pushes its oversized solid characters onto a list. */
    addSource(source) {
      if (typeof source === 'function' && !footprintSources.includes(source)) {
        footprintSources.push(source);
      }
    },
    covers: footprintCovers,
    rect: footprintRect,
    /** True when an oversized sprite stands between `mover` and tile (x, y). */
    blocks(mover, x, y) {
      if (!$gameMap || !$gamePlayer || !mover) return false;
      if (mover !== $gamePlayer && !(mover instanceof Game_Event)) return false;
      for (const character of solidFootprintCharacters()) {
        if (character === mover) continue;
        if (!footprintCovers(character, x, y)) continue;
        // Whoever is already under the sprite walks out of it freely.
        if (footprintCovers(character, mover.x, mover.y)) continue;
        return true;
      }
      return false;
    }
  };

  const _Game_CharacterBase_isCollidedWithCharacters =
    Game_CharacterBase.prototype.isCollidedWithCharacters;
  Game_CharacterBase.prototype.isCollidedWithCharacters = function (x, y) {
    if (_Game_CharacterBase_isCollidedWithCharacters.call(this, x, y)) return true;
    return window.VehicleFootprint.blocks(this, x, y);
  };

  // Override dash button check
  const _Game_Player_isDashButtonPressed = Game_Player.prototype.isDashButtonPressed;
  Game_Player.prototype.isDashButtonPressed = function () {
    // If in vehicle on map 315, always dash
    if (isPlayerRidingCustomVehicle() && $gameMap.mapId() === 315) {
      return true;
    }

    // On foot: no dash on map 315, otherwise check shift
    if ($gameMap.mapId() === 315) {
      return false;
    }
    return Input.isPressed('shift');
  };

  // Override real move speed
  const _Game_Player_realMoveSpeed = Game_Player.prototype.realMoveSpeed;
  Game_Player.prototype.realMoveSpeed = function () {
    // In vehicle: handle speed
    if (isPlayerRidingCustomVehicle()) {
      if ($gameMap.mapId() === 315) {
        // The Aero Streamlining upgrade grants a small world-map move-speed boost.
        let bonus = 0;
        const cfg = vehicleManager.getConfig($gamePlayer.vehicle());
        const type = upgradeTypeForConfig(cfg);
        if (type && window.VehicleUpgrades) bonus = window.VehicleUpgrades.mapSpeedBonus(type);
        return Math.min(
          VehicleConfig.SPEED.map315VehicleSpeed + bonus,
          MAX_MOVE_SPEED
        );
      } else {
        // Off the world map, holding Shift accelerates the vehicle just like it
        // does on foot. (On map 315 vehicles already dash permanently.)
        const boost = this.isDashButtonPressed()
          ? VehicleConfig.SPEED.speedBoostMultiplier
          : 1;
        return Math.min(this._moveSpeed * boost, MAX_MOVE_SPEED);
      }
    }

    // On foot on map 315: force speed
    if (!this.isInVehicle() && $gameMap.mapId() === 315) {
      return VehicleConfig.SPEED.map315OnFootSpeed;
    }

    // On foot on other maps: chain call and apply shift boost
    let speed = _Game_Player_realMoveSpeed.call(this);

    if (!this.isInVehicle()) {
      // Apply shift speed boost
      if (this.isDashButtonPressed()) {
        speed *= VehicleConfig.SPEED.speedBoostMultiplier;
      }
    }

    return speed;
  };

  // Override isDashing
  const _Game_Player_isDashing = Game_Player.prototype.isDashing;
  Game_Player.prototype.isDashing = function () {
    if ($gameMap.mapId() === 315) {
      // On map 315: vehicles dash, player doesn't
      if (isPlayerRidingCustomVehicle()) {
        return true;
      }
      return false;
    }

    if (this.isMoving() && !this.isInVehicle()) {
      // Always dashing when autorun enabled (non-315 maps)
      if (this.isAutorunEnabled()) {
        return true;
      }
    }
    return _Game_Player_isDashing.call(this);
  };

  // Override updateDashing
  const _Game_Player_updateDashing = Game_Player.prototype.updateDashing;
  Game_Player.prototype.updateDashing = function () {
    if (isPlayerRidingCustomVehicle() && $gameMap.mapId() === 315) {
      this._dashing = true;
      return;
    }

    if ($gameMap.mapId() === 315 && !this.isInVehicle()) {
      this._dashing = false;
      return;
    }

    _Game_Player_updateDashing.call(this);
  };

  // NOTE: out-of-fuel movement is blocked by Game_Vehicle.isMapPassable (which
  // returns false for every tile when the tank is empty). We deliberately do NOT
  // block it via Game_Player.canMove, because canMove also gates triggerButtonAction
  // (the OK/action button) - blocking it there would make the vehicle/travel menu
  // impossible to open while stranded, leaving the player permanently stuck.

  /**
   * Returns the custom vehicle the player is currently facing (or standing under,
   * for the airship), or null if none is boardable from the current tile.
   */
  /**
   * True when the vehicle stands on tile (x, y) OR its sprite covers it: a
   * parked camper is boarded by walking up to its body, not to the one tile it
   * happens to be pinned to (which its own footprint now blocks off anyway).
   */
  function vehicleReachableAt(vehicle, x, y) {
    if (!vehicle || vehicle._mapId !== $gameMap.mapId()) return false;
    if (vehicle.pos(x, y)) return true;
    return !vehicle._driving && window.VehicleFootprint.covers(vehicle, x, y);
  }

  function detectBoardableVehicle() {
    const d = $gamePlayer.direction();
    const x1 = $gamePlayer.x;
    const y1 = $gamePlayer.y;
    const x2 = $gameMap.roundXWithDirection(x1, d);
    const y2 = $gameMap.roundYWithDirection(y1, d);

    // Game_Vehicle.pos() already returns false when the vehicle is on another map.
    const airship = $gameMap.airship();
    if (airship && (vehicleReachableAt(airship, x1, y1) || vehicleReachableAt(airship, x2, y2))) {
      return airship;
    }
    const ship = $gameMap.ship();
    if (ship && vehicleReachableAt(ship, x2, y2)) {
      return ship;
    }
    const boat = $gameMap.boat();
    if (boat && vehicleReachableAt(boat, x2, y2)) {
      return boat;
    }
    return null;
  }

  /**
   * The Game_Vehicle a vehicle key is currently embodied by, or null when the
   * engine slot is standing for another vehicle (the Car, the Bike and the Boat
   * share one slot, so at most one of the three is materialized at a time).
   */
  function materializedVehicleFor(key) {
    const config = configForVehicleKey(key);
    if (!config) return null;
    const vehicle = vehicleManager.getVehicle(config.type);
    if (!vehicle) return null;
    if (config.type === 'boat' && vehicleManager.boatKey() !== key) return null;
    return vehicle;
  }

  /**
   * Brings a parked vehicle out of the store and onto its tile, swapping the
   * shared 'boat' slot over to it when it is the Car / Bike / Boat, and putting
   * it on top of whatever else is parked on that tile. Returns the Game_Vehicle,
   * or null when the vehicle is not parked on this map (or the slot is in use).
   */
  function materializeVehicle(key) {
    if (!ownsVehicleKey(key)) return null;
    const tile = parkedTileOnCurrentMap(key);
    if (!tile) return null;
    vehicleManager.setBoatKey(key);
    const vehicle = materializedVehicleFor(key);
    if (!vehicle) return null;
    if ($gamePlayer.isInVehicle() && $gamePlayer.vehicle() === vehicle) return vehicle;
    moveVehicleInternally(vehicle, $gameMap.mapId(), tile.x, tile.y);
    restackCurrentMap(vehicle);
    return vehicle;
  }

  /**
   * Every vehicle key the player can interact with from where they stand, the
   * most recently parked first. Vehicles are read from the position store rather
   * than off the map, so one parked underneath another (or waiting for the shared
   * 'boat' slot) is offered just the same.
   */
  function reachableVehicleKeys() {
    const d = $gamePlayer.direction();
    const x1 = $gamePlayer.x;
    const y1 = $gamePlayer.y;
    const x2 = $gameMap.roundXWithDirection(x1, d);
    const y2 = $gameMap.roundYWithDirection(y1, d);

    return VEHICLE_KEYS.filter(key => {
      if (!ownsVehicleKey(key)) return false;
      const tile = parkedTileOnCurrentMap(key);
      if (!tile) return false;
      // The airship is boarded from underneath as well as from in front, and so
      // is the Broom: it lands on the tile its rider is standing on, so without
      // this a broom set down on a rooftop could never be picked up again.
      const fromBelow = key === 'airship' || key === 'broom';
      if (tile.x === x2 && tile.y === y2) return true;
      if (fromBelow && tile.x === x1 && tile.y === y1) return true;
      // An oversized parked sprite is boarded by walking up to its bodywork.
      const vehicle = materializedVehicleFor(key);
      if (!vehicle || vehicle._driving || vehicle._mapId !== $gameMap.mapId()) return false;
      return window.VehicleFootprint.covers(vehicle, x2, y2) ||
        (fromBelow && window.VehicleFootprint.covers(vehicle, x1, y1));
    }).sort((a, b) => VehiclePosition.order(b) - VehiclePosition.order(a));
  }

  // ============================================================================
  // World-map events sitting under a vehicle
  // ============================================================================
  //
  // On the world map (315) a vehicle is parked by tile coordinate, so it can end
  // up on top of an interactable event (the "Teleport - <place>" city markers,
  // the Omega Tower doors, ...). The action button boards / opens the vehicle
  // before any event check runs, which would leave that event unreachable, so
  // the vehicle menu lists the overlapped events as extra choices instead.

  // Only action-button pages carrying real commands count: the invisible
  // CountryName labels blanketing map 315 have an empty page and are not
  // interactable, so they must never show up as a choice.
  function isInteractableMapEvent(event) {
    if (!event || !event.event()) return false;
    const page = event.page();
    if (!page || page.trigger !== 0) return false;
    const list = event.list();
    return !!(list && list.length > 1);
  }

  /**
   * Events the action button could otherwise have reached on the world map: the
   * tile the player stands on, plus the tile they face (where a parked vehicle
   * sits when it is boarded from outside).
   */
  function overlappedWorldMapEvents() {
    if (!$gameMap || $gameMap.mapId() !== 315) return [];
    const d = $gamePlayer.direction();
    const tiles = [
      { x: $gamePlayer.x, y: $gamePlayer.y },
      {
        x: $gameMap.roundXWithDirection($gamePlayer.x, d),
        y: $gameMap.roundYWithDirection($gamePlayer.y, d)
      }
    ];
    const found = [];
    tiles.forEach(tile => {
      $gameMap.eventsXy(tile.x, tile.y).forEach(event => {
        if (found.includes(event)) return;
        if (isInteractableMapEvent(event)) found.push(event);
      });
    });
    return found;
  }

  /**
   * Menu label for an overlapped world-map event. Destinations are named
   * "Teleport - <place>" on map 315 and read better as a travel line.
   */
  function worldMapEventLabel(event) {
    const name = (event.event().name || '').trim();
    const teleport = name.match(/^Teleport\s*-\s*(.+)$/i);
    if (teleport) {
      // The event name carries the Destinations.json key; the player reads the
      // "name" field of that entry.
      const key = teleport[1].trim();
      const place = window.WorkSystem?.destinationName
        ? window.WorkSystem.destinationName(key) : key;
      return T('VehicleSystem.travelTo', { place });
    }
    return name || T('VehicleSystem.examine');
  }

  /**
   * Boards the given custom vehicle ("Start driving"). Ships/boats reuse the
   * engine boarding flow; the airship is solid now, so the player is moved onto
   * its tile before mounting.
   */
  function startDrivingVehicle(vehicle) {
    // Indoors the Starship is not flown, whatever left it standing there: no
    // house, cave or dungeon has the headroom (see starshipBarredHere).
    if (vehicle.isAirship() && starshipBarredHere()) {
      showLocalizedMessage(T('VehicleSystem.noStarshipIndoors'));
      return;
    }
    rememberVehicleUsed(vehicleManager.getConfig(vehicle));
    if (vehicle.isAirship()) {
      const airship = $gameMap.airship();
      if (!airship) return;
      if (!airship.pos($gamePlayer.x, $gamePlayer.y)) {
        $gamePlayer.setThrough(true);
        $gamePlayer.setPosition(airship.x, airship.y);
        $gamePlayer.setThrough(false);
      }
      $gamePlayer._vehicleType = 'airship';
      $gamePlayer._vehicleGettingOn = true;
      $gamePlayer.gatherFollowers();
    } else {
      _Game_Player_getOnVehicle.call($gamePlayer);
      // The engine only boards from the tile the vehicle is pinned to. A player
      // who walked up to the bodywork instead is standing on the sprite but not
      // on that tile, so step them onto it and board by hand.
      if (!$gamePlayer.isInVehicle()) {
        $gamePlayer.setThrough(true);
        $gamePlayer.setPosition(vehicle.x, vehicle.y);
        $gamePlayer.setThrough(false);
        $gamePlayer._vehicleType = vehicle.isShip() ? 'ship' : 'boat';
        $gamePlayer._vehicleGettingOn = true;
        $gamePlayer.gatherFollowers();
      }
    }
  }

  // Vehicles small enough to be carried: the Bike is folded up and the Broom is
  // shouldered, and each goes back into the pack as the item it was summoned
  // from. Their configs already name that item (summonItemId).
  const PORTABLE_VEHICLE_KEYS = ['bike', 'broom'];

  function isPortableConfig(config) {
    return !!config && PORTABLE_VEHICLE_KEYS.includes(upgradeTypeForConfig(config));
  }

  /**
   * Picks up a parked portable vehicle: removes it from the map and returns its
   * summoning item to the inventory. Both share the 'boat' Game_Vehicle, so we
   * move it off-map (mapId 0) which makes Game_Vehicle.pos() stop matching the
   * current map and the sprite turn transparent, effectively despawning it.
   */
  function pickUpVehicle(vehicle) {
    if (!vehicle) return;
    const config = vehicleManager.getConfig(vehicle);
    if (!isPortableConfig(config)) return;

    // If the player is somehow still mounted, dismount first.
    if ($gamePlayer.isInVehicle() && $gamePlayer.vehicle() === vehicle) {
      disembarkLeavingParked(vehicle);
    }

    vehicle.setLocation(0, vehicle.x, vehicle.y);
    VehiclePosition.set(VehiclePosition.keyForConfig(config), 0, vehicle.x, vehicle.y);

    const item = $dataItems[config.summonItemId];
    if (item) {
      $gameParty.gainItem(item, 1);
    }

    AudioManager.playSe({ name: 'Equip1', pan: 0, pitch: 100, volume: 90 });
    showLocalizedMessage(T('VehicleSystem.pickedUpVehicle', { vehicle: vehicleNounName(config) }));
  }

  /**
   * Forcibly removes the player from the vehicle while leaving the vehicle parked
   * where it is. Unlike Game_Player.getOffVehicle(), this does not require a
   * land-ok tile in front (which fails on water for ships), so the player can
   * safely enter the vehicle interior without dragging the vehicle along.
   */
  function disembarkLeavingParked(vehicle) {
    if (!vehicle) return;
    vehicle.getOff(); // _driving = false; custom hook saves pos + fixes speed/followers
    $gamePlayer._vehicleType = '';
    $gamePlayer._vehicleGettingOn = false;
    $gamePlayer._vehicleGettingOff = false;
    $gamePlayer.setThrough(false);
    $gamePlayer.setTransparent(false);
    $gamePlayer.refresh();
  }

  /**
   * Resolves the FastTravelSystem travel-type string for a given vehicle config,
   * or null if the vehicle has no fast-travel network (e.g. the Starship).
   */
  function getFastTravelType(config) {
    if (!config) return null;
    if (config.name === 'Camper') return 'camper';  // i18n-ignore  vehicle id
    if (config.name === 'Car') return 'carsharing';  // i18n-ignore  vehicle id
    if (config.name === 'Bike') return 'bicycle';  // i18n-ignore  vehicle id
    return null;
  }

  /**
   * Returns the vehicle config whose interior map matches the given map id, or
   * null if the map is not a known vehicle interior. (The bike has no interior.)
   */
  // The config behind a maintenance key ('camper', 'car', ...). The inverse of
  // upgradeTypeForConfig, for callers that only know what the party is driving.
  function configByUpgradeType(key) {
    return configForVehicleKey(key);
  }

  function getConfigByInteriorMapId(mapId) {
    const configs = [VehicleConfig.CAMPER, VehicleConfig.CAR, VehicleConfig.AIRSHIP];
    return configs.find(c => c.interior && c.interior.mapId > 0 && c.interior.mapId === mapId) || null;
  }

  /**
   * Launches the 3D camper road-driving scene ("liminal drive") from
   * VoxelWorldSystem.js and initializes it with the player actively driving
   * the camper (car view mode) rather than the default first-person interior view.
   * Camper-only; safely no-ops if VoxelWorldSystem is not loaded.
   */
  function engageLiminalDrive(config) {
    if (!window.VoxelWorldSystem || typeof window.VoxelWorldSystem.start !== 'function') {
      showLocalizedMessage(T('VehicleSystem.liminalUnavailable'));
      return;
    }
    // Whichever vehicle asked for it goes out there: the 3D world drives it as
    // itself (VoxelWorldCore's VEHICLE_DRIVE says how fast, whether it has a
    // boost, and whether that boost bends space), and draws it as itself.
    window.VoxelWorldSystem.start(60, T('VehicleSystem.liminalDrive'), 100,
      upgradeTypeForConfig(config));
    const scene = window.VoxelWorldSystem._scene;
    if (scene && typeof scene._setMode === 'function') {
      scene._setMode('car');
    }
  }

  /**
   * True only for the Camper config when the VoxelWorldSystem is available.
   * Gates the "Engage liminal drive" menu option.
   */
  // Every vehicle the party owns can be taken into the 3D world, not only the
  // camper: the world knows how to drive each of them (VEHICLE_DRIVE) and how to
  // draw each of them (window.VehicleModels).
  function canEngageLiminalDrive(config) {
    if (!config || !window.VoxelWorldSystem) return false;
    const key = upgradeTypeForConfig(config);
    const drive = window.VoxelWorld && window.VoxelWorld.VEHICLE_DRIVE;
    return !!(key && (!drive || drive[key]));
  }

  // ============================================================================
  // The vehicle status card
  // ============================================================================
  //
  // The action menu is a column of verbs - "Refuel", "Repairs", "Start driving"
  // - and none of them say whether the tank is nearly dry or the brakes are
  // gone, which is exactly what somebody deciding between them wants to know.
  // The card rides above the choices for as long as they are open and answers
  // both, as the pair of bars the fuel HUD already draws, so the menu reads like
  // the instrument panel it stands in for.

  const STATUS_CARD_ID = 'vehicle-status-card';

  let statusCardEl = null;

  // Colour by what is left: the last quarter of a tank, or a vehicle a quarter
  // of the way to scrap, is the part worth catching the eye.
  function statusFillClass(pct) {
    if (pct <= 25) return 'vsc-red';
    if (pct <= 50) return 'vsc-amber';
    return 'vsc-green';
  }

  function statusCardRow(label, pct, valueText) {
    const width = Math.max(0, Math.min(100, pct));
    return `<div class="vsc-row">` +
      `<span class="vsc-lbl">${label}</span>` +
      `<div class="vsc-bar"><div class="vsc-fill ${statusFillClass(pct)}" style="width:${width}%"></div></div>` +
      `<span class="vsc-val">${valueText}</span>` +
    `</div>`;
  }

  function hideVehicleStatusCard() {
    const el = statusCardEl || document.getElementById(STATUS_CARD_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    statusCardEl = null;
  }

  /**
   * Draws the card for `config`. A vehicle with neither a tank nor a health
   * record (the flying broom) has nothing to report, and gets no card rather
   * than an empty one.
   */
  function showVehicleStatusCard(config) {
    hideVehicleStatusCard();
    if (!config) return;

    const key = upgradeTypeForConfig(config);
    const repair = window.VehicleSystemRepair;
    const condition = (key && repair && repair.vehicleCondition)
      ? repair.vehicleCondition(key) : null;

    let rows = '';
    if (key && config.usesFuel && window.VehicleFuel) {
      const fuel = window.VehicleFuel.get(key);
      const max = window.VehicleFuel.max(key) || 1;
      rows += statusCardRow(T('VehicleSystem.status.fuel'), fuel / max * 100,
        `${fuel.toFixed(1)} / ${Math.round(max)} L`);
    }
    if (condition != null) {
      rows += statusCardRow(T('VehicleSystem.status.condition'), condition,
        `${Math.round(condition)}%`);
    }
    if (!rows) return;

    // A dead critical part is not a low bar but a vehicle that will not move, so
    // it is said in words on top of the percentage.
    const broken = !!(key && repair && repair.checkCriticalParts && repair.checkCriticalParts(key));
    const warning = broken ? `<div class="vsc-warn">${T('VehicleSystem.status.broken')}</div>` : '';

    const el = document.createElement('div');
    el.id = STATUS_CARD_ID;
    el.innerHTML =
      `<div class="vsc-title">${vehicleDisplayName(config)}</div>` + rows + warning;
    document.body.appendChild(el);
    statusCardEl = el;
  }

  /**
   * Context-aware vehicle menu.
   *   isRiding === true  -> opened while driving (cancel key): first option "Stop driving".
   *   isRiding === false -> opened by interacting from outside: first option "Start driving".
   * No "What would you like to do?" prompt is shown; the fuel and the condition
   * of the vehicle being decided about are on the status card above the choices.
   */
  // The display name of the biome the party's world-map square would open into,
  // or "" when that cannot be answered (off the world map, no classifier).
  function biomeNameUnderPlayer() {
    try {
      const utils = window.ProcGenUtils;
      if (!utils || !utils.getBiomeFromWorldCoordinates) return '';
      if (!window.WorldMapReturn || $gameMap.mapId() !== window.WorldMapReturn.worldMapId) return '';
      const biome = utils.getBiomeFromWorldCoordinates($gameMap, $gamePlayer.x, $gamePlayer.y);
      if (!biome) return '';
      return window.BiomeNames ? window.BiomeNames.display(biome) : biome;
    } catch (e) {
      return '';
    }
  }

  Game_Player.prototype.showVehicleActionMenu = function (vehicle, isRiding) {
    const config = vehicleManager.getConfig(vehicle);
    if (!config || $gameMessage.isBusy()) return;

    const choices = [];
    const handlers = [];

    if (isRiding) {
      choices.push(T('VehicleSystem.stopDriving'));
      handlers.push(() => {
        if (!$gamePlayer.isInVehicle()) return;
        // Try the normal dismount (steps the player onto adjacent land and parks
        // the vehicle behind them). If no land tile is free (over water / air),
        // dismount in place so the player is never left stranded aboard. A
        // flying vehicle is the exception: it already lands in place wherever it
        // possibly can, so a refusal means the tile really will not hold the
        // party and the rider stays aboard (and has been told why).
        $gamePlayer.getOffVehicle();
        if ($gamePlayer.isInVehicle() && !isFlyingConfig(config)) {
          disembarkLeavingParked(vehicle);
        }
        // Persist the parked spot to the internal position store.
        vehicleManager.savePosition(vehicle);
      });
    } else {
      choices.push(T('VehicleSystem.startDriving'));
      handlers.push(() => startDrivingVehicle(vehicle));
    }

    if (config.interior && config.interior.mapId > 0) {
      choices.push(T('VehicleSystem.enterVehicle', { vehicle: vehicleNounName(config) }));
      handlers.push(() => {
        // Leave the vehicle parked on the current map; only the player enters.
        if ($gamePlayer.isInVehicle()) {
          disembarkLeavingParked(vehicle);
        }
        // Remember where the player entered from. The Exit / EndTravel command
        // puts them back there; without it the spot can be 0 (->0,0) or a stale
        // previous location.
        if (!mapCache.isInterior($gameMap.mapId()) && $gameMap.mapId() !== proceduralMapId()) {
          VehiclePosition.setEntry(VehiclePosition.keyForConfig(config), $gameMap.mapId(), $gamePlayer.x, $gamePlayer.y);
        }
        const direction = config.interior.direction || 2;
        $gamePlayer.reserveTransfer(
          config.interior.mapId,
          config.interior.x,
          config.interior.y,
          direction, 0
        );
        AudioManager.playSe({ name: "Door1", pan: 0, pitch: 100, volume: 90 });
      });
    }

    const fastTravelType = getFastTravelType(config);
    if (fastTravelType) {
      choices.push(T('VehicleSystem.fastTravel'));
      handlers.push(() => {
        // If the vehicle has an interior and the player isn't already inside it,
        // move them into the vehicle (region 13 spawn tile) and start the fast
        // travel there. Otherwise just open the travel UI in place.
        const interiorMapId = (config.interior && config.interior.mapId > 0) ? config.interior.mapId : 0;
        const insideVehicle = interiorMapId && $gameMap.mapId() === interiorMapId;

        if (interiorMapId && !insideVehicle) {
          if ($gamePlayer.isInVehicle()) {
            vehicleManager.savePosition(vehicle);
            $gamePlayer.getOffVehicle();
          }
          $gameTemp._pendingFastTravelType = fastTravelType;
          const delay = isRiding ? 1000 : 0;
          setTimeout(() => {
            const pos = findRegionTile(interiorMapId, 13);
            const tx = pos ? pos.x : config.interior.x;
            const ty = pos ? pos.y : config.interior.y;
            const direction = config.interior.direction || 2;
            $gamePlayer.reserveTransfer(interiorMapId, tx, ty, direction, 0);
            AudioManager.playSe({ name: "Door1", pan: 0, pitch: 100, volume: 90 });
          }, delay);
        } else {
          setTimeout(() => {
            if (SceneManager._scene && SceneManager._scene.startFastTravel) {
              SceneManager._scene.startFastTravel(fastTravelType);
            }
          }, 100);
        }
      });
    }

    // The Starship and the (fuel-free) bike are never refuelable at a gas pump.
    if (config.canRefuelAtPump && config.refuelEvent) {
      choices.push(T('VehicleSystem.refuel'));
      handlers.push(() => openVehicleRefuel());
    }
    if (config.storageEvent) {
      choices.push(T('VehicleSystem.storage'));
      handlers.push(() => $gameTemp.reserveCommonEvent(config.storageEvent));
    }
    if (config.repairEvent) {
      choices.push(T('VehicleSystem.repairs'));
      handlers.push(() => openVehicleMaintenance(config));
    }

    // Starship only: its hull is procedurally generated, so its look can be
    // re-rolled from the appearance editor.
    if (config.name === 'Starship' && window.GalaxySim && window.GalaxySim.openShipAppearance) {  // i18n-ignore  vehicle id
      choices.push(T('VehicleSystem.changeAppearance'));
      handlers.push(() => window.GalaxySim.openShipAppearance());
    }

    // Take this vehicle out into the 3D world and drive it there.
    if (canEngageLiminalDrive(config)) {
      choices.push(T('VehicleSystem.engageLiminal'));
      handlers.push(() => engageLiminalDrive(config));
    }

    // Bike and Broom only: stow the parked vehicle back into the pack as an item.
    if (!isRiding && isPortableConfig(config)) {
      choices.push(T('VehicleSystem.pickUp'));
      handlers.push(() => pickUpVehicle(vehicle));
    }

    // Starship only: pressing OK while riding opens the galaxy travel menu
    // (the 3D star map), where destinations are picked (#134).
    if (config.name === 'Starship' && window.GalaxySim &&  // i18n-ignore  vehicle id
        typeof window.GalaxySim.openStarMap === 'function') {
      choices.push(T('VehicleSystem.starMap'));
      handlers.push(() => {
        setTimeout(() => window.GalaxySim.openStarMap(), 100);
      });
    }

    // Every motorized vehicle has a radio (the human-powered bike and the
    // paddle/wind-powered boat, both fuel-free, do not).
    if (config.usesFuel && window.TunableRadio) {
      choices.push(T('VehicleSystem.radio'));
      handlers.push(() => window.TunableRadio.open());
    }

    // Boat only: fishing over the side. A dinghy is sitting on open water
    // wherever it is, so the only question is whether anybody in the party is
    // carrying something to fish with - which Map/MovementInteractionSystem.js
    // answers, since it owns both the gear list and the minigame.
    if (isRiding && isBoatSubType(vehicle) && window.MovementSystem &&
        typeof window.MovementSystem.hasFishingRod === 'function' &&
        window.MovementSystem.hasFishingRod()) {
      choices.push(T('VehicleSystem.fish'));
      // The choice list is still closing, so the minigame is pushed on the next
      // frame the message system is free again (as fast travel and the star map
      // are).
      handlers.push(() => {
        setTimeout(() => window.MovementSystem.performFishing($gamePlayer), 100);
      });
    }

    // World map only: events the vehicle is parked on (or that the player is
    // standing on while the vehicle is in front of them) are unreachable with
    // the action button, because opening this menu already consumed the press.
    // Offer them here so the player picks the event or the vehicle.
    overlappedWorldMapEvents().forEach(event => {
      choices.push(worldMapEventLabel(event));
      handlers.push(() => event.start());
    });

    // Offered while riding AND while the vehicle only stands there: stepping out
    // of a vehicle parked on a procedural world square is the moment the party
    // decides between walking into that biome and staying on the world map.
    if (window.WorldMapReturn) {
      const currentMapId = $gameMap.mapId();
      if (!vehicle.isAirship() && currentMapId === window.WorldMapReturn.worldMapId) {
        const biome = biomeNameUnderPlayer();
        choices.push(biome ? T('VehicleSystem.visitBiome', { biome })
          : T('VehicleSystem.visitMap'));
        handlers.push(() => window.WorldMapReturn.performVisitMap());
      } else if (currentMapId === window.WorldMapReturn.procMapId) {
        choices.push(T('VehicleSystem.returnToWorldMap'));
        handlers.push(() => window.WorldMapReturn.returnToWorldMap());
      }
    }

    // The last row is what cancelling the menu picks, so it must always be a
    // do-nothing one: "Visit map" / "Return to the world map" are real map
    // transfers, and pressing ESC on them teleported the party away.
    choices.push(isRiding ? T('VehicleSystem.continueDriving') : T('VehicleSystem.leave'));
    handlers.push(() => { });

    showVehicleStatusCard(config);
    const cancelIndex = choices.length - 1;
    $gameMessage.setChoices(choices, 0, cancelIndex);
    $gameMessage.setChoiceCallback((choice) => {
      // Cancelling picks the last row, so this runs however the menu is left.
      hideVehicleStatusCard();
      const handler = handlers[choice];
      if (handler) handler();
    });
  };

  /**
   * Travel/utility menu shown while the player is INSIDE a vehicle's interior map.
   * The offered options depend on which interior the player is standing in (a
   * vehicle without a fast-travel network or storage/repair events simply omits
   * those rows). "Refuel" and "Enter <vehicle>" are intentionally never offered
   * here: the player is already inside, and a roadside pump is out of reach.
   */
  Game_Player.prototype.showVehicleInteriorMenu = function (config) {
    if (!config || $gameMessage.isBusy()) return;

    const choices = [];
    const handlers = [];

    const fastTravelType = getFastTravelType(config);
    if (fastTravelType) {
      choices.push(T('VehicleSystem.fastTravel'));
      handlers.push(() => {
        setTimeout(() => {
          if (SceneManager._scene && SceneManager._scene.startFastTravel) {
            SceneManager._scene.startFastTravel(fastTravelType);
          }
        }, 100);
      });
    }

    if (config.storageEvent) {
      choices.push(T('VehicleSystem.storage'));
      handlers.push(() => $gameTemp.reserveCommonEvent(config.storageEvent));
    }

    if (config.repairEvent) {
      choices.push(T('VehicleSystem.repairs'));
      handlers.push(() => openVehicleMaintenance(config));
    }

    // Starship only: its hull is procedurally generated, so its look can be
    // re-rolled from the appearance editor.
    if (config.name === 'Starship' && window.GalaxySim && window.GalaxySim.openShipAppearance) {  // i18n-ignore  vehicle id
      choices.push(T('VehicleSystem.changeAppearance'));
      handlers.push(() => window.GalaxySim.openShipAppearance());
    }

    // Take this vehicle out into the 3D world and drive it there.
    if (canEngageLiminalDrive(config)) {
      choices.push(T('VehicleSystem.engageLiminal'));
      handlers.push(() => engageLiminalDrive(config));
    }

    // Every motorized vehicle has a radio (the human-powered bike does not).
    if (config.name !== 'Bike' && window.TunableRadio) {  // i18n-ignore  vehicle id
      choices.push(T('VehicleSystem.radio'));
      handlers.push(() => window.TunableRadio.open());
    }

    choices.push(T('VehicleSystem.cancel'));
    handlers.push(() => { });

    showVehicleStatusCard(config);
    const cancelIndex = choices.length - 1;
    $gameMessage.setChoices(choices, 0, cancelIndex);
    $gameMessage.setChoiceCallback((choice) => {
      hideVehicleStatusCard();
      const handler = handlers[choice];
      if (handler) handler();
    });
  };

  // A vehicle whose action menu opens as soon as the current message closes: a
  // choice list cannot be replaced from inside its own callback (the message is
  // cleared right after it returns), so the follow-up menu waits one frame.
  let pendingVehicleMenu = null;

  /**
   * Asks which vehicle the player means when more than one is parked on the tile
   * they are interacting with. Picking one brings it to the top of the stack and
   * opens its usual action menu.
   */
  Game_Player.prototype.showVehicleChoiceMenu = function (keys) {
    if ($gameMessage.isBusy()) return;

    const choices = [];
    const handlers = [];

    keys.forEach(key => {
      const config = configForVehicleKey(key);
      if (!config) return;
      choices.push(vehicleDisplayName(config));
      handlers.push(() => {
        const vehicle = materializeVehicle(key);
        // The choice list is still closing, so the action menu is opened on the
        // first frame the message system is free again (see Scene_Map.update).
        if (vehicle) pendingVehicleMenu = vehicle;
      });
    });

    choices.push(T('VehicleSystem.leave'));
    handlers.push(() => { });

    const cancelIndex = choices.length - 1;
    $gameMessage.setChoices(choices, 0, cancelIndex);
    $gameMessage.setChoiceCallback((choice) => {
      const handler = handlers[choice];
      if (handler) handler();
    });
  };

  /**
   * Opens the menu of the parked vehicle the player is interacting with, asking
   * which one first when several share the tile. Returns true when it consumed
   * the action button.
   */
  Game_Player.prototype.openParkedVehicleMenu = function () {
    const keys = reachableVehicleKeys();
    if (keys.length > 1) {
      this.showVehicleChoiceMenu(keys);
      return true;
    }
    if (keys.length === 1) {
      const parked = materializeVehicle(keys[0]);
      if (parked) {
        this.showVehicleActionMenu(parked, false);
        return true;
      }
    }
    const vehicle = detectBoardableVehicle();
    if (vehicle && isCustomVehicle(vehicle)) {
      this.showVehicleActionMenu(vehicle, false);
      return true;
    }
    return false;
  };

  // Interacting with a parked custom vehicle from outside opens the action menu
  // ("Start driving") instead of boarding immediately.
  const _Game_Player_getOnVehicle = Game_Player.prototype.getOnVehicle;
  Game_Player.prototype.getOnVehicle = function () {
    if (!this.isInVehicle() && this.openParkedVehicleMenu()) {
      return true;
    }
    return _Game_Player_getOnVehicle.call(this);
  };

  // While riding a custom vehicle, the action button (A / ok) opens the vehicle
  // options menu ("Stop driving" is the first choice) instead of dismounting
  // immediately. Returning true consumes the press so no event/movement fires (#58).
  const _Game_Player_getOnOffVehicle = Game_Player.prototype.getOnOffVehicle;
  Game_Player.prototype.getOnOffVehicle = function () {
    if (isPlayerRidingCustomVehicle() && !$gameMessage.isBusy()) {
      this.showVehicleActionMenu(this.vehicle(), true);
      return true;
    }
    return _Game_Player_getOnOffVehicle.call(this);
  };

  // ============================================================================
  // Event Interaction Control
  // ============================================================================

  class EventInteractionControl {
    static isTransferEvent(x, y) {
      const events = $gameMap.eventsXy(x, y);
      return events.some(e => e && e.event() && e.event().name && e.event().name.toLowerCase().startsWith('transfer'));
    }
  }

  const _Game_Player_checkEventTriggerHere = Game_Player.prototype.checkEventTriggerHere;
  Game_Player.prototype.checkEventTriggerHere = function (triggers) {
    if (isPlayerRidingCustomVehicle() && $gameMap.mapId() !== 315) {
      if (!EventInteractionControl.isTransferEvent(this.x, this.y)) {
        return false;
      }
    }
    return _Game_Player_checkEventTriggerHere.call(this, triggers);
  };

  const _Game_Player_checkEventTriggerThere = Game_Player.prototype.checkEventTriggerThere;
  Game_Player.prototype.checkEventTriggerThere = function (triggers) {
    if (isPlayerRidingCustomVehicle() && $gameMap.mapId() !== 315) {
      const d = this.direction();
      const x2 = $gameMap.roundXWithDirection(this.x, d);
      const y2 = $gameMap.roundYWithDirection(this.y, d);

      if (!EventInteractionControl.isTransferEvent(x2, y2)) {
        return false;
      }
    }
    return _Game_Player_checkEventTriggerThere.call(this, triggers);
  };

  // ============================================================================
  // Fuel HUD (top-left gauge shown while driving a fuel-using vehicle)
  // ============================================================================

  class Window_VehicleFuelHUD extends Window_Base {
    initialize() {
      super.initialize(new Rectangle(8, 8, 240, 90));
      this.opacity = 200;
      this._cacheKey = '';
      this.visible = false;
    }

    update() {
      super.update();
      const config = isPlayerRidingCustomVehicle()
        ? vehicleManager.getConfig($gamePlayer.vehicle())
        : null;
      const show = !!(config && config.usesFuel) && !$gameMessage.isBusy();
      this.visible = show;
      if (!show) return;

      const fuel = FuelSystem.getFuel($gamePlayer.vehicle());
      const key = `${config.name}:${fuel.toFixed(1)}:${configMaxFuel(config)}`;
      if (key !== this._cacheKey) {
        this._cacheKey = key;
        this._draw(config, fuel);
      }
    }

    _draw(config, fuel) {
      this.contents.clear();
      this.resetFontSettings();

      const w = this.contentsWidth();
      const max = configMaxFuel(config) || 1;
      const rate = Math.max(0, Math.min(1, fuel / max));

      this.drawText(vehicleDisplayName(config), 0, 0, w - 88, 'left');
      this.drawText(`${fuel.toFixed(1)}L`, w - 88, 0, 88, 'right');

      const gy = this.lineHeight() + 6;
      const gh = 12;
      const back = ColorManager.gaugeBackColor();
      const low = rate <= 0.25;
      const c1 = low ? ColorManager.textColor(18) : ColorManager.textColor(28);
      const c2 = low ? ColorManager.textColor(2) : ColorManager.textColor(24);
      this.contents.fillRect(0, gy, w, gh, back);
      this.contents.gradientFillRect(0, gy, Math.floor(w * rate), gh, c1, c2);
    }
  }

  // The fuel gauge is now rendered as an HTML bar in the bottom-right travel
  // HUD (MapInfoHUD in TimeDateSystem.js) via MergedVehicleSystem.getActiveFuelStatus().
  // The old top-left RPG Maker gauge window is intentionally no longer created.
  void Window_VehicleFuelHUD;

  // ============================================================================
  // Scene Map Extensions
  // ============================================================================

  // Remember when the player transfers OUT of a vehicle interior so the vehicle
  // can be re-spawned on the destination map (see _handleExitInteriorSpawn).
  // We skip this when an explicit "return to vehicle" command is already pending
  // (those set a _spawn*AfterTransfer flag handled by _handleAutoRide), so the
  // vehicle is never spawned twice.
  const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
  Game_Player.prototype.performTransfer = function () {
    if (this.isTransferring()) {
      const fromMapId = $gameMap.mapId();
      const spawnPending = $gameTemp._spawnCamperAfterTransfer ||
        $gameTemp._spawnCarAfterTransfer ||
        $gameTemp._spawnStarshipAfterTransfer;
      if (!spawnPending && fromMapId !== this._newMapId &&
        getConfigByInteriorMapId(fromMapId)) {
        $gameTemp._exitedVehicleInteriorMapId = fromMapId;
      }
    }
    _Game_Player_performTransfer.call(this);
  };

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    _Scene_Map_onMapLoaded.call(this);

    vehicleManager.initialize();

    // Test player / sandbox sessions receive every Vehicles-category item once,
    // so all vehicles are immediately owned and usable.
    grantAllVehicleItemsIfDebug();

    // Re-place parked vehicles from the internal position store so a vehicle is
    // always physically present where it was memorized (never silently vanishes).
    vehicleManager.reconcileToStore();

    // Update vehicle sprites based on map
    ['ship', 'boat', 'airship'].forEach(type => {
      const vehicle = vehicleManager.getVehicle(type);
      if (vehicle) {
        const config = vehicleManager.getConfig(vehicle);
        const sprite = selectVehicleSprite(config);
        if (sprite) {
          vehicle._characterName = sprite.name;
          vehicle._characterIndex = sprite.index;
          vehicle.refresh();
        }
      }
    });

    // Set correct player speed when entering a map
    if (!$gamePlayer.isInVehicle()) {
      if ($gameMap.mapId() === 315) {
        $gamePlayer.setMoveSpeed(VehicleConfig.SPEED.map315OnFootSpeed);
      } else {
        $gamePlayer.setMoveSpeed(VehicleConfig.SPEED.onFootBase);
      }
    }

    // Character-creation vehicle origins (bike, car, camper): the player is
    // dropped into a freshly generated procedural biome (picked in
    // CharacterCreation.startVehicleOrigin / startBikeOrigin). Place them in a
    // passable 4x4 zone and park the vehicle on the tile BESIDE them, unmounted
    // and with nobody inside its interior, so the first thing they do is decide
    // whether to get in.
    //
    // The camper is the engine's ship; the car and the bike share its boat, so
    // that slot is pointed at the right sub-type before the vehicle is moved,
    // or the move would be recorded against whichever one it last stood for.
    const ccFieldStart = $gameTemp._ccVehicleFieldStart;
    if (ccFieldStart && $gameMap.mapId() === proceduralMapId()) {
      $gameTemp._ccVehicleFieldStart = null;
      const slot = ccFieldStart === 'camper' ? 'ship' : 'boat';
      if (slot === 'boat') $gameSystem._boatType = ccFieldStart; // 'bike' | 'car'
      const vehicle = vehicleManager.getVehicle(slot);
      const zone = PositionFinder.findPassable4x4(vehicle);
      if (zone) {
        $gamePlayer.locate(zone.x + 1, zone.y + 1);
        $gamePlayer.setDirection(2);
      }
      // The clearing is only tested for passability, and none may have been
      // found at all: CharacterCreation has the last word on whether the party
      // is standing in the scenery, and moves them off it if they are.
      if (window.CCOriginPlacement) window.CCOriginPlacement.placeOnStandableTile();
      if (vehicle) {
        const pos = PositionFinder.findNearPlayer(vehicle);
        if (pos) {
          vehicle.setLocation($gameMap.mapId(), pos.x, pos.y);
          vehicleManager.savePosition(vehicle);
          vehicle.refresh();
        }
      }
    }

    // Handle auto-ride after transfer
    this._handleAutoRide();

    // Spawn the vehicle on the map whenever the player walked out of its
    // interior through a plain Transfer event (no return command used).
    this._handleExitInteriorSpawn();

    if ($gameTemp._pendingFastTravelType) {
      const type = $gameTemp._pendingFastTravelType;
      $gameTemp._pendingFastTravelType = null;
      setTimeout(() => {
        const scene = SceneManager._scene;
        if (scene && scene.startFastTravel) scene.startFastTravel(type);
      }, 300);
    }
  };

  // When the player exits a vehicle interior onto a normal map (via a plain
  // Transfer event rather than a "return to vehicle" command), park the vehicle
  // beside the player so it is always physically present on the map. The sprite
  // is sized to the destination: the small/normal sprite on the world map (315)
  // and the large sprite everywhere else, via selectVehicleSprite().
  Scene_Map.prototype._handleExitInteriorSpawn = function () {
    const fromMapId = $gameTemp._exitedVehicleInteriorMapId;
    $gameTemp._exitedVehicleInteriorMapId = null;
    if (!fromMapId) return;

    // Arrived in another interior (e.g. one vehicle parked inside a building):
    // there is no room to spawn, so leave the vehicle where it was saved.
    if (mapCache.isInterior($gameMap.mapId())) return;

    const config = getConfigByInteriorMapId(fromMapId);
    if (!config) return;

    // The car and bike share the 'boat' slot; coming out of the car interior
    // means the boat is the car, so keep the sub-type consistent.
    if (config.type === 'boat') $gameSystem._boatType = 'car';

    const vehicle = vehicleManager.getVehicle(config.type);
    if (!vehicle) return;

    // Self-heal airship exit: ensure the player and followers are visible again,
    // regardless of how the player boarded. A failed getOffVehicle can leave the
    // player flagged isInAirship() with everything transparent/hidden (#158).
    if (config.type === 'airship') {
      $gamePlayer.setTransparent(false);
      $gamePlayer.followers().show();
      $gamePlayer.refresh();
    }

    const pos = PositionFinder.findNearPlayer(vehicle);
    if (!pos) return;

    vehicle.setLocation($gameMap.mapId(), pos.x, pos.y);
    vehicleManager.savePosition(vehicle);

    const sprite = selectVehicleSprite(config);
    if (sprite) {
      vehicle._characterName = sprite.name;
      vehicle._characterIndex = sprite.index;
    }
    vehicle.refresh();
  };

  Scene_Map.prototype._handleAutoRide = function () {
    if ($gameTemp._autoRideTimer > 0) return;

    const vehicleEntries = [
      { flag: '_spawnCamperAfterTransfer', autoFlag: '_autoRideCamperAfterSpawn', type: 'ship' },
      { flag: '_spawnCarAfterTransfer', autoFlag: '_autoRideCarAfterSpawn', type: 'boat' },
      { flag: '_spawnStarshipAfterTransfer', autoFlag: '_autoRideStarshipAfterSpawn', type: 'airship' }
    ];

    vehicleEntries.forEach(({ flag, autoFlag, type }) => {
      if (!$gameTemp[flag]) return;

      if (!mapCache.isInterior($gameMap.mapId())) {
        const vehicle = vehicleManager.getVehicle(type);
        const config = vehicleManager.getConfig(vehicle);
        const spawnData = $gameTemp[flag];

        if (vehicle && config) {
          const pos = PositionFinder.findValidPosition(spawnData.x, spawnData.y, vehicle);
          if (pos) {
            vehicle.setLocation($gameMap.mapId(), pos.x, pos.y);
            vehicleManager.savePosition(vehicle);

            if ($gameTemp[autoFlag]) {
              $gamePlayer.setPosition(pos.x, pos.y);
              $gameTemp._autoRideTimer = AUTO_RIDE_DELAY_FRAMES;
              $gameTemp._vehicleToRide = vehicle;
              $gameTemp._vehicleType = type;
            }
          }
        }
      }
      // Always clear the flag to prevent leaks
      $gameTemp[flag] = null;
      $gameTemp[autoFlag] = false;
    });
  };

  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update.call(this);

    // The card belongs to the choice list it explains. The choice callback
    // normally takes it down, but a message cleared out from under the menu
    // (an interpreter starting, a common event) never calls that back, and the
    // card would be left hanging over the map.
    if (statusCardEl && !$gameMessage.isChoice()) hideVehicleStatusCard();

    // A vehicle chosen from the "which one?" list opens its action menu here,
    // once the choice list it was picked from has finished closing.
    if (pendingVehicleMenu && !$gameMessage.isBusy()) {
      const vehicle = pendingVehicleMenu;
      pendingVehicleMenu = null;
      $gamePlayer.showVehicleActionMenu(vehicle, false);
    }

    // Menu (Y on gamepad) / ESC while riding opens the normal game menu. Using
    // 'menu' instead of 'cancel' moves it off the B button (which is now free
    // for back-out) while still firing on keyboard ESC (#58).
    if (isPlayerRidingCustomVehicle() && !$gameMessage.isBusy() &&
      (Input.isTriggered('menu') || TouchInput.isCancelled())) {
      SceneManager.push(Scene_Menu);
      Input.clear();
    }

    // Handle auto-ride timer
    if ($gameTemp._autoRideTimer > 0) {
      $gameTemp._autoRideTimer--;
      if ($gameTemp._autoRideTimer === 0) {
        this._executeAutoRide();
      }
    }
  };

  Scene_Map.prototype._executeAutoRide = function () {
    const vehicle = $gameTemp._vehicleToRide;
    const type = $gameTemp._vehicleType;

    if (vehicle && vehicle._mapId === $gameMap.mapId()) {
      $gamePlayer.setPosition(vehicle.x, vehicle.y);
      $gamePlayer._vehicleType = type;
      $gamePlayer.getOnVehicle();

      if (!$gamePlayer.isInVehicle()) {
        $gamePlayer._vehicleGettingOn = true;
        vehicle.getOn();
      }

      AudioManager.playSe({ name: 'Decision1', pan: 0, pitch: 100, volume: 90 });
    }

    $gameTemp._vehicleToRide = null;
    $gameTemp._vehicleType = null;
  };

  const _Scene_Map_updateCallMenu = Scene_Map.prototype.updateCallMenu;
  Scene_Map.prototype.updateCallMenu = function () {
    if (isPlayerRidingCustomVehicle()) {
      return;
    }
    _Scene_Map_updateCallMenu.call(this);
  };

  // ============================================================================
  // Plugin Commands
  // ============================================================================

  class PluginCommands {
    static register() {
      this._registerCommand('summonCamper', () => {
        vehicleManager.summon('ship');
      });

      this._registerCommand('summonCar', () => {
        vehicleManager.summon('boat', 'car');
      });

      this._registerCommand('summonBike', () => {
        vehicleManager.summon('boat', 'bike');
      });

      this._registerCommand('summonBoat', () => {
        vehicleManager.summon('boat', 'boat');
      });

      this._registerCommand('summonBroom', () => {
        vehicleManager.summon('boat', 'broom');
      });

      this._registerCommand('summonAirship', () => {
        vehicleManager.summon('airship');
      });

      // What a roadside parking sign calls up: the last vehicle driven, Starship
      // and Boat excluded. See MergedVehicleSystem.summonLastUsedVehicle.
      this._registerCommand('summonLastVehicle', () => {
        window.MergedVehicleSystem.summonLastUsedVehicle();
      });

      this._registerCommand('initializeCamperPosition', function () {
        const eventId = this._eventId;
        const event = $gameMap.event(eventId);
        if (event) {
          const vehicle = vehicleManager.getVehicle('ship');
          if (vehicle) {
            vehicle.setLocation($gameMap.mapId(), event.x, event.y);
            vehicleManager.savePosition(vehicle);
          }
        }
      });

      this._registerCommand('teleportToVehicle', (args) => {
        this._teleportToVehicle(args.vehicleType || 'ship');
      });

      this._registerCommand('showTravelOptions', () => {
        const config = getConfigByInteriorMapId($gameMap.mapId());
        if (!config) {
          showLocalizedMessage(T('VehicleSystem.notInsideVehicle'));
          return;
        }
        $gamePlayer.showVehicleInteriorMenu(config);
      });

      this._registerCommand('openVehicleMenu', (args) => {
        this._openVehicleMenu((args && args.vehicleType) || 'auto');
      });

      this._registerCommand('saveCamperAndTravel', () => {
        this._saveAndTravel(VehicleConfig.CAMPER);
      });

      this._registerCommand('saveCarAndTravel', () => {
        this._saveAndTravel(VehicleConfig.CAR);
      });

      this._registerCommand('saveAirshipAndTravel', () => {
        this._saveAndTravel(VehicleConfig.AIRSHIP);
      });

      this._registerCommand('returnToCamper', () => {
        this._returnToVehicle(VehicleConfig.CAMPER, false);
      });

      this._registerCommand('returnToCar', () => {
        this._returnToVehicle(VehicleConfig.CAR, false);
      });

      this._registerCommand('returnToAirship', () => {
        this._returnToVehicle(VehicleConfig.AIRSHIP, false);
      });

      this._registerCommand('returnAndRideCamper', () => {
        this._returnToVehicle(VehicleConfig.CAMPER, true);
      });

      this._registerCommand('returnAndRideCar', () => {
        this._returnToVehicle(VehicleConfig.CAR, true);
      });

      this._registerCommand('returnAndRideAirship', () => {
        this._returnToVehicle(VehicleConfig.AIRSHIP, true);
      });
    }

    static _registerCommand(name, callback) {
      PluginManager.registerCommand(PLUGIN_NAME, name, callback);
      if (PLUGIN_NAME !== 'Vehicle/' + PLUGIN_NAME) {
        PluginManager.registerCommand('Vehicle/' + PLUGIN_NAME, name, callback);
      }
    }

    /**
     * Opens the same menu the action button gives on a vehicle.
     *   'auto' -> the vehicle being ridden, else the interior the player stands
     *             in, else a vehicle on the player / facing tile.
     *   a type -> that vehicle, as long as it is parked on the current map.
     */
    static _openVehicleMenu(type) {
      if ($gameMessage.isBusy()) return;

      if (isPlayerRidingCustomVehicle()) {
        const ridden = $gamePlayer.vehicle();
        if (type === 'auto' || ridden === vehicleManager.getVehicle(type)) {
          $gamePlayer.showVehicleActionMenu(ridden, true);
          return;
        }
      }

      if (type === 'auto') {
        const interiorConfig = getConfigByInteriorMapId($gameMap.mapId());
        if (interiorConfig) {
          $gamePlayer.showVehicleInteriorMenu(interiorConfig);
          return;
        }
        if ($gamePlayer.openParkedVehicleMenu()) return;
        showLocalizedMessage(T('VehicleSystem.noVehicleHere'));
        return;
      }

      const vehicle = vehicleManager.getVehicle(type);
      const config = vehicleManager.getConfig(vehicle);
      if (!vehicle || !config) {
        showLocalizedMessage(T('VehicleSystem.cannotFindVehicle'));
        return;
      }
      // Ask the store, not the map: the named vehicle may be parked right here
      // and still not materialized (parked under another one, or waiting for the
      // shared Car / Bike / Boat slot).
      const parked = materializeVehicle(VehiclePosition.keyForConfig(config));
      if (!parked) {
        showLocalizedMessage(T('VehicleSystem.vehicleNotHere', { vehicle: vehicleNounName(config) }));
        return;
      }
      $gamePlayer.showVehicleActionMenu(parked, false);
    }

    static _teleportToVehicle(type) {
      const vehicle = vehicleManager.getVehicle(type);
      const config = vehicleManager.getConfig(vehicle);

      if (!vehicle || !config) {
        showLocalizedMessage(T('VehicleSystem.cannotFindLocation', { vehicle: config ? vehicleNounName(config) : T('VehicleSystem.genericVehicle') }));
        return;
      }

      const key = VehiclePosition.keyForConfig(config);
      const dest = resolveReturnDestination(key);
      const mapId = dest.mapId;
      const x = dest.x;
      const y = dest.y;

      if (!mapId || !x || !y) return;

      if (mapId === $gameMap.mapId()) {
        const pos = PositionFinder.findValidPosition(x, y, $gamePlayer);
        if (pos) {
          $gamePlayer.reserveTransfer($gameMap.mapId(), pos.x, pos.y,
            $gamePlayer.direction(), 0);
        }
      } else {
        vehicle.setLocation(mapId, x, y);
        const pos = PositionFinder.findValidPosition(x, y, $gamePlayer);
        if (pos) {
          $gamePlayer.reserveTransfer(mapId, pos.x, pos.y, 2, 0);
        }
      }

      AudioManager.playSe({ name: 'Teleport', pan: 0, pitch: 100, volume: 90 });
      // Animation removed from summoning as per request
      // $gameTemp.requestAnimation([$gamePlayer], 52);
    }

    static _saveAndTravel(config, opts) {
      // Use disembarkLeavingParked (not the default getOffVehicle) so the player
      // is reliably removed from the airship even when it is parked over water or
      // another non-land tile. The default getOffVehicle silently fails there,
      // leaving the player flagged isInAirship() (transparent player + hidden
      // followers), which makes all sprites vanish after exiting the interior (#158).
      if ($gamePlayer.isInVehicle()) {
        disembarkLeavingParked($gamePlayer.vehicle());
      }

      $gamePlayer.reserveTransfer(config.interior.mapId,
        config.interior.x,
        config.interior.y, 0, 0);

      // `silent` lets a caller (e.g. the menu's Return to Ship) play its own SE
      // without doubling this one.
      if (!opts || !opts.silent) {
        AudioManager.playSe({ name: 'Teleport', pan: 0, pitch: 100, volume: 90 });
      }
    }

    static _returnToVehicle(config, autoRide) {
      const key = VehiclePosition.keyForConfig(config);
      const dest = resolveReturnDestination(key);
      const mapId = dest.mapId;
      const x = dest.x;
      const y = dest.y;

      const vehicle = vehicleManager.getVehicle(config.type);
      if (vehicle) {
        vehicle.setLocation(mapId, x, y);
      }

      $gamePlayer.reserveTransfer(mapId, x, y, 2, 0);

      // Use a generic flag system that works for any vehicle type
      const flagName = vehicleManager.getReturnFlagName(config) || 'Generic';  // i18n-ignore  return-flag id
      $gameTemp[`_spawn${flagName}AfterTransfer`] = { x, y };  // i18n-ignore  temp flag key

      if (autoRide) {
        $gameTemp[`_autoRide${flagName}AfterSpawn`] = true;  // i18n-ignore  temp flag key
      }

      AudioManager.playSe({ name: 'Door1', pan: 0, pitch: 100, volume: 90 });
    }
  }

  // ============================================================================
  // Memory Management
  // ============================================================================

  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    _Scene_Map_terminate.call(this);

    // The choice callback normally takes the card down, but a scene that ends
    // under an open menu (a load, an interpreter transfer) never gets there,
    // and a stranded card would hang over the next map.
    hideVehicleStatusCard();

    if ($gameMap.mapId() % 10 === 0) {
      mapCache.clear();
    }
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  const _DataManager_setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame.call(this);
    ConfigManager.alwaysDash = true;
  };

  PluginCommands.register();

  // ============================================================================
  // The Mount: riding a living companion
  // ============================================================================
  //
  // Every other vehicle is a thing the party owns and calls for. A mount is a
  // creature that is already walking with them, so it has no summoning item, no
  // entry in the Vehicles menu and no way to be conjured onto a tile. The party
  // climbs onto it from the Pets page and gets off wherever they stop.
  //
  // Who may be ridden is not decided here: window.PetSystem.isRidable() reads
  // the <Ridable> note tag of the monster a companion was recruited from and the
  // `ridable` flag of its sprite's wardrobe entry (js/db/WorldGen/NPCs.json).
  // Party members are never candidates: only pet-registry records are offered,
  // and a person is an actor rather than one of those.

  function petSystem() { return window.PetSystem || null; }

  // Every registered companion the party could sit on, in registry order.
  function ridableCompanions() {
    const ps = petSystem();
    if (!ps || !ps.getRidablePets) return [];
    try { return ps.getRidablePets() || []; } catch (e) { return []; }
  }

  // The companion currently being ridden, or null on foot. Kept by id on
  // $gameSystem so it travels in the save, and re-checked against the registry
  // every read so a companion abandoned mid-ride does not leave a ghost.
  function mountedPet() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
    const id = $gameSystem._mountPetId;
    if (id == null) return null;
    const ps = petSystem();
    const pet = ps && ps.getPet ? ps.getPet(id) : null;
    if (!pet || (ps.isRidable && !ps.isRidable(id))) {
      $gameSystem._mountPetId = null;
      return null;
    }
    return pet;
  }

  // The sheet the mount slot wears: the companion's own, or nothing at all when
  // there is no mount, which draws an empty tile rather than a stray sprite.
  function mountSprite() {
    const pet = mountedPet();
    if (!pet) return { name: '', index: 0 };
    return { name: pet.characterName || '', index: pet.characterIndex || 0 };
  }

  // Put the party on a registered companion. Answers true when they are aboard.
  function mountPet(petId) {
    const ps = petSystem();
    if (!ps || !ps.isRidable || !ps.isRidable(petId)) return false;
    if (typeof $gamePlayer === 'undefined' || !$gamePlayer) return false;
    // Already at the wheel of something else: they get off that first, which is
    // the same rule as walking up to another vehicle while driving.
    if ($gamePlayer.isInVehicle()) {
      const current = $gamePlayer.vehicle();
      const config = vehicleManager.getConfig(current);
      if (config && config.mount && mountedPet() && mountedPet().id === petId) return true;
      disembarkLeavingParked(current);
    }
    $gameSystem._mountPetId = petId;
    vehicleManager.setBoatKey('mount');
    const vehicle = vehicleManager.getVehicle('boat');
    if (!vehicle) { $gameSystem._mountPetId = null; return false; }
    const sprite = mountSprite();
    vehicle._characterName = sprite.name;
    vehicle._characterIndex = sprite.index;
    // The animal is standing with the party, so it is placed under them rather
    // than beside them, and boarded through the same path every other vehicle
    // is boarded by (speed, followers and the remembered ride all come with it).
    moveVehicleInternally(vehicle, $gameMap.mapId(), $gamePlayer.x, $gamePlayer.y);
    vehicleManager.savePosition(vehicle);
    vehicle.refresh();
    startDrivingVehicle(vehicle);
    if (!$gamePlayer.isInVehicle() && !$gamePlayer._vehicleGettingOn) {
      $gameSystem._mountPetId = null;
      return false;
    }
    // The companion is being sat on, not trailing the party, so it leaves the
    // follower chain for as long as the ride lasts (the pet follower draws the
    // ACTIVE pet, and the mount is no longer it).
    if (ps.getActivePet && ps.getActivePet() && ps.getActivePet().id === petId) {
      $gameSystem._mountWasActivePet = petId;
      ps.setActivePet(null);
    }
    return true;
  }

  // Get off, leaving the animal standing where the party stopped and putting it
  // back on the leash if that is where it came from.
  function dismountMount() {
    const pet = mountedPet();
    const vehicle = vehicleManager.getVehicle('boat');
    const riding = !!vehicle && $gamePlayer && $gamePlayer.isInVehicle() &&
      $gamePlayer.vehicle() === vehicle && vehicleManager.getConfig(vehicle) === VehicleConfig.MOUNT;
    if (riding) disembarkLeavingParked(vehicle);
    $gameSystem._mountPetId = null;
    const ps = petSystem();
    const back = $gameSystem._mountWasActivePet;
    $gameSystem._mountWasActivePet = null;
    if (ps && ps.setActivePet && back != null && pet && back === pet.id) ps.setActivePet(back);
    // Unplace the slot the same way an un-owned vehicle starts out, so nothing
    // is left standing invisibly on the tile the party got off at.
    VehiclePosition.set('mount', 315, 0, 0);
    if (vehicle) {
      vehicle._characterName = '';
      vehicle._characterIndex = 0;
      moveVehicleInternally(vehicle, 0, 0, 0);
      vehicle.refresh();
    }
    return !!pet;
  }

  // ============================================================================
  // Vehicle ownership (party carries the summoning item) + menu API
  // ============================================================================
  //
  // A vehicle is "owned" when the party holds its summoning item (Items.json,
  // <category:Vehicles>). Ownership is what lists a vehicle in the Vehicles menu
  // and lets it be spawned / repaired / refueled. Order below is the display order.

  const VEHICLE_MENU_CONFIGS = [
    VehicleConfig.CAMPER,
    VehicleConfig.CAR,
    VehicleConfig.BOAT,
    VehicleConfig.BIKE,
    VehicleConfig.BROOM,
    VehicleConfig.AIRSHIP
  ];

  // True when the party should be handed every Vehicles-category item for free:
  // the debug "Test" player, or an active sandbox session.
  function isVehicleGrantContext() {
    const isTester = typeof $gameActors !== 'undefined' && $gameActors &&
      $gameActors.actor(1) && $gameActors.actor(1).name() === 'Test';  // i18n-ignore  debug account name
    const isSandbox = !!(typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._isSandboxMode);
    return isTester || isSandbox;
  }

  // Give the party one of every item tagged <category:Vehicles> in Items.json that
  // it does not already own, so Test / sandbox sessions can access all vehicles.
  // Runs once (tracked by $gameSystem._vehiclesGranted); re-evaluated each map load
  // so it also fires if sandbox mode is enabled mid-game.
  function grantAllVehicleItemsIfDebug() {
    if (typeof $gameParty === 'undefined' || !$gameParty || typeof $dataItems === 'undefined') return;
    if (!isVehicleGrantContext()) return;
    if ($gameSystem._vehiclesGranted) return;
    $gameSystem._vehiclesGranted = true;

    for (let i = 1; i < $dataItems.length; i++) {
      const item = $dataItems[i];
      if (!item) continue;
      const category = item.meta ? (item.meta.category || item.meta.Category) : null;
      if (!category || String(category).trim().toLowerCase() !== 'vehicles') continue;
      if (!$gameParty.hasItem(item)) $gameParty.gainItem(item, 1);
    }
  }

  // True when the party holds the summoning item of the vehicle a key names, i.e.
  // when that vehicle appears in the Vehicles menu. Nothing is placed on a map,
  // drawn or offered for boarding unless this says so.
  function ownsVehicleKey(key) {
    return ownsVehicleConfig(configForVehicleKey(key));
  }

  function ownsVehicleConfig(config) {
    // Nobody buys a mount, and there is no such thing as one standing parked:
    // the slot exists exactly while the party is on an animal's back. Every
    // ownership gate in the plugin (placing, drawing, offering to board) reads
    // this, so a dismounted mount is simply not there to walk into.
    if (config && config.mount) return !!mountedPet();
    if (!config || !config.summonItemId) return false;
    if (typeof $gameParty === 'undefined' || !$gameParty) return false;
    if (typeof $dataItems === 'undefined') return false;
    const item = $dataItems[config.summonItemId];
    return !!(item && $gameParty.hasItem(item));
  }

  // The Mount is deliberately absent from VEHICLE_MENU_CONFIGS (it is never
  // summoned or listed), so key lookups fall through to the full table.
  function configByVehicleKey(key) {
    return VEHICLE_MENU_CONFIGS.find(c => upgradeTypeForConfig(c) === key) ||
      configForVehicleKey(key);
  }

  // The vehicle the party last took the wheel of, remembered on $gameSystem so it
  // travels in the save. Roadside parking signs call that one back rather than
  // always the camper.
  function rememberVehicleUsed(config) {
    // A mount is never called back: it is a companion, and it is fetched from
    // the Pets page rather than from a parking sign.
    if (config && config.mount) return;
    const key = upgradeTypeForConfig(config);
    if (!key || typeof $gameSystem === 'undefined' || !$gameSystem) return;
    $gameSystem._lastVehicleUsed = key;
  }

  // Vehicles a parking sign may call up: everything owned except the Starship
  // (nothing that size sets down at a lay-by) and the Boat (it wants water under
  // it, not a parking space).
  const PARKING_SIGN_EXCLUDED_KEYS = ['airship', 'boat'];

  // Owned, sign-summonable vehicles as keys, in Vehicles-menu order.
  function parkingSignVehicleKeys() {
    return VEHICLE_MENU_CONFIGS
      .filter(c => ownsVehicleConfig(c))
      .map(c => upgradeTypeForConfig(c))
      .filter(key => key && !PARKING_SIGN_EXCLUDED_KEYS.includes(key));
  }

  // The camper interior carries no map name of its own (a single blank space in
  // the map data). For the crew that named it, standing inside it is standing
  // inside The Beast, so the map banner says so.
  const _Game_Map_displayName_Beast = Game_Map.prototype.displayName;
  Game_Map.prototype.displayName = function () {
    const interiorId = VehicleConfig.CAMPER.interior && VehicleConfig.CAMPER.interior.mapId;
    if (this.mapId() === interiorId) {
      const named = vehicleDisplayName(VehicleConfig.CAMPER);
      if (named !== VehicleConfig.CAMPER.name) return named;
    }
    return _Game_Map_displayName_Beast.call(this);
  };

  // Serializable snapshot of a vehicle for the menu / refuel UIs.
  // A vehicle can be repaired when a maintenance/upgrade scene exists for it
  // (Camper, Car, Bike, Boat, Airship). Falls back to the legacy repairEvent flag
  // if VehicleSystemRepair hasn't loaded yet.
  function configHasRepair(config, key) {
    if (window.VehicleMaintenance && window.VehicleMaintenance.has) {
      return window.VehicleMaintenance.has(key);
    }
    return !!config.repairEvent;
  }

  // Where a vehicle was left, in one line: the name of the place (a named world
  // square or biome override first, then the map's own display name, then the
  // biome) and the exact tile, with the world square it answers to on map 315.
  // WorldMapTransfer writes it, so a camper left in Ghent station reads the same
  // here as it does anywhere else that has to say where a thing is.
  function vehicleParkedLabel(key) {
    const wmt = transfer();
    const loc = VehiclePosition.location(key);
    if (!wmt || !loc || !loc.mapId) return '';
    return wmt.describeLocation(loc);
  }

  function vehicleMenuInfo(config) {
    const key = upgradeTypeForConfig(config);
    const usesFuel = !!config.usesFuel;
    // How sound the vehicle is, and the parts that answer for it, so the garage
    // can say what is wrong with it and not only where it was left.
    const repair = window.VehicleSystemRepair;
    const condition = repair?.vehicleCondition?.(key) ?? null;
    const health = repair?.totalHealth?.(key) || null;
    const parts = repair?.partsStatus?.(key) || [];
    const item = (typeof $dataItems !== 'undefined') ? $dataItems[config.summonItemId] : null;
    const sprite = (config.sprites && config.sprites.normal) ? config.sprites.normal : null;
    const loc = VehiclePosition.location(key);
    return {
      key,
      // Where it is parked, for the Vehicles menu and anything else that lists it.
      parkedAt: vehicleParkedLabel(key),
      parkedMapId: loc ? loc.mapId : 0,
      parkedX: loc ? loc.x : 0,
      parkedY: loc ? loc.y : 0,
      parkedWorldX: loc ? loc.worldX : 0,
      parkedWorldY: loc ? loc.worldY : 0,
      parkedOnPlanet: loc ? (loc.planet || '') : '',
      name: vehicleDisplayName(config),
      type: config.type,
      usesFuel,
      canRefuelAtPump: !!config.canRefuelAtPump,
      hasRepair: configHasRepair(config, key),
      // Condition is the weighted average a status card prints; hp/mhp is the
      // same record read as a bar. A dead critical part is a vehicle that will
      // not move at all, so it is answered separately from a low bar.
      condition,
      hp: health ? health.current : null,
      mhp: health ? health.max : null,
      broken: !!repair?.checkCriticalParts?.(key),
      parts,
      fuel: usesFuel ? VehicleFuel.get(key) : 0,
      max: usesFuel ? VehicleFuel.max(key) : 0,
      iconIndex: item ? (item.iconIndex || 0) : 0,
      // Overworld character sprite used to draw a left-facing portrait in the menu.
      spriteName: sprite ? sprite.name : '',
      spriteIndex: sprite ? (sprite.index || 0) : 0
    };
  }

  window.MergedVehicleSystem = {
    version: '3.4.0',
    cache: mapCache,
    manager: vehicleManager,

    // Teleport the player into the Starship interior (map 721). Reuses the same
    // path as the "saveAirshipAndTravel" plugin command, so it works from foot
    // (e.g. the "Return to Ship" menu action on an alien planet surface) as well
    // as from the airship itself.
    enterAirshipInterior(opts) {
      PluginCommands._saveAndTravel(VehicleConfig.AIRSHIP, opts);
    },

    // The maintenance key ('camper' | 'car' | 'bike' | 'boat' | 'broom' |
    // 'airship') of the vehicle the party is at the wheel of, or null on foot.
    // Whatever just ran into something wants to know what it is, so it can be
    // billed for it (BattleSystemEnhancedEncounters' vehicle hit).
    riddenVehicleKey() {
      if (!isPlayerRidingCustomVehicle()) return null;
      return upgradeTypeForConfig(vehicleManager.getConfig($gamePlayer.vehicle()));
    },

    // Live fuel of the vehicle the player is currently riding, or null when on
    // foot / in a fuel-free vehicle. Consumed by the travel HUD (TimeDateSystem.js)
    // to render the fuel as an HTML bar instead of the old top-left gauge.
    getActiveFuelStatus() {
      if (!isPlayerRidingCustomVehicle()) return null;
      const vehicle = $gamePlayer.vehicle();
      const config = vehicleManager.getConfig(vehicle);
      if (!config || !config.usesFuel) return null;
      const max = configMaxFuel(config) || 1;
      const fuel = FuelSystem.getFuel(vehicle);
      return { name: vehicleDisplayName(config), fuel, max, pct: Math.round(Math.max(0, Math.min(1, fuel / max)) * 100) };
    },

    // The vehicle the party is ABOARD, for the party HUD (PartyHud.js): the one
    // they are at the wheel of, or - on foot inside its cabin - the one whose
    // interior map they are standing on (the Camper, the Car and the Starship
    // each have one). Null anywhere else, which is how the HUD knows to take
    // the vehicle row down again the moment they step out.
    //
    // Health is the whole vehicle summed part by part out of its maintenance
    // record, so one bar says what the workshop panel lists line by line. Fuel
    // is the vehicle's OWN tank: for the Starship that is its rocket fuel, not
    // the Hyperflux or the Schrodingerite the star map runs on.
    getHudVehicleStatus() {
      if (typeof $gameMap === 'undefined' || !$gameMap) return null;
      // The 3D world is asked first: out there the party is driving something
      // the 2D map knows nothing about (they can swap vehicles without ever
      // coming back to it), and the row over the cards has to be the thing
      // actually under them.
      const outside = window.VoxelWorldSystem?.ridingKey?.() || null;
      const ridden = isPlayerRidingCustomVehicle() ? $gamePlayer.vehicle() : null;
      const config = outside
        ? configByUpgradeType(outside)
        : (ridden ? vehicleManager.getConfig(ridden)
                  : getConfigByInteriorMapId($gameMap.mapId()));
      if (!config) return null;
      const key = upgradeTypeForConfig(config);
      if (!key) return null;

      const health = window.VehicleSystemRepair?.totalHealth?.(key) || null;
      const usesFuel = !!config.usesFuel;
      return {
        key,
        name: vehicleDisplayName(config),
        driving: !!(ridden || outside),
        // A vehicle with no maintenance record of its own (the Broom) has no
        // bar to draw; the HUD reads null as "no health line".
        hp: health ? health.current : null,
        mhp: health ? health.max : null,
        usesFuel,
        fuel: usesFuel ? VehicleFuel.get(key) : 0,
        maxFuel: usesFuel ? VehicleFuel.max(key) : 0
      };
    },

    // True while the party is standing inside a vehicle's own cabin. Their load
    // is off their backs in there, so the encumbrance speed penalty is waived
    // (see ItemSystemUtils#realMoveSpeed).
    isOnVehicleInteriorMap() {
      if (typeof $gameMap === 'undefined' || !$gameMap) return false;
      return !!getConfigByInteriorMapId($gameMap.mapId());
    },

    // True while the leader is on a vehicle that is RIDDEN rather than sat in:
    // the Bike or the Broom. There is no hull, so every member is on one of their
    // own out in the open (see "Followers ride along too" below), which is why
    // this is not the same question as isInVehicle().
    isRidingPortable() {
      return !!riddenPortableConfig();
    },

    // ...and true when that vehicle keeps to the same ground the party walks on,
    // which is the Bike and not the Broom: a party can pedal along beside a
    // cyclist and cannot walk after somebody flying over a lake. What the loose
    // formation (Core/AutoIdleExplorer.js) asks before letting members go on
    // living their own lives while the leader rides.
    isPartyRidingAlong() {
      const config = riddenPortableConfig();
      return !!config && !config.flying;
    },

    // Puts the party out of whatever they are riding on the spot, without the
    // land-ok tile Game_Player#getOffVehicle insists on, leaving the vehicle
    // parked where it stands. Answers whether anybody actually got out.
    //
    // MapBattleMode fights are fought on the map itself, so a fight that opens
    // while the party is at the wheel has to put them on their feet first:
    // a rider is one transparent character with its followers stowed, and the
    // battlefield needs the party standing on it.
    disembark() {
      if (!$gamePlayer || !$gamePlayer.isInVehicle()) return false;
      const vehicle = $gamePlayer.vehicle();
      if (!vehicle) return false;
      disembarkLeavingParked(vehicle);
      return true;
    },

    // Every vehicle the party owns (holds the summoning item for), in menu order.
    // Where a vehicle's own inside is, for anything that has to put the party
    // aboard it without walking them through a door: the 3D world does exactly
    // that when a starship is flown out of the atmosphere.
    interiorFor(key) {
      const c = configByVehicleKey(key);
      const i = c && c.interior;
      if (!i || !i.mapId) return null;
      return { mapId: i.mapId, x: i.x, y: i.y, direction: i.direction || 0 };
    },

    // ---- The Mount ------------------------------------------------------
    // Deliberately NOT part of getOwnedVehicles / canSpawnHere / ownsVehicle:
    // a mount is never summoned and never listed with the machines.

    // Every companion the party could ride right now, for the Pets page.
    getRidableCompanions() {
      return ridableCompanions();
    },

    // The companion being ridden, or null on foot.
    getMountedPet() {
      return mountedPet();
    },

    // Is this particular companion the one under the party right now?
    isMounted(petId) {
      const pet = mountedPet();
      return !!pet && pet.id === petId;
    },

    // Climb onto a registered ridable companion. False when it cannot be ridden.
    mountPet(petId) {
      return mountPet(petId);
    },

    // Get off whatever living thing the party is on. False when they were afoot.
    dismount() {
      return dismountMount();
    },

    getOwnedVehicles() {
      return VEHICLE_MENU_CONFIGS.filter(ownsVehicleConfig).map(vehicleMenuInfo);
    },

    // Owned vehicles that both use fuel and can be filled at a roadside pump
    // (Camper, Car). Consumed by VehicleSystemRefuel to build the station menu.
    getRefuelableVehicles() {
      return VEHICLE_MENU_CONFIGS
        .filter(c => ownsVehicleConfig(c) && c.usesFuel && c.canRefuelAtPump)
        .map(vehicleMenuInfo);
    },

    // True when the party owns the vehicle identified by key ('camper','car',
    // 'boat','bike','airship').
    ownsVehicle(key) {
      return ownsVehicleConfig(configByVehicleKey(key));
    },

    // False when there is no map loaded to summon onto, and - for the Starship
    // alone - when that map is an interior. Every other vehicle may be summoned
    // indoors and out.
    canSpawnHere(key) {
      if (typeof $gameMap === 'undefined' || !$gameMap) return false;
      if (key === 'airship' && starshipBarredHere()) return false;
      return true;
    },

    // Summons the vehicle the party last drove to a tile beside them: what a
    // roadside parking sign (SignPark) does. The Starship and the Boat are never
    // called up this way, so the last of the others driven answers; with nothing
    // driven yet (or only excluded ones) the first owned vehicle comes instead.
    // Says so and summons nothing when the party owns no vehicle at all.
    summonLastUsedVehicle() {
      const keys = parkingSignVehicleKeys();
      if (!keys.length) {
        showLocalizedMessage(T('VehicleSystem.noVehiclesOwned'));
        return false;
      }
      const last = $gameSystem ? $gameSystem._lastVehicleUsed : null;
      const config = configByVehicleKey(keys.includes(last) ? last : keys[0]);
      if (!config) return false;
      vehicleManager.summon(config.type, config.boatSubType);
      return true;
    },

    // The whole garage as one choice window: what the Vehicles hotkey gives on
    // the map. A vehicle parked where the party stands opens its own action menu
    // (the same one the action button gives), any other one is summoned over.
    // Nothing is listed when the party owns nothing to list.
    showVehicleListMenu() {
      if (typeof $gameMessage === 'undefined' || $gameMessage.isBusy()) return false;
      const owned = this.getOwnedVehicles();
      if (!owned.length) {
        showLocalizedMessage(T('VehicleSystem.noVehiclesOwned'));
        return false;
      }
      const choices = [];
      const handlers = [];
      owned.forEach(info => {
        const here = !!parkedTileOnCurrentMap(info.key);
        const label = here
          ? T('VehicleSystem.listRowHere', { vehicle: info.name })
          : (info.parkedAt
            ? T('VehicleSystem.listRow', { vehicle: info.name, location: info.parkedAt })
            : T('VehicleSystem.listRowUnknown', { vehicle: info.name }));
        choices.push(label);
        handlers.push(() => {
          // A choice list cannot be replaced from inside its own callback, so the
          // action menu of a vehicle standing right here waits one frame.
          const parked = materializeVehicle(info.key);
          if (parked) { pendingVehicleMenu = parked; return; }
          if (!this.spawnVehicleByKey(info.key)) {
            showLocalizedMessage(T('VehicleSystem.noSummonIndoors'));
          }
        });
      });
      choices.push(T('VehicleSystem.cancel'));
      handlers.push(() => { });
      const cancelIndex = choices.length - 1;
      $gameMessage.setChoices(choices, 0, cancelIndex);
      $gameMessage.setChoiceCallback((choice) => {
        const handler = handlers[choice];
        if (handler) handler();
      });
      return true;
    },

    // Summon an owned vehicle to a nearby valid tile. Returns false if unowned
    // or if the party is standing somewhere that vehicle cannot be summoned.
    spawnVehicleByKey(key) {
      const c = configByVehicleKey(key);
      if (!c || !ownsVehicleConfig(c)) return false;
      if (!this.canSpawnHere(key)) return false;
      vehicleManager.summon(c.type, c.boatSubType);
      return true;
    },

    // True when the Boat could be dropped on the given tile (open water).
    canDeployBoatAt(x, y) {
      return isBoatPassableTile(x, y);
    },

    // Drops the Boat onto the given water tile and (by default) mounts the player.
    // Used by the water interaction menu ("Use boat") so the dinghy is deployed
    // right where the player is looking instead of on some nearby tile.
    // Returns false when the party doesn't own the boat or the tile isn't navigable.
    deployBoatAt(x, y, mount = true) {
      if (!ownsVehicleConfig(VehicleConfig.BOAT)) return false;
      if (!isBoatPassableTile(x, y)) return false;

      $gameSystem._boatType = 'boat';
      const vehicle = vehicleManager.getVehicle('boat');
      if (!vehicle) return false;

      if (vehicle.refresh) vehicle.refresh();
      vehicle.setLocation($gameMap.mapId(), x, y);
      vehicleManager.savePosition(vehicle);
      AudioManager.playSe({ name: "Teleport", pan: 0, pitch: 100, volume: 90 });

      // Board it directly: the engine boarding flow needs the boat on the tile the
      // player faces, which is exactly the tile the water menu was opened on.
      const d = $gamePlayer.direction();
      const frontX = $gameMap.roundXWithDirection($gamePlayer.x, d);
      const frontY = $gameMap.roundYWithDirection($gamePlayer.y, d);
      if (mount && !$gamePlayer.isInVehicle() && frontX === x && frontY === y) {
        startDrivingVehicle(vehicle);
      }
      return true;
    },

    // Open the repair / upgrade workshop for a vehicle that has one.
    openRepairByKey(key) {
      const c = configByVehicleKey(key);
      if (!c || !configHasRepair(c, key)) return false;
      openVehicleMaintenance(c);
      return true;
    },

    // Per-tile game-time multiplier for the vehicle the player is currently riding
    // on the world map: reduced while a ground vehicle drives over a road biome,
    // 1 otherwise (on foot, off-road, or in the Airship/Boat). Consumed by the
    // world-map time advance in TimeDateSystem.js.
    getWorldRoadTimeFactor() {
      return isRidingOnWorldRoad() ? ROAD_TIME_FACTOR : 1;
    }
  };

  // ============================================================================
  // Game_Vehicle Hooks for graphics and riding sprites
  // ============================================================================

  const _Game_Vehicle_refresh = Game_Vehicle.prototype.refresh;
  Game_Vehicle.prototype.refresh = function () {
    if (this.isShip() || this.isBoat() || this.isAirship()) {
      const config = vehicleManager.getConfig(this);
      if (config) {
        if (this._driving) {
          // The ridden vehicle travels with the player, so it belongs to
          // whatever map is loaded now. The engine's own refresh() does this,
          // and this override replaces it wholesale: without the line, a
          // vehicle driven across a map transfer keeps the id of the map it
          // set off from, and the moment the player steps out the branch below
          // reads it as "parked somewhere else" and blanks the sprite, so the
          // vehicle vanishes from under them (most visibly on the world map,
          // which is always reached by driving into it).
          this._mapId = $gameMap.mapId();
          this._characterName = "";
          this._characterIndex = 0;
          this._isObjectCharacter = false;
        } else if (this._mapId === $gameMap.mapId() && !this._vsStacked) {
          const spriteInfo = selectVehicleSprite(config);
          if (spriteInfo) {
            this._characterName = spriteInfo.name;
            this._characterIndex = spriteInfo.index;
            this._isObjectCharacter = true;
          }
        } else {
          // Either parked on another map, or parked underneath another vehicle:
          // a blank graphic is how this plugin hides a vehicle that should not be
          // seen here (it also keeps it out of the sprite-footprint collision).
          this._characterName = "";
          this._characterIndex = 0;
          this._isObjectCharacter = true;
        }
        return;
      }
    }
    _Game_Vehicle_refresh.call(this);
  };

  const _Game_Vehicle_characterName = Game_Vehicle.prototype.characterName;
  Game_Vehicle.prototype.characterName = function () {
    const config = vehicleManager.getConfig(this);
    if (config) {
      if (this._driving) {
        // A vehicle that is ridden rather than sat in (the Bike, the Broom) has
        // a second sheet showing it with its rider aboard.
        const ridden = ridingSprite(config);
        if (ridden) {
          return ridden.name;
        }
        const spriteInfo = selectVehicleSprite(config, true);
        if (spriteInfo) {
          return spriteInfo.name;
        }
      }
    }
    return _Game_Vehicle_characterName.call(this);
  };

  const _Game_Vehicle_characterIndex = Game_Vehicle.prototype.characterIndex;
  Game_Vehicle.prototype.characterIndex = function () {
    const config = vehicleManager.getConfig(this);
    if (config) {
      if (this._driving) {
        const ridden = ridingSprite(config);
        if (ridden) {
          return ridden.index || 0;
        }
        const spriteInfo = selectVehicleSprite(config, true);
        if (spriteInfo) {
          return spriteInfo.index;
        }
      }
    }
    return _Game_Vehicle_characterIndex.call(this);
  };

  // ============================================================================
  // Followers ride along too
  // ============================================================================

  /**
   * The config of the portable vehicle the player is riding, or null. The Bike
   * and the Broom are ridden one to a body rather than sat in, so the whole party
   * is on one of its own rather than stowed inside a hull. Both are the shared
   * 'boat' vehicle, distinguished by $gameSystem._boatType.
   */
  function riddenPortableConfig() {
    if (!$gamePlayer) return null;
    const vehicle = $gamePlayer.vehicle();
    const driving = vehicle && vehicle._driving;
    if (!driving && !$gamePlayer.isInBoat() && $gamePlayer._vehicleType !== 'boat') return null;
    const config = configForVehicleKey(vehicleManager.boatKey());
    return (config && isPortableConfig(config)) ? config : null;
  }

  /**
   * The riding sprite this follower should wear, or null. A pet, a child or a
   * creature that walks with the party (PetFollowerSystem.js) is NOT given one:
   * a dog does not ride a bicycle, it runs alongside one.
   */
  function followerRidingSprite(follower) {
    if (window.Game_PetFollower && follower instanceof window.Game_PetFollower) return null;
    // A loose member who has gone into the water or onto a wall of their own
    // accord (Map/MovementInteractionSystem.js) is swimming or climbing, not
    // cycling: a bicycle drawn in the middle of a lake is worse than no bicycle.
    if (follower && (follower._isSwimming || follower._isClimbing)) return null;
    return ridingSprite(riddenPortableConfig());
  }

  const _Game_Follower_characterName = Game_Follower.prototype.characterName;
  Game_Follower.prototype.characterName = function () {
    const sprite = followerRidingSprite(this);
    if (sprite && (!this.actor || this.actor())) return sprite.name;
    return _Game_Follower_characterName.call(this);
  };

  const _Game_Follower_characterIndex = Game_Follower.prototype.characterIndex;
  Game_Follower.prototype.characterIndex = function () {
    const sprite = followerRidingSprite(this);
    if (sprite && (!this.actor || this.actor())) return sprite.index || 0;
    return _Game_Follower_characterIndex.call(this);
  };

  // Swapping the sheet was only ever half of it. Game_Follower.update copies the
  // leader's transparency onto every follower, and the engine makes the leader
  // transparent the moment they board anything (the vehicle sprite is drawn in
  // their place) - so the whole party was being handed a bicycle and then made
  // invisible, and the swap above was never seen.
  //
  // On a portable vehicle the party is NOT inside anything: each member is on
  // their own bike, or on their own broom, out in the open where they were a
  // moment ago. So they keep their transparency, and the pet trotting behind them
  // keeps its own body.
  const _Game_Follower_update_VS = Game_Follower.prototype.update;
  Game_Follower.prototype.update = function () {
    _Game_Follower_update_VS.call(this);
    // A game that hides the party by configuration (Options > transparent) is
    // left alone: that is a choice, not the vehicle.
    if ($dataSystem && $dataSystem.optTransparent) return;
    // While the party is boarding a vehicle with seats, transparency is decided
    // per member rather than copied off the leader: the ones who have arrived are
    // sitting in it, the ones still walking over are on the map and must stay
    // visible even after the leader has sat down and gone transparent.
    if (boardingSeatedVehicle()) {
      this.setTransparent(hasReachedVehicle(this));
      return;
    }
    const portable = riddenPortableConfig();
    if (portable) {
      if (this.isTransparent()) this.setTransparent(false);
      if (isFlyingConfig(portable)) {
        this.setThrough(true);
      }
    }
  };

  // The leader sits down the same way, the moment they step onto the hull, rather
  // than standing on the deck until the last of the party has caught up. Nothing
  // puts the body back: boarding ends with the engine making the player
  // transparent anyway, and getting off clears it.
  const _Game_Player_update_VSseats = Game_Player.prototype.update;
  Game_Player.prototype.update = function (sceneActive) {
    _Game_Player_update_VSseats.call(this, sceneActive);
    if (boardingSeatedVehicle() && hasReachedVehicle(this) && !this.isTransparent()) {
      this.setTransparent(true);
    }
  };

  // ============================================================================
  // Riders aboard
  // ============================================================================
  //
  // The engine hides everybody the moment they board: the player is made
  // transparent and the followers, who copy that transparency, go with them. On a
  // small world-map sprite that is fine, because there is nowhere to draw a
  // person. On the big off-world sheets there is: a dinghy is mostly bench.
  //
  // So a vehicle whose config declares `riderSeats` gets its crew drawn on top of
  // it, one to a seat, in the order the party is sat down: the member at the wheel
  // (VehicleCrew.js) in the bow, the rest of the party behind them, and the active
  // pet (PetFollowerSystem.js) in the last seat. Everyone faces the way the
  // vehicle is pointing, because the seat table is per direction and the frame is
  // taken from the same direction row of their own character sheet.
  //
  // These are extra sprites in the tilemap rather than the real follower
  // characters: a follower is a Game_Character standing on a tile, and no amount
  // of nudging its position makes it sit on a bench three tiles away from the one
  // it occupies. They are added at the vehicle's own z, so the tilemap's z/y sort
  // draws them over the hull and in the right order among themselves.

  function Sprite_VehicleRider() {
    this.initialize(...arguments);
  }

  Sprite_VehicleRider.prototype = Object.create(Sprite.prototype);
  Sprite_VehicleRider.prototype.constructor = Sprite_VehicleRider;

  Sprite_VehicleRider.prototype.initialize = function () {
    Sprite.prototype.initialize.call(this);
    this.anchor.x = 0.5;
    this.anchor.y = 1;
    this.visible = false;
    this._riderName = '';
    this._riderIndex = 0;
    this._frameKey = '';
  };

  // The sheet this rider wears. Nothing is reloaded unless it actually changed,
  // so this is safe to call every frame.
  Sprite_VehicleRider.prototype.setRider = function (name, index) {
    if (this._riderName === name && this._riderIndex === index) return;
    this._riderName = name || '';
    this._riderIndex = index || 0;
    this._frameKey = '';
    this.bitmap = this._riderName ? ImageManager.loadCharacter(this._riderName) : null;
    this._isBig = this._riderName ? ImageManager.isBigCharacter(this._riderName) : false;
  };

  // One frame out of the sheet, by the same arithmetic Sprite_Character uses:
  // the direction picks the row, and a seated rider always uses the middle
  // (standing) column rather than walking on the spot.
  Sprite_VehicleRider.prototype.updateRiderFrame = function (direction) {
    if (!this.bitmap || !this.bitmap.isReady()) return;
    const key = direction + '|' + this.bitmap.width + 'x' + this.bitmap.height;
    if (key === this._frameKey) return;
    this._frameKey = key;
    const pw = this._isBig ? this.bitmap.width / 3 : this.bitmap.width / 12;
    const ph = this._isBig ? this.bitmap.height / 4 : this.bitmap.height / 8;
    const blockX = this._isBig ? 0 : (this._riderIndex % 4) * 3;
    const blockY = this._isBig ? 0 : Math.floor(this._riderIndex / 4) * 4;
    const sx = (blockX + 1) * pw;                       // 1 = the standing column
    const sy = (blockY + (direction - 2) / 2) * ph;
    this.setFrame(sx, sy, pw, ph);
  };

  /**
   * The vehicle the player is riding and its seat table, or null when nobody is
   * riding anything with seats. The world map is excluded: there it wears the
   * small sprite, which is a boat the size of a person and has nowhere to sit.
   */
  function ridingSeats() {
    if ($gameMap.mapId() === 315) return null;
    if (!isPlayerRidingCustomVehicle()) return null;
    const vehicle = $gamePlayer.vehicle();
    const config = vehicle && vehicleManager.getConfig(vehicle);
    if (!config || !config.riderSeats) return null;
    const seats = config.riderSeats[vehicle.direction()];
    if (!seats || !seats.length) return null;
    return { vehicle, seats };
  }

  /**
   * Who is aboard, in the order they are sat down: the driver first (the bow
   * seat), then the rest of the party, then the pet. Each entry is the sheet and
   * index to draw, which is all the sprite needs - a pet is not an actor.
   */
  function ridersAboard() {
    const out = [];
    if (typeof $gameParty === 'undefined' || !$gameParty) return out;
    const members = $gameParty.members().filter(a => !!a);
    const driver = (window.VehicleCrew && window.VehicleCrew.driver && window.VehicleCrew.driver())
      || $gameParty.leader();
    const ordered = driver && members.indexOf(driver) >= 0
      ? [driver].concat(members.filter(a => a !== driver))
      : members;
    for (const actor of ordered) {
      out.push({
        name: actor.characterName(),
        index: actor.characterIndex(),
        char: characterForActor(actor),
      });
    }
    const pet = window.PetSystem && window.PetSystem.getActivePet
      ? window.PetSystem.getActivePet() : null;
    if (pet && pet.characterName) {
      out.push({
        name: pet.characterName,
        index: pet.characterIndex || 0,
        char: petFollowerCharacter(),
      });
    }
    return out.filter(r => !!r.name);
  }

  // ---------------------------------------------------------------------------
  // Boarding, one member at a time
  // ---------------------------------------------------------------------------
  //
  // The engine claims the vehicle the moment the party is called in, so the whole
  // crew used to appear in their seats while half of them were still three tiles
  // away. In Loose formation (Core/AutoIdleExplorer.js) the party is scattered by
  // design, and the engine's Gather Party then walks every member to the hull from
  // wherever they were standing - which is the walk worth watching. So each member
  // is sat down at the moment they reach the vehicle: the benches fill one after
  // another, the body of whoever has arrived is taken off the tile (they are in
  // the boat now, not standing on it), and nobody is drawn aboard a boat they have
  // not got to yet.

  /**
   * The body walking the map for this party member: the player for whoever is
   * leading the party, and the follower carrying that actor for everybody else.
   */
  function characterForActor(actor) {
    if (!actor || !$gamePlayer || typeof $gameParty === 'undefined' || !$gameParty) return null;
    if ($gameParty.leader() === actor) return $gamePlayer;
    const followers = $gamePlayer.followers();
    const data = followers && followers.data ? followers.data() : [];
    return data.find(f => f && f.actor && f.actor() === actor) || null;
  }

  /** The follower slot the active pet walks in (PetFollowerSystem.js), or null. */
  function petFollowerCharacter() {
    if (!window.Game_PetFollower || !$gamePlayer) return null;
    const followers = $gamePlayer.followers();
    const data = followers && followers.data ? followers.data() : [];
    return data.find(f => f instanceof window.Game_PetFollower) || null;
  }

  /**
   * The seated vehicle the player is stepping into right now, or null. Boarding is
   * over the frame the engine sits everybody down, and outside it there is nobody
   * to wait for.
   */
  function boardingSeatedVehicle() {
    if (!$gamePlayer || !$gamePlayer._vehicleGettingOn) return null;
    const ride = ridingSeats();
    return ride ? ride.vehicle : null;
  }

  /**
   * Has this member reached the vehicle being boarded? Standing on its tile with
   * the step finished is what counts as aboard. True for everybody whenever no
   * boarding is in progress, so the crew is simply drawn as it always was.
   */
  function hasReachedVehicle(character) {
    const vehicle = boardingSeatedVehicle();
    if (!vehicle) return true;
    return !!character && !character.isMoving() && character.pos(vehicle.x, vehicle.y);
  }

  // ---------------------------------------------------------------------------
  // The shadow of the moored Starship
  // ---------------------------------------------------------------------------
  //
  // On any map that is not the world map, the only honest way to draw a ship
  // that would cover half the region is not to draw it: what the party sees on
  // the ground is the dark it stands in. The silhouette is the hull itself seen
  // from overhead (GalaxySim_ShipModel.renderTopShadow), turned to whichever way
  // the ship is pointing and blown up to STARSHIP_SHADOW_TILES tiles across,
  // which is the whole point - it is meant to dwarf everything around it.
  //
  // It is drawn UNDER WAY as well as moored, and under way it is the only thing
  // drawn: flying the ship over a wood is a shadow crossing the wood. The ground
  // position comes from the engine's own shadowX/shadowY, which take the hull's
  // altitude back off, so what darkens is the field the ship is over rather than
  // the point in the air it is at.

  /**
   * The Starship, when its hull is over this map - moored on it or being flown
   * across it - and this map is one that shows a shadow at all: not the world
   * map, where the ship itself is drawn, and never indoors, where it cannot be.
   */
  function starshipShadowSource() {
    if (typeof $gameMap === 'undefined' || !$gameMap) return null;
    if ($gameMap.mapId() === 315) return null;
    if (starshipBarredHere()) return null;
    const vehicle = vehicleManager.getVehicle('airship');
    if (!vehicle) return null;
    if (vehicle._mapId !== $gameMap.mapId()) return null;
    // Parked underneath another vehicle: the plugin hides it, shadow and all.
    if (!vehicle._driving && vehicle._vsStacked) return null;
    return vehicle;
  }

  function Sprite_StarshipShadow() {
    this.initialize.apply(this, arguments);
  }
  Sprite_StarshipShadow.prototype = Object.create(Sprite.prototype);
  Sprite_StarshipShadow.prototype.constructor = Sprite_StarshipShadow;

  Sprite_StarshipShadow.prototype.initialize = function () {
    Sprite.prototype.initialize.call(this);
    this.anchor.x = 0.5;
    this.anchor.y = 0.5;
    this.opacity = STARSHIP_SHADOW_OPACITY;
    this.visible = false;
    // Over the ground and under everything standing on it: a shadow is cast on
    // the floor, and the party walks through it rather than behind it.
    this.z = 1;
  };

  Sprite_StarshipShadow.prototype.update = function () {
    Sprite.prototype.update.call(this);
    const vehicle = starshipShadowSource();
    if (!vehicle) {
      this.visible = false;
      return;
    }
    const bitmap = starshipShadowBitmap();
    if (!bitmap) {
      this.visible = false;
      return;
    }
    if (this.bitmap !== bitmap) this.bitmap = bitmap;
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();
    const scale = (STARSHIP_SHADOW_TILES * tw) / bitmap.width;
    this.scale.x = scale;
    this.scale.y = scale;
    this.rotation = STARSHIP_SHADOW_ROTATION[vehicle.direction()] || 0;
    // Centred on the tile the hull is over, not on its bottom edge: what is
    // overhead is overhead, it does not stand on the floor. shadowX/shadowY are
    // the engine's own "where the ground under this airship is", so a ship
    // climbing away does not drag its shadow up the screen with it.
    this.x = vehicle.shadowX ? vehicle.shadowX() : vehicle.screenX();
    this.y = (vehicle.shadowY ? vehicle.shadowY() : vehicle.screenY()) - th / 2;
    this.visible = true;
  };

  // The engine keeps a shadow of its own for the airship: the stock Shadow1
  // blob, one dark ellipse the size of a barrel, drawn under the hull and faded
  // in with altitude. The ship no longer has anything to do with that picture -
  // off the world map its shadow IS its hull seen from overhead, and on the
  // world map it is drawn as itself - so the blob is put out. The original is
  // still called first, so anything else that leans on the sprite's position
  // keeps getting it; only the pixels are taken away.
  const _Spriteset_Map_updateShadow_VS = Spriteset_Map.prototype.updateShadow;
  Spriteset_Map.prototype.updateShadow = function () {
    _Spriteset_Map_updateShadow_VS.call(this);

    const isFlyingBroom = isPlayerRidingFlying();
    const boat = vehicleManager.getVehicle('boat');
    const isParkedBroom = !isFlyingBroom && boat && boat._mapId === $gameMap.mapId() &&
      $gameSystem && $gameSystem._boatType === 'broom' &&
      !boat._driving && !boat._vsStacked;

    if (this._shadowSprite) {
      if (isFlyingBroom) {
        if (!this._shadowSprite.bitmap) {
          this._shadowSprite.bitmap = ImageManager.loadSystem('Shadow1');
        }
        this._shadowSprite.x = $gamePlayer.screenX();
        this._shadowSprite.y = $gamePlayer.screenY();
        this._shadowSprite.opacity = 255;
        this._shadowSprite.visible = true;
      } else if (isParkedBroom) {
        if (!this._shadowSprite.bitmap) {
          this._shadowSprite.bitmap = ImageManager.loadSystem('Shadow1');
        }
        this._shadowSprite.x = boat.screenX();
        this._shadowSprite.y = boat.screenY();
        this._shadowSprite.opacity = 180;
        this._shadowSprite.visible = true;
      } else {
        this._shadowSprite.opacity = 0;
        this._shadowSprite.visible = false;
      }
    }

    if (this._followerShadowSprites) {
      const followers = ($gamePlayer.followers && typeof $gamePlayer.followers === 'function')
        ? $gamePlayer.followers().data()
        : [];
      for (let i = 0; i < this._followerShadowSprites.length; i++) {
        const sprite = this._followerShadowSprites[i];
        const follower = followers[i];
        if (isFlyingBroom && follower && follower.isVisible() && followerRidingSprite(follower)) {
          if (!sprite.bitmap) {
            sprite.bitmap = ImageManager.loadSystem('Shadow1');
          }
          sprite.x = follower.screenX();
          sprite.y = follower.screenY();
          sprite.opacity = 255;
          sprite.visible = true;
        } else {
          sprite.opacity = 0;
          sprite.visible = false;
        }
      }
    }
  };

  const _Spriteset_Map_createCharacters_VS = Spriteset_Map.prototype.createCharacters;
  Spriteset_Map.prototype.createCharacters = function () {
    _Spriteset_Map_createCharacters_VS.call(this);
    // One sprite per seat of the roomiest seat table any vehicle declares, made
    // once and reused: which of them is showing, and who is in it, changes every
    // frame.
    let most = 0;
    for (const key of VEHICLE_KEYS) {
      const config = configForVehicleKey(key);
      if (!config || !config.riderSeats) continue;
      for (const seats of Object.values(config.riderSeats)) most = Math.max(most, seats.length);
    }
    this._vehicleRiderSprites = [];
    for (let i = 0; i < most; i++) {
      const sprite = new Sprite_VehicleRider();
      this._vehicleRiderSprites.push(sprite);
      this._tilemap.addChild(sprite);
    }
    // Follower shadow sprites for portable flying vehicles (Broom)
    this._followerShadowSprites = [];
    for (let i = 0; i < 8; i++) {
      const sprite = new Sprite();
      sprite.bitmap = ImageManager.loadSystem('Shadow1');
      sprite.anchor.x = 0.5;
      sprite.anchor.y = 1;
      sprite.z = 6;
      sprite.opacity = 0;
      sprite.visible = false;
      this._followerShadowSprites.push(sprite);
      this._tilemap.addChild(sprite);
    }
    // The shadow of the moored Starship. One sprite, made whether or not there
    // is a ship on this map: it asks that question again every frame.
    this._starshipShadowSprite = new Sprite_StarshipShadow();
    this._tilemap.addChild(this._starshipShadowSprite);
  };

  const _Spriteset_Map_update_VS = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function () {
    _Spriteset_Map_update_VS.call(this);
    this.updateVehicleRiders();
  };

  Spriteset_Map.prototype.updateVehicleRiders = function () {
    const sprites = this._vehicleRiderSprites;
    if (!sprites || !sprites.length) return;
    const ride = ridingSeats();
    const riders = ride ? ridersAboard() : [];
    // The hull bobs and jumps with the vehicle character, and the seats are
    // measured against the sprite's own anchor, so both come from the vehicle
    // itself and the crew never slides off it.
    const baseX = ride ? ride.vehicle.screenX() : 0;
    const baseY = ride ? ride.vehicle.screenY() : 0;
    const direction = ride ? ride.vehicle.direction() : 2;
    const z = ride ? ride.vehicle.screenZ() : 3;
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      const rider = ride && i < riders.length ? riders[i] : null;
      // A member still walking over to the hull keeps their own body and has no
      // seat drawn for them yet (see "Boarding, one member at a time" above).
      const seat = rider && hasReachedVehicle(rider.char) ? ride.seats[i] : null;
      if (!seat) {
        sprite.visible = false;
        continue;
      }
      sprite.setRider(rider.name, rider.index);
      sprite.updateRiderFrame(direction);
      sprite.x = baseX + seat[0];
      sprite.y = baseY + seat[1];
      // One layer over the hull. The tilemap sorts equal z by y, and a seat is
      // always ABOVE the vehicle's anchor point, so sharing the vehicle's z would
      // sort every rider behind the boat they are sitting in.
      sprite.z = z + 1;
      sprite.opacity = $gamePlayer.opacity();
      // Nothing is shown until the sheet has loaded and a frame has been cut out
      // of it, or the first frames would draw the whole character sheet.
      sprite.visible = !!sprite.bitmap && !!sprite._frameKey;
    }
  };


  // ============================================================================
  // Vehicle interior backdrop
  // ============================================================================
  //
  // A vehicle interior (the camper's map 327 and its siblings) is a small box of
  // floor floating in nothing, so everything around the walls draws black. That
  // reads as a void rather than as a vehicle standing somewhere. Instead, the
  // interior paints a still of the map the party just left, zoomed in on the
  // vehicle's own tile there, behind the floor: the camper looks parked where it
  // actually is. The still is taken at transfer time and lives only for the
  // session, so an interior entered without one (a loaded save, a debug
  // teleport) simply falls back to the old black.

  const INTERIOR_BACKDROP_ZOOM = 2.6;
  // The world map is drawn one square per tile, so a still of it needs far more
  // magnification than a still of a walkable map before the parked vehicle reads
  // as a vehicle rather than as a speck.
  const INTERIOR_BACKDROP_ZOOM_WORLD = 5.2;
  // Where the parked vehicle sits on the screen behind the interior: on the
  // right, so the floor of the cabin (which the map itself keeps centred) is not
  // painted straight over the hull.
  const INTERIOR_BACKDROP_ANCHOR_X = 0.74;
  const INTERIOR_BACKDROP_ANCHOR_Y = 0.42;
  // How much the still slides against the interior's own scrolling, so the
  // outside world is not painted on perfectly rigid glass.
  const INTERIOR_BACKDROP_DRIFT = 0.12;
  const INTERIOR_BACKDROP_TONE = [-30, -30, -20, 40];

  // { bitmap, focusX, focusY, mapId } for the last capture, or null.
  let interiorBackdrop = null;

  function backdropZoom() {
    return (interiorBackdrop && interiorBackdrop.worldMap)
      ? INTERIOR_BACKDROP_ZOOM_WORLD : INTERIOR_BACKDROP_ZOOM;
  }

  function interiorConfigForMap(mapId) {
    if (!mapId) return null;
    const configs = [
      VehicleConfig.CAMPER, VehicleConfig.CAR, VehicleConfig.AIRSHIP,
      VehicleConfig.BIKE, VehicleConfig.BOAT, VehicleConfig.BROOM,
      VehicleConfig.MOUNT
    ];
    for (const config of configs) {
      if (config && config.interior && config.interior.mapId === mapId) return config;
    }
    return null;
  }

  // The character the still is centred on: the vehicle itself when it is parked
  // on the map being left, and the player when they are riding it (the hull is
  // under them) or when the vehicle is somewhere else entirely.
  function backdropFocusCharacter(config) {
    if ($gamePlayer.isInVehicle()) return $gamePlayer;
    const vehicle = config && config.type ? vehicleManager.getVehicle(config.type) : null;
    if (vehicle && vehicle._mapId === $gameMap.mapId()) return vehicle;
    return $gamePlayer;
  }

  // Bitmap.snap of the spriteset with the player and the followers taken out of
  // it, then put back exactly as they were.
  function snapWithoutParty(spriteset) {
    const hidden = [];
    const characters = (spriteset._characterSprites || []);
    for (const sprite of characters) {
      const character = sprite._character;
      if (!character) continue;
      if (character === $gamePlayer || character instanceof Game_Follower) {
        hidden.push([sprite, sprite.visible]);
        sprite.visible = false;
      }
    }
    try {
      return Bitmap.snap(spriteset);
    } finally {
      for (const [sprite, visible] of hidden) sprite.visible = visible;
    }
  }

  function captureInteriorBackdrop(mapId) {
    const config = interiorConfigForMap(mapId);
    if (!config) return;
    if (!$gameMap || $gameMap.mapId() === mapId) return;
    // Never keep a still of another vehicle's inside.
    if (interiorConfigForMap($gameMap.mapId())) return;
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_Map) || !scene._spriteset) return;
    try {
      // The spriteset alone, so no HUD, message window or weather overlay is
      // baked into the picture.
      const focus = backdropFocusCharacter(config);
      // The party is about to be inside, so it must not also be standing in the
      // picture of the outside: the player and every follower are hidden for the
      // one frame the still is taken in.
      const bitmap = snapWithoutParty(scene._spriteset);
      interiorBackdrop = {
        bitmap: bitmap,
        focusX: focus.screenX(),
        focusY: focus.screenY(),
        mapId: mapId,
        worldMap: !!(window.WorldMapReturn && $gameMap.mapId() === window.WorldMapReturn.worldMapId)
      };
    } catch (e) {
      interiorBackdrop = null;
    }
  }

  const _Game_Player_reserveTransfer_VSBackdrop = Game_Player.prototype.reserveTransfer;
  Game_Player.prototype.reserveTransfer = function (mapId, x, y, d, fadeType) {
    captureInteriorBackdrop(mapId);
    _Game_Player_reserveTransfer_VSBackdrop.call(this, mapId, x, y, d, fadeType);
  };

  const _Spriteset_Map_createParallax_VSBackdrop = Spriteset_Map.prototype.createParallax;
  Spriteset_Map.prototype.createParallax = function () {
    _Spriteset_Map_createParallax_VSBackdrop.call(this);
    this.createVehicleInteriorBackdrop();
  };

  Spriteset_Map.prototype.createVehicleInteriorBackdrop = function () {
    this._vehicleBackdropSprite = null;
    if (!interiorBackdrop || !interiorBackdrop.bitmap) return;
    if (interiorBackdrop.mapId !== $gameMap.mapId()) return;
    // A map that already dresses its own outside is left alone.
    if ($dataMap && $dataMap.parallaxName) return;
    const sprite = new Sprite(interiorBackdrop.bitmap);
    sprite.anchor.x = 0.5;
    sprite.anchor.y = 0.5;
    const zoom = backdropZoom();
    sprite.scale.x = zoom;
    sprite.scale.y = zoom;
    if (sprite.setColorTone) sprite.setColorTone(INTERIOR_BACKDROP_TONE);
    this._vehicleBackdropSprite = sprite;
    // Straight after the parallax, so the tilemap and everything on it still
    // draws over the still.
    this._baseSprite.addChild(sprite);
    this.updateVehicleInteriorBackdrop();
  };

  Spriteset_Map.prototype.updateVehicleInteriorBackdrop = function () {
    const sprite = this._vehicleBackdropSprite;
    if (!sprite || !interiorBackdrop) return;
    const bitmap = interiorBackdrop.bitmap;
    const zoom = backdropZoom();
    // The vehicle's tile on the map outside is pinned to the right of the
    // screen, clear of the cabin floor, then nudged by the interior's own
    // scroll.
    const cx = Graphics.width * INTERIOR_BACKDROP_ANCHOR_X;
    const cy = Graphics.height * INTERIOR_BACKDROP_ANCHOR_Y;
    const driftX = $gameMap.displayX() * $gameMap.tileWidth() * INTERIOR_BACKDROP_DRIFT;
    const driftY = $gameMap.displayY() * $gameMap.tileHeight() * INTERIOR_BACKDROP_DRIFT;
    sprite.x = cx - (interiorBackdrop.focusX - bitmap.width / 2) * zoom - driftX;
    sprite.y = cy - (interiorBackdrop.focusY - bitmap.height / 2) * zoom - driftY;
  };

  const _Spriteset_Map_update_VSBackdrop = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function () {
    _Spriteset_Map_update_VSBackdrop.call(this);
    this.updateVehicleInteriorBackdrop();
  };

})();
