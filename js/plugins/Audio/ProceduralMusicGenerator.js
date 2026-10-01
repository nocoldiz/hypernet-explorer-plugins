/*:
 * @target MZ
 * @plugindesc [v1.1] Programmatic, Reactive Procedural Music Generator based on Strudel.
 * @author Omni-Lex
 * 
 * @param sf2Filename
 * @text SoundFont Filename
 * @desc The filename of the .sf2 file in audio/soundfonts/
 * @default TimGM6mb.sf2
 *
 * @param usePregenerated
 * @text Use Pregenerated Music
 * @desc If true, tries to load Strudel files from audio/bgm/Strudel/ instead of generating live.
 * @type boolean
 * @default false
 *
 * @param exportOnGenerate
 * @text Export on Generate
 * @desc If true, saves the generated patterns as Strudel files in audio/bgm/Strudel/ when biomes change.
 * @type boolean
 * @default false
 *
 * @param generateAllOnStartup
 * @text Generate All on Startup
 * @desc If true, force generates all biome files with a random seed on game start.
 * @type boolean
 * @default false
 * 
 * @param useClassicSequencer
 * @text Use Classic Sequencer
 * @desc If true, uses the classic track-based sequencer instead of the Strudel cycle sequencer.
 * @type boolean
 * @default false
 *
 * @help
 * ProceduralMusicGenerator.js
 * 
 * This plugin generates reactive music based on game state (Battle, Weather, Puzzles).
 * It depends on ProceduralMusicUtils.js.
 * 
 * BATTLE ELEMENTS:
 * 1: Physical, 2: Fire, 3: Ice, 4: Thunder, 5: Water, 6: Petro, 7: Wind, 8: Sacred, 9: Cursed
 */

