/*:
 * @target MZ
 * @plugindesc Furniture System v1.0.0
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Furniture System Plugin for RPG Maker MZ
 * ============================================================================
 * 
 * This plugin provides a comprehensive furniture system with placement,
 * crafting, buying, and dismantling features.
 * 
 * Features:
 * - Dynamic furniture placement with grid snapping (48x48 tiles)
 * - Crafting system using materials
 * - Buy/sell furniture
 * - Dismantle furniture to recover materials
 * - Multi-tile furniture support
 * - Vertical flip system for rotatable furniture
 * - Wall furniture placement restriction (terrain tag 4)
 * - Non-wall furniture: upper tiles can overlap walls, lower tiles cannot
 * - Terrain tag 7 blocks all furniture placement
 * - Save/load furniture positions
 * 
 * Plugin Commands:
 * - Open Furniture Builder
 * - Enter Placement Mode
 * - Give Furniture
 * - Give Material
 * - Unlock Recipe
 * 
 * @param tileSize
 * @text Tile Size
 * @desc Size of each tile in pixels
 * @type number
 * @default 48
 * 
 * @param gridOpacity
 * @text Grid Overlay Opacity
 * @desc Opacity of the grid overlay in placement mode (0-255)
 * @type number
 * @min 0
 * @max 255
 * @default 128
 * 
 * @param dismantleReturn
 * @text Dismantle Return Rate
 * @desc Percentage of materials returned when dismantling (0-1)
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.75
 *
 * @param materialPerTile
 * @text Material Cost Per Tile
 * @desc Base amount of each material consumed per tile of footprint area
 * @type number
 * @decimals 2
 * @min 0
 * @default 1.50
 *
 * @command openBuilder
 * @text Open Furniture Builder
 * @desc Opens the on-map furniture build overlay
 * 
 * @command enterPlacementMode
 * @text Enter Placement Mode
 * @desc Enter furniture placement mode
 * @arg furnitureId
 * @text Furniture ID
 * @desc ID of the furniture to place
 * @type string
 * 
 * @command giveFurniture
 * @text Give Furniture
 * @desc Add furniture to inventory
 * @arg furnitureId
 * @text Furniture ID
 * @desc ID of the furniture to give
 * @type string
 * @arg quantity
 * @text Quantity
 * @desc Number of items to give
 * @type number
 * @default 1
 * 
 * @command giveMaterial
 * @text Give Material
 * @desc Add crafting material to inventory
 * @arg materialId
 * @text Material ID
 * @desc ID of the material (e.g., 0570 for Wood)
 * @type string
 * @arg quantity
 * @text Quantity
 * @desc Number of materials to give
 * @type number
 * @default 1
 * 
 * @command unlockRecipe
 * @text Unlock Recipe
 * @desc Unlock a furniture recipe
 * @arg recipeId
 * @text Recipe ID
 * @desc ID of the furniture recipe to unlock
 * @type string
 * 
 * @command removeAllFurniture
 * @text Remove All Furniture
 * @desc Removes all furniture from current map
 */

