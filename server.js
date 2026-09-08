//=============================================================================
// RPG Maker MZ Multiplayer Server for Centralized Architecture with Party System
// Author: OmniLex
// Version: 2.0.0
//=============================================================================

const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');

// The UDP port a LAN host answers discovery probes on. A client sweeping the
// local network broadcasts DISCOVERY_MAGIC here and every host in the same
// broadcast domain answers with its address, its world and its player count,
// so nobody ever has to read an IP address out loud.
const DISCOVERY_PORT = 41235;
const DISCOVERY_MAGIC = 'HYPERNET_LAN_DISCOVER';
const DISCOVERY_REPLY = 'HYPERNET_LAN_HOST';

// The whole server is one function so the game itself can run it in-process:
// hosting a LAN session boots this inside NW.js instead of asking the player to
// start a second program. Called with no options it behaves exactly as the
// standalone `node server.js` always did.
function startServer(options = {}) {

// Use the PORT environment variable provided by the host (Render.com, systemd unit,
// ...), or 8080 for local testing.
const PORT = options.port || process.env.PORT || 8080;
const HOST = options.host || process.env.HOST || '0.0.0.0';
// A LAN host announces itself over UDP; the public server does not.
const DISCOVERY = options.discovery === true;
// What a discovery reply says about this host: who is hosting and which world
// the session is played in. Guests adopt that world when they join.
let advertised = Object.assign({ hostName: '', world: null }, options.advertise || {});
// The host's world, handed to every guest at login so the whole session shares
// one world: its manifest, its public state and its world data files.
let worldPayload = options.world || null;

// Session capacity. The client plugin advertises "up to 64 players"; the cap is
// enforced here, not client-side. Override with MAX_PLAYERS for smaller playtests.
const MAX_PLAYERS = Math.min(64, Math.max(2, parseInt(options.maxPlayers || process.env.MAX_PLAYERS, 10) || 64));

// Plain HTTP is served alongside the socket so hosts and reverse proxies have a
// health endpoint to poll, and so a browser hitting the URL gets something back.
const httpServer = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/health' || path === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            players: players.size,
            maxPlayers: MAX_PLAYERS,
            parties: parties.size,
            uptime: Math.round(process.uptime())
        }));
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
});

const wss = new WebSocket.Server({ server: httpServer });

console.log(`Starting server on ${HOST}:${PORT} (max ${MAX_PLAYERS} players)...`);

// --- Server State ---
let nextPlayerId = 1;
let nextPartyId = 1;

// players: { playerId -> { ws: WebSocket, info: Object, partyId: number|null } }
const players = new Map();

// parties: { partyId -> { leaderId: number, members: [number], maxSize: 4 } }
const parties = new Map();

// The server's authoritative game state
const gameState = {
    switches: {},
    variables: {},
    selfSwitches: {}
};

const MAX_PARTY_SIZE = 4;

// --- Helper Functions ---

/**
 * Broadcasts a message to all connected clients except the originator.
 * @param {object} data The data object to send.
 * @param {number} [originatorId] The ID of the player who sent the message.
 */
function broadcast(data, originatorId = null) {
    const message = JSON.stringify(data);
    for (const [playerId, player] of players.entries()) {
        if (playerId !== originatorId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    }
}

/**
 * Sends a message to a specific player.
 * @param {number} playerId The target player's ID.
 * @param {object} data The data to send.
 */
function sendToPlayer(playerId, data) {
    const player = players.get(playerId);
    if (player && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(data));
    }
}

/**
 * Broadcasts a message to all members of a party.
 * @param {number} partyId The party ID.
 * @param {object} data The data to send.
 */
