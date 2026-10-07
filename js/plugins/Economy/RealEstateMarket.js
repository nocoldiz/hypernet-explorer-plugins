/*:
 * @target MZ
 * @plugindesc Real Estate Management System v1.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * Real Estate Management Plugin for RPG Maker MZ
 * ============================================================================
 * 
 * This plugin adds a comprehensive real estate system to your game where
 * players can buy, sell, and rent out properties across the towns of
 * js/db/WorkSystem/Destinations.json.
 * js/plugins/Economy/RealEstateMarket.js
 * IMPORTANT: This plugin requires NewsSystem.js to be installed and loaded
 * BEFORE this plugin in the plugin manager.
 *
 * Features:
 * - 30 randomized properties across every Destinations.json town
 * - Star rating system (1-5 stars); 1-3 star properties are cheap dumps
 *   (1-star costs under 1000 euros), 4-5 star are premium estates
 * - Buy outright (owner, can offer for NPC rent-out income) or rent as a
 *   tenant (recurring monthly cost, cannot sublet; missed payments evict
 *   the player and relist the property)
 * - Real-time rent collection at midnight, monthly tenant rent on the 1st
 * - Market fluctuations based on procedural news events tied to towns
 * - Different property types with varying capacities
 * - Currency conversion: 100 gold = 1 euro
 * 
 * Plugin Commands:
 * - Open Real Estate Menu
 * - Check Daily Income
 * - Force Market Update (for testing)
 * 
 * @param menuCommand
 * @text Menu Command Name
 * @desc Name of the real estate command in the menu
 * @default Real Estate
 * 
 * @command openRealEstateMenu
 * @text Open Real Estate Menu
 * @desc Opens the real estate management interface
 * 
 * @command checkDailyIncome
 * @text Check Daily Income
 * @desc Shows today's rental income summary
 * 
 * @command forceMarketUpdate
 * @text Force Market Update
 * @desc Forces a market update (for testing)
 *
 * @command registerDestination
 * @text Register Destination (Place)
 * @desc Marks a Destinations.json location as owned by the player (shown in Assets).
 *
 * @arg key
 * @text Destination Key
 * @desc Exact key from js/db/WorkSystem/Destinations.json (e.g. "Ghent").
 * @type string
 *
 * @arg value
 * @text Book Value (€)
 * @desc Optional euro value shown in the Assets pockets. Default 0.
 * @type number
 * @default 0
 *
 * @command registerCompany
 * @text Register Company
 * @desc Creates a new tradable company on the exchange (persisted in the save).
 *
 * @arg key
 * @text Company Key
 * @desc Unique key/id for the company (also its fallback display name).
 * @type string
 *
 * @arg name
 * @text Display Name
 * @desc Company name shown on the exchange. Defaults to the key.
 * @type string
 *
 * @arg sector
 * @text Sector
 * @desc Sector label (e.g. "Energy"). Default "Misc".
 * @type string
 * @default Misc
 *
 * @arg sharePrice
 * @text Share Price (€)
 * @desc Listing price per share in euros. Default 50.
 * @type number
 * @default 50
 *
 * @arg totalShares
 * @text Total Shares
 * @desc Number of shares outstanding. Default 100000.
 * @type number
 * @default 100000
 *
 * @arg color
 * @text Accent Color
 * @desc Hex accent color (e.g. "#e0b000"). Optional.
 * @type string
 */

