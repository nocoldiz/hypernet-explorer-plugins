/*:
 * @target MZ
 * @plugindesc Development roadmap. Shows how far along every game system is, the Omega Tower levels and the key destinations, on the title screen and in a full window.
 * @author Omni-Lex
 *
 * @help RoadmapSystem.js
 * ============================================================================
 * Replaces the title screen news panel with the development roadmap.
 *
 * Displays:
 *  - Omega Tower progress (child maps L1, L2... of the tower folder, out of 360)
 *  - Key destinations: authored, unlocked destinations out of four planned
 *    for every European country in Countries.json
 *  - The completion of every system, with the list of what is already done
 *  - A DETAILS button opening the full roadmap with a details column
 *
 * Every name, description and done list lives in i18n/<lang>/plugins/Roadmap.json.
 *
 * No plugin parameters.
 */

(() => {
    'use strict';

    // -------------------------------------------------------------------------
    // Localization helpers: window.T from DataService
    // -------------------------------------------------------------------------
    const T = (key, fallback) => {
        try {
            if (typeof window !== 'undefined' && typeof window.T === 'function') {
                const s = window.T(key);
                if (s && s !== key && typeof s === 'string') return s;
            }
        } catch (e) {
            // fallback below
        }
        return fallback !== undefined ? fallback : key;
    };

    const TList = (key) => {
        try {
            if (typeof window !== 'undefined' && window.T && typeof window.T.list === 'function') {
                const arr = window.T.list(key);
                if (Array.isArray(arr)) return arr.filter(s => typeof s === 'string' && s);
            }
        } catch (e) {
            // empty below
        }
        return [];
    };

    // -------------------------------------------------------------------------
    // Feature catalogue. Only ids, categories and completion live here: the
    // name, the description and the done list are Roadmap.features.<id>.*.
    // A system that plays as intended and only wants more content sits at
    // 80 to 90; lower numbers mark systems still missing real pieces.
    // -------------------------------------------------------------------------
    const CATEGORIES = ['core', 'combat', 'npcs', 'economy', 'vehicles', 'hypernet',
        'galaxy', 'health', 'crafting', 'cards', 'world', 'multiplayer'];

    const FEATURE_LIST = [
        { id: 'worldPersistence', category: 'core', percent: 88 },
        { id: 'timeSleepClock', category: 'core', percent: 85 },
        { id: 'hungerNutrition', category: 'core', percent: 85 },
        { id: 'inputControls', category: 'core', percent: 88 },
        { id: 'audioMusic', category: 'core', percent: 85 },
        { id: 'modManager', category: 'core', percent: 70 },

        { id: 'battleEngine', category: 'combat', percent: 88 },
        { id: 'battlers3D', category: 'combat', percent: 86 },
        { id: 'skillsLoadouts', category: 'combat', percent: 82 },
        { id: 'arenaBattles', category: 'combat', percent: 80 },
        { id: 'summonsSpirits', category: 'combat', percent: 74 },
        { id: 'mapBattles', category: 'combat', percent: 72 },
        { id: 'bulletHell', category: 'combat', percent: 70 },

        { id: 'npcLife', category: 'npcs', percent: 78 },
        { id: 'dialogueBusts', category: 'npcs', percent: 80 },
        { id: 'creatureSystem', category: 'npcs', percent: 80 },
        { id: 'factionsReputation', category: 'npcs', percent: 74 },
        { id: 'onuAssembly', category: 'npcs', percent: 70 },

        { id: 'bankingSystem', category: 'economy', percent: 85 },
        { id: 'shopManagement', category: 'economy', percent: 76 },
        { id: 'realEstateRentals', category: 'economy', percent: 75 },
        { id: 'stockMarket', category: 'economy', percent: 80 },
        { id: 'crimeBounties', category: 'economy', percent: 80 },

        { id: 'vehiclesGarage', category: 'vehicles', percent: 80 },
        { id: 'fastTravel', category: 'vehicles', percent: 80 },
        { id: 'voxelWorld', category: 'vehicles', percent: 68 },
        { id: 'roadTraffic', category: 'vehicles', percent: 70 },

        { id: 'hypernetOS', category: 'hypernet', percent: 85 },
        { id: 'hyperDeck', category: 'hypernet', percent: 82 },
        { id: 'hypernetApps', category: 'hypernet', percent: 74 },
        { id: 'hypernetBrowser', category: 'hypernet', percent: 65 },

        { id: 'galaxyCosmos', category: 'galaxy', percent: 75 },
        { id: 'galaxyPhysics', category: 'galaxy', percent: 65 },
        { id: 'galaxyShips', category: 'galaxy', percent: 68 },

        { id: 'limbDamage', category: 'health', percent: 85 },
        { id: 'medicineSystem', category: 'health', percent: 85 },
        { id: 'cybernetics', category: 'health', percent: 80 },
        { id: 'biologicSim', category: 'health', percent: 75 },

        { id: 'cookingSystem', category: 'crafting', percent: 80 },
        { id: 'forgottenGrimoires', category: 'crafting', percent: 80 },
        { id: 'alchemistry', category: 'crafting', percent: 78 },
        { id: 'proceduralArtifacts', category: 'crafting', percent: 76 },
        { id: 'furnitureBuilding', category: 'crafting', percent: 72 },
        { id: 'farmingAgriculture', category: 'crafting', percent: 72 },
        { id: 'livestockBrewing', category: 'crafting', percent: 72 },

        { id: 'arcadeCabinets', category: 'cards', percent: 84 },
        { id: 'cardGame', category: 'cards', percent: 84 },
        { id: 'sports3D', category: 'cards', percent: 80 },
        { id: 'gamblingCasino', category: 'cards', percent: 82 },
        { id: 'interactivePastimes', category: 'cards', percent: 78 },

        { id: 'monsterBestiary', category: 'world', percent: 85 },
        { id: 'historySimulator', category: 'world', percent: 80 },
        { id: 'proceduralBiomes', category: 'world', percent: 74 },
        { id: 'proceduralStructures', category: 'world', percent: 70 },
        { id: 'proceduralQuests', category: 'world', percent: 70 },
        { id: 'dungeonFloors', category: 'world', percent: 65 },

        { id: 'splitScreenLocal', category: 'multiplayer', percent: 65 },
        { id: 'multiplayerOnline', category: 'multiplayer', percent: 40 }
    ];

    const featureName = (f) => T('Roadmap.features.' + f.id + '.name', f.id);
    const featureDesc = (f) => T('Roadmap.features.' + f.id + '.desc', '');
    const featureDone = (f) => TList('Roadmap.features.' + f.id + '.done');
    const categoryName = (key) => T('Roadmap.categories.' + key, key);

    // -------------------------------------------------------------------------
    // Dynamic data readers
    // -------------------------------------------------------------------------
    let cachedMapInfos = null;
    let cachedDestinations = null;
    let cachedCountries = null;

    const readJson = (parts) => {
        if (typeof require !== 'function') return null;
        try {
            const fsMod = require('fs');
            const pathMod = require('path');
            const p = pathMod.join.apply(pathMod, [process.cwd()].concat(parts));
            if (fsMod.existsSync(p)) return JSON.parse(fsMod.readFileSync(p, 'utf8'));
        } catch (e) {
            // Ignore filesystem read failure
        }
        return null;
    };

    const TOWER_PLANNED = 360;
    const DESTINATIONS_PER_COUNTRY = 4;

    const readOmegaTowerStats = () => {
        let mapInfos = cachedMapInfos || (typeof window !== 'undefined' ? window.$dataMapInfos : null);
        if (!mapInfos) {
            mapInfos = readJson(['data', 'MapInfos.json']);
            if (mapInfos) cachedMapInfos = mapInfos;
        }

        let count = 0;
        let foundFolder = false;

        if (Array.isArray(mapInfos)) {
            let folder = mapInfos.find(m => m && /tower levels/i.test(m.name));
            if (!folder && mapInfos[166]) folder = mapInfos[166];

            if (folder) {
                foundFolder = true;
                count = mapInfos.filter(m => m && m.parentId === folder.id && /^L\d+/i.test(m.name)).length;
            }
        }

        if (!foundFolder && count === 0) count = 26;

        return {
            completed: count,
            total: TOWER_PLANNED,
            percentage: Math.round((count / TOWER_PLANNED) * 1000) / 10
        };
    };

    // A European country is a whole nation: the Omega Tower's own enclave and
    // the island sub-regions ("Italy - Sicily") are not countries of their own.
    const countEuropeanCountries = () => {
        let list = cachedCountries;
        if (!list && typeof window !== 'undefined' && window.WorldGen && Array.isArray(window.WorldGen.Countries)) {
            list = window.WorldGen.Countries;
        }
        if (!list) {
            list = readJson(['js', 'db', 'WorldGen', 'Countries.json']);
            if (list) cachedCountries = list;
        }
        if (!Array.isArray(list)) return 0;
        return list.filter(c => c && c.region === 'Europe' && c.id !== 255 &&
            typeof c.country === 'string' && c.country.indexOf(' - ') < 0).length;
    };

    // Done: authored (non-procedural) destinations that are open to the player.
    // Planned: four for every European country.
    const readDestinationStats = () => {
        let dests = cachedDestinations;
        if (!dests && typeof window !== 'undefined' && window.WorkSystem && window.WorkSystem.Destinations) {
            dests = window.WorkSystem.Destinations;
        }
        if (!dests) {
            dests = readJson(['js', 'db', 'WorkSystem', 'Destinations.json']);
            if (dests) cachedDestinations = dests;
        }

        const authored = (dests && typeof dests === 'object')
            ? Object.values(dests).filter(d => d && d.procedural !== true)
            : [];
        const unlocked = authored.filter(d => d.locked !== true).length;

        const countries = countEuropeanCountries();
        const total = Math.max(unlocked, countries * DESTINATIONS_PER_COUNTRY) || 1;

        return {
            completed: unlocked,
            total: total,
            countries: countries,
            percentage: Math.round((unlocked / total) * 1000) / 10
        };
    };

    // -------------------------------------------------------------------------
    // Styles: a minimal plate. Backgrounds come from the shared title plate
    // tokens, so the roadmap is as transparent as the rest of the title.
    // -------------------------------------------------------------------------
    const injectStyles = () => {
        if (document.getElementById('roadmap-system-style')) return;
        const style = document.createElement('style');
        style.id = 'roadmap-system-style';
        style.textContent = `
            .title-roadmap-panel {
                z-index: 300;
                font-family: var(--font-ui, 'Bitter', Georgia, serif);
                font-weight: normal;
                letter-spacing: normal;
                line-height: 1.4;
                color: var(--title-parchment, #e0d5be);
                background: var(--title-plate-bg, rgba(0, 0, 0, 0.55));
                border: 1px solid rgba(255, 215, 0, 0.45);
                pointer-events: auto;
                width: var(--title-w, 320px);
                padding: calc(10px * var(--title-scale, 1)) calc(12px * var(--title-scale, 1));
                font-size: calc(11px * var(--title-scale, 1));
                display: flex;
                flex-direction: column;
                gap: 0.6em;
                box-sizing: border-box;
            }
            .title-roadmap-close {
                position: absolute;
                top: 0.3em;
                right: 0.45em;
                cursor: pointer;
                font-size: 1.1em;
                line-height: 1;
                color: rgba(255, 215, 0, 0.7);
                user-select: none;
            }
            .title-roadmap-close:hover { color: #ffffff; }
            .title-roadmap-head {
                font-size: 0.95em;
                font-weight: bold;
                letter-spacing: 1px;
                color: var(--title-gold, #ffd700);
                padding-right: 1.5em;
                text-transform: uppercase;
            }

            .roadmap-stats {
                display: flex;
                flex-direction: column;
                gap: 0.45em;
            }
            .roadmap-stat {
                display: flex;
                flex-direction: column;
                gap: 0.2em;
            }
            .roadmap-stat-head {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                font-size: 0.85em;
                opacity: 0.85;
            }
            .roadmap-stat-value {
                font-family: var(--font-mono, monospace);
                color: var(--title-gold, #ffd700);
            }

            .roadmap-track {
                width: 100%;
                height: 2px;
                background: rgba(255, 255, 255, 0.12);
                overflow: hidden;
            }
            .roadmap-fill {
                height: 100%;
                background: var(--title-gold, #ffd700);
            }

            .title-roadmap-features {
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                max-height: var(--title-maxh, 96px);
                padding-right: 4px;
            }
            .title-roadmap-features::-webkit-scrollbar { width: 3px; }
            .title-roadmap-features::-webkit-scrollbar-thumb { background: rgba(255, 215, 0, 0.35); }

            .roadmap-row {
                display: flex;
                flex-direction: column;
                gap: 0.2em;
                padding: 0.2em 0.25em;
                cursor: pointer;
            }
            .roadmap-row:hover,
            .roadmap-row.selected { background: rgba(255, 215, 0, 0.08); }
            .roadmap-row-head {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 0.6em;
                font-size: 0.85em;
            }
            .roadmap-row-name {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .roadmap-row-pct {
                font-family: var(--font-mono, monospace);
                color: var(--title-gold, #ffd700);
            }

            .title-roadmap-btn {
                font-size: 0.85em;
                letter-spacing: 1px;
                color: var(--title-gold, #ffd700);
                border: 1px solid rgba(255, 215, 0, 0.45);
                padding: 0.35em 1em;
                cursor: pointer;
                user-select: none;
                text-align: center;
            }
            .title-roadmap-btn:hover {
                background: rgba(255, 215, 0, 0.12);
                color: #ffffff;
            }

            .roadmap-hover-modal {
                position: fixed;
                z-index: 10001;
                width: 320px;
                padding: 10px 12px;
                box-sizing: border-box;
                pointer-events: none;
                display: none;
                font-family: var(--font-ui, 'Bitter', Georgia, serif);
                font-size: 12px;
                line-height: 1.4;
                color: var(--title-parchment, #e0d5be);
                background: var(--title-plate-bg, rgba(0, 0, 0, 0.55));
                border: 1px solid rgba(255, 215, 0, 0.45);
            }
            .roadmap-hover-modal.visible { display: block; }

            .roadmap-info-title {
                font-size: 1.15em;
                font-weight: bold;
                color: var(--title-gold, #ffd700);
            }
            .roadmap-info-meta {
                display: flex;
                justify-content: space-between;
                font-size: 0.85em;
                opacity: 0.75;
                margin: 0.15em 0 0.4em;
            }
            .roadmap-info-desc {
                margin: 0.6em 0;
                opacity: 0.9;
            }
            .roadmap-info-section {
                font-size: 0.8em;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--title-gold, #ffd700);
                margin: 0.8em 0 0.3em;
            }
            .roadmap-info-list {
                margin: 0;
                padding: 0;
                list-style: none;
            }
            .roadmap-info-list li {
                position: relative;
                padding-left: 0.9em;
                margin-bottom: 0.25em;
            }
            .roadmap-info-list li::before {
                content: '-';
                position: absolute;
                left: 0;
                color: var(--title-gold, #ffd700);
            }

            .fullscreen-roadmap-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 10000;
                background:
                    radial-gradient(ellipse at 50% 0%, rgba(255, 215, 0, 0.06), transparent 60%),
                    #0b0a08;
                display: flex;
                box-sizing: border-box;
                color: var(--title-parchment, #e0d5be);
                font-family: var(--font-ui, 'Bitter', Georgia, serif);
            }
            .fullscreen-roadmap-window {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                gap: 14px;
                padding: 18px 28px 22px;
                box-sizing: border-box;
            }
            .fullscreen-roadmap-header.page-header-bar {
                margin-bottom: 0;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(255, 215, 0, 0.2);
            }
            .fullscreen-roadmap-title {
                font-size: 18px;
                font-weight: bold;
                letter-spacing: 1px;
                color: var(--title-gold, #ffd700);
                text-transform: uppercase;
            }

            .fullscreen-roadmap-stats {
                display: flex;
                gap: 28px;
                font-size: 13px;
            }
            .fullscreen-roadmap-stats .roadmap-stat { width: 260px; }

            .fullscreen-roadmap-controls {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 6px 14px;
            }
            .roadmap-cat-tab {
                font-size: 13px;
                cursor: pointer;
                opacity: 0.6;
                padding-bottom: 2px;
                border-bottom: 1px solid transparent;
                user-select: none;
            }
            .roadmap-cat-tab:hover { opacity: 1; }
            .roadmap-cat-tab.active {
                opacity: 1;
                color: var(--title-gold, #ffd700);
                border-bottom-color: var(--title-gold, #ffd700);
            }
            .roadmap-search-input {
                margin-left: auto;
                width: 200px;
                font-family: inherit;
                font-size: 13px;
                color: inherit;
                background: transparent;
                border: none;
                border-bottom: 1px solid rgba(255, 215, 0, 0.35);
                padding: 3px 2px;
                outline: none;
            }
            .roadmap-search-input:focus { border-bottom-color: var(--title-gold, #ffd700); }

            .fullscreen-roadmap-body {
                flex: 1;
                min-height: 0;
                display: flex;
                gap: 22px;
            }
            .fullscreen-roadmap-left {
                flex: 1;
                min-width: 0;
                overflow-y: auto;
                padding-right: 6px;
            }
            .fullscreen-roadmap-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 2px 18px;
                font-size: 14px;
            }
            .fullscreen-roadmap-details-col {
                width: 360px;
                flex-shrink: 0;
                overflow-y: auto;
                padding-left: 22px;
                border-left: 1px solid rgba(255, 215, 0, 0.2);
                font-size: 14px;
                line-height: 1.45;
            }
            .fullscreen-roadmap-left::-webkit-scrollbar,
            .fullscreen-roadmap-details-col::-webkit-scrollbar { width: 3px; }
            .fullscreen-roadmap-left::-webkit-scrollbar-thumb,
            .fullscreen-roadmap-details-col::-webkit-scrollbar-thumb { background: rgba(255, 215, 0, 0.35); }
            .roadmap-details-empty { opacity: 0.6; }
        `;
        document.head.appendChild(style);
    };

    // -------------------------------------------------------------------------
    // DOM builders
    // -------------------------------------------------------------------------
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    const makeTrack = (pct) => {
        const track = el('div', 'roadmap-track');
        const fill = el('div', 'roadmap-fill');
        fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        track.appendChild(fill);
        return track;
    };

    const makeStat = (label, value, pct) => {
        const item = el('div', 'roadmap-stat');
        const head = el('div', 'roadmap-stat-head');
        head.appendChild(el('span', '', label));
        head.appendChild(el('span', 'roadmap-stat-value', value));
        item.appendChild(head);
        item.appendChild(makeTrack(pct));
        return item;
    };

    const makeStats = () => {
        const tower = readOmegaTowerStats();
        const dest = readDestinationStats();
        const box = el('div', 'roadmap-stats');
        box.appendChild(makeStat(T('Roadmap.omegaTower'),
            tower.completed + ' / ' + tower.total, tower.percentage));
        box.appendChild(makeStat(T('Roadmap.destinations'),
            dest.completed + ' / ' + dest.total, dest.percentage));
        return box;
    };

    const makeRow = (f) => {
        const row = el('div', 'roadmap-row');
        const head = el('div', 'roadmap-row-head');
        head.appendChild(el('span', 'roadmap-row-name', featureName(f)));
        head.appendChild(el('span', 'roadmap-row-pct', f.percent + '%'));
        row.appendChild(head);
        row.appendChild(makeTrack(f.percent));
        return row;
    };

    // Name, category, completion, description and everything already done.
    const fillFeatureInfo = (container, f) => {
        while (container.firstChild) container.removeChild(container.firstChild);
        container.innerHTML = '';
        container.appendChild(el('div', 'roadmap-info-title', featureName(f)));
        const meta = el('div', 'roadmap-info-meta');
        meta.appendChild(el('span', '', categoryName(f.category)));
        meta.appendChild(el('span', 'roadmap-row-pct', f.percent + '%'));
        container.appendChild(meta);
        container.appendChild(makeTrack(f.percent));
        const desc = featureDesc(f);
        if (desc) container.appendChild(el('div', 'roadmap-info-desc', desc));
        container.appendChild(el('div', 'roadmap-info-section', T('Roadmap.doneHeader')));
        const list = el('ul', 'roadmap-info-list');
        for (const item of featureDone(f)) list.appendChild(el('li', '', item));
        container.appendChild(list);
    };

    // -------------------------------------------------------------------------
    // Hover modal (title screen rows)
    // -------------------------------------------------------------------------
    let hoverModalElem = null;

    const getHoverModal = () => {
        if (!hoverModalElem) {
            hoverModalElem = el('div', 'roadmap-hover-modal');
            hoverModalElem.id = 'roadmap-hover-modal';
            document.body.appendChild(hoverModalElem);
        }
        return hoverModalElem;
    };

    const showHoverModal = (f, clientX, clientY) => {
        const modal = getHoverModal();
        if (modal._feature !== f) {
            fillFeatureInfo(modal, f);
            modal._feature = f;
        }

        const width = 320;
        let left = clientX + 16;
        let top = clientY - 30;
        if (left + width > window.innerWidth - 16) left = clientX - width - 16;
        if (left < 16) left = 16;
        const estHeight = modal.offsetHeight || 260;
        if (top + estHeight > window.innerHeight - 16) top = window.innerHeight - estHeight - 16;
        if (top < 16) top = 16;

        modal.style.left = left + 'px';
        modal.style.top = top + 'px';
        modal.classList.add('visible');
    };

    const hideHoverModal = () => {
        if (hoverModalElem) hoverModalElem.classList.remove('visible');
    };

    // -------------------------------------------------------------------------
    // Fullscreen roadmap window
    // -------------------------------------------------------------------------
    let activeFullscreen = null;

    const playSe = (kind) => {
        if (typeof SoundManager !== 'undefined' && SoundManager[kind]) SoundManager[kind]();
    };

    const openFullscreenRoadmap = () => {
        if (activeFullscreen) return;
        injectStyles();

        const overlay = el('div', 'fullscreen-roadmap-overlay');
        overlay.id = 'fullscreen-roadmap';
        const win = el('div', 'fullscreen-roadmap-window');

        // The shared header bar: the one .back-button pinned left, title centred.
        const header = el('div', 'page-header-bar fullscreen-roadmap-header');
        const closeBtn = el('button', 'back-button fullscreen-roadmap-close-btn', T('Roadmap.close'));
        closeBtn.type = 'button';
        header.appendChild(closeBtn);
        header.appendChild(el('h2', 'title fullscreen-roadmap-title', T('Roadmap.fullscreenTitle')));

        const closeWindow = () => {
            hideHoverModal();
            playSe('playCancel');
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            window.removeEventListener('keydown', onKeyDown);
            activeFullscreen = null;
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeWindow();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeWindow();
        });

        const stats = makeStats();
        stats.className = 'fullscreen-roadmap-stats';

        const controls = el('div', 'fullscreen-roadmap-controls');
        const tabsRow = el('div', 'roadmap-categories-tabs');
        tabsRow.style.display = 'contents';

        let selectedCategory = 'all';
        let searchQuery = '';
        let selectedFeature = FEATURE_LIST[0] || null;

        const searchInput = el('input', 'roadmap-search-input');
        searchInput.type = 'text';
        searchInput.placeholder = T('Roadmap.searchPlaceholder');

        const body = el('div', 'fullscreen-roadmap-body');
        const leftCol = el('div', 'fullscreen-roadmap-left');
        const grid = el('div', 'fullscreen-roadmap-grid');
        leftCol.appendChild(grid);
        const detailsCol = el('div', 'fullscreen-roadmap-details-col');

        const renderDetailsCol = (f) => {
            if (!f) {
                while (detailsCol.firstChild) detailsCol.removeChild(detailsCol.firstChild);
                detailsCol.appendChild(el('div', 'roadmap-details-empty', T('Roadmap.selectFeature')));
                return;
            }
            fillFeatureInfo(detailsCol, f);
        };

        const renderGrid = () => {
            while (grid.firstChild) grid.removeChild(grid.firstChild);

            const q = searchQuery.toLowerCase().trim();
            const filtered = FEATURE_LIST.filter(f => {
                if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
                if (!q) return true;
                return featureName(f).toLowerCase().includes(q) ||
                    featureDesc(f).toLowerCase().includes(q) ||
                    featureDone(f).some(s => s.toLowerCase().includes(q));
            });

            if (!filtered.includes(selectedFeature)) selectedFeature = filtered[0] || null;
            renderDetailsCol(selectedFeature);

            for (const f of filtered) {
                const row = makeRow(f);
                if (f === selectedFeature) row.classList.add('selected');
                row.addEventListener('mouseenter', () => renderDetailsCol(f));
                row.addEventListener('mouseleave', () => renderDetailsCol(selectedFeature));
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedFeature = f;
                    grid.querySelectorAll('.roadmap-row').forEach(c => c.classList.remove('selected'));
                    row.classList.add('selected');
                    renderDetailsCol(f);
                    playSe('playCursor');
                });
                grid.appendChild(row);
            }
        };

        const tabKeys = ['all'].concat(CATEGORIES);
        for (const key of tabKeys) {
            const label = key === 'all' ? T('Roadmap.allCategories') : categoryName(key);
            const tab = el('div', 'roadmap-cat-tab' + (key === selectedCategory ? ' active' : ''), label);
            tab.addEventListener('click', () => {
                playSe('playCursor');
                selectedCategory = key;
                tabsRow.querySelectorAll('.roadmap-cat-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderGrid();
            });
            tabsRow.appendChild(tab);
        }

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderGrid();
        });

        controls.appendChild(tabsRow);
        controls.appendChild(searchInput);
        body.appendChild(leftCol);
        body.appendChild(detailsCol);

        win.appendChild(header);
        win.appendChild(stats);
        win.appendChild(controls);
        win.appendChild(body);
        overlay.appendChild(win);
        document.body.appendChild(overlay);
        activeFullscreen = overlay;

        renderGrid();
    };

    // -------------------------------------------------------------------------
    // Scene_Title roadmap box (replaces the news panel)
    // -------------------------------------------------------------------------
    if (typeof Scene_Title !== 'undefined') {
        Scene_Title.prototype.createDisclaimerBox = function () {
            injectStyles();

            for (const id of ['title-disclaimer', 'title-roadmap-box']) {
                const stale = document.getElementById(id);
                if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
            }

            const box = el('div', 'title-plate title-roadmap-panel');
            box.id = 'title-roadmap-box';
            document.body.appendChild(box);
            this._disclaimerBox = box;
            this._roadmapBox = box;

            const close = el('div', 'title-roadmap-close', '✕');
            close.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                hideHoverModal();
                playSe('playCancel');
                this.removeDisclaimerBox();
            });

            const header = el('div', 'title-roadmap-head', T('Roadmap.title'));
            const stats = makeStats();

            const featuresList = el('div', 'title-roadmap-features');
            this._roadmapFeaturesBody = featuresList;
            featuresList.addEventListener('wheel', (e) => {
                const step = e.deltaMode === 1 ? e.deltaY * 30
                    : (e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY);
                featuresList.scrollTop += step;
                e.preventDefault();
                e.stopPropagation();
            });

            for (const f of FEATURE_LIST) {
                const row = makeRow(f);
                row.addEventListener('mouseenter', (e) => showHoverModal(f, e.clientX, e.clientY));
                row.addEventListener('mousemove', (e) => showHoverModal(f, e.clientX, e.clientY));
                row.addEventListener('mouseleave', () => hideHoverModal());
                featuresList.appendChild(row);
            }

            const detailsBtn = el('div', 'title-roadmap-btn', T('Roadmap.details'));
            detailsBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            detailsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                hideHoverModal();
                playSe('playOk');
                openFullscreenRoadmap();
            });

            box.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });

            box.appendChild(close);
            box.appendChild(header);
            box.appendChild(stats);
            box.appendChild(featuresList);
            box.appendChild(detailsBtn);

            this.layoutDisclaimerBox();
        };

        Scene_Title.prototype.layoutDisclaimerBox = function () {
            const box = this._disclaimerBox || this._roadmapBox;
            if (!box) return;

            const kit = window.TitleScreenKit;
            if (!kit || !kit.layout) return;

            const rect = kit.layout.rect();
            const s = kit.layout.scale(rect);
            const btn = this._bgSwitchButton;
            const btnRect = btn ? btn.getBoundingClientRect() : null;
            const below = btnRect && btnRect.height > 0
                ? (btnRect.bottom - rect.top) / s
                : 18 + 34;

            kit.layout.place(box, { right: 18, top: Math.round(below + 10) });
            box.style.setProperty('--title-w', Math.round(Math.min(340 * s, rect.width * 0.32)) + 'px');
            box.style.setProperty('--title-scale', s.toFixed(3));

            const body = this._roadmapFeaturesBody;
            if (body) {
                body.style.setProperty('--title-maxh', kit.layout.px(96, s));
                const boxRect = box.getBoundingClientRect();
                const bodyRect = body.getBoundingClientRect();
                const canvasBottom = rect.top + rect.height;
                const spill = boxRect.bottom - (canvasBottom - 18 * s);
                if (spill > 0 && bodyRect.height > 0) {
                    body.style.setProperty('--title-maxh',
                        Math.round(Math.max(60 * s, bodyRect.height - spill)) + 'px');
                }
            }
        };

        Scene_Title.prototype.removeDisclaimerBox = function () {
            hideHoverModal();
            const box = this._disclaimerBox || this._roadmapBox;
            if (box && box.parentNode) box.parentNode.removeChild(box);
            this._disclaimerBox = null;
            this._roadmapBox = null;
            this._roadmapFeaturesBody = null;
        };
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    window.RoadmapSystem = {
        openFullscreen: openFullscreenRoadmap,
        getTowerStats: readOmegaTowerStats,
        getDestinationStats: readDestinationStats,
        getFeatures: () => FEATURE_LIST.map(f => ({
            id: f.id,
            category: f.category,
            percent: f.percent,
            name: featureName(f),
            desc: featureDesc(f),
            done: featureDone(f)
        })),
        showHoverModal: showHoverModal,
        hideHoverModal: hideHoverModal
    };

})();
