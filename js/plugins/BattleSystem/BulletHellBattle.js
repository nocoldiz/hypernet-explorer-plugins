// Uncomment for debugging enemy hitbox
/*
updateHitboxVisualizer() {
if (!this._hitboxVisualizer) {
    this._hitboxVisualizer = new PIXI.Graphics();
    this.addChild(this._hitboxVisualizer);
}

this._hitboxVisualizer.clear();
this._hitboxVisualizer.lineStyle(1, 0xFF0000);
this._hitboxVisualizer.drawRect(
    this._enemyHitbox.x - this._enemyHitbox.width/2,
    this._enemyHitbox.y - this._enemyHitbox.height/2,
    this._enemyHitbox.width,
    this._enemyHitbox.height
);
}
*//*:
* @target MZ
* @plugindesc Creates a bullet hell mini-game during battle
* @author Omni-Lex
* @url https://nocoldiz.itch.io/hypernet-explorer
*
* @help BulletHellBattle.js
*
* This plugin creates a Touhou/Undertale-style bullet hell sequence
* during battle. The player controls a spaceship to avoid enemy attacks
* and shoot back.
*
* Use plugin commands to start the bullet hell sequence during battle events.
*
* @param defaultSpeedMultiplier
* @text Default Speed Multiplier
* @type number
* @decimals 1
* @min 0.1
* @max 2.0
* @default 0.7
* @desc Global speed multiplier for player, enemy and bullets (lower = slower)
*
* @param playerSpeedMultiplier
* @text Player Speed Multiplier
* @type number
* @decimals 1
* @min 0.1
* @max 2.0
* @default 0.8
* @desc Player movement speed multiplier (lower = slower)
*
* @param enemySpeedMultiplier
* @text Enemy Speed Multiplier
* @type number
* @decimals 1
* @min 0.1
* @max 2.0
* @default 0.6
* @desc Enemy movement speed multiplier (lower = slower)
*
* @param bulletSpeedMultiplier
* @text Bullet Speed Multiplier
* @type number
* @decimals 1
* @min 0.1
* @max 2.0
* @default 0.7
* @desc Bullet speed multiplier (lower = slower)
*
* @param useLuckForDamage
* @text Use Luck for Damage
* @type boolean
* @default true
* @desc If true, player's luck will influence damage dealt (luck/10 per hit)
*
* @param useLuckForDifficulty
* @text Use Luck for Difficulty
* @type boolean
* @default true
* @desc If true, enemy's luck will influence bullet patterns and speed
*
* @command startBulletHell
* @text Start Bullet Hell
* @desc Starts a bullet hell sequence in battle
*
* @arg duration
* @text Duration (frames)
* @type number
* @min 1
* @default 300
* @desc Duration of the bullet hell sequence in frames (60 frames = 1 second)
*
* @arg playerImage
* @text Player Ship Image
* @type file
* @dir img/pictures/
* @desc Image to use for the player's spaceship
*
* @arg playerSpeed
* @text Player Ship Speed
* @type number
* @min 1
* @default 5
* @desc Base speed of the player's spaceship
*
* @arg bulletDamage
* @text Player Bullet Damage
* @type number
* @min 1
* @default 10
* @desc Base damage dealt by player bullets
*
* @arg enemyBulletDamage
* @text Enemy Bullet Damage
* @type number
* @min 1
* @default 5
* @desc Damage dealt by enemy bullets
* 
* @arg playerHitSE
* @text Player Hit Sound
* @type file
* @dir audio/se/
* @desc Sound effect when player is hit
* 
* @arg enemyHitSE
* @text Enemy Hit Sound
* @type file
* @dir audio/se/
* @desc Sound effect when enemy is hit
* 
* @arg enemyHitSE2
* @text Enemy Hit Sound 2
* @type file
* @dir audio/se/
* @desc Alternative sound effect when enemy is hit
* 
* @arg enemyHitSE3
* @text Enemy Hit Sound 3
* @type file
* @dir audio/se/
* @desc Alternative sound effect when enemy is hit
* 
* @arg bulletCollisionSE
* @text Bullet Collision Sound
* @type file
* @dir audio/se/
* @desc Sound effect when player's laser hits an enemy bullet
*/
(()=>{"use strict";

// Get plugin parameters
const pluginName = "BulletHellBattle";
const parameters = PluginManager.parameters(pluginName);
const defaultSpeedMultiplier = Number(parameters.defaultSpeedMultiplier || 0.7);
const playerSpeedMultiplier = Number(parameters.playerSpeedMultiplier || 0.8);
const enemySpeedMultiplier = Number(parameters.enemySpeedMultiplier || 0.6);
const bulletSpeedMultiplier = Number(parameters.bulletSpeedMultiplier || 0.7);
const useLuckForDamage = parameters.useLuckForDamage !== "false";
const useLuckForDifficulty = parameters.useLuckForDifficulty !== "false";

PluginManager.registerCommand(pluginName, "startBulletHell", (args) => {
if ($gameParty.inBattle()) {
    const duration = Number(args.duration) || 300;
    const playerImage = String(args.playerImage) || "";
    const playerSpeed = Number(args.playerSpeed) || 5;
    const bulletDamage = Number(args.bulletDamage) || 10;
    const enemyBulletDamage = Number(args.enemyBulletDamage) || 5;
    const playerHitSE = String(args.playerHitSE) || "";
    const enemyHitSE = String(args.enemyHitSE) || "";
    const enemyHitSE2 = String(args.enemyHitSE2) || "";
    const enemyHitSE3 = String(args.enemyHitSE3) || "";
    const bulletCollisionSE = String(args.bulletCollisionSE) || "";

    $gameTemp.bulletHellParams = {
        duration: duration,
        playerImage: playerImage,
        playerSpeed: playerSpeed,
        bulletDamage: bulletDamage,
        enemyBulletDamage: enemyBulletDamage,
        playerHitSE: playerHitSE,
        enemyHitSE: enemyHitSE,
        enemyHitSE2: enemyHitSE2,
        enemyHitSE3: enemyHitSE3,
        bulletCollisionSE: bulletCollisionSE
    };
    
    BattleManager.startBulletHell();
}
});

// How long the score stays on screen after the last bullet, in frames.
const OUTRO_FRAMES = 60;
// While the sequence is this young we keep looking for a better picture of the
// enemy, because a 3D model reaches the scene asynchronously.
const AVATAR_RESOLVE_FRAMES = 120;
// The enemy is drawn at a readable size in the field whatever it measures on
// the battlefield, so a boss and a walking sprite are dodged the same way.
const AVATAR_TARGET_HEIGHT = 150;
const AVATAR_MAX_WIDTH = 260;
const AVATAR_MODEL_PAD = 0.08;

BattleManager.startBulletHell = function() {
const scene = SceneManager._scene;
// Nothing to duel: opening the field on a corpse ended the sequence on its
// first frame and left the battle paused behind it.
if (!scene || !scene.startBulletHell || !scene.bulletHellTargetSprite ||
    !scene.bulletHellTargetSprite()) {
    return;
}
this._bulletHellMode = true;
this._bulletHellEnding = false;
this._savedInputting = this._inputting;
this._savedPhase = this._phase;
this._inputting = false;
this._phase = "bullet-hell";
scene.startBulletHell();
};

// The sequence is winding down: the score goes up, the battle stays paused.
// The fight only resumes in finishBulletHell, once the outro has played, so
// there is no longer a stretch where turns run on behind a live bullet field
// and open a command window nobody restored the visibility of.
BattleManager.endBulletHell = function() {
if (!this._bulletHellMode || this._bulletHellEnding) return;
this._bulletHellEnding = true;

const layer = SceneManager._scene && SceneManager._scene._bulletHellLayer;
if (layer && layer._damageCounter) {
    layer._damageCounter.visible = true;
}
if (layer && layer._totalDamageDealt > 0) {
    safeBattleLog(T('Battle.bulletHellDamage', { amount: layer._totalDamageDealt }));
}
};

// Hands the battle back. Called by the layer's own countdown, and again from
// Scene_Battle#terminate as a backstop, so the paused phase can never outlive
// the sequence that paused it.
BattleManager.finishBulletHell = function() {
if (!this._bulletHellMode) return;
this._bulletHellMode = false;
this._bulletHellEnding = false;
this._inputting = this._savedInputting;
this._phase = this._savedPhase;

// The shoot button is very likely still held down as the field closes, and
// the command window that comes back up would read it as a confirmation.
Input.clear();

const scene = SceneManager._scene;
if (scene && scene.endBulletHell) scene.endBulletHell();
};

const _BattleManager_update = BattleManager.update;
BattleManager.update = function(active) {
if (this._bulletHellMode) {
    this.updateBulletHellSequence();
} else {
    _BattleManager_update.call(this, active);
}
};

// The countdown lives on the layer, which Scene_Battle ticks every frame even
// while a message window holds the battle process. Timing it here meant a popup
// mid-sequence froze the clock and the bullet field never ended.
BattleManager.updateBulletHellSequence = function() {
};

const _BattleManager_setup_BH = BattleManager.setup;
BattleManager.setup = function(troopId, canEscape, canLose) {
// A fight abandoned mid-duel must not hand its paused phase to the next one.
this._bulletHellMode = false;
this._bulletHellEnding = false;
_BattleManager_setup_BH.call(this, troopId, canEscape, canLose);
};

const _Scene_Battle_initialize = Scene_Battle.prototype.initialize;
Scene_Battle.prototype.initialize = function() {
_Scene_Battle_initialize.call(this);
this._bulletHellActive = false;
};

Scene_Battle.prototype.startBulletHell = function() {
this._bulletHellActive = true;
this.hideBattleWindows();
this.createBulletHellLayer();
};

Scene_Battle.prototype.endBulletHell = function() {
if (!this._bulletHellActive) return;
this._bulletHellActive = false;
this.showBattleWindows();
this.removeBulletHellLayer();
};

// Every window that goes down for the sequence is remembered exactly as it
// stood and put back exactly as it stood. The old pair hid windows outright and
// only ever showed a hand-picked few again, so the actor command window stayed
// invisible for the rest of the fight: MZ opens that window without ever
// setting visible, so the player was handed an active menu they could not see,
// which reads as the battle having frozen. The battle log was worse off still,
// being handed a flat 255 back over the transparent frame it actually had.
const BATTLE_WINDOW_KEYS = [
"_partyCommandWindow", "_actorCommandWindow", "_skillWindow", "_itemWindow",
"_actorWindow", "_enemyWindow", "_helpWindow", "_statusWindow",
"_logWindow", "_pastLogWindow"
];

Scene_Battle.prototype.hideBattleWindows = function() {
const saved = [];
const seen = new Set();
const remember = win => {
    if (!win || seen.has(win)) return;
    seen.add(win);
    saved.push({
        win: win,
        visible: win.visible,
        opacity: win.opacity,
        backOpacity: win.backOpacity,
        contentsOpacity: win.contentsOpacity
    });
};

for (const key of BATTLE_WINDOW_KEYS) remember(this[key]);
if (this._windowLayer) {
    for (const child of this._windowLayer.children) {
        if (child instanceof Window_Base) remember(child);
    }
}
for (const child of this.children) {
    if (child instanceof Window_Base) remember(child);
}

this._bulletHellSavedWindows = saved;
for (const entry of saved) entry.win.visible = false;

// The scrolling battle log (MPP_SmoothBattleLog2) draws through its own
// sprites, which sit outside the window's visibility.
const log = this._logWindow;
if (log && log._logSprites) {
    this._bulletHellSavedLogOpacity = log._logSprites.map(s => (s ? s.opacity : 0));
    for (const sprite of log._logSprites) {
        if (sprite) sprite.opacity = 0;
    }
}
if (this._pastLogWindow) this._pastLogWindow.deactivate();
};

Scene_Battle.prototype.showBattleWindows = function() {
for (const entry of this._bulletHellSavedWindows || []) {
    entry.win.visible = entry.visible;
    entry.win.opacity = entry.opacity;
    entry.win.backOpacity = entry.backOpacity;
    entry.win.contentsOpacity = entry.contentsOpacity;
}
this._bulletHellSavedWindows = null;

const log = this._logWindow;
const savedOpacity = this._bulletHellSavedLogOpacity;
if (log && log._logSprites && savedOpacity) {
    for (let i = 0; i < log._logSprites.length; i++) {
        const sprite = log._logSprites[i];
        if (sprite) sprite.opacity = savedOpacity[i] !== undefined ? savedOpacity[i] : 255;
    }
}
this._bulletHellSavedLogOpacity = null;
};

// The duel is fought against an enemy that is actually still standing. The
// first sprite in the spriteset can be a corpse from earlier in the fight, and
// a dead battler ended the sequence on its opening frame.
Scene_Battle.prototype.bulletHellTargetSprite = function() {
const sprites = (this._spriteset && this._spriteset._enemySprites) || [];
for (const sprite of sprites) {
    if (sprite && sprite._battler && sprite._battler.isAlive()) return sprite;
}
return sprites[0] || null;
};

// The real battler is never moved, scaled or reparented any more: the enemy is
// redrawn as its own avatar inside the field (see createEnemyAvatar), which is
// the only way the sequence can work for all three enemy render modes at once.
Scene_Battle.prototype.createBulletHellLayer = function() {
this._bulletHellLayer = new BulletHellLayer(
    $gameTemp.bulletHellParams,
    this.bulletHellTargetSprite()
);
this.addChild(this._bulletHellLayer);
};

Scene_Battle.prototype.removeBulletHellLayer = function() {
if (!this._bulletHellLayer) return;
this._bulletHellLayer.dispose();
this.removeChild(this._bulletHellLayer);
this._bulletHellLayer = null;
};

const _Scene_Battle_terminate_BH = Scene_Battle.prototype.terminate;
Scene_Battle.prototype.terminate = function() {
// The sequence must never outlive the scene it is drawn in: a battle that ended
// mid-duel used to leave BattleManager sitting in the "bullet-hell" phase.
if (BattleManager._bulletHellMode) BattleManager.finishBulletHell();
_Scene_Battle_terminate_BH.call(this);
};

const _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
_Scene_Battle_update.call(this);
if (this._bulletHellActive && this._bulletHellLayer) {
    this._bulletHellLayer.update();
}
};

class BulletHellLayer extends PIXI.Container {
constructor(params, enemySprite) {
    super();
    this.initialize(params, enemySprite);
}

createDamageCounter() {
    this._damageCounter = new Sprite(new Bitmap(200, 48));
    this._damageCounter.bitmap.fontSize = 28;
    this._damageCounter.bitmap.fontFace = $gameSystem.mainFontFace();
    this._damageCounter.bitmap.textColor = "#FFFFFF";
    this._damageCounter.bitmap.outlineColor = "rgba(0, 0, 0, 0.8)";
    this._damageCounter.bitmap.outlineWidth = 4;
    this._damageCounter.x = Graphics.boxWidth / 2 - 100;
    this._damageCounter.y = Graphics.boxHeight * 0.1;
    
    // Hide the damage counter until end of sequence
    this._damageCounter.visible = false;
    
    this.addChild(this._damageCounter);
    this.updateDamageCounter();
}

updateDamageCounter() {
    if (this._damageCounter && this._damageCounter.bitmap) {
        this._damageCounter.bitmap.clear();
        const damage = this._totalDamageDealt || 0;
        this._damageCounter.bitmap.drawText(String(damage), 0, 0, 200, 48, "center");
    }
}

initialize(params, enemySprite) {
    this._params = params;
    // The battler's own sprite is read for its picture only; what flies around
    // the field is the avatar built in createEnemyAvatar.
    this._battlerSprite = enemySprite;
    this._enemySprite = null;
    this._enemy = enemySprite ? enemySprite._battler : null;
    this._player = $gameParty.battleMembers()[0];
    this._duration = Number(params && params.duration) || 300;
    this._outroFrames = OUTRO_FRAMES;
    // Set before anything reads it: the avatar is built during this very
    // constructor and its first resolve pass consults the frame count.
    this._frames = 0;

    // Store adjusted player and enemy luck values for later use
    this._playerLuck = this._player ? this._player.luk : 0;
    this._enemyLuck = this._enemy ? this._enemy.luk : 0;

    // Guard so the teardown runs once: while the outro plays out, the clock
    // and the collisions must not start a second one (see endSequence).
    this._bulletHellEnding = false;

    // Extract enemy level from notes
    this._enemyLevel = 1; // Default level
    if (this._enemy && this._enemy.enemy && this._enemy.enemy().note) {
        const levelMatch = this._enemy.enemy().note.match(/LV:\s*(\d+)/i);
        if (levelMatch) {
            this._enemyLevel = Math.min(99, Math.max(1, parseInt(levelMatch[1])));
        }
    }
    
    this.width = Graphics.boxWidth;
    this.height = Graphics.boxHeight;

    // Calculate difficulty factor based on enemy level and luck
    // Luck has 70% weight, Level has 30% weight
    // Luck soft caps at 200, common range is 30-50
    
    // Level component (0.0 to 1.0 scale)
    // Level 1-9: 0.0 - 0.3 (easy)
    // Level 10-19: 0.3 - 0.5 (moderate)
    // Level 20-49: 0.5 - 0.75 (medium-hard)
    // Level 50-99: 0.75 - 1.0 (very hard)
    let levelFactor;
    if (this._enemyLevel < 10) {
        // Easy range: linear 0.0 to 0.3
        levelFactor = this._enemyLevel * 0.03;
    } else if (this._enemyLevel < 20) {
        // Moderate range: 0.3 to 0.5
        levelFactor = 0.3 + ((this._enemyLevel - 10) * 0.02);
    } else if (this._enemyLevel < 50) {
        // Medium-hard range: 0.5 to 0.75
        levelFactor = 0.5 + ((this._enemyLevel - 20) * 0.00833);
    } else {
        // Very hard range: 0.75 to 1.0
        levelFactor = 0.75 + ((this._enemyLevel - 50) * 0.0051);
    }
    
    // Luck component with soft cap at 20 (D&D stat scale)
    // Designed so 12-15 luck = medium difficulty
    // < 10 luck: very easy (0.0 - 0.3)
    // 10-12 luck: easy (0.3 - 0.45)
    // 12-15 luck: medium (0.45 - 0.65) <- most common enemies
    // 15-18 luck: hard (0.65 - 0.85)
    // 18-20+ luck: extreme (0.85 - 1.0)
    let luckFactor;
    if (this._enemyLuck < 10) {
        luckFactor = Math.max(0, this._enemyLuck) * 0.03; // 0.0 to 0.3
    } else if (this._enemyLuck < 12) {
        luckFactor = 0.3 + ((this._enemyLuck - 10) * 0.075); // 0.3 to 0.45
    } else if (this._enemyLuck < 15) {
        luckFactor = 0.45 + ((this._enemyLuck - 12) * 0.0667); // 0.45 to 0.65
    } else if (this._enemyLuck < 18) {
        luckFactor = 0.65 + ((this._enemyLuck - 15) * 0.0667); // 0.65 to 0.85
    } else {
        luckFactor = 0.85 + ((Math.min(25, this._enemyLuck) - 18) * 0.0214); // 0.85 to 1.0
    }
    
    // Weighted combination: 70% luck, 30% level
    const combinedFactor = (luckFactor * 0.7) + (levelFactor * 0.3);
    
    // Convert to difficulty multiplier
    // 0.0-0.25: very easy (0.4x - 0.6x)
    // 0.25-0.4: easy (0.6x - 0.8x)
    // 0.4-0.6: medium (0.8x - 1.2x) <- most common medium level enemies
    // 0.6-0.8: hard (1.2x - 1.6x)
    // 0.8-1.0: very hard/extreme (1.6x - 2.2x)
    let difficultyFactor;
    if (combinedFactor < 0.25) {
        difficultyFactor = 0.4 + (combinedFactor * 0.8); // 0.4 to 0.6
    } else if (combinedFactor < 0.4) {
        difficultyFactor = 0.6 + ((combinedFactor - 0.25) * 1.333); // 0.6 to 0.8
    } else if (combinedFactor < 0.6) {
        difficultyFactor = 0.8 + ((combinedFactor - 0.4) * 2.0); // 0.8 to 1.2
    } else if (combinedFactor < 0.8) {
        difficultyFactor = 1.2 + ((combinedFactor - 0.6) * 2.0); // 1.2 to 1.6
    } else {
        difficultyFactor = 1.6 + ((combinedFactor - 0.8) * 3.0); // 1.6 to 2.2
    }
    
    this._difficultyFactor = useLuckForDifficulty ? difficultyFactor : 1.0;
    
    // Apply massive bullet quantity multiplier for all difficulties
    // Lower difficulties get slower bullets but still plenty of them
    this._bulletQuantityMultiplier = 3.0;
    
    // Set up for multiple patterns
    this._useMultiplePatterns = this._enemyLuck >= 12;
    this._activePatterns = [];
    this._patternTimers = {};
    
    // Initialize secondary pattern timer
    this._secondaryPatternTimer = 0;
    this._secondaryPatternInterval = Math.max(30, 90 - Math.max(0, this._enemyLuck - 10) * 5);

    // Create background. Opaque on purpose: the battlefield behind it holds the
    // enemy's real sprite or its 3D model, standing where it always stood, and
    // a ghost of it showing through while its avatar flew about the field read
    // as two copies of the same monster.
    this._background = new PIXI.Graphics();
    this._background.beginFill(0x0A0A12, 1);
    this._background.drawRect(0, 0, Graphics.boxWidth, Graphics.boxHeight);
    this._background.endFill();
    this.addChild(this._background);
    
    // Create game field
    this._bulletHellField = new PIXI.Graphics();
    this._bulletHellField.beginFill(0x000000, 0);
    this._bulletHellField.drawRect(0, 0, Graphics.boxWidth, Graphics.boxHeight);
    this._bulletHellField.endFill();
    this._bulletHellField.y = 0;
    this.addChild(this._bulletHellField);

    // The enemy, redrawn inside the field
    this.createEnemyAvatar();

    // Setup enemy movement parameters
    this._enemyMovement = {
        pattern: this.getRandomMovementPattern(),
        timer: 0,
        duration: 180,
        speedX: 2 * enemySpeedMultiplier * defaultSpeedMultiplier,
        speedY: 1.5 * enemySpeedMultiplier * defaultSpeedMultiplier,
        angle: 0,
        radius: 80,
        centerX: this._enemySprite.x,
        centerY: this._enemySprite.y
    };

    // Create player ship, bullets, damage counter
    this.createPlayerShip();
    this.createBullets();
    this.createDamageCounter();
    
    // Set up state variables
    this._playerBulletTimer = 0;
    this._enemyBulletTimer = 0;
    this._totalDamageDealt = 0;
    this._fadeEffects = [];
    this._lastInputDirection = { x: 0, y: 0 };
    
    // Create collision hitboxes
    this.createCollisionAreas();
    
    // Setup input controls
    this.setupControls();
    
    // Pattern change timer based on enemy luck
    this._patternChangeTime = Math.floor(180 / this._difficultyFactor);
}

//-------------------------------------------------------------------------
// The enemy avatar
//
// The sequence used to fly the real Sprite_Enemy around the screen, which only
// ever worked for a plain 2D battler. With the 3D battlers that sprite is
// hidden and the creature is drawn through the shared three.js canvas; in
// Sprites mode the sprite's own bitmap is blanked and a scaled <Char:> child
// carries the picture. Either way the thing being flown about was an empty,
// zero-sized sprite, so the player faced an invisible enemy they could not hit
// (the hitbox is measured off it) while the real one stood still behind the
// overlay. The enemy is now cut out of whatever it is actually drawn with and
// redrawn as an avatar inside the field.
//-------------------------------------------------------------------------

createEnemyAvatar() {
    const avatar = new PIXI.Sprite(PIXI.Texture.EMPTY);
    avatar.anchor.set(0.5, 0.5);
    avatar.x = Graphics.boxWidth / 2;
    avatar.y = Graphics.boxHeight * 0.28;
    this._enemySprite = avatar;
    this._avatarMode = null;
    this._avatarBitmap = null;
    this._avatarTexture = null;
    this._avatarFrameKey = null;
    this.addChild(avatar);
    this.updateEnemyAvatar();
}

// The enemy's 3D model, when this fight is drawing its monsters as models.
resolve3DSource() {
    const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
    if (!spriteset || !spriteset.get3DModel || !spriteset._battle3DSprite) return null;
    if (!spriteset._battle3DScene || spriteset._battle3DScene._disposed) return null;
    if (typeof THREE === 'undefined') return null;
    const model = spriteset.get3DModel(this._enemy);
    if (!model || !model.model || model.model.visible === false) return null;
    return { mode: "model3d", model: model, spriteset: spriteset };
}

// The enemy's 2D picture: the <Char:> walking sprite in Sprites mode, the
// battler image otherwise. The character sprite is checked first because in
// Sprites mode the battler's own bitmap has been blanked out behind it.
resolveSpriteSource() {
    const sprite = this._battlerSprite;
    const charSprite = sprite && sprite._charSprite;
    if (charSprite && charSprite.visible && charSprite.bitmap && charSprite.bitmap.isReady()) {
        return { mode: "charSprite", bitmap: charSprite.bitmap, frame: charSprite._frame };
    }
    if (sprite && sprite.bitmap && sprite.bitmap.isReady() && sprite.bitmap.width > 1) {
        const bitmap = sprite.bitmap;
        return {
            mode: "battler",
            bitmap: bitmap,
            frame: new PIXI.Rectangle(0, 0, bitmap.width, bitmap.height)
        };
    }
    return null;
}

updateEnemyAvatar() {
    if (!this._enemySprite) return;

    // A 3D crop keeps itself current: it is a window onto the live canvas, so
    // the creature goes on breathing and swinging inside the avatar.
    if (this._avatarMode === "model3d") return;

    // While the sequence is young anything may still be arriving (a battler
    // bitmap loading, a 3D model reaching the scene), so a better picture is
    // taken up as soon as it appears. Once settled we stay with the kind of
    // picture already chosen, because changing it that late would resize the
    // enemy out from under the player's fire.
    const settled = this._frames > AVATAR_RESOLVE_FRAMES;

    if (!settled || this._avatarMode === null) {
        const model = this.resolve3DSource();
        // A model whose box cannot be measured yet falls through to its 2D
        // picture rather than leaving the field empty.
        if (model && this.applyAvatarSource(model)) return;
    }

    const sprite = this.resolveSpriteSource();
    if (!sprite) return;
    if (settled && sprite.mode !== this._avatarMode) return;
    this.applyAvatarSource(sprite);
}

// Returns whether the avatar is now standing on this source.
applyAvatarSource(source) {
    if (source.mode === "model3d") return this.applyModel3DAvatar(source);

    const frame = source.frame;
    if (!frame || !(frame.width > 0) || !(frame.height > 0)) return false;

    const key = frame.x + "," + frame.y + "," + frame.width + "," + frame.height;
    if (source.mode === this._avatarMode &&
        source.bitmap === this._avatarBitmap &&
        key === this._avatarFrameKey) {
        return true;
    }
    this._avatarMode = source.mode;
    this._avatarBitmap = source.bitmap;
    this._avatarFrameKey = key;

    this.setAvatarTexture(new PIXI.Texture(
        source.bitmap.baseTexture,
        new PIXI.Rectangle(frame.x, frame.y, frame.width, frame.height)
    ));
    this.fitAvatar(frame.width, frame.height);
    return true;
}

// Cuts the model's own rectangle out of the 3D canvas the battle renders into.
// The texture behind it is re-uploaded every drawn frame, so the avatar is the
// animated model rather than a snapshot of it.
applyModel3DAvatar(source) {
    const scene3d = source.spriteset._battle3DScene;
    const camera = scene3d.camera;
    const canvas = scene3d.renderer && scene3d.renderer.domElement;
    const root = source.model.model;
    const base = source.spriteset._battle3DSprite.texture.baseTexture;
    if (!camera || !canvas || !root || !base) return false;

    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return false;

    const corner = new THREE.Vector3();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
        corner.set(
            (i & 1) ? box.max.x : box.min.x,
            (i & 2) ? box.max.y : box.min.y,
            (i & 4) ? box.max.z : box.min.z
        );
        corner.project(camera);
        if (!isFinite(corner.x) || !isFinite(corner.y)) return false;
        const px = (corner.x * 0.5 + 0.5) * canvas.width;
        const py = (-corner.y * 0.5 + 0.5) * canvas.height;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }

    // A little air around the box so a limb thrown out mid-animation is not
    // sliced off at the edge of the cut-out.
    const limitW = Math.min(canvas.width, base.realWidth || canvas.width);
    const limitH = Math.min(canvas.height, base.realHeight || canvas.height);
    const padX = (maxX - minX) * AVATAR_MODEL_PAD;
    const padY = (maxY - minY) * AVATAR_MODEL_PAD;
    const x = Math.max(0, Math.floor(minX - padX));
    const y = Math.max(0, Math.floor(minY - padY));
    const w = Math.min(limitW - x, Math.ceil(maxX - minX + padX * 2));
    const h = Math.min(limitH - y, Math.ceil(maxY - minY + padY * 2));
    if (!(w > 4) || !(h > 4)) return false;

    this._avatarMode = "model3d";
    this._avatarBitmap = null;
    this._avatarFrameKey = null;
    this.setAvatarTexture(new PIXI.Texture(base, new PIXI.Rectangle(x, y, w, h)));
    this.fitAvatar(w, h);
    return true;
}

setAvatarTexture(texture) {
    const previous = this._avatarTexture;
    this._avatarTexture = texture;
    this._enemySprite.texture = texture;
    if (previous && previous !== texture) previous.destroy(false);
}

// Whatever the enemy measures on the battlefield, it is drawn here at a size
// the player can read and dodge around: a 3D boss and a 48 pixel walking
// sprite end up about as tall as each other.
fitAvatar(sourceWidth, sourceHeight) {
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) return;
    let scale = AVATAR_TARGET_HEIGHT / sourceHeight;
    const scaledWidth = sourceWidth * scale;
    if (scaledWidth > AVATAR_MAX_WIDTH) scale *= AVATAR_MAX_WIDTH / scaledWidth;
    this._enemySprite.scale.set(scale, scale);
    this.updateEnemyHitbox();
}

