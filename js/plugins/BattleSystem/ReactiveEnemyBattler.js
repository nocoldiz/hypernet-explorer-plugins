//=============================================================================
// Reactive Enemy Battler System (HP-Scaled Blood Effects)
// Version: 2.7.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Shows enemy attack sprite when performing attacks with HP-scaled blood particle system
 * @author Omni-Lex
 * @url https://your-website.com
 *
 * @help
 * ============================================================================
 * Reactive Enemy Battler System (HP-Scaled Blood Effects)
 * ============================================================================
 * 
 * This plugin automatically shows sprites when enemies attack, dodge, or counter.
 * Blood particle effects now scale based on damage percentage of enemy's total HP.
 * 
 * Damage Scaling:
 * - 0-5% HP: Minimal particles (5-10 particles)
 * - 5-10% HP: Light spray (10-20 particles)
 * - 10-20% HP: Medium spray (20-35 particles)
 * - 20-35% HP: Heavy spray (35-55 particles)
 * - 35-50% HP: Brutal spray (55-75 particles)
 * - 50%+ HP: Devastating spray (75-100 particles)
 * 
 * Naming Convention:
 * - Default (Idle): enemies/EnemyName.png
 * - Attack: enemies/hit/EnemyName_hit.png
 * - Dodge: enemies/dodge/EnemyName_dodge.png
 * - Counter: enemies/counter/EnemyName_counter.png
 * 
 * Enemy Note Tags:
 * - <NoBlood> - No damage particles
 * - <Bark> - Wood chips flying (no ground stains)
 * - <Spark> - Electric sparks (no ground stains)
 * - <Rock> - Rock debris flying (no ground stains)
 * - <GreenBlood> - Green blood with ground stains
 * - <AzureBlood> - Azure/cyan blood with ground stains
 * - <BlackBlood> - Black blood with ground stains
 * 
 * Default: Red blood with ground stains
 * 
 * Features:
 * - HP-scaled particle effects for realistic damage representation
 * - Enhanced blood spray with multiple particle types
 * - Dynamic spray patterns based on damage severity
 * - Secondary particle effects for heavy hits
 * - Blood stains accumulate on the ground permanently
 * - All enemies positioned 120px lower on screen
 * 
 * ============================================================================
 */

