//=============================================================================
// MapBattleMode.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v2.0.0 Tactical battle mode: fights play out on the live map, Final Fantasy Tactics crossed with D&D.
 * @author Assistant
 *
 * @help MapBattleMode.js
 *
 * When the "Map Battle" option is on (Options > Gameplay), bumping into a map
 * "Enemy" event no longer pushes Scene_Battle. The fight is played out on the
 * map itself, on a square grid, with the party, the monsters and whoever else
 * wanders in all standing on real tiles.
 *
 * THE RULES (section numbers refer to the code below)
 *
 *   Grid and reach (1, 8). Distances are measured the D&D way: a diagonal
 *   step is one square, so reach is a square around the attacker, not a
 *   diamond, and a monster standing on a diagonal is in range of a sword.
 *   Weapons carry <Range:N> (1 for ordinary melee, 2 for spears, whips and
 *   staves, more for bows and guns); skills and items carry their own
 *   <Range:N> (DEFAULT_RANGE when untagged) and an optional <MinRange:N>. Every
 *   ranged action also needs a clear line: walls and other bodies block it.
 *
 *   Movement (22). The Move command opens a free cursor over every tile the
 *   battler can reach on its movement budget (AGI driven, <Move:N> on an
 *   enemy or actor overrides it). Eight directions, Dijkstra costed: water
 *   costs WATER_MOVE_COST, and stepping into a square next to a hostile costs
 *   one more (zone of control), so nobody sprints past a line of spears for
 *   free. The path the walk will take is drawn under the cursor.
 *
 *   Facing (2, 12). Every combatant faces somewhere. A blow from the side
 *   lands more often; a blow from behind lands more often still and crits
 *   more. A target with hostiles on two opposite sides is pinned and easier
 *   to hit from anywhere. Acting turns a battler to face its target.
 *
 *   Area actions (12). A skill that hits "all enemies" hits every enemy inside
 *   its range with a clear line, and nobody else.
 *
 *   Turn order (26, 29). One round is the party and the troop interleaved by
 *   the ordinary turn-order formula (IndividualBattleTurns.js), then every
 *   townsperson who took the party's side, then the world step, in which
 *   everything that is NOT fighting moves one tile at once.
 *
 *   The camera (18) follows whoever is acting, and the tile cursor while one
 *   is open, then glides back to the leader when the fight is over.
 *
 *   Reinforcements (24) and volunteers (25). A roaming monster that ends up
 *   within JOIN_RANGE of the brawl piles in with its whole troop. A
 *   townsperson standing near it takes the party's side when the party is
 *   well liked (the median disposition the Empathize panel shows) or when they
 *   are simply brave; they fight CPU-driven off their own society profile.
 *
 *   CPU battlers (23): enemies, volunteers, and the party's own members under
 *   the CPU Party Members option all take the same turn: act if a target is
 *   in reach, otherwise walk toward the best square to act from, and act if
 *   the walk brought someone into reach.
 *
 * PRESENTATION
 *
 *   The battle music the player picked (Audio > Battle Music) plays for the
 *   whole fight and is put back the moment the map's own music is restored
 *   (11). Weapon swings and shots are always heard (10). Database animations
 *   are drawn at MAP_ANIM_SCALE of their size so they fit a tile (9). The
 *   Attack row shows the weapon's reach, every skill row shows its range, and
 *   resting the cursor on either paints the tiles it covers (20).
 *
 * This plugin is a presentation and rules layer on top of the existing
 * BattleManager and BattleSystemEnhanced{State,Death,Mechanics} code: damage,
 * AI, states, win/lose/flee/recruit resolution, rewards, corpses and respawn
 * all still run through them unchanged.
 *
 * Load order: after Core/GameOptions, Multiplayer/SplitScreenMultiplayer,
 * Map/MovementInteractionSystem, every BattleSystem/BattleSystemEnhanced*
 * module, Weapon/WeaponSystem, BattleSystem/BattleSystemEnhanchedCommands,
 * BattleSystem/BattleSystemEnhancedHUD, BattleSystem/IndividualBattleTurns and
 * NPC/NPCSystem.
 *
 * Scope note: the first troop member of every "Enemy" event in the fight has
 * that event's map position; any further member of the same troop is HP-bar
 * only (as in front-view battles) and is treated as always in reach.
 */

