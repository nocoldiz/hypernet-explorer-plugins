/*:
 * @target MZ
 * @plugindesc Realistic Vending Machine v3.0.0 (Coordinate-Seeded Stock)
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Realistic Vending Machine Plugin for RPG Maker MZ
 * ============================================================================
 * Every vending machine in the world stocks itself. The stock is derived
 * deterministically from the world seed and the machine's coordinates, so the
 * same machine always sells the same things while two machines a street apart
 * sell completely different ones. Nothing about the stock is stored in the
 * save: it is recomputed from the coordinates every time.
 *
 * Features:
 * - 4x4 grid of products with codes (A00-A03 ... D00-D03)
 * - Coordinate-seeded stock drawn from Items.json by category and price
 * - Every machine carries at least one weird item, and 10% of machines sell
 *   nothing but weird items
 * - Direct product selection: arrow keys / WASD to move, Enter to buy, or
 *   simply click the product. The keypad is only needed for secret codes.
 * - Daily stock limits (3 purchases per slot per day)
 * - Item drop animations, seeded machine branding
 *
 * Plugin Commands:
 * - Open Vending Machine: Opens the machine standing at the calling event
 *
 * Note: the "Vending Machines" parameter below is legacy. Stock is always
 * generated procedurally now; a matching entry is only consulted for a
 * machine's display name.
 *
 * @param machines
 * @text Vending Machines (legacy)
 * @desc Legacy machine list. Only the name is still read; stock is procedural.
 * @type struct<Machine>[]
 * @default []
 *
 * @param defaultSoundBuy
 * @text Purchase Sound
 * @desc Sound effect when item is purchased
 * @type file
 * @dir audio/se/
 * @default Coin
 *
 * @param defaultSoundError
 * @text Error Sound
 * @desc Sound effect for errors
 * @type file
 * @dir audio/se/
 * @default Buzzer1
 *
 * @param weirdOnlyChance
 * @text Weird-Only Chance
 * @desc Percent chance a machine stocks nothing but weird items.
 * @type number
 * @min 0
 * @max 100
 * @default 10
 *
 * @param secretCodes
 * @text Secret Codes
 * @desc Secret codes that trigger common events
 * @type struct<SecretCode>[]
 * @default []
 *
 * @command openVendingMachine
 * @text Open Vending Machine
 * @desc Opens a vending machine interface
 *
 * @arg machineId
 * @text Machine ID
 * @desc Optional name lookup for the legacy machine list.
 * @type string
 * @default default
 */

/*~struct~Machine:
 * @param id
 * @text Machine ID
 * @desc Unique identifier for this machine
 * @type string
 * @default default
 *
 * @param name
 * @text Machine Name
 * @desc Display name for the vending machine
 * @type string
 * @default Vending Machine
 *
 * @param itemsA
 * @text Row A Items (legacy, unused)
 * @desc Ignored. Stock is generated from the machine's coordinates.
 * @type struct<ItemSlot>[]
 * @default []
 *
 * @param itemsB
 * @text Row B Items (legacy, unused)
 * @desc Ignored. Stock is generated from the machine's coordinates.
 * @type struct<ItemSlot>[]
 * @default []
 *
 * @param itemsC
 * @text Row C Items (legacy, unused)
 * @desc Ignored. Stock is generated from the machine's coordinates.
 * @type struct<ItemSlot>[]
 * @default []
 */

/*~struct~ItemSlot:
 * @param itemId
 * @text Item
 * @desc Item to sell in this slot
 * @type item
 * @default 1
 *
 * @param price
 * @text Price
 * @desc Override price (0 to use item's default price)
 * @type number
 * @min 0
 * @default 0
 */

/*~struct~SecretCode:
 * @param code
 * @text Code
 * @desc Secret code (e.g., A99)
 * @type string
 * @default A99
 *
 * @param commonEventId
 * @text Common Event
 * @desc Common event to run when code is entered
 * @type common_event
 * @default 1
 */