(() => {
    'use strict';

    const pluginName = 'FurnitureSystem';
    const parameters = PluginManager.parameters(pluginName);
    const TILE_SIZE = Number(parameters['tileSize'] || 48);
    const GRID_OPACITY = Number(parameters['gridOpacity'] || 128);
    const DISMANTLE_RETURN = Number(parameters['dismantleReturn'] || 0.75);
    const MATERIAL_PER_TILE = Number(parameters['materialPerTile'] || 1.5);
    // The catalogue is three and a half megabytes of it, and nobody needs a
    // single line until somebody actually places a piece: reading it here, at
    // load, put the whole thing on the boot path of every session. Registered
    // lazily by DataService and taken through this, it is read the first time a
    // piece is looked up and cached from then on.
    let _catalogue = null;
    function catalogue() {
        if (!_catalogue) _catalogue = (window.Items && window.Items.Furniture) || {};
        return _catalogue;
    }
    // Everything below reads the catalogue through this proxy, so `Furniture[id]`
    // and `Object.entries(Furniture)` still read exactly as they did.
    const Furniture = new Proxy({}, {
        get(_, k) { return catalogue()[k]; },
        has(_, k) { return k in catalogue(); },
        ownKeys() { return Reflect.ownKeys(catalogue()); },
        getOwnPropertyDescriptor(_, k) {
            const d = Object.getOwnPropertyDescriptor(catalogue(), k);
            if (d) d.configurable = true;
            return d;
        }
    });

    //=============================================================================
    // Material Definitions
    //=============================================================================

    // Crafting materials are now real database items (data/Items.json, IDs 849-871).
    // The static names/icons here are only fallbacks; getMaterialInfo() pulls the
    // live name and icon straight from $dataItems so the build menu always matches
    // what the player sees in their inventory.
    // i18n-ignore-start: display fallbacks only. getMaterialInfo() reads the
    // live $dataItems entry, which Hendrix_Localization already translates
    // through js/i18n/<lang>/items.json; these are what shows before the
    // database is loaded.
    const MATERIALS = {
        849: { name: "Arcane Essence", icon: 165 },
        850: { name: "Ethereal Shard", icon: 72 },
        851: { name: "Quantum Core", icon: 67 },
        852: { name: "Circuit Board", icon: 196 },
        853: { name: "Microchip", icon: 83 },
        854: { name: "Battery Cell", icon: 157 },
        855: { name: "Plastic Polymer", icon: 158 },
        856: { name: "Composite Resin", icon: 124 },
        857: { name: "Nanotube Module", icon: 156 },
        858: { name: "Plant Matter", icon: 276 },
        859: { name: "Wood", icon: 295 },
        860: { name: "Bone", icon: 298 },
        861: { name: "Cloth", icon: 138 },
        862: { name: "Meat", icon: 259 },
        863: { name: "Salvaged steel", icon: 305 },
        864: { name: "Titanium ore", icon: 306 },
        865: { name: "Varlenia ore", icon: 306 },
        866: { name: "Crystal", icon: 300 },
        867: { name: "Glass", icon: 222 },
        868: { name: "Leather", icon: 257 },
        869: { name: "Herb Extract", icon: 178 },
        870: { name: "Oil Flask", icon: 179 },
        871: { name: "Acidic Solution", icon: 180 }
    };
    // i18n-ignore-end

    // Legacy material IDs (565-587) are still baked into Furniture.json recipes.
    // Map them onto the real item IDs so existing recipes keep working untouched.
    const LEGACY_MATERIAL_REMAP = {
        565: 863, 566: 864, 567: 865, 568: 866, 569: 867, 570: 859,
        571: 868, 572: 861, 573: 860, 574: 862, 575: 858, 576: 869,
        577: 870, 578: 871, 579: 849, 580: 850, 581: 851, 582: 852,
        583: 853, 584: 854, 585: 855, 586: 856, 587: 857
    };

    function normalizeMaterialId(id) {
        const n = Number(id);
        return LEGACY_MATERIAL_REMAP[n] || n;
    }

    // Resolve a material's display name and icon from the live database, falling
    // back to the static table when $dataItems is not yet available.
    function getMaterialInfo(id) {
        const nid = normalizeMaterialId(id);
        const dataItem = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems[nid] : null;
        const fallback = MATERIALS[nid] || { name: T('Furniture.materialFallback'), icon: 0 };
        return {
            id: nid,
            name: dataItem ? dataItem.name : fallback.name,
            icon: dataItem ? dataItem.iconIndex : fallback.icon
        };
    }

    // Crafting materials live in the real party inventory as database items
    // (IDs 849-871). These bridge the furniture system to $gameParty so the
    // build menu reflects what the player actually holds.
    function materialItem(id) {
        const nid = normalizeMaterialId(id);
        return (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems[nid] : null;
    }

    function getMaterialCount(id) {
        const item = materialItem(id);
        return (item && typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.numItems(item) : 0;
    }

    //=============================================================================
    // Build Economy Helpers (size-based material cost)
    //=============================================================================

    // Free building: sandbox mode active, or the leader actor is named "Test".
    function isFreeBuild() {
        if ($gameSystem && $gameSystem._isSandboxMode) return true;
        const actor = $gameActors && $gameActors.actor(1);
        if (actor && actor.name() === 'Test') return true; // i18n-ignore: playtest character name
        if ($gameVariables && $gameVariables.value(105) === 'Test') return true; // i18n-ignore: playtest character name
        return false;
    }

    //============================================================make
    // =================
    // Map Build Rights (<BuildRights: Free|Owner|Disabled> map note tag)
    //=============================================================================

    // Free: building is always allowed. Disabled: building is never allowed.
    // Owner: building is allowed only where the player owns the location (an
    // owned procedural-house floor). Maps with no tag default to Free.
    function getMapBuildRights() {
        const note = ($dataMap && $dataMap.note) || '';
        // i18n-ignore-start: <BuildRights:> note-tag values, compared in code
        const m = note.match(/<BuildRights:\s*(\w+)>/i);
        if (!m) return 'Free';
        const v = m[1].toLowerCase();
        if (v === 'disabled') return 'Disabled';
        if (v === 'owner') return 'Owner';
        return 'Free';
        // i18n-ignore-end
    }

    // Whether the furniture builder may be opened on the current map. Used both
    // to guard build-mode entry and to enable/disable the menu command.
    function canBuildOnCurrentMap() {
        // Sandbox mode / the "Test" player ignore build rights entirely, so the
        // build menu stays enabled everywhere.
        if (isFreeBuild()) return true;
        // The procedural world map never permits building.
        if ($gameMap && $gameMap.mapId() === 315) return false;
        // Procedural biome map: a composite (per-world-coordinate) furniture key
        // means building here is coordinate-aware - remembered and restored per
        // world coordinate - so it is allowed despite the base map's template
        // <BuildRights: Disabled> note.
        const key = furnitureMapKey();
        if (typeof key === 'string' && $gameMap && key !== String($gameMap.mapId())) {
            return true;
        }
        const rights = getMapBuildRights();
        if (rights === 'Disabled') return false; // i18n-ignore: build-rights id
        // Free, and Owner land the party does not own: the builder opens either
        // way. Building on somebody else's floor is no longer refused, it is a
        // crime - see isIllegalBuildHere / chargeIllegalBuild below.
        return true;
    }

    // Land carrying <BuildRights: Owner> that the party does not own. The pieces
    // still go down, but every one of them is illegal construction: the value of
    // what was built is billed as a bounty when the builder closes.
    function isIllegalBuildHere() {
        if (isFreeBuild()) return false;
        if (getMapBuildRights() !== 'Owner') return false; // i18n-ignore: build-rights id
        // Coordinate-keyed procedural ground: building there is sanctioned (see
        // canBuildOnCurrentMap), whatever the reused template's note says.
        const key = furnitureMapKey();
        if (typeof key === 'string' && $gameMap && key !== String($gameMap.mapId())) return false;
        // Inside a procedural house the deed is the finer signal: a floor the
        // party bought (or inherited with a companion) is theirs to furnish.
        if (window.ProceduralHouseSystem?.isInsideHouse?.()) {
            return !window.ProceduralHouseSystem.isCurrentFloorOwned?.();
        }
        return true;
    }

    //=============================================================================
    // Illegal Construction (building on <BuildRights: Owner> land)
    //=============================================================================

    // The fine follows the value of the materials the piece is made of: putting
    // down a crate is a nuisance, raising a wing of somebody's house is not.
    // A whole building session is billed as ONE charge, so a held paint sweep
    // does not file fifty separate crimes.
    const ILLEGAL_BUILD_FINE_RATE = 0.5;
    const ILLEGAL_BUILD_FINE_MIN = 100; // 1.00 euro, the smallest fine worth filing
    const ILLEGAL_BUILD_CRIME_ID = 'illegalConstruction'; // i18n-ignore: PresetCrimes id
    let illegalBuildPending = 0;

    function chargeIllegalBuild(furniture) {
        if (!furniture || !isIllegalBuildHere()) return;
        illegalBuildPending += getFurniturePrice(furniture);
    }

    // Files everything built this session as a single charge with the
    // nEuroPolice. Called when the builder closes (including on scene change).
    function flushIllegalBuild() {
        const value = illegalBuildPending;
        illegalBuildPending = 0;
        if (value <= 0) return;
        const CS = window.CrimeSystem;
        if (!CS || typeof CS.addCrime !== 'function') return;
        const preset = (typeof CS.getAllPresetCrimes === 'function')
            ? CS.getAllPresetCrimes()[ILLEGAL_BUILD_CRIME_ID] : null;
        const name = (preset && preset.name) || T('Furniture.illegal.charge');
        const bounty = Math.max(ILLEGAL_BUILD_FINE_MIN, Math.round(value * ILLEGAL_BUILD_FINE_RATE));
        CS.addCrime(name, bounty, ILLEGAL_BUILD_CRIME_ID);
    }

    // The one fixed warning, shown when the builder opens on land that is not
    // the party's. It never changes with the piece, the map or the fine.
    function warnIllegalBuild() {
        if (!window.ParchmentToast) return;
        window.ParchmentToast.show(T('Furniture.illegal.warning'), {
            severity: 'warning',
            duration: 240,
            key: 'furniture-illegal-build'
        });
    }

    window.FurnitureSystem = window.FurnitureSystem || {};
    window.FurnitureSystem.getMapBuildRights = getMapBuildRights;
    window.FurnitureSystem.canBuildOnCurrentMap = canBuildOnCurrentMap;
    window.FurnitureSystem.isIllegalBuildHere = isIllegalBuildHere;

    // The key under which the CURRENT map's placed furniture is stored/restored.
    // Normally this is the numeric map id. The procedural map, though, is a single
    // reused map (id 636) that streams a different biome tile for every world
    // coordinate, so keying by its map id alone would make furniture built at one
    // world coordinate leak into every other. A provider registered on
    // window.FurnitureSystem.mapKeyProvider (see WorldMapReturn.js) returns
    // a composite key - biome + world coordinate - so pieces are remembered and
    // restored only at the world coordinate + biome where they were built. The
    // per-piece x/y (proc-map coordinates) are already stored on each placement.
    function furnitureMapKey() {
        const mapId = (typeof $gameMap !== 'undefined' && $gameMap) ? $gameMap.mapId() : 0;
        const provider = window.FurnitureSystem && window.FurnitureSystem.mapKeyProvider;
        if (provider) {
            try {
                const key = provider(mapId);
                if (key != null) return key;
            } catch (e) { /* fall back to the plain map id */ }
        }
        return mapId;
    }
    window.FurnitureSystem.furnitureMapKey = furnitureMapKey;

    function furnitureArea(furniture) {
        return Math.max(1, (furniture.width || 1) * (furniture.height || 1));
    }

    // Furniture sprites used to live in folders named by their pixel footprint
    // (a 2x1 piece in img/furniture/96x48/). The art was reorganised into
    // asset-set folders (img/furniture/Art/, img/furniture/Occult/, ...) with no
    // rule that maps a piece's id to its folder, so the path is now resolved from
    // an explicit index: window.Items.FurnitureImageFolders ({ id: folderName }),
    // generated by tools/build-furniture-index.js. Re-run that script whenever the
    // img/furniture/ folders are added/renamed.
    const FURNITURE_IMG_TILE = 48;

    //=============================================================================
    // Folder-Based Category Rules
    //=============================================================================
    // Each img/furniture/<Folder>/ determines collision, z-layer, wall-only
    // placement, and special behaviours (ladders). Unknown folders default to
    // impassable + same-level.
    //
    // collision: 'all'    – every tile impassable
    //            'lower'  – bottom row impassable, upper tiles passable
    //            'lower2' – bottom two rows impassable
    //            'none'   – fully passable
    // layer:    'below' (z=1), 'same' (z=3), 'above' (z=5)
    // wall:     true  – must be placed on terrain tag 4
    // ladder:   true  – tile acts as RPG Maker ladder (passable, ignores walls)

    // i18n-ignore-start: asset-set folder ids. They key this table, the recipe
    // table, the tab groupings and the img/furniture/<Folder>/ path; the label
    // the player reads comes from titleCaseCategory().
    const FOLDER_RULES = {
        'Ads':          { wall: true,  collision: 'none',   layer: 'same' },
        'Art':          { wall: true,  collision: 'none',   layer: 'same' },
        'Banners':      { wall: true,  collision: 'none',   layer: 'same' },
        'Barrels':      { collision: 'all',   layer: 'same' },
        'Bathroom':     { collision: 'all',   layer: 'same' },
        'Beach':        { collision: 'none',  layer: 'below' },
        'Beds':         { collision: 'all',   layer: 'same' },
        'Benches':      { collision: 'all',   layer: 'same' },
        'Boards':       { wall: true,  collision: 'none',   layer: 'same' },
        'Bodyparts':    { collision: 'all',   layer: 'same' },
        'Books':        { collision: 'none',  layer: 'same' },
        'Boxes':        { collision: 'all',   layer: 'same' },
        'Bridges':      { collision: 'none',  layer: 'same' },
        'Buildings':    { collision: 'all',   layer: 'same' },
        'Cages':        { collision: 'all',   layer: 'same' },
        'Camping':      { collision: 'all',   layer: 'same' },
        'Candles':      { collision: 'none',  layer: 'same' },
        'Carpets':      { collision: 'none',  layer: 'below' },
        'Cauldrons':    { collision: 'all',   layer: 'same' },
        'Chairs':       { collision: 'all',   layer: 'same' },
        'City':         { collision: 'all',   layer: 'same' },
        'Clothes':      { collision: 'none',  layer: 'same' },
        'Columns':      { collision: 'all',   layer: 'same' },
        'Containers':   { collision: 'all',   layer: 'same' },
        'Couches':      { collision: 'all',   layer: 'same' },
        'Counters':     { collision: 'all',   layer: 'same' },
        'Crystals':     { collision: 'all',   layer: 'same' },
        'Decorations':  { collision: 'none',   layer: 'same' },
        'Doors':        { collision: 'all',   layer: 'same' },
        'Fences':       { collision: 'all',   layer: 'same' },
        'Flowers':      { collision: 'none',  layer: 'same' },
        'Food':         { collision: 'none',  layer: 'same' },
        'Fossils':      { collision: 'lower2', layer: 'above' },
        'Fun':          { collision: 'all',   layer: 'same' },
        'Furniture':    { collision: 'lower', layer: 'above' },
        'Gears':        { collision: 'all',   layer: 'same' },
        'Graffiti':     { wall: true,  collision: 'none',   layer: 'same' },
        'Grass':        { collision: 'none',  layer: 'below' },
        'Graves':       { collision: 'all',   layer: 'same' },
        'Houses':       { collision: 'all',   layer: 'same' },
        'Ladders':      { wall: true,  collision: 'none',   layer: 'same', ladder: true },
        'Libraries':    { collision: 'lower', layer: 'above' },
        'Liquids':      { collision: 'none',  layer: 'below' },
        'Magic':        { collision: 'none',  layer: 'below' },
        'Masks':        { wall: true,  collision: 'none',   layer: 'same' },
        'Medical':      { collision: 'all',   layer: 'same' },
        'Mushrooms':    { collision: 'none',  layer: 'same' },
        'Music':        { collision: 'all',   layer: 'same' },
        'Paintings':    { wall: true,  collision: 'none',   layer: 'same' },
        'Pipes':        { collision: 'all',   layer: 'same' },
        'Plants':       { collision: 'none',  layer: 'same' },
        'Poles':        { collision: 'all',   layer: 'same' },
        'PottedPlants': { collision: 'all',   layer: 'same' },
        'Rails':        { collision: 'all',   layer: 'same' },
        'Rocks':        { collision: 'all',   layer: 'same' },
        'Roofs':        { collision: 'none',  layer: 'above' },
        'Rooms':        { collision: 'none',  layer: 'below' },
        'Sheets':       { collision: 'none',  layer: 'below' },
        'Shelves':      { collision: 'lower', layer: 'above' },
        'Signs':        { collision: 'all',   layer: 'same' },
        'Sport':        { collision: 'all',   layer: 'same' },
        'Stairs':       { collision: 'none',  layer: 'same' },
        'Statues':      { collision: 'all',   layer: 'same' },
        'Tables':       { collision: 'all',   layer: 'same' },
        'Tech':         { collision: 'all',   layer: 'same' },
        'Tent':         { collision: 'lower', layer: 'above' },
        'Tentacles':    { collision: 'none',  layer: 'same' },
        'Tents':        { collision: 'lower', layer: 'above' },
        'Terrain':      { collision: 'none',  layer: 'below' },
        'Tools':        { collision: 'all',   layer: 'same' },
        'Trash':        { collision: 'all',   layer: 'same' },
        'Trees':        { collision: 'lower', layer: 'above' },
        'Tunnels':      { collision: 'none',  layer: 'below' },
        'Underwater':   { collision: 'none',  layer: 'below' },
        'Vases':        { collision: 'all',   layer: 'same' },
        'Vehicles':     { collision: 'all',   layer: 'same' },
        'Vines':        { collision: 'none',  layer: 'same' },
        'WaterItems':   { collision: 'none',  layer: 'below' },
        'Weapons':      { collision: 'all',   layer: 'same' },
        'Wells':        { collision: 'all',   layer: 'same' },
        'Windows':      { wall: true,  collision: 'none',   layer: 'same' },
        'Wood':         { collision: 'all',   layer: 'same' },
        // Full-canvas blue ground tiles split out of Terrain by the asset rework.
        'Water':        { collision: 'none',  layer: 'below' },

        // --- Additional asset-set folders (added to cover every img/furniture/* dir) ---
        'Alchemistry':      { collision: 'all',   layer: 'same' },
        'Balcony':          { collision: 'all',   layer: 'same' },
        'Baskets':          { collision: 'all',   layer: 'same' },
        'Bedroom':          { collision: 'all',   layer: 'same' },
        'Bins':             { collision: 'all',   layer: 'same' },
        'Buckets':          { collision: 'all',   layer: 'same' },
        'Cases':            { collision: 'all',   layer: 'same' },
        'Chimneys':         { collision: 'lower', layer: 'above' },
        'Clocks':           { collision: 'all',   layer: 'same' },
        'ClothingStore':    { collision: 'all',   layer: 'same' },
        'Curtains':         { collision: 'none',  layer: 'same' },
        'Electronics':      { collision: 'all',   layer: 'same' },
        'Fantasy':          { collision: 'all',   layer: 'same' },
        'Farming':          { collision: 'all',   layer: 'same' },
        'Fountains':        { collision: 'all',   layer: 'same' },
        'GroceryStore':     { collision: 'all',   layer: 'same' },
        'Gym':              { collision: 'all',   layer: 'same' },
        'Holes':            { collision: 'none',  layer: 'below' },
        'Hospital':         { collision: 'all',   layer: 'same' },
        'Jail':             { collision: 'all',   layer: 'same' },
        'Kitchen':          { collision: 'all',   layer: 'same' },
        'Lights':           { collision: 'none',  layer: 'same' },
        'LivingRoom':       { collision: 'all',   layer: 'same' },
        'Mailboxes':        { collision: 'all',   layer: 'same' },
        'Mannequins':       { collision: 'all',   layer: 'same' },
        'Mechanical':       { collision: 'all',   layer: 'same' },
        'Mirrors':          { collision: 'all',   layer: 'same' },
        'Misc':             { collision: 'all',   layer: 'same' },
        'Outside':          { collision: 'all',   layer: 'same' },
        'Pavement':         { collision: 'none',  layer: 'below' },
        'Peluches':         { collision: 'all',   layer: 'same' },
        'Potions':          { collision: 'none',  layer: 'same' },
        'School':           { collision: 'all',   layer: 'same' },
        'ShoppingCarts':    { collision: 'all',   layer: 'same' },
        'Sports':           { collision: 'all',   layer: 'same' },
        'Storage':          { collision: 'all',   layer: 'same' },
        'Tilesets':         { collision: 'all',   layer: 'same' },
        'Tombs':            { collision: 'all',   layer: 'same' },
        'TrafficCones':     { collision: 'all',   layer: 'same' },
        'Treasures':        { collision: 'all',   layer: 'same' },
        'TreeStumps':       { collision: 'all',   layer: 'same' },
        'VehiclesInterior': { collision: 'all',   layer: 'same' }
    };
    // i18n-ignore-end

    const DEFAULT_FOLDER_RULE = { collision: 'all', layer: 'same' };

    // Resolve the folder-based rules for a furniture piece by its id.
    // The index now stores "<Category>/<Subcategory>"; collision, layer and
    // wall-mounting are a property of the category, so only the first segment
    // is looked up. A one-segment value (older index, or a modded folder) still
    // resolves unchanged.
    function getFolderRules(furnitureId) {
        const index = (window.Items && window.Items.FurnitureImageFolders) || null;
        if (furnitureId && index && index[furnitureId]) {
            const category = String(index[furnitureId]).split('/')[0];
            return FOLDER_RULES[category] || DEFAULT_FOLDER_RULE;
        }
        return DEFAULT_FOLDER_RULE;
    }

    // Categories with hard-coded, special placement behaviour that overrides the
    // generic folder rules:
    //   Carpets     – flat floor decor: passable, drawn below, floor tiles only
    //   Ads         – wall decor: passable, wall tiles only
    //   Decorations – free decor: passable, placeable anywhere (over walls AND
    //                 over other furniture)
    const CAT_CARPETS = 'Carpets';          // i18n-ignore: folder id
    const CAT_ADS = 'Ads';                  // i18n-ignore: folder id
    const CAT_DECORATIONS = 'Decorations';  // i18n-ignore: folder id

    // Effective collision after applying the universal "tall furniture" rule:
    // any solid piece more than one tile tall blocks ONLY its bottom row (the
    // upper tiles stay passable and are drawn over the player). One-tile solids
    // block fully. Passable/decor/wall categories keep their 'none' collision.
    function getEffectiveCollision(furnitureId, fData) {
        const cat = fData && fData.category;
        if (cat === CAT_CARPETS || cat === CAT_DECORATIONS) return 'none';
        const rules = getFolderRules(furnitureId);
        if (rules.wall) return 'none';           // Ads and other wall-mounted decor
        if (rules.collision === 'none') return 'none';
        const h = (fData && fData.height) || 1;
        return h > 1 ? 'lower' : 'all';
    }

    // Effective z-layer. Tall solid pieces draw ABOVE the player so their upper
    // (passable) tiles overlap the character; everything else keeps its folder
    // layer.
    function getEffectiveLayer(furnitureId, fData) {
        const cat = fData && fData.category;
        if (cat === CAT_CARPETS) return 'below';
        if (cat === CAT_DECORATIONS) return 'same';
        const rules = getFolderRules(furnitureId);
        const h = (fData && fData.height) || 1;
        if (rules.collision !== 'none' && !rules.wall && h > 1) return 'above';
        return rules.layer;
    }

    // The asset-set folder for a piece, or null when the index has no image for
    // it (those pieces fall back to a coloured placeholder instead of requesting a
    // now-deleted size-named path, which would only log 404s).
    function furnitureImageFolder(id) {
        const index = (window.Items && window.Items.FurnitureImageFolders) || null;
        if (id && index && index[id]) {
            return `img/furniture/${index[id]}/`; // i18n-ignore: asset path
        }
        return null;
    }

    // Full URL to a piece's PNG, or null when it has no indexed image.
    function furnitureImageSrc(id) {
        const folder = furnitureImageFolder(id);
        return folder ? `${folder}${id}.png` : null;
    }


    //=============================================================================
    // Recolour families (tileGroupId)
    //=============================================================================
    // A lot of the art is one object drawn in several colourways - seven beanies,
    // five mattresses, six sarcophagi. Furniture.json gives every member of such a
    // family the same `tileGroupId`, and the build menu shows the family as ONE
    // card whose art the player flicks through with the wheel or L1/R1 rather than
    // as seven near-identical cards. Which variant a family last showed is
    // remembered per save, so the menu reopens on the colour last used.

    let _groupIndex = null;

    // { tileGroupId: [id, ...] }, built once, ordered so the wheel is predictable.
    function furnitureGroups() {
        if (_groupIndex) return _groupIndex;
        _groupIndex = {};
        for (const [id, f] of Object.entries(Furniture)) {
            const gid = f && f.tileGroupId;
            if (!gid) continue;
            (_groupIndex[gid] = _groupIndex[gid] || []).push(id);
        }
        for (const gid of Object.keys(_groupIndex)) _groupIndex[gid].sort();
        return _groupIndex;
    }

    function furnitureGroupMembers(gid) {
        return (gid && furnitureGroups()[gid]) || [];
    }

    // The id a family currently shows. Falls back to the first member when the
    // remembered one has gone (art removed, save from an older catalogue).
    function groupChosenId(gid) {
        const members = furnitureGroupMembers(gid);
        if (!members.length) return null;
        const store = ($gameSystem && $gameSystem.furnitureVariants) ? $gameSystem.furnitureVariants() : null;
        const want = store && store[gid];
        return (want && members.includes(want)) ? want : members[0];
    }

    // Move a family's shown variant by `dir` and remember it.
    function cycleGroupVariant(gid, dir) {
        const members = furnitureGroupMembers(gid);
        if (members.length < 2) return null;
        const cur = members.indexOf(groupChosenId(gid));
        const next = members[((cur < 0 ? 0 : cur) + dir + members.length) % members.length];
        if ($gameSystem && $gameSystem.setFurnitureVariant) $gameSystem.setFurnitureVariant(gid, next);
        return next;
    }

    // Collapse a list of pieces so each recolour family contributes one entry:
    // the variant the player last chose. The entry carries __groupId and
    // __variantCount so the card can show the family size and the wheel knows
    // there is something to flick through.
    function collapseVariants(items) {
        const out = [];
        const seen = new Set();
        for (const item of items) {
            const gid = item.tileGroupId;
            if (!gid) { out.push(item); continue; }
            if (seen.has(gid)) continue;
            seen.add(gid);
            const members = furnitureGroupMembers(gid);
            const chosenId = groupChosenId(gid) || item.id;
            const chosen = Furniture[chosenId];
            out.push(Object.assign({}, chosen || item, {
                id: chosenId,
                __groupId: gid,
                __variantCount: members.length,
                __variantIndex: Math.max(0, members.indexOf(chosenId)) + 1
            }));
        }
        return out;
    }

    //=============================================================================
    // Category-Based Material Recipes
    //=============================================================================
    // Each folder category (the furniture's `category`, identical to its
    // img/furniture/<Folder>/ name) defines WHICH materials the piece is made of
    // and how much of each is needed per tile of footprint. The final quantity is
    // Math.max(1, round(area * perTile)), so bigger pieces cost proportionally
    // more. Materials are chosen to match the theme of the category:
    //   - plants/nature     → Plant Matter, a little Wood
    //   - wooden furniture   → Wood + Cloth/Leather upholstery
    //   - tech/electronics   → Microchips, Circuit Boards, Ingots, Batteries
    //   - magic/occult       → Arcane Essence, Ethereal Shard, Crystal
    //   - vehicles (largest) → tens of Steel/Titanium/Glass/Plastic/Battery parts
    // Unknown categories fall back to DEFAULT_RECIPE (plain Wood).

    // Material id shorthands (real database item ids 849-871).
    const M = {
        ARCANE: 849, ETHEREAL: 850, QUANTUM: 851, CIRCUIT: 852, MICROCHIP: 853,
        BATTERY: 854, PLASTIC: 855, RESIN: 856, NANOTUBE: 857, PLANT: 858,
        WOOD: 859, BONE: 860, CLOTH: 861, MEAT: 862, STEEL: 863, TITANIUM: 864,
        VARLENIA: 865, CRYSTAL: 866, GLASS: 867, LEATHER: 868, HERB: 869,
        OIL: 870, ACID: 871
    };

    // category -> [ [materialId, amountPerTile], ... ]
    // i18n-ignore-start: asset-set folder ids, see FOLDER_RULES
    const CATEGORY_RECIPES = {
        // --- Nature: cheap, mostly Plant Matter ---
        'Plants':       [[M.PLANT, 0.5]],
        'Flowers':      [[M.PLANT, 0.5]],
        'Grass':        [[M.PLANT, 0.4]],
        'Vines':        [[M.PLANT, 0.5]],
        'Mushrooms':    [[M.PLANT, 0.6]],
        'PottedPlants': [[M.PLANT, 0.5], [M.WOOD, 0.4], [M.GLASS, 0.2]],
        'Trees':        [[M.WOOD, 0.8], [M.PLANT, 0.4]],
        'Terrain':      [[M.PLANT, 0.4]],
        'Beach':        [[M.PLANT, 0.3], [M.GLASS, 0.2]],
        'Underwater':   [[M.PLANT, 0.4]],
        'WaterItems':   [[M.PLANT, 0.4]],
        'Liquids':      [[M.OIL, 0.3]],
        'WorldMap':     [[M.WOOD, 0.3], [M.CLOTH, 0.2]],

        // --- Stone / mineral ---
        'Rocks':        [[M.STEEL, 0.3]],
        'Crystals':     [[M.CRYSTAL, 0.8], [M.ETHEREAL, 0.3]],
        'Fossils':      [[M.BONE, 0.7]],
        'Bodyparts':    [[M.BONE, 0.5], [M.MEAT, 0.5]],
        'Columns':      [[M.CRYSTAL, 0.3], [M.STEEL, 0.3]],
        'Statues':      [[M.STEEL, 0.6], [M.CRYSTAL, 0.4]],
        'Pavement':     [[M.STEEL, 0.4]],
        'Graves':       [[M.STEEL, 0.3], [M.CRYSTAL, 0.2], [M.BONE, 0.2]],

        // --- Wooden furniture ---
        'Chairs':       [[M.WOOD, 1.0], [M.CLOTH, 0.4]],
        'Tables':       [[M.WOOD, 1.2]],
        'Benches':      [[M.WOOD, 1.0]],
        'Beds':         [[M.WOOD, 0.8], [M.CLOTH, 0.8], [M.LEATHER, 0.3]],
        'Couches':      [[M.WOOD, 0.6], [M.CLOTH, 1.0], [M.LEATHER, 0.5]],
        'Shelves':      [[M.WOOD, 1.0]],
        'Libraries':    [[M.WOOD, 1.2], [M.CLOTH, 0.3]],
        'Books':        [[M.CLOTH, 0.4]],
        'Boxes':        [[M.WOOD, 0.8]],
        'Barrels':      [[M.WOOD, 0.8], [M.STEEL, 0.3]],
        'Containers':   [[M.STEEL, 0.8], [M.WOOD, 0.4]],
        'Fences':       [[M.WOOD, 0.8]],
        'Doors':        [[M.WOOD, 1.0], [M.STEEL, 0.3]],
        'Wood':         [[M.WOOD, 1.5]],
        'Boards':       [[M.WOOD, 0.8]],
        'Poles':        [[M.WOOD, 0.6]],
        'Furniture':    [[M.WOOD, 1.0], [M.CLOTH, 0.4]],
        'Stairs':       [[M.WOOD, 0.8], [M.STEEL, 0.3]],
        'Ladders':      [[M.WOOD, 0.8]],
        'Roofs':        [[M.WOOD, 0.8], [M.STEEL, 0.3]],
        'Rooms':        [[M.WOOD, 0.6]],
        'Rails':        [[M.STEEL, 1.0], [M.WOOD, 0.4]],
        'Bridges':      [[M.WOOD, 0.8], [M.STEEL, 0.6]],

        // --- Cloth / soft goods ---
        'Carpets':      [[M.CLOTH, 0.8]],
        'Sheets':       [[M.CLOTH, 0.8]],
        'Clothes':      [[M.CLOTH, 0.8], [M.LEATHER, 0.2]],
        'Banners':      [[M.CLOTH, 0.6]],
        'Masks':        [[M.CLOTH, 0.3], [M.LEATHER, 0.3]],
        'Tents':        [[M.CLOTH, 1.0], [M.WOOD, 0.4]],
        'Tent':         [[M.CLOTH, 1.0], [M.WOOD, 0.4]],
        'Camping':      [[M.CLOTH, 0.6], [M.WOOD, 0.4], [M.STEEL, 0.2]],

        // --- Art / decoration ---
        'Art':          [[M.CLOTH, 0.4], [M.WOOD, 0.3]],
        'Paintings':    [[M.CLOTH, 0.4], [M.WOOD, 0.3]],
        'Decorations':  [[M.WOOD, 0.4], [M.GLASS, 0.3]],
        'Graffiti':     [[M.ACID, 0.15]],
        'Signs':        [[M.WOOD, 0.5], [M.STEEL, 0.3]],
        'Ads':          [[M.PLASTIC, 0.4], [M.GLASS, 0.3]],
        'Vases':        [[M.GLASS, 0.6]],
        'Candles':      [[M.OIL, 0.3], [M.CLOTH, 0.1]],
        'Fun':          [[M.PLASTIC, 0.5], [M.CLOTH, 0.4]],
        'Music':        [[M.WOOD, 0.6], [M.STEEL, 0.3]],
        'Sport':        [[M.LEATHER, 0.4], [M.PLASTIC, 0.4], [M.STEEL, 0.2]],

        // --- Tech / electronics: microchips, circuits, ingots ---
        'Tech':         [[M.MICROCHIP, 0.6], [M.CIRCUIT, 0.5], [M.STEEL, 0.6], [M.PLASTIC, 0.5], [M.BATTERY, 0.3]],
        'Gears':        [[M.STEEL, 1.0], [M.TITANIUM, 0.5]],
        'Pipes':        [[M.STEEL, 0.8], [M.PLASTIC, 0.3]],
        'Mailboxes':    [[M.STEEL, 0.6], [M.PLASTIC, 0.3]],
        'Cages':        [[M.STEEL, 1.0]],
        'Trash':        [[M.STEEL, 0.4], [M.PLASTIC, 0.4]],
        'Bathroom':     [[M.GLASS, 0.5], [M.STEEL, 0.5], [M.PLASTIC, 0.4]],
        'Cauldrons':    [[M.STEEL, 0.8]],

        // --- Magic / alchemy / occult ---
        'Magic':        [[M.ARCANE, 0.6], [M.ETHEREAL, 0.4], [M.CRYSTAL, 0.3]],
        'Alchemistry':  [[M.GLASS, 0.6], [M.ACID, 0.4], [M.HERB, 0.4]],
        'Tentacles':    [[M.MEAT, 0.6], [M.ACID, 0.3]],

        // --- Large structures: costly, many materials ---
        'Buildings':    [[M.STEEL, 1.0], [M.GLASS, 0.5], [M.WOOD, 0.5]],
        'City':         [[M.STEEL, 0.8], [M.GLASS, 0.4], [M.PLASTIC, 0.3]],
        'Tunnels':      [[M.STEEL, 0.5]],
        'Windows':      [[M.GLASS, 0.8], [M.WOOD, 0.4]],

        // --- Consumables / misc ---
        'Food':         [[M.MEAT, 0.4], [M.PLANT, 0.4]],
        'Weapons':      [[M.STEEL, 1.0], [M.WOOD, 0.4]],
        'Misc':         [[M.WOOD, 0.8]],

        // --- Vehicles: the most expensive builds, tens of materials each ---
        'Vehicles':          [[M.STEEL, 1.5], [M.TITANIUM, 0.6], [M.GLASS, 0.4], [M.PLASTIC, 0.6], [M.BATTERY, 0.4], [M.CIRCUIT, 0.3]],
        'VehiclesInterior':  [[M.LEATHER, 0.6], [M.PLASTIC, 0.5], [M.STEEL, 0.4], [M.CLOTH, 0.4]],

        // --- Additional asset-set folders ---
        'Balcony':        [[M.WOOD, 0.6], [M.STEEL, 0.4]],
        'Baskets':        [[M.PLANT, 0.4], [M.WOOD, 0.3]],
        'Bedroom':        [[M.WOOD, 0.8], [M.CLOTH, 0.6]],
        'Bins':           [[M.PLASTIC, 0.4], [M.STEEL, 0.3]],
        'Buckets':        [[M.STEEL, 0.4], [M.PLASTIC, 0.3]],
        'Cases':          [[M.GLASS, 0.5], [M.WOOD, 0.4]],
        'Chimneys':       [[M.STEEL, 0.6], [M.WOOD, 0.3]],
        'Clocks':         [[M.WOOD, 0.5], [M.STEEL, 0.3], [M.GLASS, 0.2]],
        'ClothingStore':  [[M.CLOTH, 0.6], [M.WOOD, 0.3], [M.STEEL, 0.2]],
        'Curtains':       [[M.CLOTH, 0.8]],
        'Electronics':    [[M.MICROCHIP, 0.5], [M.CIRCUIT, 0.5], [M.PLASTIC, 0.5], [M.STEEL, 0.4], [M.BATTERY, 0.3]],
        'Fantasy':        [[M.ARCANE, 0.5], [M.CRYSTAL, 0.3], [M.WOOD, 0.3]],
        'Farming':        [[M.WOOD, 0.6], [M.STEEL, 0.4], [M.PLANT, 0.3]],
        'Fountains':      [[M.STEEL, 0.6], [M.CRYSTAL, 0.2]],
        'GroceryStore':   [[M.STEEL, 0.5], [M.PLASTIC, 0.4], [M.WOOD, 0.3]],
        'Gym':            [[M.STEEL, 0.8], [M.LEATHER, 0.4], [M.PLASTIC, 0.3]],
        'Holes':          [[M.PLANT, 0.2]],
        'Hospital':       [[M.STEEL, 0.5], [M.PLASTIC, 0.5], [M.GLASS, 0.4], [M.CLOTH, 0.3]],
        'Jail':           [[M.STEEL, 1.0]],
        'Kitchen':        [[M.STEEL, 0.6], [M.WOOD, 0.5], [M.GLASS, 0.3], [M.PLASTIC, 0.3]],
        'Lights':         [[M.GLASS, 0.4], [M.STEEL, 0.3], [M.BATTERY, 0.2]],
        'LivingRoom':     [[M.WOOD, 0.6], [M.CLOTH, 0.8], [M.LEATHER, 0.3]],
        'Mannequins':     [[M.PLASTIC, 0.5], [M.CLOTH, 0.3]],
        'Mechanical':     [[M.STEEL, 1.0], [M.TITANIUM, 0.4], [M.CIRCUIT, 0.3]],
        'Mirrors':        [[M.GLASS, 0.8], [M.WOOD, 0.3]],
        'Outside':        [[M.WOOD, 0.5], [M.STEEL, 0.4]],
        'Peluches':       [[M.CLOTH, 0.8]],
        'Potions':        [[M.GLASS, 0.5], [M.HERB, 0.3]],
        'School':         [[M.WOOD, 0.8], [M.STEEL, 0.3]],
        'ShoppingCarts':  [[M.STEEL, 0.8], [M.PLASTIC, 0.3]],
        'Sports':         [[M.LEATHER, 0.4], [M.PLASTIC, 0.4], [M.STEEL, 0.2]],
        'Storage':        [[M.WOOD, 0.6], [M.STEEL, 0.4]],
        'Tilesets':       [[M.STEEL, 0.4], [M.WOOD, 0.3]],
        'Tombs':          [[M.STEEL, 0.4], [M.CRYSTAL, 0.2], [M.BONE, 0.2]],
        'TrafficCones':   [[M.PLASTIC, 0.5]],
        'Treasures':      [[M.STEEL, 0.6], [M.CRYSTAL, 0.4]],
        'TreeStumps':     [[M.WOOD, 1.0]],
        'Wells':          [[M.STEEL, 0.6], [M.WOOD, 0.3]]
    };
    // i18n-ignore-end

    const DEFAULT_RECIPE = [[M.WOOD, 0.8]];

    // Material cost is derived from the folder category and the footprint area.
    // The category picks WHICH materials the piece is made of and their per-tile
    // rate; the quantity scales with the number of tiles. An explicit
    // furniture.recipe (rare, hand-authored) still overrides the category rule.
    function getFurnitureCost(furniture) {
        const cost = {};
        if (!furniture) return cost;

        // Wall/Terrain/Feature synthetic "pieces" (see resolvePlaceable, in the
        // Tile Placement System section below) carry their cost pre-baked,
        // since it is not derived from a folder category.
        if (furniture.__specialCost) return Object.assign({}, furniture.__specialCost);
        // House-door synthetic pieces are gold-only (no material cost at all).
        if (furniture.__specialGoldPrice != null) return cost;

        // Hand-authored recipe wins when present.
        if (furniture.recipe && Object.keys(furniture.recipe).length > 0) {
            for (const [id, qty] of Object.entries(furniture.recipe)) {
                cost[normalizeMaterialId(id)] = Math.max(1, Math.round(qty));
            }
            return cost;
        }

        const area = furnitureArea(furniture);
        const recipe = CATEGORY_RECIPES[furniture.category] || DEFAULT_RECIPE;
        for (const [matId, perTile] of recipe) {
            cost[normalizeMaterialId(matId)] = Math.max(1, Math.round(area * perTile));
        }
        return cost;
    }

    function canAffordFurniture(furniture) {
        if (isFreeBuild()) return true;
        const cost = getFurnitureCost(furniture);
        for (const [id, qty] of Object.entries(cost)) {
            if (!$gameSystem.hasMaterial(id, qty)) return false;
        }
        return true;
    }

    function consumeFurnitureMaterials(furniture) {
        // Building the thing is the practice, whether or not it cost anything
        // (Carpentry, specialization 58).
        if (window.SpecializationXP) {
            window.SpecializationXP.awardCapped('Carpentry', 1);
        }
        if (isFreeBuild()) return;
        const cost = getFurnitureCost(furniture);
        for (const [id, qty] of Object.entries(cost)) {
            $gameSystem.removeMaterial(id, qty);
        }
    }

    // What a dismantle hands back, announced through the shared reward popup so
    // recovered materials read like every other "you got something" in the
    // game. Callers that strip a whole map pass their pooled totals in one go
    // rather than raising a popup per piece.
    function announceRefund(recovered) {
        if (!window.ParchmentToast) return;
        const entries = Object.entries(recovered || {})
            .map(([id, qty]) => ({ obj: materialItem(id), qty }))
            .filter(e => e.obj && e.qty > 0);
        if (!entries.length) return;
        window.ParchmentToast.reward({
            title: T('Furniture.materialsRecovered'),
            entries
        });
    }

    // Refund a fraction of the size-based cost when a placed piece is removed.
    // `pool` collects the refund instead of announcing it, for bulk removals.
    function refundFurnitureMaterials(furniture, pool) {
        if (isFreeBuild()) return;
        const cost = getFurnitureCost(furniture);
        const recovered = {};
        // Somebody who built it knows where the joints are, and takes it apart
        // without splitting everything they wanted to keep.
        const care = window.SpecializationXP
            ? window.SpecializationXP.multiplier('Carpentry', 0.08) : 1;
        for (const [id, qty] of Object.entries(cost)) {
            const refund = Math.floor(qty * Math.min(1, DISMANTLE_RETURN * care));
            if (refund <= 0) continue;
            $gameSystem.addMaterial(id, refund);
            recovered[id] = (recovered[id] || 0) + refund;
            if (pool) pool[id] = (pool[id] || 0) + refund;
        }
        if (!pool) announceRefund(recovered);
    }

    //=============================================================================
    // Purchase Mode (buy any piece with gold instead of materials)
    //=============================================================================
    // The build overlay has two modes:
    //   'construct' – the original flow: spend crafting materials, and only
    //                 pieces you can afford in materials are "Buildable".
    //   'purchase'  – place ANY piece by paying its gold price. The price is the
    //                 gold value of the materials the piece would consume (each
    //                 material's database price × quantity) plus a 25% markup.
    // The active mode lives on the Scene_Map build session (_fbBuildMode) so both
    // the DOM panel and the on-map placement code read the same source of truth.

    const PURCHASE_MARKUP = 1.25;

    // Gold price of a piece: sum of (material database price × quantity) across
    // its size-based recipe, plus the purchase markup. Always at least 1.
    function getFurniturePrice(furniture) {
        if (furniture && furniture.__specialGoldPrice != null) return furniture.__specialGoldPrice;
        const cost = getFurnitureCost(furniture);
        let total = 0;
        for (const [id, qty] of Object.entries(cost)) {
            const item = materialItem(id);
            const unit = (item && item.price) ? item.price : 0;
            total += unit * qty;
        }
        return Math.max(1, Math.round(total * PURCHASE_MARKUP));
    }

    function canPurchaseFurniture(furniture) {
        if (isFreeBuild()) return true;
        if (!furniture) return false;
        return (typeof $gameParty !== 'undefined' && $gameParty) &&
            $gameParty.gold() >= getFurniturePrice(furniture);
    }

    // The current build mode, read from the active Scene_Map build session.
    function currentBuildMode() {
        const s = SceneManager._scene;
        return (s && s._fbBuildMode === 'construct') ? 'construct' : 'purchase';
    }

    // Mode-aware affordability used by every UI/placement path: gold in purchase
    // mode, materials in construct mode.
    function canObtainFurniture(furniture) {
        if (!furniture) return false;
        if (furniture.__placeKind === 'animal') return canPurchaseFurniture(furniture);
        return currentBuildMode() === 'purchase'
            ? canPurchaseFurniture(furniture)
            : canAffordFurniture(furniture);
    }

    // Mode-aware payment when a piece is placed.
    function payForFurniture(furniture) {
        if (isFreeBuild()) return;
        if (currentBuildMode() === 'purchase') {
            if (typeof $gameParty !== 'undefined' && $gameParty) {
                $gameParty.loseGold(getFurniturePrice(furniture));
            }
        } else {
            consumeFurnitureMaterials(furniture);
        }
    }

    // Refused placement: the piece costs more than the party has. Says which
    // currency ran out, since the two modes spend different ones. Keyed so a
    // held paint stroke raises one toast, not one per tile.
    function warnCannotAfford(furniture) {
        SoundManager.playBuzzer();
        if (!window.ParchmentToast) return;
        const purchasing = currentBuildMode() === 'purchase' ||
            (furniture && furniture.__placeKind === 'animal');
        const text = purchasing
            ? T('Furniture.cannotAfford.gold').replace('%1', formatEuros(getFurniturePrice(furniture)))
            : T('Furniture.cannotAfford.materials');
        window.ParchmentToast.show(text, {
            severity: 'warning',
            duration: 180,
            key: 'furniture-cannot-afford'
        });
    }

    // Every price in the build panel is shown in euros: the party's gold is
    // stored in cents, so 12345 gold reads as 123.45€ (see MoneyFormatter.js).
    function formatEuros(gold) {
        return (Math.round(Number(gold) || 0) / 100).toFixed(2) + '€';
    }

    //=============================================================================
    // Furniture Database
    //=============================================================================



    //=============================================================================
    // Game System Extensions
    //=============================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize.call(this);
        this.initFurnitureSystem();
    };

    Game_System.prototype.initFurnitureSystem = function () {
        this._furnitureData = {
            maps: {},           // Furniture placed on each map
            inventory: {},      // Furniture in player's inventory
            materials: {},      // Crafting materials
            unlockedRecipes: [ // Start with basic recipes unlocked
                "wooden_chair",
                "wooden_table",
                "simple_bed",
                "wooden_chest",
                "wooden_torch",
                "plant_pot",
                "crafting_bench"
            ],
            // What has actually been BUILT (the pieces standing on each world
            // coordinate, the raw wall/terrain/feature/door tiles, and the two
            // id counters behind them) is not here: it belongs to the world,
            // not to this playthrough, and lives in the world folder through
            // builtFurniture() / builtTiles() below. A savegame that still
            // carries them in this blob hands them over in getFurnitureData().
        };
    };

    // Which colourway each recolour family last showed in the build menu.
    // Lives on the save rather than in the world folder: it is a menu preference
    // of this playthrough, not something standing on the map.
    Game_System.prototype.furnitureVariants = function () {
        if (!this._furnitureVariants) this._furnitureVariants = {};
        return this._furnitureVariants;
    };

    Game_System.prototype.setFurnitureVariant = function (groupId, furnitureId) {
        if (!groupId || !furnitureId) return;
        this.furnitureVariants()[groupId] = furnitureId;
    };

    Game_System.prototype.getFurnitureData = function () {
        if (!this._furnitureData) {
            this.initFurnitureSystem();
        }
        // Everything below this point is one-time migration of an older save.
        // It used to be re-checked on EVERY call - four Object.keys() and an
        // Object.entries() allocated each time - and this function sits at the
        // bottom of the passability path, which the NPC pathfinder asks
        // thousands of times inside one frame. Once there is nothing left to
        // carry over, it is never looked at again.
        if (this._furnitureMigrated === true) return this._furnitureData;
        // One-time migration: older saves stored crafting materials in this
        // private object. Now they are real party items, so move any leftover
        // stock into the inventory and clear the legacy store.
        const data = this._furnitureData;
        if (data.materials && Object.keys(data.materials).length > 0 &&
            typeof $gameParty !== 'undefined' && $gameParty &&
            typeof $dataItems !== 'undefined' && $dataItems) {
            for (const [id, qty] of Object.entries(data.materials)) {
                const item = $dataItems[normalizeMaterialId(id)];
                if (item && qty > 0) $gameParty.gainItem(item, qty);
            }
            data.materials = {};
        }
        // One-time migration: what the party BUILT belongs to the world, not to
        // the savegame that built it. A wall raised on a world square stands
        // there for every playthrough of the world, exactly as the terrain the
        // party dismantled around it already did (terrain.json). Anything still
        // holding its placements in this private blob hands them over here.
        if (data.maps && Object.keys(data.maps).length > 0) {
            mergeIntoWorld(this.builtFurniture(), data.maps);
            delete data.maps;
        }
        if (data.tiles && Object.keys(data.tiles).length > 0) {
            mergeIntoWorld(this.builtTiles(), data.tiles);
            delete data.tiles;
        }
        if (data.placedFurnitureId !== undefined) {
            this._furnitureBuiltId = data.placedFurnitureId;
            delete data.placedFurnitureId;
        }
        if (data.placedTileId !== undefined) {
            this._furnitureBuiltTileId = data.placedTileId;
            delete data.placedTileId;
        }
        // Only call it done when nothing is left that a later call could still
        // carry over: the materials hand-off needs $gameParty and $dataItems,
        // and neither is necessarily up the first time this is asked.
        this._furnitureMigrated =
            !(data.materials && Object.keys(data.materials).length > 0) &&
            !(data.maps && Object.keys(data.maps).length > 0) &&
            !(data.tiles && Object.keys(data.tiles).length > 0) &&
            data.placedFurnitureId === undefined &&
            data.placedTileId === undefined;
        return this._furnitureData;
    };

    // Folds a legacy per-savegame placement table into the world's own, keyed
    // by map, unioned by each piece's id, so nothing another savegame of this
    // world already built is knocked down by an older copy of the table.
    function mergeIntoWorld(worldTable, legacyTable) {
        for (const mapKey of Object.keys(legacyTable)) {
            const legacy = legacyTable[mapKey] || [];
            const held = worldTable[mapKey] || (worldTable[mapKey] = []);
            const seen = new Set(held.map(rec => rec && rec.id));
            for (const rec of legacy) {
                if (!rec || seen.has(rec.id)) continue;
                seen.add(rec.id);
                held.push(rec);
            }
        }
    }

    // What the party has built, per world coordinate (furnitureMapKey), held in
    // the world folder rather than the binary savegame (WorldManager, the
    // "furniture" file). The pieces standing on a square, the raw tiles written
    // into the map, and the two id counters behind them, which are shared so no
    // two savegames of the world ever hand one number to two pieces.
    Game_System.prototype.builtFurniture = function () {
        if (!this._furnitureBuilt) this._furnitureBuilt = {};
        return this._furnitureBuilt;
    };

    Game_System.prototype.builtTiles = function () {
        if (!this._furnitureBuiltTiles) this._furnitureBuiltTiles = {};
        return this._furnitureBuiltTiles;
    };

    Game_System.prototype.addFurniture = function (furnitureId, quantity = 1) {
        const data = this.getFurnitureData();
        if (!data.inventory[furnitureId]) {
            data.inventory[furnitureId] = 0;
        }
        data.inventory[furnitureId] += quantity;
    };

    Game_System.prototype.removeFurniture = function (furnitureId, quantity = 1) {
        const data = this.getFurnitureData();
        if (data.inventory[furnitureId]) {
            data.inventory[furnitureId] -= quantity;
            if (data.inventory[furnitureId] <= 0) {
                delete data.inventory[furnitureId];
            }
        }
    };

    Game_System.prototype.hasFurniture = function (furnitureId, quantity = 1) {
        const data = this.getFurnitureData();
        return data.inventory[furnitureId] && data.inventory[furnitureId] >= quantity;
    };

    Game_System.prototype.addMaterial = function (materialId, quantity = 1) {
        const item = materialItem(materialId);
        if (item && typeof $gameParty !== 'undefined' && $gameParty) {
            $gameParty.gainItem(item, quantity);
        }
    };

    Game_System.prototype.removeMaterial = function (materialId, quantity = 1) {
        const item = materialItem(materialId);
        if (item && typeof $gameParty !== 'undefined' && $gameParty) {
            $gameParty.loseItem(item, quantity);
        }
    };

    Game_System.prototype.hasMaterial = function (materialId, quantity = 1) {
        return getMaterialCount(materialId) >= quantity;
    };

    Game_System.prototype.canCraftFurniture = function (furnitureId) {
        const furniture = Furniture[furnitureId];
        if (!furniture) return false;

        // Sandbox mode cheat
        if ($gameSystem && $gameSystem._isSandboxMode) {
            return true;
        }

        // Use the same size-based cost as the on-map build flow.
        const cost = getFurnitureCost(furniture);
        for (const [materialId, quantity] of Object.entries(cost)) {
            if (!this.hasMaterial(materialId, quantity)) {
                return false;
            }
        }
        return true;
    };

    Game_System.prototype.craftFurniture = function (furnitureId) {
        const furniture = Furniture[furnitureId];
        if (!this.canCraftFurniture(furnitureId)) return false;

        // Remove materials (skip if sandbox mode is active)
        if (!($gameSystem && $gameSystem._isSandboxMode)) {
            const cost = getFurnitureCost(furniture);
            for (const [materialId, quantity] of Object.entries(cost)) {
                this.removeMaterial(materialId, quantity);
            }
        }

        // Add furniture
        this.addFurniture(furnitureId, 1);
        return true;
    };

    Game_System.prototype.dismantleFurniture = function (furnitureId) {
        if (!this.hasFurniture(furnitureId)) return false;

        const furniture = Furniture[furnitureId];
        if (!furniture) return false;

        // Remove furniture
        this.removeFurniture(furnitureId, 1);

        // Refund a fraction of the same size-based cost that was charged.
        const cost = getFurnitureCost(furniture);
        for (const [materialId, quantity] of Object.entries(cost)) {
            const returnQuantity = Math.floor(quantity * DISMANTLE_RETURN);
            if (returnQuantity > 0) {
                this.addMaterial(materialId, returnQuantity);
            }
        }

        return true;
    };

    Game_System.prototype.unlockRecipe = function (furnitureId) {
        const data = this.getFurnitureData();
        if (!Array.isArray(data.unlockedRecipes)) data.unlockedRecipes = [];
        if (!data.unlockedRecipes.includes(furnitureId)) {
            data.unlockedRecipes.push(furnitureId);
        }
    };

    Game_System.prototype.isRecipeUnlocked = function (furnitureId) {
        const data = this.getFurnitureData();
        return Array.isArray(data.unlockedRecipes) &&
            data.unlockedRecipes.includes(furnitureId);
    };

    Game_System.prototype.placeFurniture = function (mapId, furnitureId, x, y, flipped = false) {
        this.getFurnitureData();
        const maps = this.builtFurniture();
        if (!maps[mapId]) {
            maps[mapId] = [];
        }

        const placedId = this._furnitureBuiltId || 0;
        this._furnitureBuiltId = placedId + 1;
        const placedFurniture = {
            id: placedId,
            furnitureId: furnitureId,
            x: x,
            y: y,
            flipped: flipped
        };

        maps[mapId].push(placedFurniture);
        invalidateFurnitureMemo();
        return placedFurniture;
    };

    Game_System.prototype.removePlacedFurniture = function (mapId, placedId) {
        this.getFurnitureData();
        const maps = this.builtFurniture();
        if (!maps[mapId]) return null;

        const index = maps[mapId].findIndex(f => f.id === placedId);
        if (index >= 0) {
            const furniture = maps[mapId][index];
            maps[mapId].splice(index, 1);
            invalidateFurnitureMemo();
            return furniture;
        }
        return null;
    };

    Game_System.prototype.getMapFurniture = function (mapId) {
        this.getFurnitureData();
        return this.builtFurniture()[mapId] || [];
    };

    // ── Raw tile placements (walls / terrain / features / house doors) ─────────
    // Distinct from furniture: these are not sprites, they are real tile ids
    // written into the map's own data array (see the Tile Placement System
    // section below), so they render/collide using the tileset's own flags.
    Game_System.prototype.getMapTiles = function (mapId) {
        this.getFurnitureData();
        return this.builtTiles()[mapId] || [];
    };

    Game_System.prototype.placeMapTile = function (mapId, record) {
        this.getFurnitureData();
        const tiles = this.builtTiles();
        if (!tiles[mapId]) tiles[mapId] = [];
        const placedId = this._furnitureBuiltTileId || 0;
        this._furnitureBuiltTileId = placedId + 1;
        const placed = Object.assign({ id: placedId }, record);
        tiles[mapId].push(placed);
        return placed;
    };

    Game_System.prototype.removePlacedTile = function (mapId, placedId) {
        this.getFurnitureData();
        const tiles = this.builtTiles();
        if (!tiles[mapId]) return null;
        const index = tiles[mapId].findIndex(t => t.id === placedId);
        if (index < 0) return null;
        const rec = tiles[mapId][index];
        tiles[mapId].splice(index, 1);
        return rec;
    };

    //=============================================================================
    // Procedural Furniture Generation (House Integration)
    //=============================================================================

    // Seeded random functions matching TreasureRoomSystem
    function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    function getSeededRandomFromArray(array, seed) {
        if (array.length === 0) return null;
        const index = Math.floor(seededRandom(seed) * array.length);
        return array[index];
    }

    function getSeededRandomInt(min, max, seed) {
        return Math.floor(seededRandom(seed) * (max - min + 1)) + min;
    }

    // Get list of valid furniture for a category
    function getFurnitureByCategory(category) {
        return Object.entries(Furniture)
            .filter(([id, data]) => data.category === category)
            .map(([id]) => id);
    }

    // Check if a tile is passable (A1, A2, A5)
    function isTilePassable(x, y) {
        if (!$gameMap.isValid(x, y)) return false;
        // Check collision - passable tiles should allow walking
        return $gameMap.isPassable(x, y, 2); // 2 = down direction
    }

    // Check if tile is a wall (A3, A4) by checking collision
    function isTileWall(x, y) {
        if (!$gameMap.isValid(x, y)) return false;
        // Walls block movement in all directions
        return !$gameMap.isPassable(x, y, 2) &&
            !$gameMap.isPassable(x, y, 4) &&
            !$gameMap.isPassable(x, y, 6) &&
            !$gameMap.isPassable(x, y, 8);
    }

    // A tile that reads as a wall for building purposes: the wall terrain tag,
    // region ID 4 (hand-marked wall strips), or a fully impassable tile.
    function isWallLikeTile(x, y) {
        if (!$gameMap || !$gameMap.isValid(x, y)) return false;
        if ($gameMap.terrainTag(x, y) === 4) return true;
        if ($gameMap.regionId(x, y) === 4) return true;
        if (isTileWall(x, y)) return true;
        // A wall the party built itself counts too, whatever the tileset flags
        // of the autotile it painted say.
        const rec = findPlacedTileRecordAt(x, y);
        return !!(rec && rec.kind === 'wall');
    }

    // Find valid furniture placement positions
    // Furniture should be placed south of walls (on passable tiles north of walls)
    // or north of walls (on passable tiles south of walls)
    function findValidFurnitureTiles() {
        const validPositions = [];

        for (let y = 0; y < $gameMap.height(); y++) {
            for (let x = 0; x < $gameMap.width(); x++) {
                if (!isTilePassable(x, y)) continue;

                // Check if adjacent to a wall
                const north = isTileWall(x, y - 1);
                const south = isTileWall(x, y + 1);
                const east = isTileWall(x + 1, y);
                const west = isTileWall(x - 1, y);

                if (north || south || east || west) {
                    validPositions.push({ x, y });
                }
            }
        }

        return validPositions;
    }

    // Check if furniture can be placed at position (folder + category rules)
    function canPlaceFurnitureAt(x, y, furnitureData, furnitureId) {
        const furnitureList = $gameSystem.getMapFurniture(furnitureMapKey());
        const cat = furnitureData.category;
        const rules = getFolderRules(furnitureId);
        const isWallPiece = cat === CAT_ADS || (rules.wall && cat !== CAT_DECORATIONS && cat !== CAT_CARPETS);
        const collision = getEffectiveCollision(furnitureId, furnitureData);
        const height = furnitureData.height || 1;

        // Validate every tile in the footprint
        for (let fx = 0; fx < furnitureData.width; fx++) {
            for (let fy = 0; fy < furnitureData.height; fy++) {
                const checkX = x + fx;
                const checkY = y + fy;

                // Bounds check
                if (!$gameMap.isValid(checkX, checkY)) return false;

                const terrainTag = $gameMap.terrainTag(checkX, checkY);
                // Anything may be placed over a plain passable tile: a walkable
                // tile never fails a terrain rule, whatever the category.
                const tilePassable = $gameMap.isPassable(checkX, checkY, 2);

                // Terrain tag 7 blocks furniture placement, unless walkable
                if (terrainTag === 7 && !tilePassable) return false;

                // Does THIS tile become impassable once placed? Only blocking
                // tiles are restricted to real floor; passable upper tiles may
                // freely overlap walls.
                let tileBlocks = false;
                switch (collision) {
                    case 'all':    tileBlocks = true; break;
                    case 'lower':  tileBlocks = (fy === height - 1); break;
                    case 'lower2': tileBlocks = (fy >= height - 2); break;
                }

                if (cat === CAT_DECORATIONS || tilePassable) {
                    // Decorations go anywhere, and a passable tile accepts any
                    // piece: carpets, wall decor and solids alike.
                } else if (cat === CAT_CARPETS) {
                    // Floor decor on a non-walkable tile is never allowed.
                    return false;
                } else if (isWallPiece) {
                    // Wall decor on a non-walkable tile must sit on a wall.
                    if (!isWallLikeTile(checkX, checkY)) return false;
                } else if (tileBlocks) {
                    // Blocking (lower) tiles need real floor.
                    return false;
                }
            }
        }

        // Check collision with other placed furniture. Decorations ignore this
        // (they may overlap anything), and existing decorations never block.
        if (cat !== CAT_DECORATIONS) {
            for (const placed of furnitureList) {
                const otherFurniture = Furniture[placed.furnitureId];
                if (!otherFurniture) continue;
                if (otherFurniture.category === CAT_DECORATIONS) continue;

                if (x < placed.x + otherFurniture.width &&
                    x + furnitureData.width > placed.x &&
                    y < placed.y + otherFurniture.height &&
                    y + furnitureData.height > placed.y) {
                    return false;
                }
            }
        }

        return true;
    }

    // Generate and place procedural furniture in current map based on seed
    Game_System.prototype.generateProceduralFurniture = function (seed) {
        const mapId = $gameMap.mapId();
        const validTiles = findValidFurnitureTiles();

        if (validTiles.length === 0) return;

        // Determine how many furniture pieces to place (1-4 based on seed)
        const furnitureCount = getSeededRandomInt(1, Math.min(4, validTiles.length), seed);

        const categories = ['seating', 'decoration', 'storage', 'lighting'];
        let placementAttempts = 0;
        const maxAttempts = 50;

        for (let i = 0; i < furnitureCount && placementAttempts < maxAttempts; i++) {
            // Get random category
            const category = getSeededRandomFromArray(categories, seed + i * 1000);
            const furnitureList = getFurnitureByCategory(category);

            if (furnitureList.length === 0) {
                i--;
                continue;
            }

            // Get random furniture from category
            const furnitureId = getSeededRandomFromArray(furnitureList, seed + i * 2000);
            const furnitureData = Furniture[furnitureId];

            if (!furnitureData) {
                i--;
                continue;
            }

            // Get random position from valid tiles
            const tileIndex = getSeededRandomInt(0, validTiles.length - 1, seed + i * 3000);
            const tile = validTiles[tileIndex];

            // Try to place furniture
            if (canPlaceFurnitureAt(tile.x, tile.y, furnitureData, furnitureId)) {
                const flipped = furnitureData.rotatable ? (getSeededRandomInt(0, 1, seed + i * 4000) === 1) : false;
                const placedData = this.placeFurniture(mapId, furnitureId, tile.x, tile.y, flipped);

                // Add sprite to spriteset if map is loaded
                if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
                    SceneManager._scene._spriteset.addFurnitureSprite(placedData);
                }
            }

            placementAttempts++;
        }
    };

    // Generate house-appropriate furniture with specific requirements
    Game_System.prototype.generateHouseFurniture = function (seed) {
        const mapId = $gameMap.mapId();
        const validTiles = findValidFurnitureTiles();

        if (validTiles.length === 0) return;

        let tileIndex = 0;
        let placementAttempts = 0;
        const maxAttempts = 200;

        // Helper function to place furniture by category with specific count
        const placeFurnitureByCategory = (category, count, seedOffset) => {
            let placed = 0;
            const furnitureList = getFurnitureByCategory(category);

            if (furnitureList.length === 0) return placed;

            for (let i = 0; i < count && placementAttempts < maxAttempts; i++) {
                // Get random furniture from category
                const furnitureId = getSeededRandomFromArray(furnitureList, seed + seedOffset + i * 2000);
                const furnitureData = Furniture[furnitureId];

                if (!furnitureData) continue;

                // Find valid position
                for (let attempts = 0; attempts < 10 && placementAttempts < maxAttempts; attempts++) {
                    tileIndex = (tileIndex + 1) % validTiles.length;
                    const tile = validTiles[tileIndex];

                    // Try to place furniture
                    if (canPlaceFurnitureAt(tile.x, tile.y, furnitureData, furnitureId)) {
                        const flipped = furnitureData.rotatable ? (getSeededRandomInt(0, 1, seed + seedOffset + i * 4000) === 1) : false;
                        const placedData = this.placeFurniture(mapId, furnitureId, tile.x, tile.y, flipped);

                        // Add sprite to spriteset if map is loaded
                        if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
                            SceneManager._scene._spriteset.addFurnitureSprite(placedData);
                        }

                        placed++;
                        break;
                    }

                    placementAttempts++;
                }
            }

            return placed;
        };

        // Place furniture in required order with specific counts
        // 1. At least 1 seating
        placeFurnitureByCategory.call(this, 'seating', getSeededRandomInt(1, 2, seed), 1000);

        // 2. 1 table
        placeFurnitureByCategory.call(this, 'tables', 1, 2000);

        // 3. At least 2 storage
        placeFurnitureByCategory.call(this, 'storage', getSeededRandomInt(2, 3, seed + 100), 3000);

        // 4. 1 or 2 beds
        placeFurnitureByCategory.call(this, 'beds', getSeededRandomInt(1, 2, seed + 200), 4000);

        // 5. 1-3 decoration
        placeFurnitureByCategory.call(this, 'decoration', getSeededRandomInt(1, 3, seed + 300), 5000);

        // 6. 4 appliances
        placeFurnitureByCategory.call(this, 'appliances', 4, 6000);

        // 7. 1 entertainment
        placeFurnitureByCategory.call(this, 'entertainment', 1, 7000);
    };

    // Every open (non-wall, non-blocked) floor tile - carpets and free-standing
    // decorations want the middle of the room, not just tiles hugging a wall.
    function findOpenFloorTiles() {
        const tiles = [];
        for (let y = 0; y < $gameMap.height(); y++) {
            for (let x = 0; x < $gameMap.width(); x++) {
                if (!isTilePassable(x, y)) continue;
                const tag = $gameMap.terrainTag(x, y);
                if (tag === 4 || tag === 7) continue; // wall / no-furniture tiles
                tiles.push({ x, y });
            }
        }
        return tiles;
    }

    // Light procedural dressing for procedural houses: only Carpets (flat floor
    // rugs) and Decorations (free-standing props). Runs once per map key so
    // re-entering the same house template never stacks duplicate pieces. State
    // lives on $gameSystem so it persists with saves and resets on a new game.
    Game_System.prototype.generateHouseDecor = function (seed) {
        const mapKey = furnitureMapKey();
        if (!this._houseDecorMaps) this._houseDecorMaps = {};
        if (this._houseDecorMaps[mapKey]) return;
        this._houseDecorMaps[mapKey] = true;

        const tiles = findOpenFloorTiles();
        if (tiles.length === 0) return;

        const s = (Number(seed) || 0) >>> 0;

        // Places up to `count` pieces of one category onto random open tiles,
        // retrying a handful of positions per piece so a blocked tile does not
        // waste the whole slot.
        const placeCategory = (category, count, seedOffset) => {
            const list = getFurnitureByCategory(category);
            if (list.length === 0) return;
            for (let i = 0; i < count; i++) {
                const fId = getSeededRandomFromArray(list, s + seedOffset + i * 131);
                const fData = Furniture[fId];
                if (!fData) continue;
                for (let a = 0; a < 15; a++) {
                    const t = tiles[getSeededRandomInt(0, tiles.length - 1, s + seedOffset + i * 977 + a * 53)];
                    if (canPlaceFurnitureAt(t.x, t.y, fData, fId)) {
                        const placed = this.placeFurniture(mapKey, fId, t.x, t.y, false);
                        if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
                            SceneManager._scene._spriteset.addFurnitureSprite(placed);
                        }
                        break;
                    }
                }
            }
        };

        placeCategory.call(this, CAT_CARPETS, getSeededRandomInt(1, 2, s + 11), 1000);
        placeCategory.call(this, CAT_DECORATIONS, getSeededRandomInt(2, 4, s + 29), 5000);
    };

    //=============================================================================
    // Sprite_Furniture
    //=============================================================================

    class Sprite_Furniture extends Sprite {
        constructor(furnitureData, placedData) {
            super();
            this._furnitureData = furnitureData;
            this._placedData = placedData;
            this.initMembers();
            this.loadBitmap();
            this.updatePosition();
        }

        initMembers() {
            this._flipped = this._placedData.flipped || false;
            this.anchor.x = 0;
            this.anchor.y = 1; // Anchor at bottom for proper layering
        }

        loadBitmap() {
            const width = this._furnitureData.width * TILE_SIZE;
            const height = this._furnitureData.height * TILE_SIZE;

            // Pieces with no indexed image get the coloured placeholder outright,
            // so we never request a missing file.
            const folder = furnitureImageFolder(this._placedData.furnitureId);
            if (!folder) {
                this.bitmap = new Bitmap(width, height);
                this.createColoredBitmap(width, height);
                return;
            }

            try {
                this.bitmap = ImageManager.loadBitmap(folder, this._placedData.furnitureId);

                // Store reference to check loading later
                this._loadingImage = true;
                this._imageLoadTimeout = 0;
            } catch (error) {
                console.warn(`Failed to load furniture image: ${this._placedData.furnitureId}`, error);
                this.bitmap = new Bitmap(width, height);
                this.createColoredBitmap(width, height);
            }
        }

        update() {
            super.update();

            // Update position every frame to stay anchored to map as camera moves
            this.updatePosition();

            // Check if image finished loading
            if (this._loadingImage && this.bitmap) {
                this._imageLoadTimeout++;

                // Wait up to 60 frames for image to load
                if (this._imageLoadTimeout > 60 || !this.bitmap._url || this.bitmap.isReady()) {
                    this._loadingImage = false;

                    // If bitmap failed to load properly, use colored fallback
                    if (!this.bitmap.isReady() || this.bitmap.width === 0 || this.bitmap.height === 0) {
                        const width = this._furnitureData.width * TILE_SIZE;
                        const height = this._furnitureData.height * TILE_SIZE;
                        this.bitmap = new Bitmap(width, height);
                        this.createColoredBitmap(width, height);
                    }
                }
            }
        }

        createColoredBitmap(width, height) {
            // Draw placeholder furniture based on category
            const colors = {
                'seating': '#8B4513',    // Brown
                'tables': '#654321',     // Dark Brown
                'storage': '#696969',    // Gray
                'beds': '#4B0082',       // Indigo
                'lighting': '#FFD700',   // Gold
                'workstations': '#2F4F4F', // Dark Slate Gray
                'decoration': '#FF69B4', // Hot Pink
                'appliances': '#708090'  // Slate Gray
            };

            const color = colors[this._furnitureData.category] || '#808080';
            this.bitmap.fillRect(0, 0, width, height, color);

            // Draw border
            this.bitmap.strokeRect(0, 0, width, height, '#000000', 2);

            // Draw name
            this.bitmap.fontSize = 12;
            this.bitmap.textColor = '#FFFFFF';
            this.bitmap.drawText(
                this._furnitureData.name,
                4, 4, width - 8, 20,
                'center'
            );
        }

        updatePosition() {
            // Anchor furniture to map by accounting for camera scroll
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();

            this.x = (this._placedData.x - $gameMap.displayX()) * tileWidth;
            this.y = (this._placedData.y + this._furnitureData.height - $gameMap.displayY()) * tileHeight;

            // Apply vertical flip if rotatable and flipped
            if (this._furnitureData.rotatable && this._flipped) {
                this.scale.x = -1;
                // Adjust x position to account for flip
                this.x += this._furnitureData.width * tileWidth;
            } else {
                this.scale.x = 1;
            }

            // Update z-index based on effective layer (tall solids draw above)
            const _layer = getEffectiveLayer(this._placedData.furnitureId, this._furnitureData);
            if (_layer === 'below') {
                this.z = 1;
            } else if (_layer === 'above') {
                this.z = 5;
            } else {
                this.z = 3;
            }
        }

        isInteractive() {
            return this._furnitureData.interactive;
        }

        getFurnitureData() {
            return this._furnitureData;
        }

        getPlacedData() {
            return this._placedData;
        }

        setFlipped(flipped) {
            this._flipped = flipped;
            this._placedData.flipped = flipped;
            this.updatePosition();
        }
    }

    //=============================================================================
    // Spriteset_Map Extensions
    //=============================================================================

    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function () {
        _Spriteset_Map_createLowerLayer.call(this);
        this.createFurnitureSprites();
    };

    Spriteset_Map.prototype.createFurnitureSprites = function () {
        this._furnitureSprites = [];
        const furnitureList = $gameSystem.getMapFurniture(furnitureMapKey());

        furnitureList.forEach(placedData => {
            const furnitureData = Furniture[placedData.furnitureId];
            if (furnitureData) {
                const sprite = new Sprite_Furniture(furnitureData, placedData);
                this._furnitureSprites.push(sprite);
                this._tilemap.addChild(sprite);
            }
        });
    };

    Spriteset_Map.prototype.addFurnitureSprite = function (placedData) {
        const furnitureData = Furniture[placedData.furnitureId];
        if (furnitureData) {
            const sprite = new Sprite_Furniture(furnitureData, placedData);
            this._furnitureSprites.push(sprite);
            this._tilemap.addChild(sprite);
            return sprite;
        }
        return null;
    };

    Spriteset_Map.prototype.removeFurnitureSprite = function (placedId) {
        const index = this._furnitureSprites.findIndex(
            sprite => sprite.getPlacedData().id === placedId
        );

        if (index >= 0) {
            const sprite = this._furnitureSprites[index];
            this._tilemap.removeChild(sprite);
            this._furnitureSprites.splice(index, 1);
        }
    };

    //=============================================================================
    // Game_Map Furniture Passability & Ladder Hooks
    //=============================================================================

    // The furniture standing on the map right now, resolved at most once a
    // frame.
    //
    // Both passability helpers below used to call furnitureMapKey() and then
    // getMapFurniture() on EVERY query. On the procedural map that key is a
    // template string built from the biome, the world coordinate, the layer
    // depth and the dungeon salt, so each query allocated one - and a query is
    // not rare: Game_CharacterBase.isMapPassable asks twice per canPass, and
    // the NPC pathfinder asks canPass up to two thousand times inside a single
    // findPath. That was thousands of throwaway strings per pathfind.
    //
    // Neither answer can change inside one frame - a map transfer and a
    // generation both happen between frames - so both are resolved once per
    // frame. The list is the world store's own array, not a copy, so furniture
    // placed or removed during the frame is seen through it; only a map whose
    // list did not exist yet needs the explicit invalidation below.
    let _furnFrame = -1;
    let _furnList = null;
    function furnitureOnThisMap() {
        const frame = (typeof Graphics !== "undefined" && Graphics)
            ? Graphics.frameCount : -1;
        if (frame !== _furnFrame || frame < 0) {
            _furnFrame = frame;
            _furnList = $gameSystem.getMapFurniture(furnitureMapKey());
        }
        return _furnList;
    }

    // Placing the first piece on a map replaces the empty list the memo is
    // holding, so the memo is dropped whenever a placement happens.
    function invalidateFurnitureMemo() {
        _furnFrame = -1;
        _furnList = null;
    }

    // A map being set up is the authoritative "everything the key is built from
    // has changed" signal: it is what a transfer runs, and what the procedural
    // generator runs after writing the new square's biome and coordinate. One
    // frame can hold more than one of these while a stitched window is built,
    // so the frame counter alone is not enough to keep the memo honest.
    const _Game_Map_setup_furnitureMemo = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        invalidateFurnitureMemo();
        _Game_Map_setup_furnitureMemo.call(this, mapId);
    };

    function isTileBlockedByFurniture(x, y) {
        if (!$gameSystem) return false;
        const furnitureList = furnitureOnThisMap();
        if (furnitureList.length === 0) return false;
        for (const placed of furnitureList) {
            const fData = Furniture[placed.furnitureId];
            if (!fData) continue;
            if (x < placed.x || x >= placed.x + fData.width) continue;
            if (y < placed.y || y >= placed.y + fData.height) continue;
            const collision = getEffectiveCollision(placed.furnitureId, fData);
            const localY = y - placed.y;
            switch (collision) {
                case 'all':   return true;
                case 'lower': if (localY === fData.height - 1) return true; break;
                case 'lower2': if (localY >= fData.height - 2) return true; break;
            }
        }
        return false;
    }

    function isTileLadderByFurniture(x, y) {
        if (!$gameSystem) return false;
        const furnitureList = furnitureOnThisMap();
        if (furnitureList.length === 0) return false;
        for (const placed of furnitureList) {
            const fData = Furniture[placed.furnitureId];
            if (!fData) continue;
            if (x < placed.x || x >= placed.x + fData.width) continue;
            if (y < placed.y || y >= placed.y + fData.height) continue;
            const rules = getFolderRules(placed.furnitureId);
            if (rules.ladder) return true;
        }
        return false;
    }

    const _Game_Map_isPassable_furniture = Game_Map.prototype.isPassable;
    Game_Map.prototype.isPassable = function (x, y, d) {
        // Furniture-placed ladders make wall tiles passable
        if (isTileLadderByFurniture(x, y)) return true;
        // Impassable furniture blocks the tile
        if (isTileBlockedByFurniture(x, y)) return false;
        return _Game_Map_isPassable_furniture.call(this, x, y, d);
    };

    const _Game_Map_isLadder_furniture = Game_Map.prototype.isLadder;
    Game_Map.prototype.isLadder = function (x, y) {
        if (isTileLadderByFurniture(x, y)) return true;
        return _Game_Map_isLadder_furniture.call(this, x, y);
    };

    // Once a player drives the build with the d-pad/arrows/WASD, those inputs
    // belong to the placement cursor and picker grid, so the avatar must hold
    // still. Mouse-only players keep walking freely (it is how they scroll the
    // map to reach far tiles); the lock engages only after a directional press
    // flips the build into pad mode.
    const _Game_Player_canMove_furniture = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function () {
        if ($gameTemp && $gameTemp.furnitureBuildActive) {
            const scene = SceneManager._scene;
            if (scene && scene._fbActive && scene._fbPointerMode === 'pad') return false;
        }
        return _Game_Player_canMove_furniture.call(this);
    };

    //=============================================================================
    // Tile Placement System (Walls / Terrain / Features / House Doors)
    //=============================================================================
    // Distinct from furniture: these tabs write real RPG Maker tile ids straight
    // into the map's own data array (the top overlay slot, layer 3) instead of
    // drawing a sprite, so passability/occlusion/rendering all come for free
    // from the tileset's own flags exactly like any hand-authored tile. House
    // doors are the one exception: placing one spawns a real (invisible,
    // plugin-command driven) Game_Event, exactly like any hand-authored town
    // door, plus a small decorative marker sprite so the tile reads as a door.
    //
    // Autotile shape: A1-A4 are "blob" autotiles whose visual shape is normally
    // baked in by the MAP EDITOR when you paint next to an existing tile; the
    // running game never recomputes it on its own. Building live means WE must
    // compute a shape. computeAutotileTileId() below derives it from the four
    // real shipped rendering tables (Tilemap.FLOOR_AUTOTILE_TABLE / WALL_ /
    // WATERFALL_AUTOTILE_TABLE in js/rmmz_core.js), reading which of the four
    // cardinal neighbours (N/E/S/W) also hold a same-kind tile - straight
    // edges, corners, T-junctions and islands all render correctly.
    //
    // Each table entry is the 4 quadrants [topLeft, topRight, bottomLeft,
    // bottomRight] of the tile, given as [x, y] into that autotile's source
    // block. A quadrant reaching the block's outer column/row is what DRAWS a
    // border on that side, i.e. that side is OPEN (no same-kind neighbour):
    //   west  open <-> topLeft.x === 0        east  open <-> topRight.x === 3
    //   north open <-> topLeft.y === openN    south open <-> bottomLeft.y === openS
    // The tables disagree on the row markers - the floor/blob table borders
    // north at y 2 and south at y 5, the 16-entry wall table at y 0 and y 3,
    // and the 4-entry waterfall table has no north/south at all - so those
    // rows are passed in per table rather than assumed. Getting this wrong is
    // not a subtle mis-corner: it silently resolves the FILLED interior of a
    // region to a corner-notch shape, so a solid block of wall tiles up tiles
    // with a repeating angle instead of reading as flat fill.

    const PLACED_TILE_LAYER = 3; // top-most tile data slot (same one TerrainInteractions treats as safely clearable)
    const WOOD_ITEM_ID = 859;

    // ── Shape index tables, built once from the shipped engine data ────────────
    // `cornerRows` are the source rows holding the INNER-CORNER pieces, i.e.
    // the little notch drawn when a diagonal neighbour is missing but both of
    // its cardinals are present. Several floor-table shapes share one cardinal
    // signature and differ only in how many notches they carry; we track
    // cardinals only, so the variant with the fewest notches is the honest
    // match. (The wall and waterfall tables have no such variants.)
    function buildAutotileShapeIndex(table, openNorthY, openSouthY, cornerRows) {
        const index = {};
        const notches = {};
        const corners = cornerRows || [];
        for (let shape = 0; shape < table.length; shape++) {
            const [tl, tr, bl] = table[shape];
            const westOpen = tl[0] === 0;
            const eastOpen = tr[0] === 3;
            const northOpen = tl[1] === openNorthY;
            const southOpen = bl[1] === openSouthY;
            // Connected is the negation of open; the key is west,east,north,south.
            const key = (westOpen ? 0 : 1) + ',' + (eastOpen ? 0 : 1) + ',' +
                (northOpen ? 0 : 1) + ',' + (southOpen ? 0 : 1);
            let n = 0;
            for (const q of table[shape]) if (corners.indexOf(q[1]) >= 0) n++;
            if (!(key in index) || n < notches[key]) { index[key] = shape; notches[key] = n; }
        }
        return index;
    }
    // -1 for a marker row the table does not have, so that side always reads
    // as connected (the waterfall table only ever borders west/east).
    const FLOOR_SHAPE_INDEX = buildAutotileShapeIndex(Tilemap.FLOOR_AUTOTILE_TABLE, 2, 5, [0, 1]);
    const WALL_SHAPE_INDEX = buildAutotileShapeIndex(Tilemap.WALL_AUTOTILE_TABLE, 0, 3, []);
    const WATERFALL_SHAPE_INDEX = buildAutotileShapeIndex(Tilemap.WATERFALL_AUTOTILE_TABLE, -1, -1, []);

    function lookupShape(index, west, east, north, south) {
        const key = (west ? 1 : 0) + ',' + (east ? 1 : 0) + ',' + (north ? 1 : 0) + ',' + (south ? 1 : 0);
        if (key in index) return index[key];
        const fallbacks = [
            (west ? 1 : 0) + ',' + (east ? 1 : 0) + ',1,1',
            '1,1,1,1'
        ];
        for (const k of fallbacks) if (k in index) return index[k];
        return 0;
    }

    function sameAutotileKindAt(x, y, kind) {
        if (!$gameMap || !$gameMap.isValid(x, y)) return false;
        const tileId = $gameMap.tileId(x, y, PLACED_TILE_LAYER);
        if (!tileId || !Tilemap.isAutotile(tileId)) return false;
        return Tilemap.getAutotileKind(tileId) === kind;
    }

    // Real tile id for a wall/terrain autotile of `kind` at (x,y), blended
    // against whatever same-kind tiles already sit at its 4 cardinal neighbours.
    function computeAutotileTileId(x, y, kind) {
        const sample = Tilemap.makeAutotileId(kind, 0);
        if (Tilemap.isTileA1(sample) && kind < 4) {
            // Animated water/waterfall surface kinds ignore shape entirely.
            return sample;
        }
        const west = sameAutotileKindAt(x - 1, y, kind);
        const east = sameAutotileKindAt(x + 1, y, kind);
        const north = sameAutotileKindAt(x, y - 1, kind);
        const south = sameAutotileKindAt(x, y + 1, kind);
        if (Tilemap.isTileA1(sample) && kind % 2 === 1) {
            // Waterfall kind: only an east/west (no north/south) 4-shape table.
            const shape = lookupShape(WATERFALL_SHAPE_INDEX, west, east, false, false);
            return Tilemap.makeAutotileId(kind, shape);
        }
        const useWallTable = Tilemap.isTileA3(sample) ||
            (Tilemap.isTileA4(sample) && (kind % 16) >= 8);
        const shape = useWallTable
            ? lookupShape(WALL_SHAPE_INDEX, west, east, north, south)
            : lookupShape(FLOOR_SHAPE_INDEX, west, east, north, south);
        return Tilemap.makeAutotileId(kind, shape);
    }

    // Re-blend a placed tile and its 4 neighbours after a place/remove, so
    // existing neighbouring pieces pick up the new connection too.
    function refreshAutotileBlendAround(x, y) {
        if (!$dataMap || !$dataMap.data) return;
        const w = $dataMap.width, h = $dataMap.height;
        const pts = [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [px, py] of pts) {
            if (px < 0 || py < 0 || px >= w || py >= h) continue;
            const idx = PLACED_TILE_LAYER * h * w + py * w + px;
            const tileId = $dataMap.data[idx];
            if (!tileId || !Tilemap.isAutotile(tileId)) continue;
            $dataMap.data[idx] = computeAutotileTileId(px, py, Tilemap.getAutotileKind(tileId));
        }
        if ($gameMap) $gameMap.requestRefresh();
    }

    // ── Ceiling always stands on a wall ───────────────────────────────────────
    // An A4 autotile sheet packs each wall material as a PAIR of kinds: a
    // "top" (the flat roof of the wall mass, kind % 16 < 8, blended with the
    // floor table) and, exactly 8 kinds later, the matching "side" - the
    // vertical face you actually see (kind % 16 >= 8, blended with the wall
    // table). That pairing is a fixed engine convention, not a per-tileset
    // choice (Tilemap.isWallTopTile / isWallSideTile).
    //
    // A ceiling with nothing under it reads as a slab floating in mid air, so
    // placing one always puts its own face on the tile below. Returns the
    // matching side kind, or -1 when `kind` is not a ceiling at all (A3, a
    // terrain kind, or an A4 side kind - those stand on their own).
    function ceilingSideKind(kind) {
        const sample = Tilemap.makeAutotileId(kind, 0);
        if (!Tilemap.isTileA4(sample) || (kind % 16) >= 8) return -1;
        return kind + 8;
    }

    // Is there already something under (x, y) that can carry a ceiling? Any
    // placed wall/terrain autotile counts - including another ceiling tile of
    // the same mass, which carries its own face further down.
    function hasWallUnder(x, y) {
        const below = findPlacedTileRecordAt(x, y + 1);
        return !!(below && (below.kind === 'wall' || below.kind === 'terrain'));
    }

    // Stamps the matching wall face beneath a just-placed ceiling tile. Costs
    // nothing extra: the face is part of the same piece, exactly as the map
    // editor draws one when you paint an A4 wall. Linked to its ceiling by
    // `skirtOf` so removing the ceiling takes the face with it.
    function placeCeilingFace(mapKey, parentRec, x, y, kind) {
        const sideKind = ceilingSideKind(kind);
        if (sideKind < 0) return;
        const by = y + 1;
        if (!$gameMap || !$gameMap.isValid(x, by)) return;
        if (findPlacedTileRecordAt(x, by)) return;   // something already stands there
        const tileId = Tilemap.makeAutotileId(sideKind, 0);
        $gameSystem.placeMapTile(mapKey, {
            kind: 'wall', x: x, y: by, tileId: tileId, layer: PLACED_TILE_LAYER,
            autoKind: sideKind, name: parentRec ? parentRec.name : null, cost: {},
            // Ids start at 0, so this is compared with != null, never truthily.
            skirtOf: parentRec ? parentRec.id : null
        });
        writeMapDataTile(x, by, PLACED_TILE_LAYER, tileId);
        refreshAutotileBlendAround(x, by);
    }

    function writeMapDataTile(x, y, layer, tileId) {
        if (!$dataMap || !$dataMap.data) return;
        const w = $dataMap.width, h = $dataMap.height;
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        $dataMap.data[layer * h * w + y * w + x] = tileId;
    }

    function clearMapDataTile(x, y, layer) {
        writeMapDataTile(x, y, layer, 0);
    }

    // ── Current-tileset autotile kind enumeration (for the Walls/Terrain pickers) ─
    function currentBuildTileset() {
        return ($gameMap && typeof $gameMap.tileset === 'function') ? $gameMap.tileset() : null;
    }

    function currentBuildTilesetId() {
        const ts = currentBuildTileset();
        return ts ? ts.id : 0;
    }

    function tilesetSheetBitmap(slot) {
        const ts = currentBuildTileset();
        if (!ts || !ts.tilesetNames || !ts.tilesetNames[slot]) return null;
        return ImageManager.loadTileset(ts.tilesetNames[slot]);
    }

    // ── Picker/ghost preview thumbnails ─────────────────────────────────────
    // A single 48x48 crop of the real tileset art for a given autotile kind:
    // specifically the "fully connected" (surrounded on all 4 sides) variant,
    // whose 4 render quadrants are always contiguous (verified against the
    // real FLOOR_/WALL_AUTOTILE_TABLE data), so it is always exactly one
    // whole source tile - no quadrant compositing needed, unlike a live
    // neighbour-blended tile.
    function autotileSheetBaseXY(kind) {
        const tx = kind % 8, ty = Math.floor(kind / 8);
        const sampleId = Tilemap.makeAutotileId(kind, 0);
        if (Tilemap.isTileA1(sampleId)) {
            if (kind < 4) {
                const table = [[0, 0], [0, 3], [6, 0], [6, 3]];
                return { slot: 0, bx: table[kind][0], by: table[kind][1] };
            }
            let bx = Math.floor(tx / 4) * 8 + (kind % 2 === 0 ? 0 : 6);
            const by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
            return { slot: 0, bx, by };
        }
        if (Tilemap.isTileA2(sampleId)) return { slot: 1, bx: tx * 2, by: (ty - 2) * 3 };
        if (Tilemap.isTileA3(sampleId)) return { slot: 2, bx: tx * 2, by: (ty - 6) * 2 };
        if (Tilemap.isTileA4(sampleId)) {
            const by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
            return { slot: 3, bx: tx * 2, by };
        }
        return null;
    }

    function fullyConnectedQuadrantOffset(useWallTable) {
        const index = useWallTable ? WALL_SHAPE_INDEX : FLOOR_SHAPE_INDEX;
        const table = useWallTable ? Tilemap.WALL_AUTOTILE_TABLE : Tilemap.FLOOR_AUTOTILE_TABLE;
        const key = '1,1,1,1';
        const shape = (key in index) ? index[key] : 0;
        return table[shape][0]; // [qsx, qsy] of the top-left quadrant
    }

    function autotilePreviewCropRect(kind) {
        const base = autotileSheetBaseXY(kind);
        if (!base) return null;
        const sampleId = Tilemap.makeAutotileId(kind, 0);
        const isSurfaceSpecial = Tilemap.isTileA1(sampleId) && kind < 4; // hardcoded bx/by, shape irrelevant
        const isWaterfallProper = Tilemap.isTileA1(sampleId) && kind >= 4 && kind % 2 === 1;
        let qsx = 0, qsy = 0;
        if (isWaterfallProper) {
            // WATERFALL_AUTOTILE_TABLE has no north/south axis; row 2 is the
            // "connects both sides" variant, its top-left quadrant.
            const off = Tilemap.WATERFALL_AUTOTILE_TABLE[2][0];
            qsx = off[0]; qsy = off[1];
        } else if (!isSurfaceSpecial) {
            const useWallTable = Tilemap.isTileA3(sampleId) || (Tilemap.isTileA4(sampleId) && (kind % 16) >= 8);
            const off = fullyConnectedQuadrantOffset(useWallTable);
            qsx = off[0]; qsy = off[1];
        }
        const half = TILE_SIZE / 2;
        return {
            slot: base.slot,
            x: (base.bx * 2 + qsx) * half,
            y: (base.by * 2 + qsy) * half,
            w: TILE_SIZE, h: TILE_SIZE
        };
    }

    // Draws a kind's preview crop onto an HTML canvas (picker cards).
    function drawAutotilePreviewOnCanvas(kind, canvas) {
        if (!canvas) return;
        const rect = autotilePreviewCropRect(kind);
        if (!rect) return;
        const bitmap = tilesetSheetBitmap(rect.slot);
        if (!bitmap) return;
        const draw = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx || !bitmap.canvas) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(bitmap.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
        };
        if (bitmap.isReady()) draw();
        else bitmap.addLoadListener(draw);
    }

    // Builds a real RPG Maker Bitmap with a kind's preview crop (on-map ghost).
    function autotilePreviewBitmap(kind, size) {
        const bmp = new Bitmap(size, size);
        const rect = autotilePreviewCropRect(kind);
        if (!rect) return bmp;
        const src = tilesetSheetBitmap(rect.slot);
        if (!src) return bmp;
        const draw = () => { bmp.blt(src, rect.x, rect.y, rect.w, rect.h, 0, 0, size, size); };
        if (src.isReady()) draw();
        else src.addLoadListener(draw);
        return bmp;
    }

    // Kind numbers actually present in a sheet, derived from the loaded
    // bitmap's own pixel size (kinds are laid out 8-per-row, each a fixed
    // 2-tile-wide x kindTilesH-tile-tall block).
    function autotileKindsInSheet(slot, kindTilesH) {
        const bmp = tilesetSheetBitmap(slot);
        if (!bmp || !bmp.isReady() || bmp.width === 0) return [];
        const kw = 2 * TILE_SIZE;
        const kh = kindTilesH * TILE_SIZE;
        const cols = Math.min(8, Math.floor(bmp.width / kw));
        const rows = Math.floor(bmp.height / kh);
        const kinds = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) kinds.push(r * 8 + c);
        }
        return kinds;
    }

    // Global autotile kind numbers (Tilemap.getAutotileKind convention: A1
    // 0-15, A2 16-47, A3 48-79, A4 80-127) present in the CURRENT map's tileset.
    function wallAutotileKinds() {
        const a3 = autotileKindsInSheet(2, 2).map(k => 48 + k);
        const a4 = autotileKindsInSheet(3, 5).map(k => 80 + k);
        return a3.concat(a4);
    }

    function terrainAutotileKinds() {
        const a1 = autotileKindsInSheet(0, 3).map(k => 0 + k);
        const a2 = autotileKindsInSheet(1, 3).map(k => 16 + k);
        return a1.concat(a2);
    }

    function ensureTilesetSheetsLoaded(slots, onReady) {
        const bitmaps = slots.map(s => tilesetSheetBitmap(s)).filter(Boolean);
        if (bitmaps.length === 0 || bitmaps.every(b => b.isReady())) { onReady(); return; }
        let remaining = bitmaps.filter(b => !b.isReady()).length;
        bitmaps.forEach(b => {
            if (b.isReady()) return;
            b.addLoadListener(() => { remaining--; if (remaining <= 0) onReady(); });
        });
    }

    // Any placed record (wall/terrain/feature) sitting at (x,y) on the
    // current map, or null. Doors are excluded - they are events, not tiles.
    function findPlacedTileRecordAt(x, y) {
        const list = $gameSystem.getMapTiles(furnitureMapKey());
        return list.find(t => t.x === x && t.y === y && t.kind !== 'door') || null;
    }

    // Wall and Terrain may override each other (or themselves) - placing one
    // where the other already sits silently replaces it. Features never
    // override anything, and nothing overrides a Feature or a Door.
    function canPlaceTileAt(x, y, kind) {
        if (!$gameMap || !$gameMap.isValid(x, y)) return false;
        if (!$dataMap || !$dataMap.data) return false;
        const w = $dataMap.width, h = $dataMap.height;
        const existingTileId = $dataMap.data[PLACED_TILE_LAYER * h * w + y * w + x];
        if (!existingTileId) return true;
        if (kind !== 'wall' && kind !== 'terrain') return false;
        const rec = findPlacedTileRecordAt(x, y);
        return !!(rec && (rec.kind === 'wall' || rec.kind === 'terrain'));
    }

    // Doors belong in a wall: only wall tiles (terrain tag 4, region ID 4 or a
    // fully impassable tile) take one.
    function canPlaceDoorAt(x, y) {
        if (!$gameMap || !$gameMap.isValid(x, y)) return false;
        if ($gameMap.eventIdXy(x, y) > 0) return false;
        return isWallLikeTile(x, y);
    }

    // ── Feature catalog (from the current map's tileset, via ProcGenUtils) ─────
    const EXCLUDED_FEATURE_NAMES = new Set([
        'DoorHouse', 'DoorInn', 'DoorShop', 'DoorSkyscraper', 'DoorDungeon',
        'SignPark', 'SignBus', 'SignPost'
    ]);
    const FEATURE_COST_MULTIPLIER = 3;

    let _featureCatalogCache = { tilesetId: -1, entries: {} };
    function getFeatureCatalog() {
        const tilesetId = currentBuildTilesetId();
        if (_featureCatalogCache.tilesetId === tilesetId) return _featureCatalogCache.entries;
        const entries = {};
        const U = window.ProcGenUtils;
        const TD = window.TerrainInteractions;
        if (U && U.Cache && typeof U.Cache.getTilesetFeatures === 'function' &&
            TD && typeof TD.classify === 'function' && tilesetId) {
            let allFeatures = {};
            try { allFeatures = U.Cache.getTilesetFeatures(tilesetId) || {}; } catch (e) { allFeatures = {}; }
            for (const [name, variants] of Object.entries(allFeatures)) {
                if (EXCLUDED_FEATURE_NAMES.has(name)) continue;
                const cfg = TD.classify(name);
                if (!cfg || !Array.isArray(cfg.rewards)) continue;
                const singleVariant = (variants || []).find(v => v && v.type === 'single' && v.tileId);
                if (!singleVariant) continue; // multi-tile grid features are out of scope for now
                const cost = {};
                for (const [matId, min, max] of cfg.rewards) {
                    cost[normalizeMaterialId(matId)] = Math.max(1, Math.round(((min + max) / 2) * FEATURE_COST_MULTIPLIER));
                }
                if (Object.keys(cost).length === 0) continue;
                entries[name] = { name, tileId: singleVariant.tileId, cost };
            }
        }
        _featureCatalogCache = { tilesetId, entries };
        return entries;
    }

    // ── House catalog (buyable 1-floor templates from ProceduralHouseSystem) ───
    const HOUSE_TAB_POOLS = ['houses', 'inns', 'shops'];
    const HOUSE_DOOR_TYPE = { houses: 'DoorHouse', inns: 'DoorInn', shops: 'DoorShop' };
    // Real Doors-category furniture pieces (img/furniture/Doors/), reused as
    // the actual sprite for each door type instead of a placeholder block.
    const HOUSE_DOOR_IMAGE_ID = {
        DoorHouse: 'orange_door_panel',
        DoorInn: 'door_with_flag_decal',
        DoorShop: 'brick_gatepost_red_door_01',
        DoorSkyscraper: 'castle_parapet_silhouette'
    };
    function doorImageId(doorType) {
        return HOUSE_DOOR_IMAGE_ID[doorType] || HOUSE_DOOR_IMAGE_ID.DoorHouse;
    }
    const HOUSE_PRICE_BASE = 8000;
    const HOUSE_PRICE_PER_TILE = 60;
    // Construct-mode alternative to paying gold: a large quantity of ordinary
    // building materials, scaled by the template's floor size.
    const HOUSE_MATERIAL_BASE = { 859: 60, 863: 20, 867: 15, 861: 15 }; // Wood, Steel, Glass, Cloth
    const HOUSE_MATERIAL_PER_TILE = { 859: 0.8, 863: 0.25, 867: 0.2, 861: 0.15 };

    const _houseTemplateSizeCache = {};
    function houseTemplateSize(mapId) {
        if (mapId in _houseTemplateSizeCache) return _houseTemplateSizeCache[mapId];
        let size = null;
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'data/Map%1.json'.format(String(mapId).padZero(3)), false);
            xhr.send();
            if (xhr.status === 200) {
                const json = JSON.parse(xhr.responseText);
                size = { width: json.width || 20, height: json.height || 20 };
            }
        } catch (e) { size = null; }
        if (!size) size = { width: 20, height: 20 };
        _houseTemplateSizeCache[mapId] = size;
        return size;
    }

    function houseTemplatePrice(mapId) {
        const size = houseTemplateSize(mapId);
        return HOUSE_PRICE_BASE + Math.round(size.width * size.height * HOUSE_PRICE_PER_TILE);
    }

    function houseTemplateMaterialCost(mapId) {
        const size = houseTemplateSize(mapId);
        const area = size.width * size.height;
        const cost = {};
        for (const matId of Object.keys(HOUSE_MATERIAL_BASE)) {
            cost[matId] = Math.round(HOUSE_MATERIAL_BASE[matId] + area * HOUSE_MATERIAL_PER_TILE[matId]);
        }
        return cost;
    }

    let _houseCatalogCache = null;
    function getHouseCatalog() {
        if (_houseCatalogCache) return _houseCatalogCache;
        const catalog = {};
        const sys = window.ProceduralHouseSystem;
        if (sys && typeof sys._getHouseList === 'function') {
            for (const poolName of HOUSE_TAB_POOLS) {
                let ids = [];
                try { ids = sys._getHouseList(poolName) || []; } catch (e) { ids = []; }
                for (const mapId of ids) {
                    if (catalog[mapId]) continue; // a template belongs to only one pool's listing
                    const info = ($dataMapInfos && $dataMapInfos[mapId]) ? $dataMapInfos[mapId] : null;
                    catalog[mapId] = {
                        mapId, poolName,
                        doorType: HOUSE_DOOR_TYPE[poolName] || 'DoorHouse',
                        name: (info && info.name) ? info.name : ('House ' + mapId),
                        price: houseTemplatePrice(mapId),
                        materialCost: houseTemplateMaterialCost(mapId)
                    };
                }
            }
        }
        _houseCatalogCache = catalog;
        return catalog;
    }

    // ── Prefab catalogue (the authored pieces of the current biome) ─────
    // Every biome names its own prefab pool in js/db/WorldGen/Biomes.json, and
    // the generator scatters those pieces over its squares. The party can buy
    // one outright and stand it where it likes: the piece is written into the
    // square's tile data and stamped again every time that square is generated,
    // so from then on it is part of the land. An authored map has no picture of
    // itself, so the card is its name and its footprint and nothing else.
    const PREFAB_PRICE_PER_TILE = 90;
    const PREFAB_WOOD_PER_TILE = 0.5;

    function procMapIdForBuild() {
        const WMT = window.WorldMapTransfer;
        return (WMT && WMT.procMapId) || 636;
    }

    function currentProcBiomeName() {
        const pg = $gameSystem && $gameSystem._procGenData;
        return (pg && pg.currentBiome) || null;
    }

    // Cached per biome: the sizes come from the prefab maps themselves, which
    // are read once and kept by ProceduralMapPrefabs' own cache.
    let _prefabCatalogCache = null;
    let _prefabCatalogBiome = null;
    function getPrefabCatalog() {
        const biomeName = currentProcBiomeName();
        // A prefab belongs to a procedural square: an authored map is already
        // architecture and has nothing for one to be stamped into.
        if (!biomeName || !$gameMap || $gameMap.mapId() !== procMapIdForBuild()) return {};
        if (_prefabCatalogBiome === biomeName && _prefabCatalogCache) return _prefabCatalogCache;
        const sys = window.ProceduralMapPrefabs;
        const biomes = (window.WorldGen && window.WorldGen.Biomes) || [];
        const biome = biomes.find(b => b && b.name === biomeName);
        const catalog = {};
        if (sys && typeof sys.loadPrefabSync === 'function' && biome && Array.isArray(biome.prefabs)) {
            for (const mapId of biome.prefabs.flat()) {
                if (catalog[mapId]) continue;
                let data = null;
                try { data = sys.loadPrefabSync(mapId); } catch (e) { data = null; }
                if (!data || !data.width || !data.height) continue;
                const info = ($dataMapInfos && $dataMapInfos[mapId]) ? $dataMapInfos[mapId] : null;
                const area = data.width * data.height;
                catalog[mapId] = {
                    mapId, width: data.width, height: data.height,
                    name: (info && info.name) ? info.name : String(mapId),
                    // Fixed by footprint: a piece costs what its ground costs,
                    // in money or in the wood it takes to raise it.
                    price: Math.round(area * PREFAB_PRICE_PER_TILE),
                    materialCost: { [WOOD_ITEM_ID]: Math.max(1, Math.round(area * PREFAB_WOOD_PER_TILE)) }
                };
            }
        }
        _prefabCatalogBiome = biomeName;
        _prefabCatalogCache = catalog;
        return catalog;
    }

    // A prefab needs its whole footprint inside the square and clear of any
    // other prefab the party already put down. It brings its own walls, so
    // nothing about the ground under it is asked.
    function canPlacePrefabAt(x, y, info) {
        if (!$gameMap || !$dataMap) return false;
        const w = info.width || 1, h = info.height || 1;
        if (x < 0 || y < 0 || x + w > $dataMap.width || y + h > $dataMap.height) return false;
        for (const rec of $gameSystem.getMapTiles(furnitureMapKey())) {
            if (rec.kind !== 'prefab') continue;
            const rw = rec.width || 1, rh = rec.height || 1;
            if (x < rec.x + rw && x + w > rec.x && y < rec.y + rh && y + h > rec.y) return false;
        }
        return true;
    }

    // Writes one stored prefab into the live map data. Called both the moment
    // it is bought and on every later load of the square, which is what makes a
    // bought prefab generate with the land from then on.
    function stampPrefabRecord(rec) {
        const sys = window.ProceduralMapPrefabs;
        if (!sys || !$dataMap || !$dataMap.data) return;
        let prefabMap = null;
        try { prefabMap = sys.loadPrefabSync(rec.prefabMapId); } catch (e) { return; }
        if (!prefabMap || !prefabMap.data) return;
        // A procedural square only allocates tile layers 0-3; a prefab is an
        // authored map and carries shadow-pen data on layer 4.
        const need = $dataMap.width * $dataMap.height * 5;
        if ($dataMap.data.length < need) {
            for (let i = $dataMap.data.length; i < need; i++) $dataMap.data[i] = 0;
        }
        sys.placePrefab($dataMap.data, prefabMap, { x: rec.x, y: rec.y }, [], null);
    }

    //=========================================================================
    // Founding a town (window.TownFounding)
    //=========================================================================
    // Three houses standing on one square of the world are enough for the place
    // to be called something. A founded town belongs to the WORLD, not to the
    // savegame that founded it (save/worlds/<name>/towns.json), so every party
    // playing that world finds it on the map and in the travel book. It fills up
    // on its own afterwards: people move into the houses, a keeper stands behind
    // every shop counter, and all of them pay their rent to the party that put
    // the roofs over their heads.
    const TOWN_FILE = 'towns';                 // i18n-ignore: world data file key
    const TOWN_MIN_HOUSES = 3;
    // One newcomer every other day, until the buildings are as full as they go.
    const TOWN_DAYS_PER_RESIDENT = 2;
    const TOWN_RESIDENTS_PER_HOUSE = 2;
    const TOWN_RESIDENTS_PER_SHOP = 1;
    // A tenant pays a twentieth of what the roof over their head cost each
    // month, which over thirty days is what a day of it is worth.
    const TOWN_RENT_RATE = 1 / (20 * 30);
    // The doors the generator itself puts down, read off the live tileset the
    // same way the NPC settlement pass reads them.
    const TOWN_DOOR_FEATURES = {
        DoorHouse: 'house', DoorSkyscraper: 'house', DoorInn: 'shop', DoorShop: 'shop'
    };

    function townWorldName() {
        const wm = window.WorldManager;
        return (wm && wm.activeWorldName) || null;
    }

    function townFile() {
        const wm = window.WorldManager;
        const world = townWorldName();
        let data = null;
        if (wm && world && wm.readWorldFile) data = wm.readWorldFile(world, TOWN_FILE);
        if (!data || !Array.isArray(data.towns)) data = { towns: [] };
        return data;
    }

    function saveTownFile(data) {
        const wm = window.WorldManager;
        const world = townWorldName();
        if (!wm || !world || !wm.writeWorldFile) return false;
        return wm.writeWorldFile(world, TOWN_FILE, data);
    }

    // The world's own calendar, in whole days. Everything a town does over time
    // is counted in these rather than in frames.
    function townDay() {
        const tds = window.TimeDateSystem;
        const minutes = (tds && tds.getGameTimeMinutes) ? tds.getGameTimeMinutes() : 0;
        return Math.floor((minutes || 0) / 1440);
    }

    function townSquareHere() {
        const WMT = window.WorldMapTransfer;
        if (!WMT || !WMT.currentWorldCoords) return null;
        const c = WMT.currentWorldCoords();
        if (!c) return null;
        const planet = (WMT.currentPlanet && WMT.currentPlanet()) || '';
        return { x: c.x, y: c.y, planet };
    }

    // Every house standing on the square the party is on. Both kinds count: the
    // ones the party raised themselves (a door of their own placing) and the
    // ones the generator left there (a door tile of the tileset's own).
    function townHouseTally() {
        let houses = 0, shops = 0, value = 0;
        const placed = ($gameSystem && $gameMap) ? $gameSystem.getMapTiles(furnitureMapKey()) : [];
        const taken = new Set();
        for (const rec of placed) {
            if (rec.kind !== 'door') continue;
            taken.add(rec.x + ',' + rec.y);
            const entry = getHouseCatalog()[rec.houseMapId];
            if (rec.poolName === 'shops' || rec.poolName === 'inns') shops++; else houses++;
            value += entry ? entry.price : HOUSE_PRICE_BASE;
        }
        const U = window.ProcGenUtils;
        if ($gameMap && $dataMap && U && U.Cache && U.createTileToFeatureMap && U.getFeatureNameFromTileId) {
            const tileset = $gameMap.tileset();
            const lookup = tileset ? U.createTileToFeatureMap(U.Cache.getTilesetFeatures(tileset.id)) : null;
            if (lookup) {
                for (let y = 0; y < $gameMap.height(); y++) {
                    for (let x = 0; x < $gameMap.width(); x++) {
                        if (taken.has(x + ',' + y)) continue;
                        for (const z of [2, 3]) {
                            const tileId = $gameMap.tileId(x, y, z);
                            if (!tileId) continue;
                            const kind = TOWN_DOOR_FEATURES[U.getFeatureNameFromTileId(tileId, lookup)];
                            if (!kind) continue;
                            if (kind === 'shop') shops++; else houses++;
                            value += HOUSE_PRICE_BASE;
                            taken.add(x + ',' + y);
                            break;
                        }
                    }
                }
            }
        }
        return { houses, shops, value };
    }

    function findTownAt(worldX, worldY, planet) {
        const pl = planet || '';
        return townFile().towns.find(t => t.worldX === worldX && t.worldY === worldY &&
            (t.planet || '') === pl) || null;
    }

    // Why the party may not found one here, or nothing at all when they may.
    function canFoundTownHere() {
        const sq = townSquareHere();
        if (!sq || !$gameMap || $gameMap.mapId() !== procMapIdForBuild()) {
            return { ok: false, reason: 'notHere', square: sq };
        }
        const tally = townHouseTally();
        // Only Earth has a gazetteer of named places; on another world every
        // square is open ground.
        if (!sq.planet) {
            const claimed = (window.WorldGen && window.WorldGen.HardcodedBiomeNames || {})[sq.x + ',' + sq.y];
            if (claimed) {
                const place = (window.WorkSystem && window.WorkSystem.destinationName)
                    ? window.WorkSystem.destinationName(claimed) : claimed;
                return { ok: false, reason: 'claimed', place, square: sq, tally };
            }
        }
        if (findTownAt(sq.x, sq.y, sq.planet)) {
            return { ok: false, reason: 'exists', square: sq, tally };
        }
        if (tally.houses < TOWN_MIN_HOUSES) {
            return { ok: false, reason: 'houses', square: sq, tally };
        }
        return { ok: true, square: sq, tally };
    }

    function foundTown(name) {
        const clean = String(name || '').trim().slice(0, 32);
        if (!clean) return { ok: false, reason: 'noName' };
        const check = canFoundTownHere();
        if (!check.ok) return check;
        const file = townFile();
        if (file.towns.some(t => t.name.toLowerCase() === clean.toLowerCase())) {
            return { ok: false, reason: 'duplicate' };
        }
        const day = townDay();
        file.towns.push({
            name: clean,
            worldX: check.square.x, worldY: check.square.y, planet: check.square.planet || '',
            biome: currentProcBiomeName() || '',
            foundedDay: day, lastRentDay: day,
            houses: check.tally.houses, shops: check.tally.shops, houseValue: check.tally.value
        });
        saveTownFile(file);
        onTownsChanged();
        return { ok: true, name: clean };
    }

    // A town keeps counting the buildings that stand on it, so a house raised
    // after the founding brings its own tenants and its own rent. Called
    // whenever the party is standing on one of their own squares.
    function syncTownHere() {
        const sq = townSquareHere();
        if (!sq || !$gameMap || $gameMap.mapId() !== procMapIdForBuild()) return null;
        const file = townFile();
        const town = file.towns.find(t => t.worldX === sq.x && t.worldY === sq.y &&
            (t.planet || '') === (sq.planet || ''));
        if (!town) return null;
        const tally = townHouseTally();
        if (town.houses === tally.houses && town.shops === tally.shops &&
            town.houseValue === tally.value) return town;
        town.houses = tally.houses;
        town.shops = tally.shops;
        town.houseValue = tally.value;
        saveTownFile(file);
        return town;
    }

    function townCapacity(town) {
        return Math.max(1, (town.houses || 0) * TOWN_RESIDENTS_PER_HOUSE +
            (town.shops || 0) * TOWN_RESIDENTS_PER_SHOP);
    }

    function townResidents(town) {
        const days = Math.max(0, townDay() - (town.foundedDay || 0));
        return Math.min(townCapacity(town), Math.floor(days / TOWN_DAYS_PER_RESIDENT));
    }

    // What every resident of the town hands over in a day, taken from what the
    // roofs they live under are worth.
    function townRentPerDay(town) {
        const perHead = (town.houseValue || 0) / townCapacity(town);
        return Math.round(perHead * TOWN_RENT_RATE * townResidents(town));
    }

    function townRentDue(town) {
        const days = Math.max(0, townDay() - (town.lastRentDay || 0));
        return days * townRentPerDay(town);
    }

    // Collects everything owed across every town of this world at once, and
    // pays it into the party's purse.
    function collectTownRent() {
        const file = townFile();
        const day = townDay();
        let total = 0;
        for (const town of file.towns) {
            total += townRentDue(town);
            town.lastRentDay = day;
        }
        if (total > 0) {
            saveTownFile(file);
            if ($gameParty) $gameParty.gainGold(total);
        }
        return total;
    }

    // Everything that has to hear about a new town: the travel book keeps a
    // cache of its pins, and the world map draws its name.
    function onTownsChanged() {
        if (window.FastTravelSystem && window.FastTravelSystem.refreshDestinations) {
            window.FastTravelSystem.refreshDestinations();
        }
        if (window.WorldMapView && window.WorldMapView.refreshLabels) {
            window.WorldMapView.refreshLabels();
        }
    }

    window.TownFounding = {
        MIN_HOUSES: TOWN_MIN_HOUSES,
        list: () => townFile().towns,
        findAt: findTownAt,
        squareHere: townSquareHere,
        houseTally: townHouseTally,
        canFoundHere: canFoundTownHere,
        found: foundTown,
        syncHere: syncTownHere,
        capacity: townCapacity,
        residents: townResidents,
        rentPerDay: townRentPerDay,
        rentDue: townRentDue,
        collectRent: collectTownRent,
        day: townDay,
        formatMoney: (v) => formatEuros(v)
    };

    // ── Animal catalog (livestock bought from AnimalGrowthSystem) ────────────
    // Animals are the one placeable that is always paid for in money: they are
    // bought, not built, so the Construct/Purchase toggle never applies to them.
    // Each entry is one animal at one growth stage, priced by its buy cost.
    function animalSystem() {
        return window.AnimalGrowthSystem || null;
    }

    // Cached on first use: the animal database never changes at runtime, and
    // resolvePlaceable() hits this catalog once per card per render.
    let _animalCatalogCache = null;
    function getAnimalCatalog() {
        if (_animalCatalogCache) return _animalCatalogCache;
        const ags = animalSystem();
        if (!ags || !ags.ANIMAL_DB) return {};
        const entries = {};
        for (const [animalId, def] of Object.entries(ags.ANIMAL_DB)) {
            const stages = def.hasBaby ? ['baby', 'adult'] : ['adult'];
            for (const stage of stages) {
                const skins = stage === 'baby' ? def.babySprites : def.adultSprites;
                if (!skins || skins.length === 0) continue;
                entries[`animal:${animalId}:${stage}`] = { // i18n-ignore: placeable id
                    animalId, stage, def,
                    price: ags.buyCostOf(def, stage),
                    sprite: skins[0]
                };
            }
        }
        // The wardrobe the breeds are read from may not be loaded on the
        // first call: an empty answer is never cached, or the Animals tab
        // would stay empty for the rest of the session.
        if (Object.keys(entries).length) _animalCatalogCache = entries;
        return entries;
    }

    // ── Unified placeable resolver ───────────────────────────────────────────
    // Everywhere the build UI/placement code used to read `Furniture[id]`
    // directly now goes through this instead, so furniture pieces AND the new
    // wall/terrain/feature/door "pieces" (which are not in the Furniture table
    // at all) can flow through the exact same picker/preview/placement code.
    function resolvePlaceable(id) {
        if (!id) return null;
        if (Furniture[id]) return Furniture[id];
        if (id.startsWith('wall:') || id.startsWith('terrain:')) {
            const isWall = id.startsWith('wall:');
            const kind = Number(id.split(':')[1]);
            if (!Number.isFinite(kind)) return null;
            return {
                id, name: (isWall ? 'Wall' : 'Terrain') + ' ' + (kind + 1),
                width: 1, height: 1, category: isWall ? 'Wall' : 'Terrain', rotatable: false,
                __specialCost: { [WOOD_ITEM_ID]: 1 },
                __placeKind: isWall ? 'wall' : 'terrain', __autoKind: kind
            };
        }
        if (id.startsWith('feature:')) {
            const name = id.slice('feature:'.length);
            const entry = getFeatureCatalog()[name];
            if (!entry) return null;
            return {
                id, name: entry.name, width: 1, height: 1, category: 'Feature', rotatable: false, // i18n-ignore: category id
                __specialCost: entry.cost, __placeKind: 'feature', __tileId: entry.tileId
            };
        }
        if (id.startsWith('house:')) {
            const mapId = Number(id.split(':')[1]);
            const entry = getHouseCatalog()[mapId];
            if (!entry) return null;
            return {
                id, name: entry.name, width: 1, height: 1, category: 'House', rotatable: false,
                // Dual cost: Construct mode pays the (large) material cost,
                // Purchase mode pays gold - same duality as ordinary furniture,
                // handled automatically by getFurnitureCost/getFurniturePrice.
                __specialCost: entry.materialCost, __specialGoldPrice: entry.price, __placeKind: 'door',
                __poolName: entry.poolName, __houseMapId: entry.mapId, __doorType: entry.doorType,
                __imageId: doorImageId(entry.doorType)
            };
        }
        if (id.startsWith('prefab:')) {
            const mapId = Number(id.split(':')[1]);
            const entry = getPrefabCatalog()[mapId];
            if (!entry) return null;
            return {
                id, name: entry.name, width: entry.width, height: entry.height,
                category: 'Prefab', rotatable: false,   // i18n-ignore: category id
                __specialCost: entry.materialCost, __specialGoldPrice: entry.price,
                __placeKind: 'prefab', __prefabMapId: entry.mapId, __noPreview: true
            };
        }
        if (id.startsWith('animal:')) {
            const entry = getAnimalCatalog()[id];
            if (!entry) return null;
            const ags = animalSystem();
            const stageName = (ags && ags.STAGE_NAMES[entry.stage]) || entry.stage;
            return {
                id, name: `${entry.animalId} (${stageName})`,
                width: 1, height: 1, category: 'Animal', rotatable: false,
                // Money only: no material recipe at all, so getFurnitureCost
                // returns {} and getFurniturePrice returns the buy cost.
                __specialGoldPrice: entry.price, __placeKind: 'animal',
                __animalId: entry.animalId, __animalStage: entry.stage, __animalSprite: entry.sprite
            };
        }
        return null;
    }

    // ── Applying stored placements to the live map ──────────────────────────
    function applyPlacedTilesToMap() {
        if (!$gameSystem || !$dataMap || !$dataMap.data) return;
        const mapKey = furnitureMapKey();
        const list = $gameSystem.getMapTiles(mapKey);
        if (!list.length) return;
        const w = $dataMap.width, h = $dataMap.height;
        const inBounds = (rx, ry) => rx >= 0 && ry >= 0 && rx < w && ry < h;
        // Prefabs first: they are whole authored maps, so anything the party
        // painted afterwards has to sit on top of one, not under it.
        for (const rec of list) {
            if (rec.kind === 'prefab') stampPrefabRecord(rec);
        }
        // Pass 1: lay every tile down at a base id so every neighbour a shape
        // needs to read is already present before pass 2 blends them.
        for (const rec of list) {
            if (rec.kind === 'door' || !inBounds(rec.x, rec.y)) continue;
            const layer = rec.layer != null ? rec.layer : PLACED_TILE_LAYER;
            const baseId = (rec.kind === 'feature') ? rec.tileId : Tilemap.makeAutotileId(rec.autoKind, 0);
            $dataMap.data[layer * h * w + rec.y * w + rec.x] = baseId;
        }
        // Pass 2: compute the real blended shape for every wall/terrain tile.
        for (const rec of list) {
            if (rec.kind !== 'wall' && rec.kind !== 'terrain') continue;
            if (!inBounds(rec.x, rec.y)) continue;
            const layer = rec.layer != null ? rec.layer : PLACED_TILE_LAYER;
            $dataMap.data[layer * h * w + rec.y * w + rec.x] = computeAutotileTileId(rec.x, rec.y, rec.autoKind);
        }
        if ($gameMap) $gameMap.requestRefresh();
    }

    // ── House doors: real, plugin-command-driven Game_Events ────────────────
    function spawnDoorEventFromRecord(rec) {
        if (!$dataMap) return;
        if (!$dataMap.events) $dataMap.events = [null];
        const eventId = $dataMap.events.length;
        const eventData = {
            id: eventId, name: rec.doorType || 'Door', note: '',
            x: rec.x, y: rec.y,
            pages: [{
                conditions: {
                    actorId: 1, actorValid: false, itemId: 1, itemValid: false,
                    selfSwitchCh: 'A', selfSwitchValid: false,
                    switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
                    variableId: 1, variableValid: false
                },
                directionFix: false,
                image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 0 },
                list: [
                    { code: 357, indent: 0, parameters: ['ProceduralHouseSystem', 'visitHouse', 'Visit House', // i18n-ignore: plugin-command id
                        { poolName: rec.poolName, facing: 'false', houseId: String(rec.houseMapId), alwaysOpen: 'true' }] },
                    { code: 0, indent: 0, parameters: [] }
                ],
                moveFrequency: 3,
                moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
                moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: false,
                through: false, trigger: 2, walkAnime: false
            }]
        };
        $dataMap.events[eventId] = eventData;
        if ($gameMap) {
            if (!$gameMap._events) $gameMap._events = [];
            $gameMap._events[eventId] = new Game_Event($gameMap.mapId(), eventId);
        }
    }

    function applyPlacedDoorsToMap() {
        if (!$gameSystem || !$dataMap) return;
        const list = $gameSystem.getMapTiles(furnitureMapKey());
        for (const rec of list) {
            if (rec.kind === 'door') spawnDoorEventFromRecord(rec);
        }
    }

    const _Game_Map_setup_fsTiles = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        _Game_Map_setup_fsTiles.call(this, mapId);
        // Belt-and-suspenders: also re-applied later at Spriteset creation
        // time (see Spriteset_Map.prototype.createLowerLayer below), which is
        // the timing that actually matters since later Game_Map.setup-time
        // steps (procedural biome injection, prefab placement, ...) can
        // replace $dataMap.data wholesale after this point. Safe to call
        // twice: it only re-paints tiles, never duplicates state. Doors are
        // NOT re-applied here (only at Spriteset time) since spawning the
        // same door event twice would duplicate it.
        applyPlacedTilesToMap();
    };

    // ── Door decorative marker (the underlying event is invisible) ──────────
    function doorTypeShortLabel(t) {
        if (t === 'DoorInn') return T('Furniture.door.inn');
        if (t === 'DoorShop') return T('Furniture.door.shop');
        if (t === 'DoorSkyscraper') return T('Furniture.door.tower');
        return T('Furniture.door.home');
    }

    class Sprite_DoorMarker extends Sprite {
        constructor(rec) {
            super();
            this._rec = rec;
            this.anchor.x = 0;
            this.anchor.y = 1;
            this.z = 3;
            this.loadImage();
            this.updatePosition();
        }
        // Real Doors-category furniture art (via doorImageId), same
        // load-with-fallback pattern as Sprite_Furniture: only falls back to
        // the coloured+labelled placeholder if the image genuinely fails.
        loadImage() {
            const imageId = doorImageId(this._rec.doorType);
            const folder = furnitureImageFolder(imageId);
            const w = TILE_SIZE, h = TILE_SIZE;
            if (!folder) {
                this.bitmap = new Bitmap(w, h);
                this.drawPlaceholder();
                return;
            }
            this.bitmap = ImageManager.loadBitmap(folder, imageId);
            this._loadingImage = true;
            this._imageLoadTimeout = 0;
        }
        drawPlaceholder() {
            const w = TILE_SIZE, h = TILE_SIZE;
            this.bitmap.fillRect(0, 0, w, h, 'rgba(90,110,190,0.85)');
            this.bitmap.strokeRect(0, 0, w, h, '#ffffff', 2);
            this.bitmap.fontSize = 12;
            this.bitmap.textColor = '#ffffff';
            this.bitmap.drawText(doorTypeShortLabel(this._rec.doorType), 0, h / 2 - 8, w, 16, 'center');
        }
        updatePosition() {
            const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
            this.x = (this._rec.x - $gameMap.displayX()) * tw;
            this.y = (this._rec.y + 1 - $gameMap.displayY()) * th;
        }
        update() {
            super.update();
            this.updatePosition();
            if (this._loadingImage && this.bitmap) {
                this._imageLoadTimeout++;
                if (this._imageLoadTimeout > 60 || !this.bitmap._url || this.bitmap.isReady()) {
                    this._loadingImage = false;
                    if (!this.bitmap.isReady() || this.bitmap.width === 0 || this.bitmap.height === 0) {
                        this.bitmap = new Bitmap(TILE_SIZE, TILE_SIZE);
                        this.drawPlaceholder();
                    }
                }
            }
        }
    }

    function addDoorMarkerSprite(spriteset, rec) {
        if (!spriteset || !spriteset._tilemap) return;
        if (!spriteset._doorMarkerSprites) spriteset._doorMarkerSprites = [];
        const sprite = new Sprite_DoorMarker(rec);
        spriteset._doorMarkerSprites.push(sprite);
        spriteset._tilemap.addChild(sprite);
    }

    Spriteset_Map.prototype.createDoorMarkerSprites = function () {
        this._doorMarkerSprites = [];
        const list = $gameSystem.getMapTiles(furnitureMapKey());
        for (const rec of list) {
            if (rec.kind === 'door') addDoorMarkerSprite(this, rec);
        }
    };

    const _Spriteset_Map_createLowerLayer_fsDoors = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function () {
        // Re-apply BEFORE the tilemap is built (and before the original call
        // chain, which on the procedural map also re-injects/regenerates
        // $dataMap), so placed walls/terrain/features are guaranteed to be
        // painted into the FINAL $dataMap the live Tilemap actually reads -
        // not an earlier snapshot that a later Game_Map.setup-time step (proc
        // biome injection, prefab placement, ...) goes on to replace.
        applyPlacedTilesToMap();
        applyPlacedDoorsToMap();
        _Spriteset_Map_createLowerLayer_fsDoors.call(this);
        this.createDoorMarkerSprites();
    };

    // ── Refunds & removal ────────────────────────────────────────────────────
    function refundTileCost(cost, pool) {
        if (isFreeBuild() || !cost) return;
        const recovered = {};
        for (const [id, qty] of Object.entries(cost)) {
            const refund = Math.floor(qty * DISMANTLE_RETURN);
            if (refund <= 0) continue;
            $gameSystem.addMaterial(id, refund);
            recovered[id] = (recovered[id] || 0) + refund;
            if (pool) pool[id] = (pool[id] || 0) + refund;
        }
        if (!pool) announceRefund(recovered);
    }

    // ── Interact-to-dismantle for player-built Features (works on any map, but
    // only ever touches tiles THIS system itself placed) ────────────────────
    function findPlacedFeatureAt(mapKey, x, y) {
        const list = $gameSystem.getMapTiles(mapKey);
        return list.find(t => t.kind === 'feature' && t.x === x && t.y === y) || null;
    }

    function dismantlePlacedFeature(rec) {
        const mapKey = furnitureMapKey();
        $gameSystem.removePlacedTile(mapKey, rec.id);
        clearMapDataTile(rec.x, rec.y, rec.layer != null ? rec.layer : PLACED_TILE_LAYER);
        if ($gameMap) $gameMap.requestRefresh();
        refundTileCost(rec.cost);
        SoundManager.playUseItem();
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map && scene._fbUI) scene._fbUI.refresh();
    }

    function showFeatureDismantleMenu(rec) {
        window.skipLocalization = true;
        $gameMessage.setChoices([T('Furniture.dismantle'), T('Furniture.cancel')], 0, 1);
        window.skipLocalization = false;
        $gameMessage.setChoiceCallback((index) => {
            if (index !== 0) return;
            setTimeout(() => dismantlePlacedFeature(rec), 0);
        });
    }

    Scene_Map.prototype.updatePlacedFeatureInteraction = function () {
        if (this._fbActive) return; // build mode has its own click-to-remove flow
        if (!$gamePlayer || !$gameMap) return;
        if ($gameMessage && $gameMessage.isBusy && $gameMessage.isBusy()) return;
        if (!Input.isTriggered('ok')) return;
        const d = $gamePlayer.direction();
        const x = $gameMap.roundXWithDirection($gamePlayer.x, d);
        const y = $gameMap.roundYWithDirection($gamePlayer.y, d);
        if ($gameMap.eventIdXy(x, y) > 0) return; // never steal a real event's interaction
        const rec = findPlacedFeatureAt(furnitureMapKey(), x, y);
        if (!rec) return;
        showFeatureDismantleMenu(rec);
    };

    const _Scene_Map_update_fsFeatureInteract = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_fsFeatureInteract.call(this);
        this.updatePlacedFeatureInteraction();
    };

    //=============================================================================
    // Build Overlay Helpers
    //=============================================================================

    // The label for an asset-set folder. The folder name stays the id; only
    // this reading of it moves, so an unlisted (modded) folder still reads.
    function titleCaseCategory(symbol) {
        const key = 'Furniture.category.' + symbol;
        if (T.has(key)) return T(key);
        return String(symbol)
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    // A piece's own name and blurb. Every entry in Furniture.json already
    // carries `name_int`, the i18n path holding its copy ("furniture.<id>.name"),
    // but nothing was reading it, so the build menu drew the English `name`
    // field in every language. Same shape, and the same guard, as
    // CrimeSystem's crime.name_int: the key wins where it resolves, and the
    // data field stays the fallback for a piece the banks do not list (which
    // most of the 9,000 asset-set pieces are, their names being asset ids).
    function furnitureName(id, f) {
        const rec = f || Furniture[id] || null;
        const key = rec && rec.name_int;
        if (key && T.has(key)) return T(key);
        return (rec && rec.name) || String(id || '');
    }

    // Special pseudo-category shown first in the dropdown: only the pieces the
    // player can actually build with their current materials (all pieces while
    // free-building). It is the default view when the build menu opens.
    const BUILDABLE_SYMBOL = '__buildable__';

    // The cover art of a folder: the first piece filed under it, read in the
    // same order the grid would read it, so a folder card shows what is inside
    // rather than a word on its own. Cached, since the catalogue is static and
    // the gallery is rebuilt on every render.
    const _coverCache = new Map();
    function folderCoverId(category, subcategory) {
        // U+0001 rather than a literal NUL: a NUL byte in the source made grep
        // and ripgrep treat this whole file as binary and skip it silently in
        // any repo-wide search. Same job, still a separator no category name
        // can contain.
        const key = category + '\u0001' + (subcategory || '');
        if (_coverCache.has(key)) return _coverCache.get(key);
        let best = null, bestName = null;
        for (const [id, f] of Object.entries(Furniture)) {
            if (f.category !== category) continue;
            if (subcategory && f.subcategory !== subcategory) continue;
            const n = furnitureName(id, f);
            if (bestName === null || n.localeCompare(bestName) < 0) { best = id; bestName = n; }
        }
        _coverCache.set(key, best);
        return best;
    }

    function getBuildCategories() {
        const seen = new Set();
        const dynamic = [];
        for (const item of Object.values(Furniture)) {
            if (item.category && !seen.has(item.category)) {
                seen.add(item.category);
                dynamic.push({ name: titleCaseCategory(item.category), symbol: item.category });
            }
        }
        dynamic.sort((a, b) => a.name.localeCompare(b.name));
        // "Buildable" leads the list so it is the default selected category.
        dynamic.unshift({ name: T('Furniture.buildable'), symbol: BUILDABLE_SYMBOL });
        return dynamic;
    }

    // Top-level tabs (Buildables/Walls/Terrain/Houses/Features/Animals), shown
    // as a row of buttons under the Construct/Purchase mode switch. Only
    // "Buildables" still uses the Category dropdown internally; the other 5
    // are flat, dropdown-free pickers resolved via resolvePlaceable().
    // `key` is the id the panel switches on; the label is read when the tab row
    // is drawn, so it follows a language switch.
    const TOP_TABS = [
        { key: 'buildables', nameKey: 'Furniture.tab.buildables' },
        { key: 'walls', nameKey: 'Furniture.tab.walls' },
        { key: 'terrain', nameKey: 'Furniture.tab.terrain' },
        { key: 'houses', nameKey: 'Furniture.tab.houses' },
        { key: 'features', nameKey: 'Furniture.tab.features' },
        { key: 'animals', nameKey: 'Furniture.tab.animals' },
        { key: 'prefabs', nameKey: 'Furniture.tab.prefabs' },
        { key: 'town', nameKey: 'Furniture.tab.town' }
    ];

    // IconSet.png indices used for the panel's own labels and badges (names as
    // per js/db/Sprites/Icons.json). The panel is emoji-free: every glyph here
    // is a real game icon so it matches the rest of the UI.
    const UI_ICONS = {
        hammer: 223,   // War Hammer   - Build Mode title / Construct mode
        money: 191,    // Gold Nuggets - gold amounts and purchase prices
        wallet: 187,   // Wallet       - Purchase mode
        demolish: 218, // Bomb         - clear everything built on this map
        warn: 281,     // "!" sign     - clear-all confirmation
        blocked: 282,  // No Entry     - piece the player cannot afford
        missing: 196   // Puzzle       - placeholder when a piece has no image
    };

    // Inline IconSet sprite. Icons are 32x32 in a 16-wide sheet, so scaling the
    // background to size*16 wide renders any icon at an arbitrary size.
    function iconHTML(iconIndex, size = 18) {
        const x = (iconIndex % 16) * size;
        const y = Math.floor(iconIndex / 16) * size;
        // i18n-ignore-start: inline CSS for the IconSet sprite cell
        return `<span class="fbuild-ic" style="width:${size}px; height:${size}px;` +
            ` background-image:url('img/system/IconSet.png');` +
            ` background-size:${size * 16}px auto; background-position:-${x}px -${y}px;"></span>`;
        // i18n-ignore-end
    }

    // Placeholder shown in a card/thumb when the piece has no indexed image.
    function placeholderIconHTML(size = 32) {
        return `<span class="ph">${iconHTML(UI_ICONS.missing, size)}</span>`;
    }

    // Category tab icons: the first single-tile (48x48) piece in each category
    // that has an indexed image. Cached on first use since Furniture never
    // changes at runtime; 'all' takes the first 48x48 piece overall.
    let _categoryIconCache = null;

    function drawIconOnCanvasEl(iconIndex, canvas) {
        if (!canvas) return;
        const bitmap = ImageManager.loadSystem("IconSet");
        const pw = ImageManager.iconWidth || 32;
        const ph = ImageManager.iconHeight || 32;
        const draw = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            const sx = (iconIndex % 16) * pw;
            const sy = Math.floor(iconIndex / 16) * ph;
            ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, canvas.width, canvas.height);
        };
        if (bitmap.isReady()) draw();
        else bitmap.addLoadListener(draw);
    }

    // Read a CSS custom property from the active theme (css/vars.css, swapped at
    // runtime by GameOptions.applyTheme). Lets the on-map build visuals (grid,
    // ghost preview, cursor) match whatever preset the DOM panel is using.
    function readThemeColor(name, fallback) {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return v || fallback;
        } catch (e) {
            return fallback;
        }
    }

    // Normalise any CSS color to an rgba() string at the given alpha, so a theme
    // token (hex, rgb, named) can be reused as a translucent overlay fill.
    function themeRgba(name, alpha, fallback) {
        const color = readThemeColor(name, fallback);
        try {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 1;
            const ctx = cv.getContext('2d');
            ctx.fillStyle = color;
            const norm = ctx.fillStyle;
            if (norm[0] === '#') {
                const hex = norm.length === 4
                    ? norm.slice(1).split('').map(c => c + c).join('')
                    : norm.slice(1);
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return `rgba(${r},${g},${b},${alpha})`;
            }
            const m = norm.match(/rgba?\(([^)]+)\)/);
            if (m) {
                const p = m[1].split(',').map(s => s.trim());
                return `rgba(${p[0]},${p[1]},${p[2]},${alpha})`;
            }
            return color;
        } catch (e) {
            return color;
        }
    }

    //=============================================================================
    // Sprite_FurniturePlacement (ghost preview that follows the cursor)
    //=============================================================================

    class Sprite_FurniturePlacement extends Sprite {
        constructor(furnitureId) {
            super();
            this._furnitureId = furnitureId;
            this._furnitureData = resolvePlaceable(furnitureId);
            // Wall/Terrain/Feature/House pieces are not in the Furniture image
            // index under their own id; House doors alias to a real Doors-
            // category furniture image via __imageId.
            this._imageId = (this._furnitureData && this._furnitureData.__imageId) || furnitureId;
            this._flipped = false;
            this._valid = false;
            this._tileX = 0;
            this._tileY = 0;
            this.anchor.x = 0;
            this.anchor.y = 1;
            this.opacity = 200;
            this.z = 8;
            this.loadImage();
            this.createOverlay();
            this.updateScreen();
        }

        loadImage() {
            const kind = this._furnitureData && this._furnitureData.__autoKind;
            const kindPlace = this._furnitureData && this._furnitureData.__placeKind;
            if ((kindPlace === 'wall' || kindPlace === 'terrain') && kind != null) {
                this.bitmap = autotilePreviewBitmap(kind, TILE_SIZE);
                return;
            }
            if (kindPlace === 'animal') {
                const ags = animalSystem();
                this.bitmap = ags
                    ? ags.frameBitmap(this._furnitureData.__animalSprite, this._furnitureData.__animalStage)
                    : new Bitmap(TILE_SIZE, TILE_SIZE);
                // That bitmap resizes itself to the real cell size once the
                // character sheet loads, and a plain Bitmap.resize does not
                // notify the sprite, so the frame is re-synced in update().
                this._animalGhost = true;
                return;
            }
            const folder = furnitureImageFolder(this._imageId);
            if (!folder) {
                // No indexed art: show a translucent coloured block as the ghost.
                const w = this._furnitureData.width * TILE_SIZE;
                const h = this._furnitureData.height * TILE_SIZE;
                this.bitmap = new Bitmap(w, h);
                this.bitmap.fillRect(0, 0, w, h, 'rgba(150,150,150,0.6)');
                return;
            }
            this.bitmap = ImageManager.loadBitmap(folder, this._imageId);
        }

        createOverlay() {
            this._overlay = new Sprite();
            this._overlay.anchor.x = 0;
            this._overlay.anchor.y = 1;
            this.addChild(this._overlay);
            this.refreshOverlay();
        }

        refreshOverlay() {
            const w = this._furnitureData.width * TILE_SIZE;
            const h = this._furnitureData.height * TILE_SIZE;
            const bmp = new Bitmap(w, h);
            // Valid/invalid track the theme's ok/bad cost colors so the ghost
            // matches the active preset rather than fixed green/red.
            const fill = this._valid
                ? themeRgba('--text-cost-ok', 0.35, '#3ec860')
                : themeRgba('--text-cost-bad', 0.42, '#dc2828');
            const line = this._valid
                ? readThemeColor('--text-cost-ok', '#3ec860')
                : readThemeColor('--text-cost-bad', '#dc2828');
            bmp.fillRect(0, 0, w, h, fill);
            bmp.strokeRect(0, 0, w, h, line, 2);
            this._overlay.bitmap = bmp;
        }

        setTile(x, y) {
            this._tileX = x;
            this._tileY = y;
            this.updateScreen();
        }

        setValid(valid) {
            if (this._valid !== valid) {
                this._valid = valid;
                this.refreshOverlay();
            }
        }

        getFlipped() {
            return this._flipped;
        }

        flip() {
            if (this._furnitureData.rotatable) {
                this._flipped = !this._flipped;
            }
        }

        updateScreen() {
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            this.x = (this._tileX - $gameMap.displayX()) * tw;
            this.y = (this._tileY + this._furnitureData.height - $gameMap.displayY()) * th;
            if (this._furnitureData.rotatable && this._flipped) {
                this.scale.x = -1;
                this.x += this._furnitureData.width * tw;
            } else {
                this.scale.x = 1;
            }
        }

        update() {
            super.update();
            if (this._animalGhost && this.bitmap && this._ghostBmpW !== this.bitmap.width) {
                this._ghostBmpW = this.bitmap.width;
                this.setFrame(0, 0, this.bitmap.width, this.bitmap.height);
            }
            this.updateScreen();
        }
    }

    //=============================================================================
    // FurnitureBuildUI (DOM overlay panel)
    //=============================================================================

    class FurnitureBuildUI {
        constructor(scene) {
            this.scene = scene;
            // null = the category list itself is showing (the Buildables tab
            // opens on the gallery of folders, not on a dropdown).
            this.category = null;
            this.topTab = 'buildables';
            this.search = '';
            // The field lives behind a handle, like every other search in the
            // game (UI/MenuSearchBar.js).
            this.searchOpen = false;
            this.container = document.createElement('div');
            this.container.id = 'fbuild-panel';
            document.body.appendChild(this.container);

            this.container.addEventListener('pointerenter', () => { this.scene._fbOverPanel = true; });
            this.container.addEventListener('pointerleave', () => { this.scene._fbOverPanel = false; });
            this.container.addEventListener('pointerdown', e => { e.stopPropagation(); });
            this.container.addEventListener('contextmenu', e => { e.preventDefault(); });

            // A typed letter belongs to the field, not to the map: WASD are
            // bound as directions and would otherwise walk the picker instead
            // of being written. Caught before anything else sees the key.
            this._keyGuard = (e) => {
                const el = document.activeElement;
                if (!el || !this.container || !this.container.contains(el)) return;
                if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
                e.stopPropagation();
                if (e.key === 'Escape') { el.blur(); e.preventDefault(); }
            };
            window.addEventListener('keydown', this._keyGuard, true);
            window.addEventListener('keyup', this._keyGuard, true);
            window.addEventListener('keypress', this._keyGuard, true);

            // RPG Maker attaches a document-level wheel listener that preventDefaults,
            // killing native scrolling inside the panel. Intercept the wheel here,
            // scroll the nearest overflow region ourselves, and stop the event from
            // ever reaching the game so the map does not zoom/scroll underneath.
            this.container.addEventListener('wheel', e => {
                // Over a card that stands for a recolour family, the wheel walks
                // that family's colourways instead of scrolling the grid; the
                // grid still scrolls everywhere else.
                const card = e.target.closest('.fbuild-card[data-group]');
                if (card) {
                    this.cycleVariant(card.dataset.group, e.deltaY > 0 ? 1 : -1);
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                const scrollable = e.target.closest('.fbuild-grid, .fbuild-materials');
                if (scrollable) scrollable.scrollTop += e.deltaY;
                e.stopPropagation();
                e.preventDefault();
            }, { passive: false });

            this.render();
        }

        // The founding charter: what stands on this square, whether it may be
        // called something, and the field that names it.
        townPageHTML() {
            const TF = window.TownFounding;
            if (!TF) return '';
            const check = TF.canFoundHere();
            const tally = check.tally || { houses: 0, shops: 0 };
            const sq = check.square;
            const existing = sq ? TF.findAt(sq.x, sq.y, sq.planet) : null;
            const whereText = sq
                ? T('Towns.deeds.square', { x: sq.x, y: sq.y }) +
                  (sq.planet ? ' ' + T('Towns.deeds.onPlanet', { planet: sq.planet }) : '')
                : '';
            const rows = [];
            if (whereText) rows.push(`<div class="fbuild-town-line">${T('Towns.found.here', { place: whereText })}</div>`);
            rows.push(`<div class="fbuild-town-line ${tally.houses >= TF.MIN_HOUSES ? 'ok' : 'bad'}">
                ${T('Towns.found.requirement', { have: tally.houses, need: TF.MIN_HOUSES })}</div>`);
            if (existing) {
                rows.push(`<div class="fbuild-town-line ok">${T('Towns.found.founded', { name: existing.name })}</div>`);
            } else if (!check.ok) {
                rows.push(`<div class="fbuild-town-line bad">${T('Towns.found.reason.' + check.reason,
                    { place: check.place || '' })}</div>`);
            } else {
                const value = String(this.townName || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); // i18n-ignore: HTML entity escaping
                rows.push(`<label class="fbuild-town-line">${T('Towns.found.nameLabel')}</label>
                    <input class="fbuild-town-name" type="text" maxlength="32"
                        placeholder="${T('Towns.found.namePlaceholder')}" value="${value}">
                    <button class="fbuild-town-found" type="button">${T('Towns.found.button')}</button>`);
            }
            return `<div class="fbuild-town">
                <div class="fbuild-town-title">${iconHTML(UI_ICONS.hammer, 18)} ${T('Towns.found.title')}</div>
                ${rows.join('')}
            </div>`;
        }

        render() {
            const free = isFreeBuild();
            const mode = this.scene._fbBuildMode === 'construct' ? 'construct' : 'purchase';
            const purchasing = mode === 'purchase';
            const topTab = this.topTab || 'buildables';
            const affordFn = (item) => {
                if (free) return true;
                if (!item) return false;
                if (item.__placeKind === 'animal') return canPurchaseFurniture(item);
                return purchasing ? canPurchaseFurniture(item) : canAffordFurniture(item);
            };

            // The Animals tab is not carpentry: it sells livestock, and that is
            // a different skill. The badge follows the open tab.
            if (window.SpecBadge) {
                // The build menu can be an overlay on the map rather than a
                // scene of its own, so it is tied to its own container: the
                // badge goes when the panel does.
                // i18n-ignore-next-line  Specialization.json ids
                window.SpecBadge.show(topTab === 'animals' ? 'Animal Husbandry' : 'Carpentry',
                    { el: this.container });
            }

            // Per-category item counts for the Buildables dropdown labels.
            const categories = getBuildCategories();
            const catCounts = {};
            let buildableCount = 0;
            for (const f of Object.values(Furniture)) {
                if (f.category) catCounts[f.category] = (catCounts[f.category] || 0) + 1;
                if (affordFn(f)) buildableCount++;
            }
            catCounts[BUILDABLE_SYMBOL] = buildableCount;

            // Counts shown on the top-level tab buttons.
            const tabCounts = {
                walls: wallAutotileKinds().length,
                terrain: terrainAutotileKinds().length,
                houses: Object.keys(getHouseCatalog()).length,
                features: Object.keys(getFeatureCatalog()).length,
                animals: Object.keys(getAnimalCatalog()).length,
                prefabs: Object.keys(getPrefabCatalog()).length
            };

            const query = (this.search || '').trim().toLowerCase();
            let items = [];
            if (topTab === 'buildables') {
                // A non-empty search filters by name across EVERY category; an
                // empty search falls back to the category selected in the
                // dropdown. The Buildable pseudo-category shows only affordable
                // pieces regardless of their folder category.
                for (const [id, f] of Object.entries(Furniture)) {
                    if (query) {
                        if (furnitureName(id, f).toLowerCase().includes(query)) items.push({ id, ...f });
                    } else if (this.category === BUILDABLE_SYMBOL) {
                        if (affordFn(f)) items.push({ id, ...f });
                    } else if (f.category === this.category) {
                        // A category is one flat list of pieces: there is no
                        // subcategory level to walk through.
                        items.push({ id, ...f });
                    }
                }
                // One card per recolour family, everywhere the grid is a real list
                // of pieces.
                items = collapseVariants(items);
                // In purchase mode the Buildable list is ordered by gold price
                // (cheapest first); everything else stays alphabetical.
                if (purchasing && this.category === BUILDABLE_SYMBOL && !query) {
                    items.sort((a, b) => getFurniturePrice(a) - getFurniturePrice(b));
                } else {
                    items.sort((a, b) => furnitureName(a.id, a).localeCompare(furnitureName(b.id, b)));
                }
            } else if (topTab === 'walls' || topTab === 'terrain') {
                // Kick off (once) the async tileset bitmap load and re-render
                // when it's ready, so the picker fills in as soon as it can.
                if (!this._tilesetSheetsReady) {
                    const slots = topTab === 'walls' ? [2, 3] : [0, 1];
                    ensureTilesetSheetsLoaded(slots, () => { this._tilesetSheetsReady = true; this.render(); });
                }
                const kinds = topTab === 'walls' ? wallAutotileKinds() : terrainAutotileKinds();
                const prefix = topTab === 'walls' ? 'wall:' : 'terrain:';
                for (const kind of kinds) {
                    const info = resolvePlaceable(prefix + kind);
                    if (info) items.push(info);
                }
                items.sort((a, b) => furnitureName(a.id, a).localeCompare(furnitureName(b.id, b)));
            } else if (topTab === 'houses') {
                for (const mapId of Object.keys(getHouseCatalog())) {
                    const info = resolvePlaceable('house:' + mapId);
                    if (info) items.push(info);
                }
                items.sort((a, b) => (a.__specialGoldPrice || 0) - (b.__specialGoldPrice || 0));
            } else if (topTab === 'features') {
                for (const name of Object.keys(getFeatureCatalog())) {
                    const info = resolvePlaceable('feature:' + name);
                    if (info) items.push(info);
                }
                items.sort((a, b) => furnitureName(a.id, a).localeCompare(furnitureName(b.id, b)));
            } else if (topTab === 'animals') {
                for (const id of Object.keys(getAnimalCatalog())) {
                    const info = resolvePlaceable(id);
                    if (info) items.push(info);
                }
                // Cheapest first, so a starting farm reads top-down.
                items.sort((a, b) => (a.__specialGoldPrice || 0) - (b.__specialGoldPrice || 0));
            } else if (topTab === 'prefabs') {
                for (const mapId of Object.keys(getPrefabCatalog())) {
                    const info = resolvePlaceable('prefab:' + mapId);
                    if (info) items.push(info);
                }
                items.sort((a, b) => (a.__specialGoldPrice || 0) - (b.__specialGoldPrice || 0));
            }

            // Cap the Buildable view: when free-building (or holding vast stock)
            // every piece is affordable, and rendering thousands of cards (each
            // with its own cost canvases) would freeze the panel. Show the first
            // slice and hint that Search/a category narrows further. Real
            // categories, searches and the other 4 tabs are already small
            // enough to render whole.
            const BUILDABLE_MAX = 300;
            let buildableTruncated = 0;
            if (topTab === 'buildables' && this.category === BUILDABLE_SYMBOL && !query && items.length > BUILDABLE_MAX) {
                buildableTruncated = items.length - BUILDABLE_MAX;
                items.length = BUILDABLE_MAX;
            }

            // Custom dropdown (a native <select> popup does not render reliably
            // over the WebGL game canvas in nw.js/Electron, so we build our own).
            // Only the Buildables tab uses it - the other 4 tabs are flat lists.
            let catBarHTML = '';
            // Escaped once, out of the markup, so the attribute value is not a
            // literal the scanner has to reason about.
            const searchValue = String(this.search || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); // i18n-ignore: HTML entity escaping
            // Collapsed until the handle is clicked; a live query keeps it open.
            const searchOpen = !!this.searchOpen || !!this.search;
            if (topTab === 'buildables') {
                // No dropdown: the folders are the gallery itself, and this bar
                // only says where in it the player stands and how to walk back.
                const currentCat = categories.find(c => c.symbol === this.category);
                const crumb = this.category === null
                    ? `<span class="fbuild-crumb">${T('Furniture.categoryLabel')}</span>`
                    : `<button class="fbuild-subback" type="button" title="${T('Furniture.tip.backToCategories')}">
                        ${T('Furniture.backToCategories')}</button>
                        <span class="fbuild-crumb">${currentCat ? currentCat.name : ''}</span>`;
                catBarHTML = `<div class="fbuild-catbar">
                    ${crumb}
                    ${searchOpen ? `<input class="fbuild-search" type="search" placeholder="${T('Furniture.searchPlaceholder')}"
                        value="${searchValue}">` : ''}
                    ${window.MenuSearchBar ? window.MenuSearchBar.toggleHTML('', searchOpen) : ''}
                </div>`;
            }

            // Materials strip - read from the real party inventory
            const matEntries = Object.keys(MATERIALS)
                .map(id => [id, getMaterialCount(id)])
                .filter(([, q]) => q > 0);
            let materialsHTML = '';
            if (matEntries.length === 0) {
                materialsHTML = `<span class="fbuild-mat-empty">${T('Furniture.noMaterials')}</span>`;
            } else {
                materialsHTML = matEntries.map(([id, q]) => {
                    const mat = getMaterialInfo(id);
                    return `<div class="fbuild-mat" title="${mat.name}" data-name="${mat.name}">
                        <canvas class="fbuild-mat-icon" data-icon="${mat.icon}" width="22" height="22"></canvas>
                        <span>${q}</span></div>`;
                }).join('');
            }

            // The Buildables tab is two levels deep and no more: the gallery of
            // folders, then the pieces of the folder that was picked. A live
            // search skips the gallery and searches every category at once.
            const showingCats = topTab === 'buildables' && this.category === null && !query;
            let subcatsHTML = '';
            if (showingCats) {
                // One card per folder, wearing the first piece filed under it.
                subcatsHTML = categories.map(c => {
                    const n = catCounts[c.symbol] || 0;
                    const coverId = c.symbol === BUILDABLE_SYMBOL ? null : folderCoverId(c.symbol);
                    const src = coverId ? furnitureImageSrc(coverId) : null;
                    return `<div class="fbuild-folder" data-cat="${c.symbol}">
                        <div class="fbuild-folder-img${src ? '' : ' noimg'}">
                            ${src ? `<img loading="lazy" src="${src}" onerror="this.style.display='none'; this.parentElement.classList.add('noimg');">` : ''}
                            ${placeholderIconHTML(28)}
                        </div>
                        <div class="fbuild-folder-name">${c.name}</div>
                        <div class="fbuild-folder-count">${n}</div>
                    </div>`;
                }).join('');
            }

            // Cards
            const armedId = this.scene._fbArmedId;
            let cardsHTML = '';
            if (items.length === 0) {
                const emptyMsg = topTab === 'walls' ? T('Furniture.empty.walls')
                    : topTab === 'terrain' ? T('Furniture.empty.terrain')
                    : topTab === 'houses' ? T('Furniture.empty.houses')
                    : topTab === 'features' ? T('Furniture.empty.features')
                    : topTab === 'animals' ? T('Furniture.empty.animals')
                    : topTab === 'prefabs' ? T('Furniture.empty.prefabs')
                    : query ? T('Furniture.empty.search')
                    : (this.category === BUILDABLE_SYMBOL
                        ? (purchasing
                            ? T('Furniture.empty.cannotAfford')
                            : T('Furniture.empty.cannotBuild'))
                        : T('Furniture.empty.category'));
                cardsHTML = `<div class="fbuild-empty">${emptyMsg}</div>`;
            } else {
                cardsHTML = items.map(item => {
                    const isMoneyOnly = item.__placeKind === 'animal';
                    const effectivePurchasing = purchasing || isMoneyOnly;
                    const imgSrc = furnitureImageSrc(item.__imageId || item.id);
                    const cost = getFurnitureCost(item);
                    const affordable = affordFn(item);
                    let costHTML = '';
                    if (free) {
                        costHTML = `<span class="fbuild-cost ok">${T('Furniture.freeBuild')}</span>`;
                    } else if (effectivePurchasing) {
                        const price = getFurniturePrice(item);
                        costHTML = `<span class="fbuild-cost ${affordable ? 'ok' : 'bad'}" title="${T('Furniture.tip.purchasePrice')}">${iconHTML(UI_ICONS.money, 14)}${formatEuros(price)}</span>`;
                    } else {
                        costHTML = Object.entries(cost).map(([mid, q]) => {
                            const mat = getMaterialInfo(mid);
                            const have = getMaterialCount(mid) >= q;
                            return `<span class="fbuild-cost ${have ? 'ok' : 'bad'}" title="${mat.name}">
                                <canvas class="fbuild-mat-icon" data-icon="${mat.icon}" width="16" height="16"></canvas>${q}</span>`;
                        }).join('');
                    }
                    const folderName = item.category ? titleCaseCategory(item.category) : T('Furniture.category.Misc');
                    const isArmed = item.id === armedId;
                    // Wall/Terrain pieces have no indexed Furniture image; show
                    // a real crop of the current tileset's own art instead.
                    const isAutotilePiece = item.__placeKind === 'wall' || item.__placeKind === 'terrain';
                    // The placeholder icon is always in the markup but stays
                    // hidden until the cell is marked 'noimg' (either up front,
                    // when there is no image at all, or by the img onerror).
                    let imgCellClass = 'fbuild-card-img';
                    let imgCellHTML;
                    if (item.__noPreview) {
                        // An authored map has no portrait of itself: the card is
                        // the name and the footprint, and the cell stays blank.
                        imgCellClass += ' noimg';
                        imgCellHTML = '';
                    } else if (isAutotilePiece) {
                        imgCellHTML = `<canvas class="fbuild-wt-preview" data-kind="${item.__autoKind}" width="48" height="48"></canvas>`;
                    } else if (isMoneyOnly) {
                        // Animals live on character sheets, not in the furniture
                        // image index, so their card draws the sheet cell itself.
                        imgCellHTML = `<canvas class="fbuild-animal-preview" data-sprite="${item.__animalSprite}"` + // i18n-ignore: canvas markup
                            ` data-stage="${item.__animalStage}" width="72" height="72"></canvas>`; // i18n-ignore: canvas markup
                    } else if (imgSrc) {
                        imgCellHTML = `<img loading="lazy" src="${imgSrc}" onerror="this.style.display='none'; this.parentElement.classList.add('noimg');">`
                            + placeholderIconHTML(32);
                    } else {
                        imgCellClass += ' noimg';
                        imgCellHTML = placeholderIconHTML(32);
                    }
                    const variants = item.__variantCount || 0;
                    return `<div class="fbuild-card ${affordable ? '' : 'unaffordable'} ${isArmed ? 'armed' : ''}" data-id="${item.id}"
                        ${item.__groupId ? `data-group="${item.__groupId}"` : ''} draggable="false"
                        title="${variants > 1 ? T('Furniture.tip.cycleVariants') : T('Furniture.tip.dragToPlace')}">
                        <div class="${imgCellClass}">
                            ${imgCellHTML}
                            ${isArmed ? `<span class="fbuild-card-armed-badge">${T('Furniture.placing')}</span>` : ''}
                            ${(!affordable && !free) ? `<span class="fbuild-card-lock" title="${T('Furniture.tip.cannotAfford')}">${iconHTML(UI_ICONS.blocked, 16)}</span>` : ''}
                            ${variants > 1 ? `<span class="fbuild-card-variants" title="${T('Furniture.tip.cycleVariants')}">${T('Furniture.variantCount', { i: item.__variantIndex || 1, n: variants })}</span>` : ''}
                        </div>
                        <div class="fbuild-card-name">${furnitureName(item.id, item)}</div>
                        <div class="fbuild-card-folder">${folderName}</div>
                        <div class="fbuild-card-meta">
                            <span class="fbuild-card-size">${item.width}×${item.height}</span>
                            <div class="fbuild-card-cost">${costHTML}</div>
                        </div>
                    </div>`;
                }).join('');
                if (buildableTruncated > 0) {
                    cardsHTML += `<div class="fbuild-empty">${T('Furniture.truncated', { shown: BUILDABLE_MAX, more: buildableTruncated })}</div>`;
                }
            }
            // The Town tab is not a picker: it is the founding charter, so it
            // takes the grid's place whole.
            if (topTab === 'town') cardsHTML = this.townPageHTML();

            // The selection column: what is in hand, read as a card. No key
            // names anywhere on it (ui_fixing rule 8), only its state.
            let asideHTML;
            const armed = armedId ? resolvePlaceable(armedId) : null;
            if (armed) {
                const armedSrc = furnitureImageSrc(armed.__imageId || armedId);
                const armedAfford = free || this.scene.isArmedAffordable();
                asideHTML = `<div class="fbuild-armed-card">
                    <div class="fbuild-armed-head">
                        <div class="fbuild-armed-thumb${armedSrc ? '' : ' noimg'}">
                            ${armedSrc
                                ? `<img src="${armedSrc}" onerror="this.style.display='none'; this.parentElement.classList.add('noimg');">${placeholderIconHTML(24)}`
                                : placeholderIconHTML(24)}
                        </div>
                        <div class="fbuild-armed-info">
                            <div class="fbuild-armed-name">${furnitureName(armedId, armed)}</div>
                            <div class="fbuild-armed-sub ${armedAfford ? 'ok' : 'bad'}">
                                ${armedAfford ? T('Furniture.status.ready') : T('Furniture.status.cannotAfford')}
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                asideHTML = `<div class="fbuild-armed-empty">${T('Furniture.status.idle')}</div>`;
            }

            const goldAmount = (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.gold() : 0;
            const tabsHTML = TOP_TABS.map(t => {
                const n = tabCounts[t.key];
                const countLabel = (t.key === 'buildables' || n == null) ? '' : `<span class="fbuild-toptab-count">${n}</span>`;
                return `<button class="fbuild-toptab-opt ${topTab === t.key ? 'active' : ''}" data-tab="${t.key}" type="button"><span>${T(t.nameKey)}</span>${countLabel}</button>`;
            }).join('');
            const materialsLabel = T('Furniture.materials');
            this.container.innerHTML = `
                <div class="fbuild-header">
                    <span class="fbuild-title">${iconHTML(UI_ICONS.hammer, 22)} ${T('Furniture.buildMode')}</span>
                    ${free ? `<span class="fbuild-free">${T('Furniture.freeBadge')}</span>` : ''}
                    <div class="fbuild-modeswitch" role="tablist">
                        <button class="fbuild-mode-opt ${purchasing ? 'active' : ''}" data-mode="purchase" type="button"
                            title="${T('Furniture.tip.purchase')}">${iconHTML(UI_ICONS.wallet, 16)} ${T('Furniture.mode.purchase')}</button>
                        <button class="fbuild-mode-opt ${!purchasing ? 'active' : ''}" data-mode="construct" type="button"
                            title="${T('Furniture.tip.construct')}">${iconHTML(UI_ICONS.hammer, 16)} ${T('Furniture.mode.construct')}</button>
                    </div>
                    <span class="fbuild-gold" title="${T('Furniture.tip.money')}">${iconHTML(UI_ICONS.money, 16)} ${formatEuros(goldAmount)}</span>
                    <span class="fbuild-header-spacer"></span>
                    <span class="fbuild-count" title="${T('Furniture.piecesShown')}">${items.length}</span>
                    <button class="fbuild-clear-all ${this._confirmClearArmed ? 'armed' : ''}"
                        title="${this._confirmClearArmed ? T('Furniture.tip.clearAllConfirm') : T('Furniture.tip.clearAll')}">
                        ${this._confirmClearArmed
                            ? `${iconHTML(UI_ICONS.warn, 16)} ${T('Furniture.confirmQ')}`
                            : iconHTML(UI_ICONS.demolish, 18)}
                    </button>
                    <button class="fbuild-close" title="${T('Furniture.closeEsc')}">\u2715</button>
                </div>
                <div class="fbuild-dock">
                    <div class="fbuild-rail" role="tablist">${tabsHTML}</div>
                    <div class="fbuild-right">
                        ${catBarHTML}
                        <div class="fbuild-grid${showingCats ? ' subcats' : ''}">${showingCats ? subcatsHTML : cardsHTML}</div>
                    </div>
                    <div class="fbuild-aside">
                        <div class="fbuild-section-label">${T('Furniture.selection')}</div>
                        ${asideHTML}
                        ${!purchasing ? `
                        <div class="fbuild-section-label">${materialsLabel}</div>
                        <div class="fbuild-materials">${materialsHTML}</div>
                        ` : ''}
                    </div>
                </div>
            `;

            // Draw all material icons
            this.container.querySelectorAll('.fbuild-mat-icon').forEach(c => {
                drawIconOnCanvasEl(Number(c.dataset.icon), c);
            });
            // Draw Wall/Terrain tile-art previews
            this.container.querySelectorAll('.fbuild-wt-preview').forEach(c => {
                drawAutotilePreviewOnCanvas(Number(c.dataset.kind), c);
            });
            // Draw livestock sprites (character-sheet cells)
            const ags = animalSystem();
            if (ags) {
                this.container.querySelectorAll('.fbuild-animal-preview').forEach(c => {
                    ags.drawSpriteOnCanvas(c, c.dataset.sprite, c.dataset.stage);
                });
            }

            // Custom hover tooltip showing each material's name. Appended after the
            // innerHTML rebuild so it survives this render, and positioned relative
            // to the fixed panel.
            const matTip = document.createElement('div');
            matTip.className = 'fbuild-mat-tip';
            this.container.appendChild(matTip);
            this.container.querySelectorAll('.fbuild-mat').forEach(el => {
                el.addEventListener('pointerenter', () => {
                    matTip.textContent = el.dataset.name || '';
                    const r = el.getBoundingClientRect();
                    const pr = this.container.getBoundingClientRect();
                    // A measured position is a custom property, not a style:
                    // the stylesheet still decides how the tip is drawn.
                    matTip.style.setProperty('--tip-x', (r.left - pr.left + r.width / 2) + 'px');
                    matTip.style.setProperty('--tip-y', (r.bottom - pr.top + 6) + 'px');
                    matTip.classList.add('show');
                });
                el.addEventListener('pointerleave', () => matTip.classList.remove('show'));
            });

            // Bind events. NOTE: 'click' events are unreliable over the WebGL game
            // canvas in this engine (see the card handler below), so every control
            // is driven by 'pointerdown' instead.
            this.container.querySelector('.fbuild-close').addEventListener('pointerdown', e => {
                e.stopPropagation();
                this.scene.closeFurnitureBuildMode();
            });
            // Delete All: first click arms a confirmation (auto-disarms after
            // 4s), second click while armed actually clears the map.
            const clearAllBtn = this.container.querySelector('.fbuild-clear-all');
            if (clearAllBtn) {
                clearAllBtn.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    if (this._confirmClearArmed) {
                        clearTimeout(this._confirmClearTimeout);
                        this._confirmClearArmed = false;
                        SoundManager.playUseItem();
                        this.scene.clearAllPlacements();
                    } else {
                        this._confirmClearArmed = true;
                        SoundManager.playBuzzer();
                        this.render();
                        this._confirmClearTimeout = setTimeout(() => {
                            this._confirmClearArmed = false;
                            this.render();
                        }, 4000);
                    }
                });
            }
            // Construct / Purchase mode switch.
            this.container.querySelectorAll('.fbuild-mode-opt').forEach(btn => {
                btn.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    const newMode = btn.dataset.mode === 'purchase' ? 'purchase' : 'construct';
                    if (this.scene._fbBuildMode === newMode) return;
                    this.scene._fbBuildMode = newMode;
                    // Affordability changes with the mode, so drop the on-map
                    // placement validity cache and re-check the armed piece.
                    this.scene._fbPlaceCacheKey = null;
                    SoundManager.playCursor();
                    this.render();
                });
            });
            // Top-level tabs (Buildables/Walls/Terrain/Houses/Features).
            this.container.querySelectorAll('.fbuild-toptab-opt').forEach(btn => {
                btn.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    const tab = btn.dataset.tab;
                    if ((this.topTab || 'buildables') === tab) return;
                    this.topTab = tab;
                    this.search = ''; // switching tabs clears an active search
                    this.searchOpen = false;
                    SoundManager.playCursor();
                    this.render();
                });
            });
            // The founding charter: the name is kept on the panel as it is
            // typed (a re-render would take the caret with it), and the button
            // reads it back. Keys are stopped so the engine never sees them.
            const townInput = this.container.querySelector('.fbuild-town-name');
            if (townInput) {
                townInput.addEventListener('pointerdown', e => { e.stopPropagation(); townInput.focus(); });
                townInput.addEventListener('input', () => { this.townName = townInput.value; });
                townInput.addEventListener('keydown', e => e.stopPropagation());
                townInput.addEventListener('keyup', e => e.stopPropagation());
            }
            const townButton = this.container.querySelector('.fbuild-town-found');
            if (townButton) {
                townButton.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    const result = window.TownFounding.found(this.townName);
                    if (result.ok) {
                        this.townName = '';
                        SoundManager.playOk();
                        window.ParchmentToast?.show?.(T('Towns.found.success', { name: result.name }));
                    } else {
                        SoundManager.playBuzzer();
                        window.ParchmentToast?.show?.(T('Towns.found.reason.' + result.reason,
                            { place: result.place || '' }));
                    }
                    this.render();
                });
            }
            // Folder cards: picking one opens that category's pieces.
            this.container.querySelectorAll('.fbuild-folder[data-cat]').forEach(el => {
                el.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    this.category = el.dataset.cat;
                    this.search = '';   // picking a category clears an active search
                    this.searchOpen = false;
                    SoundManager.playCursor();
                    this.render();
                });
            });
            // Search box: filters item names live. render() rebuilds the panel,
            // so we stash the caret position and re-focus the recreated input at
            // the end of render(). Key events are stopped so typed keys don't reach
            // RPG Maker's global input (arrows/space/backspace would otherwise be
            // consumed as game controls). Mouse focus over the canvas is unreliable,
            // so pointerdown force-focuses the field.
            // The handle: a click unfolds the field (and takes the caret with
            // it), a second click puts both the field and its query away. It is
            // wired by pointerdown like every other control on this panel, and
            // sits outside the card grid the pad walks.
            const searchToggle = this.container.querySelector('.fbuild-catbar .msb-toggle');
            if (searchToggle) {
                searchToggle.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    this.searchOpen = !this.searchOpen;
                    if (!this.searchOpen) this.search = '';
                    this._restoreSearchCaret = this.searchOpen ? 0 : null;
                    SoundManager.playCursor();
                    this.render();
                });
            }
            const searchInput = this.container.querySelector('.fbuild-search');
            if (searchInput) {
                ['keydown', 'keyup', 'keypress'].forEach(ev =>
                    searchInput.addEventListener(ev, e => e.stopPropagation()));
                searchInput.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    setTimeout(() => searchInput.focus(), 0);
                });
                searchInput.addEventListener('input', () => {
                    this.search = searchInput.value;
                    this._restoreSearchCaret = searchInput.selectionStart;
                    this.render();
                });
            }
            const subBack = this.container.querySelector('.fbuild-subback');
            if (subBack) {
                subBack.addEventListener('pointerdown', e => {
                    e.stopPropagation();
                    // Back out of a category returns to the folder gallery.
                    this.category = null;
                    this._selId = null;
                    SoundManager.playCancel();
                    this.render();
                });
            }
            this.container.querySelectorAll('.fbuild-card').forEach(card => {
                // Pressing a card arms its preview (even when unaffordable, so the
                // player can see the red ghost on the map) and begins a drag. The
                // scene's document pointerup handler drops it where released.
                card.addEventListener('pointerdown', e => {
                    // Note: do NOT preventDefault here. Cancelling pointerdown can
                    // suppress the compatibility mousemove events RPG Maker's
                    // TouchInput uses to track the cursor during the drag.
                    e.stopPropagation();
                    const id = card.dataset.id;
                    if (!resolvePlaceable(id)) return;
                    if (this.scene._fbArmedId !== id) {
                        SoundManager.playOk();
                        this.scene.armFurniture(id);
                    }
                    this.scene._fbDragging = true;
                });
            });

            // Re-apply the pad/keyboard selection ring after a re-render so it
            // survives category changes, placement refreshes, etc.
            if (this._selId) this.selectCardById(this._selId, false);

            // Restore focus + caret to the search box after an input-driven render
            // so the player can keep typing without the field losing focus.
            // While the field is open it always holds the caret: the panel is
            // rebuilt wholesale on every keystroke, and the map underneath is a
            // canvas that takes focus back the moment the field loses it, which
            // is why typing looked as though it did nothing.
            if (searchInput) {
                const pos = this._restoreSearchCaret != null
                    ? this._restoreSearchCaret : searchInput.value.length;
                searchInput.focus();
                try { searchInput.setSelectionRange(pos, pos); } catch (e) { /* type=search quirk */ }
                this._restoreSearchCaret = null;
            }

            this.applyArmedHighlight();
        }

        // ------- Pad / keyboard grid navigation -------

        getSelectedId() {
            return this._selId || null;
        }

        // Flat id list in the current tab's display order - used to cycle the
        // armed piece with L1/R1 or the scrollwheel while aiming on the map.
        getOrderedIds() {
            return Array.from(this.container.querySelectorAll('.fbuild-card')).map(c => c.dataset.id);
        }

        selectCardById(id, scroll) {
            this._selId = id;
            let el = null;
            this.container.querySelectorAll('.fbuild-card').forEach(c => {
                const on = c.dataset.id === id;
                c.classList.toggle('fbcursor', on);
                if (on) el = c;
            });
            if (scroll && el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        // Grid move by geometry so it works with whatever column count the
        // responsive layout settles on. Horizontal walks the flat order;
        // vertical jumps to the nearest card on the adjacent row.
        // The folder gallery walks with the same
        // keys as the piece grid, so a pad is never stranded on it.
        folderEls() {
            return Array.from(this.container.querySelectorAll('.fbuild-folder'));
        }

        moveFolderSelection(step) {
            const els = this.folderEls();
            if (!els.length) return;
            const cols = Math.max(1, Math.round(this.container.querySelector('.fbuild-grid').clientWidth
                / Math.max(1, els[0].offsetWidth)));
            const cur = els.findIndex(el => el.classList.contains('fbcursor'));
            const target = cur < 0 ? 0 : Math.max(0, Math.min(els.length - 1, cur + step));
            els.forEach(el => el.classList.remove('fbcursor'));
            const pick = els[target];
            pick.classList.add('fbcursor');
            pick.scrollIntoView({ block: 'nearest' });
            this._folderCols = cols;
            SoundManager.playCursor();
        }

        // OK on a highlighted folder walks into it. Returns true when it did.
        enterSelectedFolder() {
            const el = this.container.querySelector('.fbuild-folder.fbcursor')
                || this.container.querySelector('.fbuild-folder');
            if (!el) return false;
            if (el.dataset.cat) this.category = el.dataset.cat;
            else return false;
            SoundManager.playOk();
            this.render();
            return true;
        }

        moveSelection(dx, dy) {
            const folders = this.folderEls();
            if (folders.length) {
                const cols = this._folderCols || 4;
                this.moveFolderSelection(dx !== 0 ? dx : dy * cols);
                return;
            }
            const cards = Array.from(this.container.querySelectorAll('.fbuild-card'));
            if (!cards.length) return;
            let idx = cards.findIndex(c => c.dataset.id === this._selId);
            if (idx < 0) { this.selectCardById(cards[0].dataset.id, true); SoundManager.playCursor(); return; }
            if (dx !== 0) {
                const n = Math.max(0, Math.min(cards.length - 1, idx + dx));
                if (n !== idx) { this.selectCardById(cards[n].dataset.id, true); SoundManager.playCursor(); }
                return;
            }
            const cur = cards[idx].getBoundingClientRect();
            const curCx = cur.left + cur.width / 2;
            let best = null, bestScore = Infinity;
            for (const c of cards) {
                if (c === cards[idx]) continue;
                const r = c.getBoundingClientRect();
                if (dy > 0 && !(r.top > cur.top + 1)) continue;
                if (dy < 0 && !(r.top < cur.top - 1)) continue;
                const rowDist = Math.abs(r.top - cur.top);
                const colDist = Math.abs((r.left + r.width / 2) - curCx);
                const score = rowDist * 1000 + colDist; // nearest row first, then nearest column
                if (score < bestScore) { bestScore = score; best = c; }
            }
            if (best) { this.selectCardById(best.dataset.id, true); SoundManager.playCursor(); }
        }

        // Walk one recolour family's colourways. The card keeps its place in the
        // grid and stays selected, and a piece already armed from this family is
        // re-armed as the new colour so the ghost on the map follows the wheel.
        cycleVariant(groupId, dir) {
            const next = cycleGroupVariant(groupId, dir);
            if (!next) return false;
            const wasArmed = this._selId && this.scene._fbArmedId === this._selId;
            this._selId = next;
            SoundManager.playCursor();
            this.render();
            this.selectCardById(next, false);
            if (wasArmed) this.scene.armFurniture(next);
            return true;
        }

        // The family shown on the currently selected card, if it is one.
        selectedGroupId() {
            if (!this._selId) return null;
            const card = this.container.querySelector('.fbuild-card.fbcursor[data-group]')
                || this.container.querySelector(`.fbuild-card[data-id="${this._selId}"][data-group]`);
            const gid = card && card.dataset.group;
            return (gid && furnitureGroupMembers(gid).length > 1) ? gid : null;
        }

        // L1/R1 (or the Tab key) now cycles the top-level tabs (Buildables/
        // Walls/Terrain/Houses/Features) instead of the Buildables-only
        // Category dropdown, which stays mouse-driven.
        cycleCategory(dir) {
            const tabs = TOP_TABS.map(t => t.key);
            let i = tabs.indexOf(this.topTab || 'buildables');
            if (i < 0) i = 0;
            i = (i + dir + tabs.length) % tabs.length;
            this.topTab = tabs[i];
            this.search = '';
            this.searchOpen = false;
            SoundManager.playCursor();
            this.render();
            const first = this.container.querySelector('.fbuild-card');
            if (first) this.selectCardById(first.dataset.id, true);
        }

        applyArmedHighlight() {
            const armedId = this.scene._fbArmedId;
            // Toggle the armed state and the "Placing" badge per card. Done by
            // direct DOM tweaks (not a full re-render) so an in-progress drag from
            // the just-clicked card is never interrupted.
            this.container.querySelectorAll('.fbuild-card').forEach(card => {
                const on = card.dataset.id === armedId;
                card.classList.toggle('armed', on);
                const img = card.querySelector('.fbuild-card-img');
                let badge = img?.querySelector('.fbuild-card-armed-badge');
                if (on && img && !badge) {
                    badge = document.createElement('span');
                    badge.className = 'fbuild-card-armed-badge';
                    badge.textContent = T('Furniture.placing');
                    img.appendChild(badge);
                } else if (!on && badge) {
                    badge.remove();
                }
            });
            this.updateArmedFooter();
        }

        updateArmedFooter() {
            const aside = this.container.querySelector('.fbuild-aside');
            if (!aside) return;
            const old = aside.querySelector('.fbuild-armed-card, .fbuild-armed-empty');
            if (!old) return;
            const armedId = this.scene._fbArmedId;
            const armed = armedId ? resolvePlaceable(armedId) : null;
            const wrap = document.createElement('div');
            if (armed) {
                const armedSrc = furnitureImageSrc(armedId);
                const afford = isFreeBuild() || this.scene.isArmedAffordable();
                wrap.innerHTML = `<div class="fbuild-armed-card">
                    <div class="fbuild-armed-head">
                        <div class="fbuild-armed-thumb${armedSrc ? '' : ' noimg'}">
                            ${armedSrc
                                ? `<img src="${armedSrc}" onerror="this.style.display='none'; this.parentElement.classList.add('noimg');">${placeholderIconHTML(24)}`
                                : placeholderIconHTML(24)}
                        </div>
                        <div class="fbuild-armed-info">
                            <div class="fbuild-armed-name">${furnitureName(armedId, armed)}</div>
                            <div class="fbuild-armed-sub ${afford ? 'ok' : 'bad'}">
                                ${afford ? T('Furniture.status.ready')
                                    : (armed.__specialGoldPrice != null ? T('Furniture.status.noMoney') : T('Furniture.status.noMaterials'))}
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                wrap.innerHTML = `<div class="fbuild-armed-empty">${T('Furniture.status.idle')}</div>`;
            }
            old.replaceWith(wrap.firstElementChild);
        }

        setArmed() {
            this.applyArmedHighlight();
        }

        refresh() {
            this.render();
        }

        destroy() {
            clearTimeout(this._confirmClearTimeout);
            if (this._keyGuard) {
                window.removeEventListener('keydown', this._keyGuard, true);
                window.removeEventListener('keyup', this._keyGuard, true);
                window.removeEventListener('keypress', this._keyGuard, true);
                this._keyGuard = null;
            }
            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }
            this.container = null;
        }
    }

    //=============================================================================
    // Scene_Map Build Mode
    //=============================================================================

    Scene_Map.prototype.isFurnitureBuildMode = function () {
        return !!this._fbActive;
    };

    Scene_Map.prototype.openFurnitureBuildMode = function () {
        if (this._fbActive) return;
        // Respect the map's <BuildRights> tag: blocks the world map and any
        // <BuildRights: Disabled> map. Unowned <BuildRights: Owner> land opens
        // too, with the warning below and a bounty for whatever gets built.
        if (!canBuildOnCurrentMap()) {
            SoundManager.playBuzzer();
            return;
        }
        illegalBuildPending = 0;
        if (isIllegalBuildHere()) warnIllegalBuild();
        this._fbActive = true;
        // Build mode: 'purchase' (buy with gold, the default) or 'construct'
        // (spend materials). Persisted across builds within a session so the
        // last choice sticks.
        if (this._fbBuildMode !== 'construct') this._fbBuildMode = 'purchase';
        this._fbArmedId = null;
        this._fbPreview = null;
        this._fbOverPanel = false;
        this._fbDragging = false;
        // Held-button paint stroke: armed while a press that began on the map is
        // still held, _fbPaintTile is the last tile it acted on.
        this._fbPaintArmed = false;
        this._fbPaintTile = null;
        // Input model: 'mouse' preserves the original click/drag flow; 'pad'
        // (gamepad or keyboard) drives a virtual tile cursor and grid navigation.
        // The two swap automatically: moving the mouse re-enters 'mouse' mode, a
        // directional press enters 'pad' mode. _fbFocus only matters in pad mode
        // and tracks whether the picker panel or the map cursor is being driven.
        this._fbPointerMode = 'mouse';
        this._fbFocus = 'panel';
        this._fbCursorX = $gamePlayer.x;
        this._fbCursorY = $gamePlayer.y;
        this._fbLastTouchX = TouchInput.x;
        this._fbLastTouchY = TouchInput.y;
        $gameTemp.furnitureBuildActive = true;
        this.createBuildGridOverlay();
        this.createFurnitureCursorSprite();
        this._fbUI = new FurnitureBuildUI(this);

        // Drag-and-drop: releasing the pointer over the map drops the armed piece.
        this._fbOnPointerUp = () => {
            if (!this._fbActive || !this._fbDragging) return;
            this._fbDragging = false;
            if (this._fbOverPanel || !this._fbArmedId) return; // released back over panel: keep armed
            if (!resolvePlaceable(this._fbArmedId)) return;
            const x = $gameMap.canvasToMapX(TouchInput.x);
            const y = $gameMap.canvasToMapY(TouchInput.y);
            if (this.isFurnitureBuildPlacementValid(this._fbArmedId, x, y) && this.isArmedAffordable()) {
                this.placeArmedFurniture(x, y);
            } else {
                SoundManager.playBuzzer();
            }
        };
        document.addEventListener('pointerup', this._fbOnPointerUp);

        SoundManager.playOk();
    };

    Scene_Map.prototype.closeFurnitureBuildMode = function (silent) {
        if (!this._fbActive) return;
        this.disarmFurniture();
        if (this._fbUI) {
            this._fbUI.destroy();
            this._fbUI = null;
        }
        if (this._fbOnPointerUp) {
            document.removeEventListener('pointerup', this._fbOnPointerUp);
            this._fbOnPointerUp = null;
        }
        this.removeBuildGridOverlay();
        this.removeFurnitureCursorSprite();
        this._fbActive = false;
        this._fbOverPanel = false;
        this._fbDragging = false;
        $gameTemp.furnitureBuildActive = false;
        // Everything raised on somebody else's land this session is reported now,
        // as one charge.
        flushIllegalBuild();
        if (!silent) SoundManager.playCancel();
    };

    Scene_Map.prototype.armFurniture = function (id) {
        if (this._fbArmedId === id) {
            this.disarmFurniture();
            return;
        }
        this.disarmFurniture();
        const info = resolvePlaceable(id);
        if (!info) return;
        this._fbArmedId = id;
        this._fbArmedKind = info.__placeKind || 'furniture';
        this._fbPreview = new Sprite_FurniturePlacement(id);
        if (this._spriteset && this._spriteset._tilemap) {
            this._spriteset._tilemap.addChild(this._fbPreview);
        }
        // Arming hands control to the map so a pad/keyboard player can aim and
        // place. When armed from the pad, seed the cursor near the player so the
        // ghost appears on-screen rather than wherever the mouse last sat.
        this._fbFocus = 'map';
        if (this._fbPointerMode === 'pad') {
            this._fbCursorX = $gamePlayer.x;
            this._fbCursorY = $gamePlayer.y;
            this.scrollToFurnitureCursor();
        }
        if (this._fbUI) this._fbUI.setArmed();
    };

    Scene_Map.prototype.disarmFurniture = function () {
        if (this._fbPreview) {
            if (this._spriteset && this._spriteset._tilemap) {
                this._spriteset._tilemap.removeChild(this._fbPreview);
            }
            this._fbPreview = null;
        }
        this._fbArmedId = null;
        this._fbArmedKind = null;
        if (this._fbUI) this._fbUI.setArmed();
    };

    // Swap the piece being placed to the previous/next one in the current tab
    // without leaving placement mode. Driven by L1/R1 or the scrollwheel so the
    // player can browse pieces while keeping the ghost on the map.
    Scene_Map.prototype.cycleArmedFurniture = function (dir) {
        if (!this._fbActive || !this._fbUI || !this._fbArmedId) return;
        const ids = this._fbUI.getOrderedIds();
        if (ids.length < 2) return;
        let idx = ids.indexOf(this._fbArmedId);
        if (idx < 0) idx = 0;
        const nextId = ids[(idx + dir + ids.length) % ids.length];
        if (!nextId || nextId === this._fbArmedId || !resolvePlaceable(nextId)) return;
        // Preserve the current aim: armFurniture would otherwise re-seed the pad
        // cursor to the player and reset focus to the picker.
        const cx = this._fbCursorX, cy = this._fbCursorY, focus = this._fbFocus;
        SoundManager.playCursor();
        this.armFurniture(nextId);
        this._fbCursorX = cx; this._fbCursorY = cy; this._fbFocus = focus;
        this._fbUI.selectCardById(nextId, true);
    };

    Scene_Map.prototype.createBuildGridOverlay = function () {
        const width = $gameMap.width() * TILE_SIZE;
        const height = $gameMap.height() * TILE_SIZE;
        this._fbGrid = new Sprite();
        this._fbGrid.bitmap = new Bitmap(width, height);
        this._fbGrid.opacity = Math.min(GRID_OPACITY, 90);
        // z must be strictly above the tilemap's lower layer (z=0), otherwise the
        // grid ties with the ground on z and the sort falls back to y - once the
        // map scrolls down (displayY>0) the grid's y goes negative, sorting it
        // BEHIND the ground tiles and making it vanish. A small positive z keeps
        // it drawn over the floor at all times, still below furniture/characters.
        this._fbGrid.z = 0.5;
        // Grid lines tint to the active theme (sprite opacity keeps them subtle).
        const gridColor = readThemeColor('--accent-blue-gray-light', '#ffffff');
        for (let x = 0; x <= $gameMap.width(); x++) {
            this._fbGrid.bitmap.fillRect(x * TILE_SIZE, 0, 1, height, gridColor);
        }
        for (let y = 0; y <= $gameMap.height(); y++) {
            this._fbGrid.bitmap.fillRect(0, y * TILE_SIZE, width, 1, gridColor);
        }
        if (this._spriteset && this._spriteset._tilemap) {
            this._spriteset._tilemap.addChild(this._fbGrid);
        }
    };

    Scene_Map.prototype.updateBuildGridOverlay = function () {
        if (!this._fbGrid) return;
        this._fbGrid.x = -($gameMap.displayX() * TILE_SIZE);
        this._fbGrid.y = -($gameMap.displayY() * TILE_SIZE);
    };

    Scene_Map.prototype.removeBuildGridOverlay = function () {
        if (this._fbGrid) {
            if (this._spriteset && this._spriteset._tilemap) {
                this._spriteset._tilemap.removeChild(this._fbGrid);
            }
            this._fbGrid = null;
        }
    };

    Scene_Map.prototype.isFurnitureBuildPlacementValid = function (id, x, y) {
        const info = resolvePlaceable(id);
        if (!info) return false;
        if (info.__placeKind === 'wall' || info.__placeKind === 'terrain' || info.__placeKind === 'feature') {
            return canPlaceTileAt(x, y, info.__placeKind);
        }
        if (info.__placeKind === 'door') return canPlaceDoorAt(x, y);
        if (info.__placeKind === 'prefab') return canPlacePrefabAt(x, y, info);
        if (info.__placeKind === 'animal') {
            const ags = animalSystem();
            return !!ags && ags.canPlaceAnimalAt(x, y);
        }
        return canPlaceFurnitureAt(x, y, info, id);
    };

    // Mode-aware armed-piece affordability. Wall/Terrain/Feature tiles are
    // always material-cost (the Construct/Purchase toggle never applies to
    // them); house doors carry BOTH a material cost and a gold price, exactly
    // like ordinary furniture, so canObtainFurniture's existing mode-aware
    // logic already handles them correctly.
    Scene_Map.prototype.isArmedAffordable = function () {
        const info = resolvePlaceable(this._fbArmedId);
        if (!info) return false;
        if (isFreeBuild()) return true;
        return canObtainFurniture(info);
    };

    // A paint stroke fires once per tile crossed, which would machine-gun the
    // confirm SE. Collapse repeats to one blip every few frames; a single click
    // is always far enough apart to play normally.
    let fbLastBuildSoundAt = -999;
    function fbPlayBuildSound(play) {
        const now = Graphics.frameCount;
        if (now - fbLastBuildSoundAt < 6) return;
        fbLastBuildSoundAt = now;
        play();
    }

    Scene_Map.prototype.placeArmedFurniture = function (x, y) {
        const id = this._fbArmedId;
        const info = resolvePlaceable(id);
        if (!info) return;
        if (info.__placeKind === 'wall' || info.__placeKind === 'terrain' || info.__placeKind === 'feature') {
            this.placeArmedTile(x, y, info);
            return;
        }
        if (info.__placeKind === 'door') {
            this.placeArmedDoor(x, y, info);
            return;
        }
        if (info.__placeKind === 'prefab') {
            this.placeArmedPrefab(x, y, info);
            return;
        }
        if (info.__placeKind === 'animal') {
            this.placeArmedAnimal(x, y, info);
            return;
        }
        const f = info;
        if (!canObtainFurniture(f)) {
            warnCannotAfford(f);
            return;
        }
        payForFurniture(f);
        chargeIllegalBuild(f);
        const flipped = this._fbPreview ? this._fbPreview.getFlipped() : false;
        const placed = $gameSystem.placeFurniture(furnitureMapKey(), id, x, y, flipped);
        if (this._spriteset) this._spriteset.addFurnitureSprite(placed);
        // What the party built, in its own diary (Diary.js). Only what the
        // PLAYER puts up: the seeded furnishing of a procedural interior goes
        // through placeFurniture too and is nobody's doing.
        if (window.Diary) window.Diary.onBuilt(furnitureName(id, f));
        // Placed set + materials/gold changed: force the build-mode validity recompute.
        this._fbPlaceCacheKey = null;
        fbPlayBuildSound(() => SoundManager.playOk());
        // If the player can no longer afford another copy, disarm.
        if (!canObtainFurniture(f)) {
            this.disarmFurniture();
        }
        if (this._fbUI) this._fbUI.refresh();
    };

    // Places a wall/terrain autotile or a tileset feature at (x,y): pays its
    // material cost or purchase price, writes the tile straight into the map data, then (for
    // autotiles) blends it and its neighbours to the correct connected shape.
    Scene_Map.prototype.placeArmedTile = function (x, y, info) {
        if (!canPlaceTileAt(x, y, info.__placeKind)) { SoundManager.playBuzzer(); return; }
        // A ceiling is never placed without a wall under it: either one is
        // already there, or there is a tile below to build its face on.
        if (ceilingSideKind(info.__autoKind) >= 0 &&
            !hasWallUnder(x, y) &&
            !($gameMap && $gameMap.isValid(x, y + 1))) {
            SoundManager.playBuzzer(); return;
        }
        if (!canObtainFurniture(info)) { warnCannotAfford(info); return; }
        payForFurniture(info);
        chargeIllegalBuild(info);
        const mapKey = furnitureMapKey();
        // Wall <-> Terrain override: replace whatever Wall/Terrain tile was
        // already here (refunding it), instead of stacking on top of it.
        const existingRec = findPlacedTileRecordAt(x, y);
        if (existingRec && (existingRec.kind === 'wall' || existingRec.kind === 'terrain')) {
            $gameSystem.removePlacedTile(mapKey, existingRec.id);
            // Painting over a tile is a swap, not a dismantle: refund it, but
            // don't raise a popup for every stroke of a sweep.
            refundTileCost(existingRec.cost, {});
        }
        const isTileFeature = info.__placeKind === 'feature';
        const baseTileId = isTileFeature ? info.__tileId : Tilemap.makeAutotileId(info.__autoKind, 0);
        const rec = $gameSystem.placeMapTile(mapKey, {
            kind: info.__placeKind, x, y, tileId: baseTileId,
            layer: PLACED_TILE_LAYER, autoKind: info.__autoKind, name: info.name, cost: getFurnitureCost(info)
        });
        writeMapDataTile(x, y, PLACED_TILE_LAYER, baseTileId);
        if (isTileFeature) {
            if ($gameMap) $gameMap.requestRefresh();
        } else {
            if (!hasWallUnder(x, y)) placeCeilingFace(mapKey, rec, x, y, info.__autoKind);
            refreshAutotileBlendAround(x, y);
        }
        this._fbPlaceCacheKey = null;
        fbPlayBuildSound(() => SoundManager.playOk());
        if (!canObtainFurniture(info)) {
            this.disarmFurniture();
        }
        if (this._fbUI) this._fbUI.refresh();
    };

    // Buys a house-door entrance: pays gold, spawns the invisible trigger
    // event + decorative marker sprite, and marks the entrance pre-owned so
    // its interior opens with build rights already free.
    Scene_Map.prototype.placeArmedDoor = function (x, y, info) {
        if (!canPlaceDoorAt(x, y)) { SoundManager.playBuzzer(); return; }
        // Dual cost, same as ordinary furniture: materials in Construct mode,
        // gold in Purchase mode.
        if (!canObtainFurniture(info)) { warnCannotAfford(info); return; }
        payForFurniture(info);
        chargeIllegalBuild(info);
        const mapKey = furnitureMapKey();
        const rec = $gameSystem.placeMapTile(mapKey, {
            kind: 'door', x, y,
            poolName: info.__poolName, houseMapId: info.__houseMapId,
            doorType: info.__doorType, name: info.name
        });
        spawnDoorEventFromRecord(rec);
        if (this._spriteset) addDoorMarkerSprite(this._spriteset, rec);
        if (window.ProceduralHouseSystem && typeof window.ProceduralHouseSystem.markEntranceOwned === 'function') {
            window.ProceduralHouseSystem.markEntranceOwned($gameMap.mapId(), x, y);
        }
        this.disarmFurniture();
        SoundManager.playOk();
        if (this._fbUI) this._fbUI.refresh();
    };

    // Stands a whole authored prefab on the square: pays for it, remembers it
    // against this world coordinate and writes it into the tile data at once.
    // The stored record is stamped again on every later load, so the piece is
    // generated with the land from now on.
    Scene_Map.prototype.placeArmedPrefab = function (x, y, info) {
        if (!canPlacePrefabAt(x, y, info)) { SoundManager.playBuzzer(); return; }
        if (!canObtainFurniture(info)) { warnCannotAfford(info); return; }
        payForFurniture(info);
        chargeIllegalBuild(info);
        const rec = $gameSystem.placeMapTile(furnitureMapKey(), {
            kind: 'prefab', x, y, prefabMapId: info.__prefabMapId,
            width: info.width, height: info.height, name: info.name,
            cost: getFurnitureCost(info)
        });
        stampPrefabRecord(rec);
        if ($gameMap) $gameMap.requestRefresh();
        if (window.Diary) window.Diary.onBuilt(info.name);
        this._fbPlaceCacheKey = null;
        this.disarmFurniture();
        SoundManager.playOk();
        if (this._fbUI) this._fbUI.refresh();
    };

    // Buys a live animal and stands it on the tile. Payment is always money
    // (never materials) and ownership is handed to AnimalGrowthSystem, which
    // stores it against the current map key so it is still there next visit -
    // on ordinary maps and at a procedural world coordinate alike. Selling it
    // again, collecting its produce or turning it into a pet all happen from
    // the Assets menu.
    Scene_Map.prototype.placeArmedAnimal = function (x, y, info) {
        const ags = animalSystem();
        if (!ags || !ags.canPlaceAnimalAt(x, y)) { SoundManager.playBuzzer(); return; }
        if (!isFreeBuild() && !canPurchaseFurniture(info)) { warnCannotAfford(info); return; }
        if (!isFreeBuild() && $gameParty) $gameParty.loseGold(getFurniturePrice(info));
        const rec = ags.placeAnimal(info.__animalId, info.__animalStage, x, y);
        if (!rec) { SoundManager.playBuzzer(); return; }
        chargeIllegalBuild(info);
        this._fbPlaceCacheKey = null;
        fbPlayBuildSound(() => SoundManager.playShop());
        // Out of money for another one: put the piece down.
        if (!isFreeBuild() && !canPurchaseFurniture(info)) this.disarmFurniture();
        if (this._fbUI) this._fbUI.refresh();
    };

    // Fallback used by removeFurnitureAtTile when no placed FURNITURE occupies
    // the clicked tile: removes a placed wall/terrain/feature tile there
    // instead (house doors are bought, not removable this way).
    Scene_Map.prototype.removePlacedTileAtXY = function (tx, ty) {
        const mapKey = furnitureMapKey();
        const list = $gameSystem.getMapTiles(mapKey);
        const rec = list.find(t => t.x === tx && t.y === ty && t.kind !== 'door');
        if (!rec) return false;
        $gameSystem.removePlacedTile(mapKey, rec.id);
        clearMapDataTile(tx, ty, rec.layer != null ? rec.layer : PLACED_TILE_LAYER);
        // The wall face auto-built under a ceiling belongs to it: pulling the
        // ceiling down takes its face too, rather than leaving a lone slice of
        // wall standing with nothing on top.
        const face = list.find(t => t.skirtOf != null && t.skirtOf === rec.id);
        if (face) {
            $gameSystem.removePlacedTile(mapKey, face.id);
            clearMapDataTile(face.x, face.y, face.layer != null ? face.layer : PLACED_TILE_LAYER);
            refreshAutotileBlendAround(face.x, face.y);
        }
        if (rec.kind === 'wall' || rec.kind === 'terrain') {
            refreshAutotileBlendAround(tx, ty);
        } else if ($gameMap) {
            $gameMap.requestRefresh();
        }
        refundTileCost(rec.cost);
        this._fbPlaceCacheKey = null;
        fbPlayBuildSound(() => SoundManager.playUseItem());
        if (this._fbUI) this._fbUI.refresh();
        return true;
    };

    // Deletes every furniture piece, wall, terrain tile, feature and door
    // built on the current map (via this system), refunding materials for
    // each - the "Delete All" panel button.
    Scene_Map.prototype.clearAllPlacements = function () {
        const mapKey = furnitureMapKey();
        // Everything torn down here is reported in a single popup at the end,
        // rather than one per piece.
        const pool = {};

        const furnitureList = $gameSystem.getMapFurniture(mapKey).slice();
        for (const p of furnitureList) {
            const f = Furniture[p.furnitureId];
            $gameSystem.removePlacedFurniture(mapKey, p.id);
            if (this._spriteset) this._spriteset.removeFurnitureSprite(p.id);
            if (f) refundFurnitureMaterials(f, pool);
        }

        const tileList = $gameSystem.getMapTiles(mapKey).slice();
        for (const rec of tileList) {
            $gameSystem.removePlacedTile(mapKey, rec.id);
            if (rec.kind === 'door') {
                const eventId = $gameMap.eventIdXy(rec.x, rec.y);
                if (eventId > 0) {
                    const ev = $gameMap.event(eventId);
                    if (ev) ev.erase();
                }
                const entry = getHouseCatalog()[rec.houseMapId];
                if (entry) refundTileCost(entry.materialCost, pool);
            } else {
                clearMapDataTile(rec.x, rec.y, rec.layer != null ? rec.layer : PLACED_TILE_LAYER);
                refundTileCost(rec.cost, pool);
            }
        }
        announceRefund(pool);
        if (this._spriteset && this._spriteset._doorMarkerSprites) {
            for (const s of this._spriteset._doorMarkerSprites) {
                if (this._spriteset._tilemap) this._spriteset._tilemap.removeChild(s);
            }
            this._spriteset._doorMarkerSprites = [];
        }

        if ($gameMap) $gameMap.requestRefresh();
        this._fbPlaceCacheKey = null;
        SoundManager.playUseItem();
        if (this._fbUI) this._fbUI.refresh();
    };

    Scene_Map.prototype.removeFurnitureAtTile = function (tx, ty) {
        const mapId = furnitureMapKey();
        const list = $gameSystem.getMapFurniture(mapId);
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            const f = Furniture[p.furnitureId];
            if (!f) continue;
            if (tx >= p.x && tx < p.x + f.width && ty >= p.y && ty < p.y + f.height) {
                $gameSystem.removePlacedFurniture(mapId, p.id);
                if (this._spriteset) this._spriteset.removeFurnitureSprite(p.id);
                refundFurnitureMaterials(f);
                if (window.Diary) window.Diary.onDismantled(furnitureName(p.furnitureId, f));
                // Placed set + materials changed: force the validity recompute.
                this._fbPlaceCacheKey = null;
                fbPlayBuildSound(() => SoundManager.playUseItem());
                if (this._fbUI) this._fbUI.refresh();
                return true;
            }
        }
        return this.removePlacedTileAtXY(tx, ty);
    };

    // True when any movement key/stick is pressed this frame (keyboard arrows,
    // WASD via the global keyMapper, or a gamepad d-pad/stick).
    function fbDirectionPressed() {
        return Input.isRepeated('up') || Input.isRepeated('down') ||
               Input.isRepeated('left') || Input.isRepeated('right');
    }

    Scene_Map.prototype.createFurnitureCursorSprite = function () {
        // A one-tile highlight that marks the pad/keyboard cursor when no piece
        // is armed (removal mode); while a piece is armed the ghost preview marks
        // the spot instead, so this stays hidden then.
        const s = new Sprite();
        const b = new Bitmap(TILE_SIZE, TILE_SIZE);
        const accent = readThemeColor('--accent-badge-yellow', '#ffd84d');
        b.fillRect(0, 0, TILE_SIZE, TILE_SIZE, themeRgba('--accent-badge-yellow', 0.16, '#ffd84d'));
        b.strokeRect(0, 0, TILE_SIZE, TILE_SIZE, accent, 2);
        s.bitmap = b;
        s.z = 8;
        s.visible = false;
        this._fbCursorSprite = s;
        if (this._spriteset && this._spriteset._tilemap) {
            this._spriteset._tilemap.addChild(s);
        }
    };

    Scene_Map.prototype.removeFurnitureCursorSprite = function () {
        if (this._fbCursorSprite) {
            if (this._spriteset && this._spriteset._tilemap) {
                this._spriteset._tilemap.removeChild(this._fbCursorSprite);
            }
            this._fbCursorSprite = null;
        }
    };

    Scene_Map.prototype.updateFurnitureCursorSprite = function () {
        const s = this._fbCursorSprite;
        if (!s) return;
        const show = this._fbPointerMode === 'pad' && this._fbFocus === 'map' && !this._fbArmedId;
        s.visible = show;
        if (show) {
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            s.x = (this._fbCursorX - $gameMap.displayX()) * tw;
            s.y = (this._fbCursorY - $gameMap.displayY()) * th;
        }
    };

    // Scroll the map so the virtual cursor stays comfortably on-screen.
    Scene_Map.prototype.scrollToFurnitureCursor = function () {
        const margin = 2;
        const stx = $gameMap.screenTileX();
        const sty = $gameMap.screenTileY();
        let dx = $gameMap.displayX();
        let dy = $gameMap.displayY();
        const cx = this._fbCursorX;
        const cy = this._fbCursorY;
        if (cx < dx + margin) dx = cx - margin;
        else if (cx > dx + stx - 1 - margin) dx = cx - stx + 1 + margin;
        if (cy < dy + margin) dy = cy - margin;
        else if (cy > dy + sty - 1 - margin) dy = cy - sty + 1 + margin;
        if (!$gameMap.isLoopHorizontal()) dx = dx.clamp(0, Math.max(0, $gameMap.width() - stx));
        if (!$gameMap.isLoopVertical()) dy = dy.clamp(0, Math.max(0, $gameMap.height() - sty));
        $gameMap.setDisplayPos(dx, dy);
    };

    Scene_Map.prototype.moveFurnitureCursor = function (dx, dy) {
        this._fbCursorX = (this._fbCursorX + dx).clamp(0, $gameMap.width() - 1);
        this._fbCursorY = (this._fbCursorY + dy).clamp(0, $gameMap.height() - 1);
        this.scrollToFurnitureCursor();
        SoundManager.playCursor();
    };

    // Move the on-map cursor with the d-pad/arrows (pad mode, map focus).
    Scene_Map.prototype.updateFurnitureCursorNav = function () {
        if (Input.isRepeated('left')) this.moveFurnitureCursor(-1, 0);
        else if (Input.isRepeated('right')) this.moveFurnitureCursor(1, 0);
        else if (Input.isRepeated('up')) this.moveFurnitureCursor(0, -1);
        else if (Input.isRepeated('down')) this.moveFurnitureCursor(0, 1);
    };

    // Navigate the picker grid with the d-pad/arrows, switch tabs with the
    // shoulder buttons (PageUp/PageDown), and arm the highlighted piece with OK.
    // Returns true when this frame armed a piece, so the caller can stop before
    // the placement code re-reads the same OK press and instantly drops it.
    Scene_Map.prototype.updateFurniturePanelNav = function () {
        if (!this._fbUI) return false;
        // L1/R1 walk the top-level tabs, EXCEPT while the highlighted card stands
        // for a recolour family: there the same buttons flick through that
        // family's colourways, which is what the player expects the shoulder
        // buttons to do when a card is visibly showing "1/7". Tab always switches
        // tabs, so the tab row is never unreachable.
        const variantGroup = this._fbUI.selectedGroupId();
        if (variantGroup && Input.isTriggered('pagedown')) { this._fbUI.cycleVariant(variantGroup, 1); return false; }
        if (variantGroup && Input.isTriggered('pageup'))   { this._fbUI.cycleVariant(variantGroup, -1); return false; }
        if (Input.isTriggered('pagedown')) { this._fbUI.cycleCategory(1); return false; }
        if (Input.isTriggered('pageup'))   { this._fbUI.cycleCategory(-1); return false; }
        if (Input.isTriggered('tab'))      { this._fbUI.cycleCategory(1); return false; }
        if (Input.isRepeated('left'))       this._fbUI.moveSelection(-1, 0);
        else if (Input.isRepeated('right')) this._fbUI.moveSelection(1, 0);
        else if (Input.isRepeated('up'))    this._fbUI.moveSelection(0, -1);
        else if (Input.isRepeated('down'))  this._fbUI.moveSelection(0, 1);
        if (Input.isTriggered('ok')) {
            // On the folder gallery OK walks in rather than arming anything.
            if (this._fbUI.folderEls().length) return this._fbUI.enterSelectedFolder();
            const id = this._fbUI.getSelectedId();
            if (id && resolvePlaceable(id)) {
                SoundManager.playOk();
                this.armFurniture(id); // hands control to the map cursor
                return true;
            }
        }
        return false;
    };

    // Cancel walks back one level at a time: place -> remove -> picker -> close.
    Scene_Map.prototype.handleFurnitureBuildCancel = function () {
        if (this._fbPointerMode === 'pad' && this._fbFocus === 'map') {
            if (this._fbArmedId) {
                this.disarmFurniture();      // drop to removal mode, stay on map
                this._fbFocus = 'map';
            } else {
                this._fbFocus = 'panel';     // back to the picker
            }
            SoundManager.playCancel();
            return;
        }
        if (this._fbArmedId) {
            this.disarmFurniture();
            SoundManager.playCancel();
        } else {
            this.closeFurnitureBuildMode();
        }
    };

    Scene_Map.prototype.updateFurnitureBuildMode = function () {
        if (!this._fbActive) return;

        this.updateBuildGridOverlay();

        // Moving the physical mouse re-enters mouse mode.
        if (TouchInput.x !== this._fbLastTouchX || TouchInput.y !== this._fbLastTouchY) {
            this._fbLastTouchX = TouchInput.x;
            this._fbLastTouchY = TouchInput.y;
            this._fbPointerMode = 'mouse';
        }

        // A directional press enters pad mode. Seed the cursor from the mouse
        // tile so the handoff is seamless, and pick the focus from arm state.
        if (this._fbPointerMode !== 'pad' && fbDirectionPressed()) {
            this._fbPointerMode = 'pad';
            this._fbFocus = this._fbArmedId ? 'map' : 'panel';
            this._fbCursorX = $gameMap.canvasToMapX(TouchInput.x).clamp(0, $gameMap.width() - 1);
            this._fbCursorY = $gameMap.canvasToMapY(TouchInput.y).clamp(0, $gameMap.height() - 1);
        }

        // Right-click is always a mouse cancel (disarm, else close).
        if (TouchInput.isCancelled()) {
            this._fbPointerMode = 'mouse';
            if (this._fbArmedId) { this.disarmFurniture(); SoundManager.playCancel(); }
            else this.closeFurnitureBuildMode();
            return;
        }
        // Cancel steps back out of a category first, so the pad can leave the
        // gallery without having to reach the Back button with the mouse.
        if (Input.isTriggered('cancel') && this._fbUI && this._fbFocus === 'panel'
            && this._fbUI.category) {
            this._fbUI.category = null;
            this._fbUI._selId = null;
            SoundManager.playCancel();
            this._fbUI.render();
            return;
        }
        if (Input.isTriggered('cancel')) {
            this.handleFurnitureBuildCancel();
            return;
        }

        const usePad = this._fbPointerMode === 'pad';

        // Drive grid navigation (panel focus) or the map cursor (map focus).
        if (usePad) {
            if (this._fbFocus === 'panel') {
                // Arming consumes this frame's OK so it doesn't also place.
                if (this.updateFurniturePanelNav()) {
                    this.updateFurnitureCursorSprite();
                    return;
                }
            } else {
                this.updateFurnitureCursorNav();
            }
        }

        this.updateFurnitureCursorSprite();

        // overPanel only blocks placement when the mouse is what is aiming.
        const overPanel = !usePad && this._fbOverPanel;

        if (this._fbArmedId && this._fbPreview) {
            // L1/R1 (pageup/pagedown) or the scrollwheel swap the piece being
            // placed to the previous/next one in the current tab.
            if (Input.isTriggered('pagedown')) this.cycleArmedFurniture(1);
            else if (Input.isTriggered('pageup')) this.cycleArmedFurniture(-1);
            else if (!this._fbOverPanel) {
                const wy = TouchInput.wheelY;
                if (wy < 0) this.cycleArmedFurniture(-1);
                else if (wy > 0) this.cycleArmedFurniture(1);
            }

            if (Input.isTriggered('shift')) this._fbPreview.flip();

            let x, y;
            if (usePad && this._fbFocus === 'map') {
                x = this._fbCursorX;
                y = this._fbCursorY;
            } else {
                x = $gameMap.canvasToMapX(TouchInput.x);
                y = $gameMap.canvasToMapY(TouchInput.y);
            }
            this._fbPreview.visible = !overPanel;
            this._fbPreview.setTile(x, y);
            // Preview is green only when the tile is valid AND affordable; an
            // unaffordable piece still follows the cursor but stays red.
            // canPlaceFurnitureAt (footprint × terrain + O(placed) overlap) and
            // canAffordFurniture only change when the cursor tile, flip state or
            // armed piece changes (and on place/remove, which reset the cache
            // key), so recompute only then.
            const flipped = this._fbPreview.getFlipped();
            const placeCacheKey = this._fbArmedId + '|' + x + '|' + y + '|' + (flipped ? 1 : 0);
            if (placeCacheKey !== this._fbPlaceCacheKey) {
                this._fbPlaceCacheKey = placeCacheKey;
                this._fbPlaceable  = this.isFurnitureBuildPlacementValid(this._fbArmedId, x, y);
                this._fbAffordable = this.isArmedAffordable();
            }
            const placeable  = this._fbPlaceable;
            const affordable = this._fbAffordable;
            this._fbPreview.setValid(placeable && affordable);

            let okPressed;
            if (usePad) {
                okPressed = this._fbFocus === 'map' && Input.isTriggered('ok');
            } else {
                okPressed = !overPanel && (TouchInput.isTriggered() || Input.isTriggered('ok'));
            }
            // Holding the button and sweeping paints a run of pieces, so walls,
            // fences and floor tiles go down in one stroke instead of one click
            // per tile. Only a stroke that STARTED on the map paints, otherwise
            // dragging a piece out of the picker would smear it across the map.
            const painted = this.updateFurniturePaintStroke(okPressed, usePad, x, y);
            if (okPressed) {
                if (placeable && affordable) this.placeArmedFurniture(x, y);
                // A stroke crossing a wall or a tile you cannot afford just skips
                // it; only a deliberate single press buzzes.
                else SoundManager.playBuzzer();
            }
            // Every tile the stroke crossed since the last frame, so a fast drag
            // draws an unbroken line the way the RPG Maker tile brush does.
            for (const t of painted) {
                if (this.isFurnitureBuildPlacementValid(this._fbArmedId, t.x, t.y) &&
                    this.isArmedAffordable()) {
                    this.placeArmedFurniture(t.x, t.y);
                }
            }
            if (painted.length) this._fbPlaceCacheKey = null;
        } else {
            // Removal mode: target a placed piece to take it back. Sweeping with
            // the button held clears a run, mirroring paint-placement.
            let x, y, pressed = false;
            if (usePad) {
                x = this._fbCursorX;
                y = this._fbCursorY;
                pressed = this._fbFocus === 'map' && Input.isTriggered('ok');
            } else {
                x = $gameMap.canvasToMapX(TouchInput.x);
                y = $gameMap.canvasToMapY(TouchInput.y);
                pressed = !overPanel && TouchInput.isTriggered();
            }
            const painted = this.updateFurniturePaintStroke(pressed, usePad, x, y);
            if (pressed) this.removeFurnitureAtTile(x, y);
            for (const t of painted) this.removeFurnitureAtTile(t.x, t.y);
        }
    };

    // Tracks a held-button "paint" stroke across tiles.
    //
    // Returns the list of NEW tiles the stroke has crossed since the last frame,
    // in order, and empty on every other frame. The cursor can jump several
    // tiles in one frame during a fast drag, so the gap between the last painted
    // tile and this one is filled in (Bresenham) and the stroke draws an
    // unbroken line, like the RPG Maker editor's tile brush.
    //
    // The stroke only arms on a press that begins over the map (started), and
    // disarms as soon as the button is released, so a panel-to-map
    // drag-and-drop still places exactly one piece.
    const NO_PAINT = [];
    Scene_Map.prototype.updateFurniturePaintStroke = function (started, usePad, x, y) {
        // Livestock is never painted in a sweep: each animal is a separate
        // purchase, so a stray drag must not empty the player's wallet.
        if (this._fbArmedKind === 'animal') return NO_PAINT;
        const held = usePad ? Input.isPressed('ok') : TouchInput.isPressed();
        if (started) this._fbPaintArmed = true;
        if (!held) {
            this._fbPaintArmed = false;
            this._fbPaintTile = null;
            return NO_PAINT;
        }
        if (!this._fbPaintArmed) return NO_PAINT;

        const tile = x + ',' + y;
        if (started) { this._fbPaintTile = { x, y }; return NO_PAINT; }
        const last = this._fbPaintTile;
        if (last && last.x === x && last.y === y) return NO_PAINT;
        const trail = last ? tilesBetween(last.x, last.y, x, y) : [{ x, y }];
        this._fbPaintTile = { x, y };
        return trail;
    };

    // Every tile on the line from (x0,y0) to (x1,y1), the start excluded.
    function tilesBetween(x0, y0, x1, y1) {
        const out = [];
        let cx = x0, cy = y0;
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        // A wild cursor jump (a scene scroll, a teleport) is not a brush stroke.
        let guard = 256;
        while (guard-- > 0) {
            if (cx === x1 && cy === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; cx += sx; }
            if (e2 <= dx) { err += dx; cy += sy; }
            out.push({ x: cx, y: cy });
        }
        return out;
    }

    const _Scene_Map_update_fbuild = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_fbuild.call(this);
        if (this._fbActive) this.updateFurnitureBuildMode();
    };

    const _Scene_Map_start_fbuild = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start_fbuild.call(this);
        if ($gameTemp._fbOpenPending) {
            $gameTemp._fbOpenPending = false;
            this.openFurnitureBuildMode();
        }
    };

    const _Scene_Map_terminate_fbuild = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        if (this._fbActive) this.closeFurnitureBuildMode(true);
        _Scene_Map_terminate_fbuild.call(this);
    };

    // Block click-to-move while building (keyboard movement stays free).
    const _Scene_Map_isMapTouchOk_fbuild = Scene_Map.prototype.isMapTouchOk;
    Scene_Map.prototype.isMapTouchOk = function () {
        if (this._fbActive) return false;
        return _Scene_Map_isMapTouchOk_fbuild.call(this);
    };

    // The menu key closes the build overlay instead of opening the pause menu.
    const _Scene_Map_updateCallMenu_fbuild = Scene_Map.prototype.updateCallMenu;
    Scene_Map.prototype.updateCallMenu = function () {
        if (this._fbActive) {
            if (Input.isTriggered('menu')) {
                this.menuCalling = false;
                this.closeFurnitureBuildMode();
            }
            return;
        }
        _Scene_Map_updateCallMenu_fbuild.call(this);
    };

    //=============================================================================
    // Scene_FurnitureBuilder (compatibility shim, redirects to on-map build mode)
    //=============================================================================

    class Scene_FurnitureBuilder extends Scene_MenuBase {
        create() {
            super.create();
        }
        start() {
            super.start();
            $gameTemp._fbOpenPending = true;
            this.popScene();
        }
    }
    window.Scene_FurnitureBuilder = Scene_FurnitureBuilder;

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    // Opens the build overlay straight onto one of its top-level tabs (used by
    // AnimalGrowthSystem's legacy "Animal" events to reach the Animals tab).
    // Returns false when the current map does not allow building.
    window.FurnitureSystem.openBuildMenu = function (tab) {
        const scene = SceneManager._scene;
        if (!(scene instanceof Scene_Map) || !scene.openFurnitureBuildMode) return false;
        scene.openFurnitureBuildMode();
        if (!scene._fbActive || !scene._fbUI) return false;
        if (tab && TOP_TABS.some(t => t.key === tab)) {
            scene._fbUI.topTab = tab;
            scene._fbUI.search = '';
            scene._fbUI.searchOpen = false;
            scene._fbUI.render();
        }
        return true;
    };

    PluginManager.registerCommand(pluginName, 'openBuilder', () => {
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map && scene.openFurnitureBuildMode) {
            scene.openFurnitureBuildMode();
        } else {
            $gameTemp._fbOpenPending = true;
        }
    });

    PluginManager.registerCommand(pluginName, 'enterPlacementMode', args => {
        const furnitureId = args.furnitureId;
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map && scene.openFurnitureBuildMode) {
            scene.openFurnitureBuildMode();
            if (scene._fbActive && Furniture[furnitureId]) {
                scene.armFurniture(furnitureId);
            }
        }
    });

    PluginManager.registerCommand(pluginName, 'giveFurniture', args => {
        const furnitureId = args.furnitureId;
        const quantity = Number(args.quantity) || 1;
        $gameSystem.addFurniture(furnitureId, quantity);
    });

    PluginManager.registerCommand(pluginName, 'giveMaterial', args => {
        const materialId = args.materialId;
        const quantity = Number(args.quantity) || 1;
        $gameSystem.addMaterial(materialId, quantity);
    });

    PluginManager.registerCommand(pluginName, 'unlockRecipe', args => {
        const recipeId = args.recipeId;
        $gameSystem.unlockRecipe(recipeId);
    });

    PluginManager.registerCommand(pluginName, 'removeAllFurniture', () => {
        const mapId = furnitureMapKey();
        $gameSystem.getFurnitureData();
        $gameSystem.builtFurniture()[mapId] = [];
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager.goto(Scene_Map);
        }
    });

})();
