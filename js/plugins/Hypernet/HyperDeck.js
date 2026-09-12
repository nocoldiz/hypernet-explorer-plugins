/*:
 * @target MZ
 * @plugindesc v1.0.0 The Hyperdeck: a clamshell handheld the party builds out of components, and the machine Archways XP runs on.
 * @author Omni-Lex
 *
 * @command OpenHyperDeck
 * @text Open the Hyperdeck
 * @desc Opens the Hyperdeck: the clamshell, its component board, and the boot that leads into Archways XP.
 *
 * @help
 * HyperDeck.js
 *
 * A Hyperdeck is a clamshell handheld with a component grid in its base. The
 * top half is the Archways XP screen, the bottom half is a keyboard until you
 * open the board, at which point it becomes the grid you fit parts into.
 *
 * Components are ordinary items tagged <category:Component>. Fitting one takes
 * it out of the party's inventory; pulling it back out returns it. The deck is
 * shared by the whole party and lives in the savegame.
 *
 * Powering the deck on runs a POST. It fails on two things only: a required
 * kind of component missing (cpu, ram, storage, display, battery), or the
 * fitted parts drawing more power than the cell can give. Where a part sits on
 * the board never matters, and a graphics adapter is an upgrade rather than a
 * requirement: with none fitted the processor drives the panel itself out of a
 * slice of main memory. On success it opens Scene_HypernetOS. Every other route into the OS (events,
 * the W hotkey, the shop and browser plugin commands) is unchanged and shows
 * no boot at all: the boot belongs to the machine, not to the desktop.
 *
 * Item note tags read here:
 *   <category:Component>   marks the item as a part
 *   <Component: kind>      cpu ram storage gpu display battery modem cooling sound
 *   <Shape: XX.,.XX>       the grid footprint; X filled, . empty, rows by comma
 *   <Specs: mhz 733, watt 23>
 *                          additive contributions. Keys: mhz, ram (MB),
 *                          mb (storage MB), vram (MB), mah, watt.
 *                          A negative watt is a supply, not a draw.
 *                          ram -1 means unbounded (the paradox part).
 *   <Refurbished>          pre-Y2K stock, sold on second hand
 *
 * Exposes window.HyperDeck:
 *   deck()            the saved deck record
 *   caseDef()         its case definition, from HyperDeckModels
 *   parts()           the fitted parts, resolved
 *   specs()           { mhz, ram, mb, vram, shared, mah, draw, supply,
 *                     kinds, cells, used }
 *   missingKinds()    required kinds with nothing fitted
 *   canBoot()         true when the POST would pass
 *   summary()         the machine's statistics, as the desktop prints them
 *   performanceIndex() / enduranceHours()   one number each, off the pieces
 *   canPlace(itemId, c, r, rot)
 *   place(itemId, c, r, rot, fromInventory)
 *   removeAt(c, r)    pulls the part under that cell back into the inventory
 *   inventoryParts()  every component the party is carrying
 *   rollStartingDeck(rng)
 *   open()            pushes the Hyperdeck scene
 *
 * Requires js/libs/three.min.js, Hypernet/HyperDeckModels.js and, for the
 * period look, Battler3D/PSXShader.js.
 */

