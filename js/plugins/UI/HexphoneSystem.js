//=============================================================================
// HexphoneSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v3.0.0] Anoki-Style Hexphone: Credits, Calls, Messages, Games
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help HexphoneSystem.js
 *
 * v3.0.0 - Full rework.
 * - Fixed game shutdown when closing the phone (buttons were created twice,
 *   so one click fired two handlers and END popped the scene stack twice,
 *   which triggered SceneManager.exit()).
 * - Parameters and plugin commands now resolve under the real file name
 *   (HexphoneSystem); legacy events using "AnokiHexphoneSystem" keep working.
 * - Full keyboard/controller support (arrows, ok, cancel, digit keys).
 * - Calling a contact now triggers its Common Event on the map.
 * - Incoming calls (receiveCall command) with answer/decline.
 * - Built-in working minigames: Snake and Bitstack (LCD style).
 * - External minigames can register via window.registerHexphoneGame.
 * - Scene_AnokiPhone is exported globally for extension plugins.
 *
 * Controls (phone open):
 *   Mouse/touch ....... all on-screen buttons
 *   0-9 * # ........... keypad (dialing and quick menu shortcuts)
 *   Arrow Up/Down ..... navigate lists
 *   Enter / Z ......... MENU button (select / call / open)
 *   Escape / X ........ END button (back, close from home screen)
 *   Backspace ......... delete digit while dialing
 *
 * @param menuText
 * @text Menu Option Text
 * @desc Text shown in the pause menu for the phone
 * @type string
 * @default Hexphone
 *
 * @param initialCredits
 * @text Initial Credits
 * @desc Starting phone credits for the player (gold units, 100 = 1 euro)
 * @type number
 * @min 0
 * @default 100
 *
 * @param callCostPerSecond
 * @text Call Cost Per Second
 * @desc Credits consumed per second during outgoing calls
 * @type number
 * @min 0
 * @default 5
 *
 * @param messageCost
 * @text Message Cost
 * @desc Credits consumed per message sent
 * @type number
 * @min 0
 * @default 5
 *
 * @param ringtones
 * @text Available Ringtones
 * @desc List of available ringtones
 * @type struct<Ringtone>[]
 * @default ["{\"name\":\"Anoki Tune\",\"se\":\"Decision1\",\"volume\":\"90\",\"pitch\":\"100\"}","{\"name\":\"Classic\",\"se\":\"Bell1\",\"volume\":\"90\",\"pitch\":\"100\"}"]
 *
 * @param contacts
 * @text Available Contacts
 * @desc Define your available contacts here
 * @type struct<Contact>[]
 * @default []
 *
 * @param games
 * @text Phone Games
 * @desc Extra mini-games launched through a common event. Snake and Bitstack are built in.
 * @type struct<PhoneGame>[]
 * @default []
 *
 * @command openPhone
 * @text Open Phone
 * @desc Opens the Anoki phone interface
 *
 * @command addCredits
 * @text Add Credits
 * @desc Add credits to the phone
 *
 * @arg amount
 * @text Amount
 * @desc Amount of credits to add
 * @type number
 * @min 0
 * @default 10
 *
 * @command removeCredits
 * @text Remove Credits
 * @desc Remove credits from the phone (clamped at 0)
 *
 * @arg amount
 * @text Amount
 * @desc Amount of credits to remove
 * @type number
 * @min 0
 * @default 10
 *
 * @command setCredits
 * @text Set Credits
 * @desc Set the phone credits to an exact value
 *
 * @arg amount
 * @text Amount
 * @desc New credit total
 * @type number
 * @min 0
 * @default 100
 *
 * @command registerContact
 * @text Register Contact
 * @desc Add a contact from the plugin parameter database
 *
 * @arg contactName
 * @text Contact Name
 * @desc Name of the contact to register
 * @type string
 * @default
 *
 * @command addContact
 * @text Add Custom Contact
 * @desc Add an arbitrary contact (not from the parameter database)
 *
 * @arg name
 * @text Name
 * @type string
 * @default
 *
 * @arg number
 * @text Phone Number
 * @desc Leave empty to auto-generate
 * @type string
 * @default
 *
 * @arg commonEventId
 * @text Common Event ID
 * @desc Common event run when this contact answers (0 = simulated call)
 * @type common_event
 * @default 0
 *
 * @command removeContact
 * @text Remove Contact
 * @desc Remove a contact from the phone
 *
 * @arg contactName
 * @text Contact Name
 * @desc Name of the contact to remove
 * @type string
 * @default
 *
 * @command receiveMessage
 * @text Receive Message
 * @desc Adds a new message to the phone inbox
 *
 * @arg sender
 * @text Sender
 * @desc Who the message is from
 * @type string
 * @default ???
 *
 * @arg content
 * @text Content
 * @desc The text content of the message
 * @type multiline_string
 * @default
 *
 * @command sendMessage
 * @text Send Message
 * @desc Sends a new message (costs credits)
 *
 * @arg recipient
 * @text Recipient
 * @desc Who the message is being sent to
 * @type string
 * @default ???
 *
 * @arg content
 * @text Content
 * @desc The text content of the message
 * @type multiline_string
 * @default
 *
 * @command clearMessages
 * @text Clear Messages
 * @desc Deletes every message in the inbox
 *
 * @command receiveCall
 * @text Receive Call
 * @desc Incoming call from a contact. Opens the phone in ringing mode when on the map.
 *
 * @arg contactName
 * @text Contact Name
 * @desc Contact database name. Its Common Event runs when the player answers.
 * @type string
 * @default
 *
 * @command addGame
 * @text Add Game
 * @desc Register a common-event based game on the phone
 *
 * @arg name
 * @text Game Name
 * @type string
 * @default
 *
 * @arg commonEventId
 * @text Common Event ID
 * @type common_event
 * @default 1
 */

/*~struct~Contact:
 * @param name
 * @text Contact Name
 * @desc Name of the contact
 * @type string
 * @default
 *
 * @param number
 * @text Phone Number
 * @desc Phone number (display only, auto-generated when empty)
 * @type string
 * @default
 *
 * @param commonEventId
 * @text Common Event ID
 * @desc Common event to run when this contact answers a call
 * @type common_event
 * @default 0
 */

/*~struct~Ringtone:
 * @param name
 * @text Ringtone Name
 * @desc Display name for the ringtone
 * @type string
 * @default
 *
 * @param se
 * @text Sound Effect
 * @desc Sound effect file for the ringtone
 * @type file
 * @dir audio/se/
 * @default Decision1
 *
 * @param volume
 * @text Volume
 * @desc Volume of the ringtone (0-100)
 * @type number
 * @min 0
 * @max 100
 * @default 90
 *
 * @param pitch
 * @text Pitch
 * @desc Pitch of the ringtone (50-150)
 * @type number
 * @min 50
 * @max 150
 * @default 100
 */

/*~struct~PhoneGame:
 * @param name
 * @text Game Name
 * @desc Name of the mini-game
 * @type string
 * @default
 *
 * @param commonEventId
 * @text Common Event ID
 * @desc Common event to launch the game
 * @type common_event
 * @default 1
 */

