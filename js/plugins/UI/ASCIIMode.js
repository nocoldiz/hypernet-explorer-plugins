//=============================================================================
// ASCII_RenderMode.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc ASCII Render Mode v1.0.0
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help ASCII_RenderMode.js
 * 
 * @param enableKey
 * @text Toggle Key
 * @desc Key to toggle ASCII mode (default: F9)
 * @type string
 * @default F9
 * 
 * @param fontSize
 * @text Font Size
 * @desc Font size for ASCII characters
 * @type number
 * @default 24
 * 
 * @param fontFamily
 * @text Font Family
 * @desc Font family for ASCII rendering
 * @type string
 * @default monospace
 * 
 * @param backgroundColor
 * @text Background Color
 * @desc Background color for ASCII mode
 * @type string
 * @default #000000
 * 
 * @param textColor
 * @text Text Color
 * @desc Default text color for ASCII characters
 * @type string
 * @default #FFFFFF
 * 
 * @param eventColor
 * @text Event Color
 * @desc Color for event characters
 * @type string
 * @default #FFFF00
 * 
 * @param playerColor
 * @text Player Color
 * @desc Color for player character
 * @type string
 * @default #00FF00
 * 
 * This plugin adds an ASCII render mode inspired by Dwarf Fortress.
 * Press the toggle key (default F9) to switch between normal and ASCII mode.
 * 
 * Passable tiles show as '.' (floor)
 * Non-passable tiles show as '#' (wall)
 * Events show as their first letter
 * Player shows as '@'
 * 
 * Events with null/empty images are hidden from ASCII display.
 * 
 * Customize event and terrain translations in the plugin code.
 */

