//=============================================================================
// Debug Map Teleporter Plugin
// Version: 1.0.1
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Debug Map Teleporter v1.0.1
 * @author Omni-Lex
 * @version 1.0.1
 * @description Debug menu to view and teleport to all maps in the game
 * 
 * @param openKey
 * @text Open Debug Menu Key
 * @desc Key to open the debug map menu (F6 by default)
 * @type string
 * @default F6
 * 
 * @command openDebugMenu
 * @text Open Debug Map Menu
 * @desc Opens the debug map teleporter window
 * 
 * @command teleportToMap
 * @text Teleport to Map
 * @desc Directly teleport to a specific map by ID
 * 
 * @arg mapId
 * @text Map ID
 * @desc The ID of the map to teleport to
 * @type number
 * @min 1
 * @max 999
 * @default 1
 * 
 * @arg x
 * @text X Position
 * @desc X coordinate to teleport to (0 = auto-find safe position)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 * 
 * @arg y
 * @text Y Position
 * @desc Y coordinate to teleport to (0 = auto-find safe position)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 * 
 * @command listMaps
 * @text List Maps to Console
 * @desc Outputs all available maps to the console for debugging
 * 
 * @help DebugMapTeleporter.js
 * 
 * This plugin creates a debug menu that displays all maps in the game
 * with their preview images and allows teleportation.
 * 
 * Features:
 * - Lists all maps with Quick Access maps at the top
 * - Shows map preview images from ./img/maps/
 * - Teleports to safe locations near existing teleport events
 * - Falls back to random passable tiles if no teleports exist
 * 
 * Usage:
 * - Press Shift+F6 (or configured key) to open the debug menu
 * - Use plugin commands in events for scripted access
 * 
 * Plugin Commands:
 * - "Open Debug Map Menu": Opens the visual map selector
 * - "Teleport to Map": Direct teleportation to specified map/coordinates
 * - "List Maps to Console": Outputs map list to console for reference
 */

