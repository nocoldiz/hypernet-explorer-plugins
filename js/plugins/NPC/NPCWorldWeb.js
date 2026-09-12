/*:
 * @target MZ
 * @plugindesc NPC World Web v1.0.0, Cross-system emergence layer: settlement pulse, episodes & feedback loops
 * @author Omni-Lex
 * @help
 * ============================================================================
 * NPCWorldWeb, the connective tissue between every simulation system
 * ============================================================================
 * Reads the outputs of every other simulation (NPC lives, politics, crime,
 * jobs, the player's own rap sheet, the stock market) and condenses them into
 * a per-settlement "pulse", three civic meters that every system can feel:
 *
 *   prosperity  0..100 , employment rate, national economy mood, episodes
 *   security    0..100 , local crime per capita, the guard captain's own
 *                         honesty (a crooked captain rots a town), national
 *                         stability, and the player's wanted level
 *   mood        0..100 , prosperity + security, national unrest, festivals,
 *                         epidemics, and live street bustle
 *
 * On top of the meters sits the EPISODE machinery, threshold + hysteresis
 * state machines that turn smooth drift into discrete, story-shaped waves:
 *
 *   crimeWave  starts when security collapses under real per-capita crime;
 *              while running, free-time crime is more tempting but the guard
 *              crackdown also catches more thieves, the wave breaks itself.
 *   boom/bust  start at prosperity extremes; they swing hiring rates, crime
 *              pressure, divorce rates, shop prices and market sentiment,
 *              then erode their own cause (a boom raises employment, which
 *              re-anchors prosperity; a bust empties the job market).
 *   festival   declared by thriving settlements: mood and bustle up, shop
 *              occupancy up, and pickpockets work the crowds.
 *   epidemic   rare, worse in low-mood towns: mood, hiring and shop traffic
 *              collapse; NPC hygiene drains fast until it burns out.
 *
 * Every transition feeds back OUT into the other systems:
 *   → NewsSystem        episodes, riots, coups, elections and even the
 *                       mayor's divorce become real news items with real
 *                       priceEffect / occupancyEffect (RealEstateMarket and
 *                       shop occupancy already listen to those).
 *   → StockMarketSystem marketSentiment() tilts the random walk of oil.
 *   → NPCLifeSimulator  lifeRates(group) scales hiring, crime, courtship,
 *                       divorce and catch rates per settlement.
 *   → NPCSimulationCore intentBias(group) makes street NPCs actually choose
 *                       crime/leisure differently; theftSuccessModifier()
 *                       makes crackdowns bite; needDrainModifiers() makes
 *                       epidemics felt on every NPC's hygiene meter.
 *   → NPCPolitics       powerPressure(power) leaks settlement misery into
 *                       national unrest/legitimacy/economy, riots born from
 *                       a local crime wave, legitimacy built on local booms.
 *   → NPCConversation   getConversationContext() lets NPCs gossip about the
 *                       crime wave, the boom, the plague, the headline, and
 *                       warn each other about a notorious player.
 *
 * The result is circular causality across plugins that were previously
 * islands: unemployment → crime → crackdown → prisons → unemployment;
 * boom → prices → news → real-estate → migration of wealth; local riots →
 * national unrest → bad policy → deeper bust. Emergence by feedback, not
 * by script.
 *
 * State lives in $gameSystem._npcWorldWeb, mapped by WorldManager to the
 * "worldWeb" section of the world's npcs.json, shared by every savegame of
 * the world. All sampling is seeded (world seed + group + interval), so the
 * same world produces the same waves.
 *
 * Load order:
 *   Core/WorldManager → Core/TimeDateSystem → NPC/NPCSystem
 *   → NPC/NPCSociety → NPC/NPCSimulationCore → NPC/NPCLifeSimulator
 *   → NPC/NPCConversation → NPC/NPCPolitics → NPC/NPCWorldWeb  ← this file
 *
 * Public API (window.NPCWorldWeb):
 *   catchUp(nowMinute)          , resolve the pulse up to now
 *   getPulse(group)             , a settlement's pulse object
 *   lifeRates(group)            , multipliers for NPCLifeSimulator
 *   intentBias(group)           , additive intent weights for NPCSimulationCore
 *   theftSuccessModifier(group) , crackdowns make stealing harder
 *   needDrainModifiers(group)   , epidemic/festival need-drain multipliers
 *   powerPressure(powerName)    , per-day meter deltas for NPCPolitics
 *   marketSentiment()           , -1..1 tilt for the stock market
 *   playerNotoriety()           , 0..1 from the player's CrimeSystem bounty
 *   getConversationContext(name), gossip fodder for NPCConversation
 *   buildPulseReport(group)     , readable settlement state report
 *
 * @command WorldPulse
 * @desc Show the civic pulse report of a map group / settlement.
 *
 * @arg group
 * @text Map group name (blank = current)
 * @type string
 * @default
 *
 * @command WorldPulseDebug
 * @desc Print the full world-web state to the console.
 *
 * @command WorldPulseCatchUp
 * @desc Force the world web to resolve all pending time.
 */

