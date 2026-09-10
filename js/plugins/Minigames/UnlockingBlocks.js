/*:
 * @target MZ
 * @plugindesc v3.0 Unlocking Blocks: a low-poly PSX tumbler puzzle played on the ground the party stands on
 * @author Omni-Lex
 *
 * @param difficultyDefault
 * @text Default Difficulty
 * @desc Default difficulty level (1-10) if not specified
 * @type number
 * @min 1
 * @max 10
 * @default 5
 *
 * @param timeMultiplier
 * @text Time Limit Multiplier
 * @desc Multiplier for time limit calculation
 * @type number
 * @decimals 1
 * @min 0.5
 * @max 3.0
 * @default 1.0
 *
 * @param speedMultiplier
 * @text Speed Multiplier
 * @desc Multiplier for drop speed calculation
 * @type number
 * @decimals 1
 * @min 0.5
 * @max 3.0
 * @default 1.0
 *
 * @command startMinigame
 * @text Start Unlocking Blocks
 * @desc Start the Unlocking Blocks lockpicking minigame
 *
 * @arg difficulty
 * @text Difficulty
 * @desc Difficulty level (1-10)
 * @type number
 * @min 1
 * @max 10
 * @default 5
 *
 * @arg successSwitch
 * @text Success Switch
 * @desc Switch ID to turn ON if player succeeds
 * @type switch
 * @default 0
 *
 * @arg failureSwitch
 * @text Failure Switch
 * @desc Switch ID to turn ON if player fails
 * @type switch
 * @default 0
 *
 * @arg successSelfSwitch
 * @text Success Self Switch
 * @desc Self switch (A, B, C, D) to turn ON if player succeeds
 * @type select
 * @option None
 * @value
 * @option A
 * @value A
 * @option B
 * @value B
 * @option C
 * @value C
 * @option D
 * @value D
 * @default
 *
 * @arg failureSelfSwitch
 * @text Failure Self Switch
 * @desc Self switch (A, B, C, D) to turn ON if player fails
 * @type select
 * @option None
 * @value
 * @option A
 * @value A
 * @option B
 * @value B
 * @option C
 * @value C
 * @option D
 * @value D
 * @default
 *
 * @arg crimeKey
 * @text Crime on Success
 * @desc Preset crime to add when lockpicking succeeds. Select "None" for no crime.
 * @type select
 * @option None
 * @value none
 * @option Trespassing
 * @value trespassing
 * @option Breaking and Entering
 * @value breakingAndEntering
 * @option Unlawful Entry
 * @value unlawfulEntry
 * @option Burglary
 * @value burglary
 * @option Petty Theft
 * @value pettyTheft
 * @option Grand Theft
 * @value grandTheft
 * @option Vehicle Theft
 * @value vehicleTheft
 * @option Carjacking
 * @value carjacking
 * @default none
 *
 * @help
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * Picking a lock is a falling-block puzzle of its own: the keyway is nine
 * wards across and sixteen deep, its two walls already cut into the tooth
 * profile of the key that belongs to this lock, and the pick feeds one bit in
 * at a time. Fill a row across, wards included, and the lock turns; let the
 * keyway seize, or run out of time, and the pick snaps off in it.
 *
 * The bits are key bits, not the pieces of any other game: single pins and
 * short bars in a cheap lock, then five cell profiles, then pierced bits with
 * a hole through the middle, then the long toothed combs of a strongroom. A
 * lock earns one more tier of them every three steps of its complexity, and
 * the wards bite deeper as it does.
 *
 * ----------------------------------------------------------------------------
 * The view
 * ----------------------------------------------------------------------------
 * The cylinder is real geometry rendered with three.js through the shared
 * PSXShader, the same look the chess table, the bowling alley and the tarot
 * parlour wear, composited over the battleback of wherever the party is
 * standing (BattleSystem/AnimatedBattleBackgrounds.js) so a lock forced in a
 * sewer does not look like a lock forced in a meadow. The readouts are the
 * shared art deco PSXHud. Without three.js the same board falls back to flat
 * bitmap tiles and everything else still works.
 *
 * ----------------------------------------------------------------------------
 * Tools
 * ----------------------------------------------------------------------------
 * A skeleton key (item 740) opens the lock outright and is consumed. Otherwise
 * the party needs a lockpick (item 374); a failed attempt snaps it. With no
 * pick in the bag but the steel to make one, the party is offered the recipe on
 * the spot (Quest/ThinkerMenu.js owns the blueprint, this only asks for it).
 *
 * ============================================================================
 * How to Use
 * ============================================================================
 *
 * RPG Maker MV:
 * UnlockingBlocks start [difficulty] [successSwitch] [failureSwitch] [successSelfSwitch] [failureSelfSwitch]
 *
 * RPG Maker MZ:
 * Use the plugin command menu and select "Start Lockpick Minigame".
 *
 * The difficulty affects the drop speed, the time limit, how deep the wards
 * are cut, which tiers of bit the lock deals and how much of the keyway is
 * already packed with pins. Lockpicking training (specialization
 * 161) eases the lock by one step every two tiers.
 */

var Imported = Imported || {};
Imported.UnlockingBlocks = true;

var UnlockingBlocks = UnlockingBlocks || {};
UnlockingBlocks.version = 3.0;

