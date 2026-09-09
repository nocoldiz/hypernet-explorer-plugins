/*:
 * @plugindesc Vehicle Repair System - Maintenance and damage tracking for Camper and Car
 * @author Omni-Lex
 * @target MZ
 *
 * @param CriticalParts
 * @desc List of critical parts that disable vehicle when broken
 * @type string[]
 * @default ["Engine","Transmission","Brakes","Steering"]
 *
 * @param DamagePerHit
 * @desc Percentage of damage applied with damage command
 * @type number
 * @min 1
 * @max 100
 * @default 15
 *
 * @param RepairAmountPartial
 * @desc Percentage repaired with partial repair
 * @type number
 * @min 1
 * @max 100
 * @default 15
 *
 * @command camperMaintenance
 * @text Camper Maintenance
 * @desc Opens the maintenance window for the Camper
 *
 * @command carMaintenance
 * @text Car Maintenance
 * @desc Opens the maintenance window for the Car
 *
 * @command airshipMaintenance
 * @text Airship Maintenance
 * @desc Opens the maintenance window for the Airship
 *
 * @command damageCamper
 * @text Damage Camper
 * @desc Applies 15% damage to random parts of the Camper
 *
 * @command damageCar
 * @text Damage Car
 * @desc Applies 15% damage to random parts of the Car
 *
 * @command damageAirship
 * @text Damage Airship
 * @desc Applies 15% damage to random parts of the Airship
 *
 * @command repairCamper
 * @text Repair Camper
 * @desc Repairs the Camper
 * @arg amount
 * @type select
 * @option Partial (15%)
 * @value partial
 * @option Full (100%)
 * @value full
 * @default partial
 *
 * @command repairCar
 * @text Repair Car
 * @desc Repairs the Car
 * @arg amount
 * @type select
 * @option Partial (15%)
 * @value partial
 * @option Full (100%)
 * @value full
 * @default partial
 *
 * @command repairAirship
 * @text Repair Airship
 * @desc Repairs the Airship
 * @arg amount
 * @type select
 * @option Partial (15%)
 * @value partial
 * @option Full (100%)
 * @value full
 * @default partial
 *
 * @command bikeMaintenance
 * @text Bike Maintenance
 * @desc Opens the maintenance window for the Bike
 *
 * @command damageBike
 * @text Damage Bike
 * @desc Applies 15% damage to random parts of the Bike
 *
 * @command repairBike
 * @text Repair Bike
 * @desc Repairs the Bike
 * @arg amount
 * @type select
 * @option Partial (15%)
 * @value partial
 * @option Full (100%)
 * @value full
 * @default partial
 *
 * @help
 * VehicleSystemRepair.js
 *
 * This plugin manages vehicle part health and maintenance for both
 * the Camper (Ship) and Car (Boat) vehicles.
 *
 * Vehicle Parts System:
 * - Each vehicle has multiple parts with individual health percentages
 * - Critical parts (Engine, Transmission, Brakes, Steering) disable 
 *   the vehicle when broken
 * - Non-critical parts affect performance but don't disable the vehicle
 *
 * Variables Used:
 * - Uses same variable structure as VehicleSystem.js
 * - Camper: Variables 63-67
 * - Car: Variables 69-72
 * - window.brokenCamper: Set when critical parts are broken
 * - window.brokenCar: Set when critical parts are broken
 *
 * Maintenance Window:
 * - Shows vehicle image on the left
 * - Lists all parts with health percentages on the right
 * - Color coding: Green (70%+), Yellow (30-69%), Red (<30%)
 */