createPlayerShip() {
    if (this._params.playerImage) {
        this._playerShip = new Sprite();
        this._playerShip.bitmap = ImageManager.loadPicture(this._params.playerImage);
        this._playerShip.bitmap.addLoadListener(() => {
            this._playerShip.scale.x = 0.5;
            this._playerShip.scale.y = 0.5;
            this._playerShip.anchor.x = 0.5;
            this._playerShip.anchor.y = 0.5;
        });
    } else {
        this._playerShip = new Sprite(new Bitmap(30, 30));
        this._playerShip.bitmap.fillAll("white");
        this._playerShip.anchor.x = 0.5;
        this._playerShip.anchor.y = 0.5;
    }
    
    this._playerShip.x = Graphics.boxWidth / 2;
    this._playerShip.y = Graphics.boxHeight * 0.7;
    this.addChild(this._playerShip);
    
    // Create health percentage display
    this._healthDisplay = new Sprite(new Bitmap(60, 20));
    this._healthDisplay.anchor.x = 0.5;
    this._healthDisplay.anchor.y = 0.5;
    this._healthDisplay.y = -30; // Position above ship
    this._playerShip.addChild(this._healthDisplay);
    
    // Update health display initially
    this.updateHealthDisplay();
}

createBullets() {
    this._playerBullets = [];
    this._enemyBullets = [];
}

