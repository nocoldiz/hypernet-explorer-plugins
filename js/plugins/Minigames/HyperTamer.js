/*:
 * @target MZ
 * @plugindesc HyperTamer Virtual Pet System v2.0.0
 * @author Omni-Lex
 * @url 
 * @help
 * ============================================================================
 * HyperTamer - Virtual Pet Plugin for RPG Maker MZ
 * ============================================================================
 * 
 * This plugin adds a virtual pet system to your game with a retro LCD style
 * interface. Pets are based on enemies from your database and require
 * real-time care to survive.
 * 
 * Features:
 * - Random pet selection from enemy database
 * - Personality system affecting behavior
 * - Real-time needs management
 * - Training mini-games to improve stats
 * - Dynamic growth system
 * - Monochrome LCD display effect
 * - Offline time calculation
 * - Drawn device shell around the screen
 * 
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 * 
 * Open HyperTamer - Opens the virtual pet interface
 * Reset Pet - Resets the current pet (warning: pet will die!)
 * 
 * @param lcdColorTint
 * @text LCD Color Tint
 * @desc Hex color for the LCD screen tint
 * @type string
 * @default #9BBC0F
 * 
 * @param updateInterval
 * @text Update Interval
 * @desc Seconds between automatic need updates
 * @type number
 * @min 10
 * @max 300
 * @default 60
 * 
 * @param maxOfflineHours
 * @text Max Offline Hours
 * @desc Maximum hours of offline progression
 * @type number
 * @min 1
 * @max 168
 * @default 24
 * 
 * @param deathEnabled
 * @text Enable Pet Death
 * @desc Can pets die from neglect?
 * @type boolean
 * @default true
 * 
 * @param startingFood
 * @text Starting Food Items
 * @desc Number of food items player starts with
 * @type number
 * @min 0
 * @default 10
 * 
 * @param feedSound
 * @text Feed Sound Effect
 * @desc Sound effect when feeding pet
 * @type file
 * @dir audio/se/
 * @default Heal1
 * 
 * @param playSound
 * @text Play Sound Effect
 * @desc Sound effect when playing with pet
 * @type file
 * @dir audio/se/
 * @default Jump1
 * 
 * @param cleanSound
 * @text Clean Sound Effect
 * @desc Sound effect when cleaning pet
 * @type file
 * @dir audio/se/
 * @default Water1
 * 
 * @param happySound
 * @text Happy Sound Effect
 * @desc Sound effect when pet is happy
 * @type file
 * @dir audio/se/
 * @default Coin
 * 
 * @param sadSound
 * @text Sad Sound Effect
 * @desc Sound effect when pet is sad
 * @type file
 * @dir audio/se/
 * @default Down1
 * 
 * @param growthSound
 * @text Growth Sound Effect
 * @desc Sound effect when pet grows
 * @type file
 * @dir audio/se/
 * @default Powerup
 * 
 * @command openHyperTamer
 * @text Open HyperTamer
 * @desc Opens the virtual pet interface
 * 
 * @command resetPet
 * @text Reset Pet
 * @desc Resets the current pet (it will die!)
 * 
 */

