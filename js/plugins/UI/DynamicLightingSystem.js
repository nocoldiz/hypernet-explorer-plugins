/*:
 * @target MZ
 * @plugindesc Dynamic Lighting System v1.2.0
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Dynamic Lighting System Plugin for RPG Maker MZ
 * ============================================================================
 * * v1.2.0: Added compatibility with WeatherSystem.js manual time modes.
 * * This plugin creates a dynamic lighting system that works with the Weather
 * System plugin. Lights are automatically controlled based on time of day.
 * * Setup Instructions:
 * 1. Create a folder called "lights" in your img folder
 * 2. Add light images (e.g., light.png, tungsten.png, flashlight.png, etc.)
 * 3. Name events as "Light", "Streetlight", or "Daylight"
 * * Event Names:
 * - Light: Always active
 * - Streetlight: Active during dusk and night (18:00-06:00)
 * - Daylight: Active during sunrise and day (06:00-18:00)
 * * Event Notes:
 * You can customize lights by adding notes to events:
 * - <lightFile:filename> - Use a specific image file (without .png)
 * - <lightScale:0.5> - Scale the light (default 1.0)
 * - <lightOpacity:200> - Set opacity (0-255, default 255)
 * - <lightOffsetX:10> - Horizontal offset in pixels
 * - <lightOffsetY:-20> - Vertical offset in pixels
 * * Shorthand format also supported:
 * - "tungsten 0.4" - Uses tungsten.png at 0.4 scale
 * - "candle 0.8 150" - Uses candle.png at 0.8 scale with 150 opacity
 * * Flashlight Commands:
 * - Use "Add Player Light" command to give the player a flashlight
 * - Use "Remove Player Light" command to remove the player's flashlight
 * - The flashlight automatically rotates based on player direction
 * * @param defaultLightFile
 * @text Default Light File
 * @desc Default light image file (without .png extension)
 * @type string
 * @default light
 * * @param defaultScale
 * @text Default Scale
 * @desc Default scale for light images
 * @type number
 * @decimals 2
 * @min 0.1
 * @max 5
 * @default 2
 * * @param lightBlendMode
 * @text Light Blend Mode
 * @desc Blend mode for lights (0=Normal, 1=Add, 2=Multiply, 3=Screen)
 * @type number
 * @min 0
 * @max 3
 * @default 1
 * * @param fadeSpeed
 * @text Fade Speed
 * @desc Speed of light fade in/out (frames)
 * @type number
 * @min 1
 * @max 60
 * @default 30
 * * @param flashlightScale
 * @text Flashlight Scale
 * @desc Default scale for player flashlight
 * @type number
 * @decimals 2
 * @min 0.1
 * @max 5
 * @default 1.5
 * * @param flashlightOpacity
 * @text Flashlight Opacity
 * @desc Default opacity for player flashlight (0-255)
 * @type number
 * @min 0
 * @max 255
 * @default 200
 * * @param enableDebug
 * @text Enable Debug Messages
 * @desc Show debug messages in console
 * @type boolean
 * @default false
 * * @param sunriseHour
 * @text Sunrise Hour
 * @desc Hour when sunrise begins (24-hour format)
 * @type number
 * @min 0
 * @max 23
 * @default 6
 * * @param sunsetHour
 * @text Sunset Hour
 * @desc Hour when sunset begins (24-hour format)
 * @type number
 * @min 0
 * @max 23
 * @default 18
 * * @command refreshLights
 * @text Refresh All Lights
 * @desc Immediately refresh all lights on the current map
 * * @command toggleLight
 * @text Toggle Light
 * @desc Toggle a specific light on/off
 * @arg eventId
 * @text Event ID
 * @desc ID of the event to toggle
 * @type number
 * @min 1
 * @default 1
 * * @command addPlayerLight
 * @text Add Player Light
 * @desc Add a flashlight to the player that follows them
 * * @command removePlayerLight
 * @text Remove Player Light
 * @desc Remove the player's flashlight
 * */

(() => {
    'use strict';

    const pluginName = 'DynamicLightingSystem';
    const parameters = PluginManager.parameters(pluginName);
    const defaultLightFile = parameters['defaultLightFile'] || 'light';
    const defaultScale = Number(parameters['defaultScale'] || 4);
    const lightBlendMode = Number(parameters['lightBlendMode'] || 1);
    const fadeSpeed = Number(parameters['fadeSpeed'] || 30);
    const flashlightScale = Number(parameters['flashlightScale'] || 1.5);
    const flashlightOpacity = Number(parameters['flashlightOpacity'] || 200);
    const enableDebug = parameters['enableDebug'] === 'true';
    const sunriseHour = Number(parameters['sunriseHour'] || 6);
    const sunsetHour = Number(parameters['sunsetHour'] || 18);

    // Streetlights render 30% smaller than other lights (design request).
    const STREETLIGHT_SCALE_FACTOR = 0.7;

    // How often (in frames) a light recomputes its time-of-day visibility.
    // Time of day changes slowly, so recomputing every frame is wasted work;
    // the opacity fade still runs every frame toward the cached target, so the
    // transition stays smooth.
    const VISIBILITY_REFRESH_INTERVAL = 30;

    // Per-frame cache of the WeatherSystem sunlight mode. On streetlight-heavy
    // maps dozens of light sprites query this each frame; resolving it once per
    // frame avoids that redundant work.
    let _cachedSunlightFrame = -1;
    let _cachedSunlightMode = 'full';
    function getSunlightModeCached() {
        const fc = Graphics.frameCount;
        if (fc !== _cachedSunlightFrame) {
            _cachedSunlightFrame = fc;
            _cachedSunlightMode = ($gameWeather && typeof $gameWeather.getSunlightMode === 'function')
                ? $gameWeather.getSunlightMode()
                : 'full';
        }
        return _cachedSunlightMode;
    }

    // ── What a player vehicle hangs at night ────────────────────────────────
    // Keyed by VehicleSystem's own maintenance key
    // (MergedVehicleSystem.riddenVehicleKey), so which vehicle this is is asked
    // of the plugin that owns it rather than re-derived from a sprite or a
    // slot here:
    //
    //   'beams'  the wide pair of beams a road vehicle throws down the road
    //   'beam'   one lamp on the handlebars: a single narrow beam from the
    //            centre, shorter and tighter than a car's
    //   'glow'   no lamp at all, only the standard circle of light the crew
    //            carries. The leader is transparent aboard anything (the
    //            vehicle sprite is drawn in their place), so the circle their
    //            own body would have cast is not drawn: this is it.
    //
    // A vehicle that is absent from this table shows nothing: the Starship
    // does not drive down anything, and a mount carries no lamp.
    const VEHICLE_LAMPS = {
        camper: 'beams',
        car: 'beams',
        bike: 'beam',
        boat: 'glow',
        broom: 'glow'
    };

    // The world map draws a whole province to the tile and every vehicle on it
    // is a map icon, so a beam thrown off one would light up a country. The
    // overlay is already held at zero intensity there (computeTargetIntensity);
    // this is the same answer said where the lamps are chosen.
    const WORLD_MAP_ID = 315;

    // Light types enum
    // i18n-ignore-start  these are the Map636TileEvents keys and the map
    // note-tag names the lighting pass matches, not labels
    const LightTypes = {
        ALWAYS: 'Light',
        STREET: 'Streetlight',
        DAY: 'Daylight'
    };
    // i18n-ignore-end

    // ── Which tiles are a lamp post ─────────────────────────────────────────
    // The tileset already says. Every one of them declares its street lighting
    // as a <Streetlight:> terrain feature, and that declaration is what the
    // procedural generators place the posts from, so reading the same thing here
    // is the only way the two can agree.
    //
    // It used to be a hand-written table of tile ids in Map636TileEvents.json,
    // and it had drifted: its tileset 303 entry named 595 and 889 while the City
    // sheet draws its lamps with 999/1007/1015/1023, so every lamp post in every
    // city stood dark all night. Tileset 300's entry was stale the same way, and
    // 304 and 305 declare lamps but had no entry at all. That table is gone now
    // rather than corrected, because a second list of the same fact is what let
    // it drift in the first place. Memoised per tileset: the answer is static.
    const _featureIdCache = {};
    function featureTileIdsFor(tilesetId, featureName) {
        if (!tilesetId) return null;
        const key = tilesetId + ':' + featureName;
        if (_featureIdCache[key]) return _featureIdCache[key];
        const ids = new Set();
        const U = window.ProcGenUtils;
        if (U && U.Cache && typeof U.Cache.getTilesetFeatures === 'function') {
            const features = U.Cache.getTilesetFeatures(tilesetId) || {};
            for (const variant of features[featureName] || []) {
                if (variant.type === 'single' && variant.tileId) ids.add(variant.tileId);
                else if (variant.grid) {
                    for (const row of variant.grid) for (const t of row) if (t) ids.add(t);
                }
                else if (variant.tiles) {
                    for (const row of variant.tiles) for (const t of row) if (t) ids.add(t);
                }
            }
        }
        _featureIdCache[key] = ids;
        return ids;
    }
    function streetlightTileIdsFor(tilesetId) {
        return featureTileIdsFor(tilesetId, LightTypes.STREET);
    }

    // What a cave lights itself with. The tilesets already declare both as
    // terrain features (<Torch:>, <Mushroom:>) and the cave generator scatters
    // them from the biome feature list, so the same declaration that draws the
    // tile is what lights it - no second table of tile ids to drift.
    // i18n-ignore-start  terrain feature names, not labels
    const CAVE_LIGHT_FEATURES = ['Torch', 'Mushroom', 'MushroomIce'];
    // i18n-ignore-end
    function isDeadWorldNow() {
        return !!(window.WorldManager &&
            (window.WorldManager.isEmptyWorld?.() || window.WorldManager.isDeathWorld?.()));
    }

    // Plugin Commands
    PluginManager.registerCommand(pluginName, 'refreshLights', args => {
        if ($gameLighting) {
            $gameLighting.refreshAllLights();
        }
    });

    PluginManager.registerCommand(pluginName, 'toggleLight', args => {
        const eventId = Number(args.eventId);
        if ($gameLighting && eventId > 0) {
            $gameLighting.toggleLight(eventId);
        }
    });

    PluginManager.registerCommand(pluginName, 'addPlayerLight', args => {
        if ($gameLighting) {
            $gameLighting.addPlayerLight();
            if (enableDebug) {
                console.log('Player flashlight added');
            }
        }
    });

    PluginManager.registerCommand(pluginName, 'removePlayerLight', args => {
        if ($gameLighting) {
            $gameLighting.removePlayerLight();
            if (enableDebug) {
                console.log('Player flashlight removed');
            }
        }
    });

    // Player Light Sprite Class
    class Sprite_PlayerLight extends Sprite {
        constructor(snap = false) {
            super();
            this._snap = snap;
            this.anchor.set(0.5, 0.5);
            this.blendMode = lightBlendMode;
            this._targetOpacity = flashlightOpacity;
            this._fadeSpeed = fadeSpeed;
            this._lastDirection = $gamePlayer.direction();
            this.initMembers();
        }

        initMembers() {
            this.loadBitmap();
            this.updatePosition();
            this.updateRotation();
            // Faded out when the light is first acquired, already burning when
            // the sprite is only being rebuilt with the scene.
            this.opacity = this._snap ? this._targetOpacity : 0;
        }

        loadBitmap() {
            this.bitmap = ImageManager.loadBitmap('img/lights/', 'flashlight');
            this.scale.set(flashlightScale);

            this.bitmap.addLoadListener(() => {
                if (enableDebug) {
                    console.log('Loaded flashlight image');
                }
            });
        }

        updatePosition() {
            if (!$gamePlayer) return;

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();

            this.x = $gamePlayer.screenX();
            this.y = $gamePlayer.screenY() - th / 2;
        }

        updateRotation() {
            if (!$gamePlayer) return;

            const direction = $gamePlayer.direction();

            // Only update rotation if direction changed
            if (direction !== this._lastDirection) {
                this._lastDirection = direction;

                // Set rotation based on direction
                switch (direction) {
                    case 2: // Down
                        this.rotation = 0;
                        break;
                    case 4: // Left  
                        this.rotation = -Math.PI / 2;
                        break;
                    case 6: // Right
                        this.rotation = Math.PI / 2;
                        break;
                    case 8: // Up
                        this.rotation = Math.PI;
                        break;
                }

                if (enableDebug) {
                    console.log(`Flashlight rotated for direction: ${direction}, rotation: ${this.rotation}`);
                }
            }
        }

        update() {
            super.update();
            this.updatePosition();
            this.updateRotation();
            this.updateOpacity();
        }

        updateOpacity() {
            // Smooth fade transition
            if (this.opacity < this._targetOpacity) {
                this.opacity = Math.min(this.opacity + (255 / this._fadeSpeed), this._targetOpacity);
            } else if (this.opacity > this._targetOpacity) {
                this.opacity = Math.max(this.opacity - (255 / this._fadeSpeed), this._targetOpacity);
            }
        }

        fadeOut() {
            this._targetOpacity = 0;
        }

        fadeIn() {
            this._targetOpacity = flashlightOpacity;
        }
    }

    // Light Sprite Class
    class Sprite_Light extends Sprite {
        constructor(event) {
            super();
            this._event = event;
            this._lightType = null;
            this._lightConfig = {};
            this._targetOpacity = 0;
            this._fadeSpeed = fadeSpeed;
            this.anchor.set(0.5, 0.5);
            this.blendMode = lightBlendMode;
            this._manuallyDisabled = false;
            // Stagger the first throttled visibility recompute so a screenful of
            // lights doesn't all recompute on the same frame.
            this._visCheck = 1 + Math.floor(Math.random() * VISIBILITY_REFRESH_INTERVAL);
            this.initMembers();
        }

        initMembers() {
            if (!this._event || typeof this._event.event !== 'function') {
                if (enableDebug) {
                    console.warn('Invalid event passed to Sprite_Light constructor:', this._event);
                }
                return;
            }

            this.parseLightType();
            this.parseLightConfig();
            this.loadBitmap();
            this.updatePosition();
            this.updateVisibility();
            // Lights are rebuilt with the scene, so they start at the brightness
            // they had rather than fading in again every time the menu closes.
            this.opacity = this._targetOpacity;
        }

        parseLightType() {
            if (!this._event || typeof this._event.event !== 'function') {
                return;
            }

            const eventData = this._event.event();
            if (!eventData || !eventData.name) {
                return;
            }

            const eventName = eventData.name;
            if (eventName === LightTypes.ALWAYS) {
                this._lightType = LightTypes.ALWAYS;
            } else if (eventName === LightTypes.STREET) {
                this._lightType = LightTypes.STREET;
            } else if (eventName === LightTypes.DAY) {
                this._lightType = LightTypes.DAY;
            }
        }

        parseLightConfig() {
            if (!this._event || typeof this._event.event !== 'function') {
                return;
            }

            const event = this._event.event();
            if (!event) {
                return;
            }

            const note = event.note || '';

            this._lightConfig = {
                file: defaultLightFile,
                scale: defaultScale,
                opacity: 200,
                offsetX: 0,
                offsetY: 0
            };

            // Parse tag format
            const fileMatch = note.match(/<lightFile:(\w+)>/i);
            if (fileMatch) {
                this._lightConfig.file = fileMatch[1];
            }

            const scaleMatch = note.match(/<lightScale:([\d.]+)>/i);
            if (scaleMatch) {
                this._lightConfig.scale = parseFloat(scaleMatch[1]);
            }

            const opacityMatch = note.match(/<lightOpacity:(\d+)>/i);
            if (opacityMatch) {
                this._lightConfig.opacity = parseInt(opacityMatch[1]);
            }

            const offsetXMatch = note.match(/<lightOffsetX:([-\d]+)>/i);
            if (offsetXMatch) {
                this._lightConfig.offsetX = parseInt(offsetXMatch[1]);
            }

            const offsetYMatch = note.match(/<lightOffsetY:([-\d]+)>/i);
            if (offsetYMatch) {
                this._lightConfig.offsetY = parseInt(offsetYMatch[1]);
            }

            // Parse shorthand format
            const shorthandMatch = note.match(/^(\w+)\s+([\d.]+)(?:\s+(\d+))?$/);
            if (shorthandMatch) {
                this._lightConfig.file = shorthandMatch[1];
                this._lightConfig.scale = parseFloat(shorthandMatch[2]);
                if (shorthandMatch[3]) {
                    this._lightConfig.opacity = parseInt(shorthandMatch[3]);
                }
            }

            if (enableDebug) {
                console.log(`Light Config for Event ${this._event.eventId()}:`, this._lightConfig);
            }
        }

        loadBitmap() {
            const filename = `img/lights/${this._lightConfig.file}.png`;
            this.bitmap = ImageManager.loadBitmap('img/lights/', this._lightConfig.file);
            const scale = this._lightType === LightTypes.STREET
                ? this._lightConfig.scale * STREETLIGHT_SCALE_FACTOR
                : this._lightConfig.scale;
            this.scale.set(scale);

            this.bitmap.addLoadListener(() => {
                if (enableDebug) {
                    console.log(`Loaded light image: ${filename}`);
                }
            });
        }

        updatePosition() {
            if (!this._event || typeof this._event.screenX !== 'function') {
                return;
            }

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();

            this.x = this._event.screenX() + this._lightConfig.offsetX;
            this.y = this._event.screenY() - th / 2 + this._lightConfig.offsetY;
        }

        updateVisibility() {
            if (this._manuallyDisabled) {
                this._targetOpacity = 0;
                return;
            }

            // In empty world or death world, automated lights start off
            const isDeadWorld = !!(window.WorldManager && (window.WorldManager.isEmptyWorld?.() || window.WorldManager.isDeathWorld?.()));
            if (isDeadWorld && this._lightType !== LightTypes.ALWAYS) {
                this._targetOpacity = 0;
                return;
            }

            // Get the sunlight mode from WeatherSystem.js, default to 'full' if not available.
            const sunlightMode = getSunlightModeCached();

            let shouldBeVisible = false;

            switch (sunlightMode) {
                case 'day':
                    // Day Only mode: Only 'Daylight' and 'Light' are on.
                    if (this._lightType === LightTypes.DAY || this._lightType === LightTypes.ALWAYS) {
                        shouldBeVisible = true;
                    }
                    break;

                case 'night':
                case 'dusk':
                    // Night/Dusk Only mode: Only 'Streetlight' and 'Light' are on.
                    if (this._lightType === LightTypes.STREET || this._lightType === LightTypes.ALWAYS) {
                        shouldBeVisible = true;
                    }
                    break;

                case 'full':
                default:
                    // Full Cycle mode: Use the original time-based logic.
                    const currentHour = this.getCurrentHour();
                    switch (this._lightType) {
                        case LightTypes.ALWAYS:
                            shouldBeVisible = true;
                            break;
                        case LightTypes.STREET:
                            shouldBeVisible = currentHour >= sunsetHour || currentHour < sunriseHour;
                            break;
                        case LightTypes.DAY:
                            shouldBeVisible = currentHour >= sunriseHour && currentHour < sunsetHour;
                            break;
                    }
                    break;
            }

            this._targetOpacity = shouldBeVisible ? this._lightConfig.opacity : 0;
        }

        getCurrentHour() {
            // This function is now only used for 'full' cycle mode.
            if ($gameWeather && $gameWeather.currentHour !== undefined) {
                return $gameWeather.currentHour;
            }

            if ($gameVariables) {
                const hour = $gameVariables.value(23);
                if (hour >= 0 && hour <= 23) {
                    return hour;
                }
            }

            return 12; // Default to noon if no time source is found
        }

        update() {
            super.update();

            if (!this._event || typeof this._event.screenX !== 'function') {
                return;
            }

            this.updatePosition();
            if (--this._visCheck <= 0) {
                this.updateVisibility();
                this._visCheck = VISIBILITY_REFRESH_INTERVAL;
            }
            this.updateOpacity();
        }

        updateOpacity() {
            if (this.opacity < this._targetOpacity) {
                this.opacity = Math.min(this.opacity + (255 / this._fadeSpeed), this._targetOpacity);
            } else if (this.opacity > this._targetOpacity) {
                this.opacity = Math.max(this.opacity - (255 / this._fadeSpeed), this._targetOpacity);
            }
        }

        toggle() {
            this._manuallyDisabled = !this._manuallyDisabled;
            this.updateVisibility();
        }

        refresh() {
            if (!this._event || typeof this._event.event !== 'function') {
                return;
            }

            this.parseLightConfig();
            this.loadBitmap();
            this.updateVisibility();
        }
    }

    // Tile-based Light Class (for map 636 streetlight tiles)
    class Sprite_TileLight extends Sprite {
        constructor(x, y, tileId) {
            super();
            this._tileX = x;
            this._tileY = y;
            this._tileId = tileId;
            this._lightType = LightTypes.STREET;
            this._lightConfig = {
                file: defaultLightFile,
                scale: defaultScale,
                opacity: 200,
                offsetX: 0,
                offsetY: 0
            };
            this._targetOpacity = 0;
            this._fadeSpeed = fadeSpeed;
            this.anchor.set(0.5, 0.5);
            this.blendMode = lightBlendMode;
            this._manuallyDisabled = false;
            // Stagger the first throttled visibility recompute (see Sprite_Light).
            this._visCheck = 1 + Math.floor(Math.random() * VISIBILITY_REFRESH_INTERVAL);
            this.initMembers();
        }

        initMembers() {
            this.loadBitmap();
            this.updatePosition();
            this.updateVisibility();
            this.opacity = this._targetOpacity;
        }

        loadBitmap() {
            this.bitmap = ImageManager.loadBitmap('img/lights/', this._lightConfig.file);
            // Tile lights are always streetlights, so apply the streetlight shrink.
            this.scale.set(this._lightConfig.scale * STREETLIGHT_SCALE_FACTOR);

        }

        updatePosition() {
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();

            this.x = ($gameMap.adjustX(this._tileX) + 0.5) * tw;
            this.y = ($gameMap.adjustY(this._tileY) + 0.5) * th;
        }

        updateVisibility() {
            if (this._manuallyDisabled) {
                this._targetOpacity = 0;
                return;
            }

            // Player-toggled ad hoc lights (Torch/Candle) stay on regardless of
            // time of day - only the streetlight-scan default (LightTypes.STREET)
            // follows the sunset/sunrise schedule below.
            if (this._lightType === LightTypes.ALWAYS) {
                this._targetOpacity = this._lightConfig.opacity;
                return;
            }

            // In empty world or death world, streetlights start off
            const isDeadWorld = !!(window.WorldManager && (window.WorldManager.isEmptyWorld?.() || window.WorldManager.isDeathWorld?.()));
            if (isDeadWorld) {
                this._targetOpacity = 0;
                return;
            }

            // Get the sunlight mode from WeatherSystem.js, default to 'full' if not available.
            const sunlightMode = getSunlightModeCached();

            let shouldBeVisible = false;

            switch (sunlightMode) {
                case 'day':
                    // Day Only mode: Streetlights are off during day
                    shouldBeVisible = false;
                    break;

                case 'night':
                case 'dusk':
                    // Night/Dusk Only mode: Streetlights are on
                    shouldBeVisible = true;
                    break;

                case 'full':
                default:
                    // Full Cycle mode: Use the original time-based logic.
                    const currentHour = this.getCurrentHour();
                    shouldBeVisible = currentHour >= sunsetHour || currentHour < sunriseHour;
                    break;
            }

            this._targetOpacity = shouldBeVisible ? this._lightConfig.opacity : 0;
        }

        getCurrentHour() {
            if ($gameWeather && $gameWeather.currentHour !== undefined) {
                return $gameWeather.currentHour;
            }

            if ($gameVariables) {
                const hour = $gameVariables.value(23);
                if (hour >= 0 && hour <= 23) {
                    return hour;
                }
            }

            return 12; // Default to noon if no time source is found
        }

        update() {
            super.update();
            this.updatePosition();
            if (--this._visCheck <= 0) {
                this.updateVisibility();
                this._visCheck = VISIBILITY_REFRESH_INTERVAL;
            }
            this.updateOpacity();
        }

        updateOpacity() {
            if (this.opacity < this._targetOpacity) {
                this.opacity = Math.min(this.opacity + (255 / this._fadeSpeed), this._targetOpacity);
            } else if (this.opacity > this._targetOpacity) {
                this.opacity = Math.max(this.opacity - (255 / this._fadeSpeed), this._targetOpacity);
            }
        }

        refresh() {
            this.loadBitmap();
            this.updateVisibility();
        }
    }

    // Lighting Layer Class
    class Spriteset_Lighting extends Sprite {
        constructor() {
            super();
            this._lightSprites = [];
            this._playerLight = null;
            this.createLights();
        }

        createLights() {
            // Clear existing lights
            this.removeChildren();
            this._lightSprites = [];
            this._playerLight = null;

            if (!$gameMap || typeof $gameMap.events !== 'function') {
                if (enableDebug) {
                    console.warn('$gameMap or events method not available');
                }
                return;
            }

            const events = $gameMap.events();
            if (!Array.isArray(events)) {
                if (enableDebug) {
                    console.warn('$gameMap.events() did not return an array');
                }
                return;
            }

            events.forEach(event => {
                if (!event || typeof event.event !== 'function') {
                    if (enableDebug) {
                        console.warn('Invalid event found in events array:', event);
                    }
                    return;
                }

                if (this.isLightEvent(event)) {
                    const lightSprite = new Sprite_Light(event);
                    if (lightSprite._lightType) {
                        this._lightSprites.push(lightSprite);
                        this.addChild(lightSprite);

                        if (enableDebug) {
                            console.log(`Created light for event ${event.eventId()}: ${event.event().name}`);
                        }
                    }
                }
            });

            // Create tile-based lights for map 636
            if ($gameMap.mapId() === 636) {
                this.createTileLights();
                this.createAdHocLights();
            }

            // Recreate player light if it should exist
            if ($gameLighting && $gameLighting.hasPlayerLight()) {
                this.createPlayerLight(true);
            }
        }

        // The lamp posts standing on the map. There is no biome test any more:
        // the old one read $gameSystem._procGenData.currentBiomeName, a property
        // nothing ever writes (the generators write `currentBiome`), so it was
        // always null and the gate never ran. Correcting the name would have
        // made it start refusing every biome outside its four-word list, which
        // is the wrong question anyway - a lamp post that has been placed is a
        // lamp post, whether the generator put it on a city street or a prefab
        // dropped it on a farm track. The tiles decide.
        createTileLights() {
            const currentTileset = $gameMap.tileset();
            const tilesetId = currentTileset ? currentTileset.id : 0;
            const streetlightTileIds = streetlightTileIdsFor(tilesetId);
            if (!streetlightTileIds || !streetlightTileIds.size) {
                return;
            }

            const width = $gameMap.width();
            const height = $gameMap.height();
            const isLamp = (x, y) => {
                if (x < 0 || y < 0 || x >= width || y >= height) return false;
                // Highest layer wins, exactly as the old scan did.
                for (const layer of [4, 3, 2]) {
                    const tileId = $gameMap.tileId(x, y, layer);
                    if (tileId !== 0) return streetlightTileIds.has(tileId);
                }
                return false;
            };

            // A lamp post is drawn as a COLUMN of tiles (tileset 303 declares
            // <Streetlight: [E232],[E240],[E248],[E256]>, four tiles tall), and
            // the light hangs from the head at the top of it. Lighting every
            // matching tile stacked four lamps inside one post and put most of
            // the glow on the pole rather than on the street, so only the top of
            // each run is lit and the rest of the column is skipped.
            let lightsCreated = 0;
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    if (!isLamp(x, y) || isLamp(x, y - 1)) continue;
                    const tileLight = new Sprite_TileLight(x, y, $gameMap.tileId(x, y, 2));
                    this._lightSprites.push(tileLight);
                    this.addChild(tileLight);
                    lightsCreated++;
                }
            }

            if (enableDebug) {
                console.log(`[DynamicLighting] ${lightsCreated} streetlight(s) lit on tileset ${tilesetId}`);
            }
        }

        // Player-toggled lights (Torch/Candle terrain features, see
        // ProceduralTerrainInteractions.js) that live outside the normal
        // event/tileset-streetlight scan above. Persisted state is restored here
        // on every (re)load of map 636; `setAdHocLight` additionally flips one
        // instantly, for the toggle that just happened this visit.
        createAdHocLights() {
            this._adHocLights = {};
            const TD = window.TerrainInteractions;
            if (!TD || typeof TD.getLitTiles !== "function") return;
            for (const t of TD.getLitTiles()) {
                this.setAdHocLight(`${t.x},${t.y}`, t.x, t.y, true, true);
            }
        }

        setAdHocLight(key, x, y, on, snap = false) {
            this._adHocLights = this._adHocLights || {};
            const existing = this._adHocLights[key];
            if (!on) {
                if (existing) {
                    this.removeChild(existing);
                    const idx = this._lightSprites.indexOf(existing);
                    if (idx >= 0) this._lightSprites.splice(idx, 1);
                    delete this._adHocLights[key];
                }
                return;
            }
            if (existing) return; // already lit
            const light = new Sprite_TileLight(x, y, 0);
            light._lightType = LightTypes.ALWAYS; // manually toggled, not time-of-day driven
            light.updateVisibility();
            // A torch just struck flares up; one restored on map load is already lit.
            light.opacity = snap ? light._targetOpacity : 0;
            this._adHocLights[key] = light;
            this._lightSprites.push(light);
            this.addChild(light);
        }

        createPlayerLight(snap = false) {
            if (this._playerLight) {
                this.removeChild(this._playerLight);
            }

            this._playerLight = new Sprite_PlayerLight(snap);
            this.addChild(this._playerLight);

            if (enableDebug) {
                console.log('Created player flashlight');
            }
        }

        removePlayerLight() {
            if (this._playerLight) {
                this._playerLight.fadeOut();
                // Remove after fade completes
                setTimeout(() => {
                    if (this._playerLight) {
                        this.removeChild(this._playerLight);
                        this._playerLight = null;
                    }
                }, fadeSpeed * 16); // Convert frames to milliseconds
            }
        }

        isLightEvent(event) {
            if (!event || typeof event.event !== 'function') {
                return false;
            }

            const eventData = event.event();
            if (!eventData || !eventData.name) {
                return false;
            }

            const eventName = eventData.name;
            return eventName === LightTypes.ALWAYS ||
                eventName === LightTypes.STREET ||
                eventName === LightTypes.DAY;
        }

        update() {
            // Do NOT call super.update(): Sprite's generic child traversal would
            // update every light (including culled ones) and visible lights twice.
            // All children (_lightSprites, _playerLight) are updated exclusively
            // by the culling loop below.
            // Master switch: when Global Lighting is off, hide the whole layer and
            // skip all per-light work.
            if (!ConfigManager.globalLighting) {
                if (this.visible) this.visible = false;
                return;
            }
            if (!this.visible) this.visible = true;
            // Cull off-screen lights: their per-frame work (position, hour-based
            // visibility recompute, opacity fade) and rendering are wasted when
            // they aren't visible. On streetlight-heavy maps (cities, map 636)
            // this is the dominant cost. We hide and skip updating any light whose
            // tile lies outside the camera window (+margin); it resumes the next
            // frame it scrolls back into view.
            const gm = $gameMap;
            const ox = gm.displayX();
            const oy = gm.displayY();
            const maxX = ox + gm.screenTileX();
            const maxY = oy + gm.screenTileY();
            const margin = 2;
            const sprites = this._lightSprites;
            for (let i = 0; i < sprites.length; i++) {
                const s = sprites[i];
                // Resolve the sprite's tile position (tile lights vs event lights).
                let tx, ty;
                if (s._tileX !== undefined) { tx = s._tileX; ty = s._tileY; }
                else if (s._event) { tx = s._event.x; ty = s._event.y; }
                else { s.update(); continue; }

                if (tx < ox - margin || tx > maxX + margin ||
                    ty < oy - margin || ty > maxY + margin) {
                    if (s.visible) s.visible = false;
                    continue;
                }
                if (!s.visible) s.visible = true;
                s.update();
            }
            if (this._playerLight) {
                this._playerLight.update();
            }
        }

        refresh() {
            this._lightSprites.forEach(sprite => sprite.refresh());
        }

        toggleLight(eventId) {
            const sprite = this._lightSprites.find(s => s._event && s._event.eventId() === eventId);
            if (sprite) {
                sprite.toggle();
            }
        }
    }

    // Lighting System Manager
    class Game_LightingSystem {
        constructor() {
            this._enabled = true;
            this._lightingLayer = null;
            this._hasPlayerLight = false;
        }

        setLightingLayer(layer) {
            this._lightingLayer = layer;
        }

        refreshAllLights() {
            if (this._lightingLayer) {
                this._lightingLayer.refresh();
            }
        }

        toggleLight(eventId) {
            if (this._lightingLayer) {
                this._lightingLayer.toggleLight(eventId);
            }
        }

        // Instantly reflects a Torch/Candle toggle on the live map (persistence
        // across visits is handled separately, see Spriteset_Lighting.createAdHocLights).
        setAdHocLight(key, x, y, on, snap = false) {
            if (this._lightingLayer) {
                this._lightingLayer.setAdHocLight(key, x, y, on, snap);
            }
        }

        addPlayerLight() {
            this._hasPlayerLight = true;
            if (this._lightingLayer) {
                this._lightingLayer.createPlayerLight();
            }
        }

        removePlayerLight() {
            this._hasPlayerLight = false;
            if (this._lightingLayer) {
                this._lightingLayer.removePlayerLight();
            }
        }

        hasPlayerLight() {
            return this._hasPlayerLight;
        }

        isEnabled() {
            return this._enabled;
        }

        setEnabled(enabled) {
            this._enabled = enabled;
        }
    }

    // Global lighting system object
    window.$gameLighting = null;

    // Initialize lighting system with game objects
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function () {
        _DataManager_createGameObjects.call(this);
        $gameLighting = new Game_LightingSystem();
    };

    // Save/Load lighting system
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.lighting = {
            _enabled: $gameLighting._enabled,
            _hasPlayerLight: $gameLighting._hasPlayerLight
        };
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        const lightingData = contents.lighting;
        $gameLighting = new Game_LightingSystem();
        if (lightingData) {
            $gameLighting._enabled = lightingData._enabled;
            $gameLighting._hasPlayerLight = lightingData._hasPlayerLight;
        }
    };

    // Dark & Night Lighting Layer (Dark maps, Dungeons, and Time-of-Day Exterior Night Light)
    class Sprite_DungeonLighting extends Sprite {
        constructor() {
            super();
            this._renderScale = 0.5;
            this._canvasWidth = 0;
            this._canvasHeight = 0;
            this._canvas = document.createElement('canvas');
            this._ctx = this._canvas.getContext('2d', { willReadFrequently: false });
            this._texture = PIXI.Texture.from(this._canvas);
            this.texture = this._texture;
            this.scale.set(1 / this._renderScale);
            this.blendMode = PIXI.BLEND_MODES.MULTIPLY;
            this.visible = false;
            this._targetIntensity = 0;
            this._currentIntensity = 0;
            this._fadeSpeed = fadeSpeed || 30;
            this._visCheck = 1;
            // A new sprite is built every time Scene_Map is rebuilt, and closing
            // the menu rebuilds it. Fading up from zero there washed the whole
            // room out for half a second before the dark came back, so the very
            // first frame snaps to whatever the map already is; the fade below
            // is only for the light changing while the map is being played.
            this._snapIntensity = true;
            this._cachedStreetlightDataRef = null;
            this._cachedStreetlightTilesetId = null;
            this._cachedStreetlights = null;
            this._cachedCaveDataRef = null;
            this._cachedCaveTilesetId = null;
            this._cachedCaveLights = null;
            this._resizeCanvas();
        }

        _resizeCanvas() {
            const w = Graphics.width || 816;
            const h = Graphics.height || 624;
            const cw = Math.ceil(w * this._renderScale);
            const ch = Math.ceil(h * this._renderScale);
            if (this._canvasWidth !== cw || this._canvasHeight !== ch) {
                this._canvasWidth = cw;
                this._canvasHeight = ch;
                this._canvas.width = cw;
                this._canvas.height = ch;
                this.scale.set(1 / this._renderScale);
            }
        }

        getCurrentHourFloat() {
            if ($gameVariables) {
                const dateStr = $gameVariables.value(113);
                if (dateStr && typeof dateStr === 'string') {
                    const timePart = dateStr.split(' ')[3];
                    if (timePart) {
                        const parts = timePart.split(':');
                        const h = parseInt(parts[0]);
                        const m = parseInt(parts[1]) || 0;
                        if (h >= 0 && h <= 23) return h + m / 60;
                    }
                }
            }
            if ($gameWeather && $gameWeather.currentHour !== undefined) {
                return $gameWeather.currentHour;
            }
            return 12;
        }

        getNightLightIntensity() {
            const sunlightMode = getSunlightModeCached();
            switch (sunlightMode) {
                case 'night':
                    return 1.0;
                case 'dusk':
                    return 0.5;
                case 'day':
                    return 0.0;
                case 'full':
                default:
                    return this.calcIntensityFromTime();
            }
        }

        calcIntensityFromTime() {
            const t = this.getCurrentHourFloat();
            const fadeWindow = 2;

            const fadeInStart = sunsetHour - 1;
            const fadeInEnd = sunsetHour + 1;
            const fadeOutStart = sunriseHour - 1;
            const fadeOutEnd = sunriseHour + 1;

            if (t >= fadeInEnd || t < fadeOutStart) {
                if (fadeInEnd <= fadeOutStart) {
                    if (t >= fadeInEnd && t < fadeOutStart) return 1.0;
                } else {
                    if (t >= fadeInEnd || t < fadeOutStart) return 1.0;
                }
            }

            if (t >= fadeInStart && t < fadeInEnd) {
                return (t - fadeInStart) / fadeWindow;
            }

            if (t >= fadeOutStart && t < fadeOutEnd) {
                return 1.0 - (t - fadeOutStart) / fadeWindow;
            }

            return 0.0;
        }

        // Which kind of dark this is, because they do not look alike: the sea
        // floor is a near-black blue with the party's lamp shrunk to arm's
        // length, a cave is lit by its own torches and its glowing mushrooms,
        // and everything else keeps the plain dungeon look.
        // i18n-ignore-start  biome ids, not labels
        darkContext() {
            if ($gamePlayer && $gamePlayer._isDiving) return 'seabed';
            const data = $gameSystem && $gameSystem._procGenData;
            const biome = ((data && data.currentBiome) || '').toLowerCase().replace(/[\s_-]+/g, '');
            if (biome === 'seabed') return 'seabed';
            if ($dataMap && $dataMap.note && /<Biome:\s*sea\s*bed\s*>/i.test($dataMap.note)) return 'seabed';
            if (!this.isDarkOrDungeon()) return null;
            if (biome.includes('cave') || biome.includes('cavern') ||
                biome.includes('underdark') || biome.includes('grotto')) return 'cave';
            return 'dark';
        }
        // i18n-ignore-end

        isDarkOrDungeon() {
            if ($dataMap && $dataMap.note && /<Dark>/i.test($dataMap.note)) {
                return true;
            }
            if ($gameWeather && $gameWeather.forcedLighting === 'dark') {
                return true;
            }
            if (typeof window.isProceduralInteriorMap === 'function' && window.isProceduralInteriorMap()) {
                return true;
            }
            if (window.DungeonFloors && typeof window.DungeonFloors.currentFloor === 'function' && window.DungeonFloors.currentFloor() < 0) {
                return true;
            }
            if ($gameVariables && typeof $gameVariables.value(1) === 'number' && $gameVariables.value(1) < 0) {
                return true;
            }
            if ($gameMap && $gameMap.mapId() === 636) {
                const data = $gameSystem && $gameSystem._procGenData;
                if (data) {
                    if (data._dungeonSession && data._dungeonSession.type === "tower") return true;
                    if (data.biomeLayerStack && data.biomeLayerStack.length > 0) return true;
                    if (typeof window.isInteriorBiome === 'function' && window.isInteriorBiome(data.currentBiome)) return true;
                    const b = (data.currentBiome || '').toLowerCase().replace(/[\s_-]+/g, '');
                    if (b === 'seabed') return true;
                    if (b.includes('cave') || b.includes('dungeon') || b.includes('crypt') || b.includes('sewer') || b.includes('cellar') || b.includes('vault') || b.includes('templeinside') || b.includes('caveden')) {
                        return true;
                    }
                }
            }
            return false;
        }

        isInteriorMap() {
            if ($gameWeather && typeof $gameWeather.isInterior !== 'undefined') {
                return $gameWeather.isInterior;
            }
            return $dataMap && $dataMap.note && /<Interior>/i.test($dataMap.note);
        }

        computeTargetIntensity() {
            // Never show in map 315 (World Map)
            if ($gameMap && $gameMap.mapId() === 315) {
                return 0.0;
            }

            // 1. Dark maps, dungeons, crypts, negative floors, the sea floor:
            //    always 100% full dark look
            if (this.darkContext()) {
                return 1.0;
            }

            // 2. Weather forced lighting 'light': force off
            if ($gameWeather && $gameWeather.forcedLighting === 'light') {
                return 0.0;
            }

            // 3. Interior maps without <Dark>: do not show night light
            if (this.isInteriorMap()) {
                return 0.0;
            }

            // 4. Exterior maps: show night light if enabled, scaled by time of day
            if (!ConfigManager.nightLight) {
                return 0.0;
            }

            return this.getNightLightIntensity();
        }

        getFlicker(seed = 0) {
            const f = Graphics.frameCount;
            const f1 = Math.sin(f * 0.08 + seed) * 0.035;
            const f2 = Math.sin(f * 0.19 + seed * 2.7) * 0.025;
            const f3 = Math.sin(f * 0.37 + seed * 5.1) * 0.015;
            return 1.0 + f1 + f2 + f3;
        }

        update() {
            super.update();

            if (--this._visCheck <= 0) {
                this._context = this.darkContext();
                this._nightFactor = this.getNightLightIntensity();
                this._targetIntensity = this.computeTargetIntensity();
                this._visCheck = VISIBILITY_REFRESH_INTERVAL;
            }

            if (this._snapIntensity) {
                this._currentIntensity = this._targetIntensity;
                this._snapIntensity = false;
            }

            // Smooth transition
            const step = 1 / (this._fadeSpeed || 30);
            if (this._currentIntensity < this._targetIntensity) {
                this._currentIntensity = Math.min(this._currentIntensity + step, this._targetIntensity);
            } else if (this._currentIntensity > this._targetIntensity) {
                this._currentIntensity = Math.max(this._currentIntensity - step, this._targetIntensity);
            }

            if (this._currentIntensity <= 0.001) {
                if (this.visible) this.visible = false;
                return;
            }

            if (!this.visible) this.visible = true;
            this.alpha = this._currentIntensity;
            // A full-screen repaint plus a texture upload, and the flicker means
            // it is a fresh one every frame. Below 60fps the engine runs the
            // logic two or three times per drawn frame (window.FrameBudget in
            // Core/ParchmentToast.js), and a repaint on a tick that is not the
            // drawn one is thrown away at full price. The fade above still
            // steps on every tick, so the light comes up at the same speed.
            if (window.FrameBudget && !window.FrameBudget.isPresented()) return;
            this._resizeCanvas();
            this.renderLighting();
        }

        renderLighting() {
            const ctx = this._ctx;
            const cw = this._canvasWidth;
            const ch = this._canvasHeight;
            const s = this._renderScale;

            if (cw <= 0 || ch <= 0) return;

            // 1. Reset composite and fill base ambient dark tone. The sea floor
            //    is a near-black blue rather than the indigo of a dungeon, and a
            //    cave sits between the two.
            const context = this._context || 'dark';
            const isSeabed = context === 'seabed';
            const isCave = context === 'cave';
            // Under water there is no lamp light to speak of, and at night there
            // is not even a surface to let anything down: the party's own glow
            // shrinks to arm's length and the dark closes in.
            const night = isSeabed ? (this._nightFactor || 0) : 0;
            const depthDim = isSeabed ? 0.60 - 0.22 * night : 1.0;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = isSeabed ? '#03080f' : (isCave ? '#191325' : '#221c32');
            ctx.fillRect(0, 0, cw, ch);

            // 2. Radial vignette: smooth darkening towards screen edges and corners
            const cx = cw / 2;
            const cy = ch / 2;
            const maxRadius = Math.hypot(cw, ch) / 2;
            const vigInner = isSeabed ? 0.28 - 0.10 * night : 0.60;
            const vig = ctx.createRadialGradient(cx, cy, maxRadius * vigInner, cx, cy, maxRadius);
            vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vig.addColorStop(0.75, isSeabed ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.35)');
            vig.addColorStop(1.0, isSeabed ? 'rgba(0, 0, 0, 0.98)' : 'rgba(0, 0, 0, 0.88)');
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, cw, ch);

            // 3. Draw light sources with additive blending ('lighter')
            ctx.globalCompositeOperation = 'lighter';

            const th = $gameMap ? $gameMap.tileHeight() : 48;
            const basePartyRadius = 290 * s * depthDim;

            // --- Party Leader ---
            if ($gamePlayer && !$gamePlayer.isTransparent()) {
                const px = $gamePlayer.screenX() * s;
                const py = ($gamePlayer.screenY() - th / 2) * s;
                const flicker = this.getFlicker(1.1);
                this.drawLightCircle(ctx, px, py, basePartyRadius * flicker, 1.0, 'party');
            }

            // --- Followers / Party Members ---
            if ($gamePlayer && $gamePlayer.followers()) {
                const followers = $gamePlayer.followers().data();
                for (let i = 0; i < followers.length; i++) {
                    const f = followers[i];
                    if (f && f.isVisible() && !f.isTransparent()) {
                        const fx = f.screenX() * s;
                        const fy = (f.screenY() - th / 2) * s;
                        if (fx >= -120 && fx <= cw + 120 && fy >= -120 && fy <= ch + 120) {
                            const flicker = this.getFlicker(2.3 + i * 1.7);
                            this.drawLightCircle(ctx, fx, fy, basePartyRadius * flicker, 0.95, 'party');
                        }
                    }
                }
            }

            // --- SplitScreen Player 2 ---
            if (window.SplitScreenManager && window.SplitScreenManager.active) {
                const p2 = typeof window.SplitScreenManager.getP2Event === 'function' ? window.SplitScreenManager.getP2Event() : null;
                if (p2 && !p2.isTransparent && !p2.isTransparent()) {
                    const p2x = p2.screenX() * s;
                    const p2y = (p2.screenY() - th / 2) * s;
                    if (p2x >= -120 && p2x <= cw + 120 && p2y >= -120 && p2y <= ch + 120) {
                        const flicker = this.getFlicker(5.7);
                        this.drawLightCircle(ctx, p2x, p2y, basePartyRadius * flicker, 1.0, 'party');
                    }
                }
            }

            // --- Vehicle Headlights ---
            // A vehicle driving at night throws a beam ahead of itself: the one
            // the party is riding, and every NPC car in traffic (RoadCarAI marks
            // its events with _isRoadCar). Only the vehicles that are actually
            // out on the road, never a parked hull.
            //
            // The party's own lamp is the one its vehicle hangs (VEHICLE_LAMPS),
            // not a car's beam for everything with wheels. It is NOT gated on
            // the leader being drawn: the engine makes them transparent the
            // moment they board anything at all, which is exactly when the
            // headlights are wanted, so every player vehicle used to drive the
            // night road with its lights off.
            const lamp = this.playerVehicleLamp();
            if (lamp) {
                const vx = $gamePlayer.screenX() * s;
                const vy = ($gamePlayer.screenY() - th / 2) * s;
                if (lamp === 'glow') {
                    this.drawLightCircle(ctx, vx, vy, basePartyRadius * this.getFlicker(1.1), 1.0, 'party');
                } else {
                    this.drawHeadlights(ctx, vx, vy, $gamePlayer.direction(), s, lamp === 'beam');
                }
            }
            if ($gameMap && typeof $gameMap.events === 'function') {
                const traffic = $gameMap.events();
                for (let i = 0; i < traffic.length; i++) {
                    const car = traffic[i];
                    if (!car || !car._isRoadCar || car._erased) continue;
                    if (typeof car.isTransparent === 'function' && car.isTransparent()) continue;
                    const cx2 = car.screenX() * s;
                    const cy2 = (car.screenY() - th / 2) * s;
                    if (cx2 < -260 || cx2 > cw + 260 || cy2 < -260 || cy2 > ch + 260) continue;
                    this.drawHeadlights(ctx, cx2, cy2, car.direction(), s);
                }
            }

            // --- Placed Event Lights ---
            if ($gameMap && typeof $gameMap.events === 'function') {
                const events = $gameMap.events();
                for (let i = 0; i < events.length; i++) {
                    const ev = events[i];
                    if (ev && !ev._erased && typeof ev.screenX === 'function') {
                        const evData = ev.event ? ev.event() : null;
                        const name = evData ? evData.name : '';
                        if (name === LightTypes.ALWAYS || name === LightTypes.STREET || name === LightTypes.DAY || (evData && evData.note && /<light/i.test(evData.note))) {
                            const ex = ev.screenX() * s;
                            const ey = (ev.screenY() - th / 2) * s;
                            if (ex >= -150 && ex <= cw + 150 && ey >= -150 && ey <= ch + 150) {
                                const flicker = this.getFlicker(ev.eventId() * 1.3);
                                this.drawLightCircle(ctx, ex, ey, basePartyRadius * 1.25 * flicker, 1.0, 'torch');
                            }
                        }
                    }
                }
            }

            // --- Placed Tile Lights & Streetlights/Torches ---
            // Nothing burns in an empty or dead world: every flame the world
            // lit for itself is out, exactly as the light sprites already have
            // it. The glowing mushrooms of a cave are not a flame and keep
            // shining down there whatever became of the world above.
            const deadWorld = isDeadWorldNow();
            if ($gameMap) {
                const tileset = $gameMap.tileset();
                const tilesetId = tileset ? tileset.id : 0;
                const streetlightTileIds = deadWorld ? null : streetlightTileIdsFor(tilesetId);
                if (streetlightTileIds && streetlightTileIds.size > 0) {
                    const ox = $gameMap.displayX();
                    const oy = $gameMap.displayY();
                    const tw = $gameMap.tileWidth();
                    const minX = Math.floor(ox) - 2;
                    const maxX = Math.ceil(ox + $gameMap.screenTileX()) + 2;
                    const minY = Math.floor(oy) - 2;
                    const maxY = Math.ceil(oy + $gameMap.screenTileY()) + 2;

                    const lamps = this._getStreetlightCoords(tilesetId, streetlightTileIds);
                    for (let i = 0; i < lamps.length; i++) {
                        const pt = lamps[i];
                        if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
                            const lx = ($gameMap.adjustX(pt.x) + 0.5) * tw * s;
                            const ly = ($gameMap.adjustY(pt.y) + 0.5) * th * s;
                            const flicker = this.getFlicker(pt.x * 31 + pt.y * 17);
                            this.drawLightCircle(ctx, lx, ly, basePartyRadius * 1.3 * flicker, 1.0, 'torch');
                        }
                    }
                }

                // --- Cave Torches & Glowing Mushrooms ---
                // The cave generator scatters <Torch:> and <Mushroom:> terrain
                // features across the floor from the biome feature list; here
                // they are what the cave is lit by, the torches burning and the
                // mushrooms giving off their own cold glow.
                if (isCave) {
                    const tw2 = $gameMap.tileWidth();
                    const ox2 = $gameMap.displayX();
                    const oy2 = $gameMap.displayY();
                    const minX2 = Math.max(0, Math.floor(ox2) - 2);
                    const maxX2 = Math.min($gameMap.width(), Math.ceil(ox2 + $gameMap.screenTileX()) + 2);
                    const minY2 = Math.max(0, Math.floor(oy2) - 2);
                    const maxY2 = Math.min($gameMap.height(), Math.ceil(oy2 + $gameMap.screenTileY()) + 2);
                    const caveLights = this._getCaveLightCoords(tilesetId);
                    for (let i = 0; i < caveLights.length; i++) {
                        const cl = caveLights[i];
                        if (cl.isTorch && deadWorld) continue;
                        if (cl.x >= minX2 && cl.x < maxX2 && cl.y >= minY2 && cl.y < maxY2) {
                            const lx = ($gameMap.adjustX(cl.x) + 0.5) * tw2 * s;
                            const ly = ($gameMap.adjustY(cl.y) + 0.5) * th * s;
                            const flicker = this.getFlicker(cl.x * 7 + cl.y * 23);
                            if (cl.isTorch) {
                                this.drawLightCircle(ctx, lx, ly, basePartyRadius * 0.85 * flicker, 1.0, 'torch');
                            } else {
                                // A mushroom pulses slowly instead of guttering.
                                const pulse = 1.0 + Math.sin(Graphics.frameCount * 0.03 + cl.x * 0.7 + cl.y * 1.3) * 0.10;
                                this.drawLightCircle(ctx, lx, ly, basePartyRadius * 0.45 * pulse, 0.85, 'mushroom');
                            }
                        }
                    }
                }

                // --- Ad-Hoc Player-Lit Tiles (Torches/Candles) ---
                const TD = window.TerrainInteractions;
                if (TD && typeof TD.getLitTiles === 'function') {
                    const tw = $gameMap.tileWidth();
                    for (const t of TD.getLitTiles()) {
                        const ax = ($gameMap.adjustX(t.x) + 0.5) * tw * s;
                        const ay = ($gameMap.adjustY(t.y) + 0.5) * th * s;
                        if (ax >= -150 && ax <= cw + 150 && ay >= -150 && ay <= ch + 150) {
                            const flicker = this.getFlicker(t.x * 13 + t.y * 29);
                            this.drawLightCircle(ctx, ax, ay, basePartyRadius * 1.2 * flicker, 1.0, 'torch');
                        }
                    }
                }
            }

            this._texture.update();
        }

        _getStreetlightCoords(tilesetId, streetlightTileIds) {
            const map = $gameMap;
            if (!map || !streetlightTileIds || streetlightTileIds.size === 0) return [];
            const dataRef = map.data ? map.data() : null;
            if (this._cachedStreetlightDataRef === dataRef && this._cachedStreetlightTilesetId === tilesetId && this._cachedStreetlights) {
                return this._cachedStreetlights;
            }
            this._cachedStreetlightDataRef = dataRef;
            this._cachedStreetlightTilesetId = tilesetId;
            const coords = [];
            const mw = typeof map.width === 'function' ? map.width() : 0;
            const mh = typeof map.height === 'function' ? map.height() : 0;
            for (let x = 0; x < mw; x++) {
                for (let y = 0; y < mh; y++) {
                    let isLamp = false;
                    for (const layer of [4, 3, 2]) {
                        const tileId = map.tileId(x, y, layer);
                        if (tileId !== 0 && streetlightTileIds.has(tileId)) {
                            isLamp = true;
                            break;
                        }
                    }
                    if (isLamp) {
                        let aboveIsLamp = false;
                        if (y > 0) {
                            for (const layer of [4, 3, 2]) {
                                const tid = map.tileId(x, y - 1, layer);
                                if (tid !== 0 && streetlightTileIds.has(tid)) {
                                    aboveIsLamp = true;
                                    break;
                                }
                            }
                        }
                        if (!aboveIsLamp) {
                            coords.push({ x, y });
                        }
                    }
                }
            }
            this._cachedStreetlights = coords;
            return coords;
        }

        _getCaveLightCoords(tilesetId) {
            const map = $gameMap;
            if (!map) return [];
            const dataRef = map.data ? map.data() : null;
            if (this._cachedCaveDataRef === dataRef && this._cachedCaveTilesetId === tilesetId && this._cachedCaveLights) {
                return this._cachedCaveLights;
            }
            this._cachedCaveDataRef = dataRef;
            this._cachedCaveTilesetId = tilesetId;
            const coords = [];
            const mw = typeof map.width === 'function' ? map.width() : 0;
            const mh = typeof map.height === 'function' ? map.height() : 0;
            for (const feature of CAVE_LIGHT_FEATURES) {
                const isTorch = feature === 'Torch';
                const ids = featureTileIdsFor(tilesetId, feature);
                if (!ids || !ids.size) continue;
                for (let x = 0; x < mw; x++) {
                    for (let y = 0; y < mh; y++) {
                        let lit = false;
                        for (const layer of [3, 2, 1]) {
                            const tid = map.tileId(x, y, layer);
                            if (tid !== 0 && ids.has(tid)) { lit = true; break; }
                        }
                        if (lit) {
                            coords.push({ x, y, isTorch });
                        }
                    }
                }
            }
            this._cachedCaveLights = coords;
            return coords;
        }

        // Which lamp the vehicle the party is riding hangs, or null when they
        // are on foot, on the world map, or aboard something that carries none.
        // WHICH vehicle it is is VehicleSystem's answer, never re-derived here.
        playerVehicleLamp() {
            if ($gameMap && $gameMap.mapId() === WORLD_MAP_ID) return null;
            if (!$gamePlayer || typeof $gamePlayer.isInVehicle !== 'function') return null;
            if (!$gamePlayer.isInVehicle()) return null;
            const VS = window.MergedVehicleSystem;
            const key = (VS && typeof VS.riddenVehicleKey === 'function') ? VS.riddenVehicleKey() : null;
            return (key && VEHICLE_LAMPS[key]) || null;
        }

        // The beam a vehicle throws in the direction it faces, plus the small
        // pool of spill light under the lamp itself. `single` draws the one
        // central lamp of a bicycle instead of a car's wide pair: the same beam
        // narrowed to a point at the hub, thrown two thirds as far.
        drawHeadlights(ctx, x, y, direction, s, single) {
            const angles = { 2: Math.PI / 2, 4: Math.PI, 6: 0, 8: -Math.PI / 2 };
            const angle = angles[direction];
            if (angle === undefined) return;

            const len = (single ? 190 : 300) * s;
            const nearHalf = (single ? 6 : 22) * s;
            const farHalf = (single ? 58 : 130) * s;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);

            const beam = ctx.createLinearGradient(0, 0, len, 0);
            beam.addColorStop(0.0, 'rgba(255, 250, 225, 0.85)');
            beam.addColorStop(0.35, 'rgba(250, 240, 205, 0.45)');
            beam.addColorStop(0.75, 'rgba(200, 190, 165, 0.16)');
            beam.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = beam;
            ctx.beginPath();
            ctx.moveTo(0, -nearHalf);
            ctx.lineTo(len, -farHalf);
            ctx.lineTo(len, farHalf);
            ctx.lineTo(0, nearHalf);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            this.drawLightCircle(ctx, x, y, (single ? 46 : 70) * s, single ? 0.5 : 0.55, 'torch');
        }

        drawLightCircle(ctx, x, y, radius, intensity = 1.0, type = 'party') {
            if (radius <= 0) return;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
            if (type === 'mushroom') {
                grad.addColorStop(0.0, `rgba(190, 255, 225, ${1.0 * intensity})`);
                grad.addColorStop(0.30, `rgba(120, 225, 200, ${0.80 * intensity})`);
                grad.addColorStop(0.60, `rgba(70, 150, 160, ${0.45 * intensity})`);
                grad.addColorStop(0.85, `rgba(35, 70, 90, ${0.18 * intensity})`);
                grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            } else if (type === 'torch') {
                grad.addColorStop(0.0, `rgba(255, 245, 220, ${1.0 * intensity})`);
                grad.addColorStop(0.30, `rgba(245, 220, 180, ${0.90 * intensity})`);
                grad.addColorStop(0.60, `rgba(180, 140, 120, ${0.60 * intensity})`);
                grad.addColorStop(0.85, `rgba(90, 70, 75, ${0.25 * intensity})`);
                grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            } else {
                grad.addColorStop(0.0, `rgba(255, 250, 240, ${1.0 * intensity})`);
                grad.addColorStop(0.30, `rgba(245, 235, 215, ${0.90 * intensity})`);
                grad.addColorStop(0.60, `rgba(170, 150, 170, ${0.60 * intensity})`);
                grad.addColorStop(0.85, `rgba(85, 75, 95, ${0.25 * intensity})`);
                grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Add lighting layer to map spriteset
    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function () {
        _Spriteset_Map_createLowerLayer.call(this);
        this.createLightingLayer();
        this.createDungeonLightingLayer();
    };

    Spriteset_Map.prototype.createLightingLayer = function () {
        this._lightingLayer = new Spriteset_Lighting();
        const weatherIndex = this.children.indexOf(this._weather);
        if (weatherIndex >= 0) {
            this.addChildAt(this._lightingLayer, weatherIndex);
        } else {
            this.addChild(this._lightingLayer);
        }

        if ($gameLighting) {
            $gameLighting.setLightingLayer(this._lightingLayer);
        }
    };

    Spriteset_Map.prototype.createDungeonLightingLayer = function () {
        this._dungeonLighting = new Sprite_DungeonLighting();
        const weatherIndex = this.children.indexOf(this._weather);
        if (weatherIndex >= 0) {
            this.addChildAt(this._dungeonLighting, weatherIndex);
        } else {
            this.addChild(this._dungeonLighting);
        }
    };

    // Note: _lightingLayer (child of the spriteset) and _nightLight (child of
    // the tilemap) are already updated by the engine's child traversal, so no
    // Spriteset_Map.update alias is needed.

    // Refresh lights when entering a new map
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded.call(this);

        setTimeout(() => {
            if ($gameLighting && this._spriteset && this._spriteset._lightingLayer) {
                this._spriteset._lightingLayer.createLights();

                if (enableDebug) {
                    console.log('Lights refreshed for new map');
                }
            }
        }, 100);
    };

    // Initialize on game start
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function () {
        _Scene_Boot_start.call(this);
        if (!$gameLighting) {
            $gameLighting = new Game_LightingSystem();
        }
    };

    // Start night light as ON on new games
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        _DataManager_setupNewGame.call(this);
        ConfigManager.nightLight = true;
        ConfigManager.globalLighting = true;
        ConfigManager.save();
    };

    // ==========================================================================
    // ConfigManager - Night Light option (default ON). Dynamic lighting is always ON.
    // ==========================================================================
    ConfigManager.nightLight = true;
    ConfigManager.globalLighting = true;

    const _ConfigManager_makeData_lighting = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData_lighting.call(this);
        config.nightLight = this.nightLight;
        return config;
    };

    const _ConfigManager_applyData_lighting = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData_lighting.call(this, config);
        // Forced on, both of them: there is no Options row left to turn them
        // back on with, so an old config that once said off is ignored.
        this.nightLight = true;
        this.globalLighting = true;
    };

    // The night light has no Options row any more: it is always on, like the
    // dynamic lighting itself.

})();