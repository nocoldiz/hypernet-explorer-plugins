//=============================================================================
// FlySystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Allows player to fly like an airship when Fly command is called
 * @author Generated with OmniLex Code
 *
 * @command Fly
 * @desc Start flying mode - player moves like airship until landing
 *
 * @command Land
 * @desc Land the airship (stop flying mode)
 *
 * @help
 * FlySystem v1.0
 *
 * When the "Fly" plugin command is called, the player will switch to airship
 * movement mode, allowing free movement in all directions. Press the confirm
 * button (usually Enter/Z) to land and return to normal movement.
 *
 * Plugin Commands:
 * - Fly: Start flying mode
 * - Land: Stop flying mode and land
 */

(() => {
    const pluginName = 'FlySystem';
    const PLUGIN_PARAMS = PluginManager.parameters(pluginName);

    // Plugin command: Fly
    PluginManager.registerCommand(pluginName, 'Fly', function() {
        $gamePlayer._flying = true;
        $gameMap._airshipFly = true;
    });

    // Plugin command: Land
    PluginManager.registerCommand(pluginName, 'Land', function() {
        $gamePlayer._flying = false;
        $gameMap._airshipFly = false;
    });

    // Override Game_Player.prototype.moveDiagonally to allow 8-directional movement when flying
    const _Game_Player_moveDiagonally = Game_Player.prototype.moveDiagonally;
    Game_Player.prototype.moveDiagonally = function(horz, vert) {
        if ($gamePlayer._flying) {
            // Allow diagonal movement when flying
            this.setMovementSuccess(this.canPass(this._x, this._y, 2) && this.canPass(this._x, this._y, 4));
            if (this.isMovementSucceeded() || this.isOnLadder()) {
                this._x += horz;
                this._y += vert;
                this.setDirection(this.direction());
                this.increaseSteps();
            } else {
                this.setDirection(2);
            }
        } else {
            _Game_Player_moveDiagonally.call(this, horz, vert);
        }
    };

    // Override Game_Player.prototype.canPass to allow flying over obstacles
    const _Game_Player_canPass = Game_Player.prototype.canPass;
    Game_Player.prototype.canPass = function(x, y, d) {
        if ($gamePlayer._flying) {
            // When flying, allow passage over most tiles (airship mode)
            // but never off the edge of the map.
            const x2 = $gameMap.roundXWithDirection(x, d);
            const y2 = $gameMap.roundYWithDirection(y, d);
            if (!$gameMap.isValid(x2, y2)) {
                return false;
            }
            // The keep-out region is the one thing flight does not clear: a
            // roof is a roof, and the dead mass behind an interior wall is not
            // somewhere a broomstick gets to land. MovementInteractionSystem's
            // own canPass is shadowed by this override, so the rule is asked
            // for again here rather than inherited.
            if (window.RegionRules && window.RegionRules.blocksMovement(x2, y2)) {
                return false;
            }
            return true;
        } else {
            return _Game_Player_canPass.call(this, x, y, d);
        }
    };

    // Check for landing input every frame
    const _Scene_Map_updateInputData = Scene_Map.prototype.updateInputData;
    Scene_Map.prototype.updateInputData = function() {
        _Scene_Map_updateInputData.call(this);

        // If flying and confirm button pressed, land.
        // Guard against the same OK that advances a message or runs while
        // the scene is busy so it does not double as a land command.
        if ($gamePlayer._flying && Input.isTriggered('ok') &&
            !$gameMessage.isBusy() && !this.isBusy() && $gamePlayer.canMove()) {
            $gamePlayer._flying = false;
            $gameMap._airshipFly = false;
        }
    };

    // Track flying state in Game_Player
    const _Game_Player_initialize = Game_Player.prototype.initialize;
    Game_Player.prototype.initialize = function() {
        _Game_Player_initialize.call(this);
        this._flying = false;
    };

    // Reset flight state on map transfer so it never persists across maps.
    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        if (this.isTransferring()) {
            this._flying = false;
        }
        _Game_Player_performTransfer.call(this);
        if ($gameMap) {
            $gameMap._airshipFly = false;
        }
    };
})();