(() => {
    "use strict";

    const MBM = {};
    window.MapBattleMode = MBM;

    //=========================================================================
    // 0. Tuning
    //=========================================================================

    // Movement budget: floor(agi / MOVE_AGI_DIVISOR), clamped to [MOVE_MIN, MOVE_MAX].
    const MOVE_AGI_DIVISOR = 2.5;
    const MOVE_MIN = 3;
    const MOVE_MAX = 8;
    // Movement points a water tile costs (land is 1).
    const WATER_MOVE_COST = 3;
    // Extra movement a square adjacent to a hostile costs on the way in.
    const ZOC_COST = 1;

    // No breaking away with a monster this close to anyone in the party: one
    // clear tile of daylight is enough to try, a monster in your face is not.
    const ESCAPE_BLOCK_RANGE = 1;
    // Breaking away is priced by open ground: at ESCAPE_BLOCK_RANGE the odds
    // are ESCAPE_MIN_CHANCE, at ESCAPE_FREE_RANGE tiles of daylight they are
    // certain, and every party member's own nearest monster is weighed in.
    const ESCAPE_FREE_RANGE = 10;
    const ESCAPE_MIN_CHANCE = 0.15;
    const ENGAGE_RANGE = 2;
    const DEFAULT_RANGE = 4;
    const UNARMED_RANGE = 1;
    const DIR_LIST = [2, 4, 6, 8];
    // The eight neighbours as [dx, dy]; diagonals last so ties in the walk
    // prefer a straight step.
    const NEIGHBOURS = [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

    // Facing bonuses (FFT): added to the hit rate / crit rate of a physical blow.
    const FACING_HIT = { front: 0, side: 0.10, rear: 0.25 };
    const FACING_CRIT = { front: 0, side: 0.05, rear: 0.15 };
    // A target with hostiles on two opposite sides.
    const PINNED_HIT = 0.10;

    // Database animations are authored for a full battle screen; on a map a
    // tile is 48 pixels, so they are drawn at this fraction of their size.
    const MAP_ANIM_SCALE = 0.5;

    // The muster (16): how far off the nearest monster a placed member lands,
    // how far around the member already in contact a tile is looked for, and
    // how close a member has to be (on screen) to keep the tile they are on.
    const MUSTER_MIN = 2;
    const MUSTER_MAX = 4;
    const MUSTER_SCAN = 7;
    const MUSTER_KEEP = 10;

    // A roaming "Enemy" event this close to any combatant is dragged in.
    const JOIN_RANGE = 3;
    // A townsperson this close decides whether to wade in.
    // How often the field is swept for monsters that have come within reach.
    const JOIN_SCAN_INTERVAL = 10;
    // Taking hold of something is done at arm's length.
    const GRAPPLE_RANGE = 1;
    const NPC_JOIN_RANGE = 5;
    // Median disposition at or above which a townsperson takes the party's side.
    const NPC_JOIN_OPINION = 30;
    const BRAVE_PERSONALITY = "Brave"; // i18n-ignore: PersonalityData.json id
    // Health/Traits.json ids: adrenaline_junkie (24) and loyal (89) wade in;
    // coward (54) and pacifist (25) never do.
    const BRAVE_TRAIT_IDS = [24, 89];
    const TIMID_TRAIT_IDS = [54, 25];
    // Proxy actors for townspeople fighting alongside the party
    // (data/Actors.json, tagged <MapBattleAlly>).
    const ALLY_ACTOR_IDS = [6, 7, 8];

    // Camera easing per frame, and how long the glide back to the leader may
    // run after the fight.
    const CAMERA_EASE = 0.14;
    const CAMERA_RETURN_FRAMES = 150;

    const COLOR_MOVE = "rgba(80,170,255,0.35)";
    const COLOR_PATH = "rgba(140,220,255,0.55)";
    const COLOR_RANGE = "rgba(255,90,60,0.35)";
    const COLOR_PREVIEW_ATTACK = "rgba(255,120,80,0.22)";
    const COLOR_PREVIEW_SKILL = "rgba(180,120,255,0.22)";
    const COLOR_PREVIEW_MOVE = "rgba(80,170,255,0.18)";
    const COLOR_CURSOR = "rgba(255,255,255,0.55)";

    const HIT_FLASH_COLOR = [255, 64, 64, 170];
    const HIT_FLASH_FRAMES = 12;

    //=========================================================================
    // 1. Pure grid maths
    //
    // No engine objects in here: everything takes plain numbers and callbacks,
    // so the rules can be tested on their own (test/test_mapbattle_rules.js).
    //=========================================================================

    const Grid = {};
    MBM.Grid = Grid;

    // D&D distance: a diagonal is one square.
    Grid.chebyshev = function (x1, y1, x2, y2) {
        return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
    };

    Grid.manhattan = function (x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    };

    // Four-way facing from one tile toward another, dominant axis wins, ties
    // go to the horizontal. 0 when both tiles are the same.
    Grid.faceDir = function (dx, dy) {
        if (dx === 0 && dy === 0) return 0;
        if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 6 : 4;
        return dy > 0 ? 2 : 8;
    };

    // The horizontal and vertical direction codes of a single step (either
    // may be 0 for a straight step).
    Grid.stepDirs = function (dx, dy) {
        return {
            horz: dx > 0 ? 6 : dx < 0 ? 4 : 0,
            vert: dy > 0 ? 2 : dy < 0 ? 8 : 0
        };
    };

    // Supercover line walk: every distinct tile strictly between the two ends
    // is asked `blocks(x, y)`. Adjacent tiles always see each other.
    Grid.lineOfSight = function (x1, y1, x2, y2, blocks) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
        if (steps <= 0) return true;
        let lastKey = x1 + "," + y1;
        for (let i = 1; i < steps; i++) {
            const x = Math.round(x1 + (dx * i) / steps);
            const y = Math.round(y1 + (dy * i) / steps);
            const key = x + "," + y;
            if (key === lastKey) continue;
            lastKey = key;
            if (x === x2 && y === y2) continue;
            if (blocks(x, y)) return false;
        }
        return true;
    };

    // Every tile inside `range` squares of (cx, cy) and at least `minRange`
    // away, the centre excluded, as [x, y] pairs. Optional `keep(x, y)` drops
    // tiles (line of sight, walls).
    Grid.rangeTiles = function (cx, cy, range, minRange, keep) {
        const out = [];
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                if (dx === 0 && dy === 0) continue;
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                if (d < (minRange || 0)) continue;
                const x = cx + dx;
                const y = cy + dy;
                if (keep && !keep(x, y)) continue;
                out.push([x, y]);
            }
        }
        return out;
    };

    // Eight-way Dijkstra over small integer costs (bucket queue, exact).
    //   opts.cost(x, y, fromX, fromY, diagonal) -> movement points to enter, or Infinity
    //   opts.canStep(fromX, fromY, toX, toY, horz, vert) -> passability
    //   opts.wrapX / opts.wrapY -> map wrapping (identity when absent)
    // Returns { dist: Map "x,y" -> points spent, prev: Map "x,y" -> "x,y" }.
    Grid.reachable = function (sx, sy, budget, opts) {
        const wrapX = opts.wrapX || (x => x);
        const wrapY = opts.wrapY || (y => y);
        const startKey = sx + "," + sy;
        const dist = new Map([[startKey, 0]]);
        const prev = new Map();
        const buckets = [[[sx, sy]]];
        for (let spent = 0; spent <= budget; spent++) {
            const bucket = buckets[spent];
            if (!bucket) continue;
            for (const [cx, cy] of bucket) {
                if (dist.get(cx + "," + cy) !== spent) continue;
                for (const [ddx, ddy] of NEIGHBOURS) {
                    const nx = wrapX(cx + ddx);
                    const ny = wrapY(cy + ddy);
                    const key = nx + "," + ny;
                    const diagonal = ddx !== 0 && ddy !== 0;
                    const step = opts.cost(nx, ny, cx, cy, diagonal);
                    if (!Number.isFinite(step)) continue;
                    const next = spent + step;
                    if (next > budget) continue;
                    if (dist.has(key) && dist.get(key) <= next) continue;
                    const { horz, vert } = Grid.stepDirs(ddx, ddy);
                    if (!opts.canStep(cx, cy, nx, ny, horz, vert)) continue;
                    dist.set(key, next);
                    prev.set(key, cx + "," + cy);
                    (buckets[next] = buckets[next] || []).push([nx, ny]);
                }
            }
        }
        return { dist, prev };
    };

    // Walk the predecessor chain back from a destination to the start tile,
    // yielding the tiles to step through in order (the start excluded).
    Grid.pathTo = function (prev, startKey, destKey) {
        const path = [];
        let key = destKey;
        while (key && key !== startKey) {
            const [x, y] = key.split(",").map(Number);
            path.unshift([x, y]);
            key = prev.get(key);
        }
        return path;
    };

    //=========================================================================
    // 2. Facing rules
    //=========================================================================

    const Facing = {};
    MBM.Facing = Facing;

    const FACING_VECTORS = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] };

    // Where the attacker stands relative to where the target is looking:
    // "front", "side" or "rear".
    Facing.relative = function (ax, ay, tx, ty, targetDir) {
        const face = FACING_VECTORS[targetDir] || [0, 1];
        const dx = ax - tx;
        const dy = ay - ty;
        if (dx === 0 && dy === 0) return "front";
        const along = dx * face[0] + dy * face[1];
        const across = Math.abs(dx * face[1]) + Math.abs(dy * face[0]);
        // An exact diagonal is a flank, the way FFT reads it.
        if (Math.abs(along) <= across) return "side";
        return along > 0 ? "front" : "rear";
    };

    Facing.hitBonus = function (relative) {
        return FACING_HIT[relative] || 0;
    };

    Facing.critBonus = function (relative) {
        return FACING_CRIT[relative] || 0;
    };

    // True when two of the given [x, y] positions sit on opposite sides of
    // (tx, ty), both adjacent to it.
    Facing.isPinned = function (tx, ty, hostiles) {
        const near = hostiles.filter(([x, y]) => Grid.chebyshev(x, y, tx, ty) === 1);
        for (let i = 0; i < near.length; i++) {
            for (let j = i + 1; j < near.length; j++) {
                const [ax, ay] = near[i];
                const [bx, by] = near[j];
                if (ax - tx === -(bx - tx) && ay - ty === -(by - ty)) return true;
            }
        }
        return false;
    };

    //=========================================================================
    // 3. State
    //=========================================================================

    MBM._active = false;
    MBM._troopId = 0;
    MBM._persistentId = null;
    MBM._eventId = 0;
    MBM._mapId = 0;
    MBM._enemyEvent = null;
    MBM._moveUsedThisTurn = {};

    MBM._logWindow = null;
    MBM._cmdWindow = null;
    MBM._skillWindow = null;
    MBM._itemWindow = null;
    MBM._throwWindow = null;
    MBM._hpBars = [];
    MBM._hpBarKey = "";
    MBM._tileSprites = [];
    MBM._pathSprites = [];
    MBM._previewSprites = [];
    MBM._cursorState = null;
    MBM._activeWalk = null;
    MBM._knockbacks = [];
    MBM._lastInputActor = null;
    MBM._followerThrough = [];
    MBM._windowsDeaf = false;
    MBM._deafened = null;
    MBM._aiTurn = null;
    MBM._battleBgmName = null;
    MBM._swingHeard = false;
    MBM._facingFor = new Map();
    MBM._camera = null;

    MBM._enemyEventFor = new Map();
    MBM._combatEnemyEvents = [];
    MBM._allies = [];
    MBM._considered = new Set();
    MBM._hideAllies = false;
    MBM._petThrough = null;
    MBM._roundStarted = false;

    MBM.isActive = function () {
        return !!MBM._active;
    };

    // The raw options toggle, read at the one point a new battle decides which
    // presentation to use (BattleSystemEnhanced.js). Once a fight has begun
    // everything else checks isActive(), so a mid-battle flip cannot corrupt
    // it. The voxel world is never a tactical grid.
    window.isMapBattleMode = () => {
        if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive()) return false;
        return ConfigManager.mapBattleMode === true;
    };

    MBM.isMultiplayer = function () {
        if (typeof window.isMultiplayerSession === "function") return window.isMultiplayerSession();
        const ss = window.SplitScreenManager || window.$gameSplitScreen;
        if (ss && ss.active) return true;
        if (window.$gameSwitches) {
            if ($gameSwitches.value(66) || $gameSwitches.value(67)) return true;
        }
        const nm = window.NetworkManager;
        return !!(nm && nm.isConnected && nm.isConnected());
    };
    MBM.isCpuParty = function () {
        if (typeof window.isCpuPartyMembersActive === "function") return window.isCpuPartyMembersActive();
        return ConfigManager.cpuPartyMembers === true && !MBM.isMultiplayer();
    };

    function tileCenterX(x) {
        return Math.round($gameMap.adjustX(x) * $gameMap.tileWidth() + $gameMap.tileWidth() / 2);
    }
    function tileCenterY(y) {
        return Math.round($gameMap.adjustY(y) * $gameMap.tileHeight() + $gameMap.tileHeight() / 2);
    }
    function currentSpriteset() {
        const scene = SceneManager._scene;
        return scene && scene._spriteset;
    }
    function keyOf(x, y) {
        return x + "," + y;
    }
    // Map-aware deltas so a looping map measures across its seam.
    function deltaX(x1, x2) {
        return $gameMap.deltaX(x1, x2);
    }
    function deltaY(y1, y2) {
        return $gameMap.deltaY(y1, y2);
    }
    MBM.distance = function (x1, y1, x2, y2) {
        return Math.max(Math.abs(deltaX(x1, x2)), Math.abs(deltaY(y1, y2)));
    };

    //=========================================================================
    // 4. Split-screen bridge (Multiplayer/SplitScreenMultiplayer.js)
    //=========================================================================

    function splitScreen() {
        const ss = window.SplitScreenManager || window.$gameSplitScreen;
        return ss && ss.active && ss.p2Event ? ss : null;
    }

    MBM.p2Event = function () {
        const ss = splitScreen();
        return ss ? ss.p2Event : null;
    };

    MBM._p2Battler = function () {
        return splitScreen() ? ($gameParty.battleMembers()[1] || null) : null;
    };

    MBM._isP2Input = function () {
        const p2 = MBM._p2Battler();
        return !!p2 && BattleManager.actor() === p2;
    };

    const P2_INPUT_KEY = {
        ok: "action", cancel: "cancel",
        up: "up", down: "down", left: "left", right: "right"
    };

    // Input.isTriggered for the tile cursor; Player 2's pad answers on Player
    // 2's own turn only.
    MBM.inputTriggered = function (key) {
        if (Input.isTriggered(key)) return true;
        const ss = splitScreen();
        if (!ss || !MBM._isP2Input()) return false;
        const pk = P2_INPUT_KEY[key];
        return !!pk && ss.isTriggered(pk);
    };

    // Input.isRepeated for the cursor, so a held direction keeps sliding.
    MBM.inputRepeated = function (key) {
        if (Input.isRepeated(key)) return true;
        return MBM.inputTriggered(key);
    };

    MBM.consumeP2Input = function () {
        const ss = splitScreen();
        if (ss && ss.consumeTrigger) ss.consumeTrigger();
    };

    //=========================================================================
    // 5. Ally roster: townspeople fighting for the party
    //
    // A volunteer is a proxy Game_Actor (ALLY_ACTOR_IDS) appended to
    // $gameParty.battleMembers() for the fight, with the NPC's own event as its
    // body. Appending rather than addActor() keeps it out of the menu, the
    // save, the follower train and the reward split, while the battle rules
    // see it everywhere. The few roster queries that must see the real party
    // only ask through withoutAllies().
    //=========================================================================

    MBM.isAllyActor = function (battler) {
        return !!battler && battler.isActor && battler.isActor() &&
            ALLY_ACTOR_IDS.includes(battler.actorId());
    };

    MBM.allyBattlers = function () {
        return MBM._allies.map(a => a.actor).filter(Boolean);
    };

    MBM.allyRecordFor = function (battler) {
        return MBM._allies.find(a => a.actor === battler) || null;
    };

    MBM.withoutAllies = function (fn) {
        const was = MBM._hideAllies;
        MBM._hideAllies = true;
        try {
            return fn();
        } finally {
            MBM._hideAllies = was;
        }
    };

    MBM._allyListDirty = true;
    MBM._battleMembersCache = null;

    const _Game_Party_battleMembers = Game_Party.prototype.battleMembers;
    Game_Party.prototype.battleMembers = function () {
        const base = _Game_Party_battleMembers.call(this);
        if (!MBM.isActive() || MBM._hideAllies || MBM._allies.length === 0) return base;
        // The cache is only good while the party under it is the same party:
        // a summon taking the 4th slot mid-fight, a swap through PartyCycle or
        // a body leaving all change who is in it without necessarily changing
        // how many are, so the members themselves are what is compared.
        const stale = MBM._allyListDirty || !MBM._battleMembersCache ||
            MBM._battleMembersCache.length !== base.length + MBM._allies.length ||
            base.some((member, i) => MBM._battleMembersCache[i] !== member);
        if (stale) {
            MBM._battleMembersCache = base.concat(MBM.allyBattlers());
            MBM._allyListDirty = false;
        }
        return MBM._battleMembersCache;
    };

    const _Game_Party_isAllDead = Game_Party.prototype.isAllDead;
    Game_Party.prototype.isAllDead = function () {
        if (!MBM.isActive() || MBM._allies.length === 0) return _Game_Party_isAllDead.call(this);
        return MBM.withoutAllies(() => _Game_Party_isAllDead.call(this));
    };

    // The death latches are positional ($gameParty.members()[0..2]); a dead
    // volunteer must never be filed as a dead companion.
    const _BattleManager_checkActorDeaths = BattleManager.checkActorDeaths;
    if (typeof _BattleManager_checkActorDeaths === "function") {
        BattleManager.checkActorDeaths = function () {
            if (!MBM.isActive() || MBM._allies.length === 0) {
                return _BattleManager_checkActorDeaths.call(this);
            }
            return MBM.withoutAllies(() => _BattleManager_checkActorDeaths.call(this));
        };
    }

    const ALLY_PARAM_KEYS = ["mhp", "mmp", "atk", "def", "mat", "mdf", "agi", "luk"];

    const _Game_Actor_paramBase_MBM = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function (paramId) {
        if (MBM.isActive() && MBM.isAllyActor(this)) {
            const rec = MBM.allyRecordFor(this);
            const value = rec && rec.profile ? rec.profile[ALLY_PARAM_KEYS[paramId]] : null;
            if (Number.isFinite(value) && value > 0) return value;
        }
        return _Game_Actor_paramBase_MBM.call(this, paramId);
    };

    const _Game_Actor_isAutoBattle_MBM = Game_Actor.prototype.isAutoBattle;
    Game_Actor.prototype.isAutoBattle = function () {
        if (MBM.isActive() && MBM.isAllyActor(this)) return true;
        return _Game_Actor_isAutoBattle_MBM.call(this);
    };

    //=========================================================================
    // 6. Water (Map/MovementInteractionSystem.js)
    //=========================================================================

    MBM.isSwimmableWater = function (x, y) {
        const MS = window.MovementSystem;
        if (!MS || !MS.isWaterTile) return false;
        if ($gameMap.regionId(x, y) === 10) return false;
        return MS.isWaterTile(x, y);
    };

    MBM.stepCost = function (x, y) {
        return MBM.isSwimmableWater(x, y) ? WATER_MOVE_COST : 1;
    };

    // Passability for one step, straight or diagonal, asked the way it would
    // be asked mid-swim when the destination is water.
    MBM._canStep = function (character, x, y, horz, vert) {
        const nx = horz ? $gameMap.roundXWithDirection(x, horz) : x;
        const ny = vert ? $gameMap.roundYWithDirection(y, vert) : y;
        const ask = () => {
            if (horz && vert) return character.canPassDiagonally(x, y, horz, vert);
            return character.canPass(x, y, horz || vert);
        };
        if (!MBM.isSwimmableWater(nx, ny)) return ask();
        const was = character._isSwimming;
        character._isSwimming = true;
        try {
            return ask();
        } finally {
            character._isSwimming = was;
        }
    };

    MBM._enterWaterFor = function (character, x, y) {
        const MS = window.MovementSystem;
        if (!MS || !character || character._isSwimming) return;
        if (MBM.isSwimmableWater(x, y)) MS.enterSwimMode(character);
    };

    // The leader's exit is left to Game_Player.updateSwimState, which also
    // owns the permanently submerged SeaBed biome.
    MBM._syncSwimState = function (character) {
        const MS = window.MovementSystem;
        if (!MS || !character) return;
        if (MBM.isSwimmableWater(character.x, character.y)) {
            if (!character._isSwimming) MS.enterSwimMode(character);
            return;
        }
        if (character !== $gamePlayer && character._isSwimming) MS.exitSwimMode(character);
    };

    //=========================================================================
    // 7. Combatants on the map
    //=========================================================================

    // "Enemy" is the event name BattleSystemEnhancedEncounters spawns every
    // roaming monster under; cached on the event since the name never changes.
    function isEnemyEvent(event) {
        if (!event) return false;
        if (event._mbmIsEnemy === undefined) {
            const data = event.event ? event.event() : null;
            event._mbmIsEnemy = !!data && data.name === "Enemy"; // i18n-ignore: event name
        }
        return event._mbmIsEnemy;
    }

    // The map character behind a battler: the leader, the followers (or P2's
    // avatar), a volunteer's own event, the first troop member's Enemy event.
    // null for a battler with no tile (always in reach).
    MBM.mapCharacterFor = function (battler) {
        if (!battler) return null;
        if (battler.isActor && battler.isActor()) {
            if (MBM.isAllyActor(battler)) {
                const rec = MBM.allyRecordFor(battler);
                return rec ? rec.event : null;
            }
            const idx = MBM.withoutAllies(() => $gameParty.battleMembers().indexOf(battler));
            if (idx === 0) return $gamePlayer;
            if (idx === 1 && MBM.p2Event()) return MBM.p2Event();
            if (idx === 1) return $gamePlayer.followers().follower(0);
            if (idx === 2) return $gamePlayer.followers().follower(1);
            // A summon (SummonSystem.js) holds the fourth place in the line.
            if (idx === 3) return $gamePlayer.followers().follower(2);
            return null;
        }
        if (battler.isEnemy && battler.isEnemy()) {
            return MBM._enemyEventFor.get(battler) || null;
        }
        return null;
    };

    // The battler a map character stands for, or null for a bystander.
    MBM.battlerFor = function (character) {
        if (!character) return null;
        for (const actor of $gameParty.battleMembers()) {
            if (MBM.mapCharacterFor(actor) === character) return actor;
        }
        // Several monsters can share one event; the one it answers for is a
        // living one, so a group is still aimed at once its first member falls.
        let dead = null;
        for (const [enemy, event] of MBM._enemyEventFor) {
            if (event !== character) continue;
            if (enemy && enemy.isAlive()) return enemy;
            if (!dead) dead = enemy;
        }
        return dead;
    };

    MBM._battlerCharacters = function () {
        const list = [];
        for (const actor of $gameParty.battleMembers()) {
            const c = MBM.mapCharacterFor(actor);
            if (!c) continue;
            if (typeof c.actor === "function" && !c.actor()) continue;
            if (!list.includes(c)) list.push(c);
        }
        for (const entry of MBM._combatEnemyEvents) {
            if (entry.event && !entry.event._erased && !list.includes(entry.event)) {
                list.push(entry.event);
            }
        }
        return list;
    };

    // Positions of the living hostiles of a battler, as [x, y] pairs.
    MBM._hostilePositions = function (battler) {
        const unit = battler && battler.opponentsUnit ? battler.opponentsUnit() : null;
        if (!unit) return [];
        const out = [];
        for (const b of unit.members()) {
            if (!b || !b.isAlive()) continue;
            const c = MBM.mapCharacterFor(b);
            if (c) out.push([c.x, c.y]);
        }
        return out;
    };

    MBM._nearestCombatantDistance = function (x, y, combatants) {
        let best = Infinity;
        for (const c of (combatants || MBM._battlerCharacters())) {
            if (!c) continue;
            best = Math.min(best, MBM.distance(x, y, c.x, c.y));
        }
        return best;
    };

    //=========================================================================
    // 8. Reach
    //=========================================================================

    function metaNumber(obj, key) {
        const n = Number(obj && obj.meta && obj.meta[key]);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    MBM.skillRange = function (skill) {
        if (!skill) return DEFAULT_RANGE;
        if (skill.scope === 11) return 0;
        return metaNumber(skill, "Range") || DEFAULT_RANGE;
    };

    MBM.skillMinRange = function (skill) {
        return metaNumber(skill, "MinRange");
    };

    // Every entry in data/Weapons.json carries <Range:N>; an untagged one is melee.
    MBM.weaponRange = function (weapon) {
        if (!weapon) return 0;
        return metaNumber(weapon, "Range") || UNARMED_RANGE;
    };

    // Normal-attack reach: the longest equipped weapon, bare hands one square,
    // an enemy's own <Range:N>.
    MBM.attackRange = function (battler) {
        if (!battler) return UNARMED_RANGE;
        // A dry magazine turns Attack into Bash, a swing with the gun itself:
        // it reaches one square, not down the barrel's old firing line.
        if (battler.isOutOfBullets && battler.isOutOfBullets()) return UNARMED_RANGE;
        if (battler.weapons) {
            const ranges = battler.weapons().map(MBM.weaponRange).filter(r => r > 0);
            if (ranges.length > 0) return Math.max(...ranges);
        }
        if (battler.isEnemy && battler.isEnemy()) {
            return metaNumber(battler.enemy(), "Range") || UNARMED_RANGE;
        }
        return UNARMED_RANGE;
    };

    MBM.attackMinRange = function (battler) {
        if (!battler || !battler.weapons) return 0;
        if (battler.isOutOfBullets && battler.isOutOfBullets()) return 0;
        const mins = battler.weapons().map(w => metaNumber(w, "MinRange"));
        return mins.length ? Math.min(...mins) : 0;
    };

    MBM.actionRange = function (action) {
        if (!action) return DEFAULT_RANGE;
        if (action.isAttack && action.isAttack()) return MBM.attackRange(action.subject());
        return MBM.skillRange(action.item());
    };

    MBM.actionMinRange = function (action) {
        if (!action) return 0;
        if (action.isAttack && action.isAttack()) return MBM.attackMinRange(action.subject());
        return MBM.skillMinRange(action.item());
    };

    // Movement budget in squares.
    MBM.moveRange = function (battler) {
        if (!battler) return MOVE_MIN;
        const data = battler.isEnemy && battler.isEnemy() ? battler.enemy()
            : battler.isActor && battler.isActor() ? battler.actor() : null;
        const tagged = metaNumber(data, "Move");
        if (tagged) return Math.min(MOVE_MAX, tagged);
        const agi = Number(battler.agi) || 0;
        return Math.max(MOVE_MIN, Math.min(MOVE_MAX, Math.floor(agi / MOVE_AGI_DIVISOR)));
    };

    // Every other battler counts as cover; shooter and target never block
    // their own line.
    MBM._sightBlockers = function (from, to) {
        const set = new Set();
        for (const c of MBM._battlerCharacters()) {
            if (!c || c === from || c === to) continue;
            set.add(keyOf(c.x, c.y));
        }
        return set;
    };

    // Water is open ground for a line of fire. A water tile is impassable in
    // every direction to a walker, so the plain passability test read a lake as
    // a wall and cut every bow, spell and spear down to whatever was left of
    // the range before the shore: standing in the water, that was nothing.
    // Nothing floats between two swimmers, so nothing blocks the shot.
    MBM._blocksSight = function (x, y, blockers) {
        if (blockers && blockers.has(keyOf(x, y))) return true;
        if (!$gameMap.isValid(x, y)) return true;
        if (MBM.isSwimmableWater(x, y)) return false;
        return DIR_LIST.every(d => !$gameMap.isPassable(x, y, d));
    };

    MBM.hasLineOfSight = function (x1, y1, x2, y2, blockers) {
        return Grid.lineOfSight(x1, y1, x2, y2, (x, y) => MBM._blocksSight(x, y, blockers));
    };

    // Can `subject` act on `target` from where it stands. Battlers without a
    // tile are always reachable.
    MBM.canReach = function (subject, target, range, minRange) {
        const from = MBM.mapCharacterFor(subject);
        const to = MBM.mapCharacterFor(target);
        if (!from || !to) return true;
        const d = MBM.distance(from.x, from.y, to.x, to.y);
        if (d > range || d < (minRange || 0)) return false;
        return MBM.hasLineOfSight(from.x, from.y, to.x, to.y, MBM._sightBlockers(from, to));
    };

    MBM.canUseAttackCommand = function (actor) {
        if (!MBM.isActive() || !actor) return true;
        const range = MBM.attackRange(actor);
        const min = MBM.attackMinRange(actor);
        return $gameTroop.members().some(e => e && e.isAlive() && MBM.canReach(actor, e, range, min));
    };

    // The tiles an action covers from a given square, with a clear line.
    MBM._coveredTiles = function (character, range, minRange) {
        if (!character || range <= 0) return [];
        const blockers = MBM._sightBlockers(character, null);
        return Grid.rangeTiles(character.x, character.y, range, minRange,
            (x, y) => $gameMap.isValid(x, y) &&
                MBM.hasLineOfSight(character.x, character.y, x, y, blockers));
    };

    //=========================================================================
    // 9. Spriteset_Map / Window_BattleLog engine glue
    //=========================================================================

    Spriteset_Map.prototype.isAnyoneMoving = function () {
        if (MBM.isActive()) {
            return MBM._battlerCharacters().some(c => c.isMoving());
        }
        return this._characterSprites.some(s => s._character && s._character.isMoving());
    };
    Spriteset_Map.prototype.isEffecting = function () {
        return this.isAnimationPlaying();
    };
    Spriteset_Map.prototype.isBusy = function () {
        return this.isAnimationPlaying() || this.isAnyoneMoving();
    };

    const _Spriteset_Map_findTargetSprite = Spriteset_Map.prototype.findTargetSprite;
    Spriteset_Map.prototype.findTargetSprite = function (target) {
        if (MBM.isActive() && target && ((target.isActor && target.isActor()) || (target.isEnemy && target.isEnemy()))) {
            const ch = MBM.mapCharacterFor(target);
            if (ch) {
                const found = this._characterSprites.find(s => s.checkCharacter(ch));
                if (found) return found;
            }
        }
        return _Spriteset_Map_findTargetSprite.call(this, target);
    };

    MBM._spriteFor = function (character) {
        const spriteset = currentSpriteset();
        if (!character || !spriteset || !spriteset._characterSprites) return null;
        return spriteset._characterSprites.find(s => s.checkCharacter(character)) || null;
    };

    // --- Animations at tile scale ------------------------------------------
    // Effekseer animations read their size off animation.scale; a scaled copy
    // of the data is handed to the sprite so the database is never touched.
    // MV sheet animations are scaled as sprites.
    MBM._scaledAnimation = function (animation) {
        if (!animation || !MBM.isActive()) return animation;
        if (animation._mbmScaled) return animation;
        const copy = Object.assign({}, animation);
        copy.scale = (Number(animation.scale) || 100) * MAP_ANIM_SCALE;
        copy._mbmScaled = true;
        return copy;
    };

    const _Sprite_Animation_setup_mbm = Sprite_Animation.prototype.setup;
    Sprite_Animation.prototype.setup = function (targets, animation, mirror, delay, previous) {
        _Sprite_Animation_setup_mbm.call(this, targets, MBM._scaledAnimation(animation), mirror, delay, previous);
    };

    const _Sprite_AnimationMV_setup_mbm = Sprite_AnimationMV.prototype.setup;
    Sprite_AnimationMV.prototype.setup = function (targets, animation, mirror, delay) {
        _Sprite_AnimationMV_setup_mbm.call(this, targets, animation, mirror, delay);
        if (MBM.isActive()) this.scale.set(MAP_ANIM_SCALE, MAP_ANIM_SCALE);
    };

    // --- Damage popups ------------------------------------------------------
    const _WBL_popupDamage = Window_BattleLog.prototype.popupDamage;
    Window_BattleLog.prototype.popupDamage = function (target) {
        if (MBM.isActive()) {
            MBM.showDamagePopup(target);
            return;
        }
        _WBL_popupDamage.call(this, target);
    };

    class Sprite_MBMDamage extends Sprite {
        constructor(character, result, facingLabel) {
            super();
            this._character = character;
            this._duration = 44;
            this._label = facingLabel || "";
            this._text = "";
            this._color = "#ffffff";
            this.anchor.x = 0.5;
            this.anchor.y = 1;
            this.z = 9;
            this.bitmap = new Bitmap(180, 64);
            this._drawResult(result, facingLabel);
            this._updatePosition();
            MBM._popups.push(this);
        }
        _drawResult(result, facingLabel) {
            const b = this.bitmap;
            b.outlineWidth = 4;
            b.outlineColor = "black";
            if (facingLabel) {
                b.fontSize = 14;
                b.textColor = "#ffd27a";
                b.drawText(facingLabel, 0, 0, 180, 18, "center");
            }
            b.fontSize = 24;
            if (result.missed || result.evaded) {
                this._color = "#ffffff";
                this._text = result.missed ? T('Battle.popup.miss') : T('Battle.popup.evaded');
            } else if (result.hpAffected) {
                const amount = Math.abs(Math.round(result.hpDamage));
                const heal = result.hpDamage < 0;
                this._color = heal ? "#7CFC00" : (result.critical ? "#ffb347" : "#ff6666");
                this._text = (heal ? "+" : "-") + amount;
            } else if (result.mpDamage) {
                const amount = Math.abs(Math.round(result.mpDamage));
                this._color = result.mpDamage < 0 ? "#8fd0ff" : "#c9a0ff";
                this._text = (result.mpDamage < 0 ? "+" : "-") + amount;
            }
            if (!this._text) return;
            b.textColor = this._color;
            b.drawText(this._text, 0, 20, 180, 30, "center");
        }
        _updatePosition() {
            if (!this._character) return;
            const rx = this._character._realX !== undefined ? this._character._realX : this._character.x;
            const ry = this._character._realY !== undefined ? this._character._realY : this._character.y;
            this.x = tileCenterX(rx);
            this.y = tileCenterY(ry) - 48 - (44 - this._duration) * 0.8;
        }
        update() {
            super.update();
            this._updatePosition();
            this._duration--;
            this.opacity = Math.min(255, this._duration * 12);
            if (this._duration > 0) return;
            const i = MBM._popups.indexOf(this);
            if (i >= 0) MBM._popups.splice(i, 1);
            if (this.parent) this.parent.removeChild(this);
            this.destroy();
        }
    }

    MBM._popups = [];

    MBM.showDamagePopup = function (target) {
        const character = MBM.mapCharacterFor(target);
        const spriteset = currentSpriteset();
        if (!character || !spriteset || !target.result()) return;
        const result = target.result();
        let label = null;
        const facing = MBM._facingFor.get(target);
        MBM._facingFor.delete(target);
        if (facing && result.isHit() && result.hpDamage > 0) {
            if (facing.pinned) label = T('Battle.mbm.pinned');
            else if (facing.relative === "rear") label = T('Battle.mbm.rear');
            else if (facing.relative === "side") label = T('Battle.mbm.flank');
        }
        spriteset.addChild(new Sprite_MBMDamage(character, result, label));
    };

    //=========================================================================
    // 9b. What a blow looks like on the map
    //
    // No weapon model is held out here (nothing on the field is a 3D battler),
    // so a swing is shown with the weapon's own IconSet cell: it arcs out of
    // the attacker towards the body it lands on and comes back. A weapon that
    // shoots instead kicks in place and sends a projectile across the tiles,
    // a tracer for a gun and an arrow for a bow or a crossbow, drawn with the
    // trail behind it so the shot is seen to reach the target.
    //=========================================================================

    // System.json weapon types: 7 bow, 8 projectile (slings, crossbows,
    // blowguns), 9 gun. WeaponSystem draws the same line for its shot sounds.
    const SHOT_WTYPES = [7, 8, 9];
    const GUN_WTYPE = 9;
    // Pixels the projectile covers in a frame, and the bounds on its flight.
    const SHOT_SPEED = 22;
    const SHOT_MIN_FRAMES = 5;
    const SHOT_MAX_FRAMES = 26;
    // How far along the line to the target the swung icon travels, and how
    // long the whole out-and-back takes.
    const SWING_REACH = 0.55;
    const SWING_FRAMES = 22;
    const ICON_SIZE = 32;

    MBM.isShotWeapon = function (weapon) {
        return !!(weapon && SHOT_WTYPES.includes(weapon.wtypeId));
    };
    MBM.shotStyle = function (weapon) {
        return weapon && weapon.wtypeId === GUN_WTYPE ? "bullet" : "arrow";
    };

    // A tracer or an arrow, drawn pointing right with its tip on the right
    // edge, so the sprite is simply rotated onto the line of the shot.
    function shotBitmap(style) {
        const trail = style === "bullet" ? 72 : 34;
        const body = style === "bullet" ? 10 : 30;
        const b = new Bitmap(trail + body, 12);
        const mid = 6;
        if (style === "bullet") {
            b.gradientFillRect(0, mid - 1, trail, 2, "rgba(255,214,120,0)", "rgba(255,236,190,0.85)");
            b.fillRect(trail, mid - 2, body, 4, "#fff3c4");
            b.fillRect(trail + body - 3, mid - 3, 3, 6, "#ffffff");
        } else {
            b.gradientFillRect(0, mid - 1, trail, 2, "rgba(255,255,255,0)", "rgba(255,255,255,0.45)");
            // Fletching, shaft, then a head that narrows to the tip.
            b.fillRect(trail, mid - 4, 6, 8, "#d8d2c0");
            b.fillRect(trail + 4, mid - 1, body - 12, 2, "#8a5a32");
            for (let i = 0; i < 8; i++) {
                const h = 8 - i;
                b.fillRect(trail + body - 8 + i, mid - Math.ceil(h / 2), 1, h, "#cfd6dd");
            }
        }
        return b;
    }

    class Sprite_MBMShot extends Sprite {
        constructor(from, to, style) {
            super();
            this.bitmap = shotBitmap(style);
            // The tip of the drawing is the head of the shot.
            this.anchor.x = 1;
            this.anchor.y = 0.5;
            this.z = 9;
            this._from = from;
            this._to = to;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            this.rotation = Math.atan2(dy, dx);
            const length = Math.sqrt(dx * dx + dy * dy);
            this._total = Math.round(
                Math.min(SHOT_MAX_FRAMES, Math.max(SHOT_MIN_FRAMES, length / SHOT_SPEED)));
            this._frame = 0;
            this._place(0);
            MBM._fxSprites.push(this);
        }
        _place(t) {
            this.x = this._from.x + (this._to.x - this._from.x) * t;
            this.y = this._from.y + (this._to.y - this._from.y) * t;
        }
        update() {
            super.update();
            this._frame++;
            const t = this._frame / this._total;
            this._place(Math.min(1, t));
            // On arrival the trail is left to fade off the target rather than
            // vanishing on the frame it lands.
            this.opacity = t >= 1 ? Math.max(0, 255 - (this._frame - this._total) * 60) : 255;
            if (this._frame < this._total + 4) return;
            MBM._retireFx(this);
        }
    }

    class Sprite_MBMWeaponIcon extends Sprite {
        constructor(from, to, iconIndex, shoots) {
            super();
            this.bitmap = ImageManager.loadSystem("IconSet");
            const cols = 16;
            this.setFrame((iconIndex % cols) * ICON_SIZE,
                Math.floor(iconIndex / cols) * ICON_SIZE, ICON_SIZE, ICON_SIZE);
            this.anchor.x = 0.5;
            this.anchor.y = 0.5;
            this.z = 9;
            this.scale.set(1.3, 1.3);
            this._from = from;
            this._to = to;
            this._shoots = !!shoots;
            this._aim = Math.atan2(to.y - from.y, to.x - from.x);
            this._frame = 0;
            this._total = SWING_FRAMES;
            this._step(0);
            MBM._fxSprites.push(this);
        }
        // One out-and-back, so the icon leaves the hand and returns to it.
        _step(t) {
            const arc = Math.sin(Math.PI * t);
            if (this._shoots) {
                // A shot does not travel: the weapon is held on the line of
                // fire and kicks back against the recoil.
                const kick = -6 * arc;
                this.x = this._from.x + Math.cos(this._aim) * (18 + kick);
                this.y = this._from.y + Math.sin(this._aim) * (18 + kick) - 8;
                this.rotation = this._aim;
            } else {
                const reach = SWING_REACH * arc;
                this.x = this._from.x + (this._to.x - this._from.x) * reach;
                this.y = this._from.y + (this._to.y - this._from.y) * reach - 8;
                // A swing through a third of a turn, ending past the target.
                this.rotation = this._aim - Math.PI / 3 + (2 * Math.PI / 3) * t;
            }
            this.opacity = t > 0.75 ? Math.round(255 * (1 - (t - 0.75) / 0.25)) : 255;
        }
        update() {
            super.update();
            this._frame++;
            const t = this._frame / this._total;
            this._step(Math.min(1, t));
            if (t < 1) return;
            MBM._retireFx(this);
        }
    }

    MBM._fxSprites = [];

    MBM._retireFx = function (sprite) {
        const i = MBM._fxSprites.indexOf(sprite);
        if (i >= 0) MBM._fxSprites.splice(i, 1);
        if (sprite.parent) sprite.parent.removeChild(sprite);
        sprite.destroy();
    };

    MBM.clearAttackFx = function () {
        for (const sprite of MBM._fxSprites.slice()) MBM._retireFx(sprite);
        MBM._fxSprites.length = 0;
    };

    function fxPointFor(battler) {
        const character = MBM.mapCharacterFor(battler);
        if (!character) return null;
        const rx = character._realX !== undefined ? character._realX : character.x;
        const ry = character._realY !== undefined ? character._realY : character.y;
        return { x: tileCenterX(rx), y: tileCenterY(ry) - 16 };
    }

    // The blow the attacker is throwing, shown once per action on the first
    // body it is aimed at.
    MBM.showAttackFx = function (subject, targets) {
        const spriteset = currentSpriteset();
        if (!spriteset) return;
        const target = (targets || []).find(t => t && t !== subject && MBM.mapCharacterFor(t));
        const from = fxPointFor(subject);
        const to = target ? fxPointFor(target) : null;
        if (!from || !to) return;
        const weapon = MBM._strikingWeapon(subject);
        const shoots = MBM.isShotWeapon(weapon);
        if (shoots) spriteset.addChild(new Sprite_MBMShot(from, to, MBM.shotStyle(weapon)));
        const icon = weapon && weapon.iconIndex ? weapon.iconIndex : 0;
        if (icon > 0) spriteset.addChild(new Sprite_MBMWeaponIcon(from, to, icon, shoots));
    };

    //=========================================================================
    // 10. Sound: plain attacks are heard, always
    //
    // Nothing on the field is a 3D battler and nobody holds a weapon model, so
    // a plain attack is not drawn: it is the weapon's own swing or shot
    // (WeaponSystem's <WeaponSounds:> tags), its impact out of WeaponHitFX's
    // bank, and a red wash over the sprite that was hit. If WeaponSystem's own
    // path did not sound the swing for any reason, it is sounded here.
    //=========================================================================

    MBM.isPlainAttack = function (action) {
        return !!(action && action.isAttack && action.isAttack());
    };

    MBM.flashHit = function (target) {
        const sprite = MBM._spriteFor(MBM.mapCharacterFor(target));
        if (!sprite || !sprite.setBlendColor) return;
        sprite.setBlendColor(HIT_FLASH_COLOR.slice());
        sprite._flashDuration = HIT_FLASH_FRAMES;
    };

    MBM._strikingWeapon = function (subject) {
        if (!subject || !subject.isActor || !subject.isActor()) return null;
        const weapons = subject.weapons ? subject.weapons() : [];
        if (weapons[0]) return weapons[0];
        return window.WeaponSystemProcedural
            ? WeaponSystemProcedural.unarmedWeaponFor(subject)
            : null;
    };

    MBM._playHitSound = function (subject, crit) {
        const FX = window.WeaponHitFX;
        if (!FX || !FX.hitSoundFor) return;
        const weapon = MBM._strikingWeapon(subject);
        if (!weapon) return;
        // A bow, a sling and a gun are heard through their own shot.
        if (!FX.swings(weapon)) return;
        const name = FX.hitSoundFor(weapon);
        if (!name) return;
        AudioManager.playSe({ name, volume: 90, pitch: crit ? 90 : 100, pan: 0 });
    };

    // Whether WeaponSystem sounded the swing of the blow being resolved.
    const _Game_Actor_playWeaponSound_mbm = Game_Actor.prototype.playWeaponSound;
    if (typeof _Game_Actor_playWeaponSound_mbm === "function") {
        Game_Actor.prototype.playWeaponSound = function () {
            MBM._swingHeard = true;
            return _Game_Actor_playWeaponSound_mbm.apply(this, arguments);
        };
    }

    MBM._ensureSwingHeard = function (subject) {
        if (MBM._swingHeard) return;
        if (!subject || !subject.isActor || !subject.isActor()) return;
        if (typeof subject.playWeaponSound === "function") {
            subject.playWeaponSound();
        } else if (window.WeaponSounds && window.WeaponSounds.play) {
            window.WeaponSounds.play(MBM._strikingWeapon(subject));
        }
        MBM._swingHeard = true;
    };

    // Acting turns the subject to face its first target.
    MBM._faceTarget = function (subject, targets) {
        const from = MBM.mapCharacterFor(subject);
        const target = (targets || []).find(t => t && t !== subject && MBM.mapCharacterFor(t));
        const to = target ? MBM.mapCharacterFor(target) : null;
        if (!from || !to) return;
        const dir = Grid.faceDir(deltaX(to.x, from.x), deltaY(to.y, from.y));
        if (dir) from.setDirection(dir);
    };

    const _WBL_startAction_mbm = Window_BattleLog.prototype.startAction;
    Window_BattleLog.prototype.startAction = function (subject, action, targets) {
        MBM._plainAttack = MBM.isActive() && MBM.isPlainAttack(action);
        MBM._swingHeard = false;
        if (MBM.isActive()) MBM._faceTarget(subject, targets);
        if (MBM._plainAttack) MBM.showAttackFx(subject, targets);
        _WBL_startAction_mbm.call(this, subject, action, targets);
    };

    const _WBL_endAction_mbm = Window_BattleLog.prototype.endAction;
    Window_BattleLog.prototype.endAction = function (subject) {
        MBM._plainAttack = false;
        _WBL_endAction_mbm.call(this, subject);
    };

    const _WBL_showAnimation_mbm = Window_BattleLog.prototype.showAnimation;
    Window_BattleLog.prototype.showAnimation = function (subject, targets, animationId) {
        if (MBM.isActive() && MBM._plainAttack) {
            // An enemy's bare attack has no weapon tag; its animation is
            // played for its sound timings alone.
            const snd = window.BattleSystemEnhanced &&
                window.BattleSystemEnhanced.EnemyAnimationSound;
            if (animationId > 0 && snd && subject && subject.isEnemy && subject.isEnemy()) {
                snd.queue(animationId);
            }
            return;
        }
        _WBL_showAnimation_mbm.call(this, subject, targets, animationId);
    };

    const _WBL_displayActionResults_mbm = Window_BattleLog.prototype.displayActionResults;
    Window_BattleLog.prototype.displayActionResults = function (subject, target) {
        const plain = MBM.isActive() && MBM._plainAttack && target && target.result();
        const struck = plain && target.result().isHit();
        // Called through first: WeaponSystem's alias underneath plays the
        // swing, which must be heard before the contact.
        _WBL_displayActionResults_mbm.call(this, subject, target);
        if (plain && target.result().used) MBM._ensureSwingHeard(subject);
        if (struck) {
            MBM.flashHit(target);
            MBM._playHitSound(subject, !!target.result().critical);
            MBM.applyRecoilPush(subject, target);
        }
    };

    //=========================================================================
    // 11. Battle music, guaranteed
    //
    // The track the player picked (Audio > Battle Music, MusicSelectionSystem)
    // is started through BattleManager.playBattleBgm exactly as Scene_Battle
    // does. Out here the map keeps running underneath the fight, and several
    // things on it restart map music (autoplay on a scene rebuild, a biome
    // track change, an event). So the map's own autoplay stands down for the
    // fight and the chosen track is re-asserted whenever something else takes
    // the channel.
    //=========================================================================

    MBM._startBattleMusic = function () {
        BattleManager.saveBgmAndBgs();
        BattleManager.playBattleBgm();
        MBM._battleBgmName = null;
        const MSS = window.MusicSelectionSystem;
        if (MSS && MSS.resolveBattleBgmName) {
            const sel = MSS.resolveBattleBgmName();
            if (sel === MSS.MUSIC_MAP || sel === MSS.MUSIC_NONE) return;
        }
        const current = AudioManager._currentBgm;
        if (current && current.name) MBM._battleBgmName = current.name;
    };

    MBM._bgmTick = 0;
    MBM._updateBattleMusic = function () {
        if (!MBM._battleBgmName) return;
        if (++MBM._bgmTick < 30) return;
        MBM._bgmTick = 0;
        if (AudioManager._currentMe && AudioManager._currentMe.url) return;
        const current = AudioManager._currentBgm;
        if (current && current.name === MBM._battleBgmName) return;
        BattleManager.playBattleBgm();
    };

    const _Game_Map_autoplay_mbm = Game_Map.prototype.autoplay;
    Game_Map.prototype.autoplay = function () {
        if (MBM.isActive()) return;
        _Game_Map_autoplay_mbm.call(this);
    };

    //=========================================================================
    // 12. BattleManager and Game_Action glue
    //=========================================================================

    const _BattleManager_updateBattleEnd = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function () {
        if (!MBM.isActive()) {
            _BattleManager_updateBattleEnd.call(this);
            return;
        }
        if (this._escaped || $gameParty.isAllDead() || $gameTroop.isAllDead()) {
            $gameSystem.setBattleEnded(true);
            MBM.withoutAllies(() => {
                $gameParty.members().forEach((actor, index) => {
                    if (!actor.isDead()) return;
                    if (index === 0) $gameSystem.setActor1Died(true);
                    else if (index === 1) $gameSystem.setActor2Died(true, actor.name());
                    else if (index === 2) $gameSystem.setActor3Died(true, actor.name());
                });
            });
        }
        if (this.isBattleTest()) {
            AudioManager.stopBgm();
            SceneManager.exit();
            return;
        }
        if (!this._escaped && $gameParty.isAllDead()) {
            if (this._canLose) {
                $gameParty.reviveBattleMembers();
            } else {
                this._phase = "";
                MBM.finish();
                SceneManager.goto(Scene_Gameover);
                return;
            }
        }
        this._phase = "";
        MBM.finish();
    };

    // The core auto-retarget in selectNextCommand would stomp the target the
    // tile cursor set.
    const _BattleManager_selectNextCommand = BattleManager.selectNextCommand;
    BattleManager.selectNextCommand = function () {
        if (!MBM.isActive()) {
            _BattleManager_selectNextCommand.call(this);
            return;
        }
        if (this._currentActor) {
            if (this._currentActor.selectNextCommand()) return;
            this.finishActorInput();
        }
        this.selectNextActor();
    };

    // A CPU turn is withheld until its approach walk has finished.
    const _BattleManager_processTurn = BattleManager.processTurn;
    BattleManager.processTurn = function () {
        if (MBM.isActive() && MBM.isAiControlled(this._subject)) {
            if (!MBM._updateAiTurn(this._subject)) return;
        }
        _BattleManager_processTurn.call(this);
    };

    // Area actions only reach what is inside their range with a clear line.
    const _Game_Action_makeTargets_mbm = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function () {
        const targets = _Game_Action_makeTargets_mbm.call(this);
        if (!MBM.isActive() || !this.item() || this.isForUser()) return targets;
        if (!(this.isForAll() || this.isForRandom())) return targets;
        const range = MBM.actionRange(this);
        const min = MBM.actionMinRange(this);
        const subject = this.subject();
        return targets.filter(t => t === subject || MBM.canReach(subject, t, range, min));
    };

    // Where the blow comes from: the facing of the target relative to the
    // attacker, and whether the target is pinned between two hostiles.
    MBM.facingOf = function (subject, target) {
        const from = MBM.mapCharacterFor(subject);
        const to = MBM.mapCharacterFor(target);
        if (!from || !to || from === to) return null;
        const relative = Facing.relative(
            to.x + deltaX(from.x, to.x), to.y + deltaY(from.y, to.y),
            to.x, to.y, to.direction());
        const hostiles = MBM._hostilePositions(target)
            .map(([x, y]) => [to.x + deltaX(x, to.x), to.y + deltaY(y, to.y)]);
        return { relative, pinned: Facing.isPinned(to.x, to.y, hostiles) };
    };

    const _Game_Action_itemHit_mbm = Game_Action.prototype.itemHit;
    Game_Action.prototype.itemHit = function (target) {
        let rate = _Game_Action_itemHit_mbm.call(this, target);
        if (!MBM.isActive() || !this.isPhysical() || !target || target === this.subject()) return rate;
        const facing = MBM.facingOf(this.subject(), target);
        if (!facing) return rate;
        MBM._facingFor.set(target, facing);
        rate += Facing.hitBonus(facing.relative);
        if (facing.pinned) rate += PINNED_HIT;
        return Math.min(1, rate);
    };

    const _Game_Action_itemCri_mbm = Game_Action.prototype.itemCri;
    Game_Action.prototype.itemCri = function (target) {
        const rate = _Game_Action_itemCri_mbm.call(this, target);
        if (!MBM.isActive() || !this.isPhysical() || !target || target === this.subject()) return rate;
        const facing = MBM.facingOf(this.subject(), target);
        if (!facing) return rate;
        return Math.min(1, rate + Facing.critBonus(facing.relative));
    };

    //=========================================================================
    // 13. World freeze and the step budget
    //=========================================================================

    MBM.isCombatantEvent = function (event) {
        return !!event && event._mbmCombatant === true;
    };

    // Combatants are walked by MBM alone; everybody else keeps their movement
    // options but spends them out of the banked tactical budget.
    const _Game_Event_updateSelfMovement = Game_Event.prototype.updateSelfMovement;
    Game_Event.prototype.updateSelfMovement = function () {
        if (MBM.isActive()) {
            if (MBM.isCombatantEvent(this)) return;
            if (!this._mbmSteps || this._mbmSteps <= 0) return;
            const threshold = this.stopCountThreshold();
            if (this._stopCount <= threshold) this._stopCount = threshold + 1;
            const wasAt = keyOf(this._x, this._y);
            _Game_Event_updateSelfMovement.call(this);
            if (keyOf(this._x, this._y) !== wasAt) {
                this._mbmSteps--;
                if (isEnemyEvent(this)) MBM.checkEnemyEventJoin(this);
            }
            return;
        }
        _Game_Event_updateSelfMovement.call(this);
    };

    // An "Enemy" page firing mid-fight would push a second battle; the
    // monster that touched the fight joins it instead.
    const _Game_Event_start = Game_Event.prototype.start;
    Game_Event.prototype.start = function () {
        if (MBM.isActive() && isEnemyEvent(this)) {
            if (!MBM.isCombatantEvent(this)) MBM.joinEnemyEvent(this);
            return;
        }
        _Game_Event_start.call(this);
    };

    MBM._snapEvent = function (event) {
        if (event && event.isMoving()) event.locate(event.x, event.y);
    };

    MBM._snapCharacter = function (character) {
        if (character && character.isMoving && character.isMoving()) {
            MBM._placeBattler(character, character.x, character.y);
        }
    };

    // Another player's body on the map (Multiplayer/MultiplayerSystem.js draws
    // them as the Player1..Player8 events). It is walked by their packets, so
    // the tactical layer never gives it steps, never recruits it as an ally and
    // never counts it as an NPC.
    MBM.isRemotePlayerEvent = function (event) {
        return !!(window.MultiplayerRemote && window.MultiplayerRemote.isRemoteEvent(event));
    };

    MBM._grantWorldSteps = function (n) {
        if (!MBM.isActive() || n <= 0) return;
        const controlled = new Set(
            ($gameSystem.npcControllers || []).map(c => c && c.eventId).filter(id => id != null)
        );
        const p2 = MBM.p2Event();
        for (const event of $gameMap.events()) {
            if (!event || event === p2) continue;
            if (MBM.isRemotePlayerEvent(event)) continue;
            if (MBM.isCombatantEvent(event)) continue;
            if (controlled.has(event.eventId())) continue;
            event._mbmSteps = (event._mbmSteps || 0) + n;
        }
        if (window.NPCSystem && window.NPCSystem.grantTacticalSteps) {
            window.NPCSystem.grantTacticalSteps(n);
        }
    };

    MBM._clearWorldSteps = function () {
        for (const event of $gameMap.events()) {
            if (event) event._mbmSteps = 0;
        }
        if (window.NPCSystem && window.NPCSystem.clearTacticalSteps) {
            window.NPCSystem.clearTacticalSteps();
        }
    };

    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function () {
        if (MBM.isActive()) return false;
        return _Game_Player_canMove.call(this);
    };

    const _Scene_Map_isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function () {
        if (MBM.isActive()) return false;
        return _Scene_Map_isMenuEnabled.call(this);
    };

    // A leader's step is their own move, not a march.
    const _Game_Followers_updateMove = Game_Followers.prototype.updateMove;
    Game_Followers.prototype.updateMove = function () {
        if (MBM.isActive()) return;
        _Game_Followers_updateMove.call(this);
    };

    //=========================================================================
    // 14. Terrain prompts stand down (Map/MovementInteractionSystem.js)
    //=========================================================================

    const _Scene_Map_updateSwimFishInput = Scene_Map.prototype.updateSwimFishInput;
    Scene_Map.prototype.updateSwimFishInput = function () {
        if (MBM.isActive()) return;
        _Scene_Map_updateSwimFishInput.call(this);
    };

    const _Scene_Map_checkMovementInteraction = Scene_Map.prototype.checkMovementInteraction;
    Scene_Map.prototype.checkMovementInteraction = function (character) {
        if (MBM.isActive()) return;
        _Scene_Map_checkMovementInteraction.call(this, character);
    };

    for (const name of [
        "showSwimFishOptions", "showDiveOption", "showResurfaceOption",
        "showBoatFishingOption",
        "showNonProcDiveOption", "showNonProcResurfaceOption",
        "showClimbOptions", "showSitOptions", "showChangeSeatOptions"
    ]) {
        const original = Scene_Map.prototype[name];
        if (typeof original !== "function") continue;
        Scene_Map.prototype[name] = function (...args) {
            if (MBM.isActive()) return;
            return original.apply(this, args);
        };
    }

    if (window.MovementSystem && typeof window.MovementSystem.performFishing === "function") {
        const _performFishing = window.MovementSystem.performFishing;
        window.MovementSystem.performFishing = function (...args) {
            if (MBM.isActive()) return;
            return _performFishing.apply(this, args);
        };
    }

    //=========================================================================
    // 15. Begin / finish
    //=========================================================================

    MBM._resetState = function () {
        MBM._moveUsedThisTurn = {};
        MBM._aiTurn = null;
        MBM._activeWalk = null;
        MBM._knockbacks = [];
        MBM._windowsDeaf = false;
        MBM._deafened = null;
        MBM._enemyEventFor = new Map();
        MBM._combatEnemyEvents = [];
        MBM._allies = [];
        MBM._considered = new Set();
        MBM._hideAllies = false;
        MBM._allyListDirty = true;
        MBM._battleMembersCache = null;
        MBM._roundStarted = false;
        MBM._hpBarKey = "";
        MBM._lastInputActor = null;
        MBM._facingFor = new Map();
        MBM._swingHeard = false;
        MBM._plainAttack = false;
    };

    MBM.begin = function (troopId, persistentId, eventId, mapId) {
        const BSE = window.BattleSystemEnhanced;
        if (!BSE) return;
        // A second Enemy event must never set up a battle on top of the running
        // one: the monster that tried joins this one instead.
        if (MBM._active) {
            const other = $gameMap.event(eventId);
            if (other) MBM.joinEnemyEvent(other);
            return;
        }

        const pData = BSE.State.persistentEnemyData;
        if (!pData[persistentId]) {
            pData[persistentId] = { troopId: troopId, enemyHp: {} };
        }

        $gameMessage._eventActivator = $gameMessage._eventActivator || window._battleActivatorOverride || "p1";
        window._battleActivatorOverride = null;
        $gameSystem._p1PreBattlePos = {
            mapId: $gameMap.mapId(),
            x: $gamePlayer.x,
            y: $gamePlayer.y,
            d: $gamePlayer.direction()
        };
        $gameSystem._p2PreBattlePos = null;

        BSE.State.currentBattleEventId = persistentId;
        BSE.State.currentEventId = eventId;
        BSE.State.currentMapId = mapId;
        BSE.State.needsRespawn = false;

        MBM._troopId = troopId;
        MBM._persistentId = persistentId;
        MBM._eventId = eventId;
        MBM._mapId = mapId;
        MBM._enemyEvent = $gameMap.event(eventId);
        MBM._resetState();
        MBM._followerThrough = [];

        BattleManager.setup(troopId, false, false);
        MBM._startBattleMusic();

        const spriteset = currentSpriteset();
        MBM._logWindow = new Window_BattleLog(new Rectangle(0, 0, Graphics.boxWidth, 168));
        SceneManager._scene.addWindow(MBM._logWindow);
        BattleManager.setLogWindow(MBM._logWindow);
        BattleManager.setSpriteset(spriteset);
        MBM._logWindow.setSpriteset(spriteset);

        MBM._active = true;
        MBM._camera = { x: $gameMap._displayX, y: $gameMap._displayY, returning: 0 };

        MBM._registerEnemyEvent(MBM._enemyEvent, persistentId, troopId, $gameTroop.members());
        MBM._updateBystanderTints();
        MBM._clearWorldSteps();
        MBM._positionParty();
        MBM._preparePet();
        MBM._refreshHpBars();
        MBM._beginRounds();
    };

    MBM._beginRounds = function () {
        // Everybody who was already standing next to a monster when the fight
        // opened brings it in, not just whoever swung first.
        MBM._scanEnemyEventJoins();
        MBM._considerNpcAllies();
        MBM._refreshHpBars();
        BattleManager.startBattle();
    };

    MBM.finish = function () {
        MBM._clearBystanderTints();
        const combatants = MBM._battlerCharacters();
        MBM._settleJoinedEnemies();
        MBM._dismissAllies();

        MBM._active = false;

        MBM._closeTalkMenu();
        MBM._closeCursor();
        MBM._clearPreview();
        MBM._destroyCommandWindows();
        MBM._destroyHpBars();
        MBM._popups = [];
        MBM.clearAttackFx();
        if (window.BattleHotbar && window.BattleHotbar.hide) window.BattleHotbar.hide();
        MBM._plainAttack = false;
        const _snd = window.BattleSystemEnhanced &&
            window.BattleSystemEnhanced.EnemyAnimationSound;
        if (_snd) _snd.clear();

        if (MBM._logWindow) {
            if (MBM._logWindow.parent) MBM._logWindow.parent.removeChild(MBM._logWindow);
            if (MBM._logWindow.destroy) MBM._logWindow.destroy();
            MBM._logWindow = null;
        }

        // Scene_Battle.terminate's teardown, by hand: without it inBattle()
        // stays true and no battler ever gets onBattleEnd().
        $gameParty.onBattleEnd();
        $gameTroop.onBattleEnd();
        // A victory ME restores the saved BGM by itself when it ends; on the
        // silent paths (escape, can-lose defeat) the map music is put back here.
        MBM._battleBgmName = null;
        if (!AudioManager._currentMe || !AudioManager._currentMe.url) {
            BattleManager.replayBgmAndBgs();
        }

        MBM._clearWorldSteps();
        MBM._releaseCombatEvents();
        MBM._restoreFollowerThrough();
        MBM._restorePet();

        for (const character of combatants) {
            if (!(character instanceof Game_Event)) MBM._syncSwimState(character);
        }

        // A loose party (Core/AutoIdleExplorer.js) has no column to close.
        if (!MBM._looseFormation()) $gamePlayer.gatherFollowers();

        MBM._enemyEvent = null;
        MBM._resetState();
        if (MBM._camera) MBM._camera.returning = CAMERA_RETURN_FRAMES;

        // Never left Scene_Map, so "returning" from battle is re-running its
        // start() hook (aliased by BattleSystemEnhancedState.js for corpses,
        // respawn and rewards) with the transfer flag down, or the whole map
        // arrival would replay over the fanfare.
        const scene = SceneManager._scene;
        const wasTransfer = scene._transfer;
        scene._transfer = false;
        MBM._reentering = true;
        try {
            scene.start();
        } finally {
            scene._transfer = wasTransfer;
            MBM._reentering = false;
        }
    };

    MBM._reentering = false;
    MBM.isReentering = function () {
        return !!MBM._reentering;
    };

    // Engaging without facing the monster. The Enemy events walk about, so
    // squaring up to one is fiddly: with map battle mode on, the OK button
    // that found nothing to talk to picks the nearest monster standing within
    // ENGAGE_RANGE and opens the fight on it. Only a monster actually drawn on
    // screen counts, so the button never starts a battle out of nowhere.
    MBM._onScreen = function (character) {
        const sx = character.screenX();
        const sy = character.screenY();
        return sx >= 0 && sx <= Graphics.width && sy >= 0 && sy <= Graphics.height;
    };

    MBM.engageNearbyEnemy = function () {
        if (MBM.isActive()) return false;
        if (!window.isMapBattleMode || !window.isMapBattleMode()) return false;
        const BSE = window.BattleSystemEnhanced;
        if (!BSE || !BSE.Functions.startPersistentBattle) return false;
        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return false;
        if ($gameSystem.getBattleCooldown && $gameSystem.getBattleCooldown() > 0) return false;
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) return false;

        let target = null;
        let best = Infinity;
        for (const event of $gameMap.events()) {
            if (!event || event._erased) continue;
            if (!isEnemyEvent(event) || !event._fixedTroopId || event._fixedTroopId <= 0) continue;
            if (!MBM._onScreen(event)) continue;
            const d = MBM.distance($gamePlayer.x, $gamePlayer.y, event.x, event.y);
            if (d > ENGAGE_RANGE || d >= best) continue;
            best = d;
            target = event;
        }
        if (!target) return false;

        $gamePlayer.setDirection(Grid.faceDir(target.x - $gamePlayer.x, target.y - $gamePlayer.y) ||
            $gamePlayer.direction());
        const persistentId = `${$gameMap.mapId()}_${target.eventId()}`;
        BSE.Functions.startPersistentBattle(target._fixedTroopId, persistentId, target.eventId(), $gameMap.mapId());
        return MBM.isActive();
    };

    // Clicking a monster is an attack order, not a walk order: with map battle
    // mode on, a click that lands on an Enemy event opens the fight from where
    // everybody already stands instead of pathing the leader into it.
    MBM.engageEnemyAtTile = function (x, y) {
        if (MBM.isActive()) return false;
        if (!window.isMapBattleMode || !window.isMapBattleMode()) return false;
        const BSE = window.BattleSystemEnhanced;
        if (!BSE || !BSE.Functions.startPersistentBattle) return false;
        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return false;
        if ($gameSystem.getBattleCooldown && $gameSystem.getBattleCooldown() > 0) return false;
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) return false;

        const target = $gameMap.eventsXy(x, y).find(event =>
            event && !event._erased && isEnemyEvent(event) &&
            event._fixedTroopId > 0 && MBM._onScreen(event));
        if (!target) return false;

        $gamePlayer.setDirection(Grid.faceDir(target.x - $gamePlayer.x, target.y - $gamePlayer.y) ||
            $gamePlayer.direction());
        const persistentId = `${$gameMap.mapId()}_${target.eventId()}`;
        BSE.Functions.startPersistentBattle(target._fixedTroopId, persistentId, target.eventId(), $gameMap.mapId());
        return MBM.isActive();
    };

    // Aliased after Core/MousePan.js, which owns the click-to-move threshold:
    // the destination it just set is the tile the player actually clicked.
    const _Scene_Map_processMapTouch_MBM = Scene_Map.prototype.processMapTouch;
    Scene_Map.prototype.processMapTouch = function () {
        _Scene_Map_processMapTouch_MBM.call(this);
        if (!$gameTemp || !$gameTemp.isDestinationValid()) return;
        if (MBM.engageEnemyAtTile($gameTemp.destinationX(), $gameTemp.destinationY())) {
            $gameTemp.clearDestination();
        }
    };

    const _Game_Player_triggerButtonAction = Game_Player.prototype.triggerButtonAction;
    Game_Player.prototype.triggerButtonAction = function () {
        if (_Game_Player_triggerButtonAction.call(this)) return true;
        return MBM.engageNearbyEnemy();
    };

    //=========================================================================
    // 16. Party positioning: the muster
    //
    // The party fights from where it stands. Whoever bumped the monster holds
    // their tile, and so does every member on the screen within MUSTER_KEEP of
    // them. A member who is absent (a loose party), standing on a tile another
    // combatant holds, or somewhere nothing can stand, is placed on a muster
    // tile MUSTER_MIN..MUSTER_MAX squares off the nearest monster.
    //=========================================================================

    MBM._flankTiles = function (enemy, count, taken) {
        const flanks = [];
        for (let radius = 1; radius <= 3 && flanks.length < count; radius++) {
            for (const d of DIR_LIST) {
                if (flanks.length >= count) break;
                let x = enemy.x, y = enemy.y;
                for (let step = 0; step < radius; step++) {
                    x = $gameMap.roundXWithDirection(x, d);
                    y = $gameMap.roundYWithDirection(y, d);
                }
                if (taken.some(p => p.x === x && p.y === y)) continue;
                if (flanks.some(p => p.x === x && p.y === y)) continue;
                if (!MBM._standable(x, y)) continue;
                flanks.push({ x, y });
            }
        }
        return flanks;
    };

    MBM._enemyAnchors = function () {
        const list = [];
        for (const entry of MBM._combatEnemyEvents) {
            if (entry.event && !entry.event._erased) list.push(entry.event);
        }
        if (list.length === 0 && MBM._enemyEvent) list.push(MBM._enemyEvent);
        return list;
    };

    MBM._nearestAnchorTo = function (character) {
        let best = null;
        let bestD = Infinity;
        for (const foe of MBM._enemyAnchors()) {
            const d = MBM.distance(character.x, character.y, foe.x, foe.y);
            if (d < bestD) { best = foe; bestD = d; }
        }
        return best;
    };

    MBM._standable = function (x, y) {
        if (!$gameMap.isValid(x, y)) return false;
        return DIR_LIST.some(d => $gameMap.isPassable(x, y, d));
    };

    MBM._musterTiles = function (anchor, count, blocked) {
        if (count <= 0) return [];
        const foes = MBM._enemyAnchors();
        const nearestFoe = (x, y) =>
            foes.reduce((best, f) => Math.min(best, MBM.distance(x, y, f.x, f.y)), Infinity);

        const candidates = [];
        for (let dy = -MUSTER_SCAN; dy <= MUSTER_SCAN; dy++) {
            for (let dx = -MUSTER_SCAN; dx <= MUSTER_SCAN; dx++) {
                const away = Math.max(Math.abs(dx), Math.abs(dy));
                if (away > MUSTER_SCAN) continue;
                const x = $gameMap.roundX(anchor.x + dx);
                const y = $gameMap.roundY(anchor.y + dy);
                if (blocked.has(keyOf(x, y))) continue;
                if (!MBM._standable(x, y)) continue;
                const foe = nearestFoe(x, y);
                if (foe < MUSTER_MIN || foe > MUSTER_MAX) continue;
                candidates.push({ x, y, away, foe, wet: MBM.isSwimmableWater(x, y) ? 1 : 0 });
            }
        }
        candidates.sort((a, b) => (a.wet - b.wet) || (a.away - b.away) || (a.foe - b.foe));

        const spots = [];
        for (const c of candidates) {
            if (spots.length >= count) break;
            spots.push({ x: c.x, y: c.y });
            blocked.add(keyOf(c.x, c.y));
        }
        if (spots.length < count && MBM._enemyEvent) {
            const taken = [...blocked].map(k => {
                const [x, y] = k.split(",").map(Number);
                return { x, y };
            });
            for (const spot of MBM._flankTiles(MBM._enemyEvent, count - spots.length, taken)) {
                spots.push(spot);
                blocked.add(keyOf(spot.x, spot.y));
            }
        }
        return spots;
    };

    MBM._looseFormation = function () {
        return !!(window.AutoIdleExplorer && window.AutoIdleExplorer.loose);
    };

    MBM._holdsPosition = function (character, anchor, taken) {
        if (taken.has(keyOf(character.x, character.y))) return false;
        if (!MBM._standable(character.x, character.y) &&
            !MBM.isSwimmableWater(character.x, character.y)) return false;
        if (MBM.distance(character.x, character.y, anchor.x, anchor.y) > MUSTER_KEEP) return false;
        return MBM._isOnScreen(character);
    };

    MBM._positionParty = function () {
        const enemy = MBM._enemyEvent;
        if (!enemy) return;

        const loose = window.AutoIdleExplorer && window.AutoIdleExplorer.loose;
        if (loose && typeof loose.standDown === "function") loose.standDown();

        const activatedByP2 = !!MBM.p2Event() && $gameMessage._eventActivator === "p2";
        const triggerChar = activatedByP2 ? MBM.p2Event() : $gamePlayer;
        MBM._snapCharacter(triggerChar);

        const members = [];
        for (const actor of MBM.withoutAllies(() => $gameParty.battleMembers())) {
            const c = MBM.mapCharacterFor(actor);
            if (!c || c === triggerChar) continue;
            if (typeof c.actor === "function" && !c.actor()) continue;
            if (!members.includes(c)) members.push(c);
        }

        const taken = new Set([keyOf(triggerChar.x, triggerChar.y)]);
        for (const foe of MBM._enemyAnchors()) taken.add(keyOf(foe.x, foe.y));

        MBM._followerThrough = [];
        const placing = [];
        for (const character of members) {
            if (character instanceof Game_Follower) {
                // Followers walk the map through walls; as battlers they are
                // solid, and put back in finish().
                MBM._followerThrough.push({ follower: character, through: character.isThrough() });
            }
            MBM._snapCharacter(character);
            if (MBM._holdsPosition(character, triggerChar, taken)) {
                taken.add(keyOf(character.x, character.y));
                MBM._settleBattler(character);
            } else {
                placing.push(character);
            }
        }

        const spots = MBM._musterTiles(triggerChar, placing.length, taken);
        placing.forEach((character, i) => {
            const spot = spots[i];
            if (spot) MBM._placeBattler(character, spot.x, spot.y);
            MBM._settleBattler(character);
        });
        MBM._settleBattler(triggerChar);
    };

    MBM._settleBattler = function (character) {
        if (character !== $gamePlayer) character.setThrough(false);
        const foe = MBM._nearestAnchorTo(character);
        if (foe) {
            const dir = Grid.faceDir(deltaX(foe.x, character.x), deltaY(foe.y, character.y));
            if (dir) character.setDirection(dir);
        }
        MBM._syncSwimState(character);
    };

    MBM._isOnScreen = function (pos) {
        const x = $gameMap.adjustX(pos.x);
        const y = $gameMap.adjustY(pos.y);
        return x >= -1 && y >= -1 && x <= $gameMap.screenTileX() && y <= $gameMap.screenTileY();
    };

    // locate() on the leader drags the follower train onto their tile; put
    // the followers back where they were.
    MBM._placeBattler = function (character, x, y) {
        if (character === $gamePlayer) {
            const saved = $gamePlayer.followers().data()
                .map(f => ({ f, x: f.x, y: f.y, d: f.direction() }));
            character.locate(x, y);
            for (const s of saved) {
                s.f.locate(s.x, s.y);
                s.f.setDirection(s.d);
            }
        } else {
            character.locate(x, y);
        }
        MBM._syncSwimState(character);
    };

    //=========================================================================
    // 17. Split-screen: one camera for the fight
    //=========================================================================

    if (typeof Scene_Map.prototype.updateSplitScreen === "function") {
        const _Scene_Map_updateSplitScreen = Scene_Map.prototype.updateSplitScreen;
        Scene_Map.prototype.updateSplitScreen = function () {
            if (MBM.isActive()) {
                if (this._splitScreenActive) {
                    this.deactivateSplitScreen();
                    $gamePlayer.center($gamePlayer.x, $gamePlayer.y);
                    if (MBM._camera) {
                        MBM._camera.x = $gameMap._displayX;
                        MBM._camera.y = $gameMap._displayY;
                    }
                }
                return;
            }
            _Scene_Map_updateSplitScreen.call(this);
        };
    }

    MBM._restoreFollowerThrough = function () {
        for (const entry of MBM._followerThrough) {
            if (entry.follower) entry.follower.setThrough(entry.through);
        }
        MBM._followerThrough = [];
    };

    //=========================================================================
    // 18. The tactical camera
    //
    // The view follows whoever is acting: the battler whose turn it is, the
    // tile cursor while one is open, a walker mid-walk. When the fight ends
    // it glides back onto the leader and hands the display back to the engine.
    //=========================================================================

    // What the camera should be looking at, in tile coordinates.
    MBM._cameraFocus = function () {
        const st = MBM._cursorState;
        if (st && st.mode === "move") return { x: st.x, y: st.y };
        if (st && st.mode === "target") {
            const ch = MBM.mapCharacterFor(st.list[st.index]);
            if (ch) return { x: ch.x, y: ch.y };
        }
        const walk = MBM._activeWalk;
        if (walk && walk.character) {
            return { x: walk.character._realX, y: walk.character._realY };
        }
        const battler = BattleManager._subject || BattleManager.actor();
        const ch = battler ? MBM.mapCharacterFor(battler) : null;
        if (ch) return { x: ch._realX, y: ch._realY };
        return { x: $gamePlayer._realX, y: $gamePlayer._realY };
    };

    MBM._easeCameraTo = function (fx, fy, ease) {
        const targetX = fx - ($gameMap.screenTileX() - 1) / 2;
        const targetY = fy - ($gameMap.screenTileY() - 1) / 2;
        const dx = deltaX(targetX, $gameMap._displayX);
        const dy = deltaY(targetY, $gameMap._displayY);
        if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) return true;
        $gameMap.setDisplayPos($gameMap._displayX + dx * ease, $gameMap._displayY + dy * ease);
        return false;
    };

    MBM._updateCamera = function () {
        const focus = MBM._cameraFocus();
        MBM._easeCameraTo(focus.x, focus.y, CAMERA_EASE);
    };

    // The glide back after the fight; stops early once the leader is centred
    // or the moment the player takes a step of their own.
    MBM._updateCameraReturn = function () {
        const cam = MBM._camera;
        if (!cam || cam.returning <= 0) return;
        if ($gamePlayer.isMoving()) { cam.returning = 0; return; }
        cam.returning--;
        if (MBM._easeCameraTo($gamePlayer._realX, $gamePlayer._realY, CAMERA_EASE)) cam.returning = 0;
    };

    const _Game_Player_updateScroll_mbm = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function (lastScrolledX, lastScrolledY) {
        if (MBM.isActive()) return;
        if (MBM._camera && MBM._camera.returning > 0) return;
        _Game_Player_updateScroll_mbm.call(this, lastScrolledX, lastScrolledY);
    };

    //=========================================================================
    // 19. Per-frame driver
    //=========================================================================

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        if (MBM.isActive()) MBM.update();
        else MBM._updateCameraReturn();
    };

    MBM.update = function () {
        if (!BattleManager._subject && MBM._aiTurn) MBM._aiTurn = null;
        BattleManager.update(true);
        MBM._updateWalk();
        MBM._updateKnockback();
        // Walking up to a bystanding monster drags it in whichever way the party
        // moved, not only through the cursor walk.
        if ((Graphics.frameCount % JOIN_SCAN_INTERVAL) === 0) {
            MBM._scanEnemyEventJoins();
            MBM._updateBystanderTints();
        }
        MBM._updateHpBars();
        MBM._updateBattleMusic();
        MBM._updateCamera();
        const _snd = window.BattleSystemEnhanced &&
            window.BattleSystemEnhanced.EnemyAnimationSound;
        if (_snd) _snd.update();

        MBM._setWindowsDeaf($gameMessage.isBusy());
        if ($gameMessage.isBusy()) return;
        if (MBM.isTalkMenuOpen()) return;

        MBM._updateCursorInput();
        MBM._updateActorInput();
        MBM._updateHotbar();
    };

    MBM._updateHotbar = function () {
        if (!window.BattleHotbar || !window.BattleHotbar.update) return;
        const inert = !!(MBM._cursorState || MBM._activeWalk || MBM.isTalkMenuOpen());
        window.BattleHotbar.update(inert);
    };

    MBM._setWindowsDeaf = function (deaf) {
        if (MBM._windowsDeaf === deaf) return;
        MBM._windowsDeaf = deaf;
        if (deaf) {
            MBM._deafened = [MBM._cmdWindow, MBM._skillWindow, MBM._itemWindow, MBM._throwWindow]
                .filter(w => w && w.active);
            MBM._deafened.forEach(w => w.deactivate());
        } else {
            for (const w of MBM._deafened || []) {
                if (w && w.visible) w.activate();
            }
            MBM._deafened = null;
        }
    };

    MBM._isAnyInputActive = function () {
        if (MBM._activeWalk || MBM._cursorState) return true;
        if (MBM.isTalkMenuOpen()) return true;
        return [MBM._cmdWindow, MBM._skillWindow, MBM._itemWindow, MBM._throwWindow]
            .some(w => w && w.active && w.visible);
    };

    MBM._updateActorInput = function () {
        if (!BattleManager.isInputting()) {
            if (MBM._lastInputActor) {
                MBM._lastInputActor = null;
                MBM._closeCursor();
                MBM._clearPreview();
                MBM._closeCommandWindow();
                MBM._closeSubWindows();
            }
            return;
        }
        if (!BattleManager.actor()) {
            if (!BattleManager.isTpb() && !MBM._isAnyInputActive()) {
                BattleManager.selectNextCommand();
            }
            return;
        }
        if (MBM._lastInputActor !== BattleManager.actor()) {
            MBM._lastInputActor = BattleManager.actor();
            delete MBM._moveUsedThisTurn[BattleManager.actor().actorId()];
            MBM._openCommandWindow(BattleManager.actor());
        }
    };

    //=========================================================================
    // 20. Command window, sub windows, range tails and previews
    //=========================================================================

    function commandWindowRect() {
        const width = 220;
        const margin = 12;
        const height = SceneManager._scene.calcWindowHeight ? SceneManager._scene.calcWindowHeight(5, true) : 300;
        // Same bottom line as the skill hotbar, the way the Scene_Battle menu
        // stands (BattleSystemEnhanchedCommands.js).
        const hotbar = window.BattleHotbar;
        const bottomY = (hotbar && typeof hotbar.slotBottomY === 'function')
            ? hotbar.slotBottomY() - Math.floor((Graphics.height - Graphics.boxHeight) / 2)
            : Graphics.boxHeight - margin;
        SceneManager._scene._bseCommandBottomY = bottomY;
        return new Rectangle(Graphics.boxWidth - width - margin, bottomY - height, width, height);
    }

    function subWindowRect() {
        const height = SceneManager._scene.calcWindowHeight ? SceneManager._scene.calcWindowHeight(4, true) : 240;
        return new Rectangle(0, Graphics.boxHeight - height, Graphics.boxWidth, height);
    }

    MBM._openCommandWindow = function (actor) {
        MBM._closeCursor();
        MBM._clearPreview();
        if (!MBM._cmdWindow) {
            MBM._cmdWindow = new Window_ActorCommand(commandWindowRect());
            SceneManager._scene.addWindow(MBM._cmdWindow);
            MBM._cmdWindow.setHandler("move", MBM._commandMove);
            MBM._cmdWindow.setHandler("attack", MBM._commandAttack);
            MBM._cmdWindow.setHandler("defense", MBM._commandDefense);
            MBM._cmdWindow.setHandler("reload", MBM._commandDefense);
            MBM._cmdWindow.setHandler("skill", MBM._commandSkill);
            MBM._cmdWindow.setHandler("basic", MBM._commandSkillBasic);
            MBM._cmdWindow.setHandler("item", MBM._commandItem);
            MBM._cmdWindow.setHandler("throw", MBM._commandThrow);
            MBM._cmdWindow.setHandler("talk", MBM._commandTalk);
            MBM._cmdWindow.setHandler("aim", MBM._commandAim);
            MBM._cmdWindow.setHandler("wrestle", MBM._commandWrestle);
            MBM._cmdWindow.setHandler("escape", MBM._commandEscape);
            MBM._cmdWindow.setHandler("cancel", () => {
                SoundManager.playBuzzer();
                if (MBM._cmdWindow) MBM._cmdWindow.activate();
            });
        }
        MBM._cmdWindow.x = commandWindowRect().x;
        MBM._cmdWindow.show();
        MBM._cmdWindow.setup(actor);
        MBM._previewForCommand();
    };

    MBM._closeCommandWindow = function () {
        // A planning menu left standing would hand the window back holding rows
        // that are no longer about anything (Scene_Battle drops them the same way
        // in endCommandSelection).
        const scene = SceneManager._scene;
        if (scene && scene.closeAimMenu) scene.closeAimMenu();
        if (scene && scene.closeWrestleMenu) scene.closeWrestleMenu();
        if (MBM._cmdWindow) {
            MBM._cmdWindow.hide();
            MBM._cmdWindow.deactivate();
        }
        MBM._clearPreview();
    };

    MBM._closeSubWindows = function () {
        [MBM._skillWindow, MBM._itemWindow, MBM._throwWindow].forEach(w => {
            if (!w) return;
            w.hide();
            w.deactivate();
        });
        MBM._clearPreview();
    };

    MBM._destroyCommandWindows = function () {
        [MBM._cmdWindow, MBM._skillWindow, MBM._itemWindow, MBM._throwWindow].forEach(w => {
            if (!w) return;
            if (w.parent) w.parent.removeChild(w);
            if (w.destroy) w.destroy();
        });
        MBM._cmdWindow = null;
        MBM._skillWindow = null;
        MBM._itemWindow = null;
        // The throw list is built on the same window as the backpack and owns
        // a panel of its own: left behind, it points at a dead scene.
        MBM._throwWindow = null;
    };

    MBM.canUseMoveCommand = function (actor) {
        if (!MBM.isActive() || !actor) return false;
        if (MBM._moveUsedThisTurn[actor.actorId()]) return false;
        return !!MBM.mapCharacterFor(actor);
    };

    // --- Range tails on the command rows -------------------------------------
    // Attack carries the weapon's reach, Move the squares left to walk.
    MBM.rangeTail = function (range) {
        return T('Battle.mbm.rangeTail', { range: range });
    };

    const _Window_ActorCommand_makeCommandList_mbm = Window_ActorCommand.prototype.makeCommandList;
    Window_ActorCommand.prototype.makeCommandList = function () {
        _Window_ActorCommand_makeCommandList_mbm.call(this);
        if (!MBM.isActive() || !this._actor || !this._list) return;
        for (const cmd of this._list) {
            if (!cmd || cmd.cost) continue;
            if (cmd.symbol === "attack") cmd.cost = MBM.rangeTail(MBM.attackRange(this._actor));
            else if (cmd.symbol === "move") cmd.cost = T('Battle.mbm.moveTail', { n: MBM.moveRange(this._actor) });
        }
        // Running is only offered when there is somewhere to run to: with a
        // monster right up against the party the row is greyed out rather than
        // refusing after the fact.
        for (const cmd of this._list) {
            if (cmd && cmd.symbol === "escape" && MBM._escapeBlockers().length > 0) cmd.enabled = false;
        }
    };

    // --- Previews ---------------------------------------------------------------
    // Resting the cursor on Attack, Move, a skill or an item paints the tiles
    // it covers from where the actor stands.
    MBM._clearPreview = function () {
        for (const s of MBM._previewSprites) {
            if (s.parent) s.parent.removeChild(s);
            if (s.destroy) s.destroy();
        }
        MBM._previewSprites = [];
    };

    MBM._paintPreview = function (coords, color) {
        MBM._clearPreview();
        MBM._previewSprites = MBM._paintTiles(coords, color, []);
    };

    MBM._previewAction = function (actor, range, minRange, color) {
        const character = MBM.mapCharacterFor(actor);
        if (!character) { MBM._clearPreview(); return; }
        MBM._paintPreview(MBM._coveredTiles(character, range, minRange), color);
    };

    MBM._previewMove = function (actor) {
        const character = MBM.mapCharacterFor(actor);
        if (!character) { MBM._clearPreview(); return; }
        const { dist } = MBM._reachableFor(actor, character);
        const coords = [...dist.keys()].filter(k => dist.get(k) > 0).map(k => k.split(",").map(Number));
        MBM._paintPreview(coords, COLOR_PREVIEW_MOVE);
    };

    MBM._previewForCommand = function () {
        const win = MBM._cmdWindow;
        if (!MBM.isActive() || !win || !win.visible || MBM._cursorState) return;
        const actor = BattleManager.actor();
        if (!actor) { MBM._clearPreview(); return; }
        const symbol = win.currentSymbol ? win.currentSymbol() : null;
        if (symbol === "attack") {
            MBM._previewAction(actor, MBM.attackRange(actor), MBM.attackMinRange(actor), COLOR_PREVIEW_ATTACK);
        } else if (symbol === "move" && MBM.canUseMoveCommand(actor)) {
            MBM._previewMove(actor);
        } else {
            MBM._clearPreview();
        }
    };

    MBM._previewForSkill = function (win) {
        if (!MBM.isActive() || !win || !win.visible || !win.active) return;
        const actor = BattleManager.actor();
        const item = win.item ? win.item() : null;
        if (!actor || !item) { MBM._clearPreview(); return; }
        MBM._previewAction(actor, MBM.skillRange(item), MBM.skillMinRange(item), COLOR_PREVIEW_SKILL);
    };

    const _Window_ActorCommand_select_mbm = Window_ActorCommand.prototype.select;
    Window_ActorCommand.prototype.select = function (index) {
        _Window_ActorCommand_select_mbm.call(this, index);
        if (MBM.isActive() && this === MBM._cmdWindow) MBM._previewForCommand();
    };

    const _Window_SkillList_select_mbm = Window_SkillList.prototype.select;
    Window_SkillList.prototype.select = function (index) {
        _Window_SkillList_select_mbm.call(this, index);
        if (MBM.isActive() && this === MBM._skillWindow) MBM._previewForSkill(this);
    };

    const _Window_ItemList_select_mbm = Window_ItemList.prototype.select;
    Window_ItemList.prototype.select = function (index) {
        _Window_ItemList_select_mbm.call(this, index);
        if (MBM.isActive() && this === MBM._itemWindow) MBM._previewForSkill(this);
    };

    // --- Range on every skill row ------------------------------------------
    // The canvas list keeps its cost and gains the range beside it; the HTML
    // list (CategorizedBattleSkills.js) gets a range chip on every row.
    const _Window_SkillList_drawSkillCost = Window_SkillList.prototype.drawSkillCost;
    Window_SkillList.prototype.drawSkillCost = function (skill, x, y, width) {
        _Window_SkillList_drawSkillCost.call(this, skill, x, y, width);
        if (!MBM.isActive()) return;
        const costWidth = this.costWidth ? this.costWidth() : 48;
        this.changeTextColor("#88ccff");
        this.drawText(MBM.rangeTail(MBM.skillRange(skill)), x, y, width - costWidth - 8, "right");
        this.resetTextColor();
    };

    if (typeof Window_BattleSkill !== "undefined" &&
        typeof Window_BattleSkill.prototype._buildSkillItems === "function") {
        const _Window_BattleSkill_buildSkillItems_mbm = Window_BattleSkill.prototype._buildSkillItems;
        Window_BattleSkill.prototype._buildSkillItems = function () {
            _Window_BattleSkill_buildSkillItems_mbm.call(this);
            if (!MBM.isActive() || !this._htmlSkillEls) return;
            this._htmlSkillEls.forEach((el, i) => {
                const skill = this._data && this._data[i];
                if (!el || !skill) return;
                const tail = el.lastElementChild || el;
                const chip = document.createElement('span');
                chip.className = 'mbm-range-chip';
                chip.style.cssText = 'color:var(--text-info, #88ccff);font-weight:bold;margin-left:10px;';
                chip.textContent = MBM.rangeTail(MBM.skillRange(skill));
                tail.appendChild(chip);
            });
        };
    }

    // --- Command handlers ----------------------------------------------------
    MBM._afterActionSelected = function () {
        const action = BattleManager.inputtingAction();
        MBM._clearPreview();
        if (!action.needsSelection()) {
            BattleManager.selectNextCommand();
            return;
        }
        MBM._startTargeting(action);
    };

    MBM._commandAttack = function () {
        if (!MBM.canUseAttackCommand(BattleManager.actor())) {
            SoundManager.playBuzzer();
            if (MBM._cmdWindow) MBM._cmdWindow.activate();
            return;
        }
        const action = BattleManager.inputtingAction();
        action.setAttack();
        MBM._afterActionSelected();
    };

    MBM._commandDefense = function () {
        const action = BattleManager.inputtingAction();
        action.setSkill(2);
        BattleManager.selectNextCommand();
    };

    MBM._commandIsLive = function () {
        const win = MBM._cmdWindow;
        if (!win || !win.isCurrentCommandEnabled) return true;
        if (win.isCurrentCommandEnabled()) return true;
        SoundManager.playBuzzer();
        win.activate();
        return false;
    };

    MBM._commandSkill = function () {
        if (!MBM._commandIsLive()) return;
        const actor = BattleManager.actor();
        if (!MBM._skillWindow) {
            MBM._skillWindow = new Window_BattleSkill(subWindowRect());
            MBM._skillWindow.setHandler("ok", MBM._onSkillOk);
            MBM._skillWindow.setHandler("cancel", MBM._onSkillCancel);
            SceneManager._scene.addWindow(MBM._skillWindow);
        }
        MBM._skillWindow.setActor(actor);
        if (MBM._skillWindow.setBasicMode) MBM._skillWindow.setBasicMode(false);
        MBM._skillWindow.setStypeId(MBM._cmdWindow.currentExt());
        MBM._skillWindow.refresh();
        MBM._skillWindow.show();
        MBM._skillWindow.activate();
        MBM._closeCommandWindow();
        MBM._previewForSkill(MBM._skillWindow);
    };

    MBM._commandSkillBasic = function () {
        if (!MBM._commandIsLive()) return;
        MBM._commandSkill();
        if (MBM._skillWindow.setBasicMode) MBM._skillWindow.setBasicMode(true);
        MBM._skillWindow.setStypeId(0);
        MBM._skillWindow.refresh();
        MBM._previewForSkill(MBM._skillWindow);
    };

    MBM._onSkillOk = function () {
        const skill = MBM._skillWindow.item();
        const action = BattleManager.inputtingAction();
        action.setSkill(skill.id);
        BattleManager.actor().setLastBattleSkill && BattleManager.actor().setLastBattleSkill(skill);
        MBM._skillWindow.hide();
        MBM._skillWindow.deactivate();
        MBM._afterActionSelected();
    };

    MBM._onSkillCancel = function () {
        MBM._skillWindow.hide();
        MBM._skillWindow.deactivate();
        MBM._openCommandWindow(BattleManager.actor());
    };

    MBM._commandItem = function () {
        if (!MBM._commandIsLive()) return;
        if (!MBM._itemWindow) {
            MBM._itemWindow = new Window_BattleItem(subWindowRect());
            MBM._itemWindow.setHandler("ok", MBM._onItemOk);
            MBM._itemWindow.setHandler("cancel", MBM._onItemCancel);
            SceneManager._scene.addWindow(MBM._itemWindow);
        }
        MBM._itemWindow.refresh();
        MBM._itemWindow.show();
        MBM._itemWindow.activate();
        MBM._closeCommandWindow();
        MBM._previewForSkill(MBM._itemWindow);
    };

    MBM._onItemOk = function () {
        const item = MBM._itemWindow.item();
        const action = BattleManager.inputtingAction();
        action.setItem(item.id);
        $gameParty.setLastItem(item);
        MBM._itemWindow.hide();
        MBM._itemWindow.deactivate();
        MBM._afterActionSelected();
    };

    MBM._onItemCancel = function () {
        MBM._itemWindow.hide();
        MBM._itemWindow.deactivate();
        MBM._openCommandWindow(BattleManager.actor());
    };

    // Naming a body: the tile cursor opens over every monster in sight and the
    // one picked is dragged into the fight before its body is read.
    MBM._commandAim = function () {
        if (!MBM._commandIsLive()) return;
        if (window.Aiming && window.Aiming.startFromCommand(SceneManager._scene)) return;
        SoundManager.playBuzzer();
        if (MBM._cmdWindow) MBM._cmdWindow.activate();
    };

    // Taking hold: the grapple is planned on whoever is standing next to you.
    MBM._commandWrestle = function () {
        if (!MBM._commandIsLive()) return;
        if (window.Wrestling && window.Wrestling.startFromCommand(SceneManager._scene)) return;
        SoundManager.playBuzzer();
        if (MBM._cmdWindow) MBM._cmdWindow.activate();
    };

    MBM._commandTalk = function () {
        if (MBM.openTalkMenu()) return;
        SoundManager.playBuzzer();
        if (MBM._cmdWindow) MBM._cmdWindow.activate();
    };

    // Breaking away is a matter of distance: no one runs while a monster is
    // still within ESCAPE_BLOCK_RANGE of any of the party's own combatants.
    MBM._escapeBlockers = function () {
        const party = [];
        for (const actor of $gameParty.battleMembers()) {
            if (MBM.isAllyActor && MBM.isAllyActor(actor)) continue;
            const c = MBM.mapCharacterFor(actor);
            if (c && !(actor.isDead && actor.isDead())) party.push(c);
        }
        const blockers = [];
        for (const entry of MBM._combatEnemyEvents) {
            const event = entry.event;
            if (!event || event._erased) continue;
            if (!entry.battlers.some(b => b && b.isAlive() && b.isAppeared())) continue;
            if (party.some(c => MBM.distance(c.x, c.y, event.x, event.y) <= ESCAPE_BLOCK_RANGE)) {
                blockers.push(event);
            }
        }
        return blockers;
    };

    // The odds one body has of slipping away, given how far the nearest live
    // monster stands. Pure, so the tests can walk the whole curve.
    MBM.escapeChanceAt = function (distance) {
        if (!(distance > ESCAPE_BLOCK_RANGE)) return ESCAPE_MIN_CHANCE;
        if (distance >= ESCAPE_FREE_RANGE) return 1;
        const t = (distance - ESCAPE_BLOCK_RANGE) / (ESCAPE_FREE_RANGE - ESCAPE_BLOCK_RANGE);
        return ESCAPE_MIN_CHANCE + (1 - ESCAPE_MIN_CHANCE) * t;
    };

    // The party runs together: the whole band's chance is the mean of each
    // member's own, so one straggler left in the thick of it drags it down.
    MBM.escapeChanceFor = function (distances) {
        if (!distances || distances.length === 0) return 1;
        let sum = 0;
        for (const d of distances) sum += MBM.escapeChanceAt(d);
        return sum / distances.length;
    };

    // Every standing party combatant's distance to its nearest live monster.
    MBM._escapeDistances = function () {
        const foes = [];
        for (const entry of MBM._combatEnemyEvents) {
            const event = entry.event;
            if (!event || event._erased) continue;
            if (!entry.battlers.some(b => b && b.isAlive() && b.isAppeared())) continue;
            foes.push(event);
        }
        if (foes.length === 0) return [];
        const distances = [];
        for (const actor of $gameParty.battleMembers()) {
            if (MBM.isAllyActor && MBM.isAllyActor(actor)) continue;
            if (actor.isDead && actor.isDead()) continue;
            const c = MBM.mapCharacterFor(actor);
            if (!c) continue;
            let best = Infinity;
            for (const foe of foes) best = Math.min(best, MBM.distance(c.x, c.y, foe.x, foe.y));
            distances.push(best);
        }
        return distances;
    };

    MBM._escapeChance = function () {
        return MBM.escapeChanceFor(MBM._escapeDistances());
    };

    MBM._commandEscape = function () {
        if (MBM._escapeBlockers().length > 0) {
            SoundManager.playBuzzer();
            const text = T('Battle.escape.tooClose', { range: ESCAPE_BLOCK_RANGE });
            if (window.ParchmentToast) {
                window.ParchmentToast.show(text, { severity: "warning", duration: 120 });
            } else if (MBM._logWindow) {
                MBM._logWindow.addText(text);
            }
            if (MBM._cmdWindow) MBM._cmdWindow.activate();
            return;
        }
        // Distance is the whole of it here: the vanilla AGI ratio is replaced
        // by how much open ground the party as a whole has put between itself
        // and the monsters still standing.
        BattleManager.makeEscapeRatio();
        // A free getaway already granted elsewhere (the open world's first
        // turn) is never taken back by the distance rule.
        BattleManager._escapeRatio = Math.max(BattleManager._escapeRatio || 0, MBM._escapeChance());
        const escaped = BattleManager.processEscape();
        if (!escaped && !BattleManager.isBattleEnd()) {
            BattleManager.selectNextCommand();
            return;
        }
        // A successful escape has run endBattle(); updateBattleEnd finishes
        // the fight next frame. Tear the input state down explicitly.
        MBM._closeCursor();
        MBM._closeCommandWindow();
        MBM._closeSubWindows();
        if (window.BattleHotbar && window.BattleHotbar.hide) window.BattleHotbar.hide();
        MBM._lastInputActor = null;
        MBM._activeWalk = null;
        MBM._aiTurn = null;
        BattleManager._currentActor = null;
        BattleManager._subject = null;
        BattleManager._inputting = false;
    };

    //=========================================================================
    // 21. Tile highlight sprites
    //=========================================================================

    class Sprite_MBMTile extends Sprite {
        constructor(x, y, color) {
            super();
            this._tx = x;
            this._ty = y;
            this._color = color;
            this.anchor.x = 0.5;
            this.anchor.y = 0.5;
            this.z = 1;
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            this.bitmap = new Bitmap(tw, th);
            this.bitmap.fillRect(2, 2, tw - 4, th - 4, color);
        }
        update() {
            super.update();
            this.x = tileCenterX(this._tx);
            this.y = tileCenterY(this._ty) - $gameMap.tileHeight() / 2;
        }
    }

    function destroySprites(list) {
        for (const s of list) {
            if (s.parent) s.parent.removeChild(s);
            if (s.destroy) s.destroy();
        }
        list.length = 0;
    }

    // Each highlight owns a Bitmap; removing it from the stage is not enough.
    MBM._clearTiles = function () {
        destroySprites(MBM._tileSprites);
        destroySprites(MBM._pathSprites);
    };

    // Paints into `into` (defaults to the main highlight list) and returns it.
    MBM._paintTiles = function (coords, color, into) {
        const list = into || MBM._tileSprites;
        const spriteset = currentSpriteset();
        if (!spriteset || !spriteset._tilemap) return list;
        for (const [x, y] of coords) {
            const sprite = new Sprite_MBMTile(x, y, color);
            spriteset._tilemap.addChild(sprite);
            list.push(sprite);
        }
        return list;
    };

    //=========================================================================
    // 22. Move command: eight-way Dijkstra, zone of control, path preview
    //=========================================================================

    MBM._occupiedTiles = function (exceptCharacter) {
        const set = new Set();
        for (const c of MBM._battlerCharacters()) {
            if (c && c !== exceptCharacter) set.add(keyOf(c.x, c.y));
        }
        return set;
    };

    // Squares adjacent to a living hostile of the mover: entering one costs
    // ZOC_COST more.
    MBM._zocTiles = function (battler) {
        const set = new Set();
        for (const [hx, hy] of MBM._hostilePositions(battler)) {
            for (const [dx, dy] of NEIGHBOURS) {
                set.add(keyOf($gameMap.roundX(hx + dx), $gameMap.roundY(hy + dy)));
            }
        }
        return set;
    };

    MBM._reachableFor = function (battler, character, budget) {
        const range = budget != null ? budget : MBM.moveRange(battler);
        const blocked = MBM._occupiedTiles(character);
        const zoc = MBM._zocTiles(battler);
        return Grid.reachable(character.x, character.y, range, {
            wrapX: x => $gameMap.roundX(x),
            wrapY: y => $gameMap.roundY(y),
            cost: (x, y) => {
                const key = keyOf(x, y);
                if (blocked.has(key)) return Infinity;
                if (!$gameMap.isValid(x, y)) return Infinity;
                return MBM.stepCost(x, y) + (zoc.has(key) ? ZOC_COST : 0);
            },
            canStep: (fx, fy, tx, ty, horz, vert) => MBM._canStep(character, fx, fy, horz, vert)
        });
    };

    MBM._commandMove = function () {
        const actor = BattleManager.actor();
        const character = MBM.mapCharacterFor(actor);
        if (!character) { SoundManager.playBuzzer(); MBM._cmdWindow.activate(); return; }

        const { dist, prev } = MBM._reachableFor(actor, character);
        const coords = [...dist.keys()]
            .filter(k => dist.get(k) > 0)
            .map(k => k.split(",").map(Number));

        MBM._closeCommandWindow();
        MBM._paintTiles(coords, COLOR_MOVE);

        MBM._cursorState = {
            mode: "move",
            character,
            x: character.x,
            y: character.y,
            reachable: dist,
            prev,
            cursorSprite: null
        };
        const spriteset = currentSpriteset();
        if (spriteset && spriteset._tilemap) {
            MBM._cursorState.cursorSprite = new Sprite_MBMTile(character.x, character.y, COLOR_CURSOR);
            spriteset._tilemap.addChild(MBM._cursorState.cursorSprite);
        }
    };


    //=========================================================================
    // 26b. Throw: an object out of the backpack, at a square
    //
    // The Throw row (BattleSystemEnhanchedCommands.js) on a map fight names a
    // TILE rather than a battler: what lands there takes the weight of the
    // object, whether it is in the fight or just standing in the way.
    // window.ThrowItem (BattleSystem/ThrowItemPlugin.js) owns damage, the
    // crime and the infection; this only aims.
    //=========================================================================

    // How far an object can be thrown, in tiles: light things fly, heavy ones
    // barely leave the hand.
    MBM.throwRange = function (item) {
        if (!window.ThrowItem) return 1;
        const grams = window.ThrowItem.weightOf(item);
        return Math.max(1, Math.min(8, Math.round(8 - grams / 800)));
    };

    MBM._commandThrow = function () {
        if (!MBM._commandIsLive()) return;
        if (!window.ThrowItem || window.ThrowItem.throwableItems().length === 0) {
            SoundManager.playBuzzer();
            if (MBM._cmdWindow) MBM._cmdWindow.activate();
            return;
        }
        if (!MBM._throwWindow) {
            MBM._throwWindow = new Window_BattleItem(subWindowRect());
            // The same bag, judged by what may be hurled rather than used, and
            // listed object by object: a short list needs no category step.
            MBM._throwWindow.includes = item => window.ThrowItem.isThrowable(item);
            MBM._throwWindow.isEnabled = item => !!item && $gameParty.numItems(item) > 0;
            MBM._throwWindow.isCategorized = () => false;
            MBM._throwWindow.setHandler("ok", MBM._onThrowOk);
            MBM._throwWindow.setHandler("cancel", MBM._onThrowCancel);
            SceneManager._scene.addWindow(MBM._throwWindow);
        }
        MBM._throwWindow.refresh();
        MBM._throwWindow.show();
        MBM._throwWindow.activate();
        MBM._closeCommandWindow();
    };

    MBM._onThrowCancel = function () {
        MBM._throwWindow.hide();
        MBM._throwWindow.deactivate();
        MBM._openCommandWindow(BattleManager.actor());
    };

    MBM._onThrowOk = function () {
        const item = MBM._throwWindow.item();
        MBM._throwWindow.hide();
        MBM._throwWindow.deactivate();
        if (!item) { MBM._openCommandWindow(BattleManager.actor()); return; }

        const actor = BattleManager.actor();
        const character = MBM.mapCharacterFor(actor);
        if (!character) { SoundManager.playBuzzer(); MBM._openCommandWindow(actor); return; }

        const range = MBM.throwRange(item);
        const coords = [];
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                if (Math.abs(dx) + Math.abs(dy) > range) continue;
                if (dx === 0 && dy === 0) continue;
                const x = $gameMap.roundX(character.x + dx);
                const y = $gameMap.roundY(character.y + dy);
                if (!$gameMap.isValid(x, y)) continue;
                coords.push([x, y]);
            }
        }
        if (coords.length === 0) { SoundManager.playBuzzer(); MBM._openCommandWindow(actor); return; }

        MBM._paintTiles(coords, COLOR_MOVE);
        const reachable = new Set(coords.map(([x, y]) => keyOf(x, y)));
        MBM._cursorState = {
            mode: "throw",
            item,
            character,
            x: coords[0][0],
            y: coords[0][1],
            squares: reachable,
            cursorSprite: null
        };
        const spriteset = currentSpriteset();
        if (spriteset && spriteset._tilemap) {
            MBM._cursorState.cursorSprite = new Sprite_MBMTile(MBM._cursorState.x, MBM._cursorState.y, COLOR_CURSOR);
            spriteset._tilemap.addChild(MBM._cursorState.cursorSprite);
        }
    };

    // A tile in screen pixels, for the flying model.
    function tileScreenPoint(x, y) {
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        return {
            x: $gameMap.adjustX(x) * tw + tw / 2,
            y: $gameMap.adjustY(y) * th + th / 2
        };
    }

    MBM._confirmThrow = function () {
        const st = MBM._cursorState;
        if (!st || st.mode !== "throw") return;
        const { item, character, x, y } = st;
        MBM._closeCursor();

        $gameParty.loseItem(item, 1);
        const itemData = {
            itemType: DataManager.isWeapon(item) ? "weapon" : DataManager.isArmor(item) ? "armor" : "item",
            itemId: item.id,
            iconIndex: item.iconIndex
        };
        const land = () => {
            const report = window.ThrowItem.hitEventAt(x, y, itemData);
            if (report) window.ThrowItem.announce(report);
        };
        if (window.ThrowItem.flyModel) {
            window.ThrowItem.flyModel(item, tileScreenPoint(character.x, character.y), tileScreenPoint(x, y), land);
        } else {
            land();
        }
        BattleManager.selectNextCommand();
    };

    MBM._pathFrom = function (prev, character, destKey) {
        return Grid.pathTo(prev, keyOf(character.x, character.y), destKey);
    };

    // The path the walk will take, drawn under the move cursor.
    MBM._repaintPath = function () {
        const st = MBM._cursorState;
        destroySprites(MBM._pathSprites);
        if (!st || st.mode !== "move") return;
        const destKey = keyOf(st.x, st.y);
        if (!st.reachable.has(destKey) || st.reachable.get(destKey) === 0) return;
        MBM._paintTiles(MBM._pathFrom(st.prev, st.character, destKey), COLOR_PATH, MBM._pathSprites);
    };

    // One step of a walk, straight or diagonal.
    MBM._stepCharacter = function (character, tx, ty) {
        const { horz, vert } = Grid.stepDirs(deltaX(tx, character.x), deltaY(ty, character.y));
        if (!horz && !vert) return false;
        MBM._enterWaterFor(character, tx, ty);
        if (horz && vert) character.moveDiagonally(horz, vert);
        else character.moveStraight(horz || vert);
        MBM._syncSwimState(character);
        return character.isMovementSucceeded();
    };

    MBM._updateWalk = function () {
        const walk = MBM._activeWalk;
        if (!walk) return;
        if (walk.character.isMoving()) return;
        if (walk.i >= walk.path.length) {
            MBM._activeWalk = null;
            if (walk.onDone) walk.onDone();
            return;
        }
        const [tx, ty] = walk.path[walk.i];
        walk.i++;
        if (MBM._stepCharacter(walk.character, tx, ty)) {
            // Walking past a monster is how you pick a fight with it.
            MBM._scanEnemyEventJoins();
        } else {
            // A bystander stepped into the path: stop here.
            MBM._activeWalk = null;
            if (walk.onDone) walk.onDone();
        }
    };

    //=========================================================================
    // 22b. Vector gun recoil: the shot throws the body back
    //=========================================================================
    // Em's gun (Weapon/VectorGunSystem.js) is not an ordinary firearm and out
    // here that shows: a round that lands shoves the body it hit straight back
    // along the line of fire, and the closer it was standing the harder it is
    // thrown, because the whole of the recoil is spent on it before the shot
    // has any distance to bleed into. Point blank is the full throw, and every
    // tile of range takes one tile off it.
    //
    // Only the gun as a gun does this. Folded into one of its melee shapes the
    // frame strikes rather than shoots (VectorGun.inMeleeForm), so nothing
    // kicks. The push is a real walk over real tiles: a wall, a body or the
    // edge of the map stops it where it stands.
    const VG_PUSH_MAX = 4;      // tiles a shot fired point blank throws a body
    const VG_PUSH_MIN = 1;      // and never fewer than this, at any range
    const VG_PUSH_SPEED = 5;    // how fast the body slides while it is thrown

    // How far a shot from `distance` tiles away throws what it hits.
    MBM.recoilPushTiles = function (distance) {
        const d = Math.max(1, Math.floor(distance || 1));
        return Math.max(VG_PUSH_MIN, VG_PUSH_MAX - (d - 1));
    };

    // Whether this battler is shooting the vector gun rather than swinging it.
    MBM.firesVectorGun = function (battler) {
        const VG = window.VectorGun;
        if (!VG || !VG.isVectorGun) return false;
        if (!battler || !battler.isActor || !battler.isActor()) return false;
        if (!battler.weapons || !battler.weapons().some(VG.isVectorGun)) return false;
        return !(VG.inMeleeForm && VG.inMeleeForm());
    };

    // Throws `target` back from `subject`. Silent and harmless when either of
    // them is not on the map, or when the shot came from anything else.
    MBM.applyRecoilPush = function (subject, target) {
        if (!MBM.isActive()) return false;
        if (!target || !target.isEnemy || !target.isEnemy()) return false;
        if (!MBM.firesVectorGun(subject)) return false;
        const from = MBM.mapCharacterFor(subject);
        const to = MBM.mapCharacterFor(target);
        if (!from || !to || from === to || to._erased) return false;
        const dx = deltaX(to.x, from.x);
        const dy = deltaY(to.y, from.y);
        const { horz, vert } = Grid.stepDirs(dx, dy);
        if (!horz && !vert) return false;
        const tiles = MBM.recoilPushTiles(MBM.distance(from.x, from.y, to.x, to.y));
        MBM._knockbacks = MBM._knockbacks.filter(k => k.character !== to);
        MBM._knockbacks.push({
            character: to,
            horz,
            vert,
            left: tiles,
            // Thrown backwards: the body keeps looking at whoever shot it.
            facing: Grid.faceDir(-dx, -dy),
            speed: to.moveSpeed ? to.moveSpeed() : VG_PUSH_SPEED
        });
        return true;
    };

    MBM._updateKnockback = function () {
        if (!MBM._knockbacks.length) return;
        MBM._knockbacks = MBM._knockbacks.filter(k => {
            const c = k.character;
            const stop = () => {
                if (c && c.setMoveSpeed) c.setMoveSpeed(k.speed);
                if (c && k.facing && c.setDirection) c.setDirection(k.facing);
                return false;
            };
            if (!c || c._erased) return false;
            if (c.isMoving && c.isMoving()) return true;
            if (k.left <= 0) return stop();
            k.left--;
            if (c.setMoveSpeed) c.setMoveSpeed(VG_PUSH_SPEED);
            const nx = k.horz ? $gameMap.roundXWithDirection(c.x, k.horz) : c.x;
            const ny = k.vert ? $gameMap.roundYWithDirection(c.y, k.vert) : c.y;
            if (!MBM._stepCharacter(c, nx, ny)) return stop();
            if (k.facing && c.setDirection) c.setDirection(k.facing);
            return true;
        });
    };

    MBM._confirmMove = function () {
        const st = MBM._cursorState;
        if (!st || st.mode !== "move") return;
        const destKey = keyOf(st.x, st.y);
        if (!st.reachable.has(destKey) || st.reachable.get(destKey) === 0) {
            SoundManager.playBuzzer();
            return;
        }
        const path = MBM._pathFrom(st.prev, st.character, destKey);
        MBM._closeCursor();
        const actor = BattleManager.actor();
        if (actor) MBM._moveUsedThisTurn[actor.actorId()] = true;
        SoundManager.playOk();
        MBM._activeWalk = {
            character: st.character,
            path,
            i: 0,
            onDone: () => {
                if (BattleManager.actor()) MBM._openCommandWindow(BattleManager.actor());
            }
        };
    };

    //=========================================================================
    // 23. CPU turn: act when in reach, otherwise close the distance
    //=========================================================================

    MBM.isAiControlled = function (battler) {
        if (!battler) return false;
        if (battler.isEnemy && battler.isEnemy()) return true;
        if (!battler.isActor || !battler.isActor()) return false;
        if (MBM.isAllyActor(battler)) return true;
        return MBM.isCpuParty() && battler !== $gameParty.leader();
    };

    MBM._updateAiTurn = function (subject) {
        const character = MBM.mapCharacterFor(subject);
        if (!character) return true;

        const state = MBM._aiTurn;
        if (state && state.subject === subject) {
            if (state.done) return true;
            if (MBM._activeWalk) return false;
            state.done = true;
            if (!MBM._aiActionReaches(subject)) subject.clearActions();
            return true;
        }

        MBM._aiTurn = { subject, done: false };
        if (MBM._aiActionReaches(subject)) {
            MBM._aiTurn.done = true;
            return true;
        }
        if (MBM._startAiApproach(subject, character)) return false;
        MBM._aiTurn.done = true;
        subject.clearActions();
        return true;
    };

    // Can the rolled action land from here? Also pins it onto a reachable
    // target, so a random pick never aims through a wall.
    MBM._aiActionReaches = function (subject) {
        const action = subject.currentAction();
        if (!action || !action.item()) return true;
        const forFriend = !action.isForOpponent() && action.isForFriend();
        if (!action.isForOpponent() && !forFriend) return true;
        if (forFriend && action.isForUser()) return true;

        const range = MBM.actionRange(action);
        const min = MBM.actionMinRange(action);
        const unit = forFriend ? subject.friendsUnit() : subject.opponentsUnit();
        const members = unit.members();
        const wantsDead = forFriend && action.isForDeadFriend();
        const reachable = members.filter(b =>
            b && (wantsDead ? b.isDead() : b.isAlive()) && MBM.canReach(subject, b, range, min));
        if (reachable.length === 0) return false;
        if (action.isForAll() || action.isForRandom()) return true;
        // Prefer a target it can flank: a blow from behind is the better blow.
        const scored = reachable.map(b => {
            const facing = MBM.facingOf(subject, b);
            const score = facing ? Facing.hitBonus(facing.relative) + (facing.pinned ? PINNED_HIT : 0) : 0;
            return { b, score: score + Math.random() * 0.05 };
        });
        scored.sort((a, b) => b.score - a.score);
        action.setTarget(members.indexOf(scored[0].b));
        return true;
    };

    // Queue the approach walk: a square it can act from (range AND line),
    // preferring the target's flank or rear; failing that, any square closer.
    MBM._startAiApproach = function (subject, character) {
        const action = subject.currentAction();
        const forFriend = !!(action && action.item() && action.isForFriend() && !action.isForOpponent());
        const unit = forFriend ? subject.friendsUnit() : subject.opponentsUnit();
        const targets = unit.members()
            .filter(b => b && b !== subject && (forFriend ? true : b.isAlive()))
            .map(b => ({ b, c: MBM.mapCharacterFor(b) }))
            .filter(t => t.c);
        if (targets.length === 0) return false;

        const reach = (action && action.item()) ? MBM.actionRange(action) : MBM.attackRange(subject);
        const minReach = (action && action.item()) ? MBM.actionMinRange(action) : MBM.attackMinRange(subject);

        const nearest = (x, y) =>
            targets.reduce((best, t) => Math.min(best, MBM.distance(x, y, t.c.x, t.c.y)), Infinity);
        const blockers = MBM._sightBlockers(character, null);
        // The best facing bonus obtainable on any target from (x, y), or -1
        // when no target is in reach from there.
        const strikeScore = (x, y) => {
            let best = -1;
            for (const t of targets) {
                const d = MBM.distance(x, y, t.c.x, t.c.y);
                if (d > reach || d < minReach) continue;
                if (!MBM.hasLineOfSight(x, y, t.c.x, t.c.y, blockers)) continue;
                const rel = forFriend ? "front"
                    : Facing.relative(t.c.x + deltaX(x, t.c.x), t.c.y + deltaY(y, t.c.y), t.c.x, t.c.y, t.c.direction());
                best = Math.max(best, Facing.hitBonus(rel));
            }
            return best;
        };

        const { dist, prev } = MBM._reachableFor(subject, character);

        let bestKey = null;
        let bestScore = -1;
        let bestNear = nearest(character.x, character.y);
        let bestSteps = Infinity;
        for (const [key, steps] of dist) {
            if (steps === 0) continue;
            const [x, y] = key.split(",").map(Number);
            const score = strikeScore(x, y);
            if (score >= 0) {
                if (score > bestScore || (score === bestScore && steps < bestSteps)) {
                    bestKey = key; bestScore = score; bestSteps = steps;
                }
                continue;
            }
            if (bestScore >= 0) continue;
            const near = nearest(x, y);
            if (near < bestNear || (near === bestNear && bestKey && steps < bestSteps)) {
                bestKey = key; bestNear = near; bestSteps = steps;
            }
        }
        if (!bestKey) return false;

        const path = MBM._pathFrom(prev, character, bestKey);
        if (path.length === 0) return false;
        MBM._activeWalk = { character, path, i: 0, onDone: null };
        return true;
    };

    //=========================================================================
    // 24. Reinforcements: roaming monsters that wander into the fight
    //=========================================================================

    MBM._registerEnemyEvent = function (event, persistentId, troopId, battlers) {
        if (!event || !battlers || battlers.length === 0) return;
        MBM._snapEvent(event);
        event._mbmCombatant = true;
        event._mbmSteps = 0;
        // Every member of the troop stands on that one event: mapping only
        // the first left the rest of a group with no position at all, which
        // made them unreachable, undrawable and hittable from across the map.
        for (const battler of battlers) {
            if (battler) MBM._enemyEventFor.set(battler, event);
        }
        MBM._combatEnemyEvents.push({
            event,
            eventId: event.eventId(),
            persistentId,
            troopId,
            battlers: battlers.slice()
        });
    };

    MBM.joinEnemyEvent = function (event) {
        if (!MBM.isActive() || !event || event._erased) return false;
        if (!isEnemyEvent(event) || MBM.isCombatantEvent(event)) return false;
        if (BattleManager._phase === "battleEnd" || BattleManager._phase === "") return false;
        const troopId = event._fixedTroopId;
        const troop = troopId > 0 ? $dataTroops[troopId] : null;
        if (!troop || !troop.members || troop.members.length === 0) return false;

        const BSE = window.BattleSystemEnhanced;
        if (BSE && BSE.Helpers && BSE.Helpers.isTroopMuchHigherLevel) {
            const partyLevel = BSE.Helpers.getPartyReferenceLevel ? BSE.Helpers.getPartyReferenceLevel() : 1;
            if (BSE.Helpers.isTroopMuchHigherLevel(troopId, partyLevel)) return false;
            if (MBM._combatEnemyEvents.some(entry => BSE.Helpers.isTroopMuchHigherLevel(entry.troopId, partyLevel))) {
                return false;
            }
        }

        const persistentId = `${$gameMap.mapId()}_${event.eventId()}`;
        // The brawl only grows as far as the party can answer it.
        if (BSE && BSE.Helpers && BSE.Helpers.maxEnemiesForParty) {
            const standing = $gameTroop.members().filter(e => e && e.isAlive()).length;
            const arriving = troop.members.filter(m => $dataEnemies[m.enemyId]).length;
            if (standing + arriving > BSE.Helpers.maxEnemiesForParty()) return false;
        }

        const stored = MBM._persistentHpFor(persistentId);
        const added = [];
        troop.members.forEach((member, index) => {
            if (!$dataEnemies[member.enemyId]) return;
            const enemy = new Game_Enemy(member.enemyId, member.x, member.y);
            if (member.hidden) enemy.hide();
            $gameTroop._enemies.push(enemy);
            enemy.onBattleStart();
            if (stored && stored[index] !== undefined) enemy.setHp(stored[index]);
            added.push(enemy);
        });
        if (added.length === 0) return false;
        $gameTroop.makeUniqueNames();

        MBM._registerEnemyEvent(event, persistentId, troopId, added);
        MBM._refreshHpBars();
        MBM._setSpriteGrey(event, false);
        MBM._announceJoin(added[0].name(), false);
        return true;
    };

    MBM._persistentHpFor = function (persistentId) {
        const BSE = window.BattleSystemEnhanced;
        const record = BSE && BSE.State.persistentEnemyData[persistentId];
        return record ? record.enemyHp : null;
    };

    MBM.checkEnemyEventJoin = function (event, combatants) {
        if (!MBM.isActive() || !event || MBM.isCombatantEvent(event)) return;
        const list = combatants || MBM._frameCombatants();
        if (MBM._nearestCombatantDistance(event.x, event.y, list) <= JOIN_RANGE) {
            MBM.joinEnemyEvent(event);
        }
    };

    // A monster standing out of the fight is drawn in black and white, so the
    // field reads at a glance: colour means it is taking turns against you. It
    // gets its colours back the moment it joins.
    // The sprite lookup is MBM._spriteFor, which asks the sprite itself
    // (checkCharacter) rather than reading a private field off it.
    MBM._spriteForCharacter = function (character) {
        return MBM._spriteFor(character);
    };

    MBM._setSpriteGrey = function (character, grey) {
        const sprite = MBM._spriteForCharacter(character);
        if (!sprite) return;
        if (grey) {
            // Another system reassigning sprite.filters would drop ours without
            // a word, so what counts as "already grey" is the filter still being
            // ON the sprite, not merely having been made once.
            const current = sprite.filters || [];
            if (sprite._mbmGreyFilter && current.includes(sprite._mbmGreyFilter)) return;
            if (typeof PIXI === "undefined" || !PIXI.filters || !PIXI.filters.ColorMatrixFilter) return;
            const filter = sprite._mbmGreyFilter || new PIXI.filters.ColorMatrixFilter();
            if (!sprite._mbmGreyFilter) filter.desaturate();
            sprite._mbmGreyFilter = filter;
            sprite.filters = current.concat(filter);
        } else if (sprite._mbmGreyFilter) {
            const rest = (sprite.filters || []).filter(f => f !== sprite._mbmGreyFilter);
            sprite.filters = rest.length ? rest : null;
            sprite._mbmGreyFilter = null;
        }
    };

    MBM._updateBystanderTints = function () {
        const active = MBM.isActive();
        for (const event of $gameMap.events()) {
            if (!event || event._erased || !isEnemyEvent(event)) continue;
            MBM._setSpriteGrey(event, active && !MBM.isCombatantEvent(event));
        }
    };

    MBM._clearBystanderTints = function () {
        for (const event of $gameMap.events()) {
            if (!event) continue;
            MBM._setSpriteGrey(event, false);
        }
    };

    MBM._scanEnemyEventJoins = function () {
        if (!MBM.isActive()) return;
        const combatants = MBM._battlerCharacters();
        for (const event of $gameMap.events()) {
            if (!event || event._erased) continue;
            if (!isEnemyEvent(event) || MBM.isCombatantEvent(event)) continue;
            if (!event._fixedTroopId || event._fixedTroopId <= 0) continue;
            MBM.checkEnemyEventJoin(event, combatants);
        }
    };

    // Every roaming monster that takes a step asks how near the fight it is,
    // and the answer is the same for all of them within one frame.
    MBM._frameCombatants = function () {
        if (MBM._frameCombatantsAt !== Graphics.frameCount) {
            MBM._frameCombatantsAt = Graphics.frameCount;
            MBM._frameCombatantsList = MBM._battlerCharacters();
        }
        return MBM._frameCombatantsList;
    };

    MBM._releaseCombatEvents = function () {
        for (const entry of MBM._combatEnemyEvents) {
            if (entry.event) entry.event._mbmCombatant = false;
        }
        for (const ally of MBM._allies) {
            if (ally.event) ally.event._mbmCombatant = false;
        }
    };

    // BattleSystemEnhancedState.endBattle settles the ONE event the fight
    // opened on; every monster that joined afterwards is settled here by the
    // same rules.
    MBM._settleJoinedEnemies = function () {
        const BSE = window.BattleSystemEnhanced;
        if (!BSE) return;
        const mapId = $gameMap.mapId();
        const pData = BSE.State.persistentEnemyData;
        for (const entry of MBM._combatEnemyEvents) {
            if (!entry.event || entry.eventId === MBM._eventId) continue;
            if (entry.event._erased) continue;
            const wiped = entry.battlers.every(b => !b || b.isDead() || !b.isAppeared());
            if (wiped) {
                if (entry.battlers.some(b => b && b.isDead())) MBM._recordCorpse(entry, mapId);
                delete pData[entry.persistentId];
                $gameMap.eraseEvent(entry.eventId);
                if (mapId === 636) {
                    if (!$gameSystem._procGenDefeatedEnemies) $gameSystem._procGenDefeatedEnemies = [];
                    if (!$gameSystem._procGenDefeatedEnemies.includes(entry.eventId)) {
                        $gameSystem._procGenDefeatedEnemies.push(entry.eventId);
                    }
                }
            } else {
                const record = pData[entry.persistentId] ||
                    (pData[entry.persistentId] = { troopId: entry.troopId, enemyHp: {} });
                record.troopId = entry.troopId;
                record.enemyHp = record.enemyHp || {};
                entry.battlers.forEach((b, i) => { if (b) record.enemyHp[i] = b.hp; });
                entry.event.lockMovement(160);
            }
        }
    };

    MBM._recordCorpse = function (entry, mapId) {
        const BSE = window.BattleSystemEnhanced;
        const event = entry.event;
        if (!BSE || !event || !event._characterName) return;
        const troop = $dataTroops[entry.troopId];
        const enemyId = (troop && troop.members[0]) ? troop.members[0].enemyId : 0;
        const colorFn = BSE.Helpers.getCorpseBloodColor;
        const corpse = {
            mapId,
            x: event.x,
            y: event.y,
            spriteName: event._characterName,
            spriteIndex: event._characterIndex,
            hue: event._characterHue || 0,
            bloodColor: colorFn ? colorFn($dataEnemies[enemyId]) : [220, 20, 20],
            enemyId
        };
        // The map scene is never rebuilt around a map battle, so the body has to
        // be raised on the spot instead of waiting for the next spriteset.
        if (BSE.Functions && BSE.Functions.dropMapCorpse) BSE.Functions.dropMapCorpse(corpse);
        else BSE.State.mapCorpses.push(corpse);
    };

    //=========================================================================
    // 25. Volunteers: townspeople who take the party's side
    //=========================================================================

    function empathizeHelpers() {
        return (window.NPCEmpathize && window.NPCEmpathize._helpers) || null;
    }

    MBM._isPersonEvent = function (event) {
        const id = event.eventId();
        const controllers = ($gameSystem && $gameSystem.npcControllers) || [];
        if (controllers.some(c => c && c.eventId === id)) return true;
        const data = event.event();
        return !!(data && /NPC-\d+/.test(data.note || ""));
    };

    MBM._npcProfileFor = function (event) {
        const registry = window.NPCSocietyRegistry;
        if (!registry || !event) return null;
        const name = (event.event() && event.event().name || "").trim();
        if (!name || name === "Enemy") return null; // i18n-ignore: event name
        let profile = registry.getProfile(name);
        if (!profile && MBM._isPersonEvent(event) && registry.ensureProfile) {
            const helpers = empathizeHelpers();
            const classId = helpers && helpers._extractClassId ? helpers._extractClassId(event) : null;
            profile = registry.ensureProfile(name, classId);
        }
        return profile ? { name, profile } : null;
    };

    MBM._npcPartyStanding = function (profile) {
        const helpers = empathizeHelpers();
        if (helpers && helpers._computePartyPredisposition && helpers._medianScore) {
            return helpers._medianScore(helpers._computePartyPredisposition(profile));
        }
        return profile.playerOpinion || 0;
    };

    MBM._isBraveProfile = function (profile) {
        const traitIds = profile.traitIds || [];
        if (TIMID_TRAIT_IDS.some(id => traitIds.includes(id))) return false;
        if (BRAVE_TRAIT_IDS.some(id => traitIds.includes(id))) return true;
        const list = window._NPCSocietyDataLoader && window._NPCSocietyDataLoader.personalities;
        const persona = list && list[profile.personalityIndex];
        return !!persona && persona.name === BRAVE_PERSONALITY;
    };

    MBM._isTimidProfile = function (profile) {
        return TIMID_TRAIT_IDS.some(id => (profile.traitIds || []).includes(id));
    };

    MBM._considerNpcAllies = function () {
        if (!MBM.isActive()) return;
        if (MBM._allies.length >= ALLY_ACTOR_IDS.length) return;
        const combatants = MBM._battlerCharacters();
        for (const event of $gameMap.events()) {
            if (!event || event._erased || isEnemyEvent(event)) continue;
            if (MBM.isRemotePlayerEvent(event)) continue;
            if (MBM.isCombatantEvent(event) || event === MBM.p2Event()) continue;
            const id = event.eventId();
            if (MBM._considered.has(id)) continue;
            if (MBM._nearestCombatantDistance(event.x, event.y, combatants) > NPC_JOIN_RANGE) continue;
            MBM._considered.add(id);
            const found = MBM._npcProfileFor(event);
            if (!found) continue;
            if (MBM._isTimidProfile(found.profile)) continue;
            const brave = MBM._isBraveProfile(found.profile);
            if (!brave && MBM._npcPartyStanding(found.profile) < NPC_JOIN_OPINION) continue;
            if (!MBM.recruitNpcAlly(event, found.name, found.profile)) continue;
            if (MBM._allies.length >= ALLY_ACTOR_IDS.length) return;
        }
    };

    MBM.recruitNpcAlly = function (event, npcName, profile) {
        const used = MBM._allies.map(a => a.actorId);
        const actorId = ALLY_ACTOR_IDS.find(id => !used.includes(id));
        if (actorId == null) return false;
        const actor = $gameActors.actor(actorId);
        if (!actor) return false;

        actor.setup(actorId);
        actor.setName(npcName);
        if (profile.assignedClassId && $dataClasses[profile.assignedClassId]) {
            actor.changeClass(profile.assignedClassId, true);
        }
        actor.changeLevel(Math.max(1, profile.level || 1), false);
        actor._skills = [];
        for (const skillId of (profile.skillIds || [])) {
            if ($dataSkills[skillId]) actor.learnSkill(skillId);
        }
        actor.setCharacterImage(event.characterName(), event.characterIndex());
        actor._faceName = "";
        actor._faceIndex = 0;

        const record = {
            actorId,
            actor,
            eventId: event.eventId(),
            event,
            npcName,
            profile,
            items: (profile.itemIds || []).filter(id => $dataItems[id])
        };
        MBM._allies.push(record);
        MBM._allyListDirty = true;
        MBM._battleMembersCache = null;

        event._mbmCombatant = true;
        event._mbmSteps = 0;
        MBM._snapEvent(event);
        if (window.NPCSystem && window.NPCSystem.clearTacticalSteps) {
            window.NPCSystem.clearTacticalSteps();
        }

        actor.recoverAll();
        actor.onBattleStart();
        actor.clearActions();
        MBM._refreshHpBars();
        MBM._announceJoin(npcName, true);
        return true;
    };

    MBM._dismissAllies = function () {
        for (const ally of MBM._allies) {
            if (ally.event) {
                ally.event._mbmCombatant = false;
                ally.event._mbmSteps = 0;
            }
            if (ally.actor) {
                ally.actor.clearActions();
                ally.actor.setup(ally.actorId);
            }
        }
        MBM._allies = [];
        MBM._allyListDirty = true;
        MBM._battleMembersCache = null;
    };

    MBM._announceJoin = function (name, friendly) {
        if (!name) return;
        const text = friendly
            ? T('Battle.join.friendly', { name: name })
            : T('Battle.join.hostile', { name: name });
        if (window.ParchmentToast) {
            window.ParchmentToast.show(text, { severity: friendly ? "info" : "warning", duration: 150 });
        } else if (MBM._logWindow) {
            MBM._logWindow.addText(text);
        }
    };

    MBM._makeAllyItemAction = function (actor) {
        const record = MBM.allyRecordFor(actor);
        if (!record || record.items.length === 0) return false;
        const hurt = $gameParty.battleMembers()
            .filter(b => b && b.isAlive() && b.hpRate() < 0.5)
            .sort((a, b) => a.hpRate() - b.hpRate())[0];
        if (!hurt) return false;
        for (let i = 0; i < record.items.length; i++) {
            const item = $dataItems[record.items[i]];
            if (!item || !actor.canUse(item)) continue;
            const action = new Game_Action(actor);
            action.setItem(item.id);
            if (!action.isForFriend()) continue;
            const heals = action.isHpRecover() ||
                (item.effects || []).some(e => e && e.code === Game_Action.EFFECT_RECOVER_HP);
            if (!heals) continue;
            if (!MBM.canReach(actor, hurt, MBM.actionRange(action), MBM.actionMinRange(action))) continue;
            action.setTarget($gameParty.battleMembers().indexOf(hurt));
            actor.setAction(0, action);
            record.items.splice(i, 1);
            return true;
        }
        return false;
    };

    const _Game_Battler_consumeItem = Game_Battler.prototype.consumeItem;
    Game_Battler.prototype.consumeItem = function (item) {
        if (MBM.isActive() && MBM.isAllyActor(this)) return;
        _Game_Battler_consumeItem.call(this, item);
    };

    const _Game_BattlerBase_canUse = Game_BattlerBase.prototype.canUse;
    Game_BattlerBase.prototype.canUse = function (item) {
        if (MBM.isActive() && item && DataManager.isItem(item) && MBM.isAllyActor(this)) {
            const record = MBM.allyRecordFor(this);
            if (record && record.items.includes(item.id)) {
                return this.meetsUsableItemConditions(item);
            }
        }
        return _Game_BattlerBase_canUse.call(this, item);
    };

    const _Game_Actor_makeActions_MBM = Game_Actor.prototype.makeActions;
    Game_Actor.prototype.makeActions = function () {
        _Game_Actor_makeActions_MBM.call(this);
        if (MBM.isActive() && MBM.isAllyActor(this) && this.numActions() > 0) {
            MBM._makeAllyItemAction(this);
        }
    };

    //=========================================================================
    // 26. Round structure, the world step and the pet
    //=========================================================================

    if (typeof BattleManager.makeITBSRound === "function") {
        const _BattleManager_makeITBSRound = BattleManager.makeITBSRound;
        BattleManager.makeITBSRound = function () {
            if (!MBM.isActive()) return _BattleManager_makeITBSRound.call(this);
            if (MBM._roundStarted) MBM.runWorldStep();
            MBM._roundStarted = true;
            const round = MBM.withoutAllies(() => _BattleManager_makeITBSRound.call(this));
            const allies = MBM.allyBattlers()
                .filter(a => a && a.isAlive())
                .sort((a, b) => (b._battleAgi || 0) - (a._battleAgi || 0));
            return round.concat(allies);
        };
    }

    MBM.runWorldStep = function () {
        if (!MBM.isActive()) return;
        MBM._grantWorldSteps(1);
        MBM._stepPet();
        MBM._scanEnemyEventJoins();
        MBM._considerNpcAllies();
    };

    MBM._petFollower = function () {
        if (typeof Game_PetFollower === "undefined") return null;
        const followers = $gamePlayer && $gamePlayer.followers();
        const data = followers && followers._data;
        if (!data) return null;
        const pet = data.find(f => f instanceof Game_PetFollower);
        return pet && pet.isVisible() ? pet : null;
    };

    MBM._preparePet = function () {
        const pet = MBM._petFollower();
        MBM._petThrough = null;
        if (!pet) return;
        MBM._petThrough = { pet, through: pet.isThrough() };
        pet.setThrough(false);
    };

    MBM._restorePet = function () {
        if (MBM._petThrough && MBM._petThrough.pet) {
            MBM._petThrough.pet.setThrough(MBM._petThrough.through);
        }
        MBM._petThrough = null;
    };

    MBM._stepPet = function () {
        const pet = MBM._petFollower();
        if (!pet || pet.isMoving()) return;
        const occupied = MBM._occupiedTiles(null);
        const dirs = DIR_LIST.filter(d => {
            const nx = $gameMap.roundXWithDirection(pet.x, d);
            const ny = $gameMap.roundYWithDirection(pet.y, d);
            if (occupied.has(keyOf(nx, ny))) return false;
            return pet.canPass(pet.x, pet.y, d);
        });
        if (dirs.length === 0) return;
        pet.moveStraight(dirs[Math.floor(Math.random() * dirs.length)]);
    };

    //=========================================================================
    // 27. Targeting
    //=========================================================================

    MBM._candidateTargets = function (action) {
        let pool;
        if (action.isForOpponent()) {
            pool = $gameTroop.members();
        } else if (action.isForFriend()) {
            pool = $gameParty.battleMembers();
        } else {
            pool = [];
        }
        const wantsDead = action.isForDeadFriend();
        return pool.filter(b => b && (wantsDead ? b.isDead() : b.isAlive()));
    };

    // The nearest of a list of battlers to a tile, which is what a swing thrown
    // without naming anybody lands on.
    MBM._nearestBattler = function (from, list) {
        if (!from) return list[0];
        let best = null;
        let bestD = Infinity;
        for (const b of list) {
            const c = MBM.mapCharacterFor(b);
            // No square means nowhere to measure to, never zero tiles away:
            // reading it as zero made a bodiless battler beat every real one.
            const d = c ? MBM.distance(from.x, from.y, c.x, c.y) : Infinity;
            if (d >= bestD) continue;
            bestD = d;
            best = b;
        }
        return best || list[0];
    };

    MBM._startTargeting = function (action) {
        const subject = action.subject();
        const subjectChar = MBM.mapCharacterFor(subject);
        const range = MBM.actionRange(action);
        const min = MBM.actionMinRange(action);
        const candidates = MBM._candidateTargets(action)
            .filter(b => MBM.canReach(subject, b, range, min));

        if (candidates.length === 0) {
            SoundManager.playBuzzer();
            if (BattleManager.actor()) MBM._openCommandWindow(BattleManager.actor());
            return;
        }
        if (candidates.length === 1) {
            MBM._confirmTarget(action, candidates[0]);
            return;
        }

        // A plain swing is not a decision: it lands on whoever is closest, and
        // where it lands ON that body is what the Aim command is for.
        if (action.isAttack && action.isAttack()) {
            MBM._confirmTarget(action, MBM._nearestBattler(subjectChar, candidates));
            return;
        }

        // Everything else goes to the named monster when one is named, so an aim
        // is a standing order and not something to re-pick every round. Only when
        // nothing is named does the player pick.
        const aimed = MBM._aimedTarget(subject);
        if (aimed && candidates.includes(aimed)) {
            MBM._confirmTarget(action, aimed);
            return;
        }

        if (subjectChar) MBM._paintTiles(MBM._coveredTiles(subjectChar, range, min), COLOR_RANGE);

        // Nearest first, so the default pick is the one in your face.
        if (subjectChar) {
            candidates.sort((a, b) => {
                const ca = MBM.mapCharacterFor(a), cb = MBM.mapCharacterFor(b);
                const da = ca ? MBM.distance(subjectChar.x, subjectChar.y, ca.x, ca.y) : Infinity;
                const db = cb ? MBM.distance(subjectChar.x, subjectChar.y, cb.x, cb.y) : Infinity;
                return da - db;
            });
        }

        MBM._cursorState = {
            mode: "target",
            action,
            list: candidates,
            index: 0,
            cursorSprite: null
        };
        MBM._refreshTargetCursor();
    };

    MBM._refreshTargetCursor = function () {
        const st = MBM._cursorState;
        if (!st || (st.mode !== "target" && st.mode !== "aim")) return;
        const spriteset = currentSpriteset();
        if (!spriteset || !spriteset._tilemap) return;
        if (st.cursorSprite) {
            spriteset._tilemap.removeChild(st.cursorSprite);
            if (st.cursorSprite.destroy) st.cursorSprite.destroy();
            st.cursorSprite = null;
        }
        const entry = st.list[st.index];
        // An aim list holds the monsters' own events, a target list holds battlers.
        const ch = (entry instanceof Game_Event) ? entry : MBM.mapCharacterFor(entry);
        if (ch) {
            st.cursorSprite = new Sprite_MBMTile(ch.x, ch.y, COLOR_CURSOR);
            spriteset._tilemap.addChild(st.cursorSprite);
        }
    };

    // The monster this battler has an aim on, or null.
    MBM._aimedTarget = function (subject) {
        if (!window.Aiming || !window.Aiming.planFor) return null;
        if (!subject || !subject.isActor || !subject.isActor()) return null;
        const plan = window.Aiming.planFor(subject);
        return plan ? plan.enemy : null;
    };

    MBM._confirmTarget = function (action, battler) {
        const list = action.isForOpponent() ? $gameTroop.members() : $gameParty.battleMembers();
        action.setTarget(list.indexOf(battler));
        MBM._closeCursor();
        BattleManager.selectNextCommand();
    };

    //=========================================================================
    // 27b. Naming a body, and taking hold of one (Health/Health_Monsters.js)
    //
    // Aim and Wrestle are the same two menus the lined-up battle uses: they are
    // authored on Scene_Battle and draw themselves in `_actorCommandWindow`, so
    // Scene_Map answers that with the fight's own command window rather than
    // keeping a second copy of either menu here. What IS different on the map is
    // the two things below: who can be grappled (whoever is standing next to
    // you) and how a body is picked to aim at (the tile cursor, over every
    // monster in sight, in the fight or not).
    //=========================================================================

    // Both menus are authored on Scene_Battle (Health/Health_Monsters.js, and
    // wrapped again by BattleSystemEnhanchedCommands.js). Scene_Map FORWARDS to
    // whatever those prototypes hold at call time rather than copying them, so a
    // plugin that wraps one later is still the version the map fight runs.
    for (const name of ["openWrestleMenu", "closeWrestleMenu", "_selectWrestleRow",
                        "onWrestleRow", "onWrestleCancel", "updateWrestleHelp",
                        "createWrestleHelpWindow", "closeWrestleHelpWindow",
                        "openAimMenu", "closeAimMenu", "_leaveAimMenu",
                        "onAimRow", "onAimCancel"]) {
        Scene_Map.prototype[name] = function (...args) {
            const fn = Scene_Battle.prototype[name];
            return fn ? fn.apply(this, args) : false;
        };
    }

    Object.defineProperty(Scene_Map.prototype, "_actorCommandWindow", {
        configurable: true,
        get() { return MBM.isActive() ? MBM._cmdWindow : null; },
        set() { /* the fight owns that window; nothing else may hand it one */ }
    });

    // The monster a grapple can reach: the nearest one standing within arm's
    // length of the body doing the grappling.
    MBM.grappleTargetFor = function (actor) {
        if (!MBM.isActive() || !actor) return null;
        const from = MBM.mapCharacterFor(actor);
        if (!from) return null;
        let best = null;
        let bestD = Infinity;
        for (const enemy of $gameTroop.aliveMembers()) {
            const c = MBM.mapCharacterFor(enemy);
            if (!c) continue;
            const d = MBM.distance(from.x, from.y, c.x, c.y);
            if (d > GRAPPLE_RANGE || d >= bestD) continue;
            bestD = d;
            best = enemy;
        }
        return best;
    };

    // Every monster an aim can be taken on: anything drawn on screen with a
    // troop behind it, whether or not it is already in the fight.
    MBM._aimableEvents = function () {
        const out = [];
        for (const event of $gameMap.events()) {
            if (!event || event._erased || !isEnemyEvent(event)) continue;
            if (!MBM._onScreen(event)) continue;
            if (!MBM.isCombatantEvent(event) && !(event._fixedTroopId > 0)) continue;
            const battler = MBM.battlerFor(event);
            if (battler && !battler.isAlive()) continue;
            out.push(event);
        }
        const from = MBM.mapCharacterFor(BattleManager.actor());
        if (from) {
            out.sort((a, b) => MBM.distance(from.x, from.y, a.x, a.y) -
                               MBM.distance(from.x, from.y, b.x, b.y));
        }
        return out;
    };

    MBM.startAimSelection = function () {
        if (!MBM.isActive()) return false;
        const list = MBM._aimableEvents();
        if (list.length === 0) return false;
        MBM._closeCommandWindow();
        MBM._cursorState = { mode: "aim", list, index: 0, cursorSprite: null };
        MBM._refreshTargetCursor();
        return true;
    };

    // Naming a bystander is picking a fight with it: it is dragged in first, so
    // the aim is always taken on something the round can actually answer.
    MBM._confirmAim = function (event) {
        MBM._closeCursor();
        const actor = BattleManager.actor();
        if (!MBM.isCombatantEvent(event)) MBM.joinEnemyEvent(event);
        const enemy = MBM.battlerFor(event);
        if (actor) MBM._openCommandWindow(actor);
        if (!enemy || !enemy.isAlive() || !actor) {
            SoundManager.playBuzzer();
            return;
        }
        const scene = SceneManager._scene;
        if (!scene.openAimMenu || !scene.openAimMenu(enemy)) SoundManager.playBuzzer();
    };

    // Where a map hold leaves the body it had hold of. A shove is one square
    // back, a throw is three down the same line, and a suplex takes the monster
    // over the wrestler and into the ground on the far side of them. The body
    // travels as far as the ground allows and stops where it stops.
    MBM.displaceGrappled = function (subject, target, hold) {
        if (!MBM.isActive() || !hold) return false;
        const from = MBM.mapCharacterFor(subject);
        const body = MBM.mapCharacterFor(target);
        if (!from || !body) return false;
        let dx = Math.sign(deltaX(body.x, from.x));
        let dy = Math.sign(deltaY(body.y, from.y));
        if (!dx && !dy) return false;
        if (hold.suplex) { dx = -dx; dy = -dy; }
        const steps = hold.suplex ? 1 : Math.max(1, hold.push || 1);
        // A suplex starts from the wrestler's own tile: the monster is lifted
        // clear of where it stood and driven down behind them.
        let x = hold.suplex ? from.x : body.x;
        let y = hold.suplex ? from.y : body.y;
        for (let i = 0; i < steps; i++) {
            const { horz, vert } = Grid.stepDirs(dx, dy);
            if (!MBM._canStep(body, x, y, horz, vert)) break;
            x = horz ? $gameMap.roundXWithDirection(x, horz) : x;
            y = vert ? $gameMap.roundYWithDirection(y, vert) : y;
        }
        if (x === body.x && y === body.y) return false;
        body.jump(deltaX(x, body.x), deltaY(y, body.y));
        MBM._enterWaterFor(body, x, y);
        MBM._syncSwimState(body);
        return true;
    };

    //=========================================================================
    // 28. Cursor input (move destination / target cycling)
    //=========================================================================

    MBM._closeCursor = function () {
        MBM._clearTiles();
        const sprite = MBM._cursorState && MBM._cursorState.cursorSprite;
        if (sprite) {
            if (sprite.parent) sprite.parent.removeChild(sprite);
            if (sprite.destroy) sprite.destroy();
        }
        MBM._cursorState = null;
    };

    const CURSOR_KEYS = { down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] };

    MBM._updateCursorInput = function () {
        const st = MBM._cursorState;
        if (!st) return;

        if (MBM.inputTriggered("cancel")) {
            MBM.consumeP2Input();
            SoundManager.playCancel();
            MBM._closeCursor();
            if (BattleManager.actor()) MBM._openCommandWindow(BattleManager.actor());
            return;
        }
        if (MBM.inputTriggered("ok")) {
            MBM.consumeP2Input();
            if (st.mode === "move") MBM._confirmMove();
            else if (st.mode === "throw") MBM._confirmThrow();
            else if (st.mode === "aim") MBM._confirmAim(st.list[st.index]);
            else MBM._confirmTarget(st.action, st.list[st.index]);
            return;
        }

        if (st.mode === "move" || st.mode === "throw") {
            for (const key of Object.keys(CURSOR_KEYS)) {
                if (!MBM.inputRepeated(key)) continue;
                const [dx, dy] = CURSOR_KEYS[key];
                const nx = $gameMap.roundX(st.x + dx);
                const ny = $gameMap.roundY(st.y + dy);
                const inRange = st.mode === "throw"
                    ? st.squares.has(keyOf(nx, ny))
                    : st.reachable.has(keyOf(nx, ny));
                if (inRange) {
                    st.x = nx;
                    st.y = ny;
                    if (st.cursorSprite) {
                        st.cursorSprite._tx = nx;
                        st.cursorSprite._ty = ny;
                    }
                    SoundManager.playCursor();
                    MBM._repaintPath();
                }
                MBM.consumeP2Input();
                break;
            }
        } else if (st.mode === "target" || st.mode === "aim") {
            if (MBM.inputTriggered("right") || MBM.inputTriggered("down")) {
                st.index = (st.index + 1) % st.list.length;
                MBM.consumeP2Input();
                SoundManager.playCursor();
                MBM._refreshTargetCursor();
            } else if (MBM.inputTriggered("left") || MBM.inputTriggered("up")) {
                st.index = (st.index - 1 + st.list.length) % st.list.length;
                MBM.consumeP2Input();
                SoundManager.playCursor();
                MBM._refreshTargetCursor();
            }
        }
    };

    //=========================================================================
    // 29. Monster bars
    //=========================================================================

    MBM._rosterKey = function () {
        const party = $gameParty.battleMembers().map(a => a ? a.actorId() : 0);
        const troop = $gameTroop.members()
            .map((e, i) => (e && e.isAlive() ? i : -1))
            .filter(i => i >= 0);
        return party.join(",") + "|" + troop.join(",");
    };

    MBM._refreshHpBars = function () {
        if (!MBM.isActive()) return;
        const key = MBM._rosterKey();
        if (key === MBM._hpBarKey && MBM._hpBars.length > 0) return;
        MBM._hpBarKey = key;
        MBM._createHpBars();
    };

    MBM._createHpBars = function () {
        MBM._destroyHpBars();
        const scene = SceneManager._scene;
        if (!window.Sprite_BattleBar || !scene) return;
        const enemyW = 260, enemyStep = 70, enemyTop = 40;
        const maxRows = Math.max(1, Math.floor((Graphics.height - enemyTop) / enemyStep));
        let row = 0;
        $gameTroop.members().forEach(enemy => {
            if (!enemy.isAlive() || row >= maxRows) return;
            const sprite = new window.Sprite_BattleBar(enemy, enemyW);
            sprite.x = Graphics.width - enemyW - 40;
            sprite.y = enemyTop + row * enemyStep;
            scene.addChild(sprite);
            MBM._hpBars.push(sprite);
            row++;
        });
    };

    MBM._hpBarTick = 0;
    MBM._updateHpBars = function () {
        if (++MBM._hpBarTick < 10) return;
        MBM._hpBarTick = 0;
        MBM._refreshHpBars();
    };

    MBM._destroyHpBars = function () {
        for (const sprite of MBM._hpBars) {
            if (sprite.parent) sprite.parent.removeChild(sprite);
            if (sprite.destroy) sprite.destroy();
        }
        MBM._hpBars = [];
    };

    //=========================================================================
    // 29b. What ASCII mode draws (UI/ASCIIMode.js)
    //
    // The ASCII canvas covers every PIXI sprite, so the fight's own layer is
    // handed over as plain data: highlighted tiles, the cursor, the floating
    // numbers, the monster bars and the last log lines. ASCIIMode
    // paints them in its own font; nothing here draws.
    //=========================================================================

    MBM.asciiOverlay = function () {
        if (!MBM.isActive()) return null;
        const tiles = [];
        for (const list of [MBM._previewSprites, MBM._tileSprites, MBM._pathSprites]) {
            for (const s of list) tiles.push({ x: s._tx, y: s._ty, color: s._color });
        }
        const st = MBM._cursorState;
        let cursor = null;
        if (st && st.mode === "move") cursor = { x: st.x, y: st.y };
        if (st && (st.mode === "target" || st.mode === "aim")) {
            const entry = st.list[st.index];
            const ch = (entry instanceof Game_Event) ? entry : MBM.mapCharacterFor(entry);
            if (ch) cursor = { x: ch.x, y: ch.y };
        }
        const popups = MBM._popups.map(p => ({
            x: p._character ? p._character._realX : 0,
            y: p._character ? p._character._realY : 0,
            text: p._text, label: p._label, color: p._color,
            alpha: Math.min(1, p._duration / 20)
        }));
        const bars = $gameTroop.members()
            .filter(e => e && e.isAlive())
            .map(e => ({ name: e.name(), hp: e.hp, mhp: e.mhp }));
        const log = (MBM._logWindow && Array.isArray(MBM._logWindow._lines))
            ? MBM._logWindow._lines.slice(-4) : [];
        const bodies = [];
        for (const actor of $gameParty.battleMembers()) {
            const c = MBM.mapCharacterFor(actor);
            if (!c || c === $gamePlayer || c instanceof Game_Event) continue;
            if (typeof c.actor === "function" && !c.actor()) continue;
            bodies.push({ x: c._realX, y: c._realY, alive: actor.isAlive() });
        }
        return { tiles, cursor, popups, bars, log, bodies };
    };

    //=========================================================================
    // 30. Talk menu (NPC/EnemyTalkSystem.js) re-hosted on Scene_Map
    //
    // The handlers are authored on Scene_Battle and work off $gameTroop,
    // $gameMessage and the window alone; they are borrowed onto Scene_Map and
    // only open/close are reimplemented against the tactical menu.
    //=========================================================================

    const TALK_BORROWED = [
        "_buildTalkOptions", "_talkOk", "_talkEnemy", "_refuseUnrecruitable",
        "calculateTalkSuccessChance", "calculateTalkSuccess", "calculateJoinSuccessChance",
        "calculatePetSuccessChance", "calculatePetFollowerChance",
        "onTalkChat", "onTalkSurrender", "onTalkInsult", "onThrowStone", "onPet",
        "onTalkJoinParty", "onTalkJoinPet", "onTalkCancel",
        "getArchetypeSprite", "setActorSpriteByArchetype", "resolveRecruitSprite",
        "copyEnemySkillsToActor"
    ];

    MBM.isTalkSystemLoaded = function () {
        return typeof Scene_Battle.prototype.openTalkMenu === "function" &&
            typeof Scene_Battle.prototype._buildTalkOptions === "function";
    };

    function borrowTalkMethods() {
        if (!MBM.isTalkSystemLoaded()) return false;
        for (const name of TALK_BORROWED) {
            const fn = Scene_Battle.prototype[name];
            if (typeof fn === "function" && Scene_Map.prototype[name] !== fn) {
                Scene_Map.prototype[name] = fn;
            }
        }
        return true;
    }

    MBM.isTalkMenuOpen = function () {
        return !!(window.TalkMenu && window.TalkMenu.isMenuOpen(MBM._cmdWindow));
    };

    MBM.canUseTalkCommand = function () {
        if (!MBM.isActive()) return false;
        if (!MBM.isTalkSystemLoaded()) return false;
        return $gameTroop.aliveMembers().length > 0;
    };

    MBM.openTalkMenu = function () {
        if (!MBM.canUseTalkCommand()) return false;
        if (!borrowTalkMethods()) return false;
        if (!window.TalkMenu || !MBM._cmdWindow) return false;
        const scene = SceneManager._scene;
        if (!(scene instanceof Scene_Map) || MBM.isTalkMenuOpen()) return false;
        MBM._clearPreview();
        return window.TalkMenu.open(MBM._cmdWindow, scene);
    };

    Scene_Map.prototype.closeTalkMenu = function () {
        MBM._closeTalkMenu();
    };

    MBM._closeTalkMenu = function () {
        if (window.TalkMenu) window.TalkMenu.close(MBM._cmdWindow);
        if (MBM.isActive() && BattleManager.actor()) {
            MBM._openCommandWindow(BattleManager.actor());
        }
    };

    Scene_Map.prototype.openTalkMenu = function () {
        MBM.openTalkMenu();
    };
})();