createCollisionAreas() {
    this._playerHitbox = { radius: 8 };
    this._enemyHitbox = { x: 0, y: 0, width: 0, height: 0 };
    this.updateEnemyHitbox();
}

// Measured off the avatar every frame rather than once at the start. The
// picture only settles when its bitmap or its 3D model has finished loading,
// and a hitbox frozen at that first empty size is what left the enemy
// unhittable for the whole sequence. Centred on the avatar too: the old box
// sat 200 pixels above the sprite to make up for the battler's bottom anchor.
updateEnemyHitbox() {
    const avatar = this._enemySprite;
    if (!avatar || !this._enemyHitbox) return;
    this._enemyHitbox.x = avatar.x;
    this._enemyHitbox.y = avatar.y;
    this._enemyHitbox.width = Math.max(40, Math.abs(avatar.width) * 0.8);
    this._enemyHitbox.height = Math.max(40, Math.abs(avatar.height) * 0.7);
}

setupControls() {
    this._inputDirection = { x: 0, y: 0 };
    this._isShooting = false;
}

update() {
    this._frames++;

    // Winding down: the volley already in the air plays itself out, but nothing
    // new is fired and nothing can be hit any more.
    if (this._bulletHellEnding) {
        this.updateEnemyAvatar();
        this.updateBullets();
        this.updateFadeEffects();
        if (--this._outroFrames <= 0) BattleManager.finishBulletHell();
        return;
    }

    this.updateInput();
    this.updatePlayerShip();
    this.updateEnemyAvatar();
    this.updateEnemyMovement();
    this.updateBullets();
    this.updateHealthDisplay(); // Update health display each frame
    
    // Use enemy luck to determine bullet spawning frequency
    if (this._frames % Math.max(1, Math.floor(6 / this._difficultyFactor)) === 0) {
        this.spawnEnemyBullets();
    }
    
    this.checkCollisions();
    this.updateFadeEffects();

    if (this._frames >= this._duration) this.endSequence();
}

