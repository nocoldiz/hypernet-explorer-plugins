/*:
 * @target MZ
 * @plugindesc Creature creation system for character creation flow
 * @author Omni-Lex
 * @orderAfter Health_Core
 * @orderAfter CharacterCreation
 *
 * @help
 * This plugin provides a creature creation interface that integrates
 * with the character creation flow. It allows players to create custom
 * creatures by selecting:
 * - Archetype (baseline or hybrid)
 * - Battler image
 * - Character sprite
 *
 * The system automatically integrates with the Health_Core archetype
 * system and returns to the trait selection after completion.
 */

(() => {
  const pluginName = "CharacterCreationCreature";

  // Helper function to get skill display name from a skill ID or array of IDs
  function getSkillDisplayName(skillId) {
    if (Array.isArray(skillId)) {
      const names = skillId
        .filter((id) => id)
        .map((id) => ($dataSkills && $dataSkills[id] ? $dataSkills[id].name : T('Creature.skillFallback', { id: id })));
      return names.length ? names.join(", ") : null;
    }
    if (!skillId || skillId === 0) return null;
    return $dataSkills && $dataSkills[skillId] ? $dataSkills[skillId].name : T('Creature.skillFallback', { id: skillId });
  }

  // Health_Core owns how anatomies are spliced and how a part is named, so the
  // wizard shows exactly the body the creature will be given. Both fall back to
  // something sane if the health plugins are not loaded.
  function mergeParts(keys) {
    const HC = window.HealthCore;
    if (HC && HC.mergeArchetypeParts) return HC.mergeArchetypeParts(keys);
    const { Archetypes } = window.Health || {};
    const merged = {};
    (keys || []).forEach((key, index) => {
      const entry = Archetypes && Archetypes[key];
      for (const partKey in (entry && entry.parts) || {}) {
        if (!merged[partKey]) merged[partKey] = Object.assign({}, entry.parts[partKey], { fromArchetype: index });
      }
    });
    return merged;
  }

  function partName(part) {
    const HC = window.HealthCore;
    if (HC && HC.archetypePartName) return HC.archetypePartName(part);
    return (window.getArchetypeText ? window.getArchetypeText(part.name) : part.name) || part.name;
  }

  // How many weapons the body could carry, printed under the archetype name so
  // the choice can be made on it. ItemSystem/ItemSystemEquipment.js is the one
  // place the rules live; this only asks it.
  function weaponSlotLine(parts) {
    const HS = window.HandSlots;
    if (!HS || !HS.layoutForParts) return "";
    const layout = HS.layoutForParts(parts);
    if (!layout.slots) return T('Creature.ui.noWeaponSlots');
    if (layout.mouth && !layout.hands) return T('Creature.ui.weaponSlotsMouth');
    if (layout.slots === 1) return T('Creature.ui.weaponSlotsOne');
    return T('Creature.ui.weaponSlots', { n: layout.slots });
  }

  // ============================================================================
  // Window_ArchetypeSelect - List of available archetypes
  // ============================================================================
  function Window_ArchetypeSelect() {
    this.initialize(...arguments);
  }

  Window_ArchetypeSelect.prototype = Object.create(Window_Selectable.prototype);
  Window_ArchetypeSelect.prototype.constructor = Window_ArchetypeSelect;

  Window_ArchetypeSelect.prototype.initialize = function (rect) {
    Window_Selectable.prototype.initialize.call(this, rect);
    this._data = [];
    this.refresh();
  };

  Window_ArchetypeSelect.prototype.processCursorMove = function () {};
  Window_ArchetypeSelect.prototype.processHandling = function () {};
  // All mouse interaction goes through the DOM overlay. The window itself is
  // invisible, so leaving TouchInput alive lets a hover over its (unrelated)
  // rectangle move the index and cycle the cards under the pointer.
  Window_ArchetypeSelect.prototype.processTouch = function () {};

  // Must match the DOM board the cards are drawn on (.cc-select-grid
  // .cc-three-col): WASD/stick navigation steps by this stride, so a stride
  // that disagrees with the layout moves the cursor to the wrong card.
  Window_ArchetypeSelect.prototype.maxCols = function () {
    return 3;
  };

  Window_ArchetypeSelect.prototype.maxItems = function () {
    return this._data ? this._data.length : 0;
  };

  Window_ArchetypeSelect.prototype.item = function () {
    return this._data && this.index() >= 0 ? this._data[this.index()] : null;
  };

  // Who this world is populated with (WorldManager.populationMode). A goblin
  // world keeps the whole board , the primary is pinned to Goblin below and the
  // secondary is picked under the ordinary rules , while a monster world has
  // nothing that reads as a person in it, so the people archetypes leave the
  // board entirely.
  function populationMode() {
    const WM = window.WorldManager;
    return (WM && typeof WM.populationMode === "function")
      ? WM.populationMode() : "normal";
  }


  // True while this builder is running for a paused Quick-mode creation. A
  // creature is asked for three things there and no more: its archetype(s),
  // its monster sprite and (in the class selector afterwards) its class. The
  // 3D look is the one that belongs to the chosen sprite, so the custom model
  // editor is not offered, and the overworld sprite is dealt from the same
  // archetypes the sprite step would have listed.
  //
  // The builder is also reachable from its own plugin command, with no wizard
  // waiting behind it (_interruptedStep < 0), which always runs in full.
  function isQuickCreation() {
    const wizard = window.Scene_CharacterCreation;
    return !!(wizard && wizard._interruptedStep >= 0 &&
      wizard.isQuickMode && wizard.isQuickMode());
  }

  function archetypeOfferedInPopulation(key) {
    if (populationMode() !== "monster") return true;
    const people = (window.SpriteCatalog && window.SpriteCatalog.PEOPLE_ARCHETYPES) ||
                   ["Humanoid", "DoubleHeadedHumanoid"];
    return !people.includes(key);
  }

  // Plain Humanoid is what the wizard's other branch builds: a creature made on
  // it is just a person with a monster's sheet, so it is never offered here.
  // (DoubleHeadedHumanoid and the rest of the people archetypes stay , they are
  // shapes a creature can plausibly be built on.)
  const HIDDEN_ARCHETYPES = ["Humanoid"];

  Window_ArchetypeSelect.prototype.makeItemList = function () {
    this._data = [];
    const { Archetypes } = window.Health || {};
    if (Archetypes) {
      for (const key in Archetypes) {
        if (HIDDEN_ARCHETYPES.includes(key)) continue;
        if (!archetypeOfferedInPopulation(key)) continue;
        this._data.push({
          key: key,
          name: window.getArchetypeText(`enemyArchetypes.${key.toLowerCase()}.name`) /* i18n-ignore: enemyArchetypes.json key */ || key
        });
      }
    }
    // Alphabetical by the name the player actually reads, so the roster can be
    // scanned instead of searched (Archetypes.json order is authoring order).
    this._data.sort((a, b) => a.name.localeCompare(b.name));
  };

  Window_ArchetypeSelect.prototype.drawItem = function (index) {
    const item = this._data[index];
    if (item) {
      const rect = this.itemLineRect(index);
      this.drawText(item.name, rect.x, rect.y, rect.width);
    }
  };

  Window_ArchetypeSelect.prototype.refresh = function () {
    this.makeItemList();
    Window_Selectable.prototype.refresh.call(this);
  };

  // Patch to call 'select' handler for live updates
  const _Window_ArchetypeSelect_select = Window_ArchetypeSelect.prototype.select;
  Window_ArchetypeSelect.prototype.select = function (index) {
    _Window_ArchetypeSelect_select.call(this, index);
    if (this.isHandled('select')) {
      this.callHandler('select');
    }
  };

  // ============================================================================
  // Window_BattlerList - List of battler images
  // ============================================================================
  function Window_BattlerList() {
    this.initialize(...arguments);
  }

  Window_BattlerList.prototype = Object.create(Window_Selectable.prototype);
  Window_BattlerList.prototype.constructor = Window_BattlerList;

  Window_BattlerList.prototype.initialize = function (rect) {
    this._data = [];
    this._archetypes = [];
    Window_Selectable.prototype.initialize.call(this, rect);
  };

  Window_BattlerList.prototype.setArchetypes = function (archetypes) {
    this._archetypes = archetypes || [];
    this.refresh();
  };

  Window_BattlerList.prototype.processCursorMove = function () {};
  Window_BattlerList.prototype.processHandling = function () {};
  Window_BattlerList.prototype.processTouch = function () {};

  Window_BattlerList.prototype.maxCols = function () {
    return 2; // Matches the 2-column visual grid
  };

  Window_BattlerList.prototype.maxItems = function () {
    return this._data ? this._data.length : 0;
  };

  Window_BattlerList.prototype.itemHeight = function () {
    return this.lineHeight();
  };

  Window_BattlerList.prototype.makeItemList = function () {
    this._data = [];
    if (!$dataEnemies) return;

    for (const enemy of $dataEnemies) {
      if (!enemy || !enemy.name) continue;

      const note = enemy.note || "";
      const archetypeMatch = note.match(/<Archetype:\s*(.*?)>/);
      if (archetypeMatch) {
        const arch = archetypeMatch[1].trim();
        if (this._archetypes.length === 0 || this._archetypes.includes(arch)) {
          // Avoid duplicate battlers if they have the same name (optional, but cleaner)
          // Actually, different enemies might have the same name but different battlers, 
          // or same battler but different names. Let's keep them all for variety unless identical.
          this._data.push({
            id: enemy.id,
            name: enemy.name,
            battlerName: enemy.battlerName
          });
        }
      }
    }

    // Sort alphabetically by enemy name
    this._data.sort((a, b) => a.name.localeCompare(b.name));

    // Offer a fully custom 3D creature as the first option (when the 3D editor
    // is available). Selecting it opens the part-mixing model editor seeded from
    // the chosen archetype(s) instead of picking a fixed battler image. Quick
    // mode does not offer it: there the 3D look is whatever the chosen monster
    // sprite already wears.
    if (!isQuickCreation() &&
        window.CC3DModel && window.CC3DModel.isAvailable && window.CC3DModel.isAvailable() && window.Scene_CC3DModel) {
      this._data.unshift({ id: 0, custom: true, battlerName: null, name: T('Creature.custom3D') });
    }
  };

  Window_BattlerList.prototype.item = function () {
    return this._data[this.index()];
  };

  Window_BattlerList.prototype.drawItem = function (index) {
    const item = this._data[index];
    if (item) {
      const rect = this.itemLineRect(index);
      this.drawText(item.name, rect.x, rect.y, rect.width);
    }
  };

  Window_BattlerList.prototype.refresh = function () {
    this.makeItemList();
    this.contents.clear();
    this.drawAllItems();
  };

  Window_BattlerList.prototype.select = function (index) {
    Window_Selectable.prototype.select.call(this, index);
    // Trigger the select handler when selection changes
    if (this.isHandled('select')) {
      this.callHandler('select');
    }
  };

  // ============================================================================
  // Window_BattlerPreview - Preview of selected battler
  // ============================================================================
  function Window_BattlerPreview() {
    this.initialize(...arguments);
  }

  Window_BattlerPreview.prototype = Object.create(Window_Base.prototype);
  Window_BattlerPreview.prototype.constructor = Window_BattlerPreview;

  Window_BattlerPreview.prototype.initialize = function (rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this._currentBattler = null;
  };

  Window_BattlerPreview.prototype.setBattler = function (filename) {
    if (this._currentBattler !== filename) {
      this._currentBattler = filename;
      this.refresh();
    }
  };

  Window_BattlerPreview.prototype.refresh = function () {
    this.contents.clear();

    if (!this._currentBattler) {
      this.drawText(T('Creature.selectABattler'), 0, 0, this.contentsWidth(), 'center');
      return;
    }

    const bitmap = ImageManager.loadEnemy(this._currentBattler);
    if (!bitmap.isReady()) {
      bitmap.addLoadListener(() => this.refresh());
      return;
    }

    // Draw the battler image centered in the preview window
    const maxWidth = this.contentsWidth() - 16;
    const maxHeight = this.contentsHeight() - 16;

    // Calculate aspect ratio and scale accordingly
    const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
    const scaledWidth = Math.floor(bitmap.width * scale);
    const scaledHeight = Math.floor(bitmap.height * scale);

    // Center the battler in the window
    const x = Math.floor((this.contentsWidth() - scaledWidth) / 2);
    const y = Math.floor((this.contentsHeight() - scaledHeight) / 2);

    // Draw the battler image
    this.contents.blt(
      bitmap,
      0, 0, bitmap.width, bitmap.height,
      x, y, scaledWidth, scaledHeight
    );
  };

  // ============================================================================
  // Creature sheets, read from NPCs.json
  //
  // This board is the other half of the humanoid one (CharacterSpriteGridSelector):
  // that scene offers every sheet EXCEPT the two beast folders, this one offers
  // those two and nothing else. The same pair of flags divides them, so moving a
  // sheet between folders changes which board it appears on and neither list has
  // to be kept by hand - which is what the hardcoded table that used to live here
  // was for, and why it fell out of step with the folders twice over.
  //
  // isAnimal: true -> drawn from the sheet's own frame layout rather than the
  // forced middle-column/facing-down the Monsters folder is drawn with.
  // ============================================================================
  const beastSheetLabel = (key) =>
    key.slice(key.indexOf('/') + 1)
      .replace(/[!$]/g, '')
      .replace(/_/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();

  // Every animal/creature sheet the given archetypes may wear. Archetype is the
  // second filter and the reason this reads the DB at all: a creature is built
  // from an archetype first (step 1), so once the player has said "Slime" the
  // board shows the slimes and not the herd. NPCs.json Archetype values are
  // Archetypes.json keys, the same vocabulary step 1 picks from, so the
  // match is a plain lookup. With nothing chosen every beast sheet is offered,
  // which is what this step did before.
  const beastSheetEntries = (archetypes) => {
    const db = window.WorldGen && window.WorldGen.NPCs;
    if (!db) return [];
    const wanted = (archetypes && archetypes.length) ? archetypes : null;
    const out = [];
    for (const key of Object.keys(db)) {
      const e = db[key];
      if (!e || (e.animal !== true && e.creature !== true)) continue;
      if (wanted && !wanted.includes(e.Archetype)) continue;
      out.push({ displayName: beastSheetLabel(key), path: key, index: 0, isAnimal: true });
    }
    return out;
  };

  // ============================================================================
  // Window_CharacterSelect - Grid of character sprites (monsters + animals)
  // ============================================================================
  function Window_CharacterSelect() {
    this.initialize(...arguments);
  }

  Window_CharacterSelect.prototype = Object.create(Window_Selectable.prototype);
  Window_CharacterSelect.prototype.constructor = Window_CharacterSelect;

  Window_CharacterSelect.prototype.initialize = function (rect) {
    this._images = [];  // array of { displayName, path, index, isAnimal }
    this._bitmaps = [];
    this._archetypes = [];
    Window_Selectable.prototype.initialize.call(this, rect);
    this.loadImages();
  };

  Window_CharacterSelect.prototype.setArchetypes = function (archetypes) {
    this._archetypes = archetypes || [];
    this.loadImages();
  };

  Window_CharacterSelect.prototype.processCursorMove = function () {};
  Window_CharacterSelect.prototype.processHandling = function () {};
  Window_CharacterSelect.prototype.processTouch = function () {};

  Window_CharacterSelect.prototype.maxCols = function () {
    return 6; // Matches the 6-column sprite board (.cc-sprite-board)
  };

  Window_CharacterSelect.prototype.maxItems = function () {
    return this._images.length;
  };

  Window_CharacterSelect.prototype.itemHeight = function () {
    return 120;
  };

  Window_CharacterSelect.prototype.loadImages = function () {
    this._images = [];
    this._bitmaps = [];

    // The file name, normalized: the "$"/"!" markers dropped and CamelCase
    // split into words. It used to drop the first word as well, so half the
    // folder was listed under the tail of its own name ("Acid Ooze" as
    // "Ooze"), and sheets that share a tail were indistinguishable.
    const formatName = (name) =>
      name.replace(/[\$!]/g, '')
        .replace(/_/g, ' ')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();

    const entries = [];

    const { Archetypes } = window.Health || {};
    const allowedSprites = new Set();
    if (Archetypes && this._archetypes.length > 0) {
      for (const archKey of this._archetypes) {
        const arch = Archetypes[archKey];
        if (arch && arch.sprites) {
          arch.sprites.forEach(s => allowedSprites.add(s));
        }
      }
    }

    // Load monster sprites from img/characters/Monsters/
    const fs = require('fs');
    const path = require('path');
    const monstersPath = path.join(path.dirname(process.mainModule.filename), 'img/characters/Monsters/');

    try {
      const files = fs.readdirSync(monstersPath);
      for (const file of files) {
        const filePath = path.join(monstersPath, file);
        if (fs.statSync(filePath).isFile() && /\.(png|jpg|jpeg)$/i.test(file)) {
          const name = file.replace(/\.(png|jpg|jpeg)$/i, '');
          const normalizedName = name.replace(/^[\$!]/, '');

          // Only include if in allowedSprites or if no archetypes were provided (default behavior)
          if (this._archetypes.length === 0 || allowedSprites.has(normalizedName)) {
            entries.push({ displayName: formatName(name), path: 'Monsters/' + name, index: 0, isAnimal: false });
          }
        }
      }
    } catch (error) {
      console.error('Error loading monster character images:', error);
    }

    // Add the animal and creature sheets whose archetype the player chose. An
    // archetype filter no longer empties this half of the board: it narrows it,
    // which is the point of tagging the two folders by archetype at all. A
    // Slime archetype now brings the slime sheets with it instead of leaving
    // the player none of the folder's own art to pick from.
    for (const a of beastSheetEntries(this._archetypes)) entries.push(a);

    // Sort all entries alphabetically by displayName (case-insensitive)
    entries.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    this._images = entries;
    this._bitmaps = entries.map(e => ImageManager.loadCharacter(e.path));

    this.refresh();
  };

  Window_CharacterSelect.prototype.item = function () {
    return this._images[this.index()] || null;
  };

  Window_CharacterSelect.prototype.drawItem = function (index) {
    if (index < 0 || index >= this._images.length) return;

    const entry = this._images[index];
    const rect = this.itemRect(index);
    const bitmap = this._bitmaps[index];

    if (!bitmap) return;
    if (!bitmap.isReady()) {
      bitmap.addLoadListener(() => this.redrawItem(index));
      return;
    }

    let pw, ph, sx, sy;

    if (entry.isAnimal) {
      // Animals: respect isBigCharacter flag, no hardcoded frame/direction forcing
      const big = ImageManager.isBigCharacter(entry.path);
      if (big) {
        // !$ single big character: 3 frames × 4 directions
        pw = bitmap.width / 3;
        ph = bitmap.height / 4;
        const pattern = 1;                  // standing frame
        const dirRow = 0;                   // row 0 = facing down
        sx = pattern * pw;
        sy = dirRow * ph;
      } else {
        // Multi-character sheet: 12 columns × 8 rows
        pw = bitmap.width / 12;
        ph = bitmap.height / 8;
        const ci = entry.index;
        const pattern = 1;
        sx = ((ci % 4) * 3 + pattern) * pw;
        sy = (Math.floor(ci / 4) * 4) * ph;  // row 0 within character = facing down
      }
    } else {
      // Monsters: forced middle column, facing down (existing behaviour)
      pw = bitmap.width / 3;
      ph = bitmap.height / 4;
      sx = pw;   // column 1
      sy = 0;    // row 0 = facing down
    }

    // Sprite drawing area (top part)
    const textHeight = 24;
    const spriteRectHeight = rect.height - textHeight;
    const scale = Math.min((rect.width - 8) / pw, (spriteRectHeight - 8) / ph, 1.0);
    const dw = pw * scale;
    const dh = ph * scale;
    const dx = rect.x + (rect.width - dw) / 2;
    const dy = rect.y + (spriteRectHeight - dh) / 2;

    this.contents.blt(bitmap, sx, sy, pw, ph, dx, dy, dw, dh);

    // Name drawing area (bottom part)
    const oldFontSize = this.contents.fontSize;
    this.contents.fontSize = 14;
    this.drawText(entry.displayName, rect.x, rect.y + spriteRectHeight, rect.width, 'center');
    this.contents.fontSize = oldFontSize;
  };

  Window_CharacterSelect.prototype.refresh = function () {
    this.contents.clear();
    this.drawAllItems();
  };

  Window_CharacterSelect.prototype.update = function () {
    Window_Selectable.prototype.update.call(this);
  };

  // ============================================================================
  // Window_CreateCreatureMode - Baseline/Hybrid choice
  // ============================================================================
  function Window_CreateCreatureMode() {
    this.initialize(...arguments);
  }

  Window_CreateCreatureMode.prototype = Object.create(Window_Command.prototype);
  Window_CreateCreatureMode.prototype.constructor = Window_CreateCreatureMode;

  Window_CreateCreatureMode.prototype.initialize = function (rect) {
    Window_Command.prototype.initialize.call(this, rect);
  };

  Window_CreateCreatureMode.prototype.processCursorMove = function () {};
  Window_CreateCreatureMode.prototype.processHandling = function () {};
  Window_CreateCreatureMode.prototype.processTouch = function () {};

  Window_CreateCreatureMode.prototype.maxCols = function () {
    return 2;
  };

  Window_CreateCreatureMode.prototype.makeCommandList = function () {
    this.addCommand(T('Creature.baseline'), "baseline");
    this.addCommand(T('Creature.hybrid'), "hybrid");
  };

  Window_CreateCreatureMode.prototype.cursorDown = function (wrap) {
    this.cursorRight(wrap);
  };

  Window_CreateCreatureMode.prototype.cursorUp = function (wrap) {
    this.cursorLeft(wrap);
  };


  // ============================================================================
  // Window_ArchetypeParts - Display archetype parts
  // ============================================================================
  function Window_ArchetypeParts() {
    this.initialize(...arguments);
  }

  Window_ArchetypeParts.prototype = Object.create(Window_Base.prototype);
  Window_ArchetypeParts.prototype.constructor = Window_ArchetypeParts;

  Window_ArchetypeParts.prototype.initialize = function (rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this._arch1Key = null;
    this._arch2Key = null;
  };

  Window_ArchetypeParts.prototype.setArchetypes = function (arch1Key, arch2Key) {
    if (this._arch1Key !== arch1Key || this._arch2Key !== arch2Key) {
      this._arch1Key = arch1Key;
      this._arch2Key = arch2Key;
      this.refresh();
    }
  };

  Window_ArchetypeParts.prototype.refresh = function () {
    this.contents.clear();
    const { Archetypes } = window.Health || {};
    if (!Archetypes) return;

    const arch1 = this._arch1Key ? Archetypes[this._arch1Key] : null;
    const arch2 = this._arch2Key ? Archetypes[this._arch2Key] : null;

    if (!arch1 && !arch2) {
      this.drawText(T('Creature.selectAnArchetype'), 0, 0, this.contentsWidth(), "center");
      return;
    }

    const mergedParts = {};

    // Add parts from Arch 1
    if (arch1) {
      for (const partKey in arch1.parts) {
        mergedParts[partKey] = { part: arch1.parts[partKey], from: 1 };
      }
    }
    // Add/overwrite parts from Arch 2
    if (arch2) {
      for (const partKey in arch2.parts) {
        mergedParts[partKey] = { part: arch2.parts[partKey], from: 2 };
      }
    }

    let y = 0;
    const lineHeight = this.lineHeight();
    const titleWidth = this.contentsWidth() / 2;

    // Draw Titles
    if (arch1) {
      this.changeTextColor(ColorManager.systemColor());
      const arch1Name = window.getArchetypeText(`enemyArchetypes.${this._arch1Key.toLowerCase()}.name`) /* i18n-ignore: enemyArchetypes.json key */ || this._arch1Key;
      this.drawText(arch1Name, 0, y, titleWidth);
      this.resetTextColor();
    }
    if (arch2) {
      this.changeTextColor(ColorManager.crisisColor());
      const arch2Name = window.getArchetypeText(`enemyArchetypes.${this._arch2Key.toLowerCase()}.name`) /* i18n-ignore: enemyArchetypes.json key */ || this._arch2Key;
      this.drawText(arch2Name, titleWidth, y, titleWidth);
      this.resetTextColor();
    }
    y += lineHeight + 4;
    this.contents.fillRect(0, y - 2, this.contentsWidth(), 2, ColorManager.gaugeBackColor());

    // Draw Merged Part List
    for (const partKey in mergedParts) {
      const { part, from } = mergedParts[partKey];
      const name = window.getArchetypeText(part.name);

      // Color-code based on origin
      if (from === 2) {
        // From Arch 2 (or overwrite)
        this.changeTextColor(ColorManager.crisisColor());
      } else {
        // From Arch 1
        this.changeTextColor(ColorManager.normalColor());
      }

      this.drawText(name, 0, y, this.contentsWidth());
      y += lineHeight;

      // Stop if window is full
      if (y > this.contentsHeight() - lineHeight) {
        this.drawText("...", 0, y, this.contentsWidth());
        break;
      }
    }

    this.resetTextColor();
  };

  // ============================================================================
  // Scene_CreateCreature - Main creature creation scene
  // ============================================================================
  function Scene_CreateCreature() {
    this.initialize(...arguments);
  }

  Scene_CreateCreature.prototype = Object.create(Scene_MenuBase.prototype);
  Scene_CreateCreature.prototype.constructor = Scene_CreateCreature;

  // Static method to set target actor ID before opening the scene
  Scene_CreateCreature.setTargetActorId = function (actorId) {
    Scene_CreateCreature._targetActorId = actorId || 1;
  };

  Scene_CreateCreature.prototype.initialize = function () {
    Scene_MenuBase.prototype.initialize.call(this);
    this._selectedArchetype1 = null;
    this._selectedArchetype2 = null;
    this._selectedBattler = null;
    this._selectedCharacter = null;
    this._mode = 'hybrid'; // resolved at confirm: 'baseline' (1 archetype) or 'hybrid' (2)
    this._step = 1; // 1 = archetype(s), 3 = battler, 4 = character (old mode/arch2 steps merged into 1)
    this._targetActorId = Scene_CreateCreature._targetActorId || 1; // Target actor ID (default: 1, can be 1, 2, or 3)
    this._lastStepDOM = -1;
    this._creatureGenSeed = null; // random 3D look seed of the current preview
    this._customModel = false;    // custom 3D model chosen at the battler step
    this._customArchetypeKeys = null;
  };

  Scene_CreateCreature.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    // Battler step shows a live procedural 3D model (reusing the Bestiary
    // viewer) when the 3D battler system is available; otherwise it falls back
    // to the flat 2D enemy image.
    this._show3DCreature = (typeof THREE !== 'undefined' && window.Battler3D && !!window.Battler3D.create);
    this._creature3D = null;
    this._creature3DEnemyId = -1;
    this._wasdInput = { up: false, down: false, left: false, right: false };
    this._wasdHeld = { up: false, down: false, left: false, right: false };
    this._wasdHoldFrames = { up: 0, down: 0, left: 0, right: 0 };
    this._wasdListener = (event) => {
      if (event.repeat) return;
      const windowObj = this._getActiveWindow();
      if (!windowObj || !windowObj.active) return;
      const key = event.key.toLowerCase();
      if (key === "w") { this._wasdInput.up = true; this._wasdHeld.up = true; event.preventDefault(); }
      if (key === "s") { this._wasdInput.down = true; this._wasdHeld.down = true; event.preventDefault(); }
      if (key === "a") { this._wasdInput.left = true; this._wasdHeld.left = true; event.preventDefault(); }
      if (key === "d") { this._wasdInput.right = true; this._wasdHeld.right = true; event.preventDefault(); }
    };
    this._wasdUpListener = (event) => {
      const key = event.key.toLowerCase();
      if (key === "w") { this._wasdHeld.up = false; this._wasdHoldFrames.up = 0; }
      if (key === "s") { this._wasdHeld.down = false; this._wasdHoldFrames.down = 0; }
      if (key === "a") { this._wasdHeld.left = false; this._wasdHoldFrames.left = 0; }
      if (key === "d") { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
    };
    window.addEventListener("keydown", this._wasdListener);
    window.addEventListener("keyup", this._wasdUpListener);
    this.createHelpWindow();
    this.createModeWindow();
    this.createArchetypeWindow();
    this.createArchetypePartsWindow();
    this.createBattlerWindow();
    this.createCharacterWindow();

    // Resume after the custom 3D model editor. The editor is a separate scene,
    // so RMMZ recreated this one fresh on pop; restore the flow from the static
    // and land on the sprite step (confirm) or back on the battler step (cancel)
    // rather than restarting from archetype selection.
    const resume = Scene_CreateCreature._resumeCreature;
    if (resume) {
      Scene_CreateCreature._resumeCreature = null;
      this._targetActorId = resume.targetActorId || this._targetActorId;
      this._selectedArchetype1 = resume.arch1 || null;
      this._selectedArchetype2 = resume.arch2 || null;
      this._mode = resume.mode || "baseline";
      this._customArchetypeKeys = resume.keys || null;
      const result = window.Scene_CC3DModel ? window.Scene_CC3DModel._creatureResult : null;
      if (window.Scene_CC3DModel) window.Scene_CC3DModel._creatureResult = null;
      if (result === "confirm") {
        this._customModel = true;
        this.showStep(4); // model saved -> pick the overworld sprite
      } else {
        this._customModel = false;
        this.showStep(3); // cancelled -> back to battler / Custom selection
      }
    } else {
      this.showStep(1);
    }
    this.createUIOverlay();
  };

  Scene_CreateCreature.prototype.terminate = function () {
    Scene_MenuBase.prototype.terminate.call(this);
    this.cleanupCreature3D();
    if (window.CCNav) window.CCNav.detach(this);
    if (this._wasdListener) {
      window.removeEventListener("keydown", this._wasdListener);
      this._wasdListener = null;
    }
    if (this._wasdUpListener) {
      window.removeEventListener("keyup", this._wasdUpListener);
      this._wasdUpListener = null;
    }
    if (this._dndContainer) {
      window.CCPanel.hide(this._dndContainer);
    }
  };

  Scene_CreateCreature.prototype.createUIOverlay = function () {
    // 1. Mute MZ windows
    if (this._helpWindow) {
      this._helpWindow.visible = false;
      this._helpWindow.opacity = 0;
    }
    if (this._modeWindow) {
      this._modeWindow.visible = false;
      this._modeWindow.opacity = 0;
    }
    if (this._archetypeWindow) {
      this._archetypeWindow.visible = false;
      this._archetypeWindow.opacity = 0;
    }
    if (this._archetypePartsWindow) {
      this._archetypePartsWindow.visible = false;
      this._archetypePartsWindow.opacity = 0;
    }
    if (this._battlerListWindow) {
      this._battlerListWindow.visible = false;
      this._battlerListWindow.opacity = 0;
    }
    if (this._battlerPreviewWindow) {
      this._battlerPreviewWindow.visible = false;
      this._battlerPreviewWindow.opacity = 0;
    }
    if (this._characterWindow) {
      this._characterWindow.visible = false;
      this._characterWindow.opacity = 0;
    }

    // 2. Create container
    let container = document.getElementById("character-creation-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "character-creation-container";
      document.body.appendChild(container);
    }

    // Clear any pending timeout and ensure styles are clean
    if (window._ccOverlayTimeout) {
      clearTimeout(window._ccOverlayTimeout);
      window._ccOverlayTimeout = null;
    }

    this._dndContainer = container;
    window.CCPanel.show(this._dndContainer);
    this._dndContainer.innerHTML = ""; // Wipe clean to prevent stale DOM layout leaking

    this._lastStep = -1;
    this._lastIndex = -1;
    this._lastStepDOM = -1;

    // Wheel + L2/R2 scrolling for the card boards. See CCScroll.
    if (window.CCScroll) window.CCScroll.bindWheel(this._dndContainer);
    // Everything on the page that is not a card on a board - the buttons under
    // the boards above all - is walked with the focus ring. See
    // CharacterCreationNav.js.
    if (window.CCNav) window.CCNav.attach(this, this._dndContainer);

    this.refreshUIOverlayDOM();
  };

  Scene_CreateCreature.prototype.getSpriteStyle = function (spriteName, spriteIndex, scale) {
    return window.CCArt.sprite(spriteName, spriteIndex, Math.round(48 * (scale || 1)));
  };

  Scene_CreateCreature.prototype.refreshUIOverlayDOM = function () {
    if (!this._dndContainer) return;

    const activeIndex = this._step === 0 ? this._modeWindow.index() :
      this._step === 1 || this._step === 2 ? this._archetypeWindow.index() :
      this._step === 3 ? this._battlerListWindow.index() :
      this._characterWindow.index();

    // Only a real step change rebuilds the whole spread. The archetype screen is
    // always in multi-select ('hybrid') mode, so keying off the mode rebuilt both
    // pages on every cursor move and made the board flash.
    const isStepChange = (this._lastStepDOM !== this._step);

    let leftHtml = "";
    let rightHtml = "";

    if (this._step === 0) {
      // --- INCUBATION MODE SELECTION (STEP 0) ---
      const activeIdx = this._modeWindow.index();

      leftHtml = `
        <div class="cc-page cc-page-left">
          <h2 class="cc-header-gothic">${T('CharCreate.creatureCreation')}</h2>
          <p class="cc-text-desc">${T('CharCreate.chooseATypeOfCreation')}</p>

          <div class="cc-select-grid cc-spaced">
            <div class="cc-card-option ${activeIdx === 0 ? 'selected' : ''}" onclick="SceneManager._scene.onModeCardClick(0)">
              <div class="cc-option-title">${T('CharCreate.baselineCreature')}</div>
            </div>
            <div class="cc-card-option ${activeIdx === 1 ? 'selected' : ''}" onclick="SceneManager._scene.onModeCardClick(1)">
              <div class="cc-option-title">${T('CharCreate.hybridMonstrosity')}</div>
            </div>
          </div>
        </div>
      `;

      rightHtml = `
        <div class="cc-page cc-page-right cc-page-centered">
          <h2 class="cc-header-gothic">${T('CharCreate.archetipes')}</h2>

          
          <div class="cc-tube-container">
            <div class="cc-tube-fluid"></div>
            <div class="cc-tube-label">TUBE-01</div>   <!-- i18n-ignore: equipment serial -->
          </div>

          ${window.CCButtons.panel({
            back: window.CCButtons.button(window.CCButtons.backLabel(), {
              onclick: "SceneManager._scene.onCreationCancel()",
            }),
            next: window.CCButtons.button(window.CCButtons.continueLabel(), {
              onclick: "SceneManager._scene.onModeCardConfirm()",
              confirm: true,
            }),
            cls: "cc-nav--spaced",
          })}
        </div>
      `;
    } else if (this._step === 1 || this._step === 2) {
      // --- BASE/HYBRID ARCHETYPE SELECTION (STEP 1 & 2) ---
      const activeItem = this._archetypeWindow.item();
      const activeIdx = this._archetypeWindow.index();

      let leftSubheaderName = "";
      let partsHtml = "";
      // How many weapons this body could carry, printed under its name.
      let weaponsLine = "";

      if (this._mode === 'baseline') {
        if (activeItem) {
          leftSubheaderName = activeItem.name;
          const { Archetypes } = window.Health || {};
          const arch = Archetypes ? Archetypes[activeItem.key] : null;
          if (arch) {
            weaponsLine = weaponSlotLine(arch.parts || {});
            // Base skills section
            let skillsHtml = "";
            if (arch.skills && arch.skills.length > 0) {
              skillsHtml = `<div class="cc-dossier-section-title cc-dossier-section-title--muted">${T('CharCreate.baseSkills')}</div>` +
                arch.skills.map(sid => {
                  const sname = getSkillDisplayName(sid) || sid;
                  return `<div class="cc-dossier-row cc-flush-below"><span class="cc-dossier-label cc-label-muted">${sname}</span><span class="cc-dossier-value cc-value-quiet">#${sid}</span></div>`;
                }).join("");
            }
            // Parts section
            let bodyHtml = "";
            if (arch.parts) {
              bodyHtml = `<div class="cc-dossier-section-title cc-dossier-section-title--anatomy">${T('CharCreate.anatomy')}</div>` +
                Object.keys(arch.parts).map(k => {
                  const p = arch.parts[k];
                  const name = partName(p);
                  const skillName = getSkillDisplayName(p.skillId);
                  const skillInfo = skillName ? `<span class="cc-value-quiet">, ${skillName}</span>` : "";
                  return `
                    <div class="cc-dossier-row cc-flush-below">
                      <span class="cc-dossier-label">${name}:</span>
                      <span class="cc-dossier-value">${p.hpPercent}% HP${skillInfo}</span>
                    </div>
                  `;
                }).join("");
            }
            partsHtml = skillsHtml + bodyHtml;
          }
        }
      } else {
        // Hybrid mode: display parts of BOTH selected archetypes
        const { Archetypes } = window.Health || {};
        const arch1 = this._selectedArchetype1 ? Archetypes[this._selectedArchetype1] : null;
        const arch2 = this._selectedArchetype2 ? Archetypes[this._selectedArchetype2] : null;

        if (!arch1 && !arch2) {
          // No selections: show hovered/active item as preview
          if (activeItem) {
            leftSubheaderName = activeItem.name + ` (${T('CharCreate.preview')})`;
            const arch = Archetypes ? Archetypes[activeItem.key] : null;
            if (arch) {
              weaponsLine = weaponSlotLine(arch.parts || {});
              // Base skills section
              let skillsHtml = "";
              if (arch.skills && arch.skills.length > 0) {
                skillsHtml = `<div class="cc-dossier-section-title cc-dossier-section-title--muted">${T('CharCreate.baseSkills')}</div>` +
                  arch.skills.map(sid => {
                    const sname = getSkillDisplayName(sid) || sid;
                    return `<div class="cc-dossier-row cc-flush-below"><span class="cc-dossier-label cc-label-muted">${sname}</span><span class="cc-dossier-value cc-value-quiet">#${sid}</span></div>`;
                  }).join("");
              }
              // Parts section
              let bodyHtml = "";
              if (arch.parts) {
                bodyHtml = `<div class="cc-dossier-section-title cc-dossier-section-title--anatomy">${T('CharCreate.anatomy')}</div>` +
                  Object.keys(arch.parts).map(k => {
                    const p = arch.parts[k];
                    const name = partName(p);
                    const skillName = getSkillDisplayName(p.skillId);
                    const skillInfo = skillName ? `<span class="cc-value-quiet">, ${skillName}</span>` : "";
                    return `
                      <div class="cc-dossier-row cc-flush-below">
                        <span class="cc-dossier-label">${name}:</span>
                        <span class="cc-dossier-value">${p.hpPercent}% HP${skillInfo}</span>
                      </div>
                    `;
                  }).join("");
              }
              partsHtml = skillsHtml + bodyHtml;
            }
          } else {
            leftSubheaderName = "...";
            partsHtml = `<div class="cc-text-desc cc-span-two">${T('CharCreate.selectArchetypes')}</div>`;
          }
        } else {
          // Merged display
          const name1 = this._selectedArchetype1 ? (window.getArchetypeText(`enemyArchetypes.${this._selectedArchetype1.toLowerCase()}.name`) /* i18n-ignore: enemyArchetypes.json key */ || this._selectedArchetype1) : "";
          const name2 = this._selectedArchetype2 ? (window.getArchetypeText(`enemyArchetypes.${this._selectedArchetype2.toLowerCase()}.name`) /* i18n-ignore: enemyArchetypes.json key */ || this._selectedArchetype2) : "";
          
          if (name1 && name2) {
            leftSubheaderName = `${name1} + ${name2}`;
          } else {
            leftSubheaderName = name1 || name2;
          }

          // Exactly the anatomy applyHybridArchetype will build, duplicated
          // arms and hands included, so the count under the name is the count
          // the creature ends up with.
          const splicedParts = mergeParts(
            [this._selectedArchetype1, this._selectedArchetype2].filter(Boolean));
          weaponsLine = weaponSlotLine(splicedParts);
          const mergedParts = {};
          for (const partKey in splicedParts) {
            const part = splicedParts[partKey];
            // fromArchetype is an index into the list above, which drops a
            // missing primary, so read the badge off the key that is actually there.
            const owner = this._selectedArchetype1 ? part.fromArchetype : 1;
            mergedParts[partKey] = { part: part, from: owner === 0 ? 1 : 2 };
          }

          // Base skills from both archetypes (unique union)
          const mergedSkillIds = new Set();
          if (arch1 && arch1.skills) arch1.skills.forEach(sid => mergedSkillIds.add(sid));
          if (arch2 && arch2.skills) arch2.skills.forEach(sid => mergedSkillIds.add(sid));
          let skillsHtml = "";
          if (mergedSkillIds.size > 0) {
            skillsHtml = `<div class="cc-dossier-section-title cc-dossier-section-title--muted">${T('CharCreate.baseSkills')}</div>` +
              Array.from(mergedSkillIds).map(sid => {
                const sname = getSkillDisplayName(sid) || sid;
                const fromArch1 = arch1 && arch1.skills && arch1.skills.includes(sid);
                const fromArch2 = arch2 && arch2.skills && arch2.skills.includes(sid);
                let badges = "";
                if (fromArch1 && fromArch2) {
                  badges = `<span class="cc-role-badge primary">${T('Creature.ui.primaryBadge')}</span><span class="cc-role-badge secondary">${T('Creature.ui.secondaryBadge')}</span>`;
                } else if (fromArch1) {
                  badges = `<span class="cc-role-badge primary">${T('Creature.ui.primaryBadge')}</span>`;
                } else {
                  badges = `<span class="cc-role-badge secondary">${T('Creature.ui.secondaryBadge')}</span>`;
                }
                return `<div class="cc-dossier-row cc-flush-below"><span class="cc-dossier-label cc-label-muted">${sname}</span><span class="cc-dossier-value cc-value-quiet">#${sid}${badges}</span></div>`;
              }).join("");
          }

          let bodyHtml = `<div class="cc-dossier-section-title cc-dossier-section-title--anatomy">${T('CharCreate.anatomy')}</div>` +
            Object.keys(mergedParts).map(partKey => {
              const { part, from } = mergedParts[partKey];
              const name = partName(part);
              const originLabel = from === 2 
                ? `<span class="cc-role-badge secondary">${T('Creature.ui.secondaryBadge')}</span>`
                : `<span class="cc-role-badge primary">${T('Creature.ui.primaryBadge')}</span>`;
              const skillName = getSkillDisplayName(part.skillId);
              const skillInfo = skillName ? `<span class="cc-value-quiet">, ${skillName}</span>` : "";
              
              return `
                <div class="cc-dossier-row cc-flush-below cc-row-inline">
                  <div class="cc-row-inline">
                    <span class="cc-dossier-label ${from === 2 ? 'cc-parent-ink secondary' : 'cc-parent-ink primary'}">${name}</span>
                    ${originLabel}
                  </div>
                  <span class="cc-dossier-value cc-value-strong">${part.hpPercent}% HP${skillInfo}</span>
                </div>
              `;
            }).join("");

          partsHtml = skillsHtml + bodyHtml;
        }
      }

      const archetypeCards = this._archetypeWindow._data.map((item, idx) => {
        // Committed picks show the checkmark badge (.selected); in hybrid mode a
        // Primary/Secondary caption disambiguates the two. Baseline mode marks
        // the cursor itself as selected. The cursor on an unpicked card gets the
        // lighter .highlighted state.
        let isSelected = false;
        let selectionBadge = "";
        // In a goblin world the primary is the world's, not the player's: it is
        // drawn committed and greyed, since pressing it does nothing.
        const isLockedPrimary = this.isArchetypePrimaryLocked() &&
                                item.key === this._selectedArchetype1;

        if (this._mode === 'baseline') {
          isSelected = idx === activeIdx;
        } else {
          if (this._selectedArchetype1 === item.key) {
            isSelected = true;
            selectionBadge = `<div class="cc-archetype-role primary">${
              isLockedPrimary ? T('CharCreate.primaryLocked') : T('CharCreate.primary')}</div>`;
          } else if (this._selectedArchetype2 === item.key) {
            isSelected = true;
            selectionBadge = `<div class="cc-archetype-role secondary">${T('CharCreate.secondary')}</div>`;
          }
        }

        const isCursor = !isSelected && idx === activeIndex;
        return `
          <div class="cc-card-option ${isSelected ? 'selected' : isCursor ? 'highlighted' : ''}"${
            isLockedPrimary ? ' data-locked="1"' : ''
          } onclick="SceneManager._scene.onArchetypeCardClick(${idx})">
            <div class="cc-option-title">${item.name}</div>
            ${selectionBadge}
          </div>
        `;
      }).join("");

      const stepTitle = T('CharCreate.archetypeS');

      const stepDesc = T('CharCreate.selectOneArchetypeTemplateForABaselineCreatu');

      const isConfirmDisabled = !this._selectedArchetype1;
      const bothReady = !!this._selectedArchetype1; // ready to confirm with one or two picks
      const confirmFocusClass = bothReady ? "cc-btn-ready" : "";

      leftHtml = `
        <div class="cc-page cc-page-left cc-col">
          <h2 class="cc-header-gothic">${stepTitle}</h2>
          <p class="cc-text-desc">${stepDesc}</p>

          <div class="cc-select-grid cc-compact cc-three-col cc-scroll-pane cc-grid-start">
            ${archetypeCards}
          </div>
        </div>
      `;

      rightHtml = `
        <div class="cc-page cc-page-right">
          <h2 class="cc-header-gothic">${T('CharCreate.biology')}</h2>

          <div class="cc-dossier-card cc-gap-above-wide cc-scroll-pane">
            <h3 class="cc-subheader">${leftSubheaderName || "..."}</h3>
            ${weaponsLine ? `<div class="cc-weapon-slots">${weaponsLine}</div>` : ""}
            <div class="cc-dossier-grid cc-dossier-grid-single">
              ${partsHtml || `<div class="cc-text-desc cc-span-full">${T('CharCreate.noAnatomicalOrgansDefined')}</div>`}
            </div>
          </div>

          ${window.CCButtons.panel({
            back: window.CCButtons.button(window.CCButtons.backLabel(), {
              onclick: "SceneManager._scene.onArchetypeCancel()",
            }),
            next: window.CCButtons.button(window.CCButtons.continueLabel(), {
              onclick: "SceneManager._scene.onArchetypeConfirm()",
              confirm: true,
              attrs: isConfirmDisabled
                ? "disabled" : "",
              cls: isConfirmDisabled ? "cc-btn-disabled" : confirmFocusClass,
            }),
            cls: "cc-nav--spaced",
          })}
        </div>
      `;
    } else if (this._step === 3) {
      // --- BATTLER SELECTION (STEP 3) ---
      const activeItem = this._battlerListWindow.item();
      const activeIdx = this._battlerListWindow.index();

      // Resolve a procedural 3D archetype for the highlighted enemy. When the 3D
      // battler system is available and this enemy maps to a model, show a single
      // live viewport (mirroring the Bestiary); otherwise fall back to the 2D
      // enemy image.
      const activeEnemy = (activeItem && activeItem.id && $dataEnemies) ? $dataEnemies[activeItem.id] : null;
      const activeArchKey = (activeEnemy && window.Battler3D && window.Battler3D.resolveKey)
        ? window.Battler3D.resolveKey(activeEnemy) : null;
      const canShow3D = this._show3DCreature && !!activeArchKey;

      let previewImgHtml = "";
      if (activeItem && activeItem.custom) {
        previewImgHtml = `
          <div class="cc-text-centered cc-pad-roomy">
            <div class="cc-glyph-display"><span class="cc-rpg-icon" style="${window.CCArt.icon(108, 48)}"></span></div>
            <div class="cc-title-display--sm cc-gap-below">${T('CharCreate.custom3dModel')}</div>
            <div class="cc-lede--page">${T('CharCreate.sculptAUniqueCreatureFromMixedPartsSeededFro')}</div>
          </div>
        `;
      } else if (canShow3D) {
        // The model IS this page, so the viewport takes the height the page can
        // spare (the header above it is all that shares the column) instead of a
        // fixed 380px box that left the creature small in a mostly empty page.
        // No caption under it: the drag/zoom controls are discovered by grabbing
        // the model, and the hint line only ate viewport height.
        previewImgHtml = `
          <canvas id="creature-3d-canvas" class="cc-model-canvas"></canvas>
        `;
      } else if (activeItem && activeItem.battlerName) {
        previewImgHtml = `
          <img class="cc-battler-preview" src="img/enemies/${activeItem.battlerName}.png" />
        `;
      } else {
        previewImgHtml = `<span class="cc-value-loading">${T('CharCreate.loadingBattlerAsset')}</span>`;
      }

      // Name-only entries, so they render as flat roster rows rather than the
      // poster-sized cards the archetype steps use: there is nothing to fill a
      // card's face with, and its plate paints a slab behind every name.
      const battlerCards = this._battlerListWindow._data.map((item, idx) => {
        const isSelected = idx === activeIdx;
        return `
          <div class="cc-wanted-card cc-card-flat ${isSelected ? 'selected' : ''}" onclick="SceneManager._scene.onBattlerCardClick(${idx})">
            <div class="cc-wanted-name">${item.name}</div>
          </div>
        `;
      }).join("");

      leftHtml = `
        <div class="cc-page cc-page-left cc-page-top">
          <h2 class="cc-header-gothic cc-gap-below-wide">${T('CharCreate.profileImage')}</h2>
          <div class="cc-col cc-col-centered cc-span-full cc-items-centered">
            ${previewImgHtml}
          </div>
        </div>
      `;

      rightHtml = `
        <div class="cc-page cc-page-right">
          <h2 class="cc-header-gothic">${T('CharCreate.profileImageSelection')}</h2>
          <p class="cc-text-desc">${T('CharCreate.chooseAProfileImage')}</p>

          <div class="cc-presets-board cc-board-two-col cc-scroll-pane cc-grid-start">
            ${battlerCards}
          </div>

          ${window.CCButtons.panel({
            back: window.CCButtons.button(window.CCButtons.backLabel(), {
              onclick: "SceneManager._scene.onBattlerCancel()",
            }),
            next: window.CCButtons.button(window.CCButtons.continueLabel(), {
              onclick: "SceneManager._scene.onBattlerOk()",
              confirm: true,
            }),
          })}
        </div>
      `;
    } else if (this._step === 4) {
      // --- CHARACTER SPRITE SELECTION (STEP 4) ---
      const activeItem = this._characterWindow.item();
      const activeIdx = this._characterWindow.index();

      const largeSpriteStyle = activeItem ? this.getSpriteStyle(activeItem.path, activeItem.index) : '';

      // The same board the character sprite grid draws (Scene_SpriteGridSelector):
      // the cell is the art and nothing else, so no plate, no caption and no
      // stamp is painted over a 48px sprite. A creature has no bust, so the
      // right page shows the walking sprite alone on the incubator plate, which
      // is what that scene shows for a sheet with no bust of its own.
      const spriteCards = this._characterWindow._images.map((item, idx) => {
        const isSelected = idx === activeIdx;
        return `
          <div class="cc-wanted-card cc-sprite-card ${isSelected ? 'selected' : ''}" title="${item.displayName}" onclick="SceneManager._scene.onCharacterCardClick(${idx})">
            <div class="cc-wanted-sprite" style="${this.getSpriteStyle(item.path, item.index)}"></div>
          </div>
        `;
      }).join("");

      leftHtml = `
        <div class="cc-page cc-page-left cc-col">
          <h2 class="cc-header-gothic">${T('CharCreate.sprites')}</h2>

          <div class="cc-presets-board cc-sprite-board cc-scroll-pane cc-gap-above-wide">
            ${spriteCards}
          </div>
        </div>
      `;

      rightHtml = `
        <div class="cc-page cc-page-right cc-page-centered cc-col-centered">
          <h2 class="cc-header-gothic cc-gap-below">${T('CharCreate.selectedSprite')}</h2>
          <p class="cc-text-desc cc-gap-below">
            ${T('CharCreate.creatureSynthesisComplete')}
          </p>

          <div class="cc-sprite-portrait no-bust">
            <div class="cc-sprite-portrait-sprite" style="${largeSpriteStyle}"></div>
          </div>
          <div class="cc-option-title cc-text-centered">
            ${activeItem ? activeItem.displayName : "..."}
          </div>

          ${window.CCButtons.panel({
            back: window.CCButtons.button(window.CCButtons.backLabel(), {
              onclick: "SceneManager._scene.onCharacterCancel()",
            }),
            next: window.CCButtons.button(window.CCButtons.continueLabel(), {
              onclick: "SceneManager._scene.onCharacterOk()",
              confirm: true,
            }),
            cls: "cc-nav--footed",
          })}
        </div>
      `;
    }

    // Find or create .cc-pockets-spread
    let spread = this._dndContainer.querySelector(".cc-pockets-spread");
    if (!spread) {
      this._dndContainer.innerHTML = `
        <div class="cc-pockets-spread">
          <div class="cc-page cc-page-left"></div>
          <div class="cc-page cc-page-right"></div>
        </div>
      `;
      spread = this._dndContainer.querySelector(".cc-pockets-spread");
    }

    if (isStepChange) {
      // Step changed - fully update both page wrappers inside the spread
      spread.innerHTML = `
        ${leftHtml}
        ${rightHtml}
      `;
    } else {
      // Only selection index changed - optimized partial update!
      const leftPage = spread.querySelector(".cc-page-left");
      const rightPage = spread.querySelector(".cc-page-right");

      if (this._step === 0) {
        if (leftPage) {
          const cards = leftPage.querySelectorAll(".cc-card-option");
          cards.forEach((card, idx) => {
            if (idx === activeIndex) {
              card.classList.add("selected");
            } else {
              card.classList.remove("selected");
            }
          });
        }
      } else if (this._step === 1 || this._step === 2) {
        // Archetype cards are on the left (compact list), biology on the right.
        if (rightPage && rightHtml) {
          const rightInnerHtml = rightHtml.replace(/^\s*<div[^>]*>/, '').replace(/<\/div>\s*$/, '');
          rightPage.innerHTML = rightInnerHtml;
        }
        if (leftPage) {
          const cards = leftPage.querySelectorAll(".cc-card-option");
          cards.forEach((card, idx) => {
            const item = this._archetypeWindow._data[idx];
            const committed = item &&
              (this._selectedArchetype1 === item.key || this._selectedArchetype2 === item.key);
            const isSelected = this._mode === 'baseline' ? idx === activeIndex : !!committed;
            card.classList.toggle("selected", isSelected);
            card.classList.toggle("highlighted", !isSelected && idx === activeIndex);
            // Keep the Primary/Secondary caption in step with the picks without
            // rebuilding the board.
            const oldBadge = card.querySelector(".cc-archetype-role");
            if (oldBadge) oldBadge.remove();
            if (this._mode !== 'baseline' && item) {
              let badgeText = "";
              let badgeRole = "";
              if (this._selectedArchetype1 === item.key) {
                badgeText = T('CharCreate.primary');
                badgeRole = "primary";
              } else if (this._selectedArchetype2 === item.key) {
                badgeText = T('CharCreate.secondary');
                badgeRole = "secondary";
              }
              if (badgeText) {
                const badge = document.createElement("div");
                badge.className = `cc-archetype-role ${badgeRole}`;
                badge.textContent = badgeText;
                card.appendChild(badge);
              }
            }
          });
        }
      } else if (this._step === 3) {
        // Cards are on the right; preview image is on the left, update both
        if (leftPage && leftHtml) {
          const leftInnerHtml = leftHtml.replace(/^\s*<div[^>]*>/, '').replace(/<\/div>\s*$/, '');
          leftPage.innerHTML = leftInnerHtml;
        }
        if (rightPage) {
          const cards = rightPage.querySelectorAll(".cc-wanted-card");
          cards.forEach((card, idx) => {
            card.classList.toggle("selected", idx === activeIndex);
          });
        }
      } else if (this._step === 4) {
        // Cards are on the left; sprite preview is on the right, update both
        if (rightPage && rightHtml) {
          const rightInnerHtml = rightHtml.replace(/^\s*<div[^>]*>/, '').replace(/<\/div>\s*$/, '');
          rightPage.innerHTML = rightInnerHtml;
        }
        if (leftPage) {
          const cards = leftPage.querySelectorAll(".cc-wanted-card");
          cards.forEach((card, idx) => {
            card.classList.toggle("selected", idx === activeIndex);
          });
        }
      }
    }

    // Record states for the next check
    this._lastIndex = activeIndex;
    this._lastStep = this._step;
    this._lastStepDOM = this._step;

    this._scrollToSelectedCard();
    this._syncCreature3D();
  };

  // ============================================================================
  // 3D battler viewport for the battler step (ported from Bestiary.js).
  // Shows a single live procedural model for the highlighted enemy with
  // orbit / pan / zoom, reused across selection changes.
  // ============================================================================
  Scene_CreateCreature.prototype._syncCreature3D = function () {
    // Only the battler step (3) hosts the 3D viewport.
    if (this._step !== 3 || !this._show3DCreature) {
      this.cleanupCreature3D();
      return;
    }
    const item = this._battlerListWindow ? this._battlerListWindow.item() : null;
    const enemy = (item && item.id && $dataEnemies) ? $dataEnemies[item.id] : null;
    const archKey = (enemy && window.Battler3D && window.Battler3D.resolveKey)
      ? window.Battler3D.resolveKey(enemy) : null;
    const canvas = document.getElementById('creature-3d-canvas');
    if (!enemy || !archKey || !canvas) {
      this.cleanupCreature3D();
      return;
    }
    // The left page is rebuilt on every selection change, so the canvas node is
    // new each time. Only skip re-init when both the canvas node and the enemy
    // are unchanged.
    if (this._creature3D && this._creature3D.canvas === canvas && this._creature3DEnemyId === enemy.id) {
      return;
    }
    // initCreature3D() calls cleanupCreature3D() which resets _creature3DEnemyId
    // to -1, so record the id AFTER init for the guard above to take effect.
    this.initCreature3D(enemy, archKey);
    this._creature3DEnemyId = enemy.id;
  };

  Scene_CreateCreature.prototype.initCreature3D = function (enemyData, archKey) {
    this.cleanupCreature3D();
    if (typeof THREE === 'undefined' || !window.Battler3D || !window.Battler3D.create) return;
    const canvas = document.getElementById('creature-3d-canvas');
    if (!canvas) return;

    const rect   = canvas.getBoundingClientRect();
    const width  = Math.max(1, Math.round(rect.width)  || 320);
    const height = Math.max(1, Math.round(rect.height) || 320);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch (e) {
      return;
    }
    if (!renderer || !renderer.getContext || !renderer.getContext()) {
      if (renderer && renderer.dispose) {
        try { renderer.dispose(); } catch (e) {}
      }
      return;
    }
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const keyLight  = new THREE.DirectionalLight(0xfff2d0, 1.4); keyLight.position.set(3, 5, 4);   scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.7); fillLight.position.set(-3, -2, 2); scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 300);
    camera.position.set(0, 0, 8);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const state = {
      renderer, canvas, scene, camera, pivot,
      model: null, rafId: 0, disposed: false, dragging: false, attackTimer: 0, frameAcc: 0,
      activeButton: -1, prev: { x: 0, y: 0 }, clock: new THREE.Clock(), listeners: {}
    };
    this._creature3D = state;

    // Fake battler so the model uses its deterministic per-id look.
    const fakeBattler = { enemyId: () => enemyData.id, index: () => 0 };
    // Every click on a DIFFERENT model re-rolls a random generation seed, so
    // proportions, textures and colours vary between views of the same
    // archetype. The seed is restored right after construction (the seeded
    // draws all happen in the constructor) and persisted on confirm so the
    // previewed look is the one kept (see onBattlerOk / CC3DModel).
    const reseed = 'cc' + (1 + Math.floor(Math.random() * 0x7ffffffe));
    this._creatureGenSeed = reseed;
    const prevGenSeed = window.Battler3D.getGenSeed ? window.Battler3D.getGenSeed() : null;
    if (window.Battler3D.setGenSeed) window.Battler3D.setGenSeed(reseed);
    const battler = window.Battler3D.create(archKey, 0, 0, fakeBattler);
    if (window.Battler3D.setGenSeed && prevGenSeed != null) window.Battler3D.setGenSeed(prevGenSeed);
    if (!battler) {
      try { renderer.dispose(); } catch (e) {}
      try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
      this._creature3D = null;
      return;
    }

    Promise.resolve(battler.load(null, 0, 0, 0)).then(() => {
      if (state.disposed || !battler.model) return;
      try { battler.update(1 / 60); } catch (e) {}
      const box    = new THREE.Box3().setFromObject(battler.model);
      const size   = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      const holder = new THREE.Group();
      holder.position.copy(center).multiplyScalar(-1);
      holder.add(battler.model);
      if (window.PSXShader) window.PSXShader.applyToObject(battler.model);
      pivot.add(holder);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      // Frame on the model's ACTUAL bounding box (the per-id sizeMul is already
      // baked into the geometry, so id size variation stays visible). Dividing
      // sizeMul back out here pulled the camera too close for large-id creatures
      // and clipped them against the viewport edges, so fit on maxDim directly
      // and keep a margin large enough that the attack lunge never clips (#100).
      const fitDist = maxDim / (2 * Math.tan((40 * Math.PI / 180) / 2));
      camera.position.set(0, 0, fitDist * 1.4);
      camera.lookAt(0, 0, 0);
      state.model = battler;
      state.attackTimer = 1.2;
    }).catch(() => {});

    // ── Mouse / touch controls (mirror the Bestiary 3D preview) ─────────
    const L = state.listeners;
    L.onDown = (e) => {
      if (e.button === 0 || e.button === 1) {
        state.activeButton = e.button; state.dragging = true;
        state.prev = { x: e.clientX, y: e.clientY };
        if (e.button === 1) e.preventDefault();
        canvas.classList.add('cc-grabbing');
      }
    };
    L.onMove = (e) => {
      if (state.activeButton === -1) return;
      const dx = e.clientX - state.prev.x, dy = e.clientY - state.prev.y;
      if (state.activeButton === 0) {
        pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012;
      } else if (state.activeButton === 1) {
        const ps = 0.0035 * camera.position.z;
        camera.position.x -= dx * ps; camera.position.y += dy * ps;
      }
      state.prev = { x: e.clientX, y: e.clientY };
    };
    L.onUp = () => { state.activeButton = -1; state.dragging = false; canvas.classList.remove('cc-grabbing'); };
    L.onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't let the page's wheel handler also scroll the list
      camera.position.z = Math.max(1.5, Math.min(60, camera.position.z + e.deltaY * 0.012));
    };
    L.onAux = (e) => { if (e.button === 1) e.preventDefault(); };
    L.onCtx = (e) => e.preventDefault();
    L.onTStart = (e) => { if (e.touches.length === 1) { state.dragging = true; state.activeButton = 0; state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } };
    L.onTMove = (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - state.prev.x, dy = e.touches[0].clientY - state.prev.y;
        pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012;
        state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    L.onTEnd = () => { state.dragging = false; state.activeButton = -1; };

    canvas.addEventListener('mousedown',   L.onDown);
    canvas.addEventListener('mousemove',   L.onMove);
    window.addEventListener('mouseup',     L.onUp);
    canvas.addEventListener('wheel',       L.onWheel, { passive: false });
    canvas.addEventListener('auxclick',    L.onAux);
    canvas.addEventListener('contextmenu', L.onCtx);
    canvas.addEventListener('touchstart',  L.onTStart);
    canvas.addEventListener('touchmove',   L.onTMove);
    window.addEventListener('touchend',    L.onTEnd);

    const FRAME = 1 / 30;
    const animate = () => {
      if (state.disposed) return;
      state.rafId = requestAnimationFrame(animate);
      state.frameAcc += Math.min(state.clock.getDelta(), 0.05);
      if (state.frameAcc < FRAME) return;
      const dt = state.frameAcc;
      state.frameAcc = 0;
      if (state.model) {
        state.attackTimer -= dt;
        if (state.attackTimer <= 0 && state.model.currentAnimation === 'idle') {
          const anim = (state.model.hasAnimation('specialattack') && Math.random() < 0.4)
            ? 'specialattack' : 'attack';
          try { state.model.playAnimation(anim, false); } catch (e) {}
          state.attackTimer = 2.4 + Math.random() * 1.6;
        }
        try { state.model.update(dt); } catch (e) {}
      }
      if (window.PSXShader) {
        window.PSXShader.render(renderer, scene, camera);
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();
  };

  Scene_CreateCreature.prototype.cleanupCreature3D = function () {
    const s = this._creature3D;
    if (!s) return;
    s.disposed = true;
    cancelAnimationFrame(s.rafId);
    const L = s.listeners || {}, c = s.canvas;
    if (c) {
      c.removeEventListener('mousedown',   L.onDown);
      c.removeEventListener('mousemove',   L.onMove);
      c.removeEventListener('wheel',       L.onWheel);
      c.removeEventListener('auxclick',    L.onAux);
      c.removeEventListener('contextmenu', L.onCtx);
      c.removeEventListener('touchstart',  L.onTStart);
      c.removeEventListener('touchmove',   L.onTMove);
    }
    window.removeEventListener('mouseup',  L.onUp);
    window.removeEventListener('touchend', L.onTEnd);
    // A new WebGLRenderer is built for every model previewed, so the context has
    // to be released here as well: dispose() alone leaves it alive and the
    // browser eventually evicts the OLDEST live context, which is the game's own
    // canvas (it blanks to black).
    try { s.renderer.dispose(); } catch (e) {}
    try { if (s.renderer.forceContextLoss) s.renderer.forceContextLoss(); } catch (e) {}
    this._creature3D = null;
    this._creature3DEnemyId = -1;
  };

  Scene_CreateCreature.prototype._scrollToSelectedCard = function () {
    let boardSelector = null;
    let cardSelector = '.cc-wanted-card';
    let activeIndex = -1;
    if (this._step === 1 || this._step === 2) {
      // The archetype board is the compact grid on the LEFT page and its cards
      // are .cc-card-option, not the poster cards the other steps use.
      boardSelector = '.cc-page-left .cc-select-grid';
      cardSelector = '.cc-card-option';
      activeIndex = this._archetypeWindow.index();
    } else if (this._step === 3) {
      boardSelector = '.cc-page-right .cc-presets-board';
      activeIndex = this._battlerListWindow.index();
    } else if (this._step === 4) {
      boardSelector = '.cc-page-left .cc-presets-board';
      activeIndex = this._characterWindow.index();
    } else {
      return;
    }
    const board = this._dndContainer && this._dndContainer.querySelector(boardSelector);
    if (!board) return;
    const cards = board.querySelectorAll(cardSelector);
    const card = cards[activeIndex];
    if (!card) return;
    const boardRect = board.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.bottom > boardRect.bottom) {
      board.scrollTop += cardRect.bottom - boardRect.bottom + 4;
    } else if (cardRect.top < boardRect.top) {
      board.scrollTop -= boardRect.top - cardRect.top + 4;
    }
  };

  Scene_CreateCreature.prototype.onModeCardClick = function (index) {
    if (this._modeWindow) {
      this._modeWindow.select(index);
      this.refreshUIOverlayDOM();
    }
  };

  Scene_CreateCreature.prototype.onModeCardConfirm = function () {
    if (this._modeWindow) {
      this._modeWindow.processOk();
    }
  };

  Scene_CreateCreature.prototype.onArchetypeCardClick = function (index) {
    if (!this._archetypeWindow) return;
    this._archetypeWindow.select(index);
    const item = this._archetypeWindow._data[index];
    if (item) this._toggleArchetype(item.key);
    this.refreshUIOverlayDOM();
  };

  // Nothing pins the primary any more. A goblin world used to fix it to the
  // Goblin archetype; goblins are humanoids wearing a goblin's face now, and
  // the world narrows the wardrobe (SpriteCatalog.isGoblinSheet) instead of the
  // board. Kept as a question so the board can be pinned again some day.
  Scene_CreateCreature.prototype.isArchetypePrimaryLocked = function () {
    return false;
  };

  // Toggle an archetype in/out of the (max two) selection. The first pick is the
  // primary; a second distinct pick is the secondary (making a hybrid). Selecting
  // an already-chosen archetype removes it; picking a third replaces the secondary.
  Scene_CreateCreature.prototype._toggleArchetype = function (key) {
    if (this._selectedArchetype1 === key) {
      this._selectedArchetype1 = this._selectedArchetype2;
      this._selectedArchetype2 = null;
    } else if (this._selectedArchetype2 === key) {
      this._selectedArchetype2 = null;
    } else if (!this._selectedArchetype1) {
      this._selectedArchetype1 = key;
    } else if (!this._selectedArchetype2) {
      this._selectedArchetype2 = key;
    } else {
      this._selectedArchetype2 = key;
    }
  };

  Scene_CreateCreature.prototype.onBattlerCardClick = function (index) {
    if (this._battlerListWindow) {
      this._battlerListWindow.select(index);
      this.refreshUIOverlayDOM();
    }
  };

  Scene_CreateCreature.prototype.onCharacterCardClick = function (index) {
    if (this._characterWindow) {
      this._characterWindow.select(index);
      this.refreshUIOverlayDOM();
    }
  };

  Scene_CreateCreature.prototype._getActiveWindow = function () {
    switch (this._step) {
      case 0: return this._modeWindow;
      case 1:
      case 2: return this._archetypeWindow;
      case 3: return this._battlerListWindow;
      case 4: return this._characterWindow;
      default: return null;
    }
  };

  // The focus ring hands the board back when it walks off its own top or left
  // edge; the board redraws so its cursor is visible again.
  Scene_CreateCreature.prototype.onNavLeave = function () {
    this._lastStep = -1;
    this._lastIndex = -1;
    this.refreshUIOverlayDOM();
  };

  // Step off the board and onto the page's own controls, if there is anything
  // over there to land on.
  Scene_CreateCreature.prototype._ccEnterNav = function (dir) {
    if (!window.CCNav) return false;
    return window.CCNav.tryEnterFromBoard(dir);
  };

  Scene_CreateCreature.prototype.updateUIInput = function () {
    // The ring owns the page's own controls whenever it is up, and is read
    // first so one press never moves two cursors.
    if (window.CCNav && window.CCNav.update()) return;
    const windowObj = this._getActiveWindow();
    if (!windowObj || !windowObj.active) return;

    if (Input.isTriggered("ok")) {
      switch (this._step) {
        case 0: this.onModeCardConfirm(); return;
        case 1:
        case 2: this.onArchetypeOk(); return;
        case 3: this.onBattlerOk(); return;
        case 4: this.onCharacterOk(); return;
      }
    }

    if (Input.isTriggered("cancel")) {
      switch (this._step) {
        case 0: SoundManager.playCancel(); this.onCreationCancel(); return;
        case 1:
        case 2: SoundManager.playCancel(); this.onArchetypeCancel(); return;
        case 3: SoundManager.playCancel(); this.onBattlerCancel(); return;
        case 4: SoundManager.playCancel(); this.onCharacterCancel(); return;
      }
    }

    const maxItems = windowObj.maxItems();
    if (maxItems <= 0) return;

    const index = windowObj.index();

    // Simulate MZ repeat timing for held WASD keys so hold speed matches arrow keys/controller
    for (const dir of ["up", "down", "left", "right"]) {
      if (this._wasdHeld[dir]) {
        this._wasdHoldFrames[dir]++;
        const t = this._wasdHoldFrames[dir];
        if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
          this._wasdInput[dir] = true;
        }
      } else {
        this._wasdHoldFrames[dir] = 0;
      }
    }

    const isDown  = Input.isTriggered("down")  || Input.isRepeated("down")  || this._wasdInput.down;
    const isUp    = Input.isTriggered("up")    || Input.isRepeated("up")    || this._wasdInput.up;
    const isRight = Input.isTriggered("right") || Input.isRepeated("right") || this._wasdInput.right;
    const isLeft  = Input.isTriggered("left")  || Input.isRepeated("left")  || this._wasdInput.left;

    this._wasdInput.up = false;
    this._wasdInput.down = false;
    this._wasdInput.left = false;
    this._wasdInput.right = false;

    const cols = windowObj.maxCols();
    const singleRow = maxItems <= cols;
    let newIndex = index;

    if (singleRow) {
      if (isRight || isDown) {
        newIndex = (index + 1) % maxItems;
      } else if (isLeft || isUp) {
        newIndex = (index - 1 + maxItems) % maxItems;
      }
    } else {
      if (isDown) {
        newIndex = (index + cols < maxItems) ? index + cols : index % cols;
      } else if (isUp) {
        if (index - cols >= 0) { newIndex = index - cols; }
        else { let t = Math.floor((maxItems - 1) / cols) * cols + (index % cols); if (t >= maxItems) t -= cols; newIndex = t >= 0 ? t : 0; }
      } else if (isRight && index % cols < cols - 1 && index + 1 < maxItems) {
        newIndex = index + 1;
      } else if (isLeft && index % cols > 0) {
        newIndex = index - 1;
      }
    }

    // The right edge of the board is the doorway onto the page's own buttons.
    if (newIndex === index && isRight && this._ccEnterNav("right")) return;

    if (newIndex !== index) {
      SoundManager.playCursor();
      windowObj.select(newIndex);
      this.refreshUIOverlayDOM();
    }
  };

  // CCScroll hook: the board holding this step's cards, so the triggers (and a
  // wheel notch that lands off the board) always scroll the active list.
  Scene_CreateCreature.prototype.ccScrollTarget = function () {
    if (!this._dndContainer) return null;
    let selector = null;
    if (this._step === 1 || this._step === 2) {
      selector = '.cc-page-left .cc-select-grid'; // archetype cards use the compact grid
    } else if (this._step === 3) {
      selector = '.cc-page-right .cc-presets-board'; // battler cards are on the right
    } else if (this._step === 4) {
      selector = '.cc-page-left .cc-presets-board';  // sprite cards are on the left
    }
    return selector ? this._dndContainer.querySelector(selector) : null;
  };

  Scene_CreateCreature.prototype.update = function () {
    Scene_MenuBase.prototype.update.call(this);

    if (this._dndContainer && this._dndContainer.style.display !== "none") {
      this.updateUIInput();
      if (window.CCScroll) window.CCScroll.update(this._dndContainer);
      // The page rebuilds its markup underneath the ring, so the ring is
      // stamped back on afterwards rather than before.
      if (window.CCNav) window.CCNav.paint();

      const isMode = this._step === 0;
      const isArch1 = this._step === 1;
      const isArch2 = this._step === 2;
      const isBattler = this._step === 3;
      const isChar = this._step === 4;

      const currentIndex = isMode ? this._modeWindow.index() :
        isArch1 || isArch2 ? this._archetypeWindow.index() :
          isBattler ? this._battlerListWindow.index() :
            this._characterWindow.index();

      if (this._lastStep !== this._step || this._lastIndex !== currentIndex) {
        this._lastStep = this._step;
        this._lastIndex = currentIndex;
        this.refreshUIOverlayDOM();
      }
    }
  };

  // --- Window Creation ---

  Scene_CreateCreature.prototype.createHelpWindow = function () {
    const rect = this.helpWindowRect();
    this._helpWindow = new Window_Help(rect);
    this._helpWindow.visible = false;
    this._helpWindow.opacity = 0;
    this.addWindow(this._helpWindow);
  };

  Scene_CreateCreature.prototype.createModeWindow = function () {
    const rect = this.modeWindowRect();
    this._modeWindow = new Window_CreateCreatureMode(rect);
    this._modeWindow.setHandler('baseline', this.onModeSelect.bind(this, 'baseline'));
    this._modeWindow.setHandler('hybrid', this.onModeSelect.bind(this, 'hybrid'));
    this._modeWindow.setHandler('cancel', this.onCreationCancel.bind(this));
    this._modeWindow.visible = false;
    this._modeWindow.opacity = 0;
    this.addWindow(this._modeWindow);
  };

  Scene_CreateCreature.prototype.createArchetypeWindow = function () {
    const rect = this.archetypeListRect();
    this._archetypeWindow = new Window_ArchetypeSelect(rect);
    this._archetypeWindow.setHandler('ok', this.onArchetypeOk.bind(this));
    this._archetypeWindow.setHandler('cancel', this.onArchetypeCancel.bind(this));
    this._archetypeWindow.setHandler('select', this.onArchetypeSelect.bind(this));
    this._archetypeWindow.visible = false;
    this._archetypeWindow.opacity = 0;
    this.addWindow(this._archetypeWindow);
  };

  Scene_CreateCreature.prototype.createArchetypePartsWindow = function () {
    const rect = this.archetypePartsRect();
    this._archetypePartsWindow = new Window_ArchetypeParts(rect);
    this._archetypePartsWindow.visible = false;
    this._archetypePartsWindow.opacity = 0;
    this.addWindow(this._archetypePartsWindow);
  };

  Scene_CreateCreature.prototype.createBattlerWindow = function () {
    const listRect = this.battlerListRect();
    this._battlerListWindow = new Window_BattlerList(listRect);
    this._battlerListWindow.setHandler('ok', this.onBattlerOk.bind(this));
    this._battlerListWindow.setHandler('cancel', this.onBattlerCancel.bind(this));
    this._battlerListWindow.setHandler('select', this.onBattlerSelect.bind(this));
    this._battlerListWindow.visible = false;
    this._battlerListWindow.opacity = 0;
    this.addWindow(this._battlerListWindow);

    const previewRect = this.battlerPreviewRect();
    this._battlerPreviewWindow = new Window_BattlerPreview(previewRect);
    this._battlerPreviewWindow.visible = false;
    this._battlerPreviewWindow.opacity = 0;
    this.addWindow(this._battlerPreviewWindow);
  };

  Scene_CreateCreature.prototype.createCharacterWindow = function () {
    const rect = this.fullMainWindowRect();
    this._characterWindow = new Window_CharacterSelect(rect);
    this._characterWindow.setHandler('ok', this.onCharacterOk.bind(this));
    this._characterWindow.setHandler('cancel', this.onCharacterCancel.bind(this));
    this._characterWindow.visible = false;
    this._characterWindow.opacity = 0;
    this.addWindow(this._characterWindow);
  };

  // --- Window Rects ---

  Scene_CreateCreature.prototype.helpWindowRect = function () {
    const ww = Graphics.boxWidth;
    const wh = this.calcWindowHeight(2, false);
    return new Rectangle(0, 0, ww, wh);
  };

  Scene_CreateCreature.prototype.modeWindowRect = function () {
    const ww = 240;
    const wh = this.calcWindowHeight(2, true);
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_CreateCreature.prototype.mainRectY = function () {
    return this._helpWindow ? (this._helpWindow.y + this._helpWindow.height) : 0;
  };

  Scene_CreateCreature.prototype.mainRectHeight = function () {
    return Graphics.boxHeight - this.mainRectY();
  };

  Scene_CreateCreature.prototype.archetypeListRect = function () {
    const wy = this.mainRectY();
    const wh = this.mainRectHeight();
    const ww = Math.floor(Graphics.boxWidth * 0.5);
    return new Rectangle(0, wy, ww, wh);
  };

  Scene_CreateCreature.prototype.archetypePartsRect = function () {
    const wy = this.mainRectY();
    const wh = this.mainRectHeight();
    const ww = Graphics.boxWidth - Math.floor(Graphics.boxWidth * 0.5);
    const wx = Graphics.boxWidth - ww;
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_CreateCreature.prototype.fullMainWindowRect = function () {
    const wy = this.mainRectY();
    const wh = this.mainRectHeight();
    return new Rectangle(0, wy, Graphics.boxWidth, wh);
  };

  Scene_CreateCreature.prototype.battlerListRect = function () {
    const wy = this.mainRectY();
    const wh = this.mainRectHeight();
    const ww = Math.floor(Graphics.boxWidth * 0.3);
    return new Rectangle(0, wy, ww, wh);
  };

  Scene_CreateCreature.prototype.battlerPreviewRect = function () {
    const wy = this.mainRectY();
    const wh = this.mainRectHeight();
    const ww = Graphics.boxWidth - Math.floor(Graphics.boxWidth * 0.3);
    const wx = Graphics.boxWidth - ww;
    return new Rectangle(wx, wy, ww, wh);
  };

  // --- Step Management ---

  Scene_CreateCreature.prototype.showStep = function (step) {
    this._step = step;
    this._wasdInput = { up: false, down: false, left: false, right: false };
    this._wasdHeld = { up: false, down: false, left: false, right: false };
    this._wasdHoldFrames = { up: 0, down: 0, left: 0, right: 0 };

    // Hide all windows
    this._modeWindow.hide();
    this._modeWindow.deactivate();

    this._archetypeWindow.hide();
    this._archetypeWindow.deactivate();

    this._archetypePartsWindow.hide();

    this._battlerListWindow.hide();
    this._battlerListWindow.deactivate();
    this._battlerPreviewWindow.hide();

    this._characterWindow.hide();
    this._characterWindow.deactivate();

    switch (step) {
      case 0: // Mode Select
        this._helpWindow.setText(T('Creature.selectCreationMode'));
        this._modeWindow.show();
        this._modeWindow.activate();
        this._modeWindow.select(0);
        break;
      case 1: // Archetype(s) - single screen: pick one (baseline) or two (hybrid)
        this._mode = 'hybrid'; // multi-select while on this screen; resolved at confirm
        this._helpWindow.setText(T('Creature.selectOneOrTwoArchetypes'));
        this._selectedArchetype1 = null;
        this._selectedArchetype2 = null;
        this._archetypeWindow.show();
        this._archetypeWindow.activate();
        this._archetypeWindow.select(0);
        this._archetypePartsWindow.setArchetypes(null, null);
        this._archetypePartsWindow.show();
        this.onArchetypeSelect(); // Update parts list for first item
        break;
      case 2: // Archetype 2 (Hybrid only)
        this._helpWindow.setText(T('Creature.selectHybridArchetype'));
        this._archetypeWindow.show();
        this._archetypeWindow.activate();
        this._archetypeWindow.select(0);
        this._archetypePartsWindow.setArchetypes(this._selectedArchetype1, null);
        this._archetypePartsWindow.show();
        this.onArchetypeSelect(); // Update parts list for first item
        break;
      case 3: // Battler
        this._helpWindow.setText(T('Creature.selectABattlerImage'));
        this._battlerListWindow.setArchetypes(this.selectedArchetypes());
        this._battlerListWindow.show();
        this._battlerListWindow.activate();
        this._battlerPreviewWindow.show();
        this._battlerListWindow.select(0);
        this.onBattlerSelect(); // Update preview for first item
        break;
      case 4: // Character
        this._helpWindow.setText(T('Creature.selectACharacterSprite'));
        this._characterWindow.setArchetypes(this.selectedArchetypes());
        this._characterWindow.show();
        this._characterWindow.activate();
        this._characterWindow.select(0);
        break;
    }
  };

  // What this creature is built out of: one archetype, or both of a hybrid's.
  // The battler list and the sprite list are both scoped to it.
  Scene_CreateCreature.prototype.selectedArchetypes = function () {
    const archetypes = [this._selectedArchetype1];
    if (this._mode === 'hybrid' && this._selectedArchetype2) {
      archetypes.push(this._selectedArchetype2);
    }
    return archetypes;
  };

  // --- Event Handlers ---

  Scene_CreateCreature.prototype.onModeSelect = function (mode) {
    this._mode = mode;
    this.showStep(1); // Go to Archetype 1 selection
  };

  Scene_CreateCreature.prototype.onArchetypeSelect = function () {
    const item = this._archetypeWindow.item();
    if (!item) return;

    const currentKey = item.key;
    if (this._step === 1) {
      this._archetypePartsWindow.setArchetypes(currentKey, null);
    } else if (this._step === 2) {
      this._archetypePartsWindow.setArchetypes(this._selectedArchetype1, currentKey);
    }
  };

  Scene_CreateCreature.prototype.onArchetypeOk = function () {
    const item = this._archetypeWindow.item();
    if (!item) return;
    const key = item.key;
    // Enter on an already-selected archetype confirms the blueprint (one pick =
    // baseline creature, two picks = hybrid). Enter on any other archetype adds
    // it to the selection.
    if (this._selectedArchetype1 === key || this._selectedArchetype2 === key) {
      this.onArchetypeConfirm();
      return;
    }
    this._toggleArchetype(key);
    // processOk() deactivates the window; re-activate so navigation continues.
    this._archetypeWindow.activate();
    this.refreshUIOverlayDOM();
  };

  Scene_CreateCreature.prototype.onArchetypeConfirm = function () {
    if (!this._selectedArchetype1) return; // need at least one archetype
    // Resolve the final creation mode from how many archetypes were chosen.
    this._mode = this._selectedArchetype2 ? 'hybrid' : 'baseline';
    this.showStep(3); // proceed to battler, then sprite
  };

  Scene_CreateCreature.prototype.onArchetypeCancel = function () {
    // The archetype screen is now the first step, so Back aborts creature creation.
    this.onCreationCancel();
  };

  Scene_CreateCreature.prototype.onBattlerSelect = function () {
    const item = this._battlerListWindow.item();
    const battlerName = item ? item.battlerName : null;
    if (this._battlerPreviewWindow) {
      this._battlerPreviewWindow.setBattler(battlerName);
    }
  };

  // Collect up to three distinct Battler3D archetype keys from the enemies
  // listed for the chosen creature archetype(s), used to seed the custom model.
  Scene_CreateCreature.prototype._collectBattler3DKeys = function () {
    const keys = [];
    if (!window.Battler3D || !window.Battler3D.resolveKey || !this._battlerListWindow) return keys;
    for (const it of this._battlerListWindow._data) {
      if (!it || it.custom || !it.id) continue;
      const enemy = $dataEnemies[it.id];
      const k = enemy ? window.Battler3D.resolveKey(enemy) : null;
      if (k && keys.indexOf(k) === -1) keys.push(k);
      if (keys.length >= 3) break;
    }
    return keys;
  };

  Scene_CreateCreature.prototype.onBattlerOk = function () {
    const item = this._battlerListWindow.item();
    // Custom 3D creature: open the model editor IMMEDIATELY (seeded from the
    // chosen archetypes). The editor is pushed over this scene; on confirm it
    // pops back and we resume at the sprite step (see create()).
    if (item && item.custom) {
      this._customModel = true;
      this._selectedBattler = null;
      // A creature is portrayed EITHER by a 2D battler image OR by a 3D model.
      // Recording the pick on the actor keeps the two from competing later.
      const customActor = $gameActors.actor(this._targetActorId);
      if (customActor && customActor.setPortraitMode) customActor.setPortraitMode("model");
      const keys = this._collectBattler3DKeys();
      this._customArchetypeKeys = keys;
      if (window.Scene_CC3DModel && window.CC3DModel && window.CC3DModel.isAvailable()) {
        Scene_CreateCreature._resumeCreature = {
          targetActorId: this._targetActorId,
          arch1: this._selectedArchetype1,
          arch2: this._selectedArchetype2,
          mode: this._mode,
          keys: keys
        };
        window.Scene_CC3DModel.setup(this._targetActorId, null, { creature: true, initArchetypes: keys });
        SceneManager.push(window.Scene_CC3DModel);
        return;
      }
      // 3D editor unavailable: fall back to picking a sprite directly.
      this.showStep(4);
      return;
    }
    const battlerName = item ? item.battlerName : null;
    if (battlerName) {
      this._customModel = false;
      this._selectedBattler = battlerName;
      // Save the battler image name on the actor (portrait fields moved off the
      // old global variables) and mark this creature as portrayed by an existing
      // species rather than by a custom-built model ("sprite"), so no CC3DModel
      // config is looked up for it. The portrait itself is still the species'
      // procedural 3D model - the very one previewed on this step - with the
      // battler image only standing in when no model resolves.
      const battlerActor = $gameActors.actor(this._targetActorId);
      if (battlerActor) {
        battlerActor.setVnBattler(battlerName);
        // A creature is not portrayed by the bust of whoever held the slot.
        if (battlerActor.setVnBust) battlerActor.setVnBust("");
        if (battlerActor.setPortraitMode) battlerActor.setPortraitMode("sprite");
        // Which enemy exactly: several enemies can share one battler image, and
        // the model previewed here was built from THIS entry, so record it
        // instead of leaving the status screen to guess from the image name.
        battlerActor._recruitedEnemyId = (item && item.id) || 0;
        battlerActor._recruitedLook = null;   // the look roll of whoever held the slot before goes with them
      }
      // Keep the randomized 3D look previewed for this creature: the status
      // screen rebuilds the model with this same seed.
      if (this._creatureGenSeed && window.CC3DModel && window.CC3DModel.setCreatureSeed) {
        window.CC3DModel.setCreatureSeed(this._targetActorId, this._creatureGenSeed);
      }
      this.proceedToCharacterStep();
    }
  };

  Scene_CreateCreature.prototype.onBattlerCancel = function () {
    this.showStep(1); // Back to Archetype selection screen
  };

  // Where the battler step goes once a monster sprite is settled. Ordinarily
  // to the overworld sprite board; in Quick mode that board is never shown and
  // one of its own entries is dealt instead, so the monster sprite is the last
  // thing this scene asks for.
  Scene_CreateCreature.prototype.proceedToCharacterStep = function () {
    if (!isQuickCreation()) {
      this.showStep(4);
      return;
    }
    this._characterWindow.setArchetypes(this.selectedArchetypes());
    const sprites = this._characterWindow._images || [];
    this._selectedCharacter = sprites.length
      ? sprites[Math.floor(Math.random() * sprites.length)]
      : null;
    this.finishCreature();
  };

  Scene_CreateCreature.prototype.onCharacterOk = function () {
    const entry = this._characterWindow.item();
    if (!entry) return;
    this._selectedCharacter = entry;
    this.finishCreature();
  };

  // The creature is settled: write it onto the actor, then name it and pick
  // its class, both of which take over the scene when the wizard is waiting.
  Scene_CreateCreature.prototype.finishCreature = function () {
    // Custom creature: the 3D model was already built and saved (config lives
    // in CC3DModel), so clear the 2D battler image and the status screen
    // renders the custom model instead of a flat enemy portrait.
    if (this._customModel) {
      const modelActor = $gameActors.actor(this._targetActorId);
      if (modelActor) {
        modelActor.setVnBattler("");
        if (modelActor.setVnBust) modelActor.setVnBust("");
        // Drop any species recorded by an earlier creature or talk-menu recruit
        // in this slot: the portrait is the custom model, not that monster.
        modelActor._recruitedEnemyId = 0;
        modelActor._recruitedLook = null;   // the look roll of whoever held the slot before goes with them
      }
    }
    this.applyCreatureSettings();
    this.suggestName();
    if (this.startClassSelection()) return;
    this.popScene();
  };

  // Pre-fill the name field with a generated name, the way the humanoid branch
  // does with its Markov step, so the player edits a suggestion instead of the
  // database placeholder. The current name is kept when no generator is loaded.
  function suggestCreatureName(actor) {
    if (!window.generateSeededMarkovName) return;
    const actorId = actor.actorId();
    const seed = (Date.now() + actorId * 7919) >>> 0;
    try {
      const name = window.generateSeededMarkovName(
        seed & 0xffff,
        (seed >>> 16) & 0xffff,
        actorId,
        "names", // i18n-ignore: TextGen database id
        2,
        4,
        12
      );
      if (name && name !== T('Markov.unknownName')) {
        actor.setName(name.charAt(0).toUpperCase() + name.slice(1));
      }
    } catch (e) {
      // Generator unavailable: the creature keeps the name it already has.
    }
  }

  // Creatures are named the same way people are: not here. The wizard asks for
  // the name on its Bio step, in the identity card of the dossier, so this only
  // seeds a suggestion for that field. It used to open the engine's Name Input
  // screen between the builder and the class list, which asked the same
  // question twice, in the old letter grid.
  //
  // Only the wizard flow suggests anything: a creature built from the
  // CreateCreature plugin command is an existing character changing shape, and
  // keeps the name it already has.
  Scene_CreateCreature.prototype.suggestName = function () {
    const wizard = window.Scene_CharacterCreation;
    if (!wizard || wizard._interruptedStep < 0) return;
    const actor = $gameActors.actor(this._targetActorId);
    if (!actor) return;
    suggestCreatureName(actor);
  };

  // The creature is built: hand over to the class selector, scoped to the
  // classes its archetype(s) support. Unlike the humanoid flow there is no
  // archetype-of-classes step , the creature's own archetypes already decided
  // the roster, so the player goes straight into the class list (which is the
  // Monster class alone when the two archetypes support nothing in common).
  //
  // Only the wizard flow routes here: a creature built from the CreateCreature
  // plugin command (no paused wizard) keeps popping back where it came from.
  Scene_CreateCreature.prototype.startClassSelection = function () {
    if (!this.prepareClassSelection()) return false;
    SceneManager.goto(window.Scene_ClassSelection);
    return true;
  };

  // Everything startClassSelection does except the scene change itself, so the
  // name step can set the hand-over up and let the naming screen return into
  // the class selector.
  Scene_CreateCreature.prototype.prepareClassSelection = function () {
    const wizard = window.Scene_CharacterCreation;
    if (!wizard || wizard._interruptedStep < 0) return false;
    if (!window.Scene_ClassSelection || !window.CreatureClasses) return false;

    // Two rosters, not one list: the browser heads them "Non Sentient" (the
    // archetypes' own creature classes) and "Sentient" (the classes they can
    // still be played as).
    window.$ccArchetypeClassFilter = window.CreatureClasses.playableGroupsForArchetypes(
      this._selectedArchetype1,
      this._selectedArchetype2
    );
    window.$ccCreatureClassFlow = {
      actorId: this._targetActorId,
      arch1: this._selectedArchetype1,
      arch2: this._selectedArchetype2,
    };
    // The class selector resumes the wizard itself (traits on confirm, this
    // scene on cancel), so drop the pending resume point.
    wizard._interruptedStep = -1;
    // The wizard pushed this scene, leaving itself on the scene stack for a
    // popScene() that is no longer coming. Drop that entry, or the wizard would
    // restart when it pops itself at the end of creation.
    const stack = SceneManager._stack;
    if (stack && stack.length && stack[stack.length - 1] === wizard) {
      stack.pop();
    }
    return true;
  };

  Scene_CreateCreature.prototype.onCharacterCancel = function () {
    this.showStep(3); // Back to Battler
  };

  // Cancelling out of the very first creature screen (mode select) aborts
  // creature creation. The wizard's gender handler pre-set the resume point to
  // the post-class step (so a completed creature lands on traits); on cancel we
  // override it to resume at the gender step (3) instead, so Back returns to an
  // interactive step rather than falling through to traits with a half-built
  // creature.
  Scene_CreateCreature.prototype.onCreationCancel = function () {
    const wizard = window.Scene_CharacterCreation;
    if (wizard) {
      const characterType = (window.CCSteps && window.CCSteps.CHARACTER_TYPE) != null
        ? window.CCSteps.CHARACTER_TYPE
        : 3;
      // interruptedStep + 1 is the resume step, so CHARACTER_TYPE resumes on
      // the gender step. Every mode asks a creature for its gender (Quick
      // included), so that is an interactive step to land back on rather than
      // one that would open this builder again on sight.
      wizard._interruptedStep = characterType;
    }
    this.popScene();
  };

  // --- Logic Functions ---

  Scene_CreateCreature.prototype.applyCreatureSettings = function () {
    const actor = $gameActors.actor(this._targetActorId);
    if (!actor) return;

    actor._isCreatureActor = true;

    // Use the changeArchetype function from Health_Core if available
    const changeArchetype = window.changeArchetypeForActor || this.changeArchetypeLocal.bind(this);

    // Apply Archetype(s)
    if (this._mode === 'baseline' && this._selectedArchetype1) {
      changeArchetype(actor, this._selectedArchetype1);
    } else if (this._mode === 'hybrid' && this._selectedArchetype1 && this._selectedArchetype2) {
      this.applyHybridArchetype(actor);
    }

    // Set character sprite
    if (this._selectedCharacter) {
      actor.setCharacterImage(this._selectedCharacter.path, this._selectedCharacter.index);
    }

    console.log(`Creature created for Actor ${this._targetActorId}:`);
    console.log('  Mode:', this._mode);
    console.log('  Archetype 1:', this._selectedArchetype1);
    console.log('  Archetype 2:', this._selectedArchetype2);
    console.log('  Battler:', this._selectedBattler, `(saved on actor ${this._targetActorId})`);
    console.log('  Character:', this._selectedCharacter?.path, 'index', this._selectedCharacter?.index);
  };

  // Local implementation of changeArchetype for standalone use
  Scene_CreateCreature.prototype.changeArchetypeLocal = function (actor, archetypeName) {
    if (!actor) return false;

    const { Archetypes } = window.Health || {};

    if (!Archetypes || !Archetypes[archetypeName]) {
      console.warn(`Archetype "${archetypeName}" not found in Archetypes`);
      return false;
    }

    const archetype = Archetypes[archetypeName];

    // Clear existing stat modifiers
    if (actor._statModifiers) {
      for (const param in actor._statModifiers) {
        actor._statModifiers[param] = 0;
      }
    } else {
      actor._statModifiers = {};
    }

    // Initialize new body parts from archetype
    actor._bodyParts = {};
    actor._currentArchetype = archetypeName;

    for (const partKey in archetype.parts) {
      const archetypePart = archetype.parts[partKey];
      const hpPercentage = archetypePart.hpPercent / 100;

      actor._bodyParts[partKey] = {
        name: partName(archetypePart),
        maxHp: Math.round(actor.mhp * hpPercentage),
        currentHp: Math.round(actor.mhp * hpPercentage),
        vital: false,
        damaged: false,
        canCutoff: archetypePart.canCutoff || false,
        statEffect: archetypePart.statEffect || null,
        damageMsg: window.getArchetypeText ? window.getArchetypeText(archetypePart.msg) : archetypePart.msg,
        specialEffect: archetypePart.specialEffect || null,
        appliedStatEffect: false,
        hpPercent: archetypePart.hpPercent,
        // Without this the creature has nothing to hold a weapon in and no
        // weapon slots at all (ItemSystem/ItemSystemEquipment.js).
        canHoldWeapon: !!archetypePart.canHoldWeapon,
        limbCopy: archetypePart.limbCopy || 0,
        skillId: archetypePart.skillId || [],
      };
    }

    // Learn skills from part skillIds (supports a single id or an array of ids)
    // plus any type-based body-part skills (Mouth/Hands/Eyes/Feet).
    const _hc = window.HealthCore;
    for (const partKey in actor._bodyParts) {
      const part = actor._bodyParts[partKey];
      const ids = _hc && _hc.getPartSkillIds
        ? _hc.getPartSkillIds(part, partKey)
        : (part && part.skillId ? [].concat(part.skillId) : []);
      for (const skillId of ids) {
        if (skillId && $dataSkills[skillId]) actor.learnSkill(skillId);
      }
    }

    // Set reproduction variable based on actor ID
    if ($gameVariables) {
      var reproductionValue = archetype.reproduction !== undefined ? archetype.reproduction : 0;
      var actorId = actor.actorId();
      if (actorId === 1) {
        $gameVariables.setValue(87, reproductionValue);
      } else if (actorId === 2) {
        $gameVariables.setValue(115, reproductionValue);
      } else if (actorId === 3) {
        $gameVariables.setValue(116, reproductionValue);
      }
    }

    // Clear all learned skills and add archetype's base skills
    if (archetype.skills && archetype.skills.length > 0) {
      const currentSkills = actor.skills().slice();
      currentSkills.forEach(skillId => {
        actor.forgetSkill(skillId.id);
      });

      archetype.skills.forEach(skillId => {
        if ($dataSkills[skillId]) {
          actor.learnSkill(skillId);
        }
      });

      // Re-learn body-part skills wiped by the clear above (mirrors the hybrid path).
      for (const partKey in actor._bodyParts) {
        const part = actor._bodyParts[partKey];
        const ids = _hc && _hc.getPartSkillIds
          ? _hc.getPartSkillIds(part, partKey)
          : (part && part.skillId ? [].concat(part.skillId) : []);
        for (const skillId of ids) {
          if (skillId && $dataSkills[skillId]) actor.learnSkill(skillId);
        }
      }
    }

    // Refresh actor parameters
    actor.refresh();

    return true;
  };

  Scene_CreateCreature.prototype.applyHybridArchetype = function (actor) {
    const { Archetypes } = window.Health || {};
    const arch1 = Archetypes[this._selectedArchetype1];
    const arch2 = Archetypes[this._selectedArchetype2];
    if (!arch1 || !arch2) return;

    // Arms and hands are spliced rather than shared: two archetypes that each
    // bring a pair make a creature with four, and four weapon slots with them
    // (HealthCore.mergeArchetypeParts).
    const mergedParts = mergeParts([this._selectedArchetype1, this._selectedArchetype2]);

    // Clear existing actor data
    actor._statModifiers = {};
    actor._bodyParts = {};
    actor._currentArchetype = `${this._selectedArchetype1} / ${this._selectedArchetype2}`;

    // Apply new merged parts to actor
    for (const partKey in mergedParts) {
      const archetypePart = mergedParts[partKey];
      const hpPercentage = archetypePart.hpPercent / 100;

      actor._bodyParts[partKey] = {
        name: partName(archetypePart),
        maxHp: Math.round(actor.mhp * hpPercentage),
        currentHp: Math.round(actor.mhp * hpPercentage),
        vital: false,
        damaged: false,
        canCutoff: archetypePart.canCutoff || false,
        statEffect: archetypePart.statEffect || null,
        damageMsg: window.getArchetypeText ? window.getArchetypeText(archetypePart.msg) : archetypePart.msg,
        specialEffect: archetypePart.specialEffect || null,
        appliedStatEffect: false,
        hpPercent: archetypePart.hpPercent,
        canHoldWeapon: !!archetypePart.canHoldWeapon,
        limbCopy: archetypePart.limbCopy || 0,
        skillId: archetypePart.skillId || [],
      };
    }

    // Learn skills from part skillIds (merged parts, arch2 overrides arch1 for same key)
    for (const partKey in mergedParts) {
      const ids = window.HealthCore && window.HealthCore.getPartSkillIds
        ? window.HealthCore.getPartSkillIds(mergedParts[partKey], partKey)
        : [].concat(mergedParts[partKey].skillId || []);
      for (const sid of ids) {
        if (sid && $dataSkills[sid]) actor.learnSkill(sid);
      }
    }

    // Clear all learned skills and add base skills from BOTH archetypes (unique union)
    const currentSkills = actor.skills().slice();
    currentSkills.forEach(skill => {
      actor.forgetSkill(skill.id);
    });
    const mergedSkillIds = new Set();
    if (arch1.skills) arch1.skills.forEach(sid => mergedSkillIds.add(sid));
    if (arch2.skills) arch2.skills.forEach(sid => mergedSkillIds.add(sid));
    mergedSkillIds.forEach(skillId => {
      if ($dataSkills[skillId]) {
        actor.learnSkill(skillId);
      }
    });

    // Re-learn part skills (they may overlap with base skills, which is fine)
    for (const partKey in mergedParts) {
      const ids = window.HealthCore && window.HealthCore.getPartSkillIds
        ? window.HealthCore.getPartSkillIds(mergedParts[partKey], partKey)
        : [].concat(mergedParts[partKey].skillId || []);
      for (const sid of ids) {
        if (sid && $dataSkills[sid]) actor.learnSkill(sid);
      }
    }

    // Use Arch 2 (dominant) for reproduction
    const dominantArchetype = arch2;

    // Set reproduction variable based on actor ID
    if ($gameVariables) {
      var reproductionValue = dominantArchetype.reproduction !== undefined ? dominantArchetype.reproduction : 0;
      var actorId = actor.actorId();
      if (actorId === 1) {
        $gameVariables.setValue(87, reproductionValue);
      } else if (actorId === 2) {
        $gameVariables.setValue(115, reproductionValue);
      } else if (actorId === 3) {
        $gameVariables.setValue(116, reproductionValue);
      }
    }

    // Refresh actor parameters
    actor.refresh();
  };

  // Expose Scene_CreateCreature globally
  window.Scene_CreateCreature = Scene_CreateCreature;

  // Standalone creature application, reused by the Quick-mode inline creature
  // picker in CharacterCreation.js. Builds a Scene_CreateCreature-shaped context
  // so all the existing archetype/hybrid logic (body parts, skills, reproduction,
  // sprite) runs without opening the full creature scene.
  //   mode: 'baseline' | 'hybrid'
  //   characterEntry: { path, index } overworld sprite, or null
  //   battlerName: battler image name stored on the actor, or null
  window.applyCreatureSelection = function (actorId, mode, arch1Key, arch2Key, characterEntry, battlerName) {
    if (typeof Scene_CreateCreature === 'undefined') return null;
    const ctx = Object.create(Scene_CreateCreature.prototype);
    ctx._targetActorId = actorId;
    ctx._mode = mode;
    ctx._selectedArchetype1 = arch1Key;
    ctx._selectedArchetype2 = arch2Key || null;
    ctx._selectedBattler = battlerName || null;
    ctx._selectedCharacter = characterEntry || null;
    const targetActor = $gameActors.actor(actorId);
    if (battlerName && targetActor) {
      targetActor.setVnBattler(battlerName);
      if (targetActor.setVnBust) targetActor.setVnBust("");
      // Inline picker creatures are portrayed by an existing species (its 3D
      // model, with the battler image as fallback), not by a custom model.
      if (targetActor.setPortraitMode) targetActor.setPortraitMode("sprite");
      // The picker hands over an image name, not an enemy id, so let the status
      // screen resolve the species from the image; a stale id from whoever held
      // the slot before would name the wrong monster.
      targetActor._recruitedEnemyId = 0;
      targetActor._recruitedLook = null;   // the look roll of whoever held the slot before goes with them
    }
    ctx.applyCreatureSettings();
    return ctx;
  };

  // ============================================================================
  // Weapon slots for creature actors
  // ============================================================================
  // A creature used to get one or two weapon slots here, from a hand-written
  // list of five part keys. Every body in the game is now read the same way,
  // creature or person: the parts that declare canHoldWeapon in
  // Archetypes.json are the slots, and ItemSystem/ItemSystemEquipment.js
  // (window.HandSlots) is the one place that decides what fits in them. There
  // is nothing left for this plugin to say about it.

  console.log(`${pluginName} loaded successfully.`);
})();
