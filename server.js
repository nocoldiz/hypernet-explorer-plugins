//=============================================================================
// RPG Maker MZ Multiplayer Server for Centralized Architecture with Party System
// Author: OmniLex
// Version: 2.0.0
//=============================================================================

const WebSocket = require('ws');

// Use the PORT environment variable provided by Render.com, or 8080 for local testing.
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });

console.log(`Starting server on port ${PORT}...`);

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

    console.log(`Player ${playerId} connected.`);

    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage);

            if (data.type === 'login') {
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
                    players: otherPlayers
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

console.log('Server is running and waiting for connections.');