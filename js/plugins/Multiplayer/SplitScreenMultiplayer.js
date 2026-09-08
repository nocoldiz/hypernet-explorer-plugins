/*:
 * @target MZ
 * @plugindesc v2.1.0 - Unified Split-Screen Local Multiplayer with Gamepad Support + Universal Minigame Hot-Seat.
 * @author Omni-Lex (Unification of SplitScreenMultiplayer & SplitScreenTwoPlayer)
 * @help
 * This plugin implements a high-performance local split-screen system.
 *
 * --- FEATURES ---
 * - TRUE SPLIT-SCREEN: Independent viewports for both players using PIXI masks.
 * - DYNAMIC MERGING: Viewports merge into one when players are close.
 * - SMART INPUT: Automatically detects and assigns gamepads.
 * - P2 AGENCY: Player 2 can interact with events and triggers.
 * - THE PARTY STAYS WHOLE: a session hands Player 2 one of the party rather
 *   than recruiting anybody, and nobody is dropped to make room. Whoever
 *   neither player is holding walks themselves (Core/AutoIdleExplorer.js).
 * - HANDING OVER A BODY: either player can take over a member the CPU is
 *   walking, and the member they let go of is handed back to the CPU. Player 1
 *   does it with Tab (the usual lead switch), Player 2 with the pad's X button
 *   or the P2 switch key.
 * - UNIFIED MENU: Managed via a dedicated "Split-Screen" menu scene.
 * - MINIGAME HOT-SEAT: Player 2 (2nd gamepad, or the numpad on a shared
 *   keyboard) can drive ANY registered minigame scene even without a
 *   split-screen overworld session. Real-time arcade carts let either player
 *   steer; turn-based games (Chess, Pool, Bowling) become hot-seat. Plugins
 *   can opt a scene in with $gameSplitScreen.registerMinigameScene("Scene_X").
 *
 * --- SETUP ---
 * 1. Create an event named "Player 2" on your maps to define the spawn point.
 * 2. Access the "Multiplayer" (Local) menu via the Title or Pause screen.
 * 3. Configure controls and orientation in the plugin parameters.
 *
 * @param ---General---
 * @default
 *
 * @param Player2EventName
 * @text Player 2 Event Name
 * @desc The name of the event on the map that marks Player 2's spawn point.
 * @type text
 * @default Player 2
 *
 * @param ProximityThreshold
 * @text Proximity Threshold (tiles)
 * @desc How close (in tiles) players must be to merge into single-screen.
 * @type number
 * @min 1
 * @max 30
 * @default 8
 *
 * @param SplitOrientation
 * @text Split Orientation
 * @desc How the screen is split for two players.
 * @type select
 * @option Vertical (Left/Right)
 * @value vertical
 * @option Horizontal (Top/Bottom)
 * @value horizontal
 * @default vertical
 *
 * @param AutoStartSplitScreen
 * @text Auto-Start Split-Screen
 * @desc Automatically start a split-screen session with a random character on new game.
 * @type boolean
 * @default false
 *
 * @param ---Character Pool---
 * @default
 *
 * @param CharacterPool
 * @text Character Image Pool
 * @desc JSON array of character image names for random P2 selection.
 * @type text
 * @default ["NPCs/!$WarSniper1","NPCs/!$SunCultist1","NPCs/!$GeniusGeneral1"]
 *
 * @param CharacterIndexPool
 * @text Character Index Pool
 * @desc JSON array of character indexes (0-7) matching the pool above.
 * @type text
 * @default [0,0,0]
 *
 * @param ---Keyboard Controls---
 * @default
 *
 * @param P2KeyUp
 * @text P2 Key Up
 * @default w
 *
 * @param P2KeyDown
 * @text P2 Key Down
 * @default s
 *
 * @param P2KeyLeft
 * @text P2 Key Left
 * @default a
 *
 * @param P2KeyRight
 * @text P2 Key Right
 * @default d
 *
 * @param P2KeyAction
 * @text P2 Key Action (OK)
 * @default e
 *
 * @param P2KeyDash
 * @text P2 Key Dash (Shift)
 * @default q
 *
 * @param P2KeySwitch
 * @text P2 Key Switch Body
 * @desc Hands Player 2 the next party member the CPU is walking, and the CPU the one Player 2 lets go of.
 * @default r
 *
 * @param ---Gamepad---
 * @default
 *
 * @param P2StickDeadzone
 * @text P2 Left Stick Deadzone
 * @desc Deadzone threshold for the left analog stick (0.0-1.0).
 * @type text
 * @default 0.25
 *
 */

