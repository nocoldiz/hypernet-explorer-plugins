/*:
 * @target MZ
 * @plugindesc Map Puzzle System ,  Sokoban rocks, ice, pressure plates, crystal switches, torches,
 * arrows, crackable walls, levers/gates, conveyors, warp pads, timed tiles, color tiles,
 * light beams, clones, magnetic objects, counterweights, water fill, and more.
 * @author esoteric-heavy-industries
 *
 * ─── PUSH / SOKOBAN ──────────────────────────────────────────────────────────
 * @command setPushable
 * @text Set Pushable Rock/Box
 * @desc Mark an event as a pushable object. Player walks into it to push.
 * Self-setup: <puzzle:pushable maxPushes=0 group="room1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg maxPushes
 * @type number @min 0 @default 0 @text Max Pushes (0 = unlimited)
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setPit
 * @text Set Pit / Hole (event)
 * @desc Event-based pit. Pushables landing here fill it and both disappear.
 * Self-setup: <puzzle:pit group="room1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setPitRegion
 * @text Set Pit Region
 * @desc Region ID behaves as a pit: player takes damage and returns to last safe tile.
 * Self-setup (map setup event): <puzzle:regionPit id=6 damage=0>
 * @arg regionId
 * @type number @min 1 @max 255 @text Region ID
 * @arg damage
 * @type number @min 0 @default 0 @text HP damage (0 = no damage, just warp back)
 *
 * @command clearPitRegion
 * @text Clear Pit Region
 * @arg regionId
 * @type number @min 1 @max 255 @text Region ID
 *
 * @command setPuzzleGoal
 * @text Set Goal Event
 * @desc Marks an event as a completion condition for its group. Puzzle is solved when all
 * goal events in the group have Self Switch A ON. Place alongside another puzzle tag.
 * Self-setup: <puzzle:goal>  (group inferred from co-registered puzzle tag on same event)
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command checkPuzzleSolved
 * @text Check Puzzle Solved
 * @desc Sets a switch when all goal events in the group have Self Switch A ON. Plays Fanfare1 when solved.
 * Self-setup (auto-check + switch): <puzzle:solveCheck group="room1" switch=10>
 * @arg puzzleId
 * @type string @text Puzzle Group ID
 * @arg switchId
 * @type switch @text Switch to Set on Solved
 *
 * @command resetPuzzle
 * @text Reset Puzzle
 * @desc Restores all pushable/lever/torch/clone events in a group to initial state.
 * Self-setup (interact to reset): <puzzle:resetShrine group="room1">
 * @arg puzzleId
 * @type string @text Puzzle Group ID
 *
 * @command undoStep
 * @text Undo Last Push
 * @desc Reverts the last pushed rock/box move (up to 20 moves back).
 * Self-setup (interact to undo): <puzzle:undoShrine>
 *
 * ─── PLATES & GATES ──────────────────────────────────────────────────────────
 * @command setPressurePlate
 * @text Set Pressure Plate
 * @desc Activates a switch while a pushable (or player) stands on this event's tile.
 * Self-setup: <puzzle:plate switch=11 requireObject=true group="plate1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg switchId
 * @type switch @text Switch to Activate
 * @arg requireObject
 * @type boolean @default false @text Require Object (not player)
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setTimedPlate
 * @text Set Timed Pressure Plate
 * @desc Plate must be held for N seconds before it fires. Resets if left early.
 * Self-setup: <puzzle:timedPlate switch=22 holdSeconds=3 requireObject=false group="timed1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg switchId
 * @type switch @text Switch to Activate
 * @arg holdSeconds
 * @type number @min 1 @default 3 @text Seconds to Hold
 * @arg requireObject
 * @type boolean @default false @text Require Object (not player)
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setLever
 * @text Set Lever
 * @desc Interactable event that toggles on/off when the player presses Action.
 * Self-setup: <puzzle:lever group="lv1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setGate
 * @text Set Gate
 * @desc Barrier that opens when lever logic resolves to true.
 * Self-setup: <puzzle:gate levers="1,2" logic=AND group="gate2a">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg leverIds
 * @type string @text Lever Event IDs (comma-separated)
 * @arg logicMode
 * @type select @text Logic Mode
 * @option AND @value AND
 * @option OR @value OR
 * @option XOR @value XOR
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * ─── ICE / FLOOR ─────────────────────────────────────────────────────────────
 * @command setIceRegion
 * @text Set Ice Region
 * @desc Region ID tiles behave as ice: player and rocks slide until hitting a wall.
 * Self-setup (map setup event): <puzzle:regionIce id=5>
 * @arg regionId
 * @type number @min 1 @max 255 @text Region ID
 *
 * @command clearIceRegion
 * @text Clear Ice Region
 * @arg regionId
 * @type number @min 1 @max 255 @text Region ID
 *
 * @command setArrowTile
 * @text Set Arrow Tile
 * @desc Player is forced one step in a direction when stepping on this event.
 * Self-setup: <puzzle:arrow dir=right>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg direction
 * @type select @text Direction
 * @option Up @value up
 * @option Down @value down
 * @option Left @value left
 * @option Right @value right
 *
 * @command setConveyorRegion
 * @text Set Conveyor Region
 * @desc Region that pushes player/objects each N steps.
 * Self-setup (map setup event): <puzzle:regionConveyor id=7 dir=right speed=1>
 * @arg regionId
 * @type number @min 1 @max 255 @text Region ID
 * @arg direction
 * @type select @text Direction
 * @option Up @value up
 * @option Down @value down
 * @option Left @value left
 * @option Right @value right
 * @arg speed
 * @type number @min 1 @default 1 @text Steps between pushes (1 = every step)
 *
 * @command clearConveyorRegion
 * @text Clear Conveyor Region
 * @arg regionId
 * @type number @min 1 @max 255 @text Region ID
 *
 * ─── CRYSTAL SWITCHES ────────────────────────────────────────────────────────
 * @command setCrystalSwitch
 * @text Set Crystal Switch
 * @desc Flips all crystal blocks in a group when interacted with.
 * Self-setup: <puzzle:crystalSwitch group="red">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg groupId
 * @type string @text Crystal Group ID
 *
 * @command setCrystalBlock
 * @text Set Crystal Block
 * @desc Alternates between solid/passable when its crystal switch is hit.
 * Event pages: page 1 = solid sprite, page 2 (Self A=ON) = open sprite.
 * Self-setup: <puzzle:crystalBlock group="red" start=solid>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg groupId
 * @type string @text Crystal Group ID
 * @arg startState
 * @type select @text Starting State
 * @option Solid @value solid
 * @option Open @value open
 *
 * @command flipCrystalGroup
 * @text Flip Crystal Group (manual)
 * @arg groupId
 * @type string @text Crystal Group ID
 *
 * ─── TORCHES ─────────────────────────────────────────────────────────────────
 * @command setTorch
 * @text Set Torch
 * @desc Torch that can be lit/extinguished. Event page 2 (Self A=ON) = lit sprite.
 * Self-setup: <puzzle:torch lit=false spread=true timer=0 group="torches1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg lit
 * @type boolean @default false @text Starts Lit
 * @arg spreadFire
 * @type boolean @default true @text Spreads fire to orthogonal torches
 * @arg timerSeconds
 * @type number @min 0 @default 0 @text Auto-extinguish after N seconds (0=never)
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command lightTorch
 * @text Light Torch
 * @arg eventId
 * @type number @min 1 @text Event ID
 *
 * @command checkAllTorches
 * @text Check All Torches Lit
 * @desc Sets a switch when every torch in the group is lit.
 * Self-setup (persistent auto-check on any event): <puzzle:torchCheck group="torches1" switch=13>
 * @arg puzzleId
 * @type string @text Puzzle Group ID
 * @arg switchId
 * @type switch @text Switch to Set
 *
 * ─── COLOR TILES / LIGHTS-OUT ────────────────────────────────────────────────
 * @command setColorTile
 * @text Set Color Tile
 * @desc Tile cycles through states when stepped on. Uses Self Switches A+B for 4 states.
 * Event pages: p1=A:off B:off, p2=A:on B:off, p3=A:off B:on, p4=A:on B:on.
 * Self-setup: <puzzle:colorTile states=2 group="lightsout">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg numColors
 * @type number @min 2 @max 4 @default 2 @text Number of states (2-4)
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setLightsOut
 * @text Set Lights-Out Toggle
 * @desc When this tile is toggled, it also toggles its neighbor tiles.
 * Self-setup: <puzzle:lightsOutLink neighbors="5,7,11,13">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg neighborIds
 * @type string @text Neighbor Event IDs (comma-separated)
 *
 * @command checkColorGoal
 * @text Check Color Goal
 * @desc Sets a switch when all color tiles in the group are on the target state.
 * Self-setup (persistent auto-check on any event): <puzzle:colorCheck group="lightsout" target=0 switch=44>
 * @arg puzzleId
 * @type string @text Puzzle Group ID
 * @arg targetState
 * @type number @min 0 @max 3 @default 0 @text Target State Index
 * @arg switchId
 * @type switch @text Switch to Set
 *
 * ─── DOORS & LOCKS ───────────────────────────────────────────────────────────
 * @command setColorDoor
 * @text Set Color Door
 * @desc Door that opens when player interacts with correct key item in inventory.
 * Self-setup: <puzzle:colorDoor item=7 consume=true group="door1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg keyItemId
 * @type item @text Required Key Item
 * @arg consumeKey
 * @type boolean @default true @text Consume key on use
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setComboLock
 * @text Set Combo Lock
 * @desc Interactable that fires a switch when a variable equals the target value.
 * Self-setup: <puzzle:comboLock variable=10 target=1331 switch=44>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg variableId
 * @type variable @text Variable to Check
 * @arg targetValue
 * @type number @text Correct Value
 * @arg switchId
 * @type switch @text Switch to Set on Correct
 *
 * ─── WARP & OBSTACLES ────────────────────────────────────────────────────────
 * @command setWarpTile
 * @text Set Warp Tile
 * @desc Warps player to targetX,targetY on the same map when stepped on.
 * Self-setup: <puzzle:warp x=12 y=4>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg targetX
 * @type number @min 0 @text Target X
 * @arg targetY
 * @type number @min 0 @text Target Y
 *
 * @command setCrackableWall
 * @text Set Crackable Wall
 * @desc Wall destroyed when player interacts holding the required item.
 * Self-setup: <puzzle:crackable item=7 consume=false group="wall1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg requireItemId
 * @type item @text Required Item
 * @arg consumeItem
 * @type boolean @default true @text Consume item on use
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * ─── TIMED TILES ─────────────────────────────────────────────────────────────
 * @command setTimedTile
 * @text Set Timed Tile (Disappearing)
 * @desc Tile erases N steps after the player first steps on it.
 * Self-setup: <puzzle:timedTile steps=3 group="decay1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg disappearSteps
 * @type number @min 1 @default 3 @text Steps Until Disappear
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setBlinkPlatform
 * @text Set Blinking Platform
 * @desc Platform blinks on/off on a frame timer.
 * Self-setup: <puzzle:blinkPlatform on=60 off=40>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg onFrames
 * @type number @min 1 @default 60 @text Frames Visible
 * @arg offFrames
 * @type number @min 1 @default 40 @text Frames Hidden
 *
 * ─── ENVIRONMENT ─────────────────────────────────────────────────────────────
 * @command setEyeStatue
 * @text Set Eye Statue
 * @desc Statue fires a switch when player is in its line-of-sight cone.
 * Self-setup: <puzzle:eyeStatue range=6 switch=40>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg visionRange
 * @type number @min 1 @default 4 @text Vision Range (tiles)
 * @arg switchId
 * @type switch @text Switch (ON while player seen)
 *
 * @command setStateTile
 * @text Set State Tile (Season/Time)
 * @desc Event passability changes based on a variable value (Oracle of Seasons style).
 * Self-setup: <puzzle:stateTile variable=20 passable="1,3">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg stateVariableId
 * @type variable @text State Variable
 * @arg passableStates
 * @type string @default "" @text Passable when variable = these values (comma-separated, empty=always)
 *
 * ─── MAGNETIC OBJECTS ────────────────────────────────────────────────────────
 * @command setMagnetic
 * @text Set Magnetic Object
 * @desc Marks an event as magnetic. Pair with a magnetConsole event to move it.
 * Self-setup: <puzzle:magnetic>
 * @arg eventId
 * @type number @min 1 @text Event ID
 *
 * @command activateMagnet
 * @text Activate Magnet
 * @desc Slides all magnetic objects within range toward (attract) or away (repel) from player.
 * Self-setup (console event that triggers on interact): <puzzle:magnetConsole polarity=attract range=5 steps=3>
 * @arg polarity
 * @type select @text Polarity
 * @option Attract (pull toward player) @value attract
 * @option Repel (push away from player) @value repel
 * @arg range
 * @type number @min 1 @default 5 @text Max range to affect
 * @arg steps
 * @type number @min 1 @default 1 @text Tiles to slide per activation
 *
 * ─── COUNTERWEIGHT ───────────────────────────────────────────────────────────
 * @command setCounterweight
 * @text Set Counterweight Pair
 * @desc Standing on event A makes event B passable (rises). Linked like a scale.
 * Self-setup (place on event A): <puzzle:counterweightA partner=2>
 * @arg eventIdA
 * @type number @min 1 @text Platform Event ID (stand here)
 * @arg eventIdB
 * @type number @min 1 @text Gate Event ID (rises when A is pressed)
 *
 * ─── LIGHT BEAM ──────────────────────────────────────────────────────────────
 * @command setBeamEmitter
 * @text Set Beam Emitter
 * @desc Event emits a beam in a direction. Recalculated every frame.
 * Self-setup: <puzzle:beamEmitter dir=right>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg direction
 * @type select @text Direction
 * @option Up @value up
 * @option Down @value down
 * @option Left @value left
 * @option Right @value right
 *
 * @command setMirror
 * @text Set Mirror
 * @desc Reflective event. Interact to toggle between / and \ orientation.
 * Self-setup: <puzzle:mirror orientation=slash>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg orientation
 * @type select @text Starting Orientation
 * @option Slash  (/ deflects right→up, left→down) @value slash
 * @option Backslash (\ deflects right→down, left→up) @value backslash
 *
 * @command setBeamReceiver
 * @text Set Beam Receiver
 * @desc Sets a switch when a beam hits this event.
 * Self-setup: <puzzle:beamReceiver switch=21>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg switchId
 * @type switch @text Switch to Set when Hit
 *
 * @command checkInBeamPath
 * @text Check In Beam Path
 * @desc Sets a switch based on whether an event is currently in an active beam path.
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg switchId
 * @type switch @text Switch to Set
 *
 * ─── CLONE / SHADOW ──────────────────────────────────────────────────────────
 * @command setClone
 * @text Set Clone / Shadow
 * @desc Event mirrors player movement. invertX/invertY flips the axis.
 * Self-setup: <puzzle:clone invertX=true invertY=false group="clone1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg invertX
 * @type boolean @default false @text Invert X (move opposite horizontal)
 * @arg invertY
 * @type boolean @default false @text Invert Y (move opposite vertical)
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command stopClone
 * @text Stop Clone
 * @desc Removes clone tracking from an event.
 * @arg eventId
 * @type number @min 1 @text Event ID
 *
 * ─── WATER FILL ──────────────────────────────────────────────────────────────
 * @command setWaterSource
 * @text Set Water Source
 * @desc Event that emits water when activated. Use activateSwitch to tie activation to a switch.
 * Self-setup: <puzzle:waterSource active=false activateSwitch=50>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg active
 * @type boolean @default true @text Starts Active
 *
 * @command activateWaterSource
 * @text Activate / Deactivate Water Source
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg active
 * @type boolean @default true @text Active
 *
 * @command setWaterChannel
 * @text Set Water Channel
 * @desc Event that can be filled by adjacent water. Sets a switch when filled.
 * Event page 2 (Self A=ON) = filled/wet sprite.
 * Self-setup: <puzzle:waterChannel switch=0 group="water1">
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg switchId
 * @type switch @default 0 @text Switch to Set When Filled (0 = none)
 * @arg puzzleId
 * @type string @default "" @text Puzzle Group ID
 *
 * @command setWaterDrain
 * @text Set Water Drain
 * @desc Event that blocks water propagation (acts as a sink).
 * Self-setup: <puzzle:waterDrain>
 * @arg eventId
 * @type number @min 1 @text Event ID
 *
 * @command checkWaterReached
 * @text Check Water Reached Event
 * @desc Sets a switch if the given channel event is currently filled.
 * Self-setup (persistent auto-check on any event): <puzzle:waterCheck switch=61>
 * @arg eventId
 * @type number @min 1 @text Event ID
 * @arg switchId
 * @type switch @text Switch to Set
 *
 * ─── SCRAMBLER ───────────────────────────────────────────────────────────
 * No plugin command: put a plain comment "Scrambler" on an event page and the
 * event glitches its graphic through other tiles of this map, then settles back
 * on its own. Optional attributes:
 *   Scrambler mode=flicker|cycle|chaos tiles=5 rate=1
 * mode is rolled at random when left out: flicker keeps one impostor, cycle
 * rotates the pool, chaos picks at random. rate scales how often it glitches.
 *
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'MapPuzzleSystem';

    // =========================================================================
    // Storage
    // =========================================================================

    function createVolatilePuzzleData() {
        return {
            // Push / Sokoban
            pushables: {},  // id → { maxPushes, pushCount, puzzleId, initialX, initialY }
            bridges: {},  // id → { horizontal, vertical }
            pits: {},  // id → { filled, puzzleId }
            pitRegions: {},  // regionId → { damage }
            undoStack: [],
            // Goal / solve system
            goalEvents: {},  // id → { puzzleId } ,  Self Switch A = ON means active
            // Plates & gates
            plates: {},  // id → { switchId, requireObject, puzzleId, active }
            timedPlates: {},  // id → { switchId, holdSeconds, requireObject, puzzleId, heldFrames, armed }
            levers: {},  // id → { state, puzzleId }
            gates: {},  // id → { leverIds[], logicMode, puzzleId, open }
            // Floor
            iceRegions: [],
            arrowTiles: {},  // id → { direction }
            conveyors: {},  // regionId → { direction, speed }
            conveyorCounter: 0,
            // Crystal switches
            crystalSwitches: {},  // id → { groupId }
            crystalBlocks: {},  // id → { groupId, state }
            // Torches
            torches: {},  // id → { lit, spreadFire, timerSeconds, puzzleId, timer }
            // Color tiles / Lights-Out
            colorTiles: {},  // id → { numColors, currentState, puzzleId }
            lightsOutLinks: {},  // id → neighborIds[]
            // Doors & locks
            colorDoors: {},  // id → { keyItemId, consumeKey, puzzleId }
            comboLocks: {},  // id → { variableId, targetValue, switchId }
            // Warp / obstacles
            warpTiles: {},  // id → { targetX, targetY }
            crackableWalls: {},  // id → { requireItemId, consumeItem, puzzleId }
            // Timed tiles
            timedTiles: {},  // id → { disappearSteps, stepCount, triggered, puzzleId }
            blinkPlatforms: {},  // id → { onFrames, offFrames, frameCount, visible }
            // Environment
            eyeStatues: {},  // id → { visionRange, switchId }
            stateTiles: {},  // id → { stateVariableId, passableStates[] }
            // Magnetic
            magneticObjects: {},  // id → {}
            // Counterweights
            counterweights: {},  // idA → { partnerEventId }
            // Beam
            beamEmitters: {},  // id → { direction }
            mirrors: {},  // id → { orientation: 'slash'|'backslash' }
            beamReceivers: {},  // id → { switchId, active }
            beamPath: [],  // [{x,y}] current frame path
            beamSegments: [], // [{x1,y1,x2,y2}] visual segments
            // Clone / shadow
            clones: {},  // id → { invertX, invertY, puzzleId, initialX, initialY }
            // Water fill
            waterSources: {},  // id → { active }
            waterChannels: {},  // id → { filled, switchId, puzzleId }
            waterDrains: {},  // id → {}
            // Self-setup: persistent auto-checks
            solveChecks: {},  // id → { puzzleId, switchId }
            torchChecks: {},  // id → { puzzleId, switchId }
            colorChecks: {},  // id → { puzzleId, targetState, switchId }
            waterChecks: {},  // id → { switchId }
            waterSourceActivations: {},  // id → { switchId } (activate source when switch ON)
            // Self-setup: interactive / shrine types
            resetShrines: {},  // id → { puzzleId }
            undoShrines: {},  // id → true
            variableLevers: {},  // id → { variableId, increment }
            magnetConsoles: {},  // id → { polarity, range, steps }
            reflectionPools: {},  // id → { swapWithId }
            keyGrants: {},  // id → { itemId, quantity }
            _needsRefresh: true,
        };
    }

    function puzzleData() {
        if (!$gameSystem._puzzleData) {
            $gameSystem._puzzleData = {
                // Persistent cross-map data
                solvedGroups: {},  // groupId → true ,  currently solved (all goals active)
                _skipNextReset: false, // set by warp tiles so teleport doesn't reset puzzles
                lastSafeX: 0,
                lastSafeY: 0,
                ...createVolatilePuzzleData()
            };
        }
        return $gameSystem._puzzleData;
    }

    function resetVolatilePuzzleData() {
        if ($gameSystem._puzzleData) {
            Object.assign($gameSystem._puzzleData, createVolatilePuzzleData());
        }
    }

    // The per-map puzzle collections (everything volatile except scalar flags).
    const VOLATILE_COLLECTION_KEYS = (function () {
        const sample = createVolatilePuzzleData();
        return Object.keys(sample).filter(k => sample[k] && typeof sample[k] === 'object');
    })();

    // True only when the CURRENT map actually holds puzzle elements. $gameSystem
    // ._puzzleData persists for the whole session once created, so the hot
    // per-character branches (screenZ / canPass / collision / passability) would
    // otherwise run on every character on every non-puzzle map. Result is
    // memoized per frame so the many per-character calls cost one scan at most.
    function mapHasPuzzleElements() {
        const pd = $gameSystem && $gameSystem._puzzleData;
        if (!pd) return false;
        if (pd._mapHasPuzzleFrame === Graphics.frameCount) return pd._mapHasPuzzleCached;
        let has = false;
        for (const k of VOLATILE_COLLECTION_KEYS) {
            const v = pd[k];
            if (Array.isArray(v) ? v.length > 0 : (v && Object.keys(v).length > 0)) { has = true; break; }
        }
        pd._mapHasPuzzleFrame = Graphics.frameCount;
        pd._mapHasPuzzleCached = has;
        return has;
    }

    function requestPuzzleRefresh() {
        if ($gameSystem && $gameSystem._puzzleData) {
            $gameSystem._puzzleData._needsRefresh = true;
            // Bump a coarse state version so caches that depend on puzzle state
            // (e.g. beam retrace, which is blocked by through-toggled events) can
            // detect that something logic-relevant changed.
            $gameSystem._puzzleData._stateVersion =
                ($gameSystem._puzzleData._stateVersion || 0) + 1;
        }
    }

    // Cheap signature of everything that can move onto/through puzzle tiles this
    // frame: puzzle actors, pushables, clones, and eye-statue facing/positions.
    // Memoized per frame so the plate/counterweight/statue/timed-plate scans can
    // be skipped while nothing has moved. Built lazily and only when needed.
    function puzzleMovementSignature() {
        const pd = $gameSystem._puzzleData;
        if (!pd) return '';
        if (pd._moveSigFrame === Graphics.frameCount) return pd._moveSigCached;
        let sig = '';
        const actors = getPuzzleActors();
        for (let i = 0; i < actors.length; i++) sig += actors[i].x + ',' + actors[i].y + ';';
        sig += '|';
        for (const pid of Object.keys(pd.pushables)) {
            const e = getEvent(+pid);
            if (e) sig += pid + ':' + e.x + ',' + e.y + ';';
        }
        sig += '|';
        for (const cid of Object.keys(pd.clones)) {
            const e = getEvent(+cid);
            if (e) sig += cid + ':' + e.x + ',' + e.y + ';';
        }
        sig += '|';
        for (const sid of Object.keys(pd.eyeStatues)) {
            const e = getEvent(+sid);
            if (e) sig += sid + ':' + e.x + ',' + e.y + ',' + e.direction() + ';';
        }
        pd._moveSigFrame = Graphics.frameCount;
        pd._moveSigCached = sig;
        return sig;
    }

    const _gameSwitches_onChange = Game_Switches.prototype.onChange;
    Game_Switches.prototype.onChange = function () {
        _gameSwitches_onChange.call(this);
        requestPuzzleRefresh();
    };

    const _gameVariables_onChange = Game_Variables.prototype.onChange;
    Game_Variables.prototype.onChange = function () {
        _gameVariables_onChange.call(this);
        requestPuzzleRefresh();
    };

    // =========================================================================
    // =========================================================================
    // Debug logging
    // =========================================================================

    function puzzleLog(...args) { console.log('[Puzzle]', ...args); }

    function evLabel(id) {
        const pd = puzzleData();
        // i18n-ignore-start  puzzleLog labels, console only
        const fmt = (type, group) =>
            group ? `"${type} ev${id}" of group "${group}"` : `"${type} ev${id}"`;
        // i18n-ignore-end
        /* eslint-disable no-multi-spaces */
        if (pd.pushables[id]) return fmt('pushable', pd.pushables[id].puzzleId);
        if (pd.bridges[id]) return fmt('bridge', pd.bridges[id].horizontal ? 'horizontal' : pd.bridges[id].vertical ? 'vertical' : '');
        if (pd.pits[id]) return fmt('pit', pd.pits[id].puzzleId);
        if (pd.goalEvents[id]) return fmt('goal', pd.goalEvents[id].puzzleId);
        if (pd.solveChecks[id]) return fmt('solveCheck', pd.solveChecks[id].puzzleId);
        if (pd.plates[id]) return fmt('plate', pd.plates[id].puzzleId);
        if (pd.timedPlates[id]) return fmt('timedPlate', pd.timedPlates[id].puzzleId);
        if (pd.levers[id]) return fmt('lever', pd.levers[id].puzzleId);
        if (pd.gates[id]) return fmt('gate', pd.gates[id].puzzleId);
        if (pd.crystalSwitches[id]) return fmt('crystalSwitch', pd.crystalSwitches[id].groupId);
        if (pd.crystalBlocks[id]) return fmt('crystalBlock', pd.crystalBlocks[id].groupId);
        if (pd.torches[id]) return fmt('torch', pd.torches[id].puzzleId);
        if (pd.torchChecks[id]) return fmt('torchCheck', pd.torchChecks[id].puzzleId);
        if (pd.colorTiles[id]) return fmt('colorTile', pd.colorTiles[id].puzzleId);
        if (pd.colorChecks[id]) return fmt('colorCheck', pd.colorChecks[id].puzzleId);
        if (pd.colorDoors[id]) return fmt('colorDoor', pd.colorDoors[id].puzzleId);
        if (pd.crackableWalls[id]) return fmt('crackable', pd.crackableWalls[id].puzzleId);
        if (pd.timedTiles[id]) return fmt('timedTile', pd.timedTiles[id].puzzleId);
        if (pd.clones[id]) return fmt('clone', pd.clones[id].puzzleId);
        if (pd.waterChannels[id]) return fmt('waterChannel', pd.waterChannels[id].puzzleId);
        if (pd.resetShrines[id]) return fmt('resetShrine', pd.resetShrines[id].puzzleId);
        if (pd.arrowTiles[id]) return fmt('arrow', pd.arrowTiles[id].direction);
        if (pd.warpTiles[id]) return fmt('warp', `(${pd.warpTiles[id].targetX},${pd.warpTiles[id].targetY})`);
        if (pd.blinkPlatforms[id]) return fmt('blinkPlatform', '');
        if (pd.eyeStatues[id]) return fmt('eyeStatue', '');
        if (pd.magneticObjects[id]) return fmt('magnetic', '');
        if (pd.magnetConsoles[id]) return fmt('magnetConsole', pd.magnetConsoles[id].polarity);
        if (pd.mirrors[id]) return fmt('mirror', pd.mirrors[id].orientation);
        if (pd.beamEmitters[id]) return fmt('beamEmitter', pd.beamEmitters[id].direction);
        if (pd.beamReceivers[id]) return fmt('beamReceiver', '');
        if (pd.waterSources[id]) return fmt('waterSource', '');
        if (pd.waterDrains[id]) return fmt('waterDrain', '');
        if (pd.waterChecks[id]) return fmt('waterCheck', '');
        if (pd.undoShrines[id]) return fmt('undoShrine', '');
        if (pd.variableLevers[id]) return fmt('variableLever', '');
        if (pd.reflectionPools[id]) return fmt('reflectionPool', '');
        if (pd.keyGrants[id]) return fmt('keyGrant', '');
        if (pd.comboLocks[id]) return fmt('comboLock', '');
        if (pd.stateTiles[id]) return fmt('stateTile', '');
        if (pd.counterweights[id]) return fmt('counterweightA', '');
        /* eslint-enable no-multi-spaces */
        return `ev${id}`;
    }

    // =========================================================================
    // Direction utilities
    // =========================================================================

    const DIR_STR = { 2: 'down', 4: 'left', 6: 'right', 8: 'up' };
    const DIR_MAP = { up: 8, down: 2, left: 4, right: 6 };
    const DIR_D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const MZ_DELTA = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] };

    function mzDir(s) { return (typeof s === 'string') ? DIR_MAP[s] : s; }
    function delta(d) {
        return (typeof d === 'string') ? (DIR_D[d] || [0, 0]) : (MZ_DELTA[d] || [0, 0]);
    }

    // Beam reflection tables
    const REFLECT_SLASH = { right: 'up', left: 'down', up: 'right', down: 'left' };
    const REFLECT_BSLASH = { right: 'down', left: 'up', up: 'left', down: 'right' };

    // =========================================================================
    // Shared utilities
    // =========================================================================

    function getEvent(id) { return $gameMap.event(id); }

    function getPuzzleActors() {
        const actors = [$gamePlayer];
        if (
            window.$gameSplitScreen &&
            window.$gameSplitScreen.active &&
            window.$gameSplitScreen.p2Event
        ) {
            actors.push(window.$gameSplitScreen.p2Event);
        }
        return actors;
    }

    function eventsAt(x, y, excludeId) {
        return $gameMap.events().filter(e =>
            e.x === x && e.y === y && e.eventId() !== excludeId && !e._erased
        );
    }

    function canPassTile(x, y) {
        if (getBridgeAt(x, y)) return true;
        return $gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 4) ||
            $gameMap.isPassable(x, y, 6) || $gameMap.isPassable(x, y, 8);
    }

    const PUSHABLE_BLOCKED_TERRAIN = [4, 7];

    function blockedForPushable(x, y, excludeId, dx, dy) {
        if (!$gameMap.isValid(x, y)) return true;
        // Mirror Game_Character.canPass: check source-tile exit AND destination-tile entry.
        const d = dx === 1 ? 6 : dx === -1 ? 4 : dy === 1 ? 2 : 8;
        const rd = 10 - d; // reverse direction (MZ convention)
        const currentBridge = getBridgeAt(x - dx, y - dy);
        const targetBridge = getBridgeAt(x, y);

        const exitPassable = currentBridge ? isBridgeCompatible(currentBridge, d) : $gameMap.isPassable(x - dx, y - dy, d);
        const entryPassable = targetBridge ? isBridgeCompatible(targetBridge, rd) : $gameMap.isPassable(x, y, rd);

        if (!exitPassable) return true; // source can't exit
        if (!entryPassable) return true; // dest can't be entered
        if (PUSHABLE_BLOCKED_TERRAIN.includes($gameMap.terrainTag(x, y))) return true;

        // Player check
        if (
            getPuzzleActors().some(
                (p) => p.x === x && p.y === y && !p.isThrough()
            )
        )
            return true;

        const pd = puzzleData();
        return eventsAt(x, y, excludeId).some(e => {
            const eid = e.eventId();
            if (e._priorityType === 0) return false; // below characters ,  never blocks pushables
            // Whitelist floor-based puzzle elements that should not block pushables
            if (pd.pits[eid] || pd.plates[eid] || pd.timedPlates[eid] || pd.goalEvents[eid]) return false;
            if (pd.arrowTiles[eid] || pd.warpTiles[eid] || pd.colorTiles[eid] || pd.timedTiles[eid]) return false;
            if (pd.counterweights[eid] || pd.bridges[eid]) return false; // counterweight platform or bridge
            return !e.isThrough();
        });
    }

    function isIceTile(x, y) {
        const regionId = $gameMap.regionId(x, y);
        return regionId === 77 || puzzleData().iceRegions.includes(regionId);
    }

    function setSelfSwitch(eventId, key, value) {
        const pd = puzzleData();
        const current = $gameSelfSwitches.value([$gameMap.mapId(), eventId, key]);
        if (current !== value) {
            $gameSelfSwitches.setValue([$gameMap.mapId(), eventId, key], value);
            if (!pd._loading) {
                AudioManager.playSe({ name: value ? 'Switch1' : 'Switch2', volume: 90, pitch: 100, pan: 0 });
            }
            const ev = getEvent(eventId);
            // Skip refresh during map transitions: $dataMap may already be the new map
            // and this event ID won't exist there, crashing event.page().
            if (ev && $dataMap && $dataMap.events && $dataMap.events[eventId]) ev.refresh();
        }
    }

    function setPuzzleSwitch(switchId, value) {
        if (switchId <= 0) return;
        const pd = puzzleData();
        const current = $gameSwitches.value(switchId);
        if (current !== value) {
            $gameSwitches.setValue(switchId, value);
            if (!pd._loading) {
                AudioManager.playSe({ name: value ? 'Switch1' : 'Switch2', volume: 90, pitch: 100, pan: 0 });
            }
        }
    }

    // =========================================================================
    // Plugin commands ,  registration
    // =========================================================================

    const CMDS = {

        // ── Push / pits ──────────────────────────────────────────────────────
        setPushable(a) {
            const id = +a.eventId, ev = getEvent(id);
            if (!ev) return;
            puzzleData().pushables[id] = {
                maxPushes: +a.maxPushes || 0, pushCount: 0,
                puzzleId: a.puzzleId || '', initialX: ev.x, initialY: ev.y,
            };
            ev.setThrough(false);
        },
        setPit(a) {
            puzzleData().pits[+a.eventId] = { filled: false, puzzleId: a.puzzleId || '' };
        },
        setPitRegion(a) {
            puzzleData().pitRegions[+a.regionId] = { damage: +a.damage || 0 };
        },
        clearPitRegion(a) {
            delete puzzleData().pitRegions[+a.regionId];
        },
        setPuzzleGoal(a) {
            puzzleData().goalEvents[+a.eventId] = { puzzleId: a.puzzleId || '' };
        },
        checkPuzzleSolved(a) {
            const solved = isGroupSolved(a.puzzleId);
            setPuzzleSwitch(+a.switchId, solved);
            if (solved) AudioManager.playSe({ name: 'PixelUi/PixelUI (29)', volume: 90, pitch: 100, pan: 0 });
        },
        resetPuzzle(a) { resetPuzzle(a.puzzleId); },
        undoStep() { undoLastPush(); },

        // ── Plates & gates ───────────────────────────────────────────────────
        setPressurePlate(a) {
            puzzleData().plates[+a.eventId] = {
                switchId: +a.switchId, requireObject: a.requireObject === 'true',
                puzzleId: a.puzzleId || '', active: false,
                localSwitches: a.localSwitches
            };
        },
        setTimedPlate(a) {
            puzzleData().timedPlates[+a.eventId] = {
                switchId: +a.switchId, holdSeconds: +a.holdSeconds || 3,
                requireObject: a.requireObject === 'true',
                puzzleId: a.puzzleId || '', heldFrames: 0, armed: false,
                localSwitches: a.localSwitches
            };
        },
        setLever(a) {
            puzzleData().levers[+a.eventId] = { state: false, puzzleId: a.puzzleId || '' };
        },
        setGate(a) {
            const id = +a.eventId, ev = getEvent(id);
            const leverIds = a.leverIds.split(',').map(x => +x.trim()).filter(Boolean);
            puzzleData().gates[id] = {
                leverIds, logicMode: a.logicMode || 'AND',
                puzzleId: a.puzzleId || '', open: false,
            };
            if (ev) ev.setThrough(false);
        },

        // ── Floor ────────────────────────────────────────────────────────────
        setIceRegion(a) {
            const r = +a.regionId, pd = puzzleData();
            if (!pd.iceRegions.includes(r)) pd.iceRegions.push(r);
        },
        clearIceRegion(a) {
            const pd = puzzleData();
            pd.iceRegions = pd.iceRegions.filter(x => x !== +a.regionId);
        },
        setArrowTile(a) {
            puzzleData().arrowTiles[+a.eventId] = { direction: a.direction };
        },
        setConveyorRegion(a) {
            puzzleData().conveyors[+a.regionId] = { direction: a.direction, speed: +a.speed || 1 };
        },
        clearConveyorRegion(a) {
            delete puzzleData().conveyors[+a.regionId];
        },

        // ── Crystal ──────────────────────────────────────────────────────────
        setCrystalSwitch(a) {
            puzzleData().crystalSwitches[+a.eventId] = { groupId: a.groupId };
        },
        setCrystalBlock(a) {
            const id = +a.eventId, state = a.startState || 'solid', ev = getEvent(id);
            puzzleData().crystalBlocks[id] = { groupId: a.groupId, state };
            if (ev) {
                ev.setThrough(state === 'open');
                setSelfSwitch(id, 'A', state === 'open');
            }
        },
        flipCrystalGroup(a) { flipCrystalGroup(a.groupId); },

        // ── Torches ──────────────────────────────────────────────────────────
        setTorch(a) {
            const id = +a.eventId;
            puzzleData().torches[id] = {
                lit: a.lit === 'true', spreadFire: a.spreadFire !== 'false',
                timerSeconds: +a.timerSeconds || 0, puzzleId: a.puzzleId || '', timer: 0,
            };
            applyTorchVisual(id);
        },
        lightTorch(a) { lightTorch(+a.eventId); },
        checkAllTorches(a) { checkAllTorches(a.puzzleId, +a.switchId); },

        // ── Color tiles / Lights-Out ─────────────────────────────────────────
        setColorTile(a) {
            puzzleData().colorTiles[+a.eventId] = {
                numColors: Math.min(4, Math.max(2, +a.numColors || 2)),
                currentState: 0, puzzleId: a.puzzleId || '',
            };
        },
        setLightsOut(a) {
            const neighbors = a.neighborIds.split(',').map(x => +x.trim()).filter(Boolean);
            puzzleData().lightsOutLinks[+a.eventId] = neighbors;
        },
        checkColorGoal(a) { checkColorGoal(a.puzzleId, +a.targetState, +a.switchId); },

        // ── Doors & locks ────────────────────────────────────────────────────
        setColorDoor(a) {
            const id = +a.eventId, ev = getEvent(id);
            puzzleData().colorDoors[id] = {
                keyItemId: +a.keyItemId, consumeKey: a.consumeKey !== 'false',
                puzzleId: a.puzzleId || '',
            };
            if (ev) ev.setThrough(false);
        },
        setComboLock(a) {
            puzzleData().comboLocks[+a.eventId] = {
                variableId: +a.variableId, targetValue: +a.targetValue, switchId: +a.switchId,
            };
        },

        // ── Warp / obstacles ─────────────────────────────────────────────────
        setWarpTile(a) {
            puzzleData().warpTiles[+a.eventId] = { targetX: +a.targetX, targetY: +a.targetY };
        },
        setCrackableWall(a) {
            const id = +a.eventId, ev = getEvent(id);
            puzzleData().crackableWalls[id] = {
                requireItemId: +a.requireItemId, consumeItem: a.consumeItem !== 'false',
                puzzleId: a.puzzleId || '',
            };
            if (ev) ev.setThrough(false);
        },

        // ── Timed tiles ──────────────────────────────────────────────────────
        setTimedTile(a) {
            puzzleData().timedTiles[+a.eventId] = {
                disappearSteps: +a.disappearSteps || 3, stepCount: 0,
                triggered: false, puzzleId: a.puzzleId || '',
            };
        },
        setBlinkPlatform(a) {
            puzzleData().blinkPlatforms[+a.eventId] = {
                onFrames: +a.onFrames || 60, offFrames: +a.offFrames || 40,
                frameCount: 0, visible: true,
            };
        },

        // ── Environment ──────────────────────────────────────────────────────
        setEyeStatue(a) {
            puzzleData().eyeStatues[+a.eventId] = {
                visionRange: +a.visionRange || 4, switchId: +a.switchId,
            };
        },
        setStateTile(a) {
            const passable = a.passableStates
                ? a.passableStates.split(',').map(x => +x.trim()) : [];
            puzzleData().stateTiles[+a.eventId] = {
                stateVariableId: +a.stateVariableId, passableStates: passable,
            };
        },

        // ── Magnetic ─────────────────────────────────────────────────────────
        setMagnetic(a) {
            puzzleData().magneticObjects[+a.eventId] = {};
        },
        activateMagnet(a) {
            activateMagnet($gamePlayer, a.polarity, +a.range || 5, +a.steps || 1);
        },

        // ── Counterweight ────────────────────────────────────────────────────
        setCounterweight(a) {
            const evB = getEvent(+a.eventIdB);
            puzzleData().counterweights[+a.eventIdA] = { partnerEventId: +a.eventIdB };
            if (evB) evB.setThrough(false);
        },

        // ── Beam ─────────────────────────────────────────────────────────────
        setBeamEmitter(a) {
            puzzleData().beamEmitters[+a.eventId] = { direction: a.direction };
        },
        setMirror(a) {
            puzzleData().mirrors[+a.eventId] = { orientation: a.orientation || 'slash' };
        },
        setBeamReceiver(a) {
            puzzleData().beamReceivers[+a.eventId] = {
                switchId: +a.switchId, active: false,
                localSwitches: a.localSwitches
            };
        },
        checkInBeamPath(a) {
            const ev = getEvent(+a.eventId);
            if (!ev) return;
            const inPath = puzzleData().beamPath.some(t => t.x === ev.x && t.y === ev.y);
            setPuzzleSwitch(+a.switchId, inPath);
        },

        // ── Clone ────────────────────────────────────────────────────────────
        setClone(a) {
            const id = +a.eventId, ev = getEvent(id);
            puzzleData().clones[id] = {
                invertX: a.invertX === 'true', invertY: a.invertY === 'true',
                puzzleId: a.puzzleId || '',
                initialX: ev ? ev.x : 0, initialY: ev ? ev.y : 0,
            };
        },
        stopClone(a) { delete puzzleData().clones[+a.eventId]; },

        // ── Water ────────────────────────────────────────────────────────────
        setWaterSource(a) {
            puzzleData().waterSources[+a.eventId] = { active: a.active !== 'false' };
        },
        activateWaterSource(a) {
            const src = puzzleData().waterSources[+a.eventId];
            if (src) { src.active = a.active !== 'false'; propagateWater(); }
        },
        setWaterChannel(a) {
            puzzleData().waterChannels[+a.eventId] = {
                filled: false, switchId: +a.switchId || 0, puzzleId: a.puzzleId || '',
            };
        },
        setWaterDrain(a) {
            puzzleData().waterDrains[+a.eventId] = {};
        },
        checkWaterReached(a) {
            const ch = puzzleData().waterChannels[+a.eventId];
            setPuzzleSwitch(+a.switchId, !!(ch && ch.filled));
        },
    };

    for (const [cmd, fn] of Object.entries(CMDS)) {
        PluginManager.registerCommand(PLUGIN_NAME, cmd, fn);
    }

    // =========================================================================
    // Self-Setup Comment Parser
    // =========================================================================

    function parsePuzzleTag(text) {
        const m = text.trim().match(/^<puzzle:(\w+)([\s\S]*)>$/);
        if (!m) return null;
        const attrs = {};
        const re = /(\w+)=(?:"([^"]*)"|(\S+))/g;
        let match;
        while ((match = re.exec(m[2])) !== null)
            attrs[match[1]] = match[2] !== undefined ? match[2] : match[3];

        if (/\bhorizontal\b/i.test(m[2])) {
            attrs.horizontal = true;
        }
        if (/\bvertical\b/i.test(m[2])) {
            attrs.vertical = true;
        }
        return { type: m[1], attrs };
    }

    function resolveEventGroup(id) {
        const pd = puzzleData();
        for (const map of [pd.pushables, pd.plates, pd.timedPlates, pd.levers, pd.gates,
        pd.torches, pd.colorTiles, pd.crackableWalls, pd.clones,
        pd.waterChannels, pd.resetShrines, pd.solveChecks, pd.torchChecks]) {
            if (map[id] && map[id].puzzleId) return map[id].puzzleId;
        }
        if (pd.crystalSwitches[id]) return pd.crystalSwitches[id].groupId || '';
        if (pd.crystalBlocks[id]) return pd.crystalBlocks[id].groupId || '';
        return '';
    }

    function applyPuzzleSetup(eventId, type, attrs) {
        const pd = puzzleData();
        const a = attrs;
        const id = eventId;
        switch (type) {
            case 'pushable':
                CMDS.setPushable({ eventId: id, maxPushes: a.maxPushes || 0, puzzleId: a.group || '' });
                break;
            case 'pit':
                CMDS.setPit({ eventId: id, puzzleId: a.group || '' });
                break;
            case 'goal':
                // group may be explicit or inferred from co-registered puzzle tag
                pd.goalEvents[id] = { puzzleId: a.group || resolveEventGroup(id) };
                break;
            case 'solveCheck':
                pd.solveChecks[id] = { puzzleId: a.group || '', switchId: +(a.switch || 0) };
                break;
            case 'resetShrine':
                pd.resetShrines[id] = { puzzleId: a.group || '' };
                break;
            case 'undoShrine':
                pd.undoShrines[id] = true;
                break;
            case 'plate':
                CMDS.setPressurePlate({
                    eventId: id, switchId: a.switch || 0,
                    requireObject: a.requireObject || 'false', puzzleId: a.group || '',
                    localSwitches: { A: a.A, B: a.B, C: a.C, D: a.D }
                });
                break;
            case 'timedPlate':
                CMDS.setTimedPlate({
                    eventId: id, switchId: a.switch || 0,
                    holdSeconds: a.holdSeconds || 3, requireObject: a.requireObject || 'false',
                    puzzleId: a.group || '',
                    localSwitches: { A: a.A, B: a.B, C: a.C, D: a.D }
                });
                break;
            case 'lever':
                CMDS.setLever({ eventId: id, puzzleId: a.group || '' });
                break;
            case 'gate':
                CMDS.setGate({
                    eventId: id, leverIds: a.levers || '',
                    logicMode: a.logic || 'AND', puzzleId: a.group || ''
                });
                break;
            case 'arrow':
                CMDS.setArrowTile({ eventId: id, direction: a.dir || 'right' });
                break;
            case 'torch':
                CMDS.setTorch({
                    eventId: id, lit: a.lit || 'false',
                    spreadFire: a.spread !== undefined ? a.spread : 'true',
                    timerSeconds: a.timer || 0, puzzleId: a.group || ''
                });
                break;
            case 'torchCheck':
                pd.torchChecks[id] = { puzzleId: a.group || '', switchId: +(a.switch || 0) };
                break;
            case 'crystalSwitch':
                CMDS.setCrystalSwitch({ eventId: id, groupId: a.group || '' });
                break;
            case 'crystalBlock':
                CMDS.setCrystalBlock({ eventId: id, groupId: a.group || '', startState: a.start || 'solid' });
                break;
            case 'colorTile':
                CMDS.setColorTile({ eventId: id, numColors: a.states || 2, puzzleId: a.group || '' });
                break;
            case 'colorCheck':
                pd.colorChecks[id] = {
                    puzzleId: a.group || '', targetState: +(a.target || 0),
                    switchId: +(a.switch || 0)
                };
                break;
            case 'lightsOutLink':
                CMDS.setLightsOut({ eventId: id, neighborIds: a.neighbors || '' });
                break;
            case 'colorDoor':
                CMDS.setColorDoor({
                    eventId: id, keyItemId: a.item || 1,
                    consumeKey: a.consume !== undefined ? a.consume : 'true', puzzleId: a.group || ''
                });
                break;
            case 'comboLock':
                CMDS.setComboLock({
                    eventId: id, variableId: a.variable || 0,
                    targetValue: a.target || 0, switchId: a.switch || 0
                });
                break;
            case 'variableLever':
                pd.variableLevers[id] = { variableId: +(a.variable || 0), increment: +(a.increment || 1) };
                break;
            case 'warp':
                CMDS.setWarpTile({ eventId: id, targetX: a.x || 0, targetY: a.y || 0 });
                break;
            case 'reflectionPool':
                pd.reflectionPools[id] = { swapWithId: +(a.swapWith || 0) };
                break;
            case 'crackable':
                CMDS.setCrackableWall({
                    eventId: id, requireItemId: a.item || 1,
                    consumeItem: a.consume !== undefined ? a.consume : 'false', puzzleId: a.group || ''
                });
                break;
            case 'timedTile':
                CMDS.setTimedTile({ eventId: id, disappearSteps: a.steps || 3, puzzleId: a.group || '' });
                break;
            case 'blinkPlatform':
                CMDS.setBlinkPlatform({ eventId: id, onFrames: a.on || 60, offFrames: a.off || 40 });
                break;
            case 'eyeStatue':
                CMDS.setEyeStatue({ eventId: id, visionRange: a.range || 4, switchId: a.switch || 0 });
                break;
            case 'stateTile':
                CMDS.setStateTile({
                    eventId: id, stateVariableId: a.variable || 0,
                    passableStates: a.passable || ''
                });
                break;
            case 'magnetic':
                CMDS.setMagnetic({ eventId: id });
                break;
            case 'magnetConsole':
                pd.magnetConsoles[id] = {
                    polarity: a.polarity || 'attract',
                    range: +(a.range || 5), steps: +(a.steps || 1)
                };
                break;
            case 'counterweightA':
                CMDS.setCounterweight({ eventIdA: id, eventIdB: a.partner || 0 });
                break;
            case 'beamEmitter':
                CMDS.setBeamEmitter({ eventId: id, direction: a.dir || 'right' });
                break;
            case 'mirror':
                CMDS.setMirror({ eventId: id, orientation: a.orientation || 'slash' });
                break;
            case 'beamReceiver':
                CMDS.setBeamReceiver({
                    eventId: id, switchId: a.switch || 0,
                    localSwitches: { A: a.A, B: a.B, C: a.C, D: a.D }
                });
                break;
            case 'clone':
                CMDS.setClone({
                    eventId: id, invertX: a.invertX || 'false',
                    invertY: a.invertY || 'false', puzzleId: a.group || ''
                });
                break;
            case 'waterSource': {
                const activateSw = +(a.activateSwitch || 0);
                CMDS.setWaterSource({ eventId: id, active: a.active || 'false' });
                if (activateSw) pd.waterSourceActivations[id] = { switchId: activateSw };
                break;
            }
            case 'waterChannel':
                CMDS.setWaterChannel({ eventId: id, switchId: a.switch || 0, puzzleId: a.group || '' });
                break;
            case 'waterDrain':
                CMDS.setWaterDrain({ eventId: id });
                break;
            case 'waterCheck':
                pd.waterChecks[id] = { switchId: +(a.switch || 0) };
                break;
            case 'regionIce':
                CMDS.setIceRegion({ regionId: a.id || 1 });
                break;
            case 'regionPit':
                CMDS.setPitRegion({ regionId: a.id || 1, damage: a.damage || 0 });
                break;
            case 'regionConveyor':
                CMDS.setConveyorRegion({ regionId: a.id || 1, direction: a.dir || 'right', speed: a.speed || 1 });
                break;
            case 'keyGrant':
                pd.keyGrants[id] = { itemId: +(a.item || 0), quantity: +(a.quantity || 1) };
                break;
            case 'bridge':
                pd.bridges[id] = {
                    horizontal: a.horizontal === true || a.horizontal === 'true',
                    vertical: a.vertical === true || a.vertical === 'true'
                };
                break;
        }
    }

    function scanEventPuzzleComments(event) {
        if (!event || typeof event.event !== 'function' || !event.event()) return;
        if (event._originalMoveSpeed === undefined) event._originalMoveSpeed = event.moveSpeed();
        const page = event.page && event.page();
        if (!page || !page.list) return;
        const id = event.eventId();
        if ($gameSystem && $gameSystem._puzzleData && $gameSystem._puzzleData.bridges) {
            delete $gameSystem._puzzleData.bridges[id];
        }
        const allTags = [];
        for (const cmd of page.list) {
            if (cmd.code !== 108 && cmd.code !== 408) continue;
            const parsed = parsePuzzleTag(cmd.parameters[0] || '');
            if (parsed) allTags.push(parsed);
        }
        // Process goal tags last so resolveEventGroup finds co-registered elements
        const sorted = [...allTags.filter(t => t.type !== 'goal'), ...allTags.filter(t => t.type === 'goal')];
        let found = false;
        for (const parsed of sorted) {
            applyPuzzleSetup(id, parsed.type, parsed.attrs);
            puzzleLog(`setup ${evLabel(id)} at (${event.x},${event.y})`, parsed.attrs);
            found = true;
        }
        scanEventScramblerComments(event);
        if (!found && page.list.some(c => c.code === 108 || c.code === 408)) {
            const comments = page.list.filter(c => c.code === 108 || c.code === 408).map(c => c.parameters[0]);
            puzzleLog(`ev${id} has comments but no <puzzle:> tag:`, comments);
        }
    }

    // Mid-game page changes (self-switch toggles, conditional branches) , 
    // only runs when the event is already in $gameMap._events (i.e. not during
    // initial construction, which is handled by the Game_Map.setup hook below).
    // --- Player 2 Hooks ---

    const _Game_Event_moveStraight_p2 = Game_Event.prototype.moveStraight;
    Game_Event.prototype.moveStraight = function (d) {
        if (window.$gameSplitScreen && window.$gameSplitScreen.active && this === window.$gameSplitScreen.p2Event) {
            if (isPushLocked(this)) return; // holding position behind a moving rock
            const pd = puzzleData();
            const [dx, dy] = MZ_DELTA[d] || [0, 0];
            const nx = this.x + dx, ny = this.y + dy;

            // Try to push
            const pushable = $gameMap.events().find(e =>
                e.x === nx && e.y === ny && pd.pushables[e.eventId()] && !e._erased);

            if (pushable && tryPush(pushable.eventId(), dx, dy)) {
                beginPushLock(this, pushable.eventId());
                this.setMovementSuccess(false);
                this.setDirection(d);
                return;
            }

            moveClones(dx, dy);
        }
        _Game_Event_moveStraight_p2.call(this, d);
    };

    const _Game_Event_update_p2 = Game_Event.prototype.update;
    Game_Event.prototype.update = function () {
        _Game_Event_update_p2.call(this);
        if (window.$gameSplitScreen && window.$gameSplitScreen.active && this === window.$gameSplitScreen.p2Event) {
            updatePushLock(this);
            updatePuzzleCharacter(this, SceneManager._scene instanceof Scene_Map);
        }
    };

    const _setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function () {
        _setupPage.call(this);
        if ($gameSystem && $gameMap.event(this._eventId) === this) {
            scanEventPuzzleComments(this);
        }
    };

    const _Game_Event_canPass = Game_Event.prototype.canPass;
    Game_Event.prototype.canPass = function (x, y, d) {
        const id = this.eventId();
        const pd = mapHasPuzzleElements() ? puzzleData() : null;
        if (pd && pd.pushables[id]) {
            const x2 = $gameMap.roundXWithDirection(x, d);
            const y2 = $gameMap.roundYWithDirection(y, d);
            const dx = $gameMap.deltaX(x2, x);
            const dy = $gameMap.deltaY(y2, y);
            // Puzzle logic determines if we can pass (handles plates, pits, etc.)
            return !blockedForPushable(x2, y2, id, dx, dy);
        }
        return (_Game_Event_canPass || Game_CharacterBase.prototype.canPass).call(this, x, y, d);
    };

    const _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function () {
        const wasMoving = this.isMoving();
        _Game_Event_update.call(this);
        if (wasMoving && !this.isMoving() && $gameSystem && $gameSystem._puzzleData) {
            this.onPuzzleMoveEnd();
        }
    };

    Game_Event.prototype.onPuzzleMoveEnd = function () {
        const id = this.eventId();
        const pd = puzzleData();
        if (!pd.pushables[id] && !pd.clones[id]) return;

        const x = this.x, y = this.y;

        // Pit check
        const pitId = pitAt(x, y);
        if (pitId !== null) {
            pd.pits[pitId].filled = true;
            this.erase();
            const pitEv = getEvent(pitId);
            if (pitEv) pitEv.erase();
            propagateWater();
            updatePressurePlates();
            requestPuzzleRefresh();
            return;
        }

        // Ice slide
        if (isIceTile(x, y)) {
            // Use _lastPushDir if available to handle Direction Fix rocks correctly
            const d = this._lastPushDir || this.direction();
            const [dx, dy] = MZ_DELTA[d] || [0, 0];
            if (!blockedForPushable(x + dx, y + dy, id, dx, dy)) {
                this.setMoveSpeed(5);
                this.moveStraight(d);
                this._lastPushDir = d; // Carry over for next sliding step
                updatePressurePlates();
                propagateWater();
                requestPuzzleRefresh();
            } else {
                this.setMoveSpeed(this._originalMoveSpeed || 4);
                this._lastPushDir = undefined;
            }
        } else {
            this.setMoveSpeed(this._originalMoveSpeed || 4);
            this._lastPushDir = undefined;
        }
    };

    // =========================================================================
    // Crystal switch logic
    // =========================================================================

    function flipCrystalGroup(groupId) {
        puzzleLog(`crystalGroup flip: ${groupId}`);
        const pd = puzzleData();
        for (const [id, block] of Object.entries(pd.crystalBlocks)) {
            if (block.groupId !== groupId) continue;
            block.state = block.state === 'solid' ? 'open' : 'solid';
            puzzleLog(`  ${evLabel(+id)} → ${block.state}`);
            const ev = getEvent(+id);
            if (ev) {
                ev.setThrough(block.state === 'open');
                setSelfSwitch(+id, 'A', block.state === 'open');
            }
        }
        requestPuzzleRefresh();
    }

    // =========================================================================
    // Torch logic
    // =========================================================================

    function applyTorchVisual(id) {
        setSelfSwitch(id, 'A', !!(puzzleData().torches[id] && puzzleData().torches[id].lit));
    }

    function lightTorch(id) {
        const t = puzzleData().torches[id];
        if (!t || t.lit) return;
        puzzleLog(`lit ${evLabel(id)}`);
        t.lit = true; t.timer = 0;
        applyTorchVisual(id);
        if (t.spreadFire) spreadFire(id);
        requestPuzzleRefresh();
    }

    function extinguishTorch(id) {
        const t = puzzleData().torches[id];
        if (!t) return;
        t.lit = false; t.timer = 0;
        applyTorchVisual(id);
        requestPuzzleRefresh();
    }

    function spreadFire(srcId) {
        const src = getEvent(srcId);
        if (!src) return;
        for (const [id, t] of Object.entries(puzzleData().torches)) {
            if (+id === srcId || t.lit) continue;
            const te = getEvent(+id);
            if (te && Math.abs(te.x - src.x) + Math.abs(te.y - src.y) === 1) lightTorch(+id);
        }
    }

    function checkAllTorches(puzzleId, switchId) {
        const ids = Object.keys(puzzleData().torches)
            .filter(id => puzzleData().torches[id].puzzleId === puzzleId);
        if (!ids.length) return;
        setPuzzleSwitch(switchId, ids.every(id => puzzleData().torches[id].lit));
    }

    function updateTorchTimers() {
        for (const [id, t] of Object.entries(puzzleData().torches)) {
            if (!t.lit || t.timerSeconds <= 0) continue;
            if (++t.timer >= t.timerSeconds * 60) extinguishTorch(+id);
        }
    }

    // =========================================================================
    // Pressure plates
    // =========================================================================

    function updatePressurePlates() {
        const pd = puzzleData();
        for (const [id, plate] of Object.entries(pd.plates)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            const objOn = Object.keys(pd.pushables).some(pid => {
                const pe = getEvent(+pid);
                return pe && pe.x === ev.x && pe.y === ev.y;
            });
            const cloneOn = Object.keys(pd.clones).some(cid => {
                const ce = getEvent(+cid);
                return ce && ce.x === ev.x && ce.y === ev.y;
            });
            const actorsOn = getPuzzleActors().some(p => p.x === ev.x && p.y === ev.y);
            const active = plate.requireObject ? (objOn || cloneOn) : (objOn || cloneOn || actorsOn);
            if (active !== plate.active) {
                plate.active = active;
                setPuzzleSwitch(plate.switchId, active);
                setSelfSwitch(+id, 'A', active);
                if (plate.localSwitches) {
                    for (const [letter, eventIdStr] of Object.entries(plate.localSwitches)) {
                        if (eventIdStr) setSelfSwitch(+eventIdStr, letter, active);
                    }
                }
            }
        }
    }

    function updateTimedPlates(rescan = true) {
        const pd = puzzleData();
        for (const [id, plate] of Object.entries(pd.timedPlates)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            // Occupancy only changes when something moves; cache it and rescan
            // solely on position changes. The countdown itself still ticks every
            // frame below.
            let occupied;
            if (rescan || plate._occupiedCached === undefined) {
                const objOn = Object.keys(pd.pushables).some(pid => {
                    const pe = getEvent(+pid); return pe && pe.x === ev.x && pe.y === ev.y;
                });
                const cloneOn = Object.keys(pd.clones).some(cid => {
                    const ce = getEvent(+cid); return ce && ce.x === ev.x && ce.y === ev.y;
                });
                const actorsOn = getPuzzleActors().some(p => p.x === ev.x && p.y === ev.y);
                occupied = plate.requireObject ? (objOn || cloneOn) : (objOn || cloneOn || actorsOn);
                plate._occupiedCached = occupied;
            } else {
                occupied = plate._occupiedCached;
            }
            if (occupied) {
                plate.heldFrames++;
                if (!plate.armed && plate.heldFrames >= plate.holdSeconds * 60) {
                    plate.armed = true;
                    setPuzzleSwitch(plate.switchId, true);
                    setSelfSwitch(+id, 'A', true);
                    if (plate.localSwitches) {
                        for (const [letter, eventIdStr] of Object.entries(plate.localSwitches)) {
                            if (eventIdStr) setSelfSwitch(+eventIdStr, letter, true);
                        }
                    }
                }
            } else {
                if (plate.armed) {
                    plate.armed = false;
                    setPuzzleSwitch(plate.switchId, false);
                    setSelfSwitch(+id, 'A', false);
                    if (plate.localSwitches) {
                        for (const [letter, eventIdStr] of Object.entries(plate.localSwitches)) {
                            if (eventIdStr) setSelfSwitch(+eventIdStr, letter, false);
                        }
                    }
                }
                plate.heldFrames = 0;
            }
        }
    }

    // =========================================================================
    // Gates
    // =========================================================================

    function updateGates() {
        const pd = puzzleData();
        for (const [id, gate] of Object.entries(pd.gates)) {
            const states = gate.leverIds.map(lid => !!(pd.levers[lid] && pd.levers[lid].state));
            let open = gate.logicMode === 'AND' ? states.every(Boolean)
                : gate.logicMode === 'OR' ? states.some(Boolean)
                    : states.filter(Boolean).length % 2 === 1;
            if (open !== gate.open) {
                gate.open = open;
                const ev = getEvent(+id);
                if (ev) { ev.setThrough(open); ev.setOpacity(open ? 80 : 255); }
            }
        }
    }

    // =========================================================================
    // Push logic (Sokoban)
    // =========================================================================

    // A shove is not a step. The pusher plants their feet, the rock grinds along
    // on its own (slower than a walk), and only once it has come to rest can the
    // pusher move again , see beginPushLock/updatePushLock.
    const PUSH_MOVE_SPEED = 3;         // rock crawls; a walk is 4
    const PUSH_RECOVER_FRAMES = 8;     // brace after it lands, before walking resumes
    const PUSH_LOCK_MAX_FRAMES = 240;  // safety valve, never trap the player

    function beginPushLock(character, eventId) {
        character._puzzlePushLock = { eventId, frames: 0, recover: 0 };
    }

    function isPushLocked(character) {
        return !!(character && character._puzzlePushLock);
    }

    function updatePushLock(character) {
        const lock = character && character._puzzlePushLock;
        if (!lock) return;
        if (++lock.frames > PUSH_LOCK_MAX_FRAMES) { character._puzzlePushLock = null; return; }
        const ev = getEvent(lock.eventId);
        // Ice keeps the rock moving over several tiles; the hold lasts the whole slide.
        if (ev && !ev._erased && ev.isMoving()) { lock.recover = 0; return; }
        if (++lock.recover >= PUSH_RECOVER_FRAMES) character._puzzlePushLock = null;
    }

    function tryPush(pushedId, dx, dy) {
        const pd = puzzleData();
        const info = pd.pushables[pushedId];
        if (!info) { puzzleLog(`push ev${pushedId}: not registered as pushable`); return false; }
        if (info.maxPushes > 0 && info.pushCount >= info.maxPushes) { puzzleLog(`push ${evLabel(pushedId)}: max pushes reached`); return false; }
        const ev = getEvent(pushedId);
        if (!ev) return false;
        if (ev.isMoving()) return false; // still travelling from the last shove

        const d = mzDir(dx === -1 ? 'left' : dx === 1 ? 'right' : dy === -1 ? 'up' : 'down');
        if (blockedForPushable(ev.x + dx, ev.y + dy, pushedId, dx, dy)) {
            puzzleLog(`push ${evLabel(pushedId)}: blocked at (${ev.x + dx},${ev.y + dy})`);
            return false;
        }

        // Calculate final destination for undo stack only
        let fx = ev.x + dx, fy = ev.y + dy;
        if (isIceTile(fx, fy)) {
            while (!blockedForPushable(fx + dx, fy + dy, pushedId, dx, dy)) {
                const nextIsIce = isIceTile(fx + dx, fy + dy);
                fx += dx; fy += dy;
                if (pitAt(fx, fy) !== null) break;
                if (!nextIsIce) break;
            }
        }

        pd.undoStack.push({ eventId: pushedId, fromX: ev.x, fromY: ev.y, toX: fx, toY: fy });
        if (pd.undoStack.length > 20) pd.undoStack.shift();

        puzzleLog(`pushed ${evLabel(pushedId)}: step (${ev.x},${ev.y}) → (${ev.x + dx},${ev.y + dy})`);

        ev._lastPushDir = d; // Store direction for ice sliding logic
        if (isIceTile(ev.x + dx, ev.y + dy)) ev.setMoveSpeed(5);
        else ev.setMoveSpeed(PUSH_MOVE_SPEED);

        AudioManager.playSe({ name: 'Push', volume: 90, pitch: 100, pan: 0 });
        ev.moveStraight(d);
        info.pushCount++;

        updatePressurePlates();
        propagateWater();
        requestPuzzleRefresh();
        return true;
    }

    function pitAt(x, y) {
        for (const [id, pit] of Object.entries(puzzleData().pits)) {
            if (pit.filled) continue;
            const ev = getEvent(+id);
            if (ev && ev.x === x && ev.y === y) return +id;
        }
        return null;
    }

    // =========================================================================
    // Ice sliding
    // =========================================================================

    function slideStepGeneric(character, dx, dy) {
        if (character._isSliding) return;
        if (character._originalMoveSpeed === undefined)
            character._originalMoveSpeed = character.moveSpeed();
        const d = mzDir(dx === -1 ? 'left' : dx === 1 ? 'right' : dy === -1 ? 'up' : 'down');
        const nx = character.x + dx, ny = character.y + dy;
        if (!isIceTile(nx, ny)) return;
        if (!$gameMap.isPassable(character.x, character.y, d)) return;

        // Exclude the character themselves from the collision check
        const characterId = character instanceof Game_Player ? -1 : character.eventId();
        if (eventsAt(nx, ny, characterId).some(e => !e.isThrough())) return;

        character._isSliding = true;
        character.setMoveSpeed(5);
        character.moveStraight(d);
        character._isSliding = false;
    }

    // =========================================================================
    // Color tiles / Lights-Out
    // =========================================================================

    function cycleColorTile(id) {
        const ct = puzzleData().colorTiles[id];
        if (!ct) return;
        ct.currentState = (ct.currentState + 1) % ct.numColors;
        const s = ct.currentState;
        setSelfSwitch(id, 'A', (s & 1) !== 0);
        setSelfSwitch(id, 'B', (s & 2) !== 0);
        // Lights-Out: also toggle neighbors
        const neighbors = puzzleData().lightsOutLinks[id];
        if (neighbors) neighbors.forEach(nid => cycleColorTile(nid));
        requestPuzzleRefresh();
    }

    function checkColorGoal(puzzleId, targetState, switchId) {
        const ids = Object.keys(puzzleData().colorTiles)
            .filter(id => puzzleData().colorTiles[id].puzzleId === puzzleId);
        if (!ids.length) return;
        setPuzzleSwitch(switchId, ids.every(id => puzzleData().colorTiles[id].currentState === targetState));
    }

    // =========================================================================
    // Magnetic objects
    // =========================================================================

    function activateMagnet(character, polarity, range, steps) {
        const pd = puzzleData();
        const px = character.x, py = character.y;
        for (const id of Object.keys(pd.magneticObjects)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            const adx = ev.x - px, ady = ev.y - py;
            const dist = Math.abs(adx) + Math.abs(ady);
            if (dist === 0 || dist > range) continue;
            // Axis with greatest separation
            let mdx = 0, mdy = 0;
            if (Math.abs(adx) >= Math.abs(ady)) mdx = adx > 0 ? 1 : -1;
            else mdy = ady > 0 ? 1 : -1;
            if (polarity === 'attract') { mdx = -mdx; mdy = -mdy; }
            for (let i = 0; i < steps; i++) {
                if (blockedForPushable(ev.x + mdx, ev.y + mdy, +id, mdx, mdy)) break;
                pd.undoStack.push({ eventId: +id, fromX: ev.x, fromY: ev.y, toX: ev.x + mdx, toY: ev.y + mdy });
                ev.locate(ev.x + mdx, ev.y + mdy);
            }
        }
        updatePressurePlates();
        requestPuzzleRefresh();
    }

    // =========================================================================
    // Counterweights
    // =========================================================================

    function updateCounterweights() {
        const pd = puzzleData();
        for (const [idA, cw] of Object.entries(pd.counterweights)) {
            const evA = getEvent(+idA), evB = getEvent(cw.partnerEventId);
            if (!evA || !evB) continue;
            const cloneOn = Object.keys(pd.clones).some(cid => {
                const ce = getEvent(+cid); return ce && ce.x === evA.x && ce.y === evA.y;
            });
            const objOn = Object.keys(pd.pushables).some(pid => {
                const pe = getEvent(+pid); return pe && pe.x === evA.x && pe.y === evA.y;
            });
            const actorsOn = getPuzzleActors().some(p => p.x === evA.x && p.y === evA.y);
            const pressed = actorsOn || cloneOn || objOn;
            evB.setThrough(pressed);
            evB.setOpacity(pressed ? 100 : 255);
        }
    }

    // =========================================================================
    // Light beam
    // =========================================================================

    // Signature of the static beam topology: emitter positions+directions, mirror
    // positions+orientations, receiver positions. Combined with the per-frame
    // movement signature to decide when a beam retrace is actually needed.
    function beamStaticSignature(pd) {
        let sig = '';
        for (const [emId, emitter] of Object.entries(pd.beamEmitters)) {
            const e = getEvent(+emId);
            if (e) sig += 'e' + emId + ':' + e.x + ',' + e.y + ',' + emitter.direction + ';';
        }
        for (const [mid, mirror] of Object.entries(pd.mirrors)) {
            const e = getEvent(+mid);
            if (e) sig += 'm' + mid + ':' + e.x + ',' + e.y + ',' + mirror.orientation + ';';
        }
        for (const rid of Object.keys(pd.beamReceivers)) {
            const e = getEvent(+rid);
            if (e) sig += 'r' + rid + ':' + e.x + ',' + e.y + ';';
        }
        return sig;
    }

    function calculateBeam() {
        const pd = puzzleData();
        const activeReceivers = new Set();

        pd.beamPath = [];
        pd.beamSegments = [];

        for (const [emId, emitter] of Object.entries(pd.beamEmitters)) {
            const emEv = getEvent(+emId);
            if (!emEv) continue;

            let x = emEv.x, y = emEv.y, dir = emitter.direction, steps = 0;
            let startX = x, startY = y;

            while (steps++ < 128) {
                const [dx, dy] = delta(dir);
                x += dx; y += dy;
                if (!$gameMap.isValid(x, y)) break;

                pd.beamPath.push({ x, y });

                // Mirror?
                const mirrorId = Object.keys(pd.mirrors).find(mid => {
                    const me = getEvent(+mid); return me && me.x === x && me.y === y;
                });
                if (mirrorId !== undefined) {
                    pd.beamSegments.push({ x1: startX, y1: startY, x2: x, y2: y });
                    const ori = pd.mirrors[mirrorId].orientation;
                    dir = (ori === 'slash') ? REFLECT_SLASH[dir] : REFLECT_BSLASH[dir];
                    startX = x; startY = y;
                    continue;
                }

                // Receiver?
                const recvId = Object.keys(pd.beamReceivers).find(rid => {
                    const re = getEvent(+rid); return re && re.x === x && re.y === y;
                });
                if (recvId !== undefined) {
                    activeReceivers.add(recvId);
                    pd.beamSegments.push({ x1: startX, y1: startY, x2: x, y2: y });
                    break;
                }

                // Blocked by wall, solid event, or actor?
                const blockedByWall = !canPassTile(x, y);
                const blockedByEvent = eventsAt(x, y, -1).some(e => !e.isThrough() && !pd.mirrors[e.eventId()] && !pd.bridges[e.eventId()]);
                const blockedByActor = getPuzzleActors().some(a => a.x === x && a.y === y && !a.isThrough());

                if (blockedByWall || blockedByEvent || blockedByActor) {
                    pd.beamSegments.push({ x1: startX, y1: startY, x2: x, y2: y });
                    break;
                }

                if (steps === 128) {
                    pd.beamSegments.push({ x1: startX, y1: startY, x2: x, y2: y });
                }
            }
        }

        // Update receiver switches only if state changed
        for (const [rid, recv] of Object.entries(pd.beamReceivers)) {
            const active = activeReceivers.has(rid);
            if (recv.active !== active) {
                recv.active = active;
                if (recv.switchId > 0) {
                    setPuzzleSwitch(recv.switchId, active);
                }
                setSelfSwitch(+rid, 'A', active);
                if (recv.localSwitches) {
                    for (const [letter, eventIdStr] of Object.entries(recv.localSwitches)) {
                        if (eventIdStr) setSelfSwitch(+eventIdStr, letter, active);
                    }
                }
            }
        }
    }

    // =========================================================================
    // Clone / shadow
    // =========================================================================

    function moveClones(dx, dy) {
        const pd = puzzleData();
        for (const [id, clone] of Object.entries(pd.clones)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            const cdx = clone.invertX ? -dx : dx;
            const cdy = clone.invertY ? -dy : dy;
            if (cdx === 0 && cdy === 0) continue;
            const nx = ev.x + cdx, ny = ev.y + cdy;
            if (!blockedForPushable(nx, ny, +id, cdx, cdy)) {
                if (ev._originalMoveSpeed === undefined) ev._originalMoveSpeed = ev.moveSpeed();
                ev.setMoveSpeed($gamePlayer.moveSpeed());

                const wasThrough = ev.isThrough();
                ev.setThrough(true);
                if (cdx !== 0 && cdy !== 0) {
                    ev.moveDiagonally(cdx > 0 ? 6 : 4, cdy > 0 ? 2 : 8);
                } else {
                    const d = cdx > 0 ? 6 : cdx < 0 ? 4 : cdy > 0 ? 2 : 8;
                    ev.moveStraight(d);
                }
                ev.setThrough(wasThrough);

                // For ice sliding logic in onPuzzleMoveEnd
                if (cdx !== 0 && cdy === 0) ev._lastPushDir = cdx > 0 ? 6 : 4;
                else if (cdy !== 0 && cdx === 0) ev._lastPushDir = cdy > 0 ? 2 : 8;
                else ev._lastPushDir = undefined;

                requestPuzzleRefresh();
            }
        }
    }

    // =========================================================================
    // Water fill (BFS)
    // =========================================================================

    function propagateWater() {
        const pd = puzzleData();
        // Reset all channels
        for (const id of Object.keys(pd.waterChannels)) {
            if (pd.waterChannels[id].filled) {
                pd.waterChannels[id].filled = false;
                if (pd.waterChannels[id].switchId)
                    setPuzzleSwitch(pd.waterChannels[id].switchId, false);
                setSelfSwitch(+id, 'A', false);
            }
        }

        // BFS from active sources
        const visited = new Set();
        const queue = [];
        for (const [id, src] of Object.entries(pd.waterSources)) {
            if (!src.active) continue;
            const ev = getEvent(+id);
            if (ev) queue.push({ x: ev.x, y: ev.y });
        }

        const mapW = $gameMap.width(), mapH = $gameMap.height();
        while (queue.length) {
            const { x, y } = queue.shift();
            // Bound the flood to the map so unconditional spreading terminates.
            if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);

            // Drain = stop
            const isDrain = Object.keys(pd.waterDrains).some(id => {
                const ev = getEvent(+id); return ev && ev.x === x && ev.y === y;
            });
            if (isDrain) continue;

            // Fill any channel event on this tile.
            for (const [id, ch] of Object.entries(pd.waterChannels)) {
                const ev = getEvent(+id);
                if (!ev || ev.x !== x || ev.y !== y || ch.filled) continue;
                ch.filled = true;
                if (ch.switchId) setPuzzleSwitch(ch.switchId, true);
                setSelfSwitch(+id, 'A', true);
            }

            // Spread to orthogonal tiles regardless of whether this tile held a
            // channel, so a source not co-located with a channel still emits and
            // gaps between channel tiles no longer stop the flow.
            for (const [ddx, ddy] of [[0, 1], [0, -1], [1, 0], [-1, 0]])
                queue.push({ x: x + ddx, y: y + ddy });
        }
    }

    // =========================================================================
    // Puzzle solved / reset / undo
    // =========================================================================

    function checkPuzzleSolved(puzzleId, switchId) {
        const solved = isGroupSolved(puzzleId);
        if (solved !== $gameSwitches.value(switchId))
            puzzleLog(`solveCheck [${puzzleId}] → ${solved} (sw${switchId})`);
        setPuzzleSwitch(switchId, solved);
    }

    function resetPuzzle(puzzleId) {
        puzzleLog(`resetPuzzle: ${puzzleId}`);
        const pd = puzzleData();
        const wasLoading = pd._loading;
        pd._loading = true;
        for (const [id, info] of Object.entries(pd.pushables)) {
            if (info.puzzleId !== puzzleId) continue;
            const ev = getEvent(+id);
            if (ev) ev.locate(info.initialX, info.initialY);
            info.pushCount = 0;
        }
        for (const [, lev] of Object.entries(pd.levers))
            if (lev.puzzleId === puzzleId) lev.state = false;
        updateGates();
        for (const [id, t] of Object.entries(pd.torches)) {
            if (t.puzzleId === puzzleId) { t.lit = false; t.timer = 0; applyTorchVisual(+id); }
        }
        for (const [id, ct] of Object.entries(pd.colorTiles)) {
            if (ct.puzzleId !== puzzleId) continue;
            ct.currentState = 0;
            setSelfSwitch(+id, 'A', false); setSelfSwitch(+id, 'B', false);
        }
        for (const [id, clone] of Object.entries(pd.clones)) {
            if (clone.puzzleId !== puzzleId) continue;
            const ev = getEvent(+id);
            if (ev) ev.locate(clone.initialX, clone.initialY);
        }
        // Clear goal event Self Switches so group registers as unsolved
        for (const [id, ge] of Object.entries(pd.goalEvents)) {
            if (ge.puzzleId === puzzleId) setSelfSwitch(+id, 'A', false);
        }
        pd.solvedGroups[puzzleId] = false;
        pd.undoStack = [];
        updatePressurePlates();
        propagateWater();
        pd._loading = wasLoading;
        requestPuzzleRefresh();
    }

    function undoLastPush() {
        const stack = puzzleData().undoStack;
        if (!stack.length) return;
        const last = stack.pop();
        puzzleLog(`undo ${evLabel(last.eventId)}: (${last.toX},${last.toY}) → (${last.fromX},${last.fromY})`);
        const ev = getEvent(last.eventId);
        if (ev) ev.locate(last.fromX, last.fromY);
        updatePressurePlates();
        propagateWater();
        requestPuzzleRefresh();
    }

    // =========================================================================
    // Goal / solve system
    // =========================================================================

    function isGroupSolved(groupId) {
        const pd = puzzleData();
        const goalIds = Object.entries(pd.goalEvents)
            .filter(([, g]) => g.puzzleId === groupId).map(([id]) => +id);
        if (!goalIds.length) return false;
        return goalIds.every(id => $gameSelfSwitches.value([$gameMap.mapId(), id, 'A']));
    }

    function updateGroupSolveState() {
        const pd = puzzleData();
        const groups = [...new Set(Object.values(pd.goalEvents).map(g => g.puzzleId))].filter(Boolean);
        for (const groupId of groups) {
            const wasSolved = !!pd.solvedGroups[groupId];
            const nowSolved = isGroupSolved(groupId);
            if (!wasSolved && nowSolved) {
                pd.solvedGroups[groupId] = true;
                AudioManager.playSe({ name: 'PixelUi/PixelUI (29)', volume: 90, pitch: 100, pan: 0 });
                puzzleLog(`group "${groupId}" SOLVED`);
                // Honour any solveCheck switch registered for this group
                for (const chk of Object.values(pd.solveChecks)) {
                    if (chk.puzzleId === groupId) $gameSwitches.setValue(chk.switchId, true);
                }
            } else if (wasSolved && !nowSolved) {
                pd.solvedGroups[groupId] = false;
                puzzleLog(`group "${groupId}" broken ,  will reset on next transfer`);
            }
        }
    }

    function resetUnsolvedGroups() {
        const pd = puzzleData();
        const groups = [...new Set(Object.values(pd.goalEvents).map(g => g.puzzleId))].filter(Boolean);
        for (const groupId of groups) {
            if (!pd.solvedGroups[groupId]) {
                puzzleLog(`transfer reset: group "${groupId}"`);
                resetPuzzle(groupId);
            }
        }
    }

    // =========================================================================
    // Auto-checks (self-setup persistent watchers)
    // =========================================================================

    function updateAutoChecks() {
        const pd = puzzleData();
        for (const chk of Object.values(pd.solveChecks))
            checkPuzzleSolved(chk.puzzleId, chk.switchId);
        for (const chk of Object.values(pd.torchChecks))
            checkAllTorches(chk.puzzleId, chk.switchId);
        for (const chk of Object.values(pd.colorChecks))
            checkColorGoal(chk.puzzleId, chk.targetState, chk.switchId);
        for (const [id, chk] of Object.entries(pd.waterChecks)) {
            const ch = pd.waterChannels[id];
            setPuzzleSwitch(chk.switchId, !!(ch && ch.filled));
        }
        for (const [id, wsa] of Object.entries(pd.waterSourceActivations)) {
            const src = pd.waterSources[id];
            if (!src) continue;
            const active = $gameSwitches.value(wsa.switchId);
            if (src.active !== active) { src.active = active; propagateWater(); }
        }
    }

    // =========================================================================
    // Eye statues
    // =========================================================================

    function updateEyeStatues() {
        const pd = puzzleData();
        const actors = getPuzzleActors();
        for (const [id, statue] of Object.entries(pd.eyeStatues)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            const [ddx, ddy] = MZ_DELTA[ev.direction()] || [0, 1];
            let seen = false;
            for (let s = 1; s <= statue.visionRange; s++) {
                const cx = ev.x + ddx * s, cy = ev.y + ddy * s;
                if (!$gameMap.isValid(cx, cy)) break;
                if (actors.some(a => a.x === cx && a.y === cy)) { seen = true; break; }
                if (eventsAt(cx, cy, +id).some(e => !e.isThrough())) break;
            }
            setPuzzleSwitch(statue.switchId, seen);
        }
    }

    // =========================================================================
    // Blink platforms
    // =========================================================================

    function updateBlinkPlatforms() {
        for (const [id, bp] of Object.entries(puzzleData().blinkPlatforms)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            if (++bp.frameCount >= (bp.visible ? bp.onFrames : bp.offFrames)) {
                bp.visible = !bp.visible;
                bp.frameCount = 0;
                ev.setOpacity(bp.visible ? 255 : 0);
                ev.setThrough(!bp.visible);
            }
        }
    }

    // =========================================================================
    // State tiles
    // =========================================================================

    function updateStateTiles() {
        for (const [id, st] of Object.entries(puzzleData().stateTiles)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            const val = $gameVariables.value(st.stateVariableId);
            ev.setThrough(st.passableStates.length === 0 || st.passableStates.includes(val));
        }
    }

    // =========================================================================
    // Pit region recovery
    // =========================================================================

    function checkPitRegion(x, y, character) {
        const pd = puzzleData();
        const region = $gameMap.regionId(x, y);
        const pit = pd.pitRegions[region];
        if (!pit) return false;
        if (pit.damage > 0) $gameParty.members().forEach(m => m.gainHp(-pit.damage));
        character.locate(pd.lastSafeX, pd.lastSafeY);
        return true;
    }

    function updatePuzzleCharacter(character, sceneActive) {
        if (!sceneActive || character.isMoving()) return;

        const pd = puzzleData();
        const x = character.x, y = character.y;

        // Pit region
        if (checkPitRegion(x, y, character)) return;

        // Ice slide
        if (isIceTile(x, y)) {
            const [dx, dy] = MZ_DELTA[character.direction()] || [0, 0];
            slideStepGeneric(character, dx, dy);
        } else if (character._originalMoveSpeed !== undefined && !character.isMoving()) {
            character.setMoveSpeed(character._originalMoveSpeed);
            character._originalMoveSpeed = undefined;
        }

        // Arrow tiles
        for (const [id, arrow] of Object.entries(pd.arrowTiles)) {
            const ev = getEvent(+id);
            if (!ev || ev.x !== x || ev.y !== y) continue;
            const d = mzDir(arrow.direction);
            character.setDirection(d);
            character.moveStraight(d);
            break;
        }

        // Conveyor regions
        const region = $gameMap.regionId(x, y);
        if (pd.conveyors[region]) {
            const conv = pd.conveyors[region];
            if (++pd.conveyorCounter >= conv.speed) {
                pd.conveyorCounter = 0;
                character.moveStraight(mzDir(conv.direction));
            }
        } else {
            pd.conveyorCounter = 0;
        }
    }

    function checkPuzzleInteractions(character) {
        const pd = puzzleData();
        const [dx, dy] = MZ_DELTA[character.direction()] || [0, 0];
        const fx = character.x + dx, fy = character.y + dy;
        const characterId = character instanceof Game_Player ? -1 : character.eventId();

        for (const ev of eventsAt(fx, fy, characterId)) {
            const id = ev.eventId();
            puzzleLog(`interact ${evLabel(id)} at (${fx},${fy})`);

            if (pd.levers[id]) {
                pd.levers[id].state = !pd.levers[id].state;
                puzzleLog(`  ${evLabel(id)} → ${pd.levers[id].state}`);
                setSelfSwitch(id, 'A', pd.levers[id].state);
                ev.setOpacity(pd.levers[id].state ? 255 : 150);
                updateGates();
                requestPuzzleRefresh(); return true;
            }
            if (pd.crystalSwitches[id]) {
                flipCrystalGroup(pd.crystalSwitches[id].groupId); return true;
            }
            if (pd.mirrors[id]) {
                pd.mirrors[id].orientation = pd.mirrors[id].orientation === 'slash' ? 'backslash' : 'slash';
                setSelfSwitch(id, 'A', pd.mirrors[id].orientation === 'backslash');
                requestPuzzleRefresh(); return true;
            }
            if (pd.crackableWalls[id]) {
                const cw = pd.crackableWalls[id];
                if ($gameParty.hasItem($dataItems[cw.requireItemId])) {
                    if (cw.consumeItem) $gameParty.loseItem($dataItems[cw.requireItemId], 1);
                    ev.erase(); delete pd.crackableWalls[id];
                    requestPuzzleRefresh();
                }
                return true;
            }
            if (pd.colorDoors[id]) {
                const door = pd.colorDoors[id];
                if ($gameParty.hasItem($dataItems[door.keyItemId])) {
                    if (door.consumeKey) $gameParty.loseItem($dataItems[door.keyItemId], 1);
                    ev.erase(); delete pd.colorDoors[id];
                    requestPuzzleRefresh();
                }
                return true;
            }
            if (pd.comboLocks[id]) {
                const lock = pd.comboLocks[id];
                if ($gameVariables.value(lock.variableId) === lock.targetValue) {
                    setPuzzleSwitch(lock.switchId, true);
                }
                return true;
            }
            if (pd.torches[id] && !pd.torches[id].lit) {
                lightTorch(id); return true;
            }
            if (pd.resetShrines[id]) {
                resetPuzzle(pd.resetShrines[id].puzzleId); return true;
            }
            if (pd.undoShrines[id]) {
                undoLastPush(); return true;
            }
            if (pd.variableLevers[id]) {
                const vl = pd.variableLevers[id];
                $gameVariables.setValue(vl.variableId, $gameVariables.value(vl.variableId) + vl.increment);
                return true;
            }
            if (pd.magnetConsoles[id]) {
                const mc = pd.magnetConsoles[id];
                activateMagnet(character, mc.polarity, mc.range, mc.steps); return true;
            }
            if (pd.reflectionPools[id]) {
                const rp = pd.reflectionPools[id];
                const evB = getEvent(rp.swapWithId);
                if (evB) {
                    const ax = ev.x, ay = ev.y;
                    ev.locate(evB.x, evB.y);
                    evB.locate(ax, ay);
                    requestPuzzleRefresh();
                }
                return true;
            }
        }
        return false;
    }

    const _Game_CharacterBase_screenZ = Game_CharacterBase.prototype.screenZ;
    Game_CharacterBase.prototype.screenZ = function () {
        let z = _Game_CharacterBase_screenZ.call(this);
        if (this instanceof Game_Event && mapHasPuzzleElements()) {
            const id = this.eventId();
            const pd = puzzleData();
            if (pd.pushables[id]) z += 0.1;
            if (pd.plates[id] || pd.timedPlates[id] || pd.goalEvents[id] ||
                pd.arrowTiles[id] || pd.warpTiles[id] || pd.colorTiles[id] ||
                pd.timedTiles[id] || pd.pits[id] || pd.bridges[id]) {
                z -= 0.1;
            }
        }
        return z;
    };

    // =========================================================================
    // PIXI Beam Rendering
    // =========================================================================

    function Sprite_PuzzleBeam() {
        this.initialize(...arguments);
    }

    Sprite_PuzzleBeam.prototype = Object.create(PIXI.Container.prototype);
    Sprite_PuzzleBeam.prototype.constructor = Sprite_PuzzleBeam;

    Sprite_PuzzleBeam.prototype.initialize = function () {
        PIXI.Container.call(this);
        this._graphics = new PIXI.Graphics();
        this.addChild(this._graphics);
        this.z = 20;
    };

    Sprite_PuzzleBeam.prototype.update = function () {
        this.updateVisibility();
        if (this.visible) {
            this.drawBeams();
        }
    };

    Sprite_PuzzleBeam.prototype.updateVisibility = function () {
        this.visible = !!$gameSystem && !!$gameSystem._puzzleData;
    };

    Sprite_PuzzleBeam.prototype.drawBeams = function () {
        const g = this._graphics;
        const pd = puzzleData();
        if (!pd.beamSegments || pd.beamSegments.length === 0) {
            // Nothing to draw; only clear once on the transition from having
            // segments to none, so idle frames skip the clear entirely.
            if (this._hadSegments) { g.clear(); this._hadSegments = false; }
            return;
        }
        this._hadSegments = true;
        g.clear();

        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        const pulse = Math.sin(Graphics.frameCount * 0.15) * 0.15 + 0.85;

        for (const seg of pd.beamSegments) {
            const x1 = ($gameMap.adjustX(seg.x1) + 0.5) * tw;
            const y1 = ($gameMap.adjustY(seg.y1) + 0.5) * th;
            const x2 = ($gameMap.adjustX(seg.x2) + 0.5) * tw;
            const y2 = ($gameMap.adjustY(seg.y2) + 0.5) * th;
            // 1. Outer Glow (Soft red)
            g.lineStyle(10, 0xFF0000, 0.2 * pulse);
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);

            // 2. Mid Glow (Bright red)
            g.lineStyle(5, 0xFF4444, 0.4 * pulse);
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);

            // 3. Core (White)
            g.lineStyle(1.5, 0xFFFFFF, 0.95);
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);

            // 4. Source/Impact Points
            g.beginFill(0xFFFFFF, 0.8);
            g.drawCircle(x1, y1, 2);
            g.drawCircle(x2, y2, 2);
            g.endFill();
        }
    };

    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function () {
        _Spriteset_Map_createLowerLayer.call(this);
        this.createPuzzleBeamLayer();
    };

    Spriteset_Map.prototype.createPuzzleBeamLayer = function () {
        this._puzzleBeamSprite = new Sprite_PuzzleBeam();
        // Add to tilemap so it's sorted with other map elements
        this._tilemap.addChild(this._puzzleBeamSprite);
    };

    // =========================================================================
    // Game_Player hooks
    // =========================================================================

    const _setDirection = Game_Player.prototype.setDirection;
    Game_Player.prototype.setDirection = function (d) {
        if (this._isPullingBlock && !this.isDirectionFixed()) return;
        _setDirection.call(this, d);
    };

    const _moveByInput = Game_Player.prototype.moveByInput;
    Game_Player.prototype.moveByInput = function () {
        // Feet planted while the rock we just shoved is still travelling.
        if (isPushLocked(this)) { this._isPullingBlock = false; return; }
        this._isPullingBlock = Input.isPressed('ok');
        _moveByInput.call(this);
        this._isPullingBlock = false;
    };

    const _moveStraight = Game_Player.prototype.moveStraight;
    Game_Player.prototype.moveStraight = function (d) {
        const pd = puzzleData();
        const oldX = this.x;
        const oldY = this.y;
        const fd = this.direction();

        let pullingEventId = null;
        if (Input.isPressed('ok') && d === this.reverseDir(fd)) {
            const [fdx, fdy] = MZ_DELTA[fd] || [0, 0];
            const px = oldX + fdx, py = oldY + fdy;
            const pushable = $gameMap.events().find(e =>
                e.x === px && e.y === py && pd.pushables[e.eventId()] && !e._erased);

            if (pushable) {
                const info = pd.pushables[pushable.eventId()];
                if (info && (info.maxPushes === 0 || info.pushCount < info.maxPushes)) {
                    pullingEventId = pushable.eventId();
                }
            }
        }

        const [dx, dy] = MZ_DELTA[d] || [0, 0];
        const nx = this.x + dx, ny = this.y + dy;

        // Try to push
        const pushable = $gameMap.events().find(e =>
            e.x === nx && e.y === ny && pd.pushables[e.eventId()] && !e._erased);
        if (pushable && !pullingEventId) {
            puzzleLog(`move into ${evLabel(pushable.eventId())} at (${nx},${ny})`);
            if (tryPush(pushable.eventId(), dx, dy)) {
                // The shove costs the step: turn into the rock and stay put until
                // it has finished moving, so the weight of it reads on screen.
                beginPushLock(this, pushable.eventId());
                this.setMovementSuccess(false);
                this.setDirection(d);
                return;
            }
        }

        // Apply slow speed for pulling
        if (pullingEventId) {
            if (this._originalMoveSpeed === undefined) {
                this._originalMoveSpeed = this.moveSpeed();
            }
            this.setMoveSpeed(3); // Slow speed
            
            const ev = getEvent(pullingEventId);
            if (ev) {
                if (ev._originalMoveSpeed === undefined) {
                    ev._originalMoveSpeed = ev.moveSpeed();
                }
                ev.setMoveSpeed(3);
            }
        }

        _moveStraight.call(this, d);

        if (pullingEventId && (this.x !== oldX || this.y !== oldY)) {
            const ev = getEvent(pullingEventId);
            const info = pd.pushables[pullingEventId];

            pd.undoStack.push({ eventId: pullingEventId, fromX: ev.x, fromY: ev.y, toX: oldX, toY: oldY });
            if (pd.undoStack.length > 20) pd.undoStack.shift();

            ev._lastPushDir = d; // Track direction for ice sliding
            ev.moveStraight(d);
            if (info) info.pushCount++;

            const pitId = pitAt(oldX, oldY);
            if (pitId !== null) {
                pd.pits[pitId].filled = true;
                ev.erase();
                const pitEv = getEvent(pitId);
                if (pitEv) pitEv.erase();
            }

            updatePressurePlates();
            propagateWater();
            requestPuzzleRefresh();
        }

        moveClones(dx, dy);
    };

    const _increaseSteps = Game_Player.prototype.increaseSteps;
    Game_Player.prototype.increaseSteps = function () {
        _increaseSteps.call(this);
        const pd = puzzleData();
        const x = this.x, y = this.y;

        // Track last safe position (non-pit region)
        if (!pd.pitRegions[$gameMap.regionId(x, y)]) {
            pd.lastSafeX = x; pd.lastSafeY = y;
        }

        // Timed tiles
        for (const [id, tt] of Object.entries(pd.timedTiles)) {
            const ev = getEvent(+id);
            if (!ev) continue;
            if (ev.x === x && ev.y === y && !tt.triggered) { tt.triggered = true; tt.stepCount = 0; }
            if (tt.triggered && ++tt.stepCount >= tt.disappearSteps) {
                ev.erase(); delete pd.timedTiles[id];
                requestPuzzleRefresh();
            }
        }

        // Color tile step
        for (const [id, ct] of Object.entries(pd.colorTiles)) {
            const ev = getEvent(+id);
            if (ev && ev.x === x && ev.y === y) cycleColorTile(+id);
        }

        // Key grants are handled once, in Game_Player.update (below), to avoid
        // running the identical pickup pass twice per step.
    };

    const _update = Game_Player.prototype.update;
    Game_Player.prototype.update = function (sceneActive) {
        updatePushLock(this);
        _update.call(this, sceneActive);
        // Non-puzzle maps skip the whole puzzle character/idle pass.
        if (!mapHasPuzzleElements()) return;
        updatePuzzleCharacter(this, sceneActive);

        if (!sceneActive || this.isMoving()) return;
        const pd = puzzleData();
        const x = this.x, y = this.y;

        // Warp tiles ,  flag so the transfer doesn't trigger a puzzle reset
        for (const [id, warp] of Object.entries(pd.warpTiles)) {
            const ev = getEvent(+id);
            if (!ev || ev.x !== x || ev.y !== y) continue;
            pd._skipNextReset = true;
            $gamePlayer.reserveTransfer($gameMap.mapId(), warp.targetX, warp.targetY, this.direction(), 0);
            break;
        }

        // Key grants (Player only)
        for (const [id, kg] of Object.entries(pd.keyGrants)) {
            const ev = getEvent(+id);
            if (!ev || ev.x !== x || ev.y !== y) continue;
            if ($dataItems[kg.itemId]) $gameParty.gainItem($dataItems[kg.itemId], kg.quantity);
            ev.erase();
            delete pd.keyGrants[id];
            break;
        }

        // Occupancy-driven scans only need to run when something moved onto/off a
        // tile since they last ran (they are internally idempotent). The baseline
        // advances only when they run, so a move that jumps x/y during the slide
        // still triggers them on the arrival (idle) frame.
        const moveSig = puzzleMovementSignature();
        if (moveSig !== pd._occupancyScanSig) {
            pd._occupancyScanSig = moveSig;
            updatePressurePlates();
            updateCounterweights();
            updateEyeStatues();
        }
    };

    // Action button (interact): levers, crystal switches, crackable walls, mirrors, combo locks, doors, torches
    const _checkEventTriggerThere = Game_Player.prototype.checkEventTriggerThere;
    Game_Player.prototype.checkEventTriggerThere = function (triggers) {
        _checkEventTriggerThere.call(this, triggers);
        if (triggers.includes(0)) {
            checkPuzzleInteractions(this);
        }
    };

    // =========================================================================
    // Scene_Map frame update
    // =========================================================================

    const _sceneMapUpdate = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _sceneMapUpdate.call(this);
        if (!$gameSystem._puzzleData) return;
        // Non-puzzle maps (persistent _puzzleData but empty collections) skip all
        // of the per-frame puzzle scans.
        if (!mapHasPuzzleElements()) return;
        const pd = puzzleData();
        updateBlinkPlatforms();
        updateTorchTimers();

        // Timed plates: rescan occupancy only when a character moved; the
        // countdown still ticks every frame inside updateTimedPlates.
        const moveSig = puzzleMovementSignature();
        const timedRescan = moveSig !== pd._timedPlateScanSig;
        if (timedRescan) pd._timedPlateScanSig = moveSig;
        updateTimedPlates(timedRescan);

        // Beams are expensive to trace (event scans per step); recompute only when
        // an emitter/mirror/receiver or any blocker (actor/pushable/clone) moved.
        // Sprite_PuzzleBeam still redraws every frame for the pulse animation.
        if (Object.keys(pd.beamEmitters).length > 0 || Object.keys(pd.beamReceivers).length > 0) {
            const beamSig = moveSig + '#' + beamStaticSignature(pd) + '#' + (pd._stateVersion || 0);
            if (beamSig !== pd._beamSig) {
                pd._beamSig = beamSig;
                calculateBeam();
            }
        }

        if ($gameSystem._puzzleData._needsRefresh) {
            $gameSystem._puzzleData._needsRefresh = false;
            updateStateTiles();
            updateAutoChecks();
            updateGroupSolveState();
        }
    };

    // =========================================================================
    // Map change: reset volatile per-map state
    // =========================================================================

    const _gameMapSetup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        _gameMapSetup.call(this, mapId);
        if (!$gameSystem) return;

        // Wipe old map's volatile data so events don't cross-contaminate
        if ($gameSystem._puzzleData) {
            resetVolatilePuzzleData();
        }

        const pd = puzzleData();
        pd._loading = true;

        // Scan first ,  puzzleData() is created here if it doesn't exist yet.
        for (const ev of this.events()) scanEventPuzzleComments(ev);

        pd._loading = false;

        if (!$gameSystem._puzzleData) return;
        pd.lastSafeX = $gamePlayer.x;
        pd.lastSafeY = $gamePlayer.y;
    };

    // =========================================================================
    // Teleport: reset unsolved puzzle groups on any event transfer
    // =========================================================================

    const _performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function () {
        if (this.isTransferring() && $gameSystem._puzzleData) {
            const pd = $gameSystem._puzzleData;
            if (!pd._skipNextReset) resetUnsolvedGroups();
            pd._skipNextReset = false;
        }
        _performTransfer.call(this);
    };

    // =========================================================================
    // Locked Key HUD
    // =========================================================================

    // Item 112 "Dungeon key": what the Key Chest events hand out and what every
    // "Dungeon door" conditional tests for. The counter has to read the same id.
    const DUNGEON_KEY_ITEM_ID = 112;

    function dungeonKeyItem() {
        return $dataItems ? $dataItems[DUNGEON_KEY_ITEM_ID] : null;
    }

    function dungeonKeyCount() {
        const item = dungeonKeyItem();
        return item ? $gameParty.numItems(item) : 0;
    }

    function Window_LockedKeyHUD() {
        this.initialize(...arguments);
    }

    Window_LockedKeyHUD.prototype = Object.create(Window_Base.prototype);
    Window_LockedKeyHUD.prototype.constructor = Window_LockedKeyHUD;

    Window_LockedKeyHUD.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 0;
        this.contentsOpacity = 255;
        this._lastCount = -1;
        this._hasEvent = undefined;
        this.refresh();
    };

    Window_LockedKeyHUD.prototype.update = function () {
        Window_Base.prototype.update.call(this);
        this.updateVisibility();
        if (this.visible) {
            const count = dungeonKeyCount();
            if (this._lastCount !== count) {
                this._lastCount = count;
                this.refresh();
            }
        }
    };

    // Procedural map (636) keeps its six "Dungeon door" templates on the map at
    // all times, parked at (0,0) with opacity 0 on surface biomes. Only count a
    // door that is actually placed, and only show the counter in the enclosed /
    // underground biomes where locked doors can exist at all.
    const PROC_MAP_ID = 636;
    // Ordinary open-air cave squares, which are underground without being one
    // of the generated structures. Every structure is asked of the catalogue
    // (ProceduralMapStructureGenerator) instead of listed here, since the list
    // is two dozen long and grows.
    const UNDERGROUND_BIOME_RE = /^(cave|mine|underdark|crystals|lair|seabed|metro)/;

    function isUndergroundProcContext() {
        const pd = $gameSystem._procGenData;
        if (!pd) return false;
        if (pd.biomeLayerStack && pd.biomeLayerStack.length > 0) return true;
        const name = String(pd.currentBiome || '').toLowerCase();
        const D = window.ProcGenDungeon;
        if (D && typeof D.isStructure === 'function' && D.isStructure(name)) return true;
        return UNDERGROUND_BIOME_RE.test(name);
    }

    function hasPlacedDungeonDoor() {
        return $gameMap.events().some(ev => {
            if (!ev.event() || ev.event().name !== 'Dungeon door') return false;  // i18n-ignore  event name
            return ev.opacity() > 0 && !(ev.x === 0 && ev.y === 0);
        });
    }

    Window_LockedKeyHUD.prototype.updateVisibility = function () {
        if (Graphics.frameCount % 30 === 0 || this._hasEvent === undefined) {
            this._hasEvent = hasPlacedDungeonDoor() &&
                ($gameMap.mapId() !== PROC_MAP_ID || isUndergroundProcContext());
        }
        this.visible = !!this._hasEvent && !$gameMessage.isBusy() && !$gameMap.isEventRunning();
    };

    Window_LockedKeyHUD.prototype.refresh = function () {
        this.contents.clear();
        const item = dungeonKeyItem();
        const iconId = item ? item.iconIndex : 195;
        const count = dungeonKeyCount();

        this.drawIcon(iconId, 0, 0);
        this.contents.fontSize = 24;
        this.contents.fontBold = true;
        this.drawText("X " + count, 40, 0, this.contentsWidth() - 40, "left");
    };

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        this.createLockedKeyHUD();
    };

    Scene_Map.prototype.createLockedKeyHUD = function () {
        const width = 160;
        const height = 60; // Standard height for a single line HUD
        const x = Graphics.width - width - 200;
        const y = 20;
        const rect = new Rectangle(x, y, width, height);
        this._lockedKeyHUD = new Window_LockedKeyHUD(rect);
        this.addWindow(this._lockedKeyHUD);
    };

    // =========================================================================
    // Bridge puzzle system
    // =========================================================================

    function getBridgeAt(x, y) {
        const pd = puzzleData();
        if (!pd || !pd.bridges) return null;
        for (const idStr of Object.keys(pd.bridges)) {
            const id = +idStr;
            const ev = getEvent(id);
            if (ev && ev.x === x && ev.y === y && !ev._erased) {
                return pd.bridges[id];
            }
        }
        return null;
    }

    function isBridgeCompatible(bridge, d) {
        if (!bridge) return false;
        if (bridge.horizontal) {
            return d === 4 || d === 6;
        }
        if (bridge.vertical) {
            return d === 2 || d === 8;
        }
        return true;
    }

    const _Game_CharacterBase_isMapPassable = Game_CharacterBase.prototype.isMapPassable;
    Game_CharacterBase.prototype.isMapPassable = function (x, y, d) {
        if (mapHasPuzzleElements()) {
            const x2 = $gameMap.roundXWithDirection(x, d);
            const y2 = $gameMap.roundYWithDirection(y, d);
            const d2 = 10 - d;

            const currentBridge = getBridgeAt(x, y);
            const targetBridge = getBridgeAt(x2, y2);

            if (currentBridge || targetBridge) {
                const exitPassable = currentBridge ? isBridgeCompatible(currentBridge, d) : $gameMap.isPassable(x, y, d);
                const entryPassable = targetBridge ? isBridgeCompatible(targetBridge, d2) : $gameMap.isPassable(x2, y2, d2);
                return exitPassable && entryPassable;
            }
        }
        return _Game_CharacterBase_isMapPassable.call(this, x, y, d);
    };

    const _Game_CharacterBase_isCollidedWithEvents = Game_CharacterBase.prototype.isCollidedWithEvents;
    Game_CharacterBase.prototype.isCollidedWithEvents = function (x, y) {
        if (mapHasPuzzleElements()) {
            const pd = puzzleData();
            // No bridges on this map → the original collision check already does
            // exactly the right thing, so skip the extra array allocation/filter.
            if (pd.bridges && Object.keys(pd.bridges).length > 0) {
                const events = $gameMap.eventsXyNt(x, y);
                const nonBridgeEvents = events.filter(e => !pd.bridges[e.eventId()]);
                return nonBridgeEvents.some(event => event.isNormalPriority());
            }
        }
        return _Game_CharacterBase_isCollidedWithEvents.call(this, x, y);
    };


    // =========================================================================
    // Scrambler: an event whose graphic glitches through other tile graphics
    // Tagged with a plain "Scrambler" comment on the active page. Optional
    // attributes: Scrambler rate=1.5 tiles=6 mode=flicker|cycle|chaos
    // =========================================================================

    const SCRAMBLER_RE = /^\s*scrambler\b(.*)$/i;
    const SCRAMBLER_MODES = ['flicker', 'cycle', 'chaos'];

    function parseScramblerTag(text) {
        const m = String(text || '').match(SCRAMBLER_RE);
        if (!m) return null;
        const attrs = {};
        const re = /(\w+)\s*=\s*(?:"([^"]*)"|(\S+))/g;
        let a;
        while ((a = re.exec(m[1])) !== null) {
            attrs[a[1].toLowerCase()] = a[2] !== undefined ? a[2] : a[3];
        }
        return attrs;
    }

    // A graphic the event can wear: either a tileset tile or another event's
    // character sheet. Tiles are sampled from the map's own layers so the
    // glitch always shows something that belongs to this tileset.
    function collectScramblerGraphics(event, count) {
        const pool = [];
        const seen = new Set();
        const push = (g) => {
            const key = g.tileId ? 't' + g.tileId : 'c' + g.name + ':' + g.index;
            if (seen.has(key)) return;
            seen.add(key);
            pool.push(g);
        };

        const w = $gameMap.width(), h = $gameMap.height();
        const tries = Math.min(600, w * h * 4);
        for (let i = 0; i < tries && pool.length < count; i++) {
            const x = Math.floor(Math.random() * w);
            const y = Math.floor(Math.random() * h);
            const z = Math.floor(Math.random() * 4);
            const tileId = $gameMap.tileId(x, y, z);
            if (tileId >= Tilemap.TILE_ID_A1 || tileId <= 0) continue;
            push({ tileId });
        }

        for (const ev of $gameMap.events()) {
            if (pool.length >= count) break;
            if (ev === event || ev._erased) continue;
            if (ev.tileId && ev.tileId() > 0) push({ tileId: ev.tileId() });
            else if (ev.characterName && ev.characterName()) {
                push({ name: ev.characterName(), index: ev.characterIndex() });
            }
        }
        return pool;
    }

    function currentGraphicOf(event) {
        return event.tileId() > 0
            ? { tileId: event.tileId() }
            : { name: event.characterName(), index: event.characterIndex() };
    }

    function wearGraphic(event, g) {
        if (!g) return;
        if (g.tileId) event.setTileImage(g.tileId);
        else event.setImage(g.name, g.index);
    }

    function registerScrambler(event, attrs) {
        const rate = Math.max(0.1, +(attrs.rate || 1) || 1);
        const count = Math.max(2, Math.min(12, +(attrs.tiles || attrs.count || 5) || 5));
        const mode = SCRAMBLER_MODES.includes(String(attrs.mode || '').toLowerCase())
            ? String(attrs.mode).toLowerCase()
            : SCRAMBLER_MODES[Math.floor(Math.random() * SCRAMBLER_MODES.length)];
        event._scrambler = {
            rate, count, mode,
            base: currentGraphicOf(event),
            pool: null,
            wait: Math.floor(Math.random() * 90 / rate),
            burst: 0,
            step: 0
        };
    }

    function clearScrambler(event) {
        if (!event._scrambler) return;
        wearGraphic(event, event._scrambler.base);
        event._scrambler = null;
    }

    function updateScrambler(event) {
        const s = event._scrambler;
        if (!s || !$gameMap || $gameMap.isEventRunning()) return;
        if (!s.pool) {
            s.pool = collectScramblerGraphics(event, s.count);
            if (!s.pool.length) { event._scrambler = null; return; }
            // A flickering event keeps one impostor for its whole life, so it
            // reads as one thing struggling to stay itself.
            s.pair = s.pool[Math.floor(Math.random() * s.pool.length)];
        }
        if (s.wait > 0) { s.wait--; return; }

        if (s.burst <= 0) {
            // Start a new glitch burst: a handful of rapid swaps, then settle.
            s.burst = 2 + Math.floor(Math.random() * 8);
            s.hold = 0;
        }

        if (s.hold > 0) { s.hold--; return; }
        s.hold = 1 + Math.floor(Math.random() * 5);
        s.burst--;

        if (s.burst <= 0) {
            wearGraphic(event, s.base);
            s.wait = Math.floor((30 + Math.random() * 150) / s.rate);
            return;
        }

        if (s.mode === 'flicker') {
            s.step ^= 1;
            wearGraphic(event, s.step ? s.pair : s.base);
        } else if (s.mode === 'cycle') {
            s.step = (s.step + 1) % s.pool.length;
            wearGraphic(event, s.pool[s.step]);
        } else {
            wearGraphic(event, s.pool[Math.floor(Math.random() * s.pool.length)]);
        }
    }

    function scanEventScramblerComments(event) {
        const page = event.page && event.page();
        clearScrambler(event);
        if (!page || !page.list) return;
        for (const cmd of page.list) {
            if (cmd.code !== 108 && cmd.code !== 408) continue;
            const attrs = parseScramblerTag(cmd.parameters[0] || '');
            if (attrs) { registerScrambler(event, attrs); return; }
        }
    }

    const _Game_Event_update_scrambler = Game_Event.prototype.update;
    Game_Event.prototype.update = function () {
        _Game_Event_update_scrambler.call(this);
        if (this._scrambler) updateScrambler(this);
    };

    window.MapPuzzleSystem = {
        checkPuzzleInteractions,
        updatePuzzleCharacter,
        tryPush,
        Scrambler: {
            parseTag: parseScramblerTag,
            register: registerScrambler,
            clear: clearScrambler,
            update: updateScrambler,
            scan: scanEventScramblerComments,
            collect: collectScramblerGraphics,
            MODES: SCRAMBLER_MODES
        }
    };

})();
