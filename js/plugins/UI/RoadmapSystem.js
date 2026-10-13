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
    // The number is how much of the system's possible depth exists, not
    // whether it plays: a working system that could still be greatly
    // expanded sits low. The scale is a four year development: content that is
    // complete and not going to change (the monster roster, skills, equipment)
    // sits near the top, systems that are almost done sit at 80 to 90 by how
    // deep the plugin behind them is, and the society simulation, the most
    // open-ended of all, scores lowest. Each category also carries a few very
    // long term goals, Roadmap.goals.<category>.
    // -------------------------------------------------------------------------
    const CATEGORIES = ['core', 'combat', 'npcs', 'economy', 'vehicles', 'hypernet',
        'galaxy', 'health', 'crafting', 'cards', 'world', 'multiplayer'];

    const FEATURE_LIST = [
        { id: 'worldPersistence', category: 'core', percent: 70 },
        { id: 'timeSleepClock', category: 'core', percent: 80 },
        { id: 'hungerNutrition', category: 'core', percent: 80 },
        { id: 'inputControls', category: 'core', percent: 85 },
        { id: 'audioMusic', category: 'core', percent: 75 },
        { id: 'modManager', category: 'core', percent: 60 },
        { id: 'characterCreation', category: 'core', percent: 85 },
        { id: 'interface', category: 'core', percent: 80 },
        { id: 'visuals', category: 'core', percent: 55 },
        { id: 'sandbox', category: 'core', percent: 65 },

        { id: 'battleEngine', category: 'combat', percent: 80 },
        { id: 'battlers3D', category: 'combat', percent: 90 },
        { id: 'skillsLoadouts', category: 'combat', percent: 90 },
        { id: 'arenaBattles', category: 'combat', percent: 80 },
        { id: 'summonsSpirits', category: 'combat', percent: 60 },
        { id: 'mapBattles', category: 'combat', percent: 45 },
        { id: 'bulletHell', category: 'combat', percent: 60 },
        { id: 'equipment', category: 'combat', percent: 88 },
        { id: 'weapons', category: 'combat', percent: 85 },

        { id: 'npcLife', category: 'npcs', percent: 30 },
        { id: 'dialogueBusts', category: 'npcs', percent: 45 },
        { id: 'creatureSystem', category: 'npcs', percent: 40 },
        { id: 'factionsReputation', category: 'npcs', percent: 30 },
        { id: 'onuAssembly', category: 'npcs', percent: 30 },

        { id: 'bankingSystem', category: 'economy', percent: 80 },
        { id: 'shopManagement', category: 'economy', percent: 55 },
        { id: 'realEstateRentals', category: 'economy', percent: 45 },
        { id: 'stockMarket', category: 'economy', percent: 70 },
        { id: 'crimeBounties', category: 'economy', percent: 55 },

        { id: 'vehiclesGarage', category: 'vehicles', percent: 70 },
        { id: 'fastTravel', category: 'vehicles', percent: 80 },
        { id: 'voxelWorld', category: 'vehicles', percent: 40 },
        { id: 'roadTraffic', category: 'vehicles', percent: 50 },

        { id: 'hypernetOS', category: 'hypernet', percent: 75 },
        { id: 'hyperDeck', category: 'hypernet', percent: 80 },
        { id: 'hypernetApps', category: 'hypernet', percent: 55 },
        { id: 'hypernetBrowser', category: 'hypernet', percent: 30 },
        { id: 'hexphone', category: 'hypernet', percent: 65 },

        { id: 'galaxyCosmos', category: 'galaxy', percent: 75 },
        { id: 'galaxyPhysics', category: 'galaxy', percent: 50 },
        { id: 'galaxyShips', category: 'galaxy', percent: 70 },
        { id: 'spaceTrade', category: 'galaxy', percent: 45 },
        { id: 'rocketLaunch', category: 'galaxy', percent: 75 },

        { id: 'limbDamage', category: 'health', percent: 80 },
        { id: 'medicineSystem', category: 'health', percent: 80 },
        { id: 'cybernetics', category: 'health', percent: 70 },
        { id: 'biologicSim', category: 'health', percent: 55 },

        { id: 'cookingSystem', category: 'crafting', percent: 75 },
        { id: 'forgottenGrimoires', category: 'crafting', percent: 85 },
        { id: 'alchemistry', category: 'crafting', percent: 75 },
        { id: 'proceduralArtifacts', category: 'crafting', percent: 90 },
        { id: 'furnitureBuilding', category: 'crafting', percent: 60 },
        { id: 'farmingAgriculture', category: 'crafting', percent: 60 },
        { id: 'livestockBrewing', category: 'crafting', percent: 70 },
        { id: 'research', category: 'crafting', percent: 50 },

        { id: 'arcadeCabinets', category: 'cards', percent: 80 },
        { id: 'cardGame', category: 'cards', percent: 80 },
        { id: 'sports3D', category: 'cards', percent: 80 },
        { id: 'gamblingCasino', category: 'cards', percent: 85 },
        { id: 'interactivePastimes', category: 'cards', percent: 75 },

        { id: 'monsterBestiary', category: 'world', percent: 95 },
        { id: 'historySimulator', category: 'world', percent: 65 },
        { id: 'proceduralBiomes', category: 'world', percent: 50 },
        { id: 'proceduralStructures', category: 'world', percent: 45 },
        { id: 'proceduralQuests', category: 'world', percent: 35 },
        { id: 'dungeonFloors', category: 'world', percent: 55 },
        { id: 'exploration', category: 'world', percent: 60 },

        { id: 'splitScreenLocal', category: 'multiplayer', percent: 55 },
        { id: 'multiplayerOnline', category: 'multiplayer', percent: 25 }
    ];

    const featureName = (f) => T('Roadmap.features.' + f.id + '.name', f.id);
    const featureDesc = (f) => T('Roadmap.features.' + f.id + '.desc', '');
    const featureDone = (f) => TList('Roadmap.features.' + f.id + '.done');
    const categoryName = (key) => T('Roadmap.categories.' + key, key);
    const categoryGoals = (key) => TList('Roadmap.goals.' + key);

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
    // The Bevy ECS rework is a separate build, so its progress is set by hand.
    const BEVY_REWORK_PERCENT = 30;
    // Story mode is written content with no data to count, so it is set by hand too.
    const STORY_MODE_PERCENT = 5;
    // The handwritten rewrite of the generated text banks, set by hand.
    const TEXT_REWRITE_PERCENT = 10;
    // Local GGUF text models driving the simulation, set by hand.
    const GGUF_MODELS_PERCENT = 50;
    // ASCII render mode, set by hand.
    const ASCII_MODE_PERCENT = 10;
    // Balancing, the skyscraper and shop interiors and the patron content,
    // all set by hand.
    const BALANCING_PERCENT = 30;
    const SKYSCRAPER_INTERIORS_PERCENT = 20;
    const SHOP_INTERIORS_PERCENT = 40;
    const PATRON_CONTENT_PERCENT = 40;

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
            /* The title-screen button: the shared plate and the language
               selector's own face and size (css/theme.css). */
            .title-plate.title-roadmap-open-btn {
                font-size: calc(11px * var(--title-scale, 1));
                padding: calc(5px * var(--title-scale, 1)) calc(10px * var(--title-scale, 1));
                white-space: nowrap;
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
            .roadmap-stat-note {
                font-size: 0.75em;
                opacity: 0.7;
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
                background: #000;
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
                font-size: 26px;
                font-weight: bold;
                letter-spacing: 1px;
                color: var(--title-gold, #ffd700);
                text-transform: uppercase;
            }

            /* The headline stats wrap onto as many rows as they need, laid on
               the same column grid as the feature list, so a label never
               breaks away from its value. */
            .fullscreen-roadmap-stats {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
                gap: 10px 22px;
                align-items: start;
                font-size: 18px;
            }
            .fullscreen-roadmap-stats .roadmap-stat-head { gap: 0.6em; }
            .fullscreen-roadmap-stats .roadmap-stat-head > span:first-child {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .fullscreen-roadmap-stats .roadmap-stat-value { white-space: nowrap; }

            .fullscreen-roadmap-controls {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 6px 14px;
            }
            .roadmap-cat-tab {
                font-size: 18px;
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
                width: 260px;
                font-family: inherit;
                font-size: 18px;
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
                grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
                gap: 6px 22px;
                font-size: 19px;
            }
            .fullscreen-roadmap-details-col {
                width: 480px;
                flex-shrink: 0;
                overflow-y: auto;
                padding-left: 22px;
                border-left: 1px solid rgba(255, 215, 0, 0.2);
                font-size: 19px;
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

    const makeStat = (label, value, pct, note) => {
        const item = el('div', 'roadmap-stat');
        const head = el('div', 'roadmap-stat-head');
        head.appendChild(el('span', '', label));
        head.appendChild(el('span', 'roadmap-stat-value', value));
        item.appendChild(head);
        item.appendChild(makeTrack(pct));
        if (note) item.appendChild(el('div', 'roadmap-stat-note', note));
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
        box.appendChild(makeStat(T('Roadmap.bevyRework'),
            BEVY_REWORK_PERCENT + '%', BEVY_REWORK_PERCENT, T('Roadmap.bevyReworkNote')));
        box.appendChild(makeStat(T('Roadmap.storyMode'),
            STORY_MODE_PERCENT + '%', STORY_MODE_PERCENT));
        box.appendChild(makeStat(T('Roadmap.textRewrite'),
            TEXT_REWRITE_PERCENT + '%', TEXT_REWRITE_PERCENT, T('Roadmap.textRewriteNote')));
        box.appendChild(makeStat(T('Roadmap.ggufModels'),
            GGUF_MODELS_PERCENT + '%', GGUF_MODELS_PERCENT, T('Roadmap.ggufModelsNote')));
        box.appendChild(makeStat(T('Roadmap.asciiMode'),
            ASCII_MODE_PERCENT + '%', ASCII_MODE_PERCENT));
        box.appendChild(makeStat(T('Roadmap.balancing'),
            BALANCING_PERCENT + '%', BALANCING_PERCENT, T('Roadmap.balancingNote')));
        box.appendChild(makeStat(T('Roadmap.skyscraperInteriors'),
            SKYSCRAPER_INTERIORS_PERCENT + '%', SKYSCRAPER_INTERIORS_PERCENT, T('Roadmap.skyscraperInteriorsNote')));
        box.appendChild(makeStat(T('Roadmap.shopInteriors'),
            SHOP_INTERIORS_PERCENT + '%', SHOP_INTERIORS_PERCENT, T('Roadmap.shopInteriorsNote')));
        box.appendChild(makeStat(T('Roadmap.patronContent'),
            PATRON_CONTENT_PERCENT + '%', PATRON_CONTENT_PERCENT, T('Roadmap.patronContentNote')));
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
        const goals = categoryGoals(f.category);
        if (goals.length) {
            container.appendChild(el('div', 'roadmap-info-section',
                T('Roadmap.goalsHeader') + ': ' + categoryName(f.category)));
            const goalList = el('ul', 'roadmap-info-list');
            for (const item of goals) goalList.appendChild(el('li', '', item));
            container.appendChild(goalList);
        }
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
    // What the keyboard and the pad can do to the open window: built with it,
    // dropped with it, and driven once a frame by updateFullscreenInput.
    let fullscreenNav = null;

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

        // Escape, the pad's Cancel and the Details key itself close the window
        // through updateFullscreenInput, the same frame loop the title menu
        // reads, so no document listener is left behind to double the press.
        const closeWindow = () => {
            hideHoverModal();
            playSe('playCancel');
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            activeFullscreen = null;
            fullscreenNav = null;
        };
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
        // While the filter has the caret, every key it receives is text: none
        // of them reaches the engine's Input (so typing an X or a Z never
        // closes the window or moves the list). Enter and Escape hand the
        // keyboard back to the list.
        searchInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                if (searchInput.blur) searchInput.blur();
            }
        });

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

        let filteredList = [];

        const markSelectedRow = () => {
            for (const row of grid.children) {
                if (row._feature === selectedFeature) {
                    row.classList.add('selected');
                    if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
                } else {
                    row.classList.remove('selected');
                }
            }
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
            filteredList = filtered;
            renderDetailsCol(selectedFeature);

            for (const f of filtered) {
                const row = makeRow(f);
                row._feature = f;
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
        const tabs = [];
        const pickCategory = (index) => {
            const key = tabKeys[index];
            if (key === undefined) return;
            playSe('playCursor');
            selectedCategory = key;
            tabs.forEach(t => t.classList.remove('active'));
            tabs[index].classList.add('active');
            renderGrid();
        };
        tabKeys.forEach((key, index) => {
            const label = key === 'all' ? T('Roadmap.allCategories') : categoryName(key);
            const tab = el('div', 'roadmap-cat-tab' + (key === selectedCategory ? ' active' : ''), label);
            tab.addEventListener('click', () => pickCategory(index));
            tabs.push(tab);
            tabsRow.appendChild(tab);
        });

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

        fullscreenNav = {
            // Up / Down walk the list (clamped, no wrap), showing each one.
            move(delta) {
                if (!filteredList.length) return;
                const at = filteredList.indexOf(selectedFeature);
                const next = Math.max(0, Math.min(filteredList.length - 1, at < 0 ? 0 : at + delta));
                if (filteredList[next] === selectedFeature) return;
                selectedFeature = filteredList[next];
                markSelectedRow();
                renderDetailsCol(selectedFeature);
                playSe('playCursor');
            },
            // Left / Right and the shoulders turn the category tabs, wrapping.
            tab(delta) {
                const at = tabKeys.indexOf(selectedCategory);
                pickCategory((at + delta + tabKeys.length) % tabKeys.length);
            },
            searchFocused: () => typeof document !== 'undefined' && document.activeElement === searchInput,
            focusSearch() { if (searchInput.focus) searchInput.focus(); },
            blurSearch() { if (searchInput.blur) searchInput.blur(); },
            close: closeWindow,
            selected: () => selectedFeature,
            category: () => selectedCategory
        };
    };

    // -------------------------------------------------------------------------
    // Keyboard and pad
    // -------------------------------------------------------------------------
    // Tab on the keyboard and Back (Select) on the pad open the full window from
    // the title, and the same press closes it again. Back is read off the stick
    // plugin's own edge (AnalogStickInput), as character creation reads it.
    const PAD_BACK = 8;
    const detailsKeyTriggered = () => {
        if (typeof Input !== 'undefined' && Input.isTriggered && Input.isTriggered('tab')) return true;
        const stick = typeof window !== 'undefined' ? window.AnalogStickInput : null;
        return !!(stick && typeof stick.isButtonTriggered === 'function' && stick.isButtonTriggered(PAD_BACK));
    };

    // One frame of the open window. Returns true when it is (still) open.
    const updateFullscreenInput = () => {
        const nav = fullscreenNav;
        if (!nav || typeof Input === 'undefined') return false;
        if (nav.searchFocused()) {
            // The keyboard is the field's (see the search listener); the pad's
            // Confirm or Cancel hands control back to the list.
            if (Input.isTriggered('ok') || Input.isTriggered('cancel')) nav.blurSearch();
            return true;
        }
        if (Input.isTriggered('cancel') || detailsKeyTriggered()) {
            nav.close();
            return false;
        }
        if (Input.isRepeated('down')) nav.move(1);
        else if (Input.isRepeated('up')) nav.move(-1);
        else if (Input.isRepeated('right') || Input.isTriggered('pagedown')) nav.tab(1);
        else if (Input.isRepeated('left') || Input.isTriggered('pageup')) nav.tab(-1);
        else if (Input.isTriggered('ok')) nav.focusSearch();
        return true;
    };

    // Runs fn with the engine's Input reading nothing, so the title menu, the
    // background switcher and the Hyperverse controls under the window never
    // see a press the window has taken.
    const INPUT_READS = ['isPressed', 'isTriggered', 'isRepeated', 'isLongPressed'];
    const withInputMuted = (fn) => {
        if (typeof Input === 'undefined') return fn();
        const saved = INPUT_READS.map(n => Input[n]);
        INPUT_READS.forEach(n => { Input[n] = () => false; });
        try {
            return fn();
        } finally {
            INPUT_READS.forEach((n, i) => { Input[n] = saved[i]; });
        }
    };

    // -------------------------------------------------------------------------
    // Scene_Title roadmap button (replaces the news panel)
    // -------------------------------------------------------------------------
    // One plate under the language flags in the top-right column, lettered in
    // the same face as they are. A press opens the full roadmap window.
    if (typeof Scene_Title !== 'undefined') {
        Scene_Title.prototype.createDisclaimerBox = function () {
            injectStyles();

            for (const id of ['title-disclaimer', 'title-roadmap-box']) {
                const stale = document.getElementById(id);
                if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
            }

            const btn = el('div', 'title-plate title-plate-btn title-roadmap-open-btn', T('Roadmap.title'));
            btn.id = 'title-roadmap-box';
            document.body.appendChild(btn);
            this._disclaimerBox = btn;
            this._roadmapBox = btn;

            btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                hideHoverModal();
                playSe('playOk');
                openFullscreenRoadmap();
            });

            this.layoutDisclaimerBox();
        };

        // Hung off the measured bottom of the language flags (or of the
        // background switcher when the build ships a single language).
        Scene_Title.prototype.layoutDisclaimerBox = function () {
            const box = this._disclaimerBox || this._roadmapBox;
            if (!box) return;

            const kit = window.TitleScreenKit;
            if (!kit || !kit.layout) return;

            const rect = kit.layout.rect();
            const s = kit.layout.scale(rect);
            const above = this._languageBox || this._bgSwitchButton;
            const aboveRect = above ? above.getBoundingClientRect() : null;
            const below = aboveRect && aboveRect.height > 0
                ? (aboveRect.bottom - rect.top) / s + 8
                : 18 + 34;

            kit.layout.place(box, { right: 18, top: Math.round(below) });
            box.style.setProperty('--title-scale', s.toFixed(3));
        };

        // The full window is modal: while it is up (and on the frame that opens
        // or closes it) it reads the keyboard and the pad and the title under
        // it reads nothing. Tab or Back opens it whenever the roadmap panel is
        // on the title and nothing else modal is.
        const _Scene_Title_update = Scene_Title.prototype.update;
        Scene_Title.prototype.update = function () {
            const base = () => { if (_Scene_Title_update) _Scene_Title_update.call(this); };
            if (fullscreenNav) {
                updateFullscreenInput();
                withInputMuted(base);
                return;
            }
            if (this.canOpenRoadmapByKey() && detailsKeyTriggered()) {
                hideHoverModal();
                playSe('playOk');
                openFullscreenRoadmap();
                withInputMuted(base);
                return;
            }
            base();
        };

        Scene_Title.prototype.canOpenRoadmapByKey = function () {
            if (!this._roadmapBox || activeFullscreen) return false;
            if (this._storyModeWindow && this._storyModeWindow.visible) return false;
            if (this._hyperverseBg && typeof this._hyperverseBg.blocksTitleInput === 'function' &&
                this._hyperverseBg.blocksTitleInput()) return false;
            return true;
        };

        // L1 / R1 are polled raw off the pad by the background switcher, past
        // the muted Input, so the switcher is told directly to sit still.
        const _Scene_Title_updateBgSwitchInput = Scene_Title.prototype.updateBgSwitchInput;
        if (_Scene_Title_updateBgSwitchInput) {
            Scene_Title.prototype.updateBgSwitchInput = function () {
                if (fullscreenNav) return;
                _Scene_Title_updateBgSwitchInput.call(this);
            };
        }

        Scene_Title.prototype.removeDisclaimerBox = function () {
            hideHoverModal();
            const box = this._disclaimerBox || this._roadmapBox;
            if (box && box.parentNode) box.parentNode.removeChild(box);
            this._disclaimerBox = null;
            this._roadmapBox = null;
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
        getGoals: categoryGoals,
        showHoverModal: showHoverModal,
        hideHoverModal: hideHoverModal,
        isFullscreenOpen: () => !!fullscreenNav,
        updateFullscreenInput: updateFullscreenInput
    };

})();