(() => {
    'use strict';
    //require('nw.gui').Window.get().showDevTools();
    const parameters = PluginManager.parameters('DebugMapTeleporter');
    const openKey = parameters['openKey'] || 'F6';
    
    let debugWindow = null;
    let mapCache = new Map();
    
    // Register Plugin Commands
    PluginManager.registerCommand('DebugMapTeleporter', 'openDebugMenu', args => {
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.openDebugMapMenu();
        } else {
            $gameMessage.add('Debug Map Menu can only be opened from the map scene.');
        }
    });
    
    PluginManager.registerCommand('DebugMapTeleporter', 'teleportToMap', args => {
        const mapId = parseInt(args.mapId) || 1;
        const x = parseInt(args.x) || 0;
        const y = parseInt(args.y) || 0;
        
        if (SceneManager._scene instanceof Scene_Map) {
            if (x > 0 && y > 0) {
                // Direct teleportation to specified coordinates
                $gamePlayer.reserveTransfer(mapId, x, y, 2, 0);
                console.log(`Direct teleport to Map ${mapId} at (${x}, ${y})`);
            } else {
                // Auto-find safe position
                SceneManager._scene.teleportToMap(mapId);
            }
        } else {
            $gameMessage.add('Teleportation can only be used from the map scene.');
        }
    });
    
    PluginManager.registerCommand('DebugMapTeleporter', 'listMaps', args => {
        const mapInfos = $dataMapInfos.filter(info => info && info.name);
        console.log('=== Available Maps ===');
        mapInfos.forEach(mapInfo => {
            console.log(`ID: ${mapInfo.id}, Name: "${mapInfo.name}"`);
        });
        console.log(`Total: ${mapInfos.length} maps found`);
        
        if (SceneManager._scene instanceof Scene_Map) {
            $gameMessage.add(`Found ${mapInfos.length} maps. Check console for details.`);
        }
    });
    
    // Initialize plugin
    const _Scene_Map_initialize = Scene_Map.prototype.initialize;
    Scene_Map.prototype.initialize = function() {
        _Scene_Map_initialize.call(this);
        this.createDebugMapWindow();
    };
    
    // Handle key input
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        this.updateDebugInput();
    };
    
    Scene_Map.prototype.updateDebugInput = function() {
        // Shift+F6 opens the map teleporter. F9 and F10 belong to the
        // quicksave / quickload pair in Core/SaveSystem.js.
        if (Input.isPressed('shift') && Input.isTriggered('debugmap')) {
            this.openDebugMapMenu();
        }
    };
    
    // Register debug key
    Input.keyMapper[117] = 'debugmap'; // F6
    
    Scene_Map.prototype.createDebugMapWindow = function() {
        // Window will be created when opened
    };
    
    Scene_Map.prototype.openDebugMapMenu = function() {
        if (debugWindow && !debugWindow.closed) {
            debugWindow.focus();
            return;
        }
        
        this.createDebugWindow();
    };
    
    Scene_Map.prototype.createDebugWindow = function() {
        const windowFeatures = 'width=800,height=600,scrollbars=yes,resizable=yes';
        debugWindow = window.open('', 'DebugMapMenu', windowFeatures);
        
        if (!debugWindow) {
            $gameMessage.add('Failed to open debug window. Please allow popups.');
            return;
        }
        
        this.setupDebugWindowContent();
    };
    
    Scene_Map.prototype.setupDebugWindowContent = function() {
        const doc = debugWindow?.document;
        doc.title = 'Debug Map Teleporter';
        
        // Create HTML structure
        // The teleporter is a window.open popup, not an overlay inside the
        // game, so none of the game's stylesheets reach it on its own. Link
        // css/vars.css and the whole token palette comes with it, live preset
        // and all: GameOptions writes the chosen theme over that file. A <base>
        // pins the relative paths (the stylesheet, the map previews) to the
        // game's own directory instead of leaving them on about:blank.
        const baseHref = window.location.href.replace(/[^/]*$/, '');
        doc.head.innerHTML =
            `<base href="${baseHref}">` +
            `<link rel="stylesheet" href="css/vars.css">`;

        doc.body.innerHTML = `
            <style>
                body {
                    font-family: var(--font-ui);
                    margin: 0;
                    padding: 20px;
                    background: var(--bg-secondary-hover);
                    color: var(--text-success-active);
                }
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--border-primary-hover-translucent-15);
                    padding-bottom: 15px;
                }
                h1 {
                    font-size: var(--fs-title);
                    font-weight: bold;
                    letter-spacing: 1px;
                    color: var(--text-detail-heading);
                    margin: 0 0 10px 0;
                }
                .search-container {
                    margin: 15px 0;
                }
                #mapFilter {
                    width: 60%;
                    max-width: 400px;
                    padding: 10px;
                    font-family: var(--font-ui);
                    font-size: var(--fs-body);
                    border: 1px solid var(--border-subtle);
                    border-radius: 4px;
                    background: var(--bg-input-hover);
                    color: var(--text-success-active);
                    outline: none;
                }
                #mapFilter:focus {
                    border-color: var(--text-primary-hover);
                }
                .search-info {
                    margin-top: 8px;
                    font-size: var(--fs-caption);
                    color: var(--text-text-alt-4);
                }
                /* A section heading is ink and a rule, never a plate. */
                .section-header {
                    font-size: var(--fs-detail-heading);
                    font-weight: bold;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-detail-heading);
                    margin: 20px 0 10px 0;
                    padding: 8px 0;
                    border-bottom: 1px solid var(--border-primary-hover-translucent-15);
                }
                .map-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 15px;
                    margin-bottom: 30px;
                    padding: 10px;
                }
                /* No plate and no frame behind an option: the ground is the
                   page, and only the row being pointed at draws a hairline. */
                .map-item {
                    position: relative;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 4px;
                    padding: 10px;
                    cursor: pointer;
                    text-align: center;
                    transition: 0.2s ease;
                    transition-property: background-color, border-color, color;
                }
                .map-item:hover,
                .map-item.kb-focus {
                    border-color: var(--text-primary-hover);
                }
                .map-item:hover .map-name,
                .map-item.kb-focus .map-name {
                    color: var(--text-primary-hover);
                }
                .map-image {
                    width: 100%;
                    height: 120px;
                    object-fit: cover;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    background: var(--bg-well);
                    border: 1px solid var(--border-subtle);
                }
                .map-image.error {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-text-alt-4);
                    font-size: var(--fs-caption);
                    text-align: center;
                }
                .map-info {
                    font-size: var(--fs-label);
                }
                .map-name {
                    font-weight: bold;
                    margin-bottom: 4px;
                    color: var(--text-success-active);
                }
                .map-id {
                    color: var(--text-text-alt-4);
                    font-size: var(--fs-caption);
                }
                .loading {
                    text-align: center;
                    padding: 50px;
                    font-size: var(--fs-heading);
                    color: var(--text-text-alt-4);
                }
                .error {
                    color: var(--text-text-alt-10);
                    text-align: center;
                    padding: 20px;
                }
                .map-item.hidden {
                    display: none;
                }
                /* The one mark that says a map is in Quick Access. */
                .quick-access-badge {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    background: var(--chip-active-bg);
                    color: var(--chip-active-fg);
                    border: 1px solid var(--border-gold-amber);
                    border-radius: 2px;
                    padding: 2px 6px;
                    font-size: var(--fs-caption);
                    font-weight: bold;
                    letter-spacing: 0.06em;
                }
                .back-button {
                    position: absolute;
                    top: 15px;
                    left: 15px;
                    font-family: var(--font-ui);
                    font-size: var(--fs-body);
                    font-weight: bold;
                    text-transform: uppercase;
                    padding: 6px 14px;
                    background: transparent;
                    border: 1.5px solid var(--text-primary-hover);
                    border-radius: 4px;
                    color: var(--text-primary-hover);
                    cursor: pointer;
                    transition: 0.2s ease;
                    transition-property: background-color, border-color, color;
                }
                .back-button:hover,
                .back-button:focus-visible {
                    background: var(--chip-active-bg);
                    color: var(--chip-active-fg);
                    border-color: var(--chip-active-fg);
                }
            </style>
            <div class="header">
                <button id="debugBackButton" class="back-button">Back (Esc)</button>
                <h1>Debug Map Teleporter</h1>
                <div class="search-container">
                    <input type="text" id="mapFilter" placeholder="Search maps by name or ID..." />
                    <div class="search-info">
                        <span id="mapCount">0 maps</span> | <span id="filteredCount">0 shown</span>
                    </div>
                </div>
                <p>Click on any map to teleport there, or press Back / Esc to close</p>
            </div>
            <div id="content">
                <div class="loading">Loading maps...</div>
            </div>
        `;
        
        this.loadAndDisplayMaps();
    };
    
    Scene_Map.prototype.loadAndDisplayMaps = function() {
        const content = debugWindow?.document?.getElementById('content');
        
        try {
            // Get all map data and organize by Quick Access status
            const allMapInfos = $dataMapInfos.filter(info => info && info.name);
            
            // Separate Quick Access maps from regular maps
            const quickAccessMaps = [];
            const regularMaps = [];
            
            allMapInfos.forEach(mapInfo => {
                if (this.isQuickAccessMap(mapInfo)) {
                    quickAccessMaps.push(mapInfo);
                } else {
                    regularMaps.push(mapInfo);
                }
            });
            
            // Sort both arrays by ID
            quickAccessMaps.sort((a, b) => a.id - b.id);
            regularMaps.sort((a, b) => a.id - b.id);
            
            // Create the display structure
            this.createMapSections(quickAccessMaps, regularMaps, content);
            
        } catch (error) {
            content.innerHTML = `<div class="error">Error loading maps: ${error.message}</div>`;
            console.error('Debug Map Menu Error:', error);
        }
    };
    
    Scene_Map.prototype.isQuickAccessMap = function(mapInfo) {
        // Check if the map is in the Quick Access folder (parentId = 0 means root level)
        // In RPG Maker MZ, Quick Access maps typically have a specific structure
        // We can identify them by checking if they're immediate children of root with no parent folder
        return mapInfo.parentId === 0 || mapInfo.parentId === undefined;
    };
    
    Scene_Map.prototype.createMapSections = function(quickAccessMaps, regularMaps, content) {
        let html = '';
        let totalMapsProcessed = 0;
        const totalMapsToProcess = quickAccessMaps.length + regularMaps.length;
        
        // Create Quick Access section if there are any
        if (quickAccessMaps.length > 0) {
            html += '<div class="section-header">Quick Access Maps</div>';
            html += '<div class="map-grid" id="quickAccessGrid"></div>';
        }
        
        // Create Regular Maps section
        if (regularMaps.length > 0) {
            html += '<div class="section-header">All Maps</div>';
            html += '<div class="map-grid" id="regularGrid"></div>';
        }
        
        content.innerHTML = html;
        
        // Load Quick Access maps first
        if (quickAccessMaps.length > 0) {
            const quickGrid = debugWindow?.document?.getElementById('quickAccessGrid');
            quickAccessMaps.forEach(mapInfo => {
                this.loadMapItem(mapInfo, quickGrid, true, () => {
                    totalMapsProcessed++;
                    this.updateCounts(totalMapsProcessed, totalMapsToProcess);
                    if (totalMapsProcessed === totalMapsToProcess) {
                        this.setupSearchFilter();
                    }
                });
            });
        }
        
        // Load Regular maps
        if (regularMaps.length > 0) {
            const regularGrid = debugWindow?.document?.getElementById('regularGrid');
            regularMaps.forEach(mapInfo => {
                this.loadMapItem(mapInfo, regularGrid, false, () => {
                    totalMapsProcessed++;
                    this.updateCounts(totalMapsProcessed, totalMapsToProcess);
                    if (totalMapsProcessed === totalMapsToProcess) {
                        this.setupSearchFilter();
                    }
                });
            });
        }
        
        // Handle case where no maps exist
        if (totalMapsToProcess === 0) {
            content.innerHTML = '<div class="error">No maps found!</div>';
        }
    };
    
    Scene_Map.prototype.loadMapItem = function(mapInfo, grid, isQuickAccess, callback) {
        const mapItem = this.createMapItemElement(mapInfo, isQuickAccess);
        grid.appendChild(mapItem);
        
        // Try to load the image
        const img = mapItem.querySelector('.map-image');
        const imagePath = `img/maps/Map${mapInfo.id.toString().padStart(3, '0')}.png`;
        
        // Create a new image to test loading
        const testImg = new Image();
        testImg.onload = () => {
            img.src = imagePath;
            callback();
        };
        
        testImg.onerror = () => {
            // Image failed to load, show placeholder
            img.classList.add('error');
            img.innerHTML = 'No Preview<br>Available';
            img.style.display = 'flex';
            callback();
        };
        
        testImg.src = imagePath;
    };
    
    Scene_Map.prototype.createMapItemElement = function(mapInfo, isQuickAccess) {
        const doc = debugWindow?.document;
        const mapItem = doc.createElement('div');
        mapItem.className = `map-item ${isQuickAccess ? 'quick-access' : ''}`;
        mapItem.dataset.mapId = mapInfo.id;
        mapItem.dataset.mapName = mapInfo.name.toLowerCase();
        
        mapItem.innerHTML = `
            ${isQuickAccess ? '<div class="quick-access-badge">QUICK</div>' : ''}
            <img class="map-image" alt="${mapInfo.name}" />
            <div class="map-info">
                <div class="map-name">${mapInfo.name}</div>
                <div class="map-id">ID: ${mapInfo.id}</div>
            </div>
        `;
        
        // Add click handler for teleportation
        mapItem.addEventListener('click', () => {
            this.teleportToMap(mapInfo.id);
            if (debugWindow && !debugWindow.closed) {
                debugWindow.close();
            }
        });
        
        return mapItem;
    };
    
    Scene_Map.prototype.updateCounts = function(processed, total) {
        const mapCountEl = debugWindow?.document?.getElementById('mapCount');
        const filteredCountEl = debugWindow?.document?.getElementById('filteredCount');
        if (mapCountEl) mapCountEl.textContent = `${total} maps`;
        if (filteredCountEl) filteredCountEl.textContent = `${total} shown`;
    };
    
    Scene_Map.prototype.teleportToMap = function(mapId) {
        // Load the target map data
        const filename = 'Map%1.json'.format(mapId.padZero(3));
        const xhr = new XMLHttpRequest();
        const url = 'data/' + filename;
        xhr.open('GET', url, true); // Asynchronous to avoid blocking the main thread
        xhr.overrideMimeType('application/json');
        xhr.onload = () => {
            try {
                if (xhr.status < 400) {
                    const mapData = JSON.parse(xhr.responseText);
                    const teleportPos = this.findCenterTeleportPosition(mapData);

                    // Perform teleportation
                    $gamePlayer.reserveTransfer(mapId, teleportPos.x, teleportPos.y, 2, 0);

                    console.log(`Teleporting to Map ${mapId} at center position (${teleportPos.x}, ${teleportPos.y})`);
                } else {
                    $gameMessage.add(`Failed to load map data for Map ${mapId}`);
                }
            } catch (error) {
                console.error('Teleportation error:', error);
                $gameMessage.add(`Error teleporting to Map ${mapId}: ${error.message}`);
            }
        };
        xhr.onerror = () => {
            console.error('Teleportation error: failed to load', url);
            $gameMessage.add(`Failed to load map data for Map ${mapId}`);
        };
        xhr.send();
    };
    
    Scene_Map.prototype.findCenterTeleportPosition = function(mapData) {
        const centerX = Math.floor(mapData.width / 2);
        const centerY = Math.floor(mapData.height / 2);
        
        // First try to find a passable tile near the center
        const nearCenterPos = this.findPassableTileNear(mapData, centerX, centerY);
        if (nearCenterPos) {
            return nearCenterPos;
        }
        
        // If center area is blocked, try teleport events as backup
        const teleportEvents = mapData.events.filter(event => 
            event && event.name && event.name.toLowerCase().startsWith('teleport')
        );
        
        if (teleportEvents.length > 0) {
            const teleportEvent = teleportEvents[0];
            const nearTeleportPos = this.findPassableTileNear(mapData, teleportEvent.x, teleportEvent.y);
            if (nearTeleportPos) {
                return nearTeleportPos;
            }
        }
        
        // Final fallback: find any passable tile
        return this.findRandomPassableTile(mapData);
    };
    
    Scene_Map.prototype.findPassableTileNear = function(mapData, centerX, centerY) {
        const radius = 5; // Increased radius for better center coverage
        
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only check perimeter for r > 0
                    
                    const x = centerX + dx;
                    const y = centerY + dy;
                    
                    if (this.isPassableTile(mapData, x, y)) {
                        return { x: x, y: y };
                    }
                }
            }
        }
        
        return null;
    };
    
    Scene_Map.prototype.findRandomPassableTile = function(mapData) {
        const width = mapData.width;
        const height = mapData.height;
        const maxAttempts = 100;
        
        for (let i = 0; i < maxAttempts; i++) {
            const x = Math.floor(Math.random() * width);
            const y = Math.floor(Math.random() * height);
            
            if (this.isPassableTile(mapData, x, y)) {
                return { x: x, y: y };
            }
        }
        
        // Ultimate fallback
        return { x: 1, y: 1 };
    };
    
    Scene_Map.prototype.isPassableTile = function(mapData, x, y) {
        if (x < 0 || x >= mapData.width || y < 0 || y >= mapData.height) {
            return false;
        }
        
        // Check if there's an event at this position
        const eventAtPos = mapData.events.find(event => 
            event && event.x === x && event.y === y
        );
        if (eventAtPos) {
            return false;
        }
        
        // Basic passability check (simplified)
        // In a real implementation, you might want to check tileset passability
        const layerData = mapData.data;
        const tileId = layerData[x + y * mapData.width];
        
        // Simple heuristic: avoid tile ID 0 and some common blocking tiles
        return tileId > 0 && tileId < 2048; // More permissive tile range
    };
    
    // Setup search filter functionality
    Scene_Map.prototype.setupSearchFilter = function() {
        const filterInput = debugWindow?.document?.getElementById('mapFilter');
        const mapItems = debugWindow?.document?.querySelectorAll('.map-item');
        const filteredCountEl = debugWindow?.document?.getElementById('filteredCount');
        
        const updateFilteredCount = () => {
            const visibleCount = debugWindow?.document?.querySelectorAll('.map-item:not(.hidden)').length;
            if (filteredCountEl) {
                filteredCountEl.textContent = `${visibleCount} shown`;
            }
        };
        
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                
                mapItems.forEach(mapItem => {
                    const mapName = mapItem.dataset.mapName || '';
                    const mapId = mapItem.dataset.mapId || '';
                    const matchesName = mapName.includes(searchTerm);
                    const matchesId = mapId.includes(searchTerm);
                    
                    if (searchTerm === '' || matchesName || matchesId) {
                        mapItem.classList.remove('hidden');
                    } else {
                        mapItem.classList.add('hidden');
                    }
                });
                
                updateFilteredCount();
            });
            
            // Focus the search input for immediate typing
            setTimeout(() => filterInput.focus(), 100);
        }
        
        // Initial count update
        updateFilteredCount();

        // Back / cancel handlers so the player can close the menu without
        // teleporting (issue #161).
        const closeDebug = () => {
            if (debugWindow && !debugWindow.closed) {
                debugWindow.close();
            }
            debugWindow = null;
        };
        const backButton = debugWindow?.document?.getElementById('debugBackButton');
        if (backButton) {
            backButton.addEventListener('click', closeDebug);
        }
        // Walking the list. The window opens with the caret in the search
        // field, so the letters keep going into the filter and only the arrows,
        // Enter and Escape are taken. The ring is kept by INDEX into whatever
        // the filter has left visible, so narrowing the list never strands it.
        let focusIndex = -1;
        const visibleItems = () =>
            Array.from(debugWindow?.document?.querySelectorAll('.map-item:not(.hidden)') || []);

        const paintFocus = (items) => {
            items.forEach((el, i) => el.classList.toggle('kb-focus', i === focusIndex));
            const el = items[focusIndex];
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        };

        // How many cards sit on one row of the grid, measured off the cards
        // themselves so the walk follows whatever width the window has.
        const columnsOf = (items) => {
            if (items.length < 2) return 1;
            const top = items[0].getBoundingClientRect().top;
            let cols = 1;
            while (cols < items.length &&
                   Math.abs(items[cols].getBoundingClientRect().top - top) < 4) cols++;
            return cols;
        };

        const moveFocus = (delta) => {
            const items = visibleItems();
            if (!items.length) return;
            focusIndex = focusIndex < 0
                ? (delta > 0 ? 0 : items.length - 1)
                : Math.max(0, Math.min(items.length - 1, focusIndex + delta));
            paintFocus(items);
        };

        debugWindow?.document?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                closeDebug();
                return;
            }
            const items = visibleItems();
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveFocus(e.key === 'ArrowDown' ? columnsOf(items) : -columnsOf(items));
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                moveFocus(e.key === 'ArrowRight' ? 1 : -1);
            } else if (e.key === 'Enter') {
                const el = items[focusIndex];
                if (!el) return;
                e.preventDefault();
                el.click();
            }
        });

        // A filtered list is a different list: the ring starts again at its top
        // rather than pointing at a card that is no longer on the page.
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                focusIndex = -1;
                visibleItems().forEach((el) => el.classList.remove('kb-focus'));
            });
        }
    };

    // Clean up when leaving map scene
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        _Scene_Map_terminate.call(this);
        if (debugWindow && !debugWindow.closed) {
            debugWindow.close();
        }
    };
    
})();