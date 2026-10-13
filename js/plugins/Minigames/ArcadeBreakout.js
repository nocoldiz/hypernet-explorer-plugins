/*:
 * @target MZ
 * @plugindesc ASCII Breakout Game Cart v1.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * ASCII Breakout Game Cart
 * ============================================================================
 *
 * Bounce the ball off your paddle and clear every brick in the wall.
 *
 * Controls:
 * - Left/Right Arrows or A/D to slide the paddle
 * - Action button (OK/Space) to launch the ball
 * - Catch falling capsules: W widens the paddle, S slows the ball,
 *   + grants an extra life
 *
 * This cart must be loaded AFTER the ArcadeCabinetManager plugin.
 *
 */

(() => {
    'use strict';

    const cartId = 'AsciiBreakout';
    const cartName = 'ASCII BREAKOUT';

    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 16;
    const CELL_SIZE = 24;
    const TICK_SPEED = 1000 / 60;

    const PADDLE_ROW = GRID_HEIGHT - 1;
    const BRICK_TOP_ROW = 2;
    const BRICK_ROWS = 4;
    const PADDLE_SPEED = 14;   // cells per second
    const CAPSULE_SPEED = 4;   // cells per second
    const CAPSULE_CHANCE = 0.12;

    const BRICK_COLORS = ['#FF4444', '#FFAA00', '#44FF44', '#44AAFF'];

    // Play an SE without ever letting a missing/bad file bubble an exception.
    function safePlaySe(se) {
        try {
            AudioManager.playSe(se);
        } catch (e) {
            /* missing audio must not break the game */
        }
    }

    class BreakoutGame {
        constructor() {
            this._container = null;
            this._gridCells = [];
            this._gameActive = false;
            this._isDemo = false;

            this._score = 0;
            this._lives = 3;
            this._level = 1;

            this._paddleX = GRID_WIDTH / 2;
            this._paddleWidth = 3;
            this._wideTimer = 0;
            this._ball = null;
            this._ballSprite = null;
            this._ballHeld = true;
            this._bricks = [];
            this._capsules = [];

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

            this._gridOriginX = startX;
            this._gridOriginY = startY;
            this.createBallSprite(font);
        }

        // The ball used to be an 'o' glyph snapped to a cell: the hole in the
        // middle of the letter strobed black/white as it jumped from tile to
        // tile. A filled disc drawn at the ball's real position keeps the same
        // size without the flicker.
        createBallSprite(font) {
            const probe = new PIXI.Text('o', {
                fontFamily: font,
                fontSize: 20,
                fill: '#ffffff'
            });
            this._glyphWidth = probe.width;
            this._glyphHeight = probe.height;
            probe.destroy();

            const radius = Math.max(3, Math.min(this._glyphWidth, this._glyphHeight) * 0.38);
            this._ballSprite = new PIXI.Graphics();
            this._ballSprite.beginFill(0xE8E8E8);
            this._ballSprite.drawCircle(0, 0, radius);
            this._ballSprite.endFill();
            this._container.addChild(this._ballSprite);
        }

        resetGame() {
            this._score = 0;
            this._lives = 3;
            this._level = 1;
            this._paddleWidth = 3;
            this._wideTimer = 0;
            this._capsules = [];
            this.spawnBricks();
            this.resetBall();
            this.updateDisplay();
        }

        spawnBricks() {
            this._bricks = [];
            for (let row = 0; row < BRICK_ROWS; row++) {
                for (let x = 1; x < GRID_WIDTH - 1; x++) {
                    this._bricks.push({
                        x: x,
                        y: BRICK_TOP_ROW + row,
                        // Higher rows are worth more and take two hits.
                        hp: row < 2 ? 2 : 1,
                        points: (BRICK_ROWS - row) * 10,
                        color: BRICK_COLORS[row % BRICK_COLORS.length]
                    });
                }
            }
        }

        resetBall() {
            this._paddleX = GRID_WIDTH / 2;
            this._ballHeld = true;
            this._ball = {
                x: this._paddleX,
                y: PADDLE_ROW - 1,
                vx: 0,
                vy: 0
            };
        }

        launchBall() {
            if (!this._ballHeld) return;
            const speed = this.ballSpeed();
            const dir = Math.random() < 0.5 ? -1 : 1;
            this._ball.vx = dir * speed * 0.6;
            this._ball.vy = -speed;
            this._ballHeld = false;

            if (!this._isDemo) {
                safePlaySe({ name: 'Jump1', volume: 60, pitch: 130, pan: 0 });
            }
        }

        ballSpeed() {
            // Ramps with the level but stays inside the substepped collision budget.
            return Math.min(13, 7 + this._level * 0.6);
        }

        brickAt(x, y) {
            for (let i = 0; i < this._bricks.length; i++) {
                const b = this._bricks[i];
                if (b.x === x && b.y === y) return i;
            }
            return -1;
        }

        update(delta) {
            if (!this._gameActive) return;

            const deltaMS = (Graphics.app && Graphics.app.ticker && Graphics.app.ticker.deltaMS)
                ? Graphics.app.ticker.deltaMS
                : delta * TICK_SPEED;
            const dt = Math.min(deltaMS, 50) / 1000; // clamp so a hitch cannot tunnel the ball

            if (this._wideTimer > 0) {
                this._wideTimer -= deltaMS;
                if (this._wideTimer <= 0) {
                    this._paddleWidth = 3;
                }
            }

            if (this._isDemo) {
                this.updateDemoAI(dt);
            } else {
                this.handleInput(dt);
            }

            if (this._ballHeld) {
                this._ball.x = this._paddleX;
                this._ball.y = PADDLE_ROW - 1;
            } else {
                this.moveBall(dt);
            }

            this.updateCapsules(dt);

            if (this._bricks.length === 0) {
                this.nextLevel();
            }

            this.updateDisplay();
        }

        handleInput(dt) {
            const input = ArcadeManager.getInput();
            if (input.left) this.movePaddle(-PADDLE_SPEED * dt);
            if (input.right) this.movePaddle(PADDLE_SPEED * dt);
            if (input.action) this.launchBall();
        }

        updateDemoAI(dt) {
            // Track the ball, but only once it is coming back down.
            const target = this._ball.vy > 0 || this._ballHeld
                ? this._ball.x
                : GRID_WIDTH / 2;
            const diff = target - this._paddleX;
            if (Math.abs(diff) > 0.2) {
                this.movePaddle(Math.sign(diff) * PADDLE_SPEED * 0.85 * dt);
            }
            if (this._ballHeld) this.launchBall();
        }

        movePaddle(amount) {
            const half = (this._paddleWidth - 1) / 2;
            this._paddleX = Math.max(half, Math.min(GRID_WIDTH - 1 - half, this._paddleX + amount));
        }

        moveBall(dt) {
            const ball = this._ball;
            const distance = Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * dt;
            const steps = Math.max(1, Math.ceil(distance / 0.4));
            const sub = dt / steps;

            for (let s = 0; s < steps; s++) {
                // Horizontal
                const nx = ball.x + ball.vx * sub;
                const cy = Math.round(ball.y);
                if (nx < 0 || nx > GRID_WIDTH - 1) {
                    ball.vx = -ball.vx;
                    this.playWallBounce();
                } else {
                    const hit = this.brickAt(Math.round(nx), cy);
                    if (hit >= 0) {
                        ball.vx = -ball.vx;
                        this.hitBrick(hit);
                    } else {
                        ball.x = nx;
                    }
                }

                // Vertical
                const ny = ball.y + ball.vy * sub;
                const cx = Math.round(ball.x);
                if (ny < 0) {
                    ball.vy = -ball.vy;
                    this.playWallBounce();
                    continue;
                }

                const hit = this.brickAt(cx, Math.round(ny));
                if (hit >= 0) {
                    ball.vy = -ball.vy;
                    this.hitBrick(hit);
                    continue;
                }

                if (ball.vy > 0 && ny >= PADDLE_ROW - 0.5 && this.paddleCovers(cx)) {
                    this.bounceOffPaddle();
                    continue;
                }

                if (ny > GRID_HEIGHT - 1) {
                    this.loseLife();
                    return;
                }

                ball.y = ny;
            }
        }

        paddleCovers(x) {
            const half = (this._paddleWidth - 1) / 2;
            return x >= Math.round(this._paddleX - half) && x <= Math.round(this._paddleX + half);
        }

        bounceOffPaddle() {
            const ball = this._ball;
            const half = (this._paddleWidth - 1) / 2 + 0.5;
            // Offset from the paddle centre sets the outgoing angle, so the player
            // can aim by catching the ball on the edge of the bat.
            const offset = Math.max(-1, Math.min(1, (ball.x - this._paddleX) / half));
            const speed = this.ballSpeed();
            ball.vy = -Math.abs(speed);
            ball.vx = offset * speed * 0.9;
            ball.y = PADDLE_ROW - 1;

            if (!this._isDemo) {
                safePlaySe({ name: 'Blow2', volume: 55, pitch: 150, pan: 0 });
            }
        }

        playWallBounce() {
            if (!this._isDemo) {
                safePlaySe({ name: 'Push', volume: 40, pitch: 150, pan: 0 });
            }
        }

        hitBrick(index) {
            const brick = this._bricks[index];
            brick.hp--;
            if (brick.hp > 0) {
                if (!this._isDemo) {
                    safePlaySe({ name: 'Blow1', volume: 45, pitch: 170, pan: 0 });
                }
                return;
            }

            this._score += brick.points;
            this._bricks.splice(index, 1);

            if (Math.random() < CAPSULE_CHANCE) {
                this.spawnCapsule(brick.x, brick.y);
            }

            if (!this._isDemo) {
                safePlaySe({ name: 'Break', volume: 55, pitch: 130, pan: 0 });
            }
        }

        spawnCapsule(x, y) {
            const roll = Math.random();
            const kind = roll < 0.45 ? 'W' : (roll < 0.85 ? 'S' : '+');
            this._capsules.push({ x: x, y: y, kind: kind });
        }

        updateCapsules(dt) {
            for (let i = this._capsules.length - 1; i >= 0; i--) {
                const cap = this._capsules[i];
                cap.y += CAPSULE_SPEED * dt;
                if (cap.y > GRID_HEIGHT - 1) {
                    this._capsules.splice(i, 1);
                    continue;
                }
                if (Math.round(cap.y) === PADDLE_ROW && this.paddleCovers(cap.x)) {
                    this.collectCapsule(cap);
                    this._capsules.splice(i, 1);
                }
            }
        }

        collectCapsule(cap) {
            this._score += 25;
            switch (cap.kind) {
                case 'W':
                    this._paddleWidth = 5;
                    this._wideTimer = 12000;
                    break;
                case 'S':
                    // Slows the current flight only: the next paddle bounce puts
                    // the ball back to the level's speed.
                    this._ball.vx *= 0.7;
                    this._ball.vy *= 0.7;
                    break;
                case '+':
                    this._lives++;
                    break;
            }

            if (!this._isDemo) {
                safePlaySe({ name: 'Powerup', volume: 65, pitch: 110, pan: 0 });
            }
        }

        loseLife() {
            this._lives--;
            this._capsules = [];
            this._paddleWidth = 3;
            this._wideTimer = 0;

            if (!this._isDemo) {
                safePlaySe({ name: 'Damage2', volume: 80, pitch: 90, pan: 0 });
            }

            if (this._lives <= 0) {
                this.gameOver();
            } else {
                this.resetBall();
            }
        }

        nextLevel() {
            this._level++;
            this._score += 500;
            this._capsules = [];
            this.spawnBricks();
            this.resetBall();

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
            const inBounds = (x, y) => x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;

            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const b = buf[y][x];
                    b.char = ' ';
                    b.color = '#ffffff';
                }
            }

            // Side walls
            for (let y = 0; y < GRID_HEIGHT - 1; y++) {
                buf[y][0].char = '|';
                buf[y][0].color = '#555555';
                buf[y][GRID_WIDTH - 1].char = '|';
                buf[y][GRID_WIDTH - 1].color = '#555555';
            }
            for (let x = 0; x < GRID_WIDTH; x++) {
                buf[0][x].char = '-';
                buf[0][x].color = '#555555';
            }

            // Bricks
            for (const brick of this._bricks) {
                if (!inBounds(brick.x, brick.y)) continue;
                const b = buf[brick.y][brick.x];
                b.char = brick.hp > 1 ? '#' : '=';
                b.color = brick.color;
            }

            // Capsules
            for (const cap of this._capsules) {
                const x = Math.round(cap.x), y = Math.round(cap.y);
                if (!inBounds(x, y)) continue;
                const b = buf[y][x];
                b.char = cap.kind;
                b.color = '#FFFF00';
            }

            // Paddle
            const half = (this._paddleWidth - 1) / 2;
            for (let x = Math.round(this._paddleX - half); x <= Math.round(this._paddleX + half); x++) {
                if (!inBounds(x, PADDLE_ROW)) continue;
                const b = buf[PADDLE_ROW][x];
                b.char = '=';
                b.color = '#00FF00';
            }

            this.drawBall();

            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < GRID_WIDTH; x++) {
                    const cell = this._gridCells[y][x];
                    const b = buf[y][x];
                    cell.text = b.char;
                    cell.style.fill = b.color;
                }
            }
        }

        drawBall() {
            const sprite = this._ballSprite;
            if (!sprite || !this._ball) return;
            sprite.visible = this._ball.x >= 0 && this._ball.x <= GRID_WIDTH - 1 &&
                this._ball.y >= 0 && this._ball.y <= GRID_HEIGHT - 1;
            if (!sprite.visible) return;
            // Follow the ball's continuous position so it glides instead of
            // snapping a whole cell at a time.
            sprite.position.set(
                this._gridOriginX + this._ball.x * CELL_SIZE + this._glyphWidth / 2,
                this._gridOriginY + this._ball.y * CELL_SIZE + this._glyphHeight / 2
            );
        }
    }

    const breakoutGame = new BreakoutGame();

    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, breakoutGame);
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
})();