(() => {
    'use strict';

    if (!window.StrudelUtils) {
        console.error("ProceduralMusicGenerator: StrudelUtils.js not found!");
        return;
    }

    const { StrudelEngine, cyrb128, sfc32 } = window.StrudelUtils;
    const pluginName = 'ProceduralMusicGenerator';
    const parameters = PluginManager.parameters(pluginName);
    const SF2_FILENAME = parameters.sf2Filename || 'TimGM6mb.sf2';
    const USE_PREGENERATED = parameters.usePregenerated === 'true';
    const EXPORT_ON_GENERATE = parameters.exportOnGenerate === 'true';
    const GENERATE_ALL_ON_STARTUP = parameters.generateAllOnStartup === 'true';
    const USE_CLASSIC_SEQUENCER = parameters.useClassicSequencer === 'true';
 
    class MusicManager {
        constructor() {
            this.engine = new StrudelEngine();
            this.currentGenre = 'Exploration';
            this.activeElements = new Set();
            this._seedStr = "";
            this._prng = null;
            this._patternStrings = {}; // Store original strings for export
            
            // Classic Sequencer
            this.useClassicSequencer = USE_CLASSIC_SEQUENCER;
            this._classicSong = null; // Stores currently generated classic song
            
            // State for reactivity
            this.intensity = 0.5;
            this.hpFactor = 1.0;
            this.weather = "clear";
            this.timeOfDay = "day";
            this.puzzlesSolved = 0;
            
            this._isStarted = false;
            this._isManualSelection = false;
            this._proceduralGenres = [
                'Battle', 'Dungeon', 'Exploration', 'Village', 'City', 
                'Cave', 'Desert', 'Ice', 'Digital', 'Eldritch', 
                'Industrial', 'Ethereal'
            ];
            this._transitionPhase = 0; // 0: None, 1: Fade Out, 2: Fade In
            this._fadeVolume = 1.0;
            this._transitionDuration = 30; // frames
        }

        async init() {
            await this.engine.init(SF2_FILENAME);
            this.refreshSeed();
            if (GENERATE_ALL_ON_STARTUP) {
                console.log("ProceduralMusicGenerator: Forcing startup pregeneration...");
                this.pregenerateAllBiomes(true); // true to force random seed
            }
        }

        refreshSeed(customSeed = null) {
            const actor = $gameParty ? $gameParty.members()[0] : null;
            const actorName = actor ? actor.name() : "Dungeon";
            
            if (customSeed) {
                this._seedStr = customSeed;
            } else if (actorName === "Test") {
                this._seedStr = "Test_" + Math.random().toString(36).substring(7);
            } else {
                this._seedStr = actorName;
            }

            const seedArr = cyrb128(this._seedStr);
            this._prng = sfc32(seedArr[0], seedArr[1], seedArr[2], seedArr[3]);
            this.engine.prng = this._prng; // Sync PRNG with engine
            console.log(`ProceduralMusicGenerator: Seeded with "${this._seedStr}"`);
            // Do NOT call updatePatterns here to prevent auto-generation on startup
        }

        update() {
            if (!this.shouldPlay()) {
                if (this._isStarted) {
                    this.engine.stop();
                    this._isStarted = false;
                }
                return;
            }

            if (!this.engine._initialized) {
                if (WebAudio._context && !this.engine._initializing) this.init();
                return;
            }

            if (this.shouldPlay()) {
                this.updateState();
                
                // Handle smooth transition
                if (this._transitionPhase === 0) {
                    if (this.needsRebuild()) {
                        this._transitionPhase = 1;
                    }
                } else if (this._transitionPhase === 1) {
                    this._fadeVolume = Math.max(0, this._fadeVolume - 1 / this._transitionDuration);
                    if (this._fadeVolume <= 0) {
                        this.updatePatterns().then(() => {
                            this._transitionPhase = 2;
                        });
                    }
                } else if (this._transitionPhase === 2) {
                    this._fadeVolume = Math.min(1.0, this._fadeVolume + 1 / this._transitionDuration);
                    if (this._fadeVolume >= 1.0) {
                        this._transitionPhase = 0;
                    }
                }

                if (!this._isStarted && this.engine._initialized) {
                    this.engine.start();
                    this._isStarted = true;
                }
            } else {
                if (this._isStarted) {
                    this.engine.stop();
                    this._isStarted = false;
                }
            }

            // Sync volume
            if (typeof AudioManager !== 'undefined' && this.engine._masterGain) {
                const vol = (AudioManager.bgmVolume / 100) * 0.8 * this._fadeVolume;
                if (Math.abs(this.engine._masterGain.gain.value - vol) > 0.01) {
                    this.engine._masterGain.gain.setTargetAtTime(vol, this.engine._audioContext.currentTime, 0.1);
                }
            }
        }

        shouldPlay() {
            // Only play if manually selected (e.g. from Music Player)
            return this._isManualSelection;
        }

        needsRebuild() {
            const hpThreshold = 0.05;
            const hpChanged = Math.abs(this.hpFactor - (this._lastHpFactor || 0)) > hpThreshold;
            const weather = $gameWeather ? $gameWeather.currentWeatherType : "none";
            const puzzles = this.puzzlesSolved;
            
            const changed = (this.currentGenre !== this._lastGenre && this.currentGenre !== "Transition") ||
                            puzzles !== this._lastPuzzlesSolved ||
                            weather !== this._lastWeather ||
                            hpChanged;

            if (changed) {
                this._lastGenre = this.currentGenre;
                this._lastPuzzlesSolved = puzzles;
                this._lastWeather = weather;
                this._lastHpFactor = this.hpFactor;
            }
            return changed;
        }


        updateState() {
            if (this._isManualSelection) return;
            // HP Factor (Battle tension)
            const leader = $gameParty ? $gameParty.leader() : null;
            if (leader) {
                this.hpFactor = leader.hp / leader.mhp;
            }

            // Puzzles
            if (window.$gameMap && window.$gameMap._puzzleData) {
                this.puzzlesSolved = window.$gameMap._puzzleData.solvedCount || 0;
            }

            // Genre Detection
            if ($gameParty && $gameParty.inBattle()) {
                this.currentGenre = 'Battle';
            } else {
                this.currentGenre = this.detectBiomeGenre();
            }
        }


        detectBiomeGenre() {
            let biomeName = "";
            
            if ($gameSystem && $gameSystem._procGenData) {
                biomeName = $gameSystem._procGenData.currentBiome || $gameSystem._procGenData.currentBiomeName || "";
            } 
            // 2. Check Static Map Tags (<Biome:Name>)
            else if ($dataMap && $dataMap.meta && $dataMap.meta.Biome) {
                biomeName = $dataMap.meta.Biome;
            }
            // 3. Fallback to Map Display Name keywords
            else if ($dataMap) {
                const mapName = $dataMap.displayName || "";
                if (mapName.includes("City")) biomeName = "City";
                else if (mapName.includes("Village")) biomeName = "Village";
                else if (mapName.includes("Dungeon") || mapName.includes("Forest")) biomeName = "Dungeon";
                else if (mapName.includes("Cave")) biomeName = "Cave";
            }

            // Mapping Biome to Genre
            const mapping = {
                // Exploration Biomes
                'Fields': 'Exploration',
                'Meadows': 'Exploration',
                'ForestTropical': 'Exploration',
                'Highlands': 'Exploration',
                'Jungle': 'Exploration',
                'Lake': 'Exploration',
                'Mangrove': 'Exploration',
                'Mountain': 'Exploration',
                'Ocean': 'Exploration',
                'Park': 'Exploration',
                'River': 'Exploration',
                'River vertical': 'Exploration',
                'River horizontal': 'Exploration',
                'River cross': 'Exploration',
                'RiverBank': 'Exploration',
                'Road': 'Exploration',
                'Road vertical': 'Exploration',
                'Road horizontal': 'Exploration',
                'Road cross': 'Exploration',
                'Road t-up': 'Exploration',
                'Road t-down': 'Exploration',
                'Road t-left': 'Exploration',
                'Road t-right': 'Exploration',
                'Steppe': 'Exploration',
                'Taiga': 'Exploration',

                // Dungeon Biomes
                'Abandoned': 'Dungeon',
                'AbandonedInside': 'Dungeon',
                'Castle': 'Dungeon',
                'CastleInside': 'Dungeon',
                'Dungeon': 'Dungeon',
                'Lair': 'Dungeon',
                'Ruins': 'Dungeon',

                // Cave Biomes
                'Cave': 'Cave',
                'CaveFlooded': 'Cave',
                'Mines': 'Cave',
                'Sewer': 'Cave',
                'Swamp': 'Cave',

                // City Biomes
                'City': 'City',
                'Burg': 'City',
                'Office': 'City',
                'Hospital': 'City',
                'Clinic': 'City',
                'GroceryStore': 'City',
                'HardwareStore': 'City',
                'Store': 'City',
                'Restaurant': 'City',

                // Village Biomes
                'Village': 'Village',
                'Docks': 'Village',
                'Farm': 'Village',
                'Houses': 'Village',
                'HousesInside': 'Village',
                'Farmhouse': 'Village',
                'Tavern': 'Village',
                'Villa': 'Village',
                'VillageMountain': 'Village',
                'VillageRiver': 'Village',
                'VillageSea': 'Village',

                // Desert Biomes
                'Badlands': 'Desert',
                'Canyon': 'Desert',
                'Desert': 'Desert',
                'MountainDesert': 'Desert',
                'SaltFlats': 'Desert',
                'Savannah': 'Desert',
                'VillageDesert': 'Desert',
                'BurgDesert': 'Desert',

                // Ice Biomes
                'CaveIce': 'Ice',
                'CityIce': 'Ice',
                'BurgIce': 'Ice',
                'ForestIce': 'Ice',
                'Ice': 'Ice',
                'Snow': 'Ice',
                'Permafrost': 'Ice',
                'Tundra': 'Ice',
                'MountainIce': 'Ice',
                'VillageIce': 'Ice',

                // Digital Biomes
                'Abstract': 'Digital',
                'Digital': 'Digital',
                'Glitch': 'Digital',
                'Highway': 'Digital',
                'Laboratory': 'Digital',
                'Space': 'Digital',
                'Spacecenter': 'Digital',
                'OmegaTower': 'Digital',

                // Eldritch Biomes
                'AlienPlanet': 'Eldritch',
                'Crypt': 'Eldritch',
                'Eldritch': 'Eldritch',
                'Graveyard': 'Eldritch',
                'Hell': 'Eldritch',
                'Underdark': 'Eldritch',
                'Horror': 'Eldritch',

                // Industrial Biomes
                'Factory': 'Industrial',
                'FactoryInside': 'Industrial',
                'Industrial': 'Industrial',
                'Landfill': 'Industrial',
                'Metro': 'Industrial',
                'Train': 'Industrial',
                'Volcano': 'Industrial',

                // Ethereal Biomes
                'ChurchInside': 'Ethereal',
                'Crystals': 'Ethereal',
                'Dreamscape': 'Ethereal',
                'Fairy': 'Ethereal',
                'Heaven': 'Ethereal',
                'Limbo': 'Ethereal',
                'Mushroom': 'Ethereal',
                'SpiritWoods': 'Ethereal',
                'Temple': 'Ethereal',
                'TempleShinto': 'Ethereal',

                // Battle Biomes
                'Arena': 'Battle'
            };

            const genre = mapping[biomeName] || 'Exploration';
            return genre;
        }

        isBiome(name) {
            const biomes = [
                'Battle', 'Dungeon', 'Exploration', 'Village', 'City', 
                'Cave', 'Desert', 'Ice', 'Digital', 'Eldritch', 
                'Industrial', 'Ethereal'
            ];
            return biomes.includes(name);
        }

        selectGenre(genre) {
            if (genre === 'Auto') {
                this._isManualSelection = false;
                this.currentGenre = this.detectBiomeGenre();
            } else if (this.isBiome(genre)) {
                this.currentGenre = genre;
                this._isManualSelection = true;
                // Stop MIDI if playing
                if (this.engine._midiIsPlaying) this.engine.stopMidi();
                
                if (this.useClassicSequencer) {
                    this.engine.stopAllNotes();
                    this.buildClassicSong();
                    if (this.engine._initialized) {
                        this.engine.start();
                        this._isStarted = true;
                    }
                    return;
                }

                // Stop Strudel patterns
                this.engine.patterns = {};
                this._patternStrings = {};
                // buildCurrentGenre and exportToStrudel are the names this had before the
                // move from Strudel patterns to the classic sequencer, and neither exists any
                // more. buildClassicSong does both jobs: it picks the generator for the genre
                // and calls exportClassicSongToMidi itself.
                this.buildClassicSong();
                if (this.engine._initialized) {
                    this.engine.start();
                    this._isStarted = true;
                }
            } else {
                // Non-biome track: just play from file
                this.currentGenre = genre;
                this._isManualSelection = true;
                this.playStrudelFile(genre, 'Strudel');
            }
        }

        async updatePatterns() {
            if (!this.engine._initialized) return;
            
            // Clear old patterns/sequences
            this.engine.patterns = {};
            this._patternStrings = {};
            this.engine.stopAllNotes();

            if (this.useClassicSequencer && this.isBiome(this.currentGenre)) {
                console.log(`ProceduralMusicGenerator: Generating classic song for "${this.currentGenre}"...`);
                this.buildClassicSong();
                return;
            }

            // If on map and using pregenerated, load file from Biomes first.
            if (USE_PREGENERATED && !this._isManualSelection && this.currentGenre !== 'Manual') {
                console.log(`ProceduralMusicGenerator: Loading pregenerated "${this.currentGenre}"...`);
                const success = await this.playStrudelFile(this.currentGenre, 'Biomes');
                if (success) {
                    this.engine.start();
                    this._isStarted = true;
                    return;
                }
                // Fallback to Strudel
                const successStrudel = await this.playStrudelFile(this.currentGenre, 'Strudel');
                if (successStrudel) {
                    this.engine.start();
                    this._isStarted = true;
                    return;
                }
                
                console.warn(`ProceduralMusicGenerator: Pregenerated file for "${this.currentGenre}" not found. Falling back to live generation.`);
            }

            // Only build patterns if we are in manual selection mode (Music Player) 
            // OR if pregenerated loading failed (and we allow fallback)
            if (!this._isManualSelection && USE_PREGENERATED) return;
            if (!this._isManualSelection && !this._isStarted && this.currentGenre) {
                 // If we are on map and NOT using pregenerated, we don't build either
                 return;
            }

            // Clear old patterns
            this.engine.patterns = {};
            this._patternStrings = {};
            this.engine.stopAllNotes();

            console.log(`ProceduralMusicGenerator: Generating live patterns for "${this.currentGenre}"...`);
            // Same rename as above: buildClassicSong replaced buildCurrentGenre.
            this.buildClassicSong();
        }



        buildClassicSong() {
            if (!this.isBiome(this.currentGenre)) return;
            
            const rng = this.getSeededRng(this.currentGenre);
            
            if (this.currentGenre === 'Battle') {
                this._classicSong = this.generateTranceBreakcore(rng);
            } else if (this.currentGenre === 'Village' || this.currentGenre === 'Ethereal') {
                this._classicSong = this.generateMedievalSoundtrack(this.currentGenre, rng);
            } else if (this.currentGenre === 'Dungeon' || this.currentGenre === 'Eldritch') {
                this._classicSong = this.generateGothicSoundtrack(this.currentGenre, rng);
            } else if (this.currentGenre === 'Digital' || this.currentGenre === 'Industrial') {
                this._classicSong = this.generateCyberwaveSoundtrack(this.currentGenre, rng);
            } else if (this.currentGenre === 'Cave' || this.currentGenre === 'Exploration') {
                this._classicSong = this.generateOceanicSoundtrack(this.currentGenre, rng);
            } else {
                this._classicSong = this.generateDaggerfallSoundtrack(this.currentGenre, rng);
            }
            
            this.exportClassicSongToMidi();
            
            if (this.engine._isRunning) {
                this.engine.classicSequencer.setSong(this._classicSong);
                this.engine.classicSequencer.start(this._classicSong.bpm);
            }
        }

        exportClassicSongToMidi() {
            if (!this._classicSong) return;
            
            const song = this._classicSong;
            const ticksPerQuarter = 96;
            const ticksPerStep = (song.bpm > 150) ? 12 : 24; 

            const writeVarLength = (value) => {
                let buffer = [];
                let bufferVal = value & 0x7F;
                while ((value >>= 7) > 0) {
                    buffer.push(bufferVal | 0x80);
                    bufferVal = value & 0x7F;
                }
                buffer.push(bufferVal);
                return buffer.reverse();
            };

            let header = [
                0x4d, 0x54, 0x68, 0x64, // "MThd"
                0x00, 0x00, 0x00, 0x06, // Length = 6
                0x00, 0x01,             // Format = 1 (multiple tracks)
                0x00, 0x00,             // Number of tracks (will set below)
                0x00, 0x60              // Division = 96 ticks per quarter note
            ];

            const tracksBytes = [];

            // Track 0: Conductor (Tempo)
            const tempoMicro = Math.floor(60000000 / song.bpm);
            const t1 = (tempoMicro >> 16) & 0xFF;
            const t2 = (tempoMicro >> 8) & 0xFF;
            const t3 = tempoMicro & 0xFF;

            let conductorData = [];
            conductorData.push(0x00, 0xFF, 0x51, 0x03, t1, t2, t3);
            conductorData.push(0x00, 0xFF, 0x2F, 0x00);
            tracksBytes.push(conductorData);

            // Music Tracks
            const totalLoops = 4;
            
            song.tracks.forEach(track => {
                const channel = track.channel;
                const program = track.program || 0;
                const bank = track.bank || 0;
                const trackEvents = [];
                
                trackEvents.push({ tick: 0, bytes: [0xB0 | channel, 0x00, bank] });
                trackEvents.push({ tick: 0, bytes: [0xB0 | channel, 0x20, 0x00] });
                trackEvents.push({ tick: 0, bytes: [0xC0 | channel, program] });
                
                const pan = track.pan !== undefined ? track.pan : 0.5;
                trackEvents.push({ tick: 0, bytes: [0xB0 | channel, 0x0A, Math.floor(pan * 127)] });
                
                const reverb = track.reverb !== undefined ? track.reverb : 0.5;
                trackEvents.push({ tick: 0, bytes: [0xB0 | channel, 0x5B, Math.floor(reverb * 127)] });

                const seqLength = track.notes.length;
                
                for (let l = 0; l < totalLoops; l++) {
                    for (let step = 0; step < seqLength; step++) {
                        const notesAtStep = track.notes[step];
                        if (!notesAtStep || notesAtStep === '~') continue;
                        
                        const noteList = Array.isArray(notesAtStep) ? notesAtStep : [notesAtStep];
                        const absoluteStep = l * seqLength + step;
                        const stepStartTick = absoluteStep * ticksPerStep;
                        
                        noteList.forEach(noteData => {
                            if (noteData === '~' || !noteData) return;
                            
                            let pitch, velocity = 80, durationSteps = 1;
                            if (typeof noteData === 'object') {
                                pitch = noteData.note;
                                velocity = noteData.velocity !== undefined ? noteData.velocity : 80;
                                durationSteps = noteData.duration !== undefined ? noteData.duration : 1;
                            } else if (typeof noteData === 'number') {
                                pitch = noteData;
                            } else {
                                return;
                            }
                            
                            const startTick = stepStartTick;
                            const endTick = startTick + durationSteps * ticksPerStep;
                            
                            trackEvents.push({ tick: startTick, bytes: [0x90 | channel, pitch, velocity] });
                            trackEvents.push({ tick: endTick, bytes: [0x80 | channel, pitch, 0x40] });
                        });
                    }
                }

                trackEvents.sort((a, b) => a.tick - b.tick);

                let currentTick = 0;
                let encodedTrack = [];
                trackEvents.forEach(ev => {
                    const delta = ev.tick - currentTick;
                    currentTick = ev.tick;
                    encodedTrack.push(...writeVarLength(delta));
                    encodedTrack.push(...ev.bytes);
                });

                encodedTrack.push(...writeVarLength(0));
                encodedTrack.push(0xFF, 0x2F, 0x00);
                tracksBytes.push(encodedTrack);
            });

            header[10] = (tracksBytes.length >> 8) & 0xFF;
            header[11] = tracksBytes.length & 0xFF;

            let finalBytes = [...header];
            tracksBytes.forEach(trackData => {
                const len = trackData.length;
                const len1 = (len >> 24) & 0xFF;
                const len2 = (len >> 16) & 0xFF;
                const len3 = (len >> 8) & 0xFF;
                const len4 = len & 0xFF;
                
                finalBytes.push(
                    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
                    len1, len2, len3, len4,
                    ...trackData
                );
            });

            if (typeof require !== 'undefined') {
                const fs = require('fs');
                const path = require('path');
                try {
                    const biomesDir = path.join(process.cwd(), 'audio', 'bgm', 'Biomes');
                    if (!fs.existsSync(biomesDir)) {
                        fs.mkdirSync(biomesDir, { recursive: true });
                    }
                    const filePath = path.join(biomesDir, `${this.currentGenre}.mid`);
                    fs.writeFileSync(filePath, Buffer.from(finalBytes));
                    console.log(`ProceduralMusicGenerator: Saved classic sequencer track to MIDI: ${filePath}`);
                } catch (e) {
                    console.error("ProceduralMusicGenerator: Failed to save classic MIDI file", e);
                }
            }
        }

        getSeededRng(genreName) {
            const seedText = this._seedStr + "_" + genreName;
            const seedArr = cyrb128(seedText);
            return sfc32(seedArr[0], seedArr[1], seedArr[2], seedArr[3]);
        }

        generateMedievalSoundtrack(genre, rng) {
            const bpm = Math.floor(82 + rng() * 12); // 82 to 94 BPM
            const root = 55; // G3: standard folk key
            const scale = [0, 2, 4, 5, 7, 9, 10]; // G Mixolydian (folk medieval feel)
            const getScaleNote = (degree) => {
                const octave = Math.floor(degree / scale.length);
                const idx = ((degree % scale.length) + scale.length) % scale.length;
                return root + octave * 12 + scale[idx];
            };

            // Progression: I - v - IV - I (Mixolydian folk)
            const chordDegrees = [0, 4, 3, 0];
            const numBars = 4;
            const stepsPerBar = 16;
            const totalSteps = numBars * stepsPerBar; // 64 steps

            // Chords Pad (Lute/Guitar chords on Harpsichord/Strings)
            const chords = [];
            for (let bar = 0; bar < numBars; bar++) {
                const deg = chordDegrees[bar % chordDegrees.length];
                chords.push({
                    degree: deg,
                    root: getScaleNote(deg),
                    third: getScaleNote(deg + 2),
                    fifth: getScaleNote(deg + 4),
                    octaveBass: getScaleNote(deg - 7)
                });
            }

            // Pad notes (Nylon Acoustic Guitar strum style: dynamic slight offsets)
            const padNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                padNotes[bar * stepsPerBar] = [
                    { note: ch.root, velocity: 55, duration: 16 },
                    { note: ch.third, velocity: 50, duration: 16 },
                    { note: ch.fifth, velocity: 52, duration: 16 }
                ];
            }

            // Arpeggiator (Pizzicato / Harpsichord Lute-plucking)
            const arpNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                // folk style triplet arpeggios
                for (let step = 0; step < stepsPerBar; step++) {
                    const absoluteStep = startStep + step;
                    if (step % 4 === 0) {
                        arpNotes[absoluteStep] = { note: ch.root + 12, velocity: 65, duration: 2 };
                    } else if (step % 4 === 2) {
                        arpNotes[absoluteStep] = { note: ch.third + 12, velocity: 55, duration: 2 };
                    } else if (step % 4 === 3) {
                        arpNotes[absoluteStep] = { note: ch.fifth + 12, velocity: 60, duration: 1 };
                    }
                }
            }

            // Lead Melody (Recorder / Flute question-answer period)
            const leadNotes = new Array(totalSteps).fill('~');
            let currentDeg = 4; // Start on fifth
            const rhythmProfile = [true, false, true, true, false, true, true, false]; // 8 steps

            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                const isConsequent = (bar >= 2);
                
                for (let r = 0; r < 2; r++) {
                    const motifStart = startStep + r * 8;
                    for (let s = 0; s < 8; s++) {
                        const absoluteStep = motifStart + s;
                        if (rhythmProfile[s]) {
                            if (s === 0) {
                                currentDeg = ch.degree;
                            } else if (s % 4 === 0) {
                                currentDeg = ch.degree + 4;
                            } else {
                                currentDeg += (rng() > 0.5 ? 1 : -1);
                            }

                            // Cadential resolution
                            if (isConsequent && absoluteStep >= 60) {
                                currentDeg = 0; // tonic
                            } else if (!isConsequent && absoluteStep >= 28 && absoluteStep < 32) {
                                currentDeg = 4; // half cadence tension
                            }

                            if (currentDeg < 0) currentDeg = 0;
                            if (currentDeg > 14) currentDeg = 14;

                            leadNotes[absoluteStep] = {
                                note: getScaleNote(currentDeg + 12),
                                velocity: 75 + Math.floor(rng() * 15),
                                duration: 2
                            };
                        }
                    }
                }
            }

            // Bassline (Acoustic Contrabass or pizzicato root/fifth bounce)
            const bassNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                bassNotes[startStep] = { note: ch.octaveBass, velocity: 70, duration: 6 };
                bassNotes[startStep + 8] = { note: getScaleNote(ch.degree + 4 - 7), velocity: 60, duration: 6 };
            }

            return {
                bpm: bpm,
                tracks: [
                    { channel: 0, bank: 0, program: 24, notes: padNotes, pan: 0.3, reverb: 0.5 }, // Nylon Guitar Pad
                    { channel: 1, bank: 0, program: 45, notes: arpNotes, pan: 0.7, reverb: 0.6 }, // Pizzicato Lute
                    { channel: 2, bank: 0, program: 74, notes: leadNotes, pan: 0.5, reverb: 0.7 }, // Recorder Lead
                    { channel: 3, bank: 0, program: 43, notes: bassNotes, pan: 0.5, reverb: 0.4 }  // Acoustic Bass
                ]
            };
        }

        generateGothicSoundtrack(genre, rng) {
            const bpm = Math.floor(64 + rng() * 8); // 64 to 72 BPM (grave, slow)
            const root = 57; // A3 (Minor key of dark majesty)
            const scale = [0, 2, 3, 5, 7, 8, 11]; // A Harmonic Minor (classical gothic tension)
            const getScaleNote = (degree) => {
                const octave = Math.floor(degree / scale.length);
                const idx = ((degree % scale.length) + scale.length) % scale.length;
                return root + octave * 12 + scale[idx];
            };

            // Progression: i - VI - iiø7 - V7b9 (epic minor progression)
            const chordDegrees = [0, 5, 1, 4];
            const numBars = 4;
            const stepsPerBar = 16;
            const totalSteps = numBars * stepsPerBar;

            const chords = [];
            for (let bar = 0; bar < numBars; bar++) {
                const deg = chordDegrees[bar % chordDegrees.length];
                chords.push({
                    degree: deg,
                    root: getScaleNote(deg),
                    third: getScaleNote(deg + 2),
                    fifth: getScaleNote(deg + 4),
                    octaveBass: getScaleNote(deg - 7)
                });
            }

            // Pad notes (Church Organ - thick grand registration)
            const padNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                padNotes[bar * stepsPerBar] = [
                    { note: ch.root, velocity: 50, duration: 16 },
                    { note: ch.third, velocity: 52, duration: 16 },
                    { note: ch.fifth, velocity: 50, duration: 16 }
                ];
            }

            // Arpeggiator (Harpsichord running counterpoints)
            const arpNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                // dramatic minor sweeps
                for (let step = 0; step < stepsPerBar; step++) {
                    const absoluteStep = startStep + step;
                    if (step % 2 === 0) {
                        const sweep = [ch.root, ch.third, ch.fifth, ch.third + 12, ch.fifth + 12][(step/2)%5];
                        arpNotes[absoluteStep] = { note: sweep + 12, velocity: 55, duration: 2 };
                    }
                }
            }

            // Lead Melody (Pipe Organ / Soaring Violin)
            const leadNotes = new Array(totalSteps).fill('~');
            let currentDeg = 7; // Start on high root
            const rhythmProfile = [true, false, false, true, true, false, true, false];

            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                const isConsequent = (bar >= 2);
                
                for (let r = 0; r < 2; r++) {
                    const motifStart = startStep + r * 8;
                    for (let s = 0; s < 8; s++) {
                        const absoluteStep = motifStart + s;
                        if (rhythmProfile[s]) {
                            if (s === 0) {
                                currentDeg = ch.degree + 7;
                            } else if (s % 3 === 0) {
                                currentDeg = ch.degree + 4;
                            } else {
                                currentDeg += (rng() > 0.5 ? 1 : -1);
                            }

                            // Harmonic minor tension
                            if (isConsequent && absoluteStep >= 60) {
                                currentDeg = 7; // root octave
                            } else if (!isConsequent && absoluteStep >= 28 && absoluteStep < 32) {
                                currentDeg = 6; // leading tone tension (G# in A minor)
                            }

                            if (currentDeg < 0) currentDeg = 0;
                            if (currentDeg > 14) currentDeg = 14;

                            leadNotes[absoluteStep] = {
                                note: getScaleNote(currentDeg),
                                velocity: 80 + Math.floor(rng() * 10),
                                duration: 4
                            };
                        }
                    }
                }
            }

            // Bassline (Heavy Contrabass/Pipe Organ deep pedals)
            const bassNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                bassNotes[startStep] = { note: ch.octaveBass - 12, velocity: 85, duration: 16 };
            }

            return {
                bpm: bpm,
                tracks: [
                    { channel: 0, bank: 0, program: 19, notes: padNotes, pan: 0.3, reverb: 0.9 }, // Church Organ
                    { channel: 1, bank: 0, program: 6, notes: arpNotes, pan: 0.7, reverb: 0.7 },  // Harpsichord Counterpoint
                    { channel: 2, bank: 0, program: 48, notes: leadNotes, pan: 0.5, reverb: 0.8 }, // Strings Ensemble Lead
                    { channel: 3, bank: 0, program: 19, notes: bassNotes, pan: 0.5, reverb: 0.8 }  // Organ Pedals Bass
                ]
            };
        }

        generateCyberwaveSoundtrack(genre, rng) {
            const bpm = Math.floor(115 + rng() * 10); // 115 to 125 BPM
            const root = 50; // D3 (Futuristic minor)
            const scale = [0, 2, 3, 5, 7, 8, 10]; // D Natural Minor
            const getScaleNote = (degree) => {
                const octave = Math.floor(degree / scale.length);
                const idx = ((degree % scale.length) + scale.length) % scale.length;
                return root + octave * 12 + scale[idx];
            };

            // Progression: i - bVI - bVII - v (driving 80s chord sequence)
            const chordDegrees = [0, 5, 6, 4];
            const numBars = 4;
            const stepsPerBar = 16;
            const totalSteps = numBars * stepsPerBar;

            const chords = [];
            for (let bar = 0; bar < numBars; bar++) {
                const deg = chordDegrees[bar % chordDegrees.length];
                chords.push({
                    degree: deg,
                    root: getScaleNote(deg),
                    third: getScaleNote(deg + 2),
                    fifth: getScaleNote(deg + 4),
                    octaveBass: getScaleNote(deg - 7)
                });
            }

            // Sweep Pad (Warm Synth Pad)
            const padNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                padNotes[bar * stepsPerBar] = [
                    { note: ch.root + 12, velocity: 50, duration: 16 },
                    { note: ch.third + 12, velocity: 50, duration: 16 },
                    { note: ch.fifth + 12, velocity: 50, duration: 16 }
                ];
            }

            // Arpeggiator (Glitchy Synth Arpeggios)
            const arpNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                for (let step = 0; step < stepsPerBar; step++) {
                    const absoluteStep = startStep + step;
                    if (step % 2 === 0) {
                        const noteVal = [ch.root, ch.third, ch.fifth, ch.root + 12][(step / 2) % 4] + 24;
                        arpNotes[absoluteStep] = { note: noteVal, velocity: 65, duration: 2 };
                    }
                }
            }

            // Lead Melody (Square Synth Lead)
            const leadNotes = new Array(totalSteps).fill('~');
            let currentDeg = 0;
            const rhythmProfile = [true, true, false, true, true, false, true, false];

            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                const isConsequent = (bar >= 2);
                
                for (let r = 0; r < 2; r++) {
                    const motifStart = startStep + r * 8;
                    for (let s = 0; s < 8; s++) {
                        const absoluteStep = motifStart + s;
                        if (rhythmProfile[s]) {
                            if (s === 0) {
                                currentDeg = ch.degree + 7;
                            } else {
                                currentDeg += (rng() > 0.5 ? 1 : -1);
                            }

                            if (isConsequent && absoluteStep >= 60) {
                                currentDeg = 7;
                            } else if (!isConsequent && absoluteStep >= 28 && absoluteStep < 32) {
                                currentDeg = 4;
                            }

                            if (currentDeg < 0) currentDeg = 0;
                            if (currentDeg > 14) currentDeg = 14;

                            leadNotes[absoluteStep] = {
                                note: getScaleNote(currentDeg + 12),
                                velocity: 75 + Math.floor(rng() * 15),
                                duration: 2
                            };
                        }
                    }
                }
            }

            // Bassline (Driving 80s Synth Bass with 16th octave bounce)
            const bassNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                for (let step = 0; step < stepsPerBar; step += 2) {
                    const absoluteStep = startStep + step;
                    const isOctave = (step % 4 >= 2);
                    const noteVal = ch.octaveBass - 12 + (isOctave ? 12 : 0);
                    bassNotes[absoluteStep] = { note: noteVal, velocity: 80, duration: 2 };
                }
            }

            return {
                bpm: bpm,
                tracks: [
                    { channel: 0, bank: 0, program: 90, notes: padNotes, pan: 0.3, reverb: 0.8 }, // Warm Pad
                    { channel: 1, bank: 0, program: 80, notes: arpNotes, pan: 0.7, reverb: 0.6 }, // Square Arp
                    { channel: 2, bank: 0, program: 81, notes: leadNotes, pan: 0.5, reverb: 0.7 }, // Saw Lead
                    { channel: 3, bank: 0, program: 38, notes: bassNotes, pan: 0.5, reverb: 0.3 }  // Synth Bass
                ]
            };
        }

        generateOceanicSoundtrack(genre, rng) {
            const bpm = Math.floor(55 + rng() * 10); // 55 to 65 BPM (very slow, floating)
            const root = 48; // C3 (Deep ocean)
            const scale = [0, 2, 4, 6, 7, 9, 11]; // C Lydian (shimmering celestial water)
            const getScaleNote = (degree) => {
                const octave = Math.floor(degree / scale.length);
                const idx = ((degree % scale.length) + scale.length) % scale.length;
                return root + octave * 12 + scale[idx];
            };

            // Progression: I - II/I - vii7 - I (cinematic floating Lydian)
            const chordDegrees = [0, 1, 6, 0];
            const numBars = 4;
            const stepsPerBar = 16;
            const totalSteps = numBars * stepsPerBar;

            const chords = [];
            for (let bar = 0; bar < numBars; bar++) {
                const deg = chordDegrees[bar % chordDegrees.length];
                chords.push({
                    degree: deg,
                    root: getScaleNote(deg),
                    third: getScaleNote(deg + 2),
                    fifth: getScaleNote(deg + 4),
                    octaveBass: getScaleNote(deg - 7)
                });
            }

            // Water Pad (Glass Pad)
            const padNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                padNotes[bar * stepsPerBar] = [
                    { note: ch.root + 12, velocity: 40, duration: 16 },
                    { note: ch.third + 12, velocity: 38, duration: 16 },
                    { note: ch.fifth + 12, velocity: 40, duration: 16 }
                ];
            }

            // Dripping Arpeggiator (Celesta shimmering water droplets)
            const arpNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                // slow dripping arpeggio
                for (let step = 0; step < stepsPerBar; step++) {
                    const absoluteStep = startStep + step;
                    if (step % 4 === 0 && rng() > 0.3) {
                        const noteVal = [ch.root, ch.third, ch.fifth, ch.third + 12][Math.floor(rng() * 4)] + 24;
                        arpNotes[absoluteStep] = { note: noteVal, velocity: 50, duration: 4 };
                    }
                }
            }

            // Lead Melody (Harp / Slow Flute)
            const leadNotes = new Array(totalSteps).fill('~');
            let currentDeg = 4;
            const rhythmProfile = [true, false, false, false, true, false, false, false]; // very sparse

            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                const isConsequent = (bar >= 2);
                
                for (let r = 0; r < 2; r++) {
                    const motifStart = startStep + r * 8;
                    for (let s = 0; s < 8; s++) {
                        const absoluteStep = motifStart + s;
                        if (rhythmProfile[s] && rng() > 0.4) {
                            currentDeg = ch.degree + (rng() > 0.5 ? 4 : 2) + Math.floor(rng() * 3) - 1;

                            if (isConsequent && absoluteStep >= 60) {
                                currentDeg = 0;
                            }

                            if (currentDeg < 0) currentDeg = 0;
                            if (currentDeg > 14) currentDeg = 14;

                            leadNotes[absoluteStep] = {
                                note: getScaleNote(currentDeg + 12),
                                velocity: 60,
                                duration: 8
                            };
                        }
                    }
                }
            }

            // Sub-Bass (Deep Contrabass / Sine Bass)
            const bassNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                bassNotes[startStep] = { note: ch.octaveBass - 12, velocity: 65, duration: 16 };
            }

            return {
                bpm: bpm,
                tracks: [
                    { channel: 0, bank: 0, program: 92, notes: padNotes, pan: 0.3, reverb: 0.9 }, // Glass Pad
                    { channel: 1, bank: 0, program: 8, notes: arpNotes, pan: 0.7, reverb: 0.8 },  // Celesta Drips
                    { channel: 2, bank: 0, program: 46, notes: leadNotes, pan: 0.5, reverb: 0.8 }, // Harp Lead
                    { channel: 3, bank: 0, program: 39, notes: bassNotes, pan: 0.5, reverb: 0.5 }  // Synth Bass Sub
                ]
            };
        }

        generateDaggerfallSoundtrack(genre, rng) {
            const baseBpmMap = {
                'Dungeon': 72, 'Exploration': 88, 'Village': 92, 'City': 98,
                'Cave': 65, 'Desert': 80, 'Ice': 70, 'Eldritch': 60,
                'Industrial': 85, 'Ethereal': 75
            };
            const baseBpm = baseBpmMap[genre] || 85;
            const bpm = Math.floor(baseBpm - 8 + rng() * 16);

            const roots = [57, 50, 52, 55, 48]; // A (57), D (50), E (52), G (55), C (48)
            const root = roots[Math.floor(rng() * roots.length)];

            const scaleNames = ['minor', 'dorian', 'phrygian'];
            const scaleName = scaleNames[Math.floor(rng() * scaleNames.length)];
            const ScaleMap = {
                'minor': [0, 2, 3, 5, 7, 8, 10],
                'dorian': [0, 2, 3, 5, 7, 9, 10],
                'phrygian': [0, 1, 3, 5, 7, 8, 10]
            };
            const scale = ScaleMap[scaleName];

            const getScaleNote = (degree) => {
                const octave = Math.floor(degree / scale.length);
                const idx = ((degree % scale.length) + scale.length) % scale.length;
                return root + octave * 12 + scale[idx];
            };

            const progressions = {
                'minor': [
                    [0, 4, 5, 6], // i - v - VI - VII
                    [0, 3, 4, 0], // i - iv - v - i
                    [0, 5, 6, 5]  // i - VI - VII - VI
                ],
                'dorian': [
                    [0, 3, 6, 0], // i - IV - VII - i
                    [0, 6, 5, 6], // i - VII - VI - VII
                    [0, 4, 3, 4]  // i - v - IV - v
                ],
                'phrygian': [
                    [0, 1, 6, 0], // i - II - vii - i
                    [0, 1, 2, 1], // i - II - III - II
                    [0, 6, 1, 0]  // i - vii - II - i
                ]
            };
            const progList = progressions[scaleName];
            const chordDegrees = progList[Math.floor(rng() * progList.length)];

            const chordInstruments = [19, 48, 52, 16]; // Church Organ, String Ensemble, Choir, Drawbar Organ
            const chordProg = chordInstruments[Math.floor(rng() * chordInstruments.length)];

            const arpInstruments = [6, 24, 45]; // Harpsichord, Nylon Guitar, Pizz Strings
            const arpProg = arpInstruments[Math.floor(rng() * arpInstruments.length)];

            const leadInstruments = [73, 74, 68, 75]; // Flute, Recorder, Oboe, Pan Flute
            const leadProg = leadInstruments[Math.floor(rng() * leadInstruments.length)];

            const bassInstruments = [43, 38, 19]; // Contrabass, Synth Bass, Low Church Organ
            const bassProg = bassInstruments[Math.floor(rng() * bassInstruments.length)];

            const numBars = 4;
            const stepsPerBar = 16;
            const totalSteps = numBars * stepsPerBar; // 64 steps

            const chords = [];
            for (let bar = 0; bar < numBars; bar++) {
                const deg = chordDegrees[bar % chordDegrees.length];
                chords.push({
                    degree: deg,
                    root: getScaleNote(deg),
                    third: getScaleNote(deg + 2),
                    fifth: getScaleNote(deg + 4),
                    octaveBass: getScaleNote(deg - 7)
                });
            }

            // Chords Pad
            const padNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                padNotes[bar * stepsPerBar] = [
                    { note: ch.root, velocity: 45, duration: 16 },
                    { note: ch.third, velocity: 45, duration: 16 },
                    { note: ch.fifth, velocity: 45, duration: 16 }
                ];
            }

            // Arpeggiator
            const arpNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                const chordTones = [ch.root, ch.third, ch.fifth, ch.third];
                const patternType = Math.floor(rng() * 2);
                
                for (let step = 0; step < stepsPerBar; step++) {
                    const absoluteStep = startStep + step;
                    if (patternType === 0) {
                        if (step % 2 === 0) {
                            const tone = chordTones[(step / 2) % chordTones.length] + 12;
                            arpNotes[absoluteStep] = { note: tone, velocity: 60, duration: 2 };
                        }
                    } else {
                        if (step % 4 === 0) {
                            arpNotes[absoluteStep] = { note: ch.root + 12, velocity: 65, duration: 2 };
                        } else if (step % 4 === 2) {
                            arpNotes[absoluteStep] = { note: ch.fifth + 12, velocity: 55, duration: 2 };
                        } else if (step % 4 === 3) {
                            arpNotes[absoluteStep] = { note: ch.third + 12, velocity: 60, duration: 1 };
                        }
                    }
                }
            }

            // Lead Melody
            const leadNotes = new Array(totalSteps).fill('~');
            const phraseSteps = stepsPerBar * 2;
            const motifNotes = new Array(phraseSteps).fill('~');
            let currentDeg = 7;
            
            for (let step = 0; step < phraseSteps; step++) {
                const barIdx = Math.floor(step / stepsPerBar);
                const ch = chords[barIdx];
                
                // Chord tones degrees in scale: root (ch.degree), 3rd (+2), 5th (+4), octave (+7), 10th (+9), 12th (+11)
                const chordTones = [ch.degree, ch.degree + 2, ch.degree + 4, ch.degree + 7, ch.degree + 9, ch.degree + 11];
                
                if (step % 8 === 0) {
                    // Strong downbeat: always resolve/snap to nearest chord tone
                    let closestDeg = chordTones[0];
                    let minDist = Math.abs(currentDeg - closestDeg);
                    chordTones.forEach(tone => {
                        const dist = Math.abs(currentDeg - tone);
                        if (dist < minDist) {
                            minDist = dist;
                            closestDeg = tone;
                        }
                    });
                    currentDeg = closestDeg;
                    const duration = rng() > 0.4 ? 8 : 4;
                    motifNotes[step] = { note: getScaleNote(currentDeg), velocity: 80, duration: duration };
                } else if (step % 4 === 0) {
                    // Medium beat: 85% chance snap to chord tone, 15% random walk scale degree
                    if (rng() < 0.85) {
                        let closestDeg = chordTones[0];
                        let minDist = Math.abs(currentDeg - closestDeg);
                        chordTones.forEach(tone => {
                            const dist = Math.abs(currentDeg - tone);
                            if (dist < minDist) {
                                minDist = dist;
                                closestDeg = tone;
                            }
                        });
                        currentDeg = closestDeg;
                    } else {
                        currentDeg += (rng() > 0.5 ? 1 : -1);
                    }
                    if (currentDeg < 0) currentDeg = 0;
                    if (currentDeg > 14) currentDeg = 14;
                    
                    const duration = 4;
                    motifNotes[step] = { note: getScaleNote(currentDeg), velocity: 75, duration: duration };
                } else if (step % 4 === 2 && rng() < 0.5) {
                    // Weak beat passing tone: neighboring step degree
                    const passingDeg = currentDeg + (rng() > 0.5 ? 1 : -1);
                    if (passingDeg >= 0 && passingDeg <= 14) {
                        motifNotes[step] = { note: getScaleNote(passingDeg), velocity: 65, duration: 2 };
                    }
                }
            }

            for (let step = 0; step < phraseSteps; step++) {
                leadNotes[step] = motifNotes[step];
            }

            for (let step = 0; step < phraseSteps; step++) {
                const targetStep = phraseSteps + step;
                if (motifNotes[step] !== '~' && motifNotes[step]) {
                    if (step >= phraseSteps - 4) {
                        leadNotes[targetStep] = { note: getScaleNote(7), velocity: 85, duration: 4 }; // fifth/root
                    } else {
                        leadNotes[targetStep] = { ...motifNotes[step] };
                    }
                }
            }

            // Bassline
            const bassNotes = new Array(totalSteps).fill('~');
            for (let bar = 0; bar < numBars; bar++) {
                const ch = chords[bar];
                const startStep = bar * stepsPerBar;
                bassNotes[startStep] = { note: ch.octaveBass, velocity: 75, duration: 8 };
                bassNotes[startStep + 8] = { note: getScaleNote(ch.degree + 4 - 7), velocity: 65, duration: 8 };
            }

            return {
                bpm: bpm,
                tracks: [
                    { channel: 0, bank: 0, program: chordProg, notes: padNotes, pan: 0.3, reverb: 0.8 },
                    { channel: 1, bank: 0, program: arpProg, notes: arpNotes, pan: 0.7, reverb: 0.5 },
                    { channel: 2, bank: 0, program: leadProg, notes: leadNotes, pan: 0.5, reverb: 0.7 },
                    { channel: 3, bank: 0, program: bassProg, notes: bassNotes, pan: 0.5, reverb: 0.4 }
                ]
            };
        }

        generateTranceBreakcore(rng) {
            const bpm = Math.floor(rng() * 15) + 175; // 175 to 190 BPM
            const roots = [50, 52, 53, 55]; // D, E, F, G
            const root = roots[Math.floor(rng() * roots.length)];

            // Drum Programming - 32nd notes per bar (64 steps total for a 2-bar loop)
            const drumNotes = new Array(64).fill('~');
            const addDrum = (step, midiNote, vel = 100) => {
                if (step >= 64 || step < 0) return;
                if (!Array.isArray(drumNotes[step])) {
                    drumNotes[step] = [];
                }
                drumNotes[step].push({ note: midiNote, velocity: vel, duration: 2 });
            };

            // Four-on-the-floor kicks (every 8 steps)
            for (let k = 0; k < 64; k += 8) {
                addDrum(k, 36, 115); // Kick
            }

            // Syncopated extra kicks
            for (let k = 0; k < 64; k += 16) {
                if (rng() > 0.5) addDrum(k + 12, 36, 100);
            }

            // Offbeat open hats (step 4, 12, 20, ...)
            for (let h = 4; h < 64; h += 8) {
                addDrum(h, 46, 85);
            }

            // Running closed hats (every even step)
            for (let h = 2; h < 64; h += 4) {
                if (h % 8 !== 4) addDrum(h, 42, 60 + Math.floor(rng() * 20));
            }

            // Backbeat Snares (step 8, 24, 40, 56)
            addDrum(8, 38, 105);
            addDrum(24, 38, 105);
            addDrum(40, 38, 105);
            addDrum(56, 38, 105);

            // Syncopated breakcore snares
            const extraSnareSteps = [12, 18, 22, 26, 27, 28, 44, 50, 54];
            extraSnareSteps.forEach(s => {
                if (rng() > 0.4) addDrum(s, 38, 85);
            });

            // Ending stutters / snare rushes
            // Bar 1 end roll (steps 28-31)
            if (rng() > 0.5) {
                for (let r = 28; r < 32; r++) {
                    addDrum(r, 38, 70 + (r - 28) * 10);
                }
            }
            // Bar 2 end roll (steps 59-63) - Epic Snare Rush!
            for (let r = 58; r < 64; r++) {
                addDrum(r, 38, 65 + (r - 58) * 10);
                if (r % 2 === 0) addDrum(r, 39, 70); // Glitch clap layer
            }

            // Acid Bass (Channel 1) - Program 38 (Synth Bass 1)
            const bassNotes = new Array(64).fill('~');
            const chords = [
                { root: root, third: root + 3, fifth: root + 7 }, // i
                { root: root + 8, third: root + 12, fifth: root + 15 } // VI
            ];

            for (let step = 0; step < 64; step += 2) {
                const ch = chords[Math.floor(step / 32)];
                const noteIndex = (step / 2) % 8;
                
                let note;
                if (noteIndex === 0 || noteIndex === 1 || noteIndex === 3 || noteIndex === 5) {
                    note = ch.root; // Root low
                } else if (noteIndex === 2 || noteIndex === 7) {
                    note = ch.root + 12; // Octave jump
                } else if (noteIndex === 4) {
                    note = ch.third;
                } else {
                    note = ch.fifth;
                }

                bassNotes[step] = { note: note - 12, velocity: 85, duration: 2 }; // low octaves
            }

            // Synth Pad Chords (Channel 2) - Program 90 (Synth Pad)
            const padNotes = new Array(64).fill('~');
            padNotes[0] = [
                { note: chords[0].root + 12, velocity: 50, duration: 32 },
                { note: chords[0].third + 12, velocity: 50, duration: 32 },
                { note: chords[0].fifth + 12, velocity: 50, duration: 32 }
            ];
            padNotes[32] = [
                { note: chords[1].root + 12, velocity: 50, duration: 32 },
                { note: chords[1].third + 12, velocity: 50, duration: 32 },
                { note: chords[1].fifth + 12, velocity: 50, duration: 32 }
            ];

            // Trance Lead Plucks (Channel 3) - Program 80 (Square Lead)
            const leadNotes = new Array(64).fill('~');
            for (let step = 0; step < 64; step += 2) {
                const ch = chords[Math.floor(step / 32)];
                const arpTones = [ch.root + 12, ch.third + 12, ch.fifth + 12, ch.root + 24, ch.fifth + 12, ch.third + 12];
                const tone = arpTones[(step / 2) % arpTones.length];
                
                leadNotes[step] = { note: tone, velocity: 90, duration: 2 };
            }

            return {
                bpm: bpm,
                tracks: [
                    { channel: 9, bank: 0, program: 116, notes: drumNotes }, // Drum channel 9
                    { channel: 1, bank: 0, program: 38, notes: bassNotes, pan: 0.5, reverb: 0.3 },
                    { channel: 2, bank: 0, program: 90, notes: padNotes, pan: 0.3, reverb: 0.8 },
                    { channel: 3, bank: 0, program: 80, notes: leadNotes, pan: 0.7, reverb: 0.6 }
                ]
            };
        }

        onElementUsed(elementId) {
            this.activeElements.add(elementId);
            this.updatePatterns(); 
        }

        clearElements() {
            this.activeElements.clear();
            this.updatePatterns();
        }



        async playMidiFile(filename) {
            if (!this.engine._initialized) {
                console.warn("ProceduralMusicGenerator: Cannot play MIDI, engine not initialized.");
                return;
            }
            
            console.log(`ProceduralMusicGenerator: Attempting to play MIDI file: ${filename}`);
            
            // Stop Strudel patterns
            this.engine.patterns = {};
            this._patternStrings = {};
            this.engine.stop(); 
            
            const success = await this.engine.loadMidi(filename.includes('/') ? `audio/bgm/${filename}.mid` : `audio/bgm/Midi/${filename}.mid`);
            if (success) {
                this.currentGenre = filename;
                this._isManualSelection = true;
                this.engine.startMidi();
                this._isStarted = true;
            } else {
                console.error(`ProceduralMusicGenerator: Failed to play MIDI file: ${filename}`);
            }
        }


    }

    window.MusicManager = MusicManager;
    const Generator = new MusicManager();
    window.ProceduralMusic = Generator;

    // --- Hooks ---

    const _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _Scene_Base_update.call(this);
        Generator.update();
    };

    // Hook element usage in battle
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        const item = this.item();
        if (item && item.damage && item.damage.elementId > 0) {
            Generator.onElementUsed(item.damage.elementId);
        }
    };

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        Generator.refreshSeed();
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        _BattleManager_endBattle.call(this, result);
        Generator.clearElements();
    };

    PluginManager.registerCommand(pluginName, 'PlayMidiFile', args => {
        Generator.playMidiFile(args.filename);
    });

    PluginManager.registerCommand(pluginName, 'StopMusic', () => {
        Generator.engine.stop();
        Generator._isStarted = false;
    });

})();