(() => {
    "use strict";

    const PLUGIN_NAME = "SplitScreenMultiplayer";
    const params = PluginManager.parameters(PLUGIN_NAME);

    const P2_EVENT_NAME = String(params["Player2EventName"] || "Player2");
    const PROXIMITY = Number(params["ProximityThreshold"] || 8);
    const SPLIT_DIR = String(params["SplitOrientation"] || "vertical");
    const AUTO_START = params["AutoStartSplitScreen"] === "true";

    let CHAR_POOL, INDEX_POOL;

    const SKAB_POOL = [
        "!$11", "!$14", "!$19", "!$2", "!$21", "!$28", "!$3", "!$32", "!$33", "!$46", "!$49", "!$59",
        "!$AirlinePilot", "!$AlienDargos", "!$AlienGrey", "!$AlienTrucker", "!$AlpineGuide", "!$Anarchist", "!$AnarchistSamurai",
        "!$AncientWitch", "!$AndroidArchpriest", "!$AndroidExperiment", "!$Archivist", "!$ArchivistBackpacker", "!$ArchivistGuard",
        "!$ArcticWorker", "!$AvianCommando", "!$AvianNoble", "!$BotGuardian", "!$BotSamurai", "!$BotSpaceman", "!$Catboy",
        "!$CatCourier", "!$CyberWitch", "!$DesertPunk", "!$Doctor2", "!$ElvenArchmage", "!$ElvenPirate", "!$ElvenSpacer",
        "!$EM", "!$emtest2", "!$Enchantress", "!$ExoticBard", "!$Farmer", "!$Fisherman", "!$GnomeExplorer", "!$GoblinIllusionist",
        "!$GoblinRecruit", "!$GoblinShogun", "!$GoblinWitch", "!$HighCommand", "!$KillerBot", "!$KoboldAssassin", "!$KoboldPunk",
        "!$LeatherDaddy", "!$Lich", "!$Madman", "!$Mafia", "!$Noblewoman", "!$Nun", "!$Nurse2", "!$OperaSinger",
        "!$OrcSamurai", "!$OrcSecretary", "!$PirateAdventurer", "!$Porcupine", "!$PrimaryDoctor", "!$Samurai", "!$SchoolTeacher",
        "!$SwordInstructor", "!$TarotWitch", "!$TribalChief", "!$VillageSpritist", "!$VoidPerson", "!$VoidSpacer", "!$VoidWorm",
        "!$WarManager", "!$WarPilot", "!$WastelandDJ", "!$WastelandParamedic", "!$Witch1", "46", "49", "59", "emtest2"
    ].map(name => "Skab/" + name);

    try {
        CHAR_POOL = SKAB_POOL;
        INDEX_POOL = SKAB_POOL.map(name => name.includes("!$") ? 0 : 0); // Default to 0 for index
    } catch (e) {
        CHAR_POOL = SKAB_POOL;
        INDEX_POOL = SKAB_POOL.map(name => 0);
    }

    const P2_KEYS = {
        up: String(params["P2KeyUp"] || "w").toLowerCase(),
        down: String(params["P2KeyDown"] || "s").toLowerCase(),
        left: String(params["P2KeyLeft"] || "a").toLowerCase(),
        right: String(params["P2KeyRight"] || "d").toLowerCase(),
        action: String(params["P2KeyAction"] || "e").toLowerCase(),
        dash: String(params["P2KeyDash"] || "q").toLowerCase(),
        switch: String(params["P2KeySwitch"] || "r").toLowerCase()
    };

    const P2_STICK_DEAD = parseFloat(params["P2StickDeadzone"] || "0.25");

    const getKeyCode = (char) => {
        // A single digit in the config means a numpad key (the P2 scheme is
        // numpad 8/2/4/6 to move, 5 to confirm). "8".charCodeAt(0) is 56, the
        // TOP-ROW digit, so mapping by char code would hijack the wrong keys.
        // Numpad key codes are 96 + digit (Numpad0 = 96 ... Numpad9 = 105).
        if (/^[0-9]$/.test(char)) return 96 + Number(char);
        return char.toUpperCase().charCodeAt(0);
    };

    // Map P2 keys in Input.keyMapper for robust handling
    Input.keyMapper[getKeyCode(P2_KEYS.up)] = "p2_up";
    Input.keyMapper[getKeyCode(P2_KEYS.down)] = "p2_down";
    Input.keyMapper[getKeyCode(P2_KEYS.left)] = "p2_left";
    Input.keyMapper[getKeyCode(P2_KEYS.right)] = "p2_right";
    Input.keyMapper[getKeyCode(P2_KEYS.action)] = "p2_action";
    Input.keyMapper[getKeyCode(P2_KEYS.dash)] = "p2_dash";
    Input.keyMapper[getKeyCode(P2_KEYS.switch)] = "p2_switch";

    // Numpad
    Input.keyMapper[104] = "p2_up";     // Numpad 8
    Input.keyMapper[98] = "p2_down";    // Numpad 2
    Input.keyMapper[100] = "p2_left";   // Numpad 4
    Input.keyMapper[102] = "p2_right";  // Numpad 6
    Input.keyMapper[96] = "p2_action";  // Numpad 0
    Input.keyMapper[101] = "p2_action"; // Numpad 5
    Input.keyMapper[110] = "p2_action"; // Numpad .
    Input.keyMapper[107] = "p2_switch"; // Numpad +

    // =========================================================================
    // I18N Helper for Traits
    // =========================================================================
    let _traitsI18nData = null;

    const resolveI18nPath = (path, obj) => {
        if (!path || !obj) return null;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    const loadTraitsI18n = async () => {
        const lang = ConfigManager.language || "en";
        const url = `js/i18n/${lang}/traits.json`;
        try {
            const response = await fetch(url);
            _traitsI18nData = await response.json();
            return _traitsI18nData;
        } catch (e) {
            console.error("SplitScreenMultiplayer: Failed to load i18n data from " + url, e);
            return null;
        }
    };

    // =========================================================================
    // GamepadManager (Smart Detection)
    // =========================================================================
    class GamepadManager {
        // navigator.getGamepads() is a SPARSE array keyed by each pad's .index, so
        // two connected controllers may sit at positions 0 and 2 (with 1 == null)
        // after a disconnect/reconnect or when a phantom HID device claims a slot.
        // Always derive assignments from the real, sorted list of connected indices
        // rather than assuming pads occupy positions 0 and 1 contiguously.
        static getConnectedIndices() {
            const gps = navigator.getGamepads ? navigator.getGamepads() : [];
            const indices = [];
            for (let i = 0; i < gps.length; i++) {
                const gp = gps[i];
                // Match the engine's Input._pollGamepads: only count pads that are
                // actually connected and report inputs. navigator.getGamepads()
                // routinely returns stale ghosts (connected === false) and, on
                // Windows, lists one physical pad twice (XInput + DirectInput HID,
                // the latter with no .buttons activity). Counting those phantoms
                // inflates the list so "P2 = idx[1]" points at a dead device and
                // the real second controller never gets read.
                if (!gp || gp.connected === false) continue;
                if (!gp.buttons || gp.buttons.length === 0) continue;
                indices.push(gp.index);
            }
            indices.sort((a, b) => a - b);
            return indices;
        }

        static getConnectedCount() {
            return this.getConnectedIndices().length;
        }

        static getP2GamepadIndex() {
            const idx = this.getConnectedIndices();
            // If 2+ controllers: P1=first, P2=second. If 1 controller: P1=KB, P2=first.
            if (idx.length >= 2) return idx[1];
            if (idx.length === 1) return idx[0];
            return -1;
        }

        static getP1GamepadIndex() {
            const idx = this.getConnectedIndices();
            return idx.length >= 2 ? idx[0] : -1; // P1 only gets a gamepad if 2+ are connected
        }

        static isButtonPressed(gpIndex, btnIndex) {
            if (gpIndex < 0) return false;
            const gp = navigator.getGamepads()[gpIndex];
            return gp && gp.buttons[btnIndex] && gp.buttons[btnIndex].pressed;
        }

        static getAxisValue(gpIndex, axisIndex) {
            if (gpIndex < 0) return 0;
            const gp = navigator.getGamepads()[gpIndex];
            if (!gp || !gp.axes) return 0;
            const val = gp.axes[axisIndex];
            return Math.abs(val) > P2_STICK_DEAD ? val : 0;
        }

        // Diagnostic: log every pad slot the browser exposes plus the P1/P2
        // assignment. Call window.SSGamepadDebug() from the console while two
        // controllers are plugged in to see whether the second pad is detected,
        // at which index, and with which button mapping (non-"standard" pads put
        // the D-Pad on a hat axis, so only the analog stick will move P2).
        // i18n-ignore-start  console diagnostic, never shown in game
        static dumpState() {
            const gps = navigator.getGamepads ? navigator.getGamepads() : [];
            const rows = [];
            for (let i = 0; i < gps.length; i++) {
                const gp = gps[i];
                if (!gp) { rows.push(`[slot ${i}] <empty>`); continue; }
                const pressed = gp.buttons
                    ? gp.buttons.map((b, n) => (b && b.pressed ? n : null)).filter(n => n !== null)
                    : [];
                rows.push(
                    `[slot ${i}] index=${gp.index} connected=${gp.connected} ` +
                    `mapping="${gp.mapping}" id="${gp.id}" ` +
                    `buttons=${gp.buttons ? gp.buttons.length : 0} pressed=[${pressed.join(",")}] ` +
                    `axes=[${(gp.axes || []).map(a => a.toFixed(2)).join(",")}]`
                );
            }
            console.log(
                "[SplitScreen] gamepad diagnostic\n" +
                `  connected indices : [${this.getConnectedIndices().join(",")}]\n` +
                `  P1 gamepad index  : ${this.getP1GamepadIndex()} (engine input)\n` +
                `  P2 gamepad index  : ${this.getP2GamepadIndex()} (direct read)\n` +
                (rows.length ? "  " + rows.join("\n  ") : "  <no pads exposed>")
            );
        }
        // i18n-ignore-end
    }
    window.SSGamepadDebug = () => GamepadManager.dumpState();

    // Surface connect/disconnect events so the second controller's index and
    // mapping are visible the moment it is plugged in (the usual reason a 2nd
    // pad "doesn't work" is a phantom/duplicate slot or a non-standard mapping).
    window.addEventListener("gamepadconnected", (e) => {
        const gp = e.gamepad;
        console.log(
            `[SplitScreen] gamepad connected: index=${gp.index} mapping="${gp.mapping}" id="${gp.id}". ` +
            `Run window.SSGamepadDebug() to verify P1/P2 assignment.`  // i18n-ignore  console diagnostic
        );
    });
    window.addEventListener("gamepaddisconnected", (e) => {
        console.log(`[SplitScreen] gamepad disconnected: index=${e.gamepad.index} id="${e.gamepad.id}"`);
    });

    // =========================================================================
    // Equipment Lock
    // =========================================================================
    const _Game_Actor_isEquipChangeOk = Game_Actor.prototype.isEquipChangeOk;
    Game_Actor.prototype.isEquipChangeOk = function (slotId) {
        if (this._p2Generated) return false;
        return _Game_Actor_isEquipChangeOk.call(this, slotId);
    };

    // Only ONE follower is hidden while a session runs: the member Player 2 is
    // holding, who is drawn as the P2 avatar instead and would otherwise stand
    // beside themselves. Everybody else keeps walking, because the party is no
    // longer emptied for a session and whoever neither player holds is living
    // their own life (Core/AutoIdleExplorer.js).
    const _Game_Followers_update = Game_Followers.prototype.update;
    Game_Followers.prototype.update = function () {
        _Game_Followers_update.call(this);
        if (SplitScreenManager.active && SplitScreenManager.p2Event) {
            // Only write opacity when it isn't already 0, so nothing is set on
            // every follower every frame.
            this._data.forEach(follower => {
                if (SplitScreenManager.isP2Follower(follower) && follower.opacity() !== 0) {
                    follower.setOpacity(0);
                }
            });
        }
    };

    // Disable sprinting in split-screen for Player 1
    const _Game_Player_isDashing = Game_Player.prototype.isDashing;
    Game_Player.prototype.isDashing = function () {
        if (SplitScreenManager.active) return false;
        return _Game_Player_isDashing.call(this);
    };

    const _Game_Follower_isVisible = Game_Follower.prototype.isVisible;
    Game_Follower.prototype.isVisible = function () {
        // The body Player 2 holds is not a follower: it is walked by the second
        // pad and drawn as the avatar. The rest of the party is.
        if (SplitScreenManager.active && SplitScreenManager.p2Event &&
            SplitScreenManager.isP2Follower(this)) return false;
        return _Game_Follower_isVisible.call(this);
    };

    // =========================================================================
    // Identify roaming/local NPC events on the current map so they can be offered
    // as split-screen companions. Mirrors NPCSystem's tag conventions (AI / local)
    // and the NPC-<class> note used by NPCSystemParty, while excluding system
    // events (map exits, the Player2 avatar, and graphic-less shop counters).
    function isNPCEvent(data) {
        if (!data || !data.name) return false;
        const name = data.name.trim();
        if (!name || name === P2_EVENT_NAME) return false;
        if (/^(House|Transfer|Door|Teleport|Delivery|Room|Plant|Animal)/i.test(name)) return false;
        const note = data.note || "";
        if (/\bshop\b/i.test(note)) return false;
        return /\bai\b/i.test(note) || /\blocal\b/i.test(note) || /NPC-\d+/i.test(note);
    }

    // SplitScreenManager
    // =========================================================================
    const SplitScreenManager = {
        active: false,
        p2EventName: P2_EVENT_NAME,
        p2CharName: "",
        p2CharIndex: 0,
        p2Event: null,
        isSplit: false,
        p2Input: { up: false, down: false, left: false, right: false, action: false, dash: false, cancel: false, menu: false, swap: false },
        _prevP2Input: { up: false, down: false, left: false, right: false, action: false, dash: false, cancel: false, menu: false, swap: false },
        _savedPartyIds: [],
        vehicleDriver: null, // 'p1' or 'p2'
        _p2InteractLatch: false, // blocks P2 action re-firing map events until released

        init() {
            this.active = false;
            this.p2Event = null;
            this.isSplit = false;
            this._savedPartyIds = [];
            this._p2ActorId = 0;
            this._p2SpawnAt = null;
        },

        resolveP2Character() {
            const actor = this.p2Actor() || (($gameParty && $gameParty.members()[1]) || null);
            if (actor) {
                this.p2CharName = actor.characterName();
                this.p2CharIndex = actor.characterIndex();
                this._p2ActorId = actor.actorId();
            } else {
                // Fallback
                this.p2CharName = "";
                this.p2CharIndex = 0;
            }
        },

        // ------------------------------------------------------ who holds whom
        // A session no longer empties the party down to two: everybody stays,
        // Player 2 is handed ONE of them, and whoever neither player is holding
        // walks themselves under the loose layer (Core/AutoIdleExplorer.js).
        // Player 1 always holds the leader, because $gamePlayer IS the leader.
        p2ActorId() {
            return this._p2ActorId || 0;
        },

        // Where the avatar first appears: on the tile the member Player 2 has
        // been handed is already standing on, so the party does not visibly
        // collapse onto the leader the moment a session opens. Read once.
        takeP2Spawn() {
            const at = this._p2SpawnAt;
            this._p2SpawnAt = null;
            return at;
        },

        p2Actor() {
            const id = this._p2ActorId;
            if (!id || !$gameParty) return null;
            return $gameParty.members().find(mem => mem && mem.actorId() === id) || null;
        },

        isP2Actor(actor) {
            return !!(this.active && actor && actor.actorId() === this._p2ActorId);
        },

        // The follower slot standing in for Player 2's member. It is kept hidden
        // and glued to the avatar, so the party is never drawn twice over.
        isP2Follower(follower) {
            if (!this.active || !follower || typeof follower.actor !== "function") return false;
            const actor = follower.actor();
            return !!actor && actor.actorId() === this._p2ActorId;
        },

        // The members the CPU walks: everybody but the two the players hold.
        cpuMembers() {
            if (!$gameParty) return [];
            return $gameParty.members().filter((mem, i) => i > 0 && mem && !this.isP2Actor(mem));
        },

        // The bodies Player 2 may take: any living member except the leader,
        // who is Player 1's. Listed in marching order so the switch cycles the
        // way the party is drawn.
        p2Bodies() {
            if (!$gameParty) return [];
            const out = [];
            const members = $gameParty.members();
            for (let i = 1; i < members.length; i++) {
                const mem = members[i];
                if (!mem) continue;
                if (mem.isDead && mem.isDead() && mem.actorId() !== this._p2ActorId) continue;
                out.push(mem.actorId());
            }
            return out;
        },

        // Hand Player 2 the next body along, and the CPU the one they let go of.
        cycleP2(delta) {
            const ids = this.p2Bodies();
            if (ids.length < 2) return false;
            const at = Math.max(0, ids.indexOf(this._p2ActorId));
            const size = ids.length;
            const next = ids[(((at + (delta || 1)) % size) + size) % size];
            return this.switchP2To(next);
        },

        // Player 2 steps out of one member and into another. Nobody teleports:
        // the avatar takes the tile of the member it is taking over, and the
        // member left behind is standing where the avatar stood (their follower
        // has been glued to it all along), back in the CPU's hands.
        switchP2To(actorId) {
            if (!this.active || !actorId || actorId === this._p2ActorId) return false;
            if (!$gameParty || !$gamePlayer || !$gameMap) return false;
            const to = $gameParty.members().findIndex(mem => mem && mem.actorId() === actorId);
            if (to <= 0) return false; // the leader is Player 1's body, never P2's

            const ev = this.p2Event;
            const target = $gamePlayer.followers().follower(to - 1);
            if (ev && target) {
                ev.locate(target.x, target.y);
                ev.setDirection(target.direction());
                // Whatever the tile they are standing on made of them travels
                // with the body (Map/MovementInteractionSystem.js).
                for (const flag of ["_isSwimming", "_isClimbing", "_isSitting"]) {
                    ev[flag] = target[flag];
                }
            }
            this._p2ActorId = actorId;
            this.resolveP2Character();
            if (ev) ev.setImage(this.p2CharName, this.p2CharIndex);
            $gamePlayer.followers().refresh();
            // The member handed back to the CPU picks their own life up from
            // scratch rather than walking off to an errand P2 interrupted.
            const loose = window.AutoIdleExplorer && window.AutoIdleExplorer.loose;
            if (loose && loose.resetStates) loose.resetStates();
            const actor = this.p2Actor();
            if (actor && window.ParchmentToast) {
                window.ParchmentToast.show(T('SplitScreen.p2TakesOver', { name: actor.name() }), {
                    severity: "info", duration: 120,
                });
            }
            return true;
        },

        // Player 2's member is drawn as the avatar, so its follower rides along
        // on the same tile, hidden. Everything that reads follower positions (a
        // fight opening, the party closing ranks, a transfer) then finds the
        // party where it actually stands.
        syncP2Follower() {
            if (!this.active || !this.p2Event || !$gamePlayer) return;
            const members = $gameParty ? $gameParty.members() : [];
            const at = members.findIndex(mem => mem && mem.actorId() === this._p2ActorId);
            if (at <= 0) return;
            const f = $gamePlayer.followers().follower(at - 1);
            if (!f) return;
            if (f.x !== this.p2Event.x || f.y !== this.p2Event.y) {
                f.locate(this.p2Event.x, this.p2Event.y);
            }
            f.setDirection(this.p2Event.direction());
            if (f.opacity() !== 0) f.setOpacity(0);
        },

        // Once per frame on the map: the avatar's twin follows it, and the
        // switch button is read.
        updateControl() {
            // Anything may promote a member while a session runs (the Dynamics
            // roster, a death in the party). Player 1 IS the leader, so if the
            // lead has landed on Player 2's body they are handed the next member
            // along rather than both pads ending up on one person.
            const leader = $gameParty ? $gameParty.leader() : null;
            if (leader && leader.actorId() === this._p2ActorId) {
                const ids = this.p2Bodies();
                if (ids.length > 0) {
                    this._p2ActorId = 0;
                    this.switchP2To(ids[0]);
                }
            }
            this.syncP2Follower();
            if (!this.isTriggered("swap")) return;
            if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return;
            if (window.MapBattleMode && window.MapBattleMode.isActive()) return;
            if (this.cycleP2(1)) SoundManager.playOk();
        },

        createSelectionPool() {
            // A party of two or more already has somebody for Player 2 to be:
            // control is handed to one of them and nobody is recruited, hidden
            // or dropped to make room.
            const party = this.buildPartyCandidates();
            if (party.length > 0) return party;
            // Travelling alone, the second player still needs a body: the NPCs
            // standing on the current map are offered as companions.
            const npcs = this.buildNPCCandidates();
            if (npcs.length > 0) return npcs;
            // Fallback: no NPCs here (e.g. AUTO_START before any map loads), so
            // generate guests instead of leaving 2P with no one to pick.
            return this.generateCandidates().map(c => { c.type = "generated"; return c; });
        },

        // The party itself, from the second member down: Player 2 takes one of
        // them over and the rest keep walking themselves. The leader is left out
        // because that body is Player 1's.
        buildPartyCandidates() {
            const out = [];
            if (!$gameParty) return out;
            const members = $gameParty.members();
            for (let i = 1; i < members.length; i++) {
                const actor = members[i];
                if (!actor) continue;
                const cls = actor.currentClass();
                out.push({
                    type: "existing",
                    actor: actor,
                    name: actor.name(),
                    classId: cls ? cls.id : 0,
                    className: cls ? cls.name : "",
                    characterName: actor.characterName(),
                    characterIndex: actor.characterIndex(),
                    traits: [],
                    weapon: actor.weapons()[0] || null,
                    stats: {
                        atk: actor.param(2), def: actor.param(3),
                        mat: actor.param(4), mdf: actor.param(5),
                        agi: actor.param(6), luk: actor.param(7)
                    }
                });
            }
            return out;
        },

        // Scan the active map for NPC events and turn each into a selectable
        // companion. NPCs that declare a class via the NPC-<id> note keep it;
        // the rest (NPC-0 / untagged) are assigned a random class so any NPC can
        // be played as Player 2.
        buildNPCCandidates() {
            const out = [];
            if (!$gameMap) return out;

            const classParams = PluginManager.parameters("CharacterCreationClassSelector");
            let availableClasses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            if (classParams && classParams["availableClasses"]) {
                availableClasses = classParams["availableClasses"].split(",").map(id => Number(id.trim()));
            }
            availableClasses = availableClasses.filter(id => $dataClasses[id]);
            if (availableClasses.length === 0) availableClasses = [1];

            const mapId = $gameMap.mapId();
            const actor1 = $gameActors.actor(1);

            $gameMap.events().forEach(ev => {
                if (!ev) return;
                const data = ev.event();
                if (!isNPCEvent(data)) return;

                const name = data.name.trim();
                const note = data.note || "";

                // Honour an explicit NPC-<id>; otherwise hand out a random class.
                let classId = null;
                const m = note.match(/NPC-(\d+)/i);
                if (m) {
                    const v = parseInt(m[1], 10);
                    if (v > 0 && $dataClasses[v]) classId = v;
                }
                if (!classId) classId = availableClasses[Math.floor(Math.random() * availableClasses.length)];
                const classData = $dataClasses[classId];
                if (!classData) return;

                const profile = window.NPCSocietyRegistry?.getProfile(name);
                const level = Math.max(1, (profile && profile.level) || (actor1 ? actor1.level : 1));
                const lv = Math.min(level, classData.params[2].length - 1);

                out.push({
                    type: "npc",
                    eventId: ev.eventId(),
                    mapId: mapId,
                    name: name,
                    classId: classId,
                    className: classData.name,
                    characterName: ev.characterName(),
                    characterIndex: ev.characterIndex(),
                    traits: [],
                    weapon: null,
                    stats: {
                        atk: classData.params[2][lv], def: classData.params[3][lv],
                        mat: classData.params[4][lv], mdf: classData.params[5][lv],
                        agi: classData.params[6][lv], luk: classData.params[7][lv]
                    }
                });
            });
            return out;
        },

        generateCandidates() {
            const candidates = [];
            const names = T.pool('SplitScreen.companionNames');

            // Get available classes from ClassSelection plugin or default
            const classParams = PluginManager.parameters("CharacterCreationClassSelector");
            let availableClasses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            if (classParams && classParams["availableClasses"]) {
                availableClasses = classParams["availableClasses"].split(",").map(id => Number(id.trim()));
            }
            availableClasses = availableClasses.filter(id => $dataClasses[id]);
            if (availableClasses.length === 0) availableClasses = [1];

            const TraitsArray = (window.Health && window.Health.Traits) || [];

            for (let i = 0; i < 3; i++) {
                const classId = availableClasses[Math.floor(Math.random() * availableClasses.length)];
                const classData = $dataClasses[classId];
                const charIdx = Math.floor(Math.random() * SKAB_POOL.length);
                const charName = SKAB_POOL[charIdx];
                const charIndex = charName.includes("!$") ? 0 : Math.floor(Math.random() * 8);

                // Pick 2 random traits
                const traits = [];
                if (TraitsArray.length > 0) {
                    for (let j = 0; j < 2; j++) {
                        const trait = TraitsArray[Math.floor(Math.random() * TraitsArray.length)];
                        if (!traits.includes(trait)) traits.push(trait);
                        else j--;
                    }
                }

                // Pre-determine weapon
                let weapon = null;
                if (window.StartingEquipment) {
                    const types = window.StartingEquipment.getCompatibleWeaponTypes(classId);
                    const pool = window.StartingEquipment.getCompatibleWeapons(types);
                    if (pool.length > 0) {
                        weapon = pool[Math.floor(Math.random() * pool.length)];
                    }
                }

                candidates.push({
                    name: names[Math.floor(Math.random() * names.length)],
                    classId: classId,
                    className: classData.name,
                    characterName: charName,
                    characterIndex: charIndex,
                    traits: traits,
                    weapon: weapon,
                    stats: {
                        atk: classData.params[2][1] + Math.randomInt(5),
                        def: classData.params[3][1] + Math.randomInt(5),
                        mat: classData.params[4][1] + Math.randomInt(5),
                        mdf: classData.params[5][1] + Math.randomInt(5),
                        agi: classData.params[6][1] + Math.randomInt(5),
                        luk: classData.params[7][1] + Math.randomInt(5)
                    }
                });
            }
            return candidates;
        },

        applyCandidateToActor(candidate, actorId) {
            const actor = $gameActors.actor(actorId);
            actor.setup(actorId);
            actor.setName(candidate.name);
            actor.changeClass(candidate.classId, false);
            actor.setCharacterImage(candidate.characterName, candidate.characterIndex);

            // Apply stats
            for (let i = 2; i < 8; i++) {
                const paramName = ["atk", "def", "mat", "mdf", "agi", "luk"][i - 2];
                actor.addParam(i, candidate.stats[paramName] - actor.param(i));
            }

            // Apply Traits
            if (window.CharacterCreationUtils && window.CharacterCreationUtils.applyTraitsToActor) {
                window.CharacterCreationUtils.applyTraitsToActor(actor, candidate.traits.map(t => t.id));
            }

            // Apply Equipment
            if (candidate.weapon) {
                $gameParty.gainItem(candidate.weapon, 1);
                actor.changeEquip(0, candidate.weapon);
                if (window.StartingEquipment && window.StartingEquipment.learnStarterSkills) {
                    window.StartingEquipment.learnStarterSkills(actor);
                }
            } else if (window.StartingEquipment && window.StartingEquipment.applyStartingGear) {
                window.StartingEquipment.applyStartingGear(actor, candidate.classId);
            }

            // Lock equipment
            actor._p2Generated = true;
            this._p2ActorId = actorId;
        },

        startSession(candidate) {
            if (candidate.type === "existing") {
                // One of the party takes the second pad. The roster is left
                // exactly as it was: nobody is dropped to seat Player 2, and the
                // members neither player holds keep walking themselves.
                this._savedPartyIds = [];
                const to = $gameParty.members().findIndex(
                    mem => mem && mem.actorId() === candidate.actor.actorId());
                const f = (to > 0 && $gamePlayer) ? $gamePlayer.followers().follower(to - 1) : null;
                if (f && f.isVisible()) this._p2SpawnAt = { x: f.x, y: f.y };
                this._p2ActorId = candidate.actor.actorId();
            } else {
                // Travelling alone (or picking an NPC off the map): the guest
                // JOINS the party rather than replacing it, and leaves again
                // when the session ends.
                this._savedPartyIds = $gameParty._actors.slice();
                const guestId = 4; // Using Actor 4 for the NPC / generated guest
                this.applyCandidateToActor(candidate, guestId);
                if (!$gameParty._actors.includes(guestId)) $gameParty.addActor(guestId);
                this._p2ActorId = guestId;
            }

            // Hide the chosen NPC's map event (self switch A) so it doesn't stand
            // next to its own Player 2 avatar, and remember it so the switch is
            // cleared again when the player revisits that map outside of 2P.
            if (candidate.type === "npc" && candidate.eventId) {
                $gameSelfSwitches.setValue([candidate.mapId, candidate.eventId, "A"], true);
                $gameSystem._ssChosenNpcSwitch = { mapId: candidate.mapId, eventId: candidate.eventId };
            }

            $gamePlayer.refresh();
            this.active = true;
            // Re-apply P2 WASD bindings, MovementInteractionSystem may have mapped them to P1
            Input.keyMapper[getKeyCode(P2_KEYS.up)]     = "p2_up";
            Input.keyMapper[getKeyCode(P2_KEYS.down)]   = "p2_down";
            Input.keyMapper[getKeyCode(P2_KEYS.left)]   = "p2_left";
            Input.keyMapper[getKeyCode(P2_KEYS.right)]  = "p2_right";
            Input.keyMapper[getKeyCode(P2_KEYS.action)] = "p2_action";
            Input.keyMapper[getKeyCode(P2_KEYS.switch)] = "p2_switch";
            $gameSwitches.setValue(67, true);
            this.resolveP2Character();
            if (typeof findOrCreateP2Event === 'function') findOrCreateP2Event(true);

            // Disable MousePanZoom and restore defaults
            $gameSystem._mousePanDisabled = true;
            $gameScreen.setZoom(Graphics.width / 2, Graphics.height / 2, 1.0);
            $gameMap.setDisplayPos($gamePlayer.x - $gameMap.screenTileX() / 2, $gamePlayer.y - $gameMap.screenTileY() / 2);
        },

        stopSession() {
            this.active = false;
            // Restore P1 WASD now that split-screen is off
            Input.keyMapper[87] = "up";
            Input.keyMapper[83] = "down";
            Input.keyMapper[65] = "left";
            Input.keyMapper[68] = "right";
            if (this._p2ActorId) {
                const actor = $gameActors.actor(this._p2ActorId);
                if (actor && actor._p2Generated) {
                    actor._p2Generated = false;
                }
            }
            if (this._savedPartyIds && this._savedPartyIds.length > 0) {
                $gameParty._actors = this._savedPartyIds.slice();
                this._savedPartyIds = [];
            }
            $gameSwitches.setValue(67, false);
            this._p2ActorId = 0;
            this.p2Event = null;
            this.isSplit = false;
            $gamePlayer.refresh();
            // The member Player 2 was holding walks with the party again.
            $gamePlayer.followers().refresh();
            $gamePlayer.followers().data().forEach(f => { if (f.opacity() !== 255) f.setOpacity(255); });

            // Re-enable MousePanZoom
            $gameSystem._mousePanDisabled = false;
        },

        // When the player returns to the map of the NPC that was picked as a
        // companion - and split-screen is no longer running - turn the NPC's
        // self switch A back off so the original NPC reappears on that map.
        restoreChosenNpc() {
            const rec = $gameSystem && $gameSystem._ssChosenNpcSwitch;
            if (!rec || this.active) return;
            if (!$gameMap || $gameMap.mapId() !== rec.mapId) return;
            $gameSelfSwitches.setValue([rec.mapId, rec.eventId, "A"], false);
            $gameSystem._ssChosenNpcSwitch = null;
        },

        pollInput() {
            // Save previous
            Object.assign(this._prevP2Input, this.p2Input);

            // Keyboard (using Input.keyMapper)
            let up = Input.isPressed("p2_up");
            let down = Input.isPressed("p2_down");
            let left = Input.isPressed("p2_left");
            let right = Input.isPressed("p2_right");
            let action = Input.isPressed("p2_action");
            let dash = Input.isPressed("p2_dash");
            let menu = false; // No default KB key for P2 menu
            let cancel = dash; // Dash acts as cancel for P2
            let swap = Input.isPressed("p2_switch"); // hand P2 the next free member

            // Gamepad
            const gpIndex = GamepadManager.getP2GamepadIndex();
            if (gpIndex >= 0) {
                if (GamepadManager.isButtonPressed(gpIndex, 12)) up = true;    // D-Pad Up
                if (GamepadManager.isButtonPressed(gpIndex, 13)) down = true;  // D-Pad Down
                if (GamepadManager.isButtonPressed(gpIndex, 14)) left = true;  // D-Pad Left
                if (GamepadManager.isButtonPressed(gpIndex, 15)) right = true; // D-Pad Right
                if (GamepadManager.isButtonPressed(gpIndex, 0)) action = true;  // A button
                if (GamepadManager.isButtonPressed(gpIndex, 1)) {               // B button
                    dash = true;
                    cancel = true;
                }
                if (GamepadManager.isButtonPressed(gpIndex, 3)) menu = true;    // Y button
                if (GamepadManager.isButtonPressed(gpIndex, 2)) swap = true;    // X button

                const stickX = GamepadManager.getAxisValue(gpIndex, 0);
                const stickY = GamepadManager.getAxisValue(gpIndex, 1);
                if (stickY < 0) up = true;
                if (stickY > 0) down = true;
                if (stickX < 0) left = true;
                if (stickX > 0) right = true;
            }

            this.p2Input = { up, down, left, right, action, dash, cancel, menu, swap };

            // Update hold frames for repeat logic
            if (!this._holdFrames) this._holdFrames = { up: 0, down: 0, left: 0, right: 0, action: 0, dash: 0, cancel: 0, menu: 0, swap: 0 };
            
            const keys = ["up", "down", "left", "right", "action", "dash", "cancel", "menu", "swap"];
            keys.forEach(key => {
                if (this.p2Input[key]) {
                    this._holdFrames[key]++;
                } else {
                    this._holdFrames[key] = 0;
                }
            });

            // Release-gate map interaction: the action button must be let go before
            // it can trigger another event, so holding it can't re-fire repeatedly.
            if (!this.p2Input.action) this._p2InteractLatch = false;
        },

        // Where Player 2 is LOOKING, as the right stick's own deflection. The
        // 2D game has no use for it - the map is drawn from overhead and a
        // character faces the way it walks - but a first-person world does:
        // there is one mouse in the room and Player 1 has it, so the second
        // player turns with the stick. Answers {x: 0, y: 0} on a keyboard.
        p2Look() {
            const idx = GamepadManager.getP2GamepadIndex();
            if (idx < 0) return { x: 0, y: 0 };
            return {
                x: GamepadManager.getAxisValue(idx, 2),
                y: GamepadManager.getAxisValue(idx, 3),
            };
        },

        // Which pad the second player is holding, or -1 for a shared keyboard.
        p2GamepadIndex() { return GamepadManager.getP2GamepadIndex(); },

        // Which way the screen is cut, as the player set it. Read by anything
        // that has to lay out its own split rather than use the map's masks -
        // the 3D world draws itself twice into two scissored halves and has to
        // cut them the same way, or a pair who chose left/right on the map
        // would get top/bottom the moment they walked into it.
        splitOrientation() { return SPLIT_DIR === "horizontal" ? "horizontal" : "vertical"; },

        isTriggered(key) {
            return this.p2Input[key] && !this._prevP2Input[key];
        },

        isRepeated(key) {
            const frames = this._holdFrames ? this._holdFrames[key] : 0;
            return frames === 1 || (frames >= 24 && (frames - 24) % 6 === 0);
        },

        consumeTrigger(key) {
            if (key) {
                this._prevP2Input[key] = this.p2Input[key];
            } else {
                Object.assign(this._prevP2Input, this.p2Input);
            }
        }
    };
    window.$gameSplitScreen = SplitScreenManager;
    // MultiplayerSystem.js reads window.SplitScreenManager (active state, disconnect).
    // Without this alias the Local-Multiplayer menu can never detect/terminate a session.
    window.SplitScreenManager = SplitScreenManager;

    // Keyboard listener
    // Removed custom keyboard listeners in favor of Input.keyMapper



    // =========================================================================
    // Scene_SplitScreenCharacterSelection
    // =========================================================================
    // Entries whose display name is empty or a "<--" placeholder/divider must
    // never be selectable (matches SkillMaster's <-- skip convention and keeps
    // database separator rows out of the parchment selection lists).
    const ssIsSelectableName = (name) => {
        if (name === undefined || name === null) return false;
        const t = String(name).trim();
        if (!t) return false;
        if (t.startsWith("<--")) return false;
        return true;
    };

    // Render a walkable character's "facing down" frame into a DOM <canvas>.
    const ssDrawCharacterToCanvas = (canvas, characterName, characterIndex) => {
        if (!canvas || !characterName) return;
        const bitmap = ImageManager.loadCharacter(characterName);
        const draw = () => {
            const big = ImageManager.isBigCharacter(characterName);
            const pw = bitmap.width / (big ? 3 : 12);
            const ph = bitmap.height / (big ? 4 : 8);
            const n = big ? 0 : characterIndex;
            const sx = ((n % 4) * 3 + 1) * pw;
            const sy = Math.floor(n / 4) * 4 * ph;
            canvas.width = pw;
            canvas.height = ph;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, pw, ph);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, pw, ph);
        };
        if (bitmap.isReady()) draw();
        else bitmap.addLoadListener(draw);
    };

    // Standalone keyboard/controller/WASD input manager for the DOM scene.
    const SSCharSelectInput = {
        _scene: null,
        _active: false,
        activate(scene) { this._scene = scene; this._active = true; },
        deactivate() { this._active = false; this._scene = null; },
        update() {
            if (!this._active || !this._scene) return;
            const scene = this._scene;

            // WASD hold-repeat simulation (mirror MZ key repeat timing).
            for (const dir of ["up", "down", "left", "right"]) {
                if (scene._wasdHeld[dir]) {
                    scene._wasdHoldFrames[dir]++;
                    const t = scene._wasdHoldFrames[dir];
                    if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
                        scene._wasdInput[dir] = true;
                    }
                } else {
                    scene._wasdHoldFrames[dir] = 0;
                }
            }

            const isUp = Input.isRepeated("up") || scene._wasdInput.up;
            const isDown = Input.isRepeated("down") || scene._wasdInput.down;
            scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;

            if (Input.isTriggered("ok")) { scene.confirmSelection(); return; }
            // Shift (keyboard) / X (gamepad) starts the co-op gauntlet instead.
            if (Input.isTriggered("shift")) { scene.confirmSelectionGauntlet(); return; }
            if (Input.isTriggered("escape") || Input.isTriggered("cancel") || TouchInput.isCancelled()) {
                SoundManager.playCancel();
                scene.popScene();
                return;
            }

            const total = scene._candidates.length;
            if (total === 0) return;
            if (isUp && scene._selectedIndex > 0) {
                scene._selectedIndex--;
                SoundManager.playCursor();
                scene.updateSelectionHighlight();
            } else if (isDown && scene._selectedIndex < total - 1) {
                scene._selectedIndex++;
                SoundManager.playCursor();
                scene.updateSelectionHighlight();
            }
        }
    };

    class Scene_SplitScreenCharacterSelection extends Scene_MenuBase {
        create() {
            super.create();

            // Drop any candidate whose name is empty or a "<--" placeholder.
            this._candidates = SplitScreenManager.createSelectionPool()
                .filter((c) => ssIsSelectableName(c.name));
            this._selectedIndex = 0;

            // WASD tracking (per docs/tasks/menurework.md).
            this._wasdInput = { up: false, down: false, left: false, right: false };
            this._wasdHeld = { up: false, down: false, left: false, right: false };
            this._wasdHoldFrames = { up: 0, down: 0, left: 0, right: 0 };
            this._wasdListener = (event) => {
                if (event.repeat) return;
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

            this._container = document.createElement("div");
            this._container.id = "menu-container";
            this._container.style.opacity = "0";
            this._container.style.transition = "opacity 0.22s ease-out";
            document.body.appendChild(this._container);

            this.refreshDOM();
            SSCharSelectInput.activate(this);

            // Re-render once trait localization data arrives.
            if (!_traitsI18nData) {
                loadTraitsI18n().then(() => this.refreshDOM());
            }

            setTimeout(() => { if (this._container) this._container.style.opacity = "1"; }, 16);
        }

        update() {
            Scene_MenuBase.prototype.update.call(this);
            SSCharSelectInput.update();
        }

        terminate() {
            if (this._wasdListener) {
                window.removeEventListener("keydown", this._wasdListener);
                window.removeEventListener("keyup", this._wasdUpListener);
                this._wasdListener = null;
                this._wasdUpListener = null;
            }
            SSCharSelectInput.deactivate();
            if (this._container) {
                const c = this._container;
                c.style.transition = "opacity 0.2s ease-out";
                c.style.opacity = "0";
                c.style.pointerEvents = "none";
                setTimeout(() => { if (c.parentNode) c.parentNode.removeChild(c); }, 200);
                this._container = null;
            }
            Scene_MenuBase.prototype.terminate.call(this);
        }

        traitName(trait) {
            const lang = ConfigManager.language || "en";
            let name = trait && trait.name;
            if (name && typeof name === "object") name = name[lang] || name["en"];
            if (typeof name === "string" && name.includes(".")) {
                if (window.translateText) {
                    const tr = window.translateText(name);
                    if (tr !== name) return tr;
                }
                if (_traitsI18nData) {
                    const localized = resolveI18nPath(name, _traitsI18nData);
                    if (localized) return localized;
                }
            }
            return name || T('SplitScreen.unknownTrait');
        }

        refreshDOM() {
            if (!this._container) return;
            const c = this._candidates;

            const listItems = c.map((cand, i) => {
                const selected = i === this._selectedIndex ? " selected" : "";
                const name = window.translateText ? window.translateText(cand.name) : cand.name;
                const cls = window.translateText ? window.translateText(cand.className) : cand.className;
                return `
                    <div class="item-slot${selected}" data-index="${i}">
                        <div class="item-slot-icon"><canvas id="ss-list-canvas-${i}" width="48" height="48"></canvas></div>
                        <div class="item-slot-info">
                            <div class="item-slot-name">${name}</div>
                            <div class="item-slot-meta">${cls}</div>
                        </div>
                    </div>`;
            }).join("");

            const listHTML = c.length
                ? listItems
                : `<div class="item-grid-empty">${T('SplitScreen.noCompanions')}</div>`;

            this._container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page">
                        <div class="page-header-bar">
                            <div class="title">${T('SplitScreen.chooseCompanion')}</div>
                        </div>
                        <div class="backpack-grid" id="ss-candidate-grid">${listHTML}</div>
                    </div>
                    <div class="right-page">
                        <div class="item-inspect" id="ss-inspect"></div>
                    </div>
                </div>`;

            // Draw each candidate's sprite into its list canvas.
            c.forEach((cand, i) => {
                ssDrawCharacterToCanvas(document.getElementById(`ss-list-canvas-${i}`), cand.characterName, cand.characterIndex);
            });

            // Mouse: hover highlights, click confirms.
            this._container.querySelectorAll(".item-slot").forEach((el) => {
                el.addEventListener("mouseenter", () => {
                    // Hover steers only while the mouse is what is moving: the
                    // list scrolls its selection into view, so a pad press
                    // slides a different slot under a resting pointer and fires
                    // this (PointerSteering, Core/AnalogStickInput.js).
                    if (window.PointerSteering && !window.PointerSteering.isSteering()) return;
                    const idx = parseInt(el.dataset.index, 10);
                    if (idx !== this._selectedIndex) {
                        this._selectedIndex = idx;
                        this.updateSelectionHighlight();
                    }
                });
                el.addEventListener("click", () => {
                    this._selectedIndex = parseInt(el.dataset.index, 10);
                    this.confirmSelection();
                });
            });

            this.renderInspect();
        }

        renderInspect() {
            const panel = this._container && document.getElementById("ss-inspect");
            if (!panel) return;
            const cand = this._candidates[this._selectedIndex];
            if (!cand) {
                panel.innerHTML = `<div class="inspect-placeholder-text">${T('SplitScreen.selectACompanion')}</div>`;
                return;
            }

            const name = window.translateText ? window.translateText(cand.name) : cand.name;
            const cls = window.translateText ? window.translateText(cand.className) : cand.className;

            // Attribute names come from $dataSystem.terms.params, which
            // Hendrix_Localization translates in place, so the inspect panel
            // reads the same as the character sheet in every language.
            const stats = [
                [TextManager.param(2), cand.stats.atk], [TextManager.param(3), cand.stats.def],
                [TextManager.param(4), cand.stats.mat], [TextManager.param(5), cand.stats.mdf],
                [TextManager.param(6), cand.stats.agi], [TextManager.param(7), cand.stats.luk]
            ];
            const statRows = stats.map(([n, v]) => `
                <div class="inspect-meta-item">
                    <span class="inspect-spec-label">${n}</span>
                    <span class="inspect-meta-val">${v}</span>
                </div>`).join("");

            // Equipment: skip weapons with empty / "<--" placeholder names.
            let equipHTML;
            if (cand.weapon && ssIsSelectableName(cand.weapon.name)) {
                const wName = window.translateText ? window.translateText(cand.weapon.name) : cand.weapon.name;
                equipHTML = `<div class="inspect-bullet-item">${wName}</div>`;
            } else {
                equipHTML = `<div class="inspect-bullet-item">${T('SplitScreen.none')}</div>`;
            }

            // Traits: skip empty / "<--" placeholder names.
            const traitRows = (cand.traits || [])
                .map((tr) => this.traitName(tr))
                .filter((nm) => ssIsSelectableName(nm))
                .map((nm) => `<div class="inspect-bullet-item">${nm}</div>`)
                .join("");
            const traitsHTML = traitRows || `<div class="inspect-bullet-item">${T('SplitScreen.none')}</div>`;

            panel.innerHTML = `
                <div class="inspect-header">
                    <div class="inspect-frame"><canvas id="ss-preview-canvas" class="inspect-canvas"></canvas></div>
                    <div class="inspect-title-box">
                        <div class="inspect-name">${name}</div>
                        <div class="inspect-rarity">${cls}</div>
                    </div>
                </div>
                <div class="inspect-lore">
                    <div class="inspect-section-title">${T('SplitScreen.stats')}</div>
                    <div class="inspect-meta-grid">${statRows}</div>
                    <div class="inspect-section-title">${T('SplitScreen.equipment')}</div>
                    ${equipHTML}
                    <div class="inspect-section-title">${T('SplitScreen.traits')}</div>
                    ${traitsHTML}
                </div>
                <div class="inspect-actions">
                    <div class="inspect-btn selected" id="ss-confirm-btn">${T('SplitScreen.selectCompanion')}</div>
                    <div class="inspect-btn" id="ss-gauntlet-btn">${T('SplitScreen.startGauntlet')}</div>
                </div>`;

            ssDrawCharacterToCanvas(document.getElementById("ss-preview-canvas"), cand.characterName, cand.characterIndex);
            const btn = document.getElementById("ss-confirm-btn");
            if (btn) btn.addEventListener("click", () => this.confirmSelection());
            const gbtn = document.getElementById("ss-gauntlet-btn");
            if (gbtn) gbtn.addEventListener("click", () => this.confirmSelectionGauntlet());
        }

        updateSelectionHighlight() {
            if (!this._container) return;
            this._container.querySelectorAll(".item-slot").forEach((slot, idx) => {
                slot.classList.toggle("selected", idx === this._selectedIndex);
            });
            const sel = this._container.querySelector(".item-slot.selected");
            if (sel) sel.scrollIntoView({ block: "nearest" });
            this.renderInspect();
        }

        confirmSelection() {
            const cand = this._candidates[this._selectedIndex];
            if (!cand) { SoundManager.playBuzzer(); return; }
            SoundManager.playOk();
            SplitScreenManager.startSession(cand);
            SceneManager.goto(Scene_Map);
        }

        // Start a co-op session with the highlighted companion and drop straight
        // into the gauntlet. We return to the map first (the gauntlet's base
        // scene) and open the bracket picker from Scene_Map.start, so the gauntlet
        // lands back on the map between bouts and when it ends, with the 2P session
        // still active. Battles are single-screen and alternate turns per actor.
        confirmSelectionGauntlet() {
            const cand = this._candidates[this._selectedIndex];
            if (!cand) { SoundManager.playBuzzer(); return; }
            if (!window.Scene_GauntletSelect) {
                // Arena plugin unavailable: fall back to an ordinary co-op session.
                this.confirmSelection();
                return;
            }
            SoundManager.playOk();
            SplitScreenManager.startSession(cand);
            if ($gameTemp) $gameTemp._ssPendingGauntlet = true;
            SceneManager.goto(Scene_Map);
        }
    }


    // =========================================================================
    // Core Engine Integration
    // =========================================================================
    class Scene_SplitScreenTerminate extends Scene_MenuBase {
        create() {
            super.create();
            this.createHelpWindow();
            this._helpWindow.setText(T('SplitScreen.activeSession'));
            this.createCommandWindow();
        }

        createCommandWindow() {
            const ww = 400;
            const wh = this.calcWindowHeight(1, true);
            const wx = (Graphics.boxWidth - ww) / 2;
            const wy = (Graphics.boxHeight - wh) / 2;
            this._commandWindow = new Window_MultiplayerTerminate(new Rectangle(wx, wy, ww, wh));
            this._commandWindow.setHandler("terminate", this.commandTerminate.bind(this));
            this._commandWindow.setHandler("cancel", this.popScene.bind(this));
            this.addWindow(this._commandWindow);
        }

        commandTerminate() {
            SplitScreenManager.stopSession();
            SceneManager.goto(Scene_Map);
        }
    }

    class Window_MultiplayerTerminate extends Window_Command {
        makeCommandList() {
            this.addCommand(T('SplitScreen.terminateSession'), "terminate");
        }
    }

    // Export to window for access from MultiplayerSystem.js
    window.Scene_SplitScreenCharacterSelection = Scene_SplitScreenCharacterSelection;
    window.Scene_SplitScreenTerminate = Scene_SplitScreenTerminate;

    // Integrated with MultiplayerSystem's selection menu

    // Title Menu Integration removed as requested

    // Input Hijacking for P1 (Ensures P1 doesn't use P2's gamepad)
    const _Input_updateGamepadState = Input._updateGamepadState;
    Input._updateGamepadState = function (gamepad) {
        if (SplitScreenManager.active) {
            const p1GpIdx = GamepadManager.getP1GamepadIndex();
            // If P1 index is -1 or doesn't match this gamepad, ignore it for P1
            if (p1GpIdx < 0 || (gamepad && gamepad.index !== p1GpIdx)) return;
        }
        _Input_updateGamepadState.call(this, gamepad);
    };

    const _SceneManager_updateInputData = SceneManager.updateInputData;
    SceneManager.updateInputData = function () {
        _SceneManager_updateInputData.call(this);
        if (SplitScreenManager.active) SplitScreenManager.pollInput();
    };

    // =========================================================================
    // Map & Camera (From SplitScreenMultiplayer)
    // =========================================================================
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded.call(this);
        if (SplitScreenManager.active) findOrCreateP2Event(false);
        else SplitScreenManager.restoreChosenNpc();
    };

    // Spawn a "Player2" event at runtime on maps that have none (procedural map
    // 636, world map 315). Mirrors WeatherSystem.createPuddleEvent: build the data
    // in $dataMap.events, instantiate a Game_Event, and register a sprite with the
    // live spriteset(s) so it renders without a full character-sprite rebuild. The
    // event is named P2_EVENT_NAME so subsequent findOrCreateP2Event() calls on the
    // same map reuse it instead of creating duplicates. It is recreated on the next
    // map (map data reloads), which is fine and matches the puddle pattern.
    function createP2Event(x, y) {
        if (!$gameMap || !$dataMap || !$dataMap.events) return null;
        let nextId = $dataMap.events.length;
        while ($dataMap.events[nextId]) nextId++;

        $dataMap.events[nextId] = {
            id: nextId,
            name: P2_EVENT_NAME,
            note: "",
            x: x,
            y: y,
            pages: [{
                conditions: {
                    actorId: 1, actorValid: false, itemId: 1, itemValid: false,
                    selfSwitchCh: "A", selfSwitchValid: false,
                    switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
                    variableId: 1, variableValid: false, variableValue: 0
                },
                directionFix: false,
                image: { characterIndex: 0, characterName: "", direction: 2, pattern: 0, tileId: 0 },
                list: [{ code: 0, indent: 0, parameters: [] }],
                moveFrequency: 5,
                moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
                moveSpeed: 4,
                moveType: 0,
                priorityType: 1,
                stepAnime: false,
                through: false,
                trigger: 0,
                walkAnime: true
            }]
        };

        const ev = new Game_Event($gameMap.mapId(), nextId);
        $gameMap._events[nextId] = ev;
        ev.locate(x, y);
        ev.refresh();

        const scene = SceneManager._scene;
        if (scene instanceof Scene_Map) {
            [scene._spriteset, scene._p2Spriteset].forEach(ss => {
                if (ss && ss._tilemap && ss._characterSprites) {
                    const sprite = new Sprite_Character(ev);
                    ss._characterSprites.push(sprite);
                    ss._tilemap.addChild(sprite);
                }
            });
        }
        return ev;
    }

    function findOrCreateP2Event(forceTeleport = false) {
        if (!$gameMap || !$gameSystem) return;

        const currentMapId = $gameMap.mapId();
        const lastMapId = $gameSystem._lastP2MapId || 0;
        const mapChanged = (currentMapId !== lastMapId);
        $gameSystem._lastP2MapId = currentMapId;

        if (SplitScreenManager.forceP2Teleport) {
            forceTeleport = true;
            SplitScreenManager.forceP2Teleport = false;
        }

        SplitScreenManager.resolveP2Character();
        let event = $gameMap.events().find(ev => ev && ev.event() && ev.event().name === P2_EVENT_NAME);
        // Procedural maps (636) and the world map (315) ship without a hand-placed
        // "Player2" spawn event, so split-screen used to silently collapse there
        // (p2Event = null -> deactivateSplitScreen). Spawn one on demand so 2P works
        // on every map - this is what enables proc-ocean diving in a 2P session.
        if (!event) event = createP2Event($gamePlayer.x, $gamePlayer.y);
        if (event) {
            SplitScreenManager.p2Event = event;
            event.setImage(SplitScreenManager.p2CharName, SplitScreenManager.p2CharIndex);
            
            const inVehicle = $gamePlayer.isInVehicle() && SplitScreenManager.vehicleDriver;
            if (inVehicle) {
                event.setOpacity(0);
                event.setPriorityType(0);
                event.setThrough(true);
            } else {
                event.setOpacity(255);
                event.setPriorityType(1);
                event.setThrough(false);
            }
            
            event.setMoveSpeed($gamePlayer.moveSpeed());
            event.setMoveFrequency(5);

            // Neutralise any NPC-derived autonomous movement on the reused event:
            // pin its moveType to Fixed so nothing (engine or NPC system) random-
            // walks the avatar, and drop any NPC controller that had claimed it so
            // the NPC system stops steering the Player 2 event.
            event._moveType = 0;
            if ($gameSystem.npcControllers) {
                $gameSystem.npcControllers = $gameSystem.npcControllers.filter(
                    c => c && c.event !== event && c.eventName !== P2_EVENT_NAME
                );
            }

            // Only teleport near P1 if map changed or forced (e.g. starting session)
            if (forceTeleport || mapChanged) {
                // Taking over a member who is already standing somewhere: the
                // avatar appears on their tile rather than on the leader's.
                const spawn = SplitScreenManager.takeP2Spawn();
                if (spawn) {
                    event.locate(spawn.x, spawn.y);
                    return;
                }
                event.locate($gamePlayer.x, $gamePlayer.y);
                // Some maps relocate $gamePlayer AFTER their own onMapLoaded override
                // (procedural houses, treasure rooms reserveTransfer to 0,0 then
                // locate to a region-13 spawn). Depending on plugin load order that
                // can run after this handler, leaving P2 stranded at 0,0. Defer a
                // final snap to Scene_Map.start, which runs once every onMapLoaded
                // handler (and thus every relocation) has completed.
                SplitScreenManager.pendingP2Snap = true;
            }
        } else {
            SplitScreenManager.p2Event = null;
        }
    }

    // MapBattleMode (BattleSystem/MapBattleMode.js) fights a real battle on
    // Scene_Map, so every "are we in a battle UI" test has to cover it too.
    function inMapBattle() {
        return !!(window.MapBattleMode && window.MapBattleMode.isActive());
    }
    function inBattleUi() {
        return (SceneManager._scene instanceof Scene_Battle) || inMapBattle();
    }

    const _Game_Map_updateEvents = Game_Map.prototype.updateEvents;
    Game_Map.prototype.updateEvents = function () {
        _Game_Map_updateEvents.call(this);
        // During a map battle the P2 avatar is a tactical battler: it moves only
        // on its own Move command, never on free roaming input.
        if (inMapBattle()) return;
        if (!SplitScreenManager.active || !SplitScreenManager.p2Event) return;
        // On a <Platform> map the second player is a physics body like the
        // first, so it runs the platformer step (Map/PlatformerMode.js) instead
        // of the grid walk below: gravity has no direction to walk in.
        if (window.PlatformerMode && window.PlatformerMode.isActive()) {
            window.PlatformerMode.updateSplitScreenP2(SplitScreenManager.p2Event, SplitScreenManager);
            return;
        }
        if (!SplitScreenManager.p2Event.isMoving()) {
            updateP2Movement();
        }
    };

    // When the Player 2 avatar reuses an event that was authored from an NPC
    // template, it inherits that NPC's autonomous moveType (random / approach /
    // custom route). The engine would then self-walk the avatar around on top of
    // the P2 input movement (updateP2Movement), so P2 drifts on its own. Suppress
    // all engine-driven self-movement for the active P2 event; its position is
    // owned entirely by updateP2Movement.
    const _Game_Event_updateSelfMovement = Game_Event.prototype.updateSelfMovement;
    Game_Event.prototype.updateSelfMovement = function () {
        if (SplitScreenManager.active && SplitScreenManager.p2Event === this) return;
        _Game_Event_updateSelfMovement.call(this);
    };

    function updateP2Movement() {
        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return;
        const ev = SplitScreenManager.p2Event;
        if (!ev) return;

        // Watchdog: once the player has fully left the vehicle, clear a stale
        // vehicleDriver and restore P2. This covers P1 dismounting through the
        // VehicleSystem "Stop driving" menu (which bypasses getOnOffVehicle) and
        // the multi-frame dismount completing after P2 hops off.
        if (SplitScreenManager.vehicleDriver && !$gamePlayer.isInVehicle() &&
            !$gamePlayer._vehicleGettingOn && !$gamePlayer._vehicleGettingOff) {
            SplitScreenManager.vehicleDriver = null;
            ev.locate($gamePlayer.x, $gamePlayer.y);
            ev.setOpacity(255);
            ev.setPriorityType(1);
        }

        // If P1 is in vehicle, and P2 is on foot, allow P2 to hop in as a passenger if they are facing the vehicle and press Action
        if ($gamePlayer.isInVehicle() && ev.opacity() !== 0) {
            const d = ev.direction();
            const x2 = $gameMap.roundXWithDirection(ev.x, d);
            const y2 = $gameMap.roundYWithDirection(ev.y, d);
            if ($gamePlayer.pos(x2, y2) && SplitScreenManager.isTriggered("action")) {
                ev.setOpacity(0);
                ev.setPriorityType(0);
                ev.setThrough(true);
                if (!SplitScreenManager.vehicleDriver) {
                    SplitScreenManager.vehicleDriver = 'p1';
                }
                return;
            }
        }

        // Vehicle passenger/driver follow
        if (SplitScreenManager.vehicleDriver === 'p2' || ev.opacity() === 0) {
            ev.locate($gamePlayer.x, $gamePlayer.y);
            if (SplitScreenManager.vehicleDriver === 'p2') {
                if (SplitScreenManager.isTriggered("action")) {
                    $gamePlayer.getOnOffVehicle();
                }
                return; // Skip normal movement
            }
            if (ev.opacity() === 0) {
                // If P2 is a passenger, allow them to press action to disembark
                if (SplitScreenManager.isTriggered("action")) {
                    ev.setOpacity(255);
                    ev.setPriorityType(1);
                    ev.setThrough(false);
                    // Find a passable adjacent tile to dismount to
                    const d = $gamePlayer.direction();
                    const x2 = $gameMap.roundXWithDirection($gamePlayer.x, d);
                    const y2 = $gameMap.roundYWithDirection($gamePlayer.y, d);
                    if ($gamePlayer.canPass($gamePlayer.x, $gamePlayer.y, d)) {
                        ev.locate(x2, y2);
                    } else {
                        ev.locate($gamePlayer.x, $gamePlayer.y);
                    }
                }
                return; // Skip normal movement for passenger
            }
        }

        // Ensure Highest frequency for smooth player-like movement
        if (ev.moveFrequency() !== 5) ev.setMoveFrequency(5);

        const input = SplitScreenManager.p2Input;

        // Rework: Player 2 moves faster than Player 1
        const baseSpeed = $gamePlayer.moveSpeed() + 1;
        const canDash = false; // Disabled in split screen
        
        // Fix: Set _dashing to enable running animation and proper speed
        ev._dashing = canDash;
        
        if (ev.moveSpeed() !== baseSpeed) {
            ev.setMoveSpeed(baseSpeed);
        }

        // Fix: Swim exit logic for Player 2
        if (ev._isSwimming && window.MovementSystem && !window.MovementSystem.isWaterTile(ev.x, ev.y)) {
            window.MovementSystem.exitSwimMode(ev);
        }

        // Auto swim entry for Player 2
        if (!ev._isSwimming && window.MovementSystem) {
            let targetDir = 0;
            if (input.up) targetDir = 8;
            if (input.down) targetDir = 2;
            if (input.left) targetDir = 4;
            if (input.right) targetDir = 6;
            
            if (targetDir > 0) {
                const x2 = $gameMap.roundXWithDirection(ev.x, targetDir);
                const y2 = $gameMap.roundYWithDirection(ev.y, targetDir);
                
                if (window.MovementSystem.isWaterTile(x2, y2) && 
                    $gameMap.eventsXy(x2, y2).length === 0 &&
                    !ev.canPass(ev.x, ev.y, targetDir)) {
                    window.MovementSystem.enterSwimMode(ev);
                    ev.moveStraight(targetDir);
                    return; // Skip normal movement this frame
                }
            }
        }

        let dir = 0;
        if (input.up) dir = 8;
        if (input.down) dir = 2;
        if (input.left) dir = 4;
        if (input.right) dir = 6;
        if (dir > 0) {
            // Let Player 2 trigger map transfers (proc-map edges, border tiles and
            // Transfer events). These move $gamePlayer / the whole party, so Player 1
            // follows P2 to the new map instead of P2 being silently blocked.
            if (window.WorldMapReturnP2 && window.WorldMapReturnP2.handleP2Move(ev, dir)) {
                return; // Transfer initiated; skip the normal step this frame.
            }
            ev.moveStraight(dir);
            checkP2TouchTriggers(ev, dir);
        }

        if (SplitScreenManager.isTriggered("action")) {
            const d = ev.direction();
            const x2 = $gameMap.roundXWithDirection(ev.x, d);
            const y2 = $gameMap.roundYWithDirection(ev.y, d);
            let triggered = false;

            // Vehicle interaction (getting on)
            const vehicles = [$gameMap.vehicle('ship'), $gameMap.vehicle('boat')];
            const vehicle = vehicles.find(v => v && v.pos(x2, y2));
            if (vehicle && !vehicle.isAirship() && !SplitScreenManager.vehicleDriver) {
                // Board directly via the engine's vehicle-getting-on flow, the same
                // way the VehicleSystem auto-ride path does. Standing the player on
                // the vehicle tile avoids VehicleSystem's getOnVehicle override (which
                // would otherwise pop the "Start driving" action menu) and avoids
                // SplitScreen's own getOnOffVehicle hook resetting vehicleDriver.
                $gamePlayer.locate(vehicle.x, vehicle.y);
                $gamePlayer._vehicleType = vehicle._type;
                $gamePlayer.getOnVehicle();
                if (!$gamePlayer.isInVehicle()) {
                    $gamePlayer._vehicleGettingOn = true;
                    vehicle.getOn();
                }
                SplitScreenManager.vehicleDriver = 'p2';
                ev.setOpacity(0);
                ev.setPriorityType(0);
                triggered = true;
            }

            if (!triggered && !SplitScreenManager._p2InteractLatch) {
                $gameMap.eventsXy(x2, y2).forEach(target => {
                if (target !== ev && target.isTriggerIn([0])) {
                    $gameMessage._eventActivator = "p2";
                    target.start();
                    triggered = true;
                }
            });
            $gameMap.eventsXy(ev.x, ev.y).forEach(target => {
                if (target !== ev && target.isTriggerIn([1, 2])) {
                    $gameMessage._eventActivator = "p2";
                    target.start();
                    triggered = true;
                }
            });
            if (triggered) SplitScreenManager._p2InteractLatch = true;

            // Map Puzzle System interactions (Levers, Switches, etc.)
            if (!triggered && window.MapPuzzleSystem) {
                triggered = window.MapPuzzleSystem.checkPuzzleInteractions(ev);
            }

            // Movement system interactions (Swimming, Climbing, Fishing)
            if (!triggered && SceneManager._scene instanceof Scene_Map) {
                SceneManager._scene.checkMovementInteraction(ev);
            }
        }
    }
}

    const _Game_Player_triggerButtonAction = Game_Player.prototype.triggerButtonAction;
    Game_Player.prototype.triggerButtonAction = function () {
        const result = _Game_Player_triggerButtonAction.call(this);
        if (result) {
            $gameMessage._eventActivator = "p1";
        }
        return result;
    };

    // Override getInputDirection to support P2 driving
    const _Game_Player_getInputDirection = Game_Player.prototype.getInputDirection;
    Game_Player.prototype.getInputDirection = function() {
        if (SplitScreenManager.active && SplitScreenManager.vehicleDriver === 'p2') {
            const input = SplitScreenManager.p2Input;
            if (input.up) return 8;
            if (input.down) return 2;
            if (input.left) return 4;
            if (input.right) return 6;
            return 0;
        }
        return _Game_Player_getInputDirection.call(this);
    };

    // Override getOnOffVehicle to handle state
    const _Game_Player_getOnOffVehicle = Game_Player.prototype.getOnOffVehicle;
    Game_Player.prototype.getOnOffVehicle = function() {
        const result = _Game_Player_getOnOffVehicle.call(this);
        // Only react to a REAL boarding/exit. The engine calls this on EVERY "ok"
        // press (Game_Player.triggerButtonAction), and result is false when no
        // vehicle transition actually happened. Without the result guard the else
        // branch ran on every interact and yanked P2 onto P1's tile each time P1
        // pressed the action button.
        if (result && SplitScreenManager.active) {
            if (this.isInVehicle()) {
                if (!SplitScreenManager.vehicleDriver) {
                    SplitScreenManager.vehicleDriver = 'p1';
                }
                const ev = SplitScreenManager.p2Event;
                if (ev && $gameMap.distance(this.x, this.y, ev.x, ev.y) < 5) {
                    ev.setOpacity(0);
                    ev.setPriorityType(0);
                }
            } else {
                SplitScreenManager.vehicleDriver = null;
                const ev = SplitScreenManager.p2Event;
                if (ev) {
                    ev.locate(this.x, this.y);
                    ev.setOpacity(255);
                    ev.setPriorityType(1);
                }
            }
        }
        return result;
    };

    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function () {
        if (SplitScreenManager.active) {
            const mapChanged = (this._newMapId !== $gameMap.mapId());
            _Game_Player_performTransfer.call(this);
            if (!mapChanged) {
                // Same-map teleport: only pull P2 along if they're truly far from P1's new position.
                // Unconditionally teleporting here was the root cause of the menu-exit warp bug
                // because many scenes return to Scene_Map via goto() which internally issues a
                // same-map "transfer" to restore the player, even if they haven't actually moved.
                const ev = SplitScreenManager.p2Event;
                if (ev && $gameMap.distance(this.x, this.y, ev.x, ev.y) > 8) {
                    findOrCreateP2Event(true);
                }
            }
            // Cross-map transfers: onMapLoaded handles repositioning via findOrCreateP2Event
        } else {
            _Game_Player_performTransfer.call(this);
        }
    };

    function checkP2TouchTriggers(ev, d) {
        const x2 = $gameMap.roundXWithDirection(ev.x, d);
        const y2 = $gameMap.roundYWithDirection(ev.y, d);
        $gameMap.eventsXy(x2, y2).forEach(target => {
            if (target !== ev && target.isTriggerIn([1, 2])) {
                if (!target.isMoving() && target.isNormalPriority()) {
                    $gameMessage._eventActivator = "p2";
                    target.start();
                }
            }
        });
    }

    const _Game_Event_checkEventTriggerTouch = Game_Event.prototype.checkEventTriggerTouch;
    Game_Event.prototype.checkEventTriggerTouch = function (x, y) {
        if (!$gameMap.isEventRunning()) {
            if (this._trigger === 2) {
                if ($gamePlayer.pos(x, y)) {
                    if (!this.isJumping() && this.isNormalPriority()) {
                        $gameMessage._eventActivator = "p1";
                        this.start();
                        return;
                    }
                } else if (SplitScreenManager.active && SplitScreenManager.p2Event && SplitScreenManager.p2Event.pos(x, y)) {
                    if (!this.isJumping() && this.isNormalPriority()) {
                        $gameMessage._eventActivator = "p2";
                        this.start();
                        return;
                    }
                }
            }
        }
        _Game_Event_checkEventTriggerTouch.call(this, x, y);
    };

    // Rendering
    const _Scene_Map_createSpriteset = Scene_Map.prototype.createSpriteset;
    Scene_Map.prototype.createSpriteset = function () {
        _Scene_Map_createSpriteset.call(this);
        this._p2DisplayX = 0;
        this._p2DisplayY = 0;
    };

    // By Scene_Map.start, every onMapLoaded override has run, so any map that
    // relocates $gamePlayer post-load (procedural houses / treasure rooms spawn
    // at region 13 after a reserveTransfer to 0,0) has settled on its final tile.
    // Snap P2 onto P1 here so it can't be stranded at 0,0 by plugin load order.
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        if (SplitScreenManager.active && SplitScreenManager.pendingP2Snap) {
            SplitScreenManager.pendingP2Snap = false;
            const ev = SplitScreenManager.p2Event;
            if (ev) ev.locate($gamePlayer.x, $gamePlayer.y);
        }
        // A 2P gauntlet was requested from the companion picker: now that the map
        // (the gauntlet's base scene) is live, open the bracket picker over it. The
        // gauntlet returns to this map between bouts and when it ends, keeping the
        // split-screen session intact. Battles stay single-screen and alternate
        // turns via the existing battle hot-seat routing.
        if ($gameTemp && $gameTemp._ssPendingGauntlet) {
            $gameTemp._ssPendingGauntlet = false;
            if (window.Scene_GauntletSelect) {
                SceneManager.push(window.Scene_GauntletSelect);
            }
        }
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        if (SplitScreenManager.active && SplitScreenManager.p2Event) {
            SplitScreenManager.updateControl();
            this.updateSplitScreen();
        } else if (this._splitScreenActive) {
            // Session ended (or P2 event lost) while staying on this map instance,
            // e.g. disconnecting through the Multiplayer menu which pops back to the
            // same Scene_Map. Without this the P1 mask, P2 spriteset and divider
            // would linger, leaving the screen frozen at half width.
            this.deactivateSplitScreen();
        }
    };

    Scene_Map.prototype.updateSplitScreen = function () {
        if (!this._splitScreenActive) this.activateSplitScreen();
        this.updateSplitViewports();
    };

    Scene_Map.prototype.activateSplitScreen = function () {
        this._splitScreenActive = true;
        const gw = Graphics.width;
        const gh = Graphics.height;

        const mask1 = new PIXI.Graphics().beginFill(0xffffff);
        if (SPLIT_DIR === "vertical") mask1.drawRect(0, 0, Math.floor(gw / 2), gh);
        else mask1.drawRect(0, 0, gw, Math.floor(gh / 2));
        this.addChild(mask1);
        this._spriteset.mask = mask1;
        this._p1Mask = mask1;

        // Initialize P2 camera to P2's actual tile position to prevent camera jump on scene creation
        const _ev = SplitScreenManager.p2Event;
        const _vpW = SPLIT_DIR === "vertical" ? gw / 2 : gw;
        const _vpH = SPLIT_DIR === "vertical" ? gh : gh / 2;
        const _tw = $gameMap.tileWidth();
        const _th = $gameMap.tileHeight();
        if (_ev) {
            this._p2DisplayX = Math.max(0, Math.min(_ev._realX - _vpW / _tw / 2 + 0.5, $gameMap.width() - _vpW / _tw));
            this._p2DisplayY = Math.max(0, Math.min(_ev._realY - _vpH / _th / 2 + 0.5, $gameMap.height() - _vpH / _th));
        } else {
            this._p2DisplayX = $gameMap.displayX();
            this._p2DisplayY = $gameMap.displayY();
        }

        this._p2Spriteset = new Spriteset_Map();

        // Hijack update to use P2-specific display coordinates
        const scene = this;
        const _p2Update = this._p2Spriteset.update;
        this._p2Spriteset.update = function () {
            const lastX = $gameMap._displayX;
            const lastY = $gameMap._displayY;
            $gameMap._displayX = scene._p2DisplayX;
            $gameMap._displayY = scene._p2DisplayY;
            _p2Update.call(this);
            $gameMap._displayX = lastX;
            $gameMap._displayY = lastY;
        };

        const mask2 = new PIXI.Graphics().beginFill(0xffffff);
        if (SPLIT_DIR === "vertical") {
            mask2.drawRect(Math.floor(gw / 2), 0, Math.floor(gw / 2), gh);
        } else {
            mask2.drawRect(0, Math.floor(gh / 2), gw, Math.floor(gh / 2));
        }
        this.addChild(mask2);
        this._p2Spriteset.mask = mask2;
        this._p2Mask = mask2;

        // Add behind window layer if possible
        const wlIdx = this._windowLayer ? this.children.indexOf(this._windowLayer) : -1;
        if (wlIdx >= 0) {
            this.addChildAt(this._p2Spriteset, wlIdx);
        } else {
            this.addChild(this._p2Spriteset);
        }

        // Create Divider
        const divider = new PIXI.Graphics().beginFill(0x000000);
        const thickness = 4;
        if (SPLIT_DIR === "vertical") {
            divider.drawRect(Math.floor(gw / 2) - thickness / 2, 0, thickness, gh);
        } else {
            divider.drawRect(0, Math.floor(gh / 2) - thickness / 2, gw, thickness);
        }

        const wlIdx2 = this._windowLayer ? this.children.indexOf(this._windowLayer) : -1;
        if (wlIdx2 >= 0) {
            this.addChildAt(divider, wlIdx2);
        } else {
            this.addChild(divider);
        }
        this._splitDivider = divider;
    };

    Scene_Map.prototype.deactivateSplitScreen = function () {
        this._splitScreenActive = false;
        if (this._spriteset && this._p1Mask) {
            this.removeChild(this._p1Mask);
            this._spriteset.mask = null;
            this._p1Mask = null;
        }
        if (this._splitDivider) {
            this.removeChild(this._splitDivider);
            this._splitDivider = null;
        }
        if (this._p2Spriteset) {
            if (this._p2Mask) {
                this.removeChild(this._p2Mask);
                this._p2Mask = null;
            }
            this.removeChild(this._p2Spriteset);
            this._p2Spriteset.destroy({ children: true });
            this._p2Spriteset = null;
        }
        this._spriteset.x = 0;
        this._spriteset.y = 0;
    };

    Scene_Map.prototype.updateSplitViewports = function () {
        const p1 = $gamePlayer;
        const ev = SplitScreenManager.p2Event;
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        const gw = Graphics.width;
        const gh = Graphics.height;
        const vpW = SPLIT_DIR === "vertical" ? gw / 2 : gw;
        const vpH = SPLIT_DIR === "vertical" ? gh : gh / 2;

        // P1 Centering (Center of their viewport)
        const p1TargetX = Math.max(0, Math.min(p1._realX - vpW / tw / 2 + 0.5, $gameMap.width() - vpW / tw));
        const p1TargetY = Math.max(0, Math.min(p1._realY - vpH / th / 2 + 0.5, $gameMap.height() - vpH / th));
        $gameMap._displayX = p1TargetX;
        $gameMap._displayY = p1TargetY;

        // P2 Centering (Center of their viewport)
        const p2TargetX = Math.max(0, Math.min(ev._realX - vpW / tw / 2 + 0.5, $gameMap.width() - vpW / tw));
        const p2TargetY = Math.max(0, Math.min(ev._realY - vpH / th / 2 + 0.5, $gameMap.height() - vpH / th));

        this._p2DisplayX += (p2TargetX - this._p2DisplayX) * 0.15;
        this._p2DisplayY += (p2TargetY - this._p2DisplayY) * 0.15;

        // Visual Offsets (Base positions for viewports)
        if (SPLIT_DIR === "vertical") {
            this._spriteset.x = 0;
            this._p2Spriteset.x = Math.floor(gw / 2);
            this._p2Spriteset.y = 0;
        } else {
            this._spriteset.y = 0;
            this._p2Spriteset.x = 0;
            this._p2Spriteset.y = Math.floor(gh / 2);
        }

        // Hide tiles if diving
        if (this._spriteset && this._spriteset._tilemap) {
            this._spriteset._tilemap.visible = !p1._hideTiles;
        }
        if (this._p2Spriteset && this._p2Spriteset._tilemap) {
            this._p2Spriteset._tilemap.visible = !ev._hideTiles;
        }
    };

    Scene_Map.prototype.updateMergedCamera = function () {
        const p1 = $gamePlayer;
        const p2 = SplitScreenManager.p2Event;
        const midX = (p1._realX + p2._realX) / 2;
        const midY = (p1._realY + p2._realY) / 2;
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        const gw = Graphics.width;
        const gh = Graphics.height;

        const targetX = Math.max(0, Math.min(midX - gw / tw / 2 + 0.5, $gameMap.width() - gw / tw));
        const targetY = Math.max(0, Math.min(midY - gh / th / 2 + 0.5, $gameMap.height() - gh / th));

        $gameMap._displayX += (targetX - $gameMap._displayX) * 0.12;
        $gameMap._displayY += (targetY - $gameMap._displayY) * 0.12;
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        if (this._splitScreenActive) this.deactivateSplitScreen();
        _Scene_Map_terminate.call(this);
    };

    // Message Window Overlay handling


    const _Window_Message_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        _Window_Message_terminateMessage.call(this);
        if (SplitScreenManager.active) {
            $gameMessage._eventActivator = null;
        }
    };





    // =========================================================================
    // Shared UI / dialogue input control
    //
    // Outside of battle, BOTH players may drive menus, dialogue advancement and
    // choices (including with the left analog stick, which pollInput() folds into
    // p2Input). Battle is turn-based, so there the active actor's controller is
    // routed separately via the Window_Selectable hooks below and we never merge
    // P2 input into the global Input here.
    // =========================================================================

    // Maps an engine input key to the equivalent P2 input key, or null when the
    // key is not a navigation / confirm / cancel key we share with P2.
    function p2NavKey(key) {
        switch (key) {
            case "ok": return "action";
            case "cancel": return "cancel";
            case "up":
            case "down":
            case "left":
            case "right":
                return key;
            default: return null;
        }
    }

    // True while a message/choice is on screen outside battle: either player may
    // advance it, fast-forward it, or move the choice cursor.
    function p2CanDriveMessage() {
        return SplitScreenManager.active &&
            $gameMessage.isBusy() &&
            !inBattleUi();
    }

    // True while a (non-map, non-battle) menu/scene is open: P2 shares cursor and
    // confirm/cancel control of every Window_Selectable-based or Input-driven UI.
    // Scene_Map is excluded because there P2 walks independently; battle UIs are
    // excluded because they are turn-based and routed per acting actor below.
    function p2SharesUiControl() {
        if (!SplitScreenManager.active) return false;
        const scene = SceneManager._scene;
        if (!scene) return false;
        if (scene instanceof Scene_Map) return false;
        if (inBattleUi()) return false;
        return true;
    }

    // =========================================================================
    // Universal minigame hot-seat support
    //
    // Player 2 can drive ANY registered minigame scene, even with no split-screen
    // overworld session running. The 2nd gamepad is auto-merged into the standard
    // input symbols by the engine, so it already works for anything that reads
    // Input. The remaining gap is the keyboard: the numpad (and, while a session
    // is active, WASD) is tracked by the engine as the p2_* symbols mapped above.
    // Folding those p2_* symbols into the standard keys turns single-player
    // minigames into hot-seat games (either player steers; turn-based games
    // alternate) without touching the individual minigame plugins.
    //
    // Scoped to a known set of minigame scenes (matched by constructor name) so
    // ordinary menus are unaffected. Other plugins can opt a scene in via
    // SplitScreenManager.registerMinigameScene("Scene_Foo").
    // =========================================================================
    const MINIGAME_SCENES = new Set([
        // ArcadeCabinetManager (covers every arcade cart: Snake, Frogger,
        // Space Invaders, Bubble Pop, ... which all read ArcadeManager.getInput()
        // -> Input.isPressed under the hood).
        "Scene_Arcade", "Scene_GameSelect", "Scene_HighScores", "Scene_InitialEntry",
        // Standalone minigame scenes.
        "Scene_HorseRace", "Scene_SlotMachine", "Scene_Tarot", "Scene_TarotNPC",
        "Scene_Chess", "Scene_Pool", "Scene_BowlingMinigame", "Scene_HyperTamer",
        "Scene_MonsterTournament", "Scene_FishingMinigame", "Scene_SurfingGame",
        "Scene_PeriodicTable", "Scene_RamanScan", "Scene_ScratchCard",
        "Scene_BoosterPack", "Scene_UnlockingBlocks", "Scene_TokenConverter"
    ]);

    SplitScreenManager.registerMinigameScene = function (name) {
        if (name) MINIGAME_SCENES.add(String(name));
    };

    function inMinigameScene() {
        const scene = SceneManager._scene;
        return !!scene && scene.constructor && MINIGAME_SCENES.has(scene.constructor.name);
    }

    // Standard engine key -> the Player 2 input symbol the engine tracks for the
    // numpad / WASD (see the Input.keyMapper block at the top of this plugin).
    function p2EngineSymbol(key) {
        switch (key) {
            case "ok": return "p2_action";
            case "cancel": return "p2_dash";
            case "up": return "p2_up";
            case "down": return "p2_down";
            case "left": return "p2_left";
            case "right": return "p2_right";
            default: return null;
        }
    }

    // True when Player 2 input should be folded into the standard Input symbols.
    function p2SharesInput() {
        return p2CanDriveMessage() || p2SharesUiControl() || inMinigameScene();
    }

    const _Input_isTriggered = Input.isTriggered;
    Input.isTriggered = function (key) {
        const pk = p2NavKey(key);
        if (pk && p2SharesInput()) {
            if (_Input_isTriggered.call(this, key)) return true;
            if (SplitScreenManager.active && SplitScreenManager.isTriggered(pk)) return true;
            const sym = p2EngineSymbol(key);
            return sym ? _Input_isTriggered.call(this, sym) : false;
        }
        return _Input_isTriggered.call(this, key);
    };

    const _Input_isRepeated = Input.isRepeated;
    Input.isRepeated = function (key) {
        const pk = p2NavKey(key);
        if (pk && p2SharesInput()) {
            if (_Input_isRepeated.call(this, key)) return true;
            if (SplitScreenManager.active && SplitScreenManager.isRepeated(pk)) return true;
            const sym = p2EngineSymbol(key);
            return sym ? _Input_isRepeated.call(this, sym) : false;
        }
        return _Input_isRepeated.call(this, key);
    };

    const _Input_isPressed = Input.isPressed;
    Input.isPressed = function (key) {
        const pk = p2NavKey(key);
        if (pk && p2SharesInput()) {
            if (_Input_isPressed.call(this, key)) return true;
            if (SplitScreenManager.active && !!SplitScreenManager.p2Input[pk]) return true;
            const sym = p2EngineSymbol(key);
            return sym ? _Input_isPressed.call(this, sym) : false;
        }
        return _Input_isPressed.call(this, key);
    };

    // --- Battle System Integration ---

    Game_Actor.prototype.multiplayerPlayerId = function () {
        // Player 2 controls whichever member they have taken over, which is not
        // necessarily the second in the marching order any more: either player
        // can hand a body back to the CPU and pick up another.
        return SplitScreenManager.isP2Actor(this) ? 2 : 1;
    };

    const _Window_Selectable_processCursorMove = Window_Selectable.prototype.processCursorMove;
    Window_Selectable.prototype.processCursorMove = function () {
        if (SplitScreenManager.active && inBattleUi()) {
            const actor = BattleManager.actor();
            if (actor) {
                const playerId = actor.multiplayerPlayerId();
                if (playerId === 2) {
                    this.processP2CursorMove();
                    return;
                }
            }
        }
        _Window_Selectable_processCursorMove.call(this);
    };

    Window_Selectable.prototype.processP2CursorMove = function () {
        if (this.isOpenAndActive()) {
            if (SplitScreenManager.isRepeated("down")) this.cursorDown(true);
            if (SplitScreenManager.isRepeated("up")) this.cursorUp(true);
            if (SplitScreenManager.isRepeated("right")) this.cursorRight(true);
            if (SplitScreenManager.isRepeated("left")) this.cursorLeft(true);
        }
    };

    const _Window_Selectable_updateInputData = Window_Selectable.prototype.updateInputData;
    Window_Selectable.prototype.updateInputData = function () {
        _Window_Selectable_updateInputData.call(this);
        if (SplitScreenManager.active && inBattleUi()) {
            const actor = BattleManager.actor();
            if (actor && actor.multiplayerPlayerId() === 2) {
                SplitScreenManager.consumeTrigger();
            }
        }
    };

    const _Window_Selectable_processHandling = Window_Selectable.prototype.processHandling;
    Window_Selectable.prototype.processHandling = function () {
        if (SplitScreenManager.active && inBattleUi()) {
            const actor = BattleManager.actor();
            if (actor) {
                const playerId = actor.multiplayerPlayerId();
                if (playerId === 2) {
                    this.processP2Handling();
                    return;
                }
            }
        }
        _Window_Selectable_processHandling.call(this);
    };

    Window_Selectable.prototype.processP2Handling = function () {
        if (this.isOpenAndActive()) {
            if (this.isP2OkEnabled() && SplitScreenManager.isTriggered("action")) {
                this.processOk();
            } else if (this.isCancelEnabled() && SplitScreenManager.isTriggered("cancel")) {
                this.processCancel();
            }
        }
    };

    Window_Selectable.prototype.isP2OkEnabled = function () {
        return this.isOkEnabled();
    };

    const _Window_ActorCommand_refresh = Window_ActorCommand.prototype.refresh;
    Window_ActorCommand.prototype.refresh = function () {
        _Window_ActorCommand_refresh.call(this);
        if (SplitScreenManager.active && this._actor) {
            const playerId = this._actor.multiplayerPlayerId();
            this.drawPlayerLabel(playerId);
        }
    };

    Window_ActorCommand.prototype.drawPlayerLabel = function (playerId) {
        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = 14;
        const text = "PLAYER " + playerId;
        this.drawText(text, 0, -10, this.contentsWidth(), "right");
        this.resetFontSettings();
    };

    // =========================================================================
    // Auto-Start Split-Screen
    // =========================================================================
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        _DataManager_setupNewGame.call(this);
        if (AUTO_START) {
            // Generate pool of random candidates
            const candidates = SplitScreenManager.createSelectionPool();
            if (candidates.length > 0) {
                // Pick the first random candidate and start session
                SplitScreenManager.startSession(candidates[0]);
            }
        }
    };

    // Allow Player 2 to open the pause menu with the Y button
    const _Scene_Map_isMenuCalled = Scene_Map.prototype.isMenuCalled;
    Scene_Map.prototype.isMenuCalled = function() {
        if (SplitScreenManager.active) {
            // Block menu if P2 action button is pressed (safety check)
            if (SplitScreenManager.p2Input.action) return false;
            // Allow P2 to open menu with Y button
            if (SplitScreenManager.isTriggered("menu")) return true;
        }
        return _Scene_Map_isMenuCalled.call(this);
    };

    const _Scene_Map_callMenu = Scene_Map.prototype.callMenu;
    Scene_Map.prototype.callMenu = function() {
        if (SplitScreenManager.active && SplitScreenManager.isTriggered("menu")) {
            const p2Actor = SplitScreenManager.p2Actor();
            if (p2Actor) $gameParty.setMenuActor(p2Actor);
        }
        _Scene_Map_callMenu.call(this);
    };

    // =========================================================================
    // PEEK SYSTEM MULTIPLAYER INTEGRATION (STUBS & DOCUMENTATION)
    // =========================================================================
    /**
     * Hides the split-screen viewport for a specific player during a Peek.
     * When a player is peeking, we want to maximize the other player's view
     * or obscure the non-peeking player's screen.
     * @param {number} playerId - The ID (1 or 2) of the player whose viewport to hide.
     */
    SplitScreenManager.hideViewportForPeek = function(playerId) {
        console.log(`[SplitScreenManager] Stub: Hiding viewport for Player ${playerId} due to Peek`);
        
        // FUTURE IMPLEMENTATION DETAILS:
        // 1. Identify which viewport corresponds to the player.
        // 2. Set the visibility of the player's viewport container (or spriteset) to false.
        //    For example:
        //    if (playerId === 2 && this.p2Event) {
        //        // Hide player 2's spriteset rendering
        //        if (SceneManager._scene._p2Spriteset) {
        //            SceneManager._scene._p2Spriteset.visible = false;
        //        }
        //    } else if (playerId === 1) {
        //        if (SceneManager._scene._spriteset) {
        //            SceneManager._scene._spriteset.visible = false;
        //        }
        //    }
        // 3. Adjust the PIXI masks or viewport bounds to let the peeking player's viewport
        //    fill the entire screen (100% width/height).
    };

    /**
     * Restores all split-screen viewports after a Peek has ended.
     */
    SplitScreenManager.restoreViewportsAfterPeek = function() {
        console.log(`[SplitScreenManager] Stub: Restoring all viewports after Peek`);
        
        // FUTURE IMPLEMENTATION DETAILS:
        // 1. Reset viewport visibility back to true.
        // 2. Recalculate PIXI masks so both P1 and P2 viewports split the screen again.
        //    This can be done by calling this.updateSplitViewports() with merged = false.
    };

})();
