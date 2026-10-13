/*:
 * @target MZ
 * @plugindesc Basic Arcade Cart Template v1.0.0
 * @author OmniLex
 * @help
 * ============================================================================
 * Basic Arcade Cart Template
 * ============================================================================
 * Use this as a starting point for developing arcade games compatible with
 * the ArcadeCabinetManager API.
 */

(() => {
    const cartId = 'ArcadeGameTemplate';
    const cartName = 'ARCADE GAME TEMPLATE';

    class ArcadeTemplateGame {
        constructor() {
            this._container = null;
            this._score = 0;
            this._isDemo = false;
            this._updateHandler = null;
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
            this.stop(); // clear any stale ticker from a previous run
            this._score = 0;
            this.clearContainer();
            this.render();

            // Drive the game from the shared PIXI ticker.
            this._updateHandler = this.update.bind(this);
            Graphics.app.ticker.add(this._updateHandler);

            // Auto-teardown: when the arcade scene drops this container, remove
            // the ticker so the cart cannot keep running after the player exits.
            this._container.on('removed', () => this.stop());

            ArcadeManager.startGame();
        }

        clearContainer() {
            this._container.removeChildren();
        }

        render() {
            const text = new PIXI.Text(
                ArcadeManager.getText(this._isDemo ? 'demoMode' : 'gameStart'),
                {
                    fontFamily: ArcadeManager.getArcadeFont(),
                    fontSize: 48,
                    fill: '#FFFFFF',
                    align: 'center'
                }
            );
            text.anchor.set(0.5);
            text.x = Graphics.width / 2;
            text.y = Graphics.height / 2;
            this._container.addChild(text);
        }

        update() {
            const input = ArcadeManager.getInput();
            if (!this._isDemo && input.action) {
                this.endGame();
            }
        }

        // Manager teardown contract: cancel the ticker. Safe to call repeatedly.
        stop() {
            if (this._updateHandler) {
                Graphics.app.ticker.remove(this._updateHandler);
                this._updateHandler = null;
            }
        }

        endGame() {
            this.stop();
            ArcadeManager.endGame(this._score);
        }
    }

    const cart = new ArcadeTemplateGame();
    ArcadeManager.registerGame(cartId, cartName, cart);
})();