(() => {
    'use strict';

    const pluginName = 'RealEstateMarket';

    // --- Helper Function to Parse Game Date from Variable 113 ---
    function getGameDateFromVariable() {
        const dateStr = (typeof $gameVariables !== 'undefined' && $gameVariables ? $gameVariables.value(113) : null) || '01 JAN 2001 12:00';
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

    // --- Helper Function to Get Current Game Date as JavaScript Date ---
    function getGameDateAsJSDate() {
        const gameDate = getGameDateFromVariable();
        return new Date(gameDate.year, gameDate.month, gameDate.day, gameDate.hours, gameDate.minutes, 0);
    }

    // Import utilities from News System
    const t = window.NewsSystemUtils.t;
    const getLocations = window.NewsSystemUtils.getLocations;

    // Property types with their characteristics.
    // basePrice indices are 1-5 stars. Stars 1-3 are deliberately steep and
    // cheap (a 1-star of any type is a near-derelict dump - base capped well
    // under 1000€ even after the ±20% roll in createRandomProperty), while
    // 4-5 star bases are unchanged from the original premium tiers.
    // i18n-ignore-start  property type ids, stored on every property record
    // and resolved for display through t('propertyTypes')[type]
    const PROPERTY_TYPES = {
        'Simple House': { minCap: 1, maxCap: 4, basePrice: [550, 2200, 7000, 60000, 85000] },
        'Apartment': { minCap: 1, maxCap: 6, basePrice: [600, 2600, 9000, 80000, 110000] },
        'Villa': { minCap: 2, maxCap: 8, basePrice: [700, 3800, 15000, 180000, 250000] },
        'Hotel': { minCap: 10, maxCap: 150, basePrice: [800, 8000, 40000, 1200000, 2000000] },
        'Hostel': { minCap: 8, maxCap: 80, basePrice: [750, 5000, 25000, 400000, 600000] },
        'Castle': { minCap: 5, maxCap: 30, basePrice: [800, 9000, 50000, 1800000, 3000000] },
        'Yacht': { minCap: 2, maxCap: 12, basePrice: [780, 7000, 35000, 800000, 1500000] },
        'Restaurant': { minCap: 0, maxCap: 60, basePrice: [760, 6000, 30000, 550000, 850000] },
        'Camper Van': { minCap: 1, maxCap: 4, basePrice: [650, 3000, 10000, 85000, 120000] },
        'B&B': { minCap: 2, maxCap: 16, basePrice: [700, 4500, 20000, 320000, 500000] },
        // A shop is a going concern, not lodgings: its occupants are the staff
        // behind the counter. Buying the deed hands the party the shop itself,
        // which ShopManagement.js then runs (see buyProperty).
        'Shop': { minCap: 0, maxCap: 6, basePrice: [720, 5500, 28000, 450000, 700000] }
    };
    // i18n-ignore-end

    // Renting (as tenant, not owner) costs this fraction of the property's
    // base price per in-game month. Charged from processMonthlyRent().
    const RENT_MONTHLY_RATE = 0.03;

    // A bought ProceduralHouseSystem floor let to tenants: each tenant pays
    // this fraction of the floor's value a day, the floor holds at most
    // PROC_HOUSE_MAX_TENANTS, and it fills slowly, one tenant at a time with
    // PROC_HOUSE_TENANT_CHANCE a day.
    const PROC_HOUSE_RENT_RATE = 0.0025;
    const PROC_HOUSE_MAX_TENANTS = 4;
    const PROC_HOUSE_TENANT_CHANCE = 0.5;

    // Euros a day one tenant pays for a floor worth `valueGold`.
    function procHouseRentPerTenant(valueGold) {
        const euros = (Number(valueGold) || 0) / 100;
        return Math.max(0.01, Math.round(euros * PROC_HOUSE_RENT_RATE * 100) / 100);
    }
    // Read by the Assets pockets, which list let floors with their rent.
    window.RealEstateLetting = { rentPerTenant: procHouseRentPerTenant, MAX_TENANTS: PROC_HOUSE_MAX_TENANTS };

    // Real Estate Manager Class
    class RealEstateManager {
        constructor() {
            this.properties = [];
            this.ownedProperties = [];
            this.rentedProperties = []; // ids the player rents as a tenant (not owned)
            this.lastUpdateTime = null;
            this.dailyIncome = 0;
            this.totalIncome = 0;

            // --- Company share market ---
            this.companyShares = {};     // { companyKey: sharesOwned }
            this.companyPrices = {};     // { companyKey: currentPricePerShare (euros) }
            this.companyCostBasis = {};  // { companyKey: totalGoldInvested }
            this.customCompanies = {};   // runtime-registered companies (key -> def)

            // --- Owned Places (Destinations.json entries) ---
            this.ownedDestinations = []; // [{ key, value(gold) }]
        }

        initialize() {
            this.generateProperties();
            this.lastUpdateTime = getGameDateAsJSDate();
            this.startDailyUpdates();

            // Register with News System for market effects
            this.registerWithNewsSystem();
        }

        registerWithNewsSystem() {
            if (window.$newsManager) {
                window.$newsManager.registerListener((news, duration) => {
                    this.handleNewsEvent(news, duration);
                });
            }
        }

        handleNewsEvent(news, duration) {
            // Apply immediate occupancy effects to affected properties
            this.properties.forEach(property => {
                if (property.location === news.location) {
                    if (news.occupancyEffect < 1) {
                        // Negative effect - people leave
                        const reduction = Math.floor(property.currentOccupants * (1 - news.occupancyEffect));
                        property.currentOccupants = Math.max(0, property.currentOccupants - reduction);
                    } else if (news.occupancyEffect > 1 && property.isForRent) {
                        // Positive effect - people arrive
                        const increase = Math.floor(property.maxOccupants * (news.occupancyEffect - 1) * 0.3);
                        property.currentOccupants = Math.min(property.maxOccupants, property.currentOccupants + increase);
                    }

                    // Update market trend
                    property.marketTrend = Math.max(-1, Math.min(1, property.marketTrend + (news.priceEffect - 1)));
                }
            });
        }

        // The register of properties is the WORLD'S, not this savegame's. It
        // used to be rolled on Math.random(), so the thirty houses on the board
        // were thirty different houses in every savegame while their ids stayed
        // the bare loop index 0..29: "property 3" named one building here and
        // another one next door. Rolled from the world seed instead, every
        // playthrough of a world walks into the same market, which is what lets
        // a house bought in one savegame be recognisably the same house that is
        // no longer for sale in the next (see markTaken).
        //
        // Only the catalogue is seeded. What the market DOES afterwards
        // (occupancy drifting, trends moving with the news) stays live and
        // per-savegame, as does who owns what.
        marketRng() {
            let seed = 19002001;
            try {
                if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
                    const s = window.HistoryManager.getSeed();
                    if (s !== null && s !== undefined && s !== '') {
                        seed = (typeof s === 'number') ? s : String(s).split('').reduce(
                            (h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
                    }
                }
            } catch (e) { /* no world yet: the constant is the fallback */ }
            let t = (seed ^ 0x9e3779b9) >>> 0;
            return function () {
                t = (t + 0x6d2b79f5) >>> 0;
                let x = Math.imul(t ^ (t >>> 15), 1 | t);
                x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
                return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
            };
        }

        generateProperties() {
            const usedCombinations = new Set();
            const rng = this.marketRng();

            for (let i = 0; i < 30; i++) {
                let property;
                // Bounded: a seeded stream that cannot find an unused pairing
                // must not spin here for ever.
                let tries = 0;
                do {
                    property = this.createRandomProperty(i, rng);
                } while (usedCombinations.has(`${property.type}-${property.location}`) && ++tries < 200);

                usedCombinations.add(`${property.type}-${property.location}`);
                this.properties.push(property);
            }
            // Marks the catalogue as one the world agrees on, so a savegame
            // carrying an older privately rolled board is rebuilt on load.
            this.marketSeeded = true;
        }

        createRandomProperty(id, rng) {
            const roll = rng || Math.random;
            const types = Object.keys(PROPERTY_TYPES);
            const type = types[Math.floor(roll() * types.length)];
            const locations = getLocations();
            const location = locations[Math.floor(roll() * locations.length)];
            const stars = Math.floor(roll() * 5) + 1;
            const typeData = PROPERTY_TYPES[type];
            const basePrice = typeData.basePrice[stars - 1];
            const priceVariation = 0.8 + roll() * 0.4; // ±20% variation
            // Property is worth what somebody will pay for it, and in an empty
            // world nobody will. Zeroed at the source: the sale price, the
            // effective price and the rent are all derived from these two, so
            // the whole board reads as free without touching a call site.
            const WM = window.WorldManager;
            const worthless = !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());

            return {
                id: id,
                name: this.generatePropertyName(type, location, stars, roll),
                type: type,
                location: location,
                stars: stars,
                price: worthless ? 0 : Math.floor(basePrice * priceVariation),
                maxOccupants: typeData.maxCap,
                currentOccupants: 0,
                // ~0.1% daily, kept to the cent: floored to whole euros it came
                // out as 0 on every 1-star dump, which could then never be let.
                rentPerOccupant: worthless ? 0 : Math.max(0.01, Math.round((basePrice * priceVariation * 0.001) / 30 * 100) / 100),
                isOwned: false,
                isRentedByPlayer: false, // player is a tenant here (not owner)
                isForSale: true,
                isForRent: true,
                marketTrend: 0 // -1 to 1, affects occupancy changes
            };
        }

        generatePropertyName(type, location, stars, rng) {
            const roll = rng || Math.random;
            const starNames = t('starLevels');
            const prefix = starNames[stars - 1];

            const suffixes = t('propertySuffixes');
            const suffix = suffixes[type][Math.floor(roll() * suffixes[type].length)];
            return `${prefix} ${suffix}`;
        }

        // Replaces a privately rolled board with the world's own, carrying the
        // party's holdings across by id and re-declaring them to the world
        // register, so a legacy purchase also takes its house off the market.
        rebuildSeededMarket() {
            const held = new Set(this.ownedProperties);
            const rented = new Set(this.rentedProperties);
            this.properties = [];
            this.generateProperties();
            for (const property of this.properties) {
                if (held.has(property.id)) {
                    property.isOwned = true;
                    property.isForSale = false;
                    property.isForRent = true;
                    this.markTaken(property.id, 'bought');
                } else if (rented.has(property.id)) {
                    property.isRentedByPlayer = true;
                    property.isForSale = false;
                    property.isForRent = false;
                    this.markTaken(property.id, 'rented');
                }
            }
        }

        // A property somebody else's playthrough of this world has already
        // taken. The register lives in the world folder (market.json ->
        // realEstateTaken) and says only that the place is off the market, not
        // whose it is: ownership is this savegame's own business, so a party
        // never inherits, sells or collects rent on another party's house.
        isTakenByAnother(propertyId) {
            const taken = $gameSystem && $gameSystem._realEstateTaken;
            if (!taken || !taken[propertyId]) return false;
            return !this.ownedProperties.includes(propertyId) &&
                !this.rentedProperties.includes(propertyId);
        }

        markTaken(propertyId, how) {
            if (!$gameSystem) return;
            const taken = $gameSystem._realEstateTaken || ($gameSystem._realEstateTaken = {});
            taken[propertyId] = {
                how: how, // i18n-ignore: stored record key
                by: ($gameParty && $gameParty.leader() && $gameParty.leader().name()) || null,
                at: ($gameVariables && $gameVariables.value(114)) || 0
            };
            $gameSystem._realEstateTaken = taken;
        }

        releaseTaken(propertyId) {
            const taken = $gameSystem && $gameSystem._realEstateTaken;
            if (!taken || !taken[propertyId]) return;
            delete taken[propertyId];
            $gameSystem._realEstateTaken = taken;
        }

        buyProperty(propertyId) {
            const property = this.properties.find(p => p.id === propertyId);
            if (!property || property.isOwned || property.isRentedByPlayer) return false;
            if (this.isTakenByAnother(propertyId)) return false;

            const effectivePrice = this.calculateEffectivePrice(property);
            const goldCost = effectivePrice * 100; // Convert euros to gold
            if ($gameParty.gold() < goldCost) return false;

            $gameParty.loseGold(goldCost);
            property.isOwned = true;
            property.isForSale = false;
            property.isForRent = true;
            property.currentOccupants = Math.floor(Math.random() * property.maxOccupants * 0.3);
            this.ownedProperties.push(property.id);
            this.markTaken(property.id, 'bought');

            // A shop deed comes with the shop. ShopManagement.js opens a trading
            // register for it, which the Deeds page then manages.
            if (window.ShopManagement && window.ShopManagement.onPropertyBought) {
                window.ShopManagement.onPropertyBought(property);
            }

            // Closing on a property is how the trade is learned, and the bigger
            // the deal the more of it there was to learn (specialization 722).
            if (window.SpecializationXP) {
                window.SpecializationXP.awardForValue('Real Estate Appraisal', goldCost);
            }

            return true;
        }

        // Euros a sale fetches. Somebody who knows the market does not take the
        // first offer, so the haircut narrows as Real Estate Appraisal climbs.
        salePriceOf(property) {
            const valuer = window.SpecializationXP
                ? window.SpecializationXP.multiplier('Real Estate Appraisal', 0.025) : 1;
            const base = property.isNormalHome ? property.price : this.calculateEffectivePrice(property);
            return Math.floor(base * Math.min(1, 0.9 * valuer));
        }

        // A companion's inherited residence or a bought procedural floor goes
        // back to the market: the record is dropped from the system that owns
        // it, so its build rights and cupboards go with it.
        sellNormalHome(home) {
            let released = false;
            if (home.normalHomeType === 'residence') {
                const list = $gameSystem && $gameSystem._npcInheritedHouses;
                const idx = Array.isArray(list)
                    ? list.findIndex(h => h.mapId === home.mapId && (h.npcName || '') === (home.resident || ''))
                    : -1;
                if (idx >= 0) { list.splice(idx, 1); released = true; }
            } else if (home.normalHomeType === 'procedural') {
                const PHS = window.ProceduralHouseSystem;
                released = !!(PHS && typeof PHS.releaseOwnedHouse === 'function' && PHS.releaseOwnedHouse(home.houseKey));
            }
            if (!released) return false;
            const goldGain = this.salePriceOf(home) * 100;
            $gameParty.gainGold(goldGain);
            if (window.SpecializationXP) {
                window.SpecializationXP.awardForValue('Real Estate Appraisal', goldGain);
            }
            return true;
        }

        sellProperty(propertyId) {
            const home = this.getNormalHomes().find(p => p.id === propertyId);
            if (home) return this.sellNormalHome(home);
            const property = this.properties.find(p => p.id === propertyId);
            if (!property || !property.isOwned) return false;

            const salePrice = this.salePriceOf(property);
            const goldGain = salePrice * 100;

            $gameParty.gainGold(goldGain);
            if (window.SpecializationXP) {
                window.SpecializationXP.awardForValue('Real Estate Appraisal', goldGain);
            }
            property.isOwned = false;
            property.isForSale = true;
            property.isForRent = false;
            property.currentOccupants = 0;

            const index = this.ownedProperties.indexOf(property.id);
            if (index > -1) this.ownedProperties.splice(index, 1);
            this.releaseTaken(property.id);

            if (window.ShopManagement && window.ShopManagement.onPropertySold) {
                window.ShopManagement.onPropertySold(property);
            }

            return true;
        }

        toggleRentStatus(propertyId) {
            const property = this.properties.find(p => p.id === propertyId);
            if (!property || !property.isOwned) return false;

            property.isForRent = !property.isForRent;
            if (!property.isForRent) {
                property.currentOccupants = 0;
            }

            return true;
        }

        // =====================================================================
        // Player rentals - the player can move into a property as a tenant
        // instead of buying it outright, paying a recurring monthly cost. A
        // rented property is not owned, so it cannot also be offered for rent
        // to NPCs (that requires the deed via buyProperty/toggleRentStatus).
        // =====================================================================

        getMonthlyRent(property) {
            return Math.max(1, Math.round(property.price * RENT_MONTHLY_RATE));
        }

        rentProperty(propertyId) {
            const property = this.properties.find(p => p.id === propertyId);
            if (!property || property.isOwned || property.isRentedByPlayer) return false;
            if (this.isTakenByAnother(propertyId)) return false;

            const goldCost = this.getMonthlyRent(property) * 100; // first month due on move-in
            if ($gameParty.gold() < goldCost) return false;

            $gameParty.loseGold(goldCost);
            property.isRentedByPlayer = true;
            property.isForSale = false;
            property.isForRent = false;
            property.currentOccupants = Math.floor(Math.random() * property.maxOccupants * 0.3);
            this.rentedProperties.push(property.id);
            this.markTaken(property.id, 'rented');

            return true;
        }

        // Voluntarily ends the tenancy and relists the property on the market.
        vacateProperty(propertyId) {
            const property = this.properties.find(p => p.id === propertyId);
            if (!property || !property.isRentedByPlayer) return false;

            property.isRentedByPlayer = false;
            property.isForSale = true;
            property.isForRent = true;
            property.currentOccupants = 0;

            const index = this.rentedProperties.indexOf(property.id);
            if (index > -1) this.rentedProperties.splice(index, 1);
            this.releaseTaken(property.id);

            return true;
        }

        // Repossession when a monthly payment is missed: no refund, no choice,
        // the property returns to the open market immediately.
        evictFromRental(propertyId) {
            const property = this.properties.find(p => p.id === propertyId);
            const index = this.rentedProperties.indexOf(propertyId);
            if (index > -1) this.rentedProperties.splice(index, 1);
            this.releaseTaken(propertyId);
            if (!property) return null;

            property.isRentedByPlayer = false;
            property.isForSale = true;
            property.isForRent = true;
            property.currentOccupants = 0;
            return property;
        }

        // Charges every rented property's monthly cost; evicts (and relists)
        // any the player can no longer afford. Called once per in-game month
        // change from the Scene_Map update hook below.
        processMonthlyRent() {
            if (!this.rentedProperties.length) return;

            [...this.rentedProperties].forEach(propertyId => {
                const property = this.properties.find(p => p.id === propertyId);
                if (!property) return;

                const goldCost = this.getMonthlyRent(property) * 100;
                if ($gameParty.gold() >= goldCost) {
                    $gameParty.loseGold(goldCost);
                } else {
                    const name = property.name;
                    this.evictFromRental(propertyId);
                    if (window.ParchmentToast) {
                        window.ParchmentToast.show(
                            T('RealEstate.ui.evicted', { name: name }),
                            { severity: 'danger', duration: 240 }
                        );
                    }
                }
            });

            this.save();
        }

        // =====================================================================
        // Letting a bought procedural house floor to NPC tenants
        // =====================================================================

        procHouseRentPerTenant(valueGold) {
            return procHouseRentPerTenant(valueGold);
        }

        // Puts the floor up for tenants. Party members living there move out
        // to the halls first, since the floor stops being theirs. Answers the
        // names that moved, or null when the floor could not be let.
        letProceduralHouse(houseKey) {
            const PHS = window.ProceduralHouseSystem;
            if (!PHS || typeof PHS.setHouseLet !== 'function' || PHS.isHouseLet(houseKey)) return null;
            const moved = [];
            const PL = window.PartyLodging;
            if (PL && typeof PL.residents === 'function') {
                const placeId = 'house:' + houseKey; // i18n-ignore: place id
                PL.residents().forEach(person => {
                    if (person.lodging === placeId && PL.assign(person.name, PL.DEFAULT)) moved.push(person.name);
                });
            }
            if (!PHS.setHouseLet(houseKey, true)) return null;
            this.save();
            return moved;
        }

        // The tenants leave and the floor is the party's again.
        stopLettingProceduralHouse(houseKey) {
            const PHS = window.ProceduralHouseSystem;
            if (!PHS || typeof PHS.setHouseLet !== 'function' || !PHS.isHouseLet(houseKey)) return false;
            PHS.setHouseLet(houseKey, false);
            this.save();
            return true;
        }

        // Every let floor, each with its tenants and their daily rent.
        letProceduralHouses() {
            const PHS = window.ProceduralHouseSystem;
            const houses = (PHS && typeof PHS.listOwnedHouses === 'function') ? (PHS.listOwnedHouses() || []) : [];
            return houses.filter(h => h && h.letting);
        }

        // Once a day: a let floor may take one more tenant, then every tenant
        // pays. Answers the euros collected.
        processProceduralHouseLetting() {
            const PHS = window.ProceduralHouseSystem;
            let income = 0;
            this.letProceduralHouses().forEach(h => {
                if (Math.random() < PROC_HOUSE_TENANT_CHANCE) PHS.addHouseTenant(h.key, PROC_HOUSE_MAX_TENANTS);
                const letting = PHS.houseLetting(h.key);
                income += (letting ? letting.tenants : 0) * this.procHouseRentPerTenant(h.value);
            });
            return income;
        }

        getActiveEffectsForLocation(location) {
            if (window.$newsManager) {
                return window.$newsManager.getActiveEffectsForLocation(location);
            }
            return [];
        }

        calculateEffectivePrice(property) {
            const effects = this.getActiveEffectsForLocation(property.location);
            let priceMultiplier = 1;

            effects.forEach(effect => {
                priceMultiplier *= effect.priceEffect;
            });

            // Clamp the combined multiplier so stacked news events cannot swing
            // prices arbitrarily (e.g. never below 25% or above 400% of base).
            priceMultiplier = Math.max(0.25, Math.min(4, priceMultiplier));

            return Math.floor(property.price * priceMultiplier);
        }

        startDailyUpdates() {
            // Daily updates are driven by the Scene_Map.update hook below, which
            // detects in-game day changes (Variable 113 date string) and calls
            // processDailyUpdate() once per new day. Nothing to schedule here.
        }

        processDailyUpdate() {
            this.dailyIncome = 0;

            // Update market trends
            this.properties.forEach(property => {
                property.marketTrend = (Math.random() - 0.5) * 2; // -1 to 1
            });

            // Process owned properties
            this.ownedProperties.forEach(propertyId => {
                const property = this.properties.find(p => p.id === propertyId);
                if (!property || !property.isForRent) return;

                // Update occupancy based on market and property characteristics
                this.updateOccupancy(property);

                // Collect rent
                const dailyRent = property.currentOccupants * property.rentPerOccupant;
                this.dailyIncome += dailyRent;
                this.totalIncome += dailyRent;
            });

            // Bought procedural house floors let to tenants
            const letIncome = this.processProceduralHouseLetting();
            this.dailyIncome += letIncome;
            this.totalIncome += letIncome;

            // Convert euros to gold and add to party
            // Rent is kept to the cent, so the sum is squared to whole cents here.
            this.dailyIncome = Math.round(this.dailyIncome * 100) / 100;
            const goldIncome = Math.round(this.dailyIncome * 100);
            $gameParty.gainGold(goldIncome);

            // Rent that arrives while the party is out walking is announced on
            // the parchment, the same way a shop's day is (ShopManagement.js):
            // money that appears with no line to explain it reads as a bug.
            if (this.dailyIncome > 0 && window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(
                    t('dailyIncomeMsg', { income: this.dailyIncome, gold: goldIncome }),
                    { title: t('dailyIncome') }
                );
            }

            // Company share prices are the stock terminal's to move (its hourly
            // engine, driven by the society): this register only keeps the
            // quote it is handed, so there is one price and one engine.

            // Save the update
            this.save();
        }

        updateOccupancy(property) {
            const occupancyRate = property.currentOccupants / property.maxOccupants;
            let changeChance = 0.1; // Base 10% chance of change

            // Higher occupancy = higher turnover
            changeChance += occupancyRate * 0.3;

            // Property size affects stability (smaller = more stable)
            const sizeModifier = property.maxOccupants / 150;
            changeChance *= (0.5 + sizeModifier * 0.5);

            // Star rating affects attractiveness
            const starModifier = property.stars / 5;

            if (Math.random() < changeChance) {
                // Determine if occupants move in or out
                const marketInfluence = property.marketTrend * 0.3;
                const attractiveness = starModifier * 0.5 + marketInfluence;

                if (Math.random() < 0.5 + attractiveness) {
                    // Occupants move in
                    const maxIncrease = Math.ceil(property.maxOccupants * 0.2);
                    const increase = Math.floor(Math.random() * maxIncrease) + 1;
                    property.currentOccupants = Math.min(
                        property.currentOccupants + increase,
                        property.maxOccupants
                    );
                } else {
                    // Occupants move out
                    const maxDecrease = Math.ceil(property.currentOccupants * 0.3);
                    const decrease = Math.floor(Math.random() * maxDecrease) + 1;
                    property.currentOccupants = Math.max(
                        property.currentOccupants - decrease,
                        0
                    );
                }
            }
        }

        calculateDailyIncome() {
            let income = 0;
            this.ownedProperties.forEach(propertyId => {
                const property = this.properties.find(p => p.id === propertyId);
                if (property && property.isForRent) {
                    income += property.currentOccupants * property.rentPerOccupant;
                }
            });
            this.letProceduralHouses().forEach(h => {
                income += h.letting.tenants * this.procHouseRentPerTenant(h.value);
            });
            return income;
        }

        // Returns normal homes held by the party (companion residences inherited
        // on party join and procedural houses whose floors were purchased).
        getNormalHomes() {
            const normalHomes = [];
            // 1. Companion residences (inherited from party members)
            if (typeof $gameSystem !== 'undefined' && $gameSystem && Array.isArray($gameSystem._npcInheritedHouses)) {
                $gameSystem._npcInheritedHouses.forEach((hh, idx) => {
                    const priceEuros = Math.round((hh.value || 30000) / 100);
                    const homeName = (typeof T === 'function' && T.has && T.has('Assets.ui.npcHome'))
                        ? T('Assets.ui.npcHome', { name: hh.npcName || '' })
                        : `${hh.npcName || ''}'s home`;
                    const loc = hh.mapName || ((typeof T === 'function' && T.has && T.has('Assets.ui.residence')) ? T('Assets.ui.residence') : 'Residence');
                    normalHomes.push({
                        id: `npc_home_${hh.mapId != null ? hh.mapId : idx}_${hh.npcName || 'npc'}`,
                        name: homeName,
                        type: 'Simple House',
                        location: loc,
                        stars: 1,
                        price: priceEuros,
                        maxOccupants: 4,
                        currentOccupants: 1,
                        rentPerOccupant: 0,
                        isOwned: true,
                        isRentedByPlayer: false,
                        isForSale: false,
                        isForRent: false,
                        marketTrend: 0,
                        isNormalHome: true,
                        normalHomeType: 'residence',
                        resident: hh.npcName || '',
                        mapId: hh.mapId
                    });
                });
            }

            // 2. Procedural houses (floors bought by player)
            if (window.ProceduralHouseSystem && typeof window.ProceduralHouseSystem.listOwnedHouses === 'function') {
                const procHouses = window.ProceduralHouseSystem.listOwnedHouses() || [];
                procHouses.forEach(h => {
                    const floorTxt = h.floor > 0 ? ` • ${(typeof T === 'function' && T.has && T.has('Assets.ui.floor')) ? T('Assets.ui.floor') : 'Floor'} ${h.floor}` : '';
                    const priceEuros = Math.round((h.value || 30000) / 100);
                    const loc = h.mapName || ((typeof T === 'function' && T.has && T.has('ProceduralHouse.unknownLocation')) ? T('ProceduralHouse.unknownLocation') : 'Unknown Location');
                    normalHomes.push({
                        id: `proc_house_${h.key}`,
                        name: `${loc}${floorTxt}`,
                        type: 'Simple House',
                        location: loc,
                        stars: 1,
                        price: priceEuros,
                        maxOccupants: PROC_HOUSE_MAX_TENANTS,
                        currentOccupants: h.letting ? h.letting.tenants : 0,
                        rentPerOccupant: this.procHouseRentPerTenant(h.value),
                        isOwned: true,
                        isRentedByPlayer: false,
                        isForSale: false,
                        isForRent: !!h.letting,
                        marketTrend: 0,
                        isNormalHome: true,
                        normalHomeType: 'procedural',
                        houseKey: h.key,
                        entranceCoords: `X:${h.x} Y:${h.y}`,
                        floor: h.floor,
                        mapId: h.mapId
                    });
                });
            }

            return normalHomes;
        }

        getAllProperties() {
            const normal = this.getNormalHomes();
            return normal.length ? [...normal, ...this.properties] : [...this.properties];
        }

        getOwnedCount() {
            return this.ownedProperties.length + this.getNormalHomes().length;
        }

        findProperty(propertyId) {
            const normal = this.getNormalHomes().find(p => p.id === propertyId);
            if (normal) return normal;
            return this.properties.find(p => p.id === propertyId) || null;
        }

        save() {
            $gameSystem.realEstateData = {
                properties: this.properties,
                ownedProperties: this.ownedProperties,
                rentedProperties: this.rentedProperties,
                lastUpdateTime: this.lastUpdateTime,
                dailyIncome: this.dailyIncome,
                totalIncome: this.totalIncome,
                companyShares: this.companyShares,
                companyPrices: this.companyPrices,
                companyCostBasis: this.companyCostBasis,
                customCompanies: this.customCompanies,
                ownedDestinations: this.ownedDestinations,
                marketSeeded: this.marketSeeded === true
            };
        }

        load() {
            const data = $gameSystem.realEstateData;
            if (data) {
                this.properties = data.properties || [];
                this.ownedProperties = data.ownedProperties || [];
                this.rentedProperties = data.rentedProperties || [];
                this.lastUpdateTime = data.lastUpdateTime ? new Date(data.lastUpdateTime) : getGameDateAsJSDate();
                this.dailyIncome = data.dailyIncome || 0;
                this.totalIncome = data.totalIncome || 0;
                this.companyShares = data.companyShares || {};
                this.companyPrices = data.companyPrices || {};
                this.companyCostBasis = data.companyCostBasis || {};
                this.customCompanies = data.customCompanies || {};
                this.ownedDestinations = data.ownedDestinations || [];
                this.marketSeeded = data.marketSeeded === true;

                // If no properties exist, initialize
                if (this.properties.length === 0) {
                    this.initialize();
                } else if (!this.marketSeeded) {
                    // A board this savegame rolled privately, before the market
                    // was the world's. Rebuild it from the world seed so it is
                    // the same thirty houses everyone else is looking at, and
                    // put the party back on the ids they held: they keep a
                    // property at each slot they bought, which is now the
                    // world's house at that slot rather than their own.
                    this.rebuildSeededMarket();
                    this.registerWithNewsSystem();
                } else {
                    // Re-register with news system
                    this.registerWithNewsSystem();
                }
            } else {
                this.initialize();
            }
        }

        // =====================================================================
        // Company share market
        // =====================================================================

        // What the player reads about a company. Companies.json carries an i18n
        // key ("RealEstate.company.<key>.description") rather than a sentence,
        // so a listing reads in the player's language; a company registered at
        // runtime with plain prose is shown as written.
        companyText(value) {
            if (!value) return '';
            const key = String(value);
            return T.has(key) ? T(key) : key;
        }

        // The sector stays an English id in the data - it is what the market
        // sorts and events match on - so its label is derived from the id.
        sectorLabel(sector) {
            if (!sector) return '';
            const key = 'RealEstate.sector.' + String(sector).toLowerCase().replace(/[^a-z0-9]/g, '');
            return T.has(key) ? T(key) : String(sector);
        }

        // Merged company definitions: static Companies.json (window.WorldGen.
        // Companies) overlaid with any runtime-registered custom companies.
        getCompanyDefs() {
            const base = (window.WorldGen && window.WorldGen.Companies) || {};
            return Object.assign({}, base, this.customCompanies || {});
        }

        // Current per-share price (euros), lazily seeded from the listing price.
        getCompanyPrice(key) {
            if (this.companyPrices[key] == null) {
                const def = this.getCompanyDefs()[key];
                this.companyPrices[key] = def ? (Number(def.sharePrice) || 1) : 1;
            }
            return this.companyPrices[key];
        }

        getShares(key) {
            return this.companyShares[key] || 0;
        }

        // Shares of a company the society's NPCs hold (NPCSim.Stocks): they
        // are not on offer to the party.
        npcShares(key) {
            const S = window.NPCSim && window.NPCSim.Stocks;
            try { return S && typeof S.heldBy === 'function' ? Math.max(0, Number(S.heldBy(key)) || 0) : 0; }
            catch (e) { return 0; }
        }

        // Render-ready list of every listed company, enriched with the player's
        // position. Sorted by name for stable display.
        getCompanies() {
            const defs = this.getCompanyDefs();
            return Object.keys(defs).map(key => {
                const def = defs[key];
                const total = Number(def.totalShares) || 0;
                const owned = this.getShares(key);
                const price = this.getCompanyPrice(key);
                return {
                    key,
                    name: def.name || key,
                    sector: def.sector || '',
                    color: def.color || 'var(--border-focus-hover)',
                    description: this.companyText(def.description),
                    sectorLabel: this.sectorLabel(def.sector),
                    basePrice: Number(def.sharePrice) || price,
                    price,
                    totalShares: total,
                    sharesOwned: owned,
                    available: Math.max(0, total - owned - this.npcShares(key)),
                    ownershipPct: total > 0 ? (owned / total) * 100 : 0,
                    value: Math.round(owned * price * 100),      // gold
                    costBasis: this.companyCostBasis[key] || 0   // gold
                };
            }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        }

        getCompany(key) {
            return this.getCompanies().find(c => c.key === key) || null;
        }

        // Buy `count` shares at the current price. Returns true on success.
        buyShares(key, count) {
            const def = this.getCompanyDefs()[key];
            if (!def) return false;
            const total = Number(def.totalShares) || 0;
            const available = Math.max(0, total - this.getShares(key) - this.npcShares(key));
            count = Math.min(Math.floor(count), available);
            if (count <= 0) return false;

            const price = this.getCompanyPrice(key);
            const goldCost = Math.round(count * price * 100);
            if ($gameParty.gold() < goldCost) return false;

            $gameParty.loseGold(goldCost);
            this.companyShares[key] = this.getShares(key) + count;
            this.companyCostBasis[key] = (this.companyCostBasis[key] || 0) + goldCost;
            this.save();
            return true;
        }

        // Sell `count` shares at the current price. Returns true on success.
        sellShares(key, count) {
            const owned = this.getShares(key);
            count = Math.min(Math.floor(count), owned);
            if (count <= 0) return false;

            const price = this.getCompanyPrice(key);
            const goldGain = Math.round(count * price * 100);
            $gameParty.gainGold(goldGain);

            // Reduce the cost basis proportionally to the shares sold.
            const remaining = owned - count;
            const basis = this.companyCostBasis[key] || 0;
            this.companyCostBasis[key] = remaining > 0 ? Math.round(basis * (remaining / owned)) : 0;

            if (remaining > 0) this.companyShares[key] = remaining;
            else { delete this.companyShares[key]; delete this.companyCostBasis[key]; }
            this.save();
            return true;
        }

        // Grant shares outright (no cash spent) - used by the CEO origin. Sets the
        // cost basis to current market value so profit/loss starts at zero.
        giveShares(key, count) {
            const def = this.getCompanyDefs()[key];
            if (!def) return false;
            const total = Number(def.totalShares) || 0;
            count = Math.max(0, Math.min(Math.floor(count), total));
            if (count <= 0) return false;
            const price = this.getCompanyPrice(key);
            this.companyShares[key] = count;
            this.companyCostBasis[key] = Math.round(count * price * 100);
            this.save();
            return true;
        }

        // A company's price, in euros to the cent, as quoted by whoever is trading
        // it. The stock terminal prices the same listings live and writes its quote
        // back here so the Assets pockets and this screen value a share alike.
        setCompanyPrice(key, priceEuros) {
            if (!this.getCompanyDefs()[key]) return false;
            this.companyPrices[key] = Math.max(100, Math.round((Number(priceEuros) || 1) * 100)) / 100;
            return true;
        }

        // A compact read of one holding, for systems that poll it often (the
        // stock terminal ticks a few times a second): no list build, no sort.
        getPosition(key) {
            const def = this.getCompanyDefs()[key];
            if (!def) return null;
            const total = Number(def.totalShares) || 0;
            const shares = this.getShares(key);
            return {
                key,
                price: this.getCompanyPrice(key),          // euros per share
                shares,
                costBasis: this.companyCostBasis[key] || 0, // gold
                totalShares: total,
                available: Math.max(0, total - shares - this.npcShares(key))
            };
        }

        // State a holding outright: what the party owns and what it paid. Used by
        // the stock terminal, which settles its own cash and then reports the
        // resulting position here.
        setPosition(key, shares, costBasisGold) {
            const def = this.getCompanyDefs()[key];
            if (!def) return false;
            const total = Number(def.totalShares) || 0;
            const count = Math.max(0, Math.min(Math.floor(Number(shares) || 0), total || Infinity));
            if (count > 0) {
                this.companyShares[key] = count;
                this.companyCostBasis[key] = Math.max(0, Math.round(Number(costBasisGold) || 0));
            } else {
                delete this.companyShares[key];
                delete this.companyCostBasis[key];
            }
            this.save();
            return true;
        }

        // Register a new company at runtime (persisted in the save). Accepts a key
        // and an options object; sensible defaults fill any gaps.
        registerCompany(key, opts) {
            if (!key) return false;
            opts = opts || {};
            this.customCompanies[key] = {
                name: opts.name || key,
                sector: opts.sector || 'Misc',  // i18n-ignore  sector id
                sharePrice: Number(opts.sharePrice) || 50,
                totalShares: Number(opts.totalShares) || 100000,
                color: opts.color || 'var(--border-focus-hover)',
                description: opts.description || ''
            };
            // Seed the live price so it appears immediately.
            this.companyPrices[key] = this.customCompanies[key].sharePrice;
            this.save();
            return true;
        }

        // =====================================================================
        // Owned Places (Destinations.json entries)
        // =====================================================================

        ownsDestination(key) {
            return this.ownedDestinations.some(d => d.key === key);
        }

        // Register a Destinations.json entry as owned by the player. `valueEuros`
        // is an optional book value shown in the Assets pockets. Returns true if it
        // was added (false if the key is unknown or already owned).
        registerDestination(key, valueEuros) {
            const dest = window.WorkSystem && window.WorkSystem.Destinations;
            if (!dest || !dest[key]) {
                console.warn(`RealEstateMarket: unknown destination key "${key}".`);
                return false;
            }
            if (this.ownsDestination(key)) return false;
            const value = Math.max(0, Math.round((Number(valueEuros) || 0) * 100)); // euros -> gold
            this.ownedDestinations.push({ key, value });
            this.save();
            return true;
        }

        getOwnedDestinations() {
            const dest = (window.WorkSystem && window.WorkSystem.Destinations) || {};
            return this.ownedDestinations.map(d => ({
                key: d.key,
                value: d.value || 0,
                base: (dest[d.key] && dest[d.key].base) || null
            }));
        }
    }

    // Scene_RealEstate - Main UI Scene
    class Scene_RealEstate extends Scene_MenuBase {
        create() {
            super.create();
            this.createHelpWindow();
            this.createGoldWindow();
            this.createPropertyListWindow();
            this.createPropertyDetailsWindow();
            this.createCommandWindow();

            // Hide standard MZ canvas windows
            if (this._helpWindow) this._helpWindow.visible = false;
            if (this._goldWindow) this._goldWindow.visible = false;
            if (this._propertyListWindow) this._propertyListWindow.visible = false;
            if (this._propertyDetailsWindow) this._propertyDetailsWindow.visible = false;
            if (this._commandWindow) this._commandWindow.visible = false;

            this._dndFocusSection = 'list'; // 'list' or 'commands'
            this._dndCommandIndex = 0;

            // Company share-market view state.
            this._viewMode = 'properties';   // 'properties' | 'companies'
            this._builtViewMode = null;      // last view the DOM spread was built for
            this._companyIndex = 0;
            this._companyCommandIndex = 0;

            this.createUIRealEstateDOM();

            // Name the skill this menu runs on while it is open. In a window on
            // the desktop the chip is hung off the spread itself, so it goes
            // when the window does instead of floating over the whole machine.
            if (window.SpecBadge) {
                window.SpecBadge.show('Real Estate Appraisal',  // i18n-ignore  Specialization.json id
                    this._isAppMode ? { el: this._dndContainer } : {});
            }

            // Opened as a window on the hyperdeck desktop the scene is never
            // pushed, so nothing calls start(): do its work here instead.
            if (this._isAppMode) this.beginRegistry();
        }

        // The live handler target for the markup's inline onclick attributes.
        // In app mode the running RMMZ scene is Scene_HypernetOS, not this one.
        sceneRef() {
            return this._isAppMode ? 'window.HypernetRealEstateApp.appInstance' : 'SceneManager._scene';
        }

        beginRegistry() {
            ensureRealEstateManager();
            this._propertyListWindow.setDetailsWindow(this._propertyDetailsWindow);
            this._propertyListWindow.refresh();
            this._propertyListWindow.activate();
            this._propertyListWindow.select(0);
            this.refreshUIRealEstateDOM();
        }

        createHelpWindow() {
            const rect = this.helpWindowRect();
            this._helpWindow = new Window_Help(rect);
            this._helpWindow.setText(t('menuTitle'));
            this.addWindow(this._helpWindow);
        }

        createGoldWindow() {
            const rect = this.goldWindowRect();
            this._goldWindow = new Window_Gold(rect);
            this.addWindow(this._goldWindow);
        }

        goldWindowRect() {
            const ww = this.mainCommandWidth();
            const wh = this.calcWindowHeight(1, true);
            const wx = Graphics.boxWidth - ww;
            const wy = this.mainAreaTop();
            return new Rectangle(wx, wy, ww, wh);
        }

        createPropertyListWindow() {
            const rect = this.propertyListWindowRect();
            this._propertyListWindow = new Window_PropertyList(rect);
            this._propertyListWindow.setHandler('ok', this.onPropertyOk.bind(this));
            this._propertyListWindow.setHandler('cancel', this.popScene.bind(this));
            this._propertyListWindow.setHelpWindow(this._helpWindow);
            this.addWindow(this._propertyListWindow);
        }

        propertyListWindowRect() {
            const wx = 0;
            const wy = this.mainAreaTop() + this._goldWindow.height;
            const ww = Graphics.boxWidth / 2;
            const wh = this.mainAreaHeight() - this._goldWindow.height;
            return new Rectangle(wx, wy, ww, wh);
        }

        createPropertyDetailsWindow() {
            const rect = this.propertyDetailsWindowRect();
            this._propertyDetailsWindow = new Window_PropertyDetails(rect);
            this.addWindow(this._propertyDetailsWindow);
        }

        propertyDetailsWindowRect() {
            const wx = this._propertyListWindow.width;
            const wy = this.mainAreaTop() + this._goldWindow.height;
            const ww = Graphics.boxWidth - wx;
            const wh = this.mainAreaHeight() - this._goldWindow.height - this.calcWindowHeight(1, true);
            return new Rectangle(wx, wy, ww, wh);
        }

        createCommandWindow() {
            const rect = this.commandWindowRect();
            this._commandWindow = new Window_PropertyCommand(rect);
            this._commandWindow.setHandler('buy', this.commandBuy.bind(this));
            this._commandWindow.setHandler('sell', this.commandSell.bind(this));
            this._commandWindow.setHandler('info', this.commandInfo.bind(this));
            this._commandWindow.setHandler('cancel', this.onCommandCancel.bind(this));
            this._commandWindow.close();
            this._commandWindow.deactivate();
            this.addWindow(this._commandWindow);
        }

        commandWindowRect() {
            const wx = this._propertyDetailsWindow.x;
            const wy = this._propertyDetailsWindow.y + this._propertyDetailsWindow.height;
            const ww = this._propertyDetailsWindow.width;
            const wh = this.calcWindowHeight(1, true);
            return new Rectangle(wx, wy, ww, wh);
        }

        start() {
            super.start();
            this.beginRegistry();
        }

        onPropertyOk() {
            // Unused but kept for base compatibility
        }

        commandBuy() {
            const property = this._propertyListWindow.property();
            if ($realEstateManager.buyProperty(property.id)) {
                SoundManager.playShop();
                this.refreshAllWindows();
            } else {
                SoundManager.playBuzzer();
            }
        }

        commandInfo() {
            const property = this._propertyListWindow.property();
            if (property) {
                $gameTemp.newsFilterLocation = property.location;
                // On the desktop the news opens as its own OS window: pushing an
                // RMMZ scene from inside the OS would tear the desktop down.
                if (this._isAppMode) {
                    $gameTemp.newsReturnScene = null;
                    if (window.HypernetNewsApp) window.HypernetNewsApp.launch();
                    return;
                }
                $gameTemp.newsReturnScene = 'realEstate';
                if (window.Scene_NewsHistory) {
                    SceneManager.push(window.Scene_NewsHistory);
                }
            }
        }

        commandSell() {
            const property = this._propertyListWindow.property();
            if ($realEstateManager.sellProperty(property.id)) {
                SoundManager.playShop();
                this.refreshAllWindows();
            } else {
                SoundManager.playBuzzer();
            }
        }

        commandRent() {
            const property = this._propertyListWindow.property();
            if ($realEstateManager.rentProperty(property.id)) {
                SoundManager.playShop();
                this.refreshAllWindows();
            } else {
                SoundManager.playBuzzer();
            }
        }

        // The management book for the shop that came with this deed. On the OS
        // desktop an RMMZ scene cannot be pushed over the browser, so the party
        // is pointed at the Deeds page instead.
        commandManageShop() {
            const property = this._propertyListWindow.property();
            const SM = window.ShopManagement;
            if (!property || !SM || !SM.openManagement) { SoundManager.playBuzzer(); return; }
            if (this._isAppMode) {
                SoundManager.playBuzzer();
                window.ParchmentToast?.show?.(T('RealEstate.ui.manageFromDeeds'));
                return;
            }
            // The shop is opened the first time the deed is looked at on a save
            // that predates shop deeds.
            SM.onPropertyBought(property);
            if (SM.openManagement('prop:' + property.id)) SoundManager.playOk();
            else SoundManager.playBuzzer();
        }

        commandVacate() {
            const property = this._propertyListWindow.property();
            if ($realEstateManager.vacateProperty(property.id)) {
                SoundManager.playCancel();
                this.refreshAllWindows();
            } else {
                SoundManager.playBuzzer();
            }
        }

        // A bought procedural floor put up for tenants. Whoever of the party
        // lived there is sent back to the halls, and told so.
        commandLetHouse(property) {
            const moved = property ? $realEstateManager.letProceduralHouse(property.houseKey) : null;
            if (!moved) { SoundManager.playBuzzer(); return; }
            SoundManager.playShop();
            if (moved.length && window.ParchmentToast) {
                window.ParchmentToast.show(T('RealEstate.ui.movedToHalls', { names: moved.join(', ') }));
            }
            this.refreshAllWindows();
        }

        commandStopLetting(property) {
            if (property && $realEstateManager.stopLettingProceduralHouse(property.houseKey)) {
                SoundManager.playCancel();
                this.refreshAllWindows();
            } else {
                SoundManager.playBuzzer();
            }
        }

        onCommandCancel() {
            // Unused but kept for base compatibility
        }

        returnToPropertyList() {
            // Unused but kept for base compatibility
        }

        refreshAllWindows() {
            this._propertyListWindow.refresh();
            this._propertyDetailsWindow.refresh();
            this._goldWindow.refresh();
        }

        terminate() {
            if (window.SpecBadge) window.SpecBadge.hide();
            if (!this._isAppMode) super.terminate();
            if (this._dndContainer) {
                const container = this._dndContainer;
                container.style.transition = "opacity 0.2s ease-out";
                container.style.opacity = "0";
                container.style.pointerEvents = "none";
                setTimeout(() => {
                    if (container && container.parentNode) {
                        container.parentNode.removeChild(container);
                    }
                }, 200);
                this._dndContainer = null;
            }
        }

        createUIRealEstateDOM() {
            this._dndContainer = document.createElement('div');
            this._dndContainer.classList.add('estate-root');
            this._dndContainer.style.opacity = '0';
            this._dndContainer.style.transition = 'opacity 0.22s ease-out';
            const appHost = this._isAppMode ? document.getElementById('real-estate-content') : null;
            if (appHost) {
                // Inside an OS window the registry wears XP chrome, dressed by
                // #real-estate-content in hypernet.css. The parchment overlay id
                // means position:absolute over the whole screen and a dark
                // backdrop, which would paint across the desktop.
                appHost.innerHTML = '';
                appHost.appendChild(this._dndContainer);
            } else {
                this._dndContainer.id = 'menu-container';
                document.body.appendChild(this._dndContainer);
            }

            // Right-click anywhere in the overlay closes the menu
            this._rightClickStartedHere = false;
            this._dndContainer.addEventListener('mousedown', (event) => {
                if (event.button === 2) { this._rightClickStartedHere = true; event.stopPropagation(); }
            });
            this._dndContainer.addEventListener('mouseup', (event) => {
                if (event.button === 2) event.stopPropagation();
            });
            this._dndContainer.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!this._rightClickStartedHere) return;
                this._rightClickStartedHere = false;
                SoundManager.playCancel();
                this.stepOut();
            });
            this._dndContainer.addEventListener('wheel', (e) => {
                const listEl = this._dndContainer.querySelector('#estate-list');
                if (listEl) { listEl.scrollTop += e.deltaY; e.preventDefault(); }
            }, { passive: false });

            this._reListDataKey = '';
            this.refreshUIRealEstateDOM();

            setTimeout(() => {
                if (this._dndContainer) this._dndContainer.style.opacity = '1';
            }, 16);
        }

        buildPropertyListHTML(properties, selectedIndex) {
            const sref = this.sceneRef();
            return properties.map((prop, idx) => {
                const isSelected = idx === selectedIndex;
                let statusLabel, statusColor;
                if (prop.isOwned) {
                    statusLabel = T('RealEstate.ui.owned');
                    statusColor = 'var(--text-success-active)';
                } else if (prop.isRentedByPlayer) {
                    statusLabel = T('RealEstate.ui.rented');
                    statusColor = 'var(--text-info)';
                } else if ($realEstateManager && $realEstateManager.isTakenByAnother(prop.id)) {
                    // Off the market: another playthrough of this world took it.
                    statusLabel = T('RealEstate.ui.taken');
                    statusColor = 'var(--text-disabled)';
                } else {
                    statusLabel = T('RealEstate.ui.available');
                    statusColor = 'var(--text-primary-hover)';
                }
                const stars = '★'.repeat(prop.stars) + '☆'.repeat(5 - prop.stars);
                return `
                    <div class="item-slot focusable ${isSelected ? 'selected' : ''}" tabindex="0" data-focus-key="re-prop-${prop.id}" onclick="${sref}.selectPropertyItem(${idx})">
                        <div class="item-slot-info">
                            <div class="item-slot-name">${prop.name}</div>
                            <div class="item-slot-meta">
                                <span>${prop.location} • ${t('propertyTypes')[prop.type]}</span>
                            </div>
                        </div>
                        <div class="estate-01">
                            <span class="estate-02" style="color:${statusColor}">${statusLabel}</span>
                            <span class="estate-03">${stars}</span>
                        </div>
                    </div>`;
            }).join('');
        }

        buildDeedHTML(selectedProperty) {
            if (!selectedProperty) {
                return `
                    <div class="item-inspect item-inspect--empty estate-04">
                        <h3 class="title">${T('RealEstate.ui.titleDeed')}</h3>
                        <p class="inspect-placeholder-text">
                            ${T('RealEstate.ui.selectAnAssetFromThe')}
                        </p>
                    </div>`;
            }

            const effectivePrice = $realEstateManager.calculateEffectivePrice(selectedProperty);
            const priceDiff = effectivePrice - selectedProperty.price;
            const percentChange = selectedProperty.price > 0 ? Math.round((priceDiff / selectedProperty.price) * 100) : 0;
            const effects = $realEstateManager.getActiveEffectsForLocation(selectedProperty.location);
            const trend = selectedProperty.marketTrend || 0;
            const stars = '★'.repeat(selectedProperty.stars || 1) + '☆'.repeat(5 - (selectedProperty.stars || 1));

            let marketSentiment = t('stable');
            let sentimentColor = 'var(--text-text-alt-4)';
            if (trend > 0.5) { marketSentiment = t('hot'); sentimentColor = 'var(--text-success-active)'; }
            else if (trend < -0.5) { marketSentiment = t('cold'); sentimentColor = 'var(--border-danger-active)'; }

            const sref = this.sceneRef();
            const commands = this.deedCommands(selectedProperty);

            const commandsHTML = commands.map((cmd, cIdx) => {
                const isSel = cIdx === this._dndCommandIndex && this._dndFocusSection === 'commands';
                const mod = cmd.danger ? ' inspect-btn--danger' : (cmd.secondary ? ' inspect-btn--secondary' : '');
                return `<div class="inspect-btn${mod} focusable ${isSel ? 'selected' : ''}" tabindex="0" data-focus-key="re-deed-${cmd.action}" onclick="${sref}.executeDeedCommand('${cmd.action}')">${cmd.label}</div>`;
            }).join('');

            const row = (label, value, valStyle = '') =>
                `<div class="inspect-spec-row"><span class="inspect-spec-label">${label}:</span><span class="inspect-spec-value" style="${valStyle}">${value}</span></div>`;

            let priceVal = `€${effectivePrice.toLocaleString()}`;
            if (priceDiff !== 0) {
                priceVal += ` <span class="estate-05" style="color:${priceDiff > 0 ? 'var(--text-success-active)' : 'var(--border-danger-active)'}">(${percentChange > 0 ? '+' : ''}${percentChange}%)</span>`;
            }

            const monthlyRent = $realEstateManager.getMonthlyRent(selectedProperty);

            let ownedRows = '';
            if (selectedProperty.isOwned) {
                if (selectedProperty.isNormalHome) {
                    if (selectedProperty.resident) {
                        ownedRows = row(T('Assets.ui.resident'), selectedProperty.resident)
                            + row(T('Assets.ui.buildRights'), T('Assets.ui.owner'), 'color:var(--text-success-active);');
                    } else if (selectedProperty.normalHomeType === 'procedural') {
                        ownedRows = row(T('Assets.ui.coordinates'), selectedProperty.entranceCoords || '-')
                            + (selectedProperty.floor > 0 ? row(T('Assets.ui.floor'), String(selectedProperty.floor)) : '')
                            + row(T('Assets.ui.buildRights'), T('Assets.ui.owner'), 'color:var(--text-success-active);');
                        if (selectedProperty.isForRent) {
                            ownedRows += row(T('RealEstate.ui.tenants'), `${selectedProperty.currentOccupants} / ${selectedProperty.maxOccupants}`)
                                + row(t('dailyIncome'), `€${(selectedProperty.currentOccupants * selectedProperty.rentPerOccupant).toLocaleString()}`, 'color:var(--text-success-active);');
                        }
                    } else {
                        ownedRows = row(T('Assets.ui.buildRights'), T('Assets.ui.owner'), 'color:var(--text-success-active);');
                    }
                } else {
                    ownedRows = row(t('occupancy'), `${selectedProperty.currentOccupants} / ${selectedProperty.maxOccupants}`)
                        + row(t('dailyIncome'), `€${(selectedProperty.currentOccupants * selectedProperty.rentPerOccupant).toLocaleString()}`, 'color:var(--text-success-active);');
                }
            } else if (selectedProperty.isRentedByPlayer) {
                ownedRows = row(T('RealEstate.ui.monthlyRent'), `€${monthlyRent.toLocaleString()}`, 'color:var(--border-danger-active);')
                    + row(T('RealEstate.ui.status'), T('RealEstate.ui.rentedNotOwned'), 'color:var(--text-info);');
            } else {
                ownedRows = row(T('RealEstate.ui.monthlyRent'), `€${monthlyRent.toLocaleString()}`);
            }

            const lodgingId = this.lodgingPlaceIdFor(selectedProperty);
            if (lodgingId) {
                const living = window.PartyLodging.residents().filter(p => p.lodging === lodgingId).map(p => p.name);
                ownedRows += row(T('RealEstate.ui.residents'), living.length ? living.join(', ') : '-');
            }

            return `
                <div class="item-inspect">
                    <h3 class="title estate-06">${selectedProperty.name}</h3>
                    <div class="inspect-section-title">${T('RealEstate.ui.titleDeed')}</div>
                    ${row(t('type'), (t('propertyTypes') && t('propertyTypes')[selectedProperty.type]) || selectedProperty.type)}
                    ${row(t('location'), selectedProperty.location)}
                    ${row(t('rating'), stars, 'color:var(--text-primary-hover);')}
                    ${row(t('price'), priceVal, 'color:var(--text-primary-hover);')}
                    ${row(T('RealEstate.ui.marketSentiment'), marketSentiment.toUpperCase(), `color:${sentimentColor};letter-spacing:0.5px;`)}
                    ${ownedRows}
                    ${effects.length > 0 ? `<div class="inspect-bullet-item estate-07">${effects.length} ${T('RealEstate.ui.activeEventsAreAlteringPrices')}</div>` : ''}
                    <div class="inspect-actions estate-08">${commandsHTML}</div>
                </div>`;
        }

        // Tab bar switching the left list between properties and companies.
        buildTabBarHTML() {
            const sref = this.sceneRef();
            const tab = (mode, label) => {
                const active = this._viewMode === mode ? ' re-tab--active' : '';
                return `<div class="re-tab${active} focusable" tabindex="0" data-focus-key="re-tab-${mode}" onclick="${sref}.switchView('${mode}')">${label}</div>`;
            };
            return `<div class="re-tabs">
                ${tab('properties', T('RealEstate.ui.properties'))}
                ${tab('companies', T('RealEstate.ui.companies'))}
                ${window.WorkplaceDeeds ? tab('workplaces', T('RealEstate.ui.workingPlaces')) : ''}
            </div>`;
        }

        refreshUIRealEstateDOM() {
            if (!this._dndContainer) return;
            ensureRealEstateManager();

            // Rebuild the whole spread on first paint or when the view mode flips;
            // otherwise patch in place for the active mode.
            const spread = this._dndContainer.querySelector('.book-spread');
            if (!spread || this._builtViewMode !== this._viewMode) {
                this._builtViewMode = this._viewMode;
                this._dndContainer.innerHTML = `<div class="book-spread">${this.buildLeftPageHTML()}${this.buildRightPageHTML()}</div>`;
                this._reListDataKey = this.currentListDataKey();
                this.scrollSelectedIntoView();
                return;
            }

            if (this._viewMode === 'companies') this.refreshCompaniesInPlace();
            else if (this._viewMode === 'workplaces') this.refreshWorkplacesInPlace();
            else this.refreshPropertiesInPlace();
            this.scrollSelectedIntoView();
        }

        currentListDataKey() {
            if (this._viewMode === 'companies') {
                const holdings = Object.keys($realEstateManager.companyShares || {}).length;
                return `co_${holdings}`;
            }
            if (this._viewMode === 'workplaces') {
                const WD = window.WorkplaceDeeds;
                return `wp_${WD ? WD.list().length : 0}`;
            }
            const props = $realEstateManager ? $realEstateManager.getAllProperties().length : 0;
            const owned = $realEstateManager ? $realEstateManager.getOwnedCount() : 0;
            return `${owned}_${props}`;
        }

        scrollSelectedIntoView() {
            const selectedEl = this._dndContainer.querySelector('#estate-list .item-slot.selected');
            if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
        }

        buildLeftPageHTML() {
            const dismissText = T('RealEstate.ui.dismiss');
            const registryTitle = this._viewMode === 'companies'
                ? (T('RealEstate.ui.companyExchange'))
                : this._viewMode === 'workplaces'
                    ? T('RealEstate.ui.workingPlacesRegistry')
                    : (T('RealEstate.ui.realEstateRegistry'));

            const cash = Number(($gameParty.gold() / 100).toFixed(2));
            let statsHTML;
            let listHTML;
            if (this._viewMode === 'companies') {
                const companies = $realEstateManager.getCompanies();
                const holdingsValue = companies.reduce((s, c) => s + c.value, 0);
                const heldCount = companies.filter(c => c.sharesOwned > 0).length;
                statsHTML = `
                    <div class="re-stat">
                        <span class="re-stat-lbl">${T('RealEstate.ui.liquidFunds')}</span>
                        <span class="re-stat-val" id="re-cash">€${cash.toLocaleString()}</span>
                    </div>
                    <div class="re-stat estate-09">
                        <span class="re-stat-lbl">${T('RealEstate.ui.holdings')}</span>
                        <span class="re-stat-val estate-10" id="re-held">${heldCount}</span>
                    </div>
                    <div class="re-stat estate-11">
                        <span class="re-stat-lbl">${T('RealEstate.ui.equityValue')}</span>
                        <span class="re-stat-val" id="re-equity">€${Math.round(holdingsValue / 100).toLocaleString()}</span>
                    </div>`;
                if (this._companyIndex >= companies.length) this._companyIndex = Math.max(0, companies.length - 1);
                listHTML = this.buildCompanyListHTML(companies, this._companyIndex);
            } else if (this._viewMode === 'workplaces') {
                const places = this.workplaceListing();
                statsHTML = this.buildWorkplaceStatsHTML(places, cash);
                listHTML = this.buildWorkplaceListHTML(places, this._workplaceIndex);
            } else {
                const dailyYield = $realEstateManager.calculateDailyIncome();
                const allProps = $realEstateManager.getAllProperties();
                const ownedCount = $realEstateManager.getOwnedCount();
                const totalProps = allProps.length;
                statsHTML = `
                    <div class="re-stat">
                        <span class="re-stat-lbl">${T('RealEstate.ui.liquidFunds')}</span>
                        <span class="re-stat-val" id="re-cash">€${cash.toLocaleString()}</span>
                    </div>
                    <div class="re-stat estate-09">
                        <span class="re-stat-lbl">${T('RealEstate.ui.deedsHeld')}</span>
                        <span class="re-stat-val estate-10" id="re-owned">${ownedCount} / ${totalProps}</span>
                    </div>
                    <div class="re-stat estate-11">
                        <span class="re-stat-lbl">${T('RealEstate.ui.dailyYield')}</span>
                        <span class="re-stat-val" id="re-yield">€${dailyYield.toLocaleString()}</span>
                    </div>`;
                listHTML = this.buildPropertyListHTML(allProps, this._propertyListWindow.index());
            }

            return `
                <div class="left-page">
                    <div class="page-header-bar">
                        ${this._isAppMode ? '' : `<div class="back-button focusable" tabindex="0" data-focus-key="re-dismiss" onclick="${this.sceneRef()}.dismiss()">${dismissText}</div>`}
                        <h2 class="title">${registryTitle}</h2>
                    </div>
                    ${this.buildTabBarHTML()}
                    <div class="re-stats">${statsHTML}</div>
                    <div class="re-list" id="estate-list">${listHTML}</div>
                </div>`;
        }

        buildRightPageHTML() {
            if (this._viewMode === 'companies') {
                const companies = $realEstateManager.getCompanies();
                const company = companies[this._companyIndex] || null;
                const title = T('RealEstate.ui.shareProspectus');
                return `
                    <div class="right-page">
                        <h2 class="title">${title}</h2>
                        <div class="estate-12" id="re-deed-wrap">${this.buildProspectusHTML(company)}</div>
                    </div>`;
            }
            if (this._viewMode === 'workplaces') {
                const place = this.workplaceListing()[this._workplaceIndex] || null;
                return `
                    <div class="right-page">
                        <h2 class="title">${T('RealEstate.ui.businessDeed')}</h2>
                        <div class="estate-12" id="re-deed-wrap">${this.buildWorkplaceDeedHTML(place)}</div>
                    </div>`;
            }
            const properties = $realEstateManager.getAllProperties();
            const selectedProperty = properties[this._propertyListWindow.index()] || null;
            const deedTitle = T('RealEstate.ui.deedOfTransaction');
            return `
                <div class="right-page">
                    <h2 class="title">${deedTitle}</h2>
                    <div class="estate-12" id="re-deed-wrap">${this.buildDeedHTML(selectedProperty)}</div>
                </div>`;
        }

        refreshPropertiesInPlace() {
            const cash = Number(($gameParty.gold() / 100).toFixed(2));
            const dailyYield = $realEstateManager.calculateDailyIncome();
            const allProps = $realEstateManager.getAllProperties();
            const ownedCount = $realEstateManager.getOwnedCount();
            const totalProps = allProps.length;
            const selectedIndex = this._propertyListWindow.index();

            const cashEl = this._dndContainer.querySelector('#re-cash');
            if (cashEl) cashEl.textContent = `€${cash.toLocaleString()}`;
            const ownedEl = this._dndContainer.querySelector('#re-owned');
            if (ownedEl) ownedEl.textContent = `${ownedCount} / ${totalProps}`;
            const yieldEl = this._dndContainer.querySelector('#re-yield');
            if (yieldEl) yieldEl.textContent = `€${dailyYield.toLocaleString()}`;

            const listDataKey = this.currentListDataKey();
            const listEl = this._dndContainer.querySelector('#estate-list');
            if (listEl) {
                if (this._reListDataKey !== listDataKey) {
                    this._reListDataKey = listDataKey;
                    listEl.innerHTML = this.buildPropertyListHTML(allProps, selectedIndex);
                } else {
                    listEl.querySelectorAll('.item-slot').forEach((slot, idx) => {
                        slot.classList.toggle('selected', idx === selectedIndex);
                    });
                }
            }
            const deedWrap = this._dndContainer.querySelector('#re-deed-wrap');
            if (deedWrap) deedWrap.innerHTML = this.buildDeedHTML(allProps[selectedIndex] || null);
        }

        refreshCompaniesInPlace() {
            const cash = Number(($gameParty.gold() / 100).toFixed(2));
            const companies = $realEstateManager.getCompanies();
            if (this._companyIndex >= companies.length) this._companyIndex = Math.max(0, companies.length - 1);

            const cashEl = this._dndContainer.querySelector('#re-cash');
            if (cashEl) cashEl.textContent = `€${cash.toLocaleString()}`;
            const heldEl = this._dndContainer.querySelector('#re-held');
            if (heldEl) heldEl.textContent = String(companies.filter(c => c.sharesOwned > 0).length);
            const equityEl = this._dndContainer.querySelector('#re-equity');
            if (equityEl) equityEl.textContent = `€${Math.round(companies.reduce((s, c) => s + c.value, 0) / 100).toLocaleString()}`;

            // Companies list is small - rebuild it each refresh to reflect prices.
            const listEl = this._dndContainer.querySelector('#estate-list');
            if (listEl) listEl.innerHTML = this.buildCompanyListHTML(companies, this._companyIndex);

            const deedWrap = this._dndContainer.querySelector('#re-deed-wrap');
            if (deedWrap) deedWrap.innerHTML = this.buildProspectusHTML(companies[this._companyIndex] || null);
        }

        buildCompanyListHTML(companies, selectedIndex) {
            const sref = this.sceneRef();
            return companies.map((c, idx) => {
                const isSelected = idx === selectedIndex;
                const owned = c.sharesOwned > 0;
                const statusLabel = owned
                    ? `${c.ownershipPct.toFixed(c.ownershipPct >= 10 ? 0 : 1)}%`
                    : (T('RealEstate.ui.listed'));
                const statusColor = owned ? 'var(--text-success-active)' : 'var(--text-primary-hover)';
                return `
                    <div class="item-slot focusable ${isSelected ? 'selected' : ''}" tabindex="0" data-focus-key="re-co-${c.key}" onclick="${sref}.selectCompanyItem(${idx})">
                        <div class="re-co-bar" style="background:${c.color}"></div>
                        <div class="item-slot-info">
                            <div class="item-slot-name">${c.name}</div>
                            <div class="item-slot-meta"><span>${c.sectorLabel || c.sector} • €${c.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${T('RealEstate.ui.sh')}</span></div>
                        </div>
                        <div class="estate-01">
                            <span class="estate-02" style="color:${statusColor}">${statusLabel}</span>
                            ${owned ? `<span class="estate-13">${c.sharesOwned.toLocaleString()} ${T('RealEstate.ui.sh')}</span>` : ''}
                        </div>
                    </div>`;
            }).join('');
        }

        buildProspectusHTML(company) {
            const sref = this.sceneRef();
            if (!company) {
                return `
                    <div class="item-inspect item-inspect--empty estate-04">
                        <h3 class="title">${T('RealEstate.ui.prospectus')}</h3>
                        <p class="inspect-placeholder-text">
                            ${T('RealEstate.ui.selectACompanyToTrade')}
                        </p>
                    </div>`;
            }

            const row = (label, value, valStyle = '') =>
                `<div class="inspect-spec-row"><span class="inspect-spec-label">${label}:</span><span class="inspect-spec-value" style="${valStyle}">${value}</span></div>`;

            const pnl = company.value - company.costBasis;
            const pnlColor = pnl >= 0 ? 'var(--text-success-active)' : 'var(--border-danger-active)';

            // Trade actions: buy lots, and sell lots when a position is held.
            const cmds = [];
            if (company.available > 0) {
                cmds.push({ label: T('RealEstate.ui.buy1'), action: "buy1" });
                cmds.push({ label: T('RealEstate.ui.buy10'), action: "buy10" });
                cmds.push({ label: T('RealEstate.ui.buy100'), action: "buy100" });
                cmds.push({ label: T('RealEstate.ui.buy1000'), action: "buy1000" });
                cmds.push({ label: T('RealEstate.ui.buy10000'), action: "buy10000" });
            }
            if (company.sharesOwned > 0) {
                cmds.push({ label: T('RealEstate.ui.sell1'), action: "sell1", danger: true });
                cmds.push({ label: T('RealEstate.ui.sell10'), action: "sell10", danger: true });
                cmds.push({ label: T('RealEstate.ui.sell100'), action: "sell100", danger: true });
                cmds.push({ label: T('RealEstate.ui.sell1000'), action: "sell1000", danger: true });
                cmds.push({ label: T('RealEstate.ui.sell10000'), action: "sell10000", danger: true });
                cmds.push({ label: T('RealEstate.ui.sellAll'), action: "sellAll", danger: true });
            }
            if (this._companyCommandIndex >= cmds.length) this._companyCommandIndex = Math.max(0, cmds.length - 1);

            const commandsHTML = cmds.map((cmd, cIdx) => {
                const isSel = cIdx === this._companyCommandIndex && this._dndFocusSection === 'commands';
                const mod = cmd.danger ? ' inspect-btn--danger' : '';
                return `<div class="inspect-btn${mod} focusable ${isSel ? 'selected' : ''}" tabindex="0" data-focus-key="re-co-cmd-${cmd.action}" onclick="${sref}.executeCompanyCommand('${cmd.action}')">${cmd.label}</div>`;
            }).join('');

            const desc = company.description;
            let ownedRows = '';
            if (company.sharesOwned > 0) {
                ownedRows = row(T('RealEstate.ui.sharesHeld'), company.sharesOwned.toLocaleString())
                    + row(T('RealEstate.ui.ownership'), `${company.ownershipPct.toFixed(2)}%`, 'color:var(--text-primary-hover);')
                    + row(T('RealEstate.ui.positionValue'), `€${Math.round(company.value / 100).toLocaleString()}`)
                    + row(T('RealEstate.ui.profitLoss'), `€${Math.round(pnl / 100).toLocaleString()}`, `color:${pnlColor};font-weight:bold;`);
            }

            return `
                <div class="item-inspect">
                    <h3 class="title estate-06">${company.name}</h3>
                    <div class="inspect-section-title">${T('RealEstate.ui.shareProspectus2')}</div>
                    ${row(T('RealEstate.ui.sector'), company.sectorLabel || company.sector)}
                    ${row(T('RealEstate.ui.sharePrice'), `€${company.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'color:var(--text-primary-hover);')}
                    ${row(T('RealEstate.ui.totalShares'), company.totalShares.toLocaleString())}
                    ${row(T('RealEstate.ui.available2'), company.available.toLocaleString())}
                    ${ownedRows}
                    ${desc ? `<div class="inspect-bullet-item estate-07">${desc}</div>` : ''}
                    <div class="inspect-actions estate-08">${commandsHTML}</div>
                </div>`;
        }

        // Leaving the registry: pop the scene, or close the OS window the app
        // is drawn in.
        dismiss() {
            if (this._isAppMode) {
                if (window.HypernetRealEstateApp) window.HypernetRealEstateApp.close();
                return;
            }
            this.popScene();
        }

        selectPropertyItem(index) {
            if (this._propertyListWindow) {
                if (index !== this._propertyListWindow.index()) this._residentPickerFor = null;
                this._propertyListWindow.select(index);
                this._dndFocusSection = 'list';
                SoundManager.playCursor();
                this.refreshUIRealEstateDOM();
            }
        }

        executeDeedCommand(action) {
            const property = this._propertyListWindow.property();
            if (!property) return;

            if (action === 'buy') {
                this.commandBuy();
            } else if (action === 'sell') {
                this.commandSell();
            } else if (action === 'rent') {
                this.commandRent();
            } else if (action === 'vacate') {
                this.commandVacate();
            } else if (action === 'let') {
                this.commandLetHouse(property);
            } else if (action === 'unlet') {
                this.commandStopLetting(property);
            } else if (action === 'manage') {
                this.commandManageShop();
                return;
            } else if (action === 'residents') {
                this._residentPickerFor = property.id;
                this._dndCommandIndex = 0;
                SoundManager.playOk();
            } else if (action === 'closeRes') {
                this._residentPickerFor = null;
                this._dndCommandIndex = 0;
                SoundManager.playCancel();
            } else if (action.indexOf('res:') === 0) {
                this.toggleResident(property, Number(action.slice(4)));
            } else if (action === 'info') {
                this.commandInfo();
                return; // Navigation will handle page transition
            } else if (action === 'back') {
                SoundManager.playCancel();
                this.dismiss();
                return;
            }
            this.refreshUIRealEstateDOM();
        }

        // Every button the deed page draws, in order. The keyboard walks the
        // same list (getActiveCommands), so the two can never disagree.
        deedCommands(property) {
            const commands = [];
            if (!property) return commands;
            if (this._residentPickerFor === property.id) return this.residentCommands(property);
            if (property.isOwned) {
                // A shop deed is worth more open than sold, so running it comes first.
                if (property.type === 'Shop') { // i18n-ignore: property type id
                    commands.push({ label: T('RealEstate.ui.manageShop'), action: 'manage' });
                }
                if (this.lodgingPlaceIdFor(property)) {
                    commands.push({ label: T('RealEstate.ui.assignResidents'), action: 'residents' });
                }
                if (property.normalHomeType === 'procedural') {
                    commands.push(property.isForRent
                        ? { label: T('RealEstate.ui.stopLetting'), action: 'unlet', secondary: true }
                        : { label: T('RealEstate.ui.letToTenants'), action: 'let' });
                }
                commands.push({
                    label: property.isNormalHome
                        ? T('RealEstate.ui.sellHome', { price: '€' + $realEstateManager.salePriceOf(property).toLocaleString() })
                        : T('RealEstate.ui.liquidateAsset'),
                    action: 'sell', danger: true,
                });
            } else if (property.isRentedByPlayer) {
                commands.push({ label: T('RealEstate.ui.vacateRental'), action: 'vacate', danger: true });
            } else if ($realEstateManager.isTakenByAnother(property.id)) {
                // Another playthrough of this world holds it: nothing to offer
                // but the news, so neither deed nor lease is put up for sale.
            } else {
                commands.push({ label: T('RealEstate.ui.acquireDeed'), action: 'buy' });
                commands.push({ label: T('RealEstate.ui.rent'), action: 'rent', secondary: true });
            }
            if ($realEstateManager.getActiveEffectsForLocation(property.location).length > 0) {
                commands.push({ label: T('RealEstate.ui.investigateMarketNews'), action: 'info', secondary: true });
            }
            return commands;
        }

        getActiveCommands(property) {
            return this.deedCommands(property).map(cmd => cmd.action);
        }

        // The PartyLodging place a deed is, or null when nobody can live in it:
        // a shop is a business and a workplace is not on this page at all.
        lodgingPlaceIdFor(property) {
            const PL = window.PartyLodging;
            if (!PL || !property || !property.isOwned) return null;
            let id = null;
            if (property.normalHomeType === 'residence') id = 'home:' + property.mapId;          // i18n-ignore: place id
            else if (property.normalHomeType === 'procedural') id = 'house:' + property.houseKey; // i18n-ignore: place id
            else if (!property.isNormalHome && property.type !== 'Shop') id = 'estate:' + property.id; // i18n-ignore: place id
            return id && PL.places().some(place => place.id === id) ? id : null;
        }

        // Every inactive party member, each a button that moves them in or,
        // for one already living here, back out to the halls.
        residentCommands(property) {
            const PL = window.PartyLodging;
            const placeId = this.lodgingPlaceIdFor(property);
            const out = [];
            if (PL && placeId) {
                PL.residents().forEach((person, idx) => {
                    const here = person.lodging === placeId;
                    out.push({
                        action: 'res:' + idx,
                        label: here
                            ? T('RealEstate.ui.residentHere', { name: person.name })
                            : T('RealEstate.ui.residentElsewhere', { name: person.name, place: PL.placeName(person.lodging) }),
                        secondary: !here,
                    });
                });
            }
            out.push({ label: T('RealEstate.ui.residentsDone'), action: 'closeRes', secondary: true });
            return out;
        }

        toggleResident(property, idx) {
            const PL = window.PartyLodging;
            const placeId = this.lodgingPlaceIdFor(property);
            const person = PL && placeId ? PL.residents()[idx] : null;
            if (!person) { SoundManager.playBuzzer(); return; }
            const ok = PL.assign(person.name, person.lodging === placeId ? PL.DEFAULT : placeId);
            if (ok) SoundManager.playOk(); else SoundManager.playBuzzer();
        }

        executeFocusedCommand() {
            const property = this._propertyListWindow.property();
            if (!property) return;
            const cmds = this.getActiveCommands(property);
            const action = cmds[this._dndCommandIndex];
            if (action) {
                this.executeDeedCommand(action);
            }
        }

        // --- Company view helpers ---

        viewModes() {
            return window.WorkplaceDeeds ? ['properties', 'companies', 'workplaces'] : ['properties', 'companies'];
        }

        switchView(mode) {
            if (this.viewModes().indexOf(mode) < 0) return;
            if (this._viewMode === mode) return;
            this._viewMode = mode;
            this._dndFocusSection = 'list';
            this._companyCommandIndex = 0;
            this._workplaceCommandIndex = 0;
            this._dndCommandIndex = 0;
            SoundManager.playCursor();
            this.refreshUIRealEstateDOM();
        }

        toggleView(dir) {
            const modes = this.viewModes();
            const at = Math.max(0, modes.indexOf(this._viewMode));
            const step = dir < 0 ? -1 : 1;
            this.switchView(modes[(at + step + modes.length) % modes.length]);
        }

        // --- Working places view (WORKPLACE DEEDS below) ---

        workplaceListing() {
            const WD = window.WorkplaceDeeds;
            const places = WD && typeof WD.listing === 'function' ? WD.listing() : [];
            if (!Number.isInteger(this._workplaceIndex)) this._workplaceIndex = 0;
            if (this._workplaceIndex >= places.length) this._workplaceIndex = Math.max(0, places.length - 1);
            return places;
        }

        wpEuro(gold) {
            return `€${(Math.round(Number(gold) || 0) / 100).toLocaleString()}`;
        }

        buildWorkplaceStatsHTML(places, cash) {
            const owned = places.filter(p => p.status === 'owned');
            const weekly = owned.reduce((s, p) => s + p.projected.profit, 0) * window.WorkplaceDeeds.PAYOUT_DAYS;
            return `
                <div class="re-stat">
                    <span class="re-stat-lbl">${T('RealEstate.ui.liquidFunds')}</span>
                    <span class="re-stat-val" id="re-cash">€${cash.toLocaleString()}</span>
                </div>
                <div class="re-stat estate-09">
                    <span class="re-stat-lbl">${T('RealEstate.ui.businessesHeld')}</span>
                    <span class="re-stat-val estate-10" id="re-wp-owned">${owned.length} / ${places.length}</span>
                </div>
                <div class="re-stat estate-11">
                    <span class="re-stat-lbl">${T('RealEstate.ui.weeklyYield')}</span>
                    <span class="re-stat-val" id="re-wp-yield">${this.wpEuro(weekly)}</span>
                </div>`;
        }

        workplaceStatus(place) {
            if (place.status === 'owned') return { label: T('RealEstate.ui.owned'), color: 'var(--text-success-active)' };
            if (place.status === 'taken') return { label: T('RealEstate.ui.taken'), color: 'var(--text-disabled)' };
            return { label: T('RealEstate.ui.available'), color: 'var(--text-primary-hover)' };
        }

        buildWorkplaceListHTML(places, selectedIndex) {
            const sref = this.sceneRef();
            return places.map((p, idx) => {
                const st = this.workplaceStatus(p);
                return `
                    <div class="item-slot focusable ${idx === selectedIndex ? 'selected' : ''}" tabindex="0" data-focus-key="re-wp-${p.mapId}" onclick="${sref}.selectWorkplaceItem(${idx})">
                        <div class="item-slot-info">
                            <div class="item-slot-name">${p.name}</div>
                            <div class="item-slot-meta"><span>${p.place ? p.place + ' • ' : ''}${this.wpEuro(p.price)}</span></div>
                        </div>
                        <div class="estate-01">
                            <span class="estate-02" style="color:${st.color}">${st.label}</span>
                        </div>
                    </div>`;
            }).join('');
        }

        workplaceJobNames(jobIds) {
            const WS = window.WorkSystem;
            return (jobIds || []).map(id => {
                const job = WS && Array.isArray(WS.Jobs) ? WS.Jobs.find(j => j && j.id === id) : null;
                return job && typeof WS.jobName === 'function' ? WS.jobName(job) : String(id);
            }).join(', ');
        }

        // Commands for the selected working place, in the order they are drawn.
        getActiveWorkplaceCommands(place) {
            if (!place) return [];
            if (place.status === 'owned') return ['sell'];
            if (place.status === 'available') return ['buy'];
            return [];
        }

        buildWorkplaceDeedHTML(place) {
            if (!place) {
                return `
                    <div class="item-inspect item-inspect--empty estate-04">
                        <h3 class="title">${T('RealEstate.ui.businessDeed')}</h3>
                        <p class="inspect-placeholder-text">${T('RealEstate.ui.selectAWorkplace')}</p>
                    </div>`;
            }
            const WD = window.WorkplaceDeeds;
            const sref = this.sceneRef();
            const row = (label, value, valStyle = '') =>
                `<div class="inspect-spec-row"><span class="inspect-spec-label">${label}:</span><span class="inspect-spec-value" style="${valStyle}">${value}</span></div>`;
            const pnl = (v) => `color:${v >= 0 ? 'var(--text-success-active)' : 'var(--border-danger-active)'};`;
            const proj = place.projected;
            const rep = place.status === 'owned' ? WD.report(place.mapId) : null;

            const cmds = this.getActiveWorkplaceCommands(place).map(action => action === 'sell'
                ? { action, label: T('Assets.workplace.sell', { price: this.wpEuro(rep ? rep.salePrice : 0) }), danger: true }
                : { action, label: T('Assets.workplace.buy', { price: this.wpEuro(place.price) }) });
            if (this._workplaceCommandIndex >= cmds.length) this._workplaceCommandIndex = Math.max(0, cmds.length - 1);
            const commandsHTML = cmds.map((cmd, cIdx) => {
                const isSel = cIdx === this._workplaceCommandIndex && this._dndFocusSection === 'commands';
                return `<div class="inspect-btn${cmd.danger ? ' inspect-btn--danger' : ''} focusable ${isSel ? 'selected' : ''}" tabindex="0" data-focus-key="re-wp-cmd-${cmd.action}" onclick="${sref}.executeWorkplaceCommand('${cmd.action}')">${cmd.label}</div>`;
            }).join('');

            let ownedRows = '';
            if (rep) {
                const totals = rep.deed.totals || { days: 0, profit: 0 };
                ownedRows = row(T('Assets.workplace.nextPayout'), T('Assets.workplace.inDays', { days: rep.nextPayout }))
                    + row(T('Assets.workplace.totalProfit', { days: totals.days }), this.wpEuro(totals.profit), pnl(totals.profit))
                    + row(T('Assets.ui.boughtValue'), this.wpEuro(rep.deed.price))
                    + row(T('Assets.workplace.saleValue'), this.wpEuro(rep.salePrice), 'color:var(--text-primary-hover);');
            } else if (place.status === 'taken') {
                ownedRows = row(T('RealEstate.ui.status'), T('RealEstate.ui.taken'), 'color:var(--text-disabled);');
            }

            return `
                <div class="item-inspect">
                    <h3 class="title estate-06">${place.name}</h3>
                    <div class="inspect-section-title">${T('RealEstate.ui.businessDeed2')}</div>
                    ${place.place ? row(t('location'), place.place) : ''}
                    ${row(T('Assets.workplace.trades'), this.workplaceJobNames(place.jobs) || '-')}
                    ${row(T('Assets.workplace.askingPrice'), this.wpEuro(place.price), 'color:var(--text-primary-hover);')}
                    ${row(T('Assets.workplace.staffed'), `${proj.shifts} / ${place.positions}`)}
                    ${row(T('Assets.workplace.townWealth'), `x${place.wealth.toFixed(2)}`)}
                    ${row(T('Assets.workplace.dailyProfit'), this.wpEuro(proj.profit), pnl(proj.profit))}
                    ${row(T('RealEstate.ui.weeklyPayout'), this.wpEuro(proj.profit * WD.PAYOUT_DAYS), pnl(proj.profit) + 'font-weight:bold;')}
                    ${ownedRows}
                    <div class="inspect-actions estate-08">${commandsHTML}</div>
                </div>`;
        }

        refreshWorkplacesInPlace() {
            const cash = Number(($gameParty.gold() / 100).toFixed(2));
            const places = this.workplaceListing();
            const statsEl = this._dndContainer.querySelector('.re-stats');
            if (statsEl) statsEl.innerHTML = this.buildWorkplaceStatsHTML(places, cash);
            const listEl = this._dndContainer.querySelector('#estate-list');
            if (listEl) {
                const key = this.currentListDataKey();
                if (this._reListDataKey !== key || listEl.children.length !== places.length) {
                    this._reListDataKey = key;
                    listEl.innerHTML = this.buildWorkplaceListHTML(places, this._workplaceIndex);
                } else {
                    listEl.querySelectorAll('.item-slot').forEach((slot, idx) => {
                        slot.classList.toggle('selected', idx === this._workplaceIndex);
                    });
                }
            }
            const deedWrap = this._dndContainer.querySelector('#re-deed-wrap');
            if (deedWrap) deedWrap.innerHTML = this.buildWorkplaceDeedHTML(places[this._workplaceIndex] || null);
        }

        selectWorkplaceItem(index) {
            this._workplaceIndex = index;
            this._dndFocusSection = 'list';
            this._workplaceCommandIndex = 0;
            SoundManager.playCursor();
            this.refreshUIRealEstateDOM();
        }

        executeWorkplaceCommand(action) {
            const WD = window.WorkplaceDeeds;
            const place = this.workplaceListing()[this._workplaceIndex];
            if (!WD || !place) return;
            const result = action === 'buy' ? WD.buy(place.mapId) : action === 'sell' ? WD.sell(place.mapId) : null;
            if (result && result.ok) {
                SoundManager.playShop();
                const args = { name: place.name, price: this.wpEuro(result.price) };
                window.ParchmentToast?.show?.(action === 'buy'
                    ? T('Assets.workplace.bought', args) : T('Assets.workplace.sold', args));
            } else {
                SoundManager.playBuzzer();
                if (result && action === 'buy') {
                    window.ParchmentToast?.show?.(T(result.reason === 'funds'
                        ? 'Assets.workplace.cannotAfford' : 'Assets.workplace.notForSale'));
                }
            }
            this._dndFocusSection = 'list';
            this._workplaceCommandIndex = 0;
            this.refreshUIRealEstateDOM();
        }

        updateWorkplaceNav() {
            let moved = false;
            const places = this.workplaceListing();
            const place = places[this._workplaceIndex] || null;
            if (this._dndFocusSection === 'list') {
                const max = places.length;
                if (Input.isRepeated('down')) {
                    if (max > 0) { this._workplaceIndex = (this._workplaceIndex + 1) % max; moved = true; }
                } else if (Input.isRepeated('up')) {
                    if (max > 0) { this._workplaceIndex = (this._workplaceIndex - 1 + max) % max; moved = true; }
                } else if (Input.isRepeated('right') || Input.isTriggered('ok')) {
                    if (this.getActiveWorkplaceCommands(place).length > 0) {
                        this._dndFocusSection = 'commands'; this._workplaceCommandIndex = 0; moved = true;
                    }
                }
            } else if (this._dndFocusSection === 'commands') {
                const cmds = this.getActiveWorkplaceCommands(place);
                const max = cmds.length;
                if (Input.isRepeated('down')) {
                    if (max > 0) { this._workplaceCommandIndex = (this._workplaceCommandIndex + 1) % max; moved = true; }
                } else if (Input.isRepeated('up')) {
                    if (max > 0) { this._workplaceCommandIndex = (this._workplaceCommandIndex - 1 + max) % max; moved = true; }
                } else if (Input.isRepeated('left')) {
                    this._dndFocusSection = 'list'; moved = true;
                } else if (Input.isTriggered('ok')) {
                    const action = cmds[this._workplaceCommandIndex];
                    if (action) this.executeWorkplaceCommand(action);
                }
            }
            return moved;
        }

        selectCompanyItem(index) {
            const companies = $realEstateManager.getCompanies();
            if (index < 0 || index >= companies.length) return;
            this._companyIndex = index;
            this._dndFocusSection = 'list';
            this._companyCommandIndex = 0;
            SoundManager.playCursor();
            this.refreshUIRealEstateDOM();
        }

        selectedCompany() {
            return $realEstateManager.getCompanies()[this._companyIndex] || null;
        }

        // Trade-button actions available for the selected company (must mirror the
        // order of buttons rendered in buildProspectusHTML for keyboard nav).
        getActiveCompanyCommands(company) {
            const cmds = [];
            if (!company) return cmds;
            if (company.available > 0) cmds.push('buy1', 'buy10', 'buy100', 'buy1000', 'buy10000');
            if (company.sharesOwned > 0) cmds.push('sell1', 'sell10', 'sell100', 'sell1000', 'sell10000', 'sellAll');
            return cmds;
        }

        executeCompanyCommand(action) {
            const company = this.selectedCompany();
            if (!company) return;
            let ok = false;
            if (action === 'buy1') ok = $realEstateManager.buyShares(company.key, 1);
            else if (action === 'buy10') ok = $realEstateManager.buyShares(company.key, 10);
            else if (action === 'buy100') ok = $realEstateManager.buyShares(company.key, 100);
            else if (action === 'buy1000') ok = $realEstateManager.buyShares(company.key, 1000);
            else if (action === 'buy10000') ok = $realEstateManager.buyShares(company.key, 10000);
            else if (action === 'sell1') ok = $realEstateManager.sellShares(company.key, 1);
            else if (action === 'sell10') ok = $realEstateManager.sellShares(company.key, 10);
            else if (action === 'sell100') ok = $realEstateManager.sellShares(company.key, 100);
            else if (action === 'sell1000') ok = $realEstateManager.sellShares(company.key, 1000);
            else if (action === 'sell10000') ok = $realEstateManager.sellShares(company.key, 10000);
            else if (action === 'sellAll') ok = $realEstateManager.sellShares(company.key, company.sharesOwned);

            if (ok) SoundManager.playShop();
            else SoundManager.playBuzzer();
            this.refreshUIRealEstateDOM();
        }

        stepOut() {
            if (this._residentPickerFor) {
                this._residentPickerFor = null;
                this._dndCommandIndex = 0;
                this.refreshUIRealEstateDOM();
                return;
            }
            if (this._dndFocusSection === 'commands') {
                this._dndFocusSection = 'list';
                this.refreshUIRealEstateDOM();
                return;
            }
            this.dismiss();
        }

        executeFocusedCompanyCommand() {
            const company = this.selectedCompany();
            const cmds = this.getActiveCompanyCommands(company);
            const action = cmds[this._companyCommandIndex];
            if (action) this.executeCompanyCommand(action);
        }

        update() {
            // In app mode the OS focus ring walks every '.focusable' control;
            // reading Input here too would double-process every keypress.
            if (this._isAppMode) return;
            super.update();

            if (this._dndContainer) {
                // L1/R1 (Q/W, Tab) cycle the property registry, the company
                // exchange and the working places, as tabs do on every menu. The clickable
                // tabs are the primary, always-working control.
                const tabDir = window.UINav ? UINav.tabDir() : 0;
                if (tabDir) {
                    this.toggleView(tabDir);
                    return;
                }

                // Cancel (B, Esc, right click) steps out one level: out of the
                // command column back to the list, and only from the list does
                // it close the market.
                if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    SoundManager.playCancel();
                    this.stepOut();
                    return;
                }

                const moved = this._viewMode === 'workplaces'
                    ? this.updateWorkplaceNav()
                    : this._viewMode === 'companies'
                    ? this.updateCompanyNav()
                    : this.updatePropertyNav();

                if (moved) {
                    this.refreshUIRealEstateDOM();
                }
            }
        }

        updatePropertyNav() {
            let moved = false;
            const property = this._propertyListWindow.property();

            if (this._dndFocusSection === 'list') {
                if (Input.isRepeated('down')) {
                    this._residentPickerFor = null;
                    const currentIndex = this._propertyListWindow.index();
                    const maxItems = this._propertyListWindow.maxItems();
                    if (maxItems > 0) {
                        this._propertyListWindow.select(currentIndex < maxItems - 1 ? currentIndex + 1 : 0);
                        moved = true;
                    }
                } else if (Input.isRepeated('up')) {
                    this._residentPickerFor = null;
                    const currentIndex = this._propertyListWindow.index();
                    const maxItems = this._propertyListWindow.maxItems();
                    if (maxItems > 0) {
                        this._propertyListWindow.select(currentIndex > 0 ? currentIndex - 1 : maxItems - 1);
                        moved = true;
                    }
                } else if (Input.isRepeated('right') || Input.isTriggered('ok')) {
                    if (property && this.getActiveCommands(property).length > 0) {
                        this._dndFocusSection = 'commands';
                        this._dndCommandIndex = 0;
                        moved = true;
                    }
                }
            } else if (this._dndFocusSection === 'commands') {
                const cmds = property ? this.getActiveCommands(property) : [];
                const maxCmds = cmds.length;
                if (Input.isRepeated('down')) {
                    if (maxCmds > 0) { this._dndCommandIndex = (this._dndCommandIndex + 1) % maxCmds; moved = true; }
                } else if (Input.isRepeated('up')) {
                    if (maxCmds > 0) { this._dndCommandIndex = (this._dndCommandIndex - 1 + maxCmds) % maxCmds; moved = true; }
                } else if (Input.isRepeated('left')) {
                    this._dndFocusSection = 'list'; moved = true;
                } else if (Input.isTriggered('ok')) {
                    this.executeFocusedCommand();
                }
            }
            return moved;
        }

        updateCompanyNav() {
            let moved = false;
            const companies = $realEstateManager.getCompanies();
            const company = companies[this._companyIndex] || null;

            if (this._dndFocusSection === 'list') {
                const maxItems = companies.length;
                if (Input.isRepeated('down')) {
                    if (maxItems > 0) { this._companyIndex = (this._companyIndex + 1) % maxItems; moved = true; }
                } else if (Input.isRepeated('up')) {
                    if (maxItems > 0) { this._companyIndex = (this._companyIndex - 1 + maxItems) % maxItems; moved = true; }
                } else if (Input.isRepeated('right') || Input.isTriggered('ok')) {
                    if (company && this.getActiveCompanyCommands(company).length > 0) {
                        this._dndFocusSection = 'commands'; this._companyCommandIndex = 0; moved = true;
                    }
                }
            } else if (this._dndFocusSection === 'commands') {
                const cmds = this.getActiveCompanyCommands(company);
                const maxCmds = cmds.length;
                if (Input.isRepeated('down')) {
                    if (maxCmds > 0) { this._companyCommandIndex = (this._companyCommandIndex + 1) % maxCmds; moved = true; }
                } else if (Input.isRepeated('up')) {
                    if (maxCmds > 0) { this._companyCommandIndex = (this._companyCommandIndex - 1 + maxCmds) % maxCmds; moved = true; }
                } else if (Input.isRepeated('left')) {
                    this._dndFocusSection = 'list'; moved = true;
                } else if (Input.isTriggered('ok')) {
                    this.executeFocusedCompanyCommand();
                }
            }
            return moved;
        }

    }

    // Window_PropertyList
    class Window_PropertyList extends Window_Selectable {
        initialize(rect) {
            super.initialize(rect);
            this._data = [];
            this._detailsWindow = null;
            this.refresh();
            this.select(0);
        }

        setDetailsWindow(detailsWindow) {
            this._detailsWindow = detailsWindow;
            this.updateDetails();
        }

        maxItems() {
            return this._data ? this._data.length : 0;
        }

        property() {
            return this._data && this.index() >= 0 ? this._data[this.index()] : null;
        }

        makeItemList() {
            ensureRealEstateManager();
            this._data = $realEstateManager ? $realEstateManager.getAllProperties() : [];
        }

        drawItem(index) {
            const property = this._data[index];
            if (property) {
                const rect = this.itemLineRect(index);
                this.resetTextColor();
                if (property.isOwned) {
                    this.changeTextColor(ColorManager.powerUpColor());
                }
                this.drawText(property.name, rect.x, rect.y, rect.width - 60);
                this.drawText(this.getStars(property.stars), rect.x + rect.width - 60, rect.y, 60);
            }
        }

        getStars(rating) {
            return '★'.repeat(rating) + '☆'.repeat(5 - rating);
        }

        refresh() {
            this.makeItemList();
            super.refresh();
        }

        updateHelp() {
            if (this._helpWindow && this.property()) {
                const property = this.property();
                const status = property.isOwned ? t('owned') : t('available');
                this._helpWindow.setText(`${property.location} - ${status}`);
            }
        }

        select(index) {
            super.select(index);
            this.updateDetails();
        }

        updateDetails() {
            if (this._detailsWindow) {
                this._detailsWindow.setProperty(this.property());
            }
        }
    }

    // Window_PropertyDetails
    class Window_PropertyDetails extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._property = null;
        }

        setProperty(property) {
            if (this._property !== property) {
                this._property = property;
                this.refresh();
            }
        }

        refresh() {
            this.contents.clear();
            if (this._property) {
                this.drawPropertyDetails();
            }
        }

        drawPropertyDetails() {
            const lineHeight = this.lineHeight();
            const property = this._property;
            let y = 0;

            // Property name and type
            this.drawText(property.name, 0, y, this.innerWidth, 'center');
            y += lineHeight;

            this.drawText(`${t('type')}: ${(t('propertyTypes') && t('propertyTypes')[property.type]) || property.type}`, 0, y, this.innerWidth);
            y += lineHeight;

            // Location
            this.drawText(`${t('location')}: ${property.location}`, 0, y, this.innerWidth);
            y += lineHeight;

            // Stars
            this.drawText(`${t('rating')}: ` + this.getStars(property.stars), 0, y, this.innerWidth);
            y += lineHeight;

            // Price with market effects
            const effectivePrice = $realEstateManager.calculateEffectivePrice(property);
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(`${t('price')}:`, 0, y, 120);
            this.resetTextColor();
            if (effectivePrice !== property.price) {
                this.drawText(`€${effectivePrice.toLocaleString()}`, 120, y, this.innerWidth - 240);
                this.changeTextColor(effectivePrice > property.price ? ColorManager.powerUpColor() : ColorManager.deathColor());
                const percentChange = Math.round(((effectivePrice - property.price) / property.price) * 100);
                this.drawText(`(${percentChange > 0 ? '+' : ''}${percentChange}%)`, this.innerWidth - 120, y, 120, 'right');
            } else {
                this.drawText(`€${property.price.toLocaleString()}`, 120, y, this.innerWidth - 120);
            }
            y += lineHeight;

            // Occupancy
            if (property.isOwned) {
                if (property.isNormalHome) {
                    if (property.resident) {
                        this.changeTextColor(ColorManager.systemColor());
                        this.drawText(`${(typeof T === 'function' && T.has && T.has('Assets.ui.resident') ? T('Assets.ui.resident') : 'Resident')}:`, 0, y, 120);
                        this.resetTextColor();
                        this.drawText(property.resident, 120, y, this.innerWidth - 120);
                        y += lineHeight;
                    } else if (property.normalHomeType === 'procedural') {
                        this.changeTextColor(ColorManager.systemColor());
                        this.drawText(`${(typeof T === 'function' && T.has && T.has('Assets.ui.coordinates') ? T('Assets.ui.coordinates') : 'Coordinates')}:`, 0, y, 120);
                        this.resetTextColor();
                        this.drawText(property.entranceCoords || '-', 120, y, this.innerWidth - 120);
                        y += lineHeight;
                    }
                } else {
                    this.changeTextColor(ColorManager.systemColor());
                    this.drawText(`${t('occupancy')}:`, 0, y, 120);
                    this.resetTextColor();
                    this.drawText(`${property.currentOccupants}/${property.maxOccupants}`, 120, y, this.innerWidth - 120);
                    y += lineHeight;

                    // Daily income
                    this.changeTextColor(ColorManager.systemColor());
                    this.drawText(`${t('dailyIncome')}:`, 0, y, 120);
                    this.resetTextColor();
                    const dailyIncome = property.currentOccupants * property.rentPerOccupant;
                    this.drawText(`€${dailyIncome.toLocaleString()}`, 120, y, this.innerWidth - 120);
                    y += lineHeight;
                }
            }

            // Market trend and active effects
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(`${t('market')}:`, 0, y, 120);
            const trend = property.marketTrend;
            const effects = $realEstateManager.getActiveEffectsForLocation(property.location);

            if (effects.length > 0) {
                this.changeTextColor(ColorManager.textColor(17)); // Light blue
                this.drawText(`${effects.length} ${t('activeEvents')}`, 120, y, this.innerWidth - 120);
            } else if (trend > 0.5) {
                this.changeTextColor(ColorManager.powerUpColor());
                this.drawText(t('hot'), 120, y, this.innerWidth - 120);
            } else if (trend < -0.5) {
                this.changeTextColor(ColorManager.deathColor());
                this.drawText(t('cold'), 120, y, this.innerWidth - 120);
            } else {
                this.resetTextColor();
                this.drawText(t('stable'), 120, y, this.innerWidth - 120);
            }
        }

        getStars(rating) {
            return '★'.repeat(rating) + '☆'.repeat(5 - rating);
        }
    }

    // Window_PropertyCommand
    class Window_PropertyCommand extends Window_HorzCommand {
        initialize(rect) {
            super.initialize(rect);
            this._property = null;
        }

        setProperty(property) {
            this._property = property;
            this.refresh();
        }

        makeCommandList() {
            if (this._property) {
                if (this._property.isOwned) {
                    this.addCommand(t('sell'), 'sell');
                } else if (!($realEstateManager &&
                        $realEstateManager.isTakenByAnother(this._property.id))) {
                    this.addCommand(t('buy'), 'buy');
                }

                if ($realEstateManager) {
                    const effects = $realEstateManager.getActiveEffectsForLocation(this._property.location);
                    if (effects.length > 0) {
                        this.addCommand(t('info'), 'info');
                    }
                }
            }
        }

        maxCols() {
            if (this._property && $realEstateManager) {
                const effects = $realEstateManager.getActiveEffectsForLocation(this._property.location);
                const baseCommands = this._property.isNormalHome ? 0 : (this._property.isOwned ? 2 : 1);
                return Math.max(1, effects.length > 0 ? baseCommands + 1 : baseCommands);
            }
            return 1;
        }
    }

    const _Scene_RealEstate_start = Scene_RealEstate.prototype.start;
    Scene_RealEstate.prototype.start = function () {
        ensureRealEstateManager();
        _Scene_RealEstate_start.call(this);
    };

    // Global instance
    let $realEstateManager = null;

    // Ensure Real Estate Manager exists
    function ensureRealEstateManager() {
        if (!$realEstateManager) {
            $realEstateManager = new RealEstateManager();
            $realEstateManager.load();
        }
    }


    // Drive daily rent collection / market updates off the in-game clock.
    // Detects a new day by comparing the date portion (day/month/year) of the
    // TimeDateSystem date string (Variable 113). Runs once per real day change.
    // Cache the parsed day key against the raw date string so the per-frame
    // hook skips the split/slice/join allocations while the date is unchanged.
    let _realEstateRawDate = null;
    let _realEstateDayKeyCache = '01 JAN 2001';
    function realEstateDayKey() {
        const dateStr = (typeof $gameVariables !== 'undefined' && $gameVariables ? $gameVariables.value(113) : null) || '01 JAN 2001 12:00';
        if (dateStr === _realEstateRawDate) return _realEstateDayKeyCache;
        _realEstateRawDate = dateStr;
        const parts = String(dateStr).split(' ').filter(Boolean);
        // First three tokens identify the calendar day: "01 JAN 2001"
        _realEstateDayKeyCache = parts.slice(0, 3).join(' ');
        return _realEstateDayKeyCache;
    }

    // Month key ("JAN 2001") derived from the day key by dropping the day
    // token - reuses realEstateDayKey()'s cache instead of re-parsing.
    function realEstateMonthKey() {
        const dayKey = realEstateDayKey();
        const sp = dayKey.indexOf(' ');
        return sp === -1 ? dayKey : dayKey.slice(sp + 1);
    }

    let _realEstateFrameTick = 0;
    const _Scene_Map_update_RealEstate = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_RealEstate.call(this);
        if (!$realEstateManager) return;
        // The in-game day changes far slower than once a second; throttle the
        // day-boundary check to every 60 frames.
        if (++_realEstateFrameTick < 60) return;
        _realEstateFrameTick = 0;
        const key = realEstateDayKey();
        if ($gameSystem._realEstateLastDayKey === undefined) {
            $gameSystem._realEstateLastDayKey = key;
            $gameSystem._realEstateLastMonthKey = realEstateMonthKey();
            return;
        }
        if ($gameSystem._realEstateLastDayKey !== key) {
            $gameSystem._realEstateLastDayKey = key;
            $realEstateManager.processDailyUpdate();
        }
        const monthKey = realEstateMonthKey();
        if ($gameSystem._realEstateLastMonthKey !== monthKey) {
            $gameSystem._realEstateLastMonthKey = monthKey;
            $realEstateManager.processMonthlyRent();
        }
    };


    // ========================================================================
    // HypernetRealEstateApp - the registry as a window on the hyperdeck desktop
    // ========================================================================
    window.HypernetRealEstateApp = {
        appInstance: null,
        win: null,
        launch: function () {
            if (!window.HypernetWindowManager) {
                SceneManager.push(Scene_RealEstate);
                return;
            }
            ensureRealEstateManager();
            if (this.win && document.getElementById('app-real-estate')) {
                window.HypernetWindowManager.bringToFront(this.win);
                return;
            }
            this.win = window.HypernetWindowManager.createWindow({
                id: 'app-real-estate',
                title: T('RealEstate.ui.appName'),
                icon: 84,
                width: 1000,
                height: 660,
                contentHTML: '<div id="real-estate-content"></div>'
            });
            this.appInstance = new Scene_RealEstate();
            this.appInstance._isAppMode = true;
            // A registry that cannot build itself takes its own window down
            // rather than leaving a blank one on the desktop with a half made
            // scene behind it that faults again on every repaint.
            try {
                this.appInstance.create();
            } catch (e) {
                console.error('RealEstateMarket: the registry failed to open.', e);
                this.appInstance = null;
                const win = this.win;
                this.win = null;
                if (win && window.HypernetWindowManager) window.HypernetWindowManager.closeWindow(win);
                return;
            }
            this.win.addEventListener('hypernet-closed', () => {
                if (this.appInstance) {
                    this.appInstance.terminate();
                    this.appInstance = null;
                }
                this.win = null;
            });
        },
        close: function () {
            if (this.win && window.HypernetOS && window.HypernetOS.WindowManager) {
                window.HypernetOS.WindowManager.closeWindow(this.win);
            } else if (this.win && window.HypernetWindowManager && window.HypernetWindowManager.closeWindow) {
                window.HypernetWindowManager.closeWindow(this.win);
            }
        },
        update: function () {
            // Prices and rents move on the world clock, so repaint the open
            // window whenever the day the registry ran on has rolled over.
            if (!this.appInstance || !this.win || !$realEstateManager) return;
            // The desktop can take the window away without telling us (turning
            // the machine off used to do exactly that): drop the handles rather
            // than keep repainting a node nobody can see.
            if (!this.win.isConnected) {
                this.appInstance.terminate();
                this.appInstance = null;
                this.win = null;
                return;
            }
            const key = realEstateDayKey();
            if (this._paintedDayKey !== key) {
                this._paintedDayKey = key;
                this.appInstance.refreshUIRealEstateDOM();
            }
        }
    };

    function openRealEstate() {
        ensureRealEstateManager();
        if (window.HypernetOS && SceneManager._scene instanceof Scene_HypernetOS) {
            window.HypernetRealEstateApp.launch();
        } else {
            SceneManager.push(Scene_RealEstate);
        }
    }

    // Plugin commands
    PluginManager.registerCommand(pluginName, 'openRealEstateMenu', args => {
        openRealEstate();
    });

    function registerRealEstateApp() {
        if (!window.HypernetOS) return false;
        window.HypernetOS.registerApp({
            id: 'app-real-estate',
            name: T('RealEstate.ui.appName'),
            icon: 84,
            launchFn: function () {
                ensureRealEstateManager();
                if (window.HypernetWindowManager) window.HypernetRealEstateApp.launch();
                else SceneManager.push(Scene_RealEstate);
            },
            desktopShortcut: true
        });
        return true;
    }

    if (!registerRealEstateApp()) {
        const _Scene_Boot_create_RealEstate = Scene_Boot.prototype.create;
        Scene_Boot.prototype.create = function () {
            _Scene_Boot_create_RealEstate.call(this);
            registerRealEstateApp();
        };
    }


    PluginManager.registerCommand(pluginName, 'checkDailyIncome', args => {
        ensureRealEstateManager();
        const income = Math.round($realEstateManager.calculateDailyIncome() * 100) / 100;
        const goldIncome = Math.round(income * 100);
        if (window.ParchmentToast) {
          window.ParchmentToast.report([
            t('dailyIncomeMsg', { income: income, gold: goldIncome }),
            t('propertiesOwnedMsg', { count: $realEstateManager.getOwnedCount() })
          ], {
            severity: 'info'
          });
        }

    });



    PluginManager.registerCommand(pluginName, 'forceMarketUpdate', args => {
        ensureRealEstateManager();
        $realEstateManager.processDailyUpdate();
        if (window.ParchmentToast) {
          window.ParchmentToast.show(t('marketUpdatedMsg'), {
            severity: 'info'
          });
        }
    });

    PluginManager.registerCommand(pluginName, 'registerDestination', args => {
        ensureRealEstateManager();
        $realEstateManager.registerDestination(String(args.key || '').trim(), Number(args.value) || 0);
    });

    PluginManager.registerCommand(pluginName, 'registerCompany', args => {
        ensureRealEstateManager();
        const key = String(args.key || '').trim();
        if (!key) return;
        $realEstateManager.registerCompany(key, {
            name: args.name || key,
            sector: args.sector || 'Misc',  // i18n-ignore  sector id
            sharePrice: Number(args.sharePrice) || 50,
            totalShares: Number(args.totalShares) || 100000,
            color: args.color || undefined
        });
    });

    // Public API for other systems (character creation, Assets pockets, events).
    // Every entry ensures the manager exists, then delegates to it.
    window.AssetRegistry = {
        // Whether the register is already standing. Systems that poll it on a
        // timer (the stock terminal prices every couple of seconds) ask first,
        // so a background tick never builds the whole property market for them.
        isReady() { return !!$realEstateManager; },
        // Market deeds the party holds that somebody can live in: every owned
        // property but a shop (PartyLodging sends inactive members there).
        getOwnedEstateHomes() {
            ensureRealEstateManager();
            return $realEstateManager.properties.filter(p => p && p.isOwned && p.type !== 'Shop'); // i18n-ignore: property type id
        },
        registerCompany(key, opts) { ensureRealEstateManager(); return $realEstateManager.registerCompany(key, opts || {}); },
        registerDestination(key, valueEuros) { ensureRealEstateManager(); return $realEstateManager.registerDestination(key, valueEuros); },
        giveShares(key, count) { ensureRealEstateManager(); return $realEstateManager.giveShares(key, count); },
        buyShares(key, count) { ensureRealEstateManager(); return $realEstateManager.buyShares(key, count); },
        sellShares(key, count) { ensureRealEstateManager(); return $realEstateManager.sellShares(key, count); },
        getCompanies() { ensureRealEstateManager(); return $realEstateManager.getCompanies(); },
        getCompany(key) { ensureRealEstateManager(); return $realEstateManager.getCompany(key); },
        getPosition(key) { ensureRealEstateManager(); return $realEstateManager.getPosition(key); },
        setPosition(key, shares, costBasisGold) { ensureRealEstateManager(); return $realEstateManager.setPosition(key, shares, costBasisGold); },
        setCompanyPrice(key, priceEuros) { ensureRealEstateManager(); return $realEstateManager.setCompanyPrice(key, priceEuros); },
        // Companies with a non-zero position, for the Assets pockets.
        getHoldings() { ensureRealEstateManager(); return $realEstateManager.getCompanies().filter(c => c.sharesOwned > 0); },
        getOwnedPlaces() { ensureRealEstateManager(); return $realEstateManager.getOwnedDestinations(); },
        getAllProperties() { ensureRealEstateManager(); return $realEstateManager.getAllProperties(); },
        getNormalHomes() { ensureRealEstateManager(); return $realEstateManager.getNormalHomes(); },
        getOwnedCount() { ensureRealEstateManager(); return $realEstateManager.getOwnedCount(); }
    };


    // Save/Load
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        if ($realEstateManager) {
            $realEstateManager.save();
        }
        return contents;
    };
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        // Don't automatically create manager - let ensureRealEstateManager() handle it
        $realEstateManager = null;
    };

    // Export Scene for compatibility
    window.Scene_RealEstate = Scene_RealEstate;

})();
//=============================================================================
// WORKPLACE DEEDS: buying the business the party is standing in
//=============================================================================
// A map that js/db/WorldGen/MapJobs.json names as a workplace can be bought
// from the Assets menu while the party stands on it, or from anywhere on the
// Real Estate Board's "Working places" tab when MapJobs says it is an
// interior (its "env", stamped by tools/build/gen_map_jobs.js). The staff
// JobShiftManager deals to it keep working their shifts; each day a shift is
// staffed, the takings of that shift less the wage of whoever worked it are
// the party's, paid out once a week (PAYOUT_DAYS).
//
// A deed is sold back from either menu for SALE_RATE of its current price
// (narrowed by Real Estate Appraisal, as a house sale is), with the days
// since the last payout paid first.
//
// What can be bought:
//   - an authored map (a numeric MapJobs key) with at least one job
//   - never a map tagged <Exterior>: open ground is nobody's to sell
//   - never an abandoned building (NPCResidents.json __maps[id].abandoned):
//     nobody trades there, so there is no business to buy
//   - never twice, and never one another savegame of this world already holds
// A workplace inside the Omega Tower or on a dungeon floor IS for sale when it
// is an interior with a trade: its build rights stay Free (the tag decides
// that), but its takings are as real as anybody's.
//
// Ownership follows the real estate rule (RealEstateMarket above): WHOSE the
// deed is lives in this savegame ($gameSystem._workplaceDeeds), and the world
// is told only that the business is off the market, through the same register
// the houses use (_realEstateTaken, market.json), keyed "workplace:<mapId>".
//
// Buying a workplace:
//   - makes its <BuildRights: Owner> ground the party's to build on
//     (FurnitureSystem.isIllegalBuildHere asks ownsHere)
//   - makes its containers the party's (ContainerSystem partyOwnsHere)
//   - does NOT make its people or its counters fair game: pickpocketing and
//     shoplifting there are the same crimes they were before
(function () {
    'use strict';

    const WT = (key, args) => (typeof window.T === 'function' ? window.T(key, args) : key);

    const DAY_MINUTES = 1440;
    const PRICE_DAYS = 90;          // a business sells for this many days of its full wage bill
    const MIN_PRICE = 500000;       // 5,000.00 euros, the cheapest counter in the world
    const REVENUE_RATE = 1.35;      // a staffed shift takes in its wage times this, in an average town
    const MAX_SETTLE_DAYS = 30;     // a long absence is paid for at most a month at once
    const PAYOUT_DAYS = 7;          // the takings are paid out once a week
    const SALE_RATE = 0.9;          // a sale fetches this share of the asking price
    const HISTORY_DAYS = 7;         // settlements kept for the report
    const PROC_MAP_ID = 636;        // the procedural template map: its MapJobs keys are not numeric
    const WORLD_MAP_ID = 315;
    const TAKEN_PREFIX = 'workplace:'; // i18n-ignore: world register key
    const JOB_POST = 'job:';           // i18n-ignore: post id prefix
    const COUNTER_POST = 'counter:';   // i18n-ignore: post id prefix
    const STAFF_KEY_PREFIX = 'staff:'; // i18n-ignore: spawned event key
    const SHIFT_HOURS = 8;

    function deeds() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return {};
        if (!$gameSystem._workplaceDeeds) $gameSystem._workplaceDeeds = {};
        return $gameSystem._workplaceDeeds;
    }

    function nowMinute() {
        return (typeof $gameVariables !== 'undefined' && $gameVariables) ? (Number($gameVariables.value(114)) || 0) : 0;
    }

    function dayIndex(minute) {
        return Math.floor((minute == null ? nowMinute() : minute) / DAY_MINUTES);
    }

    function allJobs() {
        return (window.WorkSystem && Array.isArray(window.WorkSystem.Jobs)) ? window.WorkSystem.Jobs : [];
    }

    function jobById(id) {
        return allJobs().find(j => j && j.id === id) || null;
    }

    function mapJobsEntry(mapId) {
        const id = Number(mapId);
        if (!Number.isInteger(id) || id <= 0 || id === PROC_MAP_ID || id === WORLD_MAP_ID) return null;
        const table = (window.WorldGen && window.WorldGen.MapJobs) || {};
        return table[String(id)] || null;
    }

    function jobIdsAt(mapId) {
        const entry = mapJobsEntry(mapId);
        const ids = (entry && Array.isArray(entry.jobs)) ? entry.jobs : [];
        return ids.filter(j => !!jobById(j));
    }

    // The shifts a job keeps: JobShiftManager's own answer when the NPC
    // simulation is loaded, else the Jobs.json list read the same way.
    function shiftsOf(jobId) {
        const JSM = window.NPCSim && window.NPCSim.JobShiftManager;
        if (JSM && typeof JSM.shiftsOf === 'function') return JSM.shiftsOf(jobId);
        const job = jobById(jobId);
        const own = Array.isArray(job && job.shifts)
            ? job.shifts.filter(s => Number.isInteger(s) && s >= 0 && s < 3) : [];
        return own.length ? own : [0, 1, 2];
    }

    // The <Shop> counters of a workplace that are kept in shifts by a rota
    // (ShopShiftManager): an authored face, a <Story> or a <Local> keeper is
    // the same person at every hour and is nobody's post to fill.
    function countersAt(mapId) {
        const idx = window.NPCSystem && typeof window.NPCSystem.getShopIndex === 'function'
            ? (window.NPCSystem.getShopIndex(Number(mapId)) || []) : [];
        return idx.filter(e => e && e.shopTagged && !e.hasGraphic && !e.story && !e.local);
    }

    // What one shift at a counter costs: ShopManagement's own counter wage.
    function counterShiftWage() {
        const SM = window.ShopManagement;
        return (SM && Number(SM.SHIFT_WAGE)) || 8000;
    }

    // Every post of a workplace: one per job it keeps (MapJobs) and one per
    // counter on a rota. A restaurant with a waiter, a cook and a till has
    // three, each of them three shifts deep at most.
    function posts(mapId) {
        const out = [];
        for (const jobId of jobIdsAt(mapId)) {
            const job = jobById(jobId);
            out.push({
                post: JOB_POST + jobId,
                jobId,
                eventId: null,
                shifts: shiftsOf(jobId),
                wage: Math.max(0, Number(job && job.basePay) || 0),
                label: (job && window.WorkSystem && typeof window.WorkSystem.jobName === 'function')
                    ? window.WorkSystem.jobName(job) : String(jobId),
            });
        }
        for (const counter of countersAt(mapId)) {
            out.push({
                post: COUNTER_POST + counter.eventId,
                jobId: null,
                eventId: counter.eventId,
                shifts: [0, 1, 2],
                wage: counterShiftWage(),
                label: counter.shopName || WT('Assets.workplace.counterPost'),
            });
        }
        return out;
    }

    // Every (post, shift) of a workplace, with the wage of one shift.
    function positions(mapId) {
        const out = [];
        for (const p of posts(mapId)) {
            for (const shift of p.shifts) out.push({ post: p.post, jobId: p.jobId, shift, wage: p.wage });
        }
        return out;
    }

    function isExteriorNote(note) {
        return /<Exterior>/i.test(String(note || ''));
    }

    // MapJobs' stamp of the map's own tag, for a map that is not loaded.
    function envOf(mapId) {
        const entry = mapJobsEntry(mapId);
        return (entry && entry.env) || null;
    }

    function isExteriorMap(mapId, note) {
        return isExteriorNote(note) || envOf(mapId) === 'Exterior'; // i18n-ignore: map tag value
    }

    function isAbandoned(mapId) {
        const res = window.WorldGen && window.WorldGen.NPCResidents;
        const meta = res && res.__maps && res.__maps[String(mapId)];
        return !!(meta && meta.abandoned);
    }

    function currentMapId() {
        return (typeof $gameMap !== 'undefined' && $gameMap && typeof $gameMap.mapId === 'function') ? $gameMap.mapId() : 0;
    }

    function currentNote() {
        return (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.note) || '';
    }

    // The town a workplace belongs to: its <MapGroup:> tag, else the MapGroups
    // list that holds it.
    function groupOf(mapId, note) {
        const m = String(note || '').match(/<MapGroup:\s*([^>]+)>/i);
        if (m) return m[1].trim();
        const groups = (window.WorldGen && window.WorldGen.MapGroups) || {};
        for (const name of Object.keys(groups)) {
            const maps = groups[name] && groups[name].maps;
            if (Array.isArray(maps) && maps.indexOf(Number(mapId)) >= 0) return name;
        }
        return null;
    }

    // How well the town is doing: 0.5 in a town on its knees, 1 in an ordinary
    // one, 1.5 in a boom (NPCWorldWeb prosperity 0..100, 50 when unknown).
    function wealthFactor(group) {
        const W = window.NPCWorldWeb;
        const pulse = group && W && typeof W.getPulse === 'function' ? W.getPulse(group) : null;
        const p = pulse && Number.isFinite(Number(pulse.prosperity)) ? Number(pulse.prosperity) : 50;
        return 0.5 + Math.max(0, Math.min(100, p)) / 100;
    }

    function dailyWageBill(mapId) {
        return positions(mapId).reduce((sum, p) => sum + p.wage, 0);
    }

    // Gold, rounded to whole euros.
    function priceOf(mapId, note) {
        const group = groupOf(mapId, note);
        const raw = dailyWageBill(mapId) * PRICE_DAYS * wealthFactor(group);
        return Math.max(MIN_PRICE, Math.round(raw / 100) * 100);
    }

    function owns(mapId) {
        return !!deeds()[String(Number(mapId))];
    }

    function ownsHere() {
        const id = currentMapId();
        return !!id && owns(id);
    }

    function takenRegister() {
        return (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._realEstateTaken) || null;
    }

    function isTakenByAnother(mapId) {
        const reg = takenRegister();
        return !!(reg && reg[TAKEN_PREFIX + Number(mapId)]) && !owns(mapId);
    }

    // { ok, reason }: reason is one of noJobs, exterior, abandoned, owned, taken.
    function eligibility(mapId, note) {
        const id = Number(mapId);
        if (!jobIdsAt(id).length) return { ok: false, reason: 'noJobs' };
        if (isExteriorMap(id, note)) return { ok: false, reason: 'exterior' };
        if (isAbandoned(id)) return { ok: false, reason: 'abandoned' };
        if (owns(id)) return { ok: false, reason: 'owned' };
        if (isTakenByAnother(id)) return { ok: false, reason: 'taken' };
        return { ok: true, reason: null };
    }

    function canBuyHere() {
        const id = currentMapId();
        return !!id && eligibility(id, currentNote()).ok;
    }

    function mapDisplayName(mapId) {
        if (currentMapId() === Number(mapId) && typeof $gameMap.displayName === 'function') {
            const dn = $gameMap.displayName();
            if (dn) return dn;
        }
        const entry = mapJobsEntry(mapId);
        if (entry && entry.name) return entry.name;
        const infos = typeof $dataMapInfos !== 'undefined' ? $dataMapInfos : null;
        const info = infos && infos[Number(mapId)];
        return (info && info.name) || WT('Assets.workplace.unnamed', { id: mapId });
    }

    // The note to judge a map by: the live one when the party stands on it,
    // else nothing (MapJobs' env and MapGroups answer for it).
    function noteFor(mapId) {
        return Number(mapId) === currentMapId() ? currentNote() : '';
    }

    // The offer for the map the party is standing on, or null.
    function offerHere() {
        const mapId = currentMapId();
        return mapId ? offerFor(mapId) : null;
    }

    // The offer for any workplace, or null when it is not for sale.
    function offerFor(mapId) {
        mapId = Number(mapId);
        const note = noteFor(mapId);
        if (!mapId || !eligibility(mapId, note).ok) return null;
        const group = groupOf(mapId, note);
        return {
            mapId,
            name: mapDisplayName(mapId),
            group,
            place: placeOf(mapId, group),
            price: priceOf(mapId, note),
            jobs: jobIdsAt(mapId),
            positions: positions(mapId).length,
            staffed: staffedShifts(mapId).length,
            wealth: wealthFactor(group),
            projected: dailyTakings(mapId, group),
        };
    }

    // Where a workplace stands, for a list: its town, else the named map
    // above it (MapJobs "place").
    function placeOf(mapId, group) {
        if (group) return group;
        const entry = mapJobsEntry(mapId);
        return (entry && entry.place) || '';
    }

    // Every workplace the Real Estate Board lists: an authored interior with
    // a trade that is not abandoned, whoever holds it. status is 'owned',
    // 'taken' (another savegame of this world) or 'available'.
    function listing() {
        const table = (window.WorldGen && window.WorldGen.MapJobs) || {};
        const out = [];
        for (const key of Object.keys(table)) {
            if (!/^\d+$/.test(key)) continue;
            const id = Number(key);
            if (envOf(id) !== 'Interior' || !jobIdsAt(id).length || isAbandoned(id)) continue; // i18n-ignore: map tag value
            const note = noteFor(id);
            const group = groupOf(id, note);
            const status = owns(id) ? 'owned' : (isTakenByAnother(id) ? 'taken' : 'available'); // i18n-ignore: status ids
            out.push({
                mapId: id,
                name: mapDisplayName(id),
                group,
                place: placeOf(id, group),
                status,
                price: priceOf(id, note),
                jobs: jobIdsAt(id),
                positions: positions(id).length,
                staffed: staffedShifts(id).length,
                wealth: wealthFactor(group),
                projected: dailyTakings(id, group),
            });
        }
        return out.sort((a, b) => String(a.place).localeCompare(String(b.place)) ||
            String(a.name).localeCompare(String(b.name)) || a.mapId - b.mapId);
    }

    // ── Who works the posts ─────────────────────────────────────────────────
    // The citizens who worked here before the deed changed hands keep working
    // here after it: a job's shift is whoever JobShiftManager dealt it to, a
    // counter's whoever its rota names. The party can put one of its own off
    // the bench on any shift (deed.staff, { id, post, shift }); they stand in
    // for that citizen, who stays home, until they are taken off it or called
    // back onto the road, and then the citizen has the shift back.
    function deedStaff(mapId) {
        const d = deeds()[String(Number(mapId))];
        if (!d) return [];
        if (!Array.isArray(d.staff)) d.staff = [];
        // Never pruned against a bench that cannot be read yet.
        const all = benchAll();
        if (!all) return d.staff;
        const bench = new Set(all.map(p => String(p.id)));
        for (let i = d.staff.length - 1; i >= 0; i--) {
            const row = d.staff[i];
            if (!row || row.post == null || !bench.has(String(row.id))) d.staff.splice(i, 1);
        }
        return d.staff;
    }

    // The bench, or null while it cannot be read. Bubba never leaves the party.
    function benchAll() {
        const CP = window.CharacterPresets;
        if (!CP || typeof CP.getAvailableRetiredPresets !== 'function') return null;
        return (CP.getAvailableRetiredPresets() || []).filter(p => p && p.name && p.name !== 'Bubba');
    }

    function benchPreset(id) {
        return (benchAll() || []).find(p => String(p.id) === String(id)) || null;
    }

    function onLeave(name) {
        const leave = window.NPCSim && window.NPCSim.Leave;
        return !!(leave && typeof leave.isOnLeave === 'function' && leave.isOnLeave(name));
    }

    // The job holders of one map, "jobId|shift" -> name, read in one pass.
    function jobHoldersAt(mapId) {
        const id = Number(mapId);
        const out = {};
        const sys = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem : null;
        const assigns = (sys && sys._npcJobAssignments) || {};
        for (const name of Object.keys(assigns)) {
            const a = assigns[name];
            if (a && Number(a.mapId) === id) out[a.jobId + '|' + Number(a.shift)] = name;
        }
        return out;
    }

    // The citizen a shift belonged to before the party put anybody on it.
    function citizenOn(mapId, post, shift, holders) {
        const id = Number(mapId);
        if (post.jobId != null) {
            const name = holders[post.jobId + '|' + shift];
            return name && !onLeave(name) ? name : null;
        }
        const SSM = window.NPCSim && window.NPCSim.ShopShiftManager;
        const rota = SSM && typeof SSM._getPersonas === 'function' ? SSM._getPersonas(`${id}_${post.eventId}`) : null;
        const persona = rota && rota[shift];
        return (persona && persona.name) || null;
    }

    // Every shift of every post, and who holds it: { post, postLabel, jobId,
    // eventId, shift, hours, wage, holder } with holder { kind, id, name } or
    // null for a shift nobody works.
    function slots(mapId) {
        const id = Number(mapId);
        const ours = deedStaff(id);
        const holders = jobHoldersAt(id);
        const out = [];
        for (const p of posts(id)) {
            for (const shift of p.shifts) {
                const row = ours.find(r => r.post === p.post && Number(r.shift) === shift);
                const preset = row ? benchPreset(row.id) : null;
                const citizen = citizenOn(id, p, shift, holders);
                const start = shift * SHIFT_HOURS;
                out.push({
                    post: p.post,
                    postLabel: p.label,
                    jobId: p.jobId,
                    eventId: p.eventId,
                    shift,
                    hours: { start, end: (start + SHIFT_HOURS) % 24 },
                    wage: p.wage,
                    citizen,
                    holder: preset
                        ? { kind: 'preset', id: preset.id, name: preset.name }
                        : (citizen ? { kind: 'npc', id: null, name: citizen } : null),
                });
            }
        }
        return out;
    }

    // Who works here: every shift somebody holds, citizen or the party's own.
    function staffedShifts(mapId) {
        return slots(mapId).filter(s => s.holder).map(s => ({
            name: s.holder.name,
            jobId: s.jobId,
            post: s.post,
            label: s.postLabel,
            shift: s.shift,
            wage: s.wage,
            party: s.holder.kind === 'preset',
        }));
    }

    // The party's own people on every workplace it owns.
    function partyStaff() {
        const out = [];
        for (const d of list()) {
            for (const row of deedStaff(d.mapId)) {
                out.push({ bizKey: 'wp:' + d.mapId, mapId: d.mapId, id: row.id, post: row.post, shift: Number(row.shift) }); // i18n-ignore: business key
            }
        }
        return out;
    }

    // Puts somebody off the bench on one shift of one post.
    function assignReserve(mapId, post, shift, presetId) {
        const id = Number(mapId);
        if (!owns(id)) return { ok: false, reason: 'noShop' };
        const p = posts(id).find(x => x.post === post);
        if (!p || p.shifts.indexOf(Number(shift)) < 0) return { ok: false, reason: 'noShift' };
        // Somebody stationed on a claim is already standing somewhere.
        const preset = benchPreset(presetId);
        if (!preset || preset.stationedAt) return { ok: false, reason: 'unknown' };
        // One shift at a time: somebody already at work somewhere is not free.
        if (partyStaff().some(r => String(r.id) === String(preset.id))) return { ok: false, reason: 'already' };
        const staff = deedStaff(id);
        const at = staff.findIndex(r => r.post === post && Number(r.shift) === Number(shift));
        if (at >= 0) staff.splice(at, 1);
        staff.push({ id: preset.id, post, shift: Number(shift) });
        refreshCounter(id, p.eventId);
        return { ok: true };
    }

    // Takes the party's own off a shift: the citizen they stood in for has it back.
    function releaseReserve(mapId, post, shift) {
        const id = Number(mapId);
        const staff = deedStaff(id);
        const at = staff.findIndex(r => r.post === post && Number(r.shift) === Number(shift));
        if (at < 0) return { ok: false, reason: 'notOnRoster' };
        const name = (benchPreset(staff[at].id) || {}).name;
        staff.splice(at, 1);
        const p = posts(id).find(x => x.post === post);
        refreshCounter(id, p ? p.eventId : null);
        // Off the floor of the map the party is standing on, if they were on it.
        try {
            const VP = window.PartyPresence;
            const ev = name && VP && typeof VP.findEvent === 'function' ? VP.findEvent(STAFF_KEY_PREFIX + name) : null;
            if (ev && ev.erase) ev.erase();
        } catch (e) { /* gone on the next transfer either way */ }
        return { ok: true };
    }

    // A counter on the map the party stands on is redrawn at once rather than
    // at the next shift change.
    function refreshCounter(mapId, eventId) {
        if (eventId == null) return;
        const SSM = window.NPCSim && window.NPCSim.ShopShiftManager;
        if (!SSM) return;
        if (SSM._applied) delete SSM._applied[`${mapId}_${eventId}`];
        if (SSM._lastAppliedShift) delete SSM._lastAppliedShift[mapId];
    }

    function liveRowAt(mapId, post, shift) {
        if (!owns(mapId)) return null;
        const row = deedStaff(mapId).find(r => r.post === post && Number(r.shift) === Number(shift));
        return row ? benchPreset(row.id) : null;
    }

    // Whether this citizen's shift is being stood in for by one of the party's
    // own, so they keep it at home (NPCSim_Routine reads this).
    function isDisplaced(name) {
        if (!name || typeof $gameSystem === 'undefined' || !$gameSystem) return false;
        const book = deeds();
        if (!Object.keys(book).length) return false;
        const job = $gameSystem._npcJobAssignments && $gameSystem._npcJobAssignments[name];
        if (job && book[String(Number(job.mapId))] && liveRowAt(job.mapId, JOB_POST + job.jobId, job.shift)) return true;
        const till = $gameSystem._npcShopAssignments && $gameSystem._npcShopAssignments[name];
        if (till && book[String(Number(till.mapId))] && liveRowAt(till.mapId, COUNTER_POST + till.eventId, till.shift)) return true;
        return false;
    }

    // The party's own standing in at a counter for this shift, as the persona
    // ShopShiftManager draws on it, or null.
    function counterPersona(mapId, eventId, shift) {
        if (!Object.keys(deeds()).length) return null;
        const preset = liveRowAt(Number(mapId), COUNTER_POST + eventId, shift);
        if (!preset) return null;
        return {
            name: preset.name,
            spriteName: preset.characterName || '',
            charIdx: preset.characterIndex || 0,
            partyStaff: true,
        };
    }

    // The party's own on a job here, put on the floor for the shift they are
    // working when the party walks in. A counter's stand-in is drawn on the
    // counter itself (counterPersona), so only the jobs are spawned.
    function populateStaffHere() {
        const mapId = currentMapId();
        if (!mapId || !owns(mapId)) return 0;
        const VP = window.PartyPresence;
        if (!VP || typeof VP.spawnOne !== 'function') return 0;
        if (typeof $dataMap === 'undefined' || !$dataMap) return 0;
        if (!$dataMap.events) $dataMap.events = [null];
        const hour = (typeof $gameVariables !== 'undefined' && $gameVariables) ? Number($gameVariables.value(23)) || 0 : 12;
        const now = Math.floor(hour / SHIFT_HOURS) % 3;
        let spawned = 0;
        for (const row of deedStaff(mapId)) {
            if (Number(row.shift) !== now || String(row.post).indexOf(JOB_POST) !== 0) continue;
            const preset = benchPreset(row.id);
            if (!preset) continue;
            const key = STAFF_KEY_PREFIX + preset.name;
            if (VP.findEvent && VP.findEvent(key)) continue;
            const ok = VP.spawnOne({
                key,
                name: preset.name,
                characterName: preset.characterName || '',
                characterIndex: preset.characterIndex || 0,
                classId: preset.classId,
                level: preset.level,
            }, { slot: null, location: null });
            if (ok) spawned++;
        }
        return spawned;
    }

    // One day of trade: every staffed shift takes in its wage times the
    // revenue rate (scaled by the town's wealth) and pays that wage out.
    function dailyTakings(mapId, group) {
        const shifts = staffedShifts(mapId);
        const factor = wealthFactor(group !== undefined ? group : groupOf(mapId, ''));
        let revenue = 0, wages = 0;
        for (const s of shifts) {
            revenue += Math.round(s.wage * REVENUE_RATE * factor);
            wages += s.wage;
        }
        return { shifts: shifts.length, revenue, wages, profit: revenue - wages };
    }

    function buy(mapId, note) {
        const id = Number(mapId == null ? currentMapId() : mapId);
        const n = note == null ? noteFor(id) : note;
        const elig = eligibility(id, n);
        if (!elig.ok) return { ok: false, reason: elig.reason };
        const price = priceOf(id, n);
        const gold = (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.gold() : 0;
        if (gold < price) return { ok: false, reason: 'funds', price };
        $gameParty.loseGold(price);
        const group = groupOf(id, n);
        deeds()[String(id)] = {
            mapId: id,
            name: mapDisplayName(id),
            group,
            place: placeOf(id, group),
            price,
            boughtMinute: nowMinute(),
            lastDay: dayIndex(),
            totals: { days: 0, revenue: 0, wages: 0, profit: 0 },
            history: [],
        };
        if (typeof $gameSystem !== 'undefined' && $gameSystem) {
            const reg = $gameSystem._realEstateTaken || ($gameSystem._realEstateTaken = {});
            reg[TAKEN_PREFIX + id] = {
                how: 'bought', // i18n-ignore: stored record key
                by: ($gameParty && $gameParty.leader && $gameParty.leader() && $gameParty.leader().name()) || null,
                at: nowMinute(),
            };
        }
        if (window.SpecializationXP && typeof window.SpecializationXP.awardForValue === 'function') {
            window.SpecializationXP.awardForValue('Real Estate Appraisal', price); // i18n-ignore: specialization id
        }
        return { ok: true, price, mapId: id };
    }

    // Pays every whole day since the last settlement, once a week has gone
    // by (PAYOUT_DAYS). Safe to call as often as anybody likes: a day is only
    // ever paid once. opts.mapId settles that one deed now, week or not (a
    // sale); opts.silent shows no toast.
    function settle(minute, opts) {
        const today = dayIndex(minute);
        const book = deeds();
        const paid = [];
        const only = opts && opts.mapId != null ? String(Number(opts.mapId)) : null;
        for (const key of Object.keys(book)) {
            const d = book[key];
            if (!d || (only && key !== only)) continue;
            const last = Number.isFinite(Number(d.lastDay)) ? Number(d.lastDay) : today;
            if (!only && today - last < PAYOUT_DAYS) continue;
            const days = Math.min(MAX_SETTLE_DAYS, today - last);
            d.lastDay = today;
            if (!(days > 0)) continue;
            const day = dailyTakings(d.mapId, d.group);
            const rec = {
                day: today, days, shifts: day.shifts,
                revenue: day.revenue * days, wages: day.wages * days, profit: day.profit * days,
            };
            d.totals.days += days;
            d.totals.revenue += rec.revenue;
            d.totals.wages += rec.wages;
            d.totals.profit += rec.profit;
            d.history = [rec].concat(d.history || []).slice(0, HISTORY_DAYS);
            if (typeof $gameParty !== 'undefined' && $gameParty) {
                if (rec.profit > 0) $gameParty.gainGold(rec.profit);
                else if (rec.profit < 0) $gameParty.loseGold(Math.min($gameParty.gold(), -rec.profit));
            }
            paid.push({ mapId: d.mapId, name: d.name, record: rec });
        }
        if (paid.length && !(opts && opts.silent) && window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
            const total = paid.reduce((s, p) => s + p.record.profit, 0);
            const euro = window.AssetsMenu && window.AssetsMenu.euro
                ? window.AssetsMenu.euro(total) : String(total / 100);
            window.ParchmentToast.show(
                WT(total >= 0 ? 'Assets.workplace.dailyProfitToast' : 'Assets.workplace.dailyLossToast',
                    { amount: euro, count: paid.length }),
                { title: WT('Assets.workplace.dailyTitle') }
            );
        }
        return paid;
    }

    // What the deed fetches today: SALE_RATE of the asking price, the haircut
    // narrowing with Real Estate Appraisal as a house sale's does.
    function salePriceOf(mapId) {
        const d = deeds()[String(Number(mapId))];
        if (!d) return 0;
        const valuer = window.SpecializationXP && typeof window.SpecializationXP.multiplier === 'function'
            ? window.SpecializationXP.multiplier('Real Estate Appraisal', 0.025) : 1; // i18n-ignore: specialization id
        const rate = Math.min(1, SALE_RATE * valuer);
        return Math.round(priceOf(d.mapId, noteFor(d.mapId)) * rate / 100) * 100;
    }

    // Sells a deed back to the market. The days since the last payout are
    // settled first, so a sale never forfeits takings already earned.
    function sell(mapId) {
        const key = String(Number(mapId));
        const d = deeds()[key];
        if (!d) return { ok: false, reason: 'notOwned' };
        const price = salePriceOf(d.mapId);
        settle(undefined, { mapId: d.mapId, silent: true });
        delete deeds()[key];
        const reg = takenRegister();
        if (reg) delete reg[TAKEN_PREFIX + d.mapId];
        if (typeof $gameParty !== 'undefined' && $gameParty) $gameParty.gainGold(price);
        if (window.SpecializationXP && typeof window.SpecializationXP.awardForValue === 'function') {
            window.SpecializationXP.awardForValue('Real Estate Appraisal', price); // i18n-ignore: specialization id
        }
        return { ok: true, price, mapId: d.mapId, name: d.name };
    }

    // Whole days until the next weekly payout of a deed.
    function daysToPayout(mapId) {
        const d = deeds()[String(Number(mapId))];
        if (!d) return null;
        const last = Number.isFinite(Number(d.lastDay)) ? Number(d.lastDay) : dayIndex();
        return Math.max(0, PAYOUT_DAYS - (dayIndex() - last));
    }

    function list() {
        const book = deeds();
        return Object.keys(book).map(k => book[k]).filter(Boolean)
            .sort((a, b) => a.mapId - b.mapId);
    }

    function report(mapId) {
        const d = deeds()[String(Number(mapId))];
        if (!d) return null;
        return {
            deed: d,
            today: dailyTakings(d.mapId, d.group),
            positions: positions(d.mapId).length,
            last: (d.history && d.history[0]) || null,
            nextPayout: daysToPayout(d.mapId),
            salePrice: salePriceOf(d.mapId),
        };
    }

    window.WorkplaceDeeds = {
        PRICE_DAYS, MIN_PRICE, REVENUE_RATE, MAX_SETTLE_DAYS, PAYOUT_DAYS, SALE_RATE,
        JOB_POST, COUNTER_POST,
        jobIdsAt, posts, countersAt, positions, staffedShifts, slots, partyStaff,
        assignReserve, releaseReserve, isDisplaced, counterPersona, populateStaffHere, groupOf, wealthFactor, dailyWageBill,
        priceOf, eligibility, canBuyHere, offerHere, offerFor, listing, owns, ownsHere, isTakenByAnother,
        dailyTakings, buy, sell, salePriceOf, daysToPayout, settle, list, report,
        isExteriorNote, isExteriorMap, isAbandoned,
    };

    // The schedule: the week's takings are paid once PAYOUT_DAYS in-game days
    // have turned over. Throttled like the rent hook above; settle() is
    // idempotent.
    if (typeof Scene_Map !== 'undefined' && Scene_Map.prototype && typeof Scene_Map.prototype.update === 'function') {
        let frames = 0;
        const _Scene_Map_update_Workplace = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function () {
            _Scene_Map_update_Workplace.call(this);
            if (++frames < 120) return;
            frames = 0;
            if (!$gameSystem || !$gameSystem._workplaceDeeds) return;
            const book = $gameSystem._workplaceDeeds;
            const today = dayIndex();
            for (const key in book) {
                if (book[key] && today - book[key].lastDay >= PAYOUT_DAYS) { settle(); return; }
            }
        };
    }
})();
//=============================================================================
// END WORKPLACE DEEDS
//=============================================================================

//=============================================================================
// MAP CLAIMS
//=============================================================================
// Staking out the ground the party is standing on, for nothing, from the
// Deeds menu (AssetsMenu.js). A claim is kept in this savegame
// ($gameSystem._mapClaims) and the world is told the ground is spoken for
// through the same register the houses and workplaces use (_realEstateTaken,
// market.json), keyed "claim:<place key>".
//
// The place key is the one the furniture already lives under
// (FurnitureSystem.furnitureMapKey): the numeric id on an authored map, the
// "proc:<biome>:<x>,<y>:<depth>" address on a procedural square.
//
// What can be claimed:
//   - never the world map
//   - never a settlement or a road: the Village, City and Burg biomes and
//     their variations, and every Road square
//   - never ground tagged <BuildRights: Disabled> (a procedural square is
//     judged by its coordinate, not by the reused template's note)
//   - ground that is somebody else's (<BuildRights: Owner> the party holds no
//     deed to, an NPC's house floor, a claim another savegame of this world
//     holds) can still be taken, but it is squatting: the party is warned and
//     a trespassing bounty is filed
//
// A claim:
//   - makes the ground's build rights Free (FurnitureSystem.getMapBuildRights)
//   - is where the reserves can be sent to wait (CharacterPresets.stationReserves)
//   - is given up from the same menu, which calls the reserves home again
(function () {
    'use strict';

    const WORLD_MAP_ID = 315;
    const PROC_MAP_ID = 636;
    const TAKEN_PREFIX = 'claim:'; // i18n-ignore: world register key
    const SQUAT_BOUNTY = 2500;     // 25.00 euros, the charge for squatting
    const SQUAT_CRIME_ID = 'trespassing'; // i18n-ignore: PresetCrimes id
    const CLAIMED_HOW = 'claimed'; // i18n-ignore: stored record key
    // Settlements and roads are nobody's to stake out: every variation of
    // these biomes (VillageIce, CityDesert, BurgDesert, "Road cross" ...).
    const UNCLAIMABLE_BIOME = /^(village|city|burg|road)/i;

    function claims() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return {};
        if (!$gameSystem._mapClaims) $gameSystem._mapClaims = {};
        return $gameSystem._mapClaims;
    }

    function nowMinute() {
        return (typeof $gameVariables !== 'undefined' && $gameVariables) ? (Number($gameVariables.value(114)) || 0) : 0;
    }

    function currentMapId() {
        return (typeof $gameMap !== 'undefined' && $gameMap && typeof $gameMap.mapId === 'function') ? $gameMap.mapId() : 0;
    }

    // The place the party stands on, as the key its furniture is stored under.
    function keyHere() {
        const FS = window.FurnitureSystem;
        const key = FS && typeof FS.furnitureMapKey === 'function' ? FS.furnitureMapKey() : currentMapId();
        return String(key);
    }

    function isProcSquare() {
        return currentMapId() === PROC_MAP_ID;
    }

    // The biome underfoot: the generator's square on the procedural map, the
    // map's own <Biome:> note elsewhere.
    function biomeHere() {
        const pg = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem._procGenData : null;
        if (isProcSquare()) return (pg && pg.currentBiome) ? String(pg.currentBiome) : '';
        const meta = (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.meta) ? $dataMap.meta.Biome : null;
        return (typeof meta === 'string') ? meta.trim() : '';
    }

    function isUnclaimableBiome(biome) {
        return !!biome && UNCLAIMABLE_BIOME.test(String(biome));
    }

    function takenRegister() {
        return (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._realEstateTaken) || null;
    }

    function owns(key) {
        return !!claims()[String(key)];
    }

    function ownsHere() {
        return owns(keyHere());
    }

    function isClaimedByAnother(key) {
        const reg = takenRegister();
        return !!(reg && reg[TAKEN_PREFIX + key]) && !owns(key);
    }

    // The ground's own rights, read off the note with no claim counted.
    function rawRightsHere() {
        const note = (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.note) || '';
        // i18n-ignore-start: <BuildRights:> note-tag values, compared in code
        const m = String(note).match(/<BuildRights:\s*(\w+)>/i);
        if (!m) return 'Free';
        const v = m[1].toLowerCase();
        if (v === 'disabled') return 'Disabled';
        if (v === 'owner') return 'Owner';
        return 'Free';
        // i18n-ignore-end
    }

    // Is the ground underfoot somebody else's? An NPC's house floor, Owner
    // land the party holds no deed to, or a claim of another savegame.
    function belongsToSomebodyElse(key) {
        if (isClaimedByAnother(key)) return true;
        const PHS = window.ProceduralHouseSystem;
        if (PHS && typeof PHS.isInsideHouse === 'function' && PHS.isInsideHouse()) {
            return !(typeof PHS.isCurrentFloorOwned === 'function' && PHS.isCurrentFloorOwned());
        }
        if (isProcSquare()) return false;
        if (rawRightsHere() !== 'Owner') return false; // i18n-ignore: build-rights id
        const WD = window.WorkplaceDeeds;
        if (WD && typeof WD.ownsHere === 'function' && WD.ownsHere()) return false;
        return true;
    }

    // { ok, reason, squat }: reason is one of worldMap, notGenerated,
    // settlement, disabled, claimed.
    function eligibilityHere() {
        const mapId = currentMapId();
        if (!mapId || mapId === WORLD_MAP_ID) return { ok: false, reason: 'worldMap' };
        const key = keyHere();
        // A procedural square not generated yet has no address of its own.
        if (isProcSquare() && key === String(PROC_MAP_ID)) return { ok: false, reason: 'notGenerated' };
        if (isUnclaimableBiome(biomeHere())) return { ok: false, reason: 'settlement' };
        if (!isProcSquare() && rawRightsHere() === 'Disabled') return { ok: false, reason: 'disabled' }; // i18n-ignore: build-rights id
        if (owns(key)) return { ok: false, reason: 'claimed' };
        return { ok: true, reason: null, squat: belongsToSomebodyElse(key) };
    }

    function nameHere() {
        const W = window.WorldMapTransfer;
        if (W && typeof W.locate === 'function' && typeof W.locationName === 'function') {
            try {
                const name = W.locationName(W.locate());
                if (name) return name;
            } catch (e) { /* fall through to the map's own name */ }
        }
        if (typeof $gameMap !== 'undefined' && $gameMap && typeof $gameMap.displayName === 'function') {
            const dn = $gameMap.displayName();
            if (dn) return dn;
        }
        return String(currentMapId());
    }

    // The offer for the ground underfoot, or null when it cannot be claimed.
    function offerHere() {
        const elig = eligibilityHere();
        if (!elig.ok) return null;
        const W = window.WorldMapTransfer;
        let coords = null;
        try { coords = W && typeof W.currentWorldCoords === 'function' ? W.currentWorldCoords() : null; } catch (e) { coords = null; }
        return {
            key: keyHere(),
            mapId: currentMapId(),
            name: nameHere(),
            biome: biomeHere(),
            worldX: coords ? coords.x : null,
            worldY: coords ? coords.y : null,
            squat: !!elig.squat,
        };
    }

    // Stakes the ground underfoot. Squatting files the bounty.
    function claimHere() {
        const offer = offerHere();
        if (!offer) return { ok: false, reason: eligibilityHere().reason };
        const player = (typeof $gamePlayer !== 'undefined' && $gamePlayer) ? $gamePlayer : null;
        claims()[offer.key] = {
            key: offer.key,
            mapId: offer.mapId,
            x: player ? player.x : 0,
            y: player ? player.y : 0,
            name: offer.name,
            biome: offer.biome,
            worldX: offer.worldX,
            worldY: offer.worldY,
            squat: offer.squat,
            claimedMinute: nowMinute(),
        };
        if (typeof $gameSystem !== 'undefined' && $gameSystem) {
            const reg = $gameSystem._realEstateTaken || ($gameSystem._realEstateTaken = {});
            if (!reg[TAKEN_PREFIX + offer.key]) {
                claims()[offer.key].registered = true;
                reg[TAKEN_PREFIX + offer.key] = {
                    how: CLAIMED_HOW,
                    by: ($gameParty && $gameParty.leader && $gameParty.leader() && $gameParty.leader().name()) || null,
                    at: nowMinute(),
                };
            }
        }
        const bounty = offer.squat ? fileSquat() : 0;
        return { ok: true, key: offer.key, name: offer.name, squat: offer.squat, bounty };
    }

    function fileSquat() {
        const CS = window.CrimeSystem;
        if (!CS || typeof CS.addCrime !== 'function') return 0;
        const preset = typeof CS.presetCrimeName === 'function' ? CS.presetCrimeName(SQUAT_CRIME_ID) : '';
        const name = preset || (typeof window.T === 'function' ? window.T('Assets.claim.charge') : '');
        CS.addCrime(name, SQUAT_BOUNTY, SQUAT_CRIME_ID);
        return SQUAT_BOUNTY;
    }

    // Gives a claim up. Whoever of the reserves waited there is called home.
    function release(key) {
        key = String(key);
        const c = claims()[key];
        if (!c) return { ok: false, reason: 'notClaimed' };
        delete claims()[key];
        const reg = takenRegister();
        const rec = reg && reg[TAKEN_PREFIX + key];
        // Only our own staking is struck off: a squat on somebody else's claim
        // leaves their entry where it was.
        if (rec && rec.how === CLAIMED_HOW && c.registered) delete reg[TAKEN_PREFIX + key];
        const CP = window.CharacterPresets;
        const recalled = CP && typeof CP.unstationReserves === 'function' ? CP.unstationReserves(key) : 0;
        return { ok: true, key, name: c.name, recalled };
    }

    // Sends every reserve dossier of this world to wait on a claim.
    function sendReserves(key) {
        const c = claims()[String(key)];
        if (!c) return { ok: false, reason: 'notClaimed', count: 0 };
        const CP = window.CharacterPresets;
        const count = CP && typeof CP.stationReserves === 'function' ? CP.stationReserves(c) : 0;
        return { ok: count > 0, reason: count > 0 ? null : 'noReserves', count };
    }

    function stationedAt(key) {
        const CP = window.CharacterPresets;
        return CP && typeof CP.reservesStationedAt === 'function' ? CP.reservesStationedAt(String(key)) : [];
    }

    function list() {
        const book = claims();
        return Object.keys(book).map(k => book[k]).filter(Boolean)
            .sort((a, b) => (a.claimedMinute || 0) - (b.claimedMinute || 0));
    }

    window.MapClaims = {
        SQUAT_BOUNTY,
        keyHere, biomeHere, isUnclaimableBiome, eligibilityHere, offerHere,
        owns, ownsHere, isClaimedByAnother, belongsToSomebodyElse,
        claimHere, release, sendReserves, stationedAt, list,
    };
})();
//=============================================================================
// END MAP CLAIMS
//=============================================================================
