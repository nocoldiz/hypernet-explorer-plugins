//=============================================================================
// VisualNovelBustSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Visual Novel Bust System v2.0.0 (Bust image variables)
 * @author Omni-Lex
 * @version 2.0.0
 * @description Visual novel-style bust display with variable-based image loading. Loads busts from img/busts/ using Variables 106-108 per actor.
 * @url
 * @help VisualNovelBustSystem.js
 *
 * Loads character busts from img/busts/ directory based on Variables 106-108.
 * Each actor uses their stored variable name:
 * - Actor 1: Variable 106
 * - Actor 2: Variable 107
 * - Actor 3: Variable 108
 *
 * Displays busts during dialogue with character names in top-left corner,
 * keeps busts visible across multiple messages within the same event,
 * auto-hides only when the event completely ends,
 * provides manual commands, adjusts to screen resolution changes,
 * and adjusts choice window position.
 * 
 * @param showCharacterNames
 * @text Show Character Names
 * @desc Display character names in top-left corner during dialogue
 * @type boolean
 * @default true
 * 
 * @param nameWindowWidth
 * @text Name Window Width
 * @desc Width of the character name window
 * @type number
 * @default 300
 * 
 * @param nameWindowHeight
 * @text Name Window Height
 * @desc Height of the character name window
 * @type number
 * @default 60
 * 
 * @param nameWindowX
 * @text Name Window X Position
 * @desc X position of the name window from left edge
 * @type number
 * @default 250
 *
 * @param nameWindowY
 * @text Name Window Y Position
 * @desc Y position of the name window from top edge
 * @type number
 * @default 80
 *
 * @param bustYOffset_16_9
 * @text Bust Y Offset (16:9)
 * @desc How many pixels to raise the bust above the bottom of the screen (16:9 mode).
 * @type number
 * @default 180
 *
 * @command showBust
 * @text Show Character Bust
 * @desc Manually display a character bust on screen (automatically detects current event's sprite).
 *
 * @command hideBusts
 * @text Hide All Busts
 * @desc Manually hide all bust images and names.
 * 
 * @command batchDialogue
 * @text Batch Dialogue Mode
 * @desc Enable batch dialogue mode - bust stays visible across multiple messages until conversation ends.
 * 
 * @command setPartyBust
 * @text Set Party Member Bust
 * @desc Detect and assign a custom bust image from img/busts based on naming conventions.
 *
 * @arg memberIndex
 * @type number
 * @min 0
 * @max 2
 * @text Party Member Index
 * @desc Index of the party member in the party (0 = first slot, 1 = second, 2 = third).
 * 
 * @command showCustomBust
 * @text Show Custom Bust
 * @desc Display a specific bust image from the busts/All folder.
 *
 * @arg imageName
 * @type string
 * @text Image Name
 * @desc Name of the image file in busts/All folder (without extension).
 *
 * @arg characterName
 * @type string
 * @text Character Name
 * @desc Name to display for this character (optional).
 * 
 * @command playerBatchDialogue
 * @text Show Player bust
 * @desc Display a specific bust image from the busts/All folder.
 * @arg imageName
 * @type string
 * @text Image Name
 * @desc Name of the image file in busts/All folder (without extension).

 */
(function () {
    "use strict";

    const PLUGIN_NAME = "VisualNovelBustSystem";
    const parameters = PluginManager.parameters(PLUGIN_NAME);
    const showCharacterNames = parameters['showCharacterNames'] === 'true';
    const nameWindowX_16_9 = parseInt(parameters['nameWindowX_16_9']) || 250;
    const nameWindowY_16_9 = 420;

    // Parameters
    const bustOpacity = 255;
    const bustWidth_16_9 = 440;  // maintains 889/1200 aspect ratio
    const bustHeight_16_9 = 615; // maintains 889/1200 aspect ratio
    const bustYOffset_16_9 = 176;
    const bustOverlap = 2;
    const bustXOffset_16_9 = 245; // Right margin (50px from right edge)
    const fadeInDuration = 12;
    const fadeOutDuration = 12;
    const SpritesAssociation = (window.Sprites && window.Sprites.SpritesAssociation) || {};

    // ── window.BustPath ─────────────────────────────────────────────────────
    // Where a bust actually lives, given the loose name something asked for.
    //
    // img/busts used to be one flat folder, so every reader in the game builds
    // its path as img/busts/<name>.png and every name written into an event
    // comment, a database note or a saved profile is a bare file name. The
    // portraits of the pre-made characters have since moved into
    // img/busts/presets/ (so the bust gallery, which scans the flat folder and
    // never recurses, cannot hand somebody else a dossier's face), which would
    // have left every one of those old bare names pointing at nothing.
    //
    // This answers with the name to use under img/busts/: the bare one when the
    // file is still there, the "presets/<name>" one when it has moved, and null
    // when neither exists. Defined here because this is the first bust plugin
    // to load; DialogueSystem, CustomBustFaceSystem and the Empathize panel all
    // ask through it, so the four never disagree about a face.
    (function () {
        const cache = Object.create(null);
        const SUBFOLDERS = ["presets/"];

        function fileExists(name) {
            if (typeof Utils === "undefined" || !Utils.isNwjs || !Utils.isNwjs()) return null;
            try {
                const fs = require("fs");
                const nodePath = require("path");
                return fs.existsSync(nodePath.join(process.cwd(), "img", "busts", name + ".png"));
            } catch (e) {
                return null; // cannot tell: treat as present, the <img> fallback covers it
            }
        }

        window.BustPath = {
            // The portrait everything falls back on. It ships with the game and
            // is the one face a reader is never left without.
            FALLBACK: "img/busts/7.png",

            // "Selene" -> "presets/Selene"; "WarSniper" -> "WarSniper";
            // "img/busts/presets/Em.png" -> "presets/Em"; unknown -> null.
            //
            // A name that already carries its folder is checked like any other:
            // a dossier, a leader's record or a saved profile can name a
            // portrait that was never drawn, and answering with it would leave
            // the reader holding a path to nothing. Where the folder is wrong
            // but the file is in the flat folder, that is the answer instead.
            resolve(name) {
                const raw = String(name == null ? "" : name).trim()
                    .replace(/^\.?\/+/, "")
                    .replace(/^img\/busts\//i, "")
                    .replace(/\.png$/i, "");
                if (!raw || raw === "7" || raw === "0") return null;
                if (raw.startsWith("img/")) return null; // not a bust at all
                if (raw in cache) return cache[raw];
                let out;
                if (raw.includes("/")) {
                    const bare = raw.slice(raw.lastIndexOf("/") + 1);
                    if (fileExists(raw) !== false) out = raw;
                    else out = fileExists(bare) ? bare : null;
                } else {
                    out = raw;
                    if (fileExists(raw) === false) {
                        out = null;
                        for (const dir of SUBFOLDERS) {
                            if (fileExists(dir + raw)) { out = dir + raw; break; }
                        }
                    }
                }
                cache[raw] = out;
                return out;
            },
            // The same answer as a path something can load, fallback included.
            // Every caller that draws a portrait asks through this, so a name
            // that resolves to nothing shows the house bust rather than a
            // broken image and a load error.
            url(name, fallback = "img/busts/7.png") {
                const resolved = this.resolve(name);
                return resolved ? `img/busts/${resolved}.png` : fallback;
            },
            // Whether a loose name names a bust at all, in either folder.
            exists(name) { return this.resolve(name) != null; },
        };
    })();

    function getBustWidth() {
        return bustWidth_16_9;
    }

    function getBustHeight() {
        return bustHeight_16_9;
    }

    function addBustToScene(bust, scene) {
        if (!scene || bust.parent) return;

        // Find the window layer and insert bust before it (behind all windows)
        if (scene._windowLayer) {
            const windowLayerIndex = scene.children.indexOf(scene._windowLayer);
            if (windowLayerIndex >= 0) {
                scene.addChildAt(bust, windowLayerIndex);
                return;
            }
        }

        // Fallback: try to add before message window directly
        if (scene._messageWindow) {
            const messageWindowIndex = scene.children.indexOf(scene._messageWindow);
            if (messageWindowIndex >= 0) {
                scene.addChildAt(bust, messageWindowIndex);
                return;
            }
        }

        // Last resort: add at the end
        scene.addChild(bust);
    }

    // HTML-based name label ,  replaces the canvas CharacterNameWindow.
    // Positioned each frame above the HTML message overlay for pixel-perfect crispness.
    // _characterName is kept for compatibility with Hendrix_Localization name sync.
    class CharacterNameWindow {
        constructor() {
            this._characterName = '';
            this._visible = false;

            // Create the HTML element once
            const old = document.getElementById('vn-name-overlay');
            if (old) old.remove();

            const el = document.createElement('div');
            el.id = 'vn-name-overlay';
            this._el = el;
            document.body.appendChild(el);
        }

        setCharacterName(name) {
            this._characterName = name || '';
            if (this._el) this._el.textContent = this._characterName;
        }

        showName() {
            if (this._characterName && this._el) {
                this._el.style.display = 'block';
                this._visible = true;
                // Force a reposition on the next update after being shown.
                this._lastPosSig = null;
            }
        }

        hideName() {
            if (this._el) this._el.style.display = 'none';
            this._visible = false;
        }

        updatePosition() {
            // Position is driven by update() each frame ,  no-op here
        }

        // Called each frame by BustManager.update()
        update() {
            if (!this._el || !this._visible) return;

            // Skip the layout reads + style writes when nothing that affects the
            // overlay position has changed. The signature is built from cheap
            // property reads (no getBoundingClientRect/offsetHeight); only when it
            // differs do we perform the expensive reflow-inducing recompute below.
            const msgOverlayEl = document.getElementById('html-msg-overlay');
            const msgTextEl = document.getElementById('html-msg-text');
            const msgWinRef = SceneManager._scene && SceneManager._scene._messageWindow;
            const sig =
                (this._visible ? '1' : '0') + '|' +
                (msgOverlayEl ? msgOverlayEl.style.display : 'none') + '|' +
                (msgTextEl ? msgTextEl.style.fontSize : '') + '|' +
                (msgWinRef ? msgWinRef.x + ',' + msgWinRef.y + ',' + msgWinRef.height : '') + '|' +
                window.innerWidth + 'x' + window.innerHeight;
            if (sig === this._lastPosSig) return;
            this._lastPosSig = sig;

            // Anchor above the HTML message overlay if it exists
            const msgOverlay = msgOverlayEl;
            if (msgOverlay && msgOverlay.style.display !== 'none') {
                const mr = msgOverlay.getBoundingClientRect();
                const nameH = this._el.offsetHeight || 30;
                this._el.style.left = (mr.left + 16) + 'px';
                this._el.style.top  = (mr.top - nameH - 6) + 'px';
                // Match font size to message text
                const msgText = document.getElementById('html-msg-text');
                const baseFontPx = msgText ? parseFloat(msgText.style.fontSize) || 20 : 20;
                this._el.style.fontSize = Math.max(12, Math.round(baseFontPx * 0.72)) + 'px';
            } else {
                // Fallback: position relative to canvas using game coordinates
                const canvas = document.getElementById('gameCanvas');
                if (!canvas) return;
                const r = canvas.getBoundingClientRect();
                const sx = r.width  / Graphics.width;
                const sy = r.height / Graphics.height;
                const msgWin = SceneManager._scene && SceneManager._scene._messageWindow;
                if (!msgWin) return;
                const nameH = this._el.offsetHeight || 30;
                this._el.style.left = (r.left + (msgWin.x + 16) * sx) + 'px';
                this._el.style.top  = (r.top + msgWin.y * sy - nameH - 6) + 'px';
                this._el.style.fontSize = Math.round(20 * sy) + 'px';
            }
        }

        // Shim ,  BustManager checks for .parent to decide whether to addChild
        get parent() { return document.body; }
    }

    class BustManager {
        constructor() {
            this.characterBust = null;
            this.nameWindow = null;
            this.currentCharacterKey = null;
            this.batchDialogueMode = false;
            this.nameIsVisible = false;
            this.bustIsVisible = false;

            this.activeEventId = null;
            this.lastKnownEventId = null;
            this.hideScheduled = false;
            this.pendingBust = null;
        }

        initialize() {
            this.createBustSprites();
            if (showCharacterNames) {
                this.createNameWindow();
            }
        }

        createBustSprites() {
            this.characterBust = new Sprite();
            this.characterBust.opacity = 0;
            this.characterBust.anchor.x = 0;
            this.characterBust.anchor.y = 1;
            this.setupBustPosition(this.characterBust);
            this.updateBustHiddenPosition();
            this.characterBust.x = this.characterBust._hiddenX;
        }

        createNameWindow() {
            // HTML overlay ,  no Rectangle needed
            this.nameWindow = new CharacterNameWindow();
        }

        updateBustHiddenPosition() {
            const xOffset = bustXOffset_16_9;
            const width = getBustWidth();
            this.characterBust._hiddenX = Graphics.width + width;
            if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
                this.characterBust._targetX = (Graphics.width - width) / 2;
            } else {
                this.characterBust._targetX = Graphics.width - width - xOffset;
            }
        }

        getBustY() {
            const win = SceneManager._scene && SceneManager._scene._messageWindow;
            if (win && win.width > 0 && win.height > 0 && win.y >= Graphics.height * 0.45) {
                return win.y + bustOverlap;
            }
            return Graphics.height - bustYOffset_16_9 + bustOverlap;
        }

        setupBustPosition(sprite) {
            sprite.y = this.getBustY();
        }

        scaleBustToFit(sprite) {
            if (!sprite.bitmap || !sprite.bitmap.width || !sprite.bitmap.height) {
                sprite.bitmap.addLoadListener(() => this.scaleBustToFit(sprite));
                return;
            }
            const width = getBustWidth();
            const height = getBustHeight();
            const scaleX = width / sprite.bitmap.width;
            const scaleY = height / sprite.bitmap.height;
            const scale = Math.min(scaleX, scaleY);
            sprite.scale.x = scale;
            sprite.scale.y = scale;
        }

        // Hold the slide-in until the bitmap can actually be drawn. A bust that
        // is not in ImageManager's cache yet needs a few frames to decode, so
        // sliding at request time animates an empty sprite and the bust snaps
        // into place when the bitmap finally arrives. Only already-cached
        // busts ,  i.e. every show after the first ,  slid correctly.
        beginBustLoad(bitmap, key, fallbackImage) {
            this.pendingBust = { bitmap, key, fallback: fallbackImage || null };
            this.updatePendingBust();
        }

        // Polled every frame from update(); load listeners are not used because
        // they never fire for a bitmap that failed to load.
        updatePendingBust() {
            const pending = this.pendingBust;
            if (!pending) return;

            const { bitmap, key, fallback } = pending;
            const ready = bitmap.isReady();
            if (!ready && !bitmap.isError()) return;

            // A different bust was requested while this one was loading.
            if (this.currentCharacterKey !== key) {
                this.pendingBust = null;
                return;
            }

            if (ready && bitmap.width > 0 && bitmap.height > 0) {
                this.pendingBust = null;
                this.characterBust.bitmap = bitmap;
            } else if (fallback) {
                console.warn("Failed to load bust image, using fallback busts/7");
                // Wait on the fallback the same way rather than sliding a
                // sprite that still has nothing to draw.
                this.pendingBust = { bitmap: fallback, key, fallback: null };
                this.updatePendingBust();
                return;
            } else {
                console.error("Failed to load bust image and fallback not available");
                this.pendingBust = null;
                this.bustIsVisible = false;
                return;
            }

            this.scaleBustToFit(this.characterBust);
            this.slideIn();
        }

        getBustImageForCharacter(characterName, characterIndex) {
            if (!characterName) return null;

            if (characterName.startsWith("$") || characterName.startsWith("!") || characterName.startsWith("Objects")) {
                return "busts/7";
            }

            const spritesheetName = characterName.split('.')[0];
            const actorId = this.getCurrentActorIdFromEvent();

            // Priority 1: Check event comments for bust name
            try {
                const commentBustName = this.getBustNameFromEventComment();
                if (commentBustName) {
                    const resolved = window.BustPath.resolve(commentBustName);
                    if (resolved) return `busts/${resolved}`;
                }
            } catch (err) {
                console.warn("Error checking event comments for bust name:", err);
            }
            // A pre-made character (CharacterCreationPresets) carries their own
            // portrait, and it is the one the rest of the game already shows for
            // them: the status sheet, the equip menu and the Empathize panel all
            // read the actor's vnBust. A dossier can be played in an alternate
            // look, and every look has its own bust, so a portrait derived from
            // the walk sheet alone would show the wrong outfit (or, once the
            // dossier busts moved into img/busts/presets, nothing at all).
            // Asked before the sprite catalogue for exactly that reason.
            const presetBust = this.getPresetBustForSprite(spritesheetName, characterIndex);
            if (presetBust) return `busts/${presetBust}`;

            // NPCSim priority: use seed-randomized bust stored in profile._bustName
            if (window.NPCSim?.getBustForNPC) {
                try {
                    const interp = $gameMap?._interpreter;
                    const evId   = interp?._eventId;
                    const npcName = evId ? $gameMap.event(evId)?.event()?.name : null;
                    if (npcName) {
                        const npcBust = window.BustPath.resolve(window.NPCSim.getBustForNPC(npcName));
                        if (npcBust) return `busts/${npcBust}`;
                    }
                } catch (_) {}
            }

            if (SpritesAssociation[spritesheetName] && SpritesAssociation[spritesheetName][characterIndex]) {
                const bustName = window.BustPath.resolve(SpritesAssociation[spritesheetName][characterIndex]);
                if (bustName) return `busts/${bustName}`;
            }
            return `busts/7`;

            /*
                        // Player 1 (Actor 1) special handling
                        if (actorId === 1) {
                            // Priority 2: Check Variable 109 (Player 1 bust name)
                            const player1BustName = $gameActors.actor(1).vnBust();
                            if (player1BustName && player1BustName !== "") {
                                return `busts/${player1BustName}`;
                            }
            
                            // Priority 3: If Switch 77 is ON, use Variable 106 for monster form
                            if ($gameSwitches.value(77)) {
                                const player1MonsterName = $gameActors.actor(1).vnBattler();
                                if (player1MonsterName && player1MonsterName !== "") {
                                    return `monsters/${player1MonsterName}`;
                                }
                            }
            
                            // Priority 4: Fall back to SpritesAssociation
                        
                            return `busts/7`;
                        }
            
                        // Players 2 & 3: Use SpritesAssociation based on sprite
                        if (SpritesAssociation[spritesheetName] && SpritesAssociation[spritesheetName][characterIndex]) {
                            const bustName = SpritesAssociation[spritesheetName][characterIndex];
                            return `busts/${bustName}`;
                        }
            
                        // Fallback if sprite not found in association
                        return `busts/7`;*/
        }

        getBustNameFromEventComment() {
            try {
                const interpreter = $gameMap._interpreter;
                if (!interpreter || !interpreter._eventId) return null;

                const gameEvent = $gameMap.event(interpreter._eventId);
                if (!gameEvent) return null;

                const eventData = gameEvent.event();
                if (!eventData || !eventData.pages) return null;

                const page = eventData.pages.find(p => gameEvent.meetsConditions(p));
                if (!page || !page.list) return null;

                // Search through the event commands for comment commands
                for (const command of page.list) {
                    if (command.code === 108 || command.code === 408) { // 108 = comment, 408 = comment continuation
                        const comment = command.parameters[0];
                        if (comment && typeof comment === 'string') {
                            const trimmedComment = comment.trim();
                            // Check if comment matches a bust filename pattern
                            if (trimmedComment && !trimmedComment.includes(' ') && trimmedComment.length > 0) {
                                return trimmedComment;
                            }
                        }
                    }
                }

                return null;
            } catch (err) {
                console.error("Error extracting bust name from event comment:", err);
                return null;
            }
        }

        // The bust of a pre-made character standing on this sprite sheet, or
        // null when the sheet belongs to nobody in particular.
        //
        // Two questions, in order. Is somebody in the party wearing this sheet
        // right now? Then their own bust wins, whichever look they were taken
        // in and whatever they have been dressed as since. Otherwise, is the
        // sheet one a dossier ships (its own or one of its alternate looks)?
        // Then that dossier's bust for that look is the answer, so a scripted
        // scene showing Andreotti in his pontiff sheet gets the pontiff bust.
        getPresetBustForSprite(spritesheetName, characterIndex) {
            if (!spritesheetName) return null;
            const idx = characterIndex || 0;
            try {
                const members = ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
                for (const actor of members) {
                    if (!actor || actor.characterName() !== spritesheetName) continue;
                    if ((actor.characterIndex() || 0) !== idx) continue;
                    const bust = actor.vnBust ? actor.vnBust() : null;
                    if (bust && bust !== "7" && bust !== 0) return bust;
                }
            } catch (err) { /* no party yet (title screen, creation) */ }

            const CP = window.CharacterPresets;
            if (!CP || !CP.getCharacterPresets) return null;
            try {
                for (const preset of CP.getCharacterPresets()) {
                    const looks = CP.getPresetSkins ? CP.getPresetSkins(preset) : [preset];
                    for (const look of looks) {
                        if (!look || look.sprite !== spritesheetName) continue;
                        if ((look.spriteIndex || 0) !== idx) continue;
                        if (look.busts) return look.busts;
                    }
                }
            } catch (err) { /* dossiers not loaded */ }
            return null;
        }

        getCurrentActorIdFromEvent() {
            // Try to determine which actor is currently speaking from the event name
            const interpreter = $gameMap._interpreter;
            if (!interpreter || !interpreter._eventId) {
                return 1; // Default to Player 1
            }

            const gameEvent = $gameMap.event(interpreter._eventId);
            if (!gameEvent) {
                return 1; // Default to Player 1
            }

            const eventName = gameEvent.event().name || "";

            // Check the event's name to determine which actor it represents
            if (eventName.toLowerCase().includes('actor2') ||
                eventName.toLowerCase().includes('member2') ||
                eventName.toLowerCase().includes('party2')) {
                return 2;
            } else if (eventName.toLowerCase().includes('actor3') ||
                eventName.toLowerCase().includes('member3') ||
                eventName.toLowerCase().includes('party3')) {
                return 3;
            }

            return 1; // Default to Player 1
        }

        getCharacterDisplayName(eventId) {
            if (eventId) {
                const gameEvent = $gameMap.event(eventId);
                if (gameEvent && gameEvent.event().name) {
                    const name = gameEvent.event().name.trim();
                    if (window.NPCSocietyRegistry && window.NPCSocietyConfig) {
                        const profile = window.NPCSocietyRegistry.getProfile(name);
                        if (profile) {
                            const m = gameEvent.event().note ? gameEvent.event().note.match(/NPC-(\d+)/) : null;
                            const classId = m ? Number(m[1]) : null;
                            const className = classId ? (window.NPCSocietyConfig.CLASS_NAMES[classId] || "") : "";
                            if (className) {
                                return `${name}, ${className}`;
                            }
                        }
                    }
                    return name;
                }
            }

            const charInfo = this.getCurrentEventCharacterInfo();
            if (charInfo && charInfo.characterName) {
                const spritesheetName = charInfo.characterName.split('.')[0];
                const displayName = this.convertCamelCaseToReadable(spritesheetName);
                const nameKey = displayName.trim();
                if (window.NPCSocietyRegistry && window.NPCSocietyConfig) {
                    const profile = window.NPCSocietyRegistry.getProfile(nameKey);
                    if (profile) {
                        const ev = $gameMap.events().find(e => e?.event()?.name?.trim() === nameKey);
                        const m = ev?.event()?.note ? ev.event().note.match(/NPC-(\d+)/) : null;
                        const classId = m ? Number(m[1]) : null;
                        const className = classId ? (window.NPCSocietyConfig.CLASS_NAMES[classId] || "") : "";
                        if (className) {
                            return `${nameKey}, ${className}`;
                        }
                    }
                }
                return displayName;
            }

            return "";
        }

        convertCamelCaseToReadable(text) {
            if (!text || typeof text !== 'string') return '';

            // First replace underscores with spaces
            let result = text.replace(/_/g, ' ');

            // Insert space before uppercase letters that follow lowercase letters
            result = result.replace(/([a-z])([A-Z])/g, '$1 $2');

            // Insert space before uppercase letters followed by lowercase (for acronyms)
            result = result.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

            // Capitalize first letter of each word
            result = result.split(' ').map(word => {
                if (word.length === 0) return word;
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }).join(' ');

            return result;
        }

        getCurrentEventCharacterInfo() {
            const interpreter = $gameMap._interpreter;
            if (!interpreter || !interpreter._eventId) return null;
            const gameEvent = $gameMap.event(interpreter._eventId);
            if (!gameEvent) return null;
            const page = gameEvent.event().pages.find(p => gameEvent.meetsConditions(p));
            if (!page || !page.image || !page.image.characterName) return null;
            return {
                characterName: page.image.characterName,
                characterIndex: page.image.characterIndex,
                eventId: interpreter._eventId
            };
        }

        shouldShowBustAndName() {
            const interpreter = $gameMap._interpreter;
            if (!interpreter || !interpreter._eventId) return false;

            const gameEvent = $gameMap.event(interpreter._eventId);
            if (!gameEvent) return false;

            const eventName = gameEvent.event().name;

            if (eventName && (eventName.startsWith("EV") || eventName.startsWith("Treasure") || eventName.startsWith("Random"))) {
                return false;
            }

            const page = gameEvent.event().pages.find(p => gameEvent.meetsConditions(p));
            if (!page || !page.image) return false;

            if (!page.image.characterName || page.image.characterName === "" || page.image.characterName === "none") {
                return false;
            }

            if (page.image.characterName.toLowerCase().includes("objects/") || page.image.characterName.toLowerCase().startsWith("objects")) {
                return false;
            }

            return true;
        }

        checkImageExists(path) {
            if (Utils.isNwjs()) {
                try {
                    const fs = require('fs');
                    const nodePath = require('path');
                    const fullPath = nodePath.join(process.cwd(), 'img', path + '.png');
                    return fs.existsSync(fullPath);
                } catch (e) {
                    return false;
                }
            }
            return true;
        }

        showCustomBust(imageName, characterName = null) {
            if (!imageName) {
                console.warn("No image name provided for custom bust");
                return;
            }

            const resolvedName = window.BustPath.resolve(imageName);
            let path = resolvedName ? `busts/${resolvedName}` : `busts/7`;
            if (!this.checkImageExists(path)) {
                console.warn(`Custom bust image not found: ${path}. Using fallback busts/7.`);
                path = `busts/7`;
            }
            const key = `custom_${imageName}`;

            // Load fallback image with error handling
            let fallbackImage = null;
            try {
                fallbackImage = ImageManager.loadBitmap('img/busts/', '7');
            } catch (err) {
                console.error("Failed to load fallback bust image busts/7:", err);
                fallbackImage = null;
            }

            const sameImageDisplayed = this.currentCharacterKey === key && this.characterBust.parent;

            if (showCharacterNames && this.nameWindow) {
                let displayName = characterName || this.convertCamelCaseToReadable(imageName);
                const nameKey = displayName.trim();
                if (window.NPCSocietyRegistry && window.NPCSocietyConfig) {
                    const profile = window.NPCSocietyRegistry.getProfile(nameKey);
                    if (profile) {
                        const ev = $gameMap.events().find(e => e?.event()?.name?.trim() === nameKey);
                        const m = ev?.event()?.note ? ev.event().note.match(/NPC-(\d+)/) : null;
                        const classId = m ? Number(m[1]) : null;
                        const className = classId ? (window.NPCSocietyConfig.CLASS_NAMES[classId] || "") : "";
                        if (className) {
                            displayName = `${nameKey}, ${className}`;
                        }
                    }
                }
                this.nameWindow.setCharacterName(displayName);
                this.nameWindow.showName();
                this.nameIsVisible = true;
            }

            if (sameImageDisplayed) {
                return;
            }

            try {
                const bitmap = ImageManager.loadBitmap('img/', path);
                this.currentCharacterKey = key;
                const scene = SceneManager._scene;
                if (!this.characterBust.parent && scene) addBustToScene(this.characterBust, scene);

                this.beginBustLoad(bitmap, key, fallbackImage);
                this.bustIsVisible = true;

                this.activeEventId = 'custom';
                this.hideScheduled = false;
            } catch (err) {
                console.warn("Failed to load custom bust image:", path, "using fallback", err);
                if (fallbackImage) {
                    this.currentCharacterKey = key;
                    const scene = SceneManager._scene;
                    if (!this.characterBust.parent && scene) addBustToScene(this.characterBust, scene);
                    this.beginBustLoad(fallbackImage, key, null);
                    this.bustIsVisible = true;
                    this.activeEventId = 'custom';
                    this.hideScheduled = false;
                } else {
                    console.error("Fallback bust image not available, bust display failed");
                    this.bustIsVisible = false;
                }
            }
        }

        showBusts() {
            const charInfo = this.getCurrentEventCharacterInfo();

            const shouldShow = this.shouldShowBustAndName();

            if (!shouldShow || !charInfo) {
                this.bustIsVisible = false;
                return;
            }

            const { characterName, characterIndex, eventId } = charInfo;
            const key = `${characterName}_${characterIndex}`;

            // Load fallback image with error handling
            let fallbackImage = null;
            try {
                fallbackImage = ImageManager.loadBitmap('img/busts/', '7');
            } catch (err) {
                console.error("Failed to load fallback bust image busts/7:", err);
                fallbackImage = null;
            }

            this.activeEventId = eventId;
            this.lastKnownEventId = eventId;
            this.hideScheduled = false;

            // Update position based on speaker in dual screen mode
            let targetX = this.characterBust._targetX;
            if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
                const activator = $gameMessage._eventActivator;
                const width = getBustWidth();
                if (activator === "p1") {
                    targetX = 0; // Left side
                } else if (activator === "p2") {
                    targetX = Graphics.width - width; // Right side
                } else {
                    targetX = (Graphics.width - width) / 2; // Center
                }
            } else {
                const xOffset = bustXOffset_16_9;
                const width = getBustWidth();
                targetX = Graphics.width - width - xOffset;
            }

            const targetChanged = targetX !== this.characterBust._targetX;
            this.characterBust._targetX = targetX;

            if (this.currentCharacterKey === key && this.characterBust.parent) {
                if (targetChanged) {
                    this.slideIn();
                }
                if (showCharacterNames && this.nameWindow && !this.nameIsVisible) {
                    this.nameWindow.showName();
                    this.nameIsVisible = true;
                }
                this.bustIsVisible = true;
                return;
            }

            let path = this.getBustImageForCharacter(characterName, characterIndex);
            if (path) {
                if (!this.checkImageExists(path)) {
                    console.warn(`Bust image not found: ${path}. Using fallback busts/7.`);
                    path = `busts/7`;
                }
                try {
                    const bitmap = ImageManager.loadBitmap('img/', path);
                    this.currentCharacterKey = key;
                    const scene = SceneManager._scene;
                    if (!this.characterBust.parent && scene) addBustToScene(this.characterBust, scene);

                    if (showCharacterNames && this.nameWindow) {
                        const displayName = this.getCharacterDisplayName(eventId);
                        this.nameWindow.setCharacterName(displayName);
                        this.nameWindow.showName();
                        this.nameIsVisible = true;
                    }

                    this.beginBustLoad(bitmap, key, fallbackImage);
                    this.bustIsVisible = true;
                } catch (err) {
                    console.warn("Failed to load bust image:", path, "using fallback", err);
                    if (fallbackImage) {
                        this.currentCharacterKey = key;
                        const scene = SceneManager._scene;
                        if (!this.characterBust.parent && scene) addBustToScene(this.characterBust, scene);

                        if (showCharacterNames && this.nameWindow) {
                            const displayName = this.getCharacterDisplayName(eventId);
                            this.nameWindow.setCharacterName(displayName);
                            this.nameWindow.showName();
                            this.nameIsVisible = true;
                        }

                        this.beginBustLoad(fallbackImage, key, null);
                        this.bustIsVisible = true;
                    } else {
                        console.error("Fallback bust image not available, bust display failed");
                        this.bustIsVisible = false;
                    }
                }
            }
        }

        hideBusts() {
            if (this.characterBust.parent) this.slideOut();

            if (showCharacterNames && this.nameWindow) {
                this.nameWindow.hideName();
                this.nameIsVisible = false;
            }

            this.currentCharacterKey = null;
            this.batchDialogueMode = false;
            this.bustIsVisible = false;
            this.activeEventId = null;
            this.hideScheduled = false;
            this.pendingBust = null;
        }

        enableBatchDialogue() {
            this.batchDialogueMode = true;
            this.showBusts();
        }

        isStillInActiveEvent() {
            const interpreter = $gameMap._interpreter;
            if (!interpreter) return false;
            return interpreter._eventId === this.activeEventId;
        }

        hasEventEnded() {
            const interpreter = $gameMap._interpreter;
            if (!interpreter) return true;
            if (!interpreter.isRunning()) return true;
            if (interpreter._eventId !== this.activeEventId && this.activeEventId !== null) return true;
            return false;
        }

        shouldAutoHide() {
            if (this.batchDialogueMode) return false;
            if (this.isStillInActiveEvent()) return false;
            return this.hasEventEnded();
        }

        isBustVisible() {
            return this.bustIsVisible && this.characterBust.parent && this.characterBust.opacity > 0;
        }

        isMessageWindowClosed() {
            const scene = SceneManager._scene;
            if (!scene || !scene._messageWindow) return true;
            return !scene._messageWindow.isOpen() && !scene._messageWindow.isOpening();
        }

        onResolutionChange() {
            this.updateBustHiddenPosition();

            // Update Y position as well
            this.characterBust.y = this.getBustY();

            if (this.characterBust.parent) {
                if (this.characterBust._slideDuration > 0) {
                    this.characterBust._slideTarget = this.characterBust._targetX;
                } else if (this.bustIsVisible) {
                    this.characterBust.x = this.characterBust._targetX;
                }
            }

            if (this.nameWindow) {
                this.nameWindow.updatePosition();
            }
        }

        slideIn() {
            this.updateBustHiddenPosition();
            // Start off-screen whenever nothing is currently drawn, so the
            // slide is a real slide and not a fade in place (the sprite can be
            // left anywhere by a resolution change or an interrupted slide-out).
            if (this.characterBust.opacity <= 0) {
                this.characterBust.x = this.characterBust._hiddenX;
            }
            this.characterBust._slideTarget = this.characterBust._targetX;
            this.characterBust._slideDuration = fadeInDuration;
            this.characterBust._slideType = 'in';
        }

        slideOut() {
            this.characterBust._slideTarget = this.characterBust._hiddenX;
            this.characterBust._slideDuration = fadeOutDuration;
            this.characterBust._slideType = 'out';
        }

        update() {
            this.updatePendingBust();

            const s = this.characterBust;
            if (s._slideDuration > 0) {
                const delta = (s._slideTarget - s.x) / s._slideDuration;
                s.x += delta;
                s._slideDuration -= 1;

                if (s._slideType === 'in') {
                    s.opacity = bustOpacity * (1 - s._slideDuration / fadeInDuration);
                } else if (s._slideType === 'out') {
                    s.opacity = bustOpacity * (s._slideDuration / fadeOutDuration);
                }
            } else if (s._slideType === 'out' && s.parent) {
                s.parent.removeChild(s);
                s.opacity = 0;
                this.bustIsVisible = false;
            }

            if (this.nameWindow) {
                this.nameWindow.update();
            }

            if (this.bustIsVisible && !this.batchDialogueMode) {
                const messageWindowClosed = this.isMessageWindowClosed();
                const eventEnded = this.hasEventEnded();

                if (messageWindowClosed && eventEnded && !this.hideScheduled) {
                    this.hideScheduled = true;
                    this.hideBusts();
                }

                if (!messageWindowClosed && this.isStillInActiveEvent()) {
                    this.hideScheduled = false;
                }
            }
        }
    }

    // Scene setup
    //
    // NPC/DialogueSystem.js loads after this file and installs its own, larger
    // BustManager on this same property, so the one built here was overwritten
    // before it ever ran: an orphaned sprite and an orphaned #vn-name-overlay
    // node left on the page every time the map started, while the update hook
    // below then drove DialogueSystem's manager a SECOND time every frame - its
    // slide interpolation among the rest, which is wrong at twice the rate.
    //
    // Everything else in this file already works on scene._bustManager, which
    // means it has always been driving DialogueSystem's. So the manager is left
    // to its one owner and this file stops making a second.
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        if (!this._bustManager) {
            // Nothing else claimed it - DialogueSystem is disabled or absent -
            // so the busts here are better than none.
            this._bustManager = new BustManager();
            this._bustManager._vnOwned = true;
            this._bustManager.initialize();
        }
    };

    // The name label is a DOM element on document.body, so it does not get torn down
    // with the map scene. Hide it when leaving the map so it does not linger over
    // battle/menu scenes (it is re-shown on the next message).
    const _Scene_Map_stop = Scene_Map.prototype.stop;
    Scene_Map.prototype.stop = function () {
        _Scene_Map_stop.call(this);
        if (this._bustManager) this._bustManager.hideBusts();
        const nameOverlay = document.getElementById('vn-name-overlay');
        if (nameOverlay) nameOverlay.style.display = 'none';
    };

    // The manager is updated by whoever owns it. DialogueSystem drives the one
    // it installs; this only drives a manager built above because nothing else
    // claimed the property. Updating unconditionally here is what ran the live
    // manager twice a frame.
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        if (this._bustManager && this._bustManager._vnOwned) this._bustManager.update();
    };

    // Hook into resolution changes. Same ownership rule: DialogueSystem carries
    // its own Graphics.resize hook, so answering for its manager here would
    // re-lay the busts twice on every resolution change.
    const _Graphics_resize = Graphics.resize;
    Graphics.resize = function (width, height) {
        _Graphics_resize.call(this, width, height);

        const scene = SceneManager._scene;
        if (scene && scene._bustManager && scene._bustManager._vnOwned) {
            scene._bustManager.onResolutionChange();
        }
    };

    // Auto-show on message start. Skipped while an external exchange (see
    // DialogueSystem.js's startNPCExchange) is driving scene._bustManager one
    // line at a time: this same-named showBusts() re-derives the bust from
    // $gameMap._interpreter's own event and would stomp back over whichever
    // speaker the exchange just set (e.g. the party leader's own portrait).
    const _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        _Window_Message_startMessage.call(this);
        const scene = SceneManager._scene;
        if (scene && scene._bustManager && !scene._bustManager.exchangeMode) scene._bustManager.showBusts();
    };

    const _Window_Message_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        _Window_Message_terminateMessage.call(this);
        const scene = SceneManager._scene;
        if (scene && scene._bustManager && scene._bustManager.shouldAutoHide()) {
            scene._bustManager.hideBusts();
        }
    };

    // Custom parchment styling and overrides for Window_ChoiceList
    Window_ChoiceList.prototype._refreshBack = function () {
        // Handled by our custom D&D background sprite
    };

    Window_ChoiceList.prototype._refreshFrame = function () {
        // Handled by our custom D&D background sprite
    };

    const _Window_ChoiceList_initialize = Window_ChoiceList.prototype.initialize;
    Window_ChoiceList.prototype.initialize = function () {
        _Window_ChoiceList_initialize.apply(this, arguments);
        this.createUIParchment();
        this.resetFontSettings();
    };

    Window_ChoiceList.prototype.createUIParchment = function () {
        if (this._dndParchmentSprite) {
            this.removeChild(this._dndParchmentSprite);
        }
        this._dndParchmentSprite = new Sprite();
        // Add as first child to sit nicely behind everything else (text contents)
        this.addChildAt(this._dndParchmentSprite, 0);
        this.refreshUIParchment();
    };

    Window_ChoiceList.prototype.refreshUIParchment = function () {
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

    const _Window_ChoiceList_move = Window_ChoiceList.prototype.move;
    Window_ChoiceList.prototype.move = function (x, y, width, height) {
        const sizeChanged = this.width !== width || this.height !== height;
        _Window_ChoiceList_move.apply(this, arguments);
        if (sizeChanged && this._dndParchmentSprite) {
            this.refreshUIParchment();
        }
    };

    const _Window_ChoiceList_update = Window_ChoiceList.prototype.update;
    Window_ChoiceList.prototype.update = function () {
        _Window_ChoiceList_update.apply(this, arguments);
        if (this.opacity !== 255) {
            this.opacity = 255;
        }
        if (!this._dndParchmentSprite) {
            this.createUIParchment();
        } else if (!this._dndParchmentSprite.bitmap || 
                  this._dndParchmentSprite.bitmap.width !== this.width || 
                  this._dndParchmentSprite.bitmap.height !== this.height) {
            this.refreshUIParchment();
        }
    };

    Window_ChoiceList.prototype.resetFontSettings = function () {
        Window_Base.prototype.resetFontSettings.call(this);
        this.contents.fontFace = 'Bitter';
        this.contents.fontSize = 24;
    };

    Window_ChoiceList.prototype.resetTextColor = function () {
        this.changeTextColor('#58180D');
    };

    const _Window_ChoiceList_updatePlacement = Window_ChoiceList.prototype.updatePlacement;
    Window_ChoiceList.prototype.updatePlacement = function () {
        _Window_ChoiceList_updatePlacement.call(this);

        const scene = SceneManager._scene;
        const messageWindow = scene ? scene._messageWindow : null;
        if (messageWindow) {
            // Align flush with the right end of the textbox
            let targetX = messageWindow.x + messageWindow.width - this.width;
            
            // Default: position exactly 10px above the top of the textbox
            let targetY = messageWindow.y - this.height - 10;
            
            // If placing above the textbox pushes it off the top of the screen, place it below the textbox instead
            if (targetY < 10) {
                targetY = messageWindow.y + messageWindow.height + 10;
            }
            
            // Clamp both coordinates to ensure the window is always 100% within safe screen boundaries
            this.x = Math.max(10, Math.min(targetX, Graphics.boxWidth - this.width - 10));
            this.y = Math.max(10, Math.min(targetY, Graphics.boxHeight - this.height - 10));
        }
    };

    Window_ChoiceList.prototype.setBackgroundType = function (type) {
        // Force normal background type (0) so it always renders the beautiful parchment BG
        Window_Base.prototype.setBackgroundType.call(this, 0);
    };
    // Global message window width override: always 816px wide, centered
    const MESSAGE_WINDOW_WIDTH = 800;

    function overrideMessageWindowRect(SceneClass) {
        const _orig = SceneClass.prototype.messageWindowRect;
        if (!_orig) return;
        SceneClass.prototype.messageWindowRect = function () {
            const rect = _orig.call(this);
            rect.width = MESSAGE_WINDOW_WIDTH;
            rect.x = Math.floor((Graphics.boxWidth - MESSAGE_WINDOW_WIDTH) / 2);
            return rect;
        };
    }

    overrideMessageWindowRect(Scene_Map);
    overrideMessageWindowRect(Scene_Battle);
    // Manual commands
    PluginManager.registerCommand(PLUGIN_NAME, "showBust", () => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.showBusts();
    });

    PluginManager.registerCommand(PLUGIN_NAME, "hideBusts", () => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) scene._bustManager.hideBusts();
    });

    PluginManager.registerCommand(PLUGIN_NAME, "batchDialogue", () => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) {
            scene._bustManager.enableBatchDialogue();
        }
    });

    PluginManager.registerCommand(PLUGIN_NAME, "setPartyBust", (args) => {
        const scene = SceneManager._scene;
        if (!scene || !scene._bustManager) return;
        const index = Number(args.memberIndex) || 0;
        const member = (typeof $gameParty !== "undefined" && $gameParty)
            ? $gameParty.members()[index]
            : null;
        if (!member) return;
        // Assign a custom bust from img/busts named after the party member; the
        // manager falls back to busts/7 if no matching image exists.
        const name = member.name();
        scene._bustManager.showCustomBust(name, name);
    });

    PluginManager.registerCommand(PLUGIN_NAME, "playerBatchDialogue", (args) => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) {
            scene._bustManager.enableBatchDialogue();
            if (args && args.imageName) {
                scene._bustManager.showCustomBust(args.imageName);
            }
        }
    });

    PluginManager.registerCommand(PLUGIN_NAME, "showCustomBust", (args) => {
        const scene = SceneManager._scene;
        if (scene && scene._bustManager) {
            scene._bustManager.showCustomBust(args.imageName, args.characterName);
        }
    });

})();