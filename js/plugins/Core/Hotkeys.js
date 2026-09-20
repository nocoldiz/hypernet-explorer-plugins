/*:
 * @target MZ
 * @plugindesc Adds hotkeys for quickly accessing menus and kick mechanics in RPG Maker MZ.
 * @author Omni-Lex
 * @help 
 * MenuHotkeys.js
 * 
 * This plugin adds keyboard shortcuts to quickly access different menus:
 * H - Call Common Event 12
 * C - Kick action (always uses basic kick regardless of equipped weapon)
 *
 * Kick Mechanics:
 * When pressing C (Shift key), the player will always perform a basic kick in front of them.
 * The kick sound is only played if an event is actually hit.
 *
 * - If no event is in front of the player: no action, no sound
 * - If event is non-kickable (locked door, NPC, etc.): no action, no sound
 * - If event is hittable: plays kick sound and launches event or breaks it
 *
 * The equipped weapon type is no longer used for the kick mechanic.
 * 
 * Special Event Naming Rules:
 * - Events starting with "Door" are always destructible
 * - Events starting with "Transfer" are always non-kickable
 * - Events named "locked" require 7-15 hits to destroy
 * 
 * Wall Bounce Mechanic:
 * - If a kicked event can't move forward due to a wall/obstacle, it will be thrown behind the player instead
 * 
 * Plugin Commands:
 * - Take Damage: Inflicts 1 damage to the event running this command (if destroyable)
 * - Move Away From Player: Moves the event 1 tile backward from player's position
 * 
 * No plugin parameters are needed - just install and enable the plugin.
 * 
 * Menu hotkeys work both on the map and in the main menu.
 * They only work when the player can access the menu (i.e., when
 * $gameSystem.isMenuEnabled() returns true) and when not in battle or 
 * in a message/event.
 * 
 * The kick mechanic works anytime on the map when not in a running event.
 * 
 * @command takeDamage
 * @text Take Damage
 * @desc Inflicts 1 damage to this event if it's destroyable
 * 
 * @command moveAwayFromPlayer
 * @text Move Away From Player
 * @desc Moves this event 1 tile backward from the player's position
 */

