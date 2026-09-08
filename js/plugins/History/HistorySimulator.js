/*:
 * @target MZ
 * @plugindesc Dwarf Fortress-inspired Europe Alternate History Generator (1900-2001).
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @param startYear
 * @text Start Year
 * @type number
 * @default 1900
 * @desc The year the simulation starts.
 *
 * @param endYear
 * @text End Year
 * @type number
 * @default 2001
 * @desc The year the simulation ends.
 *
 * @param autoRunOnNewGame
 * @text Auto-run on New Game
 * @type boolean
 * @default true
 * @desc If true, runs a fresh simulation when a new game starts.
 *
 * @command runSimulation
 * @text Run Simulation
 * @desc Runs a fresh simulation of history. WARNING: Clears existing history.
 *
 * @command getHistoricalFact
 * @text Get Historical Fact
 * @desc Gets a random historical fact and stores it in a variable.
 * @arg variableId
 * @type variable
 * @desc The variable ID to store the fact string in.
 * @arg year
 * @type number
 * @desc Optional: Specify a year. 0 for random.
 * @default 0
 *
 * @command showHistoryLog
 * @text Show History Log
 * @desc Opens a window displaying the generated timeline.
 *
 * @help
 * HistorySimulator.js
 * ============================================================================
 * This plugin simulates a century of geopolitical shifts, ideologies, and 
 * conflicts in a procedural Europe (1900-2001).
 *
 * It generates a persistent timeline of events including:
 * - Political coups, elections, purges and assassinations
 * - Wars, sieges, mutinies and territorial conquests
 * - Paranormal anomalies (50 kinds), occult rites and "The Squishing"
 * - Scientific expeditions, natural disasters and organised crime
 * - Economic shifts and technological breakthroughs
 *
 * Categories are drawn with the weights in CATEGORY_WEIGHTS, which favour the
 * paranormal and occult strands over mundane background noise.
 *
 * History is stored in the active world's history store via window.WorldManager
 * (falling back to $gameSystem._historical* when no world is active). Always
 * read/write it through window.HistoryManager (getEvents/getHyperpowers/etc.)
 * so every consumer sees the same data regardless of which store is active.
 *
 * Integration:
 * - Use 'Get Historical Fact' to flavor NPC dialogue or item descriptions.
 * - The simulation affects hidden 'stats' for factions and hyperpowers which
 *   can be used by other plugins or conditional branches.
 * ============================================================================
 */