(() => {
    'use strict';

    // Hardcoded parameters
    const attackDuration = 40;
    const lungeScale = 1.15;
    const lungeDuration = 20;
    const dodgeDuration = 40;
    const dodgeDistance = 80;
    const counterDuration = 50;
    const jumpHeight = 15;
    const jumpDuration = 25;
    const defaultScale = 0.5;
    const yOffset = 206;
    const xOffset = 106;

    const groundLevel = 560;

    // Blood particles and ground stains live behind the battlers on the battle
    // field. The layer only exists on Spriteset_Battle, so this answers "is
    // there one" rather than reaching through _spriteset and assuming: in map
    // battle mode (MapBattleMode.js) the scene on screen is Scene_Map and its
    // spriteset has no _battleField at all. Returns true when the sprite was
    // placed.
    function _addToBattleField(sprite) {
        const scene = SceneManager._scene;
        const set = scene && scene._spriteset;
        const field = set && set._battleField;
        if (!field || typeof field.addChildAt !== 'function') return false;
        field.addChildAt(sprite, 0);
        return true;
    }

    // HP-based particle configurations.
    // Blood is deliberately sparse: a handful of short-lived drops, no mist and
    // no secondary shower, so even a round of multi-hit blows stays cheap.
    const hpScaledSprayConfig = {
        minimal: {     // 0-5% HP
            count: [2, 4],
            speed: [3, 6],
            spread: 120
        },
        light: {       // 5-10% HP
            count: [3, 5],
            speed: [4, 8],
            spread: 130
        },
        medium: {      // 10-20% HP
            count: [4, 7],
            speed: [5, 10],
            spread: 140
        },
        heavy: {       // 20-35% HP
            count: [6, 9],
            speed: [7, 12],
            spread: 150
        },
        brutal: {      // 35-50% HP
            count: [8, 11],
            speed: [8, 14],
            spread: 160
        },
        devastating: { // 50%+ HP
            count: [10, 14],
            speed: [9, 16],
            spread: 170
        }
    };

    // Particle type configurations
    const particleTypes = {
        blood: {
            colors: ['#8B0000', '#A00000', '#700000', '#900000', '#6B0000', '#B00000', '#5A0000'],
            stainColors: ['#8B0000', '#700000', '#600000', '#500000'],
            accumulates: true,
            gravity: 0.3,
            airResistance: 0.98,
            size: [3, 10],
            types: ['drop', 'streak', 'mist'],
            secondaryChance: 0.3
        },
        greenBlood: {
            colors: ['#00AA00', '#00CC00', '#009900', '#00BB00', '#008800', '#00DD00', '#007700'],
            stainColors: ['#00AA00', '#009900', '#007700', '#006600'],
            accumulates: true,
            gravity: 0.3,
            airResistance: 0.98,
            size: [3, 10],
            types: ['drop', 'streak', 'mist'],
            secondaryChance: 0.3
        },
        azureBlood: {
            colors: ['#0099CC', '#00AADD', '#0088BB', '#00BBEE', '#0077AA', '#00CCFF', '#0066AA'],
            stainColors: ['#0099CC', '#0088BB', '#0077AA', '#006699'],
            accumulates: true,
            gravity: 0.3,
            airResistance: 0.98,
            size: [3, 10],
            types: ['drop', 'streak', 'mist'],
            secondaryChance: 0.3
        },
        blackBlood: {
            colors: ['#1A1A1A', '#000000', '#0D0D0D', '#262626', '#333333', '#0A0A0A', '#404040'],
            stainColors: ['#1A1A1A', '#0D0D0D', '#000000', '#0A0A0A'],
            accumulates: true,
            gravity: 0.3,
            airResistance: 0.98,
            size: [3, 10],
            types: ['drop', 'streak', 'mist'],
            secondaryChance: 0.3
        },
        bark: {
            colors: ['#8B4513', '#A0522D', '#654321', '#704214', '#5C3317', '#9B6028'],
            stainColors: null,
            accumulates: false,
            gravity: 0.35,
            airResistance: 0.96,
            size: [3, 8],
            types: ['chunk'],
            secondaryChance: 0.2
        },
        spark: {
            colors: ['#FFFF00', '#FFDD00', '#FFAA00', '#FFCC00', '#FFF700', '#FFEE00'],
            stainColors: null,
            accumulates: false,
            gravity: -0.15,
            airResistance: 0.95,
            size: [2, 6],
            types: ['spark'],
            secondaryChance: 0.4
        },
        rock: {
            colors: ['#808080', '#696969', '#A9A9A9', '#778899', '#708090', '#909090'],
            stainColors: null,
            accumulates: false,
            gravity: 0.4,
            airResistance: 0.97,
            size: [4, 11],
            types: ['chunk'],
            secondaryChance: 0.15
        }
    };

    //-----------------------------------------------------------------------------
    // Shared bitmap cache (avoids allocating a new canvas per particle)
    //-----------------------------------------------------------------------------

    const _particleBitmapCache = new Map();

    function getCachedBitmap(key, size, drawFn) {
        let bmp = _particleBitmapCache.get(key);
        if (!bmp) {
            bmp = new Bitmap(size, size);
            drawFn(bmp);
            _particleBitmapCache.set(key, bmp);
        }
        return bmp;
    }

    //-----------------------------------------------------------------------------
    // Particle pool and spawn budget
    //
    // Damage sprays are the single most frequent thing this plugin puts on the
    // battle field, so the sprites are recycled rather than allocated, and both
    // the live count and the number spawned in one frame are capped. A round of
    // multi-hit blows lands inside the same budget as a single strike.
    //-----------------------------------------------------------------------------

    const MAX_LIVE_PARTICLES = 48;
    const MAX_PARTICLES_PER_FRAME = 14;
    const _particlePool = [];
    let _liveParticles = 0;
    let _budgetFrame = -1;
    let _spawnedThisFrame = 0;

    function grantParticleBudget(requested) {
        const frame = (typeof Graphics !== 'undefined' && Graphics.frameCount) || 0;
        if (frame !== _budgetFrame) {
            _budgetFrame = frame;
            _spawnedThisFrame = 0;
        }
        const room = Math.min(
            MAX_LIVE_PARTICLES - _liveParticles,
            MAX_PARTICLES_PER_FRAME - _spawnedThisFrame
        );
        const granted = Math.max(0, Math.min(requested, room));
        _spawnedThisFrame += granted;
        return granted;
    }

    function acquireParticle() {
        _liveParticles++;
        const particle = _particlePool.pop();
        if (!particle) return new Sprite();
        particle.scale.x = 1;
        particle.scale.y = 1;
        particle.rotation = 0;
        particle.opacity = 255;
        particle.blendMode = 0;
        return particle;
    }

    // The sprite stops being a particle. `keep` is for one that stays on screen
    // as a ground stain: it leaves the live count but is not recycled.
    function releaseParticle(particle, keep) {
        _liveParticles = Math.max(0, _liveParticles - 1);
        if (keep) return;
        if (particle.parent) particle.parent.removeChild(particle);
        particle._particleData = null;
        // Note: bitmap is shared/cached, do not destroy it here
        if (_particlePool.length < MAX_LIVE_PARTICLES) _particlePool.push(particle);
    }

    //-----------------------------------------------------------------------------
    // Scene_Battle - Initialize blood stain container
    //-----------------------------------------------------------------------------

    const _Scene_Battle_createSpriteset = Scene_Battle.prototype.createSpriteset;
    Scene_Battle.prototype.createSpriteset = function () {
        _Scene_Battle_createSpriteset.call(this);
        this._bloodStains = [];
        // Last battle's sprites died with its scene: start the count clean.
        _liveParticles = 0;
        _spawnedThisFrame = 0;
        _particlePool.length = 0;
    };

    //-----------------------------------------------------------------------------
    // Game_Enemy - Parse note tags
    //-----------------------------------------------------------------------------

    const _Game_Enemy_setup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function (enemyId, x, y) {
        _Game_Enemy_setup.call(this, enemyId, x, y);
        this.parseParticleType();
    };

    Game_Enemy.prototype.parseParticleType = function () {
        const note = this.enemy().note;

        if (note.match(/<NoBlood>/i)) {
            this._particleType = 'none';
        } else if (note.match(/<Bark>/i)) {
            this._particleType = 'bark';
        } else if (note.match(/<Spark>/i)) {
            this._particleType = 'spark';
        } else if (note.match(/<Rock>/i)) {
            this._particleType = 'rock';
        } else if (note.match(/<GreenBlood>/i)) {
            this._particleType = 'greenBlood';
        } else if (note.match(/<AzureBlood>/i)) {
            this._particleType = 'azureBlood';
        } else if (note.match(/<BlackBlood>/i)) {
            this._particleType = 'blackBlood';
        } else {
            this._particleType = 'blood';
        }
    };

    Game_Enemy.prototype.getParticleType = function () {
        return this._particleType || 'blood';
    };

    //-----------------------------------------------------------------------------
    // Sprite_Enemy
    //-----------------------------------------------------------------------------

    const _Sprite_Enemy_initialize = Sprite_Enemy.prototype.initialize;
    Sprite_Enemy.prototype.initialize = function (battler) {
        _Sprite_Enemy_initialize.call(this, battler);
        this.opacity = 0;
        this._fadeValue = 0;
        this._fadeInFinished = false;
        this._showingAttack = false;
        this._showingDodge = false;
        this._showingCounter = false;
        this._attackTimer = 0;
        this._defaultBattlerName = '';
        this._baseScale = defaultScale;
        this._baseX = 0;
        this._baseY = 0;
        this._bloodParticles = [];

        // Refactored lunge system
        this._lungeAnimation = {
            active: false,
            frame: 0,
            totalFrames: lungeDuration,
            targetScale: lungeScale
        };

        // Dodge system
        this._dodgeAnimation = {
            active: false,
            frame: 0,
            totalFrames: dodgeDuration,
            direction: 1,
            distance: dodgeDistance
        };

        // Jump system
        this._jumpAnimation = {
            active: false,
            frame: 0,
            totalFrames: jumpDuration,
            height: jumpHeight
        };

        this.scale.x = defaultScale;
        this.scale.y = defaultScale;
    };

    const _Sprite_Enemy_setBattler = Sprite_Enemy.prototype.setBattler;
    Sprite_Enemy.prototype.setBattler = function (battler) {
        _Sprite_Enemy_setBattler.call(this, battler);
        if (battler) {
            this._defaultBattlerName = battler.battlerName();
        }
    };

    const _Sprite_Enemy_updatePosition = Sprite_Enemy.prototype.updatePosition;
    Sprite_Enemy.prototype.updatePosition = function () {
        _Sprite_Enemy_updatePosition.call(this);
        this.y += yOffset;
        this.x += xOffset;

    };

    Sprite_Enemy.prototype.updateCharSprite = function () {
        if (!this._battler) return;

        if (this._charSpriteName === undefined) {
            const note = this._battler.enemy().note;
            const match = note.match(/<Char:\s*([^>]+)>/i);
            this._charSpriteName = match ? match[1] : null;
        }

        if (!this._charSpriteName) return;

        // Sprites mode (enemyBattlers === 2) renders the enemy's <Char:> sprite.
        // Falls back to the legacy charBasedSprites flag for older configs.
        const useCharSprites = (ConfigManager.enemyBattlers === 2) || ConfigManager.charBasedSprites;

        if (useCharSprites) {
            if (!this._charSprite) {
                this._charSprite = new Sprite();
                this._charSprite.anchor.x = 0.5;// Centered
                this._charSprite.anchor.y = 1.9;
                this.addChild(this._charSprite);

                this._charSprite.bitmap = ImageManager.loadCharacter('Monsters/' + this._charSpriteName);
                this._charFrameIndex = 0;
                this._charFrameCount = 0;
            }

            this._charSprite.visible = true;

            if (this._charSprite.bitmap.isReady()) {
                // Only blank the real enemy bitmap once the <Char:> sprite has
                // confirmed loaded. A missing Monsters/<Char> file leaves
                // _charSprite.bitmap non-ready, so we never swap to the empty
                // bitmap and the enemy stays visible instead of vanishing.
                if (this.bitmap && this.bitmap.isReady() && this.bitmap !== this._emptyBitmap) {
                    this._originalEnemyBitmap = this.bitmap;
                    this._emptyBitmap = new Bitmap(this.bitmap.width, this.bitmap.height);
                    this.bitmap = this._emptyBitmap;
                }

                const bw = this._charSprite.bitmap.width;
                const bh = this._charSprite.bitmap.height;
                const isSingle = this._charSpriteName.startsWith('$');

                let pw, ph;
                if (isSingle) {
                    pw = bw / 3;
                    ph = bh / 4;
                } else {
                    pw = bw / 12;
                    ph = bh / 8;
                }

                this._charFrameCount++;
                let frameChanged = false;
                if (this._charFrameCount >= 15) {
                    this._charFrameCount = 0;
                    this._charFrameIndex = (this._charFrameIndex + 1) % 4;
                    frameChanged = true;
                }

                // The animation frame only advances every 15 frames, so only
                // recompute the source rect then (or once when first primed);
                // setFrame() ran every frame for no visual change before.
                if (frameChanged || !this._charFramePrimed) {
                    this._charFramePrimed = true;

                    let pattern = 0;
                    if (this._charFrameIndex === 1) pattern = 1;
                    else if (this._charFrameIndex === 2) pattern = 2;
                    else if (this._charFrameIndex === 3) pattern = 1;

                    const row = 1; // Facing left
                    this._charSprite.setFrame(pattern * pw, row * ph, pw, ph);
                }

                // Constant scale - assign only once.
                if (this._charSprite.scale.x !== 9.0) {
                    this._charSprite.scale.x = 9.0; // 3x bigger
                    this._charSprite.scale.y = 9.0;
                }
            }
        } else {
            if (this._charSprite) {
                this._charSprite.visible = false;
            }
            if (this.bitmap === this._emptyBitmap && this._originalEnemyBitmap) {
                this.bitmap = this._originalEnemyBitmap;
            }
        }
    };

    const _Sprite_Enemy_update = Sprite_Enemy.prototype.update;
    Sprite_Enemy.prototype.update = function () {
        _Sprite_Enemy_update.call(this);

        this.updateCharSprite();

        // Store base position when not animating
        if (!this._dodgeAnimation.active && !this._jumpAnimation.active) {
            this._baseX = this.x;
            this._baseY = this.y;
        }

        this.updateFadeIn();
        this.updateAttackState();
        this.updateLungeAnimation();
        this.updateDodgeAnimation();
        this.updateJumpAnimation();
        this.updateBloodParticles();
    };

    Sprite_Enemy.prototype.updateFadeIn = function () {
        if (!this._fadeInFinished) {
            if (this._battler && this._battler.isAppeared()) {
                this._fadeValue = (this._fadeValue || 0) + 6;
                this.opacity = Math.min(255, this._fadeValue);
                if (this._fadeValue >= 255) {
                    this._fadeInFinished = true;
                }
            } else {
                this.opacity = 0;
                this._fadeValue = 0;
            }
        }
    };

    Sprite_Enemy.prototype.updateAttackState = function () {
        if (this._attackTimer > 0) {
            this._attackTimer--;
            if (this._attackTimer === 0) {
                this.returnToIdle();
            }
        }
    };

    // Refactored lunge animation
    // Refactored lunge animation
    // Refactored lunge animation - centered and subtle
    Sprite_Enemy.prototype.updateLungeAnimation = function () {
        const anim = this._lungeAnimation;
        if (!anim.active) return;

        anim.frame++;

        const halfFrames = anim.totalFrames / 2;
        let scale;

        if (anim.frame <= halfFrames) {
            // First half: scale up slightly (subtle zoom in)
            const t = anim.frame / halfFrames;
            const easedT = this.easeOutCubic(t); // Using cubic for smoother easing
            const targetScale = this._baseScale * anim.targetScale;
            scale = this._baseScale + (targetScale - this._baseScale) * easedT;
        } else {
            // Second half: scale back to normal
            const t = (anim.frame - halfFrames) / halfFrames;
            const easedT = this.easeInCubic(t); // Using cubic for smoother easing
            const targetScale = this._baseScale * anim.targetScale;
            scale = targetScale - (targetScale - this._baseScale) * easedT;
        }

        this.scale.x = scale;
        this.scale.y = scale;

        // End animation
        if (anim.frame >= anim.totalFrames) {
            anim.active = false;
            anim.frame = 0;
            this.scale.x = this._baseScale;
            this.scale.y = this._baseScale;
        }
    };

    // Refactored dodge animation
    Sprite_Enemy.prototype.updateDodgeAnimation = function () {
        const anim = this._dodgeAnimation;
        if (!anim.active) return;

        anim.frame++;

        const halfFrames = anim.totalFrames / 2;
        let offsetX = 0;

        if (anim.frame <= halfFrames) {
            // First half: move away
            const t = anim.frame / halfFrames;
            const easedT = this.easeOutQuad(t);
            offsetX = anim.distance * easedT * anim.direction;
        } else {
            // Second half: return
            const t = (anim.frame - halfFrames) / halfFrames;
            const easedT = this.easeInQuad(t);
            offsetX = anim.distance * (1 - easedT) * anim.direction;
        }

        this.x = this._baseX + offsetX;

        // End animation
        if (anim.frame >= anim.totalFrames) {
            anim.active = false;
            anim.frame = 0;
            this.x = this._baseX;
        }
    };

    // Refactored jump animation
    Sprite_Enemy.prototype.updateJumpAnimation = function () {
        const anim = this._jumpAnimation;
        if (!anim.active) return;

        anim.frame++;

        const halfFrames = anim.totalFrames / 2;
        let offsetY = 0;

        if (anim.frame <= halfFrames) {
            // First half: jump up
            const t = anim.frame / halfFrames;
            const easedT = this.easeOutQuad(t);
            offsetY = -anim.height * easedT;
        } else {
            // Second half: fall down
            const t = (anim.frame - halfFrames) / halfFrames;
            const easedT = this.easeInQuad(t);
            offsetY = -anim.height * (1 - easedT);
        }

        this.y = this._baseY + offsetY;

        // End animation
        if (anim.frame >= anim.totalFrames) {
            anim.active = false;
            anim.frame = 0;
            this.y = this._baseY;
        }
    };

    Sprite_Enemy.prototype.easeOutQuad = function (t) {
        return t * (2 - t);
    };

    Sprite_Enemy.prototype.easeInQuad = function (t) {
        return t * t;
    };

    // Cubic easing for smoother lunge animation
    Sprite_Enemy.prototype.easeOutCubic = function (t) {
        return 1 - Math.pow(1 - t, 3);
    };

    Sprite_Enemy.prototype.easeInCubic = function (t) {
        return t * t * t;
    };

    // NEW: Calculate damage percentage and determine spray intensity
    Sprite_Enemy.prototype.determineSprayIntensityByHP = function (damage, enemy) {
        if (!damage || !enemy) return 'minimal';

        const maxHp = enemy.mhp;
        const damagePercent = (damage / maxHp) * 100;

        // Determine intensity based on damage percentage
        if (damagePercent < 5) return 'minimal';
        if (damagePercent < 10) return 'light';
        if (damagePercent < 20) return 'medium';
        if (damagePercent < 35) return 'heavy';
        if (damagePercent < 50) return 'brutal';
        return 'devastating';
    };

    // MODIFIED: Enhanced particle creation with HP-based scaling
    Sprite_Enemy.prototype.createDamageParticles = function (damage = 100) {
        if (!this._enemy) return;

        const particleType = this._enemy.getParticleType();
        if (particleType === 'none') return;

        const config = particleTypes[particleType];
        if (!config || !this.parent) return;

        // Blood is shown for one thing only: a limb lost or destroyed, sprayed by
        // BloodSplatterFX from Health_Monsters. An ordinary blow draws none, so a
        // bleeding archetype leaves here before it costs anything. Bark, sparks
        // and rock chips are debris, not blood, and still fly on every hit.
        if (config.accumulates) return;

        // Use HP-based intensity calculation
        const intensity = this.determineSprayIntensityByHP(damage, this._enemy);
        const sprayData = hpScaledSprayConfig[intensity];

        // Calculate actual particle count (random between min and max)
        const particleCount = Math.floor(
            sprayData.count[0] + Math.random() * (sprayData.count[1] - sprayData.count[0])
        );

        // Fixed 100px spread from sprite center
        const maxSpread = 50;

        // Calculate spray origin. In 3D models mode the 2D sprite is hidden at the
        // old 2D slot, so bleed from the struck 3D limb instead (battleField-local
        // coords, the same space these particles are added in).
        let spriteCenterX = this.x;
        let spriteCenterY = this.y - 270; // Adjusted for sprite anchor (720px * 0.75 / 2)
        const _ss = SceneManager._scene && SceneManager._scene._spriteset;
        if (_ss && _ss.getBattlerPartPosition && this._enemy) {
            const _p = _ss.getBattlerPartPosition(this._enemy, this._enemy._fxLastHitPart);
            if (_p) { spriteCenterX = _p.x; spriteCenterY = _p.y; }
        }

        // One impact point, always: extra spawn points tripled the sprite count
        // for no readable gain on screen.
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * maxSpread;
        const pointX = spriteCenterX + Math.cos(angle) * distance;
        const pointY = spriteCenterY + Math.sin(angle) * distance;

        const granted = grantParticleBudget(particleCount);
        for (let i = 0; i < granted; i++) {
            this.createParticle(pointX, pointY, config, sprayData, false, intensity);
        }
    };

    // MODIFIED: Enhanced particle creation with intensity parameter
    Sprite_Enemy.prototype.createParticle = function (centerX, centerY, config, sprayData, isSecondary, intensity) {
        const particle = acquireParticle();
        const particleType = this._enemy.getParticleType();

        // Determine particle visual type
        const visualTypes = config.types || ['drop'];
        let visualType = visualTypes[Math.floor(Math.random() * visualTypes.length)];

        // Bias toward streaks for heavy damage
        if ((intensity === 'brutal' || intensity === 'devastating') && Math.random() < 0.6) {
            visualType = 'streak';
        }

        // Size variation based on intensity
        const sizeMultiplier = isSecondary ? 0.4 : 1;
        const intensityMultiplier = intensity === 'devastating' ? 1.3 :
            intensity === 'brutal' ? 1.2 :
                intensity === 'heavy' ? 1.1 : 1.0;
        const size = (Math.random() * (config.size[1] - config.size[0]) + config.size[0]) * sizeMultiplier * intensityMultiplier;

        // Color with variation
        const colorIndex = Math.floor(Math.random() * config.colors.length);
        const color = config.colors[colorIndex];
        const darkerColor = this.darkenColor(color, 0.7);

        // Bucket the size so similarly-sized particles share a cached bitmap
        const sizeBucket = Math.max(1, Math.round(size));
        const bitmapSize = sizeBucket * 4;
        const cacheKey = `${particleType}_${visualType}_${color}_${sizeBucket}`;

        particle.bitmap = getCachedBitmap(cacheKey, bitmapSize, (bmp) => {
            // Draw particle based on type
            if (visualType === 'drop') {
                this.drawBloodDrop(bmp, sizeBucket * 2, color, darkerColor);
            } else if (visualType === 'streak') {
                this.drawStreak(bmp, sizeBucket * 2, color);
            } else if (visualType === 'mist') {
                this.drawMist(bmp, sizeBucket * 2, color);
            } else if (visualType === 'spark') {
                this.drawSpark(bmp, sizeBucket * 2, color);
            } else if (visualType === 'chunk') {
                if (particleType === 'bark') {
                    this.drawBark(bmp, sizeBucket * 2, color);
                } else {
                    this.drawRock(bmp, sizeBucket * 2, color);
                }
            }
        });

        particle.anchor.x = 0.5;
        particle.anchor.y = 0.5;
        particle.x = centerX + (Math.random() - 0.5) * 20;
        particle.y = centerY + (Math.random() - 0.5) * 20;
        particle.blendMode = particleType === 'spark' ? 1 : 0;
        particle.opacity = isSecondary ? 200 : 255;

        // Enhanced spray pattern based on intensity
        const spreadAngle = sprayData.spread;
        const baseAngle = (Math.PI * 0.25) + (Math.random() * Math.PI * 1.5);
        const angle = baseAngle + (Math.random() - 0.5) * (spreadAngle * Math.PI / 180);

        const minSpeed = sprayData.speed[0];
        const maxSpeed = sprayData.speed[1];
        const speed = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * (isSecondary ? 0.6 : 1);

        // Longer life for more severe wounds
        const lifeMultiplier = intensity === 'devastating' ? 1.5 :
            intensity === 'brutal' ? 1.3 :
                intensity === 'heavy' ? 1.1 : 1.0;

        particle._particleData = {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - (isSecondary ? 2 : 4),
            gravity: config.gravity * (isSecondary ? 0.8 : 1),
            airResistance: config.airResistance,
            life: Math.floor((isSecondary ? 30 : 45) * lifeMultiplier),
            maxLife: Math.floor((isSecondary ? 30 : 45) * lifeMultiplier),
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * (isSecondary ? 0.2 : 0.4),
            isGrounded: false,
            type: particleType,
            visualType: visualType,
            // Regular damage sprays fade out and never pool: only losing a body
            // part leaves a permanent puddle (owned by BloodSplatterFX.createGib).
            accumulates: false,
            color: color,
            enemyX: centerX,
            isSecondary: isSecondary,
            initialSpeed: speed,
            stainChance: 0,
            intensity: intensity
        };

        this._bloodParticles.push(particle);

        _addToBattleField(particle);
    };

    Sprite_Enemy.prototype.darkenColor = function (color, factor) {
        const r = parseInt(color.substr(1, 2), 16);
        const g = parseInt(color.substr(3, 2), 16);
        const b = parseInt(color.substr(5, 2), 16);

        const newR = Math.floor(r * factor);
        const newG = Math.floor(g * factor);
        const newB = Math.floor(b * factor);

        return '#' +
            newR.toString(16).padStart(2, '0') +
            newG.toString(16).padStart(2, '0') +
            newB.toString(16).padStart(2, '0');
    };

    Sprite_Enemy.prototype.drawBloodDrop = function (bitmap, size, color, darkerColor) {
        const ctx = bitmap._context;
        const centerX = size;
        const centerY = size;

        const gradient = ctx.createRadialGradient(centerX - size * 0.2, centerY - size * 0.2, 0, centerX, centerY, size * 0.5);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, darkerColor);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
    };

    Sprite_Enemy.prototype.drawStreak = function (bitmap, size, color) {
        const ctx = bitmap._context;
        const centerX = size;
        const centerY = size;

        ctx.strokeStyle = color;
        ctx.lineWidth = size * 0.3;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.5, centerY);
        ctx.lineTo(centerX + size * 0.5, centerY - size * 0.2);
        ctx.stroke();
    };

    Sprite_Enemy.prototype.drawMist = function (bitmap, size, color) {
        const ctx = bitmap._context;
        const centerX = size;
        const centerY = size;

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;

        for (let i = 0; i < 3; i++) {
            const offsetX = (Math.random() - 0.5) * size * 0.3;
            const offsetY = (Math.random() - 0.5) * size * 0.3;
            ctx.beginPath();
            ctx.arc(centerX + offsetX, centerY + offsetY, size * 0.25, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1.0;
    };

    Sprite_Enemy.prototype.drawSpark = function (bitmap, size, color) {
        const ctx = bitmap._context;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const radius = i % 2 === 0 ? size * 0.6 : size * 0.2;
            const x = size + Math.cos(angle) * radius;
            const y = size + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    };

    Sprite_Enemy.prototype.drawRock = function (bitmap, size, color) {
        const ctx = bitmap._context;
        ctx.fillStyle = color;

        const sides = 5 + Math.floor(Math.random() * 3);
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i * Math.PI * 2) / sides + Math.random() * 0.5;
            const radius = size * (0.4 + Math.random() * 0.3);
            const x = size + Math.cos(angle) * radius;
            const y = size + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    };

    Sprite_Enemy.prototype.drawBark = function (bitmap, size, color) {
        const ctx = bitmap._context;
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.ellipse(size, size, size * 0.6, size * 0.3, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    };

    // MODIFIED: Enhanced particle update with stain chance based on intensity
    Sprite_Enemy.prototype.updateBloodParticles = function () {
        // The common case, a battler with nothing in flight, costs one check.
        if (!this._bloodParticles || this._bloodParticles.length === 0) return;
        for (let i = this._bloodParticles.length - 1; i >= 0; i--) {
            const particle = this._bloodParticles[i];
            const data = particle._particleData;

            // A sprite with no particle data can never age out through the
            // paths below, so it would tick for the rest of the fight. Drop it.
            if (!data) {
                releaseParticle(particle, false);
                this._bloodParticles.splice(i, 1);
                continue;
            }

            if (!data.isGrounded && data.accumulates && particle.y >= groundLevel) {
                data.isGrounded = true;
                data.vy = 0;
                data.vx = 0;
                particle.y = groundLevel;

                this.convertToGroundStain(particle, data);
                releaseParticle(particle, true);
                this._bloodParticles.splice(i, 1);
                continue;
            }

            if (!data.isGrounded) {
                particle.x += data.vx;
                particle.y += data.vy;
                data.vy += data.gravity;

                data.vx *= data.airResistance;
                data.vy *= data.airResistance;

                if (data.visualType === 'drop' || data.visualType === 'chunk') {
                    particle.rotation += data.rotationSpeed;
                } else if (data.visualType === 'streak') {
                    particle.rotation = Math.atan2(data.vy, data.vx);
                }

                data.life--;

                const fadeRatio = data.type === 'spark' ? 0.6 : 0.4;
                if (data.life < data.maxLife * fadeRatio) {
                    particle.opacity = 255 * (data.life / (data.maxLife * fadeRatio));
                }

                if (data.type === 'spark') {
                    const scale = 0.3 + 0.7 * (data.life / data.maxLife);
                    particle.scale.x = scale;
                    particle.scale.y = scale;
                } else if (data.visualType === 'streak') {
                    const speed = Math.sqrt(data.vx * data.vx + data.vy * data.vy);
                    particle.scale.x = 0.5 + speed / data.initialSpeed;
                    particle.scale.y = 0.5 + 0.5 * (data.life / data.maxLife);
                } else if (data.visualType === 'mist') {
                    const scale = 1.0 + (1.0 - data.life / data.maxLife) * 0.5;
                    particle.scale.x = scale;
                    particle.scale.y = scale;
                    particle.opacity = Math.max(0, particle.opacity - 1);
                } else {
                    const scale = 0.6 + 0.4 * (data.life / data.maxLife);
                    particle.scale.x = scale;
                    particle.scale.y = scale;
                }

                // A spray particle simply expires. One that accumulates is
                // meant to outlive its own life counter and keep falling until
                // it lands and turns into a ground stain, but one that never
                // gets there (spawned below the field, blown out of frame, or
                // added to no layer at all) used to tick and be submitted to
                // the renderer for the rest of the battle: it gets a backstop
                // three seconds past its life instead.
                const gone = data.accumulates
                    ? (data.life < -180 || particle.y > groundLevel + 100)
                    : (data.life <= 0 || particle.y > groundLevel + 100);
                if (gone) {
                    releaseParticle(particle, false);
                    this._bloodParticles.splice(i, 1);
                }
            }
        }
    };

    // Cap the number of accumulated ground stains so they don't grow unbounded
    // across a long battle. When over the cap, drop the oldest sprite.
    const MAX_BLOOD_STAINS = 24;
    function enforceBloodStainCap() {
        const scene = SceneManager._scene;
        if (!scene || !scene._bloodStains) return;
        const stains = scene._bloodStains;
        while (stains.length > MAX_BLOOD_STAINS) {
            const oldest = stains.shift();
            if (oldest) {
                if (oldest.parent) oldest.parent.removeChild(oldest);
                // bitmap is shared/cached; default destroy() keeps the texture.
                if (typeof oldest.destroy === 'function') oldest.destroy();
            }
        }
    }

    // MODIFIED: Use stain chance from particle data
    Sprite_Enemy.prototype.convertToGroundStain = function (particle, data) {
        if (!SceneManager._scene || !SceneManager._scene._spriteset) return;

        particle.opacity = 180 + Math.random() * 75;
        particle.rotation = 0;
        particle.scale.x = 0.7 + Math.random() * 0.3;
        particle.scale.y = 0.7 + Math.random() * 0.3;

        const verticalSpread = Math.random() * 40;
        particle.y = groundLevel + verticalSpread;

        if (!SceneManager._scene._bloodStains) {
            SceneManager._scene._bloodStains = [];
        }
        SceneManager._scene._bloodStains.push(particle);
        enforceBloodStainCap();

        // Use stain chance from particle data
        if (!data.isSecondary && Math.random() < data.stainChance) {
            this.createGroundStain(data.enemyX, particle.y, data.type, data.color, data.intensity);
        }
    };

    // MODIFIED: Enhanced ground stains based on intensity
    Sprite_Enemy.prototype.createGroundStain = function (enemyX, y, type, particleColor, intensity) {
        if (!SceneManager._scene || !SceneManager._scene._spriteset) return;

        const config = particleTypes[type];
        if (!config || !config.accumulates) return;

        // More stains for higher intensity
        const stainCount = intensity === 'devastating' ? 3 :
            intensity === 'brutal' ? 2 : 1;

        for (let s = 0; s < stainCount; s++) {
            const stain = new Sprite();

            // Larger stains for more severe wounds
            const sizeMultiplier = intensity === 'devastating' ? 1.5 :
                intensity === 'brutal' ? 1.3 :
                    intensity === 'heavy' ? 1.1 : 1.0;
            const sizeBucket = Math.round((Math.random() * 12 + 8) * sizeMultiplier);
            const stainColors = config.stainColors || config.colors;
            const color = stainColors[Math.floor(Math.random() * stainColors.length)];
            // A handful of pre-rendered variants per (type, size, color) avoids
            // allocating + drawing a brand new canvas for every single stain
            const variantCount = 4;
            const variantIdx = Math.floor(Math.random() * variantCount);
            const cacheKey = `stain_${type}_${sizeBucket}_${color}_${variantIdx}`; // i18n-ignore: bitmap cache key

            stain.bitmap = getCachedBitmap(cacheKey, sizeBucket, (bmp) => {
                const ctx = bmp._context;
                ctx.fillStyle = color;

                // Draw irregular stain with multiple circles
                const numCircles = Math.floor(Math.random() * 4) + 3;
                for (let i = 0; i < numCircles; i++) {
                    const offsetX = (Math.random() - 0.5) * sizeBucket * 0.6;
                    const offsetY = (Math.random() - 0.5) * sizeBucket * 0.6;
                    const radius = Math.random() * sizeBucket * 0.35 + sizeBucket * 0.15;
                    ctx.globalAlpha = 0.3 + Math.random() * 0.4;
                    ctx.beginPath();
                    ctx.arc(sizeBucket / 2 + offsetX, sizeBucket / 2 + offsetY, radius, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.globalAlpha = 1.0;
            });

            stain.anchor.x = 0.5;
            stain.anchor.y = 0.5;

            // Wider spread for more intense damage
            const spreadMultiplier = intensity === 'devastating' ? 2.0 :
                intensity === 'brutal' ? 1.5 : 1.0;
            const spreadX = (Math.random() - 0.5) * 70 * spreadMultiplier;
            stain.x = enemyX + spreadX + (s * 20 - stainCount * 10);
            stain.y = y + Math.random() * 10;
            stain.opacity = 160 + Math.random() * 95;
            stain.blendMode = 0;

            _addToBattleField(stain);

            if (!SceneManager._scene) continue;
            if (!SceneManager._scene._bloodStains) {
                SceneManager._scene._bloodStains = [];
            }
            SceneManager._scene._bloodStains.push(stain);
        }
        enforceBloodStainCap();
    };

    Sprite_Enemy.prototype.loadBitmapWithHue = function (filename) {
        if (!this._enemy) return;

        const bitmap = ImageManager.loadEnemy(filename);
        const hue = this._enemy.battlerHue();

        bitmap.addLoadListener(() => {
            if (this.bitmap === bitmap) {
                this.setHue(hue);
            }
        });

        this.bitmap = bitmap;
        this.setHue(hue);
    };

    Sprite_Enemy.prototype.showAttackSprite = function (isSkill = false) {
        if (!this._enemy || this._showingAttack) return;

        if (isSkill) {
            const hitFilename = 'hit/' + this._defaultBattlerName + '_hit';
            const bitmap = ImageManager.loadEnemy(hitFilename);
            const hue = this._enemy.battlerHue();

            // Only swap to the hit bitmap once it has loaded successfully; a
            // missing hit/<name>_hit.png must not blank out the enemy sprite.
            bitmap.addLoadListener(() => {
                if (bitmap.isError()) return;
                this.bitmap = bitmap;
                this.setHue(hue);
                this._showingAttack = true;
                this._attackTimer = attackDuration;
            });

            this.startJump();
        } else {
            this.startLunge();
        }
    };

    Sprite_Enemy.prototype.showDodgeSprite = function () {
        if (!this._enemy || this._showingDodge) return;
        this.startDodge();
    };

    Sprite_Enemy.prototype.showCounterSprite = function () {
        if (!this._enemy || this._showingCounter) return;
        this.startLunge();
    };

    Sprite_Enemy.prototype.returnToIdle = function () {
        if (!this._enemy) return;
        if (!this._showingAttack && !this._showingDodge && !this._showingCounter) return;

        this._showingAttack = false;
        this._showingDodge = false;
        this._showingCounter = false;

        this.loadBitmapWithHue(this._defaultBattlerName);
        this._appeared = this._enemy.isAlive();
    };

    // Refactored trigger methods
    Sprite_Enemy.prototype.startLunge = function () {
        this._lungeAnimation.active = true;
        this._lungeAnimation.frame = 0;
    };

    Sprite_Enemy.prototype.startDodge = function () {
        this._dodgeAnimation.active = true;
        this._dodgeAnimation.frame = 0;
        this._dodgeAnimation.direction = Math.random() < 0.5 ? -1 : 1;
    };

    Sprite_Enemy.prototype.startJump = function () {
        this._jumpAnimation.active = true;
        this._jumpAnimation.frame = 0;
    };

    const _Sprite_Enemy_updateBitmap = Sprite_Enemy.prototype.updateBitmap;
    Sprite_Enemy.prototype.updateBitmap = function () {
        const name = this._enemy.battlerName();
        if (this._battlerName !== name && !this._showingAttack && !this._showingDodge && !this._showingCounter) {
            this._battlerName = name;
            this._defaultBattlerName = name;
            this.loadBitmapWithHue(name);
        }
    };

    //-----------------------------------------------------------------------------
    // Game_Action
    //-----------------------------------------------------------------------------

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        const subject = this.subject();

        // Trigger lunge animation for enemy attackers
        if (subject && subject.isEnemy()) {
            const sprite = subject.getBattlerSprite();
            if (sprite) {
                const item = this.item();
                // Normal attack (not a skill)
                if (item && DataManager.isSkill(item) && item.id === subject.attackSkillId()) {
                    sprite.startLunge();
                }
                // Skills trigger jump instead (handled in showAttackSprite)
            }
        }

        _Game_Action_apply.call(this, target);

        if (target && target.isEnemy()) {
            const result = target.result();
            if (result.isHit() && result.hpDamage > 0) {
                const item = this.item();
                if (item && (item.damage.elementId === 1 || item.damage.elementId === -1)) {
                    const damage = result.hpDamage;
                    setTimeout(() => {
                        const sprite = target.getBattlerSprite();
                        if (sprite) {
                            sprite.createDamageParticles(damage);
                        }
                    }, 100);
                }
            }
        }
    };

    //-----------------------------------------------------------------------------
    // Game_Enemy
    //-----------------------------------------------------------------------------

    const _Game_Enemy_performEvasion = Game_Enemy.prototype.performEvasion;
    Game_Enemy.prototype.performEvasion = function () {
        _Game_Enemy_performEvasion.call(this);

        const sprite = this.getBattlerSprite();
        if (sprite) {
            sprite.showDodgeSprite();
        }
    };

    const _Game_Enemy_performCounter = Game_Enemy.prototype.performCounter;
    Game_Enemy.prototype.performCounter = function () {
        _Game_Enemy_performCounter.call(this);

        const sprite = this.getBattlerSprite();
        if (sprite) {
            sprite.showCounterSprite();
        }
    };

    Game_Enemy.prototype.getBattlerSprite = function () {
        if (!SceneManager._scene || !SceneManager._scene._spriteset) {
            return null;
        }

        const spriteset = SceneManager._scene._spriteset;
        if (!spriteset._enemySprites) return null;

        for (const sprite of spriteset._enemySprites) {
            if (sprite._battler === this) {
                return sprite;
            }
        }
        return null;
    };

    // Disable default blink and whiten effects
    Sprite_Enemy.prototype.updateBlink = function () {
        // Disabled - no transparency blink effect
    };

    Sprite_Enemy.prototype.updateWhiten = function () {
        // Disabled - no white flash effect
    };

    // Disable default state icon over the enemy
    Sprite_Enemy.prototype.initStateIcon = function () {
        // Disabled - states are shown in the custom HUD
    };

    // Damage popups stay at the per-battler position assigned in
    // Sprite_Battler.createDamageSprite. Pinning every popup to screen center
    // made multi-hit / multi-target numbers overlap at one point, so the
    // custom centering overrides were removed and vanilla positioning is kept.

    // Battle animations: in 3D models mode, lock the Effekseer effect onto the
    // body part that was struck and KEEP IT PLANTED there. The effect must not
    // drift as the model staggers/recoils after the hit, so the struck part's
    // screen position is resolved ONCE (re-centering only when a fresh hit lands
    // during the same animation) instead of tracking the live mesh every frame.
    // In 2D / Sprites mode the old random Y-spin is kept for variety.
    const _Sprite_Animation_setup = Sprite_Animation.prototype.setup;
    Sprite_Animation.prototype.setup = function(targets, animation, mirror, delay, previous) {
        _Sprite_Animation_setup.call(this, targets, animation, mirror, delay, previous);
        // Randomize Y rotation between -360 and 360 degrees (converted to radians).
        // Only animations whose name contains "*" get the random spin; all others
        // keep the rotation set in the database.
        const allowRandom = animation && typeof animation.name === "string" && animation.name.includes("*");
        this._randomYRotation = allowRandom ? (Math.random() * 720 - 360) * Math.PI / 180 : 0;
        this._fxLockedPos = null;   // frozen field-local position of the struck part
        this._fxLockedSeq = -1;     // the enemy._fxHitSeq this lock belongs to
        // The hit that this animation announces has not landed yet when the
        // effect starts (the battle log plays the animation, THEN applies the
        // damage), so remember the target's hit counter as it stands now: while
        // it is unchanged the effect sits on the body centre, and the moment it
        // moves the effect re-locks onto the limb that was actually struck.
        this._fxBaseSeq = null;
        const _t0 = targets && targets[0];
        const _b0 = _t0 && _t0._battler;
        if (_b0 && _b0.isEnemy && _b0.isEnemy()) this._fxBaseSeq = _b0._fxHitSeq || 0;
        this._fxFlashStopAt = -9999;
    };

    // Returns the enemy battler this animation should localise onto IF its struck
    // body part is (or already was) resolvable in 3D, else null (-> default).
    Sprite_Animation.prototype._reactive3DPartBattler = function() {
        const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
        if (!spriteset || !spriteset.getBattlerPartPosition) return null;
        const target = this._targets && this._targets[0];
        const battler = target && target._battler;
        if (!battler || !battler.isEnemy || !battler.isEnemy()) return null;
        if (this._fxLockedPos) return battler;
        return spriteset.getBattlerPartPosition(battler, battler._fxLastHitPart) ? battler : null;
    };

    // Effekseer derives an effect's screen position from targetSpritePosition. In
    // 3D mode, centre the effect on the enemy model's body (not a specific limb)
    // so skill animations are centred on the enemy even in multi-battle where
    // enemies are spread across the field. The position is resolved ONCE and held
    // (no per-frame mesh tracking), so the effect does not slide along with the
    // model's stagger/recoil animation.
    const _Sprite_Animation_targetSpritePosition = Sprite_Animation.prototype.targetSpritePosition;
    Sprite_Animation.prototype.targetSpritePosition = function(sprite) {
        const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
        const battler = sprite && sprite._battler;
        if (spriteset && spriteset.getBattlerPartPosition && spriteset._battleField &&
            battler && battler.isEnemy && battler.isEnemy()) {
            let pos = this._fxLockedPos;
            const seq = battler._fxHitSeq || 0;
            // Lock on the first resolvable frame; re-center exactly once if a new
            // hit lands while this same animation is still playing. Pass null for
            // partKey so getBattlerPartPosition always returns the model centre
            // (not a random limb), keeping skill/Effekseer effects centred on the
            // enemy even in multi-battle.
            if (!pos || seq !== this._fxLockedSeq) {
                // Before the blow lands: the body centre. Once it has landed
                // (the hit counter moved past the value taken at setup): the
                // struck limb itself, so the effect finishes on the wound.
                const partKey = (this._fxBaseSeq !== null && seq !== this._fxBaseSeq)
                    ? battler._fxLastHitPart : null;
                const resolved = spriteset.getBattlerPartPosition(battler, partKey);
                if (resolved) {
                    this._fxLockedPos = pos = resolved;
                    this._fxLockedSeq = seq;
                }
            }
            if (pos) {
                spriteset._battleField.updateTransform();
                return spriteset._battleField.worldTransform.apply(new Point(pos.x, pos.y));
            }
        }
        return _Sprite_Animation_targetSpritePosition.call(this, sprite);
    };

    const _Sprite_Animation_updateEffectGeometry = Sprite_Animation.prototype.updateEffectGeometry;
    Sprite_Animation.prototype.updateEffectGeometry = function() {
        _Sprite_Animation_updateEffectGeometry.call(this);
        // Keep the random Y-spin only when NOT localised onto a 3D limb.
        if (this._handle && this._randomYRotation !== undefined && !this._reactive3DPartBattler()) {
            const r = Math.PI / 180;
            const rx = this._animation.rotation.x * r;
            const ry = (this._animation.rotation.y * r) + this._randomYRotation;
            const rz = this._animation.rotation.z * r;
            this._handle.setRotation(rx, ry, rz);
        }
    };

    //=========================================================================
    // Impact punctuation: the model stops on an effect's flash frames
    //=========================================================================
    // A skill or spell effect reads as an impact only if the body it lands on
    // answers it. Every flash frame authored into an animation (the moment the
    // effect "hits") freezes the target's 3D model for a beat and lights up the
    // struck limb, so a multi-hit spell punches once per flash instead of
    // playing over a model that carries on idling. Throttled so an effect built
    // out of a dense flash train does not lock the pose solid.
    const FLASH_STOP_MIN_GAP = 10;   // frames between two flash-driven freezes

    const _Sprite_Animation_processFlashTimings = Sprite_Animation.prototype.processFlashTimings;
    Sprite_Animation.prototype.processFlashTimings = function() {
        _Sprite_Animation_processFlashTimings.call(this);
        const timing = this._animation && this._animation.flashTimings
            ? this._animation.flashTimings.find(t => t.frame === this._frameIndex) : null;
        if (!timing) return;
        const now = Graphics.frameCount;
        if (now - this._fxFlashStopAt < FLASH_STOP_MIN_GAP) return;
        this._fxFlashStopAt = now;
        const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
        if (!spriteset || !spriteset.get3DModel) return;
        // Scale the freeze with the flash itself: a faint tick barely stops the
        // pose, a full white flash hangs it.
        const alpha = Math.max(0, Math.min(255, (timing.color && timing.color[3]) || 0));
        const intensity = 0.25 + (alpha / 255) * 0.45;
        for (const target of (this._targets || [])) {
            const battler = target && target._battler;
            if (!battler) continue;
            const model = spriteset.get3DModel(battler);
            if (!model) continue;
            if (model.triggerHitStop) model.triggerHitStop(intensity);
            if (model.flashBodyPart && battler._fxLastHitPart) {
                model.flashBodyPart(battler._fxLastHitPart);
            }
        }
    };

    //=========================================================================
    // Damage numbers
    //=========================================================================
    // The popup is the readout of the same impact: it is thrown from the limb
    // that was struck (3D mode), snaps in at a punched-up scale, and clears the
    // screen quickly instead of drifting for a second and a half.
    const DMG_POP_FRAMES = 8;        // scale punch-in
    const DMG_LIFE = 80;             // total popup life (vanilla: 90)
    const DMG_RISE_FRAMES = 16;      // how long the number climbs off the wound
    const DMG_RISE_PX = 34;          // how far it climbs, in game pixels
    const DMG_ANCHOR_UP = 40;        // it stands this far above its anchor point

    const _Sprite_Battler_createDamageSprite = Sprite_Battler.prototype.createDamageSprite;
    Sprite_Battler.prototype.createDamageSprite = function() {
        _Sprite_Battler_createDamageSprite.call(this);
        const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
        const battler = this._battler;
        if (!spriteset || !spriteset.getBattlerPartPosition || !battler) return;
        if (!battler.isEnemy || !battler.isEnemy()) return;
        const pos = spriteset.getBattlerPartPosition(battler, battler._fxLastHitPart);
        if (!pos) return;
        const sprite = this._damages[this._damages.length - 1];
        if (!sprite) return;
        // Stack repeats of the same batch upward off the wound rather than
        // piling every number on one point.
        const idx = this._damages.length - 1;
        sprite.x = pos.x + idx * 8;
        sprite.y = pos.y - idx * 16;
    };

    const _Sprite_Damage_initialize = Sprite_Damage.prototype.initialize;
    Sprite_Damage.prototype.initialize = function() {
        _Sprite_Damage_initialize.call(this);
        this._duration = DMG_LIFE;
        this._popFrame = 0;
        this._isCritical = false;
        this._domEl = null;
        this._domText = '';
        this._domMiss = false;
    };

    const _Sprite_Damage_setup = Sprite_Damage.prototype.setup;
    Sprite_Damage.prototype.setup = function(target) {
        const result = target.result();
        this._isCritical = !!(result && result.critical);
        _Sprite_Damage_setup.call(this, target);
    };

    // A critical is told by its own colour and size, so the vanilla red wash
    // over the digits (which only muddied them) is dropped.
    Sprite_Damage.prototype.setupCriticalEffect = function() {
        this._flashColor = [255, 220, 120, 120];
        this._flashDuration = 14;
    };

    //-------------------------------------------------------------------------
    // The popup is HTML, not a canvas sprite
    //-------------------------------------------------------------------------
    // The game view is drawn at a low internal resolution and then blown up to
    // the window, so anything painted into a bitmap arrives on screen soft. The
    // numbers are the one thing on the battle screen that has to be read at a
    // glance, so they are lifted out of the renderer and written as DOM over
    // the canvas, in the same face the party HUD uses. They stay crisp at any
    // window size, and the sprite behind them is kept only as their clock and
    // their anchor: it carries no children and paints nothing.
    const DMG_LAYER_ID = 'damage-popups';

    const DamagePopupDOM = {
        _layer: null,
        _style: null
    };
    window.DamagePopupDOM = DamagePopupDOM;

    DamagePopupDOM.css = function() {
        return `
            #${DMG_LAYER_ID} {
                position: fixed;
                left: 0; top: 0;
                width: 0; height: 0;
                overflow: visible;
                pointer-events: none;
                z-index: 190;
                font-family: var(--font-ui);
            }
            #${DMG_LAYER_ID} .dmg-pop {
                position: absolute;
                left: 0; top: 0;
                white-space: nowrap;
                font-weight: 700;
                line-height: 1;
                letter-spacing: -0.02em;
                will-change: transform, opacity;
                transform-origin: 50% 100%;
            }
            #${DMG_LAYER_ID} .dmg-layer {
                position: absolute;
                left: 0; top: 0;
                transform: translate(-50%, -100%);
            }
            /* The rim is a separate copy sitting under the face, so the stroke
               grows outwards only and never eats into the digits. */
            #${DMG_LAYER_ID} .dmg-stroke {
                -webkit-text-stroke: 5px rgba(10, 8, 14, 0.92);
                color: rgba(10, 8, 14, 0.92);
                text-shadow: 0 3px 6px rgba(0, 0, 0, 0.75);
            }
            #${DMG_LAYER_ID} .dmg-fill {
                background-image: linear-gradient(to bottom, #ffffff 0%, #f4f6fb 45%, #b9c4d6 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
            }
            #${DMG_LAYER_ID} .dmg-heal .dmg-fill {
                background-image: linear-gradient(to bottom, #ffffff 0%, #8ff2a8 45%, #3f9d5c 100%);
            }
            #${DMG_LAYER_ID} .dmg-mp .dmg-fill {
                background-image: linear-gradient(to bottom, #ffffff 0%, #9dc0ff 45%, #4a6fbd 100%);
            }
            #${DMG_LAYER_ID} .dmg-mpheal .dmg-fill {
                background-image: linear-gradient(to bottom, #ffffff 0%, #c9a6ff 45%, #7a4ec0 100%);
            }
            #${DMG_LAYER_ID} .dmg-crit .dmg-fill {
                background-image: linear-gradient(to bottom, #fffbe8 0%, #ffd45a 45%, #d08a12 100%);
            }
            #${DMG_LAYER_ID} .dmg-crit .dmg-stroke {
                -webkit-text-stroke-width: 6px;
                text-shadow: 0 3px 8px rgba(0, 0, 0, 0.8), 0 0 14px rgba(255, 190, 60, 0.7);
            }
            #${DMG_LAYER_ID} .dmg-miss .dmg-fill {
                background-image: linear-gradient(to bottom, #ffffff 0%, #d8d8d8 45%, #8e8e8e 100%);
            }
        `;
    };

    DamagePopupDOM.layer = function() {
        if (this._layer && this._layer.parentNode) return this._layer;
        if (typeof document === 'undefined') return null;
        const el = document.createElement('div');
        el.id = DMG_LAYER_ID;
        document.body.appendChild(el);
        this._layer = el;
        if (!this._style) {
            const style = document.createElement('style');
            style.textContent = this.css();
            document.head.appendChild(style);
            this._style = style;
        }
        return el;
    };

    // Where the canvas is on the page and how far it has been scaled up, so a
    // popup written in game pixels lands on the body it came from.
    // Every popup on screen asks for this every frame, and each popup writes its
    // own transform in between: read from the DOM each time, the browser has to
    // lay the page out again for every single one. It goes through the shared
    // per-frame read (Core/ParchmentToast.js), which the whole game's overlays
    // take ONE layout between them, and falls back to its own only without it.
    DamagePopupDOM.view = function() {
        const shared = window.FrameBudget && window.FrameBudget.canvasRect();
        const r = shared || (() => {
            const canvas = typeof Graphics !== 'undefined' ? Graphics._canvas : null;
            if (!canvas || !canvas.getBoundingClientRect) return null;
            return canvas.getBoundingClientRect();
        })();
        if (!r || !(r.width > 0) || !(r.height > 0)) return null;
        return {
            left: r.left,
            top: r.top,
            sx: r.width / Graphics.width,
            sy: r.height / Graphics.height
        };
    };

    // The punch-in curve: a small overshoot that settles back to 1 and holds.
    DamagePopupDOM.popScale = function(frame) {
        if (frame >= DMG_POP_FRAMES) return 1;
        const t = frame / DMG_POP_FRAMES;
        if (t < 0.75) return 0.35 + (1.18 - 0.35) * t;
        return 1.18 - (1.18 - 1) * ((t - 0.75) / 0.25);
    };

    // How far the number has climbed off the wound, by age in frames: thrown
    // up, then eased back down to the point it was struck at.
    DamagePopupDOM.riseAt = function(age) {
        const t = Math.min(age, DMG_RISE_FRAMES) / DMG_RISE_FRAMES;
        return Math.round(DMG_RISE_PX * Math.sin(t * Math.PI * 0.5) * (1 - 0.35 * t));
    };

    Sprite_Damage.prototype.popupClass = function() {
        if (this._domMiss) return 'dmg-miss';
        if (this._isCritical) return 'dmg-crit';
        switch (this._colorType) {
            case 1: return 'dmg-heal';
            case 2: return 'dmg-mp';
            case 3: return 'dmg-mpheal';
            default: return '';
        }
    };

    // Vanilla builds one child sprite per digit. Nothing is built at all now:
    // the text is remembered and handed to the DOM node on the first update.
    Sprite_Damage.prototype.createMiss = function() {
        this._domMiss = true;
        this._domText = window.T ? String(window.T('Battle.popup.miss')) : '';
    };

    Sprite_Damage.prototype.createDigits = function(value) {
        this._domMiss = false;
        this._domText = Math.abs(value).toString();
    };

    Sprite_Damage.prototype.createDomPopup = function() {
        const layer = DamagePopupDOM.layer();
        if (!layer) return null;
        const el = document.createElement('div');
        el.className = ('dmg-pop ' + this.popupClass()).trim();
        const stroke = document.createElement('div');
        stroke.className = 'dmg-layer dmg-stroke';
        stroke.textContent = this._domText;
        const fill = document.createElement('div');
        fill.className = 'dmg-layer dmg-fill';
        fill.textContent = this._domText;
        el.appendChild(stroke);
        el.appendChild(fill);
        layer.appendChild(el);
        this._domEl = el;
        return el;
    };

    Sprite_Damage.prototype.updateDomPopup = function() {
        if (!this._domText) return;
        const view = DamagePopupDOM.view();
        if (!view) return;
        const el = this._domEl || this.createDomPopup();
        if (!el) return;
        const age = DMG_LIFE - this._duration;
        const rise = DamagePopupDOM.riseAt(age);
        const k = DamagePopupDOM.popScale(this._popFrame);
        // A critical shakes itself out over the punch-in.
        const shake = (this._isCritical && this._popFrame < DMG_POP_FRAMES)
            ? (1 - this._popFrame / DMG_POP_FRAMES) * 6 * (this._popFrame % 2 ? 1 : -1)
            : 0;
        const wt = this.worldTransform;
        const gx = (wt && wt.tx !== undefined) ? wt.tx : this.x;
        const gy = (wt && wt.ty !== undefined) ? wt.ty : this.y;
        const x = view.left + (gx + shake) * view.sx;
        const y = view.top + (gy - DMG_ANCHOR_UP - rise) * view.sy;
        el.style.fontSize = (this.fontSize() * view.sy).toFixed(2) + 'px';
        el.style.transform = 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px) scale(' + k.toFixed(3) + ')';
        el.style.opacity = (this.opacity / 255).toFixed(3);
    };

    Sprite_Damage.prototype.removeDomPopup = function() {
        if (this._domEl && this._domEl.parentNode) this._domEl.parentNode.removeChild(this._domEl);
        this._domEl = null;
    };

    const _Sprite_Damage_update = Sprite_Damage.prototype.update;
    Sprite_Damage.prototype.update = function() {
        _Sprite_Damage_update.call(this);
        if (this._popFrame < DMG_POP_FRAMES) this._popFrame++;
        this.updateDomPopup();
    };

    Sprite_Damage.prototype.updateOpacity = function() {
        if (this._duration < 14) {
            this.opacity = (255 * this._duration) / 14;
        }
    };

    // Every way the popup can leave the screen ends here: the sprite is dropped
    // by its battler when its clock runs out, and the whole spriteset is thrown
    // away when the battle ends. A node left behind would hang over the map.
    const _Sprite_Damage_destroy = Sprite_Damage.prototype.destroy;
    Sprite_Damage.prototype.destroy = function(options) {
        this.removeDomPopup();
        if (_Sprite_Damage_destroy) _Sprite_Damage_destroy.call(this, options);
    };
})();
