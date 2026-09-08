//=============================================================================
// MultiplayerSystem_Unified.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v6.1.0 - Combined Multiplayer System (LAN + Server + Steamworks) with premium Parchment Control Terminals.
 * @author Omni-Lex (Merged Architecture)
 * @help
 * This plugin unifies the 64-player Central Server architecture (with Party System)
 * and the 8-player Steamworks P2P architecture into a single plugin.
 *
 * --- LAN ---
 * LAN play is the easy road and the only networked mode that is open: one
 * player presses HOST A SESSION, the others press SCAN THE NETWORK and pick the
 * host out of the list that fills itself in. No address is ever typed.
 *
 * The host runs server.js in-process (NW.js only) and answers UDP discovery
 * probes on port 41235; the scan broadcasts a probe on every interface and, on
 * a network that forbids broadcast, falls back to knocking on port 8080 of
 * every address in the local /24. A LAN session IS a WebSocket session, so
 * everything the server mode already does (party pockets, remote player events,
 * switch and variable sync) works unchanged.
 *
 * The session is played in the HOST's world: the host packs its world folder
 * up at login and every guest adopts it (same seed, same history, same NPCs,
 * same public state) before anything reads a world value. Vehicles travel too:
 * where each one is parked and how much fuel it holds is mirrored, and a player
 * riding one is drawn riding it on everybody else's map.
 *
 * Two players on one map see one map. The lowest player id standing on a map
 * (the host whenever present) drives its NPCs and monsters and reports their
 * positions, troops, HP and deaths; the others place what they are told and
 * stop their own simulation of that map. Map Battle Mode is the host's
 * setting for the whole session. With it off, a fight in the battle scene is
 * shared: the monster steps up beside the fighter on the others' maps, anyone
 * within six tiles joins at once and anyone who bumps it joins later, each
 * fighter sees the others as stand-ins in their line, blows travel as damage
 * to the same monster, and whoever flees simply drops out of the others'
 * line.
 *
 * --- SETUP ---
 * 1. Choose your "Network Mode" in the plugin parameters.
 * 2. Create events named "Player1" through "Player8" on your maps. That is a
 *    rendering cap: a 64-player server session still only draws the nearest 8
 *    other players on any single map (party members first). Steam lobbies are
 *    capped at 8 players, so 8 slots always cover them.
 * 3. For Steamworks mode, the js/libs/steamworks folder MUST be a full steamworks.js
 *    build that exposes the matchmaking, networking and callback modules. The plugin
 *    logs a warning and disables Steam multiplayer if those modules are missing.
 *    Steam must be running and steam_appid.txt (App ID 4193010) present for dev builds.
 * 4. For Server mode, ensure your custom WebSocket server is running.
 *
 * --- STEAM "JOIN GAME" ---
 * When a player creates or joins a Steam lobby, rich presence key "connect" is set to
 * "+connect_lobby <lobbyId>", so friends see "Join Game" in the Steam friends list and
 * chat. Accepting fires GameRichPresenceJoinRequested / GameLobbyJoinRequested (handled
 * here) if the game is running, or launches the game with "+connect_lobby <id>" which is
 * parsed on boot. The join is applied once the player is in-world on a map.
 *
 * @param networkMode
 * @text Network Mode
 * @desc Choose between 'WebSocket' (Server with Parties) or 'Steamworks' (P2P Lobby).
 * @type select
 * @option WebSocket
 * @option Steamworks
 * @default WebSocket
 *
 * @param serverUrl
 * @text Server URL (WebSocket Only)
 * @desc WebSocket URL of the central game server, e.g. ws://1.2.3.4:8080 or wss://mp.example.com. http(s):// is accepted and rewritten.
 * @default wss://hypernet-explorer-signaling-server.onrender.com
 *
 * @param maxPlayers
 * @text Maximum Players (Custom Server)
 * @desc Max players for the custom WebSocket server (up to 64). Steam P2P is always hard-capped at 8.
 * @type number
 * @min 2
 * @max 64
 * @default 64
 *
 * @param excludedSwitches
 * @text Excluded Switches
 * @desc Comma-separated list of Switch IDs to NOT synchronize.
 * @type string
 * @default
 *
 * @param excludedVariables
 * @text Excluded Variables
 * @desc Comma-separated list of Variable IDs to NOT synchronize.
 * @type string
 * @default
 *
 * @param showPlayerNames
 * @text Show Player Names
 * @desc Show player display names above their character sprites.
 * @type boolean
 * @default true
 *
 * @param nameplateConfig
 * @text Nameplate Config
 * @type struct<Nameplate>
 * @default {"fontFace":"GameFont","fontSize":"18","textColor":"#FFFFFF","outlineColor":"rgba(0, 0, 0, 0.7)","outlineWidth":"3","yOffset":"-50"}
 */

/*~struct~Nameplate:
 * @param fontFace
 * @text Font Face
 * @default GameFont
 * @param fontSize
 * @text Font Size
 * @type number
 * @min 1
 * @default 18
 * @param textColor
 * @text Text Color
 * @default #FFFFFF
 * @param outlineColor
 * @text Outline Color
 * @default rgba(0, 0, 0, 0.7)
 * @param outlineWidth
 * @text Outline Width
 * @type number
 * @min 0
 * @default 3
 * @param yOffset
 * @text Y Offset
 * @type number
 * @default -50
 * @min -100
 */

