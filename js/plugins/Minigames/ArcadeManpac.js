/*:
 * @target MZ
 * @plugindesc MANPAC Maze Game Cart v1.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * MANPAC Game Cart
 * ============================================================================
 *
 * Eat every pellet in the maze while three hunters chase you down.
 * Swallow a power pill (O) and the hunters turn edible for a few seconds.
 * The side corridor wraps around the screen.
 *
 * Controls:
 * - Arrows or WASD to steer (the turn is buffered until it becomes legal)
 *
 * This cart must be loaded AFTER the ArcadeCabinetManager plugin.
 *
 */

(() => {
    'use strict';

    const cartId = 'Manpac';
    const cartName = 'MANPAC';

    const CELL_SIZE = 24;
    const TICK_SPEED = 1000 / 60;

    // '#' wall, '.' pellet, 'O' power pill, ' ' empty corridor.
    // Row 8 has no side walls: it is the wrap-around tunnel.
    const MAZE = [
        '####################',
        '#O.......##.......O#',
        '#.##.###.##.###.##.#',
        '#.##.###.##.###.##.#',
        '#..................#',
        '#.##.##.####.##.##.#',
        '#....##......##....#',
        '###..##.####.##..###',
        '........#..#........',
        '#.####..#..#..####.#',
        '#.#..............#.#',
        '#.#.####.##.####.#.#',
        '#O......#..#......O#',
        '#.#####.#..#.#####.#',
        '#..................#',
        '####################'
    ];

    const GRID_WIDTH = MAZE[0].length;
    const GRID_HEIGHT = MAZE.length;
    const TUNNEL_ROW = 8;

    const PLAYER_START = { x: 9, y: 14 };
    const GHOST_STARTS = [
        { x: 9, y: 10, char: 'A', color: '#FF4444', mode: 'chase' },
        { x: 10, y: 10, char: 'B', color: '#FF88FF', mode: 'ambush' },
        { x: 9, y: 9, char: 'C', color: '#00FFFF', mode: 'random' }
    ];

    const FRIGHT_DURATION = 6000;
    const DIRS = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 }
    ];

    // Play an SE without ever letting a missing/bad file bubble an exception.
    function safePlaySe(se) {
        try {
            AudioManager.playSe(se);
        } catch (e) {
            /* missing audio must not break the game */
        }
    }

    class ManpacGame {
        constructor() {
            this._container = null;
            this._gridCells = [];
            this._gameActive = false;
            this._isDemo = false;

            this._score = 0;
            this._lives = 3;
            this._level = 1;

            this._maze = [];
            this._player = null;
            this._ghosts = [];
            this._frightTimer = 0;
            this._ghostCombo = 0;
            this._playerTimer = 0;
            this._ghostTimer = 0;
            this._chompFlip = false;

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

            this._scoreText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._scoreText.position.set(50, 40);
            this._container.addChild(this._scoreText);

            this._livesText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._livesText.position.set(50, 70);
            this._container.addChild(this._livesText);

            this._levelText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 16,
                fill: '#ffffff'
            });
            this._levelText.position.set(Graphics.width - 250, 40);
            this._container.addChild(this._levelText);

            const instrStr = this._isDemo ? T('Arcade.hud.demoSpectating') : '';
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
            this.loadMaze();
            this.resetActors();
            this.updateDisplay();
        }

        loadMaze() {
            this._maze = MAZE.map(row => row.split(''));
        }

        resetActors() {
            this._player = {
                x: PLAYER_START.x,
                y: PLAYER_START.y,
                dir: { x: 0, y: 0 },
                nextDir: { x: 0, y: 0 }
            };
            this._ghosts = GHOST_STARTS.map(g => ({
                x: g.x,
                y: g.y,
                startX: g.x,
                startY: g.y,
                char: g.char,
                color: g.color,
                mode: g.mode,
                dir: { x: 0, y: -1 }
            }));
            this._frightTimer = 0;
            this._ghostCombo = 0;
            this._playerTimer = 0;
            this._ghostTimer = 0;
        }

        playerStepDelay() {
            return Math.max(90, 160 - this._level * 6);
        }

        ghostStepDelay() {
            const base = Math.max(110, 190 - this._level * 8);
            return this._frightTimer > 0 ? base * 1.6 : base;
        }

        wrapX(x) {
            if (x < 0) return GRID_WIDTH - 1;
            if (x >= GRID_WIDTH) return 0;
            return x;
        }

        isWall(x, y) {
            if (y < 0 || y >= GRID_HEIGHT) return true;
            return this._maze[y][this.wrapX(x)] === '#';
        }

        hasPelletsLeft() {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const c = this._maze[y][x];
                    if (c === '.' || c === 'O') return true;
                }
            }
            return false;
        }

        update(delta) {
            if (!this._gameActive) return;

            const deltaMS = (Graphics.app && Graphics.app.ticker && Graphics.app.ticker.deltaMS)
                ? Graphics.app.ticker.deltaMS
                : delta * TICK_SPEED;

            if (this._frightTimer > 0) {
                this._frightTimer -= deltaMS;
                if (this._frightTimer <= 0) {
                    this._frightTimer = 0;
                    this._ghostCombo = 0;
                }
            }

            if (this._isDemo) {
                this.updateDemoAI();
            } else {
                this.handleInput();
            }

            this._playerTimer += deltaMS;
            if (this._playerTimer >= this.playerStepDelay()) {
                this._playerTimer = 0;
                this.stepPlayer();
                this._chompFlip = !this._chompFlip;
            }

            this._ghostTimer += deltaMS;
            if (this._ghostTimer >= this.ghostStepDelay()) {
                this._ghostTimer = 0;
                this.stepGhosts();
            }

            // Checked after both moves so a head-on swap still counts as a touch.
            this.checkGhostContact();

            if (!this.hasPelletsLeft()) {
                this.nextLevel();
            }

            this.updateDisplay();
        }

        handleInput() {
            const input = ArcadeManager.getInput();
            if (input.up) this._player.nextDir = { x: 0, y: -1 };
            else if (input.down) this._player.nextDir = { x: 0, y: 1 };
            else if (input.left) this._player.nextDir = { x: -1, y: 0 };
            else if (input.right) this._player.nextDir = { x: 1, y: 0 };
        }

        updateDemoAI() {
            // Head for the closest pellet, avoiding hunters unless they are edible.
            const p = this._player;
            let best = null;
            let bestScore = -Infinity;
            for (const d of DIRS) {
                const nx = this.wrapX(p.x + d.x);
                const ny = p.y + d.y;
                if (this.isWall(nx, ny)) continue;

                let score = 0;
                const tile = this._maze[ny][nx];
                if (tile === '.') score += 4;
                if (tile === 'O') score += 12;
                if (d.x === p.dir.x && d.y === p.dir.y) score += 1;

                for (const g of this._ghosts) {
                    const dist = Math.abs(g.x - nx) + Math.abs(g.y - ny);
                    if (this._frightTimer > 0) score += Math.max(0, 8 - dist);
                    else if (dist < 4) score -= (6 - dist) * 6;
                }
                score += Math.random() * 2;

                if (score > bestScore) {
                    bestScore = score;
                    best = d;
                }
            }
            if (best) this._player.nextDir = best;
        }

        stepPlayer() {
            const p = this._player;
            const wanted = p.nextDir;
            if (wanted.x !== 0 || wanted.y !== 0) {
                if (!this.isWall(p.x + wanted.x, p.y + wanted.y)) {
                    p.dir = { x: wanted.x, y: wanted.y };
                }
            }
            if (p.dir.x === 0 && p.dir.y === 0) return;
            if (this.isWall(p.x + p.dir.x, p.y + p.dir.y)) return;

            p.x = this.wrapX(p.x + p.dir.x);
            p.y += p.dir.y;

            const tile = this._maze[p.y][p.x];
            if (tile === '.') {
                this._maze[p.y][p.x] = ' ';
                this._score += 10;
                if (!this._isDemo) {
                    safePlaySe({ name: 'Eat', volume: 35, pitch: 150, pan: 0 });
                }
            } else if (tile === 'O') {
                this._maze[p.y][p.x] = ' ';
                this._score += 50;
                this._frightTimer = Math.max(2000, FRIGHT_DURATION - this._level * 300);
                this._ghostCombo = 0;
                if (!this._isDemo) {
                    safePlaySe({ name: 'Powerup', volume: 65, pitch: 110, pan: 0 });
                }
            }
        }

        stepGhosts() {
            for (const ghost of this._ghosts) {
                const target = this.ghostTarget(ghost);
                const options = [];
                for (const d of DIRS) {
                    // No reversing on the spot, exactly like the cabinet original.
                    if (d.x === -ghost.dir.x && d.y === -ghost.dir.y) continue;
                    const nx = this.wrapX(ghost.x + d.x);
                    const ny = ghost.y + d.y;
                    if (this.isWall(nx, ny)) continue;
                    options.push({ d: d, x: nx, y: ny });
                }
                if (options.length === 0) {
                    ghost.dir = { x: -ghost.dir.x, y: -ghost.dir.y };
                    continue;
                }

                let pick = options[0];
                if (ghost.mode === 'random' && Math.random() < 0.5) {
                    pick = options[Math.floor(Math.random() * options.length)];
                } else {
                    let bestDist = Infinity;
                    for (const opt of options) {
                        const dist = Math.abs(opt.x - target.x) + Math.abs(opt.y - target.y);
                        // Frightened hunters run for the far corners instead.
                        const value = this._frightTimer > 0 ? -dist : dist;
                        if (value < bestDist) {
                            bestDist = value;
                            pick = opt;
                        }
                    }
                }

                ghost.dir = pick.d;
                ghost.x = pick.x;
                ghost.y = pick.y;
            }
        }

        ghostTarget(ghost) {
            const p = this._player;
            if (ghost.mode === 'ambush') {
                // Four tiles ahead of Manpac, clamped into the maze.
                return {
                    x: this.wrapX(p.x + p.dir.x * 4),
                    y: Math.max(0, Math.min(GRID_HEIGHT - 1, p.y + p.dir.y * 4))
                };
            }
            return { x: p.x, y: p.y };
        }

        checkGhostContact() {
            for (const ghost of this._ghosts) {
                if (ghost.x !== this._player.x || ghost.y !== this._player.y) continue;

                if (this._frightTimer > 0) {
                    this._ghostCombo++;
                    this._score += 200 * this._ghostCombo;
                    ghost.x = ghost.startX;
                    ghost.y = ghost.startY;
                    ghost.dir = { x: 0, y: -1 };
                    if (!this._isDemo) {
                        safePlaySe({ name: 'Absorb1', volume: 70, pitch: 130, pan: 0 });
                    }
                } else {
                    this.loseLife();
                    return;
                }
            }
        }

        loseLife() {
            this._lives--;
            if (!this._isDemo) {
                safePlaySe({ name: 'Damage2', volume: 80, pitch: 80, pan: 0 });
            }

            if (this._lives <= 0) {
                this.gameOver();
            } else {
                this.resetActors();
            }
        }

        nextLevel() {
            this._level++;
            this._score += 1000;
            this.loadMaze();
            this.resetActors();

            if (!this._isDemo) {
                safePlaySe({ name: 'Item1', volume: 70, pitch: 120, pan: 0 });
            }
        }

        gameOver() {
            // Two fatal events can land in one frame (a second hit, the
            // field reaching the bottom): the run ends once, or a second
            // timer orphans the first and the score screen is pushed twice.
            if (this._endTimeout) return;
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

        playerChar() {
            const dir = this._player.dir;
            if (this._chompFlip) return 'O';
            if (dir.x < 0) return '}';
            if (dir.x > 0) return '{';
            if (dir.y < 0) return 'V';
            if (dir.y > 0) return 'A';
            return 'C';
        }

        drawGrid() {
            let buf = this._gridBuffer;
            if (!buf) {
                buf = this._gridBuffer = [];
                for (let y = 0; y < GRID_HEIGHT; y++) {
                    const row = [];
                    for (let x = 0; x < GRID_WIDTH; x++) row.push({ char: ' ', color: '#ffffff' });
                    buf.push(row);
                }
            }

            // Maze
            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const b = buf[y][x];
                    const tile = this._maze[y][x];
                    if (tile === '#') {
                        b.char = '#';
                        b.color = '#3355FF';
                    } else if (tile === '.') {
                        b.char = '.';
                        b.color = '#FFCC88';
                    } else if (tile === 'O') {
                        b.char = 'O';
                        b.color = '#FFFFFF';
                    } else {
                        b.char = ' ';
                        b.color = '#ffffff';
                    }
                }
            }

            // Ghosts: flashing white when the power pill is about to run out.
            for (const ghost of this._ghosts) {
                const b = buf[ghost.y][ghost.x];
                if (this._frightTimer > 0) {
                    const blink = this._frightTimer < 1500 && Math.floor(this._frightTimer / 200) % 2 === 0;
                    b.char = 'w';
                    b.color = blink ? '#FFFFFF' : '#4444FF';
                } else {
                    b.char = ghost.char;
                    b.color = ghost.color;
                }
            }

            // Manpac
            const pb = buf[this._player.y][this._player.x];
            pb.char = this.playerChar();
            pb.color = '#FFD700';

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

    const manpacGame = new ManpacGame();

    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, manpacGame);
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
})();
