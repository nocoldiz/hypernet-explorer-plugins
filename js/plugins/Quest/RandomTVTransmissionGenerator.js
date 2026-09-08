/*:
 * @target MZ
 * @plugindesc Random TV Transmission Generator v4.0 - Choosable channels, weekly procedural schedules, the HEXAVIDEO teletext guide, lore-driven template broadcasts and sponsored commercial breaks.
 * @author Omni-Lex
 * @help This plugin creates TV transmissions with multiple message boxes.
 * Each transmission is deterministic based on map location and player name.
 *
 * --- v3.0 TV STUDIO ---
 * Channels, programs and the studio map are defined in
 *   js/db/WorldGen/TVTransmissions.json
 *
 * Each channel owns a "room" (X/Y/facing) on a single hardcoded studio map
 * (studioMapId). Tuning into a channel teleports the player to that room and
 * the on-air programme's cast performs the broadcast: each entry in the
 * programme's "cast" names a character, the bust they are drawn with and the
 * overworld sprite that goes with it, and where a studio event carries the same
 * NAME it turns to face the player and takes that sprite. They read
 * procedurally generated dialogue. A programme with an empty cast is narrated:
 * the Narrator speaks and no bust is shown. The dialogue references
 * live world history (HistoryManager) and current news (NewsManager), so the
 * History Channel and News Desk read back the actual simulated world.
 *
 * The weekly schedule (which program airs on which day/hour) is regenerated
 * every in-game week and is deterministic from the world history seed. The
 * schedule is fixed, but the script is not: every tune-in re-rolls the
 * broadcast, so watching the same channel at the same hour gives new dialogue
 * (10-16 message boxes per slot). During a broadcast, OK advances to the next
 * line and Cancel/Back interrupts the transmission - in both listen and watch
 * mode.
 *
 * --- v4.0 BROADCAST GENERATION ---
 * Every line on air is a template string resolved against the LORE banks in
 * this file, which are transcribed from docs/Lore.odt (the canonical source:
 * where the legacy dumps in legacy_tools/data disagree with it, they are
 * wrong). Tokens nest and resolve recursively, so one written beat such as
 * "{faction} and {faction} have both declared victory at {place}" is thousands
 * of distinct sentences, and {hist} / {news} splice in the live simulated
 * world (HistoryManager, NewsManager) with a templated fallback.
 *
 * Lines also carry their own wording. "{a|b|c}" picks one branch, so a beat
 * written as "{faction} {deny|dispute|reject} the {claim|allegation}" is read
 * out a different way each time without any of the readings being wrong.
 * Alternation nests, resolves inside tokens (a LORE entry may alternate too),
 * and an empty branch makes a clause optional ("{, allegedly|}"). Because a
 * token name is \w+ it can never hold a pipe, so {place} and {a|b} cannot be
 * confused for one another.
 *
 * TVTransmissions.json holds programme METADATA only - id, format, title,
 * tone, cast - plus the channel wiring it has to hold (studio map room). No
 * dialogue lives there. Each "format" maps to a beat bank in
 * TV_SHOWS with an optional lead-in (TV_LEAD) and sign-off (TV_TAIL), and a
 * programme may add its own beats/lead/tail in TV_PROGRAM_CONTENT, keyed by
 * programme id; where it does, about half the body is drawn from those, so
 * several programmes sharing one format still sound like separate shows. A broadcast is a
 * tone-matched opening, a shuffled run of beats, the sign-off and a
 * tone-matched close - the same shape every time and almost never the same
 * words.
 *
 * FUN: finishing a transmission tops up the Fun (leisure) need of every party
 * member by TV_FUN_FULL; interrupting one pays TV_FUN_PARTIAL. Members with
 * the Technophobe trait lose the same amount instead of gaining it.
 *
 * COMMERCIAL BREAKS: any programme that is not already selling something can
 * cut to a sponsored break partway through. A break carries one or two
 * segments, and a segment sells either a product or a POSITION. Ad stock is
 * drawn from the real item database and quotes the item's base price in euros;
 * raw supply categories - Food, BodyPart, Materials and Alchemistry - are never
 * advertised (see TV_AD_EXCLUDED). A propaganda segment is bought instead by
 * one of the powers that carve up the world: the Vatican mission to the Naguka,
 * Rome's war on Jenna of Northpoint, the Kola containment advisories, this
 * morning's edition of Eris's legal code, and the rest of TvAds.propaganda.
 *
 * The channel guide and weekly schedule are drawn as HEXAVIDEO, a 40x25
 * teletext page in the style of Italian Televideo.
 *
 * Plugin Commands:
 * ShowTVTransmission - Shows a random (legacy) TV transmission. Programme types
 *                      with no legacy generator of their own (documentary,
 *                      sports, sitcom, royal_address and ten others) now resolve
 *                      a beat from the matching TV_SHOWS bank instead of reading
 *                      out "Technical Difficulties".
 * OpenTVGuide        - Opens the HEXAVIDEO teletext guide (browse/tune channels)
 * ShowTVSchedule     - Opens the full weekly schedule for all channels
 * TuneChannel        - Tune directly into a channel (and optional program)
 *
 * @command ShowTVTransmission
 * @desc Display a random TV transmission
 * @arg maxMessages
 * @text Max Messages
 * @desc Maximum number of message boxes (1-8)
 * @type number
 * @min 1
 * @max 8
 * @default 3
 *
 * @command OpenTVGuide
 * @text Open TV Guide
 * @desc Opens the HEXAVIDEO teletext guide where the player can browse channels and tune in.
 *
 * @command ShowTVSchedule
 * @text Show TV Schedule
 * @desc Opens the full weekly schedule listing every channel's programs.
 *
 * @command TuneChannel
 * @text Tune Channel
 * @desc Teleports to a channel's studio room and plays its current (or a specific) program.
 * @arg channelId
 * @text Channel ID
 * @desc The channel id from TVTransmissions.json (e.g. history, news, chaos).
 * @type string
 * @arg programId
 * @text Program ID
 * @desc Optional. A specific program id; leave blank for the program currently on air.
 * @type string
 * @default
 * @arg mode
 * @text Mode
 * @desc How to tune in: ask the player (listen / watch / cancel), just listen (in place), or watch (teleport to the studio).
 * @type select
 * @option ask
 * @option listen
 * @option watch
 * @default ask
 */