(() => {
    'use strict';

    const pluginName = 'RealisticVendingMachine';
    const parameters = PluginManager.parameters(pluginName);

    // Parse parameters (defensively - malformed params must not break plugin load)
    const safeParse = (str, fallback) => {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.error(`${pluginName}: failed to parse parameter`, e);
            return fallback;
        }
    };

    let machines = [];
    try {
        machines = safeParse(parameters.machines || '[]', []).map(m => safeParse(m, {}));
    } catch (e) {
        console.error(`${pluginName}: failed to parse machines`, e);
        machines = [];
    }

    const secretCodes = safeParse(parameters.secretCodes || '[]', []).map(s => safeParse(s, {}));
    const soundBuy = parameters.defaultSoundBuy || 'Coin';  // i18n-ignore  audio filename
    const soundError = parameters.defaultSoundError || 'Buzzer1';
    const weirdOnlyChance = Math.max(0, Math.min(100, Number(parameters.weirdOnlyChance) || 10)) / 100;

    // ------------------------------------------------------------------
    // Cabinet geometry
    // ------------------------------------------------------------------
    const ROW_LETTERS = ['A', 'B', 'C', 'D'];
    const COL_COUNT = 4;
    const SLOT_COUNT = ROW_LETTERS.length * COL_COUNT;
    const DAILY_STOCK = 3;
    const PROC_MAP_ID = 636;

    function allCodes() {
        const codes = [];
        for (let r = 0; r < ROW_LETTERS.length; r++) {
            for (let c = 0; c < COL_COUNT; c++) {
                codes.push(`${ROW_LETTERS[r]}${String(c).padStart(2, '0')}`);
            }
        }
        return codes;
    }

    function indexToCode(index) {
        if (index < 0 || index >= SLOT_COUNT) return null;
        const row = Math.floor(index / COL_COUNT);
        const col = index % COL_COUNT;
        return `${ROW_LETTERS[row]}${String(col).padStart(2, '0')}`;
    }

    function codeToIndex(code) {
        if (!code || code.length < 3) return -1;
        const rowIndex = ROW_LETTERS.indexOf(code[0].toUpperCase());
        if (rowIndex === -1) return -1;
        const col = parseInt(code.substring(1), 10);
        if (!(col >= 0 && col < COL_COUNT)) return -1;
        return rowIndex * COL_COUNT + col;
    }

    // ------------------------------------------------------------------
    // Seeded RNG (same avalanche + xorshift pair the item lore uses, so the
    // world seed drives vending stock exactly like it drives everything else)
    // ------------------------------------------------------------------
    function worldSeed() {
        try {
            if (window.NPCShared && typeof NPCShared.worldSeed === 'function') return NPCShared.worldSeed() >>> 0;
            if (window.HistoryManager && typeof HistoryManager.getSeed === 'function') return HistoryManager.getSeed() >>> 0;
        } catch (e) {}
        return 19002001; // canon default
    }

    function mix32(h) {
        h = (h ^ (h >>> 16)) >>> 0;
        h = Math.imul(h, 0x85ebca6b) >>> 0;
        h = (h ^ (h >>> 13)) >>> 0;
        h = Math.imul(h, 0xc2b2ae35) >>> 0;
        return (h ^ (h >>> 16)) >>> 0;
    }

    function hashStr(str) {
        let h = 5381;
        const s = String(str);
        for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return h || 1;
    }

    function makeRng(seed) {
        let s = mix32((seed || 1) >>> 0) || 0x9e3779b1;
        return function () {
            let x = s;
            x ^= x << 13; x >>>= 0;
            x ^= x >> 17;
            x ^= x << 5; x >>>= 0;
            s = x;
            return x / 4294967296;
        };
    }

    const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

    // ------------------------------------------------------------------
    // Item pools
    // ------------------------------------------------------------------
    // Categories a real machine could plausibly hold, with the price ceiling
    // above which an item stops being vending-machine merchandise. Weights
    // control how often a bucket is drawn, so one big category (Food has 175
    // entries) cannot swamp every slot.
    // i18n-ignore-start  item-category ids from the <category:> note tag
    const NORMAL_BUCKETS = [
        { cat: 'Food', max: 1200, weight: 6 },
        { cat: 'Medical', max: 1500, weight: 4 },
        { cat: 'Lifestyle', max: 2500, weight: 3 },
        { cat: 'Tools', max: 2500, weight: 3 },
        { cat: 'Homeopathy', max: 999999, weight: 2 },
        { cat: 'Survival', max: 1200, weight: 2 },
        { cat: 'Books', max: 900, weight: 2 },
        { cat: 'Crafting', max: 300, weight: 1 }
    ];

    // Collectibles are deliberately absent: a keepsake is never restocked by
    // anybody, so it reaches a machine no more than it reaches a shelf
    // (window.ItemCollectibles owns that rule).

    // Whole categories that are inherently strange merchandise.
    const WEIRD_BUCKETS = [
        { cat: 'Counterfeits', max: 999999, weight: 4 },
        { cat: 'Trash', max: 999999, weight: 4 },
        { cat: 'BodyPart', max: 999999, weight: 3 },
        { cat: 'Monsters', max: 8000, weight: 1 }
    ];
    // i18n-ignore-end

    // Items promoted out of an ordinary category because of what they are.
    // i18n-ignore-start  substrings matched against the ENGLISH $dataItems name
    const WEIRD_NAME_RE = new RegExp([
        'sperm', 'abomination', 'mystery meat', 'suspicious', 'moldy', 'expired',
        'leftover', 'pocket sand', 'pet rock', 'unidentified', 'skull', 'parasite',
        'unholy', 'goblin', 'miasma', 'dream dust', 'gender shake', 'angel dust',
        'red cocaine', 'crank', 'tryptocaine', 'black market', 'beast tongue',
        'blood sausage', 'day-old', 'charred', 'burnt beans', 'lumpy', 'rubbish',
        'sprouting potato', 'void starfruit', 'abyssal', 'smoke-infused'
    ].join('|'), 'i');
    // i18n-ignore-end
    const WEIRD_ODD_WEIGHT = 5;
    const WEIRD_PRICE_CAP = 12000;

    let poolCache = null;

    function categoryOf(item) {
        const m = (item.note || '').match(/<[Cc]ategory:\s*([^>]+)>/);
        return m ? m[1].trim() : '';
    }

    // An item has to be an ordinary consumable with a real price to be worth a
    // coil. Key items, the "<-- Section -->" headers and price-0 quest props
    // are never merchandise.
    // A <Restricted> row is granted by the one system that owns it, so no coil
    // ever holds one either.
    function isVendable(item) {
        if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(item)) return false;
        return !!item && !!item.name && item.itypeId === 1 && item.price > 0 &&
            item.name.indexOf('<--') !== 0;
    }

    function buildPools() {
        const normal = NORMAL_BUCKETS.map(b => ({ weight: b.weight, items: [] }));
        const weird = WEIRD_BUCKETS.map(b => ({ weight: b.weight, items: [] }));
        const odd = { weight: WEIRD_ODD_WEIGHT, items: [] };
        weird.push(odd);

        const normalByCat = {};
        NORMAL_BUCKETS.forEach((b, i) => { normalByCat[b.cat] = i; });
        const weirdByCat = {};
        WEIRD_BUCKETS.forEach((b, i) => { weirdByCat[b.cat] = i; });

        for (const item of $dataItems) {
            if (!isVendable(item)) continue;
            const cat = categoryOf(item);

            const wIdx = weirdByCat[cat];
            if (wIdx !== undefined) {
                if (item.price <= WEIRD_BUCKETS[wIdx].max) weird[wIdx].items.push(item);
                continue;
            }
            if (WEIRD_NAME_RE.test(item.name)) {
                if (item.price <= WEIRD_PRICE_CAP) odd.items.push(item);
                continue;
            }
            const nIdx = normalByCat[cat];
            if (nIdx !== undefined && item.price <= NORMAL_BUCKETS[nIdx].max) {
                normal[nIdx].items.push(item);
            }
        }

        const usable = buckets => buckets.filter(b => b.items.length > 0);
        return { normal: usable(normal), weird: usable(weird) };
    }

    function getPools() {
        if (!poolCache && typeof $dataItems !== 'undefined' && $dataItems) {
            poolCache = buildPools();
        }
        return poolCache || { normal: [], weird: [] };
    }

    // Weighted bucket draw, rejecting anything already on a coil so no machine
    // sells the same product twice.
    function drawItem(rng, buckets, used) {
        if (!buckets.length) return null;
        const total = buckets.reduce((sum, b) => sum + b.weight, 0);
        for (let attempt = 0; attempt < 40; attempt++) {
            let roll = rng() * total;
            let bucket = buckets[buckets.length - 1];
            for (const b of buckets) {
                roll -= b.weight;
                if (roll <= 0) { bucket = b; break; }
            }
            const item = pick(rng, bucket.items);
            if (item && !used.has(item.id)) {
                used.add(item.id);
                return item;
            }
        }
        // Every weighted draw collided: fall back to the first unused item.
        for (const b of buckets) {
            for (const item of b.items) {
                if (!used.has(item.id)) { used.add(item.id); return item; }
            }
        }
        return null;
    }

    // Machines mark merchandise up, and the ones stocked with oddities are
    // greedier about it because nobody else is selling a spare femur.
    function vendPrice(item, rng, weird) {
        let markup = weird ? 1.4 + rng() * 0.9 : 1.15 + rng() * 0.45;
        // A machine will not haggle, but somebody who knows what things are
        // worth (Appraising, 496) knows which slot is the one being gouged on,
        // so the markup is what training works against here, never the price.
        if (window.SpecializationXP) {
            const keen = window.SpecializationXP.discount('Appraising', 0.06, 0.7);
            markup = 1 + (markup - 1) * keen;
        }
        return Math.max(10, Math.round(item.price * markup / 10) * 10);
    }

    // ------------------------------------------------------------------
    // Machine branding
    // ------------------------------------------------------------------
    const BRANDS = [
        'SNAKMATIC', 'VENDOTRON', 'AUTOMAT 7', 'NUTRIVEND', 'KIOSK-9', 'GRABBIT',
        'FEEDCORE', 'SUSTENANCE UNIT', 'MERIDIAN VEND', 'HAPPY HATCH',
        'CIVIC DISPENSARY', 'PANTRYBOX', 'COIN & CO.', 'REFRESHMENT POST'
    ];
    const TAGLINES = [
        'ALWAYS OPEN', 'FRESH DAILY', 'EXACT CHANGE APPRECIATED', 'SERVING SINCE 1974',
        'SATISFACTION ASSURED', 'A FRIEND AT ANY HOUR', 'STOCKED WEEKLY'
    ];
    const WEIRD_BRANDS = [
        'ANOMALY DISPENSARY', 'UNIT ???', 'THE OTHER MACHINE', 'SURPLUS ODDMENTS',
        'LOST & FOUND CO.', 'MISCELLANEA', 'NON-STANDARD GOODS', 'THE LEFTOVERS'
    ];
    const WEIRD_TAGLINES = [
        'NO REFUNDS', 'CONTENTS UNKNOWN', 'PLEASE DO NOT ASK', 'AS-IS, WHERE-IS',
        'ALL SALES FINAL', 'NOT INSPECTED', 'RESTOCKED BY PERSONS UNKNOWN'
    ];

    // ------------------------------------------------------------------
    // Stock generation: pure function of (world seed, coordinates)
    // ------------------------------------------------------------------
    function generateStock(location) {
        // The product card prints item.description, which is a combinatorial
        // template until ItemDescription has resolved it against the world seed.
        try {
            if (window.ItemDescription) window.ItemDescription.apply();
        } catch (e) {}

        const rng = makeRng(mix32(worldSeed() ^ hashStr('vend:' + location.key)));
        const pools = getPools();
        const weirdOnly = rng() < weirdOnlyChance && pools.weird.length > 0;

        const brand = weirdOnly ? pick(rng, WEIRD_BRANDS) : pick(rng, BRANDS);
        const tagline = weirdOnly ? pick(rng, WEIRD_TAGLINES) : pick(rng, TAGLINES);
        const model = 100 + Math.floor(rng() * 900);

        // A few coils are always dead: a machine with every slot loaded reads
        // like a shop, not like a machine somebody has to come and refill.
        const emptyCount = weirdOnly ? Math.floor(rng() * 3) : 1 + Math.floor(rng() * 4);
        const codes = allCodes();
        const filled = codes.slice();
        for (let i = filled.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = filled[i]; filled[i] = filled[j]; filled[j] = t;
        }
        const emptyCodes = new Set(filled.slice(0, emptyCount));

        const liveCodes = codes.filter(c => !emptyCodes.has(c));
        // Even an ordinary machine keeps one or two oddities on a back coil.
        const weirdCodes = new Set();
        if (weirdOnly) {
            liveCodes.forEach(c => weirdCodes.add(c));
        } else if (pools.weird.length) {
            const weirdCount = Math.min(liveCodes.length, 1 + Math.floor(rng() * 2));
            const shuffled = liveCodes.slice();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
            }
            shuffled.slice(0, weirdCount).forEach(c => weirdCodes.add(c));
        }

        const slots = {};
        const used = new Set();
        for (const code of liveCodes) {
            const isWeird = weirdCodes.has(code);
            const buckets = isWeird && pools.weird.length ? pools.weird : pools.normal;
            const item = drawItem(rng, buckets, used);
            if (!item) continue;
            slots[code] = { item, price: vendPrice(item, rng, isWeird), weird: isWeird };
        }

        return { slots, weirdOnly, brand, tagline, model, name: `${brand} ${model}` };
    }

    // ------------------------------------------------------------------
    // Save data: only the daily purchase counters live in the save. Stock is
    // recomputed from the coordinates, so it survives without storage.
    // ------------------------------------------------------------------
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize.call(this);
        this.initializeVendingMachineData();
    };

    Game_System.prototype.initializeVendingMachineData = function () {
        if (!this._vendingMachineData) {
            this._vendingMachineData = {
                lastDate: getTodayString(),
                purchases: {},
                locations: {}
            };
        }
    };

    Game_System.prototype.getVendingMachineData = function () {
        if (!this._vendingMachineData) {
            this.initializeVendingMachineData();
        }

        // Check if it's a new day and reset if needed
        const todayString = getTodayString();
        if (this._vendingMachineData.lastDate !== todayString) {
            this._vendingMachineData.lastDate = todayString;
            this._vendingMachineData.purchases = {};
            this._vendingMachineData.locations = {};
        }

        return this._vendingMachineData;
    };

    Game_System.prototype.savePurchase = function (code, location) {
        const data = this.getVendingMachineData();
        const key = `${location}_${code}`;
        data.purchases[key] = (data.purchases[key] || 0) + 1;
    };

    Game_System.prototype.getPurchaseCount = function (code, location) {
        const data = this.getVendingMachineData();
        const key = `${location}_${code}`;
        return data.purchases[key] || 0;
    };

    // Helper functions
    function getGameDateFromVariable() {
        // Check if $gameVariables is initialized, otherwise use default
        const dateStr = ($gameVariables ? $gameVariables.value(113) : null) || '01 JAN 2001 12:00';
        // Format: "01 JAN 2001 12:00"
        const parts = dateStr.split(' ').filter(Boolean);
        if (parts.length < 4) {
            return { day: 1, month: 0, year: 2001, hours: 8, minutes: 0 };
        }

        const day = parseInt(parts[0]) || 1;
        const monthStr = (parts[1] || '').toUpperCase();
        const year = parseInt(parts[2]) || 2001;
        const timeStr = (parts[3] || '12:00').split(':');
        const hours = parseInt(timeStr[0]) || 0;
        const minutes = parseInt(timeStr[1]) || 0;

        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        let month = months.indexOf(monthStr);
        if (month === -1) {
            const itMonths = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
            month = itMonths.indexOf(monthStr);
        }
        if (month === -1) {
            month = 0;
        }

        return { day, month, year, hours, minutes };
    }

    function getTodayString() {
        // The per-day purchase limit is really a restocking round: somebody
        // refills the machine overnight. Nobody does in an empty world, so the
        // day never turns over and what has been taken out of a machine stays
        // taken. See WorldManager.populationMode.
        const WM = window.WorldManager;
        if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) {
            return "EMPTYWORLD";
        }
        const gameDate = getGameDateFromVariable();
        return `${gameDate.year}-${gameDate.month}-${gameDate.day}`;
    }

    // The seed key has to be unique per physical machine. On the procedural
    // sandbox (map 636) the same tile coordinates recur on every generated
    // chunk, so the world-map cell has to go into the key as well.
    function getCurrentLocation() {
        if (!$gameMap) return null;

        let x = null;
        let y = null;
        const eventId = $gameMap._interpreter ? $gameMap._interpreter.eventId() : 0;
        if (eventId > 0) {
            const event = $gameMap.event(eventId);
            if (event) { x = event.x; y = event.y; }
        }
        if (x === null && $gamePlayer) { x = $gamePlayer.x; y = $gamePlayer.y; }
        if (x === null) return null;

        const mapId = $gameMap.mapId();
        let key = `${mapId}_${x}_${y}`;
        if (mapId === PROC_MAP_ID && $gameVariables) {
            key = `${mapId}@${$gameVariables.value(43)},${$gameVariables.value(44)}_${x}_${y}`;
        }
        return { key, mapId, x, y };
    }

    function getPurchaseCount(code, location) {
        return $gameSystem.getPurchaseCount(code, location);
    }

    function savePurchase(code, location) {
        $gameSystem.savePurchase(code, location);
    }

    function euros(gold) {
        return `€${(gold / 100).toFixed(2)}`;
    }

    // IconSet.png is a 16-wide sheet of 32px icons; the cabinet draws them at
    // double size, so the sheet is scaled to match.
    function iconStyle(iconIndex, size) {
        const scale = size / 32;
        const iconX = (iconIndex % 16) * 32 * scale;
        const iconY = Math.floor(iconIndex / 16) * 32 * scale;
        return `background-image:url('img/system/IconSet.png');` +
            `background-position:-${iconX}px -${iconY}px;` +
            `background-size:${512 * scale}px auto;`;
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    // Plugin command
    PluginManager.registerCommand(pluginName, 'openVendingMachine', args => {
        const location = getCurrentLocation();
        if (!location) {
            console.error(`${pluginName}: unable to determine machine location`);
            return;
        }

        const stock = generateStock(location);

        // Legacy machine list: still honoured for a hand-authored display name.
        const configured = machines.find(m => m.id === (args.machineId || 'default'));
        if (configured && configured.name && configured.name !== 'Vending Machine') {  // i18n-ignore  legacy machine id
            stock.name = configured.name;
        }

        SceneManager.push(Scene_VendingMachine);
        SceneManager.prepareNextScene(stock, location.key);
    });

    // ------------------------------------------------------------------
    // Scene_VendingMachine
    // ------------------------------------------------------------------
    class Scene_VendingMachine extends Scene_Base {
        prepare(stock, locationKey) {
            this._stock = stock;
            this._location = locationKey;
            this._trayItems = [];      // dispensed, waiting to be collected
            this._isDispensing = false;
            this._typedCode = '';
            this._tempMessage = '';
            this._tempMessageAlert = false;
            this._tempMessageTimer = 0;
            this._dirtyDom = true;

            // Open on a coil that actually holds something.
            this._selIndex = 0;
            for (let i = 0; i < SLOT_COUNT; i++) {
                if (stock.slots[indexToCode(i)]) { this._selIndex = i; break; }
            }
        }

        create() {
            super.create();
            this.createBackground();
            this.loadStylesheet();
            this.createHtmlOverlay();
            this.setupKeyboardHooks();
        }

        createBackground() {
            this._backgroundSprite = new Sprite();
            this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
            this.addChild(this._backgroundSprite);

            const dimmer = new Sprite();
            dimmer.bitmap = new Bitmap(Graphics.width, Graphics.height);
            dimmer.bitmap.fillAll('rgba(0, 0, 0, 0.7)');
            this.addChild(dimmer);
        }

        loadStylesheet() {
            const id = 'vending-machine-stylesheet';
            if (document.getElementById(id)) return;
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = 'css/vending_machine.css';
            document.head.appendChild(link);
        }

        // ---- data helpers ----------------------------------------------
        slotByCode(code) {
            return this._stock.slots[code] || null;
        }

        remainingFor(code) {
            return DAILY_STOCK - getPurchaseCount(code, this._location);
        }

        activeCode() {
            if (this._typedCode.length === 3) return this._typedCode;
            return indexToCode(this._selIndex);
        }

        // ---- DOM --------------------------------------------------------
        createHtmlOverlay() {
            const existing = document.getElementById('vending-machine-container');
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

            this._dndContainer = document.createElement('div');
            this._dndContainer.id = 'vending-machine-container';
            // Load-bearing inline styles so the overlay is positioned and layered
            // above the game canvas (zIndex 1) even before the external
            // stylesheet finishes loading asynchronously (#72).
            this._dndContainer.style.cssText = [
                'position:absolute', 'top:0', 'left:0', 'width:100%', 'height:100%',
                'z-index:100', 'display:flex', 'justify-content:center',
                'align-items:center', 'box-sizing:border-box',
                'background:rgba(0, 0, 0, 0.75)'
            ].join(';');

            let gridHtml = '';
            for (let r = 0; r < ROW_LETTERS.length; r++) {
                gridHtml += '<div class="vm-row">';
                for (let c = 0; c < COL_COUNT; c++) {
                    const code = `${ROW_LETTERS[r]}${String(c).padStart(2, '0')}`;
                    gridHtml += `
                        <div class="vm-slot" data-code="${code}">
                            <div class="vm-coil"></div>
                            <div class="vm-item-container" id="container-${code}"></div>
                            <div class="vm-slot-tag">${code}</div>
                        </div>
                    `;
                }
                gridHtml += '</div>';
            }

            let keypadHtml = '';
            ROW_LETTERS.forEach(letter => {
                keypadHtml += `<div class="vm-key" data-key="${letter}">${letter}</div>`;
            });
            ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(n => {
                keypadHtml += `<div class="vm-key" data-key="${n}">${n}</div>`;
            });
            keypadHtml += `<div class="vm-key special-clear" data-key="CLR">${T('Vending.ui.keyClear')}</div>`;
            keypadHtml += '<div class="vm-key" data-key="0">0</div>';
            keypadHtml += `<div class="vm-key special-enter" data-key="ENT">${T('Vending.ui.keyEnter')}</div>`;

            const weirdClass = this._stock.weirdOnly ? ' vm-weird' : '';

            this._dndContainer.innerHTML = `
                <div class="vm-wrapper${weirdClass}">
                    <!-- Left cabinet: marquee, product chamber, dispenser -->
                    <div class="vm-chamber-outer">
                        <div class="vm-marquee">
                            <div class="vm-marquee-brand">${escapeHtml(this._stock.name)}</div>
                            <div class="vm-marquee-right">
                                <div class="vm-marquee-tagline">${escapeHtml(this._stock.tagline)}</div>
                                <div class="vm-marquee-clock" id="vm-screen-time">00:00</div>
                            </div>
                        </div>

                        <div class="vm-glass-chamber">
                            <div class="vm-led-bar vm-led-left"></div>
                            <div class="vm-led-bar vm-led-right"></div>
                            <div class="vm-grid">${gridHtml}</div>
                            <div class="vm-glass-glare"></div>
                        </div>

                        <div class="vm-dispenser-tray">
                            <div class="vm-dispenser-door"></div>
                            <div id="vm-tray-content"></div>
                        </div>
                    </div>

                    <!-- Right panel: displays, product card, keypad -->
                    <div class="vm-control-panel">
                        <div class="vm-lcd-screen">
                            <div class="vm-lcd-text-primary" id="vm-screen-line1">${T('Vending.ui.selectProduct')}</div>
                            <div class="vm-lcd-text-secondary" id="vm-screen-line2">
                                <span>${T('Vending.ui.ready')}</span>
                                <span>${T('Vending.ui.selectProduct')}</span>
                            </div>
                        </div>

                        <!-- Direct selection card: what the highlighted coil holds -->
                        <div class="vm-product-card" id="vm-product-card">
                            <div class="vm-product-head">
                                <div class="vm-product-icon" id="vm-product-icon"></div>
                                <div class="vm-product-titles">
                                    <div class="vm-product-name" id="vm-product-name">${T('Vending.ui.selectProduct')}</div>
                                    <div class="vm-product-code" id="vm-product-code">--</div>
                                </div>
                            </div>
                            <div class="vm-product-desc" id="vm-product-desc">
                                ${T('Vending.ui.browseHint')}
                            </div>
                        </div>

                        <div class="vm-buy-btn" id="vm-buy-btn">${T('Vending.ui.selectProduct')}</div>

                        <div class="vm-payment-section">
                            <div class="vm-payment-slot vm-coin-slot">
                                <div class="vm-payment-led"></div>
                                <div class="vm-payment-label">${T('Vending.ui.coins')}</div>
                            </div>
                            <div class="vm-payment-slot vm-bill-slot">
                                <div class="vm-payment-led"></div>
                                <div class="vm-payment-label">${T('Vending.ui.bills')}</div>
                            </div>
                        </div>

                        <div class="vm-keypad-panel">
                            <div class="vm-keypad-hint">${T('Vending.ui.codeEntry')}</div>
                            <div class="vm-keypad">${keypadHtml}</div>
                        </div>

                        <div class="vm-wallet-status">
                            <div class="vm-wallet-row">
                                <span>${T('Vending.ui.wallet')}</span>
                                <span class="val" id="vm-wallet-val">€0.00</span>
                            </div>
                            <div class="vm-wallet-row money-row">
                                <span>${T('Vending.ui.balance')}</span>
                                <span class="val" id="vm-balance-val">€0.00</span>
                            </div>
                        </div>

                        <div class="vm-footer-btn-container">
                            <div class="vm-exit-btn" id="vm-exit-btn">${T('Vending.ui.returnWallet')}</div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(this._dndContainer);
            this.bindEvents();
            this.refreshHtmlDOM();
        }

        bindEvents() {
            const container = this._dndContainer;

            container.querySelectorAll('.vm-key').forEach(keyEl => {
                keyEl.addEventListener('click', () => {
                    this.pressKeypadKey(keyEl.getAttribute('data-key'));
                });
            });

            container.querySelector('#vm-exit-btn').addEventListener('click', () => this.onExitClick());
            container.querySelector('#vm-buy-btn').addEventListener('click', () => this.buySelected());

            // Direct selection: hovering browses a coil, clicking buys it. No
            // code has to be keyed in for ordinary shopping.
            container.querySelectorAll('.vm-slot').forEach(slotEl => {
                const index = codeToIndex(slotEl.getAttribute('data-code'));
                if (index < 0) return;
                slotEl.addEventListener('mouseenter', () => {
                    if (this._isDispensing || this._selIndex === index) return;
                    this._selIndex = index;
                    this._typedCode = '';
                    AudioManager.playSe({ name: 'Cursor1', volume: 50, pitch: 100 });
                    this.refreshHtmlDOM();
                });
                slotEl.addEventListener('click', () => {
                    if (this._isDispensing) return;
                    this._selIndex = index;
                    this._typedCode = '';
                    this.buySelected();
                });
            });

            container.querySelector('.vm-dispenser-door')
                .addEventListener('click', () => this.collectTrayItems());

            container.querySelector('.vm-coin-slot').addEventListener('click', () => {
                AudioManager.playSe({ name: 'Coin', volume: 90, pitch: 100 });
                this.showTempLCDMessage(T('Vending.coinAccepted'), 1000);
            });
            container.querySelector('.vm-bill-slot').addEventListener('click', () => {
                AudioManager.playSe({ name: 'Switch2', volume: 80, pitch: 85 });
                this.showTempLCDMessage(T('Vending.billAccepted'), 1000);
            });
        }

        // Physical letter keys are off limits: W/A/S/D are bound to the RMMZ
        // directions globally (HistorySimulatorUI), so typing a row letter
        // would also move the cursor. Codes are entered on the on-screen
        // keypad; the keyboard drives selection and purchase instead.
        setupKeyboardHooks() {
            this._handleKeyDown = (event) => {
                if (!this.isActive() || this._isDispensing) return;
                const key = event.key.toUpperCase();
                if (this._typedCode.length > 0 && key >= '0' && key <= '9') {
                    this.pressKeypadKey(key);
                    event.preventDefault();
                } else if (key === 'BACKSPACE' && this._typedCode !== '') {
                    this.pressKeypadKey('CLR');
                    event.preventDefault();
                }
            };
            document.addEventListener('keydown', this._handleKeyDown);
        }

        // ---- update loop ------------------------------------------------
        update() {
            super.update();
            this.updateGameInput();
            this.updateClock();

            if (this._tempMessageTimer > 0) {
                this._tempMessageTimer--;
                if (this._tempMessageTimer === 0) {
                    this._tempMessage = '';
                    this._dirtyDom = true;
                }
            }

            if (this._dirtyDom) {
                this._dirtyDom = false;
                this.refreshHtmlDOM();
            }
        }

        updateGameInput() {
            if (this._isDispensing) return;

            let moved = false;
            if (Input.isRepeated('down')) { this.moveSelection(0, 1); moved = true; }
            else if (Input.isRepeated('up')) { this.moveSelection(0, -1); moved = true; }
            else if (Input.isRepeated('right')) { this.moveSelection(1, 0); moved = true; }
            else if (Input.isRepeated('left')) { this.moveSelection(-1, 0); moved = true; }
            if (moved) return;

            if (Input.isTriggered('ok')) {
                Input.clear();
                if (this._typedCode !== '') this.submitTypedCode();
                else this.buySelected();
            } else if (Input.isTriggered('cancel')) {
                Input.clear();
                if (this._typedCode !== '') {
                    this._typedCode = '';
                    this._dirtyDom = true;
                } else {
                    this.onExitClick();
                }
            }
        }

        moveSelection(dx, dy) {
            const col = (this._selIndex % COL_COUNT + dx + COL_COUNT) % COL_COUNT;
            const rowCount = ROW_LETTERS.length;
            const row = (Math.floor(this._selIndex / COL_COUNT) + dy + rowCount) % rowCount;
            this._selIndex = row * COL_COUNT + col;
            this._typedCode = '';
            AudioManager.playSe({ name: 'Cursor1', volume: 60, pitch: 100 });
            this._dirtyDom = true;
        }

        updateClock() {
            const clockEl = document.getElementById('vm-screen-time');
            if (!clockEl) return;
            const date = getGameDateFromVariable();
            clockEl.textContent = `${String(date.hours).padStart(2, '0')}:${String(date.minutes).padStart(2, '0')}`;
        }

        // ---- rendering ---------------------------------------------------
        refreshHtmlDOM() {
            if (!this._dndContainer) return;
            const activeCode = this.activeCode();

            this.refreshSlots(activeCode);
            this.refreshScreen(activeCode);
            this.refreshProductCard(activeCode);
            this.refreshWallet();
            this.refreshTray();
        }

        refreshSlots(activeCode) {
            this._dndContainer.querySelectorAll('.vm-slot').forEach(slotEl => {
                const code = slotEl.getAttribute('data-code');
                const slot = this.slotByCode(code);
                slotEl.classList.toggle('active', code === activeCode);
                slotEl.classList.toggle('weird', !!(slot && slot.weird));

                const container = document.getElementById(`container-${code}`);
                if (!container) return;

                if (!slot) {
                    container.innerHTML = `<div class="vm-slot-empty">${T('Vending.ui.empty')}</div>`;
                    slotEl.classList.add('sold-out');
                    const overlay = slotEl.querySelector('.vm-soldout-overlay');
                    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    return;
                }

                const soldOut = this.remainingFor(code) <= 0;
                container.innerHTML = `
                    <div class="vm-item-icon" style="${iconStyle(slot.item.iconIndex, 64)}"></div>
                    <div class="vm-slot-name">${escapeHtml(slot.item.name)}</div>
                    <div class="vm-slot-price">${euros(slot.price)}</div>
                `;

                slotEl.classList.toggle('sold-out', soldOut);
                let overlay = slotEl.querySelector('.vm-soldout-overlay');
                if (soldOut && !overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'vm-soldout-overlay';
                    overlay.innerHTML = `<span class="vm-soldout-badge">${T('Vending.soldOut')}</span>`;
                    slotEl.appendChild(overlay);
                } else if (!soldOut && overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            });
        }

        refreshScreen(activeCode) {
            const line1 = document.getElementById('vm-screen-line1');
            const line2 = document.getElementById('vm-screen-line2');
            if (!line1 || !line2) return;

            const slot = this.slotByCode(activeCode);
            const alertMsg = this._tempMessageAlert;

            if (this._tempMessage !== '') {
                line1.textContent = this._tempMessage;
                line1.style.color = alertMsg ? '#ef4444' : '#39ff14';
                line2.innerHTML = `<span>${T('Vending.systemOnline')}</span>`;
                return;
            }
            if (this._isDispensing) {
                line1.textContent = T('Vending.dispensing');
                line1.style.color = '#39ff14';
                line2.innerHTML = `<span>${T('Vending.waiting')}</span>`;
                return;
            }
            if (this._typedCode !== '' && this._typedCode.length < 3) {
                line1.textContent = T('Vending.code', { code: this._typedCode.padEnd(3, '_') });
                line1.style.color = '#39ff14';
                line2.innerHTML = `<span>${T('Vending.enterDigits')}</span>`;
                return;
            }
            if (this._typedCode.length === 3 && !slot) {
                line1.textContent = T('Vending.invalidCode');
                line1.style.color = '#ef4444';
                line2.innerHTML = `<span>${T('Vending.pressClear')}</span>`;
                return;
            }

            if (slot) {
                const remaining = this.remainingFor(activeCode);
                line1.textContent = slot.item.name.toUpperCase();
                line1.style.color = remaining > 0 ? '#39ff14' : '#ef4444';
                line2.innerHTML = `
                    <span>${euros(slot.price)}</span>
                    <span>${remaining > 0 ? T('Vending.left', { count: remaining }) : T('Vending.soldOut')}</span>
                `;
            } else {
                line1.textContent = T('Vending.coilEmpty');
                line1.style.color = '#39ff14';
                line2.innerHTML = `<span>${T('Vending.noStock')}</span><span>${T('Vending.selectProduct')}</span>`;
            }
        }

        refreshProductCard(activeCode) {
            const iconEl = document.getElementById('vm-product-icon');
            const nameEl = document.getElementById('vm-product-name');
            const codeEl = document.getElementById('vm-product-code');
            const descEl = document.getElementById('vm-product-desc');
            const buyEl = document.getElementById('vm-buy-btn');
            if (!iconEl || !nameEl || !codeEl || !descEl || !buyEl) return;

            const slot = this.slotByCode(activeCode);
            if (!slot) {
                iconEl.style.cssText = '';
                nameEl.textContent = T('Vending.coilEmpty');
                codeEl.textContent = activeCode || '--';
                descEl.textContent = T('Vending.coilEmptyHelp');
                buyEl.textContent = T('Vending.unavailable');
                buyEl.classList.add('disabled');
                return;
            }

            const remaining = this.remainingFor(activeCode);
            const affordable = ($gameParty ? $gameParty.gold() : 0) >= slot.price;

            iconEl.style.cssText = iconStyle(slot.item.iconIndex, 64);
            nameEl.textContent = slot.item.name;
            codeEl.textContent = `${activeCode} · ${slot.weird ? T('Vending.unlisted') : T('Vending.standard')}`;
            descEl.textContent = slot.item.description || T('Vending.noLabel');

            if (remaining <= 0) {
                buyEl.textContent = T('Vending.soldOutToday');
                buyEl.classList.add('disabled');
            } else if (!affordable) {
                buyEl.textContent = T('Vending.insertCoinsPrice', { price: euros(slot.price) });
                buyEl.classList.add('disabled');
            } else {
                buyEl.textContent = T('Vending.buyPrice', { price: euros(slot.price) });
                buyEl.classList.remove('disabled');
            }
        }

        refreshWallet() {
            const walletVal = document.getElementById('vm-wallet-val');
            const balanceVal = document.getElementById('vm-balance-val');
            const gold = $gameParty ? $gameParty.gold() : 0;
            if (walletVal) walletVal.textContent = euros(gold);
            if (balanceVal) balanceVal.textContent = euros(gold);

            const exitBtn = document.getElementById('vm-exit-btn');
            if (exitBtn) {
                const hasTray = this._trayItems.length > 0;
                exitBtn.textContent = hasTray ? T('Vending.collectExit') : T('Vending.returnWallet');
                exitBtn.classList.toggle('has-tray', hasTray);
            }
        }

        refreshTray() {
            const trayContent = document.getElementById('vm-tray-content');
            const doorEl = this._dndContainer.querySelector('.vm-dispenser-door');
            if (!trayContent || !doorEl) return;

            if (this._trayItems.length > 0) {
                const last = this._trayItems[this._trayItems.length - 1];
                trayContent.innerHTML = `<div class="vm-dispenser-item" style="${iconStyle(last.iconIndex, 64)}"></div>`;
                doorEl.classList.add('loaded');
            } else {
                trayContent.innerHTML = '';
                doorEl.classList.remove('loaded');
            }
        }

        showTempLCDMessage(msg, durationMs, isAlert) {
            this._tempMessage = msg;
            this._tempMessageAlert = Boolean(isAlert);
            this._tempMessageTimer = Math.max(1, Math.floor(durationMs / 16.6));
            this._dirtyDom = true;
        }

        // ---- keypad (secret codes and manual entry) ----------------------
        pressKeypadKey(key) {
            if (this._isDispensing) return;

            AudioManager.playSe({ name: 'Cursor1', volume: 85, pitch: 110 });

            const keyEl = this._dndContainer.querySelector(`.vm-key[data-key="${key}"]`);
            if (keyEl) {
                keyEl.classList.add('pressed');
                setTimeout(() => keyEl.classList.remove('pressed'), 80);
            }

            if (ROW_LETTERS.includes(key)) {
                this._typedCode = key;
            } else if (key >= '0' && key <= '9') {
                if (this._typedCode.length > 0 && this._typedCode.length < 3) this._typedCode += key;
            } else if (key === 'CLR') {
                this._typedCode = '';
            } else if (key === 'ENT') {
                if (this._typedCode !== '') this.submitTypedCode();
                else this.buySelected();
                return;
            }

            if (this._typedCode.length === 3) {
                const index = codeToIndex(this._typedCode);
                if (index >= 0) this._selIndex = index;
            }
            this._dirtyDom = true;
        }

        submitTypedCode() {
            const typed = this._typedCode;
            if (typed.length === 0) return;

            const secret = secretCodes.find(s => String(s.code).toUpperCase() === typed);
            if (secret) {
                const eventId = parseInt(secret.commonEventId, 10);
                if (eventId > 0) {
                    AudioManager.playSe({ name: 'Upgrade1', volume: 90, pitch: 100 });
                    this.showTempLCDMessage(T('Vending.accessGranted'), 1000);
                    $gameTemp.reserveCommonEvent(eventId);
                    this._typedCode = '';
                    setTimeout(() => {
                        if (this.isActive()) this.popScene();
                    }, 1000);
                    return;
                }
            }

            this._typedCode = '';
            const index = codeToIndex(typed);
            if (index < 0) {
                this.rejectPurchase(T('Vending.invalidCode'));
                return;
            }
            this._selIndex = index;
            this.buySelected();
        }

        rejectPurchase(message) {
            AudioManager.playSe({ name: soundError, volume: 90, pitch: 100 });
            this.showTempLCDMessage(message, 1200, true);
        }

        // ---- purchasing ---------------------------------------------------
        buySelected() {
            if (this._isDispensing) return;

            const code = indexToCode(this._selIndex);
            const slot = this.slotByCode(code);
            if (!slot) {
                this.rejectPurchase(T('Vending.coilEmpty'));
                return;
            }
            if (this.remainingFor(code) <= 0) {
                this.rejectPurchase(T('Vending.soldOut'));
                return;
            }
            const gold = $gameParty ? $gameParty.gold() : 0;
            if (gold < slot.price) {
                this.rejectPurchase(T('Vending.insertCoins'));
                return;
            }

            $gameParty.loseGold(slot.price);
            savePurchase(code, this._location);
            AudioManager.playSe({ name: soundBuy, volume: 90, pitch: 100 });
            this.animateItemDrop(slot, code);
        }

        animateItemDrop(slot, code) {
            const slotEl = this._dndContainer &&
                this._dndContainer.querySelector(`.vm-slot[data-code="${code}"]`);
            if (!slotEl) {
                this._trayItems.push(slot.item);
                this._dirtyDom = true;
                return;
            }

            this._isDispensing = true;
            this._dirtyDom = true;
            slotEl.classList.add('spinning');
            AudioManager.playSe({ name: 'Move2', volume: 80, pitch: 75 });

            // The coil turns before the product lets go.
            setTimeout(() => {
                if (!this.isActive() || !this._dndContainer) {
                    this._isDispensing = false;
                    return;
                }

                const chamberEl = this._dndContainer.querySelector('.vm-glass-chamber');
                const chamberRect = chamberEl.getBoundingClientRect();
                const slotRect = slotEl.getBoundingClientRect();

                const startX = slotRect.left - chamberRect.left + slotRect.width / 2 - 32;
                const startY = slotRect.top - chamberRect.top + 24;

                const gravityEl = document.createElement('div');
                gravityEl.className = 'vm-gravity-item';
                gravityEl.style.cssText = iconStyle(slot.item.iconIndex, 64);
                gravityEl.style.left = `${startX}px`;
                gravityEl.style.top = `${startY}px`;
                chamberEl.appendChild(gravityEl);

                let y = startY;
                let vy = 0;
                const g = 0.75;
                const bounce = -0.32;
                const targetY = chamberEl.clientHeight - 76;
                let bounces = 0;

                const finish = () => {
                    if (gravityEl.parentNode) gravityEl.parentNode.removeChild(gravityEl);
                    slotEl.classList.remove('spinning');
                    this._trayItems.push(slot.item);
                    this._isDispensing = false;
                    this.showTempLCDMessage(T('Vending.itemDispensed'), 1500);
                };

                const step = () => {
                    if (!this._dndContainer || !gravityEl.parentNode) {
                        this._isDispensing = false;
                        return;
                    }

                    vy += g;
                    y += vy;

                    if (y >= targetY) {
                        y = targetY;
                        vy *= bounce;
                        bounces++;
                        if (bounces === 1) {
                            AudioManager.playSe({ name: 'Blow1', volume: 85, pitch: 70 });
                            this.flapDoor(300);
                        }
                    }

                    gravityEl.style.top = `${y}px`;

                    if (bounces > 3 || (y >= targetY && Math.abs(vy) < 1.0)) finish();
                    else requestAnimationFrame(step);
                };

                requestAnimationFrame(step);
            }, 800);
        }

        flapDoor(durationMs) {
            const doorEl = this._dndContainer && this._dndContainer.querySelector('.vm-dispenser-door');
            if (!doorEl) return;
            doorEl.classList.add('active');
            setTimeout(() => doorEl.classList.remove('active'), durationMs);
        }

        collectTrayItems() {
            if (this._isDispensing) return;

            if (this._trayItems.length === 0) {
                AudioManager.playSe({ name: 'Switch2', volume: 50, pitch: 100 });
                this.flapDoor(400);
                return;
            }

            AudioManager.playSe({ name: 'Item1', volume: 90, pitch: 105 });
            this.flapDoor(600);
            this._trayItems.forEach(item => $gameParty.gainItem(item, 1));
            this._trayItems = [];
            this.showTempLCDMessage(T('Vending.thankYou'), 1800);
        }

        onExitClick() {
            AudioManager.playSe({ name: 'Cancel1', volume: 80, pitch: 100 });
            this.popScene();
        }

        terminate() {
            super.terminate();

            if (this._handleKeyDown) {
                document.removeEventListener('keydown', this._handleKeyDown);
                this._handleKeyDown = null;
            }

            // Safety net: anything still sitting in the tray was paid for.
            if (this._trayItems && this._trayItems.length > 0) {
                this._trayItems.forEach(item => $gameParty.gainItem(item, 1));
                this._trayItems = [];
            }

            if (this._dndContainer) {
                const container = this._dndContainer;
                container.style.transition = 'opacity 0.2s ease-out';
                container.style.opacity = '0';
                container.style.pointerEvents = 'none';
                setTimeout(() => {
                    if (container.parentNode) container.parentNode.removeChild(container);
                }, 200);
                this._dndContainer = null;
            }
        }
    }

    // Exposed so other systems (and debugging) can inspect a machine's stock
    // without opening the scene.
    window.VendingMachine = {
        stockAt: (mapId, x, y) => generateStock({ key: `${mapId}_${x}_${y}`, mapId, x, y }),
        stockHere: () => {
            const loc = getCurrentLocation();
            return loc ? generateStock(loc) : null;
        },
        pools: getPools
    };

})();