(() => {
  "use strict";

  const pluginName = "NPCWorldWeb";

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  const MINUTES_PER_DAY    = 1440;
  const EPOCH_YEAR         = 2001;            // minute 0 = Jan 1 2001 10:00
  const SKIP_FLUSH_MINUTES = 360;             // deltas >= 6h flush npcs.json
  const PULSE_LOG_CAP      = 30;              // per-settlement event log
  const WORLD_LOG_CAP      = 60;              // global event log
  const MAX_NEWS_PER_PASS  = 4;               // don't firehose the news ticker

  // Meter drift speed (points per day toward target), slow enough that
  // episodes have time to push back before the meters re-anchor.
  const DRIFT_PER_DAY = 1.6;

  // Episode thresholds (start / end pairs give hysteresis: once a wave
  // starts, conditions must clearly recover before it ends).
  const EP = {
    crimeWaveStart:  32,   // security below this (with real crime) → wave
    crimeWaveEnd:    55,   // security above this → crackdown declared won
    boomStart:       76,   // prosperity above this → boom
    boomEnd:         58,
    bustStart:       24,   // prosperity below this → bust
    bustEnd:         42,
    festivalMood:    68,   // mood above this → festivals possible
    epidemicMaxMood: 55,   // epidemics only ignite below this mood
  };

  // Per-day episode ignition rates (scaled by conditions at runtime)
  const RATES = {
    festival: 1 / 90,      // thriving towns throw one every few months
    epidemic: 1 / 1200,    // rare; scaled up by misery and population
  };

  // Ids, stored on the episode. The name a town's festival or outbreak goes by
  // is resolved through WorldWeb.festival.<id> / WorldWeb.epidemic.<id> every
  // time it is printed, so a running episode keeps its identity.
  const FESTIVAL_NAMES = [
    "foundersDay", "harvestLights", "lanternRegatta",
    "saintElse", "nightMarketWeek", "driftParade",
    "tinkersCarnival", "longTableFeast",
  ];

  const EPIDEMIC_NAMES = [
    "greyFever", "rustlung", "shivers", "dockPox",
    "wireFlu", "hollowCough", "marshAgue",
  ];

  const festivalName = (id) => {
    const key = "WorldWeb.festival." + id;
    return T.has(key) ? T(key) : String(id || "");
  };
  const epidemicName = (id) => {
    const key = "WorldWeb.epidemic." + id;
    return T.has(key) ? T(key) : String(id || "");
  };

  // ==========================================================================
  // SHARED UTILITIES (see NPCShared.js)
  // ==========================================================================

  const { nameHash, Rng: WebRng, worldSeed, sampleCount, clamp } = window.NPCShared;

  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  function dateStrOf(minute) {
    const d = new Date(EPOCH_YEAR, 0, 1, 10, 0, 0);
    d.setMinutes(d.getMinutes() + minute);
    return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ==========================================================================
  // STATE
  // ==========================================================================

  function getState() {
    if (!$gameSystem) return null;
    if (!$gameSystem._npcWorldWeb) {
      $gameSystem._npcWorldWeb = {
        v: 1,
        lastSimMinute: null,
        settlements: {},
        log: [],
        marketSentiment: 0,
        economyIndex: 1,
      };
    }
    return $gameSystem._npcWorldWeb;
  }

  // Both logs are saved with the world, so an entry holds the key and its
  // values and the sentence is written out by textOf() when it is read.
  function pushPulseEvent(pulse, minute, type, key, params) {
    pulse.log.unshift({ minute, date: dateStrOf(minute), type, key, params });
    if (pulse.log.length > PULSE_LOG_CAP) pulse.log.pop();
  }

  function pushWorldEvent(state, minute, group, type, key, params) {
    state.log.unshift({ minute, date: dateStrOf(minute), group, type, key, params });
    if (state.log.length > WORLD_LOG_CAP) state.log.pop();
  }

  // A log entry as a sentence. Entries written before the logs were keyed hold
  // a finished English string, which is returned as it stands.
  function textOf(entry) {
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    if (!entry.key || !T.has(entry.key)) return entry.desc || "";
    const params = entry.params || {};
    // A settlement is logged under its map-group key ("OmegaTower"); a town of
    // that name in Destinations.json knows how it is meant to read.
    if (params.place != null && window.WorkSystem?.destinationName) {
      return T(entry.key, Object.assign({}, params,
        { place: window.WorkSystem.destinationName(params.place) }));
    }
    return T(entry.key, params);
  }

  function ensurePulse(state, group) {
    if (state.settlements[group]) return state.settlements[group];
    const polity = window.NPCPolitics?.getSettlement?.(group);
    const rng = new WebRng(worldSeed() ^ nameHash("pulse:" + group));
    state.settlements[group] = {
      group,
      power: polity?.power ?? null,
      prosperity: 40 + rng.int(0, 20),
      security:   40 + rng.int(0, 20),
      mood:       40 + rng.int(0, 20),
      census: { population: 0, employed: 0, unemployed: 0, imprisoned: 0, retired: 0, criminals: 0, avgStanding: 50 },
      episodes: { crimeWave: null, boom: null, bust: null, festival: null, epidemic: null },
      log: [],
    };
    return state.settlements[group];
  }

  // ==========================================================================
  // INPUT GATHERING, read every other system's outputs
  // ==========================================================================

  function lifeRecords() {
    return $gameSystem?._npcLifeRecords || {};
  }

  // Per-settlement census from the life simulation, plus how much crime and
  // conviction actually happened inside the elapsed interval.
  function takeCensus(sinceMinute) {
    const byGroup = {};
    for (const record of Object.values(lifeRecords())) {
      const g = record.homeGroup || "__none__";
      const c = byGroup[g] || (byGroup[g] = {
        population: 0, employed: 0, unemployed: 0, imprisoned: 0, retired: 0,
        criminals: 0, standingSum: 0, recentCrimes: 0, recentConvictions: 0,
      });
      c.population++;
      c.standingSum += record.socialStanding ?? 50;
      if (record.inPrisonUntilMinute != null) c.imprisoned++;
      else if (record.employment === "employed") c.employed++;
      else if (record.employment === "unemployed") c.unemployed++;
      else if (record.employment === "retired") c.retired++;
      if ((record.honesty ?? 100) < 35 || (record.wantedBounty ?? 0) > 0) c.criminals++;
      for (const crime of record.criminalRecord || []) {
        if (crime.minute > sinceMinute) {
          c.recentCrimes++;
          if (crime.convicted) c.recentConvictions++;
        }
      }
    }
    return byGroup;
  }

  function guardCaptainHonesty(group) {
    const captain = window.NPCPolitics?.getSettlement?.(group)?.offices?.guardCaptain;
    if (!captain) return 50;
    return lifeRecords()[captain]?.honesty ?? 50;
  }

  function playerNotoriety() {
    let bounty = 0;
    try { bounty = window.CrimeSystem?.getTotalBounty?.() ?? 0; } catch (_) { bounty = 0; }
    return clamp(bounty / 20000, 0, 1);
  }

  function currentPlayerGroup() {
    try {
      const mapId = typeof $gameMap !== "undefined" ? $gameMap?.mapId?.() : null;
      return mapId ? (window.NPCSystem?.findMapGroupByMap?.(mapId) ?? null) : null;
    } catch (_) { return null; }
  }

  // Live street bustle: transient per-group activity counters fed by the
  // NPCSim event bus (capability interactions = NPCs visibly doing things).
  const _bustle = {};
  function hookBustle() {
    if (hookBustle._done || !window.NPCSim?.on) return;
    hookBustle._done = true;
    window.NPCSim.on("npc:capability_start", () => {
      const g = currentPlayerGroup();
      if (g) _bustle[g] = (_bustle[g] || 0) + 1;
    });
  }

  // ==========================================================================
  // EPISODE MACHINERY, threshold + hysteresis state machines
  // ==========================================================================

  function startEpisode(state, pulse, key, minute, data, textKey, params, news) {
    pulse.episodes[key] = Object.assign({ startedMinute: minute }, data);
    pushPulseEvent(pulse, minute, key, textKey, params);
    pushWorldEvent(state, minute, pulse.group, key, textKey, params);
    if (news) queueNews(news);
  }

  function endEpisode(state, pulse, key, minute, textKey, params, news) {
    pulse.episodes[key] = null;
    pushPulseEvent(pulse, minute, key + "_end", textKey, params);
    pushWorldEvent(state, minute, pulse.group, key + "_end", textKey, params);
    if (news) queueNews(news);
  }

  function updateEpisodes(state, pulse, rng, last, now, days, census) {
    const ep = pulse.episodes;
    const minute = () => last + rng.int(0, Math.max(0, Math.floor(now - last)));
    const perCapitaCrime = census.population ? census.recentCrimes / census.population : 0;

    // ---- crime wave --------------------------------------------------------
    if (!ep.crimeWave) {
      if (pulse.security < EP.crimeWaveStart && perCapitaCrime > 0.04) {
        const m = minute();
        startEpisode(state, pulse, "crimeWave", m,
          { intensity: clamp(Math.round(perCapitaCrime * 400), 20, 100) },
          "WorldWeb.episode.crimeWaveStart", { place: pulse.group },
          { text: T('WorldWeb.news.crimeWaveStart'),
            location: pulse.group, category: "negative",
            priceEffect: 0.95, occupancyEffect: 0.85, minute: m });
      }
    } else {
      // The crackdown ramps: each passing week the wave ages, catch rates
      // climb (see theftSuccessModifier / lifeRates), criminals get jailed,
      // census crime falls, security recovers, the wave breaks itself.
      if (pulse.security > EP.crimeWaveEnd || perCapitaCrime < 0.005) {
        const m = minute();
        endEpisode(state, pulse, "crimeWave", m,
          "WorldWeb.episode.crimeWaveEnd", { place: pulse.group },
          { text: T('WorldWeb.news.crimeWaveEnd'),
            location: pulse.group, category: "positive",
            priceEffect: 1.02, occupancyEffect: 1.1, minute: m });
      }
    }

    // ---- boom / bust (mutually exclusive) ----------------------------------
    if (!ep.boom && !ep.bust && pulse.prosperity > EP.boomStart) {
      const m = minute();
      startEpisode(state, pulse, "boom", m, {},
        "WorldWeb.episode.boomStart", { place: pulse.group },
        { text: T('WorldWeb.news.boomStart'),
          location: pulse.group, category: "positive",
          priceEffect: 1.12, occupancyEffect: 1.15, minute: m });
    } else if (ep.boom && pulse.prosperity < EP.boomEnd) {
      const m = minute();
      endEpisode(state, pulse, "boom", m, "WorldWeb.episode.boomEnd", { place: pulse.group },
        { text: T('WorldWeb.news.boomEnd'),
          location: pulse.group, category: "neutral",
          priceEffect: 0.97, occupancyEffect: 0.95, minute: m });
    }
    if (!ep.bust && !ep.boom && pulse.prosperity < EP.bustStart) {
      const m = minute();
      startEpisode(state, pulse, "bust", m, {},
        "WorldWeb.episode.bustStart", { place: pulse.group },
        { text: T('WorldWeb.news.bustStart'),
          location: pulse.group, category: "negative",
          priceEffect: 0.88, occupancyEffect: 0.8, minute: m });
    } else if (ep.bust && pulse.prosperity > EP.bustEnd) {
      const m = minute();
      endEpisode(state, pulse, "bust", m, "WorldWeb.episode.bustEnd", { place: pulse.group },
        { text: T('WorldWeb.news.bustEnd'),
          location: pulse.group, category: "positive",
          priceEffect: 1.05, occupancyEffect: 1.1, minute: m });
    }

    // ---- festival ----------------------------------------------------------
    if (ep.festival && ep.festival.untilMinute <= now) {
      endEpisode(state, pulse, "festival", ep.festival.untilMinute,
        "WorldWeb.episode.festivalEnd", { festival: festivalName(ep.festival.name), place: pulse.group });
    }
    if (!ep.festival && !ep.epidemic && pulse.mood > EP.festivalMood) {
      if (sampleCount(rng, RATES.festival * days) > 0) {
        const m = minute();
        const name = rng.pick(FESTIVAL_NAMES);
        startEpisode(state, pulse, "festival", m,
          { name, untilMinute: m + rng.int(3, 7) * MINUTES_PER_DAY },
          "WorldWeb.episode.festivalStart", { place: pulse.group, festival: festivalName(name) },
          { text: T('WorldWeb.news.festivalStart', { festival: festivalName(name) }),
            location: pulse.group, category: "positive",
            priceEffect: 1.05, occupancyEffect: 1.25, minute: m });
      }
    }

    // ---- epidemic ----------------------------------------------------------
    // There are two things that can be writing this slot. Health_DiseaseSystem
    // runs the real continental outbreak - the one the Eurodemics portal draws,
    // with a named disease out of Diseases.json, an SIR curve and a death toll -
    // and pushes the worst one burning in this town into `episodes.epidemic`,
    // stamped `source: 'eurodemics'`. This block used to invent its own
    // alongside it, from its own name list, with neither aware of the other: a
    // real outbreak silently overwrote an invented one mid-run (so its "the
    // sickness has passed" line never came), and an invented one could put a
    // town under a plague the disease engine said was not happening.
    //
    // The disease system owns the slot now. What is left here is the local
    // trigger - misery and crowding are what start an outbreak in a poor,
    // packed town - which now ASKS for a real one rather than making one up.
    // The invented kind survives only as the fallback for a world with the
    // disease plugin switched off.
    if (ep.epidemic && ep.epidemic.source !== 'eurodemics' && ep.epidemic.untilMinute <= now) {
      endEpisode(state, pulse, "epidemic", ep.epidemic.untilMinute,
        "WorldWeb.episode.epidemicEnd", { disease: epidemicName(ep.epidemic.name), place: pulse.group },
        { text: T('WorldWeb.news.epidemicEnd', { disease: epidemicName(ep.epidemic.name) }),
          location: pulse.group, category: "positive",
          priceEffect: 1.02, occupancyEffect: 1.15, minute: ep.epidemic.untilMinute });
    }
    if (!ep.epidemic && pulse.mood < EP.epidemicMaxMood && census.population >= 8) {
      const misery = (EP.epidemicMaxMood - pulse.mood) / EP.epidemicMaxMood;     // 0..1
      const crowding = clamp(census.population / 40, 0.3, 2);
      if (sampleCount(rng, RATES.epidemic * (0.5 + misery) * crowding * days) > 0) {
        const m = minute();
        // Ask the disease engine for a real outbreak here. It fills the slot
        // itself on its next sync, with a disease that exists and a curve that
        // can be looked up, so nothing is written from this side.
        const ignited = igniteRealOutbreak(pulse.group);
        if (!ignited) {
          const name = rng.pick(EPIDEMIC_NAMES);
          startEpisode(state, pulse, "epidemic", m,
            { name, severity: rng.int(30, 90), untilMinute: m + rng.int(14, 60) * MINUTES_PER_DAY },
            "WorldWeb.episode.epidemicStart", { disease: epidemicName(name), place: pulse.group },
            { text: T('WorldWeb.news.epidemicStart', { disease: epidemicName(name) }),
              location: pulse.group, category: "negative",
              priceEffect: 0.9, occupancyEffect: 0.7, minute: m });
        }
        if (ep.festival) endEpisode(state, pulse, "festival", m,
          "WorldWeb.episode.festivalCancelled", { festival: festivalName(ep.festival.name) });
      }
    }
  }

  // A real outbreak in the town this settlement group stands for, or null when
  // the disease plugin is off, has no record of the place, or declines. The
  // disease it picks is its own weighted choice out of Diseases.json, which is
  // the point: what goes round a town should be something that can be caught,
  // diagnosed, treated and reported on the Eurodemics portal.
  function igniteRealOutbreak(group) {
    const epi = window.EpidemicSystem;
    if (!epi || typeof epi.ignite !== "function" || typeof epi.placeForGroup !== "function") return null;
    try {
      if (typeof epi.ready === "function" && !epi.ready()) return null;
      const place = epi.placeForGroup(group);
      if (!place || !place.key) return null;
      return epi.ignite(null, place.key);
    } catch (e) {
      console.warn("[NPCWorldWeb] could not ignite a real outbreak in " + group, e);
      return null;
    }
  }

  // ==========================================================================
  // NEWS BRIDGE, settlement & political events become real news, with real
  // priceEffect / occupancyEffect (RealEstateMarket and shops already listen)
  // ==========================================================================

  let _newsQueue = [];

  function queueNews(item) {
    _newsQueue.push(item);
  }

  function gameDateOf(minute) {
    const d = new Date(EPOCH_YEAR, 0, 1, 10, 0, 0);
    d.setMinutes(d.getMinutes() + minute);
    return d;
  }

  function publishQueuedNews() {
    const mgr = window.$newsManager;
    const queue = _newsQueue.splice(0, _newsQueue.length);
    if (!mgr || !Array.isArray(mgr.newsHistory)) return;
    for (const item of queue.slice(0, MAX_NEWS_PER_PASS)) {
      try {
        const news = {
          text: `\\c[6][${item.location}]\\c[0] ` + item.text.replace(/{loc}/g, item.location),
          location: item.location,
          category: item.category || "neutral",
          type: "worldWeb",
          timestamp: gameDateOf(item.minute),
          priceEffect: item.priceEffect ?? 1,
          occupancyEffect: item.occupancyEffect ?? 1,
          isRealNews: false,
        };
        mgr.newsHistory.unshift(news);
        if (mgr.newsHistory.length > 50) mgr.newsHistory.pop();
        if (typeof mgr.applyNewsEffects === "function") {
          mgr.applyNewsEffects(news, item.durationHours ?? 96);
        }
      } catch (e) {
        console.error("[NPCWorldWeb] news publish failed:", e);
      }
    }
  }

  // Political shockwaves: pull fresh national events (riots, coups,
  // revolutions, assassinations, elections) out of NPCPolitics and put them
  // on the wire, markets and rents feel them through the news effects.
  const POLITICAL_NEWS_EFFECTS = {
    riot:          { category: "negative", priceEffect: 0.93, occupancyEffect: 0.85 },
    coup:          { category: "negative", priceEffect: 0.85, occupancyEffect: 0.8  },
    revolution:    { category: "negative", priceEffect: 0.8,  occupancyEffect: 0.75 },
    assassination: { category: "negative", priceEffect: 0.9,  occupancyEffect: 0.9  },
    election:      { category: "neutral",  priceEffect: 1.03, occupancyEffect: 1.05 },
    festival:      { category: "positive", priceEffect: 1.04, occupancyEffect: 1.1  },
  };

  function harvestPoliticalNews(last) {
    const powers = window.NPCPolitics?.listPowers?.() || [];
    let published = 0;
    for (const name of powers) {
      if (published >= 2) break;
      const power = window.NPCPolitics.getPower(name);
      for (const ev of power?.events || []) {
        if (ev.minute <= last) break; // events are newest-first
        const fx = POLITICAL_NEWS_EFFECTS[ev.type];
        if (!fx) continue;
        const text = window.NPCPolitics.textOf ? window.NPCPolitics.textOf(ev) : ev.desc;
        if (!text) continue;
        queueNews(Object.assign({ text: text, location: name, minute: ev.minute }, fx));
        published++;
        break; // at most one headline per power per pass
      }
    }
  }

  // Small-town gossip wire: fresh life events of local officeholders make
  // the news, the mayor's divorce is everyone's business.
  // A mayor's life event, as NPCLifeSimulator would print it.
  const lifeEventTextOf = (ev) =>
    (window.NPCLifeSim?.lifeEventText?.(ev)) ?? ev?.desc ?? "";

  function harvestGossipNews(state, last) {
    let published = 0;
    for (const pulse of Object.values(state.settlements)) {
      if (published >= 1) break;
      const offices = window.NPCPolitics?.getSettlement?.(pulse.group)?.offices;
      const mayor = offices?.mayor;
      if (!mayor) continue;
      const record = lifeRecords()[mayor];
      for (const ev of record?.lifeEvents || []) {
        if (ev.minute <= last) break; // newest-first
        if (ev.type !== "relationship" && ev.type !== "conviction") continue;
        queueNews({
          text: T('WorldWeb.news.mayorEvent', { mayor: mayor, what: lifeEventTextOf(ev) }),
          location: pulse.group, minute: ev.minute,
          category: ev.type === "conviction" ? "negative" : "neutral",
          priceEffect: ev.type === "conviction" ? 0.96 : 1,
          occupancyEffect: 1,
        });
        if (ev.type === "conviction") {
          pulse.security = clamp(pulse.security - 6, 0, 100);
          pulse.mood = clamp(pulse.mood - 4, 0, 100);
          pushPulseEvent(pulse, ev.minute, "scandal", "WorldWeb.episode.mayorScandal",
            { mayor: mayor, what: lifeEventTextOf(ev) });
        }
        published++;
        break;
      }
    }
  }

  // ==========================================================================
  // DERIVED MODIFIERS, what the other systems consume (cached per pass)
  // ==========================================================================

  const NEUTRAL_LIFE_RATES = Object.freeze({ findJob: 1, jobChange: 1, crime: 1, dating: 1, divorce: 1, catchBonus: 0 });
  const NEUTRAL_INTENT     = Object.freeze({ crime: 0, leisure: 0, social: 0, money: 0 });
  const NEUTRAL_DRAIN      = Object.freeze({ hygiene: 1, social: 1, leisure: 1 });

  let _mods = {}; // group → { lifeRates, intentBias, needDrain, theftMod }

  function computeModifiers(pulse) {
    const ep = pulse.episodes;
    const prosperity = pulse.prosperity, security = pulse.security, mood = pulse.mood;

    const lifeRates = {
      // hiring follows the local economy: 0.4x in a deep bust, 1.8x in a boom
      findJob: clamp(0.4 + prosperity / 60, 0.4, 1.8) * (ep.boom ? 1.3 : 1) * (ep.bust ? 0.5 : 1) * (ep.epidemic ? 0.7 : 1),
      jobChange: ep.boom ? 1.5 : ep.bust ? 0.6 : 1,
      // desperation breeds crime; crackdowns and high security suppress it
      crime: clamp(1.6 - prosperity / 80, 0.5, 1.6) * (ep.bust ? 1.5 : 1) * (ep.crimeWave ? 1.3 : 1) * clamp(1.3 - security / 120, 0.6, 1.3),
      // people court in good times, split in bad ones
      dating: clamp(0.7 + mood / 120, 0.7, 1.5) * (ep.festival ? 1.4 : 1) * (ep.epidemic ? 0.6 : 1),
      divorce: ep.bust ? 1.6 : ep.boom ? 0.8 : 1,
      // crackdown catch bonus ramps with security pressure during a wave
      catchBonus: ep.crimeWave ? clamp(0.1 + (100 - security) / 250, 0.1, 0.35) : 0,
    };

    const intentBias = {
      crime: Math.round((ep.crimeWave ? 8 : 0) + (ep.bust ? 8 : 0) + (ep.festival ? 4 : 0) + clamp((40 - security) / 4, 0, 10)),
      leisure: ep.festival ? 18 : ep.epidemic ? -10 : 0,
      social: ep.festival ? 12 : ep.epidemic ? -12 : 0,
      money: ep.bust ? 8 : 0,
    };

    const needDrain = {
      hygiene: ep.epidemic ? 1 + (ep.epidemic.severity ?? 50) / 60 : 1,
      social: ep.festival ? 0.5 : ep.epidemic ? 1.4 : 1,
      leisure: ep.festival ? 0.5 : 1,
    };

    // During a crackdown the guard is everywhere: stealing gets harder the
    // longer the wave runs; in a neglected town it's easier than baseline.
    const theftMod = ep.crimeWave ? clamp(0.45 + security / 150, 0.45, 0.9)
      : clamp(1.25 - security / 100, 0.6, 1.25);

    return { lifeRates, intentBias, needDrain, theftMod };
  }

  function refreshModifiers(state) {
    _mods = {};
    for (const [group, pulse] of Object.entries(state.settlements)) {
      _mods[group] = computeModifiers(pulse);
    }
  }

  // National pressure from local conditions: each power feels the average
  // misery/joy of its settlements as per-day meter deltas (consumed by
  // NPCPolitics.simulatePowerChunk).
  function powerPressure(powerName) {
    const state = $gameSystem?._npcWorldWeb;
    if (!state) return { economy: 0, unrest: 0, legitimacy: 0 };
    let economy = 0, unrest = 0, legitimacy = 0, n = 0;
    for (const pulse of Object.values(state.settlements)) {
      if (pulse.power !== powerName) continue;
      n++;
      economy += (pulse.prosperity - 50) / 50;              // -1..1
      if (pulse.episodes.crimeWave) unrest += 0.6;
      if (pulse.episodes.bust)      { unrest += 0.5; legitimacy -= 0.4; }
      if (pulse.episodes.epidemic)  { unrest += 0.4; legitimacy -= 0.3; }
      if (pulse.episodes.boom)      legitimacy += 0.5;
      if (pulse.episodes.festival)  unrest -= 0.3;
    }
    if (!n) return { economy: 0, unrest: 0, legitimacy: 0 };
    // Per-day deltas, deliberately small: settlements whisper to the nation.
    return {
      economy: clamp(economy / n, -1, 1) * 0.2,
      unrest: clamp(unrest / n, -1, 1.5) * 0.25,
      legitimacy: clamp(legitimacy / n, -1, 1) * 0.2,
    };
  }

  // ==========================================================================
  // THE PULSE, catchUp delta engine
  // ==========================================================================

  let _catchUpRunning = false;


  // True in a world created with populationMode "empty" (WorldManager).
  function isEmptyWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
  }

  function catchUp(nowMinute) {
    if (_catchUpRunning) return;
    // Nothing pulses through a world with nobody in it: no settlement news,
    // no trade, no rumour. See WorldManager.populationMode.
    if (isEmptyWorld()) return;
    if (!$gameSystem || !$gameVariables) return;
    const state = getState();
    if (!state) return;
    _catchUpRunning = true;
    try {
      nowMinute = Number(nowMinute ?? $gameVariables.value(114)) || 0;

      // The web reads other simulations' outputs, make sure they're current.
      try { window.NPCLifeSim?.catchUp?.(nowMinute); } catch (_) {}
      try { window.NPCPolitics?.catchUp?.(nowMinute); } catch (_) {}
      hookBustle();

      // Ensure a pulse exists for every known map group.
      for (const group of Object.keys($gameSystem._npcMapGroups || {})) {
        ensurePulse(state, group);
      }

      const last = state.lastSimMinute;
      if (last === undefined || last === null || last > nowMinute) {
        state.lastSimMinute = nowMinute;
        refreshModifiers(state);
        return;
      }
      const deltaMinutes = nowMinute - last;
      if (deltaMinutes < MINUTES_PER_DAY) {
        if (!Object.keys(_mods).length) refreshModifiers(state);
        return; // sub-day deltas accumulate
      }
      const days = deltaMinutes / MINUTES_PER_DAY;
      state.lastSimMinute = nowMinute;

      const censusByGroup = takeCensus(last);
      const playerGroup = currentPlayerGroup();
      const notoriety = playerNotoriety();
      const seed = worldSeed();

      let sentimentSum = 0, sentimentN = 0;

      for (const pulse of Object.values(state.settlements)) {
        const rng = new WebRng((nameHash("pulse:" + pulse.group) ^ seed ^ (last >>> 0)) >>> 0);
        const census = censusByGroup[pulse.group] || {
          population: 0, employed: 0, unemployed: 0, imprisoned: 0, retired: 0,
          criminals: 0, standingSum: 0, recentCrimes: 0, recentConvictions: 0,
        };
        pulse.census = {
          population: census.population,
          employed: census.employed,
          unemployed: census.unemployed,
          imprisoned: census.imprisoned,
          retired: census.retired,
          criminals: census.criminals,
          avgStanding: census.population ? Math.round(census.standingSum / census.population) : 50,
        };

        // National backdrop
        if (!pulse.power) pulse.power = window.NPCPolitics?.getSettlement?.(pulse.group)?.power ?? null;
        const power = pulse.power ? window.NPCPolitics?.getPower?.(pulse.power) : null;
        const econMood  = power?.state?.economyMood ?? 50;
        const stability = power?.state?.stability ?? 50;
        const unrest    = power?.state?.unrest ?? 30;

        // ---- targets -------------------------------------------------------
        const workforce = census.employed + census.unemployed;
        const employmentRate = workforce ? census.employed / workforce : 0.6;
        const perCapitaCrime = census.population ? census.recentCrimes / census.population : 0;
        const guardHonesty = guardCaptainHonesty(pulse.group);
        const bustleBonus = clamp((_bustle[pulse.group] || 0) / 20, 0, 4);
        _bustle[pulse.group] = 0;

        const prosperityTarget = clamp(
          14 + employmentRate * 52 + (econMood - 50) * 0.45
            + (pulse.episodes.boom ? 8 : 0) - (pulse.episodes.bust ? 8 : 0)
            - (pulse.episodes.epidemic ? 12 : 0),
          0, 100);

        const securityTarget = clamp(
          62 - perCapitaCrime * 350 - (census.criminals / Math.max(1, census.population)) * 40
            + (guardHonesty - 50) * 0.35 + (stability - 50) * 0.2
            - (pulse.group === playerGroup ? notoriety * 18 : 0)
            + (pulse.episodes.crimeWave ? 14 : 0), // the crackdown pushes back
          0, 100);

        const moodTarget = clamp(
          (pulse.prosperity + pulse.security) / 2 - (unrest - 40) * 0.3
            + (pulse.episodes.festival ? 16 : 0) - (pulse.episodes.epidemic ? 22 : 0)
            + bustleBonus,
          0, 100);

        // ---- drift toward targets with seeded noise --------------------------
        const step = DRIFT_PER_DAY * days;
        const noise = () => (rng.next() * 2 - 1) * Math.min(4, days * 0.4);
        pulse.prosperity = clamp(pulse.prosperity + clamp(prosperityTarget - pulse.prosperity, -step, step) + noise(), 0, 100);
        pulse.security   = clamp(pulse.security   + clamp(securityTarget   - pulse.security,   -step, step) + noise(), 0, 100);
        pulse.mood       = clamp(pulse.mood       + clamp(moodTarget       - pulse.mood,       -step, step) + noise(), 0, 100);

        updateEpisodes(state, pulse, rng, last, nowMinute, days, census);

        sentimentSum += (pulse.prosperity - 50) / 50
          + (pulse.episodes.boom ? 0.4 : 0) - (pulse.episodes.bust ? 0.5 : 0)
          - (pulse.episodes.epidemic ? 0.3 : 0);
        sentimentN++;
      }

      // ---- global market sentiment ----------------------------------------
      const powers = window.NPCPolitics?.listPowers?.() || [];
      let powerMoodSum = 0;
      for (const name of powers) powerMoodSum += (window.NPCPolitics.getPower(name)?.state?.economyMood ?? 50) - 50;
      const powerMood = powers.length ? powerMoodSum / powers.length / 50 : 0;
      const local = sentimentN ? sentimentSum / sentimentN : 0;
      state.marketSentiment = clamp(local * 0.6 + powerMood * 0.4, -1, 1);
      state.economyIndex = 1 + state.marketSentiment * 0.4;

      // ---- news out ---------------------------------------------------------
      harvestPoliticalNews(last);
      harvestGossipNews(state, last);
      publishQueuedNews();

      refreshModifiers(state);

      if (deltaMinutes >= SKIP_FLUSH_MINUTES && window.WorldManager?.flush) {
        try { window.WorldManager.flush("npcs"); } catch (e) {
          console.error("[NPCWorldWeb] world flush failed:", e);
        }
      }
    } finally {
      _catchUpRunning = false;
    }
  }

  // ==========================================================================
  // CONVERSATION CONTEXT, gossip fodder for NPCConversation's WorldProvider
  // ==========================================================================

  function getConversationContext(npcName) {
    const state = $gameSystem?._npcWorldWeb;
    if (!state) return null;
    const group = $gameSystem?._npcSociety?.[npcName]?._homeGroupName
      ?? lifeRecords()[npcName]?.homeGroup
      ?? currentPlayerGroup();
    const pulse = group ? state.settlements[group] : null;
    if (!pulse) return null;
    const ep = pulse.episodes;
    return {
      group: pulse.group,
      prosperity: Math.round(pulse.prosperity),
      security: Math.round(pulse.security),
      mood: Math.round(pulse.mood),
      crimeWave: !!ep.crimeWave,
      boom: !!ep.boom,
      bust: !!ep.bust,
      festival: ep.festival?.name ?? null,
      epidemic: ep.epidemic?.name ?? null,
      headline: state.log.find(e => e.group === pulse.group)?.desc ?? state.log[0]?.desc ?? null,
      marketMood: state.marketSentiment > 0.25 ? "bullish" : state.marketSentiment < -0.25 ? "bearish" : null,
      playerNotorious: playerNotoriety() > 0.3,
      // Switch 199 ("EarthDestroyed"): Nibiru struck Earth, the tower is all
      // that is left. $gameSystem._gxNibiruOutcome === "saturn" (GalaxySim_Core)
      // is only ever set once the impact date has actually passed with switch
      // 200 ("TowerClimbed") on and switch 199 off, so it doubles as the date
      // gate the earthSaved reaction needs.
      earthDestroyed: !!(typeof $gameSwitches !== "undefined" && $gameSwitches && $gameSwitches.value(199)),
      earthSaved: $gameSystem._gxNibiruOutcome === "saturn",
    };
  }

  // ==========================================================================
  // REPORTS
  // ==========================================================================

  function band(v) {
    const id = v >= 75 ? "thriving" : v >= 55 ? "steady" : v >= 35 ? "strained" : "failing";
    return T('WorldWeb.band.' + id);
  }

  function buildPulseReport(group) {
    const pulse = $gameSystem?._npcWorldWeb?.settlements?.[group];
    if (!pulse) return T('WorldWeb.report.noPulse', { group: group });
    const c = pulse.census, ep = pulse.episodes;
    const lines = [];
    lines.push(T('WorldWeb.report.header', {
      group: pulse.group,
      power: pulse.power ? " " + T('WorldWeb.report.underPower', { power: pulse.power }) : "",
    }));
    lines.push(T('WorldWeb.report.meters', {
      prosperity: Math.round(pulse.prosperity), band: band(pulse.prosperity),
      security: Math.round(pulse.security), mood: Math.round(pulse.mood),
    }));
    lines.push(T('WorldWeb.report.people', {
      population: c.population, employed: c.employed, unemployed: c.unemployed,
      imprisoned: c.imprisoned, retired: c.retired, criminals: c.criminals,
    }));
    const active = [];
    if (ep.crimeWave) active.push(T('WorldWeb.active.crimeWave'));
    if (ep.boom) active.push(T('WorldWeb.active.boom'));
    if (ep.bust) active.push(T('WorldWeb.active.bust'));
    if (ep.festival) active.push(T('WorldWeb.active.festival', { festival: festivalName(ep.festival.name) }));
    if (ep.epidemic) active.push(T('WorldWeb.active.epidemic', { disease: epidemicName(ep.epidemic.name) }));
    lines.push(active.length
      ? T('WorldWeb.report.rightNow', { list: active.join(", ") })
      : T('WorldWeb.report.quiet'));
    for (const ev of pulse.log.slice(0, 3)) lines.push(`  ${ev.date}: ${textOf(ev)}`);
    return lines.join("\n");
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  window.NPCWorldWeb = {
    catchUp,
    getPulse(group) { return $gameSystem?._npcWorldWeb?.settlements?.[group] ?? null; },
    listGroups() { return Object.keys($gameSystem?._npcWorldWeb?.settlements || {}); },
    getWorldLog() { return $gameSystem?._npcWorldWeb?.log ?? []; },
    // Resolve a { key, params } pocket from either log.
    textOf,
    lifeRates(group) { return _mods[group]?.lifeRates ?? NEUTRAL_LIFE_RATES; },
    intentBias(group) { return _mods[group]?.intentBias ?? NEUTRAL_INTENT; },
    needDrainModifiers(group) { return _mods[group]?.needDrain ?? NEUTRAL_DRAIN; },
    theftSuccessModifier(group) { return _mods[group]?.theftMod ?? 1; },
    powerPressure,
    marketSentiment() { return $gameSystem?._npcWorldWeb?.marketSentiment ?? 0; },
    economyIndex() { return $gameSystem?._npcWorldWeb?.economyIndex ?? 1; },
    playerNotoriety,
    getConversationContext,
    buildPulseReport,
    // test/inspection hooks
    _internals: {
      WebRng, nameHash, sampleCount, clamp, dateStrOf, takeCensus,
      computeModifiers, updateEpisodes, EP, RATES, queueNews, publishQueuedNews,
      get newsQueue() { return _newsQueue; },
    },
  };

  // ==========================================================================
  // ENGINE HOOKS (guarded so the module stays loadable outside RMMZ for tests)
  // ==========================================================================

  // World initialization: give every settlement its pulse when the world is
  // made, so the web has a reading for towns the player has never been to
  // (the news ticker, conversation context and market sentiment all read it).
  if (typeof window !== "undefined" && window.WorldManager?.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("worldWeb", 60, () => {
      catchUp($gameVariables?.value(114) || 0);
    });
  }

  if (typeof Game_Map !== "undefined") {
    const _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function (sceneActive) {
      _Game_Map_update.call(this, sceneActive);
      if (!sceneActive || !$gameVariables) return;
      const minute = $gameVariables.value(114) || 0;
      if (minute !== this._lastWorldWebMinute) {
        this._lastWorldWebMinute = minute;
        const last = $gameSystem?._npcWorldWeb?.lastSimMinute;
        if (last === undefined || last === null || minute - last >= MINUTES_PER_DAY || minute < last) {
          catchUp(minute);
        }
      }
    };
  }

  if (typeof Scene_Map !== "undefined") {
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
      _Scene_Map_onMapLoaded.call(this);
      if ($gameVariables) catchUp($gameVariables.value(114) || 0);
    };
  }

  if (typeof PluginManager !== "undefined") {
    PluginManager.registerCommand(pluginName, "WorldPulse", args => {
      let group = String(args.group || "").trim();
      if (!group) group = currentPlayerGroup() || "";
      if (!group) return;
      $gameMessage.add(buildPulseReport(group));
    });

    PluginManager.registerCommand(pluginName, "WorldPulseDebug", () => {
      const state = $gameSystem?._npcWorldWeb;
      if (!state) { console.warn("[NPCWorldWeb] no state yet"); return; }
      console.groupCollapsed("[NPCWorldWeb] world state"); // i18n-ignore: developer console
      for (const group of Object.keys(state.settlements)) console.log(buildPulseReport(group));
      console.log("marketSentiment:", state.marketSentiment, "economyIndex:", state.economyIndex);
      console.log("World log:", JSON.parse(JSON.stringify(state.log)));
      console.groupEnd();
    });

    PluginManager.registerCommand(pluginName, "WorldPulseCatchUp", () => {
      catchUp($gameVariables.value(114) || 0);
    });

    console.log("[NPCWorldWeb] Loaded, cross-system emergence layer active.");
  }

})();