(() => {
  "use strict";

  const pluginName = "VehicleSystemRepair";
  const parameters = PluginManager.parameters(pluginName);

  const criticalParts = JSON.parse(parameters["CriticalParts"] || '["Engine","Transmission","Brakes","Steering"]');  // i18n-ignore  part ids
  const damagePerHit = Number(parameters["DamagePerHit"] || 15);
  const repairAmountPartial = Number(parameters["RepairAmountPartial"] || 15);

  // Vehicle parts configuration
  // i18n-ignore-start  part ids: these key the damage record in
  // $gameSystem and are matched by CamperDrivingSystem; the visible
  // label is window.VehicleParts.label(id)
  const carParts = {
    "Engine": { critical: true, maxHealth: 100 },
    "Transmission": { critical: true, maxHealth: 100 },
    "Brakes": { critical: true, maxHealth: 100 },
    "Steering": { critical: true, maxHealth: 100 },
    "Battery": { critical: false, maxHealth: 100 },
    "Alternator": { critical: false, maxHealth: 100 },
    "Radiator": { critical: false, maxHealth: 100 },
    "Fuel System": { critical: false, maxHealth: 100 },
    "Exhaust": { critical: false, maxHealth: 100 },
    "Suspension": { critical: false, maxHealth: 100 },
    "Tires": { critical: false, maxHealth: 100 },
    "Body": { critical: false, maxHealth: 100 },
    "Interior": { critical: false, maxHealth: 100 },
    "Electronics": { critical: false, maxHealth: 100 },
    "Air Filter": { critical: false, maxHealth: 100 },
    "Oil System": { critical: false, maxHealth: 100 }
  };

  const bikeParts = {
    "Engine": { critical: true, maxHealth: 100 },
    "Chain": { critical: true, maxHealth: 100 },
    "Brakes": { critical: true, maxHealth: 100 },
    "Handlebars": { critical: true, maxHealth: 100 },
    "Battery": { critical: false, maxHealth: 100 },
    "Tires": { critical: false, maxHealth: 100 },
    "Frame": { critical: false, maxHealth: 100 },
    "Lights": { critical: false, maxHealth: 100 }
  };

  const boatParts = {
    "Hull": { critical: true, maxHealth: 100 },
    "Air Chambers": { critical: true, maxHealth: 100 },
    "Oars": { critical: true, maxHealth: 100 },
    "Valves": { critical: false, maxHealth: 100 },
    "Ropes": { critical: false, maxHealth: 100 },
    "Patch Kit": { critical: false, maxHealth: 100 }
  };
  // i18n-ignore-end

  // A part id keys the damage record in $gameSystem and is matched by other
  // plugins, so it stays English; this is the label the maintenance panel shows.
  window.VehicleParts = {
    label(id) {
      const key = 'VehicleRepair.part.' + String(id || '');
      return T.has(key) ? T(key) : String(id || '');
    }
  };

  function getPartsConfig(vehicleType) {
    if (vehicleType === "bike") return bikeParts;
    if (vehicleType === "boat") return boatParts;
    return carParts; // Shared for car, camper, airship
  }

  // Initialize window variables if they don't exist
  if (typeof window.brokenCamper === 'undefined') {
    window.brokenCamper = false;
  }
  if (typeof window.brokenCar === 'undefined') {
    window.brokenCar = false;
  }
  if (typeof window.brokenBike === 'undefined') {
    window.brokenBike = false;
  }
  if (typeof window.brokenAirship === 'undefined') {
    window.brokenAirship = false;
  }
  if (typeof window.brokenBoat === 'undefined') {
    window.brokenBoat = false;
  }

  //=============================================================================
  // Vehicle Upgrade System (material-funded performance + ability modules)
  //=============================================================================
  // Material item IDs (see ThinkerMenu crafting materials, 849-871).
  const MAT = {
    arcane: 849, ethereal: 850, quantum: 851, circuit: 852, microchip: 853,
    battery: 854, plastic: 855, resin: 856, nanotube: 857, plant: 858,
    wood: 859, bone: 860, cloth: 861, meat: 862, steel: 863, titanium: 864,
    varlenia: 865, crystal: 866, glass: 867, leather: 868, herb: 869,
    oil: 870, acid: 871
  };

  // Upgrade catalog. `kind:'level'` upgrades stack to `max` levels; `kind:'bool'`
  // upgrades are one-shot ability unlocks. Costs are { itemId: quantity } maps.
  // Display copy lives in the namespace, keyed by upgrade id.
  const UPGRADES = {
    accel: {
      kind: 'level', max: 3, icon: 78,
      costs: [
        { [MAT.steel]: 2, [MAT.oil]: 1 },
        { [MAT.titanium]: 2, [MAT.circuit]: 1 },
        { [MAT.varlenia]: 1, [MAT.nanotube]: 1 }
      ]
    },
    speed: {
      kind: 'level', max: 3, icon: 73,
      costs: [
        { [MAT.plastic]: 2, [MAT.resin]: 1 },
        { [MAT.titanium]: 2, [MAT.glass]: 2 },
        { [MAT.varlenia]: 1, [MAT.quantum]: 1 }
      ]
    },
    fuel: {
      kind: 'level', max: 3, icon: 314, noBike: true, noBoat: true,
      costs: [
        { [MAT.plastic]: 3, [MAT.steel]: 1 },
        { [MAT.resin]: 2, [MAT.battery]: 2 },
        { [MAT.titanium]: 2, [MAT.nanotube]: 1 }
      ]
    },
    health: {
      kind: 'level', max: 3, icon: 81,
      costs: [
        { [MAT.steel]: 3, [MAT.cloth]: 2 },
        { [MAT.titanium]: 3, [MAT.resin]: 2 },
        { [MAT.varlenia]: 2, [MAT.crystal]: 1 }
      ]
    },
    aquatic: {
      kind: 'bool', camperOnly: true, icon: 67,
      cost: { [MAT.resin]: 4, [MAT.ethereal]: 1, [MAT.steel]: 4 }
    },
    flight: {
      kind: 'bool', camperOnly: true, icon: 69,
      cost: { [MAT.quantum]: 1, [MAT.nanotube]: 3, [MAT.titanium]: 4 }
    }
  };
  const UPGRADE_ORDER = ['accel', 'speed', 'fuel', 'health', 'aquatic', 'flight'];
  // Name and blurb for an upgrade id.
  const upgradeText = (key, field) => T('VehicleRepair.upgrade.' + key + '.' + field);

  // Repair now consumes materials. Cost scales with the repair depth.
  const REPAIR_COST = {
    default: { partial: { [MAT.steel]: 1, [MAT.oil]: 1 }, full: { [MAT.steel]: 3, [MAT.resin]: 1, [MAT.oil]: 2 } },
    bike: { partial: { [MAT.steel]: 1 }, full: { [MAT.steel]: 2, [MAT.plastic]: 1 } }
  };

  function getUpgradeData() {
    if (!$gameSystem) return { camper: {}, car: {}, bike: {}, airship: {}, boat: {} };
    if (!$gameSystem._vehicleUpgrades) {
      $gameSystem._vehicleUpgrades = { camper: {}, car: {}, bike: {}, airship: {}, boat: {} };
    }
    return $gameSystem._vehicleUpgrades;
  }

  function upgradeLevel(type, key) {
    const data = getUpgradeData()[type];
    return (data && data[key]) || 0;
  }
  function upgradeHas(type, key) {
    const data = getUpgradeData()[type];
    return !!(data && data[key]);
  }

  // A given upgrade is offered for a vehicle unless it is camper-only or bike-excluded.
  function upgradeAvailableFor(type, key) {
    const def = UPGRADES[key];
    if (!def) return false;
    if (def.camperOnly && type !== 'camper') return false;
    if (def.noBike && type === 'bike') return false;
    if (def.noBoat && type === 'boat') return false;
    return true;
  }

  function upgradeCost(key, type) {
    const def = UPGRADES[key];
    if (!def) return null;
    if (def.kind === 'bool') return def.cost;
    const next = upgradeLevel(type, key); // cost for the NEXT level
    if (next >= def.max) return null;
    return def.costs[next];
  }

  function matName(id) { const it = $dataItems[id]; return it ? it.name.trim() : ('#' + id); }
  function matIcon(id) { const it = $dataItems[id]; return it ? it.iconIndex : 0; }
  function matOwned(id) { return $gameParty ? $gameParty.numItems($dataItems[id]) : 0; }

  function canAfford(cost) {
    if (!cost) return false;
    if ($gameSystem && $gameSystem._isSandboxMode) return true;
    return Object.entries(cost).every(([id, qty]) => matOwned(parseInt(id)) >= qty);
  }
  function chargeCost(cost) {
    if (!cost || ($gameSystem && $gameSystem._isSandboxMode)) return;
    for (const [id, qty] of Object.entries(cost)) {
      $gameParty.loseItem($dataItems[parseInt(id)], qty);
    }
  }

  // Effect multipliers consumed by VehicleSystem / CamperDrivingSystem / TimeDate.
  function getAccelMult(type) { return 1 + 0.4 * upgradeLevel(type, 'accel'); }
  function getSpeedMult(type) { return 1 + 0.15 * upgradeLevel(type, 'speed'); }
  function getFuelMult(type) { return 1 + 0.4 * upgradeLevel(type, 'fuel'); }
  function getHealthMult(type) { return 1 + 0.3 * upgradeLevel(type, 'health'); }
  // World-map game-minutes spent per tile (TimeDateSystem base for vehicles = 2).
  const BASE_TILE_MINUTES = 2;
  function worldTileMinutes(type) { return Math.max(0.5, BASE_TILE_MINUTES - 0.5 * upgradeLevel(type, 'speed')); }
  function effectiveMaxFuel(type, baseMax) { return Math.round((baseMax || 0) * getFuelMult(type)); }
  // Extra RPG-Maker move-speed steps granted on the world map (capped to keep it sane).
  function mapSpeedBonus(type) { return Math.min(1, Math.floor(upgradeLevel(type, 'speed') / 2)); }

  // Which upgrade-key vehicle type is the player currently riding (or null).
  function currentRiddenType() {
    if (typeof $gamePlayer === 'undefined' || !$gamePlayer) return null;
    if ($gamePlayer.isInShip && $gamePlayer.isInShip()) return 'camper';
    if ($gamePlayer.isInAirship && $gamePlayer.isInAirship()) return 'airship';
    if ($gamePlayer.isInBoat && $gamePlayer.isInBoat()) {
      const bt = (typeof $gameSystem !== 'undefined') ? $gameSystem._boatType : 'car';
      if (bt === 'bike') return 'bike';
      if (bt === 'boat') return 'boat';
      return 'car';
    }
    return null;
  }

  window.VehicleUpgrades = {
    catalog: UPGRADES,
    order: UPGRADE_ORDER,
    getData: getUpgradeData,
    getLevel: upgradeLevel,
    has: upgradeHas,
    availableFor: upgradeAvailableFor,
    getAccelMult, getSpeedMult, getFuelMult, getHealthMult,
    worldTileMinutes, effectiveMaxFuel, mapSpeedBonus,
    currentRiddenType,
    // Apply crash/impact damage to a vehicle's parts (e.g. a water splash-down).
    applyDamage,
    // Camper ability gate used by CamperDrivingSystem (fly / float / dive).
    camperCan(kind) {
      if ($gameSystem && $gameSystem._isSandboxMode) return true;
      // Legacy unlock store (CamperDrivingSystem.setUpgrades).
      const legacy = ($gameSystem && $gameSystem._camperUpgrades) || {};
      if (kind === 'fly') return upgradeHas('camper', 'flight') || !!legacy.fly;
      if (kind === 'float' || kind === 'dive') return upgradeHas('camper', 'aquatic') || !!legacy.float || !!legacy.dive;
      return true;
    }
  };

  //=============================================================================
  // Helper Functions
  //=============================================================================

  function ensureGameSystemExists() {
    if (!$gameSystem) {
      console.warn("VehicleSystemRepair: $gameSystem not ready, delaying initialization");
      return false;
    }
    return true;
  }

  function getVehicleHealth(vehicleType) {
    if (!ensureGameSystemExists()) {
      return null;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }
    return $gameSystem._vehicleHealth[vehicleType];
  }

  function initializeVehicleHealth() {
    if (!ensureGameSystemExists()) {
      return;
    }

    $gameSystem._vehicleHealth = {
      camper: {},
      car: {},
      bike: {},
      airship: {},
      boat: {}
    };

    for (const part in carParts) {
      $gameSystem._vehicleHealth.camper[part] = 100;
      $gameSystem._vehicleHealth.car[part] = 100;
      $gameSystem._vehicleHealth.airship[part] = 100;
    }
    for (const part in bikeParts) {
      $gameSystem._vehicleHealth.bike[part] = 100;
    }
    for (const part in boatParts) {
      $gameSystem._vehicleHealth.boat[part] = 100;
    }
  }

  /**
   * One number for how sound a vehicle is: the average of its parts' health,
   * 0-100, or null when the vehicle keeps no health record (the broom). A
   * critical part weighs double, so a cracked engine block reads worse than a
   * scuffed bumper, the way the 3D drive's condition chip already counts it.
   */
  function vehicleCondition(vehicleType) {
    const health = getVehicleHealth(vehicleType);
    if (!health) return null;

    const partsConfig = getPartsConfig(vehicleType);
    let sum = 0;
    let weight = 0;
    for (const part in partsConfig) {
      const w = partsConfig[part].critical ? 2 : 1;
      const value = health[part] != null ? health[part] : partsConfig[part].maxHealth;
      sum += value * w;
      weight += w;
    }
    return weight ? sum / weight : null;
  }

  /**
   * The vehicle's condition as a health BAR rather than a percentage: every
   * part's health added up against every part's maximum, so a sixteen-part car
   * reads 1600/1600 sound and a wreck reads what is left of it. Returns
   * { current, max } or null when the vehicle keeps no health record.
   *
   * Unweighted on purpose, where vehicleCondition() above weighs the critical
   * parts double: a bar is a quantity of vehicle left, and the party HUD draws
   * it beside the crew's own HP.
   */
  function totalHealth(vehicleType) {
    const health = getVehicleHealth(vehicleType);
    if (!health) return null;

    const partsConfig = getPartsConfig(vehicleType);
    let current = 0;
    let max = 0;
    for (const part in partsConfig) {
      const partMax = partsConfig[part].maxHealth;
      const value = health[part] != null ? health[part] : partMax;
      current += Math.max(0, Math.min(partMax, value));
      max += partMax;
    }
    return max ? { current, max } : null;
  }

  /**
   * Every part of a vehicle, in one list the menus can print: the part id, the
   * label it is shown under, how sound it is and whether losing it stops the
   * vehicle. Empty for a vehicle that keeps no health record (the broom).
   */
  function partsStatus(vehicleType) {
    const health = getVehicleHealth(vehicleType);
    if (!health) return [];

    const partsConfig = getPartsConfig(vehicleType);
    return Object.keys(partsConfig).map(part => {
      const max = partsConfig[part].maxHealth;
      const value = health[part] != null ? health[part] : max;
      return {
        id: part,
        label: window.VehicleParts.label(part),
        health: Math.max(0, Math.min(max, value)),
        max,
        critical: !!partsConfig[part].critical
      };
    });
  }

  function checkCriticalParts(vehicleType) {
    const health = getVehicleHealth(vehicleType);
    if (!health) return false;

    const partsConfig = getPartsConfig(vehicleType);
    for (const part in partsConfig) {
      if (partsConfig[part].critical && health[part] <= 0) {
        return true; // Vehicle is broken
      }
    }
    return false; // Vehicle is functional
  }

  function updateVehicleStatus(vehicleType) {
    const isBroken = checkCriticalParts(vehicleType);

    if (vehicleType === "camper") {
      window.brokenCamper = isBroken;
    } else if (vehicleType === "car") {
      window.brokenCar = isBroken;
    } else if (vehicleType === "bike") {
      window.brokenBike = isBroken;
    } else if (vehicleType === "airship") {
      window.brokenAirship = isBroken;
    } else if (vehicleType === "boat") {
      window.brokenBoat = isBroken;
    }
  }

  /**
   * Knocks `damagePercent` off some of a vehicle's parts and answers which ones
   * took it, so a caller can name them.
   *
   * `options.parts` narrows the pool to a named set (anything the vehicle does
   * not have is dropped), which is how a glancing knock is confined to the front
   * of the car rather than spread through the gearbox; `options.count` says how
   * many of that pool are hit, instead of the usual 3-7 of a real crash.
   */
  function applyDamage(vehicleType, damagePercent, options) {
    const health = getVehicleHealth(vehicleType);
    if (!health) return [];

    const partsConfig = getPartsConfig(vehicleType);
    const opts = options || {};
    const pool = Array.isArray(opts.parts) ? opts.parts.filter(p => partsConfig[p]) : [];
    const partNames = pool.length ? pool : Object.keys(partsConfig);

    const wanted = opts.count != null ? Number(opts.count) : Math.floor(Math.random() * 5) + 3;
    const numPartsToDamage = Math.min(Math.max(1, wanted), partNames.length);
    const partsToDamage = [];

    while (partsToDamage.length < numPartsToDamage) {
      const randomPart = partNames[Math.floor(Math.random() * partNames.length)];
      if (!partsToDamage.includes(randomPart)) {
        partsToDamage.push(randomPart);
      }
    }

    // The Reinforced Chassis upgrade makes the vehicle more durable: incoming
    // damage is divided by the health multiplier for that vehicle.
    const durability = getHealthMult(vehicleType);

    // Apply damage to selected parts
    const brokenBefore = checkCriticalParts(vehicleType);
    for (const part of partsToDamage) {
      const currentHealth = health[part] || 100;
      const damage = (partsConfig[part].maxHealth * damagePercent) / 100 / durability;
      health[part] = Math.max(0, currentHealth - damage);
    }

    updateVehicleStatus(vehicleType);
    // A critical part giving out strands the party, and nothing else says so
    // until they try to drive off.
    if (!brokenBefore && checkCriticalParts(vehicleType) && window.ParchmentToast) {
      const dead = partsToDamage.filter(p => partsConfig[p].critical && health[p] <= 0)
                                    .map(p => window.VehicleParts.label(p));
      window.ParchmentToast.show(
        T('VehicleRepair.toast.criticalFailure', { part: dead.join(', ') }),
        { severity: 'danger', key: 'vehicle-broken:' + vehicleType }  // i18n-ignore  dedupe key
      );
    }
    return partsToDamage;
  }

  // Message-free access to the damage/health primitives above, for other
  // plugins that need to set up vehicle damage programmatically (e.g. the
  // Crash Landed character-creation origin) without going through the
  // damageAirship plugin command's $gameMessage popups.
  window.VehicleSystemRepair = {
    initializeVehicleHealth,
    applyDamage,
    checkCriticalParts,
    updateVehicleStatus,
    // Read-only: the vehicle action menu prints this beside the fuel.
    vehicleCondition,
    // Read-only: the party HUD draws this as the vehicle's HP bar.
    totalHealth,
    // Read-only: the garage lists these under the vehicle it is showing.
    partsStatus,
  };

  function repairVehicle(vehicleType, repairPercent) {
    const health = getVehicleHealth(vehicleType);
    if (!health) return;

    // The same box of parts goes further for somebody who has had the engine
    // out before, and turning a spanner is how that is learned (Mechanics, 173).
    const XP = window.SpecializationXP;
    const skill = XP ? XP.multiplier('Mechanics', 0.10) : 1;  // i18n-ignore  specialization id

    const partsConfig = getPartsConfig(vehicleType);
    for (const part in partsConfig) {
      const currentHealth = health[part] || 0;
      const repairAmount = (partsConfig[part].maxHealth * repairPercent * skill) / 100;
      health[part] = Math.min(100, currentHealth + repairAmount);
    }

    if (XP) XP.awardCapped('Mechanics', 1);  // i18n-ignore  specialization id
    updateVehicleStatus(vehicleType);
  }

  //=============================================================================
  // Window_VehicleMaintenance
  //=============================================================================

  //=============================================================================
  // Window_VehicleMaintenance (Hidden Controller)
  //=============================================================================
  class Window_VehicleMaintenance extends Window_Base {
    constructor(vehicleType) {
      super(new Rectangle(0, 0, 100, 100));
      this.visible = false;
    }
  }

  //=============================================================================
  // Scene_VehicleMaintenance (Premium D&D Spread)
  //=============================================================================
  class Scene_VehicleMaintenance extends Scene_MenuBase {
    initialize(vehicleType) {
      super.initialize();
      this._vehicleType = vehicleType || "camper";
      this._tab = 'repair';   // 'repair' | 'upgrades'
      this._flash = null;     // transient { text, ok } feedback line
      this._flashTimer = 0;
    }

    create() {
      super.create();
      // Name the skill this menu runs on while it is open.
      if (window.SpecBadge) window.SpecBadge.show('Mechanics');  // i18n-ignore  Specialization.json id
      this._maintenanceWindow = new Window_VehicleMaintenance(this._vehicleType);
      this.addWindow(this._maintenanceWindow);
      this.createUIVehicleDOM();
    }

    terminate() {
      super.terminate();
      if (window.CCNav) window.CCNav.detach(this);
      const modal = window.GalaxySim && window.GalaxySim.ShipAppearance;
      if (modal && modal.isOpen()) modal.close(false);
      if (this._dndContainer) {
        const container = this._dndContainer;
        container.style.transition = "opacity 0.2s ease-out";
        container.style.opacity = "0";
        container.style.pointerEvents = "none";
        setTimeout(() => {
          if (container && container.parentNode) {
            container.parentNode.removeChild(container);
          }
        }, 200);
        this._dndContainer = null;
      }
    }

    createUIVehicleDOM() {


      this._dndContainer = document.createElement('div');
      this._dndContainer.id = 'menu-container';
      this._dndContainer.style.position = 'absolute';
      this._dndContainer.style.top = '0';
      this._dndContainer.style.left = '0';
      this._dndContainer.style.width = '100%';
      this._dndContainer.style.height = '100%';
      this._dndContainer.style.zIndex = '1000';
      this._dndContainer.style.background = 'radial-gradient(circle, rgba(18, 10, 5, 0.93) 0%, rgba(5, 3, 1, 0.98) 100%)';
      this._dndContainer.style.display = 'flex';
      this._dndContainer.style.justifyContent = 'center';
      this._dndContainer.style.alignItems = 'center';
      this._dndContainer.style.fontFamily = "var(--font-ui)";
      this._dndContainer.style.color = 'var(--accent-cream-light)';
      this._dndContainer.style.boxSizing = 'border-box';

      document.body.appendChild(this._dndContainer);

      // One-time wheel handler; resolves the active scroll box at event time so
      // it works for both the Repair and Upgrades tabs.
      this._dndContainer.addEventListener("wheel", (e) => {
        e.preventDefault();
        const box = this._dndContainer.querySelector('.maint-scroll[data-active="1"]') ||
                    this._dndContainer.querySelector('.maint-scroll');
        if (box) box.scrollTop += e.deltaY;
      }, { passive: false });

      // Right mouse button closes the maintenance pockets.
      this._dndContainer.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.exitMaintenance();
      });

      // Every button in here - repair a part, buy an upgrade, open the hull
      // editor, leave - was a click and nothing else: up and down scrolled the
      // list and Confirm was not read at all. The shared DOM focus ring walks
      // them (window.CCNav, CharacterCreationNav.js), which is the same ring
      // the creation screens use and the same one the tests cover.
      if (window.CCNav) window.CCNav.attach(this, this._dndContainer, { boards: false });

      this.refreshUIVehicleDOM();
    }

    // The bay has no card board to hand the cursor back to, so the ring keeps
    // it: stepping off the top simply lands on the last control instead of
    // stranding the player with nothing focused.
    onNavLeave() {
      if (window.CCNav) window.CCNav.enter("up");
    }

    refreshUIVehicleDOM() {
      if (!this._dndContainer) return;

      const useItalian = ConfigManager.language === 'it';
      const vehicleType = this._vehicleType;
      const health = getVehicleHealth(vehicleType);
      if (!health) return;

      const isBroken = checkCriticalParts(vehicleType);
      const partsConfig = getPartsConfig(vehicleType);
      const partNames = Object.keys(partsConfig);

      let vehicleName = "";
      let vehicleDesc = "";
      if (vehicleType === "camper") {
        vehicleName =T('VehicleRepair.camperExpedition');
        vehicleDesc =T('VehicleRepair.aReinforcedHeavyCamperDesigned');
      } else if (vehicleType === "car") {
        vehicleName =T('VehicleRepair.standardUrbanSedan');
        vehicleDesc =T('VehicleRepair.aClassicStandardEngineTransport');
      } else if (vehicleType === "bike") {
        vehicleName =T('VehicleRepair.lightSportMotorcycle');
        vehicleDesc =T('VehicleRepair.anAgileAndRapidPersonal');
      } else if (vehicleType === "airship") {
        vehicleName =T('VehicleRepair.explorerStarship');
        vehicleDesc =T('VehicleRepair.anAdvancedDeepSpaceExplorer');
      } else if (vehicleType === "boat") {
        vehicleName =T('VehicleRepair.inflatableDinghy');
        vehicleDesc =T('VehicleRepair.aLightPackableBoatFor');
      }

      let partsListHTML = "";
      partNames.forEach((part) => {
        const partHealth = Math.round(health[part] || 0);
        const isCritical = partsConfig[part].critical;

        // One scale for every meter in the game (window.NeedGauge): the number
        // and the bar fill take the same band class, so they never disagree.
        const band = window.NeedGauge
          ? window.NeedGauge.band(partHealth)
          : (partHealth <= 20 ? 'gauge-band--bad' : partHealth <= 50 ? 'gauge-band--warn' : 'gauge-band--ok');

        partsListHTML += `
          <div class="item-slot item-slot--compact vrep-part">
            <div class="item-slot-info">
              <div class="item-slot-name">
                ${window.VehicleParts.label(part)}${isCritical ? ` <span class="ui-chip vrep-critical-chip">${T('VehicleRepair.critical')}</span>` : ''}
              </div>
              <div class="vrep-track"><div class="vrep-fill gauge-fill ${band}" style="width:${partHealth}%"></div></div>
            </div>
            <span class="item-slot-count gauge-ink ${band}">${partHealth}%</span>
          </div>
        `;
      });

      // The starship's hull is procedurally generated, so its portrait is a
      // live render of the actual model and its look can be re-rolled here.
      const shipSpec = (vehicleType === "airship" && window.GalaxySim && window.GalaxySim.ShipModel)
        ? window.GalaxySim.ShipModel.resolve(window.GalaxySim.ShipModel.getConfig())
        : null;
      if (shipSpec) vehicleName = shipSpec.name.toUpperCase();

      const shipPlateHTML = shipSpec ? `
          <div class="vrep-effect">
            ${shipSpec.registry} &middot; ${shipSpec.hull.label} &middot; ${shipSpec.engine.label}
          </div>` : "";

      const appearanceBtnHTML = shipSpec ? `
          <div class="inspect-btn focusable" onclick="SceneManager._scene.openAppearance()">
            ${T('VehicleRepair.changeAppearance')}
          </div>` : "";

      const leftPageHTML = `
        <div class="page-header-bar">
          <div class="back-button focusable" onclick="SceneManager._scene.exitMaintenance()">${T('VehicleRepair.close')}</div>
          <h2 class="title">${vehicleName}</h2>
        </div>

        <div class="vrep-portrait">
          <canvas id="vehicle-sprite-canvas" width="150" height="150" style="image-rendering:${shipSpec ? 'auto' : 'pixelated'}"></canvas>
        </div>
        ${shipPlateHTML}

        <p class="inspect-lore vrep-desc">${vehicleDesc}</p>

        <div class="vrep-status gauge-ink ${isBroken ? 'gauge-band--bad' : 'gauge-band--ok'}">
          ${isBroken ? (T('VehicleRepair.statusBroken')) : (T('VehicleRepair.statusOperational'))}
        </div>
        ${appearanceBtnHTML ? `<div class="inspect-actions">${appearanceBtnHTML}</div>` : ''}

        <div class="ui-footer vrep-note">
          ${T('VehicleRepair.allCriticalComponentsMustMaintain')}
        </div>
      `;

      // Tab bar (Repair / Upgrades) shared by both pages.
      const tab = (id, label) => `
        <div id="maint-tab-${id}" class="backpack-tab focusable${this._tab === id ? ' active' : ''}" onclick="SceneManager._scene.switchTab('${id}')">
          ${label}
        </div>`;
      const tabBarHTML = `
        <div class="backpack-tabs"><div class="backpack-tabs-row">
          ${tab('repair',T('VehicleRepair.repair'))}
          ${tab('upgrades',T('VehicleRepair.upgrades'))}
        </div></div>`;

      // Both panels are built up-front and toggled by display so switching tabs
      // never rebuilds the DOM (and never reloads the sprite on the left page).
      const bodyHTML = `
        <div class="ui-detail vrep-panel" id="maint-panel-repair" style="display:${this._tab === 'repair' ? 'flex' : 'none'}">
          ${this.renderRepairPage(useItalian, partsListHTML)}
        </div>
        <div class="ui-detail vrep-panel" id="maint-panel-upgrades" style="display:${this._tab === 'upgrades' ? 'flex' : 'none'}">
          ${this.renderUpgradesPage(useItalian)}
        </div>`;

      // Transient feedback line.
      let flashHTML = "";
      if (this._flashTimer > 0 && this._flash) {
        flashHTML = `<div class="vrep-flash gauge-ink ${this._flash.ok ? 'gauge-band--ok' : 'gauge-band--bad'}">${this._flash.text}</div>`;
      }

      const rightPageHTML = `
        ${tabBarHTML}
        ${flashHTML}
        ${bodyHTML}
      `;

      this._dndContainer.innerHTML = `
        <div class="book-spread">
          <div class="left-page">
            ${leftPageHTML}
          </div>
          <div class="right-page">
            ${rightPageHTML}
          </div>
        </div>
      `;

      this.drawVehicleSprite();
    }

    // ---- Right-page: Repair tab ----
    renderRepairPage(useItalian, partsListHTML) {
      const type = this._vehicleType;
      const mkRepairBtn = (mode, label) => {
        const cost = REPAIR_COST[type === 'bike' ? 'bike' : 'default'][mode];
        const afford = canAfford(cost);
        return `
          <div class="inspect-btn focusable${afford ? '' : ' unusable'}" onclick="SceneManager._scene.doRepair('${mode}')">
            <span class="vrep-btn-label">${label}</span>
            <span class="vrep-btn-cost">${this.renderCost(cost)}</span>
          </div>`;
      };

      return `
        <h3 class="inspect-section-title">${T('VehicleRepair.componentsRegistry')}</h3>

        <div class="ui-list maint-scroll" data-active="${this._tab === 'repair' ? '1' : '0'}">
          ${partsListHTML}
        </div>

        <div class="inspect-actions">
          ${mkRepairBtn('partial', T('VehicleRepair.repairPercent', { percent: repairAmountPartial }))}
          ${mkRepairBtn('full',T('VehicleRepair.fullRepair'))}
        </div>
      `;
    }

    // ---- Right-page: Upgrades tab ----
    renderUpgradesPage(useItalian) {
      const type = this._vehicleType;
      let cardsHTML = "";

      UPGRADE_ORDER.forEach((key) => {
        if (!upgradeAvailableFor(type, key)) return;
        const def = UPGRADES[key];
        const name = upgradeText(key, 'name');
        const desc = upgradeText(key, 'desc');
        const isBool = def.kind === 'bool';
        const level = upgradeLevel(type, key);
        const maxed = isBool ? upgradeHas(type, key) : level >= def.max;
        const cost = upgradeCost(key, type);
        const afford = !maxed && canAfford(cost);

        // Level pips / installed badge.
        let progressHTML;
        if (isBool) {
          progressHTML = `<span class="ui-chip gauge-ink ${maxed ? 'gauge-band--ok' : 'gauge-band--warn'}">
            ${maxed ? (T('VehicleRepair.installed')) : (T('VehicleRepair.notInstalled'))}</span>`;
        } else {
          let pips = "";
          for (let i = 0; i < def.max; i++) {
            pips += `<span class="vrep-pip${i < level ? ' filled' : ''}"></span>`;
          }
          progressHTML = `<span class="ui-chip">${T('VehicleRepair.lv')} ${level}/${def.max}</span>${pips}`;
        }

        // Effect line (current -> next).
        const effectHTML = `<div class="vrep-effect">${this.upgradeEffectText(type, key, useItalian)}</div>`;

        const iconStyle = `background: url('img/system/IconSet.png') -${(def.icon % 16) * 32}px -${Math.floor(def.icon / 16) * 32}px no-repeat; width:32px; height:32px; flex:0 0 32px;`;

        let actionHTML;
        if (maxed) {
          actionHTML = `<div class="inspect-actions"><span class="ui-chip gauge-ink gauge-band--ok">${T('VehicleRepair.maxed')}</span></div>`;
        } else {
          actionHTML = `
            <div class="inspect-actions">
              <span class="vrep-btn-cost">${this.renderCost(cost)}</span>
              <div class="inspect-btn focusable${afford ? '' : ' unusable'}" onclick="SceneManager._scene.purchaseUpgrade('${key}')">
                ${isBool ? (T('VehicleRepair.install')) : (T('VehicleRepair.upgradeAction'))}
              </div>
            </div>`;
        }

        cardsHTML += `
          <div class="item-slot vrep-upgrade">
            <div class="item-icon" style="${iconStyle}"></div>
            <div class="item-slot-info">
              <div class="item-slot-name">${name}</div>
              <div class="inspect-lore">${desc}</div>
              ${effectHTML}
            </div>
            <div class="vrep-upgrade-side">${progressHTML}${actionHTML}</div>
          </div>`;
      });

      return `
        <h3 class="inspect-section-title">${T('VehicleRepair.upgradeWorkshop')}</h3>
        <div class="ui-list maint-scroll" data-active="${this._tab === 'upgrades' ? '1' : '0'}">
          ${cardsHTML || `<div class="ui-empty">${T('VehicleRepair.noUpgradesAvailable')}</div>`}
        </div>
      `;
    }

    // Human-readable current/next effect for an upgrade.
    upgradeEffectText(type, key, useItalian) {
      const lv = upgradeLevel(type, key);
      const fmt = (n) => (Math.round(n * 100) / 100);
      switch (key) {
        case 'accel': {
          const cur = 1 + 0.4 * lv, nxt = 1 + 0.4 * (lv + 1);
          return (T('VehicleRepair.acceleration')) + `: x${fmt(cur)}` + (lv < UPGRADES.accel.max ? ` → x${fmt(nxt)}` : '');
        }
        case 'speed': {
          const cur = worldTileMinutes(type);
          const nxt = Math.max(0.5, BASE_TILE_MINUTES - 0.5 * (lv + 1));
          const saved = fmt(cur - nxt);
          const base = T('VehicleRepair.timePerTile', { minutes: fmt(cur) });
          return lv < UPGRADES.speed.max
            ? base + T('VehicleRepair.timePerTileNext', { minutes: fmt(nxt), saved: saved })
            : base;
        }
        case 'fuel': {
          const cur = Math.round(100 * getFuelMult(type)) ; // shown as % of base
          const nxt = Math.round(100 * (1 + 0.4 * (lv + 1)));
          return (T('VehicleRepair.fuelCapacity')) + `: ${cur}%` + (lv < UPGRADES.fuel.max ? ` → ${nxt}%` : '');
        }
        case 'health': {
          const cur = Math.round((1 - 1 / (1 + 0.3 * lv)) * 100);
          const nxt = Math.round((1 - 1 / (1 + 0.3 * (lv + 1))) * 100);
          return (T('VehicleRepair.damageReduction')) + `: ${cur}%` + (lv < UPGRADES.health.max ? ` → ${nxt}%` : '');
        }
        case 'aquatic':
          return T('VehicleRepair.enablesDrivingOnAndDiving');
        case 'flight':
          return T('VehicleRepair.enablesTakeOffAndFlight');
        default: return '';
      }
    }

    // Renders a { itemId: qty } cost map as icon + owned/needed chips.
    renderCost(cost) {
      if (!cost) return '';
      return Object.entries(cost).map(([id, qty]) => {
        id = parseInt(id);
        const have = matOwned(id);
        const ok = have >= qty || ($gameSystem && $gameSystem._isSandboxMode);
        const icon = matIcon(id);
        const iconStyle = `background: url('img/system/IconSet.png') -${(icon % 16) * 24}px -${Math.floor(icon / 16) * 24}px no-repeat; background-size:384px auto; width:24px; height:24px; display:inline-block; vertical-align:middle;`;
        return `<span class="vrep-cost gauge-ink ${ok ? 'gauge-band--ok' : 'gauge-band--bad'}" title="${matName(id)}">
          <span style="${iconStyle}"></span>${have}/${qty}</span>`;
      }).join('');
    }

    switchTab(id) {
      if (this._tab === id) return;
      this._tab = id;
      SoundManager.playCursor();
      // Toggle panel visibility and tab styling in place, with no DOM rebuild and
      // no sprite reload on the left page.
      const c = this._dndContainer;
      if (!c) return;
      ['repair', 'upgrades'].forEach((t) => {
        const panel = c.querySelector('#maint-panel-' + t);
        if (panel) panel.style.display = (t === id) ? 'flex' : 'none';
        const tabEl = c.querySelector('#maint-tab-' + t);
        if (tabEl) tabEl.classList.toggle('active', t === id);
        const scroll = panel && panel.querySelector('.maint-scroll');
        if (scroll) scroll.dataset.active = (t === id) ? '1' : '0';
      });
    }

    setFlash(text, ok) {
      this._flash = { text, ok };
      this._flashTimer = 150;
    }

    doRepair(mode) {
      const type = this._vehicleType;
      const cost = REPAIR_COST[type === 'bike' ? 'bike' : 'default'][mode];
      if (!canAfford(cost)) {
        SoundManager.playBuzzer();
        this.setFlash(T('VehicleRepair.notEnoughMaterials'), false);
        this.refreshUIVehicleDOM();
        return;
      }
      const wasBroken = checkCriticalParts(type);
      chargeCost(cost);
      repairVehicle(type, mode === 'full' ? 100 : repairAmountPartial);
      SoundManager.playUseItem();
      const it = ConfigManager.language === 'it';
      let msg = mode === 'full' ? (T('VehicleRepair.vehicleFullyRepaired'))
                                : (T('VehicleRepair.vehicleRepaired'));
      if (wasBroken && !checkCriticalParts(type)) msg =T('VehicleRepair.vehicleIsOperationalAgain');
      this.setFlash(msg, true);
      this.refreshUIVehicleDOM();
    }

    purchaseUpgrade(key) {
      const type = this._vehicleType;
      const def = UPGRADES[key];
      if (!def || !upgradeAvailableFor(type, key)) return;
      const isBool = def.kind === 'bool';
      const level = upgradeLevel(type, key);
      const maxed = isBool ? upgradeHas(type, key) : level >= def.max;
      if (maxed) { SoundManager.playBuzzer(); return; }
      const cost = upgradeCost(key, type);
      if (!canAfford(cost)) {
        SoundManager.playBuzzer();
        this.setFlash(T('VehicleRepair.notEnoughMaterials'), false);
        this.refreshUIVehicleDOM();
        return;
      }
      chargeCost(cost);
      const data = getUpgradeData()[type];
      if (isBool) data[key] = true;
      else data[key] = level + 1;
      SoundManager.playUseItem();
      const it = ConfigManager.language === 'it';
      const name = upgradeText(key, 'name');
      this.setFlash((T('VehicleRepair.installed')) + name, true);
      this.refreshUIVehicleDOM();
    }

    // Opens the procedural-hull editor over the pockets. The modal owns the
    // keyboard while it is up, so update() stands down until it closes.
    openAppearance() {
      const SM = window.GalaxySim && window.GalaxySim.ShipModel;
      const modal = window.GalaxySim && window.GalaxySim.ShipAppearance;
      if (!SM || !modal || modal.isOpen()) return;
      SoundManager.playOk();
      this._lastFrameTime = performance.now();
      modal.open({
        onClose: (applied) => {
          if (applied) {
            const it = ConfigManager.language === 'it';
            this.setFlash(T('VehicleRepair.hullAppearanceUpdated'), true);
          }
          this.refreshUIVehicleDOM();
        },
      });
    }

    drawVehicleSprite() {
      // The vehicle itself, turning on the page: the real 3D model out of the
      // garage (Vehicle/CamperModel.js), which is the party's own starship where
      // this is the starship. A machine being taken apart and put back together
      // is worth looking at from every side, which a walking sprite cannot do.
      this.closeVehiclePreview();
      const canvas3d = document.getElementById('vehicle-sprite-canvas');
      if (canvas3d && window.VehicleModels && window.VehicleModels.has(this._vehicleType)) {
        this._vehiclePreview =
          window.VehicleModels.createPreview(canvas3d, this._vehicleType);
        if (this._vehiclePreview) return;
        // No WebGL, or no model built: the sprite below still carries it.
      }

      const spriteMap = {
        camper: { name: 'Vehicles/!$RV', index: 2 },  // i18n-ignore  sprite asset path
        car: { name: 'Vehicles/!$Car', index: 0 },  // i18n-ignore  sprite asset path
        bike: { name: 'Vehicles/!$Bike', index: 0 },  // i18n-ignore  sprite asset path
        airship: { name: 'Vehicles/!$Airship', index: 0 },  // i18n-ignore  sprite asset path
        boat: { name: 'Vehicles/!$Boat', index: 0 },  // i18n-ignore  sprite asset path
      };
      const info = spriteMap[this._vehicleType];
      if (!info) return;

      const bitmap = ImageManager.loadCharacter(info.name);
      const render = () => {
        const canvas = document.getElementById('vehicle-sprite-canvas');
        if (!canvas || !bitmap.width || !bitmap.height) return;

        const isBig = ImageManager.isBigCharacter(info.name);
        const pw = bitmap.width / (isBig ? 3 : 12);
        const ph = bitmap.height / (isBig ? 4 : 8);
        const blockX = isBig ? 0 : (info.index % 4) * 3;
        const blockY = isBig ? 0 : Math.floor(info.index / 4) * 4;
        const sx = (blockX + 1) * pw; // middle (standing) frame
        const sy = (blockY + 0) * ph; // down-facing row

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        const scale = Math.min(canvas.width / pw, canvas.height / ph);
        const dw = pw * scale;
        const dh = ph * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, dx, dy, dw, dh);
      };

      if (bitmap.isReady()) {
        render();
      } else {
        bitmap.addLoadListener(render);
      }
    }

    // The preview holds a live WebGL context: it is handed back whenever the
    // page is redrawn and when the bay closes.
    closeVehiclePreview() {
      if (this._vehiclePreview) {
        this._vehiclePreview.dispose();
        this._vehiclePreview = null;
      }
    }

    scrollPartsList(direction) {
      const c = this._dndContainer;
      if (!c) return;
      const box = c.querySelector('.maint-scroll[data-active="1"]') || c.querySelector('.maint-scroll');
      if (box) {
        box.scrollTop += direction * 35;
      }
    }

    exitMaintenance() {
      SoundManager.playCancel();
      this.closeVehiclePreview();
      SceneManager.pop();
    }

    update() {
      super.update();

      // While the appearance modal is up it owns the input and drives its own
      // preview; the pockets underneath just keeps the frames ticking.
      const modal = window.GalaxySim && window.GalaxySim.ShipAppearance;
      if (modal && modal.isOpen()) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - (this._lastFrameTime || now)) / 1000);
        this._lastFrameTime = now;
        modal.tick(dt);
        return;
      }

      // Fade the transient feedback line.
      if (this._flashTimer > 0) {
        this._flashTimer--;
        if (this._flashTimer === 0) { this._flash = null; this.refreshUIVehicleDOM(); }
      }

      if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
        this.exitMaintenance();
        return;
      }

      // Left/Right toggles the Repair <-> Upgrades tab. Read before the ring,
      // which would otherwise walk sideways along a row of parts.
      if (Input.isTriggered('left') || Input.isTriggered('right')) {
        this.switchTab(this._tab === 'repair' ? 'upgrades' : 'repair');
        return;
      }

      // Up/Down walk the buttons on the open tab, Confirm presses the one under
      // the ring; the pane scrolls to keep it in view. The wheel and the page
      // keys still scroll the list on their own, for reading rather than
      // choosing.
      if (window.CCNav) {
        if (!window.CCNav.active()) window.CCNav.enter("right");
        if (window.CCNav.update()) return;
        window.CCNav.paint();
      }
      if (Input.isRepeated('pagedown')) {
        this.scrollPartsList(1);
      } else if (Input.isRepeated('pageup')) {
        this.scrollPartsList(-1);
      }
    }
  }

  // Create specific scene classes for each vehicle type
  class Scene_CamperMaintenance extends Scene_VehicleMaintenance {
    initialize() {
      super.initialize("camper");
    }
  }

  class Scene_CarMaintenance extends Scene_VehicleMaintenance {
    initialize() {
      super.initialize("car");
    }
  }

  class Scene_AirshipMaintenance extends Scene_VehicleMaintenance {
    initialize() {
      super.initialize("airship");
    }
  }

  class Scene_BikeMaintenance extends Scene_VehicleMaintenance {
    initialize() {
      super.initialize("bike");
    }
  }

  class Scene_BoatMaintenance extends Scene_VehicleMaintenance {
    initialize() {
      super.initialize("boat");
    }
  }

  // Opener used by VehicleSystem's "Repairs" menu so the player reaches the
  // full repair + upgrade interface directly (no common-event indirection).
  const MAINTENANCE_SCENES = {
    camper: Scene_CamperMaintenance,
    car: Scene_CarMaintenance,
    airship: Scene_AirshipMaintenance,
    bike: Scene_BikeMaintenance,
    boat: Scene_BoatMaintenance
  };
  window.VehicleMaintenance = {
    open(type) {
      const Scene = MAINTENANCE_SCENES[type] || Scene_CamperMaintenance;
      if ($gameSystem && !$gameSystem._vehicleHealth) initializeVehicleHealth();
      SceneManager.push(Scene);
    },
    // True when a maintenance/upgrade scene exists for this vehicle key. Used by
    // the Vehicles menu to decide whether to offer a Repair button.
    has(type) {
      return !!MAINTENANCE_SCENES[type];
    }
  };

  //=============================================================================
  // Game System Initialization Hook
  //=============================================================================

  const _DataManager_createGameObjects = DataManager.createGameObjects;
  DataManager.createGameObjects = function () {
    _DataManager_createGameObjects.call(this);
    // Initialize vehicle health after game objects are created
    if ($gameSystem && !$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }
  };

  //=============================================================================
  // Plugin Commands
  //=============================================================================

  PluginManager.registerCommand(pluginName, "camperMaintenance", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    SceneManager.push(Scene_CamperMaintenance);
  });

  PluginManager.registerCommand(pluginName, "carMaintenance", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    SceneManager.push(Scene_CarMaintenance);
  });

  PluginManager.registerCommand(pluginName, "airshipMaintenance", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    SceneManager.push(Scene_AirshipMaintenance);
  });

  PluginManager.registerCommand(pluginName, "bikeMaintenance", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    SceneManager.push(Scene_BikeMaintenance);
  });

  PluginManager.registerCommand(pluginName, "damageCamper", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    applyDamage("camper", damagePerHit);

    // Show message if vehicle becomes broken
    if (window.brokenCamper) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.criticalDamage', { vehicle: T('VehicleRepair.vehicle.camper') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirstLong'));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.tookDamage', { vehicle: T('VehicleRepair.vehicle.camper') }));
      window.skipLocalization = false;
    }
  });

  PluginManager.registerCommand(pluginName, "damageCar", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    applyDamage("car", damagePerHit);

    // Show message if vehicle becomes broken
    if (window.brokenCar) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.criticalDamage', { vehicle: T('VehicleRepair.vehicle.car') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirstLong'));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.tookDamage', { vehicle: T('VehicleRepair.vehicle.car') }));
      window.skipLocalization = false;
    }
  });

  PluginManager.registerCommand(pluginName, "damageAirship", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    applyDamage("airship", damagePerHit);

    // Show message if vehicle becomes broken
    if (window.brokenAirship) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.criticalDamage', { vehicle: T('VehicleRepair.vehicle.starship') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirstLong'));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.tookDamage', { vehicle: T('VehicleRepair.vehicle.starship') }));
      window.skipLocalization = false;
    }
  });

  PluginManager.registerCommand(pluginName, "damageBike", () => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    applyDamage("bike", damagePerHit);

    // Show message if vehicle becomes broken
    if (window.brokenBike) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.criticalDamage', { vehicle: T('VehicleRepair.vehicle.bike') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirstLong'));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.tookDamage', { vehicle: T('VehicleRepair.vehicle.bike') }));
      window.skipLocalization = false;
    }
  });

  PluginManager.registerCommand(pluginName, "repairCamper", (args) => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    const repairPercent = args.amount === "full" ? 100 : repairAmountPartial;
    const wasBroken = window.brokenCamper;

    repairVehicle("camper", repairPercent);

    if (args.amount === "full") {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.fullyRepaired', { vehicle: T('VehicleRepair.vehicle.camper') }));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.partiallyRepaired', { vehicle: T('VehicleRepair.vehicle.camper'), percent: repairAmountPartial }));
      window.skipLocalization = false;
    }

    // Check if vehicle is now operational
    if (wasBroken && !window.brokenCamper) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.nowOperational', { vehicle: T('VehicleRepair.vehicle.camper') }));
      window.skipLocalization = false;
    }
  });

  PluginManager.registerCommand(pluginName, "repairCar", (args) => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    const repairPercent = args.amount === "full" ? 100 : repairAmountPartial;
    const wasBroken = window.brokenCar;

    repairVehicle("car", repairPercent);

    if (args.amount === "full") {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.fullyRepaired', { vehicle: T('VehicleRepair.vehicle.car') }));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.partiallyRepaired', { vehicle: T('VehicleRepair.vehicle.car'), percent: repairAmountPartial }));
      window.skipLocalization = false;
    }

    // Check if vehicle is now operational
    if (wasBroken && !window.brokenCar) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.nowOperational', { vehicle: T('VehicleRepair.vehicle.car') }));
      window.skipLocalization = false;
    }
  });

  PluginManager.registerCommand(pluginName, "repairAirship", (args) => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    const repairPercent = args.amount === "full" ? 100 : repairAmountPartial;
    const wasBroken = window.brokenAirship;

    repairVehicle("airship", repairPercent);

    if (args.amount === "full") {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.fullyRepaired', { vehicle: T('VehicleRepair.vehicle.starship') }));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.partiallyRepaired', { vehicle: T('VehicleRepair.vehicle.starship'), percent: repairAmountPartial }));
      window.skipLocalization = false;
    }

    // Check if vehicle is now operational
    if (wasBroken && !window.brokenAirship) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.nowOperational', { vehicle: T('VehicleRepair.vehicle.starship') }));
      window.skipLocalization = false;
    }
  });

  PluginManager.registerCommand(pluginName, "repairBike", (args) => {
    if (!ensureGameSystemExists()) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.systemNotReady'));
      window.skipLocalization = false;
      return;
    }

    if (!$gameSystem._vehicleHealth) {
      initializeVehicleHealth();
    }

    const repairPercent = args.amount === "full" ? 100 : repairAmountPartial;
    const wasBroken = window.brokenBike;

    repairVehicle("bike", repairPercent);

    if (args.amount === "full") {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.fullyRepaired', { vehicle: T('VehicleRepair.vehicle.bike') }));
      window.skipLocalization = false;
    } else {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.partiallyRepaired', { vehicle: T('VehicleRepair.vehicle.bike'), percent: repairAmountPartial }));
      window.skipLocalization = false;
    }

    // Check if vehicle is now operational
    if (wasBroken && !window.brokenBike) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.nowOperational', { vehicle: T('VehicleRepair.vehicle.bike') }));
      window.skipLocalization = false;
    }
  });

  //=============================================================================
  // Integration with VehicleSystem.js
  //=============================================================================

  // Override vehicle movement check to include broken status
  const _Game_Vehicle_canMove = Game_Vehicle.prototype.canMove;
  Game_Vehicle.prototype.canMove = function () {
    if (this.isShip() && window.brokenCamper) {
      return false;
    }
    if (this.isBoat() && $gameSystem._boatType === 'bike' && window.brokenBike) {
      return false;
    }
    if (this.isBoat() && $gameSystem._boatType === 'car' && window.brokenCar) {
      return false;
    }
    if (this.isBoat() && $gameSystem._boatType === 'boat' && window.brokenBoat) {
      return false;
    }
    if (this.isAirship() && window.brokenAirship) {
      return false;
    }
    return _Game_Vehicle_canMove.call(this);
  };

  // Override getting on vehicle if broken
  const _Game_Vehicle_getOn = Game_Vehicle.prototype.getOn;
  Game_Vehicle.prototype.getOn = function () {
    if (this.isShip() && window.brokenCamper) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.brokenCannotUse', { vehicle: T('VehicleRepair.vehicle.camper') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirst'));
      window.skipLocalization = false;
      return;
    }
    if (this.isBoat() && $gameSystem._boatType === 'bike' && window.brokenBike) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.brokenCannotUse', { vehicle: T('VehicleRepair.vehicle.bike') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirst'));
      window.skipLocalization = false;
      return;
    }
    if (this.isBoat() && $gameSystem._boatType === 'car' && window.brokenCar) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.brokenCannotUse', { vehicle: T('VehicleRepair.vehicle.car') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirst'));
      window.skipLocalization = false;
      return;
    }
    if (this.isBoat() && $gameSystem._boatType === 'boat' && window.brokenBoat) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.brokenCannotUse', { vehicle: T('VehicleRepair.vehicle.boat') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirst'));
      window.skipLocalization = false;
      return;
    }
    if (this.isAirship() && window.brokenAirship) {
      window.skipLocalization = true;
      $gameMessage.add(T('VehicleRepair.brokenCannotUse', { vehicle: T('VehicleRepair.vehicle.starship') }));
      $gameMessage.add(T('VehicleRepair.repairCriticalFirst'));
      window.skipLocalization = false;
      return;
    }
    _Game_Vehicle_getOn.call(this);
  };

  // Save/Load compatibility
  const _DataManager_makeSaveContents = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    const contents = _DataManager_makeSaveContents.call(this);
    if ($gameSystem && $gameSystem._vehicleHealth) {
      contents.vehicleHealth = $gameSystem._vehicleHealth;
    }
    contents.brokenCamper = window.brokenCamper;
    contents.brokenCar = window.brokenCar;
    contents.brokenBike = window.brokenBike;
    contents.brokenAirship = window.brokenAirship;
    contents.brokenBoat = window.brokenBoat;
    return contents;
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    if (contents.vehicleHealth && $gameSystem) {
      $gameSystem._vehicleHealth = contents.vehicleHealth;
    } else if ($gameSystem) {
      initializeVehicleHealth();
    }
    window.brokenCamper = contents.brokenCamper || false;
    window.brokenCar = contents.brokenCar || false;
    window.brokenBike = contents.brokenBike || false;
    window.brokenAirship = contents.brokenAirship || false;
    window.brokenBoat = contents.brokenBoat || false;
  };

})();