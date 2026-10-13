//=============================================================================
// RPG Maker MZ - Procedural Music Player Plugin
//=============================================================================

/*:
 * @target MZ
 * @plugindesc High-fidelity interactive retro stick MP3 player UI in Scene_MusicPlayer using PixiJS.
 * @author Omni-Lex
 *
 * @command openPlayer
 * @text Open Music Player
 * @desc Opens the retro USB stick MP3 player interface.
 *
 * @help
 * This plugin implements a classic backlit blue LCD USB stick MP3 Player
 * for Scene_MusicPlayer, fully integrated with procedural music synthesizers
 * and MIDI playback.
 *
 * ===== Plugin Commands =====
 * ProceduralMusicPlayer openPlayer - Opens the music player scene.
 */

(() => {
    // =========================================================================
    // What the player can actually play
    // =========================================================================
    // The genres, the Strudel scripts and the MIDI files are all voiced by
    // ProceduralMusicGenerator (window.ProceduralMusic). With that plugin off,
    // picking one used to stop the music and then play nothing, so they are
    // only offered while the generator is loaded. Plain .ogg tracks always are.
    function generatorLoaded() {
        return !!window.ProceduralMusic;
    }

    // Built-in genre ids, shown only while the generator can voice them.
    function builtInGenres() {
        if (!generatorLoaded()) return [];
        return [
            { name: 'Auto', type: 'system' },  // i18n-ignore  genre id
            { name: 'Battle', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Dungeon', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Exploration', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Village', type: 'biome' },  // i18n-ignore  genre id
            { name: 'City', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Cave', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Desert', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Ice', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Digital', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Eldritch', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Industrial', type: 'biome' },  // i18n-ignore  genre id
            { name: 'Ethereal', type: 'biome' }  // i18n-ignore  genre id
        ];
    }

    // The folder index.html sits in: the working directory may be anywhere.
    function gameRoot() {
        try {
            if (typeof process === 'object' && process.mainModule && process.mainModule.filename) {
                return require('path').dirname(process.mainModule.filename);
            }
            return process.cwd();
        } catch (e) {
            return '';
        }
    }

    // A track entry's own volume. AudioManager.bgmVolume (the Options music
    // slider) is applied on top of it by the engine, so passing the slider in
    // here applied it twice.
    const TRACK_VOLUME = 90;

    // =========================================================================
    // Scene_MusicPlayer
    // =========================================================================

    function Scene_MusicPlayer() {
        this.initialize(...arguments);
    }

    Scene_MusicPlayer.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_MusicPlayer.prototype.constructor = Scene_MusicPlayer;

    Scene_MusicPlayer.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        this.makeItemList();
        this._selectedIndex = 0;
        this._topIndex = 0;
        this._playSeconds = 0;
        this._lastTickTime = Date.now();
    };

    Scene_MusicPlayer.prototype.makeItemList = function () {
        this._data = builtInGenres();

        if (typeof require !== 'undefined') {
            const fs = require('fs');
            const path = require('path');
            const showStrudel = generatorLoaded() && !window.ProceduralMusic.useClassicSequencer;

            const scanDirectoryRecursive = (dirPath, relativeTo = '') => {
                let results = [];
                if (!fs.existsSync(dirPath)) return results;
                
                const list = fs.readdirSync(dirPath);
                list.forEach(file => {
                    const fullPath = path.join(dirPath, file);
                    const relPath = relativeTo ? relativeTo + '/' + file : file;
                    const stat = fs.statSync(fullPath);
                    
                    if (stat && stat.isDirectory()) {
                        // Recursively scan subfolder
                        results = results.concat(scanDirectoryRecursive(fullPath, relPath));
                    } else {
                        const ext = path.extname(file).toLowerCase();
                        if (ext === '.ogg') {
                            const name = relPath.replace(/\.ogg$/i, '');
                            results.push({ name: name, type: 'ogg' });
                        } else if (ext === '.js' && showStrudel) {
                            const name = relPath.replace(/\.js$/i, '');
                            results.push({ name: name, type: 'strudel' });
                        } else if ((ext === '.mid' || ext === '.midi') && generatorLoaded()) {
                            const name = relPath.replace(/\.midi?$/i, '');
                            results.push({ name: name, type: 'midi' });
                        }
                    }
                });
                return results;
            };

            try {
                const bgmDir = path.join(gameRoot(), 'audio', 'bgm');
                const scannedFiles = scanDirectoryRecursive(bgmDir);
                
                scannedFiles.forEach(item => {
                    if (item.name.toLowerCase().startsWith('biomes/')) {
                        // Skip internal biome pregenerated scripts
                        return;
                    }
                    if (!this._data.find(d => d.name === item.name)) {
                        this._data.push(item);
                    }
                });
            } catch (e) {
                console.error("Scene_MusicPlayer: Failed to scan BGM directory recursively", e);
            }

            // Sort list: Auto first, then Biomes, then OGG, then MIDI, then JS
            this._data.sort((a, b) => {
                const typeOrder = { 'system': 0, 'biome': 1, 'ogg': 2, 'midi': 3, 'strudel': 4 };
                if (typeOrder[a.type] !== typeOrder[b.type]) {
                    return typeOrder[a.type] - typeOrder[b.type];
                }
                return a.name.localeCompare(b.name);
            });
        }

        // Auto-select currently playing track if any
        if (window.ProceduralMusic && window.ProceduralMusic.currentGenre && window.ProceduralMusic._isStarted) {
            const idx = this._data.findIndex(item => item.name === window.ProceduralMusic.currentGenre);
            if (idx >= 0) {
                this._selectedIndex = idx;
            }
        } else if (AudioManager._currentBgm && AudioManager._bgmBuffer && AudioManager._bgmBuffer.isPlaying()) {
            const idx = this._data.findIndex(item => item.name === AudioManager._currentBgm.name);
            if (idx >= 0) {
                this._selectedIndex = idx;
            }
        }
    };

    Scene_MusicPlayer.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        this.createMp3Player();
    };

    Scene_MusicPlayer.prototype.createMp3Player = function () {
        // Create full screen PIXI container for player
        this._mp3Player = new PIXI.Container();
        this.addChild(this._mp3Player);

        const px = (Graphics.width - 780) / 2;
        const py = (Graphics.height - 340) / 2;
        const pw = 780;
        const ph = 340;

        // Shifted left from 645 to 615 to clear the USB cap seam perfectly
        const wheelX = px + 615;
        const wheelY = py + 170;
        const btnDist = 38;

        this._playerCoords = { px, py, pw, ph, wheelX, wheelY, btnDist };

        // 1. Draw static background casing and styling
        const g = new PIXI.Graphics();
        
        // Dark outer capsule casing
        g.beginFill(0x131315);
        g.lineStyle(5, 0x333338);
        g.drawRoundedRect(px, py, pw, ph, 170);
        g.endFill();

        // Silver bezel highlight
        g.lineStyle(2, 0x9c9c9c, 0.45);
        g.drawRoundedRect(px + 4, py + 4, pw - 8, ph - 8, 166);

        // Key-ring loop on left
        g.lineStyle(6, 0x7a7a7a);
        g.drawCircle(px + 45, py + ph / 2, 26);
        g.beginFill(0x000000);
        g.drawCircle(px + 45, py + ph / 2, 19);
        g.endFill();

        // USB seam on right end
        g.lineStyle(3, 0x09090b);
        g.moveTo(px + pw - 90, py + 12);
        g.lineTo(px + pw - 90, py + ph - 12);

        // Inner Brushed Grey plate
        g.beginFill(0x282a2d);
        g.lineStyle(2, 0x484b4f);
        g.drawRoundedRect(px + 105, py + 35, pw - 230, ph - 70, 75);
        g.endFill();

        // LCD Deep Blue frame
        g.beginFill(0x000c18);
        g.lineStyle(2, 0x51555a);
        g.drawRect(px + 185, py + 70, 360, 200);
        g.endFill();

        // LCD back-light color
        g.beginFill(0x0055dd);
        g.drawRect(px + 189, py + 74, 352, 192);
        g.endFill();

        // Add scanline pixel grid matrix for extreme realism
        g.lineStyle(1, 0x000000, 0.09);
        for (let sy = py + 74; sy < py + 266; sy += 4) {
            g.moveTo(px + 189, sy);
            g.lineTo(px + 541, sy);
        }
        for (let sx = px + 189; sx < px + 541; sx += 4) {
            g.moveTo(sx, py + 74);
            g.lineTo(sx, py + 266);
        }

        this._mp3Player.addChild(g);

        // 2. Setup interactive custom buttons
        this.createInteractiveButtons(px, py, wheelX, wheelY, btnDist);

        // 3. Setup LCD text items
        
        // LCD Mask for Marquee Text
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawRect(px + 195, py + 80, 340, 24);
        mask.endFill();
        this._mp3Player.addChild(mask);

        // Scrolling Marquee Container and Text
        this._marqueeContainer = new PIXI.Container();
        this._marqueeContainer.mask = mask;
        this._mp3Player.addChild(this._marqueeContainer);

        this._marqueeText = new PIXI.Text("", { fontFamily: 'Square', fontSize: 13, fill: '#ffffff' });
        this._marqueeText.resolution = 2;
        this._marqueeText.x = px + 195;
        this._marqueeText.y = py + 82;
        this._marqueeContainer.addChild(this._marqueeText);

        // Horizontal split line under Marquee
        const lineG = new PIXI.Graphics();
        lineG.lineStyle(1, 0x000000, 0.18);
        lineG.moveTo(px + 189, py + 106);
        lineG.lineTo(px + 541, py + 106);
        // Vertical split line
        lineG.moveTo(px + 395, py + 106);
        lineG.lineTo(px + 395, py + 266);
        this._mp3Player.addChild(lineG);

        // Visible tracklist container and mask
        this._listContainer = new PIXI.Container();
        this._mp3Player.addChild(this._listContainer);

        const listMask = new PIXI.Graphics();
        listMask.beginFill(0xffffff);
        listMask.drawRect(px + 192, py + 108, 198, 158);
        listMask.endFill();
        this._mp3Player.addChild(listMask);
        this._listContainer.mask = listMask;

        // Visible tracklist texts (5 items max)
        this._listTexts = [];
        for (let i = 0; i < 5; i++) {
            const t = new PIXI.Text("", { fontFamily: 'Square', fontSize: 12, fill: '#aaffff' });
            t.resolution = 2;
            t.x = px + 205;
            t.y = py + 114 + i * 28;
            t.interactive = true;
            t.buttonMode = true;
            
            // Mouse click/hover handlers for list entries
            const idxOffset = i;
            t.on('pointerdown', () => {
                const itemIndex = this._topIndex + idxOffset;
                if (itemIndex < this._data.length) {
                    this._selectedIndex = itemIndex;
                    this.playSelectedTrack();
                }
            });
            t.on('pointerover', () => {
                t.style.fill = '#ffffff';
            });
            t.on('pointerout', () => {
                const itemIndex = this._topIndex + idxOffset;
                if (this._selectedIndex !== itemIndex) {
                    t.style.fill = '#aaffff';
                }
            });

            this._listContainer.addChild(t);
            this._listTexts.push(t);
        }

        // Highlight bar for tracklist selection
        this._highlightBar = new PIXI.Graphics();
        this._mp3Player.addChild(this._highlightBar);

        // Right side dashboard text elements
        this._statusText = new PIXI.Text("STOPPED", { fontFamily: 'Square', fontSize: 12, fill: '#ffffff', fontWeight: 'bold' });
        this._statusText.resolution = 2;
        this._statusText.x = px + 405;
        this._statusText.y = py + 114;
        this._mp3Player.addChild(this._statusText);

        this._timerText = new PIXI.Text("00:00", { fontFamily: 'Square', fontSize: 19, fill: '#ffffff' });
        this._timerText.resolution = 2;
        this._timerText.x = px + 405;
        this._timerText.y = py + 138;
        this._mp3Player.addChild(this._timerText);

        this._formatText = new PIXI.Text("PROC SYNTH", { fontFamily: 'Square', fontSize: 9, fill: '#aaffff' });
        this._formatText.resolution = 2;
        this._formatText.x = px + 405;
        this._formatText.y = py + 168;
        this._mp3Player.addChild(this._formatText);

        // Dynamic Equalizer Visualizer Graphics
        this._eqGraphics = new PIXI.Graphics();
        this._mp3Player.addChild(this._eqGraphics);
    };

    Scene_MusicPlayer.prototype.createInteractiveButtons = function (px, py, wheelX, wheelY, btnDist) {
        // Create an interactive parent container for the D-pad centered at (wheelX, wheelY)
        this._dpadContainer = new PIXI.Container();
        this._dpadContainer.x = wheelX;
        this._dpadContainer.y = wheelY;
        this._mp3Player.addChild(this._dpadContainer);

        // Draw a dark base shadow behind the wedges for a premium indented look
        const baseShadow = new PIXI.Graphics();
        baseShadow.beginFill(0x131315);
        baseShadow.drawCircle(0, 0, 59.5);
        baseShadow.endFill();
        this._dpadContainer.addChild(baseShadow);

        // Draw a dark background rim
        const baseRim = new PIXI.Graphics();
        baseRim.beginFill(0x282a2d);
        baseRim.lineStyle(1.5, 0x131315);
        baseRim.drawCircle(0, 0, 58);
        baseRim.endFill();
        this._dpadContainer.addChild(baseRim);

        const innerR = 21;
        const outerR = 57.5;

        // Common draw function for hollow sector wedges
        const drawSector = (g, startAngleRad, endAngleRad, hover) => {
            g.clear();
            const color = hover ? 0x82858a : 0x5a5c60;
            const lineColor = 0x222224;
            g.beginFill(color);
            g.lineStyle(1.5, lineColor);
            
            // Draw outer arc
            g.arc(0, 0, outerR, startAngleRad, endAngleRad);
            // Draw line to inner arc
            g.lineTo(innerR * Math.cos(endAngleRad), innerR * Math.sin(endAngleRad));
            // Draw inner arc in reverse
            g.arc(0, 0, innerR, endAngleRad, startAngleRad, true);
            // Draw line back to outer arc start
            g.lineTo(outerR * Math.cos(startAngleRad), outerR * Math.sin(startAngleRad));
            g.endFill();
        };

        // --- SECTOR 1: VOL UP (Top) ---
        const secVolUp = new PIXI.Graphics();
        secVolUp.interactive = true;
        secVolUp.buttonMode = true;
        
        const updateVolUp = (hover) => {
            drawSector(secVolUp, -3 * Math.PI / 4, -Math.PI / 4, hover);
            // Draw plus symbol (+)
            secVolUp.lineStyle(2.5, 0xffffff);
            secVolUp.moveTo(-4, -39);
            secVolUp.lineTo(4, -39);
            secVolUp.moveTo(0, -43);
            secVolUp.lineTo(0, -35);
        };
        updateVolUp(false);
        secVolUp.on('pointerover', () => updateVolUp(true));
        secVolUp.on('pointerout', () => updateVolUp(false));
        secVolUp.on('pointerdown', () => {
            SoundManager.playCursor();
            AudioManager.bgmVolume = Math.min(100, AudioManager.bgmVolume + 5);
        });
        this._dpadContainer.addChild(secVolUp);

        // --- SECTOR 2: VOL DOWN (Bottom) ---
        const secVolDown = new PIXI.Graphics();
        secVolDown.interactive = true;
        secVolDown.buttonMode = true;
        
        const updateVolDown = (hover) => {
            drawSector(secVolDown, Math.PI / 4, 3 * Math.PI / 4, hover);
            // Draw minus symbol (-)
            secVolDown.lineStyle(2.5, 0xffffff);
            secVolDown.moveTo(-4, 39);
            secVolDown.lineTo(4, 39);
        };
        updateVolDown(false);
        secVolDown.on('pointerover', () => updateVolDown(true));
        secVolDown.on('pointerout', () => updateVolDown(false));
        secVolDown.on('pointerdown', () => {
            SoundManager.playCursor();
            AudioManager.bgmVolume = Math.max(0, AudioManager.bgmVolume - 5);
        });
        this._dpadContainer.addChild(secVolDown);

        // --- SECTOR 3: NEXT (Right) ---
        const secNext = new PIXI.Graphics();
        secNext.interactive = true;
        secNext.buttonMode = true;
        
        const updateNext = (hover) => {
            drawSector(secNext, -Math.PI / 4, Math.PI / 4, hover);
            // Draw next symbol ▶▶| centered at (39, 0)
            secNext.beginFill(0xffffff);
            secNext.lineStyle(0);
            secNext.drawRect(39 + 3, -4, 2, 8);
            secNext.moveTo(39 - 5, -4);
            secNext.lineTo(39 - 1, 0);
            secNext.lineTo(39 - 5, 4);
            secNext.moveTo(39 - 1, -4);
            secNext.lineTo(39 + 3, 0);
            secNext.lineTo(39 - 1, 4);
            secNext.endFill();
        };
        updateNext(false);
        secNext.on('pointerover', () => updateNext(true));
        secNext.on('pointerout', () => updateNext(false));
        secNext.on('pointerdown', () => this.playNextTrack());
        this._dpadContainer.addChild(secNext);

        // --- SECTOR 4: PREV (Left) ---
        const secPrev = new PIXI.Graphics();
        secPrev.interactive = true;
        secPrev.buttonMode = true;
        
        const updatePrev = (hover) => {
            drawSector(secPrev, 3 * Math.PI / 4, 5 * Math.PI / 4, hover);
            // Draw prev symbol |◀◀ centered at (-39, 0)
            secPrev.beginFill(0xffffff);
            secPrev.lineStyle(0);
            secPrev.drawRect(-39 - 5, -4, 2, 8);
            secPrev.moveTo(-39 + 5, -4);
            secPrev.lineTo(-39 + 1, 0);
            secPrev.lineTo(-39 + 5, 4);
            secPrev.moveTo(-39 + 1, -4);
            secPrev.lineTo(-39 - 3, 0);
            secPrev.lineTo(-39 + 1, 4);
            secPrev.endFill();
        };
        updatePrev(false);
        secPrev.on('pointerover', () => updatePrev(true));
        secPrev.on('pointerout', () => updatePrev(false));
        secPrev.on('pointerdown', () => this.playPrevTrack());
        this._dpadContainer.addChild(secPrev);

        // --- CENTER BUTTON: PLAY/PAUSE ---
        this._btnPlay = new PIXI.Graphics();
        this._btnPlay.interactive = true;
        this._btnPlay.buttonMode = true;
        
        const updatePlay = (hover) => {
            this._btnPlay.clear();
            this._btnPlay.beginFill(hover ? 0xffffff : 0xdddddd);
            this._btnPlay.lineStyle(2, 0x131315);
            this._btnPlay.drawCircle(0, 0, innerR);
            this._btnPlay.endFill();

            const pm = window.ProceduralMusic;
            const isPlaying = pm && pm._isStarted;

            if (isPlaying) {
                // Draw Pause icon (two thin vertical bars)
                this._btnPlay.beginFill(0x1a1a1a);
                this._btnPlay.lineStyle(0);
                this._btnPlay.drawRect(-4, -5, 3, 10);
                this._btnPlay.drawRect(1, -5, 3, 10);
                this._btnPlay.endFill();
            } else {
                // Draw Play icon (triangle)
                this._btnPlay.beginFill(0x1a1a1a);
                this._btnPlay.lineStyle(0);
                this._btnPlay.moveTo(-3, -5);
                this._btnPlay.lineTo(5, 0);
                this._btnPlay.lineTo(-3, 5);
                this._btnPlay.endFill();
            }
        };
        updatePlay(false);
        this._btnPlay.on('pointerover', () => updatePlay(true));
        this._btnPlay.on('pointerout', () => updatePlay(false));
        this._btnPlay.on('pointerdown', () => {
            this.togglePlayPause();
            // Refresh button overlay graphic immediately to update play/pause state representation!
            updatePlay(true);
        });
        this._dpadContainer.addChild(this._btnPlay);

        // Expose updatePlay so we can refresh the center button play/pause symbol when state shifts
        this._updatePlayButtonGraphic = updatePlay;

        // --- BUTTON: STOP ---
        const btnStop = new PIXI.Graphics();
        btnStop.interactive = true;
        btnStop.buttonMode = true;
        const drawStop = (hover) => {
            btnStop.clear();
            btnStop.beginFill(hover ? 0xeeeeee : 0xcccccc);
            btnStop.lineStyle(1, 0xffffff);
            btnStop.drawCircle(px + 145, py + 120, 13);
            btnStop.endFill();

            // Stop Square
            btnStop.beginFill(0x222222);
            btnStop.drawRect(px + 145 - 4, py + 120 - 4, 8, 8);
            btnStop.endFill();
        };
        drawStop(false);
        btnStop.on('pointerover', () => drawStop(true));
        btnStop.on('pointerout', () => drawStop(false));
        btnStop.on('pointerdown', () => {
            SoundManager.playCancel();
            if (window.ProceduralMusic) {
                window.ProceduralMusic.engine.stop();
                window.ProceduralMusic._isStarted = false;
            }
            this._updatePlayButtonGraphic(false);
        });
        this._mp3Player.addChild(btnStop);

        // --- BUTTON: EXIT ---
        const btnExit = new PIXI.Graphics();
        btnExit.interactive = true;
        btnExit.buttonMode = true;
        const drawExit = (hover) => {
            btnExit.clear();
            btnExit.beginFill(hover ? 0xffaaaa : 0xcccccc);
            btnExit.lineStyle(1, 0xffffff);
            btnExit.drawCircle(px + 145, py + 220, 13);
            btnExit.endFill();

            // X symbol
            btnExit.lineStyle(2, 0x222222);
            btnExit.moveTo(px + 145 - 4, py + 220 - 4);
            btnExit.lineTo(px + 145 + 4, py + 220 + 4);
            btnExit.moveTo(px + 145 + 4, py + 220 - 4);
            btnExit.lineTo(px + 145 - 4, py + 220 + 4);
        };
        drawExit(false);
        btnExit.on('pointerover', () => drawExit(true));
        btnExit.on('pointerout', () => drawExit(false));
        btnExit.on('pointerdown', () => {
            SoundManager.playCancel();
            this.popScene();
        });
        this._mp3Player.addChild(btnExit);
    };

    Scene_MusicPlayer.prototype.togglePlayPause = function () {
        const pm = window.ProceduralMusic;
        const isMidiOrProceduralPlaying = pm && pm._isStarted;
        const isOggPlaying = AudioManager._currentBgm && AudioManager._bgmBuffer && AudioManager._bgmBuffer.isPlaying();

        if (isMidiOrProceduralPlaying) {
            SoundManager.playCancel();
            pm.engine.stop();
            pm._isStarted = false;
        } else if (isOggPlaying) {
            SoundManager.playCancel();
            this._savedBgm = AudioManager._currentBgm;
            if (AudioManager._bgmBuffer) {
                this._savedBgmPosition = AudioManager._bgmBuffer.seek();
            }
            AudioManager.stopBgm();
        } else {
            if (this._savedBgm) {
                SoundManager.playOk();
                AudioManager.playBgm(this._savedBgm, this._savedBgmPosition || 0);
                this._savedBgm = null;
                this._savedBgmPosition = 0;
            } else {
                this.playSelectedTrack();
            }
        }
    };

    Scene_MusicPlayer.prototype.playSelectedTrack = function () {
        const item = this._data[this._selectedIndex];
        // Only a plain track plays without the generator: anything else would
        // stop the music and then voice nothing.
        if (item && item.type !== 'ogg' && !generatorLoaded()) return;
        if (item) {
            SoundManager.playOk();
            this._playSeconds = 0;
            this._lastTickTime = Date.now();
            this._savedBgm = null;
            this._savedBgmPosition = 0;

            if (item.type !== 'ogg') {
                AudioManager.stopBgm();
            }

            if (item.type === 'midi') {
                if (window.ProceduralMusic) {
                    window.ProceduralMusic.playMidiFile(item.name);
                }
            } else if (item.type === 'strudel' || item.type === 'biome' || item.type === 'system') {
                if (window.ProceduralMusic) {
                    window.ProceduralMusic.selectGenre(item.name);
                }
            } else if (item.type === 'ogg') {
                if (window.ProceduralMusic) {
                    if (window.ProceduralMusic.engine) {
                        window.ProceduralMusic.engine.stop();
                        window.ProceduralMusic.engine.stopMidi();
                    }
                    window.ProceduralMusic._isStarted = false;
                }
                AudioManager.playBgm({ name: item.name, volume: TRACK_VOLUME, pitch: 100, pan: 0 });
            }
        }
    };

    Scene_MusicPlayer.prototype.playNextTrack = function () {
        if (this._data.length === 0) return;
        this._selectedIndex = (this._selectedIndex + 1) % this._data.length;
        this.playSelectedTrack();
    };

    Scene_MusicPlayer.prototype.playPrevTrack = function () {
        if (this._data.length === 0) return;
        this._selectedIndex = (this._selectedIndex - 1 + this._data.length) % this._data.length;
        this.playSelectedTrack();
    };

    Scene_MusicPlayer.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);
        this.handleInput();
        this.updateLcd();
    };

    Scene_MusicPlayer.prototype.handleInput = function () {
        if (Input.isRepeated('down')) {
            SoundManager.playCursor();
            this._selectedIndex = (this._selectedIndex + 1) % this._data.length;
        } else if (Input.isRepeated('up')) {
            SoundManager.playCursor();
            this._selectedIndex = (this._selectedIndex - 1 + this._data.length) % this._data.length;
        } else if (Input.isTriggered('ok')) {
            this.playSelectedTrack();
        } else if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.popScene();
        } else if (Input.isTriggered('left')) {
            this.playPrevTrack();
        } else if (Input.isTriggered('right')) {
            this.playNextTrack();
        }
    };

    Scene_MusicPlayer.prototype.updateLcd = function () {
        if (!this._data || this._data.length === 0) return;

        const pm = window.ProceduralMusic;
        const isProceduralPlaying = pm && pm._isStarted;
        const isOggPlaying = AudioManager._currentBgm && AudioManager._bgmBuffer && AudioManager._bgmBuffer.isPlaying();
        const isPlaying = isProceduralPlaying || isOggPlaying;

        let currentGenre = "";
        if (isProceduralPlaying) {
            currentGenre = pm.currentGenre;
        } else if (isOggPlaying) {
            currentGenre = AudioManager._currentBgm.name;
        } else if (this._savedBgm) {
            currentGenre = this._savedBgm.name;
        }

        const { px, py } = this._playerCoords;

        // 1. Maintain visible tracklist scrolling bounds
        if (this._selectedIndex < this._topIndex) {
            this._topIndex = this._selectedIndex;
        } else if (this._selectedIndex >= this._topIndex + 5) {
            this._topIndex = this._selectedIndex - 4;
        }
        this._topIndex = Math.max(0, Math.min(this._data.length - 5, this._topIndex));

        // Reset scroll delay if selection has changed
        if (this._lastSelectedIndex !== this._selectedIndex) {
            this._lastSelectedIndex = this._selectedIndex;
            this._scrollDelay = 60; // 1 second initial pause before scrolling
        }

        // 2. Draw visible track text entries
        for (let i = 0; i < 5; i++) {
            const itemIndex = this._topIndex + i;
            const textObj = this._listTexts[i];
            if (itemIndex < this._data.length) {
                const item = this._data[itemIndex];
                let prefix = "";
                if (item.type === 'midi') prefix = "[MID] ";
                if (item.type === 'strudel') prefix = "[JS] ";
                if (item.type === 'ogg') prefix = "[OGG] ";
                
                const displayText = prefix + item.name;
                const isSelected = (itemIndex === this._selectedIndex);

                // Active selection color highlight & scrolling animation
                if (isSelected) {
                    textObj.style.fill = '#ffffff';
                    textObj.text = displayText;

                    const maxWidth = 180;
                    if (textObj.width > maxWidth) {
                        if (this._scrollDelay === undefined) this._scrollDelay = 60;
                        if (this._scrollDelay > 0) {
                            this._scrollDelay--;
                            textObj.x = px + 205;
                        } else {
                            textObj.x -= 0.6;
                            // Reset position after scrolling complete plus a small margin
                            if (textObj.x < px + 205 - (textObj.width - maxWidth + 15)) {
                                this._scrollDelay = 80; // 1.3 seconds pause at the end
                                textObj.x = px + 205;
                            }
                        }
                    } else {
                        textObj.x = px + 205;
                    }
                } else {
                    textObj.style.fill = '#aaffff';
                    textObj.x = px + 205;

                    // Truncate unselected items to prevent overflow and keep text columns aligned
                    const maxLen = 22;
                    if (displayText.length > maxLen) {
                        textObj.text = displayText.substring(0, 19) + "...";
                    } else {
                        textObj.text = displayText;
                    }
                }
                textObj.visible = true;
            } else {
                textObj.visible = false;
            }
        }

        // 3. Highlight selection background bar
        this._highlightBar.clear();
        if (this._selectedIndex >= this._topIndex && this._selectedIndex < this._topIndex + 5) {
            const localIndex = this._selectedIndex - this._topIndex;
            const hy = py + 110 + localIndex * 28;
            this._highlightBar.beginFill(0xffffff, 0.22);
            this._highlightBar.drawRoundedRect(px + 192, hy + 2, 200, 24, 4);
            this._highlightBar.endFill();
        }

        // 4. Update play status text
        if (isPlaying) {
            this._statusText.text = T('MusicPlayer.play');
            this._statusText.style.fill = "#ffffff";
        } else if (currentGenre) {
            this._statusText.text = T('MusicPlayer.pause');
            this._statusText.style.fill = '#aaffff';
        } else {
            this._statusText.text = T('MusicPlayer.stop');
            this._statusText.style.fill = '#88bbff';
        }

        // 5. Format display text
        let formatStr = T('MusicPlayer.procSynth');
        const activeItem = this._data[this._selectedIndex];
        if (activeItem) {
            if (activeItem.type === 'midi') {
                formatStr = "MIDI FILE";
            } else if (activeItem.type === 'strudel') {
                formatStr = "JS SYNTH";
            } else if (activeItem.type === 'ogg') {
                formatStr = "OGG AUDIO";
            }
        }
        this._formatText.text = formatStr;

        // 6. Audio playback tick timer
        if (isPlaying) {
            if (this._playSeconds === undefined) {
                this._playSeconds = 0;
                this._lastTickTime = Date.now();
            }
            const now = Date.now();
            if (now - this._lastTickTime >= 1000) {
                this._playSeconds += Math.floor((now - this._lastTickTime) / 1000);
                this._lastTickTime = now;
            }
        } else {
            // Keep timer paused but do not clear if in paused state
            if (!currentGenre) {
                this._playSeconds = 0;
                this._lastTickTime = Date.now();
            }
        }

        const min = Math.floor(this._playSeconds / 60);
        const sec = this._playSeconds % 60;
        this._timerText.text = String(min).padStart(2, '0') + ":" + String(sec).padStart(2, '0');

        // 7. Scrolling Marquee text name
        let trackName = "NO TRACK PLAYING";
        if (currentGenre) {
            trackName = (isPlaying ? "PLAYING: " : "PAUSED: ") + currentGenre.toUpperCase();
        }
        if (this._lastTrackName !== trackName) {
            this._lastTrackName = trackName;
            this._marqueeText.text = trackName + "     *     " + trackName + "     *     ";
            this._marqueeText.x = px + 195;
        }

        if (isPlaying) {
            this._marqueeText.x -= 0.8;
            if (this._marqueeText.x < px + 195 - this._marqueeText.width / 2) {
                this._marqueeText.x = px + 195;
            }
        } else {
            this._marqueeText.x = px + 195;
        }

        // 8. Equalizer spectrum visualizer bars animation
        this._eqGraphics.clear();
        const eqX = px + 405;
        const eqY = py + 250;
        const numBars = 10;
        const barWidth = 9;
        const barSpacing = 3;

        for (let i = 0; i < numBars; i++) {
            let barHeight = 2;
            if (isPlaying) {
                const time = Date.now() * 0.005;
                const wave = Math.sin(time + i * 0.6) * 0.5 + 0.5;
                const jitter = Math.random() * 0.25;
                barHeight = Math.floor(wave * 45 + jitter * 12) + 2;
                barHeight = Math.max(2, Math.min(54, barHeight));
            }
            
            // Draw visualizer bar
            this._eqGraphics.beginFill(0xffffff, 0.88);
            this._eqGraphics.drawRect(eqX + i * (barWidth + barSpacing), eqY - barHeight, barWidth, barHeight);
            this._eqGraphics.endFill();
        }

        // Dynamically update the central D-pad Play/Pause icon state in real-time
        if (this._updatePlayButtonGraphic) {
            this._updatePlayButtonGraphic(false);
        }
    };

    window.Scene_MusicPlayer = Scene_MusicPlayer;

    // =========================================================================
    // Window_MusicList
    // =========================================================================

    function Window_MusicList() {
        this.initialize(...arguments);
    }

    Window_MusicList.prototype = Object.create(Window_Selectable.prototype);
    Window_MusicList.prototype.constructor = Window_MusicList;

    Window_MusicList.prototype.initialize = function (rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.makeItemList();
        this.refresh();
        this.select(0);
        this.activate();
    };

    Window_MusicList.prototype.makeItemList = function () {
        this._data = builtInGenres();

        if (typeof require !== 'undefined') {
            const fs = require('fs');
            const path = require('path');

            const showStrudel = generatorLoaded() && !window.ProceduralMusic.useClassicSequencer;

            // Scan Strudel scripts
            if (showStrudel) {
                try {
                    const dir = path.join(gameRoot(), 'audio', 'bgm', 'Strudel');  // i18n-ignore  asset directory
                    if (fs.existsSync(dir)) {
                        const files = fs.readdirSync(dir);
                        files.forEach(file => {
                            if (file.endsWith('.js')) {
                                const name = file.replace('.js', '');
                                if (!this._data.find(d => d.name === name)) {
                                    this._data.push({ name: name, type: 'strudel' });
                                }
                            }
                        });
                    }
                } catch (e) { console.error("Window_MusicList: Failed to read Strudel directory", e); }
            }

            // Scan MIDI files
            if (generatorLoaded()) try {
                const dirMidi = path.join(gameRoot(), 'audio', 'bgm', 'Midi');  // i18n-ignore  asset directory
                if (fs.existsSync(dirMidi)) {
                    const files = fs.readdirSync(dirMidi);
                    files.forEach(file => {
                        if (file.endsWith('.mid') || file.endsWith('.midi')) {
                            const name = file.replace(/\.midi?$/, '');
                            this._data.push({ name: name, type: 'midi' });
                        }
                    });
                }
            } catch (e) { console.error("Window_MusicList: Failed to read Midi directory", e); }

            // Sort list: Auto first, then Biomes, then MIDI, then JS
            this._data.sort((a, b) => {
                const typeOrder = { 'system': 0, 'midi': 1, 'biome': 2, 'strudel': 3 };
                if (typeOrder[a.type] !== typeOrder[b.type]) {
                    return typeOrder[a.type] - typeOrder[b.type];
                }
                return a.name.localeCompare(b.name);
            });
        }
    };

    Window_MusicList.prototype.maxItems = function () {
        return this._data ? this._data.length : 0;
    };

    Window_MusicList.prototype.item = function () {
        return this._data[this.index()];
    };

    Window_MusicList.prototype.drawItem = function (index) {
        const item = this._data[index];
        const rect = this.itemLineRect(index);
        let prefix = "";
        if (item.type === 'midi') prefix = "[MIDI] ";
        if (item.type === 'strudel') prefix = "[JS] ";

        // A built-in genre has a label in the namespace; a scanned Strudel/Midi
        // filename does not, and shows as filed on disk.
        const genreKey = 'MusicPlayer.genre.' + item.name;
        const shown = T.has(genreKey) ? T(genreKey) : item.name;
        this.drawText(prefix + shown, rect.x, rect.y, rect.width);

        if (window.ProceduralMusic && window.ProceduralMusic.currentGenre === item.name) {
            this.changeTextColor(ColorManager.crisisColor());
            this.drawText(T('MusicPlayer.playing'), rect.x, rect.y, rect.width, "right");
            this.resetTextColor();
        }
    };

    Window_MusicList.prototype.update = function () {
        Window_Selectable.prototype.update.call(this);
        const pm = window.ProceduralMusic;
        const currentGenre = pm ? pm.currentGenre : "";
        const classicState = pm ? pm.useClassicSequencer : false;

        if (this._lastPlayedGenre !== currentGenre || this._lastClassicState !== classicState) {
            this._lastPlayedGenre = currentGenre;
            this._lastClassicState = classicState;
            this.makeItemList();
            this.refresh();
        }
    };

    window.Window_MusicList = Window_MusicList;

    // =========================================================================
    // Plugin Command Registration
    // =========================================================================

    PluginManager.registerCommand('ProceduralMusicPlayer', 'openPlayer', function(args) {
        SceneManager.push(Scene_MusicPlayer);
    });

})();
