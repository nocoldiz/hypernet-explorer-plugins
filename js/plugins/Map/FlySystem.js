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
 * @command Levitate
 * @desc Timed flight: the party lifts off for a number of steps, then sets down
 *
 * @arg steps
 * @type number
 * @min 1
 * @default 30
 * @desc Steps the flight lasts before the party comes down
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
 * - Levitate: Start flying for a number of steps (the levitation spells and
 *   Glide). When they run out the party comes down on the first tile it can
 *   stand on, never inside a wall.
 *
 * Every kind of flight answers to VehicleSystem's sky rule: under a roof the
 * flier keeps to walkable ground and terrain tag 7 is shut; outdoors it
 * crosses anything.
 */

(() => {
    const pluginName = 'FlySystem';
    const PLUGIN_PARAMS = PluginManager.parameters(pluginName);

    // The sky rule is VehicleSystem's (the Broom answers to it too); the
    // fallback only covers a build where that plugin is not loaded.
    function flightGroundedHere() {
        const vs = window.VehicleSystem;
        if (vs && typeof vs.flightGroundedHere === 'function') return vs.flightGroundedHere();
        const note = (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.note) || '';
        return note.includes('<Interior>') && !note.includes('<Covered>');
    }

    function flightBarredTile(x, y) {
        const vs = window.VehicleSystem;
        if (vs && typeof vs.flightBarredTile === 'function') return vs.flightBarredTile(x, y);
        return flightGroundedHere() && $gameMap.terrainTag(x, y) === 7;
    }

    // Somewhere the party can be set down: a tile a walker could leave in at
    // least one direction, outside the keep-out region and, under a roof, off
    // terrain tag 7.
    function canLandAt(x, y) {
        if (!$gameMap.isValid(x, y)) return false;
        if ($gameMap.regionId(x, y) === 10) return false;
        if (flightBarredTile(x, y)) return false;
        return [2, 4, 6, 8].some(d => $gameMap.isPassable(x, y, d));
    }

    function takeOff(steps) {
        $gamePlayer._flying = true;
        $gamePlayer._flightSteps = steps > 0 ? steps : 0;
        $gamePlayer._flightExpired = false;
        $gameMap._airshipFly = true;
    }

    function land() {
        $gamePlayer._flying = false;
        $gamePlayer._flightSteps = 0;
        $gamePlayer._flightExpired = false;
        $gameMap._airshipFly = false;
    }

    // Plugin command: Fly
    PluginManager.registerCommand(pluginName, 'Fly', function() {
        takeOff(0);
    });

    // Plugin command: Land
    PluginManager.registerCommand(pluginName, 'Land', function() {
        land();
    });

    // Plugin command: Levitate (timed flight)
    PluginManager.registerCommand(pluginName, 'Levitate', function(args) {
        takeOff(Math.max(1, Number(args && args.steps) || 30));
    });

    // A timed flight wears off one step at a time. Once it has, the party
    // comes down on the first tile it can stand on, so a spell that runs out
    // over a lake or a rooftop carries on until there is ground below.
    const _Game_Player_increaseSteps = Game_Player.prototype.increaseSteps;
    Game_Player.prototype.increaseSteps = function() {
        _Game_Player_increaseSteps.call(this);
        if (!this._flying) return;
        if (this._flightSteps > 0) {
            this._flightSteps--;
            if (this._flightSteps === 0) this._flightExpired = true;
        }
        if (this._flightExpired && canLandAt(this._x, this._y)) land();
    };

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
            // Under a roof there is no sky: the flier keeps to the ground the
            // party could walk, and terrain tag 7 is shut to them. Outdoors
            // tag 7 (a roof seen from above) is crossed like anything else.
            if (flightGroundedHere()) {
                if (flightBarredTile(x2, y2)) return false;
                return _Game_Player_canPass.call(this, x, y, d);
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
            if (canLandAt($gamePlayer.x, $gamePlayer.y)) land();
            else if (typeof SoundManager !== 'undefined' && SoundManager.playBuzzer) SoundManager.playBuzzer();
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
            this._flightSteps = 0;
            this._flightExpired = false;
        }
        _Game_Player_performTransfer.call(this);
        if ($gameMap) {
            $gameMap._airshipFly = false;
        }
    };

    window.FlySystem = { takeOff, land, canLandAt, flightBarredTile, flightGroundedHere };
})();
