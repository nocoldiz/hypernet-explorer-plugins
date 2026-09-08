// =============================================================================
// AnimatedBattleBackgrounds.js - Refactored v3.0 with Dithered Gradients
// =============================================================================
/*:
 * @target MZ
* @plugindesc v3.0 Animated-style animated battle backgrounds with realistic moon phases and pixel art dithering
* @author Omni-Lex (Refactored)
*
* @param opacity
* @desc Opacity of the background overlay (0-255)
* @default 150
*
* @param blendMode
* @desc Blend mode (0:Normal, 1:Add, 2:Multiply, 3:Screen)
* @default 1
*
* @param animationSpeed
* @desc Animation speed multiplier (0.1-2.0)
* @default 0.5
* 
* @param optionName
* @desc Name of the option in the game menu
* @default Battle BG
*
* @param defaultMode
* @desc Default mode (0:Biome, 1:Trippy, 2:None)
* @default 0
*
* @help
* v3.0 Features:
* - Realistic moon phases based on actual lunar cycle
* - Three moons displayed on Fridays (easter egg)
* - Enhanced square star field with twinkling animation
* - Pixel art dithered sky gradients
* - Completely refactored codebase
* 
* Modes:
* - Biome: Dynamic sky with sun/moon cycles and biome-based backgrounds
* - Trippy: Psychedelic patterns with biome backgrounds (no tinting)
* - None: Disabled
* 
* Variables:
* - Variable 86: Country ID for sunrise/sunset times
* - Variable 80: Time mode (-1:real, 0:day, 1:night, 2:dusk, 3:dawn)
*/