(function () {
    'use strict';

    const PLUGIN = 'UnlockingBlocks';
    const t = (key, params) =>
        (typeof window.T === 'function' ? window.T(PLUGIN + '.' + key, params) : key);

    const SKELETON_KEY_ID = 740;
    const LOCKPICK_ID = 374;
    const LOCK_SPEC = 'Lockpicking';

    // A keyway, not a well: nine wards across and sixteen deep. Nothing here
    // shares a dimension, a piece set or a rule with any commercial falling
    // block game; the pieces are key bits and the walls are the wards they are
    // cut to pass.
    const COLS = 9;
    const ROWS = 16;

    // Kept on the namespace: the older board constants were public and other
    // code (and the test harness) reads them.
    UnlockingBlocks.BOARD_WIDTH = COLS;
    UnlockingBlocks.BOARD_HEIGHT = ROWS;
    UnlockingBlocks.BLOCK_SIZE = 24;

    // Pins, not toy blocks: brass, steel and the oxides they wear. Index 0 is
    // the empty cell, so a kind is also its colour. The last kind is the ward
    // iron already cut into the sides of the keyway.
    UnlockingBlocks.COLORS = [
        '#000000',
        '#c9a227', // brass
        '#5aa981', // verdigris
        '#8b97a8', // steel
        '#e6c273', // gold plate
        '#b2453c', // garnet
        '#5a79c2', // cobalt
        '#c07a3e', // copper
        '#4a4640'  // ward iron
    ];

    // The kind reserved for the wards cut into the walls of the keyway.
    const WARD_KIND = 8;
    UnlockingBlocks.WARD_KIND = WARD_KIND;

    // The bits a pick can feed into the keyway. Nothing in here is a
    // tetromino: the small tiers are single pins and short bars, and every
    // shape from tier two up is either five cells or more, pierced with a gap,
    // or split across the piece the way a warded key's teeth are. Each cell
    // carries its own kind so a rotated bit keeps its colour.
    //
    // The tiers are the whole difficulty curve of the shapes: an easy lock
    // only ever deals tier 1, and a strongroom deals all four.
    UnlockingBlocks.SHAPE_TIERS = [
        // Tier 1: the plain pins and bars of a cheap lock.
        [
            [[1]],                                       // pin
            [[2], [2]],                                  // post
            [[3, 3]],                                    // bar
            [[4, 0], [4, 4]],                            // heel
            [[5, 5], [0, 5]]                             // toe
        ],
        // Tier 2: five cell bits, the first shapes with a real profile.
        [
            [[1, 0, 1], [1, 1, 1]],                      // fork
            [[0, 2, 0], [2, 2, 2], [0, 2, 0]],           // cross
            [[3, 0, 0], [3, 3, 0], [0, 3, 3]],           // stair
            [[4, 0, 0], [4, 0, 0], [4, 4, 4]],           // elbow
            [[5, 5, 5], [0, 5, 0], [0, 5, 0]]            // tang
        ],
        // Tier 3: pierced bits. The hole in the middle is the part that has to
        // be filled from somewhere else.
        [
            [[1, 1, 1], [1, 0, 1], [1, 1, 1]],           // collar
            [[2, 0, 2], [2, 2, 2], [2, 0, 2]],           // double tooth
            [[3, 3, 3, 3], [0, 0, 3, 0], [0, 0, 3, 0]],  // shank
            [[4, 0, 4], [4, 4, 4], [0, 4, 0]],           // wishbone
            [[0, 5, 0], [5, 5, 5], [5, 0, 5]]            // crown
        ],
        // Tier 4: the strongroom bits, long and awkward, with teeth that leave
        // holes wherever they land.
        [
            [[1, 0, 1, 0, 1], [1, 1, 1, 1, 1]],          // comb
            [[2, 0, 0, 0], [2, 2, 0, 0], [0, 2, 2, 0], [0, 0, 2, 2]], // serpent
            [[3, 0, 0], [3, 3, 3], [3, 0, 3], [3, 0, 0]],// claw
            [[4, 4, 0, 4, 4], [0, 4, 4, 4, 0]],          // bow
            [[0, 5, 0], [5, 5, 5], [0, 5, 0], [5, 0, 5]] // skeleton bit
        ]
    ];

    // The flat catalogue every renderer indexes into, and the tier each entry
    // belongs to. A lock deals out of the tiers it has earned.
    UnlockingBlocks.SHAPES = [];
    UnlockingBlocks.SHAPE_TIER_OF = [];
    UnlockingBlocks.SHAPE_TIERS.forEach((tier, index) => {
        for (const shape of tier) {
            UnlockingBlocks.SHAPES.push(shape);
            UnlockingBlocks.SHAPE_TIER_OF.push(index);
        }
    });
    const SHAPES = UnlockingBlocks.SHAPES;

    // The largest cell count any bit in the catalogue has, so a renderer can
    // size its pools once instead of assuming a four cell piece.
    UnlockingBlocks.maxShapeCells = function () {
        let most = 1;
        for (const shape of SHAPES) {
            let count = 0;
            for (const row of shape) {
                for (const kind of row) if (kind) count++;
            }
            if (count > most) most = count;
        }
        return most;
    };

    // Which tiers a lock of this complexity feeds the pick. One more tier
    // every three steps, so a garden gate deals pins and a vault deals combs.
    UnlockingBlocks.shapeTierCount = function (difficulty) {
        const d = Math.min(Math.max(Math.floor(difficulty || 1), 1), 10);
        return Math.min(1 + Math.floor((d - 1) / 3), UnlockingBlocks.SHAPE_TIERS.length);
    };

    // The pool of catalogue indices a lock of this complexity draws from.
    UnlockingBlocks.shapePool = function (difficulty) {
        const tiers = UnlockingBlocks.shapeTierCount(difficulty);
        const pool = [];
        UnlockingBlocks.SHAPE_TIER_OF.forEach((tier, index) => {
            if (tier < tiers) pool.push(index);
        });
        return pool;
    };

    const clone = (shape) => shape.map(row => row.slice());

    //=========================================================================
    // The board model. Pure logic, no sprites and no globals, so the whole
    // puzzle can be played out in a test harness without a renderer.
    //=========================================================================

    // Bag draw: every bit in the lock's pool is dealt once before any of them
    // comes round again. A lock that deals four combs in a row is not a hard
    // lock, it is a broken one.
    class PieceBag {
        constructor(rng, pool) {
            this._rng = rng || Math.random;
            this._pool = (pool && pool.length) ? pool.slice() : SHAPES.map((s, i) => i);
            this._items = [];
        }

        next() {
            if (!this._items.length) {
                this._items = this._pool.slice();
                for (let i = this._items.length - 1; i > 0; i--) {
                    const j = Math.floor(this._rng() * (i + 1));
                    const swap = this._items[i];
                    this._items[i] = this._items[j];
                    this._items[j] = swap;
                }
            }
            return this._items.pop();
        }
    }

    class LockBoard {
        constructor(options) {
            const o = options || {};
            this.cols = o.cols || COLS;
            this.rows = o.rows || ROWS;
            this.rng = o.rng || Math.random;
            this.grid = [];
            for (let y = 0; y < this.rows; y++) this.grid.push(new Array(this.cols).fill(0));
            this.difficulty = o.difficulty || 1;
            this.pool = o.pool || UnlockingBlocks.shapePool(this.difficulty);
            this.bag = new PieceBag(this.rng, this.pool);
            this.piece = null;
            this.pos = { x: 0, y: 0 };
            this.nextKind = this.bag.next();
            this.toppedOut = false;
            this.clearedRows = [];
        }

        //--- the wards -------------------------------------------------------
        // The sides of the keyway are not straight: they are cut into the
        // profile of the key that belongs to this lock, teeth of ward iron
        // biting in from the left and the right. They fill like any other cell,
        // so a row that ends on a tooth needs fewer bits to align, and a row
        // between two teeth needs a bit narrow enough to reach in.
        //
        // The mouth of the keyway is always left clear so a bit can be fed in.
        cutWards(maxDepth, runLength) {
            const widest = this.pool.reduce(
                (w, index) => Math.max(w, SHAPES[index][0].length), 1);
            const room = Math.max(0, Math.floor((this.cols - widest) / 2));
            const depth = Math.min(Math.max(0, Math.floor(maxDepth)), room);
            if (depth <= 0) return;
            const top = Math.min(4, this.rows);
            const run = Math.max(1, Math.floor(runLength || 2));
            let y = top;
            while (y < this.rows) {
                const height = Math.min(1 + Math.floor(this.rng() * run), this.rows - y);
                const left = Math.floor(this.rng() * (depth + 1));
                const right = Math.floor(this.rng() * (depth + 1 - left));
                for (let i = 0; i < height; i++) {
                    for (let x = 0; x < left; x++) this.grid[y + i][x] = WARD_KIND;
                    for (let x = 0; x < right; x++) this.grid[y + i][this.cols - 1 - x] = WARD_KIND;
                }
                y += height;
            }
        }

        // Is this cell part of the lock's own ward iron rather than something
        // the pick put there?
        isWard(x, y) { return this.grid[y][x] === WARD_KIND; }

        //--- the packed cylinder ---------------------------------------------
        // How much of the lock is already fouled, and with what. Never a full
        // row: the lock the player is handed is always still pickable. The
        // wards are already in the grid, so they count towards how full a row
        // is and are never written over.
        pack(rowCount, density) {
            const rows = Math.max(0, Math.min(this.rows - 4, Math.floor(rowCount)));
            for (let y = this.rows - 1; y >= this.rows - rows; y--) {
                let filled = 0;
                let free = [];
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] > 0) { filled++; continue; }
                    free.push(x);
                    if (this.rng() < density) {
                        this.grid[y][x] = 1 + Math.floor(this.rng() * 7);
                        filled++;
                    }
                }
                if (filled === this.cols && free.length) {
                    this.grid[y][free[Math.floor(this.rng() * free.length)]] = 0;
                    filled--;
                }
                // A row with nothing loose in it is a row the player cannot use.
                if (filled === 0 && free.length) {
                    this.grid[y][free[Math.floor(this.rng() * free.length)]] =
                        1 + Math.floor(this.rng() * 7);
                }
            }
        }

        //--- queries ----------------------------------------------------------
        fits(shape, px, py) {
            for (let y = 0; y < shape.length; y++) {
                for (let x = 0; x < shape[y].length; x++) {
                    if (!shape[y][x]) continue;
                    const bx = px + x;
                    const by = py + y;
                    if (bx < 0 || bx >= this.cols || by < 0 || by >= this.rows) return false;
                    if (this.grid[by][bx] > 0) return false;
                }
            }
            return true;
        }

        // Every occupied cell of the falling piece, in board coordinates.
        pieceCells(atY) {
            const out = [];
            if (!this.piece) return out;
            const py = atY == null ? this.pos.y : atY;
            for (let y = 0; y < this.piece.length; y++) {
                for (let x = 0; x < this.piece[y].length; x++) {
                    const kind = this.piece[y][x];
                    if (kind) out.push({ x: this.pos.x + x, y: py + y, kind });
                }
            }
            return out;
        }

        // Where the piece would come to rest if it were dropped now.
        ghostY() {
            if (!this.piece) return this.pos.y;
            let y = this.pos.y;
            while (this.fits(this.piece, this.pos.x, y + 1)) y++;
            return y;
        }

        // How full the cylinder is, 0..1, for the tension gauge.
        fillFraction() {
            let filled = 0;
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] > 0 && this.grid[y][x] !== WARD_KIND) filled++;
                }
            }
            return filled / (this.rows * this.cols);
        }

        // The highest occupied row, as a 0..1 height up the cylinder.
        stackHeight() {
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] > 0 && this.grid[y][x] !== WARD_KIND) {
                        return (this.rows - y) / this.rows;
                    }
                }
            }
            return 0;
        }

        //--- moves ------------------------------------------------------------
        spawn() {
            const kind = this.nextKind;
            this.nextKind = this.bag.next();
            this.piece = clone(SHAPES[kind]);
            this.pos = {
                x: Math.floor((this.cols - this.piece[0].length) / 2),
                y: 0
            };
            if (!this.fits(this.piece, this.pos.x, this.pos.y)) {
                // The keyway is packed to the mouth. The piece stays where it is
                // so the view can show what seized, and the scene ends the game:
                // this is the state the old build froze on.
                this.toppedOut = true;
                return false;
            }
            return true;
        }

        move(dx, dy) {
            if (!this.piece) return false;
            if (!this.fits(this.piece, this.pos.x + dx, this.pos.y + dy)) return false;
            this.pos.x += dx;
            this.pos.y += dy;
            return true;
        }

        rotate(clockwise) {
            if (!this.piece) return false;
            const h = this.piece.length;
            const w = this.piece[0].length;
            const out = [];
            for (let i = 0; i < w; i++) out.push(new Array(h).fill(0));
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (clockwise) out[x][h - 1 - y] = this.piece[y][x];
                    else out[w - 1 - x][y] = this.piece[y][x];
                }
            }
            for (const kick of [0, -1, 1, -2, 2]) {
                if (this.fits(out, this.pos.x + kick, this.pos.y)) {
                    this.pos.x += kick;
                    this.piece = out;
                    return true;
                }
            }
            return false;
        }

        hardDrop() {
            let dropped = 0;
            while (this.move(0, 1)) dropped++;
            return dropped;
        }

        // Merge the piece into the cylinder, read off any aligned row, and deal
        // the next piece. Returns what happened so the scene can decide.
        settle() {
            const cells = this.pieceCells();
            for (const cell of cells) this.grid[cell.y][cell.x] = cell.kind;
            this.piece = null;

            const rows = [];
            for (let y = 0; y < this.rows; y++) {
                let full = true;
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] === 0) { full = false; break; }
                }
                if (full) rows.push(y);
            }
            // The wards are cut into the lock itself: a row that falls leaves
            // its teeth behind, so the profile of the key stays legible all
            // the way to the end of the pick.
            for (const y of rows) {
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] !== WARD_KIND) this.grid[y][x] = 0;
                }
            }
            this.clearedRows = rows;

            // A picked lock is not asked to deal another piece.
            const spawned = rows.length ? true : this.spawn();
            return { rows, toppedOut: !spawned && this.toppedOut, cells };
        }
    }

    UnlockingBlocks.LockBoard = LockBoard;
    UnlockingBlocks.PieceBag = PieceBag;

    //=========================================================================
    // Difficulty
    //=========================================================================
    UnlockingBlocks.Parameters = PluginManager.parameters(PLUGIN);
    UnlockingBlocks.defaultDifficulty = Number(UnlockingBlocks.Parameters.difficultyDefault || 5);
    UnlockingBlocks.timeMultiplier = Number(UnlockingBlocks.Parameters.timeMultiplier || 1.0);
    UnlockingBlocks.speedMultiplier = Number(UnlockingBlocks.Parameters.speedMultiplier || 1.0);

    UnlockingBlocks.calculateDifficultySettings = function (difficulty, timeMultiplier, speedMultiplier) {
        const time = timeMultiplier == null ? UnlockingBlocks.timeMultiplier : timeMultiplier;
        const speed = speedMultiplier == null ? UnlockingBlocks.speedMultiplier : speedMultiplier;

        if (difficulty <= 3) {
            this.dropInterval = Math.max(1800 - ((difficulty - 1) * 300), 1200) * speed;
            this.timeLimit = (60 - ((difficulty - 1) * 5)) * 1000 * time;
        } else if (difficulty <= 6) {
            this.dropInterval = Math.max(1200 - ((difficulty - 3) * 133), 800) * speed;
            this.timeLimit = (45 - ((difficulty - 3) * 6.67)) * 1000 * time;
        } else {
            this.dropInterval = Math.max(800 - ((difficulty - 6) * 125), 300) * speed;
            this.timeLimit = Math.max(25 - ((difficulty - 6) * 3.75), 10) * 1000 * time;
        }

        // How much junk is in the cylinder before the first bit is fed in.
        // The keyway is sixteen deep and the wards take a bite out of every
        // row, so this is deliberately shallower than an open well would be.
        if (difficulty <= 3) {
            this.packRows = Math.min(difficulty, 2);
            this.packDensity = 0.18 + (difficulty * 0.04);
        } else if (difficulty <= 6) {
            this.packRows = 2 + (difficulty - 3);
            this.packDensity = 0.30 + ((difficulty - 3) * 0.04);
        } else {
            this.packRows = Math.min(5 + Math.floor((difficulty - 6) * 0.75), 8);
            this.packDensity = 0.42 + ((difficulty - 6) * 0.04);
        }

        // How deep the wards bite into the sides, and how long a tooth runs
        // before the profile steps again. A deep lock is a narrow one.
        this.wardDepth = Math.min(1 + Math.floor((difficulty - 1) / 4), 2);
        this.wardRun = difficulty <= 5 ? 3 : 2;
        this.shapeTiers = UnlockingBlocks.shapeTierCount(difficulty);
        return this;
    };

    //=========================================================================
    // Tools. A skeleton key opens the lock outright; a pick is spent on
    // failure; the steel for a pick is offered to the party when they have no
    // pick left but everything a pick is made of.
    //=========================================================================
    function lockpickItem() { return $dataItems[LOCKPICK_ID]; }

    function lockpickRecipe() {
        const item = lockpickItem();
        if (!item || !window.CraftRecipes || typeof window.CraftRecipes.parseRecipe !== 'function') return null;
        const recipe = window.CraftRecipes.parseRecipe(item);
        if (!recipe || !Object.keys(recipe).length) return null;
        return recipe;
    }

    // The bill is covered by what is already in the bag.
    function canForgeLockpick() {
        const recipe = lockpickRecipe();
        if (!recipe) return false;
        return Object.keys(recipe).every(id => {
            const reagent = $dataItems[Number(id)];
            return !!reagent && $gameParty.numItems(reagent) >= recipe[id];
        });
    }

    function recipeBill() {
        const recipe = lockpickRecipe() || {};
        return Object.keys(recipe).map(id => {
            const reagent = $dataItems[Number(id)];
            return reagent ? reagent.name + ' x' + recipe[id] : '';
        }).filter(Boolean).join(', ');
    }

    // Bent on the spot out of what the party is carrying. No botch roll: this
    // is the one recipe everybody knows (<StarterRecipe>), and a door the party
    // is already standing at is not the place to lose the steel to a bad night.
    function forgeLockpick() {
        const recipe = lockpickRecipe();
        const item = lockpickItem();
        if (!recipe || !item) return false;
        for (const id of Object.keys(recipe)) {
            const reagent = $dataItems[Number(id)];
            if (reagent) $gameParty.loseItem(reagent, recipe[id]);
        }
        $gameParty.gainItem(item, 1);
        if ($gameSystem && typeof $gameSystem.addCraftedItem === 'function') {
            $gameSystem.addCraftedItem(item.id);
        }
        if (window.SpecializationXP) {
            const trade = (item.meta && item.meta.Craft) ? String(item.meta.Craft).trim() : null;
            if (trade) window.SpecializationXP.award(trade, 1);
        }
        if (window.ParchmentToast) {
            window.ParchmentToast.show(t('craftedOne', { item: item.name }));
        }
        return true;
    }

    // The offer itself. The answer arrives after the message box closes, so the
    // game is launched from the map's own update rather than from underneath an
    // open window.
    function offerToForge() {
        const item = lockpickItem();
        $gameMessage.add(t('craftOffer', { item: item.name, materials: recipeBill() }));
        $gameMessage.setChoices([t('craftYes'), t('craftNo')], 0, 1);
        $gameMessage.setChoiceCallback(choice => {
            if (choice !== 0) return;
            if (forgeLockpick()) UnlockingBlocks.pendingLaunch = true;
        });
    }

    UnlockingBlocks.canForgeLockpick = canForgeLockpick;
    UnlockingBlocks.forgeLockpick = forgeLockpick;

    //=========================================================================
    // Entry point
    //=========================================================================
    UnlockingBlocks.start = function (difficulty, successSwitch, failureSwitch,
                                     successSelfSwitch, failureSelfSwitch, crimeKey) {
        try {
            this.crimeKey = (crimeKey && crimeKey !== 'none') ? crimeKey : null;
            this.successSwitch = successSwitch;
            this.failureSwitch = failureSwitch;
            this.successSelfSwitch = successSelfSwitch;
            this.failureSelfSwitch = failureSelfSwitch;
            this.currentEventId = $gameMap.isEventRunning() ? $gameMap._interpreter.eventId() : 0;
            this.currentMapId = $gameMap.mapId();
            this.pendingDifficulty = difficulty;

            const skeleton = $dataItems[SKELETON_KEY_ID];
            if (skeleton && $gameParty.hasItem(skeleton)) {
                $gameMessage.add(t('usedSkeletonKey'));
                $gameParty.loseItem(skeleton, 1);
                if (successSwitch > 0) $gameSwitches.setValue(successSwitch, true);
                if (this.currentEventId > 0 && ['A', 'B', 'C', 'D'].includes(successSelfSwitch)) {
                    $gameSelfSwitches.setValue([this.currentMapId, this.currentEventId, successSelfSwitch], true);
                }
                if (this.crimeKey) this.pendingCrimeKey = this.crimeKey;
                return;
            }

            const pick = lockpickItem();
            if (!pick || !$gameParty.hasItem(pick)) {
                // No pick, but the steel for one: the party can bend a pick at
                // the door rather than walk back to a workbench.
                if (canForgeLockpick()) offerToForge();
                else $gameMessage.add(t('noLockpicks'));
                return;
            }

            this.launch();
        } catch (e) {
            console.error('UnlockingBlocks: ' + e.message);
        }
    };

    // Everything between having a pick in hand and the scene being on screen.
    UnlockingBlocks.launch = function () {
        // A trained picker reads the lock faster than an amateur, so the same
        // lock presents an easier problem (Lockpicking, specialization 161):
        // one step every two tiers, inside the same 1-10 clamp.
        const asked = this.pendingDifficulty || this.defaultDifficulty;
        const eased = window.SpecializationXP
            ? Math.floor((window.SpecializationXP.partyLevel(LOCK_SPEC) - 1) / 2) : 0;
        this.difficulty = Math.min(Math.max(asked - eased, 1), 10);

        // The eased difficulty is what the lock is actually worth, so it is the
        // number the clock, the drop speed and the packing are all read off:
        // training used to ease the board and leave the clock where it was.
        this.calculateDifficultySettings(this.difficulty);

        SceneManager.push(window.Scene_UnlockingBlocks);
    };

    //=========================================================================
    // Backdrop. The lock is forced wherever the party is standing, so the
    // ground behind it is resolved exactly the way a fight on this spot would
    // resolve its battleback (BattleSystem/AnimatedBattleBackgrounds.js).
    //=========================================================================
    function currentBiomeName() {
        try {
            if ($gameMap && typeof $gameMap.getBiome === 'function') {
                const tagged = $gameMap.getBiome();
                if (tagged) return tagged;
            }
            const proc = $gameSystem && $gameSystem._procGenData;
            if (proc && $gameMap && $gameMap.mapId() === 636) {
                if (proc.displayAsIsland) return 'Island';
                if (proc.displayAsBeach) return 'Beach';
                if (proc.currentBiome) return proc.currentBiome;
            }
            if ($gameMap && typeof $gameMap.isInterior === 'function' && $gameMap.isInterior()) {
                return 'Dungeon';
            }
        } catch (e) { /* fall through to the default biome */ }
        return 'Fields';
    }

    function backdropBitmap() {
        try {
            let file = null;
            if (typeof ImageManager.getBiomeBackgroundForPlayer === 'function') {
                const biome = currentBiomeName();
                file = ImageManager.getBiomeBackgroundForPlayer(biome);
                if (!file && biome !== 'Fields') file = ImageManager.getBiomeBackgroundForPlayer('Fields');
            }
            if (!file && typeof $dataMap !== 'undefined' && $dataMap && $dataMap.battleback1Name) {
                file = $dataMap.battleback1Name;
            }
            if (file) return ImageManager.loadBattleback1(file);
        } catch (e) { /* the plain gradient will do */ }
        return null;
    }

    //=========================================================================
    // The cylinder in three dimensions. One cell is one world unit, the well is
    // centred on the origin, and the plate is turned a few degrees off square
    // so the pins have a side to them.
    //=========================================================================
    const PSX_SOFTEN = { vertexSnap: 1.7, colorLevels: 1.2, dither: 0.6, downscale: 1 };
    const softPSX = fn => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn)
        : fn();

    class LockView3D {
        constructor(width, height, cols, rows) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this.cols = cols;
            this.rows = rows;
            this._disposables = [];
            this._flashes = [];
            this._time = 0;
            this._shake = 0;
            this._pickAngle = 0;
            this._pickTarget = 0;
            this._fallY = 0;

            this._initThree();
            softPSX(() => {
                this._buildCase();
                this._buildCells();
            });
            if (window.PSXShader) window.PSXShader.applyToObject(this.root);
        }

        get domElement() { return this.renderer.domElement; }

        cellX(x) { return x - (this.cols - 1) / 2; }
        cellY(y) { return (this.rows - 1) / 2 - y; }

        _initThree() {
            this.scene = new THREE.Scene();
            this.root = new THREE.Group();
            this.root.rotation.y = -0.13;
            this.root.rotation.x = 0.04;
            this.scene.add(this.root);

            this.camera = new THREE.PerspectiveCamera(45, this._w / this._h, 0.1, 200);
            this.camera.position.set(0, 1.4, 30);
            this.camera.lookAt(0, 0, 0);

            // Transparent, so the battleback behind shows through and the lock
            // reads as a thing held in the world rather than a menu.
            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x000000, 0);

            this.scene.add(new THREE.AmbientLight(0x9aa6c0, 0.58));
            const key = new THREE.DirectionalLight(0xffeccb, 0.85);
            key.position.set(5, 8, 7);
            this.scene.add(key);
            const fill = new THREE.DirectionalLight(0x6f8ac8, 0.34);
            fill.position.set(-6, 2, -3);
            this.scene.add(fill);
            this._lamp = new THREE.PointLight(0xffd9a0, 0.75, 46, 2);
            this._lamp.position.set(0, 0, 9);
            this.scene.add(this._lamp);
        }

        _track(obj) { this._disposables.push(obj); return obj; }

        _canvasTexture(w, h, draw) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            draw(canvas.getContext('2d'), w, h);
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            return this._track(tex);
        }

        // Brushed plate, painted once rather than sampled from a file.
        _metalTexture(base, streak) {
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = base;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = streak;
                for (let i = 0; i < 30; i++) {
                    ctx.globalAlpha = 0.08 + Math.random() * 0.2;
                    ctx.fillRect(0, Math.floor(Math.random() * h), w, 1);
                }
                ctx.globalAlpha = 0.25;
                for (let i = 0; i < 60; i++) {
                    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
                }
                ctx.globalAlpha = 1;
            });
        }

        // One pin face: the metal, a bevel, and the wear a lock full of pins
        // picks up. The bevel is painted rather than modelled so a cube still
        // reads as a machined part at eight pixels across.
        _pinTexture(color) {
            return this._canvasTexture(32, 32, (ctx, w, h) => {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = 'rgba(255,255,255,0.34)';
                ctx.fillRect(0, 0, w, 3);
                ctx.fillRect(0, 0, 3, h);
                ctx.fillStyle = 'rgba(0,0,0,0.42)';
                ctx.fillRect(0, h - 3, w, 3);
                ctx.fillRect(w - 3, 0, 3, h);
                ctx.fillStyle = 'rgba(0,0,0,0.18)';
                for (let i = 0; i < 26; i++) {
                    ctx.fillRect(4 + Math.floor(Math.random() * (w - 8)),
                                 4 + Math.floor(Math.random() * (h - 8)), 1, 1);
                }
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(6.5, 6.5, w - 13, h - 13);
            });
        }

        _buildCase() {
            const w = this.cols;
            const r = this.rows;

            const plateTex = this._metalTexture('#2a2c33', '#3d414c');
            const brassTex = this._metalTexture('#6d5a2a', '#a68a45');

            const plate = new THREE.Mesh(
                this._track(new THREE.BoxGeometry(w + 2.6, r + 2.6, 1.0)),
                this._track(new THREE.MeshLambertMaterial({ map: plateTex, color: 0x9aa0aa }))
            );
            plate.position.z = -1.15;
            this.root.add(plate);

            // The rails around the keyway.
            const railMat = this._track(new THREE.MeshLambertMaterial({ map: brassTex, color: 0xd8b874 }));
            const railH = this._track(new THREE.BoxGeometry(w + 2.6, 1.1, 1.7));
            const railV = this._track(new THREE.BoxGeometry(1.1, r + 2.6, 1.7));
            const rails = [
                [0, r / 2 + 0.75, railH], [0, -r / 2 - 0.75, railH],
                [-w / 2 - 0.75, 0, railV], [w / 2 + 0.75, 0, railV]
            ];
            for (const [x, y, geo] of rails) {
                const mesh = new THREE.Mesh(geo, railMat);
                mesh.position.set(x, y, -0.25);
                this.root.add(mesh);
            }

            // Rivets, six sided because a PlayStation would not have spent more.
            const rivetGeo = this._track(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 6));
            const rivetMat = this._track(new THREE.MeshLambertMaterial({ color: 0xf0dda6 }));
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    const rivet = new THREE.Mesh(rivetGeo, rivetMat);
                    rivet.rotation.x = Math.PI / 2;
                    rivet.position.set(sx * (w / 2 + 0.75), sy * (r / 2 + 0.75), 0.7);
                    this.root.add(rivet);
                }
            }

            // Tumbler guides: one groove per column, sunk behind the pins.
            const guideGeo = this._track(new THREE.BoxGeometry(0.07, r, 0.06));
            const guideMat = this._track(new THREE.MeshLambertMaterial({ color: 0x14161c }));
            for (let x = 0; x <= this.cols; x++) {
                const guide = new THREE.Mesh(guideGeo, guideMat);
                guide.position.set(this.cellX(x) - 0.5, 0, -0.58);
                this.root.add(guide);
            }

            // The driver pins down each flank: they climb as the cylinder packs.
            this._gauge = [];
            const gaugeGeo = this._track(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 6));
            this._gaugeOn = this._track(new THREE.MeshLambertMaterial({ color: 0xe6c273 }));
            this._gaugeOff = this._track(new THREE.MeshLambertMaterial({ color: 0x3a3d47 }));
            for (const side of [-1, 1]) {
                for (let i = 0; i < 10; i++) {
                    const pin = new THREE.Mesh(gaugeGeo, this._gaugeOff);
                    pin.position.set(side * (this.cols / 2 + 1.9), -r / 2 + 0.8 + i * (r - 1.6) / 9, 0.1);
                    this.root.add(pin);
                    this._gauge.push(pin);
                }
            }

            // The pick itself, worked into the mouth of the keyway. It leans
            // wherever the piece is, which is the only readout that never needs
            // a word written on it.
            this._pick = new THREE.Group();
            const shaft = new THREE.Mesh(
                this._track(new THREE.BoxGeometry(0.16, 4.6, 0.16)),
                this._track(new THREE.MeshLambertMaterial({ color: 0xd7d9de }))
            );
            shaft.position.y = 2.3;
            this._pick.add(shaft);
            const grip = new THREE.Mesh(
                this._track(new THREE.BoxGeometry(0.5, 1.5, 0.4)),
                this._track(new THREE.MeshLambertMaterial({ map: brassTex, color: 0xc9a227 }))
            );
            grip.position.y = -0.7;
            this._pick.add(grip);
            this._pick.position.set(0, -r / 2 - 2.6, 1.4);
            this.root.add(this._pick);
        }

        _buildCells() {
            this._blockGeo = this._track(new THREE.BoxGeometry(0.92, 0.92, 0.92));
            this._mats = [null];
            for (let kind = 1; kind < UnlockingBlocks.COLORS.length; kind++) {
                this._mats.push(this._track(new THREE.MeshLambertMaterial({
                    map: this._pinTexture(UnlockingBlocks.COLORS[kind])
                })));
            }

            // One mesh per cell, built once and only ever shown or hidden.
            this._cells = [];
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    const mesh = new THREE.Mesh(this._blockGeo, this._mats[1]);
                    mesh.position.set(this.cellX(x), this.cellY(y), 0);
                    mesh.visible = false;
                    this.root.add(mesh);
                    this._cells.push(mesh);
                }
            }

            // One pair per cell of the falling piece: the pin itself and the
            // outline of where it would land. Bits run from one cell up to the
            // eight of a collar or a comb, so the pool grows to fit the piece
            // that needs it rather than stopping at four.
            this._pieceMeshes = [];
            this._ghostMeshes = [];
            this._ghostMat = this._track(new THREE.MeshBasicMaterial({
                color: 0xe6c273, wireframe: true, transparent: true, opacity: 0.42
            }));
            this._growPiecePool(UnlockingBlocks.maxShapeCells());
        }

        // Grows the falling piece pool until it holds at least `count` pairs.
        _growPiecePool(count) {
            while (this._pieceMeshes.length < count) {
                const mesh = new THREE.Mesh(this._blockGeo, this._mats[1]);
                mesh.visible = false;
                this.root.add(mesh);
                this._pieceMeshes.push(mesh);

                const ghost = new THREE.Mesh(this._blockGeo, this._ghostMat);
                ghost.visible = false;
                this.root.add(ghost);
                this._ghostMeshes.push(ghost);
            }
        }

        //--- per-frame state --------------------------------------------------
        syncBoard(board) {
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    const mesh = this._cells[y * this.cols + x];
                    const kind = board.grid[y][x];
                    mesh.visible = kind > 0;
                    if (kind > 0) mesh.material = this._mats[kind];
                }
            }
            const filled = Math.round(board.stackHeight() * 10);
            for (let i = 0; i < this._gauge.length; i++) {
                const step = i % 10;
                this._gauge[i].material = step < filled ? this._gaugeOn : this._gaugeOff;
            }
        }

        syncPiece(board, snap) {
            const cells = board.pieceCells();
            const ghostY = board.ghostY();

            // The pins slide down rather than jump a whole cell at a time.
            const target = board.pos.y;
            if (snap || Math.abs(this._fallY - target) > 3) this._fallY = target;
            this._fallY += (target - this._fallY) * 0.42;

            this._growPiecePool(cells.length);
            for (let i = 0; i < this._pieceMeshes.length; i++) {
                const mesh = this._pieceMeshes[i];
                const ghost = this._ghostMeshes[i];
                const cell = cells[i];
                mesh.visible = !!cell;
                ghost.visible = !!cell && ghostY > board.pos.y;
                if (!cell) continue;
                const offset = this._fallY - board.pos.y;
                mesh.material = this._mats[cell.kind];
                mesh.position.set(this.cellX(cell.x), this.cellY(cell.y + offset), 0.42);
                ghost.position.set(this.cellX(cell.x),
                    this.cellY(cell.y + (ghostY - board.pos.y)), 0.42);
            }

            if (cells.length) {
                let sum = 0;
                for (const cell of cells) sum += cell.x;
                const centre = this.cellX(sum / cells.length);
                this._pickTarget = Math.atan2(centre, 6.5);
            }
        }

        // A row of pins falling into line: gold across the whole width.
        flashRows(rows) {
            for (const y of rows) {
                const mesh = new THREE.Mesh(
                    this._track(new THREE.PlaneGeometry(this.cols + 0.6, 1.3)),
                    this._track(new THREE.MeshBasicMaterial({
                        color: 0xfff2c6, transparent: true, opacity: 0.95
                    }))
                );
                mesh.position.set(0, this.cellY(y), 1.1);
                this.root.add(mesh);
                this._flashes.push({ mesh, life: 1 });
            }
        }

        // The cylinder binding: a hard knock and a red cast over the plate.
        seize() {
            this._shake = 1;
        }

        update(dt) {
            this._time += dt;

            // A held object is never perfectly still.
            this.root.rotation.y = -0.13 + Math.sin(this._time * 0.7) * 0.035;
            this.root.rotation.z = Math.sin(this._time * 0.43) * 0.012;

            if (this._shake > 0) {
                this._shake = Math.max(0, this._shake - dt * 2.2);
                const amp = this._shake * this._shake * 0.55;
                this.root.position.x = Math.sin(this._time * 46) * amp;
                this.root.position.y = Math.sin(this._time * 37) * amp * 0.6;
                this._lamp.color.setHex(0xff6a4a);
                this._lamp.intensity = 0.75 + this._shake * 0.9;
            } else if (this.root.position.x !== 0 || this.root.position.y !== 0) {
                this.root.position.set(0, 0, 0);
                this._lamp.color.setHex(0xffd9a0);
                this._lamp.intensity = 0.75;
            }

            this._pickAngle += (this._pickTarget - this._pickAngle) * Math.min(1, dt * 9);
            if (this._pick) this._pick.rotation.z = -this._pickAngle;

            for (let i = this._flashes.length - 1; i >= 0; i--) {
                const flash = this._flashes[i];
                flash.life -= dt * 1.6;
                if (flash.life <= 0) {
                    this.root.remove(flash.mesh);
                    this._flashes.splice(i, 1);
                    continue;
                }
                flash.mesh.material.opacity = flash.life;
                flash.mesh.scale.y = 1 + (1 - flash.life) * 2.2;
            }
        }

        render() {
            if (!this.renderer) return;
            if (window.PSXShader) softPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            else this.renderer.render(this.scene, this.camera);
        }

        dispose() {
            for (const item of this._disposables) {
                if (item && item.dispose) {
                    try { item.dispose(); } catch (e) { /* already gone */ }
                }
            }
            this._disposables = [];
            this._flashes = [];
            if (this.renderer) {
                if (window.PSXShader && window.PSXShader.disposeContext) {
                    window.PSXShader.disposeContext(this.renderer);
                }
                this.renderer.dispose();
                if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
                this.renderer = null;
            }
            this.scene = null;
        }
    }

    //=========================================================================
    // The same cylinder with no three.js to draw it with: flat tiles on a
    // bitmap, the look this minigame had before. Nothing else in the scene
    // knows which of the two it is talking to.
    //=========================================================================
    class LockView2D {
        constructor(width, height, cols, rows) {
            this.cols = cols;
            this.rows = rows;
            this.size = Math.max(8, Math.floor(Math.min(width / cols, height / rows)));
            this.sprite = new Sprite(new Bitmap(this.size * cols, this.size * rows));
            this.sprite.bitmap.smooth = false;
            this._board = null;
            this._dirty = true;
        }

        get displayObject() { return this.sprite; }

        syncBoard(board) { this._board = board; this._dirty = true; }
        syncPiece(board) { this._board = board; this._dirty = true; }
        flashRows() { this._dirty = true; }
        seize() { this._dirty = true; }
        update() { if (this._dirty) { this._redraw(); this._dirty = false; } }
        render() { /* drawn straight onto the bitmap */ }
        dispose() { /* nothing holds a GL context */ }

        _tile(x, y, kind) {
            const s = this.size;
            const bmp = this.sprite.bitmap;
            bmp.fillRect(x * s, y * s, s, s, UnlockingBlocks.COLORS[kind]);
            bmp.fillRect(x * s, y * s, s, 2, 'rgba(255,255,255,0.55)');
            bmp.fillRect(x * s, y * s, 2, s, 'rgba(255,255,255,0.55)');
            bmp.fillRect(x * s, (y + 1) * s - 2, s, 2, 'rgba(0,0,0,0.5)');
            bmp.fillRect((x + 1) * s - 2, y * s, 2, s, 'rgba(0,0,0,0.5)');
        }

        _redraw() {
            const board = this._board;
            const bmp = this.sprite.bitmap;
            bmp.clear();
            bmp.fillAll('rgba(10,12,18,0.72)');
            if (!board) return;
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    if (board.grid[y][x] > 0) this._tile(x, y, board.grid[y][x]);
                }
            }
            const ghostY = board.ghostY();
            for (const cell of board.pieceCells()) {
                const gy = cell.y + (ghostY - board.pos.y);
                bmp.fillRect(cell.x * this.size + 2, gy * this.size + 2,
                    this.size - 4, this.size - 4, 'rgba(230,194,115,0.22)');
            }
            for (const cell of board.pieceCells()) this._tile(cell.x, cell.y, cell.kind);
        }
    }

    //=========================================================================
    // The readouts: the shared art deco PSXHud, gold on black lacquer, the same
    // language the alley and the chess table are dressed in. Without PSXHud
    // every widget still draws, plainly.
    //=========================================================================
    const HUD = () => window.PSXHud;
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);

    let LOCK_DOMS = [];

    class LockWidget extends Sprite {
        constructor(vw, vh, vx, vy) {
            super();
            this._vw = vw;
            this._vh = vh;
            this.bitmap = new Bitmap(vw, vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            if (vx != null) this.x = Math.round(vx * s);
            if (vy != null) this.y = Math.round(vy * s);
        }

        dom() {
            const H = HUD();
            if (!H || !H.domPanel) return null;
            if (!this._dom) {
                this._dom = H.domPanel(this);
                LOCK_DOMS.push(this._dom);
            }
            return this._dom;
        }

        beginText() { const d = this.dom(); if (d) d.begin(); }

        endText() { if (this._dom) this._dom.end(); }

        hudText(str, x, y, w, align, color, size, opts) {
            if (this._dom) this._dom.text(str, x, y, w, align, color, size, opts);
            else if (HUD()) HUD().text(this.bitmap, str, x, y, w, align, color, size, opts);
            else {
                this.bitmap.fontSize = size || 8;
                this.bitmap.textColor = color || '#f6e8c4';
                this.bitmap.drawText(str, x, y, w, (size || 8) + 4, align || 'left');
            }
        }

        panel(opts) {
            const H = HUD();
            if (H) H.decoPanel(this.bitmap, 0, 0, this._vw, this._vh, opts || {});
            else {
                this.bitmap.fillRect(0, 0, this._vw, this._vh, 'rgba(8,7,11,0.86)');
                this.bitmap.fillRect(0, 0, this._vw, 1, '#e6c273');
                this.bitmap.fillRect(0, this._vh - 1, this._vw, 1, '#e6c273');
            }
        }

        deco() { return HUD() ? HUD().DECO : { ink: '#f6e8c4', dim: '#c0a468', gold: '#e6c273', red: '#d9533d', green: '#93d86e', black: '#08070b', goldLo: '#8d6f2c' }; }
    }

    // The strip across the top: what is being picked and how bad it is.
    class Sprite_LockHeader extends LockWidget {
        constructor(complexity) {
            super(hudW(), 20, 0, 0);
            this._complexity = complexity;
            this.refresh();
        }

        refresh() {
            const D = this.deco();
            this.bitmap.clear();
            this.beginText();
            this.panel({ hairline: false, corners: false, step: 1 });
            this.hudText(t('title'), 6, 6, 140, 'left', D.gold, 8);
            this.hudText(t('complexity') + this._complexity + '%',
                this._vw - 146, 6, 140, 'right', D.dim, 8);
            this.endText();
        }
    }

    // The clock, and how much of it is left as a bar rather than a number.
    class Sprite_LockClock extends LockWidget {
        constructor() {
            super(74, 40, null, null);
            this.x = Math.round((hudW() - 80) * hudScale());
            this.y = Math.round(26 * hudScale());
            this._sig = null;
        }

        setTime(seconds, fraction) {
            const sig = seconds + '|' + Math.round(fraction * 24);
            if (sig === this._sig) return;
            this._sig = sig;
            this._seconds = seconds;
            this._fraction = fraction;
            this.refresh();
        }

        refresh() {
            // The font arriving late asks every widget to redraw, which can
            // happen before the first reading has been taken.
            if (this._seconds == null) return;
            const H = HUD();
            const D = this.deco();
            const warn = this._seconds <= 5;
            this.bitmap.clear();
            this.beginText();
            this.panel({ hairline: false });
            this.hudText(t('timeLabel'), 0, 6, this._vw, 'center', D.dim, 8);
            this.hudText(this._seconds + t('seconds'), 0, 16, this._vw, 'center',
                warn ? D.red : D.ink, 12);
            if (H && H.decoBar) {
                H.decoBar(this.bitmap, 6, 31, this._vw - 12, 4, this._fraction,
                    { color: warn ? D.red : D.gold });
            }
            this.endText();
        }
    }

    // What the pick is holding next, drawn as the pins themselves.
    class Sprite_LockNext extends LockWidget {
        constructor() {
            super(56, 56, 6, 26);
            this._kind = -1;
        }

        setKind(kind) {
            if (kind === this._kind) return;
            this._kind = kind;
            this.refresh();
        }

        refresh() {
            const D = this.deco();
            this.bitmap.clear();
            this.beginText();
            this.panel({ hairline: false });
            this.hudText(t('nextLabel'), 0, 5, this._vw, 'center', D.dim, 8);
            const shape = SHAPES[this._kind];
            if (shape) {
                const cell = 8;
                const w = shape[0].length * cell;
                const h = shape.length * cell;
                const ox = Math.round((this._vw - w) / 2);
                const oy = Math.round((this._vh - h) / 2) + 5;
                for (let y = 0; y < shape.length; y++) {
                    for (let x = 0; x < shape[y].length; x++) {
                        if (!shape[y][x]) continue;
                        const px = ox + x * cell;
                        const py = oy + y * cell;
                        this.bitmap.fillRect(px, py, cell - 1, cell - 1, UnlockingBlocks.COLORS[shape[y][x]]);
                        this.bitmap.fillRect(px, py, cell - 1, 1, 'rgba(255,255,255,0.5)');
                        this.bitmap.fillRect(px, py + cell - 2, cell - 1, 1, 'rgba(0,0,0,0.45)');
                    }
                }
            }
            this.endText();
        }
    }

    // How near the cylinder is to binding: the one thing that kills a run
    // without the clock running out.
    class Sprite_LockTension extends LockWidget {
        constructor() {
            super(56, 46, 6, 88);
            this._sig = null;
        }

        setLoad(fraction) {
            const sig = Math.round(fraction * 20);
            if (sig === this._sig) return;
            this._sig = sig;
            this._load = fraction;
            this.refresh();
        }

        refresh() {
            if (this._load == null) return;
            const H = HUD();
            const D = this.deco();
            this.bitmap.clear();
            this.beginText();
            this.panel({ hairline: false });
            this.hudText(t('tensionLabel'), 0, 5, this._vw, 'center', D.dim, 8);
            const tight = this._load > 0.75;
            if (H && H.decoBar) {
                H.decoBar(this.bitmap, 6, 20, this._vw - 12, 6, this._load,
                    { color: tight ? D.red : D.jade || D.gold });
            }
            this.hudText(Math.round(this._load * 100) + '%', 0, 30, this._vw, 'center',
                tight ? D.red : D.ink, 8);
            this.endText();
        }
    }

    // The verdict, once there is one.
    class Sprite_LockResult extends LockWidget {
        constructor() {
            super(190, 40, null, null);
            this.x = Math.round((hudW() - 190) / 2 * hudScale());
            this.y = Math.round(96 * hudScale());
            this.visible = false;
        }

        show(message, success) {
            const D = this.deco();
            this.visible = true;
            this.bitmap.clear();
            this.beginText();
            this.panel({ accent: success ? D.green : D.red });
            this.hudText(message, 0, 15, this._vw, 'center', success ? D.green : D.ink, 12);
            this.endText();
        }
    }

    //=========================================================================
    // Scene_UnlockingBlocks
    //=========================================================================
    class Scene_UnlockingBlocks extends Scene_Base {
        initialize() {
            super.initialize();
            this._over = false;
            // Public, and it has to stay public: PeekPlugin, RoadCarAI and
            // ProceduralHouseSystem all wrap popScene() and read the verdict off
            // the scene to decide whether a door, a car or a peek resolves.
            this.success = false;
            this.gameOver = false;
            this._exitLock = 0;
            this._autoExit = 0;
            this._dropTimer = 0;
            this._repeat = { dir: 0, wait: 0 };
            this._threeReady = typeof THREE !== 'undefined';
        }

        create() {
            super.create();
            this.createBackground();
            this.createBoard();
            this.createView();
            this.createHUD();
            this._timeRemaining = UnlockingBlocks.timeLimit;
            this._lastTime = performance.now();
            // The session opens: leisure, the skill badge and the practice
            // points all hang off this. It takes an options object, not a bare
            // name: a string leaves opts.spec undefined and teaches nothing.
            if (window.MinigameFun && typeof window.MinigameFun.played === 'function') {
                window.MinigameFun.played({ spec: LOCK_SPEC });
            }
        }

        //--- construction -----------------------------------------------------
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.gradientFillRect(0, 0, 8, 8, '#141020', '#05060c', true);
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);

            const bitmap = backdropBitmap();
            if (bitmap) {
                this._backdropSprite = new Sprite(bitmap);
                this.addChild(this._backdropSprite);
                bitmap.addLoadListener(() => this.fitBackdrop());
                this.fitBackdrop();
            }

            // Night falls on the doorway either way: the plate has to read.
            const shade = new Sprite(new Bitmap(8, 8));
            shade.bitmap.fillAll('rgba(3, 4, 10, 0.52)');
            shade.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(shade);
        }

        fitBackdrop() {
            const sprite = this._backdropSprite;
            if (!sprite || !sprite.bitmap || !sprite.bitmap.width) return;
            const scale = Math.max(
                Graphics.width / sprite.bitmap.width,
                Graphics.height / sprite.bitmap.height
            );
            sprite.scale.set(scale, scale);
            sprite.x = (Graphics.width - sprite.bitmap.width * scale) / 2;
            sprite.y = Graphics.height - sprite.bitmap.height * scale;
        }

        createBoard() {
            this._board = new LockBoard({
                cols: COLS,
                rows: ROWS,
                difficulty: UnlockingBlocks.difficulty || UnlockingBlocks.defaultDifficulty
            });
            this._board.cutWards(
                UnlockingBlocks.wardDepth == null ? 1 : UnlockingBlocks.wardDepth,
                UnlockingBlocks.wardRun || 2);
            this._board.pack(UnlockingBlocks.packRows || 4, UnlockingBlocks.packDensity || 0.35);
            this._board.spawn();
        }

        createView() {
            if (this._threeReady) {
                try {
                    this._viewW = Math.round(Graphics.width * 0.9);
                    this._viewH = Math.round(Graphics.height * 0.9);
                    this._view = new LockView3D(this._viewW, this._viewH, COLS, ROWS);
                    const texture = PIXI.Texture.from(this._view.domElement);
                    if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
                    this._viewSprite = new PIXI.Sprite(texture);
                    this._viewSprite.scale.set(Graphics.width / this._viewW, Graphics.height / this._viewH);
                    this.addChild(this._viewSprite);
                } catch (e) {
                    console.error('UnlockingBlocks: 3D view unavailable, ' + e.message);
                    this._view = null;
                    this._threeReady = false;
                }
            }
            if (!this._view) {
                this._view = new LockView2D(Graphics.width * 0.45, Graphics.height * 0.82, COLS, ROWS);
                this._viewSprite = this._view.displayObject;
                this._viewSprite.x = Math.round((Graphics.width - this._viewSprite.bitmap.width) / 2);
                this._viewSprite.y = Math.round((Graphics.height - this._viewSprite.bitmap.height) / 2);
                this.addChild(this._viewSprite);
            }
            this._view.syncBoard(this._board);
            this._view.syncPiece(this._board, true);
        }

        createHUD() {
            this._header = new Sprite_LockHeader(UnlockingBlocks.difficulty * 10);
            this.addChild(this._header);
            this._clock = new Sprite_LockClock();
            this.addChild(this._clock);
            this._next = new Sprite_LockNext();
            this.addChild(this._next);
            this._tension = new Sprite_LockTension();
            this.addChild(this._tension);
            this._result = new Sprite_LockResult();
            this.addChild(this._result);

            if (window.PSXHud) {
                window.PSXHud.onFontReady(() => {
                    if (!this._header) return;
                    this._header.refresh();
                    this._clock.refresh();
                    this._next.refresh();
                    this._tension.refresh();
                });
            }
        }

        //--- per-frame --------------------------------------------------------
        update() {
            super.update();

            const now = performance.now();
            // A window that lost focus for a second must not cost the player
            // the lock with it: the clock only ever advances by a frame's worth.
            const dt = Math.max(0, Math.min(now - this._lastTime, 100));
            this._lastTime = now;

            if (!this._over) {
                this.updateClock(dt);
                if (!this._over) this.updateInput(dt);
                if (!this._over) this.updateGravity(dt);
            } else if (this._exitLock > 0) {
                this._exitLock--;
            } else {
                this.updateExit(dt);
            }

            this.refreshHUD();
            if (this._view) {
                if (!this._over) this._view.syncPiece(this._board);
                this._view.update(dt / 1000);
                this._view.render();
                if (this._threeReady && this._viewSprite && this._viewSprite.texture) {
                    this._viewSprite.texture.update();
                }
            }
        }

        updateClock(dt) {
            this._timeRemaining -= dt;
            if (this._timeRemaining <= 0) {
                this._timeRemaining = 0;
                this.endGame(false, 'timeUp');
            }
        }

        updateGravity(dt) {
            const base = UnlockingBlocks.dropInterval || 900;
            const interval = Input.isPressed('down') ? Math.max(40, base / 8) : base;
            this._dropTimer += dt;
            if (this._dropTimer < interval) return;
            this._dropTimer = 0;
            if (!this._board.move(0, 1)) this.settlePiece();
        }

        updateInput(dt) {
            // Sideways, with a hold that repeats rather than one cell per press.
            const dir = Input.isPressed('left') ? -1 : (Input.isPressed('right') ? 1 : 0);
            if (dir === 0) {
                this._repeat.dir = 0;
                this._repeat.wait = 0;
            } else if (dir !== this._repeat.dir) {
                this._repeat.dir = dir;
                this._repeat.wait = 240;
                this.moveSideways(dir);
            } else {
                this._repeat.wait -= dt;
                if (this._repeat.wait <= 0) {
                    this._repeat.wait = 70;
                    this.moveSideways(dir);
                }
            }

            if (Input.isTriggered('up') || Input.isTriggered('pagedown')) this.turnPiece(true);
            if (Input.isTriggered('pageup')) this.turnPiece(false);

            if (Input.isTriggered('ok')) {
                this._board.hardDrop();
                if (this._view) this._view.syncPiece(this._board, true);
                this.settlePiece();
                return;
            }

            if (Input.isTriggered('cancel') || Input.isTriggered('menu') || Input.isTriggered('escape')) {
                this.endGame(false, 'abandoned');
            }
        }

        moveSideways(dir) {
            if (this._board.move(dir, 0)) SoundManager.playCursor();
        }

        turnPiece(clockwise) {
            if (this._board.rotate(clockwise)) SoundManager.playCursor();
        }

        // A piece coming to rest: the pins seat, a row may align, and the next
        // piece is dealt. Every way this minigame can end passes through here.
        settlePiece() {
            const result = this._board.settle();
            this._dropTimer = 0;
            if (this._view) {
                this._view.syncBoard(this._board);
                this._view.syncPiece(this._board, true);
            }

            if (result.rows.length) {
                if (this._view) this._view.flashRows(result.rows);
                this.endGame(true, 'picked');
                return;
            }

            if (result.toppedOut) {
                // The cylinder is packed to the mouth. This is the state the
                // old build set gameOver on before calling endGame, which its
                // own guard then swallowed: no message, no switch, no way out.
                if (this._view) this._view.seize();
                this.endGame(false, 'seized');
                return;
            }

            SoundManager.playEquip();
        }

        refreshHUD() {
            const seconds = Math.max(0, Math.ceil(this._timeRemaining / 1000));
            const fraction = UnlockingBlocks.timeLimit
                ? Math.max(0, this._timeRemaining / UnlockingBlocks.timeLimit) : 0;
            this._clock.setTime(seconds, fraction);
            this._next.setKind(this._board.nextKind);
            this._tension.setLoad(this._board.stackHeight());
        }

        updateExit(dt) {
            this._autoExit -= dt;
            if (this._autoExit <= 0 || Input.isTriggered('ok') ||
                Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                this.popScene();
            }
        }

        //--- the verdict ------------------------------------------------------
        endGame(success, reason) {
            // The only guard. Nothing raises a "game over" flag before calling
            // this: a caller that did would have its own ending swallowed.
            if (this._over) return;
            this._over = true;
            this.gameOver = true;
            this.success = success;

            // The press that ended the game is not the press that dismisses the
            // verdict: a hard drop used to close the scene in the same frame.
            this._exitLock = 24;
            this._autoExit = 5000;

            // Picking a lock is how a picker learns to pick locks, and a lock
            // that beat them teaches something too, just less of it. MinigameFun
            // banks those points itself, so nothing else awards them here.
            if (window.MinigameFun) {
                if (success && window.MinigameFun.won) window.MinigameFun.won({ spec: LOCK_SPEC });
                else if (!success && window.MinigameFun.lost) window.MinigameFun.lost({ spec: LOCK_SPEC });
            }

            const pick = lockpickItem();
            if (!success && pick) $gameParty.loseItem(pick, 1);

            if (success && UnlockingBlocks.crimeKey) {
                UnlockingBlocks.pendingCrimeKey = UnlockingBlocks.crimeKey;
            }

            let message;
            if (success) message = t('lockPicked');
            else if (reason === 'timeUp') message = t('timeUp');
            else if (reason === 'abandoned') message = t('abandoned');
            else if (reason === 'seized') message = t('seized');
            else message = t('lockJammed');
            this._result.show(message, success);

            if (success) SoundManager.playUseItem();
            else SoundManager.playBuzzer();

            if (success && UnlockingBlocks.successSwitch > 0) {
                $gameSwitches.setValue(UnlockingBlocks.successSwitch, true);
            } else if (!success && UnlockingBlocks.failureSwitch > 0) {
                $gameSwitches.setValue(UnlockingBlocks.failureSwitch, true);
            }

            if (UnlockingBlocks.currentEventId > 0) {
                const flag = success ? UnlockingBlocks.successSelfSwitch : UnlockingBlocks.failureSelfSwitch;
                if (flag && ['A', 'B', 'C', 'D'].includes(flag)) {
                    $gameSelfSwitches.setValue(
                        [UnlockingBlocks.currentMapId, UnlockingBlocks.currentEventId, flag], true);
                }
            }
        }

        popScene() {
            SceneManager.pop();
        }

        terminate() {
            super.terminate();
            for (const dom of LOCK_DOMS) {
                if (dom && dom.destroy) dom.destroy();
            }
            LOCK_DOMS = [];
            if (this._viewSprite && this._threeReady) {
                if (this._viewSprite.parent) this._viewSprite.parent.removeChild(this._viewSprite);
                this._viewSprite.destroy();
            }
            this._viewSprite = null;
            if (this._view) {
                this._view.dispose();
                this._view = null;
            }
        }
    }

    window.Scene_UnlockingBlocks = Scene_UnlockingBlocks;
    UnlockingBlocks.Scene = Scene_UnlockingBlocks;

    //=========================================================================
    // Plugin commands
    //=========================================================================
    if (Utils.RPGMAKER_NAME === 'MZ') {
        PluginManager.registerCommand(PLUGIN, 'startMinigame', args => {
            UnlockingBlocks.start(
                Number(args.difficulty) || UnlockingBlocks.defaultDifficulty,
                Number(args.successSwitch) || 0,
                Number(args.failureSwitch) || 0,
                args.successSelfSwitch || '',
                args.failureSelfSwitch || '',
                args.crimeKey || 'none'
            );
        });
    }

    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
        if (_Game_Interpreter_pluginCommand) _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command === 'UnlockingBlocks' && args[0] === 'start') {
            UnlockingBlocks.start(
                Number(args[1]) || UnlockingBlocks.defaultDifficulty,
                Number(args[2]) || 0,
                Number(args[3]) || 0,
                args[4] || '',
                args[5] || '',
                args[6] || 'none'
            );
        }
    };

    //=========================================================================
    // Map hooks: the crime a forced lock is, and the game a freshly bent pick
    // starts once the message box asking about it has closed.
    //=========================================================================
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        if (UnlockingBlocks.pendingCrimeKey && window.CrimeSystem) {
            const key = UnlockingBlocks.pendingCrimeKey;
            UnlockingBlocks.pendingCrimeKey = null;
            window.CrimeSystem.addPresetCrime(key);
        }
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        if (!UnlockingBlocks.pendingLaunch) return;
        if ($gameMessage.isBusy() || SceneManager.isSceneChanging()) return;
        UnlockingBlocks.pendingLaunch = false;
        UnlockingBlocks.launch();
    };
})();
