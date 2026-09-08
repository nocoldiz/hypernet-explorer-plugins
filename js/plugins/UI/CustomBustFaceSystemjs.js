/*:
 * @target MZ
 * @plugindesc Custom Bust Face System v1.2.0 (SpritesAssociation support)
 * @author Omni-Lex
 * @version 1.2.0
 * @description Replaces default face system with custom bust images. Uses SpritesAssociation mapping from DB.js for automatic bust lookup. Supports monster battler images from variables 106-109.
 *
 * @help CustomBustFaceSystem.js
 *
 * This plugin replaces the default RPG Maker face system with a custom
 * bust system that automatically maps character sprites to bust images.
 *
 * AUTOMATIC SPRITE-TO-BUST MAPPING:
 * The system uses SpritesAssociation from DB.js to automatically map character
 * spritesheet names to bust image names. Each bust image should be 64x64 pixels.
 *
 * Bust images are loaded from: /img/busts/{bust_name}.png
 *
 * CUSTOM BUST AND BATTLER IMAGES:
 * For normal characters, bust images can be set via variables:
 * - Variable 109: Actor 1 bust image name (e.g., "7")
 * - Variable 117: Actor 2 bust image name
 * - Variable 118: Actor 3 bust image name
 *
 * For monster characters or custom creatures, battler images can be set via variables:
 * - Variable 106: Actor 1 battler image (e.g., "img/enemies/BattlerName")
 * - Variable 107: Actor 2 battler image
 * - Variable 108: Actor 3 battler image
 *
 * Creature mode switches (when ON, use battler images instead of busts):
 * - Switch 77: Actor 1 is creature
 * - Switch 78: Actor 2 is creature
 * - Switch 79: Actor 3 is creature
 *
 * LOADING PRIORITY FOR EACH ACTOR:
 * 1. Bust name from Variable (109/117/118)
 * 2. If creature switch (77/78/79) is ON: Battler path from Variable (106/107/108)
 * 3. SpritesAssociation bust mapping (from character sprite sheet name)
 * 4. Fallback: default bust "7"
 *
 * No plugin parameters required. Works automatically once DB.js is loaded.
 *
 * License: Free for commercial and non-commercial use.
 */

(() => {
    'use strict';

    // Store original methods
    const _Window_Base_drawActorFace = Window_Base.prototype.drawActorFace;
    const _Window_StatusBase_drawActorFace = Window_StatusBase.prototype.drawActorFace;
    const SpritesAssociation = (window.Sprites && window.Sprites.SpritesAssociation) || {};

    // Define addErrorListener on Bitmap prototype if not already present
    if (!Bitmap.prototype.addErrorListener) {
        Bitmap.prototype.addErrorListener = function (listener) {
            if (!this._errorListeners) {
                this._errorListeners = [];
            }
            this._errorListeners.push(listener);
        };
    }

    // Override Bitmap.prototype._onError to handle face and bust load failures gracefully
    const _Bitmap_prototype__onError = Bitmap.prototype._onError;
    Bitmap.prototype._onError = function () {
        if (this._url && (this._url.includes('img/busts/') || this._url.includes('img/faces/') || this._url.includes('img/enemies/'))) {
            console.warn(`CustomBustFaceSystem: Image failed to load: ${this._url}. Falling back to 7.png.`);

            // Determine fallback URL based on type
            let fallbackUrl = 'img/busts/7.png';
            if (this._url.includes('img/busts/')) {
                fallbackUrl = 'img/busts/7.png';
            } else if (this._url.includes('img/enemies/')) {
                fallbackUrl = 'img/busts/7.png';
            }
            
            // Prevent infinite loop if fallback itself is missing
            if (this._url !== fallbackUrl) {
                this._url = fallbackUrl;
                this._loadingState = "loading";
                try {
                    this._startLoading();
                    return;
                } catch (e) {
                    console.error("CustomBustFaceSystem: Failed to start loading fallback image", e);
                }
            }
        }

        // Call original error handler
        if (_Bitmap_prototype__onError) {
            _Bitmap_prototype__onError.call(this);
        }

        // Call any registered error listeners
        if (this._errorListeners) {
            while (this._errorListeners.length > 0) {
                const listener = this._errorListeners.shift();
                try {
                    listener(this);
                } catch (e) {
                    console.error("CustomBustFaceSystem: Error in error listener", e);
                }
            }
        }
    };

    // Helper: synchronously check if an image file exists on disk (NW.js desktop).
    // On non-NW.js (web) builds we cannot stat the filesystem, so we optimistically
    // return true and let the runtime onError fallback handle any missing file.
    let _imgFs = null;
    let _imgRoot = null;
    function imageExists(folder, name) {
        try {
            if (!(window.Utils && Utils.isNwjs && Utils.isNwjs())) {
                return true;
            }
            if (!_imgFs) {
                _imgFs = require('fs');
                const path = require('path');
                _imgRoot = path.dirname(process.mainModule.filename);
            }
            const path = require('path');
            const file = path.join(_imgRoot, folder, decodeURIComponent(name) + '.png');
            return _imgFs.existsSync(file);
        } catch (e) {
            // If anything goes wrong with the check, assume it exists and defer to onError.
            return true;
        }
    }

    // Resolve a creature/monster battler image. The recruited-NPC flow stores a bust
    // name (e.g. "ForestRanger") in the battler variable, but no matching enemy art may
    // exist. Prefer img/enemies/<name>, then the same-named bust, so we never request a
    // file we know is absent (which would log a load-failure warning).
    function resolveCreatureImagePath(name) {
        if (imageExists('img/enemies/', name)) {
            return `img/enemies/${name}`;
        }
        const bustName = window.BustPath.resolve(name);
        if (bustName) {
            return `img/busts/${bustName}`;
        }
        return null; // Caller falls through to SpritesAssociation / default bust.
    }

    // Helper function to get bust image path
    function getBustImagePath(actor) {
        if (!actor._characterName || actor._characterName === '') {
            return null; // Return null instead of fallback path
        }

        const characterName = actor._characterName;
        const spriteIndex = actor._characterIndex || 0;
        const actorId = actor.actorId ? actor.actorId() : 1;

        // Player 1 (Actor 1) special handling
        if (actorId === 1) {
            // Priority 1: Check Variable 109 (Player 1 bust name)
            const player1BustName = $gameActors.actor(1).vnBust();
            if (player1BustName && player1BustName !== "") {
                const resolved = window.BustPath.resolve(player1BustName);
                if (resolved) return `img/busts/${resolved}`;
            }

            // Priority 2: If Switch 77 is ON, use Variable 106 for monster form
            if ($gameSwitches.value(77)) {
                const player1MonsterName = $gameActors.actor(1).vnBattler();
                if (player1MonsterName && player1MonsterName !== "") {
                    const resolved = resolveCreatureImagePath(player1MonsterName);
                    if (resolved) return resolved;
                }
            }

            // Priority 3: Fall back to SpritesAssociation
            if (characterName && window.Sprites && SpritesAssociation) {
                const spritesheetName = characterName.split('.')[0];

                if (SpritesAssociation[spritesheetName] &&
                    SpritesAssociation[spritesheetName][spriteIndex]) {
                    const bustName = window.BustPath.resolve(SpritesAssociation[spritesheetName][spriteIndex]);
                    if (bustName) return `img/busts/${bustName}`;
                }
            }

            return `img/busts/7`;
        }

        // Player 2 (Actor 2) special handling
        if (actorId === 2) {
            // Priority 1: Check Variable 117 (Player 2 bust name)
            const player2BustName = $gameActors.actor(2).vnBust();
            if (player2BustName && player2BustName !== "") {
                const resolved = window.BustPath.resolve(player2BustName);
                if (resolved) return `img/busts/${resolved}`;
            }

            // Priority 2: If Switch 78 is ON, use Variable 107 for monster form
            if ($gameSwitches.value(78)) {
                const player2MonsterName = $gameActors.actor(2).vnBattler();
                if (player2MonsterName && player2MonsterName !== "") {
                    const resolved = resolveCreatureImagePath(player2MonsterName);
                    if (resolved) return resolved;
                }
            }

            // Priority 3: Fall back to SpritesAssociation
            if (characterName && window.Sprites && SpritesAssociation) {
                const spritesheetName = characterName.split('.')[0];

                if (SpritesAssociation[spritesheetName] &&
                    SpritesAssociation[spritesheetName][spriteIndex]) {
                    const bustName = window.BustPath.resolve(SpritesAssociation[spritesheetName][spriteIndex]);
                    if (bustName) return `img/busts/${bustName}`;
                }
            }

            return `img/busts/7`;
        }

        // Player 3 (Actor 3) special handling
        if (actorId === 3) {
            // Priority 1: Check Variable 118 (Player 3 bust name)
            const player3BustName = $gameActors.actor(3).vnBust();
            if (player3BustName && player3BustName !== "") {
                const resolved = window.BustPath.resolve(player3BustName);
                if (resolved) return `img/busts/${resolved}`;
            }

            // Priority 2: If Switch 79 is ON, use Variable 108 for monster form
            if ($gameSwitches.value(79)) {
                const player3MonsterName = $gameActors.actor(3).vnBattler();
                if (player3MonsterName && player3MonsterName !== "") {
                    const resolved = resolveCreatureImagePath(player3MonsterName);
                    if (resolved) return resolved;
                }
            }

            // Priority 3: Fall back to SpritesAssociation
            if (characterName && window.Sprites && SpritesAssociation) {
                const spritesheetName = characterName.split('.')[0];

                if (SpritesAssociation[spritesheetName] &&
                    SpritesAssociation[spritesheetName][spriteIndex]) {
                    const bustName = window.BustPath.resolve(SpritesAssociation[spritesheetName][spriteIndex]);
                    if (bustName) return `img/busts/${bustName}`;
                }
            }

            return `img/busts/7`;
        }

        // Fallback to SpritesAssociation for any other actors
        if (characterName && window.Sprites && SpritesAssociation) {
            const spritesheetName = characterName.split('.')[0];

            if (SpritesAssociation[spritesheetName] &&
                SpritesAssociation[spritesheetName][spriteIndex]) {
                const bustName = window.BustPath.resolve(SpritesAssociation[spritesheetName][spriteIndex]);
                if (bustName) return `img/busts/${bustName}`;
            }
        }

        // Fallback to default bust path structure
        return `img/busts/7`;
    }

    // Helper function to load and draw bust image with blank fallback
    function drawBustImage(bitmap, actor, x, y, width, height) {
        try {
            const bustPath = getBustImagePath(actor);

            // Always clear the area first
            bitmap.clearRect(x, y, width, height);

            // If no valid path, use fallback directly without listeners
            if (!bustPath) {
                const fallbackBitmap = ImageManager.loadBitmap('img/busts/', '7');
                drawBustToCanvas(bitmap, fallbackBitmap, x, y, width, height, true);
                return true;
            }

            // Determine if this is an enemy image (don't crop) or bust image (crop)
            const shouldCrop = false;

            // Load the main bust image
            const bustBitmap = ImageManager.loadBitmap('', bustPath);

            bustBitmap.addLoadListener(() => {
                try {
                    // Check if the bitmap actually loaded successfully
                    if (bustBitmap.width > 0 && bustBitmap.height > 0) {
                        drawBustToCanvas(bitmap, bustBitmap, x, y, width, height, shouldCrop);
                    } else {
                        // Image failed to load, use fallback directly without listeners
                        console.log('CustomBustFaceSystem: Bust image not found, using fallback:', bustPath);
                        const fallbackBitmap = ImageManager.loadBitmap('img/busts/', '7');
                        drawBustToCanvas(bitmap, fallbackBitmap, x, y, width, height, true);
                    }
                } catch (err) {
                    console.error('CustomBustFaceSystem: Error in load listener:', err);
                }
            });

            // Fallback error handling if error listener exists
            if (bustBitmap.addErrorListener) {
                bustBitmap.addErrorListener(() => {
                    try {
                        console.log('CustomBustFaceSystem: Bust image failed to load, using fallback:', bustPath);
                        const fallbackBitmap = ImageManager.loadBitmap('img/busts/', '7');
                        drawBustToCanvas(bitmap, fallbackBitmap, x, y, width, height, true);
                    } catch (err) {
                        console.error('CustomBustFaceSystem: Error in error listener:', err);
                    }
                });
            }

            // If it is already ready and has valid dimensions, draw immediately
            if (bustBitmap.isReady() && bustBitmap.width > 0) {
                drawBustToCanvas(bitmap, bustBitmap, x, y, width, height, shouldCrop);
            }
        } catch (error) {
            console.error('CustomBustFaceSystem: Exception in drawBustImage:', error);
            try {
                const fallbackBitmap = ImageManager.loadBitmap('img/busts/', '7');
                drawBustToCanvas(bitmap, fallbackBitmap, x, y, width, height, true);
            } catch (fallbackError) {
                console.error('CustomBustFaceSystem: Fallback also failed:', fallbackError);
            }
        }

        return true;
    }

    // Helper function to draw bust image to canvas
    function drawBustToCanvas(bitmap, sourceBitmap, x, y, width, height, shouldCrop = true) {
        try {
            // Disable image smoothing for pixel-perfect rendering
            const context = bitmap.context;
            const oldSmoothing = context.imageSmoothingEnabled;
            context.imageSmoothingEnabled = false;

            // Clear drawing zone
            bitmap.clearRect(x, y, width, height);

            // 1. Draw beautiful soft parchment (#ecdcb9) backing card with rounded corners
            context.fillStyle = '#ecdcb9';
            const radius = 6;
            context.beginPath();
            context.moveTo(x + radius, y);
            context.lineTo(x + width - radius, y);
            context.quadraticCurveTo(x + width, y, x + width, y + radius);
            context.lineTo(x + width, y + height - radius);
            context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            context.lineTo(x + radius, y + height);
            context.quadraticCurveTo(x, y + height, x, y + height - radius);
            context.lineTo(x, y + radius);
            context.quadraticCurveTo(x, y, x + radius, y);
            context.closePath();
            context.fill();

            // 2. Add subtle aging tea-stained radial glow
            const grad = context.createRadialGradient(
                x + width / 2, y + height / 2, Math.min(width, height) / 4,
                x + width / 2, y + height / 2, Math.max(width, height) / 2
            );
            grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            grad.addColorStop(1, 'rgba(78, 38, 12, 0.12)');
            context.fillStyle = grad;
            context.fillRect(x, y, width, height);

            // 3. Draw D&D double outline rustic borders in deep mahogany (#4a2711)
            context.strokeStyle = '#4a2711';
            context.lineWidth = 2;
            context.strokeRect(x + 2, y + 2, width - 4, height - 4);

            context.strokeStyle = 'rgba(74, 39, 17, 0.4)';
            context.lineWidth = 1;
            context.strokeRect(x + 5, y + 5, width - 10, height - 10);

            // Get source image dimensions
            const sourceWidth = sourceBitmap.width > 0 ? sourceBitmap.width : 889;
            const sourceHeight = sourceBitmap.height > 0 ? sourceBitmap.height : 1200;

            let cropTop = 0;
            let croppedSourceWidth = sourceWidth;
            let croppedSourceHeight = sourceHeight;

            // Crop top 180 pixels only for bust images, not for enemy/monster images
            if (shouldCrop) {
                cropTop = 180;
                croppedSourceHeight = sourceHeight - cropTop;
            }

            const aspectRatio = croppedSourceWidth / croppedSourceHeight;

            // Calculate draw dimensions to fit within the display area while maintaining aspect ratio
            let drawWidth = width;
            let drawHeight = Math.round(width / aspectRatio);

            // If height exceeds available space, scale down
            if (drawHeight > height) {
                drawHeight = height;
                drawWidth = Math.round(height * aspectRatio);
            }

            // Center the image within the specified area
            const drawX = Math.round(x + (width - drawWidth) / 2);
            const drawY = Math.round(y + (height - drawHeight) / 2);

            // Draw the image (cropped if it's a bust, full if it's an enemy)
            bitmap.blt(sourceBitmap, 0, cropTop, croppedSourceWidth, croppedSourceHeight, drawX, drawY, drawWidth, drawHeight);

            // Restore original smoothing setting
            context.imageSmoothingEnabled = oldSmoothing;
        } catch (error) {
            console.log('CustomBustFaceSystem: Error drawing bust to canvas, leaving blank');
            // Don't throw error, just log it
        }
    }

    // Override Window_Base drawActorFace method
    Window_Base.prototype.drawActorFace = function (actor, x, y, width, height) {
        width = width || ImageManager.faceWidth;
        height = height || ImageManager.faceHeight;

        // Use our bust system with blank fallback
        drawBustImage(this.contents, actor, x, y, width, height);
    };

    // Override Window_StatusBase drawActorFace method (for status screens)
    Window_StatusBase.prototype.drawActorFace = function (actor, x, y, width, height) {
        width = width || ImageManager.faceWidth;
        height = height || ImageManager.faceHeight;

        // Use our bust system with blank fallback
        drawBustImage(this.contents, actor, x, y, width, height);
    };

    // Override ImageManager.loadFace to prevent loading default faces when using busts
    const _ImageManager_loadFace = ImageManager.loadFace;
    ImageManager.loadFace = function (filename) {
        // Check if we're trying to load a face for an actor that should use busts
        // This is a bit tricky since we don't have direct actor context here
        // We'll let the original method handle it and rely on our drawActorFace overrides
        return _ImageManager_loadFace.call(this, filename);
    };

    // Helper method to preload bust images (optional, for performance)
    function preloadBustImages() {
        try {
            // Preload from SpritesAssociation if available
            if (window.Sprites && SpritesAssociation) {
                Object.keys(SpritesAssociation).forEach(spritesheetName => {
                    try {
                        const bustIndices = SpritesAssociation[spritesheetName];
                        Object.keys(bustIndices).forEach(index => {
                            // Through BustPath, so a catalogue entry whose file
                            // is not there (or has moved into presets/) is never
                            // asked for: an errored bitmap sitting in the cache
                            // is what turns the next scene into a load error.
                            const bustName = window.BustPath
                                ? window.BustPath.resolve(bustIndices[index])
                                : bustIndices[index];
                            if (!bustName) return;
                            const path = `img/busts/${bustName}`;
                            // Silently attempt to preload, don't log errors
                            const bitmap = ImageManager.loadBitmap('', path);
                            bitmap.addErrorListener(() => {
                                // Silently handle preload errors
                            });
                        });
                    } catch (error) {
                        // Silently handle preload errors for individual sprite sheets
                    }
                });
            }

            // Also preload fallback bust if available
            try {
                const fallbackBitmap = ImageManager.loadBitmap('img/busts/', '7');
                fallbackBitmap.addErrorListener(() => {
                    // Silently handle fallback preload errors
                });
            } catch (error) {
                // Silently handle fallback preload errors
            }
        } catch (error) {
            console.log('CustomBustFaceSystem: Error in preloadBustImages, continuing anyway');
        }
    }

    // Preload bust images when the game starts
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function () {
        _Scene_Boot_start.call(this);
        preloadBustImages();
    };




    // Handle character graphic changes.
    // The base setter already writes _characterName / _characterIndex, so the
    // stored values need no second assignment here, and writing the raw
    // arguments back over them is not harmless: DataService repoints a sheet
    // retired by the single-character split before it stores it, and this
    // plugin loads after it, so re-stamping the arguments put the dead joined
    // sheet back on the actor.
    const _Game_Actor_setCharacterImage = Game_Actor.prototype.setCharacterImage;
    Game_Actor.prototype.setCharacterImage = function (characterName, characterIndex) {
        _Game_Actor_setCharacterImage.call(this, characterName, characterIndex);
    };

    // ==========================================================================
    // D&D Parchment & Double Border Dialog Styling System
    // ==========================================================================

    function applyUIParchmentStyle(windowClass) {
        // Override _refreshBack to prevent drawing default windowskin background
        windowClass.prototype._refreshBack = function() {
            // Handled by our custom D&D background sprite
        };

        // Override _refreshFrame to prevent drawing default windowskin border
        windowClass.prototype._refreshFrame = function() {
            // Handled by our custom D&D background sprite
        };

        // Hook into initialize to create our custom background sprite
        const _initialize = windowClass.prototype.initialize;
        windowClass.prototype.initialize = function() {
            _initialize.apply(this, arguments);
            this.createUIParchment();
        };

        // Create the D&D parchment and double border sprite
        windowClass.prototype.createUIParchment = function() {
            if (this._dndParchmentSprite) {
                this.removeChild(this._dndParchmentSprite);
            }
            this._dndParchmentSprite = new Sprite();
            // Add as first child to sit nicely behind everything else (text contents)
            this.addChildAt(this._dndParchmentSprite, 0);
            this.refreshUIParchment();
        };

        // Redraw the parchment whenever dimensions change
        windowClass.prototype.refreshUIParchment = function() {
            const w = this.width;
            const h = this.height;
            if (w <= 0 || h <= 0) return;

            const bitmap = new Bitmap(w, h);
            const ctx = bitmap.context;

            // Draw soft aged parchment color (#ecdcb9)
            ctx.fillStyle = '#ecdcb9';
            const radius = 6;
            ctx.beginPath();
            ctx.moveTo(radius, 0);
            ctx.lineTo(w - radius, 0);
            ctx.quadraticCurveTo(w, 0, w, radius);
            ctx.lineTo(w, h - radius);
            ctx.quadraticCurveTo(w, h, w - radius, h);
            ctx.lineTo(radius, h);
            ctx.quadraticCurveTo(0, h, 0, h - radius);
            ctx.lineTo(0, radius);
            ctx.quadraticCurveTo(0, 0, radius, 0);
            ctx.closePath();
            ctx.fill();

            // Overlay faint tea-stained texture shading
            ctx.fillStyle = 'rgba(139, 90, 43, 0.04)';
            ctx.fillRect(0, 0, w, h);
            
            // Faint aging shadow radial glow
            const grad = ctx.createRadialGradient(
                w / 2, h / 2, Math.min(w, h) / 4,
                w / 2, h / 2, Math.max(w, h) / 2
            );
            grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            grad.addColorStop(1, 'rgba(78, 38, 12, 0.12)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // Double outline borders in deep mahogany/crimson (#4a2711)
            ctx.strokeStyle = '#4a2711';
            
            // Outer solid border
            ctx.lineWidth = 3;
            ctx.strokeRect(3, 3, w - 6, h - 6);

            // Inner thin border
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(74, 39, 17, 0.5)';
            ctx.strokeRect(7, 7, w - 14, h - 14);

            this._dndParchmentSprite.bitmap = bitmap;
        };

        // Hook into move/resize to refresh the parchment bitmap layout
        const _move = windowClass.prototype.move;
        windowClass.prototype.move = function(x, y, width, height) {
            const sizeChanged = this.width !== width || this.height !== height;
            _move.apply(this, arguments);
            if (sizeChanged && this._dndParchmentSprite) {
                this.refreshUIParchment();
            }
        };

        // Double check updates to catch delayed rendering initialization
        const _update = windowClass.prototype.update;
        windowClass.prototype.update = function() {
            _update.apply(this, arguments);
            if (!this._dndParchmentSprite) {
                this.createUIParchment();
            } else if (this._dndParchmentSprite.bitmap && 
                      (this._dndParchmentSprite.bitmap.width !== this.width || 
                       this._dndParchmentSprite.bitmap.height !== this.height)) {
                this.refreshUIParchment();
            }
        };
    }

    // Apply D&D styling to RPG Maker message boxes and choices
    applyUIParchmentStyle(Window_Message);
    applyUIParchmentStyle(Window_NameBox);
    applyUIParchmentStyle(Window_ChoiceList);
    applyUIParchmentStyle(Window_NumberInput);
    applyUIParchmentStyle(Window_EventItem);

    // ==========================================================================
    // Dialogue Typography & Colors Overrides (UI serif)
    // ==========================================================================

    // Dialogue text overrides (Window_Message)
    const _Window_Message_resetFontSettings = Window_Message.prototype.resetFontSettings;
    Window_Message.prototype.resetFontSettings = function() {
        _Window_Message_resetFontSettings.call(this);
        this.contents.fontFace = 'Bitter';
        this.contents.fontSize = 20; // neat and readable serif size
    };

    Window_Message.prototype.resetTextColor = function() {
        this.changeTextColor('#1a1a1a'); // charcoal standard dialogue body ink
    };

    // Speaker Name Box overrides (Window_NameBox)
    const _Window_NameBox_resetFontSettings = Window_NameBox.prototype.resetFontSettings;
    Window_NameBox.prototype.resetFontSettings = function() {
        _Window_NameBox_resetFontSettings.call(this);
        this.contents.fontFace = 'Bitter';
        this.contents.fontSize = 24; // bold gothic header size
    };

    Window_NameBox.prototype.resetTextColor = function() {
        this.changeTextColor('#58180D'); // crimson/mahogany focus speaker color
    };

    // Dialogue Choice Window overrides (Window_ChoiceList)
    const _Window_ChoiceList_resetFontSettings = Window_ChoiceList.prototype.resetFontSettings;
    Window_ChoiceList.prototype.resetFontSettings = function() {
        _Window_ChoiceList_resetFontSettings.call(this);
        this.contents.fontFace = 'Bitter';
    };

    Window_ChoiceList.prototype.resetTextColor = function() {
        this.changeTextColor('#1a1a1a'); // comfortable choice selection ink
    };

    // ==========================================================================
    // Visual Novel Speaker Name Window Hook (CharacterNameWindow)
    // ==========================================================================

    const _Window_Base_initialize = Window_Base.prototype.initialize;
    Window_Base.prototype.initialize = function(rect) {
        _Window_Base_initialize.apply(this, arguments);
        
        // Dynamically match VisualNovelBustSystem's private CharacterNameWindow
        if (this.constructor.name === "CharacterNameWindow") {
            // Disable default frame and background drawing
            this._refreshBack = function() {};
            this._refreshFrame = function() {};
            
            // Inject D&D style parchment backgrounds
            this.createUIParchment = function() {
                if (this._dndParchmentSprite) {
                    this.removeChild(this._dndParchmentSprite);
                }
                this._dndParchmentSprite = new Sprite();
                this.addChildAt(this._dndParchmentSprite, 0);
                this.refreshUIParchment();
            };

            this.refreshUIParchment = function() {
                const w = this.width;
                const h = this.height;
                if (w <= 0 || h <= 0) return;

                const bitmap = new Bitmap(w, h);
                const ctx = bitmap.context;

                // Soft parchment base (#ecdcb9)
                ctx.fillStyle = '#ecdcb9';
                const radius = 6;
                ctx.beginPath();
                ctx.moveTo(radius, 0);
                ctx.lineTo(w - radius, 0);
                ctx.quadraticCurveTo(w, 0, w, radius);
                ctx.lineTo(w, h - radius);
                ctx.quadraticCurveTo(w, h, w - radius, h);
                ctx.lineTo(radius, h);
                ctx.quadraticCurveTo(0, h, 0, h - radius);
                ctx.lineTo(0, radius);
                ctx.quadraticCurveTo(0, 0, radius, 0);
                ctx.closePath();
                ctx.fill();

                // Faint aged texture glow
                const grad = ctx.createRadialGradient(
                    w / 2, h / 2, Math.min(w, h) / 4,
                    w / 2, h / 2, Math.max(w, h) / 2
                );
                grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
                grad.addColorStop(1, 'rgba(78, 38, 12, 0.12)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);

                // Double crimson/mahogany border
                ctx.strokeStyle = '#4a2711';
                ctx.lineWidth = 3;
                ctx.strokeRect(3, 3, w - 6, h - 6);

                ctx.strokeStyle = 'rgba(74, 39, 17, 0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(7, 7, w - 14, h - 14);

                this._dndParchmentSprite.bitmap = bitmap;
            };

            const _moveNameWindow = this.move;
            this.move = function(x, y, width, height) {
                const sizeChanged = this.width !== width || this.height !== height;
                _moveNameWindow.apply(this, arguments);
                if (sizeChanged && this._dndParchmentSprite) {
                    this.refreshUIParchment();
                }
            };

            const _updateNameWindow = this.update;
            this.update = function() {
                _updateNameWindow.apply(this, arguments);
                if (!this._dndParchmentSprite) {
                    this.createUIParchment();
                } else if (this._dndParchmentSprite.bitmap && 
                          (this._dndParchmentSprite.bitmap.width !== this.width || 
                           this._dndParchmentSprite.bitmap.height !== this.height)) {
                    this.refreshUIParchment();
                }
            };

            this.createUIParchment();

            // Override font to use the UI serif in crimson for character names
            this.resetFontSettings = function() {
                Window_Base.prototype.resetFontSettings.call(this);
                this.contents.fontFace = 'Bitter';
                this.contents.fontSize = 24;
            };
            this.resetTextColor = function() {
                this.changeTextColor('#58180D');
            };
            this.resetFontSettings();
        }
    };

})();