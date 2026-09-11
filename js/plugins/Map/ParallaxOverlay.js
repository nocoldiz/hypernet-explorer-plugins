/*:
 * @target MZ
 * @plugindesc v1.6 Enhanced parallax overlay system with static layers, scaling options, optional looping, and looping map support.
 * @author Omni-Lex
 * @help 
 * ParallaxOverlay.js
 * 
 * This plugin creates overlays, backgrounds, and static layers on maps using 
 * images from img/layers and img/parallaxes folders.
 * 
 * === Map Notes Format ===
 * 
 * LAYERS (static images at specific coordinates):
 * <layer: filename, x, y>                - Basic layer at coordinates
 * <layer: filename, x, y, opacity:value> - Layer with custom opacity
 * <layer: filename, x, y, under>         - Layer rendered below player
 * <layer: filename, x, y, under, opacity:value> - Below player with opacity
 * 
 * BACKGROUNDS (rendered behind RPG Maker parallax):
 * <background: filename>           - Basic background from img/parallaxes
 * <background: filename, looping>  - Looping background that tiles in all directions
 * <background: filename, fixed>    - Fixed background that doesn't move with player
 * <background: filename, parallax:value> - Parallax distance (0.0 = no movement, 1.0 = moves with player, default: 0.5)
 * <background: filename, opacity:value> - Set opacity (0-255)
 * 
 * OVERLAYS (rendered above map):
 * <overlay: filename>           - Basic overlay that moves with player
 * <overlay: filename, looping>  - Looping overlay that tiles
 * <overlay: filename, fixed>    - Fixed overlay that doesn't move with player
 * <overlay: filename, scrollX:value, scrollY:value> - Add continuous scrolling (pixels per frame, use values like 0.5, 1, 2)
 * <overlay: filename, opacity:value> - Set opacity (0-255)
 * <overlay: filename, z:value>  - Set z-order (higher appears on top, default is 8)
 * <overlay: filename, scale:value> - Scale uniformly (1.0 = original size, 2.0 = double size)
 * <overlay: filename, scaleX:value, scaleY:value> - Scale separately for X and Y
 * <overlay: filename, cover> - Scale to cover entire map (like CSS background-size: cover)
 * <overlay: filename, contain> - Scale to fit within map bounds (like CSS background-size: contain)
 * 
 * === Layer Examples ===
 * <layer: Table, 10, 15>                              
 *   - Table at tile coordinates (10, 15)
 * 
 * <layer: Tree, 25, 30, opacity:200>                  
 *   - Semi-transparent tree at (25, 30)
 * 
 * <layer: Shadow, 10, 10, under>                      
 *   - Shadow rendered below the player at (10, 10)
 * 
 * <layer: Rug, 5, 8, under, opacity:230>              
 *   - Rug below player with custom opacity
 * 
 * Multiple layers for complex scenes:
 * <layer: Table, 10, 10>
 * <layer: Chair, 11, 10>
 * <layer: Rug, 10, 10, under>
 * <layer: Chandelier, 10, 8, opacity:220>
 * 
 * === Background Examples ===
 * <background: BigMountain>                           
 *   - Mountain background with default parallax (0.5)
 * 
 * <background: BigMountain, looping>                  
 *   - Looping mountain background that tiles
 * 
 * <background: BigMountain, fixed>                    
 *   - Fixed mountains that don't move at all
 * 
 * <background: DistantMountains, parallax:0.2>        
 *   - Very slow moving distant mountains (far away effect)
 * 
 * <background: Clouds, parallax:0.7, looping>         
 *   - Fast moving looping clouds (closer to viewer)
 * 
 * <background: Stars, parallax:0.1, opacity:180, looping>      
 *   - Very distant semi-transparent looping starfield
 * 
 * <background: Ocean, parallax:0.6, looping>          
 *   - Looping ocean background with moderate parallax
 * 
 * <background: Desert, parallax:0.4, opacity:220>     
 *   - Distant desert with custom opacity
 * 
 * Multiple backgrounds for depth layers:
 * <background: FarMountains, parallax:0.2, opacity:150>
 * <background: MidMountains, parallax:0.5>
 * <background: Clouds, parallax:0.8, opacity:200, looping>
 * 
 * === Overlay Examples ===
 * <overlay: trees_top>                                
 *   - Basic tree overlay that moves with player
 * 
 * <overlay: trees_top, cover>                         
 *   - Tree overlay scaled to cover entire map
 * 
 * <overlay: buildings, fixed, cover>                  
 *   - Fixed building overlay covering screen
 * 
 * <overlay: fog, opacity:150, fixed, looping>         
 *   - Semi-transparent fixed looping fog layer
 * 
 * <overlay: clouds, scrollX:0.5, scrollY:0.3, fixed, scale:1.5, looping>
 *   - Scaled looping clouds scrolling continuously
 * 
 * <overlay: rain, opacity:180, z:10>                  
 *   - Rain effect with high z-order (renders on top)
 * 
 * <overlay: leaves, scrollX:0.2, scrollY:0.1, opacity:200, looping>
 *   - Slowly drifting looping leaves
 * 
 * <overlay: light_rays, contain, opacity:120, z:9>    
 *   - Light rays that fit within map bounds
 * 
 * <overlay: shadow, fixed, scale:1.2, opacity:100>    
 *   - Subtle shadow overlay
 * 
 * Multiple overlays for complex scenes:
 * <overlay: tree_canopy, cover, z:10>
 * <overlay: fog_layer1, opacity:100, scrollX:0.3, fixed, looping, z:9>
 * <overlay: fog_layer2, opacity:80, scrollX:0.5, fixed, looping, z:8>
 * <overlay: light_shafts, contain, opacity:150, z:7>
 * 
 * === Complete Scene Example ===
 * Forest scene with multiple depth layers:
 * <background: DistantTrees, parallax:0.3, opacity:180>
 * <background: MidTrees, parallax:0.6>
 * <background: Sky, parallax:0.1, opacity:200, looping>
 * <layer: Rock, 15, 20, under>
 * <layer: TreeStump, 10, 15>
 * <overlay: tree_tops, cover, z:10>
 * <overlay: fog, opacity:120, scrollX:0.2, fixed, looping, z:9>
 * <overlay: leaves, opacity:150, scrollX:0.1, scrollY:0.05, looping, z:11>
 * <layer: Signpost, 25, 18, opacity:240>
 */