(function () {
    'use strict';

    const pluginName = "HistorySimulator";
    const params = PluginManager.parameters(pluginName);
    const START_YEAR = Number(params.startYear || 1900);
    const END_YEAR = Number(params.endYear || 2001);

    // Where the century stops in an empty world: nothing happens after this
    // date, because after it there was nobody left for anything to happen to.
    // The same date is the one every wiki entry, app and ledger reports (see
    // WorldManager.isEmptyWorld).
    const EMPTY_WORLD_CUTOFF = new Date(2000, 0, 1);
    function isEmptyWorld() {
        const WM = window.WorldManager;
        return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
    }
    const AUTO_RUN = params.autoRunOnNewGame === "true";
    const CANON_END_YEAR = 2001; // The true end year of the canon timeline

    //=============================================================================
    // Data Constants (Ported from HistorySimulator.html)
    //=============================================================================

    const fs = require('fs');
    const path = require('path');

    let HYPERPOWERS = {};
    let FACTIONS = {};
    // Every leader in Leaders.json, filed under the nation they belong to
    // (their `country`). A power seats the leaders of whatever it holds, so
    // this is read whenever a nation changes hands (leaderPoolFor).
    let LEADERS_BY_COUNTRY = {};

    // The book itself, both ways round: by its Leaders.json id and by the name
    // that id carries. Everything outside the simulation addresses a leader by
    // name (the wiki, the Empathize panel, an event sentence), and everything
    // inside Leaders.json addresses them by id, so both indices are kept.
    // A leader's record is what says who they are beyond the office: the
    // portrait to draw them with, the nation they belong to, the years they
    // count for and, where the same person is also a pre-made character, the
    // dossier they are playable from.
    let LEADERS_BY_ID = {};
    let LEADERS_BY_NAME = {};

    // Module-level JSON reader. Everything the simulator needs is normally
    // already on window (DataService loads the db folder); this is the fallback
    // for a run that happens before that, and is NW.js-only by nature.
    function loadJsonFile(relPath) {
        try {
            const fullPath = path.join(process.cwd(), relPath);
            if (!fs.existsSync(fullPath)) return null;
            return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch (e) {
            console.error('[HistorySimulator] Failed to read', relPath, e);
            return null;
        }
    }

    (function loadWorldGenData() {
        function loadJson(relPath) {
            const fullPath = path.join(process.cwd(), relPath);
            if (!fs.existsSync(fullPath)) return null;
            try { return JSON.parse(fs.readFileSync(fullPath, 'utf8')); }
            catch (e) { console.error('[HistorySimulator] Failed to parse', relPath, e); return null; }
        }

        try {
            const lang = (typeof ConfigManager !== 'undefined' && ConfigManager.language) || 'en';
            const hpData       = loadJson('js/db/WorldGen/Hyperpowers.json');
            const leadersData  = loadJson('js/db/WorldGen/Leaders.json');
            const factionsData = loadJson('js/db/WorldGen/Factions.json');
            const ideologyI18n = loadJson(`js/i18n/${lang}/ideology.json`) || loadJson('js/i18n/en/ideology.json') || {};
            const factionI18n  = loadJson(`js/i18n/${lang}/faction.json`)  || loadJson('js/i18n/en/faction.json')  || {};
            const personalI18n = loadJson(`js/i18n/${lang}/personality.json`) || loadJson('js/i18n/en/personality.json') || {};

            function resolveLeader(id) {
                if (!leadersData) return null;
                const raw = leadersData[id];
                if (!raw) return null;
                const rawKey = raw.ideology || raw.personality || '';
                let ideology;
                if (rawKey.startsWith('ideology.')) {
                    ideology = ideologyI18n[rawKey] || rawKey.replace('ideology.', '').replace(/_/g, ' ');
                } else if (rawKey.startsWith('personalities.')) {
                    const pKey = rawKey.split('.')[1];
                    ideology = (personalI18n.personality && personalI18n.personality[pKey] && personalI18n.personality[pKey].name) || rawKey.replace('personalities.', '').replace(/_/g, ' ');
                } else {
                    ideology = rawKey;
                }
                // `ideology` is the finished label, kept because saves and other
                // readers already hold it. `ideologyKey` is the id it was
                // resolved from, and is what a later read localizes through:
                // this block runs before ConfigManager.load(), so the label it
                // writes is always the English one.
                return { name: raw.name, ideology, ideologyKey: rawKey || null,
                         country: raw.country || null,
                         // Whether this one may hold a power's MORAL office
                         // (Leaders.json `moralGuide`); everyone else governs.
                         moralGuide: raw.moralGuide === true,
                         // A written-down head of state: an office the book
                         // fills itself, for exactly the years on this record,
                         // rather than one an election decides (NPCPolitics
                         // canonHeadRecord). North Korea's three Kims are the
                         // whole of this list.
                         headOfState: raw.headOfState === true,
                         // The id this entry reads by, so anything holding only
                         // a seated leader can still reach the whole record.
                         id: id,
                         // The face and the walk sheet the world draws them
                         // with. `bust` is a path relative to the game root
                         // ("img/busts/presets/Andreotti.png"); a leader with
                         // none falls back to their sprite's own bust.
                         bust: raw.bust || null,
                         sprite: raw.spritename || null,
                         spriteIndex: raw.spriteindex || 0,
                         // The pre-made character dossier this person is also
                         // playable as (CharacterCreationPresets), by dossier
                         // name. Only a handful of leaders carry one.
                         preset: raw.preset || null,
                         // Everything a real person's record says about them
                         // beyond the office. A historical leader (`real`) is
                         // written down in Leaders.json rather than derived:
                         // the day they were born, the town they were born in,
                         // who they were drawn to, and the traits they are read
                         // by. A fictional leader carries none of these and is
                         // derived exactly as before.
                         real: raw.real === true,
                         // Canon: a figure this world wrote rather than
                         // history (a legend, a god, an ascended banker).
                         canon: raw.canon === true,
                         immortal: raw.immortal === true,
                         // An i18n key holding the one thing about them that
                         // is not an office or a date, printed on their
                         // article (NPCEmpathizeUI, leader overview).
                         loreKey: raw.loreKey || null,
                         birthDate: raw.birthDate || null,
                         birthYear: Number.isFinite(raw.birthYear) ? raw.birthYear : null,
                         hometown: raw.hometown || null,
                         gender: raw.gender !== undefined ? raw.gender : null,
                         sexualOrientation: raw.sexualOrientation || null,
                         romanticOrientation: raw.romanticOrientation || null,
                         traits: Array.isArray(raw.traits) ? raw.traits.slice() : null,
                         years: raw.years || [1900, 2012], protected: raw.protected === true };
            }

            // Everyone in the book, filed by the nation they belong to. This is
            // what a conqueror inherits: hold a nation and its political class
            // is available to you (HistoryManager.leaderPoolFor).
            if (leadersData) {
                for (const id of Object.keys(leadersData)) {
                    const leader = resolveLeader(id);
                    if (!leader) continue;
                    // Everyone in the book is indexed, nation or no nation: a
                    // leader with no country still holds an office somewhere
                    // (the gods, the alien envoys) and still has an article.
                    LEADERS_BY_ID[id] = leader;
                    if (leader.name && !LEADERS_BY_NAME[leader.name]) LEADERS_BY_NAME[leader.name] = leader;
                    const nation = leadersData[id].country;
                    if (!nation) continue;
                    (LEADERS_BY_COUNTRY[nation] = LEADERS_BY_COUNTRY[nation] || []).push(leader);
                }
                for (const list of Object.values(LEADERS_BY_COUNTRY)) {
                    list.sort((a, b) => a.years[0] - b.years[0]);
                }
            }

            if (hpData && hpData.hyperpowers) {
                for (const [name, data] of Object.entries(hpData.hyperpowers)) {
                    const leaders = (data.leaders || []).map(resolveLeader).filter(Boolean);
                    const holyLeaders = (data.holy_leaders || []).map(resolveLeader).filter(Boolean);
                    HYPERPOWERS[name] = {
                        leaders,
                        holy_leaders: holyLeaders.length ? holyLeaders : undefined,
                        // The ground a power stands on: the region it may act
                        // in at all, and the one nation nobody may ever take
                        // off it. Both are read straight from Hyperpowers.json
                        // (see regionOfPower / homeNationOwner below).
                        region:      data.region      || null,
                        homeNation:  data.homeNation  || null,
                        secluded:    data.secluded === true,
                        // A power that is not there when the century starts.
                        // "YYYY-MM": the month it declares itself, takes its
                        // seat and begins to act (see handleFoundings).
                        founded:     data.founded     || null,
                        population:  data.population  || 10000000,
                        economy:     data.economy     || 100,
                        military:    data.military    || 100,
                        information: data.information || 50,
                        arcane:      data.arcane      || 20
                    };
                }
            }

            if (factionsData && Array.isArray(factionsData)) {
                factionsData.forEach(f => {
                    if (!f.name) return;
                    const key = f.name.split('.')[1] || f.name.split('.')[0];
                    let realName = key;
                    if (factionI18n.factions && factionI18n.factions[key] && factionI18n.factions[key].name) {
                        realName = factionI18n.factions[key].name;
                    }
                    if (!FACTIONS[realName]) {
                        // A faction has no roster of its own any more: it fields
                        // the political class of the nations its power holds
                        // (`parentHyperpower` in Factions.json, resolved against
                        // LEADERS_BY_COUNTRY through leaderPoolFor). An orphan
                        // faction fields nobody and simply never headlines an
                        // event.
                        const leaders = [];
                        FACTIONS[realName] = {
                            parentPower: f.parentHyperpower || null,
                            leaders,
                            arcane:      f.arcane      || 50,
                            tech:        f.velocity    || f.tech || 50,
                            information: f.information || 50
                        };
                    }
                });
            }

            if (Object.keys(HYPERPOWERS).length === 0) {
                console.warn('[HistorySimulator] No hyperpower data loaded; simulation will be empty.');
            }
        } catch (e) {
            console.error('[HistorySimulator] Failed to load WorldGen data:', e);
        }
    })();

    // i18n-ignore-start  country, controller and faction ids. They are matched
    // against WorldGen data and FactionDataManager, and every display of them
    // goes through those systems' own labels.
    const COUNTRIES = {
        'Italy': { controller: 'Holy Vatican Empire', faction: 'The Gods' },
        'United Kingdom': { controller: 'Britannia', faction: 'Mages Guild' },
        'Norway': { controller: 'Goblin Horde', faction: 'Neutral' },
        'Russia': { controller: 'Soviet Union', faction: 'Archive Foundation' },
        'Turkey': { controller: 'Ottoman Empire', faction: 'Neutral' },
        'Netherlands': { controller: 'Neutral', faction: 'Hypercapitalist Collective' },
        'Belgium': { controller: 'Neutral', faction: 'Neutral' },
        'Switzerland': { controller: 'Neutral', faction: 'Neutral' },
        'Austria': { controller: 'Neutral', faction: 'Neutral' },
        'Poland': { controller: 'Neutral', faction: 'Neutral' },
        'Czechoslovakia': { controller: 'Neutral', faction: 'Neutral' },
        'Hungary': { controller: 'Neutral', faction: 'Neutral' },
        'Romania': { controller: 'Neutral', faction: 'Neutral' },
        'Bulgaria': { controller: 'Neutral', faction: 'Neutral' },
        'Yugoslavia': { controller: 'Neutral', faction: 'Neutral' },
        'Greece': { controller: 'Neutral', faction: 'Neutral' },
        'Denmark': { controller: 'Neutral', faction: 'Neutral' },
        'Sweden': { controller: 'Neutral', faction: 'Neutral' },
        'Finland': { controller: 'Neutral', faction: 'Neutral' },
        'Ireland': { controller: 'Neutral', faction: 'Neutral' },
        'Albania': { controller: 'Neutral', faction: 'Neutral' },
        'Estonia': { controller: 'Neutral', faction: 'Neutral' },
        'Latvia': { controller: 'Neutral', faction: 'Neutral' },
        'Lithuania': { controller: 'Neutral', faction: 'Neutral' }
    };
    // i18n-ignore-end

    // i18n-ignore-start  event type ids: stored on every event record and used
    // as the lookup key into History.event.basic / History.event.weird
    const EVENT_TYPES = {
        political: [
            'assassination attempt', 'election', 'coup attempt', 'reforms', 'scandal',
            'purge', 'treaty signing', 'constitutional crisis', 'mass exile',
            'secret police expansion', 'referendum', 'state funeral', 'propaganda campaign',
            'censorship decree', 'party schism', 'border treaty', 'amnesty', 'show trial'
        ],
        military: [
            'border skirmish', 'naval encounter', 'weapon development', 'military parade',
            'siege', 'aerial bombardment', 'mutiny', 'blockade', 'armistice talks',
            'conscription drive', 'fortification project', 'mercenary contract',
            'submarine incident', 'proxy war', 'airship disaster', 'cavalry charge',
            'chemical trial', 'high defection'
        ],
        economic: [
            'market crash', 'trade agreement', 'industrial growth', 'resource discovery',
            'famine', 'currency reform', 'general strike', 'bank collapse', 'smuggling ring',
            'gold rush', 'rationing', 'monopoly formed', 'hyperinflation', 'trade embargo',
            'railway boom', 'harvest failure', 'guild charter'
        ],
        social: [
            'plague outbreak', 'technological breakthrough', 'cultural festival', 'religious event',
            'mass migration', 'university founded', 'sporting triumph', 'great fire',
            'public execution', 'medical discovery', 'literary movement', 'riot',
            'temperance crusade', 'quarantine', 'census', 'cinema opens', 'radio craze',
            'schism of faith'
        ],
        paranormal: [
            'StrangeLightsInSky', 'MysteriousDisappearances', 'PropheticDreams', 'CryptidSighting',
            'ThoughtTransmittedDisease', 'TimeAnomaly', 'RainOfFish', 'BleedingStatues',
            'SpontaneousCombustion', 'GhostTrain', 'MirrorPlague', 'DoppelgangerEpidemic',
            'SleepwalkingPilgrimage', 'GravityInversion', 'SecondMoon', 'WhisperingWells',
            'LivingShadows', 'MemoryFog', 'HollowChildren', 'SoulHarvest', 'DimensionalRift',
            'ReverseRain', 'SingingStones', 'ClockworkPossession', 'PoltergeistUprising',
            'MassHallucination', 'AngelicSighting', 'DemonicIncursion', 'LeyLineSurge',
            'NumberStation', 'GeometryFailure', 'LanguageDecay', 'ThePaleVisitor', 'WeepingSky',
            'InfiniteStaircase', 'TelepathicPlague', 'ColorLoss', 'MoonSickness', 'SkyLeviathan',
            'ChronoEcho', 'CorpseAwakening', 'FleshTelegraph', 'StaticSermon', 'DreamQuarantine',
            'ShadowTax', 'UnbornChoir', 'GlassRain', 'CompassFailure', 'AnimalCouncil', 'NameTheft',
            'PetrodemonAttack', 'PetrodemonSwarm', 'PetrodemonWellBreach', 'PetrodemonPact'
        ],
        occult: [
            'grimoire recovered', 'coven exposed', 'ritual sacrifice', 'summoning gone wrong',
            'relic consecration', 'ley survey', 'public exorcism', 'alchemical breakthrough',
            'necromantic scandal', 'blood moon rite', 'oracle installed', 'curse laid',
            'canonization', 'heresy trial', 'astrological decree', 'spirit binding',
            'occult academy founded', 'forbidden translation',
            'mass sacrifice', 'heart offering', 'sacrificial procession', 'temple reconsecrated'
        ],
        scientific: [
            'polar expedition', 'observatory built', 'particle experiment', 'vaccine trial',
            'archaeological dig', 'failed prototype', 'radio anomaly research',
            'cryptozoological survey', 'deep drilling', 'flight record', 'vivisection scandal',
            'element isolated', 'seismic study', 'surgical first', 'computing engine', 'rocket test'
        ],
        disaster: [
            'earthquake', 'flood', 'volcanic eruption', 'mine collapse', 'shipwreck', 'firestorm',
            'blizzard', 'meteor strike', 'dam failure', 'train wreck', 'landslide', 'drought',
            'locust swarm', 'bridge collapse'
        ],
        criminal: [
            'heist', 'serial killer', 'smuggling bust', 'assassin guild', 'black market',
            'kidnapping', 'forgery scandal', 'prison break', 'arson ring', 'body snatching',
            'counterfeit relics', 'gang war'
        ],
        royal: [
            'royal wedding', 'succession crisis', 'royal scandal', 'coronation', 'abdication',
            'royal birth', 'dynastic pact', 'regicide', 'jubilee', 'royal exile', 'pretender emerges'
        ]
    };
    // i18n-ignore-end

    // Relative frequency of each category in the monthly random-event roll.
    // The paranormal and occult strands carry the setting, so they are drawn
    // more often than the mundane political/economic background noise.
    const CATEGORY_WEIGHTS = {
        political: 12,
        military: 12,
        economic: 9,
        social: 11,
        paranormal: 24,
        occult: 11,
        scientific: 8,
        disaster: 6,
        criminal: 6,
        royal: 5
    };

    // --- How dense a day is ---------------------------------------------------
    // The century is written a day at a time. Everything that used to be rolled
    // once a month keeps its old odds by being divided by the length of one:
    // MONTHLY(x) is "x per month, asked every day". The random-event strand is
    // the exception - it is the chronicle itself, and is set here rather than
    // derived, at roughly twenty entries a year with several of them landing on
    // one day.
    const DAYS_PER_MONTH = 30.44;
    const MONTHLY = (chance) => chance / DAYS_PER_MONTH;

    // The date a record is stamped with, in LOCAL time. toISOString() answers in
    // UTC, which stamps a January morning with the previous December's date
    // anywhere west of Greenwich - invisible while everything was dated to the
    // month, and a day off once records carry days.
    const dayStr = (date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const monthStr = (date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    // The chance that a day carries any random event at all, and then the
    // chances of a second, a third, a fourth and a fifth on top of it. Once a
    // day is eventful it usually is not eventful just once: the Archive reads
    // a busy day by its single most newsworthy entry (historyPickHeadline,
    // HelpMenu.js), so a day needs real odds of rolling several before that
    // pick means anything.
    const DAILY_EVENT_CHANCE = 0.07;
    const EXTRA_EVENT_CHANCES = [0.55, 0.30, 0.12, 0.04];

    // i18n-ignore-start  hyperpower ids

    // How the century is required to end, whatever year it is asked to end in.
    // These four are the world's own furniture: the Archive, the wiki and every
    // NPC who talks about the present day is written against them, so the last
    // pass of the simulation seats them and nothing after it moves them.
    const FINAL_MORAL_GUIDES = {
        'Holy Vatican Empire': 'Pope Petrus II',
    };
    const FINAL_POLITICAL_LEADERS = {
        'Britannia': 'Margaret Thatcher',
        'Free States of Midwest': 'Bill Clinton',
        'Eastern Seaboard': 'George W. Bush',
    };
    // i18n-ignore-end

    const ICONS = {
        political: 191,
        military: 115,
        economic: 187,
        social: 127,
        paranormal: 245,
        occult: 249,
        scientific: 79,
        disaster: 64,
        criminal: 217,
        royal: 145,
        epidemic: 177,
        conquest: 97,
        war: 223,
        peace: 237,
        internal: 212,
        diplomatic: 190
    };


    // --- Mortality ------------------------------------------------------------
    // Until now the only way out of office was a bullet: a leader was either
    // assassinated, executed, or ran out of the years their Leaders.json entry
    // gave them. Nobody simply got old, and nobody ever got ill. These two
    // strands close that gap, and both of them read the same ages the book
    // already writes down (`birthDate` / `birthYear`).
    //
    // Old age is a Gompertz curve: the yearly odds of dying double roughly
    // every eight years of age, which puts a sixty-year-old at a fraction of a
    // percent and a ninety-year-old at better than one in six. The office
    // protects nobody from it, but `protected` and `immortal` do: a figure the
    // world is written around outlives the century by construction.
    const MORTALITY_BASE_AGE = 55;          // where the curve starts to bite
    const MORTALITY_AT_BASE  = 0.006;       // yearly odds at that age
    const MORTALITY_DOUBLING = 8;           // years of age per doubling
    const MORTALITY_CAP      = 0.35;        // yearly odds, however old they get

    // A leader can also be diagnosed with something that kills them. Only a
    // MORTAL disease is ever handed out (Diseases.json `severity: lethal`, or a
    // case fatality ratio a tenth of the sick and worse): a head of state with
    // a head cold is not history. The diagnosis is announced the day it is
    // made, and the illness runs for a while before it takes them, so the world
    // gets to read about a dying leader rather than only a dead one.
    const ILLNESS_YEARLY_CHANCE = 0.012;    // at MORTALITY_BASE_AGE; scales with age
    const ILLNESS_MIN_MONTHS = 2;
    const ILLNESS_MAX_MONTHS = 30;
    const ILLNESS_MIN_AGE = 30;             // nobody younger is written up as terminal
    // A handful of names had not been given to anything yet. A 1912 chancellor
    // does not die of a disease medicine had not described, so these carry the
    // year they became sayable; everything else is fair game for the century.
    const ILLNESS_EARLIEST = {
        hiv: 1981, aids: 1981, cjd: 1920, kuru: 1957, 'fatal-insomnia': 1986,
        legionellosis: 1976, hantavirus: 1993, ebola: 1976, marburg: 1967,
        'mad-cow': 1986, sars: 2002, 'hepatitis-c': 1989
    };

    // Every mortal disease in the table, read once. The epidemic layer owns the
    // living version of this data (window.Health.Diseases); the simulation can
    // run before any of that is up, so the file is the fallback.
    let MORTAL_DISEASES = null;
    function mortalDiseases() {
        if (MORTAL_DISEASES) return MORTAL_DISEASES;
        const data = (window.Health && window.Health.Diseases)
            || loadJsonFile('js/db/Health/Diseases.json');
        const list = (data && Array.isArray(data.diseases)) ? data.diseases : [];
        MORTAL_DISEASES = list.filter(d =>
            d && d.id && !d.stageOnly &&
            (d.severity === 'lethal' || (typeof d.cfr === 'number' && d.cfr >= 0.1)));
        return MORTAL_DISEASES;
    }

    // Form of government a nation adopts while under a given hyperpower's
    // control. Mirrors NPCPolitics' ARCHETYPES so the wiki shows the same
    // labels whether the data comes from history or the live simulation.
    // i18n-ignore-start  controller ids in, government ids out. The label for a
    // government id is History.government.<id>, resolved by governmentFor().
    const HYPERPOWER_GOVS = {
        'Holy Vatican Empire': 'Theocracy',
        'USSR': 'Single-Party State',
        'Soviet Union': 'Single-Party State',
        'Britannia': 'Parliamentary Monarchy',
        'Archive Foundation': 'Technocracy',
        'Ottoman Empire': 'Sultanate',
        'The Gods': 'Divine Pantheon',
        'San Marino Republic': 'Serene Republic',
        'Hypercapitalist Collective': 'Corporatocracy',
        'Goblin Horde': 'Warband Confederacy',
        'Free States of Midwest': 'Free Confederation',
        'Cascadia Protectorate': 'Crown Protectorate',
        'Eastern Seaboard': 'Punitive Colony Regime',
        'Kukulkan Ascendancy': 'Divine Empire',
        "Democratic People's Republic of Korea": 'Hereditary Republic',
        'Dharma Directorate': 'Harmonious Empire',
        'Illuminated Khanate': 'Illuminated Khanate',
        'Solomonic Republic': 'Solomonic Republic',
        'Petro Kingdom of Arabia': 'Petro Monarchy',
        'Islamic Republic of Iran': 'Clerical Republic',
        'Sanatana Rashtra': 'Dharmic Republic',
        'Long Chile': 'Expansionist Republic'
    };

    // Independent (Neutral) nations get a stable, name-seeded flavor of
    // self-rule that they return to whenever they break free.
    const NEUTRAL_GOVS = [
        'Parliamentary Republic', 'Constitutional Monarchy', 'Federal Republic',
        'Confederation of Cantons', 'City-State Council', 'Crowned Republic'
    ];
    // i18n-ignore-end

    // The transfer action is an id ('stole' is tested for by name below); the
    // wording a player reads is History.artifact.action.<id>.
    const ARTIFACT_TRANSFER_ACTIONS = ['seized', 'purchased', 'inherited', 'stole', 'was gifted'];  // i18n-ignore  transfer action ids

    // Which events move which statistic. This used to be decided by searching the
    // finished sentence for English words, which stopped working the moment the
    // sentence could be written in another language, so it keys off the event's
    // own type id instead.
    // i18n-ignore-start  event type ids, matched against the event record
    const EFFECT_TYPES = {
        ecoCrash: ['market crash', 'bank collapse', 'hyperinflation', 'trade embargo',
                   'general strike', 'smuggling ring'],
        ecoBoom:  ['industrial growth', 'railway boom', 'trade agreement', 'monopoly formed',
                   'gold rush', 'resource discovery'],
        popLoss:  ['plague outbreak', 'famine', 'drought', 'locust swarm', 'quarantine',
                   'ThoughtTransmittedDisease', 'TelepathicPlague', 'DreamQuarantine',
                   'MoonSickness', 'SoulHarvest'],
        ecoDamage: ['earthquake', 'flood', 'volcanic eruption', 'firestorm', 'blizzard',
                    'landslide', 'mine collapse', 'bridge collapse', 'dam failure',
                    'great fire', 'shipwreck', 'train wreck', 'meteor strike'],
        infoGain: ['technological breakthrough', 'medical discovery', 'element isolated',
                   'observatory built', 'particle experiment', 'radio anomaly research',
                   'seismic study', 'computing engine', 'archaeological dig',
                   'cryptozoological survey', 'ley survey', 'census'],
        techGain: ['TimeAnomaly', 'DimensionalRift', 'LeyLineSurge', 'GravityInversion',
                   'ChronoEcho', 'GeometryFailure', 'rocket test', 'flight record'],
        arcaneGain: ['ritual sacrifice', 'grimoire recovered', 'summoning gone wrong',
                     'oracle installed', 'curse laid', 'public exorcism', 'relic consecration',
                     'spirit binding', 'blood moon rite', 'forbidden translation',
                     'occult academy founded', 'coven exposed', 'necromantic scandal',
                     'canonization', 'heresy trial', 'astrological decree',
                     'alchemical breakthrough'],
        militaryGain: ['conscription drive', 'military parade', 'fortification project',
                       'mercenary contract', 'weapon development', 'siege'],
    };
    // i18n-ignore-end

    // A government id's display label. Unknown ids read as themselves so a
    // government added to the data files still shows something sensible.
    function governmentLabel(id) {
        const key = 'History.government.' + String(id || '');
        return T.has(key) ? T(key) : String(id || '');
    }

    //=============================================================================
    // Localizable descriptions
    //=============================================================================
    // A timeline is world-shared: it is written once and then read by every
    // savegame of that world, in whatever language each of them is played in.
    // So an event never stores only its finished prose. It stores the i18n key
    // and the params it was written from (`descKey` / `descParams`) and the
    // sentence is rebuilt on read, the same way NPCSociety writes out a bio.
    // A param may itself be a translated fragment, in which case it is stored
    // as a nested key descriptor `{ $k, $p }` rather than as finished text.

    function LK(key, params) { return { $k: String(key), $p: params || null }; }
    function isLK(v) { return !!v && typeof v === 'object' && typeof v.$k === 'string'; }

    // A faction-data label (ideology, personality): its copy lives in
    // FactionDataManager, not in History.json, so it carries its own marker.
    function FD(id) { return { $fd: String(id) }; }
    function isFD(v) { return !!v && typeof v === 'object' && typeof v.$fd === 'string'; }
    function renderFD(id) {
        return FactionDataManager.instance ? FactionDataManager.instance.t(id) : id;
    }

    // An artifact's name is composed per language by generateArtifacts and
    // re-injected into the database every session, so an event names the
    // artifact by record rather than by the name it happened to carry when the
    // century was simulated. The stored name is the fallback for a database
    // that no longer holds it.
    function AR(kind, id, name) { return { $art: kind + ':' + id, $n: name }; }
    function isAR(v) { return !!v && typeof v === 'object' && typeof v.$art === 'string'; }
    function renderAR(v) {
        const [kind, id] = String(v.$art).split(':');
        const db = kind === 'weapon' ? $dataWeapons : kind === 'armor' ? $dataArmors : $dataItems;
        const rec = db && db[Number(id)];
        return (rec && rec.name) || v.$n || '';
    }

    // A disease is a data label too: its name lives in the Diseases i18n bank
    // (js/i18n/<lang>/plugins/Diseases.json), which the epidemic layer reads and
    // the simulation does not. An obituary names the illness by id so it reads
    // in whatever language the world is opened in; the stored name is the
    // fallback for an id the bank no longer carries.
    function DZ(id, name) { return { $dz: String(id), $n: name || '' }; }
    function isDZ(v) { return !!v && typeof v === 'object' && typeof v.$dz === 'string'; }
    function renderDZ(v) {
        const bank = (window.T && typeof T.obj === 'function' && T.obj('Diseases')) || null;
        const entry = bank && bank.disease && bank.disease[v.$dz];
        return (entry && entry.name) || v.$n || v.$dz;
    }

    function renderParam(v) {
        if (isLK(v)) return renderLK(v.$k, v.$p);
        if (isFD(v)) return renderFD(v.$fd);
        if (isAR(v)) return renderAR(v);
        if (isDZ(v)) return renderDZ(v);
        // A plain string param is nearly always a world name: the nation an
        // event happened in, the hyperpower or faction behind it, the leader who
        // ordered it. Those are stored under their English name because that
        // name is the id, so the label is resolved on the way out. Matching is
        // whole-value and exact, so an event type id or a number passes through.
        if (typeof v === 'string' && window.WorldNames) return window.WorldNames.any(v);
        return v;
    }

    function renderLK(key, params) {
        if (!key) return '';
        let resolved = params;
        if (params) {
            resolved = {};
            for (const k of Object.keys(params)) resolved[k] = renderParam(params[k]);
        }
        return T(key, resolved);
    }

    // The fields an event record carries for one description. Spread in place
    // of a plain `description:` line.
    function descOf(key, params) {
        return { description: renderLK(key, params), descKey: String(key), descParams: params || null };
    }

    // The sentence for a stored record in the active language, falling back to
    // the prose a world simulated before descriptions were keyed. That prose is
    // finished English and cannot be rebuilt, but the world names inside it are
    // still recognisable, so at least those follow the language.
    function renderRecord(rec) {
        if (!rec) return '';
        if (rec.descKey) return renderLK(rec.descKey, rec.descParams);
        const prose = String(rec.description || '');
        return window.WorldNames ? window.WorldNames.localize(prose) : prose;
    }

    // Which written-out field each kind of record rebuilds, and the key/params
    // fields it rebuilds it from: [plain, key, params].
    const LOC_FIELDS = {
        event:    [['description', 'descKey', 'descParams']],
        nation:   [['government', 'governmentKey', null], ['reason', 'reasonKey', 'reasonParams']],
        death:    [['cause', 'causeKey', 'causeParams']],
        epidemic: [['name', 'nameKey', 'nameParams']],
        // An artifact record owns a provenance list, so its pass carries on
        // into the holders underneath it.
        artifact: [['action', 'actionKey', 'actionParams']],
        holder:   [['how', 'howKey', 'howParams']],
    };

    // Rewrites the keyed fields of a list of records when the active language
    // is not the one it was last written in. The stamp lives on the array
    // object itself, so a read costs one comparison and nothing reaches the
    // world's JSON files. A record with no key keeps the prose it was saved
    // with, which is what a world simulated before this carries.
    function currentLang() {
        return (window.T && typeof T.language === 'function') ? T.language() : 'en';
    }

    function localizeList(list, kind) {
        if (!Array.isArray(list)) return list;
        const lang = (window.T && typeof T.language === 'function') ? T.language() : 'en';
        if (list.__i18nLang === lang) return list;
        const specs = LOC_FIELDS[kind] || LOC_FIELDS.event;
        for (const rec of list) {
            if (!rec) continue;
            for (const [plain, keyField, paramsField] of specs) {
                const key = rec[keyField];
                if (key) rec[plain] = renderLK(key, paramsField ? rec[paramsField] : null);
            }
            if (kind === 'artifact') {
                // The name too: generateArtifacts recomposes it every session.
                rec.name = renderAR(AR(rec.kind || 'item', rec.id, rec.name));
                localizeList(rec.holders, 'holder');
            }
        }
        try {
            Object.defineProperty(list, '__i18nLang',
                { value: lang, configurable: true, writable: true, enumerable: false });
        } catch (err) {
            // Sealed array: the pass simply runs again on the next read.
        }
        return list;
    }

    // Same pass over a map of records (leader deaths, artifact records).
    function localizeMap(map, kind) {
        if (!map || typeof map !== 'object') return map;
        const lang = (window.T && typeof T.language === 'function') ? T.language() : 'en';
        if (map.__i18nLang === lang) return map;
        localizeList(Object.values(map), kind);
        try {
            Object.defineProperty(map, '__i18nLang',
                { value: lang, configurable: true, writable: true, enumerable: false });
        } catch (err) { /* see localizeList */ }
        return map;
    }

    function getRandomHighMpSkill(rand) {
        const rnd = typeof rand === 'function' ? rand : Math.random;
        if (typeof $dataSkills === 'undefined' || !$dataSkills) return "PropheticDreams";
        const highMpSkills = $dataSkills.filter(s => s && s.mpCost >= 100);
        if (highMpSkills.length === 0) return "PropheticDreams";
        const skill = highMpSkills[Math.floor(rnd() * highMpSkills.length)];
        return skill.name;
    }

    //=============================================================================
    // History Manager Class
    //=============================================================================

    // Coerce any seed (number, numeric string, or a named word such as the
    // default "esoteric") into a uint32 RNG root. The simulation and every
    // downstream consumer (procgen, loot, etc.) does arithmetic on the seed, so
    // it must always be stored as a number. Reuses ProcGenUtils.normalizeSeed
    // when available so named seeds hash identically everywhere.
    function normalizeHistorySeed(value) {
        if (window.ProcGenUtils && typeof window.ProcGenUtils.normalizeSeed === "function") {
            return window.ProcGenUtils.normalizeSeed(value);
        }
        if (typeof value === "number" && isFinite(value)) return value >>> 0;
        const str = String(value == null ? "" : value);
        if (/^\d+$/.test(str)) return Number(str) >>> 0;
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return h >>> 0;
    }

    // Build a seeded RNG for a simulation run. Prefers NPCShared.Rng (canonical
    // xorshift32); falls back to an identical inline xorshift if NPCShared has
    // not loaded yet (load order places it after this plugin). Threading a
    // single seeded stream through the whole run is what makes "same seed, same
    // world" actually hold; raw Math.random() would break determinism.
    function makeRng(seed) {
        // Treat 0 as a valid seed: remap a 0 root to a fixed nonzero constant
        // distinct from real seed 1, so the xorshift stream never collapses and
        // seed 0 and seed 1 do not silently share a stream.
        const root = normalizeHistorySeed(seed) || 0x9E3779B9;
        if (window.NPCShared && window.NPCShared.Rng) {
            return new window.NPCShared.Rng(root);
        }
        let s = root >>> 0;
        return {
            next() {
                let x = s;
                x ^= x << 13; x >>>= 0;
                x ^= x >> 17;
                x ^= x << 5;  x >>>= 0;
                s = x;
                return x / 4294967296;
            },
            int(min, max)     { return min + Math.floor(this.next() * (max - min + 1)); },
            nextInt(min, max) { return min + Math.floor(this.next() * (max - min)); },
            pick(arr)         { return arr[Math.floor(this.next() * arr.length)]; }
        };
    }

    class HistoryManager {
        constructor() {
            this.reset();
        }

        // Current simulation RNG. Always seeded from the world seed before a run;
        // _rand() falls back to a fresh seeded stream if somehow called first.
        _rand() {
            if (!this._rng) this._rng = makeRng(this.getSeed());
            return this._rng.next();
        }

        setSeed(seed) {
            seed = normalizeHistorySeed(seed);
            this._seed = seed;
            if (window.WorldManager) {
                window.WorldManager.setField("history", "seed", seed);
            } else if ($gameSystem) {
                $gameSystem._historySeed = seed;
            }
        }

        getSeed() {
            // The world store wins: setSeed() always writes it, and it stays
            // correct when the active world changes within a session.
            if (window.WorldManager) {
                const seed = window.WorldManager.getField("history", "seed");
                if (seed !== undefined) return seed;
            }
            if (this._seed !== undefined) return this._seed;
            if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._historySeed !== undefined) {
                return $gameSystem._historySeed;
            }
            return 19002001; // Canon default seed
        }

        reset() {
            // Note: _seed is intentionally preserved so a seed chosen via
            // setSeed() right before runSimulation() is not lost.
            this._events = [];
            this._deadLeaders = new Set();
            this._currentLeaders = {};
            // power -> the day it declared itself, for the ones that are not
            // there when the century starts.
            this._foundedPowers = {};
            this._currentHolyLeaders = {};  // for powers with holy_leaders dual-track (e.g. Holy Vatican Empire)
            this._currentMoralGuides = {};  // power → the leader holding its moral office
            this._currentFactionLeaders = {};
            this._nationHistory = {};   // country → [{date, controller, government, reason}]
            this._artifactRecords = {}; // "kind:id" → {name, date, action, holders:[...]}
            this._leaderDeaths = {};    // leader name → {date, cause}
            this._leaderIllness = {};   // leader name → {diseaseId, diseaseName, since, until}
            this._epidemics = [];       // the century's plagues and panics
            this._earthRegionSet = null; // rebuilt from the countries below

            const fdm = FactionDataManager.instance;
            const useFdm = fdm && fdm._ready;
            this._currentHyperpowers = useFdm ? JSON.parse(JSON.stringify(fdm._hyperpowers)) : JSON.parse(JSON.stringify(HYPERPOWERS));
            this._currentFactions = useFdm ? JSON.parse(JSON.stringify(fdm._historicalFactions)) : JSON.parse(JSON.stringify(FACTIONS));
            this._currentCountries = useFdm ? JSON.parse(JSON.stringify(fdm._countries)) : JSON.parse(JSON.stringify(COUNTRIES));

            // Ensure every leader has a valid years range. FactionDataManager's
            // hyperpower/faction data may omit it, which would crash the
            // active-leader filters (l.years[0]) during simulation.
            const normalizeLeaders = (collection) => {
                if (!collection) return;
                for (const key in collection) {
                    const entry = collection[key];
                    if (!entry) continue;
                    [entry.leaders, entry.holy_leaders].forEach(list => {
                        if (!Array.isArray(list)) return;
                        list.forEach((l, i) => {
                            // Unresolved entries may still be raw string keys; wrap them.
                            if (typeof l === 'string') {
                                l = list[i] = { name: l };
                            }
                            if (l && (!Array.isArray(l.years) || l.years.length < 2)) {
                                l.years = [1900, 2012];
                            }
                        });
                    });
                }
            };
            normalizeLeaders(this._currentHyperpowers);
            normalizeLeaders(this._currentFactions);
        }

        // Composes the whole artifact set from the world seed in the ACTIVE
        // language. Pure: same seed always yields the same set, and only the
        // written name and description follow the language.
        composeArtifacts() {
            if (!this._seed) this._seed = normalizeHistorySeed(this.getSeed());
            // Derive a dedicated seeded stream so artifact identity is a pure
            // function of the world seed (independent of any prior sim rolls).
            const artRng = makeRng(this._seed);
            function sRand() { return artRng.next(); }

            // Word banks per language. Italian puts the noun first and agrees the
            // adjective with it, so the feminine forms sit in their own list and
            // the nouns that need them are named in `nounGender`.
            const adjectives = T.list('History.artifactName.adjectives');
            const adjectivesFem = T.list('History.artifactName.adjectivesFem');
            const nounGender = T.obj('History.artifactName.nounGender') || {};
            const itemNouns = T.list('History.artifactName.itemNouns');
            const weaponNouns = T.list('History.artifactName.weaponNouns');
            const armorNouns = T.list('History.artifactName.armorNouns');

            const generated = { items: [], weapons: [], armors: [] };

            function createArtifact(id, nounList, isWeapon, isArmor) {
                const adjIdx = Math.floor(sRand() * adjectives.length);
                const noun = nounList[Math.floor(sRand() * nounList.length)];
                const adj = (nounGender[noun] === 'f' ? adjectivesFem[adjIdx] : null)
                    || adjectives[adjIdx];
                const obj = {
                    id: id,
                    name: T('History.artifactName.template', { adj: adj, noun: noun }),
                    description: T('History.artifactDescription'),
                    note: '<category: artifact>',
                    price: 2500000 + Math.floor(sRand() * 500000),
                    iconIndex: 245
                };
                if (isWeapon) {
                    obj.wtypeId = 1 + Math.floor(sRand() * 12);
                    obj.params = [0, 0, 150 + Math.floor(sRand()*100), 0, 150 + Math.floor(sRand()*100), 0, 0, 0];
                    obj.traits = [];
                } else if (isArmor) {
                    obj.atypeId = 1 + Math.floor(sRand() * 5);
                    obj.etypeId = 2 + Math.floor(sRand() * 3); // 2: shield, 3: head, 4: body
                    obj.params = [0, 0, 0, 150 + Math.floor(sRand()*100), 0, 150 + Math.floor(sRand()*100), 0, 0];
                    obj.traits = [];
                } else {
                    obj.itypeId = 1;
                    obj.consumable = false;
                    obj.effects = [];
                }
                return obj;
            }

            for (let i = 0; i < 13; i++) {
                generated.items.push(createArtifact(1501 + i, itemNouns, false, false));
                generated.weapons.push(createArtifact(1501 + i, weaponNouns, true, false));
                generated.armors.push(createArtifact(1501 + i, armorNouns, false, true));
            }

            generated.lang = currentLang();
            return generated;
        }

        generateArtifacts() {
            const generated = this.composeArtifacts();
            if (window.WorldManager) {
                window.WorldManager.setField("artifacts", "generated", generated);
            } else if (typeof $gameSystem !== 'undefined' && $gameSystem) {
                $gameSystem._generatedArtifacts = generated;
            }
            this.injectArtifacts(generated);
        }

        // A world stores its artifacts as written objects, so a world created
        // in one language kept its Italian (or English) names forever. The set
        // is a pure function of the seed, so it is simply recomposed in the
        // active language and written back.
        relocalizeArtifacts(generated) {
            const lang = currentLang();
            if (!generated || generated.lang === lang) return generated;
            const fresh = this.composeArtifacts();
            ['items', 'weapons', 'armors'].forEach(kind => {
                const stored = generated[kind] || [];
                const source = fresh[kind] || [];
                stored.forEach((art, i) => {
                    const src = source[i];
                    if (art && src) {
                        art.name = src.name;
                        art.description = src.description;
                    }
                });
            });
            generated.lang = lang;
            if (window.WorldManager && window.WorldManager.activeWorldName) {
                window.WorldManager.setField("artifacts", "generated", generated);
            } else if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._generatedArtifacts === generated) {
                $gameSystem._generatedArtifacts = generated;
            }
            return generated;
        }

        injectArtifacts(generated) {
            if (!generated) return;
            this.relocalizeArtifacts(generated);
            if (typeof $dataItems !== 'undefined' && generated.items) {
                generated.items.forEach(a => $dataItems[a.id] = a);
            }
            if (typeof $dataWeapons !== 'undefined' && generated.weapons) {
                generated.weapons.forEach(a => $dataWeapons[a.id] = a);
            }
            if (typeof $dataArmors !== 'undefined' && generated.armors) {
                generated.armors.forEach(a => $dataArmors[a.id] = a);
            }
        }

        runSimulation(years = null) {
            this.reset();
            // Seed the deterministic stream for the whole run from the world
            // seed, so a given seed always regenerates the same history.
            this._seed = normalizeHistorySeed(this.getSeed());
            this._rng = makeRng(this._seed);
            let startYear = START_YEAR;
            let endYear = END_YEAR;
            if (years !== null && years < 100) {
                startYear = endYear - years;
            } else if (years !== null) {
                endYear = startYear + years;
            }
            this._startYear = startYear;

            this.generateArtifacts();
            this.initNationRecords(startYear);

            const artifactEvents = [];
            const generated = window.WorldManager
                ? window.WorldManager.getField("artifacts", "generated")
                : ((typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._generatedArtifacts) ? $gameSystem._generatedArtifacts : null);
            if (generated) {
                const totalMonths = (endYear - startYear + 1) * 12;
                const allArtifacts = [
                    ...(generated.items   || []).map(item => ({ kind: 'item',   item })),
                    ...(generated.weapons || []).map(item => ({ kind: 'weapon', item })),
                    ...(generated.armors  || []).map(item => ({ kind: 'armor',  item }))
                ];
                allArtifacts.forEach(({ kind, item }) => {
                    const monthOffset = Math.floor(this._rand() * totalMonths);
                    const eYear = startYear + Math.floor(monthOffset / 12);
                    const eMonth = monthOffset % 12;
                    const dateStr = `${eYear}-${String(eMonth + 1).padStart(2, '0')}`;
                    artifactEvents.push({ dateKey: dateStr, item, kind });
                });
            }

            let date = new Date(startYear, 0, 1);
            const endDate = new Date(endYear, 0, 1);

            const emptyWorld = isEmptyWorld();

            // The century is written DAY BY DAY. A world's history used to move
            // in monthly steps, which meant every conquest, plague and rite in
            // it was dated the first of some month and nothing ever happened on
            // the same day as anything else. Now every day is rolled, and a day
            // can carry several entries: the rates below are per-day versions of
            // the old per-month ones (DAY_RATE), so the passes that were monthly
            // still land about as often as they did - they just land on a real
            // date. The exception is the random-event strand, which is what a
            // chronicle is mostly made of, and which is deliberately much denser
            // than it was.
            while (date <= endDate) {
                // An empty world's history simply stops: the run is cut on
                // 1 January 2000 and every day after it is left blank rather
                // than generated and hidden, so nothing downstream (the
                // Archive, the wiki, the news ticker) has to filter it out.
                if (emptyWorld && date > EMPTY_WORLD_CUTOFF) break;
                const year = date.getFullYear();
                const firstOfMonth = date.getDate() === 1;

                // Who is in office is a monthly question: a leader roster is
                // dated in years, and re-reading it every day would cost 30x
                // for an answer that cannot have changed.
                if (firstOfMonth) {
                    this.handleFoundings(date);
                    this.updateActiveLeaders(date);
                    this.handleLeaderMortality(date);
                    // A fixed event is keyed by its month (History.fixed.<yyyy-mm>),
                    // so it is still read once, on the first.
                    this.handleFixedEvents(date);

                    const dateKey = monthStr(date);
                    artifactEvents.filter(e => e.dateKey === dateKey).forEach(planned => {
                        const artEvent = this.generateSpecificArtifactEvent(date, planned.item, planned.kind);
                        if (artEvent) this._events.push(artEvent);
                    });
                }

                this.handleEpidemics(date);
                this.handleInternalPolitics(date, false);
                this.handleInternalPolitics(date, true);
                this.handleNationPolitics(date);
                this.handleArtifactTransfers(date);

                // Several things can happen on one day, and on a busy day they
                // do: one roll decides whether the day is eventful at all, and
                // the rest decide how eventful.
                let entries = this._rand() < DAILY_EVENT_CHANCE ? 1 : 0;
                if (entries) {
                    for (const chance of EXTRA_EVENT_CHANCES) {
                        if (this._rand() >= chance) break;
                        entries++;
                    }
                }
                for (let i = 0; i < entries; i++) {
                    const event = this.generateRandomEvent(date);
                    if (event) this._events.push(event);
                }

                // Advance one day
                date.setDate(date.getDate() + 1);
            }

            this.sealFinalOffices();
            this.saveToGameSystem();
            console.log(`[HistorySimulator] Simulation complete. ${this._events.length} events generated.`);
        }

        // However the century went, it ends here. Petrus II is on the throne of
        // Peter, Thatcher is in Downing Street, Clinton has the Free States and
        // Bush has the Seaboard - the world every savegame opens into is written
        // against those four, so the last pass of the simulation seats them and
        // marks them protected, which keeps them there for the live chronicle
        // that runs on afterwards.
        sealFinalOffices() {
            const seat = (table, into) => {
                for (const [power, name] of Object.entries(table)) {
                    if (!this._currentHyperpowers[power]) continue;
                    const pool = [].concat(
                        this._currentHyperpowers[power].holy_leaders || [],
                        this.leaderPoolFor(power));
                    const chosen = pool.find(l => l && l.name === name);
                    if (!chosen) continue;
                    chosen.protected = true;
                    this._deadLeaders.delete(chosen.name);
                    delete this._leaderDeaths[chosen.name];
                    into[power] = chosen;
                }
            };
            seat(FINAL_MORAL_GUIDES, this._currentMoralGuides);
            seat(FINAL_MORAL_GUIDES, this._currentHolyLeaders);   // the old dual-track reader
            seat(FINAL_POLITICAL_LEADERS, this._currentLeaders);
        }

        // The two offices, for anything that wants to print them.
        getMoralGuide(power) {
            const held = this._histField("moralGuides", this._currentMoralGuides) || {};
            return held[power] || null;
        }

        getMoralGuides() {
            return this._histField("moralGuides", this._currentMoralGuides) || {};
        }

        getCurrentLeaders() {
            return this._histField("leaders", this._currentLeaders) || {};
        }

        // Who governs a power right now. The book of leaders answers first;
        // a power with nobody on file is governed by the head of government
        // NPCPolitics has elected for it, which is a real person in this world
        // even though no historian wrote them down. `procedural` says which of
        // the two answered, so a reader can label them.
        politicalLeaderOf(power) {
            const seated = this.getCurrentLeaders()[power];
            if (seated) return seated;
            const live = window.NPCPolitics && window.NPCPolitics.getPower
                ? window.NPCPolitics.getPower(power) : null;
            const head = live && live.politicians ? live.politicians[live.headId] : null;
            if (!head) return null;
            return {
                name: head.name,
                ideology: head.ideologyLabel || null,
                country: (this._currentHyperpowers[power] || {}).homeNation || null,
                office: head.office || null,
                procedural: true,
            };
        }

        // Stable, name-seeded government label for a nation under a controller.
        governmentFor(controller, country) {
            return governmentLabel(this.governmentIdFor(controller, country));
        }

        // The same choice, left as its id so an event can store it as a key
        // descriptor instead of freezing the label at simulation time.
        governmentIdFor(controller, country) {
            if (controller && controller !== 'Neutral') {  // i18n-ignore  controller id
                return HYPERPOWER_GOVS[controller] || 'Puppet Government';  // i18n-ignore  government id
            }
            let h = 0;
            const s = String(country);
            for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
            return NEUTRAL_GOVS[h % NEUTRAL_GOVS.length];
        }

        // A government id as a nested description param: it resolves to the
        // label when the sentence is written out, and to the raw id when the
        // data files carry no copy for it.
        _govParam(id) {
            const key = this._govKey(id);
            return key ? LK(key) : String(id || '');
        }

        // The i18n key a government id reads through, or null for an id the
        // data files carry no copy for.
        _govKey(id) {
            const key = 'History.government.' + String(id || '');
            return T.has(key) ? key : null;
        }

        initNationRecords(startYear) {
            this._nationHistory = {};
            // A nation that names a hyperpower as its `faction` is PART of it
            // from the first day, whether or not the table also names it as the
            // controller: the faction column is what the world starts sworn to.
            // The Gods are the exception, since they hold no ground at all.
            for (const [name, info] of Object.entries(this._currentCountries || {})) {
                if (info.controller && info.controller !== 'Neutral') continue;  // i18n-ignore  controller id
                const faction = info.faction;                                     // i18n-ignore  faction id
                if (!faction || faction === 'Neutral') continue;                  // i18n-ignore  faction id
                if (!this._currentHyperpowers[faction] || this.isSecludedPower(faction)) continue;
                info.controller = faction;
                void name;
            }
            // A power holds its own seat from the first day of the century,
            // whatever the country table happens to say about it.
            for (const [power, hp] of Object.entries(this._currentHyperpowers || {})) {
                if (hp && hp.founded) continue;   // not declared yet: see handleFoundings
                const seat = hp && hp.homeNation && (this._currentCountries || {})[hp.homeNation];
                if (seat) seat.controller = power;
            }
            for (const [name, info] of Object.entries(this._currentCountries || {})) {
                const controller = info.controller || 'Neutral';  // i18n-ignore  controller id
                const govId = this.governmentIdFor(controller, name);
                this._nationHistory[name] = [{
                    date: `${startYear}-01-01`,
                    controller,
                    government: governmentLabel(govId),
                    governmentId: govId,
                    governmentKey: this._govKey(govId),
                    reason: T('History.reason.dawn'),
                    reasonKey: 'History.reason.dawn',
                    reasonParams: null
                }];
            }
        }

        // `reason` is passed as a key descriptor so the ledger re-reads in the
        // language it is opened in; a plain string is still accepted.
        recordNationChange(name, dateStr, controller, reason) {
            const recs = this._nationHistory[name] || (this._nationHistory[name] = []);
            const govId = this.governmentIdFor(controller, name);
            recs.push({
                date: dateStr, controller,
                government: governmentLabel(govId),
                governmentId: govId,
                governmentKey: this._govKey(govId),
                reason: isLK(reason) ? renderLK(reason.$k, reason.$p) : reason,
                reasonKey: isLK(reason) ? reason.$k : null,
                reasonParams: isLK(reason) ? reason.$p : null
            });
        }

        // --- Where a power may act -------------------------------------------
        // A hyperpower that holds ground on one continent has no business on
        // another: Britannia never annexes a nation of North America, and the
        // Kukulkan Ascendancy never turns up in a Soviet story. A power whose
        // region is not one of the regions the nations themselves carry - the
        // global orders (Mages Guild, Archive Foundation, the Collective) and
        // the off-world visitors (The Tourists, The Dargos) - is unconfined,
        // which is exactly what being global means. All of it is read from
        // Hyperpowers.json "region" and Countries.json "region".

        // Every region the world's nations actually stand in.
        _earthRegions() {
            if (this._earthRegionSet) return this._earthRegionSet;
            const set = new Set();
            for (const info of Object.values(this._currentCountries || {})) {
                if (info && info.region) set.add(info.region);
            }
            this._earthRegionSet = set;
            return set;
        }

        regionOfPower(power) {
            const hp = (this._currentHyperpowers || {})[power];
            return (hp && hp.region) || null;
        }

        // The built-in fallback country table is Europe-only and carries no
        // region of its own, so that is what an entry without one is.
        regionOfNation(nation) {
            const info = (this._currentCountries || {})[nation];
            return (info && info.region) || 'Europe';   // i18n-ignore  region id
        }

        // True for a power that holds ground in exactly one earthly region.
        isConfinedPower(power) {
            const region = this.regionOfPower(power);
            return !!region && this._earthRegions().has(region);
        }

        powerReaches(power, region) {
            return !this.isConfinedPower(power) || this.regionOfPower(power) === region;
        }

        // A power that keeps to itself. The Gods hold no ground, take no
        // nation and share no event with anybody: whatever they are doing, they
        // are doing it to each other. The one traffic between heaven and the
        // world is an artifact - see mayTradeArtifacts.
        isSecludedPower(power) {
            return ((this._currentHyperpowers || {})[power] || {}).secluded === true;
        }

        // --- Powers that are not there yet -------------------------------------
        // Almost every hyperpower is on the board from the first day of the
        // century. One is not: the Northpoint Army declares itself on
        // 1 December 2001 (Hyperpowers.json "founded"), and until that month it
        // holds nothing, seats nobody and takes no part in anything.
        foundingOf(power) {
            const hp = (this._currentHyperpowers || {})[power];
            return (hp && hp.founded) || null;
        }

        powerExists(power, date) {
            const founded = this.foundingOf(power);
            if (!founded) return true;
            return monthStr(date) >= founded;
        }

        // The month a power declares itself: it takes its own seat, and if
        // somebody else was holding that seat, it takes it off them.
        handleFoundings(date) {
            const month = monthStr(date);
            const dateStr = dayStr(date);
            for (const [power, hp] of Object.entries(this._currentHyperpowers || {})) {
                if (!hp || hp.founded !== month || this._foundedPowers[power]) continue;
                const seat = hp.homeNation;
                const info = seat && (this._currentCountries || {})[seat];
                // A world that has already lived through the declaration (a
                // save reloaded inside the founding month) does not hold it a
                // second time.
                if (info && info.controller === power) { this._foundedPowers[power] = dateStr; continue; }
                this._foundedPowers[power] = dateStr;
                const held = info ? (info.controller || 'Neutral') : 'Neutral';  // i18n-ignore  controller id
                // Whoever speaks for the new power in the month it is founded:
                // its own book of leaders answers first (Leaders.json), which
                // for the Northpoint Army is the one name in it.
                const founder = (hp.leaders || []).find(l => l && l.years && l.years[0] <= date.getFullYear());
                const speaker = founder ? founder.name : power;
                const independence = held !== 'Neutral';  // i18n-ignore  controller id
                if (info) {
                    info.controller = power;
                    this.recordNationChange(seat, dateStr, power, independence
                        ? LK('History.reason.declaredIndependence', { power: held })
                        : LK('History.reason.declaredPower', { power }));
                }
                // A power that has its own declaration written down uses it;
                // anything founded later reads the general line.
                const branch = independence ? '.independence' : '.declared';
                const own = 'History.founding.byPower.' + power + branch;
                const key = (window.T && T.has && T.has(own)) ? own : 'History.founding' + branch;
                this._events.push({
                    date: dateStr, category: 'political', type: 'founding',
                    ...descOf(key, { leader: speaker, power, nation: seat, from: held }),
                    iconIndex: ICONS.political
                });
            }
        }

        // Whether two powers may appear in the same event at all.
        powersMayInteract(a, b) {
            if (this.isSecludedPower(a) || this.isSecludedPower(b)) return false;
            if (!this.isConfinedPower(a) || !this.isConfinedPower(b)) return true;
            return this.regionOfPower(a) === this.regionOfPower(b);
        }

        // ...and the exception. A god may hand a relic to a world leader, and a
        // world leader may help themselves to one out of heaven; that, and
        // nothing else, is how the two ever end up in the same sentence.
        mayTradeArtifacts(a, b) {
            if (this.isSecludedPower(a) || this.isSecludedPower(b)) return true;
            return this.powersMayInteract(a, b);
        }

        // The power a nation is the seat of, if any: its capital ground, which
        // world generation may never take off it and which never revolts.
        homeNationOwner(nation) {
            for (const [power, hp] of Object.entries(this._currentHyperpowers || {})) {
                if (hp && hp.homeNation === nation) return power;
            }
            return null;
        }

        // Monthly chance that one nation changes hands: a hyperpower annexes /
        // conquers it (its government becomes the conqueror's archetype), or a
        // controlled nation wins independence and restores its own government.
        // Every change is appended to the nation's permanent government history.
        handleNationPolitics(date) {
            const nations = Object.keys(this._currentCountries || {});
            const powers = Object.keys(this._currentHyperpowers || {});
            if (!nations.length || !powers.length) return;
            if (this._rand() > MONTHLY(0.035)) return;

            const nation = nations[Math.floor(this._rand() * nations.length)];
            // A power's own seat is not on the table: Ireland is the Mages
            // Guild's and stays theirs, in every century this rolls.
            if (this.homeNationOwner(nation)) return;
            const info = this._currentCountries[nation];
            const current = info.controller || 'Neutral';  // i18n-ignore  controller id
            const dateStr = dayStr(date);
            const prevRecs = this._nationHistory[nation];
            const prevRec = prevRecs && prevRecs.length ? prevRecs[prevRecs.length - 1] : null;
            // A record written before governments were keyed keeps its label.
            const prevGov = prevRec
                ? (prevRec.governmentId ? this._govParam(prevRec.governmentId) : prevRec.government)
                : this._govParam('old order');  // i18n-ignore  government id

            if (current !== 'Neutral' && this._rand() < 0.35) {  // i18n-ignore  controller id
                info.controller = 'Neutral';  // i18n-ignore  controller id
                const gov = this._govParam(this.governmentIdFor('Neutral', nation));  // i18n-ignore  controller id
                this.recordNationChange(nation, dateStr, 'Neutral',  // i18n-ignore  controller id
                    LK('History.reason.independence', { power: current }));
                this._events.push({
                    date: dateStr, category: 'conquest', type: 'independence',
                    ...descOf('History.conquest.independence',
                        { nation: nation, power: current, prevGov: prevGov, gov: gov }),
                    iconIndex: ICONS.peace
                });
                return;
            }

            // Only powers whose reach covers this nation's own region, and only
            // powers that take nations at all (the Gods do not).
            const region = this.regionOfNation(nation);
            const candidates = powers.filter(p => p !== current
                && !this.isSecludedPower(p) && this.powerExists(p, date)
                && this.powerReaches(p, region));
            if (!candidates.length) return;
            let total = 0;
            const weights = candidates.map(p => {
                const w = Math.max(1, this._currentHyperpowers[p].military || 50);
                total += w;
                return w;
            });
            let r = this._rand() * total;
            let conqueror = candidates[0];
            for (let i = 0; i < candidates.length; i++) {
                if ((r -= weights[i]) <= 0) { conqueror = candidates[i]; break; }
            }

            info.controller = conqueror;
            const newGov = this._govParam(this.governmentIdFor(conqueror, nation));
            const neutral = current === 'Neutral';  // i18n-ignore  controller id
            const reason = neutral
                ? LK('History.reason.annexation')
                : LK('History.reason.conquest', { power: current });
            this.recordNationChange(nation, dateStr, conqueror, reason);
            this._events.push({
                date: dateStr, category: 'conquest', type: 'conquest',
                ...(neutral
                    ? descOf('History.conquest.annex',
                        { conqueror: conqueror, nation: nation, prevGov: prevGov, gov: newGov })
                    : descOf('History.conquest.wrest',
                        { conqueror: conqueror, nation: nation, power: current,
                          prevGov: prevGov, gov: newGov })),
                iconIndex: ICONS.conquest
            });
            this._currentHyperpowers[conqueror].military = (this._currentHyperpowers[conqueror].military || 100) + 5;
        }

        // --- Epidemics --------------------------------------------------------
        // The century gets its own plagues and panics, drawn from the same
        // disease library the live epidemic engine uses (Diseases.json). Each
        // one names the towns it burned through, so an NPC from one of those
        // towns can carry it in their medical record before the player ever
        // meets them (Health_DiseaseSystem._applyHistoricalEpidemics).
        _epidemicDiseases() {
            if (this._epidemicPool) return this._epidemicPool;
            let diseases = [];
            if (window.DiseaseSystem && window.DiseaseSystem.all) {
                diseases = window.DiseaseSystem.all() || [];
            }
            if (!diseases.length) {
                const data = (window.Health && window.Health.Diseases) || loadJsonFile('js/db/Health/Diseases.json');
                diseases = (data && data.diseases) || [];
            }
            this._epidemicPool = diseases.filter(d => d && d.epidemic);
            return this._epidemicPool;
        }

        // Towns people actually live in. The live engine already knows which
        // named map tiles are landmarks rather than populations, so borrow its
        // list; the raw destination keys are the fallback.
        _epidemicTowns() {
            if (this._epidemicTownList) return this._epidemicTownList;
            const ES = window.EpidemicSystem;
            if (ES && ES.places) {
                const places = ES.places().filter(p => p.isDestination).map(p => p.key);
                if (places.length) { this._epidemicTownList = places; return places; }
            }
            const dest = (window.WorkSystem && window.WorkSystem.Destinations)
                || loadJsonFile('js/db/WorkSystem/Destinations.json') || {};
            // Same exclusions the engine applies, and from the same data: an
            // entry says what it is through its "type", and only a "city" or a
            // "village" holds a population. A shrine, a gauntlet, a borehole or
            // a filling station is a place on the map, not a place with people
            // in it. A tavern is a "village" by type, so it is named outright.
            const populated = { city: true, village: true };   // i18n-ignore: Destinations.json ids
            const notTowns = /^maxtavern$/i;
            this._epidemicTownList = Object.keys(dest).filter(k =>
                populated[(dest[k] && dest[k].type) || 'village'] && !notTowns.test(k));
            return this._epidemicTownList;
        }

        handleEpidemics(date) {
            // Roughly one remembered epidemic every four years, asked daily.
            if (this._rand() > MONTHLY(0.021)) return;
            const pool = this._epidemicDiseases();
            const towns = this._epidemicTowns();
            if (!pool.length || !towns.length) return;

            // A century remembers its panics as clearly as its plagues, so the
            // kind is chosen first and the strain only within it (otherwise the
            // far larger medical library would crowd hysteria out entirely).
            const wantHysteria = this._rand() < 0.42;
            let kindPool = pool.filter(d => ((d.kind || 'medical') === 'hysteria') === wantHysteria);
            if (!kindPool.length) kindPool = pool;

            // Rare strains stay rare across a whole century, too.
            const weights = { common: 6, uncommon: 3, rare: 1 };
            let total = 0;
            const w = kindPool.map(d => { const v = weights[d.rarity] || 3; total += v; return v; });
            let r = this._rand() * total;
            let disease = kindPool[kindPool.length - 1];
            for (let i = 0; i < kindPool.length; i++) {
                if ((r -= w[i]) <= 0) { disease = kindPool[i]; break; }
            }

            const hysteria = (disease.kind || 'medical') === 'hysteria';
            // Towns are recorded by their Destinations.json key (that is what
            // the epidemic ledger matches on); the chronicle names them the way
            // that entry reads.
            const townName = key => (window.WorkSystem && window.WorkSystem.destinationName)
                ? window.WorkSystem.destinationName(key) : key;
            const origin = towns[Math.floor(this._rand() * towns.length)];
            const reach = 1 + Math.floor(this._rand() * (hysteria ? 5 : 7));
            const places = [origin];
            for (let i = 1; i < reach; i++) {
                const town = towns[Math.floor(this._rand() * towns.length)];
                if (!places.includes(town)) places.push(town);
            }

            const months = 1 + Math.floor(this._rand() * (hysteria ? 8 : 14));
            const end = new Date(date.getFullYear(), date.getMonth() + months, 1);
            const infected = Math.round((900 + this._rand() * 26000) * places.length *
                (disease.r0 > 4 ? 1.8 : 1));
            const deaths = Math.round(infected * (disease.cfr || 0) * (0.35 + this._rand() * 0.5));
            const dateStr = dayStr(date);
            const endStr = dayStr(end);
            const nameKey = hysteria ? 'History.epidemic.hysteriaName' : 'History.epidemic.medicalName';
            const nameParams = { disease: disease.name, origin: townName(origin), year: date.getFullYear() };

            this._epidemics.push({
                id: `HEP-${this._epidemics.length + 1}`,
                name: T(nameKey, nameParams), nameKey, nameParams,
                diseaseId: disease.id, diseaseName: disease.name,
                kind: hysteria ? 'hysteria' : 'medical',
                origin, places, startDate: dateStr, endDate: endStr,
                months, infected, deaths, historical: true,
            });

            const spread = places.length > 1
                ? LK('History.epidemic.spread', { places: places.slice(1).map(townName).join(', ') })
                : '';
            // Thousands separators written explicitly: toLocaleString would
            // follow the host locale and print "162.610" on half the machines.
            const num = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            this._events.push({
                date: dateStr,
                category: 'epidemic',
                type: hysteria ? 'mass hysteria' : 'epidemic',  // i18n-ignore  event type ids
                ...descOf(hysteria ? 'History.epidemic.hysteria' : 'History.epidemic.medical',
                    { disease: disease.name, origin: townName(origin), infected: num(infected),
                      deaths: num(deaths), months: months, spread: spread }),
                iconIndex: hysteria ? ICONS.paranormal : ICONS.epidemic
            });
        }

        // Already-discovered artifacts occasionally change hands; every holder
        // is appended to the artifact's permanent provenance record.
        handleArtifactTransfers(date) {
            for (const rec of Object.values(this._artifactRecords)) {
                if (this._rand() > MONTHLY(0.002)) continue;
                // An artifact in the party's own hands is out of the world's
                // reach: nobody steals, buys or exhumes a thing off the people
                // who are carrying it.
                if (this.artifactHeldByParty && this.artifactHeldByParty(rec)) continue;
                const isFaction = this._rand() < 0.5;
                const pool = isFaction ? this._currentFactionLeaders : this._currentLeaders;
                const actors = Object.keys(pool).filter(a => pool[a]);
                if (!actors.length) continue;
                const actor = actors[Math.floor(this._rand() * actors.length)];
                const holderName = pool[actor] ? pool[actor].name : actor;
                const last = rec.holders[rec.holders.length - 1];
                if (last && last.holder === holderName) continue;
                // A relic is the only thing that crosses between heaven and the
                // world, and it crosses in only two ways: the Gods give it to a
                // world leader, or a world leader takes it off them.
                const from = last ? last.power : rec.originPower;
                const divine = !isFaction && (this.isSecludedPower(actor) || this.isSecludedPower(from));
                let action;
                if (divine) {
                    action = this.isSecludedPower(from) ? (this._rand() < 0.5 ? 'was gifted' : 'stole') : 'stole';
                } else if (!isFaction && from && from !== actor && !this.mayTradeArtifacts(actor, from)) {
                    // Two powers with no business in each other's affairs do not
                    // trade relics either; this one simply turns up elsewhere.
                    continue;
                } else {
                    action = ARTIFACT_TRANSFER_ACTIONS[Math.floor(this._rand() * ARTIFACT_TRANSFER_ACTIONS.length)];
                }
                const dateStr = dayStr(date);
                const howKey = 'History.artifact.action.' + action;
                rec.holders.push({ holder: holderName, power: actor, since: dateStr,
                    how: T(howKey), howKey, howParams: null });
                this._events.push({
                    date: dateStr, category: 'paranormal', type: 'artifact',
                    ...descOf('History.artifact.transfer', {
                        holder: holderName,
                        action: LK('History.artifact.action.' + action),
                        artifact: AR(rec.kind, rec.id, rec.name),
                        from: last ? LK('History.artifact.from', { holder: last.holder }) : ''
                    }),
                    iconIndex: 245
                });
            }
        }

        // `cause` is a key descriptor so a leader's obituary re-reads in the
        // language the world is opened in; a plain string is still accepted.
        _markLeaderDead(name, date, cause) {
            this._leaderDeaths[name] = {
                date: dayStr(date),
                cause: isLK(cause) ? renderLK(cause.$k, cause.$p) : (cause || null),
                causeKey: isLK(cause) ? cause.$k : null,
                causeParams: isLK(cause) ? cause.$p : null
            };
        }

        // --- Age, illness and the end of a life --------------------------------
        // Everyone the century can bury: whoever is holding one of the offices
        // right now, political or moral, in a power or in a faction. The book
        // is full of names nobody ever seated, and a world that quietly killed
        // them off-stage would be reporting deaths for people the reader has
        // never met.
        seatedLeaders() {
            const out = [];
            const add = (leader, actor) => {
                if (!leader || !leader.name) return;
                if (out.some(e => e.leader.name === leader.name)) return;
                out.push({ leader, actor });
            };
            for (const [power, leader] of Object.entries(this._currentLeaders || {})) add(leader, power);
            for (const [power, leader] of Object.entries(this._currentFactionLeaders || {})) add(leader, power);
            for (const [power, leader] of Object.entries(this._currentHolyLeaders || {})) add(leader, power);
            for (const [power, leader] of Object.entries(this._currentMoralGuides || {})) add(leader, power);
            return out;
        }

        // How old they are on this date, or null when the book never said when
        // they were born - a leader with no birthday cannot die of age.
        leaderAge(leader, date) {
            if (!leader) return null;
            let born = null;
            if (leader.birthDate) {
                const parsed = new Date(leader.birthDate);
                if (!isNaN(parsed)) born = parsed;
            }
            if (!born && Number.isFinite(leader.birthYear)) born = new Date(leader.birthYear, 0, 1);
            if (!born) return null;
            const age = (date - born) / (365.2425 * 24 * 3600 * 1000);
            return age > 0 && age < 130 ? age : null;
        }

        // The Gompertz odds of dying of nothing in particular in a given year.
        oldAgeYearlyChance(age) {
            if (!Number.isFinite(age) || age < MORTALITY_BASE_AGE) return 0;
            const chance = MORTALITY_AT_BASE *
                Math.pow(2, (age - MORTALITY_BASE_AGE) / MORTALITY_DOUBLING);
            return Math.min(chance, MORTALITY_CAP);
        }

        // Nothing buries a figure the world is written around.
        leaderIsSpared(leader) {
            return !leader || leader.protected === true || leader.immortal === true ||
                this._deadLeaders.has(leader.name);
        }

        // The mortal disease a leader is told they have, drawn from the same
        // table the epidemics run on and filtered to what medicine could name
        // in the year they are told it.
        pickMortalDisease(year) {
            const pool = mortalDiseases().filter(d => !(ILLNESS_EARLIEST[d.id] > year));
            if (!pool.length) return null;
            return pool[Math.floor(this._rand() * pool.length)];
        }

        // The illness a stored record names, as a marker the reader resolves.
        diseaseLabel(disease) {
            return disease ? DZ(disease.id, disease.name) : '';
        }

        // One monthly pass: the diagnoses that are due, then the new ones, then
        // whoever simply reached the end of a long life.
        handleLeaderMortality(date) {
            const year = date.getFullYear();
            if (!this._leaderIllness) this._leaderIllness = {};
            for (const entry of this.seatedLeaders()) {
                const leader = entry.leader;
                const actor = entry.actor;
                if (this.leaderIsSpared(leader)) continue;
                const name = leader.name;
                const illness = this._leaderIllness[name];

                // Already dying: the day comes when it comes.
                if (illness) {
                    if (dayStr(date) < illness.until) continue;
                    this._deadLeaders.add(name);
                    this._markLeaderDead(name, date,
                        LK('History.leaderDeath.illness',
                            { disease: DZ(illness.diseaseId, illness.diseaseName) }));
                    delete this._leaderIllness[name];
                    this._events.push({
                        date: dayStr(date), category: 'political', type: 'death',
                        ...descOf('History.internal.diedOfIllness',
                            { leader: name, place: actor,
                              disease: DZ(illness.diseaseId, illness.diseaseName) }),
                        iconIndex: ICONS['epidemic'] || 0
                    });
                    continue;
                }

                const age = this.leaderAge(leader, date);

                // A new diagnosis. The odds climb with age on the same curve
                // old age itself does, so a young leader falling terminally ill
                // is the rare tragedy it ought to be.
                if (age === null || age >= ILLNESS_MIN_AGE) {
                    const scale = age === null ? 1
                        : Math.max(0.25, Math.pow(2, (age - MORTALITY_BASE_AGE) / MORTALITY_DOUBLING));
                    if (this._rand() < MONTHLY(Math.min(ILLNESS_YEARLY_CHANCE * scale, 0.2))) {
                        const disease = this.pickMortalDisease(year);
                        if (disease) {
                            const months = ILLNESS_MIN_MONTHS +
                                Math.floor(this._rand() * (ILLNESS_MAX_MONTHS - ILLNESS_MIN_MONTHS + 1));
                            const due = new Date(date.getTime());
                            due.setMonth(due.getMonth() + months);
                            const diseaseName = this.diseaseLabel(disease);
                            this._leaderIllness[name] = {
                                diseaseId: disease.id, diseaseName: disease.name,
                                since: dayStr(date), until: dayStr(due)
                            };
                            this._events.push({
                                date: dayStr(date), category: 'political', type: 'diagnosis',
                                ...descOf('History.internal.diagnosed',
                                    { leader: name, place: actor, disease: diseaseName }),
                                iconIndex: ICONS['epidemic'] || 0
                            });
                            continue;
                        }
                    }
                }

                // Old age, for whoever the book gave a birthday to.
                const yearly = this.oldAgeYearlyChance(age);
                if (yearly > 0 && this._rand() < MONTHLY(yearly)) {
                    this._deadLeaders.add(name);
                    this._markLeaderDead(name, date,
                        LK('History.leaderDeath.oldAge', { age: Math.floor(age) }));
                    this._events.push({
                        date: dayStr(date), category: 'political', type: 'death',
                        ...descOf('History.internal.diedOfOldAge',
                            { leader: name, place: actor, age: Math.floor(age) }),
                        iconIndex: ICONS['royal'] || 0
                    });
                }
            }
        }

        // Who is dying right now and of what, for anything that prints a leader.
        getLeaderIllnesses() {
            return this._histField("leaderIllness", this._leaderIllness) || {};
        }

        getLeaderIllness(name) {
            return this.getLeaderIllnesses()[name] || null;
        }

        // Whoever a power can put in office right now: its own roster, plus the
        // roster of every nation it currently holds. A conquered nation hands
        // its political class to its conqueror - take Persia and its ministers
        // are yours to seat; lose it and they go back to being Persia's problem.
        // A leader's nation is `country` in Leaders.json.
        leaderPoolFor(power) {
            const own = this._currentHyperpowers[power]?.leaders || [];
            const index = LEADERS_BY_COUNTRY;
            if (!index) return own;
            const pool = own.slice();
            const seen = new Set(own.map(l => l && l.name));
            for (const [nation, info] of Object.entries(this._currentCountries || {})) {
                if ((info.controller || 'Neutral') !== power) continue;   // i18n-ignore  controller id
                for (const leader of index[nation] || []) {
                    if (leader && !seen.has(leader.name)) { seen.add(leader.name); pool.push(leader); }
                }
            }
            return pool;
        }

        // --- The two offices ---------------------------------------------------
        // Every hyperpower has a POLITICAL leader and a MORAL guide, and they
        // are never the same person.
        //
        // The moral guide is ONE person, named in Leaders.json (`moralGuide:
        // true`) and never anybody else: a power answers to a face that is
        // written down, not to whoever an election threw up. It is chosen once,
        // from the power's own book - its holy track first, its own roster
        // second - and it holds the office for the whole century. Nothing
        // deposes it and no succession replaces it: a power whose guide dies is
        // still a power that answers to them.
        //
        // The political leader is the opposite: it may be a name out of the
        // book (whoever's years cover the date) or, for a power with nobody on
        // file, the head of government NPCPolitics has actually elected. A
        // power with an empty roster is governed, it is just governed by
        // somebody the world made up rather than somebody history did.
        //
        // A power with nobody eligible simply has no moral guide, which is its
        // own kind of answer.

        // Everyone this power may raise to its moral office: its own roster and
        // its second track, never a leader borrowed from a conquered nation -
        // a crown is not something you inherit by invasion.
        moralPoolFor(power) {
            const hp = this._currentHyperpowers[power] || {};
            return [].concat(hp.holy_leaders || [], hp.leaders || []).filter(l => l && l.moralGuide);
        }

        // The one guide, seated the first time anybody asks and kept for good.
        // The choice is drawn from the simulation's own seeded stream, so a
        // world with a given seed always answers to the same person.
        ensureMoralGuide(power) {
            if (Object.prototype.hasOwnProperty.call(this._currentMoralGuides, power)) {
                return this._currentMoralGuides[power];
            }
            const pool = this.moralPoolFor(power);
            // The holy track outranks the ordinary roster: a power that keeps
            // one is telling you where its authority comes from. Within the
            // field it is the earliest of them - the figure the power was
            // built around, not whoever a die happened to land on. Britannia
            // answers to the crown it started the century under, the Guild to
            // the magus who founded it.
            const hp = this._currentHyperpowers[power] || {};
            const holy = (hp.holy_leaders || []).filter(l => l && l.moralGuide);
            const field = holy.length ? holy : pool;
            const chosen = field.slice().sort((a, b) =>
                (a.years[0] - b.years[0]) || String(a.name).localeCompare(String(b.name)))[0] || null;
            if (chosen) {
                // The office outlives the person: whoever holds it is never
                // buried by the century that runs around them.
                chosen.protected = true;
                this._deadLeaders.delete(chosen.name);
                delete this._leaderDeaths[chosen.name];
            }
            this._currentMoralGuides[power] = chosen;
            return chosen;
        }

        updateActiveLeaders(date) {
            const year = date.getFullYear();
            const month = date.getMonth();
            for (let power in this._currentHyperpowers) {
                const hp = this._currentHyperpowers[power];
                // A power that has not declared itself yet seats nobody: the
                // Northpoint Army has no offices until December 2001.
                if (!this.powerExists(power, date)) continue;
                // Political leaders. A moral guide never governs: the crown does
                // not stand for election, and the Shah is not his own minister.
                const available = this.leaderPoolFor(power).filter(l => {
                    if (l.moralGuide) return false;
                    if (power === 'Goblin Horde' && (year < 1970 || (year === 1970 && month < 4))) {  // i18n-ignore  hyperpower id
                        return false;
                    }
                    return year >= l.years[0] && year <= l.years[1] && !this._deadLeaders.has(l.name);
                });
                if (!this._currentLeaders[power] || !available.includes(this._currentLeaders[power])) {
                    this._currentLeaders[power] = available[0] || null;
                }
                this.ensureMoralGuide(power);
                // Holy leaders (dual-track system, e.g. Holy Vatican Empire)
                if (hp.holy_leaders) {
                    const holyAvail = hp.holy_leaders.filter(l =>
                        year >= l.years[0] && year <= l.years[1] && !this._deadLeaders.has(l.name)
                    );
                    if (!this._currentHolyLeaders[power] || !holyAvail.includes(this._currentHolyLeaders[power])) {
                        if (year < 1978) {
                            // Before 1978: randomize papacy duration, pick randomly from available
                            // and add inertia so leaders can serve variable lengths
                            if (!this._currentHolyLeaders[power]) {
                                this._currentHolyLeaders[power] = holyAvail.length > 0 ? holyAvail[Math.floor(this._rand() * holyAvail.length)] : null;
                            } else if (holyAvail.length > 0 && this._rand() < 0.1) {
                                // 10% chance per year of a transition (simulating variable-length papacies)
                                const withoutCurrent = holyAvail.filter(l => l.name !== this._currentHolyLeaders[power].name);
                                if (withoutCurrent.length > 0 && this._rand() < 0.5) {
                                    this._currentHolyLeaders[power] = withoutCurrent[Math.floor(this._rand() * withoutCurrent.length)];
                                }
                            }
                        } else {
                            this._currentHolyLeaders[power] = holyAvail[0] || null;
                        }
                    }
                }
            }
            for (let faction in this._currentFactions) {
                const entry = this._currentFactions[faction];
                // Its power's pool, which is every nation that power holds.
                if (entry.parentPower && this._currentHyperpowers[entry.parentPower]) {
                    entry.leaders = this.leaderPoolFor(entry.parentPower);
                }
                const available = (entry.leaders || []).filter(l =>
                    year >= l.years[0] && year <= l.years[1] && !this._deadLeaders.has(l.name)
                );
                if (!this._currentFactionLeaders[faction] || !available.includes(this._currentFactionLeaders[faction])) {
                    this._currentFactionLeaders[faction] = available[0] || null;
                }
            }
        }

        handleFixedEvents(date) {
            const dateStr = monthStr(date);
            const fixed = this.getFixedEvent(dateStr);
            if (fixed) {
                this._events.push({
                    date: dateStr,
                    category: fixed.type,
                    type: 'fixed',
                    // The copy the player reads is keyed by the date itself, so
                    // the record needs nothing beyond it.
                    ...descOf('History.fixed.' + dateStr, null),
                    iconIndex: ICONS[fixed.type] || 0
                });
                if (fixed.callback) {
                    // Fixed-event callbacks hardcode canonical power/faction names
                    // (e.g. 'Soviet Union'). Alternate datasets (FactionDataManager)
                    // may not contain those keys, so a missing entry must skip the
                    // flavor stat-tweak rather than abort the whole simulation.
                    try {
                        fixed.callback(this);
                    } catch (e) {
                        console.warn(`[HistorySimulator] Fixed event ${dateStr} callback skipped:`, e.message);
                    }
                }
            }
        }

        getFixedEvent(dateStr) {
            // i18n-ignore-start  hyperpower, faction and leader ids. A fixed
            // event carries no copy of its own: the line the player reads is
            // History.fixed.<yyyy-mm>, keyed by the date handleFixedEvents
            // looked it up with.
            const events = {
                '1900-04': {
                    type: 'occult'
                },
                // 31 December 2000: the President of the European Central Bank
                // steps out of his own body and into the pantheon. The Gods
                // seat him the same night (Leaders.json, mario_draghi).
                '2000-12': {
                    type: 'paranormal',
                    callback: (mgr) => {
                        const gods = mgr._currentHyperpowers['The Gods'];      // i18n-ignore  hyperpower id
                        if (gods) gods.arcane = (gods.arcane || 100) + 25;
                    }
                },
                '1918-03': {
                    type: 'paranormal'
                },
                '1914-07': {
                    type: 'military',
                    callback: (mgr) => { for (let h in mgr._currentHyperpowers) mgr._currentHyperpowers[h].military += 30; }
                },
                '1917-10': {
                    type: 'political',
                    callback: (mgr) => {
                        mgr._currentHyperpowers['Soviet Union'].military += 50;
                        mgr._currentFactions['Archive Foundation'].information += 40;
                    }
                },
                '1918-11': {
                    type: 'peace',
                    callback: (mgr) => { mgr._currentHyperpowers['Ottoman Empire'].economy -= 20; }
                },
                '1939-09': {
                    type: 'military',
                    callback: (mgr) => { mgr._currentHyperpowers['Britannia'].military += 100; }
                },
                '1945-05': {
                    type: 'peace',
                    callback: (mgr) => {
                        mgr._currentHyperpowers['Soviet Union'].economy += 50;
                        mgr._currentHyperpowers['Britannia'].economy += 50;
                    }
                },
                '1961-09': {
                    type: 'paranormal'
                },
                '1970-05': {
                    type: 'paranormal',
                    callback: (mgr) => { mgr._currentHyperpowers['Goblin Horde'].military += 200; }
                },
                '1978-10': {
                    type: 'political',
                    callback: (mgr) => {
                        const hps = mgr._currentHyperpowers;
                        const hve = hps['Holy Vatican Empire'];
                        if (hve && hve.holy_leaders) {
                            const jp2 = hve.holy_leaders.find(l => l.name === 'Pope John Paul II');
                            if (jp2) {
                                mgr._currentHolyLeaders['Holy Vatican Empire'] = jp2;
                            }
                        }
                    }
                },
                '1981-05': {
                    type: 'political',
                    callback: (mgr) => {
                        const hps = mgr._currentHyperpowers;
                        const hve = hps['Holy Vatican Empire'];
                        if (hve && hve.holy_leaders) {
                            const petrus = hve.holy_leaders.find(l => l.name === 'Pope Petrus II');
                            if (petrus) {
                                mgr._currentHolyLeaders['Holy Vatican Empire'] = petrus;
                            }
                        }
                    }
                },
                '1978-12': {
                    type: 'paranormal'
                },
                '1992-01': {
                    type: 'paranormal',
                    callback: (mgr) => { for (let f in mgr._currentFactions) mgr._currentFactions[f].arcane += 10; }
                },
                '1996-01': {
                    type: 'paranormal'
                },
                '1999-07': {
                    type: 'paranormal',
                    callback: (mgr) => { const t = mgr._currentHyperpowers['The Tourists']; if (t) t.information += 30; }
                },
                '1999-12': {
                    type: 'disaster',
                    callback: (mgr) => {
                        for (let h in mgr._currentHyperpowers) mgr._currentHyperpowers[h].population *= 0.97;
                        const af = mgr._currentFactions['Archive Foundation'];
                        if (af) af.arcane += 20;
                    }
                },
                '2001-09': {
                    type: 'military',
                    callback: (mgr) => {
                        mgr._currentHyperpowers['Britannia'].information += 80;
                        for (let f in mgr._currentFactions) mgr._currentFactions[f].information *= 0.7;
                    }
                },
                '2001-12': {
                    type: 'occult',
                    callback: (mgr) => {
                        const hve = mgr._currentHyperpowers['Holy Vatican Empire'];
                        if (hve) hve.arcane = Math.max(0, hve.arcane - 30);
                        for (let f in mgr._currentFactions) mgr._currentFactions[f].arcane += 15;
                    }
                }
            };
            // i18n-ignore-end
            return events[dateStr];
        }

        handleInternalPolitics(date, isFaction) {
            const year = date.getFullYear();
            const actors = isFaction ? this._currentFactions : this._currentHyperpowers;
            const currentActors = isFaction ? this._currentFactionLeaders : this._currentLeaders;
            const actorNames = Object.keys(actors);

            actorNames.forEach(actor => {
                if (this._rand() > MONTHLY(0.02)) return; // Rare check

                const available = (isFaction ? this._currentFactions[actor] : this._currentHyperpowers[actor]).leaders.filter(l =>
                    !l.moralGuide &&
                    year >= l.years[0] && year <= l.years[1] && !this._deadLeaders.has(l.name)
                );

                if (available.length > 1) {
                    const active = currentActors[actor];
                    if (!active) return;
                    const rivals = available.filter(l => l.name !== active.name);
                    const rival = rivals[Math.floor(this._rand() * rivals.length)];
                    if (!rival) return;

                    const struggleType = ['election', 'coup', 'assassination', 'alliance'][Math.floor(this._rand() * 4)];
                    let outcome = null;

                    switch (struggleType) {
                        case 'election':
                            if (this._rand() > 0.5) {
                                currentActors[actor] = rival;
                                outcome = LK('History.internal.electionWin',
                                    { winner: rival.name, place: actor, loser: active.name });
                            } else {
                                outcome = LK('History.internal.electionHold',
                                    { leader: active.name, place: actor });
                            }
                            break;
                        case 'coup':
                            if (this._rand() > 0.4) {
                                currentActors[actor] = rival;
                                outcome = LK('History.internal.coupWin',
                                    { winner: rival.name, place: actor, loser: active.name });
                            } else {
                                outcome = LK('History.internal.coupFail',
                                    { rival: rival.name, place: actor });
                            }
                            break;
                        case 'assassination':
                            if (this._rand() > 0.7) {
                                if (active.protected) {
                                    outcome = LK('History.internal.plotFailedOddly',
                                        { leader: active.name, place: actor });
                                } else {
                                    this._deadLeaders.add(active.name);
                                    this._markLeaderDead(active.name, date,
                                        LK('History.leaderDeath.assassinated', { place: actor }));
                                    currentActors[actor] = rival;
                                    outcome = LK('History.internal.assassinated',
                                        { leader: active.name, rival: rival.name, place: actor });
                                }
                            } else {
                                if (rival.protected) {
                                    outcome = LK('History.internal.plotFailedEscape',
                                        { leader: active.name, place: actor, rival: rival.name });
                                } else {
                                    this._deadLeaders.add(rival.name);
                                    this._markLeaderDead(rival.name, date,
                                        LK('History.leaderDeath.executed', { place: actor }));
                                    outcome = LK('History.internal.plotFailedExecuted',
                                        { leader: active.name, rival: rival.name });
                                }
                            }
                            break;
                        case 'alliance':
                            outcome = LK('History.internal.alliance',
                                { leader: active.name, rival: rival.name, place: actor });
                            break;
                    }

                    if (outcome) {
                        this._events.push({
                            date: dayStr(date),
                            category: 'internal',
                            type: struggleType,
                            ...descOf(outcome.$k, outcome.$p),
                            iconIndex: ICONS['internal'] || 0
                        });
                    }
                }
            });
        }

        // Weighted category draw (see CATEGORY_WEIGHTS); falls back to a flat
        // draw if a category ever loses its weight entry.
        pickCategory() {
            const names = Object.keys(EVENT_TYPES);
            let total = 0;
            const weights = names.map(n => {
                const w = CATEGORY_WEIGHTS[n] || 1;
                total += w;
                return w;
            });
            let r = this._rand() * total;
            for (let i = 0; i < names.length; i++) {
                if ((r -= weights[i]) <= 0) return names[i];
            }
            return names[names.length - 1];
        }

        generateRandomEvent(date) {
            const year = date.getFullYear();
            const category = this.pickCategory();
            const type = EVENT_TYPES[category][Math.floor(this._rand() * EVENT_TYPES[category].length)];

            // Anything arcane is a faction affair; the mundane strands are
            // mostly state business.
            const isFaction = category === 'paranormal' || category === 'occult' || this._rand() < 0.3;
            const actorPool = isFaction ? Object.keys(this._currentFactions) : Object.keys(this._currentHyperpowers);
            const actor = actorPool[Math.floor(this._rand() * actorPool.length)];
            const leader = isFaction ? this._currentFactionLeaders[actor] : this._currentLeaders[actor];

            if (!leader) return null;

            const desc = this.getEventDescriptor(category, type, actor, leader, year);
            const results = this.applyEffects(actor, isFaction, type);

            return {
                date: dayStr(date),
                category: category,
                type: type,
                ...descOf(desc.$k, desc.$p),
                results: results,
                iconIndex: ICONS[category] || 0
            };
        }

        // Which line the event is told with, and the params to tell it with,
        // left unresolved so the record can be re-read in any language. The
        // copy lives in js/i18n/<lang>/plugins/History.json under `event.basic`
        // and `event.weird`, keyed by the same category and type ids the event
        // record stores. The draws made here are unchanged, so a seed still
        // writes the same century.
        getEventDescriptor(category, type, actor, leader, year) {
            // The id, not the label: `ideology` was written out in English when
            // the roster loaded, and FD() can only translate the "ideology.x" /
            // "personalities.x" path it came from.
            const rawIdeology = leader.ideologyKey || leader.ideology || leader.personality;
            // FactionDataManager.t returns the path verbatim when it has no
            // entry, so the placeholder needs resolving here rather than there.
            const ideology = rawIdeology === 'Unknown'   // i18n-ignore: placeholder ideology id
                ? LK('History.leader.unknownIdeology')
                : FD(rawIdeology);
            // The placeholder leader keeps its English id in the record (it is
            // matched by exportProperNouns), so its label resolves here.
            const leaderName = leader.name === 'Unknown Leader'   // i18n-ignore: placeholder leader id
                ? LK('History.leader.unknown')
                : leader.name;
            const params = { actor: actor, leader: leaderName, ideology: ideology };

            const weirdKey = 'History.event.weird.' + category + '.' + type;
            const basicKey = 'History.event.basic.' + category + '.' + type;
            let key = 'History.event.generic';
            let p = { type: type, actor: actor };
            if (year >= 1992 && T.has(weirdKey) && this._rand() < 0.4) {
                key = weirdKey; p = params;
            } else if (T.has(basicKey)) {
                key = basicKey; p = params;
            }

            // `skill` stays lazy: rolling it up front would consume one extra
            // number from the seeded RNG on every event and rewrite the history
            // of every existing world. Once rolled it is stored as a param, so
            // re-reading the record never rolls again.
            if (renderLK(key, p).indexOf('{skill}') >= 0) {
                p = Object.assign({}, p, { skill: getRandomHighMpSkill(this._rand.bind(this)) });
            }
            return LK(key, p);
        }

        // The finished sentence, for anything that wants text rather than a
        // record. The event log itself stores the descriptor.
        getEventDescription(category, type, actor, leader, year) {
            const d = this.getEventDescriptor(category, type, actor, leader, year);
            return renderLK(d.$k, d.$p);
        }

        applyEffects(actor, isFaction, type) {
            const stats = isFaction ? this._currentFactions[actor] : this._currentHyperpowers[actor];
            if (!stats) return "";

            const results = [];
            // Hyperpowers and factions carry different stat sets (no 'tech' on a
            // hyperpower, no 'economy'/'population' on a faction), so only touch
            // fields the actor actually has, or the value turns into NaN.
            const scale = (key, factor, label) => {
                if (typeof stats[key] !== 'number') return;
                stats[key] *= factor;
                results.push(label);
            };
            const add = (key, amount, label) => {
                if (typeof stats[key] !== 'number') return;
                stats[key] += amount;
                results.push(label);
            };
            const is = group => EFFECT_TYPES[group].indexOf(type) >= 0;

            if (is('ecoCrash'))     scale('economy', 0.8, T('History.effect.ecoCrash'));
            if (is('ecoBoom'))      scale('economy', 1.15, T('History.effect.ecoBoom'));
            if (is('popLoss'))      scale('population', 0.95, T('History.effect.popLoss'));
            if (is('ecoDamage'))    scale('economy', 0.93, T('History.effect.ecoDamage'));
            if (is('infoGain'))     add('information', 20, T('History.effect.infoGain'));
            if (is('techGain'))     add('tech', 20, T('History.effect.techGain'));
            if (is('arcaneGain'))   add('arcane', 10, T('History.effect.arcaneGain'));
            if (is('militaryGain')) add('military', 10, T('History.effect.militaryGain'));

            if (typeof stats.arcane === 'number') stats.arcane += 2;
            if (typeof stats.population === 'number') stats.population *= 1.0001;

            return results.join(', ');
        }

        saveToGameSystem() {
            // The history lives in the active world folder (history.json), not
            // in the binary savegame. WorldManager keeps a session-only scratch
            // store when no world is active.
            if (window.WorldManager) {
                const WM = window.WorldManager;
                WM.setField("history", "events", this._events);
                WM.setField("history", "hyperpowers", this._currentHyperpowers);
                WM.setField("history", "factions", this._currentFactions);
                WM.setField("history", "deadLeaders", Array.from(this._deadLeaders));
                WM.setField("history", "startYear", this._startYear || START_YEAR);
                WM.setField("history", "countries", this._currentCountries);
                WM.setField("history", "nationHistory", this._nationHistory);
                WM.setField("history", "artifactRecords", this._artifactRecords);
                WM.setField("history", "leaderDeaths", this._leaderDeaths);
                WM.setField("history", "leaderIllness", this._leaderIllness);
                WM.setField("history", "holyLeaders", this._currentHolyLeaders);
                WM.setField("history", "moralGuides", this._currentMoralGuides);
                WM.setField("history", "epidemics", this._epidemics);
                if (this._seed !== undefined) {
                    WM.setField("history", "seed", this._seed);
                }
                WM.flush();
            } else if ($gameSystem) {
                // Keep this fallback branch symmetric with the WorldManager
                // branch above: persist every key readers may consult so a
                // WM-absent save/reload does not silently lose history.
                $gameSystem._historicalEvents = this._events;
                $gameSystem._historicalHyperpowers = this._currentHyperpowers;
                $gameSystem._historicalFactions = this._currentFactions;
                $gameSystem._historicalDeadLeaders = Array.from(this._deadLeaders);
                $gameSystem._historicalStartYear = this._startYear || START_YEAR;
                $gameSystem._historicalCountries = this._currentCountries;
                $gameSystem._historicalNationHistory = this._nationHistory;
                $gameSystem._historicalArtifactRecords = this._artifactRecords;
                $gameSystem._historicalLeaderDeaths = this._leaderDeaths;
                $gameSystem._historicalLeaderIllness = this._leaderIllness;
                $gameSystem._historicalHolyLeaders = this._currentHolyLeaders;
                $gameSystem._historicalMoralGuides = this._currentMoralGuides;
                $gameSystem._historicalEpidemics = this._epidemics;
                if (this._seed !== undefined) {
                    $gameSystem._historySeed = this._seed;
                }
            }
        }

        // --- Wiki / lookup API ------------------------------------------------
        // All readers prefer the active world's history.json (WorldManager) and
        // fall back to the in-memory simulation state.

        _histField(prop, fallback) {
            if (window.WorldManager) {
                const v = window.WorldManager.getField("history", prop);
                if (v !== undefined) return v;
            } else if ($gameSystem) {
                // WM-absent fallback: read the mirrored $gameSystem fields that
                // saveToGameSystem persists, so saved history stays readable.
                const map = {
                    events: "_historicalEvents",
                    hyperpowers: "_historicalHyperpowers",
                    factions: "_historicalFactions",
                    deadLeaders: "_historicalDeadLeaders",
                    moralGuides: "_historicalMoralGuides",
                    startYear: "_historicalStartYear",
                    countries: "_historicalCountries",
                    nationHistory: "_historicalNationHistory",
                    artifactRecords: "_historicalArtifactRecords",
                    leaderDeaths: "_historicalLeaderDeaths",
                    leaderIllness: "_historicalLeaderIllness",
                    holyLeaders: "_historicalHolyLeaders",
                    epidemics: "_historicalEpidemics",
                    seed: "_historySeed"
                };
                const key = map[prop];
                if (key && $gameSystem[key] !== undefined) return $gameSystem[key];
            }
            return fallback;
        }

        // Every epidemic and mass hysteria the century recorded, newest last.
        getEpidemics() {
            return localizeList(this._histField("epidemics", this._epidemics) || [], 'epidemic');
        }

        // The ones that reached a given town, for a person's medical record.
        getEpidemicsAt(town) {
            const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const key = norm(town);
            return this.getEpidemics().filter(e => (e.places || []).some(p => norm(p) === key));
        }

        getNationsState() {
            return this._histField("countries", this._currentCountries) || {};
        }

        getNationState(country) {
            return this.getNationsState()[country] || null;
        }

        getNationHistory(country) {
            const all = this._histField("nationHistory", this._nationHistory) || {};
            return localizeList(all[country] || [], 'nation');
        }

        getArtifactRecords() {
            return localizeMap(this._histField("artifactRecords", this._artifactRecords) || {}, 'artifact');
        }

        getArtifactRecord(key) {
            return this.getArtifactRecords()[key] || null;
        }

        getLeaderDeaths() {
            return localizeMap(this._histField("leaderDeaths", this._leaderDeaths) || {}, 'death');
        }

        getDeadLeaders() {
            const v = this._histField("deadLeaders", Array.from(this._deadLeaders || []));
            return Array.isArray(v) ? v : [];
        }

        getHyperpowers() {
            return this._histField("hyperpowers", this._currentHyperpowers) || {};
        }

        // ── What the abstract indices mean in people ────────────────────
        //
        // A power's record carries five bare numbers (population, military,
        // economy, information, arcane) that mean nothing to a reader: a
        // "Military 95" is not a fact about anything. These turn them into the
        // figures a yearbook would print, on one fixed reading of the scale:
        //   population index   1 point  = one million inhabitants
        //   military index   100 points = 0.4% of the population under arms
        //   arcane index     100 points = 0.06% of it in arcane practice
        //   economy index      1 point  = one billion euros of yearly product
        //   information index          = a 0-100 freedom-of-information score,
        //                                which is also ranked against every
        //                                other power in the world.
        // Nothing here changes the simulation: it is one reading of the same
        // numbers, so a power that grows reads as growing in people too.
        realFigures(hist) {
            if (!hist) return null;
            const idx = n => (Number.isFinite(Number(n)) ? Number(n) : 0);
            const population = Math.round(idx(hist.population) * 1e6);
            const soldiers = Math.round(population * (idx(hist.military) / 100) * 0.004);
            const practitioners = Math.round(population * (idx(hist.arcane) / 100) * 0.0006);
            const gdp = Math.round(idx(hist.economy) * 1e9);
            const freedom = Math.max(0, Math.min(100, Math.round(idx(hist.information) / 3)));
            return { population, soldiers, practitioners, gdp, freedom };
        }

        // Where a power stands on the freedom-of-information index against
        // every other power the world knows: { rank, of }, 1 being the freest.
        freedomRank(powerName) {
            const powers = this.getHyperpowers() || {};
            const rows = Object.entries(powers)
                .map(([name, rec]) => ({ name, score: this.realFigures(rec)?.freedom ?? 0 }))
                .sort((a, b) => b.score - a.score);
            const at = rows.findIndex(r => r.name === powerName);
            return at < 0 ? null : { rank: at + 1, of: rows.length };
        }

        getHistoricalFactions() {
            return this._histField("factions", this._currentFactions) || {};
        }

        // The life LeaderPersona.bakeLives wrote for this person when the
        // world was made, or null for a world made before that existed.
        bakedLife(name) {
            if (!window.WorldManager) return null;
            const lives = window.WorldManager.getField("history", "leaderLives");
            const life = lives && lives[name];
            return Array.isArray(life) && life.length ? life : null;
        }

        // Every event, with its keyed descriptions written out in the language
        // the game is being played in right now.
        getEvents() {
            const v = this._histField("events", this._events);
            return Array.isArray(v) ? localizeList(v, 'event') : [];
        }

        // The sentence a stored record reads as, for anything holding a
        // snapshot of an event rather than the event itself.
        describeRecord(rec) {
            return renderRecord(rec);
        }

        // --- The book of leaders -----------------------------------------
        // Leaders.json is the world's cast list, and it outlives any one run of
        // the simulation: a name that never took an office still has a record,
        // a nation, a face and a span of years. The wiki reads these to write a
        // leader's article, and the Empathize panel reads them to give that
        // article a person behind it, so both answer from the same book.

        // The whole record behind a name, or null for a name the book has never
        // heard of (a procedural politician, minted by NPCPolitics).
        getLeaderRecord(name) {
            return LEADERS_BY_NAME[String(name ?? '')] || null;
        }

        getLeaderRecordById(id) {
            return LEADERS_BY_ID[String(id ?? '')] || null;
        }

        // Every leader the book holds, in the order it lists them.
        listLeaderRecords() {
            return Object.values(LEADERS_BY_ID);
        }

        // The portrait to draw a leader with, as a path something can load, or
        // null when nothing in the book or in the sprite catalogue has a face
        // for them. Leaders.json says outright where the picture is; a leader
        // with no `bust` of their own borrows the one their walk sheet already
        // carries, which is how the fictional half of the cast is drawn.
        leaderBust(name) {
            const rec = this.getLeaderRecord(name);
            if (!rec) return null;
            // A record can name a portrait that is not on disk. Asking through
            // BustPath rather than trusting the string means such a leader
            // falls through to the face their walk sheet carries instead of
            // handing the reader a path to nothing.
            if (rec.bust) {
                const own = window.BustPath ? window.BustPath.url(rec.bust, null) : rec.bust;
                if (own) return own;
            }
            const sa = window.Sprites && window.Sprites.SpritesAssociation;
            const sheet = rec.sprite && sa && sa[String(rec.sprite).split('.')[0]];
            const bust = sheet && sheet[rec.spriteIndex || 0];
            if (!bust || bust === '7') return null;
            return window.BustPath ? window.BustPath.url(bust, null) : `img/busts/${bust}.png`;
        }

        // A leader's ideology, in the language being played. The roster loads
        // before ConfigManager does, so the `ideology` field on the record is
        // always English; `ideologyKey` is the id it came from and is what the
        // faction vocabulary can answer. A save written before the key was
        // stored keeps the English label.
        ideologyLabel(leader) {
            if (!leader) return '';
            const key = leader.ideologyKey;
            if (key && key !== 'Unknown') {   // i18n-ignore: placeholder ideology id
                const label = renderFD(key);
                if (label && label !== key) return label;
            }
            let raw = leader.ideology || leader.personality || '';
            if (raw === 'Unknown') return T('History.leader.unknownIdeology');   // i18n-ignore: placeholder ideology id
            // The label may still be the id it was resolved from: the ideology
            // book is read once, before the localizer is up, so a key the
            // faction table does not hold falls through as "ideology.x". Ask
            // the localizer directly, then the ideology catalogue, and only
            // then print the id with its punctuation taken off.
            raw = String(raw);
            if (/^(ideology|personalities)\./.test(raw)) {
                if (window.T && window.T.has && window.T.has(raw)) {
                    const t = window.T(raw);
                    if (t && t !== raw) return t;
                }
                const ideo = window.NPCShared && window.NPCShared.ideologyById
                    ? window.NPCShared.ideologyById(raw.replace(/^ideology\./, ''))
                    : null;
                if (ideo && ideo.name && window.T) {
                    const t = window.T(ideo.name);
                    if (t && t !== ideo.name) return t;
                }
                raw = raw.replace(/^(ideology|personalities)\./, '').replace(/_/g, ' ');
                raw = raw.replace(/\w/g, c => c.toUpperCase());
            }
            return raw;   // i18n-ignore: placeholder ideology id
        }

        // Events mentioning a name. The name is an English id and the sentences
        // it is searched in are written in the language being played, so the
        // label the id now reads as is searched for as well; a world simulated
        // before descriptions were keyed still holds the English.
        getEventsAbout(name, limit = 20) {
            const needle = String(name || "");
            if (!needle) return [];
            const label = window.WorldNames ? window.WorldNames.any(needle) : needle;
            return this.getEvents()
                .filter(e => e && typeof e.description === "string" &&
                             (e.description.includes(needle) ||
                              (label !== needle && e.description.includes(label))))
                .slice(-limit);
        }

        generateSpecificArtifactEvent(date, item, kind) {
            const isFaction = this._rand() < 0.5;
            const actorPool = isFaction ? Object.keys(this._currentFactions) : Object.keys(this._currentHyperpowers);
            if (actorPool.length === 0) return null;
            const actor = actorPool[Math.floor(this._rand() * actorPool.length)];
            const leader = isFaction ? this._currentFactionLeaders[actor] : this._currentLeaders[actor];

            const actorName = leader ? leader.name : actor;

            const actions = ['discovered', 'crafted', 'exhumed', 'stole'];
            const action = actions[Math.floor(this._rand() * actions.length)];

            let actionLK;
            if (action === 'stole') {
                // Powers only steal from powers they could plausibly reach:
                // two hyperpowers of different regions never share an event
                // (powersMayInteract). Factions hold no ground, so they are
                // free to rob each other wherever they are.
                const targets = actorPool.filter(a => a !== actor
                    && (isFaction || this.mayTradeArtifacts(actor, a)));
                if (targets.length > 0) {
                    const target = targets[Math.floor(this._rand() * targets.length)];
                    const targetLeader = isFaction ? this._currentFactionLeaders[target] : this._currentLeaders[target];
                    const targetName = targetLeader ? targetLeader.name : target;
                    actionLK = LK('History.artifact.stoleFrom', { holder: targetName });
                } else {
                    actionLK = LK('History.artifact.discovered');
                }
            } else {
                actionLK = LK('History.artifact.action.' + action);
            }
            const actionStr = renderLK(actionLK.$k, actionLK.$p);

            const dateStr = dayStr(date);

            if (kind) {
                this._artifactRecords[`${kind}:${item.id}`] = {
                    id: item.id, kind, name: item.name,
                    date: dateStr, action: actionStr,
                    actionKey: actionLK.$k, actionParams: actionLK.$p,
                    origin: actorName, originPower: actor,
                    holders: [{ holder: actorName, power: actor, since: dateStr, how: actionStr,
                                howKey: actionLK.$k, howParams: actionLK.$p }]
                };
            }

            return {
                date: dateStr,
                category: 'paranormal',
                type: 'artifact',
                ...descOf('History.artifact.found',
                    { holder: actorName, action: actionLK, artifact: AR(kind || 'item', item.id, item.name) }),
                iconIndex: 245
            };
        }

        getHistoricalFact(year = 0) {
            const all = this.getEvents();
            if (!all || all.length === 0) return T('History.log.blank');

            // The NPC life log (addMinorEvent) shares this array; it is gossip,
            // not history, so it never counts as a historical fact.
            const events = all.filter(e => e && e.type !== 'npc_life' && !/^\s*\[/.test(String(e.description || "")));
            if (events.length === 0) return T('History.log.blank');

            let pool = events;
            if (year > 0) {
                pool = events.filter(e => String(e.date || "").startsWith(String(year)));
            }
            if (pool.length === 0) return T('History.log.noEra');

            const event = pool[Math.floor(Math.random() * pool.length)];
            return T('History.log.fact', { date: event.date, description: event.description });
        }
    }

    // The world's event log, wherever it currently lives. Anything appending to
    // history goes through this rather than reaching for `_events` directly:
    // once a world folder exists the binary save is not the store any more.
    HistoryManager.prototype._eventStore = function () {
        if (window.WorldManager) {
            let events = window.WorldManager.getField("history", "events");
            if (!events) {
                events = [];
                window.WorldManager.setField("history", "events", events);
            }
            return events;
        }
        return this._events || null;
    };

    // Records a real historical event from outside the simulator. Unlike
    // addMinorEvent below (which files NPC gossip and is deliberately excluded
    // from historical facts), this writes a first-class record: keyed, so the
    // sentence is rebuilt in whatever language the world is later read in, and
    // categorised, so it shows in the Archive alongside the century's wars.
    // Used by the ONU assembly to enter every motion it votes on.
    //
    // `descKey` / `descParams` are the same contract descOf() uses internally.
    // The marker an outside caller (NPCPolitics) passes as an event's disease
    // param, so an obituary it files still reads in the language the world is
    // opened in rather than in the one it was written in.
    HistoryManager.prototype.diseaseRef = function (id, name) { return DZ(id, name); };

    HistoryManager.prototype.recordEvent = function (rec) {
        const events = this._eventStore();
        if (!events || !rec) return null;
        const now = rec.date ? String(rec.date) : (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();
        const entry = {
            date: now,
            category: rec.category || 'political',
            type: rec.type || 'event',
            results: rec.results || [],
            iconIndex: rec.iconIndex != null ? rec.iconIndex : ICONS.political,
            icon: "",
            ...descOf(rec.descKey, rec.descParams),
        };
        events.push(entry);
        if (events.length > 5000) events.shift();
        return entry;
    };

    // NPCSimulationCore hook, appends NPC world events into the history log
    HistoryManager.prototype.addMinorEvent = function ({ date, actor, desc }) {
      let events = this._events;
      if (window.WorldManager) {
        events = window.WorldManager.getField("history", "events");
        if (!events) {
          events = [];
          window.WorldManager.setField("history", "events", events);
        }
      }
      if (!events) return;
      events.push({
        date: String(date || "?"),
        category: "social",
        type: "npc_life",
        description: `[${actor}] ${desc}`,
        results: [],
        icon: "",
      });
      // Keep log bounded (max 5000 entries)
      if (events.length > 5000) events.shift();
    };

    // Initializes the active world's history according to the given options
    // ({canon: true} or {years: 10|50|100, seed}) and marks the world as
    // initialized so it only ever happens once per world.
    HistoryManager.prototype.initializeWorldHistory = function (options = {}) {
        const WM = window.WorldManager;
        if (!WM || !WM.activeWorldName) return;
        const info = WM.worldInfo();
        const canon = options.canon === true;
        // Non-canon worlds derive their seed deterministically from the world
        // name (not Math.random), so "same world, same history" holds and a
        // world regenerates identically. Canon always uses the fixed seed.
        const seed = options.seed !== undefined
            ? options.seed
            : (canon ? 19002001 : normalizeHistorySeed(WM.activeWorldName));
        this.setSeed(seed);
        if (canon) {
            this.generateArtifacts();
        } else {
            this.runSimulation(options.years || null);
        }
        // Every procedural leader the century seated gets a whole life run for
        // them here, once, and it is kept in the world folder with the rest of
        // the history (LeaderPersona.bakeLives).
        try {
            const baked = window.LeaderPersona ? window.LeaderPersona.bakeLives() : 0;
            if (baked) console.log(`[HistorySimulator] Simulated ${baked} procedural leader lives.`);
        } catch (e) { console.warn("[HistorySimulator] leader lives", e); }
        info.seed = seed;
        info.historyYears = canon ? null : (options.years || null);
        info.historyInitialized = true;
        info.historyKeyed = true;
        WM.flush();
        console.log(`[HistorySimulator] World '${WM.activeWorldName}' history initialized (${canon ? "canon" : (options.years ? options.years + " years" : "full timeline")}, seed ${seed}).`);
    };

    // A world simulated before descriptions carried their i18n key froze its
    // timeline in the language it was generated in, which is what made an
    // Italian NPC bio quote an English coup. The century is deterministic in
    // the world's seed, so it is re-run once: the same events come back, this
    // time carrying the keys that let them be read in any language. The NPC
    // life log the same array collects (addMinorEvent) is gossip, not
    // simulation output, so it is carried across rather than regenerated.
    HistoryManager.prototype.migrateKeyedHistory = function () {
        const WM = window.WorldManager;
        if (!WM || !WM.activeWorldName) return false;
        const info = WM.worldInfo();
        if (!info.historyInitialized || info.historyKeyed) return false;

        const events = WM.getField("history", "events");
        const simulated = Array.isArray(events)
            ? events.filter(e => e && e.type !== "npc_life")
            : [];
        // Nothing to re-key: an empty or already keyed timeline just gets the
        // flag so this never runs again.
        if (simulated.length && !simulated.some(e => e.descKey)) {
            const gossip = events.filter(e => e && e.type === "npc_life");
            console.log(`[HistorySimulator] Re-running world '${WM.activeWorldName}' history to key its descriptions for translation.`);
            this.setSeed(info.seed !== undefined ? info.seed : normalizeHistorySeed(WM.activeWorldName));
            this.runSimulation(info.historyYears || null);
            if (gossip.length) {
                const merged = WM.getField("history", "events");
                if (Array.isArray(merged)) merged.push(...gossip);
            }
        }
        info.historyKeyed = true;
        WM.flush();
        return true;
    };

    //=========================================================================
    // The living chronicle: the world after the century
    //=========================================================================
    //
    // runSimulation() writes 1900 to 2001 month by month and stops, so a world
    // that was then PLAYED had nothing happen in it: the Archive ended on the
    // day the world was made. The same generators keep running against the
    // game clock, one entry a day, with the monthly passes (leaders, internal
    // politics, nations changing hands, plagues, artifacts changing owner) on
    // the first of each month exactly as the century was written.
    //
    // Two rules make it one story rather than one per savegame:
    //   , every entry is written into the world folder's own history.json,
    //     which every savegame of the world shares;
    //   , every day is rolled from a stream seeded on (world seed, day), so
    //     whichever savegame reaches a day first writes the same day the
    //     others would have.
    // Whatever the party does that is worth recording (a boss felled, an
    // artifact changing hands, a party wiped out for good) is written into the
    // same file through recordEvent, so the Archive is one timeline.

    const LIVE_MAX_DAYS = 4400;    // ~12 years, the whole reachable calendar
    const LIVE_EVENT_CAP = 3000;   // live entries kept; the century is never trimmed

    // A day is a calendar day, not a 1440-minute block off the clock's epoch:
    // the world clock starts at 10:00, so counting minutes/1440 would put the
    // chronicle's midnight at ten in the morning and stamp a morning's entry
    // with yesterday's date. The index is the calendar date itself, which is
    // also what makes it agree with the date the player is looking at.
    function liveDayOf(minute) {
        const date = new Date(2001, 0, 1, 10, 0, 0);
        date.setMinutes(date.getMinutes() + (Number(minute) || 0));
        return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    }

    // The calendar date a day index falls on. Built at midday so no daylight
    // saving edge can push it onto a neighbouring date; only y/m/d is read.
    function liveDateOf(day) {
        const utc = new Date(day * 86400000);
        return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12, 0, 0);
    }

    const liveDateStr = dayStr;

    HistoryManager.prototype._liveGet = function (prop) {
        if (window.WorldManager) return window.WorldManager.getField("history", prop);
        return this["_live_" + prop];
    };

    HistoryManager.prototype._liveSet = function (prop, value) {
        if (window.WorldManager) window.WorldManager.setField("history", prop, value);
        else this["_live_" + prop] = value;
    };

    // The cast the daily generators need, rehydrated from the world folder so
    // an ordinary session can continue the century without re-running it.
    HistoryManager.prototype._ensureLiveCast = function () {
        if (this._liveCastReady) return true;
        if (!this._currentHyperpowers) this.reset();
        const held = {
            hyperpowers: this._liveGet("hyperpowers"),
            factions: this._liveGet("factions"),
            countries: this._liveGet("countries"),
            nationHistory: this._liveGet("nationHistory"),
            artifactRecords: this._liveGet("artifactRecords"),
            leaderDeaths: this._liveGet("leaderDeaths"),
            leaderIllness: this._liveGet("leaderIllness"),
            deadLeaders: this._liveGet("deadLeaders"),
            holyLeaders: this._liveGet("holyLeaders"),
            epidemics: this._liveGet("epidemics"),
        };
        if (held.hyperpowers) this._currentHyperpowers = held.hyperpowers;
        if (held.factions) this._currentFactions = held.factions;
        if (held.countries) this._currentCountries = held.countries;
        if (held.nationHistory) this._nationHistory = held.nationHistory;
        if (held.artifactRecords) this._artifactRecords = held.artifactRecords;
        if (held.leaderDeaths) this._leaderDeaths = held.leaderDeaths;
        if (held.leaderIllness) this._leaderIllness = held.leaderIllness;
        if (held.holyLeaders) this._currentHolyLeaders = held.holyLeaders;
        if (Array.isArray(held.epidemics)) this._epidemics = held.epidemics;
        if (Array.isArray(held.deadLeaders)) this._deadLeaders = new Set(held.deadLeaders);
        this._liveCastReady = true;
        return true;
    };

    // Writing the world folder out is the expensive half of all this, and the
    // cryogenic pod runs a catch-up on every one of its 960 frames, so the
    // flush is throttled: the fields are always up to date in memory (which is
    // what every reader consults) and reach the disk a few times a second at
    // most. A catch-up that changed nothing never flushes at all.
    const LIVE_FLUSH_INTERVAL = 3000;

    HistoryManager.prototype._liveFlush = function (force) {
        if (!window.WorldManager) return;
        const now = Date.now();
        if (!force && this._liveFlushAt && now - this._liveFlushAt < LIVE_FLUSH_INTERVAL) return;
        this._liveFlushAt = now;
        window.WorldManager.flush();
    };

    // What the day changed about the world, back into the world folder. The
    // event log is written by the day pass itself (it pushes into the store),
    // so only the state the generators mutate is put back here.
    HistoryManager.prototype._persistLiveCast = function () {
        this._liveSet("hyperpowers", this._currentHyperpowers);
        this._liveSet("factions", this._currentFactions);
        this._liveSet("countries", this._currentCountries);
        this._liveSet("nationHistory", this._nationHistory);
        this._liveSet("artifactRecords", this._artifactRecords);
        this._liveSet("leaderDeaths", this._leaderDeaths);
        this._liveSet("leaderIllness", this._leaderIllness);
        this._liveSet("holyLeaders", this._currentHolyLeaders);
        this._liveSet("deadLeaders", Array.from(this._deadLeaders || []));
        this._liveSet("epidemics", this._epidemics);
        this._liveFlush();
    };

    // Live entries are trimmed on their own, so a long game can never push the
    // century that was generated before it out of the log.
    HistoryManager.prototype._trimLiveEvents = function (events) {
        let live = 0;
        for (const e of events) if (e && e.live) live++;
        if (live <= LIVE_EVENT_CAP) return;
        let drop = live - LIVE_EVENT_CAP;
        for (let i = 0; i < events.length && drop > 0; i++) {
            if (events[i] && events[i].live) { events.splice(i, 1); i--; drop--; }
        }
    };

    // One day of the world. The daily entry is guaranteed; the monthly passes
    // run on the 1st, which is the same cadence the century was written at.
    HistoryManager.prototype._runLiveDay = function (day, store) {
        const date = liveDateOf(day);
        const seed = normalizeHistorySeed(this.getSeed());
        // A day is its own stream, so the same day reads the same in every
        // savegame of the world however they got there.
        this._rng = makeRng((seed ^ Math.imul(day + 1, 2654435761)) >>> 0);

        this.updateActiveLeaders(date);

        // The monthly generators push into `this._events`; for the live pass
        // that array IS the world log, so what they write lands in the world
        // folder rather than in a scratch array nobody reads.
        const held = this._events;
        const before = store.length;
        this._events = store;
        try {
            if (date.getDate() === 1) {
                // A power can be founded in the middle of a playthrough: the
                // Northpoint Army declares itself on 1 December 2001, which is
                // eleven months after the game starts.
                this.handleFoundings(date);
                this.handleLeaderMortality(date);
                this.handleEpidemics(date);
                this.handleInternalPolitics(date, false);
                this.handleInternalPolitics(date, true);
                this.handleNationPolitics(date);
                this.handleArtifactTransfers(date);
            }
            const event = this.generateRandomEvent(date);
            if (event) this._events.push(event);
            // A live day can be as busy as a simulated one: the same odds of
            // a second, third, fourth and fifth entry apply on top of the
            // guaranteed first.
            for (const chance of EXTRA_EVENT_CHANCES) {
                if (this._rand() >= chance) break;
                const extra = this.generateRandomEvent(date);
                if (extra) this._events.push(extra);
            }
        } catch (e) {
            console.warn("[HistorySimulator] live day", liveDateStr(date), e);
        } finally {
            this._events = held;
        }

        // Everything the day wrote is stamped as live and dated to the day
        // itself rather than to its month, so the Archive can order it, and
        // handed to the news ticker, which is where the world talks about
        // itself while the party is walking around in it.
        for (let i = before; i < store.length; i++) {
            if (!store[i]) continue;
            store[i].live = true;
            store[i].date = liveDateStr(date);
            if (window.$newsManager && typeof window.$newsManager.addWorldEvent === "function") {
                try { window.$newsManager.addWorldEvent(renderRecord(store[i]), store[i].date); } catch (_) {}
            }
        }
        return store.length - before;
    };

    // Resolve every day the world has lived through since it was last read.
    // Safe to call as often as anything likes: it is a delta engine, and a
    // clock that has not crossed midnight costs one comparison.
    HistoryManager.prototype.catchUpLiveHistory = function (nowMinute) {
        if (this._liveRunning) return 0;
        const store = this._eventStore();
        if (!store) return 0;
        const minute = Number(
            nowMinute != null ? nowMinute
                : (typeof $gameVariables !== "undefined" && $gameVariables ? $gameVariables.value(114) : 0)
        ) || 0;
        const today = liveDayOf(minute);
        let last = this._liveGet("liveLastDay");
        if (last == null) { this._liveSet("liveLastDay", today); return 0; }
        if (today <= last) {
            if (today < last) this._liveSet("liveLastDay", today);  // the clock was rewound
            return 0;
        }
        if (today - last > LIVE_MAX_DAYS) last = today - LIVE_MAX_DAYS;

        this._liveRunning = true;
        let written = 0;
        try {
            this._ensureLiveCast();
            for (let day = last + 1; day <= today; day++) {
                written += this._runLiveDay(day, store);
            }
            this.reconcileArtifactCustody(liveDateStr(liveDateOf(today)));
            this._trimLiveEvents(store);
            this._liveSet("liveLastDay", today);
            this._persistLiveCast();
        } finally {
            this._liveRunning = false;
        }
        return written;
    };

    //=========================================================================
    // Artifact custody
    //=========================================================================
    //
    // An artifact record carries the chain of everybody who has held it, and
    // the last link is where it was last known to be. The world keeps moving
    // them around (handleArtifactTransfers steals, buys and exhumes them), but
    // one held by the party is out of the world's reach: nobody steals it off
    // the people carrying it, so it is skipped by every transfer roll.

    const ARTIFACT_DB = { item: () => $dataItems, weapon: () => $dataWeapons, armor: () => $dataArmors };

    function artifactDatum(kind, id) {
        const key = String(kind || "item").replace(/s$/, "");
        const db = ARTIFACT_DB[key] ? ARTIFACT_DB[key]() : null;
        return db ? db[Number(id)] : null;
    }

    // The party holds it if it is in the pack or worn by anybody in it.
    function partyHoldsArtifact(kind, id) {
        if (typeof $gameParty === "undefined" || !$gameParty) return false;
        const datum = artifactDatum(kind, id);
        if (!datum) return false;
        return $gameParty.numItems(datum) > 0 ||
            $gameParty.members().some((actor) => actor.equips().some((eq) => eq === datum));
    }

    HistoryManager.prototype.artifactHeldByParty = function (rec) {
        return !!rec && partyHoldsArtifact(rec.kind, rec.id);
    };

    // The name the chronicle knows the party by: whoever is leading it.
    function partyChronicleName() {
        if (typeof $gameParty === "undefined" || !$gameParty) return null;
        const leader = $gameParty.leader();
        return leader ? leader.name() : null;
    }

    // Writes a new link onto an artifact's chain and files the event. `how` is
    // one of History.artifact.action.*; the holder is a plain name.
    HistoryManager.prototype.recordArtifactCustody = function (kind, id, holderName, how, dateStr) {
        this._ensureLiveCast();
        const key = String(kind || "item").replace(/s$/, "") + ":" + Number(id);
        const rec = (this._artifactRecords || {})[key];
        if (!rec || !holderName) return null;
        const holders = rec.holders || (rec.holders = []);
        const last = holders[holders.length - 1];
        if (last && last.holder === holderName) return null;
        const action = how || "inherited";
        const howKey = "History.artifact.action." + action;
        const date = dateStr || liveDateStr(liveDateOf(liveDayOf(
            typeof $gameVariables !== "undefined" && $gameVariables ? $gameVariables.value(114) : 0
        )));
        holders.push({ holder: holderName, power: null, since: date, how: T(howKey), howKey, howParams: null });
        const entry = this.recordEvent({
            date: date,
            category: "paranormal",
            type: "artifact",
            descKey: "History.artifact.transfer",
            descParams: {
                holder: holderName,
                action: LK(howKey),
                artifact: AR(rec.kind, rec.id, rec.name),
                from: last ? LK("History.artifact.from", { holder: last.holder }) : "",
            },
            iconIndex: 245,
        });
        if (entry) entry.live = true;
        this._persistLiveCast();
        this._liveFlush(true);
        return entry;
    };

    // Anything the party is carrying that the ledger still has somebody else
    // holding has changed hands, and the world is told so. This is what writes
    // the Artifact Heir's inheritance, a dig, a theft or a purchase alike, on
    // the day it happened.
    HistoryManager.prototype.reconcileArtifactCustody = function (dateStr) {
        this._ensureLiveCast();
        const name = partyChronicleName();
        if (!name || !this._artifactRecords) return 0;
        let moved = 0;
        for (const rec of Object.values(this._artifactRecords)) {
            if (!this.artifactHeldByParty(rec)) continue;
            const holders = rec.holders || [];
            const last = holders[holders.length - 1];
            if (last && last.holder === name) continue;
            if (this.recordArtifactCustody(rec.kind, rec.id, name, "inherited", dateStr)) moved++;
        }
        return moved;
    };

    //=========================================================================
    // What the party itself puts in the record
    //=========================================================================

    // A party wiped out under permadeath is gone: the savegame goes with it, so
    // the only place they can still be read is the world's own history, which
    // outlives every savegame in it.
    HistoryManager.prototype.recordPartyWipe = function (names, place) {
        const roster = (Array.isArray(names) ? names : [names]).filter(Boolean).join(", ");
        if (!roster) return null;
        const minute = typeof $gameVariables !== "undefined" && $gameVariables ? $gameVariables.value(114) : 0;
        const entry = this.recordEvent({
            date: liveDateStr(liveDateOf(liveDayOf(minute))),
            category: "military",
            type: "party_wipe",
            descKey: place ? "History.party.wipeAt" : "History.party.wipe",
            descParams: { party: roster, place: place || "" },
            iconIndex: 1,
        });
        if (entry) {
            entry.live = true;
            this._liveFlush(true);
        }
        return entry;
    };

    // Initialize global manager
    const manager = new HistoryManager();
    window.HistoryManager = manager;

    //=========================================================================
    // window.LeaderPersona, the person behind the office
    //=========================================================================
    //
    // Leaders.json names 580 people, and until now the wiki could say almost
    // nothing about any of them: an ideology and a span of years. They govern,
    // they die, they are named in half the century's sentences, and none of
    // them was ever anybody. This turns each of them into a character with the
    // same kind of sheet a pre-made one has, so a leader can be read, and
    // empathized with, whether or not they ever stand on a map.
    //
    // The answer is shaped exactly like a CharacterCreationPresets dossier
    // (classId, birthDate, nationId, gender, money, traits, specializations,
    // skills, lore), because the Empathize panel already knows how to draw one
    // of those. Where the leader IS a dossier, that dossier is the answer.
    //
    // The people who actually lived are not derived at all. Every historical
    // leader in Leaders.json carries `real: true` and the record of a person:
    // the day they were born (`birthDate`, or `birthYear` alone where the day
    // is disputed), the town they were born in (`hometown`), their gender, the
    // orientation the public record gives them (`sexualOrientation` /
    // `romanticOrientation`, left out where the record says nothing, which
    // rolls it like anybody else's) and the traits they are read by (`traits`,
    // Health.Traits ids). Those beat every rule below. The fictional half of
    // the book, which is most of it, is still derived exactly as before.
    //
    // Where the sheet comes from, best first:
    //   party     someone of that name is travelling with the player right now
    //   retired   a dossier of theirs was benched in this world, in ANY of its
    //             savegames (the retired list is world-shared)
    //   past      they rode with a party of this world once and left
    //   preset    they are a pre-made character nobody has taken yet: the
    //             dossier as it ships, which is the level 1 version of them
    //   synthetic nobody has ever played them: a sheet derived from the record
    //
    // Everything synthetic is seeded from the world seed and the person's own
    // name, so a leader reads the same in every savegame of a world and
    // differently between worlds, like the rest of the simulation.
    (function leaderPersona() {

        // Vocations a leader is read as, by what the record says they are. The
        // first key whose test matches the ideology id, the office in the name,
        // or the nation decides; CEO is the fallback because a leader without
        // any other calling is a career politician.
        // i18n-ignore-start: ideology ids and office words matched against the
        // English record, not prose. The class the player reads is $dataClasses.
        const VOCATIONS = [
            { classId: 59, test: /pope|pontif|cardinal|bishop|abbot|priest|clerical|theocra|holy|lama|imam|ayatollah|vatican/i },
            { classId: 8,  test: /cult|thelem|occult|magus|discordian|esoteric|hermetic/i },
            { classId: 2,  test: /witch|coven|hex/i },
            { classId: 27, test: /archmage|magister|spellweaver|enchanter|arcane|sorcer/i },
            { classId: 61, test: /god|divin|deity|abramic|feathered_serpent|ascend/i },
            { classId: 32, test: /marshal|general|admiral|commander|junta|militar|warlord|colonel|khan|jaguar/i },
            { classId: 31, test: /necroman|undead|lich|dread/i },
            { classId: 23, test: /demon|duke|marquis|earl|prince|goet|infernal/i },
            { classId: 39, test: /sage|philosoph|elder|regent|preceptor|scribe|keeper/i },
            { classId: 42, test: /scien|technocra|analyz|research|archive/i },
            { classId: 46, test: /journal|press|media|broadcast|informat/i },
            { classId: 6,  test: /capital|corporat|petro|merchant|banker|econom|tycoon|ceo|director|shadow/i },
            { classId: 40, test: /goblin|orc|warband|horde|barbar/i },
            { classId: 21, test: /assassin|smuggl|thief|criminal|bandit/i },
            { classId: 24, test: /steward|warden|ranger|colon|governor/i },
            { classId: 35, test: /populist|orator|entertain|showman/i },
        ];
        const DEFAULT_VOCATION = 6; // CEO: the statesman's sheet
        // i18n-ignore-end

        // Traits every leader of a kind carries, by the same test. A leader
        // takes the first four that match, so a pope reads as devout and
        // ascetic while a marshal reads as tactical and blunt. Ids are
        // Health.Traits entries, the bank character creation spends points in.
        // i18n-ignore-start: ideology ids, see above
        const TRAIT_RULES = [
            { id: 116, test: /pope|pontif|priest|clerical|theocra|holy|devout|faith/i },   // Devout
            { id: 50,  test: /monk|ascet|lama|abbot|hermit/i },                            // Ascetic
            { id: 118, test: /cult|thelem|occult|heret|discordian|magus/i },               // Heretic
            { id: 98,  test: /marshal|general|admiral|commander|militar|tactic|khan/i },   // Tactician
            { id: 85,  test: /expansion|imperial|conquer|absolut|ambition|restorat/i },    // Ambitious
            { id: 81,  test: /populist|orator|charism|media|showman|democrat/i },          // Charismatic
            { id: 7,   test: /scien|technocra|archmage|philosoph|sage|academ|analyz/i },   // Genius
            { id: 132, test: /scholar|archive|preceptor|scribe|academ|doctrin/i },         // Scholar
            { id: 131, test: /capital|corporat|petro|tycoon|oil|banker|merchant/i },       // Wealthy
            { id: 95,  test: /stoic|juche|discipline|order|single_party/i },               // Stoic
            { id: 172, test: /blunt|nationalist|hardline|punitive/i },                     // Blunt
            { id: 171, test: /honest|pacifist|humanit|reform/i },                          // Honest
            { id: 174, test: /machiavell|infam|junta|dictator|absolut|purge/i },           // Infamous
            { id: 173, test: /famous|crown|king|queen|emperor|monarch|royal/i },           // Famous
        ];
        // i18n-ignore-end

        // The trades an office actually asks for. A leader is credited with
        // these at the level their span of years earns: the longer they held
        // an office, the further along their own trade they are.
        // i18n-ignore-start: ideology ids, see above
        const SPEC_RULES = [
            { id: 706, level: 4, test: /./ },                                              // Political Science, everyone
            { id: 218, level: 3, test: /populist|orator|charism|democrat|media|showman/i }, // Public Speaking
            { id: 277, level: 4, test: /pope|pontif|priest|clerical|theocra|holy|lama/i },  // Theology
            { id: 165, level: 4, test: /magus|arcane|archmage|occult|thelem|spellweaver/i },// Magic Theory
            { id: 156, level: 3, test: /marshal|general|admiral|commander|militar|khan/i }, // Leadership
            { id: 88,  level: 3, test: /diploma|envoy|ambassador|accord|peace|onu/i },      // Diplomacy
            { id: 350, level: 3, test: /machiavell|espionage|intelligence|shadow|secret/i },// Espionage
            { id: 259, level: 3, test: /capital|corporat|banker|econom|petro|tycoon/i },    // Stock Trading
            { id: 199, level: 3, test: /philosoph|sage|doctrin|dharma|juche/i },            // Philosophy
            { id: 135, level: 2, test: /./ },                                              // History, everyone
        ];
        // i18n-ignore-end

        // Which of the party's slots a leader would be, if they were one, is
        // decided by the same seed everything else about them is: name, world.
        function seedOf(name) {
            let h = 2166136261;
            const s = String(name || '') + '|' + String(manager._seed || 0);
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619) >>> 0;
            }
            return h >>> 0;
        }

        function rollFrom(seed, step) {
            let h = (seed + Math.imul(step + 1, 2654435761)) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 2246822507) >>> 0;
            h ^= h >>> 13;
            return (h >>> 0) / 4294967296;
        }

        // Everything about a leader a rule can be tested against, as one lower
        // case string: their name (which is where an office usually is), the
        // ideology id behind the label, the nation, and the body they serve.
        function haystackOf(record) {
            return [record.name, record.ideologyKey, record.ideology,
                    record.country].filter(Boolean).join(' ').toLowerCase();
        }

        function vocationOf(record) {
            const hay = haystackOf(record);
            const hit = VOCATIONS.find(v => v.test.test(hay));
            return hit ? hit.classId : DEFAULT_VOCATION;
        }

        function traitsOf(record) {
            // A real person's traits are written down rather than guessed at:
            // Churchill is not read as devout because his ideology label holds
            // the word "imperial". Only the fictional half of the book goes
            // through the rules below.
            if (record.traits && record.traits.length) return record.traits.slice();
            const hay = haystackOf(record);
            const out = [];
            for (const rule of TRAIT_RULES) {
                if (out.length >= 4) break;
                if (rule.test.test(hay)) out.push(rule.id);
            }
            // Nobody reads as nothing: a leader the rules missed gets the two
            // any officeholder has, rolled apart so they are not all identical.
            if (out.length < 2) {
                const seed = seedOf(record.name);
                const fill = [81, 132, 95, 85, 98, 171];
                while (out.length < 2) {
                    const pick = fill[Math.floor(rollFrom(seed, out.length) * fill.length)];
                    if (!out.includes(pick)) out.push(pick);
                }
            }
            return out;
        }

        // Years in office, which is what a leader's trades are measured in.
        function reignLength(record) {
            const y = record.years || [];
            if (y.length < 2) return 0;
            const span = Number(y[1]) - Number(y[0]);
            return Number.isFinite(span) && span > 0 ? span : 0;
        }

        function specsOf(record) {
            const hay  = haystackOf(record);
            const span = reignLength(record);
            // A long tenure is worth one more grade on everything, capped at 5.
            const bonus = span >= 30 ? 1 : 0;
            const out = [];
            for (const rule of SPEC_RULES) {
                if (out.length >= 4) break;
                if (!rule.test.test(hay)) continue;
                out.push({ id: rule.id, level: Math.min(5, rule.level + bonus) });
            }
            return out;
        }

        // What a leader is worth. An office pays, and some offices pay very
        // differently: the amounts are in cents, as everywhere else.
        function wealthOf(record) {
            const hay = haystackOf(record);
            let base = 1500000;
            if (/capital|corporat|petro|tycoon|oil|banker|merchant|king|emir|sultan/i.test(hay)) base = 9000000;
            else if (/pope|pontif|holy|monarch|king|queen|emperor|khan/i.test(hay)) base = 4000000;
            else if (/ascet|monk|pacifist|anarch|revolution/i.test(hay)) base = 200000;
            const seed = seedOf(record.name);
            return Math.round(base * (0.7 + rollFrom(seed, 11) * 0.8));
        }

        // A leader's year of birth is not in the book, so it is read off the
        // year they first count for: an officeholder is a grown person, and
        // roughly how grown is rolled rather than fixed so a cabinet is not all
        // the same age. Returns an ISO date, the shape a dossier's birthDate
        // has, or null where the record has no years at all.
        function birthDateOf(record) {
            // A real person was born on a day, and the book says which one.
            // Where only the year of birth is on record (a leader whose exact
            // day nobody agrees on) the day is rolled inside that year, so the
            // year stays true and the article still has a date to print.
            if (record.birthDate) return record.birthDate;
            const pad = (n) => String(n).padStart(2, '0');
            if (Number.isFinite(record.birthYear) && record.birthYear > 0) {
                const s = seedOf(record.name);
                const m = 1 + Math.floor(rollFrom(s, 4) * 12);
                const d = 1 + Math.floor(rollFrom(s, 5) * 28);
                return `${record.birthYear}-${pad(m)}-${pad(d)}`;
            }
            const start = record.years && Number(record.years[0]);
            if (!Number.isFinite(start) || start <= 0) return null;
            const seed = seedOf(record.name);
            const age   = 38 + Math.floor(rollFrom(seed, 3) * 22);   // 38..59
            const month = 1 + Math.floor(rollFrom(seed, 4) * 12);
            const day   = 1 + Math.floor(rollFrom(seed, 5) * 28);
            const year  = start - age;
            return `${year}-${pad(month)}-${pad(day)}`;
        }

        // The one sentence a leader's article opens with when nobody wrote them
        // a dossier: what they stand for, where, and for how long. A dossier
        // reads its lore from CharPresets.lore.<id>; this is the same field,
        // filled from the record instead, so the panel draws it the same way.
        function loreOf(record) {
            const years = record.years || [];
            const hasReign = years.length >= 2 && Number(years[0]) > 0 &&
                             Number(years[1]) !== Number(years[0]);
            const nation = record.country
                ? (window.WorldNames ? window.WorldNames.nation(record.country) : record.country)
                : null;
            const key = nation
                ? (hasReign ? 'History.leader.bioReign' : 'History.leader.bio')
                : (hasReign ? 'History.leader.bioNoNationReign' : 'History.leader.bioNoNation');
            return T(key, {
                name: record.name,
                nation: nation || '',
                ideology: manager.ideologyLabel(record),
                from: years[0] ?? '?',
                to: years[1] ?? '?',
            });
        }

        // Male, female or neither. The book does not say, so the few leaders
        // whose names announce it are read from the name and the rest are
        // rolled: the answer is stable per world, which is all the panel needs.
        // i18n-ignore-start: title words in the English record
        const FEMALE_TITLES = /\b(queen|empress|princess|duchess|shahbanu|high priestess|madame|mother|lady|dame|magister lyra|spellweaver mira)\b/i;
        const MALE_TITLES   = /\b(king|emperor|prince|duke|shah|sultan|emir|khan|pope|father|lord|sir|marshal|tsar)\b/i;
        // i18n-ignore-end

        function genderOf(record) {
            if (record.gender !== null && record.gender !== undefined) return record.gender;
            const name = String(record.name || '');
            if (FEMALE_TITLES.test(name)) return 1;
            if (MALE_TITLES.test(name)) return 0;
            const seed = seedOf(record.name);
            return rollFrom(seed, 7) < 0.22 ? 1 : 0;
        }

        // ── The dossier a leader is played from, if there is one ────────────

        function presetsList() {
            const CP = window.CharacterPresets;
            if (!CP || !CP.getCharacterPresets) return [];
            try { return CP.getCharacterPresets() || []; } catch (e) { return []; }
        }

        // The dossier this leader IS. Named outright in Leaders.json (`preset`)
        // where the two spell the person differently ("Giulio Andreotti" is the
        // dossier "Andreotti"), matched on the name otherwise.
        function presetFor(record) {
            if (!record) return null;
            const list = presetsList();
            if (!list.length) return null;
            const want = String(record.preset || record.name).trim().toLowerCase();
            return list.find(p => String(p.name || '').trim().toLowerCase() === want) || null;
        }

        // ── What this world already knows about them ────────────────────────

        function worldList(field) {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
            const v = $gameSystem[field];
            return Array.isArray(v) ? v : [];
        }

        function livingActor(name) {
            if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.allMembers) return null;
            try {
                return $gameParty.allMembers().find(a => a && a.name() === name) || null;
            } catch (e) { return null; }
        }

        // The trades a party member has actually trained (level above the
        // untrained 1), highest first and capped: a leader's article lists a
        // handful, not the whole register.
        function actorSpecs(actor) {
            const S = window.Specializations;
            if (!S || !S.list || !actor.specializationLevel) return [];
            const out = [];
            for (const spec of S.list) {
                const level = actor.specializationLevel(spec.id);
                if (level > 1) out.push({ id: spec.id, level });
            }
            return out.sort((a, b) => b.level - a.level).slice(0, 6);
        }

        // A party member's own sheet, read off the actor rather than off any
        // dossier: this is who they have BECOME, which is the whole point of
        // asking the live party first.
        function fromActor(actor) {
            return {
                classId: actor._classId,
                level: actor.level,
                traits: (actor._selectedTraits || []).map(t => t && t.id).filter(id => id > 0),
                specializations: actorSpecs(actor),
                skills: actor.skills ? actor.skills().map(s => s.id) : [],
                money: 0,
                gender: actor.gender ? actor.gender() : undefined,
                busts: actor.vnBust ? actor.vnBust() : '',
            };
        }

        // ── The public answer ───────────────────────────────────────────────

        // -- Procedural leaders: the ones the book never wrote down ---------
        //
        // Two kinds of person hold office in this world. The BOOK's people are
        // in Leaders.json: real historical figures and the canon cast, written
        // by hand, and the wiki files them under Main Players. Everybody else
        // is procedural: a name a world's own history seated (a power whose
        // roster ran out, a faction's officer, a politician NPCPolitics
        // invented). Until now those had no dossier at all, because dossierFor
        // asked the book and stopped when the book said nothing.
        //
        // They do have a record: the roster entry the world's history.json
        // holds for them (name, ideology or personality, country, years, the
        // sprite and bust they are drawn with). rosterRecord turns that into
        // the same shape a book record has, so every derivation below - the
        // vocation, the traits, the trades, the birth date, the wealth - runs
        // on them unchanged.
        function rosterRecord(name) {
            if (!name) return null;
            const groups = [
                [manager.getHyperpowers ? manager.getHyperpowers() : {}, 'leaders'],
                [manager.getHyperpowers ? manager.getHyperpowers() : {}, 'holy_leaders'],
                [manager.getHistoricalFactions ? manager.getHistoricalFactions() : {}, 'leaders'],
            ];
            for (const [group, field] of groups) {
                for (const [ofName, data] of Object.entries(group || {})) {
                    for (const entry of ((data && data[field]) || [])) {
                        if (!entry || entry.name !== name) continue;
                        const rawKey = entry.ideologyKey || entry.ideology || entry.personality || '';
                        return {
                            name: entry.name,
                            ideology: entry.ideology || entry.personality || '',
                            ideologyKey: /^(ideology|personalities)\./.test(String(rawKey)) ? rawKey : null,
                            country: entry.country || null,
                            years: entry.years || null,
                            sprite: entry.spritename || entry.sprite || null,
                            spriteIndex: entry.spriteindex || 0,
                            bust: entry.bust || null,
                            of: ofName,
                            procedural: true,
                        };
                    }
                }
            }
            // A politician the political simulation invented: they are not in
            // any roster, they are in an assembly.
            const found = window.NPCPolitics && window.NPCPolitics.findPolitician
                ? window.NPCPolitics.findPolitician(name) : null;
            if (found && found.pol) {
                const pol = found.pol;
                return {
                    name: pol.name,
                    ideology: '',
                    ideologyKey: null,
                    country: (found.power && found.power.homeNation) || null,
                    years: null,
                    of: (found.power && found.power.name) || null,
                    office: pol.office || null,
                    politician: pol,
                    procedural: true,
                };
            }
            return null;
        }

        // The record any leader reads by: the book first, the world's own
        // rosters and assemblies second.
        function recordFor(name) {
            return manager.getLeaderRecord(name) || rosterRecord(name);
        }

        function className(classId) {
            const cls = (typeof $dataClasses !== 'undefined' && $dataClasses) ? $dataClasses[classId] : null;
            return (cls && cls.name) || '';
        }

        // -- A leader as a character -----------------------------------------
        //
        // An officeholder used to be five bars (charisma, integrity, cunning,
        // ambition, approval) and nothing else, which is a spreadsheet, not a
        // person. Every leader and every politician now carries the same sheet
        // a party member does: a class, a level, the eight parameters read off
        // that class's own growth curve, the skills that class knows by that
        // level, the traits they are read by and the gear they are dressed in.
        //
        // Nothing is stored: it is derived from the world seed and the name, so
        // a leader is the same person in every savegame of a world and a
        // different one between worlds, exactly like the rest of the sim.

        // The seven political statistics. A politician the assembly invented
        // already has them; a leader out of a roster is given the same seven,
        // rolled off their own seed and pulled toward what their record says
        // they are, so both kinds read on the same scale.
        function politicalStatsOf(record) {
            if (record && record.politician) {
                const pol = record.politician;
                return {
                    charisma: pol.charisma, integrity: pol.integrity, cunning: pol.cunning,
                    ambition: pol.ambition, strength: pol.strength, intellect: pol.intellect,
                    divinity: pol.divinity, approval: pol.approval,
                };
            }
            const seed = seedOf(record && record.name);
            const hay = haystackOf(record || {});
            const roll = (step, lo, hi) => Math.round(lo + rollFrom(seed, step) * (hi - lo));
            const bump = (base, re, by) => Math.max(1, Math.min(100, base + (re.test(hay) ? by : 0)));
            return {
                charisma:  bump(roll(20, 25, 90), /populist|orator|charism|media|showman|democrat|king|queen|emperor/i, 15),
                integrity: bump(roll(21, 10, 90), /honest|pacifist|humanit|reform|ascet|monk/i, 20),
                cunning:   bump(roll(22, 15, 90), /machiavell|espionage|junta|shadow|smuggl|assassin|dictator/i, 20),
                ambition:  bump(roll(23, 20, 95), /expansion|imperial|conquer|absolut|ambition|restorat|khan/i, 15),
                strength:  bump(roll(24,  8, 85), /marshal|general|admiral|commander|militar|warlord|barbar|khan/i, 20),
                intellect: bump(roll(25, 15, 90), /scien|technocra|philosoph|sage|archmage|academ|analyz|scholar/i, 20),
                divinity:  bump(roll(26,  1, 70), /pope|pontif|priest|clerical|theocra|holy|lama|god|divin|magus|arcane/i, 30),
                approval:  roll(27, 25, 85),
            };
        }

        // How far along a leader is. Time in office is the bulk of it: a
        // thirty year reign is a life spent at this, and the sheet says so.
        function levelOf(record) {
            const seed = seedOf(record && record.name);
            const reign = reignLength(record || {});
            const born = birthDateOf(record || {});
            const bornYear = born ? Number(String(born).slice(0, 4)) : null;
            const start = record && record.years && Number(record.years[0]);
            const age = (Number.isFinite(bornYear) && Number.isFinite(start)) ? (start - bornYear) : 45;
            const raw = 8 + reign * 0.85 + (age - 30) * 0.30 + rollFrom(seed, 30) * 12;
            return Math.max(1, Math.min(99, Math.round(raw)));
        }

        // The eight parameters, off the class's own growth curve at that level
        // and then bent by who the person is: a cunning leader is quicker, a
        // devout one carries more magic, a soldier hits harder. The curve is
        // the one $dataClasses holds, which is the curve a party member's
        // status screen is drawn from, so the two sheets are comparable.
        const PARAM_BIAS = [
            ['strength',  0.6],   // MHP
            ['divinity',  0.9],   // MMP
            ['strength',  0.9],   // ATK
            ['integrity', 0.7],   // DEF
            ['intellect', 0.9],   // MAT
            ['divinity',  0.7],   // MDF
            ['cunning',   0.8],   // AGI
            ['charisma',  0.8],   // LUK
        ];

        function paramsOf(classId, level, stats) {
            const cls = (typeof $dataClasses !== 'undefined' && $dataClasses) ? $dataClasses[classId] : null;
            if (!cls || !cls.params) return null;
            const lv = Math.max(1, Math.min(99, level));
            return PARAM_BIAS.map(function (bias, i) {
                const curve = cls.params[i];
                const base = Array.isArray(curve) ? (curve[lv] !== undefined ? curve[lv] : curve[curve.length - 1] || 0) : 0;
                const stat = Math.max(0, Math.min(100, Number(stats && stats[bias[0]]) || 50));
                // 50 is neutral: the curve as written. The bias never doubles
                // or halves a parameter, it colours it.
                const factor = 1 + ((stat - 50) / 100) * bias[1];
                return Math.max(1, Math.round(base * factor));
            });
        }

        // Everything that class knows by that level. This is the class's own
        // learning table, so a leader's skill list is the list a party member
        // of the same vocation and level would have.
        function skillsOf(classId, level) {
            const cls = (typeof $dataClasses !== 'undefined' && $dataClasses) ? $dataClasses[classId] : null;
            if (!cls || !Array.isArray(cls.learnings)) return [];
            const out = [];
            for (const learning of cls.learnings) {
                if (!learning || learning.level > level) continue;
                if (out.indexOf(learning.skillId) < 0) out.push(learning.skillId);
            }
            return out;
        }

        // What a class is allowed to hold and wear, read off its own equip
        // traits (51 = weapon type, 52 = armor type), which is the same answer
        // the equip screen gives a party member of that class.
        function equipTypesOf(classId) {
            const cls = (typeof $dataClasses !== 'undefined' && $dataClasses) ? $dataClasses[classId] : null;
            const wtypes = [], atypes = [];
            for (const trait of ((cls && cls.traits) || [])) {
                if (trait.code === 51) wtypes.push(trait.dataId);
                else if (trait.code === 52) atypes.push(trait.dataId);
            }
            return { wtypes, atypes };
        }

        // The gear an officeholder of that standing would actually be carrying:
        // one weapon and one piece per armour slot, picked from what the class
        // may equip, in the price band their level earns, seeded by the name.
        function equipmentOf(record, classId, level) {
            if (typeof $dataWeapons === 'undefined' || !$dataWeapons) return null;
            const seed = seedOf(record && record.name);
            const types = equipTypesOf(classId);
            const cap = 500 + level * 900;   // what this rank can afford
            const pick = function (list, step) {
                if (!list.length) return null;
                const affordable = list.filter(e => (e.price || 0) <= cap);
                const pool = (affordable.length ? affordable : list).slice();
                // The best quarter of what they can afford, so rank shows
                // without the same three items turning up on everybody.
                pool.sort((a, b) => (b.price || 0) - (a.price || 0));
                const top = pool.slice(0, Math.max(1, Math.ceil(pool.length * 0.25)));
                return top[Math.floor(rollFrom(seed, step) * top.length)] || null;
            };
            const weapon = pick(
                $dataWeapons.filter(w => w && w.name && types.wtypes.indexOf(w.wtypeId) >= 0), 40);
            const armorIds = [];
            for (let etype = 2; etype <= 5; etype++) {
                const found = pick(($dataArmors || []).filter(
                    a => a && a.name && a.etypeId === etype && types.atypes.indexOf(a.atypeId) >= 0), 40 + etype);
                if (found) armorIds.push(found.id);
            }
            return { weaponId: weapon ? weapon.id : 0, armorIds: armorIds };
        }

        // -- A whole life, not a span of years -------------------------------
        //
        // "1948 - 2012" is a database row. A procedural leader now gets the
        // life those two numbers imply: born somewhere, schooled, given a
        // calling, seated, and then walked through whatever their politics
        // were always going to walk them into, down to the grave. Every beat
        // is keyed (History.leaderLife.*) so it is read in the language of
        // whoever opens the article, and every beat is a roll off the world
        // seed and the person's own name, so it is the same life in every
        // savegame of a world and a different one in the next world.
        const LIFE_BEATS = [
            { key: 'war',        test: /marshal|general|admiral|commander|militar|warlord|khan|junta/i },
            { key: 'reform',     test: /reform|democrat|social|liberal|progress|labour/i },
            { key: 'scandal',    test: /machiavell|corrupt|junta|dictator|absolut|infam/i },
            { key: 'exile',      test: /revolution|anarch|heret|dissident|opposition/i },
            { key: 'pilgrimage', test: /pope|pontif|priest|clerical|theocra|holy|lama|monk/i },
            { key: 'discovery',  test: /scien|technocra|archmage|magus|arcane|academ|research/i },
            { key: 'fortune',    test: /capital|corporat|petro|tycoon|banker|merchant/i },
            { key: 'purge',      test: /purge|single_party|absolut|authoritar|juche/i },
            { key: 'treaty',     test: /diploma|envoy|ambassador|accord|peace|onu/i },
            { key: 'uprising',   test: /populist|nationalist|militant|front|liberation/i },
        ];
        // The beats any life has room for, whatever the person believed.
        const COMMON_BEATS = ['marriage', 'child', 'illness', 'rival', 'journey', 'betrayal', 'honour'];

        function lifeOf(record) {
            if (!record) return [];
            const seed = seedOf(record.name);
            const hay = haystackOf(record);
            const born = birthDateOf(record);
            const bornYear = born ? Number(String(born).slice(0, 4)) : null;
            const years = record.years || [];
            const start = Number(years[0]);
            const end = Number(years[1]);
            const place = record.hometown || record.country || null;
            const name = record.name;
            const out = [];
            const push = function (year, key, params) {
                if (!Number.isFinite(year)) return;
                out.push({ year: year, key: 'History.leaderLife.' + key, params: params || {} });
            };

            if (Number.isFinite(bornYear)) {
                push(bornYear, place ? 'born' : 'bornNowhere',
                     { name: name, place: place || '', date: born });
                push(bornYear + 6 + Math.floor(rollFrom(seed, 50) * 4), 'schooled', { name: name });
                push(bornYear + 17 + Math.floor(rollFrom(seed, 51) * 6), 'calling',
                     { name: name, vocation: className(vocationOf(record)) });
            }
            if (Number.isFinite(start)) {
                push(start, 'seated', { name: name, body: record.of || record.country || '' });
            }

            // The middle of a life: the beats their politics were walking them
            // toward, then whatever else fits in the years they had.
            const span = (Number.isFinite(start) && Number.isFinite(end) && end > start) ? end - start : 12;
            const room = Math.max(2, Math.min(7, Math.round(span / 6) + 2));
            const pool = LIFE_BEATS.filter(b => b.test.test(hay)).map(b => b.key).concat(COMMON_BEATS);
            const used = {};
            for (let i = 0; i < room; i++) {
                const key = pool[Math.floor(rollFrom(seed, 60 + i) * pool.length)];
                if (!key || used[key]) continue;
                used[key] = true;
                const at = Number.isFinite(start)
                    ? start + Math.floor(rollFrom(seed, 80 + i) * Math.max(1, span))
                    : NaN;
                push(at, key, { name: name });
            }

            const deaths = manager.getLeaderDeaths ? (manager.getLeaderDeaths() || {}) : {};
            const death = deaths[record.name];
            if (death && death.date) {
                push(Number(String(death.date).slice(0, 4)), 'died',
                     { name: name, cause: death.cause || '', date: death.date });
            } else if (Number.isFinite(end)) {
                push(end, 'leftOffice', { name: name });
            }
            return out.sort((a, b) => a.year - b.year);
        }

        const CACHE = {};

        window.LeaderPersona = {
            // Whether this name is somebody the book knows, which is what the
            // wiki tests before offering to open a person's panel on them.
            isLeader(name) { return !!recordFor(name); },

            // Whether the BOOK wrote this person down. The wiki splits its
            // cast on exactly this: written-down people are Main Players, the
            // rest are the procedural Leaders the world seated for itself.
            isBookLeader(name) { return !!manager.getLeaderRecord(name); },

            // The record behind a leader, book or roster, for anything that
            // needs to ask what this world says about them.
            recordFor(name) { return recordFor(name); },

            // Nothing here survives a save: it is all derived, and the pieces
            // it derives from (the party, the retired list) change under it.
            invalidate() { for (const k of Object.keys(CACHE)) delete CACHE[k]; },

            // The dossier for a leader, shaped like a CharacterCreationPresets
            // entry so the Empathize panel can draw it with no special case,
            // plus `source` (where the sheet came from) and `level`.
            // Returns null for a name the book does not hold.
            dossierFor(name) {
                // The book first, then whatever roster this world seated them
                // from: a procedural leader has a dossier too (rosterRecord).
                const record = recordFor(name);
                if (!record) return null;
                const key = String(name);

                // Only the derived half is cached: it is a fair amount of
                // regex work per leader and it never changes for a world. What
                // this world has since made of the person is read fresh every
                // time, because they can join the party (or leave it) between
                // two openings of the same article.
                if (!CACHE[key]) {
                    const preset = presetFor(record);
                    CACHE[key] = preset
                        ? Object.assign({}, preset, { source: 'preset' })
                        : {
                            name: record.name,
                            characterType: 'humanoid',
                            classId: vocationOf(record),
                            sprite: record.sprite || null,
                            spriteIndex: record.spriteIndex || 0,
                            nationId: record.country || null,
                            hometown: record.hometown || null,
                            birthDate: birthDateOf(record),
                            gender: genderOf(record),
                            sexualOrientation: record.sexualOrientation || null,
                            romanticOrientation: record.romanticOrientation || null,
                            money: wealthOf(record),
                            items: [], weapons: [], armors: [],
                            skills: [],
                            traits: traitsOf(record),
                            specializations: specsOf(record),
                            busts: null,
                            lore: loreOf(record),
                            source: 'synthetic',
                          };
                }

                const base = Object.assign({}, CACHE[key]);
                base.leaderId = record.id;
                base.level = 1;
                base.record = record;
                // Whether this is a person who actually lived. Everything the
                // book writes down about a real one (the town, the day, who
                // they were drawn to) is theirs; a fictional leader's sheet is
                // still rolled out of the world seed.
                base.real = record.real === true;
                // The same person is sometimes also a dossier the player can
                // take into the party. That is worth saying wherever they are
                // read, not only while nobody has taken them: the flag stands
                // whether the dossier is sitting unplayed, travelling with the
                // player or benched.
                base.isPresetCharacter = !!(record.preset || presetFor(record));
                // A dossier is the more curated answer and wins on every field
                // it fills in, but the book still knows things it does not.
                if (!base.hometown && record.hometown) base.hometown = record.hometown;
                if (!base.sexualOrientation && record.sexualOrientation) {
                    base.sexualOrientation = record.sexualOrientation;
                }
                if (!base.romanticOrientation && record.romanticOrientation) {
                    base.romanticOrientation = record.romanticOrientation;
                }

                // What this world has already made of them, newest state first.
                const actor = livingActor(record.name);
                if (actor) {
                    Object.assign(base, fromActor(actor));
                    base.source = 'party';
                    base.actorId = actor.actorId();
                } else {
                    const retired = worldList('_retiredCharacterPresets')
                        .find(p => p && p.name === record.name);
                    if (retired) {
                        Object.assign(base, retired);
                        base.source = 'retired';
                        base.level = retired.level || 1;
                    } else {
                        const past = worldList('_npcPastPartyMembers')
                            .find(p => p && p.name === record.name);
                        if (past) {
                            base.source = 'past';
                            base.level = past.level || 1;
                            if (past.classId) base.classId = past.classId;
                            base.departure = past;
                        }
                    }
                }

                // The face. Where this world has made something of them, the
                // portrait they are actually wearing wins: a dossier can be
                // played in an alternate look, and the article must show the
                // face the panel it opens will show. Otherwise it is the book's
                // own portrait, which is the only one such a leader has.
                const own = (base.source === 'party' || base.source === 'retired') ? base.busts : null;
                const bust = own || manager.leaderBust(record.name) || base.busts;
                if (bust) {
                    // Whatever the dossier names, the article gets a picture it
                    // can actually load: an unresolvable portrait becomes the
                    // house bust rather than a broken frame.
                    base.bustPath = window.BustPath
                        ? window.BustPath.url(bust, 'img/busts/7.png')
                        : (/^img\//.test(String(bust)) ? bust : `img/busts/${bust}.png`);
                }

                return base;
            },

            // The identity overrides a society profile takes on when the person
            // it is being minted for turns out to be a world leader, so the
            // simulated character agrees with the article about them.
            // NPCSociety asks this for every profile it generates.
            identityFor(name) {
                const d = this.dossierFor(name);
                if (!d) return null;
                const out = { assignedClassId: d.classId };
                if (d.gender !== undefined && d.gender !== null) out.gender = d.gender;
                if (d.birthDate) {
                    const year = Number(String(d.birthDate).slice(0, 4));
                    if (Number.isFinite(year)) out.birthYear = year;
                }
                // Who they were drawn to, where the record says so at all. The
                // Romance tab rolls it for everybody else, and for a leader the
                // record is silent about it goes on rolling.
                if (d.sexualOrientation) out.sexualKey = d.sexualOrientation;
                if (d.romanticOrientation) out.romanticKey = d.romanticOrientation;
                // The town is the more precise birthplace, so it wins over the
                // nation: Mussolini was born in Predappio, not in "Italy".
                if (d.hometown) out.birthplace = d.hometown;
                else if (d.nationId) out.birthplace = d.nationId;
                if (d.isPresetCharacter) out.isPresetCharacter = true;
                return out;
            },

            // The character sheet behind the office: class, level, the eight
            // parameters, the class's skills at that level, the traits they
            // are read by and what they are carrying. Null for a name this
            // world holds no record for.
            characterSheetFor(name) {
                const record = recordFor(name);
                if (!record) return null;
                const key = 'sheet:' + String(name);
                if (CACHE[key]) return CACHE[key];
                // A leader the player has actually played is read off their
                // own dossier: that is who they became, not who they were
                // rolled as. Everybody else is derived.
                const dossier = this.dossierFor(name) || {};
                const classId = dossier.classId || vocationOf(record);
                const level = dossier.level > 1 ? dossier.level : levelOf(record);
                const stats = politicalStatsOf(record);
                const sheet = {
                    name: record.name,
                    classId: classId,
                    className: className(classId),
                    level: level,
                    stats: stats,
                    params: paramsOf(classId, level, stats),
                    skills: (dossier.skills && dossier.skills.length)
                        ? dossier.skills : skillsOf(classId, level),
                    traits: dossier.traits || traitsOf(record),
                    specializations: dossier.specializations || specsOf(record),
                    equipment: equipmentOf(record, classId, level),
                    procedural: record.procedural === true,
                };
                CACHE[key] = sheet;
                return sheet;
            },

            // The whole life, oldest beat first. Read from the world's own
            // baked copy where there is one (bakeLives, run once when a world
            // is created), derived on the spot otherwise so a world made
            // before this existed still reads.
            lifeFor(name) {
                const baked = manager.bakedLife ? manager.bakedLife(name) : null;
                if (baked) return baked;
                const record = recordFor(name);
                return record ? lifeOf(record) : [];
            },

            // Every procedural leader this world seated: the roll the wiki
            // files under Leaders, as opposed to the book's Main Players.
            listProceduralNames() {
                const names = [];
                const seen = {};
                const add = function (group, field) {
                    for (const data of Object.values(group || {})) {
                        for (const entry of ((data && data[field]) || [])) {
                            if (!entry || !entry.name || seen[entry.name]) continue;
                            if (manager.getLeaderRecord(entry.name)) continue;
                            seen[entry.name] = true;
                            names.push(entry.name);
                        }
                    }
                };
                add(manager.getHyperpowers ? manager.getHyperpowers() : {}, 'leaders');
                add(manager.getHyperpowers ? manager.getHyperpowers() : {}, 'holy_leaders');
                add(manager.getHistoricalFactions ? manager.getHistoricalFactions() : {}, 'leaders');
                return names;
            },

            // Runs a whole life for every procedural leader in the world and
            // writes them into the world folder, once, when the world is made.
            // Nothing NEEDS this file - lifeFor derives the same beats on
            // demand - but a world that was simulated keeps its people's lives
            // with the rest of its history instead of re-deriving them on
            // every reader's machine.
            bakeLives() {
                const WM = window.WorldManager;
                if (!WM || !WM.activeWorldName) return 0;
                const lives = {};
                let count = 0;
                for (const name of this.listProceduralNames()) {
                    const record = recordFor(name);
                    if (!record) continue;
                    lives[name] = lifeOf(record);
                    count++;
                }
                WM.setField('history', 'leaderLives', lives);
                return count;
            },
        };
    })();

    //=========================================================================
    // What drives the living chronicle
    //=========================================================================
    //
    // Every way time passes in this game ends up on one of these two: walking
    // and waiting cross an hour, and everything that jumps the clock (sleep,
    // a shift at work, fast travel, the cryogenic pod) ends on a map load or
    // is caught up by its own sequence. The engine is a delta pass, so being
    // called twice for the same day costs nothing.
    (function driveLiveHistory() {
        if (typeof Scene_Map === "undefined") return;

        const _Scene_Map_onMapLoaded_history = Scene_Map.prototype.onMapLoaded;
        Scene_Map.prototype.onMapLoaded = function () {
            _Scene_Map_onMapLoaded_history.call(this);
            try {
                if ($gameVariables) manager.catchUpLiveHistory($gameVariables.value(114) || 0);
            } catch (e) { console.warn("[HistorySimulator]", e); }
        };

        const _Scene_Map_update_history = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function () {
            _Scene_Map_update_history.call(this);
            if (!$gameVariables) return;
            const minute = $gameVariables.value(114) || 0;
            const day = liveDayOf(minute);
            if (this._historyLastDay === day) return;
            this._historyLastDay = day;
            try { manager.catchUpLiveHistory(minute); } catch (e) { console.warn("[HistorySimulator]", e); }
        };
    })();
    window.HistorySimulator_COUNTRIES = COUNTRIES;
    window.HistorySimulator_ICONS     = ICONS;

    // Proper nouns that must stay capitalized wherever history text is reflowed
    // (e.g. NPC bio generation): country names, hyperpower/controller names,
    // faction names, and every leader / holy-leader name.
    (function exportProperNouns() {
        const nouns = new Set();
        for (const [country, info] of Object.entries(COUNTRIES)) {
            nouns.add(country);
            if (info.controller && info.controller !== 'Neutral') nouns.add(info.controller);  // i18n-ignore  controller id
        }
        const addLeaders = (group) => {
            for (const data of Object.values(group)) {
                (data.leaders || []).forEach(l => l && l.name && nouns.add(l.name));
                (data.holy_leaders || []).forEach(l => l && l.name && nouns.add(l.name));
            }
        };
        for (const name of Object.keys(HYPERPOWERS)) nouns.add(name);
        for (const name of Object.keys(FACTIONS)) nouns.add(name);
        addLeaders(HYPERPOWERS);
        addLeaders(FACTIONS);
        nouns.delete('Neutral');  // i18n-ignore  controller id
        nouns.delete('Unknown Leader');  // i18n-ignore  placeholder leader id
        window.HistorySimulator_PROPER_NOUNS = Array.from(nouns).filter(Boolean);
    })();

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    PluginManager.registerCommand(pluginName, "runSimulation", async args => {
        const years = args.years ? Number(args.years) : null;
        if (FactionDataManager.instance && FactionDataManager.instance._readyPromise) {
            await FactionDataManager.instance._readyPromise;
        }
        manager.runSimulation(years);
    });

    PluginManager.registerCommand(pluginName, "getHistoricalFact", args => {
        const varId = Number(args.variableId);
        const year = Number(args.year);
        const fact = manager.getHistoricalFact(year);
        $gameVariables.setValue(varId, fact);
    });

    PluginManager.registerCommand(pluginName, "showHistoryLog", args => {
        SceneManager.push(window.Scene_History);
    });

    //=============================================================================
    // Integration with Game System
    //=============================================================================

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        _DataManager_setupNewGame.call(this);
        if (AUTO_RUN) {
            // manager.runSimulation();
            console.log("[HistorySimulator] Auto-run delayed. Call 'Run Simulation' plugin command when ready.");
        }
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._generatedArtifacts) {
            manager.injectArtifacts($gameSystem._generatedArtifacts);
        }
    };

    // World initialization step: the century has to exist before anything else
    // a world owns, since the seed it fixes is what every other generator
    // derives from. Runs first (order 0) and is a no-op when the world screen
    // (or the boot hook below) already simulated it.
    if (window.WorldManager && window.WorldManager.registerWorldInitializer) {
        window.WorldManager.registerWorldInitializer("history", 0, () => {
            const info = window.WorldManager.worldInfo();
            if (info.historyInitialized) { manager.migrateKeyedHistory(); return; }
            manager.initializeWorldHistory({ years: info.historyYears || null, seed: info.seed });
        });
    }

    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        if (!this._historySimulatorArtifactsGenerated) {
            this._historySimulatorArtifactsGenerated = true;
            const WM = window.WorldManager;
            if (WM && WM.activeWorldName) {
                const info = WM.worldInfo();
                if (!info.historyInitialized) {
                    // A world folder that exists but never got a timeline (an
                    // older install, or a run interrupted mid-creation):
                    // generate its history now.
                    manager.initializeWorldHistory({ years: null, seed: info.seed });
                } else {
                    manager.migrateKeyedHistory();
                    const generated = WM.getField("artifacts", "generated");
                    if (generated) {
                        manager.injectArtifacts(generated);
                    } else {
                        manager.generateArtifacts();
                        WM.flush();
                    }
                }
            } else {
                // No world active: generate canon artifacts so they are
                // available in sandbox sessions without a simulation run.
                const tempSeed = manager._seed;
                manager._seed = 19002001; // Canon seed
                manager.generateArtifacts();
                manager._seed = tempSeed;
            }
        }
        return true;
    };

})();
