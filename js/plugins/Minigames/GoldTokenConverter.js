
//=============================================================================
// GoldTokenConverter.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Gold to Arcade Token Converter v3.2.0
 * @author Omni-Lex 
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help GoldTokenConverter.js
 *
 * @param tokenItemId
 * @text Arcade Token Item ID
 * @desc The item ID for arcade tokens in your database (124 = Arcade Token)
 * @type item
 * @default 124
 *
 * @param goldToEuroRate
 * @text Gold to Euro Rate
 * @desc How much gold equals 1 Euro (100 gold = 1 Euro)
 * @type number
 * @min 1
 * @default 100
 *
 * @param tokenPriceEuro
 * @text Token Price in Euros
 * @desc Price of one arcade token in Euros
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 3.50
 *
 * @command openConverter
 * @text Open Token Converter
 * @desc Opens the gold to token conversion window
 *
 * @help
 * ============================================================================
 * Gold to Arcade Token Converter Plugin v3.2.0
 * ============================================================================
 *
 * This plugin allows players to convert gold to arcade tokens and vice versa.
 *
 * This version (v3.2.0) has been refactored by OmniLex to fix several bugs:
 * 1. Fixed a crash (Cannot read property '...' of null) that occurred
 * if the plugin was loaded or called before the database was ready.
 * 2. Fixed logic in the amount window that allowed a user to proceed with
 * a purchase they couldn't afford.
 * 3. Fixed a visual bug where the amount window was too small.
 * 4. Refactored the confirmation prompt to use a local window instead of
 * $gameMessage, making the scene more stable.
 *
 * Plugin Commands:
 * - Open Token Converter: Opens the conversion window
 *
 * Script Calls:
 * - SceneManager.push(Scene_TokenConverter);
 *
 * ============================================================================
 */

