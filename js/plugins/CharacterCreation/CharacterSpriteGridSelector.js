/*:
 * @target MZ
 * @plugindesc [v2.6] Grid-based character sprite selector with bust selection window.
 * @author OmniLex (Modified by Claude)
 *
 * The board lays itself out from the page it is given (see SPRITE_GRID_COLS);
 * the old GridColumns / GridRows parameters only ever sized a preload batch
 * and are gone with it.
 *
 * @command OpenSpriteSelector
 * @text Open Sprite Selector
 * @desc Opens the grid-based sprite selection UI to pick a sprite for Actor #1.
 *
 * @command OpenSpriteSelectorForActor
 * @text Open Sprite Selector For Actor
 * @desc Opens the sprite selection UI for a specific actor.
 *
 * @arg actorId
 * @text Actor ID
 * @desc The ID of the actor to change the sprite for.
 * @type number
 * @min 1
 * @default 1
 *
 * @command SelectRandomSprite
 * @text Select Random Sprite
 * @desc Randomly selects a sprite for a specific actor without opening the UI.
 *
 * @arg actorId
 * @text Actor ID
 * @desc The ID of the actor to change the sprite for.
 * @type number
 * @min 1
 * @default 1
 */

(() => {
  const pluginName = "CharacterSpriteGridSelector";

  // Bust categories are ids (the bust file name prefix). This is the one place
  // they are shown, so this is the one place they are translated.
  const bustCategoryLabel = (cat) => {
    const key = 'CharCreate.bustCategory.' + cat;
    return T.has(key) ? T(key) : cat;
  };

  // Unified sprite sheet configuration with cutoffs
  // cutoff: max sprite index to include (0 = first sprite only, 7 = all 8 sprites, null = use default)
  const SPRITE_SHEET_CONFIG = {
    "Skab/!$KillerBot": { cutoff: 0 },
    "Skab/!$2": { cutoff: 0 },
    "Skab/!$3": { cutoff: 0 },
    "Skab/!$AirlinePilot": { cutoff: 0 },
    "Skab/!$AlienDargos": { cutoff: 0 },
    "Skab/!$AlienGrey": { cutoff: 0 },
    "Skab/!$AlienTrucker": { cutoff: 0 },
    "Skab/!$AlpineGuide": { cutoff: 0 },
    "Skab/!$Anarchist": { cutoff: 0 },
    "Skab/!$AnarchistSamurai": { cutoff: 0 },
    "Skab/!$11": { cutoff: 0 },
    "Skab/!$AndroidArchpriest": { cutoff: 0 },
    "Skab/!$AndroidExperiment": { cutoff: 0 },
    "Skab/!$14": { cutoff: 0 },
    "Skab/!$Archivist": { cutoff: 0 },
    "Skab/!$ArchivistBackpacker": { cutoff: 0 },
    "Skab/!$AvianCommando": { cutoff: 0 },
    "Skab/!$ArchivistGuard": { cutoff: 0 },
    "Skab/!$19": { cutoff: 0 },
    "Skab/!$AvianNoble": { cutoff: 0 },
    "Skab/!$21": { cutoff: 0 },
    "Skab/!$Farmer": { cutoff: 0 },
    "Skab/!$GoblinRecruit": { cutoff: 0 },
    "Skab/!$GoblinShogun": { cutoff: 0 },
    "Skab/!$BotSpaceman": { cutoff: 0 },
    "Skab/!$BotGuardian": { cutoff: 0 },
    "Skab/!$GnomeExplorer": { cutoff: 0 },
    "Skab/!$28": { cutoff: 0 },
    "Skab/!$Catboy": { cutoff: 0 },
    "Skab/!$CatCourier": { cutoff: 0 },
    "Skab/!$ElvenPirate": { cutoff: 0 },
    "Skab/!$32": { cutoff: 0 },
    "Skab/!$33": { cutoff: 0 },
    "Skab/!$VoidPerson": { cutoff: 0 },
    "Skab/!$Witch1": { cutoff: 0 },
    "Skab/!$SwordInstructor": { cutoff: 0 },
    "Skab/!$Samurai": { cutoff: 0 },
    "Skab/!$SchoolTeacher": { cutoff: 0 },
    "Skab/!$PirateAdventurer": { cutoff: 0 },
    "Skab/!$OrcSamurai": { cutoff: 0 },
    "Skab/!$AncientWitch": { cutoff: 0 },
    "Skab/!$BotSamurai": { cutoff: 0 },
    "Skab/!$DesertPunk": { cutoff: 0 },
    "Skab/!$Doctor2": { cutoff: 0 },
    "Skab/!$ElvenSpacer": { cutoff: 0 },
    "Skab/!$ExoticBard": { cutoff: 0 },
    "Skab/!$Fisherman": { cutoff: 0 },
    "Skab/!$GoblinIllusionist": { cutoff: 0 },
    "Skab/!$HighCommand": { cutoff: 0 },
    "Skab/!$LeatherDaddy": { cutoff: 0 },
    "Skab/!$Lich": { cutoff: 0 },
    "Skab/!$Madman": { cutoff: 0 },
    "Skab/!$Mafia": { cutoff: 0 },
    "Skab/!$Nurse2": { cutoff: 0 },
    "Skab/!$PrimaryDoctor": { cutoff: 0 },
    "Skab/!$WastelandParamedic": { cutoff: 0 },
  };

  // Sprite sheets offered in the grid are driven by NPCs.json. window.WorldGen.NPCs
  // is loaded synchronously by DataService before plugin IIFEs run (same source
  // the NPCSystem character pool uses). SPRITE_SHEET_CONFIG is kept only as an
  // optional per-sheet cutoff override (see loop below); it no longer decides
  // which sheets appear. Falls back to the config keys if the DB is unavailable.
  // TWO rules decide what is on the board: "npc": true, and not a beast. The
  // sheets a flag sets apart are on it too, but each is dealt AFTER every
  // ordinary sheet under its own header (see SPRITE_BLOCKS), so the top of the
  // board is always the curated set. The grid lazy-loads a page at a time, so
  // the longer list costs nothing to enter.
  const npcDatabase = window.WorldGen && window.WorldGen.NPCs;

  // The rail's captions. One word apiece, so the row reads as a row of tabs
  // rather than a paragraph, and localised rather than written here: the id is
  // what NPCs.json is tagged with, the caption is what the tab shows.
  const spriteTabLabel = (id, fallback) => {
    const key = 'CharCreate.spriteTab.' + id;
    return T.has(key) ? T(key) : fallback;
  };

  // Both halves of a catalogued body. A sheet may be spliced from a second
  // archetype (NPCs.json SecondaryArchetype), and every rail that asks what a
  // sheet is made of asks about the pair, not the primary alone.
  const archetypesOf = (e) => [e && e.Archetype, e && e.SecondaryArchetype].filter(Boolean);

  const SPRITE_TABS = [
    { id: "all", label: spriteTabLabel("all", "All"), match: (e) => true },

    // The Monsters folder itself, read off the disk rather than out of
    // NPCs.json: those sheets are enemy art and are not catalogued as NPCs, so
    // nothing else on this rail would ever offer them. It is the board a
    // creature opens on (see create()), and only a creature is shown it.
    { id: "monsters", label: spriteTabLabel("monsters", "Monsters"), folder: "Monsters" },

    // Special Entity Types (from NPCs.json flags)
    { id: "aliens", label: spriteTabLabel("aliens", "Aliens"), match: (e) => !!(e.aliens || e.alien) },
    { id: "animals", label: spriteTabLabel("animals", "Animals"), match: (e) => !!(e.animals || e.animal || archetypesOf(e).some((a) => ["Beast", "Bird", "Rabbit", "Horse"].includes(a))) },
    { id: "creatures", label: spriteTabLabel("creatures", "Creatures"), match: (e) => !!(e.creatures || e.creature || archetypesOf(e).some((a) => ["Slime", "ChestMimic", "Mushroom", "Spherical", "Mutant", "Frog"].includes(a))) },
    { id: "varlenian", label: spriteTabLabel("varlenian", "Varlenian"), match: (e) => !!e.varlenian },
    { id: "undead", label: spriteTabLabel("undead", "Undead"), match: (e) => !!(e.zombie || archetypesOf(e).some((a) => ["Undead", "Ghost", "ConstructedUndead"].includes(a))) },

    // Archetypes (from NPCs.json Archetype)
    // The peoples are one archetype now: an elf, a goblin, a dwarf and an ogre
    // are humanoids, so these four rails are read off the sheet's own name (the
    // second argument every match is handed) instead of an archetype that no
    // longer exists. A secondary archetype counts as much as the primary: a
    // sheet spliced with a beast belongs on that beast's rail too.
    { id: "humanoid", label: spriteTabLabel("humanoid", "Humanoid"), match: (e) => !e.Archetype || e.Archetype === "Humanoid" },
    { id: "elven", label: spriteTabLabel("elven", "Elven"), match: (e, key) => /elven|elf/i.test(key || "") },
    { id: "goblin", label: spriteTabLabel("goblin", "Goblin"), match: (e, key) => /goblin/i.test(key || "") },
    { id: "dwarves", label: spriteTabLabel("dwarves", "Dwarves"), match: (e, key) => /dwarf|dwarven/i.test(key || "") || archetypesOf(e).includes("Gnome") },
    { id: "insectoid", label: spriteTabLabel("insectoid", "Insectoid"), match: (e) => archetypesOf(e).some((a) => ["Insectoid", "Crustacean", "Frog"].includes(a)) },
    { id: "demons", label: spriteTabLabel("demons", "Demons"), match: (e, key) => archetypesOf(e).includes("Demon") || /ogre/i.test(key || "") },

    // Humanoid themes (from the NPCs.json "theme" tag, one word apiece)
    { id: "space", label: spriteTabLabel("space", "Space"), match: (e) => e.theme === "Space" },
    { id: "arcane", label: spriteTabLabel("arcane", "Arcane"), match: (e) => e.theme === "Arcane" || e.magical === true },
    { id: "military", label: spriteTabLabel("military", "Military"), match: (e) => e.theme === "Military" },
    { id: "underworld", label: spriteTabLabel("underworld", "Underworld"), match: (e) => e.theme === "Underworld" },
    { id: "urban", label: spriteTabLabel("urban", "Urban"), match: (e) => e.theme === "Urban" },
    { id: "nobility", label: spriteTabLabel("nobility", "Nobility"), match: (e) => e.theme === "Nobility" },
    { id: "wilderness", label: spriteTabLabel("wilderness", "Wilderness"), match: (e) => e.theme === "Wilderness" },
    { id: "bards", label: spriteTabLabel("bards", "Bards"), match: (e) => e.theme === "Bards" }
  ];


  // ---------------------------------------------------------------------------
  // The Monsters folder, scanned once per session. Every sheet in it is a
  // single-character "$" sheet, so index 0 is the whole entry; the caption is
  // the file name with its "$"/"!" markers stripped and its CamelCase split,
  // which is the name the creature board shows for the same art.
  // ---------------------------------------------------------------------------
  const MONSTER_FOLDER = "Monsters";
  let monsterFolderCache = null;

  const monsterFolderOptions = () => {
    if (monsterFolderCache) return monsterFolderCache;
    const out = [];
    const fs = nodeRequire("fs");
    const path = nodeRequire("path");
    const root = gameRoot();
    if (fs && path && root) {
      try {
        const dir = path.join(root, SPRITE_DIR, MONSTER_FOLDER);
        for (const file of fs.readdirSync(dir)) {
          if (!/\.(png|jpg|jpeg|webp)$/i.test(file)) continue;
          const base = file.replace(/\.[^.]+$/, "");
          out.push({
            name: MONSTER_FOLDER + "/" + base,
            index: 0,
            tabId: "monsters",
            label: decamelCase(base.replace(/[!$]/g, "")),
          });
        }
      } catch (e) {
        out.length = 0;
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    monsterFolderCache = out;
    return out;
  };

  function getTabIdForSheet(sheetName) {
    if (String(sheetName || "").startsWith(MONSTER_FOLDER + "/")) return "monsters";
    const db = (window.WorldGen && window.WorldGen.NPCs) || npcDatabase || {};
    const entry = db[sheetName] || {};
    for (const tab of SPRITE_TABS) {
      if (tab.id !== "all" && tab.match && tab.match(entry, sheetName)) {
        return tab.id;
      }
    }
    return "all";
  }

  // A beast sheet is a beast: only the creature branch of the wizard may wear
  // one. the animal flag in NPCs.json is the whole test, so an anthropomorphic sheet
  // (an avian commando, a goat bard) stays on the board for humanoids.
  const isAnimalSheet = (name) => {
    const db = (window.WorldGen && window.WorldGen.NPCs) || npcDatabase || {};
    const entry = db[name] || {};
    return entry.animal === true || entry.animals === true;
  };

  // A creature party member's map sprite is a body, not a face: only the
  // sheets NPCs.json flags as an animal or a monster (the "Creatures" and
  // "Animals" folders) are ever a creature's own walk. The rest of the
  // catalogue is every humanoid NPC sheet in the game, which a sculpted
  // monster has no business wearing.
  const isCreatureOrAnimalSheet = (name) => {
    const db = (window.WorldGen && window.WorldGen.NPCs) || npcDatabase || {};
    const entry = db[name] || {};
    return entry.animal === true || entry.animals === true ||
      entry.creature === true || entry.creatures === true;
  };

  // Whether the character the board is being opened for is a creature. The
  // wizard marks its member three ways over its life: the actor flag, the mode
  // of the running scene, and the per member switch it sets first.
  const audienceIsCreature = (actorId) => {
    const actor = (typeof $gameActors !== "undefined" && $gameActors)
      ? $gameActors.actor(actorId) : null;
    if (actor && actor._isCreatureActor) return true;
    const CC = window.Scene_CharacterCreation;
    if (CC && CC._isCreatureMode) return true;
    const memberIndex = (actorId || 1) - 1;
    if (memberIndex >= 0 && memberIndex < 3 &&
        typeof $gameSwitches !== "undefined" && $gameSwitches &&
        $gameSwitches.value(77 + memberIndex)) {
      return true;
    }
    return false;
  };

  // The board as one character may see it: a humanoid is never offered an
  // animal sheet, and a creature is only ever offered the animal/monster
  // sheets, never one of the game's humanoid NPCs.
  const optionsForAudience = (options, allowAnimals) => {
    if (allowAnimals) return (options || []).filter((o) => isCreatureOrAnimalSheet(o.name));
    return (options || []).filter((o) => !isAnimalSheet(o.name));
  };

  const populationMode = () => {
    const pop = (window.SpriteCatalog && window.SpriteCatalog.populationMode)
      ? window.SpriteCatalog.populationMode() : "normal";
    const magic = (window.MagicNature && window.MagicNature.level()) || "normal";
    return pop + ":" + magic;
  };
  const allowedSheet = (name) => {
    const db = (window.WorldGen && window.WorldGen.NPCs) || npcDatabase;
    const entry = db && db[name];
    if (entry && entry.beta === true) return false; // Hide beta sprites completely
    // A VIP sheet is a named person's face: it belongs to the dossier that
    // carries it, not to anyone who opens the board.
    if (entry && entry.vip === true) return false;
    const SC = window.SpriteCatalog;
    if (!SC) return true;
    if (SC.allowedInMagic && !SC.allowedInMagic(name, entry)) return false;
    if (SC.allowedInPopulation && !SC.allowedInPopulation(name, entry)) return false;
    return true;
  };

  const spriteSheets = [];
  function rebuildSpriteSheets() {
    spriteSheets.length = 0;
    const db = (window.WorldGen && window.WorldGen.NPCs) || npcDatabase;
    const offered = (db
      ? Object.keys(db)
      : Object.keys(SPRITE_SHEET_CONFIG)
    ).filter(allowedSheet);
    for (const name of offered) {
      spriteSheets.push(name);
    }
  }
  rebuildSpriteSheets();

  const spriteOptions = [];
  const tabSpriteOptionsMap = {};
  SPRITE_TABS.forEach(t => { tabSpriteOptionsMap[t.id] = []; });

  const decamelCase = (str) => {
    if (!str) return "";
    return str
      .replace(/_/g, " ")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
  };

  function rebuildSpriteOptions() {
    spriteOptions.length = 0;
    SPRITE_TABS.forEach(t => { tabSpriteOptionsMap[t.id] = []; });
    const db = (window.WorldGen && window.WorldGen.NPCs) || npcDatabase || {};

    for (const name of spriteSheets) {
      const config = SPRITE_SHEET_CONFIG[name];
      let cutoffIndex = config && config.cutoff !== null ? config.cutoff : null;
      if (cutoffIndex === null) {
        cutoffIndex = name.includes("$") ? 0 : 7;
      } else {
        if (name.includes("$")) {
          cutoffIndex = 0;
        } else if (cutoffIndex > 7) {
          cutoffIndex = 7;
        }
      }

      const entry = db[name] || {};
      if (entry.beta === true) continue; // Extra safety: skip any beta sprite

      for (let index = 0; index <= cutoffIndex; index++) {
        const item = { name: name, index: index, tabId: "all" };
        spriteOptions.push(item);
        for (const tab of SPRITE_TABS) {
          if (tab.id === "all" || (tab.match && tab.match(entry, name))) {
            tabSpriteOptionsMap[tab.id].push(item);
          }
        }
      }
    }
  }
  rebuildSpriteOptions();

  // Function to select a random sprite from available options
  function selectRandomSprite(actorId) {
    rebuildSpriteBoard();
    if (!spriteOptions || spriteOptions.length === 0) {
      return undefined;
    }

    const actor = $gameActors.actor(actorId);
    let pool = optionsForAudience(spriteOptions, audienceIsCreature(actorId));
    if (pool.length === 0) pool = spriteOptions;

    const randomIndex = Math.floor(Math.random() * pool.length);
    const randomSprite = pool[randomIndex];

    if (actor) {
      actor.setCharacterImage(randomSprite.name, randomSprite.index);
      const bust = bustForSprite(randomSprite.name, randomSprite.index);
      if (bust) {
        actor.setVnBust(bust);
        if (actor.setPortraitMode) actor.setPortraitMode("bust");
      } else if (window.selectRandomBustForActor) {
        window.selectRandomBustForActor(actorId);
      }
      const leader = $gameParty && $gameParty.leader();
      if (leader && actorId === leader.actorId()) {
        $gamePlayer.refresh();
      }
    }

    return randomSprite;
  }

  const SPRITE_GRID_COLS = 6;
  const SPRITE_GRID_SIZE = 96;
  const SPRITE_MIN_FRAME_HEIGHT = 36;

  const spriteFrameGeometry = (spriteName) => {
    const isBig = ImageManager.isBigCharacter(spriteName);
    const bitmap = spriteName ? ImageManager.loadCharacter(spriteName) : null;
    const ready = !!bitmap && bitmap.width > 0 && bitmap.height > 0;
    const cols = isBig ? 3 : 12;
    let rows = isBig ? 4 : 8;
    if (ready && isBig && bitmap.height / rows < SPRITE_MIN_FRAME_HEIGHT) {
      rows = 1;
    }
    return {
      isBig,
      ready,
      bitmap,
      cols,
      rows,
      dirRows: isBig ? rows : 4,
      frameW: ready ? bitmap.width / cols : 0,
      frameH: ready ? bitmap.height / rows : 0,
    };
  };

  const spriteFrameBackground = (geo, spriteIndex, pattern, directionRow) => {
    const dir = geo.dirRows > 0 ? directionRow % geo.dirRows : 0;
    let fx;
    let fy;
    if (geo.isBig) {
      fx = pattern;
      fy = dir;
    } else {
      fx = (spriteIndex % 4) * 3 + pattern;
      fy = Math.floor(spriteIndex / 4) * 4 + dir;
    }
    const pctX = geo.cols > 1 ? (fx / (geo.cols - 1)) * 100 : 0;
    const pctY = geo.rows > 1 ? (fy / (geo.rows - 1)) * 100 : 0;
    return {
      position: `${pctX}% ${pctY}%`,
      size: `${geo.cols * 100}% ${geo.rows * 100}%`,
    };
  };

  const spriteFrameBox = (geo, box) => {
    if (!geo.ready) return { width: box, height: box };
    const scale = Math.min(box / geo.frameW, box / geo.frameH);
    return {
      width: Math.round(geo.frameW * scale),
      height: Math.round(geo.frameH * scale),
    };
  };

  const SPRITE_DIR = "img/characters/";
  const SPRITE_GRID_GAP = 10;
  const SPRITE_GRID_OVERSCAN = 1;
  const SPRITE_CELL_H = SPRITE_GRID_SIZE + 16;
  const SPRITE_WALK_FRAMES = 12;
  const SPRITE_TURN_FRAMES = 48;
  const SPRITE_HEADER_H = 36;

  const spriteRows = [];
  const spriteRowOfIndex = [];
  let spriteCanvasH = 0;

  function rebuildTabRows(options) {
    spriteRows.length = 0;
    spriteRowOfIndex.length = 0;
    const count = options ? options.length : 0;
    for (let i = 0; i < count; i++) spriteRowOfIndex.push(0);

    let top = 0;
    for (let i = 0; i < count; i += SPRITE_GRID_COLS) {
      const last = Math.min(count - 1, i + SPRITE_GRID_COLS - 1);
      for (let k = i; k <= last; k++) spriteRowOfIndex[k] = spriteRows.length;
      spriteRows.push({ from: i, to: last, top });
      top += SPRITE_CELL_H + SPRITE_GRID_GAP;
    }
    spriteCanvasH = Math.max(0, top - SPRITE_GRID_GAP);
  }

  function filterBustCategories(categories) {
    const SC = window.SpriteCatalog;
    if (!SC || typeof SC.bustAllowedInPopulation !== "function") return categories;
    if (!SC.allowedBustNames || !SC.allowedBustNames()) return categories;
    const out = {};
    let kept = 0;
    for (const cat of Object.keys(categories || {})) {
      out[cat] = (categories[cat] || []).filter((n) => SC.bustAllowedInPopulation(n));
      kept += out[cat].length;
    }
    return kept ? out : categories;
  }

  let boardPopulationMode = populationMode();
  function rebuildSpriteBoard() {
    const mode = populationMode();
    if (mode === boardPopulationMode && spriteOptions.length) return;
    boardPopulationMode = mode;
    rebuildSpriteSheets();
    rebuildSpriteOptions();
  }

  // Sheet names carry a folder and characters like "!$", which a path keeps
  // but a url must escape. encodeURI leaves the slash alone.
  const spriteSheetUrl = (name) => `${SPRITE_DIR}${encodeURI(name)}.png`;

  const spriteFrameKey = (name, index) => `${name}#${index}`;

  // Leaving a gallery is the same gesture everywhere: ESC on a keyboard, B on
  // a pad, and the right mouse button, which the galleries did not read at all
  // (their pages are DOM, so nothing else was going to answer it for them).
  const cancelPressed = () =>
    Input.isTriggered("cancel") || Input.isTriggered("escape") || TouchInput.isCancelled();

  // The bust a sheet is drawn with, if it has one. NPCs.json carries one entry
  // per sprite index; a sheet with a single bust lends it to every index.
  const bustForSprite = (name, index) => {
    let busts = null;
    if (window.SpriteCatalog && window.SpriteCatalog.busts) {
      busts = window.SpriteCatalog.busts(name);
    }
    if ((!busts || !busts.length) && window.Sprites && window.Sprites.SpritesAssociation) {
      busts = window.Sprites.SpritesAssociation[name];
    }
    if (!busts || !busts.length) return null;
    return busts[index] !== undefined && busts[index] !== null ? busts[index] : busts[0];
  };

  // Paints one frame of a sheet onto an element, and answers whether it could.
  // Until the bitmap can report its real frame the element is left blank and
  // the paint repeats when the sheet arrives: writing a guessed size first and
  // correcting it after is what made every sprite squash and snap.
  const paintSpriteFrame = (el, name, index, box, pattern, directionRow) => {
    if (!el) return false;
    const key = spriteFrameKey(name, index);
    el.dataset.sprite = key;
    const geo = spriteFrameGeometry(name);
    if (!geo.ready) {
      el.style.removeProperty("--cc-sprite-url");
      el.classList.remove("cc-visible");
      if (geo.bitmap) {
        geo.bitmap.addLoadListener(() => {
          // The element may have been recycled onto another sheet meanwhile.
          if (el.dataset.sprite !== key) return;
          paintSpriteFrame(el, name, index, box, pattern, directionRow);
        });
      }
      return false;
    }
    const frame = spriteFrameBackground(geo, index, pattern, directionRow);
    const size = spriteFrameBox(geo, box);
    el.style.setProperty("--cc-sprite-w", `${size.width}px`);
    el.style.setProperty("--cc-sprite-h", `${size.height}px`);
    el.style.setProperty("--cc-sprite-url", window.CCArt.url(spriteSheetUrl(name)));
    el.style.setProperty("--cc-sprite-pos", frame.position);
    el.style.setProperty("--cc-sprite-zoom", frame.size);
    el.classList.add("cc-visible");
    return true;
  };

  class Scene_SpriteGridSelector extends Scene_MenuBase {
    constructor() {
      super();
      this._actorId = Scene_SpriteGridSelector._actorId || 1;
    }

    static setup(actorId, returnSceneClass) {
      Scene_SpriteGridSelector._actorId = actorId || 1;
      Scene_SpriteGridSelector._returnSceneClass = returnSceneClass || null;
    }

    setActor(actorId) {
      this._actorId = actorId || 1;
      Scene_SpriteGridSelector._actorId = this._actorId;
    }

    create() {
      if (Scene_SpriteGridSelector._actorId) {
        this._actorId = Scene_SpriteGridSelector._actorId;
      } else if (window.Scene_CharacterCreation &&
          window.Scene_CharacterCreation._interruptedStep >= 0) {
        this._actorId = (window.Scene_CharacterCreation._currentPartyMemberIndex || 0) + 1;
      }

      rebuildSpriteBoard();

      super.create();
      this._alive = true;
      this._cells = new Map();
      this._pool = [];
      this._headerEls = [];
      this._cellW = 0;
      this._gridDirty = true;
      this._needsCursorScroll = false;
      this._pattern = 1;
      this._direction = 0;
      this._wasd = { up: false, down: false, left: false, right: false };

      const actor = $gameActors.actor(this._actorId);
      this.scopeBoardToActor();
      const currentSheet = actor ? actor.characterName() : "";
      const currentTab = currentSheet ? getTabIdForSheet(currentSheet) : null;
      const validTabs = this.validTabs();
      // A creature opens on the Monsters folder: that is the art a monster
      // walks around in, and hunting for it in the rail was the first thing
      // the board asked of a player who had just sculpted one.
      const creatureDefault = audienceIsCreature(this._actorId) &&
        this.tabOptions("monsters").length > 0 ? "monsters" : null;
      this._activeTabId = (currentTab && this.tabOptions(currentTab).length > 0)
        ? currentTab
        : (creatureDefault || (validTabs[0] ? validTabs[0].id : "all"));

      const activeOpts = this.activeOptions();
      let foundIdx = 0;
      if (actor) {
        const matchIdx = activeOpts.findIndex(o => o.name === actor.characterName() && o.index === actor.characterIndex());
        if (matchIdx >= 0) foundIdx = matchIdx;
      }
      this._index = foundIdx;
      rebuildTabRows(activeOpts);

      this.bindKeys();
      this.buildOverlay();
      this.refreshSelection();
    }

    // The board this character is allowed to see, cut once on the way in: a
    // humanoid never gets the animal sheets, tab counts included.
    scopeBoardToActor() {
      // A board opened for one character in particular - the story mode's
      // dossiers, which are a class and a set of looks that belong to it -
      // offers that character's own sheets and nothing else. The audience cut
      // is skipped there on purpose: the list was chosen for this character
      // already, and a slime's own sheets would not survive a humanoid's
      // filter. If not one of them is available (a world that hides them), the
      // whole board stands rather than an empty one.
      const only = Scene_SpriteGridSelector._restrictToSheets;
      if (Array.isArray(only) && only.length > 0) {
        const allowed = new Set(only);
        const narrowed = spriteOptions.filter((o) => allowed.has(o.name));
        if (narrowed.length > 0) {
          this._allOptions = narrowed;
          this._tabOptions = {};
          for (const tab of SPRITE_TABS) {
            this._tabOptions[tab.id] = tab.id === "all" ? narrowed : [];
          }
          return;
        }
      }
      const allowAnimals = audienceIsCreature(this._actorId);
      // The Monsters folder is a creature's own art and no one else's, so a
      // humanoid never sees the tab at all (an empty tab is dropped from the
      // rail by validTabs).
      const monsters = allowAnimals ? monsterFolderOptions() : [];
      this._allOptions = optionsForAudience(spriteOptions, allowAnimals).concat(monsters);
      this._tabOptions = {};
      for (const tab of SPRITE_TABS) {
        if (tab.id === "monsters") {
          this._tabOptions[tab.id] = monsters;
        } else if (tab.id === "all") {
          this._tabOptions[tab.id] = this._allOptions;
        } else {
          this._tabOptions[tab.id] = optionsForAudience(tabSpriteOptionsMap[tab.id] || [], allowAnimals);
        }
      }
    }

    tabOptions(tabId) {
      return (this._tabOptions && this._tabOptions[tabId]) || [];
    }

    validTabs() {
      return SPRITE_TABS.filter(t => this.tabOptions(t.id).length > 0);
    }

    activeOptions() {
      return this.tabOptions(this._activeTabId);
    }

    //-- lifecycle ------------------------------------------------------------

    bindKeys() {
      this._wasdListener = (event) => {
        if (!this._alive) return;
        const key = String(event.key || "").toLowerCase();
        const dir = { w: "up", s: "down", a: "left", d: "right" }[key];
        if (!dir) return;
        this._wasd[dir] = true;
        event.preventDefault();
      };
      window.addEventListener("keydown", this._wasdListener);
      this._resizeListener = () => {
        this._cellW = 0;
        this._gridDirty = true;
      };
      window.addEventListener("resize", this._resizeListener);
    }

    terminate() {
      super.terminate();
      this._alive = false;
      // A narrowed board is narrowed for the one character it was opened for.
      Scene_SpriteGridSelector._restrictToSheets = null;
      if (window.CCNav) window.CCNav.detach(this);
      if (window.CCTransitionVeil) window.CCTransitionVeil.hide();
      window.removeEventListener("keydown", this._wasdListener);
      window.removeEventListener("resize", this._resizeListener);
      this._cells.clear();
      this._pool.length = 0;
      this._headerEls = [];
      if (this._overlay) {
        this._overlay.innerHTML = "";
        window.CCPanel.hide(this._overlay);
      }
    }

    //-- the page -------------------------------------------------------------

    buildOverlay() {
      let container = document.getElementById("character-creation-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "character-creation-container";
        document.body.appendChild(container);
      }
      if (window._ccOverlayTimeout) {
        clearTimeout(window._ccOverlayTimeout);
        window._ccOverlayTimeout = null;
      }
      this._overlay = container;
      window.CCPanel.show(container);
      container.innerHTML = "";
      if (window.CCScroll) window.CCScroll.bindWheel(container);

      const validTabs = this.validTabs();
      const tabsHtml = validTabs.map(t => {
        const count = this.tabOptions(t.id).length;
        const isActive = t.id === this._activeTabId;
        return `<button class="cc-sprite-tab-btn ${isActive ? 'active' : ''}" data-tab="${t.id}">${t.label} <span class="cc-sprite-tab-count">(${count})</span></button>`;
      }).join("");

      // Shape B, the panel: the gallery is a modal over whatever opened it,
      // and it is the same modal the bust gallery draws. Header bar with the
      // one Back, the tab rail, the windowed board, and the action strip.
      container.innerHTML = `
        <div class="ui-overlay cc-gal-overlay">
          <div class="ui-panel cc-gal-panel">
            <div class="page-header-bar page-header-bar--compact">
              <button class="back-button cc-gal-back">${T("CharCreate.back")}</button>
              <div class="title">${T("CharCreate.selectSprite")}</div>
            </div>
            <div class="cc-sprite-tab-bar cc-gal-tabs">${tabsHtml}</div>
            <div class="ui-panel-body cc-gal-board cc-gal-board--sprite">
              <div class="cc-gal-canvas"></div>
            </div>
          </div>
        </div>
      `;

      this._gridEl = container.querySelector(".cc-gal-board");
      this._canvasEl = container.querySelector(".cc-gal-canvas");

      // No Continue: picking a sprite IS the answer, and the gallery closes on
      // it. Back (and cancel) leave without picking.
      const backEl = container.querySelector(".cc-gal-back");
      if (backEl) backEl.addEventListener("click", () => {
        SoundManager.playCancel();
        this.leaveWithoutPicking();
      });

      const tabBar = container.querySelector(".cc-sprite-tab-bar");
      if (tabBar) {
        tabBar.addEventListener("click", (event) => {
          const btn = event.target.closest(".cc-sprite-tab-btn");
          if (btn && btn.dataset.tab) {
            SoundManager.playCursor();
            this.switchTab(btn.dataset.tab);
          }
        });
      }

      this._gridEl.addEventListener("click", (event) => {
        const card = event.target.closest(".cc-sprite-card");
        if (card) this.onSpriteCardClick(Number(card.dataset.index));
      });
      this._gridEl.addEventListener("mousemove", (event) => {
        const card = event.target.closest(".cc-sprite-card");
        if (card) this.onSpriteCardHover(Number(card.dataset.index));
      });
      this._gridEl.addEventListener("scroll", () => {
        this._gridDirty = true;
      });

      // The buttons under the board are not cards, so the grid cursor cannot
      // reach them. The focus ring can. See CharacterCreationNav.js.
      if (window.CCNav) window.CCNav.attach(this, this._overlay);

      if (window.CCTransitionVeil) window.CCTransitionVeil.hide();
    }

    // The ring hands the board back when it walks off its own top or left edge.
    onNavLeave() {
      this.refreshSelection();
    }

    // Step off the board and onto the page's own buttons, if there is anything
    // over there to land on.
    _ccEnterNav(dir) {
      return !!window.CCNav && window.CCNav.tryEnterFromBoard(dir);
    }

    switchTab(tabId) {
      if (this._activeTabId === tabId) return;
      this._activeTabId = tabId;
      if (this._overlay) {
        const btns = this._overlay.querySelectorAll(".cc-sprite-tab-btn");
        btns.forEach(btn => {
          btn.classList.toggle("active", btn.dataset.tab === tabId);
        });
      }
      this._index = 0;
      if (this._gridEl) this._gridEl.scrollTop = 0;
      rebuildTabRows(this.activeOptions());
      this._cells.forEach((cell) => {
        cell.remove();
        this._pool.push(cell);
      });
      this._cells.clear();
      this._cellW = 0;
      this._gridDirty = true;
      this.refreshSelection();
    }

    //-- the virtualised grid -------------------------------------------------

    measureGrid() {
      const width = this._gridEl.clientWidth - 4;
      if (width <= 0) return false;
      this._cellW = Math.floor(
        (width - SPRITE_GRID_GAP * (SPRITE_GRID_COLS - 1)) / SPRITE_GRID_COLS,
      );
      this._canvasEl.style.setProperty("--cc-canvas-h", `${spriteCanvasH}px`);
      return true;
    }

    takeCell() {
      const cell = this._pool.pop();
      if (cell) return cell;
      const card = document.createElement("div");
      card.className = "cc-gal-cell cc-sprite-card";
      const art = document.createElement("div");
      art.className = "cc-gal-art cc-gal-art--sprite";
      card.appendChild(art);
      card._art = art;
      // Only the sheets that carry a caption of their own (the Monsters
      // folder) show one; the NPC sheets stay art and nothing else.
      const name = document.createElement("div");
      name.className = "cc-gal-cell-name";
      card.appendChild(name);
      card._name = name;
      return card;
    }

    renderGrid() {
      if (!this._cellW && !this.measureGrid()) {
        this._gridDirty = true;
        return;
      }
      const opts = this.activeOptions();
      const total = opts.length;
      if (!total) {
        for (const [index, cell] of this._cells) {
          cell.remove();
          this._pool.push(cell);
          this._cells.delete(index);
        }
        return;
      }
      if (this._needsCursorScroll) {
        this._needsCursorScroll = false;
        this.scrollCursorIntoView();
      }
      const rowHeight = SPRITE_CELL_H + SPRITE_GRID_GAP;
      const top = this._gridEl.scrollTop - SPRITE_GRID_OVERSCAN * rowHeight;
      const bottom =
        this._gridEl.scrollTop + this._gridEl.clientHeight + SPRITE_GRID_OVERSCAN * rowHeight;
      let from = -1;
      let to = -1;
      for (const row of spriteRows) {
        if (row.top + SPRITE_CELL_H < top) continue;
        if (row.top > bottom) break;
        if (from < 0) from = row.from;
        to = row.to;
      }
      if (from < 0) {
        for (const [index, cell] of this._cells) {
          cell.remove();
          this._pool.push(cell);
          this._cells.delete(index);
        }
        return;
      }
      to = Math.min(total - 1, to);

      for (const [index, cell] of this._cells) {
        if (index < from || index > to) {
          cell.remove();
          this._pool.push(cell);
          this._cells.delete(index);
        }
      }

      for (let index = from; index <= to; index++) {
        if (this._cells.has(index)) {
          this.placeCell(this._cells.get(index), index);
          continue;
        }
        const cell = this.takeCell();
        this._cells.set(index, cell);
        this.fillCell(cell, index);
        this.placeCell(cell, index);
        this._canvasEl.appendChild(cell);
      }
    }

    placeCell(cell, index) {
      const row = spriteRows[spriteRowOfIndex[index]];
      const col = row ? index - row.from : 0;
      cell.style.setProperty("--cc-cell-x", `${col * (this._cellW + SPRITE_GRID_GAP)}px`);
      cell.style.setProperty("--cc-cell-y", `${row ? row.top : 0}px`);
      cell.style.setProperty("--cc-cell-w", `${this._cellW}px`);
      cell.style.setProperty("--cc-cell-h", `${SPRITE_CELL_H}px`);
      cell.classList.toggle("selected", index === this._index);
    }

    fillCell(cell, index) {
      const entry = this.activeOptions()[index];
      if (!entry) return;
      cell.dataset.index = String(index);
      cell.title = entry.label || decamelCase(entry.name.replace(/^.*\//, "").replace(/[!$]/g, ""));
      if (cell._name) {
        cell._name.textContent = entry.label || "";
        cell._name.classList.toggle("ui-closed", !entry.label);
      }
      const walking = index === this._index;
      paintSpriteFrame(
        cell._art,
        entry.name,
        entry.index,
        SPRITE_GRID_SIZE,
        walking ? this._pattern : 1,
        walking ? this._direction : 0,
      );
    }

    scrollCursorIntoView() {
      // The pointer already put the cursor where it wants it: scrolling now
      // would drag the board out from under the card being hovered.
      if (this._skipCursorScroll) return;
      const pane = this._gridEl;
      if (!this._cellW || pane.clientHeight <= 0) {
        this._needsCursorScroll = true;
        return;
      }
      const row = spriteRows[spriteRowOfIndex[this._index]];
      if (!row) return;
      const top = row.top;
      if (top < pane.scrollTop) pane.scrollTop = top;
      else if (top + SPRITE_CELL_H > pane.scrollTop + pane.clientHeight) {
        pane.scrollTop = top + SPRITE_CELL_H - pane.clientHeight;
      }
    }

    //-- selection ------------------------------------------------------------

    selectedEntry() {
      const opts = this.activeOptions();
      return opts[this._index] || null;
    }

    refreshSelection() {
      const entry = this.selectedEntry();
      if (!entry) return;
      for (const [index, cell] of this._cells) {
        const wasSelected = cell.classList.contains("selected");
        const isSelected = index === this._index;
        cell.classList.toggle("selected", isSelected);
        if (wasSelected && !isSelected) {
          const other = this.activeOptions()[index];
          if (other) {
            paintSpriteFrame(cell._art, other.name, other.index, SPRITE_GRID_SIZE, 1, 0);
          }
        }
      }
      this.scrollCursorIntoView();
      this.paintAnimated(true);
    }

    // The selected sprite walks in place on its card.
    paintAnimated(force) {
      const entry = this.selectedEntry();
      if (!entry) return;
      const frame = Math.floor(Graphics.frameCount / SPRITE_WALK_FRAMES) % 4;
      const pattern = frame === 3 ? 1 : frame;
      const direction = Math.floor(Graphics.frameCount / SPRITE_TURN_FRAMES) % 4;
      if (!force && pattern === this._pattern && direction === this._direction) return;
      this._pattern = pattern;
      this._direction = direction;
      const cell = this._cells.get(this._index);
      if (cell) {
        paintSpriteFrame(cell._art, entry.name, entry.index, SPRITE_GRID_SIZE, pattern, direction);
      }
    }

    // One click is the whole interaction: the sprite clicked is the sprite
    // taken, and the gallery closes on it. It used to need a click to move the
    // cursor, a second on the same card to confirm, or a trip to the Continue
    // button that is no longer there.
    // The right page follows the pointer: the card under the mouse is the one
    // shown at full size, bust and all, before anything is committed.
    onSpriteCardHover(index) {
      const opts = this.activeOptions();
      if (!(index >= 0) || index >= opts.length || index === this._index) return;
      this._index = index;
      this._skipCursorScroll = true;
      this.refreshSelection();
      this._skipCursorScroll = false;
    }

    onSpriteCardClick(index) {
      const opts = this.activeOptions();
      if (!(index >= 0) || index >= opts.length) return;
      this._index = index;
      this.refreshSelection();
      this.onSpriteConfirm();
    }

    onSpriteConfirm() {
      this.onSpriteSelected();
    }

    //-- input ----------------------------------------------------------------

    ccScrollTarget() {
      return this._gridEl;
    }

    // L1 / R1 step through the category rail from anywhere on the board, the
    // same shoulder buttons that step through the backpack's pockets. TAB does
    // it too, for a keyboard.
    cycleTab(direction) {
      const tabs = this.validTabs();
      if (tabs.length < 2) return;
      const cur = Math.max(0, tabs.findIndex((t) => t.id === this._activeTabId));
      const next = (cur + direction + tabs.length) % tabs.length;
      SoundManager.playCursor();
      this.switchTab(tabs[next].id);
      const bar = this._overlay && this._overlay.querySelector(".cc-sprite-tab-bar");
      const active = bar && bar.querySelector(".cc-sprite-tab-btn.active");
      if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }

    updateInput() {
      // The ring owns the buttons under the board whenever it is up, and is
      // read first so one press never moves two cursors.
      if (window.CCNav && window.CCNav.update()) return;
      // L1/PageUp back, R1/PageDown and Tab forward, Shift+Tab back. See
      // CCNav.railDir(), which every rail in creation turns on.
      const railDir = window.CCNav ? window.CCNav.railDir() : 0;
      if (railDir) { this.cycleTab(railDir); return; }
      const held = (name) => Input.isTriggered(name) || Input.isRepeated(name);
      const down = held("down") || this._wasd.down;
      const up = held("up") || this._wasd.up;
      const right = held("right") || this._wasd.right;
      const left = held("left") || this._wasd.left;
      this._wasd.up = this._wasd.down = this._wasd.left = this._wasd.right = false;

      const opts = this.activeOptions();
      const count = opts.length;
      if (!count) return;
      let index = this._index;
      let moved = false;
      const rowIndex = spriteRowOfIndex[index] || 0;
      const row = spriteRows[rowIndex];
      const col = row ? index - row.from : 0;
      const stepToRow = (target) => (target ? Math.min(target.from + col, target.to) : index);

      if (down) {
        index = stepToRow(spriteRows[rowIndex + 1] || spriteRows[0]);
        moved = true;
      } else if (up) {
        index = stepToRow(spriteRows[rowIndex - 1] || spriteRows[spriteRows.length - 1]);
        moved = true;
      } else if (right) {
        if (row && index < row.to) {
          index += 1;
          moved = true;
        } else if (this._ccEnterNav("right")) {
          // The right edge of the board is the doorway onto the buttons under
          // it, the only things on this page a card cursor cannot reach.
          return;
        }
      } else if (left) {
        if (row && index > row.from) {
          index -= 1;
          moved = true;
        }
      } else if (Input.isTriggered("ok")) {
        this.onSpriteConfirm();
        return;
      } else if (cancelPressed()) {
        SoundManager.playCancel();
        this.leaveWithoutPicking();
        return;
      }

      if (!moved) return;
      SoundManager.playCursor();
      this._index = index;
      this.refreshSelection();
    }

    update() {
      super.update();
      if (!this._overlay || window.CCPanel.isHidden(this._overlay)) return;
      this.updateInput();
      if (window.CCScroll) window.CCScroll.update(this._overlay);
      // The board rebuilds its cells underneath the ring, so the ring is
      // stamped back on afterwards rather than before.
      if (window.CCNav) window.CCNav.paint();
      if (this._gridDirty) {
        this._gridDirty = false;
        this.renderGrid();
      }
      this.paintAnimated(false);
    }

    //-- leaving --------------------------------------------------------------

    onSpriteSelected() {
      const entry = this.selectedEntry();
      if (!entry) return;
      const actor = $gameActors.actor(this._actorId);
      if (!actor) return;

      actor.setCharacterImage(entry.name, entry.index);

      const leader = $gameParty && $gameParty.leader();
      if (leader && this._actorId === leader.actorId()) {
        $gamePlayer.refresh();
      }


      // Picking a sprite ends here, whichever way the gallery was opened. The
      // sheet's own portrait comes with it (NPCs.json pairs one per index), so
      // there is nothing left to ask: the bust gallery used to open next and
      // made choosing a look a two-screen errand for a one-click decision. It
      // is still reachable on its own from the dossier.
      const standalone = this._standaloneSpriteMode || Scene_SpriteGridSelector._standaloneSpriteMode;
      this._standaloneSpriteMode = false;
      Scene_SpriteGridSelector._standaloneSpriteMode = false;

      // A creature portrayed by its own 3D model is portrayed by nothing else:
      // handing it the sheet's bust (and with it portrait mode "bust") threw
      // the sculpted model away the moment its walking sprite was picked. The
      // sprite is the map body, the model is the portrait, and choosing one
      // never touches the other.
      const CC3D = window.CC3DModel;
      const keepsModel =
        (actor.portraitMode && actor.portraitMode() === "model") ||
        !!(CC3D && CC3D.getConfig && CC3D.getConfig(this._actorId));

      // Standalone means the sprite alone was asked for (the dossier avatar),
      // so the bust already on the character is left exactly as it is.
      if (!standalone && !keepsModel) {
        const bust = bustForSprite(entry.name, entry.index);
        if (bust) {
          actor.setVnBust(bust);
          if (actor.setPortraitMode) actor.setPortraitMode("bust");
        } else if (window.selectRandomBustForActor) {
          window.selectRandomBustForActor(this._actorId);
        }
        if (this._isQuickCreation()) {
          const utils = window.CharacterCreationUtils;
          if (utils && utils.applyIdentityFromSprite) {
            utils.applyIdentityFromSprite(this._actorId - 1, entry.name);
          }
        }
      }

      this.popScene();
    }

    leaveWithoutPicking() {
      if (this._standaloneSpriteMode || Scene_SpriteGridSelector._standaloneSpriteMode) {
        this._standaloneSpriteMode = false;
        Scene_SpriteGridSelector._standaloneSpriteMode = false;
        this.popScene();
        return;
      }
      if (this._isQuickCreation()) {
        const actor = $gameActors.actor(this._actorId);
        const utils = window.CharacterCreationUtils;
        if (actor && utils && utils.applyIdentityFromSprite) {
          utils.applyIdentityFromSprite(this._actorId - 1, actor.characterName());
        }
      }
      const wizard = window.Scene_CharacterCreation;
      if (wizard && wizard.cancelSubScreens) wizard.cancelSubScreens();
      this.popScene();
    }

    _isQuickCreation() {
      const wizard = window.Scene_CharacterCreation;
      return !!(wizard && wizard._interruptedStep >= 0 &&
        wizard.isQuickMode && wizard.isQuickMode());
    }

  }

  //===========================================================================
  // Bust gallery
  //
  // img/busts holds 690 portraits, 883x1200 apiece and better than half a
  // megabyte a file: 412 MB of art. The old gallery put every bust of the open
  // category into the DOM at once, so opening Human (456 of them) asked the
  // browser for some 260 MB of files and, as they arrived, close to 2 GB of
  // decoded pixels. What holds that down now is the grid itself: it is
  // virtualised, so only the rows on screen (plus a row of overscan either
  // side) exist as elements, about a dozen cards whatever the category's size,
  // and scrolling recycles them rather than building more.
  //
  // The art is the bust file itself, whole and uncropped, at whatever size it
  // ships. bustArtUrl() is the single place that decides where a card's image
  // comes from, so pointing the gallery at a folder of downscaled copies later
  // is a one line change.
  //
  // Nothing is drawn through Window_Base any more. The old Window_BustList and
  // Window_BustPreview were held at opacity 0 behind the overlay and still
  // blitted an 883x1200 bitmap on every cursor move.
  //===========================================================================

  const BUST_DIR = "img/busts/";
  // Placeholder art ships at ~4 KB; a real bust is half a megabyte.
  const BUST_MIN_BYTES = 50000;

  // A bust that names a folder is never the gallery's to offer. img/busts holds
  // the faces anybody may wear; img/busts/presets holds the plates drawn for one
  // dossier or one species (a leader's portrait, a cow's photograph), and handing
  // one to somebody building a character would put a stranger's face on them.
  // Every list the board and the Random button are built from passes through
  // here, however it was read: the folder scan drops the folder by itself
  // (readdir names it and it fails the extension test), while the sprite
  // catalogue fallback and the synchronous read behind Random go by names rather
  // than files, and NPCs.json names those plates as "presets/<name>".
  const isGalleryBust = (name) => {
    const raw = String(name == null ? "" : name).trim();
    return raw.length > 0 && !raw.includes("/") && !raw.includes("\\");
  };

  // Six across fills the full-width page (see cc-page-full) at roughly the
  // same card size the old three-column half-page board used.
  const BUST_GRID_COLS = 6;
  const BUST_GRID_GAP = 16;
  const BUST_GRID_OVERSCAN = 1;
  // The busts' own 883x1200. A cell of that shape holds a whole portrait with
  // nothing cut off it and no empty band beside it.
  const BUST_CELL_RATIO = 1200 / 883;

  const nodeRequire = (name) => {
    try {
      return require(name);
    } catch (e) {
      return null;
    }
  };

  // Where a bust's picture comes from. The one place to change when the
  // downscaled copies land in a folder of their own.
  const bustArtUrl = (name) => `${BUST_DIR}${encodeURIComponent(name)}.png`;

  const gameRoot = () => {
    const path = nodeRequire("path");
    if (!path || typeof process === "undefined" || !process.mainModule) return null;
    try {
      return path.dirname(process.mainModule.filename);
    } catch (e) {
      return null;
    }
  };

  // Category ids in the order the species list shows them. A bust belongs to
  // the first id its file name starts with, and to Human when it starts with
  // none of them. The label is resolved by bustCategoryLabel() where it is
  // drawn, so these stay ids.
  // i18n-ignore-start: category ids, matched against the bust file name prefix
  const BUST_CATEGORIES = [
    "Human", "Goblin", "Orc", "Dwarven", "Rabbit", "Cyclop", "Gnome", "Elven",
    "Bot", "Undead", "Devil", "Dog", "Android", "Avian", "Cat", "Elephant",
    "Goat", "Kobold", "Alien", "Exotic", "Insectoid",
  ];
  const BUST_FALLBACK_CATEGORY = "Human";
  // i18n-ignore-end

  //---------------------------------------------------------------------------
  // The list of busts and how they group. Scanned once per session: the scene
  // is entered again for every party member and the folder does not change
  // under it.
  //---------------------------------------------------------------------------
  const BustCatalogue = {
    _load: null,

    // Promise of { names, sizes (name -> bytes), categories (id -> names) }.
    load() {
      if (!this._load) this._load = this._scan();
      return this._load;
    },

    // Whatever has already been scanned, for callers that cannot wait.
    peek() {
      return this._data || null;
    },

    async _scan() {
      let names = [];
      const sizes = new Map();
      const fs = nodeRequire("fs");
      const path = nodeRequire("path");
      const root = gameRoot();
      if (fs && path && root) {
        try {
          const dir = path.join(root, BUST_DIR);
          const files = await fs.promises.readdir(dir);
          // The byte size doubles as the thumbnail cache key, so a repainted
          // bust invalidates its own thumbnail without any versioning.
          const scanned = await Promise.all(
            files.map(async (file) => {
              if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) return null;
              try {
                const stat = await fs.promises.stat(path.join(dir, file));
                if (!stat.isFile() || stat.size <= BUST_MIN_BYTES) return null;
                return { name: file.replace(/\.[^.]+$/, ""), size: stat.size };
              } catch (e) {
                return null;
              }
            }),
          );
          for (const entry of scanned) {
            if (!entry || !isGalleryBust(entry.name)) continue;
            names.push(entry.name);
            sizes.set(entry.name, entry.size);
          }
        } catch (e) {
          names = [];
        }
      }
      // No file system (a browser build): fall back to every bust the sprite
      // catalogue names, which is the set the game actually references.
      if (!names.length) names = this._fromSpriteCatalogue();
      names.sort((a, b) => a.localeCompare(b));
      this._data = { names, sizes, categories: this._categorize(names) };
      return this._data;
    },

    // The browser fallback, which reads names rather than files: every portrait
    // the sheets name, minus the ones isGalleryBust keeps off the board.
    _fromSpriteCatalogue() {
      const assoc = window.Sprites && window.Sprites.SpritesAssociation;
      if (!assoc) return [];
      const found = new Set();
      for (const sheet of Object.keys(assoc)) {
        const busts = assoc[sheet];
        if (!Array.isArray(busts)) continue;
        for (const bust of busts) {
          if (isGalleryBust(bust)) found.add(String(bust).trim());
        }
      }
      return Array.from(found);
    },

    _categorize(names) {
      const categories = {};
      for (const id of BUST_CATEGORIES) categories[id] = [];
      for (const name of names) {
        const id = BUST_CATEGORIES.find(
          (cat) => cat !== BUST_FALLBACK_CATEGORY && name.startsWith(cat),
        );
        categories[id || BUST_FALLBACK_CATEGORY].push(name);
      }
      return categories;
    },
  };

  //---------------------------------------------------------------------------
  // The gallery itself, laid out like the sprite board: a species rail across
  // the top (with a search field to narrow it) and one full-width virtualised
  // grid of busts underneath. A click both moves the cursor and, on the
  // already-selected card, confirms; Continue and Random sit in the shared
  // nav bar below the board.
  //---------------------------------------------------------------------------
  class Scene_BustSelector extends Scene_MenuBase {
    constructor() {
      super();
      this._actorId = 1;
      this._preselectedBust = null;
    }

    setActor(actorId) {
      this._actorId = actorId || 1;
    }

    setPreselectedBust(bustName) {
      this._preselectedBust = bustName;
    }

    create() {
      super.create();
      this._alive = true;
      this._categories = [];
      this._all = {};
      this._activeCategory = null;
      this._busts = [];
      this._index = 0;
      this._needsCursorScroll = false;
      this._search = "";
      this._cells = new Map();
      this._pool = [];
      this._cellW = 0;
      this._cellH = 0;
      this._gridDirty = false;
      this._wasd = { up: false, down: false, left: false, right: false };
      this.bindKeys();
      this.buildOverlay();
      this.loadBustList();
    }

    //-- lifecycle ------------------------------------------------------------

    bindKeys() {
      this._wasdListener = (event) => {
        if (!this._alive || document.activeElement === this._searchEl) return;
        const key = String(event.key || "").toLowerCase();
        // WASD only. Arrows and the pad are read through Input in update().
        const dir = { w: "up", s: "down", a: "left", d: "right" }[key];
        if (!dir) return;
        this._wasd[dir] = true;
        event.preventDefault();
      };
      window.addEventListener("keydown", this._wasdListener);
      this._resizeListener = () => {
        this._cellW = 0;
        this._gridDirty = true;
      };
      window.addEventListener("resize", this._resizeListener);
    }

    terminate() {
      super.terminate();
      this._alive = false;
      if (window.CCNav) window.CCNav.detach(this);
      if (window.CCTransitionVeil) window.CCTransitionVeil.hide();
      window.removeEventListener("keydown", this._wasdListener);
      window.removeEventListener("resize", this._resizeListener);
      this._cells.clear();
      this._pool.length = 0;
      if (this._overlay) {
        this._overlay.innerHTML = "";
        window.CCPanel.hide(this._overlay);
      }
    }

    //-- the page -------------------------------------------------------------

    buildOverlay() {
      let container = document.getElementById("character-creation-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "character-creation-container";
        document.body.appendChild(container);
      }
      if (window._ccOverlayTimeout) {
        clearTimeout(window._ccOverlayTimeout);
        window._ccOverlayTimeout = null;
      }
      this._overlay = container;
      window.CCPanel.show(container);
      container.innerHTML = "";
      if (window.CCScroll) window.CCScroll.bindWheel(container);

      // The same modal the sprite gallery draws, one field wider: the species
      // filter sits under the header, and Random / Continue ride the strip at
      // the foot instead of a button panel of their own.
      container.innerHTML = `
        <div class="ui-overlay cc-gal-overlay">
          <div class="ui-panel cc-gal-panel">
            <div class="page-header-bar page-header-bar--compact">
              <button class="back-button cc-gal-back">${T("CharCreate.back")}</button>
              <div class="title">${T("CharCreate.selectABust")}</div>
            </div>
            <input type="text" class="cc-species-search ui-input cc-gal-search" />
            <div class="cc-sprite-tab-bar cc-gal-tabs"></div>
            <div class="ui-panel-body cc-gal-board cc-gal-board--bust">
              <div class="cc-gal-canvas"></div>
            </div>
            <div class="inspect-actions cc-gal-actions"></div>
          </div>
        </div>
      `;

      this._tabBarEl = container.querySelector(".cc-sprite-tab-bar");
      this._gridEl = container.querySelector(".cc-gal-board");
      this._canvasEl = container.querySelector(".cc-gal-canvas");
      this._searchEl = container.querySelector(".cc-species-search");
      this._buttonsEl = container.querySelector(".cc-gal-actions");
      this._searchEl.placeholder = T("CharCreate.searchSpecies");

      const backEl = container.querySelector(".cc-gal-back");
      if (backEl) backEl.addEventListener("click", () => this.onBustCancel());

      this.buildButtons();

      // Random and Continue sit under the board, where a card cursor cannot
      // reach them. The focus ring can. See CharacterCreationNav.js.
      if (window.CCNav) window.CCNav.attach(this, this._overlay);

      // One listener a board rather than an inline handler a card: the grid
      // rebuilds its cells constantly and must not re-bind on every pass.
      this._gridEl.addEventListener("click", (event) => {
        const card = event.target.closest(".cc-bust-card");
        if (card) this.onBustCardClick(Number(card.dataset.index));
      });
      this._gridEl.addEventListener("scroll", () => {
        this._gridDirty = true;
      });
      this._tabBarEl.addEventListener("click", (event) => {
        const btn = event.target.closest(".cc-sprite-tab-btn");
        if (btn && btn.dataset.category) {
          SoundManager.playCursor();
          this.switchCategory(btn.dataset.category);
        }
      });
      // The field owns the keyboard while it has focus, so neither RMMZ's
      // Input nor the WASD listener sees what is typed into it. Escape and
      // Enter hand it back, or there would be no way off the field on a
      // keyboard.
      for (const type of ["keydown", "keyup", "keypress"]) {
        this._searchEl.addEventListener(type, (event) => {
          event.stopPropagation();
          if (type === "keydown" && (event.key === "Escape" || event.key === "Enter")) {
            this._searchEl.blur();
          }
        });
      }
      this._searchEl.addEventListener("input", () => this.onCategorySearch(this._searchEl.value));
    }

    buildButtons() {
      // No Back: cancel (ESC / right click) is how this board is left without
      // picking, same as the sprite board it now matches. Random in the
      // middle, Continue on the right.

      // Always present, never gated on the gallery having loaded: if the
      // img/busts scan comes back empty (or is still running) the tab rail
      // and grid stay bare, and Continue has nothing to pick. Random
      // draws from availableBustNames(), which falls back to its own
      // synchronous folder read rather than waiting on BustCatalogue's scan.
      this._randomEl = document.createElement("button");
      this._randomEl.className = "inspect-btn";
      this._randomEl.textContent = window.CCButtons.randomLabel();
      this._randomEl.addEventListener("click", () => this.onBustRandom());
      this._buttonsEl.appendChild(this._randomEl);

      this._confirmEl = document.createElement("button");
      this._confirmEl.className = "inspect-btn confirm";
      this._confirmEl.textContent = window.CCButtons.continueLabel();
      this._confirmEl.addEventListener("click", () => this.onBustConfirm());
      this._buttonsEl.appendChild(this._confirmEl);
      // Hidden with `visibility`, not `display`: while no category has
      // loaded yet there is nothing to confirm, but Random must not slide
      // sideways when Continue comes and goes.
      window.CCButtons.setShown(this._confirmEl, false);
    }

    // The id a random pick's bust name would file under, mirroring
    // BustCatalogue._categorize so the Bot/Goblin reproduction-type quirk in
    // finishWithBust reads the same whether the pick came off the gallery or
    // off this shortcut.
    categoryForBustName(name) {
      const id = BUST_CATEGORIES.find(
        (cat) => cat !== BUST_FALLBACK_CATEGORY && name.startsWith(cat),
      );
      return id || BUST_FALLBACK_CATEGORY;
    }

    //-- data -----------------------------------------------------------------

    loadBustList() {
      BustCatalogue.load().then((data) => {
        if (!this._alive) return;
        // A goblin world wears goblin faces and a monster world wears nothing
        // that reads as a person's. The gallery is read off the img/busts
        // folder, so the wardrobe has to say which of those files belong here.
        const categories = filterBustCategories(data.categories);
        this._categories = BUST_CATEGORIES.filter(
          (cat) => categories[cat] && categories[cat].length > 0,
        );
        this._all = categories;
        this.renderTabs();

        let initialCategory = this._categories[0] || null;
        let initialIndex = 0;
        if (this._preselectedBust) {
          const found = this._categories.find(
            (cat) => this._all[cat].indexOf(this._preselectedBust) >= 0,
          );
          if (found) {
            initialCategory = found;
            initialIndex = Math.max(0, this._all[found].indexOf(this._preselectedBust));
          }
        }
        this.switchCategory(initialCategory, initialIndex);
        if (window.CCTransitionVeil) window.CCTransitionVeil.hide();
      });
    }

    //-- the species rail -------------------------------------------------------

    renderTabs() {
      this._tabBarEl.innerHTML = this._categories.map((category) => {
        const count = this._all[category].length;
        return `<button class="cc-sprite-tab-btn" data-category="${category}">${bustCategoryLabel(category)} <span class="cc-sprite-tab-count">(${count})</span></button>`;
      }).join("");
    }

    refreshTabActive() {
      const btns = this._tabBarEl.querySelectorAll(".cc-sprite-tab-btn");
      btns.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.category === this._activeCategory);
      });
    }

    onCategorySearch(value) {
      this._search = String(value || "");
      const term = this._search.trim().toLowerCase();
      const btns = this._tabBarEl.querySelectorAll(".cc-sprite-tab-btn");
      btns.forEach((btn) => {
        const match = !term || bustCategoryLabel(btn.dataset.category).toLowerCase().includes(term);
        btn.classList.toggle("ui-closed", !match);
      });
    }

    // Switching tabs is switching the whole board under it: a new bust list,
    // so every cell holds the wrong portrait and is dropped for the next
    // reconcile to rebuild only what is on screen.
    switchCategory(category, initialIndex = 0) {
      this._activeCategory = category;
      this._busts = (category && this._all[category]) || [];
      this._index = Math.min(Math.max(0, initialIndex), Math.max(0, this._busts.length - 1));
      this.refreshTabActive();
      this.releaseCells();
      this._gridEl.scrollTop = 0;
      this.updateCanvasHeight();
      this._gridDirty = true;
      this._needsCursorScroll = initialIndex > 0;
      window.CCButtons.setShown(this._confirmEl, this._busts.length > 0);
    }

    //-- the virtualised grid -------------------------------------------------

    measureGrid() {
      const width = this._gridEl.clientWidth - 4;
      if (width <= 0) return false;
      this._cellW = Math.floor((width - BUST_GRID_GAP * (BUST_GRID_COLS - 1)) / BUST_GRID_COLS);
      this._cellH = Math.round(this._cellW * BUST_CELL_RATIO);
      this.updateCanvasHeight();
      return true;
    }

    // The spacer under the cells is what the pane actually scrolls.
    updateCanvasHeight() {
      if (!this._cellH) return;
      const rows = Math.ceil(this._busts.length / BUST_GRID_COLS);
      const height = rows > 0 ? rows * (this._cellH + BUST_GRID_GAP) - BUST_GRID_GAP : 0;
      this._canvasEl.style.setProperty("--cc-canvas-h", `${height}px`);
    }

    releaseCells() {
      for (const cell of this._cells.values()) {
        cell.remove();
        this._pool.push(cell);
      }
      this._cells.clear();
    }

    takeCell() {
      const cell = this._pool.pop();
      if (cell) return cell;
      const card = document.createElement("div");
      card.className = "cc-gal-cell cc-bust-card";
      const art = document.createElement("div");
      art.className = "cc-gal-art cc-gal-art--bust";
      const name = document.createElement("div");
      name.className = "cc-gal-cell-name";
      card.appendChild(art);
      card.appendChild(name);
      card._art = art;
      card._name = name;
      return card;
    }

    renderGrid() {
      if (!this._cellW && !this.measureGrid()) {
        // The page has not been laid out yet: try again next frame.
        this._gridDirty = true;
        return;
      }
      const total = this._busts.length;
      if (!total) {
        this.releaseCells();
        return;
      }
      if (this._needsCursorScroll) {
        this._needsCursorScroll = false;
        const row = Math.floor(this._index / BUST_GRID_COLS);
        this.scrollIntoPane(this._gridEl, row * (this._cellH + BUST_GRID_GAP), this._cellH);
      }
      const rowHeight = this._cellH + BUST_GRID_GAP;
      const firstRow = Math.max(0, Math.floor(this._gridEl.scrollTop / rowHeight) - BUST_GRID_OVERSCAN);
      const lastRow =
        Math.floor((this._gridEl.scrollTop + this._gridEl.clientHeight) / rowHeight) + BUST_GRID_OVERSCAN;
      const from = firstRow * BUST_GRID_COLS;
      const to = Math.min(total - 1, lastRow * BUST_GRID_COLS + BUST_GRID_COLS - 1);

      for (const [index, cell] of this._cells) {
        if (index < from || index > to) {
          cell.remove();
          this._pool.push(cell);
          this._cells.delete(index);
        }
      }

      for (let index = from; index <= to; index++) {
        if (this._cells.has(index)) {
          this.placeCell(this._cells.get(index), index);
          continue;
        }
        const cell = this.takeCell();
        this._cells.set(index, cell);
        this.fillCell(cell, index);
        this.placeCell(cell, index);
        this._canvasEl.appendChild(cell);
      }
    }

    placeCell(cell, index) {
      const col = index % BUST_GRID_COLS;
      const row = Math.floor(index / BUST_GRID_COLS);
      cell.style.setProperty("--cc-cell-x", `${col * (this._cellW + BUST_GRID_GAP)}px`);
      cell.style.setProperty("--cc-cell-y", `${row * (this._cellH + BUST_GRID_GAP)}px`);
      cell.style.setProperty("--cc-cell-w", `${this._cellW}px`);
      cell.style.setProperty("--cc-cell-h", `${this._cellH}px`);
      cell.classList.toggle("selected", index === this._index);
    }

    fillCell(cell, index) {
      const name = this._busts[index];
      cell.dataset.index = String(index);
      cell.dataset.bust = name;
      cell._name.textContent = decamelCase(name);
      cell._art.style.setProperty("--cc-bust", window.CCArt.url(bustArtUrl(name)));
    }

    refreshSelection() {
      for (const [index, cell] of this._cells) {
        cell.classList.toggle("selected", index === this._index);
      }
      if (!this._cellH) return;
      const row = Math.floor(this._index / BUST_GRID_COLS);
      this.scrollIntoPane(this._gridEl, row * (this._cellH + BUST_GRID_GAP), this._cellH);
    }

    // Straight scrollTop arithmetic. scrollIntoView({behavior:"smooth"}) on a
    // timeout, which is what this used to be, animates on every cursor step
    // and fights the next one.
    scrollIntoPane(pane, top, height) {
      if (top < pane.scrollTop) pane.scrollTop = top;
      else if (top + height > pane.scrollTop + pane.clientHeight) {
        pane.scrollTop = top + height - pane.clientHeight;
      }
    }

    //-- selection ------------------------------------------------------------

    selectedBust() {
      return this._busts[this._index] || null;
    }

    // One click both moves the cursor and, on the card already under it,
    // confirms - the same gesture the sprite board uses.
    onBustCardClick(index) {
      if (!(index >= 0) || index >= this._busts.length) return;
      if (index === this._index) {
        this.onBustConfirm();
        return;
      }
      SoundManager.playCursor();
      this._index = index;
      this.refreshSelection();
    }

    //-- input ----------------------------------------------------------------

    // CCScroll drives the right stick at whichever board holds the cursor.
    ccScrollTarget() {
      return this._gridEl;
    }

    readDirection() {
      const held = (name) => Input.isTriggered(name) || Input.isRepeated(name);
      const direction = {
        up: held("up") || this._wasd.up,
        down: held("down") || this._wasd.down,
        left: held("left") || this._wasd.left,
        right: held("right") || this._wasd.right,
      };
      this._wasd.up = this._wasd.down = this._wasd.left = this._wasd.right = false;
      return direction;
    }

    // L1 / R1 (and TAB) step through the species rail from anywhere on the
    // board, exactly as they walk the sprite board's tabs.
    cycleTab(direction) {
      const cats = this._categories;
      if (cats.length < 2) return;
      const cur = Math.max(0, cats.indexOf(this._activeCategory));
      const next = (cur + direction + cats.length) % cats.length;
      SoundManager.playCursor();
      this.switchCategory(cats[next]);
      const active = this._tabBarEl.querySelector(".cc-sprite-tab-btn.active");
      if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }

    // The ring hands the board back when it walks off its own top or left edge.
    onNavLeave() {
      this.refreshSelection();
    }

    // Step off the board and onto Random / Continue underneath it.
    _ccEnterNav(dir) {
      return !!window.CCNav && window.CCNav.tryEnterFromBoard(dir);
    }

    updateInput() {
      if (document.activeElement === this._searchEl) return;
      // The ring owns the buttons under the board whenever it is up, and is
      // read first so one press never moves two cursors.
      if (window.CCNav && window.CCNav.update()) return;
      // L1/PageUp back, R1/PageDown and Tab forward, Shift+Tab back. See
      // CCNav.railDir(), which every rail in creation turns on.
      const railDir = window.CCNav ? window.CCNav.railDir() : 0;
      if (railDir) { this.cycleTab(railDir); return; }
      const direction = this.readDirection();
      const count = this._busts.length;
      // Leaving must work before the catalogue has finished loading.
      if (!count) {
        if (cancelPressed()) this.onBustCancel();
        return;
      }
      const cols = BUST_GRID_COLS;
      let index = this._index;
      let moved = false;

      if (direction.down) {
        index = index + cols < count ? index + cols : index % cols;
        moved = true;
      } else if (direction.up) {
        if (index - cols >= 0) {
          index -= cols;
        } else {
          let target = Math.floor((count - 1) / cols) * cols + (index % cols);
          if (target >= count) target -= cols;
          index = Math.max(0, target);
        }
        moved = true;
      } else if (direction.right) {
        if (index % cols < cols - 1 && index + 1 < count) {
          index += 1;
          moved = true;
        } else if (this._ccEnterNav("right")) {
          // The right edge of the board is the doorway onto Random and
          // Continue, the only things here a card cursor cannot reach.
          return;
        }
      } else if (direction.left) {
        if (index % cols > 0) {
          index -= 1;
          moved = true;
        }
      } else if (Input.isTriggered("ok")) {
        this.onBustConfirm();
        return;
      } else if (cancelPressed()) {
        this.onBustCancel();
        return;
      }

      if (!moved) return;
      SoundManager.playCursor();
      this._index = index;
      this.refreshSelection();
    }

    update() {
      super.update();
      if (!this._overlay || window.CCPanel.isHidden(this._overlay)) return;
      this.updateInput();
      if (window.CCScroll) window.CCScroll.update(this._overlay);
      // The board rebuilds its cells underneath the ring, so the ring is
      // stamped back on afterwards rather than before.
      if (window.CCNav) window.CCNav.paint();
      if (this._gridDirty) {
        this._gridDirty = false;
        this.renderGrid();
      }
    }

    //-- leaving --------------------------------------------------------------

    // The actor-side effects of settling on a bust, shared by the ordinary
    // gallery Confirm and by the Random shortcut: which bust, and which
    // category it reads as for the Bot/Goblin reproduction-type quirk.
    finishWithBust(bustName, category) {
      // The bust belongs to the actor this selector was opened for, not always
      // the first party member.
      const actorId = this._actorId || 1;
      const actor = $gameActors.actor(actorId);
      if (!actor) return;
      actor.setVnBust(bustName);
      // Picking a bust settles this character's portrait style.
      if (actor.setPortraitMode) actor.setPortraitMode("bust");

      // Reproduction type variable: 87 for actor 1, 115 / 116 for 2 / 3.
      const reproductiveVar = actorId === 2 ? 115 : actorId === 3 ? 116 : 87;
      // i18n-ignore-start: bust folder ids
      if (category === "Bot") {
        $gameVariables.setValue(reproductiveVar, -1);
      } else if (category === "Goblin" && actor.gender() === 1) {
        // i18n-ignore-end
        $gameVariables.setValue(reproductiveVar, 2);
      }


      // A bust IS the character's portrait: the 3D model editor is the other,
      // mutually exclusive branch (reached from the sprite step) and is never
      // chained after a bust pick.
      //
      // Two pops by default: this gallery is opened from the sprite grid, so
      // confirming leaves both and lands on whatever opened the grid - the
      // creation wizard, which then opens the name prompt and carries on. A
      // caller that pushed the gallery straight over its own scene (the
      // Detailed creation editor) sets _confirmPops to 1 and gets its scene
      // back instead.
      const pops = Scene_BustSelector._confirmPops || 2;
      Scene_BustSelector._confirmPops = 0;
      for (let i = 0; i < pops; i++) SceneManager.pop();
    }

    onBustConfirm() {
      const bustName = this.selectedBust();
      if (!bustName) return;
      this.finishWithBust(bustName, this._activeCategory);
    }

    // Always clickable, whatever state the gallery's own scan is in.
    // availableBustNames() (module scope, below) prefers BustCatalogue's
    // scan but falls back to its own synchronous folder read, so this works
    // even when the species rail never populated.
    onBustRandom() {
      const names = availableBustNames();
      if (!names || !names.length) return;
      const bustName = names[Math.floor(Math.random() * names.length)];
      this.finishWithBust(bustName, this.categoryForBustName(bustName));
    }

    onBustCancel() {
      SoundManager.playCancel();
      Scene_BustSelector._confirmPops = 0;
      SceneManager.pop();
    }
  }

  // Patch the prepareNextScene method to properly handle Scene_SpriteGridSelector and Scene_BustSelector
  const _SceneManager_prepareNextScene = SceneManager.prepareNextScene;
  SceneManager.prepareNextScene = function (sceneClass, ...args) {
    if (
      sceneClass === Scene_SpriteGridSelector ||
      sceneClass === Scene_BustSelector
    ) {
      // Handle sprite grid selector and bust selector preparation
      const [actorId] = args;
      if (sceneClass === Scene_SpriteGridSelector) {
        Scene_SpriteGridSelector.prototype.setActor = function (actorId) {
          this._actorId = actorId || 1;
        };
      } else if (sceneClass === Scene_BustSelector) {
        Scene_BustSelector.prototype.setActor = function (actorId) {
          this._actorId = actorId || 1;
        };
      }
      _SceneManager_prepareNextScene.apply(this, [sceneClass]);
      if (this._nextScene && actorId) {
        this._nextScene.setActor(actorId);
      }
    } else {
      // Handle all other scenes normally
      _SceneManager_prepareNextScene.apply(this, arguments);
    }
  };

  // Exported so a scene that wants the grid over its own (the Detailed
  // creation editor) can push it and be returned to by the usual pop.
  window.Scene_SpriteGridSelector = Scene_SpriteGridSelector;
  window.Scene_CharacterSpriteGridSelector = Scene_SpriteGridSelector;
  window.Scene_BustSelector = Scene_BustSelector;

  // The sprite board's services. paintFrame is the one way to draw a frame of
  // a character sheet into a DOM element without it flashing at the wrong size
  // on the way in.
  window.SpriteBoard = {
    options: () => spriteOptions,
    // The bust NPCs.json pairs with a sheet's sprite index, or null.
    bustFor: bustForSprite,
    sheetUrl: spriteSheetUrl,
    paintFrame: paintSpriteFrame,
    // Build the board (and start the bust folder scan) ahead of the scene that
    // needs them. Character creation calls this the moment the wizard opens, so
    // the sprite step has nothing left to wait for by the time it is reached;
    // both are cached, so the call is free once it has been made.
    warm() {
      rebuildSpriteBoard();
      BustCatalogue.load();
    },
  };

  // The gallery's catalogue, for anyone who wants the bust list without
  // opening the scene.
  window.BustGallery = {
    categoryIds: BUST_CATEGORIES,
    // Promise of { names, sizes, categories }.
    load: () => BustCatalogue.load(),
    // Whatever has been scanned already, or null.
    peek: () => BustCatalogue.peek(),
    // Where a bust's picture is loaded from.
    artUrl: bustArtUrl,
  };

  // Register plugin commands
  PluginManager.registerCommand(pluginName, "OpenSpriteSelector", () => {
    SceneManager.push(Scene_SpriteGridSelector);
  });

  PluginManager.registerCommand(
    pluginName,
    "OpenSpriteSelectorForActor",
    (args) => {
      const actorId = parseInt(args.actorId) || 1;
      SceneManager.push(Scene_SpriteGridSelector);
      if (SceneManager._nextScene) {
        SceneManager._nextScene.setActor(actorId);
      }
    },
  );

  // Register the new random sprite selection command
  PluginManager.registerCommand(pluginName, "SelectRandomSprite", (args) => {
    const actorId = parseInt(args.actorId) || 1;
    const randomSprite = selectRandomSprite(actorId);
  });

  // Expose selectRandomSprite globally for use by other plugins
  window.selectRandomSpriteForActor = function (actorId) {
    return selectRandomSprite(actorId);
  };

  // The list a random pick draws from, resolved once. Randomizing a whole
  // party used to stat all 730 files once per member. The world it was
  // resolved for is remembered with it, since a narrowed world draws from a
  // narrower folder (see filterBustCategories for the gallery's half).
  let randomBustPool = null;
  let randomBustPoolMode = null;

  // What is left of a scanned folder once the world has had its say.
  const narrowBustPool = (names) => {
    const SC = window.SpriteCatalog;
    if (!SC || typeof SC.bustAllowedInPopulation !== "function") return names;
    if (!SC.allowedBustNames || !SC.allowedBustNames()) return names;
    const kept = names.filter((n) => SC.bustAllowedInPopulation(n));
    return kept.length ? kept : names;
  };

  const availableBustNames = () => {
    const mode = populationMode();
    if (randomBustPool && randomBustPoolMode === mode) return randomBustPool;
    randomBustPoolMode = mode;
    const scanned = BustCatalogue.peek();
    if (scanned && scanned.names.length) {
      randomBustPool = narrowBustPool(scanned.names);
      return randomBustPool;
    }
    // Nothing scanned yet: read the folder once here and warm the catalogue
    // for whoever asks next.
    BustCatalogue.load();
    const names = [];
    try {
      const fs = require("fs");
      const path = require("path");
      const bustsPath = path.join(
        path.dirname(process.mainModule.filename),
        BUST_DIR,
      );
      for (const file of fs.readdirSync(bustsPath)) {
        if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) continue;
        const stat = fs.statSync(path.join(bustsPath, file));
        // Skip the placeholder art, as the gallery does.
        const base = file.replace(/\.[^.]+$/, "");
        if (stat.isFile() && stat.size > BUST_MIN_BYTES && isGalleryBust(base)) {
          names.push(base);
        }
      }
    } catch (error) {
      const assoc = window.Sprites && window.Sprites.SpritesAssociation;
      for (const sheet of Object.keys(assoc || {})) {
        for (const bust of assoc[sheet] || []) {
          if (isGalleryBust(bust)) names.push(String(bust).trim());
        }
      }
    }
    randomBustPool = narrowBustPool(names);
    return randomBustPool;
  };

  // Global function to select a random bust and store it in appropriate variable
  window.selectRandomBustForActor = function (actorId) {
    const availableBusts = availableBustNames();

    if (availableBusts.length === 0) {
      console.warn("No bust files available for random selection");
      return null;
    }

    // Select a random bust
    const randomIndex = Math.floor(Math.random() * availableBusts.length);
    const randomBust = availableBusts[randomIndex];

    // A bust is a bust for every member: store it on the actor's own bust
    // field and settle their portrait style on it.
    const actor = $gameActors.actor(actorId);
    if (actor) {
      actor.setVnBust(randomBust);
      if (actor.setPortraitMode) actor.setPortraitMode("bust");
    }

    return randomBust;
  };
})();
