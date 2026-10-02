/*:
 * @target MZ
 * @plugindesc NPC System: the zombie apocalypse
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Hooks
 * @help
 * ============================================================================
 * NPCSystem_Zombies, part of the NPCSystem family
 * ============================================================================
 * Owns the zombie world: the risen crowd, their fights, their gaits.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Hooks.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    Config, isBetaSprite, SpawnManager, Utils,
  } = window.NPCSystem._internal;

  // ---- zombie apocalypse -----------------------------------------------
  // Nine people in ten never made it, and they are still walking. A zombie
  // world is populated exactly like any other, its crowd dealt into the same
  // slots and living the same routines, only nine faces in ten come off the
  // Zombies/ half of the wardrobe (the `zombie` entries of NPCs.json, see
  // SpriteCatalog.zombieKeys) instead of the ordinary one. Walk into one of
  // them and there is no conversation to be had: the fight starts where you
  // are standing (see startZombieBattle).
  //
  // Which slot is a corpse is seeded on (map, event, world seed) rather than
  // rolled, so the same street holds the same dead every time it is walked
  // into and two savegames of one world agree about who did not make it.
  const ZOMBIE_TINT = 0x4f7a2e;        // the green a zombie's body is fought in
  const ZOMBIE_TROOP_ID = 2;           // the generic person troop, as the Empathize attack uses

  function zombieSheetPool() {
    const SC = window.SpriteCatalog;
    const list = (SC && SC.zombieKeys) ? SC.zombieKeys() : [];
    return list.filter(k => !isBetaSprite(k));
  }

  // Is this sheet one of the dead? Asked of whatever graphic an event is
  // wearing, so a citizen dealt a zombie face by the procedural population
  // pass (NPCSociety, through SpriteCatalog.pickNpcKey) counts exactly as one
  // re-skinned here does.
  function isZombieSheet(name) {
    const SC = window.SpriteCatalog;
    return !!(name && SC && SC.isZombieSheet && SC.isZombieSheet(name));
  }

  // One of the dead walking, and only ever in a zombie world. Only a person
  // rises: an authored prop or tutorial figure that happens to wear a sheet
  // out of the Zombies/ folder is set dressing, and a written character never
  // rises at all (see zombifyMapNPCs).
  function isZombieWalker(ev) {
    if (!ev || ev._erased || ev._npcZombieDead || !Config.isZombieWorld()) return false;
    if (!isZombieSheet(ev.characterName && ev.characterName())) return false;
    if (ev._npcZombieSheet) return true;
    const data = ev.event ? ev.event() : null;
    if (!data) return false;
    const note = data.note || "";
    if (Utils.hasStoryTag(note)) return false;
    return Utils.isNPCEvent(note) || String(data.name || "").startsWith("NPC"); // i18n-ignore: event name matched at runtime
  }

  // The sheet this slot rose in, or null if whoever stood here made it. Pure
  // in (map, event, world seed), so the answer never changes.
  function zombieSheetFor(ev) {
    const pool = zombieSheetPool();
    if (!pool.length || !ev || !ev.event) return null;
    const seedBase = (window.HistoryManager && window.HistoryManager.getSeed)
      ? window.HistoryManager.getSeed() : 19002001;
    // A minted event's id depends on how many people were dealt before it, so
    // the dead among them are decided by who they are, not where they landed.
    const idPart = ev._npcMinted ? (Utils.nameHash(ev.event()?.name || "") >>> 0) : ev.eventId();
    let h = ($gameMap.mapId() * 73856093) ^ (idPart * 19349663) ^ seedBase;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    if ((h % 1000) / 1000 >= Config.ZOMBIE_SHEET_CHANCE) return null;  // a survivor
    return pool[(h >>> 10) % pool.length];
  }

  // Writing the page data as well as the sprite, the same way a shop persona is
  // applied (ShopShiftManager._applyPersonaSprite): a page refresh re-derives
  // the graphic from page().image, and a face that only lived on the event
  // would be lost the first time a switch moved. Every zombie sheet is a
  // single-character !$ sheet, hence the fixed cell 0.
  function applyZombieSheet(ev, sheet) {
    const data = ev && ev.event ? ev.event() : null;
    if (!data || !sheet) return;
    // The self switch A page is the body a kill leaves behind (see
    // SECTION 5b of NPCEmpathize): it keeps whatever the author drew on it,
    // or a corpse would get up again wearing the face it fell in.
    for (const page of (data.pages || [])) {
      const c = page?.conditions;
      if (page?.image && !(c && c.selfSwitchValid && c.selfSwitchCh === "A")) {
        page.image.characterName = sheet;
        page.image.characterIndex = 0;
      }
    }
    ev._npcZombieSheet = sheet;
    ev.setImage(sheet, 0);
    ev.setOpacity(255);
    ev.setThrough(false);
    applyZombieGait(ev);
    // $dataMap is re-read from disk on every Scene_Map rebuild, so the face is
    // snapshotted onto the event itself the way a roster spawn is (see
    // SpawnManager.snapshotSpawn / restoreSpawnedEventData).
    SpawnManager.snapshotSpawn(ev);
  }

  // Every slot the crowd is dealt into, walked once: the dead are re-skinned
  // where they stand, the survivors left exactly as they are.
  function zombifyMapNPCs() {
    if (!$gameMap || !$dataMap) return;
    for (const ev of $gameMap.events()) {
      const data = ev && ev.event ? ev.event() : null;
      if (!data) continue;
      if (String(data.name || "").startsWith("Player")) continue; // i18n-ignore: event name matched at runtime
      const note = data.note || "";
      if (Utils.hasShopTag(note)) continue;      // a till is not a person
      if (Utils.hasStoryTag(note)) continue;     // and a written one does not rise
      const isRosterSlot = String(data.name || "").startsWith("NPC"); // i18n-ignore: event name matched at runtime
      if (!isRosterSlot && !Utils.isNPCEvent(note)) continue;
      if (ev._npcZombieDecided) continue;
      ev._npcZombieDecided = true;
      const sheet = zombieSheetFor(ev);
      if (sheet) applyZombieSheet(ev, sheet);
    }
  }

  // Puts every already-decided slot back in the face it rose in. The staffing
  // passes paint a roster sprite straight onto the event, so the dead are
  // re-asserted once the crowd has been dealt.
  function reassertZombies() {
    if (!$gameMap) return;
    for (const ev of $gameMap.events()) {
      if (!ev || ev._erased) continue;
      if (isFallenZombie(ev)) { ev._npcZombieDead = true; ev.erase(); continue; }
      if (!ev._npcZombieSheet) continue;
      if (ev.characterName() !== ev._npcZombieSheet) applyZombieSheet(ev, ev._npcZombieSheet);
      else applyZombieGait(ev);
    }
  }

  // ---- the dead that stay down --------------------------------------------
  // A corpse put down is gone from its slot for good. Kept on $gameSystem,
  // keyed by where it fell: the map and event on an authored map, the world
  // square and biome layer on the procedural one (whose event ids are only
  // stable within one square). The name is kept too, so a slot the spawner
  // has since dealt to somebody else is not buried with it.
  function zombieKillScope(mapId) {
    if (mapId !== 636) return String(mapId);
    const x = $gameVariables.value(43) || 1;
    const y = $gameVariables.value(44) || 1;
    const biome = $gameSystem?._procGenData?.currentBiome || "";
    return `636@${x},${y}/${biome}`;
  }

  function zombieKillStore(create) {
    if (!$gameSystem) return null;
    if (!$gameSystem._npcZombieKills && create) $gameSystem._npcZombieKills = {};
    return $gameSystem._npcZombieKills || null;
  }

  function recordZombieKill(mapId, eventId, name) {
    const store = zombieKillStore(true);
    if (!store) return;
    store[`${zombieKillScope(mapId)}#${eventId}`] = name || "";
  }

  function isFallenZombie(ev) {
    const store = zombieKillStore(false);
    if (!store || !ev || !ev.event) return false;
    const key = `${zombieKillScope($gameMap.mapId())}#${ev.eventId()}`;
    if (!(key in store)) return false;
    const name = ev.event()?.name || "";
    return !store[key] || !name || store[key] === name;
  }

  // ---- which of the dead it is ------------------------------------------
  // Whoever rose is fought as one of the risen the bestiary knows, drawn from
  // the ones pitched at where the party is standing: the nation's level band
  // on Earth, the map's own encounter median elsewhere, the party's level as a
  // last resort. Seeded on (map, event, world seed) like the face and the
  // gait, so the same corpse is the same fight every time.
  // A person rose, so the undead that were never people (hounds, bats, a
  // severed hand) are left to the crypts they spawn in.
  const ZOMBIE_ARCHETYPES = ["Undead"]; // i18n-ignore: enemy archetype keys
  const ZOMBIE_NOT_A_PERSON_RE = /hound|nightwing|hand|whale|beetle/i;
  const ZOMBIE_NEAREST_POOL = 4;     // how many to draw from when the band holds none
  let _zombieTroopPool = null;

  function zombieTroopPool() {
    if (_zombieTroopPool) return _zombieTroopPool;
    const H = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    const pool = [];
    if (typeof $dataTroops !== "undefined" && $dataTroops && H) {
      for (let i = 1; i < $dataTroops.length; i++) {
        const troop = $dataTroops[i];
        if (!troop || !troop.members || !troop.members.length) continue;
        const risen = troop.members.every(m => {
          const data = $dataEnemies[m.enemyId];
          if (!data) return false;
          const note = data.note || "";
          if (/<Boss>|<Special>/i.test(note)) return false;
          if (ZOMBIE_NOT_A_PERSON_RE.test(data.name || "")) return false;
          return ZOMBIE_ARCHETYPES.includes(H.getEnemyArchetype(data));
        });
        if (!risen) continue;
        const level = H.getTroopMaxLevel ? H.getTroopMaxLevel(i) : 0;
        if (level > 0) pool.push({ troopId: i, level: level });
      }
    }
    return (_zombieTroopPool = pool);
  }

  function zombieLevelBand() {
    const H = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    const band = H && H.getActiveNationBand ? H.getActiveNationBand() : null;
    if (band && Number.isFinite(band.min) && Number.isFinite(band.max)) return band;
    const median = $gameMap && $gameMap._medianEncounterLevel;
    if (median) return { min: Math.max(1, median - 4), max: median + 4 };
    const ref = H && H.getPartyReferenceLevel ? H.getPartyReferenceLevel() : 1;
    return { min: Math.max(1, ref - 2), max: ref + 4 };
  }

  function zombieTroopFor(mapId, eventId) {
    const pool = zombieTroopPool();
    if (!pool.length) return ZOMBIE_TROOP_ID;
    const band = zombieLevelBand();
    let candidates = pool.filter(p => p.level >= band.min && p.level <= band.max);
    if (!candidates.length) {
      const center = (band.min + band.max) / 2;
      candidates = pool.slice()
        .sort((a, b) => Math.abs(a.level - center) - Math.abs(b.level - center))
        .slice(0, ZOMBIE_NEAREST_POOL);
    }
    const seedBase = (window.HistoryManager && window.HistoryManager.getSeed)
      ? window.HistoryManager.getSeed() : 19002001;
    let h = (mapId * 73856093) ^ (eventId * 45989) ^ (seedBase + 0x2f1b);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    return candidates[h % candidates.length].troopId;
  }

  // ---- walking into one of the dead --------------------------------------
  // There is nothing to say to a corpse: bumping into one is the fight. The
  // same machinery the Empathize panel's Attack uses carries it (the target
  // recorded so a kill leaves a body behind on its own event), against one of
  // the risen picked above, tinted the green a zombie's body is fought in.
  //
  // Getting away buys a breather: for ZOMBIE_GRACE_FRAMES nothing the dead do
  // starts a fight, and the one that was fled stands dazed where it is, so an
  // escape is not straight back into the same battle on the same tile.
  const ZOMBIE_GRACE_FRAMES = 180;

  function zombieGraceActive() {
    const until = $gameTemp && $gameTemp._npcZombieGraceUntil;
    return !!until && Graphics.frameCount < until;
  }

  function canStartZombieBattle() {
    return !$gameParty.inBattle() && !$gameTemp?._npcZombieBattle && !zombieGraceActive();
  }

  function requestZombieBattle(ev) {
    if (!ev || !$gameTemp) return;
    $gameTemp._npcZombieBattle = {
      mapId: $gameMap.mapId(),
      eventId: ev.eventId(),
      name: ev.event()?.name || "",
    };
  }

  function startZombieBattle(request) {
    BattleManager.setup(zombieTroopFor(request.mapId, request.eventId), true, false);
    $gamePlayer.makeEncounterCount();
    // Armed after setup on purpose: all three are cleared at the top of
    // BattleManager.setup, so a fight begun any other way can never inherit
    // this victim or wear a zombie's body.
    $gameTemp._NPCEmpathizeBattleTarget = {
      mapId: request.mapId, eventId: request.eventId, name: request.name,
    };
    $gameTemp._npcZombieFight = {
      mapId: request.mapId, eventId: request.eventId, name: request.name,
    };
    $gameTemp._battler3DOverride = { tint: ZOMBIE_TINT };
    SceneManager.push(Scene_Battle);
  }

  const _BattleManager_setup_zombie = BattleManager.setup;
  BattleManager.setup = function (troopId, canEscape, canLose) {
    if ($gameTemp) $gameTemp._npcZombieFight = null;
    _BattleManager_setup_zombie.call(this, troopId, canEscape, canLose);
  };

  // How the fight ended decides what is left on the street. A kill (every
  // member of the troop down, not a win by the enemy running off) takes the
  // corpse off the map there and then and keeps it off; anything else is an
  // escape, and buys the grace period.
  function settleZombieFight(fight, result) {
    if (!fight || !$gameMap || $gameMap.mapId() !== fight.mapId) return;
    const ev = $gameMap.event(fight.eventId);
    const troop = $gameTroop ? $gameTroop.members() : [];
    const killed = result === 0 && troop.length > 0 && troop.every(e => e.hp <= 0);
    if (killed) {
      recordZombieKill(fight.mapId, fight.eventId, fight.name);
      if (ev) { ev._npcZombieDead = true; ev.erase(); }
      return;
    }
    $gameTemp._npcZombieGraceUntil = Graphics.frameCount + ZOMBIE_GRACE_FRAMES;
    if (ev) {
      ev._npcZombieHunt = 0;
      ev._npcZombieLast = null;
      ev._npcZombieDazed = ZOMBIE_GRACE_FRAMES;
    }
  }

  const _BattleManager_endBattle_zombie = BattleManager.endBattle;
  BattleManager.endBattle = function (result) {
    const fight = $gameTemp ? $gameTemp._npcZombieFight : null;
    if (fight) {
      $gameTemp._npcZombieFight = null;
      try { settleZombieFight(fight, result); }
      catch (e) { console.error("[NPC System] zombie fight outcome failed", e); }
    }
    _BattleManager_endBattle_zombie.call(this, result);
  };

  // The bump itself. checkEventTriggerTouch is what RMMZ calls when the party
  // walks into an event that blocks them, which is every zombie standing in a
  // street. A vehicle is left to its own collision (a car running one down is
  // BattleSystemEnhancedEncounters' business, not a fight).
  const _Game_Player_checkEventTriggerTouch_zombie = Game_Player.prototype.checkEventTriggerTouch;
  Game_Player.prototype.checkEventTriggerTouch = function (x, y) {
    if (Config.isZombieWorld() && !this.isInVehicle() && !$gameMap.isEventRunning()) {
      const walker = $gameMap.eventsXy(x, y).find(ev => isZombieWalker(ev));
      if (walker) {
        if (canStartZombieBattle()) requestZombieBattle(walker);
        return true;
      }
    }
    return _Game_Player_checkEventTriggerTouch_zombie.call(this, x, y);
  };

  // And the other way round: one of the dead walking into the party is the same
  // collision from the other side. An NPC event is trigger 0 (talk to it), so
  // RMMZ itself would let a zombie shoulder past the player without a word.
  const _Game_Event_checkEventTriggerTouch_zombie = Game_Event.prototype.checkEventTriggerTouch;
  Game_Event.prototype.checkEventTriggerTouch = function (x, y) {
    if (Config.isZombieWorld() && $gamePlayer.pos(x, y) && !$gamePlayer.isInVehicle() &&
        !$gameMap.isEventRunning() && isZombieWalker(this)) {
      if (canStartZombieBattle()) requestZombieBattle(this);
      return;
    }
    _Game_Event_checkEventTriggerTouch_zombie.call(this, x, y);
  };

  // Talking to one is the same bump by another route. A zombie never runs a
  // page: not the Empathize command on it, not a dialogue, not a shop, so the
  // panel with its talk and leave options is never built for one of the dead
  // (see also the guard in NPCEmpathize.open, for a panel opened by name from
  // somewhere off the map). The action button and either touch trigger all
  // resolve to the one thing there is to do with a corpse. A press landing
  // while that fight is already pending, or inside the grace after an escape,
  // does nothing at all rather than falling through to the page: the page is
  // the living person's menu, and a corpse never offers it.
  const _Game_Event_start_zombie = Game_Event.prototype.start;
  Game_Event.prototype.start = function () {
    if (isZombieWalker(this)) {
      if (canStartZombieBattle()) requestZombieBattle(this);
      return;
    }
    _Game_Event_start_zombie.call(this);
  };

  // ---- how the dead move -------------------------------------------------
  // Not everybody got up the same way. A gait is drawn from the same seed the
  // face is (map, event, world seed), so the thing shuffling at the end of the
  // street is the same thing every time that street is walked into, and two
  // savegames of one world agree about it.
  //
  //   speed / freq   how fast it walks and how often it decides to
  //   sight / cone   how far it notices the party, and the arc it notices them
  //                  in, in degrees, around whichever way it happens to be
  //                  facing (360 = it has no front left to speak of)
  //   los            whether a wall between them hides the party
  //   chase          the speed it moves at once it has hold of you
  //   memory         frames it keeps coming after losing sight of you
  //   rouses         tiles its cry carries, waking every corpse inside it
  //
  // The party walks at 4 and dashes at 5, so nothing here outruns a run: a
  // runner at 4.5 is the one that has to be dashed away from and every other
  // gait can be walked away from, which is what makes the runner frightening.
  const ZOMBIE_GAITS = [
    { key: "shambler", weight: 46, speed: 2.5, freq: 3, sight: 5, cone: 240, los: true,  chase: 3,   memory: 240 },
    { key: "crawler",  weight: 18, speed: 1,   freq: 2, sight: 2, cone: 360, los: false, chase: 2,   memory: 180 },
    { key: "runner",   weight: 14, speed: 3.5, freq: 5, sight: 8, cone: 120, los: true,  chase: 4.5, memory: 480 },
    { key: "lurker",   weight: 12, speed: 2,   freq: 2, sight: 3, cone: 360, los: false, chase: 4,   memory: 300 },
    { key: "screamer", weight: 10, speed: 2.5, freq: 3, sight: 9, cone: 180, los: true,  chase: 3,   memory: 360, rouses: 10 },
  ];
  const ZOMBIE_SCAN_INTERVAL = 8;   // frames between one corpse's sweeps

  // The gait this slot rose with. Pure in (map, event, world seed), the same
  // way zombieSheetFor is, and salted apart from it so the face and the walk
  // are two independent draws rather than one.
  function zombieGaitFor(ev) {
    if (!ev || !ev.eventId) return ZOMBIE_GAITS[0];
    const seedBase = (window.HistoryManager && window.HistoryManager.getSeed)
      ? window.HistoryManager.getSeed() : 19002001;
    let h = ($gameMap.mapId() * 73856093) ^ (ev.eventId() * 83492791) ^ (seedBase + 0x9e37);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    let roll = h % ZOMBIE_GAITS.reduce((sum, g) => sum + g.weight, 0);
    for (const gait of ZOMBIE_GAITS) {
      roll -= gait.weight;
      if (roll < 0) return gait;
    }
    return ZOMBIE_GAITS[0];
  }

  // Bound once per map load, after the face is on: the walk belongs to the
  // body, so a corpse that was never re-skinned is left alone entirely.
  function applyZombieGait(ev) {
    if (!ev || ev._npcZombieGait) return;
    const gait = zombieGaitFor(ev);
    ev._npcZombieGait = gait;
    ev._npcZombieBaseSpeed = gait.speed;
    ev.setMoveSpeed(gait.speed);
    ev.setMoveFrequency(gait.freq);
    ev._moveType = 1;   // wander, until something is seen
    ev._npcZombieHunt = 0;
    ev._npcZombieLast = null;
    // Staggered by event id: a horde scanning on one frame was a hitch.
    ev._npcZombieScan = (ev._eventId || 0) % ZOMBIE_SCAN_INTERVAL;
  }

  // Is the party inside the arc this one is facing? The same question the
  // police and the roaming creatures ask of their own cones
  // (CrimeSystem.inSightCone, BattleSystemEnhancedEncounters), asked as the
  // angle between the way it is facing and the way the party lies rather than
  // as the tangent of half the arc. The two agree for every arc narrower than a
  // half-plane, and only this one can answer a WIDER one: tan(120 degrees) is
  // negative, so the tangent form reads a 240 degree cone as seeing nothing at
  // all, and a shambler that notices most of what is around it is exactly the
  // sort of thing this table is made of.
  function inZombieCone(ev, tx, ty, cone) {
    if (!cone || cone >= 360) return true;
    const dx = tx - ev.x;
    const dy = ty - ev.y;
    if (!dx && !dy) return true;
    let fx = 0, fy = 0;
    switch (ev.direction()) {
      case 2: fy = 1; break;
      case 8: fy = -1; break;
      case 6: fx = 1; break;
      case 4: fx = -1; break;
      default: return true;
    }
    const cos = (dx * fx + dy * fy) / Math.sqrt(dx * dx + dy * dy);
    return cos >= Math.cos((cone / 2) * Math.PI / 180);
  }

  // A wall between them hides the party. Borrowed from the encounter system so
  // a wolf, a constable and a corpse all read the same corner the same way;
  // without that plugin the check falls back to plain distance.
  function zombieSightLine(x0, y0, x1, y1) {
    const helpers = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    if (!helpers || typeof helpers.hasLineOfSight !== "function") return true;
    return helpers.hasLineOfSight(x0, y0, x1, y1);
  }

  // A cry carries: every corpse within earshot starts for the same tile,
  // whether or not it saw anything itself. This is the whole of what a
  // screamer is for, and it is why one of them in a street is worse than five
  // shamblers.
  function rouseZombies(caller, x, y, radius) {
    for (const ev of $gameMap.events()) {
      if (ev === caller || !isZombieWalker(ev) || !ev._npcZombieGait) continue;
      if (Math.abs(ev.x - x) + Math.abs(ev.y - y) > radius) continue;
      ev._npcZombieHunt = Math.max(ev._npcZombieHunt || 0, ev._npcZombieGait.memory);
      ev._npcZombieLast = { x: x, y: y };
    }
  }

  // One corpse's sweep, throttled. Sets the hunt going, keeps it going while
  // the party is in sight, and lets it run down into a walk toward wherever
  // the party was last seen once it is not.
  function scanZombie(ev) {
    const gait = ev._npcZombieGait;
    if (!gait) return;
    const dx = $gamePlayer.x - ev.x;
    const dy = $gamePlayer.y - ev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let seen = false;
    if (dist <= gait.sight && inZombieCone(ev, $gamePlayer.x, $gamePlayer.y, gait.cone)) {
      seen = !gait.los || zombieSightLine(ev.x, ev.y, $gamePlayer.x, $gamePlayer.y);
    }
    // Walking into something is noticed whatever it was looking at: a facing
    // cone and a wall are no defence at arm's length.
    if (!seen && dist <= 1.5) seen = true;

    if (seen) {
      const wasHunting = ev._npcZombieHunt > 0;
      ev._npcZombieHunt = gait.memory;
      ev._npcZombieLast = { x: $gamePlayer.x, y: $gamePlayer.y };
      if (!wasHunting) {
        if (ev.isNearTheScreen() && $gameTemp) $gameTemp.requestBalloon(ev, 1);
        if (gait.rouses) rouseZombies(ev, $gamePlayer.x, $gamePlayer.y, gait.rouses);
      }
    }

    const hunting = ev._npcZombieHunt > 0;
    const speed = hunting ? gait.chase : ev._npcZombieBaseSpeed;
    if (ev._moveSpeed !== speed) ev.setMoveSpeed(speed);
    // Standing still between decisions is what a wander is; a hunt never
    // pauses, so the frequency goes up with the speed and comes back down
    // with it when whatever it was following is gone.
    ev.setMoveFrequency(hunting ? 5 : gait.freq);
  }

  // Per-frame half. Lives on update() rather than on updateSelfMovement(),
  // which the engine only calls while a character stands still: a hunt would
  // otherwise stop counting down the moment it started moving.
  const _Game_Event_update_zombie = Game_Event.prototype.update;
  Game_Event.prototype.update = function () {
    _Game_Event_update_zombie.call(this);
    if (!this._npcZombieGait || !isZombieWalker(this)) return;
    // Dazed after being fled from: it neither hunts nor notices anybody.
    if (this._npcZombieDazed > 0) {
      this._npcZombieDazed--;
      this._npcZombieHunt = 0;
      return;
    }
    if (this._npcZombieHunt > 0) this._npcZombieHunt--;
    this._npcZombieScan = (this._npcZombieScan || 0) + 1;
    if (this._npcZombieScan < ZOMBIE_SCAN_INTERVAL) return;
    this._npcZombieScan = 0;
    if (!this.isNearTheScreen() || $gameParty.inBattle() || $gameMap.isEventRunning()) return;
    scanZombie(this);
  };

  // And the step itself. A hunting corpse walks at whoever it is following, or
  // at the tile it last saw them on; anything else falls through to the engine
  // and wanders the way the gait was set up to.
  const _Game_Event_updateSelfMovement_zombie = Game_Event.prototype.updateSelfMovement;
  Game_Event.prototype.updateSelfMovement = function () {
    if (this._npcZombieDazed > 0 && isZombieWalker(this)) return;
    if (this._npcZombieGait && this._npcZombieHunt > 0 && isZombieWalker(this) &&
        !this._locked && !this.isMoving() && !this.isMoveRouteForcing() &&
        !$gameMap.isEventRunning() && this._stopCount > 0) {
      const last = this._npcZombieLast;
      if (last && (last.x !== this.x || last.y !== this.y)) {
        // moveTowardCharacter reads nothing but .x/.y off what it is given, so
        // the remembered tile stands in for the party it was last seen on.
        this.moveTowardCharacter({ x: last.x, y: last.y });
        return;
      }
      // Standing on the last tile it saw them from with nothing there: the
      // trail is cold, so it goes back to wandering rather than to the spot.
      this._npcZombieHunt = 0;
    }
    _Game_Event_updateSelfMovement_zombie.call(this);
  };

  // Started from the scene rather than from inside the map update that noticed
  // the collision, the way an ordinary encounter is.
  const _Scene_Map_update_zombie = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_zombie.call(this);
    const request = $gameTemp?._npcZombieBattle;
    if (!request) return;
    if (SceneManager.isSceneChanging() || $gameParty.inBattle() || $gameMap.isEventRunning()) return;
    $gameTemp._npcZombieBattle = null;
    if (zombieGraceActive()) return;
    // A transfer between the bump and this tick (a doorway right behind the
    // party) leaves the request pointing at a map nobody is standing on any
    // more: dropped rather than fought.
    if (request.mapId !== $gameMap.mapId()) return;
    startZombieBattle(request);
  };

  Object.assign(window.NPCSystem._internal, {
    canStartZombieBattle, isZombieWalker, reassertZombies, requestZombieBattle, zombifyMapNPCs,
  });
})();
