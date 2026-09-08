/*:
 * @target MZ MV
 * @plugindesc A localization system that replaces game text based on CSV data. The best localization plugin <3
 * @author Sang Hendrix
 * @url https://sanghendrix.itch.io/
 * 
 * @help
 * Verion 1.5.7
 * ----------------------------------------------------------------------------
 * This is a plugin for RPG Maker MV/MZ that allows you to translate everything you
 * see from your game using a auto generated CSV file, and you don't need to
 * touch your in-editor text. Totally un-destructive method and automatic.
 * All you need to do is to translate, the plugin handles the rest.
 * ----------------------------------------------------------------------------
 * FEATURES
 * - Add languages, custom font and size for each language.
 * - Auto generate a translation file with all languages you added.
 * - Auto extract all game messages, choices, common events, 
 * variables, pictures and database.
 * - Everything is categorized and organized.
 * - Any adjustments made in the editor will be updated to the translation file.
 * - Auto update and backup your translation file.
 * - Translation file is saved as game_messages.csv, very easy to use.
 * - Manually add anything you want to translate to the same csv file.
 * - NON-DESTRUCTIVE. Say no to replacing your in-editor text.
 * - Cache your translation. Help improving performance greatly.
 * - An awesome dev to support you 24/7.
 * ----------------------------------------------------------------------------
 * HOW TO USE
 * - How do I use this?
 * Turn on Extract Text parameter > Start the game > Hit Yes to generate
 * all context from your game to a translation file (game_messages.csv).
 * Whatever you type to this file will be shown in-game.
 * Story mode: https://www.youtube.com/watch?v=QvHeVdmUjRQ
 * 
 * - What if I want to translate something manually?
 * Then open game_messages.csv and type it in <3.
 * 
 * - What's with the columns?
 * Change column: To tell you which line is Newly added.
 * Original: Whatever is written in here will be translated.
 * Languages column (en, vi, jp, es...): Put you translation here.
 * 
 * - How to check the current language using conditional branch?
 * Simply put this: ConfigManager.language === 'en' (en is your symbol)
 * 
 * - I'm gonna localize pictures so I'm gonna use ConfigManager.language...
 * STOP! This plugin is created so you don't do any manual work.
 * Watch this video: https://www.youtube.com/watch?v=V0e5w1c0tgE
 * ----------------------------------------------------------------------------
 * SCRIPT CALL
 * To change to a specific language: changeToLanguage('languageSymbol')
 * Example: changeToLanguage('en') or changeToLanguage('jp')
 * To change to the next avaiable language: changeToLanguage('next')
 * ----------------------------------------------------------------------------
 * For feedback or feature request, please dm me on X or Facebook:
 * https://x.com/sanghendrix96
 * Discord: Sang Hendrix #3505
 * or my group Discord: https://discord.com/invite/YKPscqHV8b
 * 
 * @param Exact Text
 * @text Extract Text
 * @type boolean
 * @desc If true, extracts messages. If false, uses translations.
 * @default false
 * 
 * @param decor1
 * @text ==========================
 * @type text
 * @default ===============================
 * 
 * @param Adding Maps name
 * @type boolean
 * @desc If true, adds map names before dialogues when extracting messages.
 * @default true
 * 
 * @param Extract Map Display Names
 * @type boolean
 * @desc If true, extracts map display names.
 * @default false
 * 
 * @param Extract Names (MZ)
 * @text Create Name Column (MZ)
 * @type boolean
 * @desc Extracts the name box from Show Message commands to a separate CSV column. Only for MZ.
 * @default false
 * 
 * @param Extract Database Entries
 * @type boolean
 * @desc If true, extracts database entries when Exact Text is also true.
 * @default false
 * 
 * @param Extract Variable Text
 * @type boolean
 * @desc If true, extracts the script text of all variables when Exact Text is also true.
 * @default false
 * 
 * @param Extract Show Picture
 * @type boolean
 * @desc If true, extracts the default filename of all Show Pictures commands.
 * @default false
 * 
 * @param Extract Play Movies
 * @type boolean
 * @desc If true, extracts the filename of all Play Movie commands.
 * @default false
 * 
 * @param Extract Script Call
 * @type boolean
 * @desc If true, extracts text from script calls.
 * @default false
 * 
 * @param Extract Plugin Command Text
 * @type boolean
 * @desc If true, extracts text from plugin commands (string, text, note types).
 * @default false
 * 
 * @param Extract Comments
 * @type boolean
 * @desc If true, extracts comments (the green text) from events when Exact Text is also true.
 * @default false
 * 
 * @param Exclude Name Text
 * @text Exclude Text Before ":"
 * @type boolean
 * @desc Excludes all text from extraction before the character ":" ("David: hehe" --csv-> "hehe").
 * @default false
 * 
 * @param decor2
 * @text ==========================
 * @type text
 * @default ===============================
 * 
 * @param Partial Matching
 * @type boolean
 * @desc If true, enables partial matching for translations. If false, only exact matches are used.
 * @default false
 * 
 * @param Use Translation Cache
 * @type boolean
 * @desc If true, caches translated results for frequently used text. Heavily improve performance.
 * @default false
 * 
 * @param Auto Refresh Pictures
 * @type boolean
 * @desc If true, automatically refreshes pictures when changing language.
 * @default false
 * 
 * @param decor3
 * @text ==========================
 * @type text
 * @default ===============================
 *
 * @param Languages
 * @type struct<Language>[]
 * @desc List of available languages
 *
 * @param Default Language
 * @type string
 * @desc The symbol of the default language to use for translations
 * @default en
 * 
 * @param Add Language Command to Title
 * @text Add Language to Title
 * @type boolean
 * @desc If true, adds a language selection command to the title screen.
 * @default false
 * 
 * @param decor4
 * @text ==========================
 * @type text
 * @default ===============================
 * 
 * @param Excluded Symbols
 * @type struct<PushSymbol>[]
 * @desc Symbols to push to Excluded column. Example: \n<*>, \pop[*]. Only for advanced usage.
 * @default []
 * 
 */

/*~struct~PushSymbol:
 * @param Symbol
 * @type string
 * @desc The symbol used to identify text to push to Excluded column (e.g., \n<*>)
 * @default \n<*>
 */

/*~struct~Language:
 * @param Name
 * @type string
 * @desc The display name of the language
 *
 * @param Symbol
 * @type string
 * @desc The symbol used to identify this language (e.g., en, vi)
 *
 * @param Font
 * @type string
 * @desc The name of the font file in the fonts folder (e.g., myfont.ttf)
 *
 * @param FontSize
 * @type number
 * @min 1
 * @desc The font size to use for this language
 * @default 28
 */

var Imported = Imported || {};
Imported.Hendrix_Localization = true;

