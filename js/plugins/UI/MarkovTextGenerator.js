/*:
 * @target MZ
 * @plugindesc Generates text using Markov chains, or a local GGUF language model when one is picked (completion or chat tuned), with proper text wrapping.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * 

 * @param defaultChainOrder
 * @text Default Chain Order
 * @type number
 * @min 1
 * @max 5
 * @desc The default order of the Markov chain (how many words to consider for context).
 * @default 2
 * 
 * @param defaultMinLength
 * @text Default Minimum Length
 * @type number
 * @min 1
 * @max 100
 * @desc The default minimum length (in words) of generated text.
 * @default 10
 * 
 * @param defaultMaxLength
 * @text Default Maximum Length
 * @type number
 * @min 5
 * @max 500
 * @desc The default maximum length (in words) of generated text.
 * @default 50
 * 
 * @param defaultMinChars
 * @text Default Minimum Characters
 * @type number
 * @min 1
 * @max 100
 * @desc The default minimum length (in characters) when generating names.
 * @default 4
 * 
 * @param defaultMaxChars
 * @text Default Maximum Characters
 * @type number
 * @min 2
 * @max 100
 * @desc The default maximum length (in characters) when generating names.
 * @default 12
 * 
 * @param maxLineLength
 * @text Max Line Length
 * @type number
 * @min 20
 * @max 120
 * @desc Maximum characters per line before automatic line breaks (affects text wrapping).
 * @default 60
 * 
 * @param insertPeriods
 * @text Insert Periods
 * @type boolean
 * @desc Automatically insert periods in long sentences to improve readability.
 * @default true
 * 
 * @param llamaServerPath
 * @text llama.cpp Server Path
 * @type string
 * @desc Own llama-server build to use. Left empty, the runtime shipped in models/llama.cpp is used.
 * @default 
 * 
 * @param llamaAutoDownload
 * @text Fetch Missing Runtime
 * @type boolean
 * @desc On a platform the game ships no runtime for, fetch the matching llama.cpp release once, on first use.
 * @default true
 * 
 * @param llamaReleaseApi
 * @text llama.cpp Release Feed
 * @type string
 * @desc Release the runtime is fetched from when one has to be fetched.
 * @default https://api.github.com/repos/ggml-org/llama.cpp/releases/latest
 * 
 * @param llamaPort
 * @text Language Model Port
 * @type number
 * @min 1024
 * @max 65535
 * @desc Port the local llama.cpp server listens on. A server already answering there is used as it stands.
 * @default 8127
 * 
 * @param llmContextSize
 * @text Language Model Context
 * @type number
 * @min 256
 * @max 8192
 * @desc Context size the language model server is started with. A chat model is never given less than 4096.
 * @default 1024
 * 
 * @param llmMaxTokens
 * @text Language Model Reply Length
 * @type number
 * @min 16
 * @max 512
 * @desc Maximum tokens the language model writes per reply. The model card recommends 100.
 * @default 100
 * 
 * @param llmTimeout
 * @text Language Model Timeout
 * @type number
 * @min 1
 * @max 120
 * @desc Seconds to wait for a reply before the Markov chain answers instead.
 * @default 20
 * 
 * @command generateText
 * @text Generate Markov Text
 * @desc Generates text using a Markov chain and displays it in a message box.
 * 
 * @arg databaseId
 * @text Database ID
 * @type string
 * @desc The ID of the text database to use (as defined in plugin parameters).
 * 
 * @arg chainOrder
 * @text Chain Order
 * @type number
 * @min 1
 * @max 5
 * @desc How many words to consider for context (higher values = more coherent, less creative).
 * @default 2
 * 
 * @arg minLength
 * @text Minimum Length
 * @type number
 * @min 1
 * @max 100
 * @desc The minimum length (in words) of generated text.
 * @default 10
 * 
 * @arg maxLength
 * @text Maximum Length
 * @type number
 * @min 5
 * @max 500
 * @desc The maximum length (in words) of generated text.
 * @default 50
 * 
 * @arg background
 * @text Background
 * @type select
 * @option Window
 * @value 0
 * @option Dim
 * @value 1
 * @option Transparent
 * @value 2
 * @desc The background type for the message window.
 * @default 0
 *
 * @arg position
 * @text Position
 * @type select
 * @option Top
 * @value 0
 * @option Middle
 * @value 1
 * @option Bottom
 * @value 2
 * @desc The position of the message window.
 * @default 2
 *
 * @command generateName
 * @text Generate Markov Name
 * @desc Generates a short text using character-based Markov for names.
 * 
 * @arg databaseId
 * @text Database ID
 * @type string
 * @desc The ID of the text database to use (as defined in plugin parameters).
 * 
 * @arg chainOrder
 * @text Chain Order
 * @type number
 * @min 1
 * @max 5
 * @desc How many characters to consider for context (higher values = more coherent).
 * @default 2
 * 
 * @arg minChars
 * @text Minimum Characters
 * @type number
 * @min 1
 * @max 100
 * @desc The minimum length (in characters) of generated name.
 * @default 4
 * 
 * @arg maxChars
 * @text Maximum Characters
 * @type number
 * @min 2
 * @max 100
 * @desc The maximum length (in characters) of generated name.
 * @default 12
 * 
 * @arg useWordMode
 * @text Use Word-Based Mode
 * @type boolean
 * @desc If true, will generate based on whole words instead of individual characters.
 * @default false
 * 
 * @arg variableId
 * @text Variable ID
 * @type variable
 * @desc Store the generated name in this game variable (0 to not store it).
 * @default 0
 * 
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc Set the generated name to this actor (0 to not set any actor name).
 * @default 0
 * 
 * @arg displayInMessage
 * @text Display In Message
 * @type boolean
 * @desc Show the generated name in a message window.
 * @default false
 *
 * @command generateSeededDialogue
 * @text Generate Seeded Dialogue
 * @desc Generates dialogue from seeded DB selection (map 636 only). Uses Variables 43, 44 and event ID as seed.
 *
 * @arg chainOrder
 * @text Chain Order
 * @type number
 * @min 1
 * @max 5
 * @desc How many words to consider for context (higher values = more coherent, less creative).
 * @default 2
 *
 * @arg minLength
 * @text Minimum Length
 * @type number
 * @min 1
 * @max 100
 * @desc The minimum length (in words) of generated text.
 * @default 10
 *
 * @arg maxLength
 * @text Maximum Length
 * @type number
 * @min 5
 * @max 500
 * @desc The maximum length (in words) of generated text.
 * @default 50
 *
 * @arg background
 * @text Background
 * @type select
 * @option Window
 * @value 0
 * @option Dim
 * @value 1
 * @option Transparent
 * @value 2
 * @desc The background type for the message window.
 * @default 0
 *
 * @arg position
 * @text Position
 * @type select
 * @option Top
 * @value 0
 * @option Middle
 * @value 1
 * @option Bottom
 * @value 2
 * @desc The position of the message window.
 * @default 2
 *
 * @command generateNPCDialogue
 * @text Generate NPC Dialogue
 * @desc Generates dialogue for the calling NPC event using their associated Markov DB. Chain order is always 1; max length is randomized each call.
 *
 * @arg background
 * @text Background
 * @type select
 * @option Window
 * @value 0
 * @option Dim
 * @value 1
 * @option Transparent
 * @value 2
 * @desc The background type for the message window.
 * @default 0
 *
 * @arg position
 * @text Position
 * @type select
 * @option Top
 * @value 0
 * @option Middle
 * @value 1
 * @option Bottom
 * @value 2
 * @desc The position of the message window.
 * @default 2
 *
 * @help
 * ============================================================================
 * Markov Text Generator with Text Wrapping
 * ============================================================================
 * 
 * This plugin allows you to generate text using Markov chains based on
 * predefined text databases. The generated text can be displayed in a
 * message box with customizable parameters and proper text wrapping.
 * 
 * == How to Use ==
 * 
 * 1. Define text databases in the plugin parameters.
 *    Each database needs a unique ID and the source text.
 * 
 * 2. Use the plugin command "Generate Markov Text" in an event
 *    to generate paragraphs of text.
 *    - OR -
 *    Use the plugin command "Generate Markov Name" to generate
 *    shorter character names or item names based on character length.
 * 
 * == IMPORTANT: Plugin File Name ==
 * 
 * This plugin file MUST be named "MarkovTextGenerator.js" in your project's 
 * plugins folder. The plugin name inside the code must match the file name
 * without the .js extension.
 * 
 * == Plugin Command Usage ==
 * 
 * In an event, add a "Plugin Command" action and select one of the commands:
 * 
 * 1. "Generate Markov Text" - For longer text passages
 *    Fill in at least the Database ID.
 * 
 * 2. "Generate Markov Name" - For character or item names
 *    - Set the database ID and character length limits
 *    - Choose whether to use word-based mode (for compound names)
 *    - Optionally store the result in a game variable
 *    - Decide whether to display the name in a message window
 * 
 * == Name Generation ==
 * 
 * The name generator has two modes:
 * 
 * 1. Character-based (useWordMode = false): Builds names character by character.
 *    Good for creating completely new names with the feel of the source text.
 * 
 * 2. Word-based (useWordMode = true): Uses whole words from the source.
 *    Good for creating compound names or picking words from the source text.
 * 
 * All generated names will have their first letter automatically capitalized.
 * 
 * You can also directly set an actor's name to the generated name by providing
 * an Actor ID in the plugin command parameters.
 * 
 * == GGUF Language Model (experimental) ==
 * 
 * Options > Experimental holds an AI Dialogue Model row. It lists every .gguf
 * file sitting in the game's models folder, and Off. Pick one and every line
 * this plugin would have written with a Markov chain is written by that model
 * instead, with the chain kept as the fallback.
 * 
 * Setting it up is putting the .gguf file in the models folder. Nothing else:
 * the llama.cpp server that runs it ships with the game, under
 * models/llama.cpp/<platform>-<arch>/, for Windows x64, macOS (Intel and
 * Apple Silicon) and Linux x64. It is started with the picked model the first
 * time a line is asked of it and killed when the game closes.
 * 
 * Two kinds of model are understood, and which one a file is is read off the
 * file itself (tokenizer.chat_template in its GGUF metadata):
 *
 * - A plain completion model. This was written against
 *   lukasstraub2/gpt2-aidungeon2-gguf, a GPT-2 finetune of AI Dungeon 2. It
 *   gets a scenario (where the party is, who is speaking, and a few sentences
 *   out of the same text database the chain would have used) followed by an
 *   action line opening with "> ", and it writes the story that follows. ">"
 *   is the stop token, so it stops before inventing the player's next move. It
 *   runs at temperature 0.4, top_p 0.9, top_k 40 for 100 tokens, the values
 *   the model card recommends, and only whole sentences are ever spoken.
 *
 * - An instruction tuned model: Qwen, Llama 3 Instruct, Mistral Instruct and
 *   anything else carrying a chat template. It is asked on the chat route
 *   instead, with a system prompt saying who it is playing, where it is
 *   standing and how the people here talk, then the last turns of the
 *   conversation and the line just typed. Its server is run with --jinja, so
 *   the turns are wrapped in the model's own template; a template llama.cpp
 *   cannot render is not fatal, the server is simply run again on its built in
 *   one. Reasoning is asked off and any <think> block that arrives anyway is
 *   dropped before the line is spoken.
 *
 * On a platform with no shipped runtime (an ARM desktop, say) the matching
 * llama.cpp release is fetched once on first use and unpacked into the same
 * folder. A llama-server the player started themselves on the same port is
 * used as it stands and is left running, and an own build can be named with
 * the llama.cpp Server Path parameter or the HYPERNET_LLAMA_SERVER variable.
 *
 * Events wait for the model, and so does the free chat of the Empathize panel,
 * where the player writes the line themselves: that one waits out a cold start
 * too, so a picked model is who answers from the very first line rather than
 * from the second. Code that cannot wait (generateMarkovString) is served lines
 * the model wrote ahead of time for that database, and hears the chain until
 * the first one lands; generateMarkovStringAsync() is there for callers that
 * can wait, and window.MarkovLLM exposes the backend itself, including
 * isReady() and warmUp() for callers that want the chain rather than a cold
 * start, isChatModel(), and reply() for a typed line.
 *
 * A completion model writes English. An instruction tuned one is asked to
 * answer in the language the game is running in.
 * 
 * == Text Wrapping Parameters ==
 * 
 * - Max Line Length: Controls when text will be broken to a new line to ensure
 *   proper wrapping within the message window.
 * 
 * - Insert Periods: When enabled, automatically inserts periods in very long
 *   sentences to improve readability in the generated text.
 * 
 * == Parameters Explained ==
 * 
 * - Chain Order: How many words/characters to use for context. Higher values
 *   produce more coherent but less creative text.
 * 
 * - Min/Max Length: Controls how long the generated text will be.
 * 
 * == Example ==
 * 
 * Create a database with ID "fantasy_names" containing fantasy character names,
 * then use the "Generate Markov Name" command to create new character names
 * on the fly during gameplay.
 * 
 * ============================================================================
 * Terms of Use
 * ============================================================================
 * 
 * Free for use in both commercial and non-commercial projects.
 * Credit is appreciated but not required.
 * 
 */


