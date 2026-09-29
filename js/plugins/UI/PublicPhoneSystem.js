//=============================================================================
// PublicPhoneSystem.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v1.0.0] Public Payphone: outgoing calls only, shares the Hexphone contact and credit ledger.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help PublicPhoneSystem.js
 *
 * A coin-operated public telephone. It only places outgoing calls: there is
 * no inbox, no games, no incoming calls and no way to save a new contact.
 * Contacts, phone credits and call history are the same ledger
 * HexphoneSystem.js keeps on $gameSystem, so this plugin must load AFTER
 * HexphoneSystem.js.
 *
 * Open it from a map event with the "Open Public Phone" plugin command.
 *
 * Controls (phone open):
 *   Mouse/touch ....... all on-screen buttons
 *   0-9 * ............. keypad (dialing and quick shortcuts)
 *   Arrow Up/Down ..... navigate the contact list
 *   Enter / Z ......... CALL on the dial screen, LIST elsewhere
 *   Escape / X ........ END button (back, close from home screen)
 *   Backspace ......... delete digit while dialing
 *
 * @param callCostPerSecond
 * @text Call Cost Per Second
 * @desc Credits consumed per second during a call placed from this phone
 * @type number
 * @min 0
 * @default 2
 *
 * @command openPublicPhone
 * @text Open Public Phone
 * @desc Opens the public telephone interface
 */

(() => {
    'use strict';

    const pluginName = "PublicPhoneSystem";
    const parameters = PluginManager.parameters(pluginName);
    const callCostPerSecond = Number(parameters['callCostPerSecond']) || 2;

    //=============================================================================
    // Translations
    //=============================================================================

    // Copy lives in js/i18n/<lang>/plugins/PublicPhone.json.
    const _ppSlug = k => String(k).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        .split(/\s+/).map((w, i) => i ? w[0].toUpperCase() + w.slice(1) : w).join('');

    function getText(key) {
        const resolved = 'PublicPhone.' + _ppSlug(key); // i18n-ignore: key prefix
        return T.has(resolved) ? T(resolved) : key;
    }

    //=============================================================================
    // Helpers
    //=============================================================================

    function goldToEuros(goldAmount) {
        return (goldAmount / 100).toFixed(2);
    }

    function playSeSafe(name, volume, pitch) {
        if (!name) return;
        AudioManager.playSe({ name: name, volume: volume || 90, pitch: pitch || 100, pan: 0 });
    }

    //=============================================================================
    // Scene_PublicPhone
    //=============================================================================

    function Scene_PublicPhone() {
        this.initialize(...arguments);
    }

    Scene_PublicPhone.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_PublicPhone.prototype.constructor = Scene_PublicPhone;

    Scene_PublicPhone.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._screenMode = 'home';
        this._dialedNumber = '';
        this._buttons = [];
        this._screenAnimation = 0;
        this._inCall = false;
        this._callDuration = 0;
        this._callTimer = null;
        this._connectTimeout = null;
        this._cursorBlink = 0;
        this._closing = false;
        this._selectedContactIndex = 0;
    };

    Scene_PublicPhone.prototype.create = function() {
        // Buttons are only ever built once in createPhoneButtons(); see
        // HexphoneSystem.js for why building them twice is fatal (a doubled
        // popScene empties the scene stack and calls SceneManager.exit()).
        Scene_MenuBase.prototype.create.call(this);
        if ($gameSystem && $gameSystem.ensureAnokiPhone) $gameSystem.ensureAnokiPhone();
        this.createPhoneBody();
        this.createScreen();
        this.createPhoneButtons();
        this.playPowerOnSound();
    };

    Scene_PublicPhone.prototype.createBackground = function() {
        // Transparent background, the booth floats over black
    };

    Scene_PublicPhone.prototype.createButtons = function() {
        // Intentionally empty: real buttons are built in createPhoneButtons().
    };

    Scene_PublicPhone.prototype.needsCancelButton = function() {
        return false;
    };

    Scene_PublicPhone.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this._keyDownHandler = this.onDocumentKeyDown.bind(this);
        document.addEventListener('keydown', this._keyDownHandler);
    };

    //-------------------------------------------------------------------------
    // Booth body and screen
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.createPhoneBody = function() {
        const boothX = Graphics.width / 2 - 150;
        const boothY = 50;

        this._phoneSprite = new Sprite();
        this._phoneSprite.bitmap = new Bitmap(300, 600);
        this._phoneSprite.x = boothX;
        this._phoneSprite.y = boothY;

        const bitmap = this._phoneSprite.bitmap;
        const context = bitmap.context;

        const gradient = context.createLinearGradient(0, 0, 0, 600);
        gradient.addColorStop(0, '#7a8794');
        gradient.addColorStop(1, '#3f4954');

        context.fillStyle = gradient;
        context.roundRect(0, 0, 300, 600, 14);
        context.fill();

        context.strokeStyle = '#1f2937';
        context.lineWidth = 3;
        context.roundRect(0, 0, 300, 600, 14);
        context.stroke();

        // Header plate
        context.fillStyle = '#b91c1c';
        context.fillRect(10, 10, 280, 24);
        bitmap.fontSize = 13;
        bitmap.fontFace = 'Arial';
        bitmap.textColor = '#ffffff';
        bitmap.drawText(getText('Title'), 0, 11, 300, 22, 'center');

        // Coin slot
        context.fillStyle = '#1f2937';
        context.fillRect(20, 340, 40, 10);

        // Handset resting on its cord
        context.strokeStyle = '#1f2937';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(268, 300);
        context.lineTo(268, 400);
        context.stroke();
        context.fillStyle = '#2d3748';
        context.beginPath();
        context.ellipse(268, 296, 14, 8, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.ellipse(268, 404, 14, 8, 0, 0, Math.PI * 2);
        context.fill();

        this.addChild(this._phoneSprite);
    };

    Scene_PublicPhone.prototype.createScreen = function() {
        const screenX = Graphics.width / 2 - 130;
        const screenY = 90;

        this._screenSprite = new Sprite();
        this._screenSprite.bitmap = new Bitmap(260, 180);
        this._screenSprite.x = screenX;
        this._screenSprite.y = screenY;

        const bitmap = this._screenSprite.bitmap;
        bitmap.fillRect(0, 0, 260, 180, '#a9b6c4');

        const context = bitmap.context;
        context.strokeStyle = '#1f2937';
        context.lineWidth = 2;
        context.strokeRect(0, 0, 260, 180);

        this.addChild(this._screenSprite);

        this._contentSprite = new Sprite();
        this._contentSprite.bitmap = new Bitmap(250, 170);
        this._contentSprite.x = screenX + 5;
        this._contentSprite.y = screenY + 5;
        this.addChild(this._contentSprite);

        this.refreshScreen();
    };

    Scene_PublicPhone.prototype.createPhoneButtons = function() {
        const startX = Graphics.width / 2 - 130;
        const buttonWidth = 70;
        const buttonHeight = 45;
        const spacing = 15;
        const funcY = 280;

        const callButton = new Sprite_AnokiButton(
            startX, funcY, buttonWidth, buttonHeight - 5, getText('Call Button'), '#16a34a');
        callButton.setClickHandler(() => this.onCallButton());
        this._buttons.push(callButton);
        this.addChild(callButton);

        const listButton = new Sprite_AnokiButton(
            startX + buttonWidth + spacing, funcY, buttonWidth, buttonHeight - 5, getText('List Button'), '#3b82f6');
        listButton.setClickHandler(() => this.onListButton());
        this._buttons.push(listButton);
        this.addChild(listButton);

        const endButton = new Sprite_AnokiButton(
            startX + (buttonWidth + spacing) * 2, funcY, buttonWidth, buttonHeight - 5, getText('End Button'), '#dc2626');
        endButton.setClickHandler(() => this.onEndButton());
        this._buttons.push(endButton);
        this.addChild(endButton);

        const startY = funcY + (buttonHeight - 5) + spacing;
        // i18n-ignore-start: phone keypad legend, universal
        const buttonLayout = [
            [{label: '1\n', value: '1'}, {label: '2\nABC', value: '2'}, {label: '3\nDEF', value: '3'}],
            [{label: '4\nGHI', value: '4'}, {label: '5\nJKL', value: '5'}, {label: '6\nMNO', value: '6'}],
            [{label: '7\nPQRS', value: '7'}, {label: '8\nTUV', value: '8'}, {label: '9\nWXYZ', value: '9'}],
            [{label: '*', value: '*'}, {label: '0\n+', value: '0'}, {label: '#', value: '#'}]
        ];
        // i18n-ignore-end

        for (let row = 0; row < buttonLayout.length; row++) {
            for (let col = 0; col < buttonLayout[row].length; col++) {
                const btn = buttonLayout[row][col];
                const x = startX + col * (buttonWidth + spacing);
                const y = startY + row * (buttonHeight + spacing);
                const button = new Sprite_AnokiButton(x, y, buttonWidth, buttonHeight, btn.label, '#4a5568');
                button.setClickHandler(() => this.onNumberButton(btn.value));
                this._buttons.push(button);
                this.addChild(button);
            }
        }
    };

    //-------------------------------------------------------------------------
    // Screen rendering
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.refreshScreen = function() {
        if (!this._contentSprite || !this._contentSprite.bitmap) return;
        const bitmap = this._contentSprite.bitmap;
        bitmap.clear();
        bitmap.fontSize = 14;
        bitmap.fontFace = 'Courier New, monospace';
        bitmap.textColor = '#1a1a1a';

        switch (this._screenMode) {
            case 'home':     this.drawHomeScreen(bitmap); break;
            case 'dial':     this.drawDialScreen(bitmap); break;
            case 'contacts': this.drawContactsScreen(bitmap); break;
            case 'calling':  this.drawCallingScreen(bitmap); break;
        }
    };

    Scene_PublicPhone.prototype.drawHomeScreen = function(bitmap) {
        const credits = $gameSystem.getPhoneCredits();

        bitmap.fontSize = 16;
        bitmap.fontBold = true;
        bitmap.drawText(getText('Title'), 0, 8, 250, 22, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 13;
        bitmap.drawText(getText('Credits') + ': €' + goldToEuros(credits), 0, 42, 250, 20, 'center');

        bitmap.fontSize = 11;
        bitmap.drawText(getText('Dial Prompt'), 0, 78, 250, 20, 'center');
        bitmap.drawText(getText('List Hint'), 0, 98, 250, 20, 'center');

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Exit Hint'), 0, 145, 250, 20, 'center');
    };

    Scene_PublicPhone.prototype.drawDialScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('Dial Number'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 18;
        const displayNumber = this._dialedNumber || '';
        const cursor = (this._cursorBlink < 30) ? '_' : ' ';
        bitmap.drawText(displayNumber + cursor, 0, 40, 250, 24, 'center');

        bitmap.fontSize = 11;
        bitmap.drawText(getText('Enter Number And'), 0, 100, 250, 20, 'center');
        bitmap.drawText(getText('Press Call Button'), 0, 115, 250, 20, 'center');

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Delete And Cancel'), 0, 145, 250, 20, 'center');
    };

    Scene_PublicPhone.prototype.drawContactsScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('Contacts'), 0, 5, 250, 20, 'center');
        bitmap.fontBold = false;

        const contacts = Object.values($gameSystem.getContacts());

        if (contacts.length === 0) {
            bitmap.fontSize = 12;
            bitmap.drawText(getText('No Contacts'), 0, 60, 250, 20, 'center');
        } else {
            bitmap.fontSize = 11;
            let y = 30;
            const maxDisplay = 4;
            const start = Math.max(0, Math.min(this._selectedContactIndex - 1, contacts.length - maxDisplay));
            const end = Math.min(contacts.length, start + maxDisplay);

            for (let i = start; i < end; i++) {
                const contact = contacts[i];
                const prefix = (i === this._selectedContactIndex) ? '> ' : '  ';
                bitmap.fontSize = 11;
                bitmap.drawText(prefix + contact.name, 5, y, 230, 20, 'left');
                bitmap.fontSize = 9;
                bitmap.drawText(contact.number, 15, y + 12, 220, 20, 'left');
                y += 28;
            }

            bitmap.fontSize = 10;
            bitmap.drawText(getText('Call And Back'), 0, 150, 250, 20, 'center');
        }
    };

    Scene_PublicPhone.prototype.drawCallingScreen = function(bitmap) {
        bitmap.fontSize = 14;
        bitmap.fontBold = true;
        bitmap.drawText(getText('Calling'), 0, 20, 250, 20, 'center');
        bitmap.fontBold = false;

        bitmap.fontSize = 16;
        bitmap.drawText(this._currentCallName || T('Hexphone.unknownCaller'), 0, 50, 250, 20, 'center');

        bitmap.fontSize = 12;
        bitmap.drawText(this._dialedNumber || '', 0, 75, 250, 20, 'center');

        if (this._inCall) {
            const duration = Math.floor(this._callDuration);
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const durationStr = minutes.toString().padStart(2, '0') + ':' +
                                seconds.toString().padStart(2, '0');

            bitmap.fontSize = 18;
            bitmap.drawText(durationStr, 0, 100, 250, 24, 'center');

            if (!this._freeCall) {
                const cost = Math.floor(this._callDuration * callCostPerSecond);
                bitmap.fontSize = 11;
                bitmap.drawText(getText('Cost') + ': €' + goldToEuros(cost), 0, 130, 250, 20, 'center');
            }
        } else {
            bitmap.fontSize = 11;
            bitmap.drawText(getText('Connecting'), 0, 105, 250, 20, 'center');
        }

        bitmap.fontSize = 10;
        bitmap.drawText(getText('Press To Hang Up'), 0, 150, 250, 20, 'center');
    };

    //-------------------------------------------------------------------------
    // Button and key handling
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.onDocumentKeyDown = function(event) {
        if (SceneManager._scene !== this || this._closing) return;
        const key = event.key;
        if (key >= '0' && key <= '9') {
            this.onNumberButton(key);
        } else if (key === '*' || key === 'Backspace' || key === 'Delete') { // i18n-ignore: DOM key names
            this.onNumberButton('*');
        } else if (key === '#') {
            this.onNumberButton('#');
        }
    };

    Scene_PublicPhone.prototype.onNumberButton = function(value) {
        if (this._closing) return;
        this.playButtonSound();

        switch (this._screenMode) {
            case 'home':
                if (value >= '0' && value <= '9') {
                    this._screenMode = 'dial';
                    this._dialedNumber = value;
                    this.refreshScreen();
                }
                break;

            case 'dial':
                if (value === '*') {
                    this._dialedNumber = this._dialedNumber.slice(0, -1);
                } else if (value !== '#') {
                    if (this._dialedNumber.length < 15) this._dialedNumber += value;
                }
                this.refreshScreen();
                break;

            case 'contacts': {
                const contacts = Object.values($gameSystem.getContacts());
                if (contacts.length === 0) break;
                if (value === '2') {
                    this._selectedContactIndex = (this._selectedContactIndex + 1) % contacts.length;
                } else if (value === '8') {
                    this._selectedContactIndex = (this._selectedContactIndex - 1 + contacts.length) % contacts.length;
                }
                this.refreshScreen();
                break;
            }

            case 'calling':
                if (value === '#') this.endCall();
                break;
        }
    };

    Scene_PublicPhone.prototype.onCallButton = function() {
        if (this._closing) return;
        this.playButtonSound();

        if (this._screenMode === 'dial' && this._dialedNumber) {
            const contact = $gameSystem.findContactByNumber(this._dialedNumber);
            if (contact) {
                this.initiateCall(contact.number, contact.name, contact.commonEventId);
            } else {
                this.initiateCall(this._dialedNumber, T('Hexphone.unknownCaller'), 0);
            }
        } else if (this._screenMode === 'contacts') {
            this.callSelectedContact();
        } else if (this._screenMode === 'home') {
            this._screenMode = 'dial';
            this._dialedNumber = '';
            this.refreshScreen();
        }
    };

    Scene_PublicPhone.prototype.onListButton = function() {
        if (this._closing) return;
        this.playButtonSound();

        switch (this._screenMode) {
            case 'home':
            case 'dial':
                this._screenMode = 'contacts';
                this._selectedContactIndex = 0;
                this._dialedNumber = '';
                this.refreshScreen();
                break;
            case 'contacts':
                this.callSelectedContact();
                break;
        }
    };

    Scene_PublicPhone.prototype.onEndButton = function() {
        if (this._closing) return;
        this.playButtonSound();

        if (this._screenMode === 'calling') {
            this.endCall();
            return;
        }

        if (this._screenMode === 'dial' || this._screenMode === 'contacts') {
            this._screenMode = 'home';
            this._dialedNumber = '';
            this.refreshScreen();
        } else if (this._screenMode === 'home') {
            this.safeClose();
        }
    };

    Scene_PublicPhone.prototype.callSelectedContact = function() {
        const contacts = Object.values($gameSystem.getContacts());
        if (contacts.length > 0) {
            const contact = contacts[this._selectedContactIndex];
            if (contact) this.initiateCall(contact.number, contact.name, contact.commonEventId);
        }
    };

    //-------------------------------------------------------------------------
    // Call logic (outgoing only)
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.initiateCall = function(number, name, commonEventId) {
        const eventId = Number(commonEventId) || 0;
        if (eventId === 0 && $gameSystem.getPhoneCredits() < callCostPerSecond) {
            this.playErrorSound();
            return;
        }

        this._screenMode = 'calling';
        this._dialedNumber = number;
        this._currentCallName = name;
        this._currentCallEventId = eventId;
        this._inCall = false;
        this._freeCall = eventId > 0;
        this._callDuration = 0;

        this.playDialTone();

        this.clearConnectTimeout();
        this._connectTimeout = setTimeout(() => {
            this._connectTimeout = null;
            if (this._closing || this._screenMode !== 'calling') return;
            this.playConnectSound();
            if (this._currentCallEventId > 0) {
                $gameSystem.addCallToHistory(this._dialedNumber, this._currentCallName, 0);
                this.exitToMapWithEvent(this._currentCallEventId);
            } else {
                this._inCall = true;
                this.startCallTimer();
                this.refreshScreen();
            }
        }, 1500);

        this.refreshScreen();
    };

    Scene_PublicPhone.prototype.startCallTimer = function() {
        this.clearCallTimer();
        this._callTimer = setInterval(() => {
            if (this._closing) {
                this.clearCallTimer();
                return;
            }
            if (this._inCall) {
                this._callDuration++;
                if (!this._freeCall && !$gameSystem.consumeCredits(callCostPerSecond)) {
                    this.endCall();
                    this.playErrorSound();
                    return;
                }
                this.refreshScreen();
            }
        }, 1000);
    };

    Scene_PublicPhone.prototype.clearCallTimer = function() {
        if (this._callTimer) {
            clearInterval(this._callTimer);
            this._callTimer = null;
        }
    };

    Scene_PublicPhone.prototype.clearConnectTimeout = function() {
        if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }
    };

    Scene_PublicPhone.prototype.endCall = function() {
        this.clearCallTimer();
        this.clearConnectTimeout();

        if (this._callDuration > 0) {
            $gameSystem.addCallToHistory(this._dialedNumber, this._currentCallName, this._callDuration);
        }

        this._inCall = false;
        this._freeCall = false;
        this._screenMode = 'home';
        this._dialedNumber = '';
        this._currentCallName = '';
        this._currentCallEventId = 0;
        this._callDuration = 0;

        this.playHangupSound();
        this.refreshScreen();
    };

    //-------------------------------------------------------------------------
    // Scene exit paths (all guarded against double execution)
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.safeClose = function() {
        if (this._closing) return;
        this._closing = true;
        this.popScene();
    };

    Scene_PublicPhone.prototype.exitToMapWithEvent = function(commonEventId) {
        if (this._closing) return;
        this._closing = true;
        $gameTemp.reserveCommonEvent(commonEventId);
        SceneManager.goto(Scene_Map);
    };

    //-------------------------------------------------------------------------
    // Update
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._closing) return;

        this._screenAnimation++;
        this.updateEngineInput();
        this.updateCursorBlink();
        this.updateAmbient();
        this.syncKeypadCursor();
    };

    Scene_PublicPhone.prototype.updateEngineInput = function() {
        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            this.onEndButton();
            return;
        }
        // On the idle screen and while a number is dialled the keys are the
        // controls: the directions walk them and Confirm presses the one under
        // the cursor, the same as a click on it.
        if (this.usesKeypadCursor()) {
            const dir = window.UINav ? window.UINav.navDir() : null;
            if (dir) {
                this.stepKeypadCursor(dir);
                return;
            }
            if (Input.isTriggered('ok')) {
                const key = this._buttons[this._padKeyIndex];
                if (key) key.onClick();
            }
            return;
        }
        if (Input.isTriggered('ok')) {
            if (this._screenMode === 'dial') {
                this.onCallButton();
            } else {
                this.onListButton();
            }
            return;
        }

        if (Input.isRepeated('down')) {
            this.navigateList(1);
        } else if (Input.isRepeated('up')) {
            this.navigateList(-1);
        }
    };

    Scene_PublicPhone.prototype.usesKeypadCursor = function() {
        const mode = this._screenMode;
        return (mode === 'home' || mode === 'dial') && (this._buttons || []).length > 0;
    };

    // CALL LIST END over the twelve keys, three across: one grid step walks
    // all fifteen and never wraps into another column.
    Scene_PublicPhone.prototype.stepKeypadCursor = function(dir) {
        const count = this._buttons.length;
        const at = this._padKeyIndex == null ? 1 : this._padKeyIndex;
        const next = window.UINav ? window.UINav.gridStep(at, dir, count, 3) : at;
        if (next === at) return;
        this._padKeyIndex = next;
        this.playButtonSound();
        this.syncKeypadCursor();
    };

    Scene_PublicPhone.prototype.syncKeypadCursor = function() {
        if (this._padKeyIndex == null) this._padKeyIndex = 1;
        const on = this.usesKeypadCursor();
        (this._buttons || []).forEach((button, i) => {
            if (button && typeof button.setFocused === 'function') {
                button.setFocused(on && i === this._padKeyIndex);
            }
        });
    };

    Scene_PublicPhone.prototype.navigateList = function(delta) {
        if (this._screenMode === 'contacts') {
            this.onNumberButton(delta > 0 ? '2' : '8');
        }
    };

    Scene_PublicPhone.prototype.updateCursorBlink = function() {
        if (this._screenMode === 'dial') {
            const oldBlink = this._cursorBlink;
            this._cursorBlink = (this._cursorBlink + 1) % 60;
            if (Math.floor(oldBlink / 30) !== Math.floor(this._cursorBlink / 30)) {
                this.refreshScreen();
            }
        } else {
            this._cursorBlink = 0;
        }
    };

    Scene_PublicPhone.prototype.updateAmbient = function() {
        this._contentSprite.opacity = (this._screenAnimation % 120 === 0) ? 250 : 255;
    };

    //-------------------------------------------------------------------------
    // Sounds
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.playButtonSound = function() {
        playSeSafe('Cursor1', 60, 120);
    };

    Scene_PublicPhone.prototype.playErrorSound = function() {
        playSeSafe('Buzzer1', 70, 100);
    };

    Scene_PublicPhone.prototype.playDialTone = function() {
        playSeSafe('Decision1', 70, 90);
    };

    Scene_PublicPhone.prototype.playConnectSound = function() {
        playSeSafe('Decision2', 70, 120);
    };

    Scene_PublicPhone.prototype.playHangupSound = function() {
        playSeSafe('Cancel2', 70, 90);
    };

    Scene_PublicPhone.prototype.playPowerOnSound = function() {
        playSeSafe('Computer', 70, 150); // i18n-ignore: SE filename
    };

    //-------------------------------------------------------------------------
    // Teardown
    //-------------------------------------------------------------------------

    Scene_PublicPhone.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        this._closing = true;
        this.clearCallTimer();
        this.clearConnectTimeout();
        if (this._keyDownHandler) {
            document.removeEventListener('keydown', this._keyDownHandler);
            this._keyDownHandler = null;
        }
        AudioManager.stopSe();
        playSeSafe('Cancel1', 70, 80);
    };

    // Export for extension plugins
    window.Scene_PublicPhone = Scene_PublicPhone;

    //=============================================================================
    // Plugin commands
    //=============================================================================

    PluginManager.registerCommand(pluginName, "openPublicPhone", () => {
        SceneManager.push(Scene_PublicPhone);
    });

})();