// One place decides the duel is over, so the outro can never be started twice:
// the clock running out on the very frame the enemy dropped used to fire two
// teardowns and hand the battle back before the score had been shown.
endSequence() {
    if (this._bulletHellEnding) return;
    this._bulletHellEnding = true;
    this._outroFrames = OUTRO_FRAMES;
    BattleManager.endBulletHell();
}

dispose() {
    if (this._enemySprite) {
        this._enemySprite.filters = null;
        this._enemySprite.texture = PIXI.Texture.EMPTY;
    }
    if (this._playerShip) this._playerShip.filters = null;
    // Only the cut-out: its base is the enemy's own bitmap or the shared 3D
    // canvas, and both of those outlive the sequence.
    if (this._avatarTexture) {
        this._avatarTexture.destroy(false);
        this._avatarTexture = null;
    }
}

updateInput() {
    this._lastInputDirection = { 
        x: this._inputDirection.x, 
        y: this._inputDirection.y 
    };
    
    this._inputDirection.x = 0;
    this._inputDirection.y = 0;
    
    if (Input.isPressed("left")) { this._inputDirection.x -= 1; }
    if (Input.isPressed("right")) { this._inputDirection.x += 1; }
    if (Input.isPressed("up")) { this._inputDirection.y -= 1; }
    if (Input.isPressed("down")) { this._inputDirection.y += 1; }
    
    this._isShooting = Input.isPressed("ok") || Input.isPressed("space");
}

updatePlayerShip() {
    // Apply speed multipliers
    const speed = this._params.playerSpeed * 
        playerSpeedMultiplier * 
        defaultSpeedMultiplier;
        
    this._playerShip.x += this._inputDirection.x * speed;
    this._playerShip.y += this._inputDirection.y * speed;
    
    // Keep player in bounds
    const maxY = Graphics.boxHeight;
    this._playerShip.x = Math.max(20, Math.min(Graphics.boxWidth - 20, this._playerShip.x));
    this._playerShip.y = Math.max(20, Math.min(maxY - 20, this._playerShip.y));
    
    // Shoot if ready
    if (this._isShooting && this._playerBulletTimer <= 0) {
        this.createPlayerBullet();
        this._playerBulletTimer = 10;
    }
    
    if (this._playerBulletTimer > 0) {
        this._playerBulletTimer--;
    }
}

createPlayerBullet() {
    // Create bullet sprite
    const bullet = new PIXI.Graphics();
    bullet.beginFill(0x00FFFF);
    bullet.drawRect(-2, -8, 4, 16);
    bullet.endFill();
    bullet.x = this._playerShip.x;
    bullet.y = this._playerShip.y - 15;
    this.addChild(bullet);
    
    // Create bullet trail
    const trail = new PIXI.Graphics();
    trail.beginFill(0x0088FF, 0.5);
    trail.drawRect(-1, -20, 2, 20);
    trail.endFill();
    trail.x = bullet.x;
    trail.y = bullet.y + 8;
    this.addChild(trail);
    
    // Apply slight sway based on movement
    const sway = { 
        x: this._inputDirection.x * 0.2, 
        y: 0 
    };
    
    // Extra sway for quick direction changes
    if (this._lastInputDirection.x !== this._inputDirection.x) {
        sway.x *= 2;
    }
    
    // Add to bullets array with speed adjusted by multiplier
    this._playerBullets.push({
        sprite: bullet,
        trail: trail,
        speed: 10 * bulletSpeedMultiplier * defaultSpeedMultiplier,
        sway: sway,
        bounceCount: 0,
        maxBounces: 2
    });
}

spawnEnemyBullets() {
    if (this._enemyBulletTimer <= 0) {
        // Pattern selection influenced by enemy luck and time
        const basePattern = Math.floor(this._frames / this._patternChangeTime) % 6;
        let pattern = basePattern;
        
        // Higher luck enemies can use more advanced patterns earlier
        if (useLuckForDifficulty && this._enemyLuck >= 14) {
            // Add possibility of using more advanced patterns
            if (Math.random() < (this._enemyLuck - 14) / 6) {
                pattern = Math.floor(Math.random() * 6);
            }
        }
        
        switch (pattern) {
            case 0: this.createCirclePattern(); break;
            case 1: this.createSpreadPattern(); break;
            case 2: this.createSpiralPattern(); break;
            case 3: this.createWavePattern(); break;
            case 4: this.createRainPattern(); break;
            case 5: this.createBurstPattern(); break;
        }
        
        // Set timer for next pattern, faster for high-luck enemies
        switch (pattern) {
            case 2: this._enemyBulletTimer = 10 / this._difficultyFactor; break;
            case 4: this._enemyBulletTimer = 20 / this._difficultyFactor; break;
            default: this._enemyBulletTimer = 30 / this._difficultyFactor; break;
        }
    }
    
    // Handle multiple patterns for enemies with luck > 10
    if (this._useMultiplePatterns) {
        this._secondaryPatternTimer--;
        
        if (this._secondaryPatternTimer <= 0) {
            // Choose a different pattern than the main one
            let secondaryPattern;
            do {
                secondaryPattern = Math.floor(Math.random() * 6);
            } while (secondaryPattern === Math.floor(this._frames / this._patternChangeTime) % 6);
            
            // Create a toned-down version of the secondary pattern
            const originalMultiplier = this._bulletQuantityMultiplier;
            this._bulletQuantityMultiplier = Math.max(1.0, originalMultiplier * 0.6);
            
            switch (secondaryPattern) {
                case 0: this.createCirclePattern(true); break;
                case 1: this.createSpreadPattern(true); break;
                case 2: this.createSpiralPattern(true); break;
                case 3: this.createWavePattern(true); break;
                case 4: this.createRainPattern(true); break;
                case 5: this.createBurstPattern(true); break;
            }
            
            // Restore original multiplier
            this._bulletQuantityMultiplier = originalMultiplier;
            
            // Reset secondary pattern timer
            this._secondaryPatternTimer = this._secondaryPatternInterval;
        }
    }
    
    if (this._enemyBulletTimer > 0) {
        this._enemyBulletTimer--;
    }
}

createCirclePattern(isSecondary = false) {
    const center = { 
        x: this._enemySprite.x, 
        y: this._enemySprite.y 
    };
    
    // Number of bullets affected by enemy luck - touhou level for all difficulties
    const baseBulletCount = 24 + Math.floor(this._difficultyFactor * 8);
    const bulletCount = Math.floor(baseBulletCount * this._bulletQuantityMultiplier);
    
    // Calculate speed based on difficulty
    let speedMultiplier = this._difficultyFactor;
    if (isSecondary) {
        speedMultiplier *= 0.8; // Secondary patterns are slightly slower
    }
    
    for (let i = 0; i < bulletCount; i++) {
        const angle = (Math.PI * 2 / bulletCount) * i;
        const speed = 3 * bulletSpeedMultiplier * defaultSpeedMultiplier * speedMultiplier;
        this.createEnemyBullet(
            center.x, 
            center.y, 
            Math.cos(angle) * speed, 
            Math.sin(angle) * speed,
            isSecondary
        );
    }
}

createSpreadPattern(isSecondary = false) {
    const center = { 
        x: this._enemySprite.x, 
        y: this._enemySprite.y 
    };
    
    // Calculate angle to player
    const angleToPlayer = Math.atan2(
        this._playerShip.y - center.y,
        this._playerShip.x - center.x
    );
    
    // Spread angle affected by enemy luck
    const spreadAngle = Math.PI / 4 * (2 - this._difficultyFactor * 0.5);
    const baseBulletCount = 15 + Math.floor(this._difficultyFactor * 5);
    const bulletCount = Math.floor(baseBulletCount * this._bulletQuantityMultiplier);
    
    // Calculate speed based on difficulty
    let speedMultiplier = this._difficultyFactor;
    if (isSecondary) {
        speedMultiplier *= 0.8; // Secondary patterns are slightly slower
    }
    
    for (let i = 0; i < bulletCount; i++) {
        const angle = angleToPlayer - spreadAngle + (spreadAngle * 2 / (bulletCount - 1)) * i;
        const speed = 4 * bulletSpeedMultiplier * defaultSpeedMultiplier * speedMultiplier;
        
        this.createEnemyBullet(
            center.x, 
            center.y, 
            Math.cos(angle) * speed, 
            Math.sin(angle) * speed,
            isSecondary
        );
    }
}

updateHealthDisplay() {
    if (!this._healthDisplay || !this._player) return;
    
    // Calculate health percentage
    const healthPercentage = Math.max(0, Math.min(100, Math.floor((this._player.hp / this._player.mhp) * 100)));

    // Only redraw when the displayed percentage actually changes (a damage-time
    // redraw already exists); this runs every frame, so skip the clear+drawText
    // churn when nothing changed.
    if (healthPercentage === this._lastHealthPct) return;
    this._lastHealthPct = healthPercentage;

    // Clear the bitmap
    this._healthDisplay.bitmap.clear();
    
    // Determine color based on health percentage
    let color = this.getHealthColor(healthPercentage);
    
    // Draw the health percentage text
    this._healthDisplay.bitmap.fontSize = 16;
    this._healthDisplay.bitmap.textColor = color;
    this._healthDisplay.bitmap.outlineColor = "rgba(0, 0, 0, 0.8)";
    this._healthDisplay.bitmap.outlineWidth = 4;
    this._healthDisplay.bitmap.drawText(healthPercentage + "%", 0, 0, 60, 20, "center");
}

