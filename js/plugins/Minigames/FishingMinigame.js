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
 * The line is a real verlet rope pinned between the rod tip and the hook, with
 * gravity, drag and wind on the slack, so it whips out on the cast, hangs in a
 * catenary while you wait and pulls straight when a fish loads it up.
 *
 * The view is graded by the map's live screen tone, so the time-of-day tint
 * carries into the minigame.
 *
 * Plugin Commands:
 *   openFishingMinigame   opens the fishing scene
 *   closeFishingMinigame  closes the fishing scene
 *
 * The HUD is built the way a PlayStation built one, minus the television: a
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
    // where a PlayStation's lack of precision showed most.
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

    // Palette (sky, water, bed, light) for the venue, and for the hour when the
    // venue has an hour at all.
    function palette(venue) {
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
            this._pal = palette(this._venue);
            this.entities = [];
            this._splashes = [];
            this._disposed = false;

            // Free-look camera: yaw/pitch the player drives while aiming, then
            // eased onto the bobber once the line is out.
            this.yaw = 0;
            this.pitch = -0.08;
            this._autoAim = null;   // THREE.Vector3 the camera eases toward

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
            const N = 220;
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
            const mat = this._mat(this._pal.water, { transparent: true, opacity: 0.80 });
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
            const rockMat = this._mat(0x3a3630);
            const wetMat = this._mat(0x2a2a30);

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

            // The one light source down here that is not the party's own.
            const glowMat = this._mat(0x2a6a5a, { emissive: 0x1d4f42 });
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

        _buildOpenShore() {
            const group = new THREE.Group();

            // Bank behind the player.
            const bank = new THREE.Mesh(new THREE.BoxGeometry(140, 4, 40), this._mat(this._pal.bank));
            bank.position.set(0, -1.4, SHORE_Z + 20);
            group.add(bank);

            // A dip of shoreline sand where the bank meets the water.
            const sand = new THREE.Mesh(new THREE.BoxGeometry(140, 1.6, 6), this._mat(0x8a7a52));
            sand.position.set(0, -0.5, SHORE_Z + 1.2);
            group.add(sand);

            // Side headlands so the lake reads as enclosed rather than infinite.
            for (const sx of [-1, 1]) {
                const head = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 120), this._mat(this._pal.bank));
                head.position.set(sx * (LAKE_HALF_X + 14), -1.6, LAKE_FAR_Z / 2 + 10);
                group.add(head);
            }

            // Far shore across the water.
            const far = new THREE.Mesh(new THREE.BoxGeometry(180, 6, 24), this._mat(this._pal.bank));
            far.position.set(0, -1.8, LAKE_FAR_Z - 10);
            group.add(far);

            // Low-poly trees on the far shore and headlands.
            const trunkMat = this._mat(0x4a3420);
            const leafMat  = this._mat(this._pal.night ? 0x1d3320 : 0x2f5a2a);
            for (let i = 0; i < 34; i++) {
                const onFar = i % 3 !== 0;
                const x = onFar ? (Math.random() * 2 - 1) * 80 : (Math.random() < 0.5 ? -1 : 1) * (LAKE_HALF_X + 8 + Math.random() * 16);
                const z = onFar ? LAKE_FAR_Z - 6 - Math.random() * 14 : LAKE_FAR_Z / 2 + (Math.random() * 2 - 1) * 50;
                const h = 3 + Math.random() * 4;
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, h, 4), trunkMat);
                trunk.position.set(x, 0.6 + h / 2, z);
                group.add(trunk);
                const crown = new THREE.Mesh(new THREE.ConeGeometry(1.2 + Math.random(), 2.6 + Math.random() * 2, 5), leafMat);
                crown.position.set(x, 0.6 + h + 1.1, z);
                group.add(crown);
            }

            // The dock the player stands on, jutting out over the water.
            this._buildJetty(group, 0x6b4a2c, 0x4e3520);

            this.scene.add(group);
            this._shore = group;
            this._track(group);
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
            for (const ent of this.entities) {
                if (ent.battler && ent.battler.update) ent.battler.update(dt);
            }
            if (this._reelMesh) this._reelMesh.rotation.x += this._reelSpin || 0;
            // Item billboards always face the camera.
            for (const ent of this.entities) {
                if (ent.type === 'item' && ent.rig.userData.billboard) {
                    ent.rig.lookAt(this.camera.position.x, ent.rig.position.y, this.camera.position.z);
                }
            }
            this._applyCamera(dt);
        }

        setReelSpin(v) { this._reelSpin = v; }

        render() {
            if (this._disposed) return;
            if (window.PSXShader && window.PSXShader.render) {
                window.PSXShader.render(this.renderer, this.scene, this.camera);
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        // Project a world point to game-resolution screen coordinates. The view
        // matrix is refreshed here rather than trusted: the renderer only rebuilds
        // it when it draws, and the 3D pass runs at half the update rate, so a
        // HUD marker reading the stale one would sit a frame behind the camera.
        projectToScreen(x, y, z, out) {
            this.camera.updateMatrixWorld();
            this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
            const v = this._tmpProj || (this._tmpProj = new THREE.Vector3());
            v.set(x, y, z).project(this.camera);
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
        }
    }

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
        // framebuffer, the way a PlayStation drew its overlay; the labels on top
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
        // wants a different stretch of water walks to it.
        _bindLookKeys() {
            const map = { 87: 'fishFwd', 65: 'fishLeft', 83: 'fishBack', 68: 'fishRight' };
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
            if (dy || dp) W.applyLook(dy, dp);
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

            // Looking around is allowed at every stage except the power swing,
            // where the aim has to stay put. Once the line is out the input only
            // offsets the tracking camera, so the hook is never lost.
            if (this._state !== 'power' && this._state !== 'loading') this._updateLook();
            if (this._state !== 'power' && this._state !== 'loading') this._updateMove();

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
