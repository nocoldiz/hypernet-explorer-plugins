/*:
 * @target MZ
 * @plugindesc NPC System: the Horde's own ground, Horde homes and refugee camps
 * @author Omni-Lex
 * @base NPCSystem
 * @orderAfter NPCSystem
 * @orderAfter NPCSystem_Zombies
 * @help
 * ============================================================================
 * NPCSystem_Horde, part of the NPCSystem family
 * ============================================================================
 * Owns the goblin ground on the Horde's squares, the homes refugees leave
 * behind, the wild camps and the litter strewn on the Horde's hand-made towns.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSystem._internal and publishes its own there. Load it right after
 * NPCSystem_Zombies.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    Config, GroupRegistry, isBetaSprite, isVipSprite, ORTHO_DIRS, ProceduralManager,
    ResidentRegistry, SpawnManager, Utils,
  } = window.NPCSystem._internal;

  // ---- the Horde's own ground --------------------------------------------
  // A procedural square standing in a nation the Goblin Horde rules is goblin
  // country: nine of the ten people found in its towns, its villages and the
  // houses opened out of them are goblins, the tenth is whoever else lives
  // there. Nothing else changes about them. A goblin here is a citizen with a
  // name, a job and a household like anybody else, not an enemy: this is not
  // the zombie apocalypse, only who the neighbours are.
  //
  // Almost every face on procedural ground is dealt through the catalogue,
  // which already deals the same nine tenths (SpriteCatalog.pickNpcKey), so
  // this pass exists for the slots that arrive wearing a face of their own: a
  // prefab dropped on the square, an authored resident of a house interior.
  // It runs BEFORE the crowd is staffed, exactly as the zombie pass does, so a
  // slot the population pass goes on to dress is dealt its face by the
  // catalogue and not by this: whichever writes last, the odds are the same
  // nine in ten, and the two never stack.
  function goblinSheetPool() {
    const SC = window.SpriteCatalog;
    const list = (SC && SC.goblinKeys) ? SC.goblinKeys() : [];
    return list.filter(k => !isBetaSprite(k) && !isVipSprite(k));
  }

  // Is this sheet a goblin's? Asked of whatever graphic an event is wearing,
  // so a citizen dealt a goblin face by the population pass counts exactly as
  // one re-skinned here does.
  function isGoblinSheet(name) {
    const SC = window.SpriteCatalog;
    return !!(name && SC && SC.isGoblinSheet && SC.isGoblinSheet(name));
  }

  // The sheet this slot is a goblin in, or null for the neighbour who is not.
  // Pure in (map, event, world seed), so the same street holds the same people
  // every time it is walked into and two savegames of one world agree about
  // them. Salted apart from the zombie roll so the two never pick together.
  function goblinSheetFor(ev, always) {
    const pool = goblinSheetPool();
    if (!pool.length || !ev || !ev.event) return null;
    const seedBase = (window.HistoryManager && window.HistoryManager.getSeed)
      ? window.HistoryManager.getSeed() : 19002001;
    let h = ($gameMap.mapId() * 73856093) ^ (ev.eventId() * 19349663) ^ (seedBase + 0x6f0b1e5d);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    if (!always && (h % 1000) / 1000 >= Config.GOBLIN_SHEET_CHANCE) return null;   // the neighbour
    return pool[(h >>> 10) % pool.length];
  }

  // Written onto the page data as well as the sprite, for the same reason the
  // zombie pass does it: a page refresh re-derives the graphic from
  // page().image, and $dataMap is re-read from disk on every Scene_Map
  // rebuild. Every goblin sheet is a single-character !$ sheet, hence cell 0.
  function applyGoblinSheet(ev, sheet) {
    const data = ev && ev.event ? ev.event() : null;
    if (!data || !sheet) return;
    for (const page of (data.pages || [])) {
      if (page?.image) {
        page.image.characterName = sheet;
        page.image.characterIndex = 0;
      }
    }
    ev._npcGoblinSheet = sheet;
    ev.setImage(sheet, 0);
    SpawnManager.snapshotSpawn(ev);
  }

  // Every slot the crowd is dealt into, walked once. The same slots the zombie
  // pass takes: a till is not a person and a written one keeps the face they
  // were written with.
  function goblinizeMapNPCs() {
    if (!$gameMap || !$dataMap) return;
    for (const ev of $gameMap.events()) {
      const data = ev && ev.event ? ev.event() : null;
      if (!data) continue;
      if (String(data.name || "").startsWith("Player")) continue; // i18n-ignore: event name matched at runtime
      const note = data.note || "";
      if (Utils.hasShopTag(note)) continue;
      if (Utils.hasStoryTag(note)) continue;
      const isRosterSlot = String(data.name || "").startsWith("NPC"); // i18n-ignore: event name matched at runtime
      if (!isRosterSlot && !Utils.isNPCEvent(note)) continue;
      if (ev._npcGoblinDecided) continue;
      ev._npcGoblinDecided = true;
      // A person the society knows keeps the answer they were given the first
      // time (profile._hordeGoblin), so the same neighbour is a goblin on
      // every visit and an integrated human never turns into one.
      const profile = $gameSystem?._npcSociety?.[data.name] || null;
      if (profile && (profile._hordeGoblin === false || profile._hordeIntegrated)) continue;
      if (profile && profile._hordeGoblin === true) {
        const own = isGoblinSheet(profile.spriteKey) ? profile.spriteKey : (goblinSheetFor(ev, true) || null);
        if (own && !isGoblinSheet(ev.characterName && ev.characterName())) applyGoblinSheet(ev, own);
        if (own && profile.spriteKey !== own) { profile.spriteKey = own; profile.bustIndex = 0; }
        continue;
      }
      // Already a goblin (the catalogue dealt them one): nothing to re-skin.
      if (isGoblinSheet(ev.characterName && ev.characterName())) {
        if (profile) profile._hordeGoblin = true;
        continue;
      }
      const sheet = goblinSheetFor(ev);
      if (sheet) applyGoblinSheet(ev, sheet);
      if (profile && !profile._hordeIntegrated) {
        profile._hordeGoblin = !!sheet;
        if (sheet) { profile.spriteKey = sheet; profile.bustIndex = 0; }
      }
    }
  }

  // ---- HORDE HOMES AND REFUGEE CAMPS -------------------------------------
  // Two things the Horde's conquests (NPCLifeSim REFUGEES) ask of the towns.
  //
  // First, the homes the refugees leave behind in a hand-made town are dealt
  // again: the register mints newcomers off the Horde's own share of the
  // wardrobe (SpriteCatalog.hordeNpcKey, three goblins in four) and moves them
  // in behind the doors that stand empty. A procedural square needs nothing of
  // the kind: its crowd is dealt off the catalogue on arrival, and the
  // catalogue already answers for the Horde's ground.
  //
  // Second, a wild camp. A square out in the country with nobody's town on it
  // is registered as a settlement with `_camp: true` and a tent for each
  // household that fled there. When the party walks onto the square the tents
  // are pitched as real furniture (the "Tents" category) on the spots the
  // households were given, so the doors the register hands out are tents.
  function refillHordeHomes(groupName, count, tag) {
    if (!$gameSystem || !groupName || !(count > 0) || Config.isProceduralGroup(groupName)) return [];
    const entry = ResidentRegistry.entry(groupName);
    const group = GroupRegistry.get(groupName);
    if (!entry || !group) return [];
    const SC = window.SpriteCatalog;
    const hub = (group.mainMaps || [])[0] ?? (group.maps || [])[0] ?? null;
    if (hub == null) return [];
    const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
    const country = SC?.countryOfMapGroup?.(groupName) || null;
    const made = [];
    for (let i = 0; i < count; i++) {
      const seed = (Utils.nameHash(`${groupName}:horde:${tag || ""}:${i}`) ^ ws) >>> 0; // i18n-ignore: seed key
      const rng = ProceduralManager._creatureRng(seed);
      const spriteKey = SC?.hordeNpcKey ? SC.hordeNpcKey(rng.next(), { mapId: hub }) : null;
      const member = { role: "regular", age: rng.nextInt(18, 76), gender: null };
      const name = ProceduralManager._mintInteriorCitizen(member, seed, groupName, null,
        { homeMapId: hub, spriteKey: spriteKey || undefined });
      if (!name) continue;
      ResidentRegistry._mark(name, groupName, hub, entry);
      const profile = $gameSystem._npcSociety?.[name];
      if (profile) {
        profile._hordeGoblin = isGoblinSheet(profile.spriteKey);
        profile._hordeSettler = country;
        try { window.NPCSim?.resettle?.(name, groupName); } catch (e) { /* a door is found on the next visit */ }
      }
      made.push(name);
    }
    $gameSystem._npcResidents = ResidentRegistry._store();
    return made;
  }

  // The tent pieces of the furniture catalogue, in a fixed order.
  function tentFurnitureIds() {
    const cat = window.Items?.Furniture || {};
    return Object.keys(cat).filter(k => cat[k] && cat[k].category === "Tents").sort(); // i18n-ignore: Furniture.json category id
  }

  // A camp on a wild square: the settlement record itself, made without the
  // party anywhere near it. Answers the group name.
  function ensureCampGroup(worldX, worldY, country, displayName) {
    if (!$gameSystem) return null;
    const groupName = ProceduralManager.procGroupName(worldX, worldY);
    const groups = $gameSystem._npcMapGroups || ($gameSystem._npcMapGroups = {});
    const have = groups[groupName];
    if (have && !have._camp) return null;
    if (!have) {
      const nation = (window.WorldGen?.Countries || []).find(c => c && c.country === country) || null;
      groups[groupName] = {
        maps: [636], mainMaps: [636], residentialBuildings: [],
        _procedural: true, _camp: true, worldX, worldY, biome: null,
        doorKinds: [], jobs: {},
        nationId: nation ? nation.id : 0, country: country || null,
        displayName: displayName || null,
      };
      if (GroupRegistry._cache && GroupRegistry._cache !== groups) GroupRegistry._cache[groupName] = groups[groupName];
    }
    return groupName;
  }

  // The party is standing on this camp's square right now (the procedural map,
  // registered to this settlement).
  function partyOnCamp(groupName) {
    if (typeof $gameMap === "undefined" || !$gameMap || $gameMap.mapId() !== 636) return false;
    return !!groupName && $gameSystem?._currentProcGroup === groupName;
  }

  // A tent just put up, drawn on the live map. A spriteset that already holds
  // it (it was built after the placement) is left alone.
  function drawTent(placed) {
    const set = (typeof SceneManager !== "undefined") ? SceneManager._scene?._spriteset : null;
    if (!placed || !set?.addFurnitureSprite) return false;
    if ((set._furnitureSprites || []).some(sp => sp?.getPlacedData?.()?.id === placed.id)) return false;
    try { set.addFurnitureSprite(placed); return true; } catch (e) { return false; } // drawn on the next load
  }

  // One more tent for a household, laid out on a ring round the middle of the
  // square (a square is 64 tiles wide); pitchCamp nudges it onto open ground.
  // When the party is standing in the camp as the household arrives, the tent
  // goes up there and then, on the map in front of them.
  function addCampTent(groupName, household) {
    const group = $gameSystem?._npcMapGroups?.[groupName];
    if (!group || !group._camp) return null;
    const list = group.residentialBuildings || (group.residentialBuildings = []);
    const i = list.filter(b => b && b._tent).length;
    const ring = 3 + Math.floor(i / 8) * 3;
    const a = (i % 8) * (Math.PI / 4) + Math.floor(i / 8) * 0.4;
    const x = 32 + Math.round(Math.cos(a) * ring);
    const y = 32 + Math.round(Math.sin(a) * ring);
    const size = Math.max(1, Number(household) || 1);
    const b = {
      mapId: 636, x, y, seed: (Utils.nameHash(`${groupName}:tent:${i}`) >>> 0), // i18n-ignore: seed key
      type: "visitHouse", poolName: "", numFloors: 0, totalFloors: 1,
      capacity: size, groupName, _tent: true,
    };
    list.push(b);
    if (partyOnCamp(groupName)) {
      try { pitchCamp(groupName); } catch (e) { /* pitched on the next visit */ }
    }
    return b;
  }

  // The party is standing on a camp square: every tent not yet up is pitched.
  function pitchCamp(groupName) {
    const group = $gameSystem?._npcMapGroups?.[groupName];
    if (!group || !group._camp || !$gameMap) return 0;
    const ids = tentFurnitureIds();
    const FS = window.FurnitureSystem;
    if (!ids.length || !FS?.furnitureMapKey || typeof $gameSystem.placeFurniture !== "function") return 0;
    const key = FS.furnitureMapKey();
    const open = (x, y) => $gameMap.isValid(x, y) && ORTHO_DIRS.some(d => $gameMap.isPassable(x, y, d)) &&
      $gameMap.eventsXy(x, y).length === 0;
    let pitched = 0;
    for (const b of (group.residentialBuildings || [])) {
      if (!b || !b._tent || b._pitched) continue;
      let spot = open(b.x, b.y) ? { x: b.x, y: b.y } : null;
      for (let r = 1; r <= 4 && !spot; r++) {
        for (let dy = -r; dy <= r && !spot; dy++) {
          for (let dx = -r; dx <= r && !spot; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && open(b.x + dx, b.y + dy)) spot = { x: b.x + dx, y: b.y + dy };
          }
        }
      }
      if (!spot) continue;
      b.x = spot.x;
      b.y = spot.y;
      const placed = $gameSystem.placeFurniture(key, ids[(b.seed >>> 0) % ids.length], spot.x, spot.y);
      b._pitched = true;
      drawTent(placed);
      pitched++;
    }
    return pitched;
  }

  // ---- CHAOS LITTER ON THE HORDE'S HAND-MADE TOWNS -------------------------
  // A procedural square on the Horde's ground is strewn with its rubbish by
  // the city litter pass (ProceduralMapStructureGenerator cityLitterFactor,
  // read off HordeGround.litter). A hand-made town has no such pass: its tiles
  // are authored. So the same junk and fallen leaves are laid over it as
  // decals, the Trash and Leaves pieces of the furniture catalogue drawn
  // straight onto the spriteset. Nothing is placed in the furniture register:
  // the decals are never saved, never block a step and are gone the moment
  // the Horde loses the country (only ground it holds today is strewn).
  //
  // Budget: the spots are worked out once per map, per game day and per level
  // of chaos (a bounded number of throws, HORDE_LITTER_TRIES a piece), and a
  // scene rebuild (a menu closed) only redraws the list it already has. In a
  // goblin world the Horde is the normal order and not an invader, so its
  // towns are far less of a mess: HordeGround.chaos is already scaled for
  // that (WorldModes.hordeIsNormalOrder), so it is not scaled twice here.
  const HORDE_LITTER_FULL = 36;          // pieces at full chaos on a 64x64 map
  const HORDE_LITTER_MAX = 48;
  const HORDE_LITTER_TRIES = 6;
  const HORDE_LITTER_LEAF_SHARE = 0.3;   // the rest is rubbish
  const HORDE_LITTER_ID_BASE = "hordeLitter:"; // i18n-ignore: decal id prefix
  // i18n-ignore-start: Furniture.json category and id fragments
  const HORDE_LITTER_JUNK = { category: "Trash", skipSub: "Bins" };
  const HORDE_LITTER_LEAVES = { category: "Plants", sub: "Leaves" };
  const HORDE_LITTER_SKIP = /wastebasket|kite/;
  // i18n-ignore-end
  let _hordeLitterPieces = null;
  let _hordeLitterMemo = { key: null, list: [] };

  // The decal pieces, rubbish and leaves: 1x1, with an image on disk.
  function hordeLitterPieces() {
    if (_hordeLitterPieces) return _hordeLitterPieces;
    const cat = window.Items?.Furniture || {};
    const imgs = window.Items?.FurnitureImageFolders || null;
    const junk = [], leaves = [];
    for (const id of Object.keys(cat).sort()) {
      const f = cat[id];
      if (!f || f.width !== 1 || f.height !== 1 || HORDE_LITTER_SKIP.test(id)) continue;
      if (imgs && !imgs[id]) continue;
      if (f.category === HORDE_LITTER_JUNK.category && f.subcategory !== HORDE_LITTER_JUNK.skipSub) junk.push(id);
      else if (f.category === HORDE_LITTER_LEAVES.category && f.subcategory === HORDE_LITTER_LEAVES.sub) leaves.push(id);
    }
    if (junk.length || leaves.length) _hordeLitterPieces = { junk, leaves };
    return { junk, leaves };
  }

  // How many pieces this map is strewn with: 0 anywhere but a hand-made
  // exterior on ground the Horde holds today.
  function hordeLitterCount(mapId) {
    const HG = window.HordeGround;
    const WM = window.NPCShared?.WorldModes;
    if (!HG || !$dataMap || (WM && !WM.simulatesPeople())) return 0;
    const procId = window.WorldMapReturn?.procMapId ?? 636;
    if (mapId === procId || /<Interior>/i.test($dataMap.note || "")) return 0; // i18n-ignore: map note tag
    if (!window.SpriteCatalog?.authoredGroupOfMap?.(mapId)) return 0;
    const country = HG.countryOf(mapId);
    if (!country || !HG.holdsCountry(country)) return 0;
    const level = Math.max(0, Math.min(1, Number(HG.chaos(mapId)) || 0));
    const area = Math.max(0.25, Math.min(1.5, (($dataMap.width || 0) * ($dataMap.height || 0)) / 4096));
    return Math.min(HORDE_LITTER_MAX, Math.round(HORDE_LITTER_FULL * level * area));
  }

  // Where the pieces lie on this map today: open, walkable ground with nobody
  // standing on it, dealt off the world seed, the map and the day.
  function hordeLitterFor(mapId) {
    const want = hordeLitterCount(mapId);
    const day = Math.floor((($gameVariables?.value?.(114)) || 0) / 1440);
    const key = mapId + ":" + day + ":" + want;
    if (_hordeLitterMemo.key === key) return _hordeLitterMemo.list;
    const list = [];
    const pieces = want > 0 ? hordeLitterPieces() : null;
    if (pieces && (pieces.junk.length || pieces.leaves.length)) {
      const ws = (window.NPCShared?.worldSeed?.() ?? 19002001) >>> 0;
      const rng = ProceduralManager._creatureRng((Utils.nameHash("hordeLitter:" + key) ^ ws) >>> 0); // i18n-ignore: seed key
      const w = $gameMap.width(), h = $gameMap.height();
      const taken = new Set();
      for (let n = 0; n < want * HORDE_LITTER_TRIES && list.length < want; n++) {
        const x = 1 + Math.floor(rng.next() * Math.max(1, w - 2));
        const y = 1 + Math.floor(rng.next() * Math.max(1, h - 2));
        const at = x + "," + y;
        if (taken.has(at) || !$gameMap.isValid(x, y)) continue;
        if (!ORTHO_DIRS.some(d => $gameMap.isPassable(x, y, d)) || $gameMap.eventsXy(x, y).length) continue;
        const leaf = pieces.leaves.length && (!pieces.junk.length || rng.next() < HORDE_LITTER_LEAF_SHARE);
        const pool = leaf ? pieces.leaves : pieces.junk;
        taken.add(at);
        list.push({ id: HORDE_LITTER_ID_BASE + list.length, furnitureId: pool[Math.floor(rng.next() * pool.length)],
          x, y, flipped: rng.next() < 0.5, _decal: true });
      }
    }
    _hordeLitterMemo = { key, list };
    return list;
  }

  // Lays the decals on a freshly built map spriteset. Answers how many.
  function dressHordeLitter(spriteset) {
    if (!spriteset?.addFurnitureSprite || !$gameMap) return 0;
    let drawn = 0;
    for (const placed of hordeLitterFor($gameMap.mapId())) {
      try { if (spriteset.addFurnitureSprite(placed)) drawn++; } catch (e) { /* one piece short */ }
    }
    return drawn;
  }

  Object.assign(window.NPCSystem._internal, {
    addCampTent, dressHordeLitter, ensureCampGroup, goblinizeMapNPCs, hordeLitterCount, hordeLitterFor,
    partyOnCamp, pitchCamp, refillHordeHomes,
  });
})();