(() => {
    'use strict';

    // Kinds the machine cannot POST without. Everything else is optional.
    // i18n-ignore-start  note-tag kind ids, labels come from HyperDeck.kind.*
    const KINDS = ['cpu', 'ram', 'storage', 'gpu', 'display', 'battery', 'modem',
        'cooling', 'sound', 'sensor'];
    const REQUIRED = ['cpu', 'ram', 'storage', 'display', 'battery'];
    const SPEC_KEYS = ['mhz', 'ram', 'mb', 'vram', 'mah', 'watt'];
    // i18n-ignore-end

    // ram: -1 in a <Specs:> tag means "unbounded", not "minus one megabyte".
    const UNBOUNDED = -1;

    //=========================================================================
    // Component data
    //=========================================================================
    const _parsed = {};

    function isComponentItem(item) {
        return !!(item && item.note && /<category:\s*Component\s*>/i.test(item.note));
    }

    // Parses the three Hyperdeck note tags once per item id.
    function parseComponent(itemId) {
        if (_parsed[itemId] !== undefined) return _parsed[itemId];
        const item = $dataItems && $dataItems[itemId];
        if (!isComponentItem(item)) return (_parsed[itemId] = null);

        const kindMatch = /<Component:\s*([a-z]+)\s*>/i.exec(item.note);
        const shapeMatch = /<Shape:\s*([X.,]+)\s*>/i.exec(item.note);
        const specMatch = /<Specs:\s*([^>]*)>/i.exec(item.note);
        const natureMatch = /<Nature:\s*(\w+)\s*>/i.exec(item.note);
        if (!kindMatch || !shapeMatch) return (_parsed[itemId] = null);

        const kind = kindMatch[1].toLowerCase();
        if (KINDS.indexOf(kind) < 0) return (_parsed[itemId] = null);

        const mask = shapeMatch[1].split(',').map(row =>
            row.split('').map(ch => (ch === 'X' || ch === 'x' ? 1 : 0)));
        const width = Math.max.apply(null, mask.map(r => r.length));
        mask.forEach(r => { while (r.length < width) r.push(0); });

        const specs = {};
        if (specMatch) {
            specMatch[1].split(',').forEach(pair => {
                const m = /\s*([a-z]+)\s+(-?\d+)\s*/i.exec(pair);
                if (m && SPEC_KEYS.indexOf(m[1].toLowerCase()) >= 0) {
                    specs[m[1].toLowerCase()] = parseInt(m[2], 10);
                }
            });
        }

        return (_parsed[itemId] = {
            id: itemId,
            kind: kind,
            nature: natureMatch ? natureMatch[1] : 'Mundane',
            // Pre-Y2K stock, refurbished and sold on: the cheap end of every
            // shelf, and what a second-hand deck is mostly built out of.
            refurb: /<Refurbished>/i.test(item.note),
            mask: mask,
            w: width,
            h: mask.length,
            specs: specs
        });
    }

    // Every component in the database, resolved once.
    let _catalogue = null;
    function catalogue() {
        if (_catalogue) return _catalogue;
        _catalogue = [];
        for (let i = 1; i < $dataItems.length; i++) {
            const parsedItem = parseComponent(i);
            if (parsedItem) _catalogue.push(parsedItem);
        }
        return _catalogue;
    }

    // rot is quarter turns clockwise. The transpose is the one the lockpick
    // minigame uses; nothing else about that minigame applies here, because the
    // board is a grid inventory and not a well: parts do not fall.
    function rotateMask(mask, rot) {
        let out = mask;
        for (let step = 0; step < (((rot % 4) + 4) % 4); step++) {
            const rows = out.length;
            const cols = out[0].length;
            const next = [];
            for (let x = 0; x < cols; x++) {
                next.push(new Array(rows).fill(0));
            }
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    next[x][rows - 1 - y] = out[y][x];
                }
            }
            out = next;
        }
        return out;
    }

    function maskCells(mask) {
        const cells = [];
        for (let r = 0; r < mask.length; r++) {
            for (let c = 0; c < mask[r].length; c++) {
                if (mask[r][c]) cells.push([c, r]);
            }
        }
        return cells;
    }

    //=========================================================================
    // The saved deck
    //=========================================================================
    Game_System.prototype.hyperdeckData = function () {
        if (!this._hyperdeck) {
            // The case catalogue lives in the sibling plugin; a save made with
            // it disabled still gets a record, just an empty one.
            const models = window.HyperDeckModels;
            this._hyperdeck = {
                caseId: models ? models.CASES[0].id : '',
                placed: []
            };
        }
        if (!Array.isArray(this._hyperdeck.placed)) this._hyperdeck.placed = [];
        // Saves made while the board still had wiring on it drop it here: the
        // machine no longer asks anything of where a run was drawn.
        if (this._hyperdeck.traces) delete this._hyperdeck.traces;
        return this._hyperdeck;
    };

    function deck() {
        return $gameSystem ? $gameSystem.hyperdeckData() : null;
    }

    function caseDef() {
        const d = deck();
        const models = window.HyperDeckModels;
        if (!models) return { id: '', cols: 0, rows: 0, blocked: [] };
        return models.caseById(d ? d.caseId : null);
    }

    function blockedKey(def) {
        const set = {};
        (def.blocked || []).forEach(([c, r]) => { set[c + ',' + r] = true; });
        return set;
    }

    // Which cells each fitted part covers, keyed "c,r" -> the placed record.
    function occupancy(skipRecord) {
        const map = {};
        const d = deck();
        if (!d) return map;
        d.placed.forEach(rec => {
            if (rec === skipRecord) return;
            const parsedItem = parseComponent(rec.itemId);
            if (!parsedItem) return;
            maskCells(rotateMask(parsedItem.mask, rec.rot)).forEach(([c, r]) => {
                map[(rec.c + c) + ',' + (rec.r + r)] = rec;
            });
        });
        return map;
    }

    function canPlace(itemId, c, r, rot, skipRecord) {
        const parsedItem = parseComponent(itemId);
        if (!parsedItem) return false;
        const def = caseDef();
        const blocked = blockedKey(def);
        const taken = occupancy(skipRecord);
        const cells = maskCells(rotateMask(parsedItem.mask, rot));
        for (const [dc, dr] of cells) {
            const cc = c + dc;
            const rr = r + dr;
            if (cc < 0 || rr < 0 || cc >= def.cols || rr >= def.rows) return false;
            if (blocked[cc + ',' + rr]) return false;
            if (taken[cc + ',' + rr]) return false;
        }
        return true;
    }

    // fromInventory is false only for the deck the party is handed at new game,
    // whose parts were never in a bag to begin with.
    function place(itemId, c, r, rot, fromInventory) {
        if (!canPlace(itemId, c, r, rot)) return false;
        if (fromInventory !== false) {
            const item = $dataItems[itemId];
            if (!item || $gameParty.numItems(item) < 1) return false;
            $gameParty.loseItem(item, 1);
        }
        deck().placed.push({ itemId: itemId, c: c, r: r, rot: ((rot % 4) + 4) % 4 });
        return true;
    }

    function recordAt(c, r) {
        return occupancy()[c + ',' + r] || null;
    }

    function removeAt(c, r) {
        const rec = recordAt(c, r);
        if (!rec) return null;
        const d = deck();
        const i = d.placed.indexOf(rec);
        if (i < 0) return null;
        d.placed.splice(i, 1);
        const item = $dataItems[rec.itemId];
        if (item) $gameParty.gainItem(item, 1);
        return rec;
    }

    //=========================================================================
    // Wiring
    //=========================================================================
    // There is none to draw. A board is a box parts sit in: seat a part
    // anywhere it fits and it is wired, the way a socketed board has always
    // been. What decides whether the machine runs is what is on it and what
    // the cell can carry, nothing about where the pieces happen to sit.
    //
    // Video is part of that: a graphics adapter is an upgrade, never a
    // requirement. With none fitted the processor drives the panel itself out
    // of a slice of main memory, which is what an integrated chipset does.

    // How much main memory the processor lends the panel when nothing else is
    // driving it. A mundane die of the period could spare a few megabytes; an
    // arcane one is not held to the period at all.
    function integratedVram(cpuPart) {
        if (!cpuPart) return 0;
        const mhz = cpuPart.specs.mhz || 0;
        const cap = cpuPart.nature === 'Mundane' ? 8 : 32;
        return Math.max(1, Math.min(cap, Math.round(mhz / 125)));
    }

    // The fastest processor fitted, which is the one that would be driving
    // anything the deck does not have a dedicated part for.
    function mainCpuPart() {
        let best = null;
        (deck() ? deck().placed : []).forEach(rec => {
            const part = parseComponent(rec.itemId);
            if (!part || part.kind !== 'cpu') return;
            if (!best || (part.specs.mhz || 0) > (best.specs.mhz || 0)) best = part;
        });
        return best;
    }

    //=========================================================================
    // Specifications
    //=========================================================================
    function specs() {
        const totals = { mhz: 0, ram: 0, mb: 0, vram: 0, mah: 0, draw: 0, supply: 0 };
        const kinds = {};
        let used = 0;
        const d = deck();
        (d ? d.placed : []).forEach(rec => {
            const parsedItem = parseComponent(rec.itemId);
            if (!parsedItem) return;
            kinds[parsedItem.kind] = (kinds[parsedItem.kind] || 0) + 1;
            used += maskCells(parsedItem.mask).length;
            const s = parsedItem.specs;
            // The processor total is the fastest part, not the sum: two
            // processors do not make one twice as quick.
            if (s.mhz) totals.mhz = Math.max(totals.mhz, s.mhz);
            if (s.vram) totals.vram = Math.max(totals.vram, s.vram);
            if (s.ram === UNBOUNDED) totals.ram = Infinity;
            else if (s.ram && totals.ram !== Infinity) totals.ram += s.ram;
            if (s.mb) totals.mb += s.mb;
            if (s.mah) totals.mah += s.mah;
            if (s.watt > 0) totals.draw += s.watt;
            else if (s.watt < 0) totals.supply += -s.watt;
        });
        // No adapter on the board: the processor drives the panel out of a
        // slice of main memory, so the video the machine has is real, it is
        // just borrowed. The slice comes off the memory total the same way it
        // would on any integrated chipset.
        totals.shared = 0;
        if (!kinds.gpu && kinds.cpu) {
            totals.shared = integratedVram(mainCpuPart());
            totals.vram = totals.shared;
            if (totals.ram !== Infinity) {
                totals.ram = Math.max(0, totals.ram - totals.shared);
            }
        }
        const def = caseDef();
        const blocked = (def.blocked || []).length;
        totals.kinds = kinds;
        totals.used = used;
        totals.cells = def.cols * def.rows - blocked;
        totals.caseId = def.id;
        return totals;
    }

    // How long the cell would run the board it is fitted to, in hours. Cells
    // are quoted in mAh, so the pack voltage is what turns a capacity into a
    // running time: 10.8 V, the three-cell pack every portable of the period
    // was built around.
    const PACK_VOLTS = 10.8;

    function enduranceHours(s) {
        const spec = s || specs();
        if (!spec.mah || spec.draw <= 0) return 0;
        return (spec.mah / 1000) * PACK_VOLTS / spec.draw;
    }

    // One number for "how good is this machine", so the desktop has something
    // to print that moves when a part is swapped. Weighted the way a buyer of
    // the period would have weighted it: clock first, then memory, then the
    // adapter, then the disk.
    function performanceIndex(s) {
        const spec = s || specs();
        const ram = spec.ram === Infinity ? 4096 : spec.ram;
        return Math.round(
            (spec.mhz || 0) / 10
            + Math.min(1024, ram) / 4
            + Math.min(1024, spec.vram || 0) * 1.5
            + Math.min(1000000, spec.mb || 0) / 2000
        );
    }

    function missingKinds() {
        const present = specs().kinds;
        return REQUIRED.filter(k => !present[k]);
    }

    function isOverdrawn() {
        const s = specs();
        return s.draw > s.supply;
    }

    function canBoot() {
        return missingKinds().length === 0 && !isOverdrawn();
    }

    //=========================================================================
    // The starting deck
    //=========================================================================
    // Which corner the current roll is packing towards.
    let _packCorner = { right: false, bottom: false };

    // The scrap end of the catalogue: mundane parts only, and within each kind
    // only the weakest third of what exists, by the same ranking auto-fit uses.
    // A deck that turns up in somebody's cupboard is somebody's cast-off, so
    // this is what it is built out of unless the party is a Hypernet Explorer.
    function lowGradeParts() {
        const byKind = {};
        catalogue().forEach(part => {
            if (part.nature !== 'Mundane') return;
            (byKind[part.kind] = byKind[part.kind] || []).push(part);
        });
        const out = [];
        Object.keys(byKind).forEach(kind => {
            const sorted = byKind[kind].slice().sort((a, b) => rankPart(a) - rankPart(b));
            const keep = Math.max(2, Math.ceil(sorted.length / 2));
            out.push.apply(out, sorted.slice(0, keep));
            // Refurbished stock is in the pool whatever it ranks: a deck
            // somebody else put together out of what was on the cheap shelf
            // is mostly pre-Y2K parts, and that is what it should look like.
            sorted.slice(keep).forEach(part => { if (part.refurb) out.push(part); });
        });
        // Nothing mundane of a kind at all: fall back rather than hand the
        // roller an empty pool it would silently skip.
        KINDS.forEach(kind => {
            if (byKind[kind]) return;
            catalogue().forEach(part => { if (part.kind === kind) out.push(part); });
        });
        return out;
    }

    // Every new game owns a deck somebody else already put together: a random
    // case with a random spread of parts in it. A roll asked for by hand can
    // come out short a part, so the first thing some players do with a
    // Hyperdeck is finish building it; opts.mustBoot, which the deck every new
    // game starts with is rolled under, forbids that and repairs whatever the
    // roll left missing until the machine posts.
    //
    // opts.everything opens the whole catalogue, arcane pieces included. That
    // is the Hypernet Explorer's deck: everyone else is dealt cast-offs.
    function rollStartingDeck(rng, opts) {
        const r = typeof rng === 'function' ? rng : Math.random;
        const pool = (opts && opts.everything) ? catalogue() : lowGradeParts();

        const def = window.HyperDeckModels.randomCase(r);
        const d = deck();
        d.caseId = def.id;
        d.placed = [];
        // Whoever assembled this deck worked from one corner outwards, the way
        // anyone packing a case does, so the leftover room stays in one piece.
        _packCorner = { right: r() < 0.5, bottom: r() < 0.5 };

        const byKind = {};
        pool.forEach(p => {
            (byKind[p.kind] = byKind[p.kind] || []).push(p);
        });

        // One deck in five is deliberately short a required part; the rest of
        // the gap is boards that simply ran out of room. Never the cell: with
        // no supply on the board nothing else can be powered either, and the
        // deck would arrive as a bare case.
        // A deck that has to boot is never dealt that gap.
        const skippable = REQUIRED.filter(kind => kind !== 'battery');
        const skipped = (!(opts && opts.mustBoot) && r() < 0.2)
            ? skippable[Math.floor(r() * skippable.length) % skippable.length] : null;

        // Placed in one pass with a running budget: before each kind is dealt,
        // the cells the kinds still to come will need at their smallest are
        // subtracted, so a big panel can never eat the room the processor was
        // going to stand in. Without it a board regularly came out of the
        // factory with no processor on it at all.
        const wanted = REQUIRED.filter(kind => kind !== skipped);
        // The cell first, because every other part has to run off whatever it
        // can give, then the rest. Nothing else is guaranteed: a deck that
        // ships without an adapter still boots, on the processor's own video,
        // which is what most machines of the period did.
        const order = ['battery', 'display', 'cpu', 'storage', 'ram']
            .filter(kind => wanted.indexOf(kind) >= 0);
        order.forEach((kind, i) => {
            const rest = order.slice(i + 1).map(k => byKind[k]);
            const reserve = rest.reduce((n, pool) => n + minArea(pool), 0);
            // The cell is chosen against the draw the rest of the build will
            // add at its very lightest, so it is never too small for the
            // machine it is going into, and every part after it leaves that
            // same draw unspent for the kinds still to come. Without the
            // second half of that the memory, which is fitted last, was left
            // off more than half the boards for want of two watts.
            const need = minDraw(rest);
            fitWithin(byKind[kind], r, freeCells() - reserve,
                kind === 'battery' ? need : 0, false, need);
        });

        // Extras, only while the board and the cell still have room for them.
        ['gpu', 'cooling', 'sound', 'modem'].forEach(kind => {
            if (r() < 0.5) fitWithin(byKind[kind], r, freeCells(), false, true);
        });
        // A second memory module, often, because that is how memory works.
        if (r() < 0.45) fitWithin(byKind.ram, r, freeCells(), 0, true);
        // Nothing leaves the factory overdrawn.
        trimToPower();
        if (opts && opts.mustBoot) repairToBoot(byKind, r);
        return d;
    }

    // The deck the game hands out at the start of a new run has to switch on:
    // a player who has never seen the machine cannot be asked to finish
    // building it before it will POST. Whatever the roll left short, the
    // cheapest part of that kind is forced onto the board, making room by
    // pulling the extras (anything that is not a required kind) off first, and
    // then, if the cell still cannot carry it, by taking the heaviest draw off
    // the way the factory trim does.
    function repairToBoot(byKind, r) {
        const d = deck();
        if (!d) return;
        for (let guard = 0; guard < 12 && !canBoot(); guard++) {
            const missing = missingKinds();
            // Everything is on the board and the cell is the thing that cannot
            // carry it: a bigger cell before anything comes off, because what
            // would come off is a part the machine needs.
            if (!missing.length) {
                if (upgradeCell(byKind, r)) continue;
                trimToPower();
                continue;
            }
            const kind = missing[0];
            const pool = (byKind[kind] && byKind[kind].length)
                ? byKind[kind]
                : catalogue().filter(part => part.kind === kind);
            if (!pool.length) return;
            // Smallest and lightest first, so the part most likely to fit into
            // what is left of the board and of the supply is tried first; a
            // cell is ranked the other way round, by what it can give. Parts
            // the cell could not carry are tried last rather than dropped, so
            // a board with no room left still gets something of the kind on it
            // and the trim below decides what comes off for it.
            const order = pool.slice().sort((a, b) =>
                (kind === 'battery'
                    ? ((a.specs.watt || 0) - (b.specs.watt || 0))
                    : 0)
                || ((powerFits(b) ? 1 : 0) - (powerFits(a) ? 1 : 0))
                || (areaOf(a) - areaOf(b))
                || ((a.specs.watt || 0) - (b.specs.watt || 0)));
            let fitted = false;
            for (const part of order) {
                if (fitSomewhere(part.id, r)) { fitted = true; break; }
            }
            if (fitted) { trimToPower(); continue; }
            if (!dropOnePart()) return;
        }
    }

    // Swaps the fitted cell for the biggest supply that will still go on the
    // board. Returns false when there is nothing better to swap to, which is
    // what tells the repair to start taking parts off instead.
    function upgradeCell(byKind, r) {
        const d = deck();
        const pool = (byKind.battery && byKind.battery.length)
            ? byKind.battery
            : catalogue().filter(part => part.kind === 'battery');
        if (!pool.length) return false;
        const fittedIds = d.placed.map(rec => rec.itemId).filter(id => {
            const part = parseComponent(id);
            return part && part.kind === 'battery';
        });
        const have = fittedIds.reduce((n, id) => {
            const part = parseComponent(id);
            return n + Math.max(0, -(part.specs.watt || 0));
        }, 0);
        const better = pool.filter(
            part => Math.max(0, -(part.specs.watt || 0)) > have)
            .sort((a, b) => (a.specs.watt || 0) - (b.specs.watt || 0));
        if (!better.length) return false;
        const kept = d.placed.filter(rec => {
            const part = parseComponent(rec.itemId);
            return !(part && part.kind === 'battery');
        });
        const before = d.placed;
        d.placed = kept;
        for (const part of better) {
            if (fitSomewhere(part.id, r)) return true;
        }
        d.placed = before;
        return false;
    }

    // Takes one part off the board to make room: an extra before a spare of a
    // required kind, biggest first, and never the last part of a kind the
    // machine needs.
    function dropOnePart() {
        const d = deck();
        if (!d || !d.placed.length) return false;
        const count = {};
        d.placed.forEach(rec => {
            const part = parseComponent(rec.itemId);
            if (part) count[part.kind] = (count[part.kind] || 0) + 1;
        });
        let worst = null;
        d.placed.forEach(rec => {
            const part = parseComponent(rec.itemId);
            if (!part) return;
            const required = REQUIRED.indexOf(part.kind) >= 0;
            if (required && count[part.kind] <= 1) return;
            const score = (required ? 0 : 1) * 1000 + areaOf(part);
            if (!worst || score > worst.score) worst = { rec: rec, score: score };
        });
        if (!worst) return false;
        d.placed.splice(d.placed.indexOf(worst.rec), 1);
        return true;
    }

    // The lightest the given pools could possibly draw between them: what a
    // cell has to supply for a build using the cheapest part of every kind.
    function minDraw(pools) {
        return pools.reduce((n, pool) => n + ((pool && pool.length)
            ? Math.min.apply(null, pool.map(part => Math.max(0, part.specs.watt || 0)))
            : 0), 0);
    }

    // The safety net, not the plan: whatever the roll ended up with, parts come
    // off the board heaviest draw first until the cell can carry what is left.
    // Nothing here goes back to the party, because the roll never took it from
    // them in the first place.
    function trimToPower() {
        const d = deck();
        if (!d) return;
        for (let guard = 0; guard < 40 && isOverdrawn(); guard++) {
            let worst = null;
            d.placed.forEach(rec => {
                const part = parseComponent(rec.itemId);
                const w = part ? (part.specs.watt || 0) : 0;
                if (w > 0 && (!worst || w > worst.w)) worst = { rec: rec, w: w };
            });
            if (!worst) return;
            d.placed.splice(d.placed.indexOf(worst.rec), 1);
        }
    }

    function areaOf(part) { return maskCells(part.mask).length; }

    function minArea(pool) {
        return (pool && pool.length) ? Math.min.apply(null, pool.map(areaOf)) : 0;
    }

    function freeCells() {
        const s = specs();
        return s.cells - s.used;
    }

    // Would the cell still carry everything with this part added, and with
    // `reserve` watts left over for whatever is going on after it?
    function powerFits(part, reserve) {
        const s = specs();
        const w = part.specs.watt || 0;
        return s.draw + Math.max(0, w) + (reserve || 0) <= s.supply + Math.max(0, -w);
    }

    // Fits one part of a kind without spending more than `budget` cells of the
    // board, and never one the cell could not carry: a deck the player is
    // handed is allowed to be short a part, but not to be unable to switch on
    // because of what is already fitted.
    //
    // `needWatt` is the supply the part has to provide, which only the cell
    // step passes. Anything short of it is dropped from the running, so a
    // leaking field cell out of six no longer leaves a board with a processor
    // it cannot power. `reserveWatt` is the draw to leave unspent for the kinds
    // still to come, the power equivalent of `budget`.
    function fitWithin(pool, r, budget, needWatt, optional, reserveWatt) {
        if (!pool || !pool.length) return false;
        let candidates = pool.filter(part => areaOf(part) <= Math.max(1, budget));
        if (!candidates.length) {
            if (optional) return false;
            const smallest = minArea(pool);
            candidates = pool.filter(part => areaOf(part) === smallest);
        }
        if (needWatt) {
            const enough = candidates.filter(
                part => Math.max(0, -(part.specs.watt || 0)) >= needWatt);
            // Nothing in the pool is big enough: take the biggest there is and
            // let the build come up short of parts rather than of power.
            candidates = enough.length ? enough : candidates.slice()
                .sort((a, b) => (a.specs.watt || 0) - (b.specs.watt || 0)).slice(0, 1);
        }
        if (reserveWatt) {
            const room = candidates.filter(part => powerFits(part, reserveWatt));
            if (room.length) candidates = room;
        }
        const shuffled = candidates.slice().sort(() => r() - 0.5);
        for (const part of shuffled) {
            if (powerFits(part) && fitSomewhere(part.id, r)) return true;
        }
        return false;
    }

    // Drops a part into the first legal spot, packing towards one of the four
    // corners. Which corner is random, which is where the variety between two
    // starting decks comes from; scanning from a random cell INSIDE the board
    // was tried first and left the leftovers scattered in ones, so the last
    // small part regularly had nowhere contiguous to go.
    // `fromInventory` is what the caller means by "fit this": the factory roll
    // conjures its parts, auto-fit takes them out of the bag. Without it every
    // auto-fit left a copy behind, and CLEAR handed that copy over as well.
    function fitSomewhere(itemId, r, fromInventory) {
        const def = caseDef();
        const rot = Math.floor(r() * 4);
        const fromRight = _packCorner.right;
        const fromBottom = _packCorner.bottom;
        for (let attempt = 0; attempt < 4; attempt++) {
            const useRot = (rot + attempt) % 4;
            for (let dr = 0; dr < def.rows; dr++) {
                for (let dc = 0; dc < def.cols; dc++) {
                    const col = fromRight ? def.cols - 1 - dc : dc;
                    const row = fromBottom ? def.rows - 1 - dr : dr;
                    if (canPlace(itemId, col, row, useRot)) {
                        place(itemId, col, row, useRot, fromInventory === true);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        _DataManager_setupNewGame.call(this);
        try {
            rollStartingDeck(Math.random, { mustBoot: true });
        } catch (e) {
            console.warn('HyperDeck: could not roll a starting deck.', e);
        }
    };

    //=========================================================================
    // Inventory side
    //=========================================================================
    // Sorted by kind, in the order the kinds are listed, then by name. The rail
    // reads as one block per kind, so the order it is built in is the order it
    // is drawn in and the row indices the keyboard walks stay contiguous.
    function inventoryParts() {
        if (!$gameParty) return [];
        return $gameParty.items()
            .filter(isComponentItem)
            .map(item => ({
                item: item,
                data: parseComponent(item.id),
                count: $gameParty.numItems(item)
            }))
            .filter(entry => !!entry.data)
            .sort((a, b) => {
                const d = KINDS.indexOf(a.data.kind) - KINDS.indexOf(b.data.kind);
                if (d) return d;
                return itemName(a.item).localeCompare(itemName(b.item));
            });
    }

    //=========================================================================
    // Formatting helpers, shared by the panel, the boot text and Control Panel
    //=========================================================================
    // Item names are drawn onto a canvas here, which never passes through the
    // Bitmap.drawText hook the localization layer installs, so they have to be
    // put through it by hand.
    function itemName(item) {
        if (!item) return '';
        return (typeof window.translateText === 'function')
            ? window.translateText(item.name) : item.name;
    }

    function fmtMhz(n) { return n ? T('HyperDeck.unit.mhz', { n: n }) : T('HyperDeck.value.none'); }
    function fmtMb(n) { return T('HyperDeck.unit.mb', { n: n }); }

    function fmtRam(n) {
        if (n === Infinity) return T('HyperDeck.value.infinite');
        return n ? fmtMb(n) : T('HyperDeck.value.none');
    }

    function fmtStore(n) {
        if (!n) return T('HyperDeck.value.none');
        if (n >= 1000) return T('HyperDeck.unit.gb', { n: Math.round(n / 100) / 10 });
        return fmtMb(n);
    }

    function fmtWatt(n) { return T('HyperDeck.unit.watt', { n: n }); }
    function fmtMah(n) { return n ? T('HyperDeck.unit.mah', { n: n }) : T('HyperDeck.value.none'); }
    function kindLabel(k) { return T('HyperDeck.kind.' + k); }
    function caseLabel(def) { return T('HyperDeck.case.' + def.id); }

    // The name of the fastest processor / biggest adapter / the uplink fitted,
    // used by the boot text so the POST names real parts.
    function partNameFor(kind, metric) {
        let best = null;
        let bestVal = -1;
        (deck() ? deck().placed : []).forEach(rec => {
            const parsedItem = parseComponent(rec.itemId);
            if (!parsedItem || parsedItem.kind !== kind) return;
            const v = metric ? (parsedItem.specs[metric] || 0) : 0;
            if (v >= bestVal) { bestVal = v; best = $dataItems[rec.itemId]; }
        });
        return best ? itemName(best) : null;
    }

    // The rows the Control Panel prints in place of its party-stat placeholders.
    // Returns null when the deck has nothing in it, so the old text still shows
    // on a save from before the Hyperdeck existed.
    function summary() {
        const d = deck();
        if (!d || !d.placed.length) return null;
        const s = specs();
        const cpu = partNameFor('cpu', 'mhz');
        const gpu = partNameFor('gpu', 'vram');
        const modem = partNameFor('modem');
        const sound = partNameFor('sound');
        const hours = enduranceHours(s);
        return {
            processor: cpu ? cpu + ' (' + fmtMhz(s.mhz) + ')' : fmtMhz(s.mhz),
            memory: fmtRam(s.ram),
            // No adapter is not "no graphics": it is the processor doing it,
            // which is worth saying in the words a spec sheet would use.
            graphics: gpu ? gpu + ' (' + fmtMb(s.vram) + ')'
                : s.shared ? T('HyperDeck.value.integrated', { n: s.shared })
                    : T('HyperDeck.value.none'),
            storage: fmtStore(s.mb),
            // Everything below is the machine standing in for what the desktop
            // used to read off the party's own stats.
            index: performanceIndex(s),
            performance: T('HyperDeck.value.index', { n: performanceIndex(s) }),
            thermals: !s.kinds.cooling
                ? T('HyperDeck.value.passive', { n: s.draw })
                : T('HyperDeck.value.cooled', { n: s.kinds.cooling, w: s.draw }),
            endurance: hours
                ? T('HyperDeck.value.hours', { n: Math.round(hours * 10) / 10 })
                : T('HyperDeck.value.none'),
            uplink: modem || T('HyperDeck.value.none'),
            audio: sound || T('HyperDeck.value.beeper'),
            board: T('HyperDeck.unit.cells', { used: s.used, total: s.cells }),
            // Draw over supply, the same way round as the deck panel and the
            // firmware screen. It used to read capacity over draw, which put
            // two different quantities on either side of the slash.
            power: fmtMah(s.mah) + ', ' + fmtWatt(s.draw) + ' / ' + fmtWatt(s.supply)
        };
    }

    //=========================================================================
    // Building the board for the player
    //=========================================================================
    // Everything on the board goes back in the bag. Used when the case is
    // swapped, because a part fitted to one board is not fitted to another.
    function stripBoard() {
        const d = deck();
        if (!d) return 0;
        const n = d.placed.length;
        d.placed.forEach(rec => {
            const item = $dataItems[rec.itemId];
            if (item) $gameParty.gainItem(item, 1);
        });
        d.placed = [];
        return n;
    }

    function setCase(caseId) {
        const d = deck();
        if (!d || d.caseId === caseId) return false;
        stripBoard();
        d.caseId = caseId;
        return true;
    }

    function finish() { const d = deck(); return (d && d.finish) ? d.finish : ''; }
    function setFinish(name) { const d = deck(); if (d) d.finish = name || ''; }
    function face() { const d = deck(); return (d && d.face) ? d.face : 'keyboard'; }
    function setFace(name) { const d = deck(); if (d) d.face = name || 'keyboard'; }

    // How good a part is, for "fit me the best one I am carrying". The units do
    // not commute, which does not matter: this only ever ranks parts of the
    // same kind against each other.
    function rankPart(part) {
        const s = part.specs;
        if (s.ram === UNBOUNDED) return Infinity;
        return (s.mhz || 0) + (s.ram || 0) * 4 + (s.mb || 0) / 40
            + (s.vram || 0) * 12 + (s.mah || 0) / 8 + Math.max(0, -(s.watt || 0)) * 6;
    }

    // Fits as much of what the party is carrying as the board and the cell will
    // take. Ordered the way the factory builds one, and with the same running
    // cell budget: without it the panel, which is the biggest thing on any
    // board, kept arriving to find its room already spent.
    function autoFit() {
        if (!deck()) return 0;
        _packCorner = { right: false, bottom: false };
        const carried = {};
        inventoryParts().forEach(entry => {
            (carried[entry.data.kind] = carried[entry.data.kind] || []).push(entry.data);
        });
        const present = specs().kinds;
        const order = ['battery', 'display', 'cpu', 'storage', 'ram']
            .filter(kind => !present[kind] && (carried[kind] || []).length);

        let fitted = 0;
        order.forEach((kind, i) => {
            const reserve = order.slice(i + 1)
                .reduce((n, k) => n + minArea(carried[k]), 0);
            if (fitBestCarried(carried[kind], freeCells() - reserve, false)) fitted++;
        });
        ['gpu', 'cooling', 'sound', 'modem'].forEach(kind => {
            if (present[kind]) return;
            if (fitBestCarried(carried[kind], freeCells(), true)) fitted++;
        });
        return fitted + topUpPower();
    }

    // Cells go on last as well as first. Whatever the finished board draws, the
    // best cell still in the bag goes in beside the ones already fitted until
    // the machine can carry it, which is what "fit me everything" has to mean:
    // a board the party has the parts to power comes out powered.
    function topUpPower() {
        let added = 0;
        for (let guard = 0; guard < 12 && isOverdrawn(); guard++) {
            const cells = inventoryParts()
                .filter(entry => entry.data.kind === 'battery')
                .map(entry => entry.data);
            if (!cells.length) break;
            if (!fitBestCarried(cells, freeCells(), true)) break;
            added++;
        }
        return added;
    }

    // The best part of a kind the party is carrying that the board still has
    // room for and the cell can still carry. A required kind falls back to the
    // smallest one that will go in at all, because a poor panel beats no panel;
    // if that leaves the board overdrawn, topUpPower fits more cells after.
    function fitBestCarried(pool, budget, optional) {
        if (!pool || !pool.length) return false;
        const owned = pool.filter(part => {
            const item = $dataItems[part.id];
            return item && $gameParty.numItems(item) > 0;
        });
        if (!owned.length) return false;

        let candidates = owned.filter(part => areaOf(part) <= Math.max(1, budget));
        if (!candidates.length) {
            if (optional) return false;
            const smallest = minArea(owned);
            candidates = owned.filter(part => areaOf(part) === smallest);
        }
        candidates = candidates.slice().sort((a, b) => rankPart(b) - rankPart(a));
        for (const part of candidates) {
            if (powerFits(part) && fitSomewhere(part.id, Math.random, true)) return true;
        }
        if (optional) return false;
        for (const part of candidates) {
            if (fitSomewhere(part.id, Math.random, true)) return true;
        }
        return false;
    }

    // What a BIOS setup screen would have to tell you. One line per fault, in
    // the order a machine would find them.
    function faults() {
        const out = [];
        const s = specs();
        missingKinds().forEach(kind => {
            out.push({ key: 'missing', kind: kind, text: T('HyperDeck.fault.missing', { kind: kindLabel(kind) }) });
        });
        if (s.draw > s.supply) {
            out.push({ key: 'power', text: T('HyperDeck.fault.power', { n: s.draw - s.supply }) });
        }
        if (!s.kinds.cooling && s.draw >= 30) {
            out.push({ key: 'heat', text: T('HyperDeck.fault.heat', { n: s.draw }) });
        }
        if (!s.kinds.modem) out.push({ key: 'uplink', text: T('HyperDeck.fault.uplink') });
        // Not a fault, a notice: the machine runs on the processor's own video
        // and says how much memory that costs it.
        if (!s.kinds.gpu && s.kinds.cpu) {
            out.push({ key: 'video', text: T('HyperDeck.fault.integrated', { n: s.shared }) });
        }
        if (s.ram !== Infinity && s.ram && s.ram < 64) {
            out.push({ key: 'memory', text: T('HyperDeck.fault.memory', { n: s.ram }) });
        }
        return out;
    }

    //=========================================================================
    // The chip lab
    //=========================================================================
    // A workbench for drawing your own logic and having it etched onto a die.
    // The rules are the ones everybody already knows from redstone: wire that
    // carries a signal and loses a step of it every cell, torches that invert
    // whatever is behind them, repeaters that restore the signal and delay it,
    // and bridges so two wires can cross without touching.
    //
    // That set is universal on its own. A torch is a NOT; a torch reading two
    // wires is a NOR; NOR builds every other gate; two NORs cross-coupled are a
    // latch, which is a bit of memory; a torch fed by its own output is a
    // clock. Gates, memory and a clock is a machine, so anything that fits on
    // the board can be built here. The named gate tiles are a convenience on
    // top of that, not a different kind of thing.
    //
    // The grid is 512 by 512 and the tiles are stored sparsely, so an empty lab
    // costs nothing and a drawn one costs what was drawn.
    const CHIP_GRID = 512;

    // i18n-ignore-start  tile ids and gate ids, labels come from HyperDeck.chip.*
    const CT = {
        WIRE: 1, SOURCE: 2, TORCH: 3, REPEATER: 4, GATE: 5,
        BRIDGE: 6, IN: 7, OUT: 8, CLOCK: 9, LAMP: 10,
        // Not a tile so much as a part: covers a block of cells and brings its
        // own pins out to the ones around it.
        CHIP: 11
    };
    const GATE_KINDS = ['and', 'or', 'xor', 'nand', 'nor', 'xnor', 'not'];
    const GATE_GLYPH = {
        and: '&', or: '|', xor: '^', nand: '&!', nor: '|!', xnor: '^!', not: '!'
    };
    // i18n-ignore-end

    // North, east, south, west. Everything directional is one of these.
    const CD = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const opposite = d => (d + 2) % 4;

    // What a die costs and what it comes out as. Salvaged steel and nothing
    // else: this is scrap work, and it is meant to be the cheapest way into a
    // processor there is.
    const CHIP_SCRAP_ITEM = 863;
    const CHIP_TILES_PER_SCRAP = 96;
    const CHIP_MAX_PINS = 8;
    // Where the fabricated dies live. Above the database on purpose: the items
    // are built at run time from what the player drew, never shipped in it.
    const CHIP_DIE_BASE = 1900;
    const CHIP_DIE_SLOTS = 32;

    const inGrid = (x, y) => x >= 0 && y >= 0 && x < CHIP_GRID && y < CHIP_GRID;
    const cellKey = (x, y) => y * CHIP_GRID + x;
    const cellX = k => k % CHIP_GRID;
    const cellY = k => Math.floor(k / CHIP_GRID);

    // The bench, kept on the system so a half drawn circuit survives a save.
    function chipLab() {
        if (!$gameSystem) return null;
        if (!$gameSystem._hyperChipLab) {
            $gameSystem._hyperChipLab = {
                tiles: {},          // cellKey -> { t, d, v }
                inputs: [0, 0, 0, 0, 0, 0, 0, 0],
                view: { x: CHIP_GRID / 2, y: CHIP_GRID / 2, zoom: 22 },
                tool: CT.WIRE, dir: 1, variant: 0, speed: 4
            };
        }
        return $gameSystem._hyperChipLab;
    }

    function chipTiles() { const l = chipLab(); return l ? l.tiles : {}; }

    function chipTileCount() { return Object.keys(chipTiles()).length; }

    // What counts as logic when the die is priced and specified. Wire and
    // bridges are plumbing; these are the parts that do something.
    function chipGateCount() {
        const tiles = chipTiles();
        let n = 0;
        Object.keys(tiles).forEach(k => {
            const t = tiles[k].t;
            if (t === CT.GATE || t === CT.TORCH || t === CT.REPEATER || t === CT.CLOCK) n++;
            // A whole processor is not one gate. Counted on the anchor only, so
            // the forty cells it covers are not counted forty times.
            else if (t === CT.CHIP && !tiles[k].ox && !tiles[k].oy) n += 96;
        });
        return n;
    }

    function chipScrapCost() {
        return Math.max(1, Math.ceil(chipTileCount() / CHIP_TILES_PER_SCRAP));
    }

    //-------------------------------------------------------------------------
    // The simulation
    //-------------------------------------------------------------------------
    // One tick is read, commit, propagate. Every active tile works out its next
    // output from the field as it stands, they all change together, and only
    // then does the signal spread again. Updating them together is what makes a
    // torch wired back to itself oscillate instead of settling.
    class ChipSim {
        constructor(lab) {
            this.lab = lab;
            this.out = {};
            this.timer = {};
            this.field = {};
            this.emit = {};
            this.tick = 0;
            this.rebuild();
        }

        tileAt(k) { return this.lab.tiles[k] || null; }

        // One core per package on the grid, built the first time it is wanted
        // and thrown away with the simulation. A megabyte of memory is not
        // something to put in a savefile.
        chipRuntime(anchor) {
            if (!this.chips) this.chips = {};
            if (!this.chips[anchor]) {
                const tile = this.tileAt(anchor);
                const cpu = loadChipRom(new CPU8066(), tile ? tile.v : 0);
                this.chips[anchor] = { cpu: cpu, rom: tile ? tile.v : 0, clk: false, nmi: false };
            }
            return this.chips[anchor];
        }

        // Every package on the board, by anchor cell.
        chipAnchors() {
            const tiles = this.lab.tiles;
            const out = [];
            Object.keys(tiles).forEach(sk => {
                const t = tiles[sk];
                if (t.t === CT.CHIP && !t.ox && !t.oy) out.push(+sk);
            });
            return out;
        }

        // A pin reads high from a wire carrying a signal, or from a tile sitting
        // right on the pin cell that makes one: a clock or a source wired
        // straight onto a pin is the ordinary way to drive it.
        readPinCell(k) {
            if (k < 0) return false;
            if (!this.tileAt(k)) return false;
            if (this.emit[k]) return true;
            return (this.field[k * 2] || 0) > 0 || (this.field[k * 2 + 1] || 0) > 0;
        }

        pin(anchor, name) {
            for (let i = 1; i <= 40; i++) {
                if (PINS_8066[i] && PINS_8066[i].n === name) {
                    return this.readPinCell(chipPinCell(anchor, i));
                }
            }
            return false;
        }

        stepKey(k, d) {
            const x = cellX(k) + CD[d][0];
            const y = cellY(k) + CD[d][1];
            return inGrid(x, y) ? cellKey(x, y) : -1;
        }

        // Which directions a tile is pushing a signal into right now.
        emitMask(k, tile) {
            switch (tile.t) {
                case CT.SOURCE: return 15;
                case CT.IN: return this.lab.inputs[tile.v] ? 15 : 0;
                case CT.CLOCK: return this.out[k] ? 15 : 0;
                // A torch feeds everything except the thing it is standing on,
                // which is what lets its own output be wired back to its input.
                case CT.TORCH: return this.out[k] ? (15 & ~(1 << opposite(tile.d))) : 0;
                case CT.REPEATER:
                case CT.GATE: return this.out[k] ? (1 << tile.d) : 0;
                default: return 0;
            }
        }

        // Is the neighbour in direction `d` pushing power back this way, or is
        // it a wire that is carrying some?
        readFrom(k, d) {
            const n = this.stepKey(k, d);
            if (n < 0) return false;
            const tile = this.tileAt(n);
            if (!tile) return false;
            if ((this.emit[n] || 0) & (1 << opposite(d))) return true;
            if (tile.t === CT.WIRE) return (this.field[n * 2] || 0) > 0;
            // A bridge carries the two axes separately, which is the whole
            // point of it: read the one the signal would be travelling on.
            if (tile.t === CT.BRIDGE) return (this.field[n * 2 + (d % 2 === 0 ? 1 : 0)] || 0) > 0;
            return false;
        }

        // Redstone's own rule: the signal starts at fifteen and drops a step per
        // cell of wire, so a run has a length and a repeater has a job.
        rebuild() {
            const tiles = this.lab.tiles;
            this.emit = {};
            this.field = {};
            const queue = [];

            const seed = (target, travelDir, strength) => {
                const tile = tiles[target];
                if (!tile) return;
                const channel = (tile.t === CT.BRIDGE && travelDir % 2 === 0) ? 1 : 0;
                const key = target * 2 + channel;
                if ((this.field[key] || 0) >= strength) return;
                this.field[key] = strength;
                if (tile.t === CT.WIRE || tile.t === CT.BRIDGE) {
                    queue.push([target, channel, strength]);
                }
            };

            Object.keys(tiles).forEach(sk => {
                const k = +sk;
                const mask = this.emitMask(k, tiles[k]);
                if (!mask) return;
                this.emit[k] = mask;
                for (let d = 0; d < 4; d++) {
                    if (!(mask & (1 << d))) continue;
                    const n = this.stepKey(k, d);
                    if (n >= 0) seed(n, d, 15);
                }
            });

            // A package drives its own pin cells directly rather than through a
            // neighbour, because a pin is not next to the chip in the way one
            // tile is next to another: it is part of it.
            this.chipAnchors().forEach(anchor => {
                const run = this.chips && this.chips[anchor];
                if (!run) return;
                const levels = chipPinLevels(run.cpu);
                for (let pin = 1; pin <= 40; pin++) {
                    if (!levels[pin]) continue;
                    const cell = chipPinCell(anchor, pin);
                    if (cell < 0 || !tiles[cell]) continue;
                    this.emit[cell] = 15;
                    seed(cell, 0, 15);
                }
            });

            for (let head = 0; head < queue.length; head++) {
                const [k, channel, strength] = queue[head];
                if (strength <= 1) continue;
                if ((this.field[k * 2 + channel] || 0) > strength) continue;
                const bridge = tiles[k].t === CT.BRIDGE;
                for (let d = 0; d < 4; d++) {
                    // A bridge only carries on down the axis the signal came
                    // in on, which is how two wires cross without meeting.
                    if (bridge && (d % 2 === 0 ? 1 : 0) !== channel) continue;
                    const n = this.stepKey(k, d);
                    if (n >= 0) seed(n, d, strength - 1);
                }
            }
        }

        gateOut(kind, a, b) {
            switch (kind) {
                case 'and': return a && b;
                case 'or': return a || b;
                case 'xor': return a !== b;
                case 'nand': return !(a && b);
                case 'nor': return !(a || b);
                case 'xnor': return a === b;
                default: return !a;
            }
        }

        step() {
            const tiles = this.lab.tiles;
            const next = {};
            const timers = {};

            Object.keys(tiles).forEach(sk => {
                const k = +sk;
                const tile = tiles[k];
                switch (tile.t) {
                    case CT.TORCH:
                        next[k] = !this.readFrom(k, opposite(tile.d));
                        break;
                    case CT.REPEATER: {
                        // The delay is a countdown, so a repeater set to four
                        // holds a change for four ticks before passing it on.
                        const want = this.readFrom(k, opposite(tile.d));
                        const held = !!this.out[k];
                        if (want === held) { timers[k] = 0; next[k] = held; break; }
                        const t = (this.timer[k] || 0) + 1;
                        if (t >= Math.max(1, tile.v + 1)) { next[k] = want; timers[k] = 0; }
                        else { next[k] = held; timers[k] = t; }
                        break;
                    }
                    case CT.GATE: {
                        const kind = GATE_KINDS[tile.v] || 'not';
                        if (kind === 'not') {
                            next[k] = !this.readFrom(k, opposite(tile.d));
                        } else {
                            next[k] = this.gateOut(kind,
                                this.readFrom(k, (tile.d + 3) % 4),
                                this.readFrom(k, (tile.d + 1) % 4));
                        }
                        break;
                    }
                    case CT.CLOCK: {
                        const t = (this.timer[k] || 0) + 1;
                        const period = Math.max(1, tile.v + 1);
                        if (t >= period) { next[k] = !this.out[k]; timers[k] = 0; }
                        else { next[k] = !!this.out[k]; timers[k] = t; }
                        break;
                    }
                    default: break;
                }
            });

            this.out = next;
            this.timer = timers;
            this.runChips();
            this.rebuild();
            this.tick++;
        }

        // A package only runs when its Vcc pin is high, which makes wiring the
        // supply the first thing anybody has to get right. RESET holds it in
        // reset the way the real pin does. If CLK is wired the core steps on the
        // rising edge of it; with nothing on CLK it free runs a step a tick, so
        // a package dropped on a bare board still does something.
        runChips() {
            this.chipAnchors().forEach(anchor => {
                const tile = this.tileAt(anchor);
                const run = this.chipRuntime(anchor);
                // The mask ROM was changed under it: start the part again.
                if (tile && run.rom !== tile.v) {
                    loadChipRom(run.cpu, tile.v);
                    run.rom = tile.v;
                }
                if (!this.pin(anchor, 'Vcc')) return;
                if (this.pin(anchor, 'RESET')) {
                    loadChipRom(run.cpu, run.rom);
                    return;
                }
                const nmi = this.pin(anchor, 'NMI');
                if (nmi && !run.nmi) run.cpu.intPending = 2;
                run.nmi = nmi;
                if (this.pin(anchor, 'INTR')) run.cpu.intPending = 8;

                const clkCell = chipPinCell(anchor, 19);
                const clocked = clkCell >= 0 && !!this.tileAt(clkCell);
                if (!clocked) { run.cpu.step(); return; }
                const clk = this.readPinCell(clkCell);
                if (clk && !run.clk) run.cpu.step();
                run.clk = clk;
            });
        }

        // A tile is lit when it is carrying or making a signal, which is all the
        // editor needs to colour it in.
        litness(k, tile) {
            if (tile.t === CT.WIRE) return (this.field[k * 2] || 0) / 15;
            if (tile.t === CT.BRIDGE) {
                return Math.max(this.field[k * 2] || 0, this.field[k * 2 + 1] || 0) / 15;
            }
            if (tile.t === CT.SOURCE) return 1;
            if (tile.t === CT.IN) return this.lab.inputs[tile.v] ? 1 : 0;
            if (tile.t === CT.OUT || tile.t === CT.LAMP) {
                for (let d = 0; d < 4; d++) if (this.readFrom(k, d)) return 1;
                return 0;
            }
            return this.out[k] ? 1 : 0;
        }

        // What the pins are reading, which is the closest thing the lab has to
        // an answer coming out of the circuit.
        outputs() {
            const tiles = this.lab.tiles;
            const pins = new Array(CHIP_MAX_PINS).fill(0);
            Object.keys(tiles).forEach(sk => {
                const k = +sk;
                if (tiles[k].t !== CT.OUT) return;
                if (this.litness(k, tiles[k])) pins[tiles[k].v] = 1;
            });
            return pins;
        }
    }

    //-------------------------------------------------------------------------
    // The 8066
    //-------------------------------------------------------------------------
    // A sixteen bit processor in a forty pin package, and the one part of the
    // chip lab that is not built out of the lab's own tiles: it is a real core
    // with real registers running real machine code, sat in the grid with its
    // whole pinout brought out to the cells around it.
    //
    // The instruction set is the standard one: every addressing mode, the eight
    // arithmetic and logic groups, the string instructions with their repeat
    // prefixes, the shifts and rotates, multiply and divide signed and not, the
    // whole jump table, calls, interrupts, the decimal adjustments and port I/O.
    // Port writes come out on the pins, so the circuit around it can watch what
    // it is doing.
    //
    // i18n-ignore-start  register names, mnemonics and pin names are not prose

    // 1 MB, which is everything twenty address lines can reach.
    const CPU_MEM_SIZE = 1 << 20;

    // Register file order is the encoding order, so a ModRM field indexes it
    // directly: AX CX DX BX SP BP SI DI, and ES CS SS DS for the segments.
    const REG16 = ['AX', 'CX', 'DX', 'BX', 'SP', 'BP', 'SI', 'DI'];
    const REG8 = ['AL', 'CL', 'DL', 'BL', 'AH', 'CH', 'DH', 'BH'];
    const SEGREG = ['ES', 'CS', 'SS', 'DS'];

    const F_CF = 0x0001, F_PF = 0x0004, F_AF = 0x0010, F_ZF = 0x0040;
    const F_SF = 0x0080, F_TF = 0x0100, F_IF = 0x0200, F_DF = 0x0400;
    const F_OF = 0x0800;

    const PARITY = (() => {
        const t = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            let n = 0, v = i;
            while (v) { n ^= v & 1; v >>= 1; }
            t[i] = n ? 0 : 1;          // 8086 parity is EVEN parity of the low byte
        }
        return t;
    })();

    class CPU8066 {
        constructor() {
            this.mem = new Uint8Array(CPU_MEM_SIZE);
            this.r = new Uint16Array(8);
            this.s = new Uint16Array(4);
            this.reset();
        }

        reset() {
            this.r.fill(0);
            this.s.fill(0);
            this.s[1] = 0xFFFF;        // CS
            this.ip = 0x0000;
            this.flags = 0xF002;       // the bits an 8086 always reads back as 1
            this.halted = false;
            this.segOverride = -1;
            this.repPrefix = 0;
            this.cycles = 0;
            this.instr = 0;
            // What the bus last did, which is what the pins show.
            this.bus = { addr: 0, data: 0, rd: 0, wr: 0, io: 0, ale: 0 };
            this.ports = new Uint16Array(256);
            this.intPending = -1;
        }

        //--- memory ----------------------------------------------------------
        phys(seg, off) { return ((seg << 4) + (off & 0xFFFF)) & 0xFFFFF; }

        rd8(a) { return this.mem[a & 0xFFFFF]; }
        wr8(a, v) { this.mem[a & 0xFFFFF] = v & 0xFF; }
        rd16(a) { return this.rd8(a) | (this.rd8(a + 1) << 8); }
        wr16(a, v) { this.wr8(a, v & 0xFF); this.wr8(a + 1, (v >> 8) & 0xFF); }

        // Every access the core makes goes through here, so the pins always
        // show the last thing that actually happened on the bus.
        mark(addr, data, rd, wr, io) {
            this.bus.addr = addr & 0xFFFFF;
            this.bus.data = data & 0xFFFF;
            this.bus.rd = rd; this.bus.wr = wr; this.bus.io = io; this.bus.ale = 1;
        }

        memRead(seg, off, wide) {
            const a = this.phys(seg, off);
            const v = wide ? this.rd16(a) : this.rd8(a);
            this.mark(a, v, 1, 0, 0);
            return v;
        }

        memWrite(seg, off, v, wide) {
            const a = this.phys(seg, off);
            if (wide) this.wr16(a, v); else this.wr8(a, v);
            this.mark(a, v, 0, 1, 0);
        }

        //--- fetch -----------------------------------------------------------
        fetch8() {
            const a = this.phys(this.s[1], this.ip);
            const v = this.rd8(a);
            // A fetch is a bus cycle like any other, and marking it is what
            // makes the address lines move while the part is running.
            this.mark(a, v, 1, 0, 0);
            this.ip = (this.ip + 1) & 0xFFFF;
            return v;
        }
        fetch16() { const lo = this.fetch8(); return lo | (this.fetch8() << 8); }
        fetchS8() { const v = this.fetch8(); return v < 0x80 ? v : v - 0x100; }

        //--- registers -------------------------------------------------------
        get8(i) {
            return i < 4 ? (this.r[i] & 0xFF) : ((this.r[i - 4] >> 8) & 0xFF);
        }
        set8(i, v) {
            v &= 0xFF;
            if (i < 4) this.r[i] = (this.r[i] & 0xFF00) | v;
            else this.r[i - 4] = (this.r[i - 4] & 0x00FF) | (v << 8);
        }
        get16(i) { return this.r[i]; }
        set16(i, v) { this.r[i] = v & 0xFFFF; }

        //--- flags -----------------------------------------------------------
        f(bit) { return (this.flags & bit) !== 0; }
        setF(bit, on) { if (on) this.flags |= bit; else this.flags &= ~bit; }

        szp(v, wide) {
            const mask = wide ? 0xFFFF : 0xFF;
            v &= mask;
            this.setF(F_ZF, v === 0);
            this.setF(F_SF, (v & (wide ? 0x8000 : 0x80)) !== 0);
            this.setF(F_PF, PARITY[v & 0xFF] === 1);
        }

        addFlags(a, b, r, wide, carryIn) {
            const mask = wide ? 0xFFFF : 0xFF;
            const sign = wide ? 0x8000 : 0x80;
            this.setF(F_CF, r > mask);
            this.setF(F_AF, (((a ^ b ^ r) & 0x10) !== 0));
            this.setF(F_OF, (((a ^ r) & (b ^ r) & sign) !== 0));
            this.szp(r, wide);
            return r & mask;
        }

        subFlags(a, b, r, wide) {
            const mask = wide ? 0xFFFF : 0xFF;
            const sign = wide ? 0x8000 : 0x80;
            this.setF(F_CF, (r & ~mask) !== 0 || r < 0);
            this.setF(F_AF, (((a ^ b ^ r) & 0x10) !== 0));
            this.setF(F_OF, (((a ^ b) & (a ^ r) & sign) !== 0));
            this.szp(r & mask, wide);
            return r & mask;
        }

        logicFlags(r, wide) {
            this.setF(F_CF, false);
            this.setF(F_OF, false);
            this.setF(F_AF, false);
            this.szp(r, wide);
            return r & (wide ? 0xFFFF : 0xFF);
        }

        //--- addressing ------------------------------------------------------
        segFor(defSeg) {
            return this.segOverride >= 0 ? this.s[this.segOverride] : this.s[defSeg];
        }

        // Decodes a ModRM byte into either a register index or a segment and
        // offset, which is everything the rest of the decoder needs to know.
        modrm() {
            const m = this.fetch8();
            const mod = m >> 6, reg = (m >> 3) & 7, rm = m & 7;
            const out = { mod: mod, reg: reg, rm: rm, isReg: mod === 3 };
            if (out.isReg) return out;
            let off = 0, defSeg = 3;     // DS unless BP is in the sum
            switch (rm) {
                case 0: off = this.r[3] + this.r[6]; break;             // BX+SI
                case 1: off = this.r[3] + this.r[7]; break;             // BX+DI
                case 2: off = this.r[5] + this.r[6]; defSeg = 2; break; // BP+SI
                case 3: off = this.r[5] + this.r[7]; defSeg = 2; break; // BP+DI
                case 4: off = this.r[6]; break;                         // SI
                case 5: off = this.r[7]; break;                         // DI
                case 6:
                    if (mod === 0) { off = this.fetch16(); }             // direct
                    else { off = this.r[5]; defSeg = 2; }                // BP
                    break;
                case 7: off = this.r[3]; break;                         // BX
            }
            if (mod === 1) off += this.fetchS8();
            else if (mod === 2) off += this.fetch16();
            out.off = off & 0xFFFF;
            out.seg = this.segFor(defSeg);
            return out;
        }

        readRM(m, wide) {
            if (m.isReg) return wide ? this.get16(m.rm) : this.get8(m.rm);
            return this.memRead(m.seg, m.off, wide);
        }
        writeRM(m, v, wide) {
            if (m.isReg) { if (wide) this.set16(m.rm, v); else this.set8(m.rm, v); return; }
            this.memWrite(m.seg, m.off, v, wide);
        }

        //--- stack -----------------------------------------------------------
        push(v) {
            this.r[4] = (this.r[4] - 2) & 0xFFFF;
            this.memWrite(this.s[2], this.r[4], v, true);
        }
        pop() {
            const v = this.memRead(this.s[2], this.r[4], true);
            this.r[4] = (this.r[4] + 2) & 0xFFFF;
            return v;
        }

        //--- interrupts ------------------------------------------------------
        interrupt(n) {
            this.push(this.flags);
            this.setF(F_IF, false);
            this.setF(F_TF, false);
            this.push(this.s[1]);
            this.push(this.ip);
            this.ip = this.rd16(n * 4);
            this.s[1] = this.rd16(n * 4 + 2);
            this.halted = false;
        }

        //--- ports -----------------------------------------------------------
        portIn(p, wide) {
            const v = this.ports[p & 0xFF];
            this.mark(p & 0xFFFF, v, 1, 0, 1);
            return wide ? v : (v & 0xFF);
        }
        portOut(p, v, wide) {
            this.ports[p & 0xFF] = wide ? (v & 0xFFFF) : (v & 0xFF);
            this.mark(p & 0xFFFF, v, 0, 1, 1);
        }

        //--- arithmetic groups ------------------------------------------------
        alu(op, a, b, wide) {
            const mask = wide ? 0xFFFF : 0xFF;
            let r;
            switch (op) {
                case 0: r = a + b; return this.addFlags(a, b, r, wide);
                case 1: return this.logicFlags(a | b, wide);
                case 2: r = a + b + (this.f(F_CF) ? 1 : 0); return this.addFlags(a, b, r, wide);
                case 3: r = a - b - (this.f(F_CF) ? 1 : 0); return this.subFlags(a, b, r, wide);
                case 4: return this.logicFlags(a & b, wide);
                case 5: r = a - b; return this.subFlags(a, b, r, wide);
                case 6: return this.logicFlags(a ^ b, wide);
                default: r = a - b; this.subFlags(a, b, r, wide); return a & mask;  // CMP
            }
        }

        incdec(v, wide, dec) {
            const cf = this.f(F_CF);                 // INC and DEC leave CF alone
            const r = dec ? this.subFlags(v, 1, v - 1, wide)
                : this.addFlags(v, 1, v + 1, wide);
            this.setF(F_CF, cf);
            return r;
        }

        shift(op, v, count, wide) {
            const bits = wide ? 16 : 8;
            const mask = wide ? 0xFFFF : 0xFF;
            const sign = wide ? 0x8000 : 0x80;
            count &= 0x1F;                            // the 8086 uses all five bits
            if (!count) return v & mask;
            let cf = this.f(F_CF) ? 1 : 0;
            let r = v & mask;
            for (let i = 0; i < count; i++) {
                switch (op) {
                    case 0: cf = (r & sign) ? 1 : 0; r = ((r << 1) | cf) & mask; break;   // ROL
                    case 1: cf = r & 1; r = ((r >> 1) | (cf ? sign : 0)) & mask; break;   // ROR
                    case 2: { const n = (r & sign) ? 1 : 0; r = ((r << 1) | cf) & mask; cf = n; break; } // RCL
                    case 3: { const n = r & 1; r = ((r >> 1) | (cf ? sign : 0)) & mask; cf = n; break; } // RCR
                    case 4:
                    case 6: cf = (r & sign) ? 1 : 0; r = (r << 1) & mask; break;          // SHL/SAL
                    case 5: cf = r & 1; r = (r >> 1) & mask; break;                       // SHR
                    case 7: cf = r & 1; r = ((r >> 1) | (r & sign)) & mask; break;        // SAR
                }
            }
            this.setF(F_CF, !!cf);
            if (op < 4) {
                this.setF(F_OF, ((r & sign) !== 0) !== !!cf);
            } else {
                this.szp(r, wide);
                this.setF(F_OF, op === 5 ? ((v & sign) !== 0) : (((r & sign) !== 0) !== !!cf));
            }
            return r;
        }

        //--- string instructions ---------------------------------------------
        strStep(wide) { return (this.f(F_DF) ? -1 : 1) * (wide ? 2 : 1); }

        doString(op, wide) {
            const step = this.strStep(wide);
            const dsSeg = this.segOverride >= 0 ? this.s[this.segOverride] : this.s[3];
            switch (op) {
                case 0xA4: case 0xA5:   // MOVS
                    this.memWrite(this.s[0], this.r[7],
                        this.memRead(dsSeg, this.r[6], wide), wide);
                    this.r[6] = (this.r[6] + step) & 0xFFFF;
                    this.r[7] = (this.r[7] + step) & 0xFFFF;
                    break;
                case 0xA6: case 0xA7: { // CMPS
                    const a = this.memRead(dsSeg, this.r[6], wide);
                    const b = this.memRead(this.s[0], this.r[7], wide);
                    this.subFlags(a, b, a - b, wide);
                    this.r[6] = (this.r[6] + step) & 0xFFFF;
                    this.r[7] = (this.r[7] + step) & 0xFFFF;
                    break;
                }
                case 0xAA: case 0xAB:   // STOS
                    this.memWrite(this.s[0], this.r[7],
                        wide ? this.r[0] : this.get8(0), wide);
                    this.r[7] = (this.r[7] + step) & 0xFFFF;
                    break;
                case 0xAC: case 0xAD:   // LODS
                    if (wide) this.r[0] = this.memRead(dsSeg, this.r[6], true);
                    else this.set8(0, this.memRead(dsSeg, this.r[6], false));
                    this.r[6] = (this.r[6] + step) & 0xFFFF;
                    break;
                case 0xAE: case 0xAF: { // SCAS
                    const a = wide ? this.r[0] : this.get8(0);
                    const b = this.memRead(this.s[0], this.r[7], wide);
                    this.subFlags(a, b, a - b, wide);
                    this.r[7] = (this.r[7] + step) & 0xFFFF;
                    break;
                }
            }
        }

        //--- one instruction --------------------------------------------------
        step() {
            if (this.halted) {
                if (this.intPending >= 0) { const n = this.intPending; this.intPending = -1; this.interrupt(n); }
                return;
            }
            if (this.intPending >= 0 && this.f(F_IF)) {
                const n = this.intPending; this.intPending = -1; this.interrupt(n);
            }
            this.segOverride = -1;
            this.repPrefix = 0;
            const startIP = this.ip;
            let op = this.fetch8();

            // Prefixes. A real 8086 lets them stack, so this loop does too.
            let guard = 0;
            while (guard++ < 8) {
                if (op === 0x26) { this.segOverride = 0; op = this.fetch8(); continue; }
                if (op === 0x2E) { this.segOverride = 1; op = this.fetch8(); continue; }
                if (op === 0x36) { this.segOverride = 2; op = this.fetch8(); continue; }
                if (op === 0x3E) { this.segOverride = 3; op = this.fetch8(); continue; }
                if (op === 0xF0) { op = this.fetch8(); continue; }          // LOCK
                if (op === 0xF2) { this.repPrefix = 0xF2; op = this.fetch8(); continue; }
                if (op === 0xF3) { this.repPrefix = 0xF3; op = this.fetch8(); continue; }
                break;
            }
            this.exec(op, startIP);
            this.instr++;
        }

        exec(op, startIP) {
            const wide = (op & 1) !== 0;

            // 00-3F: the eight ALU groups, in their regular four-form pattern.
            if (op < 0x40 && (op & 7) < 6 && (op & 0x07) !== 6 && (op & 0x07) !== 7) {
                const grp = (op >> 3) & 7;
                const form = op & 7;
                if (form === 0 || form === 1) {          // r/m, reg
                    const m = this.modrm();
                    const a = this.readRM(m, wide);
                    const b = wide ? this.get16(m.reg) : this.get8(m.reg);
                    const r = this.alu(grp, a, b, wide);
                    if (grp !== 7) this.writeRM(m, r, wide);
                    return;
                }
                if (form === 2 || form === 3) {          // reg, r/m
                    const m = this.modrm();
                    const a = wide ? this.get16(m.reg) : this.get8(m.reg);
                    const b = this.readRM(m, wide);
                    const r = this.alu(grp, a, b, wide);
                    if (grp !== 7) { if (wide) this.set16(m.reg, r); else this.set8(m.reg, r); }
                    return;
                }
                // form 4/5: accumulator, immediate
                const b = wide ? this.fetch16() : this.fetch8();
                const a = wide ? this.r[0] : this.get8(0);
                const r = this.alu(grp, a, b, wide);
                if (grp !== 7) { if (wide) this.r[0] = r; else this.set8(0, r); }
                return;
            }

            switch (op) {
                // --- segment pushes and pops ---------------------------------
                case 0x06: this.push(this.s[0]); return;
                case 0x07: this.s[0] = this.pop(); return;
                case 0x0E: this.push(this.s[1]); return;
                case 0x0F: this.s[1] = this.pop(); return;
                case 0x16: this.push(this.s[2]); return;
                case 0x17: this.s[2] = this.pop(); return;
                case 0x1E: this.push(this.s[3]); return;
                case 0x1F: this.s[3] = this.pop(); return;

                // --- decimal adjustments -------------------------------------
                case 0x27: {                                  // DAA
                    const al = this.get8(0);
                    let r = al;
                    if ((al & 0x0F) > 9 || this.f(F_AF)) { r += 6; this.setF(F_AF, true); }
                    else this.setF(F_AF, false);
                    if (al > 0x99 || this.f(F_CF)) { r += 0x60; this.setF(F_CF, true); }
                    else this.setF(F_CF, false);
                    this.set8(0, r); this.szp(r & 0xFF, false);
                    return;
                }
                case 0x2F: {                                  // DAS
                    const al = this.get8(0);
                    let r = al;
                    if ((al & 0x0F) > 9 || this.f(F_AF)) { r -= 6; this.setF(F_AF, true); }
                    else this.setF(F_AF, false);
                    if (al > 0x99 || this.f(F_CF)) { r -= 0x60; this.setF(F_CF, true); }
                    else this.setF(F_CF, false);
                    this.set8(0, r); this.szp(r & 0xFF, false);
                    return;
                }
                case 0x37: {                                  // AAA
                    if ((this.get8(0) & 0x0F) > 9 || this.f(F_AF)) {
                        this.set8(0, this.get8(0) + 6);
                        this.set8(4, this.get8(4) + 1);
                        this.setF(F_AF, true); this.setF(F_CF, true);
                    } else { this.setF(F_AF, false); this.setF(F_CF, false); }
                    this.set8(0, this.get8(0) & 0x0F);
                    return;
                }
                case 0x3F: {                                  // AAS
                    if ((this.get8(0) & 0x0F) > 9 || this.f(F_AF)) {
                        this.set8(0, this.get8(0) - 6);
                        this.set8(4, this.get8(4) - 1);
                        this.setF(F_AF, true); this.setF(F_CF, true);
                    } else { this.setF(F_AF, false); this.setF(F_CF, false); }
                    this.set8(0, this.get8(0) & 0x0F);
                    return;
                }

                // --- INC/DEC/PUSH/POP on a register --------------------------
                case 0x40: case 0x41: case 0x42: case 0x43:
                case 0x44: case 0x45: case 0x46: case 0x47:
                    this.set16(op & 7, this.incdec(this.get16(op & 7), true, false)); return;
                case 0x48: case 0x49: case 0x4A: case 0x4B:
                case 0x4C: case 0x4D: case 0x4E: case 0x4F:
                    this.set16(op & 7, this.incdec(this.get16(op & 7), true, true)); return;
                case 0x50: case 0x51: case 0x52: case 0x53:
                case 0x54: case 0x55: case 0x56: case 0x57:
                    this.push(this.get16(op & 7)); return;
                case 0x58: case 0x59: case 0x5A: case 0x5B:
                case 0x5C: case 0x5D: case 0x5E: case 0x5F:
                    this.set16(op & 7, this.pop()); return;

                // --- the conditional jumps -----------------------------------
                case 0x70: case 0x71: case 0x72: case 0x73:
                case 0x74: case 0x75: case 0x76: case 0x77:
                case 0x78: case 0x79: case 0x7A: case 0x7B:
                case 0x7C: case 0x7D: case 0x7E: case 0x7F: {
                    const d = this.fetchS8();
                    if (this.cond(op & 0x0F)) this.ip = (this.ip + d) & 0xFFFF;
                    return;
                }

                // --- immediate group ------------------------------------------
                case 0x80: case 0x81: case 0x82: case 0x83: {
                    const m = this.modrm();
                    const w = (op & 1) !== 0;
                    const a = this.readRM(m, w);
                    let b;
                    if (op === 0x81) b = this.fetch16();
                    else if (op === 0x83) b = this.fetchS8() & 0xFFFF;
                    else b = this.fetch8();
                    const r = this.alu(m.reg, a, b, w);
                    if (m.reg !== 7) this.writeRM(m, r, w);
                    return;
                }

                case 0x84: case 0x85: {                       // TEST r/m, reg
                    const m = this.modrm();
                    const a = this.readRM(m, wide);
                    const b = wide ? this.get16(m.reg) : this.get8(m.reg);
                    this.logicFlags(a & b, wide);
                    return;
                }
                case 0x86: case 0x87: {                       // XCHG r/m, reg
                    const m = this.modrm();
                    const a = this.readRM(m, wide);
                    const b = wide ? this.get16(m.reg) : this.get8(m.reg);
                    this.writeRM(m, b, wide);
                    if (wide) this.set16(m.reg, a); else this.set8(m.reg, a);
                    return;
                }
                case 0x88: case 0x89: {                       // MOV r/m, reg
                    const m = this.modrm();
                    this.writeRM(m, wide ? this.get16(m.reg) : this.get8(m.reg), wide);
                    return;
                }
                case 0x8A: case 0x8B: {                       // MOV reg, r/m
                    const m = this.modrm();
                    const v = this.readRM(m, wide);
                    if (wide) this.set16(m.reg, v); else this.set8(m.reg, v);
                    return;
                }
                case 0x8C: {                                  // MOV r/m, sreg
                    const m = this.modrm();
                    this.writeRM(m, this.s[m.reg & 3], true);
                    return;
                }
                case 0x8D: {                                  // LEA
                    const m = this.modrm();
                    this.set16(m.reg, m.isReg ? 0 : m.off);
                    return;
                }
                case 0x8E: {                                  // MOV sreg, r/m
                    const m = this.modrm();
                    this.s[m.reg & 3] = this.readRM(m, true);
                    return;
                }
                case 0x8F: {                                  // POP r/m
                    const m = this.modrm();
                    this.writeRM(m, this.pop(), true);
                    return;
                }

                case 0x90: return;                            // NOP (XCHG AX,AX)
                case 0x91: case 0x92: case 0x93: case 0x94:
                case 0x95: case 0x96: case 0x97: {            // XCHG AX, reg
                    const i = op & 7;
                    const t = this.r[0]; this.r[0] = this.r[i]; this.r[i] = t;
                    return;
                }
                case 0x98: {                                  // CBW
                    const al = this.get8(0);
                    this.r[0] = al < 0x80 ? al : (al | 0xFF00);
                    return;
                }
                case 0x99:                                    // CWD
                    this.r[2] = (this.r[0] & 0x8000) ? 0xFFFF : 0x0000; return;
                case 0x9A: {                                  // CALL far
                    const off = this.fetch16(), seg = this.fetch16();
                    this.push(this.s[1]); this.push(this.ip);
                    this.s[1] = seg; this.ip = off;
                    return;
                }
                case 0x9B: return;                            // WAIT
                case 0x9C: this.push(this.flags | 0xF002); return;   // PUSHF
                case 0x9D: this.flags = (this.pop() | 0xF002) & 0xFFFF; return; // POPF
                case 0x9E:                                    // SAHF
                    this.flags = (this.flags & 0xFF00) | (this.get8(4) & 0xD5) | 0x02; return;
                case 0x9F: this.set8(4, this.flags & 0xFF); return; // LAHF

                case 0xA0:                                    // MOV AL, [addr]
                    this.set8(0, this.memRead(this.segFor(3), this.fetch16(), false)); return;
                case 0xA1:
                    this.r[0] = this.memRead(this.segFor(3), this.fetch16(), true); return;
                case 0xA2:
                    this.memWrite(this.segFor(3), this.fetch16(), this.get8(0), false); return;
                case 0xA3:
                    this.memWrite(this.segFor(3), this.fetch16(), this.r[0], true); return;

                case 0xA8: this.logicFlags(this.get8(0) & this.fetch8(), false); return;
                case 0xA9: this.logicFlags(this.r[0] & this.fetch16(), true); return;

                // --- the string block, with its repeat prefixes ---------------
                case 0xA4: case 0xA5: case 0xA6: case 0xA7:
                case 0xAA: case 0xAB: case 0xAC: case 0xAD:
                case 0xAE: case 0xAF: {
                    const w = (op & 1) !== 0;
                    const compares = (op === 0xA6 || op === 0xA7 || op === 0xAE || op === 0xAF);
                    if (!this.repPrefix) { this.doString(op, w); return; }
                    // A repeat runs to completion here rather than one element
                    // per tick: the lab's tick is not the processor's clock, and
                    // a half finished REP MOVSB is not a state worth showing.
                    let guard = 0;
                    while (this.r[1] !== 0 && guard++ < 0x20000) {
                        this.doString(op, w);
                        this.r[1] = (this.r[1] - 1) & 0xFFFF;
                        if (compares) {
                            const z = this.f(F_ZF);
                            if (this.repPrefix === 0xF3 && !z) break;
                            if (this.repPrefix === 0xF2 && z) break;
                        }
                    }
                    return;
                }

                case 0xB0: case 0xB1: case 0xB2: case 0xB3:
                case 0xB4: case 0xB5: case 0xB6: case 0xB7:
                    this.set8(op & 7, this.fetch8()); return;
                case 0xB8: case 0xB9: case 0xBA: case 0xBB:
                case 0xBC: case 0xBD: case 0xBE: case 0xBF:
                    this.set16(op & 7, this.fetch16()); return;

                case 0xC0: case 0xC2: {                       // RET near, imm16
                    const n = this.fetch16();
                    this.ip = this.pop();
                    this.r[4] = (this.r[4] + n) & 0xFFFF;
                    return;
                }
                case 0xC1: case 0xC3: this.ip = this.pop(); return;
                case 0xC4: case 0xC5: {                       // LES / LDS
                    const m = this.modrm();
                    if (m.isReg) return;
                    this.set16(m.reg, this.memRead(m.seg, m.off, true));
                    this.s[op === 0xC4 ? 0 : 3] = this.memRead(m.seg, (m.off + 2) & 0xFFFF, true);
                    return;
                }
                case 0xC6: case 0xC7: {                       // MOV r/m, imm
                    const m = this.modrm();
                    this.writeRM(m, wide ? this.fetch16() : this.fetch8(), wide);
                    return;
                }
                case 0xC8: case 0xCA: {                       // RETF imm16
                    const n = this.fetch16();
                    this.ip = this.pop(); this.s[1] = this.pop();
                    this.r[4] = (this.r[4] + n) & 0xFFFF;
                    return;
                }
                case 0xC9: case 0xCB:
                    this.ip = this.pop(); this.s[1] = this.pop(); return;
                case 0xCC: this.interrupt(3); return;
                case 0xCD: this.interrupt(this.fetch8()); return;
                case 0xCE: if (this.f(F_OF)) this.interrupt(4); return;
                case 0xCF:                                    // IRET
                    this.ip = this.pop(); this.s[1] = this.pop();
                    this.flags = (this.pop() | 0xF002) & 0xFFFF;
                    return;

                case 0xD0: case 0xD1: case 0xD2: case 0xD3: {
                    const m = this.modrm();
                    const w = (op & 1) !== 0;
                    const count = (op & 2) ? this.get8(1) : 1;
                    this.writeRM(m, this.shift(m.reg, this.readRM(m, w), count, w), w);
                    return;
                }
                case 0xD4: {                                  // AAM
                    const d = this.fetch8() || 10;
                    const al = this.get8(0);
                    this.set8(4, Math.floor(al / d));
                    this.set8(0, al % d);
                    this.szp(this.r[0] & 0xFF, false);
                    return;
                }
                case 0xD5: {                                  // AAD
                    const d = this.fetch8() || 10;
                    this.set8(0, (this.get8(0) + this.get8(4) * d) & 0xFF);
                    this.set8(4, 0);
                    this.szp(this.get8(0), false);
                    return;
                }
                case 0xD7:                                    // XLAT
                    this.set8(0, this.memRead(this.segFor(3),
                        (this.r[3] + this.get8(0)) & 0xFFFF, false));
                    return;

                case 0xE0: case 0xE1: case 0xE2: {            // LOOPNE/LOOPE/LOOP
                    const d = this.fetchS8();
                    this.r[1] = (this.r[1] - 1) & 0xFFFF;
                    const z = this.f(F_ZF);
                    const go = this.r[1] !== 0 &&
                        (op === 0xE2 || (op === 0xE1 && z) || (op === 0xE0 && !z));
                    if (go) this.ip = (this.ip + d) & 0xFFFF;
                    return;
                }
                case 0xE3: {                                  // JCXZ
                    const d = this.fetchS8();
                    if (this.r[1] === 0) this.ip = (this.ip + d) & 0xFFFF;
                    return;
                }
                case 0xE4: this.set8(0, this.portIn(this.fetch8(), false)); return;
                case 0xE5: this.r[0] = this.portIn(this.fetch8(), true); return;
                case 0xE6: this.portOut(this.fetch8(), this.get8(0), false); return;
                case 0xE7: this.portOut(this.fetch8(), this.r[0], true); return;
                case 0xE8: {                                  // CALL near
                    const d = this.fetch16();
                    this.push(this.ip);
                    this.ip = (this.ip + (d < 0x8000 ? d : d - 0x10000)) & 0xFFFF;
                    return;
                }
                case 0xE9: {
                    const d = this.fetch16();
                    this.ip = (this.ip + (d < 0x8000 ? d : d - 0x10000)) & 0xFFFF;
                    return;
                }
                case 0xEA: {                                  // JMP far
                    const off = this.fetch16(), seg = this.fetch16();
                    this.ip = off; this.s[1] = seg;
                    return;
                }
                case 0xEB: { const d = this.fetchS8(); this.ip = (this.ip + d) & 0xFFFF; return; }
                case 0xEC: this.set8(0, this.portIn(this.r[2], false)); return;
                case 0xED: this.r[0] = this.portIn(this.r[2], true); return;
                case 0xEE: this.portOut(this.r[2], this.get8(0), false); return;
                case 0xEF: this.portOut(this.r[2], this.r[0], true); return;

                case 0xF4: this.halted = true; return;        // HLT
                case 0xF5: this.setF(F_CF, !this.f(F_CF)); return;
                case 0xF6: case 0xF7: {                       // the F6/F7 group
                    const m = this.modrm();
                    const w = (op & 1) !== 0;
                    const v = this.readRM(m, w);
                    switch (m.reg) {
                        case 0: case 1:
                            this.logicFlags(v & (w ? this.fetch16() : this.fetch8()), w); return;
                        case 2: this.writeRM(m, ~v, w); return;                       // NOT
                        case 3: this.writeRM(m, this.subFlags(0, v, 0 - v, w), w);
                            this.setF(F_CF, v !== 0); return;                          // NEG
                        case 4: {                                                      // MUL
                            if (w) {
                                const r = this.r[0] * v;
                                this.r[0] = r & 0xFFFF; this.r[2] = (r >>> 16) & 0xFFFF;
                                const hi = this.r[2] !== 0;
                                this.setF(F_CF, hi); this.setF(F_OF, hi);
                            } else {
                                const r = this.get8(0) * v;
                                this.r[0] = r & 0xFFFF;
                                const hi = (r & 0xFF00) !== 0;
                                this.setF(F_CF, hi); this.setF(F_OF, hi);
                            }
                            return;
                        }
                        case 5: {                                                      // IMUL
                            const sx = x => w ? (x < 0x8000 ? x : x - 0x10000)
                                : (x < 0x80 ? x : x - 0x100);
                            if (w) {
                                const r = sx(this.r[0]) * sx(v);
                                this.r[0] = r & 0xFFFF; this.r[2] = (r >> 16) & 0xFFFF;
                                const on = r < -32768 || r > 32767;
                                this.setF(F_CF, on); this.setF(F_OF, on);
                            } else {
                                const r = sx(this.get8(0)) * sx(v);
                                this.r[0] = r & 0xFFFF;
                                const on = r < -128 || r > 127;
                                this.setF(F_CF, on); this.setF(F_OF, on);
                            }
                            return;
                        }
                        case 6: {                                                      // DIV
                            if (!v) { this.interrupt(0); return; }
                            if (w) {
                                const n = (this.r[2] * 0x10000) + this.r[0];
                                const q = Math.floor(n / v);
                                if (q > 0xFFFF) { this.interrupt(0); return; }
                                this.r[0] = q & 0xFFFF; this.r[2] = n % v;
                            } else {
                                const n = this.r[0];
                                const q = Math.floor(n / v);
                                if (q > 0xFF) { this.interrupt(0); return; }
                                this.set8(0, q); this.set8(4, n % v);
                            }
                            return;
                        }
                        case 7: {                                                      // IDIV
                            if (!v) { this.interrupt(0); return; }
                            const sx = x => w ? (x < 0x8000 ? x : x - 0x10000)
                                : (x < 0x80 ? x : x - 0x100);
                            const d = sx(v);
                            if (w) {
                                let n = (this.r[2] << 16) | this.r[0];
                                n = n | 0;
                                const q = Math.trunc(n / d);
                                if (q > 32767 || q < -32768) { this.interrupt(0); return; }
                                this.r[0] = q & 0xFFFF; this.r[2] = (n % d) & 0xFFFF;
                            } else {
                                const n = (this.r[0] << 16) >> 16;
                                const q = Math.trunc(n / d);
                                if (q > 127 || q < -128) { this.interrupt(0); return; }
                                this.set8(0, q); this.set8(4, n % d);
                            }
                            return;
                        }
                    }
                    return;
                }
                case 0xF8: this.setF(F_CF, false); return;
                case 0xF9: this.setF(F_CF, true); return;
                case 0xFA: this.setF(F_IF, false); return;
                case 0xFB: this.setF(F_IF, true); return;
                case 0xFC: this.setF(F_DF, false); return;
                case 0xFD: this.setF(F_DF, true); return;
                case 0xFE: {
                    const m = this.modrm();
                    this.writeRM(m, this.incdec(this.readRM(m, false), false, m.reg === 1), false);
                    return;
                }
                case 0xFF: {
                    const m = this.modrm();
                    switch (m.reg) {
                        case 0: case 1:
                            this.writeRM(m, this.incdec(this.readRM(m, true), true, m.reg === 1), true);
                            return;
                        case 2: this.push(this.ip); this.ip = this.readRM(m, true); return;
                        case 3: {
                            if (m.isReg) return;
                            const off = this.memRead(m.seg, m.off, true);
                            const seg = this.memRead(m.seg, (m.off + 2) & 0xFFFF, true);
                            this.push(this.s[1]); this.push(this.ip);
                            this.s[1] = seg; this.ip = off;
                            return;
                        }
                        case 4: this.ip = this.readRM(m, true); return;
                        case 5: {
                            if (m.isReg) return;
                            this.ip = this.memRead(m.seg, m.off, true);
                            this.s[1] = this.memRead(m.seg, (m.off + 2) & 0xFFFF, true);
                            return;
                        }
                        case 6: this.push(this.readRM(m, true)); return;
                    }
                    return;
                }
                default:
                    // Everything an 8086 does not know is an undefined opcode,
                    // and an 8086 does not trap on those: it just carries on.
                    return;
            }
        }

        cond(c) {
            switch (c) {
                case 0x0: return this.f(F_OF);
                case 0x1: return !this.f(F_OF);
                case 0x2: return this.f(F_CF);
                case 0x3: return !this.f(F_CF);
                case 0x4: return this.f(F_ZF);
                case 0x5: return !this.f(F_ZF);
                case 0x6: return this.f(F_CF) || this.f(F_ZF);
                case 0x7: return !this.f(F_CF) && !this.f(F_ZF);
                case 0x8: return this.f(F_SF);
                case 0x9: return !this.f(F_SF);
                case 0xA: return this.f(F_PF);
                case 0xB: return !this.f(F_PF);
                case 0xC: return this.f(F_SF) !== this.f(F_OF);
                case 0xD: return this.f(F_SF) === this.f(F_OF);
                case 0xE: return this.f(F_ZF) || (this.f(F_SF) !== this.f(F_OF));
                default: return !this.f(F_ZF) && (this.f(F_SF) === this.f(F_OF));
            }
        }
    }
    // i18n-ignore-end

    //-------------------------------------------------------------------------
    // The 8066 in its package
    //-------------------------------------------------------------------------
    // Forty pins, twenty a side, the way the part actually comes. The package
    // covers CHIP_W by CHIP_H cells and the pins are the cells immediately above
    // and below it, numbered the way a DIP is numbered: one to twenty along the
    // bottom left to right, twenty one to forty along the top right to left.
    //
    // i18n-ignore-start  pin names and mnemonics are the part's own, not prose
    // Two cells per pin rather than one. Wire is omnidirectional, so pins on
    // touching cells would drive each other: put a source on Vcc and the AD15
    // pin beside it comes up too. The odd columns between them are the gap that
    // stops it, which is also why the part takes up so much of the board.
    const CHIP_PIN_PITCH = 2;
    const CHIP_W = 20 * CHIP_PIN_PITCH;
    const CHIP_H = 2;

    // dir: 'out' the chip drives it, 'in' the chip reads it, 'pwr'/'gnd' supply.
    // bit: which address or data line, for the pins that carry one.
    const PINS_8066 = [
        null,                                        // pins are 1 based
        { n: 'GND', dir: 'gnd' },
        { n: 'AD14', dir: 'out', bit: 14 }, { n: 'AD13', dir: 'out', bit: 13 },
        { n: 'AD12', dir: 'out', bit: 12 }, { n: 'AD11', dir: 'out', bit: 11 },
        { n: 'AD10', dir: 'out', bit: 10 }, { n: 'AD9', dir: 'out', bit: 9 },
        { n: 'AD8', dir: 'out', bit: 8 }, { n: 'AD7', dir: 'out', bit: 7 },
        { n: 'AD6', dir: 'out', bit: 6 }, { n: 'AD5', dir: 'out', bit: 5 },
        { n: 'AD4', dir: 'out', bit: 4 }, { n: 'AD3', dir: 'out', bit: 3 },
        { n: 'AD2', dir: 'out', bit: 2 }, { n: 'AD1', dir: 'out', bit: 1 },
        { n: 'AD0', dir: 'out', bit: 0 },
        { n: 'NMI', dir: 'in' }, { n: 'INTR', dir: 'in' }, { n: 'CLK', dir: 'in' },
        { n: 'GND', dir: 'gnd' },
        { n: 'RESET', dir: 'in' }, { n: 'READY', dir: 'in' }, { n: 'TEST', dir: 'in' },
        { n: 'INTA', dir: 'out' }, { n: 'ALE', dir: 'out' }, { n: 'DEN', dir: 'out' },
        { n: 'DT/R', dir: 'out' }, { n: 'M/IO', dir: 'out' }, { n: 'WR', dir: 'out' },
        { n: 'HLDA', dir: 'out' }, { n: 'HOLD', dir: 'in' }, { n: 'RD', dir: 'out' },
        { n: 'MN/MX', dir: 'in' }, { n: 'BHE', dir: 'out' },
        { n: 'A19', dir: 'out', bit: 19 }, { n: 'A18', dir: 'out', bit: 18 },
        { n: 'A17', dir: 'out', bit: 17 }, { n: 'A16', dir: 'out', bit: 16 },
        { n: 'AD15', dir: 'out', bit: 15 },
        { n: 'Vcc', dir: 'pwr' }
    ];

    // Four programs in the mask ROM, because a processor with nothing to run is
    // a very expensive lamp. Assembled by hand; the harness runs all of them.
    const CHIP_ROMS = [
        {
            key: 'counter',
            // mov ax,0 / out 0,ax / inc ax / jmp back
            code: [0xB8, 0x00, 0x00, 0xE7, 0x00, 0x40, 0xEB, 0xFB]
        },
        {
            key: 'fib',
            // sixteen Fibonacci terms into DS:0200, then halt
            code: [0xB8, 0x00, 0x00, 0xBB, 0x01, 0x00, 0xB9, 0x10, 0x00,
                0xBF, 0x00, 0x02, 0x89, 0x05, 0x83, 0xC7, 0x02, 0x01, 0xD8,
                0x93, 0xE2, 0xF6, 0xF4]
        },
        {
            key: 'strcpy',
            // rep movsb twelve bytes from 0300 to 0400, then halt
            code: [0xBE, 0x00, 0x03, 0xBF, 0x00, 0x04, 0xB9, 0x0C, 0x00,
                0xFC, 0xF3, 0xA4, 0xF4],
            text: { at: 0x300, s: 'HYPERNET8066' }
        },
        {
            key: 'muldiv',
            // 1234 * 100, then divide it back again, then halt
            code: [0xB8, 0xD2, 0x04, 0xBB, 0x64, 0x00, 0xF7, 0xE3, 0xF7, 0xF3, 0xF4]
        }
    ];

    // Sets segments and a stack up before anything else runs, so a ROM can be
    // written as if it owned the machine. Lives at 0080 and jumps to 0100.
    const CHIP_PROLOGUE = [
        0xB8, 0x00, 0x00,   // mov ax,0
        0x8E, 0xD0,         // mov ss,ax
        0x8E, 0xD8,         // mov ds,ax
        0x8E, 0xC0,         // mov es,ax
        0xBC, 0xFE, 0xFF,   // mov sp,0FFFEh
        0xEB, 0x72          // jmp 0100
    ];

    function loadChipRom(cpu, index) {
        cpu.reset();
        const rom = CHIP_ROMS[((index | 0) % CHIP_ROMS.length + CHIP_ROMS.length) % CHIP_ROMS.length];
        CHIP_PROLOGUE.forEach((b, i) => { cpu.mem[0x0080 + i] = b; });
        rom.code.forEach((b, i) => { cpu.mem[0x0100 + i] = b; });
        if (rom.text) {
            for (let i = 0; i < rom.text.s.length; i++) {
                cpu.mem[rom.text.at + i] = rom.text.s.charCodeAt(i);
            }
        }
        // The reset vector, where a real one starts: a far jump to the setup.
        [0xEA, 0x80, 0x00, 0x00, 0x00].forEach((b, i) => { cpu.mem[0xFFFF0 + i] = b; });
        return cpu;
    }
    // i18n-ignore-end

    // The cell one of the forty pins reaches, or -1 if it would fall off the
    // grid. Anchor is the package's top left cell.
    function chipPinCell(anchor, pin) {
        const x = anchor % CHIP_GRID;
        const y = Math.floor(anchor / CHIP_GRID);
        if (pin <= 20) {
            const px = x + (pin - 1) * CHIP_PIN_PITCH;
            return inGrid(px, y + CHIP_H) ? cellKey(px, y + CHIP_H) : -1;
        }
        const px = x + (40 - pin) * CHIP_PIN_PITCH;
        return inGrid(px, y - 1) ? cellKey(px, y - 1) : -1;
    }

    // Every cell a package standing at (x, y) would cover.
    function chipFootprint(x, y) {
        const out = [];
        for (let dy = 0; dy < CHIP_H; dy++) {
            for (let dx = 0; dx < CHIP_W; dx++) {
                if (!inGrid(x + dx, y + dy)) return null;
                out.push({ k: cellKey(x + dx, y + dy), ox: dx, oy: dy });
            }
        }
        return out;
    }

    // The anchor a chip cell belongs to, from any cell of the package.
    function chipAnchorOf(tiles, k) {
        const t = tiles[k];
        if (!t || t.t !== CT.CHIP) return -1;
        const x = (k % CHIP_GRID) - (t.ox || 0);
        const y = Math.floor(k / CHIP_GRID) - (t.oy || 0);
        return inGrid(x, y) ? cellKey(x, y) : -1;
    }

    // Puts a package down, or takes one away. Both work from any cell of it.
    function placeChip(tiles, x, y, rom) {
        const cells = chipFootprint(x, y);
        if (!cells) return false;
        cells.forEach(c => { delete tiles[c.k]; });
        cells.forEach(c => {
            tiles[c.k] = { t: CT.CHIP, d: 0, v: rom | 0, ox: c.ox, oy: c.oy };
        });
        return true;
    }

    function removeChip(tiles, k) {
        const anchor = chipAnchorOf(tiles, k);
        if (anchor < 0) return false;
        const cells = chipFootprint(anchor % CHIP_GRID, Math.floor(anchor / CHIP_GRID));
        (cells || []).forEach(c => {
            if (tiles[c.k] && tiles[c.k].t === CT.CHIP) delete tiles[c.k];
        });
        return true;
    }

    // What the pins are showing, from the last thing the core did on its bus.
    // The address and data lines are multiplexed on a real one; here they show
    // the address, which is the half worth watching from outside.
    function chipPinLevels(cpu) {
        const out = new Array(41).fill(false);
        const bus = cpu.bus;
        for (let pin = 1; pin <= 40; pin++) {
            const p = PINS_8066[pin];
            if (!p || p.dir !== 'out') continue;
            if (p.bit !== undefined) {
                // AD0 to AD15 are multiplexed on the real part: address going
                // out, data coming back. On a write cycle they carry the data,
                // which is the half worth watching when a program is talking to
                // something. A16 to A19 are address only and always were.
                const src = (bus.wr && p.bit < 16) ? bus.data : bus.addr;
                out[pin] = ((src >> p.bit) & 1) === 1;
                continue;
            }
            switch (p.n) {
                case 'ALE': out[pin] = !!bus.ale; break;
                case 'RD': out[pin] = !bus.rd; break;      // active low, like the part
                case 'WR': out[pin] = !bus.wr; break;
                case 'M/IO': out[pin] = !bus.io; break;
                case 'DEN': out[pin] = !(bus.rd || bus.wr); break;
                case 'DT/R': out[pin] = !!bus.wr; break;
                case 'BHE': out[pin] = false; break;
                case 'INTA': out[pin] = true; break;
                case 'HLDA': out[pin] = false; break;
                default: break;
            }
        }
        return out;
    }

    //-------------------------------------------------------------------------
    // Ready-made circuits
    //-------------------------------------------------------------------------
    // Worked examples you can stamp onto the board and pull apart. Every one of
    // them is built out of the same tiles the player has, with no special cases
    // in the simulation: a preset is a drawing, not a component.
    //
    // Coordinates are relative to the top left of the stamp, and the stamp lands
    // wherever the view is centred.
    function chipStamp() {
        const tiles = {};
        const at = (x, y, t, d, v) => { tiles[y * CHIP_GRID + x] = { t: t, d: d || 0, v: v || 0 }; };
        return {
            tiles: tiles,
            wire: (x, y) => at(x, y, CT.WIRE),
            // A straight run of wire, which is most of any circuit.
            run(x, y, n, dx, dy) {
                for (let i = 0; i < n; i++) at(x + i * (dx || 0), y + i * (dy || 0), CT.WIRE);
                return this;
            },
            gate: (x, y, d, kind) => at(x, y, CT.GATE, d, GATE_KINDS.indexOf(kind)),
            torch: (x, y, d) => at(x, y, CT.TORCH, d),
            rep: (x, y, d, delay) => at(x, y, CT.REPEATER, d, delay || 0),
            bridge: (x, y) => at(x, y, CT.BRIDGE),
            source: (x, y) => at(x, y, CT.SOURCE),
            clock: (x, y, period) => at(x, y, CT.CLOCK, 0, (period || 2) - 1),
            inPin: (x, y, i) => at(x, y, CT.IN, 0, i || 0),
            outPin: (x, y, i) => at(x, y, CT.OUT, 0, i || 0),
            lamp: (x, y) => at(x, y, CT.LAMP),
            // A whole package, laid into the stamp cell by cell so it travels
            // with the rest of the drawing.
            chip(x, y, rom) {
                for (let dy = 0; dy < CHIP_H; dy++) {
                    for (let dx = 0; dx < CHIP_W; dx++) {
                        tiles[(y + dy) * CHIP_GRID + (x + dx)] =
                            { t: CT.CHIP, d: 0, v: rom | 0, ox: dx, oy: dy };
                    }
                }
                return this;
            }
        };
    }

    // One bit of addition, drawn at an offset so a wider adder is just several
    // of them stacked. Fourteen rows apart is the pitch that keeps one slice's
    // carry lane clear of the next slice's top rail.
    //
    //   S    = (A xor B) xor Cin
    //   Cout = (A and B) or (Cin and (A xor B))
    //
    // Three lanes six rows apart, A on top, B in the middle, Cin at the bottom,
    // with short stubs reaching into each gate. A gate drives the cell in front
    // of it, so every stub dead ends at its gate and nothing else is beside it.
    const ADDER_PITCH = 14;

    function fullAdderSlice(b, ox, oy, opt) {
        const X = n => ox + n;
        const Y = n => oy + n;
        // The three input lanes. A pin is only laid where one was asked for:
        // the upper slices of a wider adder take their carry off the slice
        // below instead.
        if (opt.a !== null && opt.a !== undefined) b.inPin(X(0), Y(0), opt.a);
        b.run(X(1), Y(0), 8, 1, 0);
        if (opt.b !== null && opt.b !== undefined) b.inPin(X(0), Y(6), opt.b);
        b.run(X(1), Y(6), 8, 1, 0);
        if (opt.cin !== null && opt.cin !== undefined) b.inPin(X(0), Y(12), opt.cin);
        b.run(X(1), Y(12), 12, 1, 0);

        // XOR1 = A xor B, on a stub down from A and up from B.
        b.run(X(4), Y(1), 2, 0, 1);
        b.run(X(4), Y(4), 2, 0, 1);
        b.gate(X(4), Y(3), 1, 'xor');
        b.run(X(5), Y(3), 2, 1, 0);

        // AND1 = A and B, on its own pair of stubs further along.
        b.run(X(8), Y(1), 2, 0, 1);
        b.run(X(8), Y(4), 2, 0, 1);
        b.gate(X(8), Y(3), 1, 'and');
        b.run(X(9), Y(3), 1, 1, 0);

        // The XOR1 result has to get past the B lane to reach the bottom half,
        // which is what a bridge is for: it carries the two axes separately, so
        // B runs straight through it while the result crosses.
        b.run(X(6), Y(4), 2, 0, 1);
        b.bridge(X(6), Y(6));
        b.run(X(6), Y(7), 3, 0, 1);
        b.run(X(7), Y(8), 5, 1, 0);
        b.run(X(7), Y(9), 1, 1, 0);
        b.run(X(11), Y(9), 1, 1, 0);

        // XOR2 = that xor Cin, which is the sum.
        b.run(X(7), Y(11), 1, 1, 0);
        b.gate(X(7), Y(10), 1, 'xor');
        b.run(X(8), Y(10), 1, 1, 0);
        if (opt.sum !== null && opt.sum !== undefined) b.outPin(X(9), Y(10), opt.sum);

        // AND2 = Cin and (A xor B).
        b.run(X(11), Y(11), 1, 1, 0);
        b.gate(X(11), Y(10), 1, 'and');
        b.run(X(12), Y(10), 1, 1, 0);

        // The two carry terms meet at an OR out to the right, clear of the lanes.
        b.run(X(10), Y(3), 5, 1, 0);
        b.run(X(14), Y(4), 2, 0, 1);
        b.run(X(13), Y(10), 2, 1, 0);
        b.run(X(14), Y(7), 3, 0, 1);
        b.gate(X(14), Y(6), 1, 'or');
        b.run(X(15), Y(6), 1, 1, 0);
        // The carry either ends on a pin here, or the caller runs it on out to
        // wherever it is going next.
        if (opt.cout !== null && opt.cout !== undefined) b.outPin(X(16), Y(6), opt.cout);
    }

    // i18n-ignore-start  preset ids, labels come from HyperDeck.chip.preset.*
    //
    // Wire is omnidirectional: two runs that touch are one run. Every layout
    // below leaves a blank cell between signals that must stay apart, which is
    // most of why they are shaped the way they are.
    const CHIP_PRESETS = [
        {
            // The whole of the idea in five tiles: a torch is a NOT.
            key: 'inverter',
            build(b) {
                b.inPin(0, 1, 0);
                b.torch(1, 1, 1);
                b.run(2, 1, 2, 1, 0);
                b.outPin(4, 1, 0);
            }
        },
        {
            // Two NOR gates each holding the other down. Pulse pin 0 to set it,
            // pin 1 to clear it, and it stays where it was put: one bit of
            // memory, which is the thing that makes the rest of this a machine.
            key: 'latch',
            build(b) {
                b.inPin(0, 0, 0);          // set, into gate A's north side
                b.gate(0, 1, 1, 'nor');    // A, facing east
                b.run(1, 1, 2, 1, 0);      // A's output, along to B
                b.run(2, 2, 1, 0, 1);
                b.gate(2, 3, 3, 'nor');    // B, facing west
                b.inPin(2, 4, 1);          // reset, into B's south side
                b.run(1, 3, 1, 1, 0);      // B's output, back round to A
                b.run(0, 3, 1, 1, 0);
                b.run(0, 2, 1, 0, 1);
                b.outPin(3, 1, 0);         // Q
                b.outPin(0, 4, 1);         // not Q
            }
        },
        {
            // A torch wired back to its own input. It can never settle, so it
            // does not: the oldest clock there is.
            key: 'clock',
            build(b) {
                b.torch(1, 1, 1);
                b.run(2, 1, 1, 1, 0);
                b.run(2, 0, 1, 0, 1);
                b.run(1, 0, 1, 1, 0);
                b.run(0, 0, 1, 1, 0);
                b.run(0, 1, 1, 0, 1);
                b.run(3, 1, 1, 1, 0);
                b.outPin(4, 1, 0);
                b.lamp(3, 2);
            }
        },
        {
            // Sum on pin 0, carry on pin 1. Two gates, and the start of
            // everything that does arithmetic. A and B each fork twice: once
            // into the XOR in the middle, once into the AND on the left.
            key: 'halfadder',
            build(b) {
                b.inPin(0, 0, 0);          // A
                b.run(1, 0, 3, 1, 0);
                b.run(0, 1, 2, 0, 1);      // A down the left, into the AND
                b.run(3, 1, 2, 0, 1);      // A down the middle, into the XOR
                b.inPin(0, 6, 1);          // B
                b.run(1, 6, 3, 1, 0);
                b.run(0, 4, 2, 0, 1);      // B up the left
                b.run(3, 4, 2, 0, 1);      // B up the middle
                b.gate(3, 3, 1, 'xor');
                b.run(4, 3, 1, 1, 0);
                b.outPin(5, 3, 0);         // sum
                b.gate(0, 3, 1, 'and');
                b.outPin(1, 3, 1);         // carry
            }
        },
        {
            // A gate holds its output for a tick, so an XOR reading its own
            // output is a bit that flips: hold pin 0 high and it toggles every
            // tick, drop it and it stops where it is. Divide by two, and the
            // stage every binary counter is built out of.
            key: 'toggle',
            build(b) {
                b.inPin(1, 0, 0);          // T, into the XOR's north side
                b.gate(1, 1, 1, 'xor');
                b.run(2, 1, 1, 1, 0);      // Q
                b.run(2, 2, 1, 1, 0);      // and back round into its own
                b.run(1, 2, 1, 1, 0);      // south side
                b.outPin(3, 1, 0);
            }
        },
        {
            // Four stages in a ring with one inversion in the loop, which is
            // the counter that starts itself: from a dead board the torch comes
            // on, and the one it makes walks the four pins round and round.
            // Eight states before it repeats, and no clock to wire up.
            key: 'counter',
            build(b) {
                b.run(0, 1, 1, 1, 0);              // into the first stage
                for (let i = 0; i < 4; i++) {
                    const x = 1 + i * 2;
                    b.rep(x, 1, 1, 0);             // a stage: one tick of delay
                    b.run(x + 1, 1, 1, 1, 0);      // its output
                    b.outPin(x + 1, 0, i);         // read off above the wire
                }
                // The way back, two rows down so it never touches the chain or
                // the pins, with the inverter that makes the ring self start.
                b.run(9, 1, 3, 0, 1);      // down off the end of the chain
                b.run(8, 3, 3, -1, 0);             // 8,3 7,3 6,3
                b.torch(5, 3, 3);                  // facing west
                b.run(4, 3, 4, -1, 0);             // 4,3 3,3 2,3 1,3
                b.run(0, 3, 1, 1, 0);
                b.run(0, 2, 1, 0, 1);
            }
        },
        {
            // Sum on pin 0, carry out on pin 1, carry in on pin 2. Three inputs
            // and five gates: the slice every wider adder is made of.
            //   S    = (A xor B) xor Cin
            //   Cout = (A and B) or (Cin and (A xor B))
            // Every rail dead ends at the gate it feeds, because a gate drives
            // the cell in front of it and that cell must not also be touching a
            // rail that carries something else.
            key: 'fulladder',
            build(b) { fullAdderSlice(b, 0, 0, { a: 0, b: 1, cin: 2, sum: 0, cout: 1 }); }
        },
        {
            // Four of those slices stacked with the carry running down the
            // right hand side into the next one: A on pins 0-3, B on pins 4-7,
            // the sum on output pins 0-3 and the carry out on pin 4. There is
            // no carry in, because eight input pins is eight input pins.
            key: 'adder4',
            build(b) {
                // A on pins 0-3, B on pins 4-7, the sum on output pins 0-3 and
                // the carry out on pin 4. No carry in, because eight input pins
                // is eight input pins.
                //
                // Each slice's carry gets a column of its own out to the right,
                // two apart so two of them are never touching. A carry leaving
                // slice i has to cross the column belonging to slice i-1 on its
                // way out, and that one crossing is a bridge.
                const col = i => 18 + i * 2;
                for (let i = 0; i < 4; i++) {
                    const oy = i * ADDER_PITCH;
                    fullAdderSlice(b, 0, oy, {
                        a: i, b: i + 4, sum: i,
                        cin: null,
                        cout: i === 3 ? 4 : null
                    });
                    if (i >= 3) continue;
                    // Out along row 6 to this slice's own column...
                    for (let x = 16; x <= col(i); x++) {
                        if (i > 0 && x === col(i - 1)) b.bridge(x, oy + 6);
                        else b.wire(x, oy + 6);
                    }
                    // ...down it, and back in to the carry lane of the slice
                    // above, which has no input pin of its own.
                    //
                    // Wire loses a step of signal every cell and dies after
                    // fifteen. This run is nearly thirty, so it is broken up by
                    // repeaters, which is what they are for: each one puts the
                    // signal back to full and passes it on a tick later.
                    b.rep(col(i), oy + 7, 2, 0);
                    b.run(col(i), oy + 8, 10, 0, 1);
                    b.rep(col(i), oy + 18, 2, 0);
                    b.run(col(i), oy + 19, 8, 0, 1);
                    b.rep(col(i) - 1, oy + 26, 3, 0);
                    for (let x = col(i) - 2; x >= 13; x--) b.wire(x, oy + 26);
                }
            }
        },
        {
            // The processor wired up as a working machine rather than dropped on
            // a bare board: supply on Vcc, a clock on CLK, reset on a pin you can
            // pulse, and the bottom of the address bus brought out to lamps and
            // output pins so you can watch it run. Every wire is an ordinary
            // tile, so pull any of it about and it is still your schematic, and
            // etching the bench turns the whole thing into a die.
            key: 'cpu8066',
            build(b) {
                // The package sits at y 2, which puts pins 21-40 on row 1 and
                // pins 1-20 on row 4. Pins are on every other column, so the
                // arithmetic below is (pin - 1) * 2 along the bottom and
                // (40 - pin) * 2 along the top.
                b.chip(0, 2, 0);
                const lower = pin => (pin - 1) * 2;
                const upper = pin => (40 - pin) * 2;

                // Pin 40 is Vcc, top left. Nothing runs without it.
                b.source(upper(40), 1);
                // Pin 21 is RESET, top right: hold it to hold the part in reset.
                b.inPin(upper(21), 1, 0);

                // Pin 19 is CLK. Period one, so it steps every tick. Take the
                // clock away and the part free runs instead.
                b.clock(lower(19), 4, 1);
                // Pin 18 INTR and pin 17 NMI, left as pins you can poke.
                b.inPin(lower(18), 4, 1);
                b.inPin(lower(17), 4, 2);

                // Pins 16 down to 13 are AD0..AD3: the bottom of the bus, on
                // lamps, which is the thing you can actually watch move.
                for (let i = 0; i < 4; i++) b.lamp(lower(16 - i), 4);
                // AD4..AD7 out to numbered pins as well.
                for (let i = 0; i < 4; i++) b.outPin(lower(12 - i), 4, i + 4);

                // Pin 25 ALE and pin 29 WR on the top row, so the bus cycle
                // shows as well as the address on it.
                b.lamp(upper(25), 1);
                b.lamp(upper(29), 1);
            }
        }
    ];
    // i18n-ignore-end

    // How big a stamp is, in cells. Used to draw the ghost and to centre it on
    // the cursor before it is put down.
    function chipPresetSize(key) {
        const tiles = chipPresetTiles(key);
        if (!tiles) return null;
        const ks = Object.keys(tiles).map(Number);
        let w = 0, h = 0;
        ks.forEach(k => {
            w = Math.max(w, (k % CHIP_GRID) + 1);
            h = Math.max(h, Math.floor(k / CHIP_GRID) + 1);
        });
        return { w: w, h: h, n: ks.length };
    }

    function chipPresetTiles(key) {
        const preset = CHIP_PRESETS.find(p => p.key === key);
        if (!preset) return null;
        const b = chipStamp();
        preset.build(b);
        return b.tiles;
    }

    // Drops a preset onto the board with its top left at (x, y), rubbing out
    // whatever was underneath so a stamp is never half merged with an old one.
    function stampPreset(key, x, y) {
        const lab = chipLab();
        const tiles = chipPresetTiles(key);
        if (!lab || !tiles) return 0;
        let n = 0;
        Object.keys(tiles).forEach(k => {
            const tx = x + (k % CHIP_GRID);
            const ty = y + Math.floor(k / CHIP_GRID);
            if (!inGrid(tx, ty)) return;
            lab.tiles[ty * CHIP_GRID + tx] = tiles[k];
            n++;
        });
        return n;
    }

    //-------------------------------------------------------------------------
    // Fabrication
    //-------------------------------------------------------------------------
    // The die is a real component: it goes in the bag, it goes on the board and
    // the machine posts with it. What it is worth comes off what was drawn, so a
    // bigger circuit is a faster chip that eats more room and more power.
    function chipDieSpec() {
        const gates = chipGateCount();
        const mhz = Math.max(8, Math.min(900, Math.round(8 + gates * 3)));
        const watt = 1 + Math.floor(gates / 24);
        const cells = Math.max(1, Math.min(6, Math.ceil(gates / 28)));
        const shapes = ['X', 'XX', 'XXX', 'XX,XX', 'XXX,XX', 'XXX,XXX'];
        return { gates: gates, mhz: mhz, watt: watt, shape: shapes[cells - 1] };
    }

    function chipDies() {
        if (!$gameSystem) return {};
        return $gameSystem._hyperChipDies || ($gameSystem._hyperChipDies = {});
    }

    // A die slot is free when nothing was ever etched into it, or when the one
    // that was is no longer carried and is not sitting on anybody's board.
    function freeDieSlot() {
        const dies = chipDies();
        for (let i = 0; i < CHIP_DIE_SLOTS; i++) {
            const id = CHIP_DIE_BASE + i;
            if (!dies[id]) return id;
        }
        const placed = {};
        const d = deck();
        (d ? d.placed : []).forEach(rec => { placed[rec.itemId] = true; });
        for (let i = 0; i < CHIP_DIE_SLOTS; i++) {
            const id = CHIP_DIE_BASE + i;
            const item = $dataItems[id];
            if (placed[id]) continue;
            if (item && $gameParty.numItems(item) > 0) continue;
            return id;
        }
        return 0;
    }

    // Writes one die into $dataItems. Run again on every load, because the
    // database is read back off disk and knows nothing about these.
    function stampDie(id, die) {
        if (!$dataItems) return;
        // Filled rather than left as holes: $dataItems[0] is null in every
        // project, so everything that reads the database already copes with a
        // null entry, where a hole makes `for (const item of $dataItems)` yield
        // undefined in whichever plugin happens to do that.
        while ($dataItems.length < id) $dataItems.push(null);
        $dataItems[id] = {
            id: id,
            name: die.name,
            iconIndex: 83,
            description: die.description || '',
            itypeId: 1,
            price: die.price || 0,
            consumable: false,
            occasion: 3,
            scope: 0,
            speed: 0,
            successRate: 100,
            repeats: 1,
            tpGain: 0,
            hitType: 0,
            animationId: 0,
            effects: [],
            damage: { critical: false, elementId: 0, formula: '0', type: 0, variance: 0 },
            note: '<category:Component>\n<Uncraftable> <Weight: 18>\n<Component: cpu>\n'
                + '<Shape: ' + die.shape + '>\n'
                + '<Specs: mhz ' + die.mhz + ', watt ' + die.watt + '>\n<Nature: Mundane>'
        };
        delete _parsed[id];
        _catalogue = null;
    }

    function restampDies() {
        const dies = chipDies();
        Object.keys(dies).forEach(id => stampDie(+id, dies[id]));
    }

    // Etches the bench onto a die: takes the scrap, writes the item, hands it
    // over. Returns the die, or a reason it could not be done.
    function fabricateChip() {
        const lab = chipLab();
        if (!lab) return { error: 'noLab' };
        const spec = chipDieSpec();
        if (!spec.gates) return { error: 'noGates' };
        const scrap = $dataItems[CHIP_SCRAP_ITEM];
        const cost = chipScrapCost();
        if (!scrap || $gameParty.numItems(scrap) < cost) {
            return { error: 'noScrap', cost: cost };
        }
        const id = freeDieSlot();
        if (!id) return { error: 'noSlot' };

        const serial = (chipDies()[id] ? chipDies()[id].serial : 0)
            || (id - CHIP_DIE_BASE + 1);
        const die = {
            serial: serial,
            name: T('HyperDeck.chip.dieName', { serial: serial }),
            description: T('HyperDeck.chip.dieDesc', { gates: spec.gates, mhz: spec.mhz }),
            shape: spec.shape,
            mhz: spec.mhz,
            watt: spec.watt,
            gates: spec.gates,
            price: 300 * cost
        };
        chipDies()[id] = die;
        stampDie(id, die);
        $gameParty.loseItem(scrap, cost);
        $gameParty.gainItem($dataItems[id], 1);
        return { die: die, id: id, cost: cost };
    }

    // The dies are made at run time, so they have to be written back into the
    // database every time one is read off disk.
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        try { restampDies(); } catch (e) {
            console.warn('HyperDeck: could not restore the fabricated chips.', e);
        }
    };

    //-------------------------------------------------------------------------
    // The bench, as a scene
    //-------------------------------------------------------------------------
    const LAB_ID = 'hyperchip-lab';
    // The same chrome dressed inside a HypernetOS window: the styles hang off
    // the class, the fixed full-screen placement off the id alone.
    const LAB_CLASS = 'hyperchip-lab';   // i18n-ignore  css class

    // The palette, in the order it is drawn and the order the number keys walk.
    function chipPalette() {
        return [
            { t: CT.WIRE, key: 'wire' },
            { t: CT.SOURCE, key: 'source' },
            { t: CT.TORCH, key: 'torch' },
            { t: CT.REPEATER, key: 'repeater' },
            { t: CT.BRIDGE, key: 'bridge' },
            { t: CT.IN, key: 'in' },
            { t: CT.OUT, key: 'out' },
            { t: CT.CLOCK, key: 'clock' },
            { t: CT.LAMP, key: 'lamp' },
            { t: CT.CHIP, key: 'chip' }
        ];
    }

    // How many settings a tile has behind it: the gate its kind, the repeater
    // its delay, the pins their number, the clock its period.
    function variantCount(t) {
        if (t === CT.CHIP) return CHIP_ROMS.length;
        if (t === CT.GATE) return GATE_KINDS.length;
        if (t === CT.REPEATER) return 4;
        if (t === CT.CLOCK) return 16;
        if (t === CT.IN || t === CT.OUT) return CHIP_MAX_PINS;
        return 1;
    }

    function variantLabel(t, v) {
        if (t === CT.CHIP) return T('HyperDeck.chip.rom.' + (CHIP_ROMS[v] || CHIP_ROMS[0]).key);
        if (t === CT.GATE) return T('HyperDeck.chip.gate.' + (GATE_KINDS[v] || 'not'));
        if (t === CT.REPEATER) return T('HyperDeck.chip.delay', { n: v + 1 });
        if (t === CT.CLOCK) return T('HyperDeck.chip.period', { n: v + 1 });
        if (t === CT.IN || t === CT.OUT) return T('HyperDeck.chip.pin', { n: v });
        return '';
    }

    class Scene_ChipLab extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._running = false;
            this._frame = 0;
            this._dirty = true;
            this._paint = 0;
            this._last = null;
        }

        create() {
            super.create();
            this._lab = chipLab();
            this._sim = new ChipSim(this._lab);
            this.createDom();
        }

        createBackground() {
            this._backgroundSprite = new Sprite();
            this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
            this.addChild(this._backgroundSprite);
        }

        //--- the chrome ------------------------------------------------------
        createDom() {
            this.styleDom();
            this.root = document.createElement('div');
            this.root.className = LAB_CLASS + (this.hostEl ? ' hosted' : '');
            if (!this.hostEl) this.root.id = LAB_ID;
            this.root.innerHTML = this.skeleton();
            (this.hostEl || document.body).appendChild(this.root);
            this.canvas = this.root.querySelector('.cl-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.statusEl = this.root.querySelector('.cl-status');
            this.pinsEl = this.root.querySelector('.cl-pins');
            this.bind();
            this.layout();
            this.refreshChrome();
        }

        styleDom() {
            if (document.getElementById(LAB_ID + '-style')) return;
            const st = document.createElement('style');
            st.id = LAB_ID + '-style';
            // The bench has two faces. Bolted to the deck it is the deck's own
            // instrument: warm gold on black, the colour every other panel of
            // the machine is lit in. Opened as a program on the desktop it is
            // not allowed that gold, which on Archways belongs to the game's
            // own menus and nothing else, so the same bench is lit in
            // instrument cyan instead. One stylesheet, the palette named as
            // properties and swapped on the hosted class.
            st.textContent = `
.${LAB_CLASS} {
  --cl-accent: ${deco('gold', '#e6c273')};
  --cl-accent-lo: ${deco('goldLo', '#8d6f2c')};
  --cl-accent-hi: ${deco('goldHi', '#fff2c6')};
  --cl-ink: ${deco('ink', '#f6e8c4')};
  --cl-dim: ${deco('dim', '#c0a468')};
  --cl-faint: ${deco('faint', '#7d6836')};
  --cl-sel: ${deco('sel', '#2a2010')};
  --cl-sel-hi: ${deco('selHi', '#43331a')};
  --cl-black: ${deco('black', '#08070b')};
  --cl-green: ${deco('green', '#93d86e')};
  --cl-red: ${deco('red', '#d9533d')};
}
.${LAB_CLASS}.hosted {
  --cl-accent: #7fd4ff;
  --cl-accent-lo: #2f6b8c;
  --cl-accent-hi: #dff3ff;
  --cl-ink: #e6f3fa;
  --cl-dim: #a8c6d6;
  --cl-faint: #7f9dad;
  --cl-sel: #10222c;
  --cl-sel-hi: #1a3644;
}
#${LAB_ID} { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 62; }
.${LAB_CLASS} { font-family: '${hudFont()}', monospace; -webkit-font-smoothing: none;
  color: var(--cl-ink); }
.${LAB_CLASS}.hosted { position: relative; width: 100%; height: 100%; overflow: hidden;
  background: #0b1116; font-size: 12px; line-height: 1.4; }
.${LAB_CLASS} .cl-dies { position: absolute; background: var(--cl-black);
  border: 2px solid var(--cl-accent); padding: 6px 10px; display: flex; flex-direction: column; gap: 2px; }
.${LAB_CLASS} .cl-die { display: flex; justify-content: space-between; gap: 10px; }
.${LAB_CLASS} .cl-die span:last-child { color: var(--cl-dim); }
.${LAB_CLASS} .cl-die.fitted span:last-child { color: var(--cl-green); }
.${LAB_CLASS} .cl-panel { position: absolute; background: var(--cl-black);
  border: 2px solid var(--cl-accent); box-shadow: 0 0 0 2px var(--xp-black), 0 6px 22px rgba(0,0,0,0.75);
  display: flex; flex-direction: column; }
.${LAB_CLASS} .cl-head { background: var(--cl-accent); color: var(--xp-black); padding: 4px 10px;
  letter-spacing: 2px; flex: 0 0 auto; }
.${LAB_CLASS} .cl-scroll { overflow-y: auto; overflow-x: hidden; flex: 1 1 auto;
  min-height: 0; padding: 4px; }
.${LAB_CLASS} .cl-item { display: flex; justify-content: space-between; gap: 8px;
  padding: 5px 7px; cursor: pointer; border: 1px solid transparent; }
.${LAB_CLASS} .cl-item:hover { background: var(--cl-sel-hi); }
.${LAB_CLASS} .cl-item.on { background: var(--cl-sel); border-color: var(--cl-accent); }
.${LAB_CLASS} .cl-item span:last-child { color: var(--cl-dim); }
.${LAB_CLASS} .cl-group { color: var(--cl-accent); letter-spacing: 2px; padding: 8px 7px 2px;
  border-bottom: 1px solid var(--cl-accent-lo); margin-bottom: 2px; }
.${LAB_CLASS} .cl-sub { color: var(--cl-accent); letter-spacing: 2px; padding: 7px 10px 2px;
  border-top: 1px solid var(--cl-accent-lo); flex: 0 0 auto; }
.${LAB_CLASS} .cl-presets { display: none; z-index: 2; }
.${LAB_CLASS} .cl-presets.on { display: flex; }
.${LAB_CLASS} .cl-canvas { position: absolute; background: #0b0d12; cursor: crosshair;
  border: 2px solid var(--cl-accent-lo); image-rendering: pixelated; }
.${LAB_CLASS} .cl-bar { position: absolute; display: flex; flex-wrap: wrap; gap: 4px;
  align-items: stretch; }
.${LAB_CLASS} .cl-btn { cursor: pointer; padding: 6px 10px; color: var(--cl-accent);
  border: 1px solid var(--cl-accent-lo); background: var(--xp-terminal); white-space: nowrap; }
.${LAB_CLASS} .cl-btn:hover { background: var(--cl-sel-hi); color: var(--cl-accent-hi); }
.${LAB_CLASS} .cl-btn.on { border-color: var(--cl-green); background: var(--cl-sel); }
.${LAB_CLASS} .cl-btn.bad { color: var(--cl-red); }
.${LAB_CLASS} .cl-status { position: absolute; background: var(--cl-black);
  border: 2px solid var(--cl-accent); padding: 6px 10px; }
.${LAB_CLASS} .cl-line { display: flex; justify-content: space-between; gap: 12px; }
.${LAB_CLASS} .cl-line span:first-child { color: var(--cl-dim); }
.${LAB_CLASS} .cl-pins { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.${LAB_CLASS} .cl-pin { width: 26px; text-align: center; cursor: pointer; padding: 3px 0;
  border: 1px solid var(--cl-accent-lo); background: var(--xp-terminal); color: var(--cl-dim); }
.${LAB_CLASS} .cl-pin.on { background: var(--cl-green); color: #06120a; }
.${LAB_CLASS} .cl-pin.lit { border-color: var(--cl-green); color: var(--cl-green); }
.${LAB_CLASS} .cl-regs { margin-top: 6px; border-top: 1px solid var(--cl-accent-lo); padding-top: 4px; }
.${LAB_CLASS} .cl-regs .cl-line { display: flex; justify-content: space-between; gap: 10px; }
.${LAB_CLASS} .cl-regs .cl-line span:first-child { color: var(--cl-dim); }
.${LAB_CLASS} .cl-msg { color: var(--cl-green); padding-top: 6px; }
.${LAB_CLASS} .cl-hint { color: var(--cl-faint); padding: 6px 10px;
  border-top: 1px solid var(--cl-accent-lo); flex: 0 0 auto; }
`;
            document.head.appendChild(st);
        }

        skeleton() {
            const pal = chipPalette().map(p =>
                `<div class="cl-item" data-tool="${p.t}">
  <span>${esc(T('HyperDeck.chip.tile.' + p.key))}</span>
  <span class="cl-var" data-var="${p.t}"></span>
</div>`).join('');
            // The gates are a list of their own rather than one entry you click
            // seven times: which gate it is matters more than that it is a gate.
            const gates = GATE_KINDS.map((g, i) =>
                `<div class="cl-item cl-gate" data-gate="${i}">
  <span>${esc(T('HyperDeck.chip.gate.' + g))}</span>
  <span>${esc(GATE_GLYPH[g])}</span>
</div>`).join('');
            // Worked circuits to stamp down and pull apart, which is how
            // anybody ever learned any of this.
            // Each one says how much it will put down, because some of these
            // are five tiles and one of them is a processor.
            const presets = CHIP_PRESETS.map(x => {
                const n = Object.keys(chipPresetTiles(x.key) || {}).length;
                return `<div class="cl-item" data-preset="${esc(x.key)}">
  <span>${esc(T('HyperDeck.chip.preset.' + x.key))}</span>
  <span>${esc(T('HyperDeck.chip.tiles'))} ${n}</span>
</div>`;
            }).join('');
            return `
<canvas class="cl-canvas"></canvas>
<div class="cl-panel cl-palette">
  <div class="cl-head">${esc(T('HyperDeck.chip.heading'))}</div>
  <div class="cl-scroll">${pal}
    <div class="cl-group">${esc(T('HyperDeck.chip.gateGroup'))}</div>
    ${gates}
  </div>
  <div class="cl-hint">${esc(T('HyperDeck.chip.hint'))}</div>
</div>
<div class="cl-status">
  <div class="cl-line"><span>${esc(T('HyperDeck.chip.gates'))}</span><span class="cl-gates"></span></div>
  <div class="cl-line"><span>${esc(T('HyperDeck.chip.tiles'))}</span><span class="cl-tiles"></span></div>
  <div class="cl-line"><span>${esc(T('HyperDeck.chip.rating'))}</span><span class="cl-rating"></span></div>
  <div class="cl-line"><span>${esc(T('HyperDeck.chip.cost'))}</span><span class="cl-cost"></span></div>
  <div class="cl-sub">${esc(T('HyperDeck.chip.pins'))}</div>
  <div class="cl-pins"></div>
  <div class="cl-regs"></div>
  <div class="cl-msg"></div>
</div>
${this.hostEl ? '<div class="cl-dies"></div>' : ''}
<div class="cl-panel cl-presets">
  <div class="cl-head">${esc(T('HyperDeck.chip.presetHeading'))}</div>
  <div class="cl-scroll">${presets}</div>
  <div class="cl-hint">${esc(T('HyperDeck.chip.presetHint'))}</div>
</div>
<div class="cl-bar">
  <div class="cl-btn" data-act="run"></div>
  <div class="cl-btn" data-act="step">${esc(T('HyperDeck.chip.step'))}</div>
  <div class="cl-btn" data-act="speed"></div>
  <div class="cl-btn" data-act="rotate">${esc(T('HyperDeck.chip.rotate'))}</div>
  <div class="cl-btn" data-act="variant">${esc(T('HyperDeck.chip.variant'))}</div>
  <div class="cl-btn" data-act="presets">${esc(T('HyperDeck.chip.presetGroup'))}</div>
  <div class="cl-btn" data-act="wipe">${esc(T('HyperDeck.chip.wipe'))}</div>
  <div class="cl-btn" data-act="fab">${esc(T('HyperDeck.chip.fabricate'))}</div>
  <div class="cl-btn" data-act="done">${esc(T('HyperDeck.chip.done'))}</div>
</div>`;
        }

        // Where the chrome is laid out: the game canvas for the scene, the
        // window's own box (from its top left corner) for a hosted bench.
        hostRect() {
            if (this.hostEl) {
                const hr = this.hostEl.getBoundingClientRect();
                return { left: 0, top: 0, width: hr.width, height: hr.height };
            }
            const gc = Graphics._canvas || document.getElementById('gameCanvas');
            return gc && gc.getBoundingClientRect ? gc.getBoundingClientRect() : null;
        }

        layout() {
            const r = this.hostRect();
            if (!r || !r.width) return;
            const geom = [r.left, r.top, r.width, r.height].join('|');
            if (this._geom === geom) return;
            this._geom = geom;

            const pad = Math.round(r.width * 0.012);
            const palW = Math.round(Math.max(150, Math.min(260, r.width * 0.16)));
            const barH = Math.round(Math.max(34, r.height * 0.07));
            this.root.style.fontSize = Math.max(11, Math.round(r.width / (this.hostEl ? 80 : 100))) + 'px';
            this.root.style.lineHeight = '1.4';

            const palette = this.root.querySelector('.cl-palette');
            Object.assign(palette.style, {
                left: (r.left + pad) + 'px', top: (r.top + pad) + 'px',
                width: palW + 'px', height: Math.round(r.height - pad * 2 - barH - pad) + 'px'
            });

            const cx = r.left + pad * 2 + palW;
            const cw = Math.round(r.width - (pad * 3) - palW);
            const ch = Math.round(r.height - pad * 2 - barH - pad);
            Object.assign(this.canvas.style, {
                left: cx + 'px', top: (r.top + pad) + 'px',
                width: cw + 'px', height: ch + 'px'
            });
            this.canvas.width = cw;
            this.canvas.height = ch;

            Object.assign(this.statusEl.style, {
                left: (cx + cw - Math.round(Math.min(230, r.width * 0.17)) - pad) + 'px',
                top: (r.top + pad * 2) + 'px',
                width: Math.round(Math.min(230, r.width * 0.17)) + 'px'
            });

            // The tray stands over the middle of the canvas, clear of the
            // palette and of the bar that opens it.
            Object.assign(this.root.querySelector('.cl-presets').style, {
                left: (cx + Math.round(cw * 0.18)) + 'px',
                top: (r.top + pad * 2) + 'px',
                width: Math.round(Math.min(380, cw * 0.5)) + 'px',
                maxHeight: Math.round(ch * 0.8) + 'px'
            });

            Object.assign(this.root.querySelector('.cl-bar').style, {
                left: (r.left + pad) + 'px',
                top: (r.top + r.height - pad - barH) + 'px',
                width: Math.round(r.width - pad * 2) + 'px'
            });
            const dies = this.root.querySelector('.cl-dies');
            if (dies) Object.assign(dies.style, {
                left: (cx + pad) + 'px', top: (r.top + pad * 2) + 'px',
                width: Math.round(Math.min(230, r.width * 0.2)) + 'px'
            });
            this._dirty = true;
        }

        //--- input -----------------------------------------------------------
        bind() {
            this._onDown = e => {
                const item = e.target.closest('[data-tool]');
                const act = e.target.closest('[data-act]');
                const pin = e.target.closest('[data-pin]');
                const gate = e.target.closest('[data-gate]');
                const preset = e.target.closest('[data-preset]');
                if (preset) {
                    this.stamp(preset.dataset.preset);
                    this.showPresets(false);
                    e.preventDefault();
                    return;
                }
                if (gate) { this.pickGate(+gate.dataset.gate); e.preventDefault(); return; }
                if (item) { this.pickTool(+item.dataset.tool); e.preventDefault(); return; }
                if (act) { this.onAction(act.dataset.act); e.preventDefault(); return; }
                if (pin) { this.togglePin(+pin.dataset.pin); e.preventDefault(); return; }
                if (e.target !== this.canvas) return;
                e.preventDefault();
                if (e.button === 1) { this._panning = { x: e.clientX, y: e.clientY }; return; }
                // With a schematic in hand the click places it instead of
                // drawing, and the right button puts it back down again.
                if (this._pending) {
                    if (e.button === 2) { this.cancelStamp(); return; }
                    this.dropStamp(this.cellUnder(e));
                    return;
                }
                this._paint = e.button === 2 ? 2 : 1;
                this._last = null;
                this.paintAt(e);
            };
            this._onMove = e => {
                // The hovered cell is tracked whatever else is going on, because
                // the ghost has to follow the pointer before anything is pressed.
                if (e.target === this.canvas) {
                    const cell = this.cellUnder(e);
                    const changed = !cell !== !this._hover
                        || (cell && this._hover && (cell.x !== this._hover.x || cell.y !== this._hover.y));
                    this._hover = cell;
                    if (changed && this._pending) this._dirty = true;
                }
                if (this._panning) {
                    const z = this._lab.view.zoom;
                    this._lab.view.x -= (e.clientX - this._panning.x) * (this.pxScale() / z);
                    this._lab.view.y -= (e.clientY - this._panning.y) * (this.pxScale() / z);
                    this._panning = { x: e.clientX, y: e.clientY };
                    this.clampView();
                    this._dirty = true;
                    return;
                }
                if (this._paint) this.paintAt(e);
            };
            this._onUp = () => {
                this._paint = 0; this._panning = null; this._last = null;
                this._stampedChip = -1;
            };
            this._onWheel = e => {
                // RMMZ preventDefaults every wheel event on document, so a
                // panel that wants to scroll has to do it by hand. Without this
                // the palette could not be scrolled at all and everything below
                // the fold, the circuits included, was unreachable.
                const scroll = e.target.closest && e.target.closest('.cl-scroll');
                if (scroll) {
                    scroll.scrollTop += e.deltaY;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (e.target !== this.canvas) return;
                e.preventDefault();
                e.stopPropagation();
                this.zoomBy(e.deltaY > 0 ? 0.86 : 1.16);
            };
            this._onMenu = e => { if (e.target === this.canvas) e.preventDefault(); };

            this.root.addEventListener('mousedown', this._onDown, true);
            document.addEventListener('mousemove', this._onMove, true);
            document.addEventListener('mouseup', this._onUp, true);
            this.root.addEventListener('wheel', this._onWheel, true);
            this.root.addEventListener('contextmenu', this._onMenu, true);
        }

        unbind() {
            if (!this._onDown) return;
            this.root.removeEventListener('mousedown', this._onDown, true);
            document.removeEventListener('mousemove', this._onMove, true);
            document.removeEventListener('mouseup', this._onUp, true);
            this.root.removeEventListener('wheel', this._onWheel, true);
            this.root.removeEventListener('contextmenu', this._onMenu, true);
            this._onDown = null;
        }

        // The canvas is laid out in CSS pixels but drawn in its own, and on a
        // scaled game window those are not the same number.
        pxScale() {
            const r = this.canvas.getBoundingClientRect();
            return r.width ? this.canvas.width / r.width : 1;
        }

        cellUnder(e) {
            const r = this.canvas.getBoundingClientRect();
            const s = this.pxScale();
            const px = (e.clientX - r.left) * s;
            const py = (e.clientY - r.top) * s;
            const v = this._lab.view;
            const x = Math.floor(v.x + (px - this.canvas.width / 2) / v.zoom);
            const y = Math.floor(v.y + (py - this.canvas.height / 2) / v.zoom);
            return inGrid(x, y) ? { x: x, y: y } : null;
        }

        // Dragging paints a line rather than a dotted trail, because a mouse
        // moves further between two frames than one cell is wide.
        paintAt(e) {
            const cell = this.cellUnder(e);
            if (!cell) return;
            if (this._last) {
                let { x, y } = this._last;
                const dx = Math.sign(cell.x - x);
                const dy = Math.sign(cell.y - y);
                let guard = 0;
                while ((x !== cell.x || y !== cell.y) && guard++ < 600) {
                    if (x !== cell.x) x += dx;
                    else if (y !== cell.y) y += dy;
                    this.putCell(x, y);
                }
            } else {
                this.putCell(cell.x, cell.y);
            }
            this._last = cell;
        }

        putCell(x, y) {
            if (!inGrid(x, y)) return;
            const k = cellKey(x, y);
            const lab = this._lab;
            if (this._paint === 2) {
                // Rubbing out any cell of a package takes the whole package.
                if (lab.tiles[k] && lab.tiles[k].t === CT.CHIP) {
                    removeChip(lab.tiles, k);
                    this.onCircuitChanged();
                    return;
                }
                if (lab.tiles[k]) { delete lab.tiles[k]; this.onCircuitChanged(); }
                return;
            }
            if (lab.tool === CT.CHIP) {
                // Dropped by its top left corner, and only once: dragging a
                // twenty cell package across the board would carpet it.
                if (this._stampedChip === k) return;
                if (!placeChip(lab.tiles, x, y, lab.variant)) return;
                this._stampedChip = k;
                this.onCircuitChanged();
                return;
            }
            const cur = lab.tiles[k];
            if (cur && cur.t === CT.CHIP) return;   // never draw over a package
            if (cur && cur.t === lab.tool && cur.d === lab.dir && cur.v === lab.variant) return;
            lab.tiles[k] = { t: lab.tool, d: lab.dir, v: lab.variant };
            this.onCircuitChanged();
        }

        onCircuitChanged() {
            this._sim = new ChipSim(this._lab);
            this._dirty = true;
            this._chromeDirty = true;
        }

        pickTool(t) {
            const lab = this._lab;
            if (lab.tool === t) {
                lab.variant = (lab.variant + 1) % variantCount(t);
            } else {
                lab.tool = t;
                lab.variant = 0;
            }
            this._chromeDirty = true;
        }

        showPresets(on) {
            this._presetsOpen = !!on;
            const tray = this.root.querySelector('.cl-presets');
            if (tray) tray.classList.toggle('on', this._presetsOpen);
            this.root.querySelectorAll('[data-act="presets"]').forEach(b =>
                b.classList.toggle('on', this._presetsOpen));
        }

        // Picking a schematic does not put it down: it picks it up. The ghost
        // then follows the pointer until you click somewhere you want it, which
        // is the only way to place a thing the size of a processor without
        // guessing where the middle of the screen was.
        stamp(key) {
            const size = chipPresetSize(key);
            if (!size) return;
            this._pending = key;
            this._pendingSize = size;
            SoundManager.playCursor();
            this._message = T('HyperDeck.chip.placing', {
                name: T('HyperDeck.chip.preset.' + key)
            });
            this._chromeDirty = true;
            this._dirty = true;
        }

        cancelStamp() {
            if (!this._pending) return false;
            this._pending = null;
            this._pendingSize = null;
            this._message = '';
            this._chromeDirty = true;
            this._dirty = true;
            return true;
        }

        // Where the stamp's top left corner would land for a given cell, kept
        // inside the grid so a big one near an edge still goes down whole.
        stampOrigin(cell) {
            const size = this._pendingSize;
            if (!size || !cell) return null;
            return {
                x: Math.max(0, Math.min(CHIP_GRID - size.w, cell.x - (size.w >> 1))),
                y: Math.max(0, Math.min(CHIP_GRID - size.h, cell.y - (size.h >> 1)))
            };
        }

        dropStamp(cell) {
            const at = this.stampOrigin(cell);
            if (!at) return;
            const key = this._pending;
            const n = stampPreset(key, at.x, at.y);
            this._pending = null;
            this._pendingSize = null;
            if (n) SoundManager.playOk(); else SoundManager.playBuzzer();
            this._message = T('HyperDeck.chip.stamped', {
                name: T('HyperDeck.chip.preset.' + key), n: n
            });
            this.onCircuitChanged();
        }

        pickGate(i) {
            this._lab.tool = CT.GATE;
            this._lab.variant = i;
            this._chromeDirty = true;
        }

        togglePin(i) {
            this._lab.inputs[i] = this._lab.inputs[i] ? 0 : 1;
            this._sim.rebuild();
            this._dirty = true;
            this._chromeDirty = true;
        }

        zoomBy(f) {
            const v = this._lab.view;
            v.zoom = Math.max(2, Math.min(48, v.zoom * f));
            this.clampView();
            this._dirty = true;
        }

        clampView() {
            const v = this._lab.view;
            v.x = Math.max(0, Math.min(CHIP_GRID, v.x));
            v.y = Math.max(0, Math.min(CHIP_GRID, v.y));
        }

        onAction(act) {
            const lab = this._lab;
            switch (act) {
                case 'run':
                    this._running = !this._running;
                    SoundManager.playCursor();
                    break;
                case 'step':
                    this._sim.step();
                    this._dirty = true;
                    this._chromeDirty = true;
                    break;
                case 'speed':
                    lab.speed = lab.speed >= 16 ? 1 : lab.speed * 2;
                    SoundManager.playCursor();
                    break;
                case 'rotate':
                    lab.dir = (lab.dir + 1) % 4;
                    SoundManager.playCursor();
                    break;
                case 'variant':
                    lab.variant = (lab.variant + 1) % variantCount(lab.tool);

                    SoundManager.playCursor();
                    break;
                case 'presets':
                    this.showPresets(!this._presetsOpen);
                    SoundManager.playCursor();
                    break;
                case 'wipe':
                    this.showPresets(false);
                    lab.tiles = {};
                    SoundManager.playCancel();
                    this.onCircuitChanged();
                    break;
                case 'fab':
                    this.fabricate();
                    break;
                case 'done':
                    this.popScene();
                    return;
                default: break;
            }
            this._chromeDirty = true;
        }

        fabricate() {
            const out = fabricateChip();
            if (out.error) {
                SoundManager.playBuzzer();
                this._message = out.error === 'noScrap'
                    ? T('HyperDeck.chip.needScrap', { n: out.cost })
                    : T('HyperDeck.chip.fail.' + out.error);
            } else {
                SoundManager.playOk();
                this._message = T('HyperDeck.chip.made', { name: out.die.name, n: out.cost });
            }
            this._chromeDirty = true;
        }

        //--- the picture -----------------------------------------------------
        tileColour(tile, lit) {
            const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
            const rgb = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
            switch (tile.t) {
                case CT.WIRE: return rgb(mix([74, 26, 26], [255, 64, 48], lit));
                case CT.BRIDGE: return rgb(mix([92, 88, 78], [214, 150, 96], lit));
                case CT.SOURCE: return '#e2402c';
                case CT.TORCH: return lit ? '#ff6a3d' : '#5a3a30';
                case CT.REPEATER: return lit ? '#e8d24a' : '#6a6250';
                case CT.GATE: return lit ? '#7fd0ff' : '#3d5c72';
                case CT.IN: return lit ? '#93d86e' : '#3e5a34';
                case CT.OUT: return lit ? '#c8a2ff' : '#4a3d64';
                case CT.CLOCK: return lit ? '#ffd27a' : '#6b5a35';
                case CT.LAMP: return lit ? '#fff2c6' : '#4a4638';
                default: return '#333';
            }
        }

        glyph(tile) {
            switch (tile.t) {
                // ASCII on purpose: the panel font has no guarantee of a
                // logic glyph, and a missing one draws as a box.
                case CT.GATE: return GATE_GLYPH[GATE_KINDS[tile.v]] || '!';
                case CT.REPEATER: return String(tile.v + 1);
                case CT.CLOCK: return String(tile.v + 1);
                case CT.IN:
                case CT.OUT: return String(tile.v);
                case CT.TORCH: return 'i';
                default: return '';
            }
        }

        draw() {
            const ctx = this.ctx;
            const cw = this.canvas.width;
            const chh = this.canvas.height;
            const v = this._lab.view;
            const z = v.zoom;
            ctx.fillStyle = '#0b0d12';
            ctx.fillRect(0, 0, cw, chh);

            const ox = cw / 2 - v.x * z;
            const oy = chh / 2 - v.y * z;

            // The board edge, so it is clear where the die stops.
            ctx.strokeStyle = '#2c3550';
            ctx.lineWidth = 2;
            ctx.strokeRect(ox, oy, CHIP_GRID * z, CHIP_GRID * z);

            if (z >= 9) {
                ctx.strokeStyle = 'rgba(120,140,190,0.12)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                const x0 = Math.max(0, Math.floor(v.x - cw / (2 * z)));
                const x1 = Math.min(CHIP_GRID, Math.ceil(v.x + cw / (2 * z)));
                const y0 = Math.max(0, Math.floor(v.y - chh / (2 * z)));
                const y1 = Math.min(CHIP_GRID, Math.ceil(v.y + chh / (2 * z)));
                for (let x = x0; x <= x1; x++) {
                    ctx.moveTo(ox + x * z, oy + y0 * z);
                    ctx.lineTo(ox + x * z, oy + y1 * z);
                }
                for (let y = y0; y <= y1; y++) {
                    ctx.moveTo(ox + x0 * z, oy + y * z);
                    ctx.lineTo(ox + x1 * z, oy + y * z);
                }
                ctx.stroke();
            }

            // Only what was drawn is walked, never the whole grid: an empty lab
            // is a quarter of a million cells and none of them are worth a loop.
            const tiles = this._lab.tiles;
            const showGlyphs = z >= 13;
            if (showGlyphs) {
                ctx.font = Math.floor(z * 0.6) + "px '" + hudFont() + "', monospace";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
            }
            // Packages are drawn once, from their anchor, over the whole block
            // they cover rather than cell by cell.
            Object.keys(tiles).forEach(sk => {
                const k = +sk;
                const tile = tiles[k];
                if (tile.t !== CT.CHIP || tile.ox || tile.oy) return;
                const px = ox + cellX(k) * z;
                const py = oy + cellY(k) * z;
                const pw = CHIP_W * z;
                const ph = CHIP_H * z;
                if (px + pw < 0 || py + ph < 0 || px > cw || py > chh) return;
                const run = this._sim.chips && this._sim.chips[k];
                ctx.fillStyle = '#1b1b22';
                ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
                ctx.strokeStyle = run && !run.cpu.halted ? '#7fd0ff' : '#4a4a58';
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
                // The notch, which is how anybody has ever found pin one.
                ctx.fillStyle = '#0b0d12';
                ctx.beginPath();
                ctx.arc(px, py + ph / 2, z * 0.35, -Math.PI / 2, Math.PI / 2);
                ctx.fill();
                // Pin stubs on both long sides.
                ctx.fillStyle = '#c8c8c8';
                for (let i = 0; i < CHIP_W; i++) {
                    ctx.fillRect(px + i * z + z * 0.3, py - z * 0.22, z * 0.4, z * 0.22);
                    ctx.fillRect(px + i * z + z * 0.3, py + ph, z * 0.4, z * 0.22);
                }
                if (z >= 8) {
                    ctx.save();
                    ctx.fillStyle = '#e6c273';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = Math.floor(z * 0.9) + "px '" + hudFont() + "', monospace";
                    ctx.fillText('8066', px + pw / 2, py + ph / 2);
                    ctx.restore();
                }
            });

            Object.keys(tiles).forEach(sk => {
                const k = +sk;
                const tile = tiles[k];
                if (tile.t === CT.CHIP) return;
                const x = cellX(k);
                const y = cellY(k);
                const sx = ox + x * z;
                const sy = oy + y * z;
                if (sx + z < 0 || sy + z < 0 || sx > cw || sy > chh) return;
                const lit = this._sim.litness(k, tile);
                ctx.fillStyle = this.tileColour(tile, lit);
                if (tile.t === CT.WIRE) {
                    ctx.fillRect(sx + z * 0.22, sy + z * 0.22, z * 0.56, z * 0.56);
                    // Wire reaches towards whatever it touches, so a run reads
                    // as a run instead of a column of loose dots.
                    for (let d = 0; d < 4; d++) {
                        const n = this._sim.stepKey(k, d);
                        if (n < 0 || !tiles[n]) continue;
                        const w = z * 0.56;
                        const hx = sx + z * 0.22 + CD[d][0] * z * 0.39;
                        const hy = sy + z * 0.22 + CD[d][1] * z * 0.39;
                        ctx.fillRect(hx, hy, w, w);
                    }
                } else {
                    ctx.fillRect(sx + 1, sy + 1, Math.max(1, z - 2), Math.max(1, z - 2));
                }
                // Which way it faces, for everything that has a front.
                if (z >= 8 && (tile.t === CT.GATE || tile.t === CT.REPEATER
                    || tile.t === CT.TORCH)) {
                    ctx.fillStyle = '#0b0d12';
                    ctx.fillRect(sx + z / 2 + CD[tile.d][0] * z * 0.34 - z * 0.09,
                        sy + z / 2 + CD[tile.d][1] * z * 0.34 - z * 0.09, z * 0.18, z * 0.18);
                }
                if (showGlyphs) {
                    const g = this.glyph(tile);
                    if (g) {
                        ctx.fillStyle = lit ? '#0b0d12' : '#cfd6e6';
                        ctx.fillText(g, sx + z / 2, sy + z / 2);
                    }
                }
            });

            // The schematic waiting to be put down, drawn where it would land.
            if (this._pending && this._hover) {
                const at = this.stampOrigin(this._hover);
                const size = this._pendingSize;
                const gx = ox + at.x * z;
                const gy = oy + at.y * z;
                const ghost = chipPresetTiles(this._pending) || {};
                ctx.save();
                ctx.globalAlpha = 0.55;
                Object.keys(ghost).forEach(sk => {
                    const gk = +sk;
                    const tile = ghost[gk];
                    if (tile.t === CT.CHIP && (tile.ox || tile.oy)) return;
                    const tx = gx + (gk % CHIP_GRID) * z;
                    const ty = gy + Math.floor(gk / CHIP_GRID) * z;
                    ctx.fillStyle = tile.t === CT.CHIP ? '#7fd0ff'
                        : this.tileColour(tile, 0.4);
                    const w = tile.t === CT.CHIP ? CHIP_W * z : Math.max(1, z - 2);
                    const h = tile.t === CT.CHIP ? CHIP_H * z : Math.max(1, z - 2);
                    ctx.fillRect(tx + 1, ty + 1, w - 2, h - 2);
                });
                ctx.restore();
                ctx.strokeStyle = '#93d86e';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(gx, gy, size.w * z, size.h * z);
                ctx.setLineDash([]);
            }

            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        refreshChrome() {
            const lab = this._lab;
            const spec = chipDieSpec();
            const scrap = $dataItems[CHIP_SCRAP_ITEM];
            const held = scrap ? $gameParty.numItems(scrap) : 0;
            const cost = chipScrapCost();

            this.root.querySelector('.cl-gates').textContent = String(spec.gates);
            this.root.querySelector('.cl-tiles').textContent = String(chipTileCount());
            this.root.querySelector('.cl-rating').textContent =
                T('HyperDeck.unit.mhz', { n: spec.mhz }) + ' / ' + T('HyperDeck.unit.watt', { n: spec.watt });
            const costEl = this.root.querySelector('.cl-cost');
            costEl.textContent = T('HyperDeck.chip.scrap', { n: cost, held: held });
            costEl.style.color = held >= cost ? '' : 'var(--cl-red)';

            const outs = this._sim.outputs();
            let pins = '';
            for (let i = 0; i < CHIP_MAX_PINS; i++) {
                pins += `<div class="cl-pin ${lab.inputs[i] ? 'on' : ''} ${outs[i] ? 'lit' : ''}"
  data-pin="${i}">${i}</div>`;
            }
            this.pinsEl.innerHTML = pins;

            this.root.querySelectorAll('[data-tool]').forEach(el => {
                el.classList.toggle('on', +el.dataset.tool === lab.tool);
            });
            this.root.querySelectorAll('[data-gate]').forEach(el => {
                el.classList.toggle('on',
                    lab.tool === CT.GATE && +el.dataset.gate === lab.variant);
            });
            this.root.querySelectorAll('[data-var]').forEach(el => {
                const t = +el.dataset.var;
                el.textContent = t === lab.tool ? variantLabel(t, lab.variant) : '';
            });

            this.root.querySelector('[data-act="run"]').textContent =
                this._running ? T('HyperDeck.chip.pause') : T('HyperDeck.chip.run');
            this.root.querySelector('[data-act="speed"]').textContent =
                T('HyperDeck.chip.speed', { n: lab.speed });
            this.root.querySelector('[data-act="rotate"]').textContent =
                T('HyperDeck.chip.facing', { d: T('HyperDeck.chip.dir.' + lab.dir) });
            const fab = this.root.querySelector('[data-act="fab"]');
            fab.classList.toggle('bad', !spec.gates || held < cost);
            // A processor on the board is worth more than a tile count: show
            // what it is actually doing.
            const anchors = this._sim.chipAnchors ? this._sim.chipAnchors() : [];
            const regs = this.root.querySelector('.cl-regs');
            if (anchors.length && this._sim.chips && this._sim.chips[anchors[0]]) {
                const c = this._sim.chips[anchors[0]].cpu;
                const h = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
                regs.innerHTML = [
                    ['CS:IP', h(c.s[1], 4) + ':' + h(c.ip, 4)],
                    ['AX', h(c.r[0], 4)], ['BX', h(c.r[3], 4)],
                    ['CX', h(c.r[1], 4)], ['DX', h(c.r[2], 4)],
                    ['SP', h(c.r[4], 4)], ['FL', h(c.flags & 0x0FD5, 4)],
                    [T('HyperDeck.chip.bus'), h(c.bus.addr, 5)],
                    [T('HyperDeck.chip.instr'), String(c.instr)]
                ].map(([a, b2]) => `<div class="cl-line"><span>${esc(a)}</span><span>${esc(b2)}</span></div>`).join('');
                regs.style.display = '';
            } else {
                regs.innerHTML = '';
                regs.style.display = 'none';
            }
            this.root.querySelector('.cl-msg').textContent = this._message || '';
            this.refreshDies();
            this._chromeDirty = false;
        }

        // What the bench has etched so far and where each die is: fitted to
        // the deck, in the bag, or gone. The hosted editor shows it so the
        // desktop and the deck read the same shelf.
        refreshDies() {
            const el = this.root.querySelector('.cl-dies');
            if (!el) return;
            const dies = chipDies();
            const fitted = {};
            const d = deck();
            (d ? d.placed : []).forEach(rec => { fitted[rec.itemId] = true; });
            const rows = Object.keys(dies).map(id => {
                const die = dies[id];
                const item = $dataItems[id];
                const where = fitted[id] ? T('HyperDeck.chip.app.fitted')
                    : (item && $gameParty.numItems(item) > 0) ? T('HyperDeck.chip.app.inBag')
                        : T('HyperDeck.chip.app.gone');
                return `<div class="cl-die ${fitted[id] ? 'fitted' : ''}"><span>${esc(die.name)}</span><span>${esc(T('HyperDeck.unit.mhz', { n: die.mhz }))} ${esc(where)}</span></div>`;
            });
            el.innerHTML = `<div class="cl-line"><span>${esc(T('HyperDeck.chip.app.dies'))}</span><span>${rows.length} / ${CHIP_DIE_SLOTS}</span></div>`
                + (rows.length ? rows.join('') : `<div class="cl-die"><span>${esc(T('HyperDeck.chip.app.noDies'))}</span><span></span></div>`);
        }

        //--- the loop --------------------------------------------------------
        update() {
            super.update();
            this.layout();
            if (Input.isTriggered('cancel')) {
                if (this.cancelStamp()) return;
                if (this._presetsOpen) { this.showPresets(false); return; }
                this.popScene();
                return;
            }
            if (Input.isTriggered('tab')) { this.onAction('rotate'); }
            if (Input.isTriggered('shift')) { this.onAction('run'); }
            if (Input.isTriggered('pageup')) { this.onAction('variant'); }
            if (Input.isTriggered('pagedown')) { this.onAction('step'); }

            const v = this._lab.view;
            const pan = 24 / v.zoom;
            if (Input.isPressed('left')) { v.x -= pan; this._dirty = true; }
            if (Input.isPressed('right')) { v.x += pan; this._dirty = true; }
            if (Input.isPressed('up')) { v.y -= pan; this._dirty = true; }
            if (Input.isPressed('down')) { v.y += pan; this._dirty = true; }
            this.clampView();
            this.pump();
        }

        // The simulation, the chrome and the picture: one frame of the bench,
        // whichever screen it is on.
        pump() {
            if (this._running) {
                this._frame++;
                const every = Math.max(1, Math.round(16 / this._lab.speed));
                if (this._frame % every === 0) {
                    this._sim.step();
                    this._dirty = true;
                    this._chromeDirty = true;
                }
            }
            if (this._chromeDirty) this.refreshChrome();
            if (this._dirty) { this.draw(); this._dirty = false; }
        }

        terminate() {
            super.terminate();
            this.unbind();
            if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
            this.root = null;
        }
    }

    window.Scene_ChipLab = Scene_ChipLab;

    //-------------------------------------------------------------------------
    // The bench, as a HypernetOS program
    //-------------------------------------------------------------------------
    // The same bench inside a desktop window: the same lab on $gameSystem, the
    // same simulation, the same etching, so a circuit drawn on the desktop is
    // the one on the deck's bench and a die etched here goes in the bag like
    // any other. The scene's own methods draw it; only the host, the loop and
    // the way out differ.
    const CHIP_APP_ID = 'app-chiplab';   // i18n-ignore  app id

    function mountChipBench(hostEl, onDone) {
        const b = Object.create(Scene_ChipLab.prototype);
        b._running = false;
        b._frame = 0;
        b._dirty = true;
        b._paint = 0;
        b._last = null;
        b._lab = chipLab();
        b._sim = new ChipSim(b._lab);
        b.hostEl = hostEl;
        b.popScene = () => onDone();
        b.createDom();
        return b;
    }

    function registerChipBenchApp() {
        if (!window.HypernetOS || !window.HypernetOS.registerApp) return;
        let bench = null;
        window.HypernetOS.registerApp({
            id: CHIP_APP_ID,
            name: T('HyperDeck.chip.app.name'),
            icon: 84,
            desktopShortcut: false,
            category: 'accessories',   // i18n-ignore  category id
            launchFn: function () {
                const WM = window.HypernetOS.WindowManager;
                const win = WM.createWindow({
                    id: 'win-' + CHIP_APP_ID,
                    title: T('HyperDeck.chip.app.name'),
                    icon: 84,
                    width: 900,
                    height: 600,
                    contentHTML: '<div class="chip-bench-host"></div>'
                });
                const host = win.querySelector('.chip-bench-host');
                if (!host || host.dataset.mounted) return win;
                host.dataset.mounted = '1';
                host.style.cssText = 'position:absolute; left:0; top:0; width:100%; height:100%;';
                if (!chipLab()) return win;
                bench = mountChipBench(host, () => WM.closeWindow(win));
                win.addEventListener('hypernet-closed', () => {
                    if (bench) { bench.unbind(); if (bench.root && bench.root.parentNode) bench.root.parentNode.removeChild(bench.root); }
                    bench = null;
                });
                return win;
            },
            // The kernel ticks every running program once a frame.
            update: function () {
                if (!bench || !bench.root || !bench.root.isConnected) return;
                bench.layout();
                bench.pump();
            }
        });
    }
    registerChipBenchApp();

    //=========================================================================
    window.HyperDeck = {
        KINDS: KINDS,
        REQUIRED: REQUIRED,
        UNBOUNDED: UNBOUNDED,
        deck: deck,
        caseDef: caseDef,
        parts: () => (deck() ? deck().placed.slice() : []),
        parseComponent: parseComponent,
        isComponentItem: isComponentItem,
        catalogue: catalogue,
        rotateMask: rotateMask,
        maskCells: maskCells,
        occupancy: occupancy,
        canPlace: canPlace,
        place: place,
        recordAt: recordAt,
        removeAt: removeAt,
        specs: specs,
        // Is a part of this kind fitted and powered? The one question the rest
        // of the game asks about a Hyperdeck: a probe head only works when the
        // machine it is in could actually switch on.
        hasFitted(kind) {
            const s = specs();
            return !!s.kinds[kind] && s.draw <= s.supply;
        },
        // Is a part carrying this note tag fitted and powered? How the world
        // asks whether the deck in the bag can do a particular job, without the
        // rest of the game having to know what a component even is.
        hasFittedTag(tag) {
            const s = specs();
            if (s.draw > s.supply) return false;
            const re = new RegExp('<' + tag + '\\s*>', 'i');
            const d = deck();
            return (d ? d.placed : []).some(rec => {
                const item = $dataItems[rec.itemId];
                return !!(item && item.note && re.test(item.note));
            });
        },
        missingKinds: missingKinds,
        isOverdrawn: isOverdrawn,
        enduranceHours: enduranceHours,
        performanceIndex: performanceIndex,
        canBoot: canBoot,
        faults: faults,
        inventoryParts: inventoryParts,
        rollStartingDeck: rollStartingDeck,
        summary: summary,
        partNameFor: partNameFor,
        itemName: itemName,
        stripBoard: stripBoard,
        setCase: setCase,
        finish: finish,
        setFinish: setFinish,
        face: face,
        setFace: setFace,
        autoFit: autoFit,
        // Everything in the catalogue in the bag, plenty of scrap for the chip
        // lab, and a random machine already put together out of the whole of it.
        // What the free play arcade wants: no save behind it, so nothing to
        // unlock and nothing worth withholding.
        stockFreePlay() {
            if (!$gameParty || !$dataItems) return 0;
            let n = 0;
            catalogue().forEach(part => {
                const item = $dataItems[part.id];
                if (!item) return;
                const have = $gameParty.numItems(item);
                if (have < 2) { $gameParty.gainItem(item, 2 - have); }
                n++;
            });
            const scrap = $dataItems[CHIP_SCRAP_ITEM];
            if (scrap) {
                const have = $gameParty.numItems(scrap);
                if (have < 40) $gameParty.gainItem(scrap, 40 - have);
            }
            // Placed without spending the bag, so everything stays available to
            // pull off and try somewhere else.
            rollStartingDeck(Math.random, { everything: true });
            return n;
        },
        chipLab: chipLab,
        chipDieSpec: chipDieSpec,
        fabricateChip: fabricateChip,
        openChipLab() {
            if (window.Scene_ChipLab) SceneManager.push(window.Scene_ChipLab);
        },
        format: {
            mhz: fmtMhz, ram: fmtRam, store: fmtStore, watt: fmtWatt, mah: fmtMah,
            mb: fmtMb, kind: kindLabel, caseName: caseLabel
        },
        open() {
            if (window.Scene_HyperDeck) SceneManager.push(window.Scene_HyperDeck);
        }
    };

    //=========================================================================
    // The 3D view
    //=========================================================================
    // Much softer than the battle look: the deck is a small object read close
    // up, and a hard vertex snap turns a keyboard into a smear. The downscale
    // clamps back to 1, so the board is drawn at full resolution and the type
    // silkscreened on the parts stays legible.
    const PSX_SOFTEN = { vertexSnap: 2.8, colorLevels: 2, dither: 0.2, downscale: 1.2 };
    const softPSX = fn => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn) : fn();

    const LID_CLOSED = Math.PI * 0.985;
    // Just past upright, the angle a lid actually sits at.
    const LID_OPEN = Math.PI * 0.555;

    // How far the free look may be pushed, as a multiple of the framed distance.
    const ZOOM_MIN = 0.42;
    const ZOOM_MAX = 2.4;
    const PITCH_MIN = 0.06;
    const PITCH_MAX = 1.45;

    class DeckView {
        constructor(width, height) {
            this._w = width;
            this._h = height;
            this._disposables = [];
            this._partModels = [];
            this._heldList = [];
            this._faceList = [];
            this._time = 0;
            this._faceSlide = 0;
            softPSX(() => {
                this._initThree();
                this._buildDeck();
                if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
            });
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(48, this._w / this._h, 0.05, 60);
            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x000000, 0);

            // Lit like a thing on a bench: a broad soft fill so the moulding
            // glows the way clear plastic does, a warm key to pick out the
            // metal, a cool rim so the shell's edges separate from the desk,
            // and a dim bounce from below so the underside of the lid is not a
            // black hole.
            this.scene.add(new THREE.AmbientLight(0x9aa6bd, 0.62));
            const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x2b2438, 0.55);
            this.scene.add(hemi);
            const key = new THREE.DirectionalLight(0xfff1d6, 0.72);
            key.position.set(1.6, 3.4, 2.6);
            this.scene.add(key);
            const rim = new THREE.DirectionalLight(0x9ec8ff, 0.42);
            rim.position.set(-2.4, 1.8, -2.2);
            this.scene.add(rim);
            const bounce = new THREE.PointLight(0xc8a0ff, 0.5, 6);
            bounce.position.set(0, 0.35, 0.4);
            this.scene.add(bounce);
        }

        _mat(opts) {
            const m = new THREE.MeshLambertMaterial(opts);
            this._disposables.push(m);
            return m;
        }

        _geo(g) { this._disposables.push(g); return g; }

        _buildDeck() {
            this.caseDef = caseDef();
            this.bundle = window.HyperDeckModels.buildCase(
                THREE, this.caseDef, { finish: finish() });
            this._disposables = this._disposables.concat(this.bundle.disposables);
            this.scene.add(this.bundle.root);
            this.bundle.lidPivot.rotation.x = LID_CLOSED;

            const m = window.HyperDeckModels.metrics(this.caseDef);
            this.metrics = m;

            // The lower half, on a sled of its own so it can slide out of the
            // case and leave the board on show.
            this.faceSled = new THREE.Group();
            this.bundle.base.add(this.faceSled);
            this.buildFace();

            const cell = window.HyperDeckModels.CELL;
            this.gridGroup = new THREE.Group();
            this.bundle.base.add(this.gridGroup);
            this.gridGroup.visible = false;

            const lineMat = this._mat({
                color: 0x63c9a0, transparent: true, opacity: 0.32, depthWrite: false
            });
            for (let c = 0; c < this.caseDef.cols; c++) {
                for (let r = 0; r < this.caseDef.rows; r++) {
                    const p = window.HyperDeckModels.cellCentre(this.caseDef, c, r);
                    const q = new THREE.Mesh(
                        this._geo(new THREE.PlaneGeometry(cell * 0.9, cell * 0.9)), lineMat);
                    q.rotation.x = -Math.PI / 2;
                    // Just under where a part seats, so a fitted part covers
                    // the cells it occupies instead of being drawn over by
                    // them. The height used to be a fixed 0.033, which was
                    // above the board back when the board sat on top of the
                    // case and is above the parts now that it does not.
                    q.position.set(p.x, p.y - 0.001, p.z);
                    this.gridGroup.add(q);
                }
            }

            // A frame of four bars floating clear of the board rather than a
            // tinted quad on it: a quad under a fitted part is invisible, which
            // is exactly when the player most needs to see where they are.
            this.cursorMat = this._mat({ color: 0x7fe08a });
            this.cursor = new THREE.Group();
            this.cursorBars = [];
            const barGeo = this._geo(new THREE.BoxGeometry(1, 0.035, 0.035));
            for (let i = 0; i < 4; i++) {
                const bar = new THREE.Mesh(barGeo, this.cursorMat);
                if (i >= 2) bar.rotation.y = Math.PI / 2;
                this.cursor.add(bar);
                this.cursorBars.push(bar);
            }
            this.gridGroup.add(this.cursor);

            // The plane a mouse ray is cast against to find a cell.
            this.pickPlane = new THREE.Mesh(
                this._geo(new THREE.PlaneGeometry(m.boardW, m.boardD)),
                this._mat({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
            this.pickPlane.rotation.x = -Math.PI / 2;
            this.pickPlane.position.y = 0.034;
            this.bundle.base.add(this.pickPlane);

            this.heldGroup = new THREE.Group();
            this.bundle.base.add(this.heldGroup);
            this.partsGroup = new THREE.Group();
            this.partsGroup.visible = false;
            this.bundle.base.add(this.partsGroup);

        }

        buildFace() {
            this.clearGroup(this.faceSled, this._faceList);
            const group = window.HyperDeckModels.buildFace(
                THREE, this.caseDef, face(), { finish: finish() });
            if (window.PSXShader) softPSX(() => window.PSXShader.applyToObject(group));
            group.userData.disposables = group.userData.disposables || [];
            this.faceSled.add(group);
            this._faceList.push(group);
        }

        //--- models ----------------------------------------------------------
        clearGroup(group, list) {
            while (group.children.length) group.remove(group.children[0]);
            list.forEach(model => {
                (model.userData.disposables || []).forEach(x => x.dispose && x.dispose());
            });
            list.length = 0;
        }

        modelFor(data, rot) {
            const mask = rotateMask(data.mask, rot);
            const model = window.HyperDeckModels.buildComponent(THREE, {
                kind: data.kind,
                nature: data.nature,
                w: mask[0].length,
                h: mask.length,
                seed: data.id * 131
            });
            if (window.PSXShader) softPSX(() => window.PSXShader.applyToObject(model));
            return model;
        }

        footprintCentre(c, r, mask) {
            const cell = window.HyperDeckModels.CELL;
            const a = window.HyperDeckModels.cellCentre(this.caseDef, c, r);
            return {
                x: a.x + (mask[0].length - 1) * cell / 2,
                z: a.z + (mask.length - 1) * cell / 2
            };
        }

        syncParts() {
            this.clearGroup(this.partsGroup, this._partModels);
            (deck() ? deck().placed : []).forEach(rec => {
                const data = parseComponent(rec.itemId);
                if (!data) return;
                const model = this.modelFor(data, rec.rot);
                const mask = rotateMask(data.mask, rec.rot);
                const p = this.footprintCentre(rec.c, rec.r, mask);
                const seat = window.HyperDeckModels.cellCentre(caseDef(), 0, 0);
                model.position.set(p.x, seat.y, p.z);
                model.userData.record = rec;
                this.partsGroup.add(model);
                this._partModels.push(model);
            });
        }

        setHeld(data, rot) {
            this.clearGroup(this.heldGroup, this._heldList);
            if (!data) return;
            const model = this.modelFor(data, rot);
            this.heldGroup.add(model);
            this._heldList.push(model);
        }

        // 0 is seated in the case, 1 is fully slid out and clear of the board.
        setFaceSlide(target, dt) {
            this._faceSlide += (target - this._faceSlide) * Math.min(1, dt * 5);
            const m = this.metrics;
            // Slid forward and left there. It used to be switched off once it
            // was clear of the board, which meant the half you were choosing
            // was the one you could not see.
            this.faceSled.position.set(0, -this._faceSlide * 0.06, this._faceSlide * m.baseD * 1.05);
        }

        //--- framing ---------------------------------------------------------
        onLid(x, y, z) {
            const m = this.metrics;
            const sin = Math.sin(LID_OPEN);
            const cos = Math.cos(LID_OPEN);
            return new THREE.Vector3(
                x, y * cos - z * sin, -m.baseD / 2 + y * sin + z * cos);
        }

        shotPoints(shot) {
            const m = this.metrics;
            const lidD = this.bundle.lidDepth;
            const sz = this.bundle.screenSize;
            if (shot === 'boot') {
                const y = 0.13;
                return [
                    this.onLid(-sz.w / 2, y, -lidD / 2 - sz.h / 2),
                    this.onLid(sz.w / 2, y, -lidD / 2 - sz.h / 2),
                    this.onLid(-sz.w / 2, y, -lidD / 2 + sz.h / 2),
                    this.onLid(sz.w / 2, y, -lidD / 2 + sz.h / 2)
                ];
            }
            const base = [
                new THREE.Vector3(-m.baseW / 2, 0, m.baseD / 2),
                new THREE.Vector3(m.baseW / 2, 0, m.baseD / 2),
                new THREE.Vector3(-m.baseW / 2, 0, -m.baseD / 2),
                new THREE.Vector3(m.baseW / 2, 0, -m.baseD / 2)
            ];
            if (shot === 'board') {
                // The lid is out of this shot on purpose: including it would
                // spend most of the frame on a screen nobody is reading, and
                // the face slides forward, so the room it needs is booked here.
                // Far enough forward to keep the whole of the slid out lower
                // half in the picture, since it stays on show now.
                return base.concat([new THREE.Vector3(0, 0, m.baseD * 1.62)]);
            }
            return base.concat([
                this.onLid(-m.baseW / 2, 0, -lidD),
                this.onLid(m.baseW / 2, 0, -lidD)
            ]);
        }

        // Stands the camera off along `dir` until every point is inside the
        // picture. `edge` is how much of the frame may be used on each axis,
        // which is how the readouts down the sides are kept off the deck.
        fitShot(target, dir, points, edge) {
            if (!this._probe) {
                this._probe = new THREE.PerspectiveCamera(
                    this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
            }
            const cam = this._probe;
            cam.fov = this.camera.fov;
            cam.aspect = this.camera.aspect;
            cam.updateProjectionMatrix();

            const ex = (edge && edge.x) || 0.88;
            const ey = (edge && edge.y) || 0.88;
            let dist = 0.5;
            for (let step = 0; step < 32; step++) {
                cam.position.copy(dir).multiplyScalar(dist).add(target);
                cam.lookAt(target);
                cam.updateMatrixWorld(true);
                let worst = 0;
                for (const p of points) {
                    const v = p.clone().project(cam);
                    worst = Math.max(worst, Math.abs(v.x) / ex, Math.abs(v.y) / ey);
                }
                if (worst <= 1) break;
                dist *= Math.max(1.05, Math.min(2.2, worst));
            }
            return {
                pos: [cam.position.x, cam.position.y, cam.position.z],
                look: [target.x, target.y, target.z],
                dist: dist
            };
        }

        poses() {
            if (this._poses) return this._poses;
            const m = this.metrics;
            const lidD = this.bundle.lidDepth;
            const lidTop = lidD * Math.sin(LID_OPEN);
            const elevDir = e => new THREE.Vector3(0, Math.sin(e), Math.cos(e));
            const deckPts = this.shotPoints('deck');
            const screenCentre = this.onLid(0, 0.13, -lidD / 2);
            const normal = new THREE.Vector3(0, Math.cos(LID_OPEN), Math.sin(LID_OPEN));

            this._poses = {
                closed: this.fitShot(new THREE.Vector3(0, m.baseD * 0.22, 0),
                    elevDir(0.5), deckPts),
                idle: this.fitShot(new THREE.Vector3(0, lidTop * 0.42, -m.baseD * 0.08),
                    elevDir(0.24), deckPts),
                // All but straight down. Not exactly ninety degrees, because
                // lookAt with a world up of +Y has nothing left to work with
                // there and the picture rolls.
                board: this.fitShot(new THREE.Vector3(0, 0, m.baseD * 0.30),
                    elevDir(1.40), this.shotPoints('board'), { x: 0.56, y: 0.90 }),
                boot: this.fitShot(screenCentre, normal, this.shotPoints('boot'))
            };
            return this._poses;
        }

        //--- the free look ---------------------------------------------------
        // Seeded from the framed idle shot, so letting go of the controls leaves
        // the deck sitting where the framing put it.
        initOrbit() {
            if (this._orbit) return;
            const p = this.poses().idle;
            const look = new THREE.Vector3().fromArray(p.look);
            const off = new THREE.Vector3().fromArray(p.pos).sub(look);
            this._orbitBase = off.length();
            this._orbit = {
                target: look,
                yaw: Math.atan2(off.x, off.z),
                pitch: Math.asin(Math.max(-1, Math.min(1, off.y / off.length()))),
                dist: off.length()
            };
        }

        orbitPose() {
            this.initOrbit();
            const o = this._orbit;
            const cp = Math.cos(o.pitch);
            return {
                pos: [
                    o.target.x + Math.sin(o.yaw) * cp * o.dist,
                    o.target.y + Math.sin(o.pitch) * o.dist,
                    o.target.z + Math.cos(o.yaw) * cp * o.dist
                ],
                look: [o.target.x, o.target.y, o.target.z]
            };
        }

        turnOrbit(dYaw, dPitch) {
            this.initOrbit();
            this._orbit.yaw += dYaw;
            this._orbit.pitch = Math.max(PITCH_MIN,
                Math.min(PITCH_MAX, this._orbit.pitch + dPitch));
        }

        zoomOrbit(factor) {
            this.initOrbit();
            this._orbit.dist = Math.max(this._orbitBase * ZOOM_MIN,
                Math.min(this._orbitBase * ZOOM_MAX, this._orbit.dist * factor));
        }

        // Panning is the same idea in both shots: whatever is under the pointer
        // stays under it. In free look that moves the orbit target; over the
        // board it is an offset laid on top of the framed shot.
        panOrbit(dx, dy) {
            this.initOrbit();
            const o = this._orbit;
            const k = o.dist * 0.0018;
            const right = new THREE.Vector3(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
            const fwd = new THREE.Vector3(-Math.sin(o.yaw), 0, -Math.cos(o.yaw));
            o.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
            this.clampPan(o.target);
        }

        // Never far enough to lose the machine off the edge of the picture.
        clampPan(v) {
            const m = this.metrics;
            v.x = Math.max(-m.baseW, Math.min(m.baseW, v.x));
            v.z = Math.max(-m.baseD, Math.min(m.baseD, v.z));
            return v;
        }

        boardView() {
            if (!this._boardView) this._boardView = { zoom: 1, pan: new THREE.Vector3() };
            return this._boardView;
        }

        // The framed board shot with the player's zoom and pan on top of it, so
        // a big board can be read a corner at a time.
        boardPose() {
            const p = this.poses().board;
            const v = this.boardView();
            const look = new THREE.Vector3().fromArray(p.look).add(v.pan);
            const off = new THREE.Vector3().fromArray(p.pos)
                .sub(new THREE.Vector3().fromArray(p.look)).multiplyScalar(v.zoom);
            return { pos: look.clone().add(off).toArray(), look: look.toArray() };
        }

        zoomBoard(factor) {
            const v = this.boardView();
            v.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * factor));
        }

        // This shot is all but straight down, so screen right is +X and screen
        // up is -Z whatever case is fitted.
        panBoard(dx, dy) {
            const v = this.boardView();
            const k = this.metrics.baseW * v.zoom * 0.0016;
            v.pan.x -= dx * k;
            v.pan.z -= dy * k;
            this.clampPan(v.pan);
        }

        applyPose(pose, t) {
            if (!pose) return;
            if (!this._camPos) {
                this._camPos = new THREE.Vector3().fromArray(pose.pos);
                this._camLook = new THREE.Vector3().fromArray(pose.look);
            }
            const k = Math.min(1, t);
            this._camPos.lerp(new THREE.Vector3().fromArray(pose.pos), k);
            this._camLook.lerp(new THREE.Vector3().fromArray(pose.look), k);
            this.camera.position.copy(this._camPos);
            this.camera.lookAt(this._camLook);
        }

        applyCamera(name, t) { this.applyPose(this.poses()[name], t); }

        update(dt) {
            this._time += dt;
            this._heldList.forEach(model => {
                // Just clear of the rim, so a part in hand reads as held over
                // the case rather than floating somewhere above it. It used to
                // hover at 0.20, which was above the open lid.
                model.position.y = 0.085 + Math.sin(this._time * 3) * 0.008;
            });
        }

        render() {
            if (window.PSXShader) {
                softPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        dispose() {
            this.clearGroup(this.partsGroup, this._partModels);
            this.clearGroup(this.heldGroup, this._heldList);
            this.clearGroup(this.faceSled, this._faceList);
            this._disposables.forEach(x => x && x.dispose && x.dispose());
            this._disposables.length = 0;
            if (window.PSXShader && window.PSXShader.disposeContext) {
                window.PSXShader.disposeContext(this.renderer);
            }
            this.renderer.dispose();
            // Without this the browser force-loses the OLDEST live context,
            // which is the game's own PIXI canvas.
            if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
            this.renderer = null;
        }
    }

    //=========================================================================
    // The readouts, as HTML
    //=========================================================================
    // Real HTML rather than type painted into the 3D scene: a panel standing in
    // the world is read at whatever angle the camera happens to be at, and at
    // the sizes this scene works at that was not legible. The face and the
    // gold-on-black are the ones the tarot table and the bowling alley use, so
    // this reads as one interface with them.
    const HUD_ID = 'hyperdeck-hud';

    function hudFont() {
        return (window.PSXHud && window.PSXHud.font) ? window.PSXHud.font() : 'monospace';
    }

    function deco(key, fallback) {
        const d = window.PSXHud && window.PSXHud.DECO;
        return (d && d[key]) || fallback;
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    class DeckHud {
        constructor(scene) {
            this.scene = scene;
            this.open = '';
            this._style();
            this.root = document.createElement('div');
            this.root.id = HUD_ID;
            this.root.innerHTML = this._skeleton();
            document.body.appendChild(this.root);
            this.parts = this.root.querySelector('.hd-parts');
            this.spec = this.root.querySelector('.hd-spec');
            this.list = this.root.querySelector('.hd-list');
            this.specBody = this.root.querySelector('.hd-spec-body');
            this.req = this.root.querySelector('.hd-req');
            this.picker = this.root.querySelector('.hd-picker');
            this.bios = this.root.querySelector('.hd-bios');
            this._bind();
            this.layout();
        }

        _style() {
            if (document.getElementById(HUD_ID + '-style')) return;
            const st = document.createElement('style');
            st.id = HUD_ID + '-style';
            const gold = deco('gold', '#e6c273');
            const goldLo = deco('goldLo', '#8d6f2c');
            st.textContent = `
#${HUD_ID} { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
  z-index: 60; pointer-events: none; font-family: '${hudFont()}', monospace;
  -webkit-font-smoothing: none; }
#${HUD_ID} .hd-panel { position: absolute; pointer-events: auto;
  background: ${deco('black', '#08070b')}; color: ${deco('ink', '#f6e8c4')};
  border: 2px solid ${gold}; box-shadow: 0 0 0 2px var(--xp-black), 0 6px 22px rgba(0,0,0,0.75);
  display: none; flex-direction: column; }
#${HUD_ID} .hd-panel.on { display: flex; }
#${HUD_ID} .hd-head { background: ${gold}; color: var(--xp-black); padding: 4px 10px;
  letter-spacing: 2px; flex: 0 0 auto; }
#${HUD_ID} .hd-sub { color: ${gold}; letter-spacing: 2px; padding: 8px 10px 2px;
  border-top: 1px solid ${goldLo}; }
#${HUD_ID} .hd-list { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden;
  padding: 4px; min-height: 0; }
#${HUD_ID} .hd-row { display: flex; align-items: baseline; gap: 8px;
  padding: 5px 7px; cursor: pointer; border: 1px solid transparent; }
#${HUD_ID} .hd-row:hover { background: ${deco('selHi', '#43331a')}; }
#${HUD_ID} .hd-row.on { background: ${deco('sel', '#2a2010')}; border-color: ${gold}; }
#${HUD_ID} .hd-name { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
#${HUD_ID} .hd-kind, #${HUD_ID} .hd-qty { color: ${deco('dim', '#c0a468')}; }
#${HUD_ID} .hd-group { color: ${gold}; letter-spacing: 2px; padding: 6px 7px 2px;
  border-bottom: 1px solid ${goldLo}; margin-bottom: 2px; }
#${HUD_ID} .hd-list .hd-group:first-child { padding-top: 2px; }
#${HUD_ID} .hd-empty { color: ${deco('faint', '#7d6836')}; padding: 10px; }
#${HUD_ID} .hd-tools { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px;
  flex: 0 0 auto; border-top: 1px solid ${goldLo}; }
#${HUD_ID} .hd-btn { flex: 1 1 28%; text-align: center; cursor: pointer;
  padding: 6px 2px; color: ${gold}; border: 1px solid ${goldLo}; background: var(--xp-terminal); }
#${HUD_ID} .hd-btn:hover { background: ${deco('selHi', '#43331a')};
  color: ${deco('goldHi', '#fff2c6')}; }
#${HUD_ID} .hd-btn.on { border-color: ${deco('goldHi', '#fff2c6')};
  background: ${deco('sel', '#2a2010')}; }
#${HUD_ID} .hd-spec { overflow: hidden; }
#${HUD_ID} .hd-spec-scroll { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden;
  min-height: 0; }
#${HUD_ID} .hd-spec-body { padding: 6px 10px 8px; flex: 0 0 auto; }
/* Label left, figure right, and when the pair is too wide for the sheet the
   figure drops to its own line whole instead of breaking across two. */
#${HUD_ID} .hd-line { display: flex; flex-wrap: wrap; align-items: baseline;
  column-gap: 10px; padding: 3px 0; border-bottom: 1px solid ${deco('rule', '#241d10')}; }
#${HUD_ID} .hd-line:last-child { border-bottom: 0; }
#${HUD_ID} .hd-line span:first-child { color: ${deco('dim', '#c0a468')};
  flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
#${HUD_ID} .hd-line span:last-child { flex: 0 1 auto; margin-left: auto;
  white-space: nowrap; text-align: right; color: ${deco('goldHi', '#fff2c6')}; }
/* Figures never break; names and prose values are allowed to. */
#${HUD_ID} .hd-line.wrap span:last-child { white-space: normal;
  overflow-wrap: anywhere; }
#${HUD_ID} .hd-line.bad span:last-child { color: ${deco('red', '#d9533d')}; }
#${HUD_ID} .hd-req { display: flex; flex-wrap: wrap; column-gap: 10px; row-gap: 1px;
  padding: 4px 10px 8px; }
#${HUD_ID} .hd-req > div { flex: 1 1 42%; min-width: 0; overflow-wrap: anywhere; }
#${HUD_ID} .hd-yes { color: ${deco('green', '#93d86e')}; }
#${HUD_ID} .hd-no { color: ${deco('red', '#d9533d')}; }
#${HUD_ID} .hd-hint { color: ${deco('faint', '#7d6836')}; padding: 6px 10px;
  border-top: 1px solid ${goldLo}; flex: 0 0 auto; overflow-wrap: anywhere; }
#${HUD_ID} .hd-picker { position: absolute; pointer-events: auto; display: none;
  background: ${deco('black', '#08070b')}; color: ${deco('ink', '#f6e8c4')};
  border: 2px solid ${gold};
  box-shadow: 0 0 0 2px var(--xp-black), 0 8px 30px rgba(0,0,0,0.8); flex-direction: column; }
#${HUD_ID} .hd-picker.on { display: flex; }
#${HUD_ID} .hd-scroll { overflow-y: auto; }
#${HUD_ID} .hd-swatches { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; }
#${HUD_ID} .hd-swatch { width: 52px; height: 52px; cursor: pointer;
  border: 2px solid ${goldLo}; background: var(--xp-terminal); overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  color: ${deco('dim', '#c0a468')}; font-size: 0.7em; text-align: center; }
#${HUD_ID} .hd-swatch img { width: 100%; height: 100%; object-fit: cover; }
#${HUD_ID} .hd-swatch:hover { border-color: ${deco('goldHi', '#fff2c6')}; }
#${HUD_ID} .hd-swatch.on { border-color: ${deco('green', '#93d86e')}; }
#${HUD_ID} .hd-rows { display: flex; flex-direction: column; gap: 2px; padding: 8px; }
#${HUD_ID} .hd-pick { cursor: pointer; padding: 7px 10px; border: 1px solid ${goldLo};
  background: var(--xp-terminal); display: flex; justify-content: space-between; gap: 12px; }
#${HUD_ID} .hd-pick:hover { background: ${deco('selHi', '#43331a')}; }
#${HUD_ID} .hd-pick.on { border-color: ${deco('green', '#93d86e')}; }
#${HUD_ID} .hd-pick span:last-child { color: ${deco('dim', '#c0a468')}; }
/* The firmware screen. Blue, grey and cyan on purpose: this is the one part
   of the machine that predates anybody choosing how it should look. */
#${HUD_ID} .hd-bios { position: absolute; pointer-events: auto; display: none;
  background: var(--xp-navy-4); color: var(--xp-silver-2); flex-direction: column; padding: 0;
  border: 2px solid var(--xp-ink-pale-3); box-shadow: 0 0 0 2px var(--xp-black); }
#${HUD_ID} .hd-bios.on { display: flex; }
#${HUD_ID} .hd-bios-bar { background: var(--xp-ink-pale-3); color: var(--xp-navy-4); text-align: center;
  letter-spacing: 3px; padding: 4px 0; flex: 0 0 auto; }
#${HUD_ID} .hd-bios-banner { text-align: center; color: var(--xp-gray-light); padding: 8px 0 2px; }
#${HUD_ID} .hd-bios-sub { text-align: center; color: #7f9fd8; padding-bottom: 8px; }
#${HUD_ID} .hd-bios-tabs { display: flex; gap: 2px; padding: 0 10px; flex: 0 0 auto; }
#${HUD_ID} .hd-bios-tab { padding: 3px 16px; cursor: pointer; color: var(--xp-silver-2);
  border: 1px solid #5a5aa8; }
#${HUD_ID} .hd-bios-tab.on { background: var(--xp-ink-pale-3); color: var(--xp-navy-4); border-color: var(--xp-gray-light); }
#${HUD_ID} .hd-bios-body { flex: 1 1 auto; overflow-y: auto; min-height: 0;
  margin: 0 10px; padding: 8px 12px; border: 1px solid #5a5aa8; }
#${HUD_ID} .hd-bios-row { display: flex; justify-content: space-between; gap: 16px;
  padding: 2px 0; }
#${HUD_ID} .hd-bios-row span:first-child { color: #8f8f8f; }
#${HUD_ID} .hd-bios-row span:last-child { color: var(--xp-gray-light); }
#${HUD_ID} .hd-bios-fault { color: #ffd75f; padding: 2px 0; }
#${HUD_ID} .hd-bios-clean { color: var(--xp-green-6); padding: 2px 0; }
#${HUD_ID} .hd-bios-verdict { text-align: center; padding: 6px 0 2px; }
#${HUD_ID} .hd-bios-verdict.good { color: var(--xp-green-6); }
#${HUD_ID} .hd-bios-verdict.bad { color: #ff8f7f; }
#${HUD_ID} .hd-bios-keys { display: flex; gap: 4px; padding: 6px 10px 8px;
  flex: 0 0 auto; }
#${HUD_ID} .hd-bios-key { flex: 1 1 0; text-align: center; cursor: pointer;
  padding: 4px 0; background: var(--xp-ink-pale-3); color: var(--xp-navy-4); border: 1px solid var(--xp-gray-light); }
#${HUD_ID} .hd-bios-key:hover { background: var(--xp-gray-light); }
`;
            document.head.appendChild(st);
        }

        _skeleton() {
            return `
<div class="hd-panel hd-parts">
  <div class="hd-head">${esc(T('HyperDeck.rail.heading'))}</div>
  <div class="hd-list"></div>
  <div class="hd-tools">
    <div class="hd-btn" data-tool="auto">${esc(T('HyperDeck.tool.auto'))}</div>
    <div class="hd-btn" data-tool="clear">${esc(T('HyperDeck.tool.clear'))}</div>
    <div class="hd-btn" data-tool="chip">${esc(T('HyperDeck.tool.chip'))}</div>
    <div class="hd-btn" data-tool="case">${esc(T('HyperDeck.tool.case'))}</div>
    <div class="hd-btn" data-tool="finish">${esc(T('HyperDeck.tool.finish'))}</div>
    <div class="hd-btn" data-tool="bios">${esc(T('HyperDeck.tool.bios'))}</div>
    <div class="hd-btn" data-tool="boot">${esc(T('HyperDeck.tool.boot'))}</div>
  </div>
</div>
<div class="hd-panel hd-spec">
  <div class="hd-head">${esc(T('HyperDeck.specs.heading'))}</div>
  <div class="hd-spec-scroll">
    <div class="hd-spec-body"></div>
    <div class="hd-sub">${esc(T('HyperDeck.required.heading'))}</div>
    <div class="hd-req"></div>
  </div>
</div>
<div class="hd-picker"></div>
<div class="hd-bios"></div>`;
        }

        // Sized off the canvas, so the panels keep their share of the picture
        // whatever resolution the game is running at.
        layout() {
            const canvas = Graphics._canvas || document.getElementById('gameCanvas');
            const r = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
            if (!r || !r.width) return;
            const geom = [r.left, r.top, r.width, r.height].join('|');
            if (this._geom === geom) return;
            this._geom = geom;

            const pad = Math.round(r.width * 0.012);
            // The rail carries part names, which run long and wrap; the spec
            // sheet carries short figures, so it stays the narrower of the two.
            const railW = Math.round(Math.max(260, Math.min(520, r.width * 0.30)));
            const specW = Math.round(Math.max(210, Math.min(460, r.width * 0.27)));
            this.root.style.fontSize = Math.max(11, Math.round(r.width / 96)) + 'px';
            this.root.style.lineHeight = '1.45';

            Object.assign(this.parts.style, {
                left: (r.left + pad) + 'px', top: (r.top + Math.round(r.height * 0.09)) + 'px',
                width: railW + 'px', height: Math.round(r.height * 0.80) + 'px'
            });
            Object.assign(this.spec.style, {
                left: (r.left + r.width - pad - specW) + 'px',
                top: (r.top + Math.round(r.height * 0.09)) + 'px',
                width: specW + 'px', maxHeight: Math.round(r.height * 0.80) + 'px'
            });
            // Anchored to the foot of the parts panel, beside the tools that
            // open it, rather than floating over the middle of the board.
            const foot = r.top + Math.round(r.height * 0.89);
            Object.assign(this.picker.style, {
                left: (r.left + pad + railW + pad) + 'px',
                top: 'auto',
                bottom: Math.max(0, Math.round(window.innerHeight - foot)) + 'px',
                width: Math.round(Math.min(430, r.width * 0.30)) + 'px',
                maxHeight: Math.round(r.height * 0.62) + 'px'
            });
            Object.assign(this.bios.style, {
                left: (r.left + Math.round(r.width * 0.08)) + 'px',
                top: (r.top + Math.round(r.height * 0.07)) + 'px',
                width: Math.round(r.width * 0.84) + 'px',
                height: Math.round(r.height * 0.86) + 'px'
            });
        }

        _bind() {
            this.root.addEventListener('mousedown', e => {
                const row = e.target.closest('[data-row]');
                const btn = e.target.closest('[data-tool]');
                const fin = e.target.closest('[data-finish]');
                const cs = e.target.closest('[data-case]');
                const fc = e.target.closest('[data-face]');
                const bi = e.target.closest('[data-bios]');
                if (!row && !btn && !fin && !cs && !fc && !bi) return;
                e.preventDefault();
                e.stopPropagation();
                this.scene.claimClick();
                if (row) this.scene.onListPress(parseInt(row.dataset.row, 10));
                else if (btn) this.scene.onTool(btn.dataset.tool);
                else if (fin) this.scene.onFinishPicked(fin.dataset.finish);
                else if (cs) this.scene.onCasePicked(cs.dataset.case);
                else if (fc) this.scene.onFacePicked(fc.dataset.face);
                else if (bi) this.scene.onBiosAction(bi.dataset.bios);
            }, true);
            this.root.addEventListener('wheel', e => e.stopPropagation(), true);
        }

        show(mode) {
            this.parts.classList.toggle('on', mode === 'edit');
            this.spec.classList.toggle('on', mode === 'edit' || mode === 'idle');
            if (mode !== 'edit') { this.closePicker(); this.closeBios(); }
        }

        setList(entries, selected, focus) {
            if (!entries.length) {
                this.list.innerHTML = `<div class="hd-empty">${esc(T('HyperDeck.rail.empty'))}</div>`;
                return;
            }
            // The kind is a heading over its parts rather than a column beside
            // every one of them, which buys the name the whole width back.
            let kind = null;
            this.list.innerHTML = entries.map((entry, i) => {
                let head = '';
                if (entry.data.kind !== kind) {
                    kind = entry.data.kind;
                    head = `<div class="hd-group">${esc(kindLabel(kind))}</div>`;
                }
                return head + `
<div class="hd-row ${i === selected && focus === 'rail' ? 'on' : ''}" data-row="${i}">
  <span class="hd-name">${esc(itemName(entry.item))}</span>
  <span class="hd-qty">${esc(T('HyperDeck.rail.count', { n: entry.count }))}</span>
</div>`;
            }).join('');
            const on = this.list.querySelector('.hd-row.on');
            if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
        }

        setTools(focus, index) {
            this.root.querySelectorAll('[data-tool]').forEach((b, i) =>
                b.classList.toggle('on', focus === 'tools' && i === index));
        }

        setSpec() {
            const s = specs();
            // [label, value, bad, wraps]. Only the two prose values wrap; the
            // figures stay whole on one line so the sheet reads as a column.
            const rows = [
                [T('HyperDeck.specs.caseLabel'), caseLabel(caseDef()), false, true],
                [T('HyperDeck.specs.slots'),
                    T('HyperDeck.unit.cells', { used: s.used, total: s.cells }), false, false],
                [T('HyperDeck.specs.processor'), fmtMhz(s.mhz), false, false],
                [T('HyperDeck.specs.memory'), fmtRam(s.ram), false, false],
                [T('HyperDeck.specs.storage'), fmtStore(s.mb), false, false],
                [T('HyperDeck.specs.graphics'),
                    s.kinds.gpu ? fmtMb(s.vram)
                        : s.shared ? T('HyperDeck.value.integrated', { n: s.shared })
                            : T('HyperDeck.value.none'), false, !s.kinds.gpu],
                [T('HyperDeck.specs.battery'), fmtMah(s.mah), false, false],
                [T('HyperDeck.specs.draw'),
                    fmtWatt(s.draw) + ' / ' + fmtWatt(s.supply), s.draw > s.supply, false],
                [T('HyperDeck.specs.endurance'), enduranceHours(s)
                    ? T('HyperDeck.value.hours', { n: Math.round(enduranceHours(s) * 10) / 10 })
                    : T('HyperDeck.value.none'), false, false]
            ];
            this.specBody.innerHTML = rows.map(([k, v, bad, wrap]) =>
                `<div class="hd-line${bad ? ' bad' : ''}${wrap ? ' wrap' : ''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
            ).join('');
            this.req.innerHTML = REQUIRED.map(kind => {
                const has = !!s.kinds[kind];
                return `<div class="${has ? 'hd-yes' : 'hd-no'}">${has ? '+' : 'x'} ${esc(kindLabel(kind))}</div>`;
            }).join('');
        }

        // The finish tray, with the choice of lower half sitting under it,
        // because which face the machine wears is the same kind of decision.
        openFinishPicker(current) {
            const list = window.HyperDeckModels.SHELL_FINISHES;
            const now = face();
            this.picker.innerHTML = `
<div class="hd-head">${esc(T('HyperDeck.tool.finish'))}</div>
<div class="hd-scroll">
  <div class="hd-swatches">
    ${list.map(f => `<div class="hd-swatch ${f.id === (current || 'clear-violet') ? 'on' : ''}" data-finish="${esc(f.id)}"
      ${f.clear ? `style="background:#${f.clear.toString(16).padStart(6, '0')}"` : ''}>
      ${f.tex ? `<img src="img/textures/${esc(f.tex)}" alt="" loading="lazy" decoding="async">` : ''}
    </div>`).join('')}
  </div>
  <div class="hd-sub">${esc(T('HyperDeck.tool.face'))}</div>
  <div class="hd-rows">
    ${window.HyperDeckModels.FACES.map(f => `<div class="hd-pick ${f === now ? 'on' : ''}" data-face="${esc(f)}">
      <span>${esc(T('HyperDeck.face.' + f))}</span></div>`).join('')}
  </div>
</div>`;
            this.picker.classList.add('on');
            this.open = 'finish';
        }

        openCasePicker(current) {
            this.picker.innerHTML = `
<div class="hd-head">${esc(T('HyperDeck.tool.case'))}</div>
<div class="hd-scroll"><div class="hd-rows">
  ${window.HyperDeckModels.CASES.map(c => `<div class="hd-pick ${c.id === current ? 'on' : ''}" data-case="${esc(c.id)}">
    <span>${esc(T('HyperDeck.case.' + c.id))}</span>
    <span>${esc(T('HyperDeck.unit.grid', { cols: c.cols, rows: c.rows }))}</span></div>`).join('')}
</div></div>
<div class="hd-hint">${esc(T('HyperDeck.caseWarning'))}</div>`;
            this.picker.classList.add('on');
            this.open = 'case';
        }

        closePicker() {
            this.picker.classList.remove('on');
            this.open = '';
        }

        // The firmware screen, over the whole picture. Two pages, the numbers
        // and the complaints, and the verdict either way at the foot of both.
        openBios(page, tab) {
            const main = tab !== 'health';   // i18n-ignore  tab id
            const body = main
                ? page.rows.map(([k, v]) =>
                    `<div class="hd-bios-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')
                : (page.faults.length
                    ? page.faults.map(f => `<div class="hd-bios-fault">! ${esc(f.text)}</div>`).join('')
                    : `<div class="hd-bios-clean">${esc(T('HyperDeck.bios.noFaults'))}</div>`);
            this.bios.innerHTML = `
<div class="hd-bios-bar">${esc(T('HyperDeck.bios.heading'))}</div>
<div class="hd-bios-banner">${esc(T('HyperDeck.boot.banner'))}</div>
<div class="hd-bios-sub">${esc(T('HyperDeck.boot.copyright'))}</div>
<div class="hd-bios-tabs">
  <div class="hd-bios-tab ${main ? 'on' : ''}" data-bios="main">${esc(T('HyperDeck.bios.tabMain'))}</div>
  <div class="hd-bios-tab ${main ? '' : 'on'}" data-bios="health">${esc(T('HyperDeck.bios.tabHealth'))}</div>
</div>
<div class="hd-bios-body">${body}</div>
<div class="hd-bios-verdict ${page.canBoot ? 'good' : 'bad'}">${esc(page.canBoot
                ? T('HyperDeck.bios.willBoot') : T('HyperDeck.bios.willNotBoot'))}</div>
<div class="hd-bios-keys">
  <div class="hd-bios-key" data-bios="boot">${esc(T('HyperDeck.bios.boot'))}</div>
  <div class="hd-bios-key" data-bios="exit">${esc(T('HyperDeck.bios.exit'))}</div>
</div>`;
            this.bios.classList.add('on');
            this.open = 'bios';   // i18n-ignore  panel id
        }

        closeBios() {
            this.bios.classList.remove('on');
            this.open = '';
        }

        destroy() {
            if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
            this.root = null;
        }
    }

    //=========================================================================
    // The lid screen
    //=========================================================================
    const SCREEN_LEADING = 13;

    function paintScreen(canvas, lines, color) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#070a07';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let y = 0; y < canvas.height; y += 3) ctx.fillRect(0, y, canvas.width, 1);
        ctx.font = "11px '" + hudFont() + "', monospace";
        ctx.textBaseline = 'top';
        ctx.fillStyle = color || '#9fe8a4';
        // The panel scrolls rather than clipping, which is what the game's own
        // boot screen does when its sequence runs past the bottom.
        const fits = Math.floor((canvas.height - 14) / SCREEN_LEADING);
        const shown = lines.length > fits ? lines.slice(lines.length - fits) : lines;
        shown.forEach((line, i) => {
            let s = String(line);
            while (s.length > 2 && ctx.measureText(s).width > canvas.width - 16) s = s.slice(0, -1);
            ctx.fillText(s, 8, 8 + i * SCREEN_LEADING);
        });
    }

    //=========================================================================
    // Scene_HyperDeck
    //=========================================================================
    const MODE = { OPENING: 'opening', IDLE: 'idle', EDIT: 'edit', BOOT: 'boot', FAIL: 'fail' };
    const TOOLS = ['auto', 'clear', 'chip', 'case', 'finish', 'bios', 'boot'];

    // Boot pacing. A plain line goes up almost at once, a driver bar takes a
    // moment to fill, and the environment line sits there ticking its dots.
    const BOOT_LINE_TIME = 0.06;
    const BOOT_BAR_TIME = 0.3;
    const BOOT_DOTS_TIME = 0.6;
    const BOOT_TAIL = 1.1;
    const BOOT_BAR_CELLS = 20;
    // i18n-ignore-start  box drawing, the same glyphs the game's boot screen uses
    const BOOT_BAR_FULL = '\u2588';
    const BOOT_BAR_EMPTY = '\u2592';
    // i18n-ignore-end

    class Scene_HyperDeck extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._mode = MODE.OPENING;
            this._threeReady = typeof THREE !== 'undefined' && !!window.HyperDeckModels;
            this._lidAngle = LID_CLOSED;
            this._cursor = { c: 0, r: 0 };
            this._focus = 'grid';
            this._railIndex = 0;
            this._toolIndex = 0;
            this._held = null;
            this._heldRot = 0;
            this._bootLines = [];
            this._bootShown = 0;
            this._bootTimer = 0;
            this._domClaim = 0;
            this._dragging = false;
        }

        create() {
            super.create();
            this.bindMiddleDrag();
            if (!this._threeReady) return;
            this.createView();
            this._hud = new DeckHud(this);
            this._view.syncParts();
            this.refreshList();
            this.refreshSpec();
            this._hud.show('');
        }

        createBackground() {
            this._backgroundSprite = new Sprite();
            this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
            this.addChild(this._backgroundSprite);
            const dimmer = new Sprite();
            dimmer.bitmap = new Bitmap(Graphics.width, Graphics.height);
            dimmer.bitmap.fillAll('rgba(4, 6, 12, 0.66)');
            this.addChild(dimmer);
        }

        createView() {
            const scale = 0.9;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._view = new DeckView(w, h);
            const texture = PIXI.Texture.from(this._view.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._viewSprite = new PIXI.Sprite(texture);
            this._viewSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._viewSprite, idx);
            this._view.applyCamera('closed', 1);
            paintScreen(this._view.bundle.screenCanvas, []);
            this._view.bundle.screenTexture.needsUpdate = true;
        }

        // The whole view is rebuilt when the case or the shell changes, because
        // both of those are the case's geometry and its materials.
        // Anything in hand is dropped, which loses nothing: a part taken off the
        // board was already handed back when it was lifted, and one taken from
        // the list never left the bag in the first place.
        rebuildView() {
            if (this._viewSprite) {
                if (this._viewSprite.parent) this._viewSprite.parent.removeChild(this._viewSprite);
                this._viewSprite.destroy({ texture: true, baseTexture: true });
                this._viewSprite = null;
            }
            if (this._view) { this._view.dispose(); this._view = null; }
            this.createView();
            this._lidAngle = LID_OPEN;
            this._cursor = { c: 0, r: 0 };
            this._held = null;
            this._view.syncParts();
            this.applyModeToView();
            this.refreshList();
            this.refreshSpec();
        }

        //--- state -----------------------------------------------------------
        listEntries() {
            if (!this._list) this._list = inventoryParts();
            return this._list;
        }

        refreshList() {
            this._list = inventoryParts();
            if (this._railIndex >= this._list.length) {
                this._railIndex = Math.max(0, this._list.length - 1);
            }
            if (!this._hud) return;
            this._hud.setList(this._list, this._railIndex, this._focus);
            this._hud.setTools(this._focus, this._toolIndex);
        }

        refreshSpec() {
            if (!this._hud) return;
            this._hud.setSpec();
        }

        applyModeToView() {
            const editing = this._mode === MODE.EDIT;
            if (!this._view) return;
            this._view.gridGroup.visible = editing;
            this._view.partsGroup.visible = editing;
        }

        setMode(mode) {
            if (this._mode === mode) return;
            this._mode = mode;
            this.applyModeToView();
            if (this._hud) this._hud.show(mode === MODE.EDIT ? 'edit'
                : mode === MODE.IDLE ? 'idle' : '');
            if (this._view && (mode === MODE.IDLE || mode === MODE.EDIT)) {
                paintScreen(this._view.bundle.screenCanvas, []);
                this._view.bundle.screenTexture.needsUpdate = true;
            }
            this.refreshList();
            this.refreshSpec();
        }

        // A click the HTML has already dealt with must not also be a click into
        // the 3D scene underneath it.
        claimClick() { this._domClaim = 3; }

        //--- the middle button -----------------------------------------------
        // The middle button handler in TouchInput is empty, and holding it is
        // what pans here, so the scene watches the mouse itself. Movement is
        // banked in canvas pixels and read once a frame.
        bindMiddleDrag() {
            this._mid = { down: false, x: 0, y: 0, dx: 0, dy: 0 };
            const scale = () => {
                const c = Graphics._canvas;
                const r = c && c.getBoundingClientRect ? c.getBoundingClientRect() : null;
                return (r && r.width) ? Graphics.width / r.width : 1;
            };
            this._onMidDown = e => {
                if (e.button !== 1) return;
                // Otherwise the browser opens its own autoscroll cursor on it.
                e.preventDefault();
                this._mid.down = true;
                this._mid.x = e.clientX;
                this._mid.y = e.clientY;
            };
            this._onMidMove = e => {
                if (!this._mid.down) return;
                const k = scale();
                this._mid.dx += (e.clientX - this._mid.x) * k;
                this._mid.dy += (e.clientY - this._mid.y) * k;
                this._mid.x = e.clientX;
                this._mid.y = e.clientY;
            };
            this._onMidUp = e => { if (!e || e.button === 1) this._mid.down = false; };
            document.addEventListener('mousedown', this._onMidDown, true);
            document.addEventListener('mousemove', this._onMidMove, true);
            document.addEventListener('mouseup', this._onMidUp, true);
            window.addEventListener('blur', this._onMidUp, true);
        }

        unbindMiddleDrag() {
            if (!this._onMidDown) return;
            document.removeEventListener('mousedown', this._onMidDown, true);
            document.removeEventListener('mousemove', this._onMidMove, true);
            document.removeEventListener('mouseup', this._onMidUp, true);
            window.removeEventListener('blur', this._onMidUp, true);
            this._onMidDown = this._onMidMove = this._onMidUp = null;
        }

        // The movement banked since the last frame, or nothing.
        takeMiddleDrag() {
            const m = this._mid;
            if (!m || (!m.dx && !m.dy)) return null;
            const out = { dx: m.dx, dy: m.dy };
            m.dx = 0;
            m.dy = 0;
            return out;
        }

        // Wheel and the analog triggers, which pull the camera in and out in
        // both shots. The trigger direction matches the free look.
        readZoomInput() {
            let factor = 1;
            if (TouchInput.wheelY) factor *= TouchInput.wheelY > 0 ? 1.09 : 0.92;
            const pads = window.AnalogStickInput;
            if (pads && pads.hasPad && pads.hasPad()) {
                const z = (pads.rightTrigger ? pads.rightTrigger() : 0)
                    - (pads.leftTrigger ? pads.leftTrigger() : 0);
                if (z) factor *= 1 + z * 0.03;
            }
            return factor === 1 ? 0 : factor;
        }

        //--- update ----------------------------------------------------------
        update() {
            super.update();
            if (!this._threeReady) {
                if (Input.isTriggered('cancel') || Input.isTriggered('ok')) this.popScene();
                return;
            }
            const dt = 1 / 60;
            if (this._domClaim > 0) this._domClaim--;
            if (this._hud) this._hud.layout();
            this.updateLid(dt);
            this.updateMode(dt);
            this._view.setFaceSlide(this._mode === MODE.EDIT ? 1 : 0, dt);
            this._view.update(dt);
            this.updateCursorVisual();
            this._view.render();
            if (this._viewSprite && this._viewSprite.texture) this._viewSprite.texture.update();
        }

        updateLid(dt) {
            this._lidAngle += (LID_OPEN - this._lidAngle) * Math.min(1, dt * 4.5);
            this._view.bundle.lidPivot.rotation.x = this._lidAngle;
            if (this._mode === MODE.OPENING && Math.abs(this._lidAngle - LID_OPEN) < 0.02) {
                this.setMode(MODE.IDLE);
            }
        }

        updateMode(dt) {
            switch (this._mode) {
                case MODE.OPENING:
                    this._view.applyCamera('idle', dt * 2.2);
                    break;
                case MODE.IDLE:
                    this._view.applyPose(this._view.orbitPose(), dt * 18);
                    this.updateIdleInput();
                    break;
                case MODE.EDIT:
                    this._view.applyPose(this._view.boardPose(), dt * 5);
                    this.updateEditInput();
                    break;
                case MODE.BOOT:
                    this._view.applyCamera('boot', dt * 3.4);
                    this.updateBoot(dt);
                    break;
                case MODE.FAIL:
                    this._view.applyCamera('boot', dt * 3.4);
                    if (Input.isTriggered('ok') || Input.isTriggered('cancel')
                        || (TouchInput.isTriggered() && !this._domClaim)) {
                        SoundManager.playCancel();
                        this.setMode(MODE.IDLE);
                    }
                    break;
            }
        }

        //--- the free look ---------------------------------------------------
        updateIdleInput() {
            if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.popScene(); return; }
            if (Input.isTriggered('shift')) { this.focusBoard(); return; }
            if (Input.isTriggered('ok')) { this.powerOn(); return; }

            // Arrows turn the deck; the shoulder buttons pull the camera in and
            // out, which is also what the wheel does.
            const turn = 0.035;
            if (Input.isPressed('left')) this._view.turnOrbit(turn, 0);
            if (Input.isPressed('right')) this._view.turnOrbit(-turn, 0);
            if (Input.isPressed('up')) this._view.turnOrbit(0, turn * 0.7);
            if (Input.isPressed('down')) this._view.turnOrbit(0, -turn * 0.7);
            if (Input.isPressed('pageup')) this._view.zoomOrbit(0.97);
            if (Input.isPressed('pagedown')) this._view.zoomOrbit(1.03);

            const pads = window.AnalogStickInput;
            if (pads && pads.hasPad && pads.hasPad()) {
                const rx = pads.rightX ? pads.rightX() : 0;
                const ry = pads.rightY ? pads.rightY() : 0;
                if (rx || ry) this._view.turnOrbit(-rx * 0.05, -ry * 0.035);
            }

            const zoom = this.readZoomInput();
            if (zoom) this._view.zoomOrbit(zoom);
            const pan = this.takeMiddleDrag();
            if (pan) this._view.panOrbit(pan.dx, pan.dy);
            this.updateDragLook();
        }

        // Press and move turns the deck; press and release without moving is a
        // click on whichever half was under the pointer.
        updateDragLook() {
            if (TouchInput.isTriggered() && !this._domClaim) {
                this._pressAt = { x: TouchInput.x, y: TouchInput.y };
                this._dragging = false;
            }
            if (TouchInput.isPressed() && this._pressAt) {
                const dx = TouchInput.x - this._pressAt.x;
                const dy = TouchInput.y - this._pressAt.y;
                if (!this._dragging && Math.abs(dx) + Math.abs(dy) > 6) this._dragging = true;
                if (this._dragging) {
                    this._view.turnOrbit(-dx * 0.006, -dy * 0.004);
                    this._pressAt = { x: TouchInput.x, y: TouchInput.y };
                }
            }
            if (TouchInput.isReleased() && this._pressAt) {
                const wasDrag = this._dragging;
                this._pressAt = null;
                this._dragging = false;
                if (!wasDrag && !this._domClaim) this.clickHalf();
            }
        }

        clickHalf() {
            const hit = this.pickObject();
            if (!hit) return;
            if (this.hitHas(hit, 'isPowerButton') || this.hitIn(hit, this._view.bundle.lidPivot)) {
                this.powerOn();
            } else if (this.hitIn(hit, this._view.bundle.base)) {
                this.focusBoard();
            }
        }

        hitHas(hit, flag) {
            let o = hit.object;
            while (o) { if (o.userData && o.userData[flag]) return true; o = o.parent; }
            return false;
        }

        hitIn(hit, root) {
            let o = hit.object;
            while (o) { if (o === root) return true; o = o.parent; }
            return false;
        }

        focusBoard() {
            SoundManager.playOk();
            this._focus = this.listEntries().length ? 'rail' : 'grid';
            this.setMode(MODE.EDIT);
            this._view.syncParts();
        }

        //--- editing ---------------------------------------------------------
        updateEditInput() {
            if (this._hud.open === 'bios') {
                if (Input.isTriggered('cancel')) this.onBiosAction('exit');
                else if (Input.isTriggered('ok')) this.onBiosAction('boot');
                else if (Input.isRepeated('left') || Input.isRepeated('right')) {
                    this.onBiosAction(this._biosTab === 'health' ? 'main' : 'health');
                }
                return;
            }
            if (this._hud.open) {
                if (Input.isTriggered('cancel')) {
                    SoundManager.playCancel();
                    this._hud.closePicker();
                }
                return;
            }
            if (Input.isTriggered('cancel')) {
                if (this._held) this.returnHeld();
                else { SoundManager.playCancel(); this.setMode(MODE.IDLE); }
                return;
            }
            if (this._held && (Input.isTriggered('pageup') || Input.isTriggered('pagedown')
                || Input.isTriggered('tab'))) {
                this._heldRot = (this._heldRot + (Input.isTriggered('pageup') ? 3 : 1)) % 4;
                SoundManager.playCursor();
                this._view.setHeld(this._held.data, this._heldRot);
                this.clampCursor();
                return;
            }
            if (Input.isTriggered('ok')) { this.confirmEdit(); return; }
            // The same camera controls the free look has: the wheel or the
            // analog triggers pull in and out, the middle button slides the
            // board around under them.
            const zoom = this.readZoomInput();
            if (zoom) this._view.zoomBoard(zoom);
            const pan = this.takeMiddleDrag();
            if (pan) this._view.panBoard(pan.dx, pan.dy);
            this.updateEditNav();
            this.updateEditDrag();
        }

        updateEditNav() {
            const def = caseDef();
            if (this._focus === 'tools') {
                if (Input.isRepeated('left') && this._toolIndex > 0) {
                    this._toolIndex--; SoundManager.playCursor(); this.refreshList();
                } else if (Input.isRepeated('right') && this._toolIndex < TOOLS.length - 1) {
                    this._toolIndex++; SoundManager.playCursor(); this.refreshList();
                } else if (Input.isRepeated('up')) {
                    this._focus = 'rail'; SoundManager.playCursor(); this.refreshList();
                }
                return;
            }
            if (this._focus === 'rail' && !this._held) {
                if (Input.isRepeated('up') && this._railIndex > 0) {
                    this._railIndex--; SoundManager.playCursor(); this.refreshList();
                } else if (Input.isRepeated('down')) {
                    if (this._railIndex < this.listEntries().length - 1) {
                        this._railIndex++; SoundManager.playCursor(); this.refreshList();
                    } else {
                        this._focus = 'tools'; SoundManager.playCursor(); this.refreshList();
                    }
                } else if (Input.isRepeated('right')) {
                    this._focus = 'grid'; SoundManager.playCursor(); this.refreshList();
                }
                return;
            }
            let moved = false;
            if (Input.isRepeated('left')) {
                if (this._cursor.c > 0) { this._cursor.c--; moved = true; }
                else if (!this._held && this.listEntries().length) {
                    this._focus = 'rail'; SoundManager.playCursor(); this.refreshList(); return;
                }
            }
            if (Input.isRepeated('right') && this._cursor.c < def.cols - 1) { this._cursor.c++; moved = true; }
            if (Input.isRepeated('up') && this._cursor.r > 0) { this._cursor.r--; moved = true; }
            if (Input.isRepeated('down') && this._cursor.r < def.rows - 1) { this._cursor.r++; moved = true; }
            if (moved) { SoundManager.playCursor(); this.clampCursor(); }
        }

        // Real drag and drop: press on a fitted part to lift it, move to carry
        // it, release over a legal cell to seat it. Releasing anywhere illegal
        // keeps it in hand rather than dropping it into the void.
        updateEditDrag() {
            if (this._domClaim) return;
            const cell = this.cellFromRay();
            if (cell && (TouchInput.isPressed() || this._held)) {
                this._cursor = cell;
                this.clampCursor();
            }
            if (TouchInput.isTriggered()) {
                if (!this._held && cell) {
                    this._cursor = cell;
                    this.takeFromBoard(true);
                }
            }
            if (TouchInput.isReleased() && this._held && cell) {
                if (canPlace(this._held.itemId, this._cursor.c, this._cursor.r, this._heldRot)) {
                    this.dropHeld();
                }
            }
        }

        clampCursor() {
            const def = caseDef();
            let maxC = def.cols - 1;
            let maxR = def.rows - 1;
            if (this._held) {
                const mask = rotateMask(this._held.data.mask, this._heldRot);
                maxC = def.cols - mask[0].length;
                maxR = def.rows - mask.length;
            }
            this._cursor.c = Math.max(0, Math.min(maxC, this._cursor.c));
            this._cursor.r = Math.max(0, Math.min(maxR, this._cursor.r));
        }

        confirmEdit() {
            if (this._hud.open) return;
            if (this._focus === 'tools') { this.onTool(TOOLS[this._toolIndex]); return; }
            if (this._held) { this.dropHeld(); return; }
            if (this._focus === 'rail') { this.takeFromList(); return; }
            this.takeFromBoard();
        }

        takeFromList() {
            const entry = this.listEntries()[this._railIndex];
            if (!entry) { SoundManager.playBuzzer(); return; }
            this._held = { itemId: entry.item.id, data: entry.data };
            this._heldRot = 0;
            this._focus = 'grid';
            SoundManager.playOk();
            this._view.setHeld(entry.data, 0);
            this.clampCursor();
            this.refreshList();
        }

        takeFromBoard(quiet) {
            const rec = recordAt(this._cursor.c, this._cursor.r);
            if (!rec) { if (!quiet) SoundManager.playBuzzer(); return; }
            const data = parseComponent(rec.itemId);
            removeAt(this._cursor.c, this._cursor.r);
            this._held = { itemId: rec.itemId, data: data };
            this._heldRot = rec.rot;
            this._cursor = { c: rec.c, r: rec.r };
            SoundManager.playOk();
            this._view.setHeld(data, this._heldRot);
            this._view.syncParts();
            this.clampCursor();
            this.refreshList();
            this.refreshSpec();
        }

        dropHeld() {
            const held = this._held;
            if (!canPlace(held.itemId, this._cursor.c, this._cursor.r, this._heldRot)) {
                SoundManager.playBuzzer();
                return;
            }
            place(held.itemId, this._cursor.c, this._cursor.r, this._heldRot, true);
            SoundManager.playOk();
            this._held = null;
            this._view.setHeld(null);
            this._view.syncParts();
            this.refreshList();
            this.refreshSpec();
        }

        // Cancelling a held part always puts it back in the bag, whichever end
        // it came from, so a part can never be lost between the two.
        returnHeld() {
            SoundManager.playCancel();
            this._held = null;
            this._view.setHeld(null);
            this.refreshList();
            this.refreshSpec();
        }

        updateCursorVisual() {
            if (this._mode !== MODE.EDIT || !this._view) return;
            const cell = window.HyperDeckModels.CELL;
            const mask = this._held ? rotateMask(this._held.data.mask, this._heldRot) : [[1]];
            const p = this._view.footprintCentre(this._cursor.c, this._cursor.r, mask);
            const w = mask[0].length * cell;
            const d = mask.length * cell;
            const bars = this._view.cursorBars;
            bars[0].scale.x = w; bars[0].position.set(0, 0, -d / 2);
            bars[1].scale.x = w; bars[1].position.set(0, 0, d / 2);
            bars[2].scale.x = d; bars[2].position.set(-w / 2, 0, 0);
            bars[3].scale.x = d; bars[3].position.set(w / 2, 0, 0);
            // Above the tallest fitted part but under the rim: the whole point
            // of the frame is that it stays visible over a part, and the whole
            // point of it being low is that it belongs to the board.
            this._view.cursor.position.set(p.x, 0.05, p.z);
            const legal = !this._held
                || canPlace(this._held.itemId, this._cursor.c, this._cursor.r, this._heldRot);
            this._view.cursorMat.color.setHex(legal ? 0x7fe08a : 0xe2726a);
            this._view.heldGroup.position.set(p.x, 0, p.z);
            this._view.cursor.visible = this._focus === 'grid' || !!this._held;
        }

        //--- the HTML talking back -------------------------------------------
        onListPress(index) {
            this._focus = 'rail';
            this._railIndex = index;
            this.refreshList();
            if (this._held) this.returnHeld();
            else this.takeFromList();
        }

        onTool(tool) {
            this._focus = 'tools';
            this._toolIndex = Math.max(0, TOOLS.indexOf(tool));
            if (tool === 'auto') {
                const n = autoFit();
                if (n) SoundManager.playOk(); else SoundManager.playBuzzer();
                this._view.syncParts();
                this.refreshList();
                this.refreshSpec();
            } else if (tool === 'clear') {
                // The opposite of auto-fit: everything comes off the board and
                // goes back in the bag, so a bad layout can be started again.
                if (this._held) this.returnHeld();
                const n = stripBoard();
                if (n) SoundManager.playCancel(); else SoundManager.playBuzzer();
                this._view.syncParts();
                this.refreshList();
                this.refreshSpec();
            } else if (tool === 'chip') {
                // The lab is a scene of its own: it needs the whole window and
                // a mouse that is not also dragging parts around a board.
                SoundManager.playOk();
                if (window.Scene_ChipLab) SceneManager.push(window.Scene_ChipLab);
            } else if (tool === 'case') {
                SoundManager.playOk();
                this._hud.openCasePicker(deck().caseId);
            } else if (tool === 'finish') {
                SoundManager.playOk();
                this._hud.openFinishPicker(finish());
            } else if (tool === 'bios') {
                SoundManager.playOk();
                this.openBios();
            } else if (tool === 'boot') {
                // The same thing as clicking the panel, reachable without
                // having to find the screen with the mouse first.
                this.powerOn();
                return;
            }
            if (this._hud) this._hud.setTools(this._focus, this._toolIndex);
        }

        onCasePicked(id) {
            if (setCase(id)) {
                SoundManager.playOk();
                this._hud.closePicker();
                this.rebuildView();
            } else {
                this._hud.closePicker();
            }
        }

        onFinishPicked(id) {
            setFinish(id);
            SoundManager.playOk();
            this.rebuildView();
            this._hud.openFinishPicker(finish());
        }

        onFacePicked(id) {
            setFace(id);
            SoundManager.playOk();
            this._view.buildFace();
            this._hud.openFinishPicker(finish());
        }

        // The firmware screen the machine shows before it has an operating
        // system to show anything with: full screen, blue, and drawn here. The
        // Archways XP BIOS window is a different thing, for a machine that is
        // already running.
        openBios() {
            this._biosTab = this._biosTab || 'main';   // i18n-ignore  tab id
            this._hud.openBios(this.biosPage(), this._biosTab);
        }

        biosPage() {
            const s = specs();
            return {
                rows: [
                    [T('HyperDeck.specs.caseLabel'), caseLabel(caseDef())],
                    [T('HyperDeck.specs.processor'), fmtMhz(s.mhz)],
                    [T('HyperDeck.specs.memory'), fmtRam(s.ram)],
                    [T('HyperDeck.specs.storage'), fmtStore(s.mb)],
                    [T('HyperDeck.specs.graphics'),
                        s.vram ? fmtMb(s.vram) : T('HyperDeck.value.none')],
                    [T('HyperDeck.specs.battery'), fmtMah(s.mah)],
                    [T('HyperDeck.specs.draw'), fmtWatt(s.draw) + ' / ' + fmtWatt(s.supply)],
                    [T('HyperDeck.specs.slots'),
                        T('HyperDeck.unit.cells', { used: s.used, total: s.cells })]
                ],
                faults: faults(),
                canBoot: canBoot()
            };
        }

        onBiosAction(act) {
            if (act === 'boot') {
                this._hud.closeBios();
                this.powerOn();
                return;
            }
            if (act === 'exit') {
                SoundManager.playCancel();
                this._hud.closeBios();
                return;
            }
            this._biosTab = act;
            SoundManager.playCursor();
            this._hud.openBios(this.biosPage(), this._biosTab);
        }

        //--- picking ---------------------------------------------------------
        pickObject() {
            if (!this._view) return null;
            const hits = this.raycaster().intersectObjects(this._view.scene.children, true);
            return hits.length ? hits[0] : null;
        }

        raycaster() {
            if (!this._ray) this._ray = new THREE.Raycaster();
            const x = (TouchInput.x / Graphics.width) * 2 - 1;
            const y = -(TouchInput.y / Graphics.height) * 2 + 1;
            this._ray.setFromCamera({ x: x, y: y }, this._view.camera);
            return this._ray;
        }

        cellFromRay() {
            const hits = this.raycaster().intersectObject(this._view.pickPlane, false);
            if (!hits.length) return null;
            const local = this._view.pickPlane.worldToLocal(hits[0].point.clone());
            const def = caseDef();
            const m = this._view.metrics;
            const cell = window.HyperDeckModels.CELL;
            // The pick plane is rotated flat, so its local y runs backwards
            // along world z.
            const c = Math.floor((local.x + m.boardW / 2) / cell);
            const r = Math.floor((m.boardD / 2 - local.y) / cell);
            if (c < 0 || r < 0 || c >= def.cols || r >= def.rows) return null;
            return { c: c, r: r };
        }

        //--- power on --------------------------------------------------------
        powerOn() {
            const missing = missingKinds();
            const overdrawn = isOverdrawn();
            if (missing.length || overdrawn) {
                SoundManager.playBuzzer();
                this.showPostFailure(missing, overdrawn);
                return;
            }
            SoundManager.playOk();
            this._bootLines = this.buildBootLines();
            this._bootShown = 0;
            this._bootTimer = 0;
            this._bootHold = 0;
            this._bootHoldFull = 0;
            if (this._hud) this._hud.show('');
            this.setMode(MODE.BOOT);
        }

        // The machine posts the way the game itself does: this is the boot
        // screen out of js/main.js, line for line, with the deck's own fitted
        // hardware standing in where that one has nothing to read off.
        // A line is a string, a { bar } driver that fills in, or the { dots }
        // one that ticks while the environment loads.
        buildBootLines() {
            const s = specs();
            const lines = [
                T('HyperDeck.boot.banner'),
                T('HyperDeck.boot.copyright'),
                '',
                T('HyperDeck.boot.firmware'),
                '',
                T('HyperDeck.boot.processor', { name: partNameFor('cpu', 'mhz') || fmtMhz(s.mhz) }),
                s.ram === Infinity
                    ? T('HyperDeck.boot.memoryInfinite')
                    : T('HyperDeck.boot.memory', { size: fmtRam(s.ram) }),
                s.kinds.gpu
                    ? T('HyperDeck.boot.quantum', { size: fmtMb(s.vram) })
                    : T('HyperDeck.boot.quantumShared', { size: fmtMb(s.shared) }),
                T('HyperDeck.boot.storage', { size: fmtStore(s.mb) }),
                T('HyperDeck.boot.cell', { size: fmtMah(s.mah) }),
                '',
                T('HyperDeck.boot.detectMaster'),
                T('HyperDeck.boot.detectBioslave'),
                T('HyperDeck.boot.detectNeural'),
                T('HyperDeck.boot.detectMana'),
                s.kinds.modem
                    ? T('HyperDeck.boot.detectUplink')
                    : T('HyperDeck.boot.detectNoUplink'),
                '',
                T('HyperDeck.boot.loadingFiles'),
                { bar: T('HyperDeck.boot.driverKernel') },
                { bar: T('HyperDeck.boot.driverMagic') },
                { bar: T('HyperDeck.boot.driverLink') },
                '',
                T('HyperDeck.boot.protocols'),
                T('HyperDeck.boot.manaFlow'),
                T('HyperDeck.boot.ethereal'),
                { dots: T('HyperDeck.boot.loading') },
                '',
                T('HyperDeck.boot.ready')
            ];
            return lines.map(line => (typeof line === 'string' ? { text: line } : line));
        }

        // One driver bar, filled to `t`. Twenty cells wide, the same as the one
        // on the game's boot screen.
        bootBar(entry, t) {
            const filled = Math.max(0, Math.min(BOOT_BAR_CELLS,
                Math.round(t * BOOT_BAR_CELLS)));
            return T('HyperDeck.boot.driverLine', {
                name: entry.bar,
                bar: BOOT_BAR_FULL.repeat(filled)
                    + BOOT_BAR_EMPTY.repeat(BOOT_BAR_CELLS - filled),
                pct: Math.round((filled / BOOT_BAR_CELLS) * 100)
            });
        }

        bootText(entry, index) {
            const newest = index === this._bootShown - 1;
            if (entry.bar) {
                const t = newest && this._bootHoldFull
                    ? 1 - Math.max(0, this._bootHold) / this._bootHoldFull : 1;
                return this.bootBar(entry, t);
            }
            if (entry.dots) {
                const n = newest ? Math.floor(this._bootTimer * 10) % 4 : 3;
                return entry.dots + '.'.repeat(n);
            }
            return entry.text;
        }

        revealBootLine() {
            const entry = this._bootLines[this._bootShown];
            this._bootShown++;
            this._bootHoldFull = entry.bar ? BOOT_BAR_TIME
                : entry.dots ? BOOT_DOTS_TIME : BOOT_LINE_TIME;
            this._bootHold = this._bootHoldFull;
        }

        updateBoot(dt) {
            this._bootTimer += dt;
            if (this._bootHold === undefined) this._bootHold = 0;
            this._bootHold -= dt;
            if (this._bootHold <= 0 && this._bootShown < this._bootLines.length) {
                this.revealBootLine();
            }
            // Repainted every frame: a bar filling and the trailing dots both
            // move without a line being added.
            paintScreen(this._view.bundle.screenCanvas,
                this._bootLines.slice(0, this._bootShown)
                    .map((entry, i) => this.bootText(entry, i)));
            this._view.bundle.screenTexture.needsUpdate = true;

            if (this._bootShown >= this._bootLines.length && this._bootHold <= -BOOT_TAIL) {
                this._bootTimer = -999;
                if (window.Scene_HypernetOS) {
                    // The desktop about to come up runs on this board: its
                    // fitted parts are the hardware every OS app reports.
                    if (window.HypernetOS && window.HypernetOS.Host) window.HypernetOS.Host.bootFrom('hyperdeck');   // i18n-ignore  profile id
                    SceneManager.push(window.Scene_HypernetOS);
                } else {
                    console.warn('HyperDeck: Scene_HypernetOS is not defined; the deck booted into nothing.');
                    this.setMode(MODE.IDLE);
                }
            }
        }

        showPostFailure(missing, overdrawn) {
            const s = specs();
            const lines = [
                T('HyperDeck.boot.banner'),
                T('HyperDeck.boot.firmware'),
                '',
                overdrawn ? T('HyperDeck.post.overdrawHeading') : T('HyperDeck.post.failHeading'),
                ''
            ];
            missing.forEach(kind => {
                lines.push(T('HyperDeck.post.failLine', { kind: kindLabel(kind) }));
            });
            if (overdrawn) lines.push(T('HyperDeck.post.overdrawLine', { n: s.draw - s.supply }));
            lines.push('');
            lines.push(T('HyperDeck.post.failFooter'));
            paintScreen(this._view.bundle.screenCanvas, lines, '#e2726a');
            this._view.bundle.screenTexture.needsUpdate = true;
            if (this._hud) this._hud.show('');
            this.setMode(MODE.FAIL);
        }

        //--- teardown --------------------------------------------------------
        terminate() {
            super.terminate();
            this.unbindMiddleDrag();
            if (this._hud) { this._hud.destroy(); this._hud = null; }
            if (this._viewSprite) {
                if (this._viewSprite.parent) this._viewSprite.parent.removeChild(this._viewSprite);
                this._viewSprite.destroy({ texture: true, baseTexture: true });
                this._viewSprite = null;
            }
            if (this._view) { this._view.dispose(); this._view = null; }
        }
    }

    window.Scene_HyperDeck = Scene_HyperDeck;

    const pluginName = 'HyperDeck';
    PluginManager.registerCommand(pluginName, 'OpenHyperDeck', () => {
        SceneManager.push(Scene_HyperDeck);
    });
})();
