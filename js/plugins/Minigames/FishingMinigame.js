/*:
 * @target MZ
 * @plugindesc v2.0 Low-poly PSX-style 3D fishing game with real 3D monster models
 * @author Esoteric Heavy Industries
 * @help
 *
 * Fishing Minigame (3D)
 *
 * A first-person, low-polygon fishing game rendered with three.js and pushed
 * through the shared PSX shader (PSXShader.js): vertex snapping, 4-bit colour
 * with ordered dithering, nearest-filtered textures and a low internal
 * resolution upscaled with nearest neighbour.
 *
 * Everything that swims is a REAL 3D model. Fish, junk and hostile encounters
 * are built by the procedural battler stack (3DBattlerSystem.js + the
 * Battler3D_* families), the very same models the 3D battles use, so a hooked
 * Megalodon in the lake is the Megalodon you then fight.
 *
 * How it plays
 *   1. AIM     - look around with the arrow keys / left stick / mouse drag,
 *                and walk the bank with WASD to fish another stretch of water.
 *                A ring on the water shows where the cast will come down and
 *                how deep the lake is there.
 *   2. POWER   - stop the swinging bar. Power decides how far out the bobber
 *                lands, and the water gets deeper the further you cast, so the
 *                cast decides WHICH fish can reach your hook (each species has
 *                its own depth band).
 *   3. WAIT    - fish that like your depth drift over and nose the bobber.
 *   4. BITE    - the bobber plunges. Confirm inside the window to set the hook.
 *   5. REEL    - hold Confirm to reel in, release to give line. Keep the line
 *                tension out of the red or it snaps; tension in the good band
 *                tires the fish out. Bring the distance to zero to land it.
 *
 * The camera stays locked on the hook from the moment it leaves the rod: it
 * leads the bobber through the air, holds it while it floats, and follows the
 * fight. Look input becomes a bounded offset on top of that, so the hook is
 * never lost off screen (and a marker frames it wherever it is). The angler
 * may still walk the bank at any point, the fight included.
 *
 * F switches on a free camera: a spectator eye that flies anywhere over or
 * under the lake (WASD and look as usual, Q / E down and up) while the game
 * carries on, so the whole cast and fight can be watched from any angle.
 * F again hands the view back to the angler.
 *
 * The line is a real verlet rope pinned between the rod tip and the hook, with
 * gravity, drag and wind on the slack, so it whips out on the cast, hangs in a
 * catenary while you wait and pulls straight when a fish loads it up.
 *
 * The view is graded by the map's live screen tone, so the time-of-day tint
 * carries into the minigame.
 *
 * Every biome dresses the lake its own way (window.FishingScenery): the bank
 * wears the biome's ground, its props stand along the shore (pines, palms,
 * cacti, crystals, mushrooms, gravestones, buildings and so on) and its
 * skyline closes the view: hills, peaks, dunes, mesas, a volcano or a city.
 * A cave picks up the biome's colours and whatever grows under a roof.
 *
 * Plugin Commands:
 *   openFishingMinigame   opens the fishing scene
 *   closeFishingMinigame  closes the fishing scene
 *
 * The HUD is built the way a 32-bit console built one, minus the television: a
 * 240-line virtual framebuffer upscaled with nearest filtering for the bevelled
 * boxes, block gauges and the hook marker, with the labels on top of them as
 * crisp HTML type (window.PSXHud / PSXHud.domPanel). No scanlines, no vignette.
 *
 * Requires: three.js. Uses PSXShader.js and 3DBattlerSystem.js when present
 * (a flat-shaded fallback fish is built if the battler stack is unavailable).
 *
 * @command openFishingMinigame
 * @text Open Fishing Minigame
 * @desc Opens the fishing minigame scene
 *
 * @command closeFishingMinigame
 * @text Close Fishing Minigame
 * @desc Closes the fishing minigame scene
 *
 * @param fishDatabasePath
 * @text Fish Database Path
 * @type string
 * @desc Path to the fish JSON database
 * @default js/db/Items/fishDatabase.json
 *
 * @param resultVariable
 * @text Result Variable ID
 * @type variable
 * @desc Variable set to the caught fish id. 0 = do not write any variable.
 * @default 0
 *
 * @param fishCount
 * @text Fish Count
 * @type number
 * @min 1
 * @max 24
 * @desc Number of fish swimming in the lake
 * @default 6
 *
 * @param renderScale
 * @text Render Scale
 * @type number
 * @decimals 2
 * @min 0.25
 * @max 1.00
 * @desc Internal 3D resolution as a fraction of the game resolution
 * @default 0.75
 *
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'FishingMinigame';
    const params = PluginManager.parameters(PLUGIN_NAME);
    const FISH_DB_PATH = String(params.fishDatabasePath || 'js/db/Items/fishDatabase.json');
    const RESULT_VAR   = Number(params.resultVariable || 0);
    const FISH_COUNT   = Number(params.fishCount || 6);
    const RENDER_SCALE = Math.max(0.25, Math.min(1, Number(params.renderScale || 0.75)));

    //-------------------------------------------------------------------------
    // Plugin Commands
    //-------------------------------------------------------------------------
    PluginManager.registerCommand(PLUGIN_NAME, 'openFishingMinigame', () => {
        SceneManager.push(Scene_FishingMinigame);
    });

    PluginManager.registerCommand(PLUGIN_NAME, 'closeFishingMinigame', () => {
        SceneManager.pop();
    });

    //=========================================================================
    // Tunables
    //=========================================================================
    const WATER_Y      = 0;        // water surface plane
    const SHORE_Z      = 8;        // water starts here and runs toward -Z
    const LAKE_HALF_X  = 34;       // playfield half-width
    const LAKE_FAR_Z   = -72;      // far edge of the lake
    const DEPTH_PER_Z  = 0.19;     // how fast the bed drops away from the shore
    const MAX_DEPTH    = 13;       // deepest the bed ever gets (db depth units)
    const GRAVITY      = 26;       // bobber cast gravity (units/s^2)
    const CAST_MIN     = 9;        // shortest useful cast (units from rod tip)
    const CAST_MAX     = 52;       // longest cast at full power
    const SIM_DT       = 1 / 60;   // fixed simulation step
    const RENDER_FPS   = 30;       // rasterize the 3D pass at most this often

    // Camera. The player's own aiming is deliberately kept on a short leash so a
    // cast always goes out over the water, but the tracking camera has to be
    // able to swing wider than that: a hook can land off to one side or come
    // down almost at the player's feet, and it must stay framed either way.
    const LOOK_YAW_LIMIT  = 1.05;
    const LOOK_PITCH_MIN  = -0.55;
    const LOOK_PITCH_MAX  = 0.30;
    const TRACK_YAW_LIMIT = 1.30;
    const TRACK_PITCH_MIN = -1.15;
    const TRACK_PITCH_MAX = 0.55;
    const TRACK_OFFSET    = 0.55;   // how far the player may lead the tracked point
    const TRACK_RATE      = 6.0;    // default follow stiffness, in 1/seconds
    const TRACK_FAST      = 15.0;   // following the bobber through the air
    const TRACK_FIGHT     = 9.0;    // following a hooked fish
    const TRACK_SNAP      = 0.0015; // radians: close enough, stop easing and land on it
    const CAST_LEAD       = 0.10;   // seconds of velocity the flight camera leads by

    // Walking the bank. The angler is never allowed off the shore and into the
    // lake, so every position the camera can reach still has the water in front
    // of it and the cast solver still has somewhere to put the hook.
    const CAM_EYE_Y   = 2.4;
    const CAM_SPEED   = 7.0;                 // units per second
    const CAM_X_LIMIT = LAKE_HALF_X - 9;
    const CAM_Z_MIN   = SHORE_Z + 1.0;
    const CAM_Z_MAX   = SHORE_Z + 10;

    // Free camera. A spectator eye detached from the angler: it flies anywhere
    // over (or under) the lake while the game carries on beneath it, so a cast,
    // a bite or a fight can be watched from any angle. The rod and the line stay
    // with the angler, and the camera is boxed inside the scenery so it never
    // looks out past the edge of the world.
    const FREE_SPEED     = 12.0;             // units per second
    const FREE_PITCH_MAX = 1.50;
    const FREE_X_LIMIT   = LAKE_HALF_X + 6;
    const FREE_Z_MIN     = LAKE_FAR_Z + 4;
    const FREE_Z_MAX     = SHORE_Z + 22;
    const FREE_Y_MIN     = -MAX_DEPTH + 0.6;
    const FREE_Y_MAX     = 40;

    // Nothing hooked is ever dragged past the water's edge or under the lake
    // bed: the fight ends the moment the catch is close enough to lift, and
    // both the fish and the hook are pinned inside the water until then.
    const LAND_DIST   = 1.8;                 // close enough to the rod to land it
    const WATER_EDGE_Z = SHORE_Z - 2.2;      // the shallowest water a fight reaches
    const BED_CLEAR   = 0.55;                // never closer than this to the bed
    const SNAP_GRACE  = 0.35;                // seconds over the limit before the line goes

    // The lake's own geometry is patched with a harsher version of the player's
    // retro settings than the shared default: chunkier vertex snapping, fewer
    // shades and heavier dithering, because a wide flat water plane is exactly
    // where a 32-bit console's lack of precision showed most.
    const PSX_HARD = { vertexSnap: 0.55, colorLevels: 0.75, dither: 1.3 };

    // Lake stock beyond the fish themselves.
    const JUNK_COUNT  = 4;   // icon billboards of real items drifting about
    const MONSTER_MAX = 2;   // hostiles on top of the guaranteed one
    const AQUATIC_RE  = /fish|shark|eel|squid|octo|kraken|crab|lobster|serpent|hydra|siren|mermaid|naga|leviathan|whale|ray|jelly|slime|frog|toad|turtle|croc|alligator|water|sea|river|lake|drown|abyss|tide|coral|urchin|anemone|piranha|leech|worm/i;

    // Fishing line, simulated as a verlet rope.
    const ROPE_SEG   = 20;    // point masses in the chain
    const ROPE_ITER  = 8;     // constraint relaxation passes per step
    const ROPE_GRAV  = 11;    // units/s^2 pulling the slack down
    const ROPE_DAMP  = 0.90;  // velocity retained per step (air drag)
    const ROPE_WIND  = 4;     // lateral breeze on the slack

    // Which procedural battler archetype stands in for each database fish. Keys
    // are registry keys (Battler3D.create takes keys, not aliases), so these
    // name the bespoke split rigs in 3DBattler_Fish.js wherever one fits.
    const FISH_MODEL_KEYS = {
        'carp':       'reeffish',
        'bass':       'reeffish',
        'trout':      'fsh_reefguppy',
        'salmon':     'fsh_tonnodimensionale',
        'catfish':    'fsh_accursedstonefish',
        'pike':       'fsh_reefshark',
        'perch':      'fsh_reefguppy',
        'eel':        'eel',
        'goldfish':   'fsh_parrotfishgrazer',
        'tuna':       'fsh_tonnodimensionale',
        'swordfish':  'fsh_swordfishsovereign',
        'blowfish':   'fsh_desperatepufferfish',
        'clownfish':  'reeffish',
        'anglerfish': 'fsh_luminousangler',
        'piranha':    'fsh_crimsonfish',
        'sturgeon':   'fsh_reefshark',
        'koi':        'fsh_parrotfishgrazer',
        'pufferfish': 'fsh_desperatepufferfish',
        'jellyfish':  'jellyfish',
        'kraken':     'octopus'
    };

    // Rough visual scale by the database `size` field.
    const SIZE_SCALE = { small: 0.30, medium: 0.42, large: 0.60, huge: 0.85 };

    //=========================================================================
    // Small helpers
    //=========================================================================
    function loadJsonFile(path, callback) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', path);
        xhr.overrideMimeType('application/json');
        xhr.onload = () => {
            if (xhr.status < 400) {
                try { callback(JSON.parse(xhr.responseText)); }
                catch (e) { console.error('FishingMinigame: JSON parse error', e); callback([]); }
            } else {
                console.error('FishingMinigame: failed to load', path);
                callback([]);
            }
        };
        xhr.onerror = () => { console.error('FishingMinigame: XHR error'); callback([]); };
        xhr.send();
    }

    const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
    const lerp  = (a, b, t) => a + (b - a) * t;

    function three3DReady() {
        return typeof THREE !== 'undefined' && typeof THREE.WebGLRenderer === 'function';
    }

    function battlerStackReady() {
        return !!(window.Battler3D && typeof window.Battler3D.create === 'function');
    }

    // Launched from the title screen there is no map to read, so the free-play
    // picker (Titlescreen.js) asks the player where and when instead and leaves
    // the answer here. Null whenever a real game is being played.
    function arcadeSetup() {
        const arcade = window.MinigameArcade;
        return (arcade && arcade.setup) ? arcade.setup() : null;
    }

    // Sky/time helpers, shared with the animated battle backgrounds.
    function currentTimeMode() {
        const setup = arcadeSetup();
        if (setup && typeof setup.timeMode === 'number') return setup.timeMode;
        const SR = window.SkyRenderer;
        if (!SR || !SR.getCurrentTimeMode) return 0;
        return SR.getCurrentTimeMode();
    }


    // Where the rod is being held. A generated cave and a tiled room indoors
    // are both "not outside", but they are not the same place, and a lake full
    // of pine trees under a starfield is wrong in both of them.
    const VENUE_OPEN   = 'open';     // under the sky
    const VENUE_CAVERN = 'cavern';   // procedural cave, crypt, sewer
    const VENUE_INDOOR = 'indoor';   // an <Interior> map: a building

    // Under the open sky, that sky belongs to whatever world the party is
    // standing on: its haze, the colour of its star's light, and a black sky
    // full of stars where there is no air to scatter anything. On Earth every
    // one of these gives the palette back exactly as it was written.
    function alienise(pal) {
        const SR = window.SkyRenderer;
        const world = (SR && SR.skyWorld) ? SR.skyWorld() : null;
        if (!world || !SR.alienSkyColor || pal.venue !== VENUE_OPEN) return pal;
        pal.sky = SR.alienSkyColor(pal.sky);
        pal.light = SR.alienSkyColor(pal.light);
        // No air means the stars are out at noon as much as at midnight, and
        // the water below has nothing but the star itself to light it.
        if (world.atmosphere === false) {
            pal.night = true;
            pal.ambient = Math.min(pal.ambient, 0.22);
        }
        return pal;
    }

    function palette(venue, scenery) {
        return alienise(biomeTint(earthPalette(venue), scenery));
    }

    // Palette (sky, water, bed, light) for the venue, and for the hour when the
    // venue has an hour at all.
    function earthPalette(venue) {
        if (venue === VENUE_CAVERN) {
            return { sky: 0x100f14, water: 0x14303a, deep: 0x081418, bed: 0x2a2622,
                     bank: 0x35302a, light: 0x9fb0c0, lightI: 0.55, ambient: 0.30,
                     night: true, venue: venue, fogNear: 12, fogFar: 62 };
        }
        if (venue === VENUE_INDOOR) {
            // Fluorescent tubes, tiled walls, water with nothing living in it
            // that was not put there on purpose.
            return { sky: 0x1d2530, water: 0x1f6f8c, deep: 0x0c3446, bed: 0xa8c8d4,
                     bank: 0xc9cec6, light: 0xeaf4ff, lightI: 0.95, ambient: 0.62,
                     night: false, venue: venue, fogNear: 22, fogFar: 95 };
        }
        const SR = window.SkyRenderer;
        const T = (SR && SR.TIME_MODES) || { DAY: 0, NIGHT: 1, DUSK: 2, DAWN: 3 };
        switch (currentTimeMode()) {
            case T.NIGHT:
                return { sky: 0x0a1030, water: 0x11304a, deep: 0x050d18, bed: 0x1a2028,
                         bank: 0x232a24, light: 0x8fa8e0, lightI: 0.45, ambient: 0.28,
                         night: true, venue: VENUE_OPEN, fogNear: 42, fogFar: 118 };
            case T.DUSK:
                return { sky: 0xd0602a, water: 0x3a4a70, deep: 0x141a30, bed: 0x3a3028,
                         bank: 0x4a4030, light: 0xffb070, lightI: 0.85, ambient: 0.42,
                         night: false, venue: VENUE_OPEN, fogNear: 42, fogFar: 118 };
            case T.DAWN:
                return { sky: 0xe8a070, water: 0x4a7090, deep: 0x18283a, bed: 0x40382c,
                         bank: 0x556040, light: 0xffd0a0, lightI: 0.90, ambient: 0.45,
                         night: false, venue: VENUE_OPEN, fogNear: 42, fogFar: 118 };
            default:
                return { sky: 0x87ceeb, water: 0x2f7fa8, deep: 0x0e3448, bed: 0x4a4030,
                         bank: 0x5f7a3a, light: 0xfff4e0, lightI: 1.05, ambient: 0.50,
                         night: false, venue: VENUE_OPEN, fogNear: 42, fogFar: 118 };
        }
    }

    //=========================================================================
    // Biome scenery - what stands around the water depends on the biome
    //=========================================================================
    // Every biome gets its own backdrop. A biome is filed into a family by
    // name (first matching rule wins), the family says what grows or stands on
    // the banks and what the hills behind look like, and the biome's own map
    // colour from Biomes.json is folded into the ground and the props, so two
    // biomes of one family still never look alike. Placement is seeded off the
    // biome name: the same biome always shows the same shore.
    const SCENERY_RULES = [
        [/^Alien(Under)?(Lava|Magma|Chthonian|Hot)/, 'volcano'],
        [/^Alien(Under)?(Ice|Glacier|Tundra|Comet|ShortPeriod|LongPeriod|Dwarf|Centaur)/, 'ice'],
        [/^Alien(Diamond|UnderGeode)/, 'crystal'],
        [/^Alien(Rainforest|Habitable|EarthLike)/, 'alienjungle'],
        [/^Alien(Ocean|AcidOcean|UnderAbyss)/, 'ocean'],
        [/^Alien(Desert|UnderDust)/, 'desert'],
        [/^Alien(Plasma|Magnetar|Quark|UnderVoid|UnderStorm)/, 'eldritch'],
        [/^Alien/, 'alien'],
        [/^(Hell)$/, 'hell'],
        [/Volcano|Lava|UnderForge/, 'volcano'],
        [/^(Ice|Permafrost|CaveIce|CaveFrozen|BurgIce)$/, 'ice'],
        [/Ice$|^Snow|Tundra/, 'snow'],
        [/Crystal/, 'crystal'],
        [/Mushroom|Fungal/, 'mushroom'],
        [/Fairy/, 'fairy'],
        [/SpiritWoods/, 'spirit'],
        [/Eldritch|Underdark|ProfaneShrine/, 'eldritch'],
        [/Dreamscape/, 'dream'],
        [/Digital/, 'digital'],
        [/Heaven/, 'heaven'],
        [/Limbo|Abstract/, 'limbo'],
        [/^Space$|OmegaTower/, 'space'],
        [/Graveyard|Crypt|Catacombs|Barrow/, 'graveyard'],
        [/Swamp/, 'swamp'],
        [/Mangrove/, 'mangrove'],
        [/Jungle|Tropical/, 'jungle'],
        [/Bamboo/, 'bamboo'],
        [/TempleShinto/, 'shinto'],
        [/Temple|Ruins|Arena|ChurchInside/, 'ruins'],
        [/Castle|Burg$|Burg[A-Z]/, 'castle'],
        [/Canyon|Badlands|MountainDesert/, 'canyon'],
        [/Desert/, 'desert'],
        [/SaltFlats|SaltWorks/, 'salt'],
        [/Savannah/, 'savannah'],
        [/Steppe/, 'steppe'],
        [/Taiga|Highlands/, 'conifer'],
        [/Mountain/, 'mountain'],
        [/Beach|VillageSea|Docks/, 'beach'],
        [/^(Ocean|SeaBed|SeaGrotto)$/, 'ocean'],
        [/Landfill|Abandoned/, 'wasteland'],
        [/Factory|Mines|Mineshaft|Sewer|Metro|Train|Highway|Spacecenter|Laboratory|BuriedLab|ColdWarBunker/, 'industrial'],
        [/^City|Office|Hospital|Clinic|Store|Restaurant|Road|Bridge|Villa/, 'city'],
        [/Village|Houses|Farmhouse|Tavern/, 'village'],
        [/Farm/, 'farm'],
        [/Fields|Meadows|Park/, 'meadow'],
        [/Lake|River|Cistern/, 'lake'],
        [/Forest/, 'forest'],
        [/Cave|Dungeon|Lair|Basement|Cellar|Vault|Oubliette|Library|Tunnel|Bunker/, 'cave']
    ];

    // flora: the prop kinds scattered over the banks, in order of frequency.
    // hills: the backdrop behind the far shore. water/sky: a replacement colour
    // (sky blended by skyMix, 1 = take it outright). glow: the props light
    // themselves. noFarShore: open water to the horizon.
    const SCENERY_FAMILIES = {
        forest:     { flora: ['broadleaf', 'conifer', 'bush'], ground: 0x4f6e32, leaf: 0x2f5a2a, hills: 'rolling', density: 44 },
        conifer:    { flora: ['conifer', 'conifer', 'rock'], ground: 0x3e5a3a, leaf: 0x1f4a2e, hills: 'mountains', density: 48 },
        meadow:     { flora: ['bush', 'broadleaf', 'flower', 'reed'], ground: 0x6f9a3e, leaf: 0x3f7a2a, hills: 'rolling', density: 26 },
        farm:       { flora: ['fence', 'hay', 'broadleaf', 'house'], ground: 0x7a8a3e, leaf: 0x3f6a2a, hills: 'rolling', density: 24 },
        lake:       { flora: ['reed', 'broadleaf', 'conifer', 'reed'], ground: 0x557a3a, leaf: 0x2f5a2a, hills: 'rolling', density: 38 },
        jungle:     { flora: ['jungle', 'palm', 'bush', 'jungle'], ground: 0x2f5a22, leaf: 0x1f6a2a, water: 0x2a6a5a, hills: 'rolling', density: 58 },
        mangrove:   { flora: ['mangrove', 'reed', 'jungle'], ground: 0x3a5a32, leaf: 0x2a6a3a, water: 0x2f6a62, hills: 'none', density: 46 },
        swamp:      { flora: ['dead', 'reed', 'reed', 'jungle'], ground: 0x3a4a2a, leaf: 0x3a5a2a, water: 0x3f4a2a, sky: 0x8a9a7a, skyMix: 0.45, fogFar: 96, hills: 'none', density: 44 },
        bamboo:     { flora: ['bamboo', 'bamboo', 'bush'], ground: 0x4f7942, leaf: 0x5f9a3a, hills: 'mountains', density: 52 },
        beach:      { flora: ['palm', 'rock', 'palm'], ground: 0xd8c88a, sand: 0xe8d8a0, leaf: 0x3f8a3a, water: 0x2fa8b8, hills: 'none', density: 16 },
        ocean:      { flora: ['rock'], ground: 0x8a8a7a, sand: 0xc8b890, water: 0x1f5f9a, hills: 'none', noFarShore: true, density: 6 },
        desert:     { flora: ['cactus', 'rock', 'cactus'], ground: 0xd0b070, sand: 0xe0c890, water: 0x3f8fa0, sky: 0xf0d8a0, skyMix: 0.25, hills: 'dunes', density: 18 },
        canyon:     { flora: ['cactus', 'rock', 'rock'], ground: 0xb0603a, sand: 0xc08a5a, water: 0x4a7a7a, hills: 'mesas', density: 14 },
        salt:       { flora: ['rock', 'crystal'], ground: 0xf0eee6, sand: 0xe8e4d8, water: 0x6fa8b0, hills: 'none', density: 8 },
        savannah:   { flora: ['acacia', 'grass', 'grass'], ground: 0xb09a50, leaf: 0x5f7a2a, sky: 0xf0c890, skyMix: 0.15, hills: 'rolling', density: 22 },
        steppe:     { flora: ['grass', 'grass', 'rock'], ground: 0x9a9a5a, leaf: 0x8a8a4a, hills: 'rolling', density: 26 },
        snow:       { flora: ['snowpine', 'snowpine', 'iceshard'], ground: 0xe8eef4, sand: 0xc8d4dc, leaf: 0x2a4a3a, water: 0x5f8fa8, hills: 'mountains', snowcaps: true, density: 32 },
        ice:        { flora: ['iceshard', 'iceshard', 'rock'], ground: 0xf0f6fa, sand: 0xd8e6ee, water: 0x7fb0c8, hills: 'mountains', snowcaps: true, density: 22 },
        mountain:   { flora: ['conifer', 'rock', 'rock'], ground: 0x5a5a52, leaf: 0x2a4a32, hills: 'mountains', snowcaps: true, density: 28 },
        volcano:    { flora: ['spire', 'dead', 'spire'], ground: 0x2a2220, sand: 0x3a2a22, leaf: 0x3a2a22, water: 0xd0431a, lava: true, sky: 0x5a1a10, skyMix: 0.45, hills: 'volcano', density: 22 },
        hell:       { flora: ['spire', 'dead', 'bone'], ground: 0x3a1210, sand: 0x4a1a12, leaf: 0x2a0a08, water: 0xd02a10, lava: true, sky: 0x6a0a08, skyMix: 0.75, hills: 'volcano', density: 26 },
        city:       { flora: ['building', 'building', 'lamp'], ground: 0x6a6a6a, sand: 0x8a8a84, water: 0x3a6a80, hills: 'skyline', density: 26 },
        village:    { flora: ['house', 'broadleaf', 'fence'], ground: 0x667a3e, leaf: 0x2f5a2a, hills: 'rolling', density: 26 },
        industrial: { flora: ['chimney', 'building', 'tank'], ground: 0x55524c, sand: 0x6a665e, water: 0x4a5a50, sky: 0x9a9a92, skyMix: 0.35, hills: 'skyline', density: 18 },
        castle:     { flora: ['tower', 'conifer', 'broadleaf'], ground: 0x5f6e46, leaf: 0x2f5a2a, hills: 'rolling', density: 26 },
        ruins:      { flora: ['column', 'broadleaf', 'rock'], ground: 0x8a8a5a, leaf: 0x4a6a2a, hills: 'rolling', density: 24 },
        shinto:     { flora: ['torii', 'bamboo', 'broadleaf'], ground: 0x5a7a3a, leaf: 0xc8503a, hills: 'mountains', density: 28 },
        graveyard:  { flora: ['grave', 'grave', 'dead'], ground: 0x3a4a3a, leaf: 0x2a3a2a, sky: 0x6a7a80, skyMix: 0.35, fogFar: 100, hills: 'rolling', density: 34 },
        wasteland:  { flora: ['dead', 'junk', 'rock'], ground: 0x6a6248, sand: 0x7a7058, water: 0x5a5a3a, sky: 0xa8a080, skyMix: 0.25, hills: 'rolling', density: 24 },
        mushroom:   { flora: ['mushroom', 'mushroom', 'bush'], ground: 0x5a4a6a, leaf: 0x9370db, sky: 0x9370db, skyMix: 0.25, glow: true, hills: 'rolling', density: 34 },
        fairy:      { flora: ['mushroom', 'broadleaf', 'flower'], ground: 0x6a8a5a, leaf: 0xff7fe0, sky: 0xffa8f0, skyMix: 0.25, glow: true, hills: 'rolling', density: 36 },
        crystal:    { flora: ['crystal', 'crystal', 'rock'], ground: 0x4a5a6a, leaf: 0x00ced1, glow: true, hills: 'mountains', density: 26 },
        spirit:     { flora: ['spirittree', 'spirittree', 'flower'], ground: 0x2a4a3a, leaf: 0x00fa9a, water: 0x1a5a5a, sky: 0x1a3a3a, skyMix: 0.45, glow: true, hills: 'rolling', density: 34 },
        eldritch:   { flora: ['tentacle', 'spire', 'tentacle'], ground: 0x2a1a3a, leaf: 0x6a2a8a, water: 0x2a0a3a, sky: 0x2a0a4a, skyMix: 0.6, glow: true, hills: 'mesas', density: 26 },
        dream:      { flora: ['floater', 'broadleaf', 'flower'], ground: 0xf0c0d0, leaf: 0xffa0c0, water: 0xa0c0ff, sky: 0xffc0cb, skyMix: 0.5, hills: 'rolling', density: 26 },
        digital:    { flora: ['voxel', 'voxel', 'voxel'], ground: 0x0a1a0a, sand: 0x0f2a0f, leaf: 0x00ff00, water: 0x003a10, sky: 0x000a00, skyMix: 0.85, glow: true, hills: 'skyline', density: 30 },
        heaven:     { flora: ['cloud', 'column', 'cloud'], ground: 0xf8f8f0, sand: 0xf0ece0, leaf: 0xffffff, water: 0xc0e8ff, sky: 0xfff8f0, skyMix: 0.5, hills: 'none', density: 22 },
        limbo:      { flora: ['floater', 'spire'], ground: 0xb8b8b8, sand: 0xcacaca, leaf: 0x9a9a9a, water: 0x8a9aa0, sky: 0xd3d3d3, skyMix: 0.7, hills: 'none', density: 16 },
        space:      { flora: ['spire', 'rock'], ground: 0x3a3a40, sand: 0x4a4a50, leaf: 0x6a6a7a, water: 0x1a1a3a, sky: 0x000005, skyMix: 1, stars: true, hills: 'mesas', density: 16 },
        alien:      { flora: ['alienplant', 'spire', 'rock'], ground: 0x5a4a6a, hills: 'mesas', density: 28 },
        cave:       { flora: ['rock', 'spire', 'rock'], ground: 0x4a4640, leaf: 0x3a4a3a, hills: 'mountains', density: 22 },
        alienjungle:{ flora: ['alienplant', 'jungle', 'alienplant'], ground: 0x2f5a4a, glow: true, hills: 'rolling', density: 46 }
    };

    // The props each family scatters, listed once so a test can prove every
    // family names a builder that exists.
    const FLORA_KINDS = ['broadleaf', 'conifer', 'bush', 'flower', 'reed', 'fence', 'hay', 'house',
        'jungle', 'palm', 'mangrove', 'dead', 'bamboo', 'rock', 'cactus', 'crystal', 'acacia', 'grass',
        'snowpine', 'iceshard', 'spire', 'bone', 'building', 'lamp', 'chimney', 'tank', 'tower',
        'column', 'torii', 'grave', 'junk', 'mushroom', 'spirittree', 'tentacle', 'floater', 'voxel',
        'cloud', 'alienplant'];
    const HILL_KINDS = ['none', 'rolling', 'mountains', 'dunes', 'mesas', 'volcano', 'skyline'];

    function hashString(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    function seededRng(seed) {
        let a = seed >>> 0 || 1;
        return function() {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function mixColor(a, b, t) {
        const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
    }

    function shadeColor(c, f) {
        return mixColor(c, f < 1 ? 0x000000 : 0xffffff, f < 1 ? 1 - f : f - 1);
    }

    // The biome the rod is being cast in: a free-play pick first, then the
    // procedural square, then a static map's <Biome: X> note. "River vertical"
    // and every other road or river piece is filed under its first word.
    function currentBiomeName() {
        const setup = arcadeSetup();
        if (setup && setup.biome) return String(setup.biome);
        try {
            const pg = window.$gameSystem && $gameSystem._procGenData;
            if (pg && pg.currentBiome) {
                if (pg.displayAsIsland || pg.displayAsBeach) return 'Beach';
                return String(pg.currentBiome);
            }
            const meta = window.$dataMap && $dataMap.meta && $dataMap.meta.Biome;
            if (meta && typeof meta === 'string') return meta.trim();
        } catch (e) { /* no game loaded */ }
        return '';
    }

    function biomeRecord(name) {
        const list = (window.WorldGen && Array.isArray(window.WorldGen.Biomes)) ? window.WorldGen.Biomes : [];
        for (const b of list) if (b && b.name === name) return b;
        return null;
    }

    function sceneryFamily(name) {
        const key = String(name || '').split(' ')[0];
        for (const [re, fam] of SCENERY_RULES) if (re.test(key)) return fam;
        return 'forest';
    }

    // The whole backdrop of one biome as plain data. No three.js in here, so it
    // can be asserted on without a renderer.
    function biomeScenery(name) {
        const biome = String(name || '').split(' ')[0];
        const family = sceneryFamily(biome);
        const fam = SCENERY_FAMILIES[family];
        const rec = biomeRecord(String(name || '')) || biomeRecord(biome);
        const tint = (rec && /^#[0-9a-f]{6}$/i.test(rec.color)) ? parseInt(rec.color.slice(1), 16) : null;
        const seed = hashString(biome || family);
        const rng = seededRng(seed);
        // The biome's own colour pulls the ground and the foliage a little way
        // toward it, and a seeded nudge keeps two same-coloured biomes apart.
        const pull = tint == null ? 0 : 0.18 + rng() * 0.12;
        const ground = tint == null ? fam.ground : mixColor(fam.ground, tint, pull);
        const baseLeaf = fam.leaf != null ? fam.leaf : mixColor(fam.ground, 0x2f5a2a, 0.5);
        const leaf = tint == null ? baseLeaf : mixColor(baseLeaf, tint, pull * 0.8);
        return {
            biome: biome,
            family: family,
            seed: seed,
            flora: fam.flora.slice(),
            density: Math.round(fam.density * (0.85 + rng() * 0.3)),
            ground: ground,
            sand: fam.sand != null ? fam.sand : mixColor(0x8a7a52, ground, 0.25),
            leaf: leaf,
            accent: tint != null ? tint : leaf,
            water: fam.water != null ? fam.water : null,
            sky: fam.sky != null ? fam.sky : null,
            skyMix: fam.skyMix || 0,
            fogFar: fam.fogFar || 150,
            hills: fam.hills,
            hillColor: mixColor(ground, 0x5a6a7a, 0.35),
            snowcaps: !!fam.snowcaps,
            lava: !!fam.lava,
            glow: !!fam.glow,
            stars: !!fam.stars,
            noFarShore: !!fam.noFarShore
        };
    }

    // Fold the biome into the open-air palette. A cave or a room keeps its
    // own sky, but its water and rock still take on the biome's colours.
    function biomeTint(pal, sc) {
        if (!sc) return pal;
        if (sc.water != null) {
            pal.water = pal.night ? shadeColor(sc.water, 0.5) : sc.water;
            pal.deep = shadeColor(sc.water, 0.3);
        }
        if (pal.venue === VENUE_INDOOR) return pal;
        pal.bank = pal.night ? shadeColor(sc.ground, 0.45) : sc.ground;
        if (pal.venue !== VENUE_OPEN) return pal;
        if (sc.sky != null && sc.skyMix > 0) {
            const sky = pal.night ? shadeColor(sc.sky, 0.3) : sc.sky;
            pal.sky = mixColor(pal.sky, sky, sc.skyMix);
        }
        if (sc.stars) pal.night = true;
        pal.fogFar = Math.max(pal.fogFar || 0, sc.fogFar);
        return pal;
    }

    window.FishingScenery = {
        families: SCENERY_FAMILIES, floraKinds: FLORA_KINDS, hillKinds: HILL_KINDS,
        family: sceneryFamily, profile: biomeScenery, current: currentBiomeName
    };

    // Water surface displacement. One function drives the mesh, the bobber, the
    // splash rings and the fish that break the surface, so they never disagree.
    function waveHeight(x, z, t) {
        return Math.sin(x * 0.17 + t * 1.15) * 0.20 +
               Math.sin(z * 0.23 - t * 0.95) * 0.16 +
               Math.sin((x + z) * 0.085 + t * 0.62) * 0.26;
    }

    // Lake bed height. Shallow at the shore, dropping away toward -Z, expressed
    // so that -bedY is directly comparable to a fish database depth value.
    function bedY(z) {
        const d = clamp((SHORE_Z - z) * DEPTH_PER_Z, 0.8, MAX_DEPTH);
        return -d;
    }

    // How deep the water is (in database depth units) under a point.
    function waterDepthAt(z) { return -bedY(z); }

    // 32x32 icon crop from IconSet.png as a nearest-filtered THREE texture.
    function iconTexture(iconIndex) {
        const src = ImageManager.loadSystem('IconSet');
        const cv = document.createElement('canvas');
        cv.width = cv.height = 32;
        const ctx = cv.getContext('2d');
        const tex = new THREE.CanvasTexture(cv);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        const paint = () => {
            try {
                ctx.clearRect(0, 0, 32, 32);
                ctx.drawImage(src.canvas,
                    (iconIndex % 16) * 32, Math.floor(iconIndex / 16) * 32, 32, 32, 0, 0, 32, 32);
                tex.needsUpdate = true;
            } catch (e) { /* icon sheet not ready or tainted: leave blank */ }
        };
        if (src.isReady()) paint(); else src.addLoadListener(paint);
        return tex;
    }

    //=========================================================================
    // FishEntity - one swimmer (fish, junk item or hostile encounter)
    //=========================================================================
    class FishEntity {
        constructor(type, data, rig, battler, opts) {
            this.type    = type;              // 'fish' | 'item' | 'monster'
            this.data    = data;
            this.rig     = rig;               // THREE.Group placed in world space
            this.battler = battler;           // Battler3D model instance (or null)
            this.state   = 'swimming';        // swimming | interested | hooked | landed

            const o = opts || {};
            this.depthMin  = o.depthMin != null ? o.depthMin : 1;
            this.depthMax  = o.depthMax != null ? o.depthMax : 6;
            this.speed     = o.speed || 1.2;
            this.difficulty = o.difficulty || 1;
            this.iconIndex = o.iconIndex || 0;
            this.stamina   = 1;               // drains while the player fights it
            this.phase     = Math.random() * Math.PI * 2;
            this.heading   = Math.random() * Math.PI * 2;
            this.turnTimer = 0;
            this.bob       = 0;
        }

        get x() { return this.rig.position.x; }
        get y() { return this.rig.position.y; }
        get z() { return this.rig.position.z; }

        // Preferred cruising depth, kept inside the species band.
        preferredY() {
            return -lerp(this.depthMin, this.depthMax, 0.5);
        }

        // Does this species live at the depth the hook is sitting in?
        likesDepth(hookDepth) {
            return hookDepth >= this.depthMin - 1.5 && hookDepth <= this.depthMax + 1.5;
        }
    }

    //=========================================================================
    // FishingWorld3D - the three.js lake
    //=========================================================================
    class FishingWorld3D {
        constructor(width, height, venue) {
            this._w = width;
            this._h = height;
            this._t = 0;
            this._venue = venue || VENUE_OPEN;
            this._scenery = biomeScenery(currentBiomeName());
            this._pal = palette(this._venue, this._scenery);
            this.entities = [];
            this._splashes = [];
            this._disposed = false;

            // Free-look camera: yaw/pitch the player drives while aiming, then
            // eased onto the bobber once the line is out.
            this.yaw = 0;
            this.pitch = -0.08;
            this._autoAim = null;   // THREE.Vector3 the camera eases toward
            this.freeCam = null;    // the spectator camera, while it is on

            this._initThree();
            this._buildSky();
            this._buildWater();
            this._buildBed();
            this._buildShore();
            this._buildRod();
            this._buildBobber();
            this._buildCastMarker();
            this._buildLine();
            this._buildWeather();
            this._applyCamera();
        }

        get domElement() { return this.renderer.domElement; }

        //---------------------------------------------------------------------
        // Setup
        //---------------------------------------------------------------------
        _initThree() {
            const pal = this._pal;
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(pal.sky);
            // Linear fog dissolves the far edge of the water plane into the sky
            // instead of ending it on a hard line. Indoors it closes in, because
            // a room has a far wall and a cave has less than that.
            this.scene.fog = new THREE.Fog(pal.sky, pal.fogNear || 42, pal.fogFar || 118);

            this.camera = new THREE.PerspectiveCamera(58, this._w / this._h, 0.1, 400);
            this.camera.position.set(0, CAM_EYE_Y, SHORE_Z + 2.2);
            this.scene.add(this.camera);   // the rod is a child of the camera
            this._freeView = new THREE.PerspectiveCamera(58, this._w / this._h, 0.1, 400);

            this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(Math.round(this._w * RENDER_SCALE), Math.round(this._h * RENDER_SCALE), false);
            this.renderer.setClearColor(pal.sky, 1);

            this.scene.add(new THREE.AmbientLight(0xffffff, pal.ambient));
            const key = new THREE.DirectionalLight(pal.light, pal.lightI);
            key.position.set(-8, 16, 6);
            this.scene.add(key);
            this._keyLight = key;
            const fill = new THREE.HemisphereLight(pal.sky, pal.bed, 0.45);
            this.scene.add(fill);
        }

        // Flat-shaded low-poly material, the backbone of the whole PSX look.
        _mat(color, opts) {
            const o = opts || {};
            const m = new THREE.MeshLambertMaterial({
                color: color,
                flatShading: true,
                transparent: !!o.transparent,
                opacity: o.opacity != null ? o.opacity : 1,
                side: o.side || THREE.FrontSide,
                emissive: o.emissive != null ? o.emissive : 0x000000
            });
            return m;
        }

        _track(obj) {
            const PSX = window.PSXShader;
            if (!PSX || !PSX.applyToObject) return obj;
            if (PSX.withScale) PSX.withScale(PSX_HARD, () => PSX.applyToObject(obj));
            else PSX.applyToObject(obj);
            return obj;
        }

        // Night sky: a coarse point cloud, no texture, no cost. There are no
        // stars in a cellar, whatever the palette's night flag says.
        _buildSky() {
            if (this._venue !== VENUE_OPEN || !this._pal.night) return;
            const N = this._scenery && this._scenery.stars ? 600 : 220;
            const pos = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {
                const a = Math.random() * Math.PI * 2;
                const e = 0.12 + Math.random() * 0.85;
                const r = 170;
                pos[i * 3]     = Math.cos(a) * r * Math.cos(e);
                pos[i * 3 + 1] = Math.sin(e) * r * 0.8 + 10;
                pos[i * 3 + 2] = Math.sin(a) * r * Math.cos(e);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.4, sizeAttenuation: false, fog: false }));
            this.scene.add(stars);
            this._stars = stars;
        }

        _buildWater() {
            const SEG = 44;
            const W = LAKE_HALF_X * 2 + 20;
            const D = (SHORE_Z - LAKE_FAR_Z) + 30;
            const geo = new THREE.PlaneGeometry(W, D, SEG, SEG);
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, WATER_Y, (SHORE_Z + LAKE_FAR_Z) / 2 - 4);
            const lava = this._scenery && this._scenery.lava;
            const mat = this._mat(this._pal.water, lava
                ? { transparent: true, opacity: 0.92, emissive: shadeColor(this._pal.water, 0.45) }
                : { transparent: true, opacity: 0.80 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.renderOrder = 2;     // after the opaque fish, so they show through
            this.scene.add(mesh);
            this._water = mesh;
            this._waterBase = Float32Array.from(geo.attributes.position.array);
            this._track(mesh);
        }

        _buildBed() {
            const SEG = 26;
            const W = LAKE_HALF_X * 2 + 20;
            const D = (SHORE_Z - LAKE_FAR_Z) + 30;
            const geo = new THREE.PlaneGeometry(W, D, SEG, SEG);
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, 0, (SHORE_Z + LAKE_FAR_Z) / 2 - 4);
            // Sink each vertex onto the sloped bed, plus a little chunky noise.
            const p = geo.attributes.position;
            // A poured concrete tank has no lumps in it, and nothing grows
            // there: the floor is a clean ramp and that is the point of it.
            const smoothBed = this._venue === VENUE_INDOOR;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), z = p.getZ(i);
                const n = smoothBed ? 0
                    : Math.sin(x * 0.31) * 0.5 + Math.sin(z * 0.27 + 1.7) * 0.45 + Math.sin((x - z) * 0.13) * 0.4;
                p.setY(i, bedY(z) + n);
            }
            geo.computeVertexNormals();
            const mesh = new THREE.Mesh(geo, this._mat(this._pal.bed));
            this.scene.add(mesh);
            this._bed = mesh;
            this._track(mesh);

            if (smoothBed) return this._buildTankFloor();

            // Scattered rocks and weed clumps so the bottom is not an empty ramp.
            const deco = new THREE.Group();
            const rockMat = this._mat(this._pal.bed === 0x2a2622 ? 0x3a3a3a : 0x53504a);
            const weedMat = this._mat(0x2c4a2a);
            for (let i = 0; i < 26; i++) {
                const x = (Math.random() * 2 - 1) * LAKE_HALF_X;
                const z = SHORE_Z - 4 - Math.random() * (SHORE_Z - LAKE_FAR_Z - 6);
                const y = bedY(z);
                if (Math.random() < 0.55) {
                    const r = 0.4 + Math.random() * 1.1;
                    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
                    rock.position.set(x, y + r * 0.4, z);
                    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
                    deco.add(rock);
                } else {
                    const h = 0.9 + Math.random() * 1.8;
                    const weed = new THREE.Mesh(new THREE.ConeGeometry(0.32, h, 4), weedMat);
                    weed.position.set(x, y + h / 2, z);
                    weed.rotation.y = Math.random() * 3;
                    deco.add(weed);
                }
            }
            this.scene.add(deco);
            this._deco = deco;
            this._track(deco);
        }

        // The bottom of a tank: tile grout, a drain, a lane line painted on,
        // and the coins people have thrown in, which is the only thing on the
        // floor of an indoor pool anywhere in the world.
        _buildTankFloor() {
            const deco = new THREE.Group();
            const groutMat = this._mat(0x86a8b4);
            const laneMat = this._mat(0x2b4d8a);
            const step = 6;
            for (let z = LAKE_FAR_Z; z < SHORE_Z; z += step) {
                const line = new THREE.Mesh(new THREE.BoxGeometry(LAKE_HALF_X * 2, 0.06, 0.18), groutMat);
                line.position.set(0, bedY(z) + 0.08, z);
                deco.add(line);
            }
            for (let x = -LAKE_HALF_X; x <= LAKE_HALF_X; x += step) {
                for (let z = LAKE_FAR_Z; z < SHORE_Z - step; z += step) {
                    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, step), groutMat);
                    seg.position.set(x, bedY(z + step / 2) + 0.08, z + step / 2);
                    deco.add(seg);
                }
            }
            for (const lx of [-14, 0, 14]) {
                const lane = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, (SHORE_Z - LAKE_FAR_Z) * 0.7), laneMat);
                lane.position.set(lx, bedY((SHORE_Z + LAKE_FAR_Z) / 2) + 0.12, (SHORE_Z + LAKE_FAR_Z) / 2);
                deco.add(lane);
            }
            const drain = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 8), this._mat(0x55636b));
            drain.position.set(0, bedY(LAKE_FAR_Z + 10) + 0.1, LAKE_FAR_Z + 10);
            deco.add(drain);

            const coinMat = this._mat(0xc9a83c, { emissive: 0x2a2008 });
            for (let i = 0; i < 30; i++) {
                const x = (Math.random() * 2 - 1) * LAKE_HALF_X;
                const z = SHORE_Z - 6 - Math.random() * (SHORE_Z - LAKE_FAR_Z - 10);
                const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 6), coinMat);
                coin.position.set(x, bedY(z) + 0.1, z);
                coin.rotation.set(0, Math.random() * 3, 0);
                deco.add(coin);
            }
            this.scene.add(deco);
            this._deco = deco;
            this._track(deco);
        }

        // What is standing around the water depends entirely on where the water
        // is. Three places, three sets of scenery.
        _buildShore() {
            if (this._venue === VENUE_CAVERN) return this._buildCavern();
            if (this._venue === VENUE_INDOOR) return this._buildIndoor();
            return this._buildOpenShore();
        }

        // A flooded chamber: rock walls, a low ceiling, stalactites, and a
        // ledge to stand on. No horizon, no trees, no far shore.
        _buildCavern() {
            const pal = this._pal;
            const group = new THREE.Group();
            const sc = this._scenery;
            const rockMat = this._mat(mixColor(0x3a3630, sc.accent, 0.22));
            const wetMat = this._mat(mixColor(0x2a2a30, sc.accent, 0.15));

            // Ledge behind the player, where the rod is being held from.
            const ledge = new THREE.Mesh(new THREE.BoxGeometry(60, 4, 22), rockMat);
            ledge.position.set(0, -1.3, SHORE_Z + 11);
            group.add(ledge);

            // Walls closing the chamber in on three sides, built out of chunky
            // blocks so the silhouette is broken rather than a corridor.
            for (let i = 0; i < 26; i++) {
                const w = 6 + Math.random() * 14;
                const h = 10 + Math.random() * 16;
                const side = i % 2 ? 1 : -1;
                const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8 + Math.random() * 10), rockMat);
                block.position.set(
                    side * (LAKE_HALF_X - 4 + Math.random() * 10),
                    h / 2 - 5,
                    SHORE_Z - Math.random() * (SHORE_Z - LAKE_FAR_Z)
                );
                block.rotation.y = Math.random() * 0.6;
                group.add(block);
            }
            const back = new THREE.Mesh(new THREE.BoxGeometry(120, 26, 12), rockMat);
            back.position.set(0, 5, LAKE_FAR_Z - 4);
            group.add(back);

            // Ceiling, and the things hanging off it.
            const roof = new THREE.Mesh(new THREE.BoxGeometry(120, 6, (SHORE_Z - LAKE_FAR_Z) + 40), wetMat);
            roof.position.set(0, 15, (SHORE_Z + LAKE_FAR_Z) / 2);
            group.add(roof);
            for (let i = 0; i < 22; i++) {
                const h = 1.6 + Math.random() * 4;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4 + Math.random() * 0.6, h, 4), rockMat);
                spike.rotation.x = Math.PI;
                spike.position.set(
                    (Math.random() * 2 - 1) * (LAKE_HALF_X + 4),
                    12 - h / 2,
                    SHORE_Z - Math.random() * (SHORE_Z - LAKE_FAR_Z)
                );
                group.add(spike);
            }

            // A cave in a biome that grows something grows it here too:
            // crystals, mushrooms, ice, a lava seam. Only the props that
            // make sense under a roof are carried down.
            const caveKinds = sc.flora.filter(k => /^(crystal|mushroom|iceshard|spire|rock|bone|tentacle|voxel|grave)$/.test(k));
            if (caveKinds.length) {
                const rng = seededRng(sc.seed ^ 0x5bd1e995);
                const kit = this._sceneryKit(sc);
                for (let i = 0; i < 18; i++) {
                    const side = i % 2 ? 1 : -1;
                    const x = side * (LAKE_HALF_X - 6 + rng() * 6);
                    const z = SHORE_Z - 6 - rng() * (SHORE_Z - LAKE_FAR_Z - 8);
                    const prop = this._floraProp(caveKinds[i % caveKinds.length], rng, kit);
                    if (!prop) continue;
                    prop.position.set(x, 0.4, z);
                    prop.rotation.y = rng() * Math.PI * 2;
                    group.add(prop);
                }
            }

            // The one light source down here that is not the party's own.
            const glowMat = this._mat(mixColor(0x2a6a5a, sc.accent, 0.4), { emissive: mixColor(0x1d4f42, sc.accent, 0.4) });
            for (let i = 0; i < 10; i++) {
                const patch = new THREE.Mesh(new THREE.CircleGeometry(0.5 + Math.random(), 6), glowMat);
                patch.rotation.x = -Math.PI / 2;
                patch.position.set((Math.random() * 2 - 1) * LAKE_HALF_X, 0.9, SHORE_Z + 2 + Math.random() * 6);
                group.add(patch);
            }

            this._buildJetty(group, 0x4a4038, 0x332c26);
            this.scene.add(group);
            this._shore = group;
            this._track(group);
        }

        // Fishing in a building: a tiled tank or cistern with a walkway round
        // it, strip lights overhead and a room to be standing in.
        _buildIndoor() {
            const group = new THREE.Group();
            const tileMat = this._mat(0xdfe9ee);
            const deckMat = this._mat(0xc9cec6);
            const trimMat = this._mat(0x2f6fa8);
            const roofMat = this._mat(0x2a3038);

            const width = LAKE_HALF_X * 2 + 26;
            const depth = (SHORE_Z - LAKE_FAR_Z) + 30;
            const midZ = (SHORE_Z + LAKE_FAR_Z) / 2 - 4;

            // Walkway round the water, with the coping strip that edges it.
            group.add(this._slab(width, 3, 16, deckMat, 0, -1.0, SHORE_Z + 8));
            group.add(this._slab(width, 0.5, 1.2, trimMat, 0, 0.55, SHORE_Z + 0.6));
            for (const sx of [-1, 1]) {
                group.add(this._slab(12, 3, depth, deckMat, sx * (LAKE_HALF_X + 7), -1.0, midZ));
                group.add(this._slab(1.2, 0.5, depth, trimMat, sx * (LAKE_HALF_X + 0.6), 0.55, midZ));
            }
            group.add(this._slab(width, 3, 14, deckMat, 0, -1.0, LAKE_FAR_Z - 6));

            // Walls and ceiling.
            for (const sx of [-1, 1]) {
                group.add(this._slab(1.5, 14, depth + 20, tileMat, sx * (LAKE_HALF_X + 13), 6, midZ));
            }
            group.add(this._slab(width + 6, 14, 1.5, tileMat, 0, 6, SHORE_Z + 16));
            group.add(this._slab(width + 6, 14, 1.5, tileMat, 0, 6, LAKE_FAR_Z - 12));
            group.add(this._slab(width + 8, 1.2, depth + 22, roofMat, 0, 13.4, midZ));

            const lampMat = this._mat(0xf4ffff, { emissive: 0xbfe6ff });
            for (let z = LAKE_FAR_Z; z < SHORE_Z + 12; z += 14) {
                group.add(this._slab(10, 0.3, 1.4, lampMat, -12, 12.5, z));
                group.add(this._slab(10, 0.3, 1.4, lampMat, 12, 12.5, z));
            }

            // The plumbing that makes it a tank rather than a pond, and a
            // handrail so it reads as somewhere the public is allowed.
            const pipeMat = this._mat(0x7d848c);
            for (const sx of [-1, 1]) {
                const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, depth * 0.8, 6), pipeMat);
                pipe.rotation.x = Math.PI / 2;
                pipe.position.set(sx * (LAKE_HALF_X + 11.5), 9, midZ);
                group.add(pipe);
            }
            const railMat = this._mat(0xb0b6ba);
            for (let x = -LAKE_HALF_X - 2; x <= LAKE_HALF_X + 2; x += 4) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 4), railMat);
                post.position.set(x, 1.05, SHORE_Z + 4.5);
                group.add(post);
            }
            const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, LAKE_HALF_X * 2 + 6, 4), railMat);
            rail.rotation.z = Math.PI / 2;
            rail.position.set(0, 1.6, SHORE_Z + 4.5);
            group.add(rail);

            this._buildJetty(group, 0x8a8f88, 0x6e736c);
            this.scene.add(group);
            this._shore = group;
            this._track(group);
        }

        _slab(w, h, d, mat, x, y, z) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            mesh.position.set(x, y, z);
            return mesh;
        }

        // The platform the rod is cast from, in whatever material the venue is
        // made of. Every venue needs one: the rod tip has to be over water.
        _buildJetty(group, plankColor, postColor) {
            const plankMat = this._mat(plankColor);
            for (let i = 0; i < 7; i++) {
                group.add(this._slab(3.4, 0.22, 1.0, plankMat, 0, 0.72, SHORE_Z + 3.2 - i * 1.15));
            }
            const postMat = this._mat(postColor);
            for (const px of [-1.4, 1.4]) {
                for (const pz of [SHORE_Z + 3.0, SHORE_Z - 3.0]) {
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3.2, 5), postMat);
                    post.position.set(px, -0.8, pz);
                    group.add(post);
                }
            }
        }

        // Under the open sky the biome dresses the whole shore: the bank and the
        // headlands wear its ground, its own props stand along the banks, and
        // its skyline (hills, dunes, mesas, peaks, a volcano or a city) closes
        // the view behind the far shore.
        _buildOpenShore() {
            const sc = this._scenery;
            const pal = this._pal;
            const group = new THREE.Group();
            const rng = seededRng(sc.seed);
            const kit = this._sceneryKit(sc);
            const bankMat = this._mat(pal.bank);

            // Bank behind the player.
            group.add(this._slab(140, 4, 40, bankMat, 0, -1.4, SHORE_Z + 20));

            // A dip of shoreline sand where the bank meets the water.
            group.add(this._slab(140, 1.6, 6, this._mat(pal.night ? shadeColor(sc.sand, 0.5) : sc.sand), 0, -0.5, SHORE_Z + 1.2));

            // Side headlands so the lake reads as enclosed rather than infinite.
            for (const sx of [-1, 1]) {
                group.add(this._slab(26, 5, 120, bankMat, sx * (LAKE_HALF_X + 14), -1.6, LAKE_FAR_Z / 2 + 10));
            }

            // Far shore across the water, unless this is open sea all the way
            // to the horizon.
            if (!sc.noFarShore) {
                group.add(this._slab(180, 6, 24, bankMat, 0, -1.8, LAKE_FAR_Z - 10));
            }

            // The biome's own props, along the far shore and the headlands.
            const kinds = sc.flora;
            for (let i = 0; i < sc.density; i++) {
                const onFar = !sc.noFarShore && i % 3 !== 0;
                const x = onFar ? (rng() * 2 - 1) * 80 : (rng() < 0.5 ? -1 : 1) * (LAKE_HALF_X + 6 + rng() * 18);
                const z = onFar ? LAKE_FAR_Z - 4 - rng() * 16 : LAKE_FAR_Z / 2 + (rng() * 2 - 1) * 50;
                const prop = this._floraProp(kinds[i % kinds.length], rng, kit);
                if (!prop) continue;
                prop.position.x += x;
                prop.position.y += 0.6;
                prop.position.z += z;
                prop.rotation.y = rng() * Math.PI * 2;
                group.add(prop);
            }

            this._buildHills(group, sc, rng, kit);

            // The dock the player stands on, jutting out over the water.
            this._buildJetty(group, 0x6b4a2c, 0x4e3520);

            this.scene.add(group);
            this._shore = group;
            this._track(group);
        }

        // One shared set of materials per biome, so fifty trees are not fifty
        // materials.
        _sceneryKit(sc) {
            const night = this._pal.night;
            const dim = c => (night ? shadeColor(c, 0.5) : c);
            return {
                sc: sc,
                night: night,
                trunk: this._mat(dim(mixColor(0x4a3420, sc.ground, 0.2))),
                leaf: sc.glow ? this._mat(sc.leaf, { emissive: shadeColor(sc.leaf, 0.45) }) : this._mat(dim(sc.leaf)),
                leafDark: this._mat(dim(shadeColor(sc.leaf, 0.7))),
                rock: this._mat(dim(mixColor(0x6a665e, sc.ground, 0.3))),
                accent: this._mat(dim(sc.accent)),
                glow: this._mat(sc.accent, { emissive: shadeColor(sc.accent, 0.6) }),
                lava: this._mat(0xff6a20, { emissive: 0xd0431a }),
                snow: this._mat(dim(0xf4f8fc)),
                ice: this._mat(dim(0xbfe6f4), { transparent: true, opacity: 0.85 }),
                wall: this._mat(dim(mixColor(0xc8b8a0, sc.accent, 0.2))),
                concrete: this._mat(dim(mixColor(0x8a8a8a, sc.accent, 0.15))),
                roof: this._mat(dim(0x8a3a2a)),
                wood: this._mat(dim(0x7a5a38)),
                metal: this._mat(dim(0x6a7078)),
                rust: this._mat(dim(0x8a4a2a)),
                stone: this._mat(dim(0xd8d4c8)),
                bone: this._mat(dim(0xe8e0c8)),
                red: this._mat(dim(0xc8302a)),
                hay: this._mat(dim(0xd8b850)),
                cloud: this._mat(0xffffff, { emissive: 0x9a9a9a }),
                window: this._mat(0xffd890, { emissive: night ? 0xffc060 : 0x3a3020 }),
                wire: new THREE.MeshBasicMaterial({ color: sc.accent, wireframe: true })
            };
        }

        _part(geo, mat, x, y, z) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x || 0, y || 0, z || 0);
            return m;
        }

        // One prop of the named kind, standing on its own origin.
        _floraProp(kind, r, k) {
            const g = new THREE.Group();
            const P = (geo, mat, x, y, z) => { const m = this._part(geo, mat, x, y, z); g.add(m); return m; };
            switch (kind) {
                case 'broadleaf': {
                    const h = 2.4 + r() * 2;
                    P(new THREE.CylinderGeometry(0.22, 0.32, h, 5), k.trunk, 0, h / 2, 0);
                    P(new THREE.IcosahedronGeometry(1.5 + r(), 0), k.leaf, 0, h + 0.9, 0);
                    if (r() < 0.5) P(new THREE.IcosahedronGeometry(1 + r() * 0.6, 0), k.leafDark, 0.9, h + 0.2, 0.3);
                    break;
                }
                case 'conifer': case 'snowpine': {
                    const h = 3 + r() * 4;
                    P(new THREE.CylinderGeometry(0.22, 0.3, h, 4), k.trunk, 0, h / 2, 0);
                    const w = 1.2 + r();
                    P(new THREE.ConeGeometry(w, 2.6 + r() * 2, 5), k.leaf, 0, h + 0.4, 0);
                    P(new THREE.ConeGeometry(w * 0.7, 2 + r(), 5), kind === 'snowpine' ? k.snow : k.leaf, 0, h + 2, 0);
                    break;
                }
                case 'bush':
                    P(new THREE.DodecahedronGeometry(0.8 + r() * 0.7, 0), k.leaf, 0, 0.5, 0).scale.y = 0.7;
                    break;
                case 'flower':
                    P(new THREE.DodecahedronGeometry(0.5, 0), k.leafDark, 0, 0.3, 0);
                    for (let i = 0; i < 4; i++) {
                        P(new THREE.OctahedronGeometry(0.22, 0), k.glow, (r() - 0.5) * 1.4, 0.7 + r() * 0.3, (r() - 0.5) * 1.4);
                    }
                    break;
                case 'reed':
                    for (let i = 0; i < 6; i++) {
                        const h = 1.4 + r() * 1.4;
                        const s = P(new THREE.CylinderGeometry(0.04, 0.06, h, 3), k.leafDark, (r() - 0.5) * 1.6, h / 2, (r() - 0.5) * 1.6);
                        s.rotation.z = (r() - 0.5) * 0.3;
                        if (r() < 0.5) P(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 4), k.trunk, s.position.x, h, s.position.z);
                    }
                    break;
                case 'fence':
                    for (let i = 0; i < 4; i++) P(new THREE.BoxGeometry(0.2, 1.3, 0.2), k.wood, -3 + i * 2, 0.65, 0);
                    P(new THREE.BoxGeometry(6.4, 0.16, 0.1), k.wood, 0, 1.0, 0);
                    P(new THREE.BoxGeometry(6.4, 0.16, 0.1), k.wood, 0, 0.5, 0);
                    break;
                case 'hay':
                    P(new THREE.CylinderGeometry(1.0, 1.0, 1.3, 8), k.hay, 0, 1.0, 0).rotation.z = Math.PI / 2;
                    break;
                case 'house': {
                    const w = 3.5 + r() * 2, d = 3.5 + r() * 2, h = 2.6 + r() * 1.4;
                    P(new THREE.BoxGeometry(w, h, d), k.wall, 0, h / 2, 0);
                    const roof = P(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2 + r(), 4), k.roof, 0, h + 1.1, 0);
                    roof.rotation.y = Math.PI / 4;
                    P(new THREE.BoxGeometry(0.7, 0.7, 0.1), k.window, w * 0.2, h * 0.6, d / 2 + 0.05);
                    P(new THREE.BoxGeometry(0.7, 0.7, 0.1), k.window, -w * 0.2, h * 0.6, d / 2 + 0.05);
                    break;
                }
                case 'jungle': {
                    const h = 5 + r() * 4;
                    P(new THREE.CylinderGeometry(0.3, 0.45, h, 5), k.trunk, 0, h / 2, 0);
                    for (let i = 0; i < 3; i++) {
                        P(new THREE.IcosahedronGeometry(1.6 + r() * 1.2, 0), i % 2 ? k.leafDark : k.leaf,
                            (r() - 0.5) * 2.4, h - 0.4 + r() * 1.4, (r() - 0.5) * 2.4).scale.y = 0.6;
                    }
                    break;
                }
                case 'palm': {
                    const h = 4 + r() * 3, lean = (r() - 0.5) * 0.5;
                    let x = 0;
                    for (let i = 0; i < 4; i++) {
                        P(new THREE.CylinderGeometry(0.2, 0.26, h / 4, 5), k.trunk, x, h / 8 + i * h / 4, 0);
                        x += lean * (i + 1) * 0.35;
                    }
                    for (let i = 0; i < 6; i++) {
                        const f = P(new THREE.BoxGeometry(2.6, 0.06, 0.5), k.leaf, x, h, 0);
                        f.rotation.y = i * Math.PI / 3;
                        f.rotation.z = -0.35;
                        f.translateX(1.2);
                    }
                    break;
                }
                case 'mangrove': {
                    for (let i = 0; i < 4; i++) {
                        const root = P(new THREE.CylinderGeometry(0.08, 0.14, 2.4, 4), k.trunk,
                            Math.cos(i * 1.57) * 0.7, 1.0, Math.sin(i * 1.57) * 0.7);
                        root.rotation.set(Math.sin(i * 1.57) * 0.45, 0, -Math.cos(i * 1.57) * 0.45);
                    }
                    P(new THREE.CylinderGeometry(0.22, 0.26, 2.2, 5), k.trunk, 0, 3.0, 0);
                    P(new THREE.IcosahedronGeometry(2 + r(), 0), k.leaf, 0, 4.6, 0).scale.y = 0.6;
                    break;
                }
                case 'dead': {
                    const h = 3 + r() * 3;
                    P(new THREE.CylinderGeometry(0.14, 0.28, h, 4), k.trunk, 0, h / 2, 0);
                    for (let i = 0; i < 3; i++) {
                        const b = P(new THREE.CylinderGeometry(0.05, 0.1, 1.6 + r(), 3), k.trunk, 0, h * (0.55 + i * 0.15), 0);
                        b.rotation.set(0, i * 2.1, 0.7 + r() * 0.4);
                        b.translateY(0.7);
                    }
                    break;
                }
                case 'bamboo': {
                    const n = 5 + Math.floor(r() * 4);
                    for (let i = 0; i < n; i++) {
                        const h = 5 + r() * 4;
                        const x = (r() - 0.5) * 1.8, z = (r() - 0.5) * 1.8;
                        P(new THREE.CylinderGeometry(0.1, 0.12, h, 5), k.leafDark, x, h / 2, z);
                        P(new THREE.ConeGeometry(0.5, 1.2, 4), k.leaf, x, h + 0.3, z);
                    }
                    break;
                }
                case 'rock': {
                    const s = 0.7 + r() * 1.5;
                    const m = P(new THREE.DodecahedronGeometry(s, 0), k.rock, 0, s * 0.35, 0);
                    m.rotation.set(r() * 3, r() * 3, r() * 3);
                    break;
                }
                case 'cactus': {
                    const h = 2.6 + r() * 2.4;
                    P(new THREE.CylinderGeometry(0.3, 0.34, h, 6), k.leaf, 0, h / 2, 0);
                    for (const sx of [-1, 1]) {
                        if (r() < 0.25) continue;
                        const y = h * (0.35 + r() * 0.25), up = 0.8 + r() * 0.8;
                        P(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 5), k.leaf, sx * 0.55, y, 0).rotation.z = Math.PI / 2;
                        P(new THREE.CylinderGeometry(0.18, 0.2, up, 5), k.leaf, sx * 0.85, y + up / 2, 0);
                    }
                    break;
                }
                case 'crystal': {
                    const n = 3 + Math.floor(r() * 3);
                    for (let i = 0; i < n; i++) {
                        const rad = 0.5 + r() * 0.5, sy = 2.2 + r() * 1.6;
                        const c = P(new THREE.OctahedronGeometry(rad, 0), k.glow, (r() - 0.5) * 1.6, rad * sy * 0.6, (r() - 0.5) * 1.6);
                        c.scale.y = sy;
                        c.rotation.set((r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6);
                    }
                    break;
                }
                case 'acacia': {
                    const h = 3 + r() * 1.5;
                    const t = P(new THREE.CylinderGeometry(0.16, 0.28, h, 4), k.trunk, 0, h / 2, 0);
                    t.rotation.z = (r() - 0.5) * 0.3;
                    P(new THREE.CylinderGeometry(2.8 + r(), 2.2, 0.6, 7), k.leaf, 0, h + 0.2, 0);
                    break;
                }
                case 'grass':
                    for (let i = 0; i < 7; i++) {
                        const h = 0.7 + r() * 0.6;
                        P(new THREE.ConeGeometry(0.12, h, 3), k.leaf, (r() - 0.5) * 1.6, h / 2, (r() - 0.5) * 1.6);
                    }
                    break;
                case 'iceshard': {
                    const n = 2 + Math.floor(r() * 3);
                    for (let i = 0; i < n; i++) {
                        const h = 2 + r() * 4;
                        const c = P(new THREE.ConeGeometry(0.5 + r() * 0.5, h, 4), k.ice, (r() - 0.5) * 2, h / 2, (r() - 0.5) * 2);
                        c.rotation.set((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
                    }
                    break;
                }
                case 'spire': {
                    const h = 4 + r() * 8;
                    P(new THREE.ConeGeometry(0.8 + r() * 1.2, h, 5), k.sc.lava ? k.rock : k.accent, 0, h / 2, 0);
                    if (k.sc.lava && r() < 0.6) P(new THREE.CircleGeometry(1.2, 6), k.lava, 0, 0.08, 0).rotation.x = -Math.PI / 2;
                    break;
                }
                case 'bone':
                    for (let i = 0; i < 4; i++) {
                        const rib = P(new THREE.TorusGeometry(1.4, 0.12, 4, 8, Math.PI), k.bone, 0, 0, -1.5 + i);
                        rib.rotation.y = Math.PI / 2;
                    }
                    break;
                case 'building': {
                    const w = 4 + r() * 4, d = 4 + r() * 4, h = 8 + r() * 14;
                    P(new THREE.BoxGeometry(w, h, d), k.concrete, 0, h / 2, 0);
                    for (let y = 2; y < h - 1; y += 2.4) {
                        for (let x = -w / 2 + 1; x < w / 2 - 0.5; x += 1.6) {
                            if (r() < 0.45) P(new THREE.BoxGeometry(0.8, 1, 0.1), k.window, x, y, d / 2 + 0.05);
                        }
                    }
                    break;
                }
                case 'lamp':
                    P(new THREE.CylinderGeometry(0.08, 0.1, 4, 4), k.metal, 0, 2, 0);
                    P(new THREE.BoxGeometry(0.5, 0.3, 0.5), k.window, 0, 4.1, 0);
                    break;
                case 'chimney': {
                    const h = 12 + r() * 8;
                    P(new THREE.CylinderGeometry(0.8, 1.2, h, 6), k.concrete, 0, h / 2, 0);
                    P(new THREE.CylinderGeometry(0.85, 0.85, 1, 6), k.red, 0, h - 1.5, 0);
                    break;
                }
                case 'tank':
                    P(new THREE.CylinderGeometry(2.4, 2.4, 4, 8), k.metal, 0, 2, 0);
                    P(new THREE.SphereGeometry(2.4, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), k.metal, 0, 4, 0);
                    break;
                case 'tower': {
                    const h = 8 + r() * 5;
                    P(new THREE.CylinderGeometry(1.8, 2, h, 7), k.rock, 0, h / 2, 0);
                    P(new THREE.ConeGeometry(2.3, 3.4, 7), k.roof, 0, h + 1.7, 0);
                    P(new THREE.BoxGeometry(0.5, 0.9, 0.1), k.window, 0, h * 0.7, 1.9);
                    break;
                }
                case 'column': {
                    const h = 2 + r() * 4;
                    const c = P(new THREE.CylinderGeometry(0.45, 0.5, h, 8), k.stone, 0, h / 2, 0);
                    if (h > 4) P(new THREE.BoxGeometry(1.3, 0.35, 1.3), k.stone, 0, h + 0.17, 0);
                    else c.rotation.z = (r() - 0.5) * 0.3;
                    break;
                }
                case 'torii':
                    for (const sx of [-1, 1]) P(new THREE.CylinderGeometry(0.22, 0.26, 4.5, 6), k.red, sx * 1.8, 2.25, 0);
                    P(new THREE.BoxGeometry(5.4, 0.35, 0.5), k.red, 0, 4.6, 0);
                    P(new THREE.BoxGeometry(4.2, 0.25, 0.35), k.red, 0, 3.7, 0);
                    break;
                case 'grave':
                    if (r() < 0.4) {
                        P(new THREE.BoxGeometry(0.2, 1.6, 0.2), k.rock, 0, 0.8, 0);
                        P(new THREE.BoxGeometry(0.9, 0.2, 0.2), k.rock, 0, 1.15, 0);
                    } else {
                        P(new THREE.BoxGeometry(0.8, 1.1, 0.25), k.rock, 0, 0.55, 0).rotation.z = (r() - 0.5) * 0.25;
                    }
                    break;
                case 'junk': {
                    const b = P(new THREE.BoxGeometry(2.6, 1.1, 1.4), k.rust, 0, 0.55, 0);
                    b.rotation.set(0, 0, (r() - 0.5) * 0.4);
                    P(new THREE.TorusGeometry(0.4, 0.16, 4, 8), k.metal, 1.8, 0.3, 0.6).rotation.x = Math.PI / 2;
                    break;
                }
                case 'mushroom': {
                    const h = 1 + r() * 3, cap = 0.8 + h * 0.5;
                    P(new THREE.CylinderGeometry(0.15 + h * 0.05, 0.25 + h * 0.06, h, 6), k.bone, 0, h / 2, 0);
                    P(new THREE.SphereGeometry(cap, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), k.glow, 0, h - 0.1, 0);
                    break;
                }
                case 'spirittree': {
                    const h = 3 + r() * 3;
                    P(new THREE.CylinderGeometry(0.2, 0.32, h, 5), k.bone, 0, h / 2, 0);
                    P(new THREE.IcosahedronGeometry(1.5 + r(), 0), k.glow, 0, h + 0.9, 0);
                    break;
                }
                case 'tentacle': {
                    let x = 0, y = 0, rad = 0.6;
                    const bend = (r() - 0.5) * 0.8;
                    for (let i = 0; i < 6; i++) {
                        P(new THREE.SphereGeometry(rad, 5, 4), i % 2 ? k.leaf : k.accent, x, y + rad, 0);
                        y += rad * 1.5; x += bend * i * 0.3; rad *= 0.82;
                    }
                    break;
                }
                case 'floater': {
                    const geo = [new THREE.OctahedronGeometry(1, 0), new THREE.BoxGeometry(1.4, 1.4, 1.4),
                                 new THREE.IcosahedronGeometry(1, 0)][Math.floor(r() * 3)];
                    const m = P(geo, k.glow, 0, 4 + r() * 8, 0);
                    m.rotation.set(r() * 3, r() * 3, r() * 3);
                    (this._floaters || (this._floaters = [])).push({ obj: m, y: m.position.y, phase: r() * 6.28 });
                    break;
                }
                case 'voxel': {
                    const n = 2 + Math.floor(r() * 4);
                    for (let i = 0; i < n; i++) {
                        P(new THREE.BoxGeometry(1.5, 1.5, 1.5), i % 2 ? k.wire : k.glow, 0, 0.75 + i * 1.5, 0);
                    }
                    break;
                }
                case 'cloud':
                    for (let i = 0; i < 4; i++) {
                        P(new THREE.IcosahedronGeometry(1 + r() * 0.8, 0), k.cloud, (i - 1.5) * 1.1, 0.6 + r() * 0.5, (r() - 0.5)).scale.y = 0.6;
                    }
                    break;
                case 'alienplant': {
                    const h = 2 + r() * 4;
                    P(new THREE.CylinderGeometry(0.1, 0.25, h, 4), k.leafDark, 0, h / 2, 0);
                    P(new THREE.SphereGeometry(0.6 + r() * 0.6, 5, 4), k.glow, 0, h + 0.3, 0);
                    for (let i = 0; i < 3; i++) {
                        const t = P(new THREE.ConeGeometry(0.12, 1.4, 3), k.leaf, 0, h * 0.5, 0);
                        t.rotation.set(0, i * 2.1, 1.0);
                        t.translateY(0.6);
                    }
                    break;
                }
                default:
                    return null;
            }
            return g;
        }

        // The skyline beyond the far shore. Far enough back that the fog
        // turns it into a silhouette rather than scenery to walk to.
        _buildHills(group, sc, rng, kit) {
            if (sc.hills === 'none' || sc.noFarShore) return;
            const night = this._pal.night;
            const base = night ? shadeColor(sc.hillColor, 0.45) : sc.hillColor;
            const hillMat = this._mat(base);
            const zBack = () => LAKE_FAR_Z - 24 - rng() * 22;
            const H = (geo, mat, x, y, z) => { const m = this._part(geo, mat, x, y, z); group.add(m); return m; };
            switch (sc.hills) {
                case 'rolling':
                case 'dunes': {
                    const mat = sc.hills === 'dunes' ? this._mat(night ? shadeColor(sc.sand, 0.45) : sc.sand) : hillMat;
                    for (let i = 0; i < 9; i++) {
                        const r = 16 + rng() * 16;
                        H(new THREE.SphereGeometry(r, 9, 5), mat, -110 + i * 27 + rng() * 10, -r * (sc.hills === 'dunes' ? 0.2 : 0.3), zBack())
                            .scale.y = sc.hills === 'dunes' ? 0.45 : 0.7;
                    }
                    break;
                }
                case 'mountains':
                    for (let i = 0; i < 8; i++) {
                        const r = 14 + rng() * 12, h = 24 + rng() * 22;
                        const x = -105 + i * 30 + rng() * 10, z = zBack() - 8;
                        H(new THREE.ConeGeometry(r, h, 5), hillMat, x, h / 2 - 2, z);
                        if (sc.snowcaps) H(new THREE.ConeGeometry(r * 0.32, h * 0.32, 5), kit.snow, x, h - 2 - h * 0.16 + 0.05, z);
                    }
                    break;
                case 'mesas':
                    for (let i = 0; i < 7; i++) {
                        const r = 8 + rng() * 9, h = 10 + rng() * 12;
                        H(new THREE.CylinderGeometry(r * 0.85, r, h, 6), hillMat, -100 + i * 32 + rng() * 10, h / 2 - 1, zBack());
                    }
                    break;
                case 'volcano': {
                    const z = LAKE_FAR_Z - 44;
                    H(new THREE.CylinderGeometry(6, 34, 34, 8), hillMat, -12, 16, z);
                    H(new THREE.CircleGeometry(5.5, 8), kit.lava, -12, 33.1, z).rotation.x = -Math.PI / 2;
                    for (let i = 0; i < 4; i++) {
                        const r = 10 + rng() * 8, h = 12 + rng() * 10;
                        H(new THREE.ConeGeometry(r, h, 5), hillMat, (i < 2 ? -70 : 50) + rng() * 30, h / 2 - 1, zBack());
                    }
                    break;
                }
                case 'skyline':
                    for (let i = 0; i < 16; i++) {
                        const w = 6 + rng() * 8, h = 14 + rng() * 28;
                        const x = -115 + i * 15 + rng() * 6, z = zBack();
                        H(new THREE.BoxGeometry(w, h, 8), hillMat, x, h / 2 - 1, z);
                        for (let j = 0; j < 6; j++) {
                            if (rng() < 0.5) H(new THREE.BoxGeometry(1.1, 1.3, 0.1), kit.window,
                                x + (rng() - 0.5) * (w - 2), 2 + rng() * (h - 4), z + 4.05);
                        }
                    }
                    break;
            }
        }

        // The rod lives in camera space, so it always hangs in the same corner of
        // the frame the way a first-person prop should.
        _buildRod() {
            const rod = new THREE.Group();
            const rodMat = this._mat(0x3a2a1c);
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.035, 1.9, 5), rodMat);
            shaft.position.set(0, 0.95, 0);
            rod.add(shaft);

            const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.34, 6), this._mat(0x1e1a16));
            grip.position.set(0, 0.16, 0);
            rod.add(grip);

            const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.10, 8), this._mat(0x9a9aa4));
            reel.rotation.z = Math.PI / 2;
            reel.position.set(0.10, 0.40, 0);
            rod.add(reel);
            this._reelMesh = reel;

            // Empty marker at the rod tip; the line is anchored to its world pos.
            const tip = new THREE.Object3D();
            tip.position.set(0, 1.9, 0);
            rod.add(tip);
            this._rodTip = tip;

            rod.position.set(0.46, -0.62, -0.95);
            rod.rotation.set(0.30, -0.16, -0.42);
            this.camera.add(rod);
            this._rod = rod;
            this._track(rod);
        }

        _buildBobber() {
            const g = new THREE.Group();
            const top = new THREE.Mesh(new THREE.SphereGeometry(0.20, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0xf2f2f2));
            const bot = new THREE.Mesh(new THREE.SphereGeometry(0.20, 6, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this._mat(0xd02a20));
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 4), this._mat(0xffcc33));
            ant.position.y = 0.24;
            g.add(top); g.add(bot); g.add(ant);
            g.visible = false;
            this.scene.add(g);
            this._bobber = g;
            this._track(g);

            // Ripple ring that sits around the bobber while it floats.
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 12),
                this._mat(0xdff2ff, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2;
            ring.visible = false;
            this.scene.add(ring);
            this._bobberRing = ring;
            this._track(ring);
        }

        // Where the cast is going to come down, shown on the water while the
        // player aims and swings the power bar. The lake gets deeper the further
        // out you throw and every species has its own depth band, so seeing the
        // landing spot IS the aiming skill.
        _buildCastMarker() {
            const g = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 16),
                this._mat(0xffe066, { transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2;
            g.add(ring);
            const pip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 4),
                this._mat(0xffe066, { transparent: true, opacity: 0.9 }));
            pip.rotation.x = Math.PI;
            pip.position.y = 1.1;
            g.add(pip);
            g.visible = false;
            this.scene.add(g);
            this._castMarker = g;
            this._castRing = ring;
            this._castPip = pip;
            this._track(g);
        }

        // `onWater` is false when the swing as aimed would put the hook on dry
        // land or over the far bank. The marker says so before the cast is spent
        // rather than after, so a wasted throw is always the player's choice.
        setCastMarker(x, z, visible, onWater) {
            const g = this._castMarker;
            g.visible = !!visible;
            if (!visible) return;
            const col = onWater === false ? 0xff5533 : 0xffe066;
            this._castRing.material.color.setHex(col);
            this._castPip.material.color.setHex(col);
            g.position.set(x, WATER_Y + 0.06 + waveHeight(x, z, this._t), z);
            const pulse = 1 + Math.sin(this._t * 6) * 0.12;
            g.scale.set(pulse, 1, pulse);
            this._castPip.position.y = 1.1 + Math.sin(this._t * 4) * 0.18;
        }

        // The line is a verlet rope: a chain of point masses pinned to the rod
        // tip at one end and the hook at the other, with gravity, air drag and a
        // breeze acting on everything in between. Nothing is faked with a sine
        // curve, so it whips out behind the cast, hangs in a real catenary while
        // the bobber sits, lies on the water where it touches it, and pulls dead
        // straight the moment a fish loads it up.
        _buildLine() {
            const SEG = ROPE_SEG;
            const pos = new Float32Array((SEG + 1) * 3);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe8e4d8, transparent: true, opacity: 0.75, fog: false }));
            line.frustumCulled = false;
            line.visible = false;
            this.scene.add(line);
            this._line = line;
            this._lineSeg = SEG;
            this._rope = [];
            for (let i = 0; i <= SEG; i++) {
                this._rope.push({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 });
            }
        }

        // Rain / snow particles mirroring the map weather, if any. It does not
        // rain indoors, and the map's weather is the weather outside.
        _buildWeather() {
            if (this._venue !== VENUE_OPEN) return;
            const type = ($gameScreen && $gameScreen.weatherType) ? $gameScreen.weatherType() : 'none';
            if (!type || type === 'none') return;
            const N = type === 'storm' ? 700 : 400;
            const pos = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {
                pos[i * 3]     = (Math.random() * 2 - 1) * 60;
                pos[i * 3 + 1] = Math.random() * 40;
                pos[i * 3 + 2] = SHORE_Z - Math.random() * 90;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const snow = type === 'snow';
            const mat = new THREE.PointsMaterial({
                color: snow ? 0xffffff : 0xa8c8e0,
                size: snow ? 0.9 : 0.5,
                transparent: true, opacity: snow ? 0.9 : 0.6, fog: false
            });
            const pts = new THREE.Points(geo, mat);
            this.scene.add(pts);
            this._weather = { points: pts, snow: snow, fall: snow ? 5 : 34, drift: snow ? 2.2 : 0.6 };
        }

        //---------------------------------------------------------------------
        // Entities
        //---------------------------------------------------------------------
        // Build a procedural battler for an archetype key. Returns null if the
        // battler stack is missing or the key is unknown.
        async _makeBattler(key, seedId) {
            if (!battlerStackReady()) return null;
            const fake = { enemyId: () => seedId || 1, index: () => 0 };
            let battler = null;
            try { battler = window.Battler3D.create(key, undefined, 0, fake, 0); } catch (e) { battler = null; }
            if (!battler) return null;
            try { await battler.load(null, 0, 0, 0); } catch (e) { return null; }
            if (!battler.model) return null;
            // Non-bipedal models are authored facing slightly off-axis; the battle
            // scene corrects that with a yawed wrapper, so do the same here.
            if (battler.facingYaw && !battler._facingApplied) {
                battler._facingApplied = true;
                const inner = new THREE.Group();
                inner.rotation.y = battler.facingYaw;
                const kids = battler.model.children.slice();
                for (const k of kids) inner.add(k);
                battler.model.add(inner);
            }
            if (battler.setGaitSpeed) battler.setGaitSpeed(4);
            if (battler.playGait) battler.playGait('swim');
            else if (battler.playIdleAnimation) battler.playIdleAnimation();
            this._track(battler.model);
            return battler;
        }

        // Flat-shaded stand-in used when no 3D model can be built, so the game is
        // still playable without the battler family plugins.
        _buildFallbackFish(color) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 5), this._mat(color));
            body.rotation.x = Math.PI / 2;
            g.add(body);
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 3), this._mat(color));
            tail.rotation.x = -Math.PI / 2;
            tail.position.z = -0.95;
            g.add(tail);
            const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), this._mat(color));
            fin.position.set(0, 0.34, 0.1);
            g.add(fin);
            this._track(g);
            return g;
        }

        // Junk pulled out of the water: the item icon on a nearest-filtered quad,
        // which is exactly how a PSX game would have done it.
        _buildItemBillboard(iconIndex) {
            const tex = iconTexture(iconIndex);
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, fog: true });
            const q = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), mat);
            const g = new THREE.Group();
            g.add(q);
            // A dark backing plate: an unlit icon over bright water reads as a
            // smear otherwise, and this is cheaper than a shader outline.
            const back = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
                this._mat(0x0a1418, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
            back.position.z = -0.02;
            g.add(back);
            g.userData.billboard = q;
            this._track(g);
            return g;
        }

        async addFish(fishData) {
            if (this._disposed) return null;
            const nameKey = String(fishData.name || '').toLowerCase();
            const key = FISH_MODEL_KEYS[nameKey] ||
                (battlerStackReady() && window.Battler3D.resolveKey ? window.Battler3D.resolveKey({ name: fishData.name, meta: {} }) : null) ||
                'reeffish';

            const rig = new THREE.Group();
            const battler = await this._makeBattler(key, 400 + (fishData.id || 1));
            if (this._disposed) return null;
            if (battler) rig.add(battler.model);
            else rig.add(this._buildFallbackFish(0x5f9ec0));

            const sc = SIZE_SCALE[String(fishData.size || 'medium').toLowerCase()] || SIZE_SCALE.medium;
            rig.scale.setScalar(sc);

            const depth = fishData.depth || [1, 6];
            const ent = new FishEntity('fish', fishData, rig, battler, {
                depthMin: depth[0], depthMax: depth[1],
                speed: 0.7 + (fishData.speed || 1) * 0.55,
                difficulty: fishData.catchDifficulty || 1,
                iconIndex: fishData.iconIndex || 0
            });
            this._placeRandomly(ent);
            this.scene.add(rig);
            this.entities.push(ent);
            return ent;
        }

        async addMonster(troop) {
            if (this._disposed || !troop || !troop.members || !troop.members.length) return null;
            const enemy = $dataEnemies[troop.members[0].enemyId];
            if (!enemy) return null;
            const key = (battlerStackReady() && window.Battler3D.resolveKey) ? window.Battler3D.resolveKey(enemy) : null;

            const rig = new THREE.Group();
            const battler = key ? await this._makeBattler(key, enemy.id) : null;
            if (this._disposed) return null;
            if (battler) rig.add(battler.model);
            else rig.add(this._buildFallbackFish(0x8a3a3a));
            rig.scale.setScalar(0.72);

            const ent = new FishEntity('monster', troop, rig, battler, {
                depthMin: 3, depthMax: MAX_DEPTH, speed: 1.4, difficulty: 4.5
            });
            ent.enemyName = enemy.name;
            this._placeRandomly(ent);
            this.scene.add(rig);
            this.entities.push(ent);
            return ent;
        }

        addItem(itemData) {
            if (this._disposed) return null;
            const rig = this._buildItemBillboard(itemData.iconIndex || 0);
            const ent = new FishEntity('item', itemData, rig, null, {
                depthMin: 2, depthMax: MAX_DEPTH, speed: 0.25, difficulty: 0.6,
                iconIndex: itemData.iconIndex || 0
            });
            this._placeRandomly(ent);
            this.scene.add(rig);
            this.entities.push(ent);
            return ent;
        }

        // Drop a swimmer for good (it was landed, or the lake is restocking).
        removeEntity(ent) {
            if (!ent) return;
            const i = this.entities.indexOf(ent);
            if (i >= 0) this.entities.splice(i, 1);
            if (ent.rig) {
                if (ent.rig.parent) ent.rig.parent.remove(ent.rig);
                this._disposeTree(ent.rig);
            }
            ent.rig = null;
            ent.battler = null;
        }

        _placeRandomly(ent) {
            let z, tries = 0;
            do {
                z = SHORE_Z - 6 - Math.random() * (SHORE_Z - LAKE_FAR_Z - 10);
                tries++;
            } while (waterDepthAt(z) < ent.depthMin && tries < 24);
            const y = clamp(ent.preferredY(), bedY(z) + 0.7, -0.6);
            ent.rig.position.set((Math.random() * 2 - 1) * (LAKE_HALF_X - 4), y, z);
            ent.rig.rotation.y = ent.heading;
        }

        //---------------------------------------------------------------------
        // Camera
        //---------------------------------------------------------------------
        applyLook(dYaw, dPitch) {
            if (this._autoAim) {
                // While the camera is locked on the hook, look input becomes a
                // bounded offset ON TOP of the tracked point rather than a fight
                // against it, so glancing around never loses the line.
                this._offYaw = clamp((this._offYaw || 0) + dYaw, -TRACK_OFFSET, TRACK_OFFSET);
                this._offPitch = clamp((this._offPitch || 0) + dPitch, -TRACK_OFFSET, TRACK_OFFSET);
                return;
            }
            // Coming off a tracking shot the camera can be pointed further round
            // than the player is allowed to aim. Rather than snapping the frame,
            // the limit only ever tightens: input may move the aim inside the
            // range, never further out of it.
            const yLo = Math.min(-LOOK_YAW_LIMIT, this.yaw), yHi = Math.max(LOOK_YAW_LIMIT, this.yaw);
            const pLo = Math.min(LOOK_PITCH_MIN, this.pitch), pHi = Math.max(LOOK_PITCH_MAX, this.pitch);
            this.yaw = clamp(this.yaw + dYaw, yLo, yHi);
            this.pitch = clamp(this.pitch + dPitch, pLo, pHi);
        }

        // Ease the aim onto a world point: the hook, at every stage of the cast.
        // `rate` is the follow stiffness in 1/seconds, so a bobber in flight can
        // be chased far harder than one sitting on the surface.
        lookAtPoint(x, y, z, rate) {
            const v = this._autoAim || (this._autoAim = new THREE.Vector3());
            v.set(x, y, z);
            this._aimRate = rate || TRACK_RATE;
        }

        releaseAim() {
            this._autoAim = null;
            this._offYaw = 0;
            this._offPitch = 0;
        }

        _applyCamera(dt) {
            const step = dt || SIM_DT;
            if (this._autoAim) {
                // Measured from the eye, never from the rod tip: the tip is a
                // child of the camera, so aiming off it would feed the camera's
                // own rotation back into the angle it is easing toward.
                const dx = this._autoAim.x - this.camera.position.x;
                const dy = this._autoAim.y - this.camera.position.y;
                const dz = this._autoAim.z - this.camera.position.z;
                const flat = Math.sqrt(dx * dx + dz * dz);
                const wantYaw = clamp(Math.atan2(-dx, -dz) + (this._offYaw || 0),
                                      -TRACK_YAW_LIMIT, TRACK_YAW_LIMIT);
                const wantPitch = clamp(Math.atan2(dy, flat) + (this._offPitch || 0),
                                        TRACK_PITCH_MIN, TRACK_PITCH_MAX);
                // Exponential ease expressed in real time, so the follow feels
                // identical however the step is scheduled, plus a snap once the
                // error is under a pixel: without it the aim creeps at the hook
                // forever and never actually centres on it.
                const k = 1 - Math.exp(-(this._aimRate || TRACK_RATE) * step);
                const dYaw = wantYaw - this.yaw;
                const dPitch = wantPitch - this.pitch;
                this.yaw = Math.abs(dYaw) < TRACK_SNAP ? wantYaw : this.yaw + dYaw * k;
                this.pitch = Math.abs(dPitch) < TRACK_SNAP ? wantPitch : this.pitch + dPitch * k;
            } else {
                // Free look: drift back inside the player's own aiming range if
                // the last tracking shot left the camera outside it.
                const k = 1 - Math.exp(-4 * step);
                const ty = clamp(this.yaw, -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT);
                const tp = clamp(this.pitch, LOOK_PITCH_MIN, LOOK_PITCH_MAX);
                this.yaw += (ty - this.yaw) * k;
                this.pitch += (tp - this.pitch) * k;
            }
            this.camera.rotation.set(0, 0, 0);
            this.camera.rotateY(this.yaw);
            this.camera.rotateX(this.pitch);
            // The rod tip is read back this same frame to anchor the line, so the
            // camera's world matrix has to be current, not one frame stale.
            this.camera.updateMatrixWorld(true);
        }

        // The camera the frame is drawn through: the spectator eye while the
        // free camera is on, the angler's own otherwise.
        get viewCamera() { return this.freeCam || this.camera; }

        get isFreeCam() { return !!this.freeCam; }

        // Detach the view from the angler. It starts exactly where the angler is
        // looking from, so switching on never cuts; switching off hands the view
        // straight back to the angler, who never moved.
        setFreeCam(on) {
            if (!on) { this.freeCam = null; return; }
            if (this.freeCam) return;
            const c = this._freeView;
            c.position.copy(this.camera.position);
            this._freeYaw = this.yaw;
            this._freePitch = this.pitch;
            this.freeCam = c;
            this._applyFreeCam();
        }

        // Look without a leash: a full turn on yaw, nearly straight up or down
        // on pitch.
        lookFreeCam(dYaw, dPitch) {
            if (!this.freeCam) return;
            this._freeYaw = (this._freeYaw + dYaw) % (Math.PI * 2);
            this._freePitch = clamp(this._freePitch + dPitch, -FREE_PITCH_MAX, FREE_PITCH_MAX);
            this._applyFreeCam();
        }

        // Fly along the view: forward follows the pitch too, so looking down and
        // pressing forward dives. `rise` moves straight up or down in world space.
        moveFreeCam(fwd, strafe, rise, dt) {
            if (!this.freeCam || (!fwd && !strafe && !rise)) return;
            const len = Math.sqrt(fwd * fwd + strafe * strafe + rise * rise) || 1;
            const f = fwd / len, r = strafe / len, u = rise / len;
            const sy = Math.sin(this._freeYaw), cy = Math.cos(this._freeYaw);
            const sp = Math.sin(this._freePitch), cp = Math.cos(this._freePitch);
            const step = FREE_SPEED * dt;
            const pos = this.freeCam.position;
            pos.x = clamp(pos.x + (-sy * cp * f + cy * r) * step, -FREE_X_LIMIT, FREE_X_LIMIT);
            pos.y = clamp(pos.y + (sp * f + u) * step, FREE_Y_MIN, FREE_Y_MAX);
            pos.z = clamp(pos.z + (-cy * cp * f - sy * r) * step, FREE_Z_MIN, FREE_Z_MAX);
            this._applyFreeCam();
        }

        _applyFreeCam() {
            const c = this.freeCam;
            c.rotation.set(0, 0, 0);
            c.rotateY(this._freeYaw);
            c.rotateX(this._freePitch);
            c.updateMatrixWorld(true);
        }

        // Walk the bank. Input is read in camera space (forward is wherever the
        // player is looking, flattened onto the ground) and the result is clamped
        // to the shore, so the angler can pick a stretch of water but can never
        // step into the lake or wander off behind the treeline.
        moveCamera(fwd, strafe, dt) {
            if (!fwd && !strafe) return;
            const len = Math.sqrt(fwd * fwd + strafe * strafe) || 1;
            const f = fwd / len, r = strafe / len;
            const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
            // Forward on the XZ plane for a camera looking down -Z at yaw 0.
            const dx = (-sy * f + cy * r) * CAM_SPEED * dt;
            const dz = (-cy * f - sy * r) * CAM_SPEED * dt;
            const pos = this.camera.position;
            pos.x = clamp(pos.x + dx, -CAM_X_LIMIT, CAM_X_LIMIT);
            pos.z = clamp(pos.z + dz, CAM_Z_MIN, CAM_Z_MAX);
            pos.y = CAM_EYE_Y;
            this.camera.updateMatrixWorld(true);
        }

        // How far the swing may be thrown from where the angler is standing.
        // Walking back up the bank does not shorten the reach into the water:
        // the near limit is pushed out to clear the shoreline along the aim, so
        // the shortest cast always still lands wet.
        castRange() {
            const dir = this.aimDirection();
            const tip = this.rodTipWorld(this._rangeTmp || (this._rangeTmp = new THREE.Vector3()));
            let min = CAST_MIN;
            if (dir.z < -0.05) {
                min = Math.max(CAST_MIN, (tip.z - (SHORE_Z - 4)) / -dir.z);
            }
            return { min: min, max: Math.max(min + 10, CAST_MAX) };
        }

        // Unit vector the player is aiming along, on the XZ plane.
        aimDirection() {
            return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
        }

        rodTipWorld(out) {
            const v = out || new THREE.Vector3();
            this._rodTip.getWorldPosition(v);
            return v;
        }

        //---------------------------------------------------------------------
        // Bobber, line and splashes
        //---------------------------------------------------------------------
        setBobber(x, y, z, visible) {
            this._bobber.position.set(x, y, z);
            this._bobber.visible = !!visible;
            const floating = visible && Math.abs(y - WATER_Y) < 1.2;
            this._bobberRing.visible = !!floating;
            if (floating) this._bobberRing.position.set(x, WATER_Y + 0.03 + waveHeight(x, z, this._t), z);
        }

        setLineVisible(v) { this._line.visible = !!v; }

        isLineVisible() { return !!(this._line && this._line.visible); }

        isBobberVisible() { return !!(this._bobber && this._bobber.visible); }

        // Lay the rope out straight between two points and kill its motion, so a
        // fresh cast does not snap in from wherever the last one left it.
        resetRope(from, to) {
            const n = this._lineSeg;
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                const r = this._rope[i];
                r.x = r.px = lerp(from.x, to.x, t);
                r.y = r.py = lerp(from.y, to.y, t);
                r.z = r.pz = lerp(from.z, to.z, t);
            }
            this._writeRope();
        }

        // Advance the rope one step. `slack` is the fraction of line paid out
        // beyond the straight rod-tip-to-hook run: high while the bobber floats,
        // near zero with a fish pulling.
        updateLine(target, slack, dt) {
            const from = this.rodTipWorld(this._tmpTip || (this._tmpTip = new THREE.Vector3()));
            const rope = this._rope;
            const n = this._lineSeg;
            const step = dt || SIM_DT;

            const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
            const span = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const rest = (span * (1 + clamp(slack == null ? 0.15 : slack, 0, 1))) / n;

            // Integrate the free nodes. Verlet, so velocity is implicit in the
            // gap between the current and previous position.
            const wind = (Math.sin(this._t * 1.7) * 0.7 + Math.sin(this._t * 0.63) * 0.3) * ROPE_WIND;
            const g = ROPE_GRAV * step * step;
            const w = wind * step * step;
            for (let i = 1; i < n; i++) {
                const r = rope[i];
                const vx = (r.x - r.px) * ROPE_DAMP;
                const vy = (r.y - r.py) * ROPE_DAMP;
                const vz = (r.z - r.pz) * ROPE_DAMP;
                r.px = r.x; r.py = r.y; r.pz = r.z;
                r.x += vx + w;
                r.y += vy - g;
                r.z += vz;
            }
            // Pinned ends.
            rope[0].x = from.x;   rope[0].y = from.y;   rope[0].z = from.z;
            rope[n].x = target.x; rope[n].y = target.y; rope[n].z = target.z;

            // Relax the distance constraints. A segment only ever PULLS: one
            // shorter than its rest length is slack and is left alone, which is
            // what lets the curve hang instead of behaving like a rod.
            for (let it = 0; it < ROPE_ITER; it++) {
                for (let i = 0; i < n; i++) {
                    const a = rope[i], b = rope[i + 1];
                    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
                    const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
                    if (d <= rest || d < 1e-6) continue;
                    // A pinned end cannot move, so the free side takes the whole
                    // correction instead of half of it.
                    const wA = i === 0 ? 0 : 1;
                    const wB = i + 1 === n ? 0 : 1;
                    const sum = wA + wB;
                    if (!sum) continue;
                    const c = (d - rest) / d / sum;
                    if (wA) { a.x += ex * c; a.y += ey * c; a.z += ez * c; }
                    if (wB) { b.x -= ex * c; b.y -= ey * c; b.z -= ez * c; }
                }
            }

            // Line floats: whatever sags into the lake rides the surface rather
            // than cutting down through it.
            for (let i = 1; i < n; i++) {
                const r = rope[i];
                const surf = WATER_Y + waveHeight(r.x, r.z, this._t);
                if (r.y < surf) {
                    r.y += (surf - r.y) * 0.5;
                    r.py = lerp(r.py, r.y, 0.6);
                }
            }

            this._writeRope();
        }

        _writeRope() {
            const arr = this._line.geometry.attributes.position.array;
            for (let i = 0; i <= this._lineSeg; i++) {
                const r = this._rope[i];
                arr[i * 3]     = r.x;
                arr[i * 3 + 1] = r.y;
                arr[i * 3 + 2] = r.z;
            }
            this._line.geometry.attributes.position.needsUpdate = true;
        }

        addSplash(x, z, size) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.36, 14),
                this._mat(0xe8f6ff, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(x, WATER_Y + 0.05, z);
            this.scene.add(ring);
            this._track(ring);
            this._splashes.push({ mesh: ring, life: 0, max: 0.9, size: size || 1 });
        }

        _updateSplashes(dt) {
            for (let i = this._splashes.length - 1; i >= 0; i--) {
                const s = this._splashes[i];
                s.life += dt;
                const t = s.life / s.max;
                if (t >= 1) {
                    this.scene.remove(s.mesh);
                    if (s.mesh.geometry) s.mesh.geometry.dispose();
                    if (s.mesh.material) s.mesh.material.dispose();
                    this._splashes.splice(i, 1);
                    continue;
                }
                const sc = 1 + t * 6 * s.size;
                s.mesh.scale.set(sc, sc, sc);
                s.mesh.material.opacity = 0.85 * (1 - t);
            }
        }

        //---------------------------------------------------------------------
        // Per-frame
        //---------------------------------------------------------------------
        // Displace the surface in place. No normal recompute: the material is
        // flatShading, so three derives face normals in the fragment shader and
        // stored vertex normals are never read.
        _updateWater() {
            const attr = this._water.geometry.attributes.position;
            const arr = attr.array;
            const base = this._waterBase;
            const t = this._t;
            for (let i = 0; i < arr.length; i += 3) {
                arr[i + 1] = WATER_Y + waveHeight(base[i], base[i + 2], t);
            }
            attr.needsUpdate = true;
        }

        _updateWeather(dt) {
            const w = this._weather;
            if (!w) return;
            const arr = w.points.geometry.attributes.position.array;
            for (let i = 1; i < arr.length; i += 3) {
                arr[i] -= w.fall * dt;
                if (w.snow) arr[i - 1] += Math.sin(this._t * 2 + i) * w.drift * dt;
                if (arr[i] < 0) arr[i] = 34 + Math.random() * 8;
            }
            w.points.geometry.attributes.position.needsUpdate = true;
        }

        // Advance the world by one fixed step. Entity STEERING lives in the scene
        // (it is gameplay); this only does ambient motion and presentation.
        // The scene owns the clock and hands it in, so the wave mesh, the bobber
        // and every surface calculation are always evaluated at the same instant.
        step(dt, time) {
            this._t = (time != null) ? time : this._t + dt;
            this._updateWater();
            this._updateSplashes(dt);
            this._updateWeather(dt);
            if (this._floaters) {
                for (const f of this._floaters) {
                    f.obj.position.y = f.y + Math.sin(this._t * 0.7 + f.phase) * 0.8;
                    f.obj.rotation.y += dt * 0.3;
                }
            }
            for (const ent of this.entities) {
                if (ent.battler && ent.battler.update) ent.battler.update(dt);
            }
            if (this._reelMesh) this._reelMesh.rotation.x += this._reelSpin || 0;
            // Item billboards always face the camera the frame is drawn through.
            const eye = this.viewCamera.position;
            for (const ent of this.entities) {
                if (ent.type === 'item' && ent.rig.userData.billboard) {
                    ent.rig.lookAt(eye.x, ent.rig.position.y, eye.z);
                }
            }
            this._applyCamera(dt);
        }

        setReelSpin(v) { this._reelSpin = v; }

        render() {
            if (this._disposed) return;
            if (window.PSXShader && window.PSXShader.render) {
                window.PSXShader.render(this.renderer, this.scene, this.viewCamera);
            } else {
                this.renderer.render(this.scene, this.viewCamera);
            }
        }

        // Project a world point to game-resolution screen coordinates. The view
        // matrix is refreshed here rather than trusted: the renderer only rebuilds
        // it when it draws, and the 3D pass runs at half the update rate, so a
        // HUD marker reading the stale one would sit a frame behind the camera.
        projectToScreen(x, y, z, out) {
            const cam = this.viewCamera;
            cam.updateMatrixWorld();
            cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
            const v = this._tmpProj || (this._tmpProj = new THREE.Vector3());
            v.set(x, y, z).project(cam);
            const o = out || {};
            o.x = (v.x * 0.5 + 0.5) * this._w;
            o.y = (-v.y * 0.5 + 0.5) * this._h;
            o.visible = v.z < 1;
            return o;
        }

        //---------------------------------------------------------------------
        // Teardown
        //---------------------------------------------------------------------
        _disposeTree(root) {
            root.traverse(n => {
                if (n.geometry && n.geometry.dispose) { try { n.geometry.dispose(); } catch (e) {} }
                const mats = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
                for (const m of mats) {
                    if (m && m.map && m.map.dispose) { try { m.map.dispose(); } catch (e) {} }
                    if (m && m.dispose) { try { m.dispose(); } catch (e) {} }
                }
            });
        }

        dispose() {
            if (this._disposed) return;
            this._disposed = true;
            if (this.scene) this._disposeTree(this.scene);
            this.entities = [];
            this._splashes = [];
            this._floaters = null;
            if (this.renderer) {
                if (window.PSXShader && window.PSXShader.disposeContext) {
                    window.PSXShader.disposeContext(this.renderer);
                }
                try { this.renderer.dispose(); } catch (e) {}
                const gl = this.renderer.getContext && this.renderer.getContext();
                const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
                if (lose) { try { lose.loseContext(); } catch (e) {} }
            }
            this.scene = null;
            this.camera = null;
            this.freeCam = null;
            this._freeView = null;
        }
    }

    window.FishingScenery.World = FishingWorld3D;

    //=========================================================================
    // Scene_FishingMinigame
    //=========================================================================
    class Scene_FishingMinigame extends Scene_MenuBase {
        constructor() {
            super();
            this._fishDb   = [];
            this._state    = 'loading';
            this._world    = null;
            this._time     = 0;

            // Cast / bobber
            this._bob      = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
            this._inWater  = false;
            this._hookDepth = 0;
            this._castDist = 0;

            // Meters
            this._power    = 0;
            this._powerDir = 1;

            // Fight
            this._tension  = 0;
            this._distance = 0;
            this._reeling  = false;
            this._runTimer = 0;
            this._pull     = 0;

            this._hooked   = null;
            this._biteTimer = 0;
            this._waitTimer = 0;
            this._resultTimer = 0;
            this._prompt   = '';
            this._promptColor = '#ffff00';
            this._caughtName = '';
            this._caughtWeight = 0;
            this._shake = 0;
        }

        //---------------------------------------------------------------------
        // Setup
        //---------------------------------------------------------------------
        create() {
            super.create();

            if (!three3DReady()) {
                this.createHud();
                this._state = 'aborting';
                SoundManager.playBuzzer();
                this._setPrompt(T('Fishing.no3d'), '#ff6644');
                this._resultTimer = 120;
                return;
            }

            // The 3D view goes in first so the HUD, inserted after it at the same
            // window-layer index, always draws on top.
            this._world = new FishingWorld3D(Graphics.width, Graphics.height, this._venue());
            this.createWorldSprite();
            this.createHud();
            this._bindLookKeys();
            this._startWeatherBgs();
            this._loadFishDb();

            if (window.MinigameFun) window.MinigameFun.played('Fishing');

            if (this._isAscii() && window.AsciiMode.createCanvas) {
                window.AsciiMode.createCanvas();
            }
        }

        _isAscii() { return !!(window.AsciiMode && window.AsciiMode.active); }

        // A generated cave and a tiled room are both indoors, and neither of
        // them is a lake. An explicit <Exterior> beats everything, so a covered
        // map that is meant to be open water can say so.
        _venue() {
            const setup = arcadeSetup();
            if (setup) return setup.venue === 'interior' ? VENUE_INDOOR : VENUE_OPEN;
            const note = (window.$dataMap && window.$dataMap.note) || '';
            if (/<Exterior>/i.test(note)) return VENUE_OPEN;
            try {
                if (typeof window.isProceduralInteriorMap === 'function' &&
                    window.isProceduralInteriorMap()) return VENUE_CAVERN;
            } catch (e) { /* procedural stack not loaded */ }
            if (/<Interior>/i.test(note)) return VENUE_INDOOR;
            return VENUE_OPEN;
        }

        createWorldSprite() {
            const texture = PIXI.Texture.from(this._world.domElement);
            texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._worldSprite = new PIXI.Sprite(texture);
            this._worldSprite.width = Graphics.width;
            this._worldSprite.height = Graphics.height;
            // The lake is graded by the same screen tone the map is wearing, so
            // the time-of-day shader (WeatherSystem's tint transitions) carries
            // into the minigame instead of dropping to flat daylight. The HUD is
            // a separate sprite and stays unfiltered, so it never goes muddy.
            // Only outdoors: the tone is the time of day, and neither a cave nor
            // a lit room has one. A tank under strip lights looks the same at
            // midnight as it does at noon, which is rather the point of it.
            // A free-play session was handed its hour by the picker, so it is
            // not graded a second time by whatever tone the empty world wears.
            if (typeof ColorFilter === 'function' && !arcadeSetup() &&
                this._world._venue === VENUE_OPEN) {
                this._worldFilter = new ColorFilter();
                this._worldSprite.filters = [this._worldFilter];
                this._syncScreenTone(true);
            }
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._worldSprite, idx);
        }

        // Follow the live screen tone: it keeps moving while the scene is open
        // (WeatherSystem eases it over minutes), so this is polled, not read once.
        _syncScreenTone(force) {
            if (!this._worldFilter) return;
            const tone = ($gameScreen && $gameScreen.tone) ? $gameScreen.tone() : null;
            if (!tone) return;
            const prev = this._lastTone;
            if (!force && prev && prev[0] === tone[0] && prev[1] === tone[1] &&
                prev[2] === tone[2] && prev[3] === tone[3]) return;
            this._lastTone = tone.slice();
            this._worldFilter.setColorTone(this._lastTone);
        }

        // Boxes, gauges and the hook marker are drawn in a 320-wide virtual
        // framebuffer, the way a 32-bit console drew its overlay; the labels on top
        // of them are HTML (PSXHud.domPanel) so the type is as sharp as the
        // display allows. Nothing is laid over the 3D view: no scanlines, no
        // vignette, nothing that costs the picture contrast.
        createHud() {
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            if (window.PSXHud) {
                this._hud = window.PSXHud.layer();
                this._hudSprite = this._hud.sprite;
                this._hudDom = window.PSXHud.domPanel(this._hud);
            } else {
                const bmp = new Bitmap(Graphics.width, Graphics.height);
                this._hudSprite = new Sprite(bmp);
                this._hud = { bitmap: bmp, w: Graphics.width, h: Graphics.height };
            }
            this.addChildAt(this._hudSprite, idx);
        }

        // Screen pixels -> HUD virtual pixels.
        _toHudX(x) { return x * this._hud.w / Graphics.width; }
        _toHudY(y) { return y * this._hud.h / Graphics.height; }

        _loadFishDb() {
            loadJsonFile(FISH_DB_PATH, (data) => {
                if (!this._world) return;
                this._fishDb = Array.isArray(data) ? data : [];
                this._populateLake();
                this._setState('aim');
            });
        }

        // Fish, junk and one or two hostiles are streamed in: each model build is
        // async, so the lake fills up over the first second rather than stalling.
        _populateLake() {
            // Distinct species only: every duplicate would build a second full
            // procedural model for no visual gain.
            const pool = this._fishDb.filter(f => f && f.name).slice();
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
            }
            for (const fd of pool.slice(0, FISH_COUNT)) this._world.addFish(fd);

            // Junk: real items, each one drawn as its own IconSet icon on a
            // nearest-filtered quad, which is exactly how a PSX game would have
            // done it. Distinct icons only, so the lake never shows the same
            // billboard twice.
            const seen = {};
            let junk = 0;
            for (const it of this._junkPool()) {
                if (junk >= JUNK_COUNT) break;
                if (!it || seen[it.iconIndex]) continue;
                seen[it.iconIndex] = true;
                this._world.addItem(it);
                junk++;
            }

            // There is ALWAYS something in the water that would rather eat you.
            const troops = this._troopPool();
            const monsters = Math.min(troops.length, 1 + Math.floor(Math.random() * MONSTER_MAX));
            for (let i = 0; i < monsters; i++) this._world.addMonster(troops[i]);
        }

        // Junk items, shuffled: the configured fishing items first, then any
        // other icon-bearing item so the lake bottom is not always the same five.
        _junkPool() {
            const MS = window.MovementSystem || {};
            const ids = (MS.fishingItems || []).slice();
            const picked = [];
            for (const id of ids) {
                const it = $dataItems[id];
                if (it && it.iconIndex) picked.push(it);
            }
            const extras = [];
            for (const it of $dataItems) {
                if (it && it.name && it.iconIndex && it.itypeId === 1 && !ids.includes(it.id)) extras.push(it);
            }
            for (let i = extras.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = extras[i]; extras[i] = extras[j]; extras[j] = t;
            }
            return picked.concat(extras);
        }

        // Hostiles, shuffled. Falls back to any troop whose lead enemy reads as
        // something that could live in water, so a lake is never empty of them
        // even where MovementSystem is not configured.
        _troopPool() {
            const MS = window.MovementSystem || {};
            const out = [];
            for (const id of (MS.fishingEncounterTroopIds || [])) {
                const tr = $dataTroops[id];
                if (tr && tr.members && tr.members.length) out.push(tr);
            }
            if (out.length < MONSTER_MAX + 1) {
                for (const tr of $dataTroops) {
                    if (!tr || !tr.members || !tr.members.length || out.includes(tr)) continue;
                    const enemy = $dataEnemies[tr.members[0].enemyId];
                    if (enemy && enemy.name && AQUATIC_RE.test(enemy.name)) out.push(tr);
                }
            }
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = out[i]; out[i] = out[j]; out[j] = t;
            }
            return out;
        }

        _startWeatherBgs() {
            // Asked of WeatherAudio as a factor so the weather channel keeps the
            // level the Weather Volume option sets, just quieter for the cast.
            if (window.WeatherAudio && window.WeatherAudio.duck) {
                window.WeatherAudio.duck(0.6);
            }
        }

        _se(name, pitch, volume) {
            try {
                AudioManager.playSe({ name: name, volume: volume == null ? 80 : volume, pitch: pitch || 100, pan: 0 });
            } catch (e) { /* a missing SE must never break the game */ }
        }

        //---------------------------------------------------------------------
        // State machine
        //---------------------------------------------------------------------
        _setState(s) {
            if (window.MinigameFun && s !== this._state) {
                if (s === 'caught') window.MinigameFun.won('Fishing');
                else if (s === 'miss') window.MinigameFun.lost('Fishing');
            }
            this._state = s;
            const W = this._world;

            switch (s) {
                case 'aim':
                    this._inWater = false;
                    this._hooked = null;
                    this._clearLanded();
                    this._resetEntities();
                    if (W) {
                        W.releaseAim();
                        W.setBobber(0, 0, 0, false);
                        W.setLineVisible(false);
                        W.setReelSpin(0);
                    }
                    this._setPrompt('');
                    break;

                case 'power':
                    this._power = 0;
                    this._powerDir = 1;
                    this._setPrompt('');
                    break;

                case 'casting': {
                    // Frozen at launch: the camera keeps panning during the fight
                    // (it tracks the fish), so reading the live aim there would
                    // feed the fish's own position back into where it is placed.
                    const dir = W.aimDirection();
                    this._castDir = dir;
                    const tip = W.rodTipWorld();
                    this._castAnchor = { x: tip.x, z: tip.z };
                    // Solve the launch speed that lands the bobber at the distance
                    // the power bar asked for, at a fixed 38 degree elevation.
                    const range = W.castRange();
                    const dist = lerp(range.min, range.max, this._power);
                    const ang = 0.66;
                    const h = tip.y - WATER_Y;
                    // Range with a launch height: d = v*cos(a) * (v*sin(a) + sqrt((v*sin(a))^2 + 2*g*h)) / g
                    // Solved numerically; a handful of bisection steps is plenty.
                    let lo = 1, hi = 60;
                    for (let i = 0; i < 24; i++) {
                        const v = (lo + hi) / 2;
                        const vy = v * Math.sin(ang), vx = v * Math.cos(ang);
                        const tFall = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * h)) / GRAVITY;
                        if (vx * tFall < dist) lo = v; else hi = v;
                    }
                    const spd = (lo + hi) / 2;
                    this._castDist = dist;
                    this._bob.x = tip.x; this._bob.y = tip.y; this._bob.z = tip.z;
                    this._bob.vx = dir.x * spd * Math.cos(ang);
                    this._bob.vz = dir.z * spd * Math.cos(ang);
                    this._bob.vy = spd * Math.sin(ang);
                    this._inWater = false;
                    W.setLineVisible(true);
                    W.setBobber(this._bob.x, this._bob.y, this._bob.z, true);
                    // The whole length of line starts bunched at the rod tip and
                    // is dragged out by the bobber, and the camera goes with it.
                    W.resetRope(tip, this._bob);
                    W.lookAtPoint(this._bob.x, this._bob.y, this._bob.z, TRACK_FAST);
                    this._se('Wind1', 130, 60);
                    this._setPrompt('');
                    break;
                }

                case 'waiting': {
                    this._inWater = true;
                    this._hookDepth = waterDepthAt(this._bob.z);
                    this._waitTimer = 260 + Math.floor(Math.random() * 300);
                    W.addSplash(this._bob.x, this._bob.z, 1);
                    W.lookAtPoint(this._bob.x, WATER_Y, this._bob.z, TRACK_RATE);
                    this._se('Water1', 110, 70);
                    this._setPrompt('');
                    break;
                }

                case 'bite':
                    this._biteTimer = 170;
                    this._setPrompt('BITE', '#ff5544');
                    this._se('Water2', 140, 90);
                    this._shake = 8;
                    break;

                case 'reeling': {
                    const f = this._hooked;
                    const diff = f ? f.difficulty : 1;
                    this._tension = 0.35;
                    this._distance = Math.max(6, this._castDist);
                    this._maxDistance = this._distance;
                    this._reeling = false;
                    this._runTimer = 40;
                    this._pull = 0.15 + diff * 0.04;
                    this._overTimer = 0;
                    if (f) { f.state = 'hooked'; f.stamina = 1; }
                    this._se('Sword2', 150, 60);
                    this._setPrompt('');
                    break;
                }

                case 'caught': {
                    this._resultTimer = 200;
                    this._presentCatch();
                    if (W) { W.setReelSpin(0); W.setLineVisible(false); W.setBobber(0, 0, 0, false); }
                    this._se('Item3', 110, 90);
                    break;
                }

                case 'miss':
                    this._resultTimer = 100;
                    this._inWater = false;
                    if (this._hooked) { this._hooked.state = 'swimming'; this._hooked = null; }
                    if (W) { W.setReelSpin(0); W.setLineVisible(false); W.setBobber(0, 0, 0, false); W.releaseAim(); }
                    this._se('Buzzer1', 120, 60);
                    break;
            }
        }

        _resetEntities() {
            if (!this._world) return;
            for (const e of this._world.entities) e.state = 'swimming';
        }

        // A landed catch is parented to the camera for its trophy pose; retire it
        // and restock the lake with another fish so it never fishes out.
        _clearLanded() {
            if (!this._world) return;
            const landed = this._world.entities.filter(e => e.state === 'landed');
            for (const e of landed) {
                this._world.removeEntity(e);
                if (e.type === 'fish' && this._fishDb.length) {
                    this._world.addFish(this._fishDb[Math.floor(Math.random() * this._fishDb.length)]);
                }
            }
        }

        _setPrompt(text, color) {
            this._prompt = text || '';
            this._promptColor = color || '#ffff00';
        }

        //---------------------------------------------------------------------
        // Simulation
        //---------------------------------------------------------------------
        _stepCast(dt) {
            const b = this._bob;
            b.vy -= GRAVITY * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;

            // Overshooting the far bank or the headlands is a lost cast. The
            // bobber STARTS over the dock, so the near shore is only ever judged
            // where it comes down, never in flight.
            if (Math.abs(b.x) > LAKE_HALF_X + 4 || b.z < LAKE_FAR_Z) {
                this._setPrompt(T('Fishing.badCast'), '#ff8844');
                this._setState('miss');
                return;
            }

            const surf = WATER_Y + waveHeight(b.x, b.z, this._time);
            if (b.y <= surf) {
                const onLand = b.z > SHORE_Z - 1.5 || Math.abs(b.x) > LAKE_HALF_X || b.z < LAKE_FAR_Z + 4;
                if (onLand) {
                    this._setPrompt(T('Fishing.badCast'), '#ff8844');
                    this._setState('miss');
                    return;
                }
                b.y = surf;
                b.vx = b.vy = b.vz = 0;
                this._setState('waiting');
                return;
            }
            this._world.setBobber(b.x, b.y, b.z, true);
            // Follow the hook through the air, led slightly along its own
            // velocity so the camera arrives with it rather than trailing it.
            this._world.lookAtPoint(b.x + b.vx * CAST_LEAD,
                                    b.y + b.vy * CAST_LEAD,
                                    b.z + b.vz * CAST_LEAD, TRACK_FAST);
        }

        // Fish AI: wander, then converge on a hook sitting at a depth they like.
        _stepEntities(dt) {
            const W = this._world;
            const b = this._bob;
            const hookLive = this._inWater && this._state === 'waiting';

            for (const ent of W.entities) {
                if (ent.state === 'hooked' || ent.state === 'landed') continue;
                const p = ent.rig.position;

                if (hookLive && ent.likesDepth(this._hookDepth)) {
                    const dx = b.x - p.x, dz = b.z - p.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < 30) ent.state = 'interested';
                    if (ent.state === 'interested') {
                        const step = ent.speed * (ent.type === 'item' ? 0.35 : 1) * dt;
                        p.x += (dx / (dist || 1)) * step * 2.4;
                        p.z += (dz / (dist || 1)) * step * 2.4;
                        // The hook's depth is where it WANTS to be; the bed is
                        // where it may actually go. A hook cast into the shallows
                        // used to pull the swimmer straight down through the mud.
                        const wantY = WATER_Y - this._hookDepth * 0.16 - 0.7;
                        p.y = lerp(p.y, clamp(wantY, bedY(p.z) + BED_CLEAR, -0.35), dt * 1.4);
                        ent.rig.rotation.y = Math.atan2(dx, dz);
                        if (dist < 2.4 && Math.random() < (0.024 + ent.difficulty * 0.004)) {
                            this._hooked = ent;
                            this._setState('bite');
                            return;
                        }
                        continue;
                    }
                } else if (ent.state === 'interested') {
                    ent.state = 'swimming';
                }

                // Idle wander with occasional heading changes.
                ent.turnTimer -= dt;
                if (ent.turnTimer <= 0) {
                    ent.turnTimer = 1.6 + Math.random() * 3.4;
                    ent.heading += (Math.random() * 2 - 1) * 1.5;
                }
                const sp = ent.speed * dt;
                p.x += Math.sin(ent.heading) * sp;
                p.z += Math.cos(ent.heading) * sp;
                p.y = lerp(p.y, clamp(ent.preferredY(), bedY(p.z) + 0.7, -0.5), dt * 0.9)
                    + Math.sin(this._time * 1.4 + ent.phase) * 0.006;

                // Turn away from the banks and the shallows.
                if (Math.abs(p.x) > LAKE_HALF_X - 3) { p.x = clamp(p.x, -(LAKE_HALF_X - 3), LAKE_HALF_X - 3); ent.heading += Math.PI * 0.6; }
                if (p.z > SHORE_Z - 5 || p.z < LAKE_FAR_Z + 5) { p.z = clamp(p.z, LAKE_FAR_Z + 5, SHORE_Z - 5); ent.heading += Math.PI * 0.6; }
                if (waterDepthAt(p.z) < ent.depthMin - 0.5) ent.heading += Math.PI * 0.5;

                ent.rig.rotation.y = lerp(ent.rig.rotation.y, ent.heading, dt * 3);
            }

            // One last pass over everything that swims, hooked or not: no rig is
            // ever left inside the bed or outside the banks, whatever moved it.
            for (const ent of W.entities) {
                if (ent.state === 'landed' || !ent.rig) continue;
                const p = ent.rig.position;
                p.x = clamp(p.x, -(LAKE_HALF_X - 2), LAKE_HALF_X - 2);
                p.z = clamp(p.z, LAKE_FAR_Z + 3, WATER_EDGE_Z);
                p.y = clamp(p.y, bedY(p.z) + BED_CLEAR, WATER_Y + 0.35);
            }
        }

        // The fight. Hold Confirm to reel (distance falls, tension climbs),
        // release to give line (tension bleeds off, the fish takes line back).
        _stepFight(dt) {
            const f = this._hooked;
            const W = this._world;
            if (!f) { this._setState('miss'); return; }

            this._reeling = Input.isPressed('ok') || Input.isPressed('shift');

            // The fish makes runs: short bursts where it pulls hard.
            this._runTimer -= 1;
            if (this._runTimer <= 0) {
                this._runTimer = 60 + Math.floor(Math.random() * 120 * (0.4 + f.stamina));
                // An angler who has done this before keeps the rod loaded and
                // gives line at the right moment, so a run pulls less hard
                // (Fishing, specialization 112).
                const rodHand = window.SpecializationXP
                    ? window.SpecializationXP.discount('Fishing', 0.07, 0.7) : 1;
                this._runStrength = (0.5 + Math.random()) * (0.26 + f.difficulty * 0.08) * (0.35 + f.stamina * 0.65) * rodHand;
            }
            const running = this._runTimer > 40 ? 0 : this._runStrength || 0;
            const pull = this._pull * (0.4 + f.stamina * 0.6) + running;

            if (this._reeling) {
                const gain = 7.0 * (1.25 - f.stamina * 0.55);
                this._distance -= gain * dt;
                this._tension += (0.40 + pull * 1.05) * dt;
                W.setReelSpin(0.35);
            } else {
                this._distance += pull * 1.7 * dt;
                this._tension -= 1.15 * dt;
                W.setReelSpin(0);
            }
            this._tension = clamp(this._tension, 0, 1.15);
            this._distance = clamp(this._distance, 0, this._maxDistance + 12);

            // Tension held in the working band tires the fish; slack lets it rest.
            if (this._tension >= 0.35 && this._tension <= 0.92) {
                f.stamina -= (0.075 + f.difficulty * 0.005) * dt;
            } else if (this._tension < 0.2) {
                f.stamina = Math.min(1, f.stamina + 0.02 * dt);
            }
            f.stamina = clamp(f.stamina, 0, 1);

            // Overloading the line is a warning before it is a loss: the rod
            // holds for a moment, which is long enough to let go and save it.
            if (this._tension >= 1) {
                this._overTimer = (this._overTimer || 0) + dt;
                if (this._overTimer >= SNAP_GRACE) {
                    this._setPrompt(T('Fishing.lineSnapped'), '#ff6644');
                    this._setState('miss');
                    return;
                }
            } else {
                this._overTimer = 0;
            }
            // Landed the moment it is within reach of the rod. Reeling all the
            // way to zero used to haul the fish up the bank and through the
            // shore geometry before the state ever changed.
            if (this._distance <= LAND_DIST) {
                this._setState('caught');
                return;
            }

            // Drag the fish along the line toward the rod and make it thrash.
            const anchor = this._castAnchor || W.rodTipWorld();
            const dir = this._castDir || W.aimDirection();
            const thrash = (0.25 + running) * 0.5;
            const p = f.rig.position;
            // The line runs to the rod, which stands on dry land: the target is
            // held at the water's edge and inside the banks so the fight never
            // pulls the animal up the shore or out through the side of the lake.
            const tx = clamp(anchor.x + dir.x * this._distance + Math.sin(this._time * 9) * thrash,
                             -(LAKE_HALF_X - 2), LAKE_HALF_X - 2);
            const tz = clamp(anchor.z + dir.z * this._distance + Math.cos(this._time * 7) * thrash,
                             LAKE_FAR_Z + 3, WATER_EDGE_Z);
            p.x = lerp(p.x, tx, 0.16);
            p.z = lerp(p.z, tz, 0.16);
            // A tired fish rides higher; a fresh one bores deep and breaks the
            // surface only during its runs. Clamped to the bed under the fish's
            // OWN z, which the shallows make a much tighter band than open water.
            const surf = WATER_Y + waveHeight(p.x, p.z, this._time);
            const floor = bedY(p.z) + BED_CLEAR;
            const wantY = lerp(-2.4, -0.35, 1 - f.stamina) + (running > 0.4 ? Math.sin(this._time * 12) * 0.7 : 0);
            p.y = lerp(p.y, clamp(wantY, floor, Math.max(floor, surf + 0.25)), 0.12);
            p.y = clamp(p.y, floor, surf + 0.35);
            f.rig.rotation.y = Math.atan2(anchor.x - p.x, anchor.z - p.z);
            f.rig.rotation.z = Math.sin(this._time * 11) * thrash * 0.8;

            if (p.y > -0.15 && Math.random() < 0.06) W.addSplash(p.x, p.z, 0.6);

            this._bob.x = p.x; this._bob.z = p.z;
            this._bob.y = surf - Math.min(0.35, this._tension * 0.4);
            W.setBobber(this._bob.x, this._bob.y, this._bob.z, true);
            // Stay on the hook, not on the fish: the fish rolls and dives under
            // it, and the player needs to read the line, not the animal.
            W.lookAtPoint(this._bob.x, (this._bob.y + p.y) * 0.5, this._bob.z, TRACK_FIGHT);
        }

        // Lift the catch out of the water and hold it in front of the camera.
        _presentCatch() {
            const f = this._hooked;
            if (!f) return;
            f.state = 'landed';
            const W = this._world;
            // Reparent to the camera so the trophy pose is framed identically no
            // matter where on the lake the fish was landed.
            W.camera.add(f.rig);
            f.rig.position.set(0, -0.30, -2.4);
            f.rig.rotation.set(0, 0, 0);
            W.addSplash(this._bob.x, this._bob.z, 1.4);

            this._caughtName = this._entityName(f);
            this._caughtWeight = this._entityWeight(f);
            this._grantCatch(f);
        }

        // js/db/Items/fishDatabase.json holds the English name as the record's
        // own label; what the player reads comes from Fishing.fish.<id>, so the
        // db name stays the identifier the rest of the file matches on.
        _fishName(data) {
            if (!data) return '';
            const key = 'Fishing.fish.' + data.id;
            return (data.id != null && T.has(key)) ? T(key) : (data.name || '');
        }

        _entityName(ent) {
            if (ent.type === 'monster') return ent.enemyName || (ent.data && ent.data.name) || T('Fishing.something');
            return this._fishName(ent.data) || T('Fishing.something');
        }

        _entityWeight(ent) {
            if (ent.type !== 'fish') return 0;
            const base = { small: 0.4, medium: 1.8, large: 5.5, huge: 14 }[String(ent.data.size || 'medium').toLowerCase()] || 1.8;
            // Knowing where and when to cast is what puts the bigger fish on
            // the end of the line, so the skill shows in the weight.
            const skill = window.SpecializationXP
                ? window.SpecializationXP.multiplier('Fishing', 0.10) : 1;
            return Math.round(base * (0.6 + Math.random() * 0.9) * skill * 100) / 100;
        }

        _grantCatch(ent) {
            if (ent.type === 'fish') {
                // RESULT_VAR is off by default: it used to point at variable 95,
                // which GalaxySim owns as the starship fuel tank, so every catch
                // emptied or overfilled the ship. $gameSystem._lastCaughtFishId
                // is the answer to "what was caught"; the variable stays as an
                // opt-in for events, on a slot nobody else claims.
                if (RESULT_VAR > 0) $gameVariables.setValue(RESULT_VAR, ent.data.id);
                if ($gameSystem) $gameSystem._lastCaughtFishId = ent.data.id;
                if (ent.data.itemId && $dataItems[ent.data.itemId]) {
                    $gameParty.gainItem($dataItems[ent.data.itemId], 1);
                }
            } else if (ent.type === 'item') {
                $gameParty.gainItem(ent.data, 1);
            } else if (ent.type === 'monster') {
                // Free play opened from the title screen has no map under it:
                // a fight started there has nowhere to hand the party back to
                // when it ends, so what was hooked stays a trophy and nothing
                // climbs out of the water after it.
                if (typeof $dataMap === 'undefined' || !$dataMap) return;
                const troopId = ent.data.id;
                const ceId = window.MovementSystem ? window.MovementSystem.fishingBattleCommonEventId : 0;
                if (ceId > 0) $gameTemp.reserveCommonEvent(ceId);
                this._monsterBattleTimer = setTimeout(() => {
                    this._monsterBattleTimer = null;
                    // Going straight to the battle hands it the scene this one
                    // was opened from, so the end of the fight pops back to the
                    // map. Popping first and pushing after would put THIS scene
                    // back on the stack (the pop only queues the next scene, so
                    // the push still sees the fishing scene as the current one),
                    // which dropped the player back into fishing after the fight
                    // with nothing under it left to escape to.
                    BattleManager.setup(troopId, true, false);
                    SceneManager.goto(Scene_Battle);
                }, 1400);
            }
        }

        //---------------------------------------------------------------------
        // Input
        //---------------------------------------------------------------------
        // WASD is not bound to the movement keys everywhere in this project (the
        // shop, for one, steals A), so the scene claims them for the duration and
        // hands them straight back. They walk the bank rather than turn the head:
        // the arrow keys, the stick and the mouse all look, and an angler who
        // wants a different stretch of water walks to it. F switches the free
        // camera on and off, and Q / E fly it down and up.
        _bindLookKeys() {
            const map = { 87: 'fishFwd', 65: 'fishLeft', 83: 'fishBack', 68: 'fishRight',
                          70: 'fishFreeCam', 81: 'fishDown', 69: 'fishUp' };
            this._savedKeys = {};
            for (const code in map) {
                this._savedKeys[code] = Input.keyMapper[code];
                Input.keyMapper[code] = map[code];
            }
            Input.clear();
        }

        _restoreLookKeys() {
            if (!this._savedKeys) return;
            for (const code in this._savedKeys) {
                if (this._savedKeys[code] === undefined) delete Input.keyMapper[code];
                else Input.keyMapper[code] = this._savedKeys[code];
            }
            this._savedKeys = null;
            Input.clear();
        }

        _updateLook() {
            const W = this._world;
            if (!W) return;
            let dy = 0, dp = 0;
            if (Input.isPressed('left'))  dy += 0.030;
            if (Input.isPressed('right')) dy -= 0.030;
            if (Input.isPressed('up'))    dp += 0.018;
            if (Input.isPressed('down'))  dp -= 0.018;

            if (TouchInput.isPressed()) {
                if (this._lastTouch) {
                    dy -= (TouchInput.x - this._lastTouch.x) * 0.005;
                    dp -= (TouchInput.y - this._lastTouch.y) * 0.005;
                }
                this._lastTouch = { x: TouchInput.x, y: TouchInput.y };
            } else {
                this._lastTouch = null;
            }
            // The right stick looks around, the way it does in every other 3D
            // scene: the speed and the handedness come from the controller
            // layer, so one setting moves them all (window.Controller).
            const C = window.Controller;
            if (C) {
                const stick = C.stick('right');
                if (stick.x || stick.y) {
                    const gain = C.cameraSpeed();
                    const invert = C.invertCameraY() ? -1 : 1;
                    dy -= stick.x * 0.045 * gain;
                    dp -= stick.y * 0.030 * gain * invert;
                }
            }
            if (!dy && !dp) return;
            if (W.isFreeCam) W.lookFreeCam(dy, dp);
            else W.applyLook(dy, dp);
        }

        // The free camera is a spectator: the game keeps running under it and
        // Confirm still casts, strikes and reels, so a fight can be played while
        // it is watched from out over the lake.
        _toggleFreeCam() {
            const W = this._world;
            if (!W) return;
            const on = !W.isFreeCam;
            W.setFreeCam(on);
            this._lastTouch = null;
            this._se('Cursor1', on ? 110 : 90, 70);
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T(on ? 'Fishing.freeCamOn' : 'Fishing.freeCamOff'), {
                    severity: 'info'
                });
            }
        }

        // Walking is allowed at every stage, the fight included: the frozen cast
        // anchor means moving never drags the fish about, it only changes where
        // the fight is watched from.
        _updateMove() {
            const W = this._world;
            if (!W) return;
            let fwd = 0, strafe = 0;
            if (Input.isPressed('fishFwd'))   fwd += 1;
            if (Input.isPressed('fishBack'))  fwd -= 1;
            if (Input.isPressed('fishRight')) strafe += 1;
            if (Input.isPressed('fishLeft'))  strafe -= 1;
            if (W.isFreeCam) {
                let rise = 0;
                if (Input.isPressed('fishUp'))   rise += 1;
                if (Input.isPressed('fishDown')) rise -= 1;
                W.moveFreeCam(fwd, strafe, rise, SIM_DT);
                return;
            }
            W.moveCamera(fwd, strafe, SIM_DT);
        }

        _handleConfirm() {
            switch (this._state) {
                case 'aim':     this._setState('power'); this._se('Cursor1', 100, 70); break;
                case 'power':   this._setState('casting'); break;
                case 'bite':    this._setState('reeling'); break;
                case 'caught':
                case 'miss':    this._setState('aim'); break;
            }
        }

        //---------------------------------------------------------------------
        // Frame
        //---------------------------------------------------------------------
        update() {
            super.update();
            this._time += SIM_DT;

            if (this._state === 'aborting') {
                if (--this._resultTimer <= 0) this.popScene();
                this._drawHud();
                return;
            }
            if (!this._world) return;

            if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
                this.popScene();
                return;
            }
            // Confirm is HELD during the fight, so only the other states consume
            // it as a trigger.
            if (this._state !== 'reeling' && (Input.isTriggered('ok') || Input.isTriggered('shift'))) {
                this._handleConfirm();
            }

            if (this._state !== 'loading' && Input.isTriggered('fishFreeCam')) this._toggleFreeCam();

            // Looking around is allowed at every stage except the power swing,
            // where the aim has to stay put. Once the line is out the input only
            // offsets the tracking camera, so the hook is never lost. The free
            // camera moves the spectator, not the aim, so it flies at every stage.
            const freeCam = this._world.isFreeCam;
            if (freeCam || (this._state !== 'power' && this._state !== 'loading')) {
                this._updateLook();
                this._updateMove();
            }

            switch (this._state) {
                case 'power':
                    this._power += this._powerDir * 0.016;
                    if (this._power >= 1) { this._power = 1; this._powerDir = -1; }
                    if (this._power <= 0) { this._power = 0; this._powerDir = 1; }
                    break;
                case 'casting':
                    this._stepCast(SIM_DT);
                    break;
                case 'waiting':
                    if (--this._waitTimer <= 0) {
                        this._setPrompt(T('Fishing.nothingBiting'), '#ff8844');
                        this._setState('miss');
                    }
                    break;
                case 'bite':
                    if (--this._biteTimer <= 0) {
                        this._setPrompt(T('Fishing.tooSlow'), '#ff8844');
                        this._setState('miss');
                    }
                    break;
                case 'reeling':
                    this._stepFight(SIM_DT);
                    break;
                case 'caught':
                    if (this._hooked && this._hooked.rig) {
                        this._hooked.rig.rotation.y += 0.02;
                        this._hooked.rig.position.y = -0.30 + Math.sin(this._time * 3) * 0.05;
                    }
                    if (--this._resultTimer <= 0) this._setState('aim');
                    break;
                case 'miss':
                    if (--this._resultTimer <= 0) this._setState('aim');
                    break;
            }

            if (this._state !== 'caught') this._stepEntities(SIM_DT);
            this._updateBobberFloat();
            this._world.step(SIM_DT, this._time);
            this._updateCastPreview();
            this._updateLineVisual();
            this._applyShake();

            this._syncScreenTone(false);
            this._renderWorld();
            this._drawHud();
            if (this._isAscii()) this._renderAscii();
        }

        // The floating bobber rides the waves, and dips when a fish noses it.
        _updateBobberFloat() {
            if (this._state !== 'waiting' && this._state !== 'bite') return;
            const b = this._bob;
            let y = WATER_Y + waveHeight(b.x, b.z, this._time);
            if (this._state === 'bite') y -= 0.45 + Math.sin(this._time * 22) * 0.22;
            else {
                // Nibbles from any interested fish nearby.
                let near = false;
                for (const e of this._world.entities) {
                    if (e.state !== 'interested') continue;
                    const dx = e.rig.position.x - b.x, dz = e.rig.position.z - b.z;
                    if (dx * dx + dz * dz < 9) { near = true; break; }
                }
                if (near) y -= Math.max(0, Math.sin(this._time * 8)) * 0.16;
            }
            b.y = y;
            this._world.setBobber(b.x, b.y, b.z, true);
            // Keep the hook framed while it floats and while it is being pulled
            // under, so the bite is always visible on screen.
            this._world.lookAtPoint(b.x, b.y, b.z, this._state === 'bite' ? TRACK_FIGHT : TRACK_RATE);
        }

        // Where the current aim and power would put the hook, and how deep the
        // water is there. The same distance the cast solver uses, so what the
        // marker promises is what the bobber does.
        _castPreview() {
            const W = this._world;
            const dir = W.aimDirection();
            const tip = W.rodTipWorld(this._tipTmp || (this._tipTmp = new THREE.Vector3()));
            const range = W.castRange();
            const dist = lerp(range.min, range.max, this._state === 'power' ? this._power : 0.5);
            const x = tip.x + dir.x * dist;
            const z = tip.z + dir.z * dist;
            return {
                x: x, z: z, dist: dist, depth: waterDepthAt(z),
                onWater: Math.abs(x) <= LAKE_HALF_X && z < SHORE_Z - 1.5 && z > LAKE_FAR_Z + 4
            };
        }

        _updateCastPreview() {
            const aiming = this._state === 'aim' || this._state === 'power';
            if (!aiming) {
                this._preview = null;
                this._world.setCastMarker(0, 0, false);
                return;
            }
            const p = this._castPreview();
            this._preview = p;
            this._world.setCastMarker(p.x, p.z, true, p.onWater);
        }

        // How much line is paid out beyond the straight rod-to-hook run. This is
        // the only thing the scene tells the rope; every curve it draws is the
        // simulation's own doing.
        // The fight ends at LAND_DIST, so that is where the gauge has to read
        // empty: measuring against a zero it never reaches would leave a sliver
        // of line showing on a landed fish.
        _distanceFraction() {
            const span = Math.max(1, (this._maxDistance || 1) - LAND_DIST);
            return clamp((this._distance - LAND_DIST) / span, 0, 1);
        }

        _lineSlack() {
            switch (this._state) {
                case 'casting': return 0.30;   // line streaming out behind the bobber
                case 'waiting': return 0.14;
                case 'bite':    return 0.07;
                case 'reeling': return clamp(0.20 - this._tension * 0.21, 0.004, 0.20);
            }
            return 0.15;
        }

        _updateLineVisual() {
            const W = this._world;
            if (!W || !W.isLineVisible()) return;
            W.updateLine(this._bob, this._lineSlack(), SIM_DT);
        }

        _applyShake() {
            if (this._shake > 0) this._shake -= 0.5;
            const s = Math.max(0, this._shake);
            if (this._worldSprite) {
                this._worldSprite.x = s ? (Math.random() * 2 - 1) * s : 0;
                this._worldSprite.y = s ? (Math.random() * 2 - 1) * s : 0;
            }
        }

        // Rasterize the 3D pass at RENDER_FPS and re-upload the canvas texture.
        _renderWorld() {
            const now = performance.now();
            const dt = this._lastFrame ? (now - this._lastFrame) : 1000;
            this._frameAcc = (this._frameAcc || 0) + Math.min(dt, 50);
            this._lastFrame = now;
            if (this._frameAcc < (1000 / RENDER_FPS)) return;
            this._frameAcc = 0;
            this._world.render();
            if (this._worldSprite && this._worldSprite.texture) this._worldSprite.texture.update();
        }

        //---------------------------------------------------------------------
        // HUD (2D, drawn over the 3D view)
        //---------------------------------------------------------------------
        _hintText() {
            switch (this._state) {
                case 'loading':   return T('Fishing.hint.loading');
                case 'aborting':  return T('Fishing.hint.no3d');
                case 'aim':       return T('Fishing.hint.aim');
                case 'power':     return T('Fishing.hint.power');
                case 'casting':   return T('Fishing.hint.casting');
                case 'waiting':   return T('Fishing.hint.waiting');
                case 'bite':      return T('Fishing.hint.bite');
                case 'reeling':   return T('Fishing.hint.reeling');
                case 'caught':    return T('Fishing.hint.caught');
                case 'miss':      return T('Fishing.hint.miss');
            }
            return '';
        }

        //---------------------------------------------------------------------
        // HUD. Boxes, block gauges and the hook marker are authored in virtual
        // pixels on the low-res layer (320 wide), in the PSX idiom. Every label
        // goes to the HTML layer instead, in the same coordinates, so an 8px
        // face is never stretched over four device pixels.
        //---------------------------------------------------------------------
        _hudText(bmp, str, x, y, w, align, color, size, opts) {
            if (this._hudDom) this._hudDom.text(str, x, y, w, align, color, size, opts);
            else window.PSXHud.text(bmp, str, x, y, w, align, color, size, opts);
        }

        // Repainting the layer is the most expensive thing the 2D side does, so
        // it runs on the same halved cadence as the 3D pass.
        _drawHud() {
            this._hudTick = (this._hudTick || 0) + 1;
            if (this._hudTick % 2) return;
            if (!window.PSXHud) return;
            const bmp = this._hud.bitmap;
            const w = this._hud.w, h = this._hud.h;
            bmp.clear();
            if (this._hudDom) this._hudDom.begin();

            this._drawHintBar(bmp, w, h);
            this._drawStatusPanel(bmp, w, h);
            this._drawHookMarker(bmp, w, h);

            if (this._prompt) {
                const pw = 150, ph = 22;
                const px = Math.round((w - pw) / 2), py = Math.round(h * 0.20);
                window.PSXHud.panel(bmp, px, py, pw, ph, { fill: '#160e14' });
                this._hudText(bmp, this._prompt, px, py + 3, pw, 'center', this._promptColor, 16);
            }

            if (this._state === 'aim' || this._state === 'power') this._drawAimPanel(bmp, w, h);
            if (this._state === 'power') this._drawPowerBar(bmp, w, h);
            if (this._state === 'reeling') this._drawFightBars(bmp, w, h);
            if (this._state === 'caught') this._drawCatchCard(bmp, w, h);

            if (this._hudDom) this._hudDom.end();
        }

        // Bottom strip: a solid status bar the whole width of the frame, the way
        // every PSX sports and fishing game did its prompts.
        _drawHintBar(bmp, w, h) {
            const P = window.PSXHud.PAL;
            const barH = 14;
            window.PSXHud.panel(bmp, 0, h - barH, w, barH, { fill: '#0a1220', hi: '#2c4260', accent: P.cyan });
            this._hudText(bmp, this._hintText(), 0, h - barH + 3, w, 'center', P.dim, 8);
        }

        // Top-left readout: what the hook is doing and what can reach it.
        _drawStatusPanel(bmp, w, h) {
            const live = this._state === 'waiting' || this._state === 'bite' || this._state === 'reeling';
            if (!live) return;
            const P = window.PSXHud.PAL;
            const pw = 96, ph = 26, px = 4, py = 4;
            window.PSXHud.panel(bmp, px, py, pw, ph);

            this._hudText(bmp, 'DEPTH ' + this._hookDepth.toFixed(1) + 'M', px + 4, py + 3, pw - 8, 'left', P.cyan, 8);

            const interested = this._world.entities.filter(e => e.state === 'interested').length;
            const inBand = this._world.entities.filter(e => e.state !== 'landed' && e.likesDepth(this._hookDepth)).length;
            const line = interested > 0 ? interested + ' CIRCLING' : inBand + ' IN RANGE';
            this._hudText(bmp, line, px + 4, py + 13, pw - 8, 'left', interested > 0 ? P.amber : P.dim, 8);
        }

        // A ring drawn over the bobber wherever it is on screen, and an arrow
        // pinned to the edge when it is not. Losing the hook in a wide, bright
        // lake was the single worst thing about reading this scene.
        _drawHookMarker(bmp, w, h) {
            const W3 = this._world;
            if (!W3 || !W3.isBobberVisible()) return;
            const P = window.PSXHud.PAL;
            const p = W3.projectToScreen(this._bob.x, this._bob.y + 0.55, this._bob.z, this._mk || (this._mk = {}));
            const biting = this._state === 'bite';
            const col = biting ? P.red : P.ink;
            const pulse = biting ? (Math.floor(this._time * 14) % 2 === 0) : true;
            const margin = 8;

            let x = Math.round(this._toHudX(p.x));
            let y = Math.round(this._toHudY(p.y));
            const onScreen = p.visible && x > margin && x < w - margin && y > margin && y < h - margin;

            if (onScreen) {
                if (!pulse) return;
                const r = biting ? 5 : 4;
                window.PSXHud.reticle(bmp, x, y, r, col, { len: 3, dot: biting, dotColor: P.amber });
                if (biting) this._hudText(bmp, 'BITE', x - 20, y - 18, 40, 'center', P.red, 8);
                return;
            }

            // Off screen (or behind the player): clamp to the border. A point
            // behind the camera projects mirrored, so flip it back first.
            if (!p.visible) { x = w - x; y = h - y; }
            x = Math.round(clamp(x, margin, w - margin));
            y = Math.round(clamp(y, margin, h - margin));
            bmp.fillRect(x - 3, y - 3, 6, 6, P.shadow);
            bmp.fillRect(x - 2, y - 2, 4, 4, col);
        }

        // While aiming: how far the cast goes, how deep it lands, and whether
        // anything down there is interested in that depth.
        _drawAimPanel(bmp, w, h) {
            const pv = this._preview;
            if (!pv) return;
            const P = window.PSXHud.PAL;
            const pw = 104, ph = 34;
            const px = w - pw - 4, py = 4;
            window.PSXHud.panel(bmp, px, py, pw, ph);

            const bad = !pv.onWater;
            this._hudText(bmp, bad ? 'ON LAND!' : 'CAST ' + Math.round(pv.dist) + 'M',
                px + 4, py + 3, pw - 8, 'left', bad ? P.red : P.amber, 8);
            this._hudText(bmp, bad ? '- - -' : 'WATER ' + pv.depth.toFixed(1) + 'M',
                px + 4, py + 12, pw - 8, 'left', P.cyan, 8);

            const reach = bad ? 0 : this._world.entities.filter(e => e.state !== 'landed' && e.likesDepth(pv.depth)).length;
            this._hudText(bmp, reach + ' AT DEPTH', px + 4, py + 21, pw - 8, 'left', reach ? P.green : P.dim, 8);
        }

        _drawPowerBar(bmp, w, h) {
            const P = window.PSXHud.PAL;
            const bw = 150, bh = 11;
            const bx = Math.round((w - bw) / 2), by = h - 40;
            window.PSXHud.panel(bmp, bx - 3, by - 12, bw + 6, bh + 16, { fill: '#0a1220' });
            window.PSXHud.bar(bmp, bx, by, bw, bh, this._power, {
                seg: 3, gap: 1,
                colorAt: t => (t < 0.5 ? P.green : (t < 0.8 ? P.amber : P.red)),
                needle: this._power
            });
            this._hudText(bmp, 'POWER ' + Math.round(lerp(CAST_MIN, CAST_MAX, this._power)) + 'M',
                bx, by - 11, bw, 'center', P.ink, 8);
        }

        _drawFightBars(bmp, w, h) {
            const P = window.PSXHud.PAL;
            const bw = 130, bh = 9, gap = 13;
            const labelW = 26;
            const bx = Math.round((w - bw) / 2);
            let by = h - 58;

            window.PSXHud.panel(bmp, bx - labelW - 5, by - 5, bw + labelW * 2 + 10, gap * 3 + 12, { fill: '#0a1220' });

            // Line tension, with the working band marked out.
            const danger = this._tension > 0.88;
            const flash = danger && Math.floor(this._time * 12) % 2 === 0;
            window.PSXHud.bar(bmp, bx, by, bw, bh, clamp(this._tension, 0, 1), {
                seg: 3, gap: 1, zone: [0.45, 0.88],
                colorAt: t => (flash ? P.red : (t > 0.88 ? P.red : (t >= 0.45 ? P.green : P.blue)))
            });
            this._hudText(bmp, 'LINE', bx - labelW - 3, by - 1, labelW, 'right', P.dim, 8);
            this._hudText(bmp, danger ? 'SNAP!' : (this._tension >= 0.45 ? 'GOOD' : 'SLACK'),
                bx + bw + 3, by - 1, labelW + 6, 'left', danger ? P.red : (this._tension >= 0.45 ? P.green : P.cyan), 8);

            // Distance to the rod.
            by += gap;
            window.PSXHud.bar(bmp, bx, by, bw, bh, this._distanceFraction(),
                { seg: 3, gap: 1, color: P.amber });
            this._hudText(bmp, 'DIST', bx - labelW - 3, by - 1, labelW, 'right', P.dim, 8);
            this._hudText(bmp, Math.max(0, Math.ceil(this._distance - LAND_DIST)) + 'M', bx + bw + 3, by - 1, labelW + 6, 'left', P.ink, 8);

            // Fish stamina.
            by += gap;
            const f = this._hooked;
            window.PSXHud.bar(bmp, bx, by, bw, bh, f ? f.stamina : 0, { seg: 3, gap: 1, color: P.magenta });
            this._hudText(bmp, 'FISH', bx - labelW - 3, by - 1, labelW, 'right', P.dim, 8);
            if (f) {
                this._hudText(bmp, this._entityName(f), bx, by + 10, bw, 'center',
                    f.type === 'monster' ? P.red : P.ink, 8);
            }
        }

        _drawCatchCard(bmp, w, h) {
            const P = window.PSXHud.PAL;
            const cw = 186, ch = 46;
            const cx = Math.round((w - cw) / 2), cy = Math.round(h * 0.58);
            window.PSXHud.panel(bmp, cx, cy, cw, ch, { fill: '#101c14' });

            // The catch's own icon, blitted 1:1 into the virtual framebuffer so
            // it upscales as hard pixels along with everything else.
            const icon = this._hooked ? this._hooked.iconIndex : 0;
            let textX = cx + 4, textW = cw - 8;
            if (icon) {
                const set = ImageManager.loadSystem('IconSet');
                if (set.isReady()) {
                    bmp.blt(set, (icon % 16) * 32, Math.floor(icon / 16) * 32, 32, 32,
                        cx + 5, cy + Math.round((ch - 32) / 2), 32, 32);
                }
                textX = cx + 40;
                textW = cw - 44;
            }

            this._hudText(bmp, this._caughtName, textX, cy + 6, textW, 'center', P.green, 16);
            const sub = this._caughtWeight > 0
                ? this._caughtWeight.toFixed(2) + 'KG  AT ' + this._hookDepth.toFixed(1) + 'M'
                : 'UP FROM ' + this._hookDepth.toFixed(1) + 'M';
            this._hudText(bmp, sub, textX, cy + 24, textW, 'center', P.ink, 8);
            if (this._hooked && this._hooked.type === 'monster') {
                this._hudText(bmp, 'IT IS NOT LETTING GO', textX, cy + 34, textW, 'center', P.red, 8);
            }
        }

        //---------------------------------------------------------------------
        // ASCII overlay - repaints the live 3D state as characters, by projecting
        // the world through the same camera. Gameplay above is untouched.
        //---------------------------------------------------------------------
        _renderAscii() {
            const AM = window.AsciiMode;
            if (!AM) return;
            if (!AM.canvas) { if (AM.createCanvas) AM.createCanvas(); return; }
            const cv = AM.canvas, ctx = AM.context;
            if (!ctx) return;
            cv.style.display = 'block';

            const fs = AM.fontSize || 24;
            const font = AM.fontFamily || 'monospace';
            ctx.font = `${fs}px ${font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.fillStyle = '#000008';
            ctx.fillRect(0, 0, cv.width, cv.height);

            const cellW = Math.max(1, Math.round(ctx.measureText('#').width));
            const cellH = Math.max(1, Math.round(fs));
            const cols = Math.max(1, Math.floor(cv.width / cellW));
            const rows = Math.max(1, Math.floor(cv.height / cellH));
            const grid = new Array(rows);
            for (let r = 0; r < rows; r++) grid[r] = new Array(cols).fill(null);
            const put = (c, r, ch, color) => {
                c = Math.floor(c); r = Math.floor(r);
                if (c >= 0 && c < cols && r >= 0 && r < rows) grid[r][c] = { ch, color };
            };
            const toCol = gx => (gx / Graphics.width) * cols;
            const toRow = gy => (gy / Graphics.height) * rows;

            // Water: sample the surface on a coarse grid and project each sample.
            const p = {};
            for (let i = 0; i <= 20; i++) {
                for (let j = 0; j <= 14; j++) {
                    const x = -LAKE_HALF_X + (i / 20) * LAKE_HALF_X * 2;
                    const z = SHORE_Z - 2 - (j / 14) * (SHORE_Z - LAKE_FAR_Z - 4);
                    this._world.projectToScreen(x, WATER_Y + waveHeight(x, z, this._time), z, p);
                    if (!p.visible) continue;
                    const shimmer = (i + Math.floor(this._time * 4)) % 3 === 0;
                    put(toCol(p.x), toRow(p.y), shimmer ? '~' : '=', j < 5 ? '#3399c4' : '#1a6b8c');
                }
            }

            // Swimmers.
            for (const e of this._world.entities) {
                if (e.state === 'landed') continue;
                this._world.projectToScreen(e.rig.position.x, e.rig.position.y, e.rig.position.z, p);
                if (!p.visible) continue;
                let ch = '<', color = '#7fd9ff';
                if (e.type === 'monster') { ch = 'M'; color = '#ff4444'; }
                else if (e.type === 'item') { ch = '$'; color = '#ffe066'; }
                else if (e.state === 'interested') color = '#ffffff';
                else if (e.state === 'hooked') { ch = '@'; color = '#ff8844'; }
                put(toCol(p.x), toRow(p.y), ch, color);
            }

            // Bobber.
            if (this._world.isBobberVisible()) {
                this._world.projectToScreen(this._bob.x, this._bob.y, this._bob.z, p);
                if (p.visible) {
                    const biting = this._state === 'bite';
                    put(toCol(p.x), toRow(p.y),
                        biting ? (Math.floor(this._time * 20) % 2 ? '!' : 'O') : 'O',
                        biting ? '#ff3030' : '#ffffff');
                }
            }

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cell = grid[r][c];
                    if (!cell) continue;
                    ctx.fillStyle = cell.color;
                    ctx.fillText(cell.ch, (c + 0.5) * cellW, (r + 0.5) * cellH);
                }
            }

            const meterY = Math.floor(cv.height * 0.66);
            if (this._state === 'power') this._drawAsciiMeter(ctx, T('Fishing.meter.power'), this._power, meterY, cellW, cellH, 'fill');
            else if (this._state === 'reeling') {
                this._drawAsciiMeter(ctx, T('Fishing.meter.line'), this._tension, meterY, cellW, cellH, 'safe');
                this._drawAsciiMeter(ctx, T('Fishing.meter.dist'), this._distanceFraction(), meterY + cellH * 3, cellW, cellH, 'fill');
            }

            ctx.font = `${fs}px ${font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (this._prompt) {
                ctx.fillStyle = this._promptColor;
                ctx.fillText(this._prompt, cv.width / 2, Math.floor(cv.height * 0.26));
            }
            ctx.fillStyle = '#ffffff';
            ctx.fillText(this._hintText(), cv.width / 2, cv.height - cellH);
        }

        _drawAsciiMeter(ctx, label, value, y, cellW, cellH, mode) {
            const N = 26;
            const tick = Math.round(clamp(value, 0, 1) * (N - 1));
            const startX = (ctx.canvas.width - N * cellW) / 2;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, ctx.canvas.width / 2, y - cellH);
            const safeLo = Math.floor(N * 0.45), safeHi = Math.floor(N * 0.88);
            for (let i = 0; i < N; i++) {
                let ch, color;
                if (mode === 'safe') {
                    if (i === tick) { ch = '#'; color = i > safeHi ? '#ff3030' : '#ffff00'; }
                    else if (i >= safeLo && i <= safeHi) { ch = '+'; color = '#33dd33'; }
                    else if (i > safeHi) { ch = '.'; color = '#993030'; }
                    else { ch = '.'; color = '#666666'; }
                } else {
                    if (i <= tick) { ch = '#'; color = i < N * 0.5 ? '#50ff50' : '#ffaa50'; }
                    else { ch = '.'; color = '#444444'; }
                }
                ctx.fillStyle = color;
                ctx.fillText(ch, startX + (i + 0.5) * cellW, y);
            }
        }

        // Leaving is always a return to the game, never an exit. If nothing is
        // left underneath (a battle or a reload emptied the stack) the map is
        // the answer, because an empty stack makes SceneManager.pop close the
        // whole game.
        popScene() {
            if (SceneManager._stack.length > 0) super.popScene();
            else SceneManager.goto(Scene_Map);
        }

        //---------------------------------------------------------------------
        // Teardown
        //---------------------------------------------------------------------
        terminate() {
            super.terminate();
            this._restoreLookKeys();

            // The HTML labels live outside the scene graph, so they have to be
            // taken down by hand or they hang over whatever comes next.
            if (this._hudDom) {
                this._hudDom.destroy();
                this._hudDom = null;
            }

            // A pending monster-battle transition must not fire from a dead scene.
            if (this._monsterBattleTimer) {
                clearTimeout(this._monsterBattleTimer);
                this._monsterBattleTimer = null;
            }

            if (this._isAscii() && window.AsciiMode && window.AsciiMode.canvas) {
                window.AsciiMode.canvas.style.display = 'none';
            }

            if (window.WeatherAudio && window.WeatherAudio.restore) {
                window.WeatherAudio.restore();
            }
            if (typeof $gameWeather !== 'undefined' && $gameWeather &&
                typeof $gameWeather.updateEnvironmentBgs === 'function') {
                $gameWeather.updateEnvironmentBgs();
            }

            if (this._worldSprite) {
                if (this._worldSprite.parent) this._worldSprite.parent.removeChild(this._worldSprite);
                this._worldSprite.destroy();
                this._worldSprite = null;
            }
            if (this._world) {
                this._world.dispose();
                this._world = null;
            }
        }
    }

    window.Scene_FishingMinigame = Scene_FishingMinigame;

})();
