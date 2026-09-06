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
        'B&B': { minCap: 2, maxCap: 16, basePrice: [700, 4500, 20000, 320000, 500000] }
    };
    // i18n-ignore-end

    // Renting (as tenant, not owner) costs this fraction of the property's
    // base price per in-game month. Charged from processMonthlyRent().
    const RENT_MONTHLY_RATE = 0.03;

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
                rentPerOccupant: worthless ? 0 : Math.floor((basePrice * priceVariation * 0.001) / 30), // ~0.1% daily
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

            // Closing on a property is how the trade is learned, and the bigger
            // the deal the more of it there was to learn (specialization 722).
            if (window.SpecializationXP) {
                window.SpecializationXP.awardForValue('Real Estate Appraisal', goldCost);
            }

            return true;
        }

        sellProperty(propertyId) {
            const property = this.properties.find(p => p.id === propertyId);
            if (!property || !property.isOwned) return false;

            const effectivePrice = this.calculateEffectivePrice(property);
            // Somebody who knows the market does not take the first offer, so
            // the haircut on a sale narrows as Real Estate Appraisal climbs.
            const valuer = window.SpecializationXP
                ? window.SpecializationXP.multiplier('Real Estate Appraisal', 0.025) : 1;
            const salePrice = Math.floor(effectivePrice * Math.min(1, 0.9 * valuer));
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

            // Convert euros to gold and add to party
            const goldIncome = Math.floor(this.dailyIncome * 100);
            $gameParty.gainGold(goldIncome);

            // Drift company share prices with a small daily random walk, clamped
            // to a sane band around each company's base listing price.
            const defs = this.getCompanyDefs();
            Object.keys(defs).forEach(key => {
                const base = Number(defs[key].sharePrice) || 1;
                const cur = this.getCompanyPrice(key);
                const drift = 1 + (Math.random() - 0.5) * 0.1; // ±5%
                const next = Math.max(base * 0.3, Math.min(base * 4, cur * drift));
                this.companyPrices[key] = Math.max(1, Math.round(next));
            });

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
            return income;
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
                    available: Math.max(0, total - owned),
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
            const available = Math.max(0, total - this.getShares(key));
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

        // A company's price, in whole euros, as quoted by whoever is trading it.
        // The stock terminal prices the same listings live and writes its quote
        // back here so the Assets pockets and this screen value a share alike.
        setCompanyPrice(key, priceEuros) {
            if (!this.getCompanyDefs()[key]) return false;
            this.companyPrices[key] = Math.max(1, Math.round(Number(priceEuros) || 1));
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
                available: Math.max(0, total - shares)
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
            // Name the skill this menu runs on while it is open.
            if (window.SpecBadge) window.SpecBadge.show('Real Estate Appraisal');  // i18n-ignore  Specialization.json id
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
                $gameTemp.newsReturnScene = 'realEstate';
                $gameTemp.newsFilterLocation = property.location;
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

        commandVacate() {
            const property = this._propertyListWindow.property();
            if ($realEstateManager.vacateProperty(property.id)) {
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
            this._dndContainer.id = 'menu-container';
            this._dndContainer.style.opacity = '0';
            this._dndContainer.style.transition = 'opacity 0.22s ease-out';
            const appHost = this._isAppMode ? document.getElementById('real-estate-content') : null;
            if (appHost) {
                appHost.innerHTML = '';
                appHost.appendChild(this._dndContainer);
            } else {
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
                this.dismiss();
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
            const percentChange = Math.round((priceDiff / selectedProperty.price) * 100);
            const effects = $realEstateManager.getActiveEffectsForLocation(selectedProperty.location);
            const trend = selectedProperty.marketTrend;
            const stars = '★'.repeat(selectedProperty.stars) + '☆'.repeat(5 - selectedProperty.stars);

            let marketSentiment = t('stable');
            let sentimentColor = 'var(--text-text-alt-4)';
            if (trend > 0.5) { marketSentiment = t('hot'); sentimentColor = 'var(--text-success-active)'; }
            else if (trend < -0.5) { marketSentiment = t('cold'); sentimentColor = 'var(--border-danger-active)'; }

            const commands = [];
            if (selectedProperty.isOwned) {
                commands.push({ label: T('RealEstate.ui.liquidateAsset'), action: "sell", danger: true });
            } else if (selectedProperty.isRentedByPlayer) {
                commands.push({ label: T('RealEstate.ui.vacateRental'), action: "vacate", danger: true });
            } else if ($realEstateManager.isTakenByAnother(selectedProperty.id)) {
                // Another playthrough of this world holds it: nothing to offer
                // but the news, so neither deed nor lease is put up for sale.
            } else {
                commands.push({ label: T('RealEstate.ui.acquireDeed'), action: "buy" });
                commands.push({ label: T('RealEstate.ui.rent'), action: "rent", secondary: true });
            }
            if (effects.length > 0) {
                commands.push({ label: T('RealEstate.ui.investigateMarketNews'), action: "info", secondary: true });
            }

            const sref = this.sceneRef();
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
                ownedRows = row(t('occupancy'), `${selectedProperty.currentOccupants} / ${selectedProperty.maxOccupants}`)
                    + row(t('dailyIncome'), `€${(selectedProperty.currentOccupants * selectedProperty.rentPerOccupant).toLocaleString()}`, 'color:var(--text-success-active);');
            } else if (selectedProperty.isRentedByPlayer) {
                ownedRows = row(T('RealEstate.ui.monthlyRent'), `€${monthlyRent.toLocaleString()}`, 'color:var(--border-danger-active);')
                    + row(T('RealEstate.ui.status'), T('RealEstate.ui.rentedNotOwned'), 'color:var(--text-info);');
            } else {
                ownedRows = row(T('RealEstate.ui.monthlyRent'), `€${monthlyRent.toLocaleString()}`);
            }

            return `
                <div class="item-inspect">
                    <h3 class="title estate-06">${selectedProperty.name}</h3>
                    <div class="inspect-section-title">${T('RealEstate.ui.titleDeed')}</div>
                    ${row(t('type'), t('propertyTypes')[selectedProperty.type])}
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
            else this.refreshPropertiesInPlace();
            this.scrollSelectedIntoView();
        }

        currentListDataKey() {
            if (this._viewMode === 'companies') {
                const holdings = Object.keys($realEstateManager.companyShares || {}).length;
                return `co_${holdings}`;
            }
            const props = $realEstateManager ? $realEstateManager.properties.length : 0;
            const owned = $realEstateManager ? $realEstateManager.ownedProperties.length : 0;
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
            } else {
                const dailyYield = $realEstateManager.calculateDailyIncome();
                const ownedCount = $realEstateManager.ownedProperties.length;
                statsHTML = `
                    <div class="re-stat">
                        <span class="re-stat-lbl">${T('RealEstate.ui.liquidFunds')}</span>
                        <span class="re-stat-val" id="re-cash">€${cash.toLocaleString()}</span>
                    </div>
                    <div class="re-stat estate-09">
                        <span class="re-stat-lbl">${T('RealEstate.ui.deedsHeld')}</span>
                        <span class="re-stat-val estate-10" id="re-owned">${ownedCount} / 30</span>
                    </div>
                    <div class="re-stat estate-11">
                        <span class="re-stat-lbl">${T('RealEstate.ui.dailyYield')}</span>
                        <span class="re-stat-val" id="re-yield">€${dailyYield.toLocaleString()}</span>
                    </div>`;
                listHTML = this.buildPropertyListHTML($realEstateManager.properties, this._propertyListWindow.index());
            }

            return `
                <div class="left-page">
                    <div class="page-header-bar">
                        <div class="back-button focusable" tabindex="0" data-focus-key="re-dismiss" onclick="${this.sceneRef()}.dismiss()">${dismissText}</div>
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
            const properties = $realEstateManager.properties;
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
            const ownedCount = $realEstateManager.ownedProperties.length;
            const selectedIndex = this._propertyListWindow.index();
            const properties = $realEstateManager.properties;

            const cashEl = this._dndContainer.querySelector('#re-cash');
            if (cashEl) cashEl.textContent = `€${cash.toLocaleString()}`;
            const ownedEl = this._dndContainer.querySelector('#re-owned');
            if (ownedEl) ownedEl.textContent = `${ownedCount} / 30`;
            const yieldEl = this._dndContainer.querySelector('#re-yield');
            if (yieldEl) yieldEl.textContent = `€${dailyYield.toLocaleString()}`;

            const listDataKey = this.currentListDataKey();
            const listEl = this._dndContainer.querySelector('#estate-list');
            if (listEl) {
                if (this._reListDataKey !== listDataKey) {
                    this._reListDataKey = listDataKey;
                    listEl.innerHTML = this.buildPropertyListHTML(properties, selectedIndex);
                } else {
                    listEl.querySelectorAll('.item-slot').forEach((slot, idx) => {
                        slot.classList.toggle('selected', idx === selectedIndex);
                    });
                }
            }
            const deedWrap = this._dndContainer.querySelector('#re-deed-wrap');
            if (deedWrap) deedWrap.innerHTML = this.buildDeedHTML(properties[selectedIndex] || null);
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
                            <div class="item-slot-meta"><span>${c.sectorLabel || c.sector} • €${c.price.toLocaleString()}/${T('RealEstate.ui.sh')}</span></div>
                        </div>
                        <div class="estate-01">
                            <span class="estate-02" style="color:${statusColor}">${statusLabel}</span>
                            ${owned ? `<span class="estate-13">${c.sharesOwned.toLocaleString()} ${T('RealEstate.ui.sh')}</span>` : ''}
                        </div>
                    </div>`;
            }).join('');
        }

        buildProspectusHTML(company) {
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

            const sref = this.sceneRef();
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
                    ${row(T('RealEstate.ui.sharePrice'), `€${company.price.toLocaleString()}`, 'color:var(--text-primary-hover);')}
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

        getActiveCommands(property) {
            const commands = [];
            if (property.isOwned) {
                commands.push('sell');
            } else if (property.isRentedByPlayer) {
                commands.push('vacate');
            } else if (!$realEstateManager.isTakenByAnother(property.id)) {
                commands.push('buy', 'rent');
            }
            const effects = $realEstateManager.getActiveEffectsForLocation(property.location);
            if (effects.length > 0) {
                commands.push('info');
            }
            return commands;
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

        switchView(mode) {
            if (mode !== 'properties' && mode !== 'companies') return;
            if (this._viewMode === mode) return;
            this._viewMode = mode;
            this._dndFocusSection = 'list';
            this._companyCommandIndex = 0;
            this._dndCommandIndex = 0;
            SoundManager.playCursor();
            this.refreshUIRealEstateDOM();
        }

        toggleView() {
            this.switchView(this._viewMode === 'companies' ? 'properties' : 'companies');
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
                // TAB (or Q/E, mapped to pageup/pagedown) flips between the
                // property registry and the company exchange. Input._currentState
                // is keyed by keyMapper button names in this project, so we use
                // those rather than raw event.code strings. The clickable tabs are
                // the primary, always-working control.
                if (Input.isTriggered('tab') || Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
                    this.toggleView();
                    return;
                }

                const moved = this._viewMode === 'companies'
                    ? this.updateCompanyNav()
                    : this.updatePropertyNav();

                if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
                    SoundManager.playCancel();
                    this.dismiss();
                }

                if (moved) {
                    this.refreshUIRealEstateDOM();
                }
            }
        }

        updatePropertyNav() {
            let moved = false;
            const property = this._propertyListWindow.property();

            if (this._dndFocusSection === 'list') {
                if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    const currentIndex = this._propertyListWindow.index();
                    const maxItems = this._propertyListWindow.maxItems();
                    if (maxItems > 0) {
                        this._propertyListWindow.select(currentIndex < maxItems - 1 ? currentIndex + 1 : 0);
                        moved = true;
                    }
                } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    const currentIndex = this._propertyListWindow.index();
                    const maxItems = this._propertyListWindow.maxItems();
                    if (maxItems > 0) {
                        this._propertyListWindow.select(currentIndex > 0 ? currentIndex - 1 : maxItems - 1);
                        moved = true;
                    }
                } else if (Input.isTriggered('right') || Input.isTriggered('ok')) {
                    if (property) { this._dndFocusSection = 'commands'; this._dndCommandIndex = 0; moved = true; }
                }
            } else if (this._dndFocusSection === 'commands') {
                const cmds = property ? this.getActiveCommands(property) : [];
                const maxCmds = cmds.length;
                if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    if (maxCmds > 0) { this._dndCommandIndex = (this._dndCommandIndex + 1) % maxCmds; moved = true; }
                } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    if (maxCmds > 0) { this._dndCommandIndex = (this._dndCommandIndex - 1 + maxCmds) % maxCmds; moved = true; }
                } else if (Input.isTriggered('left')) {
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
                if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    if (maxItems > 0) { this._companyIndex = (this._companyIndex + 1) % maxItems; moved = true; }
                } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    if (maxItems > 0) { this._companyIndex = (this._companyIndex - 1 + maxItems) % maxItems; moved = true; }
                } else if (Input.isTriggered('right') || Input.isTriggered('ok')) {
                    if (company && this.getActiveCompanyCommands(company).length > 0) {
                        this._dndFocusSection = 'commands'; this._companyCommandIndex = 0; moved = true;
                    }
                }
            } else if (this._dndFocusSection === 'commands') {
                const cmds = this.getActiveCompanyCommands(company);
                const maxCmds = cmds.length;
                if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    if (maxCmds > 0) { this._companyCommandIndex = (this._companyCommandIndex + 1) % maxCmds; moved = true; }
                } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    if (maxCmds > 0) { this._companyCommandIndex = (this._companyCommandIndex - 1 + maxCmds) % maxCmds; moved = true; }
                } else if (Input.isTriggered('left')) {
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
            this._data = $realEstateManager ? $realEstateManager.properties : [];
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

            this.drawText(`${t('type')}: ${t('propertyTypes')[property.type]}`, 0, y, this.innerWidth);
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
                const baseCommands = this._property.isOwned ? 2 : 1;
                return effects.length > 0 ? baseCommands + 1 : baseCommands;
            }
            return 2;
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
                contentHTML: '<div id="real-estate-content" style="width:100%; height:100%; display:flex; flex-direction:column; background:#ece9d8; overflow:hidden"></div>'
            });
            this.appInstance = new Scene_RealEstate();
            this.appInstance._isAppMode = true;
            this.appInstance.create();
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
        const income = $realEstateManager.calculateDailyIncome();
        const goldIncome = Math.floor(income * 100);
        window.skipLocalization = true;
        $gameMessage.add(t('dailyIncomeMsg', { income: income, gold: goldIncome }));
        $gameMessage.add(t('propertiesOwnedMsg', { count: $realEstateManager.ownedProperties.length }));
        window.skipLocalization = false;

    });



    PluginManager.registerCommand(pluginName, 'forceMarketUpdate', args => {
        ensureRealEstateManager();
        $realEstateManager.processDailyUpdate();
        window.skipLocalization = true;
        $gameMessage.add(t('marketUpdatedMsg'));
        window.skipLocalization = false;
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
        getOwnedPlaces() { ensureRealEstateManager(); return $realEstateManager.getOwnedDestinations(); }
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