updateBullets() {
    // Update player bullets
    for (let i = this._playerBullets.length - 1; i >= 0; i--) {
        const bullet = this._playerBullets[i];
        
        // Move bullet
        bullet.sprite.y -= bullet.speed;
        bullet.sprite.x += bullet.sway.x;
        
        if (bullet.trail) {
            bullet.trail.y -= bullet.speed;
            bullet.trail.x += bullet.sway.x;
        }
        
        // Handle wall bouncing
        const bounceBuffer = 5;
        if ((bullet.sprite.x <= bounceBuffer || bullet.sprite.x >= Graphics.boxWidth - bounceBuffer) && 
            bullet.bounceCount < bullet.maxBounces) {
            
            // Reverse horizontal movement and count bounce
            bullet.sway.x *= -1.2;
            bullet.bounceCount++;
            
            // Create bounce effect
            const bounceEffect = new PIXI.Graphics();
            bounceEffect.beginFill(0xFFFFFF, 0.7);
            bounceEffect.drawCircle(0, 0, 5);
            bounceEffect.endFill();
            bounceEffect.x = bullet.sprite.x;
            bounceEffect.y = bullet.sprite.y;
            this.addChild(bounceEffect);
            
            this._fadeEffects.push({
                sprite: bounceEffect,
                type: "explosion",
                duration: 8,
                timer: 0,
                initialScale: 0.5
            });
        }
        
        // Remove if off-screen
        if (bullet.sprite.y < -20 || bullet.sprite.y > Graphics.boxHeight + 20) {
            this.removeChild(bullet.sprite);
            if (bullet.trail) {
                this.removeChild(bullet.trail);
            }
            this._playerBullets.splice(i, 1);
        }
    }
    
    // Update enemy bullets
    for (let i = this._enemyBullets.length - 1; i >= 0; i--) {
        const bullet = this._enemyBullets[i];
        
        // Move bullet
        bullet.sprite.x += bullet.vx;
        bullet.sprite.y += bullet.vy;
        
        // Remove if off-screen
        if (bullet.sprite.y < -20 || 
            bullet.sprite.y > Graphics.boxHeight + 20 || 
            bullet.sprite.x < -20 || 
            bullet.sprite.x > Graphics.boxWidth + 20) {
            
            this.removeChild(bullet.sprite);
            this._enemyBullets.splice(i, 1);
        }
    }
}
createEnemyBullet(x, y, vx, vy, isSecondary = false) {
    // Cap the number of live bullets so dense patterns cannot spawn hundreds
    // of PIXI.Graphics and tank the frame rate.
    const MAX_ENEMY_BULLETS = 300;
    if (this._enemyBullets.length >= MAX_ENEMY_BULLETS) return;

    let bulletSprite;

    // Make all enemy projectiles white regardless of pattern
    bulletSprite = new PIXI.Graphics();
    
    // Secondary pattern bullets can have slight transparency to distinguish them
    const bulletAlpha = isSecondary ? 0.85 : 1.0;
    bulletSprite.beginFill(0xFFFFFF, bulletAlpha); // White color for all bullets
    
    // Different bullet shapes based on current pattern
    switch (Math.floor(this._frames / this._patternChangeTime) % 6) {
        case 0:
        default:
            bulletSprite.drawCircle(0, 0, 6);
            break;
            
        case 1:
            bulletSprite.moveTo(0, -8);
            bulletSprite.lineTo(7, 8);
            bulletSprite.lineTo(-7, 8);
            bulletSprite.lineTo(0, -8);
            break;
            
        case 2:
            bulletSprite.drawCircle(0, 0, 4);
            break;
            
        case 3:
            bulletSprite.moveTo(0, -7);
            bulletSprite.lineTo(7, 0);
            bulletSprite.lineTo(0, 7);
            bulletSprite.lineTo(-7, 0);
            bulletSprite.lineTo(0, -7);
            break;
            
        case 4:
            bulletSprite.moveTo(0, -8);
            bulletSprite.lineTo(5, 0);
            bulletSprite.lineTo(0, 8);
            bulletSprite.lineTo(-5, 0);
            bulletSprite.lineTo(0, -8);
            break;
            
        case 5:
            const starPoints = 5;
            const outerRadius = 7;
            const innerRadius = 3;
            
            for (let i = 0; i < starPoints * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (Math.PI * i) / starPoints;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                
                if (i === 0) {
                    bulletSprite.moveTo(px, py);
                } else {
                    bulletSprite.lineTo(px, py);
                }
            }
            break;
    }
    
    bulletSprite.endFill();
    bulletSprite.x = x;
    bulletSprite.y = y;
    this.addChild(bulletSprite);
    
    // Apply a slight size variation for secondary patterns
    if (isSecondary) {
        bulletSprite.scale.x = 0.9;
        bulletSprite.scale.y = 0.9;
    }
    
    // Make enemy projectiles slightly slower (0.8 multiplier)
    // Secondary pattern bullets can move slightly faster
    const secondarySpeedMod = isSecondary ? 1.1 : 1.0;
    
    this._enemyBullets.push({
        sprite: bulletSprite,
        vx: vx * 0.8 * secondarySpeedMod,
        vy: vy * 0.8 * secondarySpeedMod,
        isSecondary: isSecondary
    });
}
checkCollisions() {
    // Teardown already scheduled - don't re-enter every frame.
    if (this._bulletHellEnding) return;
    // If enemy is defeated, end the sequence
    if (!this._enemy || this._enemy.hp <= 0) {
        this.endSequence();
        return;
    }
    
    // Check enemy bullets colliding with player
    for (let i = this._enemyBullets.length - 1; i >= 0; i--) {
        const bullet = this._enemyBullets[i];
        
        // Distance between bullet and player (compare squared distances to
        // avoid a Math.sqrt per bullet per frame in this O(n*m) hot loop).
        const dx = bullet.sprite.x - this._playerShip.x;
        const dy = bullet.sprite.y - this._playerShip.y;
        const distanceSq = dx * dx + dy * dy;

        // Collision with player
        const playerHitR = this._playerHitbox.radius + 6;
        if (distanceSq < playerHitR * playerHitR) {
            this.removeChild(bullet.sprite);
            this._enemyBullets.splice(i, 1);
            this.playerHit();
            continue;
        }
        
        // Check for bullet-on-bullet collisions
        let destroyed = false;
        for (let j = this._playerBullets.length - 1; j >= 0; j--) {
            const playerBullet = this._playerBullets[j];
            
            // Distance between bullets (squared compare; 14*14 = 196)
            const bdx = playerBullet.sprite.x - bullet.sprite.x;
            const bdy = playerBullet.sprite.y - bullet.sprite.y;
            const bulletDistanceSq = bdx * bdx + bdy * bdy;

            // Collision between bullets
            if (bulletDistanceSq < 196) {
                // Create collision effects
                this.createExplosion(bullet.sprite.x, bullet.sprite.y, 0.5);
                this.createGreekLetter(bullet.sprite.x, bullet.sprite.y);
                
                // Play sound effect
                if (this._params.bulletCollisionSE) {
                    AudioManager.playSe({
                        name: this._params.bulletCollisionSE,
                        volume: 90,
                        pitch: 100,
                        pan: 0
                    });
                }
                
                // Remove both bullets
                this.removeChild(bullet.sprite);
                this._enemyBullets.splice(i, 1);
                
                this.removeChild(playerBullet.sprite);
                if (playerBullet.trail) {
                    this.removeChild(playerBullet.trail);
                }
                this._playerBullets.splice(j, 1);
                
                destroyed = true;
                break;
            }
        }
        
        if (destroyed) continue;
    }
    
    // Check player bullets hitting enemy
    for (let i = this._playerBullets.length - 1; i >= 0; i--) {
        const bullet = this._playerBullets[i];
        
        // Check if bullet is within enemy hitbox
        if (bullet.sprite.x > this._enemyHitbox.x - this._enemyHitbox.width/2 && 
            bullet.sprite.x < this._enemyHitbox.x + this._enemyHitbox.width/2 && 
            bullet.sprite.y > this._enemyHitbox.y - this._enemyHitbox.height/2 && 
            bullet.sprite.y < this._enemyHitbox.y + this._enemyHitbox.height/2) {
            
            // Apply glow effect to bullet on hit
            const filter = new PIXI.filters.ColorMatrixFilter();
            filter.matrix = [
                1.5, 0, 0, 0, 0.5,
                0, 0.1, 0, 0, 0,
                0, 0, 0.1, 0, 0,
                0, 0, 0, 1, 0
            ];
            
            bullet.sprite.filters = [filter];
            if (bullet.trail) {
                bullet.trail.filters = [filter];
            }
            
            // Add to fade effects
            this._fadeEffects.push({
                sprite: bullet.sprite,
                trail: bullet.trail,
                type: "laser",
                duration: 24,
                speed: bullet.speed,
                sway: bullet.sway,
                allowBounce: true
            });
            
            // Remove from active bullets
            this._playerBullets.splice(i, 1);
            
            // Apply damage
            this.enemyHit();
            
            // End sequence if enemy defeated
            if (this._enemy.hp <= 0) {
                this.endSequence();
                return;
            }
        }
    }
}

playerHit() {
    // Visual effect - make player blink
    this._playerShip.filters = [this.createBlinkFilter()];
    setTimeout(() => {
        this._playerShip.filters = null;
    }, 200);
    
    // Calculate damage based on enemy's psychic attack vs player's psychic defense
    let damage = this._params.enemyBulletDamage;
    
    if (useLuckForDamage) {
        // Enemy psychic attack vs player psychic defense
        const attackPower = 10 + this._enemyLuck;
        const defensePower = 10 + this._playerLuck;
        
        // Ratio with soft caps
        const psiRatio = Math.pow(attackPower / defensePower, 0.8);
        
        damage = Math.round(damage * psiRatio);
        
        // Cap damage at 8% max HP to prevent excessive damage
        damage = Math.min(damage, Math.floor(this._player.mhp * 0.08));
    }
    
    // Minimum 1% of max HP
    damage = Math.max(Math.floor(this._player.mhp * 0.01), damage);
    
    this._player.gainHp(-damage);
    
    // Check if player is defeated
    if (this._player.hp <= 0) {
        this.endSequence();
        return;
    }
    
    // Update health display immediately after taking damage
    this.updateHealthDisplay();
    
    // Create damage popup on actor sprite if possible
    if (SceneManager._scene._spriteset) {
        const actorSprites = SceneManager._scene._spriteset._actorSprites;
        if (actorSprites && actorSprites.length > 0) {
            for (let i = 0; i < actorSprites.length; i++) {
                if (actorSprites[i] && actorSprites[i]._battler === this._player) {
                    actorSprites[i].startDamagePopup();
                    break;
                }
            }
        }
    }
}
enemyHit() {
    // Visual effect - make enemy blink
    this._enemySprite.filters = [this.createBlinkFilter()];
    setTimeout(() => {
        this._enemySprite.filters = null;
    }, 200);
    
    // Calculate PSI damage
    let damage = this._params.bulletDamage;
    
    if (useLuckForDamage) {
        // Level-based power (sqrt scaling for smoother growth)
        // Level 1 = 1.0x, Level 25 = 2.5x, Level 50 = 3.5x, Level 99 = 5.0x
        const levelPower = 1 + (Math.sqrt(this._player.level) * 0.4);
        
        // PSI attack vs defense (diminishing returns on both ends)
        const attackPower = 10 + this._playerLuck;
        const defensePower = 10 + this._enemyLuck;
        
        // Ratio with soft caps: ranges from ~0.4x to ~2.0x
        const psiRatio = Math.pow(attackPower / defensePower, 0.8);
        
        // Combine multipliers
        damage = Math.round(damage * levelPower * psiRatio);
        
        // Ensure minimum damage based on level (always feel progression)
        const minDamage = Math.max(1, Math.floor(this._player.level * 0.5));
        damage = Math.max(minDamage, damage);
    }
    
    // Apply damage to enemy
    this._enemy.gainHp(-damage);
    // A kill here never passes the battle log's added-state display, which is
    // the only thing that plays an enemy's collapse: without it the body stood
    // on the field for the rest of the fight.
    if (this._enemy.isDead() && !this._enemy._bulletHellCollapsed) {
        this._enemy._bulletHellCollapsed = true;
        this._enemy.performCollapse();
    }
    
    // Play random hit sound
    const hitSounds = [
        this._params.enemyHitSE,
        this._params.enemyHitSE2,
        this._params.enemyHitSE3
    ].filter(sound => sound);
    
    if (hitSounds.length > 0) {
        const sound = hitSounds[Math.floor(Math.random() * hitSounds.length)];
        AudioManager.playSe({
            name: sound,
            volume: 90,
            pitch: 100,
            pan: 0
        });
    }
    
    // Update damage counter
    this._totalDamageDealt += damage;
    this.updateDamageCounter();
}