(() => {
    'use strict';

    // RMMZ keys both the parameter set and the plugin commands by the FILE name
    // (Utils.extractFileName over the plugins.js entry), so asking under the old
    // "_Unified" working title read an empty parameter set: showPlayerNames came
    // back undefined and nameplates were off however the entry was configured.
    // The file name is the one name that answers; the working title stays on as
    // a command alias.
    const PLUGIN_NAME = 'MultiplayerSystem';
    const LEGACY_PLUGIN_NAME = 'MultiplayerSystem_Unified';
    const params = PluginManager.parameters(PLUGIN_NAME);

    let NetworkMode = params.networkMode || 'WebSocket';
    window.NetworkMode = NetworkMode;
    // Networked play OVER THE INTERNET (Steam P2P lobbies and the central WebSocket
    // server) is greyed out for now: both entries stay visible in the menu but cannot
    // be selected. Local split-screen and LAN play are unaffected: LAN is gated on
    // whether Node is there to host with (LanSession.isAvailable), not on this.
    // Flip this back to true to re-enable the internet modes.
    const NETWORK_PLAY_ENABLED = false;
    window.MultiplayerNetworkPlayEnabled = NETWORK_PLAY_ENABLED;
    // Steam P2P lobbies are hard-capped at 8 players here; the custom WebSocket server's
    // limit (up to 64) is enforced server-side by server.js.
    const STEAM_MAX_PLAYERS = 8;
    // How many remote players can be drawn on one map at once. Maps only carry
    // "Player1".."Player8" events, so this is a rendering cap, not a session cap:
    // a 64-player server session shows the nearest 8 others per map.
    const MAX_MAP_PLAYER_SLOTS = 8;
    // WebSocket() only accepts ws:// and wss://, so normalise whatever the player typed
    // (http(s):// pasted from a browser, or a bare "1.2.3.4:8080" host) into a real
    // socket URL. Bare hosts are assumed plaintext, which is what a fresh VPS serves.
    function toWebSocketUrl(url) {
        const raw = String(url || '').trim().replace(/\/+$/, '');
        if (!raw) return '';
        if (/^wss?:\/\//i.test(raw)) return raw;
        if (/^https:\/\//i.test(raw)) return 'wss://' + raw.slice(8);
        if (/^http:\/\//i.test(raw)) return 'ws://' + raw.slice(7);
        return 'ws://' + raw;
    }

    const ExcludedSwitches = (params.excludedSwitches || '').split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    const ExcludedVariables = (params.excludedVariables || '').split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

    // WorldManager already answers "does this belong to the world or to this
    // one playthrough", and a session shares a world, not a playthrough. So the
    // same line is drawn here: world-shared switches and variables travel, and
    // the private ones (the story-mode flags character creation sets, a party's
    // own bounty and police heat, hunger, the per-savegame counters) stay on the
    // machine they were changed on. Without this, joining a game rewrote the
    // other player's own progress the first time either of them slept.
    // 66 (connected) and 67 (multiplayer on) describe THIS machine's session:
    // split-screen sets 67 too, and letting either cross the wire would tell the
    // other player they are in a session they never joined.
    const SESSION_SWITCHES = [66, 67];

    function isSyncableSwitch(id) {
        if (SESSION_SWITCHES.includes(Number(id))) return false;
        if (ExcludedSwitches.includes(Number(id))) return false;
        const WM = window.WorldManager;
        if (WM && WM.isPrivateSwitch && WM.isPrivateSwitch(id)) return false;
        return true;
    }

    // The world's own passage of time. Both players walking would otherwise
    // each push the clock forward and the day would run at double speed, so in
    // a LAN session the host's clock is the session's clock: only the host
    // broadcasts these, and a guest's clock is never wound backwards by a
    // packet that arrived late.
    //   the clock, the calendar date, the world temperature
    function worldClockVarIds() {
        const WM = window.WorldManager;
        const clock = (WM && WM.timeVariableId) ? WM.timeVariableId() : 114;
        return [clock, 113, 61];
    }

    function isHostAuthoritativeVariable(id) {
        return worldClockVarIds().indexOf(Number(id)) !== -1;
    }

    function isSyncableVariable(id) {
        if (ExcludedVariables.includes(Number(id))) return false;
        const WM = window.WorldManager;
        // Variables are per-savegame unless the world's manifest shares them
        // (the clock, the date, the world temperature, the market signal).
        if (WM && WM.isWorldSharedVariable) return WM.isWorldSharedVariable(id);
        return true;
    }
    const ShowPlayerNames = params.showPlayerNames === 'true';
    // A malformed plugin parameter must not take the whole plugin down at load
    // time: fall back to the defaults and carry on.
    const NameplateConfig = (() => {
        try {
            return JSON.parse(params.nameplateConfig || '{}');
        } catch (e) {
            console.error('[Multiplayer] nameplateConfig is not valid JSON, using defaults:', e);
            return {};
        }
    })();

    // ============================================================================
    // STEAMWORKS INITIALIZATION
    // ============================================================================
    const STEAM_APP_ID = 4193010;
    let steamworks = null;
    let steamClient = null;

    // --- Version-tolerant helpers around the steamworks.js API ---
    // These smooth over shape differences between steamworks.js releases and
    // guard against the bundled binary lacking a module entirely.
    function swEnum(pathStr, fallback) {
        try {
            let o = steamworks;
            for (const part of pathStr.split('.')) {
                if (o == null) return fallback;
                o = o[part];
            }
            return o === undefined ? fallback : o;
        } catch (e) { return fallback; }
    }

    function steamIdToString(v) {
        if (v == null) return null;
        if (typeof v === 'object') {
            if (v.steamId64 !== undefined && v.steamId64 !== null) return v.steamId64.toString();
            if (typeof v.getSteamId64 === 'function') return v.getSteamId64().toString();
        }
        return v.toString();
    }

    function toBig(id) { return typeof id === 'bigint' ? id : BigInt(id); }

    function p2pSend(steamId, buffer) {
        if (!steamClient || !steamClient.networking || steamId == null) return;
        // Modern steamworks.js signature: sendP2PPacket(steamId64, sendType, data)
        steamClient.networking.sendP2PPacket(toBig(steamId), swEnum('SendType.Reliable', 2), buffer);
    }

    function p2pAccept(steamId) {
        if (!steamClient || !steamClient.networking || steamId == null) return;
        const net = steamClient.networking;
        if (typeof net.acceptP2PSession === 'function') net.acceptP2PSession(toBig(steamId));
        else if (typeof net.acceptP2PSessionWithUser === 'function') net.acceptP2PSessionWithUser(toBig(steamId));
    }

    function setSteamConnect(lobbyId) {
        const lp = steamClient && steamClient.localplayer;
        if (!lp || typeof lp.setRichPresence !== 'function') return;
        try {
            if (lobbyId) {
                // The special "connect" key makes friends see "Join Game" in the friends
                // list and Steam chat; its value is passed to the game on join/launch.
                lp.setRichPresence('connect', '+connect_lobby ' + lobbyId);
            } else {
                lp.setRichPresence('connect'); // omitting the value clears it (removes "Join Game")
            }
        } catch (e) { /* rich presence is best-effort */ }
    }

    function clearSteamConnect() { setSteamConnect(null); }

    function registerSteamCallback(name, handler) {
        try {
            const cb = steamClient && steamClient.callback;
            if (!cb || typeof cb.register !== 'function') return;
            const id = swEnum('SteamCallback.' + name, undefined);
            if (id === undefined) return;
            cb.register(id, handler);
        } catch (e) { /* callback unsupported on this build */ }
    }

    // steamworks.js remaps EChatMemberStateChange to a sequential enum, delivered as a
    // plain number: Entered=0, Left=1, Disconnected=2, Kicked=3, Banned=4.
    function steamMemberJoined(state) {
        const E = swEnum('ChatMemberStateChange', null);
        if (E && E.Entered !== undefined) return state === E.Entered;
        return Number(state) === 0;
    }
    function steamMemberGone(state) {
        const E = swEnum('ChatMemberStateChange', null);
        if (E && E.Left !== undefined) return state === E.Left || state === E.Disconnected || state === E.Kicked || state === E.Banned;
        return Number(state) >= 1; // Left / Disconnected / Kicked / Banned
    }

    function parseConnectLobby(connect) {
        if (!connect) return null;
        const m = String(connect).match(/\+connect_lobby\s+(\d+)/);
        return m ? m[1] : null;
    }

    function getLaunchArgv() {
        try { if (typeof nw !== 'undefined' && nw.App && nw.App.argv) return nw.App.argv; } catch (e) { }
        try { if (typeof process !== 'undefined' && process.argv) return process.argv; } catch (e) { }
        return [];
    }

    function initSteam() {
        if (steamClient) return true;
        try {
            steamworks = require('../libs/steamworks');
            steamClient = steamworks.init(STEAM_APP_ID);

            // The bundled/stripped binary only exposes achievements + cloud + stats.
            // Multiplayer needs the matchmaking, networking and callback modules; if
            // they are missing, fail loudly and point at the fix instead of half-working.
            if (!steamClient.matchmaking || !steamClient.networking || !steamClient.callback) {
                console.warn('[Multiplayer] The steamworks native module lacks matchmaking/networking/callback. ' +
                    'Replace js/libs/steamworks with a full steamworks.js build to enable Steam multiplayer.');  // i18n-ignore  console diagnostic
                steamClient = null;
                return false;
            }

            const lp = steamClient.localplayer;
            const name = (lp && typeof lp.getName === 'function') ? lp.getName()
                : (typeof steamClient.getName === 'function' ? steamClient.getName() : 'Unknown');  // i18n-ignore  Steam account fallback, not shown in game
            console.log('Steamworks initialized successfully for User:', name);

            const inst = NetworkManager_Steam.instance;
            inst.mySteamId = inst.resolveMySteamId();
            inst.setupSteamCallbacks();
            return true;
        } catch (e) {
            // Expected for players without Steam running; keep it quiet, not an error spew.
            console.log('Steamworks not available (is Steam running?):', e && e.message);
            return false;
        }
    }

    // Handles "Join Game" requests coming from Steam (friends list / chat / launch args).
    // Defers the actual join until the game world is ready and we are on a map scene.
    const SteamJoinRequest = {
        _pendingLobbyId: null,
        handle(lobbyId) {
            if (!lobbyId) return;
            if (!NETWORK_PLAY_ENABLED) return;                          // networked play disabled
            this._pendingLobbyId = lobbyId;
            this.tryConsume();
        },
        tryConsume() {
            if (!NETWORK_PLAY_ENABLED) return;
            if (!this._pendingLobbyId) return;
            if (!initSteam()) return;                                   // Steam / full binary required
            if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.leader()) return; // world not ready
            if (!(SceneManager._scene instanceof Scene_Map)) return;    // wait until on a map
            const lobbyId = this._pendingLobbyId;
            this._pendingLobbyId = null;

            NetworkMode = 'Steamworks';
            window.NetworkMode = NetworkMode;
            NetworkManager = NetworkManager_Steam;
            window.NetworkManager = NetworkManager;

            const nm = NetworkManager_Steam.instance;
            if (nm.isMultiplayer()) nm.disconnect(true);
            NetworkManager_Steam.updateUI(T('Multiplayer.joiningFriendLobby'));
            nm.initiateJoinRoom(lobbyId, true);
        }
    };
    window.SteamJoinRequest = SteamJoinRequest;
    // NOTE: the best-effort boot init + launch-arg join are performed at the very end of
    // this IIFE, after NetworkManager_Steam is defined (class declarations are not hoisted).

    // ============================================================================
    // COMMON: OfflineStateManager
    // ============================================================================
    class OfflineStateManager {
        constructor() { this.savedState = null; }

        saveCurrentState() {
            this.savedState = {
                mapId: $gameMap.mapId(),
                x: $gamePlayer.x,
                y: $gamePlayer.y,
                direction: $gamePlayer.direction(),
                switches: this.captureAllSwitches(),
                variables: this.captureAllVariables(),
                dungeonFloors: $gameSystem._dungeonFloors ? JSON.parse(JSON.stringify($gameSystem._dungeonFloors)) : null,
                stairLocations: $gameSystem._stairLocations ? JSON.parse(JSON.stringify($gameSystem._stairLocations)) : null,
                timestamp: Date.now()
            };
            return this.savedState;
        }

        captureAllSwitches() {
            const switches = {};
            for (let i = 1; i < $dataSystem.switches.length; i++) switches[i] = $gameSwitches.value(i);
            return switches;
        }

        captureAllVariables() {
            const variables = {};
            for (let i = 1; i < $dataSystem.variables.length; i++) variables[i] = $gameVariables.value(i);
            return variables;
        }

        restoreState(restorePosition = true) {
            if (!this.savedState) return false;
            for (const id in this.savedState.switches) $gameSwitches.setValue(Number(id), this.savedState.switches[id], true);
            for (const id in this.savedState.variables) $gameVariables.setValue(Number(id), this.savedState.variables[id], true);

            if (this.savedState.dungeonFloors !== null) $gameSystem._dungeonFloors = JSON.parse(JSON.stringify(this.savedState.dungeonFloors));
            if (this.savedState.stairLocations !== null) $gameSystem._stairLocations = JSON.parse(JSON.stringify(this.savedState.stairLocations));

            if (restorePosition) {
                if ($gameMap.mapId() !== this.savedState.mapId) {
                    $gamePlayer.reserveTransfer(this.savedState.mapId, this.savedState.x, this.savedState.y, this.savedState.direction, 0);
                } else {
                    $gamePlayer.locate(this.savedState.x, this.savedState.y);
                    $gamePlayer.setDirection(this.savedState.direction);
                }
            }
            this.clearState();
            return true;
        }

        clearState() { this.savedState = null; }
    }


    // ============================================================================
    // MODE: WEBSOCKET (SERVER ARCHITECTURE WITH PARTY SYSTEM)
    // ============================================================================
    class NetworkManager_Server {
        constructor() {
            this.ws = null;
            this.myId = null;
            this.players = new Map();
            this.party = null;
            this.currentServerUrl = '';
            this.lastPlayerState = {};
            this.offlineStateManager = new OfflineStateManager();
            this._disconnectionHandled = false;
            this._intentionalDisconnect = false;
            this._sendQueue = [];
            this._reconnectAttempts = 0;
            this._reconnectTimer = null;
        }

        static get MAX_RECONNECT_ATTEMPTS() { return 5; }
        static get RECONNECT_BASE_DELAY() { return 1000; }
        static get RECONNECT_MAX_DELAY() { return 30000; }

        static get instance() {
            if (!this._instance) this._instance = new NetworkManager_Server();
            return this._instance;
        }

        pollPackets() { }

        static refreshPlayerListUI() {
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Map && scene._playerListWindow) scene._playerListWindow.refresh();
        }

        isConnected() { return this.ws && this.ws.readyState === WebSocket.OPEN; }
        isMultiplayer() { return !!this.myId; }
        isInParty() { return !!(this.party && Array.isArray(this.party.members)); }
        isConnecting() { return this.ws && this.ws.readyState === WebSocket.CONNECTING; }

        connect(serverUrl) {
            return new Promise((resolve, reject) => {
                this.offlineStateManager.saveCurrentState();
                if (this.ws && this.ws.readyState !== WebSocket.CLOSED) this.ws.close();

                // Reset per-connection guards so disconnection handling runs once per socket.
                this._disconnectionHandled = false;
                this._intentionalDisconnect = false;

                const socketUrl = toWebSocketUrl(serverUrl);
                this.currentServerUrl = socketUrl;
                try {
                    this.ws = new WebSocket(socketUrl);
                } catch (e) {
                    // Malformed address: WebSocket throws synchronously.
                    this.ws = null;
                    NetworkManager_Server.updateUI(T('Multiplayer.invalidAddress', { url: socketUrl }), true);
                    reject(e);
                    return;
                }
                NetworkManager_Server.updateUI(T('Multiplayer.connectingTo', { url: socketUrl }), false);

                this.ws.onopen = () => {
                    this.send({ type: 'login', playerInfo: this.createPlayerInfo() });
                    this.flushSendQueue();
                    resolve();
                };
                this.ws.onmessage = (message) => {
                    let parsed;
                    try {
                        parsed = JSON.parse(message.data);
                    } catch (e) {
                        return; // Ignore non-JSON frames (ping/keepalive)
                    }
                    this.handleServerMessage(parsed);
                };
                this.ws.onerror = (error) => {
                    NetworkManager_Server.updateUI(T('Multiplayer.connectFailed'), true);
                    this.handleDisconnection(true);
                    reject(error);
                };
                this.ws.onclose = () => this.handleDisconnection(true);
            });
        }

        handleDisconnection(restoreLocalState) {
            // onerror and the subsequent onclose both call this; only act once per socket.
            if (this._disconnectionHandled) return;
            this._disconnectionHandled = true;
            const wasConnected = !!this.myId;
            if (restoreLocalState && this.myId) this.offlineStateManager.restoreState(true);
            this.cleanup();
            NetworkManager_Server.updateUI(T('Multiplayer.disconnected'), false);
            // Attempt a bounded auto-reconnect only for unexpected drops of an active
            // session (wasConnected), or while a reconnect cycle is already in progress.
            if (!this._intentionalDisconnect && this.currentServerUrl &&
                (wasConnected || this._reconnectAttempts > 0)) {
                this.scheduleReconnect();
            }
        }

        scheduleReconnect() {
            if (this._reconnectTimer) return;
            if (this._reconnectAttempts >= NetworkManager_Server.MAX_RECONNECT_ATTEMPTS) {
                NetworkManager_Server.updateUI(T('Multiplayer.reconnectGaveUp'), true);
                this._reconnectAttempts = 0;
                return;
            }
            const attempt = this._reconnectAttempts;
            const delay = Math.min(
                NetworkManager_Server.RECONNECT_BASE_DELAY * Math.pow(2, attempt),
                NetworkManager_Server.RECONNECT_MAX_DELAY
            );
            this._reconnectAttempts++;
            NetworkManager_Server.updateUI(T('Multiplayer.reconnectingIn', { seconds: Math.round(delay / 1000) }), false);
            this._reconnectTimer = setTimeout(() => {
                this._reconnectTimer = null;
                if (this._intentionalDisconnect) return;
                NetworkManager_Server.updateUI(T('Multiplayer.reconnectingAttempt', { attempt: this._reconnectAttempts }), false);
                this.connect(this.currentServerUrl).catch(() => { });
            }, delay);
        }

        cancelReconnect() {
            if (this._reconnectTimer) {
                clearTimeout(this._reconnectTimer);
                this._reconnectTimer = null;
            }
            this._reconnectAttempts = 0;
        }

        flushSendQueue() {
            if (!this._sendQueue || !this._sendQueue.length) return;
            const queued = this._sendQueue;
            this._sendQueue = [];
            for (const data of queued) {
                if (this.isConnected()) this.ws.send(JSON.stringify(data));
            }
        }

        cleanup() {
            if (this.ws) {
                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onerror = null;
                this.ws.onclose = null;
                if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
                this.ws = null;
            }
            this.players.clear();
            MultiplayerManager.instance.clearRemotePlayers();
            NetworkManager_Server.refreshPlayerListUI();
            this.myId = null;
            this.party = null;
            this.lastPlayerState = {};
            this._sendQueue = [];
            $gameSwitches.setValue(66, false, true);
            $gameSwitches.setValue(67, false, true);
            // A host whose own client went down has no session left to serve.
            if (LanSession.hosting && !this._reconnectTimer) LanSession.stopHost();
            if (!this._reconnectTimer) LanSession.active = false;
        }

        disconnect(restoreState = true) {
            NetworkManager_Server.updateUI("Disconnecting...", false);
            this._intentionalDisconnect = true;
            this.cancelReconnect();
            this.handleDisconnection(restoreState);
        }

        send(data) {
            if (this.isConnected()) {
                this.ws.send(JSON.stringify(data));
            } else if (this.isConnecting()) {
                // Socket is still opening; queue and flush on open instead of dropping.
                this._sendQueue.push(data);
            }
        }

        static updateUI(text, isError = false) {
            const scene = SceneManager._scene;
            if (scene && scene.updateStatus) scene.updateStatus(text, isError);
        }

        createPlayerInfo() {
            const leader = $gameParty.leader();
            const actor = $gameActors.actor(1);
            // A player riding something is drawn riding it, so the vehicle
            // graphic travels with the rest of the appearance.
            const riding = LanVehicles.ridingGraphic();
            return {
                name: actor.name(),
                characterName: riding ? riding.characterName : leader.characterName(),
                characterIndex: riding ? riding.characterIndex : leader.characterIndex(),
                faceName: leader.faceName(),
                faceIndex: leader.faceIndex(),
                mapId: $gameMap.mapId(),
                x: $gamePlayer.x,
                y: $gamePlayer.y,
                direction: $gamePlayer.direction(),
                vehicle: LanVehicles.ridingKey(),
                world: (window.WorldManager && window.WorldManager.activeWorldName) || ''
            };
        }

        handleServerMessage(data) {
            switch (data.type) {
                case 'login-success':
                    this._reconnectAttempts = 0;
                    this.myId = data.yourId;
                    this.players.set(this.myId, this.createPlayerInfo());
                    if (data.gameState) {
                        this.applyFullGameState(data.gameState.switches, data.gameState.variables, data.gameState.selfSwitches);
                    }
                    if (Array.isArray(data.players)) {
                        for (const player of data.players) {
                            if (player.id !== this.myId) this.players.set(player.id, player.info);
                        }
                    }
                    // The session is played in the host's world. A guest adopts
                    // it before anything else reads a world value; the host
                    // publishes its own instead.
                    if (data.world && !LanSession.hosting) LanWorld.apply(data.world);
                    LanSession.onLoggedIn();
                    this.offlineStateManager.clearState();
                    const scene = SceneManager._scene;
                    if (scene && scene.onConnectionSuccess) scene.onConnectionSuccess();
                    NetworkManager_Server.refreshPlayerListUI();
                    break;
                case 'player-joined':
                    this.players.set(data.playerId, data.playerInfo);
                    if (data.playerInfo) {
                        MultiplayerManager.instance.handlePlayerMapTransfer(data.playerId, data.playerInfo.mapId);
                    }
                    NetworkManager_Server.refreshPlayerListUI();
                    break;
                case 'player-left':
                    this.players.delete(data.playerId);
                    MultiplayerManager.instance.removeRemotePlayer(data.playerId);
                    NetworkManager_Server.refreshPlayerListUI();
                    break;
                case 'player-move':
                    if (data.from !== this.myId) this.updateRemotePlayer(data.from, data);
                    break;
                case 'player-meta':
                    if (data.from !== this.myId) this.updatePlayerInfo(data.from, data.info);
                    break;
                case 'map-transfer':
                    if (data.from !== this.myId) {
                        const playerInfo = this.players.get(data.from);
                        if (playerInfo) playerInfo.mapId = data.mapId;
                        MultiplayerManager.instance.handlePlayerMapTransfer(data.from, data.mapId);
                    }
                    break;
                // A world published after we were already logged in (the host
                // finished loading, or handed over a freshly generated world).
                case 'world-sync':
                    if (data.world && !LanSession.hosting) LanWorld.apply(data.world);
                    break;
                case 'relay':
                    if (data.from !== this.myId) LanSession.handleRelay(data);
                    break;
                case 'switch-change':
                    if (isSyncableSwitch(data.id)) $gameSwitches.setValue(data.id, data.value, true);
                    break;
                case 'variable-change':
                    if (isSyncableVariable(data.id)) {
                        // A clock only ever moves forward, whatever order the
                        // packets arrive in.
                        const backwards = isHostAuthoritativeVariable(data.id)
                            && Number(data.value) < Number($gameVariables.value(data.id) || 0);
                        if (!backwards) $gameVariables.setValue(data.id, data.value, true);
                    }
                    break;
                case 'self-switch-change':
                    $gameSelfSwitches.setValue([data.mapId, data.eventId, data.switchType], data.value, true);
                    if ($gameMap && $gameMap.mapId() === data.mapId) {
                        const changed = $gameMap.event(data.eventId);
                        if (changed) changed.refresh();
                    }
                    break;
                case 'player-state-change':
                    if (data.from !== this.myId) MultiplayerManager.instance.updateRemotePlayerState(data.from, data.state);
                    break;
                case 'party-invite-request':
                    PartyUIManager.instance.showInvitation(data.fromId, data.fromName);
                    break;
                case 'party-update':
                    this.party = data.party;
                    NetworkManager_Server.refreshPlayerListUI();
                    MultiplayerManager.instance.setupPlayerEvents();
                    if (SceneManager._scene && SceneManager._scene.refreshUIMultiplayer) SceneManager._scene.refreshUIMultiplayer();
                    break;
                case 'party-disband':
                    this.party = null;
                    NetworkManager_Server.refreshPlayerListUI();
                    MultiplayerManager.instance.setupPlayerEvents();
                    if (SceneManager._scene && SceneManager._scene.refreshUIMultiplayer) SceneManager._scene.refreshUIMultiplayer();
                    break;
                case 'force-teleport':
                    if (this.isInParty() && this.myId !== this.party.leaderId) {
                        $gamePlayer.reserveTransfer(data.mapId, data.x, data.y, data.direction, 2);
                    }
                    break;
                case 'server-full':
                    // Server refused the login: do not burn reconnect attempts on a full server.
                    this._intentionalDisconnect = true;
                    this.cancelReconnect();
                    NetworkManager_Server.updateUI(
                        T('Multiplayer.serverFull', { max: data.maxPlayers || '?' }), true);
                    break;
                case 'error':
                    NetworkManager_Server.updateUI(data.message || T('Multiplayer.serverError'), true);
                    break;
            }
        }

        applyFullGameState(switches, variables, selfSwitches) {
            for (const id in switches) if (isSyncableSwitch(id)) $gameSwitches.setValue(Number(id), switches[id], true);
            for (const id in variables) if (isSyncableVariable(id)) $gameVariables.setValue(Number(id), variables[id], true);
            // Which chests stand open, which doors are unlocked, which one-off
            // events have already been played: the session's whole event state.
            for (const key in (selfSwitches || {})) {
                const [mapId, eventId, switchType] = String(key).split(',');
                if (!mapId || !eventId || !switchType) continue;
                $gameSelfSwitches.setValue([Number(mapId), Number(eventId), switchType], selfSwitches[key], true);
            }
            if ($gameMap) $gameMap.requestRefresh();
        }

        updateRemotePlayer(playerId, data) { MultiplayerManager.instance.updateRemotePlayerPosition(playerId, data); }

        updatePlayerInfo(playerId, info) {
            this.players.set(playerId, info);
            MultiplayerManager.instance.updateRemotePlayerGraphic(playerId, info.characterName, info.characterIndex);
            NetworkManager_Server.refreshPlayerListUI();
        }

        onSwitchChange(switchId, value) {
            if (this.isMultiplayer() && isSyncableSwitch(switchId)) this.send({ type: 'switch-change', id: switchId, value: value });
        }

        onVariableChange(variableId, value) {
            if (!this.isMultiplayer() || !isSyncableVariable(variableId)) return;
            // Time is the host's to keep, so a guest's own ticking stays local
            // and is corrected by the host's next packet.
            if (LanSession.active && !LanSession.hosting && isHostAuthoritativeVariable(variableId)) return;
            this.send({ type: 'variable-change', id: variableId, value: value });
        }

        // A chest opened, a door unlocked, a conversation played out once: all of
        // that lives in self switches, and none of it used to travel outside a
        // Steam lobby. On a LAN the whole map state would otherwise disagree
        // between the two machines within a minute of play.
        onSelfSwitchChange(mapId, eventId, switchType, value) {
            if (!this.isMultiplayer()) return;
            const eventData = $dataMap && $dataMap.events && $dataMap.events[eventId];
            const eventName = eventData ? String(eventData.name || '') : '';
            if (/^Player\d+$/.test(eventName)) return;   // i18n-ignore: event name
            this.send({ type: 'self-switch-change', mapId: mapId, eventId: eventId, switchType: switchType, value: value });
        }

        sendPartyInvite(targetId) { this.send({ type: 'party-invite', targetId: targetId }); }
        sendPartyAccept(inviterId) { this.send({ type: 'party-accept', inviterId: inviterId }); }
        sendPartyLeave() { this.send({ type: 'party-leave' }); }

        updateLocalPlayerPosition() {
            if (!this.isMultiplayer() || !$gamePlayer) return;
            const player = $gamePlayer;
            const lastState = this.lastPlayerState;
            const vehicle = LanVehicles.ridingKey();
            const vehicleGraphic = LanVehicles.ridingGraphic();
            // On a <Platform> map (Map/PlatformerMode.js) the body is a physics
            // body: a jump arc cannot be spelled in whole tiles, so the packet
            // carries sub tile coordinates and changes whenever they do.
            const platform = platformerState(player);
            const hasChanged = (platform ? window.PlatformerMode.remoteStateChanged(lastState, platform) : false) ||
                lastState.x !== player.x || lastState.y !== player.y || lastState.direction !== player.direction() || lastState.pattern !== player.pattern() || lastState.vehicle !== vehicle;

            if (hasChanged) {
                const newState = { x: player.x, y: player.y, direction: player.direction(), pattern: player.pattern(), moveSpeed: player.realMoveSpeed(), vehicle: vehicle, vehicleName: vehicleGraphic ? vehicleGraphic.characterName : '', vehicleIndex: vehicleGraphic ? vehicleGraphic.characterIndex : 0, ...(platform || {}) };
                this.send({ type: 'player-move', ...newState });
                this.lastPlayerState = newState;
            }
        }

        onMapTransfer() {
            if (this.isMultiplayer()) {
                this.send({ type: 'map-transfer', mapId: $gameMap.mapId() });
                const myInfo = this.players.get(this.myId);
                if (myInfo) myInfo.mapId = $gameMap.mapId();
            }
        }
    }


    // ============================================================================
    // MODE: STEAMWORKS (P2P LOBBY ARCHITECTURE)
    // ============================================================================
    class NetworkManager_Steam {
        constructor() {
            this.myId = null;
            this.mySteamId = this.resolveMySteamId();
            this.roomId = null;
            this.isLeader = false;
            this.players = new Map();
            this.steamToInternalId = new Map();
            this.internalToSteamId = new Map();
            this.pendingTeleport = false;
            this.lastPlayerState = {};
            this.followLeader = true;
            this.offlineStateManager = new OfflineStateManager();
            this.leaderQueue = [];
            this.excludedSelfSwitches = new Set();
            this.lobby = null;
            this._callbacksBound = false;

            if (steamClient) this.setupSteamCallbacks();
        }

        static get instance() {
            if (!this._instance) this._instance = new NetworkManager_Steam();
            return this._instance;
        }

        resolveMySteamId() {
            if (!steamClient) return null;
            try {
                const lp = steamClient.localplayer;
                if (lp && typeof lp.getSteamId === 'function') return steamIdToString(lp.getSteamId());
                if (typeof steamClient.getSteamId === 'function') return steamIdToString(steamClient.getSteamId());
            } catch (e) { /* not available */ }
            return null;
        }

        setupSteamCallbacks() {
            if (this._callbacksBound || !steamClient || !steamClient.callback) return;
            this._callbacksBound = true;

            // Auto-accept incoming P2P sessions from lobby peers.
            registerSteamCallback('P2PSessionRequest', (data) => {
                const remote = data && (data.remote !== undefined ? data.remote : data.steamIdRemote);
                if (remote != null) p2pAccept(steamIdToString(remote));
            });

            // Track lobby membership so the host can assign/drop player slots.
            // steamworks.js payload keys are snake_case: { user_changed, member_state_change }.
            registerSteamCallback('LobbyChatUpdate', (update) => {
                if (!update) return;
                const changed = update.user_changed !== undefined ? update.user_changed
                    : (update.userChanged !== undefined ? update.userChanged : update.user);
                const changedId = steamIdToString(changed);
                if (!changedId || changedId === this.mySteamId) return;
                const stateChange = update.member_state_change !== undefined ? update.member_state_change : update.memberStateChange;
                if (steamMemberJoined(stateChange)) this.handlePlayerJoinedLobby(changedId);
                else if (steamMemberGone(stateChange)) this.handlePlayerLeftLobby(changedId);
            });

            // "Join Game" from the Steam friends list / chat. Because our rich-presence
            // "connect" value is "+connect_lobby <id>", Steam routes the join through
            // GameLobbyJoinRequested (payload key: lobby_steam_id) rather than the
            // custom-string GameRichPresenceJoinRequested callback.
            registerSteamCallback('GameLobbyJoinRequested', (data) => {
                const lobbyId = steamIdToString(data && (data.lobby_steam_id || data.lobbySteamId || data.steamIdLobby || data.lobby));
                if (lobbyId) SteamJoinRequest.handle(lobbyId);
            });
            // Custom (non-lobby) connect strings, if a future build exposes this callback.
            registerSteamCallback('GameRichPresenceJoinRequested', (data) => {
                const lobbyId = parseConnectLobby(data && data.connect);
                if (lobbyId) SteamJoinRequest.handle(lobbyId);
            });
        }

        static refreshPlayerListUI() {
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Map && scene._playerListWindow) scene._playerListWindow.refresh();
        }

        isConnected() { return !!this.roomId; }
        isMultiplayer() { return !!this.myId; }
        isInParty() { return false; }

        requestLeaderTeleport() {
            if (!this.isMultiplayer() || this.isLeader) return;
            const leaderId = this.getCurrentLeaderId();
            if (leaderId) this.sendTo(leaderId, { type: 'request-teleport' });
        }

        sendTeleportPosition(playerId) {
            if (!this.isLeader || !$gamePlayer) return;
            this.sendTo(playerId, { type: 'teleport-position', mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y, direction: $gamePlayer.direction() });
        }

        static updateUI(text, isError = false) {
            const scene = SceneManager._scene;
            if (scene && scene.updateStatus) scene.updateStatus(text, isError);
        }

        async initiateCreateRoom(followLeader = true) {
            if (!steamClient) return;
            try {
                this.offlineStateManager.saveCurrentState();
                this.isLeader = true;
                this.myId = 1;
                this.followLeader = followLeader;
                NetworkManager_Steam.updateUI(T('Multiplayer.creatingLobby'));
                this.lobby = await steamClient.matchmaking.createLobby(swEnum('LobbyType.FriendsOnly', 1), STEAM_MAX_PLAYERS);
                this.roomId = this.lobby.id.toString();
                if (typeof this.lobby.setJoinable === 'function') this.lobby.setJoinable(true);
                setSteamConnect(this.roomId); // enables "Join Game" in Steam chat / friends list

                this.players.set(this.myId, this.createPlayerInfo());
                this.steamToInternalId.set(this.mySteamId, this.myId);
                this.internalToSteamId.set(this.myId, this.mySteamId);
                this.leaderQueue = [this.myId];

                if (SceneManager._scene && SceneManager._scene.onRoomSetupSuccess) SceneManager._scene.onRoomSetupSuccess(true);
            } catch (e) {
                NetworkManager_Steam.updateUI(T('Multiplayer.createLobbyFailed'), true);
                this.offlineStateManager.clearState();
            }
        }

        async initiateJoinRoom(roomId, followLeader = true) {
            if (!steamClient) return;
            try {
                this.offlineStateManager.saveCurrentState();
                this.isLeader = false;
                this.followLeader = followLeader;
                NetworkManager_Steam.updateUI(T('Multiplayer.joiningLobby', { id: roomId }));
                this.lobby = await steamClient.matchmaking.joinLobby(toBig(roomId));
                this.roomId = this.lobby.id.toString();
                setSteamConnect(this.roomId); // let our own friends "Join Game" onward

                const owner = typeof this.lobby.getOwner === 'function'
                    ? this.lobby.getOwner()
                    : (steamClient.matchmaking.getLobbyOwner ? steamClient.matchmaking.getLobbyOwner(this.lobby.id) : null);
                const ownerId = steamIdToString(owner);
                if (!ownerId) throw new Error('Could not resolve lobby owner');
                p2pAccept(ownerId);
                this.sendToSteamId(ownerId, { type: 'join-request', steamId: this.mySteamId, playerInfo: this.createPlayerInfo() });
            } catch (e) {
                NetworkManager_Steam.updateUI(T('Multiplayer.joinLobbyFailed', { id: roomId }), true);
                this.offlineStateManager.clearState();
            }
        }

        handlePlayerJoinedLobby(steamId) {
            if (this.isLeader) {
                let assignedId = 2;
                while (this.internalToSteamId.has(assignedId) && assignedId <= STEAM_MAX_PLAYERS) assignedId++;
                if (assignedId <= STEAM_MAX_PLAYERS) {
                    this.steamToInternalId.set(steamId, assignedId);
                    this.internalToSteamId.set(assignedId, steamId);
                }
            }
        }

        handlePlayerLeftLobby(steamId) {
            const internalId = this.steamToInternalId.get(steamId);
            if (internalId) this.handlePlayerDisconnect(internalId);
        }

        pollPackets() {
            if (!steamClient || !steamClient.networking || !this.roomId) return;
            const net = steamClient.networking;
            while (true) {
                const avail = net.isP2PPacketAvailable();
                if (!avail) break;
                const size = (typeof avail === 'number' && avail > 0) ? avail : 4096;
                const packet = net.readP2PPacket(size);
                if (!packet || !packet.data) break;
                try {
                    const data = JSON.parse(packet.data.toString('utf8'));
                    const senderSteamId = steamIdToString(packet.steamId !== undefined ? packet.steamId : packet.remote);
                    if (!senderSteamId) continue;
                    if (data.type === 'join-request' && this.isLeader) {
                        this.handleJoinRequest(senderSteamId, data.playerInfo);
                    } else if (data.type === 'room-joined') {
                        this.handleRoomJoined(data);
                    } else {
                        const fromId = this.steamToInternalId.get(senderSteamId);
                        if (fromId) this.handleGameMessage(fromId, data);
                    }
                } catch (e) { }
            }
        }

        handleJoinRequest(steamId, playerInfo) {
            const internalId = this.steamToInternalId.get(steamId);
            if (!internalId) return;

            this.players.set(internalId, playerInfo);
            this.leaderQueue.push(internalId);

            const otherPlayers = [];
            for (const [id, info] of this.players.entries()) {
                if (id !== internalId) otherPlayers.push({ id, steamId: this.internalToSteamId.get(id), info });
            }

            this.sendToSteamId(steamId, { type: 'room-joined', yourId: internalId, leaderId: this.myId, otherPlayers: otherPlayers });
            this.broadcast({ type: 'player-joined', playerId: internalId, steamId: steamId, playerInfo: playerInfo }, internalId);
            this.sendFullGameState(internalId);
            this.sendLeaderPosition(internalId);
            NetworkManager_Steam.refreshPlayerListUI();
        }

        handleRoomJoined(data) {
            this.myId = data.yourId;
            this.steamToInternalId.set(this.mySteamId, this.myId);
            this.internalToSteamId.set(this.myId, this.mySteamId);
            this.players.set(this.myId, this.createPlayerInfo());

            this.leaderQueue = [data.leaderId];
            for (const p of data.otherPlayers) {
                this.players.set(p.id, p.info);
                this.steamToInternalId.set(p.steamId, p.id);
                this.internalToSteamId.set(p.id, p.steamId);
                if (p.id !== data.leaderId) this.leaderQueue.push(p.id);
                p2pAccept(p.steamId);
            }
            this.leaderQueue.push(this.myId);
            NetworkManager_Steam.refreshPlayerListUI();
            // Mark the session live even when the join was driven by a Steam "Join Game"
            // request rather than the multiplayer menu (no onRoomSetupSuccess scene then).
            $gameSwitches.setValue(66, true, true);
            if (SceneManager._scene && SceneManager._scene.onRoomSetupSuccess) SceneManager._scene.onRoomSetupSuccess(false);
        }

        getCurrentLeaderId() { return this.leaderQueue.length > 0 ? this.leaderQueue[0] : null; }

        handlePlayerDisconnect(playerId) {
            const steamId = this.internalToSteamId.get(playerId);
            this.steamToInternalId.delete(steamId);
            this.internalToSteamId.delete(playerId);
            this.players.delete(playerId);

            const leaderIndex = this.leaderQueue.indexOf(playerId);
            if (leaderIndex !== -1) this.leaderQueue.splice(leaderIndex, 1);

            MultiplayerManager.instance.removeRemotePlayer(playerId);
            NetworkManager_Steam.refreshPlayerListUI();

            if (playerId === this.getCurrentLeaderId() && this.leaderQueue.length > 0) this.handleLeaderHandoff();
            if (this.players.size === 1 && this.players.has(this.myId)) this.handleLastPlayer();
        }

        handleLeaderHandoff() {
            const newLeaderId = this.getCurrentLeaderId();
            if (newLeaderId === this.myId) {
                this.isLeader = true;
                this.broadcast({ type: 'leader-change', newLeaderId: this.myId });
                for (const playerId of this.players.keys()) if (playerId !== this.myId) this.sendFullGameState(playerId);
            }
        }

        handleLastPlayer() {
            this.offlineStateManager.restoreState(false);
            MultiplayerManager.instance.clearRemotePlayers();
        }

        cleanup() {
            if (this.lobby && steamClient) {
                try {
                    if (typeof this.lobby.leave === 'function') this.lobby.leave();
                    else if (steamClient.matchmaking && steamClient.matchmaking.leaveLobby) steamClient.matchmaking.leaveLobby(toBig(this.roomId));
                } catch (e) { /* already gone */ }
            }
            clearSteamConnect(); // removes "Join Game" from our friends' view
            this.players.clear();
            this.steamToInternalId.clear();
            this.internalToSteamId.clear();
            this.leaderQueue = [];
            MultiplayerManager.instance.clearRemotePlayers();
            NetworkManager_Steam.refreshPlayerListUI();
            this.myId = null;
            this.roomId = null;
            this.lobby = null;
            this.isLeader = false;
            this.pendingTeleport = false;
            this.lastPlayerState = {};
            this.offlineStateManager.clearState();
            $gameSwitches.setValue(66, false);
        }

        disconnect(restoreState = true) {
            if (restoreState && this.myId) this.offlineStateManager.restoreState(true);
            this.cleanup();
        }

        broadcast(data, excludeInternalId = null) {
            if (!this.isMultiplayer() || !steamClient) return;
            const buffer = Buffer.from(JSON.stringify(data), 'utf8');
            for (const [internalId, steamId] of this.internalToSteamId.entries()) {
                if (internalId !== this.myId && internalId !== excludeInternalId) p2pSend(steamId, buffer);
            }
        }

        sendTo(internalId, data) {
            if (!this.isMultiplayer() || !steamClient) return;
            const steamId = this.internalToSteamId.get(internalId);
            if (steamId) p2pSend(steamId, Buffer.from(JSON.stringify(data), 'utf8'));
        }

        sendToSteamId(steamId, data) {
            if (!steamClient) return;
            p2pSend(steamId, Buffer.from(JSON.stringify(data), 'utf8'));
        }

        handleGameMessage(fromId, data) {
            data.from = fromId;
            this.processGameMessage(data);
            if (this.isLeader && data.type !== 'join-request') this.broadcast(data, fromId);
        }

        handleTeleportPosition(data) {
            if (this.isLeader) return;
            if ($gameMap.mapId() !== data.mapId) {
                this.pendingTeleport = true;
                $gamePlayer.reserveTransfer(data.mapId, data.x, data.y, data.direction, 0);
                $gamePlayer.requestMapReload();
            } else {
                $gamePlayer.locate(data.x, data.y);
                $gamePlayer.setDirection(data.direction);
            }
        }

        processGameMessage(data) {
            switch (data.type) {
                case 'full-state': this.applyFullGameState(data.switches, data.variables); break;
                case 'leader-change': this.handleLeaderChange(data.newLeaderId); break;
                case 'dungeon-data':
                    $gameSystem._dungeonFloors = JSON.parse(JSON.stringify(data.dungeonFloors));
                    $gameSystem._stairLocations = JSON.parse(JSON.stringify(data.stairLocations));
                    $gameSystem._dungeonGenerated = data.dungeonGenerated;
                    $gameSystem._mapRegion13Cache = JSON.parse(JSON.stringify(data.mapRegion13Cache || {}));
                    break;
                case 'leader-position': this.handleLeaderPosition(data); break;
                case 'request-teleport': if (this.isLeader) this.sendTeleportPosition(data.from); break;
                case 'teleport-position': this.handleTeleportPosition(data); break;
                case 'switch-change': $gameSwitches.setValue(data.id, data.value, true); break;
                case 'variable-change': $gameVariables.setValue(data.id, data.value, true); break;
                case 'self-switch-change':
                    if ($gameMap.mapId() === data.mapId) {
                        $gameSelfSwitches.setValue([data.mapId, data.eventId, data.switchType], data.value, true);
                        const event = $gameMap.event(data.eventId);
                        if (event) event.refresh();
                    }
                    break;
                case 'player-move': this.updateRemotePlayer(data.from, data); break;
                case 'player-meta': this.updatePlayerInfo(data.from, data.info); break;
                case 'player-joined':
                    this.players.set(data.playerId, data.playerInfo);
                    this.steamToInternalId.set(data.steamId, data.playerId);
                    this.internalToSteamId.set(data.playerId, data.steamId);
                    this.leaderQueue.push(data.playerId);
                    NetworkManager_Steam.refreshPlayerListUI();
                    break;
                case 'full-self-switches':
                    for (const keyString in data.selfSwitches) {
                        const keyParts = keyString.split(',');
                        $gameSelfSwitches.setValue([parseInt(keyParts[0], 10), parseInt(keyParts[1], 10), keyParts[2]], data.selfSwitches[keyString], true);
                    }
                    break;
                case 'player-state-change': MultiplayerManager.instance.updateRemotePlayerState(data.from, data.state); break;
                case 'map-transfer':
                    const playerInfo = this.players.get(data.from);
                    if (playerInfo) playerInfo.mapId = data.mapId;
                    MultiplayerManager.instance.handlePlayerMapTransfer(data.from, data.mapId);
                    break;
            }
        }

        handleLeaderChange(newLeaderId) {
            const leaderIndex = this.leaderQueue.indexOf(newLeaderId);
            if (leaderIndex !== -1) {
                this.leaderQueue.splice(leaderIndex, 1);
                this.leaderQueue.unshift(newLeaderId);
            }
            if (newLeaderId === this.myId) this.isLeader = true;
        }

        sendLeaderPosition(playerId) {
            if (!this.isLeader || !$gamePlayer) return;
            this.sendTo(playerId, { type: 'leader-position', mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y });
        }

        handleLeaderPosition(data) {
            if (this.isLeader || !this.followLeader) return;
            if ($gameMap.mapId() !== data.mapId) {
                this.pendingTeleport = true;
                $gamePlayer.reserveTransfer(data.mapId, data.x, data.y, 2, 0);
                $gamePlayer.requestMapReload();
            }
        }

        steamName() {
            const lp = steamClient && steamClient.localplayer;
            if (lp && typeof lp.getName === 'function') return lp.getName();
            if (steamClient && typeof steamClient.getName === 'function') return steamClient.getName();
            return null;
        }

        createPlayerInfo() {
            const leader = $gameParty.leader();
            const actor = $gameActors.actor(1);
            return {
                name: this.steamName() || actor.name(),
                className: actor.currentClass().name,
                characterName: leader.characterName(),
                characterIndex: leader.characterIndex(),
                faceName: leader.faceName(),
                faceIndex: leader.faceIndex(),
                mapId: $gameMap.mapId()
            };
        }

        updatePlayerInfo(playerId, info) {
            this.players.set(playerId, info);
            MultiplayerManager.instance.updateRemotePlayerGraphic(playerId, info.characterName, info.characterIndex);
            NetworkManager_Steam.refreshPlayerListUI();
        }

        onSwitchChange(switchId, value) {
            if (this.isMultiplayer() && !ExcludedSwitches.includes(switchId)) this.broadcast({ type: 'switch-change', id: switchId, value: value });
        }

        shouldSyncSelfSwitch(mapId, eventId, switchType) {
            const eventName = $dataMap && $dataMap.events && $dataMap.events[eventId] ? $dataMap.events[eventId].name : '';
            if (eventName.match(/^Player\d+$/)) return false;
            return !this.excludedSelfSwitches.has(`${mapId}_${eventId}`);
        }

        onVariableChange(variableId, value) {
            if (this.isMultiplayer() && !ExcludedVariables.includes(variableId)) this.broadcast({ type: 'variable-change', id: variableId, value: value });
        }

        onSelfSwitchChange(mapId, eventId, switchType, value) {
            if (this.isMultiplayer() && this.shouldSyncSelfSwitch(mapId, eventId, switchType)) {
                this.broadcast({ type: 'self-switch-change', mapId: mapId, eventId: eventId, switchType: switchType, value: value });
            }
        }

        sendFullGameState(targetPlayerId) {
            if (!this.isLeader) return;
            const switches = {};
            const variables = {};
            const selfSwitches = {};
            for (let i = 1; i < $dataSystem.switches.length; i++) if (!ExcludedSwitches.includes(i)) switches[i] = $gameSwitches.value(i);
            for (let i = 1; i < $dataSystem.variables.length; i++) if (!ExcludedVariables.includes(i)) variables[i] = $gameVariables.value(i);
            for (const key in $gameSelfSwitches._data) {
                const [mapId, eventId, switchType] = key.split(',').map((v, i) => i < 2 ? parseInt(v) : v);
                if (this.shouldSyncSelfSwitch(mapId, eventId, switchType)) selfSwitches[key] = $gameSelfSwitches._data[key];
            }
            this.sendTo(targetPlayerId, { type: 'full-state', switches, variables });
            this.sendTo(targetPlayerId, { type: 'full-self-switches', selfSwitches: selfSwitches });

            if ($gameSystem._dungeonFloors && $gameSystem._stairLocations && $gameSystem._dungeonGenerated) {
                this.sendTo(targetPlayerId, { type: 'dungeon-data', dungeonFloors: JSON.parse(JSON.stringify($gameSystem._dungeonFloors)), stairLocations: JSON.parse(JSON.stringify($gameSystem._stairLocations)), dungeonGenerated: $gameSystem._dungeonGenerated, mapRegion13Cache: JSON.parse(JSON.stringify($gameSystem._mapRegion13Cache || {})) });
            }

            for (const [id, player] of this.players.entries()) if (id !== targetPlayerId) this.sendTo(targetPlayerId, { type: 'player-meta', from: id, info: player });
        }

        applyFullGameState(switches, variables) {
            for (const id in switches) $gameSwitches.setValue(Number(id), switches[id], true);
            for (const id in variables) $gameVariables.setValue(Number(id), variables[id], true);
        }

        updateLocalPlayerPosition() {
            if (!this.isMultiplayer() || !$gamePlayer) return;
            const player = $gamePlayer;
            const lastState = this.lastPlayerState;
            const platform = platformerState(player);
            const hasChanged = (platform ? window.PlatformerMode.remoteStateChanged(lastState, platform) : false) ||
                lastState.x !== player.x || lastState.y !== player.y || lastState.direction !== player.direction() || lastState.pattern !== player.pattern() || lastState.opacity !== player.opacity();

            if (hasChanged) {
                const newState = { x: player.x, y: player.y, direction: player.direction(), pattern: player.pattern(), moveSpeed: player.realMoveSpeed(), opacity: player.opacity(), blendMode: player.blendMode(), ...(platform || {}) };
                const message = { type: 'player-move', ...newState };
                const myMapId = $gameMap.mapId();
                for (const [playerId, playerInfo] of this.players.entries()) {
                    if (playerId === this.myId) continue;
                    if (playerInfo.mapId === myMapId) this.sendTo(playerId, message);
                }
                this.lastPlayerState = newState;
            }
        }

        updateRemotePlayer(playerId, data) { MultiplayerManager.instance.updateRemotePlayerPosition(playerId, data); }

        onMapTransfer() {
            if (this.isMultiplayer()) {
                this.broadcast({ type: 'map-transfer', mapId: $gameMap.mapId() });
                const myInfo = this.players.get(this.myId);
                if (myInfo) myInfo.mapId = $gameMap.mapId();
                if (this.isLeader) setTimeout(() => { for (const playerId of this.players.keys()) if (playerId !== this.myId) this.sendLeaderPosition(playerId); }, 100);
            }
        }
    }


    let NetworkManager = NetworkMode === 'Steamworks' ? NetworkManager_Steam : NetworkManager_Server;
    window.NetworkManager = NetworkManager;

    // ============================================================================
    // MODE: LAN (same network, found by scanning)
    // ============================================================================
    // The easiest connection there is: one player hosts, everyone else presses
    // SCAN and picks the host out of a list. No address is ever typed.
    //
    // A LAN session is the WebSocket session (NetworkManager_Server, the same
    // protocol server.js has always spoken), with two things added: the host
    // runs server.js IN-PROCESS instead of asking anyone to start a second
    // program, and the host answers UDP discovery probes so guests can find it.
    // NetworkMode therefore stays 'WebSocket' throughout: every existing code
    // path (party pockets, remote player events, state sync) is unchanged, and
    // LanSession.active is the one answer to "is this a LAN game".
    const LAN_DEFAULT_PORT = 8080;
    const LAN_DISCOVERY_PORT = 41235;
    const LAN_DISCOVERY_MAGIC = 'HYPERNET_LAN_DISCOVER';   // i18n-ignore: wire protocol
    const LAN_DISCOVERY_REPLY = 'HYPERNET_LAN_HOST';       // i18n-ignore: wire protocol
    const LAN_SCAN_TIMEOUT = 1500;
    const LAN_SWEEP_TIMEOUT = 400;
    const LAN_SWEEP_CONCURRENCY = 32;

    // Node is only there under NW.js. In a browser build LAN mode reports
    // itself unavailable rather than throwing on the first click.
    const nodeRequire = (() => {
        try {
            return (typeof require === 'function' && Utils.isNwjs()) ? require : null;
        } catch (e) {
            return null;
        }
    })();

    function nodeModule(name) {
        if (!nodeRequire) return null;
        try {
            return nodeRequire(name);
        } catch (e) {
            return null;
        }
    }

    // The game's own folder, resolved the same way WorldManager resolves it.
    function gameRootDir() {
        const path = nodeModule('path');
        if (!path || !process.mainModule) return '';
        return path.dirname(process.mainModule.filename);
    }

    // server.js, required from the game folder. One protocol implementation,
    // whether it runs as a service or inside the game.
    function lanServerModule() {
        const path = nodeModule('path');
        if (!path) return null;
        try {
            return nodeRequire(path.join(gameRootDir(), 'server.js'));
        } catch (e) {
            console.error('[LAN] server.js could not be loaded:', e && e.message);
            return null;
        }
    }

    // Every IPv4 address this machine holds on a real network, with the
    // broadcast address of each, so a probe reaches every subnet the player is
    // attached to (wired and wireless at once, for instance).
    function lanInterfaces() {
        const os = nodeModule('os');
        if (!os) return [];
        const out = [];
        const nets = os.networkInterfaces() || {};
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                const family = typeof net.family === 'string' ? net.family : `IPv${net.family}`;
                if (family !== 'IPv4' || net.internal) continue;
                out.push({ name, address: net.address, netmask: net.netmask, broadcast: lanBroadcastAddress(net.address, net.netmask) });
            }
        }
        return out;
    }

    function lanBroadcastAddress(address, netmask) {
        const a = String(address || '').split('.').map(Number);
        const m = String(netmask || '').split('.').map(Number);
        if (a.length !== 4 || m.length !== 4 || a.some(isNaN) || m.some(isNaN)) return '255.255.255.255';
        return a.map((part, i) => (part & m[i]) | (~m[i] & 255)).join('.');
    }

    // Discovery, in two passes. The UDP broadcast answers in milliseconds and
    // is what normally finds the host. Some home routers and Windows profiles
    // drop broadcasts between wireless clients, so when it finds nothing the
    // scan falls back to knocking on the game port of every address in the
    // local /24: slower, but it works on a network that forbids broadcast.
    const LanDiscovery = {
        _scanning: false,

        isAvailable() {
            return !!nodeModule('dgram') && !!nodeModule('net');
        },

        // onHost is called as each host answers, so the list fills in live.
        scan(onHost, options = {}) {
            if (!this.isAvailable()) return Promise.resolve([]);
            const found = new Map();
            const report = (host) => {
                const key = host.address + ':' + host.port;
                if (found.has(key)) return;
                found.set(key, host);
                if (onHost) onHost(host, Array.from(found.values()));
            };
            this._scanning = true;
            return this._probeBroadcast(report, options)
                .then(() => (found.size > 0 || options.sweep === false)
                    ? null
                    : this._sweepSubnets(report))
                .then(() => {
                    this._scanning = false;
                    return Array.from(found.values());
                })
                .catch((e) => {
                    this._scanning = false;
                    console.error('[LAN] scan failed:', e && e.message);
                    return Array.from(found.values());
                });
        },

        _probeBroadcast(report, options) {
            const dgram = nodeModule('dgram');
            return new Promise((resolve) => {
                let socket;
                try {
                    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
                } catch (e) {
                    resolve();
                    return;
                }
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    try { socket.close(); } catch (e) { /* already closed */ }
                    resolve();
                };
                socket.on('error', finish);
                socket.on('message', (msg, rinfo) => {
                    let reply;
                    try {
                        reply = JSON.parse(String(msg));
                    } catch (e) {
                        return;
                    }
                    if (!reply || reply.magic !== LAN_DISCOVERY_REPLY) return;
                    report({
                        address: rinfo.address,
                        port: reply.port || LAN_DEFAULT_PORT,
                        hostName: reply.hostName || '',
                        world: reply.world || '',
                        players: reply.players || 0,
                        maxPlayers: reply.maxPlayers || 0,
                        via: 'broadcast'   // i18n-ignore: diagnostic
                    });
                });
                socket.bind(() => {
                    try { socket.setBroadcast(true); } catch (e) { /* not permitted */ }
                    const probe = Buffer.from(LAN_DISCOVERY_MAGIC);
                    const targets = ['255.255.255.255', '127.0.0.1'];
                    for (const iface of lanInterfaces()) {
                        if (targets.indexOf(iface.broadcast) === -1) targets.push(iface.broadcast);
                    }
                    for (const target of targets) {
                        try { socket.send(probe, 0, probe.length, LAN_DISCOVERY_PORT, target); } catch (e) { /* unreachable subnet */ }
                    }
                    setTimeout(finish, options.timeout || LAN_SCAN_TIMEOUT);
                });
            });
        },

        // Knock on the game port of every host in each local /24. Only /24 (or
        // narrower) subnets are swept: anything wider is too many addresses to
        // walk through while a player waits.
        _sweepSubnets(report) {
            const net = nodeModule('net');
            if (!net) return Promise.resolve();
            const addresses = [];
            for (const iface of lanInterfaces()) {
                const mask = String(iface.netmask || '').split('.').map(Number);
                if (mask[0] !== 255 || mask[1] !== 255 || mask[2] !== 255) continue;
                const parts = iface.address.split('.').map(Number);
                for (let host = 1; host < 255; host++) {
                    const address = `${parts[0]}.${parts[1]}.${parts[2]}.${host}`;
                    if (address !== iface.address && addresses.indexOf(address) === -1) addresses.push(address);
                }
            }
            if (addresses.length === 0) return Promise.resolve();

            let next = 0;
            const knock = (address) => new Promise((resolve) => {
                const socket = new net.Socket();
                let settled = false;
                const end = (open) => {
                    if (settled) return;
                    settled = true;
                    try { socket.destroy(); } catch (e) { /* already gone */ }
                    if (open) {
                        report({
                            address, port: LAN_DEFAULT_PORT, hostName: '', world: '',
                            players: 0, maxPlayers: 0, via: 'sweep'   // i18n-ignore: diagnostic
                        });
                    }
                    resolve();
                };
                socket.setTimeout(LAN_SWEEP_TIMEOUT);
                socket.once('connect', () => end(true));
                socket.once('timeout', () => end(false));
                socket.once('error', () => end(false));
                try { socket.connect(LAN_DEFAULT_PORT, address); } catch (e) { end(false); }
            });

            const worker = () => {
                if (next >= addresses.length) return Promise.resolve();
                return knock(addresses[next++]).then(worker);
            };
            const workers = [];
            for (let i = 0; i < LAN_SWEEP_CONCURRENCY; i++) workers.push(worker());
            return Promise.all(workers);
        }
    };

    // ----------------------------------------------------------------------------
    // The host's world, handed to every guest
    // ----------------------------------------------------------------------------
    // A session is played in the HOST's world: the same seed, the same history,
    // the same NPCs, the same shops and the same public switches and variables.
    // The host packs its world folder up at login; every guest writes it into a
    // world folder of the same name, makes it active and applies its public
    // state. A guest that already has a world by that name keeps its saves: only
    // the world's shared data files are overwritten.
    const LanWorld = {
        build() {
            const WM = window.WorldManager;
            if (!WM || !WM.activeWorldName) return null;
            // Flush what the running game knows into the cache first, or the
            // guests would be handed the state as it was when the world loaded.
            try { WM.exportPublicState(); } catch (e) { /* nothing to export yet */ }
            const files = {};
            for (const key of WM.dataFileKeys()) {
                try {
                    const data = WM.getFile(key);
                    if (data && Object.keys(data).length > 0) files[key] = JsonEx.stringify(data);
                } catch (e) {
                    console.error(`[LAN] could not pack world file '${key}'`, e);
                }
            }
            return {
                name: WM.activeWorldName,
                seed: WM.getField('world', 'seed'),
                files: files
            };
        },

        apply(payload) {
            const WM = window.WorldManager;
            if (!WM || !payload || !payload.name) return false;
            const name = payload.name;
            try {
                if (!WM.worldExists(name)) WM.createWorld(name, { seed: payload.seed });
                for (const key of Object.keys(payload.files || {})) {
                    let data;
                    try {
                        data = JsonEx.parse(payload.files[key]);
                    } catch (e) {
                        continue;
                    }
                    WM.writeWorldFile(name, key, data);
                }
                if (WM.activeWorldName !== name) WM.setActiveWorld(name);
                WM.applyPublicState();
                return true;
            } catch (e) {
                console.error('[LAN] could not adopt the host world:', e);
                return false;
            }
        }
    };

    // ----------------------------------------------------------------------------
    // Vehicles
    // ----------------------------------------------------------------------------
    // Two things travel. Where every vehicle is parked and how much fuel it
    // holds (window.VehiclePosition's store, the one answer to "where is the
    // camper") is mirrored to everyone, so a car one player leaves at a
    // crossroads is standing at that crossroads for the other. And whoever is
    // riding says so in their movement packets, so a remote player crossing the
    // sea is drawn on their boat and not walking on the water.
    const LanVehicles = {
        _signature: '',
        _timer: 0,

        // The maintenance key of the vehicle the local player is riding
        // ('camper', 'car', ...), or '' on foot. VehicleSystem owns that answer.
        ridingKey() {
            if (typeof $gamePlayer === 'undefined' || !$gamePlayer || !$gamePlayer.isInVehicle()) return '';
            const MVS = window.MergedVehicleSystem;
            if (MVS && MVS.riddenVehicleKey) {
                const key = MVS.riddenVehicleKey();
                if (key) return key;
            }
            // An engine vehicle nobody re-skinned (the plain boat / ship /
            // airship) still has its own type to travel under.
            const vehicle = $gamePlayer.vehicle();
            return (vehicle && vehicle._type) || '';
        },

        // How a riding player is drawn on the other machines. The sprite itself
        // travels: the receiving machine's own vehicles may be re-skinned
        // differently, and it should draw what the rider is actually in.
        ridingGraphic() {
            if (typeof $gamePlayer === 'undefined' || !$gamePlayer || !$gamePlayer.isInVehicle()) return null;
            const vehicle = $gamePlayer.vehicle();
            if (!vehicle || !vehicle.characterName()) return null;
            return { characterName: vehicle.characterName(), characterIndex: vehicle.characterIndex() };
        },

        // Broadcast the park/fuel store whenever it actually changed. Checked a
        // couple of times a second: parking is rare, and a diff of two small
        // objects costs nothing next to a packet per frame.
        update() {
            if (!LanSession.active || !NetworkManager.instance.isMultiplayer()) return;
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
            if (++this._timer < 30) return;
            this._timer = 0;
            const state = {
                positions: $gameSystem._vehiclePositionData || {},
                fuel: $gameSystem._vehicleFuelData || {}
            };
            let signature;
            try {
                signature = JSON.stringify(state);
            } catch (e) {
                return;
            }
            if (signature === this._signature) return;
            this._signature = signature;
            LanSession.relay('vehicle-state', { state: state });
        },

        apply(state) {
            if (!state || typeof $gameSystem === 'undefined' || !$gameSystem) return;
            if (state.positions) {
                $gameSystem._vehiclePositionData = Object.assign($gameSystem._vehiclePositionData || {}, state.positions);
            }
            if (state.fuel) {
                $gameSystem._vehicleFuelData = Object.assign($gameSystem._vehicleFuelData || {}, state.fuel);
            }
            // Take the moved vehicles off the tiles they no longer stand on and
            // put them where the store now says they are.
            const manager = window.MergedVehicleSystem && window.MergedVehicleSystem.manager;
            if (manager && manager.reconcileToStore && SceneManager._scene instanceof Scene_Map) {
                try { manager.reconcileToStore(); } catch (e) { /* mid-transfer */ }
            }
            // Remember what we just applied, so mirroring it back is not read
            // as a local change and bounced around the session forever.
            try {
                this._signature = JSON.stringify({
                    positions: $gameSystem._vehiclePositionData || {},
                    fuel: $gameSystem._vehicleFuelData || {}
                });
            } catch (e) { /* leave the old signature */ }
        }
    };


    // ----------------------------------------------------------------------------
    // The shared map: NPCs, enemies and what is left of them
    // ----------------------------------------------------------------------------
    // Two players standing on the same map must see the same map. Every machine
    // runs the same world (same seed, same generated layout, same event ids), so
    // what has to travel is not the map but what has happened on it since:
    // where each NPC has walked to, which enemy is standing where and which
    // troop it is, how hurt it is, and whether it is still there at all.
    //
    // One machine drives a shared map: the lowest player id standing on it,
    // which is the host whenever the host is present. That machine walks the
    // NPCs and the monsters and reports; the others stop their own simulation of
    // that map and place what they are told. A player alone on a map drives it
    // themselves, so exploring apart costs nothing.
    //
    // Enemy HP is the exception: whoever is fighting reports it, owner or not,
    // because the fight is theirs.
    const MapSync = {
        SEND_INTERVAL: 12,          // frames between snapshots (5 a second)
        MAX_EVENTS_PER_PACKET: 60,
        _timer: 0,
        _mapId: 0,
        _sent: new Map(),           // eventId -> the signature last sent
        _hpSignature: '',

        // The player driving this map, or null when nobody is on it.
        ownerId() {
            const nm = NetworkManager.instance;
            if (!nm.isMultiplayer()) return null;
            const here = $gameMap.mapId();
            let owner = null;
            for (const [id, info] of nm.players.entries()) {
                if (!info || info.mapId !== here) continue;
                if (owner === null || id < owner) owner = id;
            }
            return owner;
        },

        // Everybody else on this map right now.
        othersHere() {
            const nm = NetworkManager.instance;
            if (!nm.isMultiplayer()) return 0;
            const here = $gameMap.mapId();
            let count = 0;
            for (const [id, info] of nm.players.entries()) {
                if (id !== nm.myId && info && info.mapId === here) count++;
            }
            return count;
        },

        // True when this machine is the one simulating the map it is standing
        // on. Alone, or outside a session, that is always us.
        ownsMap() {
            const nm = NetworkManager.instance;
            if (!LanSession.active || !nm.isMultiplayer()) return true;
            if (typeof $gameMap === 'undefined' || !$gameMap) return true;
            const owner = this.ownerId();
            return owner === null || owner === nm.myId;
        },

        onMapChanged() {
            this._mapId = (typeof $gameMap !== 'undefined' && $gameMap) ? $gameMap.mapId() : 0;
            this._sent.clear();
            this._hpSignature = '';
        },

        update() {
            if (!LanSession.active || !NetworkManager.instance.isMultiplayer()) return;
            if (typeof $gameMap === 'undefined' || !$gameMap) return;
            if ($gameMap.mapId() !== this._mapId) this.onMapChanged();
            if (++this._timer < this.SEND_INTERVAL) return;
            this._timer = 0;
            if (this.othersHere() === 0) return;   // nobody to tell
            this.sendEnemyHp();
            if (this.ownsMap()) this.sendEvents();
        },

        // --- what the driver reports ---------------------------------------
        sendEvents() {
            const changed = [];
            for (const event of $gameMap.events()) {
                if (!event || window.MultiplayerRemote.isRemoteEvent(event)) continue;
                const troop = event._fixedTroopId || 0;
                const signature = `${event.x},${event.y},${event.direction()},${troop},${event._erased ? 1 : 0}`;
                if (this._sent.get(event.eventId()) === signature) continue;
                this._sent.set(event.eventId(), signature);
                changed.push({
                    i: event.eventId(), x: event.x, y: event.y,
                    d: event.direction(), t: troop, e: event._erased ? 1 : 0
                });
                if (changed.length >= this.MAX_EVENTS_PER_PACKET) break;
            }
            if (changed.length > 0) {
                LanSession.relay('map-events', { mapId: $gameMap.mapId(), events: changed });
            }
        },

        applyEvents(data) {
            if (typeof $gameMap === 'undefined' || !$gameMap) return;
            if (!data || data.mapId !== $gameMap.mapId()) return;
            // We drive this map ourselves: an older driver's packet crossing
            // with the handover must not drag our NPCs backwards.
            if (this.ownsMap()) return;
            for (const entry of data.events || []) {
                const event = $gameMap.event(entry.i);
                if (!event) continue;
                if (entry.e) {
                    if (!event._erased) event.erase();
                    continue;
                }
                if (entry.t && event._fixedTroopId !== entry.t) {
                    event._fixedTroopId = entry.t;
                    if (event.updateCharacterSprite) event.updateCharacterSprite();
                    event.setOpacity(255);
                }
                const dx = $gameMap.deltaX(entry.x, event.x);
                const dy = $gameMap.deltaY(entry.y, event.y);
                // One tile away it walks there, so the step is animated; any
                // further and it is put where it belongs.
                if (Math.abs(dx) + Math.abs(dy) === 1 && !event.isMoving()) {
                    event.moveStraight(dx > 0 ? 6 : (dx < 0 ? 4 : (dy > 0 ? 2 : 8)));
                } else if (dx !== 0 || dy !== 0) {
                    event.locate(entry.x, entry.y);
                }
                event.setDirection(entry.d);
            }
        },

        // --- how hurt the monsters are --------------------------------------
        // BattleSystemEnhanced keeps a fight's leftovers in persistentEnemyData,
        // keyed "mapId_eventId": that is what makes a monster the party ran from
        // still bleeding when they meet it again, and it is what the other
        // player has to be told so they do not meet it at full health.
        _persistentEnemyData() {
            const BSE = window.BattleSystemEnhanced;
            return (BSE && BSE.State && BSE.State.persistentEnemyData) || null;
        },

        _localEnemyHp() {
            const pData = this._persistentEnemyData();
            if (!pData) return null;
            const prefix = $gameMap.mapId() + '_';
            const mine = {};
            for (const key of Object.keys(pData)) {
                if (key.indexOf(prefix) === 0) mine[key] = pData[key];
            }
            return mine;
        },

        sendEnemyHp() {
            const mine = this._localEnemyHp();
            if (!mine) return;
            let signature;
            try {
                signature = JSON.stringify(mine);
            } catch (e) {
                return;
            }
            if (signature === this._hpSignature) return;
            this._hpSignature = signature;
            LanSession.relay('enemy-hp', { mapId: $gameMap.mapId(), enemies: mine });
        },

        applyEnemyHp(data) {
            const pData = this._persistentEnemyData();
            if (!pData || !data || !data.enemies) return;
            if (typeof $gameMap === 'undefined' || !$gameMap) return;
            Object.assign(pData, data.enemies);
            // What we just took is not a local change to report back.
            if (data.mapId === $gameMap.mapId()) {
                try {
                    this._hpSignature = JSON.stringify(this._localEnemyHp());
                } catch (e) { /* leave the old signature */ }
            }
        },

        // A monster that fell, a chest that emptied itself: whoever erased it
        // says so, driver or not, because a kill belongs to the player who made
        // it and the body must go on every machine.
        onEventErased(event) {
            if (!LanSession.active || !NetworkManager.instance.isMultiplayer()) return;
            if (!event || !event.eventId || window.MultiplayerRemote.isRemoteEvent(event)) return;
            if (this.othersHere() === 0) return;
            this._sent.set(event.eventId(), `${event.x},${event.y},${event.direction()},${event._fixedTroopId || 0},1`);
            LanSession.relay('map-events', {
                mapId: $gameMap.mapId(),
                events: [{ i: event.eventId(), x: event.x, y: event.y, d: event.direction(), t: 0, e: 1 }]
            });
        }
    };

    // ----------------------------------------------------------------------------
    // Session rules: what the host decides for everybody
    // ----------------------------------------------------------------------------
    // Map Battle Mode is a property of the session, not of a machine: one player
    // fighting on the map while the other fights in the battle scene would be
    // two different games. The host's setting is broadcast and every guest wears
    // it while they are in; the option is locked for them, and their own choice
    // is put back when they leave.
    const SessionRules = {
        _timer: 0,
        _sent: null,
        _guestOwn: null,

        isLocked() {
            return !!(LanSession.active && !LanSession.hosting && NetworkManager.instance.isMultiplayer());
        },

        current() {
            return { mapBattleMode: ConfigManager.mapBattleMode === true };
        },

        // The host publishes at login and whenever it flips the option.
        update() {
            if (!LanSession.active || !LanSession.hosting || !NetworkManager.instance.isMultiplayer()) return;
            if (++this._timer < 30) return;
            this._timer = 0;
            const rules = this.current();
            const signature = JSON.stringify(rules);
            if (signature === this._sent) return;
            this._sent = signature;
            LanSession.relay('session-rules', { rules: rules });
        },

        publish() {
            this._sent = null;
            this._timer = 30;
            this.update();
        },

        apply(rules) {
            if (!rules || LanSession.hosting) return;
            if (this._guestOwn === null) this._guestOwn = this.current();
            if (typeof rules.mapBattleMode === 'boolean' && ConfigManager.mapBattleMode !== rules.mapBattleMode) {
                ConfigManager.mapBattleMode = rules.mapBattleMode;
                if (window.ParchmentToast && window.ParchmentToast.show) {
                    window.ParchmentToast.show(T(rules.mapBattleMode
                        ? 'Multiplayer.lan.hostTurnedMapBattleOn'
                        : 'Multiplayer.lan.hostTurnedMapBattleOff'));
                }
            }
        },

        // Leaving gives a guest their own setting back.
        restore() {
            if (this._guestOwn) {
                ConfigManager.mapBattleMode = this._guestOwn.mapBattleMode;
                this._guestOwn = null;
            }
            this._sent = null;
        }
    };

    // ----------------------------------------------------------------------------
    // Shared battles: the battle scene, fought together
    // ----------------------------------------------------------------------------
    // With Map Battle Mode off a fight is a scene of its own, and two machines
    // cannot share one scene. What they share is the monster. When a player
    // walks into an enemy, the others on the map see that enemy step up beside
    // them and stand there; anyone within six tiles is pulled into the fight at
    // once, and anyone who bumps the monster later joins it. Every fighter runs
    // the battle on their own machine and sees the others as party members
    // standing in the line: stand-ins that never act on their own, because
    // their real blows arrive from the machine that struck them, as damage
    // dealt to the same monster. A player who flees is simply gone from the
    // others' line; the fight goes on without them.
    const BattleShare = {
        JOIN_RANGE: 6,
        // Proxy actors for the stand-ins. MapBattleMode uses the same pool for
        // its NPC volunteers, and a map battle and a battle scene never run at
        // the same time on one machine, so the two can share it.
        STANDIN_ACTOR_IDS: [8, 7, 6],
        _battle: null,           // { key, eventId, troopId, mapId, allies: Map(playerId -> actorId) }
        _openFights: new Map(),  // key -> { playerId, eventId, troopId, x, y }, fights seen on this map
        _timer: 0,

        active() { return !!this._battle; },

        isStandIn(actor) {
            return !!(actor && actor._mpRemoteAlly);
        },

        keyFor(mapId, eventId) { return `${mapId}_${eventId}`; },

        // What the others need to draw us in their line.
        snapshot() {
            const leader = $gameParty.leader();
            if (!leader) return null;
            return {
                name: leader.name(),
                classId: leader._classId,
                level: leader.level,
                characterName: leader.characterName(),
                characterIndex: leader.characterIndex(),
                faceName: leader.faceName(),
                faceIndex: leader.faceIndex(),
                battlerName: leader.battlerName(),
                hp: leader.hp, mhp: leader.mhp, mp: leader.mp, mmp: leader.mmp
            };
        },

        // --- our own fight ------------------------------------------------------
        onBattleSetup() {
            if (!LanSession.active || !NetworkManager.instance.isMultiplayer()) return;
            if (window.MapBattleMode && window.MapBattleMode.isActive()) return;
            const BSE = window.BattleSystemEnhanced;
            const eventId = BSE && BSE.State ? BSE.State.currentEventId : null;
            if (!eventId || typeof $gameMap === 'undefined' || !$gameMap) return;
            const event = $gameMap.event(eventId);
            if (!event) return;
            const mapId = $gameMap.mapId();
            const key = this.keyFor(mapId, eventId);
            this._battle = { key, eventId, mapId, troopId: event._fixedTroopId || 0, allies: new Map() };
            this._timer = 0;
            LanSession.relay('battle-start', {
                key, eventId, mapId, troopId: this._battle.troopId,
                x: $gamePlayer.x, y: $gamePlayer.y, actor: this.snapshot()
            });
        },

        onBattleEnd(result) {
            if (!this._battle) return;
            const battle = this._battle;
            this._battle = null;
            if (NetworkManager.instance.isMultiplayer()) {
                LanSession.relay('battle-leave', { key: battle.key, result: result });
            }
            for (const actorId of battle.allies.values()) this._dismissStandIn(actorId);
            // Our monster is settled one way or the other: nobody is fighting it
            // where it was standing for the others any more.
            this._openFights.delete(battle.key);
        },

        // Runs every frame from SceneManager, since the map update stops while
        // the battle scene is up: the others need to see our stand-in's health.
        update() {
            if (!this._battle || !NetworkManager.instance.isMultiplayer()) return;
            if (++this._timer < 30) return;
            this._timer = 0;
            const leader = $gameParty.leader();
            if (!leader) return;
            LanSession.relay('battle-ally-hp', { key: this._battle.key, hp: leader.hp, mp: leader.mp });
        },

        // A blow of ours landed on the monster: tell the machines fighting it.
        onHit(subject, target, result) {
            if (!this._battle || !target || !target.isEnemy || !target.isEnemy()) return;
            if (!subject || !subject.isActor || !subject.isActor() || this.isStandIn(subject)) return;
            if (!result || !result.hpDamage) return;
            LanSession.relay('battle-hit', {
                key: this._battle.key, index: target.index(), damage: result.hpDamage
            });
        },

        // --- the others' fights -------------------------------------------------
        handle(data) {
            switch (data.kind) {
                case 'battle-start': this._onRemoteStart(data); break;
                case 'battle-ally': this._addStandIn(data.from, data.actor, data.key); break;
                case 'battle-ally-hp': this._onAllyHp(data); break;
                case 'battle-hit': this._onRemoteHit(data); break;
                case 'battle-leave': this._onRemoteLeave(data); break;
                default: break;
            }
        },

        _onRemoteStart(data) {
            if (!data || !data.key) return;
            // Already in that fight: they are joining us. Take them into the
            // line and send ourselves back, so they take us into theirs.
            if (this._battle && this._battle.key === data.key) {
                this._addStandIn(data.from, data.actor, data.key);
                LanSession.relay('battle-ally', { key: data.key, actor: this.snapshot() }, data.from);
                return;
            }
            if (typeof $gameMap === 'undefined' || !$gameMap || $gameMap.mapId() !== data.mapId) return;
            if (SceneManager._scene instanceof Scene_Battle) return;   // busy with our own
            this._openFights.set(data.key, {
                playerId: data.from, eventId: data.eventId, troopId: data.troopId, x: data.x, y: data.y
            });
            this._placeMonsterBeside(data);
            const distance = Math.max(
                Math.abs($gameMap.deltaX($gamePlayer.x, data.x)),
                Math.abs($gameMap.deltaY($gamePlayer.y, data.y)));
            if (distance <= this.JOIN_RANGE) this.join(data.key);
        },

        // The monster steps up beside the player it is fighting, on our map, so
        // that it can be bumped into. With Map Battle Mode on the fight is
        // already on the map and needs no staging.
        _placeMonsterBeside(data) {
            const event = $gameMap.event(data.eventId);
            if (!event || event._erased) return;
            if (data.troopId && !event._fixedTroopId) {
                event._fixedTroopId = data.troopId;
                if (event.updateCharacterSprite) event.updateCharacterSprite();
            }
            event._mpBattleOf = data.from;
            const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
            for (const [dx, dy] of spots) {
                const x = $gameMap.roundX(data.x + dx);
                const y = $gameMap.roundY(data.y + dy);
                if (!$gameMap.isValid(x, y) || !$gameMap.checkPassage(x, y, 0x0f)) continue;
                if ($gameMap.eventsXyNt(x, y).some(other => other !== event)) continue;
                if (x === $gamePlayer.x && y === $gamePlayer.y) continue;
                event.locate(x, y);
                event.setOpacity(255);
                event.setThrough(false);
                break;
            }
        },

        // Fight the same monster: the ordinary battle start against its event,
        // which makes our own setup announce us and the fighter answer.
        join(key) {
            const fight = this._openFights.get(key);
            if (!fight || this._battle) return;
            const BSE = window.BattleSystemEnhanced;
            if (!BSE || !BSE.Functions || !BSE.Functions.startPersistentBattle) return;
            const event = $gameMap.event(fight.eventId);
            if (!event || event._erased) return;
            if (fight.troopId && !event._fixedTroopId) event._fixedTroopId = fight.troopId;
            if (!event._fixedTroopId) return;
            BSE.Functions.startPersistentBattle(event._fixedTroopId, key, fight.eventId, $gameMap.mapId());
        },

        _onAllyHp(data) {
            if (!this._battle || this._battle.key !== data.key) return;
            const actorId = this._battle.allies.get(data.from);
            const actor = actorId ? $gameActors.actor(actorId) : null;
            if (!actor) return;
            actor.setHp(Math.max(0, Math.min(actor.mhp, Number(data.hp) || 0)));
            actor.setMp(Math.max(0, Math.min(actor.mmp, Number(data.mp) || 0)));
        },

        _onRemoteHit(data) {
            if (!this._battle || this._battle.key !== data.key) return;
            if (!$gameParty.inBattle()) return;
            const enemy = $gameTroop.members()[data.index];
            if (!enemy || enemy.isDead()) return;
            enemy.gainHp(-Number(data.damage || 0));
            if (enemy.isDead()) enemy.performCollapse();
            if (typeof BattleManager.refreshStatus === 'function') BattleManager.refreshStatus();
            $gameTemp.requestBattleRefresh();
        },

        _onRemoteLeave(data) {
            this._openFights.delete(data.key);
            const event = (typeof $gameMap !== 'undefined' && $gameMap) ? $gameMap.event((data.key || '').split('_')[1]) : null;
            if (event && event._mpBattleOf === data.from) event._mpBattleOf = null;
            if (!this._battle || this._battle.key !== data.key) return;
            const actorId = this._battle.allies.get(data.from);
            if (!actorId) return;
            this._battle.allies.delete(data.from);
            this._dismissStandIn(actorId);
        },

        // --- stand-ins ----------------------------------------------------------
        _addStandIn(playerId, snapshot, key) {
            if (!this._battle || this._battle.key !== key || !snapshot) return;
            if (this._battle.allies.has(playerId)) return;
            const used = Array.from(this._battle.allies.values());
            const actorId = this.STANDIN_ACTOR_IDS.find(id => !used.includes(id) && !$gameParty._actors.includes(id));
            const actor = actorId ? $gameActors.actor(actorId) : null;
            if (!actor) return;
            actor.setup(actorId);
            actor.setName(snapshot.name || T('Multiplayer.playerNumbered', { id: playerId }));
            if (snapshot.classId && $dataClasses[snapshot.classId]) actor.changeClass(snapshot.classId, true);
            actor.changeLevel(Math.max(1, snapshot.level || 1), false);
            actor.setCharacterImage(snapshot.characterName || '', snapshot.characterIndex || 0);
            actor.setFaceImage(snapshot.faceName || '', snapshot.faceIndex || 0);
            if (snapshot.battlerName) actor.setBattlerImage(snapshot.battlerName);
            actor._mpRemoteAlly = playerId;
            actor.recoverAll();
            actor.setHp(Math.max(1, Math.min(actor.mhp, Number(snapshot.hp) || actor.mhp)));
            actor.setMp(Math.max(0, Math.min(actor.mmp, Number(snapshot.mp) || 0)));
            this._battle.allies.set(playerId, actorId);

            $gameParty.addActor(actorId);
            // The line only shows the first few members: make sure the stand-in
            // is one of them, ahead of whoever was last.
            const max = $gameParty.maxBattleMembers();
            const actors = $gameParty._actors;
            if (actors.indexOf(actorId) >= max) {
                actors.splice(actors.indexOf(actorId), 1);
                actors.splice(max - 1, 0, actorId);
            }
            actor.onBattleStart();
            actor.clearActions();
            if (typeof BattleManager.refreshStatus === 'function') BattleManager.refreshStatus();
            $gameTemp.requestBattleRefresh();
            if (window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(T('Multiplayer.lan.joinedYourBattle', { name: actor.name() }));
            }
        },

        _dismissStandIn(actorId) {
            const actor = $gameActors.actor(actorId);
            if (actor) {
                actor.clearActions();
                actor._mpRemoteAlly = null;
            }
            if ($gameParty._actors.includes(actorId)) $gameParty.removeActor(actorId);
            if ($gameParty.inBattle()) {
                if (typeof BattleManager.refreshStatus === 'function') BattleManager.refreshStatus();
                $gameTemp.requestBattleRefresh();
            }
            if (actor) actor.setup(actorId);
        },

        // Leaving the session mid-fight: everything we borrowed goes back.
        reset() {
            if (this._battle) {
                for (const actorId of this._battle.allies.values()) this._dismissStandIn(actorId);
            }
            this._battle = null;
            this._openFights.clear();
        }
    };

    // ----------------------------------------------------------------------------
    // LanSession: hosting, joining and the extra packets a LAN game carries
    // ----------------------------------------------------------------------------
    const LanSession = {
        active: false,
        hosting: false,
        server: null,
        hostAddress: '',
        hostPort: LAN_DEFAULT_PORT,

        isAvailable() {
            return !!nodeRequire && LanDiscovery.isAvailable();
        },

        // The name this machine shows up as in everybody else's scan list.
        hostLabel() {
            const os = nodeModule('os');
            const machine = os ? os.hostname() : '';
            const leader = (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.leader())
                ? $gameParty.leader().name() : '';
            return leader || machine || T('Multiplayer.lan.unknownHost');
        },

        // The addresses guests will see this host at, for the host's own UI.
        localAddresses() {
            return lanInterfaces().map(iface => iface.address);
        },

        // Start hosting: run server.js in this process, then join it over
        // loopback as an ordinary client so the host is a player like any other.
        host(port = LAN_DEFAULT_PORT) {
            if (!this.isAvailable()) return Promise.reject(new Error('LAN unavailable')); // i18n-ignore: diagnostic
            const module = lanServerModule();
            if (!module || !module.startServer) return Promise.reject(new Error('server.js unavailable')); // i18n-ignore: diagnostic
            if (this.hosting) this.stopHost();

            const world = LanWorld.build();
            return new Promise((resolve, reject) => {
                let settled = false;
                try {
                    this.server = module.startServer({
                        port: port,
                        discovery: true,
                        world: world,
                        advertise: { hostName: this.hostLabel(), world: world ? world.name : '' },
                        onError: (e) => {
                            if (settled) return;
                            settled = true;
                            this.server = null;
                            reject(e);
                        },
                        onListening: () => {
                            if (settled) return;
                            settled = true;
                            this.hosting = true;
                            this.hostPort = port;
                            this.hostAddress = '127.0.0.1';
                            this.active = true;
                            NetworkMode = 'WebSocket';
                            window.NetworkMode = NetworkMode;
                            NetworkManager = NetworkManager_Server;
                            window.NetworkManager = NetworkManager;
                            NetworkManager_Server.instance.connect(`ws://127.0.0.1:${port}`)
                                .then(resolve)
                                .catch(reject);
                        }
                    });
                } catch (e) {
                    reject(e);
                }
            });
        },

        stopHost() {
            if (this.server) {
                try { this.server.close(); } catch (e) { /* already down */ }
                this.server = null;
            }
            this.hosting = false;
        },

        // Join a host found by the scan.
        join(address, port = LAN_DEFAULT_PORT) {
            this.active = true;
            this.hosting = false;
            this.hostAddress = address;
            this.hostPort = port;
            NetworkMode = 'WebSocket';
            window.NetworkMode = NetworkMode;
            NetworkManager = NetworkManager_Server;
            window.NetworkManager = NetworkManager;
            return NetworkManager_Server.instance.connect(`ws://${address}:${port}`);
        },

        leave() {
            BattleShare.reset();
            SessionRules.restore();
            const nm = NetworkManager_Server.instance;
            if (nm.isMultiplayer() || nm.isConnected()) nm.disconnect(!this.hosting);
            this.stopHost();
            this.active = false;
            this.hostAddress = '';
        },

        // A packet nobody but the clients care about. The server passes these
        // through untouched, so a new kind never needs a server change.
        relay(kind, data = {}, to = null) {
            const nm = NetworkManager.instance;
            if (!nm || !nm.isMultiplayer()) return;
            const packet = Object.assign({ type: 'relay', kind: kind }, data);
            if (to) packet.to = to;
            nm.send(packet);
        },

        // Once logged in, the host publishes its world so late joiners get it too.
        onLoggedIn() {
            if (!this.active) return;
            if (this.hosting) {
                const world = LanWorld.build();
                if (world) {
                    if (this.server && this.server.setWorld) this.server.setWorld(world);
                    NetworkManager_Server.instance.send({ type: 'world-offer', world: world });
                }
            }
            LanVehicles._signature = '';
            MapSync.onMapChanged();
            SessionRules.publish();
        },

        handleRelay(data) {
            switch (data.kind) {
                case 'vehicle-state':
                    LanVehicles.apply(data.state);
                    break;
                case 'map-events':
                    MapSync.applyEvents(data);
                    break;
                case 'enemy-hp':
                    MapSync.applyEnemyHp(data);
                    break;
                case 'session-rules':
                    SessionRules.apply(data.rules);
                    break;
                case 'battle-start':
                case 'battle-ally':
                case 'battle-ally-hp':
                case 'battle-hit':
                case 'battle-leave':
                    BattleShare.handle(data);
                    break;
                // A player who walked into a map battle: the others hide their
                // sprite exactly as they do for a normal encounter, so nobody
                // shoots at a body that is busy fighting somewhere else.
                case 'map-battle':
                    MultiplayerManager.instance.updateRemotePlayerState(
                        data.from, data.phase === 'start' ? 'battling' : 'idle');
                    break;
                default:
                    break;
            }
        }
    };

    window.LanSession = LanSession;
    window.LanDiscovery = LanDiscovery;

    // Remote players are other people's bodies: nothing local may talk to them,
    // walk them, recruit them into a fight or count them as scenery. Every
    // system that scans the map for something to do asks here (MapBattleMode,
    // AutoIdleExplorer).
    // The sub tile coordinates a platformer body needs, or null on an ordinary
    // map. Defined here so both senders (LAN/WebSocket and Steamworks) ask the
    // same question.
    function platformerState(player) {
        if (!window.PlatformerMode || !window.PlatformerMode.isActive()) return null;
        return window.PlatformerMode.remoteState(player);
    }

    window.MultiplayerRemote = {
        isRemoteEvent(event) {
            if (!event || !event.eventId) return false;
            if (MultiplayerManager.instance.eventPlayerMap.has(event.eventId())) return true;
            // Asked of every event on the map every frame, so the cheap test
            // comes first and the pattern only runs on a name that could match.
            const data = event.event && event.event();
            const name = data ? String(data.name || '') : '';
            if (name.length < 7 || name.slice(0, 6) !== 'Player') return false;   // i18n-ignore: event name
            return /^Player\d+$/.test(name);   // i18n-ignore: event name
        },
        isLanSession() { return !!LanSession.active; },
        // Whether this machine simulates the map it stands on (NPCSystem asks
        // before stepping its controllers).
        drivesMap() { return MapSync.ownsMap(); },
        // Map Battle Mode is the host's call for the whole session.
        isMapBattleLocked() { return SessionRules.isLocked(); },
        isNetworkSession() {
            const nm = NetworkManager.instance;
            return !!(nm && nm.isMultiplayer && nm.isMultiplayer());
        }
    };



    // ============================================================================
    // COMMON: MultiplayerManager
    // ============================================================================
    class MultiplayerManager {
        constructor() {
            this.playerEvents = new Map();
            this.eventPlayerMap = new Map();
            this.playerMovementQueue = new Map();
        }

        static get instance() {
            if (!this._instance) this._instance = new MultiplayerManager();
            return this._instance;
        }

        update() {
            NetworkManager.instance.pollPackets();
            if (NetworkManager.instance.isMultiplayer()) {
                NetworkManager.instance.updateLocalPlayerPosition();
                this.processMovementQueue();
                LanVehicles.update();
                MapSync.update();
                SessionRules.update();
            }
        }

        processMovementQueue() {
            for (const [playerId, movements] of this.playerMovementQueue.entries()) {
                if (movements.length === 0) continue;
                const event = this.getRemotePlayer(playerId);
                if (!event) continue;
                // A placed platformer body is never "moving", and its queue must
                // drain to the newest packet rather than one step per frame, or
                // a remote jump would play back in slow motion.
                const platform = !!(window.PlatformerMode && window.PlatformerMode.isActive());
                if (!platform && event.isMoving()) continue;
                const nextMove = platform ? movements.splice(0, movements.length).pop() : movements.shift();
                if (nextMove) this.executeMovement(event, nextMove);
            }
        }

        executeMovement(event, moveData) {
            event.setMoveSpeed(moveData.moveSpeed);
            // A vehicle moves at its own speed and is drawn as itself; stepping
            // off puts the walking sprite back.
            if (moveData.vehicle !== undefined) this.applyRemoteVehicle(event, moveData);
            event.setPattern(moveData.pattern || event.pattern());
            if (NetworkMode === 'Steamworks') {
                event.setOpacity(moveData.opacity === undefined ? 255 : moveData.opacity);
                event.setBlendMode(moveData.blendMode === undefined ? 0 : moveData.blendMode);
            }
            // A platformer body is placed, not walked: moveStraight would refuse
            // the fall and the jump, and quantise the arc to the grid.
            if (window.PlatformerMode && window.PlatformerMode.isActive() &&
                window.PlatformerMode.applyRemoteBody(event, moveData)) return;
            const dx = moveData.x - event.x;
            const dy = moveData.y - event.y;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) event.locate(moveData.x, moveData.y);
            else if (dx !== 0 || dy !== 0) {
                const sx = event.deltaXFrom(moveData.x);
                const sy = event.deltaYFrom(moveData.y);
                if (Math.abs(sx) > Math.abs(sy)) event.moveStraight(sx > 0 ? 4 : 6);
                else if (sy !== 0) event.moveStraight(sy > 0 ? 8 : 2);
            }
            event.setDirection(moveData.direction);
        }

        // Redraw a remote player as the vehicle they board, and as themselves
        // again when they step off. The walking sprite is kept on the event so
        // getting off does not need another packet.
        applyRemoteVehicle(event, moveData) {
            const playerId = this.eventPlayerMap.get(event.eventId());
            const info = playerId ? NetworkManager.instance.players.get(playerId) : null;
            if (!info) return;
            const wasRiding = event._mpVehicleKey || '';
            const isRiding = moveData.vehicle || '';
            if (wasRiding === isRiding) return;
            event._mpVehicleKey = isRiding;
            if (isRiding) {
                if (!event._mpWalkGraphic) {
                    event._mpWalkGraphic = { name: event._characterName, index: event._characterIndex };
                }
                if (moveData.vehicleName) {
                    event._characterName = moveData.vehicleName;
                    event._characterIndex = moveData.vehicleIndex || 0;
                }
            } else if (event._mpWalkGraphic) {
                event._characterName = event._mpWalkGraphic.name;
                event._characterIndex = event._mpWalkGraphic.index;
                event._mpWalkGraphic = null;
            }
            event.refresh();
        }

        getRemotePlayer(id) { return this.playerEvents.has(id) ? $gameMap.event(this.playerEvents.get(id)) : null; }

        removeRemotePlayer(id) {
            const eventId = this.playerEvents.get(id);
            if (eventId) {
                const event = $gameMap.event(eventId);
                if (event) { event.setOpacity(0); event._characterName = ''; }
                this.playerEvents.delete(id);
                this.eventPlayerMap.delete(eventId);
                this.playerMovementQueue.delete(id);
            }
        }

        clearRemotePlayers() {
            for (const eventId of this.eventPlayerMap.keys()) {
                const event = $gameMap.event(eventId);
                if (event) { event.setOpacity(0); event._characterName = ''; }
            }
            this.playerEvents.clear();
            this.eventPlayerMap.clear();
            this.playerMovementQueue.clear();
        }

        onMapLoaded() {
            // Consume any pending Steam "Join Game" request now that we are in-world.
            if (typeof SteamJoinRequest !== 'undefined') SteamJoinRequest.tryConsume();
            if (NetworkManager.instance.isMultiplayer()) {
                NetworkManager.instance.onMapTransfer();
                this.setupPlayerEvents();
                if (NetworkMode === 'Steamworks' && NetworkManager.instance.pendingTeleport && !NetworkManager.instance.isLeader && NetworkManager.instance.followLeader) {
                    NetworkManager.instance.pendingTeleport = false;
                }
            }
        }

        setupPlayerEvents() {
            const MAX_MAP_SLOTS = NetworkMode === 'Steamworks' ? STEAM_MAX_PLAYERS : MAX_MAP_PLAYER_SLOTS;
            const playerEventNames = Array.from({ length: MAX_MAP_SLOTS }, (_, i) => `Player${i + 1}`);  // i18n-ignore  event names
            this.playerEvents.clear();
            this.eventPlayerMap.clear();
            this.playerMovementQueue.clear();

            if (!$dataMap.events) return;

            const nm = NetworkManager.instance;
            const myId = nm.myId;
            const currentMapId = $gameMap.mapId();
            const availableSlots = [];

            for (const event of $dataMap.events) {
                if (event && playerEventNames.includes(event.name)) {
                    availableSlots.push(event);
                    const mapEvent = $gameMap.event(event.id);
                    if (mapEvent) { mapEvent.setOpacity(0); mapEvent._characterName = ''; }
                }
            }

            availableSlots.sort((a, b) => parseInt(a.name.replace('Player', '')) - parseInt(b.name.replace('Player', '')));  // i18n-ignore  event names

            const partyMembers = nm.isInParty() ? nm.party.members : [];
            const partyPlayersOnMap = [];
            const otherPlayersOnMap = [];

            for (const [playerId, playerInfo] of nm.players.entries()) {
                if (playerId === myId || !playerInfo || playerInfo.mapId !== currentMapId) continue;
                const playerData = { id: playerId, info: playerInfo };
                if (partyMembers.includes(playerId)) partyPlayersOnMap.push(playerData);
                else otherPlayersOnMap.push(playerData);
            }

            const playersToDisplay = [...partyPlayersOnMap, ...otherPlayersOnMap].slice(0, MAX_MAP_SLOTS);

            for (let i = 0; i < playersToDisplay.length; i++) {
                const player = playersToDisplay[i];
                const eventData = availableSlots[i];
                if (player && eventData) {
                    this.playerEvents.set(player.id, eventData.id);
                    this.eventPlayerMap.set(eventData.id, player.id);
                    this.playerMovementQueue.set(player.id, []);
                    const event = $gameMap.event(eventData.id);
                    if (event) {
                        event._characterName = player.info.characterName;
                        event._characterIndex = player.info.characterIndex;
                        event.locate(player.info.x, player.info.y);
                        event.setDirection(player.info.direction);
                        event.setOpacity(255);
                        event.refresh();
                    }
                }
            }
        }

        updateRemotePlayerPosition(playerId, data) {
            const playerInfo = NetworkManager.instance.players.get(playerId);
            if (playerInfo) { playerInfo.x = data.x; playerInfo.y = data.y; playerInfo.direction = data.direction; }
            const event = this.getRemotePlayer(playerId);
            if (!event) return;
            if (!this.playerMovementQueue.has(playerId)) this.playerMovementQueue.set(playerId, []);

            const queue = this.playerMovementQueue.get(playerId);
            const dx = Math.abs(data.x - event.x);
            const dy = Math.abs(data.y - event.y);

            if (dx > 3 || dy > 3 || queue.length > 8) {
                queue.length = 0;
                event.locate(data.x, data.y);
                this.executeMovement(event, data);
            } else { queue.push(data); }
        }

        updateRemotePlayerGraphic(playerId, characterName, characterIndex) {
            const event = this.getRemotePlayer(playerId);
            if (event) { event._characterName = characterName; event._characterIndex = characterIndex; event.refresh(); }
        }

        handlePlayerMapTransfer(playerId, mapId) {
            const playerInfo = NetworkManager.instance.players.get(playerId);
            if (playerInfo) playerInfo.mapId = mapId;
            if (mapId === $gameMap.mapId()) this.setupPlayerEvents();
            else {
                const event = this.getRemotePlayer(playerId);
                if (event) { event.setOpacity(0); event._characterName = ''; this.playerMovementQueue.delete(playerId); }
            }
        }

        updateRemotePlayerState(playerId, state) {
            const event = this.getRemotePlayer(playerId);
            if (!event) return;
            // On a LAN a fighter stays on the map with the monster beside them,
            // so the others can walk up and join (BattleShare).
            if (LanSession.active) { event.setOpacity(255); return; }
            event.setOpacity(state === 'battling' ? 0 : 255);
        }
    }


    // ============================================================================
    // UI OVERLAYS & SCENES
    // ============================================================================

    // ----------------------------------------------------------------------------
    // Scene_MultiplayerTypeSelection
    // ----------------------------------------------------------------------------
    class Scene_MultiplayerTypeSelection extends Scene_MenuBase {
        create() {
            super.create();
            this.createHelpWindow();
            this.createCommandWindow();

            if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }
            if (this._commandWindow) { this._commandWindow.deactivate(); this._commandWindow.hide(); }

            this._selectedIndex = 0;
            this.initUITypeSelectionDOM();
            this.refreshUITypeSelection();
        }

        update() {
            this.updateUITypeSelectionInput();
            super.update();
        }

        terminate() {
            const container = document.getElementById("mp-type-container");
            if (container) container.remove();
            super.terminate();
        }

        initUITypeSelectionDOM() {
            if (!document.getElementById("mp-type-container")) {
                const container = document.createElement("div");
                container.id = "mp-type-container";
                // Graphics._disableContextMenu() only ran over the boot-time DOM, so
                // suppress it here or right-click-to-go-back opens the native menu.
                container.oncontextmenu = () => false;
                document.body.appendChild(container);
            }
        }

        _typePortals(isIt, localActive) {
            const lanActive = window.LanSession && LanSession.active;
            return [
                {
                    id: 'local',
                    name:T('Multiplayer.localMultiplayer'),
                    hint:T('Multiplayer.splitScreenCoOp'),
                    desc:T('Multiplayer.startALocalSplitScreen'),
                    action: localActive ? (T('Multiplayer.disconnect')) : (T('Multiplayer.start')),
                    danger: localActive,
                },
                {
                    // The one networked mode that needs nothing but a shared
                    // router: one machine hosts, the rest find it by scanning.
                    id: 'lan',
                    name:T('Multiplayer.lan.name'),
                    hint: T('Multiplayer.lan.hint'),
                    desc: LanSession.isAvailable()
                        ? T('Multiplayer.lan.desc')
                        : T('Multiplayer.lan.unavailable'),
                    action: lanActive ? T('Multiplayer.disconnect') : T('Multiplayer.lan.open'),
                    danger: !!lanActive,
                    disabled: !LanSession.isAvailable(),
                },
                {
                    id: 'steam',
                    name:T('Multiplayer.steamMultiplayer'),
                    hint:   NETWORK_PLAY_ENABLED
                        ? T('Multiplayer.hintSteamLobby')
                        : T('Multiplayer.unavailable'),
                    desc:   NETWORK_PLAY_ENABLED
                        ? (T('Multiplayer.connectWithOtherPlayersVia'))
                        : (T('Multiplayer.steamP2pLobbiesAreNot')),
                    action: NETWORK_PLAY_ENABLED
                        ? (T('Multiplayer.openLobby'))
                        : (T('Multiplayer.unavailable')),
                    danger: false,
                    disabled: !NETWORK_PLAY_ENABLED,
                },
                {
                    id: 'online',
                    name:T('Multiplayer.onlineMultiplayer'),
                    hint:   NETWORK_PLAY_ENABLED
                        ? T('Multiplayer.hintCentralServer')
                        : T('Multiplayer.unavailable'),
                    desc:   NETWORK_PLAY_ENABLED
                        ? (T('Multiplayer.connectToACentralWebsocket'))
                        : (T('Multiplayer.onlinePlayIsNotAvailable')),
                    action: NETWORK_PLAY_ENABLED
                        ? (T('Multiplayer.connect'))
                        : (T('Multiplayer.unavailable')),
                    danger: false,
                    disabled: !NETWORK_PLAY_ENABLED,
                }
            ];
        }

        refreshUITypeSelection() {
            const container = document.getElementById("mp-type-container");
            if (!container) return;

            const isIt = ConfigManager.language === 'it';
            const localActive = window.SplitScreenManager && window.SplitScreenManager.active;
            const portals = this._typePortals(isIt, localActive);
            const sel = portals[this._selectedIndex];

            const optionsHTML = portals.map((p, i) => `
                <div class="mp-option-row ${this._selectedIndex === i ? 'selected' : ''} ${p.disabled ? 'disabled' : ''}" data-idx="${i}">
                    <span class="mp-option-name">${p.name}</span>
                    <span class="mp-option-hint">${p.hint}</span>
                    <span class="mp-option-desc">${p.desc}</span>
                </div>
            `).join('');

            const localBadge = (this._selectedIndex === 0 && localActive)
                ? `<span class="mp-local-badge">${T('Multiplayer.sessionActive')}</span>`
                : '';

            container.innerHTML = `
                <div class="book-spread mp-type-single">
                    <div class="mp-single-page">
                        <div class="page-header-bar">
                            <button class="back-button" id="mp-type-back">${T('Multiplayer.back')}</button>
                            <h2 class="title">${T('Multiplayer.ui.title')}</h2>
                        </div>
                        <div class="mp-option-list">
                            ${optionsHTML}
                        </div>
                        <div class="mp-single-footer">
                            <span id="mp-local-badge">${localBadge}</span>
                            <div class="inspect-btn ${sel.danger ? 'inspect-btn--danger' : ''} ${sel.disabled ? 'inspect-btn--disabled' : ''}" id="mp-type-action">${sel.action}</div>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('mp-type-back')?.addEventListener('click', () => {
                SoundManager.playCancel();
                this.popScene();
            });
            document.getElementById('mp-type-action')?.addEventListener('click', () => {
                this.executeSelectedPortal();
            });
            container.querySelectorAll('.mp-option-row').forEach(row => {
                row.addEventListener('click', () => {
                    const idx = parseInt(row.getAttribute('data-idx'));
                    if (idx === this._selectedIndex) { this.executeSelectedPortal(); return; }
                    this._selectedIndex = idx;
                    SoundManager.playCursor();
                    this._updateTypeSelectionHighlight();
                });
            });
        }

        _updateTypeSelectionHighlight() {
            const container = document.getElementById("mp-type-container");
            if (!container) return;

            const isIt = ConfigManager.language === 'it';
            const localActive = window.SplitScreenManager && window.SplitScreenManager.active;
            const portals = this._typePortals(isIt, localActive);
            const sel = portals[this._selectedIndex];

            container.querySelectorAll('.mp-option-row').forEach((row, i) => {
                row.classList.toggle('selected', i === this._selectedIndex);
            });

            const nameEl   = document.getElementById('mp-detail-name');
            const descEl   = document.getElementById('mp-detail-desc');
            const badgeEl  = document.getElementById('mp-local-badge');
            const actionEl = document.getElementById('mp-type-action');

            if (nameEl)   nameEl.textContent  = sel.name;
            if (descEl)   descEl.textContent  = sel.desc;
            if (badgeEl)  badgeEl.innerHTML   = (this._selectedIndex === 0 && localActive)
                ? `<span class="mp-local-badge">${T('Multiplayer.sessionActive')}</span>`
                : '';
            if (actionEl) {
                actionEl.textContent = sel.action;
                actionEl.classList.toggle('inspect-btn--danger', !!sel.danger);
                actionEl.classList.toggle('inspect-btn--disabled', !!sel.disabled);
            }
        }

        updateUITypeSelectionInput() {
            const count = this._typePortals(ConfigManager.language === 'it',
                window.SplitScreenManager && window.SplitScreenManager.active).length;
            if (Input.isRepeated('down') || Input.isRepeated('right')) {
                this._selectedIndex = (this._selectedIndex + 1) % count;
                SoundManager.playCursor();
                this._updateTypeSelectionHighlight();
            } else if (Input.isRepeated('up') || Input.isRepeated('left')) {
                this._selectedIndex = (this._selectedIndex - 1 + count) % count;
                SoundManager.playCursor();
                this._updateTypeSelectionHighlight();
            } else if (Input.isTriggered('ok')) {
                this.executeSelectedPortal();
            } else if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                // TouchInput.isCancelled() is the right mouse button.
                SoundManager.playCancel();
                this.popScene();
            }
        }

        executeSelectedPortal() {
            const isIt = ConfigManager.language === 'it';
            const portal = this._typePortals(isIt, window.SplitScreenManager && window.SplitScreenManager.active)[this._selectedIndex];
            if (portal && portal.disabled) {
                SoundManager.playBuzzer();
                return;
            }
            SoundManager.playOk();
            switch (portal && portal.id) {
                case 'local': {
                    const localActive = window.SplitScreenManager && window.SplitScreenManager.active;
                    if (localActive) this.commandDisconnectLocal();
                    else this.commandLocal();
                    break;
                }
                case 'lan':
                    this.commandLan();
                    break;
                case 'steam':
                    this.commandSteam();
                    break;
                case 'online':
                    this.commandServer();
                    break;
            }
        }

        commandLan() {
            if (!LanSession.isAvailable()) {
                this._helpWindow.setText(T('Multiplayer.lan.unavailable'));
                return;
            }
            NetworkMode = 'WebSocket';
            window.NetworkMode = NetworkMode;
            NetworkManager = NetworkManager_Server;
            window.NetworkManager = NetworkManager;
            SceneManager.push(Scene_MultiplayerLan);
        }

        createHelpWindow() {
            const rect = new Rectangle(0, this.mainAreaTop(), Graphics.boxWidth, this.calcWindowHeight(1, false));
            this._helpWindow = new Window_Help(rect);
            this.addWindow(this._helpWindow);
        }

        createCommandWindow() {
            const rect = new Rectangle(0, 0, 400, 300);
            this._commandWindow = new Window_MultiplayerTypeSelection(rect);
            this._commandWindow.setHandler("local", this.commandLocal.bind(this));
            this._commandWindow.setHandler("lan", this.commandLan.bind(this));
            this._commandWindow.setHandler("steam", this.commandSteam.bind(this));
            this._commandWindow.setHandler("server", this.commandServer.bind(this));
            this._commandWindow.setHandler("disconnectLocal", this.commandDisconnectLocal.bind(this));
            this._commandWindow.setHandler("cancel", this.popScene.bind(this));
            this.addWindow(this._commandWindow);
        }

        commandLocal() {
            if (typeof Scene_SplitScreenCharacterSelection !== 'undefined') {
                SceneManager.push(Scene_SplitScreenCharacterSelection);
            }
        }

        commandDisconnectLocal() {
            if (window.SplitScreenManager) {
                window.SplitScreenManager.stopSession();
                this.refreshUITypeSelection();
                this._helpWindow.setText(T('Multiplayer.splitScreenTerminated'));
            }
        }

        commandSteam() {
            if (!NETWORK_PLAY_ENABLED) {
                this._helpWindow.setText(T('Multiplayer.steamNotAvailable'));
                return;
            }
            if (initSteam()) {
                NetworkMode = 'Steamworks';
                window.NetworkMode = NetworkMode;
                NetworkManager = NetworkManager_Steam;
                window.NetworkManager = NetworkManager;
                SceneManager.push(Scene_Multiplayer);
            } else {
                this._helpWindow.setText(T('Multiplayer.steamInitFailed'));
            }
        }

        commandServer() {
            if (!NETWORK_PLAY_ENABLED) {
                this._helpWindow.setText(T('Multiplayer.onlineNotAvailable'));
                return;
            }
            NetworkMode = 'WebSocket';
            window.NetworkMode = NetworkMode;
            NetworkManager = NetworkManager_Server;
            window.NetworkManager = NetworkManager;
            SceneManager.push(Scene_Multiplayer);
        }
    }

    class Window_MultiplayerTypeSelection extends Window_Command {
        makeCommandList() {
            if (window.SplitScreenManager && window.SplitScreenManager.active) {
                this.addCommand(T('Multiplayer.disconnectSplitScreen'), "disconnectLocal");
            } else {
                this.addCommand(T('Multiplayer.localMultiplayer'), "local");
                this.addCommand(T('Multiplayer.lan.name'), "lan", LanSession.isAvailable());
                this.addCommand(T('Multiplayer.steamMultiplayerCmd'), "steam", NETWORK_PLAY_ENABLED);
                this.addCommand(T('Multiplayer.customServer'), "server", NETWORK_PLAY_ENABLED);
            }
        }
    }

    window.Scene_MultiplayerTypeSelection = Scene_MultiplayerTypeSelection;

    // ----------------------------------------------------------------------------
    // Scene_MultiplayerLan
    // ----------------------------------------------------------------------------
    // The whole of LAN play in one screen: HOST on one machine, SCAN on the
    // others, then pick the host out of the list that fills itself in. Nobody
    // types an address, and the only thing a player has to know is which of
    // them is hosting.
    class Scene_MultiplayerLan extends Scene_MenuBase {
        constructor() {
            super();
            this._hosts = [];
            this._scanning = false;
            this._selectedIndex = 0;      // 0 host, 1 scan, 2 leave (when in a session)
            this._activeArea = 'menu';
            this._selectedHostIndex = 0;
            this._statusMessage = '';
            this._isError = false;
        }

        create() {
            super.create();
            this.initUILanDOM();
            this.refreshUILan();
            // A player who opens this screen wants to find the others: start
            // looking straight away rather than making them press SCAN first.
            if (!NetworkManager.instance.isMultiplayer()) this.commandScan();
        }

        update() {
            super.update();
            NetworkManager.instance.pollPackets();
            this.updateUILanInput();
        }

        terminate() {
            const container = document.getElementById("mp-lan-container");
            if (container) container.remove();
            super.terminate();
        }

        initUILanDOM() {
            if (!document.getElementById("mp-lan-container")) {
                const container = document.createElement("div");
                container.id = "mp-lan-container";
                container.oncontextmenu = () => false;
                document.body.appendChild(container);
            }
        }

        menuRows() {
            const connected = NetworkManager.instance.isMultiplayer();
            const rows = [];
            if (connected) {
                rows.push({ id: 'leave', label: T('Multiplayer.lan.leaveSession'), danger: true });
            } else {
                rows.push({ id: 'host', label: T('Multiplayer.lan.hostSession') });
                rows.push({ id: 'scan', label: this._scanning ? T('Multiplayer.lan.scanning') : T('Multiplayer.lan.scan') });
            }
            return rows;
        }

        refreshUILan() {
            const container = document.getElementById("mp-lan-container");
            if (!container) return;

            const nm = NetworkManager.instance;
            const connected = nm.isMultiplayer();
            const statusClass = connected ? "online" : "offline";
            const statusLabel = connected
                ? (LanSession.hosting ? T('Multiplayer.lan.hosting') : T('Multiplayer.lan.joined'))
                : T('Multiplayer.offline');

            const addresses = LanSession.localAddresses();
            const addressLine = addresses.length
                ? addresses.join(', ')
                : T('Multiplayer.lan.noNetwork');

            const rows = this.menuRows();
            const buttonsHTML = rows.map((row, i) => `
                <div class="action-btn ${row.danger ? 'disconnect' : ''} ${this._activeArea === 'menu' && this._selectedIndex === i ? 'focused' : ''}" data-row="${row.id}">
                    ${row.label}
                </div>
            `).join('');

            let hostsHTML = '';
            if (this._hosts.length === 0) {
                hostsHTML = `<div class="item-grid-empty">${this._scanning ? T('Multiplayer.lan.searching') : T('Multiplayer.lan.noHostsFound')}</div>`;
            } else {
                this._hosts.forEach((host, index) => {
                    const focused = this._activeArea === 'hosts' && this._selectedHostIndex === index;
                    const seats = host.maxPlayers
                        ? T('Multiplayer.lan.seats', { players: host.players, max: host.maxPlayers })
                        : '';
                    hostsHTML += `
                        <div class="node-card ${focused ? 'focused' : ''}" data-idx="${index}">
                            <div class="node-info">
                                <span class="node-name">${host.hostName || host.address}</span>
                                <span class="node-subtitle">${host.address}:${host.port}${host.world ? ' | ' + host.world : ''}</span>
                            </div>
                            <span class="node-badge">${seats || T('Multiplayer.lan.join')}</span>
                        </div>
                    `;
                });
            }

            container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page" style="justify-content:flex-start;">
                        <div class="page-header-bar">
                            <button class="back-button" id="mp-lan-back">${T('Multiplayer.back')}</button>
                            <h2 class="title">${T('Multiplayer.lan.title')}</h2>
                        </div>

                        <div class="mp-status-bar">
                            <span class="status-pulse ${statusClass}"></span>
                            <span>${T('Multiplayer.linkStatus')}: ${statusLabel}</span>
                        </div>

                        <div class="console-section">
                            <div class="console-row">
                                <span class="row-lbl">${T('Multiplayer.lan.thisMachine')}</span>
                                <span class="row-val">${addressLine}</span>
                            </div>
                            <div class="console-row">
                                <span class="row-lbl">${T('Multiplayer.lan.world')}</span>
                                <span class="row-val">${(window.WorldManager && window.WorldManager.activeWorldName) || '-'}</span>
                            </div>
                        </div>

                        <div class="action-deck">
                            ${buttonsHTML}
                        </div>

                        <div class="console-log" ${this._isError ? 'style="color:var(--text-cost-bad);"' : ''}>${this._statusMessage}</div>
                    </div>

                    <div class="right-page" style="justify-content:flex-start;gap:0;">
                        <div class="page-header-bar">
                            <h2 class="title">${T('Multiplayer.lan.hostsOnThisNetwork')}</h2>
                        </div>
                        <div class="roster-viewport">
                            ${hostsHTML}
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('mp-lan-back')?.addEventListener('click', () => {
                SoundManager.playCancel();
                this.popScene();
            });
            container.querySelectorAll('.action-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = rows.findIndex(r => r.id === btn.getAttribute('data-row'));
                    this.executeMenuRow();
                });
            });
            container.querySelectorAll('.node-card').forEach((card) => {
                card.addEventListener('click', () => {
                    this._activeArea = 'hosts';
                    this._selectedHostIndex = parseInt(card.getAttribute('data-idx'), 10);
                    this.commandJoinSelected();
                });
            });
        }

        updateUILanInput() {
            const rows = this.menuRows();
            if (this._activeArea === 'menu') {
                if (Input.isRepeated('down')) {
                    this._selectedIndex = (this._selectedIndex + 1) % rows.length;
                    SoundManager.playCursor();
                    this.refreshUILan();
                } else if (Input.isRepeated('up')) {
                    this._selectedIndex = (this._selectedIndex - 1 + rows.length) % rows.length;
                    SoundManager.playCursor();
                    this.refreshUILan();
                } else if (Input.isRepeated('right') && this._hosts.length > 0) {
                    this._activeArea = 'hosts';
                    this._selectedHostIndex = 0;
                    SoundManager.playCursor();
                    this.refreshUILan();
                } else if (Input.isTriggered('ok')) {
                    this.executeMenuRow();
                } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                    SoundManager.playCancel();
                    this.popScene();
                }
            } else {
                if (Input.isRepeated('down')) {
                    this._selectedHostIndex = (this._selectedHostIndex + 1) % Math.max(1, this._hosts.length);
                    SoundManager.playCursor();
                    this.refreshUILan();
                } else if (Input.isRepeated('up')) {
                    this._selectedHostIndex = (this._selectedHostIndex - 1 + Math.max(1, this._hosts.length)) % Math.max(1, this._hosts.length);
                    SoundManager.playCursor();
                    this.refreshUILan();
                } else if (Input.isRepeated('left') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    this._activeArea = 'menu';
                    SoundManager.playCancel();
                    this.refreshUILan();
                } else if (Input.isTriggered('ok')) {
                    this.commandJoinSelected();
                }
            }
        }

        executeMenuRow() {
            const row = this.menuRows()[this._selectedIndex];
            if (!row) return;
            SoundManager.playOk();
            if (row.id === 'host') this.commandHost();
            else if (row.id === 'scan') this.commandScan();
            else if (row.id === 'leave') this.commandLeave();
        }

        updateStatus(text, isError = false) {
            this._statusMessage = text;
            this._isError = isError;
            if (isError) SoundManager.playBuzzer();
            this.refreshUILan();
        }

        commandScan() {
            if (this._scanning) return;
            if (!LanSession.isAvailable()) {
                this.updateStatus(T('Multiplayer.lan.unavailable'), true);
                return;
            }
            this._scanning = true;
            this._hosts = [];
            this.updateStatus(T('Multiplayer.lan.searching'));
            LanDiscovery.scan((host, all) => {
                this._hosts = all;
                this.refreshUILan();
            }).then((hosts) => {
                this._scanning = false;
                this._hosts = hosts;
                this.updateStatus(hosts.length
                    ? T('Multiplayer.lan.foundHosts', { count: hosts.length })
                    : T('Multiplayer.lan.noHostsFound'));
            });
        }

        commandHost() {
            if (!LanSession.isAvailable()) {
                this.updateStatus(T('Multiplayer.lan.unavailable'), true);
                return;
            }
            this.updateStatus(T('Multiplayer.lan.starting'));
            LanSession.host().then(() => {
                this.updateStatus(T('Multiplayer.lan.hostingOn', {
                    address: LanSession.localAddresses()[0] || '127.0.0.1',
                    port: LanSession.hostPort
                }));
            }).catch((e) => {
                LanSession.stopHost();
                LanSession.active = false;
                this.updateStatus(T('Multiplayer.lan.hostFailed', { reason: (e && e.message) || '' }), true);
            });
        }

        commandJoinSelected() {
            const host = this._hosts[this._selectedHostIndex];
            if (!host) { SoundManager.playBuzzer(); return; }
            SoundManager.playOk();
            this.updateStatus(T('Multiplayer.lan.joining', { name: host.hostName || host.address }));
            LanSession.join(host.address, host.port).catch((e) => {
                LanSession.active = false;
                this.updateStatus(T('Multiplayer.lan.joinFailed', { reason: (e && e.message) || '' }), true);
            });
        }

        commandLeave() {
            LanSession.leave();
            this.updateStatus(T('Multiplayer.lan.left'));
        }

        // Reached from NetworkManager_Server once the login is acknowledged.
        onConnectionSuccess() {
            this.updateStatus(T('Multiplayer.syncing'));
            SoundManager.playOk();
            $gameSwitches.setValue(66, true, true);
            $gameSwitches.setValue(67, true, true);
            setTimeout(() => SceneManager.goto(Scene_Map), 1200);
        }
    }

    window.Scene_MultiplayerLan = Scene_MultiplayerLan;



    // ----------------------------------------------------------------------------
    // Scene_Multiplayer
    // ----------------------------------------------------------------------------
    class Scene_Multiplayer extends Scene_MenuBase {
        constructor() {
            super();
            this._serverUrl = localStorage.getItem('gmn_mp_serverUrl') || params.serverUrl || 'wss://hypernet-explorer-signaling-server.onrender.com';
            this._roomCode = NetworkManager.instance.roomId || '';
            this._followLeader = localStorage.getItem('gmn_mp_followLeader') !== 'false';

            this._activeArea = 'menu';
            this._selectedIndex = 0;
            this._selectedPlayerIndex = 0;
            this._activeTab = 0;
            this._statusMessage = '';
        }

        create() {
            super.create();
            this.createHelpWindow();
            this.createInputWindow();
            this.createStatusWindow();
            if (NetworkMode === 'WebSocket') {
                this.createPlayerListWindow();
                this.createPartyWindow();
            }
            if (NetworkManager.instance.isMultiplayer() && NetworkMode === 'Steamworks') {
                this._statusMessage = T('Multiplayer.connectedToLobby', { id: NetworkManager.instance.roomId });
            }

            if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }
            if (this._inputWindow) { this._inputWindow.deactivate(); this._inputWindow.hide(); }
            if (this._statusWindow) { this._statusWindow.hide(); }
            if (this._playerListWindow) { this._playerListWindow.deactivate(); this._playerListWindow.hide(); }
            if (this._partyWindow) { this._partyWindow.deactivate(); this._partyWindow.hide(); }

            this.initUIMultiplayerDOM();
            this.refreshUIMultiplayer();
        }

        update() {
            super.update();
            NetworkManager.instance.pollPackets();
            this.refreshUIMultiplayer();
            this.updateUIMultiplayerInput();
        }

        terminate() {
            const container = document.getElementById("mp-container");
            if (container) container.remove();
            super.terminate();
        }

        initUIMultiplayerDOM() {
            if (!document.getElementById("mp-container")) {
                const container = document.createElement("div");
                container.id = "mp-container";
                container.oncontextmenu = () => false;
                document.body.appendChild(container);
            }
        }

        refreshUIMultiplayer() {
            const container = document.getElementById("mp-container");
            if (!container) return;

            const nm = NetworkManager.instance;
            const connected = nm.isMultiplayer();
            const lang = ConfigManager.language || 'en';
            const isIt = lang === 'it';

            // Pulse status
            const statusClass = connected ? "online" : "offline";
            const statusLabel = connected ? (T('Multiplayer.online')) : (T('Multiplayer.offline'));

            // Left Console Rows
            let configRowsHTML = "";
            let actionBtnsHTML = "";

            if (NetworkMode === 'WebSocket') {
                const rowUrlFocused = this._activeArea === 'menu' && this._selectedIndex === 0;
                configRowsHTML += `
                    <div class="console-row ${rowUrlFocused ? 'focused' : ''}" id="row-url">
                        <span class="row-lbl">${T('Multiplayer.serverUrl')}</span>
                        <span class="row-val">${this._serverUrl}</span>
                    </div>
                `;

                const btnActionFocused = this._activeArea === 'menu' && this._selectedIndex === 1;
                if (connected) {
                    actionBtnsHTML += `
                        <div class="action-btn disconnect ${btnActionFocused ? 'focused' : ''}" id="btn-disconnect">
                            ${T('Multiplayer.severLinkDisconnect')}
                        </div>
                    `;
                } else {
                    actionBtnsHTML += `
                        <div class="action-btn ${btnActionFocused ? 'focused' : ''}" id="btn-connect">
                            ${T('Multiplayer.establishLinkConnect')}
                        </div>
                    `;
                }
            } else {
                // Steamworks Mode
                const rowCodeFocused = this._activeArea === 'menu' && this._selectedIndex === 0;
                configRowsHTML += `
                    <div class="console-row ${rowCodeFocused ? 'focused' : ''}" id="row-code">
                        <span class="row-lbl">${T('Multiplayer.lobbyId')}</span>
                        <span class="row-val">${this._roomCode || (T('Multiplayer.clickToEdit'))}</span>
                    </div>
                `;

                const rowFollowFocused = this._activeArea === 'menu' && this._selectedIndex === 1;
                configRowsHTML += `
                    <div class="console-row ${rowFollowFocused ? 'focused' : ''}" id="row-follow">
                        <span class="row-lbl">${T('Multiplayer.followLeader')}</span>
                        <span class="row-val" style="color:${this._followLeader ? 'var(--text-cost-ok)' : 'var(--text-cost-bad)'};">${this._followLeader ? 'ON' : 'OFF'}</span>
                    </div>
                `;

                if (connected) {
                    const isLeader = nm.isLeader;
                    let teleportBtnHTML = "";
                    if (!isLeader) {
                        const btnTeleportFocused = this._activeArea === 'menu' && this._selectedIndex === 2;
                        teleportBtnHTML = `
                            <div class="action-btn ${btnTeleportFocused ? 'focused' : ''}" id="btn-teleport">
                                ${T('Multiplayer.teleportToLeader')}
                            </div>
                        `;
                    }

                    const btnDisconnectIdx = isLeader ? 2 : 3;
                    const btnDisconnectFocused = this._activeArea === 'menu' && this._selectedIndex === btnDisconnectIdx;

                    actionBtnsHTML += `
                        ${teleportBtnHTML}
                        <div class="action-btn disconnect ${btnDisconnectFocused ? 'focused' : ''}" id="btn-disconnect">
                            ${T('Multiplayer.severLinkDisconnect')}
                        </div>
                    `;
                } else {
                    const btnCreateFocused = this._activeArea === 'menu' && this._selectedIndex === 2;
                    const btnJoinFocused = this._activeArea === 'menu' && this._selectedIndex === 3;

                    actionBtnsHTML += `
                        <div class="action-btn ${btnCreateFocused ? 'focused' : ''}" id="btn-create">
                            ${T('Multiplayer.forgeSteamLobby')}
                        </div>
                        <div class="action-btn ${btnJoinFocused ? 'focused' : ''}" id="btn-join">
                            ${T('Multiplayer.joinLobbyById')}
                        </div>
                    `;
                }
            }

            // Right Console Comms / Roster lists
            let rosterTabsHTML = "";
            let rosterListHTML = "";

            if (NetworkMode === 'WebSocket') {
                const tab1Active = this._activeTab === 0 ? "active" : "";
                const tab2Active = this._activeTab === 1 ? "active" : "";

                rosterTabsHTML = `
                    <div class="roster-tabs">
                        <div class="roster-tab ${tab1Active}" data-tab="0">${T('Multiplayer.activeNodes')}</div>
                        <div class="roster-tab ${tab2Active}" data-tab="1">${T('Multiplayer.partyPockets')}</div>
                    </div>
                `;

                if (this._activeTab === 0) {
                    // Node Catalog List
                    const myId = nm.myId;
                    const partyMembers = nm.isInParty() ? nm.party.members : [];
                    const activePlayers = Array.from(nm.players.entries()).filter(([id, _]) => id !== myId && !partyMembers.includes(id)).map(([id, info]) => ({ id, info }));

                    if (activePlayers.length === 0) {
                        rosterListHTML = `
                            <div class="item-grid-empty">
                                ${T('Multiplayer.noOtherNodesDetected')}
                            </div>
                        `;
                    } else {
                        activePlayers.forEach((player, index) => {
                            const isFocused = this._activeArea === 'roster' && this._selectedPlayerIndex === index;
                            rosterListHTML += `
                                <div class="node-card ${isFocused ? 'focused' : ''}" data-idx="${index}">
                                    ${this.drawNodeAvatarHTML(player.info.faceName, player.info.faceIndex)}
                                    <div class="node-info">
                                        <span class="node-name">${player.info.name}</span>
                                        <span class="node-subtitle">Map: ${player.info.mapId}</span>
                                    </div>
                                    <span class="node-badge">${T('Multiplayer.ui.invite')}</span>
                                </div>
                            `;
                        });
                    }
                } else {
                    // Party List
                    if (nm.isInParty()) {
                        nm.party.members.forEach((memberId, index) => {
                            const player = nm.players.get(memberId);
                            if (player) {
                                let label =T('Multiplayer.member');
                                if (memberId === nm.party.leaderId) label =T('Multiplayer.leader');
                                if (memberId === nm.myId) label += ` (${T('Multiplayer.you')})`;

                                rosterListHTML += `
                                    <div class="node-card" style="cursor:default;">
                                        ${this.drawNodeAvatarHTML(player.faceName, player.faceIndex)}
                                        <div class="node-info">
                                            <span class="node-name">${player.name}</span>
                                            <span class="node-subtitle">Map: ${player.mapId}</span>
                                        </div>
                                        <span class="node-badge">${label}</span>
                                    </div>
                                `;
                            }
                        });

                        const isLeaveFocused = this._activeArea === 'roster' && this._selectedPlayerIndex === nm.party.members.length;
                        rosterListHTML += `
                            <div class="action-btn disconnect ${isLeaveFocused ? 'focused' : ''}" id="btn-leave" style="margin-top:16px;">
                                ${T('Multiplayer.leaveParty')}
                            </div>
                        `;
                    } else {
                        rosterListHTML = `<div class="item-grid-empty">${T('Multiplayer.youAreNotCurrentlyTethered')}</div>`;
                    }
                }
            } else {
                // Steamworks Lobby Roster List
                rosterTabsHTML = `
                    <div class="roster-tabs">
                        <div class="roster-tab active" style="cursor:default;">${T('Multiplayer.lobbyRoster')}</div>
                    </div>
                `;

                const lobbyPlayers = [];
                for (const [id, info] of nm.players.entries()) {
                    lobbyPlayers.push({ id, info });
                }

                if (lobbyPlayers.length === 0) {
                    rosterListHTML = `<div class="item-grid-empty">${T('Multiplayer.noOtherNodesConnected')}</div>`;
                } else {
                    lobbyPlayers.forEach((player, index) => {
                        let roleLabel =T('Multiplayer.guest');
                        if (player.id === nm.getCurrentLeaderId()) roleLabel =T('Multiplayer.host');
                        if (player.id === nm.myId) roleLabel += ` (${T('Multiplayer.you')})`;

                        rosterListHTML += `
                            <div class="node-card" style="cursor:default;">
                                ${this.drawNodeAvatarHTML(player.info.faceName, player.info.faceIndex)}
                                <div class="node-info">
                                    <span class="node-name">${player.info.name}</span>
                                    <span class="node-subtitle">${player.info.className || T('Multiplayer.adventurer')} | ${T('Multiplayer.mapLabel')} ${player.info.mapId || T('Multiplayer.unknownMap')}</span>
                                </div>
                                <span class="node-badge">${roleLabel}</span>
                            </div>
                        `;
                    });
                }
            }

            container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page" style="justify-content:flex-start;">
                        <div class="page-header-bar">
                            <button class="back-button" id="mp-back">${T('Multiplayer.back')}</button>
                            <h2 class="title">${T('Multiplayer.linkConsole')}</h2>
                        </div>

                        <div class="mp-status-bar">
                            <span class="status-pulse ${statusClass}"></span>
                            <span>${T('Multiplayer.linkStatus')}: ${statusLabel}</span>
                        </div>

                        <div class="console-section">
                            ${configRowsHTML}
                        </div>

                        <div class="action-deck">
                            ${actionBtnsHTML}
                        </div>

                        <div class="console-log">${this._statusMessage}</div>
                    </div>

                    <div class="right-page" style="justify-content:flex-start;gap:0;">
                        <div class="page-header-bar">
                            <h2 class="title">${T('Multiplayer.commsRoster')}</h2>
                        </div>
                        ${rosterTabsHTML}
                        <div class="roster-viewport">
                            ${rosterListHTML}
                        </div>
                    </div>
                </div>
            `;

            // Setup DOM click events
            document.getElementById('mp-back')?.addEventListener('click', () => {
                SoundManager.playCancel();
                this.popScene();
            });

            const urlRow = container.querySelector("#row-url");
            if (urlRow) {
                urlRow.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = 0;
                    this.promptChangeUrl();
                });
            }

            const codeRow = container.querySelector("#row-code");
            if (codeRow) {
                codeRow.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = 0;
                    this.promptChangeCode();
                });
            }

            const followRow = container.querySelector("#row-follow");
            if (followRow) {
                followRow.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = 1;
                    this.toggleFollowLeader();
                });
            }

            const connectBtn = container.querySelector("#btn-connect");
            if (connectBtn) {
                connectBtn.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = 1;
                    this.executeMenuAction();
                });
            }

            const disconnectBtn = container.querySelector("#btn-disconnect");
            if (disconnectBtn) {
                disconnectBtn.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    const idx = NetworkMode === 'WebSocket' ? 1 : (nm.isLeader ? 2 : 3);
                    this._selectedIndex = idx;
                    this.executeMenuAction();
                });
            }

            const createBtn = container.querySelector("#btn-create");
            if (createBtn) {
                createBtn.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = 2;
                    this.executeMenuAction();
                });
            }

            const joinBtn = container.querySelector("#btn-join");
            if (joinBtn) {
                joinBtn.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = 3;
                    this.executeMenuAction();
                });
            }

            const teleportBtn = container.querySelector("#btn-teleport");
            if (teleportBtn) {
                teleportBtn.addEventListener("click", () => {
                    this._activeArea = 'menu';
                    this._selectedIndex = 2;
                    this.executeMenuAction();
                });
            }

            // Click tabs (WebSocket only)
            const tabs = container.querySelectorAll(".roster-tab");
            tabs.forEach(tab => {
                tab.addEventListener("click", () => {
                    const tabId = parseInt(tab.getAttribute("data-tab"));
                    this._activeTab = tabId;
                    this._activeArea = 'roster';
                    this._selectedPlayerIndex = 0;
                    SoundManager.playOk();
                    this.refreshUIMultiplayer();
                });
            });

            // Click Node Card
            const nodeCards = container.querySelectorAll(".node-card");
            nodeCards.forEach(card => {
                card.addEventListener("click", () => {
                    const idx = parseInt(card.getAttribute("data-idx"));
                    this._activeArea = 'roster';
                    this._selectedPlayerIndex = idx;
                    SoundManager.playOk();
                    this.executeRosterAction();
                });
            });

            const leaveBtn = container.querySelector("#btn-leave");
            if (leaveBtn) {
                leaveBtn.addEventListener("click", () => {
                    this._activeArea = 'roster';
                    this._selectedPlayerIndex = nm.party.members.length;
                    this.executeRosterAction();
                });
            }
        }

        drawNodeAvatarHTML(faceName, faceIndex) {
            if (!faceName) return '<div class="node-avatar" style="background:var(--border-subtle);"></div>';
            const path = `img/busts/${faceName}.png`;
            return `
                <div class="node-avatar" style="
                    background-image: url('${path}');
                    background-size: 220%;
                    background-position: 50% 12%;
                    background-repeat: no-repeat;
                "></div>
            `;
        }

        // =============================================================================
        // Keyboard and Arrow Selection mappings
        // =============================================================================
        updateUIMultiplayerInput() {
            const nm = NetworkManager.instance;
            const connected = nm.isMultiplayer();

            // L1/R1 cycle the roster tabs from anywhere in the scene
            if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
                this._activeTab = (this._activeTab + (Input.isTriggered('pageup') ? -1 : 1) + 2) % 2;
                this._selectedPlayerIndex = 0;
                SoundManager.playCursor();
                this.refreshUIMultiplayer();
                return;
            }

            if (this._activeArea === 'menu') {
                let maxRows = 2; // Default WebSocket: [0: url, 1: action]
                if (NetworkMode === 'Steamworks') {
                    if (connected) {
                        maxRows = nm.isLeader ? 3 : 4; // Guest: [0: id, 1: follow, 2: teleport, 3: sever], Host: [0: id, 1: follow, 2: sever]
                    } else {
                        maxRows = 4; // Disconnected: [0: id, 1: follow, 2: forge, 3: join]
                    }
                }

                if (Input.isRepeated('down')) {
                    this._selectedIndex = (this._selectedIndex + 1) % maxRows;
                    SoundManager.playCursor();
                    this.refreshUIMultiplayer();
                } else if (Input.isRepeated('up')) {
                    this._selectedIndex = (this._selectedIndex - 1 + maxRows) % maxRows;
                    SoundManager.playCursor();
                    this.refreshUIMultiplayer();
                } else if (Input.isRepeated('right')) {
                    // Jump to roster side
                    this._activeArea = 'roster';
                    this._selectedPlayerIndex = 0;
                    SoundManager.playOk();
                    this.refreshUIMultiplayer();
                } else if (Input.isTriggered('ok')) {
                    SoundManager.playOk();
                    this.executeMenuRowSelect();
                } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    // TouchInput.isCancelled() is the right mouse button.
                    this.popScene();
                    SoundManager.playCancel();
                }
            } else if (this._activeArea === 'roster') {
                if (NetworkMode === 'WebSocket') {
                    const myId = nm.myId;
                    const partyMembers = nm.isInParty() ? nm.party.members : [];
                    const activePlayers = Array.from(nm.players.entries()).filter(([id, _]) => id !== myId && !partyMembers.includes(id)).map(([id, info]) => ({ id, info }));

                    let maxItems = this._activeTab === 0 ? activePlayers.length : (nm.isInParty() ? nm.party.members.length + 1 : 0);

                    if (Input.isRepeated('down')) {
                        if (maxItems > 0) {
                            this._selectedPlayerIndex = (this._selectedPlayerIndex + 1) % maxItems;
                            SoundManager.playCursor();
                            this.refreshUIMultiplayer();
                        }
                    } else if (Input.isRepeated('up')) {
                        if (maxItems > 0) {
                            this._selectedPlayerIndex = (this._selectedPlayerIndex - 1 + maxItems) % maxItems;
                            SoundManager.playCursor();
                            this.refreshUIMultiplayer();
                        }
                    } else if (Input.isRepeated('left')) {
                        if (this._selectedPlayerIndex === 0) {
                            this._activeArea = 'menu';
                            SoundManager.playCancel();
                        } else {
                            this._activeTab = (this._activeTab - 1 + 2) % 2;
                            this._selectedPlayerIndex = 0;
                            SoundManager.playCursor();
                        }
                        this.refreshUIMultiplayer();
                    } else if (Input.isRepeated('right')) {
                        this._activeTab = (this._activeTab + 1) % 2;
                        this._selectedPlayerIndex = 0;
                        SoundManager.playCursor();
                        this.refreshUIMultiplayer();
                    } else if (Input.isTriggered('ok')) {
                        this.executeRosterAction();
                    } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                        this._activeArea = 'menu';
                        SoundManager.playCancel();
                        this.refreshUIMultiplayer();
                    }
                } else {
                    // Steamworks Mode roster
                    if (Input.isRepeated('left') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                        this._activeArea = 'menu';
                        SoundManager.playCancel();
                        this.refreshUIMultiplayer();
                    }
                }
            }
        }

        executeMenuRowSelect() {
            if (this._selectedIndex === 0) {
                if (NetworkMode === 'WebSocket') this.promptChangeUrl();
                else this.promptChangeCode();
            } else if (this._selectedIndex === 1) {
                if (NetworkMode === 'WebSocket') this.executeMenuAction();
                else this.toggleFollowLeader();
            } else {
                this.executeMenuAction();
            }
        }

        promptChangeUrl() {
            if (NetworkManager.instance.isMultiplayer()) { SoundManager.playBuzzer(); return; }
            const url = prompt(T('Multiplayer.enterServerWebsocketUrl'), this._serverUrl);
            if (url !== null) {
                this._serverUrl = url;
                localStorage.setItem('gmn_mp_serverUrl', url);
                this.updateStatus(T('Multiplayer.serverUrlSet', { url: url }));
                this.refreshUIMultiplayer();
            }
        }

        promptChangeCode() {
            if (NetworkManager.instance.isMultiplayer()) { SoundManager.playBuzzer(); return; }
            const code = prompt(T('Multiplayer.enterSteamLobbyId'), this._roomCode);
            if (code !== null) {
                this._roomCode = code.toUpperCase();
                this.updateStatus(T('Multiplayer.lobbyIdSet', { id: this._roomCode }));
                this.refreshUIMultiplayer();
            }
        }

        toggleFollowLeader() {
            this._followLeader = !this._followLeader;
            localStorage.setItem('gmn_mp_followLeader', this._followLeader);
            if (NetworkManager.instance && NetworkMode === 'Steamworks') {
                NetworkManager.instance.followLeader = this._followLeader;
            }
            this.updateStatus(T('Multiplayer.followLeaderState', { state: this._followLeader ? T('Multiplayer.on') : T('Multiplayer.off') }));
            this.refreshUIMultiplayer();
        }

        executeMenuAction() {
            const nm = NetworkManager.instance;
            const connected = nm.isMultiplayer();

            if (NetworkMode === 'WebSocket') {
                if (connected) {
                    this.commandDisconnect();
                } else {
                    this.commandConnectServer();
                }
            } else {
                // Steamworks Mode
                if (connected) {
                    const isLeader = nm.isLeader;
                    if (!isLeader && this._selectedIndex === 2) {
                        this.commandTeleportToLeader();
                    } else {
                        this.commandDisconnect();
                    }
                } else {
                    if (this._selectedIndex === 2) {
                        this.commandCreateSteam();
                    } else if (this._selectedIndex === 3) {
                        this.commandJoinSteam();
                    }
                }
            }
        }

        executeRosterAction() {
            const nm = NetworkManager.instance;
            if (NetworkMode === 'WebSocket') {
                if (this._activeTab === 0) {
                    // Send Party Invite
                    const myId = nm.myId;
                    const partyMembers = nm.isInParty() ? nm.party.members : [];
                    const activePlayers = Array.from(nm.players.entries()).filter(([id, _]) => id !== myId && !partyMembers.includes(id)).map(([id, info]) => ({ id, info }));
                    const player = activePlayers[this._selectedPlayerIndex];
                    if (player) {
                        nm.sendPartyInvite(player.id);
                        this.updateStatus(T('Multiplayer.inviteSent', { name: player.info.name }));
                        SoundManager.playOk();
                    }
                } else {
                    // Leave Party button
                    if (nm.isInParty() && this._selectedPlayerIndex === nm.party.members.length) {
                        this.onLeaveParty();
                    }
                }
            }
        }

        // =============================================================================
        // Link engine integrations
        // =============================================================================
        commandConnectServer() {
            if (!this._serverUrl) { this.updateStatus(T('Multiplayer.serverUrlEmpty'), true); return; }
            NetworkManager.instance.connect(this._serverUrl).catch(() => { });
        }

        commandCreateSteam() {
            this.updateStatus(T('Multiplayer.creatingLobby'));
            NetworkManager.instance.initiateCreateRoom(this._followLeader);
        }

        async commandJoinSteam() {
            if (!this._roomCode) { this.updateStatus(T('Multiplayer.lobbyIdEmpty'), true); return; }
            this.updateStatus(T('Multiplayer.joiningLobby', { id: this._roomCode }));
            if (NetworkManager.instance.isMultiplayer()) {
                NetworkManager.instance.disconnect(true);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            NetworkManager.instance.initiateJoinRoom(this._roomCode, this._followLeader);
        }

        commandDisconnect() {
            const shouldRestoreState = NetworkMode === 'Steamworks' ? !NetworkManager.instance.isLeader : true;
            NetworkManager.instance.disconnect(shouldRestoreState);
            this._roomCode = '';
            this.updateStatus(T('Multiplayer.disconnectedReady'));
            this.refreshUIMultiplayer();
        }

        commandTeleportToLeader() {
            const nm = NetworkManager.instance;
            if (!nm.isMultiplayer() || nm.isLeader) { this.updateStatus(T('Multiplayer.cannotTeleport'), true); return; }
            if (!nm.getCurrentLeaderId()) { this.updateStatus(T('Multiplayer.noLeader'), true); return; }
            nm.requestLeaderTeleport();
            this.updateStatus(T('Multiplayer.teleporting'));
            SoundManager.playOk();
            setTimeout(() => SceneManager.goto(Scene_Map), 1000);
        }

        onLeaveParty() {
            NetworkManager.instance.sendPartyLeave();
            this.updateStatus(T('Multiplayer.leftParty'));
            SoundManager.playOk();
            this._activeTab = 0;
            this.refreshUIMultiplayer();
        }

        updateStatus(text, isError = false) {
            this._statusMessage = text;
            if (isError) SoundManager.playBuzzer();
        }

        onConnectionSuccess() {
            this.updateStatus(T('Multiplayer.syncing'));
            SoundManager.playOk();
            $gameSwitches.setValue(66, true, true);
            setTimeout(() => SceneManager.goto(Scene_Map), 1500);
        }

        onRoomSetupSuccess(isLeader) {
            if (isLeader) {
                this._roomCode = NetworkManager.instance.roomId;
                this.updateStatus(T('Multiplayer.lobbyCreated', { id: this._roomCode }));
            } else {
                this.updateStatus(T('Multiplayer.joiningGame'));
            }
            SoundManager.playOk();
            $gameSwitches.setValue(66, true, true);
            setTimeout(() => SceneManager.goto(Scene_Map), 2000);
        }

        createHelpWindow() {
            const rect = new Rectangle(0, this.mainAreaTop(), Graphics.boxWidth, this.calcWindowHeight(2, false));
            this._helpWindow = new Window_Help(rect);
            this.addWindow(this._helpWindow);
        }

        createInputWindow() {
            const rect = new Rectangle(0, 0, 400, 300);
            this._inputWindow = new Window_MultiplayerInput(rect);
            this.addWindow(this._inputWindow);
        }

        createStatusWindow() {
            const rect = new Rectangle(0, 0, 400, 300);
            this._statusWindow = new Window_MultiplayerStatus(rect);
            this.addWindow(this._statusWindow);
        }

        createPlayerListWindow() {
            const rect = new Rectangle(0, 0, 400, 300);
            this._playerListWindow = new Window_MultiplayerPlayerList(rect);
            this.addWindow(this._playerListWindow);
        }

        createPartyWindow() {
            const rect = new Rectangle(0, 0, 400, 300);
            this._partyWindow = new Window_MultiplayerParty(rect);
            this.addWindow(this._partyWindow);
        }
    }

    window.Scene_Multiplayer = Scene_Multiplayer;


    // ============================================================================
    // STUB COMPATIBILITY WINDOW CLASSES
    // ============================================================================
    class Window_MultiplayerInput extends Window_Selectable {
        serverUrl() { return ''; }
        roomCode() { return ''; }
        followLeader() { return true; }
        setServerUrl() { }
        setRoomCode() { }
        setFollowLeader() { }
        currentSymbol() { return ''; }
        refresh() { }
    }

    class Window_MultiplayerStatus extends Window_Base {
        refresh() { }
    }

    class Window_MultiplayerPlayerList extends Window_Selectable {
        selectedPlayer() { return null; }
        refresh() { }
    }

    class Window_MultiplayerParty extends Window_Selectable {
        refresh() { }
    }

    // Party Invitation Popups
    class PartyUIManager {
        constructor() { this._invitationQueue = []; this._currentWindow = null; }
        static get instance() { if (!this._instance) this._instance = new PartyUIManager(); return this._instance; }
        showInvitation(inviterId, inviterName) { this._invitationQueue.push({ inviterId, inviterName }); }
        update() {
            if (NetworkMode !== 'WebSocket') return;
            if (this._currentWindow && this._currentWindow.isClosed()) {
                const scene = SceneManager._scene;
                if (scene && scene._invitationWindow === this._currentWindow) { scene.removeWindow(this._currentWindow); scene._invitationWindow = null; }
                this._currentWindow = null;
            }
            if (!this._currentWindow && this._invitationQueue.length > 0) {
                const scene = SceneManager._scene;
                if (scene && scene.isReady() && !$gameMessage.isBusy() && scene.isMapScene && scene.isMapScene()) {
                    const invite = this._invitationQueue.shift();
                    this._currentWindow = new Window_PartyInvitation(new Rectangle(0, 0, 400, 120), invite);
                    this._currentWindow.x = (Graphics.boxWidth - this._currentWindow.width) / 2;
                    this._currentWindow.y = 20;
                    scene.addWindow(this._currentWindow);
                    scene._invitationWindow = this._currentWindow;
                }
            }
        }
    }
    window.PartyUIManager = PartyUIManager;

    class Window_PartyInvitation extends Window_Command {
        constructor(rect, inviteData) { super(rect); this._invite = inviteData; this.openness = 0; this.open(); this.activate(); }
        makeCommandList() { this.addCommand(T('Multiplayer.accept'), "accept", true); this.addCommand(T('Multiplayer.decline'), "decline", true); }
        windowWidth() { return 400; }
        drawItem(index) {
            if (index === 0) this.drawTextEx(T('Multiplayer.invitedYou', { name: this._invite.inviterName }), this.itemPadding(), 0);
            const rect = this.itemLineRect(index + 1);
            const enabled = this.isCommandEnabled(this.commandSymbol(index));
            this.changePaintOpacity(enabled);
            this.drawText(this.commandName(index), rect.x, rect.y, rect.width, 'center');
        }
        itemRect(index) { return super.itemRect(index + 1); }
        processOk() {
            if (this.currentSymbol() === 'accept') NetworkManager.instance.sendPartyAccept(this._invite.inviterId);
            SoundManager.playOk(); this.close();
        }
        processCancel() { this.close(); }
    }


    class Window_PlayerList extends Window_Base {
        constructor(rect) { super(rect); this.opacity = 0; this._bustSprites = []; this.refresh(); }
        refresh() {
            this.contents.clear();
            for (const sprite of this._bustSprites) if (sprite.parent) this.removeChild(sprite);
            this._bustSprites = [];
            const nm = NetworkManager.instance;
            if (!nm.isMultiplayer()) return;

            let playersToDisplay = [];
            if (NetworkMode === 'WebSocket' && nm.isInParty()) {
                for (const memberId of nm.party.members) {
                    const playerInfo = nm.players.get(memberId);
                    if (playerInfo) playersToDisplay.push(playerInfo);
                }
            } else {
                const currentMapId = $gameMap.mapId();
                for (const playerInfo of nm.players.values()) {
                    if (playerInfo.mapId === currentMapId || NetworkMode === 'Steamworks') playersToDisplay.push(playerInfo);
                }
            }

            const bustSize = 64;
            const itemHeight = Math.max(this.lineHeight() * 2, bustSize);
            this.height = this.fittingHeight(playersToDisplay.length);
            this.createContents();

            playersToDisplay.forEach((player, index) => {
                if (!player) return;
                const y = index * (itemHeight + 8);
                this.drawFace(player.faceName, player.faceIndex, 0, y, bustSize, bustSize);
                this.drawText(player.name, bustSize + 10, y, this.contentsWidth() - bustSize - 10);
            });
        }
        fittingHeight(numItems) { return numItems * (Math.max(this.lineHeight() * 2, 64) + 8) + this.padding * 2; }
        update() { super.update(); this.visible = NetworkManager.instance.isMultiplayer(); }
    }


    // ============================================================================
    // GAME HOOKS & INTEGRATIONS
    // ============================================================================
    // With networked play greyed out, events that ask for the connections terminal land on
    // the mode picker instead, where Steam/Online read as unavailable.
    for (const key of [PLUGIN_NAME, LEGACY_PLUGIN_NAME]) {
        PluginManager.registerCommand(key, 'openConnectionsMenu',
            () => SceneManager.push(NETWORK_PLAY_ENABLED ? Scene_Multiplayer : Scene_MultiplayerTypeSelection));
    }

    const _SceneManager_updateMain = SceneManager.updateMain;
    SceneManager.updateMain = function () {
        _SceneManager_updateMain.apply(this, arguments);
        if (NetworkManager.instance.isMultiplayer()) {
            PartyUIManager.instance.update();
            BattleShare.update();
        }
    };

    const _Scene_Map_isMapScene = Scene_Map.prototype.isMapScene;
    Scene_Map.prototype.isMapScene = function () { return _Scene_Map_isMapScene.call(this) && !this._invitationWindow; };

    const _Game_Switches_setValue = Game_Switches.prototype.setValue;
    Game_Switches.prototype.setValue = function (switchId, value, fromNetwork = false) {
        if (this.value(switchId) === value) return;
        _Game_Switches_setValue.call(this, switchId, value);
        if (!fromNetwork) NetworkManager.instance.onSwitchChange(switchId, value);
    };

    const _Game_Variables_setValue = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function (variableId, value, fromNetwork = false) {
        if (this.value(variableId) === value) return;
        _Game_Variables_setValue.call(this, variableId, value);
        if (!fromNetwork) NetworkManager.instance.onVariableChange(variableId, value);
    };

    const _Game_SelfSwitches_setValue = Game_SelfSwitches.prototype.setValue;
    Game_SelfSwitches.prototype.setValue = function (key, value, fromNetwork = false) {
        const oldValue = this.value(key);
        _Game_SelfSwitches_setValue.call(this, key, value);
        // Steam lobbies always did this; a LAN session needs it just as much,
        // and the central-server mode gets it through the same door.
        if (!fromNetwork && oldValue !== value && NetworkManager.instance.onSelfSwitchChange) {
            const [mapId, eventId, switchType] = key;
            NetworkManager.instance.onSelfSwitchChange(mapId, eventId, switchType, value);
        }
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        MultiplayerManager.instance.update();
    };

    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded.call(this);
        MultiplayerManager.instance.onMapLoaded();
    };

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        this.createPlayerListWindow();
    };

    Scene_Map.prototype.createPlayerListWindow = function () {
        this._playerListWindow = new Window_PlayerList(new Rectangle(10, 100, 280, 100));
        this.addWindow(this._playerListWindow);
    };

    const _Game_Player_startMapEvent = Game_Player.prototype.startMapEvent;
    Game_Player.prototype.startMapEvent = function (x, y, triggers, normal) {
        if (!$gameMap.isEventRunning()) {
            for (const event of $gameMap.eventsXy(x, y)) {
                if (event.event().name.match(/^Player\d+$/)) continue;
                if (event.isTriggerIn(triggers) && event.isNormalPriority() === normal) { event.start(); return; }
            }
        }
    };

    const _Game_Event_updateSelfMovement = Game_Event.prototype.updateSelfMovement;
    Game_Event.prototype.updateSelfMovement = function () {
        if (NetworkManager.instance.isMultiplayer()) {
            // A remote player's body is driven by their packets and never by
            // its own route, whatever the mode.
            if (window.MultiplayerRemote.isRemoteEvent(this)) return;
            // On a LAN the map keeps living, but on ONE machine at a time: the
            // player driving this map walks its NPCs and monsters and the
            // others place them from the packets (MapSync). Alone on a map,
            // everyone drives their own.
            if (LanSession.active) {
                if (!MapSync.ownsMap()) return;
                return _Game_Event_updateSelfMovement.call(this);
            }
            if (NetworkMode === 'WebSocket') return;
            if (NetworkMode === 'Steamworks' && !NetworkManager.instance.isLeader && this.event().name !== 'Enemy') return;  // i18n-ignore  event name
        }
        _Game_Event_updateSelfMovement.call(this);
    };

    const _Game_Player_refresh = Game_Player.prototype.refresh;
    Game_Player.prototype.refresh = function () {
        _Game_Player_refresh.call(this);
        if (NetworkManager.instance.isMultiplayer()) {
            const networkManager = NetworkManager.instance;
            const myId = networkManager.myId;
            const myInfo = networkManager.players.get(myId);
            if (myId) {
                const newInfo = networkManager.createPlayerInfo();
                if (NetworkMode === 'WebSocket' || (myInfo && JSON.stringify(myInfo) !== JSON.stringify(newInfo))) {
                    networkManager.players.set(myId, newInfo);
                    if (NetworkMode === 'WebSocket') networkManager.send({ type: 'player-meta', info: newInfo });
                    else networkManager.broadcast({ type: 'player-meta', info: newInfo });
                }
            }
        }
    };

    // MapBattleMode fights are played out on the map instead of through
    // command301, so they announce themselves here: the others hide the sprite
    // of a player who is busy fighting, exactly as they do for an encounter.
    const _MBM_battleStateHook = () => {
        const MBM = window.MapBattleMode;
        if (!MBM || MBM._mpStateHooked) return;
        MBM._mpStateHooked = true;
        for (const [method, phase] of [['begin', 'start'], ['finish', 'end']]) {
            const original = MBM[method];
            if (typeof original !== 'function') continue;
            MBM[method] = function (...args) {
                const result = original.apply(this, args);
                if (LanSession.active) LanSession.relay('map-battle', { phase: phase });
                return result;
            };
        }
    };
    const _Scene_Map_start_mbmHook = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start_mbmHook.call(this);
        _MBM_battleStateHook();
    };

    // A monster that is gone is gone for everybody (MapSync).
    const _Game_Event_erase_mp = Game_Event.prototype.erase;
    Game_Event.prototype.erase = function () {
        const wasErased = this._erased;
        _Game_Event_erase_mp.call(this);
        if (!wasErased) MapSync.onEventErased(this);
    };

    // The battle scene, shared (BattleShare): announce, trade blows, leave.
    const _BattleManager_setup_mp = BattleManager.setup;
    BattleManager.setup = function (troopId, canEscape, canLose) {
        _BattleManager_setup_mp.call(this, troopId, canEscape, canLose);
        BattleShare.onBattleSetup();
    };

    const _BattleManager_endBattle_mp = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        _BattleManager_endBattle_mp.call(this, result);
        BattleShare.onBattleEnd(result);
    };

    const _Game_Action_apply_mp = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        _Game_Action_apply_mp.call(this, target);
        if (BattleShare.active()) BattleShare.onHit(this.subject(), target, target.result());
    };

    // A stand-in never chooses: its blows come over the wire.
    //
    // Game_Actor has no canInput() of its own in the engine, so defining one
    // here would SHADOW Game_Battler's for every actor, freezing in whatever
    // implementation happened to be current when this file loaded. That is not
    // hypothetical: IndividualBattleTurns.js loads after this plugin and
    // replaces Game_Battler#canInput precisely to drop the engine's TPB gate
    // (it also forces BattleManager.isTpb() true while charging no TPB bar), so
    // a captured copy answers "false" for every party member in every battle -
    // no command window, every character played by the auto-battle AI. The
    // chain is therefore walked at call time, never captured.
    const _Game_Actor_canInput_mp =
        Object.prototype.hasOwnProperty.call(Game_Actor.prototype, 'canInput')
            ? Game_Actor.prototype.canInput
            : null;
    Game_Actor.prototype.canInput = function () {
        if (BattleShare.isStandIn(this)) return false;
        return _Game_Actor_canInput_mp
            ? _Game_Actor_canInput_mp.call(this)
            : Game_Battler.prototype.canInput.call(this);
    };

    const _Game_Actor_makeActions_mp = Game_Actor.prototype.makeActions;
    Game_Actor.prototype.makeActions = function () {
        if (BattleShare.isStandIn(this)) { this.clearActions(); return; }
        _Game_Actor_makeActions_mp.call(this);
    };

    const _Game_Interpreter_command301 = Game_Interpreter.prototype.command301;
    Game_Interpreter.prototype.command301 = function (params) {
        if (NetworkManager.instance.isMultiplayer() && !BattleManager.isBattleTest()) {
            const packet = { type: 'player-state-change', state: 'battling', from: NetworkManager.instance.myId };
            if (NetworkMode === 'WebSocket') NetworkManager.instance.send(packet);
            else NetworkManager.instance.broadcast(packet);

            const originalCallback = this._branch[this._indent];
            this._branch[this._indent] = (result) => {
                const clearPacket = { type: 'player-state-change', state: 'idle', from: NetworkManager.instance.myId };
                if (NetworkMode === 'WebSocket') NetworkManager.instance.send(clearPacket);
                else NetworkManager.instance.broadcast(clearPacket);
                if (originalCallback) originalCallback(result);
            };
        }
        return _Game_Interpreter_command301.call(this, params);
    };

    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand(T('Multiplayer.menuCommand'), "multiplayer", true, 44);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("multiplayer", () => SceneManager.push(Scene_MultiplayerTypeSelection));
    };

    if (ShowPlayerNames) {
        const _Sprite_Character_initMembers = Sprite_Character.prototype.initMembers;
        Sprite_Character.prototype.initMembers = function () {
            _Sprite_Character_initMembers.call(this);
            this._nameplateSprite = null;
        };

        const _Sprite_Character_update = Sprite_Character.prototype.update;
        Sprite_Character.prototype.update = function () {
            _Sprite_Character_update.call(this);
            if (!this._character || !NetworkManager.instance.isMultiplayer()) {
                if (this._nameplateSprite) { this.removeChild(this._nameplateSprite); this._nameplateSprite = null; }
                return;
            }
            const eventId = this._character.eventId && this._character.eventId();
            const playerId = eventId ? MultiplayerManager.instance.eventPlayerMap.get(eventId) : null;
            if (playerId) {
                const playerInfo = NetworkManager.instance.players.get(playerId);
                if (playerInfo && !this._nameplateSprite) this.createNameplate(playerInfo.name || T('Multiplayer.playerNumbered', { id: playerId }));
            } else if (this._nameplateSprite) {
                this.removeChild(this._nameplateSprite); this._nameplateSprite = null;
            }
        };

        Sprite_Character.prototype.createNameplate = function (name) {
            this._nameplateSprite = new Sprite();
            this._nameplateSprite.bitmap = new Bitmap(200, 50);
            this._nameplateSprite.anchor.x = 0.5;
            this._nameplateSprite.anchor.y = 1;
            this._nameplateSprite.y = Number(NameplateConfig.yOffset || -50);

            const bitmap = this._nameplateSprite.bitmap;
            bitmap.fontSize = Number(NameplateConfig.fontSize || 18);
            bitmap.fontFace = NameplateConfig.fontFace || 'GameFont';
            bitmap.textColor = NameplateConfig.textColor || '#FFFFFF';
            bitmap.outlineColor = NameplateConfig.outlineColor || 'rgba(0, 0, 0, 0.7)';
            bitmap.outlineWidth = Number(NameplateConfig.outlineWidth || 3);
            bitmap.drawText(name, 0, 0, 200, 50, 'center');
            this.addChild(this._nameplateSprite);
        };
    }

    // ============================================================================
    // STEAM BOOT INIT + "JOIN GAME" LAUNCH HANDOFF
    // Runs last so NetworkManager_Steam (a non-hoisted class) is already defined.
    // ============================================================================
    // Best-effort init so Steam "Join Game" works even in the default WebSocket mode.
    // Quiet no-op when Steam is not running or the native module lacks multiplayer.
    initSteam();

    // If the game was launched via a friend's "Join Game" (Steam appends
    // "+connect_lobby <id>" to the launch args), queue it; SteamJoinRequest consumes
    // the join once the player is in-world on a map.
    const _launchLobbyId = parseConnectLobby(getLaunchArgv().join(' '));
    if (_launchLobbyId) SteamJoinRequest.handle(_launchLobbyId);
})();