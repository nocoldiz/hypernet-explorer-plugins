/*:
 * @target MZ
 * @plugindesc ASCII Centipede Game Cart v1.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * ASCII Centipede Game Cart
 * ============================================================================
 *
 * A centipede winds down through a mushroom patch toward your blaster.
 * Shooting a middle segment splits the chain in two and drops a mushroom
 * where the segment died. Clear every segment to advance.
 *
 * Controls:
 * - Arrows or WASD to move inside the bottom band
 * - Action button (OK/Space) to fire
 * - Watch for the spider: it eats mushrooms and kills on contact
 *
 * This cart must be loaded AFTER the ArcadeCabinetManager plugin.
 *
 */

(() => {
    'use strict';

    const cartId = 'AsciiCentipede';
    const cartName = 'ASCII CENTIPEDE';

    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 16;
    const CELL_SIZE = 24;
    const TICK_SPEED = 1000 / 60;

    const PLAYER_BAND_TOP = GRID_HEIGHT - 4; // rows the blaster may occupy
    const MUSHROOM_HP = 4;
    const PLAYER_MOVE_DELAY = 110;
    const SHOOT_DELAY = 220;
    const BULLET_DELAY = 40; // ms per cell travelled
    const SPIDER_DELAY = 260;

    // Play an SE without ever letting a missing/bad file bubble an exception.
    function safePlaySe(se) {
        try {
            AudioManager.playSe(se);
        } catch (e) {
            /* missing audio must not break the game */
        }
    }

    class CentipedeGame {
        constructor() {
            this._container = null;
            this._gridCells = [];
            this._gameActive = false;
            this._isDemo = false;

            this._score = 0;
            this._lives = 3;
            this._level = 1;

            this._playerX = Math.floor(GRID_WIDTH / 2);
            this._playerY = GRID_HEIGHT - 1;
            this._bullets = [];
            this._mushrooms = [];
            this._segments = [];
            this._spider = null;

            this._playerMoveCooldown = 0;
            this._playerShootCooldown = 0;
            this._bulletTimer = 0;
            this._segmentTimer = 0;
            this._spiderTimer = 0;
            this._spiderSpawnTimer = 0;

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
            this.spawnMushrooms();
            this.spawnCentipede();
            this.resetPlayer();
            this.updateDisplay();
        }

        resetPlayer() {
            this._playerX = Math.floor(GRID_WIDTH / 2);
            this._playerY = GRID_HEIGHT - 1;
            this._bullets = [];
            this._spider = null;
            this._spiderSpawnTimer = 0;
        }

        spawnMushrooms() {
            this._mushrooms = [];
            const count = 18 + this._level * 2;
            for (let i = 0; i < count; i++) {
                const x = Math.floor(Math.random() * GRID_WIDTH);
                // Leave the top row clear for the centipede entrance and the
                // very bottom row clear so the blaster is never buried.
                const y = 1 + Math.floor(Math.random() * (GRID_HEIGHT - 3));
                if (this.mushroomIndexAt(x, y) >= 0) continue;
                this._mushrooms.push({ x: x, y: y, hp: MUSHROOM_HP });
            }
        }

        spawnCentipede() {
            this._segments = [];
            const length = Math.min(12, 6 + this._level);
            for (let i = 0; i < length; i++) {
                this._segments.push({
                    x: Math.max(0, Math.floor(GRID_WIDTH / 2) - i),
                    y: 0,
                    dir: 1,
                    descending: false,
                    head: i === 0
                });
            }
            this._segmentTimer = 0;
        }

        segmentDelay() {
            return Math.max(90, 260 - this._level * 15);
        }

        mushroomIndexAt(x, y) {
            for (let i = 0; i < this._mushrooms.length; i++) {
                const m = this._mushrooms[i];
                if (m.x === x && m.y === y) return i;
            }
            return -1;
        }

        segmentIndexAt(x, y) {
            for (let i = 0; i < this._segments.length; i++) {
                const s = this._segments[i];
                if (s.x === x && s.y === y) return i;
            }
            return -1;
        }

        update(delta) {
            if (!this._gameActive) return;

            const deltaMS = (Graphics.app && Graphics.app.ticker && Graphics.app.ticker.deltaMS)
                ? Graphics.app.ticker.deltaMS
                : delta * TICK_SPEED;

            if (this._playerMoveCooldown > 0) this._playerMoveCooldown -= deltaMS;
            if (this._playerShootCooldown > 0) this._playerShootCooldown -= deltaMS;

            if (this._isDemo) {
                this.updateDemoAI();
            } else {
                this.handleInput();
            }

            this._bulletTimer += deltaMS;
            while (this._bulletTimer >= BULLET_DELAY) {
                this._bulletTimer -= BULLET_DELAY;
                this.updateBullets();
            }

            this._segmentTimer += deltaMS;
            if (this._segmentTimer >= this.segmentDelay()) {
                this._segmentTimer = 0;
                this.moveSegments();
            }

            this.updateSpider(deltaMS);
            this.checkCollisions();

            if (this._segments.length === 0) {
                this.nextLevel();
            }

            this.updateDisplay();
        }

        handleInput() {
            const input = ArcadeManager.getInput();
            if (this._playerMoveCooldown <= 0) {
                let moved = false;
                if (input.left && this._playerX > 0) {
                    this._playerX--;
                    moved = true;
                } else if (input.right && this._playerX < GRID_WIDTH - 1) {
                    this._playerX++;
                    moved = true;
                } else if (input.up && this._playerY > PLAYER_BAND_TOP) {
                    this._playerY--;
                    moved = true;
                } else if (input.down && this._playerY < GRID_HEIGHT - 1) {
                    this._playerY++;
                    moved = true;
                }
                if (moved) this._playerMoveCooldown = PLAYER_MOVE_DELAY;
            }

            if (input.action && this._playerShootCooldown <= 0) {
                this.fire();
            }
        }

        updateDemoAI() {
            if (this._playerMoveCooldown <= 0) {
                // Line up under the lowest segment, then back off if it is close.
                let target = this._playerX;
                let lowest = -1;
                for (const seg of this._segments) {
                    if (seg.y > lowest) {
                        lowest = seg.y;
                        target = seg.x;
                    }
                }
                if (this._spider && Math.abs(this._spider.x - this._playerX) < 3) {
                    target = this._spider.x > this._playerX ? this._playerX - 3 : this._playerX + 3;
                }
                if (target < this._playerX && this._playerX > 0) this._playerX--;
                else if (target > this._playerX && this._playerX < GRID_WIDTH - 1) this._playerX++;
                this._playerMoveCooldown = PLAYER_MOVE_DELAY;
            }

            if (this._playerShootCooldown <= 0 && Math.random() < 0.6) {
                this.fire();
            }
        }

        fire() {
            this._bullets.push({ x: this._playerX, y: this._playerY - 1 });
            this._playerShootCooldown = SHOOT_DELAY;

            if (!this._isDemo) {
                safePlaySe({ name: 'Gun1', volume: 55, pitch: 140, pan: 0 });
            }
        }

        updateBullets() {
            for (let i = this._bullets.length - 1; i >= 0; i--) {
                const bullet = this._bullets[i];
                bullet.y--;
                if (bullet.y < 0) {
                    this._bullets.splice(i, 1);
                    continue;
                }

                const segIndex = this.segmentIndexAt(bullet.x, bullet.y);
                if (segIndex >= 0) {
                    this._bullets.splice(i, 1);
                    this.killSegment(segIndex);
                    continue;
                }

                if (this._spider && this._spider.x === bullet.x && this._spider.y === bullet.y) {
                    this._bullets.splice(i, 1);
                    this._score += 300;
                    this._spider = null;
                    if (!this._isDemo) {
                        safePlaySe({ name: 'Explosion1', volume: 60, pitch: 160, pan: 0 });
                    }
                    continue;
                }

                const mushIndex = this.mushroomIndexAt(bullet.x, bullet.y);
                if (mushIndex >= 0) {
                    this._bullets.splice(i, 1);
                    const mushroom = this._mushrooms[mushIndex];
                    mushroom.hp--;
                    if (mushroom.hp <= 0) {
                        this._mushrooms.splice(mushIndex, 1);
                        this._score += 5;
                    }
                    if (!this._isDemo) {
                        safePlaySe({ name: 'Blow1', volume: 40, pitch: 170, pan: 0 });
                    }
                }
            }
        }

        killSegment(index) {
            const seg = this._segments[index];
            this._score += seg.head ? 100 : 10;

            // The corpse becomes a mushroom, and whatever followed it becomes a
            // new head: that is what splits the chain in two.
            if (this.mushroomIndexAt(seg.x, seg.y) < 0) {
                this._mushrooms.push({ x: seg.x, y: seg.y, hp: MUSHROOM_HP });
            }
            this._segments.splice(index, 1);
            if (this._segments[index]) {
                this._segments[index].head = true;
            }

            if (!this._isDemo) {
                safePlaySe({ name: 'Explosion1', volume: 50, pitch: 150, pan: 0 });
            }
        }

        moveSegments() {
            for (const seg of this._segments) {
                if (seg.descending) {
                    seg.y++;
                    seg.descending = false;
                    if (seg.y >= GRID_HEIGHT) {
                        // Reached the floor: turn around and climb back up.
                        seg.y = GRID_HEIGHT - 1;
                        seg.dir = -seg.dir;
                    }
                    continue;
                }

                const nx = seg.x + seg.dir;
                const blocked = nx < 0 || nx >= GRID_WIDTH || this.mushroomIndexAt(nx, seg.y) >= 0;
                if (blocked) {
                    seg.dir = -seg.dir;
                    seg.descending = true;
                } else {
                    seg.x = nx;
                }
            }
        }

        updateSpider(deltaMS) {
            if (!this._spider) {
                this._spiderSpawnTimer += deltaMS;
                // One spider at a time, arriving sooner on later levels.
                if (this._spiderSpawnTimer >= Math.max(4000, 12000 - this._level * 800)) {
                    this._spiderSpawnTimer = 0;
                    const fromLeft = Math.random() < 0.5;
                    this._spider = {
                        x: fromLeft ? 0 : GRID_WIDTH - 1,
                        y: PLAYER_BAND_TOP,
                        dx: fromLeft ? 1 : -1,
                        dy: 1
                    };
                }
                return;
            }

            this._spiderTimer += deltaMS;
            if (this._spiderTimer < SPIDER_DELAY) return;
            this._spiderTimer = 0;

            const spider = this._spider;
            spider.x += spider.dx;
            spider.y += spider.dy;
            if (spider.y < PLAYER_BAND_TOP || spider.y > GRID_HEIGHT - 1) {
                spider.dy = -spider.dy;
                spider.y = Math.max(PLAYER_BAND_TOP, Math.min(GRID_HEIGHT - 1, spider.y));
            }
            if (spider.x < 0 || spider.x >= GRID_WIDTH) {
                this._spider = null;
                return;
            }

            // Spiders clear the patch as they go, which is how the board recovers.
            const mushIndex = this.mushroomIndexAt(spider.x, spider.y);
            if (mushIndex >= 0) this._mushrooms.splice(mushIndex, 1);
        }

        checkCollisions() {
            for (const seg of this._segments) {
                if (seg.x === this._playerX && seg.y === this._playerY) {
                    this.loseLife();
                    return;
                }
            }
            if (this._spider && this._spider.x === this._playerX && this._spider.y === this._playerY) {
                this.loseLife();
            }
        }

        loseLife() {
            this._lives--;
            if (!this._isDemo) {
                safePlaySe({ name: 'Damage2', volume: 80, pitch: 85, pan: 0 });
            }

            if (this._lives <= 0) {
                this.gameOver();
            } else {
                // A death resets the wave but keeps the mushroom patch, as on the
                // real cabinet.
                this.spawnCentipede();
                this.resetPlayer();
            }
        }

        nextLevel() {
            this._level++;
            this._score += 600;
            this.spawnCentipede();
            this.resetPlayer();

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

            // Mushrooms fade as they take hits.
            for (const m of this._mushrooms) {
                if (!inBounds(m.x, m.y)) continue;
                const b = buf[m.y][m.x];
                b.char = m.hp >= 3 ? 'T' : (m.hp === 2 ? 'Y' : 'i');
                b.color = m.hp >= 3 ? '#00CC66' : (m.hp === 2 ? '#88AA33' : '#AA6633');
            }

            for (const seg of this._segments) {
                if (!inBounds(seg.x, seg.y)) continue;
                const b = buf[seg.y][seg.x];
                b.char = seg.head ? 'Q' : 'e';
                b.color = seg.head ? '#FF3333' : '#FF9933';
            }

            for (const bullet of this._bullets) {
                if (!inBounds(bullet.x, bullet.y)) continue;
                const b = buf[bullet.y][bullet.x];
                b.char = '|';
                b.color = '#FFFF66';
            }

            if (this._spider && inBounds(this._spider.x, this._spider.y)) {
                const b = buf[this._spider.y][this._spider.x];
                b.char = 'X';
                b.color = '#FF00FF';
            }

            if (inBounds(this._playerX, this._playerY)) {
                const b = buf[this._playerY][this._playerX];
                b.char = 'A';
                b.color = '#00FF00';
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

    const centipedeGame = new CentipedeGame();

    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, centipedeGame);
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
})();