createBlinkFilter() {
    const filter = new PIXI.filters.ColorMatrixFilter();
    filter.brightness(1.5, false);
    return filter;
}
getHealthColor(percentage) {
    // Green (0x00FF00) for 100% health
    // Yellow (0xFFFF00) for 50% health
    // Red (0xFF0000) for 0% health
    if (percentage >= 75) {
        return "#00FF00"; // Green
    } else if (percentage >= 50) {
        return "#88FF00"; // Green-Yellow
    } else if (percentage >= 25) {
        return "#FFFF00"; // Yellow
    } else if (percentage >= 10) {
        return "#FF8800"; // Orange
    } else {
        return "#FF0000"; // Red
    }
}    

createSpiralPattern(isSecondary = false) {
    const center = { 
        x: this._enemySprite.x, 
        y: this._enemySprite.y 
    };
    
    // Spiral angle dependent on time - low difficulty makes more predictable spirals
    const spiralAngle = this._frames * 0.05 * this._difficultyFactor;
    
    // Number of bullets increases with enemy luck - touhou level for all difficulties
    const baseBulletCount = 30 + Math.floor(this._difficultyFactor * 10);
    const bulletCount = Math.floor(baseBulletCount * this._bulletQuantityMultiplier);
    
    // Calculate speed based on difficulty
    let speedMultiplier = this._difficultyFactor;
    if (isSecondary) {
        speedMultiplier *= 0.8; // Secondary patterns are slightly slower
    }
    
    // For multi-arm spirals in higher difficulties
    const armCount = Math.min(1 + Math.floor(this._difficultyFactor * 2), 5);
    
    for (let arm = 0; arm < armCount; arm++) {
        const armOffset = (Math.PI * 2 / armCount) * arm;
        
        for (let i = 0; i < bulletCount / armCount; i++) {
            const angle = spiralAngle + (Math.PI * 2 / (bulletCount / armCount)) * i + armOffset;
            const speed = 2.5 * bulletSpeedMultiplier * defaultSpeedMultiplier * speedMultiplier;
            
            this.createEnemyBullet(
                center.x, 
                center.y, 
                Math.cos(angle) * speed, 
                Math.sin(angle) * speed,
                isSecondary
            );
        }
    }
}

createWavePattern(isSecondary = false) {
    const center = { 
        x: this._enemySprite.x, 
        y: this._enemySprite.y 
    };
    
    // Number of bullets increases with enemy luck - touhou level for all difficulties
    const baseBulletCount = 20 + Math.floor(this._difficultyFactor * 10);
    const bulletCount = Math.floor(baseBulletCount * this._bulletQuantityMultiplier);
    
    // Calculate speed based on difficulty
    let speedMultiplier = this._difficultyFactor;
    if (isSecondary) {
        speedMultiplier *= 0.8; // Secondary patterns are slightly slower
    }
    
    // Higher difficulties have more chaotic waves with multiple frequencies
    const waveFactor = 0.3 * this._difficultyFactor;
    const waveSpeed = 0.2 * this._difficultyFactor;
    
    // Multiple wave layers for higher difficulties
    const waveCount = Math.min(1 + Math.floor(this._difficultyFactor), 3);
    
    for (let wave = 0; wave < waveCount; wave++) {
        const waveOffset = (Math.PI / waveCount) * wave;
        
        for (let i = 0; i < bulletCount / waveCount; i++) {
            // Wave pattern with sine function - more chaotic at higher difficulties
            const angle = (Math.PI / ((bulletCount / waveCount) - 1)) * i - Math.PI/2 + 
                Math.sin(this._frames * waveSpeed + i * 0.1) * waveFactor + waveOffset;
                
            const speed = 3 * bulletSpeedMultiplier * defaultSpeedMultiplier * speedMultiplier;
            
            this.createEnemyBullet(
                center.x, 
                center.y, 
                Math.cos(angle) * speed, 
                Math.sin(angle) * speed,
                isSecondary
            );
        }
    }
}

createRainPattern(isSecondary = false) {
    // Divide width into segments - touhou level for all difficulties
    const baseDivisions = 16 + Math.floor(this._difficultyFactor * 8);
    const divisions = Math.floor(baseDivisions * Math.sqrt(this._bulletQuantityMultiplier));
    const segmentWidth = Graphics.boxWidth / divisions;
    
    // Calculate speed based on difficulty
    let speedMultiplier = this._difficultyFactor;
    if (isSecondary) {
        speedMultiplier *= 0.8; // Secondary patterns are slightly slower
    }
    
    // Low difficulties: regular timing, regular spacing
    // High difficulties: irregular timing, irregular spacing
    for (let i = 0; i < divisions; i++) {
        // Skip some columns randomly at higher difficulties to create gaps
        if (this._difficultyFactor > 1.0 && Math.random() < 0.2) {
            continue;
        }
        
        // Irregular spacing at higher difficulties
        const irregularity = Math.random() * this._difficultyFactor * 0.5;
        
        // Position with sine wave variation
        const xPos = segmentWidth * (i + irregularity) + 
            Math.sin(this._frames * 0.05 + i) * 30 * this._difficultyFactor;
            
        const yPos = -10;
        
        // Varying speeds - higher difficulties have more speed variation
        const speedVariation = (0.5 + Math.random()) * 
            bulletSpeedMultiplier * 
            defaultSpeedMultiplier * 
            speedMultiplier;
            
        this.createEnemyBullet(xPos, yPos, 0, speedVariation, isSecondary);
        
        // At higher difficulties, add additional offset bullets
        if (this._difficultyFactor >= 1.3 && Math.random() < this._difficultyFactor * 0.3) {
            const offsetX = xPos + (Math.random() - 0.5) * segmentWidth;
            this.createEnemyBullet(offsetX, yPos, 0, speedVariation * 1.2, isSecondary);
        }
    }
}

createBurstPattern(isSecondary = false) {
    const centerX = this._enemySprite.x;
    const centerY = this._enemySprite.y;
    
    // Number of bullets increases with enemy luck - touhou level for all difficulties
    const baseBulletCount = 30 + Math.floor(this._difficultyFactor * 15);
    const bulletCount = Math.floor(baseBulletCount * this._bulletQuantityMultiplier);
    
    // Calculate speed based on difficulty
    let speedMultiplier = this._difficultyFactor;
    if (isSecondary) {
        speedMultiplier *= 0.8; // Secondary patterns are slightly slower
    }
    
    // For multi-layer bursts in higher difficulties
    const layerCount = Math.min(1 + Math.floor(this._difficultyFactor), 3);
    
    for (let layer = 0; layer < layerCount; layer++) {
        const layerRadius = 30 + (layer * 20);
        const layerSpeed = speedMultiplier * (1 + (layer * 0.3));
        const layerOffset = (Math.PI / layerCount) * layer;
        
        for (let i = 0; i < bulletCount / layerCount; i++) {
            const angle = (Math.PI * 2 / (bulletCount / layerCount)) * i + layerOffset;
            const speed = 4 * bulletSpeedMultiplier * defaultSpeedMultiplier * layerSpeed;
            
            // Higher difficulties introduce some angle randomization
            const angleJitter = this._difficultyFactor > 1.0 ? 
                (Math.random() - 0.5) * 0.2 * this._difficultyFactor : 0;
            
            // Bullets emerge from circles around the enemy
            const startX = centerX + Math.cos(angle) * layerRadius;
            const startY = centerY + Math.sin(angle) * layerRadius;
            
            this.createEnemyBullet(
                startX, 
                startY, 
                Math.cos(angle + angleJitter) * speed, 
                Math.sin(angle + angleJitter) * speed,
                isSecondary
            );
        }
    }
}

createGreekLetter(x, y) {
    // Array of Greek letters for visual effect
    const greekLetters = [
        "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", 
        "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω"
    ];
    
    // Pick a random letter
    const letter = greekLetters[Math.floor(Math.random() * greekLetters.length)];
    
    // Create text sprite
    const textSprite = new Sprite(new Bitmap(32, 32));
    textSprite.bitmap.fontSize = 24;
    textSprite.bitmap.fontFace = "Arial";
    textSprite.bitmap.textColor = "#000000";
    textSprite.bitmap.drawText(letter, 0, 0, 32, 32, "center");
    
    textSprite.x = x;
    textSprite.y = y;
    textSprite.anchor.x = 0.5;
    textSprite.anchor.y = 0.5;
    textSprite.alpha = 1;
    textSprite.scale.x = 1;
    textSprite.scale.y = 1;
    
    this.addChild(textSprite);
    
    // Add to fade effects
    this._fadeEffects.push({
        sprite: textSprite,
        type: "greekLetter",
        duration: 60,
        timer: 0
    });
    
    return textSprite;
}

createExplosion(x, y, scale = 1) {
    // Create explosion visual
    const explosion = new PIXI.Graphics();
    explosion.beginFill(0xFFCC00);
    explosion.drawCircle(0, 0, 20 * scale);
    explosion.endFill();
    explosion.x = x;
    explosion.y = y;
    explosion.alpha = 1;
    
    this.addChild(explosion);
    
    // Add blur filter
    const blurFilter = new PIXI.filters.BlurFilter();
    blurFilter.blur = 4;
    explosion.filters = [blurFilter];
    
    // Add to fade effects
    this._fadeEffects.push({
        sprite: explosion,
        type: "explosion",
        duration: 15,
        timer: 0,
        initialScale: scale
    });
    
    return explosion;
}

