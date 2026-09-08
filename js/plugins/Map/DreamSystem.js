//=============================================================================
// DreamSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Dream System v5.0.0 (endless procedural liminal 3D dream worlds)
 * @author Omni-Lex
 * @version 5.0.0
 * @description Drops the sleeper into an endless fullscreen 3D dreamscape rolled
 * from a seed: 23 kinds of place mixed together in one world, a random weapon in
 * their right hand, the other games' furniture wandering through it, and
 * something enormous in the sky. Yume Nikki / LSD Dream Emulator / Blame!.
 *
 * @param gridSize
 * @text Dream Grid
 * @desc How many cells a side the generated dream is dealt on, before World Tiling repeats it.
 * @type number
 * @min 16
 * @max 128
 * @default 48
 *
 * @param enemyCount
 * @text Dream Entities
 * @desc How many 3D battlers wander/haunt the dream (randomized appearance + scale)
 * @type number
 * @min 0
 * @max 60
 * @default 26
 *
 * @param flashColors
 * @text Flash Colors
 * @desc Hex colors used for the dream-shift flash (comma separated, no #)
 * @type string
 * @default FF0000,00FF00,0000FF,FFFF00,FF00FF,00FFFF
 *
 * @param worldTiles
 * @text World Tiling
 * @desc Repeats the source grid NxN to enlarge the dream (5 = ~25x bigger). The world always loops seamlessly.
 * @type number
 * @min 1
 * @max 8
 * @default 5
 *
 * @param insightChance
 * @text Insight Chance
 * @desc Percent chance, rolled once per minute spent dreaming, that the dream yields Knowledge points.
 * @type number
 * @min 0
 * @max 100
 * @default 45
 *
 * @param insightMin
 * @text Insight Minimum
 * @desc Fewest Knowledge points a single dream insight is worth.
 * @type number
 * @min 1
 * @default 3
 *
 * @param insightMax
 * @text Insight Maximum
 * @desc Most Knowledge points a single dream insight is worth.
 * @type number
 * @min 1
 * @default 12
 *
 * @command StartDream
 * @text Start Dream
 * @desc Begin the 3D dream sequence
 *
 * @command changeDream
 * @text Change Dream
 * @desc Flash and fall into another dream (a new seed, a new weapon)
 *
 * @help DreamSystem.js
 *
 * Plugin Commands:
 *   StartDream  - Begins the dream (generates a 3D surreal world from a seed).
 *   changeDream - Flashes and falls into another dream.
 *
 * Every minute spent dreaming rolls a chance that the dream yields Knowledge
 * points for the SkillMaster training system; what the sleeper carried out of
 * the dream is reported on waking.
 *
 * In the dream:
 *   - WASD / arrows walk on foot, mouse (click to lock) looks about. On a pad
 *     the LEFT STICK walks and the RIGHT STICK looks, both analog: half a push
 *     is half the speed, and the middle of the look stick's throw is for aiming
 *     rather than for turning round.
 *   - SPACE (Y on a pad) jumps, on the press itself: hold it for the whole rise
 *     and let go early for a hop, and it is remembered for a moment either side
 *     of a landing or an edge, so a press near the ground is never swallowed.
 *     In mid-air it kicks off a wall the sleeper is facing, as often as there
 *     is wall to kick off.
 *   - DOUBLE-TAP SPACE / Y STANDING to take off; hold it to climb, CTRL or L1
 *     to sink; double-tap again to land. Flight cannot be switched on in
 *     mid-jump: a pair of taps begun in the air is a wall kick, never take-off.
 *   - Hold Shift (L3) to move faster.
 *   - The ACTION BUTTON (Enter / gamepad A / R1 / R2 / a click once the mouse
 *     is locked) uses the weapon in the sleeper's right hand: a blade is swung,
 *     a gun is fired, a bow is drawn, each with its own sound.
 *   - UP and DOWN ON THE D-PAD (the wheel, or L2) change what is in that hand,
 *     stepping the shuffled rack of every weapon in the database. The d-pad is
 *     never movement in here, which is what leaves it free to be the rack.
 *   - Esc / B opens the wake-up prompt, drawn as a DOM overlay ON the 3D dream
 *     (not RPG Maker choices). "Pinch cheeks" wakes; "Keep dreaming" resumes.
 *   - TOUCHING anything that is alive triggers an LSD-emulator strobe and drops
 *     you into another dream: a wandering 3D battler, a card of monster art, or
 *     one of the walking sprites off a character sheet.
 *   - WALKING INTO A WALL does the same, either by leaning on any solid
 *     face-first for a moment on foot, or by walking into it over and over: a
 *     few separate shoves inside a few seconds open it just as a long lean
 *     does, the way a wall is a link in LSD Dream Emulator. Only head-on
 *     contact counts, so a wall clipped while running past it or slid along a
 *     corner is nothing; a wall met in mid-air is still a wall kick, and one
 *     met in flight is still a wall.
 *
 * ============================================================================
 * The world is rolled, never read off a map
 * ============================================================================
 *
 * A dream is a seed. The seed deals 4 to 7 REGIONS and lays them out over a
 * gridSize x gridSize field of periodic noise. Nothing is loaded from
 * data/MapXXX.json any more, so a dream is not one of a dozen hand-drawn maps
 * and no two dreams are the same.
 *
 * Each region rolls its own colour register (12 moods), the shape of its ground
 * (9 kinds), what it scatters about (37 props), what architecture runs through
 * it (25 structures), whether it has a ceiling of its own or a lid of water
 * over it, and what is written on its walls. Then most of them roll a KIND:
 * backrooms, office, escher, drowned, miniature, cosmic, megastructure,
 * carpark, hospital, cathedral, factory, datacentre, carnival, sewer, tundra,
 * desert, fleshpit, garden, ruins, blank - or wild, which is the un-themed
 * roll. The kind is per REGION, so they are mixed: a backrooms corridor opens
 * onto a drowned car park with a Blame!-scale megastructure going up behind it.
 *
 * A region may also be a DRIFT region. Stand in one for a few seconds and the
 * whole world shifts to another dream, which is how a sleeper wanders from one
 * kind of place into the next without ever finding a door.
 *
 * ============================================================================
 * What is wrong with a dream
 * ============================================================================
 *
 * WEATHER no sky has ever had: ash, static, teeth, paper, embers, pollen, rain
 * that falls upward, in the dream's own colour and at its own size.
 *
 * LEAKS. Somewhere else is coming through: a corridor of backrooms standing in
 * the middle of a salt flat with its own strip lights, its own floor and its
 * own ceiling, ending in mid-air where it stops being real. A leak is a region
 * like any other, stamped over the layout rather than laid out by it, so
 * everything it is made of - props, architecture, collision, the ground under
 * it - follows for free, and it wraps with the rest of the world.
 *
 * HOLES. A void has nothing under it. Walk in and you fall; fall far enough
 * and you have left the dream the fast way, and where you land is not up to
 * you.
 *
 * LAWS. One to three per dream, and they are what makes one unlike the last
 * beyond the colour of its walls: the ground BREATHES (the whole world rising
 * and falling, everything standing on it carried with it), gravity is light or
 * crushing, the colours INVERT and come back, the figures only move while they
 * are not being WATCHED, or they all come at once (SWARM), or time HITCHES, or
 * nothing ever speaks alone (CHORUS), or the sleeper is never the same size
 * twice (SHRINKING), or the water rises and lets go again (TIDE), or the dream
 * repeats itself repeats itself (ECHO).
 *
 * The sky holds at most ONE black hole, and it is never anywhere but nearest:
 * it stands inside the world's own period, close enough to fly to. Planets,
 * exotic stars and nebulae may hang out there too, but they keep station
 * thousands of units further out, so the hole is always the near thing.
 *
 * ============================================================================
 * The dream goes on for ever, upward as well as sideways
 * ============================================================================
 *
 * There is no edge to walk off and no ceiling to hit. The ground loops
 * perfectly in every horizontal direction, and over that ground the dream is
 * stacked in LEVELS: decks of concrete some 260 units apart, pierced by the
 * same shafts all the way up, going on for as long as anybody climbs. Blame!,
 * where the floor of the world is a detail of it and there is always more
 * structure overhead.
 *
 * A level is a pure function of its own number, so level 4 and level 400,000
 * cost the same to arrive at, and only the four the sleeper is among are ever
 * standing: they are built one a frame as the climb reaches them and dropped
 * again behind. A level is dealt one of five forms - plates with holes torn
 * through them, blocks of sealed cells, girders over nothing, the broken
 * pieces of a floor left floating, or mains a kilometre long - and every four
 * levels the whole stack changes colour and name, so a long climb passes
 * through one place after another without ever arriving anywhere.
 *
 * Everything up there is solid: the plates are walked on, the mains are walked
 * along the top of, and every level carries a stair wound round a core with a
 * light on it, so the climb can be made on foot. The lowest one reaches all the
 * way down to the ground.
 *
 * ============================================================================
 * Apparitions
 * ============================================================================
 *
 * Figures stand about in a dream: monster art out of img/enemies/Dreams and
 * the game's own walking sprites (every sheet in the NPC catalogue, betas
 * included), each one a camera-facing billboard. A walking sprite is
 * DIRECTIONAL, so circling one shows its back, its flank and its face in turn
 * the way it would on the map. Come near and it talks, in Markov, as
 * subtitles across the bottom of the screen. It can also be struck or shot,
 * like anything else in a dream, and pays in Knowledge for it.
 *
 * ============================================================================
 * What a dream sounds like
 * ============================================================================
 *
 * Every region rolls a BGS out of the pool the world's biomes are scored from,
 * so the ambience changes as the sleeper walks from one place to the next, and
 * the dream rolls a small kit of sound effects and hangs them on what is in
 * it: what the creatures cry, what the apparitions say, what a struck thing
 * sounds like and the far-off noises of the place itself. It is re-rolled with
 * every dream, so nothing sounds the same twice.
 *
 * The words on the walls and on the giant signs standing in the fields come
 * from the game's own Markov chains (MarkovTextGenerator), painted to a canvas
 * texture. They are dealt PER REGION, several to a region, so the two walls of
 * one corridor and three hoardings in a row never agree; the chains used to be
 * run once and that single phrase painted over the whole dream. Something enormous may hang over the place: GalaxySim builds it
 * (black holes, 18 exotic star types, nebulae) at whatever size the dream
 * likes, so you can come over a rise and find a black hole.
 *
 * The world is enlarged ~WORLD_TILES^2 (default ~25x) and loops perfectly:
 * ground, props, architecture, colour, entities and guests are all periodic, so
 * walking any direction wraps back seamlessly with no visible edge.
 *
 * ============================================================================
 * The weapon in the sleeper's hand
 * ============================================================================
 *
 * Every dream hands the sleeper a weapon picked at random out of the database
 * and puts it in their right hand. It is drawn by the very layer a battle draws
 * a first-person weapon with, Sprite_3DWeapon over the shared WeaponThreeScene
 * overlay (Weapon3DOverlay.js), built and swung by WeaponSystemProcedural, so
 * it idles, sways, kicks and sounds exactly as it does in a fight. Nothing is
 * equipped on the actor: what the sleeper is holding lasts as long as the
 * dream does, and falling into another dream deals another weapon.
 *
 * And then the dream DRESSES it. Every surface of the model is re-textured out
 * of the whole procedural texture bank rather than out of the bank its own
 * material class draws from, and re-coloured, so what is in hand is never quite
 * the weapon it says it is: a magic circle printed down a rifle stock, fire on
 * a mace head, a crystal on a bowstring, and a part or two lit from inside. The
 * textures are the shared singletons the procedural system already caches, so
 * nothing is uploaded twice and no real weapon is ever changed by it.
 *
 * Using it on something that is wandering about wounds it, and two to six blows
 * stop it being a creature at all: it collapses into a bare primitive or into a
 * piece of furniture out of another game, and the dream pays in Knowledge,
 * announced on the spot. A melee weapon only reaches what is in front of the
 * sleeper; a bow, a sling or a gun reaches most of the way to the fog.
 *
 * ============================================================================
 * Guests
 * ============================================================================
 *
 * Furniture that has wandered in out of the other games keeps its own colours,
 * because it has to read as an intrusion: bowling pins and balls, playing,
 * tarot and scratch cards, a slot reel, a pool ball and cue, a die, an arcade
 * cabinet, piano keys, a fishing float, a surfboard, a tetris block, a booster
 * pack, a horseshoe, a coin - and the party's own camper, loaded off disk
 * (models/Camper.glb).
 *
 * The whole scene renders through the shared PSXShader for a PlayStation-1
 * wobble, dithering and low-res crunch. The world is populated with battlers
 * from 3DBattlerSystem.js, their generation randomized and their scale pushed
 * large, with a rare chance of gigantic, world-filling horrors.
 *
 * ============================================================================
 * Whose dream it is
 * ============================================================================
 *
 * A dream had out of the title screen's minigame arcade belongs to nobody: it
 * is rolled out of the world seed and the clock, exactly as it always was, and
 * nothing is announced in there either (no Knowledge toast, no waking message)
 * because it is a place to be in rather than a night's work.
 *
 * A dream had in a BED is the party's own, and the party already keeps a record
 * of its life: the diary (Core/Diary.js). The whole of it is read, and it
 * changes exactly two things - which creatures are standing in the dream and
 * which faces are walking about in it. The place itself, its laws, its sky and
 * its weather are rolled the way they always were.
 *
 *   FREQUENCY   a line written last night is dealt some ten times as often as
 *               one written at the start of the playthrough, so a dream is
 *               mostly about the day that has just been had.
 *   DISTANCE    the sleeper opens their eyes at the middle of the field, and
 *               every remembered thing stands at a radius set by its own age.
 *               What is within arm's reach happened last night; walking outward
 *               is walking back through the party's life, and the far edge of
 *               the field is where the playthrough began.
 *
 * A creature is matched from the diary's own words back to its row in
 * Enemies.json and drawn as the 3D battler it really is; a person is drawn on
 * their own walking sheet where the world gave them one, and otherwise on a
 * face dealt from their name alone, so the same person is the same figure in
 * every dream they ever turn up in. Recency is measured by RANK rather than by
 * the clock, because a diary spans anything from an afternoon to eleven years
 * and no half-life in minutes reads sensibly across both.
 *
 * ============================================================================
 * What sleep debt does to a dream
 * ============================================================================
 *
 * window.Insomnia (Core/TimeDateSystem.js) counts from the last time the party
 * really lay down, not from the sleep meter, which a seat and a coffee both
 * refill. Its `dread` figure is 0 up to a day awake, 0.4 at two days, 0.8 at a
 * week and 1 past a fortnight, and NOTHING here rolls a different dream for it:
 * the same seed builds the same place, and the place is then DRESSED. Every
 * colour is pulled toward a bloodless dark, the fog closes in, the laws that
 * make a place feel occupied (watched, echo, swarm, stutter) stop being a roll
 * and are simply true, the ambience gives way to the horror end of the pool,
 * the register everything speaks in drops, and there are more of everything.
 *
 * What the figures SAY changes too. Ordinarily they speak in Markov, out of the
 * language the rest of the game is written in, which is the whole point of them.
 * Past a day awake a share of what is said comes instead from DREAD_LINES, a
 * small closed bank kept in this file and deliberately not in the i18n files:
 * it is the one voice in the game that is not the game's, and it is only ever
 * heard by somebody who should have gone to bed.
 *
 * Requires THREE.js + PSXShader.js + 3DBattlerSystem.js (and its families) loaded.
 * ============================================================================
 */

