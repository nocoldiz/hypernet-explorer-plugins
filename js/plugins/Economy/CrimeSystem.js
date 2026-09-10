//=============================================================================
// Crime System Plugin - Enhanced Version with Italian Translation
// Version: 1.2.0
// Author: Assistant
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Crime System v1.2.0
 * @author Assistant
 * @version 1.2.0
 * @description A comprehensive crime system with extensive preset crimes and bounty tracking
 *
 * @param bountyVariable
 * @text Bounty Variable ID
 * @desc Variable ID to store bounty (default: 66)
 * @type variable
 * @default 66
 *
 * @param heatVariable
 * @text Wanted Heat Variable ID
 * @desc Variable holding how badly the police want the party, 0-100 (default: 131). Officer events wake on it.
 * @type variable
 * @default 131
 *
 * @param legacyHeatVariable
 * @text Legacy Officer Variable ID
 * @desc Off (0). Set to a variable id only to mirror the heat onto an old officer event that still reads one.
 * @type variable
 * @default 0
 *
 * @param displayDuration
 * @text Crime Display Duration
 * @desc Duration in frames to show crime notification (60 = 1 second)
 * @type number
 * @default 300
 *
 * @help CrimeSystem.js
 * 
 * This plugin adds a crime system to your game with the following features:
 * - Commit crimes with bounty values
 * - Extensive preset crime list with categories
 * - View crime history and total bounty
 * - Clear bounty and crime records
 * - Crime notification window
 * - Gold to Euro conversion (1000 gold = 10.00 euros)
 * - Italian language support
 * - Crime IDs stored in window.playerCrimes array
 * 
 * Plugin Commands:
 * - Add Crime: Add a new crime with specified bounty
 * - Add Preset Crime: Add a crime from the preset list
 * - Show Preset Crimes: Display all available preset crimes
 * - Show Crime List: Display all committed crimes and total bounty
 * - Clear Bounty: Reset bounty and crime history
 * 
 * Script Calls:
 * - CrimeSystem.addCrime("Crime Name", bounty)
 * - CrimeSystem.addPresetCrime("crimeKey")
 * - CrimeSystem.showPresetCrimes()
 * - CrimeSystem.showCrimeList()
 * - CrimeSystem.clearBounty()
 * 
 * @command addCrime
 * @text Add Crime
 * @desc Add a new crime to the player's record
 *
 * @arg crimeName
 * @text Crime Name
 * @desc Name of the crime committed
 * @type string
 * @default Theft
 *
 * @arg bountyAmount
 * @text Bounty Amount
 * @desc Bounty amount in gold for this crime
 * @type number
 * @default 100
 *
 * @command addPresetCrime
 * @text Add Preset Crime
 * @desc Add a crime from the preset list
 *
 * @arg crimeType
 * @text Crime Type
 * @desc Select a preset crime type
 * @type select
 * @option Petty Theft
 * @value pettyTheft
 * @option Pickpocketing
 * @value pickpocketing
 * @option Shoplifting
 * @value shoplifting
 * @option Burglary
 * @value burglary
 * @option Robbery
 * @value robbery
 * @option Armed Robbery
 * @value armedRobbery
 * @option Bank Robbery
 * @value bankRobbery
 * @option Grand Theft
 * @value grandTheft
 * @option Assault
 * @value assault
 * @option Battery
 * @value battery
 * @option Aggravated Assault
 * @value aggravatedAssault
 * @option Murder
 * @value murder
 * @option Manslaughter
 * @value manslaughter
 * @option Serial Killing
 * @value serialKilling
 * @option Vandalism
 * @value vandalism
 * @option Graffiti
 * @value graffiti
 * @option Arson
 * @value arson
 * @option Property Destruction
 * @value propertyDestruction
 * @option Illegal Construction
 * @value illegalConstruction
 * @option Public Disturbance
 * @value publicDisturbance
 * @option Disorderly Conduct
 * @value disorderlyConduct
 * @option Trespassing
 * @value trespassing
 * @option Breaking and Entering
 * @value breakingAndEntering
 * @option Unlawful Entry
 * @value unlawfulEntry
 * @option Drug Possession
 * @value drugPossession
 * @option Drug Dealing
 * @value drugDealing
 * @option Drug Trafficking
 * @value drugTrafficking
 * @option Smuggling
 * @value smuggling
 * @option Contraband Possession
 * @value contraband
 * @option Fraud
 * @value fraud
 * @option Embezzlement
 * @value embezzlement
 * @option Bribery
 * @value bribery
 * @option Corruption
 * @value corruption
 * @option Tax Evasion
 * @value taxEvasion
 * @option Money Laundering
 * @value moneyLaundering
 * @option Forgery
 * @value forgery
 * @option Counterfeiting
 * @value counterfeiting
 * @option Identity Theft
 * @value identityTheft
 * @option Cybercrime
 * @value cybercrime
 * @option Computer Hacking
 * @value hacking
 * @option Data Theft
 * @value dataTheft
 * @option Digital Piracy
 * @value piracy
 * @option Extortion
 * @value extortion
 * @option Blackmail
 * @value blackmail
 * @option Kidnapping
 * @value kidnapping
 * @option Hostage Taking
 * @value hostage
 * @option Human Trafficking
 * @value humanTrafficking
 * @option Slavery
 * @value slavery
 * @option Poaching
 * @value poaching
 * @option Illegal Hunting
 * @value illegalHunting
 * @option Animal Cruelty
 * @value animalCruelty
 * @option Pet Abandonment
 * @value abandonPet
 * @option Child Abandonment
 * @value abandonChild
 * @option Environmental Crime
 * @value environmentalCrime
 * @option Pollution Violation
 * @value pollutionViolation
 * @option Illegal Dumping
 * @value illegalDumping
 * @option Minor Speeding
 * @value speedingMinor
 * @option Major Speeding
 * @value speedingMajor
 * @option Reckless Driving
 * @value recklessDriving
 * @option Driving Under Influence
 * @value dui
 * @option Hit and Run
 * @value hitAndRun
 * @option Vehicle Theft
 * @value vehicleTheft
 * @option Carjacking
 * @value carjacking
 * @option Illegal Street Racing
 * @value illegalRacing
 * @option Public Intoxication
 * @value publicIntoxication
 * @option Underage Drinking
 * @value underageDrinking
 * @option Disturbing the Peace
 * @value disturbing
 * @option Loitering
 * @value loitering
 * @option Jaywalking
 * @value jaywalking
 * @option Littering
 * @value littering
 * @option Noise Pollution
 * @value noisePollution
 * @option Perjury
 * @value perjury
 * @option Contempt of Court
 * @value contemptOfCourt
 * @option Obstructing Justice
 * @value obstructingJustice
 * @option Resisting Arrest
 * @value resistingArrest
 * @option Escaping Custody
 * @value escapingCustody
 * @option Prison Break
 * @value prisonBreak
 * @option Illegal Weapons Possession
 * @value weaponsPossession
 * @option Illegal Weapons Manufacturing
 * @value illegalWeapons
 * @option Weapons Trafficking
 * @value weaponsTrafficking
 * @option Terrorism
 * @value terrorism
 * @option Bioterrorism
 * @value bioterrorism
 * @option Treason
 * @value treason
 * @option Espionage
 * @value espionage
 * @option War Crimes
 * @value warCrimes
 * @option Genocide
 * @value genocide
 * @option Crimes Against Humanity
 * @value crimesAgainstHumanity
 * @default pettyTheft
 *
 * @command showPresetCrimes
 * @text Show Preset Crimes
 * @desc Display all available preset crimes organized by category
 *
 * @command showCrimeList
 * @text Show Crime List
 * @desc Display the list of all crimes and total bounty
 *
 * @command clearBounty
 * @text Clear Bounty
 * @desc Clear all crimes and reset bounty to 0
 *
 * @command raiseHeat
 * @text Raise Wanted Heat
 * @desc Put the police on the party. Never lowers the heat; it fades on its own and dies with the bounty.
 *
 * @arg amount
 * @text Heat
 * @desc How badly they are wanted (0-100). Officers give chase from 50.
 * @type number
 * @min 0
 * @max 100
 * @default 50
 *
 * @command clearHeat
 * @text Clear Wanted Heat
 * @desc Call the manhunt off without touching the bounty.
 *
    * @command addCrimeFromVariable
 * @text Add Crime (Bounty from Variable)
 * @desc Add a new crime with bounty amount read from Variable 79
 *
 * @arg crimeName
 * @text Crime Name
 * @desc Name of the crime committed
 * @type string
 * @default Theft
 */

