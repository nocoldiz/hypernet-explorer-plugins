/*:
 * @target MZ
 * @plugindesc ASCII Invaders Game Cart v1.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * ASCII Invaders Game Cart
 * ============================================================================
 * 
 * Protect the Earth from waves of descending ASCII invaders!
 * 
 * Controls:
 * - Left/Right Arrows or A/D to move defender
 * - Action button (OK/Space) to fire laser
 * - Hide behind barriers to block incoming fire
 * 
 * This cart must be loaded AFTER the ArcadeCabinetManager plugin.
 * 
 */

(() => {
    'use strict';
    
    const cartId = 'AsciiSpaceInvaders';
    const cartName = 'ASCII INVADERS';
    
    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 16;
    const CELL_SIZE = 24;
    const TICK_SPEED = 1000 / 60; // 60 FPS

    // Play an SE without ever letting a missing/bad file bubble an exception.
    function safePlaySe(se) {
        try {
            AudioManager.playSe(se);
        } catch (e) {
            /* missing audio must not break the game */
        }
    }
    
    class SpaceInvadersGame {
        constructor() {
            this._container = null;
            this._gridCells = [];
            this._gameActive = false;
            this._isDemo = false;
            
            this._score = 0;
            this._lives = 3;
            this._level = 1;
            
            this._playerX = 10;
            this._bullets = [];
            this._aliens = [];
            this._alienBullets = [];
            this._bunkers = [];
            
            this._alienDirection = 1; // 1 = right, -1 = left
            this._alienMoveTimer = 0;
            this._alienShootTimer = 0;
            this._playerShootCooldown = 0;
            this._playerMoveCooldown = 0;
            
            this._texts = {};
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
            this._container.removeChildren();
            this.createTextObjects();
            this.createGridCells();
            this.resetGame();

            this._updateHandler = this.update.bind(this);
            Graphics.app.ticker.add(this._updateHandler);
            
            ArcadeManager.startGame();
            this._gameActive = true;
        }
        
        createTextObjects() {
            const font = ArcadeManager.getArcadeFont();
            
            // Score
            this._scoreText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._scoreText.position.set(50, 40);
            this._container.addChild(this._scoreText);
            
            // Lives
            this._livesText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._livesText.position.set(50, 70);
            this._container.addChild(this._livesText);
            
            // Level
            this._levelText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._levelText.position.set(Graphics.width - 250, 40);
            this._container.addChild(this._levelText);
            
            // Instructions
            const instrStr = this._isDemo ? 'DEMO MODE - SPECTATING' : '';
            this._instructionText = new PIXI.Text(instrStr, {
                fontFamily: font,
                fontSize: 14,
                fill: '#00FF00',
                align: 'center'
            });
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
            this._playerX = Math.floor(GRID_WIDTH / 2);
            this._bullets = [];
            this._alienBullets = [];
            this.spawnAliens();
            this.spawnBunkers();
            this.updateDisplay();
        }
        
        spawnAliens() {
            this._aliens = [];
            // Spawn 3 rows of aliens
            const rowsCount = 3;
            const aliensPerRow = 8;
            for (let row = 0; row < rowsCount; row++) {
                for (let col = 0; col < aliensPerRow; col++) {
                    this._aliens.push({
                        x: col * 2 + 2,
                        y: row * 2 + 2,
                        type: row === 0 ? 'X' : (row === 1 ? 'W' : 'M'),
                        points: (3 - row) * 10
                    });
                }
            }
            this._alienDirection = 1;
        }
        
        spawnBunkers() {
            this._bunkers = [];
            // 3 bunkers, each 3x1 block
            const bunkerPositions = [3, 9, 15];
            for (const startX of bunkerPositions) {
                for (let dx = 0; dx < 3; dx++) {
                    this._bunkers.push({
                        x: startX + dx,
                        y: GRID_HEIGHT - 3,
                        hp: 3
                    });
                }
            }
        }
        
        update(delta) {
            if (!this._gameActive) return;
            
            const deltaMS = (Graphics.app && Graphics.app.ticker && Graphics.app.ticker.deltaMS) 
                ? Graphics.app.ticker.deltaMS 
                : delta * TICK_SPEED;

            // Reduce cooldowns
            if (this._playerShootCooldown > 0) {
                this._playerShootCooldown -= deltaMS;
            }
            if (this._playerMoveCooldown > 0) {
                this._playerMoveCooldown -= deltaMS;
            }
            
            // AI / Input controls
            if (this._isDemo) {
                this.updateDemoAI(deltaMS);
            } else {
                this.handleInput(deltaMS);
            }
            
            // Move bullets
            this.updateBullets(deltaMS);
            
            // Alien movement behavior
            this._alienMoveTimer += deltaMS;
            const currentAlienSpeed = Math.max(100, 1000 - (this._level * 100) - (24 - this._aliens.length) * 35);
            if (this._alienMoveTimer >= currentAlienSpeed) {
                this._alienMoveTimer = 0;
                this.moveAliens();
            }
            
            // Alien shooting
            this._alienShootTimer += deltaMS;
            if (this._alienShootTimer >= 1500) {
                this._alienShootTimer = 0;
                this.alienFire();
            }
            
            // Collisions
            this.checkCollisions();
            
            this.updateDisplay();
        }
        
        handleInput(deltaMS) {
            const input = ArcadeManager.getInput();
            // Gate horizontal movement so holding a direction doesn't skate the
            // defender across ~60 cells/sec (mirrors the shoot cooldown).
            if (this._playerMoveCooldown <= 0) {
                if (input.left && this._playerX > 0) {
                    this._playerX--;
                    this._playerMoveCooldown = 150;
                    ArcadeManager.playSound('select');
                } else if (input.right && this._playerX < GRID_WIDTH - 1) {
                    this._playerX++;
                    this._playerMoveCooldown = 150;
                    ArcadeManager.playSound('select');
                }
            }

            if (input.action && this._playerShootCooldown <= 0) {
                this.firePlayerLaser();
            }
        }
        
        updateDemoAI(deltaMS) {
            // Demo AI follows the nearest alien or avoids bullets
            if (this._aliens.length === 0) return;
            
            // Default target: first alien
            const target = this._aliens[0];
            let targetX = target.x;
            
            // Find closest alien's X
            let minDist = 999;
            for (const alien of this._aliens) {
                const dist = Math.abs(alien.x - this._playerX);
                if (dist < minDist) {
                    minDist = dist;
                    targetX = alien.x;
                }
            }
            
            // Move towards target
            if (Math.random() < 0.2) {
                if (this._playerX < targetX && this._playerX < GRID_WIDTH - 1) {
                    this._playerX++;
                } else if (this._playerX > targetX && this._playerX > 0) {
                    this._playerX--;
                }
            }
            
            // Periodically fire
            if (Math.random() < 0.1 && this._playerShootCooldown <= 0) {
                this.firePlayerLaser();
            }
        }
        
        firePlayerLaser() {
            this._bullets.push({
                x: this._playerX,
                y: GRID_HEIGHT - 2,
                speedY: -1
            });
            this._playerShootCooldown = 300; // 300ms cooldown
            
            if (!this._isDemo) {
                // Laser1 only exists in the Laser/ subfolder; use a stock top-level SE.
                const se = { name: 'Gun1', volume: 70, pitch: 120, pan: 0 };
                safePlaySe(se);
            }
        }

        alienFire() {
            if (this._aliens.length === 0) return;
            // Pick a random alien
            const shooter = this._aliens[Math.floor(Math.random() * this._aliens.length)];
            this._alienBullets.push({
                x: shooter.x,
                y: shooter.y + 1,
                speedY: 1
            });
            
            if (!this._isDemo) {
                // Laser2 only exists in the Laser/ subfolder; use a stock top-level SE.
                const se = { name: 'Gun2', volume: 50, pitch: 80, pan: 0 };
                safePlaySe(se);
            }
        }
        
        updateBullets(deltaMS) {
            // Player bullets
            for (let i = this._bullets.length - 1; i >= 0; i--) {
                this._bullets[i].y += this._bullets[i].speedY;
                if (this._bullets[i].y < 0) {
                    this._bullets.splice(i, 1);
                }
            }
            
            // Alien bullets
            for (let i = this._alienBullets.length - 1; i >= 0; i--) {
                this._alienBullets[i].y += this._alienBullets[i].speedY;
                if (this._alienBullets[i].y >= GRID_HEIGHT) {
                    this._alienBullets.splice(i, 1);
                }
            }
        }
        
        moveAliens() {
            if (this._aliens.length === 0) return;
            
            // Check edge collisions
            let hitEdge = false;
            for (const alien of this._aliens) {
                const nextX = alien.x + this._alienDirection;
                if (nextX < 0 || nextX >= GRID_WIDTH) {
                    hitEdge = true;
                    break;
                }
            }
            
            if (hitEdge) {
                this._alienDirection *= -1;
                // Move down
                for (const alien of this._aliens) {
                    alien.y++;
                    if (alien.y >= GRID_HEIGHT - 2) {
                        this.gameOver();
                        return;
                    }
                }
            } else {
                for (const alien of this._aliens) {
                    alien.x += this._alienDirection;
                }
            }
        }
        
        checkCollisions() {
            // Player bullets hitting aliens
            for (let bIndex = this._bullets.length - 1; bIndex >= 0; bIndex--) {
                const b = this._bullets[bIndex];
                let hit = false;
                for (let aIndex = this._aliens.length - 1; aIndex >= 0; aIndex--) {
                    const alien = this._aliens[aIndex];
                    if (Math.round(b.x) === alien.x && Math.round(b.y) === alien.y) {
                        this._score += alien.points;
                        this._aliens.splice(aIndex, 1);
                        this._bullets.splice(bIndex, 1);
                        hit = true;
                        
                        if (!this._isDemo) {
                            const se = { name: 'Explosion1', volume: 60, pitch: 150, pan: 0 };
                            safePlaySe(se);
                        }
                        break;
                    }
                }
                
                if (hit) continue;
                
                // Player bullets hitting bunkers
                for (let bkIndex = this._bunkers.length - 1; bkIndex >= 0; bkIndex--) {
                    const bunker = this._bunkers[bkIndex];
                    if (Math.round(b.x) === bunker.x && Math.round(b.y) === bunker.y) {
                        bunker.hp--;
                        this._bullets.splice(bIndex, 1);
                        if (bunker.hp <= 0) {
                            this._bunkers.splice(bkIndex, 1);
                        }
                        break;
                    }
                }
            }
            
            // Alien bullets hitting bunkers/player
            for (let bIndex = this._alienBullets.length - 1; bIndex >= 0; bIndex--) {
                const b = this._alienBullets[bIndex];
                let hit = false;
                
                // Check bunkers
                for (let bkIndex = this._bunkers.length - 1; bkIndex >= 0; bkIndex--) {
                    const bunker = this._bunkers[bkIndex];
                    if (Math.round(b.x) === bunker.x && Math.round(b.y) === bunker.y) {
                        bunker.hp--;
                        this._alienBullets.splice(bIndex, 1);
                        if (bunker.hp <= 0) {
                            this._bunkers.splice(bkIndex, 1);
                        }
                        hit = true;
                        break;
                    }
                }
                
                if (hit) continue;
                
                // Check player
                if (Math.round(b.x) === this._playerX && Math.round(b.y) === GRID_HEIGHT - 2) {
                    this._alienBullets.splice(bIndex, 1);
                    this.hitPlayer();
                }
            }
            
            // Check next level
            if (this._aliens.length === 0) {
                this.nextLevel();
            }
        }
        
        hitPlayer() {
            this._lives--;
            if (!this._isDemo) {
                const se = { name: 'Damage2', volume: 80, pitch: 90, pan: 0 };
                safePlaySe(se);
            }
            
            if (this._lives <= 0) {
                this.gameOver();
            } else {
                // Clear bullets and reposition player
                this._bullets = [];
                this._alienBullets = [];
                this._playerX = Math.floor(GRID_WIDTH / 2);
            }
        }
        
        nextLevel() {
            this._level++;
            this._score += 500;
            this.spawnAliens();
            this.spawnBunkers();
        }
        
        gameOver() {
            this._gameActive = false;

            // Do NOT submit here: ArcadeManager.endGame -> onGameEnd handles the
            // high-score flow (Scene_InitialEntry) and would double-submit otherwise.
            this._removeTicker();

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
            this._scoreText.text = T('Arcade.hud.score', { score: this._score });
            this._livesText.text = T('Arcade.hud.lives', { lives: this._lives });
            this._levelText.text = T('Arcade.hud.level', { level: this._level });
            this.drawGrid();
        }
        
        drawGrid() {
            // Build a char/color buffer from the entity lists in one pass each,
            // instead of scanning all four lists (Array.find) for every one of the
            // GRID_WIDTH*GRID_HEIGHT cells. Later writes take precedence, matching
            // the original per-cell layering order.
            let buf = this._gridBuffer;
            if (!buf) {
                buf = this._gridBuffer = [];
                for (let y = 0; y < GRID_HEIGHT; y++) {
                    const row = [];
                    for (let x = 0; x < GRID_WIDTH; x++) row.push({ char: ' ', color: '#ffffff' });
                    buf.push(row);
                }
            }
            const inBounds = (x, y) => x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;

            // Clear
            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const b = buf[y][x];
                    b.char = ' ';
                    b.color = '#ffffff';
                }
            }

            // Bunkers
            for (const bk of this._bunkers) {
                if (!inBounds(bk.x, bk.y)) continue;
                const b = buf[bk.y][bk.x];
                b.char = bk.hp === 3 ? '#' : (bk.hp === 2 ? 'o' : '.');
                b.color = '#888888';
            }
            // Aliens
            for (const a of this._aliens) {
                if (!inBounds(a.x, a.y)) continue;
                const b = buf[a.y][a.x];
                b.char = a.type;
                b.color = '#FF00FF';
            }
            // Player bullets
            for (const bl of this._bullets) {
                const x = Math.round(bl.x), y = Math.round(bl.y);
                if (!inBounds(x, y)) continue;
                const b = buf[y][x];
                b.char = '|';
                b.color = '#00FF00';
            }
            // Alien bullets
            for (const bl of this._alienBullets) {
                const x = Math.round(bl.x), y = Math.round(bl.y);
                if (!inBounds(x, y)) continue;
                const b = buf[y][x];
                b.char = ':';
                b.color = '#FF4444';
            }
            // Player defender
            const py = GRID_HEIGHT - 2;
            if (inBounds(this._playerX, py)) {
                const b = buf[py][this._playerX];
                b.char = 'A';
                b.color = '#00FF00';
            }
            for (const dx of [-1, 1]) {
                const x = this._playerX + dx;
                if (inBounds(x, py)) {
                    const b = buf[py][x];
                    b.char = '=';
                    b.color = '#00FF00';
                }
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
    }
    
    const spaceInvadersGame = new SpaceInvadersGame();
    
    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, spaceInvadersGame);
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
})();
