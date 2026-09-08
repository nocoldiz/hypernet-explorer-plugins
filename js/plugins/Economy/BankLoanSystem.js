/*:
 * @target MZ
 * @plugindesc Creates a banking system with deposits, withdrawals, interest, and loans.
 * @author Omni-Lex (Your Name Here)
 * @url https://yourwebsite.com
 *
 * @param Starting Interest Rate
 * @desc The starting interest rate for money in the bank (in percentage)
 * @default 2
 * @type number
 * @min 0
 * @decimals 1
 *
 * @param Interest Interval
 * @desc How often interest is applied (in game days)
 * @default 7
 * @type number
 * @min 1
 *
 * @param Loan Interest Rate
 * @desc The interest rate for loans (in percentage)
 * @default 5
 * @type number
 * @min 0
 * @decimals 1
 *
 * @param Max Loan Amount
 * @desc The maximum amount the player can borrow
 * @default 10000
 * @type number
 * @min 0
 *
 * @param Loan Duration
 * @desc How long before a loan must be paid back (in game days)
 * @default 30
 * @type number
 * @min 1
 *
 * @command OpenBankMenu
 * @desc Opens the banking system menu
 *
 * @command ProcessDayChange
 * @desc Force one extra day of interest and loan accrual (the ledger already follows the world clock)
 *
 * @help
 * ===========================================================================
 * Bank and Loan System
 * ===========================================================================
 * This plugin implements a banking system with the following features:
 * - Deposit gold into a bank account
 * - Withdraw gold from your bank account
 * - Earn interest on your bank balance
 * - Take out loans with interest
 * - Get penalized for not paying back loans on time
 * 
 * ===========================================================================
 * How to Use
 * ===========================================================================
 * 1. In an event, use the plugin command "OpenBankMenu" to open the bank menu.
 * 2. Days are read from the world clock, so interest and loan maturity advance
 *    on their own. "ProcessDayChange" forces one extra day of accrual.
 *
 * ===========================================================================
 * Script Calls
 * ===========================================================================
 * $gameSystem.getBankBalance() - Returns the player's bank balance
 * $gameSystem.getLoanBalance() - Returns the player's current loan amount
 * $gameSystem.getLoanDueDate() - Returns the due date for the current loan
 * 
 */

(() => {
    'use strict';

    const pluginName = "BankLoanSystem";

    //=============================================================================
    // Plugin Parameters
    //=============================================================================

    const parameters = PluginManager.parameters(pluginName);
    const interestRate = Number(parameters['Starting Interest Rate'] || 2) / 100;
    const interestInterval = Number(parameters['Interest Interval'] || 7);
    const loanInterestRate = Number(parameters['Loan Interest Rate'] || 5) / 100;
    const maxLoanAmount = Number(parameters['Max Loan Amount'] || 10000);
    const loanDuration = Number(parameters['Loan Duration'] || 30);

    const MINUTES_PER_DAY = 1440;

    // One toast per catch-up, not one per day the party spent away from a desk.
    function notifyOverdue(penalized) {
        if (penalized && window.ParchmentToast) {
            window.ParchmentToast.show(T('BankLoan.ui.loanOverdue'), { severity: "warning", duration: 180 });
        }
    }

    //=============================================================================
    // Game_System
    //=============================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize.call(this);
        this._bankBalance = 0;
        this._loanBalance = 0;
        this._loanPrincipal = 0;
        this._loanDueDate = 0;
        this._daysSinceInterest = 0;
        this._currentDay = 0;
        // A new game already stands on day zero of the world clock, so there is
        // nothing to rebase the first time the ledger is opened.
        this._bankDaySynced = true;
    };

    Game_System.prototype.getBankBalance = function () {
        return this._bankBalance || 0;
    };

    Game_System.prototype.getLoanBalance = function () {
        return this._loanBalance || 0;
    };

    Game_System.prototype.getLoanDueDate = function () {
        return this._loanDueDate || 0;
    };

    Game_System.prototype.deposit = function (amount) {
        if (amount > 0 && $gameParty.gold() >= amount) {
            this._bankBalance = (this._bankBalance || 0) + amount;
            $gameParty.loseGold(amount);
            return true;
        }
        return false;
    };

    Game_System.prototype.withdraw = function (amount) {
        if (amount > 0 && (this._bankBalance || 0) >= amount) {
            this._bankBalance -= amount;
            $gameParty.gainGold(amount);
            return true;
        }
        return false;
    };

    // Books a bank can follow are books a bank will lend against, so a party
    // that keeps its accounts borrows more (Accounting, spec 1). The UI asks for
    // the same figure, so what is offered is what can actually be signed for.
    Game_System.prototype.getLoanCeiling = function () {
        return window.SpecializationXP
            ? Math.floor(maxLoanAmount * window.SpecializationXP.multiplier('Accounting', 0.12))
            : maxLoanAmount;
    };

    Game_System.prototype.takeLoan = function (amount) {
        const ceiling = this.getLoanCeiling();
        if (amount > 0 && amount <= ceiling && (this._loanBalance || 0) === 0) {
            // The term runs from today, not from whatever day the ledger last
            // caught up to.
            this.syncBankDays();
            this._loanBalance = amount;
            this._loanPrincipal = amount;
            this._loanDueDate = (this._currentDay || 0) + loanDuration;
            $gameParty.gainGold(amount);
            if (window.SpecializationXP) {
                window.SpecializationXP.awardForValue('Accounting', amount);
            }
            return true;
        }
        return false;
    };

    Game_System.prototype.repayLoan = function (amount) {
        if (amount > 0) {
            // Never charge more than the outstanding debt, and only require enough
            // gold to cover the amount actually repaid (not the over-requested amount).
            const repaidAmount = Math.min(amount, this._loanBalance || 0);
            if (repaidAmount > 0 && $gameParty.gold() >= repaidAmount) {
                this._loanBalance -= repaidAmount;
                $gameParty.loseGold(repaidAmount);

                if (this._loanBalance <= 0) {
                    this._loanBalance = 0;
                    this._loanDueDate = 0;
                }
                return true;
            }
        }
        return false;
    };

    // The day the world clock says it is (Variable 114 counts minutes). The
    // ledger used to run on a counter only an event could advance, so a loan
    // never actually fell due; it follows the calendar now.
    Game_System.prototype.bankToday = function () {
        if (window.TimeDateSystem && window.TimeDateSystem.getGameTimeMinutes) {
            return Math.floor(window.TimeDateSystem.getGameTimeMinutes() / MINUTES_PER_DAY);
        }
        return this._currentDay || 0;
    };

    // Brings the ledger up to today, one day at a time. A save made before the
    // ledger followed the clock is rebased rather than charged for every day it
    // never knew about: the maturity term moves along with it.
    // Returns true when an overdue penalty was charged on the way.
    Game_System.prototype.syncBankDays = function () {
        // No bank, no interest and no penalties in an empty world: the ledger
        // is frozen wherever it stood rather than quietly compounding against
        // a party who cannot reach a branch to settle it.
        const WM = window.WorldManager;
        if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) return false;
        const today = this.bankToday();
        if (!this._bankDaySynced) {
            this._bankDaySynced = true;
            const offset = today - (this._currentDay || 0);
            if (offset > 0 && (this._loanDueDate || 0) > 0) this._loanDueDate += offset;
            this._currentDay = today;
            return false;
        }
        let penalized = false;
        let guard = 3650;
        while ((this._currentDay || 0) < today && guard-- > 0) {
            if (this.processDayChange()) penalized = true;
        }
        return penalized;
    };

    // Returns true when an overdue penalty was actually charged.
    Game_System.prototype.processDayChange = function () {
        this._currentDay = (this._currentDay || 0) + 1;
        this._daysSinceInterest = (this._daysSinceInterest || 0) + 1;
        let penalized = false;

        // Apply bank interest
        if (this._daysSinceInterest >= interestInterval) {
            this._bankBalance = (this._bankBalance || 0) + Math.floor((this._bankBalance || 0) * interestRate);
            this._daysSinceInterest = 0;
        }

        // Process loan
        if ((this._loanBalance || 0) > 0) {
            // Check if loan is overdue
            if ((this._currentDay || 0) > (this._loanDueDate || 0)) {
                // Add penalty interest, capped so the debt cannot spiral without limit.
                // Cap total balance at 3x the original principal.
                const penaltyCap = Math.floor((this._loanPrincipal || this._loanBalance || 0) * 3);
                const before = this._loanBalance;
                // Somebody who reads the small print negotiates the penalty
                // down before it compounds out of reach.
                const relief = window.SpecializationXP
                    ? window.SpecializationXP.discount('Accounting', 0.08, 0.6) : 1;
                let next = this._loanBalance + Math.floor((this._loanBalance || 0) * (loanInterestRate * 2) * relief);
                if (next > penaltyCap) next = penaltyCap;
                this._loanBalance = next;

                penalized = this._loanBalance > before;
            }
        }

        return penalized;
    };

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    // Inside the OS the bank is a desktop window; anywhere else it is a scene of
    // its own. Either way the ledger is brought up to date before it is read.
    function openBank() {
        // A bank is other people: clerks, a board, somebody to owe. In an empty
        // world there is nobody on the other side of the counter, so the branch
        // never opens and no interest accrues on the way in.
        // See WorldManager.populationMode.
        const WM = window.WorldManager;
        if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) {
            if (window.ParchmentToast) window.ParchmentToast.show(T('BankLoan.ui.noOneLeft'));
            return;
        }
        notifyOverdue($gameSystem.syncBankDays());
        const inOS = window.HypernetOS && window.Scene_HypernetOS &&
            SceneManager._scene instanceof window.Scene_HypernetOS;
        if (inOS && window.HypernetBankApp) {
            window.HypernetBankApp.launch();
            return;
        }
        SceneManager.push(Scene_BankSystem);
    }

    PluginManager.registerCommand(pluginName, "OpenBankMenu", () => {
        openBank();
    });

    PluginManager.registerCommand(pluginName, "ProcessDayChange", () => {
        notifyOverdue($gameSystem.processDayChange());
    });

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'app-bank-system',
            name: T('BankLoan.ui.appName'),
            icon: 84,
            launchFn: function() {
                openBank();
            },
            desktopShortcut: true
        });
    }

    // --- HypernetBankApp ---
    window.HypernetBankApp = {
        appInstance: null,
        win: null,
        launch: function(params) {
            if (!window.HypernetWindowManager) return;

            // closeAll() (the OS shutting down) removes the window node without
            // firing 'hypernet-closed', so a stale instance can outlive its DOM.
            if (this.win && !this.win.isConnected) this.teardown();

            if (!this.win || !document.getElementById('app-bank-system')) {
                this.win = window.HypernetWindowManager.createWindow({
                    id: 'app-bank-system',
                    title: T('BankLoan.ui.appName'),
                    icon: 84,
                    width: 950,
                    height: 600,
                    contentHTML: '<div class="bank-01" id="bank-system-content"></div>'
                });

                this.appInstance = new Scene_BankSystem();
                this.appInstance._isAppMode = true;
                this.appInstance.create();
                
                this.win.addEventListener('hypernet-closed', () => this.teardown());
            } else {
                window.HypernetWindowManager.bringToFront(this.win);
            }
        },
        teardown: function() {
            if (this.appInstance) {
                this.appInstance.terminate();
                this.appInstance = null;
            }
            this.win = null;
        },
        update: function() {
            if (this.appInstance && this.win) {
                if (this.win.classList.contains('active')) {
                    this.appInstance.update();
                }
            }
        }
    };

    //=============================================================================
    // Window_BankCommand
    //=============================================================================

    function Window_BankCommand() {
        this.initialize(...arguments);
    }

    Window_BankCommand.prototype = Object.create(Window_Command.prototype);
    Window_BankCommand.prototype.constructor = Window_BankCommand;

    Window_BankCommand.prototype.initialize = function (rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_BankCommand.prototype.makeCommandList = function () {
        this.addCommand(T('BankLoan.ui.deposit'), "deposit");
        this.addCommand(T('BankLoan.ui.withdraw'), "withdraw");
        this.addCommand(T('BankLoan.ui.loan'), "loan");
        this.addCommand(T('BankLoan.ui.repayLoan'), "repay");
        this.addCommand(T('BankLoan.ui.exit'), "cancel");
    };

    //=============================================================================
    // Window_BankStatus
    //=============================================================================

    function Window_BankStatus() {
        this.initialize(...arguments);
    }

    Window_BankStatus.prototype = Object.create(Window_Base.prototype);
    Window_BankStatus.prototype.constructor = Window_BankStatus;

    Window_BankStatus.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_BankStatus.prototype.refresh = function () {
        this.contents.clear();

        const lineHeight = this.lineHeight();
        const x = this.itemPadding();
        let y = 0;
        // Labels are stored bare; the colon belongs to the view. The panels used
        // to append one to a label that already carried it ("Bank Balance::").
        const label = key => T(key) + ":";

        // Player's money
        this.drawText(label('BankLoan.ui.yourMoney'), x, y, 120);
        this.drawText("€" + ($gameParty.gold() / 100).toFixed(2), x + 140, y, 120, 'right');
        y += lineHeight;

        // Bank balance
        this.drawText(label('BankLoan.ui.bankBalance'), x, y, 120);
        this.drawText("€" + ($gameSystem.getBankBalance() / 100).toFixed(2), x + 140, y, 120, 'right');
        y += lineHeight;

        // Interest rate
        this.drawText(label('BankLoan.ui.interestRate'), x, y, 120);
        this.drawText(T('BankLoan.ui.ratePerDays',
            { rate: (interestRate * 100).toFixed(1), days: interestInterval }), x + 140, y, 180, 'right');
        y += lineHeight;

        // Loan information
        if ($gameSystem.getLoanBalance() > 0) {
            this.drawText(label('BankLoan.ui.loanAmount'), x, y, 120);
            this.drawText("€" + ($gameSystem.getLoanBalance() / 100).toFixed(2), x + 140, y, 120, 'right');
            y += lineHeight;

            this.drawText(label('BankLoan.ui.dueDate'), x, y, 120);
            this.drawText(maturityText(), x + 140, y, 120, 'right');
            y += lineHeight;

            this.drawText(label('BankLoan.ui.loanRate'), x, y, 120);
            this.drawText((loanInterestRate * 100).toFixed(1) + "%", x + 140, y, 120, 'right');
        } else {
            this.drawText(label('BankLoan.ui.maxLoan'), x, y, 120);
            this.drawText("€" + ($gameSystem.getLoanCeiling() / 100).toFixed(2), x + 140, y, 120, 'right');
            y += lineHeight;

            this.drawText(label('BankLoan.ui.loanRate'), x, y, 120);
            this.drawText((loanInterestRate * 100).toFixed(1) + "%", x + 140, y, 120, 'right');
            y += lineHeight;

            this.drawText(label('BankLoan.ui.loanDuration'), x, y, 120);
            this.drawText(T('BankLoan.ui.daysCount', { days: loanDuration }), x + 140, y, 120, 'right');
        }
    };

    // How long the outstanding loan has left, or that it has run out of time. A
    // ledger that has fallen behind the clock would otherwise count backwards.
    function maturityText() {
        const daysLeft = $gameSystem.getLoanDueDate() - ($gameSystem._currentDay || 0);
        return daysLeft >= 0
            ? T('BankLoan.ui.daysLeft', { days: daysLeft })
            : T('BankLoan.ui.overdue');
    }

    //=============================================================================
    // Window_Amount - A simplified window for amount input
    //=============================================================================

    function Window_Amount() {
        this.initialize(...arguments);
    }

    Window_Amount.prototype = Object.create(Window_Base.prototype);
    Window_Amount.prototype.constructor = Window_Amount;

    Window_Amount.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._amount = 0;
        this._maxAmount = 0;
        this._mode = "";
        this.active = false;
        this.refresh();
    };

    Window_Amount.prototype.setMode = function (mode, maxAmount) {
        this._mode = mode;
        this._maxAmount = maxAmount;
        this._amount = 0;
        this.refresh();
        this.activate();
    };

    Window_Amount.prototype.amount = function () {
        return this._amount;
    };

    Window_Amount.prototype.refresh = function () {
        this.contents.clear();
        const lineHeight = this.lineHeight();
        this.drawText(T('BankLoan.ui.proposedTransactionBalance'), 0, 0, 300);

        const amountText = "€" + (this._amount / 100).toFixed(2);
        this.drawText(amountText, 0, lineHeight, this.width - this.padding * 2, 'right');

        const helpText = T('BankLoan.ui.adjustKeys');
        this.contents.drawText(helpText, 0, lineHeight * 2, this.width - this.padding * 2, lineHeight);

        const confirmText = T('BankLoan.ui.confirmKeys');
        this.contents.drawText(confirmText, 0, lineHeight * 3, this.width - this.padding * 2, lineHeight);
    };

    // This window holds the amount; it never reads input. The scene polls the
    // keys itself, and a window that polled them too moved the figure twice on
    // every press (and the OS focus ring drives it inside HypernetOS).

    Window_Amount.prototype.processOk = function () {
        this.deactivate();
        this.callOkHandler();
    };

    Window_Amount.prototype.processCancel = function () {
        this.deactivate();
        this.callCancelHandler();
    };

    Window_Amount.prototype.activate = function () {
        this.active = true;
        this.refresh();
    };

    Window_Amount.prototype.deactivate = function () {
        this.active = false;
        this.refresh();
    };

    Window_Amount.prototype.callOkHandler = function () {
        if (this._okHandler) {
            this._okHandler();
        }
    };

    Window_Amount.prototype.callCancelHandler = function () {
        if (this._cancelHandler) {
            this._cancelHandler();
        }
    };

    Window_Amount.prototype.setHandler = function (symbol, method) {
        if (symbol === 'ok') {
            this._okHandler = method;
        } else if (symbol === 'cancel') {
            this._cancelHandler = method;
        }
    };

    //=============================================================================
    // Scene_BankSystem
    //===========================================================================
    function Scene_BankSystem() {
        this.initialize(...arguments);
    }

    Scene_BankSystem.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_BankSystem.prototype.constructor = Scene_BankSystem;

    Scene_BankSystem.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_BankSystem.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        // Name the skill this menu runs on while it is open.
        if (window.SpecBadge) window.SpecBadge.show('Accounting');  // i18n-ignore  Specialization.json id

        // Reading the ledger brings it up to date, however it was opened.
        notifyOverdue($gameSystem.syncBankDays());

        // Create status window
        const statusRect = this.statusWindowRect();
        this._statusWindow = new Window_BankStatus(statusRect);
        this.addWindow(this._statusWindow);

        // Create command window
        const commandRect = this.commandWindowRect();
        this._commandWindow = new Window_BankCommand(commandRect);
        this._commandWindow.setHandler("deposit", this.commandDeposit.bind(this));
        this._commandWindow.setHandler("withdraw", this.commandWithdraw.bind(this));
        this._commandWindow.setHandler("loan", this.commandLoan.bind(this));
        this._commandWindow.setHandler("repay", this.commandRepay.bind(this));
        this._commandWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this._commandWindow);

        // Create amount window
        const amountRect = this.amountWindowRect();
        this._amountWindow = new Window_Amount(amountRect);
        this._amountWindow.setHandler('ok', this.onAmountOk.bind(this));
        this._amountWindow.setHandler('cancel', this.onAmountCancel.bind(this));
        this.addWindow(this._amountWindow);
        this._amountWindow.hide(); // Hide the amount window initially

        // Hide MZ standard canvas windows
        if (this._statusWindow) this._statusWindow.visible = false;
        if (this._commandWindow) this._commandWindow.visible = false;
        if (this._amountWindow) this._amountWindow.visible = false;

        this.createUIBankDOM();
    };

    Scene_BankSystem.prototype.popScene = function () {
        if (this._isAppMode) {
            if (window.HypernetBankApp && window.HypernetBankApp.win) {
                window.HypernetWindowManager.closeWindow(window.HypernetBankApp.win);
            }
            return;
        }
        Scene_MenuBase.prototype.popScene.call(this);
    };

    Scene_BankSystem.prototype.statusWindowRect = function () {
        const wx = 0;
        const wy = this.mainAreaTop();
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(6, true);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_BankSystem.prototype.commandWindowRect = function () {
        const wx = 0;
        const wy = this._statusWindow.y + this._statusWindow.height;
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(5, true);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_BankSystem.prototype.amountWindowRect = function () {
        const ww = 400;
        const wh = this.calcWindowHeight(5, true);
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = (Graphics.boxHeight - wh) / 2;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_BankSystem.prototype.commandDeposit = function () {
        const maxAmount = $gameParty.gold();
        if (maxAmount > 0) {
            this._commandWindow.deactivate();
            this._amountWindow.setMode("Deposit", maxAmount);  // i18n-ignore  mode id
            this._mode = "deposit";
            this.refreshUIBankDOM();
        } else {
            this._commandWindow.activate();
            SoundManager.playBuzzer();
            this.showMessage(T('BankLoan.ui.noMoneyToDeposit'));
        }
    };

    Scene_BankSystem.prototype.commandWithdraw = function () {
        const maxAmount = $gameSystem.getBankBalance();
        if (maxAmount > 0) {
            this._commandWindow.deactivate();
            this._amountWindow.setMode("Withdraw", maxAmount);  // i18n-ignore  mode id
            this._mode = "withdraw";
            this.refreshUIBankDOM();
        } else {
            this._commandWindow.activate();
            SoundManager.playBuzzer();
            this.showMessage(T('BankLoan.ui.noBankMoney'));
        }
    };

    Scene_BankSystem.prototype.commandLoan = function () {
        if ($gameSystem.getLoanBalance() === 0) {
            this._commandWindow.deactivate();
            this._amountWindow.setMode("Loan", $gameSystem.getLoanCeiling());  // i18n-ignore  mode id
            this._mode = "loan";
            this.refreshUIBankDOM();
        } else {
            this._commandWindow.activate();
            SoundManager.playBuzzer();
            this.showMessage(T('BankLoan.ui.alreadyBorrowed'));
        }
    };

    Scene_BankSystem.prototype.commandRepay = function () {
        const loanAmount = $gameSystem.getLoanBalance();
        const playerGold = $gameParty.gold();

        if (loanAmount > 0) {
            const maxRepay = Math.min(loanAmount, playerGold);
            if (maxRepay > 0) {
                this._commandWindow.deactivate();
                this._amountWindow.setMode("Repay", maxRepay);  // i18n-ignore  mode id
                this._mode = "repay";
                this.refreshUIBankDOM();
            } else {
                this._commandWindow.activate();
                SoundManager.playBuzzer();
                this.showMessage(T('BankLoan.ui.noMoneyToRepay'));
            }
        } else {
            this._commandWindow.activate();
            SoundManager.playBuzzer();
            this.showMessage(T('BankLoan.ui.noOutstandingLoan'));
        }
    };

    Scene_BankSystem.prototype.onAmountOk = function () {
        const amount = this._amountWindow.amount();
        let success = false;

        if (amount > 0) {
            switch (this._mode) {
                case "deposit":
                    success = $gameSystem.deposit(amount);
                    break;
                case "withdraw":
                    success = $gameSystem.withdraw(amount);
                    break;
                case "loan":
                    success = $gameSystem.takeLoan(amount);
                    break;
                case "repay":
                    success = $gameSystem.repayLoan(amount);
                    break;
            }

            if (success) {
                SoundManager.playShop();
                const actionText = {
                    deposit: T('BankLoan.ui.actionDeposited'),
                    withdraw: T('BankLoan.ui.actionWithdrew'),
                    loan: T('BankLoan.ui.actionBorrowed'),
                    repay: T('BankLoan.ui.actionRepaid')
                }[this._mode];

                this.showMessage(T('BankLoan.ui.transactionDone',
                    { action: actionText, amount: (amount / 100).toFixed(2) }));
            } else {
                SoundManager.playBuzzer();
            }
        }

        this._statusWindow.refresh();
        this._commandWindow.activate();
        this._amountWindow.hide();
        this.refreshUIBankDOM();
    };

    Scene_BankSystem.prototype.onAmountCancel = function () {
        this._commandWindow.activate();
        this._amountWindow.hide();
        this.refreshUIBankDOM();
    };

    // Neither the bank scene nor an OS window carries a message window, so a
    // $gameMessage line sat in the queue until the party was back on the map.
    // Toasts are the house style for this kind of notice and show where the
    // player is actually looking.
    Scene_BankSystem.prototype.showMessage = function (text) {
        if (window.ParchmentToast) {
            window.ParchmentToast.show(text, { duration: 180 });
            return;
        }
        window.skipLocalization = true;
        $gameMessage.add(text);
        window.skipLocalization = false;
    };

    Scene_BankSystem.prototype.terminate = function () {
        Scene_MenuBase.prototype.terminate.call(this);
        if (this._dndContainer) {
            const container = this._dndContainer;
            container.style.transition = "opacity 0.2s ease-out";
            container.style.opacity = "0";
            container.style.pointerEvents = "none";
            setTimeout(() => {
                if (container && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 200);
            this._dndContainer = null;
        }
    };

    Scene_BankSystem.prototype.createUIBankDOM = function () {
        this._activeTab = 'transact'; // 'transact', 'loans', 'terms'

        this._dndContainer = document.createElement('div');
        // Every control declares data-bank-action and is served by this one
        // delegated listener, bound to the container (which survives each
        // innerHTML rewrite) rather than to inline attributes. The scene
        // instance is captured in the closure, so a click always reaches the
        // bank that drew the button: inline handlers went through
        // SceneManager._scene, which inside HypernetOS is the desktop and not
        // this scene, and every click threw "selectBankCommand is not a
        // function".
        this._dndContainer.addEventListener('click', (e) => {
            const el = e.target && e.target.closest ?
                e.target.closest('[data-bank-action]') : null;
            if (!el || !this._dndContainer.contains(el)) return;
            if (el.classList.contains('disabled')) {
                if (window.SoundManager) SoundManager.playBuzzer();
                return;
            }
            this.runBankAction(el.dataset.bankAction);
        });
        // The shell: .bank-root in theme.css, restyled to XP chrome under
        // #bank-system-content in hypernet.css when the OS window hosts it.
        this._dndContainer.classList.add('bank-root');

        if (this._isAppMode) {
            const parent = document.getElementById('bank-system-content');
            if (parent) {
                parent.appendChild(this._dndContainer);
                this.refreshUIBankDOM();
                return;
            }
        }

        // Fallback for non-app mode. The parchment overlay id belongs to the
        // fullscreen scene only: it means position:fixed, 100vw/100vh and a dark
        // backdrop, which inside an OS window paints over the whole desktop.
        this._dndContainer.id = 'menu-container';
        this._dndContainer.classList.add('bank-root--fullscreen');
        document.body.appendChild(this._dndContainer);

        this.refreshUIBankDOM();
    };

    // Resolves a data-bank-action string into the matching scene call. Keeping
    // the vocabulary in one place means the markup never names a global object.
    Scene_BankSystem.prototype.runBankAction = function (action) {
        if (!action) return;
        const [verb, arg] = action.split(':');
        switch (verb) {
            case 'tab':
                this.switchXPTab(arg);
                break;
            case 'cmd':
                this.selectBankCommand(Number(arg));
                break;
            case 'amt':
                this.adjustAmount(Number(arg));
                break;
            case 'amtmax':
                this.adjustAmount(Number(arg), true);
                break;
            case 'confirm':
                this.confirmTransaction();
                break;
            case 'void':
                this.cancelTransaction();
                break;
            case 'close':
                this.popScene();
                break;
        }
    };

    Scene_BankSystem.prototype.switchXPTab = function (tabName) {
        if (this._activeTab !== tabName) {
            this._activeTab = tabName;
            if (window.SoundManager) SoundManager.playOk();
            // Cancel any active input when switching tabs
            if (this._amountWindow && this._amountWindow.active) {
                this._amountWindow.deactivate();
                this._amountWindow.hide();
            }
            this.refreshUIBankDOM();
        }
    };

    // One action button for the XP window: greyed out (unfocusable, and ignored
    // by the delegated click handler) whenever the transaction it opens cannot
    // be made, with the reason as its tooltip.
    Scene_BankSystem.prototype.actionButtonHTML = function (id, action, label, enabled, disabledHint) {
        const cls = enabled ? 'action-button focusable' : 'action-button disabled';
        const tab = enabled ? ' tabindex="0"' : '';
        const hint = enabled ? '' : ` title="${String(disabledHint).replace(/"/g, '&quot;')}"`;
        return `
            <div class="${cls}"${tab} id="${id}" data-bank-action="${action}"${hint}>
                ${label}
            </div>
        `;
    };

    Scene_BankSystem.prototype.refreshUIBankDOM = function () {
        if (!this._dndContainer) return;

        if (this._isAppMode) {
            const bankBalance = $gameSystem.getBankBalance();
            const loanBalance = $gameSystem.getLoanBalance();
            const gold = $gameParty.gold();
            const loanCeiling = $gameSystem.getLoanCeiling();

            const isAmountActive = this._amountWindow && this._amountWindow.active;
            const currentAmount = isAmountActive ? this._amountWindow.amount() : 0;
            const maxAmount = isAmountActive ? this._amountWindow._maxAmount : 0;
            const activeMode = isAmountActive ? this._amountWindow._mode : "";

            let contentHTML = "";

            if (this._activeTab === 'transact') {
                // TAB 1: Deposits & Withdrawals
                let leftHTML = `
                    <h2 class="cc-header-gothic">${T('BankLoan.ui.accountsDeposits')}</h2>
                    <div class="stat-card bank-02">
                        <div class="bank-03">
                            <span class="bank-04">${T('BankLoan.ui.personalWallet')}:</span>
                            <span class="bank-05">€${(gold / 100).toFixed(2)}</span>
                        </div>
                        <div class="bank-03">
                            <span class="bank-04">${T('BankLoan.ui.bankBalance')}:</span>
                            <span class="bank-06">€${(bankBalance / 100).toFixed(2)}</span>
                        </div>
                        <div class="bank-03">
                            <span class="bank-04">${T('BankLoan.ui.interestRate')}:</span>
                            <span class="bank-07">${T('BankLoan.ui.ratePerDays', { rate: (interestRate * 100).toFixed(1), days: interestInterval })}</span>
                        </div>
                    </div>
                    <div class="bank-08">
                        ${this.actionButtonHTML('bank-act-deposit', 'cmd:0',
                            T('BankLoan.ui.depositFunds'), gold > 0,
                            T('BankLoan.ui.noMoneyToDeposit'))}
                        ${this.actionButtonHTML('bank-act-withdraw', 'cmd:1',
                            T('BankLoan.ui.withdrawFunds'), bankBalance > 0,
                            T('BankLoan.ui.noBankMoney'))}
                    </div>
                `;

                let rightHTML = "";
                if (isAmountActive && (activeMode.toLowerCase() === 'deposit' || activeMode.toLowerCase() === 'withdraw')) {
                    rightHTML = this.getTransactionDeedHTML(activeMode, currentAmount, maxAmount);
                } else {
                    rightHTML = `
                        <h2 class="cc-header-gothic">${T('BankLoan.ui.depositGuidelines')}</h2>
                        <div class="bank-09">
                            <p class="bank-10">${T('BankLoan.ui.secureYourHardEarnedFunds')}</p>
                            <div class="bank-11">
                                ${T('BankLoan.ui.currentYield')}: ${(interestRate * 100).toFixed(1)}% ${T('BankLoan.ui.every')} ${interestInterval} ${T('BankLoan.ui.days')}.
                            </div>
                        </div>
                    `;
                }

                contentHTML = `
                    <div class="bank-12">
                        <div class="bank-13">${leftHTML}</div>
                        <div class="bank-14"></div>
                        <div class="bank-15">${rightHTML}</div>
                    </div>
                `;

            } else if (this._activeTab === 'loans') {
                // TAB 2: Loans & Liabilities
                let leftHTML = `
                    <h2 class="cc-header-gothic">${T('BankLoan.ui.debtLiabilities')}</h2>
                    <div class="stat-card bank-02">
                        <div class="bank-03" style="color:${loanBalance > 0 ? 'var(--text-blood-red)' : 'inherit'}; font-weight:${loanBalance > 0 ? 'bold' : 'normal'}">
                            <span>${T('BankLoan.ui.outstandingDebt')}:</span>
                            <span>€${(loanBalance / 100).toFixed(2)}</span>
                        </div>
                        ${loanBalance > 0 ? `
                        <div class="bank-03">
                            <span class="bank-04">${T('BankLoan.ui.daysUntilDue')}:</span>
                            <span class="bank-16">${maturityText()}</span>
                        </div>
                        <div class="bank-03">
                            <span class="bank-04">${T('BankLoan.ui.premiumInterest')}:</span>
                            <span>${(loanInterestRate * 100).toFixed(1)}%</span>
                        </div>
                        ` : `
                        <div class="bank-03">
                            <span class="bank-04">${T('BankLoan.ui.maxDebtLimit')}:</span>
                            <span>€${(loanCeiling / 100).toFixed(2)}</span>
                        </div>
                        <div class="bank-03">
                            <span class="bank-04">${T('BankLoan.ui.durationStandard')}:</span>
                            <span>${T('BankLoan.ui.daysCount', { days: loanDuration })}</span>
                        </div>
                        `}
                    </div>
                    <div class="bank-08">
                        ${this.actionButtonHTML('bank-act-loan', 'cmd:2',
                            T('BankLoan.ui.requestLoan'), loanBalance === 0,
                            T('BankLoan.ui.alreadyBorrowed'))}
                        ${this.actionButtonHTML('bank-act-repay', 'cmd:3',
                            T('BankLoan.ui.repayDebt'), loanBalance > 0 && gold > 0,
                            loanBalance > 0 ? T('BankLoan.ui.noMoneyToRepay') : T('BankLoan.ui.noOutstandingLoan'))}
                    </div>
                `;

                let rightHTML = "";
                if (isAmountActive && (activeMode.toLowerCase() === 'loan' || activeMode.toLowerCase() === 'repay')) {
                    rightHTML = this.getTransactionDeedHTML(activeMode, currentAmount, maxAmount);
                } else {
                    rightHTML = `
                        <h2 class="cc-header-gothic">${T('BankLoan.ui.loanPolicies')}</h2>
                        <div class="bank-09">
                            <p class="bank-10">${T('BankLoan.ui.guildApprovedLoansProvideEmergency')}</p>
                            <div class="bank-17">
                                ${T('BankLoan.ui.notice')}: ${T('BankLoan.ui.unresolvedDebtsDirectlyImpactCredit')}
                            </div>
                        </div>
                    `;
                }

                contentHTML = `
                    <div class="bank-12">
                        <div class="bank-13">${leftHTML}</div>
                        <div class="bank-14"></div>
                        <div class="bank-15">${rightHTML}</div>
                    </div>
                `;

            } else {
                // TAB 3: Guild Terms
                contentHTML = `
                    <div class="bank-18">
                        ${this.getBankGuidelinesHTML()}
                    </div>
                `;
            }

            this._dndContainer.innerHTML = `
                <div class="cc-pockets-spread">
                    <div class="page-header-bar">
                        <div class="back-button focusable" tabindex="0" id="bank-dismiss" data-bank-action="close">
                            ${T('BankLoan.ui.dismiss')}
                        </div>
                        <h2 class="title">${T('BankLoan.ui.monetaryAccountPockets')}</h2>
                    </div>

                    <!-- XP Tabs Navigation -->
                    <div class="xp-tabs">
                        <div class="xp-tab focusable ${this._activeTab === 'transact' ? 'active' : ''}" tabindex="0" id="bank-tab-transact" data-bank-action="tab:transact">
                            ${T('BankLoan.ui.depositsWithdrawals')}
                        </div>
                        <div class="xp-tab focusable ${this._activeTab === 'loans' ? 'active' : ''}" tabindex="0" id="bank-tab-loans" data-bank-action="tab:loans">
                            ${T('BankLoan.ui.loansLiabilities')}
                        </div>
                        <div class="xp-tab focusable ${this._activeTab === 'terms' ? 'active' : ''}" tabindex="0" id="bank-tab-terms" data-bank-action="tab:terms">
                            ${T('BankLoan.ui.regulatoryTerms')}
                        </div>
                    </div>

                    <!-- XP Tab Page Container -->
                    <div class="cc-page">
                        ${contentHTML}
                    </div>

                </div>
            `;
            return;
        }

        const bankBalance = $gameSystem.getBankBalance();
        const loanBalance = $gameSystem.getLoanBalance();
        const gold = $gameParty.gold();

        const isAmountActive = this._amountWindow && this._amountWindow.active;
        const currentAmount = isAmountActive ? this._amountWindow.amount() : 0;
        const maxAmount = isAmountActive ? this._amountWindow._maxAmount : 0;
        const activeMode = isAmountActive ? this._amountWindow._mode : "";

        const selectedIndex = this._commandWindow ? this._commandWindow.index() : 0;

        let leftPageHTML = this.getBankPocketsHTML(selectedIndex, gold, bankBalance, loanBalance);
        let rightPageHTML = "";

        if (isAmountActive) {
            rightPageHTML = this.getTransactionDeedHTML(activeMode, currentAmount, maxAmount);
        } else {
            rightPageHTML = this.getBankGuidelinesHTML();
        }

        this._dndContainer.innerHTML = `
            <div class="cc-pockets-spread">
                <!-- Spine Shading -->
                <div class="bank-21"></div>

                <!-- Left Page -->
                <div class="cc-page cc-page-left bank-22">
                    ${leftPageHTML}
                </div>

                <!-- Right Page -->
                <div class="cc-page cc-page-right bank-22">
                    ${rightPageHTML}
                </div>
            </div>
        `;
    };

    Scene_BankSystem.prototype.getBankPocketsHTML = function (selectedIndex, gold, bankBalance, loanBalance) {
        const loanCeiling = $gameSystem.getLoanCeiling();
        const commands = [
            { symbol: "deposit", label: T('BankLoan.ui.depositFunds2') },
            { symbol: "withdraw", label: T('BankLoan.ui.withdrawFunds2') },
            { symbol: "loan", label: T('BankLoan.ui.petitionDebtDeed') },
            { symbol: "repay", label: T('BankLoan.ui.repayOutstandingLoan') },
            { symbol: "cancel", label: T('BankLoan.ui.dismissPockets') }
        ];

        // The way out is the shared Back stamp in the header bar, not a fifth
        // row at the foot of the list. It keeps the command window's own index
        // so the pad still walks onto it, it just stands where every other
        // screen's Back stands.
        let commandListHTML = "";
        let backButtonHTML = "";
        commands.forEach((cmd, idx) => {
            const isSelected = idx === selectedIndex && (!this._amountWindow || !this._amountWindow.active);

            if (cmd.symbol === "cancel") {
                backButtonHTML = `
                <div class="back-button focusable ${isSelected ? 'selected' : ''}" tabindex="0" id="bank-cmd-${cmd.symbol}" data-bank-action="cmd:${idx}">
                    ${cmd.label}
                </div>
            `;
                return;
            }

            commandListHTML += `
                <div class="bank-command focusable ${isSelected ? 'selected' : ''}" tabindex="0" id="bank-cmd-${cmd.symbol}" data-bank-action="cmd:${idx}">
                    ${cmd.label}
                </div>
            `;
        });

        return `
            <div class="page-header-bar">
                ${backButtonHTML}
                <h2 class="title cc-header-gothic bank-23">
                    ${T('BankLoan.ui.monetaryAccountPockets')}
                </h2>
            </div>

            <div class="bank-24">
                <div class="bank-25">
                    <span class="bank-26">${T('BankLoan.ui.personalHoldings')}:</span>
                    <span class="bank-27">€${(gold / 100).toFixed(2)}</span>
                </div>
                <div class="bank-25">
                    <span class="bank-26">${T('BankLoan.ui.bankBalance')}:</span>
                    <span class="bank-28">€${(bankBalance / 100).toFixed(2)}</span>
                </div>
                <div class="bank-29">
                    <span>${T('BankLoan.ui.depositYieldRate')}:</span>
                    <span>${T('BankLoan.ui.ratePerDays', { rate: (interestRate * 100).toFixed(1), days: interestInterval })}</span>
                </div>

                <div class="bank-30">
                    <div class="bank-25" style="color:${loanBalance > 0 ? 'var(--text-settings-active)' : 'inherit'}; font-weight:${loanBalance > 0 ? 'bold' : 'normal'}">
                        <span>${T('BankLoan.ui.outstandingGuildDebt')}:</span>
                        <span class="bank-31">€${(loanBalance / 100).toFixed(2)}</span>
                    </div>
                    ${loanBalance > 0 ? `
                    <div class="bank-32">
                        <span>${T('BankLoan.ui.debtMaturityTerm')}:</span>
                        <span>${maturityText()}</span>
                    </div>
                    <div class="bank-29">
                        <span>${T('BankLoan.ui.interestPremiumRate')}:</span>
                        <span>${(loanInterestRate * 100).toFixed(1)}%</span>
                    </div>
                    ` : `
                    <div class="bank-29">
                        <span>${T('BankLoan.ui.maxDebtLimit')}:</span>
                        <span>€${(loanCeiling / 100).toFixed(2)}</span>
                    </div>
                    <div class="bank-29">
                        <span>${T('BankLoan.ui.maturityStandard')}:</span>
                        <span>${T('BankLoan.ui.daysCount', { days: loanDuration })}</span>
                    </div>
                    `}
                </div>
            </div>

            <div class="bank-33">
                ${commandListHTML}
            </div>
        `;
    };

    // The ladder of adjustment steps, in gold: €1, €10, €100, €1000... up to the
    // largest round step the transaction can actually spend. A wallet holding a
    // few thousand euros is unusable one euro at a time, and a ladder fixed at
    // the top would be four dead buttons on a small transaction.
    const TIER_MIN = 100;        // €1.00
    const TIER_MAX = 1000000;    // €10000.00
    function amountTiers(maxAmount) {
        const tiers = [];
        for (let step = TIER_MIN; step <= TIER_MAX; step *= 10) {
            // Always offer €1 and €10, then every step the ceiling can reach.
            if (step > maxAmount && tiers.length >= 2) break;
            tiers.push(step);
        }
        return tiers;
    }

    // The parchment book dresses its own buttons through .bank-tier-btn; the
    // XP window leaves them to the OS stylesheet.

    // One row of the ladder per step, subtract on the left and add on the right.
    Scene_BankSystem.prototype.amountTiersHTML = function (maxAmount) {
        const tierClass = this._isAppMode ? '' : ' bank-tier-btn';
        return amountTiers(maxAmount).map(step => {
            const label = "€" + (step / 100).toFixed(2);
            return `
                            <div class="btn-stamp focusable${tierClass}" tabindex="0" id="bank-amt-m${step}" data-bank-action="amt:-${step}">
                                - ${label}
                            </div>
                            <div class="btn-stamp focusable${tierClass}" tabindex="0" id="bank-amt-p${step}" data-bank-action="amt:${step}">
                                + ${label}
                            </div>`;
        }).join('');
    };

    Scene_BankSystem.prototype.getTransactionDeedHTML = function (activeMode, currentAmount, maxAmount) {
        let title = "";
        let description = "";

        switch (activeMode.toLowerCase()) {
            case "deposit":
                title = T('BankLoan.ui.depositFunds2');
                description = T('BankLoan.ui.authorizeTheTransferOfHoldings');
                break;
            case "withdraw":
                title = T('BankLoan.ui.withdrawFunds2');
                description = T('BankLoan.ui.submitAPetitionToRelease');
                break;
            case "loan":
                title = T('BankLoan.ui.loanPetition');
                description = T('BankLoan.ui.petitionForAStandardDebt');
                break;
            case "repay":
                title = T('BankLoan.ui.debtRetirement');
                description = T('BankLoan.ui.transferPersonalCoinToRetire');
                break;
        }

        if (this._isAppMode) {
            return `
                <h2 class="cc-header-gothic bank-34">
                    ${title}
                </h2>

                <div class="bank-35">
                    <div class="bank-36">
                        <div class="bank-37">
                            "${description}"
                        </div>

                        <div class="bank-38">
                            <span class="bank-39">
                                ${T('BankLoan.ui.proposedTransactionBalance')}
                            </span>
                            <div class="bank-40">
                                €${(currentAmount / 100).toFixed(2)}
                            </div>
                            <span class="bank-41">
                                ${T('BankLoan.ui.permittedThreshold')}: €${(maxAmount / 100).toFixed(2)}
                            </span>
                        </div>

                        <div class="bank-42">
                            ${this.amountTiersHTML(maxAmount)}
                            <div class="btn-stamp focusable btn-max bank-43" tabindex="0" id="bank-amt-max" data-bank-action="amtmax:${maxAmount}">
                                ${T('BankLoan.ui.proposeMaximumThreshold')}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bank-44">
                    <div class="action-button focusable" tabindex="0" id="bank-confirm" data-bank-action="confirm">
                        ${T('BankLoan.ui.confirmTransaction')}
                    </div>
                    <div class="action-button focusable bank-45" tabindex="0" id="bank-void" data-bank-action="void">
                        ${T('BankLoan.ui.voidApplication')}
                    </div>
                </div>
            `;
        }

        return `
            <h2 class="cc-header-gothic bank-23">
                ${title}
            </h2>

            <div class="bank-46">
                <div class="bank-47">
                    <div class="bank-48">
                        "${description}"
                    </div>

                    <div class="bank-49">
                        <span class="bank-50">
                            ${T('BankLoan.ui.proposedTransactionBalance')}
                        </span>
                        <div class="bank-51">
                            €${(currentAmount / 100).toFixed(2)}
                        </div>
                        <span class="bank-52">
                            ${T('BankLoan.ui.permittedThreshold')}: €${(maxAmount / 100).toFixed(2)}
                        </span>
                    </div>

                    <div class="bank-53">
                        ${this.amountTiersHTML(maxAmount)}
                        <div class="btn-stamp focusable bank-54" tabindex="0" id="bank-amt-max" data-bank-action="amtmax:${maxAmount}">
                            ${T('BankLoan.ui.proposeMaximumThreshold')}
                        </div>
                    </div>
                </div>
            </div>

            <div class="bank-55">
                <div class="action-button focusable bank-56" tabindex="0" id="bank-confirm" data-bank-action="confirm">
                    ${T('BankLoan.ui.sealTransactionVoucher')}
                </div>
                <div class="action-button focusable bank-57" tabindex="0" id="bank-void" data-bank-action="void">
                    ${T('BankLoan.ui.voidApplication')}
                </div>
            </div>
        `;
    };

    Scene_BankSystem.prototype.getBankGuidelinesHTML = function () {
        if (this._isAppMode) {
            return `
                <h2 class="cc-header-gothic bank-34">
                    ${T('BankLoan.ui.imperialDepositStatutes')}
                </h2>

                <div class="bank-58">
                    <p class="bank-10">
                        ${T('BankLoan.ui.welcomeToTheImperialVault')}
                    </p>

                    <div class="bank-59">
                        <div>• ${T('BankLoan.ui.allDebtsNotRetiredWithin')}</div>
                        <div>• ${T('BankLoan.ui.standardDepositYieldsDynamicallyRespond')}</div>
                    </div>

                    <p class="bank-10">
                        ${T('BankLoan.ui.selectTheDesiredTabAbove')}
                    </p>
                </div>
            `;
        }

        return `
            <h2 class="cc-header-gothic bank-23">
                ${T('BankLoan.ui.imperialDepositStatutes')}
            </h2>

            <div class="bank-60">
                <p class="bank-61">
                    ${T('BankLoan.ui.welcomeToTheImperialVault')}
                </p>

                <div class="bank-62">
                    <div>• ${T('BankLoan.ui.allDebtsNotRetiredWithin')}</div>
                    <div>• ${T('BankLoan.ui.standardDepositYieldsDynamicallyRespond')}</div>
                </div>

                <p class="bank-61">
                    ${T('BankLoan.ui.selectTheDesiredFinancialAction')}
                </p>
            </div>
        `;
    };

    Scene_BankSystem.prototype.selectBankCommand = function (index) {
        if (this._commandWindow) {
            this._commandWindow.select(index);
            SoundManager.playOk();
            this._commandWindow.callOkHandler();
            this.refreshUIBankDOM();
        }
    };

    Scene_BankSystem.prototype.adjustAmount = function (value, isSet = false) {
        if (this._amountWindow && this._amountWindow.active) {
            let amt = isSet ? value : this._amountWindow.amount() + value;
            amt = Math.max(0, Math.min(amt, this._amountWindow._maxAmount));
            this._amountWindow._amount = amt;
            SoundManager.playCursor();
            this.refreshUIBankDOM();
        }
    };

    Scene_BankSystem.prototype.confirmTransaction = function () {
        if (this._amountWindow && this._amountWindow.active) {
            this._amountWindow.processOk();
            this.refreshUIBankDOM();
        }
    };

    Scene_BankSystem.prototype.cancelTransaction = function () {
        if (this._amountWindow && this._amountWindow.active) {
            this._amountWindow.processCancel();
            this.refreshUIBankDOM();
        }
    };

    Scene_BankSystem.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);

        // Inside HypernetOS the desktop owns the keyboard: it drives its focus
        // ring with the arrows/WASD, activates with Enter and closes on Escape.
        // Reading the same keys here moved the amount twice per press and closed
        // the window twice over, so the app mode leaves input to the OS.
        if (!this._dndContainer || this._isAppMode) return;

        let moved = false;
        const isAmountActive = this._amountWindow && this._amountWindow.active;

        if (!isAmountActive && this._commandWindow) {
            if (Input.isRepeated('down')) {
                const currentIndex = this._commandWindow.index();
                const maxItems = this._commandWindow.maxItems();
                if (maxItems > 0) {
                    const nextIndex = currentIndex < maxItems - 1 ? currentIndex + 1 : 0;
                    this._commandWindow.select(nextIndex);
                    SoundManager.playCursor();
                    moved = true;
                }
            } else if (Input.isRepeated('up')) {
                const currentIndex = this._commandWindow.index();
                const maxItems = this._commandWindow.maxItems();
                if (maxItems > 0) {
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : maxItems - 1;
                    this._commandWindow.select(prevIndex);
                    SoundManager.playCursor();
                    moved = true;
                }
            } else if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                this._commandWindow.callOkHandler();
                moved = true;
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }
        } else if (isAmountActive && this._amountWindow) {
            // The bigger rungs of the ladder are click-only in the book spread,
            // so Q/E (pageup/pagedown) carry the coarse step for the keyboard.
            if (Input.isRepeated('down')) {
                this.adjustAmount(-100);
            } else if (Input.isRepeated('up')) {
                this.adjustAmount(100);
            } else if (Input.isRepeated('left')) {
                this.adjustAmount(-1000);
            } else if (Input.isRepeated('right')) {
                this.adjustAmount(1000);
            } else if (Input.isRepeated('pageup')) {
                this.adjustAmount(-10000);
            } else if (Input.isRepeated('pagedown')) {
                this.adjustAmount(10000);
            } else if (Input.isTriggered('ok')) {
                this.confirmTransaction();
            } else if (Input.isTriggered('cancel')) {
                this.cancelTransaction();
            }
        }

        if (moved) {
            this.refreshUIBankDOM();
        }
    };

})();