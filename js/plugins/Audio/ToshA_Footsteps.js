/*:
 * @target MZ
 * @plugindesc [v1.2.0] Plays footstep sounds for player and events with customizable settings, terrain tags, region IDs, and procedural terrain features.
 * @author ToshaAngel
 * @version v1.2.0
 * @url https://toshaangel.itch.io/
 * @help
 * ___________          .__              
 * \__    ___/___  _____|  |__ _____     
 *   |    | /  _ \/  ___/  |  \\__  \    
 *   |    |(  <_> )___ \|   Y  \/ __ \_  
 *   |____| \____/____  >___|  (____  /  
 *                    \/     \/     \/   
 *    _____                        .__   
 *   /  _  \   ____    ____   ____ |  |  
 *  /  /_\  \ /    \  / ___\_/ __ \|  |  
 * /    |    \   |  \/ /_/  >  ___/|  |__
 * \____|__  /___|  /\___  / \___  >____/
 *         \/     \//_____/      \/   
 * 
 * This plugin allows you to play footstep sounds for both player and events,
 * with fine-tuned control over terrain tags, region IDs, and various other settings.
 * 
 * === Features ===
 * - Footstep sounds when walking on different terrain tags.
 * - Material sounds from the terrain feature underfoot on the procedural map.
 * - Tileset-specific region ID sound configuration via notes.
 * - Support for multiple sounds for each terrain/region.
 * - Play modes: sequential or random.
 * - Individual volume, pitch, and pan settings for each sound.
 * - Toggle footstep sounds for events.
 * - Automatic synchronization of footstep sounds with character animation.
 * - Ship engine sound management with BGS saving/restoring.
 * - Rain-aware engine sounds (plays Engine_rain when raining).
 * - Proper BGS restoration when exiting vehicles or stopping movement.
 * 
 * === How to Use ===
 * 1. Configure default terrain tag sounds in the plugin parameters.
 * 2. For region-specific sounds, add notes to your Tileset:
 * 
 * <RegionSound: regionId>
 * sounds: sound1, sound2, sound3
 * playMode: sequential
 * volume: 90
 * pitchMin: 90
 * pitchMax: 110
 * pan: 0
 * maxDistance: 5
 * animationFrames: 0, 2
 * </RegionSound>
 * 
 * Example:
 * <RegionSound: 1>
 * sounds: Wood1, Wood2, Wood3
 * playMode: random
 * volume: 85
 * pitchMin: 95
 * pitchMax: 105
 * </RegionSound>
 * 
 * <RegionSound: 2>
 * sounds: Metal1, Metal2
 * playMode: sequential
 * volume: 90
 * </RegionSound>
 * 
 * 3. Paint regions in the map editor where you want custom sounds.
 * 4. Enable or disable event footsteps in plugin parameters.
 * 
 * === Priority System ===
 * 1. Region sounds (from tileset notes).
 * 2. Terrain feature material (see below).
 * 3. Terrain tag sounds (from the plugin parameters).
 * 4. Terrain tag material, for tags the parameters leave unset.
 * If a tile has both a region ID and terrain tag, region sound plays.
 *
 * === Terrain Feature Materials ===
 * Applies to ANY map whose tileset note defines terrain features. Procedurally
 * generated maps get their ground from those features, not from painted terrain
 * tags, and a handful of tilesets serve all of the biomes - so the terrain tag
 * cannot tell snow from sand from pavement, and tags 4 (mountain) and 7 (ice)
 * have no sound configured at all.
 *
 * The tile under the character is therefore traced back to its feature name
 * (via ProcGenUtils), the feature name to a material, and the material to a
 * sound set:
 *
 *   grass  dirt  mud  sand  gravel  stone
 *   concrete  wood  snow  ice  metal  water
 *
 * The topmost layer that names a material wins, so a bridge over water sounds
 * like wood and a bush growing on snow rustles. Unmapped features fall through
 * to the layer below, and finally to the terrain tag. Feature names that are
 * not listed explicitly are matched on substrings (SnowRock -> snow,
 * WoodenFloor -> wood, GrassRock -> grass), so new features usually need no
 * configuration at all.
 *
 * A tileset whose note tags no features is unaffected and keeps using region
 * notes and terrain tags alone.
 *
 * The tables live in js/db/WorldGen/FootstepMaterials.json, which is also read
 * by the tileset feature tagger in tools/ so it can mark which features already
 * have a step sound. If that file is missing the material layer simply stays
 * off. Fields: materials (sounds + per-material mix), defaults, featureMaterials
 * (explicit name -> material, null to opt a name out), materialPatterns
 * (ordered substring rules), overlayMaterials (materials a feature stacked above
 * the ground may impose) and terrainTagMaterials.
 * 
 * === Notes ===
 * - Region IDs range from 1 to 255 (0 is ignored).
 * - Terrain tags range from 0 to 7.
 * - Sound files must be placed in the audio/se folder.
 * - All region sound properties are optional (defaults will be used).
 * - Ship engine sound files should be in audio/bgs folder.
 * 
 * === License ===
 * This plugin can be used in both free and commercial projects.
 * Attribution is not required but appreciated.
 * 
 * @param StepSounds
 * @text Footstep Sound Settings
 * @type struct<StepSound>[]
 * @default []
 * @desc Configure footstep sounds for each terrain tag.
 * 
 * @param EventFootstepsEnabled
 * @text Event Footstep Sounds
 * @type boolean
 * @on Enabled
 * @off Disabled
 * @default true
 * @desc Enable or disable footstep sounds for events by default.
 */

/*~struct~StepSound:
 * @param AreaName
 * @text Area Name
 * @desc The name of the area (for developer reference).
 * @type text
 * @default 
 * 
 * @param TerrainTag
 * @text Terrain Tag
 * @desc The terrain tag number (0 to 7).
 * @type number
 * @min 0
 * @max 7
 * @default 0
 *
 * @param SoundNames
 * @text Sound Names
 * @desc List of sounds that will be played.
 * @type file[]
 * @dir audio/se
 * @require 1
 *
 * @param PlayMode
 * @text Play Mode
 * @desc Choose the play mode for the footstep sounds.
 * @type select
 * @option Sequential
 * @value sequential
 * @option Random
 * @value random
 * @default sequential
 *
 * @param Volume
 * @text Volume
 * @desc The volume of the sound (0-100).
 * @type number
 * @min 0
 * @max 100
 * @default 90
 *
 * @param PitchMin
 * @text Minimum Pitch
 * @desc The minimum pitch value for the sound (50-150).
 * @type number
 * @min 50
 * @max 150
 * @default 90
 *
 * @param PitchMax
 * @text Maximum Pitch
 * @desc The maximum pitch value for the sound (50-150).
 * @type number
 * @min 50
 * @max 150
 * @default 110
 *
 * @param Pan
 * @text Pan
 * @desc The pan of the sound (-100 left, 0 center, 100 right).
 * @type number
 * @min -100
 * @max 100
 * @default 0
 *
 * @param MaxDistance
 * @text Maximum Distance
 * @desc The maximum distance at which event sounds can be heard.
 * @type number
 * @min 1
 * @default 5
 *
 * @param AnimationFrames
 * @text Animation Frames for Sound
 * @desc The animation frames during which the footstep sound plays.
 * @type number[]
 * @min 0
 * @max 2
 * @default ["0","2"]
 */

(() => {
    const pluginName = "ToshA_Footsteps";
    const parameters = PluginManager.parameters(pluginName);

    const stepSounds = JSON.parse(parameters["StepSounds"] || "[]").map((sound) => {
        const parsedSound = JSON.parse(sound);
        return {
            terrainTag: Number(parsedSound.TerrainTag || 0),
            soundNames: JSON.parse(parsedSound.SoundNames || "[]").map(String),
            playMode: String(parsedSound.PlayMode || "sequential"),
            volume: Number(parsedSound.Volume || 90),
            pitchMin: Number(parsedSound.PitchMin || 90),
            pitchMax: Number(parsedSound.PitchMax || 110),
            pan: Number(parsedSound.Pan || 0),
            maxDistance: Number(parsedSound.MaxDistance || 5),
            animationFrames: JSON.parse(parsedSound.AnimationFrames || '["0","2"]').map(Number),
        };
    });

    const eventFootstepsEnabled = parameters["EventFootstepsEnabled"] === "true";

    // ====== Region Sound Cache ======
    let regionSoundCache = {};

    // ========================================================================
    // Terrain feature material footsteps
    // ========================================================================
    // Maps built by the procedural generator get their ground from terrain
    // FEATURES declared in the tileset note (<Snow: A5 104>, <Bridge: [B10,B11]>,
    // ...), not from hand painted terrain tags. The tag is far too coarse to
    // tell snow from sand from pavement - and tags 4 (mountain) and 7 (ice)
    // carry no configured sound at all, which left a large part of every cold
    // and mountainous map silent.
    //
    // So wherever the tileset note defines features, the tile under the
    // character is resolved back to its feature name, the feature name to a
    // material, and the material to a sound set. A tileset with no feature tags
    // is untouched and keeps using region notes and terrain tags alone.
    //
    // The material tables live in js/db/WorldGen/FootstepMaterials.json
    // (window.WorldGen.FootstepMaterials) so that the tileset feature tagger in
    // tools/ can flag which features already have a step sound without keeping
    // its own copy of this mapping.

    const materialByFeature = new Map();
    const materialConfigs = {};
    let materialTileCache = {};
    let materialData;

    /**
     * The material tables, or null when FootstepMaterials.json is absent - in
     * which case the whole material layer stays off and footsteps behave
     * exactly as they did before it existed.
     */
    function getMaterialData() {
        if (materialData !== undefined) return materialData;
        const raw = window.WorldGen && window.WorldGen.FootstepMaterials;
        if (!raw || !raw.materials) {
            materialData = null;
            return null;
        }
        materialData = {
            defaults: raw.defaults || {},
            materials: raw.materials,
            featureMaterials: raw.featureMaterials || {},
            materialPatterns: raw.materialPatterns || [],
            overlayMaterials: new Set(raw.overlayMaterials || []),
            terrainTagMaterials: raw.terrainTagMaterials || {},
        };
        return materialData;
    }

    /**
     * Material for a feature name: an explicit entry first, then the ordered
     * substring rules. Memoised, since the same handful of names recur on every
     * step.
     */
    function materialForFeature(name) {
        if (!name || name === "Unknown") return null;
        if (materialByFeature.has(name)) return materialByFeature.get(name);

        const data = getMaterialData();
        if (!data) return null;

        // An explicit entry is authoritative, including an explicit null: that
        // is how a name the substring rules would misread opts out entirely.
        let material = null;
        if (Object.prototype.hasOwnProperty.call(data.featureMaterials, name)) {
            material = data.featureMaterials[name];
        } else {
            for (const rule of data.materialPatterns) {
                if ((rule.contains || []).some(n => name.includes(n))) {
                    material = rule.material;
                    break;
                }
            }
        }
        if (material && !data.materials[material]) material = null;
        materialByFeature.set(name, material);
        return material;
    }

    /**
     * tileId -> material for one tileset, built once from the tileset's feature
     * notes. Only tiles that resolve to a material are kept, so an empty table
     * means "this tileset declares no features we have sounds for".
     */
    function materialTableFor(tilesetId) {
        if (materialTileCache[tilesetId]) return materialTileCache[tilesetId];

        const U = window.ProcGenUtils;
        const table = {};
        if (getMaterialData() && U && U.Cache && U.createTileToFeatureMap) {
            const tileToFeature = U.createTileToFeatureMap(U.Cache.getTilesetFeatures(tilesetId));
            for (const tileId of Object.keys(tileToFeature)) {
                const material = materialForFeature(tileToFeature[tileId]);
                if (material) table[tileId] = material;
            }
        }
        table.__empty = Object.keys(table).length === 0;
        materialTileCache[tilesetId] = table;
        return table;
    }

    /**
     * A1-A4 autotiles are laid down shaped: the id on the map is the id of the
     * autotile KIND plus a shape offset of 0-47, while the tileset note records
     * only the kind. Snap back to the kind so a shaped shore or road still
     * resolves. A5 (1536-1663) and the B-E sheets are unshaped and match as-is.
     */
    function materialForTileId(table, tileId) {
        if (!tileId) return null;
        const direct = table[tileId];
        if (direct) return direct;
        if (tileId >= 2048) {
            return table[2048 + Math.floor((tileId - 2048) / 48) * 48] || null;
        }
        return null;
    }

    /**
     * A tile with the star (*) passage flag is drawn OVER the player: a roof
     * edge, a treetop, an archway. It is not underfoot, so it never decides the
     * step sound.
     */
    function isOverheadTile(tileId) {
        const flags = $gameMap.tilesetFlags();
        return !!(tileId && flags && (flags[tileId] & 0x10));
    }

    /**
     * $gameMap.terrainTag with the star tiles left out: the tag of what is
     * actually underfoot at (x, y).
     */
    function groundTerrainTag(x, y) {
        if (!$gameMap.isValid(x, y)) return 0;
        const flags = $gameMap.tilesetFlags();
        for (const tileId of $gameMap.layeredTiles(x, y)) {
            if (isOverheadTile(tileId)) continue;
            const tag = flags[tileId] >> 12;
            if (tag > 0) return tag;
        }
        return 0;
    }

    /**
     * Material underfoot at (x, y): the topmost layer that names one, so a
     * bridge over water sounds like wood and a bush on snow rustles.
     */
    function materialAt(table, x, y) {
        const overlay = getMaterialData().overlayMaterials;
        for (let z = 3; z >= 0; z--) {
            const tileId = $gameMap.tileId(x, y, z);
            if (isOverheadTile(tileId)) continue;
            const material = materialForTileId(table, tileId);
            if (!material) continue;
            // Layers 2 and 3 are scenery; only the ones you actually walk on
            // may speak over the ground below them.
            if (z >= 2 && !overlay.has(material)) continue;
            return material;
        }
        return null;
    }

    /**
     * A sound config for a material, shaped like the ones parsed from the
     * plugin parameters. Built once per material and reused.
     */
    function configForMaterial(material) {
        if (materialConfigs[material]) return materialConfigs[material];
        const data = getMaterialData();
        const spec = data.materials[material] || {};
        const def = data.defaults;
        const pick = (key, fallback) =>
            spec[key] !== undefined ? spec[key] : (def[key] !== undefined ? def[key] : fallback);
        materialConfigs[material] = {
            configKey: "material:" + material,
            soundNames: spec.sounds || [],
            playMode: spec.playMode || "sequential",
            volume: pick("volume", 88),
            pitchMin: pick("pitchMin", 94),
            pitchMax: pick("pitchMax", 108),
            pan: pick("pan", 0),
            maxDistance: pick("maxDistance", 5),
            animationFrames: pick("animationFrames", [0, 2]),
        };
        return materialConfigs[material];
    }

    /**
     * The material table for the current map, or null when this tileset tags no
     * terrain features and the material layer therefore does not apply here.
     */
    function currentMaterialTable() {
        if (!getMaterialData() || !$gameMap) return null;
        const tileset = $gameMap.tileset();
        if (!tileset) return null;
        const table = materialTableFor(tileset.id);
        return table.__empty ? null : table;
    }

    /**
     * Material sound config from the terrain feature under the character, or
     * null on ground no feature claims.
     */
    function getFeatureSoundConfig(character) {
        const table = currentMaterialTable();
        if (!table) return null;
        const material = materialAt(table, character.x, character.y);
        return material ? configForMaterial(material) : null;
    }

    /**
     * Last resort, and only where the tileset tags features: terrain tags the
     * plugin parameters do not configure - notably 4 (mountain) and 7 (ice) -
     * would otherwise be silent. Runs AFTER the parameter lookup, so every
     * authored terrain tag setting still wins.
     */
    function getTerrainTagMaterialConfig(character) {
        if (!currentMaterialTable()) return null;
        const data = getMaterialData();
        const material = data.terrainTagMaterials[String(groundTerrainTag(character.x, character.y))];
        return material && data.materials[material] ? configForMaterial(material) : null;
    }

    // ====== Parse Region Sounds from Tileset Notes ======
    function parseRegionSounds(tilesetId) {
        if (!tilesetId || regionSoundCache[tilesetId]) {
            return regionSoundCache[tilesetId] || {};
        }

        const tileset = $dataTilesets[tilesetId];
        if (!tileset || !tileset.note) {
            regionSoundCache[tilesetId] = {};
            return {};
        }

        const regionSounds = {};
        const regex = /<RegionSound:\s*(\d+)>([\s\S]*?)<\/RegionSound>/gi;
        let match;

        while ((match = regex.exec(tileset.note)) !== null) {
            const regionId = parseInt(match[1]);
            const content = match[2];

            const soundConfig = {
                regionId: regionId,
                soundNames: [],
                playMode: "sequential",
                volume: 90,
                pitchMin: 90,
                pitchMax: 110,
                pan: 0,
                maxDistance: 5,
                animationFrames: [0, 2]
            };

            // Parse sounds
            const soundsMatch = content.match(/sounds:\s*([^\n]+)/i);
            if (soundsMatch) {
                soundConfig.soundNames = soundsMatch[1]
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
            }

            // Parse playMode
            const playModeMatch = content.match(/playMode:\s*(\w+)/i);
            if (playModeMatch) {
                soundConfig.playMode = playModeMatch[1].toLowerCase();
            }

            // Parse volume
            const volumeMatch = content.match(/volume:\s*(\d+)/i);
            if (volumeMatch) {
                soundConfig.volume = parseInt(volumeMatch[1]);
            }

            // Parse pitchMin
            const pitchMinMatch = content.match(/pitchMin:\s*(\d+)/i);
            if (pitchMinMatch) {
                soundConfig.pitchMin = parseInt(pitchMinMatch[1]);
            }

            // Parse pitchMax
            const pitchMaxMatch = content.match(/pitchMax:\s*(\d+)/i);
            if (pitchMaxMatch) {
                soundConfig.pitchMax = parseInt(pitchMaxMatch[1]);
            }

            // Parse pan
            const panMatch = content.match(/pan:\s*(-?\d+)/i);
            if (panMatch) {
                soundConfig.pan = parseInt(panMatch[1]);
            }

            // Parse maxDistance
            const maxDistanceMatch = content.match(/maxDistance:\s*(\d+)/i);
            if (maxDistanceMatch) {
                soundConfig.maxDistance = parseInt(maxDistanceMatch[1]);
            }

            // Parse animationFrames
            const framesMatch = content.match(/animationFrames:\s*([^\n]+)/i);
            if (framesMatch) {
                soundConfig.animationFrames = framesMatch[1]
                    .split(',')
                    .map(f => parseInt(f.trim()))
                    .filter(f => !isNaN(f));
            }

            if (soundConfig.soundNames.length > 0) {
                regionSounds[regionId] = soundConfig;
            }
        }

        regionSoundCache[tilesetId] = regionSounds;
        return regionSounds;
    }

    // ====== Get sound configuration for current position ======
    function getSoundConfig(character) {
        const x = character.x;
        const y = character.y;
        const regionId = $gameMap.regionId(x, y);
        
        // Priority 1: Region sounds from tileset
        if (regionId > 0 && $gameMap.tilesetId()) {
            const regionSounds = parseRegionSounds($gameMap.tilesetId());
            if (regionSounds[regionId]) {
                return regionSounds[regionId];
            }
        }
        
        // Custom check: Map region ID 99 to terrain tag 3 (water step sounds)
        if (regionId === 99) {
            const stepSound = stepSounds.find(sound => sound.terrainTag === 3);
            if (stepSound) return stepSound;
        }

        // Priority 2: material of the terrain feature underfoot
        const materialSound = getFeatureSoundConfig(character);
        if (materialSound) return materialSound;

        // Priority 3: Terrain tag sounds from plugin parameters
        const terrainTag = groundTerrainTag(x, y);
        const stepSound = stepSounds.find(sound => sound.terrainTag === terrainTag);
        if (stepSound) return stepSound;

        // Priority 4: material for a terrain tag the parameters leave unset
        return getTerrainTagMaterialConfig(character);
    }

    // ====== Ship BGS Management Variables ======
    let savedBgs = null;
    let shipStopTimer = null;
    let isInCarMode = false;

    // ====== Helper function to check if it's raining ======
    function isRaining() {
        return $gameScreen._weatherType === 'rain' || $gameScreen._weatherType === 'storm';
    }

    // ====== Helper function to get appropriate engine sound ======
    function getEngineSound() {
        return isRaining() ? "Engine_rain" : "Engine";
    }

    // ====== Helper function to get current map BGS ======
    function getCurrentMapBgs() {
        if ($dataMap && $dataMap.bgs && $dataMap.bgs.name) {
            return {
                name: $dataMap.bgs.name,
                volume: $dataMap.bgs.volume,
                pitch: $dataMap.bgs.pitch,
                pan: $dataMap.bgs.pan,
                pos: 0
            };
        }
        return null;
    }

    // ====== Helper function to stop engine and restore BGS ======
    function stopEngineAndRestoreBgs() {
        const currentBgs = AudioManager._currentBgs;
        
        if (currentBgs && (currentBgs.name === "Engine" || currentBgs.name === "Engine_rain")) {
            AudioManager.stopBgs();
            
            // Try to restore saved BGS first, then map BGS
            if (savedBgs) {
                AudioManager.playBgs(savedBgs);
                savedBgs = null;
            } else {
                const mapBgs = getCurrentMapBgs();
                if (mapBgs) {
                    AudioManager.playBgs(mapBgs);
                }
            }
        }
        isInCarMode = false;
    }

    // The farthest any step sound on this map can carry: the largest
    // maxDistance among the parameter sounds, this tileset's region sounds
    // and the material sounds. Every walking NPC asked for its step sound on
    // every animation frame, a region read, a material lookup and a terrain
    // scan, only for most of them to be too far away to hear. Anybody past
    // this reach cannot be heard whatever the ground under them, so they are
    // turned away before the lookup. Cached per tileset, and refreshed when
    // the material table turns up.
    let cullKey = null;
    let cullDistance = 0;
    function footstepReach() {
        const tilesetId = $gameMap.tilesetId();
        const data = getMaterialData();
        const key = tilesetId + "|" + (data ? 1 : 0);
        if (key === cullKey) return cullDistance;
        let reach = 0;
        for (const sound of stepSounds) reach = Math.max(reach, Number(sound.maxDistance) || 0);
        const regionSounds = parseRegionSounds(tilesetId);
        for (const id in regionSounds) reach = Math.max(reach, Number(regionSounds[id].maxDistance) || 0);
        if (data) {
            const fallback = data.defaults.maxDistance !== undefined ? data.defaults.maxDistance : 5;
            reach = Math.max(reach, Number(fallback) || 0);
            for (const name in data.materials) {
                const spec = data.materials[name];
                if (spec && spec.maxDistance !== undefined) reach = Math.max(reach, Number(spec.maxDistance) || 0);
            }
        }
        cullKey = key;
        cullDistance = reach;
        return reach;
    }

    function outOfFootstepReach(character) {
        if (character === $gamePlayer || !$gamePlayer) return false;
        const dx = $gamePlayer.x - character.x;
        const dy = $gamePlayer.y - character.y;
        const reach = footstepReach();
        return dx * dx + dy * dy > reach * reach;
    }

    // ====== Footstep sound playback function ======
    // stepSound: the config the caller already looked up for this step, so it
    // is not looked up a second time.
    function playFootstepSound(character, stepSoundIn) {

        // Disable footstep sounds for SeaBed biome
        if ($gameSystem._procGenData && $gameSystem._procGenData.currentBiome === "SeaBed") {
            return;
        }

        // Enemy events should not play sound on terrain tag 3 or region id 99 unless entering/exiting
        if (character instanceof Game_Event && character.event()) {
            const evName = character.event().name;
            const isAquatic = character.isAquaticEnemy && character.isAquaticEnemy();
            const isAmphibious = character.isAmphibiousEnemy && character.isAmphibiousEnemy();
            const isEnemy = evName === "Enemy" || isAquatic || isAmphibious;
            
            if (isEnemy) {
                const currentIsWater = groundTerrainTag(character.x, character.y) === 3 || $gameMap.regionId(character.x, character.y) === 99;
                const wasInWater = character._wasInWater !== undefined ? character._wasInWater : false;
                
                if (currentIsWater === wasInWater) {
                    if (currentIsWater) {
                        return; // Block step sound while continuing in water
                    }
                } else {
                    character._wasInWater = currentIsWater; // Update state on enter/exit
                }
            }
        }

        if (character === $gamePlayer && character.isInVehicle()) {
            // Player is in ship and moving
            const currentBgs = AudioManager._currentBgs;
            const engineSound = getEngineSound();
            
            // If we're not in ship mode yet, save current BGS (if it's not an engine sound)
            if (!isInCarMode) {
                if (currentBgs && currentBgs.name !== "Engine" && currentBgs.name !== "Engine_rain") {
                    savedBgs = {
                        name: currentBgs.name,
                        volume: currentBgs.volume,
                        pitch: currentBgs.pitch,
                        pan: currentBgs.pan,
                        pos: currentBgs.pos || 0
                    };
                } else if (!currentBgs) {
                    // No BGS is playing, check if map has BGS
                    const mapBgs = getCurrentMapBgs();
                    if (mapBgs) {
                        savedBgs = mapBgs;
                    }
                }
                isInCarMode = true;
            }

            // Clear any existing stop timer since we're moving
            if (shipStopTimer) {
                clearTimeout(shipStopTimer);
                shipStopTimer = null;
            }

            // Play appropriate engine sound if not already playing, or switch if weather changed
            if (!currentBgs || (currentBgs.name !== engineSound)) {
                AudioManager.playBgs({
                    name: engineSound,
                    volume: 40,
                    pitch: 100,
                    pan: 0
                });
            }
            return;
        } else {
            // Player is not in ship or not moving
            if (isInCarMode) {
                // We were in ship mode but now we're not moving or not in ship
                
                // Set timer to stop engine and restore BGS after 0.5 seconds
                if (shipStopTimer) {
                    clearTimeout(shipStopTimer);
                }
                
                shipStopTimer = setTimeout(() => {
                    stopEngineAndRestoreBgs();
                    shipStopTimer = null;
                }, 500); // 0.5 second delay
            }
        }
    
        // Get sound configuration (region or terrain)
        const stepSound = stepSoundIn || getSoundConfig(character);
        
        if (stepSound && stepSound.soundNames.length > 0) {
            const pitch = Math.floor(Math.random() * (stepSound.pitchMax - stepSound.pitchMin + 1)) + stepSound.pitchMin;

            // Get footsteps volume from ConfigManager (default 30%)
            const footstepsVolumeMultiplier = (ConfigManager.footstepsVolume || 30) / 100;
            let volume = stepSound.volume * footstepsVolumeMultiplier;

            // If it's an event, reduce volume based on distance
            if (character !== $gamePlayer) {
                const dx = $gamePlayer.x - character.x;
                const dy = $gamePlayer.y - character.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > stepSound.maxDistance) {
                    return; // Too far
                }
                const volumeFactor = 1 - distance / stepSound.maxDistance;
                volume = Math.max(0, Math.min(stepSound.volume * footstepsVolumeMultiplier * volumeFactor, 100));
            }

            let soundName;
            const configId = stepSound.configKey || stepSound.regionId || stepSound.terrainTag || 0;
            const indexKey = '_footstepSoundIndex_' + configId;
            const terrainKey = '_lastSoundConfig_' + configId;

            if (stepSound.playMode === "sequential") {
                // Get the current sound index
                if (!character[indexKey] || character[terrainKey] !== configId) {
                    character[indexKey] = 0;
                }
                soundName = stepSound.soundNames[character[indexKey]];

                // Increment sound index
                character[indexKey] = (character[indexKey] + 1) % stepSound.soundNames.length;
            } else if (stepSound.playMode === "random") {
                // Choose a random sound
                soundName = stepSound.soundNames[Math.floor(Math.random() * stepSound.soundNames.length)];
            } else {
                // If the mode is not recognized, use the first sound
                soundName = stepSound.soundNames[0];
            }

            // Play the sound
            AudioManager.playSe({
                name: soundName,
                volume: volume,
                pitch: pitch,
                pan: stepSound.pan
            });

            // Save the current config identifier
            character[terrainKey] = configId;
        }
    }

    // ====== Override the animation pattern update method ======
    const _Game_CharacterBase_updatePattern = Game_CharacterBase.prototype.updatePattern;
    Game_CharacterBase.prototype.updatePattern = function() {
        const prevPattern = this._pattern;
        _Game_CharacterBase_updatePattern.call(this);
        const newPattern = this._pattern;

        // On a <Platform> map nothing is ever "moving" on the grid, so the
        // platformer flags the frames where the feet actually step.
        if (prevPattern !== newPattern && (this.isMoving() || this._pfStepping)) {
            const isPlayer = this === $gamePlayer;
            let shouldPlayFootsteps = false;

            if (isPlayer) {
                shouldPlayFootsteps = true;
            } else if (this instanceof Game_Event) {
                if (eventFootstepsEnabled && !this.hasNoFootstepSounds()) {
                    shouldPlayFootsteps = true;
                }
            }

            // An NPC past the farthest reach of any step sound here is not
            // heard whatever it stands on, so it never pays for the lookup.
            if (shouldPlayFootsteps && !outOfFootstepReach(this)) {
                const stepSound = getSoundConfig(this);
                if (stepSound && stepSound.animationFrames.includes(newPattern)) {
                    playFootstepSound(this, stepSound);
                }
            }
        }
    };

    // ====== Handle movement stop detection for ship BGS management ======
    const _Game_Player_updateStop = Game_Player.prototype.updateStop;
    Game_Player.prototype.updateStop = function() {
        _Game_Player_updateStop.call(this);

        // Check if player stopped moving while in ship
        if (this.isInVehicle() && (this.vehicle().isShip() || this.vehicle().isBoat()) && !this.isMoving()) {
            // Run the ship BGS management once per stop; re-running it every frame
            // while parked re-does the same work. The flag resets once the player
            // starts moving again, so the next stop is handled afresh.
            if (!this._shipStopHandled) {
                this._shipStopHandled = true;
                // Trigger the BGS management logic
                playFootstepSound(this);
            }
        } else if (this.isMoving()) {
            this._shipStopHandled = false;
        }
    };

    // ====== Handle vehicle exit ======
    const _Game_Player_getOffVehicle = Game_Player.prototype.getOffVehicle;
    Game_Player.prototype.getOffVehicle = function() {
        const wasInShip = this.isInVehicle() &&  (this.vehicle().isShip() || this.vehicle().isBoat());
        const result = _Game_Player_getOffVehicle.call(this);
        
        if (wasInShip && result) {
            // Player exited the ship, immediately stop engine and restore BGS
            if (shipStopTimer) {
                clearTimeout(shipStopTimer);
                shipStopTimer = null;
            }
            stopEngineAndRestoreBgs();
        }
        
        return result;
    };

    // ====== Handle map transfer ======
    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        // If we're in ship mode and transferring maps, clean up BGS state
        if (isInCarMode) {
            if (shipStopTimer) {
                clearTimeout(shipStopTimer);
                shipStopTimer = null;
            }
            // Don't restore BGS here as the new map will handle its own BGS
            isInCarMode = false;
            savedBgs = null;
        }
        
        _Game_Player_performTransfer.call(this);
    };

    // ====== Clear region sound cache on map load ======
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);
        // Clear caches when changing maps to ensure fresh data. The material
        // table is rebuilt from the tileset notes, which ProcGenUtils may have
        // re-parsed in the meantime.
        regionSoundCache = {};
        materialTileCache = {};
    };

    // ====== Check if the event has the <NoFootsteps> tag ======
    Game_Event.prototype.hasNoFootstepSounds = function() {
        return this.event().note.includes("<NoFootsteps>");
    };

    // ====== Handle weather changes for dynamic engine sound switching ======
    const _Game_Screen_changeWeather = Game_Screen.prototype.changeWeather;
    Game_Screen.prototype.changeWeather = function(type, power, duration) {
        const wasRaining = isRaining();
        _Game_Screen_changeWeather.call(this, type, power, duration);
        const isNowRaining = isRaining();
        
        // If weather changed and player is in ship, switch engine sound
        if (isInCarMode && wasRaining !== isNowRaining) {
            const currentBgs = AudioManager._currentBgs;
            const newEngineSound = getEngineSound();
            
            if (currentBgs && (currentBgs.name === "Engine" || currentBgs.name === "Engine_rain")) {
                AudioManager.playBgs({
                    name: newEngineSound,
                    volume: currentBgs.volume,
                    pitch: currentBgs.pitch,
                    pan: currentBgs.pan
                });
            }
        }
    };


    // =========================================================================
    // window.Footsteps
    // =========================================================================
    // The step-sound table, for anything that is NOT walking a 2D map. The 3D
    // world (VoxelWorld/*) has no tiles, no region ids and no terrain tags: it
    // has a voxel under the walker's foot and a material name for it. It should
    // still SOUND like this game, so it asks here rather than inventing a
    // second set of footsteps, and every material added to
    // js/db/WorldGen/FootstepMaterials.json is heard out there too.
    //
    //   Footsteps.materials()             the material names that carry a sound
    //   Footsteps.play(material, opts)    one step on it; opts: { volume, pan }
    //
    // Volume goes through the same footsteps slider the 2D steps do, so turning
    // them down turns them down everywhere.
    window.Footsteps = {
        // True once the table is loaded; false where it is absent, in which
        // case a caller simply gets silence rather than an error.
        ready() { return !!getMaterialData(); },

        materials() {
            const data = getMaterialData();
            return data ? Object.keys(data.materials) : [];
        },

        // Terrain tag and material under (x, y), star (*) tiles left out.
        groundTerrainTag,
        materialAt(x, y) {
            const table = currentMaterialTable();
            return table ? materialAt(table, x, y) : null;
        },

        // Is there a sound for this material name?
        has(material) {
            const data = getMaterialData();
            return !!(data && material && data.materials[material]);
        },

        play(material, opts) {
            const data = getMaterialData();
            if (!data || !material) return false;
            const def = data.materials[material];
            if (!def || !def.sounds || !def.sounds.length) return false;
            const o = opts || {};
            const mul = (ConfigManager.footstepsVolume == null ? 30 : ConfigManager.footstepsVolume) / 100;
            const base = (o.volume == null ? (def.volume || 85) : o.volume);
            const volume = Math.max(0, Math.min(100, base * mul));
            if (volume <= 0) return false;
            const lo = def.pitchMin || 95, hi = def.pitchMax || 105;
            AudioManager.playSe({
                name: def.sounds[Math.floor(Math.random() * def.sounds.length)],
                volume,
                pitch: Math.floor(lo + Math.random() * (hi - lo + 1)),
                pan: o.pan || 0
            });
            return true;
        }
    };

})();