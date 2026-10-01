/*:
 * @target MZ
 * @plugindesc NPC System: engine hooks and the public window.NPCSystem API
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Controller
 * @help
 * ============================================================================
 * NPCSystem_Hooks, part of the NPCSystem family
 * ============================================================================
 * Owns the ENGINE HOOKS & OVERRIDES, the map-load passes, the world
 * initializer for the WorldGen manifests, and fills window.NPCSystem (created
 * by the entry) with the public API.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Controller.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    Config, GoneRegistry, GroupRegistry, isBetaSprite, MapManager, NPCBeds, NPCBounty,
    NPCController, NPCPoolStore, NPCYield, PoliceForce, populateProceduralSquare, ProceduralManager,
    registerProcStitchHook, ResidentRegistry, SpawnManager, StreetCrime, SwimSpots, Utils, VisitingParties,
    WorldgenStore,
  } = window.NPCSystem._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let
    addCampTent, canStartZombieBattle, dressHordeLitter, ensureCampGroup, goblinizeMapNPCs, isZombieWalker,
    pitchCamp, reassertZombies, refillHordeHomes, requestZombieBattle, zombifyMapNPCs;
  window.NPCSystem._internal._late.push(() => ({
    addCampTent, canStartZombieBattle, dressHordeLitter, ensureCampGroup, goblinizeMapNPCs, isZombieWalker,
    pitchCamp, reassertZombies, refillHordeHomes, requestZombieBattle, zombifyMapNPCs,
  } = window.NPCSystem._internal));


  // ==========================================================================
  // ENGINE HOOKS & OVERRIDES
  // ==========================================================================

  // A sleeping NPC is drawn lying on their side, the same pose a knocked-out
  // party member takes on the map (AutoIdleExplorer's downed followers):
  // turned a quarter, centred on the tile they lie on.
  const _Sprite_Character_update_npcSleep = Sprite_Character.prototype.update;
  Sprite_Character.prototype.update = function () {
    _Sprite_Character_update_npcSleep.call(this);
    const asleep = !!(this._character && this._character._npcLyingDown && !this._character._erased);
    if (asleep) {
      this.rotation = Math.PI / 2;
      this.anchor.x = 0.5;
      this.anchor.y = 0.5;
      this.y -= ($gameMap ? $gameMap.tileHeight() : 48) / 2;
      this._npcSleepPose = true;
    } else if (this._npcSleepPose) {
      this.rotation = 0;
      this.anchor.x = 0.5;
      this.anchor.y = 1;
      this._npcSleepPose = false;
    }
  };

  // Safe findProperPageIndex override
  const _Game_Event_findProperPageIndex = Game_Event.prototype.findProperPageIndex;
  Game_Event.prototype.findProperPageIndex = function () {
    try { return _Game_Event_findProperPageIndex.call(this); }
    catch (e) { return -1; }
  };

  // The "Hidden" note tag (e.g. a counter noted "Shop Hidden") means: this
  // event takes part in the simulation but never shows a person on the map.
  // Blanking the graphic at the point it is written is not enough, because
  // several passes write one AFTER the spawn transplant did its blanking:
  // ShopShiftManager stamps the shift persona (and, before the rota exists, a
  // stand-in face) onto every page and calls setImage, NPCSociety re-applies
  // the society-assigned sprite, and any page refresh re-derives the graphic
  // from the page data those passes wrote. Each of them put the face straight
  // back. Enforce the tag on the event instead, at the two doors every graphic
  // has to pass through, so whatever writes a sprite the tag still wins.
  // Deliberately not cached on the event: a placeholder slot's note is
  // rewritten when an NPC is transplanted onto it (see transplantData), so a
  // flag decided once would answer for the previous occupant.
  Game_Event.prototype.isNPCHidden = function () {
    return Utils.hasHiddenTag(this.event()?.note);
  };

  // A tile graphic is set dressing (a stall, a crate), not a person, so a
  // hidden event that carries one keeps it: only the character sheet goes.
  // Resolved at call time, not captured here: Game_Event has no setImage of its
  // own, so this hangs a new one off it, and a plugin loaded after this one may
  // still patch the Game_Character implementation it delegates to.
  Game_Event.prototype.setImage = function (characterName, characterIndex) {
    if (this.isNPCHidden() || isBetaSprite(characterName)) {
      if (this._tileId) return;
      characterName = "";
      characterIndex = 0;
    }
    Game_Character.prototype.setImage.call(this, characterName, characterIndex);
  };

  const _Game_Event_setupPageSettings = Game_Event.prototype.setupPageSettings;
  Game_Event.prototype.setupPageSettings = function () {
    _Game_Event_setupPageSettings.call(this);
    // setImage above already covers the ordinary path; this catches a page
    // whose graphic was applied by some other plugin's setupPageSettings
    // override running after ours.
    if (!this._tileId && this._characterName && (this.isNPCHidden() || isBetaSprite(this._characterName))) {
      this._characterName = "";
      this._characterIndex = 0;
    }
    if (Utils.isAnyShopEvent(this)) {
      this._priorityType = 1;
      this._through = false;
      const cDir = Utils.counterFacingDir(this);
      if (cDir) {
        this._direction = cDir;
        this._originalDirection = cDir;
        this._prelockDirection = cDir;
      }
    }
  };

  const _Game_Event_unlock = Game_Event.prototype.unlock;
  Game_Event.prototype.unlock = function () {
    _Game_Event_unlock.call(this);
    if (Utils.isAnyShopEvent(this)) {
      const cDir = Utils.counterFacingDir(this);
      if (cDir) this.setDirection(cDir);
    }
  };

  // Action-button interaction with NPCs that are mid-step.
  // A roster NPC paths continuously (no pause between steps), so a walking NPC's
  // logical tile (_x/_y, advanced immediately by moveStraight or by RMMZ's own
  // random movement) sits one step ahead of where the sprite is drawn
  // (_realX/_realY). The engine's action-button check looks at the tile the
  // player faces and finds the NPC's just-vacated tile empty, so nothing starts
  // even though the player is plainly facing the NPC. Movement runs off the
  // controller (AI NPCs) or the event's own move route (Local NPCs), not the
  // event page, so it keeps working: the NPC visibly walks but can't be talked
  // to. As a fallback, when the normal check started nothing, match a moving
  // roster NPC against either tile it occupies: its logical/destination tile
  // (_x/_y) or the source tile it is vacating. The source tile is derived from
  // the reverse of the move direction so it stays matchable for the entire step
  // (rounding _realX only lands on the source tile during the first half).
  //
  // Rather than pin down every way an NPC's tile can desync from where its
  // sprite is drawn, this is a deliberate catch-all: when the engine's own
  // action-button check started nothing, look at EVERY tile a talkable event
  // visually or logically occupies this frame and start it if the player is
  // facing any of them. Candidate tiles per event:
  //   - its logical tile (_x/_y, advanced immediately by a step),
  //   - its drawn/sprite tile (round of _realX/_realY, the mid-interpolation
  //     position, which is what the player actually sees and aims at), and
  //   - the tile it is vacating (reverse of its move direction) while moving.
  // Covers controller-driven AND Local (route-driven) roster NPCs, NPCs whose
  // _npcRosterSpawn flag was lost, pre-placed map NPCs, and the "just stopped
  // but _realX has not caught up" case, none of which the narrower earlier
  // scans reliably caught. Roster NPCs are tried first, then any other facing
  // talkable event. Blank/commandless pages are skipped (nothing to run), so a
  // hidden (self-switch A) NPC is never force-woken.
  const _NPCSystem_checkEventTriggerThere = Game_Player.prototype.checkEventTriggerThere;
  Game_Player.prototype.checkEventTriggerThere = function (triggers) {
    _NPCSystem_checkEventTriggerThere.call(this, triggers);
    if ($gameMap.isAnyEventStarting() || $gameMap.isEventRunning()) return;
    const dir = this.direction();
    const fx = $gameMap.roundXWithDirection(this.x, dir);
    const fy = $gameMap.roundYWithDirection(this.y, dir);
    const isCounter = typeof $gameMap.isCounter === "function" && $gameMap.isCounter(fx, fy);
    const cx = isCounter ? $gameMap.roundXWithDirection(fx, dir) : fx;
    const cy = isCounter ? $gameMap.roundYWithDirection(fy, dir) : fy;
    // Runnable = has an action/touch-triggerable page with real commands. We do
    // NOT require isNormalPriority(): a transplanted/pre-placed NPC page left at
    // "below/above characters" priority is invisible to the engine's own facing
    // check (which only fires for same-as-characters priority), which is one way
    // a plainly-facing player gets no response. Autorun/parallel pages (trigger
    // 3/4) are excluded via isTriggerIn(triggers) so we never force-run those.
    const runnable = (ev) => {
      if (!ev || ev._erased || !ev.isTriggerIn(triggers)) return false;
      const page = ev.page();
      return !!(page && page.list && page.list.length > 1);
    };
    const occupies = (ev, x, y) => {
      if (ev._x === x && ev._y === y) return true;
      if (Math.round(ev._realX) === x && Math.round(ev._realY) === y) return true;
      if (ev.isMoving()) {
        const rev = ev.reverseDir(ev.direction());
        if ($gameMap.roundXWithDirection(ev._x, rev) === x &&
            $gameMap.roundYWithDirection(ev._y, rev) === y) return true;
      }
      return false;
    };
    const matchesFacing = (ev) => occupies(ev, fx, fy) || (isCounter && occupies(ev, cx, cy));
    const events = $gameMap.events();
    // 1) Anything the player is facing (roster NPCs first, then any event).
    for (const ev of events) { if (ev && ev._npcRosterSpawn && runnable(ev) && matchesFacing(ev)) { ev.start(); return; } }
    for (const ev of events) { if (ev && !ev._npcRosterSpawn && runnable(ev) && matchesFacing(ev)) { ev.start(); return; } }
    // 2) Last-resort generosity: a roster NPC standing directly next to the
    //    player (its sprite may straddle tiles so the faced tile never matched
    //    exactly). Prefer one in the facing direction. Only roster NPCs, so we
    //    never hijack an unrelated adjacent event.
    let best = null, bestScore = -1;
    for (const ev of events) {
      if (!ev || !ev._npcRosterSpawn || !runnable(ev)) continue;
      const ex = Math.round(ev._realX), ey = Math.round(ev._realY);
      const man = Math.abs(ex - this.x) + Math.abs(ey - this.y);
      if (man !== 1) continue;
      const score = (ex === fx && ey === fy) ? 2 : ((isCounter && ex === cx && ey === cy) ? 2 : 1); // in facing dir scores higher
      if (score > bestScore) { bestScore = score; best = ev; }
    }
    if (best) best.start();
  };

  // Walking into an NPC is how the player asks it to move (see NPCYield). Only
  // a refused step is looked at, so an ordinary walk costs two roundXWithDirection
  // calls and nothing else.
  const _NPCSys_Game_Player_moveStraight = Game_Player.prototype.moveStraight;
  Game_Player.prototype.moveStraight = function (d) {
    const bx = $gameMap.roundXWithDirection(this.x, d);
    const by = $gameMap.roundYWithDirection(this.y, d);
    _NPCSys_Game_Player_moveStraight.call(this, d);
    if (!this.isMovementSucceeded()) NPCYield.onPlayerBlocked(bx, by);
  };

  // Console diagnostic: face a stubborn NPC, then run window.npcWhyNoTalk() from
  // the dev console (F12). Prints why nothing triggers, event state and all.
  window.npcWhyNoTalk = function () {
    if (!$gameMap || !$gamePlayer) { console.log("[npcWhyNoTalk] no map/player"); return; }
    const p = $gamePlayer, dir = p.direction();
    const fx = $gameMap.roundXWithDirection(p.x, dir), fy = $gameMap.roundYWithDirection(p.y, dir);
    console.log(`[npcWhyNoTalk] player (${p.x},${p.y}) dir ${dir} facing (${fx},${fy})`);
    console.log(`  isEventRunning=${$gameMap.isEventRunning()} isAnyEventStarting=${$gameMap.isAnyEventStarting()} interp.eventId=${$gameMap._interpreter?.eventId?.()}`);
    const near = $gameMap.events().filter(e => e && !e._erased &&
      Math.abs(Math.round(e._realX) - p.x) <= 1 && Math.abs(Math.round(e._realY) - p.y) <= 1);
    if (!near.length) { console.log("  no events within 1 tile"); return; }
    for (const e of near) {
      const pg = e.page();
      console.log(`  ev#${e.eventId()} "${e.event()?.name}" logical(${e._x},${e._y}) sprite(${Math.round(e._realX)},${Math.round(e._realY)}) moving=${e.isMoving()} roster=${!!e._npcRosterSpawn}`);
      console.log(`     _trigger=${e._trigger} priorityType=${e._priorityType} through=${e._through} pageIndex=${e._pageIndex} listLen=${pg?.list?.length ?? "no-page"} isTriggerIn[0,1,2]=${e.isTriggerIn([0,1,2])} isNormalPriority=${e.isNormalPriority()}`);
    }
  };

  // Auto-diagnose: when the player presses OK, nothing triggers, and a runnable
  // event is right next to them, print the diagnostic automatically (throttled).
  // So you just open the console (F12) and try talking to the stubborn NPC, no
  // command to type. Set window.NPC_DEBUG_INTERACT = false to silence it.
  window.NPC_DEBUG_INTERACT = true;
  const _NPCSys_triggerButtonAction = Game_Player.prototype.triggerButtonAction;
  Game_Player.prototype.triggerButtonAction = function () {
    const acted = _NPCSys_triggerButtonAction.call(this);
    if (window.NPC_DEBUG_INTERACT && !acted && Input.isTriggered("ok") &&
        !$gameMap.isEventRunning() && !$gameMap.isAnyEventStarting()) {
      const near = $gameMap.events().some(e => e && !e._erased &&
        Math.abs(Math.round(e._realX) - this.x) <= 1 && Math.abs(Math.round(e._realY) - this.y) <= 1 &&
        (e.page()?.list?.length ?? 0) > 1);
      const last = window.npcWhyNoTalk._last ?? -999;
      if (near && Graphics.frameCount - last > 20) {
        window.npcWhyNoTalk._last = Graphics.frameCount;
        console.log("[NPCSystem] OK pressed but nothing triggered:");
        window.npcWhyNoTalk();
      }
    }
    return acted;
  };

  const _Game_System_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function () {
    _Game_System_initialize.call(this);
    this.npcControllers = [];
    this._npcSystemCurrentMapGroup = null;
  };

  // Expose live controllers to NPCSimulationCore and other plugins.
  // Called several times per tick, so the filtered copy is cached per frame.
  // Module-scope (not on Game_System) so it never leaks into save data; the
  // src/len checks invalidate it when controllers are added, removed, or the
  // array is swapped out mid-frame.
  let _activeCtrlCache = null;
  Game_System.prototype.getActiveNPCControllers = function () {
    const list = this.npcControllers || [];
    const fc = Graphics.frameCount;
    if (_activeCtrlCache && _activeCtrlCache.frame === fc &&
        _activeCtrlCache.src === list && _activeCtrlCache.len === list.length) {
      return _activeCtrlCache.result;
    }
    // A fresh list every frame (a caller may keep it), the cache record reused.
    const result = list.filter(c => c && c.event && !c.event._erased);
    const cache = _activeCtrlCache || (_activeCtrlCache = {});
    cache.frame = fc; cache.src = list; cache.len = list.length; cache.result = result;
    return result;
  };

  const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;
  Game_System.prototype.onAfterLoad = function () {
    _Game_System_onAfterLoad?.call(this);
    this.restoreNPCControllers();
  };

  Game_System.prototype.restoreNPCControllers = function () {
    if (!$dataMap || !$gameMap?.events) {
      this._restoreRetries = (this._restoreRetries || 0) + 1;
      if (this._restoreRetries > 20) { this._restoreRetries = 0; return; }
      return setTimeout(() => this.restoreNPCControllers(), 100);
    }
    this._restoreRetries = 0;
    this.npcControllers?.forEach((data, i) => {
      if (data && typeof data.update !== "function") {
        const c = new NPCController(data.eventName);
        Object.assign(c, data);
        c.refreshEvent();
        // performance.now() restarts with the session, so an end time saved in
        // the last one means nothing here.
        const now = performance.now();
        if (c.state === "brawling" || c.state === "knockedOut") {
          c._brawl = null;
          c.state = "knockedOut";
          c.stateEndTime = now + 3000;
        } else if (c.state === "sleeping") {
          c.stateEndTime = now + NPCBeds.MIN_SLEEP_MS;
        }
        this.npcControllers[i] = c;
      }
    });
  };

  const _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    this._npcControllersInitialized = false;
    _Game_Map_setup.call(this, mapId);
  };

  // Dev/test hook: when the player names their character "Test", the WorldGen
  // manifests (MapGroups.json + NPCResidents.json) are wiped and rebuilt so they
  // pick up the latest map edits. Rebuilding loads & parses every map (multi-
  // second freeze, see the WorldgenStore/NPCPoolStore performance notes), so
  // it's gated to a single run per session via _testRegenDone, on subsequent
  // map loads within the same session the freshly-saved manifests are reused.
  let _testRegenDone = false;
  function maybeRegenerateForTest() {
    if (_testRegenDone) return;
    let isTest = false;
    try {
      const leader = $gameParty?.leader?.();
      isTest = (leader?.name?.() === "Test") || ($gameActors?.actor?.(1)?.name?.() === "Test"); // i18n-ignore: playtest character name
    } catch (e) { }
    if (!isTest) return;
    _testRegenDone = true;

    // Drop the on-disk manifests...
    WorldgenStore.deleteFile();
    NPCPoolStore.deleteFile();
    // ...and every in-memory / save-data cache that would otherwise short-
    // circuit the rebuild, so the next GroupRegistry / getNPCPool call rescans
    // the maps and re-saves fresh manifests reflecting the current map data.
    if (window.WorldGen) { delete window.WorldGen.MapGroups; delete window.WorldGen.NPCResidents; }
    GroupRegistry._cache = null;
    GroupRegistry._mapIndex = null;
    GroupRegistry._buildCallbacks = null;
    SpawnManager._shopIndexSession = {};
    SpawnManager._authoredSession = {};
    SpawnManager._poolSession = {};
    ResidentRegistry._reserved = null;
    if ($gameSystem) $gameSystem._npcMapGroups = null;
    console.log("[NPC System] Player 'Test' detected, re-reading MapGroups and the authored NPCs from the current maps.");
  }

  // Staffs the <Shop> counters of the map being entered: every rota except the
  // ones that need a settled group roster (those are assigned right before
  // spawnAssignedNPCs, see setupNPCControllers), plus the graphic of every
  // counter whose rota is already known, the world-wide ones included.
  //
  // A rota <Shop> event carries no graphic of its own (one that does is its own
  // permanent shopkeeper and is skipped entirely, see ShopShiftManager
  // .isShopEvent), so whoever writes the persona onto it decides when the
  // counter stops being an empty tile. Doing it from
  // setupNPCControllers alone is too late: that runs after createDisplayObjects
  // has already built (and updated) the spriteset, and a transfer clears the
  // image cache, so the shopkeeper only appeared once the sprite noticed the
  // change and the character sheet came off disk. Idempotent, a counter that
  // already holds a rota is skipped, so the later pass costs nothing.
  // Everybody the NPC system would have put on this map, taken off it. Called
  // in place of the whole spawn pass in an empty world: the roster slots, the
  // <AI> wanderers and the local residents are all events this system would
  // have peopled, so with nobody left they are erased rather than left standing
  // as motionless scenery. A counter the map author drew a face on is NOT one
  // of ours (see Utils.hasOwnGraphic): it is deliberate map design, often
  // story-critical, and is left exactly as it is.
  //
  // A <Shop> counter is deliberately NOT erased either, staffed or not. Nobody
  // is behind it (stageShopPersonas bails out first), but the shop itself is
  // still there with whatever was on its shelves the day everyone went, and
  // that stock is the point: it is stocked once, never replenished
  // (ItemSystemShop.getShopDateKey) and can be cleared out through
  // StealingSystem, which is the only way to shop in an empty world.
  // A <Shop> counter that carries its own graphic is normally read as a named
  // shopkeeper the rota must never cover (see ShopShiftManager.isShopEvent) -
  // deliberate map design, worth keeping in a populated world. But a till is
  // not a person: in an empty world nobody is behind ANY counter, author-
  // drawn face or not, so the graphic and whatever movement came baked into
  // the page (most of these were copy-pasted from an ordinary wandering-NPC
  // template) are stripped here. Written onto the page data itself, exactly
  // as ShopShiftManager._applyPersonaSprite does, so a later page refresh
  // (self-switch, variable change) can't re-derive the graphic and bring the
  // "shopkeeper" back. The event survives untouched otherwise: its Shop
  // Processing / RandomDailyShop command still runs, so the till still has
  // whatever was on its shelves and StealingSystem can still clear it out.
  function blankShopCounter(ev, data) {
    if (ev._npcShopBlanked) return;
    ev._npcShopBlanked = true;
    for (const page of (data.pages || [])) {
      if (page?.image) {
        page.image.characterName = "";
        page.image.characterIndex = 0;
      }
      if (page) page.moveType = 0; // Fixed: nobody left to wander behind it
    }
    ev.refresh();
    ev.setImage("", 0);
    ev._moveType = 0;
    ev.setMoveFrequency(0);
    ev.setThrough(false);
  }

  function eraseUnpeopledEvents() {
    if (!$gameMap || !$dataMap) return;
    for (const ev of $gameMap.events()) {
      const data = ev && ev.event ? ev.event() : null;
      if (!data) continue;
      // The multiplayer avatar slots are not people of this world.
      if (String(data.name || "").startsWith("Player")) continue; // i18n-ignore: event name matched at runtime
      const note = data.note || "";
      // A written character is there whatever became of everybody else: an
      // empty world is still their world, and the plot still needs them.
      if (Utils.hasStoryTag(note)) continue;
      // An unattended till is still a till: never erased (its stock stays
      // stealable), but stripped of whatever graphic/movement it carries.
      if (Utils.hasShopTag(note)) { blankShopCounter(ev, data); continue; }
      const isRosterSlot = String(data.name || "").startsWith("NPC"); // i18n-ignore: event name matched at runtime
      if (isRosterSlot || Utils.isNPCEvent(note)) ev.erase();
    }
  }

  // <Story> NPCs: written characters who belong to the map they stand on. The
  // <AI> and <Local> passes in setupNPCControllers have already covered any
  // that carry those tags too (the by-name guard below means nobody is given a
  // second brain); this is for a story event that carries neither and would
  // otherwise stand there inert.
  //
  // The author's own movement setting has the last word: an event set to Fixed
  // was placed deliberately, behind a counter or at a doorway, and is left
  // exactly there. Anything else (Random, Approach, Custom) is a person who
  // moves, so they get a controller and live the ordinary NPC life, roaming
  // this map and meeting their needs, and never leaving it.
  //
  // Runs in an empty world too: the crowd is gone, but the written cast is
  // still there and still living their day.
  function wakeStoryNPCs() {
    if (!$gameMap || !$dataMap) return;
    $gameSystem.npcControllers = $gameSystem.npcControllers || [];
    // A face of their own is required rather than merely useful here: the
    // <Shop> exemption in isControllableEvent exists for counters a rota
    // persona is painted onto, and a <Story> counter is never on the rota, so
    // walking one would set an invisible body wandering the map.
    const storyEvents = $gameMap.events().filter(e =>
      Utils.hasStoryTag(e?.event()?.note) && Utils.hasAITag(e?.event()?.note) && Utils.isControllableEvent(e) &&
      Utils.hasOwnGraphic(e?.event()));
    for (const npc of storyEvents) {
      if (window.$gameSplitScreen?.active && window.$gameSplitScreen.p2Event === npc) continue;
      npc.setThrough(false);
      npc.setPriorityType(1);
      npc.setOpacity(255);
      // Read off the page data, not the live event: a controller sets the
      // event's own move type to Fixed so RMMZ's random walk stops fighting it,
      // which would read back as "the author wanted them still".
      const moveType = npc.page()?.moveType ?? npc.event()?.pages?.[0]?.moveType ?? 0;
      if (moveType === 0) continue;
      if ($gameSystem.npcControllers.some(c => c.eventName === npc.event().name)) continue;
      npc.setMoveSpeed(3);
      npc.setMoveFrequency(5);
      npc._moveType = 0;
      const controller = new NPCController(npc.event().name);
      controller.isStory = true;
      console.log(`[NPC System] Story NPC roaming: "${npc.event().name}" at (${npc.x}, ${npc.y}) on map ${$gameMap.mapId()}`);
      $gameSystem.npcControllers.push(controller);
      controller.decideNextGoal();
    }
  }

  // Sanitizes a shop event so stray page conditions (such as requiring item 1
  // or specific hour variables) or stray self-switches never drop it into an
  // un-interactable, through=true ghost state. Ensures normal priority (collision)
  // and turns its sprite to face any adjacent counter tile.
  function sanitizeShopEvent(ev) {
    if (!ev || ev._erased) return;
    const data = ev.event ? ev.event() : null;
    if (!data || !Utils.isAnyShopEvent(data)) return;

    for (const page of (data.pages || [])) {
      if ((page?.list?.length ?? 0) > 1) {
        if (page.conditions) {
          page.conditions.itemValid = false;
          page.conditions.variableValid = false;
          page.conditions.switch1Valid = false;
          page.conditions.switch2Valid = false;
          page.conditions.actorValid = false;
        }
        page.priorityType = 1;
        page.through = false;
        page.trigger = 0;
      }
    }

    if ($gameMap && $gameSelfSwitches) {
      const mapId = $gameMap.mapId();
      const evId = ev.eventId();
      for (const ch of ['A', 'B', 'C', 'D']) {
        if ($gameSelfSwitches.value([mapId, evId, ch])) {
          $gameSelfSwitches.setValue([mapId, evId, ch], false);
        }
      }
    }

    if (ev._pageIndex < 0 || (ev.page()?.list?.length ?? 0) <= 1) {
      ev.refresh();
      ev.setupPage();
    }

    ev.setThrough(false);
    ev.setPriorityType(1);

    const cDir = Utils.counterFacingDir(ev);
    if (cDir) {
      ev.setDirection(cDir);
      ev._originalDirection = cDir;
      ev._prelockDirection = cDir;
      for (const page of (data.pages || [])) {
        if (page?.image) page.image.direction = cDir;
      }
    }
  }

  function sanitizeMapShopEvents() {
    if (!$gameMap) return;
    for (const ev of $gameMap.events()) {
      if (ev && Utils.isAnyShopEvent(ev)) {
        sanitizeShopEvent(ev);
      }
    }
  }

  function stageShopPersonas() {
    sanitizeMapShopEvents();
    // Nobody is behind any counter in an empty world.
    if (Config.isEmptyWorld()) return;
    const SSM = window.NPCSim?.ShopShiftManager;
    if (!SSM || !$dataMap || !$gameMap) return;
    const mapId = $gameMap.mapId();
    const groupName = MapManager.findMapGroupByMap(mapId);

    // Every counter already has its trio (the usual case, and every rebuild of
    // Scene_Map that isn't a map change), so there is no pool to walk.
    if (!SSM.needsStaffing?.(mapId)) return SSM.applyKnownSprites?.(mapId);

    if (MapManager.isHouseMap(mapId)) {
      // House/shop interiors reached through a door have no on-map roster; their
      // counters are staffed from the town they were entered from, seeded on the
      // building's own coordinates. See ShopShiftManager.assignInteriorPersonas.
      const houseGrpName = MapManager.getCurrentMapGroup()
        || window.ProceduralHouseSystem?._playtestFallbackGroupName;
      const building = window.ProceduralHouseSystem?.getCurrentBuilding?.() || null;
      const shopSeed = (building?.seed ?? Utils.nameHash(`interiorShop_${mapId}`)) >>> 0;
      SSM.assignInteriorPersonas?.(mapId, houseGrpName || null, shopSeed);
    } else if (!groupName || Config.isGlobalGroup(groupName)) {
      // Global group, ungrouped, procedural and <Abandoned> maps draw from pools
      // that are ready right now, so their rota can be decided immediately.
      SSM.assignPersonas?.(mapId, groupName);
    }

    // Regular group maps keep their assignment deferred (local candidates are
    // only known once the roster settles), but the world rota decided when the
    // world was made already names most of their counters, so draw those now.
    SSM.applyKnownSprites?.(mapId);
  }

  // The transfer has been performed (map data and events are current) but the
  // spriteset does not exist yet, so a counter staffed here is drawn with its
  // shopkeeper from the very first frame the map is shown.
  const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
  Scene_Map.prototype.createDisplayObjects = function () {
    try {
      stageShopPersonas();
    } catch (e) {
      console.error("[NPC System] shop persona staging failed", e);
    }
    _Scene_Map_createDisplayObjects.call(this);
    // A hand-made town on the Horde's ground is strewn with its rubbish, laid
    // on the new spriteset as decals (NPCSystem_Horde.js, CHAOS LITTER).
    try {
      dressHordeLitter?.(this._spriteset);
    } catch (e) {
      console.error("[NPC System] Horde litter failed", e);
    }
  };

  // Writes every spawned NPC's identity back into the freshly loaded $dataMap.
  // Called with the map data current and the Game_Event objects still the ones
  // that were on screen a moment ago (a transfer is excluded: there the events
  // are about to be rebuilt from scratch and the spawn re-runs anyway).
  //
  // The sprite is re-read from the live event rather than from the snapshot:
  // several systems restyle a citizen after they are spawned (a rolled
  // procedural face, a shop-shift stand-in, the society sprite pass) and those
  // writes go into the same volatile page data. Only substantive pages are
  // stamped, the trailing blank "hidden on recruit" page has to stay
  // graphic-less or a recruited NPC comes back as an untalkable ghost.
  function restoreSpawnedEventData() {
    if (!$dataMap?.events || !$gameMap) return;
    const mapId = $gameMap.mapId();
    for (const ev of $gameMap.events()) {
      const snap = ev?._npcSpawnData;
      if (!snap || snap.mapId !== mapId) continue;
      let data = $dataMap.events[ev.eventId()];
      if (!data) {
        if (!snap.minted || ev._erased) continue;
        data = $dataMap.events[ev.eventId()] = { id: ev.eventId(), x: ev.x, y: ev.y };
      }
      data.name = snap.name;
      data.note = snap.note;
      data.characterName = snap.characterName;
      data.characterIndex = snap.characterIndex;
      data.pages = JSON.parse(JSON.stringify(snap.pages));
      const liveSprite = ev.characterName();
      if (liveSprite) {
        data.characterName = liveSprite;
        data.characterIndex = ev.characterIndex();
        for (const page of data.pages) {
          if (!page?.image || (page.list?.length ?? 0) <= 1) continue;
          page.image.characterName = liveSprite;
          page.image.characterIndex = ev.characterIndex();
        }
      }
    }
  }

  // Gives every party member standing on the map (an idle companion or a
  // visitor, both tagged by VisitingParties.spawnOne) a controller of their own
  // again, without moving them off the tile they were dealt.
  function wakePartyPresences() {
    for (const ev of $gameMap.events()) {
      if (!ev || ev._erased || !ev[VisitingParties.EVENT_TAG]) continue;
      const data = ev.event();
      if (!data || !Utils.hasAITag(data.note)) continue;
      if ($gameSystem.npcControllers.some(c => c.eventName === data.name)) continue;
      const controller = new NPCController(data.name);
      $gameSystem.npcControllers.push(controller);
      controller.decideNextGoal();
    }
  }

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    // Scene_Map.create reloads the map file on every rebuild of the scene, so at
    // this point the transplanted NPC identities have just been wiped. Restore
    // them before anything (page refresh, spriteset, interpreter) reads them.
    if (!$gamePlayer?.isTransferring()) {
      try {
        restoreSpawnedEventData();
      } catch (e) {
        console.error("[NPC System] spawn data restore failed", e);
      }
    }
    _Scene_Map_onMapLoaded.call(this);
    if (!this._isLoadingFromPauseMenu) {
      maybeRegenerateForTest();
      // GroupRegistry.ensureBuiltAsync resolves synchronously when the cache is
      // already warm (normal case: save data or manifest on disk). Only on the
      // very first ever run, when no manifest exists, does it go async, loading
      // all map files concurrently via fetch() instead of blocking the thread
      // with serial sync-XHR. The mapId guard handles the unlikely case where
      // the player transitions away before the slow build finishes.
      const mapId = $gameMap?.mapId();
      if (window.PlatformerMode && window.PlatformerMode.isActive()) return;
      GroupRegistry.ensureBuiltAsync(() => {
        if ($gameMap?.mapId() !== mapId) return;
        // Whoever lives here comes first: the Stairs Hall and the tower are
        // where this world's idle companions wait, and they have a better
        // claim on the floor than the citizens passing over it
        // (NPCSystemParty.js, PartyLodging).
        try {
          window.PartyLodging?.populateHere?.();
        } catch (e) {
          console.error("[NPC System] idle companion spawn failed", e);
        }
        $gameMap.setupNPCControllers();
        // An upper floor of the Omega Tower nobody was drawn on is peopled by
        // its own world (NPCSystem_Procedural.js, populateTowerFloor).
        // The Stairs Hall holds the parties and nobody else: no tower
        // residents, no spaceport crowd, only whoever saved here below.
        const partyOnly = Config.isPartyOnlyMap(mapId);
        try {
          if (!partyOnly) ProceduralManager.populateTowerFloor();
        } catch (e) {
          console.error("[NPC System] tower floor residents failed", e);
        }
        window.NPCSim?.placeNPCsInActivities?.();
        // After the spawn pass, which clears the self switches of every slot it
        // deals: whoever this world lost goes back behind their blank page.
        GoneRegistry.applyToMap();
        // ...and whoever else's party was left standing here turns up.
        try {
          VisitingParties.spawnHere();
        } catch (e) {
          console.error("[NPC System] visiting party spawn failed", e);
        }
        // A landing pad on another world has no roster of its own: its crowd is
        // dealt here, nine faces in ten off the alien half of the wardrobe.
        try {
          if (!partyOnly) ProceduralManager.populateSpaceport();
        } catch (e) {
          console.error("[NPC System] spaceport crowd failed", e);
        }
      });
    }
  };

  const _Scene_Map_stop = Scene_Map.prototype.stop;
  Scene_Map.prototype.stop = function () {
    _Scene_Map_stop.call(this);
  };

  Game_Map.prototype.setupNPCControllers = function () {
    // Prevent re-initialization during pause menu cycles or redundant setups
    if (this._npcControllersInitialized) return;

    // Snapshot the map we're leaving, its NPCs' positions/activities are
    // still readable off the about-to-be-discarded controllers, so coming
    // back to it within the same group restores them where they were.
    // _currentNpcGroup still holds the group of the map we're leaving here,
    // it only gets reassigned to the new map's group further down.
    SpawnManager.captureNPCGroupMemory($gameSystem._npcLastMapId, $gameSystem._currentNpcGroup);
    $gameSystem._npcLastMapId = $gameMap.mapId();

    this._npcControllersInitialized = true;
    $gameSystem.npcControllers = [];
    // No autonomous NPC ever spawns on a platformer stage (see the note in
    // Game_Map.update above).
    if (window.PlatformerMode && window.PlatformerMode.isActive()) return;
    // Note: deliberately NOT gated on $dataMap.note, group membership,
    // AI-tagged events, and Local NPCs all still need to work on maps that
    // carry no map-level note at all (their tags live on individual events).
    if (!$dataMap || !$gameMap) return;

    const currentMapId = $gameMap.mapId();

    // Vehicle interiors get no crowd at all (Config.NPC_FREE_MAP_IDS): no
    // roster, no seated riders, no <AI> repositioning. Bailing out here also
    // leaves their placeholder slots alone, which is what the multiplayer
    // avatars on those maps need.
    if (Config.isNPCFreeMap(currentMapId)) return;

    // A party-only map (Config.PARTY_ONLY_MAP_IDS) is staffed by nobody: the
    // idle companions laid down just before this and the visiting parties laid
    // down just after it are the whole of its population. The companions'
    // controllers were swept with the list above, so they are handed back.
    if (Config.isPartyOnlyMap(currentMapId)) {
      wakePartyPresences();
      return;
    }

    // Nobody is left to spawn anywhere in an empty world. The placeholder
    // slots the crowd would have been dealt into are erased rather than left
    // standing, or every town would be full of motionless strangers wearing
    // whatever graphic their event page was authored with.
    if (Config.isEmptyWorld()) {
      eraseUnpeopledEvents();
      // Except the written cast: an empty world is still their world, and they
      // still walk it (see wakeStoryNPCs).
      wakeStoryNPCs();
      return;
    }

    // Nine in ten of the crowd rose instead of dying. Decided BEFORE the roster
    // is staffed so the dead are settled on their slots first, and re-asserted
    // after it (see reassertZombies) since staffing paints its own faces on.
    if (Config.isZombieWorld()) zombifyMapNPCs();

    // And on ground the Goblin Horde holds, nine of the ten people in a
    // procedural town are goblins. Decided before the roster is staffed for
    // the same reason, and NOT re-asserted after it: the catalogue deals the
    // very same nine tenths to the faces staffing paints on.
    if (Config.isGoblinHordeGround()) goblinizeMapNPCs();

    $gameSystem._npcMapSizes = $gameSystem._npcMapSizes || {};
    $gameSystem._npcMapSizes[currentMapId] = $dataMap.width * $dataMap.height;

    // Clear all tile caches on new map setup to prevent stale lookups
    $gameMap._npcZoneCache = null;
    $gameMap._passableTerrainCache = null;
    $gameMap._npcBedCache = null;
    $gameMap._npcPoliceStaffed = false;
    delete $gameMap[`_npcSpawnZoneCache_${currentMapId}`];

    // Group membership is now derived purely from each map's <MapGroup: Name>
    // note tag (see GroupRegistry), a map tagged <MapGroup: OmegaTower> is
    // discovered as part of "OmegaTower" exactly like any other group, so
    // there's no longer a separate "note tag vs. hardcoded pool" distinction
    // to track here.
    const groupName = MapManager.findMapGroupByMap(currentMapId);
    const isGlobalGroupMap = Config.isGlobalGroup(groupName);
    // <Abandoned> (formerly <NPC>) marks a map as having no settled residents
    // of its own, it always draws fully randomized, transient visitors
    // (exactly like the global group) instead of a persistent assigned
    // roster. Takes precedence over its <MapGroup>, if any: when both tags
    // are present the visitors are still drawn from that group's own pool
    // rather than the global one, only the spawn *style* (random, no
    // persistence) is forced to match the global group's.
    const hasAbandonedTag = ($dataMap.note || "").includes("<Abandoned>");

    // <Shop> events get a day/night persona pair (and, where applicable, a
    // reservation that keeps their "covering" group NPC from double-spawning,
    // see ShopShiftManager.assignPersonas in NPCSimulationCore.js). Regular
    // (non-global) group maps defer this until their roster has settled,
    // right before spawnAssignedNPCs, so local-resident candidates are
    // available; every other map type (house, global group, ungrouped,
    // procedural, <Abandoned>-tagged) is already staffed by stageShopPersonas,
    // which ran before the spriteset was built. Repeating it here is a no-op
    // for those, and covers the one case it could not handle: pools that were
    // still being built asynchronously on the very first run of a world.
    stageShopPersonas();

    // Last building's visits end with it; an interior below starts its own.
    SpawnManager.InteriorVisits._active = null;
    SpawnManager.InteriorVisits._takeovers.clear();

    if (currentMapId === 636) {
      registerProcStitchHook();
      return populateProceduralSquare();
    }

    // Bologna: one map id for every cell of the OSM grid, no authored events on
    // any of them. BolognaMapSystem injects the empty slots before the map is
    // set up; the city is then filled the way Omega City is, so a Bolognese
    // stands next to somebody who came in from any other town in the world,
    // Earth or otherwise.
    if (currentMapId === Config.BOLOGNA_MAP_ID && window.BolognaMapSystem) {
      const bolognaGroup = ProceduralManager.ensureBolognaSettlement();
      if (bolognaGroup) {
        SpawnManager.randomizeOmegaCityMap(currentMapId, bolognaGroup, {
          count: Config.BOLOGNA_NPC_COUNT,
          proceduralRatio: Config.BOLOGNA_PROCEDURAL_RATIO,
          nativePlace: bolognaGroup,
        });
        $gameMap._npcSystemGroupHandled = true;
      }
      return;
    }

    if (MapManager.isHouseMap(currentMapId)) {
      const houseGrpName = MapManager.getCurrentMapGroup()
        || window.ProceduralHouseSystem?._playtestFallbackGroupName;
      const PHS = window.ProceduralHouseSystem;
      const building = PHS?.getCurrentBuilding?.() || null;

      // Any <Shop> counter in this interior (shop/inn template) was staffed by
      // stageShopPersonas above, with a seeded three-shift rota drawn from the
      // townspeople the player just came from.

      // A door on the procedural map: every home floor has a household of its
      // own and every public floor a crowd of regulars, minted here because no
      // interior template carries the slots to dress them in.
      const procKind = houseGrpName
        ? ProceduralManager.procInteriorKind(building, houseGrpName, currentMapId)
        : null;
      if (procKind) {
        try {
          ProceduralManager.populateProcInterior(procKind, building, houseGrpName);
        } catch (e) {
          console.error("[NPC System] procedural interior population failed", e);
        }
        return;
      }

      if (houseGrpName) {
        // Skyscrapers (and their upper floors) are public: nobody lives there,
        // the town passes through. Every other interior is a home, so make sure
        // it has residents before spawning, this is what gives houses entered
        // from a procedural town (whose doors are terrain tiles, never scanned
        // into the residential cache) the townspeople who live behind them.
        const isPublic = PHS?.isPublicInteriorMap?.(currentMapId)
          || PHS?.isBuildingPublic?.(building)
          || false;
        if (!isPublic) window.NPCSim?.ensureBuildingResidents?.(building, houseGrpName);
        SpawnManager.replacePlayerEventsWithNPCs(houseGrpName, { building, isPublic });
      }
      return;
    }

    // _currentNpcGroup deliberately stays sticky across non-group maps,
    // _npcGroupAssignments persists in $gameSystem regardless, and a brief
    // detour through a transfer/corridor map shouldn't force a full reshuffle
    // of the group we're about to walk straight back into.

    // NPCs only ever spawn on maps that are part of a <MapGroup> or carry the
    // <Abandoned> tag, every other map is left untouched (no random global
    // visitors, no pool roster).
    if (groupName || hasAbandonedTag) {
      const group = groupName ? GroupRegistry.get(groupName) : null;
      if (groupName) MapManager.setCurrentMapGroup(groupName);

      // The global group, and any <Abandoned> map, regardless of which group
      // it belongs to (or none), uses full randomization every entry, with
      // no persisted roster. <Abandoned> maps draw from their own <MapGroup>'s
      // pool when they have one, otherwise from the global pool. Seated global
      // groups (e.g. PublicTransport) get their own seat-aware placement pass
      // instead of OmegaTower's spread-across-every-tile style, unless the map
      // itself is tagged <Wander>, an opt-out (e.g. a platform/concourse map
      // that's still part of the PublicTransport group but has no seats of its
      // own) that falls back to the normal every-NPC-wanders behavior.
      const hasWanderTag = ($dataMap.note || "").includes("<Wander>");
      if (currentMapId === Config.OMEGA_CITY_MAP_ID && !groupName) {
        // Omega City outside any group (an old MapGroups manifest): the fixed
        // fifty-strong crowd of SpawnManager.randomizeOmegaCityMap. Inside the
        // OmegaTower group it is peopled by its own residents like any town.
        SpawnManager.randomizeOmegaCityMap(currentMapId, Config.GLOBAL_GROUP_NAME);
        $gameMap._npcSystemGroupHandled = true;
      } else if (groupName && Config.SEATED_GLOBAL_GROUPS.includes(groupName) && !hasWanderTag) {
        SpawnManager.randomizePublicTransportMap(currentMapId, groupName);
        $gameMap._npcSystemGroupHandled = true;
      } else if (isGlobalGroupMap || hasAbandonedTag) {
        SpawnManager.randomizeOmegaTowerMap(currentMapId, groupName || Config.GLOBAL_GROUP_NAME);
        $gameMap._npcSystemGroupHandled = true;
      } else {
        // Recompute the schedule-driven roster when: switching to a different
        // group, entering a group for the first time, "time was skipped"
        // (sleep/fast-travel, see the jump detector in Game_Map.update), or a
        // new in-game hour has begun since the roster was last computed. In
        // every other case (e.g. walking between the group's maps within the
        // same hour) the existing assignment is kept verbatim, so map changes
        // are perfectly consistent, no random drift.
        const curHour = $gameVariables?.value(23) ?? 12;
        const wasInSameGroup = $gameSystem._currentNpcGroup === groupName && !!$gameSystem._npcGroupAssignments;
        const timeSkipped = !!$gameSystem._npcTimeSkipped;
        const hourChanged = $gameSystem._npcAssignmentHour !== curHour;
        if (!wasInSameGroup || timeSkipped || hourChanged) {
          $gameSystem._npcTimeSkipped = false;
          SpawnManager.initializeGroupNPCs(groupName, currentMapId);
        }
        // else: keep _npcGroupAssignments unchanged for a consistent roster.

        // <Shop> events get a day/night persona pair before the roster spawns,
        // so any group NPC drawn to "cover the counter" can be reserved out of
        // also spawning as a separate wanderer here, see ShopShiftManager
        // (NPCSimulationCore.js) and the reservation filter in spawnAssignedNPCs.
        // Must run after the roster (_npcGroupAssignments[currentMapId]) is
        // settled above, so local-resident candidates are available. Skipped
        // in an empty world, same rule as stageShopPersonas: nobody is behind
        // any counter, the till stays but the persona does not get drawn.
        if (!Config.isEmptyWorld()) {
          window.NPCSim?.ShopShiftManager?.assignPersonas?.(currentMapId, groupName);
        }

        SpawnManager.spawnAssignedNPCs(currentMapId, group, groupName);
        $gameMap._npcSystemGroupHandled = true;

        // Warm size cache for other maps in the group
        for (const mId of group.maps) {
          if ($gameSystem._npcMapSizes[mId] === undefined) {
            MapManager.loadMapSizeAsync(mId);
          }
        }
      }
    }

    // <AI>-tagged events get an NPCController whenever they're present,
    // pre-placed AI events are deliberate map-design choices, so they're
    // wired up regardless of <MapGroup>/<Abandoned> status. A tagged event the
    // author drew no face on (or one already recruited into the party, its
    // self-switch A on) is not a person and is left alone, see
    // Utils.isControllableEvent.
    const npcEvents = $gameMap.events().filter(e => Utils.hasAITag(e?.event()?.note) && Utils.isControllableEvent(e));

    // If a group/global-group pass already handled NPCs on this map, skip
    // this section's repositioning and culling to avoid overwriting it.
    if (npcEvents.length && !$gameMap._npcSystemGroupHandled) {
      const tiles = MapManager.getSpreadSpawnTiles();

      npcEvents.forEach((npc, i) => {
        // Never relocate or claim the active Player 2 avatar, even if it was
        // authored from an NPC template and still carries an <AI> note.
        if (window.$gameSplitScreen?.active && window.$gameSplitScreen.p2Event === npc) return;
        const isLocal = npc.event()?.note?.toLowerCase().includes("local");
        // A written character stands where they were written, the spread pass
        // only ever moves the anonymous crowd.
        const isStory = Utils.hasStoryTag(npc.event()?.note);
        if (!isLocal && !isStory && i < tiles.length) {
          npc.locate(tiles[i].x, tiles[i].y);
          console.log(`[NPC System] NPC spawned via <AI> tag: "${npc.event().name}" at (${tiles[i].x}, ${tiles[i].y}) on map ${currentMapId}`);
        }
        npc.setMoveSpeed(3);
        npc.setMoveFrequency(isLocal ? 5 : 3);
        npc.setThrough(false);
        npc.setPriorityType(1);
        npc.setOpacity(255); // ensure AI-loop NPCs are not left semi-transparent from a prior sleeping state (#48)
        if (!$gameSystem.npcControllers.some(c => c.eventName === npc.event().name)) {
          const controller = new NPCController(npc.event().name);
          $gameSystem.npcControllers.push(controller);
          controller.decideNextGoal();
        }
      });

    }

    // Setup LOCAL NPCs on the map (always spawn here regardless of group rosters,
    // their template can still travel to other maps' rosters, see buildNPCPool)
    // A <Local> NPC walks only when the author also asked for it with "AI": the
    // tag says where they belong, not that they wander off it.
    const localEvents = $gameMap.events().filter(e => Utils.hasLocalTag(e?.event()?.note) && Utils.hasAITag(e?.event()?.note) && Utils.isControllableEvent(e));
    localEvents.forEach(npc => {
      // Never relocate or claim the active Player 2 avatar.
      if (window.$gameSplitScreen?.active && window.$gameSplitScreen.p2Event === npc) return;
      npc.setMoveSpeed(3);
      npc.setMoveFrequency(5);
      npc.setThrough(false);
      npc.setPriorityType(1);
      npc.setOpacity(255);

      // A <Local> NPC belongs to the spot the author placed them on: they are
      // the resident of that tile, not a face in the crowd, so the spread pass
      // never scatters them. They still roam from there via their controller.

      if (!$gameSystem.npcControllers.some(c => c.eventName === npc.event().name)) {
        const controller = new NPCController(npc.event().name);
        controller.isLocal = true;
        console.log(`[NPC System] Local NPC spawned: "${npc.event().name}" at (${npc.x}, ${npc.y}) on map ${currentMapId}`);
        
        $gameSystem.npcControllers.push(controller);
        controller.decideNextGoal();
      }
    });

    wakeStoryNPCs();

    // The police post, and the patrols the party's wanted heat has called in.
    try {
      PoliceForce._lastBracket = PoliceForce.extraFor(PoliceForce.heat());
      PoliceForce.staffHere();
      $gameMap._npcPoliceStaffed = true;
    } catch (e) {
      console.error("[NPC System] police staffing failed", e);
    }

    // The people minted past the author's slots were not there when the dead
    // were decided, so they are decided now (seeded on their name).
    if (Config.isZombieWorld()) zombifyMapNPCs();

    // The dead have the last word. The staffing passes above write roster
    // sprites straight onto the events, so the slots that rose are re-asserted
    // here: same person, same tile, the face they rose in back on top.
    // Idempotent, and a no-op everywhere but a zombie world.
    if (Config.isZombieWorld()) reassertZombies();
  };

  // Pending hour-boundary refresh stages, processed one per frame (see below)
  let _hourlyRefreshQueue = null;

  const _Game_Map_update = Game_Map.prototype.update;
  Game_Map.prototype.update = function (sceneActive) {
    _Game_Map_update.call(this, sceneActive);
    if (!sceneActive) return;
    // Map Battle Mode (MapBattleMode.js) freezes the world: NPCs stop running
    // their real-time routines and instead spend the steps the fight grants them
    // (see NPCController.updateTacticalStep). Every other simulation tick below
    // keeps running, only the movement clock is suspended.
    // On a shared map in a network session the NPCs are walked by the one
    // machine driving that map; everybody else places them from its packets
    // (Multiplayer/MultiplayerSystem.js), so the controllers must not step here.
    // A <Platform> map is a 2D platformer (Map/PlatformerMode.js): the party is
    // a physics body on a side view stage, not a token on a walkable grid, so
    // the autonomous simulation has nothing to walk and stays out entirely.
    if (window.PlatformerMode && window.PlatformerMode.isActive()) return;
    const drivesMap = !window.MultiplayerRemote || window.MultiplayerRemote.drivesMap();
    if (window.MapBattleMode && window.MapBattleMode.isActive()) {
      $gameSystem.npcControllers?.forEach(c => c.updateTacticalStep?.());
    } else if (drivesMap) {
      $gameSystem.npcControllers?.forEach(c => c.update());
      // Somebody who has reached their door has gone through it.
      SpawnManager.updateCommutes();
      // Visitors coming into and leaving the building, once a game minute.
      SpawnManager.InteriorVisits.update();
      // Pockets picked and fights picked between the people on the map.
      try { StreetCrime.update(); } catch (e) { console.error("[NPC System] street crime tick failed", e); }
    }
    // Needs tick: every 10 game minutes, decay hunger/sleep for all loaded NPCs.
    // FALLBACK ONLY. When NPCSimulationCore (window.NPCSim) is loaded it owns the
    // full needs model: it drains all five needs (hunger/sleep/hygiene/social/
    // leisure) and sets a rich currentNeed via ScheduleManager every tick for
    // on-map NPCs. The legacy tickNeeds below only knows hunger/sleep and
    // hard-resets currentNeed to food/sleep/null, so running it alongside the
    // sim double-drained hunger/sleep AND wiped the richer need (work/social/
    // leisure/...) every 10 minutes, making the need badge blink empty. Skip it
    // entirely when the sim core is present; keep it as a degraded fallback if
    // that plugin is ever disabled.
    if ($gameVariables) {
      const gameMin = $gameVariables.value(114);
      const lastTick = $gameSystem._npcLastNeedsTick ?? 0;
      if (!window.NPCSim && gameMin - lastTick >= 10) {
        const elapsed = gameMin - lastTick;
        $gameSystem._npcLastNeedsTick = gameMin;
        ($gameSystem.npcControllers ?? []).forEach(c => {
          if (c.eventName) window.NPCSocietyRegistry?.tickNeeds(c.eventName, elapsed);
        });
      }

      // A jump of this size in a single tick can only come from sleeping,
      // fast-travel, or a time-skip command, never from walking (which moves
      // the clock at most 1 minute per 10 steps). Flag it so the next group
      // entry redetermines hangout assignments instead of "freezing" NPCs in
      // whatever spot they were in before the skip.
      const lastSeenMin = $gameSystem._npcLastSeenMinute ?? gameMin;
      if (gameMin - lastSeenMin >= Config.GROUP_TIME_SKIP_MINUTES) {
        $gameSystem._npcTimeSkipped = true;
      }
      $gameSystem._npcLastSeenMinute = gameMin;

      // Hour boundary: re-resolve every NPC's schedule-driven map and refresh
      // the live roster on the current map (NPCs whose schedule moved them on
      // leave, newly-scheduled ones move in, everyone else relocates + repicks
      // a goal). This handles a clock that ticked forward normally *and* one
      // that was skipped (sleeping/fast-travel) while staying on the same map,
      // either way we clear the skip flag, since we're recomputing right now.
      // Global/<Abandoned>/house maps use their own spawn styles and are left be.
      const curHour = $gameVariables.value(23);
      if ($gameSystem._npcLastHourSeen === undefined) $gameSystem._npcLastHourSeen = curHour;
      if (curHour !== $gameSystem._npcLastHourSeen) {
        $gameSystem._npcLastHourSeen = curHour;
        $gameSystem._npcTimeSkipped = false;
        if ($dataMap) {
          const mapId = $gameMap.mapId();
          const groupName = MapManager.findMapGroupByMap(mapId);
          const isGlobal = Config.isGlobalGroup(groupName);
          const isAbandoned = ($dataMap.note || "").includes("<Abandoned>");
          if (groupName && !isGlobal && !isAbandoned && !MapManager.isHouseMap(mapId)) {
            // Queue the three refresh stages instead of running them in one
            // frame (visible hitch). One stage runs per frame, in order; a new
            // hour boundary replaces any still-pending queue.
            _hourlyRefreshQueue = { mapId, steps: [
              () => SpawnManager.initializeGroupNPCs(groupName, mapId),
              () => { if (!Config.isEmptyWorld()) window.NPCSim?.ShopShiftManager?.assignPersonas?.(mapId, groupName); },
              () => SpawnManager.refreshCurrentMapForHour(groupName),
            ] };
          }
        }
      }
      if (_hourlyRefreshQueue) {
        if (_hourlyRefreshQueue.mapId !== $gameMap.mapId()) {
          // Player left the map mid-refresh; drop the stale stages (the next
          // hour boundary recomputes everything anyway)
          _hourlyRefreshQueue = null;
        } else {
          _hourlyRefreshQueue.steps.shift()();
          if (_hourlyRefreshQueue.steps.length === 0) _hourlyRefreshQueue = null;
        }
      }
    }
  };

  Game_CharacterBase.prototype.fadeIn = function () { this._fadeType = "in"; this._fadeSpeed = 10; };
  Game_CharacterBase.prototype.fadeOut = function () { this._fadeType = "out"; this._fadeSpeed = 10; };

  const _Game_CharacterBase_update = Game_CharacterBase.prototype.update;
  Game_CharacterBase.prototype.update = function () {
    _Game_CharacterBase_update.call(this);
    if (this._fadeType === "in") {
      this.setOpacity(Math.min(this.opacity() + this._fadeSpeed, 255));
      if (this.opacity() >= 255) this._fadeType = null;
    } else if (this._fadeType === "out") {
      this.setOpacity(Math.max(this.opacity() - this._fadeSpeed, 0));
      if (this.opacity() <= 0) this._fadeType = null;
    }
  };

  const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (cmd, args) {
    _Game_Interpreter_pluginCommand.call(this, cmd, args);
    if (cmd === "ReplacePlayerEvents") SpawnManager.replacePlayerEventsWithNPCs(MapManager.getCurrentMapGroup());
    else if (cmd === "SetMapGroup") MapManager.setCurrentMapGroup(args[0]);
    else if (cmd === "ClearMapGroup") MapManager.setCurrentMapGroup(null);
  };

  // ── World initialization: the WorldGen manifests ────────────────────────────
  // MapGroups.json and NPCResidents.json are derived from the maps, not from the
  // world, so they are shared by every world and normally ship with the game.
  // What a new world needs is the guarantee that they are THERE and current
  // before anything reads them: the roster, the job rotas and the shop rotas
  // are all drawn from these pools, and a world generated against a missing
  // manifest would come out empty. So the step checks rather than rebuilds,
  // and only pays the multi-second map scan when there is genuinely nothing to
  // read (a fresh checkout, or a manifest left over from an older format).
  // This is the same rebuild the "Test" player-name dev hook forces, minus the
  // forcing: see maybeRegenerateForTest.
  function worldgenManifestsNeedBuild() {
    if (!WorldgenStore.load()) return "MapGroups.json missing";  // i18n-ignore: diagnostic
    const manifest = NPCPoolStore.load();
    if (!manifest) return "NPCResidents.json missing or of an older format";  // i18n-ignore: diagnostic
    if (!manifest.__shops || !manifest.__templates) return "NPCResidents.json is incomplete";  // i18n-ignore: diagnostic
    return null;
  }

  // The static manifests (MapGroups, NPCResidents) are only checked here; the
  // people themselves are dealt by the society's roster step, once the
  // personality and sprite tables it mints them from have loaded
  // (NPCSociety.initializeWorldRoster -> window.NPCSystem.ensureResidents).
  function initializeWorldgenManifests() {
    const reason = worldgenManifestsNeedBuild();
    if (reason) {
      console.log(`[NPC System] Rebuilding the WorldGen manifests for this world (${reason}).`);
      WorldgenStore.deleteFile();
      NPCPoolStore.deleteFile();
      if (window.WorldGen) delete window.WorldGen.MapGroups;
      GroupRegistry._cache = null;
      GroupRegistry._mapIndex = null;
      SpawnManager._shopIndexSession = {};
      SpawnManager._authoredSession = {};
      SpawnManager._poolSession = {};
      if ($gameSystem) $gameSystem._npcMapGroups = null;
    }
    // Warms every hand-made group's authored pool, which also completes the
    // per-map shop index when there is no manifest to read it from.
    const groups = GroupRegistry.build();
    for (const groupName of Object.keys(groups)) {
      if (Config.isProceduralGroup?.(groupName)) continue;
      try { SpawnManager.getAuthoredPool(groupName); } catch (e) {
        console.error(`[NPC System] Could not read the authored NPCs of "${groupName}"`, e);
      }
    }
  }

  if (window.WorldManager && window.WorldManager.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("worldgenManifests", 10, initializeWorldgenManifests);
  }

  // Expose group lookups for other plugins (NPCSociety, NPCSimulationCore).
  // getLevelRangeForMap was dropped along with the old hardcoded per-group
  // level ranges, callers already fall back to a default range via `?? [1, 20]`.
  Object.assign(window.NPCSystem, {
    getMapGroups: () => GroupRegistry.build(),
    getMapGroup: GroupRegistry.get,
    // Exposed so NPCSimulationCore's ShopShiftManager can draw <Shop> personas
    // from the same template/roster pools the spawn system already uses.
    getNPCPool: SpawnManager.getNPCPool,
    getAuthoredPool: SpawnManager.getAuthoredPool,
    keepLocalsHome: SpawnManager.keepLocalsHome,
    // --- the seeded residents of every map group (RESIDENT REGISTRY) --------
    // Deals every hand-made group's people; the society's world roster step
    // calls it once the profile tables have loaded.
    ensureResidents: () => ResidentRegistry.ensureWorld(),
    ensureGroupResidents: (groupName) => ResidentRegistry.ensureGroup(groupName),
    isResident: (name) => ResidentRegistry.isResident(name),
    residentHomeMap: (name) => ResidentRegistry.homeMapOf(name),
    getGroupResidents: (groupName) => ResidentRegistry.namesOf(groupName),
    getWorldResidents: () => ResidentRegistry.worldResidents(),
    residentHeadCount: (mapId) => ResidentRegistry.headCount(mapId),
    // A move to another town for good (NPCLifeSim RELOCATION), the newcomers
    // of a procedural square, and the two questions a move asks first: is
    // this one of the authored cast, and has the world lost them.
    rehomeResident: (name, fromGroup, toGroup, opts) => ResidentRegistry.rehome(name, fromGroup, toGroup, opts),
    immigrantsOf: (groupName) => ResidentRegistry.immigrantsOf(groupName),
    // The Horde's re-dealing and the refugees' wild camps (HORDE HOMES AND
    // REFUGEE CAMPS), asked by NPCLifeSim REFUGEES.
    refillHordeHomes: (groupName, count, tag) => refillHordeHomes(groupName, count, tag),
    ensureCampGroup: (x, y, country, label) => ensureCampGroup(x, y, country, label),
    addCampTent: (groupName, household) => addCampTent(groupName, household),
    pitchCamp: (groupName) => pitchCamp(groupName),
    isReservedName: (name) => ResidentRegistry.isReservedName(name),
    isStoryName: (name) => ResidentRegistry.isStoryName(name),
    isNameGone: (name) => GoneRegistry.isNameGone(name),
    // One named person put on the procedural map (a visitor, a newcomer).
    placeNamedNPC: (name, x, y, opts) => ProceduralManager.placeNamedNPC(name, x, y, opts),
    // Somebody on the road on foot, by bike or by broom (ROAD TRAVELLERS).
    spawnTravellerNPC: (name, x, y, opts) => ProceduralManager.spawnTravellerNPC(name, x, y, opts),
    releaseTravellerNPC: (ev) => ProceduralManager.releaseTravellerNPC(ev),
    dressTraveller: (ev) => ProceduralManager.dressTraveller(ev),
    // --- the police (<Officers: N> and the wanted heat) ---------------------
    officerCountFor: (mapId, heat) => PoliceForce.countFor(mapId, heat),
    onHeatChanged: (heat) => PoliceForce.onHeatChanged(heat),
    staffPolice: () => PoliceForce.staffHere(),
    // --- bounties on NPCs (NPCLifeSim wantedBounty) --------------------------
    bountyOf: (name) => NPCBounty.of(name),
    isWanted: (name) => NPCBounty.isWanted(name),
    collectBounty: (name) => NPCBounty.collect(name),
    wantedNPCs: () => NPCBounty.wanted(),
    StreetCrime,
    // Spawn templates synthesized from society profiles, for towns with no
    // authored NPC events (procedural settlements). See makeSocietyTemplate.
    buildSocietyPool: SpawnManager.buildSocietyPool,
    makeSocietyTemplate: SpawnManager.makeSocietyTemplate,
    // Interior <Shop> staffing helpers, see ShopShiftManager.assignInteriorPersonas.
    getShopSocietyCandidates: SpawnManager.getShopSocietyCandidates,
    isShopEligibleSprite: SpawnManager.isShopEligibleSprite,
    // One of the dead walking (a zombie world only). Asked by NPCEmpathize, so
    // the panel is never opened on one: the interaction IS the fight.
    isZombieWalker: (ev) => isZombieWalker(ev),
    // Honours the grace period after an escape: inside it, nothing starts.
    requestZombieBattle: (ev) => { if (canStartZombieBattle()) requestZombieBattle(ev); },
    generateSeededPersona: SpawnManager.generateSeededPersona,
    hasShopTag: Utils.hasShopTag,
    isAnyShopEvent: Utils.isAnyShopEvent,
    counterFacingDir: Utils.counterFacingDir,
    getCounterFacingDir: Utils.counterFacingDir,
    sanitizeShopEvent: sanitizeShopEvent,
    // A shop counter changing hands in front of the party, walked from and to
    // the map's exit (SpawnManager InteriorVisits).
    beginShopHandover: (counter, outgoing, incoming, onSeated) =>
      SpawnManager.beginShopHandover(counter, outgoing, incoming, onSeated),
    sanitizeMapShopEvents: sanitizeMapShopEvents,
    // Tells a rota counter (no graphic) apart from a Shop event whose
    // shopkeeper the author drew and who is therefore always on duty.
    hasOwnGraphic: Utils.hasOwnGraphic,
    hasHiddenTag: Utils.hasHiddenTag,
    // Residents of a hand-made map, see NPCSociety's local-level sync: their
    // level follows the party's median instead of a one-time roll.
    hasLocalTag: Utils.hasLocalTag,
    hasNPCTag: Utils.hasNPCTag,
    isPlayerSlotName: Utils.isPlayerSlotName,
    // The events on this map that may be dealt a spawned NPC. Player slots are
    // only among them when asked for, and never while a session is live.
    getPlaceholders: SpawnManager.getPlaceholders,
    isNPCEvent: Utils.isNPCEvent,
    // A written character: never travels, always on their own map, never fought
    // or infected, and one person behind their till rather than a shift rota.
    // See Utils.hasStoryTag for the whole of what the tag means.
    hasStoryTag: Utils.hasStoryTag,
    extractShopName: Utils.extractShopName,
    // Per-map index of shop-like events ( <Shop> tag / Shop Processing /
    // RandomDailyShop commands ), see SpawnManager.buildShopIndex.
    getShopIndex: SpawnManager.getShopIndex,
    // Template sprite lookup for off-map NPCs (bust resolution etc.).
    findTemplateSprite: SpawnManager.findTemplateSprite,
    GLOBAL_GROUP_NAME: Config.GLOBAL_GROUP_NAME,
    // "Proc:x,y" settlements are minted as the player reaches those world
    // coordinates, so world-wide passes over the authored groups skip them.
    isProceduralGroup: (groupName) => Config.isProceduralGroup(groupName),
    // Groups (e.g. "PublicTransport") whose NPCs are only ever taking a
    // temporary ride rather than living their normal routine, see
    // NPCEmpathizeUI's routine-tab "Traveling" override.
    SEATED_GLOBAL_GROUPS: Config.SEATED_GLOBAL_GROUPS,
    findMapGroupByMap: MapManager.findMapGroupByMap,
    isHouseMap: MapManager.isHouseMap,
    isLocalsOnlyMap: MapManager.isLocalsOnlyMap,
    // <Interior>/<Exterior> tag of any map, authored or procedural-current, see
    // MapManager.getMapEnvironmentTag. Used to keep the Animals/ wardrobe (see
    // NPCCreature) off NPCs whose home event is indoors.
    getMapEnvironmentTag: MapManager.getMapEnvironmentTag,
    loadMapData: MapManager.loadMapData,
    // --- wiki lookup API (NPCEmpathize internal encyclopedia) ---------------
    getGroupNames: () => Object.keys(GroupRegistry.build()),
    getNPCNamesByGroup: (groupName) =>
      (SpawnManager.getNPCPool(groupName) || [])
        .map(t => t?.eventData?.name)
        .filter(n => n && n !== "NPC"),
    // Procedural recruit lifecycle (map 636): record a citizen that joined the
    // party so it is cached in the world folder and never respawns on its tile.
    recordProceduralRecruit: ProceduralManager.recordProceduralRecruit,
    // One person put on the procedural map outside the population pass, on a
    // slot that pass did not need. `{ visitor: true }` draws an authored face
    // from the world-wide pool instead of minting a citizen of this square.
    // Used by RoadCarAI for the drivers who pull over and get out.
    spawnRoadsideNPC: ProceduralManager.spawnRoadsideNPC,
    // Water a person can swim in, and the nearest shore tile beside some
    // (SwimSpots, Phase R): NPCSim.Water sends swimmers and anglers there.
    isSwimWater: (x, y) => SwimSpots.isSwimWater(x, y),
    findWaterSpot: (x, y, opts) => SwimSpots.findSpot(x, y, opts),
    populateSpaceport: () => ProceduralManager.populateSpaceport(),
    spaceportSiteNow: () => ProceduralManager.spaceportSiteNow(),
    getRecruitedProcEventIds: ProceduralManager.getRecruitedEventIds,
    // ...and the two halves of undoing one, for a member dismissed back into
    // the world from the Dynamics board.
    findProceduralRecruit: ProceduralManager.findProceduralRecruit,
    forgetProceduralRecruit: ProceduralManager.forgetProceduralRecruit,
    // --- Map Battle Mode stepping (MapBattleMode.js) -------------------------
    // Bank N tiles of movement for every live NPC on the map. Called once per
    // round, at the world step, so the frozen town lurches one tile forward
    // between rounds instead of drifting alongside the fight.
    // A townsperson who has taken the party's side is skipped: they are a
    // combatant now (event._mbmCombatant), and MapBattleMode owns where they
    // stand for the rest of the fight.
    grantTacticalSteps: (n) =>
      ($gameSystem.npcControllers || []).forEach(c => {
        if (c?.event?._mbmCombatant) return;
        c?.grantTacticalSteps?.(n);
      }),
    clearTacticalSteps: () =>
      ($gameSystem.npcControllers || []).forEach(c => c?.clearTacticalSteps?.()),
    // --- Making way in a one-tile corridor (NPCYield) ------------------------
    // Exposed so another movement plugin can ask an NPC to clear a passage
    // (or read the geometry the check runs on) rather than duplicating it.
    isNarrowTile: (x, y) => NPCYield.isNarrow(x, y),
    requestYield: (x, y) => {
      const c = NPCYield.controllerAt(x, y);
      if (!c) return false;
      c.yieldToPlayer();
      return c.state === 'yielding';
    },
  });

})();
