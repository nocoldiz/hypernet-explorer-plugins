/*:
 * @target MZ
 * @plugindesc v2.6 Adds swimming, fishing, climbing, and layered bridges (region 12)
 * @author Omni-Lex
 * @help
 * This plugin adds swimming and fishing mechanics to RPG Maker MZ.
 *
 * MAJOR REFACTOR in v2.0:
 * - Removed vehicle system completely
 * - Simple sprite swapping for swimming
 * - Clean movement without vehicle conflicts
 * - Uses boat graphic as static swimming sprite
 * - Disabled sprinting while swimming
 * - Much simpler and more reliable system
 *
 * NEW in v2.1:
 * - Water reflections for events north of region 99 tiles
 * NEW in v2.2:
 * - Falling mechanics when jumping off roofs
 * - Fall damage (5% per tile climbed)
 * - Height tracking while climbing
 * NEW in v2.3:
 * - Damage applies only upon landing
 * - Jumping North performs a standard jump (no fall distance)
 * NEW in v2.4:
 * - Applied damage threshold (minimum 3 tiles height)
 * - North jumps now trigger damage if threshold is met
 * NEW in v2.5:
 * - Layered bridges on region ID 12. Stepping onto a bridge tile from a
 *   bridge-access tile (region 11 or 5) walks the player ON TOP of the bridge;
 *   stepping on from any other tile passes the player UNDER it (hidden by the
 *   bridge tile). The on/under state follows the player along the whole span
 *   and the party follows on the same layer.
 * - Region ID 5 is now always passable terrain (bridge-access step), entered
 *   or left from any direction.
 * NEW in v2.6:
 * - A bridge laid across water can be passed under. The deck tile masks the
 *   water it is painted over, so the tile stops reading as region 99: a swimmer
 *   now keeps swimming under the whole span instead of standing up mid river,
 *   and the Boat navigates under it too (Vehicle/VehicleSystem.js).
 *
 * Features:
 * - Press Enter/Z button when facing water to get options menu
 * - Touch/click on water tiles adjacent to player to open menu
 * - Swim by changing sprite to boat graphic (no vehicle system)
 * - Fish in water if the party carries fishing gear (see FISHING_ROD_ITEM_IDS)
 * - Random items or encounters when fishing is successful
 * - Supports fishing rod as both items and weapons
 * - Configurable common events for fishing animations
 * - Climb terrain tag 4 tiles with popup menu
 * - Player faces upward while climbing
 * - Configurable slow climb movement speed
 * - Hides companions/followers while swimming or climbing
 * - Customizable sound effects for swimming, fishing, and climbing
 * - Disables sprinting while swimming or climbing, re-enables on land
 * - Disables event interaction while climbing (prevents accidental triggers)
 * - Blocks swim/fish/climb options on region ID 10 tiles
 * - Water reflections for events north of region 99 tiles
 * - An event named "Mirror" shows an upright reflection of whoever stands on
 *   the tile in front of it (the tile in the mirror event's facing direction)
 * - Layered bridges on region ID 12 (walk on top from region 11/5 in any
 *   direction, pass under from anywhere else, on foot, swimming or by boat)
 *
 * Instructions:
 * 1. Configure the fishing rod item ID in plugin parameters
 * 2. Optionally, set fishing rod weapon IDs
 * 3. Configure fishing items/encounters in plugin parameters
 * 4. Set up common events for fishing animations if desired
 * 5. Mark water tiles with region ID 99
 * 6. Mark climbable tiles with terrain tag 4
 * 7. Configure climb movement speed (0.1 = very slow, 1 = normal)
 * 8. Configure sound effects for fishing, swimming, and climbing (optional)
 * 9. Use region ID 10 on tiles where you don't want swim/fish/climb options
 * 10. Paint bridge deck tiles (upper/priority layer) with region ID 12, and
 *     mark their walk-on approaches with region ID 11 or 5
 *
 * @param fishingItems
 * @text Fishing Items
 * @desc Items that can be obtained while fishing (comma-separated item IDs)
 * @default 1,2,3,4,5
 *
 * @param fishingEncounterTroopIds
 * @text Fishing Encounters
 * @desc Troop IDs that can be encountered while fishing (comma-separated)
 * @default 1,2,3
 *
 * @param fishingSuccessRate
 * @text Fishing Success Rate
 * @desc Chance of successful fishing (0-100)
 * @default 70
 *
 * @param waitTime
 * @text Wait Time for Fishing
 * @desc Time to wait while fishing in frames (60 frames = 1 second)
 * @default 180
 *
 * @param fishingRodItemId
 * @text Fishing Rod Item ID (unused)
 * @desc Kept for old save data. The gear that counts is FISHING_ROD_ITEM_IDS in this file.
 * @default 123
 *
 * @param fishingRodWeaponIds
 * @text Fishing Rod Weapon IDs (unused)
 * @desc Kept for old save data. The gear that counts is FISHING_ROD_WEAPON_IDS in this file.
 * @default
 *
 * @param fishingAnimationCommonEventId
 * @text Fishing Animation Common Event ID
 * @desc Common event ID for fishing animation (0 = none)
 * @default 0
 *
 * @param fishingBattleCommonEventId
 * @text Fishing Battle Common Event ID
 * @desc Common event ID for battle transition animation (0 = none)
 * @default 0
 *
 * @param hideCompanions
 * @text Hide Companions While Swimming
 * @type boolean
 * @desc Whether to hide companions while swimming
 * @default true
 *
 * @param fishingSoundEffect
 * @text Fishing Sound Effect
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play when fishing (leave empty for no sound)
 * @default Bubble
 *
 * @param startSwimmingSoundEffect
 * @text Start Swimming Sound Effect
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play when starting to swim (leave empty for no sound)
 * @default Splash
 *
 * @param stopSwimmingSoundEffect
 * @text Stop Swimming Sound Effect
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play when stopping swimming (leave empty for no sound)
 * @default Water2
 *
 * @param swimMovementSoundEffect
 * @text Swim Movement Sound Effect
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play during swimming movement (leave empty for no sound)
 * @default Water1
 *
 * @param swimMovementSoundInterval
 * @text Swim Movement Sound Interval
 * @type number
 * @min 1
 * @desc Number of frames between swim movement sounds (60 = 1 second)
 * @default 30
 *
 * @param climbMovementSpeed
 * @text Climb Movement Speed
 * @type number
 * @min 0.1
 * @max 1
 * @decimals 2
 * @desc Movement speed multiplier while climbing (0.1 = very slow, 1 = normal)
 * @default 0.25
 *
 * @param startClimbingSoundEffect
 * @text Start Climbing Sound Effect
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play when starting to climb (leave empty for no sound)
 * @default
 *
 * @param stopClimbingSoundEffect
 * @text Stop Climbing Sound Effect
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play when stopping climbing (leave empty for no sound)
 * @default
 *
 * @param climbMovementSoundEffect
 * @text Climb Movement Sound Effect
 * @type file
 * @dir audio/se/
 * @desc Sound effect to play during climbing movement (leave empty for no sound)
 * @default
 *
 * @param climbMovementSoundInterval
 * @text Climb Movement Sound Interval
 * @type number
 * @min 1
 * @desc Number of frames between climb movement sounds (60 = 1 second)
 * @default 30
 *
 * @param disableClimbing
 * @text Disable Climbing
 * @type boolean
 * @desc Set to true to disable climbing mechanics and options.
 * @default false
 * */

