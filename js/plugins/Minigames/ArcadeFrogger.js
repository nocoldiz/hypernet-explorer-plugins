/*:
 * @target MZ
 * @plugindesc ASCII Hoppa Game Cart v1.1.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * ASCII Hoppa Game Cart
 * ============================================================================
 * 
 * A classic road-crossing frog game rendered in colored ASCII for the arcade cabinet.
 * Guide your golden @ frog across busy roads and treacherous rivers to reach home!
 * 
 * This cart must be loaded AFTER the ArcadeCabinetManager plugin.
 * 
 * Controls:
 * - Arrow keys to move
 * - Avoid cars on the road
 * - Jump on logs to cross the river
 * - Reach all 5 home spots to complete a level
 * 
 */

(() => {
    'use strict';
    
    const cartId = 'AsciiFrogger';
    const cartName = 'ASCII HOPPA';
    
    // Game constants
    const GRID_WIDTH = 15;
    const GRID_HEIGHT = 13;
    const CELL_SIZE = 24;
    const GAME_SPEED = 1000 / 60; // 60 FPS

    // Play an SE without ever letting a missing/bad file bubble an exception.
    function safePlaySe(se) {
        try {
            AudioManager.playSe(se);
        } catch (e) {
            /* missing audio must not break the game */
        }
    }
    
    // ASCII characters with colors
    const CHARS = {
        FROG: '@',
        CAR_LEFT: '<',
        CAR_RIGHT: '>',
        TRUCK_LEFT: '[',
        TRUCK_RIGHT: ']',
        LOG: '=',
        TURTLE: 'O',
        WATER: '~',
        ROAD: '-',
        GRASS: '.',
        HOME_EMPTY: '^',
        HOME_FILLED: '@',
        DEATH: 'X'
    };
    
    // Color definitions
    const COLORS = {
        FROG: '#FFD700',      // Golden
        CAR: '#FF4444',       // Red
        TRUCK: '#FF8800',     // Orange
        LOG: '#8B4513',       // Brown
        TURTLE: '#228B22',    // Forest Green
        WATER: '#0088FF',     // Blue
        ROAD: '#444444',      // Dark Gray
        GRASS: '#00AA00',     // Green
        HOME_EMPTY: '#FFFF00', // Yellow
        HOME_FILLED: '#FFD700', // Golden
        DEATH: '#FF0000',     // Red
        WALL: '#666666'       // Gray
    };
    
    class FroggerGame {
        constructor() {
            this._container = null;
            this._graphics = null;
            this._gameActive = false;
            this._score = 0;
            this._lives = 3;
            this._level = 1;
            this._time = 60;
            this._frogX = 7;
            this._frogY = 12;
            this._homesCompleted = [false, false, false, false, false];
            this._lanes = [];
            this._updateTimer = 0;
            this._moveTimer = 0;
            this._timeTimer = 0;
            this._isDead = false;
            this._deathTimer = 0;
            this._texts = {};
            this._isDemo = false;
            this._demoMoveTimer = 0;
            this._highScore = 0;
            this._gridCells = [];
            this._updateHandler = null;
            this._endTimeout = null;
        }
        
        start(container) {
            this._container = container;
            this._isDemo = false;
            this.initialize();
        }
        
        startDemo(container) {
            this._container = container;
            this._isDemo = true;
            this.initialize();
        }
        
        initialize() {
            this.stop(); // clear any stale ticker/timeout from a previous run
            // Clear container
            this._container.removeChildren();
            
            // Create background
            this._graphics = new PIXI.Graphics();
            this._container.addChild(this._graphics);
            
            // Create text objects
            this.createTextObjects();
            
            // Create grid cells
            this.createGridCells();
            
            // Initialize game state
            this.resetGame();
            
            // Load high score
            const scores = ArcadeManager.getHighScores(cartId);
            if (scores.length > 0) {
                this._highScore = scores[0].score;
            }
            
            // Set up update loop
            this._updateHandler = this.update.bind(this);
            Graphics.app.ticker.add(this._updateHandler);
            
            // Start game
            ArcadeManager.startGame();
            this._gameActive = true;
        }
        
        createTextObjects() {
            const font = ArcadeManager.getArcadeFont();
            
            // Title
            this._titleText = new PIXI.Text(cartName, {
                fontFamily: font,
                fontSize: 24,
                fill: '#00ff00',
                align: 'center'
            });
            this._titleText.anchor.set(0.5, 0);
            this._titleText.position.set(Graphics.width / 2, 10);
            this._container.addChild(this._titleText);
            
            // Score
            this._scoreText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._scoreText.position.set(50, 50);
            this._container.addChild(this._scoreText);
            
            // High score
            this._highScoreText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffff00'
            });
            this._highScoreText.position.set(Graphics.width - 300, 50);
            this._container.addChild(this._highScoreText);
            
            // Lives
            this._livesText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._livesText.position.set(50, 80);
            this._container.addChild(this._livesText);
            
            // Time
            this._timeText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._timeText.position.set(Graphics.width - 200, 80);
            this._container.addChild(this._timeText);
            
            // Level
            this._levelText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._levelText.position.set(Graphics.width / 2 - 50, 80);
            this._container.addChild(this._levelText);
            
            // Instructions
            if (this._isDemo) {
                this._instructionText = new PIXI.Text('DEMO MODE - GOLDEN @ IS THE FROG', {
                    fontFamily: font,
                    fontSize: 14,
                    fill: '#FFD700',
                    align: 'center'
                });
            } else {
                this._instructionText = new PIXI.Text('GOLDEN @ IS THE FROG', {
                    fontFamily: font,
                    fontSize: 14,
                    fill: '#FFD700',
                    align: 'center'
                });
            }
            this._instructionText.anchor.set(0.5);
            this._instructionText.position.set(Graphics.width / 2, Graphics.height - 30);
            this._container.addChild(this._instructionText);
        }
        
        createGridCells() {
            this._gridCells = [];
            const font = 'monospace';
            const startX = (Graphics.width - GRID_WIDTH * CELL_SIZE) / 2;
            const startY = 120;
            
            for (let y = 0; y < GRID_HEIGHT; y++) {
                this._gridCells[y] = [];
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const cell = new PIXI.Text('', {
                        fontFamily: font,
                        fontSize: 20,
                        fill: '#ffffff'
                    });
                    cell.position.set(
                        startX + x * CELL_SIZE,
                        startY + y * CELL_SIZE
                    );
                    this._container.addChild(cell);
                    this._gridCells[y][x] = cell;
                }
            }
        }
        
        resetGame() {
            this._score = 0;
            this._lives = 3;
            this._level = 1;
            this._time = 60;
            this._frogX = 7;
            this._frogY = 12;
            this._homesCompleted = [false, false, false, false, false];
            this._isDead = false;
            this._deathTimer = 0;
            
            this.initializeLanes();
            this.updateDisplay();
        }
        
        initializeLanes() {
            this._lanes = [];
            
            // Row 0: Home row
            this._lanes[0] = { type: 'home', speed: 0 };
            
            // Rows 1-5: River
            this._lanes[1] = { type: 'river', speed: 0.02, objects: this.createLogs(3) };
            this._lanes[2] = { type: 'river', speed: -0.03, objects: this.createTurtles(4) };
            this._lanes[3] = { type: 'river', speed: 0.025, objects: this.createLogs(3) };
            this._lanes[4] = { type: 'river', speed: -0.02, objects: this.createLogs(2) };
            this._lanes[5] = { type: 'river', speed: 0.03, objects: this.createTurtles(3) };
            
            // Row 6: Safe zone
            this._lanes[6] = { type: 'safe', speed: 0 };
            
            // Rows 7-11: Road
            this._lanes[7] = { type: 'road', speed: -0.02, objects: this.createCars(3, false) };
            this._lanes[8] = { type: 'road', speed: 0.03, objects: this.createCars(2, true) };
            this._lanes[9] = { type: 'road', speed: -0.04, objects: this.createTrucks(2, false) };
            this._lanes[10] = { type: 'road', speed: 0.025, objects: this.createCars(3, true) };
            this._lanes[11] = { type: 'road', speed: -0.035, objects: this.createTrucks(2, false) };
            
            // Row 12: Starting safe zone
            this._lanes[12] = { type: 'safe', speed: 0 };
        }
        
        createLogs(count) {
            const objects = [];
            const spacing = GRID_WIDTH / count;
            for (let i = 0; i < count; i++) {
                objects.push({
                    x: i * spacing,
                    width: 3,
                    type: 'log'
                });
            }
            return objects;
        }
        
        createTurtles(count) {
            const objects = [];
            const spacing = GRID_WIDTH / count;
            for (let i = 0; i < count; i++) {
                objects.push({
                    x: i * spacing,
                    width: 2,
                    type: 'turtle',
                    diving: false,
                    diveTimer: Math.random() * 300
                });
            }
            return objects;
        }
        
        createCars(count, rightDirection) {
            const objects = [];
            const spacing = GRID_WIDTH / count;
            for (let i = 0; i < count; i++) {
                objects.push({
                    x: i * spacing,
                    width: 2,
                    type: rightDirection ? 'car_right' : 'car_left'
                });
            }
            return objects;
        }
        
        createTrucks(count, rightDirection) {
            const objects = [];
            const spacing = GRID_WIDTH / count;
            for (let i = 0; i < count; i++) {
                objects.push({
                    x: i * spacing,
                    width: 3,
                    type: rightDirection ? 'truck_right' : 'truck_left'
                });
            }
            return objects;
        }
        
        update(delta) {
            if (!this._gameActive) return;
            
            const deltaMS = (Graphics.app && Graphics.app.ticker && Graphics.app.ticker.deltaMS) 
                ? Graphics.app.ticker.deltaMS 
                : delta * (1000 / 60); // fallback

            this._updateTimer += deltaMS;
            this._moveTimer += deltaMS;
            this._timeTimer += deltaMS;
                        
            // Update game logic at 60 FPS
            if (this._updateTimer >= GAME_SPEED) {
                this._updateTimer = 0;
                
                // Update lanes
                this.updateLanes();
                
                // Check collisions
                if (!this._isDead) {
                    this.checkCollisions();
                }
                
                // Update death animation
                if (this._isDead) {
                    this._deathTimer++;
                    if (this._deathTimer > 60) {
                        this.respawnFrog();
                    }
                }
            }
            
            // Handle input (or demo movement)
            if (this._moveTimer >= 200 && !this._isDead) { // 200ms between moves
                if (this._isDemo) {
                    this.updateDemoMovement();
                } else {
                    this.handleInput();
                }
            }
            
            // Update timer
            if (this._timeTimer >= 1000) { // 1 second
                this._timeTimer = 0;
                this._time--;
                if (this._time <= 0) {
                    this.killFrog();
                }
            }
            
            // Update display
            this.updateDisplay();
        }
        
        updateLanes() {
            for (let y = 0; y < this._lanes.length; y++) {
                const lane = this._lanes[y];
                if (lane.objects) {
                    for (const obj of lane.objects) {
                        // Move object
                        obj.x += lane.speed;
                        
                        // Wrap around
                        if (lane.speed > 0 && obj.x > GRID_WIDTH) {
                            obj.x = -obj.width;
                        } else if (lane.speed < 0 && obj.x < -obj.width) {
                            obj.x = GRID_WIDTH;
                        }
                        
                        // Update turtle diving
                        if (obj.type === 'turtle') {
                            obj.diveTimer++;
                            if (obj.diveTimer > 300) {
                                obj.diving = !obj.diving;
                                obj.diveTimer = 0;
                            }
                        }
                    }
                }
            }
        }
        
        handleInput() {
            const input = ArcadeManager.getInput();
            
            if (input.up && this._frogY > 0) {
                this._frogY--;
                this._frogX = Math.max(0, Math.min(GRID_WIDTH - 1, Math.round(this._frogX)));
                this._score += 10;
                this._moveTimer = 0;
                this.playMoveSound();
            } else if (input.down && this._frogY < GRID_HEIGHT - 1) {
                this._frogY++;
                this._frogX = Math.max(0, Math.min(GRID_WIDTH - 1, Math.round(this._frogX)));
                this._moveTimer = 0;
                this.playMoveSound();
            } else if (input.left && this._frogX > 0) {
                this._frogX = Math.max(0, Math.round(this._frogX) - 1);
                this._moveTimer = 0;
                this.playMoveSound();
            } else if (input.right && this._frogX < GRID_WIDTH - 1) {
                this._frogX = Math.min(GRID_WIDTH - 1, Math.round(this._frogX) + 1);
                this._moveTimer = 0;
                this.playMoveSound();
            }
        }
        
        updateDemoMovement() {
            this._demoMoveTimer++;
            
            // Simple AI: Try to move up, avoid obstacles
            const currentLane = this._lanes[this._frogY];
            let shouldMove = false;
            let direction = 'up';
            
            // Always try to move up if on safe ground
            if (currentLane.type === 'safe' || this._frogY === 12) {
                shouldMove = true;
                direction = 'up';
            } else if (currentLane.type === 'river') {
                // On river, stay on logs/turtles
                const onPlatform = this.isOnPlatform();
                if (onPlatform) {
                    // Move up occasionally
                    if (Math.random() < 0.3) {
                        shouldMove = true;
                        direction = 'up';
                    }
                }
            } else if (currentLane.type === 'road') {
                // On road, check if safe to move
                if (this.isSafeToMove()) {
                    shouldMove = true;
                    direction = 'up';
                }
            }
            
            if (shouldMove && this._demoMoveTimer > 30) {
                this._demoMoveTimer = 0;
                if (direction === 'up' && this._frogY > 0) {
                    this._frogY--;
                    this._frogX = Math.max(0, Math.min(GRID_WIDTH - 1, Math.round(this._frogX)));
                    this._score += 10;
                    this.playMoveSound();
                }
            }
        }
        
        isSafeToMove() {
            const nextLane = this._lanes[this._frogY - 1];
            if (!nextLane || !nextLane.objects) return true;
            
            for (const obj of nextLane.objects) {
                const objLeft = Math.floor(obj.x);
                const objRight = objLeft + obj.width - 1;
                
                if (this._frogX >= objLeft - 1 && this._frogX <= objRight + 1) {
                    return false;
                }
            }
            return true;
        }
        
        checkCollisions() {
            const currentLane = this._lanes[this._frogY];
            
            // Check if reached home
            if (this._frogY === 0) {
                this.checkHome();
                return;
            }
            
            // Check river
            if (currentLane.type === 'river') {
                if (!this.isOnPlatform()) {
                    this.killFrog();
                    return;
                }
                
                // Move with platform
                const platform = this.getPlatformUnder();
                if (platform && currentLane.speed) {
                    this._frogX += currentLane.speed;
                    
                    // Check bounds
                    if (this._frogX < 0 || this._frogX >= GRID_WIDTH) {
                        this.killFrog();
                    }
                }
            }
            
            // Check road
            if (currentLane.type === 'road') {
                if (this.isHitByVehicle()) {
                    this.killFrog();
                }
            }
        }
        
        isOnPlatform() {
            const lane = this._lanes[this._frogY];
            if (!lane.objects) return false;
            
            for (const obj of lane.objects) {
                const objLeft = Math.floor(obj.x);
                const objRight = objLeft + obj.width - 1;
                
                if (this._frogX >= objLeft && this._frogX <= objRight) {
                    // Check if turtle is diving
                    if (obj.type === 'turtle' && obj.diving) {
                        return false;
                    }
                    return true;
                }
            }
            return false;
        }
        
        getPlatformUnder() {
            const lane = this._lanes[this._frogY];
            if (!lane.objects) return null;
            
            for (const obj of lane.objects) {
                const objLeft = Math.floor(obj.x);
                const objRight = objLeft + obj.width - 1;
                
                if (this._frogX >= objLeft && this._frogX <= objRight) {
                    return obj;
                }
            }
            return null;
        }
        
        isHitByVehicle() {
            const lane = this._lanes[this._frogY];
            if (!lane.objects) return false;
            
            for (const obj of lane.objects) {
                const objLeft = Math.floor(obj.x);
                const objRight = objLeft + obj.width - 1;
                
                if (this._frogX >= objLeft && this._frogX <= objRight) {
                    return true;
                }
            }
            return false;
        }
        
        checkHome() {
            // Home positions are at x = 1, 4, 7, 10, 13
            const homePositions = [1, 4, 7, 10, 13];
            const roundedX = Math.round(this._frogX);
            const homeIndex = homePositions.indexOf(roundedX);
            
            if (homeIndex !== -1 && !this._homesCompleted[homeIndex]) {
                this._homesCompleted[homeIndex] = true;
                this._score += 200;
                this._time = 60; // Reset timer
                this.playSuccessSound();
                
                // Check if level complete
                if (this._homesCompleted.every(h => h)) {
                    this.nextLevel();
                } else {
                    this.respawnFrog(false);
                }
            } else {
                // Hit a wall or already completed home
                this.killFrog();
            }
        }
        
        killFrog() {
            this._isDead = true;
            this._deathTimer = 0;
            this.playDeathSound();
        }
        
        respawnFrog(loseLife = true) {
            this._isDead = false;
            this._deathTimer = 0;
            this._frogX = 7;
            this._frogY = 12;
            this._time = 60;

            // Only a death costs a life. Reaching a home (or clearing a level)
            // returns the frog to the start without penalty, so a level with
            // five homes is actually completable on three lives.
            if (loseLife) {
                this._lives--;

                if (this._lives <= 0) {
                    this.gameOver();
                }
            }
        }
        
        nextLevel() {
            this._level++;
            this._score += 1000;
            this._homesCompleted = [false, false, false, false, false];
            this.respawnFrog(false);
            this._lives++; // Bonus life
            
            // Increase difficulty
            for (const lane of this._lanes) {
                if (lane.speed) {
                    lane.speed *= 1.2;
                }
            }
        }
        
        gameOver() {
            this._gameActive = false;

            // Do NOT submit here: ArcadeManager.endGame -> onGameEnd handles the
            // high-score flow (Scene_InitialEntry) and would double-submit otherwise.
            this._removeTicker();

            // Return to arcade
            this._endTimeout = setTimeout(() => {
                this._endTimeout = null;
                ArcadeManager.endGame(this._score);
            }, 2000);
        }

        _removeTicker() {
            if (this._updateHandler) {
                Graphics.app.ticker.remove(this._updateHandler);
                this._updateHandler = null;
            }
        }

        // Manager teardown contract: stop everything on cancel-exit.
        stop() {
            this._gameActive = false;
            this._removeTicker();
            if (this._endTimeout) {
                clearTimeout(this._endTimeout);
                this._endTimeout = null;
            }
        }
        
        updateDisplay() {
            // Update text displays
            this._scoreText.text = T('Arcade.hud.score', { score: this._score });
            this._highScoreText.text = T('Arcade.hud.hiScore', { score: Math.max(this._score, this._highScore) });
            this._livesText.text = T('Arcade.hud.lives', { lives: this._lives });
            this._timeText.text = T('Arcade.hud.time', { time: this._time });
            this._levelText.text = T('Arcade.hud.level', { level: this._level });
            
            // Draw game grid
            this.drawGrid();
        }
        
        drawGrid() {
            // Build a per-lane char/color buffer: fill the background per cell, then
            // iterate each lane's objects once writing only the cells they span,
            // instead of scanning every object for every cell (O(cells*objects)).
            let buf = this._gridBuffer;
            if (!buf) {
                buf = this._gridBuffer = [];
                for (let y = 0; y < GRID_HEIGHT; y++) {
                    const row = [];
                    for (let x = 0; x < GRID_WIDTH; x++) row.push({ char: ' ', color: '#ffffff' });
                    buf.push(row);
                }
            }

            for (let y = 0; y < GRID_HEIGHT; y++) {
                const lane = this._lanes[y];
                const row = buf[y];

                // Background
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const b = row[x];
                    let char = ' ';
                    let color = '#ffffff';
                    if (lane.type === 'home') {
                        if ([1, 4, 7, 10, 13].includes(x)) {
                            const homeIndex = [1, 4, 7, 10, 13].indexOf(x);
                            char = this._homesCompleted[homeIndex] ? CHARS.HOME_FILLED : CHARS.HOME_EMPTY;
                            color = this._homesCompleted[homeIndex] ? COLORS.HOME_FILLED : COLORS.HOME_EMPTY;
                        } else {
                            char = '#';
                            color = COLORS.WALL;
                        }
                    } else if (lane.type === 'river') {
                        char = CHARS.WATER;
                        color = COLORS.WATER;
                    } else if (lane.type === 'road') {
                        char = CHARS.ROAD;
                        color = COLORS.ROAD;
                    } else if (lane.type === 'safe') {
                        char = CHARS.GRASS;
                        color = COLORS.GRASS;
                    }
                    b.char = char;
                    b.color = color;
                }

                // Objects (only over their spanned columns)
                if (lane.objects) {
                    for (const obj of lane.objects) {
                        const objLeft = Math.floor(obj.x);
                        const objRight = objLeft + obj.width - 1;
                        let char = null, color = null;
                        if (obj.type === 'log') {
                            char = CHARS.LOG; color = COLORS.LOG;
                        } else if (obj.type === 'turtle') {
                            if (obj.diving) { char = CHARS.WATER; color = COLORS.WATER; }
                            else { char = CHARS.TURTLE; color = COLORS.TURTLE; }
                        } else if (obj.type === 'car_left') {
                            char = CHARS.CAR_LEFT; color = COLORS.CAR;
                        } else if (obj.type === 'car_right') {
                            char = CHARS.CAR_RIGHT; color = COLORS.CAR;
                        } else if (obj.type === 'truck_left') {
                            char = CHARS.TRUCK_LEFT; color = COLORS.TRUCK;
                        } else if (obj.type === 'truck_right') {
                            char = CHARS.TRUCK_RIGHT; color = COLORS.TRUCK;
                        }
                        if (char === null) continue;
                        const from = Math.max(0, objLeft);
                        const to = Math.min(GRID_WIDTH - 1, objRight);
                        for (let x = from; x <= to; x++) {
                            row[x].char = char;
                            row[x].color = color;
                        }
                    }
                }
            }

            // Frog (always on top)
            const fx = Math.floor(this._frogX);
            const fy = this._frogY;
            if (fx >= 0 && fx < GRID_WIDTH && fy >= 0 && fy < GRID_HEIGHT) {
                const b = buf[fy][fx];
                b.char = this._isDead ? CHARS.DEATH : CHARS.FROG;
                b.color = this._isDead ? COLORS.DEATH : COLORS.FROG;
            }

            // Render from the buffer
            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const cell = this._gridCells[y][x];
                    const b = buf[y][x];
                    cell.text = b.char;
                    cell.style.fill = b.color;
                }
            }
        }
        
        // Sound effects
        playMoveSound() {
            if (!this._isDemo) {
                ArcadeManager.playSound('select');
            }
        }
        
        playDeathSound() {
            if (!this._isDemo) {
                // Damage1 exists in audio/se; wrapped for safety.
                const se = { name: 'Damage1', volume: 90, pitch: 80, pan: 0 };
                safePlaySe(se);
            }
        }

        playSuccessSound() {
            if (!this._isDemo) {
                // Item1 exists in audio/se; wrapped for safety.
                const se = { name: 'Item1', volume: 90, pitch: 100, pan: 0 };
                safePlaySe(se);
            }
        }
    }
    
    // Create game instance
    const froggerGame = new FroggerGame();
    
    // Register with arcade manager
    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, froggerGame);
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
    
})();