/*:
 * @target MZ
 * @plugindesc World Map & Procedural Map Transfer v2.0.0
 * @author Omni-Lex
 * @help
 * ============================================================================
 * WorldMapReturn.js  (merged with ProceduralMapTransfer.js)
 * ============================================================================
 *
 * Handles all world-map / procedural-map navigation:
 *   - Tracks player position on map 315 (Variables 43/44)
 *   - Border detection and auto-transfer back to world map
 *   - "Visit map" travel decision window (world map -> proc map)
 *   - Procedural map edge transitions (seamless biome-to-biome travel)
 *   - Underground layer navigation (goDown / goUp / switchLayer)
 *   - Border arrow sprites for regular and procedural maps
 *   - Biome audio (BGM/BGS) updates on map load and edge transition
 *   - Party diving sprite management for Ocean biome
 *
 * Variables used:
 *   43 - World X coordinate on map 315
 *   44 - World Y coordinate on map 315
 *   45 - Destination map ID (during transfers)
 *
 * Map Notetags:
 *   <Interior>          Reset screen tint when entering from world map.
 *   <Worldmap N S E W>  Enable border return popup on specified edges.
 *                       Letters in any order and any case; the colon form
 *                       <Worldmap: N S E W>, full words (<Worldmap west,north>)
 *                       and a bare <Worldmap> (all four edges) all work too.
 *                       An edge painted with a fence (void, cliff or wall, so
 *                       the outermost tiles cannot be stood on) is crossed by
 *                       walking into it, up to EDGE_FENCE_DEPTH tiles thick.
 *   <Coords x y>        World coords this map connects to.
 *   <Borders mapId x y> Override border teleport destination (all borders).
 *   <disableReturn>     No way out of this map through the T key or the
 *                       "Return to World Map" menu row: both are refused and
 *                       the row is not drawn. The map must be left through its
 *                       own events.
 *
 * @command ReturnToWorldMap
 * @text Return to World Map
 * @desc Teleport back to saved position on map 315
 *
 * @command SaveWorldMapPosition
 * @text Save World Map Position
 * @desc Save current position on map 315
 *
 * @command SetWorldMapCoordinates
 * @text Set World Map Coordinates
 * @desc Manually set world coordinates without teleporting
 * @arg x
 * @text X
 * @type number
 * @min 0
 * @default 0
 * @arg y
 * @text Y
 * @type number
 * @min 0
 * @default 0
 *
 * @command startProcGen
 * @text Start Procedural Generation
 * @desc Enter proc map 636 from current position on map 315
 *
 * @command stopProcGen
 * @text Stop Procedural Generation
 * @desc Return from proc map 636 to map 315
 *
 * @command goDown
 * @text Go Down (Underground)
 * @desc Descend to the underground layer of the current biome
 *
 * @command goUp
 * @text Go Up (Surface)
 * @desc Ascend back to surface from underground
 *
 * @command enterDungeonDoor
 * @text Enter Dungeon Door
 * @desc Descend through a DoorDungeon tile into a coordinate-seeded dungeon (type from the biome lowerLayer)
 *
 * @command startForcedBiome
 * @text Start Forced Biome
 * @desc Generate a specific biome (Dungeon, Crypt, Sewer, ...) as a fresh procedural map and teleport into it
 *
 * @arg Biome
 * @text Biome
 * @type string
 * @default Dungeon
 * @desc Name of the biome to generate (must match a Biomes.json entry).
 *
 * @arg Salt
 * @text Seed Salt
 * @type number
 * @min -2147483648
 * @default 0
 * @desc Extra seed ingredient, so two entrances of the same kind on one world square open onto different structures.
 *
 * @command exitStructure
 * @text Exit Structure
 * @desc Leave the structure the party is inside (a patron's vault, a cellar, a crypt) and step back out on the entrance tile - the hatch, under a patron's square.
 *
 * @command switchLayer
 * @text Switch Layer
 * @desc Toggle surface/underground keeping player coordinates
 */

(() => {
    'use strict';

    // ============================================================================
    // CONSTANTS
    // ============================================================================

    const PLUGIN_NAME = 'WorldMapReturn';
    const PLUGIN_PMT  = 'WorldMapReturn';

    const worldMapId = 315;
    const procMapId  = 636;

    // Item 141 is the "Diving suit"; 142 is the UV sunglasses filed beside it,
    // which the Ocean descent used to ask for, so the suit never opened the way
    // down. Kept in step with MovementInteractionSystem.js.
    const DIVING_SUIT_ITEM_ID = 141;

    // Item 138 is the "Shovel": a consumable whose only effect is common event 164,
    // which calls the goDown command below.
    const SHOVEL_ITEM_ID = 138;

    const VAR_WORLD_X  = 43;
    const VAR_WORLD_Y  = 44;
    const VAR_DEST_MAP = 45;

    // The <Coords x y> pair the editor's map template was saved with. 1269 of the
    // 1319 maps that carry the tag at all still hold this exact pair, which is a
    // copy of the Omega Tower's square rather than a statement about where the map
    // is: honouring it would file every junk shop, cellar and bedroom in the game
    // as standing on the Omega Tower, park every vehicle left in one there, and
    // send every "return to the world map" to the same square (the long-standing
    // "everything comes out at the Omega Tower" bug). It is therefore read as
    // "nobody set this" and the party's own last world square is used instead.
    // A map that really does belong to that square is reached from it, so its
    // last-known coordinate already says so.
    const TEMPLATE_COORDS = { x: 79, y: 125 };

    const BORDER_DETECTION_RANGE = 3;
    const PROC_MAP_WIDTH  = 64;
    const PROC_MAP_HEIGHT = 64;

    // ============================================================================
    // WORLD MAP / PROCEDURAL MAP TOGGLE HOTKEY
    // ----------------------------------------------------------------------------
    // T on the keyboard and Select on the gamepad jump straight between the world
    // map and the procedural map, bypassing the "Visit <place> / Make a camp /
    // Cancel" choice window (openTravelDecision) and the vehicle action menu's
    // "Visit map" / "Return to the world map" rows: same destinations those reach,
    // one press. CustomMainMenuLayout.js no longer claims T for its "Wait" hotkey
    // (see its HOTKEYS table), so claiming it here doesn't fight over
    // Input.keyMapper. Select is unused by the engine and by CustomCommandMapper's
    // default gamepad bindings.
    const WMR_TOGGLE_KEY = 'wmrToggle';
    Input.keyMapper[84] = WMR_TOGGLE_KEY;      // T
    Input.gamepadMapper[8] = WMR_TOGGLE_KEY;   // Select / Back

    // ============================================================================
    // ADVENTURE MARKERS ("???" world-map tiles)
    // ----------------------------------------------------------------------------
    // ProceduralAdventureSystem.js spreads a few adventures over the biomes the
    // world map paints, on squares picked from the world seed. This draws them:
    // a "???" plate on each square that still has its adventure to give, and the
    // "Investigate" row openTravelDecision() offers while standing on one or
    // facing it from the square next door (facing one opens that menu ahead of
    // everything else the OK button does out here). The squares themselves, the
    // encounter and the record of which have been answered all belong to that
    // plugin (ProceduralAdventure.Earth).
    // ============================================================================
    const MYSTERY_FONT_SIZE     = 18;
    let   mysteryTiles          = null;  // Set<"x,y"> for the current map-315 visit
    let   mysterySprites        = [];    // Sprite_MysteryMarker[] currently rendered
    let   mysteryMarkersCreated = false;

    function adventureSystem() {
        const PA = window.ProceduralAdventure;
        return (PA && PA.Earth) ? PA.Earth : null;
    }

    // ============================================================================
    // PROC GEN IMPORTS
    // ============================================================================

    const Utils2 = window.ProcGenUtils;
    if (!Utils2) {
        console.error('WorldMapReturn: requires ProcGenUtils plugin');
        return;
    }

    const {
        Cache,
        getBiomeByName,
        getAdjacentBiomesOnWorldMap,
        getAdjacentBiomesFromCache,
        checkAdjacentMapBiomesFromCache,
        checkDiagonalMapBiomesFromCache,
        normalizeBiomeForEdge,
        getNonProceduralDestination,
        createSeededRandom,
        getWorldSeed,
        procMapSeed,
        getArrowForDirection,
        buildBiomeCoordinateCache,
        logWarn,
        WORLD_MAP_ID,
        PROC_MAP_ID,
    } = Utils2;

    const generateProceduralTerrain = window.generateProceduralTerrain;
    const shouldDisplayAsBeach      = window.shouldDisplayAsBeach;
    const shouldDisplayAsIsland     = window.shouldDisplayAsIsland;
    const placeChestEvents          = window.placeChestEvents;
    const placeSpikeTrapEvents      = window.placeSpikeTrapEvents;
    const placeDungeonDoorEvents    = window.placeDungeonDoorEvents;
    const placeKeyChestEvents       = window.placeKeyChestEvents;
    const placePolicemanEvents      = window.placePolicemanEvents;

    if (!generateProceduralTerrain) {
        console.error('WorldMapReturn: requires ProceduralMapBiomeGenerator plugin');
        return;
    }

    const { isRoadBiome, determineRoadIntersectionType } = window.ProcGenRoads || {};

    // ============================================================================
    // SPRITE_BORDERARROW
    // ============================================================================

    class Sprite_BorderArrow extends Sprite {
        constructor(mapX, mapY, arrowChar, color = '#ffff66') {
            super();
            this._mapX      = mapX;
            this._mapY      = mapY;
            this._color     = color;
            this._rotAngle  = this._angleFromChar(arrowChar);
            this.createBitmap();
            this.anchor.set(0.5, 0.5);
            this.updatePosition();
        }

        _angleFromChar(ch) {
            const map = {
                '↑': 0,
                '↗': Math.PI / 4,
                '→': Math.PI / 2,
                '↘': 3 * Math.PI / 4,
                '↓': Math.PI,
                '↙': -3 * Math.PI / 4,
                '←': -Math.PI / 2,
                '↖': -Math.PI / 4,
            };
            return map[ch] !== undefined ? map[ch] : 0;
        }

        createBitmap() {
            const aw = 32, ah = 22;
            const bitmap = new Bitmap(aw, ah);
            const ctx = bitmap.context;
            ctx.fillStyle   = this._color;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth   = 2.5;
            ctx.beginPath();
            ctx.moveTo(aw / 2, 1);
            ctx.lineTo(1, ah - 1);
            ctx.lineTo(aw - 1, ah - 1);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            bitmap._baseTexture.update();
            this.bitmap = bitmap;
        }

        updatePosition() {
            const tileSize = $gameMap.tileWidth();
            const screenX  = $gameMap.adjustX(this._mapX) * tileSize + tileSize / 2;
            const screenY  = $gameMap.adjustY(this._mapY) * tileSize + tileSize / 2;
            const bounce   = Math.sin(Graphics.frameCount * 0.12) * 7;
            const bx       = Math.sin(this._rotAngle) * bounce;
            const by       = -Math.cos(this._rotAngle) * bounce;
            this.x         = Math.round(screenX + bx);
            this.y         = Math.round(screenY + by);
            this.rotation  = this._rotAngle;
        }

        update() {
            super.update();
            this.updatePosition();
        }
    }

    window.Sprite_BorderArrow = Sprite_BorderArrow;

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    let _lastDivingSig = null;
    function updatePartyDivingSprites() {
        const procGenData = $gameSystem._procGenData;
        let shouldDive    = false;
        if (procGenData) {
            const isUnderground = procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0;
            const isOcean       = procGenData.currentBiome === 'Ocean' || procGenData.biomeLayerStack.includes('Ocean');  // i18n-ignore  biome ids
            shouldDive          = isUnderground && isOcean;
        }
        if (!shouldDive && $gamePlayer._isDiving) shouldDive = true;

        // While diving the sprites are re-evaluated every frame: the swap back to
        // the still suit is timed (see window.DivingSprite), so it needs a tick
        // per frame rather than one per movement boundary. Out of the water the
        // old signature gate still skips the work while nothing changes.
        if (!shouldDive) {
            const sig = '0|' + $gamePlayer.x + ',' + $gamePlayer.y;
            if (sig === _lastDivingSig) return;
            _lastDivingSig = sig;
        } else {
            _lastDivingSig = null;
        }

        updateCharacterSprite($gamePlayer, shouldDive);
        const followers = $gamePlayer.followers()._data || [];
        followers.forEach(follower => { if (follower) updateCharacterSprite(follower, shouldDive); });
    }

    function updateCharacterSprite(character, shouldDive) {
        const actor = character.actor ? character.actor() : $gameParty.leader();
        if (!actor) return;
        if (shouldDive) {
            if (window.DivingSprite) window.DivingSprite.apply(character);
        } else {
            const defaultName  = actor.characterName();
            const defaultIndex = actor.characterIndex();
            if (character.characterName() !== defaultName || character.characterIndex() !== defaultIndex) {
                character.setImage(defaultName, defaultIndex);
            }
            if (window.DivingSprite) window.DivingSprite.clear(character);
            if (character._originalStepAnime !== undefined) {
                character.setStepAnime(character._originalStepAnime);
                character._originalStepAnime = undefined;
            }
        }
    }

    // ============================================================================
    // BIOME MUSIC SELECTION (OFF-WORLD ONLY)
    // ----------------------------------------------------------------------------
    // Nothing on Earth carries a track pool any more. A map's BGM is whatever
    // the map was authored with or whatever an event started, and nothing here
    // overrides it, borrows over it or stops it: settlements, dungeons, caves
    // and open country all keep the music they were given.
    //
    // Off-world is the exception. Alien surfaces and Space are generated and
    // have no authored track to fall back on, so they keep their pools (`bgm`
    // for day, `bgmNight` for night; alien pools are drawn from Atmospheric by
    // day and Dark by night, see js/db/WorldGen/AlienBiomes.json).
    //
    // Only ONE track of a pool is heard while the party stays put: it is picked
    // deterministically from the world seed, the biome name, the day/night half
    // and the NATION the player is standing in (Variable 86, set by
    // WeatherSystem.setCurrentCountry). No per-visit shuffling, no restart when
    // stepping between two maps of the same biome, no state to persist.
    // ============================================================================

    // Biome music is no longer a thing on Earth. A map's BGM is whatever the
    // map was authored with or whatever an event started, and nothing here
    // overrides it or stops it. The one exception is off-world: alien biomes
    // and Space keep their pools, because those maps are generated and have no
    // authored track of their own to fall back on.
    function biomeMusicAllowed(biomeName) {
        const name = String(biomeName || '');
        return /^Alien/i.test(name) || name === 'Space' || name === 'Spacecenter';   // i18n-ignore  biome ids
    }

    const VAR_NATION_ID = 86;

    function currentNationId() {
        return ($gameVariables ? $gameVariables.value(VAR_NATION_ID) : 0) | 0;
    }

    // FNV-1a over the biome name plus the day/night half, then avalanche in the
    // nation id and the world seed. Nation and seed are mixed multiplicatively so
    // two neighbouring nation ids give unrelated picks rather than adjacent ones.
    function biomeMusicSeed(biomeName, isNight) {
        const key = String(biomeName || '').toLowerCase() + (isNight ? '|night' : '|day');
        let h = 0x811c9dc5;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        h = Math.imul(h ^ ((currentNationId() + 1) * 0x9e3779b1), 0x85ebca77) >>> 0;
        h = Math.imul(h ^ (getWorldSeed ? getWorldSeed() : 19002001), 0x27d4eb2f) >>> 0;
        h ^= h >>> 15;
        return h >>> 0;
    }

    function pickBiomeTrack(biomeName, tracks, isNight) {
        if (!tracks || tracks.length === 0) return null;
        if (tracks.length === 1) return tracks[0];
        const rng = createSeededRandom
            ? createSeededRandom(biomeMusicSeed(biomeName, isNight))
            : () => Math.random();
        return tracks[Math.min(tracks.length - 1, Math.floor(rng() * tracks.length))];
    }

    // The night pool is optional: a biome with no `bgmNight` keeps its day pool
    // after dark rather than falling silent.
    function biomeTrackPool(biome, isNight) {
        const clean = arr => (arr || []).filter(n => n && n.trim());
        const day   = clean(biome.bgm);
        const night = clean(biome.bgmNight);
        return (isNight && night.length > 0) ? night : day;
    }

    // The biome whose music a biome with no pool of its own borrows. The road
    // family is the reason it exists: a road is not a place with a sound of its
    // own, it is a line drawn across whatever country it crosses, so it carries
    // no bgm in Biomes.json and takes the music of the terrain it was painted
    // over (recorded as currentUnderBiome) or, failing that, of a neighbouring
    // world square. Now that only settlements and built dungeons carry pools at
    // all this fires just on their doorstep - a road running into a city takes
    // the city's theme - and everywhere else there is nothing to borrow, which
    // is the null case: it leaves whatever is playing alone.
    function borrowedMusicBiome(biomeName, procGenData, isNight) {
        if (!procGenData) return null;
        const candidates = [procGenData.currentUnderBiome];
        if (procGenData.underBiomeMap) {
            candidates.push(procGenData.underBiomeMap[`${procGenData.originX},${procGenData.originY}`]);
        }
        const cache = procGenData.biomeCoordinateCache;
        if (cache && getAdjacentBiomesFromCache) {
            const adj = getAdjacentBiomesFromCache(procGenData.originX, procGenData.originY, cache);
            candidates.push(adj.north, adj.east, adj.south, adj.west);
        }
        for (const name of candidates) {
            if (!name || name === biomeName) continue;
            const candidate = getBiomeByName(name);
            if (!candidate) continue;
            if (biomeTrackPool(candidate, isNight).length === 0) continue;
            return { name, biome: candidate };
        }
        return null;
    }

    // What the music should do here, as one answer: 'play' this pool, 'keep'
    // whatever is already playing, or 'stop'. A biome with no pool of its own
    // borrows first (see above); with nothing to borrow either the place is
    // silent, and a procedural map IS its biome, so silent means silent - the
    // track the party walked in with is faded out instead of following them out
    // into open country. A hand-made map is authored, not generated, so there it
    // still means "carry on with whatever is playing".
    function biomeMusicDecision(biome, biomeName, procGenData, isNight, isProcGenMap) {
        // On Earth there is nothing to decide: leave the BGM alone.
        if (!biomeMusicAllowed(biomeName)) return { tracks: [], name: biomeName, borrowed: false, action: 'keep' };
        let musicBiome = biome, musicBiomeName = biomeName;
        if (biomeTrackPool(biome, isNight).length === 0) {
            const borrowed = borrowedMusicBiome(biomeName, procGenData, isNight);
            if (borrowed) {
                musicBiome     = borrowed.biome;
                musicBiomeName = borrowed.name;
            }
        }
        const tracks = biomeTrackPool(musicBiome, isNight);
        return {
            tracks,
            name: musicBiomeName,
            borrowed: musicBiomeName !== biomeName,
            action: tracks.length > 0 ? 'play' : (isProcGenMap ? 'stop' : 'keep')
        };
    }

    function isNightTimeNow() {
        const dateStr   = ($gameVariables && $gameVariables.value(113)) || '01 JAN 2001 12:00';
        const parts     = String(dateStr).split(' ').filter(Boolean);
        const timeParts = parts[3] ? parts[3].split(':') : ['12', '00'];
        const hour      = parseInt(timeParts[0]) || 12;
        return hour >= 20 || hour < 6;
    }

    // Both inputs to the pick can change without a map load: the nation id when
    // the party crosses a border (or fast-travels, or gets released from prison)
    // and the day/night half at 20:00 / 06:00. Watch them and refresh the biome
    // audio when either flips, so the region's theme really does change with the
    // country. Throttled -- nothing here needs frame accuracy.
    let _lastMusicSig = null;
    function watchNationMusicChange() {
        if (Graphics.frameCount % 30 !== 0) return;
        if (!$gameMap || $gameMap.mapId() === WORLD_MAP_ID) return;
        // An empty world's music does not answer to the clock (one pool for
        // both halves of the day), so only a border crossing is worth a
        // re-pick there; watching the daylight would restart the ambience at
        // 20:00 and 06:00 for a track that is not going to change.
        const half = isNightTimeNow() ? 1 : 0;
        const sig = currentNationId() + '|' + half;
        if (_lastMusicSig === null) { _lastMusicSig = sig; return; }
        if (sig === _lastMusicSig) return;
        _lastMusicSig = sig;
        console.log(`[updateBiomeAudio] Nation/daylight changed (${sig}), re-picking biome audio`);
        updateBiomeAudio();
    }

    // ============================================================================
    // AMBIENCE CROSSFADE
    // ----------------------------------------------------------------------------
    // Every ambience change used to be a cut: AudioManager.playBgs stops what is
    // playing and starts the next one at full volume on the same frame, so
    // walking from a forest into a field, or in through a door, snapped from one
    // bed to the other. With the stitched window that happens mid-step, with no
    // fade to hide behind, which makes it far more noticeable than it used to be.
    //
    // Two things stand in the way of the engine's own fadeOutBgs. It leaves the
    // buffer in place with only its gain ramped down, so the very next playBgs
    // destroys it and the fade is cut anyway; and WebAudio.fadeOut never stops
    // the source, so a buffer nobody destroys plays on silently forever. The
    // outgoing bed is therefore DETACHED from AudioManager first - it belongs to
    // nobody after that, so nothing can cut it short - ramped down, and destroyed
    // once it is inaudible.
    // ============================================================================

    const BGS_FADE_SECONDS = 1.5;
    const BGM_FADE_SECONDS = 1.5;

    // Hand the playing ambience over to a fade and give it back to nobody: it is
    // off AudioManager from here on, so the playBgs that starts the next bed
    // cannot destroy it half way down. Freed once it is inaudible, since
    // WebAudio.fadeOut only ramps the gain and never stops the source. Answers
    // false when there was nothing playing to fade.
    function fadeOutBiomeBgs(seconds) {
        const buffer = AudioManager._bgsBuffer;
        if (!buffer) return false;
        const fade = seconds === undefined ? BGS_FADE_SECONDS : seconds;
        AudioManager._bgsBuffer = null;
        AudioManager._currentBgs = null;
        const free = () => { try { buffer.destroy(); } catch (e) { /* already gone */ } };
        if (fade <= 0 || !buffer.fadeOut) { free(); return true; }
        buffer.fadeOut(fade);
        setTimeout(free, fade * 1000 + 250);
        return true;
    }

    // The same hand-over for the music. A procedural map with no biome music of
    // its own used to keep whatever the party walked in with, which dragged a
    // settlement theme out across the open country around it. Detached, ramped
    // down and freed exactly like the ambience, since WebAudio.fadeOut only
    // ramps the gain and never stops the source.
    function fadeOutBiomeBgm(seconds) {
        const buffer = AudioManager._bgmBuffer;
        AudioManager._currentBgm = null;
        if (!buffer) return false;
        const fade = seconds === undefined ? BGM_FADE_SECONDS : seconds;
        AudioManager._bgmBuffer = null;
        const free = () => { try { buffer.destroy(); } catch (e) { /* already gone */ } };
        if (fade <= 0 || !buffer.fadeOut) { free(); return true; }
        buffer.fadeOut(fade);
        setTimeout(free, fade * 1000 + 250);
        return true;
    }

    // Start a bed under a fade, over whatever is playing. The same bed already
    // playing is left exactly as it is: crossing a seam between two squares that
    // sound alike must not restart their ambience from the top.
    function crossfadeBiomeBgs(bgs, play) {
        if (AudioManager.isCurrentBgs(bgs)) {
            play();   // same track: this only re-scales its volume
            return false;
        }
        fadeOutBiomeBgs();
        play();
        AudioManager.fadeInBgs(BGS_FADE_SECONDS);
        return true;
    }

    function updateBiomeAudio() {
        const procGenData  = $gameSystem._procGenData;
        // _procGenData keeps the surrounding town's biome alive while the player
        // is inside a house or any other hand-made map, so it may only speak for
        // the audio while the procedural map is the current (or incoming) one.
        // Anywhere else the map's own <Biome:> note decides.
        const isProcGenMap = !!(procGenData && procGenData.currentBiome) &&
            ($gameMap.mapId() === PROC_MAP_ID || $gamePlayer.isTransferring());
        let biomeName      = null;

        if (isProcGenMap) {
            biomeName = procGenData.currentBiome;
            if (procGenData.displayAsIsland)      biomeName = 'Island';
            else if (procGenData.displayAsBeach)  biomeName = 'Beach';
        } else {
            if ($dataMap && $dataMap.note) {
                const biomeMatch = $dataMap.note.match(/<Biome:\s*(.+?)>/i);
                if (biomeMatch) biomeName = biomeMatch[1].trim();
            }
            if (!biomeName && $dataMap && $dataMap.meta && $dataMap.meta.Biome) {
                biomeName = $dataMap.meta.Biome;
            }
        }

        // No biome, or one that is not in the database: kill the ambience but
        // leave the BGM alone. That is missing data rather than a quiet place, so
        // whatever is playing carries on; a biome that IS in the database and
        // simply has no tracks falls silent on a procedural map (see below).
        if (!biomeName) { fadeOutBiomeBgs(); return; }

        let biome = getBiomeByName(biomeName);
        // 'Island' is a display substitution, not a database biome, so fall back
        // to the tile's real biome rather than dropping into silence.
        if (!biome && isProcGenMap && procGenData.currentBiome !== biomeName) {
            biomeName = procGenData.currentBiome;
            biome     = getBiomeByName(biomeName);
        }
        if (!biome) { fadeOutBiomeBgs(); return; }

        const isNightTime = isNightTimeNow();
        // Must be built exactly as watchNationMusicChange builds it, or the
        // two disagree and the watcher re-picks on every throttled tick.
        _lastMusicSig     = currentNationId() + '|' + (isNightTime ? 1 : 0);

        if (!isProcGenMap && $dataMap && $dataMap.autoplayBgm) {
            // Keep map's own BGM; only handle BGS below
        } else {
            // A biome with no music of its own borrows it from the ground it
            // sits on or from next door. Only the music: the ambience below
            // stays the biome's own, so a road still sounds like a road.
            const decision = biomeMusicDecision(biome, biomeName, procGenData, isNightTime, isProcGenMap);
            if (decision.borrowed) {
                console.log(`[updateBiomeAudio] ${biomeName} has no music of its own, borrowing ${decision.name}`);  // i18n-ignore  console diagnostic
            }
            const tracks  = decision.tracks;
            const target  = decision.action === 'play'
                ? pickBiomeTrack(decision.name, tracks, isNightTime)
                : null;
            const playing = AudioManager._currentBgm && AudioManager._currentBgm.name;
            if (!target) {
                // A procedural map IS its biome, so a biome with nothing to play
                // and nothing next door to borrow is a silent place: fade out
                // whatever the party walked in with rather than dragging a
                // settlement theme across the open country around it. Hand-made
                // maps (house interiors, generic homes, ...) keep the old rule and
                // inherit the BGM of the map they were entered from.
                if (decision.action === 'stop') {
                    fadeOutBiomeBgm();
                    console.log(`[updateBiomeAudio] No BGM list for biome: ${biomeName}, stopping BGM`);  // i18n-ignore  console diagnostic
                } else {
                    console.log(`[updateBiomeAudio] No BGM list for biome: ${biomeName}, keeping current BGM`);  // i18n-ignore  console diagnostic
                }
            } else if (playing === target) {
                // The pick is stable for this (biome, nation, half of day), so
                // walking between two maps of the same biome never restarts it.
                console.log(`[updateBiomeAudio] Keeping BGM: ${playing} for biome: ${biomeName}`);
            } else {
                AudioManager.playBgm({ name: target, volume: 90, pitch: 100, pan: 0 });
                console.log(`[updateBiomeAudio] Playing BGM: ${target} for biome: ${decision.name} ` +
                            `(nation ${currentNationId()}, ${tracks.length} candidates)`);  // i18n-ignore  console diagnostic
            }
        }

        // Ambience is biome-driven on every map that declares a biome, not just
        // procedural ones, so tagged interiors get their room tone too. Maps
        // carrying their own autoplay BGS keep it.
        if (!isProcGenMap && $dataMap && $dataMap.autoplayBgs) return;
        playBiomeBgs(biome, biomeName, isNightTime, procGenData, isProcGenMap);
    }

    // Pick and start the biome's ambience. An empty (or all-blank) list means
    // "this biome has no ambience", which stops whatever BGS was playing.
    function playBiomeBgs(biome, biomeName, isNightTime, procGenData, isProcGenMap) {
        const clean     = arr => (arr || []).filter(n => n && n.trim());
        const nightList = clean(biome.bgsNight);
        const dayList   = clean(biome.bgs);
        const bgsList   = (isNightTime && nightList.length > 0) ? nightList : dayList;

        if (bgsList.length === 0) { fadeOutBiomeBgs(); return; }

        // Seed the pick so a given place always sounds the same: world origin on
        // procedural maps, map id everywhere else.
        const seed = isProcGenMap && procGenData
            ? (procGenData.seed || 0) + (procGenData.originX || 0) * 7 + (procGenData.originY || 0) * 13
            : $gameMap.mapId() * 31;
        const rng     = createSeededRandom ? createSeededRandom(seed + 1) : () => Math.random();
        const bgsName = bgsList[Math.floor(rng() * bgsList.length)];
        // Outdoors this bed is weather, so it goes out through WeatherAudio and
        // picks up the Weather Volume slider; indoors it is room tone and plays
        // at its authored level on the plain BGS volume.
        const bgs = { name: bgsName, volume: 80, pitch: 100, pan: 0 };
        const play = () => {
            if (window.WeatherAudio && window.WeatherAudio.playAmbience) {
                window.WeatherAudio.playAmbience(bgs);
            } else {
                AudioManager.playBgs(bgs);
            }
        };
        if (!crossfadeBiomeBgs(bgs, play)) return;   // already this bed: nothing changed
        console.log(`[updateBiomeAudio] Playing BGS: ${bgsName} for biome: ${biomeName}`);
    }

    // The world map is an overview, not a place: no room tone of its own, and
    // nothing the party was standing in down on a real map should follow them up
    // to it. Kill the vanilla BGS plus every MUSH channel EXCEPT the weather one
    // (channel 4, WeatherSystem's rain/night ambience), which is tied to the sky
    // rather than to the map and must keep playing across the transfer.
    const WEATHER_BGS_CHANNEL = 4;

    function stopAllBgsExceptWeather() {
        // Faded rather than cut, like every other ambience change: the party
        // walking back out onto the world map hears the place they were standing
        // in recede instead of vanishing between two frames.
        fadeOutBiomeBgs();
        const buffers = AudioManager._bgsBuffers;
        if (!buffers || !AudioManager.stopMushBgs) return;
        // Collect first: stopMushBgs splices the buffer list as it goes.
        const channels = buffers
            .map(b => b && b.channel)
            .filter(ch => ch !== undefined && ch !== null && ch != WEATHER_BGS_CHANNEL);
        for (const ch of channels) AudioManager.stopMushBgs(ch);
    }

    function updateEventVisibility() {
        const procGenData = $gameSystem._procGenData;
        if (!procGenData) return;
        // A wall-clock fade timer can fire mid-transfer, before $dataMap for the
        // destination map is populated; bail rather than deref null events.
        if (!$dataMap || !$dataMap.events) return;
        const isUnderground = procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0;
        const currentBiome  = procGenData.currentBiome || '';
        const isWaterBiome  = currentBiome === 'Ocean' || currentBiome === 'Seabed';  // i18n-ignore  biome ids
        const chestNames    = ['RandomItemChest', 'RandomArmorChest', 'RandomWeaponChest'];

        for (const event of $gameMap._events) {
            if (!event || !$dataMap.events[event._eventId]) continue;
            const eventName = $dataMap.events[event._eventId].name;
            if (eventName === 'GoDown') {
                const shouldHide = isUnderground || isWaterBiome;
                event.setOpacity(shouldHide ? 0 : 255);
                if (isWaterBiome && (event.x !== 0 || event.y !== 0)) event.setPosition(0, 0);
            } else if (eventName === 'GoUp') {
                const shouldShow = isUnderground && !isWaterBiome;
                event.setOpacity(shouldShow ? 255 : 0);
                if (isWaterBiome && (event.x !== 0 || event.y !== 0)) event.setPosition(0, 0);
            } else if (chestNames.includes(eventName)) {
                // Visibility follows PLACEMENT, never the layer stack. Every
                // structure entered off a terrain feature (a flight of stairs, a
                // grate, a cave mouth, a patron's hatch) is generated by
                // startForcedBiome as a fresh depth-0 map with an EMPTY layer
                // stack, so keying this on isUnderground left every dungeon,
                // crypt and cellar chest placed, solid and openable but drawn at
                // zero opacity. placeChestEvents is the one authority on which
                // chests exist here: it parks the rest at (0,0).
                event.setOpacity((event.x > 0 || event.y > 0) ? 255 : 0);
                if (currentBiome === 'Seabed' && (event.x !== 0 || event.y !== 0)) {  // i18n-ignore  biome id
                    event.setPosition(0, 0);
                    event.setOpacity(0);
                }
            }
        }

        parkRandomEncounters();
    }

    function refreshEnemiesForBiome() {
        if ($gameMap.mapId() !== PROC_MAP_ID) return;
        if (!$dataMap) return;
        const procGenData = $gameSystem._procGenData;
        if (!procGenData || !procGenData.currentBiome) return;
        console.log(`[refreshEnemiesForBiome] Refreshing enemies for biome: ${procGenData.currentBiome}`);
        const enemyEvents = $gameMap.events().filter(ev => {
            const eventData = ev.event();
            return eventData && eventData.name === 'Enemy';  // i18n-ignore  event name
        });
        for (const ev of enemyEvents) {
            ev._fixedTroopId    = 0;
            ev._isAquaticEnemy  = undefined;
            ev.setOpacity(0);
            ev.setThrough(true);
        }
        if (SceneManager._scene && SceneManager._scene.spawnEnemiesFromEncounters) {
            SceneManager._scene.spawnEnemiesFromEncounters();
        }
    }

    function getWorldMapCoordinates() {
        if (window.WorkSystem && window.WorkSystem.Destinations) {
            return window.WorkSystem.Destinations;
        }
        return {};
    }

    // Biomes that are open water from edge to edge: the party crosses them
    // swimming, diving or aboard a vehicle, never on foot. Any land they contain
    // comes from a prefab (an island, a wreck, a rig) and is incidental.
    function isOpenWaterBiome(biomeName) {
        return /^(ocean|seabed)$/i.test(String(biomeName || ''));
    }

    // A beach square is a shoreline: sand on one side, sea on the other. There is
    // always dry land to arrive on, so the party is never dropped into the surf
    // there - they would start swimming the instant they set foot on the square.
    // Everywhere else water is a legitimate landing tile and the swim-on-arrival
    // rearm in MovementInteractionSystem takes over.
    function isBeachSquare() {
        const procGenData = $gameSystem._procGenData;
        if (!procGenData) return false;
        return /^beach$/i.test(String(procGenData.currentBiome || '')) ||
               !!procGenData.displayAsBeach;
    }

    // Water on the procedural map: region 99, or terrain tag 3 (how the biome
    // generator paints every water tile on map 636).
    function isWaterTileAt(x, y) {
        return $gameMap.regionId(x, y) === 99 || $gameMap.terrainTag(x, y) === 3;
    }

    // Can the player stand on (x, y)? Valid tile, not a wall (terrain tag 4),
    // and passable from at least one direction (so we never strand the player
    // on water/obstacle tiles when entering a procedurally generated map).
    //
    // In an open-water biome the rule inverts: water IS the surface the party
    // occupies. Game_Map.isPassable answers for a walking character (no
    // swim/vehicle state on the checking character), so every ocean tile reads
    // as blocked - which used to drag the party off the border they sailed in
    // from and onto whatever prefab island the destination map happened to hold.
    function isStandableTile(x, y) {
        if (!$gameMap.isValid(x, y)) return false;
        if ($gameMap.terrainTag(x, y) === 4) return false;
        if (isBeachSquare() && isWaterTileAt(x, y)) return false;
        const procGenData = $gameSystem._procGenData;
        if (procGenData && isOpenWaterBiome(procGenData.currentBiome) &&
            isWaterTileAt(x, y) && $gameMap.regionId(x, y) !== 10) return true;
        if (!$gameMap.isPassable(x, y, 2) && !$gameMap.isPassable(x, y, 4) &&
            !$gameMap.isPassable(x, y, 6) && !$gameMap.isPassable(x, y, 8)) return false;
        return true;
    }

    // Which map border (if any) the tile sits on, as an axis + fixed coordinate.
    // Edge crossings land one tile inside the map (getEdgeCoordinateForDirection
    // clamps to 1 .. size-2), so the outermost two rings both count as "border".
    // Measured against the LOADED map, not against a square: a stitched window is
    // several squares wide and only its own outer ring is a border, while the
    // seams inside it are ordinary tiles the party walks straight over.
    function borderLineOf(x, y) {
        const w = $gameMap.width(), h = $gameMap.height();
        if (x <= 1 || x >= w - 2) return { axis: 'x', fixed: x };
        if (y <= 1 || y >= h - 2) return { axis: 'y', fixed: y };
        return null;
    }

    // After any transfer onto the procedural map (edge transition, goUp/goDown,
    // switchLayer, world->proc), the player can be dropped on a hardcoded tile
    // that the freshly generated terrain made non-passable. If so, relocate to
    // the nearest standable tile. No-op when already valid.
    //
    // A party that walked in over a map edge lands ON the border, and must stay
    // there: the search slides along the border line first and only spirals into
    // the map's interior when that whole edge is unusable.
    function ensurePlayerOnStandableTile() {
        if ($gameMap.mapId() !== PROC_MAP_ID) return;
        const x = $gamePlayer.x, y = $gamePlayer.y;
        if (isStandableTile(x, y)) return;

        const relocate = (nx, ny, how) => {
            console.log(`[WorldMapReturn] Landing tile (${x},${y}) not passable, relocating to (${nx},${ny}) (${how})`);
            $gamePlayer.locate(nx, ny);
        };

        // Pass 1: stay on the border the party entered through.
        const border = borderLineOf(x, y);
        if (border) {
            const along     = border.axis === 'x' ? y : x;
            const alongMax  = (border.axis === 'x' ? $gameMap.height() : $gameMap.width()) - 1;
            for (let d = 1; d <= alongMax; d++) {
                for (const step of [along - d, along + d]) {
                    // Keep off the outermost ring so the party is not parked on a
                    // tile that reads as another edge crossing.
                    if (step < 1 || step > alongMax - 1) continue;
                    const nx = border.axis === 'x' ? border.fixed : step;
                    const ny = border.axis === 'x' ? step : border.fixed;
                    if (!isStandableTile(nx, ny)) continue;
                    relocate(nx, ny, 'along border');  // i18n-ignore  relocate reason, logged
                    return;
                }
            }
        }

        // Pass 2: nearest standable tile anywhere on the map.
        const maxRadius = Math.max($gameMap.width(), $gameMap.height());
        for (let r = 1; r <= maxRadius; r++) {
            let best = null, bestDist = Infinity;
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const nx = x + dx, ny = y + dy;
                    if (!isStandableTile(nx, ny)) continue;
                    const dist = dx * dx + dy * dy;
                    if (dist < bestDist) { bestDist = dist; best = { x: nx, y: ny }; }
                }
            }
            if (best) { relocate(best.x, best.y, 'nearest'); return; }
        }
    }

    // ============================================================================
    // ADVENTURE MARKER LOGIC
    // ============================================================================

    // The squares still holding an unplayed adventure, straight from the plugin
    // that owns them. Without it there is simply nothing to draw.
    let mysteryRevision = null;   // which day's set is on screen
    function buildMysteryTiles() {
        const Earth = adventureSystem();
        mysteryTiles = Earth ? Earth.tiles() : new Set();
        mysteryRevision = (Earth && Earth.revision) ? Earth.revision() : null;
    }

    // Most squares wear a "???" plate. Eris's one square a day wears a heart
    // instead, in her own red: the party is meant to know which of the two they
    // are walking towards before they get there.
    const MYSTERY_PLATE      = '???';       // i18n-ignore: marker glyph
    const MYSTERY_PLATE_COLOR = '#ffe066';
    const ERIS_PLATE         = '\u2665';    // i18n-ignore: marker glyph
    const ERIS_PLATE_COLOR   = '#ff5c7a';

    function mysteryPlateAt(x, y) {
        const Earth = adventureSystem();
        let marker = null;
        try { marker = (Earth && Earth.markerAt) ? Earth.markerAt(x, y) : null; } catch (e) { }
        return (marker && marker.eris)
            ? { text: ERIS_PLATE, color: ERIS_PLATE_COLOR }
            : { text: MYSTERY_PLATE, color: MYSTERY_PLATE_COLOR };
    }

    class Sprite_MysteryMarker extends Sprite {
        initialize(tileX, tileY, plate) {
            super.initialize();
            this._tileX = tileX;
            this._tileY = tileY;
            this._plate = plate || { text: MYSTERY_PLATE, color: MYSTERY_PLATE_COLOR };
            this._bitmapCreated = false;
            this.z = 7; // above characters
            this.visible = false; // shown once positioned by the per-frame pass
        }
        createBitmap() {
            if (this._bitmapCreated) return;
            this.bitmap = new Bitmap(64, 40);
            this.bitmap.fontSize = MYSTERY_FONT_SIZE;
            this.bitmap.fontFace = 'GameFont, sans-serif';
            this.bitmap.fontBold = true;
            this.bitmap.outlineWidth = 4;
            this.bitmap.outlineColor = 'black';
            this.bitmap.textColor = this._plate.color;
            this.bitmap.drawText(this._plate.text, 0, 0, 64, 40, 'center');
            this.anchor.x = 0.5;
            this.anchor.y = 1;
            this._bitmapCreated = true;
        }
    }

    function removeMysteryMarkers() {
        for (const s of mysterySprites) {
            // s may already be destroyed by a prior scene teardown (transform null).
            if (s.transform && s.parent) s.parent.removeChild(s);
            if (s.transform && s.bitmap) s.bitmap.destroy();
        }
        mysterySprites = [];
        mysteryMarkersCreated = false;
    }

    function createMysteryMarkers() {
        removeMysteryMarkers();
        if (!mysteryTiles) return;
        const scene = SceneManager._scene;
        if (!scene || !scene._spriteset || !scene._spriteset._tilemap) return;
        mysterySprites = [];
        for (const key of mysteryTiles) {
            const parts = key.split(',');
            const mx = Number(parts[0]), my = Number(parts[1]);
            const sprite = new Sprite_MysteryMarker(mx, my, mysteryPlateAt(mx, my));
            scene._spriteset._tilemap.addChild(sprite);
            mysterySprites.push(sprite);
        }
        mysteryMarkersCreated = true;
    }

    // Mirror of WorldMap.js's shared city-label pass: shared viewport math once,
    // a cheap per-sprite bounds test, lazy bitmap creation.
    function refreshMysteryMarkers() {
        if (!mysterySprites.length || !$gameMap) return;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const halfW = Graphics.width / tw / 2;
        const halfH = Graphics.height / th / 2;
        const centerX = $gameMap.displayX() + halfW;
        const centerY = $gameMap.displayY() + halfH;
        const maxX = halfW + 5, maxY = halfH + 5;
        for (const s of mysterySprites) {
            const isNear = Math.abs(s._tileX - centerX) <= maxX &&
                           Math.abs(s._tileY - centerY) <= maxY;
            if (!isNear) { if (s.visible) s.visible = false; continue; }
            if (!s._bitmapCreated) s.createBitmap();
            s.x = ($gameMap.adjustX(s._tileX) + 0.5) * tw;
            s.y = ($gameMap.adjustY(s._tileY) + 1) * th;
            if (!s.visible) s.visible = true;
        }
    }

    // ============================================================================
    // QUEST MARKERS (active objective name plates)
    // ----------------------------------------------------------------------------
    // Same passive-sprite pattern as the "???" markers above: one sprite per world
    // tile that an accepted quest objective can be completed on, showing the quest
    // name (and "step n/m" for multi-step contracts). Coordinates come from
    // ProceduralQuestSystem's questMarkers(), which pins coordinate sites at their
    // own tile and destination objectives at the destination's world tile.
    // ============================================================================
    const QUEST_MARKER_FONT = 15;
    let questMarkerSprites = [];
    let questMarkerKey     = null;   // signature of the marker set on screen

    // Every quest the player is actively chasing, as pinned by KanbanQuest
    // (the single feed for colour/icon identity - see its activeMarkers()),
    // falling back to ProceduralQuests directly if the board plugin is absent.
    function activeQuestMarkerList() {
        const kb = window.KanbanQuest;
        if (kb && typeof kb.activeMarkers === 'function') {
            try { return kb.activeMarkers(); } catch (e) { }
        }
        const api = window.ProceduralQuests;
        if (!api || typeof api.questMarkers !== 'function') return [];
        try { return api.questMarkers(); } catch (e) { return []; }
    }

    function iconSetBitmap() {
        return ImageManager.loadSystem('IconSet');
    }

    // Crops one 32px IconSet cell into `bmp` at (dx,dy), scaled to `size`.
    // Silently does nothing if the sheet or the icon index isn't available.
    function bltIcon(bmp, icon, dx, dy, size) {
        if (icon == null) return;
        const sheet = iconSetBitmap();
        if (!sheet.isReady()) return;
        const cols = 16, cell = 32;
        const col = icon % cols, row = Math.floor(icon / cols);
        bmp.blt(sheet, col * cell, row * cell, cell, cell, dx, dy, size, size);
    }

    // One plate per tile: several objectives can share a coordinate, each
    // keeping its own colour/icon so two contracts pinned at the same spot are
    // still told apart.
    function collectQuestMarkers() {
        const byTile = new Map();
        for (const m of activeQuestMarkerList()) {
            if (m.wx == null || m.wy == null) continue;
            const key = m.wx + ',' + m.wy;
            let entry = byTile.get(key);
            if (!entry) {
                entry = { x: m.wx, y: m.wy, lines: [], colors: [], icons: [] };
                byTile.set(key, entry);
            }
            const step = m.multi ? ` ${m.step}/${m.stepCount}` : '';
            const line = m.label + step;
            if (!entry.lines.includes(line)) {
                entry.lines.push(line);
                entry.colors.push(m.color || '#ffd76a');
                entry.icons.push(m.icon != null ? m.icon : null);
            }
        }
        return Array.from(byTile.values());
    }

    class Sprite_QuestMarker extends Sprite {
        initialize(tileX, tileY, lines, colors, icons) {
            super.initialize();
            this._tileX = tileX;
            this._tileY = tileY;
            this._lines = lines;
            this._colors = colors || [];
            this._icons = icons || [];
            this._bitmapCreated = false;
            this.z = 8; // above the "???" plates
            this.visible = false;
        }
        createBitmap() {
            if (this._bitmapCreated) return;
            const iconSize = QUEST_MARKER_FONT + 3;
            const lineH = Math.max(QUEST_MARKER_FONT + 6, iconSize + 4);
            const textIndent = iconSize + 6;
            const w = 320;
            const pointer = 12; // room for the marker pip(s) under the text
            const h = lineH * this._lines.length + pointer + 4;
            this.bitmap = new Bitmap(w, h);
            this.bitmap.fontSize = QUEST_MARKER_FONT;
            this.bitmap.fontFace = 'GameFont, sans-serif';
            this.bitmap.fontBold = true;
            this.bitmap.outlineWidth = 4;
            this.bitmap.outlineColor = 'black';
            const iconsReady = iconSetBitmap().isReady();
            if (!iconsReady) {
                // Icons weren't loaded yet: draw text-only now, rebuild once they are.
                iconSetBitmap().addLoadListener(() => { this._bitmapCreated = false; });
            }
            for (let i = 0; i < this._lines.length; i++) {
                this.bitmap.textColor = this._colors[i] || '#ffd76a';
                this.bitmap.drawText(this._lines[i], textIndent, i * lineH, w - textIndent, lineH, 'center');
                if (iconsReady) {
                    bltIcon(this.bitmap, this._icons[i], 4, i * lineH + (lineH - iconSize) / 2, iconSize);
                }
            }
            // One coloured diamond pip per quest sharing this tile, pointing down
            // at it, fanned out so they never merge into a single blob.
            const ctx = this.bitmap.context;
            const cy = h - pointer / 2 - 2;
            const r = 5;
            const step = (r + 3) * 1.6;
            const n = this._colors.length || 1;
            const startX = w / 2 - ((n - 1) * step) / 2;
            for (let i = 0; i < n; i++) {
                const px = startX + i * step;
                ctx.save();
                ctx.fillStyle = this._colors[i] || '#ffd76a';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px, cy - r);
                ctx.lineTo(px + r, cy);
                ctx.lineTo(px, cy + r);
                ctx.lineTo(px - r, cy);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
            this.bitmap._baseTexture.update();
            this.anchor.x = 0.5;
            this.anchor.y = 1;
            this._bitmapCreated = true;
        }
    }

    function removeQuestMarkers() {
        for (const s of questMarkerSprites) {
            if (s.transform && s.parent) s.parent.removeChild(s);
            if (s.transform && s.bitmap) s.bitmap.destroy();
        }
        questMarkerSprites = [];
        questMarkerKey = null;
    }

    function createQuestMarkers(markers) {
        removeQuestMarkers();
        const scene = SceneManager._scene;
        if (!scene || !scene._spriteset || !scene._spriteset._tilemap) return;
        for (const m of markers) {
            const sprite = new Sprite_QuestMarker(m.x, m.y, m.lines, m.colors, m.icons);
            scene._spriteset._tilemap.addChild(sprite);
            questMarkerSprites.push(sprite);
        }
    }

    function refreshQuestMarkers() {
        if (!questMarkerSprites.length || !$gameMap) return;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const halfW = Graphics.width / tw / 2;
        const halfH = Graphics.height / th / 2;
        const centerX = $gameMap.displayX() + halfW;
        const centerY = $gameMap.displayY() + halfH;
        const maxX = halfW + 6, maxY = halfH + 6;
        for (const s of questMarkerSprites) {
            const isNear = Math.abs(s._tileX - centerX) <= maxX &&
                           Math.abs(s._tileY - centerY) <= maxY;
            if (!isNear) { if (s.visible) s.visible = false; continue; }
            if (!s._bitmapCreated) s.createBitmap();
            s.x = ($gameMap.adjustX(s._tileX) + 0.5) * tw;
            s.y = $gameMap.adjustY(s._tileY) * th;
            if (!s.visible) s.visible = true;
        }
    }

    // Rebuilds when the accepted-objective set changes (or the tilemap is
    // recreated by a scene change), so accepting or finishing a quest updates the
    // board without a reload.
    function updateQuestMarkers() {
        if (!$gameMap) return;
        if ($gameMap.mapId() !== worldMapId) {
            if (questMarkerSprites.length) removeQuestMarkers();
            return;
        }
        const markers = collectQuestMarkers();
        const key = markers.map(m => m.x + ',' + m.y + ':' + m.lines.join('|')).join(';');
        const tilemap = SceneManager._scene && SceneManager._scene._spriteset
            ? SceneManager._scene._spriteset._tilemap : null;
        const stale = questMarkerSprites.length &&
            (questMarkerSprites[0].transform === null || questMarkerSprites[0].parent !== tilemap);
        if (key !== questMarkerKey || stale) {
            createQuestMarkers(markers);
            questMarkerKey = key;
        }
        refreshQuestMarkers();
    }

    // ============================================================================
    // QUEST COMPASS (screen-edge direction arrows, every map)
    // ----------------------------------------------------------------------------
    // The plates above are pinned to a real tile and only mean anything within
    // sight of it. While an objective is off-screen on map 315, an arrow at the
    // border points toward it (the same GTA trick WorldMap.js's fullscreen "M"
    // sheet already uses) and steps aside once the plate can do the job exactly.
    // On any OTHER map - procedural or authored - there is no tile-precise
    // position for an objective pinned on a different world square, so the
    // arrow there carries direction only: the delta between this map's own
    // world square (currentWorldCoords()) and the objective's. Standing on the
    // very square it's pinned to collapses that delta to (0,0); rather than
    // invent a direction, the marker docks at a fixed "it's here somewhere"
    // post instead of pointing.
    // ============================================================================
    const COMPASS_MARGIN = 40;   // px kept clear of the real screen edge
    const COMPASS_ARROW = 24;    // arrow sprite size
    const COMPASS_ICON = 20;     // IconSet crop size on the label plate
    let compassContainer = null;
    let compassKey = null;
    // The marker list the compass is drawn from, kept between frames. Building
    // it is the expensive half of the compass and the half that almost never
    // changes: KanbanQuest.activeMarkers() allocates an array, a Set and one
    // object per marker, and compassSignature() then maps and joins the whole
    // lot into a string, all of it per frame, on every map, purely to find out
    // that the quest log had not moved. Where the markers are drawn still
    // follows the camera every frame; only the list behind them is rationed.
    let compassMarkers = null;
    let compassMarkersAtKey = null;
    const compassArrowBitmaps = new Map(); // colour -> cached triangle bitmap

    function compassArrowBitmap(color) {
        const key = color || '#ffd76a';
        const cached = compassArrowBitmaps.get(key);
        if (cached) return cached;
        const s = COMPASS_ARROW;
        const bmp = new Bitmap(s, s);
        const ctx = bmp.context;
        ctx.beginPath();
        ctx.moveTo(s / 2, 1);
        ctx.lineTo(s - 2, s - 3);
        ctx.lineTo(s / 2, s - 8);
        ctx.lineTo(2, s - 3);
        ctx.closePath();
        ctx.fillStyle = key;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        bmp.baseTexture.update();
        compassArrowBitmaps.set(key, bmp);
        return bmp;
    }

    // Quest icon + name, tinted to the quest's own colour, sized to its text.
    function compassLabelSprite(marker) {
        const text = marker.label || marker.title || '?';
        const probe = new Bitmap(8, 8);
        probe.fontFace = 'GameFont, sans-serif';
        probe.fontSize = QUEST_MARKER_FONT;
        probe.fontBold = true;
        const textW = Math.ceil(probe.measureTextWidth(text));
        if (probe.destroy) probe.destroy();
        const iconsReady = iconSetBitmap().isReady();
        const pad = 5;
        const iconW = (iconsReady && marker.icon != null) ? COMPASS_ICON + pad : 0;
        const w = Math.max(24, iconW + textW + pad * 2);
        const h = Math.max(COMPASS_ICON, QUEST_MARKER_FONT + 6);
        const bmp = new Bitmap(w, h);
        if (iconW) {
            bltIcon(bmp, marker.icon, 0, (h - COMPASS_ICON) / 2, COMPASS_ICON);
        } else if (!iconsReady) {
            iconSetBitmap().addLoadListener(() => { compassKey = null; }); // rebuild once loaded
        }
        bmp.fontFace = 'GameFont, sans-serif';
        bmp.fontSize = QUEST_MARKER_FONT;
        bmp.fontBold = true;
        bmp.outlineWidth = 4;
        bmp.outlineColor = 'black';
        bmp.textColor = marker.color || '#ffd76a';
        bmp.drawText(text, iconW, 0, textW + 4, h, 'left');
        const sprite = new Sprite(bmp);
        sprite.anchor.x = 0.5;
        return sprite;
    }

    function ensureCompassContainer() {
        const scene = SceneManager._scene;
        if (!scene || !(scene instanceof Scene_Map)) return null;
        if (compassContainer && (compassContainer.transform === null || compassContainer.parent !== scene)) {
            compassContainer = null;
            compassKey = null;
        }
        if (!compassContainer) {
            compassContainer = new Sprite();
            compassContainer._groups = [];
            // Added after every window Scene_Map.createAllWindows already built
            // (this runs from the update loop, later), so it draws above them -
            // a small HUD overlay, like the party HUD or the minimap.
            scene.addChild(compassContainer);
        }
        return compassContainer;
    }

    function removeCompassMarkers() {
        if (compassContainer) {
            for (const group of compassContainer._groups || []) {
                if (group._label && group._label.bitmap) group._label.bitmap.destroy();
            }
            if (compassContainer.transform && compassContainer.parent) {
                compassContainer.parent.removeChild(compassContainer);
            }
        }
        compassContainer = null;
        compassKey = null;
    }

    function hideCompassMarkers() {
        if (!compassContainer) return;
        for (const group of compassContainer._groups) group.visible = false;
    }

    function compassSignature(markers) {
        return markers.map(m => m.qid + ':' + m.wx + ',' + m.wy + ':' + (m.label || m.title)).join(';');
    }

    function buildCompassMarkers(markers) {
        const container = ensureCompassContainer();
        if (!container) return null;
        // The arrow bitmap is shared/cached by colour and must survive; only the
        // per-marker label bitmap (freshly drawn text+icon) is this build's own.
        for (const group of container._groups) {
            if (group._label && group._label.bitmap) group._label.bitmap.destroy();
        }
        container.removeChildren();
        container._groups = [];
        for (const m of markers) {
            const group = new Sprite();
            const arrow = new Sprite(compassArrowBitmap(m.color));
            arrow.anchor.x = 0.5;
            arrow.anchor.y = 0.5;
            const label = compassLabelSprite(m);
            group.addChild(arrow);
            group.addChild(label);
            group._arrow = arrow;
            group._label = label;
            group._marker = m;
            group.visible = false;
            container.addChild(group);
            container._groups.push(group);
        }
        return container;
    }

    // Screen position of a tile on the map currently loaded, after the camera
    // zoom MousePan.js applies on map 315 (pivoted on the screen centre there).
    function localTileScreenPos(tx, ty) {
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const baseX = ($gameMap.adjustX(tx) + 0.5) * tw;
        const baseY = ($gameMap.adjustY(ty) + 0.5) * th;
        const zoom = $gameScreen ? $gameScreen.zoomScale() : 1;
        if (!zoom || zoom === 1) return { x: baseX, y: baseY };
        const zx = $gameScreen.zoomX(), zy = $gameScreen.zoomY();
        return { x: zx + (baseX - zx) * zoom, y: zy + (baseY - zy) * zoom };
    }

    function updateQuestCompass() {
        if (!$gameMap) return;
        // Never over a message/choice window: those run inside Scene_Map itself
        // rather than a pushed scene, so the compass would otherwise draw over them.
        if ($gameMessage && $gameMessage.isBusy()) { hideCompassMarkers(); return; }
        // Rescanned a few times a second rather than sixty. FrameBudget.every
        // answers true when it is absent as well as when the budget allows it,
        // so a missing budget simply rescans as before rather than going blind.
        if (compassMarkers === null ||
            !window.FrameBudget || window.FrameBudget.every('questCompassScan', 5)) {
            compassMarkers = activeQuestMarkerList();
        }
        const markers = compassMarkers;
        if (!markers.length) { removeCompassMarkers(); return; }

        // Only worth re-deriving on a frame that actually rescanned; between
        // those the list is the very same array and the key cannot have moved.
        if (compassKey === null || markers !== compassMarkersAtKey) {
            const key = compassSignature(markers);
            if (key !== compassKey) {
                if (!buildCompassMarkers(markers)) return;
                compassKey = key;
            }
            compassMarkersAtKey = markers;
        }
        const container = ensureCompassContainer();
        if (!container) return;

        const cx = Graphics.width / 2;
        const cy = Graphics.height / 2;
        const halfW = Math.max(1, cx - COMPASS_MARGIN);
        const halfH = Math.max(1, cy - COMPASS_MARGIN);
        const onWorldMap = $gameMap.mapId() === worldMapId;
        // Off map 315 there's no tile-precise target: resolve where THIS map
        // sits in world-tile space once a frame, not once per marker.
        const here = onWorldMap ? null : currentWorldCoords();

        for (const group of container._groups) {
            const m = group._marker;
            let dx, dy, arrived = false;

            if (onWorldMap) {
                const pos = localTileScreenPos(m.wx, m.wy);
                // Inside the viewport (minus the band the arrow occupies): the
                // real plate above is doing the job, so the compass steps aside.
                if (pos.x >= COMPASS_MARGIN && pos.x <= Graphics.width - COMPASS_MARGIN &&
                    pos.y >= COMPASS_MARGIN && pos.y <= Graphics.height - COMPASS_MARGIN) {
                    group.visible = false;
                    continue;
                }
                dx = pos.x - cx;
                dy = pos.y - cy;
            } else {
                dx = m.wx - here.x;
                dy = m.wy - here.y;
                arrived = (dx === 0 && dy === 0);
            }

            const label = group._label;
            const lw = label.bitmap.width / 2;

            if (arrived) {
                group.visible = true;
                group._arrow.visible = false;
                label.x = Math.min(Graphics.width - lw - 4, Math.max(lw + 4, cx));
                label.y = COMPASS_MARGIN;
                continue;
            }
            if (!dx && !dy) { group.visible = false; continue; }

            group.visible = true;
            group._arrow.visible = true;

            const ratio = Math.min(
                Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity,
                Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity);
            const ex = cx + dx * ratio;
            const ey = cy + dy * ratio;

            group._arrow.x = ex;
            group._arrow.y = ey;
            group._arrow.rotation = Math.atan2(dy, dx) + Math.PI / 2;

            label.x = Math.min(Graphics.width - lw - 4, Math.max(lw + 4, ex));
            label.y = ey < cy
                ? ey + COMPASS_ARROW / 2 + 2
                : ey - COMPASS_ARROW / 2 - 2 - label.bitmap.height;
        }
    }

    // Per-frame driver (called from Scene_Map.update). Rebuilds tiles on each fresh
    // entry to the world map and tears everything down when leaving it. The set
    // also shrinks in place, the moment an adventure is answered, so the plate is
    // re-read every MARKER_RECHECK_FRAMES while the party stands on the map.
    const MARKER_RECHECK_FRAMES = 30;
    let markerRecheck = 0;
    function updateMysteryMarkers() {
        if (!$gameMap) return;
        if ($gameMap.mapId() !== worldMapId) {
            if (mysteryTiles || mysterySprites.length) { removeMysteryMarkers(); mysteryTiles = null; }
            return;
        }
        if (!mysteryTiles) buildMysteryTiles();
        else if (++markerRecheck >= MARKER_RECHECK_FRAMES) {
            markerRecheck = 0;
            const before = mysteryTiles.size;
            const wasRevision = mysteryRevision;
            buildMysteryTiles();
            // The set is redrawn once a game day, so a change of day is a change
            // of markers even when the count happens to come out the same.
            if (mysteryTiles.size !== before || mysteryRevision !== wasRevision) {
                removeMysteryMarkers();
            }
        }
        // Sprites are parented to the active spriteset's tilemap. On a scene
        // change (leaving and re-entering the world map) that tilemap is rebuilt
        // and the old sprites are destroyed, so rebuild if ours are stale.
        const tilemap = SceneManager._scene && SceneManager._scene._spriteset
            ? SceneManager._scene._spriteset._tilemap : null;
        if (!mysteryMarkersCreated || (mysterySprites.length &&
            (mysterySprites[0].transform === null || mysterySprites[0].parent !== tilemap))) {
            createMysteryMarkers();
        }
        refreshMysteryMarkers();
    }

    // Park every <RandomEncounter> event authored on the procedural map (636) in
    // its corner, invisible and unwalkable. 636 is one map reused for every world
    // square, so an encounter left standing where it was authored would be met on
    // every square in the world. Nothing deals them any more: the world map's
    // adventures are played on map 315 itself (ProceduralAdventureSystem.js).
    const PARKED_ENCOUNTER_EVENT = 'Eris';  // i18n-ignore  event name in Map636
    function parkRandomEncounters() {
        if ($gameMap.mapId() !== procMapId) return;
        for (const event of $gameMap._events) {
            if (!event) continue;
            const data = $dataMap.events[event._eventId];
            if (!data) continue;
            if (data.name !== PARKED_ENCOUNTER_EVENT &&
                !/RandomEncounter/i.test(data.note || '')) continue;
            event.setOpacity(0);
            event.setThrough(true);
            // A parked encounter must not wander off its corner while invisible:
            // an authored random move type would leave a ghost the player can
            // still trigger by walking into it.
            event._moveType = 0;
            if (event.x !== 0 || event.y !== 0) event.setPosition(0, 0);
        }
    }

    // ============================================================================
    // GAME_SYSTEM EXTENSIONS
    // ============================================================================

    Game_System.prototype.getReturnCoordinates = function(_exitDirection) {
        const vx = $gameVariables.value(VAR_WORLD_X) || 0;
        const vy = $gameVariables.value(VAR_WORLD_Y) || 0;
        if (!this._procGenData) return { x: vx, y: vy };
        const x = this._procGenData.originX != null ? this._procGenData.originX : vx;
        const y = this._procGenData.originY != null ? this._procGenData.originY : vy;
        return { x, y };
    };

    Game_System.prototype.getAdjacentWorldCoordinates = function(exitDirection) {
        let newX = $gameVariables.value(VAR_WORLD_X);
        let newY = $gameVariables.value(VAR_WORLD_Y);
        switch (exitDirection) {
            case 2: newY += 1; break;
            case 4: newX -= 1; break;
            case 6: newX += 1; break;
            case 8: newY -= 1; break;
        }
        return { x: newX, y: newY };
    };

    Game_System.prototype.getEdgeCoordinateForDirection = function(exitDirection, playerX, playerY) {
        let x = playerX !== undefined ? playerX : Math.floor(PROC_MAP_WIDTH  / 2);
        let y = playerY !== undefined ? playerY : Math.floor(PROC_MAP_HEIGHT / 2);
        switch (exitDirection) {
            case 2: y = 1;                  break;
            case 4: x = PROC_MAP_WIDTH - 2; break;
            case 6: x = 1;                  break;
            case 8: y = PROC_MAP_HEIGHT - 2; break;
            default:
                x = Math.floor(PROC_MAP_WIDTH  / 2);
                y = Math.floor(PROC_MAP_HEIGHT / 2);
        }
        x = Math.max(1, Math.min(x, PROC_MAP_WIDTH  - 2));
        y = Math.max(1, Math.min(y, PROC_MAP_HEIGHT - 2));
        return { x, y };
    };

    // ============================================================================
    // WHAT THE MAP NAME BANNER SAYS
    // ============================================================================
    // An ordinary square is announced by its biome. A generated STRUCTURE is
    // announced by its own name instead: nothing underground used to have one,
    // so the banner over every stairway in the world read "Loot Cellar". The
    // name is composed by ProcGenDungeon from the structure's word banks and is
    // derived, not stored - (world seed, world square, entrance tile) always
    // gives the same one - so a place read a hundred hours later is still
    // called what it was. It is cached on the dungeon session so the two places
    // that set the banner cannot disagree.
    function procMapDisplayName() {
        const pg = $gameSystem._procGenData;
        if (!pg) return '';
        const D = window.ProcGenDungeon;
        const S = (D && typeof D.structure === 'function') ? D.structure(pg.currentBiome) : null;
        if (S && window.StructureNames) {
            const sess = pg._dungeonSession;
            if (sess && sess.name) return sess.name;
            const name = window.StructureNames.nameFor(pg.currentBiome, (sess && sess.salt) || 0);
            if (sess) sess.name = name;
            return name;
        }
        let displayName = pg.currentBiome;
        if (pg.displayAsIsland)     displayName = 'Island';
        else if (pg.displayAsBeach) displayName = 'Beach';
        return window.BiomeNames.display(displayName);
    }

    // Put the procedural-map state back on the surface: an empty layer stack and
    // no structure session, which is what "not underground" is spelled as
    // everywhere it is read. Returns true when it actually had to undo something,
    // so callers can say so in the log.
    //
    // The stack is only ever popped by goUp, and anything that leaves the
    // procedural map without going back up the way it came in (a shovel used off
    // the proc map, a border that hands the party to an authored map, a return to
    // the world map from the menu) used to leave it raised for good.
    function surfaceProcGenLayers(pg) {
        if (!pg) return false;
        const wasUnderground = !!((pg.biomeLayerStack && pg.biomeLayerStack.length) || pg._dungeonSession);
        pg.biomeLayerStack = [];
        pg._dungeonSession = null;
        return wasUnderground;
    }

    // Biomes that exist only at the top: nothing in Biomes.json names them as
    // its lowerLayer, so standing in one means standing on the surface however
    // the layer stack reads. Computed once off the biome table.
    let _surfaceOnlyCache = null;
    function isSurfaceOnlyBiome(biomeName) {
        if (!biomeName) return false;
        if (!_surfaceOnlyCache) {
            const list = (window.WorldGen && window.WorldGen.Biomes) || [];
            if (!list.length) return false;
            _surfaceOnlyCache = new Set();
            list.forEach(b => { if (b && b.lowerLayer) _surfaceOnlyCache.add(b.lowerLayer); });
        }
        return !_surfaceOnlyCache.has(biomeName);
    }

    Game_System.prototype.clearProcGenData = function() {
        if (!this._procGenData) return;
        // The stitched window goes with it: it is a view onto squares that no
        // longer mean anything once the party has left the procedural map.
        if (window.ProcStitch) window.ProcStitch.close();
        this._procGenData.generatedMapData     = null;
        this._procGenData.currentBiome         = null;
        this._procGenData.currentRoadDirection = null;
        this._procGenData.lastLoadedProcMapX   = null;
        this._procGenData.lastLoadedProcMapY   = null;
        // The square a descent was started from goes with it: the party is
        // leaving the procedural map entirely, so there is nothing to surface to.
        this._procGenData._surfaceSnapshot     = null;
        // And so does the descent itself. A non-empty layer stack means "we are
        // underground", and every square built while it is raised is built as a
        // lower layer (edge crossings swap the neighbour for its biome.lowerLayer,
        // the seed is depth-salted, events are hidden). Left standing after the
        // party has gone back to the world map it turns the whole world into a
        // cave: every square entered from map 315 generates underground.
        surfaceProcGenLayers(this._procGenData);
        Cache.clear();
        $gameVariables.setValue(110, 0);
        $gameVariables.setValue(111, 0);
    };

    // ============================================================================
    // PROCEDURAL SQUARE SNAPSHOT / RESTORE
    // ----------------------------------------------------------------------------
    // Every excursion that leaves the procedural map for a submap -- a structure
    // biome entered off a terrain feature (Grate, StairsDown, StairsUp, Cave,
    // Hatch), a house interior, a floor of a tower block -- has to put the party
    // back on the very square they walked out of: same world coordinates, same
    // biome, same tiles.
    //
    // A square is deterministic from (world seed, world coordinates, layer depth),
    // but only while the description it was built from survives the trip, and an
    // excursion that generates a map of its own (startForcedBiome) overwrites that
    // description in place. So it is snapshotted on the way out and restored on
    // the way back.
    //
    // What must never happen is re-resolving the biome from the world-map tile
    // column while standing somewhere else: Game_System.getBiomeFromWorldCoordinates
    // reads $gameMap, which off map 315 is whichever 64x64 submap the party is in,
    // and answers with a biome that has nothing to do with the square they left.
    // ============================================================================

    // opts.terrain carries the generated tile array along too. Needed whenever the
    // excursion replaces it (a forced-biome structure does); left out otherwise so
    // that a house visit does not carry a second copy of the map in the save.
    function snapshotProcSurface(opts) {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg || !pg.currentBiome) return null;
        const snap = {
            originX:                pg.originX,
            originY:                pg.originY,
            currentBiome:           pg.currentBiome,
            currentRoadDirection:   pg.currentRoadDirection,
            currentUnderBiome:      pg.currentUnderBiome,
            currentBridgeDirection: pg.currentBridgeDirection,
            currentBiomeTileset:    pg.currentBiomeTileset,
            seed:                   pg.seed,
            biomeLayerStack:        (pg.biomeLayerStack || []).slice(),
            displayAsBeach:         !!pg.displayAsBeach,
            displayAsIsland:        !!pg.displayAsIsland,
            biomeDayTemperature:    pg.biomeDayTemperature,
            biomeNightTemperature:  pg.biomeNightTemperature,
            goDownEventX:           pg.goDownEventX,
            goDownEventY:           pg.goDownEventY,
        };
        if (opts && opts.terrain) {
            snap.generatedMapData = pg.generatedMapData;
            // The prefab pass's "this square already has its prefabs" mark
            // belongs to that array, so it travels with it. Without it, a square
            // handed back after a save/reload would be prefabbed a second time,
            // on top of the prefabs its tiles already carry.
            snap.prefabbedSig = pg._prefabbedSig;
        }
        return snap;
    }

    // Rebuild a square's tiles from the world seed + coordinates + layer depth.
    // Adjacency is read from the coordinate cache, which answers from any map,
    // never from the live world-map tile column, which does not.
    function regenerateProcSurface(pg, biomeName, roadDirection, originX, originY) {
        const biome = getBiomeByName(biomeName);
        if (!biome || !generateProceduralTerrain) return false;

        let adjacentBiomes = null, cacheInfo = null;
        const cache = pg.biomeCoordinateCache;
        if (cache && Object.keys(cache).length > 0) {
            const adj = getAdjacentBiomesFromCache(originX, originY, cache);
            adjacentBiomes = {
                north: normalizeBiomeForEdge(adj.north),
                south: normalizeBiomeForEdge(adj.south),
                east:  normalizeBiomeForEdge(adj.east),
                west:  normalizeBiomeForEdge(adj.west),
            };
            cacheInfo = checkAdjacentMapBiomesFromCache(originX, originY, cache);
        }

        const depth = (pg.biomeLayerStack || []).length;
        const seed  = procMapSeed(originX, originY, depth);
        const data  = generateProceduralTerrain(
            biome, seed, roadDirection || null, adjacentBiomes, cacheInfo,
            { x: originX, y: originY }, cache
        );
        if (data) pg.generatedMapData = data;
        return !!data;
    }

    // Put a snapshot back onto $gameSystem._procGenData. Returns false when there
    // is nothing usable to restore, so the caller can fall back to its old path.
    function restoreProcSurface(snap) {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg || !snap || !snap.currentBiome) return false;

        const originX = snap.originX != null ? snap.originX : $gameVariables.value(VAR_WORLD_X);
        const originY = snap.originY != null ? snap.originY : $gameVariables.value(VAR_WORLD_Y);

        // World coordinates first: the terrain, the biome cache, the border
        // crossings and every later transfer are keyed on them, and a submap must
        // never leave the party standing on a different square of the world.
        $gameVariables.setValue(VAR_WORLD_X, originX);
        $gameVariables.setValue(VAR_WORLD_Y, originY);
        pg.originX = originX;
        pg.originY = originY;

        pg.currentBiome           = snap.currentBiome;
        pg.currentRoadDirection   = snap.currentRoadDirection || null;
        pg.currentUnderBiome      = snap.currentUnderBiome || null;
        pg.currentBridgeDirection = snap.currentBridgeDirection || null;
        pg.currentBiomeTileset    = snap.currentBiomeTileset;
        pg.biomeLayerStack        = (snap.biomeLayerStack || []).slice();
        pg.displayAsBeach         = !!snap.displayAsBeach;
        pg.displayAsIsland        = !!snap.displayAsIsland;
        if (snap.seed                  != null) pg.seed                  = snap.seed;
        if (snap.biomeDayTemperature   != null) pg.biomeDayTemperature   = snap.biomeDayTemperature;
        if (snap.biomeNightTemperature != null) pg.biomeNightTemperature = snap.biomeNightTemperature;
        if (snap.goDownEventX          != null) pg.goDownEventX          = snap.goDownEventX;
        if (snap.goDownEventY          != null) pg.goDownEventY          = snap.goDownEventY;
        // _dungeonSession is deliberately left alone: it says where the party IS,
        // not what the square looked like, and its owner clears it.

        // The tiles: the snapshot's own array when it carried one, otherwise a
        // deterministic rebuild from the square's canonical seed.
        if (snap.generatedMapData) {
            pg.generatedMapData = snap.generatedMapData;
            pg._prefabbedSig    = snap.prefabbedSig;
        } else if (!pg.generatedMapData) {
            regenerateProcSurface(pg, snap.currentBiome, pg.currentRoadDirection, originX, originY);
        }

        // Force loadMapData / performTransfer to rebuild map 636 from file and
        // re-inject this terrain: $dataMap still holds the submap, events and all.
        pg.lastLoadedProcMapX = null;
        pg.lastLoadedProcMapY = null;
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        return !!pg.generatedMapData;
    }

    // ----------------------------------------------------------------------------
    // RESPAWN POINTS ON THE PROCEDURAL MAP
    //
    // "Map 636, tile 21,30" is not a place. Map 636 is the one map the whole
    // world is played on, so a respawn point registered out in the wild -- the
    // square an origin began on, a camp slept in, the last autosave -- only means
    // something if it also says WHICH square: the world coordinates and the biome
    // description it was built from. Without them a death out on the map wakes
    // the party on whatever square happened to be loaded when they died, which is
    // the square that just killed them (or, worse, the cave they died in).
    //
    // The tiles are deliberately left out of these snapshots: a square is
    // deterministic from (world seed, coordinates, layer depth), so it is rebuilt
    // on the way back rather than parking a 64x64x6 array in the savegame for
    // every respawn point the save keeps.
    // ----------------------------------------------------------------------------

    // The square the party is standing on, in the form a respawn point stores.
    // Answers null anywhere but the procedural map, and inside a structure
    // entered off it (a cellar, a vault, a house): those are sessions the party
    // is INSIDE, and a respawn puts them back out on the world's own squares.
    function snapshotProcRespawn() {
        if (!$gameMap || $gameMap.mapId() !== procMapId) return null;
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg || pg._dungeonSession) return null;
        return snapshotProcSurface();
    }

    // Rebuild a stored respawn square, ready for a transfer to map 636 to land on
    // it. Whatever square the party died on is cleared out of the way first, so
    // the restore cannot keep its tiles, its descent or its structure session.
    // Answers false when there is nothing usable to rebuild, so the caller can
    // send the party somewhere that does exist instead of onto a blank 636.
    function restoreProcRespawn(snap) {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg || !snap || !snap.currentBiome) return false;
        surfaceProcGenLayers(pg);
        pg._surfaceSnapshot = null;
        pg.generatedMapData = null;
        $gameSystem._procEntryBorder = null;
        return restoreProcSurface(snap);
    }

    // Descending into a layer of the same square -- a cave through goDown or
    // switchLayer, a dungeon through a DoorDungeon tile -- overwrites the
    // surface's tile array in place, and surfacing used to rebuild it from the
    // seed alone. That rebuild was NOT the same map, twice over:
    //
    //   - the adjacency the square was first generated with is unreachable from
    //     inside the submap (goUp only ever looked for it on the world map, which
    //     is never the map being stood on when surfacing), and the road direction
    //     was dropped outright, so the tiles themselves came back different;
    //   - and no prefab was put back on them at all. Prefabs are stamped by
    //     ProceduralMapPrefabs' DataManager.loadMapData hook, which the proc-map
    //     loader only reaches when the world coordinates have changed since the
    //     last load -- and surfacing lands on the same square it descended from.
    //     So the mountain a dungeon door was cut into was simply gone, door and
    //     all, the moment the party climbed back out of it.
    //
    // The square is kept instead, exactly as it was, tiles and prefabs included,
    // and handed straight back.
    function stashSurfaceSnapshot(pg) {
        if (!pg) return;
        pg._surfaceSnapshot = snapshotProcSurface({ terrain: true });
    }

    // Put back the square a descent started from. Only a snapshot of the biome
    // AND the world square actually being surfaced to is accepted, so a stale one
    // -- a descent the party never climbed out of because they died and respawned
    // somewhere else, say -- is dropped rather than pasted over the square they
    // are really standing on.
    function popSurfaceSnapshot(pg, biomeName) {
        const snap = pg && pg._surfaceSnapshot;
        if (!snap) return false;
        pg._surfaceSnapshot = null;
        if (snap.currentBiome !== biomeName) return false;
        if (snap.originX !== pg.originX || snap.originY !== pg.originY) return false;
        return restoreProcSurface(snap);
    }

    // Fallback for a surfacing with no snapshot to put back (a save made before
    // descents kept one). Rebuild the square from its canonical seed, reading
    // adjacency from the coordinate cache when the world map is not the map being
    // stood on -- surfacing out of a submap, it never is -- and keeping the road
    // direction, which the old rebuild dropped and with it the square's road.
    // Clearing lastLoadedProcMap* is what lets the prefab pass see the rebuilt
    // array: without it the proc-map loader short-circuits on the unchanged world
    // coordinates and the square surfaces bare.
    function rebuildSurfaceFromSeed(pg, biomeName, biome) {
        const seed  = procMapSeed(pg.originX, pg.originY, (pg.biomeLayerStack || []).length);
        const cache = pg.biomeCoordinateCache;
        const hasCache = cache && Object.keys(cache).length > 0;

        let adjacentBiomes = null, diagonalBiomes = null, cacheInfo = null;
        if ($gameMap.mapId() === WORLD_MAP_ID) {
            adjacentBiomes = getAdjacentBiomesOnWorldMap(pg.originX, pg.originY);
        } else if (hasCache) {
            adjacentBiomes = getAdjacentBiomesFromCache(pg.originX, pg.originY, cache);
        }
        if (adjacentBiomes) {
            adjacentBiomes = {
                north: normalizeBiomeForEdge(adjacentBiomes.north),
                south: normalizeBiomeForEdge(adjacentBiomes.south),
                east:  normalizeBiomeForEdge(adjacentBiomes.east),
                west:  normalizeBiomeForEdge(adjacentBiomes.west),
            };
        }
        if (hasCache) {
            cacheInfo      = checkAdjacentMapBiomesFromCache(pg.originX, pg.originY, cache);
            diagonalBiomes = checkDiagonalMapBiomesFromCache(pg.originX, pg.originY, cache);
        }

        pg.displayAsBeach  = shouldDisplayAsBeach(biomeName, adjacentBiomes, diagonalBiomes);
        pg.displayAsIsland = shouldDisplayAsIsland ? shouldDisplayAsIsland(biomeName, adjacentBiomes) : false;
        pg.generatedMapData = generateProceduralTerrain(
            biome, seed, pg.currentRoadDirection || null, adjacentBiomes, cacheInfo,
            { x: pg.originX, y: pg.originY }, cache
        );
        pg.lastLoadedProcMapX = null;
        pg.lastLoadedProcMapY = null;
    }

    // ============================================================================
    // DATAMANAGER OVERRIDE
    // ============================================================================

    // The tileset the square under the party is drawn with, off _procGenData:
    // the id it carries, and the biome's own only as a fallback for a record
    // written before the id was kept. Zero when neither answers, which is the
    // one case where Map636's own tileset is the honest answer.
    function procSurfaceTilesetId() {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg) return 0;
        if (pg.currentBiomeTileset) return pg.currentBiomeTileset;
        const biome = getBiomeByName(pg.currentBiome);
        return (biome && biome.tilesetId) || 0;
    }

    // Map636.json's own tileset is a placeholder (300, the Fields set) and must
    // never be left standing under a square that belongs to another biome:
    // Game_Map.setup copies $dataMap.tilesetId into _tilesetId, and everything
    // that reads the tileset without going through the override above ends up on
    // it. So the id is written whenever there is one to write.
    function applyTilesetToDataMap(tilesetId) {
        if ($dataMap && tilesetId) $dataMap.tilesetId = tilesetId;
    }

    // Put the square's own tileset back on map 636, on $dataMap AND on the
    // Game_Map that has already copied it out of there. Called on every load of
    // the procedural map, so a route that laid tiles down without saying which
    // tileset they belong to cannot leave Map636's placeholder standing under
    // them: that is a city street drawn in grass. Answers whether anything
    // actually had to change, so a caller can refresh the tilemap.
    function syncProcSurfaceTileset() {
        if (!$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return false;
        const tilesetId = procSurfaceTilesetId();
        if (!tilesetId) return false;
        const changed = $gameMap._tilesetId !== tilesetId ||
            !!($dataMap && $dataMap.tilesetId !== tilesetId);
        applyTilesetToDataMap(tilesetId);
        $gameMap._tilesetId = tilesetId;
        return changed;
    }

    // Lay the generated tiles over whatever base Map636.json the engine loaded.
    // Answers false when there is no $dataMap yet to lay them on, which is the
    // usual case right after a load has been asked for: the engine's loadMapData
    // is asynchronous, it nulls $dataMap on the spot and only fills it in when
    // the file lands.
    function applyProcGenDataToDataMap() {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!$dataMap || !pg || !pg.generatedMapData) return false;

        // Fresh tiles: whatever was standing on the old ones has to be placed again.
        invalidateSquarePopulation();

        // Lay the neighbouring squares alongside this one where their tileset
        // allows it (see THE STITCHED WINDOW below). The square the caller built
        // is handed over as the centre, so this only ever ADDS to what would have
        // been shown; when nothing may be joined on, the window is the single
        // square and what follows is the behaviour that was always here.
        // A transfer lands on a named square, so the window is built around that
        // one. A save loaded on the procedural map has no transfer in it at all:
        // there the window has to come back with the geometry it was saved with,
        // or the party's recorded map position would land in the wrong cell.
        const reanchor = !!pg._stitchReanchor;
        pg._stitchReanchor = false;
        const partySquare = {
            x: $gameVariables.value(VAR_WORLD_X),
            y: $gameVariables.value(VAR_WORLD_Y),
        };
        const currentDepth = (pg.biomeLayerStack || []).length;
        let anchor = (!reanchor && pg.stitchCentre) ? pg.stitchCentre : partySquare;
        if (anchor && anchor.depth != null && anchor.depth !== currentDepth) {
            anchor = partySquare;
        }
        const win = openWindow(anchor.x, anchor.y, currentDepth, {
            centreData: pg.generatedMapData,
            adoptAt: partySquare,
        });
        if (win) {
            // Restoring a save: the party is already standing where they were, so
            // the cell they are in (not the window's centre) is the one every
            // "which square is this" answer has to point at.
            if (!reanchor) {
                const standing = cellAt($gamePlayer.x, $gamePlayer.y);
                if (standing) adoptCell(win, standing);
            }
            if (applyWindowToDataMap(win)) {
                resetStitchTracking();
                return true;
            }
        }

        $dataMap.data   = pg.generatedMapData;
        $dataMap.width  = PROC_MAP_WIDTH;
        $dataMap.height = PROC_MAP_HEIGHT;
        applyTilesetToDataMap(procSurfaceTilesetId());
        // The map name window reads the biome's declared name, not its id
        // ("ForestTropical" -> "Tropical Forest"), and a generated structure is
        // named outright.
        $dataMap.displayName = procMapDisplayName();
        return true;
    }

    // A load of map 636 that has been asked for but whose file has not landed
    // yet, so the tiles above still have to be laid on when it does. Every route
    // that ends on the procedural map EXCEPT one gets away without this: they
    // all go through performTransfer, which RMMZ runs from Scene_Map.onMapLoaded,
    // by which time the file is in and $dataMap can be written to directly.
    // Loading a SAVE made on the procedural map is the one route with no
    // transfer in it at all -- Scene_Map.create asks for $gameMap.mapId()
    // outright -- so the blank base map landed after the only chance anyone had
    // to overwrite it, and the party woke up on an empty 636 with all of their
    // events still standing on it. Remembered here, finished in DataManager.onLoad.
    let procMapLoadPending = false;

    const _DataManager_loadMapData = DataManager.loadMapData;
    DataManager.loadMapData = function(mapId) {
        if (mapId === PROC_MAP_ID &&
            $gameSystem &&
            $gameSystem._procGenData &&
            $gameSystem._procGenData.generatedMapData) {
            const currentWorldX = $gameVariables.value(VAR_WORLD_X);
            const currentWorldY = $gameVariables.value(VAR_WORLD_Y);
            const currentDepth  = ($gameSystem._procGenData.biomeLayerStack || []).length;
            const currentBiome  = $gameSystem._procGenData.currentBiome;
            // The unchanged-coordinates short-circuit keeps the map already in
            // $dataMap. When there is none -- a save loaded on the procedural map
            // boots with $dataMap null, and the coordinates it recorded are of
            // course its own -- there is nothing to keep, and skipping the load
            // leaves the scene waiting on a map that never arrives.
            //
            // Coordinates alone are not enough to say "nothing changed": goDown,
            // enterDungeonDoor, switchLayer (descending) and startForcedBiome all
            // generate a new structure's tiles on the SAME world square, so the
            // coordinates the short-circuit compares never move even though the
            // biome under the party did. Without also checking that $dataMap
            // still holds the array the game actually wants to show, a descent
            // left the previous floor's tiles on screen while every other system
            // had already moved on to the new one.
            // A stitched window puts its composed array on $dataMap, not the
            // party's own square, so "is the map still the one we want" has to
            // ask about that array when there is one.
            const shown = window.ProcStitch && window.ProcStitch.window()
                ? window.ProcStitch.window().data
                : $gameSystem._procGenData.generatedMapData;
            if (!$dataMap || !$dataMap.data ||
                $dataMap.data !== shown ||
                $gameSystem._procGenData.lastLoadedProcMapX !== currentWorldX ||
                $gameSystem._procGenData.lastLoadedProcMapY !== currentWorldY ||
                $gameSystem._procGenData.lastLoadedProcMapDepth !== currentDepth ||
                $gameSystem._procGenData.lastLoadedProcMapBiome !== currentBiome) {
                _DataManager_loadMapData.call(this, mapId);
                procMapLoadPending = !applyProcGenDataToDataMap();
                $gameSystem._procGenData.lastLoadedProcMapX     = currentWorldX;
                $gameSystem._procGenData.lastLoadedProcMapY     = currentWorldY;
                $gameSystem._procGenData.lastLoadedProcMapDepth = currentDepth;
                $gameSystem._procGenData.lastLoadedProcMapBiome = currentBiome;
            }
            return;
        }
        procMapLoadPending = false;
        _DataManager_loadMapData.call(this, mapId);
    };

    // The map file has landed. If it is the procedural map's, put the generated
    // tiles back on it before Scene_Map ever gets to see it: isMapLoaded() only
    // turns true through this call, and onMapLoaded (which builds the tilemap)
    // runs on the frame after.
    const _WMR_DataManager_onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _WMR_DataManager_onLoad.call(this, object);
        if (procMapLoadPending && object && object === $dataMap) {
            procMapLoadPending = false;
            applyProcGenDataToDataMap();
        }
    };

    // The edge-transition callback is a runtime closure that does not survive
    // serialization. If a save was made mid-transition, only the
    // _edgeTransitionScheduled flag persists (callback gone), and moveStraight
    // early-returns forever, permanently stranding the player at a proc-map edge.
    // Clear the stale transition state on load so movement is restored.
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if ($gameSystem && $gameSystem._procGenData) {
            $gameSystem._procGenData._edgeTransitionScheduled   = false;
            $gameSystem._procGenData._edgeTransitionDispatching = false;
            $gameSystem._procGenData._edgeTransitionCallback    = null;
            // The window is module state, not save state: it is rebuilt from
            // stitchCentre when map 636 loads. Anything left over from the
            // session that loaded the save would be a window onto another world.
            $gameSystem._procGenData._stitchReanchor            = false;
            if (window.ProcStitch) {
                const keep = $gameSystem._procGenData.stitchCentre;
                window.ProcStitch.close();
                $gameSystem._procGenData.stitchCentre = keep;
            }
            if (window.ProcGenSquare) window.ProcGenSquare.forget();
        }
    };

    // ============================================================================
    // GAME_MAP EXTENSIONS
    // ============================================================================

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        this.setupBorderTags();
        // Standing on the world map is proof the party is above ground, whatever
        // the procgen data still says. clearProcGenData already surfaces on the
        // ordinary way out (proc map -> map 315), but the world map is reachable
        // by routes that never touch it -- an authored map's border, fast travel,
        // a vehicle put down, a save made while the stack was stuck -- and any
        // depth carried across turns the next square entered into a cave. So the
        // rule is enforced here, at the one place every route arrives through.
        if (mapId === worldMapId && surfaceProcGenLayers($gameSystem && $gameSystem._procGenData)) {
            console.log('[WorldMapReturn] Back on the world map: dropped a stale underground layer stack');
        }
        // Reset screen tint when entering interior from world map
        const previousMapId = $gameVariables.value(VAR_DEST_MAP);
        if (previousMapId === worldMapId || $gamePlayer._transferring) {
            const lastMapId = $gamePlayer._transferring
                ? ($gamePlayer._oldMapId || previousMapId)
                : previousMapId;
            if (lastMapId === worldMapId && mapId !== worldMapId) {
                if ($dataMap && $dataMap.note && $dataMap.note.match(/<Interior>/i)) {
                    $gameScreen.startTint([0, 0, 0, 0], 0);
                }
            }
        }
    };

    // The tileset map 636 is drawn with. Map636.json carries a tileset of its own
    // (300, the Fields set), and it is only ever a placeholder: the square laid
    // over it belongs to whatever biome the party is standing in. So the answer
    // is taken off _procGenData, and the field that is asked FIRST is
    // currentBiomeTileset rather than the biome NAME.
    //
    // The two are written together everywhere, so this changes nothing while they
    // agree. It matters on the way back out of a submap: snapshotProcSurface /
    // restoreProcSurface carry currentBiomeTileset across a house visit precisely
    // so the square can be put back, and deriving the tileset from the name alone
    // threw that answer away the moment the name did not resolve to a biome (a
    // structure or forced biome the database does not hold, a description cleared
    // while the party was inside). The square's own tiles were still laid down, so
    // the fall-through to Map636's stock 300 drew a city street in grass.
    // The tileset the party can SEE right now, remembered on every frame the map
    // is drawn with it. Spriteset_Map.updateTileset asks the function below once
    // a frame and reloads the tile bitmaps the moment the answer changes, and
    // every route into a procedural interior -- a dungeon door, a grate, a cave
    // mouth, a staircase, goDown -- writes currentBiomeTileset the instant its
    // command runs, a good ten frames before the fade it started has reached
    // black. So the surface square was repainted in dungeon graphics while the
    // surface was still in plain view, and only then did the screen go dark.
    let _shownTileset = null;

    // True while a transition has begun its fade-out but the screen is not black
    // yet: the window in which a tileset swap would be visible. A screen with no
    // brightness to read (the Node harness) counts as not black, which holds the
    // old answer rather than showing the new one early.
    function tilesetSwapWouldShow(pg) {
        if (!pg || !pg._edgeTransitionScheduled) return false;
        if (!$gameScreen || typeof $gameScreen.brightness !== 'function') return true;
        return $gameScreen.brightness() > 0;
    }

    const _Game_Map_tileset = Game_Map.prototype.tileset;
    Game_Map.prototype.tileset = function() {
        const pg = $gameMap.mapId() === PROC_MAP_ID ? $gameSystem._procGenData : null;
        if (pg) {
            // Hold the answer at what is already on screen until the fade has
            // finished; the dispatcher clears _edgeTransitionScheduled before it
            // reserves the transfer, so the swap lands on a black screen.
            if (_shownTileset && tilesetSwapWouldShow(pg)) return _shownTileset;
            const biomeObj = getBiomeByName(pg.currentBiome);
            const tilesetId = pg.currentBiomeTileset ||
                (biomeObj && biomeObj.tilesetId) || 0;
            const tilesetData = tilesetId ? $dataTilesets[tilesetId] : null;
            if (tilesetData) {
                _shownTileset = tilesetData;
                return tilesetData;
            }
        }
        const fallback = _Game_Map_tileset.call(this);
        if (pg && fallback) _shownTileset = fallback;
        return fallback;
    };

    // ============================================================================
    // BORDER NOTETAG PARSING
    // ----------------------------------------------------------------------------
    // A map that declares the wrong spelling of <Worldmap> gets no chevrons and no
    // way back to the world map, and nothing says so: the tag simply fails to
    // match and the edges go inert. So every spelling an author is likely to write
    // is accepted instead, since the tag carries at most four bits of meaning:
    //
    //   <Worldmap>              <WORLDMAP>              every edge
    //   <Worldmap W N S E>      <Worldmap NSEW>         letters, in any order
    //   <Worldmap: W>           <Worldmap = w>          colon / equals form
    //   <Worldmap N, S / E>     <Worldmap west, north>  any separator, full words
    //
    // Only WHICH of the four directions appear matters; their order never does.
    // A tag whose body names no direction at all opens every edge (the tag is
    // there, so the map is meant to lead back out) and says so in the console.
    // ============================================================================

    const ALL_BORDER_DIRECTIONS = ['north', 'south', 'east', 'west'];

    const BORDER_DIRECTION_WORDS = {
        N: 'north', S: 'south', E: 'east', W: 'west',
        NORTH: 'north', SOUTH: 'south', EAST: 'east', WEST: 'west',
        UP: 'north', DOWN: 'south', LEFT: 'west', RIGHT: 'east',
        TOP: 'north', BOTTOM: 'south',
    };

    function parseWorldmapDirections(note) {
        const match = note.match(/<\s*worldmap\b\s*[:=]?\s*([^>]*?)\s*>/i);
        if (!match) return null;
        const body = (match[1] || '').trim();
        if (!body) return ALL_BORDER_DIRECTIONS.slice();

        const found = [];
        const add   = dir => { if (dir && !found.includes(dir)) found.push(dir); };
        for (const token of body.toUpperCase().split(/[^A-Z]+/)) {
            if (!token) continue;
            if (BORDER_DIRECTION_WORDS[token]) { add(BORDER_DIRECTION_WORDS[token]); continue; }
            // Not a whole word: a run of direction letters (NSEW, wn, ...).
            // Anything else is left alone rather than mined for stray letters.
            if (/^[NSEW]+$/.test(token)) {
                for (const ch of token) add(BORDER_DIRECTION_WORDS[ch]);
            }
        }
        if (found.length > 0) return found;
        console.warn(`[WorldMapReturn] <Worldmap ${body}> names no direction on map ` +
                     `${$gameMap.mapId()}; opening all four edges`);  // i18n-ignore  console diagnostic
        return ALL_BORDER_DIRECTIONS.slice();
    }

    Game_Map.prototype.setupBorderTags = function() {
        this._borderDestination  = null;
        this._coordsDest         = null;
        this._worldmapDirections = null;
        if ($gameMap.mapId() === procMapId) return;
        if (!$dataMap || !$dataMap.note) return;
        const note = $dataMap.note;
        this._worldmapDirections = parseWorldmapDirections(note);
        // The destination tags take the same colon/equals tolerance, and accept any
        // separator between their numbers.
        const bordersMatch = note.match(/<\s*borders\b\s*[:=]?\s*(\d+)\D+(\d+)\D+(\d+)\s*>/i);
        if (bordersMatch) {
            this._borderDestination = {
                mapId: parseInt(bordersMatch[1]),
                x:     parseInt(bordersMatch[2]),
                y:     parseInt(bordersMatch[3])
            };
            return;
        }
        const coordsMatch = note.match(/<\s*coords\b\s*[:=]?\s*(\d+)\D+(\d+)\s*>/i);
        if (coordsMatch) {
            this._coordsDest = {
                x: parseInt(coordsMatch[1]),
                y: parseInt(coordsMatch[2])
            };
        }
    };

    Game_Map.prototype.isBorderTile = function(x, y) {
        return x === 0 || y === 0 || x === this.width() - 1 || y === this.height() - 1;
    };

    Game_Map.prototype.isBorderTileEnabled = function(x, y) {
        if (!this.isBorderTile(x, y)) return false;
        return this._borderDestination || this._coordsDest;
    };

    Game_Map.prototype.isBorderDirectionAllowed = function(directions) {
        if (this._worldmapDirections === null) return false;
        return directions.some(dir => this._worldmapDirections.includes(dir));
    };

    Game_Map.prototype.getBorderDirection = function(x, y) {
        const directions = [];
        if (x === 0)                 directions.push('west');
        if (x === this.width()  - 1) directions.push('east');
        if (y === 0)                 directions.push('north');
        if (y === this.height() - 1) directions.push('south');
        return directions;
    };

    Game_Map.prototype.isBorderTilePassable = function(x, y) {
        return this.isPassable(x, y, 2) || this.isPassable(x, y, 4) ||
               this.isPassable(x, y, 6) || this.isPassable(x, y, 8);
    };

    // ------------------------------------------------------------------------
    // FENCED EDGES
    // ------------------------------------------------------------------------
    // Most hand-made maps do not leave their outermost ring walkable: it is a
    // void, a cliff or a wall painted along the edge (terrain tag 7 and 4 both
    // read as impassable through MovementInteractionSystem). The party can never
    // STAND on such a tile, so a rule that waits for them to step onto it never
    // fires and the map's <Worldmap> tag looks dead, chevrons and all.
    //
    // Walking INTO that fence is the same intent, so a blocked step counts as a
    // crossing when nothing but fence lies between the tile bumped into and the
    // map edge. The depth is capped so only a fence really painted along the
    // border qualifies: a building whose wall happens to run out to the edge
    // deeper inside the map must stay a wall.
    // ------------------------------------------------------------------------

    const EDGE_FENCE_DEPTH = 3;

    const BORDER_STEP     = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] };
    const BORDER_DIR_NAME = { 2: 'south', 4: 'west', 6: 'east', 8: 'north' };

    // Distance from (x, y) to the map edge it is heading for when moving in
    // direction d. 0 on the outermost ring.
    Game_Map.prototype.borderEdgeDistance = function(x, y, d) {
        switch (d) {
            case 2: return this.height() - 1 - y;
            case 4: return x;
            case 6: return this.width() - 1 - x;
            case 8: return y;
        }
        return Infinity;
    };

    // How many impassable tiles a border tile is buried under, counting inward
    // from the edge: 0 when the tile is walkable, n when the nearest walkable
    // tile inward is n away, -1 when the party can never get close enough to
    // push against it.
    Game_Map.prototype.borderFenceDepth = function(x, y) {
        if (this.isBorderTilePassable(x, y)) return 0;
        for (let step = 1; step <= EDGE_FENCE_DEPTH; step++) {
            const ix = x === 0 ? step : (x === this.width()  - 1 ? this.width()  - 1 - step : x);
            const iy = y === 0 ? step : (y === this.height() - 1 ? this.height() - 1 - step : y);
            if (!this.isValid(ix, iy)) break;
            if (this.isBorderTilePassable(ix, iy)) return step;
        }
        return -1;
    };

    // Does a step in direction d from (x, y) leave the map through an enabled
    // border? True when the next tile is already off the map, and when the next
    // tile starts a run of impassable tiles that reaches the edge.
    Game_Map.prototype.isBorderCrossing = function(x, y, d) {
        const step = BORDER_STEP[d];
        if (!step) return false;
        if (!this._borderDestination && !this._coordsDest) return false;
        if (!this.isBorderDirectionAllowed([BORDER_DIR_NAME[d]])) return false;

        let nx = x + step[0], ny = y + step[1];
        if (!this.isValid(nx, ny)) return true;
        if (this.borderEdgeDistance(nx, ny, d) >= EDGE_FENCE_DEPTH) return false;
        while (this.isValid(nx, ny)) {
            // Walkable ground still ahead: this is scenery inside the map, not
            // the fence along its edge.
            if (this.isBorderTilePassable(nx, ny)) return false;
            nx += step[0];
            ny += step[1];
        }
        return true;
    };

    Game_Map.prototype.getNearbyBorderTiles = function(playerX, playerY) {
        const nearbyBorders = [];
        // A fenced border tile is signposted from where the party can actually
        // stand, which is its fence depth further in than a walkable one.
        const scan = BORDER_DETECTION_RANGE + EDGE_FENCE_DEPTH;
        for (let dx = -scan; dx <= scan; dx++) {
            for (let dy = -scan; dy <= scan; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = playerX + dx;
                const y = playerY + dy;
                if (x < 0 || y < 0 || x >= this.width() || y >= this.height()) continue;
                if (!this.isBorderTile(x, y) || !this.isBorderTileEnabled(x, y)) continue;
                const depth = this.borderFenceDepth(x, y);
                if (depth < 0) continue;
                if (Math.max(Math.abs(dx), Math.abs(dy)) > BORDER_DETECTION_RANGE + depth) continue;
                const directions = this.getBorderDirection(x, y);
                if (this.isBorderDirectionAllowed(directions)) {
                    nearbyBorders.push({ x, y, arrow: getArrowForDirection(directions), directions });
                }
            }
        }
        return nearbyBorders;
    };

    const BORDER_NAME_DIR = { south: 2, west: 4, east: 6, north: 8 };

    // Is the ground past this edge, in this direction, joinable onto the map the
    // party is standing on? True means no crossing happens there and no marker
    // is drawn; false means the fade, and the marker that announces it.
    function canStitchOffEdge(dirName, x, y) {
        const S = window.ProcStitch;
        if (!S || !S.active || !S.active() || !S.canGrow) return false;
        const d = BORDER_NAME_DIR[dirName];
        if (!d) return false;
        return S.canGrow(d, x, y);
    }

    Game_Map.prototype.getProcGenBorderTiles = function(playerX, playerY) {
        const nearbyBorders = [];
        const width  = this.width();
        const height = this.height();
        for (let dx = -BORDER_DETECTION_RANGE; dx <= BORDER_DETECTION_RANGE; dx++) {
            for (let dy = -BORDER_DETECTION_RANGE; dy <= BORDER_DETECTION_RANGE; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = playerX + dx;
                const y = playerY + dy;
                if (x < 0 || y < 0 || x >= width || y >= height) continue;
                if (!(x === 0 || y === 0 || x === width - 1 || y === height - 1)) continue;

                let passable = false;
                if (x === 0          && $gameMap.isValid(1, y))          passable = passable || $gameMap.isPassable(1, y, 4);
                if (x === width - 1  && $gameMap.isValid(width - 2, y))  passable = passable || $gameMap.isPassable(width - 2, y, 6);
                if (y === 0          && $gameMap.isValid(x, 1))          passable = passable || $gameMap.isPassable(x, 1, 8);
                if (y === height - 1 && $gameMap.isValid(x, height - 2)) passable = passable || $gameMap.isPassable(x, height - 2, 2);
                if (!passable) continue;

                if (this.terrainTag(x, y) === 4 || this.terrainTag(x, y) === 7) continue;
                if (!this.isPassable(x, y, 2) && !this.isPassable(x, y, 4) &&
                    !this.isPassable(x, y, 6) && !this.isPassable(x, y, 8)) continue;

                let directions = [];
                if (x === 0)          directions.push('west');
                if (x === width - 1)  directions.push('east');
                if (y === 0)          directions.push('north');
                if (y === height - 1) directions.push('south');
                if (directions.length === 0) continue;

                // A marker means "this is a way OUT of here": a fade, a load and
                // another place on the other side. A neighbour on this square's
                // own tileset is none of those - it is simply more ground, laid
                // down under the party as they walk onto it (growTowards) - so
                // the edge it lies beyond is not drawn as an edge at all. What
                // keeps its marker is a real crossing: a square on a different
                // tileset, or one the hand-made maps own.
                directions = directions.filter(name => !canStitchOffEdge(name, x, y));
                if (directions.length === 0) continue;

                let ax = x, ay = y;
                if (x === 0)          ax = 1;
                else if (x === width - 1)  ax = width  - 2;
                if (y === 0)          ay = 1;
                else if (y === height - 1) ay = height - 2;

                const hasTransfer = this.eventsXy(ax, ay).some(ev => {
                    const evData = $dataMap.events[ev._eventId];
                    return evData && evData.name && (evData.name.includes('Transfer') || evData.name.includes('VehicleExit'));
                });
                if (hasTransfer) continue;
                if (this.terrainTag(ax, ay) === 4 || this.terrainTag(ax, ay) === 7) continue;
                if (!this.isPassable(ax, ay, 2) && !this.isPassable(ax, ay, 4) &&
                    !this.isPassable(ax, ay, 6) && !this.isPassable(ax, ay, 8)) continue;

                nearbyBorders.push({ x: ax, y: ay, directions, arrow: getArrowForDirection(directions) });
            }
        }
        return nearbyBorders;
    };

    // ============================================================================
    // BORDER ARROW SPRITE MANAGEMENT
    // ============================================================================

    let borderArrowSprites  = []; // world/regular-map arrows (yellow)
    let procGenBorderArrows = []; // proc map edge arrows (green)
    let teleportEventArrows = []; // transfer event arrows (yellow)

    Game_Player.prototype.clearBorderArrows = function() {
        // Each chevron owns the Bitmap its constructor drew, and the set is
        // rebuilt on every step: dropping the sprite without freeing the bitmap
        // leaked one canvas (and one GPU texture) per tile walked along an edge.
        clearArrowList(borderArrowSprites);
    };

    Game_Player.prototype.displayBorderArrows = function(borderTiles) {
        this.clearBorderArrows();
        if (!SceneManager._scene || !SceneManager._scene._spriteset) return;
        const spriteset = SceneManager._scene._spriteset;
        borderTiles.forEach(border => {
            const sprite = new Sprite_BorderArrow(border.x, border.y, border.arrow);
            spriteset._baseSprite.addChild(sprite);
            borderArrowSprites.push(sprite);
        });
    };

    Game_Player.prototype.updateBorderArrows = function() {
        if (!$gameMap._borderDestination && !$gameMap._coordsDest) {
            this.clearBorderArrows();
            return;
        }
        this.displayBorderArrows($gameMap.getNearbyBorderTiles(this.x, this.y));
    };

    Game_Player.prototype.clearProcGenBorderArrows = function() {
        for (const s of procGenBorderArrows) {
            if (!s) continue;
            if (s.parent) s.parent.removeChild(s);
            if (s.bitmap && s.bitmap.destroy) s.bitmap.destroy();
        }
        procGenBorderArrows = [];
    };

    Game_Player.prototype.displayProcGenBorderArrows = function(borderTiles) {
        this.clearProcGenBorderArrows();
        for (const border of borderTiles) {
            const sprite = new Sprite_BorderArrow(border.x, border.y, border.arrow, '#66ff66');
            SceneManager._scene._spriteset.addChild(sprite);
            procGenBorderArrows.push(sprite);
        }
    };

    Game_Player.prototype.updateProcGenBorderArrows = function() {
        if ($gameMap.mapId() !== procMapId) { this.clearProcGenBorderArrows(); return; }
        this.displayProcGenBorderArrows($gameMap.getProcGenBorderTiles(this.x, this.y));
    };

    Game_Player.prototype.clearTeleportEventArrows = function() {
        for (const s of teleportEventArrows) {
            if (!s) continue;
            if (s.parent) s.parent.removeChild(s);
            // Each arrow owns a Bitmap created in its constructor; free it so the
            // per-frame rebuild does not leak canvas/GPU textures.
            if (s.bitmap && s.bitmap.destroy) s.bitmap.destroy();
        }
        teleportEventArrows = [];
    };

    // Build transfer-event arrows around an arbitrary tile (px,py) into the given
    // container, pushing the created sprites onto outArr. Shared by Player 1 and the
    // split-screen Player 2 set so both players get the same visual cue.
    function buildTeleportEventArrows(px, py, container, outArr) {
        if (!container) return;
        for (const event of $gameMap.events()) {
            if (!event || !$dataMap.events[event._eventId]) continue;
            const name = $dataMap.events[event._eventId].name || '';
            if (!name.includes('Transfer') && !name.includes('VehicleExit')) continue;
            const ex = event.x, ey = event.y;
            const ddx = Math.abs(px - ex), ddy = Math.abs(py - ey);
            if (ddx > 2 || ddy > 2 || (ddx === 0 && ddy === 0)) continue;

            const mapWidth = $gameMap.width(), mapHeight = $gameMap.height();
            const onWestEdge  = ex === 0, onEastEdge  = ex === mapWidth  - 1;
            const onNorthEdge = ey === 0, onSouthEdge = ey === mapHeight - 1;
            const isOnEdge    = onWestEdge || onEastEdge || onNorthEdge || onSouthEdge;

            let ax, ay, char, onEventItself = false;
            if (isOnEdge) {
                onEventItself = true;
                ax = ex; ay = ey;
                if (onWestEdge)       char = '←';
                else if (onEastEdge)  char = '→';
                else if (onNorthEdge) char = '↑';
                else                  char = '↓';
            } else {
                const rdx = px - ex, rdy = py - ey;
                if (Math.abs(rdx) >= Math.abs(rdy)) {
                    ax = ex + (rdx > 0 ? 1 : -1); ay = ey;
                    char = rdx > 0 ? '←' : '→';
                } else {
                    ax = ex; ay = ey + (rdy > 0 ? 1 : -1);
                    char = rdy > 0 ? '↑' : '↓';
                }
                if (!$gameMap.isValid(ax, ay)) continue;
                const passDir = Math.abs(rdx) >= Math.abs(rdy) ? (rdx > 0 ? 6 : 4) : (rdy > 0 ? 2 : 8);
                if (!$gameMap.isPassable(ex, ey, passDir)) continue;
            }

            if (!onEventItself) {
                const hasTransfer = $gameMap.eventsXy(ax, ay).some(ev => {
                    const evData = $dataMap.events[ev._eventId];
                    return evData && evData.name && (evData.name.includes('Transfer') || evData.name.includes('VehicleExit'));
                });
                if (hasTransfer) continue;
                if ($gameMap.terrainTag(ax, ay) === 4 || $gameMap.terrainTag(ax, ay) === 7) continue;
                if (!$gameMap.isPassable(ax, ay, 2) && !$gameMap.isPassable(ax, ay, 4) &&
                    !$gameMap.isPassable(ax, ay, 6) && !$gameMap.isPassable(ax, ay, 8)) continue;
            }

            const sprite = new Sprite_BorderArrow(ax, ay, char);
            container.addChild(sprite);
            outArr.push(sprite);
        }
    }

    Game_Player.prototype.updateTeleportEventArrows = function() {
        this.clearTeleportEventArrows();
        if ($gameMap.mapId() === worldMapId) return;
        if (!(SceneManager._scene instanceof Scene_Map)) return;
        const ftData = $gameSystem ? $gameSystem.getFastTravelData() : null;
        if (ftData && ftData.timerActive && ftData.timerRemainingTime > 0) return;
        buildTeleportEventArrows(this.x, this.y, SceneManager._scene._spriteset, teleportEventArrows);
    };

    // ========================================================================
    // PLAYER 2 (split-screen) transfer arrows
    //
    // Mirrors the Player 1 arrow set but anchored to the split-screen P2 event's
    // tile and rendered into P2's own Spriteset_Map (_p2Spriteset), which renders
    // the map from P2's camera. Sprite_BorderArrow positions itself from the
    // global $gameMap._displayX/Y at update-time; the P2 spriteset hijacks that
    // display while it updates, so an arrow parented to it lands in P2's viewport.
    // ========================================================================
    let borderArrowSpritesP2  = [];
    let procGenBorderArrowsP2 = [];
    let teleportEventArrowsP2 = [];

    function p2ArrowEvent() {
        const ss = window.$gameSplitScreen;
        return (ss && ss.active && ss.p2Event) ? ss.p2Event : null;
    }
    function p2ArrowSpriteset() {
        return SceneManager._scene ? SceneManager._scene._p2Spriteset : null;
    }
    function clearArrowList(arr) {
        for (const s of arr) {
            if (!s) continue;
            if (s.parent) s.parent.removeChild(s);
            if (s.bitmap && s.bitmap.destroy) s.bitmap.destroy();
        }
        arr.length = 0;
    }

    Game_Player.prototype.clearP2Arrows = function() {
        clearArrowList(borderArrowSpritesP2);
        clearArrowList(procGenBorderArrowsP2);
        clearArrowList(teleportEventArrowsP2);
    };

    Game_Player.prototype.updateP2Arrows = function() {
        const ev  = p2ArrowEvent();
        const ss2 = p2ArrowSpriteset();
        if (!ev || !ss2) { this.clearP2Arrows(); return; }

        // World/regular-map border arrows (yellow).
        clearArrowList(borderArrowSpritesP2);
        if (($gameMap._borderDestination || $gameMap._coordsDest) && ss2._baseSprite) {
            for (const border of $gameMap.getNearbyBorderTiles(ev.x, ev.y)) {
                const sprite = new Sprite_BorderArrow(border.x, border.y, border.arrow);
                ss2._baseSprite.addChild(sprite);
                borderArrowSpritesP2.push(sprite);
            }
        }

        // Proc-map edge arrows (green).
        clearArrowList(procGenBorderArrowsP2);
        if ($gameMap.mapId() === procMapId) {
            for (const border of $gameMap.getProcGenBorderTiles(ev.x, ev.y)) {
                const sprite = new Sprite_BorderArrow(border.x, border.y, border.arrow, '#66ff66');
                ss2.addChild(sprite);
                procGenBorderArrowsP2.push(sprite);
            }
        }

        // Transfer-event arrows (yellow).
        clearArrowList(teleportEventArrowsP2);
        if ($gameMap.mapId() !== worldMapId) {
            const ftData = $gameSystem ? $gameSystem.getFastTravelData() : null;
            if (!(ftData && ftData.timerActive && ftData.timerRemainingTime > 0)) {
                buildTeleportEventArrows(ev.x, ev.y, ss2, teleportEventArrowsP2);
            }
        }
    };

    // ============================================================================
    // GAME_PLAYER EXTENSIONS
    // ============================================================================

    const _orig_Player_initialize = Game_Player.prototype.initialize;
    Game_Player.prototype.initialize = function() {
        _orig_Player_initialize.call(this);
        this._lastArrowUpdateX = -1;
        this._lastArrowUpdateY = -1;
    };

    // Sync vars 43/44 on every step on the world map
    const _orig_Player_increaseSteps = Game_Player.prototype.increaseSteps;
    Game_Player.prototype.increaseSteps = function() {
        _orig_Player_increaseSteps.call(this);
        if ($gameMap.mapId() === worldMapId) {
            $gameVariables.setValue(VAR_WORLD_X, this.x);
            $gameVariables.setValue(VAR_WORLD_Y, this.y);
        }
    };

    // Combined update: border teleport + arrow updates + proc arrows + teleport arrows + diving
    const _orig_Player_update = Game_Player.prototype.update;
    Game_Player.prototype.update = function(sceneActive) {
        const wasMoving = this.isMoving();
        _orig_Player_update.call(this, sceneActive);

        // Arrow sprites animate themselves each frame via their own update(); the
        // expensive full rebuilds (events rescan + Bitmap/canvas draw) only need
        // to run when the player's tile changes. Also rebuild when the fast-travel
        // timer's active state flips, since it gates whether arrows show at all.
        //
        // The gate used to read `wasMoving ||`, which is true on EVERY frame of
        // a step, not once per step: walking rebuilt the whole set every frame,
        // and since each arrow owns a Bitmap made in its constructor that meant
        // a destroy and a fresh canvas draw per arrow per frame, plus a rescan
        // of every event on the map, all to redraw what was already on screen.
        // The tile is what the arrows are read off, and it is already updated
        // by the time the step begins, so tileChanged covers the start of the
        // step. What `wasMoving` was really buying was the frame the step ENDS
        // on, so that is what is kept: the edge, not all the frames in between.
        const stoppedMoving = wasMoving && !this.isMoving();
        const tileChanged = this._lastArrowUpdateX !== this.x || this._lastArrowUpdateY !== this.y;
        const ftData = $gameSystem ? $gameSystem.getFastTravelData() : null;
        const ftActive = !!(ftData && ftData.timerActive && ftData.timerRemainingTime > 0);
        const ftChanged = this._lastArrowFtActive !== ftActive;
        const mapChanged = this._lastArrowMapId !== $gameMap.mapId();
        const needP1Rebuild = stoppedMoving || tileChanged || ftChanged || mapChanged;

        if (sceneActive && !$gameMessage.isBusy()) {
            if (tileChanged || mapChanged) this.checkBorderTeleport();
            if (needP1Rebuild) {
                this.updateBorderArrows();
            }
        }

        if (SceneManager._scene instanceof Scene_Map) {
            if (needP1Rebuild) {
                if ($gameMap.mapId() === procMapId) this.updateProcGenBorderArrows();
                else this.clearProcGenBorderArrows();
                this.updateTeleportEventArrows();
            }
            updatePartyDivingSprites();
            // Split-screen: mirror the transfer arrows around the Player 2 event so
            // the second player gets the same edge/transfer cue in their viewport.
            // Rebuild only when the P2 event's tile (or timer/map state) changed.
            const p2 = (window.$gameSplitScreen && window.$gameSplitScreen.active && window.$gameSplitScreen.p2Event)
                ? window.$gameSplitScreen.p2Event : null;
            const p2Changed = !p2 || this._lastP2ArrowX !== p2.x || this._lastP2ArrowY !== p2.y;
            if (p2Changed || ftChanged || mapChanged) {
                this.updateP2Arrows();
                if (p2) { this._lastP2ArrowX = p2.x; this._lastP2ArrowY = p2.y; }
            }
        }

        this._lastArrowUpdateX = this.x;
        this._lastArrowUpdateY = this.y;
        this._lastArrowFtActive = ftActive;
        this._lastArrowMapId = $gameMap.mapId();
    };


    // Combined performTransfer: save world pos + clear proc data + inject proc terrain
    const _orig_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        const currentMapId     = $gameMap.mapId();
        const destinationMapId = this._newMapId;

        $gameVariables.setValue(VAR_DEST_MAP, destinationMapId);

        // Leaving any map back to the WORLD MAP: remember exact return origin
        if (currentMapId !== worldMapId && destinationMapId === worldMapId) {
            let originX = this.x;
            let originY = this.y;
            if (currentMapId === procMapId && window.ProcStitch && typeof window.ProcStitch.local === 'function') {
                const local = window.ProcStitch.local(this.x, this.y);
                originX = local.x;
                originY = local.y;
            }
            if ($gameTemp) {
                $gameTemp._lastWorldMapReturnOrigin = {
                    mapId: currentMapId,
                    x: originX,
                    y: originY,
                    dir: this.direction(),
                    worldX: this._newX,
                    worldY: this._newY
                };
            }
        }

        // Leaving world map: save position.
        // Skip when the vehicle has already been relocated to a different map
        // (camper fast travel: completeTravelCamper moves the ship before this fires,
        // so $gamePlayer.x/y is the stale departure tile, not the actual destination).
        if (currentMapId === worldMapId && destinationMapId !== worldMapId) {
            const vehicle          = $gamePlayer.vehicle();
            const vehicleStillHere = !vehicle || vehicle._mapId === $gameMap.mapId();
            if (vehicleStillHere) {
                $gameVariables.setValue(VAR_WORLD_X, $gamePlayer.x);
                $gameVariables.setValue(VAR_WORLD_Y, $gamePlayer.y);
            }
        }

        // Leaving the procedural map back to the WORLD MAP: clear entry border
        // and proc gen data. We deliberately do NOT clear for excursions to other
        // maps (battle maps, houses, dungeons): those are round-trips, and wiping
        // the generated map made the player return to a blank base 636. The map
        // is deterministic from the world seed + coords, so it is restored/
        // regenerated on re-entry regardless.
        if (currentMapId === procMapId && destinationMapId === worldMapId) {
            $gameSystem._procEntryBorder = null;
            if ($gameSystem._procGenData) $gameSystem.clearProcGenData();
        }

        // Entering procedural map: ensure generated terrain exists, then inject it
        // into $dataMap. If the data was lost (e.g. an earlier excursion cleared
        // it), regenerate deterministically from the world seed + coords so the
        // player returns to the same map instead of a blank base 636.
        if (this._transferring &&
            destinationMapId === procMapId &&
            $gameSystem._procGenData) {
            if (!$gameSystem._procGenData.generatedMapData && $gameSystem.generateProceduralMap) {
                $gameSystem.generateProceduralMap();
            }
        }
        if (this._transferring &&
            destinationMapId === procMapId &&
            $gameSystem._procGenData &&
            $gameSystem._procGenData.generatedMapData) {
            if (!$dataMap || !$dataMap.data) DataManager.loadMapData(procMapId);
            applyProcGenDataToDataMap();
        }

        // Biome-to-biome moves reserve a transfer from map 636 back to map 636
        // (edge crossing, goDown/goUp, switchLayer). RMMZ's performTransfer only
        // calls Game_Map.setup() when the destination map id differs, so a
        // same-map proc transfer would otherwise keep the previous biome's
        // events and never reset _npcControllersInitialized - leaving NPCs
        // placed for the old (e.g. City) biome standing in the new one even when
        // it has hasNPC: false. Forcing a reload rebuilds the events from the
        // freshly-injected terrain and lets every per-biome system re-run,
        // including the hasNPC-gated NPC placement in setupProceduralMapNPCs.
        // (World->636 and house->636 entries already differ in map id, so this
        // condition leaves them untouched and never double-runs setup.)
        if (this._transferring &&
            currentMapId === procMapId &&
            destinationMapId === procMapId) {
            this.requestMapReload();
        }

        _orig_Player_performTransfer.call(this);

        // Ensure spriteset tilemap is refreshed after same-map transfer
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        if (spriteset && $gameMap.mapId() === procMapId) {
            if (typeof spriteset.loadTileset === 'function') spriteset.loadTileset();
            if (spriteset._tilemap) {
                spriteset._tilemap.setData($gameMap.width(), $gameMap.height(), $gameMap.data());
                spriteset._tilemap.refresh();
            }
            if (typeof spriteset.update === 'function') spriteset.update();
        }

        // The party has arrived: re-derive their world square straight away rather
        // than waiting for the end of Scene_Map.onMapLoaded. Every other map-load
        // hook (the vehicle store's reconcile, for one) runs between the two, and
        // asks where the party is.
        syncPlayerWorldCoords($gameMap.mapId());
    };

    // OK button on world map: open travel decision window (or interact with teleport/vehicle)
    //
    // openTravelDecision() below calls Input.clear() right after opening the
    // "Visit / Make a camp / Cancel" choice window, to stop the very button
    // press that opened it from also being read as its first input. Input.clear()
    // wipes Input._previousState along with the current one, so if that button
    // is still physically held on the next frame (routine on a gamepad, whose
    // trigger reads a continuous "pressed" flag rather than a discrete keydown),
    // Input.isTriggered('ok') reports a brand-new press even though the player
    // never released it. Without the isBusy() guard here, that phantom press
    // re-enters this handler while the choice window is still only *pending*
    // (isBusy() is already true, so the isHardcodedBiomeHere() branch below
    // politely declines) and falls through to the plain "Teleport - <place>"
    // event on the same tile, starting it directly and skipping the choice
    // the player never got to answer. Gating the whole handler on !isBusy()
    // makes a phantom re-trigger while a message/choice is already up a no-op,
    // same as any other button press would be.
    const _orig_Player_triggerButtonAction = Game_Player.prototype.triggerButtonAction;
    Game_Player.prototype.triggerButtonAction = function() {
        if ($gameMap.mapId() === worldMapId && Input.isTriggered('ok') && !$gameMessage.isBusy()) {
            const currentEvents   = $gameMap.eventsXy(this.x, this.y);
            const x2           = $gameMap.roundXWithDirection(this.x, this.direction());
            const y2           = $gameMap.roundYWithDirection(this.y, this.direction());
            const facingEvents = $gameMap.eventsXy(x2, y2);

            // A "???" square the party is *facing* answers the OK button before
            // anything else on the map: they walked up to the plate and turned
            // towards it, and the travel menu that opens carries its Investigate
            // row (plus whatever the square they are standing on still offers).
            // Nothing contests it - an adventure square never carries an event,
            // and none is ever placed next to a door (see the adventure plugin's
            // doorBlock), so the faced square is one or the other, never both.
            if (hasAdventureAt(x2, y2)) {
                const scene = SceneManager._scene;
                if (scene && scene.openTravelDecision) {
                    scene.openTravelDecision();
                    return true;
                }
            }

            // A Teleport event the party is *facing* owns the OK button outright:
            // the player deliberately walked up to it and turned towards it, so it
            // wins even on a named hardcoded square whose own travel menu would
            // otherwise open (a city tile carrying a Teleport door, say).
            const facingTeleport = facingEvents.find(e => e && e.event() && e.event().name && e.event().name.startsWith('Teleport'));
            if (facingTeleport) { facingTeleport.start(); return true; }

            // Named hardcoded locations (London, Milano, ...) always offer the
            // "Visit <name>" travel menu, taking precedence over a Teleport event
            // sharing the same tile (that one is stood on, not aimed at).
            if (isHardcodedBiomeHere()) {
                const scene = SceneManager._scene;
                if (scene && scene.openTravelDecision && !$gameMessage.isBusy()) {
                    scene.openTravelDecision();
                    return true;
                }
            }
            const currentTeleport = currentEvents.find(e => e && e.event() && e.event().name && e.event().name.startsWith('Teleport'));
            if (currentTeleport) { currentTeleport.start(); return true; }

            const hasActionEvent = facingEvents.some(e => e.isTriggerIn([0]) && e.isNormalPriority());

            const facingVehicle = ['ship', 'boat', 'airship'].reduce((found, type) => {
                if (found) return found;
                const v = $gameMap.vehicle(type);
                return (v && v._mapId === $gameMap.mapId() && v.x === x2 && v.y === y2) ? v : null;
            }, null);

            if (facingVehicle) {
                $gamePlayer.showVehicleActionMenu(facingVehicle, false);
                Input.clear();
                return true;
            }

            if (!hasActionEvent) {
                // While riding a vehicle, OK opens the vehicle options menu
                // (Visit map, Stop driving, etc.) instead of the travel choices.
                if ($gamePlayer.isInVehicle() && $gamePlayer.showVehicleActionMenu) {
                    const ridingVehicle = $gamePlayer.vehicle();
                    if (ridingVehicle) {
                        $gamePlayer.showVehicleActionMenu(ridingVehicle, true);
                        Input.clear();
                        return true;
                    }
                }

                const scene = SceneManager._scene;
                // Named hardcoded locations (London, Milano, ...) sit on City/Burg
                // tiles, so isSettlementBiomeHere() is true for them; they must still
                // get the "Visit <name>" travel menu, hence the hardcoded override.
                if (scene && scene.openTravelDecision && !$gameMessage.isBusy() &&
                    (!isSettlementBiomeHere() || isHardcodedBiomeHere() || hasAdventureHere() ||
                     hasFacedInteraction())) {
                    scene.openTravelDecision();
                    return true;
                }
            }
        }
        return _orig_Player_triggerButtonAction.call(this);
    };

    // Mouse on the world map: a click walks the party to the tile and, once it
    // arrives, opens the same "Visit / Make a camp" menu the OK button gives.
    // Click-to-move always ends on the player's own tile, which is the D1 case;
    // the original handler runs first so Teleport events on the tile still win.
    const _orig_Player_triggerTouchActionD1 = Game_Player.prototype.triggerTouchActionD1;
    Game_Player.prototype.triggerTouchActionD1 = function(x1, y1) {
        if (_orig_Player_triggerTouchActionD1.call(this, x1, y1)) return true;
        if ($gameMap.mapId() !== worldMapId) return false;
        // Vehicles keep their own action menu on the OK button; clicking a route
        // while sailing or driving must stay pure movement.
        if (this.isInVehicle()) return false;
        const scene = SceneManager._scene;
        if (!scene || !scene.openTravelDecision || !canOpenTravelDecisionHere()) return false;
        scene.openTravelDecision();
        return true;
    };

    // Is there a Transfer / VehicleExit named event on tile (x, y)? Such events own
    // their own destination, so the world-map border return must yield to them
    // (otherwise a Transfer event placed on a border tile double-transfers: first to
    // the world map via the border return, then to the event's real destination).
    Game_Player.prototype.hasTransferEventAt = function(x, y) {
        return $gameMap.eventsXy(x, y).some(ev => {
            const evData = $dataMap.events[ev._eventId];
            return evData && evData.name &&
                (evData.name.includes('Transfer') || evData.name.includes('VehicleExit'));
        });
    };

    // The world square an authored map's border leads out onto. Its <Coords> pair
    // names it, except for the editor template's default one, which names nothing
    // (see TEMPLATE_COORDS): there the party's own last known square is the only
    // thing that knows where they are standing. Answers null when neither is
    // usable, so the caller can fall back to the world map rather than build
    // square (0, 0) somewhere in the sea.
    function proceduralBorderSquare(dest) {
        const template = dest.x === TEMPLATE_COORDS.x && dest.y === TEMPLATE_COORDS.y;
        const square = template ? playerWorldCoords() : { x: dest.x | 0, y: dest.y | 0 };
        if (!(square.x > 0) || !(square.y > 0)) return null;
        return square;
    }

    // Leave the map through its declared border, walking in whatever direction
    // the crossing was made in (the party's own facing, unless a caller names
    // another - Player 2 crosses on their own key).
    //
    // <Coords x y> used to land the party on map 315, standing on the very square
    // they had just walked out of. The world map is a travel screen and not a
    // place, so walking out of a town's gate took the ground around it away with
    // it. That square's terrain is generated and entered from the side crossed
    // instead, exactly as "Visit X" does from the world map, so the step out of
    // the gate carries straight on into the country outside it.
    //
    // <Borders mapId x y> still transfers outright wherever it names: that tag
    // exists to say where it wants to go, and the world map named that way is
    // still meant literally.
    //
    // `mode` is the answer to the border choice, when one was asked (see
    // offerBorderCrossing): 'worldmap' takes the tag literally whatever else it
    // could have meant, 'explore' carries on into the square past this one.
    // Without it the crossing resolves itself exactly as it always did.
    Game_Player.prototype.performBorderReturn = function(direction, mode) {
        let dest = null;
        let generated = false;
        if ($gameMap._coordsDest) {
            dest = { mapId: worldMapId, x: $gameMap._coordsDest.x, y: $gameMap._coordsDest.y };
            generated = true;
        } else if ($gameMap._borderDestination) {
            dest = $gameMap._borderDestination;
        }
        if (!dest) return false;
        const d = direction || this.direction();
        // Walking on rather than stopping: the neighbouring square is built and
        // entered from the side that was crossed, the same way the map's own
        // square is below, so a gate leads into the country outside the wall.
        if (mode === 'explore') {
            const onward = borderExploreSquare(d);
            if (onward) {
                surfaceProcGenLayers($gameSystem && $gameSystem._procGenData);
                $gameVariables.setValue(VAR_DEST_MAP, procMapId);
                if (enterProceduralSquare(onward.x, onward.y, d)) return true;
            }
        }
        // An alien planet's landing grid is planet-local, and a <Coords> pair is
        // an Earth world-map square: generating one against the other would build
        // an alien biome at an Earth coordinate. Off-world the old transfer stands.
        if (generated && mode !== 'worldmap' && !isAlienSurfaceNow()) {
            const square = proceduralBorderSquare(dest);
            if (square) {
                // Out of a building and into the open air. Map 315 used to drop a
                // stale underground layer stack on arrival (syncPlayerWorldCoords)
                // and is no longer passed through, so without this the square
                // outside the door could come out as a cave.
                surfaceProcGenLayers($gameSystem && $gameSystem._procGenData);
                $gameVariables.setValue(VAR_DEST_MAP, procMapId);
                if (enterProceduralSquare(square.x, square.y, d)) return true;
            }
        }
        $gameVariables.setValue(VAR_DEST_MAP, dest.mapId);
        // The world position has to move with the party: the travel menu and the
        // procedural generator both read it, and without this they keep working
        // from wherever the party last stood on map 315.
        if (dest.mapId === worldMapId) {
            $gameVariables.setValue(VAR_WORLD_X, dest.x);
            $gameVariables.setValue(VAR_WORLD_Y, dest.y);
        }
        this.reserveTransfer(dest.mapId, dest.x, dest.y, 0, 0);
        return true;
    };

    // ------------------------------------------------------------------------
    // THE BORDER CHOICE
    // ------------------------------------------------------------------------
    // Leaving a hand-made map used to be one fixed act: the border tag decided,
    // and the party found themselves wherever it said. A town gate is two
    // different journeys though - the road on the world map, and the country
    // right outside the wall - so the crossing asks which one was meant instead
    // of guessing, and takes no for an answer as well.
    // ------------------------------------------------------------------------

    // The world square the map itself stands on: <Coords> names one outright
    // (the editor's template pair meaning "wherever the party is"), and a
    // <Borders> tag aimed at map 315 names the tile it transfers to. Any other
    // <Borders> destination is another map, not a world square, and has no
    // neighbours to offer.
    function borderWorldSquare() {
        if ($gameMap._coordsDest) {
            return proceduralBorderSquare({ x: $gameMap._coordsDest.x, y: $gameMap._coordsDest.y });
        }
        const dest = $gameMap._borderDestination;
        if (dest && dest.mapId === worldMapId) {
            return proceduralBorderSquare({ x: dest.x, y: dest.y });
        }
        return null;
    }

    // One square on from that, in the direction crossed. Null when the map is
    // not anchored to a world coordinate, or when the step would fall off the
    // world map's own edge.
    function borderExploreSquare(direction) {
        const step = BORDER_STEP[direction];
        if (!step) return null;
        const base = borderWorldSquare();
        if (!base) return null;
        const x = base.x + step[0], y = base.y + step[1];
        if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return null;
        return { x, y };
    }

    // Ask the party where they are going. Returns true when the menu opened, in
    // which case the crossing is now the menu's business and the caller must not
    // also perform it. Returns false whenever there is nothing to ask about, and
    // the old unconditional crossing stands: off-world, on a map that is not
    // anchored to a world square, or with a message already on screen.
    Game_Player.prototype.offerBorderCrossing = function(direction) {
        if ($gameMap.mapId() === worldMapId || $gameMap.mapId() === procMapId) return false;
        if (!$gameMap._coordsDest && !$gameMap._borderDestination) return false;
        if (isAlienSurfaceNow()) return false;
        if ($gameMessage.isBusy()) return false;

        let d = direction || this.direction();
        // Stepping ALONG an edge can trip the crossing sideways, which would name
        // the square beside the map rather than the one beyond it. The tile knows
        // which way off the map it lies, and that is the way out.
        if ($gameMap.isBorderTile(this.x, this.y)) {
            const dirs = $gameMap.getBorderDirection(this.x, this.y);
            if (!dirs.includes(BORDER_DIR_NAME[d])) d = this.getExitDirection(dirs) || d;
        }

        const onward = borderExploreSquare(d);
        if (!onward) return false;

        // Cancelling at a fenced edge leaves the party pressed against it, and
        // the held key would reopen the menu on the very next frame. The refusal
        // is remembered per tile and per direction: turning away and pushing back
        // asks again, holding the key down does not.
        const cancelKey = `${$gameMap.mapId()},${this.x},${this.y},${d}`;
        if (this._borderChoiceCancelKey === cancelKey) return false;

        const place = worldSquareName(onward.x, onward.y) || T('WorldMapReturn.wilderness');
        const rows = [
            {
                label: T('WorldMapReturn.returnToWorldMap'),
                run: () => { this.performBorderReturn(d, 'worldmap'); },
            },
            {
                label: T('WorldMapReturn.explorePlace', { place }),
                run: () => { this.performBorderReturn(d, 'explore'); },
            },
            {
                label: T('WorldMapReturn.cancel'),
                run: () => { this._borderChoiceCancelKey = cancelKey; },
            },
        ];
        const cancelIndex = rows.length - 1;
        $gameMessage.setChoices(rows.map(r => r.label), 0, cancelIndex);
        $gameMessage.setChoiceCallback((choice) => {
            const row = rows[choice] || rows[cancelIndex];
            if (row && row.run) row.run();
        });
        Input.clear();
        // A click destination still pointing at the border tile would walk the
        // party straight back into it the moment the menu closes.
        $gameTemp.clearDestination();
        return true;
    };

    // Auto-transfer when player steps on a border tile that has a Coords/Borders destination
    Game_Player.prototype.checkBorderTeleport = function() {
        if (this._justWrapped) { this._justWrapped = false; return; }
        // Only reached on a tile or map change, which is exactly when a refused
        // border choice stops applying.
        this._borderChoiceCancelKey = null;

        const x = this.x, y = this.y;
        if ($gameMap.isBorderTile(x, y) && $gameMap.isBorderTilePassable(x, y)) {
            // The flag remembers the tile, not just "a border was handled": walking
            // along the edge from a tile that yielded to a Transfer event must still
            // be able to cross on the next one.
            const tileKey = x + ',' + y;
            // A Transfer event on this border tile takes precedence: let it run and
            // skip the border return so we don't bounce through the world map first.
            if (this.hasTransferEventAt(x, y)) { this._borderChoiceShown = tileKey; return; }

            const directions         = $gameMap.getBorderDirection(x, y);
            const hasBorderDest      = $gameMap._borderDestination || $gameMap._coordsDest;
            const isDirectionAllowed = $gameMap.isBorderDirectionAllowed(directions);

            if (hasBorderDest && this._borderChoiceShown !== tileKey && isDirectionAllowed) {
                this._borderChoiceShown = tileKey;
                if (!this.offerBorderCrossing()) this.performBorderReturn();
                return;
            }
        } else {
            this._borderChoiceShown = null;
        }
    };

    // The party pushing against a fenced map edge on a <Worldmap> map: the step is
    // blocked, but the intent is to leave, so cross instead of bumping.
    Game_Player.prototype.tryBorderReturn = function(d) {
        if (this.isTransferring() || this.isMoving()) return false;
        if ($gameMap.mapId() === worldMapId || $gameMap.mapId() === procMapId) return false;
        if (this.canPass(this.x, this.y, d)) return false;
        if (this.hasTransferEventAt(this.x, this.y)) return false;
        if (!$gameMap.isBorderCrossing(this.x, this.y, d)) return false;
        this.setDirection(d);
        if (this.offerBorderCrossing(d)) return true;
        return this.performBorderReturn(d);
    };

    Game_Player.prototype.getExitDirection = function(directions) {
        if (directions.includes('south')) return 2;
        if (directions.includes('west'))  return 4;
        if (directions.includes('east'))  return 6;
        if (directions.includes('north')) return 8;
        return 0;
    };

    // ============================================================================
    // THE STITCHED WINDOW
    // ----------------------------------------------------------------------------
    // The procedural map used to be exactly one world square: walk into the edge,
    // fade to black, build the neighbour, transfer. Every crossing cost a fade and
    // a full generation, and the world read as a corridor of 64x64 rooms.
    //
    // Now map 636 holds a WINDOW of up to 3x3 neighbouring squares laid side by
    // side in one array, so walking from one into the next is an ordinary step: no
    // fade, no transfer, no regeneration. Nothing about the seams had to be
    // invented for this. Each square was always generated alone and always had to
    // agree with neighbours it could not see, so rivers and roads already snap to
    // a fixed centred width wherever they run to a border, and an underground
    // passage is already derived from the BORDER (named by the square north or
    // west of it) so both sides cut it over the same tiles. Laid together they
    // simply line up, above ground and below it alike.
    //
    // What the window cannot do is span two TILESETS. One RMMZ map has one
    // tileset, and the five the biomes use share no tile-id space at all: 2048 is
    // grass in Fields (300) and asphalt in Road (301). So a neighbour is joined on
    // only when its tileset matches, and the window shrinks to the largest
    // rectangle around the party where that holds. At any edge of THAT rectangle
    // the old fade-and-transfer crossing runs exactly as it always did, which is
    // also what keeps the hand-authored towns out of it: a square named by
    // WorkSystem/Destinations.json is never stitched, so its border still hands
    // the party to the authored map through getNonProceduralDestination.
    //
    // Two coordinates are in play once a window is up and they must not be
    // confused. A MAP coordinate is where a tile is on the loaded 128x192 (or
    // whatever) map. A SQUARE-LOCAL coordinate is where it is inside its own
    // 64x64 world square, which is what every system written before the window
    // means by x and y - generatedMapData is indexed with it, and so is every
    // spawn point anyone has ever recorded. ProcStitch.local and ProcStitch.toMap
    // convert between them; the transfer hook at the bottom of this file does it
    // for arrivals, so no caller had to be taught the difference.
    // ============================================================================

    const CELL_W = PROC_MAP_WIDTH;
    const CELL_H = PROC_MAP_HEIGHT;
    const WORLD_W = 256;   // map 315 is 256x256
    const WORLD_H = 256;
    // RMMZ map data is six layers deep (four tile layers, shadows, regions), but
    // the generators only ever fill the five they use and the engine reads a
    // missing region layer as 0. The composed window keeps whatever depth the
    // squares came with rather than inventing a layer they never had.
    const DEFAULT_MAP_LAYERS = 6;

    function layerCount(mapData) {
        const n = Math.floor(mapData.length / (CELL_W * CELL_H));
        return n > 0 ? n : DEFAULT_MAP_LAYERS;
    }

    // How far inside a new square the party has to be before the window slides
    // over to centre on it. Without a margin, walking along a seam would rebuild
    // on every other step; with one, a crossing costs one rebuild and standing on
    // the line costs none.
    const RECENTRE_MARGIN = 8;

    // Non-index properties the generators hang on a square's tile array (the cave
    // floor tile, the room rectangles, the structure's spawn tile). The composed
    // window carries the CENTRE square's, because everything that reads them is
    // asking about the square the party is standing in.
    function copyArrayTags(from, to) {
        for (const key of Object.keys(from)) {
            if (!/^\d+$/.test(key)) to[key] = from[key];
        }
        return to;
    }

    let stitchWindow = null;          // the window standing on map 636, or null
    let stitchDisabled = false;       // hard off switch, for debugging
    const squareChangedHooks = [];

    function procGen() {
        return $gameSystem && $gameSystem._procGenData;
    }

    function ProcGenSquareApi() {
        return window.ProcGenSquare || null;
    }

    // Is procedural map streaming on? The option defaults to on, so anything
    // other than an explicit false reads as yes (a config written before the
    // option existed has no key at all).
    function mapStreamingEnabled() {
        return !(window.ConfigManager && ConfigManager.mapStreaming === false);
    }

    // Stitching is off entirely for a square the old system owns end to end.
    function stitchingAllowed() {
        if (stitchDisabled) return false;
        // The player's own answer (Options / gameplay / Map Streaming). Off, no
        // square is ever joined onto another: one map is loaded at a time and its
        // border is crossed with the panning transition below.
        if (!mapStreamingEnabled()) return false;
        const pg = procGen();
        if (!pg) return false;
        // A door / sandbox / tower dungeon is a single sealed square whose border
        // IS the way out (exitDungeonSession). Joining a neighbour onto it would
        // both wall up the exit and stitch a cave onto a crypt.
        if (pg._dungeonSession) return false;
        return !!ProcGenSquareApi();
    }

    // The alien landing grid is a small toroid, so its neighbours wrap. Earth's
    // squares simply run out at the edges of map 315.
    function neighbourCoord(wx, wy, dx, dy, alienGrid) {
        let nx = wx + dx, ny = wy + dy;
        if (alienGrid) {
            if (alienGrid.w < 3 && dx !== 0) return null;
            if (alienGrid.h < 3 && dy !== 0) return null;
            nx = ((nx % alienGrid.w) + alienGrid.w) % alienGrid.w;
            ny = ((ny % alienGrid.h) + alienGrid.h) % alienGrid.h;
            return { x: nx, y: ny };
        }
        if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) return null;
        return { x: nx, y: ny };
    }

    // Is this square a DOOR onto a hand-authored map? Only a Destinations.json
    // entry with somewhere to send the party is: a procedural town names its
    // footprint in the same file and has no door at all, and those squares are
    // generated exactly like open country, so nothing is gained by keeping them
    // apart. Held apart they were, though, and a city of four reserved squares
    // therefore cost a crossing between every one of them. The test is the very
    // one the crossing itself makes (a destination, not merely an entry), so a
    // square the window refuses is always a square the border really hands over.
    function authoredDoorAt(wx, wy) {
        return !!getNonProceduralDestination(wx, wy, 0).destination;
    }

    // May this square be laid alongside the one the party is on?
    function canStitch(centre, wx, wy, depth) {
        // A square WorkSystem/Destinations.json opens a door on is a way into a
        // hand-authored map. Its border keeps the old crossing, so it is never
        // part of a window, neither as a neighbour nor as a centre.
        //
        // Only ABOVE ground, though: what the file names is a place standing on
        // the surface, and nothing was ever authored under it. The layer below a
        // town is generated for it exactly as it is for open country, so down
        // there the square is an ordinary one and stitches like any other (see
        // surfaceDestinationFor for the way back up out of it).
        //
        // A planet's landing grid is planet-local and small, so its (gx, gy) can
        // coincidentally match a real Earth coordinate: none of Earth's markers
        // may be consulted for it (the same rule ProcGenSquare.resolve follows).
        const alien = procGen() && procGen().alienGrid;
        if (!alien && !depth && authoredDoorAt(wx, wy)) return false;
        const api = ProcGenSquareApi();
        if (!api) return false;
        const resolved = api.resolve(wx, wy, { depth });
        if (!resolved || !resolved.biome) return false;
        // The whole constraint, in one line: one map, one tileset.
        return resolved.tilesetId === centre.tilesetId;
    }

    // The largest rectangle of stitchable squares containing the party's own. Both
    // ranges are contiguous and both contain 0, so the result is always a rectangle
    // RMMZ can hold, and it degenerates to the single centre square (the old
    // behaviour) when nothing around it matches.
    const RANGES = [[0, 0], [-1, 0], [0, 1], [-1, 1]];

    // The offset of each neighbour, by the direction walked into it.
    const EXIT_DELTA = { 2: { dx: 0, dy: 1 }, 4: { dx: -1, dy: 0 }, 6: { dx: 1, dy: 0 }, 8: { dx: 0, dy: -1 } };

    // Do these two names describe the same square? Normally they are the same
    // string. They differ in one honest case: a special biome rolled per world
    // seed ("SpiritWoods" for Forest), which one path may have unwrapped and the
    // other not. Both sides are folded back to their parent before they are
    // compared, so a stale roll no longer collapses the window and sends the
    // party through a fade for ground that is already joinable. Everything else -
    // a forced biome, a structure, a tower floor - still disagrees, which is what
    // keeps a cave from being stitched onto a crypt.
    function sameSquareIdentity(resolvedName, standingName) {
        if (resolvedName === standingName) return true;
        if (!resolvedName || !standingName) return false;
        const unwrap = window.ProcGenUtils && window.ProcGenUtils.unwrapSpecialBiome;
        if (!unwrap) return false;
        return unwrap(resolvedName) === unwrap(standingName);
    }

    /**
     * @param {?{x:number,y:number}} guardSquare the square the PARTY is standing
     *        on, which is not always the one the window is centred on.
     * @param {?{dx:number,dy:number}} requireDelta a neighbour that MUST be in
     *        the window, or nothing is returned at all. The plain plan picks the
     *        largest rectangle it can lay, and the largest is not always the one
     *        that reaches the way the party is walking: with west, north-west and
     *        south-west all joinable the two-by-three to the west beats the
     *        two-by-one to the east, so a perfectly stitchable EASTERN neighbour
     *        was left out of the map and walking into it cost a fade. Asked for a
     *        direction, the same search is made over the rectangles that contain
     *        it (see growTowards).
     */
    function planWindow(cx, cy, depth, guardSquare, requireDelta) {
        if (!stitchingAllowed()) return null;
        const api = ProcGenSquareApi();
        if (!api) return null;
        const pg = procGen();
        const alienGrid = pg && pg.alienGrid;
        const centre = api.resolve(cx, cy, { depth });
        if (!centre || !centre.biome) return null;

        // The square under the party is not always one the resolver can account
        // for: startForcedBiome, a structure entered off a terrain feature and a
        // tower floor all stamp a biome onto _procGenData that no world-map tile
        // implies. Those are one-square places by nature, and laying a resolved
        // neighbour beside one would join a cave onto a crypt, so the moment the
        // two disagree the window collapses and the old crossing takes over.
        //
        // The square that has to agree is the one the PARTY is standing on, which
        // is not always the one the window is centred on: a save loaded on the
        // procedural map rebuilds the geometry it was saved with, and the party
        // may have walked a square off its centre before saving.
        const guard = guardSquare || { x: cx, y: cy };
        if (pg && pg.currentBiome) {
            const standing = (guard.x === cx && guard.y === cy)
                ? centre
                : api.resolve(guard.x, guard.y, { depth });
            if (!standing || !sameSquareIdentity(standing.biomeName, pg.currentBiome)) return null;
        }

        // A centre the old system owns takes no neighbours at all - and it only
        // owns the SURFACE of it (see canStitch).
        const centreIsAuthored = !depth && authoredDoorAt(cx, cy);

        const ok = {};
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) { ok["0,0"] = { x: cx, y: cy }; continue; }
                if (centreIsAuthored) continue;
                const coord = neighbourCoord(cx, cy, dx, dy, alienGrid);
                if (!coord) continue;
                // A toroid narrow enough to wrap onto itself would otherwise place
                // the same square twice in one window.
                if (coord.x === cx && coord.y === cy) continue;
                if (!canStitch(centre, coord.x, coord.y, depth)) continue;
                ok[dx + "," + dy] = coord;
            }
        }

        let best = null;
        for (const [c0, c1] of RANGES) {
            for (const [r0, r1] of RANGES) {
                if (requireDelta &&
                    (requireDelta.dx < c0 || requireDelta.dx > c1 ||
                     requireDelta.dy < r0 || requireDelta.dy > r1)) continue;
                let all = true;
                for (let dy = r0; dy <= r1 && all; dy++) {
                    for (let dx = c0; dx <= c1 && all; dx++) {
                        if (!ok[dx + "," + dy]) all = false;
                    }
                }
                if (!all) continue;
                const area = (c1 - c0 + 1) * (r1 - r0 + 1);
                if (!best || area > best.area) best = { c0, c1, r0, r1, area };
            }
        }
        // Asked for a direction and unable to reach it, the answer is nothing at
        // all: the caller wanted that neighbour, not the biggest window.
        if (!best && requireDelta) return null;
        if (!best) best = { c0: 0, c1: 0, r0: 0, r1: 0, area: 1 };

        const cols = best.c1 - best.c0 + 1;
        const rows = best.r1 - best.r0 + 1;
        const cells = [];
        for (let dy = best.r0; dy <= best.r1; dy++) {
            for (let dx = best.c0; dx <= best.c1; dx++) {
                const coord = ok[dx + "," + dy];
                cells.push({
                    dx, dy,
                    worldX: coord.x, worldY: coord.y,
                    ox: (dx - best.c0) * CELL_W,
                    oy: (dy - best.r0) * CELL_H,
                    built: null,
                });
            }
        }

        return {
            depth, cols, rows,
            // The square the window's GEOMETRY is built around. It does not move
            // when the party walks into a neighbour: only a rebuild moves it, and
            // it is what a save has to record so the same window comes back.
            centreX: cx, centreY: cy,
            centreOx: (0 - best.c0) * CELL_W,
            centreOy: (0 - best.r0) * CELL_H,
            // The world square of the window's top-left cell: the offset that
            // turns a map coordinate into a world one.
            originX: cx + best.c0,
            originY: cy + best.r0,
            width: cols * CELL_W,
            height: rows * CELL_H,
            tilesetId: centre.tilesetId,
            centre,
            cells,
            centreCell: null,
            partyCell: null,
            data: null,
        };
    }

    // Build every square the plan names (cached ones cost nothing) and lay them
    // into one array.
    function composeWindow(win) {
        const api = ProcGenSquareApi();
        if (!api) return null;

        // Build first, so the layer depth is known before the array is sized.
        for (const cell of win.cells) {
            const built = api.build(cell.worldX, cell.worldY, { depth: win.depth });
            if (!built) return null;
            cell.built = built;
        }

        const W = win.width, H = win.height;
        let layers = DEFAULT_MAP_LAYERS;
        for (const cell of win.cells) layers = Math.min(layers, layerCount(cell.built.mapData));
        const data = new Array(W * H * layers).fill(0);
        win.layers = layers;

        for (const cell of win.cells) {
            const src = cell.built.mapData;
            for (let z = 0; z < layers; z++) {
                const dstLayer = z * W * H;
                const srcLayer = z * CELL_W * CELL_H;
                for (let y = 0; y < CELL_H; y++) {
                    const dstRow = dstLayer + (cell.oy + y) * W + cell.ox;
                    const srcRow = srcLayer + y * CELL_W;
                    for (let x = 0; x < CELL_W; x++) data[dstRow + x] = src[srcRow + x];
                }
            }
        }

        const centreCell = win.cells.find(c => c.dx === 0 && c.dy === 0);
        if (centreCell && centreCell.built) copyArrayTags(centreCell.built.mapData, data);
        win.data = data;
        win.centreCell = centreCell;
        win.partyCell = centreCell;
        return data;
    }

    // Everything on _procGenData that speaks for "the square the party is in".
    // Kept pointing at the cell the party actually stands in, so that every
    // consumer written against the old one-square-per-map world (the encounter
    // tables, the weather, the battle backgrounds, the quest sites, the map name)
    // keeps reading the right answer without knowing the window exists.
    function adoptCell(win, cell) {
        const pg = procGen();
        if (!pg || !cell || !cell.built) return;
        // A plan is guarded on the biome the party's square reports, and that is
        // what this is about to change.
        forgetGrowthAnswers();
        const r = cell.built.resolved;
        win.partyCell = cell;
        pg.currentBiome = r.biomeName;
        pg.currentBiomeTileset = r.tilesetId;
        pg.currentRoadDirection = r.roadDirection;
        pg.currentUnderBiome = r.underBiome;
        pg.currentBridgeDirection = r.bridgeDirection;
        pg.displayAsBeach = r.displayAsBeach;
        pg.displayAsIsland = r.displayAsIsland;
        pg.structureHints = r.structureHints || null;
        pg.biomeDayTemperature = r.dayTemperature;
        pg.biomeNightTemperature = r.nightTemperature;
        pg.originX = cell.worldX;
        pg.originY = cell.worldY;
        // The party's OWN square, still a plain 64x64 array indexed from its own
        // corner: everything that reads generatedMapData is asking about this
        // square, not about the window (see ProcStitch.local for map coordinates).
        pg.generatedMapData = cell.built.mapData;
        // The composed array itself is NOT parked on _procGenData: $gameSystem is
        // serialized whole, and a 3x3 window is nearly 200k numbers of tiles that
        // are all derivable from the world seed anyway. What the save carries is
        // the square the geometry was centred on, which is all it takes to build
        // the very same window again on load.
        pg.stitchCentre = { x: win.centreX, y: win.centreY, depth: win.depth };
        $gameVariables.setValue(VAR_WORLD_X, cell.worldX);
        $gameVariables.setValue(VAR_WORLD_Y, cell.worldY);
        // On a planet the square IS the landing-grid cell, and half of GalaxySim
        // reads it back off the grid rather than off the world-coordinate
        // variables: which hour a tidally locked world is frozen at, what the sky
        // is doing, where the on-foot overview marks the party. Walking over a
        // seam moves the party between grid cells without a transfer, so the
        // grid has to be told the same way everything else is.
        if (pg.alienGrid) adoptAlienGridCell(cell.worldX, cell.worldY);
    }

    // The landing-grid cell the party now stands in. Kept off adoptCell so the
    // fading crossing (_resolveAdjacentBiomeAndTransfer) can say the same thing.
    function adoptAlienGridCell(gx, gy) {
        const pg = procGen();
        const grid = pg && pg.alienGrid;
        if (!grid) return;
        grid.gx = gx;
        grid.gy = gy;
        const landed = $gameSystem._landedPlanet;
        if (!landed) return;
        if (landed.terrain && landed.terrain.cell) {
            landed.terrain.cell.gx = gx;
            landed.terrain.cell.gy = gy;
        }
        // The columns of the grid are lines of longitude, so on a tidally locked
        // world walking east is walking around the terminator: the hour it is
        // frozen at belongs to the column, not to the landing.
        const GS = window.GalaxySim;
        if (landed.day && landed.day.frozen && GS && GS.frozenHourForCell) {
            landed.day.fixedHour = GS.frozenHourForCell(gx, grid.w);
        }
    }

    // Put a freshly composed window on $dataMap. Called from the map-data hook, so
    // $dataMap is the base Map636.json and the engine has not looked at it yet.
    function applyWindowToDataMap(win) {
        if (!$dataMap || !win || !win.data) return false;
        $dataMap.data = win.data;
        $dataMap.width = win.width;
        $dataMap.height = win.height;
        applyTilesetToDataMap(win.tilesetId || procSurfaceTilesetId());
        $dataMap.displayName = procMapDisplayName();
        return true;
    }

    /**
     * Build the window around a world square and make it the current one. Returns
     * the window, or null when stitching does not apply (in which case the caller
     * carries on with the single-square path, unchanged).
     */
    function openWindow(cx, cy, depth, opts) {
        if (!stitchingAllowed()) { closeWindow(); return null; }
        const pg = procGen();
        const d = depth != null ? depth : (pg.biomeLayerStack || []).length;
        // Keep whatever the caller already built for this square: it is the array
        // the party is about to stand on, prefabs, hatches and all.
        const centreData = (opts && opts.centreData) || null;
        if (centreData) {
            const api = ProcGenSquareApi();
            const at = (opts && opts.adoptAt) || { x: cx, y: cy };
            if (api && api.adopt) api.adopt(at.x, at.y, d, centreData);
        }
        const win = planWindow(cx, cy, d, (opts && opts.adoptAt) || null);
        if (!win) { closeWindow(); return null; }
        if (!composeWindow(win)) { closeWindow(); return null; }
        stitchWindow = win;
        adoptCell(win, win.centreCell);
        return win;
    }

    function closeWindow() {
        stitchWindow = null;
        prefetchQueue.length = 0;
        prefetchUrgent = false;
        lastApproachKey = null;
        lastRoadKey = null;
        forgetGrowthAnswers();
        const pg = procGen();
        if (pg) pg.stitchCentre = null;
    }

    /**
     * Blit one square's own array back into the composed window. Anything that
     * edits a square AFTER it has been laid down has to say so: the window holds
     * a copy of the tiles, so a late stamp on the square alone (the patron's
     * hatch, PatreonRewards) would never appear on the map.
     */
    function syncCell(worldX, worldY) {
        if (!stitchWindow) return false;
        const cell = stitchWindow.cells.find(c => c.worldX === worldX && c.worldY === worldY);
        if (!cell || !cell.built) return false;
        const W = stitchWindow.width, H = stitchWindow.height;
        const layers = stitchWindow.layers || DEFAULT_MAP_LAYERS;
        const src = cell.built.mapData;
        const data = stitchWindow.data;
        for (let z = 0; z < layers; z++) {
            const dstLayer = z * W * H;
            const srcLayer = z * CELL_W * CELL_H;
            for (let y = 0; y < CELL_H; y++) {
                const dstRow = dstLayer + (cell.oy + y) * W + cell.ox;
                const srcRow = srcLayer + y * CELL_W;
                for (let x = 0; x < CELL_W; x++) data[dstRow + x] = src[srcRow + x];
            }
        }
        refreshTilemap();
        return true;
    }

    // ---- coordinates -------------------------------------------------------

    // The cell a map coordinate falls in, or null when there is no window (in
    // which case the map coordinate already IS the square-local one).
    function cellAt(mapX, mapY) {
        if (!stitchWindow) return null;
        const cx = Math.floor(mapX / CELL_W), cy = Math.floor(mapY / CELL_H);
        return stitchWindow.cells.find(
            c => c.ox === cx * CELL_W && c.oy === cy * CELL_H
        ) || null;
    }

    // A map coordinate expressed inside its own square, which is what every
    // consumer of generatedMapData wants. Without a window this is the identity.
    function localCoord(mapX, mapY) {
        if (!stitchWindow) return { x: mapX, y: mapY };
        return { x: ((mapX % CELL_W) + CELL_W) % CELL_W, y: ((mapY % CELL_H) + CELL_H) % CELL_H };
    }

    // The same map coordinate expressed inside the square the PARTY is standing
    // in, rather than inside the square it happens to fall in. The two differ
    // only for a tile just over a seam, and there this is the one to keep:
    // everything that outlives a trip off the map - the door to come back out
    // of, a tree felled, a torch lit - is filed BESIDE a square, and the square
    // it is filed beside is the party's. The answer may then fall outside 0..63,
    // which is exactly right: toMap adds the cell's offset straight back and
    // lands on the tile again.
    //
    // localCoord is the wrong tool for that job: it takes the coordinate modulo
    // the cell, so a tile one step over a seam comes back as 63 of the party's
    // own square - a different tile entirely, half a map away.
    function localToPartySquare(mapX, mapY) {
        const cell = stitchWindow && stitchWindow.partyCell;
        if (!cell) return { x: mapX, y: mapY };
        return { x: mapX - cell.ox, y: mapY - cell.oy };
    }

    // The world square a map coordinate stands on.
    function worldSquareAt(mapX, mapY) {
        const cell = cellAt(mapX, mapY);
        if (cell) return { x: cell.worldX, y: cell.worldY };
        return { x: $gameVariables.value(VAR_WORLD_X), y: $gameVariables.value(VAR_WORLD_Y) };
    }

    // Where a square-local tile sits on the loaded map. Falls back to the centre
    // cell for a square that is not in the window at all, which is what an arrival
    // wants: the transfer is landing on the square the window was just built for.
    function mapCoord(worldX, worldY, localX, localY) {
        if (!stitchWindow) return { x: localX, y: localY };
        const cell = stitchWindow.cells.find(c => c.worldX === worldX && c.worldY === worldY) ||
            stitchWindow.centreCell;
        if (!cell) return { x: localX, y: localY };
        return { x: cell.ox + localX, y: cell.oy + localY };
    }

    // ---- crossing a seam ---------------------------------------------------

    function notifySquareChanged(to, from) {
        for (const hook of squareChangedHooks) {
            try { hook(to, from); } catch (e) { console.error('[ProcStitch] square hook failed', e); }
        }
    }

    // Shift every character and the camera by the same whole number of tiles the
    // tiles themselves moved, so nothing appears to jump: the window slid under a
    // world that did not. Deliberately arithmetic on the fields rather than
    // locate(), which would straighten and snap anyone caught mid-step.
    function shiftEverything(shiftX, shiftY, newWidth, newHeight) {
        if (!shiftX && !shiftY) return;
        const move = (ch) => {
            if (!ch) return;
            ch._x += shiftX; ch._y += shiftY;
            ch._realX += shiftX; ch._realY += shiftY;
            if (ch._homeX != null) { ch._homeX += shiftX; ch._homeY += shiftY; }
        };
        move($gamePlayer);
        const followers = $gamePlayer.followers && $gamePlayer.followers();
        if (followers && followers.data) followers.data().forEach(move);
        for (const ev of $gameMap.events()) {
            // An event a populating pass did not use is parked at map (0, 0), and
            // everything downstream reads that spot as "not placed". Sliding it
            // with the tiles would carry it off the map and turn it into a placed
            // event standing nowhere.
            if (ev._x === 0 && ev._y === 0) continue;
            move(ev);
            const data = $dataMap.events && $dataMap.events[ev.eventId()];
            if (data) { data.x += shiftX; data.y += shiftY; }
            // A square can drop out of the window when it slides, and anything
            // still standing in it has just walked off the edge of the map. The
            // party's own square is always the new centre, so nothing that
            // matters is ever in this position; whatever is, is stale, and the
            // parking spot is where everything downstream reads "not placed".
            if (newWidth != null &&
                (ev._x < 0 || ev._y < 0 || ev._x >= newWidth || ev._y >= newHeight)) {
                ev.setPosition ? ev.setPosition(0, 0) : (ev._x = ev._y = 0);
                ev._realX = 0; ev._realY = 0;
                if (data) { data.x = 0; data.y = 0; }
            }
        }
        for (const veh of ($gameMap._vehicles || [])) move(veh);
        $gameMap._displayX += shiftX;
        $gameMap._displayY += shiftY;
    }

    // Hand the engine the new array. The tilemap was built around the old size, so
    // it has to be told the new one and redrawn; Game_Map itself reads width,
    // height and tiles straight off $dataMap every time, so it needs nothing.
    //
    // The scroll origin does have to be said again, and this is the one place
    // that has to say it. Spriteset_Map.updateTilemap copies $gameMap.displayX
    // into the tilemap's origin at the TOP of the frame, before $gamePlayer
    // updates - which is where a window slide is decided. So the frame a slide
    // happens on was rendering the new tiles, whose map coordinates had just
    // moved by a whole square, against an origin still describing the old ones:
    // the whole world jumped 64 tiles for exactly one frame and jumped back on
    // the next. That is the flicker of travelling across stitched squares.
    function refreshTilemap() {
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        if (!spriteset || !spriteset._tilemap) return;
        spriteset._tilemap.setData($gameMap.width(), $gameMap.height(), $gameMap.data());
        spriteset._tilemap.refresh();
        if (typeof spriteset.updateTilemap === 'function') spriteset.updateTilemap();
    }

    // ---- building the ground ahead of the party ----------------------------
    //
    // Sliding the window costs three new squares (a window shares the other six
    // with the one it replaces), and building a square is not cheap: doing all
    // three at the moment the party walks deep enough would stop the game dead
    // for as long as it takes, which is exactly the pause the window was built
    // to get rid of.
    //
    // So the squares are built BEFORE they are wanted, and a square is not built
    // in one go either: ProcGenSquare.buildJob hands back a build that can be
    // stopped between its passes and picked up on the next frame (see RESUMABLE
    // GENERATION in ProceduralMapUtils.js). This runs every frame and spends a
    // few milliseconds of it, so the ground ahead costs a slice of a frame
    // rather than a whole dropped one.
    //
    // It used to build a whole square on one frame every fifteenth, which is 15
    // to 20 ms of work landing on a frame the player is looking at: eight of
    // them in a row after an arrival, and one every quarter second while walking
    // towards a seam. That was the flicker.
    //
    // The party has to walk twelve tiles to reach a seam and eight more past it
    // before the window slides, which is seconds on foot and still a good while
    // in a car, and by then composing the new window is only a copy of tiles
    // that already exist. Nothing here is asynchronous in the real sense (there
    // is one thread and building a square costs what it costs); what changed is
    // that the cost is now paid in instalments.
    //
    // If the party outruns it anyway, the slide simply does not happen yet: the
    // window is still perfectly valid off-centre, they have most of a square to
    // cross before its outer edge, and the budget goes up until it catches up.

    const PREFETCH_MARGIN = 12;      // tiles from a seam that start the build

    // The eight squares around one, sides first: a side is walked into far more
    // often than a corner, and the queue is drained in order.
    const RING_STEPS = [
        [0, -1], [0, 1], [-1, 0], [1, 0],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];

    // Milliseconds of generation a frame may be asked for. A pass never stops in
    // the middle of a tile, so a slice overruns its budget by up to about a
    // millisecond and a half; both figures are chosen against that. The urgent
    // one is what the party outrunning the ground is worth: still under a frame,
    // and it clears a square in two or three of them.
    const PREFETCH_BUDGET_MS = 3;
    const PREFETCH_URGENT_BUDGET_MS = 8;

    const prefetchQueue = [];
    let prefetchUrgent = false;
    let lastApproachKey = null;
    // The square being built right now, a slice at a time.
    let prefetchJob = null;

    // `front` jumps the queue. The queue is FIFO because everything in it used
    // to be wanted at about the same moment; the road look-ahead is not, it is
    // ground for a seam several squares away, and a slide that is waiting on its
    // own three squares must not be made to wait behind it.
    function enqueueSquare(worldX, worldY, depth, front) {
        const api = ProcGenSquareApi();
        if (!api || !api.has || api.has(worldX, worldY, depth)) return;
        const key = depth + ':' + worldX + ',' + worldY;
        for (const job of prefetchQueue) if (job.key === key) return;
        const job = { key, worldX, worldY, depth };
        if (front) prefetchQueue.unshift(job); else prefetchQueue.push(job);
    }

    // Everything a window centred on this square would need that is not built.
    // Planned against the square the PARTY is on, not against the one being
    // planned around: the "is this a square the resolver can account for" gate
    // asks about where the party is standing, and here that is deliberately
    // somewhere else - a square they have not reached yet.
    function prefetchWindowAt(cx, cy, depth, front) {
        const here = stitchWindow && stitchWindow.partyCell;
        const guard = here ? { x: here.worldX, y: here.worldY } : null;
        const plan = planWindow(cx, cy, depth, guard);
        if (!plan) return;
        for (const cell of plan.cells) enqueueSquare(cell.worldX, cell.worldY, depth, front);
    }

    // Every square around this one that shares its tileset, whether or not the
    // window's rectangle happens to reach it.
    //
    // The rectangle is the map, but it is not the whole of what the party may
    // walk onto: a window is the LARGEST rectangle it can lay, and the largest
    // is not always the one that reaches the way they go. A neighbour left out
    // of it is still ground on this tileset, still joinable the moment they
    // touch the edge (growTowards asks for a direction by name), and if it has
    // not been built by then that step costs a whole square built on one frame.
    //
    // So the ring is paid for in instalments from the moment the party sets foot
    // in a square, sides before corners. Everything that can be walked onto
    // without a fade is on the queue long before it is wanted, and the fade is
    // left to the crossings that really are crossings: a different tileset, or a
    // square the old system owns.
    function prefetchStitchableRing(cell) {
        if (!stitchWindow || !cell || !stitchingAllowed()) return;
        const api = ProcGenSquareApi();
        if (!api || !api.resolve) return;
        const depth = stitchWindow.depth;
        const centre = api.resolve(cell.worldX, cell.worldY, { depth });
        if (!centre || !centre.biome) return;
        const alienGrid = procGen() && procGen().alienGrid;
        for (const [dx, dy] of RING_STEPS) {
            const coord = neighbourCoord(cell.worldX, cell.worldY, dx, dy, alienGrid);
            if (!coord) continue;
            if (coord.x === cell.worldX && coord.y === cell.worldY) continue;
            if (!canStitch(centre, coord.x, coord.y, depth)) continue;
            enqueueSquare(coord.x, coord.y, depth);
        }
    }

    // Spend this frame's share on the square at the head of the queue. One
    // square is in flight at a time: the generator keeps module state (the
    // influence field, the coastline, the borrowed square scope) for the length
    // of a build, and anything that needs a square outright cancels this one
    // rather than running alongside it.
    function drainPrefetch() {
        const api = ProcGenSquareApi();
        if (!api || !api.buildJob) {
            // An older ProceduralMapBiomeGenerator without resumable builds:
            // fall back to the whole square at once rather than to nothing.
            if (!prefetchQueue.length || !api) { prefetchUrgent = false; return; }
            const one = prefetchQueue.shift();
            try {
                api.build(one.worldX, one.worldY, { depth: one.depth });
            } catch (e) {
                console.error(`[ProcStitch] could not build (${one.worldX},${one.worldY})`, e);
            }
            return;
        }

        if (prefetchJob && prefetchJob.done) prefetchJob = null;
        if (!prefetchJob) {
            if (!prefetchQueue.length) { prefetchUrgent = false; return; }
            const next = prefetchQueue.shift();
            // Somebody else may have built it in the meantime (the party walked
            // onto it, a transfer landed on it): then there is nothing to do.
            if (api.has && api.has(next.worldX, next.worldY, next.depth)) return;
            prefetchJob = api.buildJob(next.worldX, next.worldY, { depth: next.depth });
            prefetchJob.square = next;
        }

        const budget = prefetchUrgent ? PREFETCH_URGENT_BUDGET_MS : PREFETCH_BUDGET_MS;
        const r = prefetchJob.step(budget);
        if (r.done) prefetchJob = null;
    }

    // Nothing queued is worth building any more (the party left, the window
    // closed, a save was loaded). Whatever is half-built goes with it: it is
    // derived from the world seed and costs the same to start again.
    function dropPrefetch() {
        if (prefetchJob && prefetchJob.cancel) prefetchJob.cancel();
        prefetchJob = null;
        prefetchQueue.length = 0;
        prefetchUrgent = false;
    }

    // The party is walking towards a seam: start on the squares the window they
    // are about to need will be made of, well before they get there. Only the
    // side they are actually near, and only once per tile they stand on.
    function prefetchAhead(cell) {
        if (!stitchWindow) return;
        const lx = $gamePlayer.x - cell.ox, ly = $gamePlayer.y - cell.oy;
        const depth = stitchWindow.depth;
        let dx = 0, dy = 0;
        if (lx < PREFETCH_MARGIN) dx = -1;
        else if (lx >= CELL_W - PREFETCH_MARGIN) dx = 1;
        if (ly < PREFETCH_MARGIN) dy = -1;
        else if (ly >= CELL_H - PREFETCH_MARGIN) dy = 1;
        if (!dx && !dy) return;

        const alienGrid = procGen() && procGen().alienGrid;
        for (const [sx, sy] of [[dx, 0], [0, dy], [dx, dy]]) {
            if (!sx && !sy) continue;
            const coord = neighbourCoord(cell.worldX, cell.worldY, sx, sy, alienGrid);
            if (!coord) continue;
            prefetchWindowAt(coord.x, coord.y, depth);
        }
    }

    // ---- the road ahead ----------------------------------------------------
    //
    // Twelve tiles from a seam is the right moment to start on the ground beside
    // an ordinary square, because until then there is no telling which way the
    // party will wander. A road is not like that. A road square joins onto road
    // squares and nothing else - that is what makes the carriageway continuous
    // across a seam in the first place - so the ground a party DRIVING is going
    // to want is knowable a long way out: it is the road itself, and the
    // branches it opens on the way.
    //
    // A road is also where the party is fastest, so it is exactly where the
    // twelve-tile margin is worth the least: a car crosses it in a couple of
    // seconds and arrives at the seam before the instalments have finished
    // paying for the square on the far side of it, which is what makes growTowards
    // build one outright and drop a frame.
    //
    // So a road is walked instead: from the square the party is standing in,
    // outward along every road square that is not behind them, a few squares
    // deep. Whatever that reaches is queued the same way everything else is, a
    // slice of a frame at a time, and the slide that eventually wants it finds
    // it already built.
    const ROAD_LOOKAHEAD = 3;        // road squares deep
    const ROAD_PREFETCH_LIMIT = 6;   // and no more than this many in one walk
    const ROAD_STEPS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    // The square (and facing) the last road walk was made from: the walk is a
    // dozen resolutions and there is no sense repeating it for every tile of a
    // square the party is driving straight across.
    let lastRoadKey = null;

    function prefetchRoadAhead(cell) {
        if (!stitchWindow || typeof isRoadBiome !== 'function') return;
        // Never crowd the queue: the road is the least urgent thing in it.
        if (prefetchQueue.length >= ROAD_PREFETCH_LIMIT) return;
        const api = ProcGenSquareApi();
        if (!api || !api.resolve) return;
        const depth = stitchWindow.depth;
        const here = api.resolve(cell.worldX, cell.worldY, { depth });
        if (!here || !here.biome || !isRoadBiome(here.biomeName)) return;

        const alienGrid = procGen() && procGen().alienGrid;
        // The way the party came is ground they have already crossed. Everything
        // else the road offers - straight on, and both sides of a junction or a
        // corner - is ground they may be about to.
        const facing = EXIT_DELTA[$gamePlayer.direction()] || null;

        const seen = new Set([cell.worldX + ',' + cell.worldY]);
        let frontier = [{ x: cell.worldX, y: cell.worldY, from: facing }];
        let laid = 0;

        for (let step = 0; step < ROAD_LOOKAHEAD && frontier.length && laid < ROAD_PREFETCH_LIMIT; step++) {
            const next = [];
            for (const node of frontier) {
                for (const [dx, dy] of ROAD_STEPS) {
                    if (node.from && dx === -node.from.dx && dy === -node.from.dy) continue;
                    const coord = neighbourCoord(node.x, node.y, dx, dy, alienGrid);
                    if (!coord) continue;
                    const key = coord.x + ',' + coord.y;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const r = api.resolve(coord.x, coord.y, { depth });
                    // One map, one tileset: a road square whose tileset differs
                    // could never be laid alongside this one anyway, so building
                    // it ahead would buy nothing.
                    if (!r || !r.biome || r.tilesetId !== here.tilesetId) continue;
                    if (!isRoadBiome(r.biomeName)) continue;
                    next.push({ x: coord.x, y: coord.y, from: { dx, dy } });
                    enqueueSquare(coord.x, coord.y, depth);
                    if (++laid >= ROAD_PREFETCH_LIMIT) break;
                }
                if (laid >= ROAD_PREFETCH_LIMIT) break;
            }
            frontier = next;
        }
    }

    // Every square a window centred here would need, already built?
    function readyWindowAt(cx, cy, depth) {
        const plan = planWindow(cx, cy, depth);
        if (!plan) return null;
        const api = ProcGenSquareApi();
        if (!api || !api.has) return plan;
        for (const cell of plan.cells) {
            if (!api.has(cell.worldX, cell.worldY, depth)) return null;
        }
        return plan;
    }

    /**
     * The party is standing in a square that is not the window's centre. Slide the
     * window over so it is, generating whatever squares that brings into view
     * (three of the nine, at most: a window shares the other six with the one it
     * replaces, and ProcGenSquare keeps them).
     */
    function recentre(cell) {
        const old = stitchWindow;
        if (!old) return false;
        // Only slide onto ground that is already built. When it is not, the queue
        // is told to hurry and the party carries on in a window that is merely
        // off-centre, which it is perfectly entitled to be.
        const win = readyWindowAt(cell.worldX, cell.worldY, old.depth);
        if (!win) {
            prefetchWindowAt(cell.worldX, cell.worldY, old.depth, true);
            prefetchUrgent = true;
            return false;
        }
        return installWindow(win, cell);
    }

    /**
     * Swap the window standing on the map for a freshly planned one and slide
     * everything on it by the distance the two disagree about. Composition is
     * only a copy of squares that already exist by the time this runs, so the
     * swap costs no fade and no reload: the tiles move under a world that did
     * not, and the party keeps walking.
     *
     * @param {object} oldCell the cell, in the window being replaced, of the
     *        square the new one is centred on. The two windows are read off it
     *        rather than off their top-left corners: a planet's landing grid
     *        wraps, so "how far apart are the two origins" can name a distance
     *        right round the world, while one square's own two map positions are
     *        the rigid translation between the windows however the grid folds.
     */
    function installWindow(win, oldCell) {
        if (!composeWindow(win)) return false;

        // The map coordinate of one and the same world tile, before and after.
        const shiftX = win.centreOx - oldCell.ox;
        const shiftY = win.centreOy - oldCell.oy;

        stitchWindow = win;
        $dataMap.data = win.data;
        $dataMap.width = win.width;
        $dataMap.height = win.height;
        adoptCell(win, win.centreCell);
        $dataMap.displayName = procMapDisplayName();

        // The map just changed size and every tile moved: any cache keyed on the
        // map id alone (NPCSystem's passable-tile scan) is now describing a map
        // that no longer exists.
        $gameMap._passableTerrainCache = null;
        // The map is a different shape now, so which of its edges are borders is
        // a different question than it was a moment ago.
        forgetGrowthAnswers();
        shiftEverything(shiftX, shiftY, win.width, win.height);
        $gameMap.setDisplayPos($gameMap._displayX, $gameMap._displayY);
        refreshTilemap();
        return true;
    }

    /**
     * The party is about to walk off the OUTER edge of the map and the square on
     * the far side of it shares this one's tileset: that is not a destination,
     * it is more ground. Re-plan the window around the square they are standing
     * in, insisting the neighbour they are walking into comes with it, and lay
     * the result down under them. The step that follows is an ordinary step.
     *
     * Two things used to send a perfectly stitchable crossing through the fade:
     *   - the plan takes the LARGEST rectangle it can, and the largest is not
     *     always the one that reaches the way the party is walking. Three
     *     joinable squares to the west beat one to the east, so the east
     *     neighbour was left off the map even though nothing was wrong with it.
     *   - the ground ahead is built in instalments, and a party in a vehicle can
     *     outrun it. The window then never slides and its outer edge arrives.
     * Both are answered here: the direction is asked for by name, and whatever
     * the queue has not got to yet is built on the spot, because this is the
     * step that walks onto it.
     *
     * @param {number} exitDirection RMMZ direction being walked out of the map.
     * @param {number} [atX] map tile the crossing is made from (the party's own).
     * @returns {boolean} true when the map now reaches past the edge, so the
     *          caller should simply let the move happen.
     */
    // The window a step out of the map this way would need, and the cell it
    // would be taken from, or null when the crossing is a real one. Split out of
    // growTowards because the very same question is asked WITHOUT taking the
    // step: an edge that can be grown over is not a border, so it is drawn with
    // no crossing marker on it at all (see getProcGenBorderTiles).
    function planGrowth(exitDirection, atX, atY) {
        if (!stitchWindow || !stitchingAllowed()) return null;
        const delta = EXIT_DELTA[exitDirection];
        if (!delta) return null;
        const px = atX != null ? atX : $gamePlayer.x;
        const py = atY != null ? atY : $gamePlayer.y;
        const cell = cellAt(px, py) || stitchWindow.partyCell;
        if (!cell) return null;

        const depth = stitchWindow.depth;
        // The guard is about the square the PARTY is standing on, never about the
        // one being asked about. Every edge tile in sight asks this question, and
        // the ones on a neighbouring cell of the window are asking on behalf of a
        // square with its own biome name: guarding those against _procGenData's
        // currentBiome (which names the party's square) made the plan refuse a
        // perfectly joinable neighbour the moment two cells of one window
        // disagreed about their name - Fields beside Meadows, both on tileset
        // 300. The whole side of the map was then drawn with crossing markers on
        // it and walking off it cost a fade, for ground that was already there.
        const party = stitchWindow.partyCell;
        const guard = party
            ? { x: party.worldX, y: party.worldY }
            : { x: cell.worldX, y: cell.worldY };
        const win = planWindow(cell.worldX, cell.worldY, depth, guard, delta);
        if (!win) return null;
        // The neighbour is already on the map and the party still reached an
        // edge: this is the window's own outer boundary and there is nothing
        // beyond it to lay down. The old crossing takes over.
        if (win.originX === stitchWindow.originX && win.originY === stitchWindow.originY &&
            win.cols === stitchWindow.cols && win.rows === stitchWindow.rows) return null;
        return { win, cell, depth };
    }

    // Would walking off the map this way simply be another step? Every edge tile
    // within sight of the party asks this every time they move, and a whole side
    // of the map is a dozen tiles of one square asking the same question, so the
    // answer is kept per square and direction. It is thrown away whenever the
    // window changes shape under it, which is the only thing that can change it.
    const growthAnswers = new Map();

    function forgetGrowthAnswers() {
        growthAnswers.clear();
    }

    function canGrowTowards(exitDirection, atX, atY) {
        if (!stitchWindow) return false;
        const px = atX != null ? atX : $gamePlayer.x;
        const py = atY != null ? atY : $gamePlayer.y;
        const cell = cellAt(px, py) || stitchWindow.partyCell;
        if (!cell) return false;
        const key = cell.worldX + ',' + cell.worldY + ':' + exitDirection;
        const held = growthAnswers.get(key);
        if (held !== undefined) return held;
        const answer = !!planGrowth(exitDirection, px, py);
        growthAnswers.set(key, answer);
        return answer;
    }

    function growTowards(exitDirection, atX, atY) {
        const growth = planGrowth(exitDirection, atX, atY);
        if (!growth) return false;
        const win = growth.win, cell = growth.cell, depth = growth.depth;

        // The queue is building for a window that is about to be replaced, and
        // its half-finished square would be paid for twice.
        dropPrefetch();
        const api = ProcGenSquareApi();
        for (const c of win.cells) {
            if (!api.has || api.has(c.worldX, c.worldY, depth)) continue;
            try {
                if (!api.build(c.worldX, c.worldY, { depth })) return false;
            } catch (e) {
                console.error(`[ProcStitch] could not build (${c.worldX},${c.worldY})`, e);
                return false;
            }
        }
        if (!installWindow(win, cell)) return false;
        // Player 2 can be the one at the edge, and the window is then planned
        // around THEIR square: everything that answers "which square is this"
        // still has to point at the one the party is standing in.
        const standing = cellAt($gamePlayer.x, $gamePlayer.y);
        if (standing) adoptCell(win, standing);
        resetStitchTracking();
        return true;
    }

    // Watch the party for a seam crossing. Two separate things happen, and they
    // happen at different moments on purpose:
    //   - the instant the party sets foot in another square, everything that
    //     answers "which square is this" is re-pointed at it. That is cheap and
    //     must not lag, because the encounter table, the weather and the map name
    //     all read it.
    //   - the window itself only slides once the party is properly inside, so
    //     walking along a seam does not rebuild on every other step.
    let lastSquareKey = null;

    // A window that has just been laid down is already centred on the party, so
    // the tracker starts holding that square: without this the first frame after
    // every transfer would report a crossing that never happened.
    function resetStitchTracking() {
        const cell = stitchWindow && stitchWindow.partyCell;
        lastSquareKey = cell ? cell.worldX + ',' + cell.worldY : null;
        lastApproachKey = null;
        lastRoadKey = null;
        forgetGrowthAnswers();
        dropPrefetch();
        // Start on the ring around the arrival straight away, so the first seam
        // the party reaches is already paid for.
        if (stitchWindow && cell) {
            prefetchWindowAt(cell.worldX, cell.worldY, stitchWindow.depth);
            prefetchStitchableRing(cell);
        }
    }

    function updateStitchTracking() {
        if (!stitchWindow || $gameMap.mapId() !== procMapId) return;
        // One queued square is built per call at most, and only when its turn has
        // come round: see drainPrefetch. This runs even mid-transfer, because the
        // work it does is exactly what stops the next slide from stalling.
        drainPrefetch();
        if ($gamePlayer.isTransferring()) return;
        const cell = cellAt($gamePlayer.x, $gamePlayer.y);
        if (!cell) return;

        const key = cell.worldX + ',' + cell.worldY;
        if (key !== lastSquareKey) {
            const from = lastSquareKey;
            lastSquareKey = key;
            adoptCell(stitchWindow, cell);
            updateBiomeAudio();
            $dataMap.displayName = procMapDisplayName();
            const scene = SceneManager._scene;
            if (scene && scene._mapNameWindow && scene._mapNameWindow.open) {
                scene._mapNameWindow.refresh();
                scene._mapNameWindow.open();
            }
            $gameMap.requestRefresh();
            // The square was already built and already on screen; what arrives
            // with the party is its population.
            populatePartySquare();
            notifySquareChanged(key, from);
            // The window this square will want is three squares' work away, and
            // the party is eight tiles from asking for it.
            prefetchWindowAt(cell.worldX, cell.worldY, stitchWindow.depth);
            // ...and every neighbour of it that shares its tileset, whether the
            // window reaches that far or not.
            prefetchStitchableRing(cell);
        }

        // Walking towards a seam starts the ground on the far side of it, once
        // per tile stood on rather than once per frame: planning a window is nine
        // resolutions and there is no sense repeating them while standing still.
        const tileKey = $gamePlayer.x + ',' + $gamePlayer.y;
        if (tileKey !== lastApproachKey) {
            lastApproachKey = tileKey;
            prefetchAhead(cell);
        }

        // A road reaches further than the margin does (see the road ahead,
        // above), and it is re-walked when the party turns rather than when they
        // step.
        const roadKey = cell.worldX + ',' + cell.worldY + ':' + $gamePlayer.direction();
        if (roadKey !== lastRoadKey) {
            lastRoadKey = roadKey;
            prefetchRoadAhead(cell);
        }

        // Far enough in to be worth sliding the window?
        if (cell === stitchWindow.centreCell) return;
        const lx = $gamePlayer.x - cell.ox, ly = $gamePlayer.y - cell.oy;
        const deepEnough =
            lx >= RECENTRE_MARGIN && lx < CELL_W - RECENTRE_MARGIN &&
            ly >= RECENTRE_MARGIN && ly < CELL_H - RECENTRE_MARGIN;
        if (!deepEnough) return;
        if ($gamePlayer.isMoving() || $gameMap.isEventRunning() || $gameMessage.isBusy()) return;
        recentre(cell);
    }

    // ---- putting events in the right square --------------------------------
    //
    // Every pass that populates the procedural map - the chests, the traps, the
    // dungeon doors, the key chests, the police, the enemies - was written when
    // the map WAS the square, so it scans the square's own 64x64 tile array, asks
    // $gameMap whether a tile it found is passable, and calls setPosition with the
    // answer. All three of those are square-local numbers, and inside a window
    // they are no longer map numbers: run unchanged, a pass would validate tiles
    // in the window's top-left square and drop every chest in the world there.
    //
    // Rather than teach six passes (in three plugins) about the window, the
    // window pretends to be the square for the length of a pass: $gameMap answers
    // coordinate questions about the party's own cell, $gamePlayer reports its
    // position inside it, and setPosition converts the result back. Nothing that
    // populates a square had to change, and anything added later gets the same
    // treatment for free.
    //
    // The one number that stays as it was is the parking spot. A pass puts the
    // events it did not use at (0, 0) and everything downstream reads that as
    // "not placed", so it is passed through untouched.

    // Game_Map methods that take a map coordinate. While a pass runs, each is
    // handed square-local ones and shifts them into the party's cell.
    const LOCAL_VIEW_METHODS = [
        'isPassable', 'isBoatPassable', 'isShipPassable', 'isAirshipLandOk',
        'checkPassage', 'tileId', 'layeredTiles', 'allTiles', 'autotileType',
        'isLadder', 'isBush', 'isCounter', 'isDamageFloor', 'terrainTag',
        'regionId', 'eventsXy', 'eventsXyNt', 'tileEventsXy', 'eventIdXy',
        'checkLayeredTilesFlags',
    ];

    let localView = null;   // {x, y} offset of the cell a pass is running for

    // setPosition is the one door every placement pass leaves by.
    const _Stitch_setPosition = Game_CharacterBase.prototype.setPosition;
    Game_CharacterBase.prototype.setPosition = function(x, y) {
        if (localView && !(x === 0 && y === 0)) {
            x += localView.x;
            y += localView.y;
        }
        _Stitch_setPosition.call(this, x, y);
    };

    /**
     * Run fn with the world looking like the one 64x64 square `cell` holds.
     * Without a window (or without a cell) it is a plain call, which is what
     * every one of these passes has always been.
     *
     * A zero offset is NOT the same question. The window's top-left square sits
     * at (0, 0) like any single-square map does, but the map around it is still
     * three squares wide: read as "nothing to shift", a pass run for that corner
     * scanned the whole window and scattered its chests, its police and its
     * monsters over all nine squares - which is why walking into the north-west
     * of a window found the country empty. What decides is whether a window is
     * standing at all, not where in it the party happens to be.
     */
    function withSquareLocalView(cell, fn) {
        if (!cell || !stitchWindow) return fn();

        const ox = cell.ox, oy = cell.oy;

        // The engine's tile API is layered, and every layer of it is on the list
        // above: terrainTag asks isValid and layeredTiles, layeredTiles asks
        // tileId, isPassable asks checkPassage which asks allTiles which asks
        // tileEventsXy and layeredTiles again, regionId and isLadder and isBush
        // all ask isValid first. Shifting each of them in turn shifted a
        // square-local coordinate once for every layer it fell through, and
        // handed the narrowed isValid a MAP coordinate it could only answer "no"
        // to. So on any square the window does not hold at its own corner every
        // tile reported terrain tag 0, the spawner found not one tile it could
        // put a monster on and erased all fifteen of them: the square the party
        // walked into came up empty, every time, which is the bug this guard
        // exists for.
        //
        // Only the OUTERMOST call is shifted. While an engine method is running
        // the API is itself again, in map coordinates, exactly as it would be
        // with no window standing at all.
        let inEngine = 0;
        const savedMap = {};
        for (const name of LOCAL_VIEW_METHODS) {
            const original = $gameMap[name];
            if (typeof original !== 'function') continue;
            savedMap[name] = original;
            $gameMap[name] = function(x, y, ...rest) {
                if (inEngine > 0) return original.call(this, x, y, ...rest);
                inEngine++;
                try {
                    return original.call(this, x + ox, y + oy, ...rest);
                } finally {
                    inEngine--;
                }
            };
        }
        // isValid, width and height have to answer for the square, not the map,
        // or a scan written as "for x < $gameMap.width()" would walk the window.
        // Inside an engine method they answer for the map again, for the same
        // reason: what is being measured there is a map coordinate.
        const savedIsValid = $gameMap.isValid;
        const savedWidth = $gameMap.width;
        const savedHeight = $gameMap.height;
        $gameMap.isValid = function(x, y) {
            return inEngine > 0
                ? savedIsValid.call(this, x, y)
                : (x >= 0 && x < CELL_W && y >= 0 && y < CELL_H);
        };
        $gameMap.width = function() {
            return inEngine > 0 ? savedWidth.call(this) : CELL_W;
        };
        $gameMap.height = function() {
            return inEngine > 0 ? savedHeight.call(this) : CELL_H;
        };

        // x and y are prototype getters on Game_CharacterBase; an own getter
        // shadows them for as long as it is there. A getter and not a fixed
        // value, because setPosition writes _x while the pass is still running
        // and a pass that reads a position back has to see what it just set.
        // The player AND the events, so that nothing inside a pass can end up
        // comparing a local tile against a map position.
        const shadowed = [];
        const shadow = (ch) => {
            if (!ch || Object.prototype.hasOwnProperty.call(ch, 'x')) return;
            Object.defineProperty(ch, 'x', { get() { return this._x - ox; }, configurable: true });
            Object.defineProperty(ch, 'y', { get() { return this._y - oy; }, configurable: true });
            shadowed.push(ch);
        };
        shadow($gamePlayer);
        for (const ev of $gameMap.events()) shadow(ev);

        // NPCSystem caches its passable-tile scan on $gameMap keyed by map id
        // alone. That key cannot tell the window from a square inside it, so a
        // scan made in one space would be handed straight back in the other.
        // Dropped on the way in and on the way out; it is one pass to rebuild.
        const savedTileCache = $gameMap._passableTerrainCache;
        $gameMap._passableTerrainCache = null;

        const savedView = localView;
        localView = { x: ox, y: oy };
        try {
            return fn();
        } finally {
            $gameMap._passableTerrainCache = savedTileCache;
            localView = savedView;
            for (const name of Object.keys(savedMap)) $gameMap[name] = savedMap[name];
            $gameMap.isValid = savedIsValid;
            $gameMap.width = savedWidth;
            $gameMap.height = savedHeight;
            for (const ch of shadowed) { delete ch.x; delete ch.y; }
        }
    }

    // The square the party is standing in, as a cell, or null when there is no
    // window and the map already is the square.
    function partyCell() {
        if (!stitchWindow) return null;
        return cellAt($gamePlayer.x, $gamePlayer.y) || stitchWindow.partyCell;
    }

    /**
     * Run every pass that populates a square, for the square the party is in.
     * Called on arrival and again whenever the party walks into a new one, which
     * is what keeps a crossing feeling like a crossing: the world was already
     * there, its inhabitants arrive with the party.
     */
    // What the last population was for. A square is populated on arrival and on
    // every crossing into a new one; a plain Scene_Map rebuild (closing a menu,
    // leaving the battle scene) is neither, and must never re-roll the placement
    // passes. They only look deterministic: every one of them rejects tiles that
    // are occupied or under the party, so running them again once the party has
    // walked a few steps hands back a DIFFERENT map, which is how a cardboard
    // box turned into an armour chest across a menu round trip.
    let populatedKey = null;

    function squarePopulationKey() {
        const pg = procGen();
        if (!pg) return null;
        return [
            $gameVariables.value(VAR_WORLD_X),
            $gameVariables.value(VAR_WORLD_Y),
            (pg.biomeLayerStack || []).length,
            pg.currentBiome || '',
        ].join(':');
    }

    // Say so whenever the tiles under the party have been laid down afresh: the
    // events standing on them have to be placed again on top.
    function invalidateSquarePopulation() {
        populatedKey = null;
    }

    function populatePartySquare(force) {
        const key = squarePopulationKey();
        // Already dealt, and the party has not left the square nor had the ground
        // relaid under them: leave it exactly as it stands.
        if (!force && key !== null && key === populatedKey) return false;
        populatedKey = key;
        withSquareLocalView(partyCell(), () => {
            if (placeChestEvents) placeChestEvents();
            if (placeSpikeTrapEvents) placeSpikeTrapEvents();
            if (placeDungeonDoorEvents) placeDungeonDoorEvents();
            if (placeKeyChestEvents) placeKeyChestEvents();
            if (placePolicemanEvents) placePolicemanEvents();
        });
        updateEventVisibility();
        withSquareLocalView(partyCell(), () => refreshEnemiesForBiome());
        return true;
    }

    window.ProcStitch = {
        // Is a window standing right now?
        active() { return !!stitchWindow; },
        window() { return stitchWindow; },
        cellSize() { return { width: CELL_W, height: CELL_H }; },
        open: openWindow,
        close: closeWindow,
        // The Map Streaming option was just flipped. Turning it off tears the
        // standing window down and reloads the party's own square on its own;
        // turning it on lets the next step build a window again.
        onStreamingChanged(on) {
            if (on || !stitchWindow) return;
            const pg = procGen();
            const here = worldSquareAt($gamePlayer.x, $gamePlayer.y);
            const local = localCoord($gamePlayer.x, $gamePlayer.y);
            closeWindow();
            // Nothing is cached while streaming is off: drop the squares the
            // window had already built so they are not held for a session.
            const api = ProcGenSquareApi();
            if (api && api.forget) api.forget();
            if (pg && here) {
                $gameVariables.setValue(VAR_WORLD_X, here.x);
                $gameVariables.setValue(VAR_WORLD_Y, here.y);
            }
            if ($gameMap.mapId() === procMapId) {
                $gamePlayer.reserveTransfer(procMapId, local.x, local.y, $gamePlayer.direction(), 2);
            }
        },
        plan: planWindow,
        compose: composeWindow,
        apply: applyWindowToDataMap,
        recentre,
        // Lay the neighbour the party is walking into onto the map instead of
        // crossing to it. Answers false when it may not be joined on, which is
        // when the fading crossing is the right answer.
        growTowards,
        // The same question, asked without doing it: would a step off the map
        // this way be an ordinary step? What decides whether an edge is drawn as
        // a border at all.
        canGrow: canGrowTowards,
        // The landing-grid cell the party now stands in, on an alien surface.
        adoptAlienCell: adoptAlienGridCell,
        cellAt,
        // Say so after editing a square's own array once it is already laid down.
        syncCell,
        // A map coordinate expressed inside its own world square. THE call for
        // anything that indexes _procGenData.generatedMapData by map position.
        local: localCoord,
        // The same, anchored to the party's own square: what anything that
        // stores a tile for later has to keep (see localToPartySquare).
        localToParty: localToPartySquare,
        // The world square a map coordinate stands on.
        squareAt: worldSquareAt,
        // Where a square-local tile sits on the loaded map.
        toMap: mapCoord,
        // Called whenever the party sets foot in a different world square without
        // a transfer having happened. hook(toKey, fromKey).
        onSquareChanged(hook) { if (typeof hook === 'function') squareChangedHooks.push(hook); },
        setDisabled(off) { stitchDisabled = !!off; if (off) closeWindow(); },
        isDisabled() { return stitchDisabled; },
        // Run fn with the world looking like the single 64x64 square the party
        // stands in: THE call for anything that populates a square.
        inPartySquare(fn) { return withSquareLocalView(partyCell(), fn); },
        partyCell,
        populate: populatePartySquare,
        // Say so after relaying a square's tiles behind ProcStitch's back: the
        // next populate will deal it again instead of holding what it has.
        invalidatePopulation: invalidateSquarePopulation,
        // How much ground is still being built ahead of the party, the square
        // half-built right now included.
        pending() { return prefetchQueue.length + (prefetchJob && !prefetchJob.done ? 1 : 0); },
        _prefetchAt: prefetchWindowAt,
        _drain: drainPrefetch,
        _update: updateStitchTracking,
        _resetTracking: resetStitchTracking,
    };

    // ---- the two hooks that make the window invisible to everyone else ------

    // Every reserveTransfer onto map 636 is an arrival on a NAMED square, so the
    // window that is about to be built has to be built around that square rather
    // than around whichever one the last window happened to be centred on.
    const _Stitch_reserveTransfer = Game_Player.prototype.reserveTransfer;
    Game_Player.prototype.reserveTransfer = function(mapId, x, y, d, fadeType) {
        if (mapId === procMapId) {
            const pg = procGen();
            if (pg) pg._stitchReanchor = true;
        }
        _Stitch_reserveTransfer.call(this, mapId, x, y, d, fadeType);
    };

    // ...and the coordinates it carries are SQUARE-LOCAL, because every caller
    // that ever computed a spawn tile on the procedural map computed it inside a
    // 64x64 square: the border crossing, startProcGen, a structure's own entrance,
    // the bunker hatch, a landing on an alien surface. The window is already on
    // $dataMap by the time this runs (Scene_Map loads the map data first and calls
    // performTransfer from onMapLoaded), so this is the one place that has to know
    // the difference, and it is why nothing else did.
    const _Stitch_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        if (this.isTransferring() && this._newMapId === procMapId && stitchWindow) {
            const square = {
                x: $gameVariables.value(VAR_WORLD_X),
                y: $gameVariables.value(VAR_WORLD_Y),
            };
            const onMap = mapCoord(square.x, square.y, this._newX, this._newY);
            this._newX = onMap.x;
            this._newY = onMap.y;
        }
        _Stitch_performTransfer.call(this);
        // Off the procedural map the window means nothing, and leaving it up
        // would have cellAt() answering for tiles of a map that is not loaded.
        if ($gameMap.mapId() !== procMapId && stitchWindow) closeWindow();
        if ($gameMap.mapId() === procMapId && stitchWindow) {
            const standing = cellAt(this.x, this.y);
            if (standing) adoptCell(stitchWindow, standing);
            resetStitchTracking();
        }
    };

    // The seam watch. Runs off the player's own update so it sees every step,
    // including the ones a vehicle, the autopilot or the idle explorer take.
    const _Stitch_Game_Player_update = Game_Player.prototype.update;
    Game_Player.prototype.update = function(sceneActive) {
        _Stitch_Game_Player_update.call(this, sceneActive);
        if (stitchWindow) updateStitchTracking();
    };

    // Proc map edge: regenerate adjacent biome and transfer seamlessly
    const _orig_Player_moveStraight = Game_Player.prototype.moveStraight;
    Game_Player.prototype.moveStraight = function(d) {
        if ($gameMap.mapId() !== procMapId) {
            if ($gameMap.mapId() === worldMapId && $gameTemp && $gameTemp._lastWorldMapReturnOrigin) {
                $gameTemp._lastWorldMapReturnOrigin = null;
            }
            // Hand-made maps declare their exits with <Worldmap>: walking off a
            // walkable edge is handled by checkBorderTeleport, pushing against a
            // fenced one here.
            if (this.tryBorderReturn(d)) return;
            _orig_Player_moveStraight.call(this, d);
            return;
        }

        const x         = this.x, y = this.y;
        const mapWidth  = $gameMap.width(), mapHeight = $gameMap.height();
        let wouldLeave  = false, exitDirection = 0;

        switch (d) {
            case 2: if (y + 1 >= mapHeight) { wouldLeave = true; exitDirection = 2; } break;
            case 4: if (x - 1 < 0)          { wouldLeave = true; exitDirection = 4; } break;
            case 6: if (x + 1 >= mapWidth)  { wouldLeave = true; exitDirection = 6; } break;
            case 8: if (y - 1 < 0)          { wouldLeave = true; exitDirection = 8; } break;
        }

        if (!wouldLeave) { _orig_Player_moveStraight.call(this, d); return; }

        // Leaving the MAP is not the same thing as leaving the SQUARE any more.
        // Inside a stitched window the seams between squares are ordinary tiles
        // and were walked over without ever reaching here; what is left is the
        // window's own outer edge, and the square being left by it is whichever
        // one the party is actually standing in, not the one the window is
        // centred on. Everything below wants that square, so say so.
        if (window.ProcStitch && window.ProcStitch.active()) {
            const here = window.ProcStitch.squareAt(x, y);
            $gameVariables.setValue(VAR_WORLD_X, here.x);
            $gameVariables.setValue(VAR_WORLD_Y, here.y);
        }

        // Already mid-transition (or a transfer is pending): swallow further edge
        // input so we do not restart the fade or overwrite the callback every
        // frame. Without this, holding a direction at high vehicle speed (e.g. the
        // Car) re-arms the transition after the destination map has already faded
        // in, leaving the screen stuck black (issue #164).
        if (this.isTransferring() ||
            ($gameSystem._procGenData && $gameSystem._procGenData._edgeTransitionScheduled)) {
            return;
        }

        // Door / Sandbox dungeon: the border is the way OUT. Return to the map the
        // player came from instead of travelling to an adjacent biome.
        if ($gameSystem._procGenData && $gameSystem._procGenData._dungeonSession) {
            exitDungeonSession(d);
            return;
        }

        // A neighbour on this square's own tileset is not somewhere else, it is
        // more of here. Lay it down and take the step: no fade, no reload.
        if (window.ProcStitch && window.ProcStitch.growTowards(exitDirection, x, y)) {
            _orig_Player_moveStraight.call(this, d);
            return;
        }

        console.log(`[WorldMapReturn-Edge] Border touched, starting fade out`);
        scheduleProcEdgeTransition(exitDirection, x, y, d);
    };

    const _orig_Player_moveDiagonally = Game_Player.prototype.moveDiagonally;
    Game_Player.prototype.moveDiagonally = function(horz, vert) {
        if ($gameMap.mapId() === worldMapId && $gameTemp && $gameTemp._lastWorldMapReturnOrigin) {
            $gameTemp._lastWorldMapReturnOrigin = null;
        }
        _orig_Player_moveDiagonally.call(this, horz, vert);
    };

    // Leave a door/sandbox-generated dungeon when the player steps onto the border.
    //   - sandbox: transfer back to the map Sandbox Mode was invoked from.
    //   - door:    pop up to the surface (goUp) at the tile just south of the door.
    function exitDungeonSession(d) {
        const pg = $gameSystem._procGenData;
        const sess = pg && pg._dungeonSession;
        if (!sess) return;

        // A floor of the lower tower (DungeonFloorSystem) is generated with the
        // same south entrance every structure is, but nothing was ever entered
        // through it: the party arrived by a staircase or by the lift, and those
        // are the only ways out again. The doorway is walled up, so the border
        // is not a way out and the session stays standing.
        if (sess.type === 'tower') return;

        pg._dungeonSession = null;
        $gamePlayer.clearProcGenBorderArrows();
        if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;

        if (sess.type !== 'bunker' && sess.type !== 'sandbox') {
            // Door dungeon: goUp regenerates the surface and returns to
            // goDownEventX/Y, fading and waiting on its own.
            PluginManager.callCommand($gameMap._interpreter || {}, PLUGIN_PMT, 'goUp', {});
            return;
        }

        // Wait for the screen to go fully black before swapping the tileset:
        // reserveTransfer used to fire the instant the fade started, so the
        // surface popped in while the dungeon was still visible underneath it.
        // Reuses the same "wait for $gameScreen brightness 0" hook the biome
        // edge-crossing transition drives (see Game_Screen.prototype.update below).
        $gameScreen.startFadeOut(10);
        pg._edgeTransitionScheduled = true;
        pg._edgeTransitionCallback = () => {
            if (!pg._edgeTransitionScheduled) return;
            pg._edgeTransitionScheduled = false;

            if (sess.type === 'bunker') {
                // Climbing out of the character-creation bunker: rebuild the world
                // square the hatch belongs to (the biome the world map holds there,
                // with the hatch stamped back on) and step out one tile south of it.
                // Set both by the Bunker origin and by descending the hatch itself
                // (ProceduralTerrainInteractions), so every trip out lands the same.
                const rec = $gameSystem._bunkerOrigin;
                const built = rec && $gameSystem.generateBunkerSurfaceMap && $gameSystem.generateBunkerSurfaceMap();
                if (built && rec.entranceX !== null && rec.entranceY !== null) {
                    $gameVariables.setValue(110, 1);
                    $gameVariables.setValue(111, 1);
                    $gamePlayer.reserveTransfer(procMapId, rec.entranceX, rec.entranceY + 1, 2, 2);
                } else {
                    logWarn('Bunker exit: surface map unavailable, falling back to the world map.');
                    $gameSystem.clearProcGenData();
                    $gamePlayer.reserveTransfer(worldMapId, rec ? rec.worldX : $gamePlayer.x, rec ? rec.worldY : $gamePlayer.y, 2, 0);
                }
            } else {
                // Structure entered off the procedural map: put that square back
                // exactly as it was, world coordinates and tiles included, and step
                // out onto the very entrance tile the party went in by.
                //
                // Wiping the procgen data here (what this used to do) left the return
                // transfer with no terrain, and performTransfer's fallback then
                // re-resolved the biome off $gameMap -- which at that moment is the
                // structure's own 64x64 map, not the world map -- so the party
                // surfaced onto a square built from tiles read out of the dungeon.
                if (sess.mapId === procMapId && restoreProcSurface(sess.surface)) {
                    $gamePlayer.reserveTransfer(procMapId, sess.x, sess.y, sess.dir || d, 2);
                } else {
                    // Sandbox Mode invoked from an authored map: a plain trip back.
                    $gameSystem.clearProcGenData();
                    $gamePlayer.reserveTransfer(sess.mapId, sess.x, sess.y, sess.dir || d, 0);
                }
            }
        };
    }

    // Does this crossing end somewhere other than another procedural square?
    // Only a WorkSystem/Destinations.json door does: the square being left, or
    // the one being entered, is a town's and hands the party to its authored
    // map. Asked BEFORE the crossing is scheduled, because it decides whether
    // the transition is panned or faded, and it asks exactly what the callback
    // below asks when it gets there, so the two can never disagree.
    function crossingLeavesProcMap(exitDirection) {
        const pg = procGen();
        if (!pg) return true;
        // A planet's landing grid is planet-local and its (gx, gy) can coincide
        // with a real Earth square, so none of Earth's markers may be consulted
        // for it. There is nothing hand-authored out there anyway.
        if (pg.alienGrid) return false;
        // Underground the named squares are generated like every other one (see
        // the callback), so no border down there is ever a door.
        if ((pg.biomeLayerStack || []).length) return false;
        const wx = $gameVariables.value(VAR_WORLD_X);
        const wy = $gameVariables.value(VAR_WORLD_Y);
        if (getNonProceduralDestination(wx, wy, exitDirection).destination) return true;
        const adj = $gameSystem.getAdjacentWorldCoordinates(exitDirection);
        return !!getNonProceduralDestination(adj.x, adj.y, exitDirection).destination;
    }

    // Show the crossing and schedule the seamless biome-to-biome edge transition
    // for the current procedural map. Shared by Player 1 (moveStraight, above) and
    // Player 2 (split-screen, via window.WorldMapReturnP2.handleP2Move) so that
    // EITHER player walking off the proc-map edge moves the whole party to the
    // adjacent biome.
    function scheduleProcEdgeTransition(exitDirection, playerX, playerY, d) {
        // Pull Player 2 to Player 1 once the new biome map loads so the split-screen
        // companion does not get stranded on the old edge.
        if (window.SplitScreenManager && window.SplitScreenManager.active) {
            window.SplitScreenManager.forceP2Teleport = true;
        }
        // A crossing from one procedural square to the next is SHOWN, whether
        // the squares are streamed or not: the screen pans from the one being
        // left to the one being entered, Zelda style, so take the picture of the
        // old one now, while it is still on screen, and hold the brightness
        // where it is. Streaming only decides which edges reach here at all -
        // with it on a matching neighbour is stitched on instead and there is no
        // crossing to show, so what is left is the tileset changing under the
        // party, which is exactly what the pan is for.
        //
        // A border that hands the party to a hand-authored map is not a pan: the
        // still would be of somewhere else entirely, so a town door keeps the
        // fade it always had.
        const panning = !crossingLeavesProcMap(exitDirection);
        if (panning) {
            beginEdgePan(exitDirection);
        } else {
            $gameScreen.startFadeOut(10);
        }

        const system         = $gameSystem;
        const storedExitDir  = exitDirection;
        const storedPlayerX  = playerX;
        const storedPlayerY  = playerY;

        system._procGenData._edgeTransitionScheduled = true;
        system._procGenData._edgeTransitionCallback  = () => {
            if (!system._procGenData._edgeTransitionScheduled) return;
            system._procGenData._edgeTransitionScheduled = false;

            console.log(`[WorldMapReturn-Edge] Fade complete, computing next biome`);

            const currentWorldX = $gameVariables.value(VAR_WORLD_X);
            const currentWorldY = $gameVariables.value(VAR_WORLD_Y);
            console.log(`[WorldMapReturn-Edge] World coords: (${currentWorldX},${currentWorldY}), exit dir: ${storedExitDir}`);

            // A square WorkSystem/Destinations.json names hands the party to its
            // hand-authored map - but only from the surface. Underground the
            // named squares are generated like every other one, so their borders
            // are ordinary borders and lead to the layer next door, never up
            // into a town (see surfaceDestinationFor for the way back out).
            const underground = !!(system._procGenData.biomeLayerStack || []).length;

            // Check non-procedural destination at current world coords
            const nonProcCheck = underground
                ? { exists: false, destination: null }
                : getNonProceduralDestination(currentWorldX, currentWorldY, storedExitDir);
            if (nonProcCheck.exists && nonProcCheck.destination) {
                const dest = nonProcCheck.destination;
                console.log(`[WorldMapReturn-Edge] Non-proc dest at current coords: map ${dest.mapId} (${dest.x},${dest.y})`);
                $gamePlayer.clearProcGenBorderArrows();
                system.clearProcGenData();
                $gamePlayer.reserveTransfer(dest.mapId, dest.x, dest.y, d, 0);
                return;
            }

            const adjacentCoords = system.getAdjacentWorldCoordinates(storedExitDir);
            console.log(`[WorldMapReturn-Edge] Adjacent world coords: (${adjacentCoords.x},${adjacentCoords.y})`);

            // Check non-procedural destination at adjacent world coords
            const nonProcCheckAdj = underground
                ? { exists: false, destination: null }
                : getNonProceduralDestination(adjacentCoords.x, adjacentCoords.y, storedExitDir);
            if (nonProcCheckAdj.exists && nonProcCheckAdj.destination) {
                const dest = nonProcCheckAdj.destination;
                console.log(`[WorldMapReturn-Edge] Non-proc dest at adjacent coords: map ${dest.mapId} (${dest.x},${dest.y})`);
                $gamePlayer.clearProcGenBorderArrows();
                system.clearProcGenData();
                $gamePlayer.reserveTransfer(dest.mapId, dest.x, dest.y, d, 0);
                return;
            }

            _resolveAdjacentBiomeAndTransfer(system, storedExitDir, storedPlayerX, storedPlayerY, d, adjacentCoords);
        };

        // The fading crossing waits for the screen to go black (Game_Screen.update
        // below). The panning one never goes black, so nothing would ever wake the
        // callback: run it on the next tick instead.
        if (panning) {
            system._procGenData._edgeTransitionDispatching = true;
            const cb = system._procGenData._edgeTransitionCallback;
            setTimeout(() => {
                try {
                    cb();
                } catch (e) {
                    console.error(`[WorldMapReturn-Edge] Panning crossing failed`, e);  // i18n-ignore  console diagnostic
                    cancelEdgePan();
                    $gameScreen.startFadeIn(10);
                } finally {
                    if (system._procGenData) {
                        system._procGenData._edgeTransitionScheduled   = false;
                        system._procGenData._edgeTransitionDispatching = false;
                    }
                }
            }, 0);
        }
    }

    // ============================================================================
    // PLAYER 2 (SPLIT-SCREEN) TRANSFER HANDLER
    // ============================================================================
    // The split-screen plugin (SplitScreenMultiplayer.js) drives Player 2 as a map
    // event independent of $gamePlayer, so the engine's transfer paths (which are
    // keyed on $gamePlayer's position) never fire for P2. This exposes the same
    // destination resolution P1 uses, keyed on P2's tile, and performs the transfer
    // on $gamePlayer (the whole party) so Player 1 follows along. P2 then snaps to
    // P1 via SplitScreenManager.forceP2Teleport when the destination map loads.
    window.WorldMapReturnP2 = {
        // Returns true if a transfer / edge transition was initiated (the caller
        // should then skip P2's normal step this frame).
        handleP2Move(ev, dir) {
            if (!ev || !dir || $gameMap.isEventRunning() || $gameMessage.isBusy()) return false;
            const mapId = $gameMap.mapId();

            // --- Procedural map: seamless biome-to-biome edge transition ---
            if (mapId === procMapId) {
                const mapWidth = $gameMap.width(), mapHeight = $gameMap.height();
                let wouldLeave = false, exitDirection = 0;
                switch (dir) {
                    case 2: if (ev.y + 1 >= mapHeight) { wouldLeave = true; exitDirection = 2; } break;
                    case 4: if (ev.x - 1 < 0)          { wouldLeave = true; exitDirection = 4; } break;
                    case 6: if (ev.x + 1 >= mapWidth)  { wouldLeave = true; exitDirection = 6; } break;
                    case 8: if (ev.y - 1 < 0)          { wouldLeave = true; exitDirection = 8; } break;
                }
                if (!wouldLeave) return false;
                // Already mid-transition: swallow further input so we don't reschedule.
                if ($gameSystem._procGenData && $gameSystem._procGenData._edgeTransitionScheduled) return true;
                // Same-tileset neighbour: grow the map under both players rather
                // than moving the party (see Game_Player.moveStraight above).
                // P2 then simply takes the step it was going to take.
                if (window.ProcStitch && window.ProcStitch.growTowards(exitDirection, ev.x, ev.y)) {
                    return false;
                }
                console.log(`[WorldMapReturn-Edge] P2 touched proc edge, starting fade out`);
                scheduleProcEdgeTransition(exitDirection, ev.x, ev.y, dir);
                return true;
            }

            // The world map uses Teleport events / the travel-decision window, not
            // border/Transfer transfers, so leave P2's world-map movement untouched.
            if (mapId === worldMapId) return false;

            const nx = $gameMap.roundXWithDirection(ev.x, dir);
            const ny = $gameMap.roundYWithDirection(ev.y, dir);

            // --- Transfer / VehicleExit named events (step-onto or facing) ---
            const isTransferEvent = e => {
                if (!e || e === ev) return false;
                const data = e.event && e.event();
                return data && data.name &&
                    (data.name.includes('Transfer') || data.name.includes('VehicleExit'));
            };
            const tEv = $gameMap.eventsXy(nx, ny).find(isTransferEvent) ||
                        $gameMap.eventsXy(ev.x, ev.y).find(isTransferEvent);
            if (tEv) {
                if (window.SplitScreenManager && window.SplitScreenManager.active) {
                    window.SplitScreenManager.forceP2Teleport = true;
                }
                $gameMessage._eventActivator = "p2";
                tEv.start();
                return true;
            }

            // --- Regular border tile (<Coords> / <Borders> destination) ---
            // (A Transfer event on the border tile was already handled above via tEv.)
            if ($gameMap.isBorderTile(nx, ny) && $gameMap.isBorderTilePassable(nx, ny)) {
                const directions    = $gameMap.getBorderDirection(nx, ny);
                const hasBorderDest = $gameMap._borderDestination || $gameMap._coordsDest;
                if (hasBorderDest && $gameMap.isBorderDirectionAllowed(directions)) {
                    if (window.SplitScreenManager && window.SplitScreenManager.active) {
                        window.SplitScreenManager.forceP2Teleport = true;
                    }
                    // The same crossing Player 1 makes, resolved in the one place
                    // that knows what a border means: P2's own step direction is
                    // handed over because $gamePlayer is facing wherever P1 left
                    // them, which is not the side being crossed.
                    if ($gamePlayer.performBorderReturn(dir)) return true;
                }
            }

            return false;
        }
    };

    // Resolve the adjacent square, build it, and transfer onto it. This is the OLD
    // crossing, and it is still exactly what happens at any edge a stitched window
    // could not extend past: the far side of a tileset change (a road, a city, the
    // sea floor), a square WorkSystem/Destinations.json names, the wall of a
    // structure. Inside a window the seams never reach here at all.
    //
    // What used to live in this function was a second, slightly different copy of
    // the resolution generateProceduralMap does. The two disagreed - this one
    // never renamed Ice to Tundra, never made the special-biome roll, and forced a
    // road through the intersection detector before the generator could refine it
    // - so a square could come out one way when walked into and another when
    // travelled to. Both now ask ProcGenSquare, which is also what a stitched
    // neighbour is built from, so all three agree by construction.
    function _resolveAdjacentBiomeAndTransfer(system, storedExitDir, storedPlayerX, storedPlayerY, _d, adjacentCoords) {
        const api = window.ProcGenSquare;
        const pg  = system._procGenData;

        // The planet's bounded landing grid (see GalaxySim_Core.js
        // enterPlanetSurface) wraps both axes toroidally instead of walking an
        // unbounded plane of the same biome forever.
        const alienGrid = pg.alienGrid;
        if (alienGrid) {
            adjacentCoords.x = ((adjacentCoords.x % alienGrid.w) + alienGrid.w) % alienGrid.w;
            adjacentCoords.y = ((adjacentCoords.y % alienGrid.h) + alienGrid.h) % alienGrid.h;
            window.ProcStitch.adoptAlienCell(adjacentCoords.x, adjacentCoords.y);
        }

        const bail = () => {
            const returnCoords = system.getReturnCoordinates(storedExitDir);
            $gamePlayer.clearProcGenBorderArrows();
            system.clearProcGenData();
            $gamePlayer.reserveTransfer(worldMapId, returnCoords.x, returnCoords.y, storedExitDir, 0);
        };

        if (!api) { bail(); return; }

        // The square the party is leaving may be a forced or structure biome the
        // resolver knows nothing about (startForcedBiome, a tower floor). Its
        // NEIGHBOUR is an ordinary world square either way, so the stale name has
        // to be out of the way before the window is planned around it.
        pg.currentBiome = null;

        const depth = (pg.biomeLayerStack || []).length;
        const built = api.build(adjacentCoords.x, adjacentCoords.y, { depth });
        if (!built) {
            console.error(`[WorldMapReturn-Edge] Could not build (${adjacentCoords.x},${adjacentCoords.y})`);
            bail();
            return;
        }

        const r = built.resolved;
        console.log(`[WorldMapReturn-Edge] Resolved biome: "${r.biomeName}" at (${adjacentCoords.x},${adjacentCoords.y})`);

        pg.currentBiome            = r.biomeName;
        pg.currentBiomeTileset     = r.tilesetId;
        pg.currentRoadDirection    = r.roadDirection;
        pg.currentUnderBiome       = r.underBiome;
        // Must be re-stamped every crossing, bridge or not: the generators read it
        // off _procGenData, so a stale marker turned the square after a river
        // crossing into a second bridge.
        pg.currentBridgeDirection  = r.bridgeDirection;
        pg.displayAsBeach          = r.displayAsBeach;
        pg.displayAsIsland         = r.displayAsIsland;
        pg.structureHints          = r.structureHints || null;
        pg.biomeDayTemperature     = r.dayTemperature;
        pg.biomeNightTemperature   = r.nightTemperature;
        pg.originX                 = adjacentCoords.x;
        pg.originY                 = adjacentCoords.y;
        pg.generatedMapData        = built.mapData;
        $gameVariables.setValue(VAR_WORLD_X, adjacentCoords.x);
        $gameVariables.setValue(VAR_WORLD_Y, adjacentCoords.y);

        updateBiomeAudio();

        // Square-local, as every spawn point on map 636 is: if the arrival lands
        // inside a stitched window, the transfer hook puts it on the map.
        const edgePos = system.getEdgeCoordinateForDirection(storedExitDir, storedPlayerX, storedPlayerY);
        let spawnX = edgePos.x, spawnY = edgePos.y;
        // The alien elevation-banded terrestrial fill and crater fields are
        // continuous, so nothing guarantees the exact edge tile a crossing lands on
        // is walkable (open water, a crater rim) the way Earth's own generators
        // each promise their borders are. Search outward for the nearest one that
        // actually is.
        const AT = window.ProcGenAlienTerrain;
        if (r.alien && AT && AT.findPassableLandingTile) {
            const spot = AT.findPassableLandingTile(
                built.mapData, r.tilesetId, PROC_MAP_WIDTH, PROC_MAP_HEIGHT, edgePos.x, edgePos.y
            );
            spawnX = spot.x; spawnY = spot.y;
        }
        console.log(`[WorldMapReturn-Edge] Transferring to square-local (${spawnX},${spawnY})`);
        $gamePlayer.reserveTransfer(procMapId, spawnX, spawnY, storedExitDir, 2);
    }

    // Every crossing above hands reserveTransfer FADE TYPE 2, "no fade", and it
    // is not an optimisation: the screen is already black, held there by
    // $gameScreen.startFadeOut, and the engine's own transfer fade is a SECOND,
    // independent one drawn by Scene_Map. Left on, Scene_Map.stop kept the old
    // scene alive for the 24 frames of its fade-out, and the fade back in
    // (scheduled off the wall clock, a ninth of a second later) landed in the
    // middle of them: the square being left brightened back into view under a
    // half-opaque black sheet, went dark again, and only then did the new one
    // fade in. One crossing, two fades - what walking down a flight of stairs
    // looked like. With the scene fade off the old scene stops on the spot and
    // the brightness ramp is the whole transition.
    //
    // Trigger edge transition callback once the screen is fully black
    const _Game_Screen_update = Game_Screen.prototype.update;
    Game_Screen.prototype.update = function() {
        _Game_Screen_update.call(this);
        if ($gameSystem._procGenData &&
            $gameSystem._procGenData._edgeTransitionScheduled &&
            $gameSystem._procGenData._edgeTransitionCallback &&
            !$gameSystem._procGenData._edgeTransitionDispatching &&
            this._brightness === 0) {
            // Mark as dispatching so the per-frame update does not queue a second
            // timeout while this one is pending. Wrap in try/catch so a generator
            // exception can never leave the screen faded out with no fade-in.
            $gameSystem._procGenData._edgeTransitionDispatching = true;
            const cb = $gameSystem._procGenData._edgeTransitionCallback;
            setTimeout(() => {
                try {
                    cb();
                } catch (e) {
                    console.error(`[Game_Screen.update] Edge transition failed, fading back in`, e);
                    $gameScreen.startFadeIn(10);
                } finally {
                    if ($gameSystem._procGenData) {
                        $gameSystem._procGenData._edgeTransitionScheduled  = false;
                        $gameSystem._procGenData._edgeTransitionDispatching = false;
                    }
                }
            }, 13);
        }
    };

    // ============================================================================
    // THE PANNING BORDER CROSSING
    // ============================================================================
    // A border that is reached at all is a real crossing: with streaming on a
    // matching neighbour is a seam inside one big stitched map and never comes
    // here, so what is left is the tileset changing under the party, and with
    // streaming off only the party's own square is ever loaded, so every border
    // is one. Either way it is drawn the way the first Zelda drew it: the
    // picture of the square being left slides off one side while the square
    // being entered slides in behind it, and control comes back when it stops.
    //
    // The old square is a still taken the frame the border is touched
    // (SceneManager.snap). The new one is the live scene: the pan is the whole
    // spriteset pushed one screen off centre and walked back to zero, with the
    // still riding one screen ahead of it. Both sprites live on the SCENE, not
    // inside the spriteset, so the still is never scrolled or tinted by the map
    // it is covering.
    const EDGE_PAN_FRAMES = 24;

    // Screen offset, in pixels, the entering square starts at for each exit.
    function edgePanOffset(exitDirection) {
        const w = Graphics.width, h = Graphics.height;
        switch (exitDirection) {
            case 2: return { x: 0,  y: h };   // walked south: the new map is below
            case 8: return { x: 0,  y: -h };
            case 4: return { x: -w, y: 0 };
            case 6: return { x: w,  y: 0 };
        }
        return { x: 0, y: 0 };
    }

    function beginEdgePan(exitDirection) {
        cancelEdgePan();
        let snap = null;
        try {
            snap = SceneManager.snap();
        } catch (e) {
            console.warn(`[WorldMapReturn-Edge] Screen capture failed, crossing without a pan`, e);  // i18n-ignore  console diagnostic
            return;
        }
        $gameTemp._edgePan = {
            bitmap: snap,
            offset: edgePanOffset(exitDirection),
            frames: 0,
            started: false
        };
    }

    function cancelEdgePan() {
        const pan = $gameTemp && $gameTemp._edgePan;
        if (pan && pan.bitmap && pan.bitmap.destroy) pan.bitmap.destroy();
        if ($gameTemp) $gameTemp._edgePan = null;
    }

    // A pan is running: the party is a passenger until it lands.
    function edgePanRunning() {
        const pan = $gameTemp && $gameTemp._edgePan;
        return !!(pan && pan.started);
    }

    const _EdgePan_Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _EdgePan_Scene_Map_start.call(this);
        const pan = $gameTemp && $gameTemp._edgePan;
        if (!pan || pan.started || $gameMap.mapId() !== procMapId) {
            // The crossing did not end on a procedural square after all (a town,
            // a dungeon door): the still would be a lie, so drop it.
            if (pan && !pan.started) cancelEdgePan();
            return;
        }
        pan.started = true;
        pan.sprite = new Sprite(pan.bitmap);
        this.addChild(pan.sprite);
        this._edgePanSprite = pan.sprite;
        this.updateEdgePan(0);
    };

    // progress 0 = the old square fills the screen, 1 = the new one does.
    Scene_Map.prototype.updateEdgePan = function(progress) {
        const pan = $gameTemp && $gameTemp._edgePan;
        if (!pan || !this._spriteset) return;
        const e = 1 - Math.pow(1 - progress, 3);   // ease out, so it settles
        const ox = Math.round(pan.offset.x * (1 - e));
        const oy = Math.round(pan.offset.y * (1 - e));
        this._spriteset.x = ox;
        this._spriteset.y = oy;
        if (pan.sprite) {
            pan.sprite.x = ox - pan.offset.x;
            pan.sprite.y = oy - pan.offset.y;
        }
    };

    const _EdgePan_Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _EdgePan_Scene_Map_update.call(this);
        const pan = $gameTemp && $gameTemp._edgePan;
        if (!pan || !pan.started) return;
        pan.frames++;
        const progress = Math.min(pan.frames / EDGE_PAN_FRAMES, 1);
        this.updateEdgePan(progress);
        if (progress >= 1) {
            if (pan.sprite && pan.sprite.parent) pan.sprite.parent.removeChild(pan.sprite);
            if (this._spriteset) { this._spriteset.x = 0; this._spriteset.y = 0; }
            this._edgePanSprite = null;
            cancelEdgePan();
        }
    };

    // Leaving the scene mid-pan (a battle, a menu, a second transfer) must not
    // leave the still hanging over the next one.
    const _EdgePan_Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        if (this._edgePanSprite) {
            if (this._edgePanSprite.parent) this._edgePanSprite.parent.removeChild(this._edgePanSprite);
            this._edgePanSprite = null;
            if (this._spriteset) { this._spriteset.x = 0; this._spriteset.y = 0; }
            cancelEdgePan();
        }
        _EdgePan_Scene_Map_terminate.call(this);
    };

    // No walking, and no map events, while the screen is travelling.
    const _EdgePan_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if (edgePanRunning()) return false;
        return _EdgePan_Player_canMove.call(this);
    };

    const _EdgePan_Scene_Map_isBusy = Scene_Map.prototype.isBusy;
    Scene_Map.prototype.isBusy = function() {
        return edgePanRunning() || _EdgePan_Scene_Map_isBusy.call(this);
    };

    // ============================================================================
    // PLUGIN COMMANDS (WorldMapReturn)
    // ============================================================================

    PluginManager.registerCommand(PLUGIN_NAME, 'ReturnToWorldMap', () => {
        const saved = playerWorldCoords();
        if (saved.x === 0 && saved.y === 0) return;
        $gameVariables.setValue(VAR_DEST_MAP, worldMapId);
        $gamePlayer.reserveTransfer(worldMapId, saved.x, saved.y, 0, 0);
    });

    PluginManager.registerCommand(PLUGIN_NAME, 'SaveWorldMapPosition', function() {
        if ($gameMap.mapId() !== worldMapId) return;
        let posX = $gamePlayer.x, posY = $gamePlayer.y;
        if (this._eventId !== undefined) {
            const event = $gameMap.event(this._eventId);
            if (event) { posX = event.x; posY = event.y; }
        }
        $gameVariables.setValue(VAR_WORLD_X, posX);
        $gameVariables.setValue(VAR_WORLD_Y, posY);
    });

    PluginManager.registerCommand(PLUGIN_NAME, 'SetWorldMapCoordinates', args => {
        const x = parseInt(args.x), y = parseInt(args.y);
        if (isNaN(x) || isNaN(y) || x < 0 || y < 0) return;
        $gameVariables.setValue(VAR_WORLD_X, x);
        $gameVariables.setValue(VAR_WORLD_Y, y);
    });

    // ============================================================================
    // PLUGIN COMMANDS (goDown / goUp / startProcGen / stopProcGen / switchLayer)
    // ============================================================================

    PluginManager.registerCommand(PLUGIN_PMT, 'startProcGen', () => {
        if (!$gameSystem.generateProceduralMap()) return;
        const playerDirection = $gamePlayer.direction();
        let startX = Math.floor(PROC_MAP_WIDTH  / 2);
        let startY = Math.floor(PROC_MAP_HEIGHT / 2);
        switch (playerDirection) {
            case 2: startY = 1;                  break;
            case 4: startX = PROC_MAP_WIDTH  - 2; break;
            case 6: startX = 1;                  break;
            case 8: startY = PROC_MAP_HEIGHT - 2; break;
        }
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        $gamePlayer.reserveTransfer(procMapId, startX, startY, playerDirection, 0);
    });

    PluginManager.registerCommand(PLUGIN_PMT, 'stopProcGen', () => {
        const system       = $gameSystem;
        const returnCoords = system.getReturnCoordinates($gamePlayer.direction());
        system.clearProcGenData();
        $gamePlayer.reserveTransfer(worldMapId, returnCoords.x, returnCoords.y, 2, 0);
    });

    // The Shovel is consumed by using it, so it must not be usable where the dig
    // below refuses: greyed out in the item menu on every map that is neither the
    // world map (dig into the square underfoot) nor the procedural map (dig into
    // the square the party is standing in), and while already underground, where
    // there is no second layer to reach.
    const _Game_BattlerBase_meetsItemConditions = Game_BattlerBase.prototype.meetsItemConditions;
    Game_BattlerBase.prototype.meetsItemConditions = function(item) {
        if (item && item.id === SHOVEL_ITEM_ID && DataManager.isItem(item) && $gameMap) {
            const mapId = $gameMap.mapId();
            if (mapId !== worldMapId && mapId !== procMapId) return false;
            const pg = $gameSystem && $gameSystem._procGenData;
            if (pg && pg.biomeLayerStack && pg.biomeLayerStack.length > 0) return false;
        }
        return _Game_BattlerBase_meetsItemConditions.call(this, item);
    };

    PluginManager.registerCommand(PLUGIN_PMT, 'goDown', () => {
        const system      = $gameSystem;
        const procGenData = system._procGenData;
        if (!procGenData) { logWarn('GoDown: no procedural map active.'); return; }

        // Digging needs a world square to dig into. The travel menu only ever
        // offers "Go underground" on the procedural map (Window_WorldMapChoice),
        // but the Shovel is a menu item usable on any map and its common event
        // calls straight in here.
        //
        // From the world map the square under the party's feet simply has not
        // been generated yet: build its surface first (which resolves the biome
        // off the world-map tile and syncs origin, seed and vars 43/44), then
        // descend into it, so digging from the overview lands in the same cave
        // as walking into the square and digging there.
        //
        // Anywhere else -- a house, a city, a ship -- there is no square below,
        // and descending used to push a layer onto whatever stale procgen data
        // was left over and drop the party into a cave under a square they were
        // not standing on, with the stack raised for the rest of the game so
        // every square after it generated underground.
        if ($gameMap.mapId() === worldMapId) {
            if (!system.generateProceduralMap()) {
                $gameMessage.add(T('WorldMapReturn.cannotDigHere'));
                return;
            }
            // The square was just resolved off the world-map tile, so it is the
            // surface whatever depth the data was still carrying.
            surfaceProcGenLayers(procGenData);
            // No door was come down through, so "Go to the surface" surfaces in
            // the middle of the square -- where the descent puts the party down --
            // instead of at whatever entrance an older dungeon left behind.
            procGenData.goDownEventX = Math.floor(PROC_MAP_WIDTH  / 2);
            procGenData.goDownEventY = Math.floor(PROC_MAP_HEIGHT / 2);
        } else if ($gameMap.mapId() !== procMapId) {
            $gameMessage.add(T('WorldMapReturn.cannotDigHere'));
            return;
        }

        if (procGenData && procGenData.currentBiome === 'Ocean') {  // i18n-ignore  biome id
            const item = $dataItems[DIVING_SUIT_ITEM_ID];
            if (!$gameParty.hasItem(item)) { $gameMessage.add(T('WorldMapReturn.needDivingSuit')); return; }
        }
        if (procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0) {
            // A raised stack under a surface-only biome (Ocean, Fields, ...) is
            // stale data, not a party underground: an ascent that never popped,
            // an older save. Taken at face value it refuses every descent from
            // that square for the rest of the game -- diving off an Ocean square
            // stops working with nothing but a console line to say why. The
            // party is demonstrably standing on the surface, so believe the
            // biome and flatten the stack instead of refusing.
            if (isSurfaceOnlyBiome(procGenData.currentBiome)) {
                logWarn(`GoDown: stale layer stack under surface biome "${procGenData.currentBiome}" -- surfacing it.`);
                surfaceProcGenLayers(procGenData);
            } else {
                logWarn('GoDown: Already underground.'); return;
            }
        }
        if (!procGenData.currentBiome) procGenData.currentBiome = 'Cave';

        const currentBiome = getBiomeByName(procGenData.currentBiome);
        if (!currentBiome || !currentBiome.lowerLayer) {
            // Said out loud, not just logged: a Shovel used on solid rock (or on
            // any biome with nothing under it) has to answer for itself.
            logWarn(`GoDown: Biome "${procGenData.currentBiome}" has no lower layer`);
            $gameMessage.add(T('WorldMapReturn.cannotDigHere'));
            return;
        }

        // Keep the surface square before the cave overwrites it, so climbing back
        // out puts back the very tiles and prefabs the party left behind.
        stashSurfaceSnapshot(procGenData);

        if (window.ProcStitch) window.ProcStitch.close();

        procGenData.biomeLayerStack.push(procGenData.currentBiome);
        let lowerBiomeName = currentBiome.lowerLayer;
        if (procGenData.displayAsBeach) lowerBiomeName = 'CaveFlooded';

        const lowerBiome = getBiomeByName(lowerBiomeName);
        if (!lowerBiome) {
            logWarn(`GoDown: Lower biome "${lowerBiomeName}" not found`);
            procGenData.biomeLayerStack.pop(); return;
        }

        procGenData.currentBiome           = lowerBiomeName;
        procGenData.currentBiomeTileset    = lowerBiome.tilesetId;
        procGenData.biomeDayTemperature    = lowerBiome.dayTemperature   || 20;
        procGenData.biomeNightTemperature  = lowerBiome.nightTemperature || 10;
        procGenData.lastLoadedProcMapX     = null;
        procGenData.lastLoadedProcMapY     = null;
        procGenData._stitchReanchor        = true;

        const originX = procGenData.originX || $gameVariables.value(VAR_WORLD_X) || 0;
        const originY = procGenData.originY || $gameVariables.value(VAR_WORLD_Y) || 0;
        procGenData.originX = originX;
        procGenData.originY = originY;

        const seed = procMapSeed(originX, originY, procGenData.biomeLayerStack.length);
        const adjacentBiomes = { north: lowerBiomeName, south: lowerBiomeName, east: lowerBiomeName, west: lowerBiomeName };
        procGenData.displayAsBeach = false;

        const worldCoords = { x: originX, y: originY };
        procGenData.generatedMapData = generateProceduralTerrain(lowerBiome, seed, null, adjacentBiomes, null, worldCoords, procGenData.biomeCoordinateCache);

        $gameScreen.clearWeather();
        $gameScreen.startFadeOut(10);
        // Wait for the screen to go fully black before swapping the tileset:
        // reserveTransfer used to fire the instant the fade started, so the
        // cave popped in while the surface was still visible underneath it.
        procGenData._edgeTransitionScheduled = true;
        procGenData._edgeTransitionCallback = () => {
            if (!procGenData._edgeTransitionScheduled) return;
            procGenData._edgeTransitionScheduled = false;

            if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;
            // The two "the procedural map is live" flags startProcGen raises. Already
            // set when the descent starts on map 636, but a dig straight off the world
            // map has to raise them itself: clearProcGenData zeroed them on the way out.
            $gameVariables.setValue(110, 1);
            $gameVariables.setValue(111, 1);
            $gamePlayer.reserveTransfer(procMapId, Math.floor(PROC_MAP_WIDTH / 2), Math.floor(PROC_MAP_HEIGHT / 2), $gamePlayer.direction(), 2);

            setTimeout(() => updateEventVisibility(), 100);
            setTimeout(() => refreshEnemiesForBiome(), 100);
            setTimeout(() => updateBiomeAudio(), 100);
            setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
        };
    });

    // ── DoorDungeon feature descent ─────────────────────────────────────────
    // Resolve the dungeon-type biome a DoorDungeon leads to from the surface
    // biome's lowerLayer:
    //   - a Cave-family lower layer (Cave, CaveIce, CaveFlooded, ...) or none
    //     -> "Dungeon" (a DoorDungeon always opens onto a built dungeon, never a
    //        natural cave)
    //   - "Crypt"  -> Crypt,  "Sewer" -> Sewer,  and so on for any other
    //     dungeon-flavoured lower layer, which is generated as-is.
    function resolveDungeonBiomeName(surfaceBiome) {
        let target = (surfaceBiome && surfaceBiome.lowerLayer) || 'Dungeon';
        if (/cave/i.test(target)) target = 'Dungeon';
        return target;
    }

    // Enter a procedural, coordinate-seeded dungeon through a DoorDungeon tile on
    // the procedural map. Behaves like goDown (pushes a layer so "Go to the
    // surface" returns), but forces the resolved dungeon-type biome instead of
    // the biome's natural cave lower layer, and returns the player to the door.
    PluginManager.registerCommand(PLUGIN_PMT, 'enterDungeonDoor', () => {
        const system      = $gameSystem;
        const procGenData = system._procGenData;
        if (!procGenData) { logWarn('DoorDungeon: no procedural map active.'); return; }

        if (procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0) {
            logWarn('DoorDungeon: Already underground.'); return;
        }
        if (!procGenData.currentBiome) procGenData.currentBiome = 'Fields';

        const surfaceBiome  = getBiomeByName(procGenData.currentBiome);
        const lowerBiomeName = resolveDungeonBiomeName(surfaceBiome);
        const lowerBiome     = getBiomeByName(lowerBiomeName);
        if (!lowerBiome) {
            logWarn(`DoorDungeon: Dungeon biome "${lowerBiomeName}" not found`); return;
        }

        // Keep the surface square before the dungeon overwrites it. A dungeon door
        // is very often a tile of a prefab (the mountain, the ruin, the mausoleum
        // it was cut into), and re-rolling the surface on the way out is what used
        // to take the whole prefab -- door included -- away with it.
        stashSurfaceSnapshot(procGenData);

        if (window.ProcStitch) window.ProcStitch.close();

        // Return the player to the door on "Go to the surface".
        procGenData.goDownEventX = $gamePlayer.x;
        procGenData.goDownEventY = $gamePlayer.y;

        procGenData.biomeLayerStack.push(procGenData.currentBiome);
        procGenData.currentBiome          = lowerBiomeName;
        procGenData.currentBiomeTileset   = lowerBiome.tilesetId;
        procGenData.biomeDayTemperature   = lowerBiome.dayTemperature   || 20;
        procGenData.biomeNightTemperature = lowerBiome.nightTemperature || 10;
        procGenData.lastLoadedProcMapX    = null;
        procGenData.lastLoadedProcMapY    = null;
        procGenData._stitchReanchor       = true;

        // Seed from the world coordinates AND the door tile, so different doors on
        // the same map open onto different, but deterministic, dungeons.
        const seed = procMapSeed(
            procGenData.originX, procGenData.originY,
            procGenData.biomeLayerStack.length,
            (procGenData.goDownEventX * 131) + (procGenData.goDownEventY * 977)
        );
        const adjacentBiomes = { north: lowerBiomeName, south: lowerBiomeName, east: lowerBiomeName, west: lowerBiomeName };
        procGenData.displayAsBeach = false;

        const worldCoords = { x: procGenData.originX, y: procGenData.originY };
        procGenData.generatedMapData = generateProceduralTerrain(lowerBiome, seed, null, adjacentBiomes, null, worldCoords, procGenData.biomeCoordinateCache);

        // Mark this as a door-entered dungeon so stepping on the map border pops
        // back to the surface at the tile just south of the DoorDungeon (goUp,
        // which returns to goDownEventX/Y set above), instead of biome-edge travel.
        // The door tile salts the terrain records as well as the seed, so two
        // doors on one square keep their own dismantled features apart.
        procGenData._dungeonSession = {
            type: 'door',
            salt: ((procGenData.goDownEventX * 131) + (procGenData.goDownEventY * 977)) | 0,
        };

        // Spawn the player next to the entrance carved at the border.
        const gen = procGenData.generatedMapData;
        const sx = (gen && gen.spawnX != null) ? gen.spawnX : Math.floor(PROC_MAP_WIDTH / 2);
        const sy = (gen && gen.spawnY != null) ? gen.spawnY : Math.floor(PROC_MAP_HEIGHT / 2);
        const sdir = (gen && gen.spawnDir) ? gen.spawnDir : $gamePlayer.direction();

        $gameScreen.clearWeather();
        $gameScreen.startFadeOut(10);
        // Wait for the screen to go fully black before swapping the tileset:
        // reserveTransfer used to fire the instant the fade started, so the
        // dungeon popped in while the surface was still visible underneath it.
        procGenData._edgeTransitionScheduled = true;
        procGenData._edgeTransitionCallback = () => {
            if (!procGenData._edgeTransitionScheduled) return;
            procGenData._edgeTransitionScheduled = false;

            if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;
            $gamePlayer.reserveTransfer(procMapId, sx, sy, sdir, 2);

            setTimeout(() => updateEventVisibility(), 100);
            setTimeout(() => refreshEnemiesForBiome(), 100);
            setTimeout(() => updateBiomeAudio(), 100);
            setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
        };
    });

    // Generate an arbitrary biome as a fresh top-level procedural map and teleport
    // into it immediately (used by Sandbox Mode to jump straight into a Dungeon,
    // Crypt, Sewer, ... regardless of the player's world position).
    PluginManager.registerCommand(PLUGIN_PMT, 'startForcedBiome', args => {
        const biomeName = (args && args.Biome) ? String(args.Biome).trim() : 'Dungeon';
        const biome     = getBiomeByName(biomeName);
        if (!biome) { logWarn(`startForcedBiome: biome "${biomeName}" not found`); return; }

        // Remember where the player was so a dungeon generated from Sandbox Mode can
        // return them there when they step on the dungeon border.
        // Square-local, not map-local: on the procedural map the party may be
        // standing in any cell of a stitched window, and the window it comes back
        // to is not guaranteed to have the same shape. Every reserveTransfer onto
        // map 636 speaks square-local coordinates and the transfer hook at the
        // bottom of this file puts them back on the map (see THE STITCHED WINDOW).
        const returnLocal = (window.ProcStitch && $gameMap.mapId() === procMapId)
            ? window.ProcStitch.local($gamePlayer.x, $gamePlayer.y)
            : { x: $gamePlayer.x, y: $gamePlayer.y };
        const returnFrom = { mapId: $gameMap.mapId(), x: returnLocal.x, y: returnLocal.y, dir: $gamePlayer.direction() };

        // Entered off the procedural map (a Grate, a flight of stairs, a cave
        // mouth, a patron's hatch): snapshot the square itself, tiles included,
        // BEFORE anything below overwrites the live description with the
        // structure's. The border of the generated map hands it straight back.
        const surface = $gameMap.mapId() === procMapId
            ? snapshotProcSurface({ terrain: true })
            : null;

        // The caller's salt tells two entrances of the same kind on the same world
        // square apart (two grates open onto two different sewers). It also keys
        // the structure's terrain records, so nothing dismantled in one leaks into
        // the other.
        const entranceSalt = (args && args.Salt != null) ? (Number(args.Salt) | 0) : 0;

        const system = $gameSystem;
        if (!system._procGenData) {
            system._procGenData = {
                originX: 0, originY: 0, currentBiome: null, currentRoadDirection: null,
                currentBiomeTileset: null, generatedMapData: null, biomeToTileset: {},
                mapPreloaded: false, seed: 12345, biomeCoordinateCache: {},
                lastLoadedProcMapX: null, lastLoadedProcMapY: null, displayAsBeach: false,
                biomeLayerStack: [],
            };
        }
        const pg = system._procGenData;

        // Establish a valid world origin + seed. On the world map,
        // generateProceduralMap syncs vars 43/44, seed and the biome cache;
        // elsewhere fall back to the stored / variable coordinates.
        if ($gameMap && $gameMap.mapId() === worldMapId && system.generateProceduralMap) {
            system.generateProceduralMap();
        }
        if (!pg.originX && !pg.originY) {
            pg.originX = $gameVariables.value(VAR_WORLD_X) || $gamePlayer.x || 0;
            pg.originY = $gameVariables.value(VAR_WORLD_Y) || $gamePlayer.y || 0;
        }
        if (!pg.seed) pg.seed = 12345;

        // Force the chosen biome as a fresh, non-underground procedural map.
        if (window.ProcStitch) window.ProcStitch.close();
        pg.biomeLayerStack       = [];
        pg.currentBiome          = biomeName;
        pg.currentRoadDirection  = null;
        pg.currentBiomeTileset   = biome.tilesetId;
        pg.biomeDayTemperature   = biome.dayTemperature   || 20;
        pg.biomeNightTemperature = biome.nightTemperature || 10;
        pg.displayAsBeach        = false;
        pg.displayAsIsland       = false;
        pg.lastLoadedProcMapX    = null;
        pg.lastLoadedProcMapY    = null;
        pg._stitchReanchor       = true;

        // Salted with the forced biome's name so a sandbox Dungeon and a sandbox
        // Crypt at the same world square are not the same layout, then with the
        // caller's entrance salt so two doorways of the same kind are not either.
        let biomeSalt = 0;
        for (let i = 0; i < biomeName.length; i++) biomeSalt = (Math.imul(biomeSalt, 31) + biomeName.charCodeAt(i)) | 0;
        if (entranceSalt) biomeSalt = (Math.imul(biomeSalt, 31) + entranceSalt) | 0;
        const seed = procMapSeed(pg.originX, pg.originY, 0, biomeSalt);
        const adjacentBiomes = { north: biomeName, south: biomeName, east: biomeName, west: biomeName };
        const worldCoords = { x: pg.originX, y: pg.originY };
        // DungeonFloorSystem's lower tower has no way off a floor but its own
        // staircase events: read once and cleared here so the flag never
        // survives into an unrelated forced biome.
        if (pg._sealEntrance) {
            worldCoords.sealEntrance = true;
            pg._sealEntrance = false;
        }
        pg.generatedMapData = generateProceduralTerrain(biome, seed, null, adjacentBiomes, null, worldCoords, pg.biomeCoordinateCache);

        // For a dungeon-family biome (incl. the LootCellar/TempleInside/CaveDen/
        // PatronVault structure biomes entered through terrain features), spawn at
        // the border entrance and make the map border return the player to where
        // the structure was entered from.
        const gen = pg.generatedMapData;
        // Is this one of the enclosed structures? The catalogue in
        // ProceduralMapStructureGenerator is the only list, so a structure
        // added there needs no edit here; the regex this replaced was one of
        // six such lists scattered over the codebase and they had drifted.
        const D = window.ProcGenDungeon;
        const isDungeonType = (D && typeof D.isStructure === 'function')
            ? D.isStructure(biomeName)
            : /dungeon|crypt|sewer|lootcellar|templeinside|caveden|patronvault/i.test(biomeName);
        const sx = (isDungeonType && gen && gen.spawnX != null) ? gen.spawnX : Math.floor(PROC_MAP_WIDTH / 2);
        const sy = (isDungeonType && gen && gen.spawnY != null) ? gen.spawnY : Math.floor(PROC_MAP_HEIGHT / 2);
        const sdir = (isDungeonType && gen && gen.spawnDir) ? gen.spawnDir : $gamePlayer.direction();
        pg._dungeonSession = isDungeonType
            ? { type: 'sandbox', salt: entranceSalt, surface, ...returnFrom }
            : null;

        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        $gameScreen.clearWeather();
        $gameScreen.startFadeOut(10);
        // Wait for the screen to go fully black before swapping the tileset:
        // reserveTransfer used to fire the instant the fade started, so the
        // structure popped in while the surface was still visible underneath it.
        pg._edgeTransitionScheduled = true;
        pg._edgeTransitionCallback = () => {
            if (!pg._edgeTransitionScheduled) return;
            pg._edgeTransitionScheduled = false;

            if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;
            $gamePlayer.reserveTransfer(procMapId, sx, sy, sdir, 2);

            setTimeout(() => updateEventVisibility(), 100);
            setTimeout(() => refreshEnemiesForBiome(), 100);
            setTimeout(() => updateBiomeAudio(), 100);
            setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
        };
    });

    /**
     * The hand-authored map standing on a world square, for a party climbing back
     * out from under it. Underground, a square WorkSystem/Destinations.json names
     * is generated like any other (see canStitch): a town's cellars are cellars,
     * its borders lead to the cellars next door, and nothing about the descent
     * knows or cares that a town is up there. Only the last step up does - and it
     * is the town's own door the party comes out of, not a procedural field with
     * the town somewhere else entirely.
     *
     * @returns {?{mapId:number,x:number,y:number}} where to surface, or null when
     *          the square carries nothing but generated ground.
     */
    function surfaceDestinationFor(worldX, worldY) {
        if (typeof worldX !== 'number' || typeof worldY !== 'number') return null;
        const above = getNonProceduralDestination(worldX, worldY, 0);
        if (!above.exists || !above.destination) return null;
        const dest = above.destination;
        return (dest.mapId > 0) ? dest : null;
    }

    /**
     * Fade out and hand the party to the authored map above them. Shares the
     * "wait for the screen to be properly black" machinery every other crossing
     * on this map uses, so surfacing under a town looks like surfacing anywhere.
     */
    function surfaceToDestination(procGenData, dest) {
        const dir = $gamePlayer.direction();
        $gameScreen.clearWeather();
        $gameScreen.startFadeOut(10);
        procGenData._edgeTransitionScheduled = true;
        procGenData._edgeTransitionCallback = () => {
            if (!procGenData._edgeTransitionScheduled) return;
            procGenData._edgeTransitionScheduled = false;
            if (window.SplitScreenManager && window.SplitScreenManager.active) {
                window.SplitScreenManager.forceP2Teleport = true;
            }
            $gamePlayer.clearProcGenBorderArrows();
            $gameSystem.clearProcGenData();
            $gamePlayer.reserveTransfer(dest.mapId, dest.x, dest.y, dir, 0);
            setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
        };
    }

    PluginManager.registerCommand(PLUGIN_PMT, 'goUp', () => {
        const system      = $gameSystem;
        const procGenData = system._procGenData;
        if (!procGenData) { logWarn('GoUp: no procedural map active.'); return; }

        if (!procGenData.biomeLayerStack || procGenData.biomeLayerStack.length === 0) {
            logWarn('GoUp: Not underground.'); return;
        }

        const previousBiomeName = procGenData.biomeLayerStack.pop();
        const previousBiome     = getBiomeByName(previousBiomeName);
        if (!previousBiome) { logWarn(`GoUp: Previous biome "${previousBiomeName}" not found`); return; }

        // The door the party came down by, read BEFORE the square is put back:
        // restoring a snapshot restores its stored entrance coordinates too, and
        // those predate this descent.
        const goDownX = procGenData.goDownEventX || 64, goDownY = procGenData.goDownEventY || 64;

        // Surfacing ends any door-dungeon session so the surface border resumes
        // normal biome-edge travel.
        if (procGenData.biomeLayerStack.length === 0) procGenData._dungeonSession = null;

        // ...and when the ground above the last layer is a place the destination
        // file names, the party comes out of ITS door rather than onto a
        // generated square that the town is not standing on.
        if (procGenData.biomeLayerStack.length === 0) {
            const above = surfaceDestinationFor(procGenData.originX, procGenData.originY);
            if (above) { surfaceToDestination(procGenData, above); return; }
        }

        if (window.ProcStitch) window.ProcStitch.close();
        procGenData.lastLoadedProcMapX    = null;
        procGenData.lastLoadedProcMapY    = null;
        procGenData._stitchReanchor       = true;

        procGenData.currentBiome          = previousBiomeName;
        procGenData.currentBiomeTileset   = previousBiome.tilesetId;
        procGenData.biomeDayTemperature   = previousBiome.dayTemperature   || 20;
        procGenData.biomeNightTemperature = previousBiome.nightTemperature || 10;

        // The square the descent was started from, exactly as it was left. Only
        // when there is none (a save from before descents kept one) is it rebuilt
        // from its canonical seed, which reproduces the layout but not any prefab
        // that was standing on it.
        if (!popSurfaceSnapshot(procGenData, previousBiomeName)) {
            rebuildSurfaceFromSeed(procGenData, previousBiomeName, previousBiome);
        }

        $gameScreen.clearWeather();
        $gameScreen.startFadeOut(10);
        // Wait for the screen to go fully black before swapping the tileset:
        // reserveTransfer used to fire the instant the fade started, so the
        // surface popped in while the dungeon was still visible underneath it.
        procGenData._edgeTransitionScheduled = true;
        procGenData._edgeTransitionCallback = () => {
            if (!procGenData._edgeTransitionScheduled) return;
            procGenData._edgeTransitionScheduled = false;

            if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;
            $gamePlayer.reserveTransfer(procMapId, goDownX, goDownY, $gamePlayer.direction(), 2);

            setTimeout(() => updateEventVisibility(), 100);
            setTimeout(() => refreshEnemiesForBiome(), 100);
            setTimeout(() => updateBiomeAudio(), 100);
            setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
        };
    });

    // Leave an enclosed structure on command instead of walking to its border.
    //
    // Written for a patron's vault - the PatronVault biome is a hall the size of
    // a village and its border is a long walk from wherever the party finished
    // emptying it - but it is deliberately general: any structure entered off
    // the procedural map (a cellar, a crypt, a cave den, a sewer) leaves the
    // same way, because they all keep the same session record.
    //
    // Where it puts the party, in order of preference:
    //   1. The session's own entrance: the exact tile they came in by, on the
    //      square put back exactly as it was. This is what the border does, and
    //      for a vault under a patron's square that tile IS the hatch.
    //   2. No session (a save made inside one before this existed, or a vault
    //      reached some other way): the square is rebuilt from its seed and the
    //      party is put on the patron's hatch tile, read back out of the
    //      encrypted record for this square (PatreonRewards.hatchTileAtWorld).
    //   3. Nothing to rebuild: out onto the world map square itself, which is
    //      always somewhere real.
    PluginManager.registerCommand(PLUGIN_PMT, 'exitStructure', () => {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg) { logWarn('exitStructure: no procedural map active.'); return; }

        // The ordinary case: hand the border's own exit the party's facing.
        if (pg._dungeonSession && pg._dungeonSession.type !== 'tower') {
            exitDungeonSession($gamePlayer.direction());
            return;
        }
        if (pg._dungeonSession) { logWarn('exitStructure: a tower floor has no border to leave by.'); return; }

        // No session. Rebuild the square this structure was dug under and step
        // out onto the hatch, if a patron owns it.
        const worldX = pg.originX != null ? pg.originX : $gameVariables.value(VAR_WORLD_X);
        const worldY = pg.originY != null ? pg.originY : $gameVariables.value(VAR_WORLD_Y);
        const hatch = (window.PatreonRewards && window.PatreonRewards.hatchTileAtWorld)
            ? window.PatreonRewards.hatchTileAtWorld(worldX, worldY)
            : null;

        const surfaceName = Utils2.getBiomeFromCacheWithFallback
            ? Utils2.getBiomeFromCacheWithFallback(pg.biomeCoordinateCache, worldX, worldY, $gameMap, worldMapId)
            : null;
        const surfaceBiome = surfaceName ? getBiomeByName(surfaceName) : null;

        if (!hatch || !surfaceBiome) {
            logWarn('exitStructure: no hatch on this square, leaving by the world map.');
            $gameScreen.startFadeOut(10);
            pg._edgeTransitionScheduled = true;
            pg._edgeTransitionCallback = () => {
                if (!pg._edgeTransitionScheduled) return;
                pg._edgeTransitionScheduled = false;
                $gameSystem.clearProcGenData();
                $gamePlayer.reserveTransfer(worldMapId, worldX, worldY, $gamePlayer.direction(), 0);
                setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
            };
            return;
        }

        if (window.ProcStitch) window.ProcStitch.close();
        pg.biomeLayerStack        = [];
        pg.lastLoadedProcMapX     = null;
        pg.lastLoadedProcMapY     = null;
        pg._stitchReanchor        = true;
        pg.currentBiome           = surfaceName;
        pg.currentBiomeTileset    = surfaceBiome.tilesetId;
        pg.biomeDayTemperature    = surfaceBiome.dayTemperature   || 20;
        pg.biomeNightTemperature  = surfaceBiome.nightTemperature || 10;
        // The hatch is stamped back on by PatreonRewards.applyMapFeatures at the
        // end of generation, so the party lands on it and can go straight back
        // down; rebuildSurfaceFromSeed reproduces the rest of the square.
        rebuildSurfaceFromSeed(pg, surfaceName, surfaceBiome);

        $gameScreen.clearWeather();
        $gameScreen.startFadeOut(10);
        pg._edgeTransitionScheduled = true;
        pg._edgeTransitionCallback = () => {
            if (!pg._edgeTransitionScheduled) return;
            pg._edgeTransitionScheduled = false;

            if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;
            $gamePlayer.reserveTransfer(procMapId, hatch[0], hatch[1], $gamePlayer.direction(), 2);

            setTimeout(() => updateEventVisibility(), 100);
            setTimeout(() => refreshEnemiesForBiome(), 100);
            setTimeout(() => updateBiomeAudio(), 100);
            setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
        };
    });

    PluginManager.registerCommand(PLUGIN_PMT, 'switchLayer', () => {
        const system      = $gameSystem;
        const procGenData = system._procGenData;
        if (!procGenData) return;

        const isUnderground = procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0;
        const playerX       = $gamePlayer.x, playerY = $gamePlayer.y, playerDir = $gamePlayer.direction();

        if (isUnderground) {
            const previousBiomeName = procGenData.biomeLayerStack.pop();
            const previousBiome     = getBiomeByName(previousBiomeName);
            if (!previousBiome) { logWarn(`switchLayer: Previous biome "${previousBiomeName}" not found`); return; }

            // The same rule goUp follows: the last step up out of a square a
            // destination names comes out of that place's own door.
            if (procGenData.biomeLayerStack.length === 0) {
                const above = surfaceDestinationFor(procGenData.originX, procGenData.originY);
                if (above) { surfaceToDestination(procGenData, above); return; }
            }

            if (window.ProcStitch) window.ProcStitch.close();
            procGenData.lastLoadedProcMapX    = null;
            procGenData.lastLoadedProcMapY    = null;
            procGenData._stitchReanchor       = true;

            procGenData.currentBiome          = previousBiomeName;
            procGenData.currentBiomeTileset   = previousBiome.tilesetId;
            procGenData.biomeDayTemperature   = previousBiome.dayTemperature   || 20;
            procGenData.biomeNightTemperature = previousBiome.nightTemperature || 10;

            // Same rule as goUp: the square that was descended from is handed
            // back whole, and only rebuilt from the seed when none was kept.
            if (!popSurfaceSnapshot(procGenData, previousBiomeName)) {
                rebuildSurfaceFromSeed(procGenData, previousBiomeName, previousBiome);
            }

            // Wait for the screen to go fully black before swapping the tileset:
            // reserveTransfer used to fire the instant the fade started, so the
            // surface popped in while the lower layer was still visible underneath it.
            $gameScreen.clearWeather(); $gameScreen.startFadeOut(10);
            procGenData._edgeTransitionScheduled = true;
            procGenData._edgeTransitionCallback = () => {
                if (!procGenData._edgeTransitionScheduled) return;
                procGenData._edgeTransitionScheduled = false;

                if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;
                $gamePlayer.reserveTransfer(procMapId, playerX, playerY, playerDir, 2);
                setTimeout(() => updateEventVisibility(), 100);
                setTimeout(() => refreshEnemiesForBiome(), 100);
                setTimeout(() => updateBiomeAudio(), 100);
                setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
            };

        } else {
            if (!procGenData.currentBiome) procGenData.currentBiome = 'Cave';
            const currentBiome = getBiomeByName(procGenData.currentBiome);
            if (!currentBiome || !currentBiome.lowerLayer) {
                logWarn(`switchLayer: Biome "${procGenData.currentBiome}" has no lower layer`); return;
            }
            if (procGenData.currentBiome === 'Ocean') {  // i18n-ignore  biome id
                const item = $dataItems[DIVING_SUIT_ITEM_ID];
                if (!$gameParty.hasItem(item)) { $gameMessage.add(T('WorldMapReturn.needDivingSuit')); return; }
            }

            // Keep the surface square before the lower layer overwrites it.
            stashSurfaceSnapshot(procGenData);

            if (window.ProcStitch) window.ProcStitch.close();

            procGenData.biomeLayerStack.push(procGenData.currentBiome);
            let lowerBiomeName = currentBiome.lowerLayer;
            if (procGenData.displayAsBeach) lowerBiomeName = 'CaveFlooded';

            const lowerBiome = getBiomeByName(lowerBiomeName);
            if (!lowerBiome) {
                logWarn(`switchLayer: Lower biome "${lowerBiomeName}" not found`);
                procGenData.biomeLayerStack.pop(); return;
            }

            procGenData.currentBiome          = lowerBiomeName;
            procGenData.currentBiomeTileset   = lowerBiome.tilesetId;
            procGenData.biomeDayTemperature   = lowerBiome.dayTemperature   || 20;
            procGenData.biomeNightTemperature = lowerBiome.nightTemperature || 10;
            procGenData.lastLoadedProcMapX    = null;
            procGenData.lastLoadedProcMapY    = null;
            procGenData._stitchReanchor       = true;

            const seed = procMapSeed(procGenData.originX, procGenData.originY, procGenData.biomeLayerStack.length);
            const adjacentBiomes = $gameMap.mapId() === PROC_MAP_ID
                ? { north: lowerBiomeName, south: lowerBiomeName, east: lowerBiomeName, west: lowerBiomeName }
                : null;
            procGenData.displayAsBeach = false;

            const worldCoords = { x: procGenData.originX, y: procGenData.originY };
            procGenData.generatedMapData = generateProceduralTerrain(lowerBiome, seed, null, adjacentBiomes, null, worldCoords, procGenData.biomeCoordinateCache);

            // Wait for the screen to go fully black before swapping the tileset:
            // reserveTransfer used to fire the instant the fade started, so the
            // lower layer popped in while the surface was still visible underneath it.
            $gameScreen.clearWeather(); $gameScreen.startFadeOut(10);
            procGenData._edgeTransitionScheduled = true;
            procGenData._edgeTransitionCallback = () => {
                if (!procGenData._edgeTransitionScheduled) return;
                procGenData._edgeTransitionScheduled = false;

                if (window.SplitScreenManager && window.SplitScreenManager.active) window.SplitScreenManager.forceP2Teleport = true;
                $gamePlayer.reserveTransfer(procMapId, playerX, playerY, playerDir, 2);
                setTimeout(() => updateEventVisibility(), 100);
                setTimeout(() => refreshEnemiesForBiome(), 100);
                setTimeout(() => updateBiomeAudio(), 100);
                setTimeout(() => { $gameScreen.startFadeIn(10); }, 150);
            };
        }
    });

    // ============================================================================
    // SHARED TRAVEL LOGIC
    // ============================================================================

    function performStopTravel() {
        // When VoxelWorldSystem is active, vars 43/44 are kept current by the
        // waypoint system. $gamePlayer.x/y is stuck at the ship's parked tile,
        // so do NOT overwrite the correct coords with the stale tile position.
        const camperDriving = window.VoxelWorldSystem && window.VoxelWorldSystem.isActive();

        if ($gameMap.mapId() === worldMapId && !camperDriving) {
            $gameVariables.setValue(VAR_WORLD_X, $gamePlayer.x);
            $gameVariables.setValue(VAR_WORLD_Y, $gamePlayer.y);
        }

        const currentX = $gameVariables.value(VAR_WORLD_X);
        const currentY = $gameVariables.value(VAR_WORLD_Y);
        const NON_PROCEDURAL_COORDS = getWorldMapCoordinates();

        console.log('[WMR] Checking position:', currentX, currentY);

        // Bologna is authored as a dedicated OSM tile grid (BolognaMapSystem),
        // not a procedural biome. Stopping on a Bologna world-map tile hands off
        // to that system's centre cell (r7 c6) instead of generating proc terrain.
        const hardcodedName = window.WorldGen && window.WorldGen.HardcodedBiomeNames
            ? window.WorldGen.HardcodedBiomeNames[`${currentX},${currentY}`]
            : null;
        if (hardcodedName === 'Bologna' && window.BolognaMapSystem) {  // i18n-ignore  HardcodedBiomeNames entry
            if (camperDriving) window.VoxelWorldSystem.stop();
            window.BolognaMapSystem.teleportToCell(7, 6);
            return;
        }

        // `coords` (a door per side of the town's footprint) takes priority;
        // any other square inside the town's `reservedTiles` falls back to
        // its single fixed `entrance`, whatever direction it was crossed from.
        //
        // Most named places (London, Milano, Le Havre, ...) are `procedural: true`
        // and declare neither: they reserve their world squares only so the square
        // carries their name, and the map the party walks into is generated. Those
        // must fall through to the procedural generator below - matching a reserved
        // tile is NOT on its own a reason to stop, or "Visit <name>" silently does
        // nothing on every one of them.
        const currentMapCoord = parseInt(currentX) + ',' + parseInt(currentY);
        for (const key in NON_PROCEDURAL_COORDS) {
            const location = NON_PROCEDURAL_COORDS[key];
            const coords = Array.isArray(location.coords) ? location.coords : null;
            const onCoords = coords && coords.some(c => c.mapCoord === currentMapCoord);
            const onReserved = Array.isArray(location.reservedTiles) &&
                location.reservedTiles.includes(currentMapCoord);
            // Places that declare no footprint stand on the single square their
            // `base` names (Frozen Station, the space centre, ...); their authored
            // entrance is reached from there and nowhere else. Where reservedTiles
            // does exist it is the authority - `base` is not dependably inside it.
            const onBase = !Array.isArray(location.reservedTiles) && location.base &&
                (parseInt(location.base.x) + ',' + parseInt(location.base.y)) === currentMapCoord;
            if (!onCoords && !onReserved && !onBase) continue;

            const direction = $gamePlayer.direction();
            let destination = null;
            if (onCoords) {
                const directionName = { 2: 'south', 4: 'west', 6: 'east', 8: 'north' }[direction];
                destination = directionName && coords.find(c => c.direction === directionName);
            }
            // A door for the crossed side is best; the town's single fixed
            // `entrance` covers every other side, and any authored door at all
            // beats refusing to move.
            if (!destination && location.entrance && location.entrance.id) {
                destination = location.entrance;
            }
            if (!destination && coords) {
                destination = coords.find(c => c && c.id);
            }
            if (!destination) break;  // hand-made map has no way in: generate one

            console.log('[WMR] Transferring to map', destination.id, 'at', destination.x, destination.y);
            if (camperDriving) window.VoxelWorldSystem.stop();
            $gamePlayer.reserveTransfer(destination.id, destination.x, destination.y, 0, 0);
            return;
        }

        console.log('[WMR] No non-proc match, generating procedural map');

        enterProceduralSquare(currentX, currentY, $gamePlayer.direction(), () => {
            if (camperDriving) window.VoxelWorldSystem.stop();
        });
    }

    // Build a world square's terrain and walk the party into it from the side
    // they crossed, so the step they just took carries on rather than restarting
    // in the middle of a new map. This is what "Visit X" on the world map does,
    // and now also what an authored map's chevron border does, so the two agree
    // on the entry edge, the variables written and the order they happen in.
    //
    // The coordinates are the SQUARE, not a tile: the tile is derived from the
    // direction, and is square-local (the stitched window remaps it in
    // performTransfer). `beforeTransfer` runs only once the square really built,
    // between the generation and the transfer, which is where the callers that
    // have to tear something down (the 3D drive) belong.
    function enterProceduralSquare(worldX, worldY, direction, beforeTransfer) {
        if (!$gameSystem.generateProceduralMap) return false;
        const wx = Number(worldX), wy = Number(worldY);
        // setValue refreshes every event page on the map, so the square is only
        // written when it really moved (setPlayerWorldCoords says the same).
        if (isFinite(wx) && isFinite(wy) && wx >= 0 && wy >= 0) setPlayerWorldCoords(wx, wy);
        if (!$gameSystem.generateProceduralMap()) return false;
        if (beforeTransfer) beforeTransfer();
        const start = $gameSystem.getEdgeCoordinateForDirection(direction);
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        $gamePlayer.reserveTransfer(procMapId, start.x, start.y, direction, 0);
        return true;
    }

    // Re-enter a procedural square at exact local coordinates and facing direction
    // (used when pressing T on the world map without moving to return to the exact spot).
    function enterProceduralSquareAt(worldX, worldY, localX, localY, direction, beforeTransfer) {
        if (!$gameSystem.generateProceduralMap) return false;
        const wx = Number(worldX), wy = Number(worldY);
        if (isFinite(wx) && isFinite(wy) && wx >= 0 && wy >= 0) setPlayerWorldCoords(wx, wy);
        if (!$gameSystem.generateProceduralMap()) return false;
        if (beforeTransfer) beforeTransfer();
        $gameVariables.setValue(110, 1);
        $gameVariables.setValue(111, 1);
        const targetX = (typeof localX === 'number' && isFinite(localX)) ? localX : Math.floor(PROC_MAP_WIDTH / 2);
        const targetY = (typeof localY === 'number' && isFinite(localY)) ? localY : Math.floor(PROC_MAP_HEIGHT / 2);
        const targetDir = direction || 2;
        $gamePlayer.reserveTransfer(procMapId, targetX, targetY, targetDir, 0);
        return true;
    }

    // ============================================================================
    // WINDOW: WORLD MAP CHOICE (parchment submenu from menu)
    // ============================================================================

    function Window_WorldMapChoice() { this.initialize(...arguments); }
    Window_WorldMapChoice.prototype              = Object.create(Window_Command.prototype);
    Window_WorldMapChoice.prototype.constructor  = Window_WorldMapChoice;

    Window_WorldMapChoice.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
        this.hide();
        this.deactivate();
        this.createUIParchment();
    };

    Window_WorldMapChoice.prototype.update = function() {
        Window_Command.prototype.update.call(this);
        if (!this._dndParchmentSprite) {
            this.createUIParchment();
        } else if (this._dndParchmentSprite.bitmap &&
                   (this._dndParchmentSprite.bitmap.width  !== this.width ||
                    this._dndParchmentSprite.bitmap.height !== this.height)) {
            this.refreshUIParchment();
        }
    };

    Window_WorldMapChoice.prototype.move = function(_x, _y, width, height) {
        const sizeChanged = this.width !== width || this.height !== height;
        Window_Command.prototype.move.apply(this, arguments);
        if (sizeChanged && this._dndParchmentSprite) this.refreshUIParchment();
    };

    Window_WorldMapChoice.prototype._refreshBack  = function() {};
    Window_WorldMapChoice.prototype._refreshFrame = function() {};

    Window_WorldMapChoice.prototype.createUIParchment = function() {
        if (this._dndParchmentSprite) this.removeChild(this._dndParchmentSprite);
        this._dndParchmentSprite = new Sprite();
        this.addChildAt(this._dndParchmentSprite, 0);
        this.refreshUIParchment();
    };

    Window_WorldMapChoice.prototype.refreshUIParchment = function() {
        const w = this.width, h = this.height;
        if (w <= 0 || h <= 0) return;
        const bitmap = new Bitmap(w, h);
        const ctx    = bitmap.context;

        ctx.fillStyle = '#ecdcb9';
        const radius  = 6;
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(w - radius, 0);
        ctx.quadraticCurveTo(w, 0, w, radius);
        ctx.lineTo(w, h - radius);
        ctx.quadraticCurveTo(w, h, w - radius, h);
        ctx.lineTo(radius, h);
        ctx.quadraticCurveTo(0, h, 0, h - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(139, 90, 43, 0.04)';
        ctx.fillRect(0, 0, w, h);

        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) / 4, w / 2, h / 2, Math.max(w, h) / 2);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(78, 38, 12, 0.12)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#4a2711';
        ctx.lineWidth   = 3;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.lineWidth   = 1;
        ctx.strokeStyle = 'rgba(74, 39, 17, 0.5)';
        ctx.strokeRect(7, 7, w - 14, h - 14);

        this._dndParchmentSprite.bitmap = bitmap;
    };

    Window_WorldMapChoice.prototype.resetFontSettings = function() {
        Window_Command.prototype.resetFontSettings.call(this);
        this.contents.fontFace = 'Bitter';
    };

    Window_WorldMapChoice.prototype.resetTextColor = function() {
        this.changeTextColor('#1a1a1a');
    };

    Window_WorldMapChoice.prototype.makeCommandList = function() {
        // One row, three jobs: the world map on Earth, the landing-site picker on
        // another planet, the lift on a tower floor (see commandWorldMap).
        if (!isReturnDisabled()) this.addCommand(worldMapReturnLabel(), 'return');
        if ($gameMap.mapId() === procMapId) {
            const procGenData   = $gameSystem._procGenData;
            const isUnderground = procGenData && procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0;
            const currentBiome  = procGenData && procGenData.currentBiome && window.ProcGenUtils
                ? window.ProcGenUtils.getBiomeByName(procGenData.currentBiome) : null;
            // A procedural interior (dungeon, cave, sewer, loot cellar and the
            // rest of the enclosed catalogue) is already a roofed-over place
            // with no square to dig into, so it never offers the descent.
            const inInterior = !!(window.ProceduralInteriors
                && typeof window.ProceduralInteriors.isCurrent === 'function'
                && window.ProceduralInteriors.isCurrent());
            const hasUnderground = currentBiome && currentBiome.lowerLayer && !inInterior;
            if (isUnderground)       this.addCommand(T('WorldMapReturn.goToSurface'), 'goUp');
            else if (hasUnderground) this.addCommand(T('WorldMapReturn.goUnderground'), 'goDown');
        }
        this.addCommand(T('WorldMapReturn.toggleWorldMap'), 'toggleMinimap');
        this.addCommand(T('WorldMapReturn.openWorldMap'), 'open');
        this.addCommand(T('WorldMapReturn.cancel'), 'cancel');
    };

    Window_WorldMapChoice.prototype.itemTextAlign = function() { return 'center'; };

    // ============================================================================
    // SCENE MAP EXTENSIONS
    // ============================================================================

    // Map the previous onMapLoaded ran for, so a transfer can be told apart from
    // a plain scene rebuild (closing the menu re-creates Scene_Map on the same map).
    let _lastLoadedMapId = 0;

    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);

        // The party's world square, re-derived from the map they are now on. The
        // engine's own transfer has already run inside the call above, so the
        // player stands on their arrival tile by this point. Every route in goes
        // through here: a border crossing, an event transfer, fast travel, a
        // vehicle put down, a house or a cellar left behind.
        syncPlayerWorldCoords($gameMap.mapId());

        // Clear stale border arrows
        if ($gamePlayer) $gamePlayer.clearBorderArrows();
        if ($gamePlayer) $gamePlayer.clearProcGenBorderArrows();
        if ($gamePlayer) $gamePlayer.clearP2Arrows();

        // Map 636 is one map slot reused for the whole world, and the tileset
        // Map636.json declares (300, the Fields set) is a placeholder: the square
        // laid over it belongs to whatever biome the party is standing in. Put
        // that square's own tileset back before the tilemap is built.
        //
        // What stood here asked for $gameSystem.applyProceduralMapTileset, which
        // exists nowhere: the guard was always false and nothing was re-asserted
        // at all. Any route that laid the tiles down without also writing the
        // tileset -- coming back out of a building onto a city square, for one --
        // then drew the street it restored with the placeholder.
        syncProcSurfaceTileset();

        // Build biome cache on world map load
        if ($gameMap.mapId() === WORLD_MAP_ID && $gameSystem._procGenData) {
            if (!$gameSystem._procGenData.biomeCoordinateCache ||
                Object.keys($gameSystem._procGenData.biomeCoordinateCache).length === 0) {
                console.log(`[Scene_Map.onMapLoaded] World map loaded, building biome cache...`);
                buildBiomeCoordinateCache($gameSystem, $gameMap, WORLD_MAP_ID);
                console.log(`[Scene_Map.onMapLoaded] Biome cache built`);
            }
        }

        // Refresh proc map on load
        if ($gameMap.mapId() === PROC_MAP_ID &&
            $gameSystem._procGenData &&
            $gameSystem._procGenData.generatedMapData) {
            // Never strand the player on a non-passable tile after a transfer.
            ensurePlayerOnStandableTile();
            if (this._spriteset) {
                if (typeof this._spriteset.loadTileset === 'function') {
                    this._spriteset.loadTileset();
                }
                if (this._spriteset._tilemap) {
                    this._spriteset._tilemap.setData($gameMap.width(), $gameMap.height(), $gameMap.data());
                    this._spriteset._tilemap.refresh();
                }
                this._spriteset.update();
            }

            // Chests, traps, doors, police and enemies, all placed inside the
            // square the party is actually standing in rather than wherever the
            // window happens to put tile (0,0).
            // Only a real arrival populates. A rebuild of Scene_Map on the same
            // square -- closing a menu, coming back from battle -- keeps the
            // square exactly as the party left it.
            if (populatePartySquare(this._transfer)) {
                console.log(`[Scene_Map.onMapLoaded] Procedural map loaded, populated square`);
            }
            // Entering a square from the world map (or from a house / dungeon /
            // vehicle) is a fresh arrival, so re-resolve the biome track here as
            // well as on border crossings. The pick is deterministic, so this is
            // a no-op whenever the correct track is already playing.
            updateBiomeAudio();

            setTimeout(() => {
                $gameScreen.startFadeIn(10);
                console.log(`[Scene_Map.onMapLoaded] Fading in for new biome`);
            }, 100);
        }

        // Surfacing back onto the world map: the overview has no music of its own
        // (map 315 keeps BGM autoplay off) and its ambience is a silent placeholder,
        // so the biome track and room tone the party was hearing down in the
        // procedural map must not bleed into it. Clear both.
        if ($gameMap.mapId() === WORLD_MAP_ID) {
            // The same "the world map is above ground" rule Game_Map.setup applies,
            // repeated for the one arrival that never runs setup: a savegame is
            // restored with its Game_Map as it was saved, so a save made while the
            // layer stack was stuck heals here instead.
            if (surfaceProcGenLayers($gameSystem && $gameSystem._procGenData)) {
                console.log('[WorldMapReturn] World map loaded: dropped a stale underground layer stack');
            }
            if (_lastLoadedMapId === PROC_MAP_ID) AudioManager.stopBgm();
            // Ambience is silenced on arrival from ANY map (house, dungeon, city,
            // vehicle interior, ...), never just the procedural one, so nothing but
            // the weather is heard over the overview.
            stopAllBgsExceptWeather();
            console.log('[Scene_Map.onMapLoaded] Back on the world map, cleared BGS (weather kept)');
        }
        _lastLoadedMapId = $gameMap.mapId();

        // Update audio for non-proc maps with biome notes
        if ($gameMap.mapId() !== PROC_MAP_ID && $gameMap.mapId() !== WORLD_MAP_ID) {
            if ($dataMap && ($dataMap.note || ($dataMap.meta && $dataMap.meta.Biome))) {
                const noteMatch = $dataMap.note ? $dataMap.note.match(/<Biome:\s*(.+?)>/i) : null;
                const metaBiome = $dataMap.meta ? $dataMap.meta.Biome : null;
                if (noteMatch || metaBiome) {
                    setTimeout(() => {
                        updateBiomeAudio();
                        console.log(`[Scene_Map.onMapLoaded] Updated audio for map ${$gameMap.mapId()}`);
                    }, 50);
                }
            }
        }
    };

    // Resolve the player's current world-map location name, mirroring the
    // MapInfoHUD logic in TimeDateSystem: hardcoded names take priority, then
    // the cached biome, then the current proc-gen biome.
    // True when the player is standing over a City / Burg / Village biome tile on
    // the world map. Those settlements have their own entry interaction, so the
    // "Visit ... / Make a camp" travel-decision menu must not open over them.
    // True when the player stands on a named hardcoded location (London, Milano,
    // Vatican Citadel, ...). These cannot be "visited" from the travel menu; the
    // Visit option is shown as "No Visit" instead of being actionable (#104).
    function isHardcodedBiomeHere() {
        if (!$gamePlayer) return false;
        if (window.WorldGen && window.WorldGen.HardcodedBiomeNames) {
            return !!window.WorldGen.HardcodedBiomeNames[`${$gamePlayer.x},${$gamePlayer.y}`];
        }
        return false;
    }

    function isSettlementBiomeHere() {
        if (!$gamePlayer) return false;
        let biome = '';
        if ($gameSystem && $gameSystem.getBiomeFromCache) {
            biome = $gameSystem.getBiomeFromCache($gamePlayer.x, $gamePlayer.y) || '';
        }
        if (!biome && $gameSystem && $gameSystem.getBiomeFromWorldCoordinates) {
            biome = $gameSystem.getBiomeFromWorldCoordinates($gamePlayer.x, $gamePlayer.y) || '';
        }
        biome = biome.toLowerCase();
        return biome.startsWith('city') || biome.startsWith('burg') || biome.startsWith('village');
    }

    function getCurrentLocationName() {
        if ($gamePlayer && window.WorldGen && window.WorldGen.HardcodedBiomeNames) {
            const loc = window.WorldGen.HardcodedBiomeNames[`${$gamePlayer.x},${$gamePlayer.y}`];
            if (loc) return loc;
        }
        let name = 'map';
        if ($gameSystem && $gameSystem.getBiomeFromCache && $gamePlayer) {
            const b = $gameSystem.getBiomeFromCache($gamePlayer.x, $gamePlayer.y);
            if (b && b !== 'Unknown') name = b;  // i18n-ignore  biome id
        }
        if (name === 'map' && $gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.currentBiome) {
            name = $gameSystem._procGenData.currentBiome;
        }
        if (name.startsWith('Road ')) name = 'Road';
        return name;
    }

    // ------------------------------------------------------------------------
    // Place names for records and lists (Assets menu, deliveries, ...)
    //
    // Map 636 is ONE map reused for every square of the world, so its MapInfos
    // name ("ProceduralRoom") says nothing about where a thing actually is. A
    // record that points at it must be named after the world coordinate it was
    // made on: the hand-authored name of that square if it has one, otherwise
    // its biome, with the coordinate appended so two fields are told apart.
    // Anything else is named by its map, minus the editor's numeric prefix
    // ("700 - Hardware store" -> "Hardware store").
    // ------------------------------------------------------------------------

    function localizeName(text) {
        if (!text) return text;
        return (typeof window.Hendrix_Localization === 'function')
            ? window.Hendrix_Localization(text) : text;
    }

    // The name of the world square at (wx, wy), or '' when nothing is known.
    function worldSquareName(wx, wy) {
        const named = window.WorldGen && window.WorldGen.HardcodedBiomeNames;
        const hardcoded = named ? named[`${wx},${wy}`] : null;
        if (hardcoded) return hardcoded;
        // A square whose biome is overridden generates as the override, not as the
        // world map's own tile, so the name has to follow it: the biome cache is
        // built from the tiles and knows nothing about it.
        const override = window.getHardcodedBiomeOverride
            ? window.getHardcodedBiomeOverride(wx, wy) : null;
        if (override && override.biome) {
            return window.BiomeNames.display(String(override.biome).replace(/^(Road|River)\s+.*$/, '$1'));  // i18n-ignore  biome ids
        }
        let biome = '';
        if ($gameSystem && $gameSystem.getBiomeFromCache) {
            // Reads the world map's tiles when the square is not cached, which
            // needs a loaded map: a caller between maps just gets no biome.
            try { biome = $gameSystem.getBiomeFromCache(wx, wy) || ''; } catch (e) { biome = ''; }
        }
        if ((!biome || biome === 'Unknown') && $gameSystem && $gameSystem._procGenData) {
            biome = $gameSystem._procGenData.currentBiome || '';
        }
        if (biome === 'Unknown') biome = '';
        if (!biome) return '';
        // Roads and rivers carry a direction suffix ("Road cross", "River
        // vertical") that is layout, not a place.
        biome = biome.replace(/^(Road|River)\s+.*$/, '$1');  // i18n-ignore  biome ids
        return window.BiomeNames.display(biome);
    }

    // mapId is the map a record was made on; coords are the world coordinates it
    // was made at, needed only for the procedural map and falling back to where
    // the party is now.
    function placeName(mapId, coords) {
        const id = Number(mapId);
        if (id === procMapId) {
            const vars = (typeof $gameVariables !== 'undefined' && $gameVariables) ? $gameVariables : null;
            const wx = (coords && coords.x != null) ? Number(coords.x) : (vars ? vars.value(VAR_WORLD_X) | 0 : 0);
            const wy = (coords && coords.y != null) ? Number(coords.y) : (vars ? vars.value(VAR_WORLD_Y) | 0 : 0);
            const name = localizeName(worldSquareName(wx, wy)) || T('WorldMapReturn.wilderness');
            return `${name} (${wx},${wy})`;  // i18n-ignore  coordinate pair
        }
        const info = (typeof $dataMapInfos !== 'undefined' && $dataMapInfos) ? $dataMapInfos[id] : null;
        const raw = (info && info.name) ? String(info.name).replace(/^\d+\s*-\s*/, '') : '';
        return raw ? localizeName(raw) : T('WorldMapReturn.mapNumbered', { id: id });
    }

    // ========================================================================
    // WORLD MAP TRANSFER: the one answer to "where, in world terms, is this?"
    // ------------------------------------------------------------------------
    // Everything that has to remember a spot -- the party's own world square, a
    // parked vehicle, an asset, a delivery -- used to work it out for itself out
    // of Variables 43/44, a map's <Coords> tag and $gameSystem._procGenData, and
    // each of them arrived at a different answer. They all go through this now.
    //
    // A LOCATION is the full address of a tile:
    //   { mapId, x, y, worldX, worldY, layer, interior, alien, planet }
    //   mapId/x/y      the tile on whatever map it is, exactly as stored
    //   worldX/worldY  the map-315 square that map stands on. This is where a
    //                  thing is drawn and reached on the world map, whatever map
    //                  it is really on
    //   layer          depth in the procedural layer stack: one world square
    //                  generates a different map per cave floor / ocean depth, so
    //                  a bike left underground belongs to the underground
    //   interior       the procedural interior it is inside ("" in the open air).
    //                  A dungeon, cellar or sewer is generated onto the same map
    //                  id, world square and layer as the field it was entered
    //                  from, so only this tells the two apart
    //   alien/planet   a GalaxySim landing reuses map 636 AND the world
    //                  coordinates as its own planet grid, so worldX/worldY there
    //                  is a grid cell on `planet` and means nothing on Earth
    // ========================================================================

    // <Coords x y> of any map, loaded and parsed once. Only the parsed pair is
    // kept, so the (large) map file is free to be collected again.
    const mapCoordsCache = new Map();

    function coordsFromNote(note) {
        const m = String(note || '').match(/<\s*coords\b\s*[:=]?\s*(\d+)\D+(\d+)\s*>/i);
        return m ? { x: parseInt(m[1], 10), y: parseInt(m[2], 10) } : null;
    }

    function readMapCoordsTag(mapId) {
        const id = Number(mapId) || 0;
        if (!id) return null;
        // The loaded map already has its note in memory; only a map that is NOT
        // loaded is worth a file read (fast travel parks a vehicle on its
        // destination before the transfer happens).
        if (id === $gameMap.mapId()) {
            if ($gameMap._coordsDest) return { x: $gameMap._coordsDest.x, y: $gameMap._coordsDest.y };
            return ($dataMap && $dataMap.note) ? coordsFromNote($dataMap.note) : null;
        }
        if (typeof $dataMapInfos === 'undefined' || !$dataMapInfos || !$dataMapInfos[id]) return null;
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'data/Map%1.json'.format(id.padZero(3)), false);
            xhr.overrideMimeType('application/json');
            xhr.send();
            if (xhr.status >= 400) return null;
            return coordsFromNote((JSON.parse(xhr.responseText) || {}).note);
        } catch (e) {
            return null;
        }
    }

    // The world square a map DECLARES it stands on, or null when it declares
    // nothing usable (no tag, or the editor template's default pair).
    function mapCoordsTag(mapId) {
        const id = Number(mapId) || 0;
        if (!id || id === worldMapId || id === procMapId) return null;
        if (!mapCoordsCache.has(id)) {
            const raw = readMapCoordsTag(id);
            const usable = raw && !(raw.x === TEMPLATE_COORDS.x && raw.y === TEMPLATE_COORDS.y);
            mapCoordsCache.set(id, usable ? raw : null);
        }
        return mapCoordsCache.get(id);
    }

    // The party's last known world square. Written by every path that moves them
    // (see syncPlayerWorldCoords) and read by everything that puts them back.
    function playerWorldCoords() {
        return {
            x: $gameVariables.value(VAR_WORLD_X) | 0,
            y: $gameVariables.value(VAR_WORLD_Y) | 0
        };
    }

    // Only write when the value really moved: Game_Variables.onChange refreshes
    // every event page on the map, which is far too dear to pay per frame.
    function setPlayerWorldCoords(x, y) {
        const nx = Number(x), ny = Number(y);
        if (!isFinite(nx) || !isFinite(ny)) return false;
        if (nx < 0 || ny < 0) return false;
        if ($gameVariables.value(VAR_WORLD_X) !== nx) $gameVariables.setValue(VAR_WORLD_X, nx);
        if ($gameVariables.value(VAR_WORLD_Y) !== ny) $gameVariables.setValue(VAR_WORLD_Y, ny);
        return true;
    }

    // One row, three jobs: on Earth it goes back to map 315, on another planet's
    // surface it opens the landing-site picker, and on a tower floor it calls the
    // lift. commandWorldMap decides which; this only names it.
    function worldMapReturnLabel() {
        if (isAlienSurfaceNow()) return T('WorldMapReturn.chooseLandingSite');
        const tower = window.DungeonFloors;
        if (tower && tower.insideTower && tower.insideTower()) {
            return T('WorldMapReturn.returnToElevator');
        }
        return T('WorldMapReturn.returnToWorldMap');
    }

    // <disableReturn> / <DisableWorldMap>: this map keeps the party until one of
    // its own events lets them out. The T key and the "Return to World Map" menu
    // row both answer here before doing anything, and the menu row is not drawn
    // at all. The two tags say the same thing, they only read differently in the
    // editor's note field.
    function isReturnDisabled() {
        const meta = $dataMap && $dataMap.meta;
        return !!(meta && (meta.disableReturn || meta.DisableWorldMap || meta.disableWorldMap));
    }

    function isAlienSurfaceNow() {
        return !!(window.GalaxySim && window.GalaxySim.isAlienSurface &&
                  window.GalaxySim.isAlienSurface());
    }

    // Standing on another planet there is no world map to go back to: map 315 is
    // Earth, and the saved square is the planet's own landing-grid cell, so the
    // return would drop the party onto whatever Earth tile happens to share those
    // two small numbers. Every route that offers the return asks this first, and
    // a true answer means the landing-site picker took the press instead
    // (GalaxySim_Core's Scene_AlienLandingGrid). False means Earth as usual.
    function divertedToLandingPicker() {
        if (!isAlienSurfaceNow()) return false;
        return !!(window.GalaxySim.openLandingGridPicker &&
                  window.GalaxySim.openLandingGridPicker());
    }

    // The planet whose landing grid map 636 currently stands for, or '' on Earth.
    function currentPlanetName() {
        if (!isAlienSurfaceNow()) return '';
        const landed = window.GalaxySim.getSurfacePlanet && window.GalaxySim.getSurfacePlanet();
        return (landed && landed.name) || '';
    }

    function currentLayerDepth() {
        const pg = $gameSystem && $gameSystem._procGenData;
        return (pg && pg.biomeLayerStack && pg.biomeLayerStack.length) || 0;
    }

    function currentInteriorName() {
        const api = window.ProceduralInteriors;
        return (api && typeof api.currentBiome === 'function' && api.currentBiome()) || '';
    }

    // World-map square the CURRENTLY LOADED map stands on.
    //   map 315   the party's own tile IS the square
    //   proc map  the square the biome was generated from (an alien landing grid
    //             answers with its grid cell, which is what it is addressed by)
    //   anything  its own <Coords> tag, else the last square the party stood on
    function currentWorldCoords() {
        const mapId = $gameMap.mapId();
        if (mapId === worldMapId) return { x: $gamePlayer.x, y: $gamePlayer.y };
        if (mapId === procMapId) {
            const pg = $gameSystem._procGenData;
            if (pg && typeof pg.originX === 'number' && typeof pg.originY === 'number') {
                return { x: pg.originX, y: pg.originY };
            }
            return playerWorldCoords();
        }
        return mapCoordsTag(mapId) || playerWorldCoords();
    }

    // The same answer for a map that is not the one loaded (fast travel parks a
    // vehicle on its destination before the transfer happens).
    function worldCoordsForMap(mapId, x, y) {
        const id = Number(mapId) || 0;
        if (id === worldMapId) return { x: Number(x) || 0, y: Number(y) || 0 };
        if (id === $gameMap.mapId()) return currentWorldCoords();
        return mapCoordsTag(id) || playerWorldCoords();
    }

    // The full address of a tile on the map that is loaded right now. Pass no
    // tile for the party's own.
    function locate(x, y) {
        const mapId = $gameMap.mapId();
        const wc = currentWorldCoords();
        const onProc = mapId === procMapId;
        const alien = onProc && isAlienSurfaceNow();
        return {
            mapId,
            x: (x === undefined) ? $gamePlayer.x : (Number(x) || 0),
            y: (y === undefined) ? $gamePlayer.y : (Number(y) || 0),
            worldX: wc.x,
            worldY: wc.y,
            layer: onProc ? currentLayerDepth() : 0,
            interior: onProc ? currentInteriorName() : '',
            alien,
            planet: alien ? currentPlanetName() : ''
        };
    }

    // The address a spot on a map that is NOT loaded resolves to. Everything the
    // loaded map alone can answer (which cave floor, which dungeon, which planet)
    // is unknowable from here and reads as the open surface of Earth.
    function locateOnMap(mapId, x, y) {
        const id = Number(mapId) || 0;
        if (id === $gameMap.mapId()) return locate(x, y);
        const wc = worldCoordsForMap(id, x, y);
        return {
            mapId: id, x: Number(x) || 0, y: Number(y) || 0,
            worldX: wc.x, worldY: wc.y,
            layer: 0, interior: '', alien: false, planet: ''
        };
    }

    // Do two addresses name the same place? Used to decide whether a thing parked
    // somewhere belongs on the map the party is looking at.
    function sameRealm(a, b) {
        if (!a || !b) return false;
        if (!!a.alien !== !!b.alien) return false;
        // An unnamed planet is a record written before planets were told apart:
        // it is taken to be whichever one is being asked about, so a vehicle left
        // on a surface by an older save is still found rather than stranded.
        if (a.alien && a.planet && b.planet && a.planet !== b.planet) return false;
        if ((a.layer || 0) !== (b.layer || 0)) return false;
        return (a.interior || '') === (b.interior || '');
    }

    // What a location is CALLED. A named world square wins (the hardcoded names
    // and biome overrides), then the map's own display name, then the biome, and
    // an alien landing is named after its planet.
    function locationName(loc) {
        if (!loc) return T('WorldMapReturn.wilderness');
        if (loc.alien) {
            return loc.planet ? localizeName(loc.planet) : T('WorldMapReturn.wilderness');
        }
        if (loc.mapId === procMapId || loc.mapId === worldMapId || !loc.mapId) {
            const square = localizeName(worldSquareName(loc.worldX, loc.worldY));
            const inside = loc.interior
                ? (window.BiomeNames ? window.BiomeNames.display(loc.interior) : loc.interior)
                : '';
            if (square && inside) return `${inside}, ${square}`;  // i18n-ignore  name pair
            return inside || square || T('WorldMapReturn.wilderness');
        }
        return placeName(loc.mapId, { x: loc.worldX, y: loc.worldY });
    }

    // One line naming a location and the exact tile it is on, for any list that
    // has to say where a thing was left.
    function describeLocation(loc) {
        if (!loc || !loc.mapId) return T('WorldMapReturn.wilderness');
        const name = locationName(loc);
        const depth = (loc.layer > 0 && !loc.alien)
            ? ' ' + T('WorldMapReturn.underground', { depth: loc.layer })
            : '';
        // On the world map the tile IS the square, so it is printed once.
        if (loc.mapId === worldMapId) return `${name} (${loc.x},${loc.y})`;  // i18n-ignore  coordinate pair
        if (loc.mapId === procMapId) {
            return `${name} (${loc.worldX},${loc.worldY})${depth} ${T('WorldMapReturn.atTile', { x: loc.x, y: loc.y })}`;
        }
        return `${name} ${T('WorldMapReturn.atTile', { x: loc.x, y: loc.y })}`;
    }

    // Keep the party's world square in step with the map they are standing on.
    // Called from Scene_Map.onMapLoaded, once the engine's own transfer has put
    // them on their arrival tile, so every route in -- a border crossing, an
    // event transfer, fast travel, stepping out of a vehicle, leaving a house or
    // a cellar -- lands on the same rule:
    //   map 315   the tile they arrived on
    //   proc map  the square the biome was generated from (never an alien grid
    //             cell: those are not Earth squares and would send a later
    //             "return to the world map" into the sea)
    //   anything  its <Coords> tag when it declares one, otherwise nothing at
    //             all, so the square they came in from stands
    function syncPlayerWorldCoords(mapId) {
        const id = Number(mapId) || 0;
        if (id === worldMapId) return setPlayerWorldCoords($gamePlayer.x, $gamePlayer.y);
        if (id === procMapId) {
            if (isAlienSurfaceNow()) return false;
            const pg = $gameSystem && $gameSystem._procGenData;
            if (pg && typeof pg.originX === 'number' && typeof pg.originY === 'number') {
                return setPlayerWorldCoords(pg.originX, pg.originY);
            }
            return false;
        }
        const tag = mapCoordsTag(id);
        return tag ? setPlayerWorldCoords(tag.x, tag.y) : false;
    }

    // Does the square at (x, y) still have its adventure to give? A town square
    // suppresses the travel menu, so this has to be able to open it on its own:
    // the town's own adventure is reached no other way.
    function hasAdventureAt(x, y) {
        const Earth = adventureSystem();
        return !!(Earth && $gameMap.mapId() === worldMapId && Earth.isPendingAt(x, y));
    }

    function hasAdventureHere() {
        return hasAdventureAt($gamePlayer.x, $gamePlayer.y);
    }

    // The world square the party is turned towards. Walking up to a "???" plate
    // or to a named place and facing it is the same act of interaction as
    // standing on it, so the travel menu answers for that square too and the
    // party never has to take the last step onto it.
    function facedWorldCoords() {
        if (!$gamePlayer || $gameMap.mapId() !== worldMapId) return null;
        const d = $gamePlayer.direction();
        const x = $gameMap.roundXWithDirection($gamePlayer.x, d);
        const y = $gameMap.roundYWithDirection($gamePlayer.y, d);
        if (!$gameMap.isValid(x, y)) return null;
        if (x === $gamePlayer.x && y === $gamePlayer.y) return null;
        return { x, y };
    }

    // The destination key of the place occupying (x, y), or '' for open country.
    // HardcodedBiomeNames is Destinations.json's own footprint, flattened tile by
    // tile at load time (see DataService), so every square of a named place
    // answers with that place.
    function destinationKeyAt(x, y) {
        const named = window.WorldGen && window.WorldGen.HardcodedBiomeNames;
        return (named && named[`${x},${y}`]) || '';
    }

    // How a world square reads in a menu row: the readable name of the place
    // standing on it, its biome otherwise.
    function squareLabel(x, y) {
        const key = destinationKeyAt(x, y);
        if (key) {
            return (window.WorkSystem && window.WorkSystem.destinationName)
                ? window.WorkSystem.destinationName(key) : key;
        }
        return localizeName(worldSquareName(x, y)) || T('WorldMapReturn.wilderness');
    }

    // The faced square's own place, when it is one the party can walk into and
    // is not simply the far side of the place they are already standing in.
    // Visiting puts them on that square first, so a square they could not step
    // onto is not offered: they would come back out of the map stranded on it.
    function facedDestination(faced) {
        if (!faced) return '';
        const key = destinationKeyAt(faced.x, faced.y);
        if (!key || key === destinationKeyAt($gamePlayer.x, $gamePlayer.y)) return '';
        if (!$gamePlayer.canPass($gamePlayer.x, $gamePlayer.y, $gamePlayer.direction())) return '';
        return squareLabel(faced.x, faced.y);
    }

    // Is there anything on the faced square worth opening the menu for on its
    // own, over ground that would otherwise suppress it (a town tile, say)?
    function hasFacedInteraction() {
        const faced = facedWorldCoords();
        if (!faced) return false;
        return hasAdventureAt(faced.x, faced.y) || !!facedDestination(faced);
    }

    // Shared gate for the travel-decision menu. Named hardcoded locations
    // usually sit on City/Burg tiles, so isSettlementBiomeHere() is true for
    // them. They still get a "Visit <name>" travel choice, so only suppress the
    // menu over plain settlement tiles that are NOT a named hardcoded location,
    // hold no unplayed adventure and face nothing worth interacting with.
    function canOpenTravelDecisionHere() {
        if ($gameMessage.isBusy()) return false;
        if (window.ProceduralAdventure && window.ProceduralAdventure.isPlaying()) return false;
        if ($gameMap.mapId() !== worldMapId) return false;
        return !isSettlementBiomeHere() || isHardcodedBiomeHere() || hasAdventureHere() ||
            hasFacedInteraction();
    }

    Scene_Map.prototype.openTravelDecision = function() {
        if (!canOpenTravelDecisionHere()) return;
        const Earth = adventureSystem();
        const faced = facedWorldCoords();
        // Every row carries the action it performs, so the order below is the
        // only place that decides what the menu reads like.
        const rows = [];
        // Standing on a "???" square, the biome's own adventure is offered first
        // and above everything else: it is the reason the plate is there. A
        // plate the party is only facing comes right after it, named after its
        // square so the two are never confused for one another.
        if (hasAdventureHere()) {
            rows.push({
                label: T('Anomaly.ui.investigate'),
                run: () => { Earth.beginAt($gamePlayer.x, $gamePlayer.y); },
            });
        }
        if (faced && hasAdventureAt(faced.x, faced.y)) {
            rows.push({
                label: T('WorldMapReturn.investigatePlace', { place: squareLabel(faced.x, faced.y) }),
                run: () => { Earth.beginAt(faced.x, faced.y); },
            });
        }
        rows.push({
            label: T('WorldMapReturn.visit', { place: getCurrentLocationName() }),
            run: () => { performStopTravel(); },
        });
        const facedPlace = facedDestination(faced);
        if (facedPlace) {
            rows.push({
                label: T('WorldMapReturn.visit', { place: facedPlace }),
                // Visiting the next square over IS entering it, so the party is
                // put on it first: vars 43/44, the generator's origin and the
                // door picked for the side crossed all read the same square the
                // player aimed at, exactly as if they had taken the last step.
                run: () => { $gamePlayer.locate(faced.x, faced.y); performStopTravel(); },
            });
        }
        // Walking the square in 3D instead of stepping across it on the map.
        // Only on foot: the drive scene hands the party back by transferring them,
        // and a transfer takes whatever they are riding along with it, which would
        // teleport the camper to wherever they wandered off to.
        if (window.VoxelWorldSystem && !($gamePlayer.isInVehicle && $gamePlayer.isInVehicle())) {
            rows.push({
                label: T('WorldMapReturn.freeWalk'),
                run: () => { $gameTemp._pendingWorldMapCommand = 'freeWalk'; },
            });
        }
        rows.push({
            label: T('WorldMapReturn.makeCamp'),
            run: () => { $gameTemp._pendingWorldMapCommand = 'makeCamp'; },
        });
        rows.push({ label: T('WorldMapReturn.cancel'), run: null });
        const cancelIndex = rows.length - 1;
        $gameMessage.setChoices(rows.map(r => r.label), 0, cancelIndex);
        $gameMessage.setChoiceCallback((choice) => {
            const row = rows[choice];
            if (row && row.run) row.run();
        });
        Input.clear();
        // The click destination is still the tile the player is standing on, and
        // it survives the choice window: leaving it set would reopen the menu
        // the moment the player cancels out of it.
        $gameTemp.clearDestination();
    };

    function updateWorldMapToggleHotkey() {
        if (!Input.isTriggered(WMR_TOGGLE_KEY)) return;
        if ($gameMessage.isBusy() || $gameMap.isEventRunning() || $gamePlayer.isTransferring()) return;
        // The 3D drive / free walk runs over a live map scene and owns the
        // keyboard while it is up; it hands the party back itself.
        if (window.VoxelWorldSystem && VoxelWorldSystem.isActive()) return;
        // A map that holds the party says so rather than swallowing the press:
        // silence reads as a broken key.
        if (isReturnDisabled()) {
            $gameMessage.add(T('WorldMapReturn.returnDisabledHere'));
            Input.clear();
            return;
        }
        if ($gameMap.mapId() === worldMapId) {
            const origin = $gameTemp && $gameTemp._lastWorldMapReturnOrigin;
            const camperDriving = window.VoxelWorldSystem && window.VoxelWorldSystem.isActive();
            const currentX = !camperDriving ? $gamePlayer.x : $gameVariables.value(VAR_WORLD_X);
            const currentY = !camperDriving ? $gamePlayer.y : $gameVariables.value(VAR_WORLD_Y);

            if (origin && origin.mapId && currentX === origin.worldX && currentY === origin.worldY) {
                if (origin.mapId === procMapId) {
                    enterProceduralSquareAt(origin.worldX, origin.worldY, origin.x, origin.y, origin.dir, () => {
                        if (camperDriving) window.VoxelWorldSystem.stop();
                    });
                    return;
                } else {
                    if (camperDriving) window.VoxelWorldSystem.stop();
                    $gamePlayer.reserveTransfer(origin.mapId, origin.x, origin.y, origin.dir || 2, 0);
                    return;
                }
            }

            performStopTravel();
            return;
        }
        // Everywhere else the key leads out: the procedural map, but equally a
        // house, a shop, a cellar, a hand-made town map -- anywhere the party
        // walked into off the world map is somewhere they can walk back out of.
        // Inside procedural interiors (dungeons, crypts, sewers, etc.), T returns
        // to surface instead.
        // procMapId (636) is also what an alien planet's surface stands on
        // (GalaxySim_Core's isAlienSurface). performReturnToWorldMap() asks
        // divertedToLandingPicker() first, which opens the landing-grid picker
        // instead of transferring to Earth's map 315 whenever the party is
        // off-world, so T reaches the right "go back up" screen either way, and
        // divertedToElevator() after it, which keeps the tower's floors leading
        // to the lift rather than to the world map.
        performReturnToWorldMap();
    }

    const _Scene_Map_update_wmr = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update_wmr.call(this);
        updateWorldMapToggleHotkey();
        updateMysteryMarkers();
        updateQuestMarkers();
        updateQuestCompass();
        watchNationMusicChange();
        if ($gameTemp._icebushBlockedMessage && !this.isBusy()) {
            $gameTemp._icebushBlockedMessage = false;
            $gameMessage.add(T('WorldMapReturn.icebushBlocked'));
        }
        if ($gameTemp._pendingWorldMapCommand && !this.isBusy()) {
            const cmd = $gameTemp._pendingWorldMapCommand;
            $gameTemp._pendingWorldMapCommand = null;
            if (cmd === 'open') {
                PluginManager.callCommand($gameMap._interpreter, 'WorldMap', 'showZoomableMap', {});
            } else if (cmd === 'toggleMinimap') {
                PluginManager.callCommand($gameMap._interpreter, 'WorldMap', 'toggleMinimap', {});
            } else if (cmd === 'goDown') {
                PluginManager.callCommand($gameMap._interpreter, PLUGIN_PMT, 'goDown', {});
            } else if (cmd === 'goUp') {
                PluginManager.callCommand($gameMap._interpreter, PLUGIN_PMT, 'goUp', {});
            } else if (cmd === 'makeCamp') {
                // A camp, not a room: the rest menu opens the same way, but the
                // night also washes, feeds and reunites the party (CampRest, in
                // Core/TimeDateSystem.js).
                PluginManager.callCommand($gameMap._interpreter, 'TimeDateSystem', 'MakeCamp', {});
            } else if (cmd === 'freeWalk') {
                PluginManager.callCommand($gameMap._interpreter, 'VoxelWorldSystem', 'StartFreeWalk', {});
            }
        }
    };

    // ============================================================================
    // WINDOW_MENUCOMMAND EXTENSION
    // ============================================================================

    const _Window_MenuCommand_makeCommandList = Window_MenuCommand.prototype.makeCommandList;
    Window_MenuCommand.prototype.makeCommandList = function() {
        _Window_MenuCommand_makeCommandList.call(this);
        // Skip injection when CustomMainMenuLayout is active (it handles layout itself)
        if (typeof Window_MenuCommand.prototype.callHotkeyCommand === 'function') return;

        if ($gameMap.mapId() === worldMapId) {
            this.addCommand(T('WorldMapReturn.stop'), 'stop', true, 282);
            const command = this._list.pop();
            this._list.splice(1, 0, command);
        }

        if ($gameMap.mapId() !== worldMapId) {
            this.addCommand(T('WorldMapReturn.worldMapMenu'), 'worldMapMenu', true, 190);
            const worldCmd = this._list.pop();
            this._list.splice(1, 0, worldCmd);
        }
    };

    // ============================================================================
    // SCENE_MENU EXTENSIONS
    // ============================================================================

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('worldMapMenu', this.commandWorldMapMenu.bind(this));
        this._commandWindow.setHandler('stop',         this.commandStop.bind(this));
    };

    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function() {
        _Scene_Menu_create.call(this);
        this.createWorldMapChoiceWindow();
    };

    Scene_Menu.prototype.createWorldMapChoiceWindow = function() {
        const rect = this.worldMapChoiceWindowRect();
        this._worldMapChoiceWindow = new Window_WorldMapChoice(rect);
        this._worldMapChoiceWindow.setHandler('open',          this.commandOpenWorldMap.bind(this));
        this._worldMapChoiceWindow.setHandler('toggleMinimap', this.commandToggleMinimap.bind(this));
        this._worldMapChoiceWindow.setHandler('return',        this.commandWorldMap.bind(this));
        this._worldMapChoiceWindow.setHandler('goDown',        this.commandGoDown.bind(this));
        this._worldMapChoiceWindow.setHandler('goUp',          this.commandGoUp.bind(this));
        this._worldMapChoiceWindow.setHandler('cancel',        this.onWorldMapChoiceCancel.bind(this));
        this.addWindow(this._worldMapChoiceWindow);
    };

    Scene_Menu.prototype.worldMapChoiceWindowRect = function() {
        const ww = 400, wh = this.calcWindowHeight(6, true);
        return new Rectangle((Graphics.boxWidth - ww) / 2, (Graphics.boxHeight - wh) / 2, ww, wh);
    };

    Scene_Menu.prototype.commandWorldMapMenu = function() {
        if (this._dndContainer && typeof this.showWorldMapPage === 'function') {
            this.showWorldMapPage(); return;
        }
        if (this._dndContainer) {
            this._dndContainer.style.opacity      = '0';
            this._dndContainer.style.pointerEvents = 'none';
        }
        if (typeof UIMenuInputManager !== 'undefined' && UIMenuInputManager.deactivate) {
            UIMenuInputManager.deactivate();
        }
        this._worldMapChoiceWindow.show();
        this._worldMapChoiceWindow.activate();
    };

    Scene_Menu.prototype.onWorldMapChoiceCancel = function() {
        this._worldMapChoiceWindow.hide();
        this._worldMapChoiceWindow.deactivate();
        if (this._dndContainer) {
            this._dndContainer.style.opacity      = '1';
            this._dndContainer.style.pointerEvents = 'auto';
        }
        if (typeof UIMenuInputManager !== 'undefined' && UIMenuInputManager.activate) {
            UIMenuInputManager.activate(2);
        }
        this._commandWindow.activate();
    };

    Scene_Menu.prototype.commandWorldMap = function() {
        // The 3D voxel world is up behind this menu (VoxelWorld/*). Out there
        // "return to the world map" means leave that world, not walk about
        // inside it: it ends the drive and the walk alike, putting the party
        // down on the square they actually reached.
        if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive() &&
            window.VoxelWorldSystem.exitToWorldMap()) {
            SceneManager.pop();
            return;
        }
        // Block return from Icebush (map 1414) during story mode
        if ($gameMap.mapId() === 1414 && $gameSwitches.value(100)) {
            // playBuzzerSound is a Window_Base method; a Scene has to go through SoundManager,
            // and calling it on `this` threw instead of refusing the press.
            SoundManager.playBuzzer(); return;
        }
        // Planetside this entry is the landing-site picker, not a way home, and
        // inside the tower it is the lift: both answer inside the call below,
        // which is false only when the press opened a scene of its own or led
        // nowhere at all. The menu closes on everything else.
        if (!performReturnToWorldMap()) return;
        SceneManager.pop();
    };

    Scene_Menu.prototype.commandOpenWorldMap = function() {
        $gameTemp._pendingWorldMapCommand = 'open';
        SceneManager.pop();
    };

    Scene_Menu.prototype.commandToggleMinimap = function() {
        $gameTemp._pendingWorldMapCommand = 'toggleMinimap';
        SceneManager.pop();
    };

    Scene_Menu.prototype.commandGoDown = function() {
        $gameTemp._pendingWorldMapCommand = 'goDown';
        SceneManager.pop();
    };

    Scene_Menu.prototype.commandGoUp = function() {
        $gameTemp._pendingWorldMapCommand = 'goUp';
        SceneManager.pop();
    };

    Scene_Menu.prototype.commandStop = function() {
        // The 3D voxel world is up behind this menu. Out here "stop" means
        // leave that world and stand on the world map at the square actually
        // reached - NOT visit the square, which would generate a procedural map
        // under a party that never asked to walk into one. Same answer as the
        // travel page's "return to the world map" row above.
        if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive() &&
            window.VoxelWorldSystem.exitToWorldMap()) {
            SceneManager.pop();
            return;
        }
        performStopTravel();
        SceneManager.pop();
    };

    // ============================================================================
    // FURNITURE SYSTEM INTEGRATION
    // ----------------------------------------------------------------------------
    // The procedural map (procMapId, 636) is a single reused map that streams a
    // different biome tile for every world coordinate. FurnitureSystem stores
    // placed pieces keyed by "map", so without help every proc-map build would
    // share one bucket and leak across coordinates. This provider hands
    // FurnitureSystem a composite key - biome + world coordinate + underground
    // depth - so structures and furniture built on the procedural map are
    // remembered and restored only at the exact biome/world-coordinate where they
    // were placed. Each piece already stores its own x/y (proc-map coordinates),
    // so the full (biome, worldX, worldY, procX, procY) address is preserved.
    // Non-proc maps return null → FurnitureSystem falls back to the numeric id.
    // (WorldMapReturn loads before FurnitureSystem, so we seed the namespace here;
    // FurnitureSystem keeps this object and only adds to it.)
    // ============================================================================
    window.FurnitureSystem = window.FurnitureSystem || {};
    window.FurnitureSystem.mapKeyProvider = function(mapId) {
        if (mapId !== procMapId) return null;
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg || !pg.currentBiome) return null; // not generated yet
        const wx = $gameVariables.value(VAR_WORLD_X);
        const wy = $gameVariables.value(VAR_WORLD_Y);
        const depth = (pg.biomeLayerStack && pg.biomeLayerStack.length) || 0;
        // A structure generated off an entrance tile shares its biome, coordinate
        // and depth with every other structure of that kind on the square, so the
        // entrance salt joins the address: two cellars under one field are two
        // places, and what is carried out of one is still standing in the other.
        const sess = pg._dungeonSession;
        const salt = (sess && sess.salt) ? `:${sess.salt}` : '';
        return `proc:${pg.currentBiome}:${wx},${wy}:${depth}${salt}`;
    };

    // The tower's floors are not squares of the world: the party climbed into
    // them and the lift is the way back out, so Map/DungeonFloorSystem.js is
    // offered the request before the world map ever sees it. True means it took
    // the press and put the party at the elevator instead.
    function divertedToElevator() {
        const tower = window.DungeonFloors;
        return !!(tower && tower.returnToElevator && tower.returnToElevator());
    }

    // Is the party currently inside a procedural interior (dungeon, crypt, sewer,
    // loot cellar, cave den, temple, patron vault, underground layer)?
    function isProceduralInterior() {
        if ($gameMap.mapId() !== procMapId) return false;
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg) return false;
        if (pg._dungeonSession) {
            // Lower tower floors have their own elevator handling via divertedToElevator
            if (pg._dungeonSession.type === 'tower') return false;
            return true;
        }
        if (pg.biomeLayerStack && pg.biomeLayerStack.length > 0) return true;
        const D = window.ProcGenDungeon;
        const isStructure = (D && typeof D.isStructure === 'function')
            ? D.isStructure(pg.currentBiome)
            : /dungeon|crypt|sewer|lootcellar|templeinside|caveden|patronvault/i.test(pg.currentBiome || '');
        if (isStructure) return true;
        return false;
    }

    // Ascend / exit back to the surface when inside a procedural interior or underground layer
    function performReturnToSurface() {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (pg && pg._dungeonSession && pg._dungeonSession.type !== 'tower') {
            exitDungeonSession($gamePlayer.direction());
            return true;
        }
        if (pg && pg.biomeLayerStack && pg.biomeLayerStack.length > 0) {
            PluginManager.callCommand($gameMap._interpreter || {}, PLUGIN_PMT, 'goUp', {});
            return true;
        }
        PluginManager.callCommand($gameMap._interpreter || {}, PLUGIN_PMT, 'goUp', {});
        return true;
    }

    // True when the press was used up: a transfer reserved, or the tower or the
    // landing picker answering in the world map's place. False means nothing
    // happened and the caller should leave its own scene alone.
    function performReturnToWorldMap() {
        if (isReturnDisabled()) return false;
        if (divertedToLandingPicker()) return false;
        if (divertedToElevator()) return true;
        if (isProceduralInterior()) {
            return performReturnToSurface();
        }
        const saved = playerWorldCoords();
        if (saved.x === 0 && saved.y === 0) return false;
        $gamePlayer.reserveTransfer(worldMapId, saved.x, saved.y, 0, 0);
        return true;
    }

    // ============================================================================
    // NAMED PLACES ON THE WORLD MAP
    // ============================================================================
    // Every named place declares the world squares it stands on
    // (Destinations.json `reservedTiles`, or the single `base` square where it
    // declares no footprint). The pair below is that footprint, asked as a
    // question rather than walked over: which place owns this square, and how
    // is it entered from the side you came at it from.
    //
    // Written for the 3D world (VoxelWorld/*), which builds terrain over the
    // whole map and would otherwise drive straight across a hand-made town as
    // if it were open country. Everything here reads Destinations.json and
    // nothing else, so it answers the same on any map, in any scene.

    // The place that owns a world square, or null. `hand` is true for a place
    // with a hand-made map behind it (`procedural: false`): those are the ones
    // that cannot be generated and have to be walked into through their own
    // door.
    function placeAtWorldSquare(x, y) {
        const all = getWorldMapCoordinates();
        const coord = parseInt(x, 10) + ',' + parseInt(y, 10);
        for (const key in all) {
            const entry = all[key];
            if (!entry) continue;
            const reserved = Array.isArray(entry.reservedTiles) ? entry.reservedTiles : null;
            let on = false;
            if (reserved) on = reserved.includes(coord);
            else if (entry.base) {
                on = (parseInt(entry.base.x, 10) + ',' + parseInt(entry.base.y, 10)) === coord;
            }
            if (!on) continue;
            return { key, entry, name: entry.name || key, hand: entry.procedural === false };
        }
        return null;
    }

    // Where a place is entered, coming at it heading `dir` ('north' | 'south' |
    // 'east' | 'west'). The door authored for that side wins - a town with a
    // `coords` list has one per side, and each lands the party at the matching
    // EDGE of its own map, so walking south into it puts them at the top of it.
    // A place with one fixed `entrance` uses that from every side. Null where
    // there is no hand-made map to walk into at all.
    function placeEntranceFor(entry, dir) {
        if (!entry) return null;
        const coords = Array.isArray(entry.coords) ? entry.coords : null;
        let door = null;
        if (coords && dir) door = coords.find(c => c && c.direction === dir && c.id);
        if (!door && entry.entrance && entry.entrance.id) door = entry.entrance;
        if (!door && coords) door = coords.find(c => c && c.id);
        return door || null;
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    window.WorldMapReturn = {
        performVisitMap: performStopTravel,
        returnToWorldMap: performReturnToWorldMap,
        // <disableReturn> on the map's note: the T key and the menu row both
        // refuse, and the row is not drawn (UI/CustomMainMenuLayout.js asks too).
        isReturnDisabled,
        returnToSurface: performReturnToSurface,
        isProceduralInterior,
        enterProceduralSquareAt,
        // The named places and their footprints (see the section above).
        placeAtWorldSquare,
        placeEntranceFor,
        // Is this world square the footprint of a place with a hand-made map
        // behind it? Those squares hold a town nothing can generate, so the 3D
        // world refuses to build over them and walks the party in through the
        // place's own door instead (VoxelWorld/VoxelWorldScene.js).
        isHandPlaceSquare(x, y) {
            const at = placeAtWorldSquare(x, y);
            return !!(at && at.hand && placeEntranceFor(at.entry, null));
        },
        worldMapId,
        procMapId,
        // The name to file a place under (Assets menu, delivery targets, ...).
        // Always use this instead of $dataMapInfos[id].name: the procedural map
        // is reused for the whole world and would otherwise read as
        // "ProceduralRoom" everywhere. Pass the world coordinates the record
        // was made at, or omit them for the party's current square.
        placeName,
        currentPlaceName() { return placeName($gameMap ? $gameMap.mapId() : 0); },
        // Re-apply the current map's biome ambience/music. Exposed so plugins
        // that move the player without a normal map load (the procedural house
        // system's floor changes, for one) can refresh the audio themselves.
        updateBiomeAudio,
        // Biome track selection, exposed for debugging and for anything that
        // wants to know what a biome sounds like without playing it.
        pickBiomeTrack,
        biomeTrackPool,
        currentNationId,
        // The procedural square the party is standing on, saved and put back.
        // Anything that takes them off map 636 into a submap and later returns
        // them must use these, so every route back rebuilds the SAME square:
        // ProceduralHouseSystem for interiors and tower floors, this plugin's own
        // forced-biome structures for cellars, sewers, temples, dens and vaults.
        snapshotProcSurface,
        restoreProcSurface,
        // Put the square's own tileset back on map 636. Exposed for anything that
        // lays tiles on $dataMap itself rather than going through the load hook.
        syncProcSurfaceTileset,
        // The same pair, in the form a respawn point stores and puts back: no
        // tiles (they are rebuilt), no descent and no structure session. Used by
        // everything that registers where a death sends the party back to.
        snapshotProcRespawn,
        restoreProcRespawn
    };

    // ========================================================================
    // EARTH IS GONE
    // ------------------------------------------------------------------------
    // On 21 December 2012 Nibiru struck the Earth (GalaxySim.Nibiru), switch 199
    // went up, and the world map stopped existing. Map 315 is still in the data
    // and half the game still asks for it: every "return to the world map", the
    // border of every procedural square, every parked vehicle, every fast-travel
    // arrival, every origin the wizard hands out. Rather than teach all of them
    // that the planet is gone, the answer is given once, here, at the one door
    // they all go through: a transfer to 315 arrives at the Omega Tower instead,
    // which is the only ground left.
    //
    // The tower is a real authored map (635, "Stairs Hall", <MapGroup:
    // OmegaTower>), so this is a redirect and not a special case: everything
    // downstream carries on with an ordinary map id.
    // ========================================================================
    const SW_EARTH_LOST = 199;
    const TOWER_LANDING = { mapId: 635, x: 13, y: 38, dir: 8 };

    function earthLost() {
        return !!(typeof $gameSwitches !== 'undefined' && $gameSwitches &&
                  $gameSwitches.value(SW_EARTH_LOST));
    }
    // A fresh copy every time: callers write their own direction/fade onto it.
    function towerLanding() { return Object.assign({}, TOWER_LANDING); }
    // Is this transfer one the tower has to answer for?
    function redirectsToTower(mapId) {
        return Number(mapId) === worldMapId && earthLost();
    }

    // The one door. Every transfer in the engine is reserved here - the editor's
    // Transfer Player command, every plugin, every menu - so this is the only
    // place the redirect has to live.
    const _WMR_Game_Player_reserveTransfer = Game_Player.prototype.reserveTransfer;
    Game_Player.prototype.reserveTransfer = function (mapId, x, y, d, fadeType) {
        if (redirectsToTower(mapId)) {
            const t = TOWER_LANDING;
            return _WMR_Game_Player_reserveTransfer.call(this, t.mapId, t.x, t.y, t.dir, fadeType);
        }
        return _WMR_Game_Player_reserveTransfer.call(this, mapId, x, y, d, fadeType);
    };

    // A vehicle parked on a planet that is not there any more is parked at the
    // tower, so it is still reachable and still boardable.
    const _WMR_Game_Vehicle_setLocation = Game_Vehicle.prototype.setLocation;
    Game_Vehicle.prototype.setLocation = function (mapId, x, y) {
        if (redirectsToTower(mapId)) {
            const t = TOWER_LANDING;
            return _WMR_Game_Vehicle_setLocation.call(this, t.mapId, t.x, t.y);
        }
        return _WMR_Game_Vehicle_setLocation.call(this, mapId, x, y);
    };

    // The backstop. Anything that puts the party on 315 without reserving a
    // transfer (a savegame written there before the impact, a plugin setting the
    // position outright) is caught the moment the map is up and moved on. The
    // reserve above cannot loop through this: it names 635, never 315.
    const _WMR_Scene_Map_onMapLoaded_earthLost = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _WMR_Scene_Map_onMapLoaded_earthLost.call(this);
        if ($gameMap && $gameMap.mapId() === worldMapId && earthLost() &&
            !$gamePlayer.isTransferring()) {
            const t = TOWER_LANDING;
            $gamePlayer.reserveTransfer(t.mapId, t.x, t.y, t.dir, 0);
        }
    };

    // ============================================================================
    // WINDOW.WORLDMAPTRANSFER
    // ----------------------------------------------------------------------------
    // The unified coordinate service. Nothing outside this file should read
    // Variables 43/44, parse a <Coords> tag or reach into _procGenData to work out
    // where something is: ask here instead, so one rule answers for the world map,
    // the reused procedural map, its underground layers, its interiors, the
    // authored maps and an alien planet's landing grid alike.
    // ============================================================================
    window.WorldMapTransfer = {
        worldMapId,
        procMapId,
        // The editor template's <Coords> pair, read as "unset" everywhere.
        TEMPLATE_COORDS,

        // --- the party ---
        playerWorld: playerWorldCoords,
        setPlayerWorld: setPlayerWorldCoords,
        // Re-derive the party's world square from a map. Called on every map load;
        // exposed so a plugin that moves them without one can do the same.
        syncPlayerWorld: syncPlayerWorldCoords,

        // --- addressing ---
        // The full address of a tile on the map loaded now (the party's own tile
        // when none is given), and of a tile on any other map.
        locate,
        locateOnMap,
        // Do two addresses sit in the same realm (same planet, cave floor and
        // interior)? A world square alone does not decide it: a dungeon, the cave
        // under it and the field above all share one map id and one square.
        sameRealm,
        // The world-map square a map stands on, with and without a loaded map.
        currentWorldCoords,
        worldCoordsForMap,
        // A map's declared <Coords>, or null when it declares nothing usable.
        mapCoordsTag,
        currentLayer: currentLayerDepth,
        currentInterior: currentInteriorName,
        isAlienSurface: isAlienSurfaceNow,
        currentPlanet: currentPlanetName,

        // --- naming ---
        // What a location is called, and one line naming it with its exact tile.
        locationName,
        describeLocation,
        placeName,

        // --- after the impact ---
        // Has Earth been struck out (switch 199)? Anything that would send the
        // party, a vehicle or a menu to map 315 must ask this rather than test
        // the switch itself, and `towerLanding()` is the one address that
        // replaces it: { mapId, x, y, dir }.
        earthLost,
        towerLanding
    };


    // ── The minimap, as an options row ──────────────────────────────────────
    // The corner minimap used to be toggled from the World Map submenu, which
    // no longer exists: the pocket opens the map itself. Its state lives on
    // $gameSystem (Map/WorldMap.js), so the row is only meaningful in a running
    // game and simply reads as off on the title screen.
    // The row is a three way selector rather than a switch: the minimap can be
    // off, drawn only while the party explores a generated map or a planet's
    // landing grid (the default), or drawn everywhere. The modes themselves
    // live in Map/WorldMap.js, which is the only place that decides when the
    // corner map is allowed on screen.
    if (window.GameOptions && typeof window.GameOptions.registerOption === 'function') {
        const minimapModes = () => (window.WorldMapView && window.WorldMapView.minimapModes)
            ? window.WorldMapView.minimapModes() : ['off', 'exploring', 'always'];
        const currentMinimapMode = () => (window.WorldMapView && window.WorldMapView.minimapMode)
            ? window.WorldMapView.minimapMode() : 'exploring';
        const applyMinimapMode = (mode) => {
            if (window.WorldMapView && window.WorldMapView.setMinimapMode) {
                window.WorldMapView.setMinimapMode(mode);
            }
        };
        const cycleMinimapMode = (step) => {
            const modes = minimapModes();
            const at = Math.max(0, modes.indexOf(currentMinimapMode()));
            applyMinimapMode(modes[(at + step + modes.length) % modes.length]);
        };
        window.GameOptions.registerOption('worldMinimap', () => T('WorldMapReturn.minimapOption'),
            () => currentMinimapMode(),
            (value) => applyMinimapMode(value),
            'video', 'boolean',
            (value) => {
                const modes = minimapModes();
                const labels = T.list('WorldMapReturn.minimapModes');
                const at = Math.max(0, modes.indexOf(value));
                return labels[at] || labels[0] || modes[at];
            },
            function () { cycleMinimapMode(1); },
            function () { cycleMinimapMode(-1); });
    }

})();