(() => {
  "use strict";

  const pluginName = "MovementInteractionSystem";
  const parameters = PluginManager.parameters(pluginName);

  // Map WASD keys for keyboard movement and ensure they persist when custom mapper applies mappings
  // Skip when split-screen is active so P2's WASD bindings are not clobbered
  const mapWASDKeys = () => {
    if (window.$gameSplitScreen && window.$gameSplitScreen.active) return;
    Input.keyMapper[87] = "up";     // W
    Input.keyMapper[83] = "down";   // S
    Input.keyMapper[65] = "left";   // A
    Input.keyMapper[68] = "right";  // D
  };

  // Initial mapping
  mapWASDKeys();

  // Hook Input.clear to re-apply WASD mappings
  const _Input_clear = Input.clear;
  Input.clear = function() {
    _Input_clear.call(this);
    mapWASDKeys();
  };

  // Hook ConfigManager.applyCustomKeyMap if it exists
  if (typeof ConfigManager !== 'undefined') {
    const _ConfigManager_applyCustomKeyMap = ConfigManager.applyCustomKeyMap;
    ConfigManager.applyCustomKeyMap = function() {
      if (_ConfigManager_applyCustomKeyMap) {
        _ConfigManager_applyCustomKeyMap.call(this);
      }
      mapWASDKeys();
    };
  }

  // The gear a party fishes with. The Fishing Rod (item 123) is the plain one;
  // the Combat Fishing Rod (weapon 241) and weapon 422 are rods somebody has
  // already made a weapon of, and count whether they sit in the pack or on the
  // person carrying them. This list is the single answer to "can this party
  // fish": every water-side menu here asks it, and so does the boat's own options
  // menu (Vehicle/VehicleSystem.js) through MovementSystem.hasFishingRod.
  const FISHING_ROD_ITEM_IDS = [123];
  const FISHING_ROD_WEAPON_IDS = [241, 422];

  // --- Configuration ---
  const Config = {
    fishingItems: String(parameters.fishingItems || "1,2,3,4,5").split(",").map(Number),
    fishingEncounterTroopIds: String(parameters.fishingEncounterTroopIds || "1,2,3").split(",").map(Number),
    fishingSuccessRate: Number(parameters.fishingSuccessRate || 70),
    waitTime: Number(parameters.waitTime || 180),
    waterRegions: [99],
    fishingRodItemIds: FISHING_ROD_ITEM_IDS,
    fishingRodWeaponIds: FISHING_ROD_WEAPON_IDS,
    fishingAnimationCommonEventId: Number(parameters.fishingAnimationCommonEventId || 0),
    fishingBattleCommonEventId: Number(parameters.fishingBattleCommonEventId || 0),
    hideCompanions: String(parameters.hideCompanions || "true") === "true",
    
    sounds: {
      fishing: String(parameters.fishingSoundEffect || ""),
      startSwim: String(parameters.startSwimmingSoundEffect || ""),
      stopSwim: String(parameters.stopSwimmingSoundEffect || ""),
      swimMove: String(parameters.swimMovementSoundEffect || ""),
      swimInterval: Number(parameters.swimMovementSoundInterval || 30),
      startClimb: String(parameters.startClimbingSoundEffect || ""),
      stopClimb: String(parameters.stopClimbingSoundEffect || ""),
      climbMove: String(parameters.climbMovementSoundEffect || ""),
      climbInterval: Number(parameters.climbMovementSoundInterval || 30),
    },
    
    climbSpeed: Number(parameters.climbMovementSpeed || 0.25),
    disableClimbing: String(parameters.disableClimbing || "false") === "true",
    kickableNames: [
      "barrel", "crate", "box", "bucket", "can", "bottle", "pot", "jar",
      "pebble", "rock", "stone", "ball", "junk", "trash", "debris"
    ],

    // Event name (lowercased) that reflects whoever stands in front of it.
    mirrorEventName: "mirror",
    mirrorOpacityRate: 0.8
  };

  // The diving suit: the one piece of gear that lets the party go under. Item
  // 141 ("Diving suit"); 142 is the UV sunglasses sitting next to it in the
  // database, which is what the dive checks used to ask for, so nobody could
  // ever dive with the suit they were carrying. Mirrored in WorldMapReturn.js,
  // which gates the procedural Ocean descent on the same item.
  const DIVING_SUIT_ITEM_ID = 141;

  // Drinking from a water tile: fresh water eases the drinker's hunger, salt
  // water costs them the same kind of ground and leaves the whole party with
  // Nausea (state 41).
  const DRINK_HUNGER_GAIN = 8;
  const SALT_WATER_HUNGER_COST = 5;
  const SALT_WATER_STATE_ID = 41;

  // --- State ---
  let companionsVisible = true;
  let lastSwimSoundFrame = 0;
  // Entering and leaving the water is heard once, however many swimmers cross
  // at the same moment: the player, the followers and a split-screen partner
  // all enter on the same frame, and playing one splash each stacked them into
  // a wall of noise. One splash per sound per short window, at a volume that
  // sits under the stroke loop rather than over it.
  const swimSplashFrames = {};
  function playSwimSplash(name) {
    if (!name) return;
    const frame = Graphics.frameCount;
    if (swimSplashFrames[name] !== undefined &&
        frame - swimSplashFrames[name] < 20) return;
    swimSplashFrames[name] = frame;
    AudioManager.playSe({ name: name, volume: 25, pitch: 100, pan: 0 });
  }
  let lastClimbSoundFrame = 0;
  let reflectionSprites = new Map();
  let reflectionContainer = null;
  let mirrorSprites = new Map();
  let mirrorContainer = null;
  let originalCanMoveFunction = null;

  // --- Helper Functions ---

  const Utils = {
    isWaterTile(x, y) {
      if (Config.waterRegions.includes($gameMap.regionId(x, y))) return true;

      // Procedural map (636): every terrain-tag-3 tile counts as water, so
      // swim/fish/dive options appear on ocean and beach biome water regardless
      // of how region 99 was painted. Only the normally-impassable ones are
      // actually swimmable (enforced by the !canPass checks at the call sites).
      if ($gameMap.mapId() === 636 && $gameMap.terrainTag(x, y) === 3) return true;

      // Check cached water tiles for diving on non-procedural maps
      if ($gameMap._underwaterWaterTiles) {
        const width = $gameMap.width();
        const index = y * width + x;
        if ($gameMap._underwaterWaterTiles.has(index)) return true;
      }

      return false;
    },

    isBlockedWaterTile(x, y) {
      return $gameMap.regionId(x, y) === 10;
    },

    // Ocean and beach squares are salt water. Both the drink prompt (which says
    // which of the two is on offer) and the mouthful itself ask this, so they
    // can never disagree about what the party just drank.
    isSaltWaterHere() {
      const biome = $gameSystem._procGenData ? $gameSystem._procGenData.currentBiome : null;
      const biomeLower = biome ? biome.toLowerCase() : "";
      return biomeLower.includes("ocean") || biomeLower.includes("beach");
    },

    isClimbableTile(x, y) {
      if (Config.disableClimbing) return false;
      return $gameMap.terrainTag(x, y) === 4;
    },

    isBlockedClimbTile(x, y) {
      return $gameMap.regionId(x, y) === 10;
    },

    isRoofTile(x, y) {
      // Region 11/12 (bridge-access / bridge deck) take priority over the roof
      // terrain tag: a tile painted as both a roof (terrain tag 7) and a bridge
      // region is treated as the bridge, not a roof.
      const r = $gameMap.regionId(x, y);
      if (r === 11 || r === 12) return false;
      return $gameMap.terrainTag(x, y) === 7;
    },

    // Bridge tiles (region 12). Walked ON TOP when entered from a bridge-access
    // tile (region 11 or 5) or when continuing along the bridge; passed UNDER
    // (hidden by the bridge tile) when entered from any other tile. The on/under
    // state is tracked on the player as _onBridge and read by the screenZ hooks.
    isBridgeTile(x, y) {
      return $gameMap.regionId(x, y) === 12;
    },

    // True while the character is passing UNDER a bridge deck rather than
    // walking on top of it. The tile beneath the deck is whatever the map paints
    // there (water, a road, open ground), but its region reads as 12, so every
    // rule that asks "what am I standing on" has to ask this first.
    isUnderBridge(character) {
      return !!character && !character._onBridge &&
        this.isBridgeTile(character.x, character.y);
    },

    // Bridge decks laid over WATER. The deck tile masks the water it is painted
    // on, so the tile reads as region 12 and never as 99: every rule that has to
    // know whether there is water under the span (the dive prompt, the
    // underwater mask) asks this instead of the region. A deck tile counts as
    // submerged when it can be reached from a region-99 tile by walking only
    // over deck tiles, which is what makes a span thrown across a river count
    // along its whole length while a deck over dry ground counts nowhere.
    // Flooded once per map and cached on $gameMap.
    isSubmergedBridgeTile(x, y) {
      if ($gameMap.regionId(x, y) !== 12) return false;
      const w = $gameMap.width();
      if (!$gameMap._misSubmergedDeck) {
        const h = $gameMap.height();
        const set = new Set();
        const queue = [];
        for (let ty = 0; ty < h; ty++) {
          for (let tx = 0; tx < w; tx++) {
            if ($gameMap.regionId(tx, ty) !== 12) continue;
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
              $gameMap.regionId(tx + dx, ty + dy) === 99);
            if (near) {
              set.add(ty * w + tx);
              queue.push([tx, ty]);
            }
          }
        }
        while (queue.length) {
          const [cx, cy] = queue.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const key = ny * w + nx;
            if (set.has(key) || $gameMap.regionId(nx, ny) !== 12) continue;
            set.add(key);
            queue.push([nx, ny]);
          }
        }
        $gameMap._misSubmergedDeck = set;
      }
      return $gameMap._misSubmergedDeck.has(y * w + x);
    },

    // The tiles that stay water once the party is under the surface: painted
    // water, plus the decks thrown across it, so a diver can pass beneath a
    // span instead of the mask walling the river off at every bridge.
    isDiveWater(x, y) {
      return $gameMap.regionId(x, y) === 99 || this.isSubmergedBridgeTile(x, y);
    },

    // True while the character is in the water UNDER a bridge deck: swimming
    // (or diving) along the span rather than walking the ground beneath it.
    isSwimmingUnderBridge(character) {
      return this.isUnderBridge(character) &&
        this.isSubmergedBridgeTile(character.x, character.y);
    },

    // Access tiles that place the walker on top of the bridge deck: regions 11
    // (cliff upper level) and 5 (always-passable step).
    isBridgeAccessTile(x, y) {
      const r = $gameMap.regionId(x, y);
      return r === 11 || r === 5;
    },

    // The swim / fish / dive menu belongs to painted water (region 99) only.
    // A bridge deck is never an offer: the tile it masks still reads as water,
    // so facing a span would otherwise ask the party to dive into the bridge,
    // and standing ON a deck facing the river must not offer to swim off it.
    canPromptWater(character, x, y) {
      if (!character) return false;
      if (this.isBridgeTile(character.x, character.y)) return false;
      if (this.isBridgeTile(x, y)) return false;
      return this.isWaterTile(x, y);
    },

    isWallTile(x, y) {
      if ($gameMap.regionId(x, y) === 10) return true;
      return $gameMap.terrainTag(x, y) === 4;
    },

    hasPriorityTile(x, y) {
      if (!$gameMap || !$dataMap) return false;
      const tileId = $gameMap.tileId(x, y, 4);
      if (!tileId) return false;
      const tileset = $gameMap.tileset();
      if (!tileset || !tileset.flags) return false;
      return (tileset.flags[tileId] & 0x10) !== 0;
    },

    isClimbableAndAccessible(x, y) {
      if (!this.isClimbableTile(x, y)) return false;
      if (this.isBlockedClimbTile(x, y)) return false;
      if (this.hasPriorityTile(x, y)) return false;
      return true;
    },

    isCharacterFacingNorthOrSouth(character) {
      const d = character.direction();
      return d === 8 || d === 2;
    },

    canClimbInDirection(character) {
      return this.isCharacterFacingNorthOrSouth(character);
    },

    // Carrying it is enough; a rod equipped as a weapon counts too, which is what
    // the `true` asks $gameParty about.
    hasFishingRod() {
      if (Config.fishingRodItemIds.some(itemId => $gameParty.hasItem($dataItems[itemId]))) return true;
      return Config.fishingRodWeaponIds.some(weaponId => $gameParty.hasItem($dataWeapons[weaponId], true));
    },

    getFrontTile(character) {
      const d = character.direction();
      return {
        x: $gameMap.roundXWithDirection(character.x, d),
        y: $gameMap.roundYWithDirection(character.y, d)
      };
    },

    hasEventOnTile(x, y) {
      if (!$gameMap || !$gameMap.events()) return false;
      return $gameMap.events().some(event => event && event.x === x && event.y === y);
    },

    isKickableEvent(event) {
      if (!event || !event.event()) return false;
      const name = event.event().name.toLowerCase();
      return Config.kickableNames.some(k => name.includes(k.toLowerCase()));
    },

    isSeatTile(x, y) {
      return $gameMap.regionId(x, y) === 102;
    },

    getSeatTiles() {
      const seats = [];
      const w = $gameMap.width();
      const h = $gameMap.height();
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          if ($gameMap.regionId(x, y) === 102) seats.push({ x, y });
        }
      }
      return seats;
    },

    // A seat is taken if a seated follower occupies it. NPCs and other players
    // are events, so callers also check hasEventOnTile for those.
    isSeatTakenByParty(x, y) {
      if ($gamePlayer.followers && $gamePlayer.followers()) {
        return $gamePlayer.followers()._data.some(
          f => f && f._sittingDetached && f.x === x && f.y === y
        );
      }
      return false;
    },

    // Combined occupancy check for a seat tile: another sitting NPC/player
    // (event) or a seated party follower.
    isSeatOccupied(x, y) {
      if (this.hasEventOnTile(x, y)) return true;
      if (this.isSeatTakenByParty(x, y)) return true;
      if ($gamePlayer.x === x && $gamePlayer.y === y) return true;
      return false;
    }
  };

  // --- Diving suit sprite ---
  // The suit has two sheets: a still one that loops while the diver hangs in
  // the water and a moving one that loops, slowly, while they swim. Movement
  // between two tiles stops for a frame or two on every step, so the swap back
  // to the still sheet waits out a short grace period instead of flickering on
  // each of those gaps.
  window.DivingSprite = {
    STILL: 'Skab/!$DivingSuiteStill',   // i18n-ignore  sprite sheet name
    MOVING: 'Skab/!$DivingSuiteMoving', // i18n-ignore  sprite sheet name
    IDLE_FRAMES: 24,   // 0.4s at 60fps before the diver counts as still
    MOVING_WAIT: 16,   // frames per animation cell while swimming (slow loop)

    apply(character) {
      if (!character) return;
      if (character._originalStepAnime === undefined) {
        character._originalStepAnime = character.hasStepAnime();
      }
      // An unknown counter means the diver has just entered the water: start
      // them on the still sheet rather than mid swim.
      if (character._diveIdleCount === undefined) character._diveIdleCount = this.IDLE_FRAMES;
      if (character.isMoving()) character._diveIdleCount = 0;
      else character._diveIdleCount = Math.min(character._diveIdleCount + 1, this.IDLE_FRAMES);

      const swimming = character._diveIdleCount < this.IDLE_FRAMES;
      const wanted = swimming ? this.MOVING : this.STILL;
      character._diveSlowAnim = swimming;
      if (character.characterName() !== wanted) character.setImage(wanted, 0);
      character.setStepAnime(true);
    },

    clear(character) {
      if (!character) return;
      character._diveIdleCount = undefined;
      character._diveSlowAnim = false;
    }
  };

  // Both suit sheets loop on their own clock: the still one at a resting pace,
  // the moving one slower than a walk cycle so the swim reads as a swim.
  const _MIS_animationWait = Game_CharacterBase.prototype.animationWait;
  Game_CharacterBase.prototype.animationWait = function() {
    if (this._diveSlowAnim) return window.DivingSprite.MOVING_WAIT;
    return _MIS_animationWait.call(this);
  };

  // --- Core Systems ---
  const MovementSystem = {
    performKick(character, event) {
      const dir = character.direction();
      AudioManager.playSe({ name: "Kick", volume: 90, pitch: 100, pan: 0 });
      event.moveStraight(dir);
      if (!event.isMovementSucceeded()) return;
      event.moveStraight(dir);
    },

    storeOriginalAppearance(character) {
      if (!character._originalName) {
        character._originalName = character._characterName;
        character._originalIndex = character._characterIndex;
      }
    },

    restoreOriginalAppearance(character) {
      if (character._originalName) {
        character.setImage(character._originalName, character._originalIndex);
      }
    },

    enterSwimMode(character) {
      if (character._isSwimming) return;
      this.storeOriginalAppearance(character);
      character._isSwimming = true;
      this.resetSwimStamina(character);
      // Getting into the water puts the swimmer under any span they were
      // standing on, never on its deck: the deck-walker's exit restriction in
      // canPass must not hold them on the bridge as they push off into it.
      character._onBridge = false;

      playSwimSplash(Config.sounds.startSwim);

      // Issue #153: swimming washes the swimmer clean. Cleanliness is the
      // hygiene need (TimeDateSystem), and it comes off a stroke at a time now
      // rather than all at once on entry, for the whole party (see
      // Game_Player.increaseSteps below). Getting in dirty still leaves a green
      // grime puddle around them as the first of it rinses off.
      if (character === $gamePlayer) {
        const actor = $gameParty && $gameParty.leader ? $gameParty.leader() : null;
        if (actor && typeof actor.hygienePercent === "function" && actor.hygienePercent() < 50) {
          MovementSystem.spawnGrimePuddle(character);
        }
      }
    },

    // A short-lived pool of translucent green grime sprites at the swimmer's
    // feet, drawn directly on the map tilemap. No asset is required: the blob
    // texture is generated once via PIXI. Purely cosmetic and self-cleaning.
    spawnGrimePuddle(character) {
      const scene = SceneManager._scene;
      const spriteset = scene && scene._spriteset;
      if (!spriteset || !spriteset._tilemap || !Graphics.app) return;

      if (!MovementSystem._grimeTexture) {
        const g = new PIXI.Graphics();
        g.beginFill(0xffffff);
        g.drawEllipse(0, 0, 18, 11);
        g.endFill();
        MovementSystem._grimeTexture = Graphics.app.renderer.generateTexture(g);
        g.destroy();
      }

      const tilemap = spriteset._tilemap;
      const baseX = character.screenX();
      const baseY = character.screenY();
      const blobs = [];
      const count = 6;
      for (let i = 0; i < count; i++) {
        const s = new PIXI.Sprite(MovementSystem._grimeTexture);
        s.anchor.set(0.5);
        s.tint = 0x4f7a2a;
        s.x = baseX + (Math.random() - 0.5) * 36;
        s.y = baseY - 4 + (Math.random() - 0.5) * 22;
        s.scale.set(0.5 + Math.random() * 0.8);
        s.alpha = 0.55;
        tilemap.addChild(s);
        blobs.push(s);
      }

      let life = 90;
      const tick = () => {
        // If the scene/tilemap was torn down mid-animation, the blobs were
        // destroyed with it. Stop the RAF loop and do not touch dead objects.
        const curScene = SceneManager._scene;
        const curTilemap = curScene && curScene._spriteset && curScene._spriteset._tilemap;
        if (curTilemap !== tilemap) {
          return;
        }
        life--;
        const fade = Math.max(0, life / 90);
        blobs.forEach((s) => { s.alpha = 0.55 * fade; });
        if (life <= 0) {
          blobs.forEach((s) => {
            if (s.parent) s.parent.removeChild(s);
            s.destroy();
          });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },

    // Rearm swim/climb state after a transfer completes (queued in
    // Game_Player.performTransfer, applied from Game_Player.update).
    applyTransferRearm(character, type) {
      switch (type) {
        case "spawnRegion":
          this.applySpawnRegionState(character);
          break;
        case "seabed":
          if (!character._isSwimming && !character._isClimbing) {
            character._isSwimming = true;
          }
          break;
        case "swim636":
          if (!character._isSwimming && !character._isClimbing) {
            this.enterSwimMode(character);
          }
          break;
        // Arriving on a water tile the walker cannot stand on: the party is IN
        // the water, so they start swimming. Re-checked here rather than in
        // performTransfer because the landing tile can still move afterwards
        // (WorldMapReturn pulls the party out of the surf on a beach square).
        case "swimIfWater": {
          // Ask the passability question for a plain walker: a swimmer already
          // reads open water as passable, which would answer "dry land" here.
          const prevChecking = window._currentlyCheckingCharacter;
          window._currentlyCheckingCharacter = null;
          const inWater = Utils.isWaterTile(character.x, character.y) &&
            !$gameMap.isPassable(character.x, character.y, 2);
          window._currentlyCheckingCharacter = prevChecking;
          if (inWater) {
            if (!character._isSwimming && !character._isClimbing) {
              this.enterSwimMode(character);
            }
          } else if (character._isSwimming) {
            this.exitSwimMode(character);
          }
          break;
        }
        case "swim":
          character._isSwimming = true;
          break;
        case "climb":
          character._isClimbing = true;
          character._lastClimbX = character.x;
          character._lastClimbY = character.y;
          character.setDirection(8);
          this.setCompanionsVisibility(false);
          character._currentClimbHeight = 0;
          break;
      }
    },

    // The tile a character is standing on is remembered alongside the bridge
    // layer, so a scene rebuild that does not move anybody (a menu, a battle)
    // keeps the on/under state instead of recomputing it as "on the deck".
    rememberBridgeState(character) {
      if (!character || !$gameMap) return;
      character._bridgeStateKey = $gameMap.mapId() + "," + character.x + "," + character.y;
    },

    bridgeStateMatchesTile(character) {
      if (!character || !$gameMap) return false;
      return character._bridgeStateKey ===
        $gameMap.mapId() + "," + character.x + "," + character.y;
    },

    // Regions whose behaviour is a STATE rather than a rule (the bridge layer,
    // swimming, climbing) have to be established the moment the map is up, so a
    // party that spawns or is transferred onto such a tile already obeys the
    // region before the first step is taken.
    applySpawnRegionState(character) {
      if (!character || !$gameMap) return;
      const region = $gameMap.regionId(character.x, character.y);

      // Bridge deck (region 12): arriving on it, by transfer or by load, lands
      // ON the deck, which is what makes the walk-off restriction (canPass)
      // apply - EXCEPT when the landing tile has no bridge-network neighbour
      // (12, 11 or 5) on any side. A transfer can drop a character on any
      // region-12 tile a map happens to carry, not only the ones a real,
      // fully-painted bridge run connects, and forcing the on-deck state there
      // would trap them behind their own walk-off gate with no legal first
      // step in any direction. Ordinary footstep entry (moveStraight) is
      // unaffected: it only ever sets _onBridge true by actually walking in
      // from a real access tile, so this guard only matters for spawns.
      // A swimmer is in the water the deck crosses, so they are always
      // underneath it however they arrived on the tile.
      character._onBridge = region === 12 && !character._isSwimming &&
        [2, 4, 6, 8].some((d) => {
          const nx = $gameMap.roundXWithDirection(character.x, d);
          const ny = $gameMap.roundYWithDirection(character.y, d);
          return Utils.isBridgeTile(nx, ny) || Utils.isBridgeAccessTile(nx, ny);
        });
      this.rememberBridgeState(character);

      // A wall region cannot be stood on, so a character that spawns on one is
      // already on the wall and starts the map climbing it.
      if (!Config.disableClimbing && !character._isClimbing && !character._isSwimming &&
          (region === 4 || Utils.isClimbableAndAccessible(character.x, character.y))) {
        this.enterClimbMode(character);
      }
    },

    exitSwimMode(character) {
      if (!character._isSwimming) return;
      character._isSwimming = false;
      // Back on land the lungs fill again: the tile count starts from zero on
      // the next crossing.
      this.resetSwimStamina(character);

      playSwimSplash(Config.sounds.stopSwim);

      this.restoreOriginalAppearance(character);

      if (character === $gamePlayer) {
        if (!character._isClimbing) {
          this.setCompanionsVisibility(true);
        }
        if ($gameTemp.isDestinationValid()) {
          $gameTemp.clearDestination();
        }
      }
    },

    exitDiveMode(character) {
      if (!character._isDiving) return;
      character._isDiving = false;
      window.DivingSprite.clear(character);
      character._hideTiles = false;
      
      // Restore events
      if (!window.SplitScreenManager || !window.SplitScreenManager.active) {
        $gameMap.events().forEach(event => {
          if (event && event._originalTransparent !== undefined) {
            event.setTransparent(event._originalTransparent);
            delete event._originalTransparent;
          }
        });
      }
      
      if ($gameMap.mapId() !== 636) {
        // Restore parallax
        if (character._originalParallaxName !== undefined) {
          $gameMap.changeParallax(
            character._originalParallaxName,
            character._originalParallaxLoopX,
            character._originalParallaxLoopY,
            character._originalParallaxSx,
            character._originalParallaxSy
          );
        }
        
        // Restore tileset
        if (character._originalTilesetId !== undefined) {
          $gameMap.changeTileset(character._originalTilesetId);
          delete character._originalTilesetId;
        }
        
        $gameScreen.startFlash([255, 255, 255, 128], 30);
        
        // Reset Fog of War
        if ($gameMap && $gameMap.initializeFogOfWar) {
          $gameMap.initializeFogOfWar();
          if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene._spriteset.refreshFogOfWar();
          }
        }
      }
    },

    // Split-screen: when one player starts diving, pull the other one down with
    // them so both end up underwater together (the dive switches the shared map
    // to the underwater tileset, which would otherwise strand the other player on
    // a now-impassable surface tile). Places the partner on an adjacent water tile
    // (or the diver's own tile as a fallback) and puts them in swim mode.
    teleportPartnerToDiver(diver) {
      const mgr = window.SplitScreenManager || window.$gameSplitScreen;
      if (!mgr || !mgr.active || !mgr.p2Event) return;

      let partner = null;
      if (diver === $gamePlayer) partner = mgr.p2Event;
      else if (diver === mgr.p2Event) partner = $gamePlayer;
      if (!partner) return;

      let tx = diver.x;
      let ty = diver.y;
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of dirs) {
        const nx = diver.x + dx;
        const ny = diver.y + dy;
        if (Utils.isWaterTile(nx, ny) && $gameMap.eventsXy(nx, ny).length === 0) {
          tx = nx;
          ty = ny;
          break;
        }
      }

      partner.locate(tx, ty);
      this.enterSwimMode(partner);
    },

    enterClimbMode(character) {
      if (character._isClimbing) return;
      character._isClimbing = true;
      character._currentClimbHeight = 0;
      character._lastClimbX = character.x;
      character._lastClimbY = character.y;
      character.setDirection(8);

      if (Config.sounds.startClimb) {
        AudioManager.playSe({ name: Config.sounds.startClimb, volume: 90, pitch: 100, pan: 0 });
      }

      if (character === $gamePlayer) {
        this.setCompanionsVisibility(false);
      }
    },

    exitClimbMode(character, jumpX = 0, jumpY = 0) {
      if (!character) character = $gamePlayer;
      character._isClimbing = false;
      character._isClimbingMove = false;

      if (Config.sounds.stopClimb) {
        AudioManager.playSe({ name: Config.sounds.stopClimb, volume: 90, pitch: 100, pan: 0 });
      }

      this.restoreOriginalAppearance(character);
      character.setTransparent(false);
      this.setCompanionsVisibility(true);

      if (jumpX !== 0 || jumpY !== 0) {
        character.jump(jumpX, jumpY);
      }

      // Getting off the wall in one piece trains Rock Climbing (spec 224).
      if (character === $gamePlayer && window.SpecializationXP) {
        window.SpecializationXP.awardCapped("Rock Climbing", 1);
      }

      $gameTemp.clearDestination();
      Input.clear();
    },

    setCompanionsVisibility(visible) {
      if (!Config.hideCompanions) return;
      if (companionsVisible === visible) return;
      companionsVisible = visible;

      // A companion is hidden while the player swims or climbs: walking the
      // marching column (Core/AutoIdleExplorer.js) they have nowhere to be
      // while the leader is in the water or up a wall.
      if ($gamePlayer.followers && $gamePlayer.followers()) {
        for (const follower of $gamePlayer.followers()._data) {
          if (!follower) continue;
          follower.setTransparent(!visible);
        }
      }
    },

    performFishing(character) {
      if (window.Scene_FishingMinigame) {
        this.performFishingMinigame();
      } else {
        console.warn("MovementInteractionSystem: Scene_FishingMinigame not found. Cannot fish.");
      }
    },

    performFishingMinigame() {
      $gamePlayer._isFishing = true;
      SceneManager.push(window.Scene_FishingMinigame);
      window._fishingMinigameResult = null;
    },

    // Ocean/Beach biomes are salt water: drinking makes the party nauseous and
    // takes hunger off the drinker instead of easing it, the way a mouthful of
    // brine actually works on a body. Anywhere else the water is drinkable and
    // eases hunger a little. The whole mouthful is reported through the shared
    // toast - what was drunk and what it did to the meters - rather than in a
    // message box the player has to dismiss for every sip.
    performDrinkWater(character) {
      const isSaltWater = Utils.isSaltWaterHere();
      const leader = $gameParty.leader();

      if (isSaltWater) {
        $gameParty.members().forEach(actor => actor.addState(SALT_WATER_STATE_ID));
        if (leader && leader.reduceHunger) leader.reduceHunger(SALT_WATER_HUNGER_COST);
        MovementSystem.announceDrink(leader, T('Movement.drankSaltWater'),
          -SALT_WATER_HUNGER_COST, SALT_WATER_STATE_ID);
      } else {
        if (leader && leader.addHunger) leader.addHunger(DRINK_HUNGER_GAIN);
        MovementSystem.announceDrink(leader, T('Movement.drankWater'), DRINK_HUNGER_GAIN, 0);
      }
    },

    // The mouthful, read as meters: what was drunk, the hunger the drinker
    // gained or lost, and (salt water only) the state it left them in, one
    // toast after the other.
    announceDrink(actor, text, hungerDelta, stateId) {
      const toast = window.ParchmentToast;
      if (!toast || !toast.need) return;
      const state = stateId ? $dataStates[stateId] : null;
      const popups = [];
      if (text) {
        popups.push(() => toast.show(text, {
          severity: stateId ? 'warning' : 'info',
          duration: 150
        }));
      }
      if (hungerDelta) {
        popups.push(() => toast.need('hunger', hungerDelta, {
          value: actor && actor.hungerPercent ? actor.hungerPercent() : null
        }));
      }
      if (state) {
        popups.push(() => toast.show(
          window.translateText ? window.translateText(state.name) : state.name,
          { severity: 'warning', icon: state.iconIndex, duration: 200 }
        ));
      }
      toast.group(popups);
    },

    enterSitMode(character) {
      if (character._isSitting) return;
      const d = character.direction();
      const x2 = $gameMap.roundXWithDirection(character.x, d);
      const y2 = $gameMap.roundYWithDirection(character.y, d);
      // Remember the (walkable) tile they sat down from: standing up falls back
      // to it when the seat is boxed in by impassable furniture.
      character._sitFromX = character.x;
      character._sitFromY = character.y;
      character.setDirection(d);
      character._x = x2;
      character._y = y2;
      character._realX = $gameMap.xWithDirection(x2, character.reverseDir(d));
      character._realY = $gameMap.yWithDirection(y2, character.reverseDir(d));
      character.increaseSteps();
      character._isSitting = true;

      if (character === $gamePlayer) this.seatFollowers(character);
    },

    // Detach visible followers from the party and seat them on the nearest free
    // seat tiles (region 102), facing the same way as the player.
    seatFollowers(player) {
      if (!player.followers || !player.followers()) return;
      const followers = player.followers()._data.filter(f => f && f.isVisible() && f.actor());
      if (followers.length === 0) return;

      const d = player.direction();
      const seats = Utils.getSeatTiles()
        .filter(s => !(s.x === player.x && s.y === player.y))
        .filter(s => !Utils.isSeatOccupied(s.x, s.y))
        .sort((a, b) => {
          const da = Math.abs(a.x - player.x) + Math.abs(a.y - player.y);
          const db = Math.abs(b.x - player.x) + Math.abs(b.y - player.y);
          return da - db;
        });

      for (const follower of followers) {
        if (seats.length === 0) break;
        const seat = seats.shift();
        follower._sittingDetached = true;
        follower._isSitting = true;
        follower.setDirection(d);
        follower._x = follower._realX = seat.x;
        follower._y = follower._realY = seat.y;
        follower.straighten();
      }
    },

    // Reattach detached followers so they resume following the player.
    releaseFollowers(player) {
      if (!player.followers || !player.followers()) return;
      for (const follower of player.followers()._data) {
        if (follower && follower._sittingDetached) {
          follower._sittingDetached = false;
          follower._isSitting = false;
        }
      }
    },

    changeSeat(character, targetX, targetY) {
      if (!character._isSitting) return;
      const d = character.direction();
      character._x = targetX;
      character._y = targetY;
      character._realX = $gameMap.xWithDirection(targetX, character.reverseDir(d));
      character._realY = $gameMap.yWithDirection(targetY, character.reverseDir(d));
      character.increaseSteps();
    },

    // Whether a seated character can step off their seat in direction d. The
    // seat itself is a chair/bench tile and is normally impassable (sitting down
    // teleports onto it rather than walking), so canPass() -- which also tests
    // the tile being left -- rejects every direction and would trap the player
    // on the seat. Only the destination is checked here.
    canLeaveSeat(character, d) {
      const x2 = $gameMap.roundXWithDirection(character.x, d);
      const y2 = $gameMap.roundYWithDirection(character.y, d);
      if (!$gameMap.isValid(x2, y2)) return false;
      if (character.isThrough() || character.isDebugThrough()) return true;
      if (!$gameMap.isPassable(x2, y2, character.reverseDir(d))) return false;
      if (character.isCollidedWithCharacters(x2, y2)) return false;
      return true;
    },

    exitSitMode(character, direction) {
      if (!character._isSitting) return;
      character._isSitting = false;
      character._sitHoldFrames = 0;
      character._sitHoldDir = 0;
      if (character === $gamePlayer) this.releaseFollowers(character);

      // Stand up by stepping off the seat. Prefer the requested direction (the
      // way the player is facing), then the reverse (the tile they sat down
      // from, which is guaranteed to have been walkable), then any remaining
      // free neighbour.
      const candidates = [];
      if (direction) candidates.push(direction);
      candidates.push(character.reverseDir(character.direction()));
      for (const d of [2, 4, 6, 8]) {
        if (!candidates.includes(d)) candidates.push(d);
      }

      let step = 0;
      for (const d of candidates) {
        if (this.canLeaveSeat(character, d)) { step = d; break; }
      }

      if (step === 0) {
        // Fully boxed in (e.g. a booth reached across a counter): drop back onto
        // the tile they sat down from so standing up always leaves the seat.
        this.standAtSitOrigin(character);
        return;
      }

      const d = step;
      const x2 = $gameMap.roundXWithDirection(character.x, d);
      const y2 = $gameMap.roundYWithDirection(character.y, d);
      character.setDirection(d);
      character._x = x2;
      character._y = y2;
      character._realX = $gameMap.xWithDirection(x2, character.reverseDir(d));
      character._realY = $gameMap.yWithDirection(y2, character.reverseDir(d));
      character.increaseSteps();
    },

    standAtSitOrigin(character) {
      const ox = character._sitFromX;
      const oy = character._sitFromY;
      if (ox === undefined || oy === undefined) return;
      if (ox === character.x && oy === character.y) return;
      character.setDirection(character.reverseDir(character.direction()));
      character.locate(ox, oy);
      character.increaseSteps();
    }
  };

  // Safe wrapper for player movement restrictions
  const _Game_Player_canMove = Game_Player.prototype.canMove;
  Game_Player.prototype.canMove = function() {
    if (this._isFishing || (window.Scene_FishingMinigame && SceneManager._scene instanceof window.Scene_FishingMinigame)) {
      return false;
    }
    return _Game_Player_canMove.call(this);
  };

  const _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);
    if ($gamePlayer) {
      $gamePlayer._isFishing = false;
      // Special regions are applied as soon as the map is up, so spawning or
      // transferring onto one already behaves like walking onto it. A scene that
      // rebuilds without moving the party (a menu, a battle) keeps the layer it
      // had, so returning to the map does not lift a walker out from under a
      // bridge deck.
      if (!MovementSystem.bridgeStateMatchesTile($gamePlayer)) {
        MovementSystem.applySpawnRegionState($gamePlayer);
      }
    }
    mapWASDKeys();
  };

  // --- Water Reflection System ---
  const ReflectionSystem = {
    // Whether the current map contains any reflective water (region 99).
    // Computed once per map (invalidated from Game_Map.setup) so maps without
    // water skip the whole per-frame reflection pass.
    _hasReflectiveWater: null,

    invalidateWaterScan() {
      this._hasReflectiveWater = null;
      this._spriteCacheOwner = null;
      this._spriteCache = null;
    },

    scanReflectiveWater() {
      let found = false;
      if ($gameMap && $dataMap) {
        const w = $gameMap.width();
        const h = $gameMap.height();
        for (let y = 0; y < h && !found; y++) {
          for (let x = 0; x < w; x++) {
            if ($gameMap.regionId(x, y) === 99) { found = true; break; }
          }
        }
      }
      this._hasReflectiveWater = found;
    },

    // The container and the sprites in it belong to ONE spriteset: a scene
    // teardown destroys them along with it. A module-level handle kept across
    // that change pointed at a destroyed, unparented container, and since it
    // was still truthy nothing ever rebuilt it, so every reflection after the
    // first menu, shop or battle was added to a container nobody renders.
    // Rebuild whenever the handle no longer belongs to the spriteset on screen.
    isContainerLive(spriteset) {
      return !!reflectionContainer &&
        !reflectionContainer._destroyed &&
        reflectionContainer.parent === spriteset._baseSprite;
    },

    initialize() {
      if (!SceneManager._scene || !SceneManager._scene._spriteset) return;
      const spriteset = SceneManager._scene._spriteset;
      if (!spriteset._tilemap || !spriteset._baseSprite) return;
      if (this.isContainerLive(spriteset)) return;

      // The old sprites went down with the old scene; keeping them would hand
      // every character a destroyed reflection that can never be drawn again.
      reflectionSprites.clear();
      reflectionContainer = new PIXI.Container();
      reflectionContainer.z = 0;
      spriteset._baseSprite.addChild(reflectionContainer);
    },

    shouldHaveReflection(character) {
      if (!character) return false;
      const x = character.x;
      const y = character.y;
      const waterY = y + 1;
      if (waterY >= $gameMap.height()) return false;
      return $gameMap.regionId(x, waterY) === 99;
    },

    createReflectionSprite(character) {
      if (!character._characterName) return null;
      const reflection = new Sprite_Character(character);
      reflection.scale.y = -1;
      reflection.opacity = 64; // Fainter reflection

      // Tint reflection based on time of day
      let timeBlendColor;
      if (typeof window.TimeDateSystem !== 'undefined' && window.TimeDateSystem.getDateTimeFromMinutes) {
        const minutes = window.TimeDateSystem.getGameTimeMinutes();
        const dateTime = window.TimeDateSystem.getDateTimeFromMinutes(minutes);
        const hour = parseInt(dateTime.hours);

        // Dawn (4-6): warm orange-pink
        if (hour >= 4 && hour < 6) {
          timeBlendColor = [160, 80, 40, 64];
        }
        // Morning (6-10): light gold
        else if (hour >= 6 && hour < 10) {
          timeBlendColor = [40, 70, 120, 64];
        }
        // Midday (10-16): bright blue-azure
        else if (hour >= 10 && hour < 16) {
          timeBlendColor = [0, 50, 100, 64];
        }
        // Afternoon (16-19): golden warm
        else if (hour >= 16 && hour < 19) {
          timeBlendColor = [120, 80, 30, 64];
        }
        // Sunset (19-20): deep orange-red
        else if (hour >= 19 && hour < 20) {
          timeBlendColor = [180, 60, 30, 64];
        }
        // Dusk (20-21): purple-magenta
        else if (hour >= 20 && hour < 21) {
          timeBlendColor = [120, 40, 80, 64];
        }
        // Night (21-4): deep blue-moonlight
        else {
          timeBlendColor = [20, 30, 90, 64];
        }
      } else {
        // Fallback if TimeDateSystem is not loaded
        timeBlendColor = [0, 50, 100, 50];
      }
      reflection.setBlendColor(timeBlendColor);

      // Apply a blue/azure pixel mask so only blue-toned parts of the reflection show
      if (PIXI.Filter) {
        const blueMaskFilter = new PIXI.Filter(null, `
          varying vec2 vTextureCoord;
          uniform sampler2D uSampler;

          void main(void) {
            vec4 color = texture2D(uSampler, vTextureCoord);
            float r = color.r;
            float g = color.g;
            float b = color.b;

            // All blue colors: keep any pixel where blue is the strongest channel
            // and blue is at least somewhat visible (b > 0.05)
            float blueDominant = step(r, b) * step(g, b) * step(0.05, b);

            // Also keep near-gray pixels that have a slight blue tint
            // (highlights, shading, white/light reflections on water)
            float maxC = max(max(r, g), b);
            float minC = min(min(r, g), b);
            float isBlueTinted = step(max(r, g), b) * step(0.02, b - max(r, g));

            float keep = max(blueDominant, isBlueTinted);

            gl_FragColor = vec4(color.rgb, color.a * keep);
          }
        `);
        blueMaskFilter.padding = 0;
        reflection.filters = [blueMaskFilter];
      }

      return reflection;
    },

    update() {
      // Cheap early-out on maps with no reflective water (region 99).
      if (this._hasReflectiveWater === null) this.scanReflectiveWater();
      if (!this._hasReflectiveWater) {
        if (reflectionSprites.size > 0) {
          for (const reflection of reflectionSprites.values()) {
            if (reflection.parent) reflection.parent.removeChild(reflection);
          }
          reflectionSprites.clear();
        }
        return;
      }

      // Cheap when the container is already the live one; rebuilds it after a
      // scene change took the old spriteset (and everything in it) with it.
      this.initialize();
      if (!reflectionContainer || !SceneManager._scene || !SceneManager._scene._spriteset) return;

      const spriteset = SceneManager._scene._spriteset;
      const allCharacters = [];

      if ($gameMap && $gameMap.events()) allCharacters.push(...$gameMap.events());
      if ($gamePlayer) {
        allCharacters.push($gamePlayer);
        if ($gamePlayer.followers && $gamePlayer.followers()._data) {
          allCharacters.push(...$gamePlayer.followers()._data);
        }
      }

      const charactersNeedingReflections = new Set();

      for (const character of allCharacters) {
        if (!character) continue;

        if (this.shouldHaveReflection(character)) {
          charactersNeedingReflections.add(character);

          if (!reflectionSprites.has(character)) {
            const reflection = this.createReflectionSprite(character);
            if (reflection) {
              reflectionSprites.set(character, reflection);
              reflectionContainer.addChild(reflection);
            }
          }

          const reflection = reflectionSprites.get(character);
          if (reflection) {
            const characterSprite = this.findCharacterSprite(spriteset, character);
            if (characterSprite) {
              // Only recompute the reflection when the source moved or its
              // animation pattern changed; otherwise the reflection is static.
              const pattern = character.pattern ? character.pattern() : 0;
              if (reflection._lastSrcX !== characterSprite.x ||
                  reflection._lastSrcY !== characterSprite.y ||
                  reflection._lastPattern !== pattern) {
                reflection.x = characterSprite.x;
                reflection.y = characterSprite.y + $gameMap.tileHeight() * 2;
                reflection._character = character;
                reflection.update();
                reflection._lastSrcX = characterSprite.x;
                reflection._lastSrcY = characterSprite.y;
                reflection._lastPattern = pattern;
              }
            }
          }
        }
      }

      const toRemove = [];
      for (const [character, reflection] of reflectionSprites) {
        if (!charactersNeedingReflections.has(character)) {
          toRemove.push(character);
          if (reflection.parent) reflection.parent.removeChild(reflection);
        }
      }
      for (const character of toRemove) reflectionSprites.delete(character);
    },

    // Cache a character -> sprite map instead of a linear scan per character.
    findCharacterSprite(spriteset, character) {
      if (!spriteset || !spriteset._characterSprites) return null;
      const sprites = spriteset._characterSprites;
      if (this._spriteCacheOwner !== sprites || this._spriteCacheLen !== sprites.length) {
        this._spriteCache = new Map();
        for (let i = 0; i < sprites.length; i++) {
          this._spriteCache.set(sprites[i]._character, sprites[i]);
        }
        this._spriteCacheOwner = sprites;
        this._spriteCacheLen = sprites.length;
      }
      return this._spriteCache.get(character) || null;
    },

    cleanup() {
      if (reflectionContainer) {
        for (const [character, reflection] of reflectionSprites) {
          reflectionContainer.removeChild(reflection);
        }
        reflectionSprites.clear();
        if (reflectionContainer.parent) {
          reflectionContainer.parent.removeChild(reflectionContainer);
        }
        reflectionContainer = null;
      }
    }
  };

  // --- Mirror Reflection System ---
  // An event named "Mirror" reflects whoever stands on the tile in front of it
  // (the tile in the mirror's own facing direction). The reflection is the same
  // kind of sprite the water uses, but upright: only the facing is flipped
  // across the mirror's plane, so a character looking into it shows their face.
  const MirrorSystem = {
    _mirrors: null,
    _mapId: -1,
    _eventCount: -1,

    invalidate() {
      this._mirrors = null;
      this._mapId = -1;
      this._eventCount = -1;
    },

    initialize() {
      if (!SceneManager._scene || !SceneManager._scene._spriteset) return;
      const spriteset = SceneManager._scene._spriteset;

      if (!mirrorContainer) {
        mirrorContainer = new PIXI.Container();
        mirrorContainer.z = 0;
        if (spriteset._tilemap) {
          spriteset._baseSprite.addChild(mirrorContainer);
        }
      }
    },

    // The mirror list is cached per map and recomputed when the event table
    // changes (dynamically spawned mirrors on the procedural maps).
    mirrors() {
      if (!$gameMap) return [];
      const count = $gameMap._events ? $gameMap._events.length : 0;
      if (!this._mirrors || this._mapId !== $gameMap.mapId() || this._eventCount !== count) {
        const mirrors = [];
        const events = $gameMap.events ? $gameMap.events() : [];
        for (const event of events) {
          if (!event) continue;
          const data = event.event ? event.event() : null;
          if (!data || !data.name) continue;
          if (String(data.name).trim().toLowerCase() !== Config.mirrorEventName) continue;
          mirrors.push(event);
        }
        this._mirrors = mirrors;
        this._mapId = $gameMap.mapId();
        this._eventCount = count;
      }
      return this._mirrors;
    },

    // Whoever stands on the given tile: the player first, then a follower, then
    // any other event with a graphic (the mirror itself never reflects itself).
    occupantAt(x, y, mirror) {
      if ($gamePlayer && $gamePlayer.x === x && $gamePlayer.y === y && $gamePlayer._characterName) {
        return $gamePlayer;
      }
      if ($gamePlayer && $gamePlayer.followers && $gamePlayer.followers()._data) {
        for (const follower of $gamePlayer.followers()._data) {
          if (!follower || !follower._characterName) continue;
          if (follower.isVisible && !follower.isVisible()) continue;
          if (follower.x === x && follower.y === y) return follower;
        }
      }
      for (const event of $gameMap.eventsXy(x, y)) {
        if (!event || event === mirror || event._erased) continue;
        if (event._characterName) return event;
      }
      return null;
    },

    // Direction seen in the glass: flipped along the mirror's own axis, so a
    // wall mirror facing south turns an upward-facing character downward and
    // leaves left/right alone.
    reflectDirection(direction, mirrorDirection) {
      const vertical = mirrorDirection === 2 || mirrorDirection === 8;
      if (vertical) {
        if (direction === 2) return 8;
        if (direction === 8) return 2;
      } else {
        if (direction === 4) return 6;
        if (direction === 6) return 4;
      }
      return direction;
    },

    createMirrorSprite(character, mirrorDirection) {
      if (!character._characterName) return null;
      const sprite = new Sprite_Character(character);
      sprite._mirrorDirection = mirrorDirection;
      sprite.characterPatternY = function () {
        const reflected = MirrorSystem.reflectDirection(
          this._character.direction(), this._mirrorDirection
        );
        return (reflected - 2) / 2;
      };
      // A faint cool cast so the reflection reads as glass rather than a twin.
      sprite.setBlendColor([20, 25, 45, 30]);
      return sprite;
    },

    updateMirrorSprite(sprite, character, mirror, mirrorDirection, frontX, frontY) {
      sprite._mirrorDirection = mirrorDirection;
      sprite.update();

      const tw = $gameMap.tileWidth();
      const th = $gameMap.tileHeight();
      const anchorX = $gameMap.adjustX(frontX) * tw + tw / 2;
      const anchorY = ($gameMap.adjustY(frontY) + 1) * th;
      // Sub-tile offsets carry into the glass: sideways motion slides along the
      // mirror, motion toward it moves the reflection the opposite way.
      const dx = character.screenX() - anchorX;
      const dy = character.screenY() - anchorY;
      const vertical = mirrorDirection === 2 || mirrorDirection === 8;

      sprite.x = mirror.screenX() + (vertical ? dx : -dx);
      sprite.y = mirror.screenY() + (vertical ? -dy : dy);
      // Sprite_Character.update resets opacity from the source character, so the
      // reflection is re-dimmed every frame.
      sprite.opacity = Math.floor(character.opacity() * Config.mirrorOpacityRate);
      // Never force a hidden source (a stowed follower) back into view.
      if (character.isVisible && !character.isVisible()) sprite.visible = false;
    },

    removeSprite(mirror) {
      const entry = mirrorSprites.get(mirror);
      if (!entry) return;
      if (mirrorContainer) mirrorContainer.removeChild(entry.sprite);
      mirrorSprites.delete(mirror);
    },

    update() {
      const mirrors = this.mirrors();
      if (!mirrors.length) {
        if (mirrorSprites.size > 0) {
          for (const mirror of Array.from(mirrorSprites.keys())) this.removeSprite(mirror);
        }
        return;
      }

      if (!mirrorContainer) this.initialize();
      if (!mirrorContainer || !SceneManager._scene || !SceneManager._scene._spriteset) return;

      const active = new Set();

      for (const mirror of mirrors) {
        if (!mirror || mirror._erased) continue;
        if (mirror.isNearTheScreen && !mirror.isNearTheScreen()) continue;

        const direction = mirror.direction();
        const frontX = $gameMap.roundXWithDirection(mirror.x, direction);
        const frontY = $gameMap.roundYWithDirection(mirror.y, direction);
        const character = this.occupantAt(frontX, frontY, mirror);
        if (!character) continue;

        let entry = mirrorSprites.get(mirror);
        if (!entry || entry.character !== character) {
          if (entry) this.removeSprite(mirror);
          const sprite = this.createMirrorSprite(character, direction);
          if (!sprite) continue;
          entry = { character, sprite };
          mirrorSprites.set(mirror, entry);
          mirrorContainer.addChild(sprite);
        }

        active.add(mirror);
        this.updateMirrorSprite(entry.sprite, character, mirror, direction, frontX, frontY);
      }

      for (const mirror of Array.from(mirrorSprites.keys())) {
        if (!active.has(mirror)) this.removeSprite(mirror);
      }
    },

    cleanup() {
      if (mirrorContainer) {
        for (const [, entry] of mirrorSprites) {
          mirrorContainer.removeChild(entry.sprite);
        }
        if (mirrorContainer.parent) {
          mirrorContainer.parent.removeChild(mirrorContainer);
        }
        mirrorContainer = null;
      }
      mirrorSprites.clear();
      this.invalidate();
    }
  };

  // --- Overrides ---

  // Game_Player
  const _Game_Player_update = Game_Player.prototype.update;
  Game_Player.prototype.update = function (sceneActive) {
    _Game_Player_update.call(this, sceneActive);
    // Apply any swim/climb rearm queued by the last transfer once the transfer
    // has fully completed. This replaces wall-clock setTimeout deferrals that
    // could drop or duplicate the flag on rapid transfers or a backgrounded tab.
    if (this._pendingSwimClimbRearm && !this.isTransferring()) {
      const actions = this._pendingSwimClimbRearm;
      this._pendingSwimClimbRearm = null;
      actions.forEach((type) => MovementSystem.applyTransferRearm(this, type));
    }
    this.updateSwimState();
  };

  // Cache the (roof-tile, region-102) tile classification per character until it
  // moves, so screenZ does not re-query regionId/terrainTag every frame.
  //
  // The seat region is kept apart from the roof as well as combined with it:
  // Game_CharacterBase.screenZ asks only about region 102, and it asked
  // $gameMap.regionId directly, once per character per frame, for every
  // follower and every event on the map. It can read the same cached tile the
  // player's own path has been reading all along.
  //
  // The map id rides in the key because x and y alone do not identify a tile
  // across a transfer: walking onto (12,7) of a new map from (12,7) of the old
  // one would otherwise keep the answer the previous map gave.
  const _misZTileFacts = (character) => {
    const mapId = $gameMap ? $gameMap.mapId() : 0;
    if (character._misZTileX !== character.x ||
        character._misZTileY !== character.y ||
        character._misZTileMap !== mapId) {
      character._misZTileX = character.x;
      character._misZTileY = character.y;
      character._misZTileMap = mapId;
      character._misZIsSeat = $gameMap.regionId(character.x, character.y) === 102;
      character._misZIsRoofOrSeat =
        Utils.isRoofTile(character.x, character.y) || character._misZIsSeat;
    }
    return character;
  };
  const _misRoofOrSeatAt = (character) => _misZTileFacts(character)._misZIsRoofOrSeat;
  const _misSeatAt = (character) => _misZTileFacts(character)._misZIsSeat;

  // A "☆" tile (the star passage of the tileset) is foreground scenery: it
  // is always walkable and the tilemap paints it on the upper layer, over every
  // character. That is right for the tile a character actually stands on (an
  // awning, a treetop, a bush they have stepped into) but wrong for the tile
  // directly NORTH of them, because a character sprite is taller than one tile
  // and its head reaches up into that square. A bush painted as star tiles then
  // shears the head off anyone standing south of it.
  //
  // So: standing south of a star tile, and not inside one, the character draws
  // above the upper tile layer instead of below it. The scenery still shows
  // whatever is behind it, and the sprite is whole.
  const _misStarTileAt = (x, y) => {
    if (!$gameMap || !$gameMap.isValid(x, y)) return false;
    const flags = $gameMap.tilesetFlags();
    return $gameMap.layeredTiles(x, y).some((tileId) => (flags[tileId] & 0x10) !== 0);
  };

  // Cached per tile: the classification only changes when the character moves.
  const _misUnderStarTile = (character) => {
    if (character._misStarX !== character.x || character._misStarY !== character.y) {
      character._misStarX = character.x;
      character._misStarY = character.y;
      const x = character.x;
      const y = character.y;
      character._misStarOverhead =
        !_misStarTileAt(x, y) &&
        _misStarTileAt(x, y - 1) &&
        // "Passable" in the sense the star tile itself promises: the scenery is
        // walk-through, so a solid tile hidden beneath it (a wall, a cliff) is
        // not something the sprite should be drawn over.
        !!$gameMap.isPassable(x, y - 1, 2);
    }
    return character._misStarOverhead;
  };

  // Above the upper tile layer (z 4), below the bridge deck (z 7).
  const STAR_OVERHEAD_Z = 5;

  const _Game_Player_screenZ = Game_Player.prototype.screenZ;
  Game_Player.prototype.screenZ = function () {
    if (_misRoofOrSeatAt(this)) return 10;
    if (_misUnderStarTile(this)) return STAR_OVERHEAD_Z;
    // On a bridge tile: draw above the upper tile layer when on the deck, or at
    // the normal character depth (below the upper layer) when passing underneath,
    // so the bridge tile hides the player.
    if (Utils.isBridgeTile(this.x, this.y)) {
      return this._onBridge ? 7 : _Game_Player_screenZ.call(this);
    }
    return _Game_Player_screenZ.call(this);
  };

  const _Game_CharacterBase_screenZ = Game_CharacterBase.prototype.screenZ;
  Game_CharacterBase.prototype.screenZ = function () {
    if ($gameMap && _misSeatAt(this)) return 10;
    if ($gameMap && this._priorityType === 1 && _misUnderStarTile(this)) {
      return STAR_OVERHEAD_Z;
    }
    // Followers ride the same bridge layer as the player so the party does not
    // split across the deck and the underside.
    if ($gameMap && this instanceof Game_Follower &&
        $gamePlayer && $gamePlayer._onBridge && Utils.isBridgeTile(this.x, this.y)) {
      return 7;
    }
    return _Game_CharacterBase_screenZ.call(this);
  };

  const _Game_Player_isDashing = Game_Player.prototype.isDashing;
  Game_Player.prototype.isDashing = function () {
    if (this._isSwimming || this._isClimbing || this._isSitting) return false;
    if (window.$gameSplitScreen && window.$gameSplitScreen.active) return false;
    return _Game_Player_isDashing.call(this);
  };

  const _Game_Player_updateDashing = Game_Player.prototype.updateDashing;
  Game_Player.prototype.updateDashing = function () {
    if (this._isSwimming || this._isClimbing || this._isSitting) {
      this._dashing = false;
      return;
    }
    _Game_Player_updateDashing.call(this);
  };

  const _Game_Player_moveStraight = Game_Player.prototype.moveStraight;
  Game_Player.prototype.moveStraight = function (d) {
    if (this._isSitting) {
      this.setDirection(d);
      return;
    }

    if (this._isClimbing && Utils.isRoofTile(this.x, this.y)) {
      const x2 = $gameMap.roundXWithDirection(this.x, d);
      const y2 = $gameMap.roundYWithDirection(this.y, d);
      const destIsRoof = Utils.isRoofTile(x2, y2);
      const destIsClimbable = Utils.isClimbableAndAccessible(x2, y2);

      if (!destIsRoof && !destIsClimbable) {
        const isPassable = $gameMap.isPassable(x2, y2, d);
        const isClear = !this.isCollidedWithEvents(x2, y2) && !this.isCollidedWithVehicles(x2, y2);

        if (isPassable && isClear) {
          let jumpX = 0, jumpY = 0;
          switch (d) {
            case 2: jumpY = 1; break;
            case 4: jumpX = -1; break;
            case 6: jumpX = 1; break;
            case 8: jumpY = -1; break;
          }
          MovementSystem.exitClimbMode(this, jumpX, jumpY);
          return;
        }
        return;
      }
    }

    if (this._isClimbing && d === 8) {
      const x2 = $gameMap.roundXWithDirection(this.x, d);
      const y2 = $gameMap.roundYWithDirection(this.y, d);

      if (!Utils.isWallTile(x2, y2) && !Utils.isRoofTile(x2, y2)) {
        const isPassable = $gameMap.isPassable(x2, y2, d);
        const isClear = !this.isCollidedWithEvents(x2, y2) && !this.isCollidedWithVehicles(x2, y2);

        if (isPassable && isClear) {
          this.jump(0, -1);
          MovementSystem.exitClimbMode(this, 0, 0);
          return;
        }
      }
    }

    if (this._isClimbing && (d === 4 || d === 6)) {
      const dx2 = $gameMap.roundXWithDirection(this.x, d);
      const dy2 = $gameMap.roundYWithDirection(this.y, d);
      const srcTag = $gameMap.terrainTag(this.x, this.y);
      const dstTag = $gameMap.terrainTag(dx2, dy2);
      if ((srcTag === 7 && dstTag === 4) || (srcTag === 4 && dstTag === 7)) return;
    }

    // Capture where the player is stepping FROM before the move updates position,
    // so the bridge layer can be decided by the source tile once the step lands.
    const bridgeSrcAccess = Utils.isBridgeAccessTile(this.x, this.y);
    const bridgeSrcWasBridge = Utils.isBridgeTile(this.x, this.y);

    _Game_Player_moveStraight.call(this, d);

    // Bridge layering (region 12): entering from a bridge-access tile (region 11
    // or 5) or continuing along the bridge keeps the player on the deck; entering
    // from any other tile sends the player underneath (hidden by the bridge tile).
    if (this.isMovementSucceeded()) {
      if (Utils.isBridgeTile(this.x, this.y)) {
        if (bridgeSrcAccess) {
          this._onBridge = true;
        } else if (!bridgeSrcWasBridge) {
          this._onBridge = false;
        }
        // bridge -> bridge: keep the current _onBridge state.
      } else {
        this._onBridge = false;
      }
      MovementSystem.rememberBridgeState(this);
    }
  };

  // Split-screen: Player 1 auto-starts swimming the instant they walk into a
  // water tile, exactly like Player 2's auto-swim entry. No "Swim" prompt needed.
  const _Game_Player_moveByInput_swim = Game_Player.prototype.moveByInput;
  Game_Player.prototype.moveByInput = function () {
    if (window.$gameSplitScreen && window.$gameSplitScreen.active &&
        !this._isSwimming && !this._isClimbing && !this._isSitting &&
        !this.isMoving() && this.canMove() && !$gameMessage.isBusy()) {
      const dir = this.getInputDirection();
      if (dir > 0) {
        const x2 = $gameMap.roundXWithDirection(this.x, dir);
        const y2 = $gameMap.roundYWithDirection(this.y, dir);
        if (Utils.isWaterTile(x2, y2) && !Utils.isBlockedWaterTile(x2, y2) &&
            $gameMap.eventsXy(x2, y2).length === 0 &&
            !this.canPass(this.x, this.y, dir)) {
          MovementSystem.enterSwimMode(this);
          this.moveStraight(dir);
          return;
        }
      }
    }
    _Game_Player_moveByInput_swim.call(this);
  };

  const _Game_Player_checkEventTriggerHere = Game_Player.prototype.checkEventTriggerHere;
  Game_Player.prototype.checkEventTriggerHere = function (triggers) {
    if (this._isClimbing) {
      if ($gameMap.eventsXy(this.x, this.y).length === 0) return false;
    }
    return _Game_Player_checkEventTriggerHere.call(this, triggers);
  };

  const _Game_Player_checkEventTriggerThere = Game_Player.prototype.checkEventTriggerThere;
  Game_Player.prototype.checkEventTriggerThere = function (triggers) {
    if (this._isClimbing) {
      const x2 = $gameMap.roundXWithDirection(this.x, this.direction());
      const y2 = $gameMap.roundYWithDirection(this.y, this.direction());
      if ($gameMap.eventsXy(x2, y2).length === 0) return false;
    }
    return _Game_Player_checkEventTriggerThere.call(this, triggers);
  };

  // A hurt body walks no slower than a whole one. Wounds, broken legs and a
  // hit point bar down to its last sliver are read everywhere else in the
  // game, but never off the walking speed: crossing the map at a crawl is a
  // punishment the player cannot act on, so the terrain alone decides the
  // pace. HealthCore.mobility is still the authority on what a body has left,
  // it simply no longer reaches this function.
  const _Game_Player_realMoveSpeed = Game_Player.prototype.realMoveSpeed;
  Game_Player.prototype.realMoveSpeed = function () {
    let speed = _Game_Player_realMoveSpeed.call(this);
    if (this._isClimbing) speed *= Config.climbSpeed;
    return speed;
  };

  Game_Player.prototype.updateSwimState = function () {
    if ($gameSystem._procGenData && $gameSystem._procGenData.currentBiome === "SeaBed") {
      if (!this._isSwimming) {
        this._isSwimming = true;
        this._swimAnimationFrame = 0;
      }
      return;
    }

    if (this._isSwimming) {
      // The water a bridge is thrown across is painted with the deck's region
      // (12), not with the water region, so a swimmer passing UNDER the span
      // would otherwise stand up mid river and be unable to swim back out of it.
      // The underside counts as the water it is painted over for as long as the
      // crossing lasts; the far side of the span decides what happens next.
      const underDeck = Utils.isSwimmingUnderBridge(this);

      if (!Utils.isWaterTile(this.x, this.y) && !underDeck) {
        if (this._isDiving) {
          MovementSystem.exitDiveMode(this);
        }
        MovementSystem.exitSwimMode(this);
        return;
      }

      if (this._isDiving && $gameMap.regionId(this.x, this.y) !== 99 && !underDeck) {
        MovementSystem.exitDiveMode(this);
      }

      // The stroke is heard for every tile swum, the ones under a bridge deck
      // included: the swimmer is still in the water down there, so the sound
      // must not fall silent for the length of the span.
      if (Config.sounds.swimMove && this.isMoving()) {
        const currentFrame = Graphics.frameCount;
        if (currentFrame - lastSwimSoundFrame >= Config.sounds.swimInterval) {
          AudioManager.playSe({ name: Config.sounds.swimMove, volume: 16, pitch: 100, pan: 0 });
          lastSwimSoundFrame = currentFrame;
        }
      }

      // Time actually spent in the water trains Swimming (specialization 267).
      // The whole party is in the water, not watching the leader swim from the
      // bank, so everybody earns the full points rather than an onlooker's cut.
      if (this.isMoving() && window.SpecializationXP) {
        window.SpecializationXP.tick("Swimming", 1, 30, { key: "swim", shared: true });
      }
    }

    if (this._isClimbing) {
      const currentTileIsRoof = Utils.isRoofTile(this.x, this.y);
      const currentTileIsClimbable = Utils.isClimbableAndAccessible(this.x, this.y);

      if (!currentTileIsClimbable && !currentTileIsRoof) {
        let jumpX = 0, jumpY = 1;
        const destX = this.x + jumpX;
        const destY = this.y + jumpY;
        if ($gameMap.isPassable(destX, destY, 0)) {
          MovementSystem.exitClimbMode(this, jumpX, jumpY);
        } else {
          MovementSystem.exitClimbMode(this, 0, 0);
        }
        return;
      }

      this._lastClimbX = this.x;
      this._lastClimbY = this.y;

      if (!currentTileIsRoof) this.setDirection(8);

      if (Config.sounds.climbMove && this.isMoving()) {
        const currentFrame = Graphics.frameCount;
        if (currentFrame - lastClimbSoundFrame >= Config.sounds.climbInterval) {
          AudioManager.playSe({ name: Config.sounds.climbMove, volume: 50, pitch: 100, pan: 0 });
          lastClimbSoundFrame = currentFrame;
        }
      }
    }
  };

  // Washing off, one stroke at a time. Every step taken in the water gives the
  // WHOLE party a point of hygiene (TimeDateSystem's meter is 0-100, so a point
  // is a percent), companions included: they are swimming alongside the leader,
  // not watching from the bank. PartyNeeds.addNeedToAll writes each member's
  // meter where it actually lives, the actor for the player and the society
  // profile for a recruited companion, and clamps at full.
  const SWIM_HYGIENE_PER_STEP = 1;

  // A stroke at a time is too small a change to notice, so the wash is only
  // reported at the quarter marks, and only once each on the way up. A mark
  // already announced stays quiet until the party has got a deadband dirtier
  // than it, so swimming on at full hygiene reports 100% once rather than every
  // step and says nothing again until they are back under 85.
  const SWIM_HYGIENE_MARKS = [25, 50, 75, 100];
  const SWIM_HYGIENE_DEADBAND = 15;
  let swimHygieneMark = 0;

  const partyHygiene = () => {
    const median = window.PartyNeeds?.partyMedian ? window.PartyNeeds.partyMedian() : null;
    const value = median ? median.hygiene : null;
    return (value === null || value === undefined) ? null : Math.round(value);
  };

  const reportSwimHygiene = (before, after) => {
    if (before === null || after === null) return;
    if (swimHygieneMark && after < swimHygieneMark - SWIM_HYGIENE_DEADBAND) swimHygieneMark = 0;
    const marks = SWIM_HYGIENE_MARKS.filter((m) => m <= after);
    const mark = marks.length ? marks[marks.length - 1] : 0;
    if (!mark || mark <= swimHygieneMark) return;
    swimHygieneMark = mark;
    if (!window.ParchmentToast?.need) return;
    window.ParchmentToast.need("hygiene", after - before, {
      value: after,
      duration: 160
    });
  };

  // ---------------------------------------------------------------------------
  // Swim stamina
  // ---------------------------------------------------------------------------
  // How far the party can swim is the Swimming specialization, in tiles: an
  // untrained swimmer manages SWIM_BASE_TILES and every tier above Untrained
  // buys SWIM_TILES_PER_LEVEL more. The budget is the party's best swimmer,
  // because the party crosses together and the strong one tows the rest.
  //
  // Past it nothing is blocked, or a player would be stranded mid lake with no
  // legal move: instead every further stroke costs the whole party HP and never
  // takes anyone below 1, so the water pushes them to a shore rather than
  // drowning them outright. Reaching land resets the count.
  const SWIM_SPEC = "Swimming";  // i18n-ignore  specialization id
  const SWIM_BASE_TILES = 20;
  const SWIM_TILES_PER_LEVEL = 15;
  const SWIM_EXHAUSTED_HP_PCT = 0.05;
  const SWIM_EXHAUSTED_HP_MIN = 3;
  // Swimming is how swimming is learnt: one point per this many tiles, to the
  // whole party, since everybody is in the water (award's `shared`).
  const SWIM_XP_PER_TILES = 8;

  MovementSystem.swimTileBudget = function () {
    const XP = window.SpecializationXP;
    const level = (XP && XP.partyLevel) ? XP.partyLevel(SWIM_SPEC) : 1;
    return SWIM_BASE_TILES + SWIM_TILES_PER_LEVEL * (Math.max(1, level) - 1);
  };

  MovementSystem.swimTilesLeft = function () {
    const swum = ($gamePlayer && $gamePlayer._swimTiles) || 0;
    return Math.max(0, MovementSystem.swimTileBudget() - swum);
  };

  MovementSystem.resetSwimStamina = function (character) {
    if (!character) return;
    character._swimTiles = 0;
    character._swimExhaustedWarned = false;
  };

  // One stroke: count it, teach it, and once the budget is gone, charge for it.
  MovementSystem.spendSwimStroke = function () {
    const player = $gamePlayer;
    if (!player) return;
    player._swimTiles = (player._swimTiles || 0) + 1;

    const XP = window.SpecializationXP;
    if (XP && XP.award && player._swimTiles % SWIM_XP_PER_TILES === 0) {
      XP.award(SWIM_SPEC, 1, { shared: true });
    }

    if (player._swimTiles <= MovementSystem.swimTileBudget()) return;

    if (!player._swimExhaustedWarned) {
      player._swimExhaustedWarned = true;
      if (window.ParchmentToast && window.ParchmentToast.show) {
        window.ParchmentToast.show(T('Movement.swimExhausted'),
          { severity: 'warning', duration: 200 });
      }
    }

    const members = ($gameParty && $gameParty.members) ? $gameParty.members() : [];
    for (const actor of members) {
      if (!actor || !actor.isAlive || !actor.isAlive()) continue;
      const cost = Math.max(SWIM_EXHAUSTED_HP_MIN,
        Math.ceil(actor.mhp * SWIM_EXHAUSTED_HP_PCT));
      actor.setHp(Math.max(1, actor.hp - cost));
    }
  };

  const _Game_Player_increaseSteps = Game_Player.prototype.increaseSteps;
  Game_Player.prototype.increaseSteps = function () {
    _Game_Player_increaseSteps.call(this);
    if (this._isSwimming) {
      MovementSystem.spendSwimStroke();
      if (window.PartyNeeds?.addNeedToAll) {
        const before = partyHygiene();
        window.PartyNeeds.addNeedToAll("hygiene", SWIM_HYGIENE_PER_STEP);
        reportSwimHygiene(before, partyHygiene());
      }
    }
  };

  const _Game_Player_gatherFollowers = Game_Player.prototype.gatherFollowers;
  Game_Player.prototype.gatherFollowers = function () {
    _Game_Player_gatherFollowers.call(this);
    if (!companionsVisible) MovementSystem.setCompanionsVisibility(false);
  };

  // A gather that never finishes is a softlock: boarding a vehicle, a cutscene
  // and a transfer all wait on areGathered(), and one companion (most often the
  // pet, which trails at the end of the chain) stuck against a wall or wandered
  // far off holds the whole party still. After GATHER_THROUGH_DELAY the
  // stragglers are allowed to walk through walls, and if even that fails to
  // close the distance they are placed on the player outright.
  const GATHER_THROUGH_DELAY = 300;  // 5 seconds at 60fps
  const GATHER_SNAP_DELAY = 600;     // 10 seconds: last resort

  function releaseGatherThrough(followers) {
    if (!followers._gatherForcedThrough) return;
    for (const follower of followers._data) follower.setThrough(false);
    followers._gatherForcedThrough = false;
  }

  const _Game_Followers_gather = Game_Followers.prototype.gather;
  Game_Followers.prototype.gather = function () {
    if (!this.areGathering()) this._gatherStartFrame = Graphics.frameCount;
    _Game_Followers_gather.call(this);
  };

  const _Game_Followers_update_MIS = Game_Followers.prototype.update;
  Game_Followers.prototype.update = function () {
    if (this.areGathering()) {
      if (this._gatherStartFrame === undefined) this._gatherStartFrame = Graphics.frameCount;
      const waited = Graphics.frameCount - this._gatherStartFrame;
      if (waited >= GATHER_SNAP_DELAY) {
        this.synchronize($gamePlayer.x, $gamePlayer.y, $gamePlayer.direction());
      } else if (waited >= GATHER_THROUGH_DELAY && !this._gatherForcedThrough) {
        for (const follower of this._data) follower.setThrough(true);
        this._gatherForcedThrough = true;
      }
    }
    _Game_Followers_update_MIS.call(this);
    if (!this.areGathering()) {
      releaseGatherThrough(this);
      this._gatherStartFrame = undefined;
    }
  };

  // A companion parked on a seat ignores chaseCharacter, so it can never close
  // the gap on its own: standing up is part of being gathered.
  const _Game_Followers_updateMove_MIS = Game_Followers.prototype.updateMove;
  Game_Followers.prototype.updateMove = function () {
    if (this._gatherForcedThrough) {
      for (const follower of this._data) follower._sittingDetached = false;
    }
    _Game_Followers_updateMove_MIS.call(this);
  };

  // Keep seated (detached) followers anchored on their seat tiles instead of
  // chasing the player.
  const _Game_Follower_chaseCharacter = Game_Follower.prototype.chaseCharacter;
  Game_Follower.prototype.chaseCharacter = function (character) {
    if (this._sittingDetached) return;
    _Game_Follower_chaseCharacter.call(this, character);
  };

  const _Game_Followers_refresh = Game_Followers.prototype.refresh;
  Game_Followers.prototype.refresh = function () {
    _Game_Followers_refresh.call(this);
    if ($gamePlayer._isClimbing) {
      MovementSystem.setCompanionsVisibility(false);
    } else {
      MovementSystem.setCompanionsVisibility(true);
    }
  };

  // Scene_Map
  const _Scene_Map_updateScene = Scene_Map.prototype.updateScene;
  Scene_Map.prototype.updateScene = function () {
    _Scene_Map_updateScene.call(this);
    if (!SceneManager.isSceneChanging()) {
      this.updateSwimFishInput();
      ReflectionSystem.update();
      MirrorSystem.update();
    }
  };

  Scene_Map.prototype.updateSwimFishInput = function () {
    if ($gameMap.mapId() === 315) return;
    // The sleep/wait popup owns the OK button while it is up. Without this, an
    // OK press meant for one of its rows ALSO ran the terrain interaction of the
    // tile the party is facing -- and on a Bed/Campfire/Tent/Bedroll that
    // interaction is openSleepMenu() itself, which rebuilt the popup with the
    // cursor back on the first row before SleepMenuInputManager (which runs
    // later in Scene_Map.update) could read the press. Save and Set respawn
    // point were unreachable: every confirm snapped back to the top row and did
    // nothing at all.
    if ($gameTemp._sleepMenuOpen) return;
    if ($gamePlayer._isSitting) {
      // Suppress sit input (including the stop-sitting prompt) while a message
      // or event is running, e.g. when talking to an event while seated.
      if ($gameMessage.isBusy() || $gameMap.isEventRunning()) return;

      const dirMap = { up: 8, down: 2, left: 4, right: 6 };
      let heldDir = 0;
      for (const [key, d] of Object.entries(dirMap)) {
        if (Input.isPressed(key)) { heldDir = d; break; }
      }

      if (heldDir) {
        if ($gamePlayer._sitHoldDir !== heldDir) {
          $gamePlayer._sitHoldDir = heldDir;
          $gamePlayer._sitHoldFrames = 0;
        }
        $gamePlayer._sitHoldFrames = ($gamePlayer._sitHoldFrames || 0) + 1;
        if ($gamePlayer._sitHoldFrames >= 60 &&
            MovementSystem.canLeaveSeat($gamePlayer, heldDir)) {
          $gamePlayer._sitHoldFrames = 0;
          $gamePlayer._sitHoldDir = 0;
          MovementSystem.exitSitMode($gamePlayer, heldDir);
          return;
        }
      } else {
        $gamePlayer._sitHoldFrames = 0;
        $gamePlayer._sitHoldDir = 0;
      }

      if (Input.isTriggered("ok")) {
        const d = $gamePlayer.direction();
        const x2 = $gameMap.roundXWithDirection($gamePlayer.x, d);
        const y2 = $gameMap.roundYWithDirection($gamePlayer.y, d);
        // The native Game_Player.triggerButtonAction already fired this same OK
        // press one update phase earlier and may have started (or be about to
        // start) the event in front, including across counter tiles. If there is
        // any interactable event in front, never also offer to stand up (#64).
        const x3 = $gameMap.roundXWithDirection(x2, d);
        const y3 = $gameMap.roundYWithDirection(y2, d);
        const eventInFront =
          $gameMap.isEventRunning() ||
          Utils.hasEventOnTile(x2, y2) ||
          ($gameMap.isCounter(x2, y2) && Utils.hasEventOnTile(x3, y3));
        if (eventInFront) {
          // Let the event trigger (native already handles it); do nothing else.
          $gamePlayer.checkEventTriggerThere([0]);
        } else if (Utils.isSeatTile(x2, y2) && !Utils.isSeatOccupied(x2, y2)) {
          this.showChangeSeatOptions($gamePlayer, x2, y2);
        } else if ($gameMap.isCounter(x2, y2)) {
          // Counter with no event behind it: never step forward over a counter,
          // but still let the player stand up (exitSitMode steps out the back).
          this.showStopSittingOptions($gamePlayer, 0);
        } else {
          // Offer to stand up. When the faced tile is passable the player steps
          // forward into it; when it is a wall/edge (#171) exitSitMode falls back
          // to the tile behind (where they sat down from) so standing up always
          // moves the player off the seat instead of freezing in place (#236).
          this.showStopSittingOptions($gamePlayer, d);
        }
      }

      return;
    }
    this.checkMovementInteraction($gamePlayer);
  };

  Scene_Map.prototype.checkMovementInteraction = function (character) {
    if (!character) return;
    // Whoever already has the screen keeps the keypress: a message or choice
    // that is up (including a prompt this very function opened), and the
    // hotbar's target card, which is HTML and hands its OK back to the map.
    // Without this, using an item off the quick bar in front of water opened
    // the swim/dive/drink prompt on the same press that used the item.
    if ($gameMessage.isBusy()) return;
    if ($gamePlayer._hotbarTargeting) return;
    // Also guarded in updateSwimFishInput above; repeated here because Player 2
    // (SplitScreenMultiplayer) and MapBattleMode call this entry point directly.
    if ($gameTemp._sleepMenuOpen) return;
    const isPlayer = character === $gamePlayer;

    if (character._isSwimming) {
      const isMultiplayer = window.$gameSplitScreen && window.$gameSplitScreen.active;
      if ($gameMap.mapId() === 636) {
        const currentBiome = $gameSystem._procGenData ? $gameSystem._procGenData.currentBiome : null;
        // Proc-map ocean diving is permitted in a 2P session: both players are
        // pulled down to (and back up from) the seabed together because goDown /
        // goUp set SplitScreenManager.forceP2Teleport. This is the ONLY diving
        // allowed in split-screen; all non-procedural diving stays disabled below.
        if (currentBiome && currentBiome.toLowerCase().includes("ocean")) {
          if (isPlayer ? Input.isTriggered("ok") : true) {
            this.showDiveOption(character);
            return;
          }
        }
        if (currentBiome && currentBiome.toLowerCase().includes("seabed")) {
          if (isPlayer ? Input.isTriggered("ok") : true) {
            this.showResurfaceOption(character);
            return;
          }
        }
      } else {
        // Non-procedural map
        const frontTile = Utils.getFrontTile(character);
        const hasEventInFront = Utils.hasEventOnTile(frontTile.x, frontTile.y);

        // Under a span the tile reads as the deck (region 12), not as water, so
        // the swimmer beneath it has to be recognised as being in the water too:
        // otherwise the dive (and the resurface) prompt goes dead mid crossing.
        const inDiveWater = $gameMap.regionId(character.x, character.y) === 99 ||
          Utils.isSwimmingUnderBridge(character);
        if ((!isMultiplayer || $gameMap.mapId() !== 636) && !hasEventInFront && inDiveWater) {
          if ($gameParty.hasItem($dataItems[DIVING_SUIT_ITEM_ID])) {
            if (isPlayer ? Input.isTriggered("ok") : true) {
              if (character._isDiving) {
                this.showNonProcResurfaceOption(character);
              } else {
                this.showNonProcDiveOption(character);
              }
              return;
            }
          }
        }
      }
    }

    if (character._isSwimming || character._isFishing || character._isClimbing || character._isSitting) return;

    const isTriggered = isPlayer ? Input.isTriggered("ok") : true;

    if (isTriggered) {
      const frontTile = Utils.getFrontTile(character);

      if (Utils.isRoofTile(frontTile.x, frontTile.y) && !Utils.hasEventOnTile(frontTile.x, frontTile.y)) {
        return;
      }

      if ($gameMap.mapId() === 636) {
        // Interactive TERRAIN FEATURES (house / inn / shop / skyscraper / dungeon
        // doors, and SignPark vehicle recall / SignBus fast-travel) are used by facing
        // them, replacing the old tile-id -> common-event matching below. Runs
        // first so a feature is never dismantled or double-fired.
        if (isPlayer && window.ProceduralHouseSystem && window.ProceduralHouseSystem.tryProcMapInteract
            && !Utils.hasEventOnTile(frontTile.x, frontTile.y)) {
          if (window.ProceduralHouseSystem.tryProcMapInteract(character)) return;
        }

        const currentTileset = $gameMap.tileset();
        const tilesetId = currentTileset ? currentTileset.id : 0;
        const layersToCheck = [4, 3, 2];
        let foundTileId = 0;

        for (const layer of layersToCheck) {
          const tileId = $gameMap.tileId(frontTile.x, frontTile.y, layer);
          if (tileId !== 0) {
            foundTileId = tileId;
            break;
          }
        }

        if (foundTileId !== 0 && window.WorldGen && window.WorldGen.Map636TileEvents) {
          for (const [commonEventId, config] of Object.entries(window.WorldGen.Map636TileEvents)) {
            if (typeof commonEventId === 'string' && isNaN(parseInt(commonEventId))) continue;
            for (const tilesetConfig of config.tilesets) {
              if (tilesetConfig.tilesetId === tilesetId && tilesetConfig.tileIds.includes(foundTileId)) {
                $gameTemp.reserveCommonEvent(parseInt(commonEventId));
                return;
              }
            }
          }
        }

        // Terrain feature interaction (fell/mine/pick/dismantle). Runs only when
        // no tile-event above claimed the faced tile and no event sits on it.
        if (window.TerrainInteractions && !Utils.hasEventOnTile(frontTile.x, frontTile.y)) {
          if (window.TerrainInteractions.tryInteract(character)) {
            return;
          }
        }
      }

      if (Utils.isClimbableAndAccessible(frontTile.x, frontTile.y) && Utils.canClimbInDirection(character) && !Utils.hasEventOnTile(frontTile.x, frontTile.y)) {
        this.showClimbOptions(character);
        return;
      }

      if (Utils.isSeatTile(frontTile.x, frontTile.y) && !Utils.isSeatOccupied(frontTile.x, frontTile.y)) {
        this.showSitOptions(character);
        return;
      }

      // Casting a line over the side. The water menu below never opens for a
      // crew afloat (it needs the faced tile to be impassable, and a hull passes
      // over water freely), so fishing from a boat gets its own prompt first.
      if (this.showBoatFishingOption(character)) return;

      if (Utils.canPromptWater(character, frontTile.x, frontTile.y) && !Utils.isBlockedWaterTile(frontTile.x, frontTile.y) && !Utils.hasEventOnTile(frontTile.x, frontTile.y) && !Utils.isWallTile(frontTile.x, frontTile.y) && !character.canPass(character.x, character.y, character.direction())) {
        if (character.isInVehicle && character.isInVehicle() && character.vehicle().isShip()) return;
        this.showSwimFishOptions(character);
      }
    }

    if (isPlayer) {
      this.processTouchForWaterInteraction();
      this.processTouchForClimbInteraction();
    }
  };

  Scene_Map.prototype.processTouchForWaterInteraction = function () {
    if (!TouchInput.isTriggered()) return;

    const x = $gameMap.canvasToMapX(TouchInput.x);
    const y = $gameMap.canvasToMapY(TouchInput.y);
    const playerX = $gamePlayer.x;
    const playerY = $gamePlayer.y;

    const isAdjacent = Math.abs(playerX - x) + Math.abs(playerY - y) === 1;

    if (isAdjacent && Utils.canPromptWater($gamePlayer, x, y) && !Utils.isBlockedWaterTile(x, y) && !Utils.hasEventOnTile(x, y)) {
      let d = 0;
      if (x === playerX) d = y > playerY ? 2 : 8;
      else if (y === playerY) d = x > playerX ? 6 : 4;

      if (d > 0 && $gamePlayer.canPass(playerX, playerY, d)) return;

      if (x === playerX) {
        $gamePlayer.setDirection(y > playerY ? 2 : 8);
      } else if (y === playerY) {
        $gamePlayer.setDirection(x > playerX ? 6 : 4);
      }
      this.showSwimFishOptions($gamePlayer);
    }
  };

  Scene_Map.prototype.processTouchForClimbInteraction = function () {
    if (!TouchInput.isTriggered()) return;

    const x = $gameMap.canvasToMapX(TouchInput.x);
    const y = $gameMap.canvasToMapY(TouchInput.y);
    const playerX = $gamePlayer.x;
    const playerY = $gamePlayer.y;

    const isAdjacent = Math.abs(playerX - x) + Math.abs(playerY - y) === 1;

    if (isAdjacent && Utils.isClimbableAndAccessible(x, y) && !Utils.hasEventOnTile(x, y)) {
      if ($gameMap.mapId() === 636) {
        $gamePlayer.setDirection(y > playerY ? 2 : 8);
        this.showClimbOptions($gamePlayer);
        return;
      }

      if (x > playerX) $gamePlayer.setDirection(6);
      else if (x < playerX) $gamePlayer.setDirection(4);
      else if (y > playerY) $gamePlayer.setDirection(2);
      else if (y < playerY) $gamePlayer.setDirection(8);

      if (Utils.canClimbInDirection($gamePlayer)) {
        this.showClimbOptions($gamePlayer);
      }
    }
  };

  Scene_Map.prototype.showClimbOptions = function (character) {
    if (!$dataMap || (!$dataMap.meta.Exterior && !$dataMap.note.includes("Exterior"))) return;

    const choices = [T('Movement.climb'), T('Movement.cancel')];
    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index === choices.indexOf(T('Movement.climb'))) {
        MovementSystem.enterClimbMode(character);
      }
    });
  };

  // Dining venues (tavern, fast food joint, bar, pizzeria, ...) on this map that
  // a seated player can order from. Guarded so the seat menus still work when
  // RandomDailyShop is absent or the map holds no such venue.
  const diningVenues = () => {
    const api = window.RandomDailyShop;
    if (!api || !api.findDiningVenues) return [];
    try {
      return api.findDiningVenues();
    } catch (e) {
      console.warn("MovementInteractionSystem: could not list dining venues.", e);
      return [];
    }
  };

  // Two pizzerias on one map would otherwise read identically, so a repeated
  // venue name carries its distance from the seat.
  const venueChoiceLabel = (venue, venues) => {
    const repeated = venues.filter(v => v.label === venue.label).length > 1;
    return repeated ? `${venue.label} (${venue.distance} ${T('Movement.tiles')})` : venue.label;
  };

  // Sitting inside a venue that serves food lets the player order from the table
  // instead of walking over to the counter, so every seated prompt grows an
  // "Order food" row whenever the map has somewhere to order from.
  const appendOrderFoodOption = (scene, choices, handlers) => {
    const venues = diningVenues();
    if (venues.length === 0) return;
    choices.push(T('Movement.orderFood'));
    // Defer past the choice window teardown ($gameMessage is cleared right after
    // this callback), so the venue picker actually shows.
    handlers.push(() => setTimeout(() => scene.showOrderFoodOptions(venues), 0));
  };

  Scene_Map.prototype.showSitOptions = function (character) {
    const choices = [T('Movement.sit'), T('Movement.cancel')];
    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index === 0) {
        MovementSystem.enterSitMode(character);
      }
    });
  };

  Scene_Map.prototype.showChangeSeatOptions = function (character, targetX, targetY) {
    const choices = [T('Movement.changeSeat')];
    const handlers = [() => MovementSystem.changeSeat(character, targetX, targetY)];

    // Facing a neighbouring seat must not be the one spot where standing up is
    // unreachable; direction 0 so exitSitMode steps out the back instead of onto
    // the seat being faced.
    choices.push(T('Movement.stopSitting'));
    handlers.push(() => MovementSystem.exitSitMode(character, 0));

    appendOrderFoodOption(this, choices, handlers);

    choices.push(T('Movement.cancel'));
    handlers.push(() => {});

    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      const handler = handlers[index];
      if (handler) handler();
    });
  };

  Scene_Map.prototype.showStopSittingOptions = function (character, direction) {
    const choices = [T('Movement.stopSitting')];
    const handlers = [() => MovementSystem.exitSitMode(character, direction)];

    appendOrderFoodOption(this, choices, handlers);

    choices.push(T('Movement.cancel'));
    handlers.push(() => {});

    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      const handler = handlers[index];
      if (handler) handler();
    });
  };

  // Venue picker behind "Order food": every food-serving shop on the map, closest
  // first, so a player at a table can order across the room. The order opens that
  // venue's own daily stock, exactly as if they had walked up to its counter.
  Scene_Map.prototype.showOrderFoodOptions = function (venues) {
    const choices = venues.map(v => venueChoiceLabel(v, venues));
    choices.push(T('Movement.cancel'));
    $gameMessage._eventActivator = "p1";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index < 0 || index >= venues.length) return;
      setTimeout(() => window.RandomDailyShop.openDiningVenue(venues[index]), 0);
    });
  };

  // Sea water is not water: the prompt says so before the mouthful rather than
  // after it, so "Drink" is never a trap on the coast.
  const drinkChoiceLabel = () =>
    Utils.isSaltWaterHere() ? T('Movement.drinkSaltWaterChoice') : T('Movement.drink');

  Scene_Map.prototype.showDiveOption = function (character) {
    const drinkLabel = drinkChoiceLabel();
    // Same "Use boat" entry the ordinary water menu offers: the ocean prompt is
    // what a player facing open sea actually gets, so the dinghy has to be
    // launchable from here too (see canUseBoatOn for when it shows).
    const canBoat = canUseBoatOn(character);
    const hasDivingSuit = $gameParty.hasItem($dataItems[DIVING_SUIT_ITEM_ID]);
    const choices = [];
    if (hasDivingSuit) choices.push(T('Movement.dive'));
    if (canBoat) choices.push(T('Movement.useBoat'));
    choices.push(drinkLabel, T('Movement.cancel'));
    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (canBoat && index === choices.indexOf(T('Movement.useBoat'))) {
        useBoatOn(character);
        return;
      }
      if (index === choices.indexOf(drinkLabel)) {
        MovementSystem.performDrinkWater(character);
        return;
      }
      if (hasDivingSuit && index === choices.indexOf(T('Movement.dive'))) {
        const interpreter = SceneManager._scene._interpreter || $gameMap._interpreter;
        if (interpreter && PluginManager.callCommand) {
          PluginManager.callCommand(interpreter, "WorldMapReturn", "goDown", {});
        }

        // Hide events on proc map (Ocean biome) except monsters - but only once
        // the descent has actually been accepted. goDown refuses on its own
        // terms (no diving suit, no lower layer), and hiding the square's events
        // before asking left the party standing on an emptied-looking map.
        if (!$gamePlayer.isTransferring()) {
          console.warn("MovementInteractionSystem: dive refused - WorldMapReturn goDown reserved no transfer.");
          return;
        }
        if (!window.SplitScreenManager || !window.SplitScreenManager.active) {
          $gameMap.events().forEach(event => {
            if (event && event.event()) {
              const isMonster = event.event().name === "Enemy";  // i18n-ignore  event name
              if (!isMonster) {
                event._originalTransparent = event.isTransparent();
                event.setTransparent(true);
              }
            }
          });
        }
      }
    });
  };

  Scene_Map.prototype.showResurfaceOption = function (character) {
    const choices = [T('Movement.resurface'), T('Movement.cancel')];
    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index === choices.indexOf(T('Movement.resurface'))) {
        MovementSystem.exitDiveMode(character);
        const interpreter = SceneManager._scene._interpreter || $gameMap._interpreter;
        if (interpreter && PluginManager.callCommand) {
          PluginManager.callCommand(interpreter, "WorldMapReturn", "goUp", {});
        }
      }
    });
  };

  Scene_Map.prototype.showNonProcDiveOption = function (character) {
    const choices = [T('Movement.dive'), T('Movement.cancel')];
    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index === choices.indexOf(T('Movement.dive'))) {
        // Store parallax
        character._originalParallaxName = $gameMap.parallaxName();
        character._originalParallaxLoopX = $gameMap._parallaxLoopX;
        character._originalParallaxLoopY = $gameMap._parallaxLoopY;
        character._originalParallaxSx = $gameMap._parallaxSx;
        character._originalParallaxSy = $gameMap._parallaxSy;
        
        // Hide parallax
        $gameMap.changeParallax("", false, false, 0, 0);
        
        // Hide all map events
        $gameMap.events().forEach(event => {
          if (event) {
            event._originalTransparent = event.isTransparent();
            event.setTransparent(true);
          }
        });

        // Cache water tiles before tileset switch
        $gameMap._underwaterWaterTiles = new Set();
        for (let x = 0; x < $gameMap.width(); x++) {
          for (let y = 0; y < $gameMap.height(); y++) {
            const isWater = Utils.isDiveWater(x, y);
            if (isWater) {
              $gameMap._underwaterWaterTiles.add(y * $gameMap.width() + x);
            }
          }
        }

        // Store original tileset
        character._originalTilesetId = $gameMap.tileset().id;
        
        // Switch tileset to 201
        $gameMap.changeTileset(201);

        // Hide non-water tiles using Fog of War
        if ($gameMap && $gameMap._fogOfWarData) {
          for (let x = 0; x < $gameMap.width(); x++) {
            for (let y = 0; y < $gameMap.height(); y++) {
              const width = $gameMap.width();
              const index = y * width + x;
              const isWater = $gameMap._underwaterWaterTiles.has(index);
              if (!isWater) {
                $gameMap.setFogOfWarState(x, y, 0); // 0 = Hidden
              }
            }
          }
          $gameMap._forceVisionUpdate = true;
          $gameMap.markAllChunksDirty();
        }

        character._isDiving = true;
        MovementSystem.teleportPartnerToDiver(character);

        // Store original step anime if not already stored
        if (character._originalStepAnime === undefined) {
          character._originalStepAnime = character.hasStepAnime();
        }

        // Force sprite change immediately
        window.DivingSprite.clear(character);
        window.DivingSprite.apply(character);

        $gameScreen.startFlash([0, 50, 100, 128], 30);
      }
    });
  };

  Scene_Map.prototype.showNonProcResurfaceOption = function (character) {
    const choices = [T('Movement.reemerge'), T('Movement.cancel')];
    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index === choices.indexOf(T('Movement.reemerge'))) {
        MovementSystem.exitDiveMode(character);
      }
    });
  };

  // Item that stows the inflatable dinghy (VehicleSystem VehicleConfig.BOAT.summonItemId).
  const BOAT_ITEM_ID = 167;

  // The water tile the character is facing: where "Use boat" drops the dinghy.
  function facedWaterTile(character) {
    const d = character.direction();
    return {
      x: $gameMap.roundXWithDirection(character.x, d),
      y: $gameMap.roundYWithDirection(character.y, d)
    };
  }

  // "Use boat" only shows for Player 1 on foot, while carrying item 167, and when
  // VehicleSystem considers the faced water tile navigable by the dinghy.
  // Someone already in the water is excluded: boarding pulls the dinghy under a
  // swimmer who is standing on the very tile it has to be dropped on.
  function canUseBoatOn(character) {
    if (character !== $gamePlayer) return false;
    if (character._isSwimming) return false;
    if (character.isInVehicle && character.isInVehicle()) return false;
    if (!$dataItems[BOAT_ITEM_ID] || !$gameParty.hasItem($dataItems[BOAT_ITEM_ID])) return false;
    const vs = window.MergedVehicleSystem;
    if (!vs || !vs.canDeployBoatAt) return false;
    const tile = facedWaterTile(character);
    return vs.canDeployBoatAt(tile.x, tile.y);
  }

  function useBoatOn(character) {
    const tile = facedWaterTile(character);
    window.MergedVehicleSystem.deployBoatAt(tile.x, tile.y, true);
  }

  // Riding something that floats (the dinghy or a ship), as opposed to looking
  // at the water from the bank. The airship is not a boat, it only flies over.
  function isAfloat(character) {
    if (!character.isInVehicle || !character.isInVehicle()) return false;
    const vehicle = character.vehicle();
    return !!vehicle && (vehicle.isBoat() || vehicle.isShip());
  }

  // Fishing over the side of a boat. Offered only when the hull faces open water
  // and the party carries a rod; facing anything else (a bank, an event, a
  // jetty) is left to the engine's own disembark handling on the same press.
  Scene_Map.prototype.showBoatFishingOption = function (character) {
    if (!isAfloat(character)) return false;
    if (!Utils.hasFishingRod()) return false;
    const tile = facedWaterTile(character);
    if (!Utils.isWaterTile(tile.x, tile.y)) return false;
    if (Utils.isBlockedWaterTile(tile.x, tile.y)) return false;
    if (Utils.hasEventOnTile(tile.x, tile.y)) return false;

    const choices = [T('Movement.fish'), T('Movement.cancel')];
    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index === choices.indexOf(T('Movement.fish'))) {
        MovementSystem.performFishing(character);
      }
    });
    return true;
  };

  Scene_Map.prototype.showSwimFishOptions = function (character) {
    const currentBiome = $gameSystem._procGenData ? $gameSystem._procGenData.currentBiome : null;
    const isMultiplayer = window.$gameSplitScreen && window.$gameSplitScreen.active;
    const canBoat = canUseBoatOn(character);

    if (currentBiome && currentBiome.toLowerCase().includes("ocean")) {
      // Allowed in 2P: diving warps both players to the seabed together.
      this.showDiveOption(character);
      return;
    }

    if (currentBiome && currentBiome.toLowerCase().includes("seabed")) {
      // Allowed in 2P: resurfacing warps both players back up together.
      this.showResurfaceOption(character);
      return;
    }

    if ($gameMap.mapId() === 315) {
      const choices = [];
      if (Utils.hasFishingRod()) choices.push(T('Movement.fish'));
      if (canBoat) choices.push(T('Movement.useBoat'));
      choices.push(T('Movement.cancel'));

      if (choices.length === 1) {
        window.skipLocalization = true;
        $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
        $gameMessage.add(T('Movement.cannotSwimHere'));
        window.skipLocalization = false;
        return;
      }

      $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
      $gameMessage.setChoices(choices, 0, choices.length - 1);
      $gameMessage.setChoiceCallback((index) => {
        if (index === choices.indexOf(T('Movement.fish')) && Utils.hasFishingRod()) {
          MovementSystem.performFishing(character);
        } else if (canBoat && index === choices.indexOf(T('Movement.useBoat'))) {
          useBoatOn(character);
        }
      });
      return;
    }

    // In split-screen, walking into water auto-starts swimming for both players
    // (see Game_Player.moveByInput override / Player 2 auto-swim entry), so the
    // redundant "Swim" menu option is dropped.
    const drinkLabel = drinkChoiceLabel();
    const choices = [];
    if (!isMultiplayer) choices.push(T('Movement.swim'));
    if (Utils.hasFishingRod()) choices.push(T('Movement.fish'));
    if ((!isMultiplayer || $gameMap.mapId() !== 636) && $gameParty.hasItem($dataItems[DIVING_SUIT_ITEM_ID])) choices.push(T('Movement.dive'));
    choices.push(drinkLabel);
    if (canBoat) choices.push(T('Movement.useBoat'));
    choices.push(T('Movement.cancel'));

    $gameMessage._eventActivator = (character === $gamePlayer) ? "p1" : "p2";
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback((index) => {
      if (index === choices.indexOf(T('Movement.swim'))) {
        MovementSystem.enterSwimMode(character);
        // FIX: Move forward into water to prevent immediate exit
        character.moveStraight(character.direction());
      } else if (index === choices.indexOf(drinkLabel)) {
        MovementSystem.performDrinkWater(character);
      } else if (index === choices.indexOf(T('Movement.fish')) && Utils.hasFishingRod()) {
        MovementSystem.performFishing(character);
      } else if (canBoat && index === choices.indexOf(T('Movement.useBoat'))) {
        useBoatOn(character);
      } else if (index === choices.indexOf(T('Movement.dive')) && $gameParty.hasItem($dataItems[DIVING_SUIT_ITEM_ID])) {
        MovementSystem.enterSwimMode(character);
        character.moveStraight(character.direction());
        
        if ($gameMap.mapId() !== 636) {
          if (window.SplitScreenManager && window.SplitScreenManager.active) {
            character._hideTiles = true;
          } else {
            character._originalTilesetId = $gameMap.tileset().id;
            
            // Store parallax
            character._originalParallaxName = $gameMap.parallaxName();
            character._originalParallaxLoopX = $gameMap._parallaxLoopX;
            character._originalParallaxLoopY = $gameMap._parallaxLoopY;
            character._originalParallaxSx = $gameMap._parallaxSx;
            character._originalParallaxSy = $gameMap._parallaxSy;
            
            // Hide parallax
            $gameMap.changeParallax("", false, false, 0, 0);
            
            // Hide all map events
            $gameMap.events().forEach(event => {
              if (event) {
                event._originalTransparent = event.isTransparent();
                event.setTransparent(true);
              }
            });

            // Cache the submerged tiles the same way the non-proc dive prompt
            // does, so Utils.isWaterTile keeps answering yes for the decks the
            // diver swims under while the mask is up.
            $gameMap._underwaterWaterTiles = new Set();
            for (let x = 0; x < $gameMap.width(); x++) {
              for (let y = 0; y < $gameMap.height(); y++) {
                if (Utils.isDiveWater(x, y)) {
                  $gameMap._underwaterWaterTiles.add(y * $gameMap.width() + x);
                }
              }
            }

            if ($gameMap && $gameMap._fogOfWarData) {
              for (let x = 0; x < $gameMap.width(); x++) {
                for (let y = 0; y < $gameMap.height(); y++) {
                  const isWater = $gameMap._underwaterWaterTiles.has(y * $gameMap.width() + x);
                  if (!isWater) {
                    $gameMap.setFogOfWarState(x, y, 0);
                  }
                }
              }
              $gameMap._forceVisionUpdate = true;
              $gameMap.markAllChunksDirty();
            }

            $gameMap.changeTileset(201);
          }
          character._isDiving = true;
          MovementSystem.teleportPartnerToDiver(character);
          $gameScreen.startFlash([0, 50, 100, 128], 30);
        } else {
          character._isDiving = true;
          MovementSystem.teleportPartnerToDiver(character);
          $gameScreen.startFlash([0, 50, 100, 128], 30);
        }
      }
    });
  };

  // Game_CharacterBase & Game_Map Passability
  // Precompute the numeric bridge event id list once per bridges object instead
  // of allocating Object.keys() + a closure on every passability check. Live
  // positions/erased state are still read per call so behavior is unchanged.
  let _bridgeIdsCacheSrc = null;
  let _bridgeIdsCache = null;
  const _hasBridgeAt = (tx, ty) => {
    const puzzleData = $gameSystem._puzzleData;
    if (!puzzleData || !puzzleData.bridges) return false;
    const bridges = puzzleData.bridges;
    if (_bridgeIdsCacheSrc !== bridges) {
      _bridgeIdsCache = Object.keys(bridges).map(Number);
      _bridgeIdsCacheSrc = bridges;
    }
    const ids = _bridgeIdsCache;
    for (let i = 0; i < ids.length; i++) {
      const ev = $gameMap.event(ids[i]);
      if (ev && ev.x === tx && ev.y === ty && !ev._erased) return true;
    }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Region 7: the keep-out region
  // ---------------------------------------------------------------------------
  // One region id says "this square is not part of the playable space": solid
  // mass a room was cut out of, the dead border of a treasure room, the inside
  // of a wall. Nothing may ever be put there - no prop, no chest, no NPC, no
  // staircase, no event of any kind - and indoors nothing may walk, fly or
  // phase across it either, a broomstick and an airship included.
  //
  // Every system asks window.RegionRules rather than testing the literal 7 for
  // itself, the same way NPCCreature owns the sentience boundary: the id is
  // written down once, here, next to the passability rules it belongs to.
  const NO_GO_REGION = 7;

  // Interiors and the procedural map are where region 7 seals movement. A
  // roofed structure has a wall with an inside, and walking into it reads as
  // a hole in the building; out in the open a painted square is scenery, so
  // outdoor maps keep their passability and only lose their spawns.
  // Answered once per loaded map rather than per tile: this is asked from
  // inside canPass, which every character runs on every step.
  function isSealedRegionMap(map) {
    const gameMap = map || (typeof $gameMap !== "undefined" ? $gameMap : null);
    if (!gameMap || !gameMap.mapId || !gameMap.mapId()) return false;
    if (gameMap._misRegionSealMap === gameMap.mapId()) return gameMap._misRegionSeal;
    let sealed = gameMap.mapId() === 636;
    if (!sealed && typeof window.isProceduralInteriorMap === "function") {
      sealed = !!window.isProceduralInteriorMap();
    }
    if (!sealed) {
      const note = (typeof $dataMap !== "undefined" && $dataMap && $dataMap.note) || "";
      sealed = /<Interior>/i.test(note) || /<Covered>/i.test(note);  // i18n-ignore  map note-tag
    }
    gameMap._misRegionSealMap = gameMap.mapId();
    gameMap._misRegionSeal = sealed;
    return sealed;
  }

  const RegionRules = {
    NO_GO_REGION,

    // Movement. True only where the region seals: see isSealedRegionMap.
    blocksMovement(x, y, map) {
      const gameMap = map || (typeof $gameMap !== "undefined" ? $gameMap : null);
      if (!gameMap || gameMap.regionId(x, y) !== NO_GO_REGION) return false;
      return isSealedRegionMap(gameMap);
    },

    // Placement. True on every map, indoors and out: a square painted
    // keep-out is never dealt a spawn, whatever else stands on it.
    blocksSpawn(x, y, map) {
      const gameMap = map || (typeof $gameMap !== "undefined" ? $gameMap : null);
      if (!gameMap || typeof gameMap.regionId !== "function") return false;
      return gameMap.regionId(x, y) === NO_GO_REGION;
    },

    // The same question asked of a raw $dataMap-shaped object, for the
    // generators and the world-seeded layout passes that run with no live
    // $gameMap to read. Layer 5 is the region plane.
    blocksSpawnInData(mapData, x, y) {
      if (!mapData || !mapData.data || !mapData.width || !mapData.height) return false;
      const w = mapData.width, h = mapData.height;
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      return mapData.data[5 * w * h + y * w + x] === NO_GO_REGION;
    },
  };
  window.RegionRules = RegionRules;

  const _Game_CharacterBase_canPass = Game_CharacterBase.prototype.canPass;
  Game_CharacterBase.prototype.canPass = function (x, y, d) {
    // Region ID 11 directional passability:
    // Cannot ENTER region 11 unless moving North (d === 8)
    // Cannot LEAVE region 11 unless moving South (d === 2)
    // This creates cliff-like behavior where the upper level (region 11)
    // is only accessible from below via north movement and only leavable via south movement.
    // Bridge events override this restriction in both directions.
    const x2 = $gameMap.roundXWithDirection(x, d);
    const y2 = $gameMap.roundYWithDirection(y, d);
    // The keep-out region is checked before anything else, because it has to
    // beat the checks that skip passability altogether: through, debug-through
    // and every flying mode, which is how a broomstick used to cross a wall
    // into the dead space behind it.
    if (RegionRules.blocksMovement(x2, y2)) return false;
    const currentRegion = $gameMap.regionId(x, y);
    const destRegion = $gameMap.regionId(x2, y2);

    // Region 5 <-> Region 11: the bridge-access step and the cliff tile it
    // serves are mutually and unconditionally passable in either direction,
    // whatever the facing. Neither tile's own tileset passability is
    // consulted (only map bounds and character collision) - checked first so
    // it always wins over the general region-5 rule below and the region-11
    // directional cliff rule further down, both of which would otherwise gate
    // this pairing by facing or by the raw (often intentionally blocked) tile.
    if ((currentRegion === 5 && destRegion === 11) || (currentRegion === 11 && destRegion === 5)) {
      if (!$gameMap.isValid(x2, y2)) return false;
      if (this.isThrough() || this.isDebugThrough()) return true;
      return !this.isCollidedWithCharacters(x2, y2);
    }

    // Region 11 <-> Region 12: the cliff tile and the bridge deck it joins
    // are likewise mutually and unconditionally passable in either
    // direction, whatever the facing, with neither tile's own tileset
    // passability consulted - the bridge branch further down still gates a
    // bridge-deck walker's OTHER exits (onto arbitrary terrain), but never
    // this pairing.
    if ((currentRegion === 11 && destRegion === 12) || (currentRegion === 12 && destRegion === 11)) {
      if (!$gameMap.isValid(x2, y2)) return false;
      if (this.isThrough() || this.isDebugThrough()) return true;
      return !this.isCollidedWithCharacters(x2, y2);
    }

    // Region 5 is always-passable terrain (bridge-access step / guaranteed path).
    // Leaving it bypasses destination tile passability only toward another
    // marked region of the path network (11 cliff, 12 bridge deck, 5 itself,
    // 99 water, 13 house spawn) - never region 10 (blocked) and never a plain,
    // unmarked tile (region 0), whose own tileset passability still applies so
    // region 5 cannot be used to walk into an unpassable wall with no region.
    if (currentRegion === 5 && destRegion !== 10 && destRegion !== 0) {
      if (!$gameMap.isValid(x2, y2)) return false;
      if (this.isThrough() || this.isDebugThrough()) return true;
      return !this.isCollidedWithCharacters(x2, y2);
    }

    // Entering region 5 is exempt from the region-11 cliff directional
    // restriction, so the step can be taken from any direction (still blocked
    // only by events and by the tile's own passability).
    if (destRegion === 5) {
      const prevChecking = window._currentlyCheckingCharacter;
      window._currentlyCheckingCharacter = this;
      const result = _Game_CharacterBase_canPass.call(this, x, y, d);
      window._currentlyCheckingCharacter = prevChecking;
      return result;
    }

    // Bridge decks (region 12) are walk-on approaches to/from the cliff
    // (region 11), so transitions between region 11 and a bridge tile are
    // exempt from the cliff directional restriction (same spirit as region 5).
    // Without this, a bridge that joins the cliff horizontally is unwalkable,
    // since leaving region 11 is otherwise only allowed heading south.
    if (destRegion === 12 || currentRegion === 12) {
      // While standing ON the bridge deck (on top), the walker may only step
      // onto a bridge-access tile (region 11 or 5) or continue along the deck
      // (region 12) - never walk straight off it onto arbitrary terrain. This
      // holds however the deck was reached, a step or a map transfer included.
      // Passing UNDER the bridge (_onBridge false) is unrestricted so the ground
      // path beneath it stays walkable.
      if (currentRegion === 12 && this === $gamePlayer && this._onBridge &&
          !this._isSwimming &&
          destRegion !== 12 && destRegion !== 11 && destRegion !== 5) {
        return false;
      }
      const prevChecking = window._currentlyCheckingCharacter;
      window._currentlyCheckingCharacter = this;
      const result = _Game_CharacterBase_canPass.call(this, x, y, d);
      window._currentlyCheckingCharacter = prevChecking;
      return result;
    }

    // Cliff (region 11) directional rule, against ordinary ground (region 0)
    // only: region 0 -> region 11 is possible heading North, region 11 -> region
    // 0 heading South. Every other neighbouring region (the bridge-access and
    // bridge regions above, water, blocked tiles) is left to its own rule.
    if (currentRegion === 0 && destRegion === 11 && d !== 8 && !_hasBridgeAt(x2, y2)) return false;
    if (currentRegion === 11 && destRegion === 0 && d !== 2 && !_hasBridgeAt(x, y)) return false;

    const prevChecking = window._currentlyCheckingCharacter;
    window._currentlyCheckingCharacter = this;
    const result = _Game_CharacterBase_canPass.call(this, x, y, d);
    window._currentlyCheckingCharacter = prevChecking;
    return result;
  };

  const _Game_Map_isPassable = Game_Map.prototype.isPassable;
  Game_Map.prototype.isPassable = function (x, y, d) {
    const character = window._currentlyCheckingCharacter;
    // Fast path: maps with no special-passability tiles and no diving character
    // never hit any of the special branches below.
    if (this._misHasSpecialPassability === false && !(character && character._isDiving)) {
      return _Game_Map_isPassable.call(this, x, y, d);
    }
    const regionId = this.regionId(x, y);
    const terrainTag = this.terrainTag(x, y);
    const charIsSwimming = character ? character._isSwimming : false;
    const charIsClimbing = character ? character._isClimbing : false;
    const charIsWaterEnemy = character instanceof Game_Event &&
      ((character.isAquaticEnemy && character.isAquaticEnemy()) ||
       (character.isAmphibiousEnemy && character.isAmphibiousEnemy()));

    if (regionId === 10) return false;
    if (regionId === NO_GO_REGION && isSealedRegionMap(this)) return false;

    let isDivingWater = false;
    if (character && character._isDiving) {
      window._currentlyCheckingCharacter = null;
      isDivingWater = Utils.isWaterTile(x, y);
      window._currentlyCheckingCharacter = character;
    }

    if (isDivingWater) {
      return true;
    }

    // Bridge deck (region 12) laid over water: the deck tile masks the water it
    // was painted on, so the tile stops reading as region 99 and the water rule
    // above never fires for it. A swimmer (or a water enemy) passing UNDER the
    // span still gets that rule, which is what keeps a river from being dammed
    // at every bridge it carries. On foot, on the deck or beneath it, the deck
    // tile's own passability decides, exactly as the map author painted it.
    if (regionId === 12 && (charIsSwimming || charIsWaterEnemy)) return true;

    // On foot the deck is always-passable terrain, exactly like the region 5
    // step that leads onto it: the tile it is painted over (river water, a
    // terrain-tag-3 procedural water tile) is impassable, so consulting the
    // painted passability would leave a span nobody can walk across.
    if (regionId === 12 || regionId === 5 || regionId === 13) return true;
    if (regionId === 4 && (charIsClimbing || this.isLadder(x, y))) return true;
    if (regionId === 99) return charIsSwimming || charIsWaterEnemy;
    if (terrainTag === 4) {
      if (charIsClimbing || this.isLadder(x, y)) {
        return !Utils.hasPriorityTile(x, y);
      }
      return false;
    }
    if (terrainTag === 7) return charIsClimbing;

    // Procedural map (636) water: terrain-tag-3 tiles that are impassable
    // normally behave like region-99 water (only passable while swimming or for
    // water enemies). Shallow, normally-passable water stays walkable.
    if (terrainTag === 3 && this.mapId() === 636) {
      const baseResult = _Game_Map_isPassable.call(this, x, y, d);
      if (!baseResult) return charIsSwimming || charIsWaterEnemy;
      return baseResult;
    }

    if (character instanceof Game_Event && character.isAquaticEnemy && character.isAquaticEnemy() &&
        !(character.isAmphibiousEnemy && character.isAmphibiousEnemy())) {
      return false;
    }

    return _Game_Map_isPassable.call(this, x, y, d);
  };

  const _Game_Map_checkPassage = Game_Map.prototype.checkPassage;
  Game_Map.prototype.checkPassage = function (x, y, bit) {
    const character = window._currentlyCheckingCharacter;
    // Fast path: maps with no special-passability tiles and no diving character
    // never hit any of the special branches below.
    if (this._misHasSpecialPassability === false && !(character && character._isDiving)) {
      return _Game_Map_checkPassage.call(this, x, y, bit);
    }
    const regionId = this.regionId(x, y);
    const terrainTag = this.terrainTag(x, y);
    const charIsSwimming = character ? character._isSwimming : false;
    const charIsClimbing = character ? character._isClimbing : false;
    const charIsWaterEnemy = character instanceof Game_Event &&
      ((character.isAquaticEnemy && character.isAquaticEnemy()) ||
       (character.isAmphibiousEnemy && character.isAmphibiousEnemy()));

    let isDivingWater = false;
    if (character && character._isDiving) {
      window._currentlyCheckingCharacter = null;
      isDivingWater = Utils.isWaterTile(x, y);
      window._currentlyCheckingCharacter = character;
    }

    if (isDivingWater) {
      return 0;
    }

    // The keep-out region. These branches answer with the BLOCKED bits, the
    // way the region rules below them do: 0 is "nothing in the way", `bit` is
    // "all of it is".
    if (regionId === NO_GO_REGION && isSealedRegionMap(this)) return bit;

    // Bridge deck over water, see Game_Map.isPassable above.
    if (regionId === 12 && (charIsSwimming || charIsWaterEnemy)) return 0;

    // The deck is walkable whatever it is painted over, see isPassable above.
    if (regionId === 12 || regionId === 5) return 0;
    if (regionId === 4 || regionId === 10) {
      if (regionId === 4 && (charIsClimbing || this.isLadder(x, y))) return 0;
      return bit;
    }
    if (regionId === 99) return (charIsSwimming || charIsWaterEnemy) ? 0 : bit;
    if (terrainTag === 4) {
      if ((charIsClimbing || this.isLadder(x, y)) && !Utils.hasPriorityTile(x, y)) return 0;
      return bit;
    }
    if (terrainTag === 7) return charIsClimbing ? 0 : bit;

    // Procedural map (636) water: terrain-tag-3 tiles that are blocked normally
    // open up only while swimming (or for water enemies); shallow passable water
    // is left untouched.
    if (terrainTag === 3 && this.mapId() === 636) {
      const baseBit = _Game_Map_checkPassage.call(this, x, y, bit);
      if (baseBit !== 0) return (charIsSwimming || charIsWaterEnemy) ? 0 : baseBit;
      return baseBit;
    }

    if (character instanceof Game_Event && character.isAquaticEnemy && character.isAquaticEnemy() &&
        !(character.isAmphibiousEnemy && character.isAmphibiousEnemy())) {
      return bit;
    }

    return _Game_Map_checkPassage.call(this, x, y, bit);
  };

  // State maintenance on load/transfer
  const _Game_Player_refresh = Game_Player.prototype.refresh;
  Game_Player.prototype.refresh = function () {
    _Game_Player_refresh.call(this);
    if (this._isSwimming) {
      // Keep original graphic and visibility
    } else if (this._isClimbing) {
      if (Utils.isClimbableAndAccessible(this.x, this.y) || Utils.isRoofTile(this.x, this.y)) {
        this.setDirection(8);
        MovementSystem.setCompanionsVisibility(false);
      } else {
        MovementSystem.exitClimbMode(this);
      }
    }
  };

  const _Game_Player_makeEmpty = Game_Player.prototype.makeEmpty;
  Game_Player.prototype.makeEmpty = function () {
    _Game_Player_makeEmpty.call(this);
    this._isSwimming = false;
    this._isClimbing = false;
    this._isSitting = false;
    MovementSystem.releaseFollowers(this);
  };

  const _Scene_Boot_start = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function () {
    _Scene_Boot_start.call(this);
    companionsVisible = true;
    lastSwimSoundFrame = 0;
    for (const key of Object.keys(swimSplashFrames)) delete swimSplashFrames[key];
    lastClimbSoundFrame = 0;

    if ($gamePlayer) {
      $gamePlayer._isSwimming = false;
      $gamePlayer._isClimbing = false;
      $gamePlayer._isSitting = false;
      $gamePlayer._pendingFallDamageRate = 0;
    }
  };

  const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
  Spriteset_Map.prototype.createCharacters = function () {
    _Spriteset_Map_createCharacters.call(this);
    ReflectionSystem.initialize();
    MirrorSystem.initialize();
  };

  // Compute per-map fast-path flags once on setup: whether the map contains any
  // reflective water and whether it has any special-passability regions/terrain.
  const _Game_Map_setup_MIS = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    _Game_Map_setup_MIS.call(this, mapId);
    ReflectionSystem.invalidateWaterScan();
    MirrorSystem.invalidate();
    // The submerged-deck flood belongs to the map that was scanned, never to
    // the next one loaded into the same $gameMap.
    this._misSubmergedDeck = null;
    // The keep-out region seals interiors and the procedural map only, and
    // which of the two this is belongs to the map that was just loaded.
    this._misRegionSealMap = 0;
    this._misScanSpecialPassability();
  };

  // Special-passability tiles are regions 4,5,7,10,12,13,99, terrain tags 4,7,
  // and (on map 636) terrain tag 3. If a map has none, the
  // isPassable/checkPassage overrides can defer straight to the originals.
  Game_Map.prototype._misScanSpecialPassability = function () {
    let special = false;
    if ($dataMap) {
      const w = this.width();
      const h = this.height();
      const is636 = this.mapId() === 636;
      for (let y = 0; y < h && !special; y++) {
        for (let x = 0; x < w; x++) {
          const r = this.regionId(x, y);
          if (r === 4 || r === 5 || r === NO_GO_REGION || r === 10 || r === 12 || r === 13 || r === 99) { special = true; break; }
          const t = this.terrainTag(x, y);
          if (t === 4 || t === 7 || (is636 && t === 3)) { special = true; break; }
        }
      }
    }
    this._misHasSpecialPassability = special;
  };

  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    ReflectionSystem.cleanup();
    MirrorSystem.cleanup();
    _Scene_Map_terminate.call(this);
  };

  const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
  Game_Player.prototype.performTransfer = function () {
    const wasClimbing = this._isClimbing;

    ReflectionSystem.cleanup();
    MirrorSystem.cleanup();
    _Game_Player_performTransfer.call(this);

    // Queue swim/climb rearm to run on the next player update after the transfer
    // completes, instead of wall-clock setTimeout deferrals.
    this._pendingSwimClimbRearm = null;

    if ($gameSystem._procGenData && $gameSystem._procGenData.currentBiome === "SeaBed") {
      this._pendingSwimClimbRearm = ["spawnRegion", "seabed"];
      return;
    }

    // Landing in water is the same everywhere - a procedural square, a hand-made
    // map, an event teleport - and does not depend on whether the party was
    // already swimming: if the tile they arrive on is water they cannot stand on
    // (region 99, or the Water terrain tag on the procedural map), they swim.
    // The decision is deferred to applyTransferRearm because the arrival tile is
    // not final yet; Scene_Map.onMapLoaded can still relocate the party.
    const rearm = ["spawnRegion", "swimIfWater"];

    if (wasClimbing) {
      if (Utils.isClimbableAndAccessible(this.x, this.y)) {
        rearm.push("climb");
      } else {
        MovementSystem.exitClimbMode(this);
      }
    }

    this._pendingSwimClimbRearm = rearm;
  };

  // Global proc-diving state (Ocean biome in the procedural stack) recomputed at
  // most once per frame and shared by updateFrame/updateVisibility instead of
  // each sprite rescanning biomeLayerStack every frame.
  let _procDivingFrame = -1;
  let _procDivingCached = false;
  const _isProcDivingGlobal = () => {
    if (_procDivingFrame !== Graphics.frameCount) {
      _procDivingFrame = Graphics.frameCount;
      const procGenData = $gameSystem._procGenData;
      _procDivingCached = !!(procGenData &&
        procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0 &&
        (procGenData.currentBiome === "Ocean" || procGenData.biomeLayerStack.includes("Ocean")));  // i18n-ignore  biome id
    }
    return _procDivingCached;
  };

  // Sprite crop for swimming
  const _Sprite_Character_updateFrame = Sprite_Character.prototype.updateFrame;
  Sprite_Character.prototype.updateFrame = function() {
    _Sprite_Character_updateFrame.call(this);
    if (this._character) {
      let isSwimming = this._character._isSwimming || 
                        (this._character === $gamePlayer && $gamePlayer._isSwimming) ||
                        (this._character instanceof Game_Follower && $gamePlayer._isSwimming);
      
      if (!isSwimming && this._character instanceof Game_Event && Utils.isWaterTile(this._character.x, this._character.y) && !this._character.isJumping()) {
          const isEnemy = this._character.event() && (
              this._character.event().name === "Enemy" ||  // i18n-ignore  event name
              (this._character.isAquaticEnemy && this._character.isAquaticEnemy()) ||
              (this._character.isAmphibiousEnemy && this._character.isAmphibiousEnemy())
          );
          if (isEnemy) {
              isSwimming = true;
          }
      }
      
      const isProcDiving = _isProcDivingGlobal();

      const isDiving = this._character._isDiving ||
                        (this._character === $gamePlayer && ($gamePlayer._isDiving || isProcDiving)) ||
                        (this._character instanceof Game_Follower && ($gamePlayer._isDiving || isProcDiving));
      
      const isGlobalDiving = $gamePlayer._isDiving || isProcDiving;

      if (isGlobalDiving && this._character instanceof Game_Event) {
          isSwimming = false;
      }

      if (isSwimming && !isDiving) {
        const frame = this._frame;
        if (frame.width > 0 && frame.height > 0) {
          if (this._character instanceof Game_Event) {
            this.setFrame(frame.x, frame.y, frame.width, Math.floor(frame.height * 0.75));
          } else {
            this.setFrame(frame.x, frame.y, frame.width, frame.height / 2);
          }
        }
      }
    }
  };

  const _Sprite_Character_updateVisibility = Sprite_Character.prototype.updateVisibility;
  Sprite_Character.prototype.updateVisibility = function() {
      _Sprite_Character_updateVisibility.call(this);

      // Layered bridges (region 12): a character passing UNDER the deck must be
      // hidden by it. The map's deck tiles are painted on the lower tile layer
      // (not "above character" ☆ tiles), so screenZ alone cannot occlude the
      // sprite - hide it directly while underneath. The party rides the player's
      // on/under state, matching the screenZ hooks above.
      if (this.visible && this._character && $gamePlayer && !$gamePlayer._onBridge) {
          const c = this._character;
          if ((c === $gamePlayer || c instanceof Game_Follower) &&
              Utils.isBridgeTile(c.x, c.y)) {
              this.visible = false;
          }
      }

      if (this.visible && this._character instanceof Game_Event) {
          const isGlobalDiving = $gamePlayer._isDiving || _isProcDivingGlobal();
          
          if (isGlobalDiving) {
              if (!Utils.isWaterTile(this._character.x, this._character.y)) {
                  this.visible = false;
              }
          }
      }
  };

  //=========================================================================
  // Sprint stamina
  //=========================================================================
  // AP is not only a battle resource any more: running on the map comes out of
  // the same meter the skills do, and standing about puts it back. A full meter
  // is about twenty seconds of running: long enough to cross a clearing or
  // outpace something, short enough that a sprint held down the length of a map
  // is paid for, and the pause afterwards is a real one.
  //
  // The leader is never stopped from running: the drain is a cost, not a gate,
  // and a party stranded at walking pace mid-chase would be a worse game. The
  // rest of the party runs when the leader does, since they walk the column
  // behind them (Core/AutoIdleExplorer.js), so the meter costs them the same.
  const SPRINT_DRAIN_PER_SEC = 5.0;  // running, per member doing the running
  const SPRINT_WALK_REGEN = 1.5;     // on the move at walking pace
  const SPRINT_IDLE_REGEN = 4.0;     // standing still, which is a rest

  const perFrame = (perSecond) => perSecond / 60;

  // Written straight onto the meter rather than through setTp, which runs a
  // full Game_Actor.refresh (equipment sweep, state clamp) on every call: this
  // one ticks sixty times a second for every member, and AP moves nothing that
  // a refresh would have to notice.
  function addAp(actor, amount) {
    if (!actor || !amount) return;
    const max = actor.maxTp ? actor.maxTp() : 100;
    actor._tp = Math.max(0, Math.min(max, actor.tp + amount));
  }

  window.SprintStamina = {
    // Is there anything left to run on? Asked of a member about to break into
    // a run of their own; the leader never asks.
    canSprint(actor) {
      // Stamina is the only thing a run is charged against: an injury slows
      // nobody down, so a limp still runs for as long as there is AP for it.
      if (!actor || !(actor.tp > 0)) return false;
      return true;
    },

    // One frame of running, charged to whoever is doing it.
    spend(actor) {
      addAp(actor, -perFrame(SPRINT_DRAIN_PER_SEC));
    },

    // One frame of the party going about the map. The leader pays for their own
    // sprint; everybody who is not running gets a little of it back, faster
    // while the party is standing still than while it is walking.
    tick() {
      if (!$gameParty || !$gamePlayer) return;
      const members = $gameParty.members();
      if (members.length === 0) return;
      const leader = members[0];
      const moving = $gamePlayer.isMoving();
      const leaderSprinting = moving && $gamePlayer.isDashing();
      const regen = perFrame(moving ? SPRINT_WALK_REGEN : SPRINT_IDLE_REGEN);
      for (const actor of members) {
        const running = actor._sprintRunningThisFrame ||
          (actor === leader && leaderSprinting);
        if (running) this.spend(actor);
        else addAp(actor, regen);
        actor._sprintRunningThisFrame = false;
      }
    },

    // A follower running under their own steam says so, so the tick charges
    // them for it instead of handing them their rest back.
    noteRunning(actor) {
      if (actor) actor._sprintRunningThisFrame = true;
    }
  };

  const _Scene_Map_update_sprintStamina = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_sprintStamina.call(this);
    window.SprintStamina.tick();
  };

  // Walking onto a damage floor tile (or taking step-based state damage while
  // on the map) still runs the default engine's full-screen red flash. Damage
  // itself is untouched; only the flash is silenced, and only outside battle,
  // which is the only case this ever ran in to begin with.
  Game_Actor.prototype.performMapDamage = function() {};

  // Export
  window.MovementSystem = {
    isWaterTile: Utils.isWaterTile.bind(Utils),
    isClimbableAndAccessible: Utils.isClimbableAndAccessible.bind(Utils),
    canClimbInDirection: Utils.canClimbInDirection.bind(Utils),
    enterSwimMode: MovementSystem.enterSwimMode.bind(MovementSystem),
    exitSwimMode: MovementSystem.exitSwimMode.bind(MovementSystem),
    enterClimbMode: MovementSystem.enterClimbMode.bind(MovementSystem),
    exitClimbMode: MovementSystem.exitClimbMode.bind(MovementSystem),
    performFishing: MovementSystem.performFishing.bind(MovementSystem),
    swimTileBudget: MovementSystem.swimTileBudget.bind(MovementSystem),
    swimTilesLeft: MovementSystem.swimTilesLeft.bind(MovementSystem),
    spendSwimStroke: MovementSystem.spendSwimStroke.bind(MovementSystem),
    resetSwimStamina: MovementSystem.resetSwimStamina.bind(MovementSystem),
    hasFishingRod: Utils.hasFishingRod.bind(Utils),
    fishingRodItemIds: Config.fishingRodItemIds,
    fishingRodWeaponIds: Config.fishingRodWeaponIds,
    fishingItems: Config.fishingItems,
    fishingEncounterTroopIds: Config.fishingEncounterTroopIds,
    fishingBattleCommonEventId: Config.fishingBattleCommonEventId
  };
})();