(() => {
    'use strict';

    const pluginName = 'ASCIIMode';
    const parameters = PluginManager.parameters(pluginName);

    // Hardcoded to F1
    const FONT_SIZE = parseInt(parameters['fontSize']) || 24;
    const FONT_FAMILY = 'Square';
    const BG_COLOR = parameters['backgroundColor'] || '#000000';
    const TEXT_COLOR = parameters['textColor'] || '#FFFFFF';
    const EVENT_COLOR = parameters['eventColor'] || '#FFFF00';
    const PLAYER_COLOR = parameters['playerColor'] || '#00FF00';

    let _statsI18n = null;

    const _loadStatsI18n = async () => {
        const lang = ConfigManager.language || 'en';
        const url = `js/i18n/${lang}/stats.json`;
        try {
            const response = await fetch(url);
            _statsI18n = await response.json();
        } catch (e) {
            console.error('ASCIIMode: Failed to load i18n data from ' + url, e);
        }
    };

    const _si18n = (key) => {
        if (_statsI18n && _statsI18n[key]) {
            return _statsI18n[key];
        }
        return key;
    };

    _loadStatsI18n();

    // Translation dictionaries
    const EVENT_TRANSLATIONS = {
        'Chest': '?',
        'Door': '+',
        'Stairs': '<',
        'Tree': 'T',
        'Rock': '*',
        'Water': '~',
        'Fire': '^',
        'Merchant': '$',
        'Guard': 'G',
        'Villager': 'v',
        'Monster': 'M',
        'Boss': 'B',
        'Treasure': '&',
        'Switch': '%',
        'Sign': '!'
    };

    const TERRAIN_TAG_TRANSLATIONS = {
        1: '.',  // Pavement
        2: ',',  // Dirt
        3: '~',  // Water
        4: '█',  // Wall
        5: '.',  // Foliage
        6: '=',  // Metal
        7: '▒'   // Roof
    };

    let asciiMode = false;
    // ASCII HUD: forces ASCII styling of DOM menus/HUD even when ASCII map mode
    // is disabled. Independent ConfigManager option (see below).
    let asciiHud = false;
    let asciiCanvas = null;
    let asciiContext = null;
    let waterFlowDirection = 'S';
    let dialogueLines = [];
    let tilesetDb = null;

    function loadTilesetDb() {
        if (Utils.isNwjs()) {
            const fs = require('fs');
            const path = require('path');
            const filepath = path.join(process.cwd(), 'js', 'db', 'Sprites', 'ASCIITileset.json');
            if (fs.existsSync(filepath)) {
                try {
                    tilesetDb = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    console.log('ASCII Tileset DB loaded successfully');
                } catch (e) {
                    console.error('Failed to parse ASCII Tileset DB:', e);
                }
            }
        } else {
            fetch('js/db/Sprites/ASCIITileset.json')
                .then(response => response.json())
                .then(data => {
                    tilesetDb = data;
                    console.log('ASCII Tileset DB loaded successfully via fetch');
                })
                .catch(e => console.error('Failed to load ASCII Tileset DB via fetch:', e));
        }
    }

    // The glyph and colour a character sheet is drawn as. There is no ASCII
    // sprite table of its own any more: js/db/Sprites/AsciiSpritesAssociation.json
    // held nothing but `chars` and `color` per sheet, which is exactly what the
    // sprite catalogue (js/db/WorldGen/NPCs.json, window.SpriteCatalog) already
    // carries for every sheet the game knows, so it was folded in and deleted.
    function spriteGlyphEntry(characterName) {
        if (!characterName) return null;
        const SC = window.SpriteCatalog;
        return (SC && SC.entry) ? SC.entry(characterName) : null;
    }

    function getColorHex(colorName) {
        const colors = {
            "golden": "#FFD700",
            "dark brown": "#5C4033",
            "purple": "#800080",
            "green": "#008000",
            "bright yellow": "#FFFF00",
            "light brown": "#D2B48C",
            "red": "#FF0000",
            "grey": "#808080"
        };
        return colors[colorName] || colorName;
    }

    loadTilesetDb();

    function loadAsciiFont() {
        const fontName = 'Square';
        const fontPath = `url('fonts/Square.ttf')`;
        const font = new FontFace(fontName, fontPath);

        font.load().then((loadedFont) => {
            document.fonts.add(loadedFont);
            console.log('ASCII Font loaded successfully');
        }).catch((error) => {
            console.error('Failed to load ASCII Font:', error);
        });
    }
    loadAsciiFont();

    // =============================================================================
    // DOM MENU -> ASCII LAYER
    // -----------------------------------------------------------------------------
    // Most menus are now HTML/DOM overlays appended to <body>, all of which read
    // their colors/fonts from the shared CSS variables in css/vars.css. Instead of
    // editing every menu plugin, we inject one ASCII-only stylesheet scoped to
    // `body.ascii-ui-active` that re-maps those variables to a black-terminal
    // palette (light text on black) plus a few structural overrides. When a DOM
    // menu is open we hide the ASCII map canvas so the now-ASCII-styled DOM shows
    // through. See `hasActiveDomOverlay()` / `updateAsciiDomState()` below.
    // =============================================================================

    const ASCII_UI_BODY_CLASS = 'ascii-ui-active';

    // Where the ASCII canvas sits in the page. The engine draws the game on a
    // canvas at z-index 1 and plays video at 2, and every DOM layer the game
    // puts on top of that starts at 9 (the HUD, the toasts, the quick bar, the
    // battle menus, the parchment menus). So the ASCII canvas goes at 3: over
    // the picture it replaces, under everything that is meant to be read on
    // top of it.
    //
    // It used to sit at 1000, over the lot. That was survivable while the game
    // drew its interface into the engine canvas, but the interface is DOM now:
    // at 1000 the whole of it - party cards, toasts, the quick bar, the map
    // battle's own command menu - was painted and then buried under a black
    // canvas, and the only reason ASCII menus worked at all was the separate
    // branch that hides the canvas outright when a full-screen menu opens.
    const ASCII_CANVAS_Z = '3';


    // True when a full-screen DOM menu overlay is currently visible. Menu-agnostic:
    // checks direct children of <body> that cover most of the screen, skipping the
    // engine canvas/video, our own ASCII canvas, and small HUD toasts.
    // Throttled: the layout reads below (offsetWidth/Height + getComputedStyle
    // over every body child) are expensive, so the result is cached and only
    // recomputed every 10 frames. A few frames of latency when an overlay opens
    // or closes is acceptable.
    let _domOverlayCache = false;
    let _domOverlayFrame = -1;
    function hasActiveDomOverlay() {
        if (Graphics.frameCount - _domOverlayFrame < 10) return _domOverlayCache;
        _domOverlayFrame = Graphics.frameCount;
        _domOverlayCache = _computeActiveDomOverlay();
        return _domOverlayCache;
    }

    function _computeActiveDomOverlay() {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const kids = document.body ? document.body.children : [];
        for (let i = 0; i < kids.length; i++) {
            const el = kids[i];
            if (!el || el === asciiCanvas) continue;
            const tag = el.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CANVAS' ||
                tag === 'VIDEO' || tag === 'LINK' || tag === 'IMG') continue;
            if (el.id === 'errorPrinter' || el.id === 'fpsCounter' || el.id === 'gameCanvas') continue;
            if (el.offsetWidth >= W * 0.5 && el.offsetHeight >= H * 0.5) {
                const cs = window.getComputedStyle(el);
                if (cs.display !== 'none' && cs.visibility !== 'hidden' &&
                    parseFloat(cs.opacity || '1') > 0.01) {
                    return true;
                }
            }
        }
        return false;
    }

    function setAsciiUiClass(on) {
        if (!document.body) return;
        document.body.classList.toggle(ASCII_UI_BODY_CLASS, !!on);
    }

    // Shared per-frame check. Returns true if a DOM menu took over the screen
    // (in which case the ASCII canvas is hidden so the styled DOM shows through).
    function updateAsciiDomState() {
        if (!asciiMode && !asciiHud) {
            setAsciiUiClass(false);
            return false;
        }
        const overlay = hasActiveDomOverlay();
        // Both switches style the DOM now. The ASCII map no longer covers the
        // interface (see ASCII_CANVAS_Z), so everything drawn over it - the
        // party cards, the toasts, the quick bar, a battle's command menu -
        // is read on top of the terminal and has to be dressed like it.
        setAsciiUiClass(asciiHud || !!asciiMode);
        // A full-screen menu hides the map behind it either way; taking the
        // canvas down saves drawing a frame nobody sees.
        if (overlay && asciiMode && asciiCanvas) {
            asciiCanvas.style.display = 'none';
        }
        return overlay;
    }

    let choiceLines = [];
    let showDialogue = false;
    let showChoices = false;
    let selectedChoiceIndex = -1;

    let showAsciiMenu = false;
    let menuCommands = [];
    let selectedMenuIndex = -1;

    let CANVAS_WIDTH = 816;
    let CANVAS_HEIGHT = 624;

    let currentFontSize = FONT_SIZE;
    let canvasOffsetX = 0;
    let canvasOffsetY = 0;
    let gridPixelWidth = 0;
    let gridPixelHeight = 0;

    function updateFontSize() {
        currentFontSize = FONT_SIZE;

        gridPixelWidth = CANVAS_WIDTH;
        gridPixelHeight = CANVAS_HEIGHT;
        canvasOffsetX = 0;
        canvasOffsetY = 0;

        if (asciiContext) {
            asciiContext.font = `${currentFontSize}px ${FONT_FAMILY}`;
            asciiContext.textAlign = 'center';
            asciiContext.textBaseline = 'middle';
        }
    }

    // Initialize ASCII canvas
    function createAsciiCanvas() {
        if (asciiCanvas) return;

        CANVAS_WIDTH = window.innerWidth;
        CANVAS_HEIGHT = window.innerHeight;

        asciiCanvas = document.createElement('canvas');
        asciiCanvas.id = 'asciiCanvas';
        asciiCanvas.style.position = 'absolute';
        asciiCanvas.style.top = '0';
        asciiCanvas.style.left = '0';
        asciiCanvas.style.width = '100vw';
        asciiCanvas.style.height = '100vh';
        asciiCanvas.style.zIndex = ASCII_CANVAS_Z;
        asciiCanvas.style.display = 'none';
        asciiCanvas.style.imageRendering = 'pixelated';

        document.body.appendChild(asciiCanvas);
        asciiContext = asciiCanvas.getContext('2d');

        // Set canvas size to window resolution
        asciiCanvas.width = CANVAS_WIDTH;
        asciiCanvas.height = CANVAS_HEIGHT;
        asciiContext.imageSmoothingEnabled = false;

        updateFontSize();
    }

    // Toggle ASCII mode
    function toggleAsciiMode() {
        ConfigManager.asciiModeEnabled = !ConfigManager.asciiModeEnabled;
    }

    // Check if event has a valid image
    function eventHasImage(event) {
        if (!event || !event.event()) return false;

        const eventData = event.event();

        // Check if event has any pages with graphics
        if (eventData.pages && eventData.pages.length > 0) {
            for (let page of eventData.pages) {
                if (page.image && page.image.characterName && page.image.characterName !== '') {
                    return true;
                }
            }
        }

        return false;
    }

    // Get character for tile based on passability and terrain
    function getTileCharacter(x, y) {
        if (!$gameMap) return '#';

        const terrainTag = $gameMap.terrainTag(x, y);
        const regionId = $gameMap.regionId(x, y);

        // Specific configuration for world map 315
        if ($gameMap.mapId() === 315) {
            switch (terrainTag) {
                case 1: return '=';  // Road
                case 2: return '.';  // Grass/Dirt
                case 3: return getWaterAnimatedCharacter(x, y);
                case 4: return '^';  // Mountain
                case 5: return 'T';  // Forest
                case 6: return 'C';  // City
                case 7: return '*';  // Ice
                default: return '.';
            }
        }

        const isExterior = $dataMap && $dataMap.note && $dataMap.note.includes("<Exterior>");
        if (!isExterior) {
            let activeTileId = 0;
            for (let l = 3; l >= 0; l--) {
                const id = $gameMap.tileId(x, y, l);
                if (id > 0) {
                    activeTileId = id;
                    break;
                }
            }
            if (Tilemap.isTileA3(activeTileId) || Tilemap.isTileA4(activeTileId)) {
                return ' ';
            }
        }

        // Roof in interior maps should be blank (Tag 7)
        if (terrainTag === 7) {
            if ($dataMap && $dataMap.note && $dataMap.note.includes("<Interior>")) {
                return ' ';
            }
        }

        // Terrain ID 4 handling
        if (terrainTag === 4) {
            let activeTileId = 0;
            for (let l = 3; l >= 0; l--) {
                const id = $gameMap.tileId(x, y, l);
                if (id > 0) {
                    activeTileId = id;
                    break;
                }
            }

            const isInterior = $dataMap && $dataMap.note && $dataMap.note.includes("<Interior>");

            if (activeTileId < 2048) {
                // Sheet B, C, D, E
                return '▒';
            } else {
                // Sheet A
                if (isInterior) {
                    return ' '; // No symbol
                } else {
                    if (Tilemap.isTileA3(activeTileId) || Tilemap.isTileA4(activeTileId)) {
                        const leftTag = $gameMap.terrainTag(x - 1, y);
                        const rightTag = $gameMap.terrainTag(x + 1, y);

                        const isLeftBorder = (leftTag !== 4);
                        const isRightBorder = (rightTag !== 4);

                        if (isLeftBorder && !isRightBorder) {
                            return '▐'; // Right border

                        } else if (isRightBorder && !isLeftBorder) {
                            return '▌'; // Left border

                        }
                    }
                    return '█'; // Filled block
                }
            }
        }

        // Ladder and Counter checks
        if ($gameMap.isLadder(x, y)) {
            return 'H';
        }
        if ($gameMap.isCounter(x, y)) {
            return 'x';
        }

        const isPassable = $gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 4) ||
            $gameMap.isPassable(x, y, 6) || $gameMap.isPassable(x, y, 8);

        // Region 4 override (Full block for Sheet A, T otherwise)
        if (regionId === 4) {
            let activeTileId = 0;
            for (let l = 3; l >= 0; l--) {
                const id = $gameMap.tileId(x, y, l);
                if (id > 0) {
                    activeTileId = id;
                    break;
                }
            }
            if (activeTileId >= 2048) {
                if (Tilemap.isTileA3(activeTileId) || Tilemap.isTileA4(activeTileId)) {
                    const leftRegion = $gameMap.regionId(x - 1, y);
                    const rightRegion = $gameMap.regionId(x + 1, y);

                    const isLeftBorder = (leftRegion !== 4);
                    const isRightBorder = (rightRegion !== 4);

                    if (isLeftBorder && !isRightBorder) {
                        return '▒'; // Left border
                    } else if (isRightBorder && !isLeftBorder) {
                        return '▒'; // Right border
                    }
                }
                return '█';
            } else {
                return 'X';
            }
        }
        // Region 11 cliff border
        if (regionId === 11) {
            const top = $gameMap.regionId(x, y - 1) === 11;
            const bottom = $gameMap.regionId(x, y + 1) === 11;
            const left = $gameMap.regionId(x - 1, y) === 11;
            const right = $gameMap.regionId(x + 1, y) === 11;

            if (left && right && top && bottom) return '┼';
            if (left && right && top) return '┴';
            if (left && right && bottom) return '┬';
            if (top && bottom && left) return '┤';
            if (top && bottom && right) return '├';

            if (left && right) return '─';
            if (top && bottom) return '│';

            if (right && bottom) return '┌';
            if (left && bottom) return '┐';
            if (right && top) return '└';
            if (left && top) return '┘';

            if (left || right) return '─';
            if (top || bottom) return '│';

            return '─';
        }

        // Foliage variations (Tag 5 or Region 5)
        if (terrainTag === 5 || regionId === 5) {
            if (!isPassable) {
                const variations = ['T', 'Ť', 'Ṱ', 'Ṭ'];
                const index = Math.abs(x * 733 + y * 941) % variations.length;
                return variations[index];
            } else {
                const variations = ['"', "'", '`', ';',];
                const index = Math.abs(x * 733 + y * 941) % variations.length;
                return variations[index];
            }
        }

        // Grass/Dirt variations (Tag 2) - Dwarf Fortress style
        if (terrainTag === 2) {
            if (isPassable) {
                const variations = ['.', ',', "'", '"'];
                const index = Math.abs(x * 733 + y * 941) % variations.length;
                return variations[index];
            }
        }

        // B-E Priority over A tile for unpassable tiles
        let activeTileId = 0;
        for (let l = 3; l >= 0; l--) {
            const id = $gameMap.tileId(x, y, l);
            if (id > 0) {
                activeTileId = id;
                break;
            }
        }
        
        const isB = activeTileId >= 0 && activeTileId < 256;
        const isC = activeTileId >= 256 && activeTileId < 512;
        const isE = activeTileId >= 768 && activeTileId < 1024;
        
        if (!isPassable && (isB || isC || isE)) {
            return 'X';
        }

        // Check terrain tag translations first
        if (TERRAIN_TAG_TRANSLATIONS[terrainTag]) {
            const char = TERRAIN_TAG_TRANSLATIONS[terrainTag];
            if (char === '~') {
                return getWaterAnimatedCharacter(x, y);
            }
            return char;
        }

        // Fall back to passability
        if (isPassable) {
            return '.';  // Passable floor
        } else {
            let activeTileId = 0;
            for (let l = 3; l >= 0; l--) {
                const id = $gameMap.tileId(x, y, l);
                if (id > 0) {
                    activeTileId = id;
                    break;
                }
            }
            
            // Check if it's a B, C, or E tile
            // B: 0-255, C: 256-511, E: 768-1023
            const isB = activeTileId >= 0 && activeTileId < 256;
            const isC = activeTileId >= 256 && activeTileId < 512;
            const isE = activeTileId >= 768 && activeTileId < 1024;
            
            if (isB || isC || isE) {
                return 'X';
            }
            
            return '#';  // Non-passable wall
        }
    }

    // Get animated character for water
    function getWaterAnimatedCharacter(x, y) {
        const sequence = ['~', '-', ' ', '-'];
        const speed = 10; // Frames per step
        const frame = Math.floor(Graphics.frameCount / speed);
        const len = sequence.length;

        let index = 0;
        switch (waterFlowDirection) {
            case 'S':
                index = ((y + frame) % len + len) % len;
                break;
            case 'N':
                index = ((y - frame) % len + len) % len;
                break;
            case 'E':
                index = ((x + frame) % len + len) % len;
                break;
            case 'W':
                index = ((x - frame) % len + len) % len;
                break;
            default:
                index = ((y + frame) % len + len) % len;
        }
        return sequence[index];
    }

    // Get character for event
    function getEventCharacter(event) {
        if (!event || !event.event()) return null;

        const eventName = event.event().name;

        // Hide events starting with EV
        if (eventName.startsWith('EV')) {
            return null;
        }

        // Draw transfer events as a triangle
        if (eventName.startsWith('Transfer')) {
            return '▲';
        }

        // If NPC has "AI" or "NPC" in event notes, use special symbols seeded by name
        const note = event.event().note;
        if (note && /\b(AI|NPC)\b/.test(note)) {
            const symbols = ['☺', '☻', '☹', 'ツ'];
            let sum = 0;
            for (let i = 0; i < eventName.length; i++) {
                sum += eventName.charCodeAt(i);
            }
            return symbols[sum % symbols.length];
        }

        // If event has no image, display initial in lowercase
        if (!eventHasImage(event)) {
            return (eventName.charAt(0) || 'e').toLowerCase();
        }
        let char = '';

        // Check the sprite catalogue first (always priority)
        const association = spriteGlyphEntry(event.characterName());
        if (association && association.chars && association.chars.length > 0) {
            char = association.chars[0];
        }

        // Fallbacks if not found in DB
        if (!char) {
            if (note === 'Sign') {
                char = '?';
            } else if (eventName.startsWith('Tutorial')) {
                char = '?';
            } else if (EVENT_TRANSLATIONS[eventName]) {
                char = EVENT_TRANSLATIONS[eventName];
            } else {
                char = eventName.charAt(0) || 'E';
            }
        }

        const isNPC = eventName.includes('Villager') || eventName.includes('Merchant') || eventName.includes('Guard') || eventName.includes('NPC');
        const isEnemy = eventName.includes('Enemy') || eventName.includes('Monster') || eventName.includes('Boss');

        if (isEnemy) {
            return char.toLowerCase();
        } else if (isNPC) {
            return char.toUpperCase();
        } else {
            return char.toLowerCase();
        }
    }

    // Render dialogue text in ASCII mode
    function renderDialogue() {
        if (!asciiContext || (!showDialogue && !showChoices)) return;

        const dialogueFontSize = FONT_SIZE; // Reduced size
        const lineHeight = dialogueFontSize + 4;
        let totalLines = dialogueLines.length + choiceLines.length;
        if (totalLines === 0) return;

        let boxHeightLimit = gridPixelHeight / 3;
        if (totalLines * lineHeight > boxHeightLimit) {
            boxHeightLimit = gridPixelHeight / 1.5; // Expand up to 2/3 of screen if needed for many choices
        }
        const maxLines = Math.floor(boxHeightLimit / lineHeight);
        const boxHeight = Math.min(totalLines, maxLines) * lineHeight + 20;
        let startY = CANVAS_HEIGHT - boxHeight - 40;
        if (SceneManager._scene instanceof Scene_Battle) {
            startY = 10; // Draw at top in battle
        }
        const padding = 15; // More padding for larger text

        // Inset from left and right margins (20% of grid width)
        const margin = Math.floor(gridPixelWidth * 0.2);
        const boxX = canvasOffsetX + margin;
        const boxWidth = gridPixelWidth - (margin * 2);

        // Draw dialogue background
        asciiContext.fillStyle = 'rgba(0, 0, 0, 0.8)';
        asciiContext.fillRect(boxX, startY, boxWidth, boxHeight);

        // Draw dialogue border
        asciiContext.strokeStyle = TEXT_COLOR;
        asciiContext.lineWidth = 2;
        asciiContext.strokeRect(boxX, startY, boxWidth, boxHeight);

        // Draw dialogue text
        asciiContext.textAlign = 'left';
        asciiContext.textBaseline = 'top';
        asciiContext.font = `${dialogueFontSize}px ${FONT_FAMILY}`; // Set larger font

        let currentLine = 0;

        // Draw dialogue lines
        if (showDialogue && dialogueLines.length > 0) {
            asciiContext.fillStyle = TEXT_COLOR;
            for (let i = 0; i < dialogueLines.length && currentLine < maxLines; i++) {
                const line = dialogueLines[i];
                const y = startY + padding + (currentLine * lineHeight);
                asciiContext.fillText(line, boxX + padding, y);
                currentLine++;
            }
        }

        // Draw choice lines
        if (showChoices && choiceLines.length > 0) {
            // Add some spacing between dialogue and choices
            if (dialogueLines.length > 0) {
                currentLine += 0.5;
            }

            for (let i = 0; i < choiceLines.length && currentLine < maxLines; i++) {
                const choice = choiceLines[i];
                const y = startY + padding + (currentLine * lineHeight);

                // Highlight selected choice in red, others in yellow
                if (i === selectedChoiceIndex) {
                    asciiContext.fillStyle = '#FF0000'; // Red for selected choice
                } else {
                    asciiContext.fillStyle = '#FFFF00'; // Yellow for unselected choices
                }

                asciiContext.fillText(`> ${choice}`, boxX + padding, y);
                currentLine++;
            }
        }

        // Reset text alignment for map rendering
        asciiContext.textAlign = 'center';
        asciiContext.textBaseline = 'middle';
    }

    function renderAsciiMenu() {
        if (!asciiContext || !showAsciiMenu) return;

        const menuFontSize = FONT_SIZE;
        const lineHeight = menuFontSize + 4;
        const totalItems = menuCommands.length;
        if (totalItems === 0) return;

        const numCols = 2;
        const numRows = Math.ceil(totalItems / numCols);

        const colWidth = 200; // Width of each column
        const padding = 20;
        const boxWidth = colWidth * numCols + padding * 2;
        const boxHeight = numRows * lineHeight + 40;

        const startX = (CANVAS_WIDTH - boxWidth) / 2;
        const startY = (CANVAS_HEIGHT - boxHeight) / 2;

        // Draw background
        asciiContext.fillStyle = 'rgba(0, 0, 0, 0.9)';
        asciiContext.fillRect(startX, startY, boxWidth, boxHeight);

        // Draw border
        asciiContext.strokeStyle = TEXT_COLOR;
        asciiContext.lineWidth = 2;
        asciiContext.strokeRect(startX, startY, boxWidth, boxHeight);

        // Draw commands
        asciiContext.textAlign = 'left';
        asciiContext.textBaseline = 'top';
        asciiContext.font = `${menuFontSize}px ${FONT_FAMILY}`;

        for (let i = 0; i < totalItems; i++) {
            const cmd = menuCommands[i];
            const row = Math.floor(i / numCols);
            const col = i % numCols;

            const x = startX + padding + col * colWidth;
            const y = startY + padding + row * lineHeight;

            if (i === selectedMenuIndex) {
                asciiContext.fillStyle = '#FF0000'; // Red for selected
                asciiContext.fillText(`> ${cmd.name}`, x, y);
            } else {
                if (cmd.enabled) {
                    asciiContext.fillStyle = '#FFFF00'; // Yellow for enabled
                } else {
                    asciiContext.fillStyle = '#808080'; // Gray for disabled
                }
                asciiContext.fillText(`  ${cmd.name}`, x, y);
            }
        }

        // Reset text alignment for map rendering
        asciiContext.textAlign = 'center';
        asciiContext.textBaseline = 'middle';
    }

    function getEnemyLevel(note) {
        const m = note.match(/<Level:\s*(\d+)>/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    function getMedianLevel(party) {
        const levels = party.map(m => m.level).sort((a, b) => a - b);
        const mid = Math.floor(levels.length / 2);
        return levels.length % 2
            ? levels[mid]
            : (levels[mid - 1] + levels[mid]) / 2;
    }

    function getEnemyLevelFromEvent(event) {
        if (!event._fixedTroopId || event._fixedTroopId === 0) {
            return 0;
        }
        const troop = $dataTroops[event._fixedTroopId];
        if (!troop || !troop.members.length) {
            return 0;
        }
        let maxLevel = 0;
        for (const member of troop.members) {
            const enemyData = $dataEnemies[member.enemyId];
            if (enemyData && enemyData.note) {
                const level = getEnemyLevel(enemyData.note);
                if (level > maxLevel) {
                    maxLevel = level;
                }
            }
        }
        return maxLevel;
    }

    function convertToGreyscale(hexColor) {
        if (!hexColor) return TEXT_COLOR;
        if (hexColor.startsWith('#')) {
            let hex = hexColor.slice(1);
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            const hexV = v.toString(16).padStart(2, '0');
            return `#${hexV}${hexV}${hexV}`;
        }
        return hexColor;
    }

    function getCharacterColor(type, char, x, y, event) {
        switch (type) {
            case 'player':
                return PLAYER_COLOR;
            case 'player2':
                return '#00FFFF'; // Cyan for Player 2
            case 'event':
                if (event) {
                    const association = spriteGlyphEntry(event.characterName());
                    if (association && association.color) {
                        return getColorHex(association.color);
                    }

                    const eventName = event.event().name;
                    const isEnemy = eventName.includes('Enemy') || eventName.includes('Monster') || eventName.includes('Boss');
                    if (isEnemy) {
                        const enemyLevel = getEnemyLevelFromEvent(event);
                        const party = $gameParty.members();
                        const medianLevel = party.length > 0 ? getMedianLevel(party) : 1;

                        if (enemyLevel > medianLevel) {
                            return '#FF0000'; // Red for dangerous
                        } else {
                            return '#FFA500'; // Orange for others
                        }
                    }
                }
                return EVENT_COLOR;
            case 'terrain':
                if (x !== undefined && y !== undefined) {
                    const tag = $gameMap.terrainTag(x, y);
                    const region = $gameMap.regionId(x, y);

                    // Grass color depending on temperature
                    if (tag === 2) {
                        const temp = $gameVariables.value(61);
                        if (temp > 35) return '#FFD700'; // Golden/Dry
                        if (temp > 25) return '#ADFF2F'; // Yellow Green
                        if (temp < 5) return '#FFFFFF';  // Snow/White
                        if (temp < 15) return '#556B2F'; // Dark Olive Green
                        return '#228B22'; // Normal Green
                    }

                    // Try to get color from tileset DB first
                    if (tilesetDb && $dataTilesets && $dataMap) {
                        let activeTileId = 0;
                        for (let l = 3; l >= 0; l--) {
                            const id = $gameMap.tileId(x, y, l);
                            if (id > 0) {
                                activeTileId = id;
                                break;
                            }
                        }

                        if (activeTileId > 0 && activeTileId < 1024) {
                            const slot = Math.floor(activeTileId / 256); // 0=B, 1=C, 2=D, 3=E
                            const index = activeTileId % 256;

                            const tileset = $dataTilesets[$dataMap.tilesetId];
                            if (tileset) {
                                const filename = tileset.tilesetNames[slot + 5]; // B is at index 5
                                if (filename && tilesetDb[filename + '.png']) {
                                    const color = tilesetDb[filename + '.png'][String(index)];
                                    if (color) return color;
                                }
                            }
                        }
                    }

                    // Region 4 (Wall) color variations based on tile ID
                    if (region === 4) {
                        const tileId = $gameMap.tileId(x, y, 0) + $gameMap.tileId(x, y, 1) + $gameMap.tileId(x, y, 2) + $gameMap.tileId(x, y, 3);
                        const wallColors = [
                            '#696969', // Dim Gray
                            '#5C4033', // Dark Brown
                            '#3B5323', // Forest Green
                            '#4A0E4E', // Dark Purple
                            '#1C3144', // Prussian Blue
                            '#8B0000', // Dark Red
                            '#A0522D', // Sienna
                            '#2F4F4F'  // Dark Slate Gray
                        ];
                        return wallColors[Math.abs(tileId) % wallColors.length];
                    }

                    // Specific configuration for world map 315
                    if ($gameMap.mapId() === 315) {
                        switch (tag) {
                            case 1: return '#808080';  // Road - gray
                            case 2: return '#228B22';  // Grass/Dirt - green
                            case 3: return '#0066FF';  // Water - blue
                            case 4: return '#8B4513';  // Mountain - brown
                            case 5: return '#006400';  // Forest - dark green
                            case 6: return '#FFFF00';  // City - yellow
                            case 7: return '#ADD8E6';  // Ice - light blue
                            default: return TEXT_COLOR;
                        }
                    }

                    if (TERRAIN_TAG_TRANSLATIONS[tag] === '~') {
                        return '#0066FF';  // Water - blue
                    }

                    switch (tag) {
                        case 1: return '#808080';  // Pavement
                        case 2: return '#8B4513';  // Dirt
                        case 3: return '#0066FF';  // Water
                        case 4: {
                            let activeTileId = 0;
                            for (let l = 3; l >= 0; l--) {
                                const id = $gameMap.tileId(x, y, l);
                                if (id > 0) {
                                    activeTileId = id;
                                    break;
                                }
                            }
                            if (Tilemap.isTileA3(activeTileId) || Tilemap.isTileA4(activeTileId)) {
                                const kind = Tilemap.getAutotileKind(activeTileId);
                                const colors = [
                                    '#696969', // Dim Gray
                                    '#5C4033', // Dark Brown
                                    '#3B5323', // Forest Green
                                    '#4A0E4E', // Dark Purple
                                    '#1C3144', // Prussian Blue
                                    '#8B0000', // Dark Red
                                    '#A0522D', // Sienna
                                    '#2F4F4F', // Dark Slate Gray
                                    '#D2B48C', // Light Brown
                                    '#800080', // Purple
                                    '#008000', // Green
                                    '#FFFF00', // Bright Yellow
                                    '#FF0000', // Red
                                    '#808080'  // Grey
                                ];
                                return colors[kind % colors.length];
                            }
                            return '#696969';  // Fallback to default wall color
                        }
                        case 6: return '#C0C0C0';  // Metal
                        case 7: return '#B22222';  // Roof
                    }
                }
                // Fallback to character-based color
                switch (char) {
                    case '~': return '#0066FF';  // Water - blue
                    case '^': return '#B22222';  // Roof - reddish/brown
                    case '▒': return '#B22222';  // Roof - reddish/brown
                    case 'T': return '#228B22';  // Foliage - green
                    case '█': return '#696969';  // Wall - gray
                    case '.': return '#808080';  // Pavement - gray
                    case ',': return '#8B4513';  // Dirt - brown
                    case '=': return '#C0C0C0';  // Metal - silver
                    case 'H': return '#D2B48C';  // Ladder - light brown
                    case 'x': return '#DEB887';  // Counter - burlywood
                    default: return TEXT_COLOR;
                }
            default:
                return TEXT_COLOR;
        }
    }

    function getTileBackgroundColor(x, y, char) {
        if (x === undefined || y === undefined) return '#000000';
        
        const tag = $gameMap.terrainTag(x, y);
        const region = $gameMap.regionId(x, y);

        // Specific configuration for world map 315
        if ($gameMap.mapId() === 315) {
            switch (tag) {
                case 1: return '#2A2A2A';  // Road - dark gray
                case 2: return '#113311';  // Grass/Dirt - dark green
                case 3: return '#001133';  // Water - dark blue
                case 4: return '#331A00';  // Mountain - dark brown
                case 5: return '#002200';  // Forest - very dark green
                case 6: return '#333300';  // City - dark yellow
                case 7: return '#112233';  // Ice - dark light blue
                default: return '#000000';
            }
        }

        if (TERRAIN_TAG_TRANSLATIONS[tag] === '~') {
            return '#001133';  // Water - dark blue
        }

        switch (tag) {
            case 1: return '#2A2A2A';  // Pavement
            case 2: return '#331A00';  // Dirt
            case 3: return '#001133';  // Water
            case 4: return '#1A1A1A';  // Wall background
            case 5: return '#113311';  // Foliage
            case 6: return '#2A2A2A';  // Metal
            case 7: return '#330000';  // Roof
        }

        // Fallback based on character
        switch (char) {
            case '~': return '#001133';
            case '^': return '#330000';
            case '▒': return '#330000';
            case 'T': return '#002200';
            case '█': return '#1A1A1A';
            case '.': return '#000000';
            case ',': return '#112211';
            default: return '#000000';
        }
    }

    function renderViewport(vpX, vpY, vpW, vpH, displayX, displayY) {
        const activeFontSize = currentFontSize;
        const viewWidth = vpW / activeFontSize;
        const viewHeight = vpH / activeFontSize;

        const mapCenterX = Math.round(displayX) + (vpW / $gameMap.tileWidth()) / 2;
        const mapCenterY = Math.round(displayY) + (vpH / $gameMap.tileHeight()) / 2;

        const startX = mapCenterX - viewWidth / 2;
        const startY = mapCenterY - viewHeight / 2;

        const endX = startX + viewWidth;
        const endY = startY + viewHeight;

        const loopStartX = Math.floor(startX);
        const loopStartY = Math.floor(startY);
        const loopEndX = Math.ceil(endX);
        const loopEndY = Math.ceil(endY);

        const mapWidth = $gameMap.width();
        const mapHeight = $gameMap.height();

        let mapOffsetX = 0;
        let mapOffsetY = 0;
        if (mapWidth < viewWidth) {
            mapOffsetX = Math.floor((viewWidth - mapWidth) / 2) * activeFontSize;
        }
        if (mapHeight < viewHeight) {
            mapOffsetY = Math.floor((viewHeight - mapHeight) / 2) * activeFontSize;
        }

        const totalOffsetX = canvasOffsetX + mapOffsetX + vpX;
        const totalOffsetY = canvasOffsetY + mapOffsetY + vpY;

        asciiContext.save();
        asciiContext.beginPath();
        asciiContext.rect(vpX, vpY, vpW, vpH);
        asciiContext.clip();

        for (let mapY = loopStartY; mapY < loopEndY; mapY++) {
            for (let mapX = loopStartX; mapX < loopEndX; mapX++) {
                const screenX = Math.round(totalOffsetX + (mapX - startX) * activeFontSize + activeFontSize / 2);
                const screenY = Math.round(totalOffsetY + (mapY - startY) * activeFontSize + activeFontSize / 2);

                const fogState = $gameMap.fogOfWarState ? $gameMap.fogOfWarState(mapX, mapY) : 2;
                if (fogState === 0) continue;

                let baseAlpha = 1.0;
                if (fogState === 1) {
                    baseAlpha = 0.6; // Lighter out of view
                } else {
                    const players = [$gamePlayer];
                    if (window.$gameSplitScreen && window.$gameSplitScreen.active && window.$gameSplitScreen.p2Event) {
                        players.push(window.$gameSplitScreen.p2Event);
                    }

                    const range = $gameMap.visionRange ? $gameMap.visionRange() : 10;
                    const featherStart = range * 0.7;
                    const rangeSq = range * range;
                    const featherStartSq = featherStart * featherStart;
                    let maxAlpha = 0.6; // Lighter out of view

                    for (const p of players) {
                        const distSq = Math.pow(mapX - p.x, 2) + Math.pow(mapY - p.y, 2);
                        if (distSq <= featherStartSq) {
                            maxAlpha = 1.0;
                            break;
                        } else if (distSq < rangeSq) {
                            const dist = Math.sqrt(distSq);
                            const factor = (dist - featherStart) / (range - featherStart);
                            const alpha = 1.0 - factor * 0.7;
                            if (alpha > maxAlpha) maxAlpha = alpha;
                        }
                    }
                    baseAlpha = maxAlpha;
                }

                asciiContext.globalAlpha = baseAlpha;

                const tileChar = getTileCharacter(mapX, mapY);
                const regionId = $gameMap.regionId(mapX, mapY);

                const isExterior = $dataMap && $dataMap.note && $dataMap.note.includes("<Exterior>");
                if (regionId === 2 && isExterior) continue;

                // Draw background first
                const bgColor = getTileBackgroundColor(mapX, mapY, tileChar);
                asciiContext.fillStyle = bgColor;
                asciiContext.fillRect(screenX - activeFontSize / 2, screenY - activeFontSize / 2, activeFontSize, activeFontSize);

                // Now draw the character or block
                asciiContext.fillStyle = getCharacterColor('terrain', tileChar, mapX, mapY);
                
                asciiContext.save();
                asciiContext.beginPath();
                asciiContext.rect(screenX - activeFontSize / 2, screenY - activeFontSize / 2, activeFontSize, activeFontSize);
                asciiContext.clip();

                const borderWidth = activeFontSize / 4;
                const borderHeight = activeFontSize * 0.8;

                if (tileChar === '█') {
                    asciiContext.fillRect(screenX - activeFontSize / 2, screenY - activeFontSize / 2, activeFontSize, activeFontSize);
                } else if (tileChar === '▐') {
                    asciiContext.fillRect(screenX + activeFontSize / 2 - borderWidth, screenY - borderHeight / 2, borderWidth, borderHeight);
                } else if (tileChar === '▌') {
                    asciiContext.fillRect(screenX - activeFontSize / 2, screenY - borderHeight / 2, borderWidth, borderHeight);
                } else {
                    asciiContext.fillText(tileChar, screenX, screenY);
                }
                
                asciiContext.restore();
            }
        }

        asciiContext.globalAlpha = 1.0;

        // A tactical map battle (BattleSystem/MapBattleMode.js) paints its
        // reach and move tiles under the glyphs.
        const mapBattle = window.MapBattleMode && window.MapBattleMode.asciiOverlay
            ? window.MapBattleMode.asciiOverlay() : null;
        const toScreen = (mx, my) => [
            Math.round(totalOffsetX + (mx - startX) * activeFontSize + activeFontSize / 2),
            Math.round(totalOffsetY + (my - startY) * activeFontSize + activeFontSize / 2)
        ];
        if (mapBattle) renderMapBattleTiles(mapBattle, toScreen, activeFontSize);

        $gameMap.events().forEach(event => {
            if (!event || event._erased) return;
            const eventName = event.event().name;
            if (eventName && eventName.startsWith('EV')) return;
            
            if (eventName && eventName.startsWith('Player')) {
                const isMultiplayerActive = !!(window.$gameSplitScreen && window.$gameSplitScreen.active);
                const hasNoGraphic = typeof eventHasImage === 'function' ? !eventHasImage(event) : !event.characterName();
                if (hasNoGraphic || !isMultiplayerActive) return;
            }
            
            const eventX = Math.round(event._realX);
            const eventY = Math.round(event._realY);

            if ($gameMap.fogOfWarState) {
                const fogState = $gameMap.fogOfWarState(event.x, event.y);
                if (fogState === 0) return; // Hide events in fully hidden tiles
            }

            if (eventX >= startX && eventX < endX && eventY >= startY && eventY < endY) {
                const screenX = Math.round(totalOffsetX + (eventX - startX) * activeFontSize + activeFontSize / 2);
                const screenY = Math.round(totalOffsetY + (eventY - startY) * activeFontSize + activeFontSize / 2);

                const eventChar = getEventCharacter(event);
                if (eventChar) {
                    asciiContext.globalAlpha = event.opacity() / 255;
                    let color = getCharacterColor('event', eventChar, undefined, undefined, event);
                    
                    if ($gameMap.fogOfWarState && $gameMap.fogOfWarState(event.x, event.y) === 1) {
                        color = convertToGreyscale(color);
                    }
                    
                    asciiContext.fillStyle = color;
                    asciiContext.fillText(eventChar, screenX, screenY);
                    asciiContext.globalAlpha = 1.0;
                }
            }
        });

        const playerX = Math.round($gamePlayer._realX);
        const playerY = Math.round($gamePlayer._realY);
        if (playerX >= startX && playerX < endX && playerY >= startY && playerY < endY) {
            const screenX = Math.round(totalOffsetX + (playerX - startX) * activeFontSize + activeFontSize / 2);
            const screenY = Math.round(totalOffsetY + (playerY - startY) * activeFontSize + activeFontSize / 2);
            asciiContext.fillStyle = getCharacterColor('player', '@');
            asciiContext.fillText('@', screenX, screenY);
        }

        if (window.$gameSplitScreen && window.$gameSplitScreen.active && window.$gameSplitScreen.p2Event) {
            const p2 = window.$gameSplitScreen.p2Event;
            const p2X = Math.round(p2._realX);
            const p2Y = Math.round(p2._realY);
            if (p2X >= startX && p2X < endX && p2Y >= startY && p2Y < endY) {
                const screenX = Math.round(totalOffsetX + (p2X - startX) * activeFontSize + activeFontSize / 2);
                const screenY = Math.round(totalOffsetY + (p2Y - startY) * activeFontSize + activeFontSize / 2);
                asciiContext.fillStyle = getCharacterColor('player2', '@');
                asciiContext.fillText('@', screenX, screenY);
            }
        }

        if (mapBattle) renderMapBattleMarks(mapBattle, toScreen, activeFontSize);

        asciiContext.restore();
    }

    // =============================================================================
    // MAP BATTLE LAYER (BattleSystem/MapBattleMode.js)
    // -----------------------------------------------------------------------------
    // The tactical fight is fought on this very map, and its whole
    // presentation is PIXI sprites the ASCII canvas covers. MapBattleMode hands
    // the layer over as data (asciiOverlay) and it is painted here in the
    // terminal's own font: reach and move tiles as tinted cells, the cursor as
    // a boxed cell, the party's other bodies as '@', floating numbers, the
    // monster bars and the last log lines.
    // =============================================================================

    function renderMapBattleTiles(layer, toScreen, fs) {
        for (const t of layer.tiles) {
            const [sx, sy] = toScreen(t.x, t.y);
            asciiContext.fillStyle = t.color;
            asciiContext.fillRect(sx - fs / 2, sy - fs / 2, fs, fs);
        }
    }

    function renderMapBattleMarks(layer, toScreen, fs) {
        asciiContext.save();
        asciiContext.textAlign = 'center';
        asciiContext.textBaseline = 'middle';
        asciiContext.font = fs + 'px ' + FONT_FAMILY;
        for (const b of layer.bodies) {
            const [sx, sy] = toScreen(Math.round(b.x), Math.round(b.y));
            asciiContext.fillStyle = b.alive ? getCharacterColor('player', '@') : '#777777';
            asciiContext.fillText(b.alive ? '@' : '%', sx, sy);
        }
        if (layer.cursor) {
            const [sx, sy] = toScreen(layer.cursor.x, layer.cursor.y);
            asciiContext.strokeStyle = '#FFFFFF';
            asciiContext.lineWidth = 2;
            asciiContext.strokeRect(sx - fs / 2 + 1, sy - fs / 2 + 1, fs - 2, fs - 2);
        }
        asciiContext.font = Math.round(fs * 0.8) + 'px ' + FONT_FAMILY;
        for (const p of layer.popups) {
            const [sx, sy] = toScreen(p.x, p.y);
            asciiContext.globalAlpha = p.alpha;
            if (p.label) {
                asciiContext.fillStyle = '#ffd27a';
                asciiContext.fillText(p.label, sx, sy - fs * 1.6);
            }
            asciiContext.fillStyle = p.color;
            asciiContext.fillText(p.text, sx, sy - fs);
        }
        asciiContext.globalAlpha = 1.0;
        asciiContext.restore();
    }

    const CONTROL_CODE_RE = /\\[A-Za-z]+\[\d*\]/g;

    function renderMapBattleHud() {
        const layer = window.MapBattleMode && window.MapBattleMode.asciiOverlay
            ? window.MapBattleMode.asciiOverlay() : null;
        if (!layer) return;
        const fs = FONT_SIZE;
        const lineHeight = fs + 4;
        asciiContext.save();
        asciiContext.textBaseline = 'top';
        asciiContext.font = fs + 'px ' + FONT_FAMILY;

        // The last log lines, top left.
        asciiContext.textAlign = 'left';
        let y = 8;
        for (const line of layer.log) {
            const text = String(line || '').replace(CONTROL_CODE_RE, '');
            if (!text) continue;
            asciiContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
            asciiContext.fillRect(8, y, Math.min(CANVAS_WIDTH * 0.5, asciiContext.measureText(text).width + 16), lineHeight);
            asciiContext.fillStyle = TEXT_COLOR;
            asciiContext.fillText(text, 16, y + 2);
            y += lineHeight;
        }

        // The monster bars, top right, as text meters.
        asciiContext.textAlign = 'right';
        let by = 8;
        for (const bar of layer.bars) {
            const filled = bar.mhp > 0 ? Math.round((bar.hp / bar.mhp) * 10) : 0;
            const meter = '[' + '#'.repeat(filled) + '.'.repeat(10 - filled) + ']';
            const text = bar.name + ' ' + meter + ' ' + Math.floor(bar.hp) + '/' + Math.floor(bar.mhp);
            const w = asciiContext.measureText(text).width + 16;
            asciiContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
            asciiContext.fillRect(CANVAS_WIDTH - 8 - w, by, w, lineHeight);
            asciiContext.fillStyle = '#ff9a8a';
            asciiContext.fillText(text, CANVAS_WIDTH - 16, by + 2);
            by += lineHeight;
        }
        asciiContext.restore();
    }

    // Cache for the per-map <WaterFlowTo> note tag (see renderAsciiMap).
    let _waterFlowMapId = -1;
    let _waterFlowCached = 'S';

    // Render the ASCII map
    function renderAsciiMap() {
        if (!asciiContext || !$gameMap || !$gamePlayer) return;

        // Check for resize
        if (asciiCanvas.width !== window.innerWidth || asciiCanvas.height !== window.innerHeight) {
            CANVAS_WIDTH = window.innerWidth;
            CANVAS_HEIGHT = window.innerHeight;
            asciiCanvas.width = CANVAS_WIDTH;
            asciiCanvas.height = CANVAS_HEIGHT;
            updateFontSize();
        }

        asciiContext.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);

        if (asciiMode === 2) {
            if (!showAsciiMenu && !showChoices && !showDialogue) return;
            asciiContext.font = `${currentFontSize}px ${FONT_FAMILY}`;
            renderDialogue();
            renderAsciiMenu();
            return;
        }

        asciiContext.fillStyle = '#000000';
        asciiContext.fillRect(0, 0, asciiCanvas.width, asciiCanvas.height);

        // Water flow direction is a fixed map property; cache it per mapId so the
        // note regex isn't re-run every frame.
        const _mapId = $gameMap.mapId();
        if (_waterFlowMapId !== _mapId) {
            _waterFlowMapId = _mapId;
            if ($dataMap && $dataMap.note) {
                const match = $dataMap.note.match(/<WaterFlowTo:\s*([NSEW])>/i);
                _waterFlowCached = match ? match[1].toUpperCase() : 'S';
            } else {
                _waterFlowCached = 'S';
            }
        }
        waterFlowDirection = _waterFlowCached;

        asciiContext.font = `${currentFontSize}px ${FONT_FAMILY}`;

        if (window.$gameSplitScreen && window.$gameSplitScreen.active && SceneManager._scene && SceneManager._scene._splitScreenActive) {
            const splitDir = PluginManager.parameters("SplitScreenMultiplayer")["SplitOrientation"] || "vertical";
            
            if (splitDir === "vertical") {
                const halfW = CANVAS_WIDTH / 2;
                renderViewport(0, 0, halfW, CANVAS_HEIGHT, $gameMap.displayX(), $gameMap.displayY());
                renderViewport(halfW, 0, halfW, CANVAS_HEIGHT, SceneManager._scene._p2DisplayX, SceneManager._scene._p2DisplayY);
                
                asciiContext.fillStyle = '#000000';
                asciiContext.fillRect(halfW - 2, 0, 4, CANVAS_HEIGHT);
            } else {
                const halfH = CANVAS_HEIGHT / 2;
                renderViewport(0, 0, CANVAS_WIDTH, halfH, $gameMap.displayX(), $gameMap.displayY());
                renderViewport(0, halfH, CANVAS_WIDTH, halfH, SceneManager._scene._p2DisplayX, SceneManager._scene._p2DisplayY);
                
                asciiContext.fillStyle = '#000000';
                asciiContext.fillRect(0, halfH - 2, CANVAS_WIDTH, 4);
            }
        } else {
            renderViewport(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, $gameMap.displayX(), $gameMap.displayY());
        }
        renderMapBattleHud();

        asciiContext.font = `${currentFontSize}px ${FONT_FAMILY}`;
        renderDialogue();
        renderAsciiMenu();
    }

    // Hook into message system to capture dialogue
    const _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        _Window_Message_startMessage.call(this);

        if (asciiMode) {
            this.visible = false; // Hide normal message window

            // Show canvas in battle if needed
            if (SceneManager._scene instanceof Scene_Battle && asciiCanvas) {
                asciiCanvas.style.display = 'block';
            }

            // Extract text from the current message
            const text = $gameMessage.allText();
            if (text) {
                // Process text to remove control characters and split into lines
                const cleanText = text.replace(/\\[A-Za-z]+\[\d*\]/g, ''); // Remove control codes (case-insensitive)
                const lines = cleanText.split('\n').filter(line => line.trim() !== '');

                // Word wrap long lines to fit screen
                dialogueLines = [];
                const margin = Math.floor(gridPixelWidth * 0.2);
                const boxWidth = gridPixelWidth - (margin * 2);
                const dialogueFontSize = currentFontSize;
                const maxCharsPerLine = Math.floor((boxWidth - 30) / (dialogueFontSize * 0.6));

                lines.forEach(line => {
                    if (line.length <= maxCharsPerLine) {
                        dialogueLines.push(line);
                    } else {
                        // Simple word wrapping
                        const words = line.split(' ');
                        let currentLine = '';

                        words.forEach(word => {
                            if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
                                currentLine += (currentLine ? ' ' : '') + word;
                            } else {
                                if (currentLine) dialogueLines.push(currentLine);
                                currentLine = word;
                            }
                        });

                        if (currentLine) dialogueLines.push(currentLine);
                    }
                });

                showDialogue = true;
            }
        }
    };

    const _Window_Message_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        _Window_Message_terminateMessage.call(this);

        if (asciiMode) {
            this.visible = true; // Restore visibility
            showDialogue = false;
            dialogueLines = [];

            // Hide canvas in battle if it was shown for dialogue
            if (SceneManager._scene instanceof Scene_Battle && asciiCanvas) {
                asciiCanvas.style.display = 'none';
            }
        }
    };

    // Hook into choice system to capture dialogue choices
    const _Window_ChoiceList_start = Window_ChoiceList.prototype.start;
    Window_ChoiceList.prototype.start = function () {
        _Window_ChoiceList_start.call(this);
        if (asciiMode) {
            this.visible = false; // Hide normal choice window
            // Show canvas in battle if needed
            if (SceneManager._scene instanceof Scene_Battle && asciiCanvas) {
                asciiCanvas.style.display = 'block';
            }
            choiceLines = [];
            const choices = $gameMessage.choices();
            for (let i = 0; i < choices.length; i++) {
                const choice = choices[i];
                // Remove control codes from choices
                const cleanChoice = choice.replace(/\\[A-Z]+\[\d*\]/g, '');
                choiceLines.push(`${i + 1}. ${cleanChoice}`);
            }
            selectedChoiceIndex = 0; // Default to first choice selected
            showChoices = true;
            // Align window rect with ASCII rendering for mouse interaction
            const dialogueFontSize = FONT_SIZE;
            const lineHeight = dialogueFontSize + 4;
            const totalLines = dialogueLines.length + choiceLines.length;
            
            let boxHeightLimit = gridPixelHeight / 3;
            if (totalLines * lineHeight > boxHeightLimit) {
                boxHeightLimit = gridPixelHeight / 1.5;
            }
            const maxLines = Math.floor(boxHeightLimit / lineHeight);
            const boxHeight = Math.min(totalLines, maxLines) * lineHeight + 20;
            let startY = CANVAS_HEIGHT - boxHeight - 10;
            if (SceneManager._scene instanceof Scene_Battle) {
                startY = 10;
            }
            const margin = Math.floor(gridPixelWidth * 0.2);
            const boxX = canvasOffsetX + margin;
            const boxWidth = gridPixelWidth - (margin * 2);
            this.move(boxX, startY, boxWidth, boxHeight);
        }
    };

    // Track choice selection changes
    const _Window_ChoiceList_select = Window_ChoiceList.prototype.select;
    Window_ChoiceList.prototype.select = function (index) {
        _Window_ChoiceList_select.call(this, index);

        if (asciiMode && showChoices) {
            selectedChoiceIndex = index;
        }
    };

    // Override itemRect to align hit areas with ASCII text
    const _Window_ChoiceList_itemRect = Window_ChoiceList.prototype.itemRect;
    Window_ChoiceList.prototype.itemRect = function (index) {
        if (asciiMode && showChoices) {
            const dialogueFontSize = FONT_SIZE;
            const lineHeight = dialogueFontSize + 4;
            const startY = 15 + (dialogueLines.length + 0.5) * lineHeight; // Matches renderDialogue
            
            const rect = _Window_ChoiceList_itemRect.call(this, index);
            rect.y = startY + index * lineHeight;
            rect.height = lineHeight;
            return rect;
        }
        return _Window_ChoiceList_itemRect.call(this, index);
    };

    // Prevent placement updates from moving the window away from ASCII box
    const _Window_ChoiceList_updatePlacement = Window_ChoiceList.prototype.updatePlacement;
    Window_ChoiceList.prototype.updatePlacement = function () {
        if (asciiMode && showChoices) return;
        _Window_ChoiceList_updatePlacement.call(this);
    };

    const _Window_ChoiceList_close = Window_ChoiceList.prototype.close;
    Window_ChoiceList.prototype.close = function () {
        _Window_ChoiceList_close.call(this);

        if (asciiMode) {
            this.visible = true; // Restore visibility
            showChoices = false;
            choiceLines = [];
            selectedChoiceIndex = -1;

            // Hide canvas in battle if it was shown for choices
            if (SceneManager._scene instanceof Scene_Battle && asciiCanvas) {
                asciiCanvas.style.display = 'none';
            }
        }
    };
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {



        _Scene_Map_update.call(this);

        // Keep the ASCII DOM styling state current (also handles ASCII HUD when
        // ASCII map mode is off). A DOM menu can open on top of the map (apiary,
        // cooking, etc.); when it does, the map canvas is hidden so the
        // ASCII-styled DOM shows through.
        const domOverlay = updateAsciiDomState();

        if (asciiMode) {
            if (domOverlay) {
                return;
            }
            // No DOM menu: restore the map canvas (mode 1 draws the ASCII map;
            // mode 2 keeps the normal map and only uses the canvas for UI).
            if (asciiMode === 1 && asciiCanvas && asciiCanvas.style.display === 'none') {
                asciiCanvas.style.display = 'block';
            }
            renderAsciiMap();
        }
    };

    // Render dialogue in battle scene
    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);

        if (asciiMode && (showDialogue || showChoices)) {
            if (asciiContext) {
                asciiContext.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
                renderDialogue();
            }
        }
    };

    // Show animated world sprite in ASCII mode


    // Bespoke ASCII map menu overlay removed.
    // The main menu now falls back to Scene_Menu, which is handled by the Universal ASCII UI Framework,
    // thereby correctly respecting CustomMainMenuLayout.js (3 columns, custom commands).


    // Handle scene changes
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        if (asciiCanvas) {
            asciiCanvas.style.display = 'none';
        }
        // Don't reset asciiMode - keep it active for map transitions
        _Scene_Map_terminate.call(this);
    };

    // Handle scene start to restore ASCII mode if it was active
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);

        // If ASCII mode was active, restore it
        if (asciiMode) {
            createAsciiCanvas();
            asciiCanvas.style.display = 'block';
        }
    };

    // Handle window resize
    const _Graphics_onResize = Graphics._onResize;
    Graphics._onResize = function () {
        _Graphics_onResize.call(this);

        if (asciiCanvas) {
            CANVAS_WIDTH = window.innerWidth;
            CANVAS_HEIGHT = window.innerHeight;
            // Keep fixed resolution
            asciiCanvas.width = CANVAS_WIDTH;
            asciiCanvas.height = CANVAS_HEIGHT;

            updateFontSize();
        }
    };

    const OPTION_SYMBOL = 'asciiModeEnabled';
    // Resolved at every read, not once at boot: the player can change language
    // in the very menu these are drawn in.
    const OPTION_NAME = () => T('GameOptions.label.asciiMode');
    // Disabled / Enabled / Only UI, in the order the option cycles through.
    const stateText = (value) => {
        const list = T.list('GameOptions.asciiState');
        const i = value === 2 ? 2 : (value === 1 || value === true) ? 1 : 0;
        return list[i] || '';
    };

    // Add the option to ConfigManager
    Object.defineProperty(ConfigManager, OPTION_SYMBOL, {
        get: function () {
            return this._asciiModeEnabled;
        },
        set: function (value) {
            // Handle legacy boolean values
            if (value === true) value = 1;
            if (value === false) value = 0;

            this._asciiModeEnabled = value;
            asciiMode = value; // Sync local variable

            // Update display
            if (value === 1) { // ON
                createAsciiCanvas();
                if (asciiCanvas) asciiCanvas.style.display = 'block';
            } else if (value === 2) { // Menu only
                createAsciiCanvas();
                if (asciiCanvas) asciiCanvas.style.display = 'none'; // Hide map, show only for UI
            } else { // OFF
                if (asciiCanvas) asciiCanvas.style.display = 'none';
                showAsciiMenu = false; // Reset menu state
                setAsciiUiClass(false); // Remove ASCII DOM styling
            }

            // ASCII is a look as well as a mode: while it is on it IS the
            // theme, and the theme the player had before it comes back when it
            // is switched off (Core/GameOptions.js owns both halves).
            if (window.GameOptions && window.GameOptions.onAsciiModeChanged) {
                window.GameOptions.onAsciiModeChanged(value);
            }
        },
        configurable: true
    });

    // Set default value
    ConfigManager._asciiModeEnabled = false;

    // Hook into makeData to save the option
    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData.call(this);
        config[OPTION_SYMBOL] = this[OPTION_SYMBOL];
        return config;
    };

    // Hook into applyData to load the option
    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData.call(this, config);
        const value = config[OPTION_SYMBOL];
        if (value === true) this[OPTION_SYMBOL] = 1;
        else if (value === false) this[OPTION_SYMBOL] = 0;
        else if (value !== undefined) this[OPTION_SYMBOL] = value;
        else this[OPTION_SYMBOL] = 0;
    };

    // -------------------------------------------------------------------------
    // ASCII HUD option: forces ASCII styling of DOM menus/HUD regardless of the
    // ASCII (map) mode above. Pure boolean.
    // -------------------------------------------------------------------------
    const HUD_SYMBOL = 'asciiHudEnabled';
    const HUD_NAME = () => T('GameOptions.label.asciiHud');

    Object.defineProperty(ConfigManager, HUD_SYMBOL, {
        get: function () {
            // ASCII HUD is independent of the ASCII map mode: it restyles the
            // DOM menus/HUD via CSS while leaving the rendered map graphics intact.
            return !!this._asciiHudEnabled;
        },
        set: function (value) {
            this._asciiHudEnabled = !!value;
            asciiHud = !!value; // Sync local variable
            if (asciiHud) {
                setAsciiUiClass(true); // Apply ASCII DOM styling immediately
            } else if (!asciiMode) {
                setAsciiUiClass(false); // No ASCII styling wanted anymore
            }
        },
        configurable: true
    });
    ConfigManager._asciiHudEnabled = false;

    const _ConfigManager_makeData_hud = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData_hud.call(this);
        config[HUD_SYMBOL] = this[HUD_SYMBOL];
        return config;
    };

    const _ConfigManager_applyData_hud = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData_hud.call(this, config);
        this[HUD_SYMBOL] = config[HUD_SYMBOL] === true;
    };

    if (window.GameOptions) {
        window.GameOptions.registerOption(HUD_SYMBOL, HUD_NAME,
            () => ConfigManager[HUD_SYMBOL],
            function (value) {
                ConfigManager[HUD_SYMBOL] = value;
                ConfigManager.save();
            },
            'experimental', 'boolean');
    } else {
        const _Window_Options_makeCommandList_hud = Window_Options.prototype.makeCommandList;
        Window_Options.prototype.makeCommandList = function () {
            _Window_Options_makeCommandList_hud.call(this);
            this.addCommand(HUD_NAME(), HUD_SYMBOL);
        };
    }

    // Hook into options window to add our option
    if (window.GameOptions) {
        window.GameOptions.registerOption(OPTION_SYMBOL, OPTION_NAME,
            () => ConfigManager[OPTION_SYMBOL],
            function (value) {
                ConfigManager[OPTION_SYMBOL] = value;
                ConfigManager.save();
            },
            'experimental', 'custom',
            function (value) {
                return stateText(value);
            },
            function () {
                let value = ConfigManager[OPTION_SYMBOL];
                if (value === true) value = 1;
                if (value === false) value = 0;
                const newValue = (value + 1) % 3;
                ConfigManager[OPTION_SYMBOL] = newValue;
                ConfigManager.save();
            },
            function () {
                let value = ConfigManager[OPTION_SYMBOL];
                if (value === true) value = 1;
                if (value === false) value = 0;
                const newValue = (value - 1 + 3) % 3;
                ConfigManager[OPTION_SYMBOL] = newValue;
                ConfigManager.save();
            }
        );
    } else {
        const _Window_Options_makeCommandList = Window_Options.prototype.makeCommandList;
        Window_Options.prototype.makeCommandList = function () {
            _Window_Options_makeCommandList.call(this);
            this.addCommand(OPTION_NAME(), OPTION_SYMBOL);
        };

        const _Window_Options_statusText = Window_Options.prototype.statusText;
        Window_Options.prototype.statusText = function (index) {
            const symbol = this.commandSymbol(index);
            if (symbol === OPTION_SYMBOL) {
                return stateText(this.getConfigValue(symbol));
            }
            return _Window_Options_statusText.call(this, index);
        };

        const _Window_Options_processOk = Window_Options.prototype.processOk;
        Window_Options.prototype.processOk = function () {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === OPTION_SYMBOL) {
                let value = this.getConfigValue(symbol);
                if (value === true) value = 1;
                if (value === false) value = 0;
                const newValue = (value + 1) % 3;
                this.changeValue(symbol, newValue);
                return;
            }
            _Window_Options_processOk.call(this);
        };

        const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
        Window_Options.prototype.cursorRight = function () {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === OPTION_SYMBOL) {
                let value = this.getConfigValue(symbol);
                if (value === true) value = 1;
                if (value === false) value = 0;
                const newValue = (value + 1) % 3;
                this.changeValue(symbol, newValue);
                return;
            }
            _Window_Options_cursorRight.call(this);
        };

        const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
        Window_Options.prototype.cursorLeft = function () {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === OPTION_SYMBOL) {
                let value = this.getConfigValue(symbol);
                if (value === true) value = 1;
                if (value === false) value = 0;
                const newValue = (value - 1 + 3) % 3;
                this.changeValue(symbol, newValue);
                return;
            }
            _Window_Options_cursorLeft.call(this);
        };
    }

    // Plugin command for toggling (optional)
    PluginManager.registerCommand(pluginName, "toggle", args => {
        toggleAsciiMode();
    });

    // Helper function to get key codes
    function getKeyCode(key) {
        const keyCodes = {
            'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116,
            'F6': 117, 'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121,
            'F11': 122, 'F12': 123
        };
        return keyCodes[key.toUpperCase()];
    }

    // =============================================================================
    // Shop System ASCII Replication
    // =============================================================================

    const _Scene_Shop_prepare = Scene_Shop.prototype.prepare;
    Scene_Shop.prototype.prepare = function (goods, purchaseOnly) {
        _Scene_Shop_prepare.call(this, goods, purchaseOnly);
        this._asciiGoods = goods;
        this._asciiPurchaseOnly = purchaseOnly;
    };

    const _Scene_Shop_start = Scene_Shop.prototype.start;
    Scene_Shop.prototype.start = function () {
        _Scene_Shop_start.call(this);
        if (asciiMode) {
            createAsciiCanvas();
            if (asciiCanvas) asciiCanvas.style.display = 'block';

            // Deactivate and hide normal windows
            this._commandWindow.deactivate();
            this._buyWindow.deactivate();
            this._sellWindow.deactivate();
            this._numberWindow.deactivate();
            this._commandWindow.hide();
            this._buyWindow.hide();
            this._sellWindow.hide();
            this._numberWindow.hide();
            this._statusWindow.hide();
            this._goldWindow.hide();

            this._selectedCategory = 0; // 0: Buy, 1: Sell, 2: Cancel
            this._selectedIndex = 0;
            this._resolvedGoods = this.resolveGoods(this._asciiGoods);
            this._activeWindow = 'category'; // 'category', 'list', 'quantity'
            this._quantity = 1;
            this._shopMode = 'buy';
        }
    };

    const _Scene_Shop_terminate = Scene_Shop.prototype.terminate;
    Scene_Shop.prototype.terminate = function () {
        if (asciiCanvas) {
            asciiCanvas.style.display = 'none';
        }
        _Scene_Shop_terminate.call(this);
    };

    Scene_Shop.prototype.resolveGoods = function (goods) {
        const resolved = [];
        if (!goods) return resolved;
        for (const good of goods) {
            const type = good[0];
            const id = good[1];
            const priceOverride = good[2];
            const price = good[3];

            let item = null;
            if (type === 0) item = $dataItems[id];
            if (type === 1) item = $dataWeapons[id];
            if (type === 2) item = $dataArmors[id];

            if (item) {
                // A sold-out line is off the shelf here too (ItemSystemShop keeps
                // the stock record; this list is drawn after it was rolled).
                if (typeof this.getStock === 'function' && this.getStock(item) <= 0) continue;
                const finalPrice = priceOverride === 1 ? price : item.price;
                resolved.push({ item, price: finalPrice });
            }
        }
        return resolved;
    };

    Scene_Shop.prototype.getSellableItems = function () {
        // A key item is quest property, never merchandise: no shop buys one.
        const items = $gameParty.allItems().filter(item =>
            !(item && DataManager.isItem(item) && item.itypeId === 2));
        return items.map(item => ({ item, price: Math.floor(item.price / 2) }));
    };

    const _Scene_Shop_update = Scene_Shop.prototype.update;
    Scene_Shop.prototype.update = function () {
        if (asciiMode) {
            this.updateAsciiShopInput();
            this.renderAsciiShop();
            Scene_Base.prototype.update.call(this);
            return;
        }
        _Scene_Shop_update.call(this);
    };

    Scene_Shop.prototype.updateAsciiShopInput = function () {
        if (this._activeWindow === 'category') {
            if (Input.isRepeated('right')) {
                this._selectedCategory = (this._selectedCategory + 1) % 3;
                SoundManager.playCursor();
            }
            if (Input.isRepeated('left')) {
                this._selectedCategory = (this._selectedCategory - 1 + 3) % 3;
                SoundManager.playCursor();
            }
            if (Input.isTriggered('ok')) {
                if (this._selectedCategory === 0) { // Buy
                    this._activeWindow = 'list';
                    this._selectedIndex = 0;
                    this._shopMode = 'buy';
                    SoundManager.playOk();
                } else if (this._selectedCategory === 1) { // Sell
                    if (this._asciiPurchaseOnly) {
                        SoundManager.playBuzzer();
                    } else {
                        this._activeWindow = 'list';
                        this._selectedIndex = 0;
                        this._shopMode = 'sell';
                        SoundManager.playOk();
                    }
                } else if (this._selectedCategory === 2) { // Cancel
                    SceneManager.pop();
                    SoundManager.playCancel();
                }
            }
            if (Input.isTriggered('cancel')) {
                SceneManager.pop();
                SoundManager.playCancel();
            }
        } else if (this._activeWindow === 'list') {
            const list = this._shopMode === 'buy' ? this._resolvedGoods : this.getSellableItems();
            if (list.length === 0) {
                if (Input.isTriggered('cancel')) {
                    this._activeWindow = 'category';
                    SoundManager.playCancel();
                }
                return;
            }
            if (Input.isRepeated('down')) {
                this._selectedIndex = (this._selectedIndex + 1) % list.length;
                SoundManager.playCursor();
            }
            if (Input.isRepeated('up')) {
                this._selectedIndex = (this._selectedIndex - 1 + list.length) % list.length;
                SoundManager.playCursor();
            }
            if (Input.isTriggered('ok')) {
                const itemData = list[this._selectedIndex];
                if (itemData && this.canBuyOrSell(itemData)) {
                    this._activeWindow = 'quantity';
                    this._quantity = 1;
                    SoundManager.playOk();
                } else {
                    SoundManager.playBuzzer();
                }
            }
            if (Input.isTriggered('cancel')) {
                this._activeWindow = 'category';
                SoundManager.playCancel();
            }
        } else if (this._activeWindow === 'quantity') {
            if (Input.isRepeated('up')) {
                this._quantity = Math.min(this._quantity + 1, this.maxQuantity());
                SoundManager.playCursor();
            }
            if (Input.isRepeated('down')) {
                this._quantity = Math.max(this._quantity - 1, 1);
                SoundManager.playCursor();
            }
            if (Input.isTriggered('ok')) {
                this.executeTrade();
                this._activeWindow = 'list';
                SoundManager.playOk();
            }
            if (Input.isTriggered('cancel')) {
                this._activeWindow = 'list';
                SoundManager.playCancel();
            }
        }
    };

    Scene_Shop.prototype.canBuyOrSell = function (itemData) {
        if (this._shopMode === 'buy') {
            return $gameParty.gold() >= itemData.price && $gameParty.numItems(itemData.item) < 99;
        } else {
            return $gameParty.numItems(itemData.item) > 0;
        }
    };

    Scene_Shop.prototype.maxQuantity = function () {
        const list = this._shopMode === 'buy' ? this._resolvedGoods : this.getSellableItems();
        const itemData = list[this._selectedIndex];
        if (!itemData) return 1;
        if (this._shopMode === 'buy') {
            const maxGold = Math.floor($gameParty.gold() / itemData.price);
            const maxHold = 99 - $gameParty.numItems(itemData.item);
            return Math.min(maxGold, maxHold);
        } else {
            return $gameParty.numItems(itemData.item);
        }
    };

    Scene_Shop.prototype.executeTrade = function () {
        const list = this._shopMode === 'buy' ? this._resolvedGoods : this.getSellableItems();
        const itemData = list[this._selectedIndex];
        if (!itemData) return;

        const totalCost = itemData.price * this._quantity;
        if (this._shopMode === 'buy') {
            $gameParty.loseGold(totalCost);
            $gameParty.gainItem(itemData.item, this._quantity);
        } else {
            $gameParty.gainGold(totalCost);
            $gameParty.loseItem(itemData.item, this._quantity);
            if ($gameParty.numItems(itemData.item) === 0) {
                this._selectedIndex = Math.max(0, this._selectedIndex - 1);
            }
        }
    };

    Scene_Shop.prototype.renderAsciiShop = function () {
        if (!asciiContext) return;

        asciiContext.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
        asciiContext.fillStyle = '#000000';
        asciiContext.fillRect(0, 0, asciiCanvas.width, asciiCanvas.height);

        const fontSize = FONT_SIZE;
        asciiContext.font = `${fontSize}px ${FONT_FAMILY}`;

        // Header
        asciiContext.fillStyle = TEXT_COLOR;
        asciiContext.textAlign = 'center';
        asciiContext.fillText("--- SHOP ---", CANVAS_WIDTH / 2, 30);

        // Gold
        const euroGold = ($gameParty.gold() / 100).toFixed(2);
        asciiContext.fillStyle = '#FFD700';
        asciiContext.textAlign = 'right';
        asciiContext.fillText(`Balance: ${euroGold} €`, CANVAS_WIDTH - 50, 30);

        // Categories
        const categories = ["BUY", "SELL", "CANCEL"];
        const catWidth = 150;
        const startX = (CANVAS_WIDTH - catWidth * 3) / 2;

        for (let i = 0; i < categories.length; i++) {
            const x = startX + i * catWidth + catWidth / 2;
            if (this._activeWindow === 'category' && i === this._selectedCategory) {
                asciiContext.fillStyle = '#FF0000';
                asciiContext.fillText(`> ${categories[i]} <`, x, 70);
            } else {
                if (i === 1 && this._asciiPurchaseOnly) {
                    asciiContext.fillStyle = '#808080';
                } else {
                    asciiContext.fillStyle = (this._selectedCategory === i && this._activeWindow !== 'category') ? '#FFD700' : '#FFFF00';
                }
                asciiContext.fillText(categories[i], x, 70);
            }
        }

        // List
        const list = this._shopMode === 'buy' ? this._resolvedGoods : this.getSellableItems();
        const listY = 120;
        const listX = 50;

        asciiContext.textAlign = 'left';
        for (let i = 0; i < list.length; i++) {
            const itemData = list[i];
            const y = listY + i * (fontSize + 10);

            if (this._activeWindow === 'list' && i === this._selectedIndex) {
                asciiContext.fillStyle = '#FF0000';
                asciiContext.fillText(`> ${itemData.item.name}`, listX, y);
            } else {
                asciiContext.fillStyle = '#FFFFFF';
                asciiContext.fillText(`  ${itemData.item.name}`, listX, y);
            }

            const euroPrice = (itemData.price / 100).toFixed(2);
            asciiContext.fillStyle = '#FFD700';
            asciiContext.fillText(`${euroPrice} €`, listX + 250, y);
        }

        // Details
        const selectedItemData = list[this._selectedIndex];
        if (selectedItemData) {
            this.renderItemDetails(selectedItemData.item, 450, listY);
        }

        // Quantity Box
        if (this._activeWindow === 'quantity') {
            const boxWidth = 300;
            const boxHeight = 100;
            const bX = (CANVAS_WIDTH - boxWidth) / 2;
            const bY = (CANVAS_HEIGHT - boxHeight) / 2;

            asciiContext.fillStyle = 'rgba(0, 0, 0, 0.9)';
            asciiContext.fillRect(bX, bY, boxWidth, boxHeight);
            asciiContext.strokeStyle = '#FFFFFF';
            asciiContext.strokeRect(bX, bY, boxWidth, boxHeight);

            asciiContext.fillStyle = '#FFFFFF';
            asciiContext.textAlign = 'center';
            asciiContext.fillText(`Quantity: ${this._quantity}`, CANVAS_WIDTH / 2, bY + 40);

            const total = (selectedItemData.price * this._quantity / 100).toFixed(2);
            asciiContext.fillText(`Total: ${total} €`, CANVAS_WIDTH / 2, bY + 70);
        }
    };

    Scene_Shop.prototype.renderItemDetails = function (item, x, y) {
        const fontSize = FONT_SIZE;
        const lineHeight = fontSize + 6;
        let currentY = y;

        asciiContext.fillStyle = '#FFD700';
        asciiContext.textAlign = 'left';
        asciiContext.fillText(item.name, x, currentY);
        currentY += lineHeight;

        asciiContext.strokeStyle = '#FFFFFF';
        asciiContext.beginPath();
        asciiContext.moveTo(x, currentY);
        asciiContext.lineTo(x + 300, currentY);
        asciiContext.stroke();
        currentY += 10;

        asciiContext.fillStyle = '#FFFFFF';

        const categoryName = window.ItemSystemUtils ? window.ItemSystemUtils.getItemCategoryName(item) : 'Unknown';
        this.drawKeyValue("Type", categoryName, x, currentY);
        currentY += lineHeight;

        const weight = window.ItemSystemUtils ? window.ItemSystemUtils.getItemWeight(item) : 0;
        this.drawKeyValue("Weight", (weight / 10).toFixed(1) + " kg", x, currentY);
        currentY += lineHeight;

        if (DataManager.isWeapon(item)) {
            const scaling = this.getWeaponScaling(item);
            if (scaling) {
                this.drawKeyValue("Scale", scaling, x, currentY);
                currentY += lineHeight;
            }
            this.drawParams(item, x, currentY);
        } else if (DataManager.isArmor(item)) {
            let slot = $dataSystem.equipTypes[item.etypeId];
            this.drawKeyValue("Slot", slot, x, currentY);
            currentY += lineHeight;
            this.drawParams(item, x, currentY);
        } else if (DataManager.isItem(item)) {
            this.drawKeyValue("Use", item.consumable ? "Single" : "Unlimited", x, currentY);
            currentY += lineHeight;

            if (window.ItemSystemUtils && window.ItemSystemUtils.isFoodItem(item)) {
                const calories = window.ItemSystemUtils.getNutritionValue(item, "calories");
                if (calories > 0) {
                    this.drawKeyValue("Calories", calories.toString(), x, currentY);
                    currentY += lineHeight;
                }
            }
        }
    };

    Scene_Shop.prototype.drawKeyValue = function (key, value, x, y) {
        asciiContext.fillStyle = '#00FFFF';
        asciiContext.fillText(key + ":", x, y);
        asciiContext.fillStyle = '#FFFFFF';
        asciiContext.fillText(value, x + 100, y);
    };

    Scene_Shop.prototype.drawParams = function (item, x, y) {
        const fontSize = FONT_SIZE;
        const lineHeight = fontSize + 6;
        let currentY = y;

        const params = [
            _si18n("HP"),
            _si18n("MP"),
            _si18n("ATT"),
            _si18n("DEF"),
            _si18n("M.ATT"),
            _si18n("M.DEF"),
            _si18n("AGILITY"),
            _si18n("LUCK")
        ];
        for (let i = 2; i < 8; i++) {
            const val = item.params[i];
            if (val !== 0) {
                const sign = val > 0 ? "+" : "";
                this.drawKeyValue(params[i], sign + val, x, currentY);
                currentY += lineHeight;
            }
        }
    };

    Scene_Shop.prototype.getWeaponScaling = function (item) {
        if (!item || !DataManager.isWeapon(item)) return 'STR';
        const note = (item.note || '');
        const scales = [];
        const regex = /<Scale:\s*([^>]+)>/gi;
        let match;
        while ((match = regex.exec(note)) !== null) {
            const parts = match[1].split(',').map(s => s.trim().toUpperCase());
            scales.push(...parts);
        }
        if (scales.length === 0 && item.meta && item.meta.Scale) {
            scales.push(...String(item.meta.Scale).split(',').map(s => s.trim().toUpperCase()));
        }
        if (scales.includes('STR') && scales.includes('DEX')) return 'MIX';
        if (scales.includes('STR') && scales.includes('INT')) return 'ARC';
        if (scales.includes('MIX')) return 'MIX';
        if (scales.includes('ARC')) return 'ARC';
        if (scales.includes('DEX')) return 'DEX';
        if (scales.includes('INT')) return 'INT';
        if (scales.includes('WIS')) return 'WIS';
        if (scales.includes('CON')) return 'CON';
        if (scales.includes('PSI')) return 'PSI';
        if (scales.includes('STR')) return 'STR';
        return 'STR';
    };

    // Expose AsciiMode API for other plugins
    window.AsciiMode = {
        get active() { return asciiMode; },
        get canvas() { return asciiCanvas; },
        get context() { return asciiContext; },
        get fontSize() { return currentFontSize; },
        set fontSize(value) { 
            currentFontSize = Math.max(8, Math.min(64, value)); 
            if (asciiContext) {
                asciiContext.font = `${currentFontSize}px ${FONT_FAMILY}`;
            }
        },
        get fontFamily() { return FONT_FAMILY; },
        createCanvas: createAsciiCanvas
    };

    // =============================================================================
    // AI INSTRUCTIONS FOR PLUGIN COMPATIBILITY WITH ASCII MODE
    // =============================================================================
    /*
     * To make any graphical plugin (like a Bestiary, Custom Menu, or Shop) compatible
     * with this ASCII Mode plugin and maintain the same style, follow these guidelines:
     * 
     * 1. Check for ASCII Mode:
     *    Always check if ASCII mode is active using:
     *    if (window.AsciiMode && window.AsciiMode.active !== 0)
     * 
     * 2. Intercept Scene Start:
     *    In your scene's `start` or `initialize` method, check if ASCII mode is active.
     *    If it is:
     *    - Call `window.AsciiMode.createCanvas()`.
     *    - Show the canvas: `if (window.AsciiMode.canvas) window.AsciiMode.canvas.style.display = 'block';`.
     *    - Deactivate and hide the normal windows of the scene to prevent them from
     *      processing inputs or showing through.
     * 
     * 3. Intercept Scene Terminate:
     *    In your scene's `terminate` method, hide the canvas:
     *    `if (window.AsciiMode.canvas) window.AsciiMode.canvas.style.display = 'none';`.
     * 
     * 4. Override Update Loop:
     *    Override the scene's `update` method.
     *    If ASCII mode is active:
     *    - Handle custom inputs (Up, Down, Left, Right, OK, Cancel).
     *    - Call your custom render function to draw the ASCII UI.
     *    - Call `Scene_Base.prototype.update.call(this)` instead of the normal update
     *      to update basic scene functionality without updating the hidden windows.
     *      Return immediately after.
     * 
     * 5. Rendering Guidelines:
     *    - Use the context to draw: `const ctx = window.AsciiMode.context;`.
     *    - Clear the canvas at the start of rendering: `ctx.clearRect(0, 0, window.AsciiMode.canvas.width, window.AsciiMode.canvas.height)`.
     *    - Fill the background with black: `ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, window.AsciiMode.canvas.width, window.AsciiMode.canvas.height)`.
     *    - Use `window.AsciiMode.fontSize` and `window.AsciiMode.fontFamily`.
     *    - Use standard colors for consistency:
     *      - Yellow (`#FFFF00`) for enabled/selectable options.
     *      - Red (`#FF0000`) for selected/active options.
     *      - Gold (`#FFD700`) for headers, highlights, or values.
     *      - Cyan (`#00FFFF`) for keys or labels.
     *      - White (`#FFFFFF`) for normal text.
     *      - Gray (`#808080`) for disabled options.
     * 
     * 6. Example Structure:
     *    See `Scene_Shop` overrides at the bottom of `ASCIIMode.js` for a complete example.
     */

    // =============================================================================
    // UNIVERSAL ASCII UI FRAMEWORK
    // =============================================================================
    
    const _Window_Base_initialize = Window_Base.prototype.initialize;
    Window_Base.prototype.initialize = function(rect) {
        _Window_Base_initialize.call(this, rect);
        this._asciiElements = [];
    };

    const _Window_Base_createContents = Window_Base.prototype.createContents;
    Window_Base.prototype.createContents = function() {
        _Window_Base_createContents.call(this);
        if (this.contents) {
            this.contents._windowRef = this;
        }
        this._asciiElements = [];
    };

    const _Bitmap_clear = Bitmap.prototype.clear;
    Bitmap.prototype.clear = function() {
        _Bitmap_clear.call(this);
        if (this._windowRef) {
            this._windowRef._asciiElements = [];
        }
    };

    const _Bitmap_drawText = Bitmap.prototype.drawText;
    Bitmap.prototype.drawText = function(text, x, y, maxWidth, lineHeight, align) {
        _Bitmap_drawText.call(this, text, x, y, maxWidth, lineHeight, align);
        if (this._windowRef) {
            if (!this._windowRef._asciiElements) this._windowRef._asciiElements = [];
            this._windowRef._asciiElements.push({
                type: 'text',
                text: text,
                x: x,
                y: y,
                lineHeight: lineHeight,
                maxWidth: maxWidth,
                align: align,
                color: this.textColor
            });
        }
    };

    const _Bitmap_fillRect = Bitmap.prototype.fillRect;
    Bitmap.prototype.fillRect = function(x, y, width, height, color) {
        _Bitmap_fillRect.call(this, x, y, width, height, color);
        if (this._windowRef) {
            if (!this._windowRef._asciiElements) this._windowRef._asciiElements = [];
            this._windowRef._asciiElements.push({
                type: 'rect',
                x: x,
                y: y,
                width: width,
                height: height,
                color: color
            });
        }
    };

    const _Window_Base_drawIcon = Window_Base.prototype.drawIcon;
    Window_Base.prototype.drawIcon = function(iconIndex, x, y) {
        _Window_Base_drawIcon.call(this, iconIndex, x, y);
        if (!this._asciiElements) this._asciiElements = [];
        this._asciiElements.push({ type: 'icon', iconIndex: iconIndex, x: x, y: y });
    };

    const _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _Scene_Base_update.call(this);
        
        if (this instanceof Scene_Map || this instanceof Scene_Battle || this instanceof Scene_Shop) {
            return;
        }

        // Keep ASCII DOM styling current (covers ASCII HUD when map mode is off).
        const domOverlay = updateAsciiDomState();

        if (asciiMode) {
            // Menu scenes are mostly HTML/DOM overlays now. When one is on screen,
            // let the ASCII-styled DOM render itself (canvas hidden) instead of the
            // window->ASCII converter. The converter remains the fallback for the
            // few remaining pure RPG Maker window scenes.
            if (domOverlay) {
                if (this._windowLayer) this._windowLayer.visible = true;
                return;
            }
            this.renderUniversalAsciiUi();
        } else if (window.AsciiMode && window.AsciiMode.canvas && window.AsciiMode.canvas.style.display !== 'none') {
            // ASCII map mode off: hide the leftover canvas and show real windows.
            // (ASCII HUD, if on, restyles the DOM purely via CSS above.)
            window.AsciiMode.canvas.style.display = 'none';
            if (this._windowLayer) this._windowLayer.visible = true;
        }
    };

    Scene_Base.prototype.renderUniversalAsciiUi = function() {
        const asciiCanvas = window.AsciiMode.canvas;
        if (!asciiCanvas) {
            window.AsciiMode.createCanvas();
            return;
        }

        asciiCanvas.style.display = 'block';
        if (this._windowLayer) {
            this._windowLayer.visible = false;
        }

        const ctx = window.AsciiMode.context;
        ctx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, asciiCanvas.width, asciiCanvas.height);

        if (this._windowLayer && this._windowLayer.children) {
            for (const win of this._windowLayer.children) {
                if (win instanceof Window && win.visible && win.isOpen() && win.contentsOpacity > 0) {
                    this.drawAsciiWindow(win, ctx);
                }
            }
        }
    };

    Scene_Base.prototype.drawAsciiWindow = function(win, ctx) {
        const layerX = this._windowLayer ? this._windowLayer.x : 0;
        const layerY = this._windowLayer ? this._windowLayer.y : 0;

        const scaleX = window.AsciiMode.canvas.width / (Graphics.width || 816);
        const scaleY = window.AsciiMode.canvas.height / (Graphics.height || 624);

        const wx = (win.x + layerX) * scaleX;
        const wy = (win.y + layerY) * scaleY;
        const ww = win.width * scaleX;
        const wh = win.height * scaleY;
        const padding = (win.padding !== undefined ? win.padding : 12) * scaleX;
        const innerX = wx + padding;
        const innerY = wy + padding;

        const fontSize = FONT_SIZE;
        ctx.font = `${fontSize}px ${window.AsciiMode.fontFamily || 'monospace'}`;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(wx, wy, ww, wh);

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(wx, wy, ww, wh);

        if (typeof win.cursorRect === 'function' && win.active && win._cursorRect && win._cursorRect.width > 0) {
            const rect = win.cursorRect();
            const cx = innerX + rect.x * scaleX;
            const cy = innerY + rect.y * scaleY;
            const cw = rect.width * scaleX;
            const ch = rect.height * scaleY;
            
            ctx.fillStyle = '#555555';
            ctx.fillRect(cx, cy, cw, ch);
            
            ctx.fillStyle = '#00FF00';
            ctx.textBaseline = 'middle';
            ctx.fillText('>', cx + 2, cy + ch / 2);
        }

        if (win._asciiElements) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(innerX, innerY, ww - padding * 2, wh - padding * 2);
            ctx.clip();

            for (const el of win._asciiElements) {
                const ex = innerX + el.x * scaleX;
                const ey = innerY + el.y * scaleY;
                
                if (el.type === 'text') {
                    ctx.fillStyle = el.color || '#FFFFFF';
                    ctx.textAlign = el.align || 'left';
                    ctx.textBaseline = 'top';
                    
                    let drawX = ex;
                    if (el.align === 'center') drawX += (el.maxWidth * scaleX || 0) / 2;
                    if (el.align === 'right') drawX += (el.maxWidth * scaleX || 0);
                    
                    const lh = (el.lineHeight || 36) * scaleY;
                    ctx.fillText(el.text, drawX, ey + (lh - fontSize) / 2);
                } else if (el.type === 'rect') {
                    ctx.fillStyle = el.color || '#FFFFFF';
                    ctx.fillRect(ex, ey, el.width * scaleX, el.height * scaleY);
                } else if (el.type === 'icon') {
                    ctx.fillStyle = '#FFFF00';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText('', ex, ey);
                }
            }
            ctx.restore();
        }
    };

    console.log(`${pluginName} loaded successfully!`);
})();