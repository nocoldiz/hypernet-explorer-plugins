/*:
 * @target MZ
 * @plugindesc ASCII Asteroids Game Cart v1.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * ASCII Asteroids Game Cart
 * ============================================================================
 *
 * Drift through a rock field and blast it apart. Big rocks split into
 * smaller, faster ones. Everything wraps around the edges of the screen.
 *
 * Controls:
 * - Left/Right Arrows or A/D to rotate the ship
 * - Up Arrow or W to thrust
 * - Down Arrow or S to brake
 * - Action button (OK/Space) to fire
 *
 * This cart must be loaded AFTER the ArcadeCabinetManager plugin.
 *
 */

(() => {
    'use strict';

    const cartId = 'AsciiAsteroids';
    const cartName = 'ASCII ASTEROIDS';

    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 16;
    const CELL_SIZE = 24;
    const TICK_SPEED = 1000 / 60;

    // Eight headings, clockwise from north, with the glyph drawn for each.
    const HEADINGS = [
        { x: 0, y: -1, char: '^' },
        { x: 1, y: -1, char: '/' },
        { x: 1, y: 0, char: '>' },
        { x: 1, y: 1, char: '\\' },
        { x: 0, y: 1, char: 'v' },
        { x: -1, y: 1, char: '/' },
        { x: -1, y: 0, char: '<' },
        { x: -1, y: -1, char: '\\' }
    ];

    const ROCK_SIZES = {
        3: { char: '@', points: 20, speed: 1.6, color: '#AAAAAA' },
        2: { char: 'O', points: 50, speed: 2.4, color: '#CCCCCC' },
        1: { char: 'o', points: 100, speed: 3.4, color: '#FFFFFF' }
    };

    const THRUST = 7;           // cells per second per second
    const DRAG = 0.85;          // velocity retained per second
    const MAX_SPEED = 7;
    const BULLET_SPEED = 11;
    const BULLET_LIFE = 900;    // ms
    const ROTATE_DELAY = 110;   // ms per 45 degree step
    const SHOOT_DELAY = 260;
    const RESPAWN_INVULN = 1800;

    // Play an SE without ever letting a missing/bad file bubble an exception.
    function safePlaySe(se) {
        try {
            AudioManager.playSe(se);
        } catch (e) {
            /* missing audio must not break the game */
        }
    }

    class AsteroidsGame {
        constructor() {
            this._container = null;
            this._gridCells = [];
            this._gameActive = false;
            this._isDemo = false;

            this._score = 0;
            this._lives = 3;
            this._level = 1;

            this._ship = null;
            this._rocks = [];
            this._bullets = [];
            this._rotateCooldown = 0;
            this._shootCooldown = 0;
            this._invulnTimer = 0;
            this._thrusting = false;

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
            this._bullets = [];
            this.resetShip();
            this.spawnRocks();
            this.updateDisplay();
        }

        resetShip() {
            this._ship = {
                x: GRID_WIDTH / 2,
                y: GRID_HEIGHT / 2,
                vx: 0,
                vy: 0,
                heading: 0
            };
            this._invulnTimer = RESPAWN_INVULN;
            this._rotateCooldown = 0;
            this._shootCooldown = 0;
        }

        spawnRocks() {
            this._rocks = [];
            const count = Math.min(9, 3 + this._level);
            for (let i = 0; i < count; i++) {
                this._rocks.push(this.makeRock(3, this.edgeSpawn()));
            }
        }

        // Rocks always enter from the rim so they never materialise on the ship.
        edgeSpawn() {
            const onVertical = Math.random() < 0.5;
            if (onVertical) {
                return {
                    x: Math.random() < 0.5 ? 0 : GRID_WIDTH - 1,
                    y: Math.random() * (GRID_HEIGHT - 1)
                };
            }
            return {
                x: Math.random() * (GRID_WIDTH - 1),
                y: Math.random() < 0.5 ? 0 : GRID_HEIGHT - 1
            };
        }

        makeRock(size, pos) {
            const spec = ROCK_SIZES[size];
            const angle = Math.random() * Math.PI * 2;
            const speed = spec.speed * (0.7 + Math.random() * 0.6) * (1 + this._level * 0.05);
            return {
                x: pos.x,
                y: pos.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: size
            };
        }

        wrap(value, max) {
            let v = value % max;
            if (v < 0) v += max;
            return v;
        }

        update(delta) {
            if (!this._gameActive) return;

            const deltaMS = (Graphics.app && Graphics.app.ticker && Graphics.app.ticker.deltaMS)
                ? Graphics.app.ticker.deltaMS
                : delta * TICK_SPEED;
            const dt = Math.min(deltaMS, 50) / 1000;

            if (this._rotateCooldown > 0) this._rotateCooldown -= deltaMS;
            if (this._shootCooldown > 0) this._shootCooldown -= deltaMS;
            if (this._invulnTimer > 0) this._invulnTimer -= deltaMS;

            this._thrusting = false;
            if (this._isDemo) {
                this.updateDemoAI(dt);
            } else {
                this.handleInput(dt);
            }

            this.updateShip(dt);
            this.updateRocks(dt);
            this.updateBullets(dt, deltaMS);
            this.checkCollisions();

            if (this._rocks.length === 0) {
                this.nextLevel();
            }

            this.updateDisplay();
        }

        handleInput(dt) {
            const input = ArcadeManager.getInput();
            if (this._rotateCooldown <= 0) {
                if (input.left) {
                    this.rotate(-1);
                } else if (input.right) {
                    this.rotate(1);
                }
            }
            if (input.up) this.thrust(1, dt);
            if (input.down) this.thrust(-0.5, dt);
            if (input.action && this._shootCooldown <= 0) this.fire();
        }

        updateDemoAI(dt) {
            const nearest = this.nearestRock();
            if (!nearest) return;

            const want = this.headingTowards(nearest.dx, nearest.dy);
            if (want !== this._ship.heading && this._rotateCooldown <= 0) {
                // Turn the short way round the eight-point compass.
                let diff = (want - this._ship.heading + 8) % 8;
                this.rotate(diff <= 4 ? 1 : -1);
            } else if (this._shootCooldown <= 0) {
                this.fire();
            }

            // Nudge away from anything sitting on top of us.
            if (nearest.dist < 3 && Math.random() < 0.25) this.thrust(1, dt);
        }

        nearestRock() {
            let best = null;
            for (const rock of this._rocks) {
                const dx = this.shortestDelta(rock.x - this._ship.x, GRID_WIDTH);
                const dy = this.shortestDelta(rock.y - this._ship.y, GRID_HEIGHT);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (!best || dist < best.dist) best = { dx: dx, dy: dy, dist: dist, rock: rock };
            }
            return best;
        }

        // Wrapped space: the shorter of "straight there" and "around the edge".
        shortestDelta(d, span) {
            if (d > span / 2) return d - span;
            if (d < -span / 2) return d + span;
            return d;
        }

        headingTowards(dx, dy) {
            let best = 0;
            let bestDot = -Infinity;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            for (let i = 0; i < HEADINGS.length; i++) {
                const h = HEADINGS[i];
                const hlen = Math.sqrt(h.x * h.x + h.y * h.y);
                const dot = (h.x * dx + h.y * dy) / (hlen * len);
                if (dot > bestDot) {
                    bestDot = dot;
                    best = i;
                }
            }
            return best;
        }

        rotate(step) {
            this._ship.heading = (this._ship.heading + step + HEADINGS.length) % HEADINGS.length;
            this._rotateCooldown = ROTATE_DELAY;
        }

        thrust(scale, dt) {
            const h = HEADINGS[this._ship.heading];
            const len = Math.sqrt(h.x * h.x + h.y * h.y) || 1;
            this._ship.vx += (h.x / len) * THRUST * scale * dt;
            this._ship.vy += (h.y / len) * THRUST * scale * dt;
            if (scale > 0) this._thrusting = true;
        }

        fire() {
            const h = HEADINGS[this._ship.heading];
            const len = Math.sqrt(h.x * h.x + h.y * h.y) || 1;
            this._bullets.push({
                x: this._ship.x + h.x / len,
                y: this._ship.y + h.y / len,
                vx: (h.x / len) * BULLET_SPEED,
                vy: (h.y / len) * BULLET_SPEED,
                life: BULLET_LIFE
            });
            this._shootCooldown = SHOOT_DELAY;

            if (!this._isDemo) {
                safePlaySe({ name: 'Shot1', volume: 55, pitch: 130, pan: 0 });
            }
        }

        updateShip(dt) {
            const ship = this._ship;
            const decay = Math.pow(DRAG, dt);
            ship.vx *= decay;
            ship.vy *= decay;

            const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
            if (speed > MAX_SPEED) {
                ship.vx = (ship.vx / speed) * MAX_SPEED;
                ship.vy = (ship.vy / speed) * MAX_SPEED;
            }

            ship.x = this.wrap(ship.x + ship.vx * dt, GRID_WIDTH);
            ship.y = this.wrap(ship.y + ship.vy * dt, GRID_HEIGHT);
        }

        updateRocks(dt) {
            for (const rock of this._rocks) {
                rock.x = this.wrap(rock.x + rock.vx * dt, GRID_WIDTH);
                rock.y = this.wrap(rock.y + rock.vy * dt, GRID_HEIGHT);
            }
        }

        updateBullets(dt, deltaMS) {
            for (let i = this._bullets.length - 1; i >= 0; i--) {
                const b = this._bullets[i];
                b.life -= deltaMS;
                if (b.life <= 0) {
                    this._bullets.splice(i, 1);
                    continue;
                }
                b.x = this.wrap(b.x + b.vx * dt, GRID_WIDTH);
                b.y = this.wrap(b.y + b.vy * dt, GRID_HEIGHT);
            }
        }

        sameCell(a, b) {
            return Math.round(a.x) % GRID_WIDTH === Math.round(b.x) % GRID_WIDTH
                && Math.round(a.y) % GRID_HEIGHT === Math.round(b.y) % GRID_HEIGHT;
        }

        checkCollisions() {
            for (let bIndex = this._bullets.length - 1; bIndex >= 0; bIndex--) {
                const bullet = this._bullets[bIndex];
                for (let rIndex = this._rocks.length - 1; rIndex >= 0; rIndex--) {
                    const rock = this._rocks[rIndex];
                    if (!this.sameCell(bullet, rock)) continue;

                    this._bullets.splice(bIndex, 1);
                    this.breakRock(rIndex);
                    break;
                }
            }

            if (this._invulnTimer > 0) return;

            for (const rock of this._rocks) {
                if (this.sameCell(rock, this._ship)) {
                    this.loseLife();
                    return;
                }
            }
        }

        breakRock(index) {
            const rock = this._rocks[index];
            const spec = ROCK_SIZES[rock.size];
            this._score += spec.points;
            this._rocks.splice(index, 1);

            if (rock.size > 1) {
                for (let i = 0; i < 2; i++) {
                    this._rocks.push(this.makeRock(rock.size - 1, { x: rock.x, y: rock.y }));
                }
            }

            if (!this._isDemo) {
                safePlaySe({ name: 'Explosion1', volume: 55, pitch: 110 + rock.size * 20, pan: 0 });
            }
        }

        loseLife() {
            this._lives--;
            this._bullets = [];

            if (!this._isDemo) {
                safePlaySe({ name: 'Explosion2', volume: 85, pitch: 80, pan: 0 });
            }

            if (this._lives <= 0) {
                this.gameOver();
            } else {
                // Clear the middle so the fresh ship is not shot down instantly.
                this._rocks = this._rocks.filter(rock => {
                    const dx = this.shortestDelta(rock.x - GRID_WIDTH / 2, GRID_WIDTH);
                    const dy = this.shortestDelta(rock.y - GRID_HEIGHT / 2, GRID_HEIGHT);
                    return Math.sqrt(dx * dx + dy * dy) > 3;
                });
                this.resetShip();
            }
        }

        nextLevel() {
            this._level++;
            this._score += 300;
            this._bullets = [];
            this.spawnRocks();
            this._invulnTimer = RESPAWN_INVULN;

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
            const put = (x, y, char, color) => {
                const cx = this.wrap(Math.round(x), GRID_WIDTH);
                const cy = this.wrap(Math.round(y), GRID_HEIGHT);
                const b = buf[cy][cx];
                b.char = char;
                b.color = color;
            };

            // Starfield: a fixed sprinkle so the field reads as space, not a void.
            if (!this._starfield) {
                this._starfield = [];
                for (let i = 0; i < 14; i++) {
                    this._starfield.push({
                        x: Math.floor(Math.random() * GRID_WIDTH),
                        y: Math.floor(Math.random() * GRID_HEIGHT)
                    });
                }
            }

            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const b = buf[y][x];
                    b.char = ' ';
                    b.color = '#ffffff';
                }
            }
            for (const star of this._starfield) put(star.x, star.y, '.', '#334455');

            for (const rock of this._rocks) {
                const spec = ROCK_SIZES[rock.size];
                put(rock.x, rock.y, spec.char, spec.color);
            }
            for (const bullet of this._bullets) put(bullet.x, bullet.y, '*', '#FFFF00');

            // Exhaust plume behind the ship while thrusting.
            if (this._thrusting) {
                const h = HEADINGS[this._ship.heading];
                put(this._ship.x - h.x, this._ship.y - h.y, ',', '#FF8800');
            }

            const blink = this._invulnTimer > 0 && Math.floor(this._invulnTimer / 120) % 2 === 0;
            if (!blink) {
                put(this._ship.x, this._ship.y, HEADINGS[this._ship.heading].char, '#00FF00');
            }

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

    const asteroidsGame = new AsteroidsGame();

    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, asteroidsGame);
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
})();