(() => {
    const pluginName = "RandomTVTransmissionGenerator";


    // ==================================
    // === ENGLISH TV CONTENT ===
    // ==================================

    // The prose below lives in js/i18n/<lang>/conversations/. The banks are lazy
    // views onto those files, re-resolved when the language changes, so nothing
    // is frozen at load time and this file holds keys rather than words.
    let _tvGenBankLang = null;
    const _tvGenBankCache = new Map();
    function tvGenBank(key) {
        const lang = T.language();
        if (lang !== _tvGenBankLang) { _tvGenBankLang = lang; _tvGenBankCache.clear(); }
        if (!_tvGenBankCache.has(key)) _tvGenBankCache.set(key, T.obj(key));
        return _tvGenBankCache.get(key);
    }

    const tvChannels = () => tvGenBank('TvGen.tvChannels');
    
    const newsAnchors = () => tvGenBank('TvGen.newsAnchors');
    
    const commercialProducts = () => tvGenBank('TvGen.commercialProducts');
    
    const weatherLocations = () => tvGenBank('TvGen.weatherLocations');
    
    const celebrities = () => tvGenBank('TvGen.celebrities');
    
    const gameShows = () => tvGenBank('TvGen.gameShows');
    
    const cookingShows = () => tvGenBank('TvGen.cookingShows');
    
    const documentaries = () => tvGenBank('TvGen.documentaries');
    
    const educationalShows = () => tvGenBank('TvGen.educationalShows');
    
    const programTypes = () => tvGenBank('TvGen.programTypes');
    
    // Extended content arrays...
    const newsTemplates = () => tvGenBank('TvGen.newsTemplates');
    
    const companies = () => tvGenBank('TvGen.companies');
    const documents = () => tvGenBank('TvGen.documents');
    const security = () => tvGenBank('TvGen.security');
    const research = () => tvGenBank('TvGen.research');
    const criticism = () => tvGenBank('TvGen.criticism');
    const models = () => tvGenBank('TvGen.models');
    const anomalies = () => tvGenBank('TvGen.anomalies');
    const emotions = () => tvGenBank('TvGen.emotions');
    const services = () => tvGenBank('TvGen.services');
    const victims = () => tvGenBank('TvGen.victims');
    
    // Extended weather templates with more variables
    const weatherTemplates = () => tvGenBank('TvGen.weatherTemplates');
    
    const weather_types = () => tvGenBank('TvGen.weather_types');
    const precipitations = () => tvGenBank('TvGen.precipitations');
    const directions = () => tvGenBank('TvGen.directions');
    const stabilities = () => tvGenBank('TvGen.stabilities');
    const intensities = () => tvGenBank('TvGen.intensities');
    const hazards = () => tvGenBank('TvGen.hazards');
    const time_references = () => tvGenBank('TvGen.time_references');
    
    // Commercial templates with more variety
    const commercialTemplates = () => tvGenBank('TvGen.commercialTemplates');
    
    const problems = () => tvGenBank('TvGen.problems');
    const side_effects = () => tvGenBank('TvGen.side_effects');
    const phone_numbers = () => tvGenBank('TvGen.phone_numbers');
    const impossible_things = () => tvGenBank('TvGen.impossible_things');
    const actions = () => tvGenBank('TvGen.actions');
    
    // Talk show templates with more dialogue
    const talkShowTemplates = () => tvGenBank('TvGen.talkShowTemplates');
    
    const show_names = () => tvGenBank('TvGen.show_names');
    
    const claims = () => tvGenBank('TvGen.claims');
    
    // Emergency broadcasts with more urgency
    const emergencyTemplates = () => tvGenBank('TvGen.emergencyTemplates');
    
    const violation_types = () => tvGenBank('TvGen.violation_types');
    const consequences = () => tvGenBank('TvGen.consequences');
    const threat_types = () => tvGenBank('TvGen.threat_types');
    const disease_types = () => tvGenBank('TvGen.disease_types');
    
    // Memory fragments with more variety
    const memoryFragments = () => tvGenBank('TvGen.memoryFragments');
    
    // Prophetic content with more mystery
    const prophecies = () => tvGenBank('TvGen.prophecies');
    
    // Static content with more variation
    const staticContent = () => tvGenBank('TvGen.staticContent');
    
    // Program content with more complexity
    const soapOperaTemplates = () => tvGenBank('TvGen.soapOperaTemplates');
    
    const soap_names = () => tvGenBank('TvGen.soap_names');
    
    const children_show_templates = () => tvGenBank('TvGen.children_show_templates');
    
    const kids_shows = () => tvGenBank('TvGen.kids_shows');
    
    // Religious/cult programming
    const religiousTemplates = () => tvGenBank('TvGen.religiousTemplates');
    
    const religious_shows = () => tvGenBank('TvGen.religious_shows');
    
    // Late night programming
    const lateNightTemplates = () => tvGenBank('TvGen.lateNightTemplates');
    
    const late_shows = () => tvGenBank('TvGen.late_shows');
    // ==================================
    // === LANGUAGE CONTENT MANAGER ===
    // ==================================

    const contentDatabase = {
        en: {
            channels: tvChannels(), anchors: newsAnchors(), products: commercialProducts(),
            locations: weatherLocations(), celebrities: celebrities(), gameShows: gameShows(),
            cookingShows: cookingShows(), documentaries: documentaries(), educationalShows: educationalShows(),
            programTypes: programTypes(), newsTemplates: newsTemplates(), companies: companies(),
            documents: documents(), security: security(), research: research(), criticism: criticism(),
            models: models(), anomalies: anomalies(), emotions: emotions(), services: services(),
            victims: victims(), weatherTemplates: weatherTemplates(), weather_types: weather_types(),
            precipitations: precipitations(), directions: directions(), stabilities: stabilities(),
            intensities: intensities(), hazards: hazards(), time_references: time_references(),
            commercialTemplates: commercialTemplates(), problems: problems(), side_effects: side_effects(),
            phone_numbers: phone_numbers(), impossible_things: impossible_things(), actions: actions(),
            talkShowTemplates: talkShowTemplates(), show_names: show_names(), claims: claims(),
            emergencyTemplates: emergencyTemplates(), violation_types: violation_types(), consequences: consequences(),
            threat_types: threat_types(), disease_types: disease_types(), memoryFragments: memoryFragments(),
            prophecies: prophecies(), staticContent: staticContent(), soapOperaTemplates: soapOperaTemplates(),
            soap_names: soap_names(), children_show_templates: children_show_templates(), kids_shows: kids_shows(),
            religiousTemplates: religiousTemplates(), religious_shows: religious_shows(), lateNightTemplates: lateNightTemplates(),
            late_shows: late_shows()
        }
    };

    let currentContent = contentDatabase.en;

    // Real places the player can actually travel to, so broadcasts name the
    // world's own destinations instead of only surreal invented ones.
    // A presenter says the place's readable "name", never its file key, so the
    // list comes from the destination catalogue DataService already loaded and
    // falls back to reading the file only if that is somehow missing.
    let _tvDestinations = null;
    function tvDestinationNames() {
        if (_tvDestinations) return _tvDestinations;
        _tvDestinations = [];
        if (window.WorkSystem && window.WorkSystem.destinationNames) {
            _tvDestinations = window.WorkSystem.destinationNames();
            if (_tvDestinations.length) return _tvDestinations;
        }
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'js/db/WorkSystem/Destinations.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                const data = JSON.parse(xhr.responseText) || {};
                _tvDestinations = Object.keys(data).map(key => (data[key] && data[key].name) || key);
            }
        } catch (e) {
            console.error("TVTransmissions: failed to load Destinations.json", e);
        }
        return _tvDestinations;
    }

    function getContent(category) {
        if (category === "locations") {
            const dest = tvDestinationNames();
            return dest.length ? (currentContent.locations || []).concat(dest) : currentContent.locations;
        }
        return currentContent[category];
    }

    // ==================================
    // === SEEDED RANDOM GENERATOR ===
    // ==================================

    let seed = 1;

    function setSeed(s) {
        seed = s;
    }

    function seededRandom() {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    function getRandomElement(arr) {
        if (!arr || arr.length === 0) return "";
        return arr[Math.floor(seededRandom() * arr.length)];
    }

    function initializeSeed() {
        let historySeed = 19002001;
        if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
            historySeed = window.HistoryManager.getSeed();
        } else if ($gameSystem && $gameSystem._historySeed !== undefined) {
            historySeed = $gameSystem._historySeed;
        }
        let initialSeed = $gameMap.mapId() + historySeed;
        setSeed(initialSeed);
    }
    
    function updateLanguage() {
        currentContent = contentDatabase.en;
    }


    // ==================================
    // === MESSAGE GENERATION LOGIC ===
    // ==================================

    // Slot banks for the legacy templates. Every placeholder these templates
    // can emit draws from a list of at least ten alternatives - a fixed string
    // in a slot makes the same sentence come out the same way every time, which
    // is the one thing a procedural broadcast must not do. Banks are namespaced
    // per generator because the same token means different things in different
    // formats ({action} in a weather bulletin is not {action} in an emergency).
    const GEN = () => tvGenBank('TvGen');

    const generator = {
        news: () => {
            return getRandomElement(getContent("newsTemplates()"))
                .replace(/{location}/g, getRandomElement(getContent("locations")))
                .replace(/{anchor}/g, getRandomElement(getContent("anchors")))
                .replace(/{company}/g, getRandomElement(getContent("companies()")))
                .replace(/{document}/g, getRandomElement(getContent("documents()")))
                .replace(/{security: security()}/g, getRandomElement(getContent("security()")))
                .replace(/{research: research()}/g, getRandomElement(getContent("research()")))
                .replace(/{criticism: criticism()}/g, getRandomElement(getContent("criticism()")))
                .replace(/{model}/g, getRandomElement(getContent("models()")))
                .replace(/{anomaly}/g, getRandomElement(getContent("anomalies()")))
                .replace(/{emotion}/g, getRandomElement(getContent("emotions()")))
                .replace(/{service}/g, getRandomElement(getContent("services()")))
                .replace(/{victims: victims()}/g, getRandomElement(getContent("victims()")))
                .replace(/{mysterious_location}/g, getRandomElement(getContent("locations")))
                .replace(/{profession}/g, getRandomElement(GEN().news.profession))
                .replace(/{equipment}/g, getRandomElement(GEN().news.equipment))
                .replace(/{coordinates}/g, getRandomElement(GEN().news.coordinates))
                .replace(/{glitch}/g, getRandomElement(GEN().news.glitch))
                .replace(/{survivors}/g, getRandomElement(GEN().news.survivors))
                .replace(/{territory}/g, getRandomElement(getContent("locations")))
                .replace(/{era}/g, getRandomElement(GEN().news.era))
                .replace(/{reaction}/g, getRandomElement(GEN().news.reaction))
                .replace(/{percentage}/g, Math.floor(seededRandom() * 21) + 80)
                .replace(/{resistance}/g, getRandomElement(GEN().news.resistance))
                .replace(/{legal_entity}/g, getRandomElement(GEN().news.legal_entity))
                .replace(/{barrier}/g, getRandomElement(GEN().news.barrier))
                .replace(/{highway}/g, getRandomElement(GEN().news.highway))
                .replace(/{temporal_condition}/g, getRandomElement(GEN().news.temporal_condition))
                .replace(/{time_amount}/g, `${Math.floor(seededRandom() * 10) + 1} hours`)
                .replace(/{artifact}/g, getRandomElement(GEN().news.artifact))
                .replace(/{time_period}/g, getRandomElement(GEN().news.time_period))
                .replace(/{action}/g, getRandomElement(GEN().news.action))
                .replace(/{effect}/g, getRandomElement(GEN().news.effect))
                .replace(/{strange_phenomenon}/g, getRandomElement(GEN().news.strange_phenomenon))
                .replace(/{celebrity}/g, getRandomElement(getContent("celebrities()")))
                .replace(/{vehicle}/g, getRandomElement(GEN().news.vehicle))
                .replace(/{speed}/g, getRandomElement(GEN().news.speed))
                .replace(/{danger}/g, getRandomElement(GEN().news.danger))
                .replace(/{currency}/g, getRandomElement(GEN().news.currency))
                .replace(/{direction}/g, getRandomElement(GEN().news.direction))
                .replace(/{comparison}/g, getRandomElement(GEN().news.comparison))
                .replace(/{festival}/g, getRandomElement(GEN().news.festival))
                .replace(/{tradition}/g, getRandomElement(GEN().news.tradition))
                .replace(/{number}/g, Math.floor(seededRandom() * 10000));
        },
        commercial: () => {
            return getRandomElement(getContent("commercialTemplates()"))
                .replace(/{problem}/g, getRandomElement(getContent("problems()")))
                .replace(/{product}/g, getRandomElement(getContent("products")))
                .replace(/{side_effect}/g, getRandomElement(getContent("side_effects()")))
                .replace(/{phone_number}/g, getRandomElement(getContent("phone_numbers()")))
                .replace(/{company}/g, getRandomElement(getContent("companies()")))
                .replace(/{impossible_thing}/g, getRandomElement(getContent("impossible_things()")))
                .replace(/{action}/g, getRandomElement(getContent("actions()")))
                .replace(/{location}/g, getRandomElement(getContent("locations")))
                .replace(/{disaster}/g, getRandomElement(GEN().commercial.disaster))
                .replace(/{time_period}/g, getRandomElement(GEN().commercial.time_period))
                .replace(/{state}/g, getRandomElement(GEN().commercial.state))
                .replace(/{reality_type}/g, getRandomElement(GEN().commercial.reality_type))
                .replace(/{nostalgia_item}/g, getRandomElement(GEN().commercial.nostalgia_item))
                .replace(/{feeling}/g, getRandomElement(GEN().commercial.feeling))
                .replace(/{dangerous_activity}/g, getRandomElement(GEN().commercial.dangerous_activity))
                .replace(/{consequence}/g, getRandomElement(GEN().commercial.consequence))
                .replace(/{permanence}/g, getRandomElement(GEN().commercial.permanence))
                .replace(/{manufacturer}/g, getRandomElement(GEN().commercial.manufacturer))
                .replace(/{item_type}/g, getRandomElement(GEN().commercial.item_type))
                .replace(/{target_audience}/g, getRandomElement(GEN().commercial.target_audience))
                .replace(/{authority}/g, getRandomElement(GEN().commercial.authority))
                .replace(/{activity}/g, getRandomElement(GEN().commercial.activity))
                .replace(/{celebrity}/g, getRandomElement(getContent("celebrities()")))
                .replace(/{achievement}/g, getRandomElement(GEN().commercial.achievement))
                .replace(/{bonus}/g, getRandomElement(GEN().commercial.bonus))
                .replace(/{speed_reference}/g, getRandomElement(GEN().commercial.speed_reference))
                .replace(/{percentage}/g, Math.floor(seededRandom() * 21) + 80)
                .replace(/{benefit}/g, getRandomElement(GEN().commercial.benefit));
        },
        weather: () => {
            return getRandomElement(getContent("weatherTemplates()"))
                .replace(/{location}/g, getRandomElement(getContent("locations")))
                .replace(/{weather_type}/g, getRandomElement(getContent("weather_types()")))
                .replace(/{percentage}/g, Math.floor(seededRandom() * 101))
                .replace(/{precipitation}/g, getRandomElement(getContent("precipitations()")))
                .replace(/{direction}/g, getRandomElement(getContent("directions()")))
                .replace(/{speed}/g, `${Math.floor(seededRandom() * 60 + 20)} km/h`)
                .replace(/{stability}/g, getRandomElement(getContent("stabilities()")))
                .replace(/{intensity}/g, getRandomElement(getContent("intensities()")))
                .replace(/{recommendation}/g, getRandomElement(GEN().weather.recommendation))
                .replace(/{activity}/g, getRandomElement(GEN().weather.activity))
                .replace(/{hazard}/g, getRandomElement(getContent("hazards()")))
                .replace(/{time_reference}/g, getRandomElement(getContent("time_references()")))
                .replace(/{medium}/g, getRandomElement(GEN().weather.medium))
                .replace(/{pressure_type}/g, getRandomElement(GEN().weather.pressure_type))
                .replace(/{phenomenon}/g, getRandomElement(GEN().weather.phenomenon))
                .replace(/{effect}/g, getRandomElement(GEN().weather.effect))
                .replace(/{system}/g, getRandomElement(GEN().weather.system))
                .replace(/{warning_type}/g, getRandomElement(GEN().weather.warning_type))
                .replace(/{experience}/g, getRandomElement(GEN().weather.experience))
                .replace(/{storm_type}/g, getRandomElement(GEN().weather.storm_type))
                .replace(/{shelter_type}/g, getRandomElement(GEN().weather.shelter_type))
                .replace(/{consequence}/g, getRandomElement(GEN().weather.consequence))
                .replace(/{dimension_weather}/g, getRandomElement(GEN().weather.dimension_weather))
                .replace(/{origin}/g, getRandomElement(GEN().weather.origin))
                .replace(/{action}/g, getRandomElement(GEN().weather.action))
                .replace(/{measurement}/g, `${Math.floor(seededRandom() * 100)} millichrons`)
                .replace(/{professional}/g, getRandomElement(GEN().weather.professional))
                .replace(/{precaution}/g, getRandomElement(GEN().weather.precaution));
        },
        talk_show: () => {
            return getRandomElement(getContent("talkShowTemplates()"))
                .replace(/{show_name}/g, getRandomElement(getContent("show_names()")))
                .replace(/{guest}/g, getRandomElement(getContent("celebrities()")))
                .replace(/{claim}/g, getRandomElement(getContent("claims()")))
                .replace(/{expert}/g, getRandomElement(GEN().talk_show.expert))
                .replace(/{assessment}/g, getRandomElement(GEN().talk_show.assessment))
                .replace(/{situation}/g, getRandomElement(GEN().talk_show.situation))
                .replace(/{sponsor}/g, getRandomElement(getContent("companies()")))
                .replace(/{conflict}/g, getRandomElement(GEN().talk_show.conflict))
                .replace(/{description}/g, getRandomElement(GEN().talk_show.description))
                .replace(/{effect}/g, getRandomElement(GEN().talk_show.effect))
                .replace(/{caller_name}/g, getRandomElement(GEN().talk_show.caller_name))
                .replace(/{device}/g, getRandomElement(GEN().talk_show.device))
                .replace(/{malfunction}/g, getRandomElement(GEN().talk_show.malfunction))
                .replace(/{location}/g, getRandomElement(getContent("locations")))
                .replace(/{topic}/g, getRandomElement(GEN().talk_show.topic))
                .replace(/{celebrity}/g, getRandomElement(getContent("celebrities()")))
                .replace(/{news_event}/g, getRandomElement(GEN().talk_show.news_event))
                .replace(/{conspiracy}/g, getRandomElement(GEN().talk_show.conspiracy))
                .replace(/{authority_figure}/g, getRandomElement(GEN().talk_show.authority_figure))
                .replace(/{accusation}/g, getRandomElement(GEN().talk_show.accusation))
                .replace(/{controversial_topic}/g, getRandomElement(GEN().talk_show.controversial_topic))
                .replace(/{expert_type}/g, getRandomElement(GEN().talk_show.expert_type))
                .replace(/{expert_name}/g, getRandomElement(GEN().talk_show.expert_name));
        },
        emergency: () => {
            return getRandomElement(getContent("emergencyTemplates()"))
                .replace(/{violation_type}/g, getRandomElement(getContent("violation_types()")))
                .replace(/{location}/g, getRandomElement(getContent("locations")))
                .replace(/{consequence}/g, getRandomElement(getContent("consequences()")))
                .replace(/{action}/g, getRandomElement(GEN().emergency.action))
                .replace(/{warning_type}/g, getRandomElement(GEN().emergency.warning_type))
                .replace(/{threat}/g, getRandomElement(getContent("threat_types()")))
                .replace(/{instruction}/g, getRandomElement(GEN().emergency.instruction))
                .replace(/{disease_type}/g, getRandomElement(getContent("disease_types()")))
                .replace(/{prevention_method}/g, getRandomElement(GEN().emergency.prevention_method))
                .replace(/{disaster_type}/g, getRandomElement(GEN().emergency.disaster_type))
                .replace(/{temporal_effect}/g, getRandomElement(GEN().emergency.temporal_effect))
                .replace(/{organization}/g, getRandomElement(GEN().emergency.organization))
                .replace(/{action_past}/g, getRandomElement(GEN().emergency.action_past))
                .replace(/{specific_action}/g, getRandomElement(GEN().emergency.specific_action))
                .replace(/{phenomenon}/g, getRandomElement(GEN().emergency.phenomenon))
                .replace(/{immediate_action}/g, getRandomElement(GEN().emergency.immediate_action))
                .replace(/{dangerous_thing}/g, getRandomElement(GEN().emergency.dangerous_thing))
                .replace(/{technology}/g, getRandomElement(GEN().emergency.technology))
                .replace(/{evacuation_instruction}/g, getRandomElement(GEN().emergency.evacuation_instruction))
                .replace(/{authority}/g, getRandomElement(GEN().emergency.authority))
                .replace(/{declaration}/g, getRandomElement(GEN().emergency.declaration))
                .replace(/{compliance_instruction}/g, getRandomElement(GEN().emergency.compliance_instruction));
        },
        memory_fragment: () => getRandomElement(getContent("memoryFragments()")),
        prophetic: () => getRandomElement(getContent("prophecies()")),
        static: () => getRandomElement(getContent("staticContent()")),
        glitch: () => getRandomElement(GEN().glitch.line),
        game_show: () => T('TvFrame.gameShowIntro', {
            show: getRandomElement(getContent("gameShows()")),
            prize: getRandomElement(getContent("products")),
        }),
        soap_opera: () => {
            // Four distinct names, so a scene never has a character betraying
            // themselves or marrying themselves.
            const names = GEN().soap_opera.characters.slice();
            const cast = [];
            for (let i = 0; i < 4 && names.length; i++) {
                cast.push(names.splice(Math.floor(seededRandom() * names.length), 1)[0]);
            }
            return getRandomElement(getContent("soapOperaTemplates()"))
                .replace(/{soap_name}/g, getRandomElement(getContent("soap_names()")))
                .replace(/{character1}/g, cast[0])
                .replace(/{character2}/g, cast[1])
                .replace(/{character3}/g, cast[2])
                .replace(/{character4}/g, cast[3])
                .replace(/{revelation}/g, getRandomElement(GEN().soap_opera.revelation))
                .replace(/{betrayal}/g, getRandomElement(GEN().soap_opera.betrayal))
                .replace(/{dramatic_event}/g, getRandomElement(GEN().soap_opera.dramatic_event))
                .replace(/{location}/g, getRandomElement(getContent("locations")))
                .replace(/{internal_conflict}/g, getRandomElement(GEN().soap_opera.internal_conflict))
                .replace(/{mystery}/g, getRandomElement(GEN().soap_opera.mystery))
                .replace(/{evidence}/g, getRandomElement(GEN().soap_opera.evidence));
        },
        children_show: () => {
            return getRandomElement(getContent("children_show_templates()"))
                .replace(/{kids_show}/g, getRandomElement(getContent("kids_shows()")))
                .replace(/{character}/g, getRandomElement(GEN().children_show.character))
                .replace(/{lesson}/g, getRandomElement(GEN().children_show.lesson))
                .replace(/{situation}/g, getRandomElement(GEN().children_show.situation))
                .replace(/{moral}/g, getRandomElement(GEN().children_show.moral))
                .replace(/{safety_item}/g, getRandomElement(GEN().children_show.safety_item))
                .replace(/{dangerous_activity}/g, getRandomElement(GEN().children_show.dangerous_activity))
                .replace(/{location}/g, getRandomElement(getContent("locations")))
                .replace(/{friend}/g, getRandomElement(GEN().children_show.friend));
        },
        religious: () => {
            return getRandomElement(getContent("religiousTemplates()"))
                .replace(/{preacher}/g, getRandomElement(GEN().religious.preacher))
                .replace(/{topic}/g, getRandomElement(GEN().religious.topic))
                .replace(/{religious_show}/g, getRandomElement(getContent("religious_shows()")))
                .replace(/{religious_message}/g, getRandomElement(GEN().religious.religious_message))
                .replace(/{deity}/g, getRandomElement(GEN().religious.deity))
                .replace(/{sermon_topic}/g, getRandomElement(GEN().religious.sermon_topic))
                .replace(/{currency}/g, getRandomElement(GEN().religious.currency))
                .replace(/{spiritual_concept}/g, getRandomElement(GEN().religious.spiritual_concept))
                .replace(/{activity}/g, getRandomElement(GEN().religious.activity))
                .replace(/{sacred_word}/g, getRandomElement(GEN().religious.sacred_word));
        },
        late_night: () => {
            return getRandomElement(getContent("lateNightTemplates()"))
                .replace(/{time}/g, Math.floor(seededRandom() * 3) + 1)
                .replace(/{late_show}/g, getRandomElement(getContent("late_shows()")))
                .replace(/{weird_topic}/g, getRandomElement(GEN().late_night.weird_topic))
                .replace(/{strange_guest}/g, getRandomElement(GEN().late_night.strange_guest))
                .replace(/{situation}/g, getRandomElement(GEN().late_night.situation))
                .replace(/{number}/g, getRandomElement(getContent("phone_numbers()")))
                .replace(/{adjective}/g, getRandomElement(GEN().late_night.adjective))
                .replace(/{hour}/g, getRandomElement(GEN().late_night.hour))
                .replace(/{controversial_subject}/g, getRandomElement(GEN().late_night.controversial_subject));
        },
        default: () => T('TvFrame.technicalDifficulties')
    };

    // Safety net: any placeholder a template forgot to fill would otherwise be
    // read out on air verbatim ("...explore {location}...").
    function tvFillLeftovers(text) {
        return String(text).replace(/\{(\w+)\}/g, (match, key) => {
            if (/location|place|city|territory|sector|region/i.test(key)) {
                return getRandomElement(getContent("locations")) || "somewhere";
            }
            const list = getContent(key) || getContent(key + "s");
            if (Array.isArray(list) && list.length) return getRandomElement(list);
            return key.replace(/_/g, " ");
        });
    }

    // Half the programme types the legacy command can draw (documentary, sports,
    // sitcom, royal_address...) never had a generator of their own, so a random
    // transmission used to read out "Technical Difficulties" more often than it
    // read out a programme. The modern format banks are written for exactly those
    // formats, so the type is mapped onto its bank and a beat is resolved from
    // it - the same writing the studio broadcasts, minus the studio.
    const TV_LEGACY_FORMAT = {
        documentary: "documentary", cooking: "cooking", educational: "educational",
        infomercial: "infomercial", conspiracy: "conspiracy", sports: "sports",
        reality_tv: "reality_tv", music_video: "music_video", test_pattern: "test_pattern",
        sitcom: "sitcom", drama: "drama", historical_epic: "historical_epic",
        puppet_show: "puppet_show", royal_address: "royal_address",
        adult_swim: "late_night", news: "news_desk", weather: "weather",
        talk_show: "talk_show", game_show: "game_show", religious: "religious",
        children_show: "children_show", commercial: "commercial", emergency: "emergency",
        soap_opera: "soap_opera", late_night: "late_night", prophetic: "prophetic",
        glitch: "glitch"
    };

    function tvLegacyBankLine(type) {
        const spec = TV_SHOWS()[TV_LEGACY_FORMAT[type] || type];
        const beats = spec && spec.beats;
        if (!beats || !beats.length) return null;
        const rng = () => seededRandom();
        return tvT(rng, beats[Math.floor(rng() * beats.length)]);
    }

    function generateMessage(type) {
        const createMessage = generator[type];
        if (!createMessage) {
            const fromBank = tvLegacyBankLine(type);
            if (fromBank) return fromBank;
        }
        // Legacy templates carry inline alternation too ("{deny|dispute}"), so
        // the branches are picked before the leftover-placeholder sweep - a
        // branch that holds a placeholder still gets filled.
        return tvFixIndefinite(tvTidySpacing(tvFillLeftovers(tvAlt(seededRandom, (createMessage || generator.default)()))));
    }


    // ==================================
    // === PLUGIN COMMAND ===
    // ==================================

    PluginManager.registerCommand(pluginName, "ShowTVTransmission", args => {
        const maxMessages = Number(args.maxMessages) || 4;
        
        // Ensure this command is run from the map interpreter
        const interpreter = $gameMap.interpreter;
        if (!interpreter) return;

        if (tvPlayStoryWarning()) { interpreter.setWaitMode('message'); return; }

        updateLanguage();
        initializeSeed();
        
        const channel = getRandomElement(getContent("channels"));
        const commands = [];
        // A set in somebody's front room is cursed exactly like a tuned-in
        // broadcast is: it is the same transmitter (see tvEmCurse).
        const emCtx = tvEmInPlay() ? tvEmCtx() : null;

        for (let i = 0; i < maxMessages; i++) {
            const programType = getRandomElement(getContent("programTypes()"));
            let body = generateMessage(programType);
            if (emCtx) {
                body = tvEmFaceLine(seededRandom, body, emCtx);
                if (seededRandom() < 0.45) {
                    body += " " + tvT(seededRandom, tvPick(seededRandom, TV_EM_OPINION()), emCtx);
                }
            }
            const messageText = `\\C[7]${channel}\\C[0]\n` + body;

            // Command 101: Show Text
            // Parameters: [Face Name, Face Index, Background, Position, Text]
            const params = ["", 0, 0, 2, messageText];
            commands.push({ code: 101, indent: 0, parameters: params });
        }

        // She watched four programmes and gave none of them what they asked for.
        if (emCtx) {
            const refusal = tvT(seededRandom, tvPick(seededRandom, TV_EM_REFUSAL()), emCtx);
            commands.push({ code: 101, indent: 0, parameters: ["", 0, 0, 2, refusal] });
        }

        // Setup a child interpreter to run our generated commands
        interpreter.setupChild(commands);
    });


    // ============================================================
    // === TV STUDIO v3.0: CHANNELS, SCHEDULE, TUNE-IN, HUD     ===
    // ============================================================

    // --- Transmission database (DB/WorldGen) -------------------
    let _tvDB = null;
    function loadTVDB() {
        if (_tvDB) return _tvDB;
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'js/db/WorldGen/TVTransmissions.json', false);
            xhr.send();
            _tvDB = xhr.status === 200 ? JSON.parse(xhr.responseText) : { channels: [] };
        } catch (e) {
            console.error("TVTransmissions: failed to load DB", e);
            _tvDB = { channels: [] };
        }
        if (!Array.isArray(_tvDB.channels)) _tvDB.channels = [];
        window.WorldGen = window.WorldGen || {};
        window.WorldGen.TVTransmissions = _tvDB;
        return _tvDB;
    }

    // Eagerly prefetch the DB asynchronously at plugin load so that by the time
    // Scene_Map.update() first calls loadTVDB() the cache is already populated and
    // no synchronous XHR blocks that first map frame. loadTVDB() keeps its sync
    // fallback for the rare case it is called before this finishes.
    (function preloadTVDB() {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'js/db/WorldGen/TVTransmissions.json', true);
            xhr.onload = function () {
                if (_tvDB) return; // already loaded synchronously
                try {
                    _tvDB = xhr.status === 200 ? JSON.parse(xhr.responseText) : { channels: [] };
                    if (!Array.isArray(_tvDB.channels)) _tvDB.channels = [];
                    window.WorldGen = window.WorldGen || {};
                    window.WorldGen.TVTransmissions = _tvDB;
                } catch (e) {
                    console.error("TVTransmissions: failed to parse prefetched DB", e);
                }
            };
            xhr.send();
        } catch (e) { /* fall back to lazy sync load */ }
    })();

    function tvChannelById(id) { return loadTVDB().channels.find(c => c.id === id) || null; }
    // The schedule data carries i18n keys, not titles (see HypernetTVGuide).
    function tvText(value) {
        if (!value) return '';
        const key = String(value);
        return (typeof T === 'function' && T.has && T.has(key)) ? T(key) : key;
    }
    function tvChannelName(ch) { return ch ? tvText(ch.name) : ''; }
    function tvProgramTitle(p) { return p ? tvText(p.title) : ''; }
    function tvProgramById(ch, id) { return (ch.programs || []).find(p => p.id === id) || null; }

    function tvDayNames() {
        return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    }

    // --- Time / week helpers -----------------------------------
    // Variable 114 = game time in minutes since Jan 1 2001 10:00 (TimeDateSystem).
    function tvGameMinutes() {
        try { return ($gameVariables && $gameVariables.value(114)) || 0; } catch (e) { return 0; }
    }
    function tvClockMinutes() { return 600 + tvGameMinutes(); }      // 10:00 == 600
    function tvDayIndex() { return Math.floor(tvClockMinutes() / 1440); }
    function tvDayOfWeek() { return ((tvDayIndex() % 7) + 7) % 7; }
    function tvHourOfDay() { return Math.floor((tvClockMinutes() % 1440) / 60); }
    function tvWeekIndex() { return Math.floor(tvDayIndex() / 7); }
    function tvNowSlot() { return tvDayOfWeek() * 24 + tvHourOfDay(); }

    // --- Deterministic RNG independent of the legacy generator --
    function tvHash(str) {
        let h = 2166136261;
        str = String(str);
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function tvRng(seedInt) {
        let s = (seedInt >>> 0) || 1;
        return function () {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function tvHistorySeed() {
        try {
            if (window.HistoryManager && window.HistoryManager.getSeed) return window.HistoryManager.getSeed();
        } catch (e) {}
        if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed !== undefined) return $gameSystem._historySeed;
        return 19002001;
    }
    function tvPick(rng, arr) { return (arr && arr.length) ? arr[Math.floor(rng() * arr.length)] : null; }

    // --- Weekly procedural schedule ----------------------------
    let _tvSchedCache = { week: null, data: null };
    function tvBuildWeeklySchedule(week) {
        const db = loadTVDB();
        const perWeek = db.programsPerWeek || 6;
        const slots = (db.slotHours && db.slotHours.length) ? db.slotHours : [6, 9, 12, 15, 18, 21, 24];
        const out = {};
        db.channels.forEach(ch => {
            const rng = tvRng((tvHistorySeed() ^ Math.imul(week + 1, 0x9E3779B1) ^ tvHash(ch.id)) >>> 0);
            const entries = [];
            const used = {};
            for (let i = 0; i < perWeek; i++) {
                const prog = tvPick(rng, ch.programs) || (ch.programs || [])[0];
                if (!prog) continue;
                let day = Math.floor(rng() * 7);
                let hour = (slots[Math.floor(rng() * slots.length)] || 0) % 24;
                let key = day * 24 + hour, guard = 0;
                while (used[key] && guard++ < 16) { hour = (slots[Math.floor(rng() * slots.length)] || 0) % 24; day = Math.floor(rng() * 7); key = day * 24 + hour; }
                used[key] = true;
                entries.push({ channelId: ch.id, programId: prog.id, day, hour });
            }
            entries.sort((a, b) => (a.day - b.day) || (a.hour - b.hour));
            out[ch.id] = entries;
        });
        return out;
    }
    function tvGetSchedule() {
        const week = tvWeekIndex();
        if (_tvSchedCache.week !== week || !_tvSchedCache.data) {
            _tvSchedCache = { week, data: tvBuildWeeklySchedule(week) };
        }
        return _tvSchedCache.data;
    }
    // The program currently "on air" for a channel (latest slot <= now, wrapping).
    function tvOnAir(channelId) {
        const list = tvGetSchedule()[channelId] || [];
        if (!list.length) return null;
        const now = tvNowSlot();
        let best = list[list.length - 1];
        for (const e of list) {
            const v = e.day * 24 + e.hour;
            if (v <= now) best = e; else break;
        }
        return best;
    }
    function tvNextUp(channelId) {
        const list = tvGetSchedule()[channelId] || [];
        if (!list.length) return null;
        const now = tvNowSlot();
        for (const e of list) { if ((e.day * 24 + e.hour) > now) return e; }
        return list[0];
    }

    // --- Live world references (history + news) ----------------
    // World records store money in gold; broadcasts read it out in euros
    // (100g = 1.00€), matching every other money display in the game.
    function tvMoneyText(text) {
        try {
            if (window.NPCShared && window.NPCShared.goldTextToEuros) {
                return window.NPCShared.goldTextToEuros(text);
            }
        } catch (e) {}
        return text;
    }

    function tvHistoryFacts(rng, n) {
        const out = [];
        let events = [];
        try {
            if (window.HistoryManager && window.HistoryManager.getEvents) events = window.HistoryManager.getEvents() || [];
        } catch (e) {}
        if (!events.length) return out;
        const seen = {};
        let guard = 0;
        while (out.length < n && guard++ < n * 6) {
            const ev = events[Math.floor(rng() * events.length)];
            if (!ev || !ev.description) continue;
            const desc = tvMoneyText(ev.description);
            const line = ev.date ? `(${ev.date}) ${desc}` : desc;
            if (seen[line]) continue;
            seen[line] = true;
            out.push(line);
        }
        return out;
    }
    function tvNewsItems(rng, n) {
        const out = [];
        let hist = [];
        try { hist = (window.$newsManager && window.$newsManager.newsHistory) || []; } catch (e) {}
        if (!hist.length) return out;
        for (let i = 0; i < n; i++) {
            const it = hist[Math.floor(rng() * hist.length)];
            if (!it) continue;
            out.push({
                title: tvMoneyText(it.text || it.title || ""),
                body: tvMoneyText(it.fullText || it.content || ""),
                location: it.location || ""
            });
        }
        return out;
    }

    // ============================================================
    // Every word broadcast on air lives in
    // js/i18n/<lang>/conversations/Tv*.json. The banks below are lazy views
    // onto those files, re-resolved when the language changes, so a broadcast
    // never holds a stale table and this plugin holds no prose.
    let _tvBankLang = null;
    const _tvBankCache = new Map();
    function tvBank(key) {
        const lang = T.language();
        if (lang !== _tvBankLang) { _tvBankLang = lang; _tvBankCache.clear(); }
        if (!_tvBankCache.has(key)) _tvBankCache.set(key, T.obj(key));
        return _tvBankCache.get(key);
    }

    // === LORE VOCABULARY                                      ===
    // ============================================================
    // Everything a broadcast can say is assembled from these banks by the
    // template resolver below. Canon reference: docs/Lore.odt.
    //  - The Omega Tower was hurled through 92 dimensions on 21 Dec 1992 and
    //    pins the corpse of Maat hundreds of km under the crust. It is the only
    //    thing holding the 92 dimensions together.
    //  - The Rule of 80: exceeding 80 km/h drags you into the NEAREST localized
    //    time loop bubble. Inside a bubble the rule inverts - staying under 80
    //    keeps you looping, and the only exit is to cross the boundary outward
    //    above 80. Above 80 km/h death is permanent; the liminal engine is the
    //    only thing that lets a vehicle ignore all of it.
    //  - The Y2K Event killed two billion people on 31 Dec 1999 and opened the
    //    Tower. The Solomon Ritual of 31 Dec 2001 killed the Father aspect of
    //    YHWH using 92% of Em's memories forged into the Memory Lance.
    const LORE = () => tvBank('TvLore');

    // ============================================================
    // === TEMPLATE RESOLVER                                    ===
    // ============================================================
    // Every broadcast line in this plugin is a template string. Tokens resolve
    // recursively, so "{faction} accuse {faction} of {crime} near {place}"
    // expands to thousands of distinct sentences from one written line.
    // Tokens whose value is COMPUTED rather than written: a number, a real
    // destination off the world map, a product out of the item database, a fact
    // out of the simulated history. These are code, not prose, so they live
    // here and not in js/i18n/<lang>/conversations - a translator has nothing
    // to translate in Math.floor. (They were briefly read from an i18n
    // namespace, which JSON cannot hold functions for, and every broadcast read
    // the token names out loud: "boundary drift across dest, n metres".)
    const TV_DYNAMIC_TABLE = {
        pct: rng => String(1 + Math.floor(rng() * 99)),
        n: rng => String(2 + Math.floor(rng() * 9)),
        big: rng => String((2 + Math.floor(rng() * 900)) * 100),
        speed: rng => String(81 + Math.floor(rng() * 60)),
        hour: rng => String(1 + Math.floor(rng() * 12)),
        dim: rng => String(1 + Math.floor(rng() * 92)),
        // Real destinations the player can actually reach, so broadcasts name
        // the world's own map and not only invented geography.
        dest: rng => {
            const d = tvDestinationNames();
            return d.length ? d[Math.floor(rng() * d.length)] : tvPick(rng, LORE().place);
        },
        // {item} and {price} always resolve as a matched pair: whichever token
        // the template reaches first picks the product and pins its base price
        // into the scope for the rest of the line.
        item: (rng, scope) => tvPickProduct(rng, scope) && scope.item,
        price: (rng, scope) => tvPickProduct(rng, scope) && scope.price,
        category: (rng, scope) => tvPickProduct(rng, scope) && scope.category,
        // Live simulated history / news, with a templated fallback when the
        // world simulation has not produced anything yet.
        hist: rng => tvHistoryFacts(rng, 1)[0] || tvT(rng, tvPick(rng, LORE().pseudohist)),
        news: rng => {
            const it = tvNewsItems(rng, 1)[0];
            return (it && it.title) ? it.title + (it.location ? ` (${it.location})` : "")
                                    : tvT(rng, tvPick(rng, LORE().pseudonews));
        }
    };
    const TV_DYNAMIC = () => TV_DYNAMIC_TABLE;

    // Picks one advertisable product and pins name/price/category into the
    // line's scope, so a template can name the product and quote its base
    // price without the two disagreeing.
    function tvPickProduct(rng, scope) {
        if (scope.item) return true;
        const stock = tvAdStock();
        if (!stock.length) return false;
        const pick = stock[Math.floor(rng() * stock.length)];
        scope.item = pick.name;
        scope.price = tvPriceText(pick.price);
        scope.category = pick.category;
        return true;
    }

    // Both article passes below agree ENGLISH articles, and only English has
    // the a/an alternation they are built on. Italian writes "a un deposito",
    // where "a" is a preposition and "un" the article, and the sound rules
    // would read that as a mis-agreed pair and broadcast "an un deposito". So
    // they stand down in every other language, which leaves each translation's
    // own articles exactly as its writer set them.
    function tvArticlesApply() {
        try { return String(T.language() || 'en').toLowerCase().indexOf('en') === 0; } catch (e) { return true; }
    }
    function tvIsItalian() {
        try { return String(T.language() || 'en').toLowerCase().indexOf('it') === 0; } catch (e) { return false; }
    }

    // Most place/faction/creature entries carry their own article ("the Omega
    // Tower", "a petrodemon"), and templates naturally write "in the {place}".
    // Where both supply one, the entity's own article wins.
    function tvFixArticles(text) {
        return String(text).replace(/\b(?:the|a|an)\s+(the|a|an)\b/gi, (m, second) => second.toLowerCase());
    }

    // A template writes "a {job}" without knowing which job it will get, and an
    // alternation branch can swap "enormous" for "vast", so the article has to
    // be agreed with the word that actually turned up. Spelling is not enough -
    // it is the sound that decides ("a euro", "an hour").
    const TV_SOUNDS_CONSONANT = /^(?:eu|uni(?!n)|use|usu|uti|ubi|ufo|one|once)/i;
    const TV_SOUNDS_VOWEL = /^(?:hour|honest|honou?r|heir)/i;
    function tvFixIndefinite(text) {
        return String(text).replace(/\b([Aa]n?)(\s+)([A-Za-z][\w'-]*)/g, (m, art, gap, word) => {
            // An all-caps word is either an initialism ("an MP") or a presenter
            // shouting ("IN A FUN WAY"). Neither can be judged by its spelling.
            if (word.length > 1 && word === word.toUpperCase()) return m;
            const needsAn = (/^[aeiou]/i.test(word) && !TV_SOUNDS_CONSONANT.test(word))
                || TV_SOUNDS_VOWEL.test(word);
            if (needsAn === (art.length === 2)) return m;
            const upper = art[0] === "A";
            return (needsAn ? (upper ? "An" : "an") : (upper ? "A" : "a")) + gap + word;
        });
    }

    // The Italian counterpart of the pass above, and it is not cosmetic:
    // Italian FUSES a preposition with the article that follows it. A bank
    // entry carries its own article ("la Societa dei Camionisti", "gli Stati
    // Indipendenti") and a template writes "da {faction}", so the resolved line
    // comes out "da la Societa" / "da gli Stati", which is not a stylistic
    // choice in Italian, it is simply wrong. The contraction is obligatory and
    // exceptionless, which is what makes it safe to do here rather than asking
    // every one of several thousand written lines to guess its own tokens.
    const TV_IT_PREPOSITIONS = {
        di: { il: "del", lo: "dello", la: "della", i: "dei", gli: "degli", le: "delle", "l'": "dell'" },
        a:  { il: "al", lo: "allo", la: "alla", i: "ai", gli: "agli", le: "alle", "l'": "all'" },
        da: { il: "dal", lo: "dallo", la: "dalla", i: "dai", gli: "dagli", le: "dalle", "l'": "dall'" },
        "in": { il: "nel", lo: "nello", la: "nella", i: "nei", gli: "negli", le: "nelle", "l'": "nell'" },
        su: { il: "sul", lo: "sullo", la: "sulla", i: "sui", gli: "sugli", le: "sulle", "l'": "sull'" }
    };
    function tvFixItalianArticles(text) {
        // The article has to end where the word ends, or "di lavoro" reads as
        // "di" + "la" and goes out as "dellavoro". Only the elided "l'" may run
        // straight into its noun.
        return String(text).replace(/\b(di|a|da|in|su)\s+(?:(il|lo|la|i|gli|le)\b|(l')(?=[a-zàèéìòùA-ZÀÈÉÌÒÙ]))/gi,
            (m, prep, art, elided) => {
                const table = TV_IT_PREPOSITIONS[prep.toLowerCase()];
                const joined = table && table[(art || elided).toLowerCase()];
                if (!joined) return m;
                // "Da la" opening a sentence has to come back as "Dalla".
                return (prep[0] === prep[0].toUpperCase())
                    ? joined[0].toUpperCase() + joined.slice(1)
                    : joined;
            });
    }

    // Tokens filled from a bank land mid-sentence as often as not, so a
    // sentence that opens on one would otherwise be read out lowercase.
    function tvCapitalize(text) {
        return String(text).replace(/(^|[^.][.!?]["')\]]?\s+)([a-z])/g, (m, pre, c) => pre + c.toUpperCase());
    }

    // Inline alternation. "{a|b|c}" picks one of the branches, so a single
    // written line carries its own synonyms and alternate phrasings instead of
    // coming out word for word the same every broadcast. Groups nest
    // ("we {will|shall} {return|be back}") and a branch may hold tokens, which
    // resolve afterwards. A branch may be empty ("{ and nothing else|}"), which
    // makes the whole clause optional. Token names are \w+ and so can never
    // contain a pipe: nothing here can collide with {place}, {n} or {item}.
    function tvAlt(rng, text) {
        let s = String(text || "");
        for (let depth = 0; depth < 12; depth++) {
            if (s.indexOf("|") < 0) break;
            // Innermost groups first, so nested alternation resolves outward.
            const next = s.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
                const opts = body.split("|");
                return opts[Math.floor(rng() * opts.length)];
            });
            if (next === s) break;
            s = next;
        }
        return s;
    }

    // An omitted branch leaves the space that led into it behind, and a bank
    // entry that ends in its own question mark leaves the template's full stop
    // stranded after it ("...survivable?. Lines are open"). A trailing ellipsis
    // is left alone.
    function tvTidySpacing(text) {
        return String(text)
            .replace(/\s{2,}/g, " ")
            .replace(/ +([,.;:!?])/g, "$1")
            .replace(/([?!])\.(?!\.)/g, "$1")
            .trim();
    }

    function tvT(rng, tpl, ctx) {
        let s = tvAlt(rng, String(tpl || ""));
        const scope = Object.assign({}, ctx);
        for (let pass = 0; pass < 8; pass++) {
            let hit = false;
            s = s.replace(/\{(\w+)\}/g, (m, key) => {
                if (scope[key] !== undefined && scope[key] !== null) { hit = true; return scope[key]; }
                if (TV_DYNAMIC()[key]) {
                    const v = TV_DYNAMIC()[key](rng, scope);
                    if (v === null || v === undefined || v === false) return m;
                    hit = true;
                    return v;
                }
                const bank = LORE()[key];
                if (bank && bank.length) { hit = true; return bank[Math.floor(rng() * bank.length)]; }
                // A numbered token ({place1}, {n2}) resolves from the same bank
                // as its base but is pinned into the scope, so every later use
                // in the same line gives the same answer. Bare {place} keeps
                // re-rolling, which is what "{faction} and {faction}" wants.
                const num = /^([a-z_]+?)\d+$/i.exec(key);
                if (num) {
                    const base = num[1];
                    let v = null;
                    if (TV_DYNAMIC()[base]) v = TV_DYNAMIC()[base](rng, scope);
                    else if (LORE()[base] && LORE()[base].length) v = LORE()[base][Math.floor(rng() * LORE()[base].length)];
                    if (v !== null && v !== undefined && v !== false) { scope[key] = v; hit = true; return v; }
                }
                return m;
            });
            if (!hit) break;
            // A bank entry can carry alternation of its own, so anything just
            // spliced in gets another pass over it.
            s = tvAlt(rng, s);
        }
        // Anything still unresolved would be read out on air verbatim.
        s = tvTidySpacing(s.replace(/\{(\w+)\}/g, (m, k) => k.replace(/_/g, " ")));
        if (!tvArticlesApply()) return tvCapitalize(tvIsItalian() ? tvFixItalianArticles(s) : s);
        return tvCapitalize(tvFixIndefinite(tvFixArticles(s)));
    }

    function tvShuffle(rng, arr) {
        const a = (arr || []).slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // ============================================================
    // === SPONSORED ITEMS + COMMERCIAL BREAKS                  ===
    // ============================================================
    // Ad stock is drawn from the real item database. Consumables the world
    // treats as raw supply - food, body parts, materials and alchemy reagents -
    // are never advertised; a Collective ad break sells goods, not groceries.
    const TV_AD_EXCLUDED = ["food", "bodypart", "material", "alchemistry", "alchemy", "plant", "monster"];
    let _tvAdStock = null;

    function tvItemCategory(obj) {
        const m = /<Category\s*:\s*([^>]+)>/i.exec((obj && obj.note) || "");
        return m ? m[1].trim() : "";
    }

    function tvAdStock() {
        if (_tvAdStock && _tvAdStock.length) return _tvAdStock;
        const out = [];
        const take = list => {
            if (!Array.isArray(list)) return;
            list.forEach(o => {
                if (!o || !o.name || !(o.price > 0)) return;
                const cat = tvItemCategory(o);
                if (!cat) return;                                   // uncategorised: not for sale on air
                const norm = cat.toLowerCase().replace(/s$/, "");
                if (TV_AD_EXCLUDED.indexOf(norm) >= 0) return;
                out.push({ name: o.name, price: o.price, category: cat });
            });
        };
        try { take(window.$dataItems); take(window.$dataWeapons); take(window.$dataArmors); } catch (e) {}
        _tvAdStock = out;
        return out;
    }

    // Base price is stored in gold; every money display in the game reads out
    // in euros at 100g = 1.00EUR.
    function tvPriceText(gold) {
        try {
            if (window.NPCShared && window.NPCShared.formatMoney) return window.NPCShared.formatMoney(gold);
        } catch (e) {}
        return `${(Number(gold) / 100).toFixed(2)}€`;
    }

    const TV_AD_BUMPER_IN = () => tvBank('TvAds.bumperIn');
    const TV_AD_BUMPER_IN_NOTICE = () => tvBank('TvAds.bumperInNotice');
    const TV_AD_PITCH = () => tvBank('TvAds.pitch');
    const TV_AD_SMALLPRINT = () => tvBank('TvAds.smallprint');
    const TV_AD_BUMPER_OUT = () => tvBank('TvAds.bumperOut');

    // Airtime is airtime, and a hyperpower buys it the same way the Collective
    // does: half the breaks on this continent sell a position rather than a
    // product. Campaigns are keyed by id in TvAds.propaganda - the Vatican
    // mission to the Naguka, Rome's war on the Northpoint claimant, the Kola
    // advisories, this morning's edition of Eris's legal code (docs/Lore.odt) -
    // each with the sponsor whose money it is, so the sign-off can name who has
    // been talking to you and the presenters' own bumper can hand over to them
    // by name.
    const TV_PROPAGANDA = () => tvBank('TvAds.propaganda');
    const TV_PROPAGANDA_TAG = () => tvBank('TvAds.propagandaTag');

    function tvPropagandaIds() {
        const bank = TV_PROPAGANDA() || {};
        return Object.keys(bank).filter(k => {
            const s = bank[k];
            return s && s.sponsor && Array.isArray(s.lines) && s.lines.length;
        });
    }

    // The sponsored lines are not the presenters talking, so they are attributed
    // to the break itself. The name is deliberately not a studio event name:
    // TVStudio.prepareSpeaker finds no event and falls back to the neutral bust,
    // which is what an off-screen announcer should look like.
    const TV_AD_SPEAKER = () => T('TvFrame.advertisementSpeaker');

    // A campaign is read by the same off-screen voice as an advertisement, but
    // it is announced as what it is: somebody bought this minute to tell you
    // what to think, and the continent's broadcasting rules make them say so.
    const TV_NOTICE_SPEAKER = () => T('TvFrame.paidNoticeSpeaker');

    // Narrated programmes - documentaries, epics, storytime, sign-offs - have no
    // cast in TVTransmissions.json. Like the advertisement, the narrator is a
    // voice with nobody attached, so no portrait is shown for them either.
    const TV_NARRATOR = () => T('TvFrame.narratorSpeaker');

    // One product segment: the pitch, and most of the time the small print that
    // takes it back. The item is pinned into the segment's own scope so name and
    // price cannot disagree across the two lines.
    function tvAdProductSegment(rng, used) {
        const stock = tvAdStock();
        if (!stock.length) return null;
        let item = null;
        for (let tries = 0; tries < 6; tries++) {
            const pick = stock[Math.floor(rng() * stock.length)];
            if (!used[pick.name]) { item = pick; break; }
        }
        if (!item) return null;
        used[item.name] = true;
        const ctx = { item: item.name, price: tvPriceText(item.price), category: item.category };
        const lines = [{ speaker: TV_AD_SPEAKER(), text: tvT(rng, tvPick(rng, TV_AD_PITCH()), ctx) }];
        if (rng() < 0.75) lines.push({ speaker: TV_AD_SPEAKER(), text: tvT(rng, tvPick(rng, TV_AD_SMALLPRINT()), ctx) });
        return { lines, ctx };
    }

    // One propaganda segment: the campaign in the sponsor's own words, often a
    // second line pressing the same point, and the tag naming who paid for it.
    // The sponsor is pinned as {faction} as well as {sponsor}, so the bumper the
    // presenters read hands over to the power that actually bought the minute.
    function tvAdPropagandaSegment(rng, used) {
        const bank = TV_PROPAGANDA() || {};
        const ids = tvPropagandaIds().filter(k => !used[k]);
        if (!ids.length) return null;
        const id = ids[Math.floor(rng() * ids.length)];
        used[id] = true;
        const spot = bank[id];
        const ctx = { sponsor: spot.sponsor, faction: spot.sponsor };
        const beats = tvShuffle(rng, spot.lines).slice(0, rng() < 0.5 ? 2 : 1);
        const lines = beats.map(t => ({ speaker: TV_NOTICE_SPEAKER(), text: tvT(rng, t, ctx) }));
        const tags = (Array.isArray(spot.tags) && spot.tags.length) ? spot.tags : TV_PROPAGANDA_TAG();
        const tag = tvPick(rng, tags);
        if (tag) lines.push({ speaker: TV_NOTICE_SPEAKER(), text: tvT(rng, tag, ctx) });
        return { lines, ctx };
    }

    // A commercial break is dropped into the middle of a broadcast, never at
    // the top and never over the sign-off. The bumpers either side stay with
    // the cast - "we'll be right back" and "and we're back" are the presenters
    // handing over and taking the programme back. Between them run one or two
    // segments, each selling either a product or a position; a break falls back
    // to whichever kind it can still fill.
    function tvCommercialBreak(ch, prog, rng) {
        const cast = tvCast(ch, prog);
        const used = {};
        const segments = [];
        const wanted = rng() < 0.45 ? 2 : 1;
        for (let i = 0; i < wanted; i++) {
            const propagandaFirst = rng() < 0.5;
            const seg = (propagandaFirst ? tvAdPropagandaSegment(rng, used) : tvAdProductSegment(rng, used))
                || (propagandaFirst ? tvAdProductSegment(rng, used) : tvAdPropagandaSegment(rng, used));
            if (seg) segments.push(seg);
        }
        if (!segments.length) return [];
        // The bumpers speak of whoever bought the head of the break. Handing
        // over to a hyperpower is not the same as handing over to a sponsor
        // selling saucepans, and the presenters know the difference.
        const ctx = segments[0].ctx;
        const notice = TV_AD_BUMPER_IN_NOTICE();
        const inBank = (ctx.sponsor && notice && notice.length) ? notice : TV_AD_BUMPER_IN();
        const handover = tvSp(cast, Math.floor(rng() * cast.length));
        const lines = [{ speaker: handover, text: tvT(rng, tvPick(rng, inBank), ctx) }];
        segments.forEach(seg => seg.lines.forEach(ln => lines.push(ln)));
        lines.push({ speaker: tvSp(cast, 0), text: tvT(rng, tvPick(rng, TV_AD_BUMPER_OUT()), ctx) });
        return lines;
    }

    // Shows that are already selling something do not cut to an ad break.
    const TV_NO_AD_FORMATS = ["commercial", "infomercial", "test_pattern", "emergency"];

    function tvInjectCommercialBreak(ch, prog, rng, lines) {
        if (TV_NO_AD_FORMATS.indexOf(prog.format) >= 0) return lines;
        if (lines.length < 6) return lines;
        if (rng() >= 0.45) return lines;
        const brk = tvCommercialBreak(ch, prog, rng);
        if (!brk.length) return lines;
        // Somewhere in the middle: after the opening, before the sign-off.
        const lo = 2, hi = Math.max(lo, lines.length - 2);
        const at = lo + Math.floor(rng() * (hi - lo + 1));
        return lines.slice(0, at).concat(brk, lines.slice(at));
    }

    // ============================================================
    // === SHOW BANKS                                           ===
    // ============================================================
    // Every programme carries its own cast in TVTransmissions.json - one entry
    // per presenter, with the bust and overworld sprite the character is drawn
    // with. A programme with no cast is narrated: nobody is on screen, so the
    // Narrator speaks with no portrait at all (see TV_NARRATOR() below).
    function tvCastMembers(prog) {
        const c = prog && Array.isArray(prog.cast) ? prog.cast.filter(m => m && m.characterName) : [];
        return c;
    }
    function tvCast(ch, prog) {
        const c = tvCastMembers(prog).map(m => m.characterName);
        return c.length ? c : [TV_NARRATOR()];
    }
    function tvSp(cast, i) { return cast[((i % cast.length) + cast.length) % cast.length]; }

    // Openings are shared across every show and specialised by tone, so a
    // channel's voice stays consistent no matter which programme is on.
    const TV_OPEN_BY_TONE = () => tvBank('TvFrame.open');

    // Sign-offs, likewise shared and tone-matched.
    const TV_CLOSE_BY_TONE = () => tvBank('TvFrame.close');

    // Per-format beat banks. Beats are shuffled and drawn without repetition,
    // so a programme is a different broadcast every tune-in.
    const TV_SHOWS = () => tvBank('TvShows');

    // Some formats have a beat that only works as the first or the last thing
    // said. They stay in the beats bank too - the signature dedupe below drops
    // the second appearance - but they are always played in their right place.
    const TV_LEAD = () => tvBank('TvFrame.lead');
    const TV_TAIL = () => tvBank('TvFrame.tail');

    // Per-programme dialogue, keyed by the programme id in TVTransmissions.json.
    // The JSON holds programme METADATA only (id, format, title, tone) plus the
    // channel wiring it has to hold - studio map room and cast event names. All
    // prose lives here with the rest of the writing, so there is exactly one
    // file to open when a line needs changing.
    //
    // Several programmes share a format (the kids channel alone runs five
    // children_show slots), so a programme listed here contributes roughly half
    // its broadcast from its own beats and the rest from the shared format bank,
    // which is what makes them sound like separate shows. lead/tail override
    // TV_LEAD/TV_TAIL for that programme.
    const TV_PROGRAM_CONTENT = () => tvBank('TvPrograms');

        // Tone-matched ad-libs, used when a show's own bank runs dry.
    // Tone-matched ad-libs, used when a show's own bank runs dry. Read lazily
    // through tvBank so a language switch reaches the next broadcast.
    const tvAdLibs = () => tvBank('TvAdLibs');

    // ============================================================
    // === THE BROADCAST CURSE (Em)                             ===
    // ============================================================
    // Eris is jealous enough to bend cosmic law and probability to make Em's
    // life hell (docs/Lore.odt), and a transmitter is the cheapest thing in the
    // world to bend. While Em travels with the party, every programme she tunes
    // into turns round and talks to HER: her name in the presenter's mouth, the
    // general address dropped, and question after question about what she makes
    // of it. Nothing else moves - the schedule, the cast, the format and the
    // subject are the ones everybody else is receiving, because everybody else
    // IS receiving them. The curse only decides who the broadcast is facing.
    //
    // She never answers. Her name was written into somebody else's ritual once
    // already and it cost her ninety-two percent of her life (EM_BACKSTORY in
    // CharacterCreationPresets.js), so she knows better than most what it costs
    // to answer a thing that already knows your name. The studio gets silence
    // every time, and every cursed broadcast closes on it.
    //
    // The curse is applied to the finished script rather than written into the
    // banks, so all several thousand existing beats turn to face her without
    // one of them being rewritten.

    const TV_EM_SWITCH = 48;          // Em's dossier switch
    const TV_EM_NAME = "Em";                    // i18n-ignore: actor name, matched at runtime
    const TV_EM_HOME_FALLBACK = "Wimbledon";    // i18n-ignore: the first Em's home town, a proper noun

    // How much of an ordinary line the curse touches, and how often it puts a
    // beat of its own in. Kept low enough that a broadcast is still the
    // programme that was scheduled, with her name all through it.
    const TV_EM_VOCATIVE_RATE = 0.6;  // chance an ordinary line is addressed to her
    const TV_EM_BEAT_EVERY = 4;       // one cursed beat per this many lines
    const TV_EM_BEAT_MAX = 4;         // never more than this many in one broadcast
    const TV_EM_SILENCE_MAX = 2;      // times the studio remarks on getting nothing

    /**
     * The party member the curse is aimed at. Her dossier switch survives her
     * being handed the party lead, and the name check covers a run whose
     * switches were reset or an Em who joined outside character creation.
     * @returns {object|null} Game_Actor, or null when she is not travelling
     */
    function tvEmActor() {
        try {
            if (typeof $gameParty === "undefined" || !$gameParty || !$gameParty.members) return null;
            const members = $gameParty.members() || [];
            const named = members.find(m => m && m.name && m.name() === TV_EM_NAME);
            if (named) return named;
            if (typeof $gameSwitches !== "undefined" && $gameSwitches && $gameSwitches.value(TV_EM_SWITCH)) {
                return members[0] || null;
            }
        } catch (e) {}
        return null;
    }

    function tvEmInPlay() {
        try {
            if (window.CharacterPresets && window.CharacterPresets.isEmPlaythrough) {
                return !!window.CharacterPresets.isEmPlaythrough();
            }
        } catch (e) {}
        return !!tvEmActor();
    }

    // --- Bubba's warning, once per main-quest run -------------------------
    // The first television any Em playthrough turns on is not a broadcast: it
    // is the scene where Bubba tells her what watching one costs. The scene is
    // played instead of that first programme, and every set from then on works
    // as it always did.
    const TV_STORY_FILE = "mainquest";
    const TV_STORY_SCENE = "television";

    /**
     * Play the television warning if this run is still owed it.
     * @returns {boolean} true when the scene took the set over
     */
    function tvPlayStoryWarning() {
        if (typeof $gameSystem === "undefined" || !$gameSystem) return false;
        if ($gameSystem._tvStoryWarningSeen) return false;
        if (!tvEmInPlay()) return false;
        const story = window.StoryDialogue;
        if (!story || !story.play) return false;
        if (!story.play(TV_STORY_FILE, TV_STORY_SCENE)) return false;
        $gameSystem._tvStoryWarningSeen = true;
        return true;
    }

    function tvEmName() {
        const actor = tvEmActor();
        return (actor && actor.name && actor.name()) || TV_EM_NAME;
    }

    // Her hometown is rolled per playthrough (a different "...bledon" for every
    // incarnation), so the presenters read out whichever one this Em is from.
    function tvEmTown() {
        try {
            const CP = window.CharacterPresets;
            if (CP && CP.getBasePresets && CP.getPresetHometown) {
                const preset = (CP.getBasePresets() || []).find(p => p && p.proceduralLore === "em");
                const town = preset ? CP.getPresetHometown(preset) : "";
                if (town) return town;
            }
        } catch (e) {}
        if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._ccHometown) {
            // The hometown is stored as a Destinations.json key.
            return window.WorkSystem?.destinationName
                ? window.WorkSystem.destinationName($gameSystem._ccHometown)
                : $gameSystem._ccHometown;
        }
        return TV_EM_HOME_FALLBACK;
    }

    // Her portrait for the silences, so the one face on screen while nobody
    // answers is hers.
    function tvEmBustName() {
        const actor = tvEmActor();
        try {
            if (actor && actor.vnBust) {
                const bust = actor.vnBust();
                if (bust && String(bust) !== "0") return String(bust);
            }
        } catch (e) {}
        return "";
    }

    // Whoever a line was addressed to before, it is addressed to her now.
    // Ordered widest-last, so "everyone at home" is caught before "viewers".
    const TV_EM_GENERAL_ADDRESS = [
        /\b(?:everybody|everyone|anybody|anyone)\s+(?:at\s+home|out\s+there|still\s+listening|listening)\b/gi,
        /\bwhoever\s+(?:is|'s)\s+(?:listening|watching|still\s+listening|out\s+there)\b/gi,
        /\byou\s+at\s+home\b/gi,
        /\bladies\s+and\s+gentlemen\b/gi,
        /\bthe\s+(?:viewers|listeners|audience\s+at\s+home)\b/gi,
        /\bviewers\b/gi,
        /\blisteners\b/gi
    ];

    function tvEmRedirect(text, name) {
        let s = String(text || "");
        TV_EM_GENERAL_ADDRESS.forEach(re => { s = s.replace(re, name); });
        return s;
    }

    // Vocatives. A prefix opens the line, a suffix is slipped inside its final
    // full stop; every suffix therefore has to begin with her name, because
    // tvT capitalises what it is given.
    const TV_EM_PREFIX = () => tvBank('TvEm.prefix');
    const TV_EM_SUFFIX = () => tvBank('TvEm.suffix');
    // Tags that turn the line they are attached to into a question, so the
    // full stop the programme wrote has to become a question mark.
    const TV_EM_SUFFIX_Q = () => tvBank('TvEm.suffixQ');

    // Beats the curse writes itself: the question put to her, and the things
    // the transmission should not know about the woman receiving it.
    const TV_EM_OPINION = () => tvBank('TvEm.opinion');
    const TV_EM_DIRECT = () => tvBank('TvEm.direct');
    // What the studio does with the silence it gets back.
    const TV_EM_SILENCE_BEATS = () => tvBank('TvEm.silence');
    // Hers, and not one of them a reply.
    const TV_EM_REFUSAL = () => tvBank('TvEm.refusal');

    // --- The programmes that want a word out of her -----------------------
    // Most transmissions only ask. A minority of them are not asking: they
    // have been given one word and an hour to get it said out loud, and they
    // spend the hour on that and nothing else. Which programme is one of those
    // is decided by the programme itself, never by the roll of the broadcast,
    // so a show that hunts her keeps hunting her every time it is on.
    const TV_EM_AGGRO_SHARE = 0.3;    // share of programmes that hunt the word
    const TV_EM_AGGRO_BEAT_EVERY = 2; // an aggressive hour barely stops for the show
    const TV_EM_AGGRO_BEAT_MAX = 8;
    const TV_EM_AGGRO_VOCATIVE_RATE = 0.85;
    const TV_EM_WORDS = () => tvBank('TvEm.word');
    const TV_EM_AGGRO_OPEN = () => tvBank('TvEm.aggro.open');
    const TV_EM_AGGRO_DEMAND = () => tvBank('TvEm.aggro.demand');
    const TV_EM_AGGRO_BAIT = () => tvBank('TvEm.aggro.bait');
    const TV_EM_AGGRO_CHORUS = () => tvBank('TvEm.aggro.chorus');
    const TV_EM_AGGRO_THREAT = () => tvBank('TvEm.aggro.threat');
    const TV_EM_AGGRO_SILENCE = () => tvBank('TvEm.aggro.silence');
    const TV_EM_AGGRO_REFUSAL = () => tvBank('TvEm.aggro.refusal');
    const TV_EM_AGGRO_CLOSE = () => tvBank('TvEm.aggro.close');

    /**
     * Whether this programme is one of the ones that hunts the word.
     * @param {object} base - Template context carrying channel and title
     * @returns {boolean}
     */
    function tvEmAggressive(base) {
        const key = String((base && base.title) || "") + "|" + String((base && base.channel) || "");
        if (!key.replace(/\|/g, "")) return false;
        let h = 2166136261;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return ((h >>> 0) % 1000) / 1000 < TV_EM_AGGRO_SHARE;
    }

    function tvEmCtx(base) {
        return Object.assign({ em: tvEmName(), em_town: tvEmTown() }, base || {});
    }

    // A vocative goes in front of the line or inside its final full stop, never
    // both, and never on a line that already has her name in it.
    function tvEmAttach(rng, text, ctx) {
        const s = String(text || "").trim();
        if (!s) return s;
        if (rng() < 0.5) return tvT(rng, tvPick(rng, TV_EM_PREFIX()), ctx) + " " + s;
        const asking = rng() < 0.35;
        const tag = tvT(rng, tvPick(rng, asking ? TV_EM_SUFFIX_Q() : TV_EM_SUFFIX()), ctx);
        const end = /([.!?]+["')\]]?)\s*$/.exec(s);
        if (!end) return s + ", " + tag + (asking ? "?" : ".");
        // A cryptic beat trails off in an ellipsis; the tag goes inside it and
        // the line keeps trailing off.
        const close = (asking && !/^\.\.\./.test(end[1])) ? end[1].replace(/[.!?]+/, "?") : end[1];
        return s.slice(0, end.index).replace(/[,;:\s]+$/, "") + ", " + tag + close;
    }

    // One ordinary line of the programme, turned to face her.
    function tvEmFaceLine(rng, text, ctx, rate) {
        const name = ctx.em;
        const redirected = tvEmRedirect(text, name);
        const already = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(redirected);
        if (already || rng() >= (rate === undefined ? TV_EM_VOCATIVE_RATE : rate)) return redirected;
        return tvEmAttach(rng, redirected, ctx);
    }

    /**
     * Rewrite a finished broadcast as the one Em receives.
     * @param {function} rng - Seeded generator for this broadcast
     * @param {array} lines - [{speaker, text}] as scheduled
     * @param {object} base - Extra template context (channel, title)
     * @returns {array} The same broadcast, addressed to her
     */
    function tvEmCurse(rng, lines, base) {
        if (!Array.isArray(lines) || !lines.length || !tvEmInPlay()) return lines;
        const ctx = tvEmCtx(base);
        const spent = {};
        // A broadcast never repeats one of the curse's own beats, and prefers
        // the ones it has not used before falling back to the whole bank.
        const draw = bank => {
            const fresh = bank.filter(tpl => !spent[tpl]);
            const tpl = tvPick(rng, fresh.length ? fresh : bank);
            if (!tpl) return "";
            spent[tpl] = true;
            return tvT(rng, tpl, ctx);
        };

        // An aggressive hour picks its word before the first line and then
        // works up a ladder: it asks, it tricks, the room starts chanting, and
        // by the end it is telling her what happens if she keeps not saying it.
        const aggro = tvEmAggressive(base);
        if (aggro) ctx.word = tvT(rng, tvPick(rng, TV_EM_WORDS()), ctx);
        const ladder = [TV_EM_AGGRO_DEMAND, TV_EM_AGGRO_BAIT, TV_EM_AGGRO_CHORUS, TV_EM_AGGRO_THREAT];
        const beatEvery = aggro ? TV_EM_AGGRO_BEAT_EVERY : TV_EM_BEAT_EVERY;
        const beatMax = aggro ? TV_EM_AGGRO_BEAT_MAX : TV_EM_BEAT_MAX;
        const vocative = aggro ? TV_EM_AGGRO_VOCATIVE_RATE : TV_EM_VOCATIVE_RATE;

        const out = [];
        let beats = 0;
        let silences = 0;
        lines.forEach((ln, i) => {
            out.push({ speaker: ln.speaker, text: tvEmFaceLine(rng, ln.text, ctx, vocative) });
            // The hunt announces itself the moment the programme has opened.
            if (aggro && i === 0) {
                out.push({ speaker: ln.speaker, text: draw(TV_EM_AGGRO_OPEN()) });
                return;
            }
            if (aggro) {
                if (i >= lines.length - 1) return;
                if (beats >= beatMax || (i + 1) % beatEvery !== 0) return;
                // The further into the hour, the further up the ladder: the
                // last rungs are the room chanting and the threat behind it.
                const rung = Math.min(ladder.length - 1, Math.floor(beats / 2));
                const pool = (rng() < 0.7 ? ladder[rung] : ladder[Math.floor(rng() * ladder.length)])();
                beats++;
                out.push({ speaker: ln.speaker, text: draw(pool) });
                if (rng() < 0.55) {
                    out.push({ speaker: ctx.em, text: draw(TV_EM_AGGRO_REFUSAL()), em: true });
                    out.push({ speaker: ln.speaker, text: draw(TV_EM_AGGRO_SILENCE()) });
                }
                return;
            }
            // The opening line is left to open the programme; the sign-off is
            // handled by the close below.
            if (i === 0 || i >= lines.length - 1) return;
            if (beats >= TV_EM_BEAT_MAX || (i + 1) % TV_EM_BEAT_EVERY !== 0) return;
            beats++;
            // Two questions to every remark: the curse wants an answer out of
            // her far more than it wants to show off what it knows.
            out.push({ speaker: ln.speaker, text: draw(rng() < 0.65 ? TV_EM_OPINION() : TV_EM_DIRECT()) });
            // The first question always gets its answer shown - which is to say
            // her not giving one - so the player learns the rule of the curse
            // the first time a cursed programme is watched.
            if (silences < TV_EM_SILENCE_MAX && (silences === 0 || rng() < 0.4)) {
                silences++;
                out.push({ speaker: ctx.em, text: draw(TV_EM_REFUSAL()), em: true });
                out.push({ speaker: ln.speaker, text: draw(TV_EM_SILENCE_BEATS()) });
            }
        });

        // However the programme signed off, the hour closes on the question it
        // did not get an answer to.
        const last = out[out.length - 1];
        const speaker = (last && last.speaker) || ctx.em;
        if (aggro) {
            // A hunt does not close on a question. It closes on the demand, her
            // silence, and the promise that the same hour is booked tomorrow.
            out.push({ speaker, text: draw(TV_EM_AGGRO_DEMAND()) });
            out.push({ speaker: ctx.em, text: draw(TV_EM_AGGRO_REFUSAL()), em: true });
            out.push({ speaker, text: draw(TV_EM_AGGRO_CLOSE()) });
            return out;
        }
        out.push({ speaker, text: draw(TV_EM_OPINION()) });
        out.push({ speaker: ctx.em, text: draw(TV_EM_REFUSAL()), em: true });
        return out;
    }

    // A tune-in should feel like a real broadcast, not a two-liner.
    const TV_MIN_LINES = 10;
    const TV_MAX_LINES = 16;

    // First few words, normalised: catches near-duplicate lines.
    function tvLineSignature(text) {
        return String(text || "").toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
    }

    // Every show is assembled the same way - a tone-matched opening, a shuffled
    // run of beats from the format's own bank, and a tone-matched sign-off -
    // but because every string is a template resolved against LORE, two
    // broadcasts of one programme share a shape and almost nothing else.
    function tvBuildShow(ch, prog, rng) {
        const cast = tvCast(ch, prog);
        const tone = prog.tone || ch.tone || "serious";
        const spec = TV_SHOWS()[prog.format] || TV_SHOWS().commercial;
        const ctx = {
            channel: tvChannelName(ch),
            title: tvProgramTitle(prog),
            host: tvSp(cast, 0),
            cohost: tvSp(cast, 1)
        };
        const lines = [];
        const seen = {};       // near-duplicate resolved text
        const spent = {};      // templates already used this broadcast
        let i = 0;
        const say = (tpl, force) => {
            if (!tpl) return;
            if (spent[tpl] && !force) return;
            spent[tpl] = true;
            const text = tvT(rng, tpl, ctx);
            const sig = tvLineSignature(text);
            if (!sig || seen[sig]) return;
            seen[sig] = true;
            lines.push({ speaker: tvSp(cast, i++), text });
        };

        // The sign-off beat is held back so the shuffled body cannot spend it
        // halfway through the show.
        const own = TV_PROGRAM_CONTENT()[prog.id] || {};
        const tailTpl = tvPick(rng, own.tail || TV_TAIL()[prog.format]);
        if (tailTpl) spent[tailTpl] = true;

        say(tvPick(rng, TV_OPEN_BY_TONE()[tone] || TV_OPEN_BY_TONE().serious));
        say(tvPick(rng, own.lead || TV_LEAD()[prog.format]), true);

        // Reserve the last two boxes for the format's sign-off beat and the
        // tone-matched close.
        const target = TV_MIN_LINES + Math.floor(rng() * (TV_MAX_LINES - TV_MIN_LINES + 1));
        const body = Math.max(3, target - 2);

        // Roughly half the body comes from the programme's own beats where it
        // has any (see TV_PROGRAM_CONTENT), the rest from the shared format
        // bank - which is what makes two shows of one format sound like
        // different shows rather than the same one retitled.
        const ownBeats = tvShuffle(rng, own.beats || []);
        const bank = tvShuffle(rng, spec.beats || []);
        let oi = 0, bi = 0;
        while (lines.length < body && (oi < ownBeats.length || bi < bank.length)) {
            const takeOwn = oi < ownBeats.length && (bi >= bank.length || rng() < 0.55);
            say(takeOwn ? ownBeats[oi++] : bank[bi++]);
        }
        // Bank exhausted (short banks, or every draw collided): borrow
        // tone-matched ad-libs rather than repeat a beat.
        const adLibs = tvAdLibs();
        const tones = Object.keys(adLibs);
        let guard = 0;
        while (lines.length < body && guard++ < 40) {
            const pool = adLibs[tone] || adLibs.serious;
            const alt = adLibs[tvPick(rng, tones)] || pool;
            say(tvPick(rng, rng() < 0.6 ? pool : alt));
        }

        say(tailTpl, true);
        say(tvPick(rng, TV_CLOSE_BY_TONE()[tone] || TV_CLOSE_BY_TONE().serious));
        return lines;
    }

    // A resolved line can run long enough to overflow a message box; split it
    // across consecutive boxes from the same speaker rather than lose the tail.
    const TV_BOX_ROWS = 4;
    function tvSplitLongLines(lines) {
        const out = [];
        lines.forEach(ln => {
            const rows = tvWrap(ln.text, 48);
            if (rows.length <= TV_BOX_ROWS) { out.push(ln); return; }
            for (let i = 0; i < rows.length; i += TV_BOX_ROWS) {
                out.push({ speaker: ln.speaker, text: rows.slice(i, i + TV_BOX_ROWS).join(" "), em: ln.em });
            }
        });
        return out;
    }

    // Bumped on every script build so tuning into the same channel at the same
    // hour yields a fresh broadcast rather than a rerun of the same lines.
    function tvNextScriptNonce() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return 0;
        $gameSystem._tvScriptNonce = (($gameSystem._tvScriptNonce || 0) + 1) % 1000003;
        return $gameSystem._tvScriptNonce;
    }

    function tvBuildScript(channel, program) {
        updateLanguage();
        const week = tvWeekIndex();
        const nonce = tvNextScriptNonce();
        const seedInt = (tvHistorySeed() ^ Math.imul(week + 1, 0x85EBCA6B) ^ tvHash(channel.id + ":" + program.id)
            ^ Math.imul(tvDayOfWeek() + 1, 0xC2B2AE35) ^ Math.imul(nonce + 1, 0x27D4EB2F)) >>> 0;
        const rng = tvRng(seedInt);
        // Seed the legacy generator too so anything still reaching for
        // getContent() stays coherent within this one broadcast.
        setSeed(seedInt % 2147483647);
        let lines = [];
        try { lines = tvBuildShow(channel, program, rng) || []; } catch (e) { console.error("TV script error", e); }
        if (!lines.length) lines = [{ speaker: tvChannelName(channel), text: T('TvFrame.technicalDifficulties') }];
        lines = tvInjectCommercialBreak(channel, program, rng, lines);
        // Last, so the advertisements are talking to her too (see tvEmCurse).
        lines = tvEmCurse(rng, lines, { channel: tvChannelName(channel), title: tvProgramTitle(program) });
        return { title: tvProgramTitle(program), lines: tvSplitLongLines(lines) };
    }

    // --- Text wrapping for message boxes -----------------------
    function tvWrap(text, maxChars) {
        maxChars = maxChars || 48;
        const words = String(text).split(/\s+/);
        const out = [];
        let cur = "";
        for (const w of words) {
            if ((cur + " " + w).trim().length > maxChars) {
                if (cur) out.push(cur);
                cur = w;
            } else {
                cur = (cur ? cur + " " : "") + w;
            }
        }
        if (cur) out.push(cur);
        return out.length ? out : [""];
    }

    // ============================================================
    // === TUNE-IN: teleport + perform broadcast               ===
    // ============================================================

    // Resolve a channel + the program that should play (explicit id, on-air, or first).
    function tvResolveProgram(channelId, programId) {
        const channel = tvChannelById(channelId);
        if (!channel) return null;
        let program = programId ? tvProgramById(channel, programId) : null;
        if (!program) {
            const onair = tvOnAir(channelId);
            program = onair ? tvProgramById(channel, onair.programId) : null;
        }
        if (!program) program = (channel.programs || [])[0];
        if (!program) return null;
        return { channel, program };
    }

    // mode: 'watch' teleports into the studio room; 'listen' performs the
    // broadcast in place (no transfer); omitted/'ask' prompts the player to
    // listen, watch, or cancel.
    function tvTuneIn(channelId, programId, mode) {
        if (tvPlayStoryWarning()) return;
        const db = loadTVDB();
        const resolved = tvResolveProgram(channelId, programId);
        if (!resolved) { console.warn("TV: cannot tune", channelId, programId); return; }
        const { channel, program } = resolved;

        if (!mode || mode === 'ask') { tvRequestTune(channelId, program.id); return; }

        const script = tvBuildScript(channel, program);
        const room = channel.room || { x: $gamePlayer.x, y: $gamePlayer.y, dir: 2 };
        const mapId = db.studioMapId || 0;
        const watch = (mode === 'watch') && mapId > 0;

        $gameSystem._tvReturn = watch
            ? { mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y, dir: $gamePlayer.direction() }
            : null;
        $gameSystem._tvPending = {
            channelId, programId: program.id, script,
            channelName: tvChannelName(channel), color: channel.color || 7,
            started: false, inPlace: !watch
        };

        if (watch) {
            $gamePlayer.reserveTransfer(mapId, room.x, room.y, room.dir || 2, 0);
        }
        // 'listen' / in-place broadcasts are kicked off by the Scene_Map update
        // hook once the interpreter and message window are free.
    }

    // Queue a tune-in that the map will pick up and prompt Listen / Watch for.
    function tvRequestTune(channelId, programId) {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        $gameSystem._tvTuneRequest = { channelId, programId: programId || null };
    }

    // Shown on the map when a tune request is pending and nothing is busy:
    // listen in place, watch from the studio, or back out. Deliberately plain
    // text - message colour codes are mangled by the custom message window.
    function tvProcessTuneRequest() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        const req = $gameSystem._tvTuneRequest;
        if (!req) return;
        if (!$gameMap || !$gameMap._interpreter || $gameMap._interpreter.isRunning()) return;
        if ($gameMessage.isBusy()) return;
        if ($gameSystem._tvPending) return; // a broadcast is already queued/playing
        $gameSystem._tvTuneRequest = null;

        const resolved = tvResolveProgram(req.channelId, req.programId);
        const channelName = resolved ? tvChannelName(resolved.channel) : "";
        const programName = resolved ? tvProgramTitle(resolved.program) : "";
        const head = programName ? `${channelName} - "${programName}"` : channelName;
        $gameMessage.setChoices(T.list('TvFrame.tuneInChoices'), 0, 2);
        $gameMessage.setChoicePositionType(1);
        $gameMessage.setChoiceCallback(n => {
            if (n === 0) tvTuneIn(req.channelId, req.programId, 'listen');
            else if (n === 1) tvTuneIn(req.channelId, req.programId, 'watch');
            // anything else: the player backed out, no broadcast is queued.
        });
    }

    function tvRunPendingProgram() {
        const pend = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem._tvPending : null;
        if (!pend || pend.started) return;
        if (!$gameMap || !$gameMap._interpreter) return;
        if ($gameMap._interpreter.isRunning()) return; // try again next frame
        pend.started = true;

        const lines = (pend.script && pend.script.lines) || [];
        // Both "listen" and "watch" play the same message chain: OK advances a
        // line, cancel aborts the whole broadcast (see tvAbortBroadcast).
        pend.playing = true;
        const commands = [];
        commands.push({ code: 355, indent: 0, parameters: [`window.TVStudio.begin(${JSON.stringify(pend.channelName)}, ${Number(pend.color) || 7});`] });
        lines.forEach(ln => {
            const speaker = ln.speaker || pend.channelName || "";
            commands.push({ code: 355, indent: 0, parameters: [`window.TVStudio.prepareSpeaker(${JSON.stringify(speaker)}${ln.em ? ", true" : ""});`] });
            commands.push({ code: 101, indent: 0, parameters: ["", 0, 0, 2, speaker] });
            tvWrap(ln.text, 48).forEach(t => commands.push({ code: 401, indent: 0, parameters: [t] }));
        });
        commands.push({ code: 355, indent: 0, parameters: [`window.TVStudio.reward(true);`] });
        commands.push({ code: 355, indent: 0, parameters: [`window.TVStudio.end();`] });
        commands.push({ code: 0, indent: 0, parameters: [] });

        $gameMap._interpreter.setup(commands, 0);
    }

    // ============================================================
    // === FUN (LEISURE) PAYOUT                                 ===
    // ============================================================
    // Watching or listening to a transmission is leisure: it tops up the Fun
    // meter of everyone in the party. Technophobes hate the thing in the
    // corner of the room, so the same broadcast costs them the same amount.
    const TV_TECHNOPHOBE_TRAIT_ID = 34;
    const TV_FUN_FULL = 8;          // sat through the whole transmission
    const TV_FUN_PARTIAL = 3;       // cut it short

    function tvMemberTraitIds(mem) {
        if (!mem) return [];
        const sel = mem._selectedTraits;
        if (Array.isArray(sel) && sel.length) return sel.map(t => (t && t.id) || 0);
        try {
            const profile = window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile
                ? window.NPCSocietyRegistry.getProfile(mem.name())
                : null;
            if (profile && Array.isArray(profile.traitIds)) return profile.traitIds.slice();
        } catch (e) {}
        return [];
    }

    function tvIsTechnophobe(mem) {
        return tvMemberTraitIds(mem).indexOf(TV_TECHNOPHOBE_TRAIT_ID) >= 0;
    }

    // Per-member sign, so PartyNeeds.addLeisureToAll (which applies one delta
    // to everybody) is not usable here. Mirrors its dual-write pattern: the
    // leader keeps the meter on the actor, recruited NPCs on their society
    // profile.
    function tvApplyFun(magnitude) {
        if (!magnitude || typeof $gameParty === 'undefined' || !$gameParty) return null;
        let gained = 0, lost = 0;
        $gameParty.members().forEach(mem => {
            if (!mem) return;
            const delta = tvIsTechnophobe(mem) ? -magnitude : magnitude;
            if (delta >= 0) gained++; else lost++;
            // The actor need methods write where the meter lives: the actor for
            // the player, the society profile for a recruited companion.
            if (delta >= 0) { if (mem.addLeisure) mem.addLeisure(delta); }
            else if (mem.reduceLeisure) { mem.reduceLeisure(-delta); }
        });
        return { magnitude, gained, lost };
    }

    // Watching also trains the party's eye for what is on: an hour of
    // television is an hour of Film Criticism.
    const TV_SPEC = "Film Criticism"; // i18n-ignore: Specialization.json id
    const TV_SPEC_POINTS = 1;

    // Reported through the shared notification service, so Fun moves the same
    // way here as it does in every minigame; a tier gained while the set was on
    // queues up behind it instead of replacing it.
    function tvFunToast(result) {
        if (!result || !window.ParchmentToast) return;
        try {
            let gained = [];
            if (result.gained && window.SpecializationXP) {
                gained = window.SpecializationXP.award(TV_SPEC, TV_SPEC_POINTS, { silent: true }) || [];
            }
            const delta = result.gained ? result.magnitude : -result.magnitude;
            const note = (result.gained && result.lost)
                ? T.n('TvFrame.technophobesLost', result.lost, { n: result.lost, magnitude: result.magnitude })
                : "";
            window.ParchmentToast.group([
                () => window.ParchmentToast.need("leisure", delta, { note }),
                ...gained.map(g => () => window.SpecializationXP.announce(g))
            ]);
        } catch (e) {}
    }

    // ============================================================
    // === SPEAKER PORTRAITS                                    ===
    // ============================================================
    // Studio presenters are invented for this plugin, so they have no entry in
    // NPCSim and no sprite association to derive a portrait from - every one of
    // them used to land on the "7" fallback, which is one of the sub-50KB
    // placeholder files in img/busts. Instead the name itself seeds the choice:
    // hash the name, index into the sorted pool of real bust files, and keep
    // the result. Same presenter, same face, every broadcast.
    const TV_BUST_MIN_BYTES = 50000;   // below this, img/busts holds placeholders
    const TV_BUST_FALLBACK = () => tvBank('TvEm.bustFallback');
    let _tvBustPool = null;

    function tvBustPool() {
        if (_tvBustPool) return _tvBustPool;
        let pool = [];
        try {
            const fs = require('fs');
            const nodePath = require('path');
            const dir = nodePath.join(nodePath.dirname(process.mainModule.filename), 'img/busts/');
            pool = fs.readdirSync(dir)
                .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
                .filter(f => {
                    try {
                        const st = fs.statSync(nodePath.join(dir, f));
                        return st.isFile() && st.size > TV_BUST_MIN_BYTES;
                    } catch (e) { return false; }
                })
                .map(f => f.replace(/\.(png|jpg|jpeg|webp)$/i, ''));
        } catch (e) {
            pool = [];   // no filesystem (browser build): fall back to known-good names
        }
        if (!pool.length) pool = TV_BUST_FALLBACK().slice();
        pool.sort();     // stable order, so a name maps to the same face every run
        _tvBustPool = pool;
        return pool;
    }

    // Authored portraits win over everything else: a cast member in
    // TVTransmissions.json names the bust the character is drawn with, so the
    // same presenter looks the same on every channel that books them.
    let _tvCastIndex = null;

    function tvCastIndex() {
        if (_tvCastIndex) return _tvCastIndex;
        const map = {};
        try {
            loadTVDB().channels.forEach(ch => {
                (ch.programs || []).forEach(prog => {
                    tvCastMembers(prog).forEach(m => {
                        const key = String(m.characterName).trim();
                        if (key && !map[key]) map[key] = m;
                    });
                });
            });
        } catch (e) {}
        _tvCastIndex = map;
        return map;
    }

    // The assignment is written to $gameSystem the first time it is made, so a
    // presenter keeps their face even if the bust folder gains or loses files
    // later in a playthrough.
    function tvBustForName(name) {
        const key = String(name || "").trim();
        if (!key) return null;
        let saved = null;
        try { saved = $gameSystem && $gameSystem._tvBusts; } catch (e) {}
        if (saved && saved[key]) return saved[key];
        const pool = tvBustPool();
        if (!pool.length) return null;
        const pick = pool[tvHash(key) % pool.length];
        try {
            if ($gameSystem) {
                if (!$gameSystem._tvBusts) $gameSystem._tvBusts = {};
                $gameSystem._tvBusts[key] = pick;
            }
        } catch (e) {}
        return pick;
    }

    // Studio runtime helper invoked from the generated event commands.
    window.TVStudio = {
        begin(channelName, color) {
            const scene = SceneManager._scene;
            if (scene && scene._bustManager && scene._bustManager.enableBatchDialogue) {
                scene._bustManager.enableBatchDialogue();
            }
        },
        prepareSpeaker(name, isViewer) {
            const scene = SceneManager._scene;
            // A cursed broadcast's silences belong to the woman receiving it,
            // not to the studio: her own portrait, and nothing at all if the
            // game has no bust for her (see tvEmCurse).
            if (isViewer) {
                const bust = tvEmBustName();
                if (bust && scene && scene._bustManager && scene._bustManager.showCustomBust) {
                    // She is watching, not broadcasting: her portrait takes the
                    // left-hand slot the party speaks from, and the studio keeps
                    // the right.
                    scene._bustManager.showCustomBust(bust, name, "left");
                } else if (scene && scene._bustManager && scene._bustManager.hideBusts) {
                    scene._bustManager.hideBusts();
                }
                return;
            }

            // An advertisement, like a narrator, is an off-screen voice: no
            // portrait at all.
            if (name === TV_AD_SPEAKER() || name === TV_NARRATOR()) {
                if (scene && scene._bustManager && scene._bustManager.hideBusts) {
                    scene._bustManager.hideBusts();
                }
                return;
            }

            // A booked cast member carries their own portrait, so nothing has to
            // be derived from the studio event or seeded off the name.
            const member = tvCastIndex()[String(name || "").trim()];
            if (member && member.bustName) {
                try {
                    const cev = $gameMap.events().find(e => {
                        const n = e && e.event && e.event() && e.event().name;
                        return n && n.trim() === name;
                    });
                    if (cev) {
                        // The presenter standing in the studio wears the sprite
                        // that goes with their bust.
                        if (member.characterSprite && cev.setImage) cev.setImage(member.characterSprite, 0);
                        if (cev.turnTowardPlayer) cev.turnTowardPlayer();
                    }
                } catch (e) {}
                if (scene && scene._bustManager && scene._bustManager.showCustomBust) {
                    scene._bustManager.showCustomBust(member.bustName, name);
                }
                return;
            }

            let ev = null;
            try {
                ev = $gameMap.events().find(e => {
                    const n = e && e.event && e.event() && e.event().name;
                    return n && n.trim() === name;
                });
            } catch (e) {}
            if (ev && ev.turnTowardPlayer) { try { ev.turnTowardPlayer(); } catch (e) {} }

            let bust = "7";
            try {
                if (window.NPCSim && window.NPCSim.getBustForNPC) {
                    const b = window.NPCSim.getBustForNPC(name);
                    if (b) bust = String(b);
                }
            } catch (e) {}
            if (bust === "7" && ev) {
                try {
                    const page = ev.event().pages.find(p => ev.meetsConditions(p));
                    const cn = page && page.image && page.image.characterName;
                    const ci = page && page.image ? page.image.characterIndex : 0;
                    if (cn && window.Sprites && window.Sprites.SpritesAssociation) {
                        const sheet = cn.split('.')[0];
                        const assoc = window.Sprites.SpritesAssociation[sheet];
                        if (assoc && assoc[ci]) bust = String(assoc[ci]);
                    }
                } catch (e) {}
            }
            // Nothing authoritative found: seed a real portrait off the name
            // rather than showing the placeholder.
            if (!bust || bust === "7") bust = tvBustForName(name) || bust || "7";
            if (scene && scene._bustManager && scene._bustManager.showCustomBust) {
                scene._bustManager.showCustomBust(bust, name);
            }
        },
        end() {
            const scene = SceneManager._scene;
            if (scene && scene._bustManager && scene._bustManager.hideBusts) {
                scene._bustManager.hideBusts();
            }
            const ret = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem._tvReturn : null;
            if (typeof $gameSystem !== 'undefined' && $gameSystem) {
                if ($gameSystem._tvPending) $gameSystem._tvPending.playing = false;
                $gameSystem._tvPending = null;
                $gameSystem._tvReturn = null;
            }
            if (ret && ret.mapId) {
                $gamePlayer.reserveTransfer(ret.mapId, ret.x, ret.y, ret.dir || 2, 0);
            }
        },
        // Paid out once per broadcast: full value for sitting through it,
        // reduced if the player cut it short.
        reward(full) {
            const pend = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem._tvPending : null;
            if (!pend || pend.rewarded) return;
            pend.rewarded = true;
            tvFunToast(tvApplyFun(full ? TV_FUN_FULL : TV_FUN_PARTIAL));
        },
        // Cancel/back during a broadcast: stop the transmission where it is.
        abort() { tvAbortBroadcast(); }
    };

    // Cut a running broadcast short (player pressed cancel/back). Drops the
    // remaining message chain, hides the busts and sends a "watch" viewer home.
    function tvAbortBroadcast() {
        const pend = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem._tvPending : null;
        if (!pend || !pend.playing) return;
        pend.playing = false;
        try {
            if ($gameMap && $gameMap._interpreter) $gameMap._interpreter.clear();
        } catch (e) {}
        try {
            $gameMessage.clear();
            const win = SceneManager._scene && SceneManager._scene._messageWindow;
            if (win && win.terminateMessage) win.terminateMessage();
        } catch (e) {}
        SoundManager.playCancel();
        window.TVStudio.reward(false);
        window.TVStudio.end();
    }

    // While a broadcast plays, cancel interrupts it. OK is left alone so it
    // keeps advancing the message chain, in both listen and watch mode.
    function tvUpdateBroadcastInput() {
        const pend = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem._tvPending : null;
        if (!pend || !pend.playing) return;
        if (Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled()) {
            Input.update();
            Input.clear();
            tvAbortBroadcast();
        }
    }

    // Kick the pending program once the studio map is ready.
    const _Scene_Map_start_TV = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start_TV.call(this);
        try {
            const db = loadTVDB();
            const pend = $gameSystem && $gameSystem._tvPending;
            if (pend && !pend.started && db.studioMapId && $gameMap.mapId() === db.studioMapId) {
                tvRunPendingProgram();
            }
        } catch (e) { console.error("TV start hook error", e); }
    };
    // Retry if the interpreter was busy on the first frame.
    const _Scene_Map_update_TV = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_TV.call(this);
        try {
            tvUpdateBroadcastInput();
            tvProcessTuneRequest();
            const db = loadTVDB();
            const pend = $gameSystem && $gameSystem._tvPending;
            if (pend && !pend.started && !$gameMessage.isBusy()) {
                // In-place ("listen") broadcasts run on the current map; "watch"
                // broadcasts wait until the player has reached the studio map.
                if (pend.inPlace || ($gameMap.mapId() === db.studioMapId)) {
                    tvRunPendingProgram();
                }
            }
        } catch (e) {}
    };

    // ============================================================
    // === HEXAVIDEO: teletext-style TV interface (Scene_TVGuide, ===
    // === Scene_TVSchedule) modelled on Italian Televideo.       ===
    // ============================================================

    // Classic teletext raster: 25 rows of blocky, bold monospace cells on a
    // pure black field with saturated primaries. The cell width is the real
    // character advance of the font, so text runs solid with no gaps between
    // characters; the column count follows from it.
    const TT_ROWS = 25;
    const TT = {
        black: "#000000", red: "#ff0000", green: "#00ff00", yellow: "#ffff00",
        blue: "#0000ff", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff",
        navy: "#0000aa", dim: "#8a8a8a"
    };

    let _ttMetrics = null;
    let _ttMetricsKey = "";
    function ttMetrics() {
        const key = Graphics.width + "x" + Graphics.height;
        if (_ttMetricsKey !== key || !_ttMetrics) {
            const cellH = Math.max(8, Math.floor(Graphics.height / TT_ROWS));
            const probe = new Bitmap(128, 64);
            probe.fontFace = "monospace";
            probe.fontBold = true;
            probe.fontSize = Math.max(10, Math.floor(cellH * 0.82));
            let adv = 0;
            try { adv = probe.measureTextWidth("MMMMMMMMMM") / 10; } catch (e) { adv = 0; }
            if (!adv) adv = probe.fontSize * 0.6;
            _ttMetrics = { cellW: Math.max(4, Math.round(adv)), cellH };
            _ttMetricsKey = key;
        }
        return _ttMetrics;
    }

    // The page fills the whole screen, not just the "box" area.
    function ttCellW() { return ttMetrics().cellW; }
    function ttCellH() { return ttMetrics().cellH; }
    function ttCols() { return Math.floor(Graphics.width / ttCellW()); }
    function ttWidth() { return ttCellW() * ttCols(); }
    function ttHeight() { return ttCellH() * TT_ROWS; }
    function ttOriginX() { return Math.floor((Graphics.width - ttWidth()) / 2); }
    function ttOriginY() { return Math.floor((Graphics.height - ttHeight()) / 2); }
    // Windows live in the window layer, which Scene_Base offsets by half the
    // difference between the screen and the box; convert grid cells to it.
    function ttWinX(col) { return ttOriginX() + col * ttCellW() - Math.floor((Graphics.width - Graphics.boxWidth) / 2); }
    function ttWinY(row) { return ttOriginY() + row * ttCellH() - Math.floor((Graphics.height - Graphics.boxHeight) / 2); }

    function ttSetFont(bitmap) {
        bitmap.fontFace = "monospace";
        bitmap.fontBold = true;
        bitmap.fontItalic = false;
        bitmap.outlineWidth = 0;
        bitmap.fontSize = Math.max(10, Math.floor(ttCellH() * 0.82));
    }

    // Draw a run of text (pixel coordinates). One character per cell, drawn as
    // a single string so the glyphs sit flush against each other.
    function ttDrawCells(bitmap, x, y, text, color, opts) {
        opts = opts || {};
        const cw = ttCellW(), ch = ttCellH();
        const str = String(text == null ? "" : text);
        if (opts.bg) bitmap.fillRect(x, y, cw * str.length, ch, opts.bg);
        ttSetFont(bitmap);
        bitmap.textColor = color || TT.white;
        bitmap.drawText(str, x, y, cw * str.length + cw, ch, "left");
    }

    // Grid-addressed helpers (col/row) for full-screen page bitmaps.
    function ttText(bitmap, col, row, text, color, opts) {
        ttDrawCells(bitmap, col * ttCellW(), row * ttCellH(), text, color, opts);
    }
    function ttBox(bitmap, col, row, cols, rows, color) {
        bitmap.fillRect(col * ttCellW(), row * ttCellH(), cols * ttCellW(), rows * ttCellH(), color);
    }
    function ttClip(text, cols) {
        const s = String(text == null ? "" : text);
        return s.length > cols ? s.substr(0, cols) : s;
    }
    function ttPad(text, cols) {
        return ttClip(text, cols).padEnd(cols, " ");
    }

    // Page number shown in the header, e.g. "101.02".
    function ttPageLabel(page) {
        const sub = String((tvWeekIndex ? tvWeekIndex() : 0) % 99 + 1).padStart(2, "0");
        return String(page) + "." + sub;
    }

    // Mosaic block font for the masthead: 3 cells wide, 5 cells tall per
    // letter, drawn as solid teletext blocks rather than glyphs.
    const TT_BLOCK_FONT = {
        H: ["101", "101", "111", "101", "101"],
        E: ["111", "100", "111", "100", "111"],
        X: ["101", "101", "010", "101", "101"],
        A: ["111", "101", "111", "101", "101"],
        V: ["101", "101", "101", "101", "010"],
        I: ["111", "010", "010", "010", "111"],
        D: ["110", "101", "101", "101", "110"],
        O: ["111", "101", "101", "101", "111"],
        " ": ["000", "000", "000", "000", "000"]
    };

    // Each glyph "pixel" is sx cells wide (cells are narrow now) and one row tall.
    function ttBlockWidth(text, sx) { return String(text).length * 4 * sx - sx; }
    function ttBlockText(bitmap, col, row, text, color, sx) {
        sx = sx || 1;
        let x = col;
        for (const chr of String(text).toUpperCase()) {
            const glyph = TT_BLOCK_FONT[chr];
            if (glyph) {
                glyph.forEach((line, r) => {
                    for (let c = 0; c < line.length; c++) {
                        if (line[c] === "1") ttBox(bitmap, x + c * sx, row + r, sx, 1, color);
                    }
                });
            }
            x += 4 * sx; // 3 glyph columns + 1 column of spacing
        }
    }

    // Shared page furniture: header line, blocky HEXAVIDEO masthead, the page
    // index and the yellow service bar at the foot of the page.
    function ttDrawPage(bitmap, page, indexLines, footer) {
        bitmap.fillRect(0, 0, bitmap.width, bitmap.height, TT.black);

        // Row 0: page number.
        ttText(bitmap, 0, 0, ttPageLabel(page), TT.green);

        // Row 1: blue rule.
        ttBox(bitmap, 0, 1, ttCols(), 1, TT.navy);

        // Rows 2-6: HEXAVIDEO in solid yellow blocks, scaled to span the page.
        const sx = Math.max(1, Math.floor((ttCols() - 4) / (4 * 9)));
        ttBlockText(bitmap, Math.max(0, Math.floor((ttCols() - ttBlockWidth("HEXAVIDEO", sx)) / 2)), 2, "HEXAVIDEO", TT.yellow, sx);

        // Row 8: the page index, teletext-green, one compact line.
        const idx = (indexLines || []).filter(Boolean).join("   ");
        if (idx) ttText(bitmap, 0, 8, ttClip(idx, ttCols()), TT.green);

        // Foot of page: yellow service bar + cyan strapline.
        const bar = ttPad(" " + (footer || "OK TUNE IN   ESC EXIT"), ttCols());
        ttText(bitmap, 0, 22, bar, TT.black, { bg: TT.yellow });
        const cnr = "HEXAVIDEO - HYPERNET PUBLIC SERVICE";
        ttText(bitmap, Math.floor((ttCols() - cnr.length) / 2), 23, cnr, TT.cyan);
    }

    // Full-screen teletext page sprite used as scene background.
    function ttCreatePageSprite(drawFn) {
        const bmp = new Bitmap(ttWidth(), ttHeight());
        drawFn(bmp);
        const sprite = new Sprite(bmp);
        sprite.x = ttOriginX();
        sprite.y = ttOriginY();
        return sprite;
    }

    // Channel list takes a bit over half the page width; the detail panel gets
    // the rest, with one blank column between them.
    function tvListCols() { return Math.max(12, Math.floor(ttCols() * 0.55)); }

    // Base for the interactive lists: no frame, no cursor sprite, one grid
    // cell per row; selection is rendered as a teletext colour inversion.
    class Window_TTList extends Window_Selectable {
        initialize(rect) {
            super.initialize(rect);
            this.setBackgroundType(2);
        }
        updatePadding() { this.padding = 0; }
        itemPadding() { return 0; }
        itemHeight() { return ttCellH(); }
        colSpacing() { return 0; }
        rowSpacing() { return 0; }
        drawBackgroundRect() { /* teletext pages have no item plates */ }
        refreshCursor() { this.setCursorRect(0, 0, 0, 0); }
        select(index) {
            const changed = this.index() !== index;
            super.select(index);
            if (changed && this.contents) this.refresh();
        }
        gridCols() { return Math.floor(this.contentsWidth() / ttCellW()); }
        // Own row geometry: the teletext grid starts hard against the left edge
        // of the window, with no item padding or cursor gutter of any kind.
        rowRect(index) {
            const h = this.itemHeight();
            return new Rectangle(0, index * h - this.scrollBaseY(), this.gridCols() * ttCellW(), h);
        }
        // col is item-local (0 = first cell of the row)
        put(rect, col, text, color, bg) {
            ttDrawCells(this.contents, rect.x + col * ttCellW(), rect.y, text, color, bg ? { bg } : null);
        }
    }

    class Window_TVChannels extends Window_TTList {
        constructor(rect) { super(rect); this.refresh(); this.select(0); }
        maxItems() { return loadTVDB().channels.length; }
        channels() { return loadTVDB().channels; }
        currentChannel() { return this.channels()[this.index()] || null; }
        // Teletext channel numbers run 101, 102, ... like Televideo pages.
        pageNumber(index) { return String(101 + index); }
        drawItem(index) {
            const ch = this.channels()[index];
            if (!ch) return;
            const rect = this.rowRect(index);
            const cols = this.gridCols();
            const selected = index === this.index();
            const live = !!tvOnAir(ch.id);
            // Teletext cycles its row colours; keep it stable per channel.
            const palette = [TT.yellow, TT.cyan, TT.green, TT.white, TT.magenta];
            const rowColor = selected ? TT.black : palette[index % palette.length];
            const bg = selected ? TT.white : null;
            if (bg) ttDrawCells(this.contents, rect.x, rect.y, " ".repeat(cols), rowColor, { bg });
            this.put(rect, 0, this.pageNumber(index), selected ? TT.black : TT.red);
            this.put(rect, 3, selected ? "■" : (live ? "▶" : " "), selected ? TT.black : TT.red);
            const name = tvChannelName(ch).toUpperCase();
            this.put(rect, 5, ttClip(name, Math.max(1, cols - 5)), rowColor);
        }
    }

    // Right-hand teletext panel: white page block with black body text,
    // the way Televideo prints its detail boxes.
    class Window_TVInfo extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this.setBackgroundType(2);
            this._channel = null;
        }
        updatePadding() { this.padding = 0; }
        gridCols() { return Math.floor(this.contentsWidth() / ttCellW()); }
        gridRows() { return Math.floor(this.contentsHeight() / ttCellH()); }
        setChannel(ch) { if (this._channel !== ch) { this._channel = ch; this.refresh(); } }
        line(row, col, text, color, bg) {
            ttDrawCells(this.contents, col * ttCellW(), row * ttCellH(), text, color, bg ? { bg } : null);
        }
        refresh() {
            this.contents.clear();
            const ch = this._channel;
            const cols = this.gridCols(), rows = this.gridRows();
            this.contents.fillRect(0, 0, cols * ttCellW(), rows * ttCellH(), TT.white);
            if (!ch) return;
            const inner = cols - 2;
            let y = 0;
            this.line(y++, 1, ttClip(tvChannelName(ch).toUpperCase(), inner), TT.red);
            y++;
            this.line(y++, 1, "NOW PLAYING", TT.white, TT.blue);
            const onair = tvOnAir(ch.id);
            const prog = onair ? tvProgramById(ch, onair.programId) : (ch.programs || [])[0];
            if (prog) {
                this.line(y++, 1, ttClip(tvProgramTitle(prog), inner), TT.black);
                this.line(y++, 1, ttClip("[" + (prog.tone || ch.tone || "") + "]", inner), TT.blue);
            } else {
                this.line(y++, 1, T('TvFrame.offAir'), TT.dim);
            }
            y++;
            this.line(y++, 1, "UP NEXT", TT.white, TT.blue);
            const next = tvNextUp(ch.id);
            const nprog = next ? tvProgramById(ch, next.programId) : null;
            if (nprog && next) {
                const days = tvDayNames();
                this.line(y++, 1, `${days[next.day]} ${String(next.hour).padStart(2, "0")}:00`, TT.red);
                this.line(y++, 1, ttClip(tvProgramTitle(nprog), inner), TT.black);
            } else {
                this.line(y++, 1, "---", TT.dim);
            }
            y++;
            this.line(y++, 1, "CAST", TT.white, TT.blue);
            // The cast belongs to the programme, not the channel: a narrated
            // show lists the narrator and nobody else.
            const members = tvCastMembers(prog);
            if (!members.length) {
                this.line(y++, 1, ttClip("· " + TV_NARRATOR(), inner), TT.black);
            }
            members.forEach(m => {
                if (y >= rows) return;
                this.line(y++, 1, ttClip("· " + m.characterName, inner), TT.black);
            });
        }
    }

    class Scene_TVGuide extends Scene_MenuBase {
        create() {
            super.create();
            this.createWindows();
        }
        createBackground() {
            Scene_MenuBase.prototype.createBackground.call(this);
            if (this._backgroundSprite) this._backgroundSprite.opacity = 0;
            this._blackout = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            this._blackout.bitmap.fillRect(0, 0, Graphics.width, Graphics.height, TT.black);
            this.addChild(this._blackout);
            this._page = ttCreatePageSprite(bmp => {
                ttDrawPage(bmp, 101, [
                    "501 SCHEDULE",
                    "567 ON AIR",
                    "760 FEED"
                ], "OK TUNE IN   ESC EXIT");
                ttText(bmp, 0, 9, ttPad(" CHANNELS", tvListCols()), TT.black, { bg: TT.cyan });
                ttText(bmp, tvListCols() + 1, 9, ttPad(" DETAILS", ttCols() - tvListCols() - 1), TT.black, { bg: TT.green });
            });
            this.addChild(this._page);
        }
        createWindows() {
            const cw = ttCellW(), chh = ttCellH();
            const top = ttWinY(10);
            const height = 11 * chh;
            const lrect = new Rectangle(ttWinX(0), top, tvListCols() * cw, height);
            this._channelWindow = new Window_TVChannels(lrect);
            this._channelWindow.setHandler("ok", this.onChannelOk.bind(this));
            this._channelWindow.setHandler("cancel", this.popScene.bind(this));
            this.addWindow(this._channelWindow);

            const rrect = new Rectangle(ttWinX(tvListCols() + 1), top, (ttCols() - tvListCols() - 1) * cw, height);
            this._infoWindow = new Window_TVInfo(rrect);
            this.addWindow(this._infoWindow);

            this.onChannelSelect();
            this._channelWindow.activate();
        }
        onChannelSelect() {
            if (this._infoWindow && this._channelWindow) {
                this._infoWindow.setChannel(this._channelWindow.currentChannel());
            }
        }
        onChannelOk() {
            const ch = this._channelWindow.currentChannel();
            if (!ch) { this._channelWindow.activate(); return; }
            tvRequestTune(ch.id, null);
            this.popScene();
        }
    }

    // Hook select refresh (Window_Selectable doesn't emit a "select" handler).
    const _Win_TVChannels_select = Window_TVChannels.prototype.select;
    Window_TVChannels.prototype.select = function (index) {
        _Win_TVChannels_select.call(this, index);
        const scene = SceneManager._scene;
        if (scene && scene instanceof Scene_TVGuide && scene.onChannelSelect) scene.onChannelSelect();
    };

    class Window_TVScheduleList extends Window_TTList {
        constructor(rect) { super(rect); this._rows = []; this.buildRows(); this.refresh(); }
        buildRows() {
            const sched = tvGetSchedule();
            const days = tvDayNames();
            const rows = [];
            loadTVDB().channels.forEach((ch, ci) => {
                rows.push({ type: "header", ch, page: String(101 + ci) });
                const list = sched[ch.id] || [];
                if (!list.length) rows.push({ type: "empty" });
                list.forEach(e => {
                    const prog = tvProgramById(ch, e.programId);
                    rows.push({ type: "slot", ch, e, prog, day: days[e.day] });
                });
                rows.push({ type: "gap" });
            });
            this._rows = rows;
        }
        maxItems() { return this._rows.length; }
        isCurrentItemEnabled() { const r = this._rows[this.index()]; return !!(r && r.type === "slot"); }
        selectFirstSlot() {
            const i = this._rows.findIndex(r => r.type === "slot");
            this.select(i >= 0 ? i : 0);
        }
        currentSlot() { const r = this._rows[this.index()]; return (r && r.type === "slot") ? r : null; }
        drawItem(index) {
            const r = this._rows[index];
            if (!r) return;
            const rect = this.rowRect(index);
            const cols = this.gridCols();
            const selected = index === this.index();
            if (r.type === "header") {
                this.put(rect, 0, ttPad(" " + r.page + "  " + tvChannelName(r.ch).toUpperCase(), cols), TT.black, TT.cyan);
                return;
            }
            if (r.type === "gap") return;
            if (r.type === "empty") {
                this.put(rect, 2, T('TvFrame.offAir'), TT.dim);
                return;
            }
            const now = (tvOnAir(r.ch.id) || {});
            const isLive = now.programId === r.e.programId && now.day === r.e.day && now.hour === r.e.hour;
            if (selected) this.put(rect, 0, " ".repeat(cols), TT.black, TT.white);
            const fg = selected ? TT.black : TT.white;
            this.put(rect, 1, selected ? "■" : " ", selected ? TT.black : TT.white);
            this.put(rect, 3, `${r.day} ${String(r.e.hour).padStart(2, "0")}:00`, selected ? TT.black : TT.yellow);
            let tx = 12;
            if (isLive) {
                this.put(rect, tx, "LIVE", selected ? TT.black : TT.red);
                tx += 5;
            }
            const tone = r.prog ? (r.prog.tone || r.ch.tone || "") : "";
            const toneText = tone ? "[" + tone + "]" : "";
            const titleCols = Math.max(1, cols - tx - toneText.length - 2);
            const title = r.prog ? tvProgramTitle(r.prog) : r.e.programId;
            this.put(rect, tx, ttClip(title, titleCols), fg);
            if (toneText) {
                this.put(rect, cols - toneText.length - 1, toneText, selected ? TT.black : TT.green);
            }
        }
    }

    class Scene_TVSchedule extends Scene_MenuBase {
        create() {
            super.create();
            const cw = ttCellW(), chh = ttCellH();
            const rect = new Rectangle(ttWinX(0), ttWinY(10), ttCols() * cw, 11 * chh);
            this._listWindow = new Window_TVScheduleList(rect);
            this._listWindow.setHandler("ok", this.onOk.bind(this));
            this._listWindow.setHandler("cancel", this.popScene.bind(this));
            this.addWindow(this._listWindow);
            this._listWindow.selectFirstSlot();
            this._listWindow.activate();
        }
        createBackground() {
            Scene_MenuBase.prototype.createBackground.call(this);
            if (this._backgroundSprite) this._backgroundSprite.opacity = 0;
            const black = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            black.bitmap.fillRect(0, 0, Graphics.width, Graphics.height, TT.black);
            this.addChild(black);
            const wk = tvWeekIndex() + 1;
            this._page = ttCreatePageSprite(bmp => {
                ttDrawPage(bmp, 501, [
                    "101 CHANNELS",
                    "WEEK " + wk,
                    "760 FEED"
                ], "OK TUNE IN   ESC EXIT");
                const label = " " + T('TvFrame.weeklySchedule', { week: wk });
                ttText(bmp, 0, 9, ttPad(label, ttCols()), TT.black, { bg: TT.yellow });
            });
            this.addChild(this._page);
        }
        onOk() {
            const slot = this._listWindow.currentSlot();
            if (slot) {
                tvRequestTune(slot.ch.id, slot.e.programId);
                this.popScene();
            } else {
                this._listWindow.activate();
            }
        }
    }

    // Expose for other plugins / debugging.
    window.TVStudio.loadDB = loadTVDB;
    window.TVStudio.tuneIn = tvTuneIn;
    window.TVStudio.getSchedule = tvGetSchedule;
    window.TVStudio.openGuide = function () { SceneManager.push(Scene_TVGuide); };
    window.TVStudio.openSchedule = function () { SceneManager.push(Scene_TVSchedule); };
    // Build a broadcast script ({ title, lines:[{speaker,text}] }) without
    // teleporting, so other UIs (e.g. the HypernetOS TV Guide) can play the
    // dialogue inline. Returns null if the channel/program cannot be resolved.
    window.TVStudio.buildScript = function (channelId, programId) {
        const resolved = tvResolveProgram(channelId, programId);
        if (!resolved) return null;
        try { return tvBuildScript(resolved.channel, resolved.program); }
        catch (e) { console.error("TV buildScript error", e); return null; }
    };

    // ============================================================
    // === PLUGIN COMMANDS (v3.0)                               ===
    // ============================================================

    PluginManager.registerCommand(pluginName, "OpenTVGuide", () => {
        SceneManager.push(Scene_TVGuide);
    });

    PluginManager.registerCommand(pluginName, "ShowTVSchedule", () => {
        SceneManager.push(Scene_TVSchedule);
    });

    PluginManager.registerCommand(pluginName, "TuneChannel", args => {
        const channelId = String(args.channelId || "").trim();
        const programId = String(args.programId || "").trim() || null;
        const mode = String(args.mode || "ask").trim().toLowerCase();
        if (!channelId) return;
        tvTuneIn(channelId, programId, mode);
    });

})();
