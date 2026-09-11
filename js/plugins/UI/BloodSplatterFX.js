/*:
 * @target MZ
 * @plugindesc Blood Splatter FX v2.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * Blood Splatter FX Plugin for RPG Maker MZ
 * ============================================================================
 *
 * This plugin owns ONE effect: the blood thrown out when an enemy loses a body
 * part. The ordinary per-hit damage spray belongs to ReactiveEnemyBattler, so
 * a single blow never pays for two particle systems at once.
 *
 * Everything here is pooled, capped and deliberately sparse: a short burst of
 * drops plus a couple of lasting puddles, nothing more.
 *
 * ============================================================================
 * SETUP:
 * ============================================================================
 *
 * Set Enemy Archetypes (Optional):
 * To give different enemies different coloured blood, add a notetag to the
 * enemy's note box in the Database > Enemies tab.
 *
 * <Archetype: TypeName>
 *
 * Examples:
 * <Archetype: Goblin>       (You can set a green color in the params)
 * <Archetype: Insectoid>    (You can set a blue color in the params)
 * <Archetype: Undead>       (You can set a purple color in the params)
 *
 * If an enemy has no archetype, it will use the default blood color.
 *
 * ============================================================================
 * * @param archetypeColors
 * @text Archetype Blood Colors
 * @type struct<ArchetypeColor>[]
 * @desc Configure blood colors for different enemy archetypes.
 * @default ["{\"archetype\":\"Goblin\",\"color\":\"#00ff00\"}","{\"archetype\":\"Insectoid\",\"color\":\"#0080ff\"}","{\"archetype\":\"Undead\",\"color\":\"#800080\"}","{\"archetype\":\"Machine\",\"color\":\"#404040\"}"]
 *
 * @param defaultBloodColor
 * @text Default Blood Color
 * @type string
 * @desc Default blood color for enemies without a defined archetype.
 * @default #ff0000
 * * @param particleCount
 * @text Particle Count
 * @type number
 * @min 2
 * @max 24
 * @desc Number of blood particles thrown by a lost body part.
 * @default 12
 * * @param particleSize
 * @text Particle Size Range
 * @type string
 * @desc Min and max particle size (format: min,max).
 * @default 2,6
 * * @param splatterDuration
 * @text Splatter Duration
 * @type number
 * @min 10
 * @max 90
 * @desc Duration of the splatter animation in frames.
 * @default 40
 * * @param gravityStrength
 * @text Gravity Strength
 * @type number
 * @decimals 2
 * @min 0
 * @max 2
 * @desc Gravity effect on blood particles.
 * @default 0.5
 * * @param spreadAngle
 * @text Spread Angle
 * @type number
 * @min 30
 * @max 180
 * @desc Angle of the blood splatter spread in degrees.
 * @default 90
 * * @param initialSpeed
 * @text Initial Speed Range
 * @type string
 * @desc Min and max initial speed (format: min,max).
 * @default 4,10
 * * @param enableBloodStains
 * @text Enable Blood Stains
 * @type boolean
 * @desc If true, a lost body part leaves a puddle on the battlefield.
 * @default true
 * * @param stainOpacity
 * @text Stain Opacity
 * @type number
 * @min 10
 * @max 100
 * @desc Final opacity percentage of the blood stains.
 * @default 30
 */

/*~struct~ArchetypeColor:
 * @param archetype
 * @text Archetype Name
 * @type string
 * @desc Name of the enemy archetype (must match the notetag).
 * * @param color
 * @text Blood Color
 * @type string
 * @desc Hex color code for this archetype's blood.
 * @default #ff0000
 */