(() => {
    'use strict';
    
    // Configuration for kick mechanics
    const KICK_CONFIG = {
        // Events that cannot be kicked at all
        NON_KICKABLE_EVENTS: [
            'wall',
            'pillar',
            'statue',
            'door',
            'elevator',
            'npc_important',
            'boss',
            'Teleport',
            'immovable',
            'switch'
        ],
        
        // Events that get destroyed when kicked instead of launched
        DESTRUCTIBLE_EVENTS: [
            'crate',
            'barrel',
            'pot',
            'vase',
            'box',
            'crystal',
            'Door',
            'rock_small',
            'locked'  // Added locked to destructible events
        ],
        
        // Sound effects for different weapon types
        // i18n-ignore-start: SE filenames
        WEAPON_SOUNDS: {
            // Weapon type specific sounds
            1: { name: 'Sword1', volume: 90, pitch: 100, pan: 0 },      // Dagger
            2: { name: 'Sword2', volume: 90, pitch: 100, pan: 0 },      // Sword
            3: { name: 'Sword3', volume: 90, pitch: 100, pan: 0 },      // Flail
            4: { name: 'Blow2', volume: 90, pitch: 100, pan: 0 },       // Axe
            5: { name: 'Blow3', volume: 90, pitch: 100, pan: 0 },       // Whip
            6: { name: 'Sword4', volume: 90, pitch: 100, pan: 0 },      // Staff
            7: { name: 'Shot1', volume: 80, pitch: 100, pan: 0 },       // Bow
            8: { name: 'Shot2', volume: 80, pitch: 100, pan: 0 },       // Crossbow
            9: { name: 'Shot3', volume: 80, pitch: 100, pan: 0 },       // Gun
            10: { name: 'Blow1', volume: 90, pitch: 100, pan: 0 },      // Claw
            11: { name: 'Magic1', volume: 85, pitch: 100, pan: 0 },     // Glove
            12: { name: 'Sword5', volume: 90, pitch: 100, pan: 0 },     // Spear
            // Default sound for unknown weapon types
            default: { name: 'Blow1', volume: 90, pitch: 100, pan: 0 }
            // i18n-ignore-end
        },
        
        // How far to launch events (in tiles)
        LAUNCH_DISTANCE: 3,
        
        // Speed of launch animation (frames between moves)
        LAUNCH_SPEED: 8,
        
        // Weapon type configurations
        RANGED_WEAPON_TYPES: [7, 8, 9],      // Stun/destroy in direct line
        TWO_WAY_WEAPON_TYPES: [5, 12, 6],    // Kick both directions
        
        // How far to check for ranged weapon targets
        RANGED_CHECK_DISTANCE: 5,
        
        // Bullet trail effect settings
        BULLET_TRAIL: {
            duration: 200,        // How long the trail lasts (ms)
            speed: 1200,           // How fast the bullet travels (pixels per second)
            width: 3,             // Trail width in pixels
            color: 0xFFFF00,      // Yellow color (can be customized per weapon)
            alpha: 0.8,           // Trail transparency
            fadeOut: true         // Whether trail fades out
        },
        
        // Cooldown for C button (in milliseconds)
        ACTION_COOLDOWN: 300,
        
        // Destruction system
        DESTRUCTION_CONFIG: {
            // Number of hits required to destroy events (random between min and max)
            MIN_HITS: 2,
            MAX_HITS: 5,
            
            // Special health for locked events
            LOCKED_MIN_HITS: 7,
            LOCKED_MAX_HITS: 15,
            
            // Flash effect settings
            FLASH_DURATION: 200,  // milliseconds
            FLASH_COLOR: [255, 0, 0, 128],  // Red flash with alpha
            
            // Optional destroy sounds based on event name
            DESTROY_SOUNDS: {
                'crate': { name: 'Crash', volume: 90, pitch: 100, pan: 0 },
                'barrel': { name: 'Crash', volume: 90, pitch: 100, pan: 0 },
                'pot': { name: 'Break', volume: 80, pitch: 110, pan: 0 },
                'vase': { name: 'Break', volume: 80, pitch: 120, pan: 0 },
                'box': { name: 'Crash', volume: 85, pitch: 90, pan: 0 },
                'crystal': { name: 'Ice/Ice8', volume: 70, pitch: 120, pan: 0 },
                'rock_small': { name: 'Earth/Earth4', volume: 80, pitch: 80, pan: 0 },
                'locked': { name: 'Earth/Earth5', volume: 85, pitch: 80, pan: 0 },  // Heavy thud for locked
                // Sounds for door events
                'door': { name: 'Open2', volume: 85, pitch: 90, pan: 0 },
                // Default destroy sound
                'default': { name: 'Crash', volume: 85, pitch: 100, pan: 0 }
            }
        }
    };
    
    // Track cooldown and event health
    let lastActionTime = 0;
    const eventHealthMap = new Map(); // eventId -> { hits: number, maxHits: number }
    let shiftPressedBefore = false; // Track if Shift has been pressed before
    
    // Plugin command registration
    PluginManager.registerCommand("Hotkeys", "takeDamage", args => {
        const event = $gameMap.event($gameMap._interpreter.eventId());
        if (event) {
            takeDamageCommand(event);
        }
    });
    
    PluginManager.registerCommand("Hotkeys", "moveAwayFromPlayer", args => {
        const event = $gameMap.event($gameMap._interpreter.eventId());
        if (event) {
            moveAwayFromPlayerCommand(event);
        }
    });
    
    // Plugin command: Take Damage
    function takeDamageCommand(event) {
        const eventName = getEventName(event);
        
        // Check if the event is destroyable
        if (!isEventDestructible(eventName)) {
            // Event is not destroyable, show message or do nothing
            return;
        }
        
        // Check if event is non-kickable (even destroyable events might be protected)
        if (isEventNonKickable(eventName)) {
            return;
        }
        
        // Apply 1 damage to the event
        const health = initializeEventHealth(event);
        health.hits++;
        
        // Flash the event red to show damage
        flashEventRed(event);
        
        // Play a hit sound (not destruction sound yet)
        AudioManager.playSe({ name: 'Blow1', volume: 70, pitch: 120, pan: 0 });
        
        // Check if the event should be destroyed
        if (health.hits >= health.maxHits) {
            // Event is destroyed - play destroy sound
            const destroySound = getDestroySound(eventName);
            AudioManager.playSe(destroySound);
            destroyEvent(event);
            
            // Remove from health map
            eventHealthMap.delete(event._eventId);
        }
    }
    
    // Plugin command: Move Away From Player
    function moveAwayFromPlayerCommand(event) {
        const player = $gamePlayer;
        
        // Calculate the direction from player to event
        const deltaX = event.x - player.x;
        const deltaY = event.y - player.y;
        
        // Determine the primary direction to move away from player
        let moveDirection;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Move horizontally
            moveDirection = deltaX > 0 ? 6 : 4; // Right if event is to the right of player, left otherwise
        } else {
            // Move vertically
            moveDirection = deltaY > 0 ? 2 : 8; // Down if event is below player, up otherwise
        }
        
        // Calculate target position (just 1 tile backward)
        const targetX = $gameMap.roundXWithDirection(event.x, moveDirection);
        const targetY = $gameMap.roundYWithDirection(event.y, moveDirection);
        
        // Check if the target position is passable or has events with "Below Characters" priority
        const canMoveToTarget = event.canPass(event.x, event.y, moveDirection) || 
                               canMoveToTileWithBelowCharacterEvents(targetX, targetY);
        
        if (canMoveToTarget) {
            // Move the event to the target position immediately (1 tile only)
            event.setPosition(targetX, targetY);
            
            // Play Earth3 sound effect
            AudioManager.playSe({ name: 'Earth/Earth3', volume: 80, pitch: 100, pan: 0 });
        } else {
            // Primary direction is blocked, try to find a random free adjacent spot
            const freeAdjacentSpot = findRandomFreeAdjacentSpot(event);
            
            if (freeAdjacentSpot) {
                // Move to the random free spot
                event.setPosition(freeAdjacentSpot.x, freeAdjacentSpot.y);
                
                // Play Earth3 sound effect
                AudioManager.playSe({ name: 'Earth/Earth3', volume: 80, pitch: 100, pan: 0 });
            } else {
                // No free adjacent spots available
            }
        }
    }

    function findRandomFreeAdjacentSpot(event) {
        const currentX = event.x;
        const currentY = event.y;
        
        // 4 cardinal directions (up, right, down, left)
        const directions = [
            { dir: 8 },  // Up
            { dir: 6 },  // Right
            { dir: 2 },  // Down
            { dir: 4 }   // Left
        ];
        
        // Find all free adjacent spots
        const freeSpots = [];
        
        for (const direction of directions) {
            const testX = $gameMap.roundXWithDirection(currentX, direction.dir);
            const testY = $gameMap.roundYWithDirection(currentY, direction.dir);
            
            // Check if the event can pass from current position to the test position
            const canPassToSpot = event.canPass(currentX, currentY, direction.dir);
            // Also check if the destination allows movement (for "Below Characters" events)
            const destinationAllowsMovement = canMoveToTileWithBelowCharacterEvents(testX, testY);
            
            if (canPassToSpot || destinationAllowsMovement) {
                freeSpots.push({ x: testX, y: testY });
            }
        }
        
        // Return a random free spot, or null if none available
        if (freeSpots.length > 0) {
            const randomIndex = Math.floor(Math.random() * freeSpots.length);
            return freeSpots[randomIndex];
        }
        
        return null; // No free spots available
    }

    function canMoveToTileWithBelowCharacterEvents(x, y) {
        // Check if the tile itself is passable (terrain-wise)
        if (!$gameMap.isValid(x, y) || !$gameMap.isPassable(x, y, 2)) {
            return false; // Terrain is not passable
        }
        
        // Get all events at the target position
        const eventsAtTarget = $gameMap.eventsXy(x, y);
        
        // If no events at target, movement is allowed
        if (eventsAtTarget.length === 0) {
            return true;
        }
        
        // Check if all events at target position have "Below Characters" priority
        for (const targetEvent of eventsAtTarget) {
            // Get the current page of the event
            const page = targetEvent.findProperPageIndex();
            if (page >= 0) {
                const eventPage = targetEvent.event().pages[page];
                // Priority 0 = "Below Characters", Priority 1 = "Same as Characters", Priority 2 = "Above Characters"
                if (eventPage.priorityType !== 0) {
                    return false; // Found an event that's not "Below Characters"
                }
            }
        }
        
        return true; // All events at target are "Below Characters"
    }
    
    // Store original Input._onKeyDown method
    const _Input_onKeyDown = Input._onKeyDown;
    
    // Override Input._onKeyDown to handle our custom hotkeys
    Input._onKeyDown = function(event) {
        // Call original method first
        _Input_onKeyDown.call(this, event);
        
        // Process hotkeys if on map and not in another event
        if (SceneManager._scene instanceof Scene_Map && 
            !$gameMap.isEventRunning()) {
            
            // Shift only raises switch 101 on its first press. It no longer
            // performs the kick / weapon action: Shift is the dash key.
            if (event.key.toUpperCase() === 'SHIFT') {
                if (!shiftPressedBefore) {
                    $gameSwitches.setValue(101, true);
                    shiftPressedBefore = true;
                }
                return;
            }
            
   
        }
        
        // Menu keys are NOT handled here. Every letter that opens a screen is
        // declared once in the HOTKEYS table of UI/CustomMainMenuLayout.js and
        // polled from Scene_Map: a second list here is how W came to open the
        // hyperdeck while W was also the key the party walks north with.
    };
    
    // Get actor1's equipped weapon type
    function getActor1WeaponType() {
        const actor1 = $gameActors.actor(1);
        if (!actor1) return null;
        
        const weapons = actor1.weapons();
        if (weapons.length === 0) return null;
        
        // Return the weapon type of the first equipped weapon
        return weapons[0].wtypeId;
    }
    
    // Check if event is non-kickable (including Transfer events)
    function isEventNonKickable(eventName) {
        const lowerName = eventName.toLowerCase();
        
        // Check if event starts with "transfer" (case insensitive)
        if (lowerName.startsWith('transfer')) {
            return true;
        }
        // Check if event starts with "transfer" (case insensitive)
        if (lowerName.startsWith('teleport')) {
            return true;
        }
        // Check if event starts with "door" but is NOT exactly "door" (case insensitive)
        if (lowerName.startsWith('door (') && lowerName !== 'door') {  // i18n-ignore  event name
            return true;
        }
        
        // Check regular non-kickable events
        return KICK_CONFIG.NON_KICKABLE_EVENTS.includes(lowerName);
    }
    
    // Check if event is destructible (including Door events and locked events)
    function isEventDestructible(eventName) {
        const lowerName = eventName.toLowerCase();
        
        // Check if event is exactly "door" (case insensitive)
        if (lowerName === 'door') {
            return true;
        }
        
        // Check if event is "locked" (case insensitive)
        if (lowerName === 'locked') {
            return true;
        }
        
        // Check regular destructible events
        return KICK_CONFIG.DESTRUCTIBLE_EVENTS.includes(lowerName);
    }
    
    // Initialize event health with special handling for locked events
    function initializeEventHealth(event) {
        const eventId = event._eventId;
        if (!eventHealthMap.has(eventId)) {
            const eventName = getEventName(event).toLowerCase();
            
            let minHits, maxHits;
            
            // Special health values for locked events
            if (eventName === 'locked') {
                minHits = KICK_CONFIG.DESTRUCTION_CONFIG.LOCKED_MIN_HITS;
                maxHits = KICK_CONFIG.DESTRUCTION_CONFIG.LOCKED_MAX_HITS;
            } else {
                minHits = KICK_CONFIG.DESTRUCTION_CONFIG.MIN_HITS;
                maxHits = KICK_CONFIG.DESTRUCTION_CONFIG.MAX_HITS;
            }
            
            const maxHealth = Math.floor(Math.random() * (maxHits - minHits + 1)) + minHits;
            eventHealthMap.set(eventId, { hits: 0, maxHits: maxHealth });
        }
        return eventHealthMap.get(eventId);
    }
    
    // Get destroy sound based on event name
    function getDestroySound(eventName) {
        const sounds = KICK_CONFIG.DESTRUCTION_CONFIG.DESTROY_SOUNDS;
        const lowerName = eventName.toLowerCase();
        
        // Check for door events first
        if (lowerName.startsWith('door')) {
            return sounds.door || sounds.default;
        }
        
        // Check for specific event names (including locked)
        return sounds[lowerName] || sounds.default;
    }
    
    // Flash event red
    function flashEventRed(event) {
        // Store original blend settings
        const originalBlendMode = event._blendMode;
        const originalColorTone = event._colorTone ? [...event._colorTone] : [0, 0, 0, 0];
        
        // Apply red flash
        event._colorTone = [...KICK_CONFIG.DESTRUCTION_CONFIG.FLASH_COLOR];
        event._blendMode = 1; // Normal blend mode
        
        // Restore after flash duration
        setTimeout(() => {
            event._colorTone = originalColorTone;
            event._blendMode = originalBlendMode;
        }, KICK_CONFIG.DESTRUCTION_CONFIG.FLASH_DURATION);
    }
    
    // Handle destructible event hit (without additional sound - sound handled elsewhere)
    function hitDestructibleEventWithoutSound(event) {
        const eventName = getEventName(event);
        const health = initializeEventHealth(event);
        
        health.hits++;
        
        // Flash the event red
        flashEventRed(event);
        
        if (health.hits >= health.maxHits) {
            // Event is destroyed - play destroy sound
            const destroySound = getDestroySound(eventName);
            AudioManager.playSe(destroySound);
            destroyEvent(event);
            
            // Remove from health map
            eventHealthMap.delete(event._eventId);
        }
        // If not destroyed, just the flash effect is applied
    }
    
    // Handle destructible event hit (legacy function for compatibility)
    function hitDestructibleEvent(event) {
        hitDestructibleEventWithoutSound(event);
    }

    function getWeaponSound(weaponType) {
        if (!weaponType) {
            return KICK_CONFIG.WEAPON_SOUNDS.default;
        }
        return KICK_CONFIG.WEAPON_SOUNDS[weaponType] || KICK_CONFIG.WEAPON_SOUNDS.default;
    }
    
    // Handle weapon-based action for C button
    function handleWeaponBasedAction() {
        const weaponType = getActor1WeaponType();

        // Always use kick behavior regardless of weapon type
        handleKickMechanicLogic(weaponType);
    }
    
    // Handle ranged weapon action (check facing first, then line of sight)
    function handleRangedWeaponAction() {
        const player = $gamePlayer;
        const direction = player.direction();
        
        // First check if there's an event directly facing the player
        const facing1X = $gameMap.roundXWithDirection(player.x, direction);
        const facing1Y = $gameMap.roundYWithDirection(player.y, direction);
        const facingEvents = $gameMap.eventsXy(facing1X, facing1Y);
        
        if (facingEvents.length > 0) {
            // Play default sound for close range shove
            AudioManager.playSe(KICK_CONFIG.WEAPON_SOUNDS.default);
            
            // Shove the facing event 1 tile backward
            for (const event of facingEvents) {
                const eventName = getEventName(event);
                
                // Check if event is non-kickable using new function
                if (isEventNonKickable(eventName)) {
                    continue;
                }
                
                // Check if event should be destroyed instead of moved using new function
                if (isEventDestructible(eventName)) {
                    hitDestructibleEvent(event);
                } else {
                    // Shove 1 tile backward
                    shoveEventBackward(event, direction);
                }
            }
            return;
        }
        
        // No event directly facing, check events in direct line from player
        let targetEvent = null;
        let targetTileX = null;
        let targetTileY = null;
        let checkX = player.x;
        let checkY = player.y;
        
        for (let i = 1; i <= KICK_CONFIG.RANGED_CHECK_DISTANCE; i++) {
            checkX = $gameMap.roundXWithDirection(checkX, direction);
            checkY = $gameMap.roundYWithDirection(checkY, direction);
            
            const eventsAtPosition = $gameMap.eventsXy(checkX, checkY);
            if (eventsAtPosition.length > 0) {
                targetEvent = eventsAtPosition[0]; // Get first event
                targetTileX = checkX;
                targetTileY = checkY;
                break;
            }
        }
        
        if (!targetEvent) {
            // No event found in line, but show bullet trail to max range
            targetTileX = checkX;
            targetTileY = checkY;
        }
        
        // Create bullet trail effect to target position
        createBulletTrail(player.x, player.y, targetTileX, targetTileY);
        
        if (!targetEvent) {
            // No event found in line
            return;
        }
        
        const eventName = getEventName(targetEvent);
        
        // Check if event is non-kickable using new function
        if (isEventNonKickable(eventName)) {
            return;
        }
        
        // Check if event should be destroyed using new function
        if (isEventDestructible(eventName)) {
            hitDestructibleEvent(targetEvent);
        } else {
            // Flash, move backward 1 tile, then stun the distant event
            flashEventRed(targetEvent);
            shoveEventBackward(targetEvent, direction);
            stunEventWithoutBalloon(targetEvent);
        }
    }
    
    // Handle two-way kick mechanic (kick both facing and behind)
    function handleTwoWayKickMechanic(weaponType) {
        const player = $gamePlayer;
        const direction = player.direction();
        const oppositeDirection = getOppositeDirection(direction);

        // Get events facing the player
        const facing1X = $gameMap.roundXWithDirection(player.x, direction);
        const facing1Y = $gameMap.roundYWithDirection(player.y, direction);
        const frontEvents = $gameMap.eventsXy(facing1X, facing1Y);

        // Get events behind the player
        const behind1X = $gameMap.roundXWithDirection(player.x, oppositeDirection);
        const behind1Y = $gameMap.roundYWithDirection(player.y, oppositeDirection);
        const behindEvents = $gameMap.eventsXy(behind1X, behind1Y);

        // Filter out non-kickable events to see if anything is actually hittable
        const allEvents = [...frontEvents, ...behindEvents];
        const hittableEvents = allEvents.filter(event => {
            const eventName = getEventName(event);
            return !isEventNonKickable(eventName);
        });

        if (hittableEvents.length === 0) {
            // No hittable events - do NOT play sound
            return;
        }

        // At least one event will be hit - now play the sound
        AudioManager.playSe(KICK_CONFIG.WEAPON_SOUNDS.default);

        // Process front events
        for (const event of frontEvents) {
            processKickableEventWithoutSound(event, direction);
        }

        // Process behind events
        for (const event of behindEvents) {
            processKickableEventWithoutSound(event, oppositeDirection);
        }
    }
    
    // Handle regular kick mechanic logic (sound only plays if event is hit)
    function handleKickMechanicLogic(weaponType) {
        const player = $gamePlayer;
        const direction = player.direction();

        // Check for events at 1 tile in front of the player
        const facing1X = $gameMap.roundXWithDirection(player.x, direction);
        const facing1Y = $gameMap.roundYWithDirection(player.y, direction);
        const kickableEvents = $gameMap.eventsXy(facing1X, facing1Y);

        if (kickableEvents.length === 0) {
            // No events to kick - do NOT play sound
            return;
        }

        // Filter out non-kickable events to see if anything is actually hittable
        const hittableEvents = kickableEvents.filter(event => {
            const eventName = getEventName(event);
            return !isEventNonKickable(eventName);
        });

        if (hittableEvents.length === 0) {
            // All events were non-kickable - do NOT play sound
            return;
        }

        // At least one event will be hit - now play the sound
        AudioManager.playSe(KICK_CONFIG.WEAPON_SOUNDS.default);

        // Set switch 112 ON on first successful kick
        $gameSwitches.setValue(112, true);

        // Process each kickable event
        for (const targetEvent of kickableEvents) {
            processKickableEventWithoutSound(targetEvent, direction);
        }
    }
    
    // Process a single kickable event (without sound - sound handled elsewhere)
    function processKickableEventWithoutSound(targetEvent, kickDirection) {
        const eventName = getEventName(targetEvent);
        
        // Check if event is non-kickable using new function
        if (isEventNonKickable(eventName)) {
            return;
        }
        
        // Check if event should be destroyed using new function
        if (isEventDestructible(eventName)) {
            hitDestructibleEventWithoutSound(targetEvent);
            return;
        }
        
        // Launch the event forward in the kick direction (with wall bounce mechanic)
        launchEventWithWallBounce(targetEvent, kickDirection);
    }
    
    // Process a single kickable event (legacy function for compatibility)
    function processKickableEvent(targetEvent, kickDirection) {
        processKickableEventWithoutSound(targetEvent, kickDirection);
    }
    
    // Launch an event with wall bounce mechanic
    function launchEventWithWallBounce(event, kickDirection) {
        // First try to launch in the kick direction
        const canLaunchForward = canEventMoveInDirection(event, kickDirection);
        
        if (canLaunchForward) {
            // Normal launch forward
            launchEvent(event, kickDirection);
        } else {
            // Can't move forward due to wall/obstacle, bounce behind player
            const player = $gamePlayer;
            const playerDirection = player.direction();
            const bounceDirection = getOppositeDirection(playerDirection);
            
            // Try to launch in the bounce direction (behind player)
            const canLaunchBehind = canEventMoveInDirection(event, bounceDirection);
            
            if (canLaunchBehind) {
                // Bounce behind player
                launchEvent(event, bounceDirection);
                
                // Play a different sound effect for wall bounce
                AudioManager.playSe({ name: 'Earth/Earth4', volume: 80, pitch: 90, pan: 0 });
            } else {
            }
        }
    }
    
    // Check if an event can move in a specific direction
    function canEventMoveInDirection(event, direction) {
        // Check at least one tile in the given direction
        let testX = event.x;
        let testY = event.y;
        
        for (let i = 0; i < KICK_CONFIG.LAUNCH_DISTANCE; i++) {
            const nextX = $gameMap.roundXWithDirection(testX, direction);
            const nextY = $gameMap.roundYWithDirection(testY, direction);
            
            // Check if the event can pass from current position to next position
            if (event.canPass(testX, testY, direction)) {
                testX = nextX;
                testY = nextY;
            } else {
                // Hit an obstacle, return false if we couldn't move at all
                return i > 0;
            }
        }
        
        // Could move the full distance
        return true;
    }
    
    // Shove an event 1 tile backward
    function shoveEventBackward(event, playerDirection) {
        // Calculate target position (1 tile backward from player's direction)
        const targetX = $gameMap.roundXWithDirection(event.x, playerDirection);
        const targetY = $gameMap.roundYWithDirection(event.y, playerDirection);
        
        // Check if the target position is passable
        if (event.canPass(event.x, event.y, playerDirection)) {
            // Animate the shove
            animateLaunch(event, targetX, targetY);
        }
        // If can't move, event stays in place (blocked by obstacle)
    }
    
    // Create bullet trail effect using PIXI
    function createBulletTrail(startX, startY, endX, endY) {
        // Convert tile coordinates to screen pixels
        const tileWidth = $gameMap.tileWidth();
        const tileHeight = $gameMap.tileHeight();
        
        const startPixelX = (startX * tileWidth) + (tileWidth / 2);
        const startPixelY = (startY * tileHeight) + (tileHeight / 2);
        const endPixelX = (endX * tileWidth) + (tileWidth / 2);
        const endPixelY = (endY * tileHeight) + (tileHeight / 2);
        
        // Get the spriteset for the current scene
        const spriteset = SceneManager._scene._spriteset;
        if (!spriteset) return;
        
        // Create a graphics object for the bullet trail
        const bulletGraphics = new PIXI.Graphics();
        
        // Set up the trail appearance
        bulletGraphics.lineStyle(KICK_CONFIG.BULLET_TRAIL.width, KICK_CONFIG.BULLET_TRAIL.color, KICK_CONFIG.BULLET_TRAIL.alpha);
        
        // Calculate distance and duration
        const distance = Math.sqrt(Math.pow(endPixelX - startPixelX, 2) + Math.pow(endPixelY - startPixelY, 2));
        const duration = Math.max(50, (distance / KICK_CONFIG.BULLET_TRAIL.speed) * 1000); // Minimum 50ms
        
        // Add to the scene
        spriteset._baseSprite.addChild(bulletGraphics);
        
        // Animate the bullet trail
        let startTime = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Clear previous drawing
            bulletGraphics.clear();
            bulletGraphics.lineStyle(KICK_CONFIG.BULLET_TRAIL.width, KICK_CONFIG.BULLET_TRAIL.color, KICK_CONFIG.BULLET_TRAIL.alpha);
            
            if (progress < 1) {
                // Draw trail from start to current position
                const currentX = startPixelX + (endPixelX - startPixelX) * progress;
                const currentY = startPixelY + (endPixelY - startPixelY) * progress;
                
                // Adjust for camera position
                const cameraX = $gameMap.displayX() * tileWidth;
                const cameraY = $gameMap.displayY() * tileHeight;
                
                bulletGraphics.moveTo(startPixelX - cameraX, startPixelY - cameraY);
                bulletGraphics.lineTo(currentX - cameraX, currentY - cameraY);
                
                // Continue animation
                requestAnimationFrame(animate);
            } else {
                // Trail reached target, start fade out if enabled
                if (KICK_CONFIG.BULLET_TRAIL.fadeOut) {
                    const fadeStartTime = Date.now();
                    const fadeDuration = KICK_CONFIG.BULLET_TRAIL.duration;
                    
                    const fadeOut = () => {
                        const fadeElapsed = Date.now() - fadeStartTime;
                        const fadeProgress = Math.min(fadeElapsed / fadeDuration, 1);
                        const alpha = KICK_CONFIG.BULLET_TRAIL.alpha * (1 - fadeProgress);
                        
                        // Clear and redraw with fading alpha
                        bulletGraphics.clear();
                        bulletGraphics.lineStyle(KICK_CONFIG.BULLET_TRAIL.width, KICK_CONFIG.BULLET_TRAIL.color, alpha);
                        
                        const cameraX = $gameMap.displayX() * tileWidth;
                        const cameraY = $gameMap.displayY() * tileHeight;
                        
                        bulletGraphics.moveTo(startPixelX - cameraX, startPixelY - cameraY);
                        bulletGraphics.lineTo(endPixelX - cameraX, endPixelY - cameraY);
                        
                        if (fadeProgress < 1) {
                            requestAnimationFrame(fadeOut);
                        } else {
                            // Remove the graphics object
                            spriteset._baseSprite.removeChild(bulletGraphics);
                            bulletGraphics.destroy();
                        }
                    };
                    
                    fadeOut();
                } else {
                    // No fade out, just remove after a short delay
                    setTimeout(() => {
                        spriteset._baseSprite.removeChild(bulletGraphics);
                        bulletGraphics.destroy();
                    }, 100);
                }
            }
        };
        
        // Start the animation
        animate();
    }
    
    // Get opposite direction
    function getOppositeDirection(direction) {
        switch (direction) {
            case 2: return 8; // Down -> Up
            case 4: return 6; // Left -> Right
            case 6: return 4; // Right -> Left
            case 8: return 2; // Up -> Down
            default: return direction;
        }
    }
    
    // Stun an event in place (with balloon icon)
    function stunEvent(event) {
        // Visual effect for stunning (customize as needed)
        // You could add a balloon icon, color change, or other visual feedback
        
        // Temporarily disable the event's movement
        const originalMoveType = event._moveType;
        const originalMoveSpeed = event._moveSpeed;
        
        event._moveType = 0; // Stop movement
        event._moveSpeed = 0;
        
        // Show stun effect (optional - you can customize this)
        $gameTemp.requestBalloon(event, 6); // Dizzy balloon
        
        // Restore movement after a delay (3 seconds)
        setTimeout(() => {
            event._moveType = originalMoveType;
            event._moveSpeed = originalMoveSpeed;
        }, 3000);
    }
    
    // Stun an event in place without balloon icon (for distant ranged attacks)
    function stunEventWithoutBalloon(event) {
        // Temporarily disable the event's movement
        const originalMoveType = event._moveType;
        const originalMoveSpeed = event._moveSpeed;
        
        event._moveType = 0; // Stop movement
        event._moveSpeed = 0;
        
        // No balloon icon for distant attacks
        
        // Restore movement after a delay (3 seconds)
        setTimeout(() => {
            event._moveType = originalMoveType;
            event._moveSpeed = originalMoveSpeed;
        }, 3000);
    }
    
    // Get event name (from event name or first comment)
    function getEventName(event) {
        // First check if the event has a name
        if (event.event().name) {
            return event.event().name;
        }
        
        // If no name, check the first comment in the first page
        const pages = event.event().pages;
        if (pages && pages.length > 0) {
            const firstPage = pages[0];
            if (firstPage.list && firstPage.list.length > 0) {
                for (let command of firstPage.list) {
                    if (command.code === 108 || command.code === 408) { // Comment commands
                        // Look for a name tag like: name:crate or @name:barrel
                        const comment = command.parameters[0];
                        const nameMatch = comment.match(/(?:@?name\s*:\s*)(\w+)/i);
                        if (nameMatch) {
                            return nameMatch[1];
                        }
                    }
                }
            }
        }
        
        return 'unknown';
    }
    
    // Destroy an event
    function destroyEvent(event) {
        // Create destruction effect (optional - you can customize this)
        $gameMap.requestRefresh();
        
        // You could add particle effects, screen shake, etc. here
        
        // Temporarily hide the event
        event._characterName = '';
        event._characterIndex = 0;
        event.refresh();
        
        // Optionally set a switch or variable to permanently remove it
        // $gameSwitches.setValue(someId, true);
        
        // Or erase the event entirely
        $gameMap._events[event._eventId] = null;
    }
    
    // Launch an event forward in the kick direction
    function launchEvent(event, kickDirection) {
        // Events get propelled forward in the same direction as the kick
        const launchDirection = kickDirection;
        
        // Calculate target position
        let targetX = event.x;
        let targetY = event.y;
        
        for (let i = 0; i < KICK_CONFIG.LAUNCH_DISTANCE; i++) {
            const nextX = $gameMap.roundXWithDirection(targetX, launchDirection);
            const nextY = $gameMap.roundYWithDirection(targetY, launchDirection);
            
            // Check if the next position is passable
            if (event.canPass(targetX, targetY, launchDirection)) {
                targetX = nextX;
                targetY = nextY;
            } else {
                break; // Stop if we hit an obstacle
            }
        }
        
        // Animate the launch
        animateLaunch(event, targetX, targetY);
    }
    
    // Animate the launch movement
    function animateLaunch(event, targetX, targetY) {
        const startX = event.x;
        const startY = event.y;
        
        if (startX === targetX && startY === targetY) {
            return; // No movement needed
        }
        
        // Set the event to be "through" temporarily so it can move through other events
        const originalThrough = event._through;
        event._through = true;
        
        // Calculate movement steps
        const deltaX = targetX - startX;
        const deltaY = targetY - startY;
        const distance = Math.abs(deltaX) + Math.abs(deltaY);
        
        let currentStep = 0;
        
        const moveStep = () => {
            if (currentStep >= distance) {
                // Movement complete, restore original through setting
                event._through = originalThrough;
                return;
            }
            
            // Calculate next position
            const progress = (currentStep + 1) / distance;
            const nextX = Math.round(startX + deltaX * progress);
            const nextY = Math.round(startY + deltaY * progress);
            
            // Move the event
            event.setPosition(nextX, nextY);
            
            currentStep++;
            
            // Schedule next step
            setTimeout(moveStep, KICK_CONFIG.LAUNCH_SPEED * 16); // Convert frames to milliseconds
        };
        
        // Make the event face away from the player when launched
        if (!event.isDirectionFixed()) {
            const px = $gamePlayer.x;
            const py = $gamePlayer.y;
            const ex = event.x;
            const ey = event.y;
            const dx = px - ex;
            const dy = py - ey;
            let dir;
            if (Math.abs(dx) > Math.abs(dy)) {
              // more horizontal than vertical
              dir = dx > 0 ? 6 : 4;  // 6 = right, 4 = left
            } else {
              // more vertical than horizontal
              dir = dy > 0 ? 2 : 8;  // 2 = down, 8 = up
            }
            event.setDirection(dir);
        }
        
        // Start the animation
        moveStep();
    }
})();