/*:
 * @target MZ
 * @plugindesc NPC System: the spawn manager
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @help
 * ============================================================================
 * NPCSystem_Spawn, part of the NPCSystem family
 * ============================================================================
 * Owns SpawnManager: who is put on a map, where, and when.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    buildNPCCharacterPool, Config, GroupRegistry, isBetaSprite, MapManager, NPCPoolStore,
    ORTHO_DIRS, pickNPCCharacter, Utils,
  } = window.NPCSystem._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let
    GoneRegistry, mintEvent, NPCController, NPCSeats, ProceduralManager, ResidentRegistry,
    VisitingParties;
  window.NPCSystem._internal._late.push(() => ({
    GoneRegistry, mintEvent, NPCController, NPCSeats, ProceduralManager, ResidentRegistry,
    VisitingParties,
  } = window.NPCSystem._internal));

  // ==========================================================================
  // SPAWN & PROCEDURAL MANAGERS
  // ==========================================================================
  const SpawnManager = {
    // <Shop> events are deliberately excluded: a rota counter has no graphic of
    // its own (see ShopShiftManager) so it can't serve as a template for a
    // transplanted NPC, and one that does have a graphic is a named shopkeeper
    // anchored to that till, who must never be drawn anywhere else.
    // <Story> events are excluded for the opposite reason: they are a written
    // person tied to the map they stand on, so their template must never be
    // dealt onto another map's roster (see Utils.hasStoryTag).
    buildNPCPool: (mapData, mapId) => {
      return (mapData?.events || []).filter(ev => {
        if (!ev || !Utils.isNPCEvent(ev.note) || Utils.hasStoryTag(ev.note)) return false;
        if (!ev.pages?.length || !ev.pages.some(p => p?.list?.length > 1)) return false;
        const imgName = (ev.pages || []).map(p => p?.image?.characterName).find(Boolean);
        if (imgName && isBetaSprite(imgName)) return false;
        return true;
      }).map(ev => ({ eventData: ev, eventId: ev.id, mapId }));
    },

    // Every template a pool hands out is drawn with a sheet that is still on
    // disk. A pool is harvested off map JSON once and then cached, both for the
    // session and in js/db/WorldGen/NPCResidents.json,
    // so a pool built before a sprite was moved or renamed keeps dealing the
    // name it was harvested under long after the file stopped answering to it.
    // The wardrobe knows where every one of them went (SpriteCatalog), so the
    // templates are put right on the way out rather than 404-ing one by one on
    // whatever map the NPC is transplanted onto. Done once per pool: the flag
    // rides on the array itself, which is what the cache holds.
    validSprites: (pool) => {
      const SC = window.SpriteCatalog;
      if (!Array.isArray(pool) || pool._spritesChecked || !SC?.legacySheet) return pool;
      pool._spritesChecked = true;
      for (const tpl of pool) {
        for (const page of (tpl?.eventData?.pages || [])) {
          const img = page?.image;
          if (!img?.characterName) continue;
          const now = SC.legacySheet(img.characterName, img.characterIndex || 0);
          if (!now) continue;
          img.characterName = now.name;
          img.characterIndex = now.index;
        }
      }
      return pool;
    },

    // Indexes every "shop-like" event on a map: <Shop>-tagged counters, events
    // with a standard Shop Processing (code 302), and RandomDailyShop plugin
    // command events (code 357). Persisted alongside the template pools in
    // NPCResidents.json (manifest "__shops") so on-map shop lookups (NPC buying,
    // Steal targets, persona schedules) never re-parse map JSON.
    buildShopIndex: (mapData, mapId) => {
      // A RandomDailyShop themed shop, read the way StealingSystem's
      // ShopScanner reads one: the plugin's path-prefixed name on newer maps
      // ("Economy/RandomDailyShop") and the bare one on older ones.
      const DAILY_PLUGIN = "RandomDailyShop";   // i18n-ignore: plugin name
      const DAILY_COMMANDS = ["openThemedShop"];  // i18n-ignore: plugin command ids
      const entries = [];
      for (const ev of (mapData?.events || [])) {
        if (!ev) continue;
        let hasStandardShop = false;
        let dailyShopCommand = null;
        for (const page of (ev.pages || [])) {
          for (const cmd of (page?.list || [])) {
            if (cmd.code === 302) hasStandardShop = true;
            else if (cmd.code === 357 && String(cmd.parameters?.[0] || "").split("/").pop() === DAILY_PLUGIN
              && DAILY_COMMANDS.includes(cmd.parameters[1])) {
              dailyShopCommand = cmd.parameters[1];
            }
          }
        }
        const shopTagged = Utils.hasShopTag(ev.note);
        if (!shopTagged && !hasStandardShop && !dailyShopCommand) continue;
        entries.push({
          mapId, eventId: ev.id, x: ev.x, y: ev.y,
          name: ev.name || "",
          shopTagged,
          // A Shop counter the author gave a face to is manned by that one
          // person forever, so the world rota must not staff it (see
          // ShopShiftManager.assignWorldShopPersonas). Read here, off the map
          // file, because a rota persona is written onto the live event's page
          // data and would read back as an author graphic later on.
          hasGraphic: Utils.hasOwnGraphic(ev),
          // A <Story> counter is one written person's till, so the world rota
          // never staffs it either, face drawn on the event or not.
          story: Utils.hasStoryTag(ev.note),
          // A <Local> + <Shop> till is its own keeper's (see the world rota).
          local: Utils.hasLocalTag(ev.note),
          hasStandardShop,
          dailyShopCommand,
          shopName: Utils.extractShopName(ev),
        });
      }
      return entries;
    },

    // Looks up an NPC template's character sprite by event name across every
    // cached pool, lets UI layers (e.g. NPCEmpathize bust resolution) find
    // the sprite of an NPC who isn't on the current map. Raw map JSON keeps
    // the graphic on each page's image data, mirroring ShopShiftManager.
    findTemplateSprite: (npcName) => {
      if (!npcName) return null;
      // A seeded resident wears the face their profile was minted around.
      const profile = ResidentRegistry.isResident(npcName) ? $gameSystem?._npcSociety?.[npcName] : null;
      if (profile?.spriteKey && !isBetaSprite(profile.spriteKey)) {
        return { characterName: profile.spriteKey, characterIndex: profile.bustIndex || 0 };
      }
      const search = (pool) => {
        for (const tpl of (pool || [])) {
          const ev = tpl?.eventData;
          if (!ev || ev.name !== npcName) continue;
          const img = (ev.pages || []).map(p => p?.image).find(im => im?.characterName);
          if (img && !isBetaSprite(img.characterName)) return { characterName: img.characterName, characterIndex: img.characterIndex || 0 };
        }
        return null;
      };
      for (const groupName of Object.keys(GroupRegistry.build() || {})) {
        const found = search(SpawnManager.getAuthoredPool(groupName));
        if (found) return found;
      }
      return null;
    },

    // Returns the shop index for a map, manifest first, lazy single-map scan
    // otherwise (covers ungrouped maps that never go through pool building).
    getShopIndex: (mapId) => {
      if (!mapId) return [];
      SpawnManager._shopIndexSession = SpawnManager._shopIndexSession || {};
      if (SpawnManager._shopIndexSession[mapId]) return SpawnManager._shopIndexSession[mapId];

      const manifest = NPCPoolStore.load();
      let entries = manifest?.__shops?.[mapId] || SpawnManager._shopIndexSession?.[mapId];
      if (!entries) {
        const mapData = ($dataMap && $gameMap && $gameMap.mapId() === mapId)
          ? $dataMap : MapManager.loadMapData(mapId);
        entries = mapData ? SpawnManager.buildShopIndex(mapData, mapId) : [];
      }
      SpawnManager._shopIndexSession[mapId] = entries;
      return entries;
    },
    // A Varlenian face is only ever seen on Varlenian ground, and that is one
    // place only: a map whose own group is Varlenia (SpriteCatalog.isVarlenianPlace).
    // A procedural square is not it however the world map is painted, the Omega
    // Tower is not, and neither is a map every group borrows, a vehicle
    // interior or a train carriage among them.
    //
    // The sheet pool already answers this for a procedural citizen. This is the
    // same rule for the AUTHORED templates, which travel between groups through
    // the global pool and would otherwise carry a Varlenian out of Varlenia and
    // deal them into a town on the other side of the map. Applied as a view on
    // the way out rather than while harvesting: the pool is cached per group,
    // in a manifest shared by every map, while the answer here changes with
    // where the party is standing.
    keepVarlenianHome: (pool) => {
      const SC = window.SpriteCatalog;
      if (!Array.isArray(pool) || !SC || SC.isVarlenianPlace()) return pool || [];
      const db = window.WorldGen?.NPCs || {};
      return pool.filter(tpl => {
        const img = (tpl?.eventData?.pages || []).map(pg => pg?.image).find(im => im?.characterName);
        return !(img && db[img.characterName]?.varlenian === true);
      });
    },

    // <LocalsOnly>: the crowd of this map is drawn from its own map group and
    // from the map itself, never from anywhere else. A group's pool reaches
    // into every other group whenever the local supply is thin, and the global
    // group has always drawn from the whole world (see getNPCPool), so a town
    // that wants to look like itself would otherwise fill up with faces that
    // live on the far side of the map. Applied as a view on the way out, the
    // same way keepVarlenianHome is: the cached pool and the manifest are
    // shared by every map and stay whole, only what THIS map may draw from is
    // narrowed. It says nothing about the other direction, a local of a
    // <LocalsOnly> town still travels and is still dealt into other towns.
    keepLocalsHome: (pool, groupName) => {
      if (!Array.isArray(pool) || !pool.length) return pool || [];
      const mapId = $gameMap ? $gameMap.mapId() : null;
      if (!mapId || !MapManager.isLocalsOnlyMap(mapId)) return pool;
      const homeGroup = MapManager.findMapGroupByMap(mapId) || groupName;
      const allowed = new Set(GroupRegistry.get(homeGroup)?.maps || []);
      allowed.add(mapId);
      return pool.filter(tpl => allowed.has(tpl?.mapId));
    },

    // The authored people who survive on a group's own maps: Local, Shop and
    // unique-content events (the generic crowd was retired for the seeded
    // residents, see tools/npc/cleanup_npc_events.mjs). Nothing is borrowed
    // from other groups any more: a Local is met away from home by being dealt
    // as a visitor (SpawnManager.localVisitors), not by sitting in a pool.
    getAuthoredPool: (groupName) => {
      SpawnManager._authoredSession = SpawnManager._authoredSession || {};
      const key = Config.isProceduralGroup(groupName) ? NPCPoolStore.PROC_KEY : groupName;
      if (SpawnManager._authoredSession[key]) return SpawnManager._authoredSession[key];

      const manifest = NPCPoolStore.load();
      let pool = manifest && manifest[key];
      if (pool) {
        pool = pool.filter(t => !Utils.hasStoryTag(t?.eventData?.note));
      } else {
        pool = [];
        const maps = key === NPCPoolStore.PROC_KEY ? [636] : (GroupRegistry.get(groupName)?.maps || []);
        SpawnManager._shopIndexSession = SpawnManager._shopIndexSession || {};
        for (const mId of maps) {
          const mapData = MapManager.loadMapData(mId);
          if (!mapData) continue;
          pool.push(...SpawnManager.buildNPCPool(mapData, mId));
          if (!SpawnManager._shopIndexSession[mId]) SpawnManager._shopIndexSession[mId] = SpawnManager.buildShopIndex(mapData, mId);
        }
      }
      SpawnManager._authoredSession[key] = SpawnManager.validSprites(pool);
      return SpawnManager._authoredSession[key];
    },

    // Everyone who may be dealt onto a map of this group: its authored
    // survivors and its seeded residents (ResidentRegistry), each as a spawn
    // template. Session-memoised against the resident roster's stamp, so a
    // group re-dealt by a new world is never served the old one.
    getNPCPool: (groupName) => {
      if (!groupName) return [];
      SpawnManager._poolSession = SpawnManager._poolSession || {};
      const stamp = ResidentRegistry.stamp(groupName);
      let memo = SpawnManager._poolSession[groupName];
      if (!memo || memo.stamp !== stamp) {
        const authored = SpawnManager.getAuthoredPool(groupName);
        const residents = Config.isProceduralGroup(groupName) ? [] : ResidentRegistry.templatesFor(groupName);
        memo = { stamp, pool: authored.concat(residents) };
        SpawnManager._poolSession[groupName] = memo;
      }
      return SpawnManager.keepLocalsHome(SpawnManager.keepVarlenianHome(memo.pool), groupName);
    },

    getPlaceholders: (includePlayers = false) => {
      const p2Active = window.$gameSplitScreen && window.$gameSplitScreen.active;
      const p2Name = p2Active ? window.$gameSplitScreen.p2EventName : null;
      // In a live session every player slot on the map belongs to the session,
      // whether or not somebody is standing in it this second: a remote player
      // walking in gets that event, so an NPC must never be spawned onto one.
      const netActive = !!window.NetworkManager?.instance?.isMultiplayer?.();

      return $gameMap.events()
        .filter(e => {
          const name = e?.event()?.name;
          if (!name) return false;
          if (p2Active && name === p2Name) return false;
          if ((!includePlayers || netActive) && Utils.isPlayerSlotName(name)) return false; // Ignore player events unless explicitly included, and always in a live session
          const note = e?.event()?.note || "";
          if (note.toLowerCase().includes("local")) return false; // Ignore local events from being placeholders!
          // A written character is a person, not a slot: never hand their event
          // out to be dealt somebody else's name and face, whatever it is named.
          if (Utils.hasStoryTag(note)) return false;
          // A slot whose self-switch A is ON is a recruited NPC hidden behind its
          // blank page, i.e. considered part of the player's party. Never reuse it
          // as a spawn placeholder: overwriting it would resurrect / duplicate the
          // party member (and strip the flag that keeps them hidden). See
          // NPCSystemParty.joinParty.
          if ($gameSelfSwitches?.value([$gameMap.mapId(), e.eventId(), 'A'])) return false;
          // A slot that rose is one of the dead standing where a person used to;
          // never hand it out as a roster placeholder, or transplantData would
          // paint a living NPC's face straight over the sheet it rose in.
          if (e._npcZombieSheet) return false;
          return name.startsWith("NPC") || name.startsWith("Placeholder") || (includePlayers && Utils.isPlayerSlotName(name)); // i18n-ignore: event-name prefixes
        })
        .map(ev => ({ event: ev, originalX: ev.x, originalY: ev.y }));
    },

    // Builds a spawn template for an NPC that exists only as a society profile.
    // Procedural citizens are never authored as map events (the settlement's
    // people are generated on map 636 and live on in $gameSystem._npcSociety),
    // so interiors of a procedural town have no template pool to draw from.
    // Pages/behaviour are cloned from a donor event so the spawned NPC is
    // talkable exactly like an authored one; the identity (name, sprite) comes
    // from the profile, keeping them the same person the player met outside.
    makeSocietyTemplate: (name, donor) => {
      const profile = $gameSystem._npcSociety?.[name];
      if (!profile || !donor?.pages?.length) return null;
      return {
        eventData: {
          id: donor.id,
          name,
          note: donor.note || "",
          characterName: profile.spriteKey || donor.characterName,
          characterIndex: profile.bustIndex ?? donor.characterIndex ?? 0,
          pages: JSON.parse(JSON.stringify(donor.pages)),
        }
      };
    },

    // The whole population of a town as spawn templates, for groups that have
    // no authored NPC pool (i.e. procedural settlements).
    buildSocietyPool: (groupName, donor) => {
      const society = $gameSystem._npcSociety || {};
      const pool = [];
      for (const [name, profile] of Object.entries(society)) {
        if (!profile || profile._homeGroupName !== groupName) continue;
        const tmpl = SpawnManager.makeSocietyTemplate(name, donor);
        if (tmpl) pool.push(tmpl);
      }
      return pool;
    },

    // ── Who may stand a counter at all ───────────────────────────────────────
    // Asked of the SHEET rather than of the class. A creature or an animal (the
    // Creatures/ and Animals/ halves of NPCs.json) keeps no till in an ordinary
    // world whatever class it happened to be dealt: a talking dog is still a
    // dog, and a shop minded by the stray on the corner reads as a bug rather
    // than as a joke. Two exceptions, and they are the whole of the rule:
    //
    //   `dogShop`   written on the entry itself, the shop dog that IS the
    //               shopkeeper. It stands in the rota like anybody else.
    //   monster     a monster world is made of exactly these and has nobody
    //               else to mind a till, so there every one of them may.
    //
    // A sheet nobody has an entry for is allowed: an authored NPC's own
    // graphic is not part of this wardrobe and is never what this is about.
    isShopEligibleSprite: (spriteKey) => {
      if (!spriteKey) return true;
      if (window.WorldManager?.isMonsterWorld?.()) return true;
      const entry = window.WorldGen?.NPCs?.[spriteKey];
      if (!entry) return true;
      if (entry.dogShop === true) return true;
      return entry.animal !== true && entry.creature !== true;
    },

    // ── Interior <Shop> staffing (ShopShiftManager, NPCSimulationCore.js) ─────
    // The town's own citizens that can stand a shop counter reached through a
    // door (a procedural settlement has no authored templates, so these come
    // straight from _npcSociety, the very people the player met outside). Each
    // entry is a ready-to-use ShopShiftManager persona keyed off the profile's
    // bound world sprite (spriteKey/bustIndex, see setupProceduralMapNPCs).
    getShopSocietyCandidates: (groupName) => {
      if (!groupName) return [];
      const society = $gameSystem?._npcSociety || {};
      const NC = window.NPCCreature;
      // A non-sentient creature (Feral, Mimic, Monster...) cannot stand a
      // counter and mind a till, only a monster world's population is made of
      // exactly that, so there it is the only kind of shopkeeper there is.
      const monsterWorld = !!window.WorldManager?.isMonsterWorld?.();
      const out = [];
      for (const [name, profile] of Object.entries(society)) {
        if (!profile || profile._homeGroupName !== groupName || !profile.spriteKey) continue;
        if (!SpawnManager.isShopEligibleSprite(profile.spriteKey)) continue;
        if (!monsterWorld && NC?.isNonSentientProfile?.(profile)) continue;
        out.push({ name, spriteName: profile.spriteKey, charIdx: profile.bustIndex ?? 0, local: true });
      }
      return out;
    },

    // Deterministically fabricates a shop-counter persona from a coordinate
    // seed, used to cover a shift when a town has no citizen free to man it.
    // Mirrors setupProceduralMapNPCs' own name+sprite rolls so a generated
    // shopkeeper looks and reads like any procedural citizen. Returns null only
    // when the character pool (NPCs.json) is unavailable.
    generateSeededPersona: (seed) => {
      const pool = buildNPCCharacterPool();
      const s = (seed >>> 0) || 1;
      // The people pool stands empty in a monster world (there are no people in
      // one), so the face is asked of the catalogue rather than of the pool,
      // which is what pickNPCCharacter does first anyway. A face that may not
      // mind a till is re-rolled a few times before the counter is given up on,
      // rather than left unstaffed on the first stray dog.
      let spriteName = null;
      for (let tries = 0; tries < 4 && !spriteName; tries++) {
        const draw = Utils.seededRandom(((s * 2654435761) ^ (tries * 40503)) >>> 0);
        const pick = pickNPCCharacter(draw, pool);
        if (pick && SpawnManager.isShopEligibleSprite(pick)) spriteName = pick;
      }
      if (!spriteName) return null;
      const isBig = spriteName.includes('!$');
      const charIdx = isBig ? 0 : Math.floor(Utils.seededRandom((s * 2) >>> 0) * 8);
      let name = T('NPCSystem.shopkeeperFallback');
      if (window.generateSeededMarkovName) {
        const dbId = Config.NAME_DATABASES[Math.floor(Utils.seededRandom((s ^ 0x5bd1e995) >>> 0) * Config.NAME_DATABASES.length)];
        try {
          const gen = window.generateSeededMarkovName(s & 0xffff, (s >>> 16) & 0xffff, (s & 0x7fff) || 1, dbId, 2, 4, 12);
          if (gen && gen !== "Unknown") name = gen; // i18n-ignore: Markov generator sentinel
        } catch (e) {}
      }
      return { name, spriteName, charIdx, local: false };
    },

    transplantData: (targetEvent, npcData, index) => {
      const originalData = targetEvent.event();
      // A written character is never handed over to this: getPlaceholders keeps
      // <Story> events out of the slot pool, which is where every caller draws
      // its targets from. Guarding again here would be worse than useless,
      // every caller erases the event when this returns false.
      originalData.pages = JSON.parse(JSON.stringify(npcData.pages));
      originalData.name = npcData.name || `NPC${index + 1}`;

      // Template events that ship with the bare placeholder name "NPC" get a
      // proper seeded Markov name instead, anchored to a fixed name-generation
      // seed (and the source event's stable id) so the same template always
      // resolves to the same person, no matter where/when it gets spawned, and
      // independent of the world's history seed.
      if (originalData.name === "NPC" && window.generateSeededMarkovName) {
        const worldSeed = Config.NPC_NAME_SEED;
        // npcData is the raw map event (its id lives on `.id`), not the pool
        // wrapper (`.eventId`), so read `.id` first. Falling straight through to
        // `index` tied a template's generated name to its spawn-slot position,
        // so the same "NPC" template resolved to a different person on every
        // spawn, breaking the stable "same template = same person" guarantee.
        const sourceId  = npcData.id ?? npcData.eventId ?? index;
        const dbSeed    = worldSeed ^ (sourceId * 83492791);
        const dbId      = Config.NAME_DATABASES[Math.floor(Utils.seededRandom(dbSeed) * Config.NAME_DATABASES.length)];
        try {
          const generated = window.generateSeededMarkovName(worldSeed & 0xffff, (worldSeed >>> 16) & 0xffff, sourceId, dbId, 2, 4, 12);
          if (generated && generated !== "Unknown") originalData.name = generated; // i18n-ignore: Markov generator sentinel
        } catch (e) {}
      }

      originalData.note = npcData.note;
      // <Hidden> NPCs stay part of the simulation (society, schedule, dialogue)
      // but never get a visible sprite: blank the top-level graphic and every
      // page's image instead of transplanting npcData's assigned sprite.
      const isHidden = Utils.hasHiddenTag(npcData.note);
      originalData.characterName = isHidden ? "" : npcData.characterName;
      originalData.characterIndex = isHidden ? 0 : npcData.characterIndex;
      if (isHidden) {
        for (const page of originalData.pages) {
          if (page?.image) { page.image.characterName = ""; page.image.characterIndex = 0; }
        }
      }

      for (const page of originalData.pages) {
        if (page.conditions) {
          Object.assign(page.conditions, { switch1Valid: false, switch2Valid: false, variableValid: false, actorValid: false, itemValid: false });
        }
        page.priorityType = 1;
        page.through = false;
        // Substantive (non-empty) pages must be action-button triggered so the
        // spawned NPC stays talkable; blank trailing pages keep their trigger so
        // they do not auto-run (#8).
        if ((page?.list?.length ?? 0) > 1) page.trigger = 0;
      }

      if (!isHidden) {
        const refImg = originalData.pages.map(p => p?.image).find(img => img?.characterName);
        if (refImg) {
          for (const page of originalData.pages) {
            // Only stamp the shared sprite onto substantive (interactable) pages.
            // The trailing blank, self-switch-gated "hide on recruit" page (an
            // empty command list, length <= 1) must stay graphic-less: copying a
            // sprite onto it turns a recruited/stale-flagged NPC into a visible
            // but untalkable ghost that the controller keeps walking around the
            // map, instead of the NPC simply disappearing as intended.
            if ((page?.list?.length ?? 0) <= 1) continue;
            if (page?.image && !page.image.characterName) {
              page.image.characterName = refImg.characterName;
              page.image.characterIndex = refImg.characterIndex;
            }
          }
        }
      }

      // Placeholder slots get fresh NPC data transplanted onto the same physical
      // event id across spawn cycles. If a previous occupant ever flipped a
      // self-switch (e.g. NPCSystemParty.joinParty sets ch 'A' on recruit), that
      // state is keyed to [mapId, eventId] and lingers, so the next, unrelated
      // NPC can boot straight into an "already met you" blank page and appear
      // completely uninteractable. Always start the slot with a clean slate.
      const selfSwitchMapId = $gameMap.mapId();
      const selfSwitchEventId = targetEvent.eventId();
      for (const ch of ['A', 'B', 'C', 'D']) {
        $gameSelfSwitches.setValue([selfSwitchMapId, selfSwitchEventId, ch], false);
      }
      // A person the world has lost stays lost. If the spawner has just dealt
      // this slot somebody who walked off with a party or was killed where they
      // stood, put them straight back behind their blank page instead of
      // walking them around the town again.
      if (GoneRegistry.isNameGone(originalData.name)) {
        $gameSelfSwitches.setValue([selfSwitchMapId, selfSwitchEventId, 'A'], true);
      }

      targetEvent._npcLyingDown = false;
      targetEvent.refresh();
      targetEvent.setupPage();
      SpawnManager.snapshotSpawn(targetEvent);
      return !!targetEvent.page();
    },

    // Everything transplantData just wrote lives in $dataMap, and $dataMap is
    // volatile: Scene_Map.create re-reads the map file from disk on EVERY
    // rebuild of the scene, not just on a transfer, so closing the menu (or the
    // Empathize panel, or loading a save) throws the whole transplant away and
    // hands the event back its authored placeholder data. The Game_Event object
    // survives, keeping the NPC's sprite and position, so the slot reads as a
    // normal citizen while event() reports a blank "PlayerNN" placeholder with
    // no commands: a visible NPC that cannot be talked to, named after the slot
    // it is standing in. Snapshot the transplanted identity onto the event
    // itself (it is part of the save) so restoreSpawnedEventData can put it
    // back the moment the fresh $dataMap lands.
    // `opts.minted` marks an event that has no slot in the map file at all
    // (a procedural household member, see ProceduralManager.populateProcInterior):
    // the reload leaves nothing at its id, so the restore has to put the whole
    // entry back rather than stamp an existing one.
    snapshotSpawn: (targetEvent, opts) => {
      if (!targetEvent || !$gameMap) return;
      const data = targetEvent.event();
      if (!data?.pages) return;
      targetEvent._npcSpawnData = {
        mapId: $gameMap.mapId(),
        minted: !!(opts && opts.minted),
        name: data.name,
        note: data.note,
        characterName: data.characterName,
        characterIndex: data.characterIndex,
        pages: JSON.parse(JSON.stringify(data.pages))
      };
    },

    injectBrain: (targetEvent, originalData) => {
      targetEvent._npcLyingDown = false;
      // Mark this as a roster spawn (a pool NPC dropped onto a placeholder) so
      // the hourly turnover (refreshCurrentMapForHour) only ever relocates or
      // erases these, never pre-placed <AI>/<Local> map-design events.
      targetEvent._npcRosterSpawn = true;
      if (!Utils.hasAITag(originalData.note)) {
        targetEvent.setOpacity(255);
        targetEvent.setThrough(false);
        return;
      }

      const controller = new NPCController(originalData.name);
      // Once per spawn, and a street spawns dozens in a frame: only with the
      // debug switch on (Utils.debug), never straight to the console.
      Utils.debug(`NPC spawned: "${originalData.name}" at (${targetEvent.x}, ${targetEvent.y}) on map ${$gameMap.mapId()}`);
      targetEvent._moveType = 0;
      targetEvent.setMoveSpeed(controller.moveSpeed);
      targetEvent.setMoveFrequency(5);
      targetEvent.setOpacity(255);
      targetEvent.setThrough(false);

      // Some of the crowd is found sitting down: dealt onto a free seat, where
      // decideNextGoal sits them.
      if (!SpawnManager._dealingWalker && Math.random() < NPCSeats.SPAWN_CHANCE) {
        const seat = Utils.randomElement(NPCSeats.freeSeats(targetEvent.x, targetEvent.y, targetEvent));
        if (seat) targetEvent.locate(seat.x, seat.y);
      }

      $gameSystem.npcControllers = $gameSystem.npcControllers || [];
      $gameSystem.npcControllers.push(controller);
      controller.decideNextGoal();
    },

    // Populates a generated interior (house, inn, shop, walk-up
    // floor, skyscraper floor) with NPCs drawn from the surrounding town.
    //
    // opts.building - the ProceduralHouseSystem descriptor of the building the
    //   player walked into. Its residents (assigned by NPCSim.ensureBuildingResidents)
    //   are the ones found at home here at night.
    // opts.isPublic - the interior belongs to a skyscraper: nobody lives here,
    //   so it draws a busy, fully random crowd from the whole town at any hour
    //   instead of a resident household.
    // Who is inside a building is decided by the building and the in-game
    // hour, never by Math.random: walking out and straight back in shows the
    // same people, and the crowd only turns over with the hourly simulation
    // tick. The building's own seed comes from its parent map and door tile
    // (ProceduralHouseSystem.createSeed), so two doors never share a crowd.
    interiorVisitRng: (building, mapId, hourIndex) => {
      if (hourIndex == null) hourIndex = Math.floor((Number($gameVariables?.value(114)) || 0) / 60);
      const base = building?.seed != null ? (building.seed >>> 0) : (Utils.nameHash(`interior_${mapId}`) >>> 0);
      const floor = building?.floorIndex || 0;
      const seed = (base ^ Math.imul(floor + 1, 0x85ebca6b) ^ Math.imul(hourIndex + 1, 0x9e3779b1)) >>> 0;
      return new window.NPCShared.Rng(seed);
    },

    replacePlayerEventsWithNPCs: (groupName, opts = {}) => {
      const { building = null, isPublic = false } = opts || {};
      const currentMapId = $gameMap.mapId();
      if (!groupName || !$gameMap?.events || MapManager.isTreasureRoom(currentMapId)) return;

      let npcPool = SpawnManager.getNPCPool(groupName);
      let allPlaceholders = SpawnManager.getPlaceholders();
      // Fallback to Player events as placeholders when no NPC/Placeholder events exist
      if (!allPlaceholders.length) {
        allPlaceholders = SpawnManager.getPlaceholders(true);
      }
      if (!allPlaceholders.length) return;

      // A procedural settlement has no authored templates, so fall back to its
      // society roster (using a placeholder's own pages as the donor). This is
      // what lets a house entered from a procedural town actually show the
      // townspeople who live there, and a procedural skyscraper show a crowd.
      if (!npcPool.length) {
        npcPool = SpawnManager.buildSocietyPool(groupName, allPlaceholders[0].event.event());
      }
      if (!npcPool.length) return;

      let selectedNPCs = [];
      let actualCount = 0;
      const rng = SpawnManager.interiorVisitRng(building, currentMapId);
      // A building entered through a door: whoever lives here is dealt onto the
      // placeholders, everybody else comes and goes on their own visit times
      // (InteriorVisits) instead of standing in for the hour.
      const visiting = !!building;
      let visitMax = 0;
      let visitors = [];

      {
        let densityFactor = 120;
        let baseLimit = MapManager.getNPCSpawnLimit();
        const _note = $dataMap.note || "";
        const isExterior = _note.includes("<Exterior>");
        const isInterior = _note.includes("<Interior>");

        if (isExterior) {
          densityFactor = 60;
          baseLimit = 15;
        } else if (isInterior) {
          densityFactor = 120;
          baseLimit = 4;
        }
        // Skyscraper public/lobby floors
        if (isPublic) {
          densityFactor = 80;
          baseLimit = 6;
        }

        const maxNPCs = Math.min(Math.floor(($gameMap.width() * $gameMap.height()) / densityFactor), baseLimit);
        visitMax = Math.max(1, maxNPCs);

        if (maxNPCs > 0) {
          const minNPCs = Math.max(1, Math.floor(maxNPCs * 0.5));
          actualCount = Math.min(minNPCs + Math.floor(rng.next() * (maxNPCs + 1 - minNPCs)), allPlaceholders.length, npcPool.length);
        } else {
          actualCount = Math.min(1, allPlaceholders.length, npcPool.length);
        }

        const drawRandom = (count, exclude = []) => {
          const poolCopy = npcPool.filter(t => !exclude.includes(t));
          for (let i = 0; i < count && poolCopy.length; i++) {
            selectedNPCs.push(poolCopy.splice(Math.floor(rng.next() * poolCopy.length), 1)[0]);
          }
        };

        const curHour = $gameVariables?.value(23) ?? 12;
        // Residents assigned to this exact building and floor
        const residents = building
          ? (window.NPCSim?.getBuildingResidents?.(building, building.floorIndex ?? 0, groupName) || [])
          : [];

        const atHomeResidents = residents.filter(name => {
          return window.NPCSim?.isNPCAtHome ? window.NPCSim.isNPCAtHome(name, null, curHour) : MapManager.isNightTime();
        });

        const residentTemplates = atHomeResidents
          .map(name => npcPool.find(t => (t.eventData?.name || '') === name))
          .filter(Boolean);

        if (visiting) {
          // Every resident is kept out of the visitors, at home this hour or
          // not, so the visitor list stays the same whenever it is asked.
          const residentNames = new Set(residents);
          visitors = npcPool.filter(t => !residentNames.has(t.eventData?.name || ''));
          selectedNPCs = [...residentTemplates];
          actualCount = Math.min(selectedNPCs.length, allPlaceholders.length);
        } else if (residentTemplates.length) {
          selectedNPCs = [...residentTemplates];
          // Fill remaining slots with random visitors/guests/pets if space allows
          drawRandom(Math.max(0, actualCount - residentTemplates.length), residentTemplates);
          actualCount = Math.min(selectedNPCs.length, allPlaceholders.length);
        } else {
          drawRandom(actualCount);
        }
      }

      const validTiles = MapManager.getSpreadSpawnTiles();
      const shuffledPlaceholders = window.NPCShared.seededShuffle(allPlaceholders, rng);
      const activePlaceholders = shuffledPlaceholders.slice(0, actualCount);
      const unusedPlaceholders = shuffledPlaceholders.slice(actualCount);

      let tileIdx = 0;
      for (let i = 0; i < activePlaceholders.length; i++) {
        const { event: targetEvent } = activePlaceholders[i];
        const npcDataItem = selectedNPCs[i];

        if (!targetEvent || !npcDataItem?.eventData) { targetEvent?.erase(); continue; }

        if (!SpawnManager.transplantData(targetEvent, npcDataItem.eventData, i)) {
          targetEvent.erase();
          continue;
        }

        if (tileIdx < validTiles.length) {
          targetEvent.locate(validTiles[tileIdx].x, validTiles[tileIdx].y);
          tileIdx++;
        } else {
          targetEvent.erase();
          continue;
        }

        SpawnManager.injectBrain(targetEvent, targetEvent.event());
      }

      const mapName = MapManager.getMapName(currentMapId);
      console.log(`[NPC System] ${activePlaceholders.length} NPCs spawned via replacePlayerEventsWithNPCs on map ${currentMapId} (${mapName})`);

      unusedPlaceholders.forEach(u => u.event.erase());

      if (visiting) {
        InteriorVisits.begin({
          building,
          candidates: visitors,
          nameOf: (t) => t.eventData?.name || '',
          spawn: (t, tile) => {
            const ev = mintEvent(t.eventData, tile);
            if (ev) SpawnManager.injectBrain(ev, ev.event());
            return ev;
          },
          maxVisitsAt: () => visitMax,
        });
      }
    },

// The hour's answer for a whole town is one schedule resolution per resident,
    // often hundreds, and done in one go on the hour it was the hourly hitch. So
    // it is built as a job: step(deadline) works through the residents until the
    // deadline and picks up where it left off on the next call, and nothing is
    // written to $gameSystem until the last resident has been placed. The answer
    // is a pure function of (name, group, hour), so slicing it changes nothing.
    beginGroupAssignment: (groupName, activeMapId = null) => {
      const group = GroupRegistry.get(groupName);
      if (!group) return null;

      // A world made before the residents existed deals its towns the first
      // time the party walks into them.
      ResidentRegistry.ensureGroup(groupName);
      const npcPool = SpawnManager.getNPCPool(groupName);
      if (!npcPool.length) return null;

      const allMaps = group.maps;
      const hour = $gameVariables?.value(23) ?? 12;

      // Make sure the group's job-shift roster exists first, so working NPCs
      // resolve to their assigned work map (kept from the original system).
      window.NPCSim?.JobShiftManager?.ensureGroupAssignments?.(groupName);

      const mapAssignments = {};
      for (const mId of allMaps) mapAssignments[mId] = [];

      // Place every distinct NPC in the pool on the map their *schedule* puts
      // them on this hour, deterministic, never random. NPCSim.scheduledMapForNPC
      // routes work→work map, shop shift→shop map, shopping→a shop map, social→
      // a main/hub map, and everything else (rest/meals/leisure/errands)→home.
      // Computed once per hour and cached in _npcGroupAssignments, so walking
      // between the group's maps within the same hour never reshuffles anyone.
      const resolver = window.NPCSim?.scheduledMapForNPC;
      const assignedNames = new Set();
      let cursor = 0;

      const placeOne = (npc) => {
        const name = npc.eventData?.name;
        if (!name || name === "NPC" || assignedNames.has(name)) return;
        // Only the town's residents are dealt round its maps. An authored
        // person stands on the map they were written on (their own event is
        // there), and a <Local> is met elsewhere only as a visitor.
        if (!ResidentRegistry.isResident(name)) return;
        assignedNames.add(name);

        // Out of town. Somebody on a trip is on no map of the town they left:
        // the empty place they leave behind is the whole point of them having
        // gone (NPC/NPCLifeSimulator.js, resolveTravel).
        if (window.NPCLifeSim?.isAwayFromTown?.(name)) return;

        let mId = resolver ? resolver(name, groupName, hour) : null;
        if (!mId || !mapAssignments[mId]) {
          // Resolver unavailable / returned an out-of-group map, fall back to a
          // stable hash-picked group map so the NPC still appears consistently.
          mId = allMaps[Math.abs(Utils.nameHash(name)) % allMaps.length];
        }
        mapAssignments[mId].push({ name });
      };

      const commit = () => {
        // Last hour's answer, kept so an arrival can be brought in through the
        // door they would have walked from rather than dropped in the middle.
        const previous = {};
        for (const [mId, list] of Object.entries($gameSystem._npcGroupAssignments || {})) {
          for (const o of list || []) if (o?.name) previous[o.name] = Number(mId);
        }
        $gameSystem._npcPrevAssignment = previous;
        $gameSystem._npcGroupAssignments = {};

        let totalPlaced = 0;
        for (const mId of allMaps) {
          $gameSystem._npcGroupAssignments[mId] = mapAssignments[mId];
          totalPlaced += mapAssignments[mId].length;
        }

        $gameSystem._currentNpcGroup = groupName;
        $gameSystem._npcAssignmentHour = hour;
        Utils.debug(`Group ${groupName} schedule-assigned: ${totalPlaced} NPCs across ${allMaps.length} maps at hour ${hour} (active: ${activeMapId}).`);
      };

      return {
        // True once every resident is placed and the answer is written. Always
        // places at least one resident a call, so the job cannot stall.
        step(deadline = Infinity) {
          if (cursor >= npcPool.length) return true;
          do {
            placeOne(npcPool[cursor++]);
          } while (cursor < npcPool.length && performance.now() < deadline);
          if (cursor < npcPool.length) return false;
          commit();
          return true;
        },
      };
    },

    initializeGroupNPCs: (groupName, activeMapId = null) => {
      const job = SpawnManager.beginGroupAssignment(groupName, activeMapId);
      if (job) job.step();
    },

    // Live, in-place turnover of the *current* map's NPCs when an in-game hour
    // passes (see Game_Map.update). _npcGroupAssignments has already been
    // recomputed for the new hour. NPCs no longer scheduled here "leave"
    // (their event is freed); NPCs newly scheduled here move in by reusing a
    // freed event; everyone who stays gets a fresh spot and re-picks a goal,
    // so the population visibly shifts without a jarring full map reload.
    // Everybody staying on the map re-picks a goal on the hour, and one
    // decideNextGoal can run several path searches. Done for the whole street
    // in the turnover's own frame it was the hourly hitch, so they are queued
    // here and drained DECIDES_PER_FRAME a frame (NPCSystem_Hooks), the same
    // spread NPCSim gives its own dispatch.
    DECIDES_PER_FRAME: 2,
    _pendingDecides: [],
    _pendingDecidesMapId: 0,
    queueDecide(ctrl) {
      const mapId = $gameMap ? $gameMap.mapId() : 0;
      if (this._pendingDecidesMapId !== mapId) {
        this._pendingDecides = [];
        this._pendingDecidesMapId = mapId;
      }
      if (!this._pendingDecides.includes(ctrl)) this._pendingDecides.push(ctrl);
    },
    drainDecides() {
      const queue = this._pendingDecides;
      if (!queue.length) return;
      if (!$gameMap || this._pendingDecidesMapId !== $gameMap.mapId()) { queue.length = 0; return; }
      const live = $gameSystem.npcControllers || [];
      for (let n = 0; n < this.DECIDES_PER_FRAME && queue.length; n++) {
        const ctrl = queue.shift();
        if (!ctrl?.event || ctrl.event._erased || !live.includes(ctrl)) continue;
        ctrl.decideNextGoal();
      }
    },

    refreshCurrentMapForHour: (groupName) => {
      if (!$gameMap || !$gameSystem._npcGroupAssignments) return;
      const group = GroupRegistry.get(groupName);
      if (!group) return;
      const mapId = $gameMap.mapId();

      const npcPool = SpawnManager.getNPCPool(groupName);
      const npcByName = new Map(npcPool.map(n => [n.eventData.name, n]));

      // Only roster spawns turn over; pre-placed <AI>/<Local> events are left be.
      // A visiting party member is neither: they are a particular person who
      // was left standing here by another playthrough, and their name is not in
      // this town's roster, so the turnover would hand their slot to a local
      // and they would vanish on the hour (NPCSystem VisitingParties). A
      // <Story> character is excluded for the same reason from the other side:
      // they are found on their own map at every hour of the day.
      const controllers = ($gameSystem.npcControllers || []).filter(c => c?.event && !c.event._erased);
      const managed = controllers.filter(
        c => c.event._npcRosterSpawn && !c.isLocal && !c.isStory &&
             !c.event[VisitingParties.EVENT_TAG]);

      // The display roster includes main-map visitor borrow, sized to however
      // many roster events we have to fill, so hubs stay busy across the hour
      // boundary instead of emptying out.
      const roster = SpawnManager.resolveDisplayRoster(mapId, group, groupName);
      const wantNames = new Set(roster.map(o => o.name));

      const spawnTiles = MapManager.getSpreadSpawnTiles();
      let tileIdx = 0;
      const nextTile = () => (tileIdx < spawnTiles.length ? spawnTiles[tileIdx++] : null);

      const stayingNames = new Set();
      const freedEvents = [];
      // Only while somebody is here to watch, and only on a map whose town has
      // a street plan the graph can read.
      const watched = SceneManager._scene instanceof Scene_Map &&
        !SpawnManager.ungraphedGroup(groupName);
      let walkingOut = SpawnManager.commutingOut().length;

      for (const ctrl of managed) {
        if (wantNames.has(ctrl.eventName)) {
          stayingNames.add(ctrl.eventName);
          // Somebody who is staying STAYS. Relocating them every hour made the
          // whole street jump on the hour for no reason anybody could see.
          if (!SpawnManager.stillStanding(ctrl.event)) {
            const t = nextTile();
            if (t) ctrl.event.locate(t.x, t.y);
          }
          SpawnManager.queueDecide(ctrl);
        } else if (watched && walkingOut < SpawnManager.COMMUTE_MAX &&
                   SpawnManager.walkOut(
                     ctrl,
                     SpawnManager.doorToward(SpawnManager.assignedMapOf(ctrl.eventName), group))) {
          // On their way out on foot. Their event is theirs until they reach
          // the door, so it is not offered to anybody arriving this hour.
          walkingOut++;
        } else {
          freedEvents.push(ctrl.event);
        }
      }

      // Drop controllers whose NPC is leaving this map.
      if (freedEvents.length) {
        const leaving = new Set(freedEvents);
        $gameSystem.npcControllers = ($gameSystem.npcControllers || [])
          .filter(c => !(c?.event && leaving.has(c.event)));
      }

      // Bring in NPCs newly on the roster here, reusing the just-freed events
      // and minting fresh ones once those run out.
      const incoming = roster.filter(o => !stayingNames.has(o.name));
      let idx = 0;
      for (const obj of incoming) {
        const data = SpawnManager.rosterTemplate(obj, npcByName);
        if (!data) continue;
        // In through the door from wherever they spent the last hour, when
        // that is a real door on this map, otherwise their usual spot.
        const cameFrom = $gameSystem._npcPrevAssignment?.[obj.name];
        const door = watched && cameFrom && cameFrom !== mapId
          ? SpawnManager.doorToward(cameFrom, group) : null;
        const t = door ? { x: door.x, y: door.y } : SpawnManager.rosterSpot(obj, groupName, mapId, spawnTiles);
        if (!t) break;
        let ev = null;
        if (idx < freedEvents.length) {
          ev = freedEvents[idx++];
          if (!SpawnManager.transplantData(ev, data, idx)) { ev.erase(); continue; }
          ev.locate(t.x, t.y);
        } else {
          ev = mintEvent(data, t);
          if (!ev) continue;
        }
        if (obj.visiting) ev._npcLocalVisitor = true;
        SpawnManager.injectBrain(ev, ev.event());
      }
      // Any events still free (more left than arrived) get erased.
      for (; idx < freedEvents.length; idx++) freedEvents[idx].erase();
    },

    // Snapshots every active NPC's last position + activity before the map
    // they're standing on gets torn down, keyed by [groupName][npcName].
    // This is what lets the same NPC be "still there" (or "still doing that")
    // when the player wanders off and comes back within the same map group.
    captureNPCGroupMemory: (prevMapId, prevGroupName) => {
      if (!prevMapId || !prevGroupName) return;
      if (!GroupRegistry.get(prevGroupName)) return;

      const controllers = ($gameSystem.npcControllers || []).filter(c => c?.event && !c.event._erased);
      if (!controllers.length) return;

      $gameSystem._npcGroupMemory = $gameSystem._npcGroupMemory || {};
      const groupMem = $gameSystem._npcGroupMemory[prevGroupName] = $gameSystem._npcGroupMemory[prevGroupName] || {};

      for (const ctrl of controllers) {
        const profile = $gameSystem._npcSociety?.[ctrl.eventName];
        groupMem[ctrl.eventName] = {
          mapId: prevMapId,
          x: ctrl.event.x,
          y: ctrl.event.y,
          state: ctrl.state,
          currentNeed: profile?.currentNeed ?? null,
          savedMinute: $gameVariables?.value(114) ?? 0,
        };
      }
    },

    // Returns the remembered (x, y) for an NPC on this exact map, provided the
    // tile is still passable and unoccupied, otherwise null so the caller
    // falls back to a normal spawn-tile pick.
    recallNPCSpot: (groupName, npcName, mapId) => {
      const mem = $gameSystem._npcGroupMemory?.[groupName]?.[npcName];
      if (!mem || mem.mapId !== mapId) return null;
      if (!$gameMap.isValid(mem.x, mem.y)) return null;
      if (!ORTHO_DIRS.some(dir => $gameMap.isPassable(mem.x, mem.y, dir))) return null;
      // A spot remembered from an older save may sit on terrain NPCs are no
      // longer allowed to occupy, so re-check it rather than trusting memory.
      if (Utils.isBlockedTerrain(mem.x, mem.y)) return null;
      if ($gameMap.eventsXy(mem.x, mem.y).length > 0) return null;
      return { x: mem.x, y: mem.y };
    },

    // ── the commute ─────────────────────────────────────────────────────────
    //
    // Which map an NPC spends an hour on is already decided by their own
    // routine: initializeGroupNPCs asks NPCSim.scheduledMapForNPC and writes
    // the answer into _npcGroupAssignments. What was missing is the bit in
    // between. On the hour everybody simply teleported: the ones staying were
    // relocated to a fresh spawn tile, the ones leaving blinked out, and the
    // ones arriving blinked in somewhere random.
    //
    // So the decision is left exactly where it was and only its PRESENTATION
    // changes, and only while somebody is here to see it:
    //
    //   staying   stay where they are and keep walking
    //   leaving   walk to the door that leads their way, and go through it
    //   arriving  come IN through that door rather than appear in the middle
    //
    // None of it may hold anything up. A walk is capped, it times out, and
    // when it is not wanted the old teleport is still exactly what happens.
    // Shop counter personas are not roster spawns at all, so a shift change
    // never waits on any of this.
    COMMUTE_MAX: 4,        // at most this many walking out of a map at once
    COMMUTE_TIMEOUT: 6000, // ms before a walk is given up on and just resolved

    // The door on THIS map that leads the way to another one: the next hop
    // toward it on the town's own graph, then the event whose transfer names
    // that map. The map is loaded (that is the only time this is asked), so
    // the doors can be read straight off it.
    doorToward: (targetMapId, group) => {
      const MC = window.MapConnections;
      if (!MC || !$gameMap || !targetMapId) return null;
      const here = $gameMap.mapId();
      if (here === targetMapId) return null;
      let hop = targetMapId;
      if (typeof MC.nextHop === "function" && Array.isArray(group?.maps)) {
        hop = MC.nextHop(here, targetMapId, {
          within: group.maps, avoid: SpawnManager.VISITOR_AVOID,
        }) || 0;
      }
      if (!hop) return null;
      for (const ev of $gameMap.events()) {
        if (!ev || ev._erased) continue;
        let to = 0;
        try { to = MC.exitTarget(ev); } catch (e) { to = 0; }
        if (to === hop) return ev;
      }
      return null;
    },

    // Send somebody out through it. Returns true when the walk was started, so
    // the caller knows to leave their event alone for now.
    walkOut: (ctrl, door, timeout = SpawnManager.COMMUTE_TIMEOUT) => {
      if (!ctrl?.event || !door) return false;
      try {
        ctrl.goToTile(door.x, door.y, "commuting", timeout);  // i18n-ignore: goal id
      } catch (e) {
        return false;
      }
      ctrl.event._npcCommute = { x: door.x, y: door.y, until: performance.now() + timeout };
      return true;
    },

    // Driven from the ordinary per-frame controller pass. Somebody who has
    // reached their door has left the map; somebody still short of it when the
    // clock runs out has left too, they simply were not watched all the way.
    updateCommutes: () => {
      const list = $gameSystem?.npcControllers;
      if (!list || !list.length) return;
      const now = performance.now();
      for (const ctrl of list) {
        const ev = ctrl?.event;
        // A next shopkeeper still short of the till when the clock runs out
        // takes it all the same (InteriorVisits.finishShopTakeover).
        if (ev && !ev._erased && ev._npcShopTakeover && now >= ev._npcShopTakeover.until) {
          InteriorVisits.finishShopTakeover(ev);
          continue;
        }
        const walk = ev && ev._npcCommute;
        if (!walk || ev._erased) continue;
        const there = Math.abs(ev.x - walk.x) + Math.abs(ev.y - walk.y) <= 1;
        if (!there && now < walk.until) continue;
        ev._npcCommute = null;
        ev.erase();
      }
    },

    // Which map this hour's roster puts somebody on. Read back off the table
    // initializeGroupNPCs has just written, so the walk and the assignment can
    // never disagree about where anybody is going.
    assignedMapOf: (name) => {
      const table = $gameSystem?._npcGroupAssignments;
      if (!table || !name) return 0;
      for (const mId of Object.keys(table)) {
        for (const o of table[mId] || []) if (o?.name === name) return Number(mId);
      }
      return 0;
    },

    // Is somebody still on a tile they could plausibly be standing on? The
    // hourly pass used to move everybody whether they needed it or not, which
    // made a whole street jump on the hour.
    stillStanding: (ev) => {
      if (!ev || !$gameMap) return false;
      if (!$gameMap.isValid(ev.x, ev.y)) return false;
      try { if ($gameMap.isPassable(ev.x, ev.y, 2)) return true; } catch (e) { return true; }
      // Somebody sitting on a seat is on a fair tile too, however solid it is.
      return NPCSeats.isSeat(ev.x, ev.y);
    },

    // Anyone currently on their way out, so the turnover does not hand their
    // event to somebody else while they are still standing in the street.
    commutingOut: () => {
      return ($gameSystem?.npcControllers || []).filter(
        (c) => c?.event && !c.event._erased && c.event._npcCommute);
    },

    // ── who is in town today ────────────────────────────────────────────────
    //
    // A hub used to top itself up by shuffling every other map in the group
    // together, so the face in a square was as likely to live on the far side
    // of the city as next door, and all four of Ghent's squares drew the same
    // uniform crowd. A square should look like the streets around it.
    //
    // The weight is one over the number of doors between the two maps, worked
    // out on the town's OWN graph: the route may not leave the group and may
    // not cross the world map, because a hop onto the world map is a hop to
    // another country and would make every district look adjacent.
    //
    // Everything about this is display only. It never touches
    // _npcGroupAssignments, and where the graph has nothing to say it hands
    // back to the plain shuffle rather than emptying the square.
    VISITOR_AVOID: [315],

    // The groups the map graph has nothing useful to say about, named ONCE so
    // every part of the walking simulation asks the same question.
    //
    //   - The Omega Tower is a stack of a hundred floors reached by
    //     variable-driven transfers, which tools/build/gen_map_connections.js
    //     cannot see and deliberately drops. Its real shape is the stair list
    //     in $gameSystem._stairLocations (Map/DungeonFloorSystem.js), a linear
    //     stack where "the next floor" is arithmetic, not a search. Nothing
    //     here should pretend otherwise.
    //   - A procedural settlement is one square invented when the party walked
    //     onto it. It has no street plan to be near anything on, and its
    //     people stay in it.
    UNGRAPHED_GROUPS: ["OmegaTower", "PublicTransport"],  // i18n-ignore: map group keys

    ungraphedGroup: (groupName) => {
      if (!groupName) return true;
      if (Config.isProceduralGroup?.(groupName)) return true;
      return SpawnManager.UNGRAPHED_GROUPS.includes(groupName);
    },

    visitorWeights: (visitors, mapId, group) => {
      const MC = window.MapConnections;
      if (!MC || typeof MC.distance !== "function") return null;
      const within = group?.maps;
      if (!Array.isArray(within) || !within.length) return null;
      const opts = { within, avoid: SpawnManager.VISITOR_AVOID };
      // One sweep per source map, not one per resident: a street with eight
      // people on it is asked about once.
      const byMap = new Map();
      let any = false;
      const weights = visitors.map((v) => {
        if (!byMap.has(v.fromMapId)) {
          let d = Infinity;
          try { d = MC.distance(v.fromMapId, mapId, opts); } catch (e) { d = Infinity; }
          byMap.set(v.fromMapId, d);
        }
        const d = byMap.get(v.fromMapId);
        if (!isFinite(d)) return 0;
        any = true;
        return 1 / (1 + d);
      });
      return any ? weights : null;
    },

    drawVisitors: (visitors, need, mapId, group, groupName, curHour) => {
      const plain = () => Utils.shuffle(visitors.slice(0, visitors.length)).slice(0, need).map(v => v.obj);
      // The tower is a stack of floors the graph cannot see, and a procedural
      // settlement is one square that was invented on arrival: neither has a
      // street plan to be near anything on.
      if (SpawnManager.ungraphedGroup(groupName)) return plain();
      const weights = SpawnManager.visitorWeights(visitors, mapId, group);
      if (!weights) {
        // Nobody is reachable on the town's own graph. That is a town whose
        // doors were never scanned, not a town with nobody in it.
        Utils.debug(`visitor draw for map ${mapId} has no graph distances, falling back to a shuffle`);
        return plain();
      }
      // Seeded on the place and the hour, because this is asked once on entry
      // and again at every hour boundary: a fresh roll each time would make
      // the square flicker between two different crowds.
      const seed = (Utils.nameHash(`visitors:${groupName}:${mapId}:${curHour}`) ^
        (window.NPCShared?.worldSeed?.() ?? 0)) >>> 0;
      const pool = visitors.slice();
      const w = weights.slice();
      const out = [];
      for (let pick = 0; pick < need && pool.length; pick++) {
        let total = 0;
        for (const x of w) total += x;
        if (total <= 0) break;
        let roll = Utils.seededRandom((seed + pick * 2654435761) >>> 0) * total;
        let idx = w.length - 1;
        for (let i = 0; i < w.length; i++) {
          roll -= w[i];
          if (roll <= 0) { idx = i; break; }
        }
        out.push(pool[idx].obj);
        pool.splice(idx, 1);
        w.splice(idx, 1);
      }
      return out;
    },

    // Who is shown on a map this hour: its scheduled roster
    // (_npcGroupAssignments[mapId], every resident whose home, or whose shift,
    // is here) minus anyone standing a <Shop> counter as its persona and
    // anyone indoors at home, plus the authored Locals met away from home this
    // hour (localVisitors). Shared by spawnAssignedNPCs (map entry) and
    // refreshCurrentMapForHour (hourly turnover) so both agree on who should
    // be on the map. Nobody is borrowed to fill a square any more: the town
    // has as many people as its doors and streets hold.
    resolveDisplayRoster: (mapId, group, groupName) => {
      const curHour = $gameVariables?.value(23) ?? 12;
      const reservedForShop = new Set($gameSystem._npcShopReservedNames?.[mapId] || []);
      const isAtHome = (name) => {
        return window.NPCSim?.isNPCAtHome ? window.NPCSim.isNPCAtHome(name, null, curHour) : false;
      };
      const assigned = ($gameSystem._npcGroupAssignments?.[mapId] || [])
        .filter(o => !reservedForShop.has(o.name) && !isAtHome(o.name) && !GoneRegistry.isNameGone(o.name));
      const here = new Set(assigned.map(o => o.name));
      const visitors = SpawnManager.localVisitors(mapId, group, groupName, curHour)
        .filter(o => !here.has(o.name))
        .map(o => ({ name: o.name, visiting: true, template: o.template }));
      for (const v of visitors) here.add(v.name);
      // And whoever has come to town on a trip (NPCLifeSim TRAVELLING).
      const arrivals = SpawnManager.arrivalVisitors(mapId, group, groupName)
        .filter(o => !here.has(o.name));
      const roster = assigned.concat(visitors, arrivals);
      const cap = SpawnManager.settlementCrowdCap(mapId, groupName);
      if (cap === null || roster.length <= cap) return roster;
      // Ranked on (name, map) alone, so the same people are the ones kept hour
      // after hour and the turnover does not reshuffle the street.
      const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
      const rank = (name) => Utils.seededRandom((Utils.nameHash(`crowd:${name}:${mapId}`) ^ ws) >>> 0); // i18n-ignore: seed key
      const kept = new Set(roster.slice().sort((a, b) => rank(a.name) - rank(b.name)).slice(0, cap));
      return roster.filter(o => kept.has(o));
    },

    // How many roster people the exterior of a hand-made city or village may
    // show, by the same rule as a procedural settlement square
    // (Config.settlementCrowdCount): the map's slots are its NPC/Placeholder/
    // PlayerNN events plus its <Local> people, and every Local is always on
    // the map, so each one spends a slot of that budget before the roster is
    // dealt. null for any other map, which keeps its whole roster.
    settlementCrowdCap: (mapId, groupName) => {
      if (!groupName || Config.isProceduralGroup(groupName)) return null;
      if (!String($dataMap?.note || "").includes("<Exterior>")) return null; // i18n-ignore: map notetag
      const biome = window.WorkSystem?.Destinations?.[groupName]?.biome;
      if (!Config.isSettlementBiome(biome)) return null;
      let slots = 0;
      for (const ev of ($dataMap.events || [])) {
        if (!ev?.name) continue;
        const note = ev.note || "";
        if (Utils.hasLocalTag(note)) { if (!Utils.hasHiddenTag(note)) slots++; continue; }
        if (Utils.hasStoryTag(note)) continue;
        if (ev.name.startsWith("NPC") || ev.name.startsWith("Placeholder") || Utils.isPlayerSlotName(ev.name)) slots++; // i18n-ignore: event-name prefixes
      }
      const locals = ($gameMap?.events?.() || []).filter(e => {
        if (!e || e._erased) return false;
        const note = e.event()?.note || "";
        return Utils.hasLocalTag(note) && !Utils.hasHiddenTag(note);
      }).length;
      const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
      const rng = Utils.seededRandom((Utils.nameHash(`crowdShare:${mapId}`) ^ ws) >>> 0); // i18n-ignore: seed key
      const gathering = !!window.NPCGatherings?.activeGathering?.(groupName);
      return Math.max(0, Config.settlementCrowdCount(slots, rng, gathering) - locals);
    },

    // Out-of-towners on a trip here, at most this many on one map at a time.
    ARRIVALS_MAX: 3,

    // The people NPCLifeSim.arrivalsIn says are in town, each on one main map
    // of it (seeded on their name, so the same visitor is not met on every
    // street at once), as visitor roster entries.
    arrivalVisitors: (mapId, group, groupName) => {
      if (!groupName || Config.isProceduralGroup(groupName) || Config.isEmptyWorld()) return [];
      const Life = window.NPCLifeSim;
      if (!Life?.arrivalsIn) return [];
      const main = (group?.mainMaps || []).length ? group.mainMaps : (group?.maps || []).slice(0, 1);
      if (!main.includes(mapId)) return [];
      const now = $gameVariables?.value(114) ?? 0;
      const inParty = new Set(($gameParty?.members?.() || []).map(a => a?.name?.()));
      const out = [];
      for (const name of Life.arrivalsIn(groupName, now) || []) {
        if (out.length >= SpawnManager.ARRIVALS_MAX) break;
        if (inParty.has(name) || GoneRegistry.isNameGone(name)) continue;
        if (main[(Utils.nameHash(`arrival:${name}`) >>> 0) % main.length] !== mapId) continue; // i18n-ignore: seed key
        const template = SpawnManager.arrivalTemplate(name);
        if (template) out.push({ name, visiting: true, template });
      }
      return out;
    },

    // A traveller as a passer-by: their authored face when the cast wrote
    // them (never a <Story> or <Hidden> one, who does not travel), else the
    // face their profile was minted with.
    arrivalTemplate: (name) => {
      const home = window.NPCLifeSim?.getRecord?.(name)?.homeGroup
        || $gameSystem?._npcSociety?.[name]?._homeGroupName || null;
      if (home && !Config.isProceduralGroup(home)) {
        const tpl = (SpawnManager.getAuthoredPool(home) || []).find(t => t?.eventData?.name === name);
        if (tpl) {
          const ev = tpl.eventData;
          if (Utils.hasStoryTag(ev.note) || Utils.hasHiddenTag(ev.note)) return null;
          return SpawnManager.visitorTemplate(ev);
        }
      }
      return ResidentRegistry.template(name);
    },

    // An authored <Local> is always found on their own map (their event is
    // there), and now and then ALSO met somewhere else: on another map of
    // their town, in another town, on a bus. Seeded on (name, map, hour), so a
    // square does not flicker between visitors, and never on their own map,
    // so they are never seen twice at once. The copy away from home is an
    // ordinary passer-by (the citizen template in their face), not their
    // counter or their scripted scene. Same-town visitors are drawn by how
    // near their home street is (drawVisitors); out-of-towners fill the rest.
    LOCAL_VISITORS_MAX: 2,
    localVisitors: (mapId, group, groupName, hour) => {
      if (Config.isEmptyWorld()) return [];
      const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
      const onMap = new Set(($gameMap?.events?.() || [])
        .filter(e => e && !e._erased && !e._npcRosterSpawn).map(e => e.event()?.name).filter(Boolean));
      const inParty = new Set(($gameParty?.members?.() || []).map(a => a?.name?.()));
      const seen = new Set();
      const near = [], far = [];
      for (const g of Object.keys(GroupRegistry.build() || {}).sort()) {
        if (Config.isProceduralGroup(g)) continue;
        for (const tpl of SpawnManager.getAuthoredPool(g)) {
          const ev = tpl?.eventData;
          const name = ev?.name;
          if (!name || name === "NPC" || seen.has(name)) continue; // i18n-ignore: placeholder event name
          if (!Utils.hasLocalTag(ev.note) || Utils.hasHiddenTag(ev.note) || Utils.hasStoryTag(ev.note)) continue;
          seen.add(name);
          if (tpl.mapId === mapId || onMap.has(name) || inParty.has(name) || GoneRegistry.isNameGone(name)) continue;
          const roll = Utils.seededRandom((Utils.nameHash(`localVisit:${name}:${mapId}:${hour}`) ^ ws) >>> 0); // i18n-ignore: seed key
          if (roll >= Config.LOCAL_VISIT_CHANCE) continue;
          const template = SpawnManager.visitorTemplate(ev);
          if (!template) continue;
          (g === groupName ? near : far).push({ obj: { name, template }, fromMapId: tpl.mapId });
        }
      }
      const max = SpawnManager.LOCAL_VISITORS_MAX;
      const drawn = (near.length && group)
        ? SpawnManager.drawVisitors(near, max, mapId, group, groupName, hour)
        : near.map(v => v.obj);
      const out = drawn.slice(0, max);
      for (const v of far) {
        if (out.length >= max) break;
        out.push(v.obj);
      }
      return out;
    },

    // An authored person as a passer-by: the citizen template of Map574 in
    // their own face and class, walking.
    visitorTemplate: (ev) => {
      const img = (ev?.pages || []).map(p => p?.image).find(im => im?.characterName);
      if (!img || isBetaSprite(img.characterName)) return null;
      const tpl = NPCPoolStore.template("citizen");
      if (!tpl) return null;
      const cls = String(ev.note || "").match(/NPC-(\d+)/);
      tpl.name = ev.name;
      tpl.note = cls ? `NPC-${cls[1]} AI` : "NPC AI"; // i18n-ignore: event notetags
      tpl.characterName = img.characterName;
      tpl.characterIndex = img.characterIndex || 0;
      for (const page of tpl.pages || []) {
        if (!page?.image || (page.list?.length ?? 0) <= 1) continue;
        page.image.characterName = img.characterName;
        page.image.characterIndex = img.characterIndex || 0;
      }
      return tpl;
    },

    // The spawn data for one roster entry: a visitor carries their own, a
    // resident is dressed off their profile, anybody else comes off the pool.
    rosterTemplate: (obj, npcByName) => {
      if (obj?.template) return obj.template;
      const pooled = npcByName?.get(obj?.name)?.eventData;
      if (pooled) return pooled;
      return ResidentRegistry.isResident(obj?.name) ? ResidentRegistry.template(obj.name) : null;
    },

    // Where a roster entry stands on arrival: where they were last seen here,
    // their own doorstep for a resident, else the next spread tile.
    rosterSpot: (obj, groupName, mapId, spawnTiles) => {
      const remembered = SpawnManager.recallNPCSpot(groupName, obj.name, mapId);
      if (remembered) return remembered;
      if (ResidentRegistry.isResident(obj.name)) return ResidentRegistry.spotFor(obj.name, mapId, spawnTiles);
      while (spawnTiles.length) {
        const t = spawnTiles.shift();
        if ($gameMap.eventsXy(t.x, t.y).length === 0 && !($gamePlayer && $gamePlayer.pos(t.x, t.y))) return t;
      }
      return null;
    },

    // Deals this hour's roster onto the map: the author's NPC/Placeholder
    // slots first (and the PlayerNN slots when there are none), then fresh
    // events for everyone left over. A town is as busy as its people, not as
    // busy as the number of slots somebody drew on its map.
    spawnAssignedNPCs: (mapId, group, groupName) => {
      let placeholders = SpawnManager.getPlaceholders();
      if (!placeholders.length) placeholders = SpawnManager.getPlaceholders(true);
      const assigned = SpawnManager.resolveDisplayRoster(mapId, group, groupName);
      if (!assigned.length) {
        placeholders.forEach(p => p.event.erase());
        return;
      }

      const npcByName = new Map(SpawnManager.getNPCPool(groupName).map(n => [n.eventData.name, n]));
      const spawnTiles = MapManager.getSpreadSpawnTiles();
      let slot = 0, made = 0;
      for (const obj of assigned) {
        const data = SpawnManager.rosterTemplate(obj, npcByName);
        if (!data) continue;
        const spot = SpawnManager.rosterSpot(obj, groupName, mapId, spawnTiles);
        if (!spot) break;
        let ev = null;
        if (slot < placeholders.length) {
          ev = placeholders[slot++].event;
          if (!SpawnManager.transplantData(ev, data, made)) { ev.erase(); continue; }
          ev.locate(spot.x, spot.y);
        } else {
          ev = mintEvent(data, spot);
          if (!ev) continue;
        }
        if (obj.visiting) ev._npcLocalVisitor = true;
        SpawnManager.injectBrain(ev, ev.event());
        made++;
      }
      placeholders.slice(slot).forEach(p => p.event.erase());
      Utils.debug(`spawnAssignedNPCs: ${made} NPCs spawned on map ${mapId}`);
      console.log(`[NPC System] ${made} NPCs spawned via spawnAssignedNPCs on map ${mapId} (${MapManager.getMapName(mapId)})`);
    },

randomizeOmegaTowerMap: (mapId, groupName) => {
      // A space crew's base (the low orbit ship's lower deck) holds the crews
      // between trips and nobody else (NPCLifeSim.Bands).
      const crew = SpawnManager.spaceCrewRiders(mapId);
      const npcPool = crew.length ? crew : SpawnManager.getNPCPool(groupName);
      const allPlaceholders = SpawnManager.getPlaceholders(true); // Include the map's PlayerNN slots as placeholders
      if (!npcPool.length || !allPlaceholders.length) return;

      // Build valid tiles, anywhere passable on the map
      let validTiles = null;
      const getValidTiles = () => {
        if (validTiles) return validTiles;
        validTiles = MapManager.getSpreadSpawnTiles();
        return validTiles;
      };

      // Calculate spawn cap based on map size (same density logic as other spawn methods)
      let densityFactor = 120;
      let baseLimit = MapManager.getNPCSpawnLimit();
      const isExterior = $dataMap && $dataMap.note && $dataMap.note.includes("<Exterior>");
      const isInterior = $dataMap && $dataMap.note && $dataMap.note.includes("<Interior>");

      if (isExterior) {
        densityFactor = 60;
        baseLimit = 15;
      } else if (isInterior) {
        densityFactor = 240;
        baseLimit = 2;
      }

      // Shuffle NPC pool for fresh randomization every time
      const shuffledPool = Utils.shuffle(npcPool);
      
      // For maps larger than 40x40, fill ALL available Player slots with NPCs
      let maxNPCs;
      if ($gameMap.width() > 40 || $gameMap.height() > 40) {
        maxNPCs = allPlaceholders.length;
      } else {
        maxNPCs = Math.min(Math.floor(($gameMap.width() * $gameMap.height()) / densityFactor), baseLimit);
      }
      const actualCount = Math.min(maxNPCs, shuffledPool.length, allPlaceholders.length);

      const activePlaceholders = allPlaceholders.slice(0, actualCount);
      const unusedPlaceholders = allPlaceholders.slice(actualCount);

      let tileIdx = 0;
      for (let i = 0; i < activePlaceholders.length; i++) {
        const { event: targetEvent } = activePlaceholders[i];
        const npcDataItem = shuffledPool[i % shuffledPool.length];

        if (!targetEvent || !npcDataItem?.eventData) { targetEvent?.erase(); continue; }

        if (!SpawnManager.transplantData(targetEvent, npcDataItem.eventData, i)) {
          targetEvent.erase();
          continue;
        }

        const tiles = getValidTiles();
        if (tileIdx < tiles.length) {
          targetEvent.locate(tiles[tileIdx].x, tiles[tileIdx].y);
          tileIdx++;
        } else {
          const fallbackTiles = MapManager.findPassableTerrainTiles();
          if (fallbackTiles.length > 0) {
            const fallback = Utils.randomElement(fallbackTiles);
            targetEvent.locate(fallback.x, fallback.y);
          } else {
            targetEvent.erase();
            continue;
          }
        }

        SpawnManager.injectBrain(targetEvent, targetEvent.event());
      }

      console.log(`[NPC System] ${activePlaceholders.length} NPCs randomized on OmegaTower map ${mapId} (${MapManager.getMapName(mapId)})`);

      unusedPlaceholders.forEach(u => u.event.erase());
    },

    // ── Omega City (map 631) ─────────────────────────────────────────────────
    // The largest city in the game, and the only map with its own spawn rules.
    //
    // Instead of the global group's density-capped crowd it fields a fixed
    // Config.OMEGA_CITY_NPC_COUNT citizens:
    //   - half transplanted from the world pool, i.e. authored templates
    //     harvested off EVERY other group's maps (getNPCPool already draws
    //     world-wide for the global group), so the city is where the rest of
    //     the world's faces turn up;
    //   - half generated on the spot as brand-new procedural citizens (name,
    //     sprite, class, full society profile), seeded off the world seed and
    //     the slot index so the same fifty people live there in every session
    //     of a given world;
    // and every one of them is then given one of the city's own residential
    // doors as an address (NPCSim.assignHomesOnMap), so the houses standing on
    // the map are actually somebody's home.
    // A whole city populated in one pass: half the crowd transplanted from the
    // authored templates of every map pool in the world, half born here.
    // `opts` is what makes it reusable by a city other than Omega:
    //   count            , how many people the city fields
    //   proceduralRatio  , share of them born here rather than borrowed
    //   poolGroup        , which pool the borrowed half is drawn from
    //   nativePlace      , the town name the home-grown half is born in
    randomizeOmegaCityMap: (mapId, groupName, opts = {}) => {
      const allPlaceholders = SpawnManager.getPlaceholders(true); // Player1..PlayerN
      if (!allPlaceholders.length) return;

      const tiles = MapManager.getSpreadSpawnTiles();
      if (!tiles.length) { allPlaceholders.forEach(p => p.event.erase()); return; }

      const worldPool = Utils.shuffle(SpawnManager.getNPCPool(opts.poolGroup || groupName));
      // Procedural citizens are spawned onto a placeholder like anyone else, so
      // they need a donor event to clone talkable pages/behaviour from, exactly
      // like a procedural settlement's own people (see makeSocietyTemplate).
      const donor = worldPool
        .map(t => t.eventData)
        .find(ev => Utils.isNPCEvent(ev?.note) && ev.pages?.some(p => (p?.list?.length ?? 0) > 1))
        || worldPool[0]?.eventData
        || NPCPoolStore.template("citizen")
        || null;
      // No donor means no pool at all, which means no city, leave the slots dark
      // rather than spawning blank events.
      if (!donor) { allPlaceholders.forEach(p => p.event.erase()); return; }

      const wanted = opts.count || Config.OMEGA_CITY_NPC_COUNT;
      const ratio = (opts.proceduralRatio != null)
        ? opts.proceduralRatio : Config.OMEGA_CITY_PROCEDURAL_RATIO;
      const total = Math.min(wanted, allPlaceholders.length, tiles.length);
      const procCount = Math.min(Math.round(total * ratio), total);
      const poolCount = total - procCount;

      const activePlaceholders = allPlaceholders.slice(0, poolCount + procCount);
      const unusedPlaceholders = allPlaceholders.slice(poolCount + procCount);

      // Same seed root the rest of the world derives from, mixed with the map
      // id so Omega City's own citizens are stable per world.
      const worldSeed = window.HistoryManager?.getSeed?.() ?? Config.NPC_NAME_SEED;
      const citySeed = (worldSeed ^ (mapId * 2654435761)) >>> 0;

      const spawnedNames = [];
      const takenNames = new Set();
      let slot = 0, tileIdx = 0;

      const place = (targetEvent) => {
        if (tileIdx >= tiles.length) return false;
        targetEvent.locate(tiles[tileIdx].x, tiles[tileIdx].y);
        tileIdx++;
        return true;
      };

      // Half the city: authored templates from every map pool in the world.
      for (let i = 0; i < poolCount; i++, slot++) {
        const { event: targetEvent } = activePlaceholders[slot];
        const npcDataItem = worldPool[i % worldPool.length];
        if (!targetEvent || !npcDataItem?.eventData) { targetEvent?.erase(); continue; }
        if (!SpawnManager.transplantData(targetEvent, npcDataItem.eventData, slot)) { targetEvent.erase(); continue; }
        if (!place(targetEvent)) { targetEvent.erase(); continue; }
        SpawnManager.injectBrain(targetEvent, targetEvent.event());
        const spawnedName = targetEvent.event().name;
        spawnedNames.push(spawnedName);
        takenNames.add(spawnedName);
      }

      // The other half: citizens who exist nowhere else, born here.
      for (let i = 0; i < procCount; i++, slot++) {
        const { event: targetEvent } = activePlaceholders[slot];
        if (!targetEvent) continue;
        const citizen = SpawnManager.makeCityCitizen(citySeed, i, groupName, donor, takenNames, opts.nativePlace);
        if (!citizen) { targetEvent.erase(); continue; }
        if (!SpawnManager.transplantData(targetEvent, citizen.eventData, slot)) { targetEvent.erase(); continue; }
        // transplantData clones the DONOR's pages, images included, so the
        // citizen's own rolled sprite has to be stamped over them, otherwise
        // they all wear the face of whichever template lent them its pages
        // (NPCSociety's _applySocietySprite would fix it a frame later, but only
        // once the society DataLoader is ready).
        SpawnManager.applyCitizenSprite(targetEvent, citizen.spriteName, citizen.spriteIndex);
        if (!place(targetEvent)) { targetEvent.erase(); continue; }
        SpawnManager.injectBrain(targetEvent, targetEvent.event());
        spawnedNames.push(citizen.name);
      }

      unusedPlaceholders.forEach(u => u.event.erase());

      console.log(`[NPC System] ${spawnedNames.length} NPCs spawned in city "${groupName}" (map ${mapId}): ${poolCount} from world pools, ${procCount} procedural.`);

      SpawnManager.houseOmegaCitizens(mapId, groupName, spawnedNames);
    },

    // Generates one procedural citizen of Omega City and returns a ready spawn
    // template for it. Name, sprite and class all hang off (citySeed, index),
    // so the same slot always resolves to the same person in a given world,
    // mirroring how a procedural settlement seeds its people
    // (setupProceduralMapNPCs).
    makeCityCitizen: (citySeed, index, groupName, donor, taken, nativePlace) => {
      // The pool is a hint, not a requirement: it stands empty in a monster
      // world (which has no people in it), and there the face comes off the
      // catalogue's own draw instead, exactly as pickNPCCharacter prefers.
      const charPool = buildNPCCharacterPool();
      if (!donor || !window.generateSeededMarkovName) return null;

      // The society table is keyed by name, so a collision would hand this slot
      // somebody who already exists (another town's person, or the citizen in
      // the slot before) instead of creating a new one. Re-roll on a salted seed
      // until a free name comes up.
      let seed = 0, name = null;
      for (let attempt = 0; attempt < 12 && !name; attempt++) {
        seed = (citySeed ^ ((index + 1) * 83492791) ^ (attempt * 0x9e3779b1)) >>> 0;
        const dbId = Config.NAME_DATABASES[Math.floor(Utils.seededRandom((seed ^ 0x5bd1e995) >>> 0) * Config.NAME_DATABASES.length)];
        let gen = null;
        try {
          gen = window.generateSeededMarkovName(seed & 0xffff, (seed >>> 16) & 0xffff, index + 1, dbId, 2, 4, 12);
        } catch (e) { gen = null; }
        if (!gen || gen === "Unknown" || gen === "NPC") continue; // i18n-ignore: Markov generator sentinels
        if (taken?.has(gen)) continue;
        const known = $gameSystem._npcSociety?.[gen];
        if (known && known._homeGroupName !== groupName) continue;
        name = gen;
      }
      if (!name) return null;
      taken?.add(name);

      const charName = pickNPCCharacter(Utils.seededRandom(seed), charPool);
      if (!charName) return null;
      // Big-character sprites (!$) have one slot; normal sheets use 0-7.
      const isBigSprite = charName.includes('!$');
      const charIdx = isBigSprite ? 0 : Math.floor(Utils.seededRandom((seed * 2) >>> 0) * 8);

      const classId = ProceduralManager.seededClassId((seed ^ 0x51ed270b) >>> 0);
      // The face is already rolled, so it is pinned before the profile is
      // minted rather than painted over it afterwards: the society generator's
      // creature roll must not deal a beast's identity to somebody wearing a
      // person's sheet (see ProfileGenerator.generate).
      const profile = window.NPCSocietyRegistry?.ensureProfile?.(
        name, classId, undefined, $gameMap?.mapId?.(),
        { spriteKey: charName, bustIndex: charIdx })
        || $gameSystem._npcSociety?.[name];
      if (profile) {
        profile._homeGroupName = groupName;
        window.NPCSocietyRegistry?.applyHometownOpinionIfMatch?.(profile, groupName);
        // Bind the rolled world sprite to the profile so the Empathize portrait,
        // the conversation voice and any later respawn all resolve to the same
        // person the player sees (see setupProceduralMapNPCs for the full
        // reasoning behind each field).
        const npcEntry = window.WorldGen?.NPCs?.[charName] || null;
        const spriteBust = npcEntry?.busts?.[charIdx] ?? npcEntry?.busts?.[0] ?? null;
        profile.spriteKey = charName;
        profile.bustIndex = charIdx;
        // A profile that already existed (an NPC met before this sprite was
        // bound, or one saved by an older build) is repaired to agree with the
        // sheet it is now wearing.
        window.NPCSocietyRegistry?.reconcileToSprite?.(name, profile);
        if (spriteBust && spriteBust !== "7") profile._bustName = spriteBust;
        if (npcEntry?.markovDB && profile.markovDb == null) profile.markovDb = npcEntry.markovDB;
        if (npcEntry && npcEntry.Gender != null) profile.gender = npcEntry.Gender;
        // A city that names its natives (Bologna) is where this person was
        // born, in the biography the Empathize panel reads as well as in the
        // life record below.
        if (nativePlace) profile._birthplaceOverride = nativePlace;
      }
      try {
        window.NPCLifeSim?.ensureLifeRecord?.(name, groupName, null,
          nativePlace ? { nativeChance: 1 } : null);
      } catch (_) {}

      return {
        name,
        spriteName: charName,
        spriteIndex: charIdx,
        eventData: {
          id: donor.id,
          name,
          note: donor.note || "",
          characterName: charName,
          characterIndex: charIdx,
          pages: JSON.parse(JSON.stringify(donor.pages)),
        },
      };
    },

    // Forces a spawned event to wear a specific sprite on every page, used for
    // citizens whose pages were cloned from an unrelated donor template.
    applyCitizenSprite: (targetEvent, characterName, characterIndex) => {
      if (!targetEvent || !characterName) return;
      const evData = targetEvent.event();
      evData.pages?.forEach(p => {
        // Trailing blank pages (the self-switch-gated "hide on recruit" page)
        // must stay graphic-less, see transplantData.
        if ((p?.list?.length ?? 0) <= 1) return;
        if (p?.image) { p.image.characterName = characterName; p.image.characterIndex = characterIndex; }
      });
      evData.characterName = characterName;
      evData.characterIndex = characterIndex;
      targetEvent.setImage(characterName, characterIndex);
      targetEvent.refresh();
      targetEvent.setupPage();
    },

    // Gives every citizen just spawned in Omega City one of the city's own
    // residential doors. Society profiles for pool-spawned NPCs are generated
    // lazily, a few per frame (NPCSociety's deferred pass), so anyone still
    // missing one is retried on the next frame rather than left homeless.
    houseOmegaCitizens: (mapId, groupName, names, attempt = 0) => {
      if (!names?.length || !$gameMap || $gameMap.mapId() !== mapId) return;

      const society = $gameSystem._npcSociety || {};
      const pending = names.filter(n => !society[n]);
      const ready = names.filter(n => society[n]);

      if (ready.length) {
        const housed = window.NPCSim?.assignHomesOnMap?.(mapId, groupName, ready) ?? 0;
        if (housed) Utils.debug(`Omega City: ${housed} citizens moved into the city's own houses.`);
      }
      // ~4 seconds of frames is far more than the deferred profile pass needs.
      if (pending.length && attempt < 240) {
        requestAnimationFrame(() =>
          SpawnManager.houseOmegaCitizens(mapId, groupName, pending, attempt + 1));
      }
    },

    // Who rides a bus, a tram, a train: its own staff and regulars (the
    // PublicTransport residents), commuters from every town in the world, and
    // any authored Local who is out and about this hour (localVisitors). A
    // commuter is dealt their own face; they are the same person who lives
    // on their street, simply met on the way.
    TRANSPORT_COMMUTERS: 24,

    // The space crews sitting on this map between trips, as rider templates.
    spaceCrewRiders: (mapId) => {
      const Bands = window.NPCLifeSim?.Bands;
      if (!Bands?.isSpaceBaseMap?.(mapId) || Config.isEmptyWorld()) return [];
      const inParty = new Set(($gameParty?.members?.() || []).map(a => a?.name?.()));
      return (Bands.atSpaceBase() || [])
        .filter(n => !inParty.has(n) && !GoneRegistry.isNameGone(n))
        .map(n => ({ eventData: ResidentRegistry.template(n), eventId: null, mapId, generated: true }))
        .filter(t => t.eventData);
    },
    getTransportRiders: (mapId, groupName) => {
      const own = SpawnManager.getNPCPool(groupName);
      // The low orbit ship's lower deck is where a space crew waits out the
      // days between trips (NPCLifeSim.Bands): the crew, not the commuters.
      const crew = SpawnManager.spaceCrewRiders(mapId);
      if (crew.length) return crew.concat(own);
      const hour = $gameVariables?.value(23) ?? 12;
      const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
      const Life = window.NPCLifeSim;
      const commuters = ResidentRegistry.worldResidents()
        .filter(r => r.group !== groupName && !GoneRegistry.isNameGone(r.name) && !Life?.isAwayFromTown?.(r.name))
        .map(r => ({ r, k: Utils.seededRandom((Utils.nameHash(`ride:${r.name}:${mapId}:${hour}`) ^ ws) >>> 0) })) // i18n-ignore: seed key
        .sort((a, b) => a.k - b.k)
        .slice(0, SpawnManager.TRANSPORT_COMMUTERS)
        .map(({ r }) => ({ eventData: ResidentRegistry.template(r.name), eventId: null, mapId: r.mapId, generated: true }))
        .filter(t => t.eventData);
      const visitors = SpawnManager.localVisitors(mapId, null, groupName, hour)
        .map(v => ({ eventData: v.template, eventId: null, mapId, generated: true }));
      return own.concat(commuters, visitors);
    },

    // Seat-aware variant of randomizeOmegaTowerMap for the PublicTransport
    // group (buses/trams/trains): fills TRANSPORT_SEAT_EMPTY_RATIO-adjusted
    // region-102 seats with sitting riders (facing down, no wander
    // controller, so they stay put for the whole ride) and spreads the
    // remaining riders across the vehicle's other passable floor tiles with
    // the normal wandering AI, exactly like any other global-group NPC.
    randomizePublicTransportMap: (mapId, groupName) => {
      const npcPool = SpawnManager.getTransportRiders(mapId, groupName);
      const allPlaceholders = SpawnManager.getPlaceholders(true); // Include the map's PlayerNN slots as placeholders
      if (!npcPool.length || !allPlaceholders.length) return;

      const seatTiles  = MapManager.getSeatTiles();
      const floorTiles = MapManager.getSpreadSpawnTiles()
        .filter(t => $gameMap.regionId(t.x, t.y) !== Config.Zones.TRANSPORT_SEAT);

      const shuffledSeats = Utils.shuffle(seatTiles);
      const seatFillCount = Math.floor(shuffledSeats.length * (1 - Config.TRANSPORT_SEAT_EMPTY_RATIO));
      const seatsToFill    = shuffledSeats.slice(0, seatFillCount);

      const shuffledPool = Utils.shuffle(npcPool);

      // Seat headcount is driven directly by the vehicle's own seat count
      // (per spec), not the generic <Interior>/<Exterior> density formula
      // randomizeOmegaTowerMap uses, that formula's tiny <Interior> cap
      // (baseLimit 2) was tuned for house-sized rooms and would starve a
      // whole subway car's worth of seats.
      const seatCount = Math.min(seatsToFill.length, shuffledPool.length, allPlaceholders.length);

      // Standees get a modest budget on top of that, same general-purpose cap
      // used for pre-placed <AI> events (getNPCSpawnLimit), so the aisle
      // doesn't get more wanderers than a normal map would.
      const wanderBudget = Math.max(0, Math.min(MapManager.getNPCSpawnLimit(), shuffledPool.length - seatCount, allPlaceholders.length - seatCount));
      const wanderCount  = Math.min(floorTiles.length, wanderBudget);
      const actualCount  = seatCount + wanderCount;

      const activePlaceholders = allPlaceholders.slice(0, actualCount);
      const unusedPlaceholders = allPlaceholders.slice(actualCount);

      let poolIdx = 0;

      // Seated riders: locked onto their seat tile, facing down, no wander
      // controller, i.e. an interactable NPC that never leaves its seat.
      for (let i = 0; i < seatCount; i++) {
        const { event: targetEvent } = activePlaceholders[poolIdx];
        const npcDataItem = shuffledPool[poolIdx % shuffledPool.length];
        poolIdx++;

        if (!targetEvent || !npcDataItem?.eventData) { targetEvent?.erase(); continue; }
        if (!SpawnManager.transplantData(targetEvent, npcDataItem.eventData, poolIdx)) {
          targetEvent.erase();
          continue;
        }

        const seat = seatsToFill[i];
        targetEvent._npcRosterSpawn = true;
        targetEvent._npcSeated = true;
        targetEvent._moveType = 0;
        targetEvent.setMoveFrequency(5);
        targetEvent.setThrough(false);
        targetEvent.setOpacity(255);
        targetEvent.locate(seat.x, seat.y);
        targetEvent.setDirection(2); // face down, as if sitting
      }

      // Standing riders: same wandering AI/routine as any other global-group NPC.
      for (let i = 0; i < wanderCount; i++) {
        const { event: targetEvent } = activePlaceholders[poolIdx];
        const npcDataItem = shuffledPool[poolIdx % shuffledPool.length];
        poolIdx++;

        if (!targetEvent || !npcDataItem?.eventData) { targetEvent?.erase(); continue; }
        if (!SpawnManager.transplantData(targetEvent, npcDataItem.eventData, poolIdx)) {
          targetEvent.erase();
          continue;
        }

        const tile = floorTiles[i];
        if (!tile) { targetEvent.erase(); continue; }
        targetEvent.locate(tile.x, tile.y);
        SpawnManager.injectBrain(targetEvent, targetEvent.event());
      }

      console.log(`[NPC System] ${seatCount} seated + ${wanderCount} standing NPCs randomized on PublicTransport map ${mapId} (${MapManager.getMapName(mapId)})`);

      unusedPlaceholders.forEach(u => u.event.erase());
    }
  };

  // Building doors/tent markers the prefab system can drop into ANY biome, not
  // just City/Village/Burg (a lone farmstead or hamlet on a Plains/Forest/...
  // tile), see ProceduralHouseSystem.residentialPoolForDoor for the matching
  // "which house pool" logic on the interaction side.
  // The trade doors of the city tileset count too: a clinic, a gym and a police
  // station are places people come out of exactly as a shop is, and leaving them
  // off meant a city street's own doors never put anybody on the pavement.
  const SETTLEMENT_DOOR_FEATURES = new Set([
    "DoorHouse", "DoorInn", "DoorShop", "DoorSkyscraper", "Tent", // i18n-ignore: Features.json ids
    "DoorClinic", "DoorPoliceStation", "DoorWeaponStore", "DoorGym", // i18n-ignore: Features.json ids
    "DoorHardwareStore", "DoorIceCream", "DoorMusicStore", "GarageDoor" // i18n-ignore: Features.json ids
  ]);

  // ==========================================================================
  // INTERIOR VISITS AND COUNTER HANDOVERS
  // ==========================================================================
  //
  // Somebody visiting a building is not there for the whole hour. Every hour of
  // a building has its own seeded list of visits, each with an arrival minute
  // and a stay of VISIT_MIN..VISIT_MAX game minutes. Walking out and straight
  // back in finds whoever's visit covers this minute and nobody else, since
  // the list is drawn off the building and the hour alone.
  //
  // While the party is inside, the list is played out on the clock (variable
  // 114, once a game minute): an arrival is created beside the map's exit and
  // walks in, a departure walks back to the exit and goes through it. Waiting
  // fast-forwards the live map (TimeDateSystem _stepWaitAdvance), so those
  // walks are seen during a wait too.
  //
  // A shop counter changing hands at the end of a shift is played out the same
  // way (beginShopHandover): the one going home steps out beside the till and
  // walks to the exit, the till stands vacant, and the next one comes in
  // through the exit and walks to it before their face appears on it.
  const InteriorVisits = {
    VISIT_MIN: 10,         // game minutes
    VISIT_MAX: 45,
    WALK_TIMEOUT: 30000,   // ms before a walk in, out or to a till is settled anyway
    NEAR_RADIUS: 4,        // how far from a door or a till a walker may be put down
    _active: null,
    _takeovers: new Map(), // walker event -> what to do once they reach the till

    now: () => Number($gameVariables?.value(114)) || 0,

    // The map's own way out: an event that runs ProceduralHouseSystem's
    // exitHouse, transfers the party, or leads to another map, nearest (x, y).
    exitNear(x, y) {
      if (!$gameMap) return null;
      let best = null, bestD = Infinity;
      for (const ev of $gameMap.events()) {
        if (!ev || ev._erased || ev._npcMinted || ev._procInteriorSpawn) continue;
        if (!InteriorVisits.isExitEvent(ev)) continue;
        const d = Math.abs(ev.x - x) + Math.abs(ev.y - y);
        if (d < bestD) { bestD = d; best = ev; }
      }
      return best;
    },

    isExitEvent(ev) {
      const data = ev?.event?.();
      for (const page of data?.pages || []) {
        for (const c of page?.list || []) {
          if (c.code === 201) return true;
          if (c.code === 357 && String(c.parameters?.[0] || "").includes("ProceduralHouseSystem") &&
              c.parameters?.[1] === "exitHouse") return true;  // i18n-ignore: plugin command id
        }
      }
      try { return (window.MapConnections?.exitTarget?.(ev) || 0) > 0; } catch (e) { return false; }
    },

    // Nearest free floor to (x, y), ring by ring: walkable, off the blocked
    // terrain and regions, with nobody standing on it.
    freeTileNear(x, y, radius = InteriorVisits.NEAR_RADIUS) {
      if (!$gameMap) return null;
      for (let r = 1; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
          const span = r - Math.abs(dy);
          for (const dx of span ? [-span, span] : [0]) {
            const tx = x + dx, ty = y + dy;
            if (!$gameMap.isValid(tx, ty)) continue;
            if ([10, 103, 99].includes($gameMap.regionId(tx, ty))) continue;
            if (Utils.isBlockedTerrain(tx, ty)) continue;
            if (!ORTHO_DIRS.some(dir => $gameMap.isPassable(tx, ty, dir))) continue;
            if ($gameMap.eventsXy(tx, ty).some(e => !e._erased)) continue;
            if ($gamePlayer && $gamePlayer.x === tx && $gamePlayer.y === ty) continue;
            return { x: tx, y: ty };
          }
        }
      }
      return null;
    },

    controllerOf(ev) {
      return ($gameSystem?.npcControllers || []).find(c => c?.event === ev) || null;
    },

    // A walker is put down where the walk starts, never dealt onto a seat.
    spawnWalker(spawn, who, tile) {
      SpawnManager._dealingWalker = true;
      try { return spawn(who, tile) || null; } catch (e) { return null; } finally { SpawnManager._dealingWalker = false; }
    },

    // ── visits ──────────────────────────────────────────────────────────────
    //
    // opts:
    //   building     ProceduralHouseSystem.getCurrentBuilding(), seeds the plan
    //   candidates   who may visit, in a stable order
    //   nameOf(who)  their name
    //   spawn(who, tile)  creates their event with a brain, or null
    //   maxVisitsAt(hourOfDay)  visits to plan in that hour (0 for none)
    begin(opts) {
      if (!$gameMap || !opts || !opts.candidates?.length) { InteriorVisits._active = null; return; }
      const T = InteriorVisits.now();
      const door = InteriorVisits.exitNear($gamePlayer.x, $gamePlayer.y);
      const a = InteriorVisits._active = {
        ...opts,
        mapId: $gameMap.mapId(),
        exit: door ? { x: door.x, y: door.y } : { x: $gamePlayer.x, y: $gamePlayer.y },
        plans: new Map(),
        state: new Map(),   // visit key -> { ev, phase: "in" | "left" }
        lastMinute: T,
        baseHour: { index: Math.floor(T / 60), ofDay: $gameVariables?.value(23) ?? 12 },
      };
      // Whoever's visit covers this minute is already inside, spread about.
      const px = $gamePlayer.x, py = $gamePlayer.y;
      const tiles = MapManager.getSpreadSpawnTiles().filter(t =>
        Math.max(Math.abs(t.x - px), Math.abs(t.y - py)) > 1 && !$gameMap.eventsXy(t.x, t.y).some(e => !e._erased));
      let ti = 0;
      for (const v of InteriorVisits.visitsAround(a, T)) {
        if (T >= v.leave) { a.state.set(v.key, { ev: null, phase: "left" }); continue; }
        if (T < v.arrive) continue;
        const tile = tiles[ti++];
        const ev = tile && !InteriorVisits._present(a, v.name) ? InteriorVisits.spawnWalker(a.spawn, v.who, tile) : null;
        a.state.set(v.key, { ev, phase: ev ? "in" : "left" });
      }
    },

    hourOfDay(a, hourIndex) {
      return (((a.baseHour.ofDay + hourIndex - a.baseHour.index) % 24) + 24) % 24;
    },

    // The visits that start in one hour of this building, drawn off the
    // building, its floor and that hour alone.
    plan(a, hourIndex) {
      if (a.plans.has(hourIndex)) return a.plans.get(hourIndex);
      const rng = SpawnManager.interiorVisitRng(a.building, a.mapId, hourIndex);
      const max = Math.max(0, Math.floor(a.maxVisitsAt(InteriorVisits.hourOfDay(a, hourIndex)) || 0));
      const pool = a.candidates.slice();
      const count = max ? max + Math.floor(rng.next() * (max + 1)) : 0;
      const visits = [];
      for (let i = 0; i < count && pool.length; i++) {
        const who = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
        const arrive = hourIndex * 60 + Math.floor(rng.next() * 60);
        const stay = InteriorVisits.VISIT_MIN + Math.floor(rng.next() * (InteriorVisits.VISIT_MAX - InteriorVisits.VISIT_MIN + 1));
        visits.push({ key: `${hourIndex}:${i}`, who, name: a.nameOf(who), arrive, leave: arrive + stay });
      }
      a.plans.set(hourIndex, visits);
      for (const h of a.plans.keys()) if (h < hourIndex - 1) a.plans.delete(h);
      return visits;
    },

    // A stay never lasts past the next hour, so the hour before this one and
    // this one hold every visit that can cover this minute.
    visitsAround(a, T) {
      const h = Math.floor(T / 60);
      return [...InteriorVisits.plan(a, h - 1), ...InteriorVisits.plan(a, h)];
    },

    // Somebody already in the room (on another visit, or living here) is not
    // let in a second time.
    _present(a, name) {
      if (!name || !$gameMap) return false;
      return $gameMap.events().some(e => e && !e._erased && e.event()?.name === name);
    },

    // Once a game minute while the party is in the building.
    update() {
      const a = InteriorVisits._active;
      if (!a) return;
      if (!$gameMap || $gameMap.mapId() !== a.mapId) { InteriorVisits._active = null; return; }
      const T = InteriorVisits.now();
      if (T === a.lastMinute) return;
      a.lastMinute = T;
      for (const v of InteriorVisits.visitsAround(a, T)) {
        const st = a.state.get(v.key);
        if (T >= v.leave) {
          if (!st) a.state.set(v.key, { ev: null, phase: "left" });
          else if (st.phase === "in") InteriorVisits._leave(a, st);
          continue;
        }
        if (T >= v.arrive && !st) a.state.set(v.key, InteriorVisits._arrive(a, v));
      }
    },

    _arrive(a, v) {
      const gone = { ev: null, phase: "left" };
      if (InteriorVisits._present(a, v.name)) return gone;
      const tile = InteriorVisits.freeTileNear(a.exit.x, a.exit.y);
      const ev = tile ? InteriorVisits.spawnWalker(a.spawn, v.who, tile) : null;
      if (!ev) return gone;
      const spots = MapManager.getSpreadSpawnTiles();
      const goal = spots.length ? spots[Math.floor(Math.random() * spots.length)] : null;
      const ctrl = InteriorVisits.controllerOf(ev);
      if (goal && ctrl) ctrl.goToTile(goal.x, goal.y, "walkingIn", InteriorVisits.WALK_TIMEOUT);  // i18n-ignore: goal id
      else if (goal) ev.locate(goal.x, goal.y);
      return { ev, phase: "in" };
    },

    _leave(a, st) {
      st.phase = "left";
      const ev = st.ev;
      if (!ev || ev._erased) return;
      const ctrl = InteriorVisits.controllerOf(ev);
      if (!ctrl || !SpawnManager.walkOut(ctrl, a.exit, InteriorVisits.WALK_TIMEOUT)) ev.erase();
    },

    // ── the counter changing hands ──────────────────────────────────────────
    //
    // Returns false when nothing could be walked (no exit, the map not on
    // screen), and the caller swaps the face on the till at once as before.
    // `onSeated` runs once the next keeper has reached the till, or straight
    // away when there is no next keeper to walk.
    beginShopHandover(counter, outgoing, incoming, onSeated) {
      if (!$gameMap || !counter || counter._erased) return false;
      if (!(SceneManager._scene instanceof Scene_Map)) return false;
      const a = InteriorVisits._active;
      const door = a && a.mapId === $gameMap.mapId() ? a.exit : InteriorVisits.exitNear(counter.x, counter.y);
      if (!door) return false;
      const exit = { x: door.x, y: door.y };
      const spawn = (persona, tile) => ProceduralManager._spawnInteriorResident(persona.name, tile, persona);

      if (outgoing?.spriteName) {
        const tile = InteriorVisits.freeTileNear(counter.x, counter.y);
        const ev = tile ? InteriorVisits.spawnWalker(spawn, outgoing, tile) : null;
        const ctrl = ev && InteriorVisits.controllerOf(ev);
        if (ev && (!ctrl || !SpawnManager.walkOut(ctrl, exit, InteriorVisits.WALK_TIMEOUT))) ev.erase();
      }

      const tile = incoming?.spriteName ? InteriorVisits.freeTileNear(exit.x, exit.y) : null;
      const ev = tile ? InteriorVisits.spawnWalker(spawn, incoming, tile) : null;
      const ctrl = ev && InteriorVisits.controllerOf(ev);
      if (!ev || !ctrl) {
        if (ev) ev.erase();
        onSeated?.();
        return true;
      }
      const spot = InteriorVisits.counterApproach(counter, ctrl);
      ev._npcShopTakeover = { x: spot.x, y: spot.y, until: performance.now() + InteriorVisits.WALK_TIMEOUT };
      InteriorVisits._takeovers.set(ev, onSeated);
      ctrl.target = { x: spot.x, y: spot.y };
      ctrl.state = "walkingToCounter";  // i18n-ignore: goal id
      ctrl.stateEndTime = performance.now() + InteriorVisits.WALK_TIMEOUT;
      ctrl.path = ctrl.pathfinder.findPath(ev.x, ev.y, spot.x, spot.y) || [];
      return true;
    },

    // Where the next keeper stands to take the till: beside the counter event
    // on a tile they can reach, the closest by route; else across the counter
    // tile it faces; else the floor nearest the till.
    counterApproach(counter, ctrl) {
      const ev = ctrl.event;
      let best = null, bestLen = Infinity;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const x = counter.x + dx, y = counter.y + dy;
        if (!$gameMap.isValid(x, y) || !ORTHO_DIRS.some(dir => $gameMap.isPassable(x, y, dir))) continue;
        if ($gameMap.isCounter?.(x, y)) continue;
        const path = (ev.x === x && ev.y === y) ? [] : ctrl.pathfinder.findPath(ev.x, ev.y, x, y);
        if (path && path.length < bestLen) { bestLen = path.length; best = { x, y }; }
      }
      if (best) return best;
      const dir = Utils.counterFacingDir(counter);
      if (dir) {
        const x = counter.x + (dir === 6 ? 2 : dir === 4 ? -2 : 0);
        const y = counter.y + (dir === 2 ? 2 : dir === 8 ? -2 : 0);
        if ($gameMap.isValid(x, y) && ORTHO_DIRS.some(d => $gameMap.isPassable(x, y, d))) return { x, y };
      }
      return InteriorVisits.freeTileNear(counter.x, counter.y) || { x: counter.x, y: counter.y };
    },

    // The next keeper is at the till: the walker goes and the till wears them.
    finishShopTakeover(ev) {
      if (!ev || !ev._npcShopTakeover) return;
      ev._npcShopTakeover = null;
      const onSeated = InteriorVisits._takeovers.get(ev);
      InteriorVisits._takeovers.delete(ev);
      ev.erase();
      try { onSeated?.(); } catch (e) { console.error("[NPC System] shop takeover failed", e); }
    },
  };

  SpawnManager.InteriorVisits = InteriorVisits;
  SpawnManager.beginShopHandover = InteriorVisits.beginShopHandover;
  SpawnManager.finishShopTakeover = InteriorVisits.finishShopTakeover;

  Object.assign(window.NPCSystem._internal, {
    SETTLEMENT_DOOR_FEATURES, SpawnManager, InteriorVisits,
  });
})();
