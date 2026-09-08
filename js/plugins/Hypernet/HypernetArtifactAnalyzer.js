/*:
 * @target MZ
 * @plugindesc v2.0.0 Artifact Analyzer app for HypernetOS. Displays procedural artifacts discovered in the alchemical world.
 * @author Omni-Lex
 * 
 * @help
 * HypernetArtifactAnalyzer.js
 * 
 * Launches Artifact Analyzer:
 * window.HypernetOS.launchApp('app-artifact-analyzer')
 */

(() => {
    'use strict';

    // Escape a value for safe use in HTML text and double-quoted attribute contexts.
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getIconSpriteHTML(iconIndex, size = 32) {
        if (!iconIndex) return `<div  style="width:${size}px; height:${size}px;" class="hn-style-0001"></div>`;
        const cols = 16;
        const col = iconIndex % cols;
        const row = Math.floor(iconIndex / cols);
        const posX = -(col * 32);
        const posY = -(row * 32);
        return `
            <div  style="width: ${size}px; height: ${size}px;" class="hn-style-0002">
                <div  style="background-position: ${posX}px ${posY}px; transform: scale(${size / 32});" class="hn-style-0003"></div>
            </div>
        `;
    }

    window.HypernetArtifactAnalyzer = {
        _activeFilter: 'all', // 'all', 'item', 'weapon', 'armor'
        _searchQuery: '',
        _selectedArtifactId: null,
        _selectedArtifactType: null, // 'item', 'weapon', 'armor'
        _previews: [],
        win: null,

        // Every rebuild of the details panel throws its canvas away, so the WebGL
        // context behind it has to go with it: the browser force-loses the OLDEST
        // context once the cap is passed, and that is the game's own.
        disposePreviews: function() {
            if (this._previews.length && window.Weapon3DPreview) {
                window.Weapon3DPreview.disposeAll(this._previews);
            }
            this._previews = [];
        },

        launch: function() {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error("HypernetOS core not loaded!");
                return;
            }

            const id = 'app-artifact-analyzer';
            const title = T('ArtifactAnalyzer.title');
            
            const contentHTML = `
                <div id="artifact-analyzer-content"  class="hn-style-0004">
                    <!-- Top scan banner -->
                    <div  class="hn-style-0005">
                        <span>${T('ArtifactAnalyzer.scannerBanner')}</span>
                        <span id="scanner-totals"  class="hn-style-0006">${T('ArtifactAnalyzer.discoveredCount', { found: 0, total: 100 })}</span>
                    </div>

                    <!-- Split Panels -->
                    <div  class="hn-style-0007">
                        <!-- Left Panel: Discovered Artifacts List & Filters -->
                        <div  class="hn-style-0008">
                            <!-- Search Input -->
                            <div  class="hn-style-0009">
                                <input type="text" id="artifact-search-box" placeholder="${T('ArtifactAnalyzer.searchRelics')}"  oninput="window.HypernetArtifactAnalyzer.handleSearch(this.value)" / class="hn-style-0010">
                            </div>

                            <!-- Filter Tabs -->
                            <div  class="hn-style-0011">
                                <button class="filter-tab active" id="filter-all" onclick="window.HypernetArtifactAnalyzer.setFilter('all')">${T('ArtifactAnalyzer.filterAll')}</button>
                                <button class="filter-tab" id="filter-item" onclick="window.HypernetArtifactAnalyzer.setFilter('item')">${T('ArtifactAnalyzer.filterItems')}</button>
                                <button class="filter-tab" id="filter-weapon" onclick="window.HypernetArtifactAnalyzer.setFilter('weapon')">${T('ArtifactAnalyzer.filterWeapons')}</button>
                                <button class="filter-tab" id="filter-armor" onclick="window.HypernetArtifactAnalyzer.setFilter('armor')">${T('ArtifactAnalyzer.filterArmors')}</button>
                            </div>
                            
                            <div id="discovered-artifacts-list"  class="hn-style-0012">
                                <!-- Populated dynamically -->
                            </div>
                        </div>

                        <!-- Right Panel: Holographic Analysis Screen -->
                        <div id="analyzer-details-panel"  class="hn-style-0013">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                </div>

                
            `;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: id,
                title: title,
                icon: 300, // Relic/Flask icon
                width: 790,
                height: 490,
                contentHTML: contentHTML
            });

            this.win = win;
            
            // Listen for keydown inside this window to close it on Escape
            win.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    window.HypernetOS.WindowManager.closeWindow(win);
                }
            });

            this.refreshApp(win);

            win.addEventListener('hypernet-closed', () => {
                this.disposePreviews();
                this.win = null;
                this._selectedArtifactId = null;
                this._selectedArtifactType = null;
            });
        },

        _searchDebounce: null,
        handleSearch: function(query) {
            this._searchQuery = query.toLowerCase().trim();
            // Debounce: avoid rescanning 200+ data entries on every keystroke.
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this._searchDebounce = null;
                this.refreshApp(this.win);
            }, 150);
        },

        setFilter: function(filter) {
            this._activeFilter = filter;
            if (this.win) {
                this.win.querySelectorAll('.filter-tab').forEach(btn => {
                    btn.classList.remove('active');
                });
                const activeBtn = this.win.querySelector(`#filter-${filter}`);
                if (activeBtn) activeBtn.classList.add('active');
            }
            this.refreshApp(this.win);
        },

        // Retrieves custody timeline history for an artifact by name
        getArtifactCustodyHistory: function(artifactName) {
            if (!$gameSystem || !$gameSystem._historicalEvents) return [];
            const history = [];
            $gameSystem._historicalEvents.forEach(e => {
                if (e.description && e.description.includes(artifactName)) {
                    history.push({
                        date: e.date,
                        description: e.description,
                        iconIndex: e.iconIndex || 245
                    });
                }
            });
            return history;
        },

        // Parse last known geopolitical owner from latest event
        getLastKnownOwner: function(artifactName) {
            const history = this.getArtifactCustodyHistory(artifactName);
            if (history.length === 0) return { owner: T('ArtifactAnalyzer.unknownLocation'),
                date: "N/A", action: T('ArtifactAnalyzer.action.undiscovered') };
            
            const lastEvent = history[history.length - 1];
            const desc = lastEvent.description;
            
            let owner = T('ArtifactAnalyzer.unknownLocation');
            let action = T('ArtifactAnalyzer.action.undiscovered');
            
            // i18n-ignore-start  the description is HistorySimulator's own English
            // prose and is matched, not shown; only `action` below is display copy
            if (desc.includes("discovered")) {
                owner = desc.split(" discovered")[0];
                action = T('ArtifactAnalyzer.action.discovered');
            } else if (desc.includes("crafted")) {
                owner = desc.split(" crafted")[0];
                action = T('ArtifactAnalyzer.action.crafted');
            } else if (desc.includes("exhumed")) {
                owner = desc.split(" exhumed")[0];
                action = T('ArtifactAnalyzer.action.exhumed');
            } else if (desc.includes("stole from")) {
                owner = desc.split(" stole from")[0];
                const parts = desc.split(" stole from ");
                if (parts[1]) {
                    const target = parts[1].split(" the ")[0];
                    action = T('ArtifactAnalyzer.action.stolenFrom', { target: target });
                } else {
                    action = T('ArtifactAnalyzer.action.stolen');
                }
            } else if (desc.includes("stole")) {
                owner = desc.split(" stole")[0];
                action = T('ArtifactAnalyzer.action.stolen');
            }
            // i18n-ignore-end
            
            return {
                owner: owner.trim(),
                date: lastEvent.date,
                action: action,
                description: desc
            };
        },

        getArtifactStats: function(artifact) {
            const statNames = T.list('ArtifactAnalyzer.statNames');
            const stats = [];
            
            // Check if it has params (Weapons/Armors)
            if (artifact.rawItem.params && Array.isArray(artifact.rawItem.params)) {
                artifact.rawItem.params.forEach((val, idx) => {
                    if (val > 0) {
                        stats.push({ name: statNames[idx], value: `+${val}` });
                    }
                });
            }
            
            // Check if it has effects (Items)
            if (artifact.rawItem.effects && Array.isArray(artifact.rawItem.effects)) {
                artifact.rawItem.effects.forEach(eff => {
                    if (eff.type === "addParam" || eff.code === 21) {
                        // Standard RMMZ param increase or custom format
                        const paramId = eff.params ? eff.params[0] : eff.dataId;
                        const val = eff.params ? eff.params[1] : eff.value;
                        if (val > 0) {
                            stats.push({ name: statNames[paramId] || T('ArtifactAnalyzer.statFallback'), value: `+${val}` });
                        }
                    }
                });
            }
            
            return stats;
        },

        refreshApp: function(win) {
            if (!win) return;
            this.disposePreviews();
            const useItalian = ConfigManager.language === 'it';
            const listContainer = win.querySelector('#discovered-artifacts-list');
            const detailsPanel = win.querySelector('#analyzer-details-panel');
            const totalsBanner = win.querySelector('#scanner-totals');

            if (!listContainer || !detailsPanel) return;

            // Fetch and build dynamic list of procedural artifacts
            const discovered = [];

            // 1. Scan Items (1501-1600)
            for (let id = 1501; id <= 1600; id++) {
                const item = $dataItems[id];
                if (item && (item.isGenerated || (item.name && !item.name.startsWith("Empty ") && (item.note || '').toLowerCase().includes('artifact')))) {
                    discovered.push({
                        type: 'item',
                        id: item.id,
                        name: item.name,
                        iconIndex: item.iconIndex,
                        price: item.price,
                        description: item.description,
                        rawItem: item
                    });
                }
            }

            // 2. Scan Weapons (1501-1550)
            for (let id = 1501; id <= 1550; id++) {
                const weapon = $dataWeapons[id];
                if (weapon && (weapon.isGenerated || (weapon.name && !weapon.name.startsWith("Empty ") && ((weapon.note || '').toLowerCase().includes('procedural') || (weapon.note || '').toLowerCase().includes('artifact'))))) {
                    discovered.push({
                        type: 'weapon',
                        id: weapon.id,
                        name: weapon.name,
                        iconIndex: weapon.iconIndex,
                        price: weapon.price,
                        description: weapon.description,
                        rawItem: weapon
                    });
                }
            }

            // 3. Scan Armors (1501-1550)
            for (let id = 1501; id <= 1550; id++) {
                const armor = $dataArmors[id];
                if (armor && (armor.isGenerated || (armor.name && !armor.name.startsWith("Empty ") && ((armor.note || '').toLowerCase().includes('procedural') || (armor.note || '').toLowerCase().includes('artifact'))))) {
                    discovered.push({
                        type: 'armor',
                        id: armor.id,
                        name: armor.name,
                        iconIndex: armor.iconIndex,
                        price: armor.price,
                        description: armor.description,
                        rawItem: armor
                    });
                }
            }

            // Apply category filter
            let filtered = discovered;
            if (this._activeFilter !== 'all') {
                filtered = discovered.filter(x => x.type === this._activeFilter);
            }

            // Apply search query
            if (this._searchQuery) {
                filtered = filtered.filter(x => x.name && x.name.toLowerCase().includes(this._searchQuery));
            }

            if (totalsBanner) {
                totalsBanner.innerText = `${T('ArtifactAnalyzer.discovered')}: ${discovered.length} ${T('ArtifactAnalyzer.relics')}`;
            }

            if (filtered.length === 0) {
                listContainer.innerHTML = `
                    <div  class="hn-style-0014">
                        ${T('ArtifactAnalyzer.noRelicsFoundMatchingThe')}
                    </div>
                `;
                detailsPanel.innerHTML = `
                    <div  class="hn-style-0015">
                        <span  class="hn-style-0016"></span>
                        <span  class="hn-style-0017">${T('ArtifactAnalyzer.satelliteScanOnlineAwaitingAlchemical')}</span>
                    </div>
                `;
                return;
            }

            // Populate Left List
            let listHTML = "";
            filtered.forEach(item => {
                // Live inventory check (including equipped gear)
                const isHeld = $gameParty.hasItem(item.rawItem, true);
                const isSelected = this._selectedArtifactId === item.id && this._selectedArtifactType === item.type;
                const statusLabel = isHeld ? (T('ArtifactAnalyzer.held')) : (T('ArtifactAnalyzer.inWorld'));
                const statusClass = isHeld ? "held" : "world";

                listHTML += `
                    <div class="artifact-list-item ${isSelected ? 'selected' : ''}" onclick="window.HypernetArtifactAnalyzer.selectArtifact(${item.id}, '${item.type}')">
                        ${getIconSpriteHTML(item.iconIndex, 20)}
                        <span  title="${escapeHtml(item.name)}" class="hn-style-0018">${escapeHtml(item.name)}</span>
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                `;
            });
            listContainer.innerHTML = listHTML;

            // Populate Right Details Panel
            const activeItem = filtered.find(item => item.id === this._selectedArtifactId && item.type === this._selectedArtifactType);
            if (activeItem) {
                const isHeld = $gameParty.hasItem(activeItem.rawItem, true);
                const quantity = $gameParty.numItems(activeItem.rawItem);
                
                // Get dynamic stats and custody history
                const stats = this.getArtifactStats(activeItem);
                const custodyHistory = this.getArtifactCustodyHistory(activeItem.name);
                const worldState = this.getLastKnownOwner(activeItem.name);

                // The same question every other menu asks about a 3D model, asked
                // of the one service that answers it (shields included).
                const previewModel = window.Weapon3DPreview
                    ? window.Weapon3DPreview.modelFor(activeItem.rawItem)
                    : null;
                
                let detailsHTML = `
                    <h3  class="hn-style-0019">${T('ArtifactAnalyzer.satelliteDiagnostics')}</h3>
                    
                    <!-- Relic Header Card -->
                    <div  class="hn-style-0020">
                        ${getIconSpriteHTML(activeItem.iconIndex, 40)}
                        <div  class="hn-style-0021">
                            <div  title="${escapeHtml(activeItem.name)}" class="hn-style-0022">${escapeHtml(activeItem.name)}</div>
                            <div  class="hn-style-0023">Class: ${activeItem.type} | ID: ${activeItem.id}</div>
                        </div>
                    </div>

                    <!-- Details fields scrollable section -->
                    <div  class="hn-style-0024">
                        <!-- Storage & Geopolitical ownership -->
                        <div class="analysis-field">
                            <span  class="hn-style-0025">${T('ArtifactAnalyzer.custodyStatus')}:</span>
                            <span  style="color:${isHeld ? '#0288d1' : '#5d4037'};" class="hn-style-0026">
                                ${isHeld ? T('ArtifactAnalyzer.inInventory', { count: quantity })
                                    : T('ArtifactAnalyzer.existentInWorld')}
                            </span>
                        </div>
                        
                        <div class="analysis-field">
                            <span  class="hn-style-0025">${T('ArtifactAnalyzer.lastKnownOwner')}:</span>
                            <span  class="hn-style-0027">${isHeld ? (T('ArtifactAnalyzer.playerParty')) : worldState.owner}</span>
                        </div>

                        <div class="analysis-field">
                            <span  class="hn-style-0025">${T('ArtifactAnalyzer.estimatedValue')}:</span>
                            <span  class="hn-style-0028">€ ${((activeItem.price || 0) / 100).toFixed(2)}</span>
                        </div>

                        ${previewModel ? `
                        <div  class="hn-style-0029">
                            <span  class="hn-style-0030">${T('ArtifactAnalyzer.structuralScan')}</span>
                            <canvas id="artifact-model-canvas" class="hn-artifact-model"></canvas>
                        </div>
                        ` : ''}

                        <!--  Stats Grid -->
                        ${stats.length > 0 ? `
                        <div  class="hn-style-0029">
                            <span  class="hn-style-0030">${T('ArtifactAnalyzer.attributes')}</span>
                            <div  class="hn-style-0031">
                                ${stats.map(s => `
                                    <div  class="hn-style-0032">
                                        <span  class="hn-style-0033">${s.name}:</span>
                                        <span  class="hn-style-0034">${s.value}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                        
                        <!-- Description specifications -->
                        <div  class="hn-style-0029">
                            <span  class="hn-style-0030">${T('ArtifactAnalyzer.logisticalSpecifications')}</span>
                            <p  class="hn-style-0035">
                                "${activeItem.description || (T('ArtifactAnalyzer.noAdditionalSpecifications'))}"
                            </p>
                        </div>

                        <!-- Geopolitical History Timeline -->
                        <div  class="hn-style-0029">
                            <span  class="hn-style-0030">${T('ArtifactAnalyzer.geopoliticalTimelineEurope')}</span>
                            <div  class="hn-style-0036">
                                ${custodyHistory.length > 0 ? custodyHistory.map(node => `
                                    <div class="timeline-node">
                                        <span  class="hn-style-0037">[${node.date}]</span>
                                        <span  class="hn-style-0038">${node.description}</span>
                                    </div>
                                `).join('') : `
                                    <div  class="hn-style-0039">
                                        ${T('ArtifactAnalyzer.noAlternateHistoryTraceRecorded')}
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>

                    <div  class="hn-style-0040">
                        <button class="btn-stamp hn-style-0041" onclick="window.HypernetArtifactAnalyzer.deselectArtifact()" >
                            ${T('ArtifactAnalyzer.clearSelection')}
                        </button>
                        <span  class="hn-style-0042">${T('ArtifactAnalyzer.scannerActive')}</span>
                    </div>
                `;
                detailsPanel.innerHTML = detailsHTML;

                if (previewModel && window.Weapon3DPreview) {
                    const canvas = detailsPanel.querySelector('#artifact-model-canvas');
                    const entry = canvas ? window.Weapon3DPreview.mount(canvas, previewModel) : null;
                    if (entry) this._previews.push(entry);
                }
            } else {
                detailsPanel.innerHTML = `
                    <div  class="hn-style-0043">
                        <span  class="hn-style-0044"></span>
                        <span  class="hn-style-0017">${T('ArtifactAnalyzer.selectARelicFromThe')}</span>
                    </div>
                `;
            }
        },

        selectArtifact: function(id, type) {
            this._selectedArtifactId = id;
            this._selectedArtifactType = type;
            if (window.SoundManager) SoundManager.playOk();
            this.refreshApp(this.win);
        },

        deselectArtifact: function() {
            this._selectedArtifactId = null;
            this._selectedArtifactType = null;
            if (window.SoundManager) SoundManager.playCancel();
            this.refreshApp(this.win);
        }
    };

    // Register Artifact Analyzer in HypernetOS
    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'app-artifact-analyzer',
            name: T('ArtifactAnalyzer.title'),
            icon: 300,
            launchFn: function() {
                window.HypernetArtifactAnalyzer.launch();
            },
            desktopShortcut: true
        });
    }

})();