updateFadeEffects() {
    for (let i = this._fadeEffects.length - 1; i >= 0; i--) {
        const effect = this._fadeEffects[i];
        effect.timer++;
        
        if (effect.type === "greekLetter") {
            if (effect.timer >= effect.duration) {
                this.removeChild(effect.sprite);
                this._fadeEffects.splice(i, 1);
            } else {
                // Fade out over time
                effect.sprite.alpha = 1 - (effect.timer / effect.duration);
            }
        }
        else if (effect.type === "explosion") {
            if (effect.timer >= effect.duration) {
                this.removeChild(effect.sprite);
                this._fadeEffects.splice(i, 1);
            } else {
                // Expand and fade out
                const progress = effect.timer / effect.duration;
                effect.sprite.alpha = 1 - progress;
                effect.sprite.scale.x = effect.initialScale * (1 + progress);
                effect.sprite.scale.y = effect.initialScale * (1 + progress);
            }
        }
        else if (effect.type === "laser") {
            if (effect.timer >= effect.duration) {
                this.removeChild(effect.sprite);
                if (effect.trail) {
                    this.removeChild(effect.trail);
                }
                this._fadeEffects.splice(i, 1);
            } else {
                // Continue moving
                effect.sprite.y -= effect.speed;
                if (effect.sway) {
                    effect.sprite.x += effect.sway.x;
                }
                
                if (effect.trail) {
                    effect.trail.y -= effect.speed;
                    if (effect.sway) {
                        effect.trail.x += effect.sway.x;
                    }
                }
                
                // Handle wall bouncing for laser fade effects
                if (effect.allowBounce) {
                    const bounceBuffer = 5;
                    if (effect.sprite.x <= bounceBuffer || effect.sprite.x >= Graphics.boxWidth - bounceBuffer) {
                        effect.sway.x *= -1.2;
                        
                        // Create bounce effect
                        const bounceEffect = new PIXI.Graphics();
                        bounceEffect.beginFill(0xFF3333, 0.7);
                        bounceEffect.drawCircle(0, 0, 5);
                        bounceEffect.endFill();
                        bounceEffect.x = effect.sprite.x;
                        bounceEffect.y = effect.sprite.y;
                        this.addChild(bounceEffect);
                        
                        this._fadeEffects.push({
                            sprite: bounceEffect,
                            type: "explosion",
                            duration: 8,
                            timer: 0,
                            initialScale: 0.5
                        });
                    }
                }
                
                // Start fading out after half duration
                if (effect.timer > effect.duration * 0.5) {
                    const fadeProgress = (effect.timer - effect.duration * 0.5) / (effect.duration * 0.5);
                    effect.sprite.alpha = 1 - fadeProgress;
                    if (effect.trail) {
                        effect.trail.alpha = 1 - fadeProgress;
                    }
                }
            }
        }
    }
}

getRandomMovementPattern() {
    const patterns = ["circle", "zigzag", "figure8", "random", "bounce"];
    
    // Higher luck enemies get more complex patterns
    if (this._difficultyFactor > 1.3) {
        // More likely to use figure8 and circle patterns
        const advancedPatterns = ["figure8", "circle", "zigzag", "bounce"];
        patterns.push(...advancedPatterns);
    }
    
    return patterns[Math.floor(Math.random() * patterns.length)];
}

updateEnemyMovement() {
    if (!this._enemySprite) return;
    
    const movement = this._enemyMovement;
    movement.timer++;
    
    // Change patterns more often with higher luck
    const patternDuration = Math.max(100, 180 / this._difficultyFactor);
    
    if (movement.timer >= movement.duration) {
        movement.pattern = this.getRandomMovementPattern();
        movement.timer = 0;
        movement.centerX = this._enemySprite.x;
        movement.centerY = this._enemySprite.y;
        movement.angle = 0;
        
        // Speed affected by enemy luck
        movement.speedX = (1 + Math.random() * 2) * 
            enemySpeedMultiplier * 
            defaultSpeedMultiplier * 
            this._difficultyFactor;
            
        movement.speedY = (1 + Math.random() * 1.5) * 
            enemySpeedMultiplier * 
            defaultSpeedMultiplier * 
            this._difficultyFactor;
            
        // Radius affected by enemy luck
        movement.radius = 60 + Math.random() * 60 * this._difficultyFactor;
    }
    
    // Calculate movement bounds from the avatar's drawn size, so a wide model
    // cannot walk half of itself off the edge of the field.
    const halfW = Math.abs(this._enemySprite.width) / 2;
    const halfH = Math.abs(this._enemySprite.height) / 2;
    const minX = halfW;
    const maxX = Graphics.boxWidth - halfW;
    const minY = halfH;
    const maxY = Math.max(minY, Graphics.boxHeight / 2);  // Only top half of screen
    
    // Apply different movement patterns
    switch (movement.pattern) {
        case "circle":
            // Circular movement
            movement.angle += 0.02 * this._difficultyFactor;
            this._enemySprite.x = movement.centerX + Math.cos(movement.angle) * movement.radius;
            this._enemySprite.y = movement.centerY + Math.sin(movement.angle) * movement.radius * 0.6;
            break;
            
        case "zigzag":
            // Zigzag movement
            this._enemySprite.x += Math.cos(movement.timer * 0.1) * movement.speedX * 2;
            this._enemySprite.y += Math.sin(movement.timer * 0.2) * movement.speedY;
            break;
            
        case "figure8":
            // Figure-8 movement
            movement.angle += 0.02 * this._difficultyFactor;
            this._enemySprite.x = movement.centerX + Math.sin(movement.angle * 2) * movement.radius;
            this._enemySprite.y = movement.centerY + Math.sin(movement.angle) * movement.radius * 0.5;
            break;
            
        case "random":
            // Random target movement
            if (movement.timer % 30 === 0) {
                movement.targetX = minX + Math.random() * (maxX - minX);
                movement.targetY = minY + Math.random() * (maxY - minY);
            }
            
            if (movement.targetX && movement.targetY) {
                const dx = movement.targetX - this._enemySprite.x;
                const dy = movement.targetY - this._enemySprite.y;
                this._enemySprite.x += dx * 0.05;
                this._enemySprite.y += dy * 0.05;
            }
            break;
            
        case "bounce":
            // Bouncing movement
            if (!movement.vx) {
                movement.vx = movement.speedX * (Math.random() < 0.5 ? 1 : -1);
            }
            if (!movement.vy) {
                movement.vy = movement.speedY * (Math.random() < 0.5 ? 1 : -1);
            }
            
            this._enemySprite.x += movement.vx;
            this._enemySprite.y += movement.vy;
            
            // Bounce off edges
            if (this._enemySprite.x <= minX || this._enemySprite.x >= maxX) {
                movement.vx *= -1;
            }
            if (this._enemySprite.y <= minY || this._enemySprite.y >= maxY) {
                movement.vy *= -1;
            }
            break;
    }
    
    // Keep enemy within bounds
    this._enemySprite.x = Math.max(minX, Math.min(maxX, this._enemySprite.x));
    this._enemySprite.y = Math.max(minY, Math.min(maxY, this._enemySprite.y));

    this.updateEnemyHitbox();
    
    // Uncomment for debugging hitbox
    //this.updateHitboxVisualizer();
}
}

// Add function to store battle log messages
Game_Temp.prototype.addBattleLog = function(text) {
if (!this._battleLogMessages) {
    this._battleLogMessages = [];
}
this._battleLogMessages.push(text);
};

// Ensure safe access to battle log functionality
function safeBattleLog(text) {
if ($gameTemp) {
    $gameTemp.addBattleLog(text);
}
// Try to add text directly to log window if available
if (BattleManager._logWindow && BattleManager._logWindow.addText) {
    const log = BattleManager._logWindow;
    setTimeout(() => {
        // The battle may have closed in between: only the same, live window.
        if (BattleManager._logWindow !== log || !log.contents || log._destroyed) return;
        log.addText(text);
    }, 10);
}
}





// ===== BulletTime: the Bullet Time states and <BulletHell> enemy ultimates =====
//
// Two halves, both read off note tags so no state or skill id is hardcoded.
//
// 1. A state carrying <BulletTimeSlow: n> slows the dodge for whoever flies the
//    craft: enemy shots travel at n% of their speed and are fired n% as often.
//    <BulletTimeHitbox: n> shrinks the craft's own hit radius to n%. Several
//    such states never stack below the strongest one. The states also carry
//    plain evasion traits, and outside a dodge (MapBattleMode, or any fight in
//    which the field cannot open) that evasion is all they are.
//
// 2. An enemy skill tagged <BulletHell> opens a dodge for the party member it
//    targets the moment it is announced. A shot taken in that dodge costs no HP
//    by itself: it is counted, and when the field closes the skill lands with
//    its damage scaled by the count (damageScale). With several party targets
//    one of them flies for everybody, a Bullet Time holder first. Where the
//    field cannot open (MapBattleMode, a scene that is not Scene_Battle, a dodge
//    already running, a fumbled action) the skill is a normal hit. An enemy shot
//    down during its own dodge never lands the skill at all.
//
// The PSI Blast dodge (common event 7, opened by the skill's own effect) is now
// flown by whoever cast it rather than by the first battle member, so Bullet
// Time on the caster is felt there too.

const BT = window.BulletTime = window.BulletTime || {};
BT.HIT_RADIUS = 8;          // the craft's radius as createCollisionAreas sets it
BT.DODGE_FRAMES = 240;      // a <BulletHell> dodge lasts four seconds
BT.SCALE_BASE = 0.25;       // a clean dodge still lets a quarter through
BT.SCALE_PER_HIT = 0.125;   // every hit taken adds an eighth
BT.SCALE_MAX = 1.5;         // ten hits or more and the blow lands half again as hard
BT.PSI_DODGE_EVENT = 7;     // the common event that opens the PSI Blast dodge
BT._session = null;
BT._lastCaster = null;

function btTagNumber(obj, key) {
    if (!obj) return NaN;
    const meta = obj.meta || {};
    let raw = meta[key];
    if (raw === undefined && obj.note) {
        const m = String(obj.note).match(new RegExp("<" + key + ":\\s*([\\d.]+)\\s*>", "i"));
        raw = m ? m[1] : undefined;
    }
    return raw === undefined || raw === true ? NaN : Number(raw);
}

function btStates(battler) {
    return battler && typeof battler.states === "function" ? battler.states() : [];
}

function btFactor(battler, key) {
    let factor = 1;
    for (const state of btStates(battler)) {
        const n = btTagNumber(state, key);
        if (n >= 0 && n < 100) factor = Math.min(factor, n / 100);
    }
    return factor;
}

BT.slowFactor = battler => btFactor(battler, "BulletTimeSlow");
BT.hitboxFactor = battler => btFactor(battler, "BulletTimeHitbox");
BT.hasBulletTime = battler => BT.slowFactor(battler) < 1 || BT.hitboxFactor(battler) < 1;

BT.damageScale = function(hits) {
    const n = Math.max(0, Number(hits) || 0);
    return Math.min(BT.SCALE_MAX, BT.SCALE_BASE + BT.SCALE_PER_HIT * n);
};

BT.isTagged = function(item) {
    if (!item) return false;
    if (item.meta && item.meta.BulletHell) return true;
    return /<BulletHell>/i.test(String(item.note || ""));
};

BT.opensPsiDodge = function(item) {
    return !!(item && Array.isArray(item.effects) &&
        item.effects.some(e => e && e.code === 44 && e.dataId === BT.PSI_DODGE_EVENT));
};

// Whether a dodge field can open right now. MapBattleMode fights on Scene_Map,
// which has no field to open, so there the tag stays a normal hit.
BT.canOpenField = function() {
    const mbm = window.MapBattleMode;
    if (mbm && typeof mbm.isActive === "function" && mbm.isActive()) return false;
    if (BattleManager._bulletHellMode) return false;
    const scene = SceneManager._scene;
    if (!scene || typeof Scene_Battle === "undefined" || !(scene instanceof Scene_Battle)) return false;
    return typeof scene.startBulletHell === "function";
};

