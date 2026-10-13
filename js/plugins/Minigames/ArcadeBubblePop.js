/*:
 * @target MZ
 * @plugindesc Arcade Bubble Pop v1.3 | More Puzzle-Bobble-like: colored circles, proper bounce, sticking logic, cluster removal. Compatible with ArcadeCabinetManager API
 * @author OmniLex
 */

(() => {
  const cartId = 'ArcadeBubblePop';
  const cartName = 'ARCADE BUBBLE POP';

  const GRID_ROWS = 8;
  const GRID_COLS = 10;
  const CELL_SIZE = 32;
  const BUBBLE_RADIUS = 14; // Slightly less than half cell for spacing
  const SHOOT_SPEED = 6;
  const COLORS = ['#ff5555', '#55ff55', '#5555ff', '#ffdd55', '#55ffff', '#ff55ff']; // solid palette

  class ArcadeBubblePop {
    constructor() {
      this._container = null;
      this._isDemo = false;
      this._score = 0;
      this._state = 'ready'; // 'ready', 'firing', 'gameover', 'demo'
      this._grid = [];
      this._bubble = null;
      this._angle = 90;
      this._demoTimer = 0;

      // Display
      this._cellGraphics = []; // grid circles
      this._bubbleGraphic = null;
      this._angleGraphic = null;
      this._scoreText = null;
      this._gameOverText = null;
      this._ticker = null;
      this._header = null;
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
      // Grid model: null or color string
      this._grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          this._grid[y][x] = this.randomColor();
        }
      }
      this._score = 0;
      this._angle = 90;
      this._state = this._isDemo ? 'demo' : 'ready';
      this._gridDirty = true; // draw the initial grid once
      this.spawnBubble();

      // Display
      this.clearContainer();
      this.setupDisplay();

      // Ticker
      this.stop();
      this._ticker = new PIXI.Ticker();
      this._ticker.add(() => this.update());
      this._ticker.start();

      // Teardown fallback: if the container is removed without an explicit
      // stop() call, kill the private ticker so it stops drawing into
      // orphaned Graphics.
      if (this._container && this._container.on) {
        this._container.off('removed', this._onContainerRemoved, this);
        this._container.on('removed', this._onContainerRemoved, this);
      }
    }

    _onContainerRemoved() {
      this.stop();
    }

    // Manager teardown contract: stop the private ticker on game over or cancel-exit.
    stop() {
      if (this._ticker) {
        this._ticker.stop();
        this._ticker.destroy();
        this._ticker = null;
      }
    }

    clearContainer() {
      if (this._container) this._container.removeChildren();
    }

    setupDisplay() {
      // Header
      this._header = new PIXI.Text('BUBBLE POP', {
        fontFamily: ArcadeManager.getArcadeFont(),
        fontSize: 36,
        fill: '#ffff66',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 4
      });
      this._header.anchor.set(0.5);
      this._header.x = Graphics.width / 2;
      this._header.y = 30;
      this._container.addChild(this._header);

      // Score
      this._scoreText = new PIXI.Text('SCORE: 0', {
        fontFamily: ArcadeManager.getArcadeFont(),
        fontSize: 24,
        fill: '#ffffff',
        align: 'left'
      });
      this._scoreText.x = 10;
      this._scoreText.y = 10;
      this._container.addChild(this._scoreText);

      // Grid circles
      this._cellGraphics = [];
      const startX = (Graphics.width - GRID_COLS * CELL_SIZE) / 2;
      const startY = 80;
      for (let y = 0; y < GRID_ROWS; y++) {
        this._cellGraphics[y] = [];
        for (let x = 0; x < GRID_COLS; x++) {
          const g = new PIXI.Graphics();
          g.x = startX + x * CELL_SIZE + CELL_SIZE / 2;
          g.y = startY + y * CELL_SIZE + CELL_SIZE / 2;
          this._container.addChild(g);
          this._cellGraphics[y][x] = g;
        }
      }

      // Active bubble graphic
      this._bubbleGraphic = new PIXI.Graphics();
      this._container.addChild(this._bubbleGraphic);

      // Angle indicator
      this._angleGraphic = new PIXI.Graphics();
      this._container.addChild(this._angleGraphic);

      // Game Over
      this._gameOverText = new PIXI.Text(T('Arcade.hud.gameOver'), {
        fontFamily: ArcadeManager.getArcadeFont(),
        fontSize: 48,
        fill: '#ff4444',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 6
      });
      this._gameOverText.anchor.set(0.5);
      this._gameOverText.x = Graphics.width / 2;
      this._gameOverText.y = Graphics.height / 2;
      this._gameOverText.visible = false;
      this._container.addChild(this._gameOverText);
    }

    randomColor() {
      return COLORS[Math.floor(Math.random() * COLORS.length)];
    }

    spawnBubble() {
      this._bubble = {
        x: Graphics.width / 2,
        y: Graphics.height - 64,
        color: this.randomColor(),
        vx: 0,
        vy: 0
      };
      if (!this._isDemo) this._state = 'ready';
    }

    shootBubble() {
      const rad = (this._angle * Math.PI) / 180;
      this._bubble.vx = Math.cos(rad) * SHOOT_SPEED;
      this._bubble.vy = -Math.sin(rad) * SHOOT_SPEED;
      this._state = 'firing';
    }

    gridCellCenter(col, row) {
      const startX = (Graphics.width - GRID_COLS * CELL_SIZE) / 2;
      const startY = 80;
      return {
        x: startX + col * CELL_SIZE + CELL_SIZE / 2,
        y: startY + row * CELL_SIZE + CELL_SIZE / 2
      };
    }

    update() {
      if (!this._container) return;
      const input = ArcadeManager.getInput();

      if (!this._isDemo) {
        if (this._state === 'ready') {
          if (input.left) this._angle = Math.max(30, this._angle - 2);
          if (input.right) this._angle = Math.min(150, this._angle + 2);
          if (input.action) this.shootBubble();
        }
      }

      if (this._state === 'firing' || this._isDemo) {
        this._bubble.x += this._bubble.vx;
        this._bubble.y += this._bubble.vy;

        // Bounce on left/right with radius consideration
        if (this._bubble.x - BUBBLE_RADIUS <= 0) {
          this._bubble.x = BUBBLE_RADIUS;
          this._bubble.vx *= -1;
        }
        if (this._bubble.x + BUBBLE_RADIUS >= Graphics.width) {
          this._bubble.x = Graphics.width - BUBBLE_RADIUS;
          this._bubble.vx *= -1;
        }

        // Hit top
        if (this._bubble.y - BUBBLE_RADIUS <= 80) {
          this.placeAtTop();
        } else {
          // Collision with existing bubble
          const collision = this.findCollisionBubble();
          if (collision) {
            this.placeNear(collision.col, collision.row);
          }
        }

        if (this._isDemo) {
          this._demoTimer++;
          if (this._demoTimer > 60) {
            this._angle = 60 + Math.random() * 60;
            this.shootBubble();
            this._demoTimer = 0;
          }
        }
      }

      // After placement check
      if (this._state === 'placed') {
        this._gridDirty = true; // a bubble snapped into the grid
        this.checkMatches();
        if (this.checkGameOver()) {
          this._state = 'gameover';
          this._gameOverText.visible = true;
          this.stop();
          // The demo ends too: the cabinet reads demo mode and goes back to
          // its title rather than standing on a dead board for ever.
          ArcadeManager.endGame(this._score);
        } else {
          this.spawnBubble();
        }
      }

      this.refreshDisplay();
    }

    findCollisionBubble() {
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          if (!this._grid[y][x]) continue;
          const center = this.gridCellCenter(x, y);
          const dx = this._bubble.x - center.x;
          const dy = this._bubble.y - center.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= BUBBLE_RADIUS * 2 - 2) { // slight overlap threshold
            return { col: x, row: y, cx: center.x, cy: center.y };
          }
        }
      }
      return null;
    }

    placeAtTop() {
      // Snap to nearest column in top row
      const col = Math.floor(
        (this._bubble.x - (Graphics.width - GRID_COLS * CELL_SIZE) / 2) / CELL_SIZE
      );
      const c = Math.max(0, Math.min(GRID_COLS - 1, col));
      if (!this._grid[0][c]) {
        this._grid[0][c] = this._bubble.color;
        this._state = 'placed';
      } else {
        // find nearest empty in row 0
        for (let offset = 1; offset < GRID_COLS; offset++) {
          if (c - offset >= 0 && !this._grid[0][c - offset]) {
            this._grid[0][c - offset] = this._bubble.color;
            this._state = 'placed';
            return;
          }
          if (c + offset < GRID_COLS && !this._grid[0][c + offset]) {
            this._grid[0][c + offset] = this._bubble.color;
            this._state = 'placed';
            return;
          }
        }
        // fallback: force place (overwrite)
        this._grid[0][c] = this._bubble.color;
        this._state = 'placed';
      }
    }

    placeNear(targetCol, targetRow) {
      // Direction from target to incoming bubble
      const targetCenter = this.gridCellCenter(targetCol, targetRow);
      const dx = this._bubble.x - targetCenter.x;
      const dy = this._bubble.y - targetCenter.y;
      let stepX = Math.round(dx / CELL_SIZE);
      let stepY = Math.round(dy / CELL_SIZE);
      stepX = Math.max(-1, Math.min(1, stepX));
      stepY = Math.max(-1, Math.min(1, stepY));

      const tryPositions = [];
      if (stepX === 0 && stepY === 0) {
        // direct overlap, try upward first
        tryPositions.push([targetCol, targetRow - 1]);
        tryPositions.push([targetCol - 1, targetRow]);
        tryPositions.push([targetCol + 1, targetRow]);
      } else {
        tryPositions.push([targetCol + stepX, targetRow + stepY]);
        // fallback neighbors
        tryPositions.push([targetCol, targetRow - 1]);
        tryPositions.push([targetCol - 1, targetRow]);
        tryPositions.push([targetCol + 1, targetRow]);
        tryPositions.push([targetCol, targetRow + 1]);
      }

      for (const [c, r] of tryPositions) {
        if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS && !this._grid[r][c]) {
          this._grid[r][c] = this._bubble.color;
          this._state = 'placed';
          return;
        }
      }

      // If no empty neighbor, stick on top of target (overwrite)
      this._grid[targetRow][targetCol] = this._bubble.color;
      this._state = 'placed';
    }

    floodFill(x, y, color, visited) {
      const stack = [[x, y]];
      const cluster = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (
          cx >= 0 &&
          cx < GRID_COLS &&
          cy >= 0 &&
          cy < GRID_ROWS &&
          !visited[cy][cx] &&
          this._grid[cy][cx] === color
        ) {
          visited[cy][cx] = true;
          cluster.push([cx, cy]);
          stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
      }
      return cluster;
    }

    checkMatches() {
      const visited = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          const color = this._grid[y][x];
          if (color && !visited[y][x]) {
            const cluster = this.floodFill(x, y, color, visited);
            if (cluster.length >= 3) {
              cluster.forEach(([cx, cy]) => {
                this._grid[cy][cx] = null;
              });
              this._score += cluster.length;
            }
          }
        }
      }
      this._state = 'ready';
    }

    checkGameOver() {
      return this._grid[GRID_ROWS - 1].some(cell => cell != null);
    }

    // Redraw the static grid of 80 circles. Only needed when the grid changes
    // (a bubble is placed or a cluster is popped), not every ticker frame.
    redrawGrid() {
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          const g = this._cellGraphics[y][x];
          g.clear();
          const color = this._grid[y][x];
          if (color) {
            g.beginFill(PIXI.utils.string2hex(color));
            g.drawCircle(0, 0, BUBBLE_RADIUS);
            g.endFill();
            g.lineStyle(2, 0x000000, 0.3);
            g.drawCircle(0, 0, BUBBLE_RADIUS);
          } else {
            // empty subtle outline
            g.lineStyle(1, 0x444444, 0.2);
            g.drawCircle(0, 0, BUBBLE_RADIUS);
          }
        }
      }
    }

    refreshDisplay() {
      // Update grid circles only when the grid changed since last draw.
      if (this._gridDirty) {
        this.redrawGrid();
        this._gridDirty = false;
      }

      // Active bubble
      this._bubbleGraphic.clear();
      if (this._bubble && this._state !== 'gameover') {
        this._bubbleGraphic.beginFill(PIXI.utils.string2hex(this._bubble.color));
        this._bubbleGraphic.drawCircle(this._bubble.x, this._bubble.y, BUBBLE_RADIUS);
        this._bubbleGraphic.endFill();
        this._bubbleGraphic.lineStyle(2, 0x000000, 0.3);
        this._bubbleGraphic.drawCircle(this._bubble.x, this._bubble.y, BUBBLE_RADIUS);
      }

      // Angle indicator
      this._angleGraphic.clear();
      if (this._state !== 'gameover') {
        const centerX = Graphics.width / 2;
        const baseY = Graphics.height - 64;
        const rad = (this._angle * Math.PI) / 180;
        const len = 40;
        this._angleGraphic.lineStyle(3, 0xffffff);
        this._angleGraphic.moveTo(centerX, baseY);
        this._angleGraphic.lineTo(
          centerX + Math.cos(rad) * len,
          baseY - Math.sin(rad) * len
        );
      }

      // Score
      this._scoreText.text = T('Arcade.hud.score', { score: this._score });
    }
  }

  const cart = new ArcadeBubblePop();
  if (window.ArcadeManager) {
    ArcadeManager.registerGame(cartId, cartName, cart);
  } else {
    console.error('ArcadeCabinetManager not found! Load it before this cart.');
  }
})();
