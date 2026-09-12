/*:
 * @target MZ
 * @plugindesc Procedural Adventure System - branching (CYOA) encounters, on alien worlds and on Earth's own biomes
 * @author Omni-Lex + Nocoldiz
 * @help
 * ============================================================================
 * ProceduralAdventureSystem.js
 * ============================================================================
 * One engine, two places it is played:
 *
 *   SPACE   Every star system that holds planets carries at least one anomalous
 *           world, marked with a "?" in the star map. Holding orbit over it
 *           offers Investigate, once and once only. (Lifted out of
 *           GalaxySim_Core.js, which still reaches it as GalaxySim.Anomaly.)
 *
 *   EARTH   A handful of squares on the world map (315) carry a "???" marker.
 *           Standing on one, or facing it from the square next door, and
 *           choosing Investigate in the travel menu plays the adventure written
 *           for that biome, in a parchment modal over the map. WorldMapReturn.js
 *           draws the markers and offers the choice; everything else is here.
 *
 * Either way it is the same shape: a branching encounter where every choice
 * leads somewhere and the last node pays out - a relic, a fight with something
 * native, salvage, or the walk back with nothing. The party leader is the one
 * who goes down there.
 *
 * ----------------------------------------------------------------------------
 * Content (js/i18n/<lang>/plugins/Anomaly.json)
 * ----------------------------------------------------------------------------
 * One merged namespace, so a translation overrides the prose and inherits every
 * structural field:
 *
 *   Anomaly.tokens.<bank>            shared word banks
 *   Anomaly.biomes.<Biome>           alien surfaces: { label, scenarios, tokens }
 *   Anomaly.earth.tokens.<bank>      word banks for the Earth adventures
 *   Anomaly.earth.aliases.<Biome>    biome -> the biome whose adventure it plays
 *   Anomaly.earth.biomes.<Biome>     { scenarios: [id], tokens, openers, markers }
 *   Anomaly.earth.places.<Name>      one Destinations.json place has its own
 *                                    adventures (Paris, the Vatican Citadel...)
 *   Anomaly.earth.countries.<Name>   one Countries.json country has its own
 *   Anomaly.earth.powers.<Name>      every country a hyperpower holds or controls
 *   Anomaly.earth.eris.Eris          her own scope: the one square a day she
 *                                    takes, and the adventures on it
 *   Anomaly.earth.fallbackScenarios  played on a biome nothing was written for
 *   Anomaly.scenarios.<id>           { title, start, nodes: { <id>: node } }
 *   node                             { text, choices: [{ text, to }] }
 *   terminal node                    { text, outcome: { kind, mag } }
 *
 * Prose is combinatorial: {a|b|c} alternates inline and {token} draws from the
 * banks above, narrowest first, so the same adventure never reads the same way
 * twice. {leader}, {member}, {member2} name the people who actually walked out
 * there.
 *
 * A node may also carry:
 *   asides: { <archetype>: line, any: line }
 *                                    what the companion standing at the
 *                                    leader's shoulder makes of it, in their own
 *                                    register (archetypes are PersonalityData's,
 *                                    lowercased: cautious, brave, cynical...)
 *   emText                           what the node reads as when Em is the one
 *                                    playing (switch 48, per savegame)
 *   bubba                            what Bubba puts in, Em only
 *
 * A choice may carry `only` / `not` (lists of archetypes the LEADER must or must
 * not have for it to be offered), `em` (hers alone) or `notEm`.
 *
 * A choice may also put the answer on a die, or on the party's own pack:
 *   check: { stat, dc }              a d20 against a difficulty (STR CON INT
 *                                    WIS DEX PSI), modified by the leader's
 *                                    ability, thrown by Dice3D across the
 *                                    screen; { chance: 40 } for flat odds
 *   pass / fail                      the node each result leads to
 *   give: { material: true, qty }    hand over the session's own {material};
 *         { mat: "steel", qty }      or a named one; { gold: "small" } for
 *                                    coin. Shown greyed when unaffordable.
 *
 * Anomaly.procScenarios (and earth.procScenarios) name the rolling quests:
 * request-and-check adventures written once against the shared word banks, so
 * every plain biome square (Earth or alien) can roll one in place of its
 * authored scenario. {material} and {qty} in their prose are pinned by the
 * engine to a real crafting material and a count, and the hand-over rows
 * charge exactly that.
 *
 * The modal draws the biome's own battleback behind the prose, the away team's
 * busts standing on it and whoever the story is about facing them: an alien
 * bust off alien ground (a human sometimes, in the Milky Way), a person on
 * Earth, and the creature itself when the last node armed a fight.
 *
 * outcome.kind: artifact | gear | loot | gold | schrodingerite | harm | heal |
 *               augment (`augment` names one or a list out of
 *               ProstheticTypes.json, `who: "member"` fits the companion) |
 *               needs (the whole ending is the good it did: see `needs`) |
 *               battle (with `reward` naming what winning pays, `fail` what
 *               losing or running costs) | minigame (`game` names it, `reward`
 *               pays for a win, `fail` for a loss) | date (she takes an
 *               interest: the ending pays `reward` and moves her own ledger on
 *               the quester, and no evening is played out) | reputation | none
 *
 * Any outcome may also carry:
 *   rep: { <factionSlug>: delta }    standing moved with one or more factions
 *   crime: <key> | [<key>]          filed against the party out of
 *                                    js/db/Messages/PresetCrimes.json
 *   augment: <key> | [<key>]        fitted through the prosthetic shop
 *   needs: { hunger, sleep, hygiene, social, leisure }
 *                                    percentage points put back into everybody
 *   eris: <delta>                   points onto Eris's ledger for whoever is
 *                                    holding the die (window.ErisRelations)
 *   kp / stars                       what the ending is worth in Knowledge
 *                                    (SkillMaster's KP, on the quest curve)
 *
 * Every answered adventure is written into the party's diary (Core/Diary.js)
 * with what it paid.
 *
 * Every marker is one square of the world map, and the set is redrawn once a
 * day: a biome carries one, two if it is very large, and a named place, a
 * country, or a hyperpower's territory carries its own on top of that. They are
 * kept well apart, and never within a square of a door, which owns the OK
 * button there. A square answered is answered for good, whichever day it came
 * round on.
 *
 * ----------------------------------------------------------------------------
 * API
 * ----------------------------------------------------------------------------
 *   ProceduralAdventure.Space          the star-map encounter (= GalaxySim.Anomaly)
 *   ProceduralAdventure.Earth.tiles()          Set of "x,y" carrying a marker
 *   ProceduralAdventure.Earth.isPendingAt(x,y) is there one to play here?
 *   ProceduralAdventure.Earth.beginAt(x,y)     play it (drives the map messages)
 *   ProceduralAdventure.Earth.markerAt(x,y)    what kind of marker stands there
 *                                              (marker.eris = her square today)
 * ============================================================================
 */