(function () {
    let fs, path;
    if (typeof require === 'function') {
        fs = require('fs');
        path = require('path');
    } else {
        fs = null;
        path = null;
    }

    // Safely read and parse a map file. Returns null (and warns) on a missing or
    // malformed file so a single bad map cannot abort a whole extraction pass.
    function readMapDataSafe(mapId) {
        try {
            return JSON.parse(fs.readFileSync(path.join('data', `Map${String(mapId).padStart(3, '0')}.json`), 'utf8'));
        } catch (e) {
            console.warn(`Hendrix_Localization: failed to read/parse Map${String(mapId).padStart(3, '0')}.json, skipping.`, e);
            return null;
        }
    }

    const parameters = PluginManager.parameters('Hendrix_Localization');
    const extractComments = parameters['Extract Comments'] === 'true';
    const exactText = parameters['Exact Text'] === 'true';
    const extractDatabaseEntries = parameters['Extract Database Entries'] === 'true';
    const addingMapsName = parameters['Adding Maps name'] === 'true';
    const extractNamesMZ = parameters['Extract Names (MZ)'] === 'true';
    const excludeNameText = parameters['Exclude Name Text'] === 'true';
    const extractVariableText = parameters['Extract Variable Text'] === 'true';
    const extractPluginCommandText = parameters['Extract Plugin Command Text'] === 'true';
    // The game ships locked to English for now: the language selector is off the
    // title screen and the Language row is out of the options menu, so nothing
    // may switch away from LOCKED_LANGUAGE while this is set.
    const LOCKED_LANGUAGE = 'en';
    const defaultLanguage = LOCKED_LANGUAGE || parameters['Default Language'];
    const partialMatching = parameters['Partial Matching'] === 'true';
    const useTranslationCache = parameters['Use Translation Cache'] === 'true';
    let languagesParam = [];
    try {
        languagesParam = JSON.parse(parameters['Languages'] || '[]');
    } catch (e) {
        console.warn('Hendrix_Localization: failed to parse Languages param, using empty list.', e);
        languagesParam = [];
    }
    const extractShowPicture = parameters['Extract Show Picture'] === 'true';
    const autoRefreshPictures = parameters['Auto Refresh Pictures'] === 'true';
    let pushSymbols = [];
    try {
        pushSymbols = JSON.parse(parameters['Excluded Symbols'] || '[]').map(symbol => JSON.parse(symbol).Symbol);
    } catch (e) {
        console.warn('Hendrix_Localization: failed to parse Excluded Symbols param, using empty list.', e);
        pushSymbols = [];
    }
    const addLanguageCommandToTitle = parameters['Add Language Command to Title'] === 'true';
    const extractPlayMovies = parameters['Extract Play Movies'] === 'true';
    const extractScriptCall = parameters['Extract Script Call'] === 'true';
    const extractMapDisplayNames = parameters['Extract Map Display Names'] === 'true';

    const languages = languagesParam.map(lang => {
        try {
            return typeof lang === 'string' ? JSON.parse(lang) : lang;
        } catch (e) {
            console.warn('Hendrix_Localization: failed to parse a language entry, skipping.', e);
            return null;
        }
    }).filter(lang => lang);
    const languageSymbols = languages.map(lang => lang.Symbol);

    // Friendly names for languages that exist as an i18n/<symbol> folder but were
    // not declared in the plugin's Languages parameter, so every selectable
    // language still shows a readable label instead of a blank one.
    const LANGUAGE_DISPLAY_NAMES = {
        en: 'English', it: 'Italiano', nk: 'Naguka', fr: 'Français', de: 'Deutsch',
        es: 'Español', pt: 'Português', ru: 'Русский', ko: '한국어',
        ja: '日本語', zh: '中文', pl: 'Polski', nl: 'Nederlands',
        tr: 'Türkçe', vi: 'Tiếng Việt',
    };

    // Order the language selector offers: the languages that are actually
    // translated come first (English, then Italian, then Naguka), everything
    // else keeps the order the i18n folder was read in.
    //
    // Naguka ("nk") is the Goblin patois: only the UI chrome (terms/system/
    // commands/misc plus every plugins/*.json screen) is rendered into it, in
    // ALL CAPS, by tools/i18n/gen_naguka.js. The narrative banks (conversations/,
    // lore/, news/help, database content like items/skills/enemies) are left
    // untranslated on purpose and fall back to English, the same way the
    // in-fiction Naguka "express themselves like children" (docs/Lore.md) while
    // everything around them stays in the surface-dwellers' tongue.
    const LANGUAGE_MENU_ORDER = ['en', 'it', 'nk'];

    // Languages carried far enough to be offered without a caveat. Every other
    // folder is shown with its completion share so nobody picks one blind.
    const TRANSLATED_LANGUAGES = LANGUAGE_MENU_ORDER;

    function sortLanguagesForMenu(list) {
        const rank = symbol => {
            const i = LANGUAGE_MENU_ORDER.indexOf(symbol);
            return i === -1 ? LANGUAGE_MENU_ORDER.length : i;
        };
        // Array#sort is stable, so unlisted languages keep their scan order.
        return list.slice().sort((a, b) => rank(a) - rank(b));
    }

    // Display name for a language symbol: prefer the configured Languages param,
    // then the built-in friendly map, then the uppercased symbol.
    function getLanguageName(symbol) {
        if (!symbol) return '';
        const langObj = languages.find(lang => lang.Symbol === symbol);
        if (langObj && langObj.Name) return langObj.Name;
        return LANGUAGE_DISPLAY_NAMES[symbol] || symbol.toUpperCase();
    }

    // Label used wherever a language is offered for selection: the plain name
    // for the translated ones, name plus completion share for the rest.
    function getLanguageMenuLabel(symbol) {
        const name = getLanguageName(symbol);
        if (!symbol || TRANSLATED_LANGUAGES.includes(symbol)) return name;
        return T('GameOptions.languageProgress', { name: name });
    }

    let currentLanguage = defaultLanguage;
    let availableLanguages = [];
    let messages = [];
    let translations = {};
    let translationCache = {};
    let originalTitle1 = '';
    let originalTitle2 = '';
    const wordBoundaryRegex = /\b/g;
    let uniqueMessages = new Set();
    const originalTexts = [];
    const wordTranslationRegexes = new Map();
    const messageData = new Map();

    const I18N_DIR = 'js/i18n/';
    const JSON_FILE_PATH = 'game_messages.json'; // Keep for compatibility or legacy

    const CATEGORY_MAP = {
        '[Actors]': 'actors',
        '[Classes]': 'classes',
        '[Skills]': 'skills',
        '[Items]': 'items',
        '[Weapons]': 'weapons',
        '[Armors]': 'armors',
        '[Enemies]': 'enemies',
        '[States]': 'states',
        '[Types]': 'types',
        '[Terms]': 'terms',
        '[System Messages]': 'terms',
        '[DATABASE ENTRIES]': 'database',
        '[GAME TITLE]': 'system',
        '[Title Screen]': 'system',
        '[TROOPS]': 'troops',
        '[SHOW PICTURES]': 'pictures',
        '[PLAY MOVIES]': 'movies',
        '[SCRIPT CALLS]': 'scripts',
        '[PLUGIN COMMANDS]': 'plugin_commands',
        '[Common Events]': 'common_events',
        '[VARIABLES]': 'variables',
        '[MAP DISPLAY NAMES]': 'maps',
        '[Comments]': 'comments',
        '[GARBAGE AND \\nCUSTOM LINES]': 'misc'
    };

    function getCategory(header) {
        if (CATEGORY_MAP[header]) return CATEGORY_MAP[header];
        if (header && header.startsWith('[') && header.endsWith(']')) return 'maps';
        return 'misc';
    }

    function copyFolderRecursiveSync(source, target) {
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
        }

        if (fs.existsSync(source)) {
            const files = fs.readdirSync(source);
            files.forEach(file => {
                const curSource = path.join(source, file);
                const curTarget = path.join(target, file);
                if (fs.lstatSync(curSource).isDirectory()) {
                    copyFolderRecursiveSync(curSource, curTarget);
                } else {
                    fs.copyFileSync(curSource, curTarget);
                }
            });
        }
    }


    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractYepName(text) {
        let yepName = '';
        let remainingText = text;

        for (const symbol of pushSymbols) {
            const escapedSymbol = escapeRegExp(symbol);
            const regex = new RegExp(escapedSymbol.replace('\\*', '(.+?)'), 'g');
            let match;
            while ((match = regex.exec(remainingText)) !== null) {
                yepName += match[0];
                remainingText = remainingText.replace(match[0], '');
            }
        }

        return { yepName, remainingText };
    }


    // Hook into the game loading process
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function () {
        _Scene_Boot_start.call(this);
        if (Imported['YEP_MessageCore']) {
            this.updateMessageCoreEscapeCharacters();
        }
        if (exactText) {
            setTimeout(extractAllMessages, 1000);
        }
        loadTranslations(currentLanguage);
        applyLanguageSettings();
    };

    Scene_Boot.prototype.updateMessageCoreEscapeCharacters = function () {
        Game_Message.prototype.addText = function (text) {
            if ($gameSystem.wordWrap()) text = '<WordWrap>' + Hendrix_Localization(text);
            this.add(text);
        };

        Window_Base.prototype.setWordWrap = function (text) {
            this._wordWrap = false;
            if (text.match(/<(?:WordWrap)>/i)) {
                this._wordWrap = true;
                text = text.replace(/<(?:WordWrap)>/gi, '');
            }
            if (this._wordWrap) {
                var replace = Yanfly.Param.MSGWrapSpace ? ' ' : '';
                text = Hendrix_Localization(text).replace(/[\n\r]+/g, replace);
            }
            if (this._wordWrap) {
                text = Hendrix_Localization(text).replace(/<(?:BR|line break)>/gi, '\n');
            } else {
                text = Hendrix_Localization(text).replace(/<(?:BR|line break)>/gi, '');
            }
            return text;
        };

        Window_Base.prototype.escapeIconItem = function (n, database) {
            return '\x1bI[' + database[n].iconIndex + ']' + Hendrix_Localization(database[n].name);
        };

        var _Window_Base_convertExtraEscapeCharacters = Window_Base.prototype.convertExtraEscapeCharacters;
        Window_Base.prototype.convertExtraEscapeCharacters = function (text) {
            text = _Window_Base_convertExtraEscapeCharacters.call(this, text);
            // \AC[n]
            text = text.replace(/\x1bAC\[(\d+)\]/gi, function () {
                return Hendrix_Localization(this.actorClassName(parseInt(arguments[1])));
            }.bind(this));
            // \AN[n]
            text = text.replace(/\x1bAN\[(\d+)\]/gi, function () {
                return Hendrix_Localization(this.actorNickname(parseInt(arguments[1])));
            }.bind(this));
            // \PC[n]
            text = text.replace(/\x1bPC\[(\d+)\]/gi, function () {
                return Hendrix_Localization(this.partyClassName(parseInt(arguments[1])));
            }.bind(this));
            // \PN[n]
            text = text.replace(/\x1bPN\[(\d+)\]/gi, function () {
                return Hendrix_Localization(this.partyNickname(parseInt(arguments[1])));
            }.bind(this));
            // \NC[n]
            text = text.replace(/\x1bNC\[(\d+)\]/gi, function () {
                return Hendrix_Localization($dataClasses[parseInt(arguments[1])].name);
            }.bind(this));
            // \NI[n]
            text = text.replace(/\x1bNI\[(\d+)\]/gi, function () {
                return Hendrix_Localization($dataItems[parseInt(arguments[1])].name);
            }.bind(this));
            // \NW[n]
            text = text.replace(/\x1bNW\[(\d+)\]/gi, function () {
                return Hendrix_Localization($dataWeapons[parseInt(arguments[1])].name);
            }.bind(this));
            // \NA[n]
            text = text.replace(/\x1bNA\[(\d+)\]/gi, function () {
                return Hendrix_Localization($dataArmors[parseInt(arguments[1])].name);
            }.bind(this));
            // \NE[n]
            text = text.replace(/\x1bNE\[(\d+)\]/gi, function () {
                return Hendrix_Localization($dataEnemies[parseInt(arguments[1])].name);
            }.bind(this));
            // \NS[n]
            text = text.replace(/\x1bNS\[(\d+)\]/gi, function () {
                return Hendrix_Localization($dataSkills[parseInt(arguments[1])].name);
            }.bind(this));
            // \NT[n]
            text = text.replace(/\x1bNT\[(\d+)\]/gi, function () {
                return Hendrix_Localization($dataStates[parseInt(arguments[1])].name);
            }.bind(this));
            // \II[n]
            text = text.replace(/\x1bII\[(\d+)\]/gi, function () {
                return this.escapeIconItem(arguments[1], Hendrix_Localization($dataItems));
            }.bind(this));
            // \IW[n]
            text = text.replace(/\x1bIW\[(\d+)\]/gi, function () {
                return this.escapeIconItem(arguments[1], Hendrix_Localization($dataWeapons));
            }.bind(this));
            // \IA[n]
            text = text.replace(/\x1bIA\[(\d+)\]/gi, function () {
                return this.escapeIconItem(arguments[1], Hendrix_Localization($dataArmors));
            }.bind(this));
            // \IS[n]
            text = text.replace(/\x1bIS\[(\d+)\]/gi, function () {
                return this.escapeIconItem(arguments[1], Hendrix_Localization($dataSkills));
            }.bind(this));
            // \IT[n]
            text = text.replace(/\x1bIT\[(\d+)\]/gi, function () {
                return this.escapeIconItem(arguments[1], Hendrix_Localization($dataStates));
            }.bind(this));

            return text;
        };
    };

    function applyLanguageSettings() {
        const currentLangSettings = languages.find(lang => lang.Symbol === currentLanguage);
        if (currentLangSettings) {
            if (currentLangSettings.Font) {
                loadCustomFont(currentLangSettings.Font);
            }

            if (currentLangSettings.FontSize) {
                const fontSize = Number(currentLangSettings.FontSize);
                applyFontSize(fontSize);
            }

            if (Imported['YEP_MessageCore']) {
                overrideYanflyMessageFontSettings(currentLangSettings);
            }

            if (Imported['Galv_MessageStyles']) {
                alterGalvFontSize(currentLangSettings);
            }
        }
    }

    function overrideYanflyMessageFontSettings(langSettings) {
        if (langSettings.Font) {
            Game_System.prototype.getMessageFontName = function () {
                return langSettings.Font.split('.')[0]; // Remove file extension
            };
        }
        if (langSettings.FontSize) {
            Game_System.prototype.getMessageFontSize = function () {
                return Number(langSettings.FontSize);
            };
        }
    }

    function alterGalvFontSize(langSettings) {
        if (langSettings.FontSize) {
            Galv.Mstyle.fontSize = Number(langSettings.FontSize);

            Window_Message.prototype.standardFontSize = function () {
                return Galv.Mstyle.fontSize;
            };

            Window_ChoiceList.prototype.standardFontSize = function () {
                return Galv.Mstyle.fontSize;
            };

            if (SceneManager._scene && SceneManager._scene.refreshAllWindows) {
                SceneManager._scene.refreshAllWindows();
            }
        }
    }

    function loadCustomFont(fontFileName) {
        const fontName = fontFileName.split('.')[0];
        const fileExtension = fontFileName.split('.').pop().toLowerCase();
        let format;

        if (fileExtension === 'ttf') {
            format = 'truetype';
        } else if (fileExtension === 'otf') {
            format = 'opentype';
        } else {
            return;
        }

        const fontPath = `url('fonts/${fontFileName}')`;
        const font = new FontFace(fontName, fontPath);

        font.load().then((loadedFont) => {
            document.fonts.add(loadedFont);
            applyFontFace(fontName);
            if (Imported['YEP_MessageCore']) {
                Game_System.prototype.getMessageFontName = function () {
                    return fontName;
                };
            }
            if (SceneManager._scene && SceneManager._scene.refreshAllWindows) {
                SceneManager._scene.refreshAllWindows();
            }
        }).catch((error) => {
            applyFontFace($gameSystem.mainFontFace());
        });

        const style = document.createElement('style');
        const css = `@font-face {
            font-family: "${fontName}";
            src: ${fontPath} format("${format}");
        }`;
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function applyFontFace(fontFace) {
        Window_Base.prototype.standardFontFace = function () {
            return fontFace;
        };
        if (SceneManager._scene && SceneManager._scene.refreshAllWindows) {
            SceneManager._scene.refreshAllWindows();
        }
    }

    function applyFontSize(fontSize) {
        Window_Base.prototype.standardFontSize = function () {
            return fontSize;
        };
        if (SceneManager._scene && SceneManager._scene.refreshAllWindows) {
            SceneManager._scene.refreshAllWindows();
        }
    }

    const _Window_Base_resetFontSettings = Window_Base.prototype.resetFontSettings;
    Window_Base.prototype.resetFontSettings = function () {
        _Window_Base_resetFontSettings.call(this);
        if (typeof this.standardFontFace === 'function') {
            this.contents.fontFace = this.standardFontFace();
        }
        if (typeof this.standardFontSize === 'function') {
            this.contents.fontSize = this.standardFontSize();
        }
    };

    function extractAllMessages() {
        if (!fs || !path) {
            return;
        }
        messages = [];
        if (confirm("Do you want to generate/update the localization files in " + I18N_DIR + "?")) {
            if (fs.existsSync(I18N_DIR)) {
                if (confirm("Do you want to create a backup of your current i18n folder before proceeding?")) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupDir = path.join(path.dirname(I18N_DIR), `i18n_backup_${timestamp}`);
                    fs.mkdirSync(backupDir, { recursive: true });

                    copyFolderRecursiveSync(I18N_DIR, backupDir);
                    alert(`Backup created in: ${backupDir}`);
                }
            } else {
                fs.mkdirSync(I18N_DIR, { recursive: true });
            }

            // Proceed with extraction
            for (let mapId = 1; mapId < $dataMapInfos.length; mapId++) {
                if ($dataMapInfos[mapId]) {
                    const mapData = readMapDataSafe(mapId);
                    if (mapData) extractMessagesFromMap(mapData, mapId);
                }
            }

            if (extractMapDisplayNames) {
                extractMapDisplayNamesFromData();
            }

            // Extract messages from common events
            extractCommonEventMessages();

            if (extractDatabaseEntries) {
                extractDatabaseMessages();
                extractTroopMessages();
            }

            if (extractVariableText) {
                extractVariableMessages();
            }

            if (extractShowPicture) {
                extractShowPictureMessages();
            }

            if (extractPlayMovies) {
                extractPlayMovieMessages();
            }

            if (extractScriptCall) {
                extractScriptCallMessages();
            }

            if (extractPluginCommandText) {
                extractPluginCommandMessages();
            }

            updateMessagesJSON();
            alert("JSON file has been generated/updated successfully.");
        } else {

        }
    }

    function extractMapDisplayNamesFromData() {
        messages.push('\n[MAP DISPLAY NAMES]\n');

        for (let mapId = 1; mapId < $dataMapInfos.length; mapId++) {
            if ($dataMapInfos[mapId]) {
                try {
                    const mapData = JSON.parse(fs.readFileSync(path.join('data', `Map${String(mapId).padStart(3, '0')}.json`), 'utf8'));
                    if (mapData && mapData.displayName) {
                        messages.push(mapData.displayName);
                    }
                } catch (error) {
                }
            }
        }
    }

    function extractScriptCallMessages() {
        messages.push('\n[SCRIPT CALLS]\n');

        function extractQuotedText(text) {
            const matches = text.match(/"([^"]+)"/g);
            if (matches) {
                return matches.map(match => match.slice(1, -1))
                    .filter(str => /[a-zA-Z]/.test(str)); // Only keep strings with at least one letter
            }
            return [];
        }

        function extractFromEventCommands(eventCommands) {
            let currentScript = [];
            eventCommands.forEach(command => {
                if (command.code === 355 || command.code === 655) { // Script and Script continuation
                    let scriptText = command.parameters[0];
                    if (typeof scriptText === 'string') {
                        currentScript.push(scriptText);
                    }
                } else if (currentScript.length > 0) {
                    const fullScript = currentScript.join('\n');
                    const quotedTexts = extractQuotedText(fullScript);
                    quotedTexts.forEach(text => messages.push(text));
                    currentScript = [];
                }
            });
            if (currentScript.length > 0) {
                const fullScript = currentScript.join('\n');
                const quotedTexts = extractQuotedText(fullScript);
                quotedTexts.forEach(text => messages.push(text));
            }
        }

        // Extract from all map events
        for (let mapId = 1; mapId < $dataMapInfos.length; mapId++) {
            if ($dataMapInfos[mapId]) {
                const mapData = readMapDataSafe(mapId);
                if (mapData && mapData.events) {
                    mapData.events.forEach(event => {
                        if (event && event.pages) {
                            event.pages.forEach(page => {
                                if (page.list) {
                                    extractFromEventCommands(page.list);
                                }
                            });
                        }
                    });
                }
            }
        }

        // Extract from common events
        $dataCommonEvents.forEach(commonEvent => {
            if (commonEvent && commonEvent.list) {
                extractFromEventCommands(commonEvent.list);
            }
        });
    }

    function extractCommonEventMessages() {
        messages.push('\n[Common Events]\n');
        $dataCommonEvents.forEach((commonEvent, index) => {
            if (commonEvent && commonEvent.list) {
                // Extract comments if enabled
                if (extractComments) {
                    let hasAddedCommentHeader = false;
                    commonEvent.list.forEach(command => {
                        if (command.code === 108 || command.code === 408) {
                            if (!hasAddedCommentHeader) {
                                messages.push('\n[Comments]\n');
                                hasAddedCommentHeader = true;
                            }
                            messages.push(command.parameters[0]);
                        }
                    });
                }

                let currentMessage = [];
                let currentSpeaker = '';

                commonEvent.list.forEach((command, cmdIndex) => {
                    if (command.code === 101) {
                        if (currentMessage.length > 0) {
                            const fullMessage = currentMessage.join('\n');
                            messages.push({
                                category: 'misc',
                                id: index,
                                val: fullMessage
                            });
                            if (extractNamesMZ) {
                                messageData.set(fullMessage, currentSpeaker);
                            }
                            currentMessage = [];
                        }
                        currentSpeaker = command.parameters[4] || '';
                    } else if (command.code === 401) {
                        let text = command.parameters[0];
                        if (excludeNameText) {
                            const colonIndex = text.indexOf(':');
                            if (colonIndex !== -1) {
                                text = text.substring(colonIndex + 1).trim();
                            }
                        }
                        currentMessage.push(text);
                    } else if (command.code === 102) {
                        if (currentMessage.length > 0) {
                            const fullMessage = currentMessage.join('\n');
                            messages.push({
                                category: 'misc',
                                id: index,
                                val: fullMessage
                            });
                            if (extractNamesMZ) {
                                messageData.set(fullMessage, currentSpeaker);
                            }
                            currentMessage = [];
                        }
                        command.parameters[0].forEach((choice, choiceIdx) => {
                            messages.push({
                                category: 'misc',
                                id: `${index}_c${choiceIdx}`,
                                val: choice
                            });
                            if (extractNamesMZ) {
                                messageData.set(choice, '');
                            }
                        });
                    } else if (currentMessage.length > 0) {
                        const fullMessage = currentMessage.join('\n');
                        messages.push({
                            category: 'misc',
                            id: index,
                            val: fullMessage
                        });
                        if (extractNamesMZ) {
                            messageData.set(fullMessage, currentSpeaker);
                        }
                        currentMessage = [];
                        currentSpeaker = '';
                    }
                });

                if (currentMessage.length > 0) {
                    const fullMessage = currentMessage.join('\n');
                    messages.push({
                        category: 'misc',
                        id: index,
                        val: fullMessage
                    });
                    if (extractNamesMZ) {
                        messageData.set(fullMessage, currentSpeaker);
                    }
                }
            }
        });
    }

    function extractVariableMessages() {
        messages.push('\n[VARIABLES]\n');

        function extractFromEventCommands(eventCommands) {
            eventCommands.forEach(command => {
                if (command.code === 122 && command.parameters[3] === 4) {
                    const script = command.parameters[4];
                    if (typeof script === 'string' && /[a-zA-Z]/.test(script)) {
                        const cleanScript = script.replace(/^["']|["']$/g, '');
                        messages.push(cleanScript);
                    }
                }
            });
        }

        // Extract from all map events
        for (let mapId = 1; mapId < $dataMapInfos.length; mapId++) {
            if ($dataMapInfos[mapId]) {
                const mapData = readMapDataSafe(mapId);
                if (mapData && mapData.events) {
                    mapData.events.forEach(event => {
                        if (event && event.pages) {
                            event.pages.forEach(page => {
                                if (page.list) {
                                    extractFromEventCommands(page.list);
                                }
                            });
                        }
                    });
                }
            }
        }

        // Extract from common events
        $dataCommonEvents.forEach(commonEvent => {
            if (commonEvent && commonEvent.list) {
                extractFromEventCommands(commonEvent.list);
            }
        });
    }

    function extractDatabaseMessages() {
        messages.push('\n[DATABASE ENTRIES]\n');

        messages.push('\n[GAME TITLE]\n');
        if ($dataSystem && $dataSystem.gameTitle) {
            messages.push($dataSystem.gameTitle);
        }

        // Title Screen files
        messages.push('\n[Title Screen]\n');
        if ($dataSystem && $dataSystem.title1Name) {
            const title1Filename = $dataSystem.title1Name + '.png';
            messages.push(title1Filename);
        }
        if ($dataSystem && $dataSystem.title2Name) {
            const title2Filename = $dataSystem.title2Name + '.png';
            messages.push(title2Filename);
        }

        function removePrefix(text) {
            return text && typeof text === 'string' ? text.replace(/^\[.*?\]\s*/, '') : '';
        }

        // Actors
        $dataActors.forEach((actor, index) => {
            if (actor) {
                messages.push({
                    category: 'actors',
                    id: index,
                    name: actor.name || '',
                    nickname: actor.nickname || '',
                    profile: actor.profile || ''
                });
            }
        });

        // Classes
        $dataClasses.forEach((klass, index) => {
            if (klass) {
                messages.push({
                    category: 'classes',
                    id: index,
                    name: klass.name || ''
                });
            }
        });

        // Skills
        $dataSkills.forEach((skill, index) => {
            if (skill) {
                messages.push({
                    category: 'skills',
                    id: index,
                    name: removePrefix(skill.name) || '',
                    description: skill.description || '',
                    message1: skill.message1 || '',
                    message2: skill.message2 || ''
                });
            }
        });

        // Items
        $dataItems.forEach((item, index) => {
            if (item) {
                messages.push({
                    category: 'items',
                    id: index,
                    name: item.name || '',
                    description: item.description || ''
                });
            }
        });

        // Weapons
        $dataWeapons.forEach((weapon, index) => {
            if (weapon) {
                messages.push({
                    category: 'weapons',
                    id: index,
                    name: removePrefix(weapon.name) || '',
                    description: weapon.description || ''
                });
            }
        });

        // Armors
        $dataArmors.forEach((armor, index) => {
            if (armor) {
                messages.push({
                    category: 'armors',
                    id: index,
                    name: removePrefix(armor.name) || '',
                    description: armor.description || ''
                });
            }
        });

        // Enemies
        $dataEnemies.forEach((enemy, index) => {
            if (enemy) {
                // Enemy descriptions use combinatorial {a | b | c} inline text
                // resolved (seeded from the world seed) by EnemyDescription.
                let description = '';
                if (window.EnemyDescription) {
                    description = window.EnemyDescription.describe(index);
                } else {
                    const enDescMatch = enemy.note.match(/<En:\s*([^>]+)>/i);
                    description = enDescMatch ? enDescMatch[1].trim() : '';
                }

                messages.push({
                    category: 'enemies',
                    id: index,
                    name: enemy.name || '',
                    description: description
                });
            }
        });

        // States
        $dataStates.forEach((state, index) => {
            if (state) {
                messages.push({
                    category: 'states',
                    id: index,
                    name: removePrefix(state.name) || '',
                    message1: state.message1 || '',
                    message2: state.message2 || '',
                    message3: state.message3 || '',
                    message4: state.message4 || ''
                });
            }
        });

        // Types
        ['weaponTypes', 'armorTypes', 'equipTypes', 'skillTypes'].forEach(typeCategory => {
            if (Array.isArray($dataSystem[typeCategory])) {
                $dataSystem[typeCategory].forEach((type, index) => {
                    if (type) {
                        messages.push({
                            category: 'types',
                            id: type,
                            val: type
                        });
                    }
                });
            }
        });

        // Terms
        const terms = $dataSystem.terms;
        Object.keys(terms).forEach(termCategory => {
            if (typeof terms[termCategory] === 'string') {
                messages.push({
                    category: 'terms',
                    id: terms[termCategory],
                    val: terms[termCategory]
                });
            } else if (Array.isArray(terms[termCategory])) {
                terms[termCategory].forEach((term, index) => {
                    if (term) {
                        messages.push({
                            category: 'terms',
                            id: term,
                            val: term
                        });
                    }
                });
            }
        });

        // Terms Messages (System Messages)
        if ($dataSystem && $dataSystem.terms && $dataSystem.terms.messages) {
            const messageTypes = Object.keys($dataSystem.terms.messages);
            messageTypes.forEach(key => {
                const messageText = $dataSystem.terms.messages[key];
                if (messageText) {
                    messages.push({
                        category: 'system',
                        id: key,
                        val: messageText
                    });
                }
            });
        }
    }


    function extractMessagesFromMap(mapData, mapId) {
        if (addingMapsName) {
            const mapName = $dataMapInfos[mapId].name;
            messages.push(`\n[${mapName}]\n`);
        }
        if (mapData.events) {
            mapData.events.forEach(event => {
                if (event && event.pages) {
                    event.pages.forEach(page => {
                        if (page.list) {
                            if (extractComments) {
                                let hasAddedCommentHeader = false;
                                page.list.forEach(command => {
                                    if (command.code === 108 || command.code === 408) {
                                        if (!hasAddedCommentHeader) {
                                            messages.push('\n[Comments]\n');
                                            hasAddedCommentHeader = true;
                                        }
                                        messages.push(command.parameters[0]);
                                    }
                                });
                            }

                            // Handle regular messages
                            let currentMessage = [];
                            let currentSpeaker = '';

                            // Handle scroll text separately
                            let currentScrollText = [];

                            page.list.forEach((command, index) => {
                                // Handle scroll text commands
                                if (command.code === 405) { // Scroll text content
                                    currentScrollText.push(command.parameters[0]);
                                } else if (command.code !== 405 && currentScrollText.length > 0) {
                                    // When we hit a non-scroll text command, process any collected scroll text
                                    messages.push({
                                        category: 'misc',
                                        id: `${mapId}_${event.id}_${index}`,
                                        val: currentScrollText.join('\n')
                                    });
                                    currentScrollText = [];
                                }

                                // Handle regular messages
                                if (command.code === 101) { // Show Text settings
                                    if (currentMessage.length > 0) {
                                        const fullMessage = currentMessage.join('\n');
                                        messages.push({
                                            category: 'misc',
                                            id: `${mapId}_${event.id}_${index}`,
                                            val: fullMessage
                                        });
                                        if (extractNamesMZ) {
                                            messageData.set(fullMessage, currentSpeaker);
                                        }
                                        currentMessage = [];
                                    }
                                    currentSpeaker = command.parameters[4] || '';
                                } else if (command.code === 401) { // Show Text content
                                    let text = command.parameters[0];
                                    if (excludeNameText) {
                                        const colonIndex = text.indexOf(':');
                                        if (colonIndex !== -1) {
                                            text = text.substring(colonIndex + 1).trim();
                                        }
                                    }
                                    currentMessage.push(text);
                                } else if (command.code === 102) { // Show Choices
                                    if (currentMessage.length > 0) {
                                        const fullMessage = currentMessage.join('\n');
                                        messages.push({
                                            category: 'misc',
                                            id: `map${mapId}_ev${event.id}_p${event.pages.indexOf(page)}_idx${index}`,
                                            val: fullMessage
                                        });
                                        if (extractNamesMZ) {
                                            messageData.set(fullMessage, currentSpeaker);
                                        }
                                        currentMessage = [];
                                    }
                                    command.parameters[0].forEach((choice, choiceIdx) => {
                                        messages.push({
                                            category: 'misc',
                                            id: `${mapId}_${event.id}_${index}_c${choiceIdx}`,
                                            val: choice
                                        });
                                        if (extractNamesMZ) {
                                            messageData.set(choice, '');
                                        }
                                    });
                                } else if (currentMessage.length > 0) {
                                    const fullMessage = currentMessage.join('\n');
                                    messages.push({
                                        category: 'misc',
                                        id: `${mapId}_${event.id}_${index}`,
                                        val: fullMessage
                                    });
                                    if (extractNamesMZ) {
                                        messageData.set(fullMessage, currentSpeaker);
                                    }
                                    currentMessage = [];
                                    currentSpeaker = '';
                                }
                            });

                            // Process any remaining scroll text
                            if (currentScrollText.length > 0) {
                                messages.push({
                                    category: 'misc',
                                    id: `${mapId}_${event.id}_last`,
                                    val: currentScrollText.join('\n')
                                });
                            }

                            // Process any remaining messages
                            if (currentMessage.length > 0) {
                                const fullMessage = currentMessage.join('\n');
                                messages.push({
                                    category: 'misc',
                                    id: `${mapId}_${event.id}_last`,
                                    val: fullMessage
                                });
                                if (extractNamesMZ) {
                                    messageData.set(fullMessage, currentSpeaker);
                                }
                            }
                        }
                    });
                }
            });
        }
    }


    function extractTroopMessages() {
        messages.push('\n[TROOPS]\n');
        $dataTroops.forEach((troop, index) => {
            if (troop && troop.pages) {
                troop.pages.forEach((page, pageIndex) => {
                    if (page.list) {
                        let currentMessage = [];
                        let currentSpeaker = '';

                        page.list.forEach(command => {
                            if (command.code === 101) {
                                if (currentMessage.length > 0) {
                                    const fullMessage = currentMessage.join('\n');
                                    messages.push(fullMessage);
                                    if (extractNamesMZ) {
                                        messageData.set(fullMessage, currentSpeaker);
                                    }
                                    currentMessage = [];
                                }
                                currentSpeaker = command.parameters[4] || '';
                            } else if (command.code === 401) {
                                let text = command.parameters[0];
                                if (excludeNameText) {
                                    const colonIndex = text.indexOf(':');
                                    if (colonIndex !== -1) {
                                        text = text.substring(colonIndex + 1).trim();
                                    }
                                }
                                currentMessage.push(text);
                            } else if (command.code === 102) {
                                if (currentMessage.length > 0) {
                                    const fullMessage = currentMessage.join('\n');
                                    messages.push(fullMessage);
                                    if (extractNamesMZ) {
                                        messageData.set(fullMessage, currentSpeaker);
                                    }
                                    currentMessage = [];
                                }
                                command.parameters[0].forEach(choice => {
                                    messages.push(choice);
                                    if (extractNamesMZ) {
                                        messageData.set(choice, '');
                                    }
                                });
                            } else if (currentMessage.length > 0) {
                                const fullMessage = currentMessage.join('\n');
                                messages.push(fullMessage);
                                if (extractNamesMZ) {
                                    messageData.set(fullMessage, currentSpeaker);
                                }
                                currentMessage = [];
                                currentSpeaker = '';
                            }
                        });

                        if (currentMessage.length > 0) {
                            const fullMessage = currentMessage.join('\n');
                            messages.push(fullMessage);
                            if (extractNamesMZ) {
                                messageData.set(fullMessage, currentSpeaker);
                            }
                        }
                    }
                });
            }
        });
    }

    function extractShowPictureMessages() {
        messages.push('\n[SHOW PICTURES]\n');

        function extractFromEventCommands(eventCommands) {
            eventCommands.forEach(command => {
                if (command.code === 231) { // Show Picture command
                    let filename = command.parameters[1];
                    if (filename) {
                        if (!filename.toLowerCase().endsWith('.png')) {
                            filename += '.png';
                        }
                        messages.push(filename);
                    }
                }
            });
        }

        // Extract from all map events
        for (let mapId = 1; mapId < $dataMapInfos.length; mapId++) {
            if ($dataMapInfos[mapId]) {
                const mapData = readMapDataSafe(mapId);
                if (mapData && mapData.events) {
                    mapData.events.forEach(event => {
                        if (event && event.pages) {
                            event.pages.forEach(page => {
                                if (page.list) {
                                    extractFromEventCommands(page.list);
                                }
                            });
                        }
                    });
                }
            }
        }

        // Extract from common events
        $dataCommonEvents.forEach(commonEvent => {
            if (commonEvent && commonEvent.list) {
                extractFromEventCommands(commonEvent.list);
            }
        });
    }

    function extractPlayMovieMessages() {
        messages.push('\n[PLAY MOVIES]\n');

        function extractFromEventCommands(eventCommands) {
            eventCommands.forEach(command => {
                if (command.code === 261) {
                    let filename = command.parameters[0];
                    if (filename) {
                        // Add .webm extension cuz it doesn't extract .webm
                        if (!filename.toLowerCase().endsWith('.webm')) {
                            filename += '.webm';
                        }
                        messages.push(filename);
                    }
                }
            });
        }

        // Extract from all map events
        for (let mapId = 1; mapId < $dataMapInfos.length; mapId++) {
            if ($dataMapInfos[mapId]) {
                const mapData = readMapDataSafe(mapId);
                if (mapData && mapData.events) {
                    mapData.events.forEach(event => {
                        if (event && event.pages) {
                            event.pages.forEach(page => {
                                if (page.list) {
                                    extractFromEventCommands(page.list);
                                }
                            });
                        }
                    });
                }
            }
        }

        // Extract from common events
        $dataCommonEvents.forEach(commonEvent => {
            if (commonEvent && commonEvent.list) {
                extractFromEventCommands(commonEvent.list);
            }
        });
    }

    function extractPluginCommandMessages() {
        messages.push('\n[PLUGIN COMMANDS]\n');

        function isValidContent(content) {
            // Check if the content contains at least one letter and is not a boolean value
            return /[a-zA-Z]/.test(content) &&
                !['true', 'false'].includes(content.toLowerCase().trim());
        }

        function extractFromEventCommands(eventCommands) {
            eventCommands.forEach(command => {
                if (command.code === 357) { // Plugin Command
                    const params = command.parameters[3] || {};
                    Object.keys(params).forEach(key => {
                        const value = params[key];
                        if (typeof value === 'string') {
                            // Match content for key-value pairs or regular quoted strings
                            const keyValueRegex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
                            const regularQuoteRegex = /"([^"]*)"/g;

                            let match;
                            // Check for key-value pairs first
                            while ((match = keyValueRegex.exec(value)) !== null) {
                                const content = match[2]; // The value part
                                if (isValidContent(content)) {
                                    messages.push(content);
                                }
                            }

                            // If no key-value pairs found, check for regular quoted strings
                            if (!keyValueRegex.test(value)) {
                                while ((match = regularQuoteRegex.exec(value)) !== null) {
                                    const content = match[1];
                                    if (isValidContent(content)) {
                                        messages.push(content);
                                    }
                                }
                            }
                        }
                    });
                }
            });
        }

        // Extract from all map events
        for (let mapId = 1; mapId < $dataMapInfos.length; mapId++) {
            if ($dataMapInfos[mapId]) {
                const mapData = readMapDataSafe(mapId);
                if (mapData && mapData.events) {
                    mapData.events.forEach(event => {
                        if (event && event.pages) {
                            event.pages.forEach(page => {
                                if (page.list) {
                                    extractFromEventCommands(page.list);
                                }
                            });
                        }
                    });
                }
            }
        }

        // Extract from common events
        $dataCommonEvents.forEach(commonEvent => {
            if (commonEvent && commonEvent.list) {
                extractFromEventCommands(commonEvent.list);
            }
        });
    }

    function updateMessagesJSON() {
        if (!fs || !path) return;

        if (!fs.existsSync(I18N_DIR)) {
            fs.mkdirSync(I18N_DIR, { recursive: true });
        }

        const categoryData = {}; // category -> { _isDB, entries }
        const dbCategories = ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'states'];

        // 1. Load ALL existing translations from ALL files first (to never delete anything)
        languageSymbols.forEach(symbol => {
            const langDir = path.join(I18N_DIR, symbol);
            if (!fs.existsSync(langDir)) return;

            const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                const cat = file.replace('.json', '');
                const filePath = path.join(langDir, file);
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (!categoryData[cat]) {
                        categoryData[cat] = {
                            _isDB: dbCategories.includes(cat),
                            entries: {}
                        };
                    }

                    const catInfo = categoryData[cat];
                    for (const key in data) {
                        if (!catInfo.entries[key]) {
                            catInfo.entries[key] = { translations: {} };
                        }
                        catInfo.entries[key].translations[symbol] = data[key];

                        // For non-DB entries, we might want to capture excluded/name from any language file
                        if (!catInfo._isDB && typeof data[key] === 'object') {
                            if (data[key].excluded) catInfo.entries[key].Excluded = data[key].excluded;
                            if (data[key].name) catInfo.entries[key].Name = data[key].name;
                        }
                    }
                } catch (e) {
                    console.error(`Error reading ${filePath}:`, e);
                }
            });
        });

        // 2. Overlay current game messages (update existing or add new)
        const modifiedCategories = new Set();
        let currentCategory = 'misc';
        messages.forEach(msg => {
            if (!msg) return;

            // Handle DB objects (ID-based)
            if (typeof msg === 'object' && msg.category) {
                const cat = msg.category;
                const simpleCategories = ['terms', 'types', 'misc', 'system'];
                const isSimple = simpleCategories.includes(cat);

                modifiedCategories.add(cat);
                if (!categoryData[cat]) {
                    categoryData[cat] = { _isDB: !isSimple, entries: {} };
                }

                const id = msg.id;
                if (!categoryData[cat].entries[id]) {
                    categoryData[cat].entries[id] = { translations: {} };
                }

                if (isSimple) {
                    // For simple categories, the object usually has a 'val' field
                    if (msg.val !== undefined) {
                        categoryData[cat].entries[id].val = msg.val;
                    }
                } else {
                    // Update original fields from current game state
                    Object.keys(msg).forEach(key => {
                        if (key !== 'category' && key !== 'id' && key !== 'translations') {
                            categoryData[cat].entries[id][key] = msg[key];
                        }
                    });
                }

                // Handle manual translations if provided
                if (msg.translations) {
                    Object.keys(msg.translations).forEach(symbol => {
                        if (!categoryData[cat].entries[id].translations[symbol]) {
                            categoryData[cat].entries[id].translations[symbol] = {};
                        }
                        if (typeof msg.translations[symbol] === 'object' && typeof categoryData[cat].entries[id].translations[symbol] === 'object') {
                            Object.assign(categoryData[cat].entries[id].translations[symbol], msg.translations[symbol]);
                        } else {
                            categoryData[cat].entries[id].translations[symbol] = msg.translations[symbol];
                        }
                    });
                }
                return;
            }

            // Handle strings (Content-based)
            if (typeof msg !== 'string' || msg.trim() === '') return;
            const trimmedMsg = msg.trim();
            if (trimmedMsg.startsWith('[') && trimmedMsg.endsWith(']')) {
                currentCategory = getCategory(trimmedMsg);
                modifiedCategories.add(currentCategory);
                return;
            }

            modifiedCategories.add(currentCategory);
            if (!categoryData[currentCategory]) {
                categoryData[currentCategory] = {
                    _isDB: dbCategories.includes(currentCategory),
                    entries: {}
                };
            }

            const { yepName, remainingText } = extractYepName(msg);
            if (!categoryData[currentCategory].entries[remainingText]) {
                categoryData[currentCategory].entries[remainingText] = {
                    Excluded: yepName,
                    Name: messageData.get(msg) || '',
                    translations: {}
                };
            } else {
                // Update metadata if it was missing
                if (yepName && !categoryData[currentCategory].entries[remainingText].Excluded) {
                    categoryData[currentCategory].entries[remainingText].Excluded = yepName;
                }
                const speaker = messageData.get(msg);
                if (speaker && !categoryData[currentCategory].entries[remainingText].Name) {
                    categoryData[currentCategory].entries[remainingText].Name = speaker;
                }
            }
        });

        // 3. Save back to files
        languageSymbols.forEach(symbol => {
            const langDir = path.join(I18N_DIR, symbol);
            if (!fs.existsSync(langDir)) {
                fs.mkdirSync(langDir, { recursive: true });
            }

            for (const cat in categoryData) {
                if (!modifiedCategories.has(cat)) continue;
                const filePath = path.join(langDir, `${cat}.json`);
                const catInfo = categoryData[cat];
                const outputData = {};

                if (catInfo._isDB) {
                    for (const id in catInfo.entries) {
                        const entry = catInfo.entries[id];
                        const translations = entry.translations || {};
                        const currentLangTrans = (translations[symbol] && typeof translations[symbol] === 'object') ? translations[symbol] : {};

                        outputData[id] = {};

                        // Fields can come from game state OR file
                        const allFields = new Set();
                        Object.keys(entry).forEach(f => {
                            if (f !== 'translations') allFields.add(f);
                        });
                        Object.keys(currentLangTrans).forEach(f => allFields.add(f));

                        allFields.forEach(field => {
                            if (symbol === defaultLanguage) {
                                // For default language, prioritize game state value
                                outputData[id][field] = entry[field] !== undefined ? entry[field] : (currentLangTrans[field] || '');
                            } else {
                                // For other languages, prioritize existing translation
                                outputData[id][field] = currentLangTrans[field] || '';
                            }
                        });
                    }
                } else {
                    const simpleCategories = ['terms', 'types', 'misc', 'system'];
                    const isSimple = simpleCategories.includes(cat);
                    for (const orig in catInfo.entries) {
                        const entry = catInfo.entries[orig];
                        const translations = entry.translations || {};

                        let val = '';
                        if (translations[symbol]) {
                            val = typeof translations[symbol] === 'object' ? translations[symbol].val : translations[symbol];
                        }

                        if (isSimple) {
                            // Prioritize game state 'val' for default language
                            const defaultVal = entry.val !== undefined ? entry.val : orig;
                            outputData[orig] = val || (symbol === defaultLanguage ? defaultVal : '');
                        } else {
                            outputData[orig] = {
                                val: val || (symbol === defaultLanguage ? orig : ''),
                                excluded: entry.Excluded || '',
                                name: entry.Name || ''
                            };
                        }
                    }
                }

                if (Object.keys(outputData).length > 0) {
                    fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2), 'utf8');
                }
            }
        });

        alert("Localization files have been generated/updated successfully in language subfolders within " + I18N_DIR);
    }


    let wordTranslations = {};
    let commandMappings = {};
    let lastInputMethod = 'keyboard';

    function loadTranslations(lang) {
        translations = {};
        wordTranslations = {};
        commandMappings = {};
        wordTranslationRegexes.clear();
        translationCache = {};

        const defLang = defaultLanguage || 'en';
        const categories = new Set();

        function loadFileData(language, filename) {
            const relativePath = path ? path.join(language, filename) : language + '/' + filename;
            const filePath = path ? path.join(I18N_DIR, relativePath) : I18N_DIR + relativePath;
            if (fs && fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf8');
            } else {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', filePath, false);
                xhr.overrideMimeType('application/json; charset=utf-8');
                try {
                    xhr.send();
                    if (xhr.status === 200) return xhr.responseText;
                } catch (e) { }
            }
            return null;
        }

        // Detect categories from default language folder
        if (fs) {
            const defDir = path.join(I18N_DIR, defLang);
            if (fs.existsSync(defDir)) {
                fs.readdirSync(defDir).forEach(f => {
                    if (f.endsWith('.json') && f !== 'actors.json') categories.add(f.replace('.json', ''));
                });
            }
            // Also check target language folder
            const targetDir = path.join(I18N_DIR, lang);
            if (fs.existsSync(targetDir)) {
                fs.readdirSync(targetDir).forEach(f => {
                    if (f.endsWith('.json') && f !== 'actors.json') categories.add(f.replace('.json', ''));
                });
            }
        } else {
            // Hardcoded categories fallback
            ['weapons', 'armors', 'terms', 'skills', 'items', 'enemies', 'states', 'system', 'classes', 'maps', 'common_events', 'variables', 'pictures', 'movies', 'scripts', 'plugin_commands', 'misc'].forEach(c => categories.add(c));
        }

        function mergeRecursive(def, target) {
            for (const key in def) {
                const dVal = def[key];
                const tVal = target ? target[key] : null;

                if (typeof dVal === 'object' && dVal !== null) {
                    // Check if it's our flat format {val, excluded, name}
                    if (dVal.hasOwnProperty('val')) {
                        const original = (dVal.val || "").trim();
                        const tValObj = (tVal && typeof tVal === 'object' ? tVal.val : (typeof tVal === 'string' ? tVal : original)) || "";
                        // Fall back to the default-language (EN) value when the target
                        // translation is missing or blank.
                        const translated = (tValObj.trim() || original).replace(/\n/g, '{{LINEBREAK}}');
                        const excluded = dVal.excluded || '';
                        if (original) {
                            translations[original] = translated;
                            if (excluded) {
                                translations[excluded + original] = translated;
                                wordTranslations[excluded] = translated;
                            }
                        }
                    } else {
                        mergeRecursive(dVal, tVal);
                    }
                } else if (typeof dVal === 'string') {
                    const original = dVal.trim();
                    let translated = original;
                    if (typeof tVal === 'string') {
                        translated = tVal;
                    } else if (tVal && typeof tVal === 'object' && tVal.val) {
                        translated = tVal.val;
                    }
                    // Fall back to the default-language (EN) value when the target
                    // translation is missing or blank.
                    translated = (translated.trim() || original).replace(/\n/g, '{{LINEBREAK}}');
                    if (original) {
                        translations[original] = translated;
                    }
                }
            }
        }

        categories.forEach(cat => {
            const defContent = loadFileData(defLang, `${cat}.json`);
            const targetContent = loadFileData(lang, `${cat}.json`);

            if (cat === 'commands') {
                try {
                    const defData = defContent ? JSON.parse(defContent) : {};
                    const targetData = targetContent ? JSON.parse(targetContent) : null;
                    commandMappings = Object.assign({}, defData, targetData);
                } catch (e) {
                    console.error(`Error parsing commands translation:`, e);
                }
            } else if (defContent) {
                try {
                    const defData = JSON.parse(defContent);
                    const targetData = targetContent ? JSON.parse(targetContent) : null;
                    mergeRecursive(defData, targetData);
                } catch (e) {
                    console.error(`Error parsing ${cat} translation:`, e);
                }
            }
        });

        // Detect available languages based on folders in I18N_DIR
        availableLanguages = [];
        if (fs && fs.existsSync(I18N_DIR)) {
            const items = fs.readdirSync(I18N_DIR);
            items.forEach(item => {
                const fullPath = path.join(I18N_DIR, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    // Check if there is at least one json file in the folder
                    if (fs.readdirSync(fullPath).some(f => f.endsWith('.json'))) {
                        availableLanguages.push(item);
                    }
                }
            });
        }

        // If nothing found or no fs, fallback to languageSymbols
        if (availableLanguages.length === 0) {
            availableLanguages = languageSymbols.slice();
        }

        // The selector cycles this list in order, so English leads and Italian
        // is the first alternative offered.
        availableLanguages = sortLanguagesForMenu(availableLanguages);
        if (LOCKED_LANGUAGE) availableLanguages = [LOCKED_LANGUAGE];

        if (!availableLanguages.includes(currentLanguage)) {
            currentLanguage = availableLanguages[0] || defaultLanguage;
            ConfigManager.language = currentLanguage;
            window.currentLanguage = currentLanguage;
        }

        originalTexts.length = 0;
        Object.keys(translations)
            .sort((a, b) => b.length - a.length)
            .forEach(key => originalTexts.push(key));
    }


    const _Game_Message_add = Game_Message.prototype.add;
    Game_Message.prototype.add = function (text) {
        if (!this.messageBuffer) this.messageBuffer = [];

        if (window.skipLocalization) {
            _Game_Message_add.call(this, text);
            return;
        }

        if (this._scrollMode || ($gameParty.inBattle() && !$gameMessage._showFast)) {
            this._texts.push(text);
        } else {
            this.messageBuffer.push(text);
        }
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        if ($gameMessage.messageBuffer) {
            $gameMessage.messageBuffer = [];
        }
        _Scene_Map_start.call(this);
    };

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        if ($gameMessage.messageBuffer) {
            $gameMessage.messageBuffer = [];
        }
        _Game_Map_setup.call(this, mapId);
    };

    // Play Movies
    const _Game_Interpreter_command261 = Game_Interpreter.prototype.command261;
    Game_Interpreter.prototype.command261 = function () {
        let filename = Utils.RPGMAKER_NAME === "MV" ? this._params[0] : arguments[0][0];
        const originalHadWebm = filename.toLowerCase().endsWith('.webm');

        if (!originalHadWebm) {
            filename += '.webm';
        }

        let translatedName = translations[filename] || filename;

        if (!originalHadWebm && translatedName.toLowerCase().endsWith('.webm')) {
            translatedName = translatedName.slice(0, -5);
        }

        if (Utils.RPGMAKER_NAME === "MV") {
            this._params[0] = translatedName;
            return _Game_Interpreter_command261.call(this);
        } else {
            arguments[0][0] = translatedName;
            return _Game_Interpreter_command261.call(this, arguments[0]);
        }
    };

    // Script Call
    const _Game_Interpreter_command355 = Game_Interpreter.prototype.command355;
    Game_Interpreter.prototype.command355 = function (params) {
        const scriptText = Utils.RPGMAKER_NAME === 'MZ' ? params[0] : this._params[0];

        let allLines = [scriptText];
        let nextIndex = this._index + 1;
        while (this._list[nextIndex] && this._list[nextIndex].code === 655) {
            allLines.push(Utils.RPGMAKER_NAME === 'MZ' ?
                this._list[nextIndex].parameters[0] :
                this._list[nextIndex].parameters[0]);
            nextIndex++;
        }

        const processedLines = allLines.map(line => {
            return line.replace(/"([^"]*)"/g, (match, p1) => {
                const translated = translateText(p1);
                return `"${translated}"`;
            });
        });

        if (Utils.RPGMAKER_NAME === 'MZ') {
            params[0] = processedLines[0];
            for (let i = 1; i < processedLines.length; i++) {
                this._list[this._index + i].parameters[0] = processedLines[i];
            }
            return _Game_Interpreter_command355.call(this, params);
        } else {
            this._params[0] = processedLines[0];
            for (let i = 1; i < processedLines.length; i++) {
                this._list[this._index + i].parameters[0] = processedLines[i];
            }
            return _Game_Interpreter_command355.call(this);
        }
    };

    // Handle single continuation lines (in case they're called directly)
    const _Game_Interpreter_command655 = Game_Interpreter.prototype.command655;
    Game_Interpreter.prototype.command655 = function (params) {
        const scriptText = Utils.RPGMAKER_NAME === 'MZ' ? params[0] : this._params[0];
        const script = scriptText.replace(/"([^"]*)"/g, (match, p1) => {
            const translated = translateText(p1);
            return `"${translated}"`;
        });
        if (Utils.RPGMAKER_NAME === 'MZ') {
            params[0] = script;
            return _Game_Interpreter_command655.call(this, params);
        } else {
            this._params[0] = script;
            return _Game_Interpreter_command655.call(this);
        }
    };

    // Fix for script call showMessage add
    const _Game_Interpreter_command355_orig = Game_Interpreter.prototype.command355;
    Game_Interpreter.prototype.command355 = function () {
        const result = _Game_Interpreter_command355_orig.apply(this, arguments);
        if ($gameMessage.messageBuffer && $gameMessage.messageBuffer.length > 0) {
            $gameMessage.processMessageBuffer();
        }
        return result;
    };

    const _Game_Interpreter_command655_orig = Game_Interpreter.prototype.command655;
    Game_Interpreter.prototype.command655 = function () {
        const result = _Game_Interpreter_command655_orig.apply(this, arguments);
        if ($gameMessage.messageBuffer && $gameMessage.messageBuffer.length > 0) {
            $gameMessage.processMessageBuffer();
        }
        return result;
    };

    // SCROLL TEXT_____________________________________
    const _Window_ScrollText_initialize = Window_ScrollText.prototype.initialize;
    Window_ScrollText.prototype.initialize = function () {
        if (Utils.RPGMAKER_NAME === "MV") {
            _Window_ScrollText_initialize.call(this);
        } else {
            const rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
            _Window_ScrollText_initialize.call(this, rect);
        }
        this._originalLines = 0;
    };

    const _Window_ScrollText_startMessage = Window_ScrollText.prototype.startMessage;
    Window_ScrollText.prototype.startMessage = function () {
        this._originalLines = $gameMessage._texts.length;  // Store original line count
        let fullText = $gameMessage._texts.join('\n');     // Join all text
        let translatedText = translateText(fullText);      // Translate the full text
        $gameMessage._texts = translatedText.split('\n');  // Split back into lines

        _Window_ScrollText_startMessage.call(this);
    };

    //___________________________________________________
    Game_Message.prototype.processMessageBuffer = Game_Message.prototype.processMessageBuffer || function () {
        if (!this.messageBuffer || !this.messageBuffer.length) return;

        const fullMessage = this.messageBuffer.join('\n');
        let processedText = fullMessage;

        // Only add WordWrap tag if YEP_MessageCore is imported and word wrap is enabled
        if (Imported['YEP_MessageCore'] && $gameSystem.wordWrap()) {
            processedText = '<WordWrap>' + processedText;
        }

        const translatedText = translateText(processedText);
        this.messageBuffer = [];

        translatedText.split('\n').forEach(line => {
            this._texts.push(line);
        });
    };

    if (Utils.RPGMAKER_NAME === "MV") {
        if (Imported['YEP_MessageCore']) {
            Game_Interpreter.prototype.command101 = function () {
                if (!$gameMessage.isBusy()) {
                    $gameMessage.setFaceImage(this._params[0], this._params[1]);
                    $gameMessage.setBackground(this._params[2]);
                    $gameMessage.setPositionType(this._params[3]);

                    if (this._params[4]) {
                        $gameMessage.addText(this._params[4]);
                    }

                    while (this.isContinueMessageString()) {
                        this._index++;
                        if (this._list[this._index].code === 401) {
                            $gameMessage.add(this.currentCommand().parameters[0]);
                        }
                        if ($gameMessage._texts.length >= $gameSystem.messageRows()) break;
                    }

                    $gameMessage.processMessageBuffer();

                    switch (this.nextEventCode()) {
                        case 102:
                            this._index++;
                            this.setupChoices(this.currentCommand().parameters);
                            break;
                        case 103:
                            this._index++;
                            this.setupNumInput(this.currentCommand().parameters);
                            break;
                        case 104:
                            this._index++;
                            this.setupItemChoice(this.currentCommand().parameters);
                            break;
                    }
                    this._index++;
                    this.setWaitMode('message');
                }
                return false;
            };
        } else {
            const _Game_Interpreter_command101 = Game_Interpreter.prototype.command101;
            Game_Interpreter.prototype.command101 = function () {
                const result = _Game_Interpreter_command101.call(this);
                $gameMessage.processMessageBuffer();
                return result;
            };
        }
    } else if (Utils.RPGMAKER_NAME === "MZ") {
        const _Game_Interpreter_command101 = Game_Interpreter.prototype.command101;
        Game_Interpreter.prototype.command101 = function (params) {
            const result = _Game_Interpreter_command101.call(this, params);
            $gameMessage.processMessageBuffer();
            return result;
        };
    }

    const _Game_Variables_setValue = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function (variableId, value) {
        if (typeof value === 'string') {
            const translationKey = `__VARIABLE__${variableId}__`;
            if (translations.hasOwnProperty(translationKey)) {
                value = translations[translationKey];
            } else {
                value = translateText(value);
            }
        }
        _Game_Variables_setValue.call(this, variableId, value);
    };

    // Overdrive drawText but drawn on Bitmap sprites rather than Window
    const _Bitmap_drawText = Bitmap.prototype.drawText;
    Bitmap.prototype.drawText = function (text, x, y, maxWidth, lineHeight, align) {
        const translatedText = translateText(String(text));
        _Bitmap_drawText.call(this, translatedText, x, y, maxWidth, lineHeight, align);
    };

    // Override drawTextEx method so other plugins will be affected
    const _Window_Base_drawTextEx = Window_Base.prototype.drawTextEx;
    Window_Base.prototype.drawTextEx = function (text, x, y, width) {
        if (text) {
            text = Hendrix_Localization(text);
            const originalHendrixLocalization = window.Hendrix_Localization;
            window.Hendrix_Localization = function (innerText) {
                return innerText;
            };
            const result = _Window_Base_drawTextEx.call(this, text, x, y, width);
            window.Hendrix_Localization = originalHendrixLocalization;
            return result;
        } else {
            return 0;
        }
    };

    // Adapt choice length to translated text, only for MZ
    if (Utils.RPGMAKER_NAME === "MZ") {
        const _Game_Message_setChoices = Game_Message.prototype.setChoices;
        Game_Message.prototype.setChoices = function (choices, defaultType, cancelType) {
            const translatedChoices = choices.map(choice => {
                const match = choice.match(/^(\d+)\s+(.*)/);
                let prefix = "";
                let textToTranslate = choice;
                if (match) {
                    prefix = match[1] + " ";
                    textToTranslate = match[2];
                }

                const escapeCodes = textToTranslate.match(/<.*?>/g) || [];
                let textContent = textToTranslate;
                escapeCodes.forEach(code => {
                    textContent = textContent.replace(code, '');
                });
                let translatedText = translations[textContent] || textContent;

                escapeCodes.forEach(code => {
                    const originalIndex = textToTranslate.indexOf(code);
                    if (originalIndex === 0) {
                        translatedText = code + translatedText;
                    } else {
                        translatedText = translatedText + code;
                    }
                });

                return prefix + translatedText;
            });

            _Game_Message_setChoices.call(this, translatedChoices, defaultType, cancelType);
        };


        const _Window_NameBox_windowWidth = Window_NameBox.prototype.windowWidth;
        Window_NameBox.prototype.windowWidth = function () {
            if (this._name) {
                const cleanName = (translations[this._name] || this._name).replace(/<[^>]*>/g, '');
                return Math.ceil(this.textWidth(cleanName) + this.padding * 2 + this.itemPadding() * 2);
            } else {
                return _Window_NameBox_windowWidth.call(this);
            }
        };
    }

    // Fix choice issue: Escape code from database doesn't translate (YEP Message Core)
    if (Utils.RPGMAKER_NAME === "MV") {
        if (Imported['YEP_MessageCore']) {
            const _Game_Message_setChoices = Game_Message.prototype.setChoices;
            Game_Message.prototype.setChoices = function (choices, defaultType, cancelType) {
                const translatedChoices = choices.map(choice => {
                    // Process escape codes like \ii[x] etc
                    const window = SceneManager._scene._messageWindow;
                    if (window) {
                        choice = window.convertEscapeCharacters(choice);
                    }
                    // Then, translate the processed text
                    return Hendrix_Localization(choice);
                });
                _Game_Message_setChoices.call(this, translatedChoices, defaultType, cancelType);
            };
        }
    }

    // Fix Battle Message Troop doesn't translate whole paragraph
    const _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        if ($gameParty.inBattle()) {
            const allText = $gameMessage._texts.join('\n');
            const translatedText = translateText(allText);
            $gameMessage._texts = translatedText.split('\n');
        }
        _Window_Message_startMessage.call(this);
    };

    ConfigManager.language = defaultLanguage;

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData.call(this);
        config.language = this.language;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData.call(this, config);
        this.language = LOCKED_LANGUAGE || config.language || defaultLanguage;
        currentLanguage = this.language;
        loadTranslations(currentLanguage);
        applyLanguageSettings();
    };

    if (LOCKED_LANGUAGE) {
        // Locked: no Language row anywhere, and no cycling from a stray key.
        Window_Options.prototype.changeLanguage = function () { };
    } else if (window.GameOptions) {
        // The label is a function so the row renames itself the moment the
        // player switches language, without waiting for a restart.
        window.GameOptions.registerOption('language', () => T('GameOptions.label.language'),
            () => ConfigManager.language,
            function (value) {
                ConfigManager.language = value;
                ConfigManager.save();
            },
            'gameplay', 'custom',
            function (value) {
                return getLanguageMenuLabel(value);
            },
            function () { this.changeLanguage(1); },
            function () { this.changeLanguage(-1); }
        );
    } else {
        const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
        Window_Options.prototype.addGeneralOptions = function () {
            _Window_Options_addGeneralOptions.call(this);
            this.addCommand(T('GameOptions.label.language'), 'language');
        };

        const _Window_Options_statusText = Window_Options.prototype.statusText;
        Window_Options.prototype.statusText = function (index) {
            const symbol = this.commandSymbol(index);
            if (symbol === 'language') {
                return getLanguageMenuLabel(ConfigManager.language);
            } else {
                return _Window_Options_statusText.call(this, index);
            }
        };

        const _Window_Options_processOk = Window_Options.prototype.processOk;
        Window_Options.prototype.processOk = function () {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === 'language') {
                this.changeLanguage(1);
            } else {
                _Window_Options_processOk.call(this);
            }
        };

        const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
        Window_Options.prototype.cursorRight = function (wrap) {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === 'language') {
                this.changeLanguage(1);
            } else {
                _Window_Options_cursorRight.call(this, wrap);
            }
        };

        const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
        Window_Options.prototype.cursorLeft = function (wrap) {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === 'language') {
                this.changeLanguage(-1);
            } else {
                _Window_Options_cursorLeft.call(this, wrap);
            }
        };
    }

    if (!LOCKED_LANGUAGE) Window_Options.prototype.changeLanguage = function (direction) {
        const currentIndex = availableLanguages.indexOf(ConfigManager.language);

        let nextIndex = (currentIndex + direction + availableLanguages.length) % availableLanguages.length;

        ConfigManager.language = availableLanguages[nextIndex];
        currentLanguage = ConfigManager.language;

        loadTranslations(currentLanguage);
        applyLanguageSettings();

        // Rebuild the list rather than redrawing the one row: every label is
        // resolved while building it, so the whole page follows the new
        // language (the tab strip is redrawn by the DOM options scene).
        this.refresh();
        const optionsScene = SceneManager._scene;
        if (optionsScene && typeof optionsScene.renderTabs === 'function') {
            optionsScene.renderTabs();
        }

        if (Imported.YEP_CommonEventMenu) { DataManager.processCEMNotetags1($dataCommonEvents); }

        if (autoRefreshPictures) {
            refreshAllPictures();
        }
        if (SceneManager._scene && SceneManager._scene.refreshAllWindows) {
            SceneManager._scene.refreshAllWindows();
        }
        SoundManager.playCursor();
    };

    Scene_Base.prototype.refreshAllWindows = function () {
        if (this._windowLayer) {
            this._windowLayer.children.forEach(child => {
                if (child instanceof Window_Base) {
                    if (child.contents) {
                        child.contents.clear();
                    }
                    if (typeof child.createContents === 'function') {
                        child.createContents();
                    }
                    if (typeof child.refresh === 'function' &&
                        !(child instanceof Window_Message) &&
                        !(child instanceof Window_ChoiceList)) {
                        child.refresh();
                    }
                    if (typeof child.updatePadding === 'function') {
                        child.updatePadding();
                    }
                    if (typeof child.resetFontSettings === 'function') {
                        child.resetFontSettings();
                    }
                }
            });
        }
    };

    function refreshAllPictures() {
        if ($gameScreen && $gameScreen._pictures) {
            for (let i = 1; i <= $gameScreen.maxPictures(); i++) {
                const picture = $gameScreen.picture(i);
                if (picture) {
                    const originalName = picture.originalName;
                    let newName = originalName;
                    if (!newName.toLowerCase().endsWith('.png')) {
                        newName += '.png';
                    }
                    newName = translatePictureName(newName);
                    if (!originalName.toLowerCase().endsWith('.png') && newName.toLowerCase().endsWith('.png')) {
                        newName = newName.slice(0, -4);
                    }
                    picture.changeName(newName);
                }
            }
        }
    }

    Game_Picture.prototype.changeName = function (name) {
        if (this._name !== name) {
            this._name = name;
            this.initTarget();
        }
    };

    Object.defineProperty(Game_Picture.prototype, 'originalName', {
        get: function () {
            return this._originalName || this._name;
        },
        set: function (value) {
            this._originalName = value;
        }
    });


    function translatePictureName(name) {
        if (translations.hasOwnProperty(name)) {
            return translations[name];
        }
        return name;
    }

    function translateText(text) {
        if (typeof text !== 'string') {
            return text;
        }

        if (useTranslationCache && translationCache.hasOwnProperty(text)) {
            return translationCache[text];
        }

        if (text.toLowerCase().endsWith('.png')) {
            return text;
        }

        let translatedText = text;

        // First pass: full sentence and partial matches
        const { yepName, remainingText } = extractYepName(translatedText);

        if (translations.hasOwnProperty(yepName + remainingText)) {
            translatedText = yepName + translations[yepName + remainingText];
        } else if (translations.hasOwnProperty(remainingText)) {
            translatedText = yepName + translations[remainingText];
        } else {
            const lines = remainingText.split('\n');
            const translatedLines = lines.map(line => {
                if (translations.hasOwnProperty(line.trim())) {
                    return translations[line.trim()];
                } else if (partialMatching) {
                    // Only this part is affected by partialMatching
                    for (let i = 0, len = originalTexts.length; i < len; i++) {
                        const originalText = originalTexts[i];
                        if (line.includes(originalText)) {
                            return line.replace(originalText, translations[originalText] || originalText);
                        }
                    }
                }
                return line;
            });

            translatedLines[0] = yepName + translatedLines[0];
            translatedText = translatedLines.join('\n');
        }

        // Second pass: word-level translations
        Object.keys(wordTranslations).forEach(word => {
            let regex = wordTranslationRegexes.get(word);
            if (!regex) {
                regex = new RegExp(`${wordBoundaryRegex.source}${escapeRegExp(word)}${wordBoundaryRegex.source}`, 'g');
                wordTranslationRegexes.set(word, regex);
            }
            translatedText = translatedText.replace(regex, wordTranslations[word]);
        });

        // Replace {{LINEBREAK}} with actual line breaks for display
        translatedText = translatedText.replace(/{{LINEBREAK}}/g, '\n');

        if (useTranslationCache) {
            translationCache[text] = translatedText;
        }

        // Replacement for commands wrapped in [ ]
        if (translatedText && translatedText.includes('[')) {
            translatedText = translatedText.replace(/\[([^\]]+)\]/g, (match, p1) => {
                if (commandMappings.hasOwnProperty(p1)) {
                    const mapping = commandMappings[p1];
                    const method = lastInputMethod || 'keyboard';
                    return mapping[method] || mapping['keyboard'] || match;
                }
                return match;
            });
        }
        return translatedText;
    }

    // Override drawText method
    //const _Window_Base_drawText = Window_Base.prototype.drawText;
    //Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
    //    const translatedText = Hendrix_Localization((text));
    //    _Window_Base_drawText.call(this, translatedText, x, y, maxWidth, align);
    //};

    const _Game_Actor_profile = Game_Actor.prototype.profile;
    Game_Actor.prototype.profile = function () {
        return translateText(_Game_Actor_profile.call(this));
    };

    // Translate Show Pictures and Title background file
    const _Game_Screen_showPicture = Game_Screen.prototype.showPicture;
    Game_Screen.prototype.showPicture = function (pictureId, name, origin, x, y, scaleX, scaleY, opacity, blendMode) {
        let translatedName = name;
        let originalHadPng = name.toLowerCase().endsWith('.png');

        if (!originalHadPng) {
            translatedName += '.png';
        }
        translatedName = translatePictureName(translatedName);
        if (!originalHadPng && translatedName.toLowerCase().endsWith('.png')) {
            translatedName = translatedName.slice(0, -4);
        }

        _Game_Screen_showPicture.call(this, pictureId, translatedName, origin, x, y, scaleX, scaleY, opacity, blendMode);

        const picture = this.picture(pictureId);
        if (picture) {
            picture._originalName = name;
        }

    };

    const _Scene_Title_drawGameTitle = Scene_Title.prototype.drawGameTitle;
    Scene_Title.prototype.drawGameTitle = function () {
        if (DataManager._originalGameTitle && $dataSystem) {
            const translatedTitle = translateText(DataManager._originalGameTitle);
            $dataSystem.gameTitle = translatedTitle;
        }
        _Scene_Title_drawGameTitle.call(this);
    };

    const _Scene_Title_createBackground = Scene_Title.prototype.createBackground;
    Scene_Title.prototype.createBackground = function () {
        if (!originalTitle1) originalTitle1 = $dataSystem.title1Name;
        if (!originalTitle2) originalTitle2 = $dataSystem.title2Name;

        if (originalTitle1) {
            const title1File = originalTitle1 + '.png';
            const translatedTitle1 = translatePictureName(title1File);
            if (translatedTitle1 !== title1File) {
                $dataSystem.title1Name = translatedTitle1.replace('.png', '');
            }
        }

        if (originalTitle2) {
            const title2File = originalTitle2 + '.png';
            const translatedTitle2 = translatePictureName(title2File);
            if (translatedTitle2 !== title2File) {
                $dataSystem.title2Name = translatedTitle2.replace('.png', '');
            }
        }

        _Scene_Title_createBackground.call(this);
    };

    if (extractMapDisplayNames) {
        Window_MapName.prototype.refresh = function () {
            this.contents.clear();
            if ($gameMap.displayName()) {
                const translatedName = translateText($gameMap.displayName());
                if (Utils.RPGMAKER_NAME === "MZ") {
                    const width = this.innerWidth;
                    this.drawBackground(0, 0, width, this.lineHeight());
                    this.drawText(translatedName, 0, 0, width, 'center');
                } else {
                    const width = this.contentsWidth();
                    this.drawBackground(0, 0, width, this.lineHeight());
                    this.drawText(translatedName, 0, 0, width, 'center');
                }
            }
        };

        const _Game_Map_displayName = Game_Map.prototype.displayName;
        Game_Map.prototype.displayName = function () {
            const originalName = _Game_Map_displayName.call(this);
            return translateText(originalName);
        };

        const _DataManager_makeSavefileInfo = DataManager.makeSavefileInfo;
        DataManager.makeSavefileInfo = function () {
            const info = _DataManager_makeSavefileInfo.call(this);
            if (info.location) {
                info.location = translateText(info.location);
            }
            return info;
        };

        const _Scene_Menu_mapNameWindow = Scene_Menu.prototype.createMapNameWindow || function () { };
        Scene_Menu.prototype.createMapNameWindow = function () {
            _Scene_Menu_mapNameWindow.call(this);
            if (this._mapNameWindow && this._mapNameWindow.refresh) {
                this._mapNameWindow.refresh();
            }
        };
    }
    //---------------------------------------------------------

    Window_Help.prototype.refresh = function () {
        this.contents.clear();
        if (this._text) {
            const translatedText = translateText(this._text);
            if (this.baseTextRect) {
                // MZ
                const rect = this.baseTextRect();
                this.drawTextEx(translatedText, rect.x, rect.y - 8, rect.width);
            } else {
                // MV
                const rect = {
                    x: this.textPadding(),
                    y: 0,
                    width: this.contents.width - this.textPadding() * 2,
                    height: this.contents.height
                };
                this.drawTextEx(translatedText, rect.x, rect.y - 8, rect.width);
            }
        }
    };

    if (!Window_Base.prototype.calcTextWidth) {
        Window_Base.prototype.calcTextWidth = function (text) {
            var tempText = text.split('\n');
            var maxWidth = 0;
            for (var i = 0; i < tempText.length; i++) {
                var textWidth = this.textWidth(tempText[i]);
                if (maxWidth < textWidth) {
                    maxWidth = textWidth;
                }
            }
            return maxWidth;
        };
    }

    const _Window_Base_processEscapeCharacter = Window_Base.prototype.processEscapeCharacter;
    Window_Base.prototype.processEscapeCharacter = function (code, textState) {
        if (code === 'T') {
            const endIndex = textState.text.indexOf(']', textState.index);
            const textToTranslate = textState.text.substring(textState.index, endIndex);
            const translatedText = translateText(textToTranslate);
            textState.text = textState.text.replace(`T[${textToTranslate}]`, translatedText);
            textState.index = endIndex + 1;
        } else {
            _Window_Base_processEscapeCharacter.call(this, code, textState);
        }
    };

    window.Hendrix_Localization = function (text) {
        if (typeof translateText === 'function') {
            return translateText(text);
        }
        return text;
    };

    if (Imported['Galv_MessageStyles']) {
        Window_Message.prototype.changeWindowDimensions = function () {
            if (this.pTarget != null) {
                var w = 10;
                var h = 0;

                if (Imported.Galv_MessageBusts) {
                    if ($gameMessage.bustPos == 1) {
                        var faceoffset = 0;
                    } else {
                        var faceoffset = Galv.MB.w;
                    };
                } else {
                    var faceoffset = Window_Base._faceWidth + 25;
                };
                var xO = $gameMessage._faceName ? faceoffset : 0;
                xO += Galv.Mstyle.padding[1] + Galv.Mstyle.padding[3]; // Added padding

                this.resetFontSettings();
                for (var i = 0; i < $gameMessage._texts.length; i++) {
                    var lineWidth = this.testWidthEx($gameMessage._texts[i]) + this.standardPadding() * 2 + xO;
                    if (w < lineWidth) w = lineWidth;

                };
                this.resetFontSettings();
                this.width = Math.min(Graphics.boxWidth, w);

                var minFaceHeight = 0;
                if ($gameMessage._faceName) {
                    w += 15;
                    if (Imported.Galv_MessageBusts) {
                        if ($gameMessage.bustPos == 1) w += Galv.MB.w;
                        minFaceHeight = 0;
                    } else {
                        minFaceHeight = Window_Base._faceHeight + this.standardPadding() * 2;
                    };
                };

                var textState = { index: 0 };
                textState.text = this.convertEscapeCharacters($gameMessage.allText());
                var allLineHeight = this.calcTextHeight(textState, true);
                var height = allLineHeight + this.standardPadding() * 2;
                var minHeight = this.fittingHeight(0);
                this.height = Math.max(height, minHeight, minFaceHeight);
                this.yOffset = -Galv.Mstyle.yOffet - this.height;

            } else {
                this.yOffset = 0;
                this.width = this.windowWidth();
                this.height = Galv.Mstyle.Window_Message_windowHeight.call(this);
                this.x = (Graphics.boxWidth - this.width) / 2;
            };
        };
    }

    if (Imported.YEP_CommonEventMenu) {
        DataManager.processCEMNotetags1 = function (group) {
            for (var n = 1; n < group.length; n++) {
                var obj = group[n];
                var notedata = this.convertCommentsToText(obj);

                obj.iconIndex = Yanfly.Param.CEMIcon;
                obj.description = Hendrix_Localization(Yanfly.Param.CEMHelpDescription);
                obj.picture = '';
                obj.menuSettings = {
                    name: obj.name,
                    subtext: Hendrix_Localization(Yanfly.Param.CEMSubtext),
                    enabled: 'enabled = true',
                    show: 'visible = true'
                };
                var evalMode = 'none';

                for (var i = 0; i < notedata.length; i++) {
                    var line = notedata[i];
                    if (line.match(/<MENU NAME:[ ](.*)>/i)) {
                        var translatedLine = Hendrix_Localization(line);
                        if (translatedLine.match(/<MENU NAME:[ ](.*)>/i)) {
                            obj.menuSettings.name = String(RegExp.$1);
                        } else {
                            var menuName = String(RegExp.$1);
                            obj.menuSettings.name = Hendrix_Localization(menuName);
                        }
                    } else if (line.match(/<ICON:[ ](\d+)>/i)) {
                        obj.iconIndex = parseInt(RegExp.$1);
                    } else if (line.match(/<PICTURE:[ ](.*)>/i)) {
                        obj.picture = String(RegExp.$1);
                    } else if (line.match(/<HELP DESCRIPTION>/i)) {
                        evalMode = 'help description';
                        obj.description = '';
                    } else if (line.match(/<\/HELP DESCRIPTION>/i)) {
                        evalMode = 'none';
                        obj.description = Hendrix_Localization(obj.description);
                    } else if (evalMode === 'help description') {
                        obj.description += line + '\n';
                    } else if (line.match(/<SUBTEXT>/i)) {
                        evalMode = 'subtext';
                        obj.menuSettings.subtext = '';
                    } else if (line.match(/<\/SUBTEXT>/i)) {
                        evalMode = 'none';
                        obj.menuSettings.subtext = Hendrix_Localization(obj.menuSettings.subtext);
                    } else if (evalMode === 'subtext') {
                        obj.menuSettings.subtext += line + '\n';
                    } else if (line.match(/<MENU ENABLE EVAL>/i)) {
                        evalMode = 'menu enable eval';
                        obj.menuSettings.enabled = '';
                    } else if (line.match(/<\/MENU ENABLE EVAL>/i)) {
                        evalMode = 'none';
                    } else if (evalMode === 'menu enable eval') {
                        obj.menuSettings.enabled += line + '\n';
                    } else if (line.match(/<MENU VISIBLE EVAL>/i)) {
                        evalMode = 'menu visible eval';
                        obj.menuSettings.show = '';
                    } else if (line.match(/<\/MENU VISIBLE EVAL>/i)) {
                        evalMode = 'none';
                    } else if (evalMode === 'menu visible eval') {
                        obj.menuSettings.show += line + '\n';
                    }
                }
            }
        };
    }

    if (Imported.YEP_ItemCore) {
        Window_ItemInfo.prototype.drawInfoTextTop = function (dy) {
            var item = this._item;
            if (item.infoTextTop === undefined) {
                item.infoTextTop = DataManager.getBaseItem(item).infoTextTop;
            }
            if (item.infoTextTop === '') return dy;
            var fullText = Hendrix_Localization(item.infoTextTop);
            var info = fullText.split(/[\r\n]+/);

            for (var i = 0; i < info.length; ++i) {
                var line = "\\fs[20]" + info[i];
                this.drawTextEx(line, this.textPadding(), dy);
                dy += this.contents.fontSize + 8;
            }
            return dy;
        };

        Window_ItemInfo.prototype.drawInfoTextBottom = function (dy) {
            var item = this._item;
            if (item.infoTextBottom === undefined) {
                item.infoTextBottom = DataManager.getBaseItem(item).infoTextBottom;
            }
            if (item.infoTextBottom === '') return dy;
            var fullText = Hendrix_Localization(item.infoTextBottom);
            var info = fullText.split(/[\r\n]+/);

            for (var i = 0; i < info.length; ++i) {
                var line = info[i];
                this.resetFontSettings();
                this.drawTextEx(line, this.textPadding(), dy);
                dy += this.contents.fontSize + 8;
            }
            return dy;
        };
    }

    if (Imported.Tyruswoo_BigChoiceLists) {
        Game_Interpreter.prototype.command402 = function (params) {
            if (this._branch[this._indent] !== Hendrix_Localization(params[1])) {
                this.skipBranch();
            }
            return true;
        };
    }

    if (addLanguageCommandToTitle) {
        const _Scene_Title_createCommandWindow = Scene_Title.prototype.createCommandWindow;
        Scene_Title.prototype.createCommandWindow = function () {
            _Scene_Title_createCommandWindow.call(this);
            this._commandWindow.setHandler('language', this.commandLanguage.bind(this));
        };

        const _Window_TitleCommand_makeCommandList = Window_TitleCommand.prototype.makeCommandList;
        Window_TitleCommand.prototype.makeCommandList = function () {
            _Window_TitleCommand_makeCommandList.call(this);
            this._list = this._list.filter(command => command.symbol !== 'language');
            this.addCommand(this.currentLanguageName(), 'language');
        };

        Window_TitleCommand.prototype.currentLanguageName = function () {
            return getLanguageMenuLabel(ConfigManager.language) || getLanguageName(defaultLanguage);
        };

        Scene_Title.prototype.commandLanguage = function () {
            this.changeLanguage(1);
            this._commandWindow.activate();
            this._commandWindow.selectSymbol('language');
        };

        Scene_Title.prototype.changeLanguage = function (direction) {
            // Use availableLanguages instead of languageSymbols
            const currentIndex = availableLanguages.indexOf(ConfigManager.language);
            let nextIndex = (currentIndex + direction + availableLanguages.length) % availableLanguages.length;

            ConfigManager.language = availableLanguages[nextIndex];
            currentLanguage = ConfigManager.language;

            this._commandWindow.refresh();
            loadTranslations(currentLanguage);
            applyLanguageSettings();

            if (Imported.YEP_CommonEventMenu) { DataManager.processCEMNotetags1($dataCommonEvents); }

            if (autoRefreshPictures) {
                refreshAllPictures();
            }
            if (this._gameTitleSprite) {
                this._gameTitleSprite.bitmap.clear();
            }
            // this.drawGameTitle();
            if (SceneManager._scene && SceneManager._scene.refreshAllWindows) {
                if (this._commandWindow) {
                    this._commandWindow.refresh();
                }
            }
            ConfigManager.save();
        };
    }

    // Lightweight API for other plugins (e.g. the character-creation options
    // step) to list, label and switch languages without duplicating logic.
    window.HendrixLocalization = {
        getAvailableLanguages() {
            if (LOCKED_LANGUAGE) return [LOCKED_LANGUAGE];
            return sortLanguagesForMenu((availableLanguages && availableLanguages.length)
                ? availableLanguages
                : languageSymbols);
        },
        getLanguageName,
        getLanguageMenuLabel,
        getCurrentLanguage() { return ConfigManager.language; },
        isLocked() { return !!LOCKED_LANGUAGE; },
        setLanguage(symbol) { return window.changeToLanguage(symbol); },
    };

    window.changeToLanguage = function (languageSymbol) {
        if (LOCKED_LANGUAGE) return false;
        if (languageSymbol === 'next') {
            const currentIndex = availableLanguages.indexOf(ConfigManager.language);
            const nextIndex = (currentIndex + 1) % availableLanguages.length;
            languageSymbol = availableLanguages[nextIndex];
        }

        if (availableLanguages.includes(languageSymbol)) {
            ConfigManager.language = languageSymbol;
            currentLanguage = languageSymbol;

            loadTranslations(currentLanguage);
            applyLanguageSettings();

            if (autoRefreshPictures) {
                refreshAllPictures();
            }

            if (SceneManager._scene && SceneManager._scene.refreshAllWindows) {
                SceneManager._scene.refreshAllWindows();
            }

            ConfigManager.save();
            SoundManager.playCursor();

            return true;
        }
        return false;
    };

    //=================================================================
    // BATTLE %1 STUFF
    //=================================================================

    const _Window_BattleLog_displayAction = Window_BattleLog.prototype.displayAction;
    Window_BattleLog.prototype.displayAction = function (subject, item) {
        if (item && item.message1) {
            item.message1 = translateText(item.message1);
        }
        if (item && item.message2) {
            item.message2 = translateText(item.message2);
        }
        _Window_BattleLog_displayAction.call(this, subject, item);
    };

    const _Window_BattleLog_displayDamage = Window_BattleLog.prototype.displayDamage;
    Window_BattleLog.prototype.displayDamage = function (target) {
        const tempMakeHpDamageText = Game_Action.prototype.makeHpDamageText;
        Game_Action.prototype.makeHpDamageText = function (target) {
            const format = tempMakeHpDamageText.call(this, target);
            return translateText(format);
        };
        _Window_BattleLog_displayDamage.call(this, target);
        Game_Action.prototype.makeHpDamageText = tempMakeHpDamageText;
    };

    const _Window_BattleLog_displayAddedStates = Window_BattleLog.prototype.displayAddedStates;
    Window_BattleLog.prototype.displayAddedStates = function (target) {
        const states = target.result().addedStateObjects();
        for (const state of states) {
            if (state.message1) {
                state.message1 = translateText(state.message1);
            }
            if (state.message2) {
                state.message2 = translateText(state.message2);
            }
        }
        _Window_BattleLog_displayAddedStates.call(this, target);
    };

    const _Window_BattleLog_displayRemovedStates = Window_BattleLog.prototype.displayRemovedStates;
    Window_BattleLog.prototype.displayRemovedStates = function (target) {
        const states = target.result().removedStateObjects();
        for (const state of states) {
            if (state.message3) {
                state.message3 = translateText(state.message3);
            }
            if (state.message4) {
                state.message4 = translateText(state.message4);
            }
        }
        _Window_BattleLog_displayRemovedStates.call(this, target);
    };

    const _TextManager_getter = Object.getOwnPropertyDescriptors(TextManager);
    for (const prop in _TextManager_getter) {
        if (_TextManager_getter[prop].get) {
            const originalGetter = _TextManager_getter[prop].get;
            Object.defineProperty(TextManager, prop, {
                get: function () {
                    return translateText(originalGetter.call(this));
                },
                configurable: true
            });
        }
    }
    // Input tracking for commands replacement
    const _Input_onKeyDown = Input._onKeyDown;
    Input._onKeyDown = function (event) {
        lastInputMethod = 'keyboard';
        if (_Input_onKeyDown) _Input_onKeyDown.call(this, event);
    };

    const _Input_updateGamepadState = Input._updateGamepadState;
    Input._updateGamepadState = function (gamepad) {
        if (_Input_updateGamepadState) _Input_updateGamepadState.call(this, gamepad);
        if (gamepad && gamepad.buttons.some(b => b.pressed)) {
            lastInputMethod = 'gamepad';
        }
    };

    if (typeof window.translateText === 'undefined') {
        window.translateText = Hendrix_Localization;
    }
})();