BT.pickDodger = function(targets) {
    const actors = (targets || []).filter((t, i, all) =>
        t && t.isActor && t.isActor() && t.isAlive() && all.indexOf(t) === i);
    return actors.find(a => BT.hasBulletTime(a)) || actors[0] || null;
};

function btItemName(item) {
    const name = item ? item.name : "";
    return typeof window.translateText === "function" ? window.translateText(name) : name;
}

// Opens the dodge for an announced <BulletHell> action. Returns whether it did.
BT.tryOpenDodge = function(subject, action, targets) {
    if (!subject || !action || typeof subject.isEnemy !== "function" || !subject.isEnemy()) return false;
    if (!subject.isAlive()) return false;
    const item = action.item();
    if (!BT.isTagged(item)) return false;
    if (action._statReqFumbled || action._actionFailed) return false;
    if (!BT.canOpenField()) return false;
    const actor = BT.pickDodger(targets);
    if (!actor) return false;

    BT._session = { action: action, subject: subject, actor: actor, item: item, hits: 0, open: true, scale: 1 };
    $gameTemp.bulletHellParams = {
        duration: BT.DODGE_FRAMES, playerImage: "", playerSpeed: 5,
        bulletDamage: 10, enemyBulletDamage: 5,
        playerHitSE: "", enemyHitSE: "", enemyHitSE2: "", enemyHitSE3: "", bulletCollisionSE: "",
        actor: actor, enemy: subject, bulletTime: true
    };
    BattleManager.startBulletHell();
    if (!BattleManager._bulletHellMode) {
        BT._session = null;
        $gameTemp.bulletHellParams = null;
        return false;
    }
    safeBattleLog(T('Battle.bulletTime.dodgeStart', { actor: actor.name(), skill: btItemName(item) }));
    return true;
};

// The action is announced: a tagged enemy ultimate opens its dodge, and an
// actor's PSI Blast is remembered so its dodge is flown by the caster.
const _BattleManager_startAction_BT = BattleManager.startAction;
BattleManager.startAction = function() {
    _BattleManager_startAction_BT.call(this);
    const subject = this._subject;
    const action = this._action;
    const item = action && action.item ? action.item() : null;
    BT._lastCaster = subject && subject.isActor && subject.isActor() && BT.opensPsiDodge(item) ? subject : null;
    BT.tryOpenDodge(subject, action, this._targets);
};

// The field has closed: a tagged action now knows how hard it lands.
const _BattleManager_finishBulletHell_BT = BattleManager.finishBulletHell;
BattleManager.finishBulletHell = function() {
    const session = BT._session && BT._session.open ? BT._session : null;
    _BattleManager_finishBulletHell_BT.call(this);
    if (!session) return;
    session.open = false;
    session.scale = BT.damageScale(session.hits);
    if (!session.subject.isAlive()) {
        if (this._action === session.action) this._targets = [];
        safeBattleLog(T('Battle.bulletTime.dodgeBroken', { enemy: session.subject.name(), skill: btItemName(session.item) }));
        return;
    }
    safeBattleLog(T('Battle.bulletTime.dodgeResult', {
        actor: session.actor.name(), hits: session.hits,
        skill: btItemName(session.item), pct: Math.round(session.scale * 100)
    }));
};

const _BattleManager_endAction_BT = BattleManager.endAction;
BattleManager.endAction = function() {
    if (BT._session && !BT._session.open) BT._session = null;
    _BattleManager_endAction_BT.call(this);
};

const _BattleManager_setup_BT = BattleManager.setup;
BattleManager.setup = function(troopId, canEscape, canLose) {
    BT._session = null;
    BT._lastCaster = null;
    _BattleManager_setup_BT.call(this, troopId, canEscape, canLose);
};

// The blow of a dodged action, scaled by the hits counted in its dodge.
const _Game_Action_makeDamageValue_BT = Game_Action.prototype.makeDamageValue;
Game_Action.prototype.makeDamageValue = function(target, critical) {
    const value = _Game_Action_makeDamageValue_BT.call(this, target, critical);
    const session = BT._session;
    if (!session || session.open || session.action !== this) return value;
    if (!target || !target.isActor || !target.isActor()) return value;
    return Math.round(value * session.scale);
};

// The dodge is fought against the enemy that threw the skill, when it has one.
const _Scene_Battle_bulletHellTargetSprite_BT = Scene_Battle.prototype.bulletHellTargetSprite;
Scene_Battle.prototype.bulletHellTargetSprite = function() {
    const params = $gameTemp && $gameTemp.bulletHellParams;
    const wanted = params && params.enemy;
    const sprites = (this._spriteset && this._spriteset._enemySprites) || [];
    if (wanted && wanted.isAlive()) {
        const own = sprites.find(s => s && s._battler === wanted);
        if (own) return own;
    }
    return _Scene_Battle_bulletHellTargetSprite_BT.call(this);
};

// Who flies the craft: the target of a tagged skill, the caster of a PSI Blast,
// or the first battle member as before.
BT.dodgerFor = function(params) {
    const members = $gameParty.battleMembers();
    const ok = a => a && a.isAlive() && members.includes(a);
    if (params && ok(params.actor)) return params.actor;
    if (ok(BT._lastCaster)) return BT._lastCaster;
    return members[0] || null;
};

const _BulletHellLayer_initialize_BT = BulletHellLayer.prototype.initialize;
BulletHellLayer.prototype.initialize = function(params, enemySprite) {
    _BulletHellLayer_initialize_BT.call(this, params, enemySprite);
    const pilot = BT.dodgerFor(params);
    if (pilot && pilot !== this._player) {
        this._player = pilot;
        this._playerLuck = pilot.luk;
    }
    BT._lastCaster = null;
    this._btTagged = !!(params && params.bulletTime);
    this._btHits = 0;
    this._btSlow = BT.slowFactor(this._player);
    this._btSpawnCredit = 0;
    if (this._playerHitbox) {
        this._playerHitbox.radius = BT.HIT_RADIUS * BT.hitboxFactor(this._player);
    }
    this._lastHealthPct = undefined;
    this._btShownHits = undefined;
    this.updateHealthDisplay();
};

// Bullet Time: fewer volleys...
const _BulletHellLayer_spawnEnemyBullets_BT = BulletHellLayer.prototype.spawnEnemyBullets;
BulletHellLayer.prototype.spawnEnemyBullets = function() {
    if (this._btSlow < 1) {
        this._btSpawnCredit += this._btSlow;
        if (this._btSpawnCredit < 1) return;
        this._btSpawnCredit -= 1;
    }
    _BulletHellLayer_spawnEnemyBullets_BT.apply(this, arguments);
};

// ...and slower shots.
const _BulletHellLayer_createEnemyBullet_BT = BulletHellLayer.prototype.createEnemyBullet;
BulletHellLayer.prototype.createEnemyBullet = function() {
    const before = this._enemyBullets.length;
    _BulletHellLayer_createEnemyBullet_BT.apply(this, arguments);
    if (!(this._btSlow < 1) || this._enemyBullets.length <= before) return;
    const bullet = this._enemyBullets[this._enemyBullets.length - 1];
    bullet.vx *= this._btSlow;
    bullet.vy *= this._btSlow;
};

// In a tagged dodge a hit is counted instead of paid for.
const _BulletHellLayer_playerHit_BT = BulletHellLayer.prototype.playerHit;
BulletHellLayer.prototype.playerHit = function() {
    if (!this._btTagged) {
        _BulletHellLayer_playerHit_BT.call(this);
        return;
    }
    this._btHits++;
    if (BT._session && BT._session.open) BT._session.hits = this._btHits;
    const ship = this._playerShip;
    if (ship) {
        ship.filters = [this.createBlinkFilter()];
        setTimeout(() => { if (ship) ship.filters = null; }, 200);
    }
    this.updateHealthDisplay();
};

// The label over the craft counts hits in a tagged dodge, health otherwise.
const _BulletHellLayer_updateHealthDisplay_BT = BulletHellLayer.prototype.updateHealthDisplay;
BulletHellLayer.prototype.updateHealthDisplay = function() {
    if (!this._btTagged) {
        _BulletHellLayer_updateHealthDisplay_BT.call(this);
        return;
    }
    if (!this._healthDisplay || !this._healthDisplay.bitmap) return;
    const hits = this._btHits || 0;
    if (hits === this._btShownHits) return;
    this._btShownHits = hits;
    const bitmap = this._healthDisplay.bitmap;
    bitmap.clear();
    bitmap.fontSize = 16;
    bitmap.textColor = this.getHealthColor(Math.max(0, 100 - Math.round(BT.damageScale(hits) / BT.SCALE_MAX * 100)));
    bitmap.outlineColor = "rgba(0, 0, 0, 0.8)";
    bitmap.outlineWidth = 4;
    bitmap.drawText(T('Battle.bulletTime.hitCounter', { hits: hits }), 0, 0, 60, 20, "center");
};

// The skill card's Special section (CategorizedBattleSkills.js) names what
// these skills do. That plugin loads after this one, so the provider is
// registered at boot, once, and only when SkillDetails is there to take it.
BT.grantedStates = function(skill) {
    const out = [];
    if (!skill) return out;
    for (const e of skill.effects || []) {
        if (e && e.code === 21 && e.dataId > 0) out.push($dataStates && $dataStates[e.dataId]);
    }
    const self = String(skill.note || "").match(/<SelfState:\s*(\d+)/i);
    if (self) out.push($dataStates && $dataStates[Number(self[1])]);
    return out.filter(Boolean);
};

BT.specialTags = function(skill) {
    const out = [];
    if (!skill) return out;
    const entry = (key) => ({ name: T('SkillsMenu.specialName.' + key), desc: T('SkillsMenu.special.' + key) });
    if (BT.isTagged(skill)) out.push(entry('bulletHell'));
    if (BT.opensPsiDodge(skill)) out.push(entry('psiDodge'));
    const granted = BT.grantedStates(skill);
    if (granted.some(st => { const n = btTagNumber(st, "BulletTimeSlow"); return n >= 0 && n < 100; })) {
        out.push(entry('slowsDodge'));
    }
    if (granted.some(st => { const n = btTagNumber(st, "BulletTimeHitbox"); return n >= 0 && n < 100; })) {
        out.push(entry('shrinksHitbox'));
    }
    return out;
};

BT.registerSpecial = function() {
    if (BT._specialRegistered) return true;
    const details = window.SkillDetails;
    if (!details || typeof details.registerSpecial !== "function") return false;
    details.registerSpecial(skill => BT.specialTags(skill));
    BT._specialRegistered = true;
    return true;
};

if (typeof Scene_Boot !== "undefined") {
    const _Scene_Boot_start_BT = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        BT.registerSpecial();
        _Scene_Boot_start_BT.apply(this, arguments);
    };
}

BT._Layer = BulletHellLayer;

// ===== end BulletTime =====

})();