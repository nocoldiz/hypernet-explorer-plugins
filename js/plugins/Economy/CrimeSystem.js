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
 * @command bribeOfficer
 * @text Bribe Officer
 * @desc From an arrest: d20 + PSI against the officer's morality. Taken, that officer ignores the party. Refused, Bribery is filed and the event jumps to the retry label.
 *
 * @arg retryLabel
 * @text Retry Label
 * @desc Label jumped to when the bribe is not taken.
 * @type string
 * @default Restart
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

    // ======================================================================
    // WITNESSES: who was looking, and which of them will talk
    // ======================================================================
    // The officer sweep above answers "is a constable looking at us". This is
    // the same question asked of everybody on the map, because an immersive
    // world's law does not run on an invisible omniscient bookkeeper: a deed
    // reaches the record only if a person saw it and chose to say so.
    //
    // Three people never report the party:
    //   - a party member (they were in on it)
    //   - anybody who thinks well enough of the party (playerOpinion at or
    //     above WITNESS_LOYAL_OPINION); a friend looks the other way
    //   - nobody at all, when nobody was there
    // One person always reports, whatever they think of you: the victim. Rob a
    // shopkeeper to their face and they go to the police however warmly they
    // greeted you a minute earlier, because it was done to THEM.
    //
    // Bounty and heat stay exactly what they were: one party-wide sheet. A
    // witness decides WHETHER the party is charged, never who in it is.
    const WITNESS_RANGE = 6;
    const WITNESS_CONE = 140;
    const WITNESS_TOUCH = 1;
    // A friend at or above this looks the other way. Deliberately high: liking
    // the party is not enough, they have to be on the party's side.
    const WITNESS_LOYAL_OPINION = 60;

    // The name a map event answers to in the NPC sim. Procedural citizens and
    // hand-placed ones are both keyed by event name, so that is the key.
    function npcNameOfEvent(ev) {
        const data = ev && ev.event && ev.event();
        const name = data && data.name ? String(data.name).trim() : "";
        return name || null;
    }

    function isPartyMemberName(name) {
        if (!name || typeof $gameParty === "undefined" || !$gameParty) return false;
        return $gameParty.members().some(a => a && a.name && a.name() === name);
    }

    // What this person thinks of the party as a whole. Per-member standings
    // exist (NPCEmpathize), but who a witness protects is a party-wide
    // question, in the same way the bounty is a party-wide answer.
    function opinionOfParty(name) {
        const R = window.NPCSocietyRegistry;
        if (!R || typeof R.getProfile !== "function" || !name) return 0;
        const p = R.getProfile(name);
        return p ? (p.playerOpinion ?? 0) : 0;
    }

    // The leader's look stats (window.LookStats), 0 to 100 each.
    function leaderLook() {
        const leader = (typeof $gameParty !== "undefined" && $gameParty) ? $gameParty.leader() : null;
        return (window.LookStats && leader) ? window.LookStats.ofActor(leader)
            : { arcane: 0, substance: 0, stealth: 0, intimidation: 0 };
    }
    // A frightening party keeps the merely neutral quiet: the opinion a
    // civilian witness needs before they look the other way drops with the
    // leader's Intimidation look, by up to half of it.
    function fearDiscount() {
        const i = leaderLook().intimidation;
        return Math.round(i / 2 * (i >= 100 ? 1.5 : 1));
    }

    // Everybody who can actually see the given tile. Sight, not proximity:
    // inside range, inside the arc they face, with nothing in the way, exactly
    // as the constable sweep reads it. Darkness shortens and narrows it the
    // same way, so a night job really is quieter.
    function witnessesAt(x, y) {
        if (typeof $gameMap === "undefined" || !$gameMap) return [];
        const scene = (typeof SceneManager !== "undefined") ? SceneManager._scene : null;
        if (scene && typeof Scene_Map !== "undefined" && !(scene instanceof Scene_Map)) return [];
        const dark = isDarkOrNightCrimeEnvironment();
        // Somebody dressed not to be seen is seen from less far and at a
        // narrower angle (the leader's Stealth look, window.LookStats).
        const look = leaderLook();
        const hide = Math.round(look.stealth / 34);
        const range = Math.max(2, (dark ? WITNESS_RANGE - 2 : WITNESS_RANGE) - hide);
        const cone = Math.max(60, (dark ? 90 : WITNESS_CONE) - Math.round(look.stealth * 0.4));
        const out = [];
        for (const ev of $gameMap.events()) {
            if (!ev || ev._erased) continue;
            const dx = Math.abs($gameMap.deltaX(ev.x, x));
            const dy = Math.abs($gameMap.deltaY(ev.y, y));
            if (dx > range || dy > range) continue;
            const distance = dx + dy;
            if (distance > range) continue;
            const name = npcNameOfEvent(ev);
            if (!name) continue;
            if (distance > WITNESS_TOUCH) {
                if (!inSightCone(ev, x, y, cone)) continue;
                if (!hasSightLine(ev.x, ev.y, x, y)) continue;
            }
            out.push({
                name,
                eventId: ev.eventId ? ev.eventId() : null,
                officer: isOfficerEvent(ev),
                opinion: opinionOfParty(name),
                party: isPartyMemberName(name),
            });
        }
        return out;
    }

    // Of the people who saw it, the ones who will go to the police. A victim
    // passed in by the caller is always among them.
    function reportersAmong(witnesses, victimName) {
        const list = [];
        for (const w of witnesses || []) {
            const name = typeof w === "string" ? w : w && w.name;
            if (!name) continue;
            const rec = typeof w === "string"
                ? { name, officer: false, opinion: opinionOfParty(name), party: isPartyMemberName(name) }
                : w;
            if (victimName && name === victimName) { list.push(rec); continue; }
            if (rec.party) continue;                              // one of ours
            if (!rec.officer && rec.opinion >= WITNESS_LOYAL_OPINION - fearDiscount()) continue; // a friend, or too frightened to talk
            list.push(rec);
        }
        if (victimName && !list.some(r => r.name === victimName)) {
            list.push({
                name: victimName, officer: false, victim: true,
                opinion: opinionOfParty(victimName), party: isPartyMemberName(victimName),
            });
        }
        return list;
    }

    // ======================================================================
    // THE SHOPKEEPER'S GRUDGE
    // ======================================================================
    // Caught with your hand in somebody's stock and that somebody never sells
    // to you again. Not to the thief: to the PARTY, and to any party that ever
    // wears this savegame's colours, whoever is standing in it. It does not
    // expire, it is not bought off with the bounty, and swapping the roster
    // does not launder it, because the keeper remembers a group of people who
    // robbed them, not a face.
    //
    // Keyed the way containers are keyed, so the same counter in the same
    // procedural interior instance is the same shop from one visit to the next.
    // The same interior-instance prefix the container ledger uses, so one
    // counter in one procedural building is one shop across visits.
    function vendorInstanceKey() {
        const H = window.ProceduralHouseSystem;
        if (H && typeof H.getContainerInstanceKey === 'function') {
            const k = H.getContainerInstanceKey();
            if (k) return 'H' + k;
        }
        return '';
    }

    function vendorKey(mapId, eventId) {
        const instance = vendorInstanceKey();
        return instance ? `${instance}:${mapId}_${eventId}` : `${mapId}_${eventId}`;
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

    // ======================================================================
    // JURISDICTIONS: whose law the party is standing under
    // ======================================================================
    // Three codes of law, and a record for each. Most of the world keeps the
    // common code (PresetCrimes.json as it is written). The Holy Vatican
    // Empire keeps canon law instead: its own charges, its own tariff, a list
    // of sins the rest of the world never heard of, and a stretch of modern
    // offences it simply does not recognise. The Goblin Horde permits
    // everything except stealing.
    //
    // A bounty never crosses the border. The record the party is standing
    // under is $gameSystem._crimeData, exactly as before, so every reader
    // (the HUD, the officers, the trial, the prison, the N€police portal)
    // settles whichever record is local without knowing there are two. The
    // other one waits in $gameSystem._crimeSheets until the party crosses
    // back, heat and all.
    // i18n-ignore-start  hyperpower, jurisdiction and charge ids, never shown
    const VATICAN_POWER = 'Holy Vatican Empire';
    const GOBLIN_POWER = 'Goblin Horde';
    const NEUTRAL_POWER = 'Neutral';
    const LAW_COMMON = 'common';
    const LAW_VATICAN = 'vatican';
    const LAW_HORDE = 'horde';

    // The Horde's law has one article: do not take what is not yours.
    // Everything else is permitted, so only the thefts are ever filed on
    // Horde ground, at the common tariff: every preset in the Theft category
    // and the two ways of stealing a vehicle.
    const HORDE_THEFT_CATEGORY = 'Theft';
    const HORDE_THEFT_EXTRA = ['vehicleTheft', 'carjacking'];

    // Canon law, read against the common catalogue: preset key -> [the canon
    // charge it is filed under, what canon law asks for it in gold]. A preset
    // key missing here is a crime the Holy Office does not recognise at all:
    // traffic, the machine crimes, hunting and the environment, tax (the Empire
    // collects tithes), loitering and littering, carrying a weapon.
    const VATICAN_CANON = {
        pettyTheft: ['theftFromTheFaithful', 150],
        pickpocketing: ['theftFromTheFaithful', 200],
        shoplifting: ['theftFromTheFaithful', 250],
        robbery: ['theftFromTheFaithful', 2500],
        armedRobbery: ['theftFromTheFaithful', 4000],
        bankRobbery: ['theftFromTheFaithful', 8000],
        grandTheft: ['theftFromTheFaithful', 5000],
        vehicleTheft: ['theftFromTheFaithful', 1500],
        carjacking: ['theftFromTheFaithful', 3500],
        burglary: ['violationOfTheHearth', 1500],
        breakingAndEntering: ['violationOfTheHearth', 1000],
        trespassing: ['trespassOnConsecratedGround', 400],
        unlawfulEntry: ['trespassOnConsecratedGround', 600],
        graverobbing: ['desecrationOfTheDead', 20000],
        assault: ['sheddingOfBlood', 600],
        battery: ['sheddingOfBlood', 800],
        aggravatedAssault: ['sheddingOfBlood', 2000],
        hitAndRun: ['sheddingOfBlood', 3000],
        murder: ['mortalSin', 30000],
        manslaughter: ['mortalSin', 15000],
        serialKilling: ['mortalSin', 80000],
        abandonChild: ['abandonmentOfAnInnocent', 12000],
        animalCruelty: ['crueltyToCreation', 800],
        abandonPet: ['crueltyToCreation', 600],
        vandalism: ['sacrilege', 800],
        propertyDestruction: ['sacrilege', 1200],
        arson: ['sacrilege', 6000],
        publicDisturbance: ['disturbingTheHolyPeace', 100],
        disorderlyConduct: ['disturbingTheHolyPeace', 150],
        disturbing: ['disturbingTheHolyPeace', 100],
        noisePollution: ['disturbingTheHolyPeace', 80],
        harassment: ['disturbingTheHolyPeace', 400],
        publicIntoxication: ['intemperance', 300],
        underageDrinking: ['intemperance', 300],
        drugPossession: ['intemperance', 800],
        drugDealing: ['peddlingOfVice', 4000],
        drugTrafficking: ['peddlingOfVice', 12000],
        smuggling: ['peddlingOfVice', 5000],
        contraband: ['peddlingOfVice', 1200],
        bribery: ['simony', 3000],
        corruption: ['simony', 8000],
        embezzlement: ['simony', 5000],
        fraud: ['simony', 3000],
        moneyLaundering: ['simony', 6000],
        extortion: ['usury', 3000],
        blackmail: ['usury', 2500],
        perjury: ['falseWitness', 4000],
        forgery: ['falseWitness', 2000],
        counterfeiting: ['falseWitness', 3000],
        identityTheft: ['falseWitness', 2000],
        kidnapping: ['tradeInSouls', 15000],
        hostage: ['tradeInSouls', 12000],
        humanTrafficking: ['tradeInSouls', 40000],
        slavery: ['tradeInSouls', 30000],
        contemptOfCourt: ['defianceOfTheHolyOffice', 1500],
        obstructingJustice: ['defianceOfTheHolyOffice', 2500],
        resistingArrest: ['defianceOfTheHolyOffice', 1000],
        escapingCustody: ['defianceOfTheHolyOffice', 5000],
        prisonBreak: ['defianceOfTheHolyOffice', 12000],
        illegalWeapons: ['armingTheUnfaithful', 3000],
        weaponsTrafficking: ['armingTheUnfaithful', 8000],
        treason: ['treasonAgainstTheThrone', 60000],
        espionage: ['treasonAgainstTheThrone', 40000],
        terrorism: ['abomination', 100000],
        bioterrorism: ['abomination', 1000000],
        warCrimes: ['abomination', 150000],
        genocide: ['abomination', 500000],
        crimesAgainstHumanity: ['abomination', 300000],
    };

    // Sins only canon law knows, and what they cost in gold. Filed anywhere
    // else in the world they are not recognised.
    const VATICAN_SINS = {
        witchcraft: 25000,      // a Witch in the party
        gunmancy: 25000,        // a Gunmancer in the party
        heresy: 15000,          // an esoteric spell cast on the Empire's soil
        forbiddenArts: 50000,   // a forbidden spell cast on the Empire's soil
        atheism: 10000,         // an atheist in the party
    };

    // Classes the Holy Office marks on sight: Witch (2) and Gunmancer (16).
    // The mark is PERMANENT: it is filed on the person, not on a deed, so no
    // fine, bribe or pardon lifts it; only a served sentence does, and it is
    // filed again the next time they cross into the Empire.
    const VATICAN_MARKED_CLASSES = { 2: 'witchcraft', 16: 'gunmancy' };
    // The Atheist trait (Traits.json 117).
    const ATHEIST_TRAIT_ID = 117;
    // i18n-ignore-end

    // Canon law does not forget: a manhunt takes three times as long to blow
    // over inside the Empire.
    const VATICAN_HEAT_DECAY_HOURS = 12;

    // The country the party is standing in: WeatherSystem's live entry first
    // (Countries.json repeats ids, so the entry beats Variable 86), then the id.
    function currentCountryEntry() {
        const w = (typeof $gameWeather !== 'undefined') ? $gameWeather : null;
        if (w && w.currentCountry && w.currentCountry.country) return w.currentCountry;
        const list = window.WorldGen && window.WorldGen.Countries;
        if (!Array.isArray(list) || typeof $gameVariables === 'undefined' || !$gameVariables) return null;
        const id = $gameVariables.value(86);
        return list.find(c => c && c.id === id) || null;
    }

    // Who holds a nation right now, read the way NPCPolitics reads it: the
    // live timeline first, then Countries.json, where a `faction` naming a
    // hyperpower counts as much as a `controller`.
    function controllerOfCountry(entry) {
        if (!entry || !entry.country) return NEUTRAL_POWER;
        const hm = window.HistoryManager;
        const sim = (hm && typeof hm.getNationState === 'function') ? hm.getNationState(entry.country) : null;
        if (sim && sim.controller && sim.controller !== NEUTRAL_POWER) return sim.controller;
        if (entry.controller && entry.controller !== NEUTRAL_POWER) return entry.controller;
        return entry.faction && entry.faction !== NEUTRAL_POWER ? entry.faction : NEUTRAL_POWER;
    }

    function sumBounty(list) {
        return (list || []).reduce((sum, c) => sum + ((c && c.bounty) || 0), 0);
    }

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
                    marks: [],
                    totalBounty: 0
                };
            }
            if (!Array.isArray($gameSystem._crimeData.marks)) $gameSystem._crimeData.marks = [];

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

            if (data.crimes.length || data.marks.length) {
                if (shown <= 0) {
                    // Settled somewhere that only wrote the variable (time
                    // served, a pardon, a savegame written before this):
                    // the sheet goes with it, or the next crime committed
                    // re-totals it and hands the party their old bounty back.
                    data.crimes = [];
                    data.marks = [];
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
            // More heat, more police: NPCSystem calls in (or stands down) the
            // extra patrols on the map the party is standing on.
            try { window.NPCSystem?.onHeatChanged?.(next); } catch (e) { /* the heat is set either way */ }
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
            // Crossing a border swaps the record before anything reads it.
            this.syncJurisdiction();
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
            const baseRate = this.heatDecayPerMinute();
            const decayRate = isDarkOrNightCrimeEnvironment() ? (baseRate * 1.5) : baseRate;
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
                // A bribed officer is paid not to have seen anybody.
                if (this.isBribedOfficer(ev)) continue;
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

        // options.mark      the actor id a permanent canon mark is filed on
        // options.canonical the name and bounty are already canon law's own
        static addCrime(crimeName, bountyAmount, crimeId = null, options = {}) {
            this.initialize();
            options = options || {};

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

            // Whose law is this filed under? The deed is judged by the code of
            // the ground it was done on, and a deed that code does not know is
            // no crime there at all.
            this.syncJurisdiction();
            let charge = null;
            if (!options.canonical) {
                const law = this.lawFor(crimeId, crimeName, bountyAmount);
                if (!law) {
                    this.showNotRecognisedNotification();
                    return;
                }
                crimeName = law.name;
                bountyAmount = law.bounty;
                charge = law.charge || null;
            }
            // The Holy Office answers to nobody's badge and discounts nothing
            // for a professional hand: a canon sin is charged in full.
            const inquisition = !!options.canonical || !!VATICAN_SINS[crimeId];

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
            if (!inquisition) bountyAmount = bountyAfterStreetwise(bountyAmount);

            // ...and an officer of the law signs their own report. A Police
            // Officer travelling with the party can write off charges worth
            // 5000 gold a day per level of rank, and a second officer signs for
            // their own allowance on top. What the badge covers never reaches
            // the record at all: it was done in the name of the law.
            const lawful = inquisition ? null : this.trySelfPardon(bountyAmount);
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
            if (charge) crime.charge = charge;

            if (options.mark != null) {
                // A mark is filed on a person and sits apart from the charges,
                // so nothing that settles a charge can reach it.
                crime.actorId = options.mark;
                $gameSystem._crimeData.marks.push(crime);
            } else {
                $gameSystem._crimeData.crimes.push(crime);
                // Add crime ID to window.playerCrimes if provided
                if (crimeId) {
                    window.playerCrimes.push(crimeId);
                }
            }
            $gameSystem._crimeData.totalBounty += bountyAmount;

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

            // Every charge also lands on the world record, so the systems that
            // read deeds (gossip, news, the diary) see a charge filed the old
            // way exactly as they see one that went through commit(). A charge
            // that came THROUGH commit() is already on it, hence the guard.
            if (window.WorldEvents && !CrimeSystem._deedFiled) {
                window.WorldEvents.record({
                    verb: crimeId || "unknown", actor: "player", target: null,
                    severity: Math.min(100, Math.round(20 * Math.log10(1 + (bountyAmount || 0) / 25))),
                    reported: true,
                });
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
        // COMMIT: a deed first, a charge only if somebody talks
        // ==================================================================
        // addCrime() above is unchanged and stays the way every existing event
        // and plugin command files a charge: it is called BECAUSE the party was
        // caught, so sweeping for witnesses there would quietly delete charges
        // the game already knows landed.
        //
        // commit() is the witness-aware door. The caller describes the act; this
        // decides whether the world found out. Either way the act is recorded on
        // the world's deed log (window.WorldEvents), because an unreported crime
        // still happened: a witness who kept quiet still saw it, and the town
        // still lost the thing that was taken.
        //
        //   spec.crimeId    a key in PresetCrimes, or null with an explicit name
        //   spec.name       display name, when no crimeId
        //   spec.bounty     what it is worth; defaults to the preset's bounty
        //   spec.verb       the deed verb (theft, burglary, killing...)
        //   spec.victim     the name of whoever it was done to; they always talk
        //   spec.target     what was taken / who was hurt, for the deed sentence
        //   spec.witnesses  pass an explicit list to skip the sight sweep
        //
        // Returns { deed, reported, reporters }.
        static commit(spec = {}) {
            this.initialize();
            const witnesses = Array.isArray(spec.witnesses)
                ? spec.witnesses
                : witnessesAt($gamePlayer ? $gamePlayer.x : 0, $gamePlayer ? $gamePlayer.y : 0);
            const reporters = reportersAmong(witnesses, spec.victim || null);
            const reported = reporters.length > 0;

            const verb = spec.verb || spec.crimeId || "unknown";
            const deed = window.WorldEvents ? window.WorldEvents.record({
                verb,
                actor: "player",
                target: spec.target ?? null,
                witnesses: witnesses.map(w => (typeof w === "string" ? w : w && w.name)).filter(Boolean),
                severity: spec.severity,
                reported,
            }) : null;

            // spec.file === false means somebody else files the charge for this
            // act and this call is only here for the deed, the witnesses and
            // whatever the reporting rule decides. Shoplifting is the case:
            // common event 125 (StealCaught) has always filed the Theft charge
            // off the price variable, and filing a second one here would charge
            // the party twice for one lifted apple.
            if (reported && spec.file !== false) {
                const name = spec.name || this.presetCrimeName(spec.crimeId) || verb;
                const bounty = Number.isFinite(spec.bounty)
                    ? spec.bounty
                    : ((PresetCrimes[spec.crimeId] || {}).bounty || 0);
                // The one charge sheet, exactly as before: party-wide bounty,
                // party-wide heat. Who reported it never changes that.
                CrimeSystem._deedFiled = true;
                try { this.addCrime(name, bounty, spec.crimeId || null); }
                finally { CrimeSystem._deedFiled = false; }
            } else if (!reported && window.ParchmentToast) {
                // Only when nobody is going to talk. A charge filed elsewhere
                // (file: false) was very much seen, so it says nothing.
                window.ParchmentToast.show(T('Crime.nobodySaw'), { severity: 'good' });
            }

            return { deed, reported, reporters };
        }

        // The sight sweep and the reporting rule, for anybody who needs to ask
        // before acting (the stealing menu prices its risk off this).
        static witnessesAt(x, y) { return witnessesAt(x, y); }
        static reportersAmong(witnesses, victimName) { return reportersAmong(witnesses, victimName); }
        static vendorKey(mapId, eventId) { return vendorKey(mapId, eventId); }

        // ==================================================================
        // THE SHOPKEEPER'S GRUDGE
        // ==================================================================
        // Filed in the savegame beside the charge sheet, not in the world
        // folder: it is THIS party's history with that counter, and a different
        // playthrough of the same world has not wronged anybody yet.
        static grudgeLedger() {
            this.initialize();
            const data = $gameSystem._crimeData;
            if (!data.refusedVendors) data.refusedVendors = {};
            return data.refusedVendors;
        }

        // Permanent, and party-wide whoever is standing in the party.
        //
        // It belongs to THIS SAVEGAME and travels nowhere. Not to the world
        // folder, so another playthrough of the same world walks into that shop
        // welcome; and not onto any party member, so a companion benched here
        // and picked up by another savegame's party carries no grudge with
        // them. The keeper remembers the group that robbed them, and a group is
        // a playthrough, not a roster and not a world. That is why it is filed
        // on _crimeData, which WorldManager maps to nothing.
        static refuseVendor(key, keeperName) {
            if (!key) return false;
            const ledger = this.grudgeLedger();
            if (ledger[key]) return false;
            ledger[key] = { since: getGameDateTimeString(), keeper: keeperName || null };
            // The party writes down which doors are shut to them.
            if (window.Diary && typeof window.Diary.record === 'function') {
                window.Diary.record('shop.banned', {
                    keeper: keeperName || T('Crime.theShopkeeper'),
                    place: ($gameMap && $gameMap.displayName && $gameMap.displayName()) || '',
                }, { dedupe: key });
            }
            return true;
        }

        static vendorRefuses(key) {
            if (!key) return false;
            return !!this.grudgeLedger()[key];
        }

        // A counter on the party's own deed never shuts them out: the keeper
        // works for them, whatever went missing from the till.
        static isOwnCounter(mapId) {
            const P = window.PropertyOwnership;
            return !!(P && typeof P.ownsShopCounter === 'function' && P.ownsShopCounter(mapId));
        }

        static vendorRefusesHere(mapId, eventId) {
            if (this.isOwnCounter(mapId)) return false;
            return this.vendorRefuses(vendorKey(mapId, eventId));
        }

        // Caught lifting from a counter: the keeper is the victim, so they go to
        // the police whatever they thought of the party, and they close their
        // door to it for good.
        static caughtStealingFrom(mapId, eventId, keeperName, spec = {}) {
            // Robbing the party's own shop is still a theft the keeper reports,
            // but they cannot bar the door to the people who own it.
            const ownCounter = this.isOwnCounter(mapId);
            if (!ownCounter) this.refuseVendor(vendorKey(mapId, eventId), keeperName);
            // The charge itself is common event 125's job, so only the deed and
            // the grudge are settled here.
            const result = this.commit(Object.assign({
                crimeId: 'shoplifting',
                verb: 'theft',
                victim: keeperName || null,
                target: spec.itemName || null,
                file: false,
            }, spec));
            if (!ownCounter && window.ParchmentToast) {
                window.ParchmentToast.show(
                    T('Crime.vendorRefusesForever', { keeper: keeperName || T('Crime.theShopkeeper') }),
                    { severity: 'danger' }
                );
            }
            return result;
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
            if (!crime && VATICAN_SINS[crimeKey]) {
                // A sin only canon law knows; filed elsewhere, addCrime says so.
                this.addCrime(this.canonChargeName(crimeKey), VATICAN_SINS[crimeKey], crimeKey);
            } else if (crime) {
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

            // Time served lifts everything on the local record, canon marks
            // included. The shopkeepers' grudge is not the court's to lift.
            const refusedVendors = $gameSystem._crimeData.refusedVendors;
            $gameSystem._crimeData = {
                crimes: [],
                marks: [],
                totalBounty: 0
            };
            if (refusedVendors) $gameSystem._crimeData.refusedVendors = refusedVendors;

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

        // The canon marks on the local record: filed on a person, never on a
        // deed, so they are listed apart from getCrimes() and nothing that
        // pays or pardons a charge can touch them.
        static getMarks() {
            this.initialize();
            return $gameSystem._crimeData.marks;
        }

        // What money can settle: the charges, never the marks.
        static payableBounty() {
            return sumBounty(this.getCrimes());
        }

        static recalculateBounty() {
            this.initialize();
            const total = sumBounty(this.getCrimes()) + sumBounty(this.getMarks());
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
            const marks = this.getMarks();
            if (!crimes.length && !marks.length) {
                // Nothing itemised to trim (a bounty set outright by a debug
                // tool or an event): the variable is all there is.
                if ($gameVariables) $gameVariables.setValue(bountyVariableId, target);
                if ($gameSystem._crimeData) $gameSystem._crimeData.totalBounty = target;
                return target;
            }

            let total = sumBounty(crimes) + sumBounty(marks);
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
            // Time in a cell is the one thing that wears a canon mark down,
            // and it only reaches the marks once every charge is served.
            while (marks.length && total > target) {
                const oldest = marks[0];
                const worth = oldest.bounty || 0;
                if (worth <= total - target) {
                    total -= worth;
                    marks.shift();
                } else {
                    oldest.bounty = worth - (total - target);
                    total = target;
                }
            }
            return this.recalculateBounty();
        }

        // ==================================================================
        // JURISDICTIONS: the common code and canon law
        // ==================================================================
        // See the tables at the top of the file. The active record is always
        // $gameSystem._crimeData; the one for the other code is parked here.
        static sheets() {
            if (!$gameSystem._crimeSheets) {
                $gameSystem._crimeSheets = { active: LAW_COMMON, stored: {}, marked: {} };
            }
            const S = $gameSystem._crimeSheets;
            if (!S.stored) S.stored = {};
            if (!S.marked) S.marked = {};
            return S;
        }

        static jurisdiction() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return LAW_COMMON;
            return this.sheets().active;
        }

        static isCanonLaw() {
            return this.jurisdiction() === LAW_VATICAN;
        }

        // The code of the ground the party stands on, or null when nobody
        // can say (no country known yet): the record then stays as it is.
        static jurisdictionHere() {
            const entry = currentCountryEntry();
            if (!entry) return null;
            const power = controllerOfCountry(entry);
            if (power === VATICAN_POWER) return LAW_VATICAN;
            if (power === GOBLIN_POWER) return LAW_HORDE;
            return LAW_COMMON;
        }

        static isHordeLaw() {
            return this.jurisdiction() === LAW_HORDE;
        }

        static syncJurisdiction() {
            if (this._syncingLaw) return this.jurisdiction();
            if (typeof $gameSystem === 'undefined' || !$gameSystem || !$gameVariables) return LAW_COMMON;
            this.initialize();
            this._syncingLaw = true;
            try {
                const here = this.jurisdictionHere();
                if (here && here !== this.sheets().active) this.switchJurisdiction(here);
                if (this.isCanonLaw()) this.markTheParty();
            } finally {
                this._syncingLaw = false;
            }
            return this.jurisdiction();
        }

        // Park the record of the code being left, raise the one being entered.
        // The manhunt stays behind with its record: the Empire's constables
        // do not chase across the border, and nobody else's chase them in.
        static switchJurisdiction(to) {
            this.initialize();
            const S = this.sheets();
            const from = S.active;
            if (from === to) return false;
            const data = $gameSystem._crimeData;
            S.stored[from] = {
                crimes: data.crimes || [],
                marks: data.marks || [],
                totalBounty: data.totalBounty || 0,
                bribedOfficers: data.bribedOfficers || null,
                heat: this.getHeat(),
            };
            const next = S.stored[to] || { crimes: [], marks: [], totalBounty: 0, bribedOfficers: null, heat: 0 };
            delete S.stored[to];
            data.crimes = next.crimes || [];
            data.marks = next.marks || [];
            data.totalBounty = next.totalBounty || 0;
            if (next.bribedOfficers) data.bribedOfficers = next.bribedOfficers;
            else delete data.bribedOfficers;
            S.active = to;
            // A new visit: whoever the Holy Office marks is marked afresh.
            if (to === LAW_VATICAN) S.marked = {};

            window.playerCrimes = data.crimes.map(c => c.id).filter(Boolean);
            if ($gameVariables) $gameVariables.setValue(bountyVariableId, data.totalBounty);
            $gameSystem._crimeHeatMinute = this.worldMinute();
            this.setHeat(data.totalBounty > 0 ? (next.heat || 0) : 0);

            // Entering a code of its own is announced; so is leaving one for
            // the common code.
            const ENTER = { [LAW_VATICAN]: 'Crime.law.enterCanon', [LAW_HORDE]: 'Crime.law.enterHorde' };
            const LEAVE = { [LAW_VATICAN]: 'Crime.law.leaveCanon', [LAW_HORDE]: 'Crime.law.leaveHorde' };
            const key = ENTER[to] || LEAVE[from];
            if (key && window.ParchmentToast) {
                window.ParchmentToast.show(T(key), { severity: ENTER[to] ? 'warning' : 'info', key: 'crimeLaw' });
            }
            return true;
        }

        // How a deed filed under a preset key reads under the local code:
        // { name, bounty, charge } or null when that code does not know it.
        // A bounty that was scaled by the caller (a theft priced off what was
        // taken) keeps its scale under canon law's own tariff.
        // A charge filed without a key (a broken contract, a false emergency
        // call) is taken as it came, except on Horde ground, where only a
        // named theft is a crime.
        static lawFor(crimeId, crimeName, bountyAmount) {
            const bounty = Number(bountyAmount) || 0;
            if (this.isHordeLaw()) {
                return this.isTheft(crimeId) ? { name: crimeName, bounty } : null;
            }
            if (!crimeId) return { name: crimeName, bounty };
            if (!this.isCanonLaw()) {
                if (VATICAN_SINS[crimeId]) return null;
                return { name: crimeName, bounty };
            }
            if (VATICAN_SINS[crimeId]) {
                return { name: this.canonChargeName(crimeId), bounty: bounty > 0 ? bounty : VATICAN_SINS[crimeId], charge: crimeId };
            }
            const canon = VATICAN_CANON[crimeId];
            // A key that is no preset at all is some plugin's own charge:
            // filed as it came.
            if (!canon) return PresetCrimes[crimeId] ? null : { name: crimeName, bounty };
            const base = (PresetCrimes[crimeId] && PresetCrimes[crimeId].bounty) || 0;
            const scaled = base > 0 && bounty > 0 ? Math.round(bounty * canon[1] / base) : canon[1];
            return { name: this.canonChargeName(canon[0]), bounty: Math.max(1, scaled), charge: canon[0] };
        }

        static isTheft(crimeId) {
            if (!crimeId) return false;
            if (HORDE_THEFT_EXTRA.includes(crimeId)) return true;
            const preset = PresetCrimes[crimeId];
            return !!preset && preset.category === HORDE_THEFT_CATEGORY;
        }

        static canonChargeName(key) {
            return T('Crime.canon.' + key);
        }

        // Whether the local code prosecutes this preset key at all.
        static isRecognised(crimeId) {
            return !!this.lawFor(crimeId, '', 1);
        }

        static heatDecayPerMinute() {
            const hours = this.isCanonLaw() ? VATICAN_HEAT_DECAY_HOURS : HEAT_DECAY_HOURS;
            return HEAT_MAX / (hours * 60);
        }

        // Who the Holy Office charges for being who they are, once a visit.
        // A Witch or a Gunmancer carries a permanent mark; an atheist an
        // ordinary charge that can be paid like any other.
        static markTheParty() {
            if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.members) return;
            const S = this.sheets();
            for (const actor of $gameParty.members()) {
                if (!actor || typeof actor.actorId !== 'function') continue;
                const id = actor.actorId();
                const cls = typeof actor.currentClass === 'function' ? actor.currentClass() : null;
                const sin = cls ? VATICAN_MARKED_CLASSES[cls.id] : null;
                const markKey = 'mark:' + id;
                if (sin && !S.marked[markKey]) {
                    S.marked[markKey] = true;
                    if (!this.getMarks().some(m => m.actorId === id)) {
                        this.addCrime(T('Crime.canon.onPerson', { charge: this.canonChargeName(sin), name: actor.name() }),
                            VATICAN_SINS[sin], sin, { canonical: true, mark: id });
                    }
                }
                const atheistKey = 'atheism:' + id;
                const traits = actor._selectedTraits;
                const atheist = Array.isArray(traits) && traits.some(t => t && t.id === ATHEIST_TRAIT_ID);
                if (atheist && !S.marked[atheistKey]) {
                    S.marked[atheistKey] = true;
                    this.addCrime(T('Crime.canon.onPerson', { charge: this.canonChargeName('atheism'), name: actor.name() }),
                        VATICAN_SINS.atheism, 'atheism', { canonical: true });
                }
            }
        }

        // A party member casting a forbidden or esoteric spell on the Empire's
        // soil is charged on the spot. No witness is needed: the Holy Office
        // feels it done.
        static onSkillUsed(actor, skill) {
            if (!skill || !actor) return;
            const meta = skill.meta || {};
            const sin = meta.Forbidden ? 'forbiddenArts' : (meta.Esoteric ? 'heresy' : null);
            if (!sin) return;
            if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.members().includes(actor)) return;
            if (this.syncJurisdiction() !== LAW_VATICAN) return;
            this.addCrime(T('Crime.canon.spell', { charge: this.canonChargeName(sin), spell: skill.name }),
                VATICAN_SINS[sin], sin, { canonical: true });
        }

        static showNotRecognisedNotification() {
            if (!window.ParchmentToast) return;
            window.ParchmentToast.show(T('Crime.law.notRecognised'), {
                severity: 'info',
                duration: displayDuration,
                key: 'crimeNotRecognised'
            });
        }

        // ==================================================================
        // THE BRIBE: an arresting officer who looks the other way
        // ==================================================================
        // Offered from the arrest (common event 124). The price is a share of
        // the bounty, always less than paying it, and dearer the more honest
        // the officer; the roll is a d20 plus the leader's PSI modifier against
        // a DC read off the same morality. A virtuous officer
        // (NPCSociety INCORRUPTIBLE_MORALITY) is never bought at any price.
        //
        // Taken, the money is gone and that one officer stops chasing: their
        // arrest page stays off and their eyes no longer feed the manhunt, for
        // as long as the record is no bigger than the one they were paid to
        // forget. Refused, no money changes hands but offering it is a crime of
        // its own, and the party may try again.
        static BRIBE_DC_BASE = 12;
        static BRIBE_DC_PER_MORALITY = 8;    // one point of DC per 8 of morality
        static BRIBE_DC_MIN = 5;
        static BRIBE_DC_MAX = 19;
        static BRIBE_SHARE_BASE = 0.5;       // of the bounty, at morality 0
        static BRIBE_SHARE_PER_MORALITY = 1 / 400;

        static officerName(ev) {
            if (!ev) return '';
            const sim = window.NPCSim;
            const name = sim && typeof sim.npcNameForEvent === 'function' ? sim.npcNameForEvent(ev) : null;
            return String(name || (ev.event && ev.event() && ev.event().name) || '').trim();
        }

        static officerProfile(ev) {
            const R = window.NPCSocietyRegistry;
            const name = this.officerName(ev);
            return (R && name && typeof R.getProfile === 'function') ? R.getProfile(name) : null;
        }

        // The same officer whichever map they walk onto when they are a person
        // with a profile; the event on this map when they are only a uniform.
        static officerKey(ev) {
            if (!ev) return '';
            if (this.officerProfile(ev)) return 'N:' + this.officerName(ev);
            return 'E:' + vendorKey($gameMap ? $gameMap.mapId() : 0, ev.eventId());
        }

        static bribeTerms(ev) {
            const profile = this.officerProfile(ev);
            const morality = Math.max(-100, Math.min(100, Number(profile && profile.moralityScore) || 0));
            const R = window.NPCSocietyRegistry;
            const incorruptible = R && typeof R.isIncorruptible === 'function'
                ? R.isIncorruptible(profile)
                : morality >= 60;
            const dc = Math.max(this.BRIBE_DC_MIN, Math.min(this.BRIBE_DC_MAX,
                this.BRIBE_DC_BASE + Math.round(morality / this.BRIBE_DC_PER_MORALITY)));
            const bounty = this.getTotalBounty();
            const share = this.BRIBE_SHARE_BASE + morality * this.BRIBE_SHARE_PER_MORALITY;
            // Always under the bounty: a bribe dearer than paying is no bribe.
            const cost = Math.max(1, Math.min(bounty - 1, Math.round(bounty * share)));
            return { morality, incorruptible, dc, cost, bounty };
        }

        static bribedLedger() {
            this.initialize();
            const data = $gameSystem._crimeData;
            if (!data.bribedOfficers) data.bribedOfficers = {};
            return data.bribedOfficers;
        }

        // Still paid for while the record has not grown past what they were
        // paid to forget. A new charge on top puts them back on the party.
        static isBribedOfficer(ev) {
            if (!ev || typeof $gameSystem === 'undefined' || !$gameSystem || !$gameSystem._crimeData) return false;
            const led = $gameSystem._crimeData.bribedOfficers;
            if (!led) return false;
            const entry = led[this.officerKey(ev)];
            return !!entry && this.getTotalBounty() <= entry.covered;
        }

        static bribeRoller() {
            return $gameParty && $gameParty.leader ? $gameParty.leader() : null;
        }

        static async rollBribe(terms, officerName) {
            const actor = this.bribeRoller();
            const modifier = actor ? (actor.psiMod ?? Math.floor(((actor.luk || 10) - 10) / 2)) : 0;
            if (window.Dice3D && typeof window.Dice3D.rollD20 === 'function') {
                return window.Dice3D.rollD20({
                    actionName: T('Crime.bribe.action', { name: officerName, cost: this.goldToEuros(terms.cost) }),
                    statName: 'PSI',
                    modifier,
                    dc: terms.dc,
                    actor,
                    force3D: true
                });
            }
            const roll = Math.floor(Math.random() * 20) + 1;
            return {
                roll, modifier, total: roll + modifier,
                success: roll === 20 || (roll !== 1 && roll + modifier >= terms.dc)
            };
        }

        // Returns { outcome: 'bribed' | 'refused' | 'failed' | 'broke' | 'none', terms }.
        static async bribeOfficer(ev) {
            const toast = (key, params, severity) => {
                if (window.ParchmentToast) window.ParchmentToast.show(T(key, params), { severity });
            };
            const terms = this.bribeTerms(ev);
            if (!ev || terms.bounty <= 1) return { outcome: 'none', terms };
            const name = this.officerName(ev) || T('Crime.bribe.theOfficer');
            const cost = this.goldToEuros(terms.cost);

            if (terms.incorruptible) {
                this.addPresetCrime('bribery');
                toast('Crime.bribe.incorruptible', { name }, 'danger');
                return { outcome: 'refused', terms };
            }
            if ($gameParty.gold() < terms.cost) {
                toast('Crime.bribe.cannotAfford', { name, cost }, 'danger');
                return { outcome: 'broke', terms };
            }

            const result = await this.rollBribe(terms, name);
            if (result && result.success) {
                $gameParty.loseGold(terms.cost);
                this.bribedLedger()[this.officerKey(ev)] = {
                    covered: this.getTotalBounty(),
                    paid: terms.cost,
                    since: getGameDateTimeString()
                };
                if ($gameMap) $gameMap.requestRefresh();
                toast('Crime.bribe.taken', { name, cost }, 'good');
                return { outcome: 'bribed', terms };
            }
            this.addPresetCrime('bribery');
            toast('Crime.bribe.rejected', { name }, 'danger');
            return { outcome: 'failed', terms };
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

    // Run from the arrest itself, so the officer is the event running it. The
    // interpreter waits on the roll; anything short of a bribe taken jumps back
    // to the retry label and the arrest choice is put to the party again.
    PluginManager.registerCommand(pluginName, "bribeOfficer", function (args) {
        const interpreter = this;
        const retryLabel = String((args && args.retryLabel) || 'Restart');
        const ev = $gameMap && this.eventId ? $gameMap.event(this.eventId()) : null;
        interpreter._crimeBribePending = true;
        CrimeSystem.bribeOfficer(ev).then(result => {
            if (result.outcome !== 'bribed' && result.outcome !== 'none') {
                interpreter.command119([retryLabel]);
            }
        }).catch(e => {
            console.error('CrimeSystem bribeOfficer: ' + e.message); // i18n-ignore: developer diagnostic
        }).finally(() => {
            interpreter._crimeBribePending = false;
        });
        this.setWaitMode('crimeBribe');
    });

    const _Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function () {
        if (this._waitMode === 'crimeBribe') {
            if (this._crimeBribePending) return true;
            this._waitMode = '';
            return false;
        }
        return _Game_Interpreter_updateWaitMode.call(this);
    };
    // Forbidden and esoteric spells are a sin under canon law, cast from the
    // menu or in battle alike: useItem is the one place both go through.
    const _Game_Battler_useItem = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function (item) {
        _Game_Battler_useItem.call(this, item);
        if (this.isActor() && DataManager.isSkill(item)) {
            try { CrimeSystem.onSkillUsed(this, item); } catch (e) { /* the spell is cast either way */ }
        }
    };

    // Global access for script calls
    window.CrimeSystem = CrimeSystem;
    // Who the police are, asked from outside. An officer is recognised here and
    // nowhere else, so anything that has to keep away from one (the autopilot in
    // Core/AutoIdleExplorer.js) reads the same answer the officers themselves do
    // rather than matching a name of its own.
    CrimeSystem.isOfficerEvent = isOfficerEvent;
    window.PresetCrimes = PresetCrimes;

    // ======================================================================
    // THE CLOSED DOOR
    // ======================================================================
    // A keeper who caught this party stealing does not serve it again. The
    // refusal is enforced where a shop is OPENED rather than inside any one
    // shop plugin, so it covers the authored counters (Shop Processing), the
    // daily themed shops, the seeded bazaar and the vending machines alike
    // without any of them having to know the grudge exists.
    //
    // The party in the room is irrelevant: the ledger is keyed by counter, and
    // the keeper remembers the group, not the faces in it.
    const SHOP_OPENING_COMMANDS = new Set([
        'openThemedShop', 'OpenLimitedShop', 'openVendingMachine', 'OpenShop', 'openShop',
    ]);

    function refuseIfGrudged(interpreter) {
        if (!interpreter || typeof interpreter.eventId !== 'function') return false;
        const eventId = interpreter.eventId();
        if (!eventId || typeof $gameMap === 'undefined' || !$gameMap) return false;
        if (!CrimeSystem.vendorRefusesHere($gameMap.mapId(), eventId)) return false;
        const ev = $gameMap.event(eventId);
        const keeper = (ev && ev.event && ev.event().name) || T('Crime.theShopkeeper');
        if (window.ParchmentToast) {
            window.ParchmentToast.show(T('Crime.vendorRefusesEntry', { keeper }), { severity: 'danger' });
        }
        return true;
    }

    if (typeof Game_Interpreter !== 'undefined') {
        // Shop Processing (authored counters).
        const _command302 = Game_Interpreter.prototype.command302;
        Game_Interpreter.prototype.command302 = function (params) {
            if (refuseIfGrudged(this)) {
                // Swallow the goods list that follows the command, or the shop
                // would open on the next Add-Goods line instead.
                while (this.nextEventCode() === 605) this._index++;
                return true;
            }
            return _command302.call(this, params);
        };

        // Plugin Command, for the shops that are opened by one.
        const _command357 = Game_Interpreter.prototype.command357;
        Game_Interpreter.prototype.command357 = function (params) {
            const commandName = params && params[1];
            if (SHOP_OPENING_COMMANDS.has(commandName) && refuseIfGrudged(this)) return true;
            return _command357.call(this, params);
        };
    }

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
        if (CrimeSystem.isBribedOfficer(this)) return;
        CrimeSystem.raiseHeat(HEAT_TALK);
    };

    // A bribed officer's arrest page (the one conditioned on the heat) never
    // comes up, so they keep to their everyday talk page and stop following.
    const _Game_Event_meetsConditions = Game_Event.prototype.meetsConditions;
    Game_Event.prototype.meetsConditions = function (page) {
        if (page && page.conditions && page.conditions.variableValid &&
            page.conditions.variableId === heatVariableId &&
            CrimeSystem.isBribedOfficer(this)) {
            return false;
        }
        return _Game_Event_meetsConditions.call(this, page);
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