(function() {
    "use strict";
    
    // Custom image loaders
    function loadLayerImage(filename) {
        return ImageManager.loadBitmap('img/layers/', filename);
    }
    
    function loadParallaxImage(filename) {
        return ImageManager.loadParallax(filename);
    }
    
    // Parse Map Notes for overlay, background, and layer parameters
    // Cache the last parse so the three consecutive callers per spriteset build
    // (createBackgrounds / createLayers / createOverlays) share one regex sweep
    // instead of re-parsing the same note three times. Keyed on the note string,
    // so it naturally invalidates when the map (and thus its note) changes.
    let _parseMapNotesCacheKey = null;
    let _parseMapNotesCacheResult = null;

    function parseMapNotes() {
        if (!$dataMap || !$dataMap.note) return { overlays: [], backgrounds: [], layers: [] };

        const notes = $dataMap.note;
        if (_parseMapNotesCacheKey === notes && _parseMapNotesCacheResult) {
            return _parseMapNotesCacheResult;
        }
        const overlayRegex = /<overlay:\s*([^,>]+)(?:\s*,\s*([^>]*))?>/gi;
        const backgroundRegex = /<background:\s*([^,>]+)(?:\s*,\s*([^>]*))?>/gi;
        const layerRegex = /<layer:\s*([^,>]+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([^>]*))?>/gi;
        let match;
        let overlays = [];
        let backgrounds = [];
        let layers = [];
        
        // Parse layers
        while (match = layerRegex.exec(notes)) {
            const filename = match[1].trim();
            const x = parseInt(match[2]);
            const y = parseInt(match[3]);
            let layer = {
                filename: filename,
                x: x,
                y: y,
                opacity: 255,
                under: false
            };
            
            if (match[4]) {
                parseLayerParameters(match[4], layer);
            }
            
            layers.push(layer);
        }
        
        // Parse overlays
        while (match = overlayRegex.exec(notes)) {
            const filename = match[1].trim();
            let overlay = {
                filename: filename,
                fixed: false,
                looping: false,
                scrollX: 0,
                scrollY: 0,
                opacity: 255,
                z: 8,
                scaleX: 1.0,
                scaleY: 1.0,
                scalingMode: 'none'
            };
            
            if (match[2]) {
                parseParameters(match[2], overlay);
            }
            
            overlays.push(overlay);
        }
        
        // Parse backgrounds
        while (match = backgroundRegex.exec(notes)) {
            const filename = match[1].trim();
            let background = {
                filename: filename,
                fixed: false,
                looping: false,
                parallax: 0.5, // Default parallax distance
                opacity: 255
            };
            
            if (match[2]) {
                parseBackgroundParameters(match[2], background);
            }
            
            backgrounds.push(background);
        }
        
        _parseMapNotesCacheKey = notes;
        _parseMapNotesCacheResult = { overlays: overlays, backgrounds: backgrounds, layers: layers };
        return _parseMapNotesCacheResult;
    }

    // Parse parameters for layers
    function parseLayerParameters(paramString, layer) {
        const params = paramString.split(',');
        
        params.forEach(param => {
            param = param.trim();
            
            if (param === 'under') {
                layer.under = true;
            } else if (param.includes(':')) {
                const [key, value] = param.split(':');
                const trimmedKey = key.trim();
                
                if (trimmedKey === 'opacity') {
                    layer.opacity = parseInt(value);
                }
            }
        });
    }
    
    // Parse parameters for overlays
    function parseParameters(paramString, overlay) {
        const params = paramString.split(',');
        
        params.forEach(param => {
            param = param.trim();
            
            if (param === 'cover') {
                overlay.scalingMode = 'cover';
            } else if (param === 'contain') {
                overlay.scalingMode = 'contain';
            } else if (param === 'fixed') {
                overlay.fixed = true;
            } else if (param === 'looping') {
                overlay.looping = true;
            } else if (param.includes(':')) {
                const [key, value] = param.split(':');
                const trimmedKey = key.trim();
                
                switch (trimmedKey) {
                    case 'scrollX':
                        overlay.scrollX = parseFloat(value);
                        break;
                    case 'scrollY':
                        overlay.scrollY = parseFloat(value);
                        break;
                    case 'opacity':
                        overlay.opacity = parseInt(value);
                        break;
                    case 'z':
                        overlay.z = parseInt(value);
                        break;
                    case 'scale':
                        const scaleValue = parseFloat(value);
                        overlay.scaleX = scaleValue;
                        overlay.scaleY = scaleValue;
                        break;
                    case 'scaleX':
                        overlay.scaleX = parseFloat(value);
                        break;
                    case 'scaleY':
                        overlay.scaleY = parseFloat(value);
                        break;
                }
            }
        });
    }
    
    // Parse parameters for backgrounds
    function parseBackgroundParameters(paramString, background) {
        const params = paramString.split(',');
        
        params.forEach(param => {
            param = param.trim();
            
            if (param === 'fixed') {
                background.fixed = true;
            } else if (param === 'looping') {
                background.looping = true;
            } else if (param.includes(':')) {
                const [key, value] = param.split(':');
                const trimmedKey = key.trim();
                
                switch (trimmedKey) {
                    case 'parallax':
                        background.parallax = parseFloat(value);
                        break;
                    case 'opacity':
                        background.opacity = parseInt(value);
                        break;
                }
            }
        });
    }
    
    // Calculate scaling for cover/contain modes
    function calculateScaling(imageWidth, imageHeight, mapWidth, mapHeight, mode) {
        if (mode === 'cover') {
            const scaleX = mapWidth / imageWidth;
            const scaleY = mapHeight / imageHeight;
            const scale = Math.max(scaleX, scaleY);
            return { scaleX: scale, scaleY: scale };
        } else if (mode === 'contain') {
            const scaleX = mapWidth / imageWidth;
            const scaleY = mapHeight / imageHeight;
            const scale = Math.min(scaleX, scaleY);
            return { scaleX: scale, scaleY: scale };
        }
        return { scaleX: 1, scaleY: 1 };
    }
    
    // Helper function to normalize looping coordinates
    function normalizeLoopingCoordinate(value, max) {
        if (max <= 0) return 0;
        value = value % max;
        if (value < 0) value += max;
        return value;
    }
    
    // Extend the Spriteset_Map class
    const _Spriteset_Map_createParallax = Spriteset_Map.prototype.createParallax;
    Spriteset_Map.prototype.createParallax = function() {
        this.createBackgrounds();
        _Spriteset_Map_createParallax.call(this);
        this.createLayers();
        this.createOverlays();
    };
    
    // Create static layers at specific coordinates
    Spriteset_Map.prototype.createLayers = function() {
        this._layersUnder = [];
        this._layersAbove = [];
        const parsedData = parseMapNotes();
        this._layerData = parsedData.layers;
        
        // Create container sprites for layers
        this._layerContainerUnder = new Sprite();
        this._layerContainerAbove = new Sprite();
        
        // Add containers to the base sprite (for under layers) and main container (for above layers)
        this._baseSprite.addChild(this._layerContainerUnder);
        this.addChild(this._layerContainerAbove);
        
        // Set z-order for containers
        this._layerContainerUnder.z = 1; // Above backgrounds but below tilemap
        this._layerContainerAbove.z = 4; // Above tilemap but below overlays
        
        for (let i = 0; i < this._layerData.length; i++) {
            const data = this._layerData[i];
            const sprite = new Sprite();
            
            sprite.bitmap = loadLayerImage(data.filename);
            sprite.opacity = data.opacity;
            sprite.data = data;
            
            if (data.under) {
                // Add to lower layer container (below player)
                this._layersUnder.push(sprite);
                this._layerContainerUnder.addChild(sprite);
            } else {
                // Add to upper layer container (above player)
                this._layersAbove.push(sprite);
                this._layerContainerAbove.addChild(sprite);
            }
        }
    };
    
    // Create backgrounds (rendered behind RPG Maker parallax)
    Spriteset_Map.prototype.createBackgrounds = function() {
        this._backgrounds = [];
        const parsedData = parseMapNotes();
        this._backgroundData = parsedData.backgrounds;
        
        for (let i = 0; i < this._backgroundData.length; i++) {
            const data = this._backgroundData[i];
            let sprite;
            
            if (data.looping) {
                // Use TilingSprite for looping backgrounds
                sprite = new TilingSprite();
                sprite.move(0, 0, Graphics.width, Graphics.height);
            } else {
                // Use regular Sprite for non-looping backgrounds
                sprite = new Sprite();
            }
            
            sprite.bitmap = loadParallaxImage(data.filename);
            sprite.opacity = data.opacity;
            sprite.data = data;
            
            this._backgrounds.push(sprite);
            this._baseSprite.addChild(sprite);
        }
    };
    
    // Create overlays (rendered above map)
    Spriteset_Map.prototype.createOverlays = function() {
        this._overlays = [];
        const parsedData = parseMapNotes();
        this._overlayData = parsedData.overlays;
        
        for (let i = 0; i < this._overlayData.length; i++) {
            const data = this._overlayData[i];
            let sprite;
            
            if (data.looping) {
                // Use TilingSprite for looping overlays
                sprite = new TilingSprite();
            } else {
                // Use regular Sprite for non-looping overlays
                sprite = new Sprite();
            }
            
            sprite.bitmap = loadLayerImage(data.filename);
            sprite.z = data.z;
            sprite.opacity = data.opacity;
            sprite.data = data;
            
            // Initialize scroll offset
            sprite._scrollOffsetX = 0;
            sprite._scrollOffsetY = 0;
            
            this._overlays.push(sprite);
            this.addChild(sprite);
        }
    };
    
    // Update function
    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        this.updateBackgrounds();
        this.updateLayers();
        this.updateOverlays();
    };
    
    // Update static layers
    Spriteset_Map.prototype.updateLayers = function() {
        if (!this._layersUnder && !this._layersAbove) return;
        
        const tileWidth = $gameMap.tileWidth();
        const tileHeight = $gameMap.tileHeight();
        
        const updateLayerSprites = (layers) => {
            for (let i = 0; i < layers.length; i++) {
                const sprite = layers[i];
                const data = sprite.data;
                
                if (!sprite.bitmap || !sprite.bitmap.isReady()) continue;
                
                // Position sprite at tile coordinates
                // Convert tile coordinates to pixel coordinates relative to the map display
                sprite.x = data.x * tileWidth - $gameMap.displayX() * tileWidth;
                sprite.y = data.y * tileHeight - $gameMap.displayY() * tileHeight;
            }
        };
        
        if (this._layersUnder) updateLayerSprites(this._layersUnder);
        if (this._layersAbove) updateLayerSprites(this._layersAbove);
    };
    
    // Update backgrounds
    Spriteset_Map.prototype.updateBackgrounds = function() {
        if (!this._backgrounds) return;
        
        const tileWidth = $gameMap.tileWidth();
        const tileHeight = $gameMap.tileHeight();
        
        for (let i = 0; i < this._backgrounds.length; i++) {
            const sprite = this._backgrounds[i];
            const data = sprite.data;
            
            if (!sprite.bitmap || !sprite.bitmap.isReady()) continue;
            
            if (data.looping) {
                // TilingSprite - update size and origin for looping
                if (sprite.x !== 0 || sprite.y !== 0 || sprite.width !== Graphics.width || sprite.height !== Graphics.height) {
                    sprite.move(0, 0, Graphics.width, Graphics.height);
                }
                
                if (data.fixed) {
                    sprite.origin.x = 0;
                    sprite.origin.y = 0;
                } else {
                    const parallaxFactor = data.parallax;
                    let originX = $gameMap.displayX() * tileWidth * parallaxFactor;
                    let originY = $gameMap.displayY() * tileHeight * parallaxFactor;
                    
                    // Handle looping maps
                    if ($gameMap.isLoopHorizontal() && sprite.bitmap.width > 0) {
                        const loopWidth = $gameMap.width() * tileWidth;
                        originX = normalizeLoopingCoordinate(originX, loopWidth * parallaxFactor);
                    }
                    if ($gameMap.isLoopVertical() && sprite.bitmap.height > 0) {
                        const loopHeight = $gameMap.height() * tileHeight;
                        originY = normalizeLoopingCoordinate(originY, loopHeight * parallaxFactor);
                    }
                    
                    sprite.origin.x = originX;
                    sprite.origin.y = originY;
                }
            } else {
                // Regular Sprite - position normally
                if (data.fixed) {
                    sprite.x = 0;
                    sprite.y = 0;
                } else {
                    const parallaxFactor = data.parallax;
                    sprite.x = -$gameMap.displayX() * tileWidth * parallaxFactor;
                    sprite.y = -$gameMap.displayY() * tileHeight * parallaxFactor;
                }
            }
        }
    };
    
    // Update overlays
    Spriteset_Map.prototype.updateOverlays = function() {
        if (!this._overlays) return;
        
        const tileWidth = $gameMap.tileWidth();
        const tileHeight = $gameMap.tileHeight();
        const mapWidth = $gameMap.width() * tileWidth;
        const mapHeight = $gameMap.height() * tileHeight;
        const screenWidth = Graphics.boxWidth;
        const screenHeight = Graphics.boxHeight;
        
        for (let i = 0; i < this._overlays.length; i++) {
            const sprite = this._overlays[i];
            const data = sprite.data;

            if (!sprite.bitmap || !sprite.bitmap.isReady()) continue;

            // Update continuous scroll offset
            sprite._scrollOffsetX += data.scrollX;
            sprite._scrollOffsetY += data.scrollY;
            
            if (data.looping) {
                // TilingSprite overlay
                const targetWidth = data.fixed ? screenWidth : mapWidth;
                const targetHeight = data.fixed ? screenHeight : mapHeight;
                
                sprite.move(0, 0, targetWidth, targetHeight);
                
                if (data.fixed) {
                    sprite.origin.x = sprite._scrollOffsetX;
                    sprite.origin.y = sprite._scrollOffsetY;
                    sprite.x = 0;
                    sprite.y = 0;
                } else {
                    let originX = $gameMap.displayX() * tileWidth + sprite._scrollOffsetX;
                    let originY = $gameMap.displayY() * tileHeight + sprite._scrollOffsetY;
                    
                    // Handle looping maps for tiling overlays
                    if ($gameMap.isLoopHorizontal() && sprite.bitmap.width > 0) {
                        originX = normalizeLoopingCoordinate(originX, mapWidth);
                    }
                    if ($gameMap.isLoopVertical() && sprite.bitmap.height > 0) {
                        originY = normalizeLoopingCoordinate(originY, mapHeight);
                    }
                    
                    sprite.origin.x = originX;
                    sprite.origin.y = originY;
                    sprite.x = 0;
                    sprite.y = 0;
                }
            } else {
                // Regular Sprite overlay
                
                // Calculate scaling
                let finalScaleX = data.scaleX;
                let finalScaleY = data.scaleY;
                
                if (data.scalingMode === 'cover' || data.scalingMode === 'contain') {
                    const targetWidth = data.fixed ? screenWidth : mapWidth;
                    const targetHeight = data.fixed ? screenHeight : mapHeight;
                    
                    const calculatedScale = calculateScaling(
                        sprite.bitmap.width, 
                        sprite.bitmap.height, 
                        targetWidth, 
                        targetHeight, 
                        data.scalingMode
                    );
                    
                    finalScaleX = calculatedScale.scaleX * data.scaleX;
                    finalScaleY = calculatedScale.scaleY * data.scaleY;
                }
                
                sprite.scale.x = finalScaleX;
                sprite.scale.y = finalScaleY;
                
                // Position calculation
                if (data.fixed) {
                    sprite.x = sprite._scrollOffsetX;
                    sprite.y = sprite._scrollOffsetY;
                    
                    if (data.scalingMode === 'cover' || data.scalingMode === 'contain') {
                        const scaledWidth = sprite.bitmap.width * finalScaleX;
                        const scaledHeight = sprite.bitmap.height * finalScaleY;
                        sprite.x += (screenWidth - scaledWidth) / 2;
                        sprite.y += (screenHeight - scaledHeight) / 2;
                    }
                } else {
                    let baseX = -$gameMap.displayX() * tileWidth + sprite._scrollOffsetX;
                    let baseY = -$gameMap.displayY() * tileHeight + sprite._scrollOffsetY;
                    
                    // Handle looping maps for non-tiling overlays
                    if ($gameMap.isLoopHorizontal()) {
                        baseX = normalizeLoopingCoordinate(baseX, mapWidth);
                        // Adjust for screen wrapping
                        if (baseX > screenWidth / 2) {
                            baseX -= mapWidth;
                        }
                    }
                    if ($gameMap.isLoopVertical()) {
                        baseY = normalizeLoopingCoordinate(baseY, mapHeight);
                        // Adjust for screen wrapping
                        if (baseY > screenHeight / 2) {
                            baseY -= mapHeight;
                        }
                    }
                    
                    sprite.x = baseX;
                    sprite.y = baseY;
                    
                    if (data.scalingMode === 'cover' || data.scalingMode === 'contain') {
                        const scaledWidth = sprite.bitmap.width * finalScaleX;
                        const scaledHeight = sprite.bitmap.height * finalScaleY;
                        sprite.x += (mapWidth - scaledWidth) / 2;
                        sprite.y += (mapHeight - scaledHeight) / 2;
                    }
                }
            }
        }
    };
    
    // Clean up when leaving map
    const _Spriteset_Map_destroy = Spriteset_Map.prototype.destroy;
    Spriteset_Map.prototype.destroy = function() {
        if (this._backgrounds) {
            for (let i = 0; i < this._backgrounds.length; i++) {
                this._baseSprite.removeChild(this._backgrounds[i]);
            }
            this._backgrounds = null;
        }
        
        if (this._layersUnder && this._layerContainerUnder) {
            for (let i = 0; i < this._layersUnder.length; i++) {
                this._layerContainerUnder.removeChild(this._layersUnder[i]);
            }
            this._baseSprite.removeChild(this._layerContainerUnder);
            this._layersUnder = null;
            this._layerContainerUnder = null;
        }
        
        if (this._layersAbove && this._layerContainerAbove) {
            for (let i = 0; i < this._layersAbove.length; i++) {
                this._layerContainerAbove.removeChild(this._layersAbove[i]);
            }
            this.removeChild(this._layerContainerAbove);
            this._layersAbove = null;
            this._layerContainerAbove = null;
        }
        
        if (this._overlays) {
            for (let i = 0; i < this._overlays.length; i++) {
                this.removeChild(this._overlays[i]);
            }
            this._overlays = null;
        }
        
        _Spriteset_Map_destroy.call(this);
    };
    
})();