(() => {
    'use strict';
    
    const pluginName = 'GoldTokenConverter';
    const parameters = PluginManager.parameters(pluginName);
    
    // --- PARAMETER LOADING ---
    // Load parameters, but do NO database validation yet.
    
    const tokenItemId = Number(parameters['tokenItemId']) || 124;
    const goldToEuroRate = Number(parameters['goldToEuroRate']) || 100;
    const tokenPriceEuro = Number(parameters['tokenPriceEuro']) || 3.50;
    
    let goldPerToken = 0; // Will be calculated later
    
    // --- LAZY VALIDATION & CALCULATION ---
    // This function will run when the scene is opened, ensuring databases are loaded.
    
    function validateAndCalc() {
        if (goldPerToken > 0) return true; // Already validated
        
        if (tokenItemId === 0 || !$dataItems || !$dataItems[tokenItemId]) {
            console.error(`[${pluginName}] Error: 'Arcade Token Item ID' (${tokenItemId}) is not set or is invalid.`);
            return false;
        }
        if (goldToEuroRate <= 0) {
            console.error(`[${pluginName}] Error: 'Gold to Euro Rate' must be a positive number.`);
            return false;
        }
        if (tokenPriceEuro <= 0) {
            console.error(`[${pluginName}] Error: 'Token Price in Euros' must be a positive number.`);
            return false;
        }

        // All checks passed, calculate the rate
        goldPerToken = Math.floor(goldToEuroRate * tokenPriceEuro);
        
        if (goldPerToken <= 0) {
             console.error(`[${pluginName}] Error: 'goldPerToken' calculation resulted in 0. Check rates.`);
             return false;
        }
        
        return true;
    }

    //-----------------------------------------------------------------------------
    // Plugin Command
    //-----------------------------------------------------------------------------
    
    PluginManager.registerCommand(pluginName, "openConverter", args => {
        // Run validation when the command is called
        if (validateAndCalc()) {
            SceneManager.push(Scene_TokenConverter);
        } else {
            $gameMessage.add(T('GoldTokenConverter.msg.notConfigured'));
        }
    });
    
    //-----------------------------------------------------------------------------
    // Window_TokenStatus
    // Shows current tokens and exchange rate in Euros
    //-----------------------------------------------------------------------------
    
    class Window_TokenStatus extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this.refresh();
        }
        
        refresh() {
            this.contents.clear();
            const lineHeight = this.lineHeight();
            let y = 0;
            
            this.changeTextColor(ColorManager.systemColor());
            const titleText =T('GoldTokenConverter.tokenExchange');
            this.drawText(titleText, 0, y, this.innerWidth, 'center');
            y += lineHeight;
            
            this.changeTextColor(ColorManager.systemColor());
            const tokenLabel =T('GoldTokenConverter.availableTokens');
            this.drawText(tokenLabel, 0, y, this.innerWidth / 2);
            this.resetTextColor();
            
            // This line is now safe because the scene won't open if $dataItems[tokenItemId] is invalid
            const tokenCount = $gameParty.numItems($dataItems[tokenItemId]) || 0;
            
            this.drawText(tokenCount.toString(), this.innerWidth / 2, y, this.innerWidth / 2, 'right');
            y += lineHeight;
            
            this.changeTextColor(ColorManager.systemColor());
            const rateText = T('GoldTokenConverter.msg.rate', { price: tokenPriceEuro.toFixed(2) });
            this.drawText(rateText, 0, y, this.innerWidth, 'center');
        }
    }
    
    //-----------------------------------------------------------------------------
    // Window_TokenCommand
    // Command window for Buy/Sell selection
    //-----------------------------------------------------------------------------
    
    class Window_TokenCommand extends Window_Command {
        initialize(rect) {
            super.initialize(rect);
        }
        
        makeCommandList() {
            const buyText =T('GoldTokenConverter.buyTokens');
            const sellText =T('GoldTokenConverter.sellTokens');
            const exitText =T('GoldTokenConverter.exit');
            
            this.addCommand(buyText, 'buy', this.canBuy());
            this.addCommand(sellText, 'sell', this.canSell());
            this.addCommand(exitText, 'exit', true);
        }
        
        canBuy() {
            return $gameParty.gold() >= goldPerToken;
        }
        
        canSell() {
            // This is safe, $dataItems[tokenItemId] is guaranteed to exist here
            return $gameParty.numItems($dataItems[tokenItemId]) > 0;
        }
        
        refresh() {
            this.clearCommandList();
            this.makeCommandList();
            super.refresh();
        }
    }
    
    //-----------------------------------------------------------------------------
    // Window_TokenAmount
    // Window for selecting the amount of tokens to buy/sell
    //-----------------------------------------------------------------------------
    
    class Window_TokenAmount extends Window_Selectable {
        initialize(rect) {
            super.initialize(rect);
            this._amount = 1;
            this._maxAmount = 1;
            this._mode = 'buy';
            this.refresh();
        }
        
        maxItems() {
            return 1;
        }
        
        setMode(mode) {
            this._mode = mode;
            this._amount = 1; // Always reset to 1
            this.updateMaxAmount();
            this.refresh();
        }
        
        updateMaxAmount() {
            if (this._mode === 'buy') {
                // Bounded by the purse AND by what the pocket still holds.
                const token = $dataItems[tokenItemId];
                const room = $gameParty.maxItems(token) - $gameParty.numItems(token);
                this._maxAmount = Math.max(0, Math.min(
                    Math.floor($gameParty.gold() / goldPerToken),
                    room
                ));
            } else {
                this._maxAmount = $gameParty.numItems($dataItems[tokenItemId]);
            }
            
            // Clamp amount to new max.
            this._amount = Math.min(this._amount, this._maxAmount);
            
            // If max is 0, amount must be 0. 
            // If max > 0, amount must be at least 1.
            if (this._maxAmount === 0) {
                this._amount = 0;
            } else if (this._amount === 0) {
                this._amount = 1;
            }
        }
        
        currentAmount() {
            return this._amount;
        }
        
        refresh() {
            this.contents.clear();
            this.drawAmountInfo();
        }
        
        drawAmountInfo() {
            const lineHeight = this.lineHeight();
            let y = 0;
            
            this.changeTextColor(ColorManager.systemColor());
            const modeText = this._mode === 'buy' 
                ? (T('GoldTokenConverter.buyTokens'))
                : (T('GoldTokenConverter.sellTokens'));
            this.drawText(modeText, 0, y, this.innerWidth, 'center');
            y += lineHeight;
            
            this.changeTextColor(ColorManager.systemColor());
            const amountLabel =T('GoldTokenConverter.amount');
            this.drawText(amountLabel, 0, y, this.innerWidth, 'center');
            y += lineHeight;
            
            this.resetTextColor();
            const amountText = `◄ ${this._amount} ►`;
            this.drawText(amountText, 0, y, this.innerWidth, 'center');
            y += lineHeight;
            
            this.changeTextColor(ColorManager.systemColor());
            const totalEuros = this._amount * tokenPriceEuro;
            const costLabel = this._mode === 'buy' 
                ? (T('GoldTokenConverter.cost'))
                : (T('GoldTokenConverter.earnings'));
            this.drawText(costLabel, 0, y, this.innerWidth, 'center');
            y += lineHeight;
            
            this.resetTextColor();
            const euroText = `€${totalEuros.toFixed(2)}`;
            this.drawText(euroText, 0, y, this.innerWidth, 'center');
            
            y += lineHeight; // Move to the 6th line
            this.changeTextColor(ColorManager.systemColor());
            const maxText = T('GoldTokenConverter.msg.max', { max: this._maxAmount });
            this.drawText(maxText, 0, y, this.innerWidth, 'center');
        }
        
        cursorRight() {
            if (this._amount < this._maxAmount) {
                this._amount++;
                SoundManager.playCursor();
                this.refresh();
            }
        }
        
        cursorLeft() {
            if (this._amount > 1) {
                this._amount--;
                SoundManager.playCursor();
                this.refresh();
            }
        }
        
        cursorPagedown() {
            const newAmount = Math.min(this._amount + 10, this._maxAmount);
            if (newAmount > this._amount) {
                this._amount = newAmount;
                SoundManager.playCursor();
                this.refresh();
            }
        }
        
        cursorPageup() {
            const newAmount = Math.max(this._amount - 10, 1);
            if (newAmount < this._amount) {
                this._amount = newAmount;
                SoundManager.playCursor();
                this.refresh();
            }
        }
        
        processOk() {
            if (this.isOkEnabled()) {
                SoundManager.playOk();
                this.callOkHandler();
            } else {
                SoundManager.playBuzzer();
            }
        }
        
        isOkEnabled() {
            return this._amount > 0;
        }
    }
    
    //-----------------------------------------------------------------------------
    // Window_TokenConfirm
    // A local confirmation window
    //-----------------------------------------------------------------------------
    
    class Window_TokenConfirm extends Window_Command {
        initialize(rect) {
            super.initialize(rect);
            this._message = '';
        }

        makeCommandList() {
            const yesText =T('GoldTokenConverter.yes');
            const noText =T('GoldTokenConverter.no');
            this.addCommand(yesText, 'confirm', true);
            this.addCommand(noText, 'cancel', true);
        }

        setMessage(message) {
            this._message = message;
            this.refresh();
        }
        
        refresh() {
            this.contents.clear();
            this.drawText(this._message, 0, 0, this.innerWidth, 'center');
            super.refresh();
        }

        itemRect(index) {
            const rect = super.itemRect(index);
            rect.y += this.lineHeight(); // Place commands on the second line
            return rect;
        }

        maxCols() {
            return 2;
        }
    }

    //-----------------------------------------------------------------------------
    // Scene_TokenConverter
    //-----------------------------------------------------------------------------
    
    class Scene_TokenConverter extends Scene_MenuBase {
        create() {
            super.create();
            
            // Fail-safe: if scene is pushed via script call, validate first.
            if (!validateAndCalc()) {
                $gameMessage.add(T('GoldTokenConverter.msg.error'));
                this.popScene();
                return;
            }
            
            this.createStatusWindow();
            this.createCommandWindow();
            this.createAmountWindow();
            this.createConfirmWindow();
        }
        
        createStatusWindow() {
            const rect = this.statusWindowRect();
            this._statusWindow = new Window_TokenStatus(rect);
            this.addWindow(this._statusWindow);
        }
        
        createCommandWindow() {
            const rect = this.commandWindowRect();
            this._commandWindow = new Window_TokenCommand(rect);
            this._commandWindow.setHandler('buy', this.commandBuy.bind(this));
            this._commandWindow.setHandler('sell', this.commandSell.bind(this));
            this._commandWindow.setHandler('exit', this.popScene.bind(this));
            this._commandWindow.setHandler('cancel', this.popScene.bind(this));
            this.addWindow(this._commandWindow);
        }
        
        createAmountWindow() {
            const rect = this.amountWindowRect();
            this._amountWindow = new Window_TokenAmount(rect);
            this._amountWindow.setHandler('ok', this.onAmountOk.bind(this));
            this._amountWindow.setHandler('cancel', this.onAmountCancel.bind(this));
            this._amountWindow.deactivate();
            this._amountWindow.hide();
            this.addWindow(this._amountWindow);
        }

        createConfirmWindow() {
            const rect = this.confirmWindowRect();
            this._confirmWindow = new Window_TokenConfirm(rect);
            this._confirmWindow.setHandler('confirm', this.onConfirmOk.bind(this));
            this._confirmWindow.setHandler('cancel', this.onConfirmCancel.bind(this));
            this._confirmWindow.deactivate();
            this._confirmWindow.hide();
            this.addWindow(this._confirmWindow);
        }

        statusWindowRect() {
            const width = 500;
            const height = this.calcWindowHeight(3, true); // 3 lines
            const x = (Graphics.boxWidth - width) / 2;
            const y = 80;
            return new Rectangle(x, y, width, height);
        }
        
        commandWindowRect() {
            const width = 300;
            const height = this.calcWindowHeight(3, true);
            const x = (Graphics.boxWidth - width) / 2;
            const y = this._statusWindow.y + this._statusWindow.height + 20;
            return new Rectangle(x, y, width, height);
        }
        
        amountWindowRect() {
            const width = 400;
            const height = this.calcWindowHeight(6, true); // 6 lines
            const x = (Graphics.boxWidth - width) / 2;
            const y = 100 + this._commandWindow.height + 5;
            return new Rectangle(x, y, width, height);
        }

        confirmWindowRect() {
            const width = 480;
            const height = this.calcWindowHeight(3, true); // Message + 2 commands
            const x = (Graphics.boxWidth - width) / 2;
            const y = (Graphics.boxHeight - height) / 2;
            return new Rectangle(x, y, width, height);
        }
        
        commandBuy() {
            if ($gameParty.gold() < goldPerToken) {
                SoundManager.playBuzzer();
                return;
            }
            this.startAmountSelection('buy');
        }
        
        commandSell() {
            if ($gameParty.numItems($dataItems[tokenItemId]) <= 0) {
                SoundManager.playBuzzer();
                return;
            }
            this.startAmountSelection('sell');
        }

        startAmountSelection(mode) {
            this._amountWindow.setMode(mode);
            this._amountWindow.show();
            this._amountWindow.activate();
            this._commandWindow.deactivate();
            this._commandWindow.hide();
        }
        
        onAmountOk() {
            const amount = this._amountWindow.currentAmount();
            const mode = this._amountWindow._mode;
            const totalEuros = amount * tokenPriceEuro;
            
            let confirmMessage;
            if (mode === 'buy') {
                confirmMessage = T('GoldTokenConverter.confirm.buy', { amount, total: totalEuros.toFixed(2) });
            } else {
                confirmMessage = T('GoldTokenConverter.confirm.sell', { amount, total: totalEuros.toFixed(2) });
            }

            this._amountWindow.deactivate();
            this._confirmWindow.setMessage(confirmMessage);
            this._confirmWindow.show();
            this._confirmWindow.activate();
            this._confirmWindow.select(0);
        }
        
        onAmountCancel() {
            this._amountWindow.hide();
            this._amountWindow.deactivate();
            this._commandWindow.show();
            this._commandWindow.activate();
            this._commandWindow.refresh();
        }

        onConfirmOk() {
            const amount = this._amountWindow.currentAmount();
            const mode = this._amountWindow._mode;
            
            if (mode === 'buy') {
                this.processBuy(amount);
            } else {
                this.processSell(amount);
            }
            this.closeConfirmAndReturnToCommand();
        }

        onConfirmCancel() {
            this._confirmWindow.hide();
            this._confirmWindow.deactivate();
            this._amountWindow.activate(); // Return to amount selection
        }

        closeConfirmAndReturnToCommand() {
            this._confirmWindow.hide();
            this._confirmWindow.deactivate();
            this.refreshAllWindows();
            this.onAmountCancel(); // This returns to the command window
        }

        processBuy(amount) {
            // Nothing to sell the player, so nothing to charge, sound or
            // announce. A negative amount would otherwise pay gold OUT of the
            // counter and confiscate tokens for it.
            const wanted = Math.floor(Number(amount) || 0);
            if (wanted <= 0) return;

            // The pocket only holds so many. Charging for tokens that are
            // dropped on the floor is the player paying for nothing.
            const token = $dataItems[tokenItemId];
            const room = $gameParty.maxItems(token) - $gameParty.numItems(token);
            amount = Math.min(wanted, Math.max(0, room));
            if (amount <= 0) {
                SoundManager.playBuzzer();
                window.skipLocalization = true;
                $gameMessage.add(T('GoldTokenConverter.msg.pocketFull'));
                window.skipLocalization = false;
                return;
            }
            const totalCost = amount * goldPerToken;

            if ($gameParty.gold() >= totalCost) {
                $gameParty.loseGold(totalCost);
                $gameParty.gainItem($dataItems[tokenItemId], amount);
                SoundManager.playShop();
                
                const totalEuros = amount * tokenPriceEuro;
                $gameMessage.add(T('GoldTokenConverter.msg.bought', { amount, total: totalEuros.toFixed(2) }));
            } else {
                SoundManager.playBuzzer();
                const message =T('GoldTokenConverter.insufficientGold');
                window.skipLocalization = true;
                $gameMessage.add(message);
                window.skipLocalization = false;
            }
        }
        
        processSell(amount) {
            // A zero or negative sale would mint gold and hand out free tokens.
            amount = Math.floor(Number(amount) || 0);
            if (amount <= 0) return;

            const currentTokens = $gameParty.numItems($dataItems[tokenItemId]);

            if (currentTokens >= amount) {
                const totalEarnings = amount * goldPerToken;
                $gameParty.loseItem($dataItems[tokenItemId], amount);
                $gameParty.gainGold(totalEarnings);
                SoundManager.playShop();
                
                const totalEuros = amount * tokenPriceEuro;
                $gameMessage.add(T('GoldTokenConverter.msg.sold', { amount, total: totalEuros.toFixed(2) }));
            } else {
                SoundManager.playBuzzer();
                const message =T('GoldTokenConverter.insufficientTokens');
                window.skipLocalization = true;
                $gameMessage.add(message);
                window.skipLocalization = false;
            }
        }
        
        refreshAllWindows() {
            this._statusWindow.refresh();
            this._commandWindow.refresh();
            if (this._amountWindow) {
                this._amountWindow.updateMaxAmount();
            }
        }
    }
    
    // Make classes globally available
    window.Scene_TokenConverter = Scene_TokenConverter;

})();
