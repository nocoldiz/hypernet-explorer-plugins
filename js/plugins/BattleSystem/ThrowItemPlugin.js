/*:
 * @target MZ
 * @plugindesc Throw Item Plugin v1.0.0
 * @author OmniLexrName
 * @url 
 * @help
 * ============================================================================
 * Throw Item Plugin for RPG Maker MZ
 * ============================================================================
 * 
 * This plugin allows players to throw items, weapons, and armor on the map.
 * Items are thrown with physics simulation based on their weight.
 * 
 * Features:
 * - Throw items up to 8 tiles away
 * - Diagonal throwing support
 * - Physics simulation based on item weight
 * - Items persist on maps
 * - Pick up thrown items
 * - Visual targeting system
 * 
 * Note Tags:
 * <Weight: X> - Set item weight in grams (default: 100)
 * 
 * Plugin Commands:
 * - Throw Item: Start the throwing process for a specific item
 * 
 * @command throwItem
 * @text Throw Item
 * @desc Start the throwing process for an item
 * 
 * @arg itemId
 * @text Item ID
 * @desc ID of the item to throw
 * @type number
 * @default 1
 * 
 * @arg itemType
 * @text Item Type
 * @desc Type of item to throw
 * @type select
 * @option Item
 * @value item
 * @option Weapon
 * @value weapon
 * @option Armor
 * @value armor
 * @default item
 */

(() => {
    'use strict';
    
    const pluginName = 'ThrowItemPlugin';
    
    // Storage for thrown items
    const ThrownItemManager = {
        items: {},
        
        initialize() {
            this.items = {};
        },
        
        addItem(mapId, x, y, itemData) {
            if (!this.items[mapId]) {
                this.items[mapId] = [];
            }
            this.items[mapId].push({
                x: x,
                y: y,
                itemType: itemData.itemType,
                itemId: itemData.itemId,
                iconIndex: itemData.iconIndex
            });
        },
        
        removeItem(mapId, x, y) {
            if (!this.items[mapId]) return null;
            
            const index = this.items[mapId].findIndex(item => 
                item.x === x && item.y === y
            );
            
            if (index >= 0) {
                return this.items[mapId].splice(index, 1)[0];
            }
            return null;
        },
        
        getItem(mapId, x, y) {
            if (!this.items[mapId]) return null;
            
            return this.items[mapId].find(item => 
                item.x === x && item.y === y
            );
        },
        
        getItemsForMap(mapId) {
            return this.items[mapId] || [];
        }
    };
    
    // Initialize thrown item manager
    ThrownItemManager.initialize();
    
    // Save and load thrown items
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.thrownItems = ThrownItemManager.items;
        return contents;
    };
    
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        ThrownItemManager.items = contents.thrownItems || {};
    };
    
    
    // Throw animation sprite
    class Sprite_ThrowAnimation extends Sprite {
        constructor(itemData, trajectory, finalPos) {
            super();
            this._itemData = itemData;
            this._trajectory = trajectory;
            this._finalPos = finalPos;
            this._currentStep = 0;
            this._animationSpeed = 4; // Frames per trajectory step
            this._frameCount = 0;
            this._completionCallback = null;
            this._startX = $gamePlayer.x;
            this._startY = $gamePlayer.y;

            this.createBitmap();
            this.updatePosition();

            this.anchor.x = 0.5;
            this.anchor.y = 0.5;
            this.z = 7; // Above characters
        }

        createBitmap() {
            const iconIndex = this._itemData.iconIndex;
            const iconBitmap = ImageManager.loadSystem('IconSet');

            iconBitmap.addLoadListener(() => {
                this.bitmap = new Bitmap(32, 32);
                const pw = 32;
                const ph = 32;
                const sx = (iconIndex % 16) * pw;
                const sy = Math.floor(iconIndex / 16) * ph;
                this.bitmap.blt(iconBitmap, sx, sy, pw, ph, 0, 0);
            });
        }

        setCompletionCallback(callback) {
            this._completionCallback = callback;
        }

        update() {
            super.update();

            if (!this.bitmap || !this.bitmap.isReady()) return;

            this._frameCount++;

            if (this._frameCount >= this._animationSpeed) {
                this._frameCount = 0;
                this._currentStep++;

                if (this._currentStep >= this._trajectory.length) {
                    // Animation complete
                    this.onAnimationComplete();
                    return;
                }

                this.updatePosition();
            } else {
                // Interpolate between current and next position
                this.updateInterpolatedPosition();
            }

            // Add rotation for visual effect
            this.rotation += 0.2;
        }

        updatePosition() {
            const tileSize = 48;
            let currentPos;

            if (this._currentStep === 0) {
                currentPos = { x: this._startX, y: this._startY };
            } else {
                currentPos = this._trajectory[this._currentStep - 1];
            }

            this.x = $gameMap.adjustX(currentPos.x) * tileSize + tileSize / 2;
            this.y = $gameMap.adjustY(currentPos.y) * tileSize + tileSize / 2;

            // Add arc effect (parabolic trajectory)
            const progress = this._currentStep / Math.max(1, this._trajectory.length);
            const arcHeight = 24 * Math.sin(progress * Math.PI);
            this.y -= arcHeight;
        }

        updateInterpolatedPosition() {
            if (this._currentStep >= this._trajectory.length) return;

            const tileSize = 48;
            const progress = this._frameCount / this._animationSpeed;

            let currentPos, nextPos;

            if (this._currentStep === 0) {
                currentPos = { x: this._startX, y: this._startY };
                nextPos = this._trajectory[0];
            } else {
                currentPos = this._trajectory[this._currentStep - 1];
                nextPos = this._trajectory[this._currentStep];
            }

            const currentX = $gameMap.adjustX(currentPos.x) * tileSize + tileSize / 2;
            const currentY = $gameMap.adjustY(currentPos.y) * tileSize + tileSize / 2;
            const nextX = $gameMap.adjustX(nextPos.x) * tileSize + tileSize / 2;
            const nextY = $gameMap.adjustY(nextPos.y) * tileSize + tileSize / 2;

            this.x = currentX + (nextX - currentX) * progress;
            this.y = currentY + (nextY - currentY) * progress;

            // Add arc effect (parabolic trajectory)
            const stepProgress = (this._currentStep + progress) / Math.max(1, this._trajectory.length);
            const arcHeight = 24 * Math.sin(stepProgress * Math.PI);
            this.y -= arcHeight;
        }

        onAnimationComplete() {
            // Call completion callback
            if (this._completionCallback) {
                this._completionCallback();
            }

            // Remove self from scene
            if (this.parent) {
                this.parent.removeChild(this);
            }
        }
    }

    // Thrown item sprite
    class Sprite_ThrownItem extends Sprite {
        constructor(x, y, itemData) {
            super();
            this._tileX = x;
            this._tileY = y;
            this._itemData = itemData;
            this.createBitmap();
            this.updatePosition();
        }
        
        createBitmap() {
            const iconIndex = this._itemData.iconIndex;
            const iconBitmap = ImageManager.loadSystem('IconSet');
            
            iconBitmap.addLoadListener(() => {
                this.bitmap = new Bitmap(32, 32);
                const pw = 32;
                const ph = 32;
                const sx = (iconIndex % 16) * pw;
                const sy = Math.floor(iconIndex / 16) * ph;
                this.bitmap.blt(iconBitmap, sx, sy, pw, ph, 0, 0);
            });
            
            this.anchor.x = 0.5;
            this.anchor.y = 1;
        }
        
        update() {
            super.update();
            this.updatePosition();
        }
        
        updatePosition() {
            const tileSize = 48;
            this.x = $gameMap.adjustX(this._tileX) * tileSize + tileSize / 2;
            this.y = $gameMap.adjustY(this._tileY) * tileSize + tileSize - 8;
        }
    }
    
    // Extend Spriteset_Map to handle thrown items
    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _Spriteset_Map_createLowerLayer.call(this);
        this.createThrownItems();
    };
    
    Spriteset_Map.prototype.createThrownItems = function() {
        // Remove any previously created sprites first. This runs from both
        // createLowerLayer and the onMapLoaded alias, so without this cleanup the
        // thrown-item sprites would be duplicated on the tilemap per map load.
        if (this._thrownItemSprites) {
            this._thrownItemSprites.forEach(sprite => {
                if (sprite.parent) sprite.parent.removeChild(sprite);
                if (sprite.destroy) sprite.destroy();
            });
        }
        this._thrownItemSprites = [];
        const items = ThrownItemManager.getItemsForMap($gameMap.mapId());

        items.forEach(item => {
            this.createThrownItemSprite(item.x, item.y, item);
        });
    };
    
    Spriteset_Map.prototype.createThrownItemSprite = function(x, y, itemData) {
        const sprite = new Sprite_ThrownItem(x, y, itemData);
        this._tilemap.addChild(sprite);
        this._thrownItemSprites.push(sprite);
    };
    
    // Plugin command handler
    PluginManager.registerCommand(pluginName, 'throwItem', args => {
        const itemId = Number(args.itemId);
        const itemType = args.itemType;

        let item = null;
        let iconIndex = 0;

        switch (itemType) {
            case 'item':
                item = $dataItems[itemId];
                if ($gameParty.numItems(item) > 0) {
                    iconIndex = item.iconIndex;
                }
                break;
            case 'weapon':
                item = $dataWeapons[itemId];
                if ($gameParty.numItems(item) > 0) {
                    iconIndex = item.iconIndex;
                }
                break;
            case 'armor':
                item = $dataArmors[itemId];
                if ($gameParty.numItems(item) > 0) {
                    iconIndex = item.iconIndex;
                }
                break;
        }

        if (item && $gameParty.numItems(item) > 0) {
            const itemData = {
                itemType: itemType,
                itemId: itemId,
                iconIndex: iconIndex
            };

            // Save pending throw item for map-based targeting
            $gameSystem._pendingThrowItem = itemData;

            // If currently on map, start targeting immediately
            if (SceneManager._scene instanceof Scene_Map) {
                SceneManager._scene.startThrowTargeting(itemData);
                $gameSystem._pendingThrowItem = null;
            }
        } else {
            window.skipLocalization = true;
            $gameMessage.add(T('Battle.throw.missingItem'));
            window.skipLocalization = false;
        }
    });
    
    // Handle picking up items
    const _Game_Player_checkEventTriggerHere = Game_Player.prototype.checkEventTriggerHere;
    Game_Player.prototype.checkEventTriggerHere = function(triggers) {
        _Game_Player_checkEventTriggerHere.call(this, triggers);
        
        if (triggers.includes(0)) { // Action button
            const item = ThrownItemManager.getItem($gameMap.mapId(), this.x, this.y);
            
            if (item) {
                this.pickUpItem(item);
            }
        }
    };
    
    Game_Player.prototype.pickUpItem = function(itemData) {
        window.skipLocalization = true;
        $gameMessage.add('\\>' + T('Battle.throw.pickUpPrompt'));
        window.skipLocalization = false;
        $gameMessage.setChoices([T('Battle.throw.pickUp'), T('Battle.throw.cancel')], 0, 1);
        $gameMessage.setChoiceCallback(n => {
            if (n === 0) {
                // Pick up the item
                let item = null;
                
                switch (itemData.itemType) {
                    case 'item':
                        item = $dataItems[itemData.itemId];
                        break;
                    case 'weapon':
                        item = $dataWeapons[itemData.itemId];
                        break;
                    case 'armor':
                        item = $dataArmors[itemData.itemId];
                        break;
                }
                
                if (item) {
                    $gameParty.gainItem(item, 1);
                    ThrownItemManager.removeItem($gameMap.mapId(), this.x, this.y);
                    
                    // Remove sprite from map
                    if (SceneManager._scene instanceof Scene_Map) {
                        const spriteset = SceneManager._scene._spriteset;
                        if (spriteset._thrownItemSprites) {
                            spriteset._thrownItemSprites = spriteset._thrownItemSprites.filter(sprite => {
                                if (sprite._tileX === this.x && sprite._tileY === this.y) {
                                    sprite.parent.removeChild(sprite);
                                    return false;
                                }
                                return true;
                            });
                        }
                    }
                    
                    window.skipLocalization = true;
                    $gameMessage.add(T('Battle.throw.pickedUp', { item: item.name }));
                    window.skipLocalization = false;
                    SoundManager.playOk();
                }
            }
        });
    };
    
    // Handle map transfer to load thrown items
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);

        // Recreate thrown item sprites for the new map
        if (this._spriteset) {
            this._spriteset.createThrownItems();
        }
    };

    // Check for pending throw item when map scene starts
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        // The _throwTargetingMode flag is persisted on $gamePlayer, but the
        // _throwTargeting state lives on Scene_Map. A map transfer while
        // targeting would create a fresh Scene_Map (no _throwTargeting) yet
        // leave the flag set, permanently freezing the player. Clear the stale
        // flag whenever no targeting session is actually active.
        if (!this._throwTargeting && $gamePlayer._throwTargetingMode) {
            $gamePlayer._throwTargetingMode = false;
        }

        // Check if there's a pending throw item from inventory
        if ($gameSystem._pendingThrowItem) {
            const itemData = $gameSystem._pendingThrowItem;
            $gameSystem._pendingThrowItem = null;

            // Start throw targeting mode
            this.startThrowTargeting(itemData);
        }
    };

    // Add throw targeting mode to Scene_Map
    Scene_Map.prototype.startThrowTargeting = function(itemData) {
        // Key items and materials never leave the bag, whichever menu asked.
        if (!ThrowService.isThrowable(ThrowService.resolve(itemData))) {
            SoundManager.playBuzzer();
            return;
        }

        // Calculate initial target position (tile in front of player)
        let initialX = $gamePlayer.x;
        let initialY = $gamePlayer.y;

        switch ($gamePlayer.direction()) {
            case 2: // Down
                initialY += 1;
                break;
            case 4: // Left
                initialX -= 1;
                break;
            case 6: // Right
                initialX += 1;
                break;
            case 8: // Up
                initialY -= 1;
                break;
        }

        this._throwTargeting = {
            active: true,
            itemData: itemData,
            targetX: initialX,
            targetY: initialY,
            maxRange: 8
        };

        // Create targeting sprites
        this.createThrowTargetingSprites();

        // Disable player movement
        $gamePlayer._throwTargetingMode = true;
    };

    Scene_Map.prototype.createThrowTargetingSprites = function() {
        if (!this._spriteset) return;

        // Create target cursor sprite
        this._targetCursorSprite = new Sprite();
        this._targetCursorSprite.bitmap = new Bitmap(48, 48);
        this._targetCursorSprite.bitmap.fillRect(0, 0, 48, 48, 'rgba(255, 255, 0, 0.5)');
        this._targetCursorSprite.bitmap.strokeRect(0, 0, 48, 48, 'rgba(255, 255, 0, 1)', 2);
        this._targetCursorSprite.anchor.x = 0;
        this._targetCursorSprite.anchor.y = 0;
        this._spriteset._tilemap.addChild(this._targetCursorSprite);

        // Update initial position
        this.updateTargetCursorPosition();
    };


    Scene_Map.prototype.updateTargetCursorPosition = function() {
        if (!this._targetCursorSprite || !this._throwTargeting) return;

        const tileSize = 48;
        const targetX = this._throwTargeting.targetX;
        const targetY = this._throwTargeting.targetY;

        // Use adjustX/adjustY to convert map coordinates to screen coordinates
        this._targetCursorSprite.x = $gameMap.adjustX(targetX) * tileSize;
        this._targetCursorSprite.y = $gameMap.adjustY(targetY) * tileSize;
    };

    Scene_Map.prototype.endThrowTargeting = function() {
        if (!this._throwTargeting) return;

        // Remove target cursor sprite (tilemap may already be destroyed on a
        // scene change, so guard the parent before removeChild).
        if (this._targetCursorSprite) {
            if (this._targetCursorSprite.parent) {
                this._targetCursorSprite.parent.removeChild(this._targetCursorSprite);
            }
            this._targetCursorSprite = null;
        }

        // Re-enable player movement
        $gamePlayer._throwTargetingMode = false;

        this._throwTargeting = null;
    };

    // Override Scene_Map update to handle throw targeting
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);

        if (this._throwTargeting && this._throwTargeting.active) {
            this.updateThrowTargeting();
        }
    };

    Scene_Map.prototype.updateThrowTargeting = function() {
        if (Input.isRepeated('up')) {
            this.moveThrowTarget(0, -1);
        }
        if (Input.isRepeated('down')) {
            this.moveThrowTarget(0, 1);
        }
        if (Input.isRepeated('left')) {
            this.moveThrowTarget(-1, 0);
        }
        if (Input.isRepeated('right')) {
            this.moveThrowTarget(1, 0);
        }

        if (Input.isTriggered('ok')) {
            this.confirmThrow();
        }
        if (Input.isTriggered('cancel')) {
            this.cancelThrow();
        }
    };

    Scene_Map.prototype.moveThrowTarget = function(dx, dy) {
        if (!this._throwTargeting) return;

        const newX = this._throwTargeting.targetX + dx;
        const newY = this._throwTargeting.targetY + dy;
        const distance = Math.abs(newX - $gamePlayer.x) + Math.abs(newY - $gamePlayer.y);

        if (distance <= this._throwTargeting.maxRange) {
            this._throwTargeting.targetX = newX;
            this._throwTargeting.targetY = newY;
            this.updateTargetCursorPosition();

            // Turn player to face the target tile
            this.turnPlayerTowardsTarget(newX, newY);

            SoundManager.playCursor();
        } else {
            SoundManager.playBuzzer();
        }
    };

    Scene_Map.prototype.confirmThrow = function() {
        if (!this._throwTargeting) return;

        const itemData = this._throwTargeting.itemData;
        const targetX = this._throwTargeting.targetX;
        const targetY = this._throwTargeting.targetY;

        // Calculate trajectory and throw item
        const weight = this.getThrowItemWeight(itemData);
        const trajectory = this.calculateThrowTrajectory(weight, targetX, targetY);

        if (trajectory.length > 0) {
            const finalPos = trajectory[trajectory.length - 1];

            // Remove item from inventory immediately
            this.removeThrowItemFromInventory(itemData);

            // Start throw animation
            this.animateThrow(itemData, trajectory, finalPos);
        }

        SoundManager.playOk();
        this.endThrowTargeting();
    };

    Scene_Map.prototype.turnPlayerTowardsTarget = function(targetX, targetY) {
        const playerX = $gamePlayer.x;
        const playerY = $gamePlayer.y;
        const dx = targetX - playerX;
        const dy = targetY - playerY;

        // Determine direction based on which axis has greater distance
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal movement is greater
            if (dx > 0) {
                $gamePlayer.setDirection(6); // Right
            } else if (dx < 0) {
                $gamePlayer.setDirection(4); // Left
            }
        } else if (Math.abs(dy) > Math.abs(dx)) {
            // Vertical movement is greater
            if (dy > 0) {
                $gamePlayer.setDirection(2); // Down
            } else if (dy < 0) {
                $gamePlayer.setDirection(8); // Up
            }
        } else if (dx !== 0 || dy !== 0) {
            // Equal distance or diagonal - prioritize horizontal
            if (dx > 0) {
                $gamePlayer.setDirection(6); // Right
            } else if (dx < 0) {
                $gamePlayer.setDirection(4); // Left
            } else if (dy > 0) {
                $gamePlayer.setDirection(2); // Down
            } else if (dy < 0) {
                $gamePlayer.setDirection(8); // Up
            }
        }
    };

    Scene_Map.prototype.animateThrow = function(itemData, trajectory, finalPos) {
        if (!this._spriteset) return;

        // Create throw animation sprite
        const throwSprite = new Sprite_ThrowAnimation(itemData, trajectory, finalPos);
        this._spriteset._tilemap.addChild(throwSprite);

        // Set callback for when animation completes
        throwSprite.setCompletionCallback(() => {
            // Whoever is standing on the landing tile wears the throw: an
            // object hitting a person is assault, a culture vial breaking on
            // one is an infection (window.ThrowItem owns both answers).
            const struck = ThrowService.hitEventAt(finalPos.x, finalPos.y, itemData);
            if (struck) ThrowService.announce(struck);

            // A vial is gone once it breaks; anything else falls at their feet.
            if (struck && struck.kind === 'infect') return;

            // Check if final position should destroy item
            if ($gameMap.isDestroyTile(finalPos.x, finalPos.y)) {
                window.skipLocalization = true;
                $gameMessage.add(T('Battle.throw.destroyed'));
                window.skipLocalization = false;
            } else {
                // Place item on map
                ThrownItemManager.addItem($gameMap.mapId(), finalPos.x, finalPos.y, itemData);

                // Create thrown item sprite on map
                if (this._spriteset) {
                    this._spriteset.createThrownItemSprite(finalPos.x, finalPos.y, itemData);
                }
            }
        });
    };

    Scene_Map.prototype.cancelThrow = function() {
        if (!this._throwTargeting) return;

        SoundManager.playCancel();
        this.endThrowTargeting();
    };

    Scene_Map.prototype.getThrowItemWeight = function(itemData) {
        let item = null;

        switch (itemData.itemType) {
            case 'item':
                item = $dataItems[itemData.itemId];
                break;
            case 'weapon':
                item = $dataWeapons[itemData.itemId];
                break;
            case 'armor':
                item = $dataArmors[itemData.itemId];
                break;
        }

        if (item && item.meta.Weight) {
            return parseInt(item.meta.Weight);
        }
        return 100; // Default weight in grams
    };

    Scene_Map.prototype.calculateThrowTrajectory = function(weight, targetX, targetY) {
        const trajectory = [];
        const startX = $gamePlayer.x;
        const startY = $gamePlayer.y;

        // Calculate throw force based on weight
        const maxRange = this._throwTargeting.maxRange;
        const forceFactor = Math.max(0.3, 1 - (weight / 5000)); // Heavier items don't go as far
        const effectiveRange = Math.floor(maxRange * forceFactor);

        // Calculate direction
        const dx = targetX - startX;
        const dy = targetY - startY;

        // Use the same Manhattan metric the targeting cursor gates range with
        // (moveThrowTarget), so a target the cursor allowed is actually reached
        // instead of the item stopping a tile short on diagonals.
        const manhattan = Math.abs(dx) + Math.abs(dy);
        if (manhattan === 0) return trajectory;

        // Interpolate one tile per step and land exactly on the target tile.
        const tileSteps = Math.max(Math.abs(dx), Math.abs(dy));
        const stepX = dx / tileSteps;
        const stepY = dy / tileSteps;

        // Weight caps how far (in Manhattan tiles) the item can fly.
        const cappedManhattan = Math.min(manhattan, effectiveRange);
        const reachSteps = Math.max(1, Math.round(tileSteps * (cappedManhattan / manhattan)));

        // Simulate physics
        let currentX = startX;
        let currentY = startY;

        for (let i = 1; i <= reachSteps; i++) {
            currentX = Math.round(startX + stepX * i);
            currentY = Math.round(startY + stepY * i);

            // Check collision
            if ($gameMap.isThrowBlocked(currentX, currentY)) {
                break;
            }

            trajectory.push({ x: currentX, y: currentY });
        }

        return trajectory;
    };

    Scene_Map.prototype.removeThrowItemFromInventory = function(itemData) {
        switch (itemData.itemType) {
            case 'item':
                $gameParty.loseItem($dataItems[itemData.itemId], 1);
                break;
            case 'weapon':
                $gameParty.loseItem($dataWeapons[itemData.itemId], 1);
                break;
            case 'armor':
                $gameParty.loseItem($dataArmors[itemData.itemId], 1);
                break;
        }
    };
    
    // Helper function to check if a tile blocks thrown items
    Game_Map.prototype.isThrowBlocked = function(x, y) {
        // Check if tile is not passable
        if (!this.isPassable(x, y, 2)) return true;
        
        // Check for terrain tag 4
        if (this.terrainTag(x, y) === 4) return true;
        
        // Check for region 10
        if (this.regionId(x, y) === 10) return true;
        
        return false;
    };
    
    // Helper function to check if a tile destroys items
    Game_Map.prototype.isDestroyTile = function(x, y) {
        // Check for terrain tag 3
        if (this.terrainTag(x, y) === 3) return true;

        // Check for region 99
        if (this.regionId(x, y) === 99) return true;

        return false;
    };

    // Prevent player movement during throw targeting mode
    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if (this._throwTargetingMode) {
            return false;
        }
        return _Game_Player_canMove.call(this);
    };


    //=========================================================================
    // Throw service (window.ThrowItem)
    //
    // The one answer to "may this be thrown", "how hard does it land" and
    // "what happens to whoever it lands on". The map throw below, the battle
    // Throw command (BattleSystemEnhanchedCommands.js) and the map fight's own
    // Throw (MapBattleMode.js) all read it, so weight means the same thing
    // wherever an object leaves a hand.
    //=========================================================================

    // The flight of a thrown object, on screen: how big the 3D model is
    // drawn, how long it is in the air and how high the arc carries it.
    const THROW_MODEL_SCALE = 90;
    const THROW_FLIGHT_FRAMES = 24;
    const THROW_ARC_HEIGHT = 90;

    const ThrowService = {
        // Grams. The tag is the only source; anything untagged is a light
        // object of 100g, the same default the trajectory code has always used.
        weightOf(item) {
            if (!item) return 0;
            const raw = item.meta && item.meta.Weight;
            const grams = parseInt(raw, 10);
            return Number.isFinite(grams) && grams > 0 ? grams : 100;
        },

        // A culture vial names the disease it carries; everything else is null.
        diseaseVialId(item) {
            const raw = item && item.meta && item.meta.DiseaseVial;
            if (!raw || raw === true) return null;
            return String(raw).trim() || null;
        },

        // Key items and materials stay in the bag: they are what a quest or a
        // recipe still needs, and an unrecoverable throw would strand both.
        // itypeId 2 is the flag the rest of the codebase reads for it.
        isThrowable(item) {
            if (!item) return false;
            if (DataManager.isItem(item) && item.itypeId === 2) return false;
            const cat = item.note && /<category:\s*([^>]+)>/i.exec(item.note);
            if (cat && /^(Materials|Components)$/i.test(cat[1].trim())) return false;
            if (window.VectorGun && window.VectorGun.isBound && window.VectorGun.isBound(item)) return false;
            return true;
        },

        // Damage is the weight carried to the target, softened logarithmically
        // (a sack twice as heavy does not hurt twice as much) and pushed by the
        // thrower's strength when there is one. A vial is glassware: it breaks
        // rather than bruises, so it lands for almost nothing and does its work
        // through what is inside it.
        damageFor(item, thrower) {
            const grams = this.weightOf(item);
            if (this.diseaseVialId(item)) return 1;
            const base = Math.round(6 * Math.log2(1 + grams / 100));
            const atk = thrower && thrower.atk ? thrower.atk : 0;
            return Math.max(1, base + Math.round(atk / 4));
        },

        // Landing on a battler: plain HP damage with the usual popup, so the
        // HUD, the corpses and the death handling all see an ordinary hit.
        hitBattler(target, item, thrower) {
            if (!target || !target.isAlive || !target.isAlive()) return 0;
            const damage = this.damageFor(item, thrower);
            if (target.clearResult) target.clearResult();
            target.gainHp(-damage);
            if (target.result && target.result()) {
                const res = target.result();
                res.hpAffected = true;
                res.hpDamage = damage;
            }
            if (target.startDamagePopup) target.startDamagePopup();
            if (target.hp <= 0 && target.performCollapse) target.performCollapse();
            return damage;
        },

        // Landing on somebody who is not in a fight. A vial breaking on an NPC
        // is an infection attempt (Health_DiseaseSystem.js) and is answered as
        // bioterrorism when it is seen; anything else is assault, priced off
        // what it did. Returns a short report for the caller to voice.
        hitEvent(event, item, thrower) {
            if (!event || !window.NPCSocietyRegistry) return null;
            const name = (window.NPCSim && window.NPCSim.npcNameForEvent)
                ? window.NPCSim.npcNameForEvent(event)
                : (event.event && event.event() ? String(event.event().name || '').trim() : '');
            if (!name) return null;
            const profile = window.NPCSocietyRegistry.getProfile(name);
            if (!profile) return null;

            const diseaseId = this.diseaseVialId(item);
            if (diseaseId) return this.infectEvent(event, profile, name, diseaseId, thrower);

            const damage = this.damageFor(item, thrower);
            this.souredBy(profile, damage);
            const bounty = 200 + damage * 20;
            if (window.CrimeSystem && window.CrimeSystem.addCrime) {
                const label = window.CrimeSystem.presetCrimeName
                    ? window.CrimeSystem.presetCrimeName('assault')
                    : 'assault'; // i18n-ignore: CrimeSystem preset key
                window.CrimeSystem.addCrime(label, bounty, 'assault');
            }
            return { kind: 'assault', name, damage, bounty };
        },

        // A hit NPC remembers it: the opinion of whoever threw collapses and
        // the faction notices, the same ledger the Empathize attack writes to.
        souredBy(profile, damage) {
            if (!profile) return;
            const leader = $gameParty && $gameParty.leader && $gameParty.leader();
            const drop = Math.min(60, 20 + damage);
            if (leader && profile.opinions) {
                const id = leader.actorId();
                const now = Number(profile.opinions[id] || 0);
                profile.opinions[id] = Math.max(-100, now - drop);
            }
            profile.opinion = Math.max(-100, Number(profile.opinion || 0) - drop);
            if (!Array.isArray(profile.log)) profile.log = [];
            profile.log.push({ tag: 'crime', desc: 'hit by a thrown object' }); // i18n-ignore: internal log tag
        },

        // The vial breaks on them. A covert throw plants the disease quietly;
        // a seen one is bioterrorism. Either way the pathogen is loose, so the
        // outbreak is seeded where it happened.
        infectEvent(event, profile, name, diseaseId, thrower) {
            const DS = window.DiseaseSystem;
            if (!DS || !DS.infectNpc) return null;

            const chance = this.covertChance(thrower);
            const covert = Math.random() * 100 < chance;

            let epidemicId = null;
            if (DS.startPlayerEpidemic) {
                const placeKey = window.EpidemicSystem && window.EpidemicSystem.currentPlace
                    ? window.EpidemicSystem.currentPlace()
                    : null;
                const epidemic = DS.startPlayerEpidemic(diseaseId, placeKey, {
                    covert: covert,
                    playerStarted: true,
                    originNpc: name
                });
                epidemicId = epidemic && epidemic.id ? epidemic.id : null;
            }
            DS.infectNpc(profile, diseaseId, epidemicId);

            if (!covert) {
                if (window.CrimeSystem && window.CrimeSystem.addPresetCrime) {
                    window.CrimeSystem.addPresetCrime('bioterrorism');
                }
                this.souredBy(profile, 20);
            }
            return { kind: 'infect', name, diseaseId, covert, epidemicId };
        },

        // The same reach the Empathize infection uses: a steady hand and a
        // quick mind is what keeps a broken vial from being traced back.
        covertChance(thrower) {
            const actor = thrower || ($gameParty && $gameParty.leader && $gameParty.leader());
            if (!actor || actor.mat == null) return 10;
            return Math.max(5, Math.min(95, 10 + (actor.mat + actor.agi) / 0.6));
        },

        // What the throw did, said out loud (a toast, never a blocking box).
        announce(report) {
            if (!report || !window.ParchmentToast) return;
            if (report.kind === 'assault') {
                window.ParchmentToast.show(T('Battle.throw.hitNpc', {
                    name: report.name, damage: report.damage
                }));
            } else if (report.kind === 'infect') {
                window.ParchmentToast.show(T(
                    report.covert ? 'Battle.throw.infectedQuietly' : 'Battle.throw.infectedSeen',
                    { name: report.name }
                ));
            }
        },

        // The database entry behind a {itemType, itemId} throw record.
        resolve(itemData) {
            if (!itemData) return null;
            switch (itemData.itemType) {
                case 'weapon': return $dataWeapons[itemData.itemId];
                case 'armor':  return $dataArmors[itemData.itemId];
                default:       return $dataItems[itemData.itemId];
            }
        },

        // Whoever stands on a landing tile takes the throw. Battlers in a map
        // fight are hit as battlers; everyone else is answered as a person.
        hitEventAt(x, y, itemData) {
            const item = this.resolve(itemData);
            if (!item) return null;
            const thrower = $gameParty && $gameParty.leader && $gameParty.leader();
            for (const ev of $gameMap.eventsXy(x, y)) {
                const MBM = window.MapBattleMode;
                if (MBM && MBM.isActive && MBM.isActive() && MBM.battlerFor) {
                    const battler = MBM.battlerFor(ev);
                    if (battler) {
                        const damage = this.hitBattler(battler, item, thrower);
                        return { kind: 'battler', battler, damage };
                    }
                }
                const report = this.hitEvent(ev, item, thrower);
                if (report) return report;
            }
            return null;
        },

        // The object itself, thrown across the screen in three dimensions.
        // It borrows the weapon overlay (Weapon/Weapon3DOverlay.js), which is
        // already an orthographic camera measured in game pixels, and the
        // item model library (ItemSystem/ItemSystemUtils.js). Falls straight
        // through to the callback wherever either is missing.
        flyModel(item, from, to, onDone) {
            const done = () => { if (onDone) onDone(); };
            const overlay = window.WeaponThreeScene;
            const models = window.ItemModelSystem;
            if (!overlay || !models || !window.THREE || !from || !to) { done(); return; }

            let model = null;
            try { model = models.createModel(item); } catch (e) { model = null; }
            if (!model) { done(); return; }

            overlay.ref();
            const pivot = new window.THREE.Group();
            // The library builds in metres, standing on the floor; on screen
            // the object is a hand-sized thing a few dozen pixels across.
            model.scale.setScalar(THROW_MODEL_SCALE);
            pivot.add(model);
            overlay.scene.add(pivot);

            const toScene = (p) => ({
                x: p.x - Graphics.width / 2,
                y: Graphics.height / 2 - p.y
            });
            const a = toScene(from);
            const b = toScene(to);
            const spin = 0.25 + Math.random() * 0.15;
            const frames = THROW_FLIGHT_FRAMES;
            let frame = 0;

            const step = () => {
                frame++;
                const t = Math.min(1, frame / frames);
                pivot.position.x = a.x + (b.x - a.x) * t;
                // An arc, not a laser: the object rises and comes down again.
                pivot.position.y = a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * THROW_ARC_HEIGHT;
                pivot.rotation.z -= spin;
                pivot.rotation.x += spin * 0.6;
                overlay.render();
                if (t >= 1) {
                    overlay.scene.remove(pivot);
                    overlay.render();
                    overlay.deref();
                    done();
                    return;
                }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        },

        // Every throwable the party is carrying, for the battle menus.
        throwableItems() {
            return $gameParty.allItems().filter(it => ThrowService.isThrowable(it));
        }
    };

    window.ThrowItem = ThrowService;

})();
