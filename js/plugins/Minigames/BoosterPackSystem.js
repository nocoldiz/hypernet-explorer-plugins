/*:
 * @target MZ
 * @plugindesc BoosterPackSystem v1.0.0
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Booster Pack System for RPGMaker MZ
 * ============================================================================
 * 
 * Opens booster packs containing skill cards with beautiful Art Deco
 * inspired visuals.
 * 
 * Features:
 * - Plugin command to open booster packs
 * - Category filtering based on skill note tags
 * - Rarity system based on energy cost
 * - Art Deco inspired card back designs
 * - Interactive card flipping mechanics
 * - Duplicate cards convert to gold (cost * 1000)
 * - Skills learned from packs are remembered
 * 
 * Skill Note Tags:
 * <category:CategoryName> - Assigns skill to a category for filtering
 * 
 * @param packSize
 * @text Pack Size
 * @type number
 * @default 4
 * @desc Number of cards per booster pack
 * 
 * @param packName
 * @text Default Pack Name
 * @type string
 * @default Skill Booster Pack
 * @desc Default name for booster packs when no categories are specified
 * 
 * @command openBoosterPack
 * @text Open Booster Pack
 * @desc Opens a booster pack with optional category filtering
 * 
 * @arg categories
 * @text Categories
 * @type string
 * @default 
 * @desc Comma-separated list of categories to include (leave empty for all)
 * 
 * @arg packName
 * @text Pack Name
 * @type string
 * @default 
 * @desc Custom name for the booster pack (overrides default naming)
 */

