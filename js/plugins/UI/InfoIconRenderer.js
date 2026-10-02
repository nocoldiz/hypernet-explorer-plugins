/*:
 * @target MZ
 * @plugindesc Handles rendering for the Info icon sprite (16-frame animation).
 * @author Omni-Lex
 *
 * @help InfoIconRenderer.js
 *
 * This plugin specifically handles events that have a comment "Info" in 
 * their event commands. It will replace their graphic with 
 * img/characters/Objects/info.png and play the 16-frame animation.
 *
 * The animation is not limited to those events: ANY character wearing that
 * sheet is drawn with it, whoever dressed it. The moored Starship uses this
 * (Vehicle/VehicleSystem.js): off the world map it is a mark on the ground
 * rather than a picture of the hull.
 *
 * The sprite sheet is expected to be 864x54 (16 frames of 54x54).
 */

(() => {
    const PLUGIN_NAME = "InfoIconRenderer";
    const INFO_SPRITE_PATH = "Objects/info";
    const TOTAL_FRAMES = 16;
    const FRAME_WIDTH = 54;
    const FRAME_HEIGHT = 54;
    const FRAME_HOLD = 4; // game frames each frame of the animation is held for

    /** The frame the game is on, or 0 before Graphics is up (tests, boot). */
    function FRAME_COUNT() {
        return (typeof Graphics !== "undefined" && Graphics.frameCount) || 0;
    }

    // --- Data Management ---

    // Safe-guard to prevent crashes on dynamic/erased events whose data is not in $dataMap.events
    const _Game_Event_event = Game_Event.prototype.event;
    Game_Event.prototype.event = function() {
        if ($dataMap && $dataMap.events) {
            const ev = _Game_Event_event.call(this);
            if (ev) return ev;
        }
        return { pages: [], name: "", note: "", meta: {} };
    };

    const _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        this._isInfoIcon = false;
        this.checkInfoComment();
    };

    Game_Event.prototype.checkInfoComment = function() {
        if (!this.page()) return;
        const list = this.list();
        if (list) {
            for (const command of list) {
                if (command.code === 108 || command.code === 408) {
                    const comment = command.parameters[0].trim();
                    if (/^info$/i.test(comment)) {
                        this._isInfoIcon = true;
                        this.setInfoGraphic();
                        break;
                    }
                }
            }
        }
    };

    Game_Event.prototype.setInfoGraphic = function() {
        this.setImage(INFO_SPRITE_PATH, 0);
        this.setStepAnime(true);
        this.setDirection(2); // Face down
        this._isInfoIcon = true;
    };

    // Anything wearing the info sheet is animated as the info icon, not only the
    // events this plugin dresses itself: the moored Starship is put into it by
    // Vehicle/VehicleSystem.js and never passes through checkInfoComment.
    Game_CharacterBase.prototype.isInfoIcon = function() {
        if (this._isInfoIcon) return true;
        return typeof this.characterName === "function" &&
            this.characterName() === INFO_SPRITE_PATH;
    };

    // --- Sprite Handling ---

    // Asked of every character sprite on the screen every frame. The sheet is
    // read off the sprite rather than off the character: updateBitmap has just
    // copied characterName() onto it (the engine runs it before updateFrame),
    // and asking the character again ran the whole characterName chain of
    // overrides a second time for an answer the sprite already holds.
    const _Sprite_Character_updateCharacterFrame = Sprite_Character.prototype.updateCharacterFrame;
    Sprite_Character.prototype.updateCharacterFrame = function() {
        const ch = this._character;
        if (ch && (ch._isInfoIcon || this._characterName === INFO_SPRITE_PATH)) {
            this.updateInfoFrame();
        } else {
            _Sprite_Character_updateCharacterFrame.call(this);
        }
    };

    Sprite_Character.prototype.updateInfoFrame = function() {
        const pw = FRAME_WIDTH;
        const ph = FRAME_HEIGHT;
        const sx = this.infoCharacterPatternX() * pw;
        const sy = 0;
        this.setFrame(sx, sy, pw, ph);
    };

    Sprite_Character.prototype.infoCharacterPatternX = function() {
        // A fixed speed, four game frames to a frame of the animation, read off
        // the clock the whole game runs on rather than off a counter kept per
        // character: it turns whether or not the thing wearing it moves, steps
        // or is even a character the plugin dressed, and two icons on the same
        // map turn together.
        return Math.floor(FRAME_COUNT() / FRAME_HOLD) % TOTAL_FRAMES;
    };



})();