(() => {
    'use strict';

    // The file lives at js/plugins/UI/HexphoneSystem.js, so MZ keys parameters
    // and editor plugin commands to "HexphoneSystem". Existing events were
    // authored against the old "AnokiHexphoneSystem" name, so commands are
    // registered under every historical key.
    const pluginName = "HexphoneSystem";
    const commandKeys = ["HexphoneSystem", "UI/HexphoneSystem", "AnokiHexphoneSystem"];

    const parameters = (() => {
        for (const key of commandKeys) {
            const p = PluginManager.parameters(key);
            if (p && Object.keys(p).length > 0) return p;
        }
        return {};
    })();

    // Items whose possession unlocks the pause-menu command (any phone model)
    const requiredItemIds = [149, 153, 157, 160];

    //=============================================================================
    // Translations
    //=============================================================================

;

    // The phone's copy lives in js/i18n/<lang>/plugins/Hexphone.json. Call sites
    // still pass the original English label, which is slugged to the key here, so
    // adding a string means adding one JSON entry and nothing else.
    const _hexSlug = k => String(k).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        .split(/\s+/).map((w, i) => i ? w[0].toUpperCase() + w.slice(1) : w).join('');

    function getText(key) {
        const resolved = 'Hexphone.' + _hexSlug(key); // i18n-ignore: key prefix
        return T.has(resolved) ? T(resolved) : key;
    }

    //=============================================================================
    // Helpers
    //=============================================================================

    function goldToEuros(goldAmount) {
        return (goldAmount / 100).toFixed(2);
    }

    function safeParseArray(json) {
        try {
            const arr = JSON.parse(json || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function safeParseStruct(json) {
        try {
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    }

    // Deterministic display number for contacts defined without one
    function autoPhoneNumber(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        const digits = (Math.abs(hash) % 10000).toString().padStart(4, '0');
        return '555-' + digits;
    }

    // In-game clock driven by TimeDateSystem (Variable 114 = minutes since
    // 2001-01-01 10:00). Falls back to real time before the system starts.
    function currentGameDate() {
        const mins = $gameVariables ? $gameVariables.value(114) : 0;
        if (mins > 0) {
            const d = new Date(2001, 0, 1, 10, 0, 0);
            d.setMinutes(d.getMinutes() + mins);
            return d;
        }
        return new Date();
    }

    function formatClock(date) {
        return date.getHours().toString().padStart(2, '0') + ':' +
               date.getMinutes().toString().padStart(2, '0');
    }

    function formatStamp(date) {
        return date.getDate().toString().padStart(2, '0') + '/' +
               (date.getMonth() + 1).toString().padStart(2, '0') + ' ' +
               formatClock(date);
    }

    function notify(text) {
        if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
            window.ParchmentToast.show(text);
        } else if ($gameMessage && !$gameMessage.isBusy()) {
            $gameMessage.add(text);
        }
    }

    function playSeSafe(name, volume, pitch) {
        if (!name) return;
        AudioManager.playSe({ name: name, volume: volume || 90, pitch: pitch || 100, pan: 0 });
    }

    //=============================================================================
    // Parameter parsing
    //=============================================================================

    const menuText = T.param(parameters['menuText'], 'Hexphone.menuCommand');
    const initialCredits = Number(parameters['initialCredits']) || 100;
    const callCostPerSecond = Number(parameters['callCostPerSecond']) || 5;
    const messageCost = Number(parameters['messageCost']) || 5;

    const availableContacts = {};
    for (const contactJson of safeParseArray(parameters['contacts'])) {
        const contact = safeParseStruct(contactJson);
        if (!contact || !contact.name) continue;
        availableContacts[contact.name] = {
            name: contact.name,
            number: contact.number || autoPhoneNumber(contact.name),
            commonEventId: Number(contact.commonEventId) || 0
        };
    }

    const availableRingtones = [];
    for (const ringtoneJson of safeParseArray(parameters['ringtones'])) {
        const ringtone = safeParseStruct(ringtoneJson);
        if (!ringtone || !ringtone.se) continue;
        availableRingtones.push({
            name: ringtone.name || ringtone.se,
            se: ringtone.se,
            volume: Number(ringtone.volume) || 90,
            pitch: Number(ringtone.pitch) || 100
        });
    }
    if (availableRingtones.length === 0) {
        availableRingtones.push({ name: T('Hexphone.ringtoneDefault'), se: "Decision1", volume: 90, pitch: 100 });
    }

    //=============================================================================
    // Numbers that answer
    //
    // The handset can dial three kinds of number: the emergency services of the
    // nation the party is standing in, the public service lines, and everything
    // else, which rings out. Emergency numbers are the ones that were in use in
    // 2001, before the 112 harmonisation swallowed most of them, so which digits
    // work depends on where you are. 112 itself is always accepted: on a GSM
    // handset it reaches an operator anywhere on Earth.
    //=============================================================================

    // country name (as in js/db/WorldGen/Countries.json) -> [police, fire, medical]
    const EMERGENCY_BY_COUNTRY = {
        'Albania': ['129', '128', '127'],
        'Andorra': ['110', '118', '116'],
        'Armenia': ['02', '01', '03'],
        'Austria': ['133', '122', '144'],
        'Azerbaijan': ['02', '01', '03'],
        'Belarus': ['02', '01', '03'],
        'Belgium': ['101', '100', '100'],
        'Bosnia and Herzegovina': ['122', '123', '124'],
        'Bulgaria': ['166', '160', '150'],
        'Croatia': ['92', '93', '94'],
        'Cyprus': ['199', '199', '199'],
        'Czech Republic': ['158', '150', '155'],
        'Denmark': ['112', '112', '112'],
        'Estonia': ['110', '112', '112'],
        'Finland': ['112', '112', '112'],
        'France': ['17', '18', '15'],
        'Georgia': ['02', '01', '03'],
        'Germany': ['110', '112', '112'],
        'Greece': ['100', '199', '166'],
        'Greenland': ['112', '112', '112'],
        'Hungary': ['107', '105', '104'],
        'Iceland': ['112', '112', '112'],
        'Ireland': ['999', '999', '999'],
        'Italy': ['113', '115', '118'],
        'Italy - Sicily': ['113', '115', '118'],
        'Italy - Sardinia': ['113', '115', '118'],
        'Latvia': ['02', '01', '03'],
        'Luxembourg': ['113', '112', '112'],
        'Malta': ['191', '199', '196'],
        'Moldova': ['902', '901', '903'],
        'Monaco': ['17', '18', '15'],
        'Montenegro': ['92', '93', '94'],
        'Netherlands': ['112', '112', '112'],
        'North Macedonia': ['92', '93', '94'],
        'Norway': ['112', '110', '113'],
        'Poland': ['997', '998', '999'],
        'Portugal': ['112', '112', '112'],
        'Romania': ['955', '981', '961'],
        'Russia': ['02', '01', '03'],
        'San Marino': ['113', '115', '118'],
        'Scotland': ['999', '999', '999'],
        'Serbia': ['92', '93', '94'],
        'Slovakia': ['158', '150', '155'],
        'Slovenia': ['113', '112', '112'],
        'Spain': ['091', '080', '061'],
        'Sweden': ['112', '112', '112'],
        'Switzerland': ['117', '118', '144'],
        'UK': ['999', '999', '999'],
        'Ukraine': ['02', '01', '03'],
        // Africa and the Middle East
        'Algeria': ['17', '14', '14'],
        'Egypt': ['122', '180', '123'],
        'Iran': ['110', '125', '115'],
        'Iraq': ['104', '115', '122'],
        'Israel': ['100', '102', '101'],
        'Jordan': ['191', '199', '193'],
        'Kuwait': ['777', '777', '777'],
        'Lebanon': ['112', '175', '140'],
        'Mauritania': ['117', '118', '101'],
        'Morocco': ['19', '15', '15'],
        'Oman': ['999', '999', '999'],
        'Palestine': ['100', '102', '101'],
        'Qatar': ['999', '999', '999'],
        'Bahrain': ['999', '999', '999'],
        'Saudi Arabia': ['999', '998', '997'],
        'Syria': ['112', '113', '110'],
        'Tunisia': ['197', '198', '190'],
        'Turkey': ['155', '110', '112'],
        'United Arab Emirates': ['999', '997', '998'],
        'Yemen': ['194', '191', '191'],
        // Asia and Oceania
        'Afghanistan': ['119', '119', '102'],
        'Australia': ['000', '000', '000'],
        'Bangladesh': ['100', '199', '199'],
        'Bhutan': ['113', '110', '112'],
        'Brunei': ['993', '995', '991'],
        'Cambodia': ['117', '118', '119'],
        'China': ['110', '119', '120'],
        'India': ['100', '101', '102'],
        'Indonesia': ['110', '113', '118'],
        'Japan': ['110', '119', '119'],
        'Kazakhstan': ['02', '01', '03'],
        'Kyrgyzstan': ['02', '01', '03'],
        'Laos': ['191', '190', '195'],
        'Malaysia': ['999', '994', '999'],
        'Mongolia': ['102', '101', '103'],
        'Myanmar': ['199', '191', '192'],
        'Nepal': ['100', '101', '102'],
        'North Korea': ['119', '119', '119'],
        'Pakistan': ['15', '16', '115'],
        'Philippines': ['117', '117', '117'],
        'Singapore': ['999', '995', '995'],
        'South Korea': ['112', '119', '119'],
        'Sri Lanka': ['119', '110', '110'],
        'Taiwan': ['110', '119', '119'],
        'Tajikistan': ['02', '01', '03'],
        'Thailand': ['191', '199', '1669'],
        'Turkmenistan': ['02', '01', '03'],
        'Uzbekistan': ['02', '01', '03'],
        'Vietnam': ['113', '114', '115'],
        // The Americas
        'Argentina': ['101', '100', '107'],
        'Bolivia': ['110', '119', '118'],
        'Brazil': ['190', '193', '192'],
        'Canada': ['911', '911', '911'],
        'Cascadia Protectorate': ['911', '911', '911'],
        'Chile': ['133', '132', '131'],
        'Colombia': ['112', '119', '125'],
        'Eastern Seaboard': ['911', '911', '911'],
        'Ecuador': ['101', '102', '131'],
        'Guyana': ['911', '911', '911'],
        'Mexico': ['060', '068', '065'],
        'Paraguay': ['911', '132', '141'],
        'Peru': ['105', '116', '117'],
        'Suriname': ['115', '110', '113'],
        'United States (Free States of Midwest)': ['911', '911', '911'],
        'Uruguay': ['109', '104', '105'],
        'Varlenia': ['911', '911', '911'],
        'Venezuela': ['171', '171', '171'],
        // The tower keeps its own switchboard
        'OmegaTower': ['1', '1', '1']
    };

    // Nations the table does not name still have a switchboard: 911 across the
    // Americas, 112 everywhere else, which is what a GSM handset falls back to.
    const REGION_EMERGENCY = {
        'North America': ['911', '911', '911'],
        'South America': ['911', '911', '911'],
        'Europe': ['112', '112', '112'],
        'Africa': ['112', '112', '112'],
        'Asia': ['112', '112', '112'],
        'Middle East': ['112', '112', '112'],
        'Oceania': ['112', '112', '112']
    };

    const GSM_UNIVERSAL = '112';

    function normalizeNumber(number) {
        return String(number || '').replace(/[^0-9*#+]/g, '');
    }

    const HexphoneDirectory = {
        // The record of the nation the party is standing in. WeatherSystem is
        // the one place that resolves a map to a country, so ask it first and
        // fall back to the nation id in variable 86.
        currentCountry() {
            const cc = (typeof $gameWeather !== 'undefined' && $gameWeather) ?
                $gameWeather.currentCountry : null;
            if (cc && cc.country) return cc;
            const list = (window.WorldGen && window.WorldGen.Countries) || [];
            const id = $gameVariables ? $gameVariables.value(86) : 0;
            return list.find(c => c.id === id) || null;
        },

        currentCountryName() {
            const cc = this.currentCountry();
            return (cc && cc.country) || '';
        },

        // [police, fire, medical] for wherever the party is.
        emergencyNumbers() {
            const cc = this.currentCountry();
            const name = (cc && cc.country) || '';
            const byName = EMERGENCY_BY_COUNTRY[name];
            if (byName) return byName.slice();
            const byRegion = REGION_EMERGENCY[(cc && cc.region) || ''];
            return (byRegion || [GSM_UNIVERSAL, GSM_UNIVERSAL, GSM_UNIVERSAL]).slice();
        },

        // What the Emergency contact dials: the local police number, since that
        // is the line a 2001 handset would have stored.
        primaryEmergencyNumber() {
            return this.emergencyNumbers()[0];
        },

        // Which service a dialled number reaches here, or null if it is not an
        // emergency number in this nation.
        serviceForNumber(number) {
            const dialled = normalizeNumber(number);
            if (!dialled) return null;
            if (dialled === GSM_UNIVERSAL) return 'general';
            const [police, fire, medical] = this.emergencyNumbers();
            if (dialled === police) return 'police';
            if (dialled === fire) return 'fire';
            if (dialled === medical) return 'medical';
            return null;
        },

        isEmergencyNumber(number) {
            return this.serviceForNumber(number) !== null;
        },

        // A number that is an emergency line somewhere else but not here: worth
        // its own recorded message rather than a dead line.
        isForeignEmergencyNumber(number) {
            const dialled = normalizeNumber(number);
            if (!dialled || this.isEmergencyNumber(dialled)) return false;
            for (const key of Object.keys(EMERGENCY_BY_COUNTRY)) {
                if (EMERGENCY_BY_COUNTRY[key].indexOf(dialled) >= 0) return true;
            }
            return false;
        },

        publicNumbers() {
            return PUBLIC_LINES.map(line => ({
                number: line.number,
                name: T(line.nameKey)
            }));
        },

        entryForNumber(number) {
            const dialled = normalizeNumber(number);
            return PUBLIC_LINES.find(line => line.number === dialled) || null;
        }
    };
    window.HexphoneDirectory = HexphoneDirectory;

    //=============================================================================
    // Call scripts
    //
    // A call is a little tree. Each node prints a few lines on the LCD and may
    // offer numbered options; picking one runs it and returns the next node, or
    // null to let the other end hang up.
    //=============================================================================

    function callNode(lines, options, extra) {
        return Object.assign({
            lines: [].concat(lines).filter(l => l !== null && l !== undefined && l !== ''),
            options: options || []
        }, extra || {});
    }

    function partyMembers() {
        return ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    }

    // Anyone bleeding, broken, dying or badly hurt counts as a casualty.
    function injuredMembers() {
        return partyMembers().filter(actor => {
            if (!actor) return false;
            if (actor.isDead() || actor.isDying()) return true;
            if (actor.isStateAffected && actor.isStateAffected(48)) return true;
            if (actor.mhp > 0 && actor.hp < actor.mhp * 0.9) return true;
            const HC = window.HealthCore;
            if (HC && typeof HC.partStates === 'function' && typeof HC.isPartBroken === 'function') {
                const parts = HC.partStates(actor) || {};
                for (const key of Object.keys(parts)) {
                    if (HC.isPartBroken(parts[key])) return true;
                }
            }
            return false;
        });
    }

    const AMBULANCE_CALLOUT = 2000;      // the callout itself, in gold (€20)
    const AMBULANCE_PER_CASUALTY = 1500; // per casualty carried (€15)
    const FALSE_CALL_BOUNTY = 1500;      // wasting an operator's time

    function ambulanceFee(casualties) {
        return AMBULANCE_CALLOUT + AMBULANCE_PER_CASUALTY * Math.max(1, casualties);
    }

    function treatParty() {
        const HC = window.HealthCore;
        for (const actor of partyMembers()) {
            if (!actor) continue;
            if (HC && typeof HC.restoreAllBodyParts === 'function') {
                HC.restoreAllBodyParts(actor);
            }
            actor.recoverAll();
        }
    }

    function currentBounty() {
        const CS = window.CrimeSystem;
        if (CS && typeof CS.getTotalBounty === 'function') return CS.getTotalBounty();
        return $gameVariables ? Number($gameVariables.value(66)) || 0 : 0;
    }

    function fileFalseCallCrime() {
        const CS = window.CrimeSystem;
        if (CS && typeof CS.addCrime === 'function') {
            CS.addCrime(T('Hexphone.emergency.falseCallCharge'), FALSE_CALL_BOUNTY);
        }
        if (CS && typeof CS.raiseHeat === 'function') CS.raiseHeat(15);
    }

    // The public lines: numbers that are printed in a directory rather than on
    // the back of an emergency card. Each answers with its own recorded voice.
    const PUBLIC_LINES = [
        {
            number: '161',
            nameKey: 'Hexphone.serviceLines.clock',
            free: false,
            answer() {
                const now = currentGameDate();
                return callNode([
                    T('Hexphone.serviceLines.clockIntro'),
                    formatClock(now),
                    T('Hexphone.serviceLines.clockDate').replace('%1', formatStamp(now))
                ], [], { autoEnd: true });
            }
        },
        {
            number: '197',
            nameKey: 'Hexphone.serviceLines.weather',
            free: false,
            answer() {
                const country = HexphoneDirectory.currentCountryName() ||
                    T('Hexphone.emergency.unknownNation');
                return callNode([
                    T('Hexphone.serviceLines.weatherIntro').replace('%1', country),
                    T('Hexphone.serviceLines.weatherBody')
                ], [], { autoEnd: true });
            }
        },
        {
            number: '4444',
            nameKey: 'Hexphone.serviceLines.anokiCare',
            free: true,
            answer() {
                return callNode([
                    T('Hexphone.serviceLines.anokiIntro'),
                    T('Hexphone.serviceLines.anokiBalance')
                        .replace('%1', goldToEuros($gameSystem.getPhoneCredits()))
                ], [], { autoEnd: true });
            }
        },
        {
            number: '1515',
            nameKey: 'Hexphone.serviceLines.tipLine',
            free: true,
            answer() {
                const bounty = currentBounty();
                if (bounty > 0) {
                    return callNode([
                        T('Hexphone.serviceLines.tipIntro'),
                        T('Hexphone.serviceLines.tipRecord').replace('%1', goldToEuros(bounty))
                    ], [], { autoEnd: true });
                }
                return callNode([
                    T('Hexphone.serviceLines.tipIntro'),
                    T('Hexphone.serviceLines.tipClean')
                ], [], { autoEnd: true });
            }
        },
        {
            number: '899899',
            nameKey: 'Hexphone.serviceLines.horoscope',
            free: false,
            answer() {
                const day = currentGameDate().getDate();
                const pool = T.pool('Hexphone.serviceLines.horoscopeLines');
                if (pool.length === 0) pool.push(T('Hexphone.serviceLines.horoscopeIntro'));
                return callNode([
                    T('Hexphone.serviceLines.horoscopeIntro'),
                    pool[day % pool.length]
                ], [], { autoEnd: true });
            }
        },
        {
            number: '5730',
            nameKey: 'Hexphone.serviceLines.taxi',
            free: false,
            answer() {
                return callNode([
                    T('Hexphone.serviceLines.taxiIntro'),
                    T('Hexphone.serviceLines.taxiBody')
                ], [], { autoEnd: true });
            }
        }
    ];

    //-------------------------------------------------------------------------
    // The emergency tree
    //-------------------------------------------------------------------------

    function emergencyRoot(service) {
        const numbers = HexphoneDirectory.emergencyNumbers();
        const nation = HexphoneDirectory.currentCountryName();
        const greeting = nation ?
            T('Hexphone.emergency.greetingNation').replace('%1', nation) :
            T('Hexphone.emergency.greeting');

        if (service === 'police') return policeNode(greeting);
        if (service === 'fire') return fireNode(greeting);
        if (service === 'medical') return medicalNode(greeting);

        // 112 and the like: one operator who asks which service you want.
        return callNode([greeting, T('Hexphone.emergency.whichService')], [
            { key: '1', label: T('Hexphone.emergency.optPolice'),
              run: () => policeNode(T('Hexphone.emergency.transferPolice')) },
            { key: '2', label: T('Hexphone.emergency.optFire'),
              run: () => fireNode(T('Hexphone.emergency.transferFire')) },
            { key: '3', label: T('Hexphone.emergency.optMedical'),
              run: () => medicalNode(T('Hexphone.emergency.transferMedical')) },
            { key: '4', label: T('Hexphone.emergency.optNothing'),
              run: () => prankNode() }
        ], { numbers: numbers });
    }

    function prankNode() {
        fileFalseCallCrime();
        return callNode([
            T('Hexphone.emergency.prankReply'),
            T('Hexphone.emergency.prankCharge')
        ], [], { autoEnd: true });
    }

    //-------------------------------------------------------------------------
    // Ambulance
    //-------------------------------------------------------------------------

    function medicalNode(intro) {
        const casualties = injuredMembers();
        if (casualties.length === 0) {
            return callNode([intro, T('Hexphone.emergency.medNoCasualty')], [
                { key: '1', label: T('Hexphone.emergency.optApologise'),
                  run: () => callNode(T('Hexphone.emergency.medApology'), [], { autoEnd: true }) },
                { key: '2', label: T('Hexphone.emergency.optInsist'),
                  run: () => prankNode() }
            ]);
        }

        const fee = ambulanceFee(casualties.length);
        const worst = casualties[0].name();
        return callNode([
            intro,
            T('Hexphone.emergency.medWho'),
            T('Hexphone.emergency.medCasualties')
                .replace('%1', String(casualties.length)).replace('%2', worst),
            T('Hexphone.emergency.medFee').replace('%1', goldToEuros(fee))
        ], [
            { key: '1', label: T('Hexphone.emergency.optSendAmbulance'),
              run: () => acceptAmbulance(fee, casualties.length) },
            { key: '2', label: T('Hexphone.emergency.optNoThanks'),
              run: () => callNode(T('Hexphone.emergency.medDeclined'), [], { autoEnd: true }) }
        ]);
    }

    function acceptAmbulance(fee, casualties) {
        if ($gameParty.gold() < fee) {
            return callNode([
                T('Hexphone.emergency.medNoMoney'),
                T('Hexphone.emergency.medNoMoneyBody')
            ], [], { autoEnd: true });
        }
        $gameParty.loseGold(fee);
        treatParty();
        return callNode([
            T('Hexphone.emergency.medOnTheWay'),
            T('Hexphone.emergency.medTreated').replace('%1', String(casualties))
        ], [], { autoEnd: true, treated: true });
    }

    //-------------------------------------------------------------------------
    // Police, and turning yourself in
    //-------------------------------------------------------------------------

    function policeNode(intro) {
        return callNode([intro, T('Hexphone.emergency.polWhat')], [
            { key: '1', label: T('Hexphone.emergency.optReportCrime'),
              run: () => callNode([
                  T('Hexphone.emergency.polReportTaken'),
                  T('Hexphone.emergency.polReportBody')
              ], [], { autoEnd: true }) },
            { key: '2', label: T('Hexphone.emergency.optSurrender'),
              run: () => surrenderNode() },
            { key: '3', label: T('Hexphone.emergency.optNothing'),
              run: () => prankNode() }
        ]);
    }

    function surrenderNode() {
        const bounty = currentBounty();
        if (bounty <= 0) {
            return callNode([
                T('Hexphone.emergency.polNothingOnRecord'),
                T('Hexphone.emergency.polNothingBody')
            ], [], { autoEnd: true });
        }
        return callNode([
            T('Hexphone.emergency.polRecordFound').replace('%1', goldToEuros(bounty)),
            T('Hexphone.emergency.polHowSettle')
        ], [
            { key: '1', label: T('Hexphone.emergency.optPayFine'), run: () => payFineNode(bounty) },
            { key: '2', label: T('Hexphone.emergency.optStandTrial'),
              run: scene => { scene.exitToTrial('startTrial'); return null; } },
            { key: '3', label: T('Hexphone.emergency.optGoToJail'),
              run: scene => { scene.exitToTrial('skipToJail'); return null; } },
            { key: '4', label: T('Hexphone.emergency.optChangedMind'),
              run: () => callNode(T('Hexphone.emergency.polChangedMind'), [], { autoEnd: true }) }
        ]);
    }

    function payFineNode(bounty) {
        if ($gameParty.gold() < bounty) {
            return callNode([
                T('Hexphone.emergency.polCannotPay'),
                T('Hexphone.emergency.polCannotPayBody')
            ], [
                { key: '1', label: T('Hexphone.emergency.optStandTrial'),
                  run: scene => { scene.exitToTrial('startTrial'); return null; } },
                { key: '2', label: T('Hexphone.emergency.optGoToJail'),
                  run: scene => { scene.exitToTrial('skipToJail'); return null; } }
            ]);
        }
        $gameParty.loseGold(bounty);
        const CS = window.CrimeSystem;
        if (CS && typeof CS.clearBounty === 'function') CS.clearBounty({ silent: true });
        else if ($gameVariables) $gameVariables.setValue(66, 0);
        return callNode([
            T('Hexphone.emergency.polPaid').replace('%1', goldToEuros(bounty)),
            T('Hexphone.emergency.polPaidBody')
        ], [], { autoEnd: true });
    }

    function fireNode(intro) {
        return callNode([intro, T('Hexphone.emergency.fireWhat')], [
            { key: '1', label: T('Hexphone.emergency.optRealFire'),
              run: () => callNode([
                  T('Hexphone.emergency.fireDispatched'),
                  T('Hexphone.emergency.fireStayClear')
              ], [], { autoEnd: true }) },
            { key: '2', label: T('Hexphone.emergency.optNothing'), run: () => prankNode() }
        ]);
    }

    // The root node for whatever was dialled, or null when the line is dead.
    function scriptForNumber(number) {
        const dialled = normalizeNumber(number);
        const service = HexphoneDirectory.serviceForNumber(dialled);
        if (service) {
            return { free: true, emergency: true, root: () => emergencyRoot(service) };
        }
        const line = HexphoneDirectory.entryForNumber(dialled);
        if (line) {
            return { free: !!line.free, root: () => line.answer() };
        }
        if (HexphoneDirectory.isForeignEmergencyNumber(dialled)) {
            const local = HexphoneDirectory.emergencyNumbers()[0];
            return {
                free: true,
                root: () => callNode([
                    T('Hexphone.emergency.wrongCountry'),
                    T('Hexphone.emergency.wrongCountryBody').replace('%1', local)
                ], [], { autoEnd: true })
            };
        }
        return null;
    }

    //=============================================================================
    // Game registry (module level; persists nothing, rebuilt each boot)
    //=============================================================================

    const phoneGames = [];        // [{name, commonEventId}]
    const inlineGames = {};       // name -> {create: () => session}

    function addPhoneGame(name, commonEventId) {
        if (!name) return;
        if (!phoneGames.find(g => g.name === name)) {
            phoneGames.push({ name: name, commonEventId: Number(commonEventId) || 0 });
        }
    }

    for (const gameJson of safeParseArray(parameters['games'])) {
        const game = safeParseStruct(gameJson);
        if (game && game.name) addPhoneGame(game.name, game.commonEventId);
    }

    // Public API for extension plugins. gameData may contain a `create()`
    // factory returning a session object with update(scene)/draw(bitmap)
    // methods for inline games, or a commonEventId for event-based games.
    window.registerHexphoneGame = function(gameName, gameData) {
        if (!gameName) return;
        addPhoneGame(gameName, gameData && gameData.commonEventId);
        if (gameData && typeof gameData.create === 'function') {
            inlineGames[gameName] = gameData;
        }
    };

    //=============================================================================
    // Game_System - persistent phone data
    //=============================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this.initializeAnokiPhone();
    };

    Game_System.prototype.initializeAnokiPhone = function() {
        this._phoneContacts = {};
        this._phoneCredits = initialCredits;
        this._phoneMessages = [];
        this._selectedRingtoneIndex = 0;
        this._callHistory = [];
    };

    // Legacy saves may predate some fields; call before touching phone data
    Game_System.prototype.ensureAnokiPhone = function() {
        if (this._phoneContacts === undefined) this._phoneContacts = {};
        if (this._phoneCredits === undefined) this._phoneCredits = initialCredits;
        if (!Array.isArray(this._phoneMessages)) this._phoneMessages = [];
        if (this._selectedRingtoneIndex === undefined) this._selectedRingtoneIndex = 0;
        if (!Array.isArray(this._callHistory)) this._callHistory = [];
    };

    Game_System.prototype.getPhoneCredits = function() {
        return this._phoneCredits || 0;
    };

    Game_System.prototype.addPhoneCredits = function(amount) {
        this.ensureAnokiPhone();
        this._phoneCredits = Math.max(0, (this._phoneCredits || 0) + amount);
    };

    Game_System.prototype.setPhoneCredits = function(amount) {
        this.ensureAnokiPhone();
        this._phoneCredits = Math.max(0, amount);
    };

    Game_System.prototype.consumeCredits = function(amount) {
        this.ensureAnokiPhone();
        if (this.getPhoneCredits() >= amount) {
            this._phoneCredits -= amount;
            return true;
        }
        return false;
    };

    Game_System.prototype.registerContact = function(contactName) {
        this.ensureAnokiPhone();
        if (availableContacts[contactName]) {
            this._phoneContacts[contactName] = Object.assign({}, availableContacts[contactName]);
            return true;
        }
        return false;
    };

    Game_System.prototype.addCustomContact = function(name, number, commonEventId) {
        this.ensureAnokiPhone();
        if (!name) return false;
        this._phoneContacts[name] = {
            name: name,
            number: number || autoPhoneNumber(name),
            commonEventId: Number(commonEventId) || 0
        };
        return true;
    };

    Game_System.prototype.removeContact = function(contactName) {
        this.ensureAnokiPhone();
        if (this._phoneContacts[contactName]) {
            delete this._phoneContacts[contactName];
            return true;
        }
        return false;
    };

    Game_System.prototype.getContacts = function() {
        return this._phoneContacts || {};
    };

    // Every handset carries the local emergency number, and it follows the
    // border: crossing into another nation rewrites it to whatever answers
    // there. Refreshed whenever the phone is opened.
    Game_System.prototype.ensureEmergencyContact = function() {
        this.ensureAnokiPhone();
        for (const key of Object.keys(this._phoneContacts)) {
            if (this._phoneContacts[key] && this._phoneContacts[key].emergency) {
                delete this._phoneContacts[key];
            }
        }
        const name = T('Hexphone.emergency.contactName');
        this._phoneContacts[name] = {
            name: name,
            number: HexphoneDirectory.primaryEmergencyNumber(),
            commonEventId: 0,
            emergency: true
        };
        return this._phoneContacts[name];
    };

    Game_System.prototype.findContactByNumber = function(number) {
        for (const contact of Object.values(this.getContacts())) {
            if (contact.number === number) return contact;
        }
        return null;
    };

    Game_System.prototype.addCallToHistory = function(number, name, duration, note) {
        this.ensureAnokiPhone();
        this._callHistory.unshift({
            number: number,
            name: name || T('Hexphone.unknownCaller'),
            duration: duration,
            note: note || '',
            timestamp: formatStamp(currentGameDate())
        });
        if (this._callHistory.length > 20) this._callHistory.pop();
    };

    Game_System.prototype.getCallHistory = function() {
        return this._callHistory || [];
    };

    Game_System.prototype.getMessages = function() {
        return this._phoneMessages || [];
    };

    Game_System.prototype.getMessage = function(index) {
        return this.getMessages()[index];
    };

    Game_System.prototype.addMessage = function(sender, content, type) {
        this.ensureAnokiPhone();
        this._phoneMessages.unshift({
            sender: sender,
            content: content,
            type: type, // 'received' or 'sent'
            timestamp: formatStamp(currentGameDate()),
            read: type === 'sent'
        });
        if (this._phoneMessages.length > 20) this._phoneMessages.pop();
    };

    Game_System.prototype.readMessage = function(index) {
        const message = this.getMessage(index);
        if (message) message.read = true;
    };

    Game_System.prototype.deleteMessage = function(index) {
        this.ensureAnokiPhone();
        if (this._phoneMessages[index]) this._phoneMessages.splice(index, 1);
    };

    Game_System.prototype.clearPhoneMessages = function() {
        this._phoneMessages = [];
    };

    Game_System.prototype.hasUnreadPhoneMessages = function() {
        return this.getMessages().some(msg => !msg.read);
    };

    Game_System.prototype.getAvailableRingtones = function() {
        return availableRingtones;
    };

    Game_System.prototype.getSelectedRingtoneIndex = function() {
        return this._selectedRingtoneIndex || 0;
    };

    Game_System.prototype.setSelectedRingtoneIndex = function(index) {
        this.ensureAnokiPhone();
        const ringtones = this.getAvailableRingtones();
        this._selectedRingtoneIndex = ((index % ringtones.length) + ringtones.length) % ringtones.length;
    };

    Game_System.prototype.getCurrentRingtone = function() {
        return this.getAvailableRingtones()[this.getSelectedRingtoneIndex()] || availableRingtones[0];
    };

    // Back-compat shims for plugins that registered games through $gameSystem
    Game_System.prototype.registerHexphoneGame = function(gameName, gameData) {
        window.registerHexphoneGame(gameName, gameData);
    };

    Game_System.prototype.getPhoneGames = function() {
        return phoneGames;
    };

    //=============================================================================
    // Pending incoming call (module state, consumed by the scene)
    //=============================================================================

    let pendingIncomingCall = null;

    //=============================================================================
    // Scene_AnokiPhone
    //=============================================================================

    function Scene_AnokiPhone() {
        this.initialize(...arguments);
    }

    Scene_AnokiPhone.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_AnokiPhone.prototype.constructor = Scene_AnokiPhone;

    Scene_AnokiPhone.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._screenMode = 'home';
        this._dialedNumber = '';
        this._buttons = [];
        this._screenAnimation = 0;
        this._inCall = false;
        this._freeCall = false;
        this._callDuration = 0;
        this._callTimer = null;
        this._connectTimeout = null;
        this._cursorBlink = 0;
        this._closing = false;
        this._gameSession = null;
        this._currentGameName = '';
        this._callScript = null;
        this._callNode = null;
        this._nodeSeconds = 0;
        this._incomingContact = null;

        this._selectedMenuIndex = 0;
        this._selectedContactIndex = 0;
        this._selectedMessageIndex = 0;
        this._selectedGameIndex = 0;
        this._selectedSettingIndex = 0;
        this._selectedHistoryIndex = 0;
        this._selectedServiceIndex = 0;
        this._messageScroll = 0;
    };

    Scene_AnokiPhone.prototype.create = function() {
        // Scene_MenuBase.create invokes this.createBackground() and
        // this.createButtons(); both are overridden below so the phone owns
        // its layout and buttons are only ever created once (creating them
        // twice made every click fire two handlers, and a doubled popScene
        // emptied the scene stack and shut the game down via SceneManager.exit).
        Scene_MenuBase.prototype.create.call(this);
        if ($gameSystem) {
            $gameSystem.ensureAnokiPhone();
            $gameSystem.ensureEmergencyContact();
        }
        this.createPhoneBody();
        this.createScreen();
        this.createPhoneButtons();
        this.playPowerOnSound();
    };

    Scene_AnokiPhone.prototype.createBackground = function() {
        // Transparent background, the phone floats over black
    };

    Scene_AnokiPhone.prototype.createButtons = function() {
        // Intentionally empty: Scene_MenuBase.create calls this before the
        // phone body exists. Real buttons are built in createPhoneButtons().
    };

    Scene_AnokiPhone.prototype.needsCancelButton = function() {
        return false;
    };

    Scene_AnokiPhone.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this._keyDownHandler = this.onDocumentKeyDown.bind(this);
        document.addEventListener('keydown', this._keyDownHandler);
        if (pendingIncomingCall) {
            this._incomingContact = pendingIncomingCall;
            pendingIncomingCall = null;
            this._screenMode = 'incoming';
            this.playRingtone();
            this.refreshScreen();
        }
    };

    //-------------------------------------------------------------------------
    // Phone body and screen (visuals unchanged from v2)
    //-------------------------------------------------------------------------

    // The shell is drawn the way the hyperdeck is modelled: one moulded piece
    // lit from the upper left, with a raised rim, a recessed screen well and
    // keys that stand proud of the face. Everything is painted into bitmaps so
    // the existing hit testing and the LCD content bitmap keep working.
    const SHELL_PAD = 26;

    function roundedPath(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function etchedText(ctx, text, cx, y, size, light, dark) {
        ctx.font = size + 'px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = dark;
        ctx.fillText(text, cx, y + 1);
        ctx.fillStyle = light;
        ctx.fillText(text, cx, y);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    Scene_AnokiPhone.prototype.createPhoneBody = function() {
        const W = 300;
        const H = 600;
        const P = SHELL_PAD;

        this._phoneSprite = new Sprite();
        this._phoneSprite.bitmap = new Bitmap(W + P * 2, H + P * 2);
        this._phoneSprite.x = Graphics.width / 2 - 150 - P;
        this._phoneSprite.y = 50 - P;

        const ctx = this._phoneSprite.bitmap.context;
        ctx.save();

        // The shadow the handset casts on whatever it is lying on.
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 14;
        ctx.fillStyle = '#0a0e14';
        roundedPath(ctx, P, P, W, H, 40);
        ctx.fill();
        ctx.restore();

        // The moulded shell: a cylinder of plastic, lighter down the middle
        // where it turns towards the light, dark at both rolled edges.
        const across = ctx.createLinearGradient(P, 0, P + W, 0);
        across.addColorStop(0.00, '#0e141c');
        across.addColorStop(0.10, '#33465c');
        across.addColorStop(0.34, '#5b768f');
        across.addColorStop(0.55, '#3d5065');
        across.addColorStop(0.86, '#1c2735');
        across.addColorStop(1.00, '#0b1017');
        ctx.fillStyle = across;
        roundedPath(ctx, P, P, W, H, 40);
        ctx.fill();

        // Top light and the shade that falls off towards the bottom.
        const down = ctx.createLinearGradient(0, P, 0, P + H);
        down.addColorStop(0.00, 'rgba(255, 255, 255, 0.16)');
        down.addColorStop(0.22, 'rgba(255, 255, 255, 0.02)');
        down.addColorStop(0.70, 'rgba(0, 0, 0, 0.10)');
        down.addColorStop(1.00, 'rgba(0, 0, 0, 0.38)');
        ctx.fillStyle = down;
        roundedPath(ctx, P, P, W, H, 40);
        ctx.fill();

        // The rolled rim, bright where it faces up, dark underneath.
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        roundedPath(ctx, P + 1, P + 1, W - 2, H - 2, 39);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        roundedPath(ctx, P, P, W, H, 40);
        ctx.stroke();

        // The face plate sunk into the shell.
        const face = ctx.createLinearGradient(0, P + 12, 0, P + H - 12);
        face.addColorStop(0, '#2c3a4c');
        face.addColorStop(0.5, '#22303f');
        face.addColorStop(1, '#18222e');
        ctx.fillStyle = face;
        roundedPath(ctx, P + 11, P + 11, W - 22, H - 22, 32);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        roundedPath(ctx, P + 11, P + 11, W - 22, H - 22, 32);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        roundedPath(ctx, P + 12, P + 12, W - 24, H - 24, 31);
        ctx.stroke();

        // Earpiece grille: a slot milled into the plastic with the slits in it.
        const gx = P + W / 2 - 44;
        const gy = P + 6;
        ctx.fillStyle = '#0a0f15';
        roundedPath(ctx, gx, gy, 88, 11, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        roundedPath(ctx, gx, gy + 1, 88, 11, 6);
        ctx.stroke();
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = 'rgba(120, 145, 170, 0.30)';
            ctx.fillRect(gx + 12 + i * 10, gy + 3, 3, 5);
        }

        // Brand, etched rather than printed.
        etchedText(ctx, 'ANOKI', P + W / 2, P + 21, 12,
            'rgba(196, 214, 232, 0.85)', 'rgba(0, 0, 0, 0.7)');

        // The well the screen sits in, with the shadow its lip throws inwards.
        const wx = P + 14;
        const wy = P + 38;
        ctx.save();
        roundedPath(ctx, wx, wy, W - 28, 186, 14);
        ctx.clip();
        ctx.fillStyle = '#121a23';
        ctx.fillRect(wx, wy, W - 28, 186);
        const lip = ctx.createLinearGradient(0, wy, 0, wy + 26);
        lip.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
        lip.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lip;
        ctx.fillRect(wx, wy, W - 28, 26);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        roundedPath(ctx, wx, wy + 1, W - 28, 186, 14);
        ctx.stroke();

        // The keypad plate, a shade lighter and catching the light in a band
        // across the top row the way a raked keypad does.
        const kx = P + 14;
        const ky = P + 228;
        const kh = H - 228 - 19;
        const plate = ctx.createLinearGradient(0, ky, 0, ky + kh);
        plate.addColorStop(0, '#37485c');
        plate.addColorStop(0.45, '#25313f');
        plate.addColorStop(1, '#161f2a');
        ctx.fillStyle = plate;
        roundedPath(ctx, kx, ky, W - 28, kh, 22);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 2;
        roundedPath(ctx, kx, ky, W - 28, kh, 22);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
        ctx.lineWidth = 1;
        roundedPath(ctx, kx + 1, ky + 2, W - 30, kh - 3, 21);
        ctx.stroke();

        // A single sheen laid diagonally over the whole handset.
        ctx.save();
        roundedPath(ctx, P, P, W, H, 40);
        ctx.clip();
        const sheen = ctx.createLinearGradient(P, P, P + W * 0.9, P + H * 0.55);
        sheen.addColorStop(0.00, 'rgba(255, 255, 255, 0.16)');
        sheen.addColorStop(0.28, 'rgba(255, 255, 255, 0.04)');
        sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(P, P, W, H);
        ctx.restore();

        ctx.restore();
        this._phoneSprite.bitmap._baseTexture.update();
        this.addChild(this._phoneSprite);
    };

    Scene_AnokiPhone.prototype.createScreen = function() {
        const screenX = Graphics.width / 2 - 130;
        const screenY = 90;

        this._screenSprite = new Sprite();
        this._screenSprite.bitmap = new Bitmap(260, 180);
        this._screenSprite.x = screenX;
        this._screenSprite.y = screenY;

        const ctx = this._screenSprite.bitmap.context;
        ctx.save();

        // Bezel: the dark frame the glass is held in.
        ctx.fillStyle = '#0d1218';
        roundedPath(ctx, 0, 0, 260, 180, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        roundedPath(ctx, 0, 0, 260, 180, 8);
        ctx.stroke();

        // The panel itself, lit from an edge backlight low on the left.
        const back = ctx.createRadialGradient(90, 150, 10, 130, 90, 220);
        back.addColorStop(0, '#c2d07a');
        back.addColorStop(0.55, '#a3b165');
        back.addColorStop(1, '#7f8c4c');
        ctx.fillStyle = back;
        ctx.fillRect(4, 4, 252, 172);

        // The pixel grid of a passive matrix panel.
        ctx.fillStyle = 'rgba(40, 48, 24, 0.10)';
        for (let x = 4; x < 256; x += 2) ctx.fillRect(x, 4, 1, 172);
        for (let y = 4; y < 176; y += 2) ctx.fillRect(4, y, 252, 1);

        // The shadow the bezel drops onto the glass.
        const inner = ctx.createLinearGradient(0, 4, 0, 24);
        inner.addColorStop(0, 'rgba(20, 26, 12, 0.45)');
        inner.addColorStop(1, 'rgba(20, 26, 12, 0)');
        ctx.fillStyle = inner;
        ctx.fillRect(4, 4, 252, 20);

        ctx.restore();
        this._screenSprite.bitmap._baseTexture.update();
        this.addChild(this._screenSprite);

        this._contentSprite = new Sprite();
        this._contentSprite.bitmap = new Bitmap(250, 170);
        this._contentSprite.x = screenX + 5;
        this._contentSprite.y = screenY + 5;
        this.addChild(this._contentSprite);

        // The glass over the digits: one raked reflection, drawn last so it
        // lies on top of whatever the panel is showing.
        this._glassSprite = new Sprite();
        this._glassSprite.bitmap = new Bitmap(260, 180);
        const gctx = this._glassSprite.bitmap.context;
        gctx.save();
        roundedPath(gctx, 4, 4, 252, 172, 4);
        gctx.clip();
        const glare = gctx.createLinearGradient(0, 0, 190, 130);
        glare.addColorStop(0.00, 'rgba(255, 255, 255, 0.20)');
        glare.addColorStop(0.30, 'rgba(255, 255, 255, 0.06)');
        glare.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
        gctx.fillStyle = glare;
        gctx.fillRect(0, 0, 260, 180);
        gctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        gctx.lineWidth = 1;
        roundedPath(gctx, 5, 5, 250, 170, 4);
        gctx.stroke();
        gctx.restore();
        this._glassSprite.bitmap._baseTexture.update();
        this._glassSprite.x = screenX;
        this._glassSprite.y = screenY;
        this.addChild(this._glassSprite);

        this.refreshScreen();
    };

    Scene_AnokiPhone.prototype.createPhoneButtons = function() {
        const startX = Graphics.width / 2 - 130;
        const buttonWidth = 70;
        const buttonHeight = 45;
        const spacing = 15;
        const funcY = 280;

        const callButton = new Sprite_AnokiButton(
            startX, funcY, buttonWidth, buttonHeight - 5, 'CALL', '#1f7a44');
        callButton.setClickHandler(() => this.onCallButton());
        this._buttons.push(callButton);
        this.addChild(callButton);

        const menuButton = new Sprite_AnokiButton(
            startX + buttonWidth + spacing, funcY, buttonWidth, buttonHeight - 5, 'MENU', '#2f5f9e');
        menuButton.setClickHandler(() => this.onMenuButton());
        this._buttons.push(menuButton);
        this.addChild(menuButton);

        const endButton = new Sprite_AnokiButton(
            startX + (buttonWidth + spacing) * 2, funcY, buttonWidth, buttonHeight - 5, 'END', '#9e2b2b');
        endButton.setClickHandler(() => this.onEndButton());
        this._buttons.push(endButton);
        this.addChild(endButton);

        const startY = funcY + (buttonHeight - 5) + spacing;
        // i18n-ignore-start: phone keypad legend, universal
        const buttonLayout = [
            [{label: '1\n', value: '1'}, {label: '2\nABC', value: '2'}, {label: '3\nDEF', value: '3'}],
            [{label: '4\nGHI', value: '4'}, {label: '5\nJKL', value: '5'}, {label: '6\nMNO', value: '6'}],
            [{label: '7\nPQRS', value: '7'}, {label: '8\nTUV', value: '8'}, {label: '9\nWXYZ', value: '9'}],
            [{label: '*', value: '*'}, {label: '0\n+', value: '0'}, {label: '#', value: '#'}]
        ];
        // i18n-ignore-end

        for (let row = 0; row < buttonLayout.length; row++) {
            for (let col = 0; col < buttonLayout[row].length; col++) {
                const btn = buttonLayout[row][col];
                const x = startX + col * (buttonWidth + spacing);
                const y = startY + row * (buttonHeight + spacing);
                const button = new Sprite_AnokiButton(x, y, buttonWidth, buttonHeight, btn.label, '#3a4b60');
                button.setClickHandler(() => this.onNumberButton(btn.value));
                this._buttons.push(button);
                this.addChild(button);
            }
        }
    };

    //-------------------------------------------------------------------------
    // Screen rendering
    //-------------------------------------------------------------------------

    Scene_AnokiPhone.prototype.refreshScreen = function() {
        if (!this._contentSprite || !this._contentSprite.bitmap) return;
        const bitmap = this._contentSprite.bitmap;
        bitmap.clear();
        bitmap.fontSize = 14;
        bitmap.fontFace = 'Courier New, monospace';
        bitmap.textColor = '#1a1a1a';

        switch (this._screenMode) {
            case 'home':        this.drawHomeScreen(bitmap); break;
            case 'menu':        this.drawMenuScreen(bitmap); break;
            case 'dial':        this.drawDialScreen(bitmap); break;
            case 'contacts':    this.drawContactsScreen(bitmap); break;
            case 'calling':     this.drawCallingScreen(bitmap); break;
            case 'incoming':    this.drawIncomingScreen(bitmap); break;
            case 'addContact':  this.drawAddContactScreen(bitmap); break;
            case 'callHistory': this.drawCallHistoryScreen(bitmap); break;
            case 'messages':    this.drawMessagesScreen(bitmap); break;
            case 'messageView': this.drawMessageViewScreen(bitmap); break;
            case 'settings':    this.drawSettingsScreen(bitmap); break;
            case 'services':    this.drawServicesScreen(bitmap); break;
            case 'games':       this.drawGamesScreen(bitmap); break;
            case 'game':        this.drawGameScreen(bitmap); break;
        }
    };

    Scene_AnokiPhone.prototype.drawHomeScreen = function(bitmap) {
        const credits = $gameSystem.getPhoneCredits();
        const timeStr = formatClock(currentGameDate());

        bitmap.fontSize = 20;
        bitmap.drawText(timeStr, 0, 10, 250, 24, 'center');

        bitmap.fontSize = 12;
        bitmap.drawText('ANOKI', 0, 40, 250, 20, 'center');

        bitmap.fontSize = 14;
        bitmap.drawText(getText('Credits') + ': €' + goldToEuros(credits), 0, 70, 250, 20, 'center');

        if ($gameSystem.hasUnreadPhoneMessages()) {
            bitmap.fontSize = 12;
            bitmap.fontBold = true;
            bitmap.drawText(getText('New Messages'), 0, 95, 250, 20, 'center');
            bitmap.fontBold = false;
        }

        bitmap.fontSize = 11;
        bitmap.drawText(getText('Press MENU'), 0, 120, 250, 20, 'center');
        bitmap.fontSize = 10;
        bitmap.drawText(getText('Press END to exit'), 0, 145, 250, 20, 'center');
    };

    Scene_AnokiPhone.prototype.drawMenuScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('MENU'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 12;
        const menuItems = [
            '1. ' + getText('CONTACTS'),
            '2. ' + getText('MESSAGES'),
            '3. ' + getText('CALL HISTORY'),
            '4. ' + getText('DIAL NUMBER'),
            '5. ' + getText('SETTINGS'),
            '6. ' + getText('GAMES'),
            '7. ' + T('Hexphone.services.title')
        ];

        let y = 28;
        for (let i = 0; i < menuItems.length; i++) {
            const prefix = (i === this._selectedMenuIndex) ? '> ' : '  ';
            bitmap.drawText(prefix + menuItems[i], 10, y, 230, 18, 'left');
            y += 18;
        }

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Press END to exit'), 0, 152, 250, 18, 'center');
    };

    Scene_AnokiPhone.prototype.drawDialScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('DIAL NUMBER'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 18;
        const displayNumber = this._dialedNumber || '';
        const cursor = (this._cursorBlink < 30) ? '_' : ' ';
        bitmap.drawText(displayNumber + cursor, 0, 40, 250, 24, 'center');

        bitmap.fontSize = 11;
        bitmap.drawText(getText('Enter number and'), 0, 100, 250, 20, 'center');
        bitmap.drawText(getText('press CALL button'), 0, 115, 250, 20, 'center');

        if (this._dialedNumber) {
            bitmap.fontSize = 10;
            bitmap.drawText(getText('Delete and Save'), 0, 145, 250, 20, 'center');
        }
    };

    Scene_AnokiPhone.prototype.drawContactsScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('CONTACTS'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        const contacts = Object.values($gameSystem.getContacts());

        if (contacts.length === 0) {
            bitmap.fontSize = 12;
            bitmap.drawText(getText('No contacts'), 0, 60, 250, 20, 'center');
        } else {
            bitmap.fontSize = 11;
            let y = 30;
            const maxDisplay = 4;
            const start = Math.max(0, Math.min(this._selectedContactIndex - 1, contacts.length - maxDisplay));
            const end = Math.min(contacts.length, start + maxDisplay);

            for (let i = start; i < end; i++) {
                const contact = contacts[i];
                const prefix = (i === this._selectedContactIndex) ? '> ' : '  ';
                bitmap.fontSize = 11;
                bitmap.drawText(prefix + contact.name, 5, y, 230, 20, 'left');
                bitmap.fontSize = 9;
                bitmap.drawText(contact.number, 15, y + 12, 220, 20, 'left');
                y += 28;
            }

            bitmap.fontSize = 10;
            bitmap.drawText(getText('Call and Delete'), 0, 150, 250, 20, 'center');
        }
    };

    Scene_AnokiPhone.prototype.drawCallingScreen = function(bitmap) {
        // A call with someone on the other end: their words fill the panel and
        // the numbered replies sit under them, answered on the keypad.
        if (this._inCall && this._callNode) {
            bitmap.fontSize = 11;
            bitmap.fontBold = true;
            bitmap.drawText(this._currentCallName || T('Hexphone.unknownCaller'), 4, 0, 180, 16, 'left');
            bitmap.fontBold = false;
            const duration = Math.floor(this._callDuration);
            bitmap.drawText(
                Math.floor(duration / 60).toString().padStart(2, '0') + ':' +
                (duration % 60).toString().padStart(2, '0'), 180, 0, 66, 16, 'right');

            bitmap.fontSize = 12;
            let y = 20;
            for (const line of this._callNode.lines) {
                const used = this.drawWrappedText(bitmap, line, 6, y, 238, 15);
                y += used * 15;
            }

            const options = this._callNode.options || [];
            if (options.length > 0) {
                y = Math.max(y + 4, 170 - 14 - options.length * 15);
                bitmap.fontSize = 11;
                for (const option of options) {
                    bitmap.drawText(option.key + '. ' + option.label, 8, y, 234, 15, 'left');
                    y += 15;
                }
            } else {
                bitmap.fontSize = 10;
                bitmap.drawText(getText('Press to hang up'), 0, 152, 250, 18, 'center');
            }
            return;
        }

        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('CALLING'), 0, 20, 250, 20, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 16;
        bitmap.drawText(this._currentCallName || T('Hexphone.unknownCaller'), 0, 50, 250, 20, 'center');

        bitmap.fontSize = 12;
        bitmap.drawText(this._dialedNumber || '', 0, 75, 250, 20, 'center');

        if (this._inCall) {
            const duration = Math.floor(this._callDuration);
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const durationStr = minutes.toString().padStart(2, '0') + ':' +
                                seconds.toString().padStart(2, '0');

            bitmap.fontSize = 18;
            bitmap.drawText(durationStr, 0, 100, 250, 24, 'center');

            if (!this._freeCall) {
                const cost = Math.floor(this._callDuration * callCostPerSecond);
                bitmap.fontSize = 11;
                bitmap.drawText(getText('Cost') + ': €' + goldToEuros(cost), 0, 130, 250, 20, 'center');
            }
        } else {
            bitmap.fontSize = 11;
            bitmap.drawText(getText('Connecting'), 0, 105, 250, 20, 'center');
        }

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Press to hang up'), 0, 150, 250, 20, 'center');
    };

    Scene_AnokiPhone.prototype.drawIncomingScreen = function(bitmap) {
        const contact = this._incomingContact;
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('INCOMING CALL'), 0, 20, 250, 20, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 16;
        bitmap.drawText(contact ? contact.name : T('Hexphone.unknownCaller'), 0, 55, 250, 20, 'center');
        bitmap.fontSize = 12;
        bitmap.drawText(contact ? contact.number : '', 0, 80, 250, 20, 'center');

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Answer or Decline'), 0, 145, 250, 20, 'center');
    };

    Scene_AnokiPhone.prototype.drawAddContactScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('ADD CONTACT'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 12;
        bitmap.drawText(getText('Enter number'), 10, 35, 220, 20, 'left');

        bitmap.fontSize = 16;
        const cursor = (this._cursorBlink < 30) ? '_' : ' ';
        bitmap.drawText((this._dialedNumber || '') + cursor, 0, 55, 250, 24, 'center');

        bitmap.fontSize = 11;
        bitmap.drawText(getText('Then press MENU'), 0, 100, 250, 20, 'center');
        bitmap.drawText(getText('to save contact'), 0, 115, 250, 20, 'center');

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Delete and Cancel'), 0, 145, 250, 20, 'center');
    };

    Scene_AnokiPhone.prototype.drawCallHistoryScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('CALL HISTORY'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        const history = $gameSystem.getCallHistory();

        if (history.length === 0) {
            bitmap.fontSize = 12;
            bitmap.drawText(getText('No call history'), 0, 70, 250, 20, 'center');
        } else {
            let y = 30;
            const maxDisplay = 4;
            const start = Math.max(0, Math.min(this._selectedHistoryIndex - 1, history.length - maxDisplay));
            const end = Math.min(history.length, start + maxDisplay);

            for (let i = start; i < end; i++) {
                const call = history[i];
                const prefix = (i === this._selectedHistoryIndex) ? '> ' : '  ';
                bitmap.fontSize = 10;
                bitmap.drawText(prefix + call.name, 5, y, 180, 20, 'left');
                bitmap.drawText(call.timestamp || '', 150, y, 95, 20, 'left');

                const duration = Math.floor(call.duration || 0);
                const durationStr = call.note ? call.note :
                    Math.floor(duration / 60) + ':' + (duration % 60).toString().padStart(2, '0');

                bitmap.fontSize = 9;
                bitmap.drawText(call.number + ' (' + durationStr + ')', 15, y + 10, 230, 20, 'left');
                y += 26;
            }

            bitmap.fontSize = 10;
            bitmap.drawText(getText('Redial hint'), 0, 150, 250, 20, 'center');
        }
    };

    Scene_AnokiPhone.prototype.drawMessagesScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('MESSAGES'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        const messages = $gameSystem.getMessages();

        if (messages.length === 0) {
            bitmap.fontSize = 12;
            bitmap.drawText(getText('No messages'), 0, 70, 250, 20, 'center');
        } else {
            let y = 30;
            const maxDisplay = 4;
            const start = Math.max(0, Math.min(this._selectedMessageIndex - 1, messages.length - maxDisplay));
            const end = Math.min(messages.length, start + maxDisplay);

            for (let i = start; i < end; i++) {
                const message = messages[i];
                const prefix = (i === this._selectedMessageIndex) ? '> ' : '  ';
                let sender = message.sender;
                if (message.type === 'sent') sender = 'To: ' + sender;
                if (!message.read) sender = '(N) ' + sender;
                bitmap.fontSize = 11;
                bitmap.drawText(prefix + sender, 5, y, 230, 20, 'left');

                bitmap.fontSize = 9;
                const snippet = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
                bitmap.drawText(snippet, 15, y + 12, 220, 20, 'left');
                y += 28;
            }
        }

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Read and Delete'), 0, 150, 250, 20, 'center');
    };

    Scene_AnokiPhone.prototype.drawMessageViewScreen = function(bitmap) {
        const message = $gameSystem.getMessage(this._selectedMessageIndex);
        if (!message) {
            this._screenMode = 'messages';
            this.refreshScreen();
            return;
        }

        bitmap.fontSize = 12;
        bitmap.fontBold = true;
        const title = message.type === 'sent' ? 'To: ' : 'From: ';
        bitmap.drawText(title + message.sender, 0, 3, 250, 18, 'center');
        bitmap.fontBold = false;
        bitmap.fontSize = 9;
        bitmap.drawText(message.timestamp || '', 0, 19, 250, 12, 'center');

        bitmap.fontSize = 11;
        this.drawWrappedText(bitmap, message.content, 5, 34, 240, 14, this._messageScroll, 8);

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Press END to return'), 0, 152, 250, 18, 'center');
    };

    Scene_AnokiPhone.prototype.drawSettingsScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('SETTINGS'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        const ringtone = $gameSystem.getCurrentRingtone();
        bitmap.fontSize = 12;
        bitmap.drawText('> ' + getText('Ringtone') + ': <' + ringtone.name + '>', 5, 40, 240, 20, 'left');

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Change setting'), 0, 150, 250, 20, 'center');
    };

    // The numbers that answer: the local emergency line at the top, then the
    // public service lines, the way they were printed in a phone book.
    Scene_AnokiPhone.prototype.serviceEntries = function() {
        const numbers = HexphoneDirectory.emergencyNumbers();
        const entries = [{
            name: T('Hexphone.emergency.contactName'),
            number: numbers[0]
        }];
        if (numbers[1] !== numbers[0]) {
            entries.push({ name: T('Hexphone.emergency.optFire'), number: numbers[1] });
        }
        if (numbers[2] !== numbers[0] && numbers[2] !== numbers[1]) {
            entries.push({ name: T('Hexphone.emergency.optMedical'), number: numbers[2] });
        }
        return entries.concat(HexphoneDirectory.publicNumbers());
    };

    Scene_AnokiPhone.prototype.drawServicesScreen = function(bitmap) {
        bitmap.fontSize = 13;
        bitmap.fontBold = true;
        bitmap.drawText(T('Hexphone.services.title'), 0, 2, 250, 18, 'center');
        bitmap.fontBold = false;

        const nation = HexphoneDirectory.currentCountryName();
        bitmap.fontSize = 10;
        bitmap.drawText(nation || T('Hexphone.emergency.unknownNation'), 0, 18, 250, 14, 'center');

        const entries = this.serviceEntries();
        this._selectedServiceIndex =
            Math.min(this._selectedServiceIndex, Math.max(0, entries.length - 1));

        bitmap.fontSize = 11;
        let y = 34;
        for (let i = 0; i < entries.length; i++) {
            const selected = (i === this._selectedServiceIndex);
            bitmap.drawText((selected ? '> ' : '  ') + entries[i].name, 6, y, 170, 15, 'left');
            bitmap.drawText(entries[i].number, 170, y, 74, 15, 'right');
            y += 15;
        }

        bitmap.fontSize = 10;
        bitmap.drawText(T('Hexphone.services.callHint'), 0, 152, 250, 18, 'center');
    };

    Scene_AnokiPhone.prototype.callSelectedService = function() {
        const entries = this.serviceEntries();
        const entry = entries[this._selectedServiceIndex];
        if (entry) this.initiateCall(entry.number, entry.name, 0);
    };

    Scene_AnokiPhone.prototype.drawGamesScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('GAMES'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        const games = $gameSystem.getPhoneGames();

        if (games.length === 0) {
            bitmap.fontSize = 12;
            bitmap.drawText(getText('No games'), 0, 70, 250, 20, 'center');
        } else {
            bitmap.fontSize = 11;
            let y = 30;
            const maxDisplay = 5;
            const start = Math.max(0, Math.min(this._selectedGameIndex - 2, games.length - maxDisplay));
            const end = Math.min(games.length, start + maxDisplay);

            for (let i = start; i < end; i++) {
                const prefix = (i === this._selectedGameIndex) ? '> ' : '  ';
                // The registry id doubles as the i18n key, so a built-in game
                // is listed in the player's language and a game registered by
                // another plugin still shows the name it registered under.
                bitmap.drawText(prefix + getText(games[i].name), 5, y, 230, 20, 'left');
                y += 22;
            }
        }

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Play Game'), 0, 150, 250, 20, 'center');
    };

    Scene_AnokiPhone.prototype.drawGameScreen = function(bitmap) {
        if (this._gameSession && typeof this._gameSession.draw === 'function') {
            this._gameSession.draw(bitmap);
        }
    };

    Scene_AnokiPhone.prototype.drawWrappedText = function(bitmap, text, x, y, maxWidth, lineHeight, startLine, maxLines) {
        const lines = [];
        for (const rawLine of String(text).split('\n')) {
            const words = rawLine.split(' ');
            let line = '';
            for (const word of words) {
                const testLine = line ? line + ' ' + word : word;
                if (bitmap.measureTextWidth(testLine) > maxWidth && line) {
                    lines.push(line);
                    line = word;
                } else {
                    line = testLine;
                }
            }
            lines.push(line);
        }

        const first = startLine || 0;
        const count = maxLines || lines.length;
        let currentY = y;
        for (let i = first; i < Math.min(lines.length, first + count); i++) {
            bitmap.drawText(lines[i], x, currentY, maxWidth, lineHeight, 'left');
            currentY += lineHeight;
        }
        return lines.length;
    };

    //-------------------------------------------------------------------------
    // Button and key handling
    //-------------------------------------------------------------------------

    // Digits, * and # from the physical keyboard. Handled through a DOM
    // listener because the engine keyMapper does not map digit keys and
    // patching Input._currentState with raw codes never works.
    Scene_AnokiPhone.prototype.onDocumentKeyDown = function(event) {
        if (SceneManager._scene !== this || this._closing) return;
        const key = event.key;
        if (key >= '0' && key <= '9') {
            this.onNumberButton(key);
        } else if (key === '*' || key === 'Backspace' || key === 'Delete') { // i18n-ignore: DOM key names
            this.onNumberButton('*');
        } else if (key === '#') {
            this.onNumberButton('#');
        }
    };

    Scene_AnokiPhone.prototype.onNumberButton = function(value) {
        if (this._closing) return;
        this.playButtonSound();

        switch (this._screenMode) {
            case 'home':
                if (value >= '0' && value <= '9') {
                    this._screenMode = 'dial';
                    this._dialedNumber = value;
                    this.refreshScreen();
                }
                break;

            case 'dial':
            case 'addContact':
                if (value === '*') {
                    this._dialedNumber = this._dialedNumber.slice(0, -1);
                } else if (value !== '#') {
                    if (this._dialedNumber.length < 15) this._dialedNumber += value;
                }
                this.refreshScreen();
                break;

            case 'menu':
                if (value >= '1' && value <= '7') {
                    this._selectedMenuIndex = Number(value) - 1;
                    this.enterMenuItem(this._selectedMenuIndex);
                }
                this.refreshScreen();
                break;

            case 'contacts': {
                const contacts = Object.values($gameSystem.getContacts());
                if (contacts.length === 0) break;
                if (value === '2') {
                    this._selectedContactIndex = (this._selectedContactIndex + 1) % contacts.length;
                } else if (value === '8') {
                    this._selectedContactIndex = (this._selectedContactIndex - 1 + contacts.length) % contacts.length;
                } else if (value === '*') {
                    const contact = contacts[this._selectedContactIndex];
                    $gameSystem.removeContact(contact.name);
                    this._selectedContactIndex = Math.max(0, this._selectedContactIndex - 1);
                }
                this.refreshScreen();
                break;
            }

            case 'callHistory': {
                const history = $gameSystem.getCallHistory();
                if (history.length === 0) break;
                if (value === '2') {
                    this._selectedHistoryIndex = (this._selectedHistoryIndex + 1) % history.length;
                } else if (value === '8') {
                    this._selectedHistoryIndex = (this._selectedHistoryIndex - 1 + history.length) % history.length;
                }
                this.refreshScreen();
                break;
            }

            case 'calling': {
                if (this._inCall && this._callNode) {
                    const option = (this._callNode.options || []).find(o => o.key === value);
                    if (option) {
                        this.answerCallOption(option);
                        break;
                    }
                }
                if (value === '#') this.endCall();
                break;
            }

            case 'messages': {
                const messages = $gameSystem.getMessages();
                if (messages.length === 0) break;
                if (value === '2') {
                    this._selectedMessageIndex = (this._selectedMessageIndex + 1) % messages.length;
                } else if (value === '8') {
                    this._selectedMessageIndex = (this._selectedMessageIndex - 1 + messages.length) % messages.length;
                } else if (value === '*') {
                    $gameSystem.deleteMessage(this._selectedMessageIndex);
                    this._selectedMessageIndex = Math.max(0, this._selectedMessageIndex - 1);
                }
                this.refreshScreen();
                break;
            }

            case 'messageView':
                if (value === '2') this._messageScroll++;
                else if (value === '8') this._messageScroll = Math.max(0, this._messageScroll - 1);
                this.refreshScreen();
                break;

            case 'settings':
                if (value === '4' || value === '2') {
                    this.changeRingtone(-1);
                } else if (value === '6' || value === '8') {
                    this.changeRingtone(1);
                }
                this.refreshScreen();
                break;

            case 'services': {
                const entries = this.serviceEntries();
                if (entries.length === 0) break;
                if (value === '2') {
                    this._selectedServiceIndex = (this._selectedServiceIndex + 1) % entries.length;
                } else if (value === '8') {
                    this._selectedServiceIndex =
                        (this._selectedServiceIndex - 1 + entries.length) % entries.length;
                }
                this.refreshScreen();
                break;
            }

            case 'games': {
                const games = $gameSystem.getPhoneGames();
                if (games.length === 0) break;
                if (value === '2') {
                    this._selectedGameIndex = (this._selectedGameIndex + 1) % games.length;
                } else if (value === '8') {
                    this._selectedGameIndex = (this._selectedGameIndex - 1 + games.length) % games.length;
                }
                this.refreshScreen();
                break;
            }

            case 'game':
                if (this._gameSession && typeof this._gameSession.onKey === 'function') {
                    this._gameSession.onKey(value);
                    // Force a redraw next frame: onKey may change game state that
                    // update() won't re-signal as dirty.
                    this._gameSessionDirty = true;
                }
                break;
        }
    };

    Scene_AnokiPhone.prototype.enterMenuItem = function(index) {
        switch (index) {
            case 0: this._screenMode = 'contacts'; this._selectedContactIndex = 0; break;
            case 1: this._screenMode = 'messages'; this._selectedMessageIndex = 0; break;
            case 2: this._screenMode = 'callHistory'; this._selectedHistoryIndex = 0; break;
            case 3: this._screenMode = 'dial'; this._dialedNumber = ''; break;
            case 4: this._screenMode = 'settings'; break;
            case 5: this._screenMode = 'games'; this._selectedGameIndex = 0; break;
            case 6: this._screenMode = 'services'; this._selectedServiceIndex = 0; break;
        }
    };

    Scene_AnokiPhone.prototype.changeRingtone = function(delta) {
        $gameSystem.setSelectedRingtoneIndex($gameSystem.getSelectedRingtoneIndex() + delta);
        const ringtone = $gameSystem.getCurrentRingtone();
        AudioManager.stopSe();
        playSeSafe(ringtone.se, ringtone.volume, ringtone.pitch);
    };

    Scene_AnokiPhone.prototype.onCallButton = function() {
        if (this._closing) return;
        this.playButtonSound();

        if (this._screenMode === 'incoming') {
            this.answerIncomingCall();
        } else if (this._screenMode === 'dial' && this._dialedNumber) {
            const contact = $gameSystem.findContactByNumber(this._dialedNumber);
            if (contact) {
                this.initiateCall(contact.number, contact.name, contact.commonEventId);
            } else {
                this.initiateCall(this._dialedNumber, T('Hexphone.unknownCaller'), 0);
            }
        } else if (this._screenMode === 'contacts') {
            this.callSelectedContact();
        } else if (this._screenMode === 'callHistory') {
            this.redialSelectedHistory();
        } else if (this._screenMode === 'home') {
            this._screenMode = 'dial';
            this._dialedNumber = '';
            this.refreshScreen();
        } else if (this._screenMode === 'messages') {
            this.openMessage();
        } else if (this._screenMode === 'games') {
            this.launchGame();
        } else if (this._screenMode === 'services') {
            this.callSelectedService();
        }
    };

    Scene_AnokiPhone.prototype.onMenuButton = function() {
        if (this._closing) return;
        this.playButtonSound();

        switch (this._screenMode) {
            case 'home':
                this._screenMode = 'menu';
                this.refreshScreen();
                break;
            case 'menu':
                this.enterMenuItem(this._selectedMenuIndex);
                this.refreshScreen();
                break;
            case 'dial':
                if (this._dialedNumber) {
                    this._screenMode = 'addContact';
                    this.refreshScreen();
                }
                break;
            case 'addContact':
                if (this._dialedNumber) {
                    const name = 'Contact_' + this._dialedNumber.substring(0, 4); // i18n-ignore: internal contact id
                    $gameSystem.addCustomContact(name, this._dialedNumber, 0);
                    this._dialedNumber = '';
                    this._screenMode = 'contacts';
                    this._selectedContactIndex = 0;
                    this.refreshScreen();
                }
                break;
            case 'contacts':
                this.callSelectedContact();
                break;
            case 'callHistory':
                this.redialSelectedHistory();
                break;
            case 'messages':
                this.openMessage();
                break;
            case 'games':
                this.launchGame();
                break;
            case 'services':
                this.callSelectedService();
                break;
            case 'incoming':
                this.answerIncomingCall();
                break;
            case 'game':
                if (this._gameSession && typeof this._gameSession.onKey === 'function') {
                    this._gameSession.onKey('menu');
                }
                break;
        }
    };

    Scene_AnokiPhone.prototype.onEndButton = function() {
        if (this._closing) return;
        this.playButtonSound();

        if (this._screenMode === 'calling') {
            this.endCall();
            return;
        }
        if (this._screenMode === 'incoming') {
            this.declineIncomingCall();
            return;
        }
        if (this._screenMode === 'game') {
            this.exitGame();
            return;
        }

        if (this._screenMode === 'menu') {
            this._screenMode = 'home';
            this.refreshScreen();
        } else if (['dial', 'contacts', 'addContact', 'callHistory',
                    'messages', 'settings', 'games', 'services'].includes(this._screenMode)) {
            this._screenMode = 'menu';
            this._dialedNumber = '';
            this.refreshScreen();
        } else if (this._screenMode === 'messageView') {
            this._screenMode = 'messages';
            this.refreshScreen();
        } else if (this._screenMode === 'home') {
            this.safeClose();
        }
    };

    Scene_AnokiPhone.prototype.callSelectedContact = function() {
        const contacts = Object.values($gameSystem.getContacts());
        if (contacts.length > 0) {
            const contact = contacts[this._selectedContactIndex];
            if (contact) this.initiateCall(contact.number, contact.name, contact.commonEventId);
        }
    };

    Scene_AnokiPhone.prototype.redialSelectedHistory = function() {
        const history = $gameSystem.getCallHistory();
        const entry = history[this._selectedHistoryIndex];
        if (!entry) return;
        const contact = $gameSystem.findContactByNumber(entry.number);
        this.initiateCall(entry.number, entry.name, contact ? contact.commonEventId : 0);
    };

    Scene_AnokiPhone.prototype.openMessage = function() {
        const messages = $gameSystem.getMessages();
        if (messages.length > 0) {
            $gameSystem.readMessage(this._selectedMessageIndex);
            this._messageScroll = 0;
            this._screenMode = 'messageView';
            this.refreshScreen();
        }
    };

    //-------------------------------------------------------------------------
    // Games
    //-------------------------------------------------------------------------

    Scene_AnokiPhone.prototype.launchGame = function() {
        const games = $gameSystem.getPhoneGames();
        const game = games[this._selectedGameIndex];
        if (!game) return;

        const inlineDef = inlineGames[game.name];
        if (inlineDef) {
            this._gameSession = inlineDef.create();
            this._currentGameName = game.name;
            this._screenMode = 'game';
            // Extension point kept for legacy plugins that hook createGamePlay
            this.createGamePlay(game.name);
            this.refreshScreen();
        } else if (game.commonEventId > 0) {
            // Event-based games run on the map
            this.exitToMapWithEvent(game.commonEventId);
        } else {
            // Extension point: plugins may hook createGamePlay and take over
            this._currentGameName = game.name;
            this._screenMode = 'game';
            this.createGamePlay(game.name);
            this.refreshScreen();
        }
    };

    Scene_AnokiPhone.prototype.exitGame = function() {
        if (this._gameSession && typeof this._gameSession.destroy === 'function') {
            this._gameSession.destroy();
        }
        this._gameSession = null;
        this._currentGameName = '';
        this._screenMode = 'games';
        this.refreshScreen();
    };

    // Legacy extension hooks (external plugins may alias these)
    Scene_AnokiPhone.prototype.createGamePlay = function(gameName) {};
    Scene_AnokiPhone.prototype.updatePhoneScreen = function() {};
    Scene_AnokiPhone.prototype.handleInput = function() {};

    //-------------------------------------------------------------------------
    // Call logic
    //-------------------------------------------------------------------------

    Scene_AnokiPhone.prototype.initiateCall = function(number, name, commonEventId) {
        const eventId = Number(commonEventId) || 0;

        // What is on the other end of this number: an emergency operator, a
        // public line, an event contact, or nobody at all.
        const script = eventId > 0 ? null : (scriptForNumber(number) || {
            free: true,
            root: () => callNode([
                T('Hexphone.deadLine'), T('Hexphone.deadLineBody')
            ], [], { autoEnd: true })
        });
        const freeLine = eventId > 0 || (script && script.free);

        if (!freeLine && $gameSystem.getPhoneCredits() < callCostPerSecond) {
            this.playErrorSound();
            return;
        }
        this._callScript = script;
        this._callNode = null;
        this._nodeSeconds = 0;

        this._screenMode = 'calling';
        this._dialedNumber = number;
        this._currentCallName = name;
        this._currentCallEventId = eventId;
        this._inCall = false;
        this._freeCall = freeLine;
        this._callDuration = 0;

        this.playRingtone();

        this.clearConnectTimeout();
        this._connectTimeout = setTimeout(() => {
            this._connectTimeout = null;
            if (this._closing || this._screenMode !== 'calling') return;
            this.playConnectSound();
            if (this._currentCallEventId > 0) {
                // Contact answers: log the call and play its Common Event on
                // the map, mirroring how vanilla items run map events.
                $gameSystem.addCallToHistory(this._dialedNumber, this._currentCallName, 0);
                this.exitToMapWithEvent(this._currentCallEventId);
            } else {
                this._inCall = true;
                if (this._callScript) {
                    this._callNode = this._callScript.root();
                    this._nodeSeconds = 0;
                }
                this.startCallTimer();
                this.refreshScreen();
            }
        }, 1500);

        this.refreshScreen();
    };

    // Pressing a number during a call answers the voice on the other end. An
    // option may hand the party over to the courts, which closes the phone.
    Scene_AnokiPhone.prototype.answerCallOption = function(option) {
        const next = option.run ? option.run(this) : null;
        if (this._closing) return;
        this._nodeSeconds = 0;
        if (!next) {
            this.endCall();
            return;
        }
        this._callNode = next;
        this.refreshScreen();
    };

    // Turning yourself in leaves the handset: the trial and the cell live on
    // the map, so the command is queued and run once the map is back up.
    Scene_AnokiPhone.prototype.exitToTrial = function(command) {
        if (this._closing) return;
        this._closing = true;
        this.clearCallTimer();
        this.clearConnectTimeout();
        if ($gameSystem && this._callDuration > 0) {
            $gameSystem.addCallToHistory(this._dialedNumber, this._currentCallName,
                this._callDuration);
        }
        $gameTemp._hexphonePendingTrial = command;
        SceneManager.goto(Scene_Map);
    };

    Scene_AnokiPhone.prototype.startCallTimer = function() {
        this.clearCallTimer();
        this._callTimer = setInterval(() => {
            if (this._closing) {
                this.clearCallTimer();
                return;
            }
            if (this._inCall) {
                this._callDuration++;
                if (!this._freeCall && !$gameSystem.consumeCredits(callCostPerSecond)) {
                    this.endCall();
                    this.playErrorSound();
                    return;
                }
                // The other end rings off once it has said its piece.
                if (this._callNode && this._callNode.autoEnd) {
                    this._nodeSeconds++;
                    if (this._nodeSeconds >= 5) {
                        this.endCall();
                        return;
                    }
                }
                this.refreshScreen();
            }
        }, 1000);
    };

    Scene_AnokiPhone.prototype.clearCallTimer = function() {
        if (this._callTimer) {
            clearInterval(this._callTimer);
            this._callTimer = null;
        }
    };

    Scene_AnokiPhone.prototype.clearConnectTimeout = function() {
        if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }
    };

    Scene_AnokiPhone.prototype.endCall = function() {
        this.clearCallTimer();
        this.clearConnectTimeout();

        if (this._callDuration > 0) {
            $gameSystem.addCallToHistory(this._dialedNumber, this._currentCallName, this._callDuration);
        }

        this._inCall = false;
        this._freeCall = false;
        this._callScript = null;
        this._callNode = null;
        this._nodeSeconds = 0;
        this._screenMode = 'home';
        this._dialedNumber = '';
        this._currentCallName = '';
        this._currentCallEventId = 0;
        this._callDuration = 0;

        this.playHangupSound();
        this.refreshScreen();
    };

    Scene_AnokiPhone.prototype.answerIncomingCall = function() {
        const contact = this._incomingContact;
        this._incomingContact = null;
        if (!contact) {
            this._screenMode = 'home';
            this.refreshScreen();
            return;
        }
        this.playConnectSound();
        if (contact.commonEventId > 0) {
            $gameSystem.addCallToHistory(contact.number, contact.name, 0);
            this.exitToMapWithEvent(contact.commonEventId);
        } else {
            this._screenMode = 'calling';
            this._dialedNumber = contact.number;
            this._currentCallName = contact.name;
            this._currentCallEventId = 0;
            this._inCall = true;
            this._freeCall = true; // incoming calls cost nothing
            this._callDuration = 0;
            this.startCallTimer();
            this.refreshScreen();
        }
    };

    Scene_AnokiPhone.prototype.declineIncomingCall = function() {
        const contact = this._incomingContact;
        this._incomingContact = null;
        if (contact) {
            $gameSystem.addCallToHistory(contact.number, contact.name, 0, getText('Declined'));
        }
        this.playHangupSound();
        this._screenMode = 'home';
        this.refreshScreen();
    };

    //-------------------------------------------------------------------------
    // Scene exit paths (all guarded against double execution)
    //-------------------------------------------------------------------------

    Scene_AnokiPhone.prototype.safeClose = function() {
        if (this._closing) return;
        this._closing = true;
        this.popScene();
    };

    Scene_AnokiPhone.prototype.exitToMapWithEvent = function(commonEventId) {
        if (this._closing) return;
        this._closing = true;
        $gameTemp.reserveCommonEvent(commonEventId);
        SceneManager.goto(Scene_Map);
    };

    //-------------------------------------------------------------------------
    // Update
    //-------------------------------------------------------------------------

    Scene_AnokiPhone.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._closing) return;

        this._screenAnimation++;
        this.updateEngineInput();
        this.updateGameSession();
        this.updatePhoneScreen();
        this.handleInput();
        this.updateCursorBlink();
        this.updateAmbient();
    };

    Scene_AnokiPhone.prototype.updateEngineInput = function() {
        // ok = MENU button, cancel = END button, arrows = list navigation.
        // Keyboard digits arrive via the DOM listener instead.
        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            this.onEndButton();
            return;
        }
        if (Input.isTriggered('ok')) {
            if (this._screenMode !== 'game') {
                this.onMenuButton();
                return;
            }
        }

        if (this._screenMode === 'game') return; // games read Input directly

        if (Input.isRepeated('down')) {
            this.navigateList(1);
        } else if (Input.isRepeated('up')) {
            this.navigateList(-1);
        } else if (Input.isTriggered('left')) {
            if (this._screenMode === 'settings') { this.changeRingtone(-1); this.refreshScreen(); }
        } else if (Input.isTriggered('right')) {
            if (this._screenMode === 'settings') { this.changeRingtone(1); this.refreshScreen(); }
        }
    };

    Scene_AnokiPhone.prototype.navigateList = function(delta) {
        switch (this._screenMode) {
            case 'menu':
                this._selectedMenuIndex = (this._selectedMenuIndex + delta + 7) % 7;
                this.playButtonSound();
                this.refreshScreen();
                break;
            case 'contacts':
                this.onNumberButton(delta > 0 ? '2' : '8');
                break;
            case 'messages':
                this.onNumberButton(delta > 0 ? '2' : '8');
                break;
            case 'games':
                this.onNumberButton(delta > 0 ? '2' : '8');
                break;
            case 'services':
                this.onNumberButton(delta > 0 ? '2' : '8');
                break;
            case 'callHistory':
                this.onNumberButton(delta > 0 ? '2' : '8');
                break;
            case 'messageView':
                this.onNumberButton(delta > 0 ? '2' : '8');
                break;
        }
    };

    Scene_AnokiPhone.prototype.updateGameSession = function() {
        if (this._screenMode === 'game' && this._gameSession) {
            let dirty = true;
            if (typeof this._gameSession.update === 'function') {
                dirty = this._gameSession.update(this);
            }
            // Built-in games return an explicit boolean so we only re-render the
            // LCD when their state actually changed (most frames nothing moves).
            // Sessions that return undefined keep refreshing every frame, matching
            // their original behaviour. onKey-driven changes set _gameSessionDirty.
            if (dirty !== false || this._gameSessionDirty) {
                this.refreshScreen();
                this._gameSessionDirty = false;
            }
        }
    };

    Scene_AnokiPhone.prototype.updateCursorBlink = function() {
        if (this._screenMode === 'dial' || this._screenMode === 'addContact') {
            const oldBlink = this._cursorBlink;
            this._cursorBlink = (this._cursorBlink + 1) % 60;
            if (Math.floor(oldBlink / 30) !== Math.floor(this._cursorBlink / 30)) {
                this.refreshScreen();
            }
        } else {
            this._cursorBlink = 0;
        }
    };

    Scene_AnokiPhone.prototype.updateAmbient = function() {
        // Keep the home clock ticking and re-ring incoming calls
        if (this._screenMode === 'home' && this._screenAnimation % 60 === 0) {
            this.refreshScreen();
        }
        if (this._screenMode === 'incoming' && this._screenAnimation % 90 === 0) {
            this.playRingtone();
        }
        this._contentSprite.opacity = (this._screenAnimation % 120 === 0) ? 250 : 255;
    };

    //-------------------------------------------------------------------------
    // Sounds
    //-------------------------------------------------------------------------

    Scene_AnokiPhone.prototype.playButtonSound = function() {
        playSeSafe('Cursor1', 60, 120);
    };

    Scene_AnokiPhone.prototype.playErrorSound = function() {
        playSeSafe('Buzzer1', 70, 100);
    };

    Scene_AnokiPhone.prototype.playRingtone = function() {
        const ringtone = $gameSystem.getCurrentRingtone();
        if (ringtone) playSeSafe(ringtone.se, ringtone.volume, ringtone.pitch);
    };

    Scene_AnokiPhone.prototype.playConnectSound = function() {
        playSeSafe('Decision2', 70, 120);
    };

    Scene_AnokiPhone.prototype.playHangupSound = function() {
        playSeSafe('Cancel2', 70, 90);
    };

    Scene_AnokiPhone.prototype.playPowerOnSound = function() {
        playSeSafe('Computer', 70, 150); // i18n-ignore: SE filename
    };

    //-------------------------------------------------------------------------
    // Teardown
    //-------------------------------------------------------------------------

    Scene_AnokiPhone.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        this._closing = true;
        this.clearCallTimer();
        this.clearConnectTimeout();
        if (this._keyDownHandler) {
            document.removeEventListener('keydown', this._keyDownHandler);
            this._keyDownHandler = null;
        }
        this._gameSession = null;
        AudioManager.stopSe();
        playSeSafe('Cancel1', 70, 80);
    };

    // Export for extension plugins (HexphonePuzzle-style hooks, and
    // PublicPhoneSystem.js's own booth scene, which reuses this button sprite)
    window.Scene_AnokiPhone = Scene_AnokiPhone;
    window.Scene_Hexphone = Scene_AnokiPhone;
    window.Sprite_AnokiButton = Sprite_AnokiButton;

    //=============================================================================
    // Sprite_AnokiButton
    //=============================================================================

    function Sprite_AnokiButton() {
        this.initialize(...arguments);
    }

    Sprite_AnokiButton.prototype = Object.create(Sprite_Clickable.prototype);
    Sprite_AnokiButton.prototype.constructor = Sprite_AnokiButton;

    Sprite_AnokiButton.prototype.initialize = function(x, y, width, height, label, color) {
        Sprite_Clickable.prototype.initialize.call(this);
        this._baseX = x;
        this._baseY = y;
        // The cap is drawn inside a padded bitmap so the shadow it drops on
        // the keypad plate has somewhere to fall.
        this._pad = 6;
        this._buttonWidth = width;
        this._buttonHeight = height;
        this._label = label;
        this._color = color || '#4a5568';
        this._wasPressed = false;
        this.move(x - 6, y - 6);
        this.createButtonBitmap();
    };

    Sprite_AnokiButton.prototype.createButtonBitmap = function() {
        this.bitmap = new Bitmap(this._buttonWidth + this._pad * 2,
            this._buttonHeight + this._pad * 2);
        this.redraw();
    };

    // A key cap: the moulding tapers towards its top face, so the cap is drawn
    // as a trapezoid, dark along the flank that faces away from the light and
    // bright along the top edge, with a soft gloss over the crown.
    Sprite_AnokiButton.prototype.redraw = function(pressed) {
        const bitmap = this.bitmap;
        const ctx = bitmap.context;
        const p = this._pad;
        const w = this._buttonWidth;
        const h = this._buttonHeight;
        const sink = pressed ? 2 : 0;

        bitmap.clear();
        ctx.save();

        // The recess in the plate the cap rises out of.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        roundedPath(ctx, p - 2, p + 1, w + 4, h + 4, 10);
        ctx.fill();

        // The flank of the cap, the plastic seen edge on.
        const flank = ctx.createLinearGradient(0, p, 0, p + h);
        flank.addColorStop(0, this.darkenColor(this._color, 12));
        flank.addColorStop(1, this.darkenColor(this._color, 48));
        ctx.fillStyle = flank;
        roundedPath(ctx, p, p + sink, w, h, 9);
        ctx.fill();

        // The top face, narrower than the base and lifted clear of it.
        const inset = 4;
        const lift = pressed ? 1 : 3;
        const ty = p + sink + 1;
        const tw = w - inset * 2;
        const th = h - lift - 2;
        const crown = ctx.createLinearGradient(p + inset, ty, p + inset, ty + th);
        crown.addColorStop(0, this.lightenColor(this._color, pressed ? 8 : 26));
        crown.addColorStop(0.48, this._color);
        crown.addColorStop(1, this.darkenColor(this._color, 22));
        ctx.fillStyle = crown;
        roundedPath(ctx, p + inset, ty, tw, th, 7);
        ctx.fill();

        // The lit edge along the top of the crown and the shade under it.
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (pressed ? 0.16 : 0.34) + ')';
        ctx.beginPath();
        ctx.moveTo(p + inset + 7, ty + 1);
        ctx.lineTo(p + inset + tw - 7, ty + 1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        roundedPath(ctx, p + inset, ty, tw, th, 7);
        ctx.stroke();

        // Gloss: one highlight across the upper half of the crown.
        ctx.save();
        roundedPath(ctx, p + inset, ty, tw, th, 7);
        ctx.clip();
        const gloss = ctx.createLinearGradient(0, ty, 0, ty + th * 0.6);
        gloss.addColorStop(0, 'rgba(255, 255, 255, ' + (pressed ? 0.06 : 0.20) + ')');
        gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gloss;
        ctx.fillRect(p + inset, ty, tw, th * 0.6);
        ctx.restore();

        ctx.restore();

        bitmap.fontFace = 'Arial, sans-serif';
        bitmap.textColor = '#f1f5f9';
        bitmap.outlineColor = 'rgba(0, 0, 0, 0.65)';
        bitmap.outlineWidth = 3;

        const lines = this._label.split('\n');
        if (lines.length === 1 || !lines[1]) {
            bitmap.fontSize = 15;
            bitmap.drawText(lines[0], p, ty + th / 2 - 10, w, 20, 'center');
        } else {
            bitmap.fontSize = 17;
            bitmap.drawText(lines[0], p, ty + 2, w, 20, 'center');
            bitmap.fontSize = 9;
            bitmap.textColor = '#c3ccd8';
            bitmap.drawText(lines[1], p, ty + 19, w, 14, 'center');
        }
    };

    Sprite_AnokiButton.prototype.lightenColor = function(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255))
            .toString(16).slice(1);
    };

    Sprite_AnokiButton.prototype.darkenColor = function(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R > 0 ? R : 0) * 0x10000 +
            (G > 0 ? G : 0) * 0x100 +
            (B > 0 ? B : 0))
            .toString(16).slice(1);
    };

    Sprite_AnokiButton.prototype.setClickHandler = function(handler) {
        this._clickHandler = handler;
    };

    Sprite_AnokiButton.prototype.onClick = function() {
        if (this._clickHandler) this._clickHandler();
    };

    Sprite_AnokiButton.prototype.update = function() {
        Sprite_Clickable.prototype.update.call(this);
        const pressed = this.isPressed();
        if (pressed !== this._wasPressed) {
            this._wasPressed = pressed;
            this.redraw(pressed);
        }
    };

    //=============================================================================
    // Built-in minigames (LCD style, drawn on the 250x170 content bitmap)
    //=============================================================================

    const LCD_DARK = '#1a2a1a';
    const LCD_MID = '#4a5a40';

    //---------------------------------------------------------------------------
    // Snake
    //---------------------------------------------------------------------------

    class HexphoneSnakeGame {
        constructor() {
            this.reset();
            if (window.MinigameFun) window.MinigameFun.played('Video Gaming'); // i18n-ignore: leisure activity id
        }

        reset() {
            this.cols = 25;
            this.rows = 15;
            this.cell = 10;
            this.snake = [{x: 12, y: 7}, {x: 11, y: 7}, {x: 10, y: 7}];
            this.dir = {x: 1, y: 0};
            this.nextDir = {x: 1, y: 0};
            this.food = null;
            this.score = 0;
            this.gameOver = false;
            this.tick = 0;
            this.speed = 9; // frames per step
            this.placeFood();
        }

        placeFood() {
            let x, y, tries = 0;
            do {
                x = Math.floor(Math.random() * this.cols);
                y = Math.floor(Math.random() * this.rows);
                tries++;
            } while (this.snake.some(s => s.x === x && s.y === y) && tries < 200);
            this.food = {x, y};
        }

        setDirection(dx, dy) {
            if (dx === -this.dir.x && dy === -this.dir.y) return;
            this.nextDir = {x: dx, y: dy};
        }

        onKey(value) {
            if (value === '4') this.setDirection(-1, 0);
            else if (value === '6') this.setDirection(1, 0);
            else if (value === '2') this.setDirection(0, 1);
            else if (value === '8') this.setDirection(0, -1);
            else if (value === '5' || value === 'menu') {
                if (this.gameOver) this.reset();
            }
        }

        // Returns true when the visible state changed (needs an LCD redraw).
        // Direction input only alters nextDir, which isn't drawn until the snake
        // actually steps, so those frames report no change.
        update(scene) {
            if (Input.isTriggered('left')) this.setDirection(-1, 0);
            if (Input.isTriggered('right')) this.setDirection(1, 0);
            if (Input.isTriggered('up')) this.setDirection(0, -1);
            if (Input.isTriggered('down')) this.setDirection(0, 1);
            if (this.gameOver) {
                if (Input.isTriggered('ok')) { this.reset(); return true; }
                return false;
            }

            this.tick++;
            if (this.tick < this.speed) return false;
            this.tick = 0;

            this.dir = this.nextDir;
            const head = {x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y};

            if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows ||
                this.snake.some(s => s.x === head.x && s.y === head.y)) {
                this.gameOver = true;
                playSeSafe('Buzzer1', 60, 110);
                if (window.MinigameFun) window.MinigameFun.lost('Video Gaming'); // i18n-ignore: leisure activity id
                return true;
            }

            this.snake.unshift(head);
            if (this.food && head.x === this.food.x && head.y === this.food.y) {
                this.score += 10;
                this.speed = Math.max(4, 9 - Math.floor(this.score / 50));
                playSeSafe('Cursor1', 50, 150);
                this.placeFood();
            } else {
                this.snake.pop();
            }
            return true;
        }

        draw(bitmap) {
            const boardH = this.rows * this.cell;

            for (const seg of this.snake) {
                bitmap.fillRect(seg.x * this.cell + 1, seg.y * this.cell + 1, this.cell - 2, this.cell - 2, LCD_DARK);
            }
            if (this.food) {
                bitmap.fillRect(this.food.x * this.cell + 2, this.food.y * this.cell + 2, this.cell - 4, this.cell - 4, LCD_MID);
            }

            bitmap.fontSize = 11;
            bitmap.textColor = LCD_DARK;
            bitmap.drawText(getText('Score') + ': ' + this.score, 4, boardH, 150, 18, 'left');

            if (this.gameOver) {
                bitmap.fontSize = 16;
                bitmap.fontBold = true;
                bitmap.drawText(getText('GAME OVER'), 0, 55, 250, 20, 'center');
                bitmap.fontBold = false;
                bitmap.fontSize = 10;
                bitmap.drawText(getText('Restart hint'), 0, 80, 250, 16, 'center');
            }
        }
    }

    //---------------------------------------------------------------------------
    // Bitstack
    //
    // The phone's falling-bit puzzle. It shares its board and its bit
    // catalogue with the lockpicking puzzle (Minigames/UnlockingBlocks.js):
    // a register nine cells across and sixteen deep with parity iron cut into
    // its walls, fed bits that are single pins, five cell profiles, pierced
    // collars and long combs rather than four cell pieces, and a full row
    // flushes where it lies instead of collapsing the stack on top of it.
    //---------------------------------------------------------------------------

    const BITSTACK_COLS = 9;
    const BITSTACK_ROWS = 16;

    // The bit catalogue. The lockpicking puzzle owns it and loads first, so the
    // phone reads it off the namespace; the copy below is only there so this
    // file still plays on its own.
    const BITSTACK_TIERS = (window.UnlockingBlocks && window.UnlockingBlocks.SHAPE_TIERS) || [
        [
            [[1]],
            [[2], [2]],
            [[3, 3]],
            [[4, 0], [4, 4]],
            [[5, 5], [0, 5]]
        ],
        [
            [[1, 0, 1], [1, 1, 1]],
            [[0, 2, 0], [2, 2, 2], [0, 2, 0]],
            [[3, 0, 0], [3, 3, 0], [0, 3, 3]],
            [[4, 0, 0], [4, 0, 0], [4, 4, 4]],
            [[5, 5, 5], [0, 5, 0], [0, 5, 0]]
        ],
        [
            [[1, 1, 1], [1, 0, 1], [1, 1, 1]],
            [[2, 0, 2], [2, 2, 2], [2, 0, 2]],
            [[3, 3, 3, 3], [0, 0, 3, 0], [0, 0, 3, 0]],
            [[4, 0, 4], [4, 4, 4], [0, 4, 0]],
            [[0, 5, 0], [5, 5, 5], [5, 0, 5]]
        ],
        [
            [[1, 0, 1, 0, 1], [1, 1, 1, 1, 1]],
            [[2, 0, 0, 0], [2, 2, 0, 0], [0, 2, 2, 0], [0, 0, 2, 2]],
            [[3, 0, 0], [3, 3, 3], [3, 0, 3], [3, 0, 0]],
            [[4, 4, 0, 4, 4], [0, 4, 4, 4, 0]],
            [[0, 5, 0], [5, 5, 5], [0, 5, 0], [5, 0, 5]]
        ]
    ];

    // Flattened once: the shape list every draw indexes into, plus the tier
    // each entry belongs to, so a level only deals out of the tiers it earned.
    const BITSTACK_SHAPES = [];
    const BITSTACK_TIER_OF = [];
    BITSTACK_TIERS.forEach((tier, index) => {
        for (const shape of tier) {
            BITSTACK_SHAPES.push(shape);
            BITSTACK_TIER_OF.push(index);
        }
    });

    // Parity iron: the cells cut into the walls of the register. They count
    // towards a full row and survive the flush, so the profile stays readable.
    const BITSTACK_WALL = -1;

    // One more tier of bits every three levels.
    function bitstackTierCount(level) {
        const step = Math.floor((Math.max(1, level) - 1) / 3);
        return Math.min(1 + step, BITSTACK_TIERS.length);
    }

    class HexphoneBitstackGame {
        constructor() {
            this.reset();
            if (window.MinigameFun) window.MinigameFun.played('Video Gaming'); // i18n-ignore: leisure activity id
            // A phone game has no scene of its own, so the diary is told here
            // rather than by Core/Diary.js watching the scene stack.
            if (window.Diary && typeof window.Diary.record === 'function') {
                try {
                    window.Diary.record('minigame.played', { // i18n-ignore: diary entry kind
                        game: T('Diary.game.bitstack'), // i18n-ignore: i18n key
                        outcome: '',
                        score: ''
                    }, { dedupe: 'bitstack' }); // i18n-ignore: dedupe key
                } catch (e) { /* the game still played */ }
            }
        }

        reset() {
            this.cols = BITSTACK_COLS;
            this.rows = BITSTACK_ROWS;
            this.cell = 8;
            this.grid = Array.from({length: this.rows}, () => new Array(this.cols).fill(0));
            this.score = 0;
            this.rowsFlushed = 0;
            this.level = 1;
            this.tiers = bitstackTierCount(1);
            this.gameOver = false;
            this.dropTimer = 0;
            this.dropSpeed = 50;
            this.bag = [];
            this.current = null;
            this.next = this.drawBit();
            this.cutWalls();
            this.spawn();
        }

        //--- the bits ---------------------------------------------------------
        // Bag draw: every bit the level deals comes up once before any of them
        // comes round again, so a level never deals four combs in a row.
        drawBit() {
            if (!this.bag.length) {
                BITSTACK_TIER_OF.forEach((tier, index) => {
                    if (tier < this.tiers) this.bag.push(index);
                });
                for (let i = this.bag.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const swap = this.bag[i];
                    this.bag[i] = this.bag[j];
                    this.bag[j] = swap;
                }
            }
            const index = this.bag.pop();
            return {index: index, shape: BITSTACK_SHAPES[index].map(row => row.slice()), x: 0, y: 0};
        }

        //--- the walls --------------------------------------------------------
        // Teeth of parity iron bitten in from the left and the right, stepping
        // every few rows. Only empty cells are ever written, and the mouth of
        // the register (the top rows) is left clear so a bit can still be fed
        // in. Deeper at higher levels, which is what makes a level narrower
        // rather than merely faster.
        cutWalls() {
            const widest = BITSTACK_SHAPES.reduce((w, shape) => Math.max(w, shape[0].length), 1);
            const room = Math.max(0, Math.floor((this.cols - widest) / 2));
            const depth = Math.min(1 + Math.floor((this.level - 1) / 4), room);
            if (depth <= 0) return;
            const run = this.level <= 5 ? 3 : 2;
            let y = Math.min(4, this.rows);
            while (y < this.rows) {
                const height = Math.min(1 + Math.floor(Math.random() * run), this.rows - y);
                const left = Math.floor(Math.random() * (depth + 1));
                const right = Math.floor(Math.random() * (depth + 1 - left));
                for (let i = 0; i < height; i++) {
                    for (let x = 0; x < left; x++) {
                        if (!this.grid[y + i][x]) this.grid[y + i][x] = BITSTACK_WALL;
                    }
                    for (let x = 0; x < right; x++) {
                        const bx = this.cols - 1 - x;
                        if (!this.grid[y + i][bx]) this.grid[y + i][bx] = BITSTACK_WALL;
                    }
                }
                y += height;
            }
        }

        //--- queries ----------------------------------------------------------
        cells(shape, x, y) {
            const out = [];
            for (let cy = 0; cy < shape.length; cy++) {
                for (let cx = 0; cx < shape[cy].length; cx++) {
                    if (shape[cy][cx]) out.push([x + cx, y + cy]);
                }
            }
            return out;
        }

        fits(shape, x, y) {
            return this.cells(shape, x, y).every(([cx, cy]) => {
                if (cx < 0 || cx >= this.cols || cy >= this.rows) return false;
                return cy < 0 || this.grid[cy][cx] === 0;
            });
        }

        // Where the bit would come to rest if it were dropped now.
        ghostY() {
            if (!this.current) return 0;
            let y = this.current.y;
            while (this.fits(this.current.shape, this.current.x, y + 1)) y++;
            return y;
        }

        //--- moves ------------------------------------------------------------
        spawn() {
            this.current = this.next;
            this.next = this.drawBit();
            this.current.x = Math.floor((this.cols - this.current.shape[0].length) / 2);
            this.current.y = 0;
            if (!this.fits(this.current.shape, this.current.x, this.current.y)) {
                this.gameOver = true;
                playSeSafe('Buzzer1', 60, 100);
                if (window.MinigameFun) window.MinigameFun.lost('Video Gaming'); // i18n-ignore: leisure activity id
            }
        }

        move(dx) {
            if (this.gameOver || !this.current) return;
            if (this.fits(this.current.shape, this.current.x + dx, this.current.y)) {
                this.current.x += dx;
            }
        }

        rotate(clockwise) {
            if (this.gameOver || !this.current) return;
            const shape = this.current.shape;
            const h = shape.length;
            const w = shape[0].length;
            const out = [];
            for (let i = 0; i < w; i++) out.push(new Array(h).fill(0));
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (clockwise) out[x][h - 1 - y] = shape[y][x];
                    else out[w - 1 - x][y] = shape[y][x];
                }
            }
            // The bits are up to five cells wide, so a turn against a wall
            // needs room to step away from it.
            for (const kick of [0, -1, 1, -2, 2]) {
                if (this.fits(out, this.current.x + kick, this.current.y)) {
                    this.current.x += kick;
                    this.current.shape = out;
                    return;
                }
            }
        }

        softDrop() {
            if (this.gameOver || !this.current) return false;
            if (this.fits(this.current.shape, this.current.x, this.current.y + 1)) {
                this.current.y++;
                return true;
            }
            this.settle();
            return false;
        }

        hardDrop() {
            while (this.softDrop()) {}
        }

        settle() {
            const kinds = this.current.shape;
            for (let cy = 0; cy < kinds.length; cy++) {
                for (let cx = 0; cx < kinds[cy].length; cx++) {
                    const kind = kinds[cy][cx];
                    if (!kind) continue;
                    const bx = this.current.x + cx;
                    const by = this.current.y + cy;
                    if (by >= 0 && by < this.rows && bx >= 0 && bx < this.cols) {
                        this.grid[by][bx] = kind;
                    }
                }
            }
            this.current = null;
            this.flushRows();
            this.spawn();
        }

        // A full row voids where it lies: nothing above it falls, and the
        // parity iron cut into the walls stays behind.
        voidFullRows() {
            const flushed = [];
            for (let y = 0; y < this.rows; y++) {
                let full = true;
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] === 0) { full = false; break; }
                }
                if (full) flushed.push(y);
            }
            for (const y of flushed) {
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] !== BITSTACK_WALL) this.grid[y][x] = 0;
                }
            }
            return flushed.length;
        }

        flushRows() {
            const flushed = this.voidFullRows();
            if (!flushed) return;
            this.rowsFlushed += flushed;
            this.score += flushed * (80 + 40 * flushed) * this.level;
            const level = Math.floor(this.rowsFlushed / 6) + 1;
            if (level > this.level) {
                this.level = level;
                this.tiers = bitstackTierCount(level);
                this.bag = [];
                this.dropSpeed = Math.max(9, 50 - this.level * 4);
                // A deeper profile is bitten into the walls with every level. A
                // fresh tooth can complete a row on its own, so the board is
                // read again rather than left with a row standing full.
                this.cutWalls();
                this.voidFullRows();
            }
            playSeSafe('Decision2', 50, 130);
        }

        onKey(value) {
            if (this.gameOver) {
                if (value === '5' || value === 'menu') this.reset();
                return;
            }
            if (value === '4') this.move(-1);
            else if (value === '6') this.move(1);
            else if (value === '2' || value === '9') this.rotate(true);
            else if (value === '7') this.rotate(false);
            else if (value === '8') this.softDrop();
            else if (value === '5' || value === 'menu') this.hardDrop();
        }

        // Returns true when the visible state changed (needs an LCD redraw):
        // any move, a turn, a drop, or a gravity step.
        update(scene) {
            if (this.gameOver) {
                if (Input.isTriggered('ok')) { this.reset(); return true; }
                return false;
            }

            let changed = false;
            if (Input.isRepeated('left')) { this.move(-1); changed = true; }
            if (Input.isRepeated('right')) { this.move(1); changed = true; }
            if (Input.isTriggered('up')) { this.rotate(true); changed = true; }
            if (Input.isTriggered('pageup')) { this.rotate(false); changed = true; }
            if (Input.isRepeated('down')) { this.softDrop(); changed = true; }
            if (Input.isTriggered('ok')) { this.hardDrop(); changed = true; }
            if (this.gameOver) return true;

            this.dropTimer++;
            if (this.dropTimer >= this.dropSpeed) {
                this.dropTimer = 0;
                this.softDrop();
                changed = true;
            }
            return changed;
        }

        draw(bitmap) {
            const ox = 18;
            const oy = 4;
            const boardW = this.cols * this.cell;
            const boardH = this.rows * this.cell;

            // The register walls
            const ctx = bitmap.context;
            ctx.strokeStyle = LCD_DARK;
            ctx.lineWidth = 1;
            ctx.strokeRect(ox - 1.5, oy - 0.5, boardW + 3, boardH + 2);

            // Settled bits, and the parity iron as a lighter tooth
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    const cellValue = this.grid[y][x];
                    if (!cellValue) continue;
                    const px = ox + x * this.cell;
                    const py = oy + 1 + y * this.cell;
                    if (cellValue === BITSTACK_WALL) {
                        bitmap.fillRect(px, py, this.cell - 1, this.cell - 1, LCD_MID);
                        bitmap.fillRect(px + 2, py + 2, this.cell - 5, this.cell - 5, LCD_DARK);
                    } else {
                        bitmap.fillRect(px, py, this.cell - 1, this.cell - 1, LCD_DARK);
                    }
                }
            }

            // Where the falling bit would land, then the bit itself
            if (this.current && !this.gameOver) {
                const gy = this.ghostY();
                if (gy !== this.current.y) {
                    for (const [cx, cy] of this.cells(this.current.shape, this.current.x, gy)) {
                        if (cy < 0) continue;
                        bitmap.fillRect(ox + cx * this.cell + 3, oy + 1 + cy * this.cell + 3,
                            2, 2, LCD_MID);
                    }
                }
                for (const [cx, cy] of this.cells(this.current.shape, this.current.x, this.current.y)) {
                    if (cy < 0) continue;
                    bitmap.fillRect(ox + cx * this.cell, oy + 1 + cy * this.cell,
                        this.cell - 1, this.cell - 1, LCD_DARK);
                }
            }

            // Readouts
            const sx = ox + boardW + 16;
            bitmap.fontSize = 10;
            bitmap.textColor = LCD_DARK;
            bitmap.drawText(getText('Score'), sx, 4, 120, 14, 'left');
            bitmap.drawText(String(this.score), sx, 16, 120, 14, 'left');
            bitmap.drawText(getText('Rows') + ': ' + this.rowsFlushed, sx, 34, 120, 14, 'left');
            bitmap.drawText(getText('Level') + ': ' + this.level, sx, 46, 120, 14, 'left');
            bitmap.drawText(getText('Tier') + ': ' + this.tiers, sx, 58, 120, 14, 'left');
            bitmap.drawText(getText('Next'), sx, 78, 120, 14, 'left');

            // The next bit, at five pixels a cell: the catalogue runs to five
            // wide and four deep, so the preview is sized for a comb.
            if (this.next) {
                for (let y = 0; y < this.next.shape.length; y++) {
                    for (let x = 0; x < this.next.shape[y].length; x++) {
                        if (!this.next.shape[y][x]) continue;
                        bitmap.fillRect(sx + x * 6, 94 + y * 6, 5, 5, LCD_MID);
                    }
                }
            }

            if (this.gameOver) {
                bitmap.fontSize = 14;
                bitmap.fontBold = true;
                bitmap.drawText(getText('GAME OVER'), 0, 65, 250, 20, 'center');
                bitmap.fontBold = false;
                bitmap.fontSize = 9;
                bitmap.drawText(getText('Restart hint'), 0, 85, 250, 14, 'center');
            }
        }
    }

    // i18n-ignore-start: registry ids
    window.registerHexphoneGame('Snake', { create: () => new HexphoneSnakeGame() });
    window.registerHexphoneGame('Bitstack', { create: () => new HexphoneBitstackGame() });
    // i18n-ignore-end

    //=============================================================================
    // Menu integration
    //=============================================================================

    const Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        Window_MenuCommand_addOriginalCommands.call(this);
        const hasRequiredItem = requiredItemIds.some(itemId => {
            const item = $dataItems[itemId];
            return item && $gameParty.hasItem(item);
        });
        this.addCommand(menuText, 'anokiPhone', hasRequiredItem, 187);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('anokiPhone', this.commandAnokiPhone.bind(this));
        // The parchment main menu Tools page triggers the symbol 'hexphone'
        this._commandWindow.setHandler('hexphone', this.commandAnokiPhone.bind(this));
    };

    Scene_Menu.prototype.commandAnokiPhone = function() {
        SceneManager.push(Scene_AnokiPhone);
    };

    //=============================================================================
    // Plugin commands (registered under every historical plugin name)
    //=============================================================================

    function registerCommandAll(commandName, fn) {
        for (const key of commandKeys) {
            PluginManager.registerCommand(key, commandName, fn);
        }
    }

    registerCommandAll("openPhone", () => {
        SceneManager.push(Scene_AnokiPhone);
    });

    // Alias documented in older project notes
    registerCommandAll("openHexphone", () => {
        SceneManager.push(Scene_AnokiPhone);
    });

    registerCommandAll("addCredits", args => {
        const amount = Number(args.amount) || 0;
        $gameSystem.addPhoneCredits(amount);
        notify(T('Hexphone.notify.creditsUp', { amount: goldToEuros(amount) }));
    });

    registerCommandAll("removeCredits", args => {
        const amount = Number(args.amount) || 0;
        $gameSystem.addPhoneCredits(-amount);
        notify(T('Hexphone.notify.creditsDown', { amount: goldToEuros(amount) }));
    });

    registerCommandAll("setCredits", args => {
        $gameSystem.setPhoneCredits(Number(args.amount) || 0);
    });

    registerCommandAll("registerContact", args => {
        const contactName = args.contactName;
        if ($gameSystem.registerContact(contactName)) {
            notify(contactName + T('Hexphone.notify.added'));
        } else {
            notify(T('Hexphone.notify.contactPrefix') + contactName + T('Hexphone.notify.notFound'));
        }
    });

    registerCommandAll("addContact", args => {
        if ($gameSystem.addCustomContact(args.name, args.number, args.commonEventId)) {
            notify(args.name + T('Hexphone.notify.added'));
        }
    });

    registerCommandAll("removeContact", args => {
        const contactName = args.contactName;
        if ($gameSystem.removeContact(contactName)) {
            notify(contactName + T('Hexphone.notify.removed'));
        }
    });

    registerCommandAll("receiveMessage", args => {
        $gameSystem.addMessage(args.sender, args.content, 'received');
        notify(T('Hexphone.notify.newMessage') + args.sender + '!');
        playSeSafe('Bell1', 90, 120);
    });

    registerCommandAll("sendMessage", args => {
        if ($gameSystem.consumeCredits(messageCost)) {
            $gameSystem.addMessage(args.recipient, args.content, 'sent');
            notify(T('Hexphone.notify.messageSent') + args.recipient);
        } else {
            notify(T('Hexphone.notify.noCredits'));
            playSeSafe('Buzzer1', 70, 100);
        }
    });

    registerCommandAll("clearMessages", () => {
        $gameSystem.clearPhoneMessages();
    });

    registerCommandAll("receiveCall", args => {
        const contactName = args.contactName;
        const contact = $gameSystem.getContacts()[contactName] || availableContacts[contactName];
        if (!contact) {
            console.warn('HexphoneSystem: receiveCall for unknown contact', contactName);
            return;
        }
        pendingIncomingCall = Object.assign({}, contact);
        if (SceneManager._scene instanceof Scene_AnokiPhone) {
            const scene = SceneManager._scene;
            scene._incomingContact = pendingIncomingCall;
            pendingIncomingCall = null;
            scene._screenMode = 'incoming';
            scene.playRingtone();
            scene.refreshScreen();
        } else {
            SceneManager.push(Scene_AnokiPhone);
        }
    });

    registerCommandAll("addGame", args => {
        addPhoneGame(args.name, args.commonEventId);
    });

    //=============================================================================
    // Canvas roundRect polyfill (older NW.js)
    //=============================================================================

    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
            if (width < 2 * radius) radius = width / 2;
            if (height < 2 * radius) radius = height / 2;
            this.beginPath();
            this.moveTo(x + radius, y);
            this.arcTo(x + width, y, x + width, y + height, radius);
            this.arcTo(x + width, y + height, x, y + height, radius);
            this.arcTo(x, y + height, x, y, radius);
            this.arcTo(x, y, x + width, y, radius);
            this.closePath();
        };
    }

    //=============================================================================
    // Handing the party over to the courts
    //
    // Turning yourself in on the emergency line closes the phone; the trial and
    // the cell are run by ErisTrial on the map, so the command waits here until
    // the map has come back up.
    //=============================================================================

    const _Scene_Map_start_hexphone = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start_hexphone.call(this);
        const pending = $gameTemp ? $gameTemp._hexphonePendingTrial : null;
        if (pending) {
            $gameTemp._hexphonePendingTrial = null;
            try {
                PluginManager.callCommand(null, 'ErisTrial', pending, {});
            } catch (e) {
                console.error('Hexphone: could not hand over to ErisTrial', e);
            }
        }
    };

})();