(() => {
    'use strict';

    // =============================================================================
    // Configuration & Constants
    // =============================================================================

    const params = PluginManager.parameters('AnimatedBattleBackgrounds');
    const CONFIG = {
        optionName: String(params['optionName'] || 'Battle BG'),
        overlayOpacity: Number(params['opacity'] || 150),
        overlayBlendMode: Number(params['blendMode'] || 1),
        speedMultiplier: Math.min(Math.max(Number(params['animationSpeed'] || 0.5), 0.1), 1.0),
        defaultMode: Number(params['defaultMode'] || 0),

        // Moon constants
        LUNAR_CYCLE_DAYS: 29.53059,
        KNOWN_NEW_MOON: new Date('2000-01-06T18:14:00Z'),

        // Pattern types
        PATTERN_TYPES: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],

        // Time modes
        TIME_MODES: {
            REAL_TIME: -1,
            DAY: 0,
            NIGHT: 1,
            DUSK: 2,
            DAWN: 3
        }
    };

    // Import dependencies
    const { Countries } = window.WorldGen || {};
    const EG = window.EffectsGenerator;

    if (!EG) throw new Error("EffectsGenerator not loaded");
    if (!Countries) throw new Error("Countries data not loaded");

    Object.assign(Spriteset_Battle.prototype, EG);

    const defaultCountry = Countries.find(c => c.id === 102) || Countries[0];

    // =============================================================================
    // Utility Methods Section
    // =============================================================================



    function getGameDate() {
        // Get game date from TimeDateSystem (Variable 114: total minutes elapsed)
        // Base date: Jan 1, 2001 12:00
        const gameTimeMinutes = $gameVariables ? $gameVariables.value(114) || 0 : 0;
        const baseDate = new Date(2001, 0, 1, 12, 0, 0);
        return new Date(baseDate.getTime() + gameTimeMinutes * 60 * 1000);
    }


    function isFriday() {
        // Use game date from TimeDateSystem instead of real date
        const gameDate = getGameDate();
        return gameDate.getDay() === 5;
    }

    function createSeededRandom(seed) {
        return function () {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }

    function hslToRgb(h, s, l) {
        h = h % 360 / 360;
        s = s / 100;
        l = l / 100;

        if (s === 0) {
            const gray = Math.round(l * 255);
            return [gray, gray, gray];
        }

        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        return [
            Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
            Math.round(hue2rgb(p, q, h) * 255),
            Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
        ];
    }

    function hueToColor(hue, alpha = 1, lightness = 50) {
        const rgb = hslToRgb(hue, 80, lightness);
        return alpha < 1
            ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
            : `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    }
    // =============================================================================
    // Shared Sky Renderer, exposed globally so other plugins (FishingMinigame, etc.)
    // can draw the same sky without duplicating logic.
    // =============================================================================
    window.SkyRenderer = {
        getCurrentTimeMode,
        getGameDate,
        isFriday,
        calculateMoonPhase,
        getSkyColors,
        drawDitheredGradient,
        drawStars,
        drawMoon,
        drawClouds,
        TIME_MODES: CONFIG.TIME_MODES
    };

    // =============================================================================
    // Coordinate-Based Background System - Replace in AnimatedBattleBackgrounds.js
    // =============================================================================

    // ADD THIS NEW SECTION after the Utility Methods Section
    // =============================================================================
    // Coordinate-Based Background Selection
    // =============================================================================

    function getMapGridSize(mapWidth, mapHeight) {
        const mapSize = Math.max(mapWidth, mapHeight);

        // Maps smaller than 30x30 get a single background
        if (mapSize < 30) {
            return 1;
        }

        // Calculate grid size based on map dimensions
        // Creates roughly 30x30 tile squares
        return Math.floor(mapSize / 30);
    }

    // Resolve a biome name to its battleback folder path relative to
    // img/battlebacks1. Alien-planet biomes (one per GalaxySim planet type) keep
    // their backgrounds nested under AlienPlanet/<Biome>/ rather than a flat
    // folder, so fall back to that location when the flat one is absent. Returns
    // a forward-slash relative path ("<Biome>" or "AlienPlanet/<Biome>").
    function resolveBiomeBattlebackFolder(biomeName) {
        try {
            const fs = require('fs');
            const path = require('path');
            const base = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1'
            );
            if (fs.existsSync(path.join(base, biomeName))) return biomeName;
            if (fs.existsSync(path.join(base, 'AlienPlanet', biomeName))) {
                return 'AlienPlanet/' + biomeName;
            }
            // A directional variant is the same place seen from another angle:
            // "Road cross" and "River vertical" are a road and a river, and
            // they have never had folders of their own to look in.
            const stem = biomeName.split(' ')[0];
            if (stem !== biomeName && fs.existsSync(path.join(base, stem))) return stem;
        } catch (e) { /* fall through */ }
        return biomeName;
    }

    function getBackgroundIndexForCoordinates(x, y, biomeName) {
        if (!biomeName) return null;
        if (!$gameMap || !$dataMap) return null;

        const mapWidth = $gameMap.width();
        const mapHeight = $gameMap.height();
        const gridSize = getMapGridSize(mapWidth, mapHeight);

        // For small maps, return index 0
        if (gridSize === 1) {
            return 0;
        }

        // Calculate which grid square the player is in
        const gridX = Math.floor(x / 30);
        const gridY = Math.floor(y / 30);

        // Create a unique seed from grid coordinates
        // This ensures the same grid square always returns the same index
        const seed = gridX * 1000 + gridY;

        // Use seeded random to get consistent background for this grid square
        const random = createSeededRandom(seed);

        // Get list of available backgrounds for this biome
        const fs = require('fs');
        const path = require('path');

        try {
            if (!process.mainModule) return null;
            const biomePath = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1', resolveBiomeBattlebackFolder(biomeName)
            );

            if (!fs.existsSync(biomePath)) {
                return null;
            }

            let files = fs.readdirSync(biomePath);
            let imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

            if (imageFiles.length === 0) {
                return null;
            }

            // Filter by time suffix in Biome mode
            if (ConfigManager.ebBackgrounds === 0) {
                const timeMode = getCurrentTimeMode();
                const filtered = imageFiles.filter(file => {
                    const suffix = file.replace(/\.[^/.]+$/, '').slice(-2);
                    if (suffix === '_N') return timeMode === CONFIG.TIME_MODES.NIGHT;
                    if (suffix === '_D') return timeMode === CONFIG.TIME_MODES.DAY;
                    if (suffix === '_S') return timeMode === CONFIG.TIME_MODES.DUSK || timeMode === CONFIG.TIME_MODES.DAWN;
                    return true;
                });

                if (filtered.length > 0) imageFiles = filtered;
            }

            // Use seeded random to pick consistent index for this grid square
            const index = Math.floor(random() * imageFiles.length);
            return index;

        } catch (e) {
            console.error('Error getting background index:', e);
            return null;
        }
    }

    function getBiomeBackgroundForCoordinates(x, y, biomeName) {
        const fs = require('fs');
        const path = require('path');

        if (!biomeName) return null;

        try {
            if (!process.mainModule) return null;
            const folderRel = resolveBiomeBattlebackFolder(biomeName);
            const biomePath = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1', folderRel
            );

            if (!fs.existsSync(biomePath)) {
                //console.log('Biome folder not found:', biomePath);
                return null;
            }

            let files = fs.readdirSync(biomePath);
            let imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

            if (imageFiles.length === 0) {
                //console.log('No images in biome folder:', biomePath);
                return null;
            }

            // Filter by time suffix in Biome mode
            if (ConfigManager.ebBackgrounds === 0) {
                const timeMode = getCurrentTimeMode();
                const filtered = imageFiles.filter(file => {
                    const suffix = file.replace(/\.[^/.]+$/, '').slice(-2);
                    if (suffix === '_N') return timeMode === CONFIG.TIME_MODES.NIGHT;
                    if (suffix === '_D') return timeMode === CONFIG.TIME_MODES.DAY;
                    if (suffix === '_S') return timeMode === CONFIG.TIME_MODES.DUSK || timeMode === CONFIG.TIME_MODES.DAWN;
                    return true;
                });

                if (filtered.length > 0) imageFiles = filtered;
            }

            // Get consistent background index for these coordinates
            const bgIndex = getBackgroundIndexForCoordinates(x, y, biomeName);
            if (bgIndex === null) return null;

            const selectedFile = imageFiles[bgIndex];
            const fullPath = folderRel + '/' + selectedFile.replace(/\.[^/.]+$/, '');

            if (!$gameMap || !$dataMap) return fullPath;
            const mapWidth = $gameMap.width();
            const mapHeight = $gameMap.height();
            const gridSize = getMapGridSize(mapWidth, mapHeight);
            const gridX = Math.floor(x / 30);
            const gridY = Math.floor(y / 30);

            //console.log(`Loading biome background for coordinates (${x}, ${y})`);
            //console.log(`Grid: (${gridX}, ${gridY}), Grid Size: ${gridSize}, Background: ${fullPath}`);

            return fullPath;
        } catch (e) {
            console.error('Error loading biome background:', e);
            return null;
        }
    }

    // =============================================================================
    // Enemy-Note Biome Selection (used by Battle Test)
    // =============================================================================

    // True if img/battlebacks1/<biomeName> exists and holds at least one image.
    function biomeFolderHasImages(biomeName) {
        if (!biomeName) return false;
        try {
            const fs = require('fs');
            const path = require('path');
            const biomePath = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1', resolveBiomeBattlebackFolder(biomeName)
            );
            if (!fs.existsSync(biomePath)) return false;
            return fs.readdirSync(biomePath).some(f => /\.(png|jpg|jpeg)$/i.test(f));
        } catch (e) {
            return false;
        }
    }

    // Reads the <Biome: A, B, C> note from each enemy in the current troop and
    // returns one biome that actually has a battleback folder. Returns null when
    // no enemy declares a usable biome.
    function getBiomeFromTroopEnemies() {
        if (typeof $gameTroop === 'undefined' || !$gameTroop || !$gameTroop.members) return null;

        const biomes = [];
        for (const member of $gameTroop.members()) {
            const enemy = member && member.enemy ? member.enemy() : null;
            if (!enemy || !enemy.note) continue;
            const match = enemy.note.match(/<Biome:\s*([^>]+)>/i);
            if (!match) continue;
            for (const part of match[1].split(',')) {
                const name = part.trim();
                if (name && !biomes.includes(name)) biomes.push(name);
            }
        }

        if (biomes.length === 0) return null;

        // Prefer biomes that have an actual battleback folder; pick one at random
        // so repeated tests show the full range the enemy can appear in.
        const valid = biomes.filter(biomeFolderHasImages);
        const pool = valid.length > 0 ? valid : biomes;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // Coordinate-independent battleback picker for Battle Test, where no map is
    // loaded ($dataMap is null) so the grid-based selector cannot be used.
    // Returns a "Biome/file" path (no extension) or null.
    function pickRandomBiomeBackgroundFile(biomeName) {
        if (!biomeName) return null;
        try {
            const fs = require('fs');
            const path = require('path');
            const folderRel = resolveBiomeBattlebackFolder(biomeName);
            const biomePath = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1', folderRel
            );
            if (!fs.existsSync(biomePath)) return null;

            let imageFiles = fs.readdirSync(biomePath).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
            if (imageFiles.length === 0) return null;

            // Match the time-of-day suffix filtering used by the coordinate picker.
            if (ConfigManager.ebBackgrounds === 0) {
                const timeMode = getCurrentTimeMode();
                const filtered = imageFiles.filter(file => {
                    const suffix = file.replace(/\.[^/.]+$/, '').slice(-2);
                    if (suffix === '_N') return timeMode === CONFIG.TIME_MODES.NIGHT;
                    if (suffix === '_D') return timeMode === CONFIG.TIME_MODES.DAY;
                    if (suffix === '_S') return timeMode === CONFIG.TIME_MODES.DUSK || timeMode === CONFIG.TIME_MODES.DAWN;
                    return true;
                });
                if (filtered.length > 0) imageFiles = filtered;
            }

            const file = imageFiles[Math.floor(Math.random() * imageFiles.length)];
            return folderRel + '/' + file.replace(/\.[^/.]+$/, '');
        } catch (e) {
            return null;
        }
    }

    // Lists every img/battlebacks1/<Biome> folder that actually holds images,
    // cached for the session. Exposed so other plugins (the biome trial mode) can
    // offer the same biome list the battle backgrounds support.
    let _biomeFolderCache = null;
    function listBiomeBattlebackFolders() {
        if (_biomeFolderCache) return _biomeFolderCache;
        try {
            const fs = require('fs');
            const path = require('path');
            const base = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1'
            );
            _biomeFolderCache = fs.readdirSync(base, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name)
                .filter(biomeFolderHasImages);
        } catch (e) {
            _biomeFolderCache = [];
        }
        return _biomeFolderCache;
    }
    window.getBiomeBattlebackFolders = listBiomeBattlebackFolders;

    function pickRandomBiomeName() {
        const folders = listBiomeBattlebackFolders();
        return folders.length ? folders[Math.floor(Math.random() * folders.length)] : null;
    }

    // Relative path to a representative battleback image for a biome, for DOM
    // previews (e.g. the Biome Trials selection screen). Null if none.
    window.getBiomeBattlebackPreview = function (biomeName) {
        if (!biomeName) return null;
        try {
            const fs = require('fs');
            const path = require('path');
            const folderRel = resolveBiomeBattlebackFolder(biomeName);
            const dir = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1', folderRel
            );
            if (!fs.existsSync(dir)) return null;
            const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
            if (!files.length) return null;
            return 'img/battlebacks1/' + folderRel + '/' + files[0];
        } catch (e) {
            return null;
        }
    };

    // The ground the current map would fight on, as a path a DOM panel can hang
    // behind itself (the equip bench shows the party's own surroundings rather
    // than a grey box). The map's own battleback comes first; failing that the
    // map biome's folder, drawn by map id so one place always keeps the same
    // view; failing that any biome at all. Null when there is nothing to show.
    let _mapBattlebackCache = { mapId: -1, path: null };
    window.getMapBattlebackImage = function () {
        const mapId = ($gameMap && $gameMap.mapId) ? $gameMap.mapId() : 0;
        if (_mapBattlebackCache.mapId === mapId) return _mapBattlebackCache.path;

        let result = null;
        try {
            const fs = require('fs');
            const path = require('path');
            const base = path.join(
                path.dirname(process.mainModule.filename),
                'img', 'battlebacks1'
            );

            const imagesIn = (dir) => {
                if (!fs.existsSync(dir)) return [];
                let files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
                // A night view at noon reads as the wrong place, so the same
                // time-of-day suffixes the battle itself honours are honoured here.
                const timeMode = getCurrentTimeMode();
                const timed = files.filter(file => {
                    const suffix = file.replace(/\.[^/.]+$/, '').slice(-2);
                    if (suffix === '_N') return timeMode === CONFIG.TIME_MODES.NIGHT;
                    if (suffix === '_D') return timeMode === CONFIG.TIME_MODES.DAY;
                    if (suffix === '_S') return timeMode === CONFIG.TIME_MODES.DUSK || timeMode === CONFIG.TIME_MODES.DAWN;
                    return true;
                });
                return timed.length > 0 ? timed : files;
            };

            const own = (typeof $dataMap !== 'undefined' && $dataMap) ? $dataMap.battleback1Name : '';
            if (own) {
                for (const ext of ['.png', '.jpg', '.jpeg']) {
                    if (fs.existsSync(path.join(base, own + ext))) {
                        result = 'img/battlebacks1/' + own + ext;
                        break;
                    }
                }
            }

            if (!result) {
                let biome = ($gameMap && $gameMap.getBiome) ? $gameMap.getBiome() : null;
                if (!biome && $gameMap && $gameMap.mapId() === 636 &&
                    typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._procGenData) {
                    biome = $gameSystem._procGenData.currentBiome;
                }
                const rng = createSeededRandom(mapId + 1);
                let folder = biome ? resolveBiomeBattlebackFolder(biome) : null;
                let files = folder ? imagesIn(path.join(base, folder)) : [];
                if (files.length === 0) {
                    const all = listBiomeBattlebackFolders();
                    if (all.length > 0) {
                        folder = resolveBiomeBattlebackFolder(all[Math.floor(rng() * all.length)]);
                        files = imagesIn(path.join(base, folder));
                    }
                }
                if (files.length > 0) {
                    result = 'img/battlebacks1/' + folder + '/' + files[Math.floor(rng() * files.length)];
                }
            }
        } catch (e) {
            result = null;
        }

        _mapBattlebackCache = { mapId: mapId, path: result };
        return result;
    };

    // =============================================================================
    // Dithering System
    // =============================================================================

    // Bayer 8x8 dithering matrix (finer, less obvious pattern)
    const BAYER_MATRIX = [
        [0, 32, 8, 40, 2, 34, 10, 42],
        [48, 16, 56, 24, 50, 18, 58, 26],
        [12, 44, 4, 36, 14, 46, 6, 38],
        [60, 28, 52, 20, 62, 30, 54, 22],
        [3, 35, 11, 43, 1, 33, 9, 41],
        [51, 19, 59, 27, 49, 17, 57, 25],
        [15, 47, 7, 39, 13, 45, 5, 37],
        [63, 31, 55, 23, 61, 29, 53, 21]
    ];

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [0, 0, 0];
    }

    function getSkyColors(timeMode) {
        let colors;
        switch (timeMode) {
            case CONFIG.TIME_MODES.DAY:
                colors = [
                    hexToRgb('#1E90FF'),
                    hexToRgb('#87CEEB'),
                    hexToRgb('#B0E0E6')
                ];
                break;
            case CONFIG.TIME_MODES.NIGHT:
                colors = [
                    hexToRgb('#000428'),
                    hexToRgb('#004e92'),
                    hexToRgb('#001a33')
                ];
                break;
            case CONFIG.TIME_MODES.DUSK:
                colors = [
                    hexToRgb('#FF4500'),
                    hexToRgb('#FF8C00'),
                    hexToRgb('#9370DB'),
                    hexToRgb('#483D8B')
                ];
                break;
            case CONFIG.TIME_MODES.DAWN:
                colors = [
                    hexToRgb('#FF6B6B'),
                    hexToRgb('#FFA07A'),
                    hexToRgb('#FFD700'),
                    hexToRgb('#87CEEB')
                ];
                break;
            default:
                colors = [
                    hexToRgb('#1E90FF'),
                    hexToRgb('#87CEEB'),
                    hexToRgb('#B0E0E6')
                ];
        }

        // Blend toward overcast tones based on WeatherSystem weather type
        if (typeof $gameWeather !== 'undefined' && $gameWeather) {
            const wt = $gameWeather.currentWeatherType;
            if (wt === 'storm') {
                colors = colors.map(c => [
                    Math.round(c[0] * 0.55 + 80 * 0.45),
                    Math.round(c[1] * 0.55 + 80 * 0.45),
                    Math.round(c[2] * 0.55 + 88 * 0.45)
                ]);
            } else if (wt === 'rain') {
                colors = colors.map(c => [
                    Math.round(c[0] * 0.65 + 105 * 0.35),
                    Math.round(c[1] * 0.65 + 110 * 0.35),
                    Math.round(c[2] * 0.65 + 120 * 0.35)
                ]);
            } else if (wt === 'snow') {
                colors = colors.map(c => [
                    Math.round(c[0] * 0.75 + 200 * 0.25),
                    Math.round(c[1] * 0.75 + 205 * 0.25),
                    Math.round(c[2] * 0.75 + 215 * 0.25)
                ]);
            }
        }

        // On an alien planet surface, blend the whole sky toward that world's
        // palette so each planet reads with its own colour of sky.
        const lp = (window.GalaxySim && window.GalaxySim.getSurfacePlanet)
            ? window.GalaxySim.getSurfacePlanet() : null;
        if (lp && lp.skyBlend) {
            const f = 0.32;
            colors = colors.map(c => [
                Math.round(c[0] * (1 - f) + lp.skyBlend[0] * f),
                Math.round(c[1] * (1 - f) + lp.skyBlend[1] * f),
                Math.round(c[2] * (1 - f) + lp.skyBlend[2] * f)
            ]);
        }

        return colors;
    }

    // The dither is a half-megapixel loop (816x624) that used to run in full on
    // every single battle start, plus a 2MB ImageData allocated and uploaded with
    // it. What it paints depends on nothing but the sky colours and the canvas
    // size, so it is painted once into an offscreen canvas and every later ask
    // for the same sky is a blit. Opening a second fight in the same weather at
    // the same hour now costs a drawImage instead of ~500k iterations.
    let _gradientCanvas = null;
    let _gradientKey = '';

    function ditheredGradientSource(width, height, timeMode) {
        const colors = getSkyColors(timeMode);
        const key = width + 'x' + height + '|' + colors.map(c => c.join(',')).join(';');
        if (_gradientCanvas && _gradientKey === key) return _gradientCanvas;

        const canvas = _gradientCanvas && _gradientCanvas.width === width &&
            _gradientCanvas.height === height
            ? _gradientCanvas
            : document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        const stops = colors.length - 1;

        for (let y = 0; y < height; y++) {
            // Calculate gradient position (0 to 1)
            const gradPos = y / height;

            // Find which color stops to interpolate between
            const colorIndex = Math.floor(gradPos * stops);
            const nextColorIndex = Math.min(colorIndex + 1, stops);

            // Calculate local interpolation factor
            const localFactor = (gradPos * stops) - colorIndex;

            const color1 = colors[colorIndex];
            const color2 = colors[nextColorIndex];
            // The dither threshold only ever varies over an 8x8 tile, so the
            // row's eight verdicts are settled once and then read off.
            const bayerRow = BAYER_MATRIX[y & 7];
            const pick = [];
            for (let b = 0; b < 8; b++) {
                pick[b] = localFactor > (bayerRow[b] / 64) ? color2 : color1;
            }

            let index = y * width * 4;
            for (let x = 0; x < width; x++) {
                const finalColor = pick[x & 7];
                data[index] = finalColor[0];
                data[index + 1] = finalColor[1];
                data[index + 2] = finalColor[2];
                data[index + 3] = 255;
                index += 4;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        _gradientCanvas = canvas;
        _gradientKey = key;
        return canvas;
    }

    function drawDitheredGradient(context, width, height, timeMode) {
        const source = ditheredGradientSource(width, height, timeMode);
        // The source canvas is the exact size asked for, so this is a straight
        // copy rather than a resample.
        context.drawImage(source, 0, 0);
    }

    // =============================================================================
    // Moon Phase Calculator Section
    // =============================================================================

    function calculateMoonPhase(date = new Date()) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysSinceKnownNewMoon = (date - CONFIG.KNOWN_NEW_MOON) / msPerDay;
        const phase = (daysSinceKnownNewMoon % CONFIG.LUNAR_CYCLE_DAYS) / CONFIG.LUNAR_CYCLE_DAYS;

        return {
            phase: phase,
            illumination: getMoonIllumination(phase),
            name: getMoonPhaseName(phase),
            isWaxing: phase < 0.5
        };
    }

    function getMoonIllumination(phase) {
        return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
    }

    // Eight phase names, the index staying the id.
    const MOON_PHASE_KEYS = [
        'newMoon', 'waxingCrescent', 'firstQuarter', 'waxingGibbous',
        'fullMoon', 'waningGibbous', 'lastQuarter', 'waningCrescent'
    ];

    function getMoonPhaseName(phase) {
        // Each name owns an eighth of the cycle centred on its own moment, so
        // the new moon spans the wrap. A date before the reference new moon
        // gives a negative phase, hence the second modulo.
        const p = ((((phase + 0.0625) % 1) + 1) % 1);
        return T('Battle.moonPhase.' + MOON_PHASE_KEYS[Math.floor(p * 8) % 8]);
    }

    // =============================================================================
    // Time Management Section
    // =============================================================================

    function getGameTimeHourAndMinute() {
        // Get game time from TimeDateSystem (Variable 114: total minutes elapsed)
        const gameDate = getGameDate();

        const hours = gameDate.getHours();
        const minutes = gameDate.getMinutes();

        return { hours, minutes };
    }

    function getCurrentTimeMode() {
        const timeMode = $gameVariables.value(80);

        if (timeMode !== CONFIG.TIME_MODES.REAL_TIME) {
            return timeMode;
        }

        // Use game time from TimeDateSystem instead of real time
        const { hours, minutes } = getGameTimeHourAndMinute();
        const timeValue = hours + minutes / 60;

        if (timeValue >= 5 && timeValue < 7) return CONFIG.TIME_MODES.DAWN;
        if (timeValue >= 7 && timeValue < 17) return CONFIG.TIME_MODES.DAY;
        if (timeValue >= 17 && timeValue < 19) return CONFIG.TIME_MODES.DUSK;
        return CONFIG.TIME_MODES.NIGHT;
    }


    function getTintDataForTimeMode(timeMode) {
        switch (timeMode) {
            case CONFIG.TIME_MODES.DAY:
                return {
                    color: [20, 20, 40, 0],
                    blendColor: 'rgba(135, 206, 250, 0.15)'
                };
            case CONFIG.TIME_MODES.NIGHT:
                return {
                    color: [-80, -60, 20, 0],
                    blendColor: 'rgba(0, 20, 80, 0.4)'
                };
            case CONFIG.TIME_MODES.DUSK:
                return {
                    color: [40, -20, -10, 0],
                    blendColor: 'rgba(255, 100, 0, 0.25)'
                };
            case CONFIG.TIME_MODES.DAWN:
                return {
                    color: [50, 10, -20, 0],
                    blendColor: 'rgba(255, 140, 100, 0.2)'
                };
            default:
                return {
                    color: [0, 0, 0, 0],
                    blendColor: null
                };
        }
    }

    // =============================================================================
    // Sky Drawing Section
    // =============================================================================

    // `style` (optional) themes a moon to a specific satellite:
    //   { color:'#rrggbb' body tint, seed:int crater layout, illumination:0..1 }
    function drawMoon(context, x, y, radius, moonData, style) {
        style = style || {};
        const { phase, isWaxing } = moonData;
        const illumination = (typeof style.illumination === 'number')
            ? style.illumination : moonData.illumination;

        // Body colour + a glow tinted to match it (falls back to the warm lunar look).
        const bodyRgb = style.color ? hexToRgb(style.color) : [255, 250, 237];
        const bodyCss = `rgb(${bodyRgb[0]},${bodyRgb[1]},${bodyRgb[2]})`;
        const glowRgb = [
            Math.round((bodyRgb[0] + 255) / 2),
            Math.round((bodyRgb[1] + 255) / 2),
            Math.round((bodyRgb[2] + 235) / 2)
        ];

        // Outer glow (stronger and more visible)
        const outerGlow = context.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2.5);
        outerGlow.addColorStop(0, `rgba(${glowRgb[0]}, ${glowRgb[1]}, ${glowRgb[2]}, 0.6)`);
        outerGlow.addColorStop(0.5, `rgba(${glowRgb[0]}, ${glowRgb[1]}, ${glowRgb[2]}, 0.3)`);
        outerGlow.addColorStop(1, `rgba(${glowRgb[0]}, ${glowRgb[1]}, ${glowRgb[2]}, 0)`);
        context.fillStyle = outerGlow;
        context.beginPath();
        context.arc(x, y, radius * 2.5, 0, Math.PI * 2);
        context.fill();

        // Inner glow
        const innerGlow = context.createRadialGradient(x, y, radius * 0.7, x, y, radius * 1.3);
        innerGlow.addColorStop(0, `rgba(${glowRgb[0]}, ${glowRgb[1]}, ${glowRgb[2]}, 0.5)`);
        innerGlow.addColorStop(1, `rgba(${glowRgb[0]}, ${glowRgb[1]}, ${glowRgb[2]}, 0)`);
        context.fillStyle = innerGlow;
        context.beginPath();
        context.arc(x, y, radius * 1.3, 0, Math.PI * 2);
        context.fill();

        // Save context for clipping
        context.save();

        // Create clipping path for the moon
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.clip();

        // Moon body (brighter)
        context.fillStyle = bodyCss;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();

        // Moon craters (more visible). Seeded per-satellite so each alien moon
        // has its own surface instead of the identical lunar template.
        context.fillStyle = `rgba(${Math.round(bodyRgb[0] * 0.8)}, ${Math.round(bodyRgb[1] * 0.8)}, ${Math.round(bodyRgb[2] * 0.78)}, 0.4)`;
        let craters;
        if (typeof style.seed === 'number') {
            const rnd = createSeededRandom(style.seed + 1);
            const count = 4 + Math.floor(rnd() * 4);
            craters = [];
            for (let i = 0; i < count; i++) {
                craters.push([rnd() * 1.4 - 0.7, rnd() * 1.4 - 0.7, 0.08 + rnd() * 0.16]);
            }
        } else {
            craters = [
                [0.2, -0.3, 0.15],
                [-0.3, 0.1, 0.2],
                [0.1, 0.3, 0.12],
                [-0.2, -0.2, 0.18],
                [0.35, 0.15, 0.1]
            ];
        }

        craters.forEach(([cx, cy, cr]) => {
            context.beginPath();
            context.arc(x + cx * radius, y + cy * radius, cr * radius, 0, Math.PI * 2);
            context.fill();
        });

        // Moon phase shadow - use destination-out to actually cut out the shadow
        if (illumination < 0.98) {
            context.globalCompositeOperation = 'destination-out';

            const shadowX = isWaxing
                ? x + radius * (1 - 2 * illumination)
                : x - radius * (1 - 2 * illumination);

            // Draw shadow to cut out
            context.fillStyle = 'rgba(0, 0, 0, 1)';
            context.beginPath();
            context.arc(shadowX, y, radius, 0, Math.PI * 2);
            context.fill();

            // Draw subtle shadow gradient on the edge
            context.globalCompositeOperation = 'source-over';
            const edgeX = isWaxing ? x - radius * (2 * illumination - 1) : x + radius * (2 * illumination - 1);
            const shadowGradient = context.createRadialGradient(edgeX, y, 0, edgeX, y, radius * 0.3);
            shadowGradient.addColorStop(0, 'rgba(0, 10, 30, 0.4)');
            shadowGradient.addColorStop(1, 'rgba(0, 10, 30, 0)');
            context.fillStyle = shadowGradient;
            context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }

        context.restore();
    }

    // The star field is seeded off a constant, so where the three hundred stars
    // stand and how big they are never changes for a given canvas: rolled once
    // and then read off, instead of running the generator fifteen hundred times
    // on every redraw. The animated and static forms draw from the stream
    // differently (the twinkle speed is only rolled when there is a time to
    // twinkle against), so each keeps its own table and its own look.
    const _STAR_FIELD_CACHE = new Map();

    function starField(width, height, isAnimated) {
        const key = width + 'x' + height + (isAnimated ? '|a' : '|s');
        let field = _STAR_FIELD_CACHE.get(key);
        if (field) return field;
        const random = createSeededRandom(12345);
        field = [];
        for (let i = 0; i < 300; i++) {
            const star = {
                x: random() * width,
                y: random() * height,
                size: random() * 2.5 + 0.5,
                base: random() * 0.4 + 0.6,
                speed: 0
            };
            if (isAnimated) star.speed = 2 + random() * 3;
            field.push(star);
        }
        _STAR_FIELD_CACHE.set(key, field);
        return field;
    }

    // One white radial falloff, painted once and stamped per star. A gradient
    // built per star meant three hundred allocations and three hundred shader
    // setups a redraw for the same picture at a different size; the alpha the
    // gradient used to carry is folded into globalAlpha instead, which is what
    // the blit multiplies by.
    const STAR_GLOW_PX = 64;
    let _starGlowCanvas = null;

    function starGlowSprite() {
        if (_starGlowCanvas) return _starGlowCanvas;
        const c = document.createElement('canvas');
        c.width = c.height = STAR_GLOW_PX;
        const g = c.getContext('2d');
        const r = STAR_GLOW_PX / 2;
        const grad = g.createRadialGradient(r, r, 0, r, r, r);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, STAR_GLOW_PX, STAR_GLOW_PX);
        _starGlowCanvas = c;
        return c;
    }

    function drawStars(context, width, height, animatedTime) {
        const time = animatedTime !== undefined ? animatedTime : 0;
        const isAnimated = animatedTime !== undefined;
        const field = starField(width, height, isAnimated);
        const glow = starGlowSprite();

        context.fillStyle = '#FFFFFF';
        for (let i = 0; i < field.length; i++) {
            const star = field[i];
            const size = star.size;

            // Twinkling effect
            let brightness = star.base;
            if (isAnimated) {
                const twinkle = Math.sin(time * star.speed + i) * 0.3;
                brightness = Math.max(0.3, Math.min(1, star.base + twinkle));
            }

            // Draw square star
            context.globalAlpha = brightness;
            context.fillRect(star.x - size / 2, star.y - size / 2, size, size);

            // Star glow for brighter stars
            if (size > 1.5 && brightness > 0.7) {
                const glowSize = size * 3;
                // The old gradient's own alpha rode on top of the star's, so the
                // two are multiplied together here to keep the same result.
                context.globalAlpha = brightness * brightness * 0.4;
                context.drawImage(glow, star.x - glowSize, star.y - glowSize,
                    glowSize * 2, glowSize * 2);
            }
        }

        context.globalAlpha = 1;
    }

    function drawClouds(context, width, height, timeMode, animTime = 0) {
        const opacity = timeMode === CONFIG.TIME_MODES.DAWN ? 0.5
            : timeMode === CONFIG.TIME_MODES.DUSK ? 0.4
                : 0.35;

        const random = createSeededRandom(54321);
        const cloudCount = 8 + Math.floor(random() * 6); // Fewer clouds

        for (let i = 0; i < cloudCount; i++) {
            // Slower movement
            const baseX = random() * width * 1.2 - width * 0.1;
            const baseY = random() * (height * 0.6);
            const cloudSpeed = 0.2 + random() * 0.1; // Much slower (was 0.1-0.4)
            const x = (baseX + animTime * cloudSpeed * 10) % (width * 1.2) - width * 0.1;
            const y = baseY;

            const size = random() * 50 + 20; // Larger base size
            const puffCount = 5 + Math.floor(random() * 8); // More puffs for smoother shape
            const cloudOpacity = opacity * (0.6 + random() * 0.4);
            const stretch = 1.5 + random() * 1.0; // Much more horizontal stretch

            context.fillStyle = `rgba(255, 255, 255, ${cloudOpacity})`;

            // Draw more overlapping puffs for smoother, realistic clouds
            for (let j = 0; j < puffCount; j++) {
                // Arrange puffs more horizontally
                const puffX = x + ((j / puffCount) - 0.5) * size * 3 * stretch;
                const puffY = y + (random() - 0.5) * size * 0.4; // Less vertical variation
                const puffSize = size * (0.5 + random() * 0.5);

                // Draw elongated ellipses for wispy clouds
                context.beginPath();
                context.ellipse(puffX, puffY, puffSize * stretch, puffSize * 0.6, 0, 0, Math.PI * 2);
                context.fill();
            }

            // Add some wispy edges
            context.globalAlpha = cloudOpacity * 0.3;
            for (let j = 0; j < 3; j++) {
                const wispX = x + (random() - 0.5) * size * 2.5 * stretch;
                const wispY = y + (random() - 0.5) * size * 0.5;
                const wispSize = size * (0.3 + random() * 0.4);

                context.beginPath();
                context.ellipse(wispX, wispY, wispSize * stretch * 1.5, wispSize * 0.4, 0, 0, Math.PI * 2);
                context.fill();
            }
            context.globalAlpha = 1.0;
        }
    }


    // =============================================================================
    // Game_Map Extensions
    // =============================================================================

    Game_Map.prototype.isInterior = function () {
        // Generated caves/dungeons/crypts/sewers sit on the <Exterior>-tagged
        // procedural map but are roofed over, so they darken instead of taking
        // a time-of-day tint.
        if (typeof window.isProceduralInteriorMap === 'function' && window.isProceduralInteriorMap()) {
            return true;
        }
        return $dataMap && $dataMap.note && /<Interior>/i.test($dataMap.note);
    };

    Game_Map.prototype.isExterior = function () {
        if (typeof window.isProceduralInteriorMap === 'function' && window.isProceduralInteriorMap()) {
            return false;
        }
        return $dataMap && $dataMap.note && /<Exterior>/i.test($dataMap.note);
    };

    Game_Map.prototype.getBiome = function () {
        if (!$dataMap || !$dataMap.note) return null;
        const match = $dataMap.note.match(/<Biome:\s*(.+?)>/i);
        return match ? match[1].trim() : null;
    };

    // =============================================================================
    // ImageManager Extensions
    // =============================================================================

    ImageManager.getBiomeBackgroundForPlayer = function (biomeName) {
        if (!biomeName) return null;

        // Get player coordinates
        const playerX = $gamePlayer.x;
        const playerY = $gamePlayer.y;

        return getBiomeBackgroundForCoordinates(playerX, playerY, biomeName);
    };

    // Keep the old function name for compatibility but redirect to new system
    ImageManager.getRandomBiomeBackground = function (biomeName) {
        return this.getBiomeBackgroundForPlayer(biomeName);
    };

    // =============================================================================
    // Spriteset_Battle Extensions
    // =============================================================================

    // Create Lower Layer
    const _Spriteset_Battle_createLowerLayer = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function () {
        _Spriteset_Battle_createLowerLayer.call(this);

        // Always clear screen tint - we apply tint only to backgrounds
        $gameScreen.startTint([0, 0, 0, 0], 0);

        if (ConfigManager.asciiModeEnabled === 1 || ConfigManager.ebBackgrounds !== 2) {
            this.createAnimatedBackground();
        }

        this._createBattleWeatherSprite();
    };

    Spriteset_Battle.prototype._createBattleWeatherSprite = function () {
        // MZ's weather layer is `Weather` (`Sprite_Weather` was the MV name), so the
        // old guard was always taken and battle weather never drew at all.
        if (typeof Weather === 'undefined') return;
        this._battleWeatherSprite = new Weather();
        this.addChild(this._battleWeatherSprite);
    };

    // Battleback Creation

    const _Spriteset_Battle_createBattleback = Spriteset_Battle.prototype.createBattleback;
    Spriteset_Battle.prototype.createBattleback = function () {
        _Spriteset_Battle_createBattleback.call(this);

        if (ConfigManager.asciiModeEnabled === 1) {
            this._back1Sprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
            this._back1Sprite.bitmap.fillAll('#000000');
            this._back2Sprite.bitmap = new Bitmap(1, 1);
            return;
        }

        const mode = ConfigManager.ebBackgrounds;
        const isBattleTest = typeof DataManager !== 'undefined' &&
            typeof DataManager.isBattleTest === 'function' && DataManager.isBattleTest();

        // A fight can start with no map loaded at all: a minigame opened from
        // the title screen (the fishing lake hooking something hostile) runs on
        // a throwaway context whose $dataMap was never filled in. There is no
        // biome and no region to read there, and asking anyway crashes in
        // Game_Map.width, so the stock battleback is left as it is.
        if (typeof $dataMap === 'undefined' || !$dataMap) {
            return;
        }

        // A map with its battleback explicitly set in the editor always wins,
        // overriding biome, forced biome (arena/gauntlet) and random biome alike.
        // The vanilla createBattleback call above already loaded it.
        if ($dataMap && $dataMap.specifyBattleback) {
            return;
        }

        // Biome always takes priority over any hardcoded battleback1 set on the map
        let biome = $gameMap.getBiome();

        // Region 99 (water) tiles force the RiverBank battleback when biome
        // backgrounds are active. Battle Test has no loaded player/map, so skip it there.
        if ((mode === 0 || mode === 1) && !isBattleTest &&
            typeof $gamePlayer !== 'undefined' && $gamePlayer &&
            $gamePlayer.regionId() === 99) {
            biome = 'RiverBank';
        }

        // Procedural map biome (map 636)
        if (!biome && $gameMap.mapId() === 636 && $gameSystem._procGenData) {
            biome = $gameSystem._procGenData.currentBiome;
            if ($gameSystem._procGenData.displayAsIsland) {
                biome = "Island";
            } else if ($gameSystem._procGenData.displayAsBeach) {
                biome = "Beach";
            }
        }

        // Battle Test (editor "Battle Test..." button): the test map has no
        // <Biome> tag, so pull the biome straight from the troop's enemy notes.
        if (!biome && (mode === 0 || mode === 1) && isBattleTest) {
            biome = getBiomeFromTroopEnemies();
        }

        // Default biome: Dungeon for interiors, Fields for everything else
        // (this also overrides maps that previously relied on a hardcoded battleback)
        if (!biome && (mode === 0 || mode === 1)) {
            biome = $gameMap.isInterior() ? 'Dungeon' : 'Fields';
        }

        // Overrides (biome modes only). A forced biome (Biome Trials / gauntlet)
        // wins over the map biome; otherwise the "Random Battle BG" option rerolls
        // the biome for every battle. Both want a fresh random image each battle,
        // not the coordinate-seeded one.
        let randomizeImage = isBattleTest;
        if (mode === 0 || mode === 1) {
            const forcedBiome = (typeof $gameSystem !== 'undefined' && $gameSystem) ? $gameSystem._forcedBattleBiome : null;
            if (forcedBiome) {
                biome = forcedBiome;
                randomizeImage = true;
            } else if (ConfigManager.ebRandomBiome && !isBattleTest) {
                const rb = pickRandomBiomeName();
                if (rb) { biome = rb; randomizeImage = true; }
            }
        }

        if (biome) {
            // Battle Test / forced / random-biome: the coordinate-based selector
            // can't or shouldn't run; pick a random file from the biome folder.
            let biomeBg = randomizeImage
                ? pickRandomBiomeBackgroundFile(biome)
                : ImageManager.getBiomeBackgroundForPlayer(biome);
            // Biome folder missing or empty -> fall back to Fields
            if (!biomeBg && biome !== 'Fields') {
                biomeBg = randomizeImage
                    ? pickRandomBiomeBackgroundFile('Fields')
                    : ImageManager.getBiomeBackgroundForPlayer('Fields');
            }
            if (biomeBg) {
                this._back1Sprite.bitmap = ImageManager.loadBattleback1(biomeBg);
                this.alignBattlebackBottom(this._back1Sprite);
                if (mode === 0 && !$gameMap.isInterior()) {
                    this.applyTimeOfDayTintToBackground(this._back1Sprite);
                } else if ($gameMap.isInterior()) {
                    this.applyInteriorDarkening(this._back1Sprite);
                }
                return;
            }
        }

        this.alignBattlebackBottom(this._back1Sprite);
    };

    // NEW METHOD: Applies tint only to the background sprite using a color overlay
    Spriteset_Battle.prototype.applyTimeOfDayTintToBackground = function (sprite) {
        if (!sprite || !sprite.bitmap) return;

        const tintData = this.getTimeOfDayTint();

        const applyTint = () => {
            if (!sprite.bitmap || !sprite.bitmap.isReady()) return;

            // Remove any existing tint overlay
            if (sprite._tintOverlay) {
                sprite.removeChild(sprite._tintOverlay);
                sprite._tintOverlay = null;
            }

            // Only apply if there's a blend color
            if (!tintData.blendColor) return;

            // Create an overlay sprite that matches the background size
            sprite._tintOverlay = new Sprite();
            sprite._tintOverlay.bitmap = new Bitmap(sprite.bitmap.width, sprite.bitmap.height);

            // Fill with the tint color
            const context = sprite._tintOverlay.bitmap._context;
            context.fillStyle = tintData.blendColor;
            context.fillRect(0, 0, sprite.bitmap.width, sprite.bitmap.height);

            // Use additive blending for the tint overlay
            sprite._tintOverlay.blendMode = 1; // Additive blend

            // Add the overlay as a child of the background sprite
            // This ensures the tint only affects the background
            sprite.addChild(sprite._tintOverlay);

            //console.log('Applied time-of-day tint to background:', tintData.blendColor);
        };

        if (sprite.bitmap.isReady()) {
            applyTint();
        } else {
            sprite.bitmap.addLoadListener(applyTint);
        }
    };


    // NEW METHOD: Applies darkening to interior backgrounds
    Spriteset_Battle.prototype.applyInteriorDarkening = function (sprite) {
        if (!sprite || !sprite.bitmap) return;

        const applyDarkening = () => {
            if (!sprite.bitmap || !sprite.bitmap.isReady()) return;

            // Remove any existing darkening overlay
            if (sprite._darkeningOverlay) {
                sprite.removeChild(sprite._darkeningOverlay);
                sprite._darkeningOverlay = null;
            }

            // Create a semi-transparent black overlay
            sprite._darkeningOverlay = new Sprite();
            sprite._darkeningOverlay.bitmap = new Bitmap(sprite.bitmap.width, sprite.bitmap.height);

            // Fill with dark color (black with 40% opacity)
            const context = sprite._darkeningOverlay.bitmap._context;
            context.fillStyle = 'rgba(0, 0, 0, 0.4)';
            context.fillRect(0, 0, sprite.bitmap.width, sprite.bitmap.height);

            // Use multiply blending for natural darkening
            sprite._darkeningOverlay.blendMode = 2; // Multiply blend

            // Add the overlay as a child of the background sprite
            sprite.addChild(sprite._darkeningOverlay);

            //console.log('Applied darkening to interior background');
        };

        if (sprite.bitmap.isReady()) {
            applyDarkening();
        } else {
            sprite.bitmap.addLoadListener(applyDarkening);
        }
    };


    Spriteset_Battle.prototype.alignBattlebackBottom = function (sprite) {
        if (!sprite || !sprite.bitmap) return;

        const alignToBottom = () => {
            if (sprite.bitmap && sprite.bitmap.isReady()) {
                const bitmapHeight = sprite.bitmap.height;
                const bitmapWidth = sprite.bitmap.width;
                const screenHeight = Graphics.height;

                if (bitmapHeight > screenHeight) {
                    const clipAmount = bitmapHeight - screenHeight;
                    sprite.setFrame(0, clipAmount, bitmapWidth, screenHeight);
                    sprite.x = 0;
                    sprite.y = 0;
                } else {
                    sprite.setFrame(0, 0, bitmapWidth, bitmapHeight);
                }
            }
        };

        if (sprite.bitmap.isReady()) {
            alignToBottom();
        } else {
            sprite.bitmap.addLoadListener(alignToBottom);
        }
    };

    Spriteset_Battle.prototype.getTimeOfDayTint = function () {
        const timeMode = getCurrentTimeMode();
        return getTintDataForTimeMode(timeMode);
    };




    // Create Animated Background
    Spriteset_Battle.prototype.createAnimatedBackground = function () {
        try {
            this._animatedContainer = new Sprite();
            this._animatedGradientContainer = new Sprite();

            this._animatedGradientContainer.opacity = 255;
            this._animatedGradientContainer.blendMode = 0; // Normal blend for gradient in Biome mode
            this._animatedContainer.opacity = 255; // Full opacity for stars/moon in Biome mode
            this._animatedContainer.blendMode = 0; // Normal blend for biome elements

            const isBiomeMode = ConfigManager.ebBackgrounds === 0;
            const parent = this._back1Sprite?.parent || this._battleField?.parent || this;

            if (isBiomeMode) {
                const backIndex = this._back1Sprite?.parent?.getChildIndex(this._back1Sprite) ?? 0;
                // Gradient behind everything, then stars/moon layer
                parent.addChildAt(this._animatedGradientContainer, backIndex);
                parent.addChildAt(this._animatedContainer, backIndex + 1);
            } else {
                // For trippy mode, use configured blend modes
                this._animatedContainer.opacity = CONFIG.overlayOpacity;
                this._animatedContainer.blendMode = CONFIG.overlayBlendMode;
                this._animatedGradientContainer.blendMode = 1;

                const backIndex = this._back1Sprite?.parent?.getChildIndex(this._back1Sprite) ?? 0;
                parent.addChildAt(this._animatedGradientContainer, backIndex + 1);
                parent.addChildAt(this._animatedContainer, backIndex + 2);
            }

            this._animatedContainer.width = Graphics.width;
            this._animatedContainer.height = Graphics.height;
            this._animatedGradientContainer.width = Graphics.width;
            this._animatedGradientContainer.height = Graphics.height;

            this._animatedBitmap = new Bitmap(Graphics.width, Graphics.height);
            this._gradientBitmap = new Bitmap(Graphics.width, Graphics.height);

            this._animatedSprite = new Sprite(this._animatedBitmap);
            this._gradientSprite = new Sprite(this._gradientBitmap);

            this._animatedContainer.addChild(this._animatedSprite);
            this._animatedGradientContainer.addChild(this._gradientSprite);

            this._animationCount = 0;
            this._frameCount = 0;
            this._lastDrawTime = 0;
            this._asciiDrawnBiome = undefined;

            if (ConfigManager.ebBackgrounds === 0) {
                this.initSkyBackground();
            } else {
                this.initRandomBackground();
            }
        } catch (e) {
            console.error("Error creating Animated background:", e);
        }
    };

    // Biome Background Initialization
    Spriteset_Battle.prototype.initSkyBackground = function () {
        this._bgType = 'sky';
        this._skyInitialized = true;
        // Use game date from TimeDateSystem instead of real date
        this._moonData = calculateMoonPhase(getGameDate());
        this._starAnimationTime = 0;
        this._cloudAnimationTime = 0; // Added this line
        this.drawSkyBackground();
        //console.log("Biome mode initialized - Moon phase:", this._moonData.name);
    };

    // The dithered gradient is expensive: a per-pixel ImageData pass over the
    // whole canvas (~500k iterations at 816x624). It depends only on timeMode,
    // which changes on the order of in-game minutes, so it lives on its own
    // _gradientBitmap and is only repainted when the time mode changes. Stars,
    // moon and clouds are cheap and live on the separate _animatedBitmap, which
    // is the only layer redrawn on the throttled animation tick.
    Spriteset_Battle.prototype.drawSkyStaticGradient = function () {
        const w = this._gradientBitmap.width;
        const h = this._gradientBitmap.height;
        const timeMode = getCurrentTimeMode();
        this._gradientBitmap.clear();
        drawDitheredGradient(this._gradientBitmap._context, w, h, timeMode);
    };

    // Redraws only the cheap animated overlay (stars/moon/clouds). Deliberately
    // does NOT touch _gradientBitmap so the static gradient is preserved.
    Spriteset_Battle.prototype.drawSkyAnimatedLayer = function () {
        const w = this._animatedBitmap.width;
        const h = this._animatedBitmap.height;
        const timeMode = getCurrentTimeMode();

        this._animatedBitmap.clear();
        const context = this._animatedBitmap._context;

        // Night elements
        if (timeMode === CONFIG.TIME_MODES.NIGHT) {
            drawStars(context, w, h, this._starAnimationTime);

            // On an alien planet surface, the sky shows that world's actual
            // satellites: one styled moon per satellite (capped), sized by the
            // moon's radius and tinted to its colour. A moonless world shows an
            // empty sky. Off-planet keeps the classic Earth moon (three on Friday).
            const lp = (window.GalaxySim && window.GalaxySim.getSurfacePlanet)
                ? window.GalaxySim.getSurfacePlanet() : null;
            if (lp) {
                const moons = lp.moons || [];
                const n = Math.min(moons.length, 5);
                const baseY = h * 0.22;
                for (let i = 0; i < n; i++) {
                    const m = moons[i];
                    const t = n === 1 ? 0.5 : i / (n - 1);
                    const mx = w * (0.18 + 0.64 * t);
                    const my = baseY + Math.sin(i * 1.7) * h * 0.07;
                    const radius = Math.max(14, Math.min(60, (m.radius || 0.3) * 90));
                    const seed = (i * 97 + String(m.type || '').length * 13) % 997;
                    drawMoon(context, mx, my, radius, this._moonData, {
                        color: m.color, seed,
                        illumination: 0.45 + 0.5 * ((seed % 100) / 100)
                    });
                }
            } else if (isFriday()) {
                // Three moons on Friday!
                const moonRadius = 35;
                const spacing = 100;
                const centerX = w / 2;
                const baseY = h * 0.25;
                drawMoon(context, centerX - spacing, baseY, moonRadius, this._moonData);
                drawMoon(context, centerX, baseY - 20, moonRadius * 1.3, this._moonData);
                drawMoon(context, centerX + spacing, baseY, moonRadius, this._moonData);
            } else {
                // Single moon
                const moonRadius = 45;
                const moonX = w * 0.75;
                const moonY = h * 0.2;
                drawMoon(context, moonX, moonY, moonRadius, this._moonData);
            }
        }

        // Day, dusk, dawn clouds
        if (timeMode === CONFIG.TIME_MODES.DAY ||
            timeMode === CONFIG.TIME_MODES.DUSK ||
            timeMode === CONFIG.TIME_MODES.DAWN) {
            drawClouds(context, w, h, timeMode, this._cloudAnimationTime);
        }
    };

    // Full repaint of both layers. Used at init and whenever the time mode
    // changes (via updateSkyAnimation's static-redraw branch).
    Spriteset_Battle.prototype.drawSkyBackground = function () {
        this.drawSkyStaticGradient();
        this.drawSkyAnimatedLayer();
    };

    // Random Background Initialization
    Spriteset_Battle.prototype.initRandomBackground = function () {
        this._bgType = CONFIG.PATTERN_TYPES[Math.floor(Math.random() * CONFIG.PATTERN_TYPES.length)];
        this._colorHue1 = Math.floor(Math.random() * 360);
        this._colorHue2 = Math.floor(Math.random() * 360);
        this._colorHue3 = Math.floor(Math.random() * 360);
        this._gradientColorHue1 = Math.floor(Math.random() * 360);
        this._gradientColorHue2 = Math.floor(Math.random() * 360);
        this._gradientRotation = Math.floor(Math.random() * 4) * 45;
        this._gradientSpeed = 0.1 + Math.random() * 0.3;

        this.initPatternProperties(this._bgType);
        //console.log("Random background initialized - Type:", this._bgType);
    };

    Spriteset_Battle.prototype.initPatternProperties = function (bgType) {
        switch (bgType) {
            case 0:
                this._waveAmplitude = 5 + Math.floor(Math.random() * 10);
                this._waveFrequency = 0.02 + Math.random() * 0.03;
                this._waveSpeed = 0.02 + Math.random() * 0.03;
                this._numLines = 12 + Math.floor(Math.random() * 6);
                break;
            case 1:
                this._spiralSegments = 8 + Math.floor(Math.random() * 6);
                this._spiralRotationSpeed = 0.2 + Math.random() * 0.3;
                this._spiralZoom = 0.02 + Math.random() * 0.03;
                break;
            case 2:
                this._arcaneRings = 2 + Math.floor(Math.random() * 2);
                this._arcaneSymbols = 5 + Math.floor(Math.random() * 4);
                this._arcaneRotationSpeed = 0.02 + Math.random() * 0.30;
                break;
            case 3:
                this._checkerSize = 20 + Math.floor(Math.random() * 20);
                this._checkerScrollSpeed = 0.05 + Math.random() * 0.1;
                this._checkerAngle = Math.floor(Math.random() * 4) * 45;
                break;
            case 4:
                this._diamondSize = 30 + Math.floor(Math.random() * 20);
                this._diamondSpeed = 0.02 + Math.random() * 0.03;
                this._diamondWave = 0.005 + Math.random() * 0.01;
                break;
            case 5:
                this._circleCount = 6 + Math.floor(Math.random() * 6);
                this._circlePulseSpeed = 0.01 + Math.random() * 0.02;
                this._circlePulseAmount = 0.2 + Math.random() * 0.3;
                this._circleRotationSpeed = 0.1 + Math.random() * 0.2;
                break;
            case 6:
                this._gridSize = 30 + Math.floor(Math.random() * 30);
                this._gridWaveSpeed = 0.01 + Math.random() * 0.02;
                this._gridWaveIntensity = 5 + Math.floor(Math.random() * 10);
                this._gridLinesOnly = Math.random() > 0.5;
                break;
            case 7:
                this._plaidSize = 20 + Math.floor(Math.random() * 40);
                this._plaidSpeed = 0.5 + Math.random() * 1.0;
                this._plaidRotation = Math.random() * 45;
                this._plaidHorizontalDensity = 1 + Math.floor(Math.random() * 3);
                this._plaidVerticalDensity = 1 + Math.floor(Math.random() * 3);
                break;
            case 8:
                this._kaleidoscopeSegments = 4 + Math.floor(Math.random() * 4) * 2;
                this._kaleidoscopeRotationSpeed = 0.01 + Math.random() * 0.02;
                this._kaleidoscopeScale = 0.5 + Math.random() * 0.5;
                this._kaleidoscopeCircles = 3 + Math.floor(Math.random() * 5);
                break;
            case 9:
                this._dotSize = 4 + Math.floor(Math.random() * 6);
                this._dotDensity = 0.02 + Math.random() * 0.03;
                this._dotSpeed = 0.5 + Math.random() * 1.0;
                break;
            case 10:
                this._waveCount = 3 + Math.floor(Math.random() * 5);
                this._waveThickness = 2 + Math.floor(Math.random() * 3);
                this._waveSpeed = 0.02 + Math.random() * 0.03;
                this._waveAmplitude = 20 + Math.floor(Math.random() * 20);
                break;
            case 11:
                this._crystalSize = 40 + Math.floor(Math.random() * 30);
                this._crystalRotationSpeed = 0.01 + Math.random() * 0.02;
                this._crystalLayers = 2 + Math.floor(Math.random() * 2);
                this._crystalShininess = Math.random() > 0.5;
                break;
        }
    };

    // Update Loop
    const _Spriteset_Battle_update = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function () {
        _Spriteset_Battle_update.call(this);

        // Test mode pattern switcher
        if ($gameTemp.isPlaytest() && Input.isTriggered('pagedown')) {
            this.initRandomBackground();
        }

        if (ConfigManager.ebBackgrounds === 2 && this._animatedContainer && !ConfigManager.asciiModeEnabled) {
            this.removeAnimatedBackground();
        } else if ((ConfigManager.asciiModeEnabled || ConfigManager.ebBackgrounds !== 2) && !this._animatedContainer) {
            this.createAnimatedBackground();
        } else if (ConfigManager.ebBackgrounds !== 2 && this._animatedBitmap) {
            this.updateAnimatedBackground();
        }

        if (this._battleWeatherSprite) {
            // Weather draws nothing unless it is told what to draw; the battle field does
            // not scroll, so the origin stays at zero.
            this._battleWeatherSprite.type = $gameScreen.weatherType();
            this._battleWeatherSprite.power = $gameScreen.weatherPower();
            this._battleWeatherSprite.update();
        }
    };

    Spriteset_Battle.prototype.drawAsciiBackground = function () {
        if (!this._asciiBackgroundDb && !this._asciiBackgroundLoadFailed) {
            if (Utils.isNwjs()) {
                const fs = require('fs');
                const path = require('path');
                const filepath = path.join(process.cwd(), 'js', 'db', 'Sprites', 'ASCIIBackground.json'); // i18n-ignore: file path segments
                if (fs.existsSync(filepath)) {
                    try {
                        this._asciiBackgroundDb = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    } catch (e) {
                        console.error('Failed to parse ASCII Background DB:', e);
                        this._asciiBackgroundLoadFailed = true;
                    }
                } else {
                    this._asciiBackgroundLoadFailed = true;
                }
            } else if (!this._asciiBackgroundFetching) {
                // fetch is async, so guard against re-issuing a new request every
                // frame while the first one is still in flight.
                this._asciiBackgroundFetching = true;
                fetch('js/db/Sprites/ASCIIBackground.json')
                    .then(response => response.json())
                    .then(data => {
                        this._asciiBackgroundDb = data;
                    })
                    .catch(e => console.error('Failed to load ASCII Background DB:', e));
            }
        }

        let biome = null;
        if (this._asciiBackgroundDb) {
            biome = $gameMap.getBiome();
            if (!biome && $gameMap.mapId() === 636 && $gameSystem._procGenData) {
                biome = $gameSystem._procGenData.currentBiome;
            }
            if (!biome) biome = 'Plains'; // i18n-ignore: Biomes.json id
        }

        // The art is static per biome, so skip the redraw unless the biome
        // (or the loaded state) changed since the last draw.
        if (this._asciiDrawnBiome === biome) return;
        this._asciiDrawnBiome = biome;

        const w = this._animatedBitmap.width;
        const h = this._animatedBitmap.height;
        this._animatedBitmap.clear();
        this._gradientBitmap.clear();

        const context = this._animatedBitmap._context;

        context.fillStyle = '#000000';
        context.fillRect(0, 0, w, h);

        if (!this._asciiBackgroundDb) return;

        // i18n-ignore-start: Biomes.json id, keys the ASCII art table
        let asciiArt = this._asciiBackgroundDb[biome] || this._asciiBackgroundDb['Plains'];
        if (!asciiArt || asciiArt.length === 0) {
            asciiArt = this._asciiBackgroundDb['Plains'];
        }
        // i18n-ignore-end
        if (!asciiArt) return;

        context.font = '24px Square';
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'left';
        context.textBaseline = 'top';

        const lineHeight = 24;
        const startX = 0;
        const startY = 0;

        for (let i = 0; i < asciiArt.length; i++) {
            context.fillText(asciiArt[i], startX, startY + i * lineHeight);
        }
    };

    Spriteset_Battle.prototype.updateAnimatedBackground = function () {
        if (!this._animatedBitmap?._context || !this._gradientBitmap?._context) return;

        if (ConfigManager.asciiModeEnabled) {
            this.drawAsciiBackground();
            return;
        }
        // Other modes draw over the bitmap, so force an ASCII redraw if the
        // player switches back to ASCII mode later.
        this._asciiDrawnBiome = undefined;

        if (ConfigManager.ebBackgrounds === 0) {
            const timeMode = getCurrentTimeMode();

            // Check if we need to redraw static elements (time mode changed)
            if (this._lastTimeMode !== timeMode) {
                this._lastTimeMode = timeMode;
                this._needsStaticRedraw = true;
            }

            // Update animated stars in night sky
            if (timeMode === CONFIG.TIME_MODES.NIGHT) {
                this._starAnimationTime = (this._starAnimationTime || 0) + 0.016;
                // Reduced frequency: only update every 6 frames (from 3) - 50% less work
                if (this._frameCount % 6 === 0) {
                    this.updateSkyAnimation();
                }
            }
            // Update animated clouds during day/dusk/dawn
            else if (timeMode === CONFIG.TIME_MODES.DAY ||
                timeMode === CONFIG.TIME_MODES.DUSK ||
                timeMode === CONFIG.TIME_MODES.DAWN) {
                this._cloudAnimationTime = (this._cloudAnimationTime || 0) + 0.016;
                // Reduced frequency: only update every 4 frames (from 2) - 50% less work
                if (this._frameCount % 4 === 0) {
                    this.updateSkyAnimation();
                }
            }

            this._frameCount++;
            return;
        }

        // Trippy mode
        this._animationCount += CONFIG.speedMultiplier;
        this._frameCount++;

        const drawInterval = this.getDrawInterval();

        if (this._frameCount % drawInterval === 0) {
            if (this._frameCount % (drawInterval * 2) === 0) {
                this.drawGradient();
            }
            this._animatedBitmap.clear();
            this.drawPattern(this._bgType);
        }
    };

    Spriteset_Battle.prototype.updateSkyAnimation = function () {
        // Only redraw static elements if needed (time mode changed)
        if (this._needsStaticRedraw) {
            this.drawSkyBackground();
            this._needsStaticRedraw = false;
        } else {
            // Only update animated elements (stars/clouds) without full redraw
            this.updateSkyAnimatedElements();
        }
    };

    Spriteset_Battle.prototype.updateSkyAnimatedElements = function () {
        // Only redraw the cheap star/cloud/moon overlay; the expensive static
        // dithered gradient on _gradientBitmap is left untouched (it is only
        // repainted on a time-mode change via the _needsStaticRedraw branch).
        this.drawSkyAnimatedLayer();
    };

    Spriteset_Battle.prototype.removeAnimatedBackground = function () {
        if (this._animatedContainer?.parent) {
            this._animatedContainer.parent.removeChild(this._animatedContainer);
        }
        if (this._animatedGradientContainer?.parent) {
            this._animatedGradientContainer.parent.removeChild(this._animatedGradientContainer);
        }

        this._animatedContainer = null;
        this._animatedGradientContainer = null;
        this._animatedBitmap = null;
        this._gradientBitmap = null;
        this._skyInitialized = false;
    };

    Spriteset_Battle.prototype.getDrawInterval = function () {
        // Minimum interval of 2 (30Hz pattern animation) - redrawing these
        // full-canvas patterns every single frame was pure churn for no visible
        // gain. Slower patterns keep their higher intervals.
        const intervals = {
            0: 2, 1: 2, 5: 2, 8: 2, 12: 2, 13: 2,
            2: 2, 4: 2, 6: 2, 10: 2, 11: 2, 14: 2,
            3: 3, 7: 3, 9: 3
        };
        return intervals[this._bgType] || 2;
    };

    Spriteset_Battle.prototype.drawPattern = function (bgType) {
        this._currentBitmap = this._animatedBitmap;
        this._currentContext = this._animatedBitmap._context;
        this._currentContext.imageSmoothingEnabled = false;

        const patterns = {
            0: 'drawWavyLines',
            1: 'drawSpiral',
            2: 'drawArcaneSeal',
            3: 'drawCheckerboard',
            4: 'drawDiamondPattern',
            5: 'drawConcentricCircles',
            6: 'drawFlowingGrid',
            7: 'drawPlaids',
            8: 'drawKaleidoscope',
            9: 'drawFlowingDots',
            10: 'drawEnergyWaves',
            11: 'drawCrystalLattice',
            12: 'drawRGBGlitch',
            13: 'drawNebulaSwirl',
            14: 'drawWarpTunnel'
        };

        const method = patterns[bgType] || 'drawWavyLines';
        if (this[method]) this[method]();
    };

    Spriteset_Battle.prototype.drawGradient = function () {
        const w = this._gradientBitmap.width;
        const h = this._gradientBitmap.height;
        const context = this._gradientBitmap._context;

        this._gradientBitmap.clear();

        const hue1 = (this._gradientColorHue1 + this._animationCount * this._gradientSpeed) % 360;
        const hue2 = (this._gradientColorHue2 + this._animationCount * this._gradientSpeed * 0.7) % 360;

        const angle = this._gradientRotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const gradient = context.createLinearGradient(
            w / 2 - cos * w / 2, h / 2 - sin * h / 2,
            w / 2 + cos * w / 2, h / 2 + sin * h / 2
        );

        gradient.addColorStop(0, hueToColor(hue1, 1, 30));
        gradient.addColorStop(1, hueToColor(hue2, 1, 30));

        context.fillStyle = gradient;
        context.fillRect(0, 0, w, h);
    };

    Spriteset_Battle.prototype.hueToColor = function (hue, alpha, lightness) {
        return hueToColor(hue, alpha, lightness);
    };

    // =============================================================================
    // Config Manager
    // =============================================================================

    ConfigManager.ebBackgrounds = CONFIG.defaultMode;
    // When true, biome battle backgrounds are randomized (a random biome) for
    // every battle instead of following the current map.
    ConfigManager.ebRandomBiome = false;

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData.call(this);
        config.ebBackgrounds = this.ebBackgrounds;
        config.ebRandomBiome = this.ebRandomBiome;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData.call(this, config);
        this.ebBackgrounds = config.ebBackgrounds !== undefined
            ? Number(config.ebBackgrounds)
            : CONFIG.defaultMode;
        this.ebRandomBiome = config.ebRandomBiome !== undefined
            ? !!config.ebRandomBiome
            : false;
    };

    // =============================================================================
    // Window_Options
    // =============================================================================

    if (window.GameOptions) {
        window.GameOptions.registerOption('ebBackgrounds', CONFIG.optionName,
            () => ConfigManager.ebBackgrounds,
            function(value) {
                ConfigManager.ebBackgrounds = value;
                ConfigManager.save();
            },
            'video', 'custom',
            function(value) {
                const modes = T.list('Battle.option.backgroundModes');
                return modes[value] || modes[0];
            },
            function() {
                const value = (ConfigManager.ebBackgrounds + 1) % 3;
                ConfigManager.ebBackgrounds = value;
                ConfigManager.save();
            },
            function() {
                const value = (ConfigManager.ebBackgrounds + 2) % 3;
                ConfigManager.ebBackgrounds = value;
                ConfigManager.save();
            }
        );
        // Random Battle BG has no option row: the battleback always follows the
        // current map's biome. ConfigManager.ebRandomBiome stays as a stored
        // flag (default off) for the renderer below.
    } else {
        const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
        Window_Options.prototype.addGeneralOptions = function () {
            _Window_Options_addGeneralOptions.call(this);
            this.addCommand(CONFIG.optionName, 'ebBackgrounds');
        };

        const _Window_Options_statusText = Window_Options.prototype.statusText;
        Window_Options.prototype.statusText = function (index) {
            const symbol = this.commandSymbol(index);
            if (symbol === 'ebBackgrounds') {
                const modes = T.list('Battle.option.backgroundModes');
                return modes[this.getConfigValue(symbol)] || modes[0];
            }
            return _Window_Options_statusText.call(this, index);
        };

        const _Window_Options_processOk = Window_Options.prototype.processOk;
        Window_Options.prototype.processOk = function () {
            const symbol = this.commandSymbol(this.index());
            if (symbol === 'ebBackgrounds') {
                const value = (this.getConfigValue(symbol) + 1) % 3;
                this.changeValue(symbol, value);
            } else {
                _Window_Options_processOk.call(this);
            }
        };

        const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
        Window_Options.prototype.cursorRight = function (wrap) {
            const symbol = this.commandSymbol(this.index());
            if (symbol === 'ebBackgrounds') {
                const value = (this.getConfigValue(symbol) + 1) % 3;
                this.changeValue(symbol, value);
            } else {
                _Window_Options_cursorRight.call(this, wrap);
            }
        };

        const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
        Window_Options.prototype.cursorLeft = function (wrap) {
            const symbol = this.commandSymbol(this.index());
            if (symbol === 'ebBackgrounds') {
                const value = (this.getConfigValue(symbol) + 2) % 3;
                this.changeValue(symbol, value);
            } else {
                _Window_Options_cursorLeft.call(this, wrap);
            }
        };
    }

    // =============================================================================
    // WeatherSystem BGS compatibility, keep channel 4 audio at reduced volume
    // during battle, and restore it when battle ends.
    // =============================================================================

    const _Scene_Battle_create = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function () {
        _Scene_Battle_create.call(this);
        // Ducking is asked of WeatherAudio as a factor, so the level still comes
        // from the Weather Volume option (a copy of the buffer would lose its
        // prototype accessors and land a pitch of 0 on the channel).
        if (window.WeatherAudio && window.WeatherAudio.duck) {
            window.WeatherAudio.duck(0.55);
        }
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function () {
        _Scene_Battle_terminate.call(this);
        if (window.WeatherAudio && window.WeatherAudio.restore) {
            window.WeatherAudio.restore();
        }
        if (typeof $gameWeather !== 'undefined' && $gameWeather &&
            typeof $gameWeather.updateEnvironmentBgs === 'function') {
            $gameWeather.updateEnvironmentBgs();
        }
    };

})();