function broadcastToParty(partyId, data) {
    const party = parties.get(partyId);
    if (!party) return;
    
    const message = JSON.stringify(data);
    for (const memberId of party.members) {
        const player = players.get(memberId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    }
}

/**
 * Creates a new party with the given leader.
 * @param {number} leaderId The player ID who will be the leader.
 * @returns {number} The new party ID.
 */
function createParty(leaderId) {
    const partyId = nextPartyId++;
    parties.set(partyId, {
        leaderId: leaderId,
        members: [leaderId],
        maxSize: MAX_PARTY_SIZE
    });
    
    const player = players.get(leaderId);
    if (player) {
        player.partyId = partyId;
    }
    
    console.log(`Party ${partyId} created with leader ${leaderId}`);
    return partyId;
}

/**
 * Adds a player to an existing party.
 * @param {number} partyId The party to join.
 * @param {number} playerId The player joining.
 * @returns {boolean} Success status.
 */
function addPlayerToParty(partyId, playerId) {
    const party = parties.get(partyId);
    const player = players.get(playerId);
    
    if (!party || !player) return false;
    if (party.members.length >= party.maxSize) return false;
    if (party.members.includes(playerId)) return false;
    
    party.members.push(playerId);
    player.partyId = partyId;
    
    console.log(`Player ${playerId} joined party ${partyId}`);
    return true;
}

/**
 * Removes a player from their party.
 * @param {number} playerId The player to remove.
 */
function removePlayerFromParty(playerId) {
    const player = players.get(playerId);
    if (!player || !player.partyId) return;
    
    const partyId = player.partyId;
    const party = parties.get(partyId);
    if (!party) return;
    
    // Remove player from members list
    party.members = party.members.filter(id => id !== playerId);
    player.partyId = null;
    
    console.log(`Player ${playerId} left party ${partyId}`);
    
    // Handle party state after removal
    if (party.members.length === 0) {
        // Disband empty party
        parties.delete(partyId);
        console.log(`Party ${partyId} disbanded (empty)`);
    } else if (party.leaderId === playerId) {
        // Assign new leader if the old leader left
        party.leaderId = party.members[0];
        console.log(`Player ${party.leaderId} is now leader of party ${partyId}`);
        
        // Notify party members of update
        broadcastToParty(partyId, {
            type: 'party-update',
            party: {
                leaderId: party.leaderId,
                members: party.members
            }
        });
    } else {
        // Normal member left, notify remaining members
        broadcastToParty(partyId, {
            type: 'party-update',
            party: {
                leaderId: party.leaderId,
                members: party.members
            }
        });
    }
}

/**
 * Gets party info for a player.
 * @param {number} playerId The player ID.
 * @returns {object|null} Party data or null.
 */
function getPartyInfo(playerId) {
    const player = players.get(playerId);
    if (!player || !player.partyId) return null;
    
    const party = parties.get(player.partyId);
    if (!party) return null;
    
    return {
        leaderId: party.leaderId,
        members: party.members
    };
}

// --- Main Server Logic ---

wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    ws.playerId = playerId;

    console.log(`Player ${playerId} connected. (${players.size}/${MAX_PLAYERS} logged in)`);

    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    // Drop sockets that connect but never send a login, so half-open connections
    // cannot pile up on a public server.
    const loginTimer = setTimeout(() => {
        if (!players.has(ws.playerId)) {
            console.log(`Player ${ws.playerId} never logged in; closing.`);
            ws.terminate();
        }
    }, 30000);
    ws.on('close', () => clearTimeout(loginTimer));

    ws.on('message', (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage);

            if (data.type === 'login') {
                if (players.size >= MAX_PLAYERS) {
                    console.log(`Rejected player ${playerId}: server full (${players.size}/${MAX_PLAYERS}).`);
                    ws.send(JSON.stringify({ type: 'server-full', maxPlayers: MAX_PLAYERS }));
                    ws.close(4001, 'Server full');
                    return;
                }

                players.set(playerId, {
                    ws: ws, 
                    info: data.playerInfo,
                    partyId: null 
                });

                const otherPlayers = [];
                for (const [id, p] of players.entries()) {
                    if (id !== playerId) {
                        otherPlayers.push({ id: id, info: p.info });
                    }
                }

                ws.send(JSON.stringify({
                    type: 'login-success',
                    yourId: playerId,
                    gameState: gameState,
                    players: otherPlayers,
                    world: worldPayload
                }));

                broadcast({
                    type: 'player-joined',
                    playerId: playerId,
                    playerInfo: data.playerInfo
                }, playerId);

                return;
            }
            
            if (!players.has(ws.playerId)) {
                console.warn(`Message received from non-logged-in client. Disconnecting.`);
                ws.terminate();
                return;
            }

            switch (data.type) {
                case 'player-move':
                case 'player-meta':
                case 'player-state-change':
                    const player = players.get(ws.playerId);
                    if (player) {
                        if (data.type === 'player-move') {
                            player.info.x = data.x;
                            player.info.y = data.y;
                            player.info.direction = data.direction;
                        } else if (data.type === 'player-meta') {
                            player.info = data.info;
                        }
                    }
                    broadcast({ ...data, from: ws.playerId }, ws.playerId);
                    break;

                case 'map-transfer':
                    const transferPlayer = players.get(ws.playerId);
                    if (transferPlayer) {
                        transferPlayer.info.mapId = data.mapId;
                        
                        // Check if this player is a party leader
                        if (transferPlayer.partyId) {
                            const party = parties.get(transferPlayer.partyId);
                            if (party && party.leaderId === ws.playerId) {
                                // Teleport all party members to leader's location
                                for (const memberId of party.members) {
                                    if (memberId !== ws.playerId) {
                                        sendToPlayer(memberId, {
                                            type: 'force-teleport',
                                            mapId: data.mapId,
                                            x: transferPlayer.info.x,
                                            y: transferPlayer.info.y,
                                            direction: transferPlayer.info.direction
                                        });
                                    }
                                }
                            }
                        }
                    }
                    broadcast({ ...data, from: ws.playerId }, ws.playerId);
                    break;

                case 'switch-change':
                    if (data.id !== undefined && data.value !== undefined) {
                        gameState.switches[data.id] = data.value;
                        broadcast({ ...data, from: ws.playerId }, ws.playerId);
                    }
                    break;

                case 'variable-change':
                    if (data.id !== undefined && data.value !== undefined) {
                        gameState.variables[data.id] = data.value;
                        broadcast({ ...data, from: ws.playerId }, ws.playerId);
                    }
                    break;

                case 'self-switch-change':
                    const key = `${data.mapId},${data.eventId},${data.switchType}`;
                    gameState.selfSwitches[key] = data.value;
                    broadcast({ ...data, from: ws.playerId }, ws.playerId);
                    break;

                // --- PARTY SYSTEM HANDLERS ---
                
                case 'party-invite':
                    const inviter = players.get(ws.playerId);
                    const target = players.get(data.targetId);
                    
                    if (!target) {
                        sendToPlayer(ws.playerId, {
                            type: 'error',
                            message: 'Target player not found.'
                        });
                        break;
                    }
                    
                    // Check if target is already in a party
                    if (target.partyId) {
                        sendToPlayer(ws.playerId, {
                            type: 'error',
                            message: 'That player is already in a party.'
                        });
                        break;
                    }
                    
                    // Check if inviter has a party
                    if (inviter.partyId) {
                        const party = parties.get(inviter.partyId);
                        if (party.members.length >= MAX_PARTY_SIZE) {
                            sendToPlayer(ws.playerId, {
                                type: 'error',
                                message: 'Your party is full.'
                            });
                            break;
                        }
                    }
                    
                    // Send invitation to target
                    sendToPlayer(data.targetId, {
                        type: 'party-invite-request',
                        fromId: ws.playerId,
                        fromName: inviter.info.name
                    });
                    
                    console.log(`Player ${ws.playerId} invited player ${data.targetId} to party`);
                    break;

                case 'party-accept':
                    const accepter = players.get(ws.playerId);
                    const inviterPlayer = players.get(data.inviterId);
                    
                    if (!inviterPlayer) {
                        sendToPlayer(ws.playerId, {
                            type: 'error',
                            message: 'Inviter not found.'
                        });
                        break;
                    }
                    
                    // Check if accepter is already in a party
                    if (accepter.partyId) {
                        sendToPlayer(ws.playerId, {
                            type: 'error',
                            message: 'You are already in a party.'
                        });
                        break;
                    }
                    
                    let partyId;
                    
                    // Create party if inviter doesn't have one
                    if (!inviterPlayer.partyId) {
                        partyId = createParty(data.inviterId);
                    } else {
                        partyId = inviterPlayer.partyId;
                    }
                    
                    // Add accepter to party
                    if (addPlayerToParty(partyId, ws.playerId)) {
                        const party = parties.get(partyId);
                        // Notify all party members
                        broadcastToParty(partyId, {
                            type: 'party-update',
                            party: {
                                leaderId: party.leaderId,
                                members: party.members
                            }
                        });
                        console.log(`Player ${ws.playerId} accepted invite and joined party ${partyId}`);
                    } else {
                        sendToPlayer(ws.playerId, {
                            type: 'error',
                            message: 'Failed to join party.'
                        });
                    }
                    break;

                case 'party-leave':
                    const leaver = players.get(ws.playerId);
                    if (!leaver.partyId) {
                        sendToPlayer(ws.playerId, {
                            type: 'error',
                            message: 'You are not in a party.'
                        });
                        break;
                    }
                    
                    const oldPartyId = leaver.partyId;
                    const oldParty = parties.get(oldPartyId);
                    const wasLastMember = oldParty && oldParty.members.length === 1;
                    
                    removePlayerFromParty(ws.playerId);
                    
                    // Notify the leaver
                    sendToPlayer(ws.playerId, {
                        type: 'party-disband'
                    });
                    
                    // If party was disbanded (last member), notify them
                    if (wasLastMember) {
                        console.log(`Party ${oldPartyId} disbanded`);
                    }
                    break;

                // The host client uploads its world once, right after logging
                // in. Everyone who joins later is handed the same payload, so a
                // session is always played in the host's world and never in a
                // guest's own.
                case 'world-offer':
                    if (data.world) {
                        worldPayload = data.world;
                        if (data.world.name) advertised.world = data.world.name;
                        broadcast({ type: 'world-sync', world: worldPayload, from: ws.playerId }, ws.playerId);
                    }
                    break;

                // Anything the clients agree on between themselves (vehicles,
                // map battles, world files) travels as a relay, so a new packet
                // kind never needs a server change.
                case 'relay':
                    if (data.to) sendToPlayer(data.to, { ...data, from: ws.playerId });
                    else broadcast({ ...data, from: ws.playerId }, ws.playerId);
                    break;

                default:
                    console.log(`Received unknown message type: ${data.type}`);
                    break;
            }
        } catch (error) {
            console.error(`Failed to process message: ${rawMessage}`, error);
        }
    });

    ws.on('close', () => {
        const disconnectedId = ws.playerId;
        if (players.has(disconnectedId)) {
            // Remove from party if in one
            removePlayerFromParty(disconnectedId);
            
            players.delete(disconnectedId);
            console.log(`Player ${disconnectedId} disconnected.`);
            
            broadcast({
                type: 'player-left',
                playerId: disconnectedId
            });
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for player ${ws.playerId}:`, error);
    });
});

// Interval to check for inactive connections
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            console.log(`Terminating inactive connection for player ${ws.playerId || '(unknown)'}.`);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

httpServer.listen(PORT, HOST, () => {
    console.log(`Server is running and waiting for connections.`);
    console.log(`  WebSocket: ws://${HOST}:${PORT}`);
    console.log(`  Health:    http://${HOST}:${PORT}/health`);
    if (options.onListening) options.onListening(PORT);
});

// Log a clear reason instead of dying silently when the port is taken.
httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other process or set PORT.`);
    } else {
        console.error('HTTP server error:', error);
    }
    // In-process hosts get the error back and keep the game alive; the
    // standalone server still exits, as a service is expected to.
    if (options.onError) options.onError(error);
    else process.exit(1);
});

// --- LAN discovery beacon ---------------------------------------------------
// One UDP socket bound to DISCOVERY_PORT, answering probes with everything a
// client needs to connect: the port, the host's name, the world and how full
// the session is. The reply goes straight back to the prober's address, so it
// works whether the probe arrived as a broadcast or as a direct packet.
let discoverySocket = null;
if (DISCOVERY) {
    discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    discoverySocket.on('error', (e) => {
        console.error('[LAN] discovery socket error:', e && e.message);
        try { discoverySocket.close(); } catch (err) { /* already closed */ }
        discoverySocket = null;
    });
    discoverySocket.on('message', (msg, rinfo) => {
        if (String(msg).indexOf(DISCOVERY_MAGIC) !== 0) return;
        const reply = Buffer.from(JSON.stringify({
            magic: DISCOVERY_REPLY,
            port: PORT,
            hostName: advertised.hostName || '',
            world: advertised.world || (worldPayload && worldPayload.name) || '',
            players: players.size,
            maxPlayers: MAX_PLAYERS
        }));
        try { discoverySocket.send(reply, 0, reply.length, rinfo.port, rinfo.address); } catch (e) { /* prober gone */ }
    });
    discoverySocket.bind(DISCOVERY_PORT, () => {
        try { discoverySocket.setBroadcast(true); } catch (e) { /* not permitted */ }
        console.log(`[LAN] Announcing on UDP ${DISCOVERY_PORT}.`);
    });
}

    return {
        port: PORT,
        get playerCount() { return players.size; },
        setWorld(world) { worldPayload = world; if (world && world.name) advertised.world = world.name; },
        setAdvertise(info) { advertised = Object.assign(advertised, info || {}); },
        close() {
            clearInterval(interval);
            for (const player of players.values()) {
                if (player.ws.readyState === WebSocket.OPEN) player.ws.close(1001, 'Host closed the session');
            }
            players.clear();
            parties.clear();
            try { wss.close(); } catch (e) { /* already closed */ }
            try { httpServer.close(); } catch (e) { /* already closed */ }
            if (discoverySocket) {
                try { discoverySocket.close(); } catch (e) { /* already closed */ }
                discoverySocket = null;
            }
        }
    };
}

module.exports = { startServer, DISCOVERY_PORT, DISCOVERY_MAGIC, DISCOVERY_REPLY };

// Standalone: `node server.js` still starts the public server exactly as before.
if (require.main === module) {
    const server = startServer();
    // Clean shutdown so systemd restarts do not leave sockets hanging.
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => {
            console.log(`Received ${signal}, shutting down.`);
            server.close();
            process.exit(0);
        });
    }
}