(() => {
    'use strict';

    const pluginName = 'CrimeSystem';
    const parameters = PluginManager.parameters(pluginName);
    const bountyVariableId = parseInt(parameters['bountyVariable'] || 66);
    const heatVariableId = parseInt(parameters['heatVariable'] || 131);
    const legacyHeatVariableId = parseInt(parameters['legacyHeatVariable'] || 0);
    const displayDuration = parseInt(parameters['displayDuration'] || 300);

    // Raised only for the duration of CrimeSystem's own write to the heat
    // variable; see the Game_Variables.setValue guard at the bottom of the file.
    let writingHeat = false;

    // ======================================================================
    // Wanted heat
    // ======================================================================
    // How badly the police want the party, 0-100, and the only thing an
    // officer event reads. It used to be Variable 85, which is the steal
    // failure reroll and nobody's idea of a wanted level: it was rolled at
    // random whenever a steal was caught, whether or not a charge was ever
    // filed, and nothing put it back down, so one botched pickpocket left the
    // party hunted for the rest of the savegame with an empty record and a
    // bounty of zero. That is the bug this whole block exists to answer.
    //
    // Four rules, and they are all the officer events need to know:
    //   - any crime raises it, by what the crime is worth;
    //   - AT ZERO THE PARTY IS COLD. An officer standing in the street does
    //     not recognise a face nobody is looking for, so the spotting sweep
    //     only ever adds to a manhunt that is already running. The one way
    //     onto their radar from cold is to walk up and talk to one;
    //   - once it is running, walking into an officer's cone of vision pins
    //     it at 100, on authored and procedural maps alike (the sweep reads
    //     $gameMap, not a map id);
    //   - it fades with the clock, so a few hours spent walking, working,
    //     waiting or sleeping it off clears it, and it can never outlive the
    //     bounty. No bounty, no manhunt.
    const HEAT_MAX = 100;
    // At and above this an officer gives chase (their page condition).
    const HEAT_CHASE = 50;
    // How long a manhunt takes to blow over on its own: full heat is shed over
    // this many in-game hours. It used to be 2 points a minute, i.e. under an
    // hour from a murder to the police having forgotten it, which is no time
    // at all when a map minute is ten walked steps. Read off the world clock
    // rather than off steps, so a night at an inn or a Bethesda-style wait
    // (TimeDateSystem's sleep advance) cools the trail exactly as fast as
    // pacing the street does.
    const HEAT_DECAY_HOURS = 4;
    const HEAT_DECAY_PER_MINUTE = HEAT_MAX / (HEAT_DECAY_HOURS * 60);
    // What stopping an officer for a chat is worth. Deliberately one short of
    // the chase, so the conversation the player asked for actually plays: the
    // page condition is still false when the interpreter picks the talk list
    // up, and the ordinary spotting sweep then pins them at 100 a moment later
    // because the party is standing right in front of the man.
    const HEAT_TALK = HEAT_CHASE - 1;
    // How far an officer can recognise a wanted party, and how wide the arc
    // they are actually looking down. An officer is not a proximity trigger:
    // they see what is in front of them, and a wall or a corner hides the
    // party the same way it hides them from a roaming monster
    // (BSE.Helpers.hasLineOfSight, the same tile walk the creatures use).
    const HEAT_SPOT_RANGE = 5;
    const HEAT_SPOT_CONE = 120;
    // Inside this many tiles they notice whoever is beside them, cone or no
    // cone: nobody walks into a constable's shoulder unseen.
    const HEAT_SPOT_TOUCH = 1;
    // The officer events read the heat themselves now (two pages apiece, the
    // arrest page conditioned on PoliceHeat >= 50; tools/crime/gen_officer_pages.js
    // wrote them). They used to read Variable 85, the steal failure reroll,
    // which is why this bridge exists at all: point the legacy parameter at a
    // variable and the chase is mirrored onto it, 6 while it is on and 0 the
    // rest of the time. It is off, and it is not a second source of truth.
    const LEGACY_CHASE_VALUE = 6;
    function isNightTime() {
        if (typeof $gameWeather !== 'undefined' && $gameWeather) {
            const mode = $gameWeather.sunlightMode;
            if (mode === 'night') return true;
            if (mode === 'day') return false;
            if ($gameWeather.currentHour !== undefined) {
                const h = $gameWeather.currentHour;
                return h >= 20 || h < 6;
            }
        }
        if (typeof $gameVariables !== 'undefined' && $gameVariables) {
            const dateStr = $gameVariables.value(113);
            if (dateStr && typeof dateStr === 'string') {
                const timePart = dateStr.split(' ')[3];
                if (timePart) {
                    const h = parseInt(timePart.split(':')[0], 10);
                    if (!isNaN(h)) return h >= 20 || h < 6;
                }
            }
        }
        return false;
    }

    // Darkness/Night advantage: applies at night on exterior maps and in maps tagged <Dark>,
    // but does NOT apply in interior maps (<Interior>) unless explicitly tagged <Dark>.
    function isDarkOrNightCrimeEnvironment() {
        if ($dataMap && $dataMap.note) {
            const note = $dataMap.note;
            if (/<Dark>/i.test(note)) return true;
            if (/<Interior>/i.test(note)) return false;
        }
        if (typeof window.isProceduralInteriorMap === "function" && window.isProceduralInteriorMap()) {
            return true;
        }
        if (window.DungeonFloors && typeof window.DungeonFloors.currentFloor === "function" && window.DungeonFloors.currentFloor() < 0) {
            return true;
        }
        if ($gameVariables && typeof $gameVariables.value(1) === "number" && $gameVariables.value(1) < 0) {
            return true;
        }
        if ($gameMap && $gameMap.mapId() === 636) {
            const data = $gameSystem && $gameSystem._procGenData;
            if (data) {
                if (data._dungeonSession && data._dungeonSession.type === "tower") return true;
                if (data.biomeLayerStack && data.biomeLayerStack.length > 0) return true;
                const b = (data.currentBiome || "").toLowerCase();
                if (b.includes("cave") || b.includes("dungeon") || b.includes("crypt") || b.includes("sewer") || b.includes("cellar") || b.includes("vault")) {
                    return true;
                }
                if (typeof window.isInteriorBiome === "function" && window.isInteriorBiome(data.currentBiome)) {
                    return false;
                }
            }
        }
        return isNightTime();
    }

    // What a crime is worth in heat: jaywalking 4, petty theft 9, murder 52,
    // genocide 86. Bounties run 15 to 500,000, so it is read on a log scale.
    // In dark/night conditions (exterior night or <Dark>), heat generated from crimes is reduced by 40% (0.6x multiplier).
    function heatForBounty(bounty) {
        const worth = Math.max(0, Number(bounty) || 0);
        if (worth <= 0) return 0;
        const baseHeat = Math.min(HEAT_MAX, Math.round(20 * Math.log10(1 + worth / 25)));
        const nightMultiplier = isDarkOrNightCrimeEnvironment() ? 0.6 : 1.0;
        return Math.max(1, Math.round(baseHeat * nightMultiplier));
    }

    // An officer is whoever answers to the police common events, or is simply
    // named as one. Procedural maps deal their populace out by name, so the
    // name is checked first and the pages only where it does not answer.
    const OFFICER_NAME = /officer|police|polizia|poliziotto|carabinier|gendarm|constable|\bcop\b/i;
    const OFFICER_COMMON_EVENTS = [124, 130];
    // Is the party inside the arc this officer is facing? The maths is the one
    // the roaming creatures use for their own sight cones.
    function inSightCone(officer, tx, ty, cone) {
        if (!cone || cone >= 360) return true;
        const dx = tx - officer.x;
        const dy = ty - officer.y;
        let along, perp;
        switch (officer.direction()) {
            case 2: along = dy; perp = Math.abs(dx); break;
            case 8: along = -dy; perp = Math.abs(dx); break;
            case 6: along = dx; perp = Math.abs(dy); break;
            case 4: along = -dx; perp = Math.abs(dy); break;
            default: return true;
        }
        if (along <= 0) return false;
        return perp <= along * Math.tan((cone / 2) * Math.PI / 180);
    }

    // A wall between them hides the party. Borrowed from the encounter system
    // so a constable and a wolf read the same corner the same way; without it
    // the check falls back to plain distance.
    function hasSightLine(x0, y0, x1, y1) {
        const helpers = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
        if (helpers && helpers.hasLineOfSight) return helpers.hasLineOfSight(x0, y0, x1, y1);
        return true;
    }

    function isOfficerEvent(gameEvent) {
        const data = gameEvent && gameEvent.event && gameEvent.event();
        if (!data) return false;
        if (OFFICER_NAME.test(data.name || "")) return true;
        for (const page of data.pages || []) {
            for (const cmd of page.list || []) {
                if (cmd.code === 117 && OFFICER_COMMON_EVENTS.includes(cmd.parameters[0])) return true;
            }
        }
        return false;
    }

    // Language check
    const useTranslation = ConfigManager.language === 'it';
    const PresetCrimes = (window.Messages && window.Messages.PresetCrimes) || {};

    // Helper function to get game date from variable 113
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

    // Format game date as readable string
    function getGameDateTimeString() {
        const gameDate = getGameDateFromVariable();
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const monthStr = monthNames[gameDate.month];
        const dayStr = String(gameDate.day).padStart(2, '0');
        const yearStr = gameDate.year;
        const hoursStr = String(gameDate.hours).padStart(2, '0');
        const minutesStr = String(gameDate.minutes).padStart(2, '0');
        return `${dayStr} ${monthStr} ${yearStr} ${hoursStr}:${minutesStr}`;
    }

    // The copy lives in js/i18n/<lang>/plugins/Crime.json.
    // Get localized text
    const gettext = (key) => T('Crime.text.' + String(key || ''));

    // Crime System Class
    // ======================================================================
    // What a crime teaches
    // ======================================================================
    // Crime is a trade, and doing it is how it is learned. Every preset crime
    // funnels through addCrime with its key, so this one table covers all of
    // them. Points ride the bounty through awardForValue: the game already
    // uses the bounty to say how serious the act was, so a shoplifting teaches
    // a fraction of a point and a bank job teaches several.
    // i18n-ignore-start  Specialization.json names, matched not shown
    const CRIME_SPECS = {
    // Pickpocketing
    pettyTheft: "Pickpocketing",
    pickpocketing: "Pickpocketing",
    shoplifting: "Pickpocketing",
    // Lockpicking
    burglary: "Lockpicking",
    graverobbing: "Lockpicking",
    breakingAndEntering: "Lockpicking",
    unlawfulEntry: "Lockpicking",
    trespassing: "Lockpicking",
    // Safecracking
    bankRobbery: "Safecracking",
    // Intimidation
    robbery: "Intimidation",
    armedRobbery: "Intimidation",
    grandTheft: "Intimidation",
    extortion: "Intimidation",
    blackmail: "Intimidation",
    humanTrafficking: "Intimidation",
    slavery: "Intimidation",
    // Car Driving
    vehicleTheft: "Car Driving",
    carjacking: "Car Driving",
    speedingMinor: "Car Driving",
    speedingMajor: "Car Driving",
    recklessDriving: "Car Driving",
    dui: "Car Driving",
    hitAndRun: "Car Driving",
    illegalRacing: "Car Driving",
    // Escape Artistry
    escapingCustody: "Escape Artistry",
    prisonBreak: "Escape Artistry",
    resistingArrest: "Escape Artistry",
    // Streetwise
    loitering: "Streetwise",
    jaywalking: "Streetwise",
    littering: "Streetwise",
    noisePollution: "Streetwise",
    fareEvasion: "Streetwise",
    disturbing: "Streetwise",
    publicDisturbance: "Streetwise",
    disorderlyConduct: "Streetwise",
    graffiti: "Streetwise",
    vandalism: "Streetwise",
    illegalConstruction: "Streetwise",
    drugDealing: "Streetwise",
    drugTrafficking: "Streetwise",
    // Alcohol Tolerance
    publicIntoxication: "Alcohol Tolerance",
    underageDrinking: "Alcohol Tolerance",
    // Demolitions
    arson: "Demolitions",
    propertyDestruction: "Demolitions",
    terrorism: "Demolitions",
    // Boxing
    assault: "Boxing",
    battery: "Boxing",
    aggravatedAssault: "Boxing",
    // Ambush Tactics
    murder: "Ambush Tactics",
    manslaughter: "Ambush Tactics",
    serialKilling: "Ambush Tactics",
    // Chemistry
    bioterrorism: "Chemistry",
    drugPossession: "Chemistry",
    environmentalCrime: "Chemistry",
    pollutionViolation: "Chemistry",
    illegalDumping: "Chemistry",
    // Shipping
    smuggling: "Shipping",
    contraband: "Shipping",
    weaponsTrafficking: "Shipping",
    // Deception
    fraud: "Deception",
    embezzlement: "Deception",
    taxEvasion: "Deception",
    bribery: "Deception",
    corruption: "Deception",
    perjury: "Deception",
    // Money Laundering
    moneyLaundering: "Money Laundering",
    // Counterfeiting
    forgery: "Counterfeiting",
    counterfeiting: "Counterfeiting",
    identityTheft: "Counterfeiting",
    // Hacking
    cybercrime: "Hacking",
    hacking: "Hacking",
    dataTheft: "Hacking",
    piracy: "Hacking",
    // Interrogation
    kidnapping: "Interrogation",
    hostage: "Interrogation",
    // Hunting
    poaching: "Hunting",
    illegalHunting: "Hunting",
    animalCruelty: "Hunting",
    // Law
    contemptOfCourt: "Law",
    obstructingJustice: "Law",
    // Ammunition Handloading
    weaponsPossession: "Ammunition Handloading",
    illegalWeapons: "Ammunition Handloading",
    // Espionage
    treason: "Espionage",
    espionage: "Espionage",
    // Guerilla Warfare
    warCrimes: "Guerilla Warfare",
    genocide: "Guerilla Warfare",
    crimesAgainstHumanity: "Guerilla Warfare",
    };

    // Somebody who knows the work leaves less behind for the nEuroPolice to
    // find, so the same act attracts a smaller bounty (Streetwise, 6304 band).
    // Floored at 70%: getting good at crime never makes it free.
    function bountyAfterStreetwise(amount) {
        if (!(amount > 0) || !window.SpecializationXP) return amount;
        return Math.round(amount * window.SpecializationXP.discount("Streetwise", 0.06, 0.7));
    }

    class CrimeSystem {
        // There is no law in an empty world, because there is nobody left to
        // keep it (WorldManager.populationMode). Read rather than cached: the
        // answer belongs to the world, and a session can change worlds.
        static isEmptyWorld() {
            const WM = window.WorldManager;
            return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
        }

        static initialize() {
            if (!$dataSystem.switches) return;

            // Initialize crime data if not exists
            if (!$gameSystem._crimeData) {
                $gameSystem._crimeData = {
                    crimes: [],
                    totalBounty: 0
                };
            }

            // Initialize window.playerCrimes array
            if (!window.playerCrimes) {
                window.playerCrimes = [];
            }
        }

        // ------------------------------------------------------------------
        // The record and the variable say the same thing
        // ------------------------------------------------------------------
        // The bounty lives in two places: the itemised record in $gameSystem
        // (per savegame, in the binary save) and the variable the HUD, the
        // officer events and the trial all read. window.playerCrimes is worse
        // than either, being a window global that survives a savegame swap
        // inside one session, so a fresh party inherited the last one's
        // charges. Reconciled here on new game and on load.
        static syncBounty() {
            this.initialize();
            if (!$gameVariables) return;

            const data = $gameSystem._crimeData;
            const shown = $gameVariables.value(bountyVariableId) || 0;

            if (data.crimes.length) {
                if (shown <= 0) {
                    // Settled somewhere that only wrote the variable (time
                    // served, a pardon, a savegame written before this):
                    // the sheet goes with it, or the next crime committed
                    // re-totals it and hands the party their old bounty back.
                    data.crimes = [];
                    data.totalBounty = 0;
                } else {
                    this.recalculateBounty();
                }
            } else if (shown < 0) {
                $gameVariables.setValue(bountyVariableId, 0);
            }

            window.playerCrimes = data.crimes.map(c => c.id).filter(Boolean);
            $gameSystem._crimeHeatMinute = this.worldMinute();
            this.updateHeat();
        }

        // ------------------------------------------------------------------
        // Heat
        // ------------------------------------------------------------------
        static worldMinute() {
            return ($gameVariables && Number($gameVariables.value(114))) || 0;
        }

        static getHeat() {
            if (!$gameVariables) return 0;
            return Math.max(0, Number($gameVariables.value(heatVariableId)) || 0);
        }

        static setHeat(value) {
            if (!$gameVariables) return 0;
            const next = Math.max(0, Math.min(HEAT_MAX, Math.round(value) || 0));
            if (next === this.getHeat()) {
                this.syncLegacyHeat();
                return next;
            }
            this.writeHeat(next);
            this.syncLegacyHeat();
            // The officer pages are conditioned on it, so the map has to
            // re-read them for a chase to start or stop.
            if ($gameMap) $gameMap.requestRefresh();
            return next;
        }

        // Bridge to the officer events as they stand today (see LEGACY_CHASE_VALUE).
        static syncLegacyHeat() {
            if (!legacyHeatVariableId || !$gameVariables) return;
            const want = this.isWanted() ? LEGACY_CHASE_VALUE : 0;
            if (($gameVariables.value(legacyHeatVariableId) || 0) === want) return;
            $gameVariables.setValue(legacyHeatVariableId, want);
            if ($gameMap) $gameMap.requestRefresh();
        }

        // The only door through the setValue guard. Everything that moves the
        // wanted level goes through setHeat, and setHeat goes through here.
        static writeHeat(value) {
            writingHeat = true;
            try {
                $gameVariables.setValue(heatVariableId, value);
            } finally {
                writingHeat = false;
            }
        }

        static clearHeat() {
            return this.setHeat(0);
        }

        // A new party is cold, and so is one whose savegame was written while
        // some other system was scribbling in the variable.
        static resetHeat() {
            if (!$gameVariables) return;
            this.writeHeat(0);
            if ($gameSystem) $gameSystem._crimeHeatMinute = this.worldMinute();
            this.syncLegacyHeat();
        }

        static isWanted() {
            return this.getHeat() >= this.heatChaseThreshold();
        }

        // The heat as the menu prints it.
        static heatPercent() {
            return Math.round((this.getHeat() / HEAT_MAX) * 100);
        }

        // In dark/night conditions, officers are less aggressive and require higher heat (65) to actively chase
        static heatChaseThreshold() {
            return isDarkOrNightCrimeEnvironment() ? 65 : HEAT_CHASE;
        }

        // ==================================================================
        // Notoriety: what the rest of the world makes of the party's record
        // ==================================================================
        // The wanted level used to be read by three things, all of them
        // screens: the custody desk, the trial and the pause menu. Everybody
        // else - shops, couriers, bus stations, employers - sold to a fugitive
        // at the same price as to a stranger. This is the one question they all
        // ask now, so the answer is defined once instead of five times.
        //
        // Two axes, deliberately, because they say different things. The BOUNTY
        // is the record: what the party has done, permanent until it is paid or
        // pardoned, and it is what an honest trader has heard about. The HEAT is
        // the manhunt: whether anyone is actively looking right now, and it is
        // what makes a public counter dangerous to stand at. A retired highway
        // robber with a large unpaid bounty and no heat is served, dearly. A
        // party at full heat over a stolen apple is not served at all.
        static NOTORIETY_TIERS = ['clean', 'known', 'wanted', 'notorious'];
        // Bounty in gold at which a trader has heard the name at all, and at
        // which they have heard enough to want nothing to do with it.
        static NOTORIETY_KNOWN_BOUNTY = 500;
        static NOTORIETY_NOTORIOUS_BOUNTY = 5000;

        static notoriety() {
            const bounty = this.getTotalBounty();
            const heat = this.getHeat();
            const wanted = this.isWanted();
            let tier = 'clean';
            if (bounty >= this.NOTORIETY_NOTORIOUS_BOUNTY) tier = 'notorious';
            else if (wanted || bounty >= this.NOTORIETY_KNOWN_BOUNTY) tier = 'wanted';
            else if (bounty > 0) tier = 'known';
            // A live manhunt is never less than "wanted", whatever the record.
            if (wanted && tier === 'known') tier = 'wanted';
            return {
                bounty, heat, wanted, tier,
                percent: this.heatPercent(),
                index: this.NOTORIETY_TIERS.indexOf(tier),
            };
        }

        // What a counter charges the party, as a multiplier on the marked
        // price. A face that is trouble to be seen serving costs extra to
        // serve; nobody gives a discount for a criminal record.
        static priceMultiplier() {
            switch (this.notoriety().tier) {
                case 'known': return 1.05;
                case 'wanted': return 1.2;
                case 'notorious': return 1.45;
                default: return 1;
            }
        }

        // Whether a business open to the public will deal with the party at
        // all. Only the top tier, so this closes a door rather than the town:
        // the black market, a fence and anything already illegal never asks.
        static refusesService() {
            return this.notoriety().tier === 'notorious';
        }

        // Whether a service that puts the party on a passenger list, a payroll
        // or a delivery manifest will take them: that is a written record with
        // their name on it, so it is refused a whole tier earlier than a
        // counter sale is.
        static refusesRegisteredService() {
            return this.notoriety().index >= this.NOTORIETY_TIERS.indexOf('wanted');
        }

        // ------------------------------------------------------------------
        // Wanted heat, spotting and decay
        // ------------------------------------------------------------------
        // Called on map updates. Having an officer lay eyes on and
        // recognise a party who is ALREADY being hunted pins it at full, and
        // otherwise the trail cools with the clock (faster in dark/night conditions).
        static updateHeat() {
            if (!$gameVariables) return;
            const now = this.worldMinute();
            const heat = this.getHeat();
            // Whatever else happens this tick, the officer events are told the
            // truth: StealCaught still rolls the legacy variable behind us.
            this.syncLegacyHeat();

            if (($gameVariables.value(bountyVariableId) || 0) <= 0) {
                $gameSystem._crimeHeatMinute = now;
                if (heat > 0) this.clearHeat();
                return;
            }

            // Cold is cold. A bounty on a sheet nobody is currently chasing is
            // not a face in every constable's mind, so an officer walked past
            // at heat 0 takes no notice: the sweep can only feed a manhunt that
            // is already running. Talking to one is the way back onto it.
            if (heat <= 0) {
                $gameSystem._crimeHeatMinute = now;
                return;
            }

            if (this.officerInSight()) {
                $gameSystem._crimeHeatMinute = now;
                this.setHeat(HEAT_MAX);
                return;
            }

            const since = $gameSystem._crimeHeatMinute;
            if (typeof since !== 'number' || since > now) {
                $gameSystem._crimeHeatMinute = now;
                return;
            }
            const minutes = now - since;
            if (minutes <= 0) return;
            // Trails cool 50% faster in dark/night conditions
            const decayRate = isDarkOrNightCrimeEnvironment() ? (HEAT_DECAY_PER_MINUTE * 1.5) : HEAT_DECAY_PER_MINUTE;
            const shed = Math.floor(minutes * decayRate);
            if (shed < 1) return;
            // Spend only the minutes that paid for a whole point. At this rate
            // a point costs a couple of minutes, so moving the anchor to `now`
            // would throw the remainder away on every tick and the trail would
            // never actually cool; carrying it is what makes an hour of waiting
            // worth an hour however often this is called.
            $gameSystem._crimeHeatMinute = since + shed / decayRate;
            this.setHeat(heat - shed);
        }

        // Has an officer laid eyes on a wanted party? Read off the live map, so
        // a procedural settlement's constable counts exactly as much as a
        // hand-placed one, and read as sight rather than as proximity: inside
        // their range, inside the arc they are facing, and with nothing in the
        // way. Walking behind one is how you get past them.
        static officerInSight() {
            return !!this.spottingOfficer();
        }

        static spottingOfficer() {
            if (!$gameMap || !$gamePlayer || !SceneManager._scene) return null;
            const scene = SceneManager._scene;
            if (!(scene instanceof Scene_Map)) return null;
            // Nobody is being watched while the screen is black or waiting
            if (scene._sleepSequenceState || scene._sleepAdvance || scene._waitAdvance || scene._cryoSequenceState || (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward)) return null;
            const px = $gamePlayer.x;
            const py = $gamePlayer.y;
            // In dark/night conditions, visibility is reduced: shorter spot range (3 tiles) and narrower cone (75°)
            const isDarkOrNight = isDarkOrNightCrimeEnvironment();
            const spotRange = isDarkOrNight ? 3 : HEAT_SPOT_RANGE;
            const spotCone = isDarkOrNight ? 75 : HEAT_SPOT_CONE;

            for (const ev of $gameMap.events()) {
                if (!ev || ev._erased) continue;
                const dx = Math.abs($gameMap.deltaX(ev.x, px));
                const dy = Math.abs($gameMap.deltaY(ev.y, py));
                if (dx > spotRange || dy > spotRange) continue;
                const distance = dx + dy;
                if (distance > spotRange) continue;
                if (!isOfficerEvent(ev)) continue;
                if (distance > HEAT_SPOT_TOUCH) {
                    if (!inSightCone(ev, px, py, spotCone)) continue;
                    if (!hasSightLine(ev.x, ev.y, px, py)) continue;
                }
                return ev;
            }
            return null;
        }

        // Only ever raises it, never lowers it: the decay and the settlement of
        // the record are the only two things that bring it down.
        static raiseHeat(amount) {
            const next = Math.max(this.getHeat(), Math.round(amount) || 0);
            $gameSystem._crimeHeatMinute = this.worldMinute();
            return this.setHeat(next);
        }

        static addCrime(crimeName, bountyAmount, crimeId = null) {
            this.initialize();

            // A crime needs somebody to have been wronged and somebody left to
            // answer to. An empty world has neither: nothing is filed, no
            // bounty is totalled, no heat is raised and the whole apparatus
            // (police, trial, the N€police portal) stays inert, because they
            // all read the charge sheet this would have written to.
            if (this.isEmptyWorld()) {
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(T('Crime.nobodyLeftToJudgeYou'));
                }
                return;
            }

            // Sandbox mode: the player self-pardons on the spot, no bounty added.
            const isSandbox = !!($gameSystem && $gameSystem._isSandboxMode);
            if (isSandbox) {
                bountyAmount = 0;
            }

            // After defeating Eris in her challenge, the bounty system no longer
            // grows: new crimes are still recorded, but they add nothing.
            if ($gameSystem && $gameSystem._erisBountyImmunity) {
                bountyAmount = 0;
            }

            // A professional attracts less attention. Applied after the two
            // early-outs above, so a pardoned or immune crime stays at zero.
            bountyAmount = bountyAfterStreetwise(bountyAmount);

            // ...and an officer of the law signs their own report. A Police
            // Officer travelling with the party can write off charges worth
            // 5000 gold a day per level of rank, and a second officer signs for
            // their own allowance on top. What the badge covers never reaches
            // the record at all: it was done in the name of the law.
            const lawful = this.trySelfPardon(bountyAmount);
            if (lawful) bountyAmount = 0;

            // Doing it is the lesson. The leader is the one who did it, so no
            // onlooker share, and nothing is learned from a crime the game has
            // decided did not happen (sandbox self-pardon / Eris immunity).
            if (crimeId && CRIME_SPECS[crimeId] && bountyAmount > 0 && window.SpecializationXP) {
                window.SpecializationXP.awardForValue(CRIME_SPECS[crimeId], bountyAmount, { soloist: true });
            }

            const crime = {
                name: crimeName,
                bounty: bountyAmount,
                id: crimeId,
                timestamp: getGameDateTimeString()
            };

            $gameSystem._crimeData.crimes.push(crime);
            $gameSystem._crimeData.totalBounty += bountyAmount;

            // Add crime ID to window.playerCrimes if provided
            if (crimeId) {
                window.playerCrimes.push(crimeId);
            }

            // Update bounty variable
            if ($gameVariables) $gameVariables.setValue(bountyVariableId, $gameSystem._crimeData.totalBounty);

            // The police hear about it: what the act was worth is what it adds
            // to how badly they want the party. ANY charge that lands on the
            // record moves it, so the smallest offence is still worth a point
            // after the log scale and the Streetwise discount have rounded its
            // own share away, and a party who had gone cold is being looked for
            // again the moment they do something. A crime the game has decided
            // did not happen (sandbox self-pardon, Eris immunity) carries no
            // bounty and so raises nothing, which is the standing rule.
            if (bountyAmount > 0) {
                this.raiseHeat(this.getHeat() + Math.max(1, heatForBounty(bountyAmount)));
            }

            // What the papers will make of it, if the day adds up to enough.
            this.recordForPress(crimeName, bountyAmount);

            // Show crime notification
            if (lawful) {
                this.showLawfulPardonNotification(crimeName, lawful);
            } else if (isSandbox) {
                this.showSelfPardonNotification(crimeName);
            } else {
                this.showCrimeNotification(crimeName, bountyAmount);
            }
        }

        // ==================================================================
        // The badge: charges signed off in the name of the law
        // ==================================================================
        // A Police Officer in the party (the Probable Cause passive, class 44)
        // carries a daily allowance of charges they may write off as lawful
        // acts: 5000 gold per level of rank, per officer. It is spent charge by
        // charge, the whole of a charge or none of it, and it fills back up
        // when the world clock turns over. Everything about the allowance lives
        // in BattleSystemPassiveSkills; everything about the ledger lives here.

        static pardonLedger() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
            const day = this.worldDay();
            const led = $gameSystem._policePardon;
            if (!led || led.day !== day) {
                $gameSystem._policePardon = { day, spent: 0 };
            }
            return $gameSystem._policePardon;
        }

        // The day's allowance in gold, and what is left of it.
        static selfPardonAllowance() {
            const P = window.BattleSystemPassiveSkills;
            return (P && P.selfPardonAllowance) ? P.selfPardonAllowance() : 0;
        }

        static selfPardonRemaining() {
            const led = this.pardonLedger();
            if (!led) return 0;
            return Math.max(0, this.selfPardonAllowance() - (led.spent || 0));
        }

        // Spend the allowance on one charge, all of it or none. Returns the
        // name of the officer who signed for it, or null when nobody can.
        static trySelfPardon(bountyAmount) {
            const worth = Number(bountyAmount) || 0;
            if (worth <= 0) return null;
            const P = window.BattleSystemPassiveSkills;
            const officer = (P && P.pardonOfficer) ? P.pardonOfficer() : null;
            if (!officer) return null;
            if (this.selfPardonRemaining() < worth) return null;
            const led = this.pardonLedger();
            if (!led) return null;
            led.spent = (led.spent || 0) + worth;
            return officer.name ? officer.name() : '';
        }

        static showLawfulPardonNotification(crimeName, officerName) {
            if (!(SceneManager._scene instanceof Scene_Map)) return;
            if (!window.ParchmentToast) return;
            window.ParchmentToast.show(
                T('Crime.text.lawfulPardon', { name: officerName, crime: crimeName }),
                {
                    severity: 'info',
                    duration: displayDuration,
                    key: `lawful:${crimeName}`
                }
            );
        }

        // ==================================================================
        // The press
        // ==================================================================
        // A day's worth of small thefts is nobody's headline. A day that adds
        // up to a real bounty is, and the paper runs it the morning after,
        // with the charges named and the total the party is now wanted for.
        // The record kept here is the day's tally; NewsSystem drains the queue
        // and writes the article, so nothing here knows how a paper is set.
        static PRESS_EUROS = 10000;          // the day's bounty that makes the front page

        static pressEurosToGold(euros) { return euros * 100; }

        // The day the world clock is on, counted from its own zero. Variable
        // 114 is the world minute every other simulation counts in.
        static worldDay() {
            return Math.floor(this.worldMinute() / 1440);
        }

        static pressLedger() {
            if (!$gameSystem) return null;
            if (!$gameSystem._crimePress) {
                $gameSystem._crimePress = { day: null, gold: 0, charges: {}, reported: false, queue: [] };
            }
            const led = $gameSystem._crimePress;
            if (!Array.isArray(led.queue)) led.queue = [];
            return led;
        }

        static recordForPress(crimeName, bountyAmount) {
            const led = this.pressLedger();
            if (!led || !(bountyAmount > 0) || this.isEmptyWorld()) return;
            const day = this.worldDay();
            if (led.day !== day) {
                led.day = day;
                led.gold = 0;
                led.charges = {};
                led.reported = false;
            }
            led.gold += bountyAmount;
            led.charges[crimeName] = (led.charges[crimeName] || 0) + 1;

            if (!led.reported && led.gold >= this.pressEurosToGold(this.PRESS_EUROS)) {
                led.reported = true;
                this.fileWithPress({ charges: led.charges, dayGold: led.gold, publishDay: day + 1 });
            }
        }

        // A dossier the paper has but has not printed yet. `publishDay` is the
        // world day it runs on: the morning after for a day's work, the day
        // before for a life the party arrived already carrying.
        static fileWithPress(dossier) {
            const led = this.pressLedger();
            if (!led) return null;
            const entry = {
                publishDay: dossier.publishDay != null ? dossier.publishDay : this.worldDay() + 1,
                charges: Object.entries(dossier.charges || {}).map(([name, count]) => ({ name, count })),
                dayGold: dossier.dayGold || 0,
                totalGold: this.getTotalBounty(),
                pastLife: !!dossier.pastLife
            };
            led.queue.push(entry);
            if (led.queue.length > 8) led.queue.shift();
            return entry;
        }

        // The criminal origin: the party walks in already wanted, so the story
        // ran the day before they did.
        static filePastLifeWithPress(crimeName, bountyAmount) {
            return this.fileWithPress({
                charges: { [crimeName]: 1 },
                dayGold: bountyAmount,
                publishDay: this.worldDay() - 1,
                pastLife: true
            });
        }

        // Everything the paper may print by now, taken off the queue.
        static takePressDossiers() {
            const led = this.pressLedger();
            if (!led) return [];
            const day = this.worldDay();
            const due = led.queue.filter(e => e.publishDay <= day);
            if (!due.length) return [];
            led.queue = led.queue.filter(e => e.publishDay > day);
            return due;
        }

        static showSelfPardonNotification(crimeName) {
            if (!(SceneManager._scene instanceof Scene_Map)) return;
            if (!window.ParchmentToast) return;
            window.ParchmentToast.show(
                `<div class="crime-notif-row">` +
                    `<span class="crime-notif-name">${crimeName}</span>` +
                    `<span class="crime-notif-bounty">${gettext('selfPardon')}</span>` +
                `</div>`,
                {
                    severity: 'info',
                    duration: displayDuration,
                    html: true,
                    // Two pardons for the same offence are two events, so the
                    // second must not simply refresh the first one's timer.
                    key: `pardon:${crimeName}:${Date.now()}`
                }
            );
        }

        // The name a preset crime is charged under. PresetCrimes.json carries the
        // English wording and, in name_int, the key holding it in every language
        // (js/i18n/<lang>/crime.json), so the record reads in the player's
        // language rather than always in English.
        static presetCrimeName(crimeKey) {
            const crime = PresetCrimes[crimeKey];
            if (!crime) return '';
            if (crime.name_int && T.has(crime.name_int)) return T(crime.name_int);
            return crime.name;
        }

        static addPresetCrime(crimeKey) {
            const crime = PresetCrimes[crimeKey];
            if (crime) {
                // Pass the crimeKey as the ID
                this.addCrime(this.presetCrimeName(crimeKey), crime.bounty, crimeKey);
            } else {
                window.skipLocalization = true;
                $gameMessage.add(`\\C[2]${gettext('errorUnknown')}\\C[0] ${crimeKey}`);
                window.skipLocalization = false;

            }
        }

        static showPresetCrimes() {
            // Group crimes by category
            const categories = {};
            for (const [key, crime] of Object.entries(PresetCrimes)) {
                if (!categories[crime.category]) {
                    categories[crime.category] = [];
                }
                categories[crime.category].push({ key, ...crime });
            }

            let message = `\\C[3]${gettext('availableCrimes')}\\C[0]\n\n`;

            for (const [category, crimes] of Object.entries(categories)) {
                message += `\\C[1]${category}:\\C[0]\n`;
                crimes.forEach(crime => {
                    message += `• ${crime.name} - ${this.goldToEuros(crime.bounty)}\n`;
                });
                message += "\n";
            }
            window.skipLocalization = true;

            $gameMessage.add(message);
            window.skipLocalization = false;

        }

        static showCrimeNotification(crimeName, bountyAmount) {
            if (bountyAmount <= 0 || !Number.isFinite(bountyAmount)) return;
            if (!(SceneManager._scene instanceof Scene_Map)) return;
            if (!window.ParchmentToast) return;
            const totalBounty = this.getTotalBounty();
            window.ParchmentToast.show(
                `<div class="crime-notif-row">` +
                    `<span class="crime-notif-name">${crimeName}</span>` +
                    `<span class="crime-notif-bounty">${this.goldToEuros(bountyAmount)}</span>` +
                `</div>` +
                `<div class="crime-notif-total">${gettext('total')}: ${this.goldToEuros(totalBounty)}</div>`,
                {
                    severity: 'danger',
                    duration: displayDuration,
                    html: true,
                    // Committing the same crime twice is two charges: each one
                    // gets its own popup instead of refreshing the last.
                    key: `crime:${crimeName}:${totalBounty}`
                }
            );
        }

        static showCrimeList() {
            this.initialize();

            const crimeData = $gameSystem._crimeData;
            let message = `\\C[2]${gettext('crimeRecord')}\\C[0]\n\n`;

            if (crimeData.crimes.length === 0) {
                message += gettext('noCrimes');
            } else {
                message += `${gettext('totalBounty')}: \\C[3]${this.goldToEuros(crimeData.totalBounty)}\\C[0]\n\n`;
                message += `\\C[1]${gettext('crimesCommitted')}\\C[0]\n`;

                crimeData.crimes.forEach((crime, index) => {
                    const timeStr = crime.timestamp ? ` [${crime.timestamp}]` : '';
                    message += `${index + 1}. ${crime.name} - ${this.goldToEuros(crime.bounty)}${timeStr}\n`;
                });
            }
            window.skipLocalization = true;

            $gameMessage.add(message);
            window.skipLocalization = false;

        }

        // options.silent: settle the record without the message box, for the
        // callers that are already in the middle of their own scene (a prison
        // release, an acquittal).
        static clearBounty(options) {
            this.initialize();

            $gameSystem._crimeData = {
                crimes: [],
                totalBounty: 0
            };

            // Clear window.playerCrimes array
            window.playerCrimes = [];

            // Reset bounty variable
            if ($gameVariables) $gameVariables.setValue(bountyVariableId, 0);
            // Forgiven crimes call the manhunt off with them.
            this.clearHeat();

            if (options && options.silent) return;
            window.skipLocalization = true;

            $gameMessage.add(`\\C[3]${gettext('bountyCleared')}\\C[0]\n${gettext('allCrimesForgi')}`);
            window.skipLocalization = false;

        }

        static goldToEuros(goldAmount) {
            const euros = (goldAmount / 1000) * 10;
            return euros.toFixed(2) + "€";
        }

        static getTotalBounty() {
            this.initialize();
            return $gameSystem._crimeData.totalBounty || 0;
        }

        static getPresetCrime(crimeKey) {
            return PresetCrimes[crimeKey] || null;
        }

        static getAllPresetCrimes() {
            return PresetCrimes;
        }

        static getPlayerCrimes() {
            this.initialize();
            return window.playerCrimes || [];
        }

        static getCrimes() {
            this.initialize();
            return ($gameSystem._crimeData && $gameSystem._crimeData.crimes) || [];
        }

        // Drop a single charge from the record (a settled fine, a dismissed
        // count) and re-total the bounty from what is left.
        static removeCrime(index) {
            this.initialize();
            const crimes = this.getCrimes();
            if (index < 0 || index >= crimes.length) return null;
            const removed = crimes.splice(index, 1)[0];

            if (removed.id && window.playerCrimes) {
                const at = window.playerCrimes.indexOf(removed.id);
                if (at > -1) window.playerCrimes.splice(at, 1);
            }
            this.recalculateBounty();
            return removed;
        }

        static recalculateBounty() {
            this.initialize();
            const total = this.getCrimes().reduce((sum, c) => sum + (c.bounty || 0), 0);
            if ($gameSystem._crimeData) $gameSystem._crimeData.totalBounty = total;
            if ($gameVariables) $gameVariables.setValue(bountyVariableId, total);
            if (total <= 0) this.clearHeat();
            return total;
        }

        // Settle the bounty down to a figure rather than by named charge (time
        // served in a cell grinds it down by the minute). It is written onto
        // the record, oldest charge first, because writing the variable alone
        // left the sheet standing and the next crime committed re-totalled it,
        // handing the party back everything they had already paid for.
        static setTotalBounty(amount) {
            this.initialize();
            const target = Math.max(0, Math.round(amount) || 0);
            if (target <= 0) {
                this.clearBounty({ silent: true });
                return 0;
            }

            const crimes = this.getCrimes();
            if (!crimes.length) {
                // Nothing itemised to trim (a bounty set outright by a debug
                // tool or an event): the variable is all there is.
                if ($gameVariables) $gameVariables.setValue(bountyVariableId, target);
                if ($gameSystem._crimeData) $gameSystem._crimeData.totalBounty = target;
                return target;
            }

            let total = crimes.reduce((sum, c) => sum + (c.bounty || 0), 0);
            while (crimes.length && total > target) {
                const oldest = crimes[0];
                const worth = oldest.bounty || 0;
                if (worth <= total - target) {
                    total -= worth;
                    this.removeCrime(0);
                } else {
                    oldest.bounty = worth - (total - target);
                    total = target;
                }
            }
            return this.recalculateBounty();
        }
    }

    // Plugin Commands
    PluginManager.registerCommand(pluginName, "addCrime", args => {
        const crimeName = String(args.crimeName);
        const bountyAmount = Number(args.bountyAmount) || 0;
        CrimeSystem.addCrime(crimeName, bountyAmount);
    });

    PluginManager.registerCommand(pluginName, "addPresetCrime", args => {
        const crimeType = String(args.crimeType);
        CrimeSystem.addPresetCrime(crimeType);
    });

    PluginManager.registerCommand(pluginName, "showPresetCrimes", args => {
        CrimeSystem.showPresetCrimes();
    });

    PluginManager.registerCommand(pluginName, "showCrimeList", args => {
        CrimeSystem.showCrimeList();
    });

    PluginManager.registerCommand(pluginName, "clearBounty", args => {
        CrimeSystem.clearBounty();
    });
    PluginManager.registerCommand(pluginName, "addCrimeFromVariable", args => {
        const crimeName = String(args.crimeName);
        // Variable 79 holds what was being lifted. Most of what an NPC carries
        // is priced at 0, and filing nothing while StealCaught still called out
        // the police is what put officers on a party with an empty record: a
        // caught thief is charged with petty theft at the least.
        const stolenValue = Number($gameVariables.value(79)) || 0;
        const preset = CrimeSystem.getPresetCrime('pettyTheft');
        const bountyAmount = Math.max(stolenValue, (preset && preset.bounty) || 0);
        if (bountyAmount > 0) CrimeSystem.addCrime(crimeName, bountyAmount, 'pettyTheft');
    });

    PluginManager.registerCommand(pluginName, "raiseHeat", args => {
        CrimeSystem.raiseHeat(Number(args.amount) || 0);
    });

    PluginManager.registerCommand(pluginName, "clearHeat", () => {
        CrimeSystem.clearHeat();
    });
    // Global access for script calls
    window.CrimeSystem = CrimeSystem;
    window.PresetCrimes = PresetCrimes;

    // Initialize on new game or load game
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function () {
        _DataManager_createGameObjects.call(this);
        CrimeSystem.initialize();
        // A new party starts with a clean sheet even when the session has one
        // loaded already: playerCrimes is a window global, not save data.
        window.playerCrimes = [];
        // ...and cold. Variables come up at 0 on a new game, but say it out
        // loud so a new party is never born wanted.
        CrimeSystem.resetHeat();
    };

    // The record travels in the binary save; the variable, the heat and the
    // window global are reconciled against it the moment it lands.
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        CrimeSystem.syncBounty();
    };

    // ----------------------------------------------------------------------
    // The heat variable belongs to CrimeSystem and to nothing else
    // ----------------------------------------------------------------------
    // A plain project variable is writable by anything, and something did:
    // ItemSystemEquipment stored actor 3's stealth in 131 (a leftover from
    // before the pv* actor fields), so equipping a jacket set the party's
    // wanted level and the police chased a party with an empty record. That
    // call is gone, but the wanted level is not the sort of thing that should
    // be one stray setValue away from a manhunt: from here it only moves for a
    // crime committed, an officer's line of sight, or a sentence served, all
    // of which come through setHeat. Anyone else is refused and told why.
    const _Game_Variables_setValue = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function (variableId, value) {
        if (variableId === heatVariableId && !writingHeat) {
            console.warn(
                `CrimeSystem: blocked a write of ${value} to the police heat ` +
                `(Variable ${heatVariableId}) from outside the crime system. ` +
                `Use CrimeSystem.setHeat()/clearHeat(), or move whatever wants ` +
                `this variable onto one of its own.`
            );
            return;
        }
        _Game_Variables_setValue.apply(this, arguments);
    };

    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        CrimeSystem.initialize();
        return contents;
    };

    // ----------------------------------------------------------------------
    // Talking to an officer
    // ----------------------------------------------------------------------
    // The one way onto the police radar from cold. A wanted party at heat 0
    // walks past a constable unrecognised; a wanted party who stops one in the
    // street and starts a conversation has handed him their face. It is worth
    // HEAT_TALK rather than the full 100 so the talk page is still the live one
    // when the interpreter picks the event up: the chat plays out, the spotting
    // sweep pins them at 100 while it does, and the arrest page is armed by the
    // time they walk away. raiseHeat only ever raises, so an officer already
    // giving chase is not calmed down by touching the party.
    const _Game_Event_start = Game_Event.prototype.start;
    Game_Event.prototype.start = function () {
        const wasStarting = this._starting;
        _Game_Event_start.call(this);
        if (wasStarting || !this._starting) return;
        // Action button and the two touch triggers are somebody meeting
        // somebody; autorun and parallel pages are not a conversation.
        if (this._trigger > 2) return;
        if (!$gameSystem || !$gameVariables) return;
        if (($gameVariables.value(bountyVariableId) || 0) <= 0) return;
        if (!isOfficerEvent(this)) return;
        CrimeSystem.raiseHeat(HEAT_TALK);
    };

    // The heat is read off the clock rather than off steps, so it fades while
    // the party sleeps, works a shift or fast travels too. Once a second.
    const HEAT_TICK_FRAMES = 60;
    let heatTick = 0;
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        if (++heatTick < HEAT_TICK_FRAMES) return;
        heatTick = 0;
        if ($gameSystem && $gameVariables) CrimeSystem.updateHeat();
    };
})();