(() => {
    'use strict';

    // The plugin is registered under its folder ("UI/BloodSplatterFX"), so ask
    // for both spellings rather than silently falling back to every default.
    const parameters = Object.assign(
        {},
        PluginManager.parameters('BloodSplatterFX'),
        PluginManager.parameters('UI/BloodSplatterFX')
    );

    // Parse parameters
    const archetypeColors = JSON.parse(parameters.archetypeColors || '[]').map(str => JSON.parse(str));
    const defaultBloodColor = parameters.defaultBloodColor || '#ff0000';
    const particleCount = Number(parameters.particleCount) || 12;
    const particleSize = (parameters.particleSize || '2,6').split(',').map(n => Number(n));
    const splatterDuration = Number(parameters.splatterDuration) || 40;
    const gravityStrength = Number(parameters.gravityStrength) || 0.5;
    const spreadAngle = Number(parameters.spreadAngle) || 90;
    const initialSpeed = (parameters.initialSpeed || '4,10').split(',').map(n => Number(n));
    const enableBloodStains = parameters.enableBloodStains !== 'false';
    const stainOpacity = Number(parameters.stainOpacity) || 30;

    // Create archetype color map for quick lookup
    const colorMap = {};
    archetypeColors.forEach(ac => {
        colorMap[ac.archetype.toLowerCase()] = ac.color;
    });

    // Texture Cache: one drop shape and one puddle shape, tinted per archetype.
    let _bloodTexture = null;
    let _stainTexture = null;

    function createBloodTextures() {
        if (_bloodTexture) return;

        const renderer = Graphics.app.renderer;
        const g = new PIXI.Graphics();

        g.beginFill(0xFFFFFF);
        g.drawCircle(0, 0, 10);
        g.endFill();
        _bloodTexture = renderer.generateTexture(g);

        g.clear();
        g.beginFill(0xFFFFFF);
        g.drawEllipse(0, 0, 30, 20);
        g.endFill();
        _stainTexture = renderer.generateTexture(g);
    }

    //=============================================================================
    // BloodParticle
    // Class for an individual blood particle (Optimized with Sprites).
    //=============================================================================
    class BloodParticle extends PIXI.Sprite {
        constructor() {
            super();
            this.anchor.set(0.5);
        }

        init(texture, color, x, y, sizeMul = 1, speedMul = 1) {
            this.texture = texture;
            this.tint = parseInt(color.replace('#', '0x'));
            this.x = x;
            this.y = y;
            this.alpha = 1;

            const size = (particleSize[0] + Math.random() * (particleSize[1] - particleSize[0])) * sizeMul;
            const speed = (initialSpeed[0] + Math.random() * (initialSpeed[1] - initialSpeed[0])) * speedMul;
            const angleRad = (Math.random() * spreadAngle - spreadAngle / 2 - 90) * Math.PI / 180;

            this.velocityX = Math.cos(angleRad) * speed;
            this.velocityY = Math.sin(angleRad) * speed;
            this.scale.set(size / 10);
            this.life = splatterDuration;
            this.maxLife = splatterDuration;
            this.gravity = gravityStrength;
        }

        update() {
            this.life--;
            if (this.life <= 0) {
                return false;
            }

            this.velocityY += this.gravity;
            this.x += this.velocityX;
            this.y += this.velocityY;

            this.alpha = this.life / this.maxLife;

            this.velocityX *= 0.98;
            this.velocityY *= 0.98;

            return true;
        }
    }

    //=============================================================================
    // BloodStain
    // Class for a persistent blood stain (Optimized with Sprites).
    //=============================================================================
    class BloodStain extends PIXI.Sprite {
        constructor() {
            super();
            this.anchor.set(0.5);
        }

        init(texture, color, x, y, sizeMul = 1) {
            this.texture = texture;
            this.tint = parseInt(color.replace('#', '0x'));
            this.x = x + (Math.random() - 0.5) * 20 * sizeMul;
            this.y = y + (Math.random() - 0.5) * 20 * sizeMul;
            this.alpha = stainOpacity / 100;
            this.rotation = Math.random() * Math.PI * 2;
            const size = (0.5 + Math.random() * 1.5) * sizeMul;
            this.scale.set(size);
        }
    }

    //=============================================================================
    // BloodEffectManager
    // Manages the limb-loss bursts and their puddles, with pooling and caps.
    //=============================================================================
    class BloodEffectManager {
        constructor() {
            this.container = new PIXI.Container();
            this.stainContainer = new PIXI.Container();
            this.particles = [];
            this.stains = [];
            this.particlePool = [];
            this.stainPool = [];
            this.maxStains = 12;     // puddles kept on the field at once
            this.maxParticles = 48;  // hard cap for active particles
        }

        setup(parent) {
            if (parent) {
                parent.addChild(this.stainContainer);
                parent.addChild(this.container);
            }
        }

        // A severed/destroyed body part: a short spray plus a puddle of a couple
        // of overlapping stains. Limb loss is rare and deliberate, so it is the
        // only thing left that bleeds through this plugin.
        createGib(x, y, color) {
            createBloodTextures();

            const count = Math.min(particleCount, Math.max(0, this.maxParticles - this.particles.length));
            for (let i = 0; i < count; i++) {
                const particle = this.particlePool.pop() || new BloodParticle();
                particle.init(_bloodTexture, color, x, y, 1.4, 1.3); // bigger, faster
                this.container.addChild(particle);
                this.particles.push(particle);
            }

            if (enableBloodStains) {
                const stainCount = 2;
                for (let i = 0; i < stainCount; i++) {
                    let stain;
                    if (this.stains.length >= this.maxStains) {
                        stain = this.stains.shift();
                    } else {
                        stain = this.stainPool.pop() || new BloodStain();
                        this.stainContainer.addChild(stain);
                    }
                    stain.init(_stainTexture, color, x, y, 1.4);
                    this.stains.push(stain);
                }
            }
        }

        update() {
            // Nothing in flight means nothing to walk: the common case costs one
            // length check per frame.
            if (this.particles.length === 0) return;
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                if (!p.update()) {
                    this.container.removeChild(p);
                    this.particles.splice(i, 1);
                    this.particlePool.push(p);
                }
            }
        }

        clear() {
            this.particles.forEach(p => {
                this.container.removeChild(p);
                this.particlePool.push(p);
            });
            this.stains.forEach(s => {
                this.stainContainer.removeChild(s);
                this.stainPool.push(s);
            });
            this.particles = [];
            this.stains = [];
        }
    }

    //=============================================================================
    // Plugin Integration
    //=============================================================================

    const _Spriteset_Battle_createBattleback = Spriteset_Battle.prototype.createBattleback;
    Spriteset_Battle.prototype.createBattleback = function() {
        _Spriteset_Battle_createBattleback.call(this);
        this._bloodEffectManager = new BloodEffectManager();
        this._bloodEffectManager.setup(this._battleField);
    };

    const _Spriteset_Battle_update = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _Spriteset_Battle_update.call(this);
        if (this._bloodEffectManager) {
            this._bloodEffectManager.update();
        }
    };

    Game_Enemy.prototype.getArchetype = function() {
        const note = this.enemy().note;
        const match = note.match(/<Archetype:\s*(.+?)>/i);
        return match ? match[1].trim().toLowerCase() : null;
    };

    // colorMap is keyed by the lowercased archetype token. getArchetype is shared
    // with EnemyTalkSystem, which loads later and returns the tag verbatim, so the
    // key is normalised here rather than trusting whichever plugin defined it last.
    Game_Enemy.prototype.getBloodColor = function() {
        const archetype = this.getArchetype();
        if (!archetype) return defaultBloodColor;
        const key = String(archetype).trim().toLowerCase();
        return colorMap[key] || defaultBloodColor;
    };

    // Resolve the screen position to bleed from: the struck body part when we are
    // rendering this enemy in 3D, otherwise the centre of its battler sprite.
    Game_Enemy.prototype.bloodOriginPosition = function(spriteset, partKey) {
        if (spriteset.getBattlerPartPosition) {
            const p = spriteset.getBattlerPartPosition(this, partKey || this._fxLastHitPart);
            if (p) return p;
        }
        const sprite = spriteset.findTargetSprite(this);
        return sprite ? { x: sprite.x, y: sprite.y } : null;
    };

    // Called by Health_Monsters when a limb is severed/destroyed: a spray and a
    // puddle, localised to the lost part (3D) or the sprite (2D).
    Game_Enemy.prototype.spawnBodyPartLoss = function(partKey) {
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        if (!spriteset || !spriteset._bloodEffectManager) return;
        const pos = this.bloodOriginPosition(spriteset, partKey);
        if (pos) {
            spriteset._bloodEffectManager.createGib(pos.x, pos.y, this.getBloodColor());
        }
    };

    // Public hook so the health/limb system can trigger limb-loss blood without a
    // hard dependency on this plugin being present.
    window.BloodSplatterFX = window.BloodSplatterFX || {};
    window.BloodSplatterFX.onBodyPartLost = function(enemy, partKey) {
        if (enemy && enemy.isEnemy && enemy.isEnemy() && enemy.spawnBodyPartLoss) {
            enemy.spawnBodyPartLoss(partKey);
        }
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        if (SceneManager._scene._spriteset && SceneManager._scene._spriteset._bloodEffectManager) {
            SceneManager._scene._spriteset._bloodEffectManager.clear();
        }
        _BattleManager_endBattle.call(this, result);
    };

})();