(() => {
    'use strict';

    const pluginName = 'DreamSystem';
    const parameters = PluginManager.parameters(pluginName);

    const GRID_SIZE = Math.max(16, Math.min(128, parseInt(parameters['gridSize'] || '48', 10)));
    const ENEMY_COUNT = Math.max(0, parseInt(parameters['enemyCount'] || '26', 10));
    const flashColors = (parameters['flashColors'] || 'FF00FF')
        .split(',').map(c => c.trim());
    const WORLD_TILES = Math.max(1, parseInt(parameters['worldTiles'] || '5', 10));
    const INSIGHT_CHANCE = Math.max(0, Math.min(100, parseInt(parameters['insightChance'] || '45', 10))) / 100;
    const INSIGHT_MIN = Math.max(1, parseInt(parameters['insightMin'] || '3', 10));
    const INSIGHT_MAX = Math.max(INSIGHT_MIN, parseInt(parameters['insightMax'] || '12', 10));
    const INSIGHT_PERIOD = 60;   // seconds of dreaming per roll
    const DRIFT_SECONDS = 7;     // how long a drift region is stood in before the dream moves on
    const WALL_SECONDS = 0.4;    // how long a wall is walked face-first into before it gives way
    // A hole in the dream has no bottom. Fall this far under the lowest ground
    // and the sleeper has fallen out of this dream and into another.
    const VOID_FLOOR = -520;
    const TALK_RANGE = 210;      // how near an apparition has to be before it is heard
    // Walking into a wall over and over is asking to leave: this many separate
    // walks into one, inside WALL_BUMP_WINDOW seconds of each other, opens the
    // dream even if none of them was leant on long enough to open it alone.
    const WALL_BUMPS = 3;
    const WALL_BUMP_WINDOW = 3.2;

    // ---- the pad -------------------------------------------------------------
    // A dream is played on a controller as often as at a keyboard, and the
    // engine's own mapper only carries the face buttons: the sticks are folded
    // into the d-pad directions and the analog triggers are not carried at all.
    // Everything spatial in here is therefore read straight off the shared
    // helper instead (AnalogStickInput), which is also the only way the d-pad
    // can be told apart from the left stick.
    const PAD_LOOK_X = 3.1;      // radians a second at full deflection
    const PAD_LOOK_Y = 2.2;
    const TRIGGER_ON = 0.55;     // how far a trigger is pulled before it counts
    const TRIGGER_OFF = 0.30;    // and how far back it comes before it may fire again

    function padHelper() {
        const p = window.AnalogStickInput;
        return (p && p.hasPad && p.hasPad()) ? p : null;
    }
    /**
     * A button going down, edged against the DREAM'S own frame rather than
     * against the engine's. The helper's isButtonTriggered is edged against
     * Input.update, and a dream is drawn from its own requestAnimationFrame
     * loop: whenever two dream frames fall inside one engine frame the same
     * press reads as triggered twice, which steps the rack two weapons at a
     * time and turns a single tap of Y into a double tap (i.e. into flight).
     * Reading the HELD state and remembering it here cannot do that.
     *
     * Each name must be asked for exactly once a frame, which is what makes the
     * remembered state the previous frame's.
     */
    const _padWas = {};
    function padEdge(name) {
        const p = padHelper();
        const down = p ? p.isButtonPressed(p.BUTTON[name]) : false;
        const was = !!_padWas[name];
        _padWas[name] = down;
        return down && !was;
    }

    let dreamActive = false;
    window.dreamActive = false;

    const hasTHREE = (typeof THREE !== 'undefined');
    if (!hasTHREE) {
        console.error('[DreamSystem] THREE.js not loaded; 3D dreams are disabled.');
    }

    // =========================================================================
    // Self-contained seeded Perlin noise (surreal ground warp).
    // =========================================================================
    const _perm = new Uint8Array(512);
    function initPerlin(seed) {
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        let s = ((seed || 1337) >>> 0);
        for (let i = 255; i > 0; i--) {
            s = (s * 1664525 + 1013904223) >>> 0;
            const j = s % (i + 1);
            const t = p[i]; p[i] = p[j]; p[j] = t;
        }
        for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
    }
    initPerlin(1337);
    function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function _lerp(t, a, b) { return a + t * (b - a); }
    function _grad(h, x, y) {
        h &= 7;
        const u = h < 4 ? x : y;
        const v = h < 4 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }
    function perlin2(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = _fade(x), v = _fade(y);
        const A = _perm[X] + Y, B = _perm[X + 1] + Y;
        return _lerp(v,
            _lerp(u, _grad(_perm[A], x, y), _grad(_perm[B], x - 1, y)),
            _lerp(u, _grad(_perm[A + 1], x, y - 1), _grad(_perm[B + 1], x - 1, y - 1)));
    }

    // =========================================================================
    // What a dream is made of.
    //
    // There is no table of eight biomes any more, and no map file behind one: a
    // dream ROLLS its whole world. Its theme, its colour registers, the shape
    // of its ground, the floor printed on it, what stands about, what
    // architecture runs through it, whether it has a ceiling at all, what is
    // written on its walls and which other game's furniture has leaked into it
    // are all dealt from the seed, so two dreams share nothing but the code
    // that made them.
    //
    // Everything is periodic over the world, because the sleeper walks a torus:
    // ground, props and architecture all have to meet themselves at the wrap.
    // =========================================================================
    const CELL = 16;            // world units per grid cell
    const WALL_H = 46;          // height of the monoliths a wall region is made of
    const MARGIN = 1408;        // terrain/prop overscan (>= fog view distance), a whole number of cells
    const TAU = Math.PI * 2;

    function hash01(x, y, i) {
        const h = Math.sin(x * 12.9898 + y * 78.233 + i * 37.719) * 43758.5453;
        return h - Math.floor(h);
    }

    // Written out rather than borrowed from THREE.Color so a dream can be
    // rolled, and tested, with no renderer anywhere near it.
    function hslHex(h, s, l) {
        h = ((h % 1) + 1) % 1;
        s = Math.max(0, Math.min(1, s));
        l = Math.max(0, Math.min(1, l));
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const chan = (t) => {
            t = ((t % 1) + 1) % 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return (Math.round(chan(h + 1 / 3) * 255) << 16)
             | (Math.round(chan(h) * 255) << 8)
             | Math.round(chan(h - 1 / 3) * 255);
    }

    /**
     * The registers a dream's colour is allowed to speak in. A mood fixes how
     * saturated and how bright a region is and leaves the hue to the roll, so
     * "fluorescent" is always a strip-lit ceiling and never a jungle, while no
     * two fluorescent dreams are the same shade of nothing.
     */
    const MOODS = {
        fluorescent: { sat: [0.04, 0.16], light: [0.58, 0.86], sky: 0.80, glow: 0.10 },
        concrete:    { sat: [0.02, 0.10], light: [0.28, 0.60], sky: 0.42 },
        vhs:         { sat: [0.35, 0.75], light: [0.16, 0.40], sky: 0.14, glow: 0.25 },
        neon:        { sat: [0.75, 1.00], light: [0.34, 0.58], sky: 0.08, glow: 0.85 },
        voidlit:     { sat: [0.00, 0.18], light: [0.02, 0.13], sky: 0.03, glow: 0.40 },
        pastel:      { sat: [0.22, 0.48], light: [0.68, 0.90], sky: 0.86 },
        flesh:       { hue: [0.95, 1.04], sat: [0.42, 0.80], light: [0.20, 0.52], sky: 0.22 },
        rust:        { hue: [0.02, 0.10], sat: [0.38, 0.78], light: [0.22, 0.50], sky: 0.30 },
        sodium:      { hue: [0.07, 0.13], sat: [0.62, 0.98], light: [0.34, 0.62], sky: 0.18, glow: 0.40 },
        chlorine:    { hue: [0.44, 0.56], sat: [0.30, 0.70], light: [0.44, 0.72], sky: 0.66 },
        mould:       { hue: [0.18, 0.36], sat: [0.22, 0.58], light: [0.18, 0.46], sky: 0.26 },
        ash:         { sat: [0.00, 0.06], light: [0.34, 0.78], sky: 0.62 }
    };
    const MOOD_KEYS = Object.keys(MOODS);

    /** Ground, sky and the colours of whatever is standing on the ground. */
    function rollPalette(rnd, moodKey) {
        const m = MOODS[moodKey] || MOODS.concrete;
        const span = (r) => r[0] + rnd() * (r[1] - r[0]);
        const hue = m.hue ? span(m.hue) : rnd();
        const s = span(m.sat), l = span(m.light);
        // An accent is pushed away from the floor's own lightness, so a thing is
        // never quite the colour of what it is standing on.
        const away = l > 0.5 ? -1 : 1;
        const clamp = (v) => Math.max(0.05, Math.min(0.95, v));
        return {
            mood: moodKey, hue: hue,
            g0: hslHex(hue, s, l),
            g1: hslHex(hue + (rnd() - 0.5) * 0.12, s * 0.8, Math.max(0.02, l - 0.14)),
            sky: hslHex(hue + (rnd() - 0.5) * 0.20, s * 0.6, m.sky),
            accent: hslHex(hue + 0.32 + rnd() * 0.3, Math.min(1, s + 0.25), clamp(l + away * 0.30)),
            accent2: hslHex(hue + 0.52 + rnd() * 0.2, Math.min(1, s + 0.10), clamp(l + away * 0.46)),
            dark: hslHex(hue, s * 0.5, Math.max(0.02, l * 0.35)),
            pale: hslHex(hue, s * 0.25, Math.min(0.97, l + 0.34)),
            glow: m.glow || 0
        };
    }

    // ---- the shape of the ground ----------------------------------------
    // `n(x, z, freq)` is the world-periodic noise sampler; a wave-based kind
    // takes whole wave numbers over the world period for the same reason.
    const GROUNDS = {
        flat:    (g) => g.baseY,
        rolling: (g, x, z, n) => g.baseY + n(x, z, 0.012 * g.freq) * g.amp,
        dunes:   (g, x, z, n) => g.baseY + Math.abs(n(x, z, 0.010 * g.freq)) * g.amp * 1.8,
        terrace: (g, x, z, n) => g.baseY + Math.round(n(x, z, 0.009 * g.freq) * g.amp / g.step) * g.step,
        ripple:  (g, x, z, n, W, H) => g.baseY
            + Math.sin(TAU * g.k1 * x / W) * g.amp * 0.6
            + Math.sin(TAU * g.k2 * z / H) * g.amp * 0.6,
        eggbox:  (g, x, z, n, W, H) => g.baseY
            + Math.sin(TAU * g.k1 * x / W) * Math.sin(TAU * g.k2 * z / H) * g.amp,
        spikes:  (g, x, z, n) => g.baseY + Math.pow(Math.abs(n(x, z, 0.026 * g.freq)), 2.2) * g.amp * 6,
        basin:   (g, x, z, n) => g.baseY - Math.pow(Math.max(0, -n(x, z, 0.011 * g.freq)), 1.3) * g.amp * 3.2,
        shelves: (g, x, z, n) => g.baseY + Math.floor(n(x, z, 0.007 * g.freq) * 4.5) * g.step * 1.5
    };
    const GROUND_KEYS = Object.keys(GROUNDS);

    // =========================================================================
    // Text.
    //
    // A dream talks. The words come from the game's own Markov chains
    // (MarkovTextGenerator), so what is painted on a corridor wall or standing
    // twelve metres tall in a field is built out of the language the rest of
    // the game speaks, run through a chain until it stops making sense.
    // =========================================================================
    // What is said once the party has stopped sleeping.
    //
    // Deliberately NOT in the i18n files and deliberately not the Markov
    // chains. The chains speak the language of the rest of the game and that is
    // the point of them: a dream built out of shop signs and quest text reads
    // as the sleeper's own day coming back at them. A mind three days without
    // sleep is not doing that any more. These lines are the exception, a small
    // closed bank of things a dream says only when there is something wrong
    // with the sleeper, kept here so it can never be mistaken for the game's
    // own voice, and cut in at a rate that climbs with the dread.
    // i18n-ignore-start: exclusive sleep-deprivation bank, never localised.
    const DREAD_LINES = [
        'YOU ARE STILL AWAKE', 'IT IS NOT MORNING YET', 'COUNT THEM AGAIN',
        'WE HAVE BEEN HERE SINCE YOU STOPPED', 'THE BED IS COLD NOW',
        'HOW MANY DAYS', 'DO NOT BLINK ON MY ACCOUNT', 'YOUR EYES ARE FULL OF SAND',
        'SOMETHING IS WEARING YOUR FACE', 'THE HOURS ARE PILING UP BEHIND YOU',
        'YOU LEFT YOURSELF SOMEWHERE', 'THERE IS NO NIGHT LEFT TO SPEND',
        'LIE DOWN LIE DOWN LIE DOWN', 'WE COUNTED WHILE YOU DID NOT',
        'YOU ARE NOT DREAMING THIS', 'THE CEILING HAS BEEN WATCHING',
        'STAY UP WITH US', 'YOUR HEART IS RUNNING AHEAD OF YOU',
        'NOBODY IS COMING TO WAKE YOU', 'IT GETS THIN AROUND HERE',
        'WHO IS BREATHING FOR YOU', 'THE LAST ONE ASLEEP LOCKED THE DOOR',
        'YOU FORGOT WHAT REST WAS FOR', 'EVERYTHING IS AWAKE NOW',
        'THIS IS THE FOURTH DAY', 'THE WALLS HAVE STOPPED PRETENDING',
        'SLEEP IS A PLACE AND YOU CANNOT FIND IT', 'YOU ARE MAKING US TIRED',
        'PUT YOUR HEAD DOWN', 'IT WILL NOT STOP UNTIL YOU DO',
        'THERE ARE MORE OF US WHEN YOU ARE TIRED', 'YOU HAVE BEEN SAYING THAT FOR HOURS',
        'THE FLOOR IS FURTHER AWAY EACH TIME', 'WE ATE THE MORNING',
        'CLOSE THEM CLOSE THEM CLOSE THEM', 'YOUR BODY FILED A COMPLAINT',
        'SOMETHING IS STANDING BEHIND THE HOUR HAND', 'YOU WILL NOT REMEMBER THIS EITHER'
    ];
    // i18n-ignore-end

    function dreadPhrase(rnd) {
        return DREAD_LINES[Math.floor((rnd || Math.random)() * DREAD_LINES.length)];
    }

    function dreamPhrase(rnd, maxWords) {
        // The further past a night's rest the party is, the more of what the
        // dream says is the dread bank rather than the chains. At a week awake
        // almost nothing the game itself wrote is left in it.
        const dread = (window.DreamSystem && window.DreamSystem.dread) ? window.DreamSystem.dread() : 0;
        if (dread > 0 && (rnd || Math.random)() < 0.25 + dread * 0.65) return dreadPhrase(rnd);
        let out = '';
        try {
            if (window.generateMarkovString) {
                out = String(window.generateMarkovString('all', {
                    chainOrder: 2,
                    minLength: 2,
                    maxLength: Math.max(2, maxWords || 7)
                }) || '');
            }
        } catch (e) { /* no chains loaded */ }
        out = out.replace(/^ERROR.*$/i, '').trim();
        if (!out) {
            // The chains are not up yet (a very early dream). Say nothing rather
            // than say something in English on a wall in every language.
            return '';
        }
        const words = out.split(/\s+/).slice(0, Math.max(2, maxWords || 7));
        return words.join(' ').toUpperCase();
    }

    /**
     * Paints a phrase onto a canvas texture. Used flat on a giant standing sign
     * and tiled down a corridor wall, which is why the tiling case draws the
     * line several times over at different heights.
     */
    function makeTextTexture(text, opts) {
        opts = opts || {};
        const w = opts.width || 512, h = opts.height || 256;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const c = cv.getContext('2d');
        c.fillStyle = opts.bg || 'rgba(0,0,0,0)';
        c.fillRect(0, 0, w, h);
        c.fillStyle = opts.ink || '#101014';
        c.textAlign = 'center';
        c.textBaseline = 'middle';

        const lines = [];
        const words = String(text || '').split(/\s+/).filter(Boolean);
        const per = Math.max(1, Math.ceil(words.length / (opts.lines || 2)));
        for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(' '));
        if (!lines.length) lines.push('');

        const size = opts.size || Math.floor(h / (lines.length + 1.2));
        c.font = 'bold ' + size + 'px monospace';
        const step = h / (lines.length + 1);
        for (let i = 0; i < lines.length; i++) {
            const y = step * (i + 1);
            if (opts.shadow) {
                c.fillStyle = 'rgba(0,0,0,0.45)';
                c.fillText(lines[i], w / 2 + size * 0.06, y + size * 0.06);
                c.fillStyle = opts.ink || '#101014';
            }
            c.fillText(lines[i], w / 2, y);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.LinearFilter;
        if (opts.repeat) {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(opts.repeat[0], opts.repeat[1]);
        }
        return tex;
    }

    // =========================================================================
    // Shapes.
    //
    // Every prototype below is written in the helpers under here, so a new
    // dream object is a line or two rather than a page of THREE boilerplate. A
    // prototype stands at the origin with its feet on y = 0, and is built ONCE
    // per dream: the world is furnished by instancing it (see instanceProto),
    // which is what lets a dream carry tens of thousands of them.
    // =========================================================================
    // Materials are shared across a whole dream rather than made fresh per
    // mesh. Two things depend on it: the prototype flattener merges meshes that
    // share a material into one geometry (a server room is 120 boxes and would
    // otherwise be 120 draw calls), and the renderer compiles one program for
    // the lot. Cleared per dream, since the scene disposes what it holds.
    let _matCache = new Map();
    function resetMatCache() { _matCache = new Map(); }
    function dmat(color, o) {
        o = o || {};
        const key = color + '|' + (o.glow || 0) + '|' + (o.glowColor === undefined ? '' : o.glowColor)
            + '|' + (o.opacity === undefined ? '' : o.opacity) + '|' + (o.both ? 1 : 0)
            + '|' + (o.alpha ? 1 : 0) + '|' + (o.map ? (o.map.uuid || 'm') : '');
        const hit = _matCache.get(key);
        if (hit) return hit;
        const mat = dmatNew(color, o);
        _matCache.set(key, mat);
        return mat;
    }
    function dmatNew(color, o) {
        return new THREE.MeshLambertMaterial({
            color: color,
            map: o.map || null,
            emissive: o.glow ? (o.glowColor !== undefined ? o.glowColor : color) : 0x000000,
            emissiveIntensity: o.glow || 0,
            transparent: o.opacity !== undefined || !!o.alpha,
            opacity: o.opacity !== undefined ? o.opacity : 1,
            side: o.both ? THREE.DoubleSide : THREE.FrontSide
        });
    }
    /**
     * Concatenates geometries with their own transforms baked into the
     * vertices, so a group of meshes that share a material can be drawn as one.
     * Written out here because the three build the game ships carries no
     * BufferGeometryUtils. Answers null if anything in the list is not a plain
     * position/normal/uv geometry, and the caller then keeps them separate.
     */
    function bakeMerge(list) {
        const pos = [], nor = [], uv = [], idx = [];
        const v = new THREE.Vector3(), nm = new THREE.Matrix3();
        let base = 0;
        for (const it of list) {
            const g = it.geo;
            const p = g.attributes && g.attributes.position;
            if (!p) return null;
            const n = g.attributes.normal, u = g.attributes.uv;
            nm.getNormalMatrix(it.local);
            for (let i = 0; i < p.count; i++) {
                v.fromBufferAttribute(p, i).applyMatrix4(it.local);
                pos.push(v.x, v.y, v.z);
                if (n) {
                    v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
                    nor.push(v.x, v.y, v.z);
                } else nor.push(0, 1, 0);
                if (u) uv.push(u.getX(i), u.getY(i)); else uv.push(0, 0);
            }
            const index = g.index;
            if (index) for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + base);
            else for (let i = 0; i < p.count; i++) idx.push(i + base);
            base += p.count;
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        out.setIndex(idx);
        return out;
    }

    // =========================================================================
    // Collision.
    //
    // Everything a dream stands on the ground is solid, and it is solid per
    // PART rather than per object: a corridor's two walls block and the space
    // between them does not, a doorframe's posts block and the doorway does
    // not. The boxes are read off the prototype once, in its own space, and the
    // controller re-derives what is near the sleeper from the same placement
    // rules the world was built with (DreamScene._solidsNear), so no copy of
    // the world is stored anywhere.
    // =========================================================================
    const COL_MAX_PARTS = 28;    // heaviest prototypes are all detail past this
    const COL_MIN_SIZE = 1.2;    // a screw is not a wall

    /**
     * @param {THREE.Object3D} proto standing at the origin, feet on y = 0
     * @param {{square:boolean}} opts square footprints for anything that gets
     *   turned on the spot, since a Y rotation must not change what it blocks
     * @returns {Array} boxes as { x, z, y0, y1, hx, hz } in prototype units
     */
    function collisionBoxes(proto, opts) {
        if (!proto || !THREE.Box3) return [];
        proto.updateMatrixWorld(true);
        const box = new THREE.Box3();
        const out = [];
        proto.traverse((o) => {
            if (!o.isMesh || !o.geometry) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const bb = o.geometry.boundingBox;
            if (!bb) return;
            box.copy(bb).applyMatrix4(o.matrixWorld);
            let hx = (box.max.x - box.min.x) * 0.5;
            let hz = (box.max.z - box.min.z) * 0.5;
            const hy = box.max.y - box.min.y;
            if (Math.max(hx, hz) * 2 < COL_MIN_SIZE || hy < COL_MIN_SIZE * 0.4) return;
            if (opts && opts.square) hx = hz = Math.max(hx, hz);
            out.push({
                x: (box.max.x + box.min.x) * 0.5, z: (box.max.z + box.min.z) * 0.5,
                y0: box.min.y, y1: box.max.y, hx: hx, hz: hz,
                vol: hx * hz * hy
            });
        });
        // The biggest parts are the ones worth colliding with; the rest is trim.
        out.sort((a, b) => b.vol - a.vol);
        return out.slice(0, COL_MAX_PARTS);
    }

    function put(mesh, x, y, z, rx, ry, rz) {
        mesh.position.set(x || 0, y || 0, z || 0);
        mesh.rotation.set(rx || 0, ry || 0, rz || 0);
        return mesh;
    }
    const gBox  = (w, h, d, c, o) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dmat(c, o));
    const gCyl  = (rt, rb, h, seg, c, o) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 8), dmat(c, o));
    const gSph  = (r, c, o) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), dmat(c, o));
    const gCone = (r, h, seg, c, o) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 6), dmat(c, o));
    const gTor  = (r, t, c, o) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 12), dmat(c, o));
    const gQuad = (w, h, c, o) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), dmat(c, Object.assign({ both: true }, o || {})));
    function knit() {
        const g = new THREE.Group();
        for (let i = 0; i < arguments.length; i++) if (arguments[i]) g.add(arguments[i]);
        return g;
    }

    // ---- the things standing in a region ---------------------------------
    // One entry per silhouette. `p` is the region's palette; `r` its own rng,
    // so the same prop is a different object in the next dream.
    const PROPS = {
        monolith:  (r, p) => knit(put(gBox(3, 26, 3, p.accent), 0, 13, 0)),
        obelisk:   (r, p) => knit(put(gBox(4, 28, 4, p.accent), 0, 14, 0), put(gCone(3.2, 7, 4, p.accent2), 0, 31.5, 0)),
        pillar:    (r, p) => knit(put(gCyl(2, 2.4, 24, 10, p.pale), 0, 12, 0),
                                  put(gBox(6, 1.6, 6, p.accent), 0, 24.8, 0),
                                  put(gBox(6, 1.6, 6, p.accent), 0, 0.8, 0)),
        arch:      (r, p) => knit(put(gTor(8, 1.6, p.accent), 0, 9, 0)),
        halo:      (r, p) => knit(put(gTor(7, 0.7, p.accent2, { glow: Math.max(0.5, p.glow) }), 0, 14, 0, Math.PI / 2, 0, 0)),
        knot:      (r, p) => knit(put(new THREE.Mesh(new THREE.TorusKnotGeometry(4, 1.1, 40, 6), dmat(p.accent2, { glow: p.glow })), 0, 12, 0)),
        icosa:     (r, p) => knit(put(new THREE.Mesh(new THREE.IcosahedronGeometry(5, 0), dmat(p.accent, { glow: p.glow })), 0, 7, 0)),
        glyph:     (r, p) => knit(put(new THREE.Mesh(new THREE.TetrahedronGeometry(3), dmat(p.accent2, { glow: Math.max(0.6, p.glow) })), 0, 3, 0)),
        glowcube:  (r, p) => knit(put(gBox(6, 6, 6, p.accent2, { glow: Math.max(0.7, p.glow) }), 0, 3, 0)),
        eye:       (r, p) => knit(put(gSph(4, 0xf3eee0), 0, 10, 0),
                                  put(gSph(1.7, 0x0a0a0a), 0, 10, 3.1),
                                  put(gCyl(0.5, 0.7, 10, 5, p.dark), 0, 4, 0)),
        organic:   (r, p) => knit(put(gCone(3.5, 18, 6, p.accent), 0, 9, 0)),
        mushroom:  (r, p) => {
            const cap = gSph(5, p.accent);
            cap.scale.set(1, 0.55, 1);
            return knit(put(gCyl(1, 1.6, 12, 7, p.pale), 0, 6, 0), put(cap, 0, 12, 0));
        },
        crystal:   (r, p) => knit(put(gCone(2.2, 14, 5, p.accent2, { glow: p.glow * 0.6 }), 0, 7, 0),
                                  put(gCone(1.4, 9, 5, p.accent2, { glow: p.glow * 0.6 }), 3, 4.5, 1, 0, 0, 0.35),
                                  put(gCone(1.1, 7, 5, p.accent2, { glow: p.glow * 0.6 }), -2.6, 3.5, -1.4, 0, 0, -0.42)),
        stairs:    (r, p) => {
            const g = new THREE.Group();
            for (let i = 0; i < 9; i++) g.add(put(gBox(9, 1.6, 3, i % 2 ? p.pale : p.accent), 0, 1.6 * i + 0.8, i * 3));
            return g;
        },
        doorframe: (r, p) => knit(put(gBox(1.2, 15, 1.2, p.accent), -4, 7.5, 0),
                                  put(gBox(1.2, 15, 1.2, p.accent), 4, 7.5, 0),
                                  put(gBox(9.2, 1.4, 1.2, p.accent), 0, 15.7, 0),
                                  put(gQuad(6.8, 14, p.dark, { opacity: 0.85 }), 0, 7.5, 0)),
        window:    (r, p) => knit(put(gBox(12, 1, 1, p.accent), 0, 16, 0), put(gBox(12, 1, 1, p.accent), 0, 6, 0),
                                  put(gBox(1, 11, 1, p.accent), -5.5, 11, 0), put(gBox(1, 11, 1, p.accent), 5.5, 11, 0),
                                  put(gQuad(10, 9, p.pale, { opacity: 0.4, glow: 0.35 }), 0, 11, 0),
                                  put(gBox(1.6, 12, 1.6, p.dark), -5.5, 6, 0), put(gBox(1.6, 12, 1.6, p.dark), 5.5, 6, 0)),
        tvset:     (r, p) => knit(put(gBox(9, 8, 7, p.dark), 0, 5, 0),
                                  put(gQuad(6.4, 5, p.accent2, { glow: 0.9 }), 0, 5.4, 3.6),
                                  put(gCyl(0.2, 0.2, 7, 4, p.pale), -1.6, 11, -1, 0, 0, 0.4),
                                  put(gCyl(0.2, 0.2, 7, 4, p.pale), 1.6, 11, -1, 0, 0, -0.4)),
        lamppost:  (r, p) => knit(put(gCyl(0.5, 0.7, 26, 6, p.dark), 0, 13, 0),
                                  put(gBox(1, 1, 6, p.dark), 0, 25.5, 2.6),
                                  put(gSph(1.9, 0xfff0c0, { glow: 1.0 }), 0, 24.4, 5.2)),
        pylon:     (r, p) => {
            const g = new THREE.Group();
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                g.add(put(gCyl(0.35, 0.6, 40, 4, p.dark), sx * 3, 20, sz * 3, sx * 0.05, 0, -sz * 0.05));
            }
            for (const y of [20, 28, 35]) {
                g.add(put(gBox(20, 0.7, 0.7, p.dark), 0, y, 0));
                g.add(put(gBox(7, 0.5, 0.5, p.dark), 0, y - 2, 0, 0, Math.PI / 2, 0));
            }
            return g;
        },
        pipe:      (r, p) => knit(put(gCyl(1.4, 1.4, 26, 8, p.accent), 0, 12, 0, 0, 0, Math.PI / 2),
                                  put(gTor(1.7, 0.5, p.dark), -7, 12, 0, 0, Math.PI / 2, 0),
                                  put(gTor(1.7, 0.5, p.dark), 7, 12, 0, 0, Math.PI / 2, 0),
                                  put(gBox(1, 12, 1, p.dark), -7, 6, 0), put(gBox(1, 12, 1, p.dark), 7, 6, 0)),
        cone:      (r, p) => knit(put(gBox(5, 0.7, 5, 0x1b1b1b), 0, 0.35, 0),
                                  put(gCone(2, 7, 8, 0xe4641e), 0, 3.9, 0),
                                  put(gCyl(1.15, 1.35, 1.1, 8, 0xf2f2f2), 0, 4.2, 0)),
        hydrant:   (r, p) => knit(put(gCyl(1.5, 1.8, 6, 8, 0xc0281e), 0, 3, 0), put(gSph(1.5, 0xc0281e), 0, 6.2, 0),
                                  put(gCyl(0.7, 0.7, 1.4, 6, 0xc0281e), 0, 4, 1.6, Math.PI / 2, 0, 0),
                                  put(gCyl(0.7, 0.7, 1.4, 6, 0xc0281e), 0, 4, -1.6, Math.PI / 2, 0, 0)),
        bench:     (r, p) => knit(put(gBox(14, 0.8, 5, p.accent), 0, 5, 0), put(gBox(14, 5, 0.8, p.accent), 0, 7.5, -2.2),
                                  put(gBox(0.9, 5, 4.6, p.dark), -6, 2.5, 0), put(gBox(0.9, 5, 4.6, p.dark), 6, 2.5, 0)),
        chair:     (r, p) => {
            const g = knit(put(gBox(6, 0.7, 6, p.accent), 0, 7, 0), put(gBox(6, 8, 0.7, p.accent), 0, 11, -2.6));
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(put(gBox(0.7, 7, 0.7, p.dark), sx * 2.5, 3.5, sz * 2.5));
            return g;
        },
        ladder:    (r, p) => {
            const g = knit(put(gBox(0.7, 24, 0.7, p.accent), -2.4, 12, 0), put(gBox(0.7, 24, 0.7, p.accent), 2.4, 12, 0));
            for (let i = 0; i < 8; i++) g.add(put(gBox(5.4, 0.5, 0.5, p.accent), 0, 2 + i * 2.8, 0));
            return g;
        },
        flag:      (r, p) => knit(put(gCyl(0.35, 0.35, 30, 5, p.pale), 0, 15, 0),
                                  put(gQuad(9, 6, p.accent2), 4.6, 26, 0)),
        tree:      (r, p) => knit(put(gCyl(1, 1.7, 14, 5, p.dark), 0, 7, 0),
                                  put(gCone(6, 12, 6, p.accent), 0, 18, 0), put(gCone(4.4, 9, 6, p.accent), 0, 25, 0)),
        deadtree:  (r, p) => {
            const g = knit(put(gCyl(0.9, 1.8, 20, 5, p.dark), 0, 10, 0));
            for (let i = 0; i < 5; i++) {
                const a = r() * TAU;
                g.add(put(gCyl(0.3, 0.55, 9, 4, p.dark), Math.cos(a) * 2.4, 14 + i * 1.6, Math.sin(a) * 2.4,
                    Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7));
            }
            return g;
        },
        hand:      (r, p) => {
            const g = knit(put(gBox(6, 7, 2.4, p.accent), 0, 12, 0), put(gCyl(2, 2.6, 10, 6, p.accent), 0, 5, 0));
            for (let i = 0; i < 4; i++) g.add(put(gBox(1.2, 7 - Math.abs(i - 1.5), 1.6, p.accent), -2.1 + i * 1.4, 19, 0));
            g.add(put(gBox(1.4, 5, 1.6, p.accent), -3.6, 14, 0, 0, 0, 0.5));
            return g;
        },
        teeth:     (r, p) => {
            const g = new THREE.Group();
            for (let i = 0; i < 7; i++) g.add(put(gCone(1.1, 4 + r() * 5, 4, 0xefe6d2), -6 + i * 2, 2.6, (r() - 0.5) * 2));
            return g;
        },
        stack:     (r, p) => {
            const g = new THREE.Group();
            let y = 0;
            for (let i = 0; i < 4; i++) {
                const s = 7 - i * 1.3;
                g.add(put(gBox(s, s * 0.7, s, i % 2 ? p.accent : p.accent2), 0, y + s * 0.35, 0, 0, r() * 0.8, 0));
                y += s * 0.7;
            }
            return g;
        },
        clock:     (r, p) => knit(put(gCyl(0.6, 0.6, 22, 6, p.dark), 0, 11, 0),
                                  put(gCyl(5, 5, 1, 14, p.pale), 0, 25, 0, Math.PI / 2, 0, 0),
                                  put(gBox(0.5, 4, 0.3, p.dark), 0, 26.6, 0.7), put(gBox(3, 0.5, 0.3, p.dark), 1.4, 25, 0.7)),
        balloon:   (r, p) => knit(put(gSph(4, p.accent2, { glow: p.glow * 0.5 }), 0, 22, 0),
                                  put(gCone(1.1, 2.2, 5, p.accent2), 0, 17.6, 0, Math.PI, 0, 0),
                                  put(gCyl(0.12, 0.12, 16, 4, p.pale), 0, 8.5, 0)),
        statue:    (r, p) => knit(put(gBox(7, 3, 7, p.dark), 0, 1.5, 0), put(gBox(5, 12, 3.4, p.pale), 0, 9, 0),
                                  put(gSph(2.4, p.pale), 0, 17, 0),
                                  put(gBox(1.6, 9, 1.6, p.pale), -3.3, 10, 0, 0, 0, 0.25),
                                  put(gBox(1.6, 9, 1.6, p.pale), 3.3, 10, 0, 0, 0, -0.25)),
        // A whole city block, ankle high. A region of these is the dream where
        // the sleeper walks over a miniature world.
        tinyblock: (r, p) => {
            const g = new THREE.Group();
            const n = 3 + Math.floor(r() * 4);
            for (let i = 0; i < n; i++) {
                const w = 1.2 + r() * 2.4, h = 1.5 + r() * r() * 11;
                g.add(put(gBox(w, h, w, r() < 0.5 ? p.pale : p.accent),
                    (r() - 0.5) * 7, h / 2, (r() - 0.5) * 7));
            }
            g.add(put(gBox(9, 0.4, 9, p.dark), 0, 0.2, 0));
            return g;
        },
        seaweed:   (r, p) => {
            const g = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const h = 8 + r() * 16;
                g.add(put(gQuad(1.6, h, p.accent, { opacity: 0.85 }), (r() - 0.5) * 4, h / 2, (r() - 0.5) * 4,
                    0, r() * TAU, (r() - 0.5) * 0.3));
            }
            return g;
        },
        // A sprite off the game's own furniture sheets, standing up and facing
        // whoever is looking at it. `extra.sprite` names the art.
        billboard: (r, p, extra) => {
            const sp = extra && extra.sprite;
            if (!sp) return knit(put(gBox(2, 14, 2, p.accent), 0, 7, 0));
            const geo = new THREE.PlaneGeometry(sp.w, sp.h);
            // The shader adds the quad's own xy in view space, so the offset
            // that stands the sprite on the ground has to live in the geometry.
            geo.translate(0, sp.h * 0.5, 0);
            return knit(new THREE.Mesh(geo, billboardMaterial(sp.folder, sp.name)));
        },
        // A word, standing in a field, twelve metres tall.
        bigtext:   (r, p, extra) => {
            const tex = extra && extra.textTex;
            if (!tex) return knit(put(gBox(2, 20, 2, p.accent), 0, 10, 0));
            const face = new THREE.Mesh(new THREE.PlaneGeometry(46, 23),
                dmat(0xffffff, { map: tex, both: true, alpha: true }));
            return knit(put(face, 0, 16, 0), put(gBox(48, 1.4, 1.4, p.dark), 0, 3.4, 0),
                        put(gBox(1.4, 8, 1.4, p.dark), -20, 4, 0), put(gBox(1.4, 8, 1.4, p.dark), 20, 4, 0));
        }
    };
    const PROP_KEYS = Object.keys(PROPS);

    // =========================================================================
    // Architecture. The liminal half of the dream: whole pieces of building
    // stamped on a lattice so they run into one another and carry on past the
    // fog, which is what makes a corridor endless rather than a corridor.
    //
    // A structure is built to span exactly `span` world units, and is placed
    // WITHOUT jitter and WITHOUT rotation, so neighbouring copies meet: the
    // pieces are the tiling.
    // =========================================================================
    const STRUCTURES = {
        // The backrooms: two walls, a ceiling and a strip light, forever. The
        // walls take the dream's writing where it has any.
        corridor: (r, p, span, extra) => {
            const g = new THREE.Group();
            const hw = span * 0.30, H = 26;
            // The two walls take a phrase each, so a corridor is not one slogan
            // repeated back at itself.
            const texes = (extra && extra.wallTexes && extra.wallTexes.length)
                ? extra.wallTexes : (extra && extra.wallTex ? [extra.wallTex] : []);
            let iw = 0;
            for (const sz of [-1, 1]) {
                const wall = gBox(span, H, 1.5, p.pale);
                g.add(put(wall, 0, H / 2, sz * hw));
                const tex = texes.length ? texes[iw++ % texes.length] : null;
                if (tex) {
                    g.add(put(gQuad(span * 0.92, H * 0.55, 0xffffff,
                        { map: tex, alpha: true }), 0, H * 0.55, sz * (hw - 0.9), 0, sz > 0 ? Math.PI : 0, 0));
                }
            }
            g.add(put(gBox(span, 1.2, hw * 2, p.pale), 0, H, 0));
            g.add(put(gQuad(span * 0.5, hw * 0.5, 0xfff6d8, { glow: 1 }), 0, H - 0.8, 0, Math.PI / 2, 0, 0));
            g.add(put(gBox(span, 0.6, hw * 2, p.dark), 0, 0.3, 0));
            for (const sz of [-1, 1]) g.add(put(gBox(span, 0.8, 0.8, p.accent), 0, 8, sz * (hw - 0.9)));
            return g;
        },
        // A room shell with a gap in one wall, so the sleeper can walk in.
        room: (r, p, span) => {
            const g = new THREE.Group();
            const s = span * 0.62, H = 24;
            g.add(put(gBox(s, H, 1.4, p.pale), 0, H / 2, -s / 2));
            g.add(put(gBox(1.4, H, s, p.pale), -s / 2, H / 2, 0));
            g.add(put(gBox(1.4, H, s, p.pale), s / 2, H / 2, 0));
            g.add(put(gBox(s * 0.32, H, 1.4, p.pale), -s * 0.34, H / 2, s / 2));
            g.add(put(gBox(s * 0.32, H, 1.4, p.pale), s * 0.34, H / 2, s / 2));
            g.add(put(gBox(s, 1.2, s, p.pale), 0, H, 0));
            g.add(put(gQuad(s * 0.3, s * 0.3, 0xffeec2, { glow: 1 }), 0, H - 0.9, 0, Math.PI / 2, 0, 0));
            return g;
        },
        // Two rows of columns holding a lintel up over nothing.
        colonnade: (r, p, span) => {
            const g = new THREE.Group();
            const n = 4, gap = span / n, H = 30;
            for (let i = 0; i < n; i++) {
                const x = -span / 2 + gap * (i + 0.5);
                for (const sz of [-1, 1]) {
                    g.add(put(gCyl(2.2, 2.6, H, 10, p.pale), x, H / 2, sz * span * 0.24));
                    g.add(put(gBox(6.4, 1.6, 6.4, p.pale), x, H - 0.8, sz * span * 0.24));
                }
            }
            for (const sz of [-1, 1]) g.add(put(gBox(span, 3, 8, p.accent), 0, H + 1.5, sz * span * 0.24));
            return g;
        },
        // A flight of steps that arrives nowhere.
        stairflight: (r, p, span) => {
            const g = new THREE.Group();
            const steps = 14, rise = 2.2, run = span / steps;
            for (let i = 0; i < steps; i++) {
                g.add(put(gBox(span * 0.4, rise, run, i % 2 ? p.pale : p.accent),
                    0, rise * (i + 0.5), -span / 2 + run * (i + 0.5)));
            }
            g.add(put(gBox(1, rise * steps, 1, p.dark), span * 0.2, rise * steps * 0.5, span * 0.36));
            return g;
        },
        // Four flights around a square well, each one climbing to the next
        // one's foot: the staircase that goes up forever and arrives where it
        // started. Escher's, as far as one lattice cell can carry it.
        escher: (r, p, span) => {
            const g = new THREE.Group();
            const s = span * 0.44, steps = 10, rise = 1.9;
            const run = (s * 2) / steps;
            for (let side = 0; side < 4; side++) {
                const base = side * steps * rise;
                for (let i = 0; i < steps; i++) {
                    const t = -s + run * (i + 0.5);
                    const y = base + rise * (i + 0.5);
                    const step = gBox(run * 1.02, rise, 7, i % 2 ? p.pale : p.accent);
                    if (side === 0) put(step, t, y, -s);
                    else if (side === 1) put(step, s, y, t, 0, Math.PI / 2, 0);
                    else if (side === 2) put(step, -t, y, s);
                    else put(step, -s, y, -t, 0, Math.PI / 2, 0);
                    g.add(step);
                }
            }
            // The pillar the whole impossible flight is wound around.
            g.add(put(gBox(s * 0.7, steps * rise * 4, s * 0.7, p.dark), 0, steps * rise * 2, 0));
            return g;
        },
        // Slabs hanging in the air at five heights, with nothing holding them.
        platforms: (r, p, span) => {
            const g = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const w = span * (0.18 + r() * 0.22);
                g.add(put(gBox(w, 1.6, w, i % 2 ? p.accent : p.pale),
                    (r() - 0.5) * span * 0.7, 14 + i * 13 + r() * 8, (r() - 0.5) * span * 0.7));
            }
            return g;
        },
        // Fence posts and wire, running to the horizon.
        fence: (r, p, span) => {
            const g = new THREE.Group();
            const n = 5, gap = span / n;
            for (let i = 0; i < n; i++) g.add(put(gCyl(0.4, 0.5, 14, 5, p.dark), -span / 2 + gap * i, 7, 0));
            for (const y of [4, 8, 12]) g.add(put(gBox(span, 0.25, 0.25, p.dark), 0, y, 0));
            g.add(put(gQuad(span, 12, p.pale, { opacity: 0.16 }), 0, 7, 0));
            return g;
        },
        // Overhead pipe runs on brackets: the ceiling of a plant room.
        pipes: (r, p, span) => {
            const g = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const z = (i - 1) * 4.5, rad = 1 + r() * 0.9;
                g.add(put(gCyl(rad, rad, span, 8, i === 1 ? p.accent : p.dark), 0, 22 + i * 1.5, z, 0, 0, Math.PI / 2));
            }
            for (const sx of [-1, 1]) g.add(put(gBox(1, 26, 12, p.dark), sx * span * 0.42, 13, 0));
            return g;
        },
        // A wall of switched-on televisions showing the same nothing.
        tvwall: (r, p, span) => {
            const g = new THREE.Group();
            const cols = 4, rows = 3, w = span / cols;
            for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
                const x = -span / 2 + w * (i + 0.5), y = 5 + j * (w * 0.9);
                g.add(put(gBox(w * 0.88, w * 0.8, w * 0.7, p.dark), x, y, 0));
                g.add(put(gQuad(w * 0.6, w * 0.5, p.accent2, { glow: 0.95 }), x, y, w * 0.36));
            }
            return g;
        },
        // An empty tiled swimming pool, the most liminal room there is.
        pool: (r, p, span) => {
            const g = new THREE.Group();
            const s = span * 0.72, D = 14;
            g.add(put(gBox(s, 1, s, p.pale), 0, -D, 0));
            for (const sx of [-1, 1]) g.add(put(gBox(1.2, D, s, p.pale), sx * s / 2, -D / 2, 0));
            for (const sz of [-1, 1]) g.add(put(gBox(s, D, 1.2, p.pale), 0, -D / 2, sz * s / 2));
            for (const sz of [-1, 1]) g.add(put(gBox(s + 6, 0.8, 3, p.accent), 0, 0.4, sz * (s / 2 + 1.5)));
            g.add(put(gBox(0.4, 8, 0.4, 0xcfd6da), -s * 0.3, -4, s / 2 - 1));
            g.add(put(gBox(0.4, 8, 0.4, 0xcfd6da), -s * 0.22, -4, s / 2 - 1));
            return g;
        },
        // Freestanding doors in a row, none of them attached to anything.
        doors: (r, p, span) => {
            const g = new THREE.Group();
            const n = 3, gap = span / n;
            for (let i = 0; i < n; i++) {
                const x = -span / 2 + gap * (i + 0.5), ry = (r() - 0.5) * 0.7;
                g.add(put(gBox(1.4, 18, 1.4, p.pale), x - 5, 9, 0, 0, ry, 0));
                g.add(put(gBox(1.4, 18, 1.4, p.pale), x + 5, 9, 0, 0, ry, 0));
                g.add(put(gBox(11.4, 1.6, 1.4, p.pale), x, 18.8, 0, 0, ry, 0));
                g.add(put(gBox(8, 16, 0.7, p.accent), x + (r() < 0.5 ? 0 : 3), 8, 0, 0, ry + (r() < 0.5 ? 0 : 0.6), 0));
            }
            return g;
        },
        // Open-plan office: partition walls in a grid, a desk in each pen.
        cubicles: (r, p, span) => {
            const g = new THREE.Group();
            const n = 3, cell = span / n, H = 9;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = -span / 2 + cell * (i + 0.5), z = -span / 2 + cell * (j + 0.5);
                g.add(put(gBox(cell * 0.9, H, 0.8, p.pale), x, H / 2, z - cell * 0.45));
                g.add(put(gBox(0.8, H, cell * 0.9, p.pale), x - cell * 0.45, H / 2, z));
                g.add(put(gBox(cell * 0.45, 0.8, cell * 0.35, p.dark), x, 7, z));
                g.add(put(gBox(cell * 0.16, cell * 0.13, 0.6, 0x14141a), x, 8.3, z - cell * 0.1));
            }
            return g;
        },
        // Rows of chairs facing a counter nobody is behind.
        waitingroom: (r, p, span) => {
            const g = new THREE.Group();
            for (let row = 0; row < 3; row++) {
                const z = -span * 0.25 + row * span * 0.25;
                for (let i = 0; i < 6; i++) {
                    const x = -span * 0.3 + i * span * 0.12;
                    g.add(put(gBox(5, 0.7, 5, p.accent), x, 7, z));
                    g.add(put(gBox(5, 7, 0.7, p.accent), x, 10.5, z - 2.2));
                    g.add(put(gBox(0.7, 7, 0.7, p.dark), x - 2, 3.5, z));
                }
            }
            g.add(put(gBox(span * 0.5, 11, 4, p.pale), 0, 5.5, span * 0.34));
            g.add(put(gBox(span * 0.52, 0.8, 6, p.dark), 0, 11.2, span * 0.34));
            return g;
        },
        // Deck after deck of empty parking, bays painted on every one.
        carpark: (r, p, span) => {
            const g = new THREE.Group();
            const decks = 3, H = 20;
            for (let d = 1; d <= decks; d++) {
                g.add(put(gBox(span, 1.6, span * 0.8, p.pale), 0, d * H, 0));
                for (let i = 0; i < 7; i++) {
                    g.add(put(gQuad(0.5, span * 0.32, 0xf0e6c0), -span * 0.42 + i * span * 0.14,
                        d * H + 0.9, -span * 0.2, -Math.PI / 2, 0, 0));
                }
                for (const sx of [-1, 1]) g.add(put(gBox(span, 3, 0.8, p.dark), 0, d * H + 3, sx * span * 0.4));
            }
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                g.add(put(gBox(4, decks * H, 4, p.pale), sx * span * 0.4, decks * H / 2, sz * span * 0.34));
            }
            g.add(put(gCyl(0.6, 0.6, decks * H, 6, p.dark), 0, decks * H / 2, 0));
            return g;
        },
        // A nave: two arcades, a clerestory and a window at the end of it.
        nave: (r, p, span) => {
            const g = new THREE.Group();
            const n = 5, gap = span / n, H = 60, w = span * 0.22;
            for (let i = 0; i < n; i++) {
                const x = -span / 2 + gap * (i + 0.5);
                for (const sz of [-1, 1]) {
                    g.add(put(gCyl(2.6, 3.2, H, 8, p.pale), x, H / 2, sz * w));
                    g.add(put(gTor(6, 1.4, p.pale), x, H, sz * w, 0, Math.PI / 2, 0));
                }
            }
            for (const sz of [-1, 1]) g.add(put(gBox(span, 4, 3, p.pale), 0, H + 6, sz * w));
            g.add(put(gBox(span, 2, w * 2, p.dark), 0, H + 12, 0));
            g.add(put(gQuad(w * 1.4, 26, p.accent2, { glow: 0.55 }), -span / 2 + 1, 30, 0, 0, Math.PI / 2, 0));
            return g;
        },
        // A belt that carries nothing, over rollers that still turn.
        conveyor: (r, p, span) => {
            const g = new THREE.Group();
            g.add(put(gBox(span, 1, 8, p.dark), 0, 11, 0));
            for (let i = 0; i < 9; i++) {
                g.add(put(gCyl(1.2, 1.2, 8.4, 7, p.accent), -span / 2 + span * (i + 0.5) / 9, 11.8, 0, Math.PI / 2, 0, 0));
            }
            for (const sx of [-1, 1]) {
                g.add(put(gBox(1.2, 11, 1.2, p.dark), sx * span * 0.4, 5.5, 4));
                g.add(put(gBox(1.2, 11, 1.2, p.dark), sx * span * 0.4, 5.5, -4));
            }
            for (let i = 0; i < 3; i++) {
                g.add(put(gBox(5, 5, 5, p.accent2, { glow: p.glow * 0.4 }), -span * 0.3 + i * span * 0.3, 15, 0));
            }
            return g;
        },
        // Aisles of racks with their lights on, humming to nobody.
        serverfarm: (r, p, span) => {
            const g = new THREE.Group();
            const rows = 4, H = 16;
            for (let i = 0; i < rows; i++) {
                const z = -span / 2 + span * (i + 0.5) / rows;
                for (let j = 0; j < 5; j++) {
                    const x = -span * 0.34 + j * span * 0.17;
                    g.add(put(gBox(span * 0.14, H, 6, p.dark), x, H / 2, z));
                    for (let k = 0; k < 5; k++) {
                        g.add(put(gQuad(span * 0.1, 0.5, p.accent2, { glow: 1 }), x, 3 + k * 2.6, z + 3.1));
                    }
                }
            }
            return g;
        },
        // A big top with the flaps open and nobody inside.
        bigtop: (r, p, span) => {
            const g = new THREE.Group();
            const R = span * 0.42;
            const roof = gCone(R, span * 0.34, 10, p.accent);
            g.add(put(roof, 0, 26 + span * 0.17, 0));
            g.add(put(gCyl(R, R, 26, 10, p.pale, { both: true }), 0, 13, 0));
            g.add(put(gCyl(0.9, 0.9, 46, 6, p.dark), 0, 23, 0));
            g.add(put(gQuad(4, 5, p.accent2), 0, 46, 0));
            for (let i = 0; i < 8; i++) {
                const a = i * TAU / 8;
                g.add(put(gCyl(0.4, 0.4, 8, 5, p.dark), Math.cos(a) * R, 4, Math.sin(a) * R));
            }
            return g;
        },
        // Hoardings the size of houses, all of them saying something.
        billboards: (r, p, span, extra) => {
            const g = new THREE.Group();
            const texes = (extra && extra.wallTexes && extra.wallTexes.length)
                ? extra.wallTexes : (extra && extra.wallTex ? [extra.wallTex] : []);
            for (let i = 0; i < 3; i++) {
                const x = -span / 2 + span * (i + 0.5) / 3, ry = (r() - 0.5) * 1.2;
                const tex = texes.length ? texes[i % texes.length] : null;
                const face = tex
                    ? new THREE.Mesh(new THREE.PlaneGeometry(span * 0.26, 14),
                        dmat(0xffffff, { map: tex, both: true, alpha: true }))
                    : gQuad(span * 0.26, 14, p.accent2, { glow: p.glow });
                g.add(put(face, x, 26, 0, 0, ry, 0));
                g.add(put(gBox(span * 0.27, 1, 1, p.dark), x, 33, 0, 0, ry, 0));
                for (const sx of [-1, 1]) {
                    g.add(put(gCyl(0.7, 0.9, 19, 5, p.dark), x + sx * span * 0.1, 9.5, 0, 0, ry, 0));
                }
            }
            return g;
        },
        // Arches carrying a channel of water that has long since stopped.
        aqueduct: (r, p, span) => {
            const g = new THREE.Group();
            const n = 3, gap = span / n, H = 34;
            for (let i = 0; i < n; i++) {
                const x = -span / 2 + gap * (i + 0.5);
                g.add(put(gBox(4, H, 8, p.pale), x - gap * 0.5, H / 2, 0));
                g.add(put(gTor(gap * 0.42, 2.2, p.pale), x, H, 0, 0, 0, 0));
            }
            g.add(put(gBox(span, 5, 12, p.pale), 0, H + 4, 0));
            g.add(put(gBox(span, 2, 7, p.accent, { opacity: 0.7 }), 0, H + 6.4, 0));
            return g;
        },
        // Standing stones. Nobody put them there.
        henge: (r, p, span) => {
            const g = new THREE.Group();
            const n = 7, R = span * 0.34;
            for (let i = 0; i < n; i++) {
                const a = i * TAU / n;
                const h = 20 + r() * 16;
                g.add(put(gBox(6, h, 3.4, p.pale), Math.cos(a) * R, h / 2, Math.sin(a) * R, 0, -a, (r() - 0.5) * 0.1));
                if (i % 2 === 0) {
                    const a2 = (i + 1) * TAU / n;
                    g.add(put(gBox(R * 0.9, 3, 3.4, p.pale),
                        Math.cos((a + a2) / 2) * R, h + 1.5, Math.sin((a + a2) / 2) * R, 0, -(a + a2) / 2, 0));
                }
            }
            return g;
        },
        // Scaffold around a building that was never there.
        scaffold: (r, p, span) => {
            const g = new THREE.Group();
            const H = 46, s = span * 0.4;
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                g.add(put(gCyl(0.5, 0.5, H, 5, p.accent), sx * s, H / 2, sz * s));
            }
            for (let i = 1; i <= 5; i++) {
                const y = i * (H / 6);
                for (const sz of [-1, 1]) g.add(put(gBox(s * 2, 0.4, 0.4, p.accent), 0, y, sz * s));
                for (const sx of [-1, 1]) g.add(put(gBox(0.4, 0.4, s * 2, p.accent), sx * s, y, 0));
                if (i % 2) g.add(put(gBox(s * 2, 0.6, s * 0.5, p.pale), 0, y + 0.5, -s * 0.5));
            }
            g.add(put(gQuad(s * 2, H * 0.6, p.pale, { opacity: 0.3 }), 0, H * 0.4, s, 0, 0, 0));
            return g;
        },
        // A ribcage the size of a hall, with the sleeper inside it.
        ribcage: (r, p, span) => {
            const g = new THREE.Group();
            const n = 8, L = span * 0.8;
            for (let i = 0; i < n; i++) {
                const t = -L / 2 + L * (i + 0.5) / n;
                const R = 16 + Math.sin((i / n) * Math.PI) * 12;
                const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 1.6, 5, 14, Math.PI), dmat(p.pale));
                g.add(put(rib, 0, 1, t, 0, 0, 0));
            }
            g.add(put(gCyl(2.4, 2.4, L, 7, p.pale), 0, 30, 0, Math.PI / 2, 0, 0));
            return g;
        },
        // A hedge maze with the hedges the height of a person and no exit.
        hedgemaze: (r, p, span) => {
            const g = new THREE.Group();
            const n = 4, cell = span / n, H = 13;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = -span / 2 + cell * (i + 0.5), z = -span / 2 + cell * (j + 0.5);
                if (r() < 0.6) g.add(put(gBox(cell * 0.95, H, 3.2, p.accent), x, H / 2, z - cell * 0.475));
                if (r() < 0.6) g.add(put(gBox(3.2, H, cell * 0.95, p.accent), x - cell * 0.475, H / 2, z));
            }
            return g;
        },
        // The megastructure: a hollow city with no outside. Columns of concrete
        // hundreds of units tall, gantries and pipe runs slung between them at
        // every height, and nothing at ground level but more of it going up.
        // Blame!, as far as one lattice cell can carry it.
        megastructure: (r, p, span) => {
            const g = new THREE.Group();
            const H = 340;
            // The great pillars.
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const w = span * (0.12 + r() * 0.10);
                g.add(put(gBox(w, H, w, p.pale), sx * span * 0.33, H / 2, sz * span * 0.33));
                // Their service ribs, so a face is never a blank slab.
                for (let i = 0; i < 9; i++) {
                    g.add(put(gBox(w * 1.15, 1.6, w * 1.15, p.dark), sx * span * 0.33, 18 + i * 36, sz * span * 0.33));
                }
            }
            // Decks and gantries strung between them, at heights that have
            // nothing to do with one another.
            for (let i = 0; i < 11; i++) {
                const y = 16 + r() * (H - 40);
                const along = r() < 0.5;
                const w = span * (0.5 + r() * 0.55), d = 6 + r() * 12;
                g.add(put(gBox(along ? w : d, 2.4, along ? d : w, i % 3 ? p.pale : p.accent),
                    (r() - 0.5) * span * 0.5, y, (r() - 0.5) * span * 0.5));
                // A parapet, which is what makes a slab read as a walkway.
                g.add(put(gBox(along ? w : 0.8, 3, along ? 0.8 : w, p.dark),
                    (r() - 0.5) * span * 0.5, y + 2.4, (r() - 0.5) * span * 0.5));
            }
            // Conduit bundles running up the shaft.
            for (let i = 0; i < 6; i++) {
                const rad = 1.2 + r() * 2.4;
                g.add(put(gCyl(rad, rad, H * (0.4 + r() * 0.6), 7, p.dark),
                    (r() - 0.5) * span * 0.8, H * 0.4, (r() - 0.5) * span * 0.8));
            }
            // The one lit thing in it.
            g.add(put(gQuad(span * 0.3, 2, 0xffe9b0, { glow: 0.9 }), 0, 40 + r() * 200, span * 0.2, 0, 0, 0));
            return g;
        }
    };
    const STRUCT_KEYS = Object.keys(STRUCTURES);

    // =========================================================================
    // The levels overhead.
    //
    // A dream has a ground, and over that ground it has LEVELS, and there is no
    // last one. Decks of concrete a couple of hundred units apart, pierced by
    // the same shafts all the way up, going on for as long as anybody climbs:
    // Blame!, where the floor of the world is a detail of it and the way out is
    // always further up. Nothing is stored for the levels nobody is near, and a
    // level is a pure function of its own number, so level 4 and level 400,000
    // cost exactly the same to arrive at.
    //
    // A level is a flat list of BOXES AND CYLINDERS in world units - no
    // prototypes and no groups - which is what lets the one list be both the
    // thing drawn (grouped by material, one InstancedMesh apiece) and the thing
    // stood on (bucketed on a coarse grid and wrapped by minimum image, like
    // everything else in a world with no edges).
    // =========================================================================
    const TIER_BASE = 300;      // the first deck, hung over the rolled ground
    const TIER_H = 260;         // one level to the next
    const TIER_BELOW = 1;       // levels kept standing under the sleeper
    const TIER_ABOVE = 2;       // and over them
    const TIER_THEME = 4;       // levels a stratum's colour and name last
    const TIER_BUCKET = 128;    // collision bucketing, world units

    /** A lattice that divides the world period exactly, so a level wraps. */
    function tierGrid(period, want) {
        const n = Math.max(2, Math.round(period / want));
        return { n: n, step: period / n };
    }

    /**
     * The shafts. Their gate is salted WITHOUT the level number, so the same
     * columns stand at the same coordinates on every level and read as single
     * pillars going up out of sight rather than as one storey's furniture.
     */
    function tierColumns(c) {
        const g = tierGrid(c.W, 340), h = tierGrid(c.H, 340);
        for (let ix = 0; ix < g.n; ix++) {
            for (let iz = 0; iz < h.n; iz++) {
                if (hash01(ix, iz, 5) > 0.42) continue;
                const x = (ix + 0.5) * g.step, z = (iz + 0.5) * h.step;
                const w = 22 + hash01(ix, iz, 6) * 34;
                // A shaft is drawn a storey at a time and overlaps the one
                // under it, so a level dropped out of memory leaves no gap in
                // the pillar the sleeper is looking at.
                c.box(x, c.base - TIER_H * 0.5, z, w, TIER_H + 10, w, c.pal.pale);
                for (let i = 0; i < 4; i++) {
                    c.box(x, c.base - TIER_H + 26 + i * (TIER_H / 4), z,
                        w * 1.18, 3.2, w * 1.18, c.pal.dark, { ghost: 1 });
                }
                // Conduit bundles strapped to one face of it.
                if (hash01(ix, iz, 7) < 0.5) {
                    c.cyl(x + w * 0.72, c.base - TIER_H * 0.5, z, 3 + hash01(ix, iz, 8) * 4,
                        TIER_H, 'y', c.pal.dark, { ghost: 1 });
                }
            }
        }
    }

    /**
     * The one way up on foot: a stair wound round a core, from this level's
     * floor to the next one's, with a light on top of it so it can be found
     * from across a deck. The lowest one reaches all the way down to the
     * ground, so a sleeper who never learns to fly can still start climbing.
     */
    function tierRiser(c) {
        const x = hash01(c.k, 3, 9) * c.W, z = hash01(c.k, 4, 10) * c.H;
        const top = c.base + TIER_H;
        const bottom = c.k === 0 ? c.groundY(x, z) : c.base;
        const rise = 4.4;
        const steps = Math.max(8, Math.round((top - bottom) / rise));
        for (let i = 0; i < steps; i++) {
            const a = i * 0.42;
            // Square treads, never turned: a footprint that does not care which
            // way it faces is the one thing this collision model reads exactly.
            c.slab(x + Math.cos(a) * 24, bottom + rise * (i + 1), z + Math.sin(a) * 24,
                18, 2.4, 18, i % 2 ? c.pal.accent : c.pal.pale);
        }
        c.cyl(x, (top + bottom) * 0.5, z, 26, top - bottom, 'y', c.pal.dark);
        c.box(x, top + 30, z, 3, 60, 3, 0xffd9a0, { glow: 1, ghost: 1 });
    }

    /**
     * What a level is made of. Every one of them is walkable somewhere and open
     * to the drop somewhere else, because a floor with no holes in it is a
     * ceiling and the sleeper would never see the level under this one.
     */
    const TIER_FORMS = {
        // Floor plates running past the fog in every direction with holes torn
        // through them. The ordinary storey of a hollow city.
        deck: (c) => {
            const g = tierGrid(c.W, 190), h = tierGrid(c.H, 190);
            for (let ix = 0; ix < g.n; ix++) {
                for (let iz = 0; iz < h.n; iz++) {
                    if (hash01(ix, iz, c.k * 7 + 11) > 0.62) continue;
                    const x = (ix + 0.5) * g.step, z = (iz + 0.5) * h.step;
                    c.slab(x, c.base, z, g.step * 0.99, 7, h.step * 0.99, c.pal.pale);
                    if (hash01(ix, iz, 21) < 0.34) {
                        c.slab(x, c.base + 5, z - h.step * 0.47, g.step, 5, 1.8, c.pal.dark);
                    }
                    if (hash01(ix, iz, 33) < 0.14) {
                        c.slab(x, c.base - 7.2, z, g.step * 0.5, 0.8, 3.4, 0xffe9b0,
                            { glow: 0.95, ghost: 1 });
                    }
                    if (hash01(ix, iz, 44) < 0.2) {
                        c.cyl(x + g.step * 0.3, c.base - 46, z + h.step * 0.28,
                            2.4 + hash01(ix, iz, 45) * 3.4, 88, 'y', c.pal.dark, { ghost: 1 });
                    }
                }
            }
        },
        // The same plates with a storey of sealed cells built on them: rooms
        // nobody has opened, in blocks with alleys between them.
        hive: (c) => {
            const g = tierGrid(c.W, 190), h = tierGrid(c.H, 190);
            for (let ix = 0; ix < g.n; ix++) {
                for (let iz = 0; iz < h.n; iz++) {
                    if (hash01(ix, iz, c.k * 7 + 13) > 0.74) continue;
                    const x = (ix + 0.5) * g.step, z = (iz + 0.5) * h.step;
                    c.slab(x, c.base, z, g.step * 0.99, 7, h.step * 0.99, c.pal.dark);
                    const cells = 1 + Math.floor(hash01(ix, iz, 14) * 3);
                    for (let j = 0; j < cells; j++) {
                        const hgt = 22 + hash01(ix, iz, 15 + j) * 46;
                        const cx = x + (hash01(ix, iz, 20 + j) - 0.5) * g.step * 0.55;
                        const cz = z + (hash01(ix, iz, 26 + j) - 0.5) * h.step * 0.55;
                        const w = g.step * (0.22 + hash01(ix, iz, 31 + j) * 0.2);
                        c.slab(cx, c.base + hgt, cz, w, hgt, w, c.pal.pale);
                        // The lit window, which is the only sign anything lives
                        // on a level like this.
                        if (hash01(ix, iz, 41 + j) < 0.3) {
                            c.box(cx, c.base + hgt * 0.6, cz + w * 0.52, w * 0.4, 5, 0.6,
                                0xffe4b2, { glow: 0.9, ghost: 1 });
                        }
                    }
                }
            }
        },
        // No floor at all: beams a kilometre long over nothing, with handrails,
        // and the cables of whatever was hung off the level above.
        girders: (c) => {
            const n = 10 + Math.floor(c.rnd() * 7);
            for (let i = 0; i < n; i++) {
                const alongX = c.rnd() < 0.5;
                const y = c.base + (c.rnd() - 0.5) * TIER_H * 0.6;
                // Never narrower than a person can walk: the sleeper is 8.4
                // units across (DreamController.radius) and a beam over
                // nothing is only frightening if it can be crossed.
                const w = 14 + c.rnd() * 16;
                const off = c.rnd() * (alongX ? c.H : c.W);
                const span = alongX ? c.W : c.H;
                const mid = span * 0.5;
                const X = alongX ? mid : off, Z = alongX ? off : mid;
                c.slab(X, y, Z, alongX ? span : w, 3.6, alongX ? w : span, c.pal.pale);
                for (const s of [-1, 1]) {
                    c.slab(X + (alongX ? 0 : s * w * 0.46), y + 6, Z + (alongX ? s * w * 0.46 : 0),
                        alongX ? span : 1.4, 6, alongX ? 1.4 : span, c.pal.dark);
                }
                for (let j = 0; j < 8; j++) {
                    const t = ((j + 0.5) / 8) * span;
                    c.box(alongX ? t : X, y - 11, alongX ? Z : t, w * 0.5, 18, w * 0.5, c.pal.dark);
                }
            }
            for (let i = 0; i < 34; i++) {
                const len = 40 + c.rnd() * (TIER_H * 0.8);
                c.cyl(c.rnd() * c.W, c.base + TIER_H * 0.5 - len * 0.5, c.rnd() * c.H,
                    0.8 + c.rnd() * 1.8, len, 'y', c.pal.dark, { ghost: 1 });
            }
        },
        // The level came apart a long time ago and its floor is still up here
        // in pieces, each one with its own stumps of wall standing on it.
        islands: (c) => {
            const n = 16 + Math.floor(c.rnd() * 12);
            for (let i = 0; i < n; i++) {
                const x = c.rnd() * c.W, z = c.rnd() * c.H;
                const r = 34 + c.rnd() * c.rnd() * 150;
                const y = c.base + (c.rnd() - 0.5) * TIER_H * 0.62;
                c.slab(x, y, z, r * 2, 12, r * 1.7, c.pal.pale);
                c.slab(x, y - 12, z, r * 1.4, r * 0.7, r * 1.2, c.pal.dark, { ghost: 1 });
                c.slab(x, y - 12 - r * 0.5, z, r * 0.6, r * 0.9, r * 0.5, c.pal.dark, { ghost: 1 });
                const props = 1 + Math.floor(c.rnd() * 4);
                for (let j = 0; j < props; j++) {
                    const hgt = 14 + c.rnd() * 56;
                    c.slab(x + (c.rnd() - 0.5) * r * 1.5, y + hgt, z + (c.rnd() - 0.5) * r * 1.2,
                        8 + c.rnd() * 22, hgt, 8 + c.rnd() * 22,
                        c.rnd() < 0.3 ? c.pal.accent : c.pal.pale);
                }
            }
        },
        // A plant level: mains running the whole way across, wide enough to
        // walk along the top of, on cradles.
        ducts: (c) => {
            const n = 7 + Math.floor(c.rnd() * 5);
            for (let i = 0; i < n; i++) {
                const alongX = c.rnd() < 0.5;
                const y = c.base + (c.rnd() - 0.5) * TIER_H * 0.55;
                const d = 14 + c.rnd() * 26;
                const off = c.rnd() * (alongX ? c.H : c.W);
                const span = alongX ? c.W : c.H;
                const mid = span * 0.5;
                const X = alongX ? mid : off, Z = alongX ? off : mid;
                c.cyl(X, y, Z, d, span, alongX ? 'x' : 'z',
                    i % 3 ? c.pal.pale : c.pal.accent);
                for (let j = 0; j < 9; j++) {
                    const t = ((j + 0.5) / 9) * span;
                    c.box(alongX ? t : X, y - d * 0.5 - 13, alongX ? Z : t,
                        d * 0.5, 26, d * 0.5, c.pal.dark);
                    // Flanges, so a main is not a smooth tube for a kilometre.
                    c.cyl(alongX ? t : X, y, alongX ? Z : t, d * 1.2, 4,
                        alongX ? 'x' : 'z', c.pal.dark, { ghost: 1 });
                }
            }
            const g = tierGrid(c.W, 190), h = tierGrid(c.H, 190);
            for (let ix = 0; ix < g.n; ix++) {
                for (let iz = 0; iz < h.n; iz++) {
                    if (hash01(ix, iz, c.k * 7 + 17) > 0.2) continue;
                    c.slab((ix + 0.5) * g.step, c.base, (iz + 0.5) * h.step,
                        g.step * 0.99, 7, h.step * 0.99, c.pal.pale);
                }
            }
        }
    };
    const TIER_FORM_KEYS = Object.keys(TIER_FORMS);

    // =========================================================================
    // Billboards.
    //
    // Not everything in a dream is built out of boxes. The game's own furniture
    // art (img/furniture, the tiles FurnitureSystem sells) is scattered as
    // camera-facing sprites, the same trick the camper's driving scene uses for
    // its trees: one quad per copy, turned to face the camera in the vertex
    // shader so a stand of them costs one draw call however many there are.
    //
    // Which is also why a dream can hold a plush panda the size of a house
    // standing in a field of tombstones: it is all just art off the disk.
    // =========================================================================
    const BILLBOARDS = {
        Trees:        ['round_canopy_tree.png', 'orange_laden_fruit_tree.png', 'slim_green_birch.png', 'large_palm_tree.png'],
        Plants:       ['tall_flowering_hedge.png', 'desert_palm_tree_01.png', 'blue_centered_flower.png', 'orange_marigold_bush.png'],
        Rocks:        ['snow_dusted_boulder.png', 'red_rock_pair.png', 'twin_round_boulders.png', 'snowy_rock_pair.png'],
        Statues:      ['ornate_nutcracker_statue.png', 'robed_statue_with_pendulum.png', 'maroon_demon_statue.png', 'golden_turtle_figurine.png'],
        Mannequins:   ['tall_bust_mannequin_stand.png', 'white_head_mannequin_figure.png', 'orange_head_mannequin_figure.png', 'double_mannequin_bust_stand.png'],
        Signs:        ['museum_placard_sign.png', 'frozen_branch_arrow_sign.png', 'blue_directional_arrow_sign.png', 'hazard_barrier_stack.png'],
        TrafficCones: ['toppled_red_cone.png', 'red_striped_cone.png', 'fallen_orange_cone.png', 'red_white_traffic_cone.png'],
        Graves:       ['gray_rock_tombstone.png', 'grey_stone_cross_monument_01.png', 'blue_arched_tombstone.png', 'teal_stone_cross_monument.png'],
        Mushrooms:    ['grass_tufted_mushroom_01.png', 'grass_tufted_mushroom_02.png', 'standing_ember_toadstool.png', 'red_spotted_toadstool.png'],
        Tentacles:    ['twin_flesh_mounds.png', 'horned_flesh_mound.png', 'horned_ash_mound.png', 'clustered_tentacle_fan_02.png'],
        Clocks:       ['hanging_wall_clock.png', 'purple_wall_clock.png', 'green_round_wall_clock.png', 'ornate_wall_clock.png'],
        Lights:       ['golden_domed_lantern.png', 'teal_lantern_post.png', 'gray_box_lantern.png', 'silver_banded_lantern.png'],
        Electronics:  ['blue_electric_guitar.png', 'robot_face_console_panel.png', 'static_computer_monitor.png', 'dark_tv_screen.png'],
        Peluches:     ['stacked_cushion_pile.png', 'panda_plush.png', 'pink_bear_plush.png', 'elephant_plush_toy.png'],
        Vases:        ['dark_ritual_urn.png', 'striped_orange_urn.png', 'pink_hourglass_vase.png', 'red_clay_pot.png'],
        Fossils:      ['twin_fossil_nodule_case_01.png', 'fossil_creature_display.png', 'fossil_case_corner_fragment_03.png', 'crouching_skeleton_diorama.png']
    };
    const BILLBOARD_FOLDERS = Object.keys(BILLBOARDS);

    // Which art a kind of place reaches for first. Anything not named here
    // takes the whole catalogue, which is how a dream ends up with plush toys
    // in a car park.
    // i18n-ignore-start: folder names under img/furniture, not display text; the
    // billboard loader reads the art off these paths, so translating one blanks
    // that region's props.
    const BILLBOARD_TASTE = {
        garden: ['Trees', 'Plants', 'Mushrooms'],
        tundra: ['Rocks', 'Graves', 'Trees'],
        desert: ['Rocks', 'Signs', 'Statues'],
        ruins:  ['Statues', 'Graves', 'Rocks', 'Fossils'],
        fleshpit: ['Tentacles', 'Mushrooms'],
        backrooms: ['Mannequins', 'Signs', 'Clocks'],
        office: ['Electronics', 'Mannequins', 'Clocks'],
        hospital: ['Mannequins', 'Signs'],
        carpark: ['TrafficCones', 'Signs', 'Lights'],
        carnival: ['Peluches', 'Signs', 'Lights'],
        datacentre: ['Electronics', 'Lights'],
        cathedral: ['Statues', 'Vases', 'Graves'],
        sewer: ['Mushrooms', 'Rocks', 'Tentacles'],
        drowned: ['Plants', 'Rocks', 'Vases'],
        miniature: ['Trees', 'Signs'],
        factory: ['Electronics', 'TrafficCones', 'Signs'],
        blank: ['Mannequins', 'Signs']
    };
    // i18n-ignore-end

    const _bbTex = new Map();

    // The furniture art now lives at img/furniture/<Category>/<Subcategory>/, so
    // the folder a sprite pool names ("Trees") is only half the path, and stage 6b
    // moved some pieces to another category outright (speckled_stone_arch is filed
    // under Buildings/Arches now). window.Items.FurnitureImageFolders maps a sprite
    // id to its real relative folder, which survives both changes; the pool's own
    // folder stays the fallback for art the index has not been rebuilt for.
    function furnitureSpritePath(folder, name) {
        const id = String(name).replace(/\.png$/i, ''); // i18n-ignore: asset path
        const index = (window.Items && window.Items.FurnitureImageFolders) || null;
        const real = (index && index[id]) || folder;
        return 'img/furniture/' + real + '/' + id + '.png'; // i18n-ignore: asset path
    }

    function billboardTexture(folder, name) {
        const key = folder + '/' + name;
        let t = _bbTex.get(key);
        if (t) return t;
        if (!THREE.TextureLoader) return null;
        t = new THREE.TextureLoader().load(furnitureSpritePath(folder, name));
        if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        _bbTex.set(key, t);
        return t;
    }

    /**
     * A camera-facing material. The stock lit shader is patched so the copy's
     * own position (out of the instance matrix) is placed in view space and the
     * quad's corners are added there, which turns every copy to face the camera
     * for free; its normal is forced at the camera so it still takes the light.
     *
     * Marked as already PSX-patched on purpose: PSXShader would replace the same
     * `project_vertex` include and overwrite the program cache key this material
     * needs to keep to itself. A sprite off a tile sheet is pixel art already.
     */
    function billboardMaterial(folder, name) {
        const key = 'bb:' + folder + '/' + name;
        const hit = _matCache.get(key);
        if (hit) return hit;
        const map = billboardTexture(folder, name);
        const m = new THREE.MeshLambertMaterial({
            map: map, transparent: true, alphaTest: 0.42,
            side: THREE.DoubleSide, depthWrite: true
        });
        m.onBeforeCompile = (shader) => {
            // i18n-ignore-start  GLSL shader source
            shader.vertexShader = shader.vertexShader
                .replace('#include <project_vertex>', [
                    '#ifdef USE_INSTANCING',
                    '  vec3 bbCenter = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);',
                    '  float bbScale = length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z));',
                    '#else',
                    '  vec3 bbCenter = vec3(0.0); float bbScale = 1.0;',
                    '#endif',
                    'vec4 mvPosition = modelViewMatrix * vec4(bbCenter, 1.0);',
                    'mvPosition.xy += position.xy * bbScale;',
                    'gl_Position = projectionMatrix * mvPosition;'
                ].join('\n'))
                .replace('#include <defaultnormal_vertex>',
                    '#include <defaultnormal_vertex>\n\ttransformedNormal = vec3(0.0, 0.0, 1.0);');
            // i18n-ignore-end
        };
        m.customProgramCacheKey = () => 'dreamBillboard';
        m.userData = { _psx: true };
        _matCache.set(key, m);
        return m;
    }

    // =========================================================================
    // Apparitions: the faces a dream borrows.
    //
    // Two sources, drawn the same way. The first is the monster art in
    // img/enemies/Dreams, which nothing else in the game uses: one flat card
    // turned at the sleeper, as tall as the dream feels like making it. The
    // second is the game's own walking sprites, every sheet the NPC catalogue
    // knows, betas included, and those are DIRECTIONAL: the sheet holds four
    // facings and the one shown is chosen from where the sleeper is standing,
    // so circling a figure walks round it.
    //
    // Neither is instanced. There are a couple of dozen, each carries its own
    // frame of its own sheet, and each has to be able to answer a blow.
    // =========================================================================
    // i18n-ignore-start: file names under img/enemies/Dreams, not display text.
    const DREAM_FACES = [
        '10 Backwards Bird.png', '10 Sewers slime.png', '1007 Arctic Fox.png',
        '101 Pregnant Seahorse.png', '1011 Seal Pup.png', '103 Rabid Hyena.png',
        '104 Reanimated Guard.png', '105 Reef Guppy.png', '1050 Pyroshell Tortoise.png',
        '108 Rubber Reality Blob.png', '11 Bi Human.png', '11 Thunder Sprite.png',
        '111 Sewer Rat.png', '112 Skin Balloon.png', '115 Slow Turtle.png',
        '116 Snow Werewolf.png', '117 Spore Wanderer.png', '118 Squeaky Turnip Fiend.png',
        '120 Stone Shifter.png', '121 Surveillance Drone.png', '125 Tax Collector.png',
        '126 Taxidoggo.png', '127 Thirsty Camel.png', '128 Tide Crab.png', '129 Tiny Chick.png',
        '13 Blood Initiate.png', '130 Tomb Guardian.png', '131 Tongue Leech.png',
        '133 Totemic Sprout.png', '134 Tourist Skeleton.png', '136 Undead Archer.png',
        '138 Wandering Eyeball.png', '139 Wasteland Beaver.png', '14 Blood Mosquito.png',
        '140 Weeping Mask.png', '155 Abyssal Serpent.png', '156 Acid Ant.png',
        '157 Amateur Pugilist.png', '16 Bog Hatchling.png', '161 Azure Slime.png',
        '162 Baby Doll Head.png', '166 Bandit Chief.png', '167 Bandit Cleric.png',
        '168 Bandit Crossbowman.png', '17 Bone Warrior.png', '171 Bandit Pyromancer.png',
        '176 Black Panther.png', '177 Blizzard Owl.png', '178 Bloated Whale.png',
        '18 Boneyard Hunter.png', '183 Boxing Elemental.png', '185 Brown Bear.png',
        '187 Cave Gnome.png', '19 Bubble Squid.png', '191 Coral Guardian.png',
        '192 Cautious Opossum .png', '2 Abandoned Novice.png', '2 Goblin Warrior.png',
        '20 Bubble Squid.png', '200 Death\'s Head.png', '202 Dire Pig.png', '206 Gun Burger.png',
        '207 Dream Weaver.png', '209 Dryad Protector.png', '21 Buzzing Bumblebee.png',
        '213 Elven Frost Mage.png', '22 Caffeinated Squirrel.png', '222 Ember Caster.png',
        '226 Eyeless Bat.png', '23 Catfish.png', '232 Forest Stag.png', '24 Catican.png',
        '25 Catizard.png', '26 Cautious Opossum.png', '27 Cotton Fox.png', '28 Crawling Hand.png',
        '29 Crypt Sentinel.png', '3 Ancient Skeleton.png', '30 Cultist Acolyte.png',
        '32 Decaying Corpse.png', '33 Desert Raider.png', '34 Desperate Pufferfish.png',
        '35 Disco Beetle.png', '36 Double Singer.png', '37 Draconic Dragonfly.png',
        '39 Electromagnetic Ghoul.png', '4 Anxiety Elemental.png', '4 Goblin Chieftain.png',
        '40 Ember Imp.png', '41 Expired Ooze.png', '411 Ghost Wisp.png', '420 Lingering Spirit.png',
        '43 Fallen Warrior.png', '44 Fear Siphon.png', '45 Feral Alley Cat.png',
        '46 Festering Corpse.png', '47 Fidget Sprite.png', '473 Curious Rabbit.png',
        '476 Crimson Fish.png', '478 Ladybug.png', '479 Squirrel.png', '48 Field Mouse.png',
        '480 Earthworm.png', '481 Quacking Duck.png', '483 Blue Jay.png', '484 Skunk.png',
        '485 Grasshopper.png', '49 Finger Worm.png', '5 Apprentice Pyromancer.png',
        '5 Forest Treant.png', '50 Flamingo Sentinel.png', '51 Flower Pixie.png',
        '52 Forest Poacher.png', '53 Forest Rat.png', '54 Forgotten Acolyte.png',
        '55 Free Lobster.png', '57 Frost-Touched Thrall.png', '58 Iron Horse.png',
        '59 Garden Frog.png', '6 Apprentice\'s Remains.png', '6 Dodger Imp.png',
        '61 Giggling Skull.png', '624 Wild Rabbit.png', '63 Golden Seahorse.png',
        '66 Graveyard Shambler.png', '679 Rotvulture.png', '717 Spectral Songbird.png',
        '74 Ice Wolf Pup.png', '748 Timeworn Owlbear.png', '75 Inside-Out Critter.png',
        '76 Karaoke Banshee.png', '77 Kazoo Imp.png', '79 Lazy Cat.png', '8 Armored Remains.png',
        '8 Desert Scorpion.png', '81 Lizard Sniper.png', '82 Lost Memory.png',
        '83 Maggot Slail.png', '86 Mine Slave.png', '88 Mischievous Sprite.png', '89 Mole.png',
        '9 Compressed air.png', '90 Mr. Inadequate.png', '91 Novice Boxer.png',
        '93 Origami Crane.png', '97 Pillow Guardian.png', 'Reganite.png', 'pistola burger.png'
    ];
    // i18n-ignore-end

    /**
     * Every walking sheet the world knows, betas and all: a dream is not the
     * place to be fussy about which art a world was allowed. Read through the
     * catalogue rather than off the disk, and cached for the session. A
     * `npc:false` entry (a door, a chest, a monster card, a retired dossier
     * skin, ...) is not a person's walk cycle and is never dealt here, same
     * rule SpriteCatalog.npcKeys() enforces for the waking world.
     */
    let _npcSheets = null;
    function npcSheetKeys() {
        if (_npcSheets) return _npcSheets;
        _npcSheets = [];
        try {
            const db = (window.WorldGen && window.WorldGen.NPCs) || null;
            if (db) {
                for (const key in db) {
                    const e = db[key];
                    if (!e || e.npc !== true) continue;
                    // A pose sheet is not a walk cycle and has no facings.
                    if (e.animations) continue;
                    _npcSheets.push(key);
                }
            }
        } catch (e) { /* the catalogue is not loaded */ }
        return _npcSheets;
    }

    /**
     * One frame of one character sheet as a texture of its own. A `$` sheet
     * holds one character in 3 columns by 4 rows; anything else holds eight,
     * and the dream always takes the first. The image is loaded once and
     * shared; the CLONE carries the offset, which is what lets two apparitions
     * off the same sheet face different ways.
     */
    const _sheetTex = new Map();
    function sheetTexture(path) {
        let t = _sheetTex.get(path);
        if (t !== undefined) return t;
        t = null;
        if (THREE.TextureLoader) {
            t = new THREE.TextureLoader().load(encodeURI('img/characters/' + path + '.png'));
            if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
            else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            t.generateMipmaps = false;
        }
        _sheetTex.set(path, t);
        return t;
    }
    function faceTexture(file) {
        const key = 'face:' + file;
        let t = _sheetTex.get(key);
        if (t !== undefined) return t;
        t = null;
        if (THREE.TextureLoader) {
            t = new THREE.TextureLoader().load(encodeURI('img/enemies/Dreams/' + file));
            if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
            else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
            t.magFilter = THREE.LinearFilter;
            t.minFilter = THREE.LinearFilter;
            t.generateMipmaps = false;
        }
        _sheetTex.set(key, t);
        return t;
    }

    // =========================================================================
    // What the sleeper is dreaming ABOUT.
    //
    // A dream had out of the title screen's arcade is nobody's: it is rolled
    // out of the world seed and the clock, and nothing in it belongs to anyone.
    // A dream had in a bed is the party's own, and the party keeps a record of
    // its life already: the diary (Core/Diary.js). So the memory layer is read
    // straight off it, the WHOLE of it, and it changes only two things about a
    // dream - which creatures are standing in it and which faces are walking
    // about. Everything else the dream rolls for itself, as it always did.
    //
    // Two rules, and they are the same rule seen twice:
    //
    //   FREQUENCY   a line written last night is dealt far more often than one
    //               written a hundred days ago, which is what makes a dream
    //               mostly about the day that has just been had.
    //   DISTANCE    the sleeper opens their eyes at the middle of the field,
    //               and a memory stands at a radius set by its own age. What
    //               is near is recent; walking outward is walking back through
    //               the party's life, and the far edge of a dream is the
    //               beginning of the playthrough.
    //
    // Recency is measured by RANK rather than by the clock: a diary spans
    // whatever the party spent, from an afternoon to eleven years, and a
    // half-life in minutes reads as "all of it is recent" in one save and "none
    // of it is" in the next. Rank has neither failure.
    // =========================================================================

    // What a line of the diary is a memory OF. A kind not named here is not a
    // thing that can stand in a dream (a shop receipt, a loan, a floor change),
    // which is most of the book: the dream wants creatures and people.
    const MEMORY_CREATURE_KINDS = {
        'battle.won':        (p) => splitNames(p.enemies),
        'battle.lost':       (p) => splitNames(p.enemies),
        'battle.boss':       (p) => [p.name],
        'battle.petrodemon': (p) => [p.name],
        'bestiary.found':    (p) => [p.creature],
        'pet.join':          (p) => [p.name],
        'pet.follower':      (p) => [p.name],
        'pet.abandon':       (p) => [p.name]
    };

    const MEMORY_PERSON_KINDS = {
        'npc.friend':    (p) => [p.npc],
        'npc.enemy':     (p) => [p.npc],
        'npc.romance':   (p) => [p.npc],
        'party.join':    (p) => [p.name],
        'party.leave':   (p) => [p.name],
        'party.death':   (p) => [p.name],
        'party.retire':  (p) => [p.name],
        'birth.born':    (p) => [p.child],
        'birth.mitosis': (p) => [p.name]
    };

    /** "Slime, Bandit Chief x2" as the diary writes it, back into bare names. */
    function splitNames(text) {
        if (!text) return [];
        return String(text).split(',').map(s => s.replace(/\s+x\d+\s*$/i, '').trim()).filter(Boolean);
    }

    // Creature name -> $dataEnemies row. Built once a session and keyed on the
    // lowercased name, since the diary writes down whatever the book was called
    // at the time and a reader may be holding it in a different case.
    let _enemyByName = null;
    function enemyDataByName(name) {
        if (!_enemyByName) {
            _enemyByName = new Map();
            try {
                for (const e of ($dataEnemies || [])) {
                    if (e && e.name) _enemyByName.set(String(e.name).toLowerCase(), e);
                }
            } catch (err) { /* the database is not up */ }
        }
        return _enemyByName.get(String(name || '').toLowerCase()) || null;
    }

    function hashName(name) {
        let h = 2166136261;
        const s = String(name || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    /**
     * The walking sheet a remembered person wears. Their own, where the world
     * gave them one; otherwise a face dealt out of the catalogue on their name
     * alone, so the same person is always the same figure in every dream they
     * turn up in.
     */
    function sheetForPerson(name) {
        // Only a sheet the catalogue knows is ever used: an unknown path loads
        // nothing, and a figure whose art never arrives is one that stands
        // invisible in the field and talks.
        const db = (window.WorldGen && window.WorldGen.NPCs) || null;
        const known = (key) => !!(key && db && db[key] && db[key].npc === true && !db[key].animations);
        try {
            const actor = $gameParty && $gameParty.members().find(a => a && a.name() === name);
            if (actor && actor.characterName && known(actor.characterName())) return actor.characterName();
        } catch (e) { /* not a member */ }
        try {
            const profile = window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile
                ? window.NPCSocietyRegistry.getProfile(name) : null;
            if (profile && known(profile.spriteKey)) return profile.spriteKey;
        } catch (e) { /* no society */ }
        try {
            if (window.SpriteCatalog && window.SpriteCatalog.pickNpcKey) {
                const key = window.SpriteCatalog.pickNpcKey(hashName(name) / 4294967296);
                if (key) return key;
            }
        } catch (e) { /* no catalogue */ }
        const sheets = npcSheetKeys();
        return sheets.length ? sheets[hashName(name) % sheets.length] : null;
    }

    const DreamMemory = {
        /**
         * Reads the whole diary and answers what is standing in tonight's
         * dream. Null when there is nothing to dream about - no diary, an empty
         * one, or the arcade - and every caller falls back to the old rolls.
         */
        build() {
            const D = window.Diary;
            if (!D || !D.entries || !D.isActive || !D.isActive()) return null;
            let entries;
            try { entries = D.entries() || []; } catch (e) { return null; }
            if (!entries.length) return null;

            // Latest mention wins: somebody met on the first day and again last
            // night is a recent memory, and the count of mentions is how much
            // of the party's life they took up.
            const creatures = new Map();
            const people = new Map();
            const note = (bag, name, t) => {
                const key = String(name || '').trim();
                if (!key) return;
                const hit = bag.get(key);
                if (hit) { hit.t = Math.max(hit.t, t); hit.n++; }
                else bag.set(key, { name: key, t: t, n: 1 });
            };
            for (const e of entries) {
                if (!e || !e.k) continue;
                const t = Number(e.t) || 0;
                const p = e.p || {};
                const c = MEMORY_CREATURE_KINDS[e.k];
                if (c) { for (const n of c(p)) note(creatures, n, t); continue; }
                const h = MEMORY_PERSON_KINDS[e.k];
                if (h) { for (const n of h(p)) note(people, n, t); }
            }

            const out = {
                creatures: this._rank([...creatures.values()], (rec) => {
                    const data = enemyDataByName(rec.name);
                    if (!data) return null;
                    const key = window.Battler3D && window.Battler3D.resolveKey
                        ? window.Battler3D.resolveKey(data) : null;
                    if (!key) return null;
                    rec.enemy = data;
                    rec.key = key;
                    rec.gait = (window.Battler3D.gaitForKey && window.Battler3D.gaitForKey(key)) || 'walk';
                    return rec;
                }),
                people: this._rank([...people.values()], (rec) => {
                    const sheet = sheetForPerson(rec.name);
                    if (!sheet) return null;
                    rec.sheet = sheet;
                    return rec;
                })
            };
            if (!out.creatures.length && !out.people.length) return null;
            return out;
        },

        /**
         * Sorts a bag of memories oldest first and hands each one its two
         * numbers: `rec` (0 the first thing the party ever wrote down, 1 last
         * night) and `weight`, how often it is dealt. The weight curve is steep
         * on purpose - the newest memory is worth some fifteen of the oldest -
         * because a dream that deals evenly out of eleven years of diary is a
         * dream about nothing in particular.
         */
        _rank(list, resolve) {
            const kept = [];
            for (const rec of list) {
                const done = resolve(rec);
                if (done) kept.push(done);
            }
            kept.sort((a, b) => a.t - b.t);
            const last = kept.length - 1;
            for (let i = 0; i < kept.length; i++) {
                const rec = kept[i];
                rec.rec = last > 0 ? i / last : 1;
                // Mentioned again and again and it stands nearer than its age
                // alone would put it: a creature the party fought two hundred
                // times is not something they have finished with.
                const familiarity = Math.min(0.18, Math.log(rec.n + 1) * 0.05);
                rec.rec = Math.min(1, rec.rec + familiarity);
                // Measured over a year-long diary this deals roughly 40 / 27 /
                // 17 / 10 / 6 percent over the five bands out from the middle,
                // the newest memory worth some ten of the oldest. Steeper than
                // that and the far half of the field stands empty, which is not
                // a dream about a life, it is a dream about yesterday.
                rec.weight = 0.35 + Math.pow(rec.rec, 1.8) * 3.0;
            }
            return kept;
        },

        /** One memory, dealt by weight rather than evenly. */
        pick(list, rnd) {
            if (!list || !list.length) return null;
            let total = 0;
            for (const rec of list) total += rec.weight;
            let roll = rnd() * total;
            for (const rec of list) {
                roll -= rec.weight;
                if (roll <= 0) return rec;
            }
            return list[list.length - 1];
        }
    };

    // =========================================================================
    // What a dream sounds like.
    //
    // The ambience is pulled from the pool the world's own biomes are scored
    // from (js/db/WorldGen/Biomes.json), so a dream is never scored with
    // anything the game does not already own. The sound effects are the
    // engine's own, dealt fresh every dream: what the things in it cry, what
    // an apparition says, what a struck thing sounds like, and the noises the
    // place makes to itself.
    // =========================================================================
    // i18n-ignore-start: audio file names, not display text.
    const DREAM_SE_VOICE = ['Monster1', 'Monster2', 'Monster3', 'Monster4', 'Monster5', 'Monster6',
        'Monster7', 'Monster8', 'Monster9', 'Monster10', 'Cry1', 'Cry2', 'Growl', 'Laugh', 'Scream',
        'Cat', 'Dog', 'Cow', 'Crow', 'Frog', 'Sheep', 'Wolf', 'Chicken', 'Horse', 'Breath', 'Stare'];
    const DREAM_SE_NOISE = ['Noise', 'Neon', 'Machine', 'Computer', 'Phone', 'Siren', 'Buzzer1',
        'Buzzer2', 'Chime1', 'Chime2', 'Bell1', 'Bell3', 'Sound1', 'Sound3', 'Fog1',
        'Fog2', 'Wind1', 'Wind7', 'Water1', 'Liquid', 'Leakage', 'Chain', 'Knock', 'Door4', 'Gate1',
        'Collapse1', 'Collapse3', 'Earth3', 'Twine', 'Resonance', 'Starlight', 'Reflection',
        'Transceiver', 'Electrocardiogram', 'Digital_Magic_Corrupt_Interface_5'];
    const DREAM_SE_HIT = ['Blow1', 'Blow5', 'Blow8', 'Damage3', 'Damage5', 'Break', 'Crash',
        'Absorb1', 'Barrier', 'ShieldImpact', 'Push', 'Paralyze1'];
    const DREAM_SE_GONE = ['Collapse2', 'Collapse4', 'Darkness3', 'Darkness6', 'Flash2', 'Magic3',
        'Magic8', 'Teleport', 'Summon', 'Powerup', 'Recovery', 'Saint5', 'Particles2'];
    const DREAM_BGS_FALLBACK = ['dream2', 'drone', 'glitch-sounds', 'horror', 'creeps', 'hum-loop',
        'unknown-noise', 'abyss-ambience', 'room-empty', 'ventilation'];
    // i18n-ignore-end

    /** Every BGS the world's biomes are scored with, gathered once. */
    let _bgsPool = null;
    function bgsPool() {
        if (_bgsPool) return _bgsPool;
        const seen = new Set();
        try {
            const list = (window.WorldGen && window.WorldGen.Biomes) || [];
            for (const b of list) {
                for (const k of ['bgs', 'bgsNight']) {
                    const arr = b && b[k];
                    if (!Array.isArray(arr)) continue;
                    for (const n of arr) if (n) seen.add(String(n));
                }
            }
        } catch (e) { /* no biome table */ }
        for (const n of DREAM_BGS_FALLBACK) seen.add(n);
        _bgsPool = Array.from(seen);
        return _bgsPool;
    }

    /** Plays an SE at a volume the distance decides. Silence is never an error. */
    function dreamSe(name, volume, pitch, pan) {
        if (!name || typeof AudioManager === 'undefined') return;
        const vol = Math.round(Math.max(0, Math.min(100, volume === undefined ? 70 : volume)));
        if (vol <= 1) return;
        try {
            AudioManager.playSe({
                name: name, volume: vol,
                pitch: Math.round(Math.max(50, Math.min(150, pitch || 100))),
                pan: Math.round(Math.max(-100, Math.min(100, pan || 0)))
            });
        } catch (e) { /* the file is not there; a dream can be quiet */ }
    }

    // =========================================================================
    // Weather, and the other things that are wrong with a dream.
    //
    // A dream has weather the sky has never had: static, teeth, paper, embers,
    // rain that falls upward. It is one point cloud carried about with the
    // sleeper, so it costs one draw call and exists everywhere at once.
    // =========================================================================
    const WEATHER_KINDS = {
        ash:     { size: 2.2, fall: -14, sway: 5,  count: 900,  glow: 0.0 },
        static:  { size: 1.4, fall: -3,  sway: 34, count: 1800, glow: 0.9 },
        rain:    { size: 1.1, fall: -180, sway: 2, count: 1400, glow: 0.2 },
        upfall:  { size: 2.6, fall: 42,  sway: 8,  count: 800,  glow: 0.4 },
        snow:    { size: 3.4, fall: -22, sway: 14, count: 900,  glow: 0.1 },
        embers:  { size: 2.0, fall: 18,  sway: 11, count: 600,  glow: 1.0 },
        teeth:   { size: 5.0, fall: -60, sway: 6,  count: 240,  glow: 0.0 },
        paper:   { size: 6.5, fall: -26, sway: 26, count: 320,  glow: 0.0 },
        motes:   { size: 3.0, fall: 4,   sway: 18, count: 700,  glow: 0.7 },
        pollen:  { size: 2.4, fall: -6,  sway: 22, count: 1100, glow: 0.5 }
    };
    const WEATHER_KEYS = Object.keys(WEATHER_KINDS);

    /**
     * The laws a dream is under. One to three of them, rolled per dream, each
     * a small rule the whole world then obeys. They are what makes one dream
     * unlike the last beyond the colour of its walls.
     */
    const DREAM_LAWS = ['breathing', 'lowGravity', 'heavy', 'inverted', 'watched', 'swarm',
        'stutter', 'chorus', 'shrinking', 'tide', 'echo'];

    // =========================================================================
    // Guests: furniture that has wandered in out of the other games.
    //
    // A bowling pin in a dream is a bowling pin, so these keep their own
    // colours rather than the region's: they have to read as intrusions. They
    // are the only things in the world that are not instanced, because there
    // are only a couple of dozen and they drift and turn.
    // =========================================================================
    const GUESTS = {
        bowlingPin: () => {
            const pts = [];
            for (let i = 0; i <= 10; i++) {
                const t = i / 10;
                const rad = 0.42 + Math.sin(t * Math.PI * 1.15) * 0.95 - t * 0.34;
                pts.push(new THREE.Vector2(Math.max(0.22, rad) * 3, t * 22));
            }
            const pin = new THREE.Mesh(new THREE.LatheGeometry(pts, 9), dmat(0xf6f3ea));
            return knit(pin, put(gCyl(2.05, 2.05, 1.1, 9, 0xd8322a), 0, 15.5, 0),
                             put(gCyl(2.25, 2.25, 1.1, 9, 0xd8322a), 0, 13.4, 0));
        },
        bowlingBall: () => {
            const g = knit(put(gSph(7, 0x1c1533), 0, 7, 0));
            for (let i = 0; i < 3; i++) {
                const a = i * 0.5 - 0.5;
                g.add(put(gCyl(0.9, 0.9, 2, 6, 0x08060f), Math.sin(a) * 4.6, 12.2, Math.cos(a) * 4.6 - 2));
            }
            return g;
        },
        playingCard: () => knit(put(gBox(11, 16, 0.35, 0xfbf7ee), 0, 12, 0),
                                put(gQuad(8, 12, 0xc0202a), 0, 12, 0.22),
                                put(gQuad(8, 12, 0x203a8c), 0, 12, -0.22, 0, Math.PI, 0)),
        tarotCard:  () => knit(put(gBox(10, 18, 0.35, 0x1a1330), 0, 13, 0),
                               put(gQuad(7.6, 15, 0x2b1f52), 0, 13, 0.22),
                               put(new THREE.Mesh(new THREE.CircleGeometry(2.6, 7),
                                   dmat(0xf0d67a, { glow: 0.7, both: true })), 0, 13, 0.3)),
        scratchCard: () => knit(put(gBox(16, 10, 0.4, 0xf2e2b8), 0, 9, 0),
                                put(gQuad(9, 5, 0xb9bcc0, { glow: 0.2 }), -2, 9, 0.25),
                                put(gQuad(3.4, 3.4, 0xd44a2a), 5.4, 9, 0.25)),
        slotReel: () => {
            const g = knit(put(gCyl(6, 6, 14, 14, 0xe8e4d8), 0, 12, 0, 0, 0, Math.PI / 2));
            const pips = [0xd8322a, 0x2f9e44, 0xf0b429, 0x2a5db0];
            for (let i = 0; i < 4; i++) {
                const a = i * TAU / 4;
                g.add(put(gQuad(4, 4, pips[i]), 0, 12 + Math.cos(a) * 6.1, Math.sin(a) * 6.1, -a, 0, 0));
            }
            return g;
        },
        poolBall: () => knit(put(gSph(5, 0xe8b32a), 0, 5, 0),
                             put(gCyl(5.02, 5.02, 3.4, 12, 0xf7f3e8), 0, 5, 0, 0, 0, Math.PI / 2),
                             put(new THREE.Mesh(new THREE.CircleGeometry(2, 10), dmat(0xf7f3e8, { both: true })), 0, 5, 5.05)),
        cueStick: () => knit(put(gCyl(0.35, 0.75, 42, 7, 0xc99a5b), 0, 21, 0, 0.25, 0, 0),
                             put(gCyl(0.34, 0.34, 1.2, 7, 0x2a2a34), 0, 41.6, 0, 0.25, 0, 0)),
        die: () => {
            const g = knit(put(gBox(8, 8, 8, 0xf4f1e6), 0, 6, 0));
            const pip = (x, y, z) => g.add(put(gSph(0.75, 0x18181c), x, y, z));
            pip(0, 6, 4.1); pip(-2.3, 8.3, -4.1); pip(2.3, 3.7, -4.1);
            pip(4.1, 8.3, 2.3); pip(4.1, 6, 0); pip(4.1, 3.7, -2.3);
            return g;
        },
        arcadeCabinet: () => knit(put(gBox(16, 34, 14, 0x1d1f4a), 0, 17, 0),
                                  put(gQuad(12, 9, 0x35f0d0, { glow: 0.9 }), 0, 26, 7.2, -0.35, 0, 0),
                                  put(gBox(15, 1.4, 7, 0x2a2d63), 0, 19, 6),
                                  put(gCyl(0.5, 0.5, 3, 6, 0xd8322a), -3, 20.6, 6),
                                  put(gSph(1, 0xd8322a), -3, 22.2, 6),
                                  put(gQuad(13, 5, 0xf0b429, { glow: 0.8 }), 0, 32.5, 7.1)),
        pianoKeys: () => {
            const g = new THREE.Group();
            for (let i = 0; i < 10; i++) g.add(put(gBox(2.2, 1.6, 12, 0xf6f4ee), -10 + i * 2.3, 4, 0));
            for (const i of [0, 1, 3, 4, 5, 7, 8]) g.add(put(gBox(1.3, 1.8, 7, 0x141418), -8.9 + i * 2.3, 5.4, -2));
            g.add(put(gBox(24, 4, 13, 0x241a12), 0, 2, 0));
            return g;
        },
        fishingFloat: () => knit(put(gSph(3, 0xd8322a), 0, 8, 0),
                                 put(gCyl(3, 0.4, 5, 9, 0xf6f3ea), 0, 4.6, 0, Math.PI, 0, 0),
                                 put(gCyl(0.25, 0.25, 7, 5, 0x2a2a34), 0, 13, 0)),
        surfboard: () => {
            const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), dmat(0xf2efe4));
            b.scale.set(4.5, 1.1, 22);
            return knit(put(b, 0, 6, 0), put(gQuad(3, 20, 0xe8552e), 0, 7.2, 0, -Math.PI / 2, 0, 0),
                        put(gCone(1.6, 3.4, 3, 0x2a2a34), 0, 4.4, -8, Math.PI, 0, 0));
        },
        tetrisBlock: () => {
            const g = new THREE.Group();
            const cells = [[0, 0], [1, 0], [1, 1], [2, 1]];
            for (const cell of cells) {
                g.add(put(gBox(7, 7, 7, 0x35c2f0, { glow: 0.35 }), cell[0] * 7 - 7, cell[1] * 7 + 4, 0));
                g.add(put(gBox(7.6, 0.6, 7.6, 0x0b3a52), cell[0] * 7 - 7, cell[1] * 7 + 7.6, 0));
            }
            return g;
        },
        boosterPack: () => knit(put(gBox(11, 15, 1.4, 0x2a1d5e), 0, 11, 0),
                                put(gQuad(9, 4, 0xf0b429, { glow: 0.5 }), 0, 15, 0.8),
                                put(gQuad(8, 7, 0xd44ad0), 0, 9.5, 0.8)),
        horseshoe: () => knit(put(new THREE.Mesh(new THREE.TorusGeometry(6, 1.3, 6, 14, Math.PI * 1.45),
                                  dmat(0x8d7f6a)), 0, 8, 0, 0, 0, -Math.PI * 0.27)),
        coin: () => knit(put(gCyl(5, 5, 0.9, 16, 0xe8c04a, { glow: 0.25 }), 0, 6, 0, Math.PI / 2, 0, 0),
                         put(new THREE.Mesh(new THREE.CircleGeometry(3.4, 12), dmat(0xf3dd8a, { both: true })), 0, 6, 0.5))
    };
    const GUEST_KEYS = Object.keys(GUESTS);

    // The party's own camper, parked in a dream. It is the one guest that is a
    // real asset off the disk rather than a shape built here (models/Camper.glb,
    // the vehicle CamperDrivingSystem drives), loaded once and cloned.
    const CAMPER_MODEL = 'models/Camper.glb';
    let _camperProto = null, _camperTried = false;
    function loadCamperProto(then) {
        if (_camperProto) { then(_camperProto); return; }
        if (_camperTried || !window.THREE || !THREE.GLTFLoader) return;
        _camperTried = true;
        try {
            new THREE.GLTFLoader().load(CAMPER_MODEL, (gltf) => {
                // The GLB is a metre-scale vehicle and the dream is in game
                // pixels; 4x puts it at about the length of a bus here.
                const root = gltf.scene;
                root.scale.multiplyScalar(4);
                _camperProto = root;
                then(root);
            }, undefined, () => { /* no camper in this build */ });
        } catch (e) { /* loader unavailable */ }
    }

    // =========================================================================
    // Celestial bodies. GalaxySim builds these for the star map at astronomical
    // scale; a dream hangs one over the sleeper's head at whatever size it
    // likes, which is how you come over a rise and find a black hole.
    // =========================================================================
    function cosmosApi() {
        return (window.GalaxySim && window.GalaxySim.Scene3DCosmos) || null;
    }
    const EXOTIC_TYPES = ['NEUTRON_STAR', 'PULSAR', 'MAGNETAR', 'WOLF_RAYET', 'CARBON_STAR',
        'PROTOSTAR', 'RED_GIANT', 'RED_SUPERGIANT', 'HYPERGIANT', 'THORNE_ZYTKOW',
        'QUARK_STAR', 'BOSON_STAR', 'BLACK_DWARF', 'IRON_STAR', 'QUASI_STAR', 'DARK_STAR',
        'ELECTROWEAK_STAR', 'ROGUE_PLANET'];
    // The worlds a dream is allowed to hang in its sky, by the names
    // GalaxySim's planet painter knows them under.
    const PLANET_TYPES = ['earth_like', 'ocean', 'habitable', 'gas_giant', 'ringed_gas_giant',
        'ice_giant', 'hot_jupiter', 'cold_jupiter', 'puffy', 'ice', 'tundra', 'dwarf',
        'lava_ocean', 'magma_planet', 'chthonian'];

    /**
     * One body, built at a rolled size. Returns `{ group, animate }` or null
     * when GalaxySim is not loaded, in which case the dream simply has no
     * moons in it.
     */
    function buildCelestial(rnd, kind, radius, seed, type) {
        const C = cosmosApi();
        try {
            if (kind === 'blackhole' && C && C.buildBlackHole) {
                return C.buildBlackHole({
                    radius: radius, seed: seed,
                    // The big ones get the Interstellar treatment, which is what
                    // makes finding one in a field worth the walk.
                    style: radius > 120 ? 'interstellar' : undefined
                });
            }
            if (kind === 'nebula' && C && C.buildNebula) {
                return { group: C.buildNebula({ seed: seed, size: radius * 2.4 }), animate: null };
            }
            if (kind === 'planet') {
                // A real world, painted by the star map's own planet painter and
                // then scaled to whatever size the dream wanted it.
                const R3D = window.GalaxySim && window.GalaxySim.Renderer3D;
                if (R3D && R3D.buildPlanetGroup) {
                    const g = R3D.buildPlanetGroup({
                        name: 'DREAM', type: type || 'earth_like', radius: 1, color: '#8899aa'
                    }, seed);
                    if (g) {
                        const box = new THREE.Box3().setFromObject(g);
                        const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y,
                                              box.max.z - box.min.z) || 1;
                        g.scale.multiplyScalar((radius * 2) / span);
                        return { group: g, animate: null, planet: true };
                    }
                }
            }
            if (C && C.buildExoticStar) {
                const t = EXOTIC_TYPES[Math.floor(rnd() * EXOTIC_TYPES.length)];
                return C.buildExoticStar({ name: 'DREAM', type: t }, { radius: radius, seed: seed });
            }
        } catch (e) { /* the star map is not obliged to work in here */ }
        return null;
    }

    // =========================================================================
    // Floors. One printed treatment per dream, drawn to a small canvas and
    // repeated a tile a cell. It is what turns the same heightfield into an
    // office, a changing room or a nowhere.
    // =========================================================================
    const FLOOR_KINDS = ['plain', 'checker', 'tiles', 'grid', 'carpet', 'stripes', 'lino'];

    function makeFloorTexture(kind, rnd) {
        const S = 64;
        const cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const c = cv.getContext('2d');
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, S, S);
        const ink = (a) => 'rgba(0,0,0,' + a + ')';
        const lite = (a) => 'rgba(255,255,255,' + a + ')';
        if (kind === 'checker') {
            c.fillStyle = ink(0.55);
            c.fillRect(0, 0, S / 2, S / 2);
            c.fillRect(S / 2, S / 2, S / 2, S / 2);
        } else if (kind === 'tiles') {
            c.fillStyle = ink(0.35);
            c.fillRect(0, 0, S, 3); c.fillRect(0, 0, 3, S);
            c.fillStyle = lite(0.25);
            c.fillRect(3, 3, S - 6, 2);
        } else if (kind === 'grid') {
            c.fillStyle = ink(0.5);
            c.fillRect(0, 0, S, 1); c.fillRect(0, 0, 1, S);
        } else if (kind === 'carpet') {
            for (let i = 0; i < 900; i++) {
                c.fillStyle = ink(0.05 + rnd() * 0.25);
                c.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 1, 1);
            }
        } else if (kind === 'stripes') {
            c.fillStyle = ink(0.4);
            for (let x = 0; x < S; x += 16) c.fillRect(x, 0, 8, S);
        } else if (kind === 'lino') {
            for (let i = 0; i < 260; i++) {
                c.fillStyle = rnd() < 0.5 ? ink(0.12 + rnd() * 0.1) : lite(0.2);
                const w = 1 + rnd() * 3;
                c.fillRect(rnd() * S, rnd() * S, w, w * 0.6);
            }
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    }

    // =========================================================================
    // Region kinds.
    //
    // A region is not only a bag of rolled parts: most of them are ABOUT
    // something. A kind is applied over a rolled region and bends it into a
    // place the sleeper can recognise, and because it is applied PER REGION
    // rather than per dream, one dream holds several of them at once: a
    // corridor of backrooms that opens onto a drowned car park with a
    // megastructure going up out of sight behind it. That mixing is the point.
    //
    // A kind may ask for things the whole dream has to agree to (a ceiling over
    // its own cells, a lid of water, something enormous in the sky); those are
    // written on the region and collected by rollDream.
    // =========================================================================
    const REGION_KINDS = {
        // The un-themed roll: whatever rollRegion already dealt.
        wild: null,

        backrooms: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.75 ? 'fluorescent' : 'ash'));
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: rnd() < 0.62 ? 'corridor' : 'room', step: 3 };
            rg.prop = rnd() < 0.35 ? propOf('doorframe', 0.02, 0.9, 1.2) : null;
            rg.ceiling = { y: 26, lights: true };
            rg.floor = rnd() < 0.5 ? 'carpet' : 'lino';
            rg.text = true;
            rg.fog = 0.0055 + rnd() * 0.004;
        },
        office: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, 'fluorescent'));
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: rnd() < 0.5 ? 'cubicles' : 'waitingroom', step: 3 };
            rg.prop = propOf(rnd() < 0.5 ? 'chair' : 'tvset', 0.05, 0.8, 1.3);
            rg.ceiling = { y: 30, lights: true };
            rg.floor = 'carpet';
            rg.text = rnd() < 0.5;
            rg.fog = 0.004 + rnd() * 0.003;
        },
        escher: (rg, rnd) => {
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: rnd() < 0.6 ? 'escher' : (rnd() < 0.5 ? 'stairflight' : 'platforms'),
                             step: 3 + Math.floor(rnd() * 2) };
            rg.prop = propOf(rnd() < 0.5 ? 'stairs' : 'doorframe', 0.03, 0.7, 1.8);
            rg.floor = 'checker';
            rg.fog = 0.0012 + rnd() * 0.0016;
        },
        // Everything under a lid of water: the sleeper walks the bottom.
        drowned: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, 'chlorine'));
            rg.prop = propOf('seaweed', 0.09 + rnd() * 0.1, 0.7, 3);
            if (rnd() < 0.45) rg.structure = { key: 'pool', step: 4 };
            rg.lid = { y: 90 + rnd() * 110 };
            rg.floor = rnd() < 0.5 ? 'tiles' : 'plain';
            rg.fog = 0.0075 + rnd() * 0.005;
        },
        // A whole city, ankle high, going on past the fog in every direction.
        miniature: (rg, rnd) => {
            rg.ground = { kind: rnd() < 0.5 ? 'flat' : 'rolling', baseY: 0, amp: 3, freq: 0.6, step: 3, k1: 1, k2: 1 };
            rg.prop = propOf('tinyblock', 0.55 + rnd() * 0.35, 0.5, 1.4);
            rg.structure = null;
            rg.floor = 'grid';
            rg.fog = 0.0011 + rnd() * 0.0018;
        },
        // Standing on nothing much, under something enormous.
        cosmic: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.6 ? 'voidlit' : 'neon'));
            rg.prop = propOf(rnd() < 0.5 ? 'halo' : 'icosa', 0.02 + rnd() * 0.03, 0.8, 5, true);
            if (rnd() < 0.45) rg.structure = { key: 'platforms', step: 4 };
            rg.floor = rnd() < 0.5 ? 'grid' : 'plain';
            rg.fog = 0.0006 + rnd() * 0.0009;
            rg.wantsSky = 0x02020a;
            rg.wantsCelestial = true;
        },
        // Blame!: a hollow city with no outside and no floor plan.
        megastructure: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.6 ? 'concrete' : 'ash'));
            rg.ground = { kind: rnd() < 0.5 ? 'flat' : 'shelves', baseY: 0, amp: 8, freq: 0.7, step: 6, k1: 1, k2: 1 };
            rg.structure = { key: 'megastructure', step: 5 + Math.floor(rnd() * 3) };
            rg.prop = rnd() < 0.6 ? propOf(rnd() < 0.5 ? 'pipe' : 'ladder', 0.03, 0.8, 3.2) : null;
            rg.ceiling = { y: 300, lights: false };
            rg.floor = rnd() < 0.5 ? 'grid' : 'tiles';
            rg.text = rnd() < 0.5;
            rg.wantsSky = 0x0a0b0e;
            rg.fog = 0.0022 + rnd() * 0.0022;
        },
        carpark: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, 'concrete'));
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: 'carpark', step: 4 };
            rg.prop = propOf(rnd() < 0.5 ? 'cone' : 'lamppost', 0.04, 0.9, 1.4);
            rg.ceiling = { y: 22, lights: rnd() < 0.6 };
            rg.floor = 'plain';
            rg.fog = 0.004 + rnd() * 0.003;
        },
        hospital: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'chlorine' : 'fluorescent'));
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: rnd() < 0.5 ? 'waitingroom' : 'corridor', step: 3 };
            rg.prop = propOf('chair', 0.06, 0.9, 1.1);
            rg.ceiling = { y: 28, lights: true };
            rg.floor = 'lino';
            rg.text = rnd() < 0.6;
            rg.fog = 0.005 + rnd() * 0.003;
        },
        cathedral: (rg, rnd) => {
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: rnd() < 0.5 ? 'nave' : 'colonnade', step: 4 + Math.floor(rnd() * 2) };
            rg.prop = propOf(rnd() < 0.5 ? 'statue' : 'pillar', 0.03, 0.9, 2.4);
            rg.ceiling = rnd() < 0.5 ? { y: 120, lights: false } : null;
            rg.floor = rnd() < 0.5 ? 'checker' : 'tiles';
            rg.fog = 0.0018 + rnd() * 0.002;
        },
        factory: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'rust' : 'sodium'));
            rg.structure = { key: rnd() < 0.5 ? 'conveyor' : 'pipes', step: 3 + Math.floor(rnd() * 2) };
            rg.prop = propOf(rnd() < 0.5 ? 'pipe' : 'pylon', 0.04, 0.8, 2.2);
            rg.floor = 'grid';
            rg.fog = 0.003 + rnd() * 0.003;
        },
        datacentre: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'neon' : 'voidlit'));
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: 'serverfarm', step: 3 };
            rg.prop = propOf('glowcube', 0.03, 0.6, 1.6, true);
            rg.ceiling = { y: 34, lights: false };
            rg.floor = 'grid';
            rg.text = rnd() < 0.6;
            rg.fog = 0.0035 + rnd() * 0.003;
        },
        carnival: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'neon' : 'pastel'));
            rg.structure = { key: rnd() < 0.5 ? 'bigtop' : 'billboards', step: 4 };
            rg.prop = propOf(rnd() < 0.5 ? 'balloon' : 'flag', 0.05, 0.8, 2.6);
            rg.floor = 'stripes';
            rg.fog = 0.0016 + rnd() * 0.002;
        },
        sewer: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.6 ? 'mould' : 'concrete'));
            rg.ground = { kind: 'basin', baseY: -3, amp: 6, freq: 1.4, step: 3, k1: 1, k2: 1 };
            rg.structure = { key: rnd() < 0.5 ? 'aqueduct' : 'pipes', step: 3 };
            rg.prop = propOf('pipe', 0.05, 0.7, 1.8);
            rg.ceiling = { y: 30, lights: false };
            rg.floor = 'tiles';
            rg.fog = 0.005 + rnd() * 0.004;
        },
        tundra: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, 'ash'));
            rg.ground = { kind: rnd() < 0.5 ? 'dunes' : 'rolling', baseY: 0, amp: 10 + rnd() * 20, freq: 0.6, step: 4, k1: 2, k2: 2 };
            rg.prop = propOf(rnd() < 0.5 ? 'deadtree' : 'crystal', 0.02 + rnd() * 0.03, 0.7, 3);
            rg.structure = rnd() < 0.3 ? { key: 'henge', step: 5 } : null;
            rg.floor = 'plain';
            rg.fog = 0.0025 + rnd() * 0.003;
        },
        desert: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'sodium' : 'rust'));
            rg.ground = { kind: 'dunes', baseY: 0, amp: 16 + rnd() * 26, freq: 0.5, step: 4, k1: 2, k2: 3 };
            rg.prop = propOf(rnd() < 0.5 ? 'obelisk' : 'monolith', 0.015 + rnd() * 0.02, 0.8, 4);
            rg.structure = rnd() < 0.35 ? { key: rnd() < 0.5 ? 'henge' : 'scaffold', step: 5 } : null;
            rg.floor = 'plain';
            rg.fog = 0.0012 + rnd() * 0.0016;
        },
        fleshpit: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, 'flesh'));
            rg.ground = { kind: rnd() < 0.5 ? 'eggbox' : 'spikes', baseY: 0, amp: 8 + rnd() * 14, freq: 1.2, step: 3, k1: 3, k2: 2 };
            rg.prop = propOf(rnd() < 0.5 ? 'eye' : 'teeth', 0.05 + rnd() * 0.06, 0.6, 3.4);
            rg.structure = rnd() < 0.3 ? { key: 'ribcage', step: 4 } : null;
            rg.floor = 'plain';
            rg.fog = 0.003 + rnd() * 0.003;
        },
        garden: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'mould' : 'pastel'));
            rg.ground = { kind: 'rolling', baseY: 0, amp: 5 + rnd() * 10, freq: 0.9, step: 3, k1: 2, k2: 2 };
            rg.prop = propOf(rnd() < 0.5 ? 'tree' : 'mushroom', 0.06 + rnd() * 0.08, 0.6, 3);
            rg.structure = rnd() < 0.35 ? { key: rnd() < 0.5 ? 'hedgemaze' : 'colonnade', step: 4 } : null;
            rg.floor = rnd() < 0.5 ? 'carpet' : 'plain';
            rg.fog = 0.002 + rnd() * 0.002;
        },
        ruins: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'concrete' : 'rust'));
            rg.ground = { kind: 'shelves', baseY: 0, amp: 10, freq: 0.8, step: 5, k1: 2, k2: 2 };
            rg.structure = { key: rnd() < 0.5 ? 'colonnade' : 'scaffold', step: 4 };
            rg.prop = propOf(rnd() < 0.5 ? 'statue' : 'pillar', 0.04, 0.7, 2.6);
            rg.floor = 'tiles';
            rg.fog = 0.0022 + rnd() * 0.0025;
        },
        // The place a dream goes when it stops pretending. Nothing but the
        // floor, the fog and whatever is written on the air.
        blank: (rg, rnd) => {
            Object.assign(rg, rollPalette(rnd, rnd() < 0.5 ? 'ash' : 'voidlit'));
            rg.ground = { kind: 'flat', baseY: 0, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            rg.prop = rnd() < 0.5 ? propOf('bigtext', 0.006, 0.8, 2.2) : null;
            rg.structure = null;
            rg.floor = 'plain';
            rg.text = true;
            rg.fog = 0.004 + rnd() * 0.005;
        }
    };
    const KIND_KEYS = Object.keys(REGION_KINDS);

    /**
     * Turns what a region scatters into sprite art off the disk instead of
     * built geometry, taking the folders that kind of place reaches for first.
     * Heights are skewed small, so most of them are things you walk past and a
     * few are the size of a hill.
     */
    function rollBillboardProp(rg, rnd) {
        const taste = BILLBOARD_TASTE[rg.kind];
        const folders = (taste && taste.length) ? taste : BILLBOARD_FOLDERS;
        const folder = folders[Math.floor(rnd() * folders.length)];
        const names = BILLBOARDS[folder] || [];
        if (!names.length) return;
        const h = 8 + rnd() * rnd() * 52;
        const kept = rg.prop;
        rg.prop = {
            key: 'billboard',
            density: (kept ? kept.density : 0.02 + rnd() * 0.05) * 0.5,
            floats: false, minS: 0.7, maxS: 1.6, upright: true,
            sprite: {
                folder: folder,
                name: names[Math.floor(rnd() * names.length)],
                h: h, w: h * (0.6 + rnd() * 0.8)
            }
        };
    }

    /** The shorthand every region kind writes its scattered furniture with. */
    function propOf(key, density, minS, maxS, floats) {
        return { key: key, density: density, floats: !!floats, minS: minS, maxS: maxS, upright: true };
    }

    // =========================================================================
    // Rolling one dream.
    // =========================================================================

    /** Deterministic 0..1 stream for one dream. */
    function dreamRng(seed) {
        let s = (seed >>> 0) || 1;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    /**
     * Perlin sampled so it tiles exactly at the grid period (see _tileNoise).
     * The sample point is folded back into one period first: the warped
     * coordinates handed to it run off both ends of the grid, and the blend
     * only reads as a wrap for a point inside it.
     */
    function gridNoise(px, py, freq, W, H) {
        const x = ((px % W) + W) % W, y = ((py % H) + H) % H;
        const gx = x / W, gy = y / H;
        const nx = x * freq, ny = y * freq, nW = W * freq, nH = H * freq;
        const a = perlin2(nx, ny), b = perlin2(nx - nW, ny);
        const c = perlin2(nx, ny - nH), d = perlin2(nx - nW, ny - nH);
        return a * (1 - gx) * (1 - gy) + b * gx * (1 - gy)
             + c * (1 - gx) * gy + d * gx * gy;
    }

    /** A seed for the dream about to be had: this world's, salted per sleep. */
    function rollDreamSeed() {
        let base = 0;
        try {
            if (window.HistoryManager && window.HistoryManager.getSeed) {
                base = window.HistoryManager.getSeed() | 0;
            }
        } catch (e) { /* no history simulator loaded */ }
        return ((base ^ (Math.random() * 0xffffffff)) >>> 0) || 1;
    }

    /** "Pale Vestibule", "Endless Sublevel": two i18n pools. */
    function rollNames(rnd, count) {
        let adj = [], noun = [];
        try {
            adj = (T.pool ? T.pool('Dream.name.adj') : []) || [];
            noun = (T.pool ? T.pool('Dream.name.noun') : []) || [];
        } catch (e) { /* i18n not up yet */ }
        const out = [];
        for (let i = 0; i < count; i++) {
            const a = adj.length ? adj[Math.floor(rnd() * adj.length)] : '';
            const n = noun.length ? noun[Math.floor(rnd() * noun.length)] : '';
            out.push((a + ' ' + n).trim() || ('#' + (i + 1)));
        }
        return out;
    }

    /** One region of one dream: its colour, its ground, its furniture. */
    function rollRegion(rnd, moodKey, name, role) {
        const p = rollPalette(rnd, moodKey);
        const kind = GROUND_KEYS[Math.floor(rnd() * GROUND_KEYS.length)];
        const region = Object.assign({ name: name }, p, {
            ground: {
                kind: kind, baseY: 0,
                amp: 2 + rnd() * rnd() * 26,
                freq: 0.5 + rnd() * 2.2,
                step: 2 + rnd() * 7,
                k1: 1 + Math.floor(rnd() * 5),
                k2: 1 + Math.floor(rnd() * 5)
            },
            prop: null, structure: null, wall: false, water: false
        });

        if (role === 'water') {
            // A flooded region: a dip with a sheet of something over it.
            region.water = true;
            region.ground = { kind: 'rolling', baseY: -11 - rnd() * 9, amp: 1.5, freq: 1, step: 3, k1: 1, k2: 1 };
            return region;
        }
        if (role === 'wall') {
            // Solid blocks, cell by cell: the maze the grid threads corridors through.
            region.wall = true;
            region.ground = { kind: 'flat', baseY: 4 + rnd() * 5, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            return region;
        }

        // What stands about. Density is deliberately skewed low: a floor with
        // three things on it reads as somewhere, one with eighty reads as
        // scenery.
        if (rnd() < 0.88) {
            region.prop = {
                key: PROP_KEYS[Math.floor(rnd() * PROP_KEYS.length)],
                density: 0.012 + rnd() * rnd() * 0.10,
                floats: rnd() < 0.22,
                minS: 0.45 + rnd() * 0.4,
                maxS: 1.1 + rnd() * rnd() * 4.5,
                upright: rnd() < 0.82
            };
        }
        // Architecture, on its own coarse lattice.
        if (rnd() < 0.45) {
            region.structure = {
                key: STRUCT_KEYS[Math.floor(rnd() * STRUCT_KEYS.length)],
                step: 3 + Math.floor(rnd() * 4)
            };
        }
        return region;
    }

    /**
     * Builds one whole dream: its regions, the grid that lays them out, its
     * air, its floor, its writing and its guests.
     * @returns {object} handed straight to DreamScene.
     */
    function rollDream(seed) {
        const W = GRID_SIZE, H = GRID_SIZE;
        initPerlin(seed);
        const rnd = dreamRng((seed ^ 0x9e3779b9) >>> 0);
        const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

        // One or two colour registers a dream, so its regions read as parts of
        // the same place even when the place makes no sense.
        const moods = [pick(MOOD_KEYS)];
        if (rnd() < 0.6) moods.push(pick(MOOD_KEYS));

        const count = 4 + Math.floor(rnd() * 4);      // 4..7 regions
        const names = rollNames(rnd, count);
        const regions = [];
        let hasWater = false, hasWall = false;
        const kinds = KIND_KEYS.filter(k => k !== 'wild');
        for (let i = 0; i < count; i++) {
            // The first region is always walkable: it is where the sleeper opens
            // their eyes. At most one flood and one maze in any one dream.
            let role = 'ground';
            if (i > 0 && !hasWater && rnd() < 0.16) { role = 'water'; hasWater = true; }
            else if (i > 0 && !hasWall && rnd() < 0.18) { role = 'wall'; hasWall = true; }
            const rg = rollRegion(rnd, pick(moods), names[i], role);

            // What this region is ABOUT. Rolled per region rather than per
            // dream, which is what mixes the kinds of place together: one dream
            // holds a backrooms corridor, a drowned car park and a
            // megastructure going up out of sight behind both of them.
            if (role === 'ground') {
                rg.kind = rnd() < 0.28 ? 'wild' : kinds[Math.floor(rnd() * kinds.length)];
                if (REGION_KINDS[rg.kind]) REGION_KINDS[rg.kind](rg, rnd);
                // Some of what a region scatters is the game's own furniture art
                // standing up as a sprite rather than something built out of
                // boxes, which is what puts a stand of real trees, a row of
                // tombstones or a plush panda in the middle of a dream.
                if (rg.prop ? rnd() < 0.14 : rnd() < 0.05) rollBillboardProp(rg, rnd);
            } else {
                rg.kind = role;
            }
            // A drift region is a place the dream is thinking about leaving.
            // Stand in one and the whole world shifts to another dream, which
            // is how a sleeper wanders from one kind of place into the next
            // without ever finding a door.
            rg.drift = role === 'ground' && rnd() < 0.22;
            // What this region sounds like. Rolled per region rather than per
            // dream, so the ambience changes underfoot as the sleeper crosses
            // from one place into the next.
            const bgs = bgsPool();
            rg.bgs = (bgs.length && rnd() < 0.86) ? bgs[Math.floor(rnd() * bgs.length)] : null;
            regions.push(rg);
        }

        // ---- what is wrong with this one ------------------------------------
        // A LEAK is somewhere else bleeding through: a corridor of backrooms
        // standing in the middle of a salt flat, with its own light, its own
        // floor and its own ceiling, ending in mid-air where it stops being
        // real. It is a region like any other, so everything it is made of
        // (props, architecture, collision, the ground under it) follows for
        // free; it is simply stamped over the grid rather than laid out by it.
        const leaks = [];
        const leakCount = rnd() < 0.55 ? 1 + Math.floor(rnd() * 3) : 0;
        const leakKinds = ['backrooms', 'office', 'carpark', 'hospital', 'sewer', 'datacentre',
            'factory', 'blank', 'escher', 'fleshpit'];
        for (let i = 0; i < leakCount; i++) {
            const kind = leakKinds[Math.floor(rnd() * leakKinds.length)];
            const rg = rollRegion(rnd, pick(moods), rollNames(rnd, 1)[0], 'ground');
            rg.kind = kind;
            if (REGION_KINDS[kind]) REGION_KINDS[kind](rg, rnd);
            rg.leak = true;
            rg.drift = false;
            const bgs = bgsPool();
            rg.bgs = bgs.length ? bgs[Math.floor(rnd() * bgs.length)] : null;
            regions.push(rg);
            leaks.push({ tag: regions.length - 1, cx: Math.floor(rnd() * W), cy: Math.floor(rnd() * H),
                         r: 3 + rnd() * 6, ragged: 0.35 + rnd() * 0.5 });
        }

        // A VOID is a hole with nothing under it. The floor of the region is so
        // far down that walking in is falling, and falling far enough is how a
        // sleeper leaves a dream the fast way.
        const voids = [];
        const voidCount = rnd() < 0.45 ? 1 + Math.floor(rnd() * 3) : 0;
        if (voidCount) {
            const rg = rollRegion(rnd, pick(moods), rollNames(rnd, 1)[0], 'ground');
            rg.kind = 'void';
            rg.prop = null; rg.structure = null; rg.bgs = null;
            rg.drift = false; rg.isVoid = true;
            rg.g0 = rg.g1 = rg.dark = rg.accent = rg.accent2 = rg.pale = 0x000000;
            rg.ground = { kind: 'flat', baseY: VOID_FLOOR - 400, amp: 1, freq: 1, step: 3, k1: 1, k2: 1 };
            regions.push(rg);
            const tag = regions.length - 1;
            for (let i = 0; i < voidCount; i++) {
                voids.push({ tag: tag, cx: Math.floor(rnd() * W), cy: Math.floor(rnd() * H),
                             r: 1.5 + rnd() * 3.5, ragged: 0.3 + rnd() * 0.4 });
            }
        }

        // ---- the layout ---------------------------------------------------
        // Region field: ONE broad shape, warped by a finer one so the borders
        // between regions wander rather than running in noise-shaped bands. The
        // fine shape only ever moves where the broad one is read, never adds to
        // it: summed in, it broke the dream into cell-sized confetti instead of
        // countries a sleeper can walk across.
        const F1 = 0.028 + rnd() * 0.018;
        const F2 = 0.070 + rnd() * 0.035;
        const warp = 3 + rnd() * 5;
        // The lattice a wall region is threaded into. A wall cell is a solid
        // monolith, so a wall REGION would be one slab of rock; cutting
        // corridors through it makes it the maze it is named for. Only a
        // spacing that divides the grid is used, so the lattice lines meet
        // themselves across the wrap the way the noise field does.
        const spacings = [3, 4, 5, 6].filter(n => W % n === 0 && H % n === 0);
        const lattice = spacings.length ? spacings[Math.floor(rnd() * spacings.length)] : 3;
        const latOffX = Math.floor(rnd() * lattice);
        const latOffY = Math.floor(rnd() * lattice);

        const grid = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const wx = x + gridNoise(x, y, F2, W, H) * warp;
                const wy = y + gridNoise(x + 37, y - 91, F2, W, H) * warp;
                const v = gridNoise(wx, wy, F1, W, H) * 2.4;
                const u = Math.max(0, Math.min(0.9999, 0.5 + v));
                let tag = Math.floor(u * count);
                if (regions[tag].wall &&
                    (x + latOffX) % lattice !== 0 && (y + latOffY) % lattice !== 0) {
                    tag = tag === 0 ? count - 1 : 0;
                }
                grid[y * W + x] = tag;
            }
        }

        // The leaks and the holes go over the top of the layout, because that
        // is what they are: not part of the plan of the place, but something
        // that has come through it. Stamped on the toroidal grid so a leak
        // that runs off one side comes back in on the other, like everything
        // else in a dream.
        const stamp = (blot) => {
            const rad = Math.ceil(blot.r + 2);
            for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                    const d = Math.hypot(dx, dy);
                    const x = ((blot.cx + dx) % W + W) % W, y = ((blot.cy + dy) % H + H) % H;
                    // A ragged edge, cell by cell, so a leak has no clean rim.
                    if (d > blot.r * (1 - blot.ragged * 0.5 + hash01(x, y, 11) * blot.ragged)) continue;
                    grid[y * W + x] = blot.tag;
                }
            }
        };
        for (const b of leaks) stamp(b);
        for (const b of voids) stamp(b);

        // Which region the dream is mostly made of decides its sky. A leak or a
        // hole never wins that vote: they are not what the place IS.
        const counts = new Array(regions.length).fill(0);
        for (let i = 0; i < grid.length; i++) counts[grid[i]]++;
        let dominant = 0;
        for (let i = 1; i < count; i++) if (counts[i] > counts[dominant]) dominant = i;

        // ---- what the regions ask of the whole dream -----------------------
        // Fog, sky and the floor treatment cannot be argued about cell by cell,
        // so the region the sleeper is mostly standing in wins them. Ceilings
        // and lids of water CAN be local, and are: they are laid over their own
        // region's cells only (see _buildLids).
        const dom = regions[dominant];

        // ---- what hangs over it ---------------------------------------------
        // ONE black hole to a dream at the very most, and it is never anywhere
        // but nearest: it stands inside the world's own period, close enough to
        // fly to. Everything else a dream puts in its sky - planets, exotic
        // stars, a nebula - keeps station far outside that period, so however
        // the sleeper wanders the hole is the nearest thing up there.
        const celestials = [];
        const wantsHole = regions.some(r => r.wantsCelestial) ? rnd() < 0.62 : rnd() < 0.16;
        if (wantsHole) {
            celestials.push({
                kind: 'blackhole', near: true,
                radius: 60 + rnd() * rnd() * 620,
                height: 150 + rnd() * 380,
                seed: Math.floor(rnd() * 0xffffff)
            });
        }
        const farCount = rnd() < 0.62 ? 1 + Math.floor(rnd() * 3) : 0;
        for (let i = 0; i < farCount; i++) {
            celestials.push({
                kind: rnd() < 0.62 ? 'planet' : (rnd() < 0.45 ? 'nebula' : 'star'),
                near: false,
                radius: 180 + rnd() * rnd() * 1400,
                // Far enough out that nothing here is ever nearer than a hole
                // standing inside the world period (see _updateCelestials).
                dist: 4200 + rnd() * 3400 + i * 900,
                bearing: rnd() * TAU,
                height: 900 + rnd() * 2600,
                type: PLANET_TYPES[Math.floor(rnd() * PLANET_TYPES.length)],
                seed: Math.floor(rnd() * 0xffffff)
            });
        }

        // ---- the laws this one is under -------------------------------------
        const laws = {};
        const lawCount = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < lawCount; i++) laws[DREAM_LAWS[Math.floor(rnd() * DREAM_LAWS.length)]] = true;
        // A dream cannot be both light and heavy at once, and if it tries, it
        // is light: falling for ever is the more dreamlike of the two.
        if (laws.lowGravity) delete laws.heavy;

        const seList = (arr, n) => {
            const out = [];
            for (let i = 0; i < n; i++) out.push(arr[Math.floor(rnd() * arr.length)]);
            return out;
        };
        const dream = {
            seed: seed, width: W, height: H, grid: grid,
            regions: regions, dominant: dominant, name: dom.name,
            theme: dom.kind || 'wild',
            sky: dom.wantsSky !== undefined ? dom.wantsSky : dom.sky,
            fog: dom.fog !== undefined ? dom.fog : 0.0009 + rnd() * 0.0022,
            celestials: celestials,
            laws: laws,
            // The weather a sky has never had. Two thirds of dreams have some.
            weather: rnd() < 0.66 ? {
                kind: WEATHER_KEYS[Math.floor(rnd() * WEATHER_KEYS.length)],
                tint: hslHex(rnd(), 0.2 + rnd() * 0.6, 0.45 + rnd() * 0.45),
                scale: 0.6 + rnd() * rnd() * 3.4
            } : null,
            // The kit of sounds this dream hangs on the things in it, dealt
            // fresh so no two dreams are heard the same way.
            sfx: {
                voice: seList(DREAM_SE_VOICE, 3),
                noise: seList(DREAM_SE_NOISE, 3),
                hit: seList(DREAM_SE_HIT, 2),
                gone: seList(DREAM_SE_GONE, 2),
                pitch: 60 + rnd() * 80,      // the register the whole dream speaks in
                spread: 10 + rnd() * 40
            },
            // The figures standing about in it, and how much of the art each
            // source supplies. A dream with no walking sprites is all monsters.
            // The figures standing about, and where each one's art comes from.
            // The monster cards under img/enemies/Dreams are the dream's own
            // art and nothing else in the game shows them, so the mix is tilted
            // their way: a walking sprite is a face the player has met already.
            apparitions: {
                count: 22 + Math.floor(rnd() * 30),
                npcShare: 0.14 + rnd() * 0.3,
                talkative: 0.55 + rnd() * 0.4
            },
            floor: {
                kind: dom.floor || FLOOR_KINDS[Math.floor(rnd() * FLOOR_KINDS.length)],
                seed: Math.floor(rnd() * 0xffffff)
            },
            // Whether the dream writes on its own walls.
            wallText: regions.some(r => r.text) || rnd() < 0.35,
            // Furniture out of the other games. Rare enough to be a surprise,
            // common enough that a long dream always meets some.
            guests: (() => {
                const n = 1 + Math.floor(rnd() * 3);
                const out = [];
                for (let i = 0; i < n; i++) {
                    const k = GUEST_KEYS[Math.floor(rnd() * GUEST_KEYS.length)];
                    if (out.indexOf(k) < 0) out.push(k);
                }
                if (rnd() < 0.22) out.push('camper');
                return out;
            })(),
            guestCount: 10 + Math.floor(rnd() * 26)
        };
        return dressForDread(dream, rnd);
    }

    // =========================================================================
    // What sleep debt does to a dream.
    //
    // Nothing here rolls a different dream: the same seed builds the same
    // place, and then the place is DRESSED for the state the sleeper is in. The
    // colour is pulled down toward a bloodless dark, the air thickens, the
    // laws that make a dream feel watched are forced on rather than left to
    // chance, and the register everything speaks in drops. At a day awake it is
    // barely a tint; at a week it is not somewhere anybody would want to be.
    // =========================================================================
    function mixHex(a, b, t) {
        const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const c = Math.round(ab + (bb - ab) * t);
        return (r << 16) | (g << 8) | c;
    }

    // Where every colour in a dreadful dream is heading: an almost-black with
    // the last of the blood left in it.
    const DREAD_INK = 0x0b0508;
    const DREAD_LAWS_BY_STAGE = [
        ['watched'],                           // a day awake: it is looking back
        ['watched', 'echo'],                   // two days
        ['watched', 'echo', 'swarm'],          // most of a week
        ['watched', 'echo', 'swarm', 'stutter']
    ];

    function dressForDread(dream, rnd) {
        const dread = (window.DreamSystem && window.DreamSystem.dread) ? window.DreamSystem.dread() : 0;
        dream.dread = dread;
        if (dread <= 0) return dream;

        const pull = 0.30 + dread * 0.52;      // how far toward the ink everything goes
        const FIELDS = ['g0', 'g1', 'sky', 'accent', 'accent2', 'dark', 'pale'];
        for (const rg of dream.regions) {
            if (rg.isVoid) continue;            // a hole is already nothing
            for (const f of FIELDS) {
                if (typeof rg[f] === 'number') rg[f] = mixHex(rg[f], DREAD_INK, pull);
            }
            if (typeof rg.wantsSky === 'number') rg.wantsSky = mixHex(rg.wantsSky, DREAD_INK, pull);
            // Whatever glowed in it glows harder, which is the only light left.
            rg.glow = Math.min(1, (rg.glow || 0) + dread * 0.3);
        }
        dream.sky = mixHex(dream.sky, DREAD_INK, pull);
        // The air closes in: at a week awake nothing is visible past the
        // handful of things standing nearest.
        dream.fog = (dream.fog || 0.0015) * (1 + dread * 2.6);

        // The laws that make a place feel occupied stop being a roll.
        const laws = DREAD_LAWS_BY_STAGE[Math.min(DREAD_LAWS_BY_STAGE.length - 1,
            Math.floor(dread * DREAD_LAWS_BY_STAGE.length))];
        for (const law of laws) dream.laws[law] = true;
        delete dream.laws.lowGravity;           // nothing is light about this

        // What the place is heard as: the pool a dream normally draws its
        // ambience from is every biome in the world, and a field of wheat is
        // not what a mind three days without sleep is standing in. The dreadful
        // half of the pool takes over as the debt grows.
        for (const rg of dream.regions) {
            if (rnd() < 0.35 + dread * 0.6) {
                rg.bgs = DREAM_BGS_FALLBACK[Math.floor(rnd() * DREAM_BGS_FALLBACK.length)];
            }
        }

        // It talks more, lower, and it does not stop.
        dream.apparitions.talkative = Math.min(1, dream.apparitions.talkative + dread * 0.45);
        dream.sfx.pitch = Math.max(30, dream.sfx.pitch - dread * 45);

        // A sky that had nothing wrong with it gets weather anyway.
        if (!dream.weather) {
            dream.weather = {
                kind: WEATHER_KEYS[Math.floor(rnd() * WEATHER_KEYS.length)],
                tint: mixHex(0x884050, DREAD_INK, 0.3),
                scale: 0.8 + rnd() * 1.6
            };
        } else {
            dream.weather.tint = mixHex(dream.weather.tint, DREAD_INK, pull * 0.7);
        }
        return dream;
    }

    // =========================================================================
    // On-foot / flight first-person controller.
    // =========================================================================
    class DreamController {
        constructor(camera, scene) {
            this.camera = camera;
            this.scene = scene;
            this.yaw = new THREE.Group();
            this.pitch = new THREE.Group();
            this.yaw.add(this.pitch);
            this.pitch.add(camera);
            scene.add(this.yaw);
            camera.position.set(0, 0, 0);
            camera.rotation.set(0, 0, 0);

            this.move = { f: false, b: false, l: false, r: false, sprint: false, up: false, down: false };
            this.vy = 0;
            // The sleeper carries horizontal speed of their own rather than
            // being teleported a step a frame: it is what gives a jump an arc
            // you can steer, a landing that keeps its momentum and a wall kick
            // that actually throws you off the wall.
            this.vx = 0;
            this.vz = 0;
            this.onGround = true;
            this.flying = false;
            this.isLocked = false;
            this.getGroundY = null;     // (x,z) => terrain height
            this.getSolids = null;      // (x,z,out) => fills out with nearby solids
            this.eye = 9;               // how far the eyes are above the feet
            this.radius = 4.2;          // how wide the sleeper is
            this.gravity = 200;         // which a dream is entitled to change
            this.headroom = 2.5;        // how far the head is above the eyes
            this.spaceHeld = false;

            // ---- what a jump is ------------------------------------------
            // The kick, and then three forgivenesses: a press taken a moment
            // before landing is remembered until it can be spent, a press taken
            // a moment after walking off an edge still counts as a jump off it,
            // and letting go early cuts the rise short, so a tap is a hop and a
            // hold is a jump. Falling is heavier than rising, which is what
            // makes the arc read as a jump rather than as a lob.
            this.jumpSpeed = 78;
            this.jumpCut = 0.42;        // what is left of the rise when SPACE is let go
            this.fallBoost = 1.85;      // gravity while falling, against gravity while rising
            this.terminal = 640;        // fastest a dream lets anyone fall
            this.coyote = 0.13;         // seconds off an edge a jump still works
            this.buffer = 0.16;         // seconds early a jump may be asked for
            this.coyoteTimer = 0;
            this.jumpBuffer = -1;
            this.jumpCutPending = false;
            this.airControl = 0.34;     // how much of the ground's steering is left in the air
            // Wall running: the last surface pushed against, and how long ago.
            // Together they are what a second jump in mid-air is bought with.
            this.wallN = { x: 0, z: 0 };
            this.wallAge = 99;
            // Walking face-first into a wall, LSD-emulator style: how long the
            // sleeper has been pushing into one, and the direction they are
            // asking to go in, which is what says pushing from brushing past.
            this.wallPush = 0;
            // Walked into a wall, let go, walked into it again: each fresh
            // shove is counted, and enough of them inside the window is the
            // same request as one long lean (see _countBumps).
            this.wallBumps = 0;
            this.bumpTimer = 0;
            this._wasPushing = false;
            this._wishX = 0;
            this._wishZ = 0;
            this._solids = [];
            // Y on a pad is what SPACE is at the keyboard: held it climbs, and
            // a double tap takes off. Kept apart from spaceHeld, which also
            // means "the engine read this as the action button, do not swing".
            this.padRise = false;
            this.padSink = false;
            this._padYWas = false;

            this._onMouseMove = this._onMouseMove.bind(this);
            this._onClick = this._onClick.bind(this);
            this._onKeyDown = this._onKeyDown.bind(this);
            this._onKeyUp = this._onKeyUp.bind(this);
            this._onPLChange = this._onPLChange.bind(this);
            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('click', this._onClick);
            document.addEventListener('keydown', this._onKeyDown);
            document.addEventListener('keyup', this._onKeyUp);
            document.addEventListener('pointerlockchange', this._onPLChange);

            // Double-tap SPACE -> toggle flight; single tap -> jump. The jump is
            // taken on the FIRST tap and never deferred waiting to see whether a
            // second one is coming: a jump that arrives 200ms after the button
            // is not a jump. `_flightArmed` records whether the pair began with
            // both feet down, which is the only way flight is ever switched on:
            // a double tap taken in mid-air is a wall kick, never take-off.
            this._lastSpace = -1e9;
            this._flightArmed = false;
        }

        setStart(x, y, z) {
            this.yaw.position.set(x, y, z);
            this.vx = this.vy = this.vz = 0;
            this.jumpBuffer = -1;
            this.coyoteTimer = 0;
            this.jumpCutPending = false;
            this.wallPush = 0;
            this.wallBumps = 0;
            this.bumpTimer = 0;
            this._wasPushing = false;
        }

        /** SPACE at the keyboard, Y on a pad: the same request, either way. */
        isRising() { return this.spaceHeld || this.padRise; }

        _onMouseMove(e) {
            if (!this.isLocked) return;
            const mx = e.movementX || 0, my = e.movementY || 0;
            this.yaw.rotation.y -= mx * 0.0022;
            this.pitch.rotation.x -= my * 0.0022;
            this.pitch.rotation.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch.rotation.x));
        }
        _menuOpen() { return !!(window.DreamSystem && window.DreamSystem._scene && window.DreamSystem._scene._menuOpen); }
        _onClick() { if (dreamActive && !this.isLocked && !this._menuOpen()) document.body.requestPointerLock(); }
        _onPLChange() {
            const was = this.isLocked;
            this.isLocked = document.pointerLockElement === document.body;
            // The first Escape never reaches the page: the browser spends it
            // releasing the pointer lock. Losing the lock IS the request to
            // wake, which is what makes one press enough.
            if (was && !this.isLocked && dreamActive && !this._menuOpen()) {
                const scene = window.DreamSystem && window.DreamSystem._scene;
                if (scene && scene._openWakePrompt) scene._openWakePrompt();
            }
        }

        _onKeyDown(e) {
            if (!dreamActive || this._menuOpen()) return;
            switch (e.code) {
                case 'KeyW': this.move.f = true; break;
                case 'KeyS': this.move.b = true; break;
                case 'KeyA': this.move.l = true; break;
                case 'KeyD': this.move.r = true; break;
                case 'ShiftLeft': case 'ShiftRight': this.move.sprint = true; break;
                case 'ControlLeft': case 'ControlRight': this.move.down = true; break;
                case 'Space':
                    e.preventDefault();
                    // Space is 'ok' to the engine as well as jump/fly here, so
                    // the weapon has to be told not to read this one as the
                    // action button (see DreamWeapon.update).
                    this.spaceHeld = true;
                    // A held key repeats keydown, and every repeat used to read
                    // as another tap: holding SPACE to jump toggled flight on
                    // and off several times a second.
                    if (!e.repeat) this._handleSpace();
                    break;
            }
        }
        _onKeyUp(e) {
            if (!dreamActive) return;
            switch (e.code) {
                case 'KeyW': this.move.f = false; break;
                case 'KeyS': this.move.b = false; break;
                case 'KeyA': this.move.l = false; break;
                case 'KeyD': this.move.r = false; break;
                case 'ShiftLeft': case 'ShiftRight': this.move.sprint = false; break;
                case 'ControlLeft': case 'ControlRight': this.move.down = false; break;
                case 'Space': this.spaceHeld = false; break;
            }
        }

        _handleSpace() {
            const now = performance.now();
            const doubleTap = (now - this._lastSpace) < 320;
            this._lastSpace = now;

            if (this.flying) {
                // In the air under one's own power: a double tap sets you down
                // again, and a held SPACE climbs (read in update).
                if (doubleTap) this.setFlying(false);
                return;
            }
            if (doubleTap && this._flightArmed) {
                this.setFlying(true);
                return;
            }
            // A pair may only become flight if it BEGAN with both feet down.
            // A second tap taken in mid-jump therefore reaches the wall kick
            // below instead of switching flight on under the sleeper.
            this._flightArmed = this.onGround || this.coyoteTimer > 0;
            this.requestJump();
        }

        /**
         * A jump asked for. If it cannot be taken this instant it is REMEMBERED
         * for `buffer` seconds, so a press made just before landing goes off on
         * the landing rather than being swallowed.
         */
        requestJump() {
            this.jumpBuffer = this.buffer;
            this._tryJump();
        }

        _tryJump() {
            if (this.flying) return false;
            if (this.onGround || this.coyoteTimer > 0) {
                this.vy = this.jumpSpeed;
                this.onGround = false;
                this.coyoteTimer = 0;
                this.jumpBuffer = -1;
                this.jumpCutPending = true;
                return true;
            }
            // Off a wall the sleeper is facing, as many times as there is wall
            // to kick off: which is how you climb a dream. The kick is speed,
            // not a nudge, so it carries you clear of the surface.
            if (this.canWallJump()) {
                this.vy = this.jumpSpeed * 0.94;
                this.vx += this.wallN.x * 62;
                this.vz += this.wallN.z * 62;
                this.yaw.position.x += this.wallN.x * 1.5;
                this.yaw.position.z += this.wallN.z * 1.5;
                this.wallAge = 99;
                this.jumpBuffer = -1;
                this.jumpCutPending = true;
                if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
                return true;
            }
            return false;
        }

        /** Flight is stated rather than flipped, since only one way is gated. */
        setFlying(on) {
            if (!!on === this.flying) return;
            this.flying = !!on;
            // Whatever speed was being carried is kept in both directions: you
            // take off out of a run and you drop out of the sky still moving.
            this.vy = 0;
            this.jumpCutPending = false;
            if (typeof SoundManager !== 'undefined') {
                this.flying ? SoundManager.playOk() : SoundManager.playCancel();
            }
        }

        toggleFlight() { this.setFlying(!this.flying); }

        /**
         * The pad, read raw once a frame: the right stick looks about, Y is
         * the jump (and a double tap of it is flight), L1 sinks while flying.
         * The left stick is read in update() with the rest of the movement.
         *
         * The d-pad is NOT movement in a dream: up and down on it change what
         * is in the sleeper's hand (DreamWeapon), which is why every direction
         * here comes off the stick rather than off Input's folded directions.
         */
        _updatePad(delta) {
            const p = padHelper();
            if (!p || this._menuOpen()) { this.padRise = false; this._padYWas = false; return; }
            const B = p.BUTTON;
            // Edged against this loop, not against the engine's: see padEdge.
            // A single tap of Y read twice would be a double tap, and a double
            // tap is take-off.
            const y = p.isButtonPressed(B.Y);
            if (y && !this._padYWas) this._handleSpace();
            this._padYWas = y;
            this.padRise = y;
            // L1 is the other end of Y: it takes the flier back down, the way
            // CTRL does at the keyboard. Kept apart from move.down, which only
            // a key release is ever allowed to clear.
            this.padSink = p.isButtonPressed(B.LB);

            const rx = p.rightX(), ry = p.rightY();
            if (rx || ry) {
                // Squared response: the middle of the stick's throw is for
                // aiming and the edge of it is for turning round.
                this.yaw.rotation.y -= rx * Math.abs(rx) * PAD_LOOK_X * delta;
                this.pitch.rotation.x -= ry * Math.abs(ry) * PAD_LOOK_Y * delta;
                this.pitch.rotation.x = Math.max(-Math.PI / 2 + 0.05,
                    Math.min(Math.PI / 2 - 0.05, this.pitch.rotation.x));
            }
        }

        update(delta) {
            const pad = padHelper();
            // The d-pad is the weapon rack in here, so a press on it is not a
            // request to walk anywhere, even though the engine folds the same
            // directions in from the stick.
            const dpadY = pad && (pad.isButtonPressed(pad.BUTTON.DPAD_UP) ||
                                  pad.isButtonPressed(pad.BUTTON.DPAD_DOWN));
            this._updatePad(delta);

            // The left stick, as an analog LEAN rather than as four more
            // buttons: half a push is half the speed, which is the whole reason
            // to hold a stick instead of a key. While it is being pushed the
            // engine's own directions are ignored, because core folds this very
            // stick into them and reading both would put every walk back to a
            // flat full speed.
            const stickX = pad ? pad.leftX() : 0;
            const stickY = pad ? pad.leftY() : 0;   // grows downward
            const onStick = !!(stickX || stickY);
            const key = (name) => !onStick && Input.isPressed(name);

            const fwd = (this.move.f || (key('up') && !dpadY)) ? 1 : 0;
            const back = (this.move.b || (key('down') && !dpadY)) ? 1 : 0;
            const lft = (this.move.l || key('left')) ? 1 : 0;
            const rgt = (this.move.r || key('right')) ? 1 : 0;
            const sprint = this.move.sprint || Input.isPressed('shift') ||
                (pad && pad.isButtonPressed(pad.BUTTON.L3));

            let dz = fwd - back;          // forward axis
            let dx = rgt - lft;           // strafe axis
            dx += stickX;
            dz -= stickY;
            // How hard the sleeper is asking, 0 to 1. The direction is
            // normalised below; this is what is left of the stick's throw.
            const lean = Math.min(1, Math.hypot(dx, dz));
            // A pressed jump keeps for a moment: on landing, or on a wall found
            // a fraction of a second later, it goes off by itself.
            if (this.jumpBuffer > 0) {
                this.jumpBuffer -= delta;
                if (!this.flying) this._tryJump();
            }

            if (this.flying) {
                // A wall met in the air is a wall; only a wall walked into on
                // foot is a way out of the dream.
                this.wallPush = 0;
                this._wishX = this._wishZ = 0;
                const spd = 150 * (sprint ? 1.9 : 1);
                // Fly along the full look direction (pitch included) for W/S.
                const dir = new THREE.Vector3();
                this.camera.getWorldDirection(dir);
                const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
                // Where the sleeper is asking to go, and then an approach to it
                // rather than a jump to it: flight that answers instantly reads
                // as a cursor being dragged, not as flying.
                let tx = dir.x * dz * spd + right.x * dx * spd;
                let ty = dir.y * dz * spd;
                let tz = dir.z * dz * spd + right.z * dx * spd;
                // SPACE / Y climbs and CTRL / L1 sinks, whatever the head is
                // pointed at.
                if (this.isRising()) ty += spd * 0.85;
                if (this.move.down || this.padSink) ty -= spd * 0.85;
                const k = 1 - Math.exp(-6.5 * delta);
                this.vx += (tx - this.vx) * k;
                this.vy += (ty - this.vy) * k;
                this.vz += (tz - this.vz) * k;
                this.yaw.position.x += this.vx * delta;
                this.yaw.position.y += this.vy * delta;
                this.yaw.position.z += this.vz * delta;
                // Never sink below the ground.
                const gy = (this.getGroundY ? this.getGroundY(this.yaw.position.x, this.yaw.position.z) : 0) + this.eye;
                if (this.yaw.position.y < gy) {
                    this.yaw.position.y = gy;
                    if (this.vy < 0) this.vy = 0;
                }
            } else {
                const spd = 74 * (sprint ? 1.85 : 1);
                // Where the sleeper is asking to go, on the horizontal plane
                // relative to yaw only.
                let tx = 0, tz = 0;
                if (dx || dz) {
                    const sinY = Math.sin(this.yaw.rotation.y), cosY = Math.cos(this.yaw.rotation.y);
                    const wx = (dx * cosY - dz * sinY);
                    const wz = (-dz * cosY - dx * sinY);
                    const len = Math.hypot(wx, wz) || 1;
                    // Direction from the stick, speed from how far it is
                    // pushed: a key is always a full push, so nothing changes
                    // at the keyboard.
                    tx = (wx / len) * spd * lean;
                    tz = (wz / len) * spd * lean;
                }
                // Kept unit-length and unscaled by speed: the wall test asks
                // which way the sleeper is leaning, not how fast.
                const wish = Math.hypot(tx, tz) || 1;
                this._wishX = tx / wish;
                this._wishZ = tz / wish;
                // On the ground the sleeper goes where they are told almost at
                // once, and stops nearly as fast. In the air only a third of
                // that authority is left, and with nothing asked for there is
                // hardly any drag at all: a jump keeps the run-up that bought
                // it and is steered rather than driven.
                const asking = !!(dx || dz);
                const rate = this.onGround ? (asking ? 20 : 14)
                    : (asking ? 20 * this.airControl : 0.8);
                const k = 1 - Math.exp(-rate * delta);
                this.vx += (tx - this.vx) * k;
                this.vz += (tz - this.vz) * k;
                this.yaw.position.x += this.vx * delta;
                this.yaw.position.z += this.vz * delta;

                // Letting go of SPACE (or of Y) while still rising cuts the
                // rise: a tap is a hop, a hold is the whole jump.
                if (this.jumpCutPending && !this.isRising()) {
                    this.jumpCutPending = false;
                    if (this.vy > 0) this.vy *= this.jumpCut;
                }
                if (this.vy <= 0) this.jumpCutPending = false;
                // Falling is heavier than rising. Without it the top of the arc
                // hangs and the whole jump feels like it is underwater.
                const g = this.gravity * (this.vy < 0 ? this.fallBoost : 1);
                this.vy -= g * delta;
                if (this.vy < -this.terminal) this.vy = -this.terminal;
                this.yaw.position.y += this.vy * delta;
                this.collide(delta);
                // Walked off something: a jump is still owed for a moment after
                // the ground has gone, so an edge taken at a run is not a fall.
                if (this.onGround) this.coyoteTimer = this.coyote;
                else this.coyoteTimer -= delta;
            }
            this._countBumps(delta);
        }

        /**
         * How many separate times the sleeper has walked into something. One
         * long lean opens a dream on its own (wallPush, in the scene's loop);
         * this is the other way of asking, which is what somebody actually
         * does at a wall: walk into it, back off, walk into it again. The tally
         * forgets itself after WALL_BUMP_WINDOW seconds of not being added to,
         * so a day of incidental bumping never adds up to a door.
         */
        _countBumps(delta) {
            const pushing = this.wallPush > 0;
            if (pushing && !this._wasPushing) {
                this.wallBumps++;
                this.bumpTimer = WALL_BUMP_WINDOW;
            }
            this._wasPushing = pushing;
            if (this.bumpTimer > 0) {
                this.bumpTimer -= delta;
                if (this.bumpTimer <= 0) this.wallBumps = 0;
            }
        }

        /**
         * Puts the sleeper outside anything they have walked into, on top of
         * anything they have landed on and under anything they have jumped into.
         *
         * The sleeper is a box, `radius` wide and standing from the feet to
         * `eye + headroom`. Every solid is an axis-aligned box, so a contact is
         * resolved along whichever axis it is shallowest on, which is what makes
         * a corner slide rather than stick. Anything whose top is within
         * STEP_UP of the feet is climbed instead of blocked, so kerbs, stairs
         * and a floor of small props are walked over rather than fought.
         */
        collide(delta) {
            const STEP_UP = 6.5;
            const p = this.yaw.position;
            let ground = this.getGroundY ? this.getGroundY(p.x, p.z) : 0;
            this.wallAge += delta;

            const list = this._solids;
            list.length = 0;
            // The height goes with the question: over the ground the world is
            // stacked in levels, and only the ones the sleeper is standing in
            // are worth a collision test.
            if (this.getSolids) this.getSolids(p.x, p.z, list, p.y);

            const R = this.radius;
            // How far above the feet a surface may still be and count as
            // something to stand on. A kerb's worth by default, but a falling
            // sleeper is caught by anything they crossed this frame: without
            // that, a long drop steps THROUGH a platform at 40 units a frame
            // and is pushed out sideways instead of landing on it.
            const catchUp = this.vy < 0 ? Math.max(STEP_UP, -this.vy * delta + 1) : STEP_UP;

            // Two passes: the first finds what is underfoot, the second pushes
            // out of what is left. Done the other way round, a step would be
            // shoved through rather than climbed.
            let feet = p.y - this.eye;
            for (let i = 0; i < list.length; i++) {
                const b = list[i];
                if (Math.abs(p.x - b.x) > b.hx + R || Math.abs(p.z - b.z) > b.hz + R) continue;
                if (b.y1 <= feet + catchUp && b.y1 > ground) ground = b.y1;
            }
            if (p.y - this.eye <= ground) {
                p.y = ground + this.eye;
                if (this.vy < 0) this.vy = 0;
                this.onGround = true;
                this.jumpCutPending = false;
            } else {
                this.onGround = false;
            }

            feet = p.y - this.eye;
            const head = p.y + this.headroom;
            let hitWall = false;
            for (let i = 0; i < list.length; i++) {
                const b = list[i];
                if (b.y0 >= head || b.y1 <= feet + 0.4) continue;      // clear above or below
                const dx = p.x - b.x, dz = p.z - b.z;
                const ox = (b.hx + R) - Math.abs(dx);
                const oz = (b.hz + R) - Math.abs(dz);
                if (ox <= 0 || oz <= 0) continue;
                if (b.y1 <= feet + catchUp) continue;                  // stood on, not walked into
                if (b.y0 > feet && b.y0 < head && this.vy > 0) {
                    // Jumped into an underside: stop dead rather than climb it.
                    p.y = b.y0 - this.headroom - 0.01;
                    this.vy = 0;
                    continue;
                }
                if (ox < oz) {
                    const sign = dx < 0 ? -1 : 1;
                    p.x = b.x + sign * (b.hx + R + 0.01);
                    this.wallN.x = sign; this.wallN.z = 0;
                    // Kill the speed that ran into it and keep the speed that
                    // did not, so a corner is slid along rather than stuck to.
                    if (this.vx * sign < 0) this.vx = 0;
                } else {
                    const sign = dz < 0 ? -1 : 1;
                    p.z = b.z + sign * (b.hz + R + 0.01);
                    this.wallN.x = 0; this.wallN.z = sign;
                    if (this.vz * sign < 0) this.vz = 0;
                }
                this.wallAge = 0;
                hitWall = true;
            }

            // A wall walked STRAIGHT into is a door in a dream. The contact
            // normal points back out of the surface, so leaning on it means the
            // asked-for direction runs against that normal; a wall clipped
            // while running past it, or slid along a corner, never does. Only
            // on foot: in mid-air the same contact is a wall kick, and in
            // flight a wall is only a wall.
            if (hitWall && this.onGround && !this.flying &&
                (this._wishX * this.wallN.x + this._wishZ * this.wallN.z) < -0.55) {
                this.wallPush += delta;
            } else {
                this.wallPush = 0;
            }
        }

        /**
         * A wall is only a foothold while the sleeper is looking at it: the
         * contact normal points back out of the surface, so facing it means the
         * look direction runs against that normal.
         */
        canWallJump() {
            if (this.onGround || this.flying) return false;
            if (this.wallAge > 0.25) return false;
            const dir = new THREE.Vector3();
            this.camera.getWorldDirection(dir);
            return (dir.x * this.wallN.x + dir.z * this.wallN.z) < -0.25;
        }

        dispose() {
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('click', this._onClick);
            document.removeEventListener('keydown', this._onKeyDown);
            document.removeEventListener('keyup', this._onKeyUp);
            document.removeEventListener('pointerlockchange', this._onPLChange);
            if (document.pointerLockElement === document.body) document.exitPointerLock();
        }
    }

    // =========================================================================
    // The weapon in the sleeper's right hand.
    //
    // Drawn by the layer a battle draws a first-person weapon with, not by one
    // written for the dream: Sprite_3DWeapon over the shared WeaponThreeScene
    // overlay (Weapon3DOverlay.js), built, posed and swung by
    // WeaponSystemProcedural. It therefore idles, sways, kicks, ejects its
    // cases and sounds exactly as the same weapon does in a fight.
    //
    // Nothing is equipped on the actor: the dream hands the sleeper something
    // and takes it back when they wake.
    // =========================================================================
    const DREAM_WEAPON_Z = '10000';   // over the dream overlay's own 9999

    const DreamWeapon = {
        _sprite: null,
        _weapon: null,
        _held: false,       // the overlay reference this sleep holds
        _bag: null,         // every weapon in the database, shuffled
        _index: 0,
        _weirded: false,    // whether the thing in hand has been dressed yet

        available() {
            return !!(hasTHREE && window.Sprite_3DWeapon && window.WeaponThreeScene &&
                      window.WeaponSystemProcedural);
        },

        /** Raise the overlay for the whole sleep and deal the first weapon. */
        begin() {
            if (this._held || !this.available()) return;
            // ONE reference for the whole sleep. Re-rolling the weapon between
            // dreams would otherwise take the overlay's ref count to zero for a
            // moment, and each of those destroys and rebuilds a WebGL context:
            // the browser caps live contexts and force-loses the oldest, which
            // is the game's own canvas.
            window.WeaponThreeScene.ref();
            this._held = true;
            document.addEventListener('mousedown', this._onMouseDown);
            document.addEventListener('wheel', this._onWheel, { passive: true });
            this._bag = null;
            this.roll();
        },

        /** A new dream is a new thing in hand. */
        roll() {
            if (!this._held) return;
            const bag = this.bag();
            if (!bag.length) return;
            this._index = Math.floor(Math.random() * bag.length);
            this.equip(bag[this._index]);
        },

        /** Builds the model, and then makes it strange. */
        equip(weapon) {
            if (!weapon) return;
            // Same patch the battle spriteset applies before building one:
            // without it the procedural models, poses and motions are absent.
            WeaponSystemProcedural.patchSprite3DWeapon();
            if (this._sprite) this._sprite.terminate();
            this._weapon = weapon;
            this._sprite = new Sprite_3DWeapon(weapon);
            this._weirded = false;
            const canvas = window.WeaponThreeScene.canvas;
            if (canvas) canvas.style.zIndex = DREAM_WEAPON_Z;
        },

        /**
         * Every weapon in the database, shuffled once for the whole sleep: the
         * rack the d-pad steps through. Shuffled rather than sorted because a
         * dream's rack is not a shop's, and stepping it should never feel like
         * reading a list.
         */
        bag() {
            if (this._bag) return this._bag;
            const pool = [];
            if (typeof $dataWeapons !== 'undefined' && $dataWeapons) {
                for (const w of $dataWeapons) if (w && w.name) pool.push(w);
            }
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
            }
            this._bag = pool;
            return pool;
        },

        // ---- what a dream does to a weapon ----------------------------------
        // The model is the one a battle builds, and then every surface of it is
        // re-dressed out of the whole texture bank rather than out of the bank
        // its own material class draws from: a magic circle printed on a rifle
        // stock, fire on a mace head, a crystal on a bowstring. The textures
        // are the shared singletons the procedural system caches, so nothing is
        // uploaded twice and nothing is ever freed from under a real weapon;
        // only the materials, which the model owns, are touched.
        // 'dream' is the strange bank (img/dreamtextures/): faces, marbling,
        // things off a slide. It is listed twice so a sleeping weapon wears one
        // about a third of the time, which is often enough to be a rule of the
        // place and rare enough to still be a shock.
        WEIRD_CLASSES: ['gun', 'blade', 'heavy', 'wood', 'magic', 'default', 'dream', 'dream'],

        _weirdTexture() {
            const P = window.WeaponSystemProcedural;
            if (!P || !P.getTexturesForType) return null;
            const cls = this.WEIRD_CLASSES[Math.floor(Math.random() * this.WEIRD_CLASSES.length)];
            const list = P.getTexturesForType(cls) || [];
            if (!list.length) return null;
            return P.getTexture(list[Math.floor(Math.random() * list.length)]);
        },

        /**
         * @param {object} sprite the held Sprite_3DWeapon. Its model is built
         *   on the spot for a procedural weapon and loaded in the background
         *   for a GLB one, so this is attempted every frame until it lands.
         */
        _weird(sprite) {
            const model = sprite && sprite._model;
            if (!model || typeof model.traverse !== 'function') return false;
            // One hue for the whole thing, and every part a little off it: a
            // weapon dressed in six unrelated colours is confetti, and a dream
            // object has to read as one object before it reads as wrong.
            const hue = Math.random();
            const spread = 0.05 + Math.random() * 0.22;
            model.traverse((o) => {
                if (!o.isMesh || !o.material) return;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                for (const mat of mats) {
                    if (!mat) continue;
                    // Only the map is taken. How a surface blends is left
                    // exactly as the model built it: the glow shells and gem
                    // overlays are transparent on purpose, and forcing those
                    // opaque would board the weapon up rather than dress it.
                    const tex = this._weirdTexture();
                    if (tex) mat.map = tex;
                    // A dream has its own opinion about colour, and about which
                    // parts of a thing are lit from inside.
                    if (mat.color && mat.color.setHSL) {
                        mat.color.setHSL(hue + (Math.random() - 0.5) * spread,
                            0.35 + Math.random() * 0.5, 0.4 + Math.random() * 0.35);
                    }
                    if (mat.emissive && Math.random() < 0.28) {
                        mat.emissive.setHSL(hue + 0.5, 0.8, 0.35);
                        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0.6;
                    }
                    mat.needsUpdate = true;
                }
            });
            return true;
        },

        /**
         * The action button. No animation name is passed on purpose: a nameless
         * request means "whatever this weapon does", which WeaponSystemProcedural
         * answers from the weapon's own type and measured length, so a blade is
         * swung, a gun is fired and a bow is drawn.
         */
        swing() {
            const s = this._sprite;
            if (!s || !this._weapon) return;
            if (s._animData || s._clipPlaying) return;   // one blow at a time
            s.playAnimation(null);
            if (window.WeaponSounds) window.WeaponSounds.play(this._weapon);
            // What the blow reaches. A bow, a sling and a gun (weapon types 7,
            // 8 and 9) carry to the fog; everything else only as far as the
            // sleeper's own arm, which is the whole difference between the two
            // ways of meeting something in a dream.
            const t = this._weapon.wtypeId;
            const ranged = (t === 7 || t === 8 || t === 9);
            const scene = DreamSystem._scene;
            if (scene && scene.strike) scene.strike(ranged ? 'ranged' : 'melee');
        },

        /**
         * One step along the rack: UP and DOWN on the d-pad, the wheel, or L2.
         * A dream is never shown the rack itself, so what is in hand is simply
         * something else now, and it is announced, because otherwise the swap
         * is only visible once the sleeper swings.
         */
        step(dir) {
            const now = performance.now();
            if (now - (this._swapAt || 0) < 180) return;   // one weapon a flick of the wheel
            this._swapAt = now;
            const bag = this.bag();
            if (bag.length < 2) return;
            this._index = ((this._index + dir) % bag.length + bag.length) % bag.length;
            this.equip(bag[this._index]);
            if (typeof SoundManager !== 'undefined') SoundManager.playEquip();
            const scene = DreamSystem._scene;
            if (scene && scene.showToast) scene.showToast(T('Dream.weapon', { name: this._weapon.name }));
        },

        swap() { this.step(1); },

        _onWheel(e) {
            if (!dreamActive) return;
            const scene = DreamSystem._scene;
            if (scene && scene._menuOpen) return;
            DreamWeapon.step(e.deltaY > 0 ? 1 : -1);
        },

        /**
         * The analog triggers. Core's gamepad mapper does not carry them, so
         * they are read through the shared helper and edged here: R2 is the
         * trigger finger and fires once a pull rather than once a frame, and
         * L2 steps back up the rack.
         */
        _updateTriggers() {
            const pads = window.AnalogStickInput;
            if (!pads || !pads.leftTrigger) return;
            const scene = DreamSystem._scene;
            if (scene && scene._menuOpen) return;
            const rt = pads.rightTrigger ? pads.rightTrigger() : 0;
            if (!this._rtDown && rt > TRIGGER_ON) {
                this._rtDown = true;
                this.swing();
            } else if (this._rtDown && rt < TRIGGER_OFF) {
                this._rtDown = false;
            }
            const lt = pads.leftTrigger();
            if (!this._ltDown && lt > TRIGGER_ON) {
                this._ltDown = true;
                this.step(-1);
            } else if (this._ltDown && lt < TRIGGER_OFF) {
                this._ltDown = false;
            }
        },

        /** Melee or ranged, for anything that wants to know before swinging. */
        isRanged() {
            const t = this._weapon && this._weapon.wtypeId;
            return t === 7 || t === 8 || t === 9;
        },

        _onMouseDown(e) {
            if (!dreamActive || e.button !== 0) return;
            // The first click locks the pointer (DreamController); only the
            // clicks after that are the sleeper swinging at something.
            if (document.pointerLockElement !== document.body) return;
            const scene = DreamSystem._scene;
            if (scene && scene._menuOpen) return;
            DreamWeapon.swing();
        },

        /**
         * @param {boolean} blockAction true while SPACE is down: the engine maps
         *   it to 'ok', but in a dream it is the jump/fly key and never a swing.
         */
        update(blockAction) {
            const s = this._sprite;
            if (!s) return;
            if (typeof Input !== 'undefined') {
                if (!blockAction && Input.isTriggered('ok')) this.swing();
                // R1 (pagedown) is the trigger, here and on the shooting range
                // both. L1 belongs to flight in a dream (it sinks), so it is
                // not read here.
                if (Input.isTriggered('pagedown')) this.swing();
            }
            // UP and DOWN on the d-pad are the rack, which is why the walking
            // code ignores them: the stick walks, the cross changes weapon.
            if (padEdge('DPAD_UP')) this.step(-1);
            if (padEdge('DPAD_DOWN')) this.step(1);
            this._updateTriggers();
            // A dream weapon is dressed the frame its model exists, which for
            // a GLB is several frames after it was asked for.
            if (!this._weirded && this._weird(s)) this._weirded = true;
            // Nothing to aim at out here: the weapon rests, breathes and swings
            // its own arc rather than turning on a battlefield target.
            s._aimPoint = null;
            s.update();
            window.WeaponThreeScene.render();
        },

        /** Hidden while the wake prompt is up, which is drawn under the overlay. */
        setVisible(visible) {
            const canvas = window.WeaponThreeScene && window.WeaponThreeScene.canvas;
            if (canvas) canvas.style.display = visible ? 'block' : 'none';
        },

        end() {
            if (!this._held) return;
            document.removeEventListener('mousedown', this._onMouseDown);
            document.removeEventListener('wheel', this._onWheel);
            const canvas = window.WeaponThreeScene.canvas;
            if (canvas) {
                canvas.style.display = 'block';
                canvas.style.zIndex = '10';
            }
            if (this._sprite) this._sprite.terminate();
            this._sprite = null;
            this._weapon = null;
            this._held = false;
            this._bag = null;
            this._weirded = false;
            this._rtDown = this._ltDown = false;
            // Last, so the count only reaches zero once the sprite has let go.
            window.WeaponThreeScene.deref();
        }
    };

    // =========================================================================
    // DreamScene: builds the 3D surreal world from a terrain-tag grid.
    // =========================================================================
    class DreamScene {
        /**
         * @param {object} dream from rollDream
         * @param {object} [arrival] how the sleeper got here: `{ flying, alt }`
         *   drops them in over the ground rather than on it, still in the air.
         */
        constructor(dream, arrival) {
            this._dream = dream;
            this._w = dream.width;
            this._h = dream.height;
            this._grid = dream.grid;
            this._regions = dream.regions;
            this._enemies = [];
            this._props = [];
            this._guests = [];
            this._apparitions = [];
            this._celestials = [];
            this._animId = null;
            this._lastTime = null;
            this._time = 0;
            this._menuOpen = false;
            this._transitioning = false;
            this._flashDiv = null;
            this._flashTimer = null;
            this._driftTime = 0;
            this._skyDrift = 0;
            // The levels overhead: the handful standing at the moment, keyed by
            // level number, and the palettes the stack is wearing at each
            // height. Neither is ever complete, because neither can be.
            this._tiers = new Map();
            this._tierThemes = new Map();
            this._tierShown = null;
            this._tierSky = dream.sky;
            this._talker = null;
            this._talkTimer = 0;
            this._weather = null;
            this._seTimer = 8 + Math.random() * 14;
            this._bgsName = null;
            this._laws = dream.laws || {};
            this._skyA = new THREE.Color();
            this._skyB = new THREE.Color();
            // How far the whole world has risen this frame, when the dream is
            // one of the ones that breathes.
            this._breathY = 0;

            // Enlarge the dream ~WORLD_TILES^2 by repeating the region grid, then
            // treat the whole thing as periodic so it loops perfectly (see heightAt/tagAt).
            if (WORLD_TILES > 1) {
                const nw = this._w * WORLD_TILES, nh = this._h * WORLD_TILES;
                const ng = new Uint8Array(nw * nh);
                for (let y = 0; y < nh; y++)
                    for (let x = 0; x < nw; x++)
                        ng[y * nw + x] = this._grid[(y % this._h) * this._w + (x % this._w)];
                this._grid = ng; this._w = nw; this._h = nh;
            }
            this._worldW = this._w * CELL;
            this._worldH = this._h * CELL;

            // Seed the ground warp from the dream's own seed. The material cache
            // is per dream: this scene disposes everything it holds, so nothing
            // may be carried over into the next one.
            initPerlin((dream.seed * 2654435761) >>> 0);
            resetMatCache();
            this._rnd = dreamRng((dream.seed ^ 0x5bf03635) >>> 0);
            // One closure for the whole scene rather than one per sampled vertex.
            this._nz = (x, z, f) => this._tileNoise(x, z, f);

            this._createOverlay();
            this._initThree();
            this._buildTerrain();
            this._buildProps();
            this._buildCelestials();
            this._buildWeather();

            this._controller = new DreamController(this._camera, this._scene);
            this._controller.getGroundY = (x, z) => this.heightAt(x, z);
            this._controller.getSolids = (x, z, out, y) => this._solidsNear(x, z, out, y);
            if (this._laws.lowGravity) this._controller.gravity = 78;
            else if (this._laws.heavy) this._controller.gravity = 420;
            // Open the sleeper's eyes somewhere near the middle of the field,
            // and on TOP of whatever is standing there rather than inside it.
            // Never over a hole: a dream that begins with a fall is a cheat.
            let sx = (this._w * 0.5) * CELL, sz = (this._h * 0.5) * CELL;
            for (let i = 0; i < 40 && this.regionAt(sx, sz).isVoid; i++) {
                sx = (0.2 + this._rnd() * 0.6) * this._worldW;
                sz = (0.2 + this._rnd() * 0.6) * this._worldH;
            }
            let sy = this.heightAt(sx, sz);
            const here = [];
            this._solidsNear(sx, sz, here);
            for (const b of here) {
                if (Math.abs(b.x - sx) < b.hx && Math.abs(b.z - sz) < b.hz) sy = Math.max(sy, b.y1);
            }
            // Where the eyes opened is also the middle of the party's own life:
            // a remembered thing stands at a radius set by how long ago it was
            // written down, so what is within arm's reach happened last night
            // and the far edge of the field is the start of the playthrough.
            this._spawnX = sx;
            this._spawnZ = sz;
            this._memory = DreamSystem.memory ? DreamSystem.memory() : null;
            this._memoryMaxR = Math.min(this._worldW, this._worldH) * 0.44;
            // Dropped in rather than set down: arrive over the ground, still
            // flying, with the whole stack of levels overhead to climb.
            const alt = arrival && arrival.alt ? arrival.alt : 0;
            this._controller.setStart(sx, sy + this._controller.eye + alt, sz);
            if (arrival && arrival.flying) { this._controller.flying = true; this._controller.vy = 0; }

            this._spawnEnemies();
            this._spawnGuests();
            this._spawnApparitions();

            this._onResize = this._onResize.bind(this);
            window.addEventListener('resize', this._onResize);

            // Esc -> wake prompt. Enter is the action button now (it swings the
            // weapon, DreamWeapon.update), so shifting dreams is left to
            // touching an entity, to a drift region and to the plugin command.
            this._onKey = (e) => {
                if (!dreamActive || this._menuOpen) return;
                if (e.code === 'Escape') { e.preventDefault(); this._openWakePrompt(); }
            };
            document.addEventListener('keydown', this._onKey);

            // Where this is, said once and then let go of, since the standing
            // caption that used to say it is gone.
            this.showToast(this._dream.name);

            this._loop = this._loop.bind(this);
            this._animId = requestAnimationFrame(this._loop);
        }

        // ---- terrain access -------------------------------------------------
        // Cell tags wrap (modulo) so the grid is toroidal -> perfect seamless loop.
        tagAt(cx, cy) {
            cx = ((cx % this._w) + this._w) % this._w;
            cy = ((cy % this._h) + this._h) % this._h;
            return this._grid[cy * this._w + cx];
        }

        regionAt(wx, wz) {
            return this._regions[this.tagAt(Math.floor(wx / CELL), Math.floor(wz / CELL))];
        }

        // Perlin sampled so it tiles exactly at the world period (bilinear seam blend),
        // guaranteeing the ground height is continuous across the wrap boundary.
        _tileNoise(wx, wz, freq) {
            const W = this._worldW, H = this._worldH;
            const x = ((wx % W) + W) % W, z = ((wz % H) + H) % H;
            const gx = x / W, gz = z / H;
            const nx = x * freq, nz = z * freq, nW = W * freq, nH = H * freq;
            const a = perlin2(nx, nz), b = perlin2(nx - nW, nz);
            const c = perlin2(nx, nz - nH), d = perlin2(nx - nW, nz - nH);
            return a * (1 - gx) * (1 - gz) + b * gx * (1 - gz)
                 + c * (1 - gx) * gz + d * gx * gz;
        }

        heightAt(wx, wz) {
            const g = this.regionAt(wx, wz).ground;
            const fn = GROUNDS[g.kind] || GROUNDS.flat;
            // A breathing dream lifts the whole world together: the ground
            // mesh, everything standing on it and the answer given here, so
            // nothing is ever left hanging over its own floor.
            return fn(g, wx, wz, this._nz, this._worldW, this._worldH) + this._breathY;
        }

        // ---- DOM / renderer -------------------------------------------------
        _createOverlay() {
            const el = document.createElement('div');
            el.id = 'dream-overlay';
            el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;overflow:hidden;background:#000;';
            document.body.appendChild(el);
            this._overlay = el;

            // Everything written over the dream is stacked ABOVE the canvas.
            // The renderer's own element is appended after these (it is built
            // once the overlay exists), and with every layer positioned and no
            // z-index of its own the canvas painted last and covered the lot:
            // the toasts and every subtitle a figure ever said.
            //
            // There is no standing caption along the bottom any more. It sat in
            // exactly the strip the weapon is drawn in, printed the controls
            // over the sleeper's own hands, and a dream that explains itself in
            // a status bar is not a dream. Where a place is, and which level of
            // the stack it is on, is said once, as a toast, and then stops.

            // Anything the dream has to say (knowledge carried out of it, a
            // thing killed, the ground starting to change) is announced here:
            // the game canvas is not rendered while dreaming, so a
            // ParchmentToast would never show.
            const ins = document.createElement('div');
            ins.style.cssText = 'position:absolute;left:0;right:0;top:14%;text-align:center;color:#e8ddff;font:16px monospace;letter-spacing:2px;text-shadow:0 1px 2px #000;opacity:0;transition:opacity 0.6s;pointer-events:none;z-index:4;';
            el.appendChild(ins);
            this._insightDiv = ins;

            // What the figures standing about in the dream are saying, printed
            // as subtitles because a dream has no voice to say it in.
            const sub = document.createElement('div');
            sub.style.cssText = 'position:absolute;left:8%;right:8%;bottom:52px;text-align:center;' +
                'color:#f4f0ff;text-shadow:0 1px 2px #000;opacity:0;' +
                'transition:opacity 0.35s;pointer-events:none;z-index:4;';
            el.appendChild(sub);
            this._subtitleDiv = sub;

            // Full-screen strobe layer used for the LSD-style dream-shift flash.
            const fl = document.createElement('div');
            fl.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0;background:#fff;opacity:0;display:none;pointer-events:none;mix-blend-mode:screen;z-index:2;';
            el.appendChild(fl);
            this._flashDiv = fl;
        }

        // ---- LSD-emulator strobe: rapid random-colour flash, then fade out ----
        _lsdFlash(done) {
            const f = this._flashDiv;
            if (!f) { if (done) done(); return; }
            if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            f.style.display = 'block';
            let n = 0; const total = 20;
            const step = () => {
                if (!this._flashDiv) { if (done) done(); return; }
                const c = flashColors[Math.floor(Math.random() * flashColors.length)] || 'FFFFFF';
                this._flashDiv.style.background = '#' + c;
                this._flashDiv.style.opacity = String(0.45 + Math.random() * 0.5);
                if (++n >= total) {
                    this._flashDiv.style.opacity = '0';
                    this._flashTimer = setTimeout(() => {
                        if (this._flashDiv) this._flashDiv.style.display = 'none';
                    }, 60);
                    if (done) done();
                    return;
                }
                this._flashTimer = setTimeout(step, 24);
            };
            step();
        }

        /** The dream's own toast, since nothing else can draw over it. */
        showToast(text) {
            const d = this._insightDiv;
            if (!d || !text) return;
            d.textContent = text;
            d.style.opacity = '1';
            if (this._insightTimer) clearTimeout(this._insightTimer);
            this._insightTimer = setTimeout(() => {
                if (this._insightDiv) this._insightDiv.style.opacity = '0';
                this._insightTimer = null;
            }, 3200);
        }

        showInsight(amount) { this.showToast(T('Dream.insight', { amount: amount })); }

        _initThree() {
            const w = window.innerWidth, h = window.innerHeight;
            this._scene = new THREE.Scene();
            const skyHex = this._dream.sky;
            this._scene.background = new THREE.Color(skyHex);
            this._scene.fog = new THREE.FogExp2(skyHex, this._dream.fog);

            // The far plane has to hold whatever the dream hung in its sky: a
            // planet keeping station eight thousand units out is still meant to
            // be seen from the ground under it.
            this._camera = new THREE.PerspectiveCamera(72, w / h, 0.5, 16000);

            this._renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
            this._renderer.setPixelRatio(1);
            this._renderer.setSize(w, h);
            this._renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;display:block;z-index:1;';
            this._overlay.appendChild(this._renderer.domElement);

            this._hemi = new THREE.HemisphereLight(0xffffff, 0x202028, 0.85);
            this._scene.add(this._hemi);
            this._sun = new THREE.DirectionalLight(0xffffff, 0.9);
            this._sun.position.set(0.4, 1, 0.3);
            this._scene.add(this._sun);
            this._ambient = new THREE.AmbientLight(0x404050, 0.6);
            this._scene.add(this._ambient);
        }

        // ---- ground mesh ----------------------------------------------------
        // Built once, overscanned by MARGIN on every side. Height, region and
        // colour are all sampled from periodic functions, so the patch tiles
        // seamlessly and the player (kept wrapped into [0,worldW) each frame)
        // never sees an edge.
        _buildTerrain() {
            const worldW = this._worldW, worldH = this._worldH;
            const fullW = worldW + MARGIN * 2, fullH = worldH + MARGIN * 2;
            const segX = Math.max(1, Math.round(fullW / CELL));
            const segZ = Math.max(1, Math.round(fullH / CELL));
            const geo = new THREE.PlaneGeometry(fullW, fullH, segX, segZ);
            geo.rotateX(-Math.PI / 2);
            geo.translate(worldW * 0.5, 0, worldH * 0.5);

            const pos = geo.attributes.position;
            const uv = geo.attributes.uv;
            const colArr = new Float32Array(pos.count * 3);
            const c0 = new THREE.Color(), c1 = new THREE.Color(), col = new THREE.Color();

            for (let i = 0; i < pos.count; i++) {
                const wx = pos.getX(i), wz = pos.getZ(i);
                const b = this.regionAt(wx, wz);

                pos.setY(i, this.heightAt(wx, wz));

                c0.setHex(b.g0); c1.setHex(b.g1);
                const mix = (this._tileNoise(wx, wz, 0.05) * 0.5 + 0.5);
                col.copy(c0).lerp(c1, mix);
                colArr[i * 3] = col.r; colArr[i * 3 + 1] = col.g; colArr[i * 3 + 2] = col.b;
                // One texture tile per cell, in world space, so the printed
                // floor does not stretch with the patch.
                if (uv) uv.setXY(i, wx / CELL, wz / CELL);
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
            geo.computeVertexNormals();

            const floor = this._dream.floor;
            const tex = floor.kind === 'plain' ? null : makeFloorTexture(floor.kind, dreamRng(floor.seed));
            this._floorTex = tex;
            const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
            this._ground = new THREE.Mesh(geo, mat);
            this._scene.add(this._ground);

            // A shimmering sheet over the dips of any flooded region. It follows
            // the sleeper (recentred each frame) so it exists everywhere in the loop.
            let water = null;
            for (const rg of this._regions) if (rg.water) { water = rg; break; }
            if (water) {
                const wgeo = new THREE.PlaneGeometry(fullW + 2000, fullH + 2000);
                wgeo.rotateX(-Math.PI / 2);
                const wmat = new THREE.MeshPhongMaterial({
                    color: water.accent, transparent: true, opacity: 0.55,
                    shininess: 120, specular: 0xbfd4ff
                });
                this._water = new THREE.Mesh(wgeo, wmat);
                this._waterY = water.ground.baseY + 5;
                this._water.position.y = this._waterY;
                this._scene.add(this._water);
            }
        }

        // =====================================================================
        // Furnishing.
        //
        // Every prototype is built once and then INSTANCED: the prototype is
        // flattened into its meshes with their local transforms baked, and one
        // InstancedMesh per part carries every copy in the world. That is what
        // lets a region put twenty thousand objects on the ground for a handful
        // of draw calls, and it is why a prototype may be as complicated as it
        // likes.
        // =====================================================================
        _flatten(proto) {
            proto.updateMatrixWorld(true);
            // Group by material first: everything a prototype draws in one
            // colour becomes ONE geometry with its local transforms baked in,
            // so a server room of 120 boxes costs one draw call rather than a
            // hundred and twenty. Materials are shared per dream (dmat), which
            // is what makes the grouping worth anything.
            const byMat = new Map();
            proto.traverse((o) => {
                if (!o.isMesh || !o.geometry) return;
                const list = byMat.get(o.material) || [];
                list.push({ geo: o.geometry, local: o.matrixWorld.clone() });
                byMat.set(o.material, list);
            });

            const parts = [];
            const ident = new THREE.Matrix4();
            byMat.forEach((list, mat) => {
                const merged = list.length > 1 ? bakeMerge(list) : null;
                if (merged) {
                    parts.push({ geo: merged, mat: mat, local: ident });
                } else {
                    for (const it of list) parts.push({ geo: it.geo, mat: mat, local: it.local });
                }
            });
            return parts;
        }

        _instance(parts, placements) {
            if (!parts.length || !placements.length) return;
            const m = new THREE.Matrix4();
            for (const part of parts) {
                const mesh = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
                for (let i = 0; i < placements.length; i++) {
                    m.copy(placements[i]).multiply(part.local);
                    mesh.setMatrixAt(i, m);
                }
                mesh.instanceMatrix.needsUpdate = true;
                // The instances span the whole overscan, which no bounding
                // sphere of the base geometry describes.
                mesh.frustumCulled = false;
                this._scene.add(mesh);
                this._props.push(mesh);
            }
        }

        /**
         * The writing this dream puts on its walls and its signs.
         *
         * A dream used to run the chains ONCE and paint that single phrase on
         * every wall, every hoarding and every sign standing in every field,
         * which read as a slogan rather than as a place talking to itself. The
         * words are dealt per REGION instead (the granularity the world is
         * built at: one prototype per region, instanced), and a region carrying
         * writing is given a small set of them, so two walls of the same
         * corridor and three hoardings in a row all say different things.
         *
         * Every texture made here is recorded in `_textTex` and disposed with
         * the dream.
         */
        _textTexture(text, opts) {
            const tex = makeTextTexture(text, opts);
            if (!this._textTex) this._textTex = [];
            this._textTex.push(tex);
            return tex;
        }

        /** Up to `n` different phrases for the walls of one region. */
        _wallTexSet(tag, n) {
            if (!this._wallTexes) this._wallTexes = {};
            const key = tag + ':' + n;
            if (this._wallTexes[key]) return this._wallTexes[key];
            const out = [];
            if (this._dream.wallText) {
                for (let i = 0; i < n; i++) {
                    const phrase = dreamPhrase(this._rnd, 6);
                    if (!phrase) continue;
                    out.push(this._textTexture(phrase, {
                        width: 512, height: 128, lines: 1, size: 46,
                        ink: 'rgba(20,18,24,0.85)', shadow: true
                    }));
                }
            }
            this._wallTexes[key] = out;
            return out;
        }

        _buildProps() {
            const W = this._w, H = this._h;
            const minCx = Math.floor(-MARGIN / CELL), maxCx = Math.ceil((this._worldW + MARGIN) / CELL);
            const minCy = Math.floor(-MARGIN / CELL), maxCy = Math.ceil((this._worldH + MARGIN) / CELL);

            // Buckets, one per thing being placed: scattered props by region,
            // architecture by region, ceilings and water lids by region, and the
            // solid blocks a wall region is made of.
            const propAt = {}, structAt = {}, lidAt = {}, ceilAt = {}, wallAt = {};
            const dummy = new THREE.Object3D();
            const mat4 = () => { dummy.updateMatrix(); return dummy.matrix.clone(); };
            const CAP = 6000;         // scattered props per region; a floor is not a carpet
            // Architecture is far heavier than a prop (a megastructure piece is
            // some 1200 triangles and an instanced mesh is drawn whole, with no
            // per-copy culling), so it gets a budget of its own.
            const STRUCT_CAP = 1200;

            // A dense region (a miniature city is nearly one block a cell) would
            // run past the cap partway through the scan and leave the rest of
            // the field bare, so the density is THINNED to fit instead: how much
            // of the world this region covers decides how many cells of it the
            // window holds, and the gate is loosened or tightened to land under
            // the cap evenly everywhere.
            const windowCells = (maxCx - minCx) * (maxCy - minCy);
            const share = new Array(this._regions.length).fill(0);
            for (let i = 0; i < this._grid.length; i++) share[this._grid[i]]++;
            const density = this._regions.map((rg, i) => {
                if (!rg.prop) return 0;
                const cells = windowCells * (share[i] / this._grid.length);
                return cells > 0 ? Math.min(rg.prop.density, CAP / cells) : rg.prop.density;
            });
            // Both tables are kept: the collision query re-derives what stands
            // near the sleeper from the same numbers rather than storing a copy
            // of the world (see _solidsNear).
            this._density = density;
            // The same thinning for architecture, done by WIDENING the lattice
            // rather than by dropping pieces: a corridor with holes in it is not
            // a corridor. A wider lattice hands the builder a longer span, so
            // the pieces simply come out bigger and still meet.
            const structStep = this._regions.map((rg, i) => {
                if (!rg.structure) return 0;
                const cells = windowCells * (share[i] / this._grid.length);
                let step = rg.structure.step;
                while (cells / (step * step) > STRUCT_CAP) step *= 2;
                return step;
            });
            this._structStep = structStep;

            for (let cy = minCy; cy < maxCy; cy++) {
                for (let cx = minCx; cx < maxCx; cx++) {
                    const cxW = ((cx % W) + W) % W, cyW = ((cy % H) + H) % H;
                    const tag = this._grid[cyW * W + cxW];
                    const rg = this._regions[tag];
                    const wx0 = cx * CELL + CELL * 0.5, wz0 = cy * CELL + CELL * 0.5;

                    // Solid blocks: a wall region IS its blocks.
                    if (rg.wall) {
                        const list = wallAt[tag] = wallAt[tag] || [];
                        if (list.length < CAP) {
                            dummy.position.set(wx0, this.heightAt(wx0, wz0), wz0);
                            dummy.rotation.set(0, 0, 0);
                            dummy.scale.setScalar(1);
                            list.push(mat4());
                        }
                    }

                    // A ceiling or a lid of water belongs to its own region's
                    // cells, which is what lets a corridor with a ceiling open
                    // onto open sky four steps later. Placed on a coarse grid
                    // because a slab is 4 cells wide.
                    if (rg.ceiling && (cxW % 4 === 0) && (cyW % 4 === 0)) {
                        const list = ceilAt[tag] = ceilAt[tag] || [];
                        if (list.length < CAP) {
                            dummy.position.set(wx0 + CELL * 1.5, rg.ceiling.y, wz0 + CELL * 1.5);
                            dummy.rotation.set(0, 0, 0);
                            dummy.scale.setScalar(1);
                            list.push(mat4());
                        }
                    }
                    if (rg.lid && (cxW % 4 === 0) && (cyW % 4 === 0)) {
                        const list = lidAt[tag] = lidAt[tag] || [];
                        if (list.length < CAP) {
                            dummy.position.set(wx0 + CELL * 1.5, rg.lid.y, wz0 + CELL * 1.5);
                            dummy.rotation.set(0, 0, 0);
                            dummy.scale.setScalar(1);
                            list.push(mat4());
                        }
                    }

                    // Architecture, on its own coarse lattice and never jittered
                    // or turned, so neighbouring copies meet and a corridor is a
                    // corridor rather than a row of sheds.
                    if (rg.structure) {
                        const st = structStep[tag];
                        if (cxW % st === 0 && cyW % st === 0) {
                            const list = structAt[tag] = structAt[tag] || [];
                            if (list.length < CAP) {
                                dummy.position.set(cx * CELL, this.heightAt(cx * CELL, cy * CELL), cy * CELL);
                                dummy.rotation.set(0, 0, 0);
                                dummy.scale.setScalar(1);
                                list.push(mat4());
                            }
                        }
                    }

                    // Whatever this region scatters about.
                    const pr = rg.prop;
                    if (!pr || density[tag] <= 0) continue;
                    if (hash01(cxW, cyW, 3) > density[tag]) continue;
                    const list = propAt[tag] = propAt[tag] || [];
                    if (list.length >= CAP) continue;
                    const jx = (hash01(cxW, cyW, 1) - 0.5) * CELL * 0.6;
                    const jz = (hash01(cxW, cyW, 2) - 0.5) * CELL * 0.6;
                    const wx = wx0 + jx, wz = wz0 + jz;
                    let wy = this.heightAt(wx, wz);
                    if (pr.floats) wy += 14 + hash01(cxW, cyW, 5) * 46;
                    const s = pr.minS + hash01(cxW, cyW, 4) * (pr.maxS - pr.minS);
                    const ry = hash01(cxW, cyW, 6) * TAU;
                    dummy.position.set(wx, wy, wz);
                    dummy.rotation.set(pr.upright ? 0 : (hash01(cxW, cyW, 7) - 0.5) * 1.2, ry, 0);
                    dummy.scale.setScalar(s);
                    list.push(mat4());
                }
            }

            // ---- build one prototype per bucket and instance it -------------
            for (const tagStr in propAt) {
                const rg = this._regions[+tagStr];
                const build = PROPS[rg.prop.key];
                if (!build) continue;
                const extra = rg.prop.key === 'bigtext' ? { textTex: this._signTexture(+tagStr) }
                    : (rg.prop.sprite ? { sprite: rg.prop.sprite } : null);
                const proto = build(this._rnd, rg, extra);
                // A prop is turned on the spot, so its parts are collided with as
                // square footprints: a footprint that does not care which way it
                // is facing is the one thing a Y rotation cannot invalidate.
                rg._col = collisionBoxes(proto, { square: true });
                this._instance(this._flatten(proto), propAt[tagStr]);
            }
            for (const tagStr in structAt) {
                const rg = this._regions[+tagStr];
                const build = STRUCTURES[rg.structure.key];
                if (!build) continue;
                const span = structStep[+tagStr] * CELL;
                // Three phrases a region: enough that the two walls of one
                // corridor and the three hoardings of one row never agree.
                const texes = rg.text ? this._wallTexSet(+tagStr, 3) : [];
                const proto = build(this._rnd, rg, span,
                    { wallTex: texes[0] || null, wallTexes: texes });
                // Architecture is never turned, so its parts collide as they are
                // drawn: a wall is a wall, a floor slab is something to stand on
                // and the gap between them is a doorway.
                rg._structCol = collisionBoxes(proto, { square: false });
                rg._structSpan = span;
                this._instance(this._flatten(proto), structAt[tagStr]);
            }
            for (const tagStr in wallAt) {
                const rg = this._regions[+tagStr];
                const block = gBox(CELL * 0.92, WALL_H, CELL * 0.92, rg.accent);
                block.position.y = WALL_H * 0.5;
                this._instance(this._flatten(knit(block)), wallAt[tagStr]);
            }
            for (const tagStr in ceilAt) {
                const rg = this._regions[+tagStr];
                const slab = knit(put(gBox(CELL * 4, 1.4, CELL * 4, rg.ceiling.lights ? rg.pale : rg.dark), 0, 0, 0));
                if (rg.ceiling.lights) {
                    slab.add(put(gQuad(CELL * 1.6, CELL * 0.5, 0xfff4d6, { glow: 1 }), 0, -0.9, 0, Math.PI / 2, 0, 0));
                }
                this._instance(this._flatten(slab), ceilAt[tagStr]);
            }
            for (const tagStr in lidAt) {
                const rg = this._regions[+tagStr];
                const lid = knit(put(gQuad(CELL * 4, CELL * 4, rg.accent, { opacity: 0.42 }), 0, 0, 0, Math.PI / 2, 0, 0));
                this._instance(this._flatten(lid), lidAt[tagStr]);
            }

            // How far the collision query has to look for architecture: half
            // the widest piece in the dream, in cells, plus one.
            let reach = 0;
            for (const rg of this._regions) {
                if (rg._structSpan) reach = Math.max(reach, Math.ceil(rg._structSpan * 0.5 / CELL) + 1);
            }
            this._structReach = Math.min(reach, 10);

            if (window.PSXShader) window.PSXShader.applyToObject(this._scene);
        }

        /**
         * Every solid thing standing near (px, pz), in world units, appended to
         * `out` as { x, z, y0, y1, hx, hz }.
         *
         * Nothing is stored: placement is a pure function of the cell and its
         * region (the same hash gate, lattice and heights _buildProps used), so
         * the sleeper's surroundings are re-derived from it a frame at a time.
         * That costs a few hundred cheap tests and no memory at all, where a
         * table of every box in the world would be tens of thousands of them.
         */
        _solidsNear(px, pz, out, py) {
            const W = this._w, H = this._h;
            const cx0 = Math.floor(px / CELL), cy0 = Math.floor(pz / CELL);

            // Whatever level of the stack the sleeper is on, if they are on one
            // at all. Answered first because it is what they are standing on.
            if (py !== undefined) this._tierSolids(px, pz, py, out);

            // Cells: the solid blocks of a wall region, and whatever the region
            // scatters. Only the ring the sleeper can actually touch.
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const cx = cx0 + dx, cy = cy0 + dy;
                    const cxW = ((cx % W) + W) % W, cyW = ((cy % H) + H) % H;
                    const tag = this._grid[cyW * W + cxW];
                    const rg = this._regions[tag];
                    const wx0 = cx * CELL + CELL * 0.5, wz0 = cy * CELL + CELL * 0.5;

                    if (rg.wall) {
                        const gy = this.heightAt(wx0, wz0);
                        out.push({ x: wx0, z: wz0, y0: gy, y1: gy + WALL_H,
                                   hx: CELL * 0.46, hz: CELL * 0.46 });
                    }
                    if (rg.ceiling && (cxW % 4 === 0) && (cyW % 4 === 0)) {
                        out.push({ x: wx0 + CELL * 1.5, z: wz0 + CELL * 1.5,
                                   y0: rg.ceiling.y - 0.7, y1: rg.ceiling.y + 0.7,
                                   hx: CELL * 2, hz: CELL * 2 });
                    }

                    const pr = rg.prop, col = rg._col;
                    if (!pr || !col || !col.length) continue;
                    if (hash01(cxW, cyW, 3) > (this._density ? this._density[tag] : pr.density)) continue;
                    const jx = (hash01(cxW, cyW, 1) - 0.5) * CELL * 0.6;
                    const jz = (hash01(cxW, cyW, 2) - 0.5) * CELL * 0.6;
                    const wx = wx0 + jx, wz = wz0 + jz;
                    let wy = this.heightAt(wx, wz);
                    if (pr.floats) wy += 14 + hash01(cxW, cyW, 5) * 46;
                    const s = pr.minS + hash01(cxW, cyW, 4) * (pr.maxS - pr.minS);
                    for (const b of col) {
                        // Footprints are square for a prop, so the placement's
                        // own turn only has to move the offset, not reshape it.
                        out.push({
                            x: wx + b.x * s, z: wz + b.z * s,
                            y0: wy + b.y0 * s, y1: wy + b.y1 * s,
                            hx: b.hx * s, hz: b.hz * s
                        });
                    }
                }
            }

            // Architecture: a piece can be far bigger than a cell, so the search
            // reaches out as far as the widest span in this dream.
            const reach = this._structReach;
            if (!reach) return;
            for (let dy = -reach; dy <= reach; dy++) {
                for (let dx = -reach; dx <= reach; dx++) {
                    const cx = cx0 + dx, cy = cy0 + dy;
                    const cxW = ((cx % W) + W) % W, cyW = ((cy % H) + H) % H;
                    const tag = this._grid[cyW * W + cxW];
                    const rg = this._regions[tag];
                    if (!rg.structure || !rg._structCol || !rg._structCol.length) continue;
                    const st = this._structStep ? this._structStep[tag] : rg.structure.step;
                    if (cxW % st !== 0 || cyW % st !== 0) continue;
                    const ox = cx * CELL, oz = cy * CELL;
                    const oy = this.heightAt(ox, oz);
                    for (const b of rg._structCol) {
                        const x = ox + b.x, z = oz + b.z;
                        // Skip anything the sleeper is nowhere near before it
                        // costs a box: a megastructure piece is 60-odd parts.
                        if (Math.abs(x - px) > b.hx + 40 || Math.abs(z - pz) > b.hz + 40) continue;
                        out.push({ x: x, z: z, y0: oy + b.y0, y1: oy + b.y1, hx: b.hx, hz: b.hz });
                    }
                }
            }
        }

        /** A phrase big enough to read from across a field, one per region. */
        _signTexture(tag) {
            if (!this._signTexes) this._signTexes = {};
            if (this._signTexes[tag] !== undefined) return this._signTexes[tag];
            const phrase = dreamPhrase(this._rnd, 5);
            this._signTexes[tag] = phrase ? this._textTexture(phrase, {
                width: 512, height: 256, lines: 2, ink: '#12121a', shadow: true
            }) : null;
            return this._signTexes[tag];
        }

        // ---- what hangs over the dream --------------------------------------
        /**
         * A dream may have nothing in its sky at all, or a hole in it, or a
         * couple of worlds, or both. The rule is only ever about ORDER: the
         * black hole (never more than one) stands inside the world's own
         * period, near enough to fly to, and everything else keeps station
         * thousands of units outside it, so whatever the sleeper does the hole
         * is the nearest thing over their head.
         */
        _buildCelestials() {
            const list = this._dream.celestials || [];
            // However big this dream's period is, a far body has to stand
            // outside all of it, or a black hole in the far corner of the loop
            // would stop being the nearest thing in the sky. Capped so nothing
            // is ever pushed past the camera's own far plane.
            const outside = Math.min(8200, Math.hypot(this._worldW, this._worldH) * 0.9);
            for (const c of list) {
                const body = buildCelestial(this._rnd, c.kind, c.radius, c.seed, c.type);
                if (!body || !body.group) continue;
                const rec = {
                    obj: body, kind: c.kind, near: !!c.near,
                    x: this._rnd() * this._worldW,
                    z: this._rnd() * this._worldH,
                    y: c.height + c.radius * 0.6,
                    dist: Math.max(c.dist || 0, outside), bearing: c.bearing || 0,
                    spin: (this._rnd() - 0.5) * 0.06
                };
                // What is in the sky is not in the weather. Left to the fog, a
                // body four thousand units out is swallowed whole and a dream
                // that rolled two planets shows neither.
                body.group.traverse((o) => {
                    const m = o.material;
                    if (!m) return;
                    const mats = Array.isArray(m) ? m : [m];
                    for (const mm of mats) {
                        if (mm.fog) { mm.fog = false; mm.needsUpdate = true; }
                    }
                });
                body.group.userData.dreamForeign = true;   // GalaxySim owns its buffers
                this._scene.add(body.group);
                this._celestials.push(rec);
            }
        }

        _updateCelestials(delta, P) {
            const W = this._worldW, H = this._worldH;
            const wrap = (v, c, S) => { let d = v - c; d -= Math.round(d / S) * S; return c + d; };
            for (const c of this._celestials) {
                const g = c.obj.group;
                if (c.near) {
                    // Inside the period, so it can be walked up to and flown at.
                    c.x = wrap(c.x, P.x, W); c.z = wrap(c.z, P.z, H);
                    g.position.set(c.x, c.y, c.z);
                } else {
                    // Astronomically far, and a dream does not care that this
                    // means it never gets any closer.
                    c.bearing += c.spin * delta;
                    g.position.set(P.x + Math.sin(c.bearing) * c.dist, c.y,
                                   P.z + Math.cos(c.bearing) * c.dist);
                    g.rotation.y += delta * 0.02;
                }
                if (c.obj.animate) { try { c.obj.animate(this._time); } catch (e) { /* not our renderer */ } }
            }
        }

        // ---- weather no sky has ever had -------------------------------------
        /**
         * One point cloud, a box of it, carried about with the sleeper so it
         * exists everywhere at once for one draw call. What falls, how fast and
         * which way is rolled per dream; some of it falls upward.
         */
        _buildWeather() {
            const w = this._dream.weather;
            if (!w || !THREE.Points) return;
            const spec = WEATHER_KINDS[w.kind] || WEATHER_KINDS.ash;
            const n = Math.round(spec.count * 0.75);
            const span = 900, high = 420;
            const pos = new Float32Array(n * 3);
            const phase = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                pos[i * 3] = (Math.random() - 0.5) * span;
                pos[i * 3 + 1] = Math.random() * high;
                pos[i * 3 + 2] = (Math.random() - 0.5) * span;
                phase[i] = Math.random() * TAU;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const mat = new THREE.PointsMaterial({
                color: w.tint, size: spec.size * w.scale,
                sizeAttenuation: true, transparent: true,
                opacity: 0.35 + spec.glow * 0.5, depthWrite: false
            });
            mat.userData = { _psx: true };     // a point is one pixel; leave it alone
            const pts = new THREE.Points(geo, mat);
            pts.frustumCulled = false;
            this._scene.add(pts);
            this._weather = { obj: pts, spec: spec, phase: phase, span: span, high: high, n: n };
        }

        _updateWeather(delta, P) {
            const wx = this._weather;
            if (!wx) return;
            const { spec, phase, span, high, n } = wx;
            const arr = wx.obj.geometry.attributes.position.array;
            const t = this._time;
            for (let i = 0; i < n; i++) {
                const j = i * 3;
                arr[j + 1] += spec.fall * delta;
                arr[j] += Math.sin(t * 0.8 + phase[i]) * spec.sway * delta;
                arr[j + 2] += Math.cos(t * 0.6 + phase[i]) * spec.sway * delta;
                // Everything that leaves the box comes back in the far side:
                // weather in a dream is a loop, like the ground under it.
                if (arr[j + 1] > high) arr[j + 1] -= high;
                else if (arr[j + 1] < 0) arr[j + 1] += high;
                if (arr[j] > span * 0.5) arr[j] -= span;
                else if (arr[j] < -span * 0.5) arr[j] += span;
                if (arr[j + 2] > span * 0.5) arr[j + 2] -= span;
                else if (arr[j + 2] < -span * 0.5) arr[j + 2] += span;
            }
            wx.obj.geometry.attributes.position.needsUpdate = true;
            wx.obj.position.set(P.x, this.heightAt(P.x, P.z) - 40, P.z);
        }

        // =====================================================================
        // Apparitions: the figures standing about in a dream.
        //
        // Monster art out of img/enemies/Dreams (one flat card, no facing) and
        // the game's own walking sprites (four facings off the sheet, chosen
        // from where the sleeper is standing, so circling one walks round it).
        // Both are camera-facing, both talk when approached, and both can be
        // struck or shot like anything else in here.
        // =====================================================================
        _spawnApparitions() {
            const spec = this._dream.apparitions;
            if (!spec || !spec.count) return;
            const sheets = npcSheetKeys();
            const r = this._rnd;
            const people = (this._memory && this._memory.people.length) ? this._memory.people : null;
            const dread = DreamSystem.dread ? DreamSystem.dread() : 0;
            // A dream with people in its diary is a dream with people in it:
            // the walking sheets take a much larger share of the figures than
            // they do in one that belongs to nobody. Dread adds figures without
            // changing the mix, so a week awake is a crowded field.
            const npcShare = people ? Math.min(0.85, spec.npcShare + 0.42) : spec.npcShare;
            const count = Math.round(spec.count * (1 + dread * 0.5));
            for (let i = 0; i < count; i++) {
                const wantNpc = sheets.length && r() < npcShare;
                // Four in five of the faces walking about are people the party
                // has actually stood in front of; the rest are strangers, which
                // is what a crowd is.
                const rec = (wantNpc && people && r() < 0.8) ? DreamMemory.pick(people, r) : null;
                const app = wantNpc
                    ? this._makeNpcApparition(sheets, rec)
                    : this._makeFaceApparition();
                if (!app) continue;
                if (rec) {
                    const at = this._memoryPos(rec, r);
                    app.x = at.x; app.z = at.z;
                } else {
                    app.x = r() * this._worldW;
                    app.z = r() * this._worldH;
                }
                app.hp = 1 + Math.floor(r() * 3);
                app.dead = false;
                app.flash = 0;
                app.bob = r() * TAU;
                app.talks = r() < spec.talkative;
                app.said = 0;
                app.yaw = r() * TAU;           // which way it is itself facing
                app.turn = (r() - 0.5) * 0.5;
                app.speed = r() < 0.55 ? 4 + r() * 16 : 0;
                app.voice = this._dream.sfx.voice[Math.floor(r() * this._dream.sfx.voice.length)];
                app.mesh.userData.dreamForeign = false;
                this._scene.add(app.mesh);
                this._apparitions.push(app);
            }
        }

        /**
         * The next card of art this dream has not shown yet. Dealt out of a bag
         * rather than rolled, so a dream with thirty figures in it shows thirty
         * different pictures instead of the same half-dozen over and over; the
         * bag is refilled and reshuffled only once the whole folder is spent.
         */
        _nextFace() {
            if (!this._faceBag || !this._faceBag.length) {
                this._faceBag = DREAM_FACES.slice();
                for (let i = this._faceBag.length - 1; i > 0; i--) {
                    const j = Math.floor(this._rnd() * (i + 1));
                    const t = this._faceBag[i]; this._faceBag[i] = this._faceBag[j]; this._faceBag[j] = t;
                }
            }
            return this._faceBag.pop();
        }

        /** A card of monster art, as tall as the dream feels like making it. */
        _makeFaceApparition() {
            const file = this._nextFace();
            const tex = faceTexture(file);
            if (!tex) return null;
            let h = 22 + this._rnd() * this._rnd() * 120;
            if (this._rnd() < 0.06) h *= 3 + this._rnd() * 4;    // the rare one filling the sky
            const mat = new THREE.MeshBasicMaterial({
                map: tex, transparent: true, alphaTest: 0.28,
                side: THREE.DoubleSide, depthWrite: true,
                color: 0xffffff, fog: true
            });
            mat.userData = { _psx: true };
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h, h), mat);
            mesh.frustumCulled = false;
            mesh.visible = !!(tex.image && tex.image.width);   // nothing shows a blank card
            return { mesh: mesh, mat: mat, kind: 'face', h: h, w: h, name: file.replace(/\.png$/i, ''),
                     lift: h * 0.5 + (this._rnd() < 0.3 ? 20 + this._rnd() * 90 : 0) };
        }

        /**
         * A walking sprite off a character sheet, cropped to one frame. The
         * texture is CLONED so this figure owns its own offset and can face a
         * different way from the next one drawn off the same sheet.
         */
        /**
         * @param {object} [rec] a memory out of the diary: its own sheet and
         *   its own name, so the figure walking about is a person the party
         *   knows and the subtitle says who is talking.
         */
        _makeNpcApparition(sheets, rec) {
            const path = (rec && rec.sheet) || sheets[Math.floor(this._rnd() * sheets.length)];
            const base = sheetTexture(path);
            if (!base) return null;
            // `$` sheets hold one character in 3 by 4; the rest hold eight and a
            // dream always takes the first of them.
            const single = path.indexOf('$') >= 0;
            const cols = single ? 3 : 12, rows = single ? 4 : 8;
            // The three this game ships is r128, which has no shared Source
            // behind a texture: a clone copies the IMAGE as it stands, so one
            // taken before the sheet has arrived would stay blank for ever.
            // The image is adopted in the update loop instead, once it lands.
            const tex = base.clone();
            tex.repeat.set(1 / cols, 1 / rows);
            tex.offset.set(0, 1 - 1 / rows);
            if (base.image && base.image.width) tex.needsUpdate = true;
            const mat = new THREE.MeshBasicMaterial({
                map: tex, transparent: true, alphaTest: 0.45,
                side: THREE.DoubleSide, depthWrite: true, fog: true
            });
            mat.userData = { _psx: true };
            // A person is about the sleeper's own height, and then a dream has
            // its own opinion about that.
            let h = 15 + this._rnd() * 9;
            if (this._rnd() < 0.12) h *= 2 + this._rnd() * 5;
            const w = h * 0.66;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            mesh.frustumCulled = false;
            mesh.visible = false;      // shown the moment the art is really there
            return { mesh: mesh, mat: mat, kind: 'npc', tex: tex, base: base, cols: cols, rows: rows,
                     single: single, h: h, w: w, frame: 0, step: 0,
                     name: (rec && rec.name) || path.split('/').pop().replace(/[!$]/g, ''),
                     lift: h * 0.5 };
        }

        /**
         * Which of the four rows of the sheet is showing. Read from where the
         * SLEEPER is standing relative to the way the figure is facing, which
         * is what makes walking round one walk round it: front, flank, back.
         * Sheet row order is the engine's own: down, left, right, up.
         */
        _npcFacingRow(app, P) {
            const dx = P.x - app.mesh.position.x, dz = P.z - app.mesh.position.z;
            // The angle from the figure's own facing to the sleeper.
            let a = Math.atan2(dx, dz) - app.yaw;
            a = ((a % TAU) + TAU) % TAU;
            if (a < Math.PI * 0.25 || a > Math.PI * 1.75) return 0;   // looked at: face
            if (a < Math.PI * 0.75) return 2;                          // its right flank
            if (a < Math.PI * 1.25) return 3;                          // its back
            return 1;                                                  // its left flank
        }

        _updateApparitions(delta, P) {
            const W = this._worldW, H = this._worldH;
            const wrap = (v, c, S) => { let d = v - c; d -= Math.round(d / S) * S; return c + d; };
            if (!this._tmpQ) { this._tmpQ = new THREE.Quaternion(); this._tmpE = new THREE.Euler(); }
            const camY = this._tmpE.setFromQuaternion(
                this._camera.getWorldQuaternion(this._tmpQ), 'YXZ').y;
            let near = null, nearD = Infinity;
            // Some dreams only let their figures move while nobody is looking.
            if (!this._tmpV) this._tmpV = new THREE.Vector3();
            const dir = this._camera.getWorldDirection(this._tmpV);

            for (const app of this._apparitions) {
                if (app.dead) continue;
                if (!app.mesh.visible && app.kind === 'face') {
                    const im = app.mat.map && app.mat.map.image;
                    if (im && im.width) app.mesh.visible = true;
                }
                app.x = wrap(app.x, P.x, W); app.z = wrap(app.z, P.z, H);
                const dx = app.x - P.x, dz = app.z - P.z;
                const d = Math.hypot(dx, dz);

                let moving = app.speed > 0;
                if (moving && this._laws.watched) {
                    // Weeping-angel law: it only moves while it is not looked at.
                    const look = (dx * dir.x + dz * dir.z) / (d || 1);
                    if (look > 0.55 && d < 700) moving = false;
                }
                if (moving) {
                    if (this._laws.swarm && d > 40) {
                        // It is coming, slowly, and it does not stop.
                        app.yaw = Math.atan2(-dx, -dz);
                    } else {
                        app.yaw += app.turn * delta;
                        if (Math.random() < 0.008) app.turn = (Math.random() - 0.5) * 1.2;
                    }
                    app.x += Math.sin(app.yaw) * app.speed * delta;
                    app.z += Math.cos(app.yaw) * app.speed * delta;
                    app.step += app.speed * delta;
                }

                app.bob += delta * 1.6;
                const gy = this.heightAt(app.x, app.z);
                app.mesh.position.set(app.x, gy + app.lift + Math.sin(app.bob) * 0.7, app.z);
                // Camera-facing, upright: a dream sprite never lies down.
                app.mesh.rotation.set(0, camY, 0);

                if (app.kind === 'npc') {
                    // The sheet has arrived: this figure's own crop of it takes
                    // the image, and the card is re-cut to the shape the art
                    // actually is. Frames are not all 48 by 72 (the packs under
                    // Other/ run to 78 by 138, and some are square).
                    if (!app.sized && app.base.image && app.base.image.width) {
                        app.sized = true;
                        app.tex.image = app.base.image;
                        app.tex.needsUpdate = true;
                        const fw = app.base.image.width / app.cols;
                        const fh = app.base.image.height / app.rows;
                        const w = app.h * (fw / fh);
                        if (fh > 0 && Math.abs(w - app.w) > 0.5) {
                            app.mesh.geometry.dispose();
                            app.mesh.geometry = new THREE.PlaneGeometry(w, app.h);
                            app.w = w;
                        }
                        app.mesh.visible = true;
                    }
                    const row = this._npcFacingRow(app, P);
                    // The walk cycle: left foot, stand, right foot, stand.
                    const cycle = [1, 0, 1, 2];
                    const col = moving ? cycle[Math.floor(app.step / 9) % 4] : 1;
                    app.tex.offset.set(col / app.cols, 1 - (row + 1) / app.rows);
                }
                if (app.flash > 0) {
                    app.flash = Math.max(0, app.flash - delta);
                    app.mesh.scale.setScalar(1 + app.flash * 1.6);
                } else if (app.mesh.scale.x !== 1) {
                    app.mesh.scale.setScalar(1);
                }
                if (app.talks && app.mesh.visible && d < nearD) { nearD = d; near = app; }

                // Walking into one of the figures is the same door as walking
                // into one of the wandering creatures: the card of monster art
                // and the walking sprite off a character sheet both let go of
                // the dream when they are touched. The reach is the width of
                // the card, kept short enough that a giant standing in the sky
                // does not grab from the horizon, and its height has to be near
                // the sleeper's own, so a figure hung fifty units overhead is
                // walked under rather than into.
                if (!this._transitioning && !this._menuOpen && this._time > 1.2 &&
                    app.mesh.visible) {
                    const reach = 5 + Math.min(app.w, 90) * 0.35;
                    const dy = Math.abs(app.mesh.position.y - P.y);
                    if (d < reach && dy < Math.max(22, app.h * 0.6)) {
                        this._transitioning = true;
                        this._hideSubtitle();
                        DreamSystem.collideShift();
                        return;
                    }
                }
            }

            // Whoever is nearest and near enough is the one talking. It says
            // something else every few seconds for as long as it is stood by.
            this._talkTimer -= delta;
            if (near && nearD < TALK_RANGE) {
                if (this._talker !== near || this._talkTimer <= 0) {
                    const first = this._talker !== near;
                    this._talker = near;
                    this._talkTimer = 2.6 + Math.random() * 3.4;
                    this._say(near);
                    if (first) {
                        const pan = Math.max(-100, Math.min(100, (near.x - P.x) * 0.4));
                        dreamSe(near.voice, 55, this._dream.sfx.pitch + Math.random() * 30, pan);
                    }
                }
            } else if (this._talker && (!near || nearD > TALK_RANGE * 1.25)) {
                this._talker = null;
                this._hideSubtitle();
            }
        }

        /** What a figure says, which is whatever the chains say, in its name. */
        _say(app) {
            let line = dreamPhrase(Math.random, 4 + Math.floor(Math.random() * 8));
            if (!line) return;
            // A dream that repeats itself repeats itself.
            if (this._laws.echo) line = line + '   ' + line.split(' ').slice(-2).join(' ');
            app.said++;
            this._showSubtitle(app.name, line);
        }

        _showSubtitle(who, line) {
            const d = this._subtitleDiv;
            if (!d) return;
            d.innerHTML = '';
            const name = document.createElement('div');
            name.style.cssText = 'font:11px monospace;letter-spacing:3px;opacity:0.55;margin-bottom:3px;';
            name.textContent = String(who || '').toUpperCase();
            const text = document.createElement('div');
            text.style.cssText = 'font:17px monospace;letter-spacing:1px;';
            text.textContent = line;
            d.appendChild(name);
            d.appendChild(text);
            d.style.opacity = '1';
        }

        _hideSubtitle() {
            if (this._subtitleDiv) this._subtitleDiv.style.opacity = '0';
        }

        // ---- guests: the other games' furniture ------------------------------
        _spawnGuests() {
            const keys = this._dream.guests || [];
            if (!keys.length) return;
            const protos = {};
            for (const k of keys) {
                if (k === 'camper') continue;
                try { protos[k] = GUESTS[k](); } catch (e) { /* skip a broken shape */ }
            }
            const built = Object.keys(protos);
            for (let i = 0; i < this._dream.guestCount; i++) {
                const key = built.length ? built[Math.floor(this._rnd() * built.length)] : null;
                if (!key) break;
                const obj = protos[key].clone(true);
                // A dream has no sense of scale: some of them are the size of a
                // house and one in twenty is the size of a hill.
                let s = 0.7 + this._rnd() * 2.4;
                if (this._rnd() < 0.05) s *= 5 + this._rnd() * 9;
                obj.scale.setScalar(s);
                const g = {
                    obj: obj, key: key, scale: s,
                    x: this._rnd() * this._worldW, z: this._rnd() * this._worldH,
                    spin: (this._rnd() - 0.5) * 1.4,
                    bob: this._rnd() * TAU,
                    bobSpd: 0.4 + this._rnd() * 1.6,
                    lift: this._rnd() < 0.35 ? 14 + this._rnd() * 60 : 0
                };
                obj.rotation.y = this._rnd() * TAU;
                if (window.PSXShader) window.PSXShader.applyToObject(obj);
                this._scene.add(obj);
                this._guests.push(g);
            }
            // The party's own camper, if the dream asked for it and the model is
            // on disk. It arrives late; the dream carries on without it.
            if (keys.indexOf('camper') >= 0) {
                loadCamperProto((proto) => {
                    if (!dreamActive || !this._scene) return;
                    for (let i = 0; i < 2; i++) {
                        const obj = proto.clone(true);
                        const g = {
                            obj: obj, key: 'camper', scale: 1,
                            x: this._rnd() * this._worldW, z: this._rnd() * this._worldH,
                            spin: 0, bob: this._rnd() * TAU, bobSpd: 0.3, lift: 0
                        };
                        obj.rotation.y = this._rnd() * TAU;
                        obj.userData.dreamForeign = true;   // the GLB owns its buffers
                        if (window.PSXShader) window.PSXShader.applyToObject(obj);
                        this._scene.add(obj);
                        this._guests.push(g);
                    }
                });
            }
        }

        _updateGuests(delta) {
            const P = this._controller.yaw.position;
            const W = this._worldW, H = this._worldH;
            const wrap = (v, c, S) => { let d = v - c; d -= Math.round(d / S) * S; return c + d; };
            for (const g of this._guests) {
                g.bob += g.bobSpd * delta;
                g.x = wrap(g.x, P.x, W); g.z = wrap(g.z, P.z, H);
                const gy = this.heightAt(g.x, g.z);
                g.obj.position.set(g.x, gy + g.lift + (g.lift ? Math.sin(g.bob) * 4 : 0), g.z);
                if (g.spin) g.obj.rotation.y += g.spin * delta;
            }
        }

        // =====================================================================
        // The weapon in the sleeper's hand, used on what is wandering about.
        //
        // A blade only reaches what is in front of the sleeper; a gun reaches
        // most of the way to the fog. Three or four blows and the thing stops
        // being a creature: it collapses into a primitive, or into a piece of
        // furniture out of another game, and the dream pays for it in
        // Knowledge.
        // =====================================================================
        strike(kind) {
            if (this._menuOpen || this._transitioning) return;
            const P = this._controller.yaw.position;
            const dir = new THREE.Vector3();
            this._camera.getWorldDirection(dir);
            const melee = kind !== 'ranged';
            const reach = melee ? 52 : 1100;
            const cosLimit = melee ? 0.55 : 0.985;   // a swing is wide, a shot is not

            let best = null, bestD = Infinity, bestKind = null;
            // Everything in the dream that can answer a blow is scanned the same
            // way: a wandering 3D battler and a standing apparition are both
            // just something in front of the sleeper at a distance.
            const consider = (x, y, z, hitR, target, kind) => {
                const dx = x - P.x, dy = y - P.y, dz = z - P.z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d > reach + hitR) return;
                // How wide the thing looks from here: a big one is easier to hit
                // at the same range than a small one, and anything the sleeper is
                // standing inside is hit whatever they are looking at.
                const spread = Math.min(0.9, hitR / Math.max(hitR, d));
                const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
                if (d > hitR && dot < cosLimit - spread * (melee ? 0.45 : 0.06)) return;
                if (d < bestD) { bestD = d; best = target; bestKind = kind; }
            };

            for (const ent of this._enemies) {
                if (!ent.ready || ent.dead || !ent.model || !ent.model.model) continue;
                const rp = ent.model.model.position;
                // Aim at the middle of the creature, not its feet: a battler's
                // root sits on the ground and a tall one was being shot under.
                consider(rp.x, rp.y + ent.scale * 4, rp.z, 6 + ent.scale * 3.4, ent, 'enemy');
            }
            for (const app of this._apparitions) {
                if (app.dead || !app.mesh.visible) continue;
                const mp = app.mesh.position;
                // A figure is a standing card, not a ball. Read it at the point
                // of its OWN height nearest the sleeper's eyes: a walking sprite
                // is struck at chest height, and one the size of a house is
                // struck where the sleeper is looking rather than fifty units
                // over their head, which is what used to make the directional
                // NPCs unhittable while the monster cards answered a blow.
                const half = Math.max(4, app.h * 0.5);
                const aimY = Math.max(mp.y - half, Math.min(mp.y + half, P.y));
                // Its width is what a blow has to find, floored so a small
                // sprite standing at arm's length is not a pinhead.
                consider(mp.x, aimY, mp.z, Math.max(5, app.w * 0.5), app, 'apparition');
            }
            if (!best) return;
            if (bestKind === 'apparition') this._woundApparition(best, melee ? 1 : 1.4);
            else this._wound(best, melee ? 1 : 1.4);
        }

        _wound(ent, amount) {
            ent.hp -= amount;
            ent.flash = 0.22;
            const sfx = this._dream.sfx;
            dreamSe(sfx.hit[Math.floor(Math.random() * sfx.hit.length)], 70,
                sfx.pitch + Math.random() * sfx.spread, 0);
            if (typeof SoundManager !== 'undefined') SoundManager.playEnemyDamage();
            if (ent.hp > 0) return;
            this._transform(ent);
        }

        /**
         * An apparition struck. It is a picture, so it does not fall over: it
         * goes, in a flash of whatever this dream flashes with, and pays in
         * Knowledge on the way out.
         */
        _woundApparition(app, amount) {
            app.hp -= amount;
            app.flash = 0.26;
            const sfx = this._dream.sfx;
            dreamSe(sfx.hit[Math.floor(Math.random() * sfx.hit.length)], 65,
                sfx.pitch + Math.random() * sfx.spread, 0);
            if (app.hp > 0) {
                dreamSe(app.voice, 60, sfx.pitch + 20 + Math.random() * 40, 0);
                return;
            }
            app.dead = true;
            if (this._talker === app) { this._talker = null; this._hideSubtitle(); }
            dreamSe(sfx.gone[Math.floor(Math.random() * sfx.gone.length)], 75,
                sfx.pitch + Math.random() * sfx.spread, 0);
            if (app.mesh.parent) app.mesh.parent.remove(app.mesh);
            if (app.mesh.geometry) app.mesh.geometry.dispose();
            if (app.mat) app.mat.dispose();
            // A cloned texture is this figure's alone; the sheet it was cut out
            // of is cached for the session and is NOT touched.
            if (app.tex && app.tex.dispose) app.tex.dispose();
            // What a figure was worth is what it was: a thing the size of a
            // house is worth more than a mouse standing in a field.
            DreamSystem.awardKP(2 + Math.floor(Math.random() * 5) + Math.floor(app.h / 18), this);
        }

        /**
         * What a thing killed in a dream turns into: a bare primitive, or a
         * piece of another game's furniture. Never a corpse, because a dream
         * has never seen one.
         */
        _transform(ent) {
            ent.dead = true;
            const root = ent.model && ent.model.model;
            const at = root ? root.position.clone() : new THREE.Vector3(ent.x, 0, ent.z);
            if (root) {
                this._scene.remove(root);
                if (ent.model.dispose) { try { ent.model.dispose(); } catch (e) { /* Battler3D owns it */ } }
            }

            const pal = this.regionAt(at.x, at.z);
            const r = this._rnd;
            let obj;
            if (r() < 0.35) {
                // Somebody else's furniture entirely.
                const key = GUEST_KEYS[Math.floor(r() * GUEST_KEYS.length)];
                try { obj = GUESTS[key](); } catch (e) { obj = null; }
            }
            if (!obj) {
                const shapes = [
                    () => new THREE.Mesh(new THREE.IcosahedronGeometry(6, 0), dmat(pal.accent2, { glow: 0.55 })),
                    () => new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9), dmat(pal.accent, { glow: 0.4 })),
                    () => new THREE.Mesh(new THREE.ConeGeometry(5, 13, 5), dmat(pal.accent2, { glow: 0.5 })),
                    () => new THREE.Mesh(new THREE.TorusKnotGeometry(5, 1.5, 40, 6), dmat(pal.pale, { glow: 0.6 })),
                    () => new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), dmat(pal.accent, { glow: 0.45 }))
                ];
                obj = knit(put(shapes[Math.floor(r() * shapes.length)](), 0, 6, 0));
            }
            obj.scale.setScalar(Math.max(0.8, ent.scale * 0.8));
            obj.position.copy(at);
            if (window.PSXShader) window.PSXShader.applyToObject(obj);
            this._scene.add(obj);
            this._guests.push({
                obj: obj, key: 'remains', scale: ent.scale,
                x: at.x, z: at.z, spin: (r() - 0.5) * 2.4,
                bob: 0, bobSpd: 0.8, lift: r() < 0.5 ? 8 + r() * 26 : 0
            });

            ent.model = null;
            const sfx = this._dream.sfx;
            dreamSe(sfx.gone[Math.floor(r() * sfx.gone.length)], 72,
                sfx.pitch + r() * sfx.spread, 0);
            DreamSystem.awardKP(3 + Math.floor(r() * 6) + Math.floor(ent.scale), this);
        }

        /**
         * Where a memory stands: a ring around the tile the sleeper woke on,
         * its radius set by how old the memory is. The field is toroidal and
         * every entity is re-wrapped to the image nearest the sleeper on the
         * next frame, so a position outside the period is not a mistake.
         */
        _memoryPos(rec, rnd) {
            const maxR = this._memoryMaxR;
            const r = Math.max(26, (1 - rec.rec) * maxR + (rnd() - 0.5) * maxR * 0.14);
            const a = rnd() * TAU;
            return { x: this._spawnX + Math.cos(a) * r, z: this._spawnZ + Math.sin(a) * r };
        }

        // ---- 3D battlers ----------------------------------------------------
        // The creatures standing about are the ones the party has actually met,
        // wherever the diary remembers any: same models, same wild scales, same
        // behaviours as a dream that belongs to nobody, only picked from the
        // party's own life and placed by how long ago it happened. A share is
        // still dealt at random, because a dream is not an inventory.
        _spawnEnemies() {
            if (!window.Battler3D || typeof window.Battler3D.list !== 'function') return;
            const keys = window.Battler3D.list();
            if (!keys || keys.length === 0) return;

            const memory = (this._memory && this._memory.creatures.length) ? this._memory.creatures : null;
            const dread = DreamSystem.dread ? DreamSystem.dread() : 0;
            // More of them the longer the party has been awake: the field fills
            // up with what it has fought as the sleep debt does.
            const count = Math.round(ENEMY_COUNT * (1 + dread * 0.7));

            for (let i = 0; i < count; i++) {
                // Three quarters of them out of the diary, the rest whatever the
                // dream feels like putting there.
                const rec = (memory && Math.random() < 0.75)
                    ? DreamMemory.pick(memory, Math.random) : null;
                const key = rec ? rec.key : keys[Math.floor(Math.random() * keys.length)];
                // Randomize generation to extremes: null battler -> fully random
                // body shape / texture / colour; random weapon type; wild scale.
                const weapon = Math.floor(Math.random() * 12) + 1;
                let model;
                try {
                    model = window.Battler3D.create(key, 1.0, 0, null, weapon);
                } catch (e) { model = null; }
                if (!model) continue;

                let wx, wz;
                if (rec) {
                    const at = this._memoryPos(rec, Math.random);
                    wx = at.x; wz = at.z;
                } else {
                    wx = Math.floor(Math.random() * this._w) * CELL + CELL * 0.5;
                    wz = Math.floor(Math.random() * this._h) * CELL + CELL * 0.5;
                }
                const gy = this.heightAt(wx, wz);

                // Gait derived from the model key's metadata (flyers/swimmers hover,
                // walkers/runners roam the ground). See Battler3D.resolveLocomotion.
                const gait = rec ? rec.gait
                    : ((window.Battler3D.gaitForKey ? window.Battler3D.gaitForKey(key) : 'walk') || 'walk');
                let behavior;
                if (gait === 'fly' || gait === 'swim') behavior = 'float';
                else behavior = Math.random() < 0.75 ? 'wander' : 'still';

                // Enemies loom large; a rare few are colossal, LSD-nightmare scale.
                let scale = 1.6 + Math.random() * Math.random() * 9;   // big, upward-skewed
                if (Math.random() < 0.05) scale *= 4 + Math.random() * 6;   // rare gigantic
                const ent = {
                    model, behavior, gait,
                    // What it takes to stop being a creature. A bigger thing
                    // stands up to more, but nothing takes more than six blows:
                    // a dream is not a boss fight.
                    hp: Math.min(6, 2 + Math.floor(scale / 2.5)),
                    dead: false, flash: 0,
                    baseY: gy,
                    bob: Math.random() * Math.PI * 2,
                    bobSpd: 0.5 + Math.random() * 2.5,
                    yaw: Math.random() * Math.PI * 2,
                    turn: (Math.random() - 0.5) * 1.2,
                    speed: 8 + Math.random() * 26,
                    scale: scale,
                    floatH: 18 + Math.random() * 70 + scale * 3,
                    ready: false,
                    x: wx, z: wz
                };
                this._enemies.push(ent);

                // Async build, then attach into the scene.
                Promise.resolve(model.load(null, wx, gy, wz)).then(() => {
                    if (!dreamActive || !model.model) return;
                    const root = model.model;
                    // Mirror the battle scene's facing wrapper for non-bipedal models.
                    if (model.facingYaw && !model._facingApplied) {
                        model._facingApplied = true;
                        const inner = new THREE.Group();
                        inner.rotation.y = model.facingYaw;
                        const kids = root.children.slice();
                        for (const k of kids) inner.add(k);
                        root.add(inner);
                    }
                    root.scale.multiplyScalar(ent.scale);   // bypass the battle fit-clamp
                    // What the model rests at, which is NOT ent.scale: the
                    // battler arrives with a fit scale of its own and this is
                    // that times the dream's. The flinch is measured off it.
                    ent.restScale = root.scale.x;
                    root.position.set(wx, gy + (behavior === 'float' ? ent.floatH : 0), wz);
                    root.rotation.y = ent.yaw;
                    if (window.PSXShader) window.PSXShader.applyToObject(root);
                    root.userData.dreamBattler = true; // foreign: skip in dispose()
                    this._scene.add(root);
                    try {
                        if (ent.gait === 'idle') { model.playIdleAnimation(); }
                        else { model.setGaitSpeed(2 + Math.floor(Math.random() * 4)); model.playGait(ent.gait); }
                    } catch (e) { /* some families auto-idle */ }
                    ent.ready = true;
                }).catch(err => console.warn('[DreamSystem] enemy load failed:', err));
            }
        }

        _updateEnemies(delta) {
            const P = this._controller.yaw.position;
            const W = this._worldW, H = this._worldH;
            // Map a coordinate to the periodic image nearest the player, so entities
            // always haunt the sleeper no matter how far they roam through the loop.
            const wrap = (v, c, S) => { let d = v - c; d -= Math.round(d / S) * S; return c + d; };

            for (const ent of this._enemies) {
                if (ent.dead) continue;
                const m = ent.model;
                if (m && typeof m.update === 'function') { try { m.update(delta); } catch (e) { /* ignore */ } }
                if (!ent.ready || !m || !m.model) continue;
                const root = m.model;

                // A struck thing flinches: the only feedback a dream gives.
                const rest = ent.restScale || root.scale.x;
                if (ent.flash > 0) {
                    ent.flash = Math.max(0, ent.flash - delta);
                    root.scale.setScalar(rest * (1 + ent.flash * 1.4));
                } else if (root.scale.x !== rest) {
                    root.scale.setScalar(rest);
                }

                ent.bob += ent.bobSpd * delta;
                if (ent.behavior === 'wander') {
                    ent.yaw += ent.turn * delta;
                    ent.x += Math.sin(ent.yaw) * ent.speed * delta;
                    ent.z += Math.cos(ent.yaw) * ent.speed * delta;
                    if (Math.random() < 0.01) ent.turn = (Math.random() - 0.5) * 1.6;
                    ent.x = wrap(ent.x, P.x, W); ent.z = wrap(ent.z, P.z, H);
                    const gy = this.heightAt(ent.x, ent.z);
                    root.position.set(ent.x, gy + Math.abs(Math.sin(ent.bob)) * 1.5, ent.z);
                    root.rotation.y = ent.yaw + Math.PI;
                } else if (ent.behavior === 'float') {
                    ent.x = wrap(ent.x, P.x, W); ent.z = wrap(ent.z, P.z, H);
                    ent.baseY = this.heightAt(ent.x, ent.z);
                    root.position.set(ent.x, ent.baseY + ent.floatH + Math.sin(ent.bob) * 6, ent.z);
                    root.rotation.y += delta * 0.4;
                } else {
                    // still: gentle breathing bob only.
                    ent.x = wrap(ent.x, P.x, W); ent.z = wrap(ent.z, P.z, H);
                    ent.baseY = this.heightAt(ent.x, ent.z);
                    root.position.set(ent.x, ent.baseY + Math.sin(ent.bob) * 0.8, ent.z);
                }
            }

            // Touching a dream entity: LSD flash + shift to another dream map. The
            // hitbox scales with the entity, so the gigantic ones loom and grab early.
            // A brief grace period stops a just-spawned entity from shifting instantly.
            if (!this._transitioning && !this._menuOpen && this._time > 1.2) {
                for (const ent of this._enemies) {
                    // Something the sleeper has already put down is only
                    // scenery now, and no longer moves the dream on.
                    if (ent.dead || !ent.ready || !ent.model || !ent.model.model) continue;
                    const rp = ent.model.model.position;
                    const dx = rp.x - P.x, dz = rp.z - P.z;
                    const r = 7 + ent.scale * 3.2;
                    if (dx * dx + dz * dz < r * r) {
                        this._transitioning = true;
                        DreamSystem.collideShift();
                        break;
                    }
                }
            }
        }

        /**
         * Some regions are places the dream is already thinking of leaving.
         * Stand in one long enough and the whole world shifts to another dream,
         * which is how a sleeper wanders out of a corridor and into a drowned
         * city without ever finding a door. The dream says so first, so it
         * reads as somewhere rather than as a glitch.
         */
        _updateDrift(delta) {
            if (this._transitioning || this._menuOpen) return;
            const P = this._controller.yaw.position;
            // A drift region is a patch of GROUND the sleeper is standing in.
            // Up in the levels they are only over it, several hundred units and
            // a floor or two away, and the dream has no business changing.
            if (this.tierAt(P.y) >= 0) { this._driftTime = 0; return; }
            const rg = this.regionAt(P.x, P.z);
            if (!rg || !rg.drift) {
                this._driftTime = 0;
                this._driftWarned = false;
                return;
            }
            this._driftTime += delta;
            if (this._driftTime > 2.2 && !this._driftWarned) {
                this._driftWarned = true;
                this.showToast(T('Dream.drifting', { place: rg.name }));
                // Whatever was said last has been taken off the climb; let the
                // next level crossed announce itself again.
                this._tierShown = null;
            }
            if (this._driftTime > DRIFT_SECONDS) {
                this._transitioning = true;
                this._driftWarned = false;
                DreamSystem.collideShift();
            }
        }

        /**
         * Upward there is no ceiling, no last floor and no way out: over the
         * rolled ground the dream is stacked in LEVELS, one every TIER_H units,
         * and the stack does not end. Only the handful of levels the sleeper is
         * among is ever standing; the rest are a number nobody has asked about
         * yet, so climbing costs the same at level 4 and at level 4,000.
         *
         * What it answers is how far into the stack the sleeper has got, which
         * is what thickens the air and pulls the sky over to the colour of the
         * stratum they are climbing through.
         */
        _updateAscent(delta, P) {
            if (this._transitioning || this._menuOpen) return 0;
            this._updateTiers(P);

            const alt = P.y - this.heightAt(P.x, P.z);
            const t = Math.max(0, Math.min(1, (alt - TIER_BASE * 0.4) / (TIER_BASE + TIER_H * 2)));
            this._skyDrift = t;

            const k = this.tierAt(P.y);
            const theme = this._tierTheme(k);
            this._tierSky = theme.sky;

            // The level is announced as it is crossed into, and the first level
            // of a stratum is announced with the name of the stratum, since
            // that is the one thing about a climb that ever changes.
            if (k !== this._tierShown) {
                const was = this._tierShown === null ? -1 : Math.floor(Math.max(0, this._tierShown) / TIER_THEME);
                const first = this._tierShown === null;
                this._tierShown = k;
                // Coming back down to the ground says nothing: the sleeper is
                // simply where they started, and has already been told where
                // that is.
                if (k < 0) {
                    if (!first) this.showToast(this._dream.name);
                } else if (theme.block !== was) {
                    this.showToast(T('Dream.levelNew', { n: k + 1, place: theme.name }));
                } else {
                    this.showToast(T('Dream.level', { n: k + 1 }));
                }
            }
            return t;
        }

        /** Which level of the stack a height is on; under the first one, negative. */
        tierAt(y) {
            return Math.floor((y - TIER_BASE) / TIER_H);
        }

        /**
         * The colour and the name the stack is wearing at this height. A
         * stratum lasts TIER_THEME levels and then the whole thing changes
         * register, so a long climb passes through one place after another
         * without ever arriving anywhere. The lowest stratum is the dream's
         * own: the first levels overhead are this place continued upward.
         */
        _tierTheme(k) {
            const block = Math.floor(Math.max(0, k) / TIER_THEME);
            const hit = this._tierThemes.get(block);
            if (hit) return hit;
            let rec;
            if (block === 0) {
                const rg = this._regions[this._dream.dominant] || this._regions[0];
                rec = { block: block, pal: rg, sky: this._dream.sky, name: this._dream.name };
            } else {
                const rnd = dreamRng(((this._dream.seed ^ 0x9e3779b9) + block * 2654435761) >>> 0);
                const pal = rollPalette(rnd, MOOD_KEYS[Math.floor(rnd() * MOOD_KEYS.length)]);
                rec = { block: block, pal: pal, sky: pal.sky, name: rollNames(rnd, 1)[0] };
            }
            this._tierThemes.set(block, rec);
            return rec;
        }

        /**
         * Builds the levels the sleeper is among and drops the ones they have
         * left, one level a frame at most: a level is a thousand-odd pieces and
         * building two of them in one frame is a hitch anybody would see.
         */
        _updateTiers(P) {
            const k = this.tierAt(P.y);
            const lo = Math.max(0, k - TIER_BELOW), hi = Math.max(0, k + TIER_ABOVE);
            for (const key of Array.from(this._tiers.keys())) {
                if (key < lo || key > hi) this._dropTier(key);
            }
            for (let i = lo; i <= hi; i++) {
                if (!this._tiers.has(i)) { this._buildTier(i); return; }
            }
        }

        /**
         * One level, drawn and made solid out of the same list.
         *
         * The pieces are laid out over one world period and then WRAPPED: a
         * copy is emitted for every side of the period the piece stands near
         * enough to be seen across, since the sleeper is kept inside one period
         * and the fog reaches MARGIN past its edge. Everything is a box or a
         * cylinder, so a whole level is a few InstancedMeshes grouped by
         * colour, and the solid ones go into a coarse bucket map that the
         * collision query reads nine buckets of.
         */
        _buildTier(k) {
            if (this._tiers.has(k)) return;
            const theme = this._tierTheme(k);
            const W = this._worldW, H = this._worldH;
            const rnd = dreamRng(((this._dream.seed ^ 0x5f356495) + (k + 1) * 40503) >>> 0);
            const items = [];
            const ctx = {
                k: k, base: TIER_BASE + k * TIER_H, pal: theme.pal, rnd: rnd, W: W, H: H,
                groundY: (x, z) => this.heightAt(x, z),
                box: (x, y, z, sx, sy, sz, col, o) => {
                    items.push({ cyl: 0, x: x, y: y, z: z, sx: sx, sy: sy, sz: sz,
                                 col: col, glow: (o && o.glow) || 0, solid: !(o && o.ghost) });
                },
                // Placed by the surface that is walked on rather than by the
                // middle, because nearly everything on a level is a floor.
                slab: (x, top, z, sx, t, sz, col, o) => {
                    ctx.box(x, top - t * 0.5, z, sx, t, sz, col, o);
                },
                cyl: (x, y, z, d, len, axis, col, o) => {
                    items.push({ cyl: 1, axis: axis, x: x, y: y, z: z, sx: d, sy: len, sz: d,
                                 col: col, glow: (o && o.glow) || 0, solid: !(o && o.ghost) });
                }
            };
            tierColumns(ctx);
            // The lowest level is always one of the open forms. A deck of
            // plates hung over the ground would be a lid on the dream, and the
            // sky the dream rolled for itself - its weather, its black hole -
            // would never be seen from the floor again. The pick is a draw off
            // the level's own stream rather than a hash of its number: the
            // number and the stratum it belongs to move together, and the hash
            // deals a stack of the same form off correlated pairs.
            const roll = rnd();
            const form = k === 0 ? (roll < 0.5 ? 'girders' : 'islands')
                : TIER_FORM_KEYS[Math.floor(roll * TIER_FORM_KEYS.length)];
            (TIER_FORMS[form] || TIER_FORMS.deck)(ctx);
            tierRiser(ctx);

            // ---- what is drawn ----------------------------------------------
            const groups = new Map();
            const dummy = new THREE.Object3D();
            for (const it of items) {
                const key = it.cyl + '|' + it.col + '|' + it.glow + '|' + (it.axis || 'y');
                let grp = groups.get(key);
                if (!grp) { grp = { it: it, mats: [] }; groups.set(key, grp); }
                // A cylinder's length runs along whichever axis it was laid on,
                // so its reach is read off `sy` there and off its diameter on
                // the other two: a main spanning the world is 3,840 units long
                // and twenty thick, and judging it by the twenty would cull the
                // copy that covers the seam.
                const ex = (it.cyl && it.axis === 'x' ? it.sy : it.sx) * 0.5;
                const ez = (it.cyl && it.axis === 'z' ? it.sy : it.sz) * 0.5;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const x = it.x + dx * W, z = it.z + dz * H;
                        // A piece is only copied to a side of the period it can
                        // actually be seen from, and a piece that spans the
                        // whole period is judged by its far end, not its middle.
                        if (x + ex < -MARGIN || x - ex > W + MARGIN) continue;
                        if (z + ez < -MARGIN || z - ez > H + MARGIN) continue;
                        dummy.position.set(x, it.y, z);
                        dummy.rotation.set(it.cyl && it.axis === 'z' ? Math.PI / 2 : 0, 0,
                                           it.cyl && it.axis === 'x' ? Math.PI / 2 : 0);
                        dummy.scale.set(it.sx, it.sy, it.sz);
                        dummy.updateMatrix();
                        grp.mats.push(dummy.matrix.clone());
                    }
                }
            }
            const meshes = [];
            groups.forEach((grp) => {
                if (!grp.mats.length) return;
                const it = grp.it;
                const geo = it.cyl ? new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
                                   : new THREE.BoxGeometry(1, 1, 1);
                const mesh = new THREE.InstancedMesh(geo, dmat(it.col, { glow: it.glow }), grp.mats.length);
                for (let i = 0; i < grp.mats.length; i++) mesh.setMatrixAt(i, grp.mats[i]);
                mesh.instanceMatrix.needsUpdate = true;
                // The copies span the whole overscan, which no bounding sphere
                // of a unit box describes.
                mesh.frustumCulled = false;
                this._scene.add(mesh);
                if (window.PSXShader) window.PSXShader.applyToObject(mesh);
                meshes.push(mesh);
            });

            // ---- what is stood on -------------------------------------------
            const nbx = Math.max(1, Math.round(W / TIER_BUCKET));
            const nbz = Math.max(1, Math.round(H / TIER_BUCKET));
            const buckets = new Map();
            let y0 = Infinity, y1 = -Infinity;
            for (const it of items) {
                if (!it.solid) continue;
                // A cylinder is collided with as the box around it, which for a
                // main means its top is walked along and its flanks stop you.
                const hx = (it.cyl && it.axis === 'x' ? it.sy : it.sx) * 0.5;
                const hz = (it.cyl && it.axis === 'z' ? it.sy : it.sz) * 0.5;
                const hy = (it.cyl && it.axis !== 'y' ? it.sx : it.sy) * 0.5;
                const b = { x: ((it.x % W) + W) % W, z: ((it.z % H) + H) % H,
                            y0: it.y - hy, y1: it.y + hy, hx: hx, hz: hz };
                if (b.y0 < y0) y0 = b.y0;
                if (b.y1 > y1) y1 = b.y1;
                const x0 = Math.floor((b.x - hx) / TIER_BUCKET), x1 = Math.floor((b.x + hx) / TIER_BUCKET);
                const z0 = Math.floor((b.z - hz) / TIER_BUCKET), z1 = Math.floor((b.z + hz) / TIER_BUCKET);
                for (let bx = x0; bx <= x1; bx++) {
                    for (let bz = z0; bz <= z1; bz++) {
                        const key = (((bx % nbx) + nbx) % nbx) * 4096 + (((bz % nbz) + nbz) % nbz);
                        const list = buckets.get(key);
                        if (list) list.push(b); else buckets.set(key, [b]);
                    }
                }
            }
            this._tiers.set(k, { form: form, meshes: meshes, buckets: buckets,
                                 nbx: nbx, nbz: nbz, y0: y0, y1: y1 });
        }

        _dropTier(k) {
            const rec = this._tiers.get(k);
            if (!rec) return;
            this._tiers.delete(k);
            for (const m of rec.meshes) {
                this._scene.remove(m);
                // The unit box and the unit cylinder are this level's own; the
                // material is the dream's (dmat) and is left for the next one.
                if (m.geometry) m.geometry.dispose();
                if (m.dispose) m.dispose();
            }
        }

        /**
         * Whatever of the stack is standing where the sleeper is, appended to
         * `out` the way _solidsNear appends everything else. The world has no
         * edges, so a piece is handed over at whichever copy of itself is
         * nearest the sleeper (minimum image) rather than where it was laid.
         */
        _tierSolids(px, pz, py, out) {
            if (!this._tiers.size) return;
            const W = this._worldW, H = this._worldH;
            const wx = ((px % W) + W) % W, wz = ((pz % H) + H) % H;
            const bx0 = Math.floor(wx / TIER_BUCKET), bz0 = Math.floor(wz / TIER_BUCKET);
            this._tiers.forEach((rec) => {
                if (py < rec.y0 - 120 || py > rec.y1 + 120) return;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const key = ((((bx0 + dx) % rec.nbx) + rec.nbx) % rec.nbx) * 4096
                                  + ((((bz0 + dz) % rec.nbz) + rec.nbz) % rec.nbz);
                        const list = rec.buckets.get(key);
                        if (!list) continue;
                        for (const b of list) {
                            let x = b.x, z = b.z;
                            if (x - px > W * 0.5) x -= W; else if (px - x > W * 0.5) x += W;
                            if (z - pz > H * 0.5) z -= H; else if (pz - z > H * 0.5) z += H;
                            if (Math.abs(x - px) > b.hx + 40 || Math.abs(z - pz) > b.hz + 40) continue;
                            out.push({ x: x, z: z, y0: b.y0, y1: b.y1, hx: b.hx, hz: b.hz });
                        }
                    }
                }
            });
        }

        // ---- what a dream sounds like ---------------------------------------
        /**
         * The ambience belongs to the REGION, so it changes underfoot as the
         * sleeper crosses from one place into the next; the sound effects hang
         * on the things in the dream and go off at whatever distance they are
         * standing at.
         */
        _updateAudio(delta, P) {
            if (typeof AudioManager === 'undefined') return;
            const rg = this.regionAt(P.x, P.z);
            const want = (rg && rg.bgs) || null;
            if (want !== this._bgsName) {
                this._bgsName = want;
                try {
                    if (want) AudioManager.playBgs({ name: want, volume: 62, pitch: 100, pan: 0 });
                    else AudioManager.stopBgs();
                } catch (e) { /* the file is not there; a dream can be quiet */ }
            }

            // The noises the place makes to itself, and the things in it. Rare
            // on purpose: a sound heard every few seconds stops being a dream
            // making a noise and becomes the soundtrack.
            this._seTimer -= delta;
            if (this._seTimer > 0) return;
            const sfx = this._dream.sfx;
            this._seTimer = 14 + Math.random() * 26;
            const r = Math.random();
            if (r < 0.45) {
                // Somewhere off in the dream, out of sight.
                dreamSe(sfx.noise[Math.floor(Math.random() * sfx.noise.length)],
                    18 + Math.random() * 26, sfx.pitch + Math.random() * sfx.spread,
                    (Math.random() - 0.5) * 160);
                return;
            }
            // Something that is actually standing there, at the volume its
            // distance earns it.
            const pool = [];
            for (const e of this._enemies) if (!e.dead && e.ready) pool.push({ x: e.x, z: e.z });
            for (const a of this._apparitions) if (!a.dead) pool.push({ x: a.x, z: a.z, voice: a.voice });
            if (!pool.length) return;
            const it = pool[Math.floor(Math.random() * pool.length)];
            const d = Math.hypot(it.x - P.x, it.z - P.z);
            if (d > 900) return;
            const name = it.voice || sfx.voice[Math.floor(Math.random() * sfx.voice.length)];
            dreamSe(name, Math.round(70 * (1 - d / 900)),
                sfx.pitch + Math.random() * sfx.spread, Math.max(-100, Math.min(100, (it.x - P.x) * 0.3)));
            // A dream where nothing ever speaks alone.
            if (this._laws.chorus) {
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        if (!dreamActive) return;
                        dreamSe(sfx.voice[Math.floor(Math.random() * sfx.voice.length)],
                            22 + Math.random() * 26, sfx.pitch + Math.random() * 50,
                            (Math.random() - 0.5) * 190);
                    }, 90 + i * (70 + Math.random() * 220));
                }
            }
        }

        // ---- main loop ------------------------------------------------------
        _loop(now) {
            this._animId = requestAnimationFrame(this._loop);
            if (this._lastTime === null) { this._lastTime = now; return; }
            let delta = Math.min((now - this._lastTime) / 1000, 0.1);
            this._lastTime = now;
            // A dream that hitches: for a second or two at a time the whole
            // world runs at a quarter speed, the sleeper included.
            if (this._laws.stutter && Math.sin(this._time * 0.23) > 0.86) delta *= 0.22;
            this._time += delta;
            if (this._menuOpen) return;
            // A dream that never settles on how big the sleeper is.
            if (this._laws.shrinking && this._controller) {
                this._controller.eye = 9 + Math.sin(this._time * 0.08) * 6.5;
            }

            // B on the pad (and Escape, and anything else the engine reads as
            // cancel) -> the wake prompt, where the sleeper is offered their
            // own cheeks to pinch. Gamepads never emit a DOM 'Escape' keydown,
            // so the button is polled here as well as read off Input, which a
            // remapped pad can take the 'cancel' binding away from.
            if (dreamActive && typeof Input !== 'undefined' &&
                (Input.isTriggered('cancel') || padEdge('B'))) {
                this._openWakePrompt();
                return;
            }

            DreamSystem.tickInsight(delta, this);

            // A breathing dream lifts the whole world, ground and everything
            // standing on it together, so nothing is ever left hanging.
            if (this._laws.breathing) {
                this._breathY = Math.sin(this._time * 0.35) * 9 + Math.sin(this._time * 0.11) * 4;
                if (this._ground) this._ground.position.y = this._breathY;
                for (const m of this._props) m.position.y = this._breathY;
            }

            this._controller.update(delta);

            // Perfect toroidal loop: keep the sleeper inside one period. Because the
            // terrain, props and colour are all periodic, this wrap is invisible.
            const p = this._controller.yaw.position;
            p.x = ((p.x % this._worldW) + this._worldW) % this._worldW;
            p.z = ((p.z % this._worldH) + this._worldH) % this._worldH;

            // A hole in the dream has nothing under it. Fall far enough and the
            // sleeper has fallen out of this one; which one they land in is not
            // up to them.
            if (!this._transitioning && !this._menuOpen && p.y < VOID_FLOOR) {
                this._transitioning = true;
                this._hideSubtitle();
                dreamSe(this._dream.sfx.gone[0], 80, 70, 0);
                DreamSystem.collideShift();
                return;
            }

            // Walk face-first into a wall and hold against it, or simply walk
            // into it again and again: the dream strobes and lets go, and the
            // sleeper is somewhere else. Anything the sleeper collides with
            // counts, since in here everything standing is the same wall. The
            // same grace as the entities, so a dream that opens with the
            // sleeper's nose against a monolith is not over before it starts.
            if (!this._transitioning && !this._menuOpen && this._time > 1.2 &&
                (this._controller.wallPush > WALL_SECONDS ||
                 this._controller.wallBumps >= WALL_BUMPS)) {
                this._transitioning = true;
                this._controller.wallPush = 0;
                this._controller.wallBumps = 0;
                this._hideSubtitle();
                dreamSe(this._dream.sfx.gone[0], 80, 110, 0);
                DreamSystem.collideShift();
                return;
            }

            this._updateEnemies(delta);
            this._updateGuests(delta);
            this._updateApparitions(delta, p);
            this._updateCelestials(delta, p);
            this._updateWeather(delta, p);
            this._updateDrift(delta);
            this._updateAudio(delta, p);
            const rise = this._updateAscent(delta, p);

            // The weapon draws in its own overlay canvas over this one, so it
            // is ticked here rather than added to the dream scene.
            DreamWeapon.update(this._controller.spaceHeld);

            // Slow LSD sky-hue drift, and, the higher the sleeper climbs, the
            // more of the stratum they are climbing through is in the sky.
            const t = this._time * 0.05;
            this._skyA.setHex(this._dream.sky);
            this._skyA.offsetHSL(Math.sin(t) * 0.08, 0, Math.sin(t * 0.7) * 0.05);
            if (this._laws.inverted) {
                // A dream that turns itself inside out, slowly, and back again.
                const inv = (Math.sin(this._time * 0.12) * 0.5 + 0.5) * 0.85;
                this._skyB.setRGB(1 - this._skyA.r, 1 - this._skyA.g, 1 - this._skyA.b);
                this._skyA.lerp(this._skyB, inv);
            }
            if (rise > 0 && this._tierSky !== undefined) {
                this._skyB.setHex(this._tierSky);
                this._skyA.lerp(this._skyB, rise * 0.92);
            }
            this._scene.background = this._skyA;
            if (this._scene.fog) {
                this._scene.fog.color.copy(this._skyA);
                // The air up in the stack is thicker than the air on the floor,
                // which is what swallows the ground and leaves the levels
                // coming out of the haze one at a time.
                this._scene.fog.density = this._dream.fog * (1 + rise * 1.7);
            }

            if (this._water) {
                this._water.position.x = p.x;
                this._water.position.z = p.z;
                // A dream under a tide drowns slowly, and then lets it back out.
                const tide = this._laws.tide ? Math.sin(this._time * 0.045) * 40 + 40 : 0;
                this._water.position.y = this._waterY + tide + Math.sin(this._time * 1.5) * 0.6;
            }

            if (window.PSXShader) window.PSXShader.render(this._renderer, this._scene, this._camera);
            else this._renderer.render(this._scene, this._camera);
        }

        _onResize() {
            if (!this._renderer) return;
            const w = window.innerWidth, h = window.innerHeight;
            this._camera.aspect = w / h;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(w, h);
        }

        // ---- wake prompt (rendered as a DOM overlay ON the 3D dream, not RM choices)
        _openWakePrompt() {
            if (this._menuOpen) return;
            this._menuOpen = true;
            // Flush engine input so the same ESC/cancel press that opened the prompt
            // does not immediately confirm a choice.
            if (typeof Input !== 'undefined') Input.clear();
            if (typeof TouchInput !== 'undefined') TouchInput.clear();
            if (document.pointerLockElement === document.body) document.exitPointerLock();
            if (typeof SoundManager !== 'undefined') SoundManager.playOk();
            // The prompt is drawn inside the dream overlay, which the weapon
            // canvas sits on top of: take the weapon off the screen for it.
            DreamWeapon.setVisible(false);
            this._buildWakeMenu();
        }

        _buildWakeMenu() {
            const items = [T('Dream.wakeUp'), T('Dream.keepDreaming')];
            this._wakeItems = items;
            this._wakeSel = 1;
            this._wakeLock = 6;   // brief input lockout so the opening press is ignored

            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0;z-index:5;' +
                'display:flex;align-items:center;justify-content:center;' +
                'background:var(--bg-bg-alt-1-translucent-70, rgba(0,0,0,0.7));' +
                'font-family:var(--font-terminal, "Courier New", monospace);';
            const panel = document.createElement('div');
            panel.style.cssText = 'min-width:340px;padding:26px 34px;text-align:center;' +
                'background:var(--bg-panel, #0a0a0a);' +
                'border:1px solid var(--border-gold-amber, #d4a050);' +
                'box-shadow:0 0 0 1px var(--bg-base, #000) inset, 0 10px 40px var(--shadow-heavy, rgba(4,2,1,0.96));';
            const title = document.createElement('div');
            title.textContent = T('Dream.dreamThins');
            title.style.cssText = 'font-size:20px;margin-bottom:20px;letter-spacing:3px;text-transform:uppercase;' +
                'color:var(--text-primary-hover, #ffcc66);' +
                '';
            panel.appendChild(title);

            const btns = [];
            items.forEach((label, i) => {
                const b = document.createElement('div');
                b.textContent = label;
                b.style.cssText = 'font-size:17px;padding:11px 16px;margin:6px 0;cursor:pointer;' +
                    'letter-spacing:1px;border:1px solid transparent;transition:all .12s;';
                b.addEventListener('mouseenter', () => { this._wakeSel = i; this._paintWake(); });
                b.addEventListener('click', () => { this._wakeSel = i; this._confirmWake(); });
                panel.appendChild(b);
                btns.push(b);
            });
            wrap.appendChild(panel);
            this._overlay.appendChild(wrap);
            this._wakeMenu = wrap;
            this._wakeBtns = btns;
            this._paintWake();

            // Poll the engine Input so keyboard, WASD and gamepad all drive the menu
            // uniformly (the main render loop is frozen while the menu is open).
            const poll = () => {
                if (!this._wakeMenu) return;
                if (this._wakeLock > 0) { this._wakeLock--; this._wakePoll = requestAnimationFrame(poll); return; }
                if (typeof Input !== 'undefined') {
                    const n = items.length;
                    if (Input.isTriggered('up')) {
                        this._wakeSel = (this._wakeSel + n - 1) % n; this._paintWake(); this._wakeLock = 8;
                        if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
                    } else if (Input.isTriggered('down')) {
                        this._wakeSel = (this._wakeSel + 1) % n; this._paintWake(); this._wakeLock = 8;
                        if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
                    } else if (Input.isTriggered('ok')) {
                        this._confirmWake(); return;
                    } else if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
                        this._wakeSel = 1; this._confirmWake(); return;
                    }
                }
                this._wakePoll = requestAnimationFrame(poll);
            };
            this._wakePoll = requestAnimationFrame(poll);
        }

        _paintWake() {
            if (!this._wakeBtns) return;
            this._wakeBtns.forEach((b, i) => {
                if (i === this._wakeSel) {
                    b.style.color = 'var(--text-primary-hover, #ffcc66)';
                    b.style.borderColor = 'var(--border-gold-amber, #d4a050)';
                    b.style.background = 'var(--bg-primary-hover-translucent-35, rgba(255,204,102,0.08))';
                    b.style.textShadow = '0 0 10px var(--accent-amber-glow, #ffe9a8)';
                } else {
                    b.style.color = 'var(--text-info, #b89060)';
                    b.style.borderColor = 'transparent';
                    b.style.background = 'transparent';
                    b.style.textShadow = 'none';
                }
            });
        }

        _confirmWake() {
            const sel = this._wakeSel;
            this._closeWakeMenu();
            if (sel === 0) {
                if (typeof SoundManager !== 'undefined') SoundManager.playOk();
                DreamSystem.stop();
            } else {
                if (typeof SoundManager !== 'undefined') SoundManager.playCancel();
            }
        }

        _closeWakeMenu() {
            if (this._wakePoll) { cancelAnimationFrame(this._wakePoll); this._wakePoll = null; }
            if (this._wakeMenu && this._wakeMenu.parentNode) this._wakeMenu.parentNode.removeChild(this._wakeMenu);
            this._wakeMenu = null; this._wakeBtns = null;
            if (this._controller) {
                const mv = this._controller.move;
                mv.f = mv.b = mv.l = mv.r = mv.sprint = mv.up = mv.down = false;
                this._controller.spaceHeld = false;
            }
            this._menuOpen = false;
            if (typeof Input !== 'undefined') Input.clear();
            if (dreamActive) DreamWeapon.setVisible(true);
        }

        dispose() {
            if (this._animId) cancelAnimationFrame(this._animId);
            if (this._wakePoll) cancelAnimationFrame(this._wakePoll);
            if (this._flashTimer) clearTimeout(this._flashTimer);
            if (this._insightTimer) clearTimeout(this._insightTimer);
            window.removeEventListener('resize', this._onResize);
            document.removeEventListener('keydown', this._onKey);
            if (this._controller) this._controller.dispose();

            // Tear down THREE resources, but ONLY objects the dream scene owns.
            // Battler3D model roots are foreign: their geometry/materials reference
            // shared/cached singletons (e.g. _SKIN_TEX_CACHE) and are disposed by
            // Battler3D's own careful disposer. Blindly disposing them here corrupts
            // later battle/viewer renders, so skip any Battler subtree.
            const disposeObj = (o) => {
                // Foreign subtrees: a Battler3D model, a GalaxySim body, the
                // camper GLB. Their geometry and materials are shared, cached
                // singletons owned by the plugin that built them, and disposing
                // one here corrupts every later render of it.
                if (o.userData && (o.userData.dreamBattler || o.userData.dreamForeign)) return;
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
                    else o.material.dispose();
                }
                const kids = o.children ? o.children.slice() : [];
                for (const k of kids) disposeObj(k);
            };
            if (this._scene) {
                for (const child of this._scene.children.slice()) disposeObj(child);
            }
            // The canvas textures this dream drew for itself. Sprite art off the
            // disk is NOT disposed: it is cached for the session and the next
            // dream will want it (see billboardTexture).
            const canvasTex = [this._floorTex].concat(this._textTex || []);
            for (const t of canvasTex) {
                if (t && t.dispose) t.dispose();
            }
            this._floorTex = null;
            this._textTex = null;
            this._wallTexes = this._signTexes = null;
            if (this._renderer) {
                // Frees the PSX downsample render target hung on this renderer,
                // which a dream shift would otherwise leak one of every time.
                if (window.PSXShader && window.PSXShader.disposeContext) {
                    window.PSXShader.disposeContext(this._renderer);
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
            if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
            this._enemies.length = 0;
            this._props.length = 0;
            // The levels overhead went with the scene's own children above;
            // what is left is the bookkeeping.
            this._tiers.clear();
            this._tierThemes.clear();
            // The frame each apparition cut for itself, which nothing else can
            // want; the sheet it came off is cached for the session.
            for (const app of this._apparitions) {
                if (app.dead) continue;
                if (app.tex && app.tex.dispose) app.tex.dispose();
            }
            this._apparitions.length = 0;
            // A planet is painted per instance (surface, bump, specular, cloud
            // maps), and only its own renderer knows how to let go of them.
            const R3D = window.GalaxySim && window.GalaxySim.Renderer3D;
            for (const c of this._celestials) {
                if (!c.obj || !c.obj.planet || !R3D || !R3D.disposeBodyGroup) continue;
                try { R3D.disposeBodyGroup(c.obj.group); } catch (e) { /* it owns the call */ }
            }
            this._celestials.length = 0;
            this._subtitleDiv = null;
            this._talker = null;
        }
    }

    // =========================================================================
    // DreamSystem manager (static entry point).
    // =========================================================================
    const DreamSystem = {
        _scene: null,
        _psxBackup: null,
        _insightClock: 0,       // seconds dreamt since the last roll
        _insightTotal: 0,       // Knowledge carried out of this sleep

        // True while the dream is being had for its own sake, out of the
        // title-screen arcade rather than out of a bed. Nothing is announced in
        // there: it is a place to walk about in, not a night's work.
        _sandbox: false,
        _onWake: null,

        // What this sleep is about, and how badly the sleeper needed it. Both
        // are settled ONCE, when the eyes close, and held for the whole night:
        // falling from one dream into the next is still the same night's sleep,
        // so the memories standing in it and the dread over it do not change
        // between them.
        _memory: null,
        _dread: 0,

        isActive() { return !!this._scene; },
        isSandbox() { return !!this._sandbox; },

        /** The party's own life, or null for a dream that belongs to nobody. */
        memory() { return this._memory; },

        /**
         * How far past a night's rest the party is, 0..1, read once at the
         * start of the sleep. A dream out of the arcade is never dreadful: it
         * is nobody's night and there is nobody in it to be tired.
         */
        dread() { return this._dread; },

        /**
         * Knowledge the dream hands over, from an insight or from something the
         * sleeper put down. Announced in the dream itself, since the game canvas
         * is not being drawn; silent in the arcade.
         */
        awardKP(amount, scene) {
            if (!(amount > 0)) return;
            if (typeof $gameSystem === 'undefined' || !$gameSystem || !$gameSystem.addKnowledge) return;
            $gameSystem.addKnowledge(amount);
            this._insightTotal += amount;
            if (this._sandbox) return;
            if (scene && scene.showToast) scene.showToast(T('Dream.kp', { amount: amount }));
            if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
        },

        // A dream is where things are worked out. Every minute spent in one rolls
        // a chance of a Knowledge insight; the clock lives on the manager so
        // shifting to another dream map does not restart the count.
        tickInsight(delta, scene) {
            if (INSIGHT_CHANCE <= 0) return;
            this._insightClock += delta;
            while (this._insightClock >= INSIGHT_PERIOD) {
                this._insightClock -= INSIGHT_PERIOD;
                if (Math.random() >= INSIGHT_CHANCE) continue;
                const amount = INSIGHT_MIN + Math.floor(Math.random() * (INSIGHT_MAX - INSIGHT_MIN + 1));
                if (typeof $gameSystem === 'undefined' || !$gameSystem || !$gameSystem.addKnowledge) continue;
                $gameSystem.addKnowledge(amount);
                this._insightTotal += amount;
                if (this._sandbox) continue;
                if (scene && scene.showInsight) scene.showInsight(amount);
                if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
            }
        },

        /**
         * @param {object} [opts] `sandbox` for the arcade (nothing announced,
         *   no waking message) and `onWake`, called once the dream is over,
         *   which is how the free-play scene knows to pop itself.
         */
        start(opts) {
            opts = opts || {};
            this._sandbox = !!opts.sandbox;
            this._onWake = opts.onWake || null;
            if (!hasTHREE) {            // graceful fallback: just flash + message
                this._fallbackFlash();
                if (this._onWake) { const w = this._onWake; this._onWake = null; w(); }
                return;
            }
            if (this._scene) { const keep = this._onWake; this._onWake = null; this.stop(); this._onWake = keep; }

            dreamActive = true;
            window.dreamActive = true;
            this._insightClock = 0;
            this._insightTotal = 0;
            // A dream walked into from the title screen is nobody's: it is
            // rolled out of the world seed the way it always was, with no diary
            // behind it and nothing wrong with whoever is having it.
            this._memory = this._sandbox ? null : DreamMemory.build();
            this._dread = (!this._sandbox && window.Insomnia) ? window.Insomnia.dread() : 0;
            // A dream is scored with its own ambience, region by region, so the
            // one the sleeper lay down in is put aside and given back on waking.
            this._savedBgs = null;
            if (typeof AudioManager !== 'undefined' && AudioManager.saveBgs) {
                try { this._savedBgs = AudioManager.saveBgs(); } catch (e) { /* nothing playing */ }
            }
            this._applyPsxDreamTuning();

            this._scene = new DreamScene(rollDream(rollDreamSeed()));
            DreamWeapon.begin();
            // The sleeper is told, once, what state they lay down in. It is the
            // only thing the dream ever says about the waking world.
            if (this._dread > 0 && this._scene.showToast && window.Insomnia) {
                this._scene.showToast(T('Dream.deprived', { time: window.Insomnia.describe() }));
            }
        },

        // LSD-style strobe, then another dream: another seed, another weapon.
        // Kept callable under its old name, which said "map" back when a dream
        // was one of a dozen map files.
        changeMap() { return this.changeDream(); },

        /**
         * @param {object} [opts] `dream` to fall into a world already rolled
         *   (the one whose architecture the sleeper has been climbing through),
         *   and `arrival` for how they get there: `{ flying, alt }`.
         */
        changeDream(opts) {
            if (!this._scene || this._scene._transitioning) return;
            opts = opts || {};
            const old = this._scene;
            old._transitioning = true;        // block re-entry (e.g. repeat collisions)
            old._lsdFlash(() => {
                if (!dreamActive) { old._transitioning = false; return; }
                old.dispose();
                this._scene = new DreamScene(opts.dream || rollDream(rollDreamSeed()), opts.arrival);
                DreamWeapon.roll();
            });
        },

        // Player walked into a dream entity -> flash and fall into another dream.
        collideShift() { this.changeDream(); },

        stop() {
            DreamWeapon.end();
            if (this._scene) { this._scene.dispose(); this._scene = null; }
            // The dream's own ambience goes with it, and the room the sleeper is
            // lying in is heard again.
            if (typeof AudioManager !== 'undefined') {
                try {
                    const saved = this._savedBgs;
                    if (saved && saved.name) AudioManager.playBgs(saved, saved.pos);
                    else AudioManager.stopBgs();
                } catch (e) { /* nothing playing */ }
            }
            this._savedBgs = null;
            this._memory = null;
            this._dread = 0;
            const wasActive = dreamActive;
            dreamActive = false;
            window.dreamActive = false;
            this._restorePsxTuning();
            const carried = this._insightTotal;
            this._insightTotal = 0;
            this._insightClock = 0;
            const wake = this._onWake;
            this._onWake = null;
            const sandbox = this._sandbox;
            this._sandbox = false;
            if (wake) { wake(); return; }
            if (sandbox) return;
            if (wasActive && typeof $gameMessage !== 'undefined') {
                setTimeout(() => {
                    window.skipLocalization = true;
                    $gameMessage.add(T('Dream.youWokeUp'));
                    if (carried > 0) {
                        $gameMessage.add(T('Dream.wokeWithInsight', {
                            amount: carried,
                            total: ($gameSystem.getKnowledge ? $gameSystem.getKnowledge() : carried)
                        }));
                    }
                    window.skipLocalization = false;
                }, 250);
            }
        },

        // Crank the shared PSX shader for a heavier dream crunch, restoring on wake.
        _applyPsxDreamTuning() {
            if (!window.PSXShader || this._psxBackup) return;
            const p = window.PSXShader;
            this._psxBackup = { vertexSnap: p.vertexSnap, colorLevels: p.colorLevels, dither: p.dither, downscale: p.downscale };
            p.vertexSnap = 200;
            p.colorLevels = 24;
            p.dither = 0.45;
            p.downscale = 0.7;
        },
        _restorePsxTuning() {
            if (!window.PSXShader || !this._psxBackup) return;
            Object.assign(window.PSXShader, this._psxBackup);
            this._psxBackup = null;
        },

        _fallbackFlash() {
            const color = flashColors[Math.floor(Math.random() * flashColors.length)];
            if (typeof $gameScreen !== 'undefined') {
                $gameScreen.startFlash([
                    parseInt(color.substr(0, 2), 16),
                    parseInt(color.substr(2, 2), 16),
                    parseInt(color.substr(4, 2), 16), 160
                ], 60);
            }
            if (typeof $gameMessage !== 'undefined') {
                window.skipLocalization = true;
                $gameMessage.add(T('Dream.willNotForm'));
                window.skipLocalization = false;
            }
        }
    };
    window.DreamSystem = DreamSystem;

    // =========================================================================
    // Free play. The dream is a DOM overlay driven off its own frame loop
    // rather than a pushable scene, so the title screen's minigame arcade gets
    // a wrapper the way the camper does (Scene_CamperFreeplay, Titlescreen.js):
    // this scene starts a dream, sits there while it is had, and pops itself
    // the moment the sleeper wakes.
    //
    // Nothing is announced in here (DreamSystem.start's `sandbox`): a dream
    // walked into from a menu is a place to be in, not a night's work, so no
    // Knowledge toast and no waking message.
    // =========================================================================
    class Scene_DreamFreeplay extends Scene_MenuBase {
        create() {
            super.create();
            this._dreamStarted = false;
            this._exiting = false;
        }
        start() {
            super.start();
            if (this._dreamStarted) return;
            this._dreamStarted = true;
            DreamSystem.start({
                sandbox: true,
                onWake: () => {
                    if (this._exiting) return;
                    this._exiting = true;
                    this.popScene();
                }
            });
            if (!DreamSystem.isActive() && !this._exiting) { this._exiting = true; this.popScene(); }
        }
        terminate() {
            super.terminate();
            if (DreamSystem.isActive()) DreamSystem.stop();
        }
    }
    window.Scene_DreamFreeplay = Scene_DreamFreeplay;

    // =========================================================================
    // Plugin commands.
    // =========================================================================
    PluginManager.registerCommand(pluginName, 'StartDream', () => DreamSystem.start());
    PluginManager.registerCommand(pluginName, 'changeDream', () => DreamSystem.changeDream());

    // =========================================================================
    // While dreaming, freeze the underlying map: no menu, no player movement.
    // =========================================================================
    const _Scene_Map_isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function () {
        if (dreamActive) return false;
        return _Scene_Map_isMenuEnabled.call(this);
    };

    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function () {
        if (dreamActive) return false;
        return _Game_Player_canMove.call(this);
    };

    // While dreaming, an opaque full-screen DOM overlay (z-index 9999, solid
    // black) plus the dream's own THREE canvas cover the game canvas completely,
    // so rendering the PIXI scene underneath is wasted work. Skip it while
    // dreamActive is set; the flag is cleared on every wake path (and the overlay
    // is removed before it clears), so normal rendering resumes reliably on wake.
    if (SceneManager.renderScene) {
        const _SceneManager_renderScene = SceneManager.renderScene;
        SceneManager.renderScene = function () {
            if (window.dreamActive) return;
            _SceneManager_renderScene.call(this);
        };
    }

    // Safety: if the map scene tears down (e.g. a forced transfer), end the dream.
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        if (dreamActive && DreamSystem.isActive()) DreamSystem.stop();
        _Scene_Map_terminate.call(this);
    };

})();
