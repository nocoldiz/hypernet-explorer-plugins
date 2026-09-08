/*:
 * @target MZ
 * @plugindesc ASCII Snake Game Cart with AI, Static Grass BG, Respawn & Speed Power-up v1.5.1
 * @author Omni-Lex
 * @url
 * @help
 * ============================================================================
 * ASCII Snake Game Cart
 * ============================================================================
 *
 * A golden player snake competes against a red AI snake to eat apples (*).
 * Grab an orange power-up (+) to double your speed for 3 seconds.
 * Background is a static ASCII grass field. The AI snake respawns after 3 seconds when eaten or colliding.
 *
 * Controls:
 *   - Arrow keys or WASD: Move player snake
 *
 * Load this cart after the ArcadeCabinetManager plugin.
 */

(() => {
    const cartId = 'AsciiSnake';
    const cartName = 'ASCII SNAKE';

    // Settings
    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 15;
    const CELL_SIZE = 24;
    const BASE_SPEED = 150; // ms per move
    const BOOST_DURATION = 3000; // ms
    const BOOST_MULTIPLIER = 0.5; // half interval
    const RESPAWN_DELAY = 3000; // AI respawn after 3s

    // Base Snake class
    class Snake {
        constructor(char) {
            this.body = [];
            this.dir = { x: 1, y: 0 };
            this.char = char;
            this.alive = true;
        }
        head() { return this.body[0]; }
        // The direction must be re-seeded here: the game object is a reused
        // singleton, so a snake that died facing its own tail would walk straight
        // back into it on the very first step of the next run.
        init(points, dir) {
            this.body = points.slice();
            this.dir = dir ? { x: dir.x, y: dir.y } : { x: 1, y: 0 };
            this.alive = true;
        }
        move(next) { this.body.unshift(next); this.body.pop(); }
        grow(next) { this.body.unshift(next); }
    }

    // Red AI: competes for apples
    class RedSnake extends Snake {
        chooseDir(apple) {
            const h = this.head();
            const dx = apple.x - h.x;
            const dy = apple.y - h.y;
            return Math.abs(dx) > Math.abs(dy)
                ? { x: Math.sign(dx), y: 0 }
                : { x: 0, y: Math.sign(dy) };
        }
    }

    class SnakeGame {
        constructor() {
            this.container = null;
            this.grid = [];
            this.staticBG = [];
            this.player = new Snake('@');
            this.competitor = new RedSnake('R');
            this.apple = null;
            this.powerup = null;
            this.updateTimer = 0;
            this.respawnTimer = 0;
            this.awaitRespawn = false;
            this.speed = BASE_SPEED;
            this.boostTimer = 0;
            this.boostActive = false;
            // Keep a single bound reference so the ticker can actually be removed.
            this._boundUpdate = this.update.bind(this);
            this._running = false;
        }
        start(container) {
            this.container = container;
            // Reset per-run transient state; this is a reused singleton, so a game
            // ended mid-boost or awaiting respawn would otherwise poison the next play.
            this.updateTimer = 0;
            this.respawnTimer = 0;
            this.awaitRespawn = false;
            this.speed = BASE_SPEED;
            this.boostTimer = 0;
            this.boostActive = false;
            this.initGrid();
            this.initStaticBG();
            this.spawnApple();
            this.spawnPowerup();
            const cx = Math.floor(GRID_WIDTH / 2);
            const cy = Math.floor(GRID_HEIGHT / 2);
            this.player.init([{ x: cx, y: cy }, { x: cx - 1, y: cy }], { x: 1, y: 0 });
            this.competitor.init([{ x: 1, y: 1 }, { x: 0, y: 1 }], { x: 1, y: 0 });
            this.stop(); // ensure no stale ticker from a previous run
            Graphics.app.ticker.add(this._boundUpdate);
            this._running = true;
            ArcadeManager.startGame();
        }
        // Attract loop. The cabinet calls this instead of start() when nobody
        // has put a coin in; the board is the same one, left to the competitor
        // AI, so an idle machine shows a moving screen rather than a blank one.
        startDemo(container) {
            this._demo = true;
            this.start(container);
        }
        // Manager teardown contract: cancel the ticker when the cart is closed.
        stop() {
            if (this._running) {
                Graphics.app.ticker.remove(this._boundUpdate);
                this._running = false;
            }
        }
        initGrid() {
            const sx = (Graphics.width - GRID_WIDTH * CELL_SIZE) / 2;
            const sy = 120;
            for (let y = 0; y < GRID_HEIGHT; y++) {
                this.grid[y] = [];
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const cell = new PIXI.Text(' ', {
                        fontFamily: 'monospace', fontSize: 20, fill: '#228B22'
                    });
                    cell.position.set(sx + x * CELL_SIZE, sy + y * CELL_SIZE);
                    this.container.addChild(cell);
                    this.grid[y][x] = cell;
                }
            }
        }
        initStaticBG() {
            const grassChars = ['.', ',', '`', "'", ' '];
            for (let y = 0; y < GRID_HEIGHT; y++) {
                this.staticBG[y] = [];
                for (let x = 0; x < GRID_WIDTH; x++) {
                    this.staticBG[y][x] = grassChars[
                        Math.floor(Math.random() * grassChars.length)
                    ];
                }
            }
        }
        randomEmpty() {
            let pos, ok;
            do {
                pos = { x: Math.floor(Math.random() * GRID_WIDTH), y: Math.floor(Math.random() * GRID_HEIGHT) };
                ok = !(this.apple && pos.x === this.apple.x && pos.y === this.apple.y)
                    && !this.player.body.some(p => p.x === pos.x && p.y === pos.y)
                    && !(this.competitor.alive && this.competitor.body.some(p => p.x === pos.x && p.y === pos.y))
                    && !(this.powerup && pos.x === this.powerup.x && pos.y === this.powerup.y);
            } while (!ok);
            return pos;
        }
        spawnApple() { this.apple = this.randomEmpty(); }
        spawnPowerup() { this.powerup = this.randomEmpty(); }
        update(delta) {
            const dt = Graphics.app.ticker.deltaMS;
            this.updateTimer += dt;
            if (this.awaitRespawn) {
                this.respawnTimer += dt;
                if (this.respawnTimer >= RESPAWN_DELAY) {
                    this.competitor.init([{ x: 1, y: 1 }, { x: 0, y: 1 }], { x: 1, y: 0 });
                    this.awaitRespawn = false;
                    this.respawnTimer = 0;
                }
            }
            if (this.boostActive) {
                this.boostTimer += dt;
                if (this.boostTimer >= BOOST_DURATION) {
                    this.speed = BASE_SPEED;
                    this.boostActive = false;
                    this.boostTimer = 0;
                }
            }
            if (this.updateTimer < this.speed) return;
            this.updateTimer = 0;
            this.step();
            this.draw();
        }
        step() {
            const inp = ArcadeManager.getInput();
            if (inp.up && this.player.dir.y !== 1) this.player.dir = { x: 0, y: -1 };
            if (inp.down && this.player.dir.y !== -1) this.player.dir = { x: 0, y: 1 };
            if (inp.left && this.player.dir.x !== 1) this.player.dir = { x: -1, y: 0 };
            if (inp.right && this.player.dir.x !== -1) this.player.dir = { x: 1, y: 0 };
            const nextP = { x: this.player.head().x + this.player.dir.x, y: this.player.head().y + this.player.dir.y };
            if (this.isCollision(nextP, this.player)) return this.endGame(0);
            if (this.powerup && nextP.x === this.powerup.x && nextP.y === this.powerup.y) {
                this.speed = BASE_SPEED * BOOST_MULTIPLIER;
                this.boostActive = true;
                this.boostTimer = 0;
                this.spawnPowerup();
            }
            if (nextP.x === this.apple.x && nextP.y === this.apple.y) {
                this.player.grow(nextP);
                this.spawnApple();
            } else {
                this.player.move(nextP);
            }
            if (this.competitor.alive) {
                const dirR = this.competitor.chooseDir(this.apple);
                const nextR = { x: this.competitor.head().x + dirR.x, y: this.competitor.head().y + dirR.y };
                if (this.isCollision(nextR, this.competitor)) {
                    this.competitor.alive = false;
                    this.awaitRespawn = true;
                } else {
                    if (nextR.x === this.apple.x && nextR.y === this.apple.y) {
                        this.competitor.grow(nextR);
                        this.spawnApple();
                    } else {
                        this.competitor.move(nextR);
                    }
                }
            }
        }
        isCollision(pos, snake) {
            return pos.x < 0 || pos.x >= GRID_WIDTH || pos.y < 0 || pos.y >= GRID_HEIGHT
                || snake.body.some(p => p.x === pos.x && p.y === pos.y);
        }
        draw() {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const cell = this.grid[y][x];
                    if (!cell) continue;
                    cell.text = this.staticBG[y][x];
                    cell.style.fill = '#228B22';
                }
            }
            if (this.apple) {
                const a = this.grid[this.apple.y][this.apple.x];
                if (a) { a.text = '*'; a.style.fill = '#FF00FF'; }
            }
            if (this.powerup) {
                const p = this.grid[this.powerup.y][this.powerup.x];
                if (p) { p.text = '+'; p.style.fill = '#FFA500'; }
            }
            this.drawSnake(this.player, '#FFD700');
            if (this.competitor.alive) this.drawSnake(this.competitor, '#FF0000');
        }
        drawSnake(snake, color) {
            snake.body.forEach((seg, i) => {
                const c = this.grid[seg.y]?.[seg.x];
                if (c) {
                    c.text = i === 0 ? snake.char : snake.char.toLowerCase();
                    c.style.fill = color;
                }
            });
        }
        endGame(score) {
            this.stop();
            ArcadeManager.endGame(score);
        }
    }

    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, new SnakeGame());
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
})();