(() => {
  "use strict";

  // ==========================================================================
  // Shared plumbing
  // ==========================================================================

  const WORLD_MAP_ID = 315;

  // Deterministic 32-bit hash of a string, mixed with the world seed, so every
  // per-place roll (which world is signalling, which square carries a marker,
  // which story it tells) is the same in every savegame of the same world.
  function worldSeed() {
    try {
      if (window.HistoryManager && window.HistoryManager.getSeed) {
        return window.HistoryManager.getSeed() >>> 0;
      }
    } catch (e) { /* history not loaded yet */ }
    return 19002001;
  }
  function seededHash(key, salt) {
    let h = (2166136261 ^ worldSeed() ^ (salt || 0)) >>> 0;
    const s = String(key || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 15;
    return h >>> 0;
  }
  function seededFloat(key, salt) { return seededHash(key, salt) / 4294967296; }

  // Crafting materials, the "loot" ending's currency and the coin a request
  // quest is paid in. GalaxySim owns the live table; the ids are stable
  // (items 849-871), so a fallback copy keeps the quests working anywhere the
  // star map is not loaded.
  const ANOM_MAT_FALLBACK = {
    arcane: 849, ethereal: 850, quantum: 851, circuit: 852, microchip: 853,
    battery: 854, plastic: 855, resin: 856, nanotube: 857, plant: 858,
    wood: 859, bone: 860, cloth: 861, meat: 862, steel: 863, titanium: 864,
    varlenia: 865, crystal: 866, glass: 867, leather: 868, herb: 869,
    oil: 870, acid: 871,
  };
  function materials() {
    return (window.GalaxySim && window.GalaxySim.MAT) || ANOM_MAT_FALLBACK;
  }
  function matItem(id) { return typeof $dataItems !== "undefined" ? $dataItems[id] : null; }
  function matName(id) {
    const it = matItem(id);
    return it ? String(it.name).trim() : "#" + id;
  }
  function matGive(id, qty) {
    const it = matItem(id);
    if (it && $gameParty && qty > 0) $gameParty.gainItem(it, qty);
  }
  function matOwned(id) {
    const it = matItem(id);
    return (it && $gameParty && $gameParty.numItems) ? $gameParty.numItems(it) : 0;
  }
  function matTake(id, qty) {
    const it = matItem(id);
    if (it && $gameParty && $gameParty.loseItem && qty > 0) $gameParty.loseItem(it, qty);
  }
  // A material a quest can ask for or pay in: a real, named item, never a slot
  // the database left empty ("Empty ..." is the free-row sentinel).
  function matUsable(id) {
    const it = matItem(id);
    return !!(it && it.name && String(it.name).indexOf("Empty ") !== 0);
  }
  // The materials a request quest draws its ask from, by setting: a farm wants
  // wood and cloth, a stranded lander wants titanium and circuitry.
  const ANOM_MAT_EARTH = ["wood", "steel", "cloth", "leather", "plant", "herb",
    "resin", "glass", "plastic", "oil"];   // i18n-ignore-start: MAT keys
  const ANOM_MAT_ALIEN = ["steel", "titanium", "circuit", "microchip", "battery",
    "crystal", "glass", "nanotube", "quantum"];
  // i18n-ignore-end

  const ANOM_FALLBACK_BIOME = "AlienIce";   // i18n-ignore: biome id

  let _anomDB = null, _anomDBLang = null;
  function anomalyDB() {
    const lang = (window.T && T.language) ? T.language() : "en";
    if (_anomDB && _anomDBLang === lang) return _anomDB;
    _anomDB = (window.T && T.obj) ? (T.obj("Anomaly") || {}) : {};
    _anomDBLang = lang;
    return _anomDB;
  }

  // Every line the encounter prints goes out through here, and an i18n entry
  // is written the way the rest of the prose is: {a | b | c} alternates. The
  // reward lines used to reach the card with their braces still on.
  function anomText(key, params) {
    return anomAlt(Math.random, T("Anomaly." + key, params));
  }

  function anomalyBiomeKey(planet) {
    const PT = (window.GalaxySim && window.GalaxySim.PlanetTypes) || {};
    const b = PT[planet && planet.type] && PT[planet.type].biome;
    const db = anomalyDB().biomes || {};
    return (b && db[b]) ? b : ANOM_FALLBACK_BIOME;
  }

  // The pack a session is written out of: the alien surfaces, or Earth's own
  // biomes. Both hang their scenarios off the same `scenarios` map.
  function packOf(session) {
    return session && session.earth ? (anomalyDB().earth || {}) : anomalyDB();
  }
  function biomeEntry(session) {
    const pack = packOf(session);
    return (pack.biomes && pack.biomes[session.biome]) || {};
  }

  // An Earth square can belong to something narrower than its biome: Eris's one
  // square a day, a named place (Paris), a country (France), or the territory of
  // a hyperpower (every country the Holy Vatican Empire holds). That entry, when
  // there is one, owns the square's adventures and its word banks; the biome
  // underneath still contributes its own banks behind it.
  const EARTH_SCOPES = ["eris", "places", "countries", "powers"];   // i18n-ignore: pack section ids
  function exclusiveEntry(session) {
    if (!session || !session.earth || !session.scope) return null;
    const pack = packOf(session);
    const section = pack[session.scope];
    return (section && section[session.scopeId]) || null;
  }
  // Where a session's scenarios and banks come from, narrowest first.
  function contentEntries(session) {
    const out = [];
    const ex = exclusiveEntry(session);
    if (ex) out.push(ex);
    out.push(biomeEntry(session));
    return out;
  }

  // ---- Factions -----------------------------------------------------------
  // Content names a faction by the slug in its Factions.json i18n key
  // ("hexorcistscorp"), which is the only stable id it has: the numeric ids are
  // positional and the display names are translated.
  function factionIndexBySlug(slug) {
    const FDM = window.FactionDataManager && window.FactionDataManager.instance;
    const list = FDM && FDM._factions;
    if (!Array.isArray(list)) return -1;
    const want = String(slug || "").toLowerCase();
    for (let i = 0; i < list.length; i++) {
      const key = String((list[i] && list[i].name) || "");
      const m = /^factions\.([^.]+)\.name$/.exec(key);
      if (m && m[1].toLowerCase() === want) return i;
    }
    return -1;
  }
  function factionDisplayName(index) {
    const FDM = window.FactionDataManager && window.FactionDataManager.instance;
    const entry = FDM && FDM._factions && FDM._factions[index];
    if (!entry) return "";
    return FDM.t ? FDM.t(entry.name) : String(entry.name || "");
  }

  // ---- Knowledge ----------------------------------------------------------
  // Adventures pay Knowledge on the same curve quest contracts do (the star
  // rating is the pay grade, and anything fought along the way is measured
  // against the party's own level), so what an afternoon out here teaches is
  // worth what a board contract of the same weight teaches.
  function anomStars(out) {
    if (out && out.stars > 0) return Math.max(1, Math.min(5, Math.round(out.stars)));
    const mag = out && out.mag;
    if (mag === "large") return 4;
    if (mag === "small") return 1;
    return 2;
  }

  // Which worlds in a system are signalling. Deterministic from the world seed:
  // every system with a landable planet has one, a crowded one can have two.
  const _anomBySystem = {};   // session cache, keyed by system name
  function anomalyPlanetNames(system) {
    const sysKey = String((system && system.name) || "?");
    if (_anomBySystem[sysKey]) return _anomBySystem[sysKey];
    const all = ((system && system.planets) || [])
      .filter((p) => p && p.name && p.type && !p.artificial && !p.noLanding);
    // A world with hand-authored landing sites is a known, documented place
    // (Earth and its spaceports): it only carries the signal if the system has
    // nothing else to hang it on.
    const unknown = all.filter((p) => !(p.landingLocations && p.landingLocations.length));
    const usable = unknown.length ? unknown : all;
    const names = [];
    if (usable.length) {
      const first = Math.floor(seededFloat(sysKey, 6151) * usable.length) % usable.length;
      names.push(usable[first].name);
      if (usable.length >= 5 && seededFloat(sysKey, 6173) < 0.34) {
        const step = 1 + Math.floor(seededFloat(sysKey, 6197) * (usable.length - 1));
        const second = (first + step) % usable.length;
        if (usable[second].name !== names[0]) names.push(usable[second].name);
      }
    }
    _anomBySystem[sysKey] = names;
    return names;
  }

  function anomalyKey(system, body) {
    return String((system && system.name) || "?") + "|" + String((body && body.name) || "?");
  }

  // Answered encounters, keyed by place, on both packs. WorldManager persists
  // this into the world folder (artifacts.json's neighbour, "anomalies"): what
  // happened out there happened to the world, not to the save file.
  function anomalyStore() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return {};
    if (!$gameSystem._gsAnomalies) $gameSystem._gsAnomalies = {};
    return $gameSystem._gsAnomalies;
  }

  // ---- Text ---------------------------------------------------------------
  // The same passes the TV transmissions use: inline {a|b|c} alternation first,
  // then {token} substitution out of the biome's banks. A token resolved once is
  // pinned for the rest of the encounter, so the place the party walked into in
  // the first paragraph is the place they are standing in at the last.
  function anomAlt(rng, text) {
    let s = String(text || "");
    for (let depth = 0; depth < 12; depth++) {
      if (s.indexOf("|") < 0) break;
      const next = s.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, body) => {
        const opts = body.split("|");
        return opts[Math.floor(rng() * opts.length)];
      });
      if (next === s) break;
      s = next;
    }
    return s;
  }

  const ANOM_SOUNDS_VOWEL = /^(hour|honest|honou?r|heir)/i;
  const ANOM_SOUNDS_CONSONANT = /^(uni|use|user|euro|one|once|ubiquit)/i;
  function anomFixIndefinite(text) {
    return String(text).replace(/\b([Aa]n?)(\s+)([A-Za-z][\w'-]*)/g, (m, art, gap, word) => {
      if (word.length > 1 && word === word.toUpperCase()) return m;
      const needsAn = (/^[aeiou]/i.test(word) && !ANOM_SOUNDS_CONSONANT.test(word))
        || ANOM_SOUNDS_VOWEL.test(word);
      if (needsAn === (art.length === 2)) return m;
      const upper = art[0] === "A";
      return (needsAn ? (upper ? "An" : "an") : (upper ? "A" : "a")) + gap + word;
    });
  }

  // Italian fuses a preposition with the article that follows it, and a bank
  // entry carries its own article, so "in la fossa" has to come back as "nella
  // fossa". Obligatory and exceptionless, which is why it is done here instead
  // of asking every written line to guess which token it is about to take.
  const ANOM_IT_PREPS = {
    di: { il: "del", lo: "dello", la: "della", i: "dei", gli: "degli", le: "delle", "l'": "dell'" },
    a: { il: "al", lo: "allo", la: "alla", i: "ai", gli: "agli", le: "alle", "l'": "all'" },
    da: { il: "dal", lo: "dallo", la: "dalla", i: "dai", gli: "dagli", le: "dalle", "l'": "dall'" },
    "in": { il: "nel", lo: "nello", la: "nella", i: "nei", gli: "negli", le: "nelle", "l'": "nell'" },
    su: { il: "sul", lo: "sullo", la: "sulla", i: "sui", gli: "sugli", le: "sulle", "l'": "sull'" },
  };
  function anomFixItalian(text) {
    return String(text).replace(/\b(di|a|da|in|su)\s+(il|lo|la|i|gli|le|l')(?=\s|$|[a-zàèéìòù])/gi, (m, prep, art) => {
      const joined = ANOM_IT_PREPS[prep.toLowerCase()] && ANOM_IT_PREPS[prep.toLowerCase()][art.toLowerCase()];
      if (!joined) return m;
      return prep[0] === prep[0].toUpperCase() ? joined[0].toUpperCase() + joined.slice(1) : joined;
    });
  }

  // A bank entry lands at the head of a sentence as often as not, and a place
  // name written to sit mid-line would otherwise be read out lowercase there.
  function anomCapitalize(text) {
    return String(text).replace(/(^|[^.][.!?]["')\]]?\s+)([a-z])/g, (m, pre, c) => pre + c.toUpperCase());
  }

  function anomTidy(text) {
    return String(text)
      .replace(/\s{2,}/g, " ")
      .replace(/ +([,.;:!?])/g, "$1")
      .replace(/([?!])\.(?!\.)/g, "$1")
      .trim();
  }

  // Narrowest bank first (the place, then the biome), then the pack's own shared
  // bank, then the global one. A country that writes its own {stranger} list
  // therefore replaces the biome's without having to restate anything else.
  function anomBanks(session) {
    const db = anomalyDB();
    const pack = packOf(session);
    const banks = contentEntries(session).map((e) => e.tokens || {});
    banks.push(pack.tokens || {}, db.tokens || {});
    return banks;
  }

  // ---- The party ----------------------------------------------------------
  // An adventure is answered by the people who walked out to it, not by an
  // anonymous "party": every encounter knows who came, and who says what is
  // decided by their own archetype out of PersonalityData.json (the same key
  // PartyBanter reads, so a member sounds the same here as they do on the road).
  //
  //   {leader}   whoever is at the head of the party: the one the choices are
  //              offered to, and whose archetype decides which are offered
  //   {member}   the companion speaking at THIS node, rotated through the rest
  //              of the party so a walk out is not narrated by one voice
  //   {member2}  the next one along, for a line that needs two of them
  //
  // A node may carry `asides`, one line per archetype plus an `any` fallback,
  // which is spoken by whoever {member} is standing in for at that node. A
  // choice may carry `only` / `not`, listing the archetypes the LEADER must (or
  // must not) have for that answer to be on the table: the cautious are offered
  // the way round, the aggressive are offered the door.
  const ANOM_TRAIT_ANY = "any";   // i18n-ignore: fallback key

  function anomTraitOf(actor) {
    if (!actor) return null;
    try {
      if (window.PartyBanter && window.PartyBanter.personalityKey) {
        return window.PartyBanter.personalityKey(actor) || null;
      }
    } catch (e) { /* banter not loaded */ }
    // PartyBanter is the only place that owns the mapping; without it every
    // archetype-gated line falls back to `any`, which every node carries.
    return null;
  }

  // Who is out here, in the order they answer: the leader first, then everybody
  // else. Stored on the session (and so saved with it), because the roster can
  // change between opening an encounter and finishing it.
  function anomCastOf() {
    const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    return members.filter((a) => a && a.name).map((a) => ({
      name: a.name(), trait: anomTraitOf(a),
    }));
  }

  // The companion who speaks at this node. A party of one has nobody to turn
  // to, so the leader answers themselves rather than a name going missing.
  function anomVoiceAt(session, nodeId) {
    const cast = (session && session.cast) || [];
    if (!cast.length) return null;
    const others = cast.length > 1 ? cast.slice(1) : cast;
    const key = String(nodeId || "");
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return {
      speaker: others[h % others.length],
      second: others[(h + 1) % others.length],
      third: others[(h + 2) % others.length],
    };
  }

  // Is this answer on the table for the leader the party has? A choice with
  // neither list is on the table for everybody.
  function anomChoiceAllowed(choice, trait, em) {
    if (!choice) return false;
    if (choice.em && !em) return false;
    if (choice.notEm && em) return false;
    const only = choice.only;
    const not = choice.not;
    if (Array.isArray(only) && only.length) {
      if (!trait || only.indexOf(trait) < 0) return false;
    }
    if (Array.isArray(not) && not.length && trait && not.indexOf(trait) >= 0) return false;
    return true;
  }

  // ---- Skill checks --------------------------------------------------------
  // A choice may put the answer on a die instead of on rails. Content writes:
  //
  //   check: { stat: "DEX", dc: 13 }   a d20 against a difficulty, modified by
  //                                    the leader's own ability
  //   check: { chance: 40 }            a flat percentage, still thrown as a die
  //   pass / fail                      the node each result leads to (either
  //                                    may be omitted; `to` is the default)
  //
  // The die is thrown by Dice3D (the same d20 the trials and the stealing use),
  // across the whole screen, so a gamble reads as a gamble. Headless (the test
  // harness, a build without the dice plugin) the same roll is taken from the
  // session's own stream, which keeps it deterministic there.
  const ANOM_STAT_PARAMS = { STR: 2, CON: 3, INT: 4, WIS: 5, DEX: 6, PSI: 7, LUK: 7 };   // i18n-ignore: stat ids

  function anomCheckOf(choice) {
    const c = choice && choice.check;
    if (!c) return null;
    if (c.chance > 0) {
      return { chance: Math.max(5, Math.min(95, Math.round(c.chance))), stat: null };
    }
    const stat = String(c.stat || "").toUpperCase();
    if (!ANOM_STAT_PARAMS[stat] && !(c.dc > 0)) return null;
    return { stat: ANOM_STAT_PARAMS[stat] ? stat : null, dc: c.dc > 0 ? Math.round(c.dc) : 12 };
  }

  // Who is answering the checks. The leader by default, but the die can be
  // handed to anybody standing there: L1/R1 (or Tab) cycles the quester, the
  // same companion-tab gesture the book-spread menus use, and every check
  // from then on runs on that member's abilities.
  function anomQuester(session) {
    const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    if (!members.length) return null;
    const i = (session && session.questerIndex) || 0;
    return members[((i % members.length) + members.length) % members.length] || members[0];
  }

  // The quester's modifier: the D&D-style ability mod the battle system
  // already derives from the stat (BattleSystemEnhanced), or the same
  // arithmetic done here when that plugin is not up.
  function anomStatMod(session, stat) {
    const pid = ANOM_STAT_PARAMS[stat];
    const who = anomQuester(session);
    if (!pid || !who) return 0;
    if (typeof who.abilityMod === "function") {
      try { return who.abilityMod(pid) || 0; } catch (e) { /* fall through */ }
    }
    const v = (typeof who.param === "function") ? who.param(pid) : 10;
    return Math.floor(((v || 10) - 10) / 2);
  }

  // Throw the die. Resolves to { success, nat20, nat1 }; async because the 3D
  // die takes its time crossing the screen.
  function anomRollCheck(session, check) {
    const statName = check.stat || "";
    const modifier = check.stat ? anomStatMod(session, check.stat) : 0;
    const who = anomQuester(session);
    const D = window.Dice3D;
    if (D && typeof D.rollD20 === "function") {
      const opts = {
        statName,
        actionName: anomText("ui.checkAction",
          { stat: statName || "D20", name: who ? who.name() : "" }),
        force3D: true,
      };
      if (check.chance) return D.rollPercentage(check.chance, opts);
      return D.rollD20(Object.assign(opts, { dc: check.dc, modifier }));
    }
    // Headless: the same d20, thrown out of the session's own stream.
    const rng = anomRng(session);
    const roll = Math.floor(rng() * 20) + 1;
    if (check.chance) {
      const dc = Math.max(2, Math.min(20, 21 - Math.round(check.chance / 5)));
      return Promise.resolve({ roll, success: roll === 20 || (roll !== 1 && roll >= dc), nat20: roll === 20, nat1: roll === 1 });
    }
    const total = roll + modifier;
    const success = roll === 20 || (roll !== 1 && total >= check.dc);
    return Promise.resolve({ roll, total, success, nat20: roll === 20, nat1: roll === 1 });
  }

  // ---- Requests ------------------------------------------------------------
  // A choice may cost something to take: the hand-over quests. Content writes:
  //
  //   give: { material: true, qty: 3 }   qty of the session's own material (the
  //                                      one {material} named in the prose)
  //   give: { mat: "steel", qty: 2 }     a named material out of the table
  //   give: { gold: "small" }            coin, priced like an ending of that
  //                                      magnitude (small | medium | large)
  //
  // A party that cannot cover it sees the row anyway, greyed, with what it
  // would take: knowing what was asked is half the story.
  function anomGoldPrice(tier) {
    const level = anomPartyLevel();
    return Math.round(600 * (ANOM_MAG[tier] || ANOM_MAG.medium) * (1 + level / 24));
  }

  // What a give costs, resolved against the session: { matId, qty } or { gold }.
  // Null when the content asked for something this build cannot price.
  function anomGiveCost(session, give) {
    if (!give) return null;
    if (give.gold) return { gold: anomGoldPrice(give.gold) };
    let matId = 0;
    if (give.material) matId = session.matId || 0;
    else if (give.mat) matId = materials()[String(give.mat)] || 0;
    if (!matId || !matUsable(matId)) return null;
    const qty = give.qty > 0 ? Math.round(give.qty) : (session.matQty || 1);
    return { matId, qty };
  }

  function anomCanAfford(cost) {
    if (!cost) return true;
    if (cost.gold) return !!($gameParty && $gameParty.gold && $gameParty.gold() >= cost.gold);
    return matOwned(cost.matId) >= cost.qty;
  }

  function anomPayCost(cost) {
    if (!cost) return;
    if (cost.gold) {
      if ($gameParty && $gameParty.loseGold) $gameParty.loseGold(cost.gold);
      return;
    }
    matTake(cost.matId, cost.qty);
    if (window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show(anomText("reward.gave",
        { qty: cost.qty, name: matName(cost.matId) }), { severity: "info" });
    }
  }

  // The material a session's request quest is about: picked once, seeded, from
  // the setting's own list, and pinned into the context so {material} in the
  // prose and the cost on the choice row name the same thing.
  function anomPinMaterial(session) {
    const MAT = materials();
    const keys = (session.earth ? ANOM_MAT_EARTH : ANOM_MAT_ALIEN)
      .filter((k) => MAT[k] && matUsable(MAT[k]));
    const all = Object.keys(MAT).filter((k) => matUsable(MAT[k]));
    const pool = keys.length ? keys : all;
    if (!pool.length) return;
    const key = pool[seededHash(session.key, 6053) % pool.length];
    session.matId = MAT[key];
    session.matQty = 2 + (seededHash(session.key, 6079) % 4);
    session.ctx.material = matName(session.matId);
    session.ctx.qty = String(session.matQty);
  }

  // ---- Em -----------------------------------------------------------------
  // The wannabe witch out of the Solomonic Ritual, played from her own dossier
  // (CharacterCreationPresets.js sets switch 48, which is per-savegame, never
  // world-shared). When she is the one out here the adventures are told from
  // where she is standing: ninety-two per cent of her life is in a spear
  // somebody else is holding, romance goes past her without landing, a room
  // reads her as either the woman who sits where God sat or the woman who
  // killed Him, and there is always a spellbook worth more to her than the
  // money. Bubba travels with her and says so, in Texan with Naples in it.
  //
  // A node writes `emText` for what she sees instead of what anybody else
  // would, and `bubba` for what he puts in; a choice writes `em` to be hers
  // alone, or `notEm` to be everybody else's.
  const EM_SWITCH = 48;   // i18n-ignore: switch id, CharacterCreationPresets.js

  function anomIsEm() {
    return !!(typeof $gameSwitches !== "undefined" && $gameSwitches &&
              $gameSwitches.value(EM_SWITCH));
  }

  function anomResolve(session, tpl) {
    const rng = anomRng(session);
    let s = anomAlt(rng, String(tpl || ""));
    const banks = anomBanks(session);
    for (let pass = 0; pass < 6; pass++) {
      let hit = false;
      s = s.replace(/\{(\w+)\}/g, (m, key) => {
        if (session.ctx[key] !== undefined) { hit = true; return session.ctx[key]; }
        // A numbered token ({place2}) draws from the same bank as its base but
        // pins separately, so two different places can stand in one sentence.
        const base = /^([a-z_]+?)\d+$/i.exec(key);
        const bankName = base ? base[1] : key;
        for (const bank of banks) {
          const list = bank[bankName];
          if (Array.isArray(list) && list.length) {
            const v = list[Math.floor(rng() * list.length)];
            session.ctx[key] = v;
            hit = true;
            return v;
          }
        }
        return m;
      });
      if (!hit) break;
      s = anomAlt(rng, s);
    }
    // Anything still unresolved would be read out verbatim.
    s = anomTidy(s.replace(/\{(\w+)\}/g, (m, k) => k.replace(/_/g, " ")));
    const italian = (window.T && T.language && T.language() === "it");
    return anomCapitalize(italian ? anomFixItalian(s) : anomFixIndefinite(s));
  }

  // The encounter's own random stream. Seeded from the world seed and the place,
  // so the same marker always tells the same story, and advanced across the
  // whole encounter (the cursor is saved with the session).
  function anomRng(session) {
    return function () {
      session.roll = (Math.imul(session.roll || 1, 1664525) + 1013904223) >>> 0;
      return session.roll / 4294967296;
    };
  }

  // ---- Rewards ------------------------------------------------------------
  function anomPartyLevel() {
    const m = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    if (!m.length) return 1;
    const lv = m.map((a) => a.level).sort((a, b) => a - b);
    return lv[Math.floor(lv.length / 2)] || 1;
  }

  const ANOM_MAG = { small: 1, medium: 2.4, large: 5 };
  function anomMag(out) { return ANOM_MAG[out && out.mag] || ANOM_MAG.medium; }

  // ---- Level brackets -----------------------------------------------------
  // An anomaly is a side road, never a shortcut: what it pays is priced into
  // the band the party is standing in (1-10, 11-20, 21-30, 31-40, 41 up) and
  // capped there, so a lucky roll at level 3 cannot hand out a fortune, a
  // late-game weapon or a level's worth of experience.
  //   gold / exp / kp  scale the payout, and the caps are the ceiling one
  //                    ending can ever pay, whatever its magnitude
  //   gear             the price window kit is drawn from
  //   mats             how much a haul of materials is worth carrying
  //   relic            what a minted artifact is worth on the counter
  const ANOM_BRACKETS = [
    { max: 10, gold: 0.45, goldCap: 6000, exp: 0.5, expCap: 120, kp: 0.6,
      gear: [100, 1200], mats: 0.6, relic: [15000, 60000] },
    { max: 20, gold: 0.7, goldCap: 18000, exp: 0.7, expCap: 400, kp: 0.8,
      gear: [600, 5000], mats: 0.8, relic: [40000, 200000] },
    { max: 30, gold: 1, goldCap: 45000, exp: 1, expCap: 1000, kp: 1,
      gear: [2000, 14000], mats: 1, relic: [150000, 600000] },
    { max: 40, gold: 1.25, goldCap: 90000, exp: 1.15, expCap: 2000, kp: 1.15,
      gear: [6000, 30000], mats: 1.2, relic: [400000, 1500000] },
    { max: Infinity, gold: 1.5, goldCap: 160000, exp: 1.3, expCap: 3500, kp: 1.25,
      gear: [12000, 60000], mats: 1.4, relic: [800000, 2500000] },
  ];

  function anomBracket(level) {
    const lv = level != null ? level : anomPartyLevel();
    for (let i = 0; i < ANOM_BRACKETS.length; i++) {
      if (lv <= ANOM_BRACKETS[i].max) return ANOM_BRACKETS[i];
    }
    return ANOM_BRACKETS[ANOM_BRACKETS.length - 1];
  }

  // The one place coin is priced. `base` is what the ending is worth at the
  // middle of the band; the party's level tilts it inside the band, the
  // bracket scales it, and the bracket's cap is the last word.
  function anomGoldPayout(base, mag) {
    const level = anomPartyLevel();
    const b = anomBracket(level);
    const raw = base * mag * (1 + level / 24) * b.gold;
    return Math.max(1, Math.min(b.goldCap, Math.round(raw)));
  }

  function anomPayGold(base, mag, lines) {
    const gold = anomGoldPayout(base, mag);
    if ($gameParty) $gameParty.gainGold(gold);
    anomGoldLine(lines, gold);
    return gold;
  }

  // ---- Reward lines -------------------------------------------------------
  // A payout is a list of things, not a paragraph, so every line it pays out
  // carries the IconSet cell it is drawn with and reads the way a pocket reads
  // in the backpack (ItemSystem/ItemSystemInventoryUI.js): the icon, the
  // label, and the count on the right where there is one. Anything that only
  // wants the words - the diary, the toasts, a panel with no icons to draw -
  // unwraps a line with anomLineText, and a bare string is still a valid line.
  const REWARD_ICON = {
    artifact: 245, gear: 96, materials: 209, gold: 191, schrodingerite: 158,
    exp: 87, harm: 6, heal: 176, battle: 322, knowledge: 189,
    reputation: 145, reputationLost: 282, failed: 282, minigame: 196,
    crime: 111, augment: 339, needs: 219, skill: 186, eris: 84,
  };

  function anomLine(key, text, opts) {
    const o = opts || {};
    return {
      icon: Number(o.icon != null ? o.icon : REWARD_ICON[key]) || 0,
      text: String(text || ""),
      count: o.count != null ? String(o.count) : "",
    };
  }

  // One reward line, built out of the pack's own wording: `key` names both the
  // i18n entry (reward.<key>) and the icon it wears.
  function anomReward(lines, key, params, opts) {
    lines.push(anomLine(key, anomText("reward." + key, params || {}), opts));
    return lines;
  }

  function anomLineText(line) {
    if (!line) return "";
    return (typeof line === "object") ? String(line.text || "") : String(line);
  }

  function anomLineIcon(line) {
    return (line && typeof line === "object" && line.icon != null) ? Number(line.icon) || 0 : 0;
  }

  function anomLineCount(line) {
    return (line && typeof line === "object" && line.count) ? String(line.count) : "";
  }

  // Coin is paid out often enough, and always the same way, to be worth its
  // own line: the pack's wording, and the amount on the right in the same
  // euro chip a hand-over row wears.
  function anomGoldLine(lines, gold) {
    const amount = (gold / 100).toFixed(2);
    return anomReward(lines, "gold", { amount: amount },
      { count: anomText("ui.goldChip", { amount: amount }) });
  }

  // The free row in the artifact band (items 1501-1600). "Empty ..." is the
  // sentinel ArctifactGenerator writes into an unused slot; a row the history
  // simulator or the generator has already claimed is never overwritten.
  function anomFreeArtifactId() {
    if (typeof $dataItems === "undefined") return 0;
    for (let id = 1501; id <= 1600; id++) {
      const it = $dataItems[id];
      if (!it || (typeof it.name === "string" && it.name.indexOf("Empty ") === 0)) return id;
    }
    return 0;
  }

  // Mint a relic and file it with the world's own artifacts, so it survives in
  // the world folder (artifacts.json) exactly like a historical one.
  function anomMakeArtifact(session) {
    const id = anomFreeArtifactId();
    if (!id) return null;
    const rng = anomRng(session);
    const pick = (bank) => {
      const list = (anomalyDB().relic && anomalyDB().relic[bank]) || [];
      return list.length ? list[Math.floor(rng() * list.length)] : "";
    };
    const name = anomText("relic.nameTemplate", {
      prefix: pick("prefix"), noun: pick("noun"), of: session.placeName,
    });
    const item = {
      id,
      name,
      description: anomText(session.earth ? "relic.descriptionEarth" : "relic.description",
        { planet: session.placeName }),
      note: "<Category: Artifact>\n<Procedural: true>",   // i18n-ignore: note tags
      iconIndex: 245,
      price: (function () {
        const band = anomBracket().relic;
        return band[0] + Math.floor(rng() * (band[1] - band[0]));
      })(),
      itypeId: 1,
      consumable: false,
      occasion: 3,
      scope: 0,
      effects: [],
      params: [0, 0, 0, 0, 0, 0, 0, 0],
      isGenerated: true,
    };
    $dataItems[id] = item;
    // File it with the world's artifacts (HistorySimulator re-injects this list
    // on every load, and WorldManager persists it into the world folder).
    const gen = ($gameSystem._generatedArtifacts =
      $gameSystem._generatedArtifacts || { items: [], weapons: [], armors: [] });
    if (!Array.isArray(gen.items)) gen.items = [];
    gen.items.push(item);
    if (window.WorldManager && window.WorldManager.setField) {
      window.WorldManager.setField("artifacts", "generated", gen);
    }
    if ($gameParty) $gameParty.gainItem(item, 1);
    return item;
  }

  // A piece of kit off the shelf, priced into the party's league.
  function anomRandomGear(session, kind) {
    const db = kind === "armor" ? $dataArmors : $dataWeapons;
    if (!db) return null;
    const band = anomBracket().gear;
    const lo = band[0], hi = band[1];
    const pool = [];
    for (let i = 1; i < db.length && i < 1501; i++) {
      const e = db[i];
      if (window.ItemSystemUtils && window.ItemSystemUtils.isRestrictedEntry(e)) continue;
      if (e && e.name && e.price >= lo && e.price <= hi) pool.push(e);
    }
    if (!pool.length) return null;
    const rng = anomRng(session);
    const gear = pool[Math.floor(rng() * pool.length)];
    if ($gameParty) $gameParty.gainItem(gear, 1);
    return gear;
  }

  function anomGiveMaterials(session, kinds, qty) {
    const rng = anomRng(session);
    const MAT = materials();
    const ids = Object.keys(MAT).map((k) => MAT[k]);
    if (!ids.length) return [];
    const out = [];
    const used = {};
    for (let i = 0; i < kinds; i++) {
      let id = ids[Math.floor(rng() * ids.length)];
      if (used[id]) continue;
      used[id] = true;
      const n = Math.max(1, qty + Math.floor(rng() * qty));
      matGive(id, n);
      out.push(matName(id) + " x" + n);
    }
    return out;
  }

  // ---- Taught skills ------------------------------------------------------
  // The reward some quests pay in: a skill or a spell, taught on the spot to
  // whoever is holding the die. The pool is every skill nobody in the party
  // knows yet - the esoteric book alone (ids 1400 up, the menu-cast spells)
  // when the ending says `pool: "esoteric"`, the whole book otherwise - and
  // never one tagged <Forbidden>, which are not handed out in lay-bys.
  const ANOM_ESOTERIC_FLOOR = 1400;

  function anomPickSkill(session, pool) {
    if (typeof $dataSkills === "undefined" || !$dataSkills) return null;
    const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    const known = new Set();
    members.forEach((a) => {
      if (typeof a.skills !== "function") return;
      try { a.skills().forEach((s) => { if (s) known.add(s.id); }); } catch (e) { /* stubs */ }
    });
    // The whole book starts past the basics (attack, guard and their kin).
    const from = pool === "esoteric" ? ANOM_ESOTERIC_FLOOR : 11;   // i18n-ignore: pool id
    const candidates = [];
    for (let i = from; i < $dataSkills.length; i++) {
      const s = $dataSkills[i];
      if (!s || !s.name || known.has(s.id)) continue;
      if (/<Forbidden>/i.test(s.note || "")) continue;   // i18n-ignore: note tag
      candidates.push(s);
    }
    if (!candidates.length) return null;
    const rng = anomRng(session);
    return candidates[Math.floor(rng() * candidates.length)];
  }

  // ---- Needs --------------------------------------------------------------
  // An afternoon that does the party good rather than paying them: a bath house,
  // a long meal, an evening somebody else organised. The meters belong to
  // TimeDateSystem (hunger and sleep on the actor, hygiene/social/leisure
  // through PartyNeeds, which knows where a recruited companion keeps theirs),
  // so an ending only says how much of what, in percentage points.
  const ANOM_NEED_MAX = 100;
  function anomApplyNeeds(out, lines) {
    const needs = out && out.needs;
    if (!needs) return;
    const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    const filled = [];
    Object.keys(needs).forEach((key) => {
      const pct = Number(needs[key]) || 0;
      if (!pct) return;
      if (key === "hunger" || key === "sleep") {   // i18n-ignore: need ids
        const max = (window.TimeDateSystem &&
          (key === "hunger" ? window.TimeDateSystem.maxHunger : window.TimeDateSystem.maxSleep)) || ANOM_NEED_MAX;
        const amount = max * (pct / 100);
        members.forEach((a) => {
          const fn = key === "hunger" ? a.addHunger : a.addSleep;
          if (typeof fn === "function") fn.call(a, amount);
        });
      } else if (window.PartyNeeds && window.PartyNeeds.addNeedToAll) {
        const max = (window.TimeDateSystem && window.TimeDateSystem.maxNeed) || ANOM_NEED_MAX;
        window.PartyNeeds.addNeedToAll(key, max * (pct / 100));
      } else {
        return;
      }
      const label = (window.PartyNeeds && window.PartyNeeds.LABELS &&
        window.PartyNeeds.LABELS[key]) || key;
      filled.push(label);
    });
    if (filled.length) anomReward(lines, "needs", { list: filled.join(", ") });
  }

  // ---- Crime --------------------------------------------------------------
  // An ending the party is answerable for. `crime` names a key out of
  // js/db/Messages/PresetCrimes.json and the charge is filed exactly as it would
  // be if they had done it in front of a shopkeeper: the bounty, the heat, the
  // Streetwise discount and the record all belong to CrimeSystem, which is the
  // only place that knows what a burglary is worth this week.
  function anomApplyCrime(out, lines) {
    const raw = out && out.crime;
    if (!raw) return;
    const keys = Array.isArray(raw) ? raw : [raw];
    keys.forEach((key) => {
      const CS = window.CrimeSystem;
      const preset = (window.PresetCrimes || {})[key];
      if (!CS || !preset) return;
      CS.addPresetCrime(key);
      const name = CS.presetCrimeName ? CS.presetCrimeName(key) : preset.name;
      anomReward(lines, "crime", { crime: name });
    });
  }

  // ---- Augments -----------------------------------------------------------
  // Some endings leave somebody changed. The augment is fitted through the
  // prosthetic shop's own installer (stat effects, learned skills, the lot), so
  // an implant handed out in a cellar is the same object the clinic sells.
  function anomAugmentPart(key) {
    const table = (window.Health && window.Health.ProstheticCompatibility) || null;
    if (!table) return null;
    const parts = Object.keys(table);
    for (let i = 0; i < parts.length; i++) {
      const list = table[parts[i]];
      if (Array.isArray(list) && list.indexOf(key) >= 0) return parts[i];
    }
    return null;
  }

  function anomAugmentName(key) {
    const types = (window.Health && window.Health.ProstheticTypes) || {};
    const entry = types[key];
    if (!entry) return String(key);
    if (entry.name_int && window.T && T.has && T.has(entry.name_int)) return T(entry.name_int);
    return entry.name_en || String(key);
  }

  // Who gets it: the leader by default, the companion standing next to them
  // when the ending says so ("who": "member"), which is who the prose named.
  function anomAugmentTarget(session, out) {
    const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    if (!members.length) return null;
    if (out && out.who === "member" && members.length > 1) {   // i18n-ignore: outcome field value
      const name = session && session.ctx ? session.ctx.member : null;
      const found = members.filter((a) => a && a.name() === name)[0];
      return found || members[1];
    }
    return members[0];
  }

  function anomApplyAugment(session, out, lines) {
    const raw = out && out.augment;
    if (!raw) return false;
    const shop = window.ProstheticShop;
    const list = Array.isArray(raw) ? raw : [raw];
    const rng = anomRng(session);
    const key = list[Math.floor(rng() * list.length)];
    const types = (window.Health && window.Health.ProstheticTypes) || {};
    const actor = anomAugmentTarget(session, out);
    const part = out.part || anomAugmentPart(key);
    if (!shop || !shop.installImplant || !types[key] || !actor || !part) return false;
    try {
      shop.installImplant(actor, part, key);
    } catch (e) {
      console.error("[ProceduralAdventure] augment failed", e);
      return false;
    }
    anomReward(lines, "augment", { name: anomAugmentName(key), who: actor.name() });
    return true;
  }

  // Standing moved by an ending. `rep` is { slug: delta }, so one ending can
  // please the Hexorcists and cost the party the Guild in the same breath.
  function anomApplyReputation(out, lines) {
    const rep = out && out.rep;
    if (!rep || typeof $gameFactions === "undefined" || !$gameFactions) return;
    Object.keys(rep).forEach((slug) => {
      const delta = Math.round(Number(rep[slug]) || 0);
      if (!delta) return;
      const index = factionIndexBySlug(slug);
      if (index < 0) return;
      $gameFactions.changeReputation(index, delta);
      const name = factionDisplayName(index) || slug;
      anomReward(lines, delta > 0 ? "reputation" : "reputationLost",
        { faction: name, amount: Math.abs(delta) });
    });
  }

  // ---- Eris -----------------------------------------------------------------
  // An ending she took an interest in. The evening it used to open is not
  // played any more; what is left of it is the only durable part, her own
  // ledger on whoever was holding the die (window.ErisRelations, kept per
  // companion by name in Economy/ErisDateSystem.js). `eris` on the outcome
  // says how many points by hand; a date ending with nothing said moves it by
  // what the ending was worth.
  function anomErisPoints(out) {
    if (out && out.eris != null) return Math.round(Number(out.eris) || 0);
    return Math.max(1, Math.round(anomStars(out) * anomMag(out) / 2));
  }

  function anomApplyEris(session, out, lines) {
    // She was beaten in this world: there is nobody left to think better of
    // anybody, and no heart is moved.
    if (erisGone()) return false;
    const R = window.ErisRelations;
    const who = anomQuester(session);
    if (!R || !R.change || !who) return false;
    const delta = anomErisPoints(out);
    if (!delta) return false;
    R.change(who.name(), delta);
    anomReward(lines, "eris", { who: who.name(), amount: Math.abs(delta) },
      { count: (delta > 0 ? "+" : "") + delta });
    return true;
  }

  // Knowledge, on the quest curve. Anything the ending had the party fight is
  // priced into it, which is why a battle ending teaches more than a walk.
  function anomAwardKnowledge(out, lines) {
    if (!window.KnowledgePoints || typeof $gameSystem === "undefined" || !$gameSystem) return;
    if (!$gameSystem.addKnowledge) return;
    if (out && out.kp === 0) return;
    const levels = [];
    if (out && out.enemyLevel > 0) levels.push(out.enemyLevel);
    let kp = out && out.kp > 0
      ? Math.round(out.kp)
      : window.KnowledgePoints.forQuest(anomStars(out), levels, anomPartyLevel());
    kp = Math.round(kp * anomBracket().kp);
    if (!(kp > 0)) return;
    $gameSystem.addKnowledge(kp);
    anomReward(lines, "knowledge", { kp: kp }, { count: "+" + kp });
  }

  // Everything a terminal node can hand over. Returns the lines the panel and
  // the toasts read out; a battle instead arms the handover (see startBattle).
  function anomApplyOutcome(session, out) {
    const lines = [];
    const kind = (out && out.kind) || "none";
    const mag = anomMag(out);
    const level = anomPartyLevel();
    const spec = (name, pts) => {
      if (window.SpecializationXP) window.SpecializationXP.award(name, pts);
    };

    if (kind === "artifact") {
      const item = anomMakeArtifact(session);
      if (item) {
        anomReward(lines, "artifact", { name: item.name }, { icon: item.iconIndex });
      } else {
        // The artifact band (items 1501-1600) is full: pay the ending out in
        // kit and coin rather than leaving the party with a story and nothing.
        const gear = anomRandomGear(session, "weapon");
        if (gear) anomReward(lines, "gear", { name: gear.name }, { icon: gear.iconIndex });
        anomPayGold(1800, mag, lines);
      }
      spec(session.earth ? "Archaeology" : "UFOlogy", 3);   // i18n-ignore: specialization id
      spec("Anthropology", 2);       // i18n-ignore: specialization id
    } else if (kind === "gear") {
      const gear = anomRandomGear(session, out.slot === "armor" ? "armor" : "weapon");
      if (gear) anomReward(lines, "gear", { name: gear.name }, { icon: gear.iconIndex });
      spec("Survival", 2);           // i18n-ignore: specialization id
    } else if (kind === "schrodingerite") {
      const dm = $gameSystem && $gameSystem.starMapData;
      const units = Math.max(1, Math.round(mag / 2));
      if (dm && dm.getSchrodingerite) dm.setSchrodingerite(dm.getSchrodingerite() + units);
      anomReward(lines, "schrodingerite", { units: units }, { count: "×" + units });
      spec("Quantum Cryptography", 2);   // i18n-ignore: specialization id
    } else if (kind === "loot") {
      const mats = anomGiveMaterials(session, Math.max(1, Math.round(mag / 1.6)),
        Math.max(1, Math.round(2 * mag * anomBracket(level).mats)));
      if (mats.length) anomReward(lines, "materials", { list: mats.join(", ") });
      spec("Survival", 2);           // i18n-ignore: specialization id
    } else if (kind === "gold") {
      anomPayGold(900, mag, lines);
    } else if (kind === "harm") {
      const pct = Math.min(0.6, 0.08 * mag);
      ($gameParty ? $gameParty.members() : []).forEach((a) => {
        a.setHp(Math.max(1, Math.floor(a.hp - a.mhp * pct)));
      });
      anomReward(lines, "harm", { pct: Math.round(pct * 100) });
    } else if (kind === "heal") {
      ($gameParty ? $gameParty.members() : []).forEach((a) => {
        a.setHp(a.mhp); a.setMp(a.mmp); a.clearStates();
      });
      anomReward(lines, "heal");
    } else if (kind === "skill") {
      // Somebody out here teaches the quester something. `pool: "esoteric"`
      // draws from the menu-cast spells (ids 1400 up); anything else draws
      // from the whole book. Always something nobody in the party knows, never
      // a <Forbidden> one; a database with nothing left to teach pays in coin.
      const skill = anomPickSkill(session, out.pool);
      const who = anomQuester(session);
      if (skill && who && typeof who.learnSkill === "function") {
        who.learnSkill(skill.id);
        anomReward(lines, "skill", { who: who.name(), name: skill.name },
          { icon: skill.iconIndex });
      } else {
        anomPayGold(1200, mag, lines);
      }
      spec("Anthropology", 2);       // i18n-ignore: specialization id
    } else if (kind === "needs") {
      // The whole of the ending is what it did for everybody: applied below,
      // with nothing else attached.
      spec("Survival", 1);           // i18n-ignore: specialization id
    } else if (kind === "augment") {
      // Nobody fitted it, or the augment is not one this build ships: the
      // ending still pays, in the coin the party can carry out of a cellar.
      if (!anomApplyAugment(session, out, lines)) {
        anomPayGold(1200, mag, lines);
      }
      spec("Cybernetics", 3);        // i18n-ignore: specialization id
    }

    // Any ending at all may leave the party answerable for something, may leave
    // somebody carrying new hardware, and may simply have done everybody good.
    if (kind !== "augment" && out && out.augment) anomApplyAugment(session, out, lines);
    anomApplyNeeds(out, lines);
    anomApplyCrime(out, lines);

    // Every ending teaches the away team something, even the empty ones.
    const expBand = anomBracket(level);
    const exp = Math.min(expBand.expCap,
      Math.round((out && out.exp != null ? out.exp : 10) * mag * level * expBand.exp));
    if (exp > 0 && $gameParty) {
      $gameParty.allMembers().forEach((a) => a.gainExp(exp));
      anomReward(lines, "exp", { exp: exp }, { count: "+" + exp });
    }
    // What was worked out down there is worth Knowledge as well as levels: the
    // skill masters charge KP for everything they teach, and an afternoon spent
    // on something nobody has written up is exactly how it is earned.
    anomAwardKnowledge(out, lines);
    anomApplyReputation(out, lines);
    // Any ending at all may be one she heard about, the same way any ending
    // may move a faction's standing. The date endings go through anomArm.
    if (kind !== "date" && out && out.eris != null) anomApplyEris(session, out, lines);
    if (kind === "none") spec(session.earth ? "Survival" : "Astrobiology", 1);   // i18n-ignore: specialization id
    return lines;
  }

  // ---- Handovers ----------------------------------------------------------
  // Two endings finish somewhere this engine cannot reach from where it is
  // standing: a fight (which cannot start inside the star map) and a minigame.
  // Each arms a pending handover, and the presenter runs it once the last
  // message has closed. An ending that interests Eris is not one of them any
  // more: it is settled here, on her ledger (anomApplyEris).
  let _anomPendingBattle = null;
  let _anomPendingMinigame = null;
  let _anomMinigameSettle = null;   // a contest being played right now

  // An ending that was not reached: the party ran, or the party lost. It pays
  // what the node's `fail` says (an ordinary outcome, usually harm or a
  // standing lost) and never pays what winning promised.
  function anomApplyFailure(session, out) {
    const fail = out && out.fail;
    const lines = [anomLine("failed", anomText("reward.failed"))];
    if (fail && typeof fail === "object") {
      // The failure branch is an outcome in its own right, minus its own
      // experience: nothing was learned that the walk back did not teach.
      anomApplyOutcome(session, Object.assign({ exp: 0, kp: 0 }, fail))
        .forEach((l) => lines.push(l));
    }
    if (session) session.failed = true;
    return lines;
  }

  // ---- Minigames ----------------------------------------------------------
  // The scene each `game` id opens, looked up late: a minigame plugin that is
  // switched off simply is not there, and the ending falls back to paying out.
  const ANOM_MINIGAMES = {   // i18n-ignore-start: minigame ids and scene names
    bowling: "Scene_BowlingMinigame",
    pool: "Scene_Pool",
    chess: "Scene_Chess",
    basketball: "Scene_BasketballMinigame",
    target: "Scene_TargetRange",
    fishing: "Scene_FishingMinigame",
    surfing: "Scene_SurfingGame",
    // The phone's falling-block puzzle lives inside HexphoneSystem now, which
    // is not a scene that can be handed a contest: the falling-block game that
    // can is the lockpicking one, and it reports through MinigameFun like the
    // rest.
    blocks: "Scene_UnlockingBlocks",
    cards: "Scene_Tarot",
    horses: "Scene_HorseRace",
  };   // i18n-ignore-end

  function minigameScene(game) {
    const name = ANOM_MINIGAMES[game];
    const ctor = name ? window[name] : null;
    return (typeof ctor === "function") ? ctor : null;
  }

  // How the party did, read off the shared MinigameFun hook every minigame in
  // the game already calls on its way out. Wrapping it is what lets one engine
  // score bowling, chess, the range and the rest without knowing anything about
  // any of them. The FIRST decisive call is the answer, so a fishing trip that
  // lands a second fish does not overwrite the first.
  let _anomMinigameResult = null;   // "won" | "lost" | "draw"
  let _anomMinigameHook = null;

  function hookMinigameResult() {
    const MF = window.MinigameFun;
    if (!MF || _anomMinigameHook) return;
    _anomMinigameResult = null;
    _anomMinigameHook = { won: MF.won, lost: MF.lost, draw: MF.draw };
    ["won", "lost", "draw"].forEach((kind) => {   // i18n-ignore: result ids
      MF[kind] = function () {
        if (_anomMinigameResult === null) _anomMinigameResult = kind;
        return _anomMinigameHook[kind].apply(this, arguments);
      };
    });
  }

  function unhookMinigameResult() {
    const MF = window.MinigameFun;
    if (MF && _anomMinigameHook) {
      MF.won = _anomMinigameHook.won;
      MF.lost = _anomMinigameHook.lost;
      MF.draw = _anomMinigameHook.draw;
    }
    _anomMinigameHook = null;
    const result = _anomMinigameResult;
    _anomMinigameResult = null;
    return result;
  }

  // A synthetic troop of 1-3 of whatever lives out here, picked from the enemies
  // whose <Level:> sits nearest the party's own. Session-local: $dataTroops is
  // rebuilt from the database on every load, so nothing is persisted.
  function anomBuildTroop(session, count) {
    if (typeof $dataEnemies === "undefined" || typeof $dataTroops === "undefined") return 0;
    const level = anomPartyLevel();
    const lvOf = (e) => (window.BSE && window.BSE.Helpers)
      ? (window.BSE.Helpers.getEnemyLevel(e.note) || 0) : 0;
    const pool = [];
    for (let i = 1; i < $dataEnemies.length; i++) {
      const e = $dataEnemies[i];
      if (!e || !e.name || !e.battlerName) continue;
      const lv = lvOf(e);
      if (lv > 0 && Math.abs(lv - level) <= Math.max(6, level * 0.25)) pool.push(i);
    }
    if (!pool.length) {
      for (let i = 1; i < $dataEnemies.length; i++) {
        if ($dataEnemies[i] && $dataEnemies[i].battlerName) pool.push(i);
      }
    }
    if (!pool.length) return 0;
    const rng = anomRng(session);
    const enemyId = pool[Math.floor(rng() * pool.length)];
    // The stage shows what is about to be fought, over the terminal node.
    const foe = $dataEnemies[enemyId];
    session.stageEnemy = { name: foe.name, battlerName: foe.battlerName };
    const n = Math.max(1, Math.min(3, count || 1));
    const members = [];
    for (let m = 0; m < n; m++) {
      members.push({ enemyId, x: 320 + m * 180, y: 300, hidden: false });
    }
    const troopId = $dataTroops.length;
    $dataTroops.push({ id: troopId, members, name: $dataEnemies[enemyId].name, pages: [] });
    return troopId;
  }

  // A terminal node, resolved. Most endings pay out here and now; the three
  // that finish somewhere else arm their handover and say so, and the presenter
  // runs it once the prose has been read.
  function anomArm(session, outcome) {
    if (!outcome) return [];
    if (outcome.kind === "battle") {
      const troopId = anomBuildTroop(session, outcome.count);
      if (troopId) {
        _anomPendingBattle = { troopId, outcome, key: session.key };
        return [anomLine("battle", anomText("reward.battle"))];
      }
      // No enemy could be built (a database this thin should not happen, but an
      // ending has to pay out something).
      return anomApplyOutcome(session, Object.assign({}, outcome,
        { kind: outcome.reward || "loot" }));
    }
    if (outcome.kind === "minigame") {
      if (minigameScene(outcome.game)) {
        _anomPendingMinigame = { outcome, key: session.key };
        return [anomLine("minigame", anomText("reward.minigame"))];
      }
      // The minigame is not installed: the contest is taken as won, since the
      // party was never given the chance to lose it.
      return anomApplyOutcome(session, Object.assign({}, outcome,
        { kind: outcome.reward || "gold" }));
    }
    if (outcome.kind === "date") {
      // The evening itself is no longer played out here: an encounter that
      // ends with her interested pays what it was going to pay and leaves the
      // rest on her ledger, which is the only part of it that lasts anyway.
      const lines = anomApplyOutcome(session, Object.assign({}, outcome,
        { kind: outcome.reward || "none" }));
      anomApplyEris(session, outcome, lines);
      return lines;
    }
    if (outcome.kind === "reputation") {
      return anomApplyOutcome(session, Object.assign({}, outcome, { kind: "none" }));
    }
    return anomApplyOutcome(session, outcome);
  }

  // ---- The encounter itself ----------------------------------------------
  // The adventures a square can tell, narrowest first: what its place, country
  // or hyperpower wrote, and the biome's own only when nothing narrower did.
  function anomScenarioList(session) {
    const db = anomalyDB();
    const pack = packOf(session);
    let list = null;
    for (const entry of contentEntries(session)) {
      if (entry.scenarios && entry.scenarios.length) { list = entry.scenarios; break; }
    }
    if (!list) list = pack.fallbackScenarios || [];
    return list.filter((id) => db.scenarios && db.scenarios[id]);
  }

  // The rolling quests: request-and-check adventures written once, with the
  // banks doing the work, so every square can carry one. Each pack names its
  // own set (`procScenarios`), voiced for its setting. A square with a bespoke
  // story (a place, a country, a power, Eris) keeps it; a plain biome square
  // rolls between its biome's adventure and a quest, seeded, so roughly half
  // the "???" on any world are somebody wanting something.
  function anomQuestList(session) {
    const db = anomalyDB();
    const list = packOf(session).procScenarios || [];
    return list.filter((id) => db.scenarios && db.scenarios[id]);
  }

  function anomScenarioFor(session) {
    const usable = anomScenarioList(session);
    const quests = (!session.scope) ? anomQuestList(session) : [];
    let pool = usable;
    if (quests.length && (!usable.length || seededFloat(session.key, 9241) < 0.45)) {
      pool = quests;
    }
    if (!pool.length) return null;
    const idx = Math.floor(seededFloat(session.key, 7717) * pool.length) % pool.length;
    return pool[idx];
  }

  // The line the encounter opens on, ahead of the scenario's own first
  // paragraph: where the party is standing, what the weather is doing, who else
  // is about. Written per biome and per place, drawn from the same banks and
  // resolved through the same passes, so the same adventure played on two
  // squares does not open the same way twice.
  function anomOpener(session) {
    let bank = null;
    for (const entry of contentEntries(session)) {
      if (Array.isArray(entry.openers) && entry.openers.length) { bank = entry.openers; break; }
    }
    if (!bank) {
      const pack = packOf(session);
      bank = Array.isArray(pack.openers) ? pack.openers : null;
    }
    if (!bank || !bank.length) return "";
    const rng = anomRng(session);
    return anomResolve(session, bank[Math.floor(rng() * bank.length)]);
  }

  // Resolve the node the session is sitting on into the panel's view. Resolved
  // once and cached on the session, so a re-render never re-rolls the prose.
  function anomBuildView(session) {
    const db = anomalyDB();
    const sc = db.scenarios && db.scenarios[session.scenario];
    const node = sc && sc.nodes && sc.nodes[session.node];
    if (!node) {
      session.view = { title: session.placeName, text: anomText("ui.signalLost"), choices: [], done: true };
      return session.view;
    }
    // Who is standing at the leader's shoulder for this node, and what kind of
    // person they are. Pinned into the context before the prose is resolved, so
    // {member} in the text and the aside underneath it name the same companion.
    if (!session.cast) {
      // A session opened before the party was written into it (an older save).
      session.cast = anomCastOf();
      session.leaderTrait = session.cast.length ? session.cast[0].trait : null;
    }
    const voice = anomVoiceAt(session, session.node);
    if (voice) {
      session.ctx.member = voice.speaker.name;
      session.ctx.member2 = voice.second.name;
      session.ctx.member3 = voice.third.name;
    }
    const em = session.em === undefined ? anomIsEm() : !!session.em;
    let text = anomResolve(session, (em && node.emText) ? node.emText : node.text);
    // Bubba is not a companion the party picked up: he is hers, and he talks
    // over the top of anything he feels like talking over the top of.
    if (em && node.bubba) text += "\n" + anomResolve(session, node.bubba);
    // What that companion makes of it, in their own register. A node writes one
    // line per archetype it has something particular to say for, and an `any`
    // line for everybody else.
    const asides = node.asides;
    if (asides) {
      const trait = voice ? voice.speaker.trait : null;
      const line = (trait && asides[trait]) || asides[ANOM_TRAIT_ANY];
      if (line) text += "\n" + anomResolve(session, line);
    }
    if (session.node === sc.start) {
      // Resolved once and pinned: a re-render of the opening node (a reload, a
      // panel redraw) must not roll a different afternoon.
      if (session.opener === undefined) session.opener = anomOpener(session);
      if (session.opener) text = session.opener + "\n" + text;
    }
    const view = {
      title: session.title || anomResolve(session, sc.title || ""),
      text,
      choices: [],
      done: !!node.outcome,
      rewards: [],
    };
    session.title = view.title;
    if (node.outcome) {
      view.rewards = session.rewards || [];
    } else {
      // What the party can answer depends on who is leading them: the timid are
      // not offered the fight, the aggressive are not offered the apology. What
      // survives the filter IS the branch list from here on (Anomaly.choose
      // reads the view), and a leader whose archetype would leave nothing to
      // say at all is offered everything rather than a dead end.
      const trait = session.leaderTrait || null;
      const all = node.choices || [];
      let usable = all.filter((c) => anomChoiceAllowed(c, trait, em));
      if (!usable.length) usable = all;
      // Each row carries what taking it involves, out in the open: the die it
      // would throw (stat and DC, or the flat odds) and what it would cost to
      // hand over. A row the party cannot cover is shown greyed with the price
      // on it rather than hidden: what was asked is half the story.
      view.choices = usable.map((c) => {
        const row = { text: anomResolve(session, c.text), to: c.to };
        const check = anomCheckOf(c);
        if (check) {
          row.check = check;
          if (c.pass) row.pass = c.pass;
          if (c.fail) row.fail = c.fail;
        }
        const cost = anomGiveCost(session, c.give);
        if (c.give && !cost) row.broken = true;   // asked for something unpriceable
        if (cost) {
          row.cost = cost;
          row.costLabel = cost.gold
            ? anomText("ui.goldChip", { amount: (cost.gold / 100).toFixed(2) })
            : anomText("ui.needChip", { qty: cost.qty, name: matName(cost.matId) });
          if (!anomCanAfford(cost)) {
            row.locked = true;
            if (!cost.gold) {
              row.costLabel += " " + anomText("ui.haveChip", { have: matOwned(cost.matId) });
            }
          }
        }
        return row;
      }).filter((row) => !row.broken);
    }
    session.view = view;
    return view;
  }

  // Open a session on a key that has never been answered. Marks the place the
  // moment it is opened, not when it ends, which is what makes the answer final:
  // walking out of the encounter is one of the ways to answer it.
  function anomOpen(session) {
    const db = anomalyDB();
    session.cast = anomCastOf();
    session.leaderTrait = session.cast.length ? session.cast[0].trait : null;
    session.ctx.leader = session.cast.length ? session.cast[0].name : "";
    session.em = anomIsEm();
    session.scenario = anomScenarioFor(session);
    if (!session.scenario) return null;
    // Pinned before the first node resolves, so a quest's prose and its
    // hand-over rows agree on what is being asked for.
    anomPinMaterial(session);
    const sc = db.scenarios[session.scenario];
    session.node = sc.start || Object.keys(sc.nodes || {})[0];
    anomalyStore()[session.key] = { started: true };
    $gameSystem._gsAnomalySession = session;
    anomBuildView(session);
    return session;
  }

  const Anomaly = {
    // Is this body the one signalling in its system?
    isAnomalous(system, body) {
      if (!system || !body || !body.name) return false;
      return anomalyPlanetNames(system).indexOf(body.name) >= 0;
    },
    key: anomalyKey,
    // Answered, whichever way it went.
    isResolved(system, body) {
      const rec = anomalyStore()[anomalyKey(system, body)];
      return !!(rec && rec.done);
    },
    // The "?" and the Investigate button both follow this: a world that has
    // never been touched, or the one the party is halfway through. An encounter
    // walked away from mid-branch is spent, like any other answer.
    isPending(system, body) {
      if (!Anomaly.isAnomalous(system, body)) return false;
      const rec = anomalyStore()[anomalyKey(system, body)];
      if (!rec) return true;
      if (rec.done) return false;
      return Anomaly.hasSessionOn(system, body);
    },
    session() {
      return (typeof $gameSystem !== "undefined" && $gameSystem)
        ? ($gameSystem._gsAnomalySession || null) : null;
    },
    // Is there a half-finished encounter on this exact body?
    hasSessionOn(system, body) {
      const s = Anomaly.session();
      return !!(s && s.key === anomalyKey(system, body));
    },
    // Open (or resume) the encounter on an alien world.
    begin(system, planet) {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
      const key = anomalyKey(system, planet);
      const live = Anomaly.session();
      // Resuming: hand back the view as it was written, rather than resolving
      // the same node again and re-rolling every {a|b} in it.
      if (live && live.key === key) {
        if (!live.view) anomBuildView(live);
        return live;
      }
      if (anomalyStore()[key]) return null;   // answered, or walked away from
      const session = {
        key,
        biome: anomalyBiomeKey(planet),
        placeName: planet.name,
        systemName: (system && (system.label || system.name)) || "",
        // A system in a procedural galaxy carries the galaxy's name; the Milky
        // Way's own do not. The stage reads this: out there the strangers are
        // strangers, back home some of them are people.
        milkyWay: !(system && system.galaxy),
        roll: seededHash(key, 8191) || 1,
        ctx: {},
        rewards: [],
        node: null,
        scenario: null,
      };
      session.ctx.planet = session.placeName;
      session.ctx.system = session.systemName;
      const biome = (anomalyDB().biomes || {})[session.biome] || {};
      // Anomaly.json names the surfaces it writes for; anything it does not
      // cover falls back to the biome's own declared name, never the raw id.
      session.ctx.biome = biome.label ||
        (window.BiomeNames ? window.BiomeNames.display(session.biome) : session.biome);
      return anomOpen(session);
    },
    view() {
      const s = Anomaly.session();
      return s ? (s.view || anomBuildView(s)) : null;
    },
    // The member the die is in the hands of. Cycling never touches the prose
    // or the cast (the story already happened to whoever it happened to): it
    // moves the checks, and the chips on the rows say whose odds they are.
    quester() { return anomQuester(Anomaly.session()); },
    questerIndex() {
      const s = Anomaly.session();
      return s ? ((s.questerIndex || 0)) : 0;
    },
    setQuester(index) {
      const s = Anomaly.session();
      if (!s) return;
      const n = ($gameParty && $gameParty.members) ? $gameParty.members().length : 1;
      if (n < 1) return;
      s.questerIndex = ((index % n) + n) % n;
    },
    cycleQuester(step) {
      Anomaly.setQuester((Anomaly.questerIndex() || 0) + (step || 1));
    },
    // Take a branch. Async: a choice that carries a check throws the d20 first
    // (the 3D die takes its time crossing the screen). Returns the new view; a
    // terminal node applies its outcome on the way, so the view already
    // carries the reward lines. A locked row (a hand-over the party cannot
    // cover) is refused: the current view comes back unchanged.
    async choose(index) {
      const s = Anomaly.session();
      if (!s || !s.view || s.view.done) return null;
      const choice = s.view.choices[index];
      if (!choice) return null;
      if (choice.locked) return s.view;

      // The hand-over is paid the moment the branch is taken: the stranger has
      // the crate before anything else happens, exactly like the prose says.
      if (choice.cost) anomPayCost(choice.cost);

      let targetNode = choice.to;
      if (choice.check) {
        const res = await anomRollCheck(s, choice.check);
        if (res && res.success) { if (choice.pass) targetNode = choice.pass; }
        else if (choice.fail) targetNode = choice.fail;
      }

      const db = anomalyDB();
      const sc = db.scenarios && db.scenarios[s.scenario];
      s.node = targetNode;
      const node = sc && sc.nodes && sc.nodes[s.node];
      if (node && node.outcome) s.rewards = anomArm(s, node.outcome);
      return anomBuildView(s);
    },
    // Close the encounter for good and record how it ended. `finalLines` is what
    // a handover paid once it knew (a fight won, a game lost); without it the
    // lines the last node itself read out are what goes in the book.
    end(finalLines) {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return;
      const s = Anomaly.session();
      if (s) {
        anomalyStore()[s.key] = {
          started: true, done: true, scenario: s.scenario, failed: !!s.failed,
        };
        anomDiary(s, finalLines);
      }
      $gameSystem._gsAnomalySession = null;
    },
    // A fight was the answer. The star map pops back to the map, then calls this.
    hasPendingBattle() { return !!(_anomPendingBattle && _anomPendingBattle.troopId); },
    startBattle() {
      const pend = _anomPendingBattle;
      _anomPendingBattle = null;
      if (!pend || !pend.troopId) return false;
      const session = Anomaly.session();
      // No map to fight on (a load that never streamed one in): close the
      // encounter rather than leaving it half-open forever.
      if (!$dataMap || typeof $dataMap.width !== "number") { Anomaly.end(); return false; }
      // Escapable and losable both: what is down there is an adventure, not a
      // sentence. Running from it and being beaten by it are the same answer -
      // the party does not get what they came for, and the square is spent.
      BattleManager.setup(pend.troopId, true, true);
      BattleManager.setEventCallback((result) => {
        // Victory pays what the ending promised; running or losing fails it.
        if (session) {
          const lines = result === 0
            ? anomApplyOutcome(session, Object.assign({}, pend.outcome,
                { kind: pend.outcome.reward || "loot" }))
            : anomApplyFailure(session, pend.outcome);
          anomToast(lines, result === 0);
          Anomaly.end(lines);
          return;
        }
        Anomaly.end();
      });
      SceneManager.push(Scene_Battle);
      return true;
    },
    // A contest was the answer: the party plays the game itself, and the ending
    // pays out on the result the minigame reports.
    hasPendingMinigame() { return !!_anomPendingMinigame; },
    startMinigame() {
      const pend = _anomPendingMinigame;
      _anomPendingMinigame = null;
      if (!pend) return false;
      const Scene = minigameScene(pend.outcome.game);
      const session = Anomaly.session();
      if (!Scene) {
        // Between arming and running, the minigame went away. Pay the win.
        if (session) {
          anomToast(anomApplyOutcome(session, Object.assign({}, pend.outcome,
            { kind: pend.outcome.reward || "gold" })), true);
        }
        Anomaly.end();
        return false;
      }
      _anomMinigameSettle = { outcome: pend.outcome };
      hookMinigameResult();
      SceneManager.push(Scene);
      return true;
    },
    // Called on the way back to the map, once the minigame's scene is gone.
    settleMinigame() {
      const pend = _anomMinigameSettle;
      const result = unhookMinigameResult();
      if (!pend) return false;
      _anomMinigameSettle = null;
      const session = Anomaly.session();
      if (session) {
        // Anything but a loss is taken as good enough: a draw is not a defeat,
        // and a game closed without a verdict was not lost either.
        const won = result !== "lost";   // i18n-ignore: result id
        const lines = won
          ? anomApplyOutcome(session, Object.assign({}, pend.outcome,
              { kind: pend.outcome.reward || "gold" }))
          : anomApplyFailure(session, pend.outcome);
        anomToast(lines, won);
        Anomaly.end(lines);
        return true;
      }
      Anomaly.end();
      return true;
    },
  };

  // Every answered adventure goes in the party's own book (Core/Diary.js): the
  // story they walked into, and what it paid. Written once, as the encounter
  // closes, so a fight or a game that finished it names what IT paid rather
  // than the "and then it went for us" line the node ended on.
  function anomDiary(session, finalLines) {
    if (!window.Diary || !window.Diary.onAdventure) return;
    const title = session && (session.title || session.placeName);
    if (!title) return;
    const lines = (finalLines && finalLines.length ? finalLines : (session.rewards || []))
      .map(anomLineText).filter((l) => l);
    try {
      window.Diary.onAdventure(String(title), lines.join(" "), session.placeName || "");
    } catch (e) { console.error("[ProceduralAdventure] diary", e); }
  }

  // What a handover pays is reported after the fact, on the map the party is
  // standing on rather than in the encounter's own message window: by the time
  // it is known, the encounter has closed.
  function anomToast(lines, good) {
    if (!window.ParchmentToast || !lines || !lines.length) return;
    // The toast wears the same cell the payout panel does, so a reward read on
    // the map after a fight looks like the one read inside the encounter.
    window.ParchmentToast.group(lines.map((l) => ({
      text: anomLineText(l), icon: anomLineIcon(l) || undefined,
      severity: good ? "good" : "bad",
    })));
  }

  // ==========================================================================
  // EARTH: one adventure per biome, on the world map's "???" squares
  // --------------------------------------------------------------------------
  // Where the star map hangs its encounters off worlds, Earth hangs them off
  // biomes: exactly one square per biome present on map 315 carries a marker,
  // picked deterministically from the world seed (so it is the same square in
  // every session of the same world) out of the biome coordinate cache. Once
  // that square has been answered the marker is gone for good and the biome has
  // no other - one adventure per biome, per world.
  // ==========================================================================

  function earthDB() { return anomalyDB().earth || {}; }

  function earthKey(x, y) { return "earth|" + x + "," + y; }   // i18n-ignore: store key

  // The biome whose adventure a world-map biome plays. A biome nothing was
  // written for reads its alias ("Road horizontal" -> "Road"), and anything
  // still unknown falls through to the pack's own fallback scenarios.
  function earthBiomeKey(biomeName) {
    const name = String(biomeName || "").trim();
    if (!name) return null;
    const pack = earthDB();
    const biomes = pack.biomes || {};
    if (biomes[name]) return name;
    const alias = (pack.aliases || {})[name];
    if (alias && biomes[alias]) return alias;
    return null;
  }

  // The biome of a world-map square, road and river squares reporting the
  // terrain they are painted over (a road across Fields is a Fields adventure).
  function earthBiomeAt(x, y) {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    let name = null;
    try {
      if ($gameSystem.getBiomeFromWorldCoordinates) {
        name = $gameSystem.getBiomeFromWorldCoordinates(x, y);
      }
    } catch (e) { return null; }
    if (name && !earthBiomeKey(name) && $gameSystem.getUnderBiomeFromWorldCoordinates) {
      try {
        const under = $gameSystem.getUnderBiomeFromWorldCoordinates(x, y);
        if (under && earthBiomeKey(under)) return under;
      } catch (e) { /* road with nothing under it */ }
    }
    return name;
  }

  // The world-map coordinates the biome cache holds for each biome. Built by
  // ProceduralMapUtils (from BiomesMap.json, or by scanning map 315 once).
  function biomeCoordinateCache() {
    const pg = (typeof $gameSystem !== "undefined" && $gameSystem) ? $gameSystem._procGenData : null;
    return (pg && pg.biomeCoordinateCache) || null;
  }

  // The squares a door stands on, and the ring around each of them. A Teleport
  // event owns the OK button on its own square AND on any square it is faced
  // from (see WorldMapReturn's triggerButtonAction), so a marker next door
  // could never be answered; the "???" plate is drawn upwards from the bottom
  // of its square as well, so it would sit over the door's own name. Built once
  // per rebuild of the marker set, because the alternative is asking eventsXy
  // nine times for every candidate square on the map.
  const TELEPORT_EVENT_PREFIX = "Teleport";   // i18n-ignore: map event name
  let _doorBlock = null;
  function doorBlock() {
    if (_doorBlock) return _doorBlock;
    const block = new Set();
    if (typeof $gameMap === "undefined" || !$gameMap) return block;
    $gameMap.events().forEach((ev) => {
      const data = ev && ev.event ? ev.event() : null;
      if (!data || !data.name || data.name.indexOf(TELEPORT_EVENT_PREFIX) !== 0) return;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          block.add((ev.x + dx) + "," + (ev.y + dy));   // i18n-ignore: coordinate key
        }
      }
    });
    _doorBlock = block;
    return block;
  }

  // Can the party stand on this world-map square, and is it free of events
  // (teleports, vehicles) that already own the OK button there?
  function isFreeWorldTile(x, y) {
    if (typeof $gameMap === "undefined" || !$gameMap) return false;
    if ($gameMap.mapId() !== WORLD_MAP_ID) return false;
    if (!$gameMap.isValid(x, y)) return false;
    if ($gameMap.terrainTag(x, y) === 4) return false;                 // wall
    if ($gameMap.eventsXy(x, y).length) return false;
    if (doorBlock().has(x + "," + y)) return false;                    // i18n-ignore: coordinate key
    return $gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 4) ||
           $gameMap.isPassable(x, y, 6) || $gameMap.isPassable(x, y, 8);
  }

  // Countries.json by the region id painted on the world map. Built once, because
  // the daily rebuild asks this of every square the biome cache holds and the
  // stock lookup walks the whole country list every time it is asked.
  let _earthCountryById = null;
  function earthCountriesById() {
    if (_earthCountryById) return _earthCountryById;
    const list = (window.WorldGen && window.WorldGen.Countries) || [];
    if (!list.length) return null;   // not loaded yet: do not cache the emptiness
    _earthCountryById = {};
    // Duplicated ids (Albania/Montenegro, Germany/Portugal) resolve to the first
    // match, exactly as getCountryFromWorldCoordinates does.
    list.forEach((c) => {
      if (c && c.id && _earthCountryById[c.id] === undefined) _earthCountryById[c.id] = c;
    });
    return _earthCountryById;
  }

  // The country a square belongs to. A country entry names two hyperpowers: the
  // one whose banner flies over it (`faction`) and the one occupying it
  // (`controller`), and an adventure written for either is at home there.
  function earthCountryAt(x, y) {
    try {
      if (!$gameSystem) return null;
      const byId = earthCountriesById();
      if (byId && $gameSystem.getWorldRegionId) {
        const id = $gameSystem.getWorldRegionId(x, y);
        return id ? (byId[id] || null) : null;
      }
      return $gameSystem.getCountryFromWorldCoordinates
        ? $gameSystem.getCountryFromWorldCoordinates(x, y) : null;
    } catch (e) { return null; }
  }
  const EARTH_NO_POWER = ["Neutral", "None", ""];   // i18n-ignore: Countries.json sentinels
  function earthPowersOf(country) {
    if (!country) return [];
    return [country.faction, country.controller]
      .filter((p) => p && EARTH_NO_POWER.indexOf(String(p)) < 0);
  }

  let _earthTiles = null;      // Map<"x,y", marker> for this world, today
  let _earthTilesRev = null;   // the world and the day the set was built for

  // Which calendar day it is. The marker set is drawn fresh at midnight: what is
  // worth walking out to look at is a different set of squares this morning than
  // it was yesterday, and a square the party never got to is not lost, it simply
  // comes round again.
  //
  // The clock (Variable 114) counts minutes from 10:00 on 1 January 2001, so the
  // minute count alone rolls over at ten in the morning. The date it resolves to
  // is what the day is taken from, and that turns at midnight.
  const CLOCK_VAR = 114;
  const CLOCK_EPOCH_MINUTES = 10 * 60;   // 1 Jan 2001 10:00, TimeDateSystem's zero
  function clockMinutes() {
    try {
      if (window.TimeDateSystem && window.TimeDateSystem.getGameTimeMinutes) {
        return window.TimeDateSystem.getGameTimeMinutes() || 0;
      }
    } catch (e) { /* clock not up yet */ }
    if (typeof $gameVariables !== "undefined" && $gameVariables) {
      return $gameVariables.value(CLOCK_VAR) || 0;
    }
    return 0;
  }
  function dayIndex() {
    return Math.floor((clockMinutes() + CLOCK_EPOCH_MINUTES) / 1440);
  }

  // The token that identifies the set standing on the map right now: the world,
  // and the day. WorldMapReturn watches this to know when to redraw.
  function earthRevision() { return worldSeed() + "|" + dayIndex(); }   // i18n-ignore: cache key

  // How many squares one entry is worth on any given day. Explicitly written
  // markers win; otherwise it goes on how much of that ground the map paints.
  // Deliberately sparse: an adventure is worth walking to, and a world map
  // dotted with "???" everywhere is a chore rather than an invitation. Only the
  // largest biomes reach two, and nothing reaches more than three.
  const EARTH_MARKERS_CAP = 3;
  const EARTH_MARKERS_SPREAD = 24;   // squares two markers of one entry keep apart
  function markerCount(entry, coordCount) {
    if (entry && entry.markers > 0) return Math.min(entry.markers, EARTH_MARKERS_CAP);
    const byArea = Math.round(Math.sqrt(coordCount) / 16);
    return Math.max(1, Math.min(EARTH_MARKERS_CAP, byArea));
  }

  // Walk a coordinate list from a seeded offset in a stride that is coprime with
  // nothing in particular, and take squares the party can stand on, keeping them
  // apart so one biome's markers are not all in one valley. Ground too small to
  // spread them over takes them anyway on a second pass: a district of four
  // village squares still gets its adventure.
  function claimTiles(tiles, coords, want, salt, marker) {
    if (!coords || !coords.length || want <= 0) return 0;
    const day = salt + "|" + dayIndex();   // i18n-ignore: seed salt
    const start = Math.floor(seededFloat(day, 5443) * coords.length) % coords.length;
    const taken = [];
    for (let pass = 0; pass < 2 && taken.length < want; pass++) {
      const spread = pass === 0 ? EARTH_MARKERS_SPREAD : 0;
      for (let i = 0; i < coords.length && taken.length < want; i++) {
        const c = coords[(start + i * 7919) % coords.length];
        if (!c || typeof c.x !== "number") continue;
        const key = c.x + "," + c.y;   // i18n-ignore: coordinate key
        if (tiles.has(key)) continue;
        if (spread && taken.some((t) => Math.abs(t.x - c.x) + Math.abs(t.y - c.y) < spread)) continue;
        if (!isFreeWorldTile(c.x, c.y)) continue;
        taken.push(c);
        tiles.set(key, Object.assign({ biome: marker.biome }, marker));
      }
    }
    return taken.length;
  }

  // The square a named place's own adventure stands on: as close to the place
  // as the map allows, since the place itself is a teleport event and cannot
  // carry a marker.
  const EARTH_PLACE_RADIUS = 6;
  function tileNearPlace(tiles, base) {
    for (let r = 1; r <= EARTH_PLACE_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = base.x + dx, y = base.y + dy;
          const key = x + "," + y;   // i18n-ignore: coordinate key
          if (tiles.has(key)) continue;
          if (!isFreeWorldTile(x, y)) continue;
          return { x, y };
        }
      }
    }
    return null;
  }

  // ---- Eris ---------------------------------------------------------------
  // She is not a biome and she is not a place: she is one square a day, and she
  // is wherever the party happens to be. One marker, laid within a morning's
  // walk of where they are standing when the day turns, carrying whatever she
  // is asking this time. Beat her in her own court (Economy/ErisTrial.js) and
  // the square stops being laid at all - in every savegame of that world.
  const ERIS_SCOPE = "eris";          // i18n-ignore: pack section id
  const ERIS_ENTRY = "Eris";          // i18n-ignore: pack section entry
  const ERIS_MIN_RADIUS = 2;          // never right under the party's feet
  const ERIS_MAX_RADIUS = 14;         // and never further than a morning's walk

  function erisGone() {
    try {
      if (window.ErisChallengeBattle && window.ErisChallengeBattle.isErisDefeated) {
        return !!window.ErisChallengeBattle.isErisDefeated();
      }
    } catch (e) { /* trial not loaded */ }
    return !!(typeof $gameSystem !== "undefined" && $gameSystem &&
              $gameSystem._erisBountyImmunity);
  }

  // The square she takes today: the nearest free ring out from the party, walked
  // from a seeded offset so it is not always due north, and the same square for
  // the whole day once the set is built.
  function erisTile(tiles) {
    if (typeof $gamePlayer === "undefined" || !$gamePlayer) return null;
    const px = $gamePlayer.x, py = $gamePlayer.y;
    for (let r = ERIS_MIN_RADIUS; r <= ERIS_MAX_RADIUS; r++) {
      const ring = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          ring.push({ x: px + dx, y: py + dy });
        }
      }
      if (!ring.length) continue;
      const start = Math.floor(seededFloat("eris|" + dayIndex() + "|" + r, 4441) * ring.length);   // i18n-ignore: seed salt
      for (let i = 0; i < ring.length; i++) {
        const c = ring[(start + i) % ring.length];
        const key = c.x + "," + c.y;   // i18n-ignore: coordinate key
        if (tiles.has(key)) continue;
        if (!isFreeWorldTile(c.x, c.y)) continue;
        return c;
      }
    }
    return null;
  }

  function claimErisTile(tiles, pack) {
    if (erisGone()) return;
    const section = pack[ERIS_SCOPE];
    const entry = section && section[ERIS_ENTRY];
    if (!entry || !(entry.scenarios || []).length) return;
    const spot = erisTile(tiles);
    if (!spot) return;
    tiles.set(spot.x + "," + spot.y, {   // i18n-ignore: coordinate key
      scope: ERIS_SCOPE, scopeId: ERIS_ENTRY, eris: true,
      biome: earthBiomeKey(earthBiomeAt(spot.x, spot.y)),
    });
  }

  // Everything the world map carries, narrowest claim first: a place's own
  // adventure beats the country's, the country's beats its hyperpower's, and
  // the biomes fill in what is left.
  function buildEarthTiles() {
    const tiles = new Map();
    _doorBlock = null;   // the doors are read fresh for every rebuild
    const cache = biomeCoordinateCache();
    if (!cache) return tiles;
    const pack = earthDB();
    if (!Object.keys(pack.biomes || {}).length) return tiles;

    // ---- Eris, one square a day, wherever the party is ----------------------
    claimErisTile(tiles, pack);

    // ---- Named places (Destinations.json) ----------------------------------
    const places = pack.places || {};
    const destinations = (window.WorkSystem && window.WorkSystem.Destinations) || {};
    Object.keys(places).sort().forEach((name) => {
      const dest = destinations[name];
      const base = dest && dest.base;
      if (!base || typeof base.x !== "number") return;
      const spot = tileNearPlace(tiles, base);
      if (!spot) return;
      tiles.set(spot.x + "," + spot.y, {   // i18n-ignore: coordinate key
        scope: "places", scopeId: name,    // i18n-ignore: pack section id
        biome: earthBiomeKey(earthBiomeAt(spot.x, spot.y)),
        place: name,
      });
    });

    // ---- Biome squares, grouped by the adventure they play ------------------
    // (Road variants do not each claim a marker of their own.) The same pass
    // groups every square by its country, which is what the country and
    // hyperpower adventures are placed out of.
    const byAdventure = {};
    const byCountry = {};
    Object.keys(cache).forEach((biome) => {
      const coords = cache[biome];
      if (!Array.isArray(coords) || !coords.length) return;
      const key = earthBiomeKey(biome);
      coords.forEach((c) => {
        if (!c || typeof c.x !== "number") return;
        if (key) (byAdventure[key] = byAdventure[key] || []).push(c);
        const country = earthCountryAt(c.x, c.y);
        if (country && country.country) {
          (byCountry[country.country] = byCountry[country.country] || []).push(c);
        }
      });
    });

    // ---- Countries, then hyperpowers ---------------------------------------
    const countries = pack.countries || {};
    Object.keys(countries).sort().forEach((name) => {
      claimTiles(tiles, byCountry[name], markerCount(countries[name], (byCountry[name] || []).length),
        "country|" + name,   // i18n-ignore: seed salt
        { scope: "countries", scopeId: name, country: name, biome: null });   // i18n-ignore: pack section id
    });

    const powers = pack.powers || {};
    const list = (window.WorldGen && window.WorldGen.Countries) || [];
    Object.keys(powers).sort().forEach((power) => {
      const held = list.filter((c) => c && earthPowersOf(c).indexOf(power) >= 0);
      if (!held.length) return;
      // Spread over the countries the power holds rather than filling one of
      // them: the Empire's business is the Empire's business everywhere.
      const want = markerCount(powers[power], held.length * 40);
      let placed = 0;
      const order = held.slice().sort((a, b) =>
        seededFloat(power + "|" + a.country, 3323) - seededFloat(power + "|" + b.country, 3323));
      for (let pass = 0; pass < 2 && placed < want; pass++) {
        for (const country of order) {
          if (placed >= want) break;
          placed += claimTiles(tiles, byCountry[country.country], 1,
            "power|" + power + "|" + country.country + "|" + pass,   // i18n-ignore: seed salt
            { scope: "powers", scopeId: power, power, country: country.country, biome: null });   // i18n-ignore: pack section id
        }
      }
    });

    // ---- The biomes themselves ---------------------------------------------
    Object.keys(byAdventure).sort().forEach((biome) => {
      const coords = byAdventure[biome];
      claimTiles(tiles, coords, markerCount((pack.biomes || {})[biome], coords.length),
        biome, { biome });
    });

    // A marker placed before the biome pass knows where it is standing only
    // now: fill in what it is painted on, for the word banks underneath.
    tiles.forEach((marker, key) => {
      if (marker.biome) return;
      const parts = key.split(",");
      marker.biome = earthBiomeKey(earthBiomeAt(Number(parts[0]), Number(parts[1])));
    });
    return tiles;
  }

  function earthTiles() {
    const rev = earthRevision();
    if (_earthTiles && _earthTilesRev === rev) return _earthTiles;
    if (typeof $gameMap === "undefined" || !$gameMap || $gameMap.mapId() !== WORLD_MAP_ID) {
      return _earthTiles || new Map();
    }
    const built = buildEarthTiles();
    // The biome coordinate cache is built on the first world-map load and may
    // not be there yet on the frame this is first asked. An empty answer is
    // never cached, so the markers appear as soon as it is.
    if (!built.size) return built;
    _earthTiles = built;
    _earthTilesRev = rev;
    return _earthTiles;
  }

  const Earth = {
    // Squares that still carry a marker: the built set, minus everything the
    // party has already answered.
    tiles() {
      const out = new Set();
      const store = anomalyStore();
      earthTiles().forEach((marker, key) => {
        const rec = store[earthKey.apply(null, key.split(","))];
        if (rec && rec.done) return;
        out.add(key);
      });
      return out;
    },
    biomeAt(x, y) { return earthBiomeAt(x, y); },
    // Changes whenever the set on the map does, which is once a day (and on a
    // change of world). Anything drawing the markers redraws when this moves.
    revision() { return earthRevision(); },
    // What kind of marker stands here: a biome's, a place's, a country's or a
    // hyperpower's. Null on a square that never carried one.
    markerAt(x, y) {
      return earthTiles().get(x + "," + y) || null;   // i18n-ignore: coordinate key
    },
    // Is there an adventure to play on this square? Answered squares say no,
    // and so does every square that never carried one.
    isPendingAt(x, y) {
      const key = x + "," + y;   // i18n-ignore: coordinate key
      if (!earthTiles().has(key)) return false;
      const rec = anomalyStore()[earthKey(x, y)];
      return !rec || !rec.done;
    },
    // Open the adventure written for this square and hand it to the map
    // presenter. Returns false when there was nothing to play.
    beginAt(x, y) {
      if (typeof $gameSystem === "undefined" || !$gameSystem) return false;
      if (!Earth.isPendingAt(x, y)) return false;
      const key = earthKey(x, y);
      const live = Anomaly.session();
      if (live && live.key === key) { MapPlay.start(live); return true; }
      const marker = Earth.markerAt(x, y) || {};
      const biomeName = earthBiomeAt(x, y) || marker.biome;
      const biome = earthBiomeKey(biomeName) || marker.biome;
      const display = window.BiomeNames
        ? window.BiomeNames.display(biomeName || biome) : String(biomeName || biome);
      const country = earthCountryAt(x, y);
      const region = (country && country.country) || null;
      const session = {
        key,
        earth: true,
        biome: biome || "",
        rawBiome: biomeName || biome || "",
        // The narrower pack this square belongs to, if any: its place, its
        // country, or the hyperpower whose ground it is.
        scope: marker.scope || null,
        scopeId: marker.scopeId || null,
        // What a relic lifted here is named after: the place if this is one of
        // theirs, the country if the world map knows one, the biome otherwise.
        placeName: marker.place || region || display,
        roll: seededHash(key, 8191) || 1,
        ctx: {},
        rewards: [],
        node: null,
        scenario: null,
      };
      session.ctx.biome = display;
      session.ctx.place = marker.place || display;
      session.ctx.region = region || display;
      session.ctx.country = region || display;
      const powers = earthPowersOf(country);
      if (marker.power) session.ctx.power = marker.power;
      else if (powers.length) session.ctx.power = powers[0];
      if (marker.place) session.ctx.city = marker.place;
      if (!anomOpen(session)) return false;
      MapPlay.start(session);
      return true;
    },
  };

  // ==========================================================================
  // THE STAGE
  // --------------------------------------------------------------------------
  // What the encounter looks like: the biome's own battle background behind
  // the prose, the away team's busts standing on it, and whoever the story is
  // about facing them. On an alien world the stranger is one of the alien
  // busts (NPCs.json flags them); in the Milky Way the odd human turns up out
  // there too, because the Milky Way is where the humans are. A terminal node
  // that armed a fight shows the thing about to be fought instead.
  //
  // Everything here is presentation: it is built fresh per node, never saved,
  // and a build with no filesystem (a browser deploy, the test harness) simply
  // has no stage and keeps the parchment.
  // ==========================================================================

  const STAGE_PARTY_MAX = 3;

  // Battleback folders resolve the same way the battle itself resolves them
  // (AnimatedBattleBackgrounds): flat folder first, then AlienPlanet/<Biome>,
  // then the directional stem. Picked seeded by the square, so one encounter
  // keeps its view from the first node to the last.
  function stageBackground(session) {
    try {
      const fs = require("fs");
      const path = require("path");
      const base = path.join(path.dirname(process.mainModule.filename), "img", "battlebacks1");
      const names = [session.rawBiome, session.biome].filter(Boolean);
      for (const name of names) {
        let rel = null;
        if (fs.existsSync(path.join(base, name))) rel = name;
        else if (fs.existsSync(path.join(base, "AlienPlanet", name))) rel = "AlienPlanet/" + name;
        else {
          const stem = String(name).split(" ")[0];
          if (stem !== name && fs.existsSync(path.join(base, stem))) rel = stem;
        }
        if (!rel) continue;
        const files = fs.readdirSync(path.join(base, rel)).filter((f) => /\.(png|jpe?g)$/i.test(f));
        if (!files.length) continue;
        return "img/battlebacks1/" + rel + "/" + files[seededHash(session.key, 3671) % files.length];
      }
    } catch (e) { /* no filesystem: no stage */ }
    return (typeof window.getBiomeBattlebackPreview === "function")
      ? window.getBiomeBattlebackPreview(session.rawBiome || session.biome)
      : null;
  }

  // The busts the sprite database knows, split into the aliens (flagged) and
  // everybody else who is a person rather than a creature. Built once.
  let _stagePools = null;
  function stageBustPools() {
    if (_stagePools) return _stagePools;
    const db = (window.WorldGen && window.WorldGen.NPCs) || {};
    const alien = [], people = [];
    Object.keys(db).forEach((sheet) => {
      const e = db[sheet];
      if (!e || typeof e !== "object") return;
      const busts = (Array.isArray(e.busts) ? e.busts : []).filter((b) => b && b !== "7");
      if (!busts.length) return;
      if (e.aliens || e.alien) { alien.push.apply(alien, busts); return; }
      if (e.creature || e.animal || e.zombie) return;
      people.push.apply(people, busts);
    });
    _stagePools = { alien, people };
    return _stagePools;
  }

  // The bust an actor is drawn with everywhere else: the Empathize panel owns
  // the resolution, and the same arithmetic stands in when it is not loaded.
  function stageActorBust(actor) {
    try {
      const h = window.NPCEmpathize && window.NPCEmpathize._helpers;
      if (h && h._resolveBustForActor) return h._resolveBustForActor(actor);
    } catch (e) { /* empathize not loaded */ }
    if (!actor) return null;
    try {
      const own = actor.vnBust ? actor.vnBust() : null;
      if (own && own !== "7" && own !== 0) return "img/busts/" + own + ".png";
      const sa = window.Sprites && window.Sprites.SpritesAssociation;
      const name = actor.characterName ? actor.characterName() : "";
      if (name && sa) {
        const bust = sa[name.split(".")[0]] && sa[name.split(".")[0]][actor.characterIndex()];
        if (bust && bust !== "7") return "img/busts/" + bust + ".png";
      }
    } catch (e) { /* creature actors and stubs */ }
    return null;
  }

  // Whoever the encounter is about, facing the party. Aliens on alien ground;
  // in the Milky Way the pool widens, and on Earth it was always people.
  function stageStrangerBust(session) {
    const pools = stageBustPools();
    let pool = pools.people;
    if (!session.earth) {
      const wander = session.milkyWay && pools.people.length &&
        seededFloat(session.key, 5527) < 0.4;
      pool = wander ? pools.people : (pools.alien.length ? pools.alien : pools.people);
    }
    if (!pool || !pool.length) return null;
    return "img/busts/" + pool[seededHash(session.key, 5581) % pool.length] + ".png";
  }

  function stageEl(tag, styles) {
    const el = document.createElement(tag);
    if (styles) Object.keys(styles).forEach((k) => { el.style[k] = styles[k]; });
    return el;
  }

  // How big the scene is drawn. The star map keeps it as a strip at the top of
  // its own panel; the map presenter plays it as the whole screen, with the
  // busts standing at full height and the card of prose laid over their feet.
  const STAGE_METRICS = {
    strip: {
      shade: "70px",
      bottomActive: "-16px", bottomIdle: "-24px",
      heightActive: "158px", heightIdle: "150px",
      left: (i) => (6 + i * 62) + "px",
      foeBottom: "-24px", foeSide: "8px", foeHeight: "150px",
    },
    // Played as the whole screen the card sits in the MIDDLE of the picture,
    // so the cast is drawn tall: the busts stand to either side of it and
    // their faces are read clear of the card's edges.
    full: {
      shade: "46vh", topShade: "34vh",
      bottomActive: "0", bottomIdle: "-2vh",
      heightActive: "78vh", heightIdle: "70vh",
      left: (i) => (-2 + i * 11) + "vw",
      foeBottom: "0", foeSide: "-2vw", foeHeight: "74vh",
    },
  };

  const Stage = {
    // The scene, as one element, or null when there is nothing to draw it out
    // of. `view` decides who stands on the right: a fight about to start shows
    // the enemy, anything else shows the stranger. `opts.full` draws it as the
    // whole screen instead of a strip inside a card.
    build(session, view, opts) {
      if (!session || typeof document === "undefined") return null;
      const bg = stageBackground(session);
      if (!bg) return null;
      const full = !!(opts && opts.full);
      const m = full ? STAGE_METRICS.full : STAGE_METRICS.strip;
      const box = stageEl("div", full ? {
        // The four longhands, never the `inset` shorthand: the runtime's CSS
        // does not know it, and a full-screen layer written with it collapses.
        position: "fixed", left: "0", top: "0", right: "0", bottom: "0",
        width: "100vw", height: "100vh",
        overflow: "hidden", pointerEvents: "none", zIndex: "0",
        backgroundImage: "url('" + bg.replace(/'/g, "%27") + "')",
        backgroundSize: "cover", backgroundPosition: "center 45%",
      } : {
        position: "relative", width: "100%", height: "170px",
        overflow: "hidden", borderRadius: "4px", marginBottom: "10px",
        flexShrink: "0",
        backgroundImage: "url('" + bg.replace(/'/g, "%27") + "')",
        backgroundSize: "cover", backgroundPosition: "center 35%",
      });
      // A floor of shadow, so the busts read against any sky.
      box.appendChild(stageEl("div", {
        position: "absolute", left: "0", right: "0", bottom: "0", height: m.shade,
        background: full
          ? "linear-gradient(to top, rgba(0,0,0,0.80), rgba(0,0,0,0.30) 55%, rgba(0,0,0,0))"
          : "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))",
        pointerEvents: "none",
      }));
      // ...and a ceiling of it, played as the whole screen: the card is read at
      // the top of the picture, and a bright sky behind a page of prose is the
      // one thing that makes it unreadable.
      if (full) {
        box.appendChild(stageEl("div", {
          position: "absolute", left: "0", right: "0", top: "0", height: m.topShade,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.45) 60%, rgba(0,0,0,0))",
          pointerEvents: "none",
        }));
      }
      // The away team, shoulder to shoulder on the left.
      const cast = ($gameParty && $gameParty.members) ? $gameParty.members().slice(0, STAGE_PARTY_MAX) : [];
      const questerIdx = (session.questerIndex || 0) % Math.max(1, cast.length);
      cast.forEach((actor, i) => {
        const src = stageActorBust(actor);
        if (!src) return;
        const active = i === questerIdx;
        const img = stageEl("img", {
          position: "absolute",
          bottom: active ? m.bottomActive : m.bottomIdle,
          left: m.left(i),
          height: active ? m.heightActive : m.heightIdle, width: "auto",
          filter: active
            ? "drop-shadow(0 0 6px rgba(255,215,0,0.85)) drop-shadow(0 3px 5px rgba(0,0,0,0.6))"
            : "drop-shadow(0 3px 5px rgba(0,0,0,0.6)) brightness(0.82)",
          zIndex: active ? "20" : String(10 - i),
        });
        img.src = src;
        img.onerror = function () { this.remove(); };
        box.appendChild(img);
      });
      // Whoever, or whatever, is on the other side of the conversation.
      const foe = (view && view.done && session.stageEnemy && session.stageEnemy.battlerName)
        ? "img/enemies/" + session.stageEnemy.battlerName + ".png"
        : stageStrangerBust(session);
      if (foe) {
        const img = stageEl("img", {
          position: "absolute", bottom: m.foeBottom, right: m.foeSide,
          height: m.foeHeight, width: "auto",
          transform: "scaleX(-1)",
          filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.6))",
        });
        img.src = foe;
        img.onerror = function () { this.remove(); };
        box.appendChild(img);
      }
      return box;
    },

    // The companion tabs, top-right, the same gesture every book-spread menu
    // uses: whoever's tab is lit is holding the die. `onSwitch(i)` is the
    // caller's re-render; the tabs only move the index.
    buildSwitcher(session, onSwitch) {
      const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
      if (members.length < 2 || typeof document === "undefined") return null;
      const strip = stageEl("div", {
        display: "flex", justifyContent: "flex-end", gap: "6px",
        marginBottom: "6px", flexShrink: "0",
      });
      const active = (session.questerIndex || 0) % members.length;
      members.forEach((m, i) => {
        const tab = stageEl("span", {
          padding: "2px 10px", borderRadius: "9px", cursor: "pointer",
          fontSize: "0.8em", border: "1px solid currentColor",
          opacity: i === active ? "1" : "0.5",
          fontWeight: i === active ? "bold" : "normal",
        });
        tab.textContent = m.name();
        tab.addEventListener("mousedown", (e) => {
          e.stopPropagation(); e.preventDefault();
          Anomaly.setQuester(i);
          if (onSwitch) onSwitch(i);
        });
        strip.appendChild(tab);
      });
      return strip;
    },

    // For panels that build their DOM elsewhere (the star map's log): drop the
    // stage in at the top of `container`, replacing the one from the last node.
    attachTo(container, onSwitch) {
      if (!container || typeof document === "undefined") return;
      try {
        ["pas-adv-stage", "pas-adv-tabs"].forEach((cls) => {   // i18n-ignore: DOM classes
          const old = container.querySelector ? container.querySelector("." + cls) : null;
          if (old) old.remove();
        });
        const session = Anomaly.session();
        if (!session) return;
        const el = Stage.build(session, session.view);
        if (el) {
          el.className = "pas-adv-stage";   // i18n-ignore: DOM class
          container.insertBefore(el, container.firstChild || null);
        }
        const tabs = Stage.buildSwitcher(session, onSwitch);
        if (tabs) {
          tabs.className = "pas-adv-tabs";   // i18n-ignore: DOM class
          container.insertBefore(tabs, container.firstChild || null);
        }
      } catch (e) { /* a panel with no DOM to speak of */ }
    },

    // The chip a choice row wears: the die it would throw (with the current
    // quester's own modifier, so handing the die to somebody else visibly
    // moves the odds), or what taking it costs. Plain text, for either
    // presenter to dress.
    chipText(choice) {
      if (!choice) return "";
      const bits = [];
      if (choice.check) {
        if (choice.check.chance) {
          bits.push(anomText("ui.chanceChip", { pct: choice.check.chance }));
        } else {
          const mod = choice.check.stat ? anomStatMod(Anomaly.session(), choice.check.stat) : 0;
          bits.push(anomText("ui.checkChip", {
            stat: choice.check.stat || "D20",
            dc: choice.check.dc,
            mod: (mod >= 0 ? "+" : "") + mod,
          }));
        }
      }
      if (choice.costLabel) bits.push(choice.costLabel);
      return bits.join(" · ");
    },
  };

  // ==========================================================================
  // MAP PRESENTER
  // --------------------------------------------------------------------------
  // On Earth the encounter is played in a parchment modal drawn over the map,
  // the same shape the star map gives it in its own panel: the node's prose
  // whole, its branches as rows under it, the payout when it ends. It used to
  // run through the ordinary message window, which paged the prose away before
  // the choice was made and left the party reading four lines at a time; the
  // modal keeps the whole node on screen while it is answered.
  //
  // The rows answer to the mouse and to the keyboard alike: Input is read from
  // Scene_Map.update (the modal never takes focus, so the engine still sees
  // every key), and the party cannot walk while it is open (canMove below).
  // ==========================================================================

  const MODAL_ID = "pas-adventure-overlay";   // i18n-ignore: DOM id
  const MODAL_ARM_FRAMES = 4;   // frames a fresh row list ignores the OK button
  const TYPE_CHARS_PER_FRAME = 2;   // how fast the prose writes itself out

  // Message-window escape codes (\c[14] and the like) mean nothing to the DOM.
  function stripCodes(text) {
    return String(text || "").replace(/\\[a-zA-Z]+\[[^\]]*\]/g, "");
  }

  const MapPlay = {
    _root: null,
    _panel: null,
    _rowsEl: null,
    _rows: [],
    _index: 0,
    _arm: 0,
    _running: false,
    _typing: null,

    // ---- lifecycle ---------------------------------------------------------

    start(session) {
      this._running = true;
      this.build();
      this.present(session.view || anomBuildView(session));
    },

    stop() {
      this._running = false;
      this._rows = [];
      this.destroy();
    },

    build() {
      this.destroy();
      if (typeof document === "undefined") return;
      const root = document.createElement("div");
      root.id = MODAL_ID;
      root.className = "pas-adv-overlay";   // i18n-ignore: DOM class
      // The overlay covers the canvas, so every pointer event that lands on it
      // is ours: TouchInput must not read a click on a choice as a click on the
      // map underneath it.
      ["mousedown", "mouseup", "click", "wheel", "touchstart", "touchend"].forEach((ev) => {
        root.addEventListener(ev, (e) => { e.stopPropagation(); }, { passive: true });
      });
      // The engine never sees a click that lands on the overlay, so the skip
      // has to be read here too: clicking anywhere off the rows while the node
      // is still writing itself puts the rest of it up.
      ["mousedown", "touchstart"].forEach((ev) => {
        root.addEventListener(ev, () => {
          if (this._typing) this.finishTyping();
        }, { passive: true });
      });
      // Right-click is the mouse's cancel, the same as it is everywhere else:
      // it takes the last row, which is "leave it" on a branch and "close" on
      // an ending. The engine never sees the event, so it cannot also read it.
      root.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this._rows.length) return;
        this.select(this._rows.length - 1);
        this.confirm();
      });
      const panel = document.createElement("div");
      panel.className = "pas-adv-panel";   // i18n-ignore: DOM class
      root.appendChild(panel);
      document.body.appendChild(root);
      this._root = root;
      this._panel = panel;
    },

    destroy() {
      this.stopTyping();
      const stale = (typeof document !== "undefined") ? document.getElementById(MODAL_ID) : null;
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
      this._root = null;
      this._panel = null;
      this._rowsEl = null;
    },

    // ---- drawing -----------------------------------------------------------

    // One node: its title, its prose, then either its branches or its payout.
    present(view) {
      if (!view) { this.finish(); return; }
      if (!this._panel) { this.build(); }
      const panel = this._panel;
      if (!panel) { this.finish(); return; }
      this.stopTyping();
      panel.innerHTML = "";
      // The scene itself: the ground this is happening on, and who is standing
      // on it, drawn across the whole screen behind the card, with the
      // companion tabs above the prose so the die can change hands. Purely
      // presentation; a build without it keeps the parchment.
      try {
        const session = Anomaly.session();
        this.drawScene(session, view);
        const tabs = Stage.buildSwitcher(session, () => this.rerender());
        if (tabs) panel.appendChild(tabs);
      } catch (e) { /* presentation only: never let it stop the story */ }
      if (view.title) {
        const title = document.createElement("div");
        title.className = "pas-adv-title";   // i18n-ignore: DOM class
        title.textContent = stripCodes(view.title);
        panel.appendChild(title);
      }
      const body = document.createElement("div");
      body.className = "pas-adv-text";   // i18n-ignore: DOM class
      const typed = [];
      const veiled = [];
      String(view.text || "").split("\n").forEach((para) => {
        const p = document.createElement("p");
        p.textContent = stripCodes(para);
        body.appendChild(p);
        typed.push({ el: p, text: p.textContent });
      });
      panel.appendChild(body);
      if (view.done) {
        const box = this.buildRewards(view.rewards);
        if (box) {
          panel.appendChild(box);
          veiled.push(box);
        }
        this.setRows([{ label: anomText("ui.mapClose"), run: () => this.finish() }]);
      } else {
        const rows = (view.choices || []).map((c, i) => ({
          label: c.text,
          chip: Stage.chipText(c),
          locked: !!c.locked,
          run: async () => this.present(await Anomaly.choose(i)),
        }));
        rows.push({ label: anomText("ui.walkAway"), run: () => this.walkAway(view) });
        this.setRows(rows);
      }
      body.scrollTop = 0;
      // What the node pays, and what it asks, are kept out of sight until the
      // node has finished saying itself.
      if (this._rowsEl) veiled.push(this._rowsEl);
      this.typeOut(typed, veiled, body);
    },

    // What the ending paid, as a list of things rather than a paragraph: one
    // row per line, each wearing the IconSet cell the reward carries, drawn in
    // the backpack's own hand (the .item-slot row of ItemSystemInventoryUI.js)
    // so a payout looks like a pocket being filled.
    buildRewards(rewards) {
      const lines = (rewards || []).filter((l) => anomLineText(l));
      if (!lines.length) return null;
      const box = document.createElement("div");
      box.className = "pas-adv-rewards";   // i18n-ignore: DOM class
      lines.forEach((line, i) => {
        const row = document.createElement("div");
        row.className = "item-slot item-slot--compact pas-adv-reward";   // i18n-ignore: DOM classes
        const iconIndex = anomLineIcon(line);
        const cell = document.createElement("div");
        cell.className = "item-slot-icon";   // i18n-ignore: DOM class
        if (iconIndex > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = 32; canvas.height = 32;
          canvas.style.width = "24px"; canvas.style.height = "24px";
          cell.appendChild(canvas);
          this.drawRewardIcon(canvas, iconIndex);
        }
        row.appendChild(cell);
        const info = document.createElement("div");
        info.className = "item-slot-info";   // i18n-ignore: DOM class
        const name = document.createElement("div");
        name.className = "item-slot-name";   // i18n-ignore: DOM class
        name.textContent = stripCodes(anomLineText(line));
        info.appendChild(name);
        row.appendChild(info);
        const count = anomLineCount(line);
        if (count) {
          const chip = document.createElement("span");
          chip.className = "item-slot-count";   // i18n-ignore: DOM class
          chip.textContent = count;
          row.appendChild(chip);
        }
        box.appendChild(row);
      });
      return box;
    },

    // One IconSet cell, drawn the way the backpack draws its slots: off the
    // System bitmap, unsmoothed, once it has loaded.
    drawRewardIcon(canvas, iconIndex) {
      if (!canvas || typeof ImageManager === "undefined") return;
      const bitmap = ImageManager.loadSystem("IconSet");   // i18n-ignore: asset name
      const draw = () => {
        const ctx = canvas.getContext ? canvas.getContext("2d") : null;
        if (!ctx || !bitmap.canvas) return;
        ctx.clearRect(0, 0, 32, 32);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmap.canvas, (iconIndex % 16) * 32,
          Math.floor(iconIndex / 16) * 32, 32, 32, 0, 0, 32, 32);
      };
      try {
        if (bitmap.isReady()) draw();
        else bitmap.addLoadListener(draw);
      } catch (e) { /* presentation only */ }
    },

    // The scene is the size of the screen, so it hangs off the overlay rather
    // than off the card: one layer per node, replacing the one before it.
    drawScene(session, view) {
      const root = this._root;
      if (!root || !root.querySelector) return;
      const old = root.querySelector(".pas-adv-scene");   // i18n-ignore: DOM class
      if (old && old.remove) old.remove();
      const scene = Stage.build(session, view, { full: true });
      if (!scene) return;
      scene.className = "pas-adv-scene";   // i18n-ignore: DOM class
      root.insertBefore(scene, root.firstChild || null);
    },

    // ---- the prose, written out --------------------------------------------
    // The node arrives empty and fills in a character at a time, and the rows
    // only open once it has finished speaking. Any key or click puts the rest
    // of it up at once. Driven from update(), so it runs on the engine's own
    // frame clock and dies the moment the modal does.

    typeOut(parts, veiled, scroller) {
      const alive = (parts || []).filter((p) => p && p.text);
      (veiled || []).forEach((el) => {
        if (el && el.classList) el.classList.add("pas-adv-veiled");   // i18n-ignore: DOM class
      });
      if (!alive.length) { this.reveal(veiled); return; }
      alive.forEach((p) => { p.el.textContent = ""; });
      this._typing = { parts: alive, at: 0, cut: 0, veiled: veiled || [], scroller: scroller };
    },

    advanceTyping() {
      const t = this._typing;
      if (!t) return;
      let budget = TYPE_CHARS_PER_FRAME;
      while (budget > 0 && t.at < t.parts.length) {
        const part = t.parts[t.at];
        const take = Math.min(budget, part.text.length - t.cut);
        t.cut += take;
        budget -= take;
        part.el.textContent = part.text.slice(0, t.cut);
        if (t.cut >= part.text.length) { t.at++; t.cut = 0; }
      }
      // A node longer than the card keeps its last written line in view.
      if (t.scroller) t.scroller.scrollTop = t.scroller.scrollHeight || 0;
      if (t.at >= t.parts.length) this.finishTyping();
    },

    // Everything said at once: what the skip does, and what the last frame of
    // the writing does too.
    finishTyping() {
      const t = this._typing;
      if (!t) return;
      this._typing = null;
      t.parts.forEach((p) => { p.el.textContent = p.text; });
      this.reveal(t.veiled);
    },

    // Dropped mid-sentence: the node is being replaced, so nothing is owed.
    stopTyping() { this._typing = null; },

    reveal(veiled) {
      (veiled || []).forEach((el) => {
        if (el && el.classList) el.classList.remove("pas-adv-veiled");   // i18n-ignore: DOM class
      });
    },

    isTyping() { return !!this._typing; },

    setRows(rows) {
      this._rows = rows;
      this._index = 0;
      this._arm = MODAL_ARM_FRAMES;
      const list = document.createElement("div");
      list.className = "pas-adv-rows";   // i18n-ignore: DOM class
      rows.forEach((row, i) => {
        const el = document.createElement("div");
        el.className = "pas-adv-row";   // i18n-ignore: DOM class
        el.textContent = stripCodes(row.label);
        // What taking the row involves, worn on the row: the die (stat and
        // DC), the odds, or the price of the hand-over. A row the party cannot
        // cover is greyed with the price still showing.
        if (row.chip) {
          const chip = document.createElement("span");
          chip.className = "pas-adv-chip";   // i18n-ignore: DOM class
          chip.textContent = row.chip;
          chip.style.marginLeft = "10px";
          chip.style.padding = "1px 8px";
          chip.style.border = "1px solid currentColor";
          chip.style.borderRadius = "9px";
          chip.style.fontSize = "0.8em";
          chip.style.opacity = "0.85";
          chip.style.whiteSpace = "nowrap";
          el.appendChild(chip);
        }
        if (row.locked) el.style.opacity = "0.45";
        el.addEventListener("mouseenter", () => { this.select(i); });
        el.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.select(i);
          this.confirm();
        });
        list.appendChild(el);
      });
      if (this._panel) this._panel.appendChild(list);
      this._rowsEl = list;
      this.select(0);
    },

    select(index) {
      if (!this._rows.length) return;
      const n = this._rows.length;
      const i = ((index % n) + n) % n;
      if (i !== this._index) SoundManager.playCursor();
      this._index = i;
      if (!this._rowsEl) return;
      const els = this._rowsEl.children;
      for (let k = 0; k < els.length; k++) {
        els[k].classList.toggle("pas-adv-row-sel", k === i);   // i18n-ignore: DOM class
      }
    },

    // ---- answering ---------------------------------------------------------

    // Returns whatever the row's handler returns (a promise, when the row
    // throws a die), so a caller that wants to wait for the branch can.
    confirm() {
      const row = this._rows[this._index];
      if (!row || !row.run) return undefined;
      if (row.locked) {
        // The ask is on the table and the party cannot cover it. The row
        // stays; the story does not move.
        if (SoundManager.playBuzzer) SoundManager.playBuzzer();
        return undefined;
      }
      this._rows = [];
      SoundManager.playOk();
      return row.run();
    },

    // Redraw the current node without touching the story: the same cached
    // view, presented again. What changes is who is holding the die - the lit
    // tab, the lit bust, and the modifiers on every check chip.
    rerender() {
      const s = Anomaly.session();
      if (!s || !s.view) return;
      const index = this._index;
      this.present(s.view);
      // Keep the cursor where it was: a redraw is not a navigation.
      if (this._rows.length) this.select(Math.min(index, this._rows.length - 1));
      this._arm = 0;
    },

    // Walking out is one of the ways an encounter is answered: the square is
    // spent either way, so it is read out and closed like any other ending.
    walkAway(view) {
      this.present({
        title: (view && view.title) || "",
        text: anomText("ui.walkedAway"),
        choices: [],
        rewards: [],
        done: true,
      });
    },

    // The prose is read out; whatever the ending owes somewhere else runs now.
    // Each of these closes the encounter itself, once it knows how it went.
    finish() {
      this._running = false;
      this._rows = [];
      this.destroy();
      if (Anomaly.hasPendingBattle()) {
        try { Anomaly.startBattle(); return; } catch (e) { console.error(e); }
      }
      if (Anomaly.hasPendingMinigame()) {
        try { Anomaly.startMinigame(); return; } catch (e) { console.error(e); }
      }
      Anomaly.end();
    },

    // ---- input -------------------------------------------------------------

    update() {
      if (!this._running) return;
      // While the node is still writing itself every button is the same
      // button: it says the rest of it now.
      if (this._typing) {
        this.advanceTyping();
        const skipped = Input.isTriggered("ok") || Input.isTriggered("cancel") ||
          (TouchInput.isTriggered && TouchInput.isTriggered()) || TouchInput.isCancelled();
        if (this._typing && skipped) {
          Input.clear();
          this.finishTyping();
          this._arm = MODAL_ARM_FRAMES;
        }
        return;
      }
      if (!this._rows.length) return;
      if (this._arm > 0) { this._arm--; Input.clear(); return; }
      // The die changes hands on the shoulder buttons (or Tab), the same
      // companion-cycling gesture the book-spread menus use.
      if (Input.isTriggered("pageup")) {
        Input.clear(); Anomaly.cycleQuester(-1); SoundManager.playCursor(); this.rerender(); return;
      }
      if (Input.isTriggered("pagedown") || Input.isTriggered("tab")) {
        Input.clear(); Anomaly.cycleQuester(1); SoundManager.playCursor(); this.rerender(); return;
      }
      if (Input.isRepeated("down")) { this.select(this._index + 1); return; }
      if (Input.isRepeated("up")) { this.select(this._index - 1); return; }
      if (Input.isTriggered("ok")) { Input.clear(); this.confirm(); return; }
      if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
        // Cancel is the last row: "leave it" on a branch, "close" on an ending.
        Input.clear();
        this.select(this._rows.length - 1);
        this.confirm();
      }
    },

    isRunning() { return this._running; },
  };

  // ==========================================================================
  // HOOKS
  // ==========================================================================

  // A branch that ended in a fight leaves the star map and lands here: the map
  // scene is the only place a battle can be pushed from safely. A branch that
  // ended in a contest lands here on the way BACK, once the minigame's own scene
  // has closed and the result it reported can be read.
  const _PAS_Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    _PAS_Scene_Map_start.call(this);
    try { Anomaly.settleMinigame(); } catch (e) { console.error(e); Anomaly.end(); }
    if (Anomaly.hasPendingBattle() && !this._transfer) {
      try { Anomaly.startBattle(); } catch (e) { console.error(e); Anomaly.end(); }
    }
  };

  const _PAS_Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _PAS_Scene_Map_update.call(this);
    MapPlay.update();
  };

  // The modal owns the party while it is up: no walking off the square being
  // investigated, and no button press reaching the map behind it (canMove is
  // what Game_Player.triggerAction asks before it reads the OK button at all).
  const _PAS_Game_Player_canMove = Game_Player.prototype.canMove;
  Game_Player.prototype.canMove = function () {
    if (MapPlay.isRunning()) return false;
    return _PAS_Game_Player_canMove.call(this);
  };

  // ...and the same for the menu key, which Scene_Map reads on its own.
  const _PAS_Scene_Map_isMenuCalled = Scene_Map.prototype.isMenuCalled;
  Scene_Map.prototype.isMenuCalled = function () {
    if (MapPlay.isRunning()) return false;
    return _PAS_Scene_Map_isMenuCalled.call(this);
  };

  // Leaving the map (a battle, a transfer, the title screen) drops whatever was
  // queued: the encounter itself is already recorded as answered.
  const _PAS_Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    MapPlay.stop();
    _PAS_Scene_Map_terminate.call(this);
  };

  // ==========================================================================
  // EXPORTS
  // ==========================================================================

  window.ProceduralAdventure = {
    Space: Anomaly,
    Earth,
    MapPlay,
    Stage,
    isPlaying() { return MapPlay.isRunning(); },
    // A reward line, unwrapped: the words, and the IconSet cell it is drawn
    // with. Any presenter that shows a payout reads it through these.
    lineText: anomLineText,
    lineIcon: anomLineIcon,
    lineCount: anomLineCount,
    // What the party's band is worth: the tests (and anything pricing an
    // ending against it) read the brackets through here.
    brackets: ANOM_BRACKETS,
    bracketFor: anomBracket,
    goldPayout: anomGoldPayout,
  };

  // GalaxySim_Scene3D / _Overlay / _Bodies still ask for the star-map encounter
  // by its old name.
  window.GalaxySim = window.GalaxySim || {};
  window.GalaxySim.Anomaly = Anomaly;
})();