(function () {
    'use strict';

    // The plugin name MUST match the filename (without .js)
    const pluginName = "MarkovTextGenerator";



    // Parse plugin parameters
    const parameters = PluginManager.parameters(pluginName);

    const defaultChainOrder = Number(parameters.defaultChainOrder || 2);
    const defaultMinLength = Number(parameters.defaultMinLength || 10);
    const defaultMaxLength = Number(parameters.defaultMaxLength || 50);
    const defaultMinChars = Number(parameters.defaultMinChars || 4);
    const defaultMaxChars = Number(parameters.defaultMaxChars || 12);
    const maxLineLength = Number(parameters.maxLineLength || 60);
    const insertPeriods = parameters.insertPeriods !== "false";

    // Parse additional text databases from plugin parameters
    const extraDatabases = [];
    try {
        const rawDatabases = parameters.textDatabases;
        if (rawDatabases && rawDatabases !== '[]') {
            const parsedArray = JSON.parse(rawDatabases);
            parsedArray.forEach(dbString => {
                try {
                    const db = JSON.parse(dbString);
                    extraDatabases.push({
                        id: db.id,
                        name: db.name,
                        en: db.en,
                        it: db.it
                    });
                } catch (innerErr) {
                    console.error(`[MarkovTextGenerator] Error parsing individual database entry: ${innerErr.message}`);
                }
            });
        }
    } catch (e) {
        console.error(`[MarkovTextGenerator] Error parsing extra databases: ${e.message}`);
    }

    /**
     * Get all currently available text databases, merging dynamic (JSON files) and parameter ones.
     * @returns {Array} Array of database objects
     */
    function getAllTextDatabases() {
        const dynamicDatabases = Object.values(window.TextGen || {});
        // Update global window.textDatabases for backward compatibility with other plugins
        window.textDatabases = dynamicDatabases.concat(extraDatabases);
        return window.textDatabases;
    }

    // Initial population for console log only
    // const initialDBs = getAllTextDatabases();
    // console.log(`[MarkovTextGenerator] Initialized with ${initialDBs.length} databases.`);
    console.log(`[MarkovTextGenerator] Ready. Databases will load on first use.`);

    // Store built Markov models to avoid rebuilding. Keys such as
    // `seeded_<worldX>_<worldY>_<eventId>` are effectively unbounded across a
    // session, so use an LRU-capped Map that evicts the least-recently-used entry.
    const MARKOV_MODEL_CACHE_LIMIT = 64;
    const markovModels = new Map();

    // Get an existing model or build one via factory(), refreshing LRU order and
    // evicting the oldest entry once the cache limit is exceeded.
    function getMarkovModel(modelKey, factory) {
        if (markovModels.has(modelKey)) {
            const model = markovModels.get(modelKey);
            markovModels.delete(modelKey);
            markovModels.set(modelKey, model); // move to most-recently-used
            return model;
        }
        const model = factory();
        markovModels.set(modelKey, model);
        if (markovModels.size > MARKOV_MODEL_CACHE_LIMIT) {
            const oldestKey = markovModels.keys().next().value;
            markovModels.delete(oldestKey);
        }
        return model;
    }

    const characterMarkovModels = {};

    // Helper function to capitalize first letter of a string
    function capitalizeFirstLetter(string) {
        if (!string) return string;
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // Markov Chain Generator Class for word-based generation
    class MarkovChain {
        constructor(text, order = 2) {
            this.order = order;
            this.model = {};
            this.startSequences = [];

            this.buildModel(text);
        }

        buildModel(text) {
            // Clean and tokenize the text
            const words = (text || '')
                .split(/\s+/)
                .filter(word => word.length > 0);


            // Build model
            for (let i = 0; i <= words.length - this.order; i++) {
                // Get current sequence of words (state)
                const currentSequence = words.slice(i, i + this.order).join(' ');

                // Save sequences that can start sentences
                if (i === 0 || /[\.\?\!]$/.test(words[i - 1])) {
                    this.startSequences.push(currentSequence);
                }

                // Next word
                const nextWord = words[i + this.order];

                // If we reached the end of the text, continue
                if (!nextWord) continue;

                // Add to model
                if (!this.model[currentSequence]) {
                    this.model[currentSequence] = [];
                }
                this.model[currentSequence].push(nextWord);
            }

        }

        generateText(minLength = 10, maxLength = 50) {

            // No usable source text (e.g. missing translation for this database) - nothing to generate.
            if (this.startSequences.length === 0) {
                return '';
            }

            // Start with a random starting sequence
            let currentSequence = this.startSequences[Math.floor(Math.random() * this.startSequences.length)];
            let result = currentSequence.split(' ');


            // Generate text until we reach max length or can't continue
            while (result.length < maxLength) {
                // If we don't have this sequence in our model, break
                if (!this.model[currentSequence] || this.model[currentSequence].length === 0) {
                    break;
                }

                // Get a random next word based on current sequence
                const nextWords = this.model[currentSequence];
                const nextWord = nextWords[Math.floor(Math.random() * nextWords.length)];
                result.push(nextWord);

                // Update current sequence
                const sequenceWords = currentSequence.split(' ');
                sequenceWords.shift();
                sequenceWords.push(nextWord);
                currentSequence = sequenceWords.join(' ');

                // If we've reached minimum length and the last word ends with a terminal punctuation, we can stop
                if (result.length >= minLength && /[\.\?\!]$/.test(nextWord)) {
                    break;
                }
            }

            // Check if the text ends with proper punctuation, if not add a period
            if (result.length > 0 && !/[\.\?\!]$/.test(result[result.length - 1])) {
                result[result.length - 1] += '.';
            }

            // Ensure first letter is capitalized
            if (result.length > 0) {
                result[0] = capitalizeFirstLetter(result[0]);
            }

            return result.join(' ');
        }

        // Generate text that BEGINS with the caller's own words, then lets the
        // Markov chain continue from there, producing a semi-sensical reply that
        // echoes and riffs on what was typed. Used by the NPC chat box.
        generateFrom(startText, minLength = 10, maxLength = 50) {
            const seedWords = String(startText || '')
                .split(/\s+/)
                .filter(w => w.length > 0);
            if (seedWords.length === 0) return this.generateText(minLength, maxLength);

            // The reply opens with the player's own words.
            const result = seedWords.slice();

            // Pick the continuation state. Best case: the last `order` words of the
            // seed are a known state, so the chain flows straight on. Otherwise
            // bridge through a model state whose first word appears in the seed, and
            // failing that fall back to any sentence-start sequence.
            let currentSequence = null;
            const tail = seedWords.slice(-this.order).join(' ');
            if (this.model[tail]) {
                currentSequence = tail;
            } else {
                const norm    = w => w.toLowerCase().replace(/[^\w]/g, '');
                const seedSet = new Set(seedWords.map(norm).filter(Boolean));
                const bridges = Object.keys(this.model)
                    .filter(k => seedSet.has(norm(k.split(' ')[0])));
                if (bridges.length) {
                    currentSequence = bridges[Math.floor(Math.random() * bridges.length)];
                    result.push(...currentSequence.split(' '));
                } else if (this.startSequences.length) {
                    currentSequence = this.startSequences[Math.floor(Math.random() * this.startSequences.length)];
                    result.push(...currentSequence.split(' '));
                }
            }

            while (currentSequence && result.length < maxLength) {
                const nextWords = this.model[currentSequence];
                if (!nextWords || nextWords.length === 0) break;
                const nextWord = nextWords[Math.floor(Math.random() * nextWords.length)];
                result.push(nextWord);
                const sequenceWords = currentSequence.split(' ');
                sequenceWords.shift();
                sequenceWords.push(nextWord);
                currentSequence = sequenceWords.join(' ');
                if (result.length >= minLength && /[\.\?\!]$/.test(nextWord)) break;
            }

            if (result.length > 0 && !/[\.\?\!]$/.test(result[result.length - 1])) {
                result[result.length - 1] += '.';
            }
            if (result.length > 0) result[0] = capitalizeFirstLetter(result[0]);
            return result.join(' ');
        }

        // Generate a name using words (for compound names)
        generateWordBasedName(minChars = 4, maxChars = 12) {
            if (this.startSequences.length === 0) {
                return T('Markov.errorName');
            }

            // Get an appropriate starting point - prefer single words from the start sequences
            const potentialStarts = this.startSequences
                .map(seq => seq.split(' ')[0])
                .filter(word => word.length >= 2);

            let name = potentialStarts[Math.floor(Math.random() * potentialStarts.length)];

            // Sometimes add a second word to create compound names
            if (name.length < minChars || (Math.random() > 0.7 && name.length < maxChars - 3)) {
                // Find words that could follow our starting word
                const currentSequence = name;
                if (this.model[currentSequence] && this.model[currentSequence].length > 0) {
                    const nextWords = this.model[currentSequence];
                    const nextWord = nextWords[Math.floor(Math.random() * nextWords.length)];

                    // Create compound name - sometimes with hyphen, sometimes with space
                    if (Math.random() > 0.5) {
                        name += '-' + nextWord;
                    } else {
                        name += ' ' + nextWord;
                    }
                }
            }

            // Truncate if too long
            if (name.length > maxChars) {
                name = name.substring(0, maxChars);

                // Ensure we don't cut off in the middle of a hyphenated name
                if (name.endsWith('-')) {
                    name = name.substring(0, name.length - 1);
                }
            }

            // Remove any punctuation at the end
            name = name.replace(/[^\w\s-]$/, '');

            // Ensure first letter is capitalized and each part of a compound name is capitalized
            name = name.split(/[\s-]/).map(part => capitalizeFirstLetter(part)).join('-');


            return name;
        }
    }

    // Character-based Markov Chain for name generation
    class CharacterMarkov {
        constructor(text, order = 2) {
            this.order = order;
            this.model = {};
            this.startSequences = [];

            this.buildModel(text);
        }

        buildModel(text) {
            // Extract words from text, we'll use these as the basis for character-based generation
            const words = text
                .replace(/[^\w\s-]/g, '')
                .split(/\s+/)
                .filter(word => word.length >= this.order);


            // Process each word
            words.forEach(word => {
                // Save beginning sequences
                const startSeq = word.substring(0, this.order);
                this.startSequences.push(startSeq);

                // Build character transitions
                for (let i = 0; i <= word.length - this.order; i++) {
                    const sequence = word.substring(i, i + this.order);
                    const nextChar = word[i + this.order];

                    if (!nextChar) continue;

                    if (!this.model[sequence]) {
                        this.model[sequence] = [];
                    }

                    this.model[sequence].push(nextChar);
                }

                // Add end-of-word marker for more natural endings
                const endSeq = word.substring(word.length - this.order);
                if (!this.model[endSeq]) {
                    this.model[endSeq] = [];
                }
                this.model[endSeq].push('$END');
            });

        }

        generateName(minChars = 4, maxChars = 12) {
            if (this.startSequences.length === 0) {
                return T('Markov.errorName');
            }

            // Start with a random starting sequence
            const currentSequence = this.startSequences[Math.floor(Math.random() * this.startSequences.length)];
            let result = currentSequence;

            // Generate characters until we reach the max length or natural ending
            while (result.length < maxChars) {
                const currentState = result.substring(result.length - this.order);

                // If we don't have this sequence in our model or reached min length with ending, break
                if (!this.model[currentState] || this.model[currentState].length === 0 ||
                    (result.length >= minChars && Math.random() > 0.7)) {
                    break;
                }

                // Get a random next character based on current sequence
                const nextChars = this.model[currentState];
                const nextChar = nextChars[Math.floor(Math.random() * nextChars.length)];

                // Check if we reached a natural end
                if (nextChar === '$END') {
                    if (result.length >= minChars) {
                        break;
                    } else {
                        // Too short, continue with a different character
                        continue;
                    }
                }

                result += nextChar;
            }

            // Ensure the name has the specified minimum length
            if (result.length < minChars) {
                // Add random characters from the model to reach minimum length
                while (result.length < minChars) {
                    const randomChar = Object.keys(this.model)[Math.floor(Math.random() * Object.keys(this.model).length)];
                    result += randomChar.charAt(0);
                }
            }

            // Ensure first letter is capitalized
            result = capitalizeFirstLetter(result);


            return result;
        }
    }

    //=========================================================================
    // GGUF language model backend (experimental)
    //=========================================================================
    // The Markov chains stay the default voice of the game. Pick a .gguf file
    // in Options > Experimental and the very same calls are answered by that
    // model instead, run by a local llama.cpp server, with the chain kept as
    // the fallback for whatever the model cannot answer in time.
    //
    // Written against lukasstraub2/gpt2-aidungeon2-gguf: a GPT-2 finetune of
    // AI Dungeon 2, so a plain text completion model and not a chat one. It is
    // fed a scenario followed by an action line opening with "> ", and it
    // writes the story that follows. ">" is the stop token, so it stops before
    // inventing the player's next move. Sampler values, reply length and the
    // stop token are the ones the model card recommends.
    const LLM_SAMPLER = { temperature: 0.4, top_p: 0.9, top_k: 40 };
    const LLM_STOP = ['>', '\n>'];
    // Scenario handed to the model, in characters. Enough for the place, the
    // speaker and a handful of sentences of the game's own text, short enough
    // that a 1024 token context still has room to answer in.
    const LLM_SCENARIO_CHARS = 900;
    // Ready lines kept per database for the synchronous callers, and how many
    // databases keep a queue at all.
    const LLM_CACHE_LINES = 2;
    const LLM_CACHE_KEYS = 24;

    const llmServerPath = String(parameters.llamaServerPath || '');
    const llmPort = Number(parameters.llamaPort || 8127);
    const llmContextSize = Number(parameters.llmContextSize || 1024);
    const llmMaxTokens = Number(parameters.llmMaxTokens || 100);
    const llmTimeoutMs = Number(parameters.llmTimeout || 20) * 1000;
    const llmAutoDownload = parameters.llamaAutoDownload !== 'false';
    const llmReleaseApi = String(parameters.llamaReleaseApi ||
        'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest');
    // A 3 GB model read off a cold disk takes its time; the boot wait is
    // generous because it is paid once per session, not once per line.
    const LLM_BOOT_TIMEOUT_MS = 180000;

    const nodeAvailable = Utils.isNwjs() && typeof require === 'function';
    const NodeIO = nodeAvailable ? {
        fs: require('fs'),
        path: require('path'),
        http: require('http'),
        cp: require('child_process')
    } : null;

    function gameBaseDir() {
        return NodeIO.path.dirname(process.mainModule.filename);
    }

    function modelsDir() {
        return NodeIO.path.join(gameBaseDir(), 'models');
    }

    // The .gguf files sitting in the models folder, cached because the options
    // menu asks for them once per drawn frame while a row is selected.
    let ggufCache = null;
    function listGgufModels() {
        if (!NodeIO) return [];
        if (ggufCache) return ggufCache;
        try {
            const dir = modelsDir();
            ggufCache = NodeIO.fs.existsSync(dir)
                ? NodeIO.fs.readdirSync(dir).filter(f => /\.gguf$/i.test(f)).sort()
                : [];
        } catch (e) {
            console.warn(`[${pluginName}] Could not read the models folder:`, e);
            ggufCache = [];
        }
        return ggufCache;
    }

    function rescanGgufModels() {
        ggufCache = null;
        chatModelCache.clear();
        return listGgufModels();
    }

    //-------------------------------------------------------------------------
    // Chat tuned models
    //-------------------------------------------------------------------------
    // Everything the section above does is written for a plain completion
    // model: a scenario, an action line, and a story written on from there. An
    // instruction tuned model (Qwen, Llama 3 Instruct, Mistral Instruct and
    // the rest of that shape) does not continue a story. It answers turns
    // wrapped in the chat template it was trained on, and handed an AI Dungeon
    // scenario it writes about the scenario instead of speaking in it.
    //
    // So the two are told apart and each is asked in its own way. Which one a
    // file is is read off the file itself: an instruction tuned GGUF carries
    // its template in its metadata, under tokenizer.chat_template.

    // How much of the front of a GGUF is read looking for its template. The
    // metadata of a big vocabulary runs to a few megabytes, so the small window
    // answers for nearly every file and the large one is only ever paid for the
    // rare one whose key block is longer than that.
    const LLM_GGUF_SCAN_STEPS = [8 * 1024 * 1024, 48 * 1024 * 1024];
    // Only for a file whose metadata could not be read: what the publishers of
    // instruction tuned GGUFs put in the file name.
    const LLM_CHAT_NAME_HINT =
        /(instruct|[-_.]it[-_.]|chat|qwen|hermes|vicuna|zephyr|openchat|gemma|phi-?[34]|smollm|minicpm|granite|olmo|tulu|deepseek|llama-?3)/i;
    // The last turns handed to a chat model, and the room its server is given:
    // a system prompt plus a conversation needs more than the 1024 tokens an
    // action line was answered in.
    const LLM_CHAT_HISTORY = 6;
    const LLM_CHAT_CONTEXT = 4096;
    // A person talking is allowed to be less predictable than a narrator.
    const LLM_CHAT_SAMPLER = { temperature: 0.8, top_p: 0.9 };

    // The value of one metadata key, without loading the weights: a GGUF opens
    // with its header and its key/value block, so only the front of the file is
    // read. Returns the template, '' when the file carries none, or null when
    // it could not be parsed at all (a truncated download, a format newer than
    // this reader, metadata past the window that is read).
    function ggufChatTemplate(filePath) {
        if (!NodeIO) return null;
        let size = 0;
        try { size = NodeIO.fs.statSync(filePath).size; } catch (e) { return null; }
        for (const limit of LLM_GGUF_SCAN_STEPS) {
            const template = ggufChatTemplateWithin(filePath, Math.min(size, limit));
            if (template !== null) return template;
            if (size <= limit) return null;      // the whole file was read already
        }
        return null;
    }

    function ggufChatTemplateWithin(filePath, length) {
        const fs = NodeIO.fs;
        let fd = null;
        try {
            if (length < 24) return null;
            const buf = Buffer.alloc(length);
            fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buf, 0, length, 0);
            if (buf.toString('latin1', 0, 4) !== 'GGUF') return null;

            let off = 4;
            const u32 = () => { const v = buf.readUInt32LE(off); off += 4; return v; };
            const u64 = () => { const v = Number(buf.readBigUInt64LE(off)); off += 8; return v; };
            const str = () => { const n = u64(); const v = buf.toString('utf8', off, off + n); off += n; return v; };
            const version = u32();
            if (version < 2 || version > 3) return null;
            u64();                                   // tensor count, not read here
            const kvCount = u64();
            // Byte width of every fixed size metadata type, by its type id.
            const WIDTH = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
            const skip = (type) => {
                if (type === 8) { off += u64(); return; }          // string
                if (type === 9) {                                   // array
                    const elem = u32();
                    const n = u64();
                    for (let i = 0; i < n; i++) skip(elem);
                    return;
                }
                const width = WIDTH[type];
                if (width === undefined) throw new Error('unknown metadata type ' + type);
                off += width;
            };
            for (let i = 0; i < kvCount; i++) {
                if (off >= buf.length) return null;
                const key = str();
                const type = u32();
                if (key === 'tokenizer.chat_template' && type === 8) return str();
                skip(type);
            }
            return '';
        } catch (e) {
            return null;
        } finally {
            if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* already closed */ } }
        }
    }

    // Cached per file: reading it walks the whole vocabulary of a big model.
    const chatModelCache = new Map();
    function modelIsChat(modelName) {
        if (!modelName || !NodeIO) return false;
        if (chatModelCache.has(modelName)) return chatModelCache.get(modelName);
        const template = ggufChatTemplate(NodeIO.path.join(modelsDir(), modelName));
        const isChat = template === null
            ? LLM_CHAT_NAME_HINT.test(modelName)
            : template.length > 0;
        chatModelCache.set(modelName, isChat);
        return isChat;
    }

    // A model dropped into the folder while the game is running shows up the
    // next time the options are opened, without a restart.
    const _Scene_Options_create_markovLlm = Scene_Options.prototype.create;
    Scene_Options.prototype.create = function () {
        rescanGgufModels();
        _Scene_Options_create_markovLlm.call(this);
    };

    //-------------------------------------------------------------------------
    // The setting itself
    //-------------------------------------------------------------------------
    const LLM_SYMBOL = 'markovLlmModel';
    ConfigManager[LLM_SYMBOL] = '';

    const _ConfigManager_makeData_markovLlm = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData_markovLlm.call(this);
        config[LLM_SYMBOL] = this[LLM_SYMBOL] || '';
        return config;
    };

    const _ConfigManager_applyData_markovLlm = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData_markovLlm.call(this, config);
        this[LLM_SYMBOL] = typeof config[LLM_SYMBOL] === 'string' ? config[LLM_SYMBOL] : '';
    };

    // The stored file name only counts while the file is still there: a model
    // deleted between sessions reads as off rather than as a broken setting.
    function selectedGgufModel() {
        if (!NodeIO) return '';
        const name = ConfigManager[LLM_SYMBOL];
        return name && listGgufModels().includes(name) ? name : '';
    }

    function llmEnabled() {
        return !!selectedGgufModel();
    }

    // Off plus one entry per model on disk, so cycling the row walks the folder.
    function llmOptionValues() {
        return [''].concat(listGgufModels());
    }

    function cycleLlmOption(step) {
        const values = llmOptionValues();
        const current = Math.max(0, values.indexOf(ConfigManager[LLM_SYMBOL] || ''));
        const next = (current + step + values.length) % values.length;
        ConfigManager[LLM_SYMBOL] = values[next];
        // A different model means the running server holds the wrong weights,
        // and the lines already queued were written by the old voice.
        LlamaServer.stop();
        llmLineCache.clear();
        ConfigManager.save();
    }

    if (window.GameOptions) {
        window.GameOptions.registerOption(LLM_SYMBOL,
            () => T('GameOptions.label.markovLlmModel'),
            () => ConfigManager[LLM_SYMBOL] || '',
            (value) => { ConfigManager[LLM_SYMBOL] = value || ''; ConfigManager.save(); },
            'experimental', 'custom',
            (value) => value ? String(value).replace(/\.gguf$/i, '') : T('Markov.llm.off'),
            function () { cycleLlmOption(1); },
            function () { cycleLlmOption(-1); }
        );
    }

    //-------------------------------------------------------------------------
    // Dialogue mode (empathize / markovian)
    //-------------------------------------------------------------------------
    // Read by DialogueSystem.js's Rumors command: empathize runs the usual
    // Socialize exchange and flavour rumour, markovian hands the whole line to
    // this plugin's per-NPC Markov bank instead.
    const DIALOGUE_MODE_SYMBOL = 'dialogueMode';
    const DIALOGUE_MODE_VALUES = ['empathize', 'markovian'];
    ConfigManager[DIALOGUE_MODE_SYMBOL] = DIALOGUE_MODE_VALUES[0];

    const _ConfigManager_makeData_dialogueMode = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData_dialogueMode.call(this);
        config[DIALOGUE_MODE_SYMBOL] = this[DIALOGUE_MODE_SYMBOL] || DIALOGUE_MODE_VALUES[0];
        return config;
    };

    const _ConfigManager_applyData_dialogueMode = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData_dialogueMode.call(this, config);
        this[DIALOGUE_MODE_SYMBOL] = DIALOGUE_MODE_VALUES.includes(config[DIALOGUE_MODE_SYMBOL])
            ? config[DIALOGUE_MODE_SYMBOL] : DIALOGUE_MODE_VALUES[0];
    };

    function cycleDialogueMode(step) {
        const values = DIALOGUE_MODE_VALUES;
        const current = Math.max(0, values.indexOf(ConfigManager[DIALOGUE_MODE_SYMBOL] || values[0]));
        const next = (current + step + values.length) % values.length;
        ConfigManager[DIALOGUE_MODE_SYMBOL] = values[next];
        ConfigManager.save();
    }

    if (window.GameOptions) {
        window.GameOptions.registerOption(DIALOGUE_MODE_SYMBOL,
            () => T('GameOptions.label.dialogueMode'),
            () => ConfigManager[DIALOGUE_MODE_SYMBOL] || DIALOGUE_MODE_VALUES[0],
            (value) => {
                ConfigManager[DIALOGUE_MODE_SYMBOL] = DIALOGUE_MODE_VALUES.includes(value) ? value : DIALOGUE_MODE_VALUES[0];
                ConfigManager.save();
            },
            'gameplay', 'boolean',
            (value) => T.list('GameOptions.dialogueMode')[DIALOGUE_MODE_VALUES.indexOf(value)] || T.list('GameOptions.dialogueMode')[0],
            function () { cycleDialogueMode(1); },
            function () { cycleDialogueMode(-1); }
        );
    }

    //-------------------------------------------------------------------------
    // The local llama.cpp server
    //-------------------------------------------------------------------------
    // Requests go through Node's http rather than fetch: the game runs from a
    // file:// origin, so a browser request to the loopback server would be a
    // cross origin one and depend on the server's CORS headers.
    function llmRequest(pathname, payload, timeoutMs) {
        return new Promise((resolve, reject) => {
            if (!NodeIO) return reject(new Error('no node'));
            const body = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null;
            const req = NodeIO.http.request({
                host: '127.0.0.1',
                port: llmPort,
                path: pathname,
                method: body ? 'POST' : 'GET',
                headers: body
                    ? { 'Content-Type': 'application/json', 'Content-Length': body.length }
                    : {}
            }, res => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsed = null;
                    try { parsed = JSON.parse(data); } catch (e) { parsed = null; }
                    resolve({ status: res.statusCode, body: parsed });
                });
            });
            req.on('error', reject);
            req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
            if (body) req.write(body);
            req.end();
        });
    }

    //-------------------------------------------------------------------------
    // The llama.cpp runtime
    //-------------------------------------------------------------------------
    // The server that runs the model ships with the game, under
    // models/llama.cpp/<platform>-<arch>/, so dropping a .gguf into the models
    // folder is the whole of the setup on Windows, macOS and Linux. A platform
    // that is not shipped (an ARM desktop, an old Mac) fetches the matching
    // llama.cpp release the first time a model is asked for and unpacks it into
    // the same place, and a player who would rather use their own build points
    // at it with the plugin parameter or the environment variable.
    const LLAMA_RUNTIME_DIR = () => NodeIO.path.join(modelsDir(), 'llama.cpp');
    const LLAMA_PLATFORM = () => `${process.platform}-${process.arch}`;
    const LLAMA_EXE = () => process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';

    // llama.cpp names its release archives by platform; the CPU builds are the
    // ones taken, since they are the only ones that run on any machine.
    function llamaAssetPatterns() {
        const table = {
            'win32-x64': [/bin-win-cpu-x64\.zip$/i, /bin-win-avx2-x64\.zip$/i, /bin-win-x64\.zip$/i],
            'win32-arm64': [/bin-win-cpu-arm64\.zip$/i, /bin-win-arm64\.zip$/i],
            'darwin-arm64': [/bin-macos-arm64\.(tar\.gz|zip)$/i],
            'darwin-x64': [/bin-macos-x64\.(tar\.gz|zip)$/i],
            'linux-x64': [/bin-ubuntu-x64\.(tar\.gz|zip)$/i],
            'linux-arm64': [/bin-ubuntu-arm64\.(tar\.gz|zip)$/i]
        };
        return table[LLAMA_PLATFORM()] || [];
    }

    // Everything under the runtime folder is searched, not just this platform's
    // folder, so an unpacked release keeps working whatever the archive called
    // its own top directory.
    function findServerBinary() {
        const path = NodeIO.path;
        const fs = NodeIO.fs;
        const exe = LLAMA_EXE();
        const isFile = p => {
            try { return fs.existsSync(p) && fs.statSync(p).isFile(); }
            catch (e) { return false; }
        };

        if (llmServerPath) {
            const explicit = path.isAbsolute(llmServerPath)
                ? llmServerPath : path.join(gameBaseDir(), llmServerPath);
            if (isFile(explicit)) return explicit;
        }
        if (process.env.HYPERNET_LLAMA_SERVER && isFile(process.env.HYPERNET_LLAMA_SERVER)) {
            return process.env.HYPERNET_LLAMA_SERVER;
        }

        const shipped = path.join(LLAMA_RUNTIME_DIR(), LLAMA_PLATFORM(), exe);
        if (isFile(shipped)) return shipped;

        const roots = [LLAMA_RUNTIME_DIR(), modelsDir(), path.join(gameBaseDir(), 'tools')];
        for (const root of roots) {
            const found = searchForFile(root, exe, 3);
            if (found) return found;
        }
        for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
            if (dir && isFile(path.join(dir, exe))) return path.join(dir, exe);
        }
        return '';
    }

    function searchForFile(dir, name, depth) {
        const path = NodeIO.path;
        const fs = NodeIO.fs;
        if (depth < 0) return '';
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch (e) { return ''; }
        for (const entry of entries) {
            if (entry.isFile() && entry.name === name) return path.join(dir, entry.name);
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const found = searchForFile(path.join(dir, entry.name), name, depth - 1);
                if (found) return found;
            }
        }
        return '';
    }

    // A file that came out of an archive, or out of a checkout that dropped the
    // permission bits, is not executable yet.
    function makeRuntimeExecutable(dir) {
        if (process.platform === 'win32') return;
        const fs = NodeIO.fs;
        const path = NodeIO.path;
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) makeRuntimeExecutable(full);
                else if (entry.isFile()) { try { fs.chmodSync(full, 0o755); } catch (e) { /* not ours */ } }
            }
        } catch (e) { /* nothing to fix */ }
        // macOS refuses to run a binary that came down inside a quarantined
        // archive until the flag is off it.
        if (process.platform === 'darwin') {
            try { NodeIO.cp.spawnSync('xattr', ['-dr', 'com.apple.quarantine', dir], { windowsHide: true }); }
            catch (e) { /* xattr missing, nothing to strip */ }
        }
    }

    // GET that follows GitHub's redirects, either into memory or onto disk.
    function httpsGet(url, destPath, redirectsLeft = 5) {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const req = https.get(url, {
                headers: { 'User-Agent': 'HypernetExplorer', 'Accept': '*/*' }
            }, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
                    return resolve(httpsGet(res.headers.location, destPath, redirectsLeft - 1));
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }
                if (destPath) {
                    const file = NodeIO.fs.createWriteStream(destPath);
                    res.pipe(file);
                    file.on('finish', () => file.close(() => resolve(destPath)));
                    file.on('error', reject);
                } else {
                    let data = '';
                    res.setEncoding('utf8');
                    res.on('data', chunk => { data += chunk; });
                    res.on('end', () => resolve(data));
                }
            });
            req.on('error', reject);
            req.setTimeout(120000, () => req.destroy(new Error('timeout')));
        });
    }

    function runTool(cmd, args) {
        return new Promise(resolve => {
            let child;
            try { child = NodeIO.cp.spawn(cmd, args, { windowsHide: true, stdio: 'ignore' }); }
            catch (e) { return resolve(false); }
            child.on('error', () => resolve(false));
            child.on('exit', code => resolve(code === 0));
        });
    }

    // No unpacker is assumed to be there: tar ships with Windows 10 and up and
    // with every Unix, unzip with most Unixes, and PowerShell is the last
    // resort on Windows.
    async function extractArchive(archivePath, destDir) {
        const attempts = /\.tar\.gz$/i.test(archivePath)
            ? [['tar', ['-xzf', archivePath, '-C', destDir]]]
            : [
                ['tar', ['-xf', archivePath, '-C', destDir]],
                ['unzip', ['-q', '-o', archivePath, '-d', destDir]],
                ['powershell', ['-NoProfile', '-NonInteractive', '-Command',
                    `Expand-Archive -LiteralPath "${archivePath}" -DestinationPath "${destDir}" -Force`]]
            ];
        for (const [cmd, args] of attempts) {
            if (await runTool(cmd, args)) return true;
        }
        return false;
    }

    const LlamaRuntime = {
        _fetching: null,

        // Resolves to the path of a llama.cpp server this machine can run, or
        // to an empty string when there is none and none could be fetched.
        async ensure() {
            const existing = findServerBinary();
            if (existing) {
                makeRuntimeExecutable(NodeIO.path.dirname(existing));
                return existing;
            }
            if (!llmAutoDownload) return '';
            if (!this._fetching) {
                this._fetching = this._download().catch(e => {
                    console.warn(`[${pluginName}] Could not fetch a llama.cpp runtime:`, e);
                    return '';
                });
                this._fetching.then(() => { this._fetching = null; });
            }
            return this._fetching;
        },

        async _download() {
            const patterns = llamaAssetPatterns();
            if (patterns.length === 0) {
                llmToast('Markov.llm.noRuntime', { platform: LLAMA_PLATFORM() });
                return '';
            }
            llmToast('Markov.llm.fetchingRuntime');
            const release = JSON.parse(await httpsGet(llmReleaseApi, null));
            const assets = release.assets || [];
            let asset = null;
            for (const pattern of patterns) {
                asset = assets.find(a => pattern.test(a.name));
                if (asset) break;
            }
            if (!asset) {
                llmToast('Markov.llm.noRuntime', { platform: LLAMA_PLATFORM() });
                return '';
            }

            const fs = NodeIO.fs;
            const path = NodeIO.path;
            const destDir = path.join(LLAMA_RUNTIME_DIR(), LLAMA_PLATFORM());
            fs.mkdirSync(destDir, { recursive: true });
            const archivePath = path.join(destDir, asset.name);
            await httpsGet(asset.browser_download_url, archivePath);
            const unpacked = await extractArchive(archivePath, destDir);
            try { fs.unlinkSync(archivePath); } catch (e) { /* leave it behind */ }
            if (!unpacked) {
                llmToast('Markov.llm.noRuntime', { platform: LLAMA_PLATFORM() });
                return '';
            }
            makeRuntimeExecutable(destDir);
            const binary = findServerBinary();
            if (binary) llmToast('Markov.llm.gotRuntime');
            return binary;
        }
    };

    const LlamaServer = {
        _proc: null,
        _model: '',
        _boot: null,
        _ready: false,
        _external: false,
        _warned: false,
        // Up only while _start is running, so the exit of a server that failed
        // to boot does not throw away the boot promise a retry is still using.
        _starting: false,
        // Why the last run of the server did not answer: 'exit' (it quit) or
        // 'timeout' (it never finished loading).
        _bootFailure: '',

        // Whether a line asked for now would be answered rather than waited on.
        isReadyFor(modelName) {
            return this._ready && this._model === modelName;
        },

        async isUp() {
            try {
                const res = await llmRequest('/health', null, 2000);
                return res.status === 200;
            } catch (e) {
                return false;
            }
        },

        // Resolves true once a server holding this model answers on the port.
        ensure(modelName) {
            if (this._ready && this._model === modelName) return Promise.resolve(true);
            if (this._boot && this._model === modelName) return this._boot;
            if (this._model && this._model !== modelName) this.stop();
            this._model = modelName;
            this._boot = this._start(modelName).catch(e => {
                console.warn(`[${pluginName}] Language model server failed to start:`, e);
                return false;
            });
            return this._boot;
        },

        async _start(modelName) {
            this._starting = true;
            try {
                return await this._startAttempts(modelName);
            } finally {
                this._starting = false;
            }
        },

        async _startAttempts(modelName) {
            // A server the player started themselves owns the port: it is used
            // as it stands and is never spawned over or killed on the way out.
            if (await this.isUp()) {
                this._external = true;
                this._ready = true;
                return true;
            }
            const binary = await LlamaRuntime.ensure();
            if (!binary) {
                if (!this._warned) {
                    this._warned = true;
                    llmToast('Markov.llm.noRuntime', { platform: LLAMA_PLATFORM() });
                }
                return false;
            }
            const binDir = NodeIO.path.dirname(binary);
            const modelPath = NodeIO.path.join(modelsDir(), modelName);
            llmToast('Markov.llm.loading', { model: modelName.replace(/\.gguf$/i, '') });
            // The server is run from its own folder with that folder on the
            // library path: the shipped runtime is a binary plus the ggml and
            // llama shared libraries beside it, and every platform looks for
            // those in a different variable.
            const env = Object.assign({}, process.env);
            const prepend = (key, value) => {
                env[key] = value + (env[key] ? NodeIO.path.delimiter + env[key] : '');
            };
            if (process.platform === 'win32') prepend('PATH', binDir);
            else if (process.platform === 'darwin') prepend('DYLD_LIBRARY_PATH', binDir);
            else prepend('LD_LIBRARY_PATH', binDir);
            const chat = modelIsChat(modelName);
            const args = [
                '-m', modelPath,
                '--host', '127.0.0.1',
                '--port', String(llmPort),
                // An instruction tuned model is handed a system prompt, the
                // last turns of the conversation and the line just typed, so it
                // is given the room a lone action line never needed.
                '-c', String(chat ? Math.max(llmContextSize, LLM_CHAT_CONTEXT) : llmContextSize),
                '-t', String(Math.max(1, Math.min(8, (require('os').cpus() || []).length - 1 || 4)))
            ];
            // With --jinja the turns are wrapped in the model's own chat
            // template, out of the GGUF, which is the only way a Qwen or a
            // Llama 3 hears them the way it was trained to. A template
            // llama.cpp cannot render takes the server down with it, so that
            // run is not the only one: the server's built in template is tried
            // after it rather than the model being written off.
            if (chat) {
                if (await this._spawnAndWait(binary, args.concat(['--jinja']), binDir, env, modelName)) {
                    return true;
                }
                // Only a server that quit outright is worth a second run
                // without the model's own template. One that simply never
                // finished loading would only be made to load twice.
                if (this._bootFailure !== 'exit') return false;
            }
            return await this._spawnAndWait(binary, args, binDir, env, modelName);
        },

        // One run of the server, up to the moment it answers or gives up on
        // booting. Called twice at most per start, so it leaves nothing behind
        // that a second call would trip over.
        async _spawnAndWait(binary, args, binDir, env, modelName) {
            this._model = modelName;
            this._proc = NodeIO.cp.spawn(binary, args, {
                stdio: 'ignore', windowsHide: true, cwd: binDir, env: env
            });
            this._proc.on('error', e => {
                console.warn(`[${pluginName}] Could not run ${binary}:`, e);
                this._proc = null;
            });
            // A server that dies later must be started again rather than the
            // settled boot promise being handed out as if it were still up.
            this._proc.on('exit', () => {
                this._proc = null;
                this._ready = false;
                if (!this._starting) this._boot = null;
            });

            const deadline = Date.now() + LLM_BOOT_TIMEOUT_MS;
            while (Date.now() < deadline) {
                if (!this._proc) { this._bootFailure = 'exit'; return false; }
                if (await this.isUp()) {
                    this._ready = true;
                    llmToast('Markov.llm.ready', { model: modelName.replace(/\.gguf$/i, '') });
                    return true;
                }
                await new Promise(r => setTimeout(r, 750));
            }
            if (this._proc) { try { this._proc.kill(); } catch (e) { /* already gone */ } }
            this._proc = null;
            this._ready = false;
            this._bootFailure = 'timeout';
            return false;
        },

        stop() {
            if (this._proc && !this._external) {
                try { this._proc.kill(); } catch (e) { /* already gone */ }
            }
            this._proc = null;
            this._model = '';
            this._boot = null;
            this._ready = false;
            this._external = false;
        }
    };

    // The server is a child of the game, so it goes when the game goes. Which
    // of these fires depends on how the game was closed (window button, alt+F4,
    // a reload from the console), so all of them are listened for and stop() is
    // written to be safe to call twice.
    window.addEventListener('beforeunload', () => LlamaServer.stop());
    window.addEventListener('unload', () => LlamaServer.stop());
    try { process.on('exit', () => LlamaServer.stop()); } catch (e) { /* no node here */ }
    if (nodeAvailable && typeof nw !== 'undefined' && nw.App && nw.App.on) {
        try { nw.App.on('shutdown', () => { LlamaServer.stop(); nw.App.quit(); }); }
        catch (e) { /* older NW.js, the listeners above cover it */ }
    }

    function llmToast(key, params) {
        const text = T(key, params);
        if (window.ParchmentToast && window.ParchmentToast.show) window.ParchmentToast.show(text);
        else console.log(`[${pluginName}] ${text}`);
    }

    //-------------------------------------------------------------------------
    // Prompting and cleaning up after the model
    //-------------------------------------------------------------------------
    // A run of consecutive sentences out of the database the chain would have
    // used. It is what keeps the model speaking in the register of this game
    // rather than in AI Dungeon's.
    function llmSampleSentences(text, count) {
        const sentences = String(text || '')
            .split(/(?<=[\.\?\!])\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 12);
        if (sentences.length === 0) return '';
        const start = Math.floor(Math.random() * sentences.length);
        return sentences.slice(start, start + count).join(' ');
    }

    // Scenario, blank line, action line. The model continues from there.
    function llmBuildPrompt(spec) {
        const lines = [];
        const place = $gameMap && $gameMap.displayName ? $gameMap.displayName() : '';
        if (place) lines.push(T('Markov.llm.place', { place: place }));
        if (spec.npcName) lines.push(T('Markov.llm.withNpc', { npc: spec.npcName }));
        const sample = llmSampleSentences(spec.dbText, 4);
        if (sample) lines.push(sample);
        const scenario = lines.join(' ').slice(0, LLM_SCENARIO_CHARS);

        const seed = String(spec.startText || '').trim();
        const action = seed
            ? T('Markov.llm.actionSay', { text: seed })
            : spec.npcName
                ? T('Markov.llm.actionTalk', { npc: spec.npcName })
                : T('Markov.llm.actionListen');
        return `${scenario}\n\n${action}\n`;
    }

    // What comes back is a slice of an unfinished story: it can run past the
    // stop token, carry GPT-2's end marker, and break off mid sentence. Only
    // whole sentences are ever spoken.
    function llmClean(raw) {
        let text = String(raw || '').replace(/\r/g, '').replace(/<\|endoftext\|>/g, ' ');
        const nextTurn = text.indexOf('>');
        if (nextTurn >= 0) text = text.slice(0, nextTurn);
        text = text.replace(/\s+/g, ' ').trim();
        const lastStop = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
        if (lastStop >= 0) text = text.slice(0, lastStop + 1);
        return text.trim();
    }

    // One completion. Resolves to an empty string on any failure, which is the
    // caller's signal to speak the chain's line instead.
    async function llmComplete(prompt) {
        const model = selectedGgufModel();
        if (!model) return '';
        const running = await LlamaServer.ensure(model);
        if (!running) return '';
        const payload = Object.assign({
            prompt: prompt,
            n_predict: llmMaxTokens,
            stop: LLM_STOP,
            cache_prompt: true,
            stream: false
        }, LLM_SAMPLER);
        try {
            let res = await llmRequest('/completion', payload, llmTimeoutMs);
            if (res.status === 404) {
                // An OpenAI compatible server (or a build without the native
                // route) answers on /v1/completions instead.
                res = await llmRequest('/v1/completions', {
                    model: model,
                    prompt: prompt,
                    max_tokens: llmMaxTokens,
                    stop: LLM_STOP,
                    temperature: LLM_SAMPLER.temperature,
                    top_p: LLM_SAMPLER.top_p
                }, llmTimeoutMs);
            }
            if (res.status !== 200 || !res.body) return '';
            const content = res.body.content !== undefined
                ? res.body.content
                : (res.body.choices && res.body.choices[0] ? res.body.choices[0].text : '');
            return llmClean(content);
        } catch (e) {
            console.warn(`[${pluginName}] Language model request failed:`, e);
            return '';
        }
    }

    //-------------------------------------------------------------------------
    // Asking a chat tuned model
    //-------------------------------------------------------------------------
    // A chat model is told who it is playing, where it is standing and how the
    // people here talk, then handed the last turns of the conversation and the
    // line the player just typed. That is the whole of the prompt: the template
    // the model was trained on is applied by the server, out of the GGUF.
    function llmChatMessages(spec) {
        const npc = spec.npcName || T('Markov.unknownName');
        const place = $gameMap && $gameMap.displayName ? $gameMap.displayName() : '';
        const sample = llmSampleSentences(spec.dbText, 3);
        const system = [
            T('Markov.llm.chatSystem', { npc: npc }),
            spec.npcBio ? T('Markov.llm.chatAbout', { bio: spec.npcBio }) : '',
            place ? T('Markov.llm.chatPlace', { place: place }) : '',
            sample ? T('Markov.llm.chatFlavour', { text: sample }) : '',
            T('Markov.llm.chatStyle')
        ].filter(Boolean).join(' ');
        const messages = [{ role: 'system', content: system }];
        for (const turn of (spec.history || []).slice(-LLM_CHAT_HISTORY)) {
            const text = String((turn && turn.text) || '').trim();
            if (!text) continue;
            messages.push({ role: turn.role === 'npc' ? 'assistant' : 'user', content: text });
        }
        const said = String(spec.startText || '').trim();
        messages.push({ role: 'user', content: said || T('Markov.llm.chatOpen') });
        return messages;
    }

    // A chat model answers in its own voice and sometimes about its own voice:
    // a reasoning model thinks out loud in <think> blocks, a talkative one
    // opens with the name it was given or wraps the line in quotes, and one cut
    // off at the token limit stops mid sentence. None of that is spoken.
    function llmCleanChat(raw, npcName, truncated) {
        let text = String(raw || '').replace(/\r/g, '');
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
        const stray = text.lastIndexOf('</think>');
        if (stray >= 0) text = text.slice(stray + 8);
        text = text.replace(/<think>[\s\S]*$/i, ' ')
                   .replace(/<\|[^|]*\|>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();
        if (npcName) {
            const escaped = String(npcName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            text = text.replace(new RegExp('^' + escaped + '\\s*[:\u2013-]\\s*', 'i'), '');
        }
        text = text.replace(/^["'\u201c\u201d\u00ab\u00bb]+/, '')
                   .replace(/["'\u201c\u201d\u00ab\u00bb]+$/, '')
                   .trim();
        if (truncated) {
            const lastStop = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
            if (lastStop >= 0) text = text.slice(0, lastStop + 1);
        }
        return text.trim();
    }

    // One chat completion, on the OpenAI shaped route llama.cpp serves for it.
    // Empty on any failure, which is the caller's signal to fall back.
    async function llmChatComplete(spec) {
        const model = selectedGgufModel();
        if (!model) return '';
        const running = await LlamaServer.ensure(model);
        if (!running) return '';
        const payload = Object.assign({
            model: model,
            messages: llmChatMessages(spec),
            max_tokens: llmMaxTokens,
            stream: false,
            // A reasoning model left to think first spends the whole reply
            // budget on the thinking and says nothing with what is left.
            chat_template_kwargs: { enable_thinking: false }
        }, LLM_CHAT_SAMPLER);
        try {
            let res = await llmRequest('/v1/chat/completions', payload, llmTimeoutMs);
            if (res.status === 404) res = await llmRequest('/chat/completions', payload, llmTimeoutMs);
            if (res.status === 400) {
                // A server not rendering the model's own template refuses the
                // arguments meant for it.
                const plain = Object.assign({}, payload);
                delete plain.chat_template_kwargs;
                res = await llmRequest('/v1/chat/completions', plain, llmTimeoutMs);
            }
            if (res.status !== 200 || !res.body) return '';
            const choice = (res.body.choices && res.body.choices[0]) || null;
            if (!choice) return '';
            const content = choice.message ? choice.message.content : choice.text;
            return llmCleanChat(content, spec.npcName, choice.finish_reason === 'length');
        } catch (e) {
            console.warn(`[${pluginName}] Chat model request failed:`, e);
            return '';
        }
    }

    // The one way in: whichever of the two shapes the picked model is.
    function llmAnswer(spec) {
        if (!llmEnabled()) return Promise.resolve('');
        const opts = spec || {};
        return modelIsChat(selectedGgufModel())
            ? llmChatComplete(opts)
            : llmComplete(llmBuildPrompt(opts));
    }

    // The free chat panel's reply. The player wrote that line themselves and is
    // sitting in front of the answer, so this is the one caller that waits out
    // a cold start instead of letting the chain speak over it: with a model
    // picked, the model is who answers. Empty means it could not, and the
    // caller falls back to the chain.
    async function llmReply(spec) {
        if (!llmEnabled()) return '';
        const opts = spec || {};
        let dbText = opts.dbText || '';
        if (!dbText) {
            try {
                const database = getTextDB(opts.databaseId || 'all');
                dbText = ConfigManager.language === 'it' ? database.it : database.en;
            } catch (e) {
                dbText = '';
            }
        }
        return llmAnswer(Object.assign({}, opts, { dbText: dbText }));
    }

    //-------------------------------------------------------------------------
    // Serving the synchronous callers
    //-------------------------------------------------------------------------
    // generateMarkovString() has to answer on the spot, and a model does not.
    // So every call takes a line written ahead of time for that database and
    // orders the next one; until the first one lands the chain answers, which
    // is also what happens whenever the model is too slow to keep the queue
    // filled. A seeded call is not served this way: a reply that echoes the
    // player's own words cannot be written before they type them.
    const llmLineCache = new Map();
    const llmInFlight = new Set();

    function llmPrefetch(key, spec) {
        if (!llmEnabled() || llmInFlight.has(key)) return;
        llmInFlight.add(key);
        llmAnswer(spec).then(text => {
            if (!text) return;
            const queue = llmLineCache.get(key) || [];
            queue.push(text);
            while (queue.length > LLM_CACHE_LINES) queue.shift();
            llmLineCache.delete(key);
            llmLineCache.set(key, queue);
            while (llmLineCache.size > LLM_CACHE_KEYS) {
                llmLineCache.delete(llmLineCache.keys().next().value);
            }
        }).catch(() => { /* the chain answers instead */ })
          .then(() => { llmInFlight.delete(key); });
    }

    function llmTakeLine(key, spec) {
        if (!llmEnabled()) return '';
        const queue = llmLineCache.get(key);
        const line = queue && queue.length ? queue.shift() : '';
        llmPrefetch(key, spec);
        return line;
    }

    //-------------------------------------------------------------------------
    // Serving the message box
    //-------------------------------------------------------------------------
    // An event can wait, so it does: the interpreter holds on a wait mode of
    // its own until the model answers or the timeout runs out, and only then
    // is the line put in the message box.
    // The standing "thinking" notice, up only while a line is being written.
    const LLM_THINKING_KEY = 'markov-llm-thinking';  // i18n-ignore  toast key
    const LLM_THINKING_DELAY_MS = 500;

    function llmSticky(npcName) {
        const toast = window.ParchmentToast;
        if (!toast || !toast.sticky) return;
        toast.sticky(npcName ? T('Markov.llm.thinkingNpc', { npc: npcName }) : T('Markov.llm.thinking'),
            { key: LLM_THINKING_KEY });
    }

    function llmStickyDown() {
        const toast = window.ParchmentToast;
        if (toast && toast.dismiss) toast.dismiss(LLM_THINKING_KEY);
    }

    function addGeneratedMessage(text, refine) {
        llmStickyDown();
        const line = (typeof refine === 'function' ? (refine(text) || text) : text);
        window.skipLocalization = true;
        $gameMessage.add(line);
        window.skipLocalization = false;
    }

    function speakGenerated(interpreter, spec, fallbackText, background, position) {
        $gameMessage.setBackground(background);
        $gameMessage.setPositionType(position);
        if (!llmEnabled()) {
            addGeneratedMessage(fallbackText, spec.refine);
            interpreter.setWaitMode('message');
            return;
        }
        // Nobody waits on a model that is still reading itself off the disk:
        // the first lines of a session are the chain's while the server warms
        // up behind them, and the model takes over once it can answer.
        if (!LlamaServer.isReadyFor(selectedGgufModel())) {
            LlamaServer.ensure(selectedGgufModel());
            addGeneratedMessage(fallbackText, spec.refine);
            interpreter.setWaitMode('message');
            return;
        }
        const state = { done: false, text: '' };
        llmAnswer(spec)
            .then(text => { state.text = text; })
            .catch(() => { /* the chain answers instead */ })
            .then(() => { state.done = true; });
        // An event is never held past the request's own timeout.
        setTimeout(() => { state.done = true; }, llmTimeoutMs);
        // A line takes the model seconds, not frames, and a silent pause before
        // a message box reads as a hang. Anything under half a second passes
        // unremarked; past that the game says who is thinking.
        setTimeout(() => {
            if (!state.done) llmSticky(spec.npcName);
        }, LLM_THINKING_DELAY_MS);
        interpreter._markovLlmWait = { state: state, fallback: fallbackText, refine: spec.refine };
        interpreter.setWaitMode('markovLlm');
    }

    const _Game_Interpreter_updateWaitMode_markovLlm = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function () {
        if (this._waitMode === 'markovLlm') {
            const pending = this._markovLlmWait;
            if (pending && !pending.state.done) return true;
            this._markovLlmWait = null;
            if (pending) addGeneratedMessage(pending.state.text || pending.fallback, pending.refine);
            this.setWaitMode('message');
            return true;
        }
        return _Game_Interpreter_updateWaitMode_markovLlm.call(this);
    };

    // Read by anything that wants to know whether the model is doing the
    // talking, and by the async callers that can afford to wait for it.
    window.MarkovLLM = {
        isEnabled: llmEnabled,
        modelName: selectedGgufModel,
        // Whether the picked model would answer now rather than be waited on,
        // and the request that gets it there. Loading the weights takes as long
        // as it takes, so a caller that cannot sit through a cold start asks
        // first, speaks the chain's line, and has the model from the next one.
        isReady: () => llmEnabled() && LlamaServer.isReadyFor(selectedGgufModel()),
        warmUp: () => { if (llmEnabled()) LlamaServer.ensure(selectedGgufModel()); },
        listModels: listGgufModels,
        rescan: rescanGgufModels,
        stopServer: () => LlamaServer.stop(),
        // Which llama.cpp server this machine would run, and which release
        // archive it would fetch if it had none. Read by the debug console
        // when a model refuses to answer, and by scripts/test_markovllm.js.
        runtime: {
            platform: LLAMA_PLATFORM,
            path: findServerBinary,
            assetPatterns: llamaAssetPatterns
        },
        // Whether the picked model is an instruction tuned one, answered
        // through the chat route and able to hold a conversation, rather than
        // a plain completion model continuing a scenario.
        isChatModel: () => modelIsChat(selectedGgufModel()),
        // generate({ dbText, npcName, startText }) -> Promise<string>
        generate: (spec) => llmAnswer(spec || {}),
        // reply({ npcName, npcBio, startText, history, databaseId }) -> Promise<string>
        // What the free chat panel asks for: the model answers a typed line,
        // waiting out the cold start, and an empty string says the chain has to.
        reply: llmReply
    };

    // Log when the plugin command is registered

    // Register plugin command for normal text generation
    // Register plugin command for normal text generation
    PluginManager.registerCommand(pluginName, "generateText", function (args) {
        const evId = this._eventId;
        if (evId) {
            const ev = $gameMap.event(evId);
            if (ev) ev.turnTowardPlayer();
        }
        // 2) pause this event until the dialog finishes
        this.setWaitMode('message');

        const databaseId = args.databaseId;
        const chainOrder = Number(args.chainOrder || defaultChainOrder);
        const minLength = Number(args.minLength || defaultMinLength);
        const maxLength = Number(args.maxLength || defaultMaxLength);
        const background = Number(args.background || 0);
        const position = Number(args.position || 2);


        // Find the database (now supports comma-separated IDs and "all")
        let database;
        try {
            database = getTextDB(databaseId);
        } catch (error) {

            // Show an error message in-game
            $gameMessage.add(T('Markov.error', { message: error.message.split('] ')[1] }));
            $gameMessage.add(T('Markov.checkParams'));
            return;
        }


        const selectedLanguage = ConfigManager.language === 'it' ? database.it : database.en;

        // Get or build the Markov model (use the full databaseId as key for proper caching)
        const modelKey = `${database.id}_${chainOrder}`;
        const model = getMarkovModel(modelKey, () => new MarkovChain(selectedLanguage, chainOrder));

        // Generate text
        const generatedText = model.generateText(minLength, maxLength);
        const cleanText = generatedText.replace(/\s+/g, ' ').trim();

        // With a language model picked the chain's line becomes the fallback and
        // the model writes the line that is actually spoken.
        speakGenerated(this, { dbText: selectedLanguage }, cleanText, background, position);
    });

    function getTextDB(id) {
        const dbs = getAllTextDatabases();
        const searchId = id.toLowerCase();

        if (searchId === "all") {
            // Combine all databases into one
            return {
                id: "all",
                name: T('Markov.allDatabases'),
                en: dbs.map(db => db.en).join(' '),
                it: dbs.map(db => db.it).join(' ')
            };
        }

        // Check if multiple database IDs are provided (comma-separated)
        if (id.includes(',')) {
            const databaseIds = id.split(',').map(dbId => dbId.trim().toLowerCase());
            const foundDatabases = [];
            const missingDatabases = [];

            databaseIds.forEach(dbId => {
                const db = dbs.find(d => d.id && d.id.toLowerCase() === dbId);
                if (db) {
                    foundDatabases.push(db);
                } else {
                    missingDatabases.push(dbId);
                }
            });

            if (missingDatabases.length > 0) {
                throw new Error(`[${pluginName}] Text DB(s) "${missingDatabases.join(', ')}" not found`);
            }

            return {
                id: id,
                name: T('Markov.combined', { list: foundDatabases.map(db => db.name).join(', ') }),
                en: foundDatabases.map(db => db.en).join(' '),
                it: foundDatabases.map(db => db.it).join(' ')
            };
        }

        // Single database lookup (case-insensitive)
        const db = dbs.find(d => d.id && d.id.toLowerCase() === searchId);
        if (!db) {
            throw new Error(`[${pluginName}] Text DB "${id}" not found`);
        }
        return db;
    }
    // Seeded RNG based on seed value
    function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    /**
     * Merge multiple text databases intelligently for better variety
     * Interleaves text from multiple sources to preserve patterns from each
     */
    function mergeTextDatabases(databases, language, seed) {
        if (!databases || databases.length === 0) return "";
        if (databases.length === 1) {
            return language === 'it' ? databases[0].it : databases[0].en;
        }

        const texts = databases.map(db =>
            (language === 'it' ? db.it : db.en)
                .split(/\s+/)
                .filter(word => word.length > 0)
        );

        // Calculate how many words to take from each database per cycle
        const maxLength = Math.max(...texts.map(t => t.length));
        const chunkSize = Math.ceil(maxLength / (databases.length * 3)); // Smaller chunks for more interleaving

        const mergedWords = [];
        let rng = seed;

        // Interleave words from each database
        for (let cycle = 0; cycle < maxLength; cycle += chunkSize) {
            for (let i = 0; i < databases.length; i++) {
                const textWords = texts[i];
                if (cycle < textWords.length) {
                    // Take a chunk from this database's text
                    const endIdx = Math.min(cycle + chunkSize, textWords.length);
                    mergedWords.push(...textWords.slice(cycle, endIdx));

                    // Add occasional natural separator (sentence pause)
                    if (cycle > 0 && cycle % (chunkSize * 2) === 0) {
                        // Seeded decision to keep original punctuation or add separator
                        rng = seededRandom(rng + i * 100);
                        if (rng < 0.3 && mergedWords.length > 0) {
                            // Add a transition word or keep separator
                            const lastWord = mergedWords[mergedWords.length - 1];
                            if (!/[\.\?\!]$/.test(lastWord)) {
                                mergedWords[mergedWords.length - 1] += '.';
                            }
                        }
                    }
                }
            }
        }

        return mergedWords.join(' ');
    }

    // Register plugin command for seeded dialogue generation
    PluginManager.registerCommand(pluginName, "generateSeededDialogue", function (args) {
        const currentMapId = $gameMap.mapId();

        const evId = this._eventId;
        if (evId) {
            const ev = $gameMap.event(evId);
            if (ev) ev.turnTowardPlayer();
        }
        this.setWaitMode('message');

        const chainOrder = 1;
        const minLength = Number(args.minLength || defaultMinLength);
        const maxLength = Number(args.maxLength || defaultMaxLength);
        const background = Number(args.background || 0);
        const position = Number(args.position || 2);

        // Get seed from Variables 43, 44 and event ID
        const worldX = $gameVariables.value(43) || 1;
        const worldY = $gameVariables.value(44) || 1;
        const eventId = this._eventId || 1;

        // Create a combined seed from world coordinates and event ID
        const seed = (worldX * 73856093) ^ (worldY * 19349663) ^ (eventId * 83492791);

        // Determine how many databases to select (1-6)
        const rng1 = seededRandom(seed);
        const dbCount = Math.floor(rng1 * 6) + 1; // 1-6 databases

        // Select databases based on seed
        const selectedDatabases = [];
        const dbs = getAllTextDatabases();
        if (dbs.length === 0) {
            $gameMessage.add(T('Markov.noDatabases'));
            return;
        }

        // Use seeded random to select unique databases
        const availableIndices = Array.from({ length: dbs.length }, (_, i) => i);
        for (let i = 0; i < Math.min(dbCount, dbs.length); i++) {
            const rng = seededRandom(seed + i * 1000);
            const randomIdx = Math.floor(rng * availableIndices.length);
            const dbIndex = availableIndices[randomIdx];
            selectedDatabases.push(dbs[dbIndex]);
            availableIndices.splice(randomIdx, 1);
        }

        // Merge selected databases intelligently for better variety
        const selectedLanguage = ConfigManager.language === 'it' ? 'it' : 'en';
        const mergedTextContent = mergeTextDatabases(selectedDatabases, selectedLanguage, seed);

        const combinedText = {
            id: `seeded_${worldX}_${worldY}_${eventId}`,  // i18n-ignore  cache key
            name: T('Markov.seeded', { list: selectedDatabases.map(db => db.name).join(', ') }),
            en: selectedLanguage === 'en' ? mergedTextContent : '',
            it: selectedLanguage === 'it' ? mergedTextContent : ''
        };

        const selectedLanguageText = selectedLanguage === 'it' ? combinedText.it : combinedText.en;

        // Get or build the Markov model
        const modelKey = `${combinedText.id}_${chainOrder}`;
        const model = getMarkovModel(modelKey, () => new MarkovChain(selectedLanguageText, chainOrder));

        // Generate text
        const generatedText = model.generateText(minLength, maxLength);
        const cleanText = generatedText.replace(/\s+/g, ' ').trim();

        speakGenerated(this, { dbText: selectedLanguageText }, cleanText, background, position);
    });

    // Plain Markov generation for a given NPC's bank, with no message-box or
    // bust side effects: shared by the plugin command below and by
    // window.MarkovNPCDialogue, which DialogueSystem.js's social exchange
    // calls when Options > Dialogue Mode is set to Markovian. Throws when the
    // NPC's database cannot be resolved.
    function generateMarkovTextForNPC(npcName) {
        const databaseId = $gameSystem._npcSociety?.[npcName]?.markovDb || "all";
        const database = getTextDB(databaseId);

        const chainOrder = 1;
        const minLength = 8;
        // Randomize max length on every interaction (15–50 words)
        const maxLength = Math.floor(Math.random() * 36) + 15;

        const selectedLanguage = ConfigManager.language === 'it' ? database.it : database.en;
        const modelKey = `${database.id}_${chainOrder}`;
        const model = getMarkovModel(modelKey, () => new MarkovChain(selectedLanguage, chainOrder));

        const generatedText = model.generateText(minLength, maxLength);
        return { text: generatedText.replace(/\s+/g, ' ').trim(), language: selectedLanguage };
    }

    window.MarkovNPCDialogue = {
        generateLine(npcName) {
            try {
                return generateMarkovTextForNPC(npcName).text;
            } catch (error) {
                return '';
            }
        }
    };

    // Register plugin command for NPC-specific dialogue generation
    PluginManager.registerCommand(pluginName, "generateNPCDialogue", function (args) {
        // Talking to an NPC belongs to DialogueSystem's Rumors command, which
        // is the only place Options > Dialogue Mode is read and the only one
        // that stages the exchange over busts. Events still carrying this
        // older command (an old map, a mod, a runtime-minted slot) are handed
        // straight over to it, so Empathize mode never falls through to the
        // faceless Markov box; markovian mode reaches its Markov line through
        // the same exchange.
        if (window.NPCTalk && window.NPCTalk.play(this) !== false) return;
        const evId = this._eventId;
        if (evId) {
            const ev = $gameMap.event(evId);
            if (ev) ev.turnTowardPlayer();
        }
        this.setWaitMode('message');

        const background = Number(args.background || 0);
        const position = Number(args.position || 2);

        // Resolve the NPC's associated Markov database from their society profile
        const npcEvent = evId ? $gameMap.event(evId) : null;
        const npcName = npcEvent?.event()?.name;

        let generated;
        try {
            generated = generateMarkovTextForNPC(npcName);
        } catch (error) {
            $gameMessage.add(T('Markov.error', { message: error.message.split('] ')[1] || error.message }));
            return;
        }

        // Whoever wrote the line, chain or model, it is finished the same way:
        // a non-sentient creature (NPCCreature: an NPC played as one of the
        // creature classes) has no words, so the length of what was written is
        // what decides how long the noise is, exactly as it is when a
        // non-sentient PARTY member does the talking (see NPCEmpathize), and
        // the line is kept on the NPC's society profile so it shows up in their
        // chat history in the Empathize panel, not just in this message box.
        const refine = (text) => {
            let line = text;
            const EM = window.NPCEmpathize;
            if (npcName && EM?.isNonSentientNPC?.(npcName)) {
                line = EM.growlFor(line, npcName) || line;
            }
            if (npcName) EM?.recordNPCLine?.(npcName, line);
            return line;
        };

        speakGenerated(this, { dbText: generated.language, npcName: npcName, refine: refine },
            generated.text, background, position);
    });

    // Register plugin command for name generation
    PluginManager.registerCommand(pluginName, "generateName", args => {

        const databaseId = args.databaseId;
        const chainOrder = Number(args.chainOrder || 2);
        const minChars = Number(args.minChars || defaultMinChars);
        const maxChars = Number(args.maxChars || defaultMaxChars);
        const useWordMode = args.useWordMode === "true";
        const variableId = Number(args.variableId || 0);
        const displayInMessage = args.displayInMessage === "true";


        // Find the database
        const dbs = getAllTextDatabases();
        const database = dbs.find(db => db.id && db.id.toLowerCase() === databaseId.toLowerCase());

        if (!database) {

            // Show an error message in-game
            if (displayInMessage) {
                $gameMessage.add(T('Markov.databaseMissing', { id: databaseId }));
                $gameMessage.add(T('Markov.checkParams'));
            }
            return;
        }


        let generatedName = "";

        if (useWordMode) {
            // Use word-based mode (for compound names)
            const modelKey = `${databaseId}_${chainOrder}`;
            const model = getMarkovModel(modelKey, () => new MarkovChain(database.en, chainOrder));

            // Generate name using word-based mode
            generatedName = model.generateWordBasedName(minChars, maxChars);
        } else {
            // Use character-based mode (for more unusual names)
            const modelKey = `char_${databaseId}_${chainOrder}`;  // i18n-ignore  cache key
            if (!characterMarkovModels[modelKey]) {
                characterMarkovModels[modelKey] = new CharacterMarkov(database.en, chainOrder);
            }

            // Generate name using character-based mode
            generatedName = characterMarkovModels[modelKey].generateName(minChars, maxChars);
        }

        // Ensure first letter is capitalized
        generatedName = capitalizeFirstLetter(generatedName);


        // Store in game variable if a variable ID was provided
        if (variableId > 0) {
            $gameVariables.setValue(variableId, generatedName);
        }

        // Set actor name if an actor ID was provided
        const actorId = Number(args.actorId || 0);
        if (actorId > 0) {
            const actor = $gameActors.actor(actorId);
            if (actor) {
                actor.setName(generatedName);
            }
        }

        // Display in message window if requested
        if (displayInMessage) {
            $gameMessage.add(generatedName);
        }
    });

    // Log when the plugin is fully loaded

    if (typeof window.generateMarkovString === 'undefined') {
        window.generateMarkovString = function (databaseId, options = {}) {

            // Set default options
            const chainOrder = Number(options.chainOrder || defaultChainOrder);
            const minLength = Number(options.minLength || defaultMinLength);
            const maxLength = Number(options.maxLength || defaultMaxLength);


            // Find the database (supports single ID, comma-separated IDs, or "all")
            let database;
            try {
                database = getTextDB(databaseId);
            } catch (error) {
                return `ERROR: ${error.message.split('] ')[1]}`;
            }


            // Select language based on current configuration
            const selectedLanguage = ConfigManager.language === 'it' ? database.it : database.en;

            // Get or build the Markov model (use the full databaseId as key for proper caching)
            const modelKey = `${database.id}_${chainOrder}`;
            const model = getMarkovModel(modelKey, () => new MarkovChain(selectedLanguage, chainOrder));

            // Generate and return text. When a startText seed is supplied the
            // reply begins with it and the chain continues from there.
            const startText = options.startText;
            const generatedText = (startText && typeof model.generateFrom === 'function')
                ? model.generateFrom(String(startText), minLength, maxLength)
                : model.generateText(minLength, maxLength);

            // A caller that wants an answer this instant gets a line the picked
            // language model wrote earlier for this database, if one is waiting;
            // the chain's line covers the wait for the first one. A seeded call
            // has to be answered by the chain, since a reply echoing the
            // player's own words cannot have been written before they typed it:
            // generateMarkovStringAsync() is the way to have the model answer
            // those, for callers that can wait.
            if (!startText) {
                const llmLine = llmTakeLine(`gen_${database.id}`, { dbText: selectedLanguage });
                if (llmLine) return llmLine;
            }

            return generatedText;
        };
    }

    // The awaited form of the above: with a model picked it resolves to what
    // the model writes, seed and all, and falls back to the chain whenever the
    // model has nothing to say.
    if (typeof window.generateMarkovStringAsync === 'undefined') {
        window.generateMarkovStringAsync = async function (databaseId, options = {}) {
            if (llmEnabled()) {
                let database = null;
                try { database = getTextDB(databaseId); } catch (error) { database = null; }
                if (database) {
                    const dbText = ConfigManager.language === 'it' ? database.it : database.en;
                    const line = await llmAnswer({
                        dbText: dbText,
                        npcName: options.npcName,
                        npcBio: options.npcBio,
                        history: options.history,
                        startText: options.startText
                    });
                    if (line) return line;
                }
            }
            return window.generateMarkovString(databaseId, options);
        };
    }

    // Seeded random generator for deterministic name generation
    function seededRandomMarkov(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    // Generate seeded names for procedural map NPCs
    if (typeof window.generateSeededMarkovName === 'undefined') {
        window.generateSeededMarkovName = function (worldX, worldY, eventId, databaseId, chainOrder = 2, minChars = 4, maxChars = 12) {
            // Create deterministic seed from world coordinates and event ID
            const seed = (worldX * 73856093) ^ (worldY * 19349663) ^ (eventId * 83492791);

            // Find the database
            let database;
            try {
                database = getTextDB(databaseId);
            } catch (error) {
                console.warn(`[MarkovTextGenerator] Database "${databaseId}" not found: ${error.message}`);
                return T('Markov.unknownName');
            }

            // Use character-based Markov for name generation
            const modelKey = `char_${databaseId}_${chainOrder}_seeded`;  // i18n-ignore  cache key
            if (!characterMarkovModels[modelKey]) {
                characterMarkovModels[modelKey] = new CharacterMarkov(database.en, chainOrder);
            }

            const markovModel = characterMarkovModels[modelKey];

            // Generate name using seeded random number
            if (markovModel.startSequences.length === 0) {
                return T('Markov.unknownName');
            }

            // Use seeded RNG to pick starting sequence
            let generationSeed = seed;
            const rng = seededRandomMarkov(generationSeed);
            const startSeq = markovModel.startSequences[Math.floor(rng * markovModel.startSequences.length)];
            let result = startSeq;

            // Generate characters until we reach the max length
            while (result.length < maxChars) {
                const currentState = result.substring(result.length - markovModel.order);

                // If we don't have this sequence in our model, break
                if (!markovModel.model[currentState] || markovModel.model[currentState].length === 0) {
                    break;
                }

                // Use seeded RNG to pick next character
                generationSeed = generationSeed * 1103515245 + 12345; // Linear congruential generator
                const nextCharRng = seededRandomMarkov(generationSeed);
                const nextChars = markovModel.model[currentState];
                const nextChar = nextChars[Math.floor(nextCharRng * nextChars.length)];

                // Check if we reached a natural end
                if (nextChar === '$END') {
                    if (result.length >= minChars) {
                        break;
                    } else {
                        // Skip this ending and try again
                        generationSeed = generationSeed * 1103515245 + 12345;
                        continue;
                    }
                }

                result += nextChar;
            }

            // Ensure minimum length
            if (result.length < minChars) {
                // Try to pad with characters from current state if possible
                let attempts = 0;
                while (result.length < minChars && attempts < 10) {
                    const currentState = result.substring(result.length - markovModel.order);
                    if (markovModel.model[currentState] && markovModel.model[currentState].length > 0) {
                        generationSeed = generationSeed * 1103515245 + 12345;
                        const paddingRng = seededRandomMarkov(generationSeed);
                        const char = markovModel.model[currentState][Math.floor(paddingRng * markovModel.model[currentState].length)];
                        if (char !== '$END') {
                            result += char;
                        }
                    }
                    attempts++;
                }
            }

            // Ensure truncate if too long
            if (result.length > maxChars) {
                result = result.substring(0, maxChars);
            }

            // Capitalize first letter
            return capitalizeFirstLetter(result);
        };
    }
})();