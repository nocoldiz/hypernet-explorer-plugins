/*:
 * @target MZ
 * @plugindesc Arcade Boot Sequence Cart v1.2.0 (Fixed & Enhanced)
 * @author Omni-Lex
 * @url 
 * @help
 * ============================================================================
 * Arcade Boot Sequence Cart
 * ============================================================================
 * * A realistic arcade cabinet boot sequence game cart that simulates
 * authentic arcade hardware startup procedures with scrolling terminal output.
 * * v1.2.0 Changes:
 * - Fixed a bug where the boot sequence could get stuck on the first message.
 * - Added a playable state after boot-up with a movable '@' character.
 * * Distributed by: ESOTERIC HEAVY INDUSTRIES
 * * This cart must be loaded AFTER the ArcadeCabinetManager plugin.
 * * The boot sequence includes:
 * - ROM check
 * - RAM test
 * - Sound chip initialization
 * - Video system test
 * - Security check
 * - System initialization
 * */

(() => {
    'use strict';
    
    const cartId = 'BootSequence';
    const cartName = 'SYSTEM BOOT';
    
    // Boot sequence stages. The lines a stage prints live in
    // Arcade.boot.lines.<stage name>, one array per language.
    const bootLines = (name) => {
        const list = (typeof T.list === 'function') ? T.list('Arcade.boot.lines.' + name) : null;
        return Array.isArray(list) ? list : [];
    };

    const bootStages = [
        { 
            name: 'POST', 
            duration: 1000, 
            get messages() { return bootLines('POST'); }
        },
        { 
            name: 'ROM_CHECK', 
            duration: 2500, 
            get messages() { return bootLines('ROM_CHECK'); }
        },
        { 
            name: 'RAM_TEST', 
            duration: 3000, 
            get messages() { return bootLines('RAM_TEST'); }
        },
        { 
            name: 'SOUND_INIT', 
            duration: 1800, 
            get messages() { return bootLines('SOUND_INIT'); }
        },
        { 
            name: 'VIDEO_TEST', 
            duration: 2200, 
            get messages() { return bootLines('VIDEO_TEST'); }
        },
        { 
            name: 'SECURITY', 
            duration: 1200, 
            get messages() { return bootLines('SECURITY'); }
        },
        { 
            name: 'SYSTEM_INIT', 
            duration: 2000, 
            get messages() { return bootLines('SYSTEM_INIT'); }
        },
        { 
            name: 'COMPLETE', 
            duration: 2000, 
            get messages() { return bootLines('COMPLETE'); }
        }
    ];
    
    class BootSequenceCart {
        constructor() {
            this._container = null;
            this._graphics = null;
            this._currentStage = 0;
            this._stageTimer = 0;
            this._currentMessageIndex = 0;
            this._isDemo = false;
            this._bootComplete = false;
            this._terminalLines = [];
            this._maxTerminalLines = 25;
            this._messageTimer = 0;
            this._messageDelay = 200; // ms between messages
            this._glitchTimer = 0;
            this._audioContext = null;
            this._masterGain = null;
            this._hexDump = [];
            this._cursorBlink = 0;
            
            // --- NEW --- Player character properties
            this._player = null;
            this._playerSpeed = 4;
            
            // Generate random hex values for display
            for (let i = 0; i < 256; i++) {
                this._hexDump.push(Math.floor(Math.random() * 256));
            }
            
            // Initialize audio context
            this.initializeAudio();
        }
        
        initializeAudio() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this._audioContext = new AudioContext();
                
                // Create master gain for volume control
                this._masterGain = this._audioContext.createGain();
                this._masterGain.gain.value = 0.3; // Lower master volume
                this._masterGain.connect(this._audioContext.destination);
            } catch (e) {
                console.warn('Web Audio API not supported:', e);
            }
        }
        
        // Sound generation methods (keeping the same as before)
        playPowerOnSound() {
            if (!this._audioContext) return;
            const now = this._audioContext.currentTime;
            const osc = this._audioContext.createOscillator();
            const gain = this._audioContext.createGain();
            const filter = this._audioContext.createBiquadFilter();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(30, now);
            osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
            filter.type = 'lowpass';
            filter.frequency.value = 200;
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this._masterGain);
            osc.start(now);
            osc.stop(now + 0.5);
            const whine = this._audioContext.createOscillator();
            const whineGain = this._audioContext.createGain();
            whine.type = 'sine';
            whine.frequency.setValueAtTime(15000, now);
            whine.frequency.exponentialRampToValueAtTime(8000, now + 1);
            whineGain.gain.setValueAtTime(0.05, now);
            whineGain.gain.exponentialRampToValueAtTime(0.001, now + 1);
            whine.connect(whineGain);
            whineGain.connect(this._masterGain);
            whine.start(now);
            whine.stop(now + 1);
        }
        
        playBeep(frequency = 1000, duration = 0.1) {
            if (!this._audioContext) return;
            const now = this._audioContext.currentTime;
            const osc = this._audioContext.createOscillator();
            const gain = this._audioContext.createGain();
            osc.type = 'square';
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
            gain.gain.setValueAtTime(0.1, now + duration - 0.01);
            gain.gain.linearRampToValueAtTime(0, now + duration);
            osc.connect(gain);
            gain.connect(this._masterGain);
            osc.start(now);
            osc.stop(now + duration);
        }
        
        playTypewriterSound() {
            if (!this._audioContext) return;
            const now = this._audioContext.currentTime;
            const osc = this._audioContext.createOscillator();
            const gain = this._audioContext.createGain();
            osc.type = 'square';
            osc.frequency.value = 800 + Math.random() * 400;
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.connect(gain);
            gain.connect(this._masterGain);
            osc.start(now);
            osc.stop(now + 0.05);
        }
        
        playSuccessSound() {
            if (!this._audioContext) return;
            const now = this._audioContext.currentTime;
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
            notes.forEach((freq, i) => {
                const osc = this._audioContext.createOscillator();
                const gain = this._audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i * 0.1);
                gain.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.02);
                gain.gain.setValueAtTime(0.2, now + i * 0.1 + 0.08);
                gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.15);
                osc.connect(gain);
                gain.connect(this._masterGain);
                osc.start(now + i * 0.1);
                osc.stop(now + i * 0.1 + 0.15);
            });
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
            this._graphics = new PIXI.Graphics();
            this._container.addChild(this._graphics);
            this.createTextObjects();
            
            this._terminalLines = [];
            this.addTerminalLine('> INITIALIZING SYSTEM...');
            this.addTerminalLine('');
            
            this._currentStage = 0;
            this._stageTimer = 0;
            this._currentMessageIndex = 0;
            this._messageTimer = 0;
            this._bootComplete = false;
            this._player = null;

            // --- FIX --- Start the update loop handler directly.
            // This prevents the sequence from getting stuck if the container is already on stage.
            this._updateHandler = this.update.bind(this);
            Graphics.app.ticker.add(this._updateHandler);

            this._container.on('removed', () => {
                Graphics.app.ticker.remove(this._updateHandler);
            });

            // end() closes the audio context; a replay must rebuild it, otherwise
            // creating oscillators on a closed context throws.
            if (!this._audioContext || this._audioContext.state === 'closed') {
                this.initializeAudio();
            }

            if (this._audioContext && this._audioContext.state === 'suspended') {
                this._audioContext.resume();
            }

            this.playPowerOnSound();
        }

        // Manager teardown contract: stop the ticker on cancel-exit as well
        // (the 'removed' handler only fires on full scene teardown).
        stop() {
            if (this._updateHandler) {
                Graphics.app.ticker.remove(this._updateHandler);
            }
        }
        
        createTextObjects() {
            const font = ArcadeManager.getArcadeFont();
            this._terminalTexts = [];
            for (let i = 0; i < this._maxTerminalLines; i++) {
                const text = new PIXI.Text('', {
                    fontFamily: font,
                    fontSize: 14,
                    fill: '#00ff00',
                    align: 'left'
                });
                text.position.set(50, 50 + i * 18);
                this._container.addChild(text);
                this._terminalTexts.push(text);
            }
            
            this._hexText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 10,
                fill: '#008800',
                align: 'left'
            });
            this._hexText.position.set(50, Graphics.height - 120);
            this._container.addChild(this._hexText);
            
            this._progressText = new PIXI.Text('', {
                fontFamily: font,
                fontSize: 12,
                fill: '#ffff00',
                align: 'right'
            });
            this._progressText.position.set(Graphics.width - 200, 50);
            this._container.addChild(this._progressText);
        }
        
        addTerminalLine(text) {
            this._terminalLines.push(text);
            if (this._terminalLines.length > this._maxTerminalLines) {
                this._terminalLines.shift();
            }
            this.updateTerminalDisplay();
            if (text.trim().length > 0) {
                this.playTypewriterSound();
            }
        }
        
        updateTerminalDisplay() {
            for (let i = 0; i < this._maxTerminalLines; i++) {
                if (i < this._terminalLines.length) {
                    let line = this._terminalLines[i];
                    if (i === this._terminalLines.length - 1 && line.trim().length > 0) {
                        if (this._cursorBlink < 30) {
                            line += '_';
                        }
                    }
                    this._terminalTexts[i].text = line;
                    if (line.includes('OK')) {
                        this._terminalTexts[i].style.fill = '#00ff00';
                    } else if (line.includes('ERROR') || line.includes('FAIL')) {
                        this._terminalTexts[i].style.fill = '#ff0000';
                    } else if (line.includes('COMPLETE') || line.includes('READY')) {
                        this._terminalTexts[i].style.fill = '#ffff00';
                    } else if (line.startsWith('>')) {
                        this._terminalTexts[i].style.fill = '#00ffff';
                    } else {
                        this._terminalTexts[i].style.fill = '#00ff00';
                    }
                } else {
                    this._terminalTexts[i].text = '';
                }
            }
        }
        
        update(delta) {
            this._cursorBlink = (this._cursorBlink + 1) % 60;
            
            // --- MODIFIED --- Handle post-boot logic
            if (this._bootComplete) {
                if (this._player) {
                    this.updatePlayer();
                }
                const input = ArcadeManager.getInput();
                if (input.action) {
                    this.end();
                }
                return;
            }
            
            const currentStage = bootStages[this._currentStage];
            this._stageTimer += delta * 16.67;
            this._messageTimer += delta * 16.67;
            
            if (this._messageTimer >= this._messageDelay && this._currentMessageIndex < currentStage.messages.length) {
                this.addTerminalLine(currentStage.messages[this._currentMessageIndex]);
                this._currentMessageIndex++;
                this._messageTimer = 0;
                
                const message = currentStage.messages[this._currentMessageIndex - 1];
                if (message.includes('OK') || message.includes('COMPLETE')) {
                    this.playBeep(800, 0.05);
                } else if (message.includes('READY')) {
                    this.playSuccessSound();
                }
            }
            
            const stageProgress = Math.min(this._stageTimer / currentStage.duration, 1);
            if (this._progressText) {
                this._progressText.text = T('Arcade.boot.stage', { stage: this._currentStage + 1, total: bootStages.length, pct: Math.floor(stageProgress * 100) });
            }
            
            if (Math.random() < 0.005) {
                this._glitchTimer = 5;
                this.addTerminalLine('█▓▒░▒▓█');
            }
            
            if (this._glitchTimer > 0) {
                this._glitchTimer--;
                this._terminalTexts.forEach(text => {
                    if (Math.random() < 0.3) {
                        text.style.fill = '#ff0000';
                    }
                });
            }
            
            if (this._stageTimer >= currentStage.duration) {
                this._currentStage++;
                this._stageTimer = 0;
                this._currentMessageIndex = 0;
                this._messageTimer = 0;
                this.addTerminalLine('');
                
                if (this._currentStage >= bootStages.length) {
                    this._bootComplete = true;
                    this.onBootComplete();
                }
            }
            
            this.updateHexDump();
            if (this._cursorBlink % 15 === 0) {
                this.updateTerminalDisplay();
            }
        }
        
        updateHexDump() {
            if (!this._hexText) return;
            let hexString = '';
            const offset = Math.floor(this._stageTimer / 100) % 16;
            hexString += 'MEM DUMP: ';
            for (let i = 0; i < 24; i++) {
                const value = this._hexDump[(offset + i) % this._hexDump.length];
                hexString += value.toString(16).padStart(2, '0').toUpperCase() + ' ';
                if ((i + 1) % 8 === 0) hexString += ' ';
            }
            this._hexText.text = hexString;
        }

        // --- NEW --- Handles the movable '@' character state
        updatePlayer() {
            if (!this._player) return;

            const input = ArcadeManager.getInput();
            if (input.up) this._player.y -= this._playerSpeed;
            if (input.down) this._player.y += this._playerSpeed;
            if (input.left) this._player.x -= this._playerSpeed;
            if (input.right) this._player.x += this._playerSpeed;

            // Keep player within screen bounds
            const halfW = this._player.width / 2;
            const halfH = this._player.height / 2;
            this._player.x = Math.max(halfW, Math.min(this._player.x, Graphics.width - halfW));
            this._player.y = Math.max(halfH, Math.min(this._player.y, Graphics.height - halfH));
        }
        
        // --- MODIFIED --- This now sets up the playable state
        onBootComplete() {
            // Clear boot-related text elements
            if (this._hexText) this._container.removeChild(this._hexText);
            if (this._progressText) this._container.removeChild(this._progressText);
            this._hexText = null;
            this._progressText = null;

            this._terminalLines = [];
            this.updateTerminalDisplay(); // Clears the display

            // Add final instructions
            this.addTerminalLine('> SYSTEM BOOT COMPLETE');
            
            // Create the playable character
            const font = ArcadeManager.getArcadeFont();
            this._player = new PIXI.Text('@', {
                fontFamily: font,
                fontSize: 24,
                fill: '#ffd700', // Golden color
                align: 'center'
            });
            this._player.anchor.set(0.5);
            this._player.position.set(Graphics.width / 2, Graphics.height / 2);
            this._container.addChild(this._player);
            
            this.playSuccessSound();
        }
        
        end() {
            this._container.removeChildren();
            Graphics.app.ticker.remove(this._updateHandler);
            
            if (this._audioContext && this._audioContext.state !== 'closed') {
                this._audioContext.close();
            }
            
            ArcadeManager.endGame(0);
        }
    }
    
    const bootCart = new BootSequenceCart();
    
    if (window.ArcadeManager) {
        ArcadeManager.registerGame(cartId, cartName, bootCart);
    } else {
        console.error('ArcadeCabinetManager not found! Load it before this cart.');
    }
    
})();   