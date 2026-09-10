/*:
 * @target MZ
 * @plugindesc v2.1.0 Stockbusters: a period online marketplace inside HypernetOS, with lots, bulk pricing, a cart, couriers and daily rarities.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * SearchableItemShop.js
 *
 * Stockbusters is the mail-order marketplace of the Hypernet: a listings site
 * of the period, browsed as an app on the HypernetOS desktop. Everything the
 * databases are willing to sell is a "lot" on it, and a lot bought here is not
 * handed over at a counter, it is dispatched by courier and turns up minutes of
 * game time later.
 *
 * ============================================================================
 * What a shopper can do
 * ============================================================================
 * - Browse by category, or search the whole catalogue at once.
 * - Read a full listing page: description, world-seeded lore, every statistic
 *   the backpack would print, the crafting recipe, and (for a weapon or a
 *   shield) the piece itself turning in 3D, or (for a spell) its battle
 *   animation playing on a loop.
 * - Order ANY quantity of a lot. There is no cap on the units in a line and no
 *   cap on the lines in a basket.
 * - Bill a spell to a particular party member. A spell is bought as
 *   understanding, so only a member who does not already know it and whose BASE
 *   stat clears the floor written into it (<StatReq: STAT N>,
 *   window.SkillStatReq) can be its reader; the rest are listed with the reason
 *   and cannot be picked. A spell nobody in the party could take is not listed
 *   at all, and the reader travels with the courier's order.
 * - Volume pricing: the more units of one lot, the cheaper each unit gets, and
 *   a basket of several different lots earns a further combined-dispatch cut.
 * - Watch the couriers on the Orders page and collect what has landed, here or
 *   at any mailbox (the RetireDeliveredItems plugin command).
 *
 * ============================================================================
 * Daily rarities
 * ============================================================================
 * One or two procedural artifacts (Crafting/ArctifactGenerator.js) are listed
 * every in-game day, seeded from the world seed and the day number so that
 * every savegame of a world sees the same two rarities on the same day. Each is
 * a single unit and is snapshotted into the savegame, so a rarity ordered today
 * still arrives as itself after a reboot, whatever the procedural slot it was
 * generated into has been reused for since.
 *
 * ============================================================================
 * Pricing
 * ============================================================================
 * Wares carry the market tax read off variable 53, then whatever the party's
 * Haggling is worth against it. Spells are half-taught by correspondence and
 * cost 40% of their tuition. On top of that:
 *
 *   units >= 5    -3%      units >= 50    -18%     units >= 1000  -40%
 *   units >= 10   -7%      units >= 100   -25%
 *   units >= 25   -12%     units >= 250   -32%
 *
 * plus 1% per extra distinct lot in the basket, up to 10%.
 *
 * A spell is a lesson, not a crate: its quantity is always one.
 *
 * @command OpenSearchableShop
 * @desc Opens Stockbusters.
 * @command OpenLimitedShop
 * @desc Opens the coordinate-seeded local bazaar.
 * @command RetireDeliveredItems
 * @desc Collects every arrived parcel and adds it to the inventory.
 */

(() => {
    'use strict';

    //=========================================================================
    // Constants
    //=========================================================================

    // Sack, per js/db/Sprites/Icons.json: a mail-order parcel.
    const APP_ICON = 209;

    const pluginName = "SearchableItemShop";

    // plugins.js lists this file under its folder, so an event calling one of
    // the commands below sends "Economy/SearchableItemShop" as the plugin name.
    // Register every command under both keys or the event call silently does
    // nothing (which is what kept the Mailbox from ever handing anything over).
    const COMMAND_KEYS = [pluginName, "Economy/" + pluginName];

    // Variable 114 is the world clock in game minutes (TimeDateSystem): it is
    // monotonic and moves for sleeping, fast travel and every other time skip,
    // which is exactly what a courier should be measured against.
    const GAME_TIME_VARIABLE = 114;
    const MINUTES_PER_DAY = 1440;

    const MIN_DELIVERY_MINUTES = 5;
    const MAX_DELIVERY_MINUTES = 45;
    // A crate of a thousand is loaded by hand, so bulk buys the courier time.
    const MAX_BULK_DELIVERY_MINUTES = 60;

    // Volume pricing, richest tier first: the first tier a quantity reaches
    // decides the cut taken off every unit in that line.
    const BULK_TIERS = [
        { min: 1000, off: 0.40 },
        { min: 250, off: 0.32 },
        { min: 100, off: 0.25 },
        { min: 50, off: 0.18 },
        { min: 25, off: 0.12 },
        { min: 10, off: 0.07 },
        { min: 5, off: 0.03 }
    ];
    // One dispatch carrying several different lots costs the seller less.
    const LOT_BONUS_PER_LINE = 0.01;
    const MAX_LOT_BONUS = 0.10;

    // The catalogue-wide search results page, which is not one of the sidebar
    // categories: it draws from every database at once.
    const SEARCH_CATEGORY = "search";
    const SEARCH_RESULT_LIMIT = 240;
    // The daily rarities have a shelf of their own.
    const RARITY_CATEGORY = "rarities";
    // The pastimes shelf: everything the party can enjoy rather than eat, wear
    // or swing. It cuts across the <category:> tags (a book, an mp3 player and
    // a saxophone are filed under three different ones), so it is its own
    // symbol and window.ItemLeisure answers what belongs on it.
    const LEISURE_CATEGORY = "leisure";  // i18n-ignore  shelf symbol

    const ROWS_PER_PAGE = 24;

    //=========================================================================
    // Small helpers
    //=========================================================================

    // Player-typed text and database names both go back out into markup.
    function escapeHtml(text) {
        return String(text == null ? '' : text).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    // The name a lot is listed under. Window text is localized on its way to
    // the bitmap, but this shop draws its catalogue as DOM, which that hook
    // never sees, so every name headed for markup passes through here first.
    const itemNameOf = (item) =>
        item && item.name && window.translateText ? window.translateText(item.name) : (item && item.name) || "";

    const descriptionOf = (item) => {
        if (!item || !item.description) return "";
        return window.translateText ? window.translateText(item.description) : item.description;
    };

    // A search page mixes wares and spells, so "is this a skill" has to be asked
    // of the entry rather than of the page it was found on.
    function isSkillEntry(entry) {
        if (!entry) return false;
        if (DataManager.isSkill(entry)) return true;
        return entry.stypeId === 1 || entry.stypeId === 2;
    }

    function currentGameMinutes() {
        if (typeof $gameVariables === "undefined" || !$gameVariables) return 0;
        return Math.max(0, Math.floor(Number($gameVariables.value(GAME_TIME_VARIABLE)) || 0));
    }

    function currentGameDay() {
        return Math.floor(currentGameMinutes() / MINUTES_PER_DAY);
    }

    // "12 minutes" / "2 hours" out of a count of game minutes.
    function formatDelay(minutes) {
        if (minutes >= 60) {
            return T('Stockbusters.text.durationHours', { hours: Math.ceil(minutes / 60) });
        }
        return T('Stockbusters.text.durationMinutes', { minutes: Math.max(1, Math.ceil(minutes)) });
    }

    // Money is held in cents everywhere in the game and shown in euros.
    function formatPrice(value) {
        const euros = (Math.round(value) / 100).toFixed(2);
        return (euros.endsWith(".00") ? String(parseInt(euros, 10)) : euros) + " €";
    }

    function hashString(text) {
        let hash = 0x811c9dc5;
        const str = String(text == null ? '' : text);
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash >>> 0;
    }

    // mulberry32: neighbouring seeds do not come out looking alike, which
    // matters when the seed is "the day number plus one".
    function seededRandom(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function worldSeed() {
        try {
            if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
                const s = Number(window.HistoryManager.getSeed());
                if (Number.isFinite(s)) return s >>> 0;
            }
        } catch (e) { /* history not booted yet */ }
        if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._historySeed !== undefined) {
            return Number($gameSystem._historySeed) >>> 0;
        }
        return 19002001;
    }

    // An IconSet cell as a block of markup: the site is DOM, so it cannot draw
    // through Window_Base.
    function iconHTML(iconIndex, size) {
        const px = size || 16;
        if (!iconIndex) return `<span class="sb-icon" style="width:${px}px;height:${px}px;"></span>`;
        const col = iconIndex % 16;
        const row = Math.floor(iconIndex / 16);
        // The sheet is 16 cells wide and however many rows tall it happens to
        // be, so only the width is pinned and the height follows it.
        return `<span class="sb-icon" style="width:${px}px;height:${px}px;` +
            `background-image:url('img/system/IconSet.png');` +
            `background-size:${px * 16}px auto;` +
            `background-position:-${col * px}px -${row * px}px;"></span>`;
    }

    // A <Restricted> row is granted by the one system that owns it (a seed
    // weapon by a blade seed) and belongs on no shelf, no search page and no
    // delivery catalogue, however it was reached.
    const isShopSellable = (entry) =>
        !(window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(entry));

    // Which database an entry belongs to. Stored per order and per basket line
    // so an id is never matched against the wrong list (an item and a skill
    // share id numbers).
    function kindOf(entry) {
        if (!entry) return null;
        if (DataManager.isSkill(entry)) return "skill";
        if (DataManager.isWeapon(entry)) return "weapon";
        if (DataManager.isArmor(entry)) return "armor";
        if (DataManager.isItem(entry)) return "item";
        // A shop-side clone is not the database instance itself.
        if (entry.stypeId !== undefined) return "skill";
        if (entry.wtypeId !== undefined) return "weapon";
        if (entry.etypeId !== undefined) return "armor";
        return "item";
    }

    function dataListOf(kind) {
        switch (kind) {
            case "skill": return $dataSkills;
            case "weapon": return $dataWeapons;
            case "armor": return $dataArmors;
            default: return $dataItems;
        }
    }

    function entryOf(kind, id) {
        const list = dataListOf(kind);
        return (list && list[id]) || null;
    }

    // The one address of a lot, used as a key everywhere: basket lines, orders,
    // markup ids and the 3D viewport's "is this still the same piece" check.
    const lotKey = (entry) => entry ? kindOf(entry) + ":" + entry.id : "";

    function buyerActor() {
        if (typeof $gameParty === "undefined" || !$gameParty) return null;
        return $gameParty.leader() || $gameActors.actor(1);
    }

    //=========================================================================
    // Tuition
    //=========================================================================
    // A spell is bought for somebody in particular. Two things decide whether a
    // given member can be that somebody: they must not already know it, and
    // their BASE stat must clear the floor written into the skill
    // (<StatReq: STAT N>, window.SkillStatReq in BattleSystemEnhanced.js). The
    // site sells understanding, not a scroll to be puzzled over later, so a
    // member short of the floor cannot be the one it is billed to. A skill
    // nobody in the party could take is not listed at all.

    function canLearnSkill(actor, skill) {
        if (!actor || !skill) return false;
        if (actor.hasSkill && actor.hasSkill(skill.id)) return false;
        return !window.SkillStatReq || window.SkillStatReq.meets(actor, skill);
    }

    function learnerCandidates(skill) {
        if (typeof $gameParty === "undefined" || !$gameParty) return [];
        return $gameParty.allMembers().filter(a => canLearnSkill(a, skill));
    }

    // The member a skill is billed to: whoever the page has picked, falling
    // back to the first who could take it, then to the leader. Never null while
    // a party exists, so no purchase path has to invent a reader of its own.
    function learnerFor(skill, actorId) {
        const picked = actorId && $gameActors ? $gameActors.actor(actorId) : null;
        if (picked && canLearnSkill(picked, skill)) return picked;
        return learnerCandidates(skill)[0] || buyerActor();
    }

    //=========================================================================
    // Pricing
    //=========================================================================
    // Everything that turns a database row into a number of cents lives here,
    // so the listing table, the listing page, the basket and the courier all
    // quote the same figure.

    const Pricing = {
        // The market tax, read off variable 53. The standard reading is 66666;
        // any deviation moves the rate between 100% and 1000%.
        tax: function () {
            const standardValue = 66666;
            const currentValue = $gameVariables ? $gameVariables.value(53) : standardValue;
            const baseTax = 1.00;
            const maxTax = 10.00;
            const percentageDeviation = (currentValue - standardValue) / standardValue;
            const newTax = baseTax + percentageDeviation * 9;
            return Math.max(baseTax, Math.min(maxTax, newTax));
        },

        // Tuition for a spell taught by correspondence.
        tuition: function (skill) {
            return ((skill && skill.mpCost) || 0) * 1000 + 1000;
        },

        // What one unit costs before any volume cut. A bazaar sells at the
        // sticker price; the site adds the tax and takes off the haggling.
        unit: function (entry, limited) {
            if (!entry) return 0;
            if (isSkillEntry(entry)) {
                const base = this.tuition(entry);
                return limited ? base : Math.floor(base * 0.4);
            }
            if (limited) return entry.price || 0;
            const haggle = window.SpecializationXP
                ? window.SpecializationXP.discount('Haggling', 0.05, 0.75) : 1;
            return Math.max(1, Math.floor((entry.price || 0) * (1 + this.tax()) * haggle));
        },

        // The share taken off every unit of a line of this many units.
        bulkRate: function (qty) {
            const n = Math.max(0, Math.floor(qty || 0));
            for (const tier of BULK_TIERS) {
                if (n >= tier.min) return tier.off;
            }
            return 0;
        },

        // The next volume tier a line has not reached yet, for the "buy N more
        // and save" nudge on the listing page. Null once the ladder is topped.
        nextTier: function (qty) {
            const n = Math.max(0, Math.floor(qty || 0));
            let best = null;
            for (const tier of BULK_TIERS) {
                if (tier.min > n && (!best || tier.min < best.min)) best = tier;
            }
            return best;
        },

        // A spell is a lesson: one is all there is to buy.
        clampQty: function (entry, qty) {
            const cap = Stock.available(entry);
            let n = Math.floor(Number(qty) || 0);
            if (!Number.isFinite(n) || n < 1) n = 1;
            return Math.min(n, cap);
        },

        // What a line of `qty` units of `entry` costs, volume cut included.
        lineTotal: function (entry, qty, limited) {
            const n = Math.max(0, Math.floor(qty || 0));
            if (!entry || n <= 0) return 0;
            const gross = this.unit(entry, limited) * n;
            // The cut is taken off, not multiplied in: (1 - 0.07) is not 0.93
            // in binary and a crate of ten was quoted a cent under what the
            // advertised discount says it costs.
            return Math.max(n, gross - Math.floor(gross * this.bulkRate(n)));
        },

        // The further cut for carrying several different lots in one dispatch.
        lotBonus: function (lineCount) {
            const extra = Math.max(0, Math.floor(lineCount || 0) - 1);
            return Math.min(MAX_LOT_BONUS, extra * LOT_BONUS_PER_LINE);
        },

        // The whole basket: what it would cost at sticker price, what it costs
        // after both cuts, and the two cuts named apart so the basket page can
        // show the shopper where the money went.
        basket: function (lines, limited) {
            let gross = 0;
            let afterVolume = 0;
            let units = 0;
            for (const line of (lines || [])) {
                const entry = line.entry || entryOf(line.kind, line.id);
                if (!entry) continue;
                const qty = Math.max(1, Math.floor(line.qty || 1));
                gross += this.unit(entry, limited) * qty;
                afterVolume += this.lineTotal(entry, qty, limited);
                units += qty;
            }
            const bonus = this.lotBonus((lines || []).length);
            const total = Math.max(0, afterVolume - Math.floor(afterVolume * bonus));
            return {
                gross: gross,
                volumeSaved: Math.max(0, gross - afterVolume),
                lotBonus: bonus,
                lotSaved: Math.max(0, afterVolume - total),
                saved: Math.max(0, gross - total),
                total: total,
                units: units,
                lines: (lines || []).length
            };
        },

        // The largest number of units of one lot the party could pay for. The
        // ladder is not monotone (five units can cost less than four), so every
        // tier band is asked separately rather than searched through.
        maxAffordable: function (entry, gold, limited) {
            if (!entry) return 0;
            const unit = this.unit(entry, limited);
            if (unit <= 0) return Stock.available(entry);
            const bands = [{ min: 1, off: 0 }].concat(BULK_TIERS.slice().sort((a, b) => a.min - b.min));
            let best = 0;
            for (let i = 0; i < bands.length; i++) {
                const band = bands[i];
                const ceiling = i + 1 < bands.length ? bands[i + 1].min - 1 : Number.MAX_SAFE_INTEGER;
                const perUnit = unit * (1 - band.off);
                if (perUnit <= 0) continue;
                let qty = Math.min(Math.floor(gold / perUnit), ceiling);
                // perUnit is the float estimate; lineTotal is what the till
                // actually asks for. Walk the last cent or two back off.
                while (qty >= band.min && this.lineTotal(entry, qty, limited) > gold) qty--;
                if (qty >= band.min && qty > best) best = qty;
            }
            return Math.min(best, Stock.available(entry));
        }
    };

    //=========================================================================
    // Stock
    //=========================================================================
    // A catalogue row is warehoused and can be ordered by the crate. A daily
    // rarity is the one that exists, and a spell is a single course of lessons.

    const Stock = {
        UNLIMITED: 1000000,

        available: function (entry) {
            if (!entry) return 0;
            if (isSkillEntry(entry)) return 1;
            if (DailyLots.isRarity(entry)) return 1;
            return this.UNLIMITED;
        },

        isUnlimited: function (entry) {
            return this.available(entry) >= this.UNLIMITED;
        }
    };

    //=========================================================================
    // Listing flavour
    //=========================================================================
    // A marketplace listing is written by a seller who lives somewhere and has
    // been rated by the people who bought from them before. None of it changes
    // what a lot costs; all of it is seeded off the lot and the world, so the
    // same sword is sold by the same trader in every savegame of a world.

    const Listing = {
        _cache: new Map(),

        of: function (entry) {
            if (!entry) return null;
            const key = lotKey(entry);
            const cached = this._cache.get(key);
            if (cached && cached.seed === worldSeed()) return cached;

            const rand = seededRandom(hashString(key + ":" + worldSeed()));
            const sellers = T.pool('Stockbusters.seller.name');
            const places = T.pool('Stockbusters.seller.place');
            const record = {
                seed: worldSeed(),
                number: 1000000 + Math.floor(rand() * 8999999),
                seller: sellers.length ? sellers[Math.floor(rand() * sellers.length)] : "",
                place: places.length ? places[Math.floor(rand() * places.length)] : "",
                feedback: 100 + Math.floor(rand() * 9900),
                positive: (96 + rand() * 3.9).toFixed(1),
                // Cosmetic: a listings site always has a clock running on
                // something. The catalogue never actually expires.
                endsIn: 20 + Math.floor(rand() * 9000),
                watchers: Math.floor(rand() * 40),
                powerSeller: rand() < 0.28
            };
            this._cache.set(key, record);
            return record;
        },

        clear: function () { this._cache.clear(); }
    };

    //=========================================================================
    // Daily rarities
    //=========================================================================
    // One or two procedural artifacts a day (Crafting/ArctifactGenerator.js),
    // the same two in every savegame of a world on the same day.
    //
    // A procedural entry lives in a database slot that is rebuilt from the
    // database on every boot and handed out again to whatever asks next, so a
    // rarity is snapshotted into the savegame the moment it is rolled. The
    // snapshot is what is put back on the shelf after a reload, what a courier
    // carries, and what is finally handed over.

    const DailyLots = {
        generatorReady: function () {
            return typeof $gameSystem !== "undefined" && $gameSystem &&
                typeof $gameSystem.generateArtifact === "function";
        },

        state: function () {
            if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
            if (!$gameSystem._sbDailyLots) $gameSystem._sbDailyLots = { day: -1, lots: [] };
            return $gameSystem._sbDailyLots;
        },

        partyLevel: function () {
            if (typeof $gameParty === "undefined" || !$gameParty) return 5;
            const levels = $gameParty.members().map(a => a.level || 1).sort((a, b) => a - b);
            if (!levels.length) return 5;
            return Math.max(1, Math.min(99, levels[Math.floor(levels.length / 2)]));
        },

        // The generator rolls with Math.random, so the day's rarities would be
        // different in every savegame of the same world and different again
        // after a reload. It is lent a seeded roll for the length of the call
        // instead, which is the whole of what makes them "the day's".
        _seeded: function (rand, fn) {
            const real = Math.random;
            Math.random = rand;
            try { return fn(); } finally { Math.random = real; }
        },

        // Puts a snapshot back into a database slot that is free, or that
        // already holds it. A slot handed to someone else since is left alone
        // and the lot moves to a free one.
        install: function (lot) {
            if (!lot || !lot.data) return null;
            const list = dataListOf(lot.kind);
            if (!list) return null;

            const holder = list[lot.id];
            const isFree = (row) => !row || !row.name || row.name.startsWith("Empty ");
            if (!(isFree(holder) || holder.name === lot.data.name)) {
                // Someone else is using the slot: take the next one that is
                // not, and if the whole procedural range has been handed out,
                // grow the database rather than evict whoever is standing here.
                let moved = false;
                for (let i = 1; i < list.length; i++) {
                    if (!isFree(list[i])) continue;
                    lot.id = i;
                    moved = true;
                    break;
                }
                if (!moved) lot.id = list.length;
            }
            const target = JSON.parse(JSON.stringify(lot.data));
            target.id = lot.id;
            list[lot.id] = target;
            return target;
        },

        // The entry a lot stands for, put back on the shelf if it is not there.
        entryOf: function (lot) {
            if (!lot) return null;
            const list = dataListOf(lot.kind);
            const current = list && list[lot.id];
            if (current && current.name === (lot.data && lot.data.name)) return current;
            return this.install(lot);
        },

        // Rolls today's rarities if the day has turned, and makes sure whatever
        // the savegame remembers is standing on the shelf.
        refresh: function () {
            const state = this.state();
            if (!state) return [];

            const day = currentGameDay();
            if (state.day === day && Array.isArray(state.lots) && state.lots.length) {
                state.lots.forEach(lot => this.entryOf(lot));
                return state.lots;
            }
            if (!this.generatorReady()) {
                state.day = day;
                state.lots = [];
                return state.lots;
            }

            const rand = seededRandom(hashString("stockbusters:rarity:" + worldSeed() + ":" + day));
            const count = rand() < 0.45 ? 2 : 1;
            const level = this.partyLevel();
            const lots = [];

            for (let i = 0; i < count; i++) {
                const roll = rand();
                let kind = "item";
                let id = -1;
                this._seeded(rand, () => {
                    if (roll < 0.45) {
                        kind = "item";
                        id = $gameSystem.generateArtifact(level);
                    } else if (roll < 0.80) {
                        kind = "weapon";
                        id = $gameSystem.generateWeapon(level, 0);
                    } else {
                        kind = "armor";
                        id = $gameSystem.generateArmor(level, 0);
                    }
                });
                if (!id || id < 0) continue;
                const generated = entryOf(kind, id);
                if (!generated) continue;
                lots.push({
                    kind: kind,
                    id: id,
                    day: day,
                    data: JSON.parse(JSON.stringify(generated))
                });
            }

            state.day = day;
            state.lots = lots;
            return lots;
        },

        // Today's rarities as database entries, in listing order.
        entries: function () {
            return this.refresh().map(lot => this.entryOf(lot)).filter(Boolean);
        },

        isRarity: function (entry) {
            if (!entry) return false;
            const state = this.state();
            if (!state || !Array.isArray(state.lots)) return false;
            const kind = kindOf(entry);
            return state.lots.some(lot => lot.kind === kind && lot.id === entry.id &&
                lot.data && lot.data.name === entry.name);
        },

        // The snapshot a courier should carry for this entry, if it is one of
        // the procedural rows that will not survive a reboot on its own.
        snapshotFor: function (entry) {
            if (!entry) return null;
            const state = this.state();
            if (!state || !Array.isArray(state.lots)) return null;
            const kind = kindOf(entry);
            const lot = state.lots.find(l => l.kind === kind && l.id === entry.id &&
                l.data && l.data.name === entry.name);
            return lot ? JSON.parse(JSON.stringify(lot.data)) : null;
        }
    };

    //=========================================================================
    // Catalogue
    //=========================================================================
    // What is on which shelf. Plain data: the site is DOM, so nothing here
    // knows about windows or selection.

    const Catalogue = {
        // i18n-ignore-start: category ids from the <category:> note tag
        CUSTOM_ICONS: {
            Arctic: 67, Artisan: 188, Combat: 334, Collectibles: 210, Component: 83,
            Counterfeits: 306, Enhancers: 179, Espionage: 130, Books: 186, Tools: 83,
            Food: 265, Homeopathy: 273, Jungle: 277, Lifestyle: 84, Magic: 72,
            Medical: 176, Monsters: 293, Plants: 182, Recovery: 180, Survival: 209,
            Trash: 289, Misc: 245
        },
        // i18n-ignore-end

        // The category id stays English (it is matched against the <category:>
        // note tag); only the label is translated.
        customLabel: function (categoryName) {
            const key = 'Stockbusters.category.' + String(categoryName || '');
            return T.has(key) ? T(key) : categoryName;
        },

        weaponTypes: function () {
            return [
                { name: T('Stockbusters.text.daggers'), symbol: "weapon_1", icon: 326 },
                { name: T('Stockbusters.text.swords'), symbol: "weapon_2", icon: 335 },
                { name: T('Stockbusters.text.heavy'), symbol: "weapon_3", icon: 223 },
                { name: T('Stockbusters.text.axes'), symbol: "weapon_4", icon: 99 },
                { name: T('Stockbusters.text.whips'), symbol: "weapon_5", icon: 353 },
                { name: T('Stockbusters.text.staves'), symbol: "weapon_6", icon: 356 },
                { name: T('Stockbusters.text.bows'), symbol: "weapon_7", icon: 370 },
                { name: T('Stockbusters.text.projectiles'), symbol: "weapon_8", icon: 102 },
                { name: T('Stockbusters.text.guns'), symbol: "weapon_9", icon: 115 },
                { name: T('Stockbusters.text.claws'), symbol: "weapon_10", icon: 292 },
                { name: T('Stockbusters.text.gloves'), symbol: "weapon_11", icon: 142 },
                { name: T('Stockbusters.text.spears'), symbol: "weapon_12", icon: 378 }
            ];
        },

        armorTypes: function () {
            return [
                { name: T('Stockbusters.text.generalEquip'), symbol: "armor_1", icon: 136 },
                { name: T('Stockbusters.text.magicEquip'), symbol: "armor_2", icon: 138 },
                { name: T('Stockbusters.text.lightEquip'), symbol: "armor_3", icon: 135 },
                { name: T('Stockbusters.text.heavyEquip'), symbol: "armor_4", icon: 139 },
                { name: T('Stockbusters.text.shields'), symbol: "shields", icon: 125 }
            ];
        },

        // Memoized: this walks all three databases with a regex per row, and
        // the sidebar, the breadcrumb and the status line all ask for it on
        // every redraw. The <category:> tags cannot change inside a session.
        _customCache: null,

        customCategories: function () {
            if (this._customCache) return this._customCache;
            const categories = new Set();
            const extract = (item) => {
                if (!item || !item.note) return;
                const regex = /<category:([^>]*)>/gi;
                let match;
                while ((match = regex.exec(item.note)) !== null) categories.add(match[1]);
            };
            for (const list of [$dataItems, $dataWeapons, $dataArmors]) {
                for (let i = 1; i < list.length; i++) extract(list[i]);
            }
            this._customCache = Array.from(categories).sort();
            return this._customCache;
        },

        // The sidebar. In bazaar mode only the shelves that have something on
        // them are listed.
        categories: function (ctx) {
            const limited = ctx && ctx.limited;
            const available = (ctx && ctx.availableMap) || new Map();
            const has = (symbol) => !limited || available.get(symbol);
            const out = [];

            if (!limited && DailyLots.entries().length) {
                out.push({ name: T('Stockbusters.text.rarities'), symbol: RARITY_CATEGORY, icon: 163 });
            }
            out.push({ name: T('Stockbusters.text.allItems'), symbol: "all_items", icon: 209 });
            if (has(LEISURE_CATEGORY)) {
                out.push({ name: T('Stockbusters.text.leisure'), symbol: LEISURE_CATEGORY, icon: 84 });
            }
            if (has("skills")) out.push({ name: T('Stockbusters.text.skills'), symbol: "skills", icon: 64 });
            if (has("spells")) out.push({ name: T('Stockbusters.text.spells'), symbol: "spells", icon: 101 });
            if (has("all_weapons")) out.push({ name: T('Stockbusters.text.weapons'), symbol: "all_weapons", icon: 322 });
            for (const type of this.weaponTypes()) if (has(type.symbol)) out.push(type);
            if (has("all_armors")) out.push({ name: T('Stockbusters.text.equipment'), symbol: "all_armors", icon: 137 });
            for (const type of this.armorTypes()) if (has(type.symbol)) out.push(type);

            for (const category of this.customCategories()) {
                const symbol = "custom_" + category;
                if (!has(symbol)) continue;
                out.push({
                    name: this.customLabel(category),
                    symbol: symbol,
                    icon: this.CUSTOM_ICONS[category] || 245
                });
            }
            return out;
        },

        labelFor: function (symbol, ctx) {
            const found = this.categories(ctx).find(cat => cat.symbol === symbol);
            return found ? found.name : T('Stockbusters.text.wares');
        },

        hasCustomCategory: function (item, categoryName) {
            if (!item || !item.note) return false;
            return new RegExp("<category:" + categoryName + ">", "i").test(item.note);
        },

        sellable: function (entry) {
            if (!entry) return false;
            if (!entry.name || entry.name.trim() === '') return false;
            if (!isShopSellable(entry)) return false;
            // Keepsakes are not traded here. A collectible changes hands with a
            // person, never through a marketplace listing.
            if (window.ItemCollectibles && window.ItemCollectibles.isFixed(entry)) return false;
            // A world without magic has no spellbooks or charms on the shelf,
            // and a world where magic won never invented the technology
            // (window.MagicNature is the one answer for both).
            if (window.MagicNature && !window.MagicNature.allowsData(entry)) return false;
            if (isSkillEntry(entry)) {
                if (!entry.mpCost) return false;
                return learnerCandidates(entry).length > 0;
            }
            return (entry.price || 0) > 0;
        },

        matches: function (entry, symbol) {
            if (!entry) return false;
            if (symbol === "all_items") return DataManager.isItem(entry) && entry.itypeId === 1;
            if (symbol === "all_weapons") return DataManager.isWeapon(entry);
            if (symbol === "all_armors") return DataManager.isArmor(entry);
            if (symbol === "shields") return DataManager.isArmor(entry) && (entry.atypeId === 5 || entry.atypeId === 6);
            if (symbol === "skills") return isSkillEntry(entry) && entry.stypeId === 1;
            if (symbol === "spells") return isSkillEntry(entry) && entry.stypeId === 2;
            if (symbol.startsWith("weapon_")) {
                return DataManager.isWeapon(entry) && entry.wtypeId === parseInt(symbol.split("_")[1], 10);
            }
            if (symbol.startsWith("armor_")) {
                return DataManager.isArmor(entry) && entry.atypeId === parseInt(symbol.split("_")[1], 10);
            }
            if (symbol === LEISURE_CATEGORY) {
                return !!(window.ItemLeisure && window.ItemLeisure.isLeisure(entry));
            }
            if (symbol.startsWith("custom_")) {
                return this.hasCustomCategory(entry, symbol.replace("custom_", ""));
            }
            return false;
        },

        matchesSearch: function (entry, terms) {
            if (!entry || !terms.length) return false;
            const haystack = (itemNameOf(entry) + ' ' + entry.name + ' ' +
                (descriptionOf(entry) || '')).toLowerCase();
            return terms.every(term => haystack.includes(term));
        },

        // Everything a shelf holds, cheapest first. `ctx` carries the mode:
        // { limited, items, availableMap, query }.
        list: function (symbol, ctx) {
            const limited = ctx && ctx.limited;
            const results = [];

            if (symbol === RARITY_CATEGORY) {
                return DailyLots.entries();
            }

            if (limited) {
                for (const entry of ((ctx && ctx.items) || [])) {
                    if (!this.sellable(entry)) continue;
                    if (symbol === SEARCH_CATEGORY) {
                        if (this.matchesSearch(entry, ctx.terms || [])) results.push(entry);
                    } else if (this.matches(entry, symbol)) {
                        results.push(entry);
                    }
                }
            } else if (symbol === SEARCH_CATEGORY) {
                const terms = (ctx && ctx.terms) || [];
                for (const entry of DailyLots.entries()) {
                    if (this.matchesSearch(entry, terms)) results.push(entry);
                }
                for (const list of [$dataItems, $dataWeapons, $dataArmors, $dataSkills]) {
                    for (let i = 1; i < list.length; i++) {
                        const entry = list[i];
                        if (!entry || !this.sellable(entry)) continue;
                        if (list === $dataItems && entry.itypeId !== 1) continue;
                        if (list === $dataSkills && entry.stypeId !== 1 && entry.stypeId !== 2) continue;
                        if (this.matchesSearch(entry, terms)) results.push(entry);
                    }
                }
            } else {
                const lists = [];
                if (symbol === "all_items" || symbol === LEISURE_CATEGORY || symbol.startsWith("custom_")) lists.push($dataItems);
                if (symbol === "all_weapons" || symbol.startsWith("weapon_") || symbol.startsWith("custom_")) lists.push($dataWeapons);
                if (symbol === "all_armors" || symbol === "shields" || symbol.startsWith("armor_") || symbol.startsWith("custom_")) lists.push($dataArmors);
                if (symbol === "skills" || symbol === "spells") lists.push($dataSkills);

                for (const list of lists) {
                    for (let i = 1; i < list.length; i++) {
                        const entry = list[i];
                        if (!entry || !this.sellable(entry)) continue;
                        if (this.matches(entry, symbol)) results.push(entry);
                    }
                }
            }

            results.sort((a, b) => Pricing.unit(a, limited) - Pricing.unit(b, limited));
            if (symbol === SEARCH_CATEGORY && results.length > SEARCH_RESULT_LIMIT) {
                return results.slice(0, SEARCH_RESULT_LIMIT);
            }
            return results;
        },

        // The coordinate-seeded local bazaar: a handful of everything, the same
        // handful for the same square in the same world.
        limitedSelection: function (seedString, maxSkills) {
            const rng = seededRandom(hashString(String(seedString)));
            const selection = [];
            const availableMap = new Map();

            const mark = (entry) => {
                if (DataManager.isItem(entry) && entry.itypeId === 1) availableMap.set("all_items", true);
                else if (DataManager.isWeapon(entry)) {
                    availableMap.set("all_weapons", true);
                    availableMap.set("weapon_" + entry.wtypeId, true);
                } else if (DataManager.isArmor(entry)) {
                    availableMap.set("all_armors", true);
                    if (entry.atypeId === 5 || entry.atypeId === 6) availableMap.set("shields", true);
                    availableMap.set("armor_" + entry.atypeId, true);
                } else if (entry.stypeId === 1) availableMap.set("skills", true);
                else if (entry.stypeId === 2) availableMap.set("spells", true);

                if (window.ItemLeisure && window.ItemLeisure.isLeisure(entry)) {
                    availableMap.set(LEISURE_CATEGORY, true);
                }
                if (entry.note) {
                    const regex = /<category:([^>]*)>/gi;
                    let match;
                    while ((match = regex.exec(entry.note)) !== null) {
                        availableMap.set("custom_" + match[1], true);
                    }
                }
            };

            const take = (pool, count) => {
                const shuffled = pool.slice();
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(rng() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                for (const entry of shuffled.slice(0, Math.min(count, shuffled.length))) {
                    selection.push(entry);
                    mark(entry);
                }
            };

            const items = [], weapons = [], armors = [], skills = [], spells = [];
            for (let i = 1; i < $dataItems.length; i++) {
                const entry = $dataItems[i];
                if (entry && entry.itypeId === 1 && this.sellable(entry)) items.push(entry);
            }
            for (let i = 1; i < $dataWeapons.length; i++) {
                const entry = $dataWeapons[i];
                if (entry && this.sellable(entry)) weapons.push(entry);
            }
            for (let i = 1; i < $dataArmors.length; i++) {
                const entry = $dataArmors[i];
                if (entry && this.sellable(entry)) armors.push(entry);
            }
            for (let i = 1; i < $dataSkills.length; i++) {
                const entry = $dataSkills[i];
                if (!entry || !this.sellable(entry)) continue;
                if (entry.stypeId === 1) skills.push(entry);
                else if (entry.stypeId === 2) spells.push(entry);
            }

            take(items, 10 + Math.floor(rng() * 10));
            take(weapons, 7);
            take(armors, 5 + Math.floor(rng() * 5));
            const skillCount = Math.min(Math.floor((maxSkills || 0) / 2), skills.length);
            take(skills, skillCount);
            take(spells, Math.min((maxSkills || 0) - skillCount, spells.length));

            return { items: selection, availableMap: availableMap };
        }
    };

    //=========================================================================
    // Deliveries
    //=========================================================================
    // Orders live on $gameSystem so they are written into the savegame. They
    // used to sit on $dataSystem, which is rebuilt from the database on every
    // boot, so every pending order was lost the moment the game was reloaded.
    //
    // One basket becomes one dispatch: every line of it shares a lot id and an
    // arrival time, so the Orders page can show a parcel rather than a pile of
    // unrelated errands.

    const DeliveryManager = {
        getOrderedItems: function () {
            if (typeof $gameSystem === "undefined" || !$gameSystem) return [];
            if (!Array.isArray($gameSystem._deliveryOrders)) {
                $gameSystem._deliveryOrders = [];
            } else {
                this.migrateLegacyOrders();
            }
            return $gameSystem._deliveryOrders;
        },

        // An order used to be a whole database object plus a real-world
        // millisecond due date, and later a single unit with no quantity.
        // Rewrite either into the current record rather than leaving an old
        // save holding parcels that can never land.
        migrateLegacyOrders: function () {
            const orders = $gameSystem._deliveryOrders;
            if (!orders.some(order => !order || !order.kind || order.qty === undefined)) return;

            const now = currentGameMinutes();
            $gameSystem._deliveryOrders = orders.reduce((kept, order) => {
                if (!order) return kept;
                if (order.kind) {
                    if (order.qty === undefined) order.qty = 1;
                    kept.push(order);
                    return kept;
                }
                const legacy = order.item;
                const kind = legacy ? kindOf(legacy) : null;
                if (kind) {
                    kept.push({
                        kind: kind,
                        id: legacy.id,
                        qty: 1,
                        price: order.price || 0,
                        orderedAt: now,
                        arriveAt: now + MIN_DELIVERY_MINUTES
                    });
                }
                return kept;
            }, []);
        },

        kindOf: kindOf,

        // The database entry an order stands for. A procedural row is put back
        // on the shelf from the snapshot the order is carrying, so a rarity
        // bought yesterday still arrives as itself after a reboot.
        dataOf: function (order) {
            if (!order) return null;
            if (order.snapshot) {
                const restored = DailyLots.install({ kind: order.kind, id: order.id, data: order.snapshot });
                if (restored) {
                    order.id = restored.id;
                    return restored;
                }
            }
            return entryOf(order.kind, order.id);
        },

        // Cheap wares turn up almost at once and the expensive ones take
        // longer; a crate of a thousand buys the courier another hour.
        calculateDeliveryTime: function (price, qty) {
            const ratio = Math.min(Math.max(price / this.getMaxPrice(), 0), 1);
            const span = MAX_DELIVERY_MINUTES - MIN_DELIVERY_MINUTES;
            const base = MIN_DELIVERY_MINUTES + Math.sqrt(ratio) * span;
            const units = Math.max(0, Math.floor(qty || 1) - 1);
            const bulk = Math.min(MAX_BULK_DELIVERY_MINUTES, Math.sqrt(units) * 3);
            return Math.round(base + bulk);
        },

        // Memoized: this walks all three databases and is asked for on every
        // redraw of the catalog.
        _maxPrice: 0,
        getMaxPrice: function () {
            if (this._maxPrice) return this._maxPrice;
            let maxPrice = 10000;
            for (const list of [$dataItems, $dataWeapons, $dataArmors]) {
                for (let i = 1; i < list.length; i++) {
                    const entry = list[i];
                    if (entry && entry.price > maxPrice) maxPrice = entry.price;
                }
            }
            this._maxPrice = maxPrice;
            return maxPrice;
        },

        // Books one dispatch. `lines` are { entry, qty, price }; every line of
        // the basket lands together.
        addDispatch: function (lines, deliveryMinutes) {
            const now = currentGameMinutes();
            const arriveAt = now + Math.max(1, Math.round(deliveryMinutes));
            const lot = "L" + now + "-" + Math.floor(Math.random() * 100000);
            const orders = this.getOrderedItems();
            const placed = [];

            for (const line of lines) {
                const entry = line.entry;
                const kind = kindOf(entry);
                if (!kind) continue;
                const order = {
                    kind: kind,
                    id: entry.id,
                    qty: Math.max(1, Math.floor(line.qty || 1)),
                    price: line.price || 0,
                    lot: lot,
                    orderedAt: now,
                    arriveAt: arriveAt
                };
                // A spell is owed to the member it was booked for, and the
                // courier is carrying it across game days: the id travels with
                // the order rather than being asked again on delivery.
                if (kind === "skill" && line.learner) order.learner = line.learner;
                // A procedural row will not be in the database after a reboot.
                const snapshot = DailyLots.snapshotFor(entry);
                if (snapshot) order.snapshot = snapshot;
                orders.push(order);
                placed.push(order);
            }
            return { lot: lot, arriveAt: arriveAt, orders: placed };
        },

        getOrderCount: function () {
            return this.getOrderedItems().length;
        },

        // How many units of a lot are already on their way.
        orderedUnits: function (entry) {
            if (!entry) return 0;
            const kind = kindOf(entry);
            return this.getOrderedItems()
                .filter(order => order.kind === kind && order.id === entry.id)
                .reduce((sum, order) => sum + (order.qty || 1), 0);
        },

        isItemOrdered: function (entry) {
            return this.orderedUnits(entry) > 0;
        },

        getMinutesLeft: function (order) {
            if (!order) return 0;
            return Math.max(0, order.arriveAt - currentGameMinutes());
        },

        getItemMinutesLeft: function (entry) {
            if (!entry) return 0;
            const kind = kindOf(entry);
            const mine = this.getOrderedItems().filter(o => o.kind === kind && o.id === entry.id);
            if (!mine.length) return 0;
            return Math.min(...mine.map(order => this.getMinutesLeft(order)));
        },

        isOrderReady: function (order) {
            return !!order && currentGameMinutes() >= order.arriveAt;
        },

        readyCount: function () {
            return this.getOrderedItems().filter(order => this.isOrderReady(order)).length;
        },

        // The orders page reads parcels, not errands.
        dispatches: function () {
            const groups = new Map();
            this.getOrderedItems().forEach((order, index) => {
                // An order booked before dispatches existed has no lot. Give it
                // one and keep it: the Collect button addresses a parcel by id.
                if (!order.lot) order.lot = "L-solo-" + index + "-" + order.arriveAt;
                const key = order.lot;
                if (!groups.has(key)) {
                    groups.set(key, { lot: key, arriveAt: order.arriveAt, orders: [] });
                }
                groups.get(key).orders.push(order);
            });
            return Array.from(groups.values()).sort((a, b) => a.arriveAt - b.arriveAt);
        },

        // Hands one arrived order over. Returns what it delivered.
        deliverOrder: function (order) {
            const entry = this.dataOf(order);
            if (!entry) return null;
            const qty = Math.max(1, Math.floor(order.qty || 1));

            if (order.kind === "skill") {
                const actor = learnerFor(entry, order.learner);
                if (actor) actor.learnSkill(entry.id);
            } else {
                $gameParty.gainItem(entry, qty);
            }
            return { entry: entry, qty: qty };
        },

        // Collects everything that has arrived and returns what was handed
        // over. Pass a lot id to collect just that parcel; everything else
        // stays in transit either way.
        retireDeliveredItems: function (lot) {
            const orders = this.getOrderedItems();
            if (orders.length === 0) return [];

            const delivered = [];
            const remaining = [];
            for (const order of orders) {
                const mine = !lot || order.lot === lot || order === lot;
                if (this.isOrderReady(order) && mine) delivered.push(order);
                else remaining.push(order);
            }
            $gameSystem._deliveryOrders = remaining;

            const handed = [];
            for (const order of delivered) {
                const result = this.deliverOrder(order);
                if (result) {
                    handed.push(result.qty > 1
                        ? T('Stockbusters.text.unitsOf', { item: itemNameOf(result.entry), count: result.qty })
                        : itemNameOf(result.entry));
                }
            }
            return handed;
        }
    };

    // An arrival announces itself once while the party is out walking, so the
    // player knows there is something waiting to be collected.
    function announceArrivals() {
        if (typeof $gameSystem === "undefined" || !$gameSystem || !$gameParty) return;

        for (const order of DeliveryManager.getOrderedItems()) {
            if (order.notified || !DeliveryManager.isOrderReady(order)) continue;
            order.notified = true;

            const entry = DeliveryManager.dataOf(order);
            if (!entry || !window.ParchmentToast) continue;
            window.ParchmentToast.show(T('Stockbusters.text.orderArrived', { item: itemNameOf(entry) }), {
                severity: "info",
                icon: entry.iconIndex,
                key: `stockbusters:${order.kind}:${order.id}` // i18n-ignore  dedupe key
            });
        }
    }

    const _Scene_Map_update_stockbusters = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_stockbusters.call(this);
        if (Graphics.frameCount % 60 === 0) announceArrivals();
    };

    // Read by the Mailbox event and anything else that wants to know whether a
    // parcel is waiting without opening the shop.
    window.StockbustersDelivery = DeliveryManager;

    //=========================================================================
    // Basket
    //=========================================================================
    // Lines of { kind, id, qty }. It lives on the scene rather than in the
    // savegame: a basket left unpaid is not a promise to anybody.

    function Basket() {
        this.lines = [];
    }

    Basket.prototype.find = function (entry) {
        const kind = kindOf(entry);
        return this.lines.find(line => line.kind === kind && line.id === entry.id) || null;
    };

    // `learner` is the actor id a spell line is booked for; wares ignore it.
    Basket.prototype.add = function (entry, qty, learner) {
        if (!entry) return null;
        const wanted = Pricing.clampQty(entry, qty);
        const existing = this.find(entry);
        if (existing) {
            existing.qty = Pricing.clampQty(entry, existing.qty + wanted);
            if (learner) existing.learner = learner;
            return existing;
        }
        const line = { kind: kindOf(entry), id: entry.id, qty: wanted };
        if (learner) line.learner = learner;
        this.lines.push(line);
        return line;
    };

    Basket.prototype.setQty = function (entry, qty) {
        const line = this.find(entry);
        if (!line) return null;
        line.qty = Pricing.clampQty(entry, qty);
        return line;
    };

    Basket.prototype.remove = function (entry) {
        const kind = kindOf(entry);
        this.lines = this.lines.filter(line => !(line.kind === kind && line.id === entry.id));
    };

    Basket.prototype.clear = function () {
        this.lines = [];
    };

    Basket.prototype.units = function () {
        return this.lines.reduce((sum, line) => sum + line.qty, 0);
    };

    // Lines with their database entries resolved, dropping anything the
    // database no longer holds.
    Basket.prototype.resolved = function () {
        return this.lines.map(line => {
            const entry = entryOf(line.kind, line.id);
            return entry ? { kind: line.kind, id: line.id, qty: line.qty, entry: entry, learner: line.learner } : null;
        }).filter(Boolean);
    };

    Basket.prototype.total = function (limited) {
        return Pricing.basket(this.resolved(), limited);
    };

    //=========================================================================
    // Site chrome
    //=========================================================================

    const SITE_CSS = `
#sb-root { width:100%; height:100%; display:flex; flex-direction:column;
    font-family:Arial, Helvetica, sans-serif; font-size:12px; color:var(--xp-black); background:var(--xp-white); }
#sb-root * { box-sizing:border-box; }
#sb-root a, #sb-root .sb-link { color:var(--xp-navy-5); text-decoration:underline; cursor:pointer; }
#sb-root a:hover, #sb-root .sb-link:hover { color:var(--xp-red); }
#sb-root .sb-icon { display:inline-block; vertical-align:middle; background-repeat:no-repeat;
    image-rendering:pixelated; flex-shrink:0; }

#sb-root .sb-masthead { display:flex; align-items:center; gap:12px; padding:6px 10px 4px 10px;
    background:var(--xp-white); border-bottom:1px solid var(--xp-gray-mid); flex-shrink:0; }
#sb-root .sb-logo { font-family:'Times New Roman', Georgia, serif; font-size:26px; font-weight:bold;
    letter-spacing:-1px; line-height:1; }
#sb-root .sb-logo i { font-style:italic; }
#sb-root .sb-logo .l1 { color:#e53238; }
#sb-root .sb-logo .l2 { color:#0064d2; }
#sb-root .sb-logo .l3 { color:#f5af02; }
#sb-root .sb-logo .l4 { color:#86b817; }
#sb-root .sb-tagline { font-size:10px; color:var(--xp-ink-soft); }
#sb-root .sb-purse { margin-left:auto; text-align:right; font-size:11px; color:var(--xp-ink-4); }
#sb-root .sb-purse b { color:var(--xp-ok); font-size:14px; }

#sb-root .sb-tabs { display:flex; gap:2px; padding:4px 8px 0 8px; background:var(--xp-white);
    border-bottom:3px solid var(--xp-navy); flex-shrink:0; }
#sb-root .sb-tab { padding:3px 14px; font-size:11px; font-weight:bold; cursor:pointer;
    border:1px solid var(--xp-ink-pale); border-bottom:none; border-radius:7px 7px 0 0;
    background:linear-gradient(var(--xp-white), var(--xp-disabled)); color:var(--xp-navy); }
#sb-root .sb-tab.active { background:var(--xp-navy); border-color:var(--xp-navy); color:var(--xp-white); }
#sb-root .sb-tab.sel { outline:2px dotted var(--xp-red); outline-offset:-2px; }
#sb-root .sb-tab .sb-pill { background:var(--xp-red); color:var(--xp-white); border-radius:8px; padding:0 5px;
    margin-left:5px; font-size:10px; }

#sb-root .sb-searchbar { display:flex; align-items:center; gap:6px; padding:5px 10px;
    background:var(--xp-row-tint-3); border-bottom:1px solid var(--xp-steel-2); flex-shrink:0; }
#sb-root input[type=text], #sb-root input[type=number] { font-family:Arial, Helvetica, sans-serif;
    font-size:12px; padding:2px 4px; border:2px inset var(--xp-disabled); background:var(--xp-white); color:var(--xp-black); }
#sb-root .sb-btn { font-family:Arial, Helvetica, sans-serif; font-size:11px; font-weight:bold;
    padding:2px 10px; border:2px outset var(--xp-disabled); background:var(--xp-disabled); color:var(--xp-black); cursor:pointer; }
#sb-root .sb-btn:active { border-style:inset; }
#sb-root .sb-btn[disabled] { color:var(--xp-ink-faint-2); cursor:default; border-style:solid; border-color:#bbbbbb; }
#sb-root .sb-btn.sel { outline:2px dotted var(--xp-red); outline-offset:1px; }
#sb-root .sb-btn.gold { background:linear-gradient(var(--xp-amber-2), #f5af02); border-color:var(--xp-amber-2) #a07b00 #a07b00 #ffe680; }
#sb-root .sb-btn.blue { background:linear-gradient(#7aa7ff, #0044aa); border-color:#7aa7ff #002255 #002255 #7aa7ff; color:var(--xp-white); }
#sb-root .sb-btn.big { font-size:13px; padding:5px 16px; }

#sb-root .sb-body { display:flex; flex:1; min-height:0; }
#sb-root .sb-side { width:172px; min-width:172px; background:#f5f5f0; border-right:1px solid var(--xp-gray-mid);
    overflow-y:auto; padding-bottom:8px; }
#sb-root .sb-side h3 { margin:0; padding:3px 6px; font-size:11px; color:var(--xp-black);
    background:var(--xp-amber); border-bottom:1px solid #a07b00; }
#sb-root .sb-cat { display:flex; align-items:center; gap:5px; padding:3px 6px; cursor:pointer;
    font-size:11px; color:var(--xp-navy-5); text-decoration:underline; }
#sb-root .sb-cat:hover { background:var(--xp-note); }
#sb-root .sb-cat.active { background:var(--xp-navy); color:var(--xp-white); font-weight:bold; text-decoration:none; }
#sb-root .sb-cat.sel { background:var(--xp-note); color:var(--xp-red); }
#sb-root .sb-cat.active.sel { background:#0055cc; color:var(--xp-white); }

#sb-root .sb-main { flex:1; min-width:0; overflow-y:auto; overflow-x:hidden; padding:8px; background:var(--xp-white); }
#sb-root .sb-crumbs { font-size:11px; color:var(--xp-ink-soft); margin-bottom:6px; }
#sb-root .sb-h1 { font-size:16px; font-weight:bold; color:var(--xp-navy); margin:0 0 6px 0; }

#sb-root table.sb-list { width:100%; border-collapse:collapse; }
#sb-root table.sb-list th { background:var(--xp-navy); color:var(--xp-white); font-size:11px; text-align:left;
    padding:3px 6px; white-space:nowrap; }
#sb-root table.sb-list td { border-bottom:1px solid var(--xp-silver-5); padding:4px 6px; vertical-align:middle; }
#sb-root table.sb-list tr.sb-row { cursor:pointer; }
#sb-root table.sb-list tr.sb-row:nth-child(even) { background:var(--xp-off-white); }
#sb-root table.sb-list tr.sb-row:hover { background:var(--xp-note); }
#sb-root table.sb-list tr.sb-row.sel { background:var(--xp-note); outline:1px solid var(--xp-red); }
#sb-root .sb-title { color:var(--xp-navy-5); text-decoration:underline; font-weight:bold; }
#sb-root .sb-price { color:var(--xp-red); font-weight:bold; white-space:nowrap; }
#sb-root .sb-bulk { color:var(--xp-ok); white-space:nowrap; }
#sb-root .sb-new { color:var(--xp-red); font-weight:bold; font-size:10px; }
#sb-root .sb-badge { display:inline-block; font-size:9px; font-weight:bold; padding:0 3px;
    border:1px solid #a07b00; background:var(--xp-amber); color:var(--xp-black); margin-left:4px; vertical-align:middle; }
#sb-root .sb-badge.rare { background:var(--xp-red); border-color:#660000; color:var(--xp-white); }
#sb-root .sb-badge.transit { background:#dfe8ff; border-color:var(--xp-navy); color:var(--xp-navy); }

#sb-root .sb-panel { border:1px solid var(--xp-ink-pale); margin-bottom:8px; background:var(--xp-white); }
#sb-root .sb-panel-hd { background:var(--xp-row-tint-3); border-bottom:1px solid var(--xp-ink-pale); padding:3px 6px;
    font-weight:bold; color:var(--xp-navy); font-size:12px; }
#sb-root .sb-panel-bd { padding:6px; }
#sb-root .sb-note { background:var(--xp-note); border:1px solid var(--xp-amber); padding:4px 6px; font-size:11px; }

#sb-root .sb-item-top { display:flex; gap:10px; align-items:flex-start; }
#sb-root .sb-media { width:210px; min-width:210px; border:1px solid var(--xp-ink-pale); background:var(--xp-white); }
#sb-root .sb-media-hd { background:var(--xp-row-tint-3); border-bottom:1px solid var(--xp-ink-pale); padding:2px 5px;
    font-size:10px; color:var(--xp-navy); font-weight:bold; }
#sb-root .sb-stage { width:100%; height:230px; background:var(--xp-black); display:block; }
#sb-root .sb-stage.flat { background:var(--xp-white); display:flex; align-items:center; justify-content:center; }
#sb-root .sb-buybox { flex:1; min-width:0; }
#sb-root .sb-qtyrow { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin:5px 0; }
#sb-root .sb-qtyrow input { width:92px; }
#sb-root .sb-bigprice { font-size:20px; color:var(--xp-red); font-weight:bold; }
#sb-root .sb-strike { text-decoration:line-through; color:var(--xp-ink-faint-2); }
#sb-root table.sb-kv { width:100%; border-collapse:collapse; font-size:11px; }
#sb-root table.sb-kv td { padding:1px 4px; border-bottom:1px dotted var(--xp-silver-5); }
#sb-root table.sb-kv td.k { color:var(--xp-text-muted); width:44%; }
#sb-root table.sb-kv td.v { font-weight:bold; text-align:right; }
#sb-root table.sb-kv tr.sb-off td { color:var(--xp-ink-pale); font-weight:normal; }
#sb-root table.sb-tiers { border-collapse:collapse; font-size:11px; width:100%; }
#sb-root table.sb-tiers th { background:#dfe8ff; color:var(--xp-navy); padding:1px 5px; text-align:left; }
#sb-root table.sb-tiers td { padding:1px 5px; border-bottom:1px dotted var(--xp-gray-mid); }
#sb-root table.sb-tiers tr.hit td { background:var(--xp-note); font-weight:bold; }

#sb-root .sb-status { display:flex; align-items:center; gap:10px; padding:3px 8px; font-size:10px;
    color:var(--xp-text-muted); background:var(--xp-gray-light); border-top:1px solid var(--xp-gray-mid); flex-shrink:0; }
#sb-root .sb-status .sb-copy { margin-left:auto; }

#sb-root .sb-modal { position:absolute; left:0; top:0; width:100%; height:100%; z-index:50;
    background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; }
#sb-root .sb-modal-box { width:420px; max-width:88%; border:2px outset var(--xp-disabled); background:var(--xp-bg);
    box-shadow:4px 4px 12px rgba(0,0,0,0.5); }
#sb-root .sb-modal-hd { background:linear-gradient(#0a58c8, var(--xp-navy)); color:var(--xp-white); font-weight:bold;
    padding:3px 8px; font-size:12px; }
#sb-root .sb-modal-bd { padding:12px; font-size:12px; }
#sb-root .sb-modal-ft { padding:8px 12px; display:flex; gap:8px; justify-content:flex-end; }

/* The rich reading is built by the backpack's own inspect service
   (window.ItemInspect) and by window.SkillDetails, so a lot reads here exactly
   as it does in the pack. Only the ink is the site's. */
#sb-root .item-inspect { display:block; }
#sb-root .inspect-header, #sb-root .inspect-meta, #sb-root .inspect-actions,
#sb-root .inspect-frame, #sb-root .inspect-name { display:none; }
#sb-root .inspect-desc { font-size:12px; color:var(--xp-black); margin-bottom:5px; }
#sb-root .inspect-flavour { font-style:italic; color:var(--xp-text-muted); margin-bottom:6px;
    border-left:3px solid var(--xp-amber); padding-left:6px; }
#sb-root .inspect-section-title { background:var(--xp-row-tint-3); color:var(--xp-navy); font-weight:bold; font-size:11px;
    padding:2px 5px; margin:6px 0 2px 0; border-top:1px solid var(--xp-steel-2); }
#sb-root .inspect-spec-row { display:flex; justify-content:space-between; gap:8px; font-size:11px;
    padding:1px 5px; border-bottom:1px dotted var(--xp-silver-5); }
#sb-root .inspect-spec-label { color:var(--xp-text-muted); }
#sb-root .inspect-spec-value { font-weight:bold; text-align:right; }
#sb-root .inspect-bullet-item { font-size:11px; padding:1px 5px 1px 14px; position:relative; }
#sb-root .inspect-bullet-item:before { content:'\\25AA'; position:absolute; left:4px; color:var(--xp-navy); }
#sb-root .inspect-effect-label { color:var(--xp-navy); font-weight:bold; }
#sb-root .inspect-lore { display:block; }
#sb-root .recipe-mat-icon { display:inline-block; background-image:url('img/system/IconSet.png');
    vertical-align:middle; image-rendering:pixelated; }
#sb-root .craft-block { font-size:11px; margin-top:4px; }
`;

    // The logo, letter by letter, the way a marketplace of the period wore it.
    function logoHTML() {
        const name = T('Stockbusters.ui.appName');
        const classes = ['l1', 'l2', 'l3', 'l4'];
        let out = '';
        for (let i = 0; i < name.length; i++) {
            out += `<i class="${classes[i % 4]}">${escapeHtml(name[i])}</i>`;
        }
        return out;
    }

    //=========================================================================
    // Spell animation preview
    //=========================================================================
    // A spell is bought unseen otherwise. SkillMaster owns the isolated
    // Effekseer viewport (window.SkillAnimPreview); this is only the plumbing
    // that decides whether the site can mount one.

    const SpellPreview = {
        supported: function () {
            return !!(window.SkillAnimPreview && window.SkillAnimPreview.isSupported &&
                window.SkillAnimPreview.isSupported());
        },

        // True only for a named Effekseer effect: an MV frame animation has
        // nothing to play here.
        hasEffect: function (skill) {
            if (!skill || !skill.animationId || typeof $dataAnimations === 'undefined') return false;
            const anim = $dataAnimations[skill.animationId];
            return !!(anim && !anim.frames && anim.effectName);
        },

        mount: function (canvas, skill) {
            if (!canvas || !this.supported() || !this.hasEffect(skill)) return false;
            if (!window.SkillAnimPreview.init(canvas, true)) return false;
            window.SkillAnimPreview.setAnimation(skill.animationId);
            return true;
        },

        dispose: function () {
            if (window.SkillAnimPreview) window.SkillAnimPreview.dispose();
        }
    };

    //=========================================================================
    // Scene_SearchableShop
    //=========================================================================
    // The site itself. It is drawn entirely as DOM inside its HypernetOS
    // window: no canvas window of the shop is ever shown, so none is built.

    function Scene_SearchableShop() {
        this.initialize(...arguments);
    }

    Scene_SearchableShop.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_SearchableShop.prototype.constructor = Scene_SearchableShop;

    Scene_SearchableShop.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        this._isLimited = false;
        this._seedString = "";
        this._maxSkills = 0;

        this._page = "home";          // home | list | item | cart | orders
        this._category = null;
        this._searchQuery = "";
        this._listPage = 0;
        this._list = [];
        this._selected = null;        // the entry the listing page is showing
        this._qty = 1;
        this._learnerId = 0;          // who a spell on the page is billed to
        this._basket = new Basket();
        this._confirm = null;         // pending checkout confirmation
        this._nav = 0;
        this._skeletonKey = "";
        this._weaponPreviews = [];
        this._spellMounted = false;
    };

    Scene_SearchableShop.prototype.prepare = function (params) {
        if (!params) return;
        this._isLimited = !!params.isLimited;
        this._seedString = params.seedString || "";
        this._maxSkills = params.maxSkills || 0;
    };

    Scene_SearchableShop.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        // Haggling still moves the prices, but the site shows no skill chip.
        if (window.SpecBadge) window.SpecBadge.hide();

        if (this._isLimited) {
            const selection = Catalogue.limitedSelection(this._seedString, this._maxSkills);
            this._limitedItems = selection.items;
            this._availableMap = selection.availableMap;
        }
        DailyLots.refresh();
        Listing.clear();

        this.createSiteDOM();
    };

    Scene_SearchableShop.prototype.ctx = function () {
        return {
            limited: this._isLimited,
            items: this._limitedItems,
            availableMap: this._availableMap,
            terms: this._searchQuery ? this._searchQuery.toLowerCase().split(/\s+/) : []
        };
    };

    Scene_SearchableShop.prototype.gold = function () {
        return $gameParty ? $gameParty.gold() : 0;
    };

    // ---- DOM ---------------------------------------------------------------

    Scene_SearchableShop.prototype.createSiteDOM = function () {
        const parent = document.getElementById('emporium-content');
        if (!parent) return;

        const root = document.createElement('div');
        // NOT id="menu-container": that id means "fullscreen parchment overlay"
        // globally (theme.css pins it position:fixed over the whole viewport),
        // which would tear the site out of its OS window.
        root.id = 'sb-root';
        root.innerHTML = `
            <style>${SITE_CSS}</style>
            <div class="sb-masthead">
                <div class="sb-logo">${logoHTML()}</div>
                <div class="sb-tagline">${T('Stockbusters.ui.tagline')}<br>${escapeHtml(T('Stockbusters.ui.siteName'))}</div>
                <div class="sb-purse">
                    ${T('Stockbusters.text.gold')}<br><b id="sb-gold">0</b>
                </div>
            </div>
            <div class="sb-tabs" id="sb-tabs"></div>
            <div class="sb-searchbar">
                <span>${T('Stockbusters.ui.searchLabel')}</span>
                <input id="sb-search" type="text" autocomplete="off" spellcheck="false"
                       style="flex:1;min-width:80px;" placeholder="${escapeHtml(T('Stockbusters.ui.searchPlaceholder'))}">
                <button class="sb-btn blue" data-act="search">${T('Stockbusters.ui.searchButton')}</button>
                <span class="sb-link" data-act="page:home">${T('Stockbusters.ui.tab.home')}</span>
            </div>
            <div class="sb-body">
                <div class="sb-side" id="sb-side"></div>
                <div class="sb-main" id="sb-main"></div>
            </div>
            <div class="sb-status">
                <span id="sb-status-left"></span>
                <span class="sb-copy">${T('Stockbusters.ui.copyright')}</span>
            </div>
            <div id="sb-modal"></div>
        `;
        parent.appendChild(root);
        this._root = root;

        // One delegated listener for the whole site: every clickable carries a
        // data-act, and the keyboard walks those same nodes.
        this._onClick = (event) => {
            const target = event.target.closest ? event.target.closest('[data-act]') : null;
            if (!target || !this._root.contains(target)) return;
            event.preventDefault();
            event.stopPropagation();
            this.act(target.dataset.act, target);
        };
        root.addEventListener('click', this._onClick);

        // Keep the keystrokes here: the OS window is marked self-nav and RPG
        // Maker's own document listener eats space and backspace, so without
        // this no box could be typed into and every letter would also drive the
        // selection underneath.
        this._onKeyDown = (event) => {
            if (!event.target || !event.target.matches) return;
            if (!event.target.matches('input')) return;
            if (event.key === 'Escape') return;
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                if (event.target.id === 'sb-search') this.applySearch(event.target.value);
                else event.target.blur();
            }
        };
        root.addEventListener('keydown', this._onKeyDown);

        this._onInput = (event) => {
            const el = event.target;
            if (!el || !el.dataset) return;
            if (el.dataset.role === 'qty') this.onQtyInput(el);
            if (el.dataset.role === 'cartqty') this.onCartQtyInput(el);
        };
        root.addEventListener('input', this._onInput);

        this.render();
    };

    Scene_SearchableShop.prototype.terminate = function () {
        Scene_MenuBase.prototype.terminate.call(this);
        this.disposeMedia();
        if (this._root) {
            this._root.removeEventListener('click', this._onClick);
            this._root.removeEventListener('keydown', this._onKeyDown);
            this._root.removeEventListener('input', this._onInput);
            if (this._root.parentNode) this._root.parentNode.removeChild(this._root);
            this._root = null;
        }
    };

    // ---- actions -----------------------------------------------------------

    Scene_SearchableShop.prototype.act = function (action, element) {
        if (!action) return;
        const [verb, ...rest] = action.split(':');
        const arg = rest.join(':');

        switch (verb) {
            case 'page':
                SoundManager.playCursor();
                this.goPage(arg);
                break;
            case 'cat':
                SoundManager.playOk();
                this.openCategory(arg);
                break;
            case 'lot':
                SoundManager.playOk();
                this.openLot(arg);
                break;
            case 'search': {
                const box = document.getElementById('sb-search');
                this.applySearch(box ? box.value : '');
                break;
            }
            case 'listpage':
                SoundManager.playCursor();
                this._listPage = Math.max(0, parseInt(arg, 10) || 0);
                this.render();
                break;
            case 'qty':
                this.setQty(arg);
                break;
            case 'learner':
                this.setLearner(arg);
                break;
            case 'addcart':
                this.addToBasket();
                break;
            case 'buynow':
                this.buyNow();
                break;
            case 'cartqty':
                this.bumpCartLine(arg, element);
                break;
            case 'cartdel':
                SoundManager.playCancel();
                this.removeCartLine(arg);
                break;
            case 'cartclear':
                SoundManager.playCancel();
                this._basket.clear();
                this.render();
                break;
            case 'checkout':
                this.askCheckout();
                break;
            case 'confirm':
                this.doCheckout();
                break;
            case 'dismiss':
                SoundManager.playCancel();
                this._confirm = null;
                this.render();
                break;
            case 'collect':
                this.collectDispatch(arg);
                break;
            case 'collectall':
                this.collectAll();
                break;
            case 'back':
                SoundManager.playCancel();
                this.goBack();
                break;
            case 'close':
                this.closeSite();
                break;
        }
    };

    Scene_SearchableShop.prototype.goPage = function (page) {
        this._page = page;
        this._nav = 0;
        if (page === 'list') {
            this._listPage = 0;
            // Browse with nothing picked yet opens on the general shelf rather
            // than on a page with no category lit in the sidebar.
            if (!this._category) this._category = 'all_items';
        }
        this.render();
    };

    Scene_SearchableShop.prototype.goBack = function () {
        if (this._confirm) { this._confirm = null; this.render(); return; }
        if (this._page === 'item') { this.goPage(this._category ? 'list' : 'home'); return; }
        if (this._page !== 'home') { this.goPage('home'); return; }
        this.closeSite();
    };

    Scene_SearchableShop.prototype.closeSite = function () {
        SoundManager.playCancel();
        if (this._isAppMode) {
            const win = document.getElementById('app-store');
            if (win && window.HypernetOS) window.HypernetOS.WindowManager.closeWindow(win);
        } else {
            this.popScene();
        }
    };

    Scene_SearchableShop.prototype.openCategory = function (symbol) {
        this._category = symbol;
        this._searchQuery = symbol === SEARCH_CATEGORY ? this._searchQuery : "";
        if (symbol !== SEARCH_CATEGORY) {
            const box = document.getElementById('sb-search');
            if (box) box.value = "";
        }
        this._listPage = 0;
        this._nav = 0;
        this._page = 'list';
        this.render();
    };

    Scene_SearchableShop.prototype.openLot = function (key) {
        const [kind, id] = key.split(':');
        const entry = entryOf(kind, parseInt(id, 10));
        if (!entry) return;
        this._selected = entry;
        this._qty = 1;
        // A spell opens billed to the first member who could take it, so the
        // common case (one caster in the party) needs no click at all.
        const first = isSkillEntry(entry) ? learnerCandidates(entry)[0] : null;
        this._learnerId = first ? first.actorId() : 0;
        this._nav = 0;
        this._page = 'item';
        this.render();
    };

    // Bill the spell on the page to another member. Only a member who could
    // actually take it is offered, so this never has to refuse.
    Scene_SearchableShop.prototype.setLearner = function (actorId) {
        const id = parseInt(actorId, 10) || 0;
        if (this._learnerId === id) return;
        this._learnerId = id;
        SoundManager.playCursor();
        this._skeletonKey = "";       // the reading below is that member's now
        this.render();
    };

    Scene_SearchableShop.prototype.applySearch = function (query) {
        const trimmed = String(query || '').trim();
        this._searchQuery = trimmed;
        if (!trimmed) {
            this.goPage('home');
            return;
        }
        SoundManager.playOk();
        this.openCategory(SEARCH_CATEGORY);
    };

    // ---- quantity ----------------------------------------------------------

    Scene_SearchableShop.prototype.setQty = function (spec) {
        const entry = this._selected;
        if (!entry) return;
        let qty = this._qty;
        if (spec === 'max') {
            qty = Math.max(1, Pricing.maxAffordable(entry, this.gold(), this._isLimited));
        } else if (spec.startsWith('+')) {
            qty = this._qty + parseInt(spec.slice(1), 10);
        } else if (spec.startsWith('-')) {
            qty = this._qty - parseInt(spec.slice(1), 10);
        } else {
            qty = parseInt(spec, 10);
        }
        this._qty = Pricing.clampQty(entry, qty);
        const box = document.getElementById('sb-qty');
        if (box) box.value = this._qty;
        SoundManager.playCursor();
        this.refreshBuyBox();
    };

    Scene_SearchableShop.prototype.onQtyInput = function (element) {
        if (!this._selected) return;
        const raw = parseInt(element.value, 10);
        // An empty box is left alone while it is being typed into: clamping it
        // to 1 on every keystroke makes a three-digit quantity impossible.
        if (!element.value) return;
        this._qty = Pricing.clampQty(this._selected, raw);
        if (String(this._qty) !== element.value) element.value = this._qty;
        this.refreshBuyBox();
    };

    Scene_SearchableShop.prototype.onCartQtyInput = function (element) {
        const entry = entryOf(element.dataset.kind, parseInt(element.dataset.id, 10));
        if (!entry || !element.value) return;
        this._basket.setQty(entry, parseInt(element.value, 10));
        const line = this._basket.find(entry);
        if (line && String(line.qty) !== element.value) element.value = line.qty;
        this.refreshCartTotals();
    };

    Scene_SearchableShop.prototype.bumpCartLine = function (spec, element) {
        const [kind, id, delta] = spec.split(',');
        const entry = entryOf(kind, parseInt(id, 10));
        if (!entry) return;
        const line = this._basket.find(entry);
        if (!line) return;
        this._basket.setQty(entry, line.qty + parseInt(delta, 10));
        SoundManager.playCursor();
        this.render();
    };

    Scene_SearchableShop.prototype.removeCartLine = function (key) {
        const [kind, id] = key.split(':');
        const entry = entryOf(kind, parseInt(id, 10));
        if (entry) this._basket.remove(entry);
        this.render();
    };

    // ---- buying ------------------------------------------------------------

    Scene_SearchableShop.prototype.addToBasket = function () {
        const entry = this._selected;
        if (!entry) return;
        this._basket.add(entry, this._qty, isSkillEntry(entry) ? this._learnerId : 0);
        SoundManager.playOk();
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T('Stockbusters.text.addedToCart', {
                item: itemNameOf(entry), count: this._qty
            }), { severity: "info", icon: entry.iconIndex });
        }
        this.render();
    };

    Scene_SearchableShop.prototype.buyNow = function () {
        const entry = this._selected;
        if (!entry) return;
        this._confirm = {
            lines: [{
                kind: kindOf(entry), id: entry.id, qty: this._qty, entry: entry,
                learner: isSkillEntry(entry) ? this._learnerId : 0
            }],
            fromBasket: false
        };
        this.render();
    };

    Scene_SearchableShop.prototype.askCheckout = function () {
        const lines = this._basket.resolved();
        if (!lines.length) { SoundManager.playBuzzer(); return; }
        this._confirm = { lines: lines, fromBasket: true };
        this.render();
    };

    Scene_SearchableShop.prototype.doCheckout = function () {
        const pending = this._confirm;
        if (!pending) return;
        const lines = pending.lines;
        const totals = Pricing.basket(lines, this._isLimited);

        if (totals.total > this.gold()) {
            SoundManager.playBuzzer();
            this._confirm = null;
            this.render();
            return;
        }

        $gameParty.loseGold(totals.total);
        // Buying teaches Haggling, scaled by what the deal was worth.
        if (window.SpecializationXP) {
            window.SpecializationXP.awardForValue('Haggling', totals.total);
        }

        // A line's share of what was actually paid, so an order records what it
        // cost rather than what it was listed at.
        const share = totals.gross > 0 ? totals.total / totals.gross : 0;
        const priced = lines.map(line => ({
            entry: line.entry,
            qty: line.qty,
            learner: line.learner,
            price: Math.floor(Pricing.unit(line.entry, this._isLimited) * line.qty * share)
        }));

        const names = priced.map(line => line.qty > 1
            ? T('Stockbusters.text.unitsOf', { item: itemNameOf(line.entry), count: line.qty })
            : itemNameOf(line.entry)).join(', ');

        if (this._isLimited) {
            // A bazaar hands the goods over across the counter, no courier.
            for (const line of priced) {
                if (isSkillEntry(line.entry)) {
                    const actor = learnerFor(line.entry, line.learner);
                    if (actor) actor.learnSkill(line.entry.id);
                } else {
                    $gameParty.gainItem(line.entry, line.qty);
                }
            }
            SoundManager.playShop();
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('Stockbusters.text.collected', { items: names }), { severity: "info" });
            }
        } else {
            const minutes = DeliveryManager.calculateDeliveryTime(totals.total, totals.units);
            DeliveryManager.addDispatch(priced, minutes);
            SoundManager.playShop();
            if (window.ParchmentToast) {
                window.ParchmentToast.show(T('Stockbusters.text.dispatchPlaced', {
                    count: totals.units, time: formatDelay(minutes)
                }), { severity: "info", icon: priced[0] ? priced[0].entry.iconIndex : 0 });
            }
        }

        // An order placed, in the party's own diary (Diary.js). A bazaar hands
        // the goods over at once; everything else is a courier on the way.
        if (window.Diary) window.Diary.onOrderPlaced(names, totals.total, !this._isLimited);

        if (pending.fromBasket) this._basket.clear();
        this._confirm = null;
        this._page = this._isLimited ? 'home' : 'orders';
        this._nav = 0;
        this.render();
    };

    // ---- deliveries --------------------------------------------------------

    Scene_SearchableShop.prototype.collectDispatch = function (lot) {
        const delivered = DeliveryManager.retireDeliveredItems(lot);
        this.announceCollection(delivered);
    };

    Scene_SearchableShop.prototype.collectAll = function () {
        this.announceCollection(DeliveryManager.retireDeliveredItems());
    };

    Scene_SearchableShop.prototype.announceCollection = function (delivered) {
        if (!delivered.length) { SoundManager.playBuzzer(); return; }
        SoundManager.playShop();
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T('Stockbusters.text.collected', { items: delivered.join(', ') }),
                { severity: "info" });
        }
        this.render();
    };

    //=========================================================================
    // Rendering
    //=========================================================================

    Scene_SearchableShop.prototype.render = function () {
        if (!this._root) return;

        const gold = document.getElementById('sb-gold');
        if (gold) gold.textContent = formatPrice(this.gold());

        this.renderTabs();
        this.renderSide();
        this.renderMain();
        this.renderStatus();
        this.renderModal();
        this.applySelection();
    };

    Scene_SearchableShop.prototype.renderTabs = function () {
        const host = document.getElementById('sb-tabs');
        if (!host) return;

        const units = this._basket.units();
        const ready = DeliveryManager.readyCount();
        const tabs = [
            { id: 'home', label: T('Stockbusters.ui.tab.home') },
            { id: 'list', label: T('Stockbusters.ui.tab.browse') },
            { id: 'cart', label: T('Stockbusters.ui.tab.cart'), pill: units || 0 },
            { id: 'orders', label: T('Stockbusters.ui.tab.orders'), pill: ready || 0 }
        ];
        if (this._isLimited) tabs.splice(3, 1);

        const html = tabs.map(tab => {
            const active = this._page === tab.id || (tab.id === 'list' && this._page === 'item');
            const pill = tab.pill ? `<span class="sb-pill">${tab.pill}</span>` : '';
            return `<div class="sb-tab${active ? ' active' : ''}" data-act="page:${tab.id}" data-nav>${escapeHtml(tab.label)}${pill}</div>`;
        }).join('');
        if (host.innerHTML !== html) host.innerHTML = html;
    };

    Scene_SearchableShop.prototype.renderSide = function () {
        const host = document.getElementById('sb-side');
        if (!host) return;

        const categories = Catalogue.categories(this.ctx());
        let html = `<h3>${T('Stockbusters.ui.catalogCategories')}</h3>`;
        html += categories.map(cat => {
            const active = this._category === cat.symbol && (this._page === 'list' || this._page === 'item');
            return `<div class="sb-cat${active ? ' active' : ''}" data-act="cat:${cat.symbol}" data-nav>` +
                `${iconHTML(cat.icon, 16)}<span>${escapeHtml(cat.name)}</span></div>`;
        }).join('');

        if (host.innerHTML !== html) {
            const scroll = host.scrollTop;
            host.innerHTML = html;
            host.scrollTop = scroll;
        }
    };

    Scene_SearchableShop.prototype.renderStatus = function () {
        const host = document.getElementById('sb-status-left');
        if (!host) return;
        const pending = DeliveryManager.getOrderCount();
        host.textContent = T('Stockbusters.text.statusLine', {
            lots: this._page === 'list' ? this._list.length : Catalogue.categories(this.ctx()).length,
            orders: pending
        });
    };

    Scene_SearchableShop.prototype.renderMain = function () {
        const host = document.getElementById('sb-main');
        if (!host) return;

        if (this._page === 'item' && this._selected) {
            this.renderItemPage(host);
            return;
        }

        this.disposeMedia();
        this._skeletonKey = "";

        let html = "";
        if (this._page === 'home') html = this.homeHTML();
        else if (this._page === 'list') html = this.listHTML();
        else if (this._page === 'cart') html = this.cartHTML();
        else if (this._page === 'orders') html = this.ordersHTML();

        if (host.innerHTML !== html) {
            host.innerHTML = html;
            host.scrollTop = 0;
        }
    };

    // ---- home --------------------------------------------------------------

    Scene_SearchableShop.prototype.homeHTML = function () {
        const rarities = this._isLimited ? [] : DailyLots.entries();
        const ready = DeliveryManager.readyCount();
        const pending = DeliveryManager.getOrderCount();

        let html = `<div class="sb-h1">${this._isLimited
            ? escapeHtml(T('Stockbusters.text.theArchmageSBazaar'))
            : escapeHtml(T('Stockbusters.text.welcomeHeadline'))}</div>`;
        html += `<div class="sb-note" style="margin-bottom:8px;">${T('Stockbusters.text.welcomeBlurb')}</div>`;

        if (rarities.length) {
            html += `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.todaysRarities')}</div>` +
                `<div class="sb-panel-bd">` +
                `<div style="font-size:11px;color:var(--xp-text-muted);margin-bottom:5px;">${T('Stockbusters.text.raritiesBlurb')}</div>` +
                this.tableHTML(rarities, { rarity: true }) +
                `</div></div>`;
        }

        // The volume ladder, printed where a marketplace would print a
        // wholesale notice.
        html += `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.volumePricing')}</div>` +
            `<div class="sb-panel-bd"><table class="sb-tiers"><tr><th>${T('Stockbusters.text.units')}</th><th>${T('Stockbusters.text.discount')}</th></tr>` +
            BULK_TIERS.slice().reverse().map(tier =>
                `<tr><td>${tier.min}+</td><td>-${Math.round(tier.off * 100)}%</td></tr>`).join('') +
            `</table><div style="font-size:11px;margin-top:4px;">${T('Stockbusters.text.lotBonusBlurb', {
                percent: Math.round(LOT_BONUS_PER_LINE * 100), max: Math.round(MAX_LOT_BONUS * 100)
            })}</div></div></div>`;

        if (!this._isLimited) {
            html += `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.activeOrders')} (${pending})</div>` +
                `<div class="sb-panel-bd">`;
            if (!pending) {
                html += `<div style="color:var(--xp-ink-soft);">${T('Stockbusters.text.noActiveDeliveriesInTransit')}</div>`;
            } else {
                html += `<div>${T('Stockbusters.text.parcelsPending', { count: pending, ready: ready })}</div>` +
                    `<div style="margin-top:5px;"><button class="sb-btn" data-act="page:orders" data-nav>${T('Stockbusters.ui.tab.orders')}</button></div>`;
            }
            html += `</div></div>`;
        }
        return html;
    };

    // ---- listing table -----------------------------------------------------

    Scene_SearchableShop.prototype.tableHTML = function (entries, opts) {
        const options = opts || {};
        const limited = this._isLimited;
        let html = `<table class="sb-list"><tr>` +
            `<th style="width:26px;"></th>` +
            `<th>${T('Stockbusters.text.colItem')}</th>` +
            `<th style="width:90px;">${T('Stockbusters.text.colPrice')}</th>` +
            `<th style="width:110px;">${T('Stockbusters.text.colBulk')}</th>` +
            `<th style="width:80px;">${T('Stockbusters.text.colStock')}</th>` +
            `<th style="width:80px;">${T('Stockbusters.text.colTimeLeft')}</th></tr>`;

        for (const entry of entries) {
            const unit = Pricing.unit(entry, limited);
            const bulkUnit = Math.floor(Pricing.lineTotal(entry, 100, limited) / 100);
            const listing = Listing.of(entry);
            const inTransit = DeliveryManager.orderedUnits(entry);
            const rarity = options.rarity || DailyLots.isRarity(entry);
            const stock = Stock.isUnlimited(entry)
                ? T('Stockbusters.text.inStock')
                : T('Stockbusters.text.onlyLeft', { count: Stock.available(entry) });

            html += `<tr class="sb-row" data-act="lot:${lotKey(entry)}" data-nav>` +
                `<td>${iconHTML(entry.iconIndex, 22)}</td>` +
                `<td><span class="sb-title">${escapeHtml(itemNameOf(entry))}</span>` +
                (rarity ? `<span class="sb-badge rare">${T('Stockbusters.text.rareBadge')}</span>` : '') +
                (inTransit ? `<span class="sb-badge transit">${T('Stockbusters.text.inTransitBadge', { count: inTransit })}</span>` : '') +
                `<div style="font-size:10px;color:var(--xp-ink-soft);">${escapeHtml(listing.seller)} (${listing.feedback}) ★ ${listing.positive}%</div></td>` +
                `<td class="sb-price">${formatPrice(unit)}</td>` +
                `<td class="sb-bulk">${Stock.isUnlimited(entry)
                    ? T('Stockbusters.text.perUnitAt', { price: formatPrice(bulkUnit), count: 100 })
                    : '-'}</td>` +
                `<td>${stock}</td>` +
                `<td style="font-size:11px;">${formatDelay(listing.endsIn)}</td></tr>`;
        }
        html += `</table>`;
        return html;
    };

    Scene_SearchableShop.prototype.listHTML = function () {
        const symbol = this._category || 'all_items';
        this._list = Catalogue.list(symbol, this.ctx());

        const pages = Math.max(1, Math.ceil(this._list.length / ROWS_PER_PAGE));
        this._listPage = Math.min(this._listPage, pages - 1);
        const slice = this._list.slice(this._listPage * ROWS_PER_PAGE, (this._listPage + 1) * ROWS_PER_PAGE);

        // The heading is escaped as a whole below, so the query goes into it
        // raw; the empty-results note is inserted as markup and escapes its own.
        const heading = symbol === SEARCH_CATEGORY
            ? T('Stockbusters.text.searchResultsFor', { query: this._searchQuery, count: this._list.length })
            : Catalogue.labelFor(symbol, this.ctx());

        let html = `<div class="sb-crumbs"><span class="sb-link" data-act="page:home">${T('Stockbusters.ui.tab.home')}</span> &gt; ${escapeHtml(heading)}</div>`;
        html += `<div class="sb-h1">${escapeHtml(heading)}</div>`;

        if (!this._list.length) {
            html += `<div class="sb-note">${symbol === SEARCH_CATEGORY
                ? T('Stockbusters.text.noSearchResults', { query: escapeHtml(this._searchQuery) })
                : T('Stockbusters.text.noProductsAvailable')}</div>`;
            return html;
        }

        html += this.tableHTML(slice, {});

        if (pages > 1) {
            html += `<div style="margin-top:6px;font-size:11px;">${T('Stockbusters.text.pageOf', {
                page: this._listPage + 1, pages: pages
            })} &nbsp;`;
            for (let i = 0; i < pages && i < 20; i++) {
                html += i === this._listPage
                    ? `<b style="margin:0 3px;">${i + 1}</b>`
                    : `<span class="sb-link" style="margin:0 3px;" data-act="listpage:${i}" data-nav>${i + 1}</span>`;
            }
            html += `</div>`;
        }
        if (symbol === SEARCH_CATEGORY && this._list.length >= SEARCH_RESULT_LIMIT) {
            html += `<div class="sb-note" style="margin-top:6px;">${T('Stockbusters.text.searchTruncated', { count: SEARCH_RESULT_LIMIT })}</div>`;
        }
        return html;
    };

    // ---- listing page ------------------------------------------------------

    // The page is built in two halves. The skeleton (the media pane, the
    // quantity box, the reading) is written only when the lot changes, so the
    // 3D viewport is not torn down and the quantity box does not lose the
    // caret; everything the quantity moves is refreshed by id afterwards.
    Scene_SearchableShop.prototype.renderItemPage = function (host) {
        const entry = this._selected;
        const key = lotKey(entry);

        if (this._skeletonKey !== key) {
            this.disposeMedia();
            host.innerHTML = this.itemSkeletonHTML(entry);
            host.scrollTop = 0;
            this._skeletonKey = key;
            this.mountMedia(entry);
        }
        this.refreshBuyBox();
    };

    Scene_SearchableShop.prototype.itemSkeletonHTML = function (entry) {
        const listing = Listing.of(entry);
        const skill = isSkillEntry(entry);
        const inTransit = DeliveryManager.orderedUnits(entry);
        const category = this._category ? Catalogue.labelFor(this._category, this.ctx()) : T('Stockbusters.text.wares');

        let html = `<div class="sb-crumbs">` +
            `<span class="sb-link" data-act="page:home">${T('Stockbusters.ui.tab.home')}</span> &gt; ` +
            `<span class="sb-link" data-act="page:list">${escapeHtml(category)}</span> &gt; ` +
            `${escapeHtml(itemNameOf(entry))}</div>`;

        html += `<div class="sb-h1">${escapeHtml(itemNameOf(entry))}` +
            (DailyLots.isRarity(entry) ? `<span class="sb-badge rare">${T('Stockbusters.text.rareBadge')}</span>` : '') +
            `</div>`;
        html += `<div style="font-size:11px;color:var(--xp-ink-soft);margin-bottom:6px;">` +
            `${T('Stockbusters.text.itemNumber', { number: listing.number })} &nbsp;|&nbsp; ` +
            `${T('Stockbusters.text.watchers', { count: listing.watchers })}</div>`;

        html += `<div class="sb-item-top">`;

        // Media pane: the piece itself where there is one to show.
        html += `<div class="sb-media"><div class="sb-media-hd">${skill
            ? T('Stockbusters.text.animationPreview')
            : T('Stockbusters.text.modelPreview')}</div>`;
        const model = this.previewModelFor(entry);
        const castable = skill && SpellPreview.hasEffect(entry) && SpellPreview.supported();
        html += (model || castable)
            ? `<canvas id="sb-canvas" class="sb-stage" width="210" height="230"></canvas>`
            : `<div class="sb-stage flat">${iconHTML(entry.iconIndex, 96)}</div>`;
        html += `<div style="padding:3px 5px;font-size:10px;color:var(--xp-ink-soft);">${model
            ? T('Stockbusters.text.dragToTurn')
            : (castable ? T('Stockbusters.text.dragToOrbit') : T('Stockbusters.text.noPreview'))}</div>`;
        html += `</div>`;

        // Buy box: everything the quantity moves is behind an id.
        const maxQty = Stock.available(entry);
        html += `<div class="sb-buybox">`;
        html += `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.buyItNow')}</div><div class="sb-panel-bd">`;
        const dt = (entry.meta && entry.meta.DamageType) ||
            (entry.note && (entry.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
        let scaleStr = '';
        if (DataManager.isWeapon(entry)) {
            const note = entry.note || '';
            const scales = [];
            const regex = /<Scale:\s*([^>]+)>/gi;
            let match;
            while ((match = regex.exec(note)) !== null) {
                scales.push(...match[1].split(',').map(s => s.trim().toUpperCase()));
            }
            if (scales.length > 0) scaleStr = scales.join(' + ');
        }
        html += `<table class="sb-kv">` +
            (dt ? `<tr><td class="k">${T('Inventory.spec.label.damageCategory') || 'Damage Type'}</td><td class="v"><b style="color:var(--xp-navy);">${escapeHtml(String(dt).trim())}</b></td></tr>` : '') +
            (scaleStr ? `<tr><td class="k">Scaling</td><td class="v"><b style="color:#b8860b;">${escapeHtml(scaleStr)}</b></td></tr>` : '') +
            `<tr><td class="k">${T('Stockbusters.text.colPrice')}</td><td class="v"><span id="sb-unit" class="sb-price"></span></td></tr>` +
            `<tr><td class="k">${T('Stockbusters.text.perUnit')}</td><td class="v"><span id="sb-each"></span></td></tr>` +
            `<tr><td class="k">${T('Stockbusters.ui.totalCost')}</td><td class="v"><span id="sb-total" class="sb-bigprice"></span></td></tr>` +
            `<tr><td class="k">${T('Stockbusters.text.youSave')}</td><td class="v"><span id="sb-save" class="sb-bulk"></span></td></tr>` +
            (this._isLimited ? '' :
                `<tr><td class="k">${T('Stockbusters.ui.deliveryEstimate')}</td><td class="v"><span id="sb-eta"></span></td></tr>`) +
            `<tr><td class="k">${T('Stockbusters.text.colStock')}</td><td class="v">${Stock.isUnlimited(entry)
                ? T('Stockbusters.text.inStock')
                : T('Stockbusters.text.onlyLeft', { count: maxQty })}</td></tr>` +
            (inTransit ? `<tr><td class="k">${T('Stockbusters.text.alreadyOrdered')}</td><td class="v">${inTransit}</td></tr>` : '') +
            `</table>`;

        html += `<div class="sb-qtyrow"><span>${T('Stockbusters.text.quantity')}</span>` +
            `<input id="sb-qty" type="number" min="1" step="1" value="${this._qty}" data-role="qty"` +
            (maxQty < Stock.UNLIMITED ? ` max="${maxQty}"` : '') + `>`;
        if (maxQty > 1) {
            html += `<button class="sb-btn" data-act="qty:1" data-nav>1</button>` +
                `<button class="sb-btn" data-act="qty:10" data-nav>10</button>` +
                `<button class="sb-btn" data-act="qty:100" data-nav>100</button>` +
                `<button class="sb-btn" data-act="qty:max" data-nav>${T('Stockbusters.text.maxAffordable')}</button>`;
        }
        html += `</div>`;

        html += `<div class="sb-qtyrow">` +
            `<button class="sb-btn gold big" data-act="buynow" data-nav id="sb-buy">${this._isLimited
                ? T('Stockbusters.text.acquireItem') : T('Stockbusters.text.buyItNow')}</button>` +
            `<button class="sb-btn big" data-act="addcart" data-nav>${T('Stockbusters.text.addToCart')}</button>` +
            `<button class="sb-btn" data-act="back" data-nav>${T('Stockbusters.text.back')}</button>` +
            `</div>`;
        html += `<div id="sb-nudge" style="font-size:11px;color:var(--xp-ok);"></div>`;
        html += `</div></div>`;

        // Who the tuition is booked for. Wares go into the pack and belong to
        // nobody; a spell has to be understood by somebody in particular.
        if (skill) html += this.learnerPanelHTML(entry);

        // Volume ladder for this lot, priced.
        if (Stock.isUnlimited(entry)) {
            html += `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.volumePricing')}</div>` +
                `<div class="sb-panel-bd"><table class="sb-tiers" id="sb-tiers">${this.tierRowsHTML(entry)}</table></div></div>`;
        }

        // Seller card.
        html += `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.sellerInfo')}</div>` +
            `<div class="sb-panel-bd"><table class="sb-kv">` +
            `<tr><td class="k">${T('Stockbusters.text.seller')}</td><td class="v">${escapeHtml(listing.seller)}` +
            (listing.powerSeller ? `<span class="sb-badge">${T('Stockbusters.text.powerSeller')}</span>` : '') + `</td></tr>` +
            `<tr><td class="k">${T('Stockbusters.text.feedback')}</td><td class="v">${listing.feedback} (${listing.positive}%)</td></tr>` +
            `<tr><td class="k">${T('Stockbusters.text.shipsFrom')}</td><td class="v">${escapeHtml(listing.place)}</td></tr>` +
            `</table></div></div>`;
        html += `</div></div>`;

        // The reading itself: the backpack's own inspect service for wares, the
        // skill service for spells, so a lot reads here as it does in the pack.
        html += `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.description')}</div>` +
            `<div class="sb-panel-bd">${this.readingHTML(entry)}</div></div>`;
        return html;
    };

    // The tuition panel: every party member against the floor the spell is
    // written in. A member who already knows it, or whose base stat is under
    // that floor, is listed with the reason and cannot be picked, so the page
    // says WHY somebody is not an option rather than quietly leaving them out.
    Scene_SearchableShop.prototype.learnerPanelHTML = function (entry) {
        const svc = window.SkillStatReq;
        const req = svc && svc.of(entry);
        const chosen = learnerFor(entry, this._learnerId);
        const chosenId = chosen ? chosen.actorId() : 0;

        let rows = '';
        for (const actor of $gameParty.allMembers()) {
            const knows = actor.hasSkill && actor.hasSkill(entry.id);
            const stand = req ? svc.check(actor, entry) : null;
            const ok = canLearnSkill(actor, entry);
            const note = knows
                ? T('Stockbusters.text.learnerKnows')
                : (stand ? T('Stockbusters.text.learnerStat', {
                    stat: svc.statName(stand.stat), value: stand.have, points: stand.points
                }) : '');
            rows += `<tr class="${ok ? '' : 'sb-off'}">` +
                `<td class="k">${ok
                    ? `<button class="sb-btn${actor.actorId() === chosenId ? ' gold' : ''}" data-act="learner:${actor.actorId()}" data-nav>${escapeHtml(actor.name())}</button>`
                    : escapeHtml(actor.name())}</td>` +
                `<td class="v">${escapeHtml(note)}</td></tr>`;
        }

        return `<div class="sb-panel"><div class="sb-panel-hd">${T('Stockbusters.text.tuitionFor')}</div>` +
            `<div class="sb-panel-bd">` +
            (req ? `<div style="font-size:11px;color:var(--xp-ink-soft);margin-bottom:4px;">${T('Stockbusters.text.tuitionRequires', {
                stat: svc.statName(req.stat), points: req.points
            })}</div>` : '') +
            `<table class="sb-kv">${rows}</table></div></div>`;
    };

    Scene_SearchableShop.prototype.tierRowsHTML = function (entry) {
        const limited = this._isLimited;
        const rows = [{ min: 1, off: 0 }].concat(BULK_TIERS.slice().sort((a, b) => a.min - b.min));
        let html = `<tr><th>${T('Stockbusters.text.units')}</th><th>${T('Stockbusters.text.perUnit')}</th><th>${T('Stockbusters.text.discount')}</th></tr>`;
        for (const tier of rows) {
            const unit = Math.floor(Pricing.lineTotal(entry, tier.min, limited) / tier.min);
            const hit = Pricing.bulkRate(this._qty) === tier.off &&
                (tier.off > 0 || this._qty < BULK_TIERS[BULK_TIERS.length - 1].min);
            html += `<tr class="${hit ? 'hit' : ''}"><td>${tier.min}+</td>` +
                `<td>${formatPrice(unit)}</td><td>${tier.off ? '-' + Math.round(tier.off * 100) + '%' : '-'}</td></tr>`;
        }
        return html;
    };

    // Everything worth reading about a lot, borrowed from the menus that
    // already know how to say it.
    Scene_SearchableShop.prototype.readingHTML = function (entry) {
        if (isSkillEntry(entry)) {
            // Read against whoever the tuition is booked for, so the stat rows
            // on the card are that member's and not the leader's.
            const actor = learnerFor(entry, this._learnerId);
            let html = `<div class="inspect-desc">${descriptionOf(entry) || T('Stockbusters.text.noDescription')}</div>`;
            if (window.SkillDetails && actor) html += window.SkillDetails.build(entry, actor);
            return html;
        }

        if (window.ItemInspect && typeof window.ItemInspect.detailsHTML === 'function') {
            let html = window.ItemInspect.detailsHTML(entry);
            if (window.ItemSystemUtils && typeof window.ItemSystemUtils.craftHTML === 'function') {
                html += window.ItemSystemUtils.craftHTML(entry);
            }
            return html;
        }

        // The backpack is not loaded: the short description is still owed.
        let html = `<div class="inspect-desc">${descriptionOf(entry) || T('Stockbusters.text.noDescription')}</div>`;
        if (window.ItemSystemUtils && typeof window.ItemSystemUtils.loreFor === 'function') {
            const lore = window.ItemSystemUtils.loreFor(entry);
            if (lore) html += `<div class="inspect-flavour">${lore}</div>`;
        }
        return html;
    };

    // Everything the quantity moves, refreshed without rewriting the page.
    Scene_SearchableShop.prototype.refreshBuyBox = function () {
        const entry = this._selected;
        if (!entry || this._page !== 'item') return;

        const limited = this._isLimited;
        const qty = this._qty;
        const unit = Pricing.unit(entry, limited);
        const total = Pricing.lineTotal(entry, qty, limited);
        const each = qty > 0 ? Math.floor(total / qty) : unit;
        const saved = Math.max(0, unit * qty - total);

        const set = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        set('sb-unit', formatPrice(unit));
        set('sb-each', qty > 1 ? formatPrice(each) : formatPrice(unit));
        set('sb-total', formatPrice(total));
        set('sb-save', saved > 0
            ? T('Stockbusters.text.savedAmount', { amount: formatPrice(saved), percent: Math.round(Pricing.bulkRate(qty) * 100) })
            : '-');
        if (!limited) {
            set('sb-eta', formatDelay(DeliveryManager.calculateDeliveryTime(total, qty)));
        }

        const buy = document.getElementById('sb-buy');
        if (buy) {
            const afford = total <= this.gold();
            buy.disabled = !afford;
            buy.textContent = afford
                ? (limited ? T('Stockbusters.text.acquireItem') : T('Stockbusters.text.buyItNow'))
                : T('Stockbusters.text.insufficientFunds');
        }

        const nudge = document.getElementById('sb-nudge');
        if (nudge) {
            const next = Stock.isUnlimited(entry) ? Pricing.nextTier(qty) : null;
            nudge.textContent = next
                ? T('Stockbusters.text.nextTierNudge', { count: next.min - qty, percent: Math.round(next.off * 100) })
                : '';
        }

        const tiers = document.getElementById('sb-tiers');
        if (tiers) {
            const html = this.tierRowsHTML(entry);
            if (tiers.innerHTML !== html) tiers.innerHTML = html;
        }
    };

    // ---- basket page -------------------------------------------------------

    Scene_SearchableShop.prototype.cartHTML = function () {
        const lines = this._basket.resolved();
        let html = `<div class="sb-h1">${T('Stockbusters.text.yourCart')}</div>`;

        if (!lines.length) {
            html += `<div class="sb-note">${T('Stockbusters.text.cartEmpty')}</div>`;
            html += `<div style="margin-top:6px;"><button class="sb-btn" data-act="page:home" data-nav>${T('Stockbusters.text.continueShopping')}</button></div>`;
            return html;
        }

        const limited = this._isLimited;
        html += `<table class="sb-list"><tr><th style="width:26px;"></th><th>${T('Stockbusters.text.colItem')}</th>` +
            `<th style="width:150px;">${T('Stockbusters.text.quantity')}</th>` +
            `<th style="width:90px;">${T('Stockbusters.text.perUnit')}</th>` +
            `<th style="width:100px;">${T('Stockbusters.ui.totalCost')}</th>` +
            `<th style="width:26px;"></th></tr>`;

        for (const line of lines) {
            const entry = line.entry;
            const total = Pricing.lineTotal(entry, line.qty, limited);
            const each = Math.floor(total / line.qty);
            const rate = Pricing.bulkRate(line.qty);
            const key = lotKey(entry);
            html += `<tr><td>${iconHTML(entry.iconIndex, 22)}</td>` +
                `<td><span class="sb-title" data-act="lot:${key}" data-nav>${escapeHtml(itemNameOf(entry))}</span>` +
                (rate ? `<span class="sb-badge">-${Math.round(rate * 100)}%</span>` : '') + `</td>` +
                `<td><button class="sb-btn" data-act="cartqty:${line.kind},${line.id},-1" data-nav>-</button> ` +
                `<input type="number" min="1" step="1" style="width:70px;" value="${line.qty}" data-role="cartqty" data-kind="${line.kind}" data-id="${line.id}"> ` +
                `<button class="sb-btn" data-act="cartqty:${line.kind},${line.id},1" data-nav>+</button></td>` +
                `<td>${formatPrice(each)}</td>` +
                `<td class="sb-price" id="sb-line-${line.kind}-${line.id}">${formatPrice(total)}</td>` +
                `<td><span class="sb-link" data-act="cartdel:${key}" data-nav>${T('Stockbusters.text.removeLine')}</span></td></tr>`;
        }
        html += `</table>`;

        html += `<div class="sb-panel" style="margin-top:8px;"><div class="sb-panel-hd">${T('Stockbusters.text.orderSummary')}</div>` +
            `<div class="sb-panel-bd"><table class="sb-kv" id="sb-cart-totals">${this.cartTotalsHTML()}</table>` +
            `<div style="margin-top:8px;display:flex;gap:6px;">` +
            `<button class="sb-btn gold big" data-act="checkout" data-nav>${T('Stockbusters.text.placeOrder')}</button>` +
            `<button class="sb-btn" data-act="cartclear" data-nav>${T('Stockbusters.text.emptyCart')}</button>` +
            `<button class="sb-btn" data-act="page:home" data-nav>${T('Stockbusters.text.continueShopping')}</button>` +
            `</div></div></div>`;
        return html;
    };

    Scene_SearchableShop.prototype.cartTotalsHTML = function () {
        const totals = this._basket.total(this._isLimited);
        const minutes = DeliveryManager.calculateDeliveryTime(totals.total, totals.units);
        let html = `<tr><td class="k">${T('Stockbusters.text.subtotal')}</td><td class="v sb-strike">${formatPrice(totals.gross)}</td></tr>` +
            `<tr><td class="k">${T('Stockbusters.text.volumeDiscount')}</td><td class="v sb-bulk">-${formatPrice(totals.volumeSaved)}</td></tr>` +
            `<tr><td class="k">${T('Stockbusters.text.lotBonus', { percent: Math.round(totals.lotBonus * 100) })}</td>` +
            `<td class="v sb-bulk">-${formatPrice(totals.lotSaved)}</td></tr>` +
            `<tr><td class="k">${T('Stockbusters.text.units')}</td><td class="v">${totals.units}</td></tr>`;
        if (!this._isLimited) {
            html += `<tr><td class="k">${T('Stockbusters.ui.deliveryEstimate')}</td><td class="v">${formatDelay(minutes)}</td></tr>`;
        }
        html += `<tr><td class="k">${T('Stockbusters.ui.totalCost')}</td><td class="v"><span class="sb-bigprice">${formatPrice(totals.total)}</span></td></tr>`;
        if (totals.total > this.gold()) {
            html += `<tr><td class="k">&nbsp;</td><td class="v" style="color:var(--xp-red);">${T('Stockbusters.text.insufficientFunds')}</td></tr>`;
        }
        return html;
    };

    // Typing in a quantity box must not rewrite the table under the caret.
    Scene_SearchableShop.prototype.refreshCartTotals = function () {
        const host = document.getElementById('sb-cart-totals');
        if (host) host.innerHTML = this.cartTotalsHTML();
        for (const line of this._basket.resolved()) {
            const cell = document.getElementById(`sb-line-${line.kind}-${line.id}`);
            if (cell) cell.textContent = formatPrice(Pricing.lineTotal(line.entry, line.qty, this._isLimited));
        }
        this.renderTabs();
    };

    // ---- orders page -------------------------------------------------------

    Scene_SearchableShop.prototype.ordersHTML = function () {
        const dispatches = DeliveryManager.dispatches();
        const ready = DeliveryManager.readyCount();

        let html = `<div class="sb-h1">${T('Stockbusters.text.myOrders')}</div>`;
        if (!dispatches.length) {
            html += `<div class="sb-note">${T('Stockbusters.text.noActiveDeliveriesInTransit')}</div>`;
            return html;
        }

        if (ready > 1) {
            html += `<div style="margin-bottom:6px;"><button class="sb-btn gold" data-act="collectall" data-nav>` +
                `${T('Stockbusters.text.collectAll', { count: ready })}</button></div>`;
        }

        for (const dispatch of dispatches) {
            const left = Math.max(0, dispatch.arriveAt - currentGameMinutes());
            const arrived = left <= 0;
            html += `<div class="sb-panel"><div class="sb-panel-hd">` +
                `${arrived ? T('Stockbusters.text.readyForPickup') : T('Stockbusters.text.arrivesIn', { time: formatDelay(left) })}` +
                `</div><div class="sb-panel-bd">`;
            html += `<table class="sb-list">`;
            for (const order of dispatch.orders) {
                const entry = DeliveryManager.dataOf(order);
                if (!entry) continue;
                html += `<tr><td style="width:26px;">${iconHTML(entry.iconIndex, 22)}</td>` +
                    `<td>${escapeHtml(itemNameOf(entry))}</td>` +
                    `<td style="width:70px;">x${order.qty || 1}</td>` +
                    `<td style="width:100px;" class="sb-price">${formatPrice(order.price || 0)}</td></tr>`;
            }
            html += `</table>`;
            if (arrived) {
                html += `<div style="margin-top:5px;"><button class="sb-btn gold" data-act="collect:${dispatch.lot}" data-nav>` +
                    `${T('Stockbusters.text.collect')}</button></div>`;
            }
            html += `</div></div>`;
        }
        return html;
    };

    // ---- confirmation ------------------------------------------------------

    Scene_SearchableShop.prototype.renderModal = function () {
        const host = document.getElementById('sb-modal');
        if (!host) return;

        if (!this._confirm) {
            if (host.innerHTML) host.innerHTML = '';
            return;
        }

        const totals = Pricing.basket(this._confirm.lines, this._isLimited);
        const afford = totals.total <= this.gold();
        const minutes = DeliveryManager.calculateDeliveryTime(totals.total, totals.units);

        const rows = this._confirm.lines.map(line =>
            `<tr><td class="k">${escapeHtml(itemNameOf(line.entry))} x${line.qty}</td>` +
            `<td class="v">${formatPrice(Pricing.lineTotal(line.entry, line.qty, this._isLimited))}</td></tr>`).join('');

        host.innerHTML = `
            <div class="sb-modal">
                <div class="sb-modal-box">
                    <div class="sb-modal-hd">${T('Stockbusters.text.confirmTransaction')}</div>
                    <div class="sb-modal-bd">
                        <table class="sb-kv">${rows}
                            <tr><td class="k">${T('Stockbusters.text.youSave')}</td><td class="v sb-bulk">${formatPrice(totals.saved)}</td></tr>
                            ${this._isLimited ? '' : `<tr><td class="k">${T('Stockbusters.ui.deliveryEstimate')}</td><td class="v">${formatDelay(minutes)}</td></tr>`}
                            <tr><td class="k">${T('Stockbusters.ui.totalCost')}</td><td class="v"><span class="sb-bigprice">${formatPrice(totals.total)}</span></td></tr>
                        </table>
                        ${afford ? '' : `<div style="color:var(--xp-red);margin-top:6px;">${T('Stockbusters.text.insufficientFunds')}</div>`}
                    </div>
                    <div class="sb-modal-ft">
                        ${afford ? `<button class="sb-btn blue" data-act="confirm" data-nav>${T('Stockbusters.text.authorize')}</button>` : ''}
                        <button class="sb-btn" data-act="dismiss" data-nav>${T('Stockbusters.text.cancel2')}</button>
                    </div>
                </div>
            </div>`;
    };

    // ---- 3D and animation viewports ---------------------------------------

    // The thing a preview should draw for a lot, or null when it is not
    // something held at all. A shield has a model of its own, built through the
    // weapon pipeline (WeaponSystemProcedural.shieldWeaponFor).
    Scene_SearchableShop.prototype.previewModelFor = function (entry) {
        if (!entry || !window.Weapon3DPreview) return null;
        if (DataManager.isWeapon(entry)) return entry;
        if (entry.etypeId === 2 && window.WeaponSystemProcedural) {
            return window.WeaponSystemProcedural.shieldWeaponFor(entry);
        }
        return null;
    };

    Scene_SearchableShop.prototype.mountMedia = function (entry) {
        const canvas = document.getElementById('sb-canvas');
        if (!canvas) return;

        const model = this.previewModelFor(entry);
        if (model) {
            const preview = window.Weapon3DPreview.mount(canvas, model);
            if (preview) this._weaponPreviews.push(preview);
            return;
        }
        if (isSkillEntry(entry)) {
            this._spellMounted = SpellPreview.mount(canvas, entry);
        }
    };

    Scene_SearchableShop.prototype.disposeMedia = function () {
        if (this._weaponPreviews.length) {
            window.Weapon3DPreview.disposeAll(this._weaponPreviews);
            this._weaponPreviews = [];
        }
        if (this._spellMounted) {
            SpellPreview.dispose();
            this._spellMounted = false;
        }
    };

    //=========================================================================
    // Keyboard and pad
    //=========================================================================
    // Every clickable on the page carries data-nav, so the pad walks exactly
    // what the mouse can reach and nothing has to be re-rendered to move the
    // selection.

    Scene_SearchableShop.prototype.navNodes = function () {
        if (!this._root) return [];
        const modal = this._root.querySelector('.sb-modal');
        const scope = modal || this._root;
        return Array.from(scope.querySelectorAll('[data-nav]'));
    };

    Scene_SearchableShop.prototype.applySelection = function () {
        const nodes = this.navNodes();
        if (!nodes.length) return;
        this._nav = Math.max(0, Math.min(this._nav, nodes.length - 1));
        nodes.forEach((node, index) => node.classList.toggle('sel', index === this._nav));

        const current = nodes[this._nav];
        if (!current) return;
        const scroller = current.closest('.sb-main, .sb-side');
        if (!scroller) return;
        const box = current.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        if (box.top < view.top) scroller.scrollTop -= (view.top - box.top);
        else if (box.bottom > view.bottom) scroller.scrollTop += (box.bottom - view.bottom);
    };

    Scene_SearchableShop.prototype.moveNav = function (delta) {
        const nodes = this.navNodes();
        if (!nodes.length) return;
        this._nav = (this._nav + delta + nodes.length) % nodes.length;
        SoundManager.playCursor();
        this.applySelection();
    };

    Scene_SearchableShop.prototype.activateNav = function () {
        const nodes = this.navNodes();
        const current = nodes[this._nav];
        if (!current) return;
        this.act(current.dataset.act, current);
    };

    // True while the player is typing: the keys are theirs, not the site's.
    Scene_SearchableShop.prototype.isTyping = function () {
        const active = document.activeElement;
        return !!(active && this._root && this._root.contains(active) && active.matches('input'));
    };

    // Input.isRepeated already covers the first press, and 'ok' already covers
    // Enter, Space, Z and the pad's confirm, so nothing here reads raw key
    // codes off Input._currentState (which never holds them anyway).
    Scene_SearchableShop.prototype.update = function () {
        if (!this._isAppMode) Scene_MenuBase.prototype.update.call(this);
        if (!this._root || this.isTyping()) return;

        if (Input.isRepeated('down') || Input.isRepeated('right')) {
            this.moveNav(1);
        } else if (Input.isRepeated('up') || Input.isRepeated('left')) {
            this.moveNav(-1);
        } else if (Input.isTriggered('ok')) {
            this.activateNav();
        } else if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
            this.goBack();
        }
    };

    //=========================================================================
    // HypernetOS app
    //=========================================================================

    window.HypercapitalisEmporiumApp = {
        appInstance: null,
        win: null,

        launch: function (params) {
            if (!window.HypernetWindowManager) return;

            if (!this.win || !document.getElementById('app-store')) {
                this.win = window.HypernetWindowManager.createWindow({
                    id: 'app-store',
                    title: T('Stockbusters.ui.windowTitle'),
                    icon: APP_ICON,
                    width: 940,
                    height: 660,
                    contentHTML: '<div id="emporium-content" style="width:100%;height:100%;position:relative;overflow:hidden;background:var(--xp-white);"></div>'
                });

                // The site runs its own listing / basket navigation, so the OS
                // focus ring yields directional / OK / cancel input to it.
                this.win.dataset.selfNav = '1';

                this.appInstance = new Scene_SearchableShop();
                this.appInstance._isAppMode = true;
                this.appInstance.prepare(params);
                this.appInstance.create();

                this.win.addEventListener('hypernet-closed', () => {
                    if (this.appInstance) {
                        this.appInstance.terminate();
                        this.appInstance = null;
                    }
                    this.win = null;
                });
            } else {
                window.HypernetWindowManager.bringToFront(this.win);
            }
        },

        update: function () {
            if (!this.appInstance || !this.win) return;
            if (this.win.classList.contains('active')) this.appInstance.update();
        }
    };

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'app-hypernet-shop',
            name: T('Stockbusters.ui.appName'),
            icon: APP_ICON,
            launchFn: function (params) {
                window.HypercapitalisEmporiumApp.launch(params);
            },
            desktopShortcut: true
        });
    }

    //=========================================================================
    // Plugin commands
    //=========================================================================

    function registerShopCommand(commandName, handler) {
        for (const key of COMMAND_KEYS) {
            PluginManager.registerCommand(key, commandName, handler);
        }
    }

    registerShopCommand("OpenSearchableShop", () => {
        SceneManager.push(Scene_HypernetOS);
        SceneManager.prepareNextScene({ autoLaunch: 'shop' });
    });

    registerShopCommand("OpenLimitedShop", () => {
        const mapId = $gameMap.mapId();
        const eventId = $gameMap._interpreter.eventId();
        const event = $gameMap.event(eventId);
        const coordinates = event ? [event.x, event.y] : [0, 0];

        let historySeed = 19002001;
        if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
            historySeed = window.HistoryManager.getSeed();
        } else if ($gameSystem && $gameSystem._historySeed !== undefined) {
            historySeed = $gameSystem._historySeed;
        }

        SceneManager.push(Scene_HypernetOS);
        SceneManager.prepareNextScene({
            autoLaunch: 'app-hypernet-shop',
            shopParams: {
                isLimited: true,
                seedString: `${mapId}-${coordinates[0]}-${coordinates[1]}-${historySeed}`,
                maxSkills: 6
            }
        });
    });

    // The local bazaar's shelf is derived from its coordinates, so anything
    // that needs to know what stands on it (the stealing system, for one) can
    // ask for the same selection the scene would build.
    window.SearchableItemShop = window.SearchableItemShop || {};
    window.SearchableItemShop.limitedSelection =
        (seedString, maxSkills) => Catalogue.limitedSelection(seedString, maxSkills || 6);
    window.SearchableItemShop.limitedSeedString = (mapId, x, y) => {
        let historySeed = 19002001;
        if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
            historySeed = window.HistoryManager.getSeed();
        } else if ($gameSystem && $gameSystem._historySeed !== undefined) {
            historySeed = $gameSystem._historySeed;
        }
        return `${mapId}-${x}-${y}-${historySeed}`;
    };

    registerShopCommand("RetireDeliveredItems", () => {
        const delivered = DeliveryManager.retireDeliveredItems();

        if (delivered.length > 0) {
            $gameMessage.add(T('Stockbusters.text.delivered', { count: delivered.length }));
            $gameMessage.add(delivered.join(', '));
            SoundManager.playShop();
        } else {
            const pending = DeliveryManager.getOrderCount();
            if (pending > 0) {
                const soonest = Math.min(...DeliveryManager.getOrderedItems()
                    .map(order => DeliveryManager.getMinutesLeft(order)));
                $gameMessage.add(T('Stockbusters.text.nextDeliveryIn', { time: formatDelay(soonest) }));
            } else {
                $gameMessage.add(T('Stockbusters.text.noItemsReadyForDelivery'));
            }
        }
    });

    // The pricing ladder, the shelves and the daily rarities are all asked for
    // from outside (the node harness in test/test_stockbusters.js, and anything
    // that wants to quote a price without opening the site).
    window.Stockbusters = {
        Pricing: Pricing,
        Stock: Stock,
        Catalogue: Catalogue,
        DailyLots: DailyLots,
        Delivery: DeliveryManager,
        Basket: Basket,
        Listing: Listing,
        BULK_TIERS: BULK_TIERS,
        Scene: Scene_SearchableShop
    };
})();