(() => {
    'use strict';
    
    const pluginName = 'HyperTamer';
    const parameters = PluginManager.parameters(pluginName);
    
    const lcdColorTint = parseInt(String(parameters['lcdColorTint'] || '#9BBC0F').replace('#', '0x')) || 0x9BBC0F;
    const updateInterval = Number(parameters['updateInterval']) || 60;
    const maxOfflineHours = Number(parameters['maxOfflineHours']) || 24;
    const deathEnabled = parameters['deathEnabled'] === 'true';
    const startingFood = Number(parameters['startingFood']) || 10;
    
    // Sound effects
    const soundEffects = {
        feed: parameters['feedSound'] || 'Heal1',
        play: parameters['playSound'] || 'Jump1',
        clean: parameters['cleanSound'] || 'Water1',
        happy: parameters['happySound'] || 'Coin',
        sad: parameters['sadSound'] || 'Down1',
        growth: parameters['growthSound'] || 'Powerup'
    };
    
    // Personality types
    const PERSONALITIES = {
        CHEERFUL: { happiness: 1.2, energy: 1.1, hunger: 0.9 },
        LAZY: { happiness: 0.9, energy: 0.7, hunger: 1.3 },
        ENERGETIC: { happiness: 1.1, energy: 1.5, hunger: 1.2 },
        GRUMPY: { happiness: 0.7, energy: 0.9, hunger: 1.0 },
        GENTLE: { happiness: 1.0, energy: 0.8, cleanliness: 1.2 },
        WILD: { happiness: 0.8, energy: 1.3, cleanliness: 0.7 }
    };
    
    
    // Register the plugin commands under both the bare name and the folder
    // qualified one: PluginManager.callCommand keys on whatever string the
    // event stored, and the calls saved in CommonEvents say 'Minigames/...'.
    [pluginName, 'Minigames/' + pluginName].forEach(key => {
        PluginManager.registerCommand(key, 'openHyperTamer', args => {
            SceneManager.push(Scene_HyperTamer);
        });
        PluginManager.registerCommand(key, 'resetPet', args => {
            $gameSystem.hyperTamerReset();
        });
    });
    
    //=============================================================================
    // Sound Manager Extensions
    //=============================================================================
    
    const playPetSound = function(type) {
        const se = {
            name: soundEffects[type],
            volume: 90,
            pitch: 100,
            pan: 0
        };
        AudioManager.playSe(se);
    };
    
    //=============================================================================
    // LCD Filter for PIXI
    //=============================================================================
    
    class LCDFilter extends PIXI.Filter {
        constructor() {
            const vertexShader = `
                attribute vec2 aVertexPosition;
                attribute vec2 aTextureCoord;
                uniform mat3 projectionMatrix;
                varying vec2 vTextureCoord;
                void main(void) {
                    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
                    vTextureCoord = aTextureCoord;
                }
            `;
            
            const fragmentShader = `
                varying vec2 vTextureCoord;
                uniform sampler2D uSampler;
                uniform vec3 tint;
                
                void main(void) {
                    // Direct 1:1 texture sampling for crystal-clear LCD display
                    vec4 color = texture2D(uSampler, vTextureCoord);
                    
                    // Convert to grayscale luminance
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    
                    // Apply LCD tint: maps luminance onto the LCD green color scheme
                    vec3 tinted = mix(vec3(0.0), tint, gray);
                    
                    gl_FragColor = vec4(tinted, color.a);
                }
            `;
            
            super(vertexShader, fragmentShader);
            
            this.uniforms.tint = new Float32Array([
                ((lcdColorTint >> 16) & 0xFF) / 255,
                ((lcdColorTint >> 8) & 0xFF) / 255,
                (lcdColorTint & 0xFF) / 255
            ]);
        }
    }
    
    //=============================================================================
    // Game_System Extensions
    //=============================================================================
    
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this.initializeHyperTamer();
    };
    
    Game_System.prototype.initializeHyperTamer = function() {
        this._hyperTamerItems = this._hyperTamerItems || {
            food: startingFood,
            toys: 3,
            medicine: 2
        };
    };
    
    Game_System.prototype.createNewPet = function() {
        // Get valid enemies. The database dividers ("<-- 1-10 -->") carry a
        // battler image but are not creatures, and a boss is nobody's pet:
        // the <Boss> note tag reads back as meta.Boss.
        const enemies = $dataEnemies.filter(e =>
            e && e.name && e.battlerName && !e.name.startsWith('<--') &&
            !(e.meta && (e.meta.Boss || e.meta.boss))
        );
        
        if (enemies.length === 0) {
            console.error('No valid enemies found for HyperTamer!');
            return null;
        }
        
        const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
        const personalityKeys = Object.keys(PERSONALITIES);
        const randomPersonality = personalityKeys[Math.floor(Math.random() * personalityKeys.length)];
        
        return {
            petId: randomEnemy.id,
            petName: randomEnemy.name,
            birthTime: Date.now(),
            lastUpdateTime: Date.now(),
            needs: {
                hunger: 50,
                happiness: 50,
                cleanliness: 100,
                energy: 100,
                health: 100
            },
            stats: {
                age: 0,
                careTaken: 0,
                deaths: 0,
                level: 1,
                exp: 0,
                // Training stats
                strength: 0,
                intelligence: 0,
                agility: 0
            },
            personality: randomPersonality,
            personalityTraits: PERSONALITIES[randomPersonality],
            isAlive: true,
            isSleeping: false,
            size: 1.0,
            mood: 'neutral',
            lastInteraction: null
            // NB: do not store the live $dataEnemies record here - it bloats saves
            // and goes stale across DB edits. Resolve via $dataEnemies[petId] on read.
        };
    };
    
    Game_System.prototype.hyperTamerData = function() {
        if (!this._hyperTamerData) {
            // The pet hatches the first time the device is opened, not at new
            // game: a device nobody ever looked at keeps no starving creature.
            this.initializeHyperTamer();
            this._hyperTamerData = this.createNewPet();
        }
        return this._hyperTamerData;
    };
    
    Game_System.prototype.hyperTamerItems = function() {
        if (!this._hyperTamerItems) {
            this.initializeHyperTamer();
        }
        return this._hyperTamerItems;
    };
    
    Game_System.prototype.hyperTamerReset = function() {
        if (this._hyperTamerData) {
            this._hyperTamerData.isAlive = false;
            this._hyperTamerData.stats.deaths++;
        }
        this._hyperTamerData = this.createNewPet();
    };
    
    Game_System.prototype.updateHyperTamerOffline = function() {
        const data = this.hyperTamerData();
        if (!data || !data.isAlive) return;
        
        const currentTime = Date.now();
        const timeDiff = currentTime - data.lastUpdateTime;
        const hoursPassed = Math.min(timeDiff / (1000 * 60 * 60), maxOfflineHours);
        
        if (hoursPassed > 0.1) { // Only update if at least 6 minutes passed
            const enemy = $dataEnemies[data.petId];
            this.applyNeedChanges(data, hoursPassed, enemy);
            data.lastUpdateTime = currentTime;
        }
    };
    
    Game_System.prototype.applyNeedChanges = function(data, hours, enemy) {
        // Base rates modified by enemy stats and personality
        // Guard against a missing/stale enemy record so a bad petId cannot throw.
        if (!enemy || !enemy.params) {
            enemy = { params: [0, 0, 0, 0, 0, 0, 0, 0] };
        }
        const traits = data.personalityTraits;
        const hungerRate = (10 + (enemy.params[2] / 100)) * hours * (traits.hunger || 1);
        const happinessRate = (5 + (enemy.params[1] / 200)) * hours * (traits.happiness || 1);
        const cleanRate = 8 * hours * (traits.cleanliness || 1);
        const energyRate = (6 + (enemy.params[6] / 150)) * hours * (traits.energy || 1);
        
        // Apply changes
        data.needs.hunger = Math.max(0, data.needs.hunger - hungerRate);
        data.needs.happiness = Math.max(0, data.needs.happiness - happinessRate);
        data.needs.cleanliness = Math.max(0, data.needs.cleanliness - cleanRate);
        
        if (!data.isSleeping) {
            data.needs.energy = Math.max(0, data.needs.energy - energyRate);
        } else {
            data.needs.energy = Math.min(100, data.needs.energy + (10 * hours));
        }
        
        // Health is affected by other needs
        if (data.needs.hunger < 20 || data.needs.cleanliness < 20) {
            const healthLoss = (5 + (100 - enemy.params[3]) / 100) * hours;
            data.needs.health = Math.max(0, data.needs.health - healthLoss);
        }
        
        // Update mood based on needs
        this.updatePetMood(data);
        
        // Check for death
        if (deathEnabled && data.needs.health <= 0) {
            data.isAlive = false;
            data.stats.deaths++;
        }
        
        // Update age and check for growth
        const oldAge = data.stats.age;
        data.stats.age = Math.floor((Date.now() - data.birthTime) / (1000 * 60 * 60 * 24));
        
        if (data.stats.age > oldAge && data.stats.age % 3 === 0) {
            this.petGrowth(data);
        }
    };
    
    Game_System.prototype.updatePetMood = function(data) {
        const avgNeeds = (data.needs.hunger + data.needs.happiness + 
                         data.needs.cleanliness + data.needs.energy) / 4;
        
        if (avgNeeds > 70) {
            data.mood = 'happy';
        } else if (avgNeeds > 40) {
            data.mood = 'neutral';
        } else if (avgNeeds > 20) {
            data.mood = 'sad';
        } else {
            data.mood = 'angry';
        }
    };
    
    Game_System.prototype.petGrowth = function(data) {
        // Increase size and stats
        data.size = Math.min(data.size + 0.1, 2.0);
        data.stats.level = Math.floor(data.stats.age / 3) + 1;
        playPetSound('growth');
    };
    
    Game_System.prototype.gainPetExp = function(amount) {
        const data = this.hyperTamerData();
        if (!data || !data.isAlive) return;
        
        data.stats.exp += amount;
        const expNeeded = data.stats.level * 100;
        
        if (data.stats.exp >= expNeeded) {
            data.stats.exp -= expNeeded;
            data.stats.level++;
            data.size = Math.min(data.size + 0.05, 2.0);
            playPetSound('growth');
        }
    };
    
    //=============================================================================
    // Sprite_TamerButton - a text button. Sprite_Button expects a core buttonType
    // (buttonData() looks it up in a fixed table); passing a display label would
    // make buttonData() undefined and crash setupFrames. This subclass renders the
    // label onto its own bitmap instead, keeping setClickHandler/scale/opacity.
    //=============================================================================

    class Sprite_TamerButton extends Sprite_Button {
        initialize(label) {
            this._label = label;
            // buttonType intentionally undefined; setupFrames() is overridden so
            // the core buttonData() lookup is never reached.
            super.initialize();
        }

        setupFrames() {
            const w = 58, h = 24;
            this.bitmap = new Bitmap(w, h);
            this.bitmap.outlineWidth = 0;
            this.bitmap.fontSize = 14;
            this.bitmap.drawText(this._label || '', 0, 0, w, h, 'center');
            this.setColdFrame(0, 0, w, h);
            this.setHotFrame(0, 0, w, h);
            this.updateFrame();
        }

        // The core check measures the bitmap against the ButtonSet sheet and
        // throws for anything narrower, which a 58px label always is.
        checkBitmap() {
        }

        // Opacity belongs to the selection highlight, not to the press state.
        updateOpacity() {
        }
    }

    //=============================================================================
    // MiniGame_Training - minimal timed button-mash training minigame. Added as a
    // child sprite; calls its finish handler(type, score) when the timer expires.
    //=============================================================================

    class MiniGame_Training extends Sprite {
        initialize(type) {
            super.initialize();
            this._type = type;
            this._finishHandler = null;
            this._timer = 0;
            this._duration = 120; // ~2 seconds at 60fps
            this._score = 0;
            this.bitmap = new Bitmap(220, 60);
            this._redraw();
        }

        setFinishHandler(handler) {
            this._finishHandler = handler;
        }

        _redraw() {
            this.bitmap.clear();
            this.bitmap.outlineWidth = 0;
            this.bitmap.fontSize = 16;
            this.bitmap.drawText(T('HyperTamer.' + this._type + 'Training'), 0, 0, 220, 30, 'center');
            this.bitmap.drawText(T('HyperTamer.scoreLine', { score: this._score }), 0, 30, 220, 30, 'center');
        }

        update() {
            super.update();
            this._timer++;
            if (Input.isTriggered('ok') || Input.isTriggered('shift')) {
                this._score += 10;
                this._redraw();
            }
            if (this._timer >= this._duration) {
                const handler = this._finishHandler;
                this._finishHandler = null;
                if (handler) handler(this._type, this._score);
            }
        }
    }

    //=============================================================================
    // Scene_HyperTamer
    //=============================================================================

    class Scene_HyperTamer extends Scene_Base {
        initialize() {
            super.initialize();
            this._lastUpdateTime = Date.now();
            this._updateTimer = 0;
            this._animationTimer = 0;
            this._currentMinigame = null;
        }
        
        create() {
            super.create();
            $gameSystem.updateHyperTamerOffline();
            this.createBackground();
            this.createLCDScreen();
            this.createPetSprite();
            this.createUI();
            this.createDeviceFrame();
            this.refreshDisplay();
            if (window.MinigameFun) window.MinigameFun.played('Animal Training'); // i18n-ignore: specialization id
        }
        
        createBackground() {
            this._backgroundSprite = new Sprite();
            this._backgroundSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
            this._backgroundSprite.bitmap.fillAll('black');
            this.addChild(this._backgroundSprite);
        }
        
        createLCDScreen() {
            // Create LCD container
            this._lcdContainer = new Sprite();
            this._lcdContainer.bitmap = new Bitmap(320, 240);
            // The filter maps luminance onto the tint, so the panel's own
            // ground has to be dark: it is the unlit state of the display.
            this._lcdContainer.bitmap.fillRect(0, 0, 320, 240, '#1c1c1c');
            this._lcdContainer.x = (Graphics.width - 320) / 2;
            this._lcdContainer.y = (Graphics.height - 240) / 2 - 50;
            
            // Apply LCD filter
            this._lcdFilter = new LCDFilter();
            this._lcdContainer.filters = [this._lcdFilter];
            
            this.addChild(this._lcdContainer);
        }
        
        createPetSprite() {
            const data = $gameSystem.hyperTamerData();
            if (!data || !data.isAlive) {
                this.createDeathScreen();
                return;
            }
            
            const enemy = data.petId ? $dataEnemies[data.petId] : null;
            this._petSprite = new Sprite();

            // Load enemy battler
            if (enemy && enemy.battlerName) {
                this._petSprite.bitmap = ImageManager.loadEnemy(enemy.battlerName);
                this._petSprite.setFrame(0, 0, 0, 0);
                
                this._petSprite.bitmap.addLoadListener(() => {
                    // The frame is opened up only now: it was collapsed while
                    // the battler loaded so no stray corner of the sheet showed.
                    this._petSprite.setFrame(0, 0, this._petSprite.bitmap.width, this._petSprite.bitmap.height);
                    // Scale to fit LCD screen with growth
                    const maxWidth = 200;
                    const maxHeight = 150;
                    const baseScale = Math.min(
                        maxWidth / this._petSprite.bitmap.width,
                        maxHeight / this._petSprite.bitmap.height,
                        1
                    );
                    this._petBaseScale = baseScale;
                    const growthScale = data.size;
                    
                    this._petSprite.scale.x = baseScale * growthScale;
                    this._petSprite.scale.y = baseScale * growthScale;
                    
                    this._petSprite.x = 160;
                    this._petSprite.y = 100;
                    this._petSprite.anchor.x = 0.5;
                    this._petSprite.anchor.y = 0.5;
                });
            }
            
            // Create mood indicator
            this._moodSprite = new Sprite();
            this._moodSprite.bitmap = new Bitmap(32, 32);
            this._moodSprite.x = 280;
            this._moodSprite.y = 10;
            this.updateMoodSprite();
            
            this._lcdContainer.addChild(this._petSprite);
            this._lcdContainer.addChild(this._moodSprite);
        }
        
        updateMoodSprite() {
            const data = $gameSystem.hyperTamerData();
            if (!data || !this._moodSprite) return;
            
            this._moodSprite.bitmap.clear();
            // Mood shown with IconSet glyphs (indices per js/db/Sprites/Icons.json)
            // rather than emoji: Heart / Half Heart / Broken Heart / Rage.
            const moodIcons = { happy: 84, neutral: 86, sad: 85, angry: 5 };
            const icon = moodIcons[data.mood] || moodIcons.neutral;
            const sheet = ImageManager.loadSystem('IconSet');
            const pw = ImageManager.iconWidth;
            const ph = ImageManager.iconHeight;
            const draw = () => {
                if (!this._moodSprite || !this._moodSprite.bitmap) return;
                this._moodSprite.bitmap.blt(sheet, (icon % 16) * pw, Math.floor(icon / 16) * ph, pw, ph, 0, 0);
            };
            if (sheet.isReady()) draw();
            else sheet.addLoadListener(draw);
        }
        
        createDeathScreen() {
            this._deathText = new Sprite();
            this._deathText.bitmap = new Bitmap(320, 240);
            this._deathText.bitmap.outlineWidth = 0;
            this._deathText.bitmap.fontSize = 24;
            this._deathText.bitmap.drawText(T('HyperTamer.petDied'), 0, 100, 320, 32, 'center');
            this._deathText.bitmap.fontSize = 16;
            this._deathText.bitmap.drawText(T('HyperTamer.hatchNew'), 0, 136, 320, 24, 'center');
            this._lcdContainer.addChild(this._deathText);
        }
        
        createUI() {
            const data = $gameSystem.hyperTamerData();
            if (!data || !data.isAlive) return;
            
            // Create UI container
            this._uiContainer = new Sprite();
            this._uiContainer.bitmap = new Bitmap(320, 240);
            this._uiContainer.bitmap.outlineWidth = 0;
            this._lcdContainer.addChild(this._uiContainer);
            
            // Create status bars
            this._statusBars = {};
            const barY = 10;
            const barHeight = 8;
            const needs = ['hunger', 'happiness', 'cleanliness', 'energy', 'health'];
            const icons = ['', '', '', '', ''];
            
            needs.forEach((need, index) => {
                const y = barY + (index * 12);
                this.drawStatusBar(need, 40, y, barHeight, icons[index]);
            });
            
            // Create action buttons
            this._buttons = [];
            this._buttonActions = ['feed', 'play', 'clean', 'sleep', 'train'];
            const buttonY = 180;

            this._buttonActions.forEach((name, index) => {
                const button = new Sprite_TamerButton(T('HyperTamer.' + name));
                button.x = 10 + (index * 62);
                button.y = buttonY;
                button.setClickHandler(this.onButtonClick.bind(this, name.toLowerCase()));
                this._lcdContainer.addChild(button);
                this._buttons.push(button);
            });
            this._selectedButtonIndex = 0;
            this.updateButtonSelection();
        }

        updateButtonSelection() {
            this._buttons.forEach((button, index) => {
                const selected = index === this._selectedButtonIndex;
                button.scale.set(selected ? 1.15 : 1.0);
                button.opacity = selected ? 255 : 160;
            });
        }
        
        drawStatusBar(need, x, y, height, icon) {
            const bitmap = this._uiContainer.bitmap;
            const data = $gameSystem.hyperTamerData();
            const value = data.needs[need];
            const width = 100;
            
            // Draw icon
            bitmap.fontSize = 12;
            bitmap.drawText(icon, x - 25, y - 2, 20, height + 4, 'center');
            
            // Draw bar background (unlit LCD segment)
            bitmap.fillRect(x, y, width, height, '#333333');
            
            // Draw bar fill (lit LCD segment)
            const fillWidth = Math.floor((width - 2) * value / 100);
            const fillColor = this.getBarColor(need, value);
            bitmap.fillRect(x + 1, y + 1, fillWidth, height - 2, fillColor);
        }
        
        getBarColor(need, value) {
            return '#ffffff';
        }
        
        createDeviceFrame() {
            const w = Graphics.width;
            const h = Graphics.height;
            const lx = this._lcdContainer.x;
            const ly = this._lcdContainer.y;
            const lw = 320;
            const lh = 240;
            const bitmap = new Bitmap(w, h);
            // Shell, then the bezel ring, then the window punched back out so
            // the LCD underneath shows through the middle of the case.
            bitmap.gradientFillRect(0, 0, w, h, '#d8d4c0', '#a29e8c', true);
            bitmap.fillRect(lx - 16, ly - 16, lw + 32, lh + 32, '#3a3a32');
            bitmap.clearRect(lx, ly, lw, lh);
            // Speaker grille to the right of the window and a plate to its left.
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 5; col++) {
                    bitmap.fillRect(lx + lw - 66 + col * 12, ly + lh + 34 + row * 10, 6, 6, '#8e8b7a');
                }
            }
            bitmap.fillRect(lx + 10, ly + lh + 40, 80, 8, '#8e8b7a');
            this._deviceFrame = new Sprite(bitmap);
            this.addChild(this._deviceFrame);
        }
        
        onButtonClick(action) {
            const data = $gameSystem.hyperTamerData();
            const items = $gameSystem.hyperTamerItems();
            
            if (!data || !data.isAlive) {
                if (action === 'feed') { // Use feed button to revive
                    $gameSystem.hyperTamerReset();
                    SceneManager.goto(Scene_HyperTamer);
                }
                return;
            }
            
            // Check last interaction for dynamic responses
            const sameAction = data.lastInteraction === action;
            data.lastInteraction = action;
            
            switch(action) {
                case 'feed':
                    if (items.food > 0) {
                        if (data.needs.hunger > 80 && sameAction) {
                            // Overfeeding
                            data.needs.happiness = Math.max(0, data.needs.happiness - 10);
                            playPetSound('sad');
                            this.showMessage(T('HyperTamer.tooFull'));
                        } else {
                            data.needs.hunger = Math.min(100, data.needs.hunger + 30);
                            items.food--;
                            data.stats.careTaken++;
                            playPetSound('feed');
                            if (data.needs.hunger > 70) {
                                playPetSound('happy');
                            }
                        }
                    } else {
                        SoundManager.playBuzzer();
                    }
                    break;
                    
                case 'play':
                    if (data.needs.energy > 20) {
                        if (data.personality === 'LAZY' && sameAction) {
                            data.needs.happiness = Math.max(0, data.needs.happiness - 5);
                            this.showMessage(T('HyperTamer.tooTired'));
                        } else {
                            data.needs.happiness = Math.min(100, data.needs.happiness + 25);
                            data.needs.energy = Math.max(0, data.needs.energy - 10);
                            data.stats.careTaken++;
                            playPetSound('play');
                            $gameSystem.gainPetExp(10);
                        }
                    } else {
                        SoundManager.playBuzzer();
                        this.showMessage(T('HyperTamer.needRest'));
                    }
                    break;
                    
                case 'clean':
                    if (data.personality === 'WILD' && data.needs.cleanliness > 50) {
                        data.needs.happiness = Math.max(0, data.needs.happiness - 15);
                        this.showMessage(T('HyperTamer.hatesBaths'));
                    }
                    data.needs.cleanliness = 100;
                    data.stats.careTaken++;
                    playPetSound('clean');
                    break;
                    
                case 'sleep':
                    data.isSleeping = !data.isSleeping;
                    if (data.isSleeping) {
                        this._lcdContainer.opacity = 128;
                    } else {
                        this._lcdContainer.opacity = 255;
                    }
                    SoundManager.playOk();
                    break;
                    
                case 'train':
                    if (data.needs.energy > 30 && data.needs.hunger > 30) {
                        this.startMinigame();
                    } else {
                        SoundManager.playBuzzer();
                        this.showMessage(T('HyperTamer.tooTiredOrHungry'));
                    }
                    break;
            }
            
            $gameSystem.updatePetMood(data);
            this.updateMoodSprite();
            this.refreshDisplay();
        }
        
        showMessage(text) {
            if (!this._messageSprite) {
                this._messageSprite = new Sprite();
                this._messageSprite.bitmap = new Bitmap(200, 32);
                this._messageSprite.bitmap.outlineWidth = 0;
                this._messageSprite.x = 60;
                this._messageSprite.y = 150;
                this._lcdContainer.addChild(this._messageSprite);
            }
            
            this._messageSprite.bitmap.clear();
            this._messageSprite.bitmap.outlineWidth = 0;
            this._messageSprite.bitmap.fontSize = 16;
            this._messageSprite.bitmap.drawText(text, 0, 0, 200, 32, 'center');
            this._messageSprite.opacity = 255;
            this._messageTimer = 60;
        }
        
        startMinigame() {
            const games = ['strength', 'intelligence', 'agility'];
            const randomGame = games[Math.floor(Math.random() * games.length)];
            this._currentMinigame = new MiniGame_Training(randomGame);
            this._currentMinigame.x = 50;
            this._currentMinigame.y = 90;
            this._currentMinigame.setFinishHandler(this.onMinigameFinish.bind(this));
            this._lcdContainer.addChild(this._currentMinigame);
        }
        
        onMinigameFinish(type, score) {
            const data = $gameSystem.hyperTamerData();

            // i18n-ignore: 'Animal Training' is the specialization id
            if (window.MinigameFun) (score > 0) ? window.MinigameFun.won('Animal Training') : window.MinigameFun.lost('Animal Training');

            // Award stats based on performance
            data.stats[type] += Math.floor(score / 10);
            
            // Award exp
            $gameSystem.gainPetExp(score);
            
            // Update needs
            data.needs.energy = Math.max(0, data.needs.energy - 20);
            data.needs.hunger = Math.max(0, data.needs.hunger - 15);
            data.needs.happiness = Math.min(100, data.needs.happiness + 20);
            
            // Clean up minigame
            this._lcdContainer.removeChild(this._currentMinigame);
            this._currentMinigame = null;
            
            playPetSound('happy');
            this.refreshDisplay();
        }
        
        refreshDisplay() {
            if (this._uiContainer && this._uiContainer.bitmap) {
                this._uiContainer.bitmap.clear();
                this._uiContainer.bitmap.outlineWidth = 0;
                const needs = ['hunger', 'happiness', 'cleanliness', 'energy', 'health'];
                const icons = ['', '', '', '', ''];
                
                needs.forEach((need, index) => {
                    const y = 10 + (index * 12);
                    this.drawStatusBar(need, 40, y, 8, icons[index]);
                });
                
                // Draw pet info
                const data = $gameSystem.hyperTamerData();
                if (data && data.isAlive) {
                    const bitmap = this._uiContainer.bitmap;
                    bitmap.outlineWidth = 0;
                    bitmap.fontSize = 12;
                    const personalityText = T('HyperTamer.' + data.personality);
                    const enemy = $dataEnemies[data.petId];
                    const petName = (enemy && enemy.name) || data.petName;
                    bitmap.drawText(`${petName} (${personalityText}) ${T('HyperTamer.level')}${data.stats.level}`, 10, 220, 300, 20, 'left');
                    
                    // Draw stats
                    bitmap.fontSize = 11;
                    bitmap.outlineWidth = 0;
                    const str = T('HyperTamer.strength').substr(0, 3).toUpperCase();
                    const int = T('HyperTamer.intelligence').substr(0, 3).toUpperCase();
                    const agi = T('HyperTamer.agility').substr(0, 3).toUpperCase();
                    bitmap.drawText(`${str}:${data.stats.strength} ${int}:${data.stats.intelligence} ${agi}:${data.stats.agility}`, 10, 204, 150, 20, 'left');
                    
                    // Draw item counts
                    const items = $gameSystem.hyperTamerItems();
                    bitmap.drawText(`${T('HyperTamer.food')}: ${items.food}`, 170, 204, 80, 20, 'left');
                }
            }
        }
        
        update() {
            super.update();

            // Handle input, keyboard arrows / WASD / controller navigate the
            // action buttons, OK activates, B/Esc exits
            if (Input.isTriggered('cancel')) {
                this.popScene();
                return;
            }

            const petData = $gameSystem.hyperTamerData();
            if (!petData || !petData.isAlive) {
                // The only thing left to do at a grave is start again.
                if (Input.isTriggered('ok') || TouchInput.isTriggered()) {
                    $gameSystem.hyperTamerReset();
                    SceneManager.goto(Scene_HyperTamer);
                }
                return;
            }

            if (!this._currentMinigame && this._buttons && this._buttons.length > 0) {
                const total = this._buttons.length;
                if (Input.isRepeated('left')) {
                    this._selectedButtonIndex = (this._selectedButtonIndex - 1 + total) % total;
                    SoundManager.playCursor();
                    this.updateButtonSelection();
                } else if (Input.isRepeated('right')) {
                    this._selectedButtonIndex = (this._selectedButtonIndex + 1) % total;
                    SoundManager.playCursor();
                    this.updateButtonSelection();
                } else if (Input.isTriggered('ok')) {
                    this.onButtonClick(this._buttonActions[this._selectedButtonIndex]);
                }
            }
            
            // Update message fade
            if (this._messageTimer > 0) {
                this._messageTimer--;
                if (this._messageTimer < 20) {
                    this._messageSprite.opacity = this._messageTimer * 12.75;
                }
            }
            
            // Update animation timer
            this._animationTimer++;
            
            // Update needs periodically
            this._updateTimer++;
            if (this._updateTimer >= updateInterval * 60) { // Convert seconds to frames
                this._updateTimer = 0;
                const data = $gameSystem.hyperTamerData();
                if (data && data.isAlive) {
                    $gameSystem.applyNeedChanges(data, updateInterval / 3600, $dataEnemies[data.petId]);
                    this.refreshDisplay();
                    this.updateMoodSprite();
                    
                    if (!data.isAlive) {
                        playPetSound('sad');
                        SceneManager.goto(Scene_HyperTamer);
                    }
                }
            }
            
            // Animate pet based on mood and personality
            const animData = $gameSystem.hyperTamerData();
            if (this._petSprite && animData && animData.isAlive) {
                const data = animData;
                let baseY = 100;
                let animSpeed = 0.05;
                let animRange = 5;
                
                // Personality affects animation
                if (data.personality === 'ENERGETIC') {
                    animSpeed = 0.08;
                    animRange = 8;
                } else if (data.personality === 'LAZY') {
                    animSpeed = 0.03;
                    animRange = 3;
                }
                
                // Mood affects animation
                if (data.mood === 'happy') {
                    animRange *= 1.5;
                } else if (data.mood === 'sad') {
                    animRange *= 0.5;
                    baseY += 10;
                }
                
                if (data.isSleeping) {
                    // Gentle breathing animation when sleeping
                    const base = this._petBaseScale || 1.0;
                    this._petSprite.scale.x = this._petSprite.scale.y =
                        base * ((data.size * 0.95) + Math.sin(this._animationTimer * 0.02) * 0.05);
                } else {
                    // Bouncing animation snapped to integer pixels for LCD sharpness
                    this._petSprite.y = Math.round(baseY + Math.sin(this._animationTimer * animSpeed) * animRange);
                }
            }
        }
    }

    window.Scene_HyperTamer = Scene_HyperTamer;
})();
