/*:
 * @target MZ
 * @plugindesc v1.0.0 - Simple Peek Plugin: Teleports, makes player invisible/immobile (can turn), and shows choice menu on continue.
 * @author Omni-Lex
 * @help
 * ============================================================================
 * RPG Maker MZ - Peek Plugin
 * ============================================================================
 * 
 * This plugin implements a "Peek" mechanic. When a player activates a player
 * transfer event inside an event that has <Peek> or Peek in its event notes:
 * 
 * 1. Screen fades out, player is made transparent (invisible).
 * 2. Player teleports to the target map location.
 * 3. Screen fades in, player is immobile (cannot walk) but CAN turn in place.
 * 4. The Pause/Main Menu is disabled to prevent saving in a peeking state.
 * 5. When the player presses continue (OK, Cancel, or Touch/Click), a choice
 *    menu is presented with the following options:
 *    - Stop peeking: Returns the player to their original position and map,
 *      restoring their transparency and mobility.
 *    - Lockpick: Checks if the player has lockpicks (item 375). If not, warns
 *      them. If they do, calls the falling-block lockpicking minigame on standard
 *      difficulty. On success, plays "lock_01.ogg", makes the player visible,
 *      and allows them to move freely on this map (exits peek mode).
 *    - Break in: Commits the "breakingAndEntering" crime, plays "Crash.ogg",
 *      makes the player visible, and allows them to move freely on this map.
 * 
 * ============================================================================
 * SPLIT-SCREEN MULTIPLAYER INTEGRATION (STUB & DOCUMENTATION)
 * ============================================================================
 * For local split-screen (using SplitScreenMultiplayer.js), peeking works
 * differently:
 * 
 * - When Player 1 or Player 2 triggers a Peek, the non-peeking player's screen 
 *   viewport is hidden (or blacked out) using a PIXI mask.
 * - The peeking player teleports to the target map.
 * - The peeking player CAN move around normally on the target map.
 * - Hitting the return key (or walking back to the start zone) returns the 
 *   peeking player and restores normal dual viewport rendering.
 * 
 * Stubs are included in this plugin and in SplitScreenMultiplayer.js.
 * 
 */

(function() {
    "use strict";

    // Global Namespace for the Peek System
    const PeekSystem = {
        isPeeking: false,
        _isReturning: false,
        originalMapId: 0,
        originalX: 0,
        originalY: 0,
        originalDirection: 2,
        originalTransparency: false,
        peekEventId: 0,
        cooldown: 0,
        _peekingWithLockpick: false,

        reset: function() {
            this.isPeeking = false;
            this._isReturning = false;
            this.originalMapId = 0;
            this.originalX = 0;
            this.originalY = 0;
            this.originalDirection = 2;
            this.originalTransparency = false;
            this.peekEventId = 0;
            this.cooldown = 0;
            this._peekingWithLockpick = false;
        },

        startPeek: function(eventId) {
            this.isPeeking = true;
            this._isReturning = false;
            this.originalMapId = $gameMap.mapId();
            this.originalX = $gamePlayer.x;
            this.originalY = $gamePlayer.y;
            this.originalDirection = $gamePlayer.direction();
            this.originalTransparency = $gamePlayer.isTransparent();
            this.peekEventId = eventId;
            this.cooldown = 45; // 45 frames (0.75s) cooldown before return is allowed

            // Make player invisible
            $gamePlayer.setTransparent(true);
        },

        canTriggerReturn: function() {
            if (!this.isPeeking || this._isReturning) return false;
            if (this.cooldown > 0) return false;
            if ($gamePlayer.isTransferring()) return false;
            if ($gameMessage.isBusy()) return false;
            if (SceneManager.isSceneChanging()) return false;
            
            // Check if scene is actively fading in/out
            if (SceneManager._scene && SceneManager._scene._fadeDuration > 0) {
                return false;
            }
            return true;
        },

        showPeekOptions: function() {
            if ($gameMessage.isBusy()) return;

            $gameMessage.clear();
            $gameMessage.setChoices([T('Peek.stopPeeking'), T('Peek.lockpick'), T('Peek.breakIn')], 0, 0);
            $gameMessage.setChoiceBackground(0);
            $gameMessage.setChoicePositionType(2);
            $gameMessage.setChoiceCallback((index) => {
                if (index === 0) {
                    this.returnFromPeek();
                } else if (index === 1) {
                    this.startLockpickOption();
                } else if (index === 2) {
                    this.breakInOption();
                }
            });
        },

        startLockpickOption: function() {
            const lockpickItem = $dataItems[374];
            if (!lockpickItem || !$gameParty.hasItem(lockpickItem)) {
                $gameMessage.clear();
                window.skipLocalization = true;
                $gameMessage.add(T('Peek.noLockpicks'));
                window.skipLocalization = false;
                
                // Show the choice menu again immediately after warning is closed
                $gameMessage.setChoices([T('Peek.stopPeeking'), T('Peek.lockpick'), T('Peek.breakIn')], 0, 0);
                $gameMessage.setChoiceBackground(0);
                $gameMessage.setChoicePositionType(2);
                $gameMessage.setChoiceCallback((index) => {
                    if (index === 0) {
                        this.returnFromPeek();
                    } else if (index === 1) {
                        this.startLockpickOption();
                    } else if (index === 2) {
                        this.breakInOption();
                    }
                });
                return;
            }

            // Flag that we are lockpicking
            this._peekingWithLockpick = true;

            // Dynamically inject our scene popup hooks
            this.hookLockpickScene();

            // Start lockpick minigame on standard difficulty
            const difficulty = (typeof UnlockingBlocks !== 'undefined' && UnlockingBlocks.defaultDifficulty) ? UnlockingBlocks.defaultDifficulty : 5;
            if (typeof UnlockingBlocks !== 'undefined') {
                UnlockingBlocks.start(difficulty, 0, 0, '', '');
            } else {
                console.error("UnlockingBlocks is not defined!");
                this._peekingWithLockpick = false;
            }
        },

        breakInOption: function() {
            // Add crime breakingAndEntering to CrimeSystem
            if (typeof CrimeSystem !== 'undefined') {
                CrimeSystem.addPresetCrime("breakingAndEntering");
            } else {
                console.error("CrimeSystem is not defined!");
            }

            // Play sound Crash.ogg
            AudioManager.playSe({ name: "Crash", volume: 100, pitch: 100, pan: 0 });

            // Make player visible
            $gamePlayer.setTransparent(false);

            // Allow player to move and end peek state
            this.endPeek();
        },

        hookLockpickScene: function() {
            if (typeof Scene_UnlockingBlocks !== 'undefined' && !Scene_UnlockingBlocks._peekHooked) {
                Scene_UnlockingBlocks._peekHooked = true;
                const _Scene_UnlockingBlocks_popScene = Scene_UnlockingBlocks.prototype.popScene;
                Scene_UnlockingBlocks.prototype.popScene = function() {
                    if (PeekSystem.isPeeking && PeekSystem._peekingWithLockpick) {
                        if (this.success) {
                            // Play sound lock_01.ogg
                            AudioManager.playSe({ name: "lock_01", volume: 100, pitch: 100, pan: 0 });
                            // Make player visible
                            $gamePlayer.setTransparent(false);
                            // Allow player to move and end peek state
                            PeekSystem.endPeek();
                        }
                        PeekSystem._peekingWithLockpick = false;
                    }
                    _Scene_UnlockingBlocks_popScene.call(this);
                };
            }
        },

        returnFromPeek: function() {
            if (this._isReturning) return;
            this._isReturning = true;

            // Play cancel sound effect to signify exiting peek mode
            SoundManager.playCancel();

            // Reserve the return transfer using RPG Maker's built-in robust handler (fade type: 0 = Black)
            $gamePlayer.reserveTransfer(
                this.originalMapId,
                this.originalX,
                this.originalY,
                this.originalDirection,
                0
            );
        },

        endPeek: function() {
            // Restore original player transparency
            $gamePlayer.setTransparent(this.originalTransparency);
            
            // Clean up state
            this.reset();
        },

        // =========================================================================
        // SPLIT-SCREEN MULTIPLAYER STUBS (FOR FUTURE IMPLEMENTATION)
        // =========================================================================
        /**
         * Stub for checking if we are currently in split-screen mode.
         */
        isSplitScreenActive: function() {
            return typeof SplitScreenManager !== 'undefined' && SplitScreenManager.active;
        },

        /**
         * Stub to start a Peek under split-screen conditions.
         * @param {number} playerId - The player index (1 or 2) who initiated the peek.
         */
        startMultiplayerPeek: function(playerId) {
            console.log(`[PeekSystem] Stub: Starting multiplayer peek for Player ${playerId}`);
            
            // 1. Identify non-peeking player
            const nonPeekingPlayerId = playerId === 1 ? 2 : 1;

            // 2. Hide the viewport of the non-peeking player
            if (typeof SplitScreenManager !== 'undefined') {
                // SplitScreenManager.hideViewportForPlayer(nonPeekingPlayerId);
            }

            // 3. Teleport peeking player to target map
            // 4. Mark peeking state without immobility constraints.
            //    Store the origin so returnFromMultiplayerPeek can restore it,
            //    the same way startPeek does for the single-player path.
            this.isPeeking = true;
            this._isReturning = false;
            this.originalMapId = $gameMap.mapId();
            this.originalX = $gamePlayer.x;
            this.originalY = $gamePlayer.y;
            this.originalDirection = $gamePlayer.direction();
            this.originalTransparency = $gamePlayer.isTransparent();
            this.peekingPlayerId = playerId;

            return true;
        },

        /**
         * Return from a Peek under split-screen conditions.
         *
         * Teleport-back is implemented here by mirroring the single-player
         * returnFromPeek path: reserve a transfer to the stored origin and let the
         * performTransfer hook finalize via endPeek(). Viewport restoration is a
         * no-op because the current SplitScreenManager exposes no per-player
         * viewport hide/show API (P2 is rendered as an event on the shared map,
         * with viewports auto-merging by proximity), so there is nothing to
         * restore. If such an API is added, restore it here.
         */
        returnFromMultiplayerPeek: function() {
            if (!this.isPeeking || this._isReturning) return;
            this._isReturning = true;

            // Viewport restoration: no supported API on SplitScreenManager (no-op).

            // Teleport the peeking player back to their stored origin. The
            // performTransfer hook calls endPeek() once the transfer completes,
            // which restores transparency and resets the peek state.
            $gamePlayer.reserveTransfer(
                this.originalMapId,
                this.originalX,
                this.originalY,
                this.originalDirection,
                0
            );
        }
    };

    // Export globally
    window.PeekSystem = PeekSystem;

    // =========================================================================
    // HOOKS & OVERRIDES
    // =========================================================================

    // Hook: Event Player Transfer command (command201)
    const _Game_Interpreter_command201 = Game_Interpreter.prototype.command201;
    Game_Interpreter.prototype.command201 = function(params) {
        if (this.isOnCurrentMap() && this._eventId > 0) {
            const event = $gameMap.event(this._eventId);
            if (event && event.event()) {
                const eventData = event.event();
                const note = eventData.note || "";
                // Match the <Peek> meta tag or a standalone "Peek" word, not any
                // note that merely contains the substring "peek".
                if (eventData.meta && eventData.meta.Peek || /\bpeek\b/i.test(note)) {
                    // Check if multiplayer split-screen is active
                    if (PeekSystem.isSplitScreenActive()) {
                        PeekSystem.startMultiplayerPeek(1);
                    } else {
                        // Single player peek
                        if (!PeekSystem.isPeeking) {
                            PeekSystem.startPeek(this._eventId);
                        }
                    }
                }
            }
        }
        return _Game_Interpreter_command201.call(this, params);
    };

    // Hook: Player Mobility checks
    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if (PeekSystem.isPeeking) {
            // For multiplayer peek, the player CAN move.
            if (PeekSystem.isSplitScreenActive()) {
                return _Game_Player_canMove.call(this);
            }
            // For single-player, they are completely immobile.
            return false;
        }
        return _Game_Player_canMove.call(this);
    };

    // Override: Bypassing movement inputs when peeking but allowing turning in place
    const _Game_Player_moveByInput = Game_Player.prototype.moveByInput;
    Game_Player.prototype.moveByInput = function() {
        if (PeekSystem.isPeeking) {
            // If split-screen is active, allow normal movement
            if (PeekSystem.isSplitScreenActive()) {
                _Game_Player_moveByInput.call(this);
                return;
            }

            // Single player: block movement but allow turning in place
            if (!this.isMoving()) {
                const direction = this.getInputDirection();
                if (direction > 0) {
                    this.setDirection(direction);
                }
            }
            return;
        }
        _Game_Player_moveByInput.call(this);
    };

    // Hook: Disable access to menu during single player peek
    const _Scene_Map_isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function() {
        if (PeekSystem.isPeeking && !PeekSystem.isSplitScreenActive()) {
            return false;
        }
        return _Scene_Map_isMenuEnabled.call(this);
    };

    // Hook: Frame updates to process exit cooldown and continue input
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        
        if (PeekSystem.isPeeking) {
            // Decrement cooldown frame-by-frame
            if (PeekSystem.cooldown > 0) {
                PeekSystem.cooldown--;
            }

            // In single player peek, monitor for continue input to show choices
            if (!PeekSystem.isSplitScreenActive() && PeekSystem.canTriggerReturn()) {
                if (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered()) {
                    PeekSystem.showPeekOptions();
                }
            }
        }
    };

    // Hook: Finalize return when teleport ends
    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        const wasPeeking = PeekSystem.isPeeking;
        const isReturning = PeekSystem._isReturning;

        _Game_Player_performTransfer.call(this);

        if (wasPeeking && isReturning) {
            PeekSystem.endPeek();
        }
    };

    // Hook: Clean up state on New Game and Save Load to avoid stale peek states
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        PeekSystem.reset();
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        PeekSystem.reset();
    };

})();
