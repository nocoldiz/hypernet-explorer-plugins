//=============================================================================
// ChestWorldState.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc A chest belongs to the world, not to the party that opened it: which chests stand open is kept in save/worlds/<name>/chests.json and shared by every savegame of that world.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ChestWorldState.js
 * ============================================================================
 * A chest emptied in one savegame has to still be empty when another savegame
 * of the same world walks in. ContainerSystem already does this for the
 * containers whose CONTENTS it owns; this plugin does it for the plain chests,
 * which hold nothing but a self switch:
 *
 *   - the procedural map's RandomItemChest / RandomWeaponChest /
 *     RandomArmorChest, keyed by the world square they were placed on and the
 *     tile they stand on;
 *   - every authored-map event named "Treasure ..." or "Acquire ..." (the
 *     naming convention ParchmentToast already reads), keyed by its map and
 *     event id - via ContainerSystem's container id, so the reused interior
 *     templates (procedural houses, treasure rooms) keep one record per
 *     physical building rather than one per template.
 *
 * "TreasureRoom" and "TreasureDoor" are doors, not chests. They match the same
 * prefix but never set a self switch, and nothing is recorded for an event that
 * never raises one, so they are left alone without a special case.
 *
 * ----------------------------------------------------------------------------
 * Why the procedural chests need more than a record
 * ----------------------------------------------------------------------------
 * Map 636 is ONE map reused for every world square, so its self switches are
 * not per-place: a chest opened on one square left event 83's switch raised for
 * the chest that event became on the next square, which then stood open (and
 * empty) before anybody touched it. Placement is therefore always followed by a
 * full rewrite of the chest self switches from the world record - the parked
 * ones included.
 *
 * A small share of procedural chests are generated ALREADY OPEN: somebody got
 * here first. That is rolled from the map seed and the chest's tile, so it is
 * the same answer every time the square is built, and it is written into the
 * world record on the first visit so it stays true even if the rule changes.
 *
 * ----------------------------------------------------------------------------
 * Why the tiles have to be written down too
 * ----------------------------------------------------------------------------
 * A chest is addressed by the tile it stands on, and the pass that places it
 * only LOOKS deterministic: it rejects tiles that are occupied by an event or
 * that the party is standing on, and neither of those is the same twice. A
 * savegame restored on the square brings its events back wherever they were
 * saved - the chests included, each one standing on the very tile its seed
 * would pick again - so the second pass sent every chest somewhere else, and a
 * chest the party had already emptied came back shut and full under its new
 * address. The tiles of the first pass are therefore kept with the rest of the
 * square's chest state and handed back to every later pass.
 *
 * No plugin commands: the record is driven off self switches being set.
 * ============================================================================
 */

(() => {
    "use strict";

    const PROC_MAP_ID = 636;
    const WORLD_FILE = 'chests';                          // i18n-ignore: world data file key
    const PROC_CHEST_NAMES = ['RandomItemChest', 'RandomArmorChest', 'RandomWeaponChest'];  // i18n-ignore: event names in Map636
    const AUTHORED_PREFIXES = ['treasure', 'acquire'];    // i18n-ignore: event names in the editor
    const CHEST_SWITCH = 'A';

    // How often a procedural chest is generated already emptied. Rare enough
    // that finding one reads as a trace of somebody else rather than as a bug.
    const BORN_OPEN_CHANCE = 0.04;

    //=========================================================================
    // The world record
    //=========================================================================
    // save/worlds/<name>/chests.json:
    //   { opened: { "<placeKey>": { "<chestKey>": 1 } },
    //     placed: { "<placeKey>": ["<chestKey>", ...] } }
    // Plain objects (no Set/Map) so JsonEx serialises them on flush.

    function worldStore() {
        const W = window.WorldManager;
        // Never cache the object: setActiveWorld drops the whole file cache, so
        // a held reference would go on writing into a world nobody is playing.
        if (!W || typeof W.getFile !== 'function' || !W.hasActiveWorld || !W.hasActiveWorld()) return null;
        const store = W.getFile(WORLD_FILE);
        if (!store.opened) store.opened = {};
        return store;
    }

    // Writing the world folder costs far more than one chest lid is worth, so
    // the flush is coalesced. A savegame write flushes on its own, so nothing is
    // ever left only in memory.
    const FLUSH_DELAY = 1000;
    let flushTimer = null;

    function requestFlush() {
        const W = window.WorldManager;
        if (!W || typeof W.flush !== 'function' || flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            try { W.flush(); } catch (e) { /* non-fatal */ }
        }, FLUSH_DELAY);
    }

    function isOpened(placeKey, chestKey) {
        const store = worldStore();
        if (!store || !placeKey) return false;
        const place = store.opened[placeKey];
        return !!(place && place[chestKey]);
    }

    function recordOpened(placeKey, chestKey) {
        const store = worldStore();
        if (!store || !placeKey) return;
        if (!store.opened[placeKey]) store.opened[placeKey] = {};
        if (store.opened[placeKey][chestKey]) return;
        store.opened[placeKey][chestKey] = 1;
        requestFlush();
    }

    // The tiles this square's chests were placed on the first time it was
    // populated, in the order the placement pass dealt them, or null when the
    // square has never been populated (or holds no chest at all).
    function recallPlacement(placeKey) {
        const store = worldStore();
        if (!store || !placeKey || !store.placed) return null;
        const tiles = store.placed[placeKey];
        if (!Array.isArray(tiles)) return null;
        const out = [];
        for (const tile of tiles) {
            const parts = String(tile).split(',');
            const x = Number(parts[0]), y = Number(parts[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            out.push({ x, y });
        }
        return out;
    }

    function recordPlacement(placeKey, tiles) {
        const store = worldStore();
        if (!store || !placeKey || !Array.isArray(tiles)) return;
        if (!store.placed) store.placed = {};
        store.placed[placeKey] = tiles.map(t => procChestKey(t.x, t.y));
        requestFlush();
    }

    //=========================================================================
    // Addressing a chest
    //=========================================================================

    // The procedural square the party is standing on: biome + world coordinate
    // + depth + the entrance salt that tells two cellars under one field apart.
    // FurnitureSystem owns the composition (WorldMapReturn installs the proc-map
    // provider), so a chest and a piece of furniture agree on what "here" is.
    function procPlaceKey() {
        const F = window.FurnitureSystem;
        if (!F || typeof F.furnitureMapKey !== 'function') return null;
        const key = F.furnitureMapKey();
        // The plain map id means the provider declined - the square has not been
        // generated yet. Recording against "636" would pool every square.
        if (key == null || String(key) === String(PROC_MAP_ID)) return null;
        return String(key);
    }

    // A procedural chest is addressed by the tile it stands on, not by which
    // template event happens to be playing it: the placement pass deals the same
    // tiles on every visit (see above), while the event ids shuffle.
    function procChestKey(x, y) {
        return `${x},${y}`;
    }

    // A chest's tile, as the square it belongs to counts tiles. The placement
    // pass runs with the world looking like that one square, so the tiles it
    // deals - and the record written from them - are square-local; an event read
    // outside the pass reports its position on the loaded map instead, which is
    // a different number as soon as neighbouring squares are stitched alongside.
    function procChestTile(event) {
        const S = window.ProcStitch;
        if (S && typeof S.localToParty === 'function') {
            try {
                const tile = S.localToParty(event.x, event.y);
                if (tile) return tile;
            } catch (e) { /* fall back to the raw position */ }
        }
        return { x: event.x, y: event.y };
    }

    function isProcChestEvent(mapId, eventId) {
        if (mapId !== PROC_MAP_ID || !$dataMap || !$dataMap.events) return false;
        const data = $dataMap.events[eventId];
        return !!(data && PROC_CHEST_NAMES.includes(data.name));
    }

    // An authored chest: "Treasure (Bone)", "Acquire (Salvaged steel)". The name
    // is the whole convention - ParchmentToast reads the same prefixes.
    function isAuthoredChestName(name) {
        const n = String(name || '').toLowerCase();
        return AUTHORED_PREFIXES.some(p => n.startsWith(p));
    }

    // Container ids already carry the discriminator that keeps reused interior
    // templates apart (one procedural house's chest is not every house's chest),
    // so an authored chest is addressed exactly as its contents would be.
    function authoredChestKey(mapId, eventId) {
        const C = window.ContainerManager;
        if (C && typeof C.getContainerId === 'function') {
            try { return String(C.getContainerId(mapId, eventId)); } catch (e) { /* fall through */ }
        }
        return `${mapId}_${eventId}`;
    }

    const AUTHORED_PLACE = 'authored';  // i18n-ignore: world data key

    //=========================================================================
    // Procedural map: rewrite every chest self switch from the world record
    //=========================================================================

    /**
     * Called by placeChestEvents once the positions are final, with EVERY chest
     * event on the map (the parked ones included) and the square's base seed.
     *
     * Parked chests are cleared unconditionally, and placed chests are set to
     * whatever the world says about their tile, so nothing survives from the
     * square the party just left.
     */
    // Mulberry32's first draw off two nearby seeds is not independent enough to
    // roll a 4% chance on: the square seed and the tile go through an avalanche
    // mix first, or neighbouring tiles come out correlated and the measured rate
    // drifts well off the nominal one.
    function mixSeed(a, b, c) {
        let h = (a | 0) ^ 0x9e3779b9;
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        h = (h + Math.imul(b | 0, 0xc2b2ae35)) | 0;
        h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
        h = (h + Math.imul(c | 0, 0x165667b1)) | 0;
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        return (h ^ (h >>> 15)) >>> 0;
    }

    /**
     * The tiles the square's chests were given the first time it was populated,
     * for the placement pass to deal again, or null when there is nothing
     * written down (a square never populated, or no world to write into).
     */
    function recallProcPlacement() {
        return recallPlacement(procPlaceKey());
    }

    /**
     * Called by placeChestEvents with the tiles it just dealt, in its own order
     * and one entry per chest it placed, so every later pass over this square
     * puts the same chests back on the same tiles. (0,0) is the parking spot and
     * is written down like any other answer: a chest the pass could not find a
     * tile for must stay parked rather than turn up somewhere new.
     */
    function rememberProcPlacement(tiles) {
        recordPlacement(procPlaceKey(), tiles);
    }

    // Raising a switch from the record is not the party opening a chest, so the
    // recording hook stands down for the length of the rewrite. Without this the
    // tiles would be read back through procChestTile while the placement pass
    // still has the world looking like the square, and shifted a second time.
    let applyingProcState = false;

    function applyProcChestState(chestEvents, baseSeed) {
        if (!$gameSelfSwitches || !$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return;
        const mapId = $gameMap.mapId();
        const placeKey = procPlaceKey();
        const rngFor = (window.ProcGenUtils && window.ProcGenUtils.createSeededRandom) || null;

        applyingProcState = true;
        try {
            for (const event of chestEvents || []) {
                if (!event) continue;
                const id = event._eventId;
                const placed = event.x > 0 || event.y > 0;
                if (!placed) {
                    $gameSelfSwitches.setValue([mapId, id, CHEST_SWITCH], false);
                    continue;
                }
                const chestKey = procChestKey(event.x, event.y);
                let opened = isOpened(placeKey, chestKey);
                if (!opened && placeKey && rngFor) {
                    // Somebody got here first. Seeded from the square and the tile so
                    // the same chest is derelict on every visit, then written down so
                    // it stays derelict whatever this roll becomes later.
                    const rng = rngFor(mixSeed(baseSeed, event.x, event.y));
                    if (rng() < BORN_OPEN_CHANCE) {
                        opened = true;
                        recordOpened(placeKey, chestKey);
                    }
                }
                $gameSelfSwitches.setValue([mapId, id, CHEST_SWITCH], opened);
            }
        } finally {
            applyingProcState = false;
        }
        // Take the page swap now rather than on the next frame, so no chest is
        // ever drawn shut for a frame before the record says it is open.
        if (typeof $gameMap.refreshIfNeeded === 'function') $gameMap.refreshIfNeeded();
    }

    //=========================================================================
    // Authored maps: apply what the world already knows on setup
    //=========================================================================
    // Only ever RAISES a switch. A savegame that emptied a chest before this
    // plugin existed has its own switch raised already and must not be handed
    // the chest back because the world record has never heard of it.

    function applyAuthoredChestState(mapId) {
        if (!$gameSelfSwitches || !$dataMap || !$dataMap.events) return;
        if (mapId === PROC_MAP_ID) return;
        const store = worldStore();
        if (!store) return;
        const place = store.opened[AUTHORED_PLACE];
        if (!place) return;
        for (const data of $dataMap.events) {
            if (!data || !isAuthoredChestName(data.name)) continue;
            if (!place[authoredChestKey(mapId, data.id)]) continue;
            $gameSelfSwitches.setValue([mapId, data.id, CHEST_SWITCH], true);
        }
        if ($gameMap && typeof $gameMap.refreshIfNeeded === 'function') $gameMap.refreshIfNeeded();
    }

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        _Game_Map_setup.call(this, mapId);
        applyAuthoredChestState(mapId);
    };

    //=========================================================================
    // Recording: a chest is opened when its self switch goes up
    //=========================================================================
    // Every route that opens a chest ends here - the event page's own Control
    // Self Switch, ContainerSystem's pregeneration, a plugin doing it by hand -
    // so this is the one place the record has to be written from.

    const _Game_SelfSwitches_setValue = Game_SelfSwitches.prototype.setValue;
    Game_SelfSwitches.prototype.setValue = function (key, value) {
        _Game_SelfSwitches_setValue.call(this, key, value);
        if (!value || !Array.isArray(key) || key[2] !== CHEST_SWITCH) return;
        try {
            noteChestOpened(key[0], key[1]);
        } catch (e) {
            console.error('[ChestWorldState] Failed to record an opened chest', e);
        }
    };

    function noteChestOpened(mapId, eventId) {
        if (applyingProcState || !$dataMap || !$dataMap.events) return;
        // Only the map the party is actually on: a self switch set for some other
        // map cannot be read against $dataMap, which is this map's.
        if (!$gameMap || $gameMap.mapId() !== mapId) return;

        if (mapId === PROC_MAP_ID) {
            if (!isProcChestEvent(mapId, eventId)) return;
            const event = $gameMap.event(eventId);
            if (!event || (event.x <= 0 && event.y <= 0)) return;   // parked: not a chest anybody found
            const tile = procChestTile(event);
            recordOpened(procPlaceKey(), procChestKey(tile.x, tile.y));
            return;
        }

        const data = $dataMap.events[eventId];
        if (!data || !isAuthoredChestName(data.name)) return;
        recordOpened(AUTHORED_PLACE, authoredChestKey(mapId, eventId));
    }

    //=========================================================================
    // Public API
    //=========================================================================

    window.ChestWorldState = {
        applyProcChestState,
        applyAuthoredChestState,
        recallProcPlacement,
        rememberProcPlacement,
        isProcChestOpened: (x, y) => isOpened(procPlaceKey(), procChestKey(x, y)),
        BORN_OPEN_CHANCE,
    };
})();
