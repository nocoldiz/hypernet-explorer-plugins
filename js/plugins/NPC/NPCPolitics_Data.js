/*:
 * @target MZ
 * @plugindesc NPC Politics: government archetypes, party rosters and name banks
 * @author Omni-Lex
 * @base NPCPolitics
 * @orderAfter NPCPolitics
 * @help
 * ============================================================================
 * NPCPolitics_Data, part of the NPCPolitics family
 * ============================================================================
 * Owns the data tables: GOVERNMENT ARCHETYPES, NATIONAL PARTY ROSTERS and
 * the NAME BANKS of politicians per flavour. Loads last: it binds the late
 * names the entry reads once it is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCPolitics._internal and publishes its own there. Load it right after
 * NPCPolitics.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    getCountries, getProfile, nameHash, norm, PolRng, worldSeed,
  } = window.NPCPolitics._internal;

  // ==========================================================================
  // GOVERNMENT ARCHETYPES, one per known hyperpower, plus a fallback
  // ==========================================================================
  // system:    election idiom (see ElectionEngines)
  // baseline:  the power's cultural center of ideological gravity
  // partyKind: what "parties" are called in reports
  // rigging:   how much official results favor the incumbent (0..1)
  // coupSusceptibility / scandalSensitivity: event multipliers

  // i18n-ignore-start: hyperpower keys are joined against Countries.json and
  // the history simulation; govType / system / partyKind / nameFlavor are ids
  // the code branches on; the party word banks compose party names that are
  // written into the saved world state, so they are proper nouns like any
  // other. Every one of these that reaches the screen is resolved through
  // powerLabel() below, from js/i18n/<lang>/plugins/Politics.json.


  const ARCHETYPES = {
    "Holy Vatican Empire": {
      govType: "theocracy", system: "conclave", headTitle: "Supreme Pontifex",
      legislature: "Holy Curia", partyKind: "order", seats: 120, termDays: 2920,
      electorCount: 21, electorTitle: "Cardinal",
      baseline: { econ: 10, auth: 55, trad: 85, mil: 20, myst: 90 },
      rigging: 0.2, coupSusceptibility: 0.4, scandalSensitivity: 1.4,
      nameFlavor: "clerical",
    },
    "USSR": {
      govType: "single-party state", system: "plenum", headTitle: "General Secretary",
      legislature: "Supreme Soviet", partyKind: "faction", seats: 1500, termDays: 1825,
      electorCount: 12, electorTitle: "Politburo Member",
      baseline: { econ: -85, auth: 70, trad: -20, mil: 55, myst: -80 },
      rigging: 0.85, coupSusceptibility: 1.2, scandalSensitivity: 0.5,
      nameFlavor: "soviet",
    },
    "Britannia": {
      govType: "parliamentary monarchy", system: "parliamentary", headTitle: "Prime Minister",
      legislature: "Parliament", partyKind: "party", seats: 650, termDays: 1460,
      baseline: { econ: 35, auth: 10, trad: 40, mil: 25, myst: -30 },
      rigging: 0, coupSusceptibility: 0.2, scandalSensitivity: 1.2,
      nameFlavor: "british",
    },
    "Archive Foundation": {
      govType: "technocracy", system: "examination", headTitle: "First Archivist",
      legislature: "Index Council", partyKind: "school", seats: 88, termDays: 2190,
      baseline: { econ: 0, auth: 35, trad: -40, mil: -20, myst: 25 },
      rigging: 0.1, coupSusceptibility: 0.3, scandalSensitivity: 1.0,
      nameFlavor: "archivist",
    },
    "Ottoman Empire": {
      govType: "sultanate", system: "succession", headTitle: "Sultan",
      legislature: "Divan", partyKind: "court faction", seats: 40, termDays: 3650,
      baseline: { econ: 20, auth: 65, trad: 70, mil: 50, myst: 45 },
      rigging: 0.6, coupSusceptibility: 0.9, scandalSensitivity: 0.7,
      nameFlavor: "ottoman",
    },
    "The Gods": {
      govType: "divine pantheon", system: "tournament", headTitle: "Prime Deity",
      legislature: "Celestial Court", partyKind: "house", seats: 12, termDays: 4380,
      baseline: { econ: 0, auth: 40, trad: 60, mil: 40, myst: 100 },
      rigging: 0, coupSusceptibility: 0.6, scandalSensitivity: 0.9,
      nameFlavor: "divine",
    },
    "San Marino Republic": {
      govType: "serene republic", system: "parliamentary", headTitle: "Captain Regent",
      legislature: "Grand Council", partyKind: "party", seats: 60, termDays: 182, // two Captains Regent, six-month terms
      baseline: { econ: 25, auth: -25, trad: 30, mil: -40, myst: 0 },
      rigging: 0, coupSusceptibility: 0.1, scandalSensitivity: 1.1,
      nameFlavor: "sammarinese",
    },
    "Hypercapitalist Collective": {
      govType: "corporatocracy", system: "shareholder", headTitle: "Chief Executive Sovereign",
      legislature: "The Board", partyKind: "bloc", seats: 100, termDays: 365, // annual general meeting
      baseline: { econ: 95, auth: 30, trad: -30, mil: 10, myst: -60 },
      rigging: 0.15, coupSusceptibility: 0.5, scandalSensitivity: 0.8,
      nameFlavor: "corporate",
    },
    "The Tourists": {
      govType: "caste hierarchy", system: "conclave", headTitle: "Tour Director",
      legislature: "The Itinerary", partyKind: "caste", seats: 33, termDays: 730,
      electorCount: 15, electorTitle: "Overseer",
      baseline: { econ: 20, auth: 45, trad: -60, mil: 30, myst: 40 },
      rigging: 0.35, coupSusceptibility: 0.3, scandalSensitivity: 0.6,
      nameFlavor: "zeta",
    },
    "The Dargos": {
      govType: "practical joke", system: "moot", headTitle: "First Dargos",
      legislature: "The Bit", partyKind: "routine", seats: 9, termDays: 400,
      baseline: { econ: 0, auth: -20, trad: -40, mil: 10, myst: 70 },
      rigging: 0.5, coupSusceptibility: 1.1, scandalSensitivity: 0.1,
      nameFlavor: "dargos",
    },
    "Democratic People's Republic of Korea": {
      // Two parties, one of which has never won anything, and a chair that has
      // stayed in one family for three generations.
      govType: "hereditary republic", system: "succession", headTitle: "Eternal Chairman",
      legislature: "Supreme People's Assembly", partyKind: "party", seats: 687, termDays: 1825,
      baseline: { econ: -95, auth: 95, trad: 45, mil: 95, myst: -40 },
      rigging: 0.99, coupSusceptibility: 0.15, scandalSensitivity: 0.05,
      nameFlavor: "korean",
    },
    "Dharma Directorate": {
      // The Middle Kingdom after it put communism down: rites, sutras and an
      // examination hall, with the mandate reviewed rather than voted on.
      govType: "harmonious empire", system: "examination", headTitle: "Chancellor of Rites",
      legislature: "Hall of Ten Thousand Voices", partyKind: "school", seats: 2980, termDays: 3650,
      electorCount: 25, electorTitle: "Preceptor",
      baseline: { econ: 30, auth: 70, trad: 90, mil: 55, myst: 60 },
      rigging: 0.55, coupSusceptibility: 0.35, scandalSensitivity: 0.6,
      nameFlavor: "chinese",
    },
    "Illuminated Khanate": {
      // A khanate run out of a monastery: the Khan is recognised, not elected,
      // and the abbots do the recognising.
      govType: "illuminated khanate", system: "conclave", headTitle: "Illuminated Khan",
      legislature: "Ikh Khuraldai", partyKind: "banner", seats: 76, termDays: 4380,
      electorCount: 18, electorTitle: "Abbot",
      baseline: { econ: -20, auth: 55, trad: 90, mil: 50, myst: 95 },
      rigging: 0.4, coupSusceptibility: 0.6, scandalSensitivity: 0.5,
      nameFlavor: "mongol",
    },
    "Solomonic Republic": {
      // A republic bound to the seventy-two Goetic spirits Solomon sealed;
      // its restored Sanhedrin argues Goetic precedent in every session it
      // has ever held.
      govType: "solomonic republic", system: "parliamentary", headTitle: "Nasi of the Republic",
      legislature: "Restored Sanhedrin", partyKind: "council", seats: 71, termDays: 1460,
      baseline: { econ: 20, auth: 40, trad: 75, mil: 65, myst: 70 },
      rigging: 0.1, coupSusceptibility: 0.25, scandalSensitivity: 1.4,
      nameFlavor: "goetic",
    },
    "Petro Kingdom of Arabia": {
      // Everything it is, it is because of what is under it. The succession is
      // a boardroom and the boardroom is a court.
      govType: "petro monarchy", system: "succession", headTitle: "Oil-Emir",
      legislature: "Concession Majlis", partyKind: "concession", seats: 150, termDays: 3650,
      baseline: { econ: 75, auth: 85, trad: 80, mil: 40, myst: 45 },
      rigging: 0.8, coupSusceptibility: 0.5, scandalSensitivity: 0.3,
      nameFlavor: "arab",
    },
    "Imperial State of Persia": {
      // The revolution never came. The Peacock Throne appoints a government and
      // the government answers for it, which is a different job entirely.
      govType: "imperial state", system: "succession", headTitle: "Prime Minister",
      legislature: "National Consultative Assembly", partyKind: "party", seats: 268, termDays: 1460,
      baseline: { econ: 35, auth: 70, trad: 65, mil: 55, myst: 40 },
      rigging: 0.65, coupSusceptibility: 0.6, scandalSensitivity: 0.8,
      nameFlavor: "persian",
    },
    "Sanatana Rashtra": {
      // The eternal order, administered: a parliament that sits under an
      // acharya and votes on what tradition turns out to have required.
      govType: "dharmic republic", system: "parliamentary", headTitle: "Prime Minister",
      legislature: "Rashtra Sabha", partyKind: "sabha", seats: 545, termDays: 1825,
      baseline: { econ: 15, auth: 55, trad: 90, mil: 55, myst: 75 },
      rigging: 0.3, coupSusceptibility: 0.35, scandalSensitivity: 1.2,
      nameFlavor: "indic",
    },
    "Long Chile": {
      // The thinnest country in the world, and the one most convinced it ought
      // to be longer. Every ballot is about the next valley.
      govType: "expansionist republic", system: "parliamentary", headTitle: "President-Marshal",
      legislature: "Congress of the Long South", partyKind: "movement", seats: 155, termDays: 1460,
      baseline: { econ: 10, auth: 55, trad: 50, mil: 85, myst: 10 },
      rigging: 0.35, coupSusceptibility: 0.9, scandalSensitivity: 0.8,
      nameFlavor: "andean",
    },
    "Kukulkan Ascendancy": {
      // A restoration, not a republic: the god-emperor reigns until the count
      // says otherwise, and the Council of Ajawob argues about the calendar.
      govType: "divine empire", system: "succession", headTitle: "God-Emperor",
      legislature: "Council of Ajawob", partyKind: "cult", seats: 52, termDays: 7300, // one k'atun
      baseline: { econ: -10, auth: 80, trad: 95, mil: 60, myst: 95 },
      rigging: 0.75, coupSusceptibility: 0.7, scandalSensitivity: 0.4,
      nameFlavor: "mesoamerican",
    },
    "Goblin Horde": {
      govType: "warband confederacy", system: "moot", headTitle: "Big Boss",
      legislature: "Da Moot", partyKind: "clan", seats: 30, termDays: 300, // until someone bigger shows up
      baseline: { econ: -30, auth: 50, trad: 20, mil: 90, myst: 35 },
      rigging: 0, coupSusceptibility: 1.6, scandalSensitivity: 0.2,
      nameFlavor: "goblin",
    },
  };

  // Unknown hyperpowers (modded Countries.json) get a seeded generic republic.
  const FALLBACK_ARCHETYPE = {
    govType: "republic", system: "parliamentary", headTitle: "President",
    legislature: "Assembly", partyKind: "party", seats: 200, termDays: 1460,
    baseline: { econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 },
    rigging: 0, coupSusceptibility: 0.5, scandalSensitivity: 1.0,
    nameFlavor: "generic",
  };

  // ==========================================================================
  // NATIONAL PARTY ROSTERS
  // ==========================================================================
  //
  // EVERY party in the world lives in js/db/WorldGen/Parties.json, filed under
  // the nation it stands in - there is no such thing as a hyperpower's own
  // party. A power's bench is the parties of the nations it holds, its home
  // nation's among them and weighted (see syncPowerParties, HOME_BENCH_WEIGHT);
  // a nation runs its own assembly out of exactly the same list.
  //
  // Nobody votes outside their own nation: an NPC's ballot holds the parties of
  // the country their hometown stands in (Destinations.json `country`) and
  // nothing else. A nation with no roster at all leaves its citizens with no
  // party, which is a real answer - see nearestPartyId and collectNpcBallots.
  const NATIONAL_PARTIES = {};
  function addNationalParty(country, party) {
    if (!country || !party || !party.name) return;
    const list = NATIONAL_PARTIES[country] || (NATIONAL_PARTIES[country] = []);
    if (!list.some(p => p.name === party.name)) list.push(party);
  }

  // Parties.json is loaded with the rest of js/db (DataService), which happens
  // after this plugin is evaluated, so the file is folded in on first use.
  let _nationalPartiesLoaded = false;
  function nationalParties(country) {
    if (!_nationalPartiesLoaded) {
      const book = window.WorldGen?.Parties;
      if (book) {
        for (const [nation, list] of Object.entries(book)) {
          if (!Array.isArray(list)) continue;   // "_comment"
          for (const party of list) addNationalParty(nation, Object.assign({ country: nation }, party));
        }
        _nationalPartiesLoaded = true;
      }
    }
    // A floor world of the Omega Tower is not in Parties.json and never will
    // be: it was rolled from the world seed, and so was its bench. The names
    // come back in the world's own naming register, so a goblin world's
    // parties read as goblin clans and a machine world's as directorates.
    const towerWorld = towerWorldByCountry(country);
    if (towerWorld) return towerPartyEntries(towerWorld);
    return (country && NATIONAL_PARTIES[country]) || [];
  }

  // A floor world's bench, in the shape nationalParties answers in. The creed
  // each party carries is drawn from the same book Earth's parties use, so
  // the platform math, the ballots and the wiki all work unchanged; only the
  // alien creeds are held back from a world whose people are not.
  // Keyed by the WORLD SEED as well as the floor: "tower:-5" names a different
  // world in every save, and a cache that only knew the floor would hand the
  // second world the first one's bench.
  const _towerPartyCache = {};
  function towerPartyEntries(world) {
    const key = worldSeed() + "|" + world.id + "|" + world.name;   // i18n-ignore: cache key
    if (_towerPartyCache[key]) return _towerPartyCache[key];
    const creeds = (window.NPCShared.ideologyList() || [])
      .filter((i) => i && !!i.alien === !!world.alien);
    const rng = new PolRng(worldSeed() ^ nameHash("towerparties:" + world.id));  // i18n-ignore: seed string
    const entries = world.parties.map((party) => ({
      name: party.name,
      country: world.name,
      ideologyId: creeds.length ? creeds[rng.int(0, creeds.length - 1)].id : null,
      founded: null,
    }));
    _towerPartyCache[key] = entries;
    return entries;
  }


  // The nation an NPC votes in: the country their HOMETOWN stands in, whatever
  // town they happen to be standing in today (Destinations.json `country`).
  function homeCountryOf(npcName, groupName) {
    const home = getProfile(npcName)?._homeGroupName || groupName || null;
    if (!home) return null;
    const declared = window.WorkSystem?.destinationCountry?.(home)?.country;
    if (declared) return declared;
    const countries = getCountries();
    const match = countries.find(c => norm(c.country) === norm(home));
    return match ? match.country : null;
  }

  // Some Countries.json entries spell the same power differently.
  const FACTION_ALIASES = { "Soviet Union": "USSR" };

  // Who the world opens with, whatever the century did. The history simulation
  // seals these four offices on its last pass (HistorySimulator.sealFinalOffices)
  // and the live politics has to agree with it: these people won the elections
  // held before the first day, and they are not going anywhere.
  // i18n-ignore-start  leader names, matched against Leaders.json
  const SEATED_ON_DAY_ONE = {
    "Britannia": "Margaret Thatcher",
    "Free States of Midwest": "Bill Clinton",
    "Eastern Seaboard": "George W. Bush",
  };
  // i18n-ignore-end

  // Powers that hold no ground on this planet. Every other hyperpower is
  // discovered from Countries.json, which is a map of Earth and can therefore
  // never name one of these: they are registered here instead, with the worlds
  // they hold standing in for member countries, so a government, an electorate,
  // a run of elections and a wiki article are built for them exactly as for
  // Britannia. The names are the keys of js/db/WorldGen/Hyperpowers.json.
  const OFFWORLD_POWERS = {
    "The Tourists": ["Zeta Reticuli A", "Zeta Reticuli B"],
    "The Dargos":   ["Titania"],
  };
  // i18n-ignore-end

  // The Omega Tower's floors are not cellars: each one opens onto its own
  // world, and each of those worlds holds its own hyperpower, with its own
  // bench and its own elections (DungeonFloorSystem.js, window.TowerWorlds).
  // They are registered exactly as the offworld powers above are - a power
  // whose single member country is the world itself - so everything built
  // for Britannia is built for them without a line of it knowing about the
  // tower. They are NOT in OFFWORLD_POWERS, because that table is authored
  // and these are rolled from the world seed.
  function towerWorlds() {
    const TW = window.TowerWorlds;
    if (!TW || typeof TW.all !== "function") return [];
    try { return TW.all() || []; } catch (e) { return []; }
  }

  function towerWorldByPower(powerName) {
    if (!powerName) return null;
    const list = towerWorlds();
    for (const w of list) if (w.powerName === powerName) return w;
    return null;
  }

  function towerWorldByCountry(country) {
    if (!country) return null;
    const list = towerWorlds();
    for (const w of list) if (w.name === country) return w;
    return null;
  }

  function isTowerPower(powerName) {
    return !!towerWorldByPower(powerName);
  }

  // One government per KIND of world, not per world: a goblin world is a
  // warband wherever in the shaft it is, and there are only so many ways a
  // people organises itself. A world whose kind is not here falls through
  // to FALLBACK_ARCHETYPE like any unknown power, so nothing breaks.
  const TOWER_GOV_ARCHETYPES = {
    // i18n-ignore-start: institution names are proper nouns, stored on the
    // record and never translated, exactly as the Earth archetypes above.
    republic: {
      govType: "republic", system: "parliamentary", headTitle: "First Speaker",
      legislature: "General Assembly", partyKind: "party", seats: 180, termDays: 1460,
      baseline: { econ: 0, auth: 0, trad: 0, mil: 0, myst: 0 },
      rigging: 0.05, coupSusceptibility: 0.4, scandalSensitivity: 1.1,
      nameFlavor: "generic",
    },
    warband: {
      govType: "warband", system: "tournament", headTitle: "Warchief",
      legislature: "Moot", partyKind: "clan", seats: 40, termDays: 730,
      baseline: { econ: -20, auth: 45, trad: 30, mil: 80, myst: 10 },
      rigging: 0.5, coupSusceptibility: 1.5, scandalSensitivity: 0.3,
      nameFlavor: "goblin",
    },
    tyranny: {
      govType: "tyranny", system: "succession", headTitle: "Sovereign",
      legislature: "Court", partyKind: "court faction", seats: 24, termDays: 3650,
      baseline: { econ: -30, auth: 90, trad: 50, mil: 70, myst: 40 },
      rigging: 0.9, coupSusceptibility: 1.3, scandalSensitivity: 0.2,
      nameFlavor: "ottoman",
    },
    conclave: {
      govType: "conclave", system: "conclave", headTitle: "First Voice",
      legislature: "Convocation", partyKind: "circle", seats: 90, termDays: 2190,
      baseline: { econ: 5, auth: 30, trad: 20, mil: -20, myst: 85 },
      rigging: 0.25, coupSusceptibility: 0.5, scandalSensitivity: 0.9,
      nameFlavor: "divine",
    },
    directorate: {
      govType: "directorate", system: "shareholder", headTitle: "Director",
      legislature: "Board", partyKind: "bloc", seats: 64, termDays: 1825,
      baseline: { econ: 60, auth: 50, trad: -40, mil: 10, myst: -70 },
      rigging: 0.4, coupSusceptibility: 0.3, scandalSensitivity: 0.6,
      nameFlavor: "archivist",
    },
    // i18n-ignore-end
  };

  // A world of ferals or of the risen holds no government at all: nobody on
  // it can hold an office, so there is nothing to build (window.NPCCreature
  // owns that boundary and this is the political end of it).
  function towerArchetypeFor(powerName) {
    const world = towerWorldByPower(powerName);
    if (!world) return null;
    if (world.govArchetypeKey === "none") return null;
    return TOWER_GOV_ARCHETYPES[world.govArchetypeKey] || null;
  }

  // The worlds that seat a government. A world of beasts is skipped whole.
  // A world of beasts seats nobody, and a colony of Earth people seats nothing
  // NEW: they climbed in from here and kept Earth's nations and Earth's
  // hyperpowers, which is the whole of what makes a colony a colony.
  function governedTowerWorlds() {
    return towerWorlds().filter((w) => w.govArchetypeKey !== "none" && !w.earthborn);
  }


  // ==========================================================================
  // NAME BANKS, politicians per flavor
  // ==========================================================================

  // i18n-ignore-start: politician names are composed once and stored on the
  // saved record, so they are proper nouns and never translated, exactly like
  // the NPC residents rosters.
  const NAME_BANKS = {
    clerical: {
      title: ["Cardinal", "Monsignor", "Abbot", "Prioress", "Vicar"],
      first: ["Anselm", "Benedicta", "Clemens", "Dominika", "Egidio", "Fulgenzio", "Gregoria", "Hyacinth", "Innocenzo", "Lucilla", "Pius", "Severina"],
      last:  ["di Castello", "Vetrari", "Santangelo", "Beneventi", "del Rosario", "Calvino", "Aldobrandi", "Fioravanti"],
    },
    soviet: {
      title: ["Comrade", "Commissar", "Marshal", "Director"],
      first: ["Anatoli", "Bohdana", "Dmitri", "Galina", "Iosif", "Katarina", "Lev", "Mira", "Nikolai", "Oksana", "Pavel", "Svetlana", "Vasili", "Yelena"],
      last:  ["Stalvik", "Orlov", "Kuznetsova", "Brezhko", "Malenkov", "Tereshkova", "Ferrum", "Zhdanova", "Petrenko", "Volkov"],
    },
    british: {
      title: ["Lord", "Lady", "Sir", "Dame", "The Rt. Hon."],
      first: ["Alistair", "Beatrice", "Clive", "Dorothea", "Edmund", "Felicity", "Gerald", "Harriet", "Ignatius", "Josephine", "Mortimer", "Penelope"],
      last:  ["Ashworth", "Blackwood", "Carmichael", "Davenport", "Featherstone", "Greystoke", "Hollingsworth", "Pemberton", "Sinclair", "Thistlewood"],
    },
    archivist: {
      title: ["Archivist", "Indexer", "Curator", "Lector", "Registrar"],
      first: ["Aleph", "Brevia", "Codex", "Delia", "Errat", "Folio", "Glossa", "Hilbert", "Iota", "Lemma", "Margin", "Quarto", "Vellum"],
      last:  ["of Stack Nine", "of the Cold Shelf", "of Reading Room IV", "of the Locked Annex", "of Acquisitions", "of the Long Index", "of Preservation", "of Catalogue Zero"],
    },
    ottoman: {
      title: ["Pasha", "Vizier", "Bey", "Hanim", "Agha"],
      first: ["Aydin", "Belkis", "Cem", "Dilara", "Emre", "Feride", "Halil", "Iskender", "Leyla", "Murad", "Nilufer", "Orhan", "Selim", "Zeynep"],
      last:  ["of the Golden Horn", "the Magnificent", "the Quiet", "of the Tulip Court", "the Mapmaker", "of Smyrna", "the Falconer", "of the Velvet Divan"],
    },
    divine: {
      title: ["", "", "", ""],
      first: ["Aurvang", "Belisaria", "Cthonis", "Dawnmaker", "Erebh", "Fulmina", "Ghorvad", "Hyalith", "Ilmarra", "Khoros", "Lethiel", "Morvandra", "Nyxion", "Ophira", "Pyrrhast", "Selunara", "Thandros", "Umbriel", "Vorthane", "Zephyrelle"],
      last:  ["the Thrice-Crowned", "of the Last Door", "Stormtender", "the Unblinking", "of Forgotten Rivers", "Worldcarver", "the Patient Flame", "of the Hollow Star", "Oathkeeper", "the Many-Handed"],
    },
    sammarinese: {
      title: ["Don", "Donna", "Maestro", "Dottore", "Dottoressa"],
      first: ["Arianna", "Bartolomeo", "Cesare", "Delfina", "Ercole", "Fiorella", "Gianmarco", "Isotta", "Lorenzo", "Marinella", "Ottavio", "Speranza"],
      last:  ["Titano", "Balestrieri", "Montale", "Serravalle", "Faetano", "Borgomaggiore", "Acquaviva", "Chiesanuova"],
    },
    corporate: {
      title: ["CEO", "CFO", "Director", "VP", "Chairperson"],
      first: ["Aria", "Blake", "Cassius", "Delphine", "Everett", "Fallon", "Grayson", "Harlow", "Indra", "Jaxon", "Kendall", "Lennox", "Marlowe", "Sterling"],
      last:  ["Vance-Holdings", "Quarterly", "Margin", "Blackrock", "Grimorieman", "Synergy", "Acquira", "Dividenda", "Mercer-Yield", "Optimasse"],
    },
    mongol: {
      title: ["Khan", "Abbot", "Noyon", "Lama", "Darga"],
      first: ["Batu", "Chuluun", "Erdene", "Gantulga", "Khulan", "Munkh", "Naran", "Oyuun", "Saruul", "Temujin", "Tsetseg", "Zaya"],
      last:  ["of the Gobi", "of Karakorum", "Bataar", "Gandan", "of the Orkhon", "Sukh", "Dorj", "of the Blue Sky"],
    },
    indic: {
      title: ["Acharya", "Shri", "Pandit", "Swami", "Sardar"],
      first: ["Aditya", "Bhavani", "Chandra", "Devika", "Girish", "Ila", "Kailash", "Lakshmi", "Nandan", "Parvati", "Raghav", "Vasanti"],
      last:  ["Sharma", "Iyer", "Chatterjee", "Deshmukh", "Nair", "Rathore", "Bhattacharya", "Kulkarni", "Varma", "Trivedi"],
    },
    andean: {
      title: ["General", "Don", "Doña", "Diputado", "Almirante"],
      first: ["Aurelio", "Bernarda", "Cristóbal", "Elvira", "Fermín", "Ignacia", "Lautaro", "Mercedes", "Octavio", "Rosalba", "Tomás", "Ximena"],
      last:  ["Valdivia", "Errázuriz", "Montalva", "Quintana", "Vergara", "Undurraga", "Cifuentes", "Barros", "Zañartu", "Ilabaca"],
    },
    korean: {
      title: ["Comrade", "Chairman", "Marshal", "Secretary", "Hero of the Republic"],
      first: ["Chol", "Hyon", "Il", "Jong", "Myong", "Nam", "Ok", "Song", "Un", "Yong", "Chun", "Sun"],
      last:  ["Kim", "Ri", "Pak", "Choe", "Kang", "Hong", "O", "Jang", "Yun", "An"],
    },
    chinese: {
      title: ["Preceptor", "Chancellor", "Abbot", "Censor", "Rectifier"],
      first: ["Wei", "Lan", "Zhen", "Xiu", "Ming", "Qiu", "Shun", "Yun", "Bo", "Fang", "Jian", "Ruo"],
      last:  ["Kong", "Meng", "Zhu", "Wang", "Li", "Chen", "Fa", "Xuan", "Hui", "Tang"],
    },
    persian: {
      title: ["Hojjat al-Islam", "Doctor", "Engineer", "Ayatollah", "Deputy"],
      first: ["Ali", "Hossein", "Fatemeh", "Mehdi", "Reza", "Zahra", "Mostafa", "Nasrin", "Kazem", "Parvin", "Javad", "Soraya"],
      last:  ["Ansari", "Beheshti", "Golpayegani", "Hashemi", "Kermani", "Mousavian", "Nouri", "Rezaei", "Shirazi", "Tabatabai"],
    },
    goetic: {
      title: ["King", "Duke", "Prince", "Marquis", "President"],
      first: ["Bael", "Agares", "Vassago", "Marbas", "Buer", "Sitri", "Beleth", "Naberius", "Astaroth", "Furfur", "Stolas", "Balam", "Gremory", "Andras"],
      last:  ["of the Ars Goetia", "of the Seventy-Two", "Bound of Solomon", "of the Brazen Vessel", "the Sigil-Bearer", "of the Ninth Hierarchy", "the Ring-Sworn", "of the Restored Sanhedrin"],
    },
    arab: {
      title: ["Sheikh", "Colonel", "Comrade", "Sayyid", "Doctor"],
      first: ["Adnan", "Bassam", "Dalal", "Faisal", "Hala", "Ibrahim", "Karim", "Layla", "Mahmoud", "Nabil", "Rania", "Tariq"],
      last:  ["al-Bakri", "al-Douri", "al-Hashimi", "al-Jaberi", "al-Khoury", "al-Masri", "al-Rashid", "al-Sabah", "al-Tikriti", "Haddad"],
    },
    mesoamerican: {
      title: ["Ajaw", "Sajal", "Ah K'in", "Nacom", "Halach Uinic"],
      first: ["Balam", "Ix Chel", "Kan Ek", "Yaxkin", "Itzel", "Chaac", "Ahau", "Nicte", "Tecum", "Xoc", "Zacnicte", "Kinich"],
      last:  ["of Copán", "of Palenque", "of Tikal", "of Chichén", "of Uxmal", "of the Cenote", "Tenochca", "of the Ninth Sky"],
    },
    goblin: {
      title: ["Boss", "Warboss", "Shaman", "Chief", "Loota"],
      first: ["Grik", "Snaga", "Zog", "Mok", "Urgha", "Skab", "Nazgit", "Throk", "Grubna", "Wort", "Izzik", "Bogrot"],
      last:  ["Skullsplitta", "da Biter", "Three-Teef", "Wolfpig-Rida", "da Sneaky", "Ironchewa", "Mudfist", "da Loud", "Squigbreff", "Stabba"],
    },
    zeta: {
      title: ["Overseer", "Analyzer", "Warper", "Guide", "Ambassador"],
      first: ["Zyx-7", "Qel-9", "Vrax-3", "Klix-5", "Hlee-2", "Omm-4", "Vess-1", "Thruun-8", "Iisha-6", "Nuu-11", "Sset-13", "Ilka-17", "Praa-19", "Oxx-23"],
      last:  ["of the Open Shutter", "of the Red Scalpel", "of the Folded Mind", "of the Long Weekend", "of the Quiet Probe", "of the Kind Regard", "of the Second Landing", "of the Third Reticulum"],
    },
    dargos: {
      title: ["Regent", "Clerk", "Marshal", "Envoy", ""],
      first: ["Obb", "Wodwod", "Ssein", "Grunnu", "Habb", "Ilfo", "Nnok", "Purr", "Tebbe", "Ulgu"],
      last:  ["the Unserious", "of the Long Con", "who Waits", "the Straight-Faced", "of Titania", "the Callback", "who Means It", "of the Acid Shore"],
    },
    generic: {
      title: ["Hon.", "Senator", "Deputy", "Minister"],
      first: ["Adrian", "Bianca", "Casimir", "Daria", "Emil", "Franka", "Gustave", "Helena", "Ivo", "Jana", "Karl", "Lena"],
      last:  ["Varga", "Novak", "Lindqvist", "Moreau", "Keller", "Sokolov", "Brandt", "Costa", "Vidal", "Hoffmann"],
    },
  };

  // i18n-ignore-end

  // The tables ride on the test/inspection hooks next to the engine's own.
  Object.assign(window.NPCPolitics._internals, { ARCHETYPES, FALLBACK_ARCHETYPE, FACTION_ALIASES });

  Object.assign(window.NPCPolitics._internal, {
    ARCHETYPES, FACTION_ALIASES, FALLBACK_ARCHETYPE, governedTowerWorlds, homeCountryOf,
    isTowerPower, NAME_BANKS, nationalParties, OFFWORLD_POWERS, SEATED_ON_DAY_ONE,
    towerArchetypeFor, towerWorldByPower,
  });

  // The whole family is in: hand every module the names it reads late.
  for (const bind of window.NPCPolitics._internal._late) bind();
})();
