/*:
 * @target MZ
 * @plugindesc NPC Life: adventuring bands of real people
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Death
 * @help
 * ============================================================================
 * NPCLife_Bands, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns ADVENTURING BANDS (NPCLifeSim.Bands) and NPCLifeSim.situationAt, and
 * BANDS ON THE FLOORS: where the real bands are put down on the Omega Tower
 * and off it, installed onto DungeonFloors.realBands (moved here from
 * Map/DungeonFloorSystem.js).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLife_Death.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    getProfile, getRecords, inPartyNamed, invalidatePopulation, isEmptyWorld, isMinor, LifeRng,
    MINUTES_PER_DAY, nameHash, nowMinuteOf, pushLifeEvent, worldSeed,
  } = window.NPCLifeSim._internal;

  // ==========================================================================
  // ADVENTURING BANDS, real people on expeditions
  // ==========================================================================
  // The bands that climb the Omega Tower, go down into the cellars, dens and
  // sewers under the world, and fly out of the low orbit ship are people of
  // this world: each is drafted out of the real population, a leader and one
  // to three companions, some from the leader's own town and some from other
  // towns, picked by how close their level is to the band's, whether they
  // stand and fight (NPCSkirmish.isFighter) and what they can afford to kit
  // themselves out with.
  //
  // A band is a record first, $gameSystem._npcBands[id]:
  //   { id, kind, members, leader, level, floorRange, floors, since, until,
  //     base, homes }
  //   kind       "tower", "dungeon" or "space"
  //   floorRange [lowest, highest] tower floor the band works (tower only)
  //   since/until the expedition, in simulation minutes (days to weeks)
  //   base       the leader's home group, or SPACE_BASE for a space crew
  // While an expedition runs its members are away from their home town the
  // same way a traveller on a trip is (isAwayFromTown), except a <Local>, who
  // is written into their own map and stays met there as well.
  //
  // Who is never drafted: children, anything non-sentient, prisoners, people
  // holding an office or on duty as an officer, the party, a <Story> character,
  // anybody already away, dead or on leave.
  //
  // When an expedition is over its members come home hurt, richer or with
  // nothing to show for it, and now and then one of them does not come home
  // at all (NPCLifeSim.killNpc, the one death path). Everything is resolved
  // in the life-sim catch-up and the draft runs once a game month, so nothing
  // here runs per frame; a map only ASKS who is on it (forPlace).
  //
  // Where they are met: the tower floor that is theirs today, an underground
  // procedural map now and then, and (very rarely) an alien world for a space
  // crew out on a trip. A space crew sits out the days between trips on the
  // low orbit ship's lower deck (SPACE_BASE_MAPS). On an airless world a
  // member of this world wears the EVA suit; somebody whose sheet is `aliens`
  // breathes out there unaided and keeps their own face (suitSheet).

  // i18n-ignore-start: band kind ids, record keys and life event types
  const BAND_TOWER = "tower";
  const BAND_DUNGEON = "dungeon";
  const BAND_SPACE = "space";
  const BAND_KINDS = [BAND_TOWER, BAND_DUNGEON, BAND_SPACE];
  const BAND_EVENT = "band";
  const SPACE_BASE = "space:lowOrbit";
  // i18n-ignore-end
  // How many bands of each kind are out at once, world-wide, at most. The
  // draft scales them with the world's sentient adults (BAND_ADULTS_PER: one
  // band of that kind for every so many), never under one and never over
  // these, so a small world is not bled dry by the tower.
  const BAND_CAPS = { tower: 8, dungeon: 4, space: 2 };
  const BAND_ADULTS_PER = { tower: 150, dungeon: 300, space: 600 };
  const BAND_SIZE = { tower: [2, 3], dungeon: [2, 3], space: [2, 4] };
  const BAND_DRAFT_DAYS = 30;                 // one draft a game month
  const BAND_TRIP_DAYS = [3, 21];             // an expedition: days to weeks
  const BAND_LEVEL_REACH = 6;                 // companions within this of the leader
  const BAND_SAME_TOWN = 0.5;                 // a companion's chance of sharing the leader's town
  const BAND_OUTCOME = { dead: 0.02, hurt: 0.34, rich: 0.3 };
  const BAND_FLOOR_REACH = 5;                 // floors either side of the band's own
  const BAND_UNDERGROUND_CHANCE = 0.35;       // a dungeon band met on an underground map
  const BAND_ALIEN_CHANCE = 0.04;             // a space crew met on an alien world: rare
  const SPACE_OUT_DAYS = 4;                   // a space crew flies this long...
  const SPACE_BASE_DAYS = 2;                  // ...and sits this long on the ship between trips
  // The low orbit ship: map 721 is the party's own bridge and nobody is put
  // inside it (NPCSystem NPC_FREE_MAP_IDS), so its lower deck is the crews' base.
  const SPACE_BASE_MAPS = [354];
  const BAND_HISTORY_CAP = 20;
  const EVA_FALLBACK_SHEET = "Skab/Originals/!$MargheritaHackEVA"; // i18n-ignore: sprite asset path

  let _bandIndex = null;                      // { key, byName: Map(name -> band) }

  function bandState() {
    if (!$gameSystem) return null;
    if (!$gameSystem._npcBands || typeof $gameSystem._npcBands !== "object") $gameSystem._npcBands = {};
    if (!$gameSystem._npcBandsMeta || typeof $gameSystem._npcBandsMeta !== "object") {
      $gameSystem._npcBandsMeta = { lastDraft: null, seq: 0, history: [] };
    }
    return { bands: $gameSystem._npcBands, meta: $gameSystem._npcBandsMeta };
  }

  // name -> the band they are in (drafted, set out or not yet), rebuilt only
  // when the set of bands changes.
  function bandIndex() {
    const st = bandState();
    if (!st) return new Map();
    const key = Object.keys(st.bands).join("|") + "#" + (st.meta.seq || 0);
    if (_bandIndex && _bandIndex.key === key && _bandIndex.src === st.bands) return _bandIndex.byName;
    const byName = new Map();
    for (const band of Object.values(st.bands)) {
      for (const n of (band?.members || [])) byName.set(n, band);
    }
    _bandIndex = { key, src: st.bands, byName };
    return byName;
  }

  function bandsChanged() { _bandIndex = null; }

  // The band `name` is out with at this minute, or null.
  function bandOn(name, minute) {
    const band = bandIndex().get(name);
    if (!band) return null;
    const now = Number(minute ?? nowMinuteOf()) || 0;
    return (now >= band.since && now < band.until) ? band : null;
  }

  function isStoryPerson(name, profile) {
    if (profile?._story) return true;
    try { return !!window.NPCSystem?.isStoryName?.(name); } catch (e) { return false; }
  }

  // Who may be drafted at all.
  function mayJoinBand(record, profile) {
    if (!record || !profile || !record.name || record.dead) return false;
    const name = record.name;
    if (record.nonSentient || record.child || isMinor(name, profile)) return false;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
    if (record.inPrisonUntilMinute != null || record.trip) return false;
    if (record.refugee && record.refugee.status === "fleeing") return false; // i18n-ignore: refugee status id
    if (profile._killed || profile.downed || profile.playerCreated) return false;
    if (profile._officer || profile._erisLawyerJobLocked) return false;
    // A minister does not leave the capital to go adventuring (NPCPolitics).
    if (profile._politicsOffice) return false;
    if (profile.leave && Number(profile.leave.untilMin) > nowMinuteOf()) return false;
    try { if (window.NPCPolitics?.getIdentity?.(name)?.localOffice) return false; } catch (e) { /* no identity */ }
    if (inPartyNamed(name)) return false;
    if (isStoryPerson(name, profile)) return false;
    if (window.NPCSystem?.isNameGone?.(name)) return false;
    if (bandIndex().has(name)) return false;
    return true;
  }

  // Somebody who stands and fights, asked of the skirmish code when it is
  // loaded so the two never disagree.
  function isBandFighter(name, profile) {
    const SK = window.NPCSkirmish;
    try {
      if (SK?.who && SK?.isFighter) return !!SK.isFighter(SK.who(name, profile, null));
    } catch (e) { /* fall through */ }
    return !!(profile?._officer || profile?._brave);
  }

  // How much a drafter wants this person: a fighter first, and somebody who
  // can pay for their own kit over somebody who cannot.
  function bandWeight(name, profile) {
    const tier = Math.max(0, Math.min(4, Number(profile?.wealthTierBase) || 0));
    return (isBandFighter(name, profile) ? 3 : 1) * (1 + tier * 0.25);
  }

  function weightedPick(rng, list) {
    let total = 0;
    for (const c of list) total += c.w;
    if (total <= 0) return null;
    let roll = rng.next() * total;
    for (const c of list) {
      roll -= c.w;
      if (roll <= 0) return c;
    }
    return list[list.length - 1] || null;
  }

  // The tower floors a band of this level works: a run of floors either side
  // of one the tower says holds creatures of that level (DungeonFloors), or,
  // without the tower loaded, the upper floors whose number is the level.
  function towerFloorsFor(level, rng) {
    let floors = [];
    try { floors = window.DungeonFloors?.floorsForLevel?.(level, BAND_LEVEL_REACH) || []; } catch (e) { floors = []; }
    if (!floors.length) {
      for (let f = Math.max(2, level - BAND_LEVEL_REACH); f <= Math.min(99, level + BAND_LEVEL_REACH); f++) floors.push(f);
      if (!floors.length) floors.push(Math.max(2, Math.min(99, level)));
    }
    const pivot = floors[Math.floor(rng.next() * floors.length)];
    const run = floors.filter(f => Math.abs(f - pivot) <= BAND_FLOOR_REACH && (f > 0) === (pivot > 0)).sort((a, b) => a - b);
    return run.length ? run : [pivot];
  }

  // Draws one band of `kind` out of the candidate pool. Returns the record, or
  // null when there are not two people to make a band of.
  function draftBand(kind, pool, nowMinute, rng, seq) {
    const leaderPick = weightedPick(rng, pool);
    if (!leaderPick) return null;
    const leader = leaderPick;
    const level = Math.max(1, Number(leader.profile.level) || 1);
    const [minSize, maxSize] = BAND_SIZE[kind] || [2, 3];
    const size = rng.int(minSize, maxSize);
    const near = pool.filter(c => c !== leader && Math.abs((Number(c.profile.level) || 1) - level) <= BAND_LEVEL_REACH);
    const members = [leader];
    const taken = new Set([leader.name]);
    for (let i = 1; i < size; i++) {
      const sameTown = rng.next() < BAND_SAME_TOWN;
      const free = near.filter(c => !taken.has(c.name));
      let from = free.filter(c => (c.home === leader.home) === sameTown);
      if (!from.length) from = free;
      const pick = weightedPick(rng, from);
      if (!pick) break;
      members.push(pick);
      taken.add(pick.name);
    }
    if (members.length < 2) return null;
    const since = nowMinute + rng.int(0, 5) * MINUTES_PER_DAY + rng.int(6, 12) * 60;
    const until = since + rng.int(BAND_TRIP_DAYS[0], BAND_TRIP_DAYS[1]) * MINUTES_PER_DAY;
    const band = {
      id: kind + ":" + seq + ":" + nowMinute, // i18n-ignore: record key
      kind, level,
      members: members.map(c => c.name),
      leader: leader.name,
      homes: Object.fromEntries(members.map(c => [c.name, c.home])),
      floorRange: null, floors: null,
      since, until,
      base: kind === BAND_SPACE ? SPACE_BASE : leader.home,
    };
    if (kind === BAND_TOWER) {
      band.floors = towerFloorsFor(level, rng);
      band.floorRange = [band.floors[0], band.floors[band.floors.length - 1]];
    }
    return band;
  }

  // The caps for a world of `adults` sentient grown-ups (BAND_ADULTS_PER).
  function capsFor(adults) {
    const n = Math.max(0, Number(adults) || 0);
    const out = {};
    for (const kind of BAND_KINDS) {
      out[kind] = Math.max(1, Math.min(BAND_CAPS[kind] || 0, Math.round(n / (BAND_ADULTS_PER[kind] || 1))));
    }
    return out;
  }

  // The living sentient adults of the world, counted off the life records.
  function sentientAdults(records) {
    let n = 0;
    for (const name in records) {
      const r = records[name];
      if (r && !r.dead && !r.nonSentient && !r.child) n++;
    }
    return n;
  }

  // The draft: the people who may go, bands drawn for every kind short of its
  // cap, and a life event on each member for the day they set out.
  function draftBands(nowMinute) {
    const st = bandState();
    const records = getRecords();
    if (!st || !records) return 0;
    const caps = capsFor(sentientAdults(records));
    const rng = new LifeRng((nameHash("npcBands_" + Math.floor(nowMinute / MINUTES_PER_DAY)) ^ worldSeed()) >>> 0);
    const pool = [];
    // A floor of the Omega Tower drafts nobody while the party is away: its
    // people stand still (NPCShared.towerIdle).
    const towerIdle = window.NPCShared?.towerIdle?.() || null;
    for (const name of Object.keys(records).sort()) {
      const record = records[name];
      const profile = getProfile(name);
      if (towerIdle && towerIdle.group(record?.homeGroup || profile?._homeGroupName)) continue;
      if (!mayJoinBand(record, profile)) continue;
      pool.push({ name, profile, home: record.homeGroup || profile._homeGroupName || null, w: bandWeight(name, profile) });
    }
    let made = 0;
    for (const kind of BAND_KINDS) {
      const have = Object.values(st.bands).filter(b => b && b.kind === kind).length;
      for (let n = have; n < (caps[kind] || 0); n++) {
        const free = pool.filter(c => !bandIndex().has(c.name));
        if (free.length < 2) break;
        st.meta.seq = (st.meta.seq || 0) + 1;
        const band = draftBand(kind, free, nowMinute, rng, st.meta.seq);
        if (!band) break;
        st.bands[band.id] = band;
        bandsChanged();
        made++;
        const key = "NPCLife.event.bandSetOut." + kind;
        for (const m of band.members) {
          const r = records[m];
          if (r && Array.isArray(r.lifeEvents)) {
            pushLifeEvent(r, band.since, BAND_EVENT, key, { leader: band.leader });
          }
        }
      }
    }
    return made;
  }

  // An expedition over: what each member comes home with.
  function finishBand(band, nowMinute) {
    const st = bandState();
    const records = getRecords() || {};
    const outcomes = {};
    for (const name of band.members || []) {
      const record = records[name];
      const profile = getProfile(name);
      if (!record || record.dead) continue;
      const rng = new LifeRng((nameHash(band.id + "_" + name) ^ worldSeed()) >>> 0);
      const roll = rng.next();
      const level = Math.max(1, Number(profile?.level) || band.level || 1);
      let outcome = "plain"; // i18n-ignore: band outcome id
      // A <Local> is written into their own map and met there all along, so
      // they are never the one who does not come back.
      const mayDie = !profile?._localNpc && typeof window.NPCLifeSim?.killNpc === "function";
      if (roll < BAND_OUTCOME.dead && mayDie) outcome = "dead"; // i18n-ignore: band outcome id
      else if (roll < BAND_OUTCOME.dead + BAND_OUTCOME.hurt) outcome = "hurt"; // i18n-ignore: band outcome id
      else if (roll < BAND_OUTCOME.dead + BAND_OUTCOME.hurt + BAND_OUTCOME.rich) outcome = "rich"; // i18n-ignore: band outcome id
      outcomes[name] = outcome;
      const when = Math.min(nowMinute, band.until);
      if (outcome === "dead") {
        pushLifeEvent(record, when, BAND_EVENT, "NPCLife.event.bandLost." + band.kind, {});
        try { window.NPCLifeSim.killNpc(name, { kind: "expedition", by: null }); } // i18n-ignore: death cause id
        catch (e) { console.error("[NPCLifeSim] an expedition death failed", e); }
        continue;
      }
      if (outcome === "hurt" && profile) {
        const mhp = Math.max(1, Number(profile.mhp) || 100);
        profile.hp = Math.max(1, Math.min(Number(profile.hp ?? mhp) || mhp, Math.round(mhp * 0.35)));
      }
      if (outcome === "rich" && profile && window.NPCCreature?.mayHoldMoney?.(profile, name) !== false) {
        profile.money = Math.max(0, Number(profile.money) || 0) + level * rng.int(20, 60);
      }
      pushLifeEvent(record, when, BAND_EVENT, "NPCLife.event.bandBack." + outcome + "." + band.kind, {});
    }
    delete st.bands[band.id];
    bandsChanged();
    const hist = Array.isArray(st.meta.history) ? st.meta.history : (st.meta.history = []);
    hist.push({ id: band.id, kind: band.kind, members: band.members.slice(), since: band.since, until: band.until, outcomes });
    if (hist.length > BAND_HISTORY_CAP) hist.splice(0, hist.length - BAND_HISTORY_CAP);
    try { invalidatePopulation(); } catch (e) { /* no cache yet */ }
    return outcomes;
  }

  // The catch-up's call, and every reader's lazily: expeditions that are over
  // are closed, and a new draft is held once a game month.
  function resolveBands(nowMinute) {
    const st = bandState();
    if (!st || isEmptyWorld()) return;
    const now = Number(nowMinute ?? nowMinuteOf()) || 0;
    for (const band of Object.values(st.bands)) {
      if (!band) continue;
      // A member who died some other way is simply not in the band any more.
      band.members = (band.members || []).filter(n => !getRecords()?.[n]?.dead);
      if (band.members.length === 0 || now >= band.until) finishBand(band, now);
    }
    const last = st.meta.lastDraft;
    if (last == null || now - last >= BAND_DRAFT_DAYS * MINUTES_PER_DAY || now < last) {
      st.meta.lastDraft = now;
      draftBands(now);
    }
  }

  // Away from their home town on an expedition. A <Local> never is: they are
  // shown on their own map and also met with the band.
  function bandAwayFromTown(name, minute) {
    const band = bandOn(name, minute);
    if (!band) return false;
    return !getProfile(name)?._localNpc;
  }

  // Which schedule id an hour of this person's life is, when a band has it.
  function bandActivityAt(name, minute) {
    const band = bandOn(name, minute);
    if (!band) return null;
    // i18n-ignore-start: routine activity ids
    if (band.kind === BAND_SPACE) return "exploringSpace";
    return band.kind === BAND_TOWER ? "exploringTower" : "exploringDungeon";
    // i18n-ignore-end
  }

  // A space crew between trips: sitting on the ship's lower deck.
  function spaceCrewAtBase(band, minute) {
    if (!band || band.kind !== BAND_SPACE) return false;
    const now = Number(minute ?? nowMinuteOf()) || 0;
    if (now < band.since || now >= band.until) return false;
    const day = Math.floor((now - band.since) / MINUTES_PER_DAY);
    return (day % (SPACE_OUT_DAYS + SPACE_BASE_DAYS)) >= SPACE_OUT_DAYS;
  }

  function atSpaceBase(minute) {
    const st = bandState();
    if (!st) return [];
    const out = [];
    for (const band of Object.values(st.bands)) {
      if (!spaceCrewAtBase(band, minute)) continue;
      for (const n of band.members) if (!getRecords()?.[n]?.dead) out.push(n);
    }
    return out.sort();
  }

  function isSpaceBaseMap(mapId) {
    return SPACE_BASE_MAPS.includes(Number(mapId));
  }

  // Does this sheet breathe an airless world unaided? GalaxySim's EVA answer
  // when it is loaded, the NPCs.json `aliens` flag otherwise.
  function breathesUnaided(sheet) {
    const EVA = window.GalaxySim?.EVA;
    if (EVA && typeof EVA.breathesUnaided === "function") {
      try { return !!EVA.breathesUnaided(sheet); } catch (e) { /* fall through */ }
    }
    if (!sheet) return true;
    if (window.AlienOrigins?.isAlienSprite?.(sheet)) return true;
    const entry = window.WorldGen?.NPCs?.[sheet];
    return !!(entry && (entry.aliens === true || entry.animal === true || entry.creature === true));
  }

  // The sheet a member is drawn on: a person of this world on an airless
  // world wears the EVA suit, anybody else keeps their own.
  function suitSheet(sheet, airless) {
    if (!airless || !sheet || breathesUnaided(sheet)) return sheet;
    return window.GalaxySim?.EVA?.SPRITE || EVA_FALLBACK_SHEET;
  }

  function dayOf(minute) { return Math.floor((Number(minute) || 0) / MINUTES_PER_DAY); }

  // A roll in [0, 1) off a key, mixed so that keys differing only in their
  // last characters (one map square and the next) still roll apart.
  function keyRoll(key) {
    let h = nameHash(key) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // The tower floor a band is on today, one of its own run of floors.
  function bandFloorToday(band, minute) {
    const floors = Array.isArray(band?.floors) && band.floors.length ? band.floors : null;
    if (!floors) return null;
    return floors[Math.floor(keyRoll(band.id + "_floor_" + dayOf(minute)) * floors.length)];
  }

  // A member as a map puts them down.
  function bandMemberView(band, name, airless) {
    const profile = getProfile(name);
    if (!profile || getRecords()?.[name]?.dead || profile._killed) return null;
    if (inPartyNamed(name)) return null;
    const level = Math.max(1, Number(profile.level) || band.level || 1);
    const mhp = Math.max(1, Number(profile.mhp) || 100);
    const share = Math.max(0.2, Math.min(1, (Number(profile.hp ?? mhp) || mhp) / mhp));
    const own = profile.spriteKey || "";
    const sheet = suitSheet(own, !!airless);
    return {
      name, level, real: true, bandId: band.id,
      hp: Math.max(1, Math.round((30 + level * 6) * share)),
      characterName: sheet,
      characterIndex: sheet === own ? (Number(profile.bustIndex) || 0) : 0,
      originWorld: null,
      alien: breathesUnaided(own) && !!own,
      suited: sheet !== own,
    };
  }

  // Who is met here. `place`:
  //   { kind: "tower", floor, level }   a tower floor
  //   { kind: "underground", key }       an underground procedural map
  //   { kind: "alien", key, airless }    an alien world
  // Answers [{ id, kind, members: [view] }], leader first, at most `max` bands.
  function bandsForPlace(place, max) {
    if (!place) return [];
    const now = nowMinuteOf();
    resolveBands(now);
    const st = bandState();
    if (!st) return [];
    const limit = Math.max(0, Number(max ?? 3));
    const out = [];
    const bands = Object.values(st.bands).filter(Boolean).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const band of bands) {
      if (out.length >= limit) break;
      if (now < band.since || now >= band.until) continue;
      let here = false;
      if (place.kind === BAND_TOWER && band.kind === BAND_TOWER) {
        here = bandFloorToday(band, now) === place.floor;
      } else if (place.kind === "underground" && band.kind === BAND_DUNGEON) { // i18n-ignore: place kind id
        const roll = keyRoll(band.id + "_under_" + dayOf(now) + "_" + (place.key || ""));
        here = roll < BAND_UNDERGROUND_CHANCE;
      } else if (place.kind === "alien" && band.kind === BAND_SPACE && !spaceCrewAtBase(band, now)) { // i18n-ignore: place kind id
        const roll = keyRoll(band.id + "_alien_" + dayOf(now) + "_" + (place.key || ""));
        here = roll < BAND_ALIEN_CHANCE;
      }
      if (!here) continue;
      const order = [band.leader, ...band.members.filter(n => n !== band.leader)];
      const members = order.map(n => bandMemberView(band, n, place.airless)).filter(Boolean);
      if (members.length) out.push({ id: band.id, kind: band.kind, members });
    }
    return out;
  }

  // One of them fell where the party could see it (DungeonFloorSystem
  // bandFell): the one death path, and out of the band.
  function bandMemberFell(name, where) {
    const band = bandIndex().get(name);
    if (!band) return false;
    band.members = band.members.filter(n => n !== name);
    if (band.leader === name) band.leader = band.members[0] || null;
    bandsChanged();
    const record = getRecords()?.[name];
    if (record && Array.isArray(record.lifeEvents)) {
      pushLifeEvent(record, nowMinuteOf(), BAND_EVENT, "NPCLife.event.bandLost." + band.kind, {});
    }
    if (typeof window.NPCLifeSim?.killNpc === "function") {
      try { window.NPCLifeSim.killNpc(name, { kind: "expedition", by: where || null }); } // i18n-ignore: death cause id
      catch (e) { console.error("[NPCLifeSim] a fallen climber's death failed", e); }
    }
    return true;
  }

  // Somebody talked into an expedition (Empathize, Invite to an expedition):
  // they join a band of that kind that has not set out yet, has room and
  // works within reach of their level, or else raise one of their own, drafted
  // like any other (draftBand) with them as the leader. `opts.floor` points a
  // tower band at the floor the party named. Answers { band, joined } or
  // null when they may not go or nobody could be found to go with them.
  function enlistBand(name, kind, opts) {
    const o = opts || {};
    const st = bandState();
    const records = getRecords();
    if (!st || !records) return null;
    const k = BAND_KINDS.includes(kind) ? kind : BAND_TOWER;
    const record = records[name];
    const profile = getProfile(name);
    if (!mayJoinBand(record, profile)) return null;
    const now = Number(o.now ?? nowMinuteOf()) || 0;
    const level = Math.max(1, Number(profile.level) || 1);
    const home = record.homeGroup || profile._homeGroupName || null;
    const maxSize = (BAND_SIZE[k] || [2, 3])[1];
    const floor = Number.isFinite(Number(o.floor)) && o.floor !== null ? Number(o.floor) : null;
    const key = "NPCLife.event.bandSetOut." + k;
    const open = Object.values(st.bands).find(b => b && b.kind === k && b.since > now &&
      (b.members || []).length < maxSize && Math.abs((Number(b.level) || 1) - level) <= BAND_LEVEL_REACH &&
      (k !== BAND_TOWER || floor == null || (b.floors || []).includes(floor)));
    if (open) {
      open.members.push(name);
      open.homes = open.homes || {};
      open.homes[name] = home;
      bandsChanged();
      if (Array.isArray(record.lifeEvents)) pushLifeEvent(record, open.since, BAND_EVENT, key, { leader: open.leader });
      return { band: open, joined: true };
    }
    const pool = [{ name, profile, home, w: 1e9 }];
    for (const n of Object.keys(records).sort()) {
      if (n === name) continue;
      const p = getProfile(n);
      if (!mayJoinBand(records[n], p)) continue;
      pool.push({ name: n, profile: p, home: records[n].homeGroup || p._homeGroupName || null, w: bandWeight(n, p) });
    }
    st.meta.seq = (st.meta.seq || 0) + 1;
    const rng = new LifeRng((nameHash("npcBandEnlist_" + name + "_" + now) ^ worldSeed()) >>> 0);
    const band = draftBand(k, pool, now, rng, st.meta.seq);
    if (!band || band.leader !== name) return null;
    if (k === BAND_TOWER && floor != null) {
      band.floors = [floor];
      band.floorRange = [floor, floor];
    }
    st.bands[band.id] = band;
    bandsChanged();
    for (const m of band.members) {
      const r = records[m];
      if (r && Array.isArray(r.lifeEvents)) pushLifeEvent(r, band.since, BAND_EVENT, key, { leader: band.leader });
    }
    return { band, joined: false };
  }

  window.NPCLifeSim.Bands = {
    KINDS: BAND_KINDS,
    CAPS: BAND_CAPS,
    ADULTS_PER: BAND_ADULTS_PER,
    capsFor,
    capsNow() { return capsFor(sentientAdults(getRecords() || {})); },
    SPACE_BASE_MAPS,
    LEVEL_REACH: BAND_LEVEL_REACH,
    all() { return Object.values(bandState()?.bands || {}); },
    history() { return (bandState()?.meta?.history || []).slice(); },
    bandOf: (name) => bandIndex().get(name) || null,
    activeBandOf: bandOn,
    activityAt: bandActivityAt,
    isAway: bandAwayFromTown,
    mayJoin(name) { return mayJoinBand(getRecords()?.[name], getProfile(name)); },
    resolve: resolveBands,
    draft: draftBands,
    enlist: enlistBand,
    finish: finishBand,
    forPlace: bandsForPlace,
    floorToday: bandFloorToday,
    atSpaceBase,
    isSpaceBaseMap,
    crewAtBase: spaceCrewAtBase,
    suitSheet,
    breathesUnaided,
    memberFell: bandMemberFell,
  };
  window.NPCLifeSim._internals.draftBand = draftBand;

  // What the life has somebody doing at a given minute, when it is not their
  // own town's day: out with a band, on a trip, or in the middle of a move.
  // The schedule (NPCSim RoutineManager) reads it for every hour it shows, so
  // the Empathize routine tells the truth about the days they were away.
  function lifeSituationAt(name, minute) {
    const now = Number(minute ?? nowMinuteOf()) || 0;
    const band = bandActivityAt(name, now);
    if (band) return band;
    const record = getRecords()?.[name];
    if (!record) return null;
    const moving = record.relocating;
    if (moving && now >= moving.sinceMin && now < moving.untilMin) return "relocating"; // i18n-ignore: routine activity id
    const trip = record.trip || null;
    if (trip && now >= (Number(trip.leftAtMinute) || 0) && now < (Number(trip.homeByMinute) || 0)) return "travelling"; // i18n-ignore: routine activity id
    return null;
  }
  window.NPCLifeSim.situationAt = lifeSituationAt;

  // ==========================================================================
  // BANDS ON THE FLOORS, where the real bands are put down
  // ==========================================================================
  // The Omega Tower's floors are Map/DungeonFloorSystem.js's; who of the
  // world stands on one, and on the underground squares and alien worlds off
  // the tower, is decided here and put down with the floor's own helpers
  // (DungeonFloors._bandHost). Installed as DungeonFloors.realBands, which the
  // floor asks on every arrival.
  function installFloorBands(DF) {
    const {
      BAND_MAX_SIZE, PROC_MAP_ID, createSeededRandom, dungeonWorldSeed, towerStructureKeys,
      currentTowerFloor, bandMembers, bandReservedKeys, bandFindAnchor, bandSpotsAround,
      bandSpawnMember,
    } = DF._bandHost;

    // The world's own adventurers (NPCLifeSim.Bands), when the life simulation
    // is loaded. Without it the tower keeps its made-up climbers alone.
    function bandRealService() {
      const B = window.NPCLifeSim && window.NPCLifeSim.Bands;
      return B && typeof B.forPlace === "function" ? B : null;
    }

    // Puts down the real bands that are here, each standing together as a band
    // does. Answers how many bands and people were placed.
    function bandPlaceReal(place, reserved, maxBands) {
      const out = { bands: 0, spawned: 0 };
      const B = bandRealService();
      if (!B || maxBands <= 0) return out;
      let list = [];
      try { list = B.forPlace(place, maxBands) || []; } catch (e) {
        console.error("[DungeonFloorSystem] could not ask who is out adventuring", e);
        list = [];
      }
      if (!list.length) return out;
      const rng = createSeededRandom("realBands:" + dungeonWorldSeed() + ":" +  // i18n-ignore: seed string
        (place.floor != null ? place.floor : place.key || "") + ":" + Graphics.frameCount);
      for (const band of list.slice(0, maxBands)) {
        const members = (band.members || []).filter((m) => m && m.characterName).slice(0, BAND_MAX_SIZE);
        if (!members.length) continue;
        const anchor = bandFindAnchor(rng, reserved, members.length);
        if (!anchor) continue;
        const spots = bandSpotsAround(anchor, members.length, reserved);
        const bandId = "real:" + band.id + ":" + Graphics.frameCount;  // i18n-ignore: internal key
        let placed = 0;
        for (let i = 0; i < spots.length && i < members.length; i++) {
          reserved.add(spots[i].x + "," + spots[i].y);
          if (bandSpawnMember(members[i], spots[i].x, spots[i].y, bandId, i === 0)) placed++;
        }
        if (placed) { out.bands++; out.spawned += placed; }
      }
      return out;
    }

    // The underground procedural maps a band goes down into: every structure the
    // procedural catalogue deals under the world (a cellar, a den, a crypt, the
    // sewers), or this list when the catalogue is not loaded.
    const BAND_UNDERGROUND_FALLBACK = ["Dungeon", "Crypt", "LootCellar", "CaveDen", "Sewer",  // i18n-ignore: biome ids
      "TempleInside", "Catacombs", "Mineshaft"];  // i18n-ignore: biome ids

    function bandIsUnderground(biome) {
      if (!biome) return false;
      const keys = towerStructureKeys().map((st) => st.key);
      return keys.indexOf(biome) >= 0 || BAND_UNDERGROUND_FALLBACK.indexOf(biome) >= 0;
    }

    // One of the alien biomes a landing puts the party on (AlienBiomes.json).
    function bandIsAlienBiome(biome) {
      if (!biome) return false;
      const alien = window.WorldGen && window.WorldGen.AlienBiomes;
      if (alien && typeof alien === "object" && !Array.isArray(alien) && alien[biome]) return true;
      return /^Alien[A-Z]/.test(String(biome));
    }

    // Which of the other places a band may be met this is, if any: an
    // underground procedural map off the tower, or an alien world.
    function bandExpeditionPlace() {
      if (typeof $gameMap === "undefined" || !$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return null;
      if (currentTowerFloor()) return null;
      const pg = $gameSystem && $gameSystem._procGenData;
      const biome = pg && pg.currentBiome;
      if (!biome) return null;
      const key = biome + "@" + (pg.originX || 0) + "," + (pg.originY || 0);  // i18n-ignore: internal key
      if (bandIsUnderground(biome)) return { kind: "underground", key, biome };  // i18n-ignore: place kind id
      if (bandIsAlienBiome(biome)) {
        const EVA = window.GalaxySim && window.GalaxySim.EVA;
        let airless = false;
        try { airless = !!(EVA && typeof EVA.required === "function" && EVA.required()); } catch (e) { airless = false; }
        return { kind: "alien", key, biome, airless };  // i18n-ignore: place kind id
      }
      return null;
    }

    // Off the tower: the real bands down here or out here, and nobody else.
    function bandSpawnExpeditions() {
      if (typeof $dataMap === "undefined" || !$dataMap) return 0;
      if (!bandRealService()) return 0;
      const place = bandExpeditionPlace();
      if (!place) return 0;
      if (bandMembers().length) return 0;
      return bandPlaceReal(place, bandReservedKeys(), place.kind === "alien" ? 1 : 2).spawned;  // i18n-ignore: place kind id
    }

    DF.realBands = {
      service: bandRealService,
      placeReal: bandPlaceReal,
      expeditionPlace: bandExpeditionPlace,
      spawnExpeditions: bandSpawnExpeditions,
    };
    DF.bandExpeditionPlace = bandExpeditionPlace;
    DF.spawnExpeditions = bandSpawnExpeditions;
  }
  if (window.DungeonFloors && window.DungeonFloors._bandHost) installFloorBands(window.DungeonFloors);

  Object.assign(window.NPCLifeSim._internal, {
    bandAwayFromTown, resolveBands,
  });
})();