(() => {
    'use strict';
    
    const pluginName = 'BoosterPackSystem';
    const parameters = PluginManager.parameters(pluginName);
    const packSize = Number(parameters['packSize'] || 4);
    const defaultPackName = T.param(parameters['packName'], 'BoosterPack.defaultName');
    
    // Store skills learned from booster packs
    let $boosterPackSkills = [];
    
    // Helper function to calculate energy cost
    function calculateSkillEnergyCost(skillId) {
        const skill = $dataSkills[skillId];
        if (!skill) return 0;
        
        let cost = Math.floor((skill.mpCost + skill.tpCost) / 10);
        return Math.min(10, Math.max(0, cost));
    }
    
    // Helper function to get skill category from notes
    function getSkillCategory(skill) {
        if (!skill || !skill.note) return null;
        const match = skill.note.match(/<category:\s*(.+?)>/i);
        return match ? match[1].trim() : null;
    }
    
    // Helper function to determine rarity based on energy cost
    function getCardRarity(energyCost) {
        if (energyCost >= 8) return 'legendary';
        if (energyCost >= 5) return 'epic';
        if (energyCost >= 3) return 'rare';
        return 'common';
    }
    
    // Helper function to get rarity colors
    function getRarityColors(rarity) {
        switch (rarity) {
            case 'legendary':
                return { primary: '#ff6f00', secondary: '#e65100', glow: '#ffb74d' };
            case 'epic':
                return { primary: '#9c27b0', secondary: '#6a1b9a', glow: '#ce93d8' };
            case 'rare':
                return { primary: '#2196f3', secondary: '#1565c0', glow: '#90caf9' };
            default:
                return { primary: '#757575', secondary: '#424242', glow: '#bdbdbd' };
        }
    }
    
    // Plugin command registration
    PluginManager.registerCommand(pluginName, "openBoosterPack", args => {
        const categories = args.categories ? args.categories.split(',').map(c => c.trim()) : null;
        const packName = args.packName || '';
        SceneManager.push(Scene_BoosterPack);
        SceneManager.prepareNextScene(categories, packName);
    });
    
    // Save/load booster pack skills
    const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;
    Game_System.prototype.onAfterLoad = function() {
        _Game_System_onAfterLoad.call(this);
        $boosterPackSkills = this._boosterPackSkills || [];
    };
    
    const _Game_System_makeEmpty = Game_System.prototype.makeEmpty;
    Game_System.prototype.makeEmpty = function() {
        if (_Game_System_makeEmpty) _Game_System_makeEmpty.call(this);
        this._boosterPackSkills = [];
    };
    
    // Booster Pack Scene
    function Scene_BoosterPack() {
        this.initialize(...arguments);
    }
    
    Scene_BoosterPack.prototype = Object.create(Scene_Base.prototype);
    Scene_BoosterPack.prototype.constructor = Scene_BoosterPack;
    
    Scene_BoosterPack.prototype.initialize = function() {
        Scene_Base.prototype.initialize.call(this);
        this._categories = null;
        this._packName = '';
        this._availableSkills = [];
        this._packCards = [];
        this._cardSprites = [];
        this._selectedIndex = 0;
        this._flippedCards = 0;
        this._animating = false;
    };
    
    Scene_BoosterPack.prototype.prepare = function(categories, packName) {
        this._categories = categories;
        this._packName = packName || '';
    };
    
    Scene_BoosterPack.prototype.create = function() {
        Scene_Base.prototype.create.call(this);
        this.createBackground();
        this.generatePack();
        this.createCardSprites();
        this.createUI();
    };
    
    Scene_BoosterPack.prototype.createBackground = function() {
        // Create gradient background
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
        
        // Art Deco inspired gradient
        this._backgroundSprite.bitmap.gradientFillRect(
            0, 0, Graphics.width, Graphics.height,
            '#1a1a2e', '#16213e', true
        );
        
        // Add Art Deco pattern overlay
        this.drawArtDecoPattern(this._backgroundSprite.bitmap);
        this.addChild(this._backgroundSprite);
    };
    
    Scene_BoosterPack.prototype.drawArtDecoPattern = function(bitmap) {
        const ctx = bitmap.context;
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        
        // Draw geometric Art Deco patterns
        for (let x = 0; x < Graphics.width; x += 100) {
            for (let y = 0; y < Graphics.height; y += 100) {
                // Draw diamond pattern
                ctx.beginPath();
                ctx.moveTo(x + 50, y);
                ctx.lineTo(x + 100, y + 50);
                ctx.lineTo(x + 50, y + 100);
                ctx.lineTo(x, y + 50);
                ctx.closePath();
                ctx.stroke();
                
                // Draw inner lines
                ctx.beginPath();
                ctx.moveTo(x + 25, y + 25);
                ctx.lineTo(x + 75, y + 75);
                ctx.moveTo(x + 75, y + 25);
                ctx.lineTo(x + 25, y + 75);
                ctx.stroke();
            }
        }
        
        ctx.globalAlpha = 1;
        bitmap.baseTexture.update();
    };
    
    Scene_BoosterPack.prototype.generatePack = function() {
        this._availableSkills = this.getFilteredSkills();
        this._packCards = [];
        
        if (this._availableSkills.length === 0) {
            // Fallback to basic attack if no skills available
            const fallbackSkill = $dataSkills[1] || { id: 1, name: T('BoosterPack.fallbackSkill'), iconIndex: 76, description: '' };
            this._packCards.push({
                skillId: fallbackSkill.id,
                skill: fallbackSkill,
                energyCost: 1,
                rarity: 'common'
            });
            return;
        }
        
        // Generate pack with weighted rarity distribution
        for (let i = 0; i < packSize; i++) {
            const skill = this.selectRandomSkillByRarity();
            if (skill) {
                const energyCost = calculateSkillEnergyCost(skill.id);
                const rarity = getCardRarity(energyCost);
                
                this._packCards.push({
                    skillId: skill.id,
                    skill: skill,
                    energyCost: energyCost,
                    rarity: rarity
                });
            }
        }

        // Opening a pack is leisure; pulling a rare/legendary card is a win.
        if (window.MinigameFun) {
            const lucky = this._packCards.some(c => c.rarity === 'rare' || c.rarity === 'legendary');
            lucky ? window.MinigameFun.won('Card Counting') : window.MinigameFun.played('Card Counting');
        }
    };
    
    Scene_BoosterPack.prototype.getFilteredSkills = function() {
        const skills = [];
        
        // Get all skills from all actors
        for (let i = 1; i < $dataActors.length; i++) {
            const actor = $gameActors.actor(i);
            if (!actor) continue;
            
            const actorClass = $dataClasses[actor._classId];
            if (!actorClass || !actorClass.learnings) continue;
            
            for (const learning of actorClass.learnings) {
                const skill = $dataSkills[learning.skillId];
                if (!skill || !this.isSkillUsableInBattle(skill)) continue;
                
                // Check category filter
                if (this._categories && this._categories.length > 0) {
                    const skillCategory = getSkillCategory(skill);
                    if (!skillCategory || !this._categories.includes(skillCategory)) {
                        continue;
                    }
                }
                
                // Avoid duplicates
                if (!skills.some(s => s.id === skill.id)) {
                    skills.push(skill);
                }
            }
        }
        
        return skills;
    };
    
    Scene_BoosterPack.prototype.isSkillUsableInBattle = function(skill) {
        if (!skill) return false;
        if (skill.occasion === 3) return false; // Never usable
        if (skill.occasion === 2) return false; // Menu only
        return skill.occasion === 0 || skill.occasion === 1;
    };
    
    Scene_BoosterPack.prototype.selectRandomSkillByRarity = function() {
        if (this._availableSkills.length === 0) return null;
        
        // Weighted selection based on rarity
        const rarityWeights = { common: 60, rare: 25, epic: 12, legendary: 3 };
        const totalWeight = Object.values(rarityWeights).reduce((a, b) => a + b, 0);
        const random = Math.random() * totalWeight;
        
        let targetRarity = 'common';
        let weightSum = 0;
        
        for (const [rarity, weight] of Object.entries(rarityWeights)) {
            weightSum += weight;
            if (random <= weightSum) {
                targetRarity = rarity;
                break;
            }
        }
        
        // Find skills matching target rarity
        const matchingSkills = this._availableSkills.filter(skill => {
            const energyCost = calculateSkillEnergyCost(skill.id);
            const rarity = getCardRarity(energyCost);
            return rarity === targetRarity;
        });
        
        if (matchingSkills.length === 0) {
            // Fallback to any skill
            return this._availableSkills[Math.floor(Math.random() * this._availableSkills.length)];
        }
        
        return matchingSkills[Math.floor(Math.random() * matchingSkills.length)];
    };
    
    Scene_BoosterPack.prototype.createCardSprites = function() {
        const centerX = Graphics.width / 2;
        const centerY = Graphics.height / 2;
        const cardWidth = 160; // Card width from sprite
        const cardMargin = 20; // Margin between cards
        
        // Calculate total width needed for all cards with margins
        const cardCount = this._packCards.length;
        const totalCardsWidth = (cardCount * cardWidth) + ((cardCount - 1) * cardMargin);
        
        // Check if cards fit on screen with some padding
        const screenPadding = 40; // Minimum padding from screen edges
        const availableWidth = Graphics.width - (screenPadding * 2);
        
        let actualCardWidth = cardWidth;
        let actualMargin = cardMargin;
        
        // If cards don't fit, scale them down proportionally
        if (totalCardsWidth > availableWidth) {
            const scaleFactor = availableWidth / totalCardsWidth;
            actualCardWidth = cardWidth * scaleFactor;
            actualMargin = cardMargin * scaleFactor;
        }
        
        // Calculate starting X position to center all cards
        const totalActualWidth = (cardCount * actualCardWidth) + ((cardCount - 1) * actualMargin);
        const startX = (Graphics.width - totalActualWidth) / 2 + (actualCardWidth / 2); // Add half card width for anchor
        
        for (let i = 0; i < this._packCards.length; i++) {
            const cardData = this._packCards[i];
            const sprite = new Sprite_BoosterCard(cardData, i === this._selectedIndex);
            
            // Position each card with proper spacing
            sprite.x = startX + (i * (actualCardWidth + actualMargin));
            sprite.y = centerY;
            sprite.z = i === this._selectedIndex ? 100 : 50;
            
            // Scale sprite if needed
            if (actualCardWidth !== cardWidth) {
                const scale = actualCardWidth / cardWidth;
                sprite.scale.x = scale;
                sprite.scale.y = scale;
            }
            
            this._cardSprites.push(sprite);
            this.addChild(sprite);
        }
    };
    
    Scene_BoosterPack.prototype.createUI = function() {
        
        // Create pack info
        this._packInfoSprite = new Sprite();
        this._packInfoSprite.bitmap = new Bitmap(Graphics.width, 100);
        this._packInfoSprite.y = 20;
        
        this._packInfoSprite.bitmap.fontSize = 32;
        this._packInfoSprite.bitmap.textColor = '#ffd700';
        this._packInfoSprite.bitmap.fontBold = true;
        this._packInfoSprite.bitmap.outlineWidth = 4;
        this._packInfoSprite.bitmap.outlineColor = '#000000';
        
        let titleText = this.getPackTitle();
        
        this._packInfoSprite.bitmap.drawText(titleText, 0, 20, Graphics.width, 40, 'center');
        this.addChild(this._packInfoSprite);
    };
    
    Scene_BoosterPack.prototype.getPackTitle = function() {
        // If custom pack name is provided, use it
        if (this._packName && this._packName.trim()) {
            return this._packName.trim();
        }
        
        // Otherwise, generate title based on categories
        if (this._categories && this._categories.length > 0) {
            return T('BoosterPack.categoryTitle', { categories: this._categories.join(', ') });
        }
        
        // Fallback to plugin parameter default
        return defaultPackName;
    };
    
    Scene_BoosterPack.prototype.update = function() {
        Scene_Base.prototype.update.call(this);
        
        if (!this._animating && this._flippedCards < this._packCards.length) {
            if (Input.isTriggered('left')) {
                this.selectPreviousCard();
            } else if (Input.isTriggered('right')) {
                this.selectNextCard();
            } else if (Input.isTriggered('ok')) {
                this.flipSelectedCard();
            }
        }
        
        if (Input.isTriggered('cancel') && this._flippedCards === this._packCards.length) {
            this.exitScene();
        }
    };
    
    Scene_BoosterPack.prototype.selectPreviousCard = function() {
        if (this._flippedCards >= this._packCards.length) return;
        
        do {
            this._selectedIndex = (this._selectedIndex - 1 + this._packCards.length) % this._packCards.length;
        } while (this._cardSprites[this._selectedIndex] && this._cardSprites[this._selectedIndex]._flipped);
        
        this.updateCardSelection();
        SoundManager.playCursor();
    };
    
    Scene_BoosterPack.prototype.selectNextCard = function() {
        if (this._flippedCards >= this._packCards.length) return;
        
        do {
            this._selectedIndex = (this._selectedIndex + 1) % this._packCards.length;
        } while (this._cardSprites[this._selectedIndex] && this._cardSprites[this._selectedIndex]._flipped);
        
        this.updateCardSelection();
        SoundManager.playCursor();
    };
    
    Scene_BoosterPack.prototype.updateCardSelection = function() {
        for (let i = 0; i < this._cardSprites.length; i++) {
            const sprite = this._cardSprites[i];
            sprite.setSelected(i === this._selectedIndex);
            sprite.z = i === this._selectedIndex ? 100 : 50;
        }
        
        // Re-sort children by z-order
        this.children.sort((a, b) => (a.z || 0) - (b.z || 0));
    };
    
    Scene_BoosterPack.prototype.flipSelectedCard = function() {
        const sprite = this._cardSprites[this._selectedIndex];
        if (!sprite || sprite._flipped) return;
        
        this._animating = true;
        sprite.flip(() => {
            this._animating = false;
            this._flippedCards++;
            this.processCardReward(this._packCards[this._selectedIndex]);
            
            if (this._flippedCards < this._packCards.length) {
                this.selectNextAvailableCard();
            }
        });
        
        SoundManager.playMagicEvasion();
    };
    
    Scene_BoosterPack.prototype.selectNextAvailableCard = function() {
        for (let i = 0; i < this._packCards.length; i++) {
            if (!this._cardSprites[i]._flipped) {
                this._selectedIndex = i;
                this.updateCardSelection();
                break;
            }
        }
    };
    
    Scene_BoosterPack.prototype.processCardReward = function(cardData) {
        const actor1 = $gameParty.members()[0];
        if (!actor1) return;
        
        if (actor1.isLearnedSkill(cardData.skillId)) {
            // Duplicate skill: no payout. openBoosterPack is a free, repeatable
            // command, so paying energyCost*1000 gold per duplicate was an
            // unbounded gold mint for a party that already knew the skills.
        } else {
            // Learn skill
            actor1.learnSkill(cardData.skillId);
            
            // Remember the skill this pack handed over
            if (!$boosterPackSkills) $boosterPackSkills = [];
            if (!$boosterPackSkills.includes(cardData.skillId)) {
                $boosterPackSkills.push(cardData.skillId);
            }
            
            // Store in save data
            $gameSystem._boosterPackSkills = $boosterPackSkills;
        }
    };
    

    
    Scene_BoosterPack.prototype.exitScene = function() {
        SoundManager.playCancel();
        SceneManager.pop();
    };
    
    // Booster Card Sprite
    function Sprite_BoosterCard() {
        this.initialize(...arguments);
    }
    
    Sprite_BoosterCard.prototype = Object.create(Sprite.prototype);
    Sprite_BoosterCard.prototype.constructor = Sprite_BoosterCard;
    
    Sprite_BoosterCard.prototype.initialize = function(cardData, isSelected) {
        Sprite.prototype.initialize.call(this);
        
        this._cardData = cardData;
        this._selected = isSelected;
        this._flipped = false;
        this._flipAnimation = 0;
        this._glowAnimation = 0;
        
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        
        this.createBitmap();
        this.drawCardBack();
    };
    
    Sprite_BoosterCard.prototype.createBitmap = function() {
        this.bitmap = new Bitmap(160, 240); // Increased from 120x180 to 160x240
    };
    
    Sprite_BoosterCard.prototype.drawCardBack = function() {
        this.bitmap.clear();
        
        // Card shadow
        for (let i = 4; i > 0; i--) {
            const alpha = 0.1 * (5 - i);
            this.bitmap.fillRect(i, i, 160 - i, 240 - i, `rgba(0, 0, 0, ${alpha})`);
        }
        
        // Card border - gold
        this.bitmap.gradientFillRect(0, 0, 160, 240, '#ffd700', '#ffb300', true);
        
        // Inner card area - black
        this.bitmap.gradientFillRect(6, 6, 148, 228, '#1a1a1a', '#000000', true);
        
        // Art Deco pattern in gold
        this.drawArtDecoCardPattern();
        
        // Selection glow
        if (this._selected) {
            for (let i = 10; i > 0; i--) {
                const alpha = 0.1 * (11 - i);
                this.bitmap.strokeRect(-i, -i, 160 + i * 2, 240 + i * 2, `rgba(255, 215, 0, ${alpha})`, 3);
            }
        }
    };
    
    Sprite_BoosterCard.prototype.drawArtDecoCardPattern = function() {
        const ctx = this.bitmap.context;
        const colors = getRarityColors(this._cardData.rarity);
        
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = colors.glow;
        ctx.lineWidth = 1.5;
        
        // Central geometric pattern
        const centerX = 80;  // Updated for larger card
        const centerY = 120; // Updated for larger card
        
        // Draw radiating lines
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            const startRadius = 25;
            const endRadius = 50;
            
            ctx.beginPath();
            ctx.moveTo(
                centerX + Math.cos(angle) * startRadius,
                centerY + Math.sin(angle) * startRadius
            );
            ctx.lineTo(
                centerX + Math.cos(angle) * endRadius,
                centerY + Math.sin(angle) * endRadius
            );
            ctx.stroke();
        }
        
        // Draw concentric shapes
        for (let radius = 30; radius <= 45; radius += 7) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Draw corner decorations
        const corners = [
            [20, 20], [140, 20], [20, 220], [140, 220]
        ];
        
        for (const [x, y] of corners) {
            ctx.beginPath();
            ctx.moveTo(x - 12, y);
            ctx.lineTo(x, y - 12);
            ctx.lineTo(x + 12, y);
            ctx.lineTo(x, y + 12);
            ctx.closePath();
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
        this.bitmap.baseTexture.update();
    };
    
    Sprite_BoosterCard.prototype.drawCardFront = function() {
        this.bitmap.clear();
        
        const skill = this._cardData.skill;
        const colors = getRarityColors(this._cardData.rarity);
        const isAlreadyKnown = $gameParty.members()[0] && $gameParty.members()[0].isLearnedSkill(skill.id);
        
        // Card border
        if (isAlreadyKnown) {
            // Gold border for duplicates
            this.bitmap.gradientFillRect(0, 0, 160, 240, '#ffd700', '#ffb300', true);
        } else {
            this.bitmap.gradientFillRect(0, 0, 160, 240, colors.primary, colors.secondary, true);
        }
        
        // Inner card area
        this.bitmap.fillRect(6, 6, 148, 228, '#ffffff');
        
        // Skill name background
        this.bitmap.gradientFillRect(8, 8, 144, 40, colors.primary, colors.secondary, false);
        
        // Skill name
        this.bitmap.fontSize = 16;
        this.bitmap.textColor = '#ffffff';
        this.bitmap.fontBold = true;
        this.bitmap.outlineWidth = 2;
        this.bitmap.outlineColor = '#000000';
        this.bitmap.drawText(skill.name, 10, 18, 140, 30, 'center');
        
        // Skill icon (larger)
        const iconBitmap = ImageManager.loadSystem('IconSet');
        const pw = ImageManager.iconWidth;
        const ph = ImageManager.iconHeight;
        const sx = skill.iconIndex % 16 * pw;
        const sy = Math.floor(skill.iconIndex / 16) * ph;
        const dx = (160 - pw * 1.5) / 2;  // Scale icon 1.5x
        const dy = 60;
        
        iconBitmap.addLoadListener(() => {
            this.bitmap.blt(iconBitmap, sx, sy, pw, ph, dx, dy, pw * 1.5, ph * 1.5);
        });
        
        // Energy cost
        this.bitmap.drawCircle(130, 30, 16, colors.primary);
        this.bitmap.drawCircle(130, 30, 14, '#ffffff');
        this.bitmap.fontSize = 18;
        this.bitmap.textColor = colors.primary;
        this.bitmap.fontBold = true;
        this.bitmap.drawText(this._cardData.energyCost.toString(), 122, 22, 16, 16, 'center');
        
        // Description
        this.bitmap.fontSize = 13;
        this.bitmap.textColor = '#000000';
        this.bitmap.fontBold = false;
        this.bitmap.outlineWidth = 0;
        
        const description = skill.description || '';
        const lines = this.wrapText(description, 130);
        let y = 115;
        for (const line of lines.slice(0, 8)) {
            this.bitmap.drawText(line, 15, y, 130, 16, 'left');
            y += 16;
        }
        
        // Show reward type
        if (isAlreadyKnown) {
            this.bitmap.fontSize = 20;
            this.bitmap.textColor = '#ffd700';
            this.bitmap.fontBold = true;
            this.bitmap.outlineWidth = 2;
            this.bitmap.outlineColor = '#000000';
            // Duplicate skills no longer pay out (see processCardReward), so the
            // card face must not promise gold it will not grant.
            this.bitmap.drawText('DUPLICATE', 15, 200, 130, 25, 'center');
        } else {
            this.bitmap.fontSize = 18;
            this.bitmap.textColor = colors.primary;
            this.bitmap.fontBold = true;
            this.bitmap.drawText(T('BoosterPack.newSkill'), 15, 200, 130, 25, 'center');
        }
    };
    
    Sprite_BoosterCard.prototype.wrapText = function(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const testWidth = this.bitmap.measureTextWidth(testLine);
            
            if (testWidth > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines;
    };
    
    Sprite_BoosterCard.prototype.update = function() {
        Sprite.prototype.update.call(this);
        
        // Update glow animation for selected cards
        if (this._selected && !this._flipped) {
            this._glowAnimation += 0.05;
            const glowIntensity = (Math.sin(this._glowAnimation) + 1) * 0.5;
            this.setColorTone([255 * glowIntensity * 0.3, 215 * glowIntensity * 0.3, 0, 0]);
        } else {
            this.setColorTone([0, 0, 0, 0]);
        }
        
        // Update flip animation
        if (this._flipAnimation > 0) {
            this._flipAnimation -= 0.1;
            if (this._flipAnimation <= 0) {
                this._flipAnimation = 0;
            }
            
            // Apply scaling effect during flip
            const scale = Math.abs(Math.cos(this._flipAnimation * Math.PI));
            this.scale.x = scale;
        }
    };
    
    Sprite_BoosterCard.prototype.setSelected = function(selected) {
        this._selected = selected;
        if (!this._flipped) {
            this.drawCardBack();
        }
    };
    
    Sprite_BoosterCard.prototype.flip = function(callback) {
        if (this._flipped) return;
        
        this._flipped = true;
        this._flipAnimation = 1.0;

        // Schedule callback for middle of flip animation. Guard against the
        // scene exiting mid-flip, which would draw to a destroyed bitmap.
        this._flipTimer = setTimeout(() => {
            this._flipTimer = null;
            if (this._destroyed || !this.bitmap || this.bitmap._destroyed) return;
            this.drawCardFront();
            if (callback) callback();
        }, 150);
    };

    const _Sprite_BoosterCard_destroy = Sprite_BoosterCard.prototype.destroy;
    Sprite_BoosterCard.prototype.destroy = function() {
        if (this._flipTimer) {
            clearTimeout(this._flipTimer);
            this._flipTimer = null;
        }
        if (_Sprite_BoosterCard_destroy) {
            _Sprite_BoosterCard_destroy.apply(this, arguments);
        } else {
            Sprite.prototype.destroy.apply(this, arguments);
        }
    };
    
})();