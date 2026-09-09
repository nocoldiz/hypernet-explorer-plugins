/*:
 * @target MZ
 * @plugindesc News Management System v1.0.1
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help
 * ============================================================================
 * News Management Plugin for RPG Maker MZ
 * ============================================================================
 * 
 * This plugin manages news events and market effects for your game.
 * It can work standalone or integrate with the Real Estate System.
 * 
 * Features:
 * - Procedural news generation
 * - Real/hardcoded news events at 8AM daily
 * - Market effects on properties
 * - News history tracking
 * - Soul tendency system integration
 * - Multi-language support (English/Italian)
 * 
 * Plugin Commands:
 * - Check News History
 * - Force News Event (for testing)
 * 
 * @command checkNewsHistory
 * @text Check News History
 * @desc Shows recent market news
 * 
 * @command forceNewsEvent
 * @text Force News Event
 * @desc Forces a news event to occur (for testing)
 */

(() => {
    'use strict';

    const pluginName = 'NewsSystem';

    // Language check function
    window.NewsSystemUtils = window.NewsSystemUtils || {};

    window.NewsSystemUtils.isItalian = function () {
        return ConfigManager.language === "it";
    };

    // Get News Data
    const { News, Translations, RealNews } = window.News || { News: {}, Translations: {}, RealNews: [] };

    // RealNews.json carries i18n keys ("RealNews.real_0.title"), not headlines:
    // the copy lives in js/i18n/<lang>/plugins/RealNews.json, so an archive
    // bulletin reads in the player's language. A bulletin added by hand with
    // plain text in it is shown as written.
    // What an archive bulletin is remembered by once it has been shown. It used
    // to be the English headline; the file now carries an id of its own, which
    // says the same thing in every language.
    function realNewsId(newsItem) {
        return (newsItem && (newsItem.id || newsItem.title)) || '';
    }

    function realNewsText(value) {
        if (!value) return '';
        const key = String(value);
        return (typeof T === 'function' && T.has && T.has(key)) ? T(key) : key;
    }

    // Export translations for other plugins
    window.NewsSystemUtils.Translations = Translations;

    // Get translation function
    window.NewsSystemUtils.t = function (key, replacements = {}) {
        const lang = T('NewsSystem.ui.en');
        let text = Translations[lang][key] || Translations.en[key] || key;

        // Handle replacements
        Object.keys(replacements).forEach(placeholder => {
            text = text.replace(new RegExp(`{${placeholder}}`, 'g'), replacements[placeholder]);
        });

        return text;
    };

    const t = window.NewsSystemUtils.t;

    // --- Helper Function to Parse Game Date from Variable 113 ---
    function getGameDateFromVariable() {
        const dateStr = (typeof $gameVariables !== 'undefined' && $gameVariables ? $gameVariables.value(113) : null) || '01 JAN 2001 12:00';
        // Format: "01 JAN 2001 12:00"
        const parts = dateStr.split(' ').filter(Boolean);
        if (parts.length < 4) {
            return { day: 1, month: 0, year: 2001, hours: 8, minutes: 0 };
        }

        const day = parseInt(parts[0]) || 1;
        const monthStr = (parts[1] || '').toUpperCase();
        const year = parseInt(parts[2]) || 2001;
        const timeStr = (parts[3] || '12:00').split(':');
        const hours = parseInt(timeStr[0]) || 0;
        const minutes = parseInt(timeStr[1]) || 0;

        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        let month = months.indexOf(monthStr);
        if (month === -1) {
            const itMonths = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
            month = itMonths.indexOf(monthStr);
        }
        if (month === -1) {
            month = 0;
        }

        return { day, month, year, hours, minutes };
    }


    // --- Helper Function to Get Current Game Date as JavaScript Date ---
    // The reader's own words are written back into the markup (the search box
    // value, the "nothing matched" line), so they are escaped on the way in.
    function escapeNewsHTML(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getGameDateAsJSDate() {
        const gameDate = getGameDateFromVariable();
        return new Date(gameDate.year, gameDate.month, gameDate.day, gameDate.hours, gameDate.minutes, 0);
    }

    // --- Template token filling ---------------------------------------------
    // Every {token} in a News.json template is picked from a bank stored on the
    // same event, but the banks are named freely: {festival} comes from
    // "festivals", {festival_type} from "festival_types", {celebrity} from
    // "celebrities"... so the token is matched against the singular and plural
    // spellings of each key instead of being listed by hand. Adding a bank to
    // News.json then needs no code change, which is how {festival_type},
    // {company_type}, {illness} and {art_movement} ended up printed raw.
    function bankForToken(event, token, lang) {
        const candidates = [token, token + 's', token + 'es'];
        if (token.endsWith('y')) candidates.push(token.slice(0, -1) + 'ies');
        for (const key of candidates) {
            const bank = event[key];
            if (!bank || typeof bank !== 'object') continue;
            const list = Array.isArray(bank[lang]) ? bank[lang] : bank.en;
            if (Array.isArray(list) && list.length > 0) return list;
        }
        return null;
    }

    function fillTemplateTokens(text, event, lang) {
        if (!text || text.indexOf('{') === -1) return text;
        return text.replace(/{([a-z][a-z_]*)}/gi, (match, token) => {
            const bank = bankForToken(event, token, lang);
            if (!bank) return match;
            return bank[Math.floor(Math.random() * bank.length)];
        });
    }

    // Nothing reaches the newspaper with an unresolved {token} in it: a template
    // naming a bank its event does not carry drops the token instead of
    // printing it, and the same pass heals headlines written by older saves.
    function stripUnresolvedTokens(text) {
        if (typeof text !== 'string' || text.indexOf('{') === -1) return text;
        return text.replace(/{[a-z][a-z_]*}/gi, '')
            .replace(/\s+([,.;:!?'’])/g, '$1')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    window.NewsSystemUtils.stripUnresolvedTokens = stripUnresolvedTokens;

    // European locations with Italian Translations
    // A randomised pool, so a language keeps its own list whole (see T.pool).
    window.NewsSystemUtils.LOCATIONS = {
        get en() { return T.pool('NewsSystem.locations'); },
        get it() { return T.pool('NewsSystem.locations'); },
    };

    // Procedural news and the Real Estate market both draw their locations from
    // here. Sourced from js/db/WorkSystem/Destinations.json (window.WorkSystem.
    // Destinations, populated by DataService before this plugin loads) so news
    // events and properties live in actual in-game towns instead of hardcoded
    // real-world capitals. The hardcoded LOCATIONS lists remain only as a
    // fallback and for matching real-world RealNews headlines (LocationMatcher).
    // A headline and a property listing both name the place the way the player
    // sees it, so the entries come back as the readable "name" of each
    // destination rather than its file key ("GreenWitch" -> "Green Witch").
    window.NewsSystemUtils.getLocations = function () {
        const dest = window.WorkSystem && window.WorkSystem.Destinations;
        if (dest) {
            const names = window.WorkSystem.destinationNames
                ? window.WorkSystem.destinationNames() : Object.keys(dest);
            if (names.length > 0) return names;
        }
        return window.NewsSystemUtils.isItalian() ?
            window.NewsSystemUtils.LOCATIONS.it :
            window.NewsSystemUtils.LOCATIONS.en;
    };

    // News Manager Class
    class NewsManager {
        constructor() {
            this.newsHistory = [];
            this.activeEffects = [];
            const gameDate = getGameDateFromVariable();
            this.currentHour = gameDate.hours;
            this.lastDailyNewsCheck = null;
            this.usedRealNewsIds = new Set();
            this.newsListeners = [];
        }

        // Register a listener for news events
        registerListener(callback) {
            this.newsListeners.push(callback);
        }

        // Notify all listeners of news events
        notifyListeners(news, duration) {
            this.newsListeners.forEach(callback => {
                if (typeof callback === 'function') {
                    callback(news, duration);
                }
            });
        }

        initialize() {
            console.log('NewsManager: Initializing...');
            console.log('NewsManager: RealNews data available:', RealNews ? RealNews.length : 0, 'items');

            // First generate past real news to show historical context
            this.generatePastRealNews();

            // Then generate procedural news mixed throughout the timeline
            this.generateInitialProceduralNews();

            this.lastDailyNewsCheck = getGameDateAsJSDate();
            this.startHourlyUpdates();

            console.log('NewsManager: Initialization complete. Total news items:', this.newsHistory.length);
        }

        // Parse date from DD/MM/YYYY format
        parseDateString(dateString) {
            const [day, month, year] = dateString.split('/').map(num => parseInt(num, 10));
            return new Date(year, month - 1, day);
        }

        // Parse date and create current year version
        parseDateToCurrentYear(dateString) {
            const [day, month, year] = dateString.split('/').map(num => parseInt(num, 10));
            const currentYear = new Date().getFullYear();
            return new Date(currentYear, month - 1, day);
        }

        // Check if a date matches today
        isDateToday(dateString) {
            const [day, month] = dateString.split('/').map(num => parseInt(num, 10));
            const today = getGameDateAsJSDate();
            return today.getDate() === day && (today.getMonth() + 1) === month;
        }

        // Check if a date is from January 1st of current year to now
        isDateSinceJanuary1st(dateString) {
            const [day, month, originalYear] = dateString.split('/').map(num => parseInt(num, 10));
            const now = getGameDateAsJSDate();
            const currentYear = now.getFullYear();
            const january1st = new Date(currentYear, 0, 1); // January 1st of current year

            // Check current year date
            const currentYearDate = new Date(currentYear, month - 1, day);

            return currentYearDate >= january1st && currentYearDate <= now;
        }

        // Check if we need to process daily news
        shouldProcessDailyNews() {
            const now = getGameDateAsJSDate();

            if (!this.lastDailyNewsCheck) {
                return true;
            }

            const lastCheck = new Date(this.lastDailyNewsCheck);

            // Check if it's a new day
            if (now.getDate() !== lastCheck.getDate() ||
                now.getMonth() !== lastCheck.getMonth() ||
                now.getFullYear() !== lastCheck.getFullYear()) {
                return true;
            }

            return false;
        }

        // Check if we need to process timed news for today
        shouldProcessTimedNews() {
            if (!RealNews || !Array.isArray(RealNews)) return [];

            const now = getGameDateAsJSDate();
            const todaysNews = RealNews.filter(newsItem => {
                return this.isDateToday(newsItem.date) && !this.usedRealNewsIds.has(realNewsId(newsItem));
            });

            // Filter news that should be shown at current time
            return todaysNews.filter(newsItem => {
                if (!newsItem.time) return false;

                const [hours, minutes] = newsItem.time.split(':').map(num => parseInt(num, 10));
                const newsTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

                // Show news if current time is at or past the scheduled time
                return now >= newsTime;
            });
        }

        // Process daily hardcoded news
        processDailyNews() {
            if (this.isEmptyWorld()) return;
            if (!RealNews || !Array.isArray(RealNews)) {
                console.log('NewsManager: No RealNews data available for daily processing');
                return;
            }

            console.log('NewsManager: Processing daily news...');

            const todaysNews = RealNews.filter(newsItem => {
                return this.isDateToday(newsItem.date) && !this.usedRealNewsIds.has(realNewsId(newsItem));
            });

            console.log('NewsManager: Found', todaysNews.length, 'news items for today');

            // Sort today's news by time if available
            todaysNews.sort((a, b) => {
                const timeA = a.time || "08:00";
                const timeB = b.time || "08:00";
                return timeA.localeCompare(timeB);
            });

            todaysNews.forEach(newsItem => {
                this.addRealNewsItem(newsItem, false); // false = not historical
                this.usedRealNewsIds.add(realNewsId(newsItem));
            });

            this.lastDailyNewsCheck = getGameDateAsJSDate();
        }

        // Process timed news that should appear now
        processTimedNews() {
            const timedNews = this.shouldProcessTimedNews();

            if (timedNews.length > 0) {
                console.log('NewsManager: Processing', timedNews.length, 'timed news items');

                timedNews.forEach(newsItem => {
                    this.addRealNewsItem(newsItem, false); // false = not historical, show notification
                    this.usedRealNewsIds.add(realNewsId(newsItem));
                });
            }
        }

        // Add a real news item
        // Add a real news item
        addRealNewsItem(newsItem) {
            const title = realNewsText(newsItem.title);
            const description = realNewsText(newsItem.desc);

            // Priority order: explicit location key > city key > enhanced location detection
            let location;
            if (newsItem.location && newsItem.location.trim() !== '') {
                location = newsItem.location.trim();
            } else if (newsItem.city && newsItem.city.trim() !== '') {
                location = newsItem.city.trim();
            } else {
                location = window.NewsSystemUtils.LocationMatcher.determineLocation(newsItem);
            }

            const soulEffect = newsItem.soul || 0;
            let priceEffect = 1;
            let occupancyEffect = 1;

            if (soulEffect > 0) {
                priceEffect = 1 + (soulEffect * 0.02);
                occupancyEffect = 1 + (soulEffect * 0.03);
            } else if (soulEffect < 0) {
                priceEffect = 1 + (soulEffect * 0.02);
                occupancyEffect = 1 + (soulEffect * 0.03);
            }

            const news = {
                text: title,
                fullText: description,
                location: location,
                category: 'real',
                type: 'daily',
                timestamp: getGameDateAsJSDate(),
                priceEffect: priceEffect,
                occupancyEffect: occupancyEffect,
                soulTendencyModifier: soulEffect,
                isRealNews: true,
                isHistorical: false
            };

            this.newsHistory.unshift(news);
            if (this.newsHistory.length > 100) {
                this.newsHistory.pop();
            }

            this.applyNewsEffects(news, 168); // 1 week duration

            if (SceneManager._scene instanceof Scene_Map) {
                this.showNewsNotification(title);
            }
        }

        // The world's own chronicle reaching the wire. HistorySimulator writes
        // an entry a day into the world folder and hands the readable ones
        // here, so what the ticker carries is what actually happened in this
        // world rather than only invented filler. Nothing is applied to prices
        // or occupancy: a coup in the Archive is a headline, not a market.
        addWorldEvent(text, dateStr) {
            const line = String(text || "").trim();
            if (!line) return;
            if (this.newsHistory.some((news) => news.text === line)) return;
            this.newsHistory.unshift({
                text: line,
                location: dateStr || "",
                category: 'world',
                type: 'chronicle',
                timestamp: getGameDateAsJSDate(),
                priceEffect: 1,
                occupancyEffect: 1,
                isRealNews: true,
                isHistorical: false
            });
            if (this.newsHistory.length > 100) this.newsHistory.pop();
        }

        // A bulletin interrupts nothing. It used to open a message box the
        // player had to click through, which on the world map meant a textbox
        // in the middle of travelling; now the headline slides by as a short
        // toast and the player keeps walking.
        showNewsNotification(title) {
            const line = String(title || "").trim();
            if (!line) return;
            if (!window.ParchmentToast) return;
            window.ParchmentToast.show(line, {
                title: t('breakingNews'),
                severity: "info",
                duration: 180,
                key: `news:${line}`
            });
        }

        generateInitialProceduralNews() {

            const now = getGameDateAsJSDate();
            const currentYear = now.getFullYear();
            const january1st = new Date(currentYear, 0, 1);

            // Calculate how many weeks have passed since January 1st
            const msInWeek = 7 * 24 * 60 * 60 * 1000;
            const weeksSinceJanuary = Math.floor((now - january1st) / msInWeek);
            const maxProceduralNews = Math.min(weeksSinceJanuary * 4, 50); // Max 4 per week, cap at 50


            for (let i = 0; i < maxProceduralNews; i++) {
                // Generate random timestamp between January 1st and now
                const randomTime = january1st.getTime() + Math.random() * (now.getTime() - january1st.getTime());
                const timestamp = new Date(randomTime);

                const locations = window.NewsSystemUtils.getLocations();
                const location = locations[Math.floor(Math.random() * locations.length)];
                const eventCategory = this.selectEventCategory();
                const eventType = this.selectEventType(eventCategory);
                const event = News[eventCategory][eventType];

                if (!event) {
                    console.warn('NewsManager: Could not find event for category:', eventCategory, 'type:', eventType);
                    continue;
                }

                let newsText = this.generateNewsText(event, location, eventType);

                const news = {
                    text: newsText,
                    location: location,
                    category: eventCategory,
                    type: eventType,
                    timestamp: timestamp,
                    priceEffect: event.priceEffect,
                    occupancyEffect: event.occupancyEffect,
                    isRealNews: false,
                    isHistorical: true
                };

                this.newsHistory.push(news);

                // Apply effects only if the news is recent (within last week)
                const hoursElapsed = (now - timestamp) / 3600000;
                if (hoursElapsed <= 168) { // Within last week
                    const hoursRemaining = event.duration - hoursElapsed;
                    if (hoursRemaining > 0) {
                        this.applyNewsEffects(news, hoursRemaining);
                    }
                }
            }

            // Sort all news by timestamp after adding both real and procedural news
            this.newsHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        }

        generatePastRealNews() {
            if (!RealNews || !Array.isArray(RealNews)) {
                console.log('NewsManager: No RealNews data available for past news generation');
                return;
            }

            const now = getGameDateAsJSDate();
            const currentYear = now.getFullYear();
            const january1st = new Date(currentYear, 0, 1); // January 1st of current year

            let addedCount = 0;

            // Create array of past news with proper timestamps
            const pastNewsItems = [];

            RealNews.forEach(newsItem => {
                // Parse the original date
                const [day, month, originalYear] = newsItem.date.split('/').map(num => parseInt(num, 10));

                // Create date for current year only
                const currentYearDate = new Date(currentYear, month - 1, day);

                // Check if current year date is since January 1st and not in the future
                if (currentYearDate >= january1st && currentYearDate <= now) {
                    // Create timestamp with proper time
                    let timestamp;
                    if (newsItem.time) {
                        const [hours, minutes] = newsItem.time.split(':').map(num => parseInt(num, 10));
                        timestamp = new Date(currentYearDate.getFullYear(), currentYearDate.getMonth(), currentYearDate.getDate(), hours, minutes, 0);
                    } else {
                        timestamp = new Date(currentYearDate.getFullYear(), currentYearDate.getMonth(), currentYearDate.getDate(), 8, 0, 0);
                    }

                    pastNewsItems.push({
                        newsItem: newsItem,
                        timestamp: timestamp
                    });
                }
            });

            // Sort by timestamp (chronological order)
            pastNewsItems.sort((a, b) => a.timestamp - b.timestamp);

            // Add news items in chronological order
            pastNewsItems.forEach(({ newsItem, timestamp }) => {
                const title = realNewsText(newsItem.title);
                const description = realNewsText(newsItem.desc);

                // Priority order: explicit location key > city key > enhanced location detection
                let location;
                if (newsItem.location && newsItem.location.trim() !== '') {
                    location = newsItem.location.trim();
                } else if (newsItem.city && newsItem.city.trim() !== '') {
                    location = newsItem.city.trim();
                } else {
                    location = window.NewsSystemUtils.LocationMatcher.determineLocation(newsItem);
                }

                const soulEffect = newsItem.soul || 0;
                let priceEffect = 1;
                let occupancyEffect = 1;

                if (soulEffect !== 0) {
                    priceEffect = 1 + (soulEffect * 0.02);
                    occupancyEffect = 1 + (soulEffect * 0.03);
                }

                const news = {
                    text: title,
                    fullText: description,
                    location: location,
                    category: 'real',
                    type: 'daily',
                    timestamp: timestamp,
                    priceEffect: priceEffect,
                    occupancyEffect: occupancyEffect,
                    soulTendencyModifier: soulEffect,
                    isRealNews: true,
                    isHistorical: true,
                    scheduledTime: newsItem.time || null
                };

                this.newsHistory.push(news);
                this.usedRealNewsIds.add(realNewsId(newsItem));
                addedCount++;

                // Apply effects if still within duration (1 week from event date)
                const hoursElapsed = (now - timestamp) / 3600000;
                const hoursRemaining = 168 - hoursElapsed; // 1 week duration
                if (hoursRemaining > 0) {
                    this.applyNewsEffects(news, hoursRemaining);
                }
            });
        }

        startHourlyUpdates() {
            // Clear any prior interval so handles do not stack across new game / load.
            if (this._hourlyInterval) {
                clearInterval(this._hourlyInterval);
                this._hourlyInterval = null;
            }
            this._hourlyInterval = setInterval(() => {
                const gameDate = getGameDateFromVariable();
                if (gameDate.hours !== this.currentHour) {
                    this.currentHour = gameDate.hours;
                    this.processHourlyUpdate();
                }

                // Check for timed news every minute
                this.processTimedNews();

                if (this.shouldProcessDailyNews()) {
                    this.processDailyNews();
                }

                // A charge sheet filed yesterday runs as soon as its day comes.
                this.publishCrimeDossiers();
            }, 60000); // Check every minute for more precise timing
        }

        stopHourlyUpdates() {
            if (this._hourlyInterval) {
                clearInterval(this._hourlyInterval);
                this._hourlyInterval = null;
            }
        }

        processHourlyUpdate() {
            this.activeEffects = this.activeEffects.filter(effect => {
                effect.remainingHours--;
                return effect.remainingHours > 0;
            });

            if (Math.random() < 0.3) {
                this.generateNewsEvent();
            }

            if (SceneManager._scene instanceof Scene_Map && this.newsHistory.length > 0) {
                const recentNews = this.newsHistory.filter(news => {
                    const newsTime = new Date(news.timestamp);
                    const now = getGameDateAsJSDate();
                    return (now - newsTime) < 3600000;
                });

                // Only the freshest headline of the hour is announced, and as
                // a toast: a whole hour of the wire read out in a message box
                // was a wall of text nobody asked for.
                if (recentNews.length > 0) {
                    this.showNewsNotification(recentNews[0].text);
                }
            }

            this.save();
        }

        // Nothing happens in an empty world, so nothing is reported in one:
        // the ticker, the daily bulletin and the backfill all stop dead rather
        // than printing a paper for a continent with nobody on it.
        isEmptyWorld() {
            const WM = window.WorldManager;
            return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
        }

        generateNewsEvent() {
            if (this.isEmptyWorld()) return null;
            const locations = window.NewsSystemUtils.getLocations();
            const location = locations[Math.floor(Math.random() * locations.length)];
            const eventCategory = this.selectEventCategory();
            const eventType = this.selectEventType(eventCategory);
            const event = News[eventCategory][eventType];

            let newsText = this.generateNewsText(event, location, eventType);

            const news = {
                text: newsText,
                location: location,
                category: eventCategory,
                type: eventType,
                timestamp: getGameDateAsJSDate(),
                priceEffect: event.priceEffect,
                occupancyEffect: event.occupancyEffect,
                isRealNews: false
            };

            this.newsHistory.unshift(news);
            if (this.newsHistory.length > 50) {
                this.newsHistory.pop();
            }

            this.applyNewsEffects(news, event.duration);
        }

        selectEventCategory() {
            const rand = Math.random();
            if (rand < 0.35) return 'positive';
            if (rand < 0.60) return 'negative';
            if (rand < 0.75) return 'neutral';
            return 'surreal';
        }

        selectEventType(category) {
            const types = Object.keys(News[category]);
            return types[Math.floor(Math.random() * types.length)];
        }

        generateNewsText(event, location, eventType) {
            const lang = T('NewsSystem.ui.en');
            const templates = event.templates[lang];
            let text = templates[Math.floor(Math.random() * templates.length)];

            text = text.replace(/{location}/g, location);

            // Word banks carried by the event itself ({festival}, {disaster},
            // {festival_type}, {illness}, ...), resolved by name.
            text = fillTemplateTokens(text, event, lang);

            // Computed tokens, which have no bank to draw from.
            if (text.includes('{amount}')) {
                const amount = Math.floor(Math.random() * 450) + 50;
                text = text.replace(/{amount}/g, amount);
            }

            if (text.includes('{number}')) {
                if (text.includes(T('NewsSystem.ui.layoffs'))) {
                    const number = (Math.floor(Math.random() * 9) + 1) * 100;
                    text = text.replace(/{number}/, number);
                } else if (text.includes(T('NewsSystem.ui.ducks'))) {
                    const number = Math.floor(Math.random() * 9000) + 1000;
                    text = text.replace(/{number}/, number);
                } else {
                    const number = Math.floor(Math.random() * 100) + 1;
                    text = text.replace(/{number}/g, number);
                }
            }

            if (text.includes('{rank}')) {
                const rank = Math.floor(Math.random() * 10) + 1;
                text = text.replace(/{rank}/g, '#' + rank);
            }

            const orphans = text.match(/{[a-z][a-z_]*}/gi);
            if (orphans) {
                console.warn('NewsManager: no word bank on', eventType, 'for', orphans.join(', '));
            }

            return stripUnresolvedTokens(text);
        }

        // ==================================================================
        // Stories the rest of the game writes
        // ==================================================================
        // A charge sheet, an outbreak bulletin: prose another plugin composed,
        // filed on the wire like anything else so the paper, the ticker and
        // the market effects all treat it the same.
        publishStory(story) {
            const news = {
                text: story.text,
                fullText: story.fullText || '',
                location: story.location || '',
                category: story.category || 'negative',
                type: story.type || 'story',
                timestamp: story.timestamp || getGameDateAsJSDate(),
                priceEffect: story.priceEffect != null ? story.priceEffect : 1,
                occupancyEffect: story.occupancyEffect != null ? story.occupancyEffect : 1,
                soulTendencyModifier: story.soul || 0,
                isRealNews: false
            };
            this.newsHistory.unshift(news);
            this.newsHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (this.newsHistory.length > 80) this.newsHistory.length = 80;
            this.applyNewsEffects(news, story.duration || 96);
            if (story.announce !== false) this.showNewsNotification(news.text);
            return news;
        }

        // The party's own charge sheet, once a day of it is worth printing.
        // CrimeSystem keeps the tally and decides what counts; this only sets
        // the type.
        publishCrimeDossiers() {
            const CS = window.CrimeSystem;
            if (!CS || typeof CS.takePressDossiers !== 'function') return 0;
            if (this.isEmptyWorld()) return 0;
            let printed = 0;
            for (const dossier of CS.takePressDossiers()) {
                const charges = (dossier.charges || [])
                    .map(c => c.count > 1 ? T('News.crime.count', { charge: c.name, count: c.count }) : c.name);
                if (!charges.length) continue;
                const name = ($gameParty && $gameParty.leader() && $gameParty.leader().name()) || T('News.crime.unknownSuspect');
                const locations = window.NewsSystemUtils.getLocations();
                const location = locations[Math.floor(Math.random() * locations.length)];
                const euros = amount => (Math.round(amount) / 100).toLocaleString('en-GB') + '€';
                const text = T(dossier.pastLife ? 'News.crime.pastHeadline' : 'News.crime.headline',
                    { name: name, place: location, bounty: euros(dossier.totalGold || dossier.dayGold) });
                const body = T('News.crime.body', {
                    name: name,
                    charges: charges.join(', '),
                    dayBounty: euros(dossier.dayGold),
                    bounty: euros(dossier.totalGold || dossier.dayGold)
                });
                this.publishStory({
                    text, fullText: body, location,
                    category: 'negative', type: 'crime',
                    priceEffect: 1, occupancyEffect: 0.97, soul: -1,
                    duration: 72
                });
                printed++;
            }
            return printed;
        }

        applyNewsEffects(news, duration) {
            const effect = {
                newsId: news.timestamp,
                location: news.location,
                priceEffect: news.priceEffect,
                occupancyEffect: news.occupancyEffect,
                remainingHours: duration,
                category: news.category,
                type: news.type,
                soulTendencyModifier: news.soulTendencyModifier || 0,
                isHistorical: news.isHistorical || false
            };

            this.activeEffects.push(effect);

            // Notify listeners (like Real Estate plugin)
            this.notifyListeners(news, duration);

            // Update soul tendency if applicable
            this.updateSoulTendencyVariable();
        }

        getActiveEffectsForLocation(location) {
            return this.activeEffects.filter(effect => effect.location === location);
        }

        calculateCombinedSoulTendency() {
            let totalModifier = 0;

            this.activeEffects.forEach(effect => {
                const newsItem = this.newsHistory.find(news => news.timestamp === effect.newsId);
                const isHistorical = newsItem && newsItem.isHistorical;

                if (!isHistorical) {
                    if (effect.soulTendencyModifier) {
                        totalModifier += effect.soulTendencyModifier;
                    } else if (effect.category && effect.type && News[effect.category] && News[effect.category][effect.type]) {
                        const soulModifier = News[effect.category][effect.type].soulTendencyModifier || 0;
                        totalModifier += soulModifier;
                    }
                }
            });

            return totalModifier;
        }

        updateSoulTendencyVariable() {
            const totalModifier = this.calculateCombinedSoulTendency();
            const currentValue = $gameVariables.value(53) || 66666;

            const percentageChange = totalModifier;
            const newValue = currentValue + (currentValue * percentageChange / 100);

            $gameVariables.setValue(53, Math.round(newValue * 100) / 100);
        }

        cleanupOldNews() {
            const now = getGameDateAsJSDate();
            const currentYear = now.getFullYear();
            const january1st = new Date(currentYear, 0, 1);

            this.newsHistory = this.newsHistory.filter(news => {
                const newsTime = new Date(news.timestamp);
                return newsTime >= january1st;
            });

            this.activeEffects = this.activeEffects.filter(effect => {
                return effect.remainingHours > 0;
            });

            if (RealNews && Array.isArray(RealNews)) {
                const validNewsIds = new Set();
                RealNews.forEach(newsItem => {
                    if (this.isDateSinceJanuary1st(newsItem.date)) {
                        validNewsIds.add(realNewsId(newsItem));
                    }
                });

                this.usedRealNewsIds = new Set([...this.usedRealNewsIds].filter(id => validNewsIds.has(id)));
            }
        }

        save() {
            $gameSystem.newsSystemData = {
                newsHistory: this.newsHistory,
                activeEffects: this.activeEffects,
                currentHour: this.currentHour,
                lastDailyNewsCheck: this.lastDailyNewsCheck,
                usedRealNewsIds: Array.from(this.usedRealNewsIds)
            };
        }

        load() {
            const data = $gameSystem.newsSystemData;
            if (data) {
                // Check if we need to clear news due to year change
                const shouldClearNews = this.shouldClearNewsForYearChange(data);

                if (shouldClearNews) {
                    console.log('NewsManager: Year change detected, clearing old news data');
                    this.newsHistory = [];
                    this.activeEffects = [];
                    this.usedRealNewsIds = new Set();
                    this.lastDailyNewsCheck = null;
                    this.initialize();
                } else {
                    this.newsHistory = data.newsHistory || [];
                    // Saves written before the token filler was data-driven hold
                    // headlines with a raw {token} in them; clean them on read.
                    this.newsHistory.forEach(news => {
                        if (!news) return;
                        news.text = stripUnresolvedTokens(news.text);
                        if (news.fullText) news.fullText = stripUnresolvedTokens(news.fullText);
                    });
                    this.activeEffects = data.activeEffects || [];
                    const gameDate = getGameDateFromVariable();
                    this.currentHour = data.currentHour !== undefined ? data.currentHour : gameDate.hours;
                    this.lastDailyNewsCheck = data.lastDailyNewsCheck ? new Date(data.lastDailyNewsCheck) : null;
                    this.usedRealNewsIds = new Set(data.usedRealNewsIds || []);

                    this.cleanupOldNews();

                    if (this.newsHistory.length === 0) {
                        this.initialize();
                    } else {
                        // Still generate procedural news if we have gaps
                        this.fillProceduralNewsGaps();
                    }

                    if (this.shouldProcessDailyNews()) {
                        this.processDailyNews();
                    }
                }
            } else {
                this.initialize();
            }
        }

        shouldClearNewsForYearChange(data) {
            if (!data.lastDailyNewsCheck) return false;

            const lastCheckDate = new Date(data.lastDailyNewsCheck);
            const currentDate = getGameDateAsJSDate();

            // If the year has changed, clear the news
            return lastCheckDate.getFullYear() !== currentDate.getFullYear();
        }

        fillProceduralNewsGaps() {
            if (this.isEmptyWorld()) return;
            const now = getGameDateAsJSDate();
            const currentYear = now.getFullYear();
            const january1st = new Date(currentYear, 0, 1);

            // Calculate how many weeks have passed and how many procedural news we should have
            const msInWeek = 7 * 24 * 60 * 60 * 1000;
            const weeksSinceJanuary = Math.floor((now - january1st) / msInWeek);
            const expectedProceduralNews = Math.min(weeksSinceJanuary * 4, 50);

            // Count existing procedural news
            const existingProceduralNews = this.newsHistory.filter(news => !news.isRealNews).length;

            const newsToAdd = Math.max(0, expectedProceduralNews - existingProceduralNews);

            for (let i = 0; i < newsToAdd; i++) {
                // Generate random timestamp between January 1st and now
                const randomTime = january1st.getTime() + Math.random() * (now.getTime() - january1st.getTime());
                const timestamp = new Date(randomTime);

                const locations = window.NewsSystemUtils.getLocations();
                const location = locations[Math.floor(Math.random() * locations.length)];
                const eventCategory = this.selectEventCategory();
                const eventType = this.selectEventType(eventCategory);
                const event = News[eventCategory][eventType];

                if (!event) {
                    continue;
                }

                let newsText = this.generateNewsText(event, location, eventType);

                const news = {
                    text: newsText,
                    location: location,
                    category: eventCategory,
                    type: eventType,
                    timestamp: timestamp,
                    priceEffect: event.priceEffect,
                    occupancyEffect: event.occupancyEffect,
                    isRealNews: false,
                    isHistorical: true
                };

                this.newsHistory.push(news);

                // Apply effects only if the news is recent (within last week)
                const hoursElapsed = (now - timestamp) / 3600000;
                if (hoursElapsed <= 168) { // Within last week
                    const hoursRemaining = event.duration - hoursElapsed;
                    if (hoursRemaining > 0) {
                        this.applyNewsEffects(news, hoursRemaining);
                    }
                }
            }

            // Sort all news by timestamp
            this.newsHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
    }

    // Scene_NewsHistory
    // Scene_NewsHistory - Updated with modal navigation support
    // --- HypernetNewsApp ---
    window.HypernetNewsApp = {
        appInstance: null,
        win: null,
        launch: function(params) {
            if (!window.HypernetWindowManager) return;
            
            if (!this.win || !document.getElementById('app-news-history')) {
                this.win = window.HypernetWindowManager.createWindow({
                    id: 'app-news-history',
                    title: T('NewsSystem.ui.appTitle'),
                    icon: 189,
                    width: 950,
                    height: 600,
                    contentHTML: '<div id="news-history-content"></div>'
                });

                this.appInstance = new Scene_NewsHistory();
                this.appInstance._isAppMode = true;
                this.appInstance.create();
                this.appInstance.start();
                
                this.win.addEventListener('hypernet-closed', () => {
                    if (this.appInstance) {
                        this.appInstance.terminate();
                        this.appInstance = null;
                    }
                    this.win = null;
                });
            } else {
                window.HypernetWindowManager.bringToFront(this.win);
            }
        },
        update: function() {
            if (this.appInstance && this.win) {
                if (this.win.classList.contains('active')) {
                    this.appInstance.update();
                }
            }
        }
    };

    class Scene_NewsHistory extends Scene_MenuBase {
        create() {
            super.create();
            this.createMonthHeaderWindow();
            this.createNewsWindow();
            this.createModalWindow();

            // Hide standard MZ canvas windows
            if (this._monthHeaderWindow) this._monthHeaderWindow.visible = false;
            if (this._newsWindow) this._newsWindow.visible = false;
            if (this._modalWindow) this._modalWindow.visible = false;

            this.createUINewspaperDOM();
        }

        createMonthHeaderWindow() {
            const rect = this.monthHeaderWindowRect();
            this._monthHeaderWindow = new Window_MonthHeader(rect);
            this.addWindow(this._monthHeaderWindow);
        }

        monthHeaderWindowRect() {
            const ww = Graphics.boxWidth;
            const wh = this.calcWindowHeight(1, false);
            const wx = 0;
            const wy = this.mainAreaTop();
            return new Rectangle(wx, wy, ww, wh);
        }

        createNewsWindow() {
            const rect = this.newsWindowRect();
            this._newsWindow = new Window_NewsDetailed(rect);
            this._newsWindow.setHandler("cancel", this.popScene.bind(this));
            this._newsWindow.setHandler("ok", this.showNewsModal.bind(this));
            this._newsWindow.setHandler("pageup", this.previousMonth.bind(this));
            this._newsWindow.setHandler("pagedown", this.nextMonth.bind(this));
            this._newsWindow.setMonthHeaderWindow(this._monthHeaderWindow);
            this.addWindow(this._newsWindow);
        }

        createModalWindow() {
            const rect = this.modalWindowRect();
            this._modalWindow = new Window_NewsModal(rect);
            this._modalWindow.setHandler("cancel", this.hideNewsModal.bind(this));
            this._modalWindow.setNewsWindow(this._newsWindow);
            this._modalWindow.hide();
            this.addWindow(this._modalWindow);
        }

        modalWindowRect() {
            const ww = Math.min(Graphics.boxWidth - 60, 800);
            const wh = Math.min(Graphics.boxHeight - 40, 700);
            const wx = (Graphics.boxWidth - ww) / 2;
            const wy = (Graphics.boxHeight - wh) / 2;
            return new Rectangle(wx, wy, ww, wh);
        }

        showNewsModal() {
            const newsItem = this._newsWindow.item();
            if (newsItem) {
                this._modalWindow.setNews(newsItem);
                this._modalWindow.show();
                this._modalWindow.activate();
                this._newsWindow.deactivate();
            }
        }

        hideNewsModal() {
            this._modalWindow.hide();
            this._modalWindow.deactivate();
            this._newsWindow.activate();
        }

        popScene() {
            if (this._isAppMode) {
                if (window.HypernetNewsApp && window.HypernetNewsApp.win) {
                    window.HypernetWindowManager.closeWindow(window.HypernetNewsApp.win);
                }
                return;
            }

            if ($gameTemp.newsReturnScene) {
                const returnScene = $gameTemp.newsReturnScene;
                $gameTemp.newsReturnScene = null;
                $gameTemp.newsFilterLocation = null;

                if (returnScene === 'realEstate') {
                    if (window.Scene_RealEstate) {
                        SceneManager.goto(window.Scene_RealEstate);
                    } else {
                        super.popScene();
                    }
                } else {
                    super.popScene();
                }
            } else {
                super.popScene();
            }
        }

        newsWindowRect() {
            const monthHeaderRect = this.monthHeaderWindowRect();
            const wx = 0;
            const wy = monthHeaderRect.y + monthHeaderRect.height;
            const ww = Graphics.boxWidth;
            const wh = Graphics.boxHeight - wy;
            return new Rectangle(wx, wy, ww, wh);
        }

        previousMonth() {
            this._newsWindow.changeMonth(-1);
        }

        nextMonth() {
            this._newsWindow.changeMonth(1);
        }

        start() {
            if (!this._isAppMode) super.start();
            ensureNewsManager();

            $newsManager.updateSoulTendencyVariable();

            if ($gameTemp.newsFilterLocation) {
                this._newsWindow.setLocationFilter($gameTemp.newsFilterLocation);
            }

            this._newsWindow.activate();
            this._newsWindow.select(0);

            this.refreshUINewspaperDOM();
        }

        terminate() {
            if (!this._isAppMode) super.terminate();
            if (this._dndContainer) {
                const container = this._dndContainer;
                container.style.transition = "opacity 0.2s ease-out";
                container.style.opacity = "0";
                container.style.pointerEvents = "none";
                setTimeout(() => {
                    if (container && container.parentNode) {
                        container.parentNode.removeChild(container);
                    }
                }, 200);
                this._dndContainer = null;
            }
        }

        createUINewspaperDOM() {
            this._dndContainer = document.createElement('div');
            // In app mode use a distinct id so the fullscreen 'menu-container' parchment
            // CSS does not leak into the OS app window. Everything else, the
            // backdrop included, is .news-root in theme.css.
            this._dndContainer.id = this._isAppMode ? 'news-app-container' : 'menu-container';
            this._dndContainer.classList.add('news-root');

            if (this._isAppMode) {
                const parent = document.getElementById('news-history-content');
                if (parent) {
                    parent.appendChild(this._dndContainer);
                    return;
                }
            }

            this._dndContainer.classList.add('news-root--fullscreen');
            document.body.appendChild(this._dndContainer);
        }

        refreshUINewspaperDOM() {
            if (!this._dndContainer) return;

            const monthNames = T.list('NewsSystem.months');

            let monthIndex = this._newsWindow ? this._newsWindow._currentMonth : 0;
            if (monthIndex === undefined || monthIndex === null || isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
                monthIndex = 0;
            }
            const year = this._newsWindow ? (this._newsWindow._currentYear || 2001) : 2001;
            const monthName = monthNames[monthIndex] || monthNames[0];

            const newsList = this._newsWindow._data || [];
            const selectedIndex = this._newsWindow.index();
            const selectedNews = newsList[selectedIndex] || null;
            const query = this._newsWindow._searchQuery || '';
            const searching = !!query;

            // In OS app mode the active RMMZ scene is Scene_HypernetOS (which has
            // none of these handlers), so inline onclicks must target the live news
            // app instance instead. In fullscreen mode SceneManager._scene IS the
            // news scene, so it is used directly.
            const sref = this._isAppMode ? 'window.HypernetNewsApp.appInstance' : 'SceneManager._scene';

            // Format today's date for the newspaper header banner
            const dateStr = $gameVariables.value(113) || '01 JAN 2001 08:00';
            const dateParts = dateStr.split(' ');
            const displayDate = dateParts.slice(0, 3).join(' ');

            let headlinesHTML = "";
            if (newsList.length === 0) {
                headlinesHTML = `
                    <div class="news-empty">
                        ${searching
                            ? T('NewsSystem.ui.noMatches', { query: escapeNewsHTML(query) })
                            : T('NewsSystem.ui.noChroniclesRegisteredIn')}
                    </div>
                `;
            } else {
                newsList.forEach((news, idx) => {
                    const isSelected = idx === selectedIndex;
                    const newsDate = new Date(news.timestamp);
                    const day = String(newsDate.getDate()).padStart(2, '0');
                    // Search results span the whole archive, so each line names
                    // its own month rather than the one the navigator is on.
                    const itemMonth = monthNames[newsDate.getMonth()] || monthName;
                    const timeStr = news.scheduledTime || newsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    // The category is a class, not a colour: .news-cat--* below
                    // sets --news-cat, which inks the label and the selected
                    // item's left rule from the theme's own palette.
                    let categoryKind = 'chronicle';
                    if (news.isRealNews) categoryKind = 'global';
                    else if (news.category === 'positive') categoryKind = 'bullish';
                    else if (news.category === 'negative') categoryKind = 'bearish';
                    else if (news.category === 'surreal') categoryKind = 'surreal';
                    const categoryLabel = T('NewsSystem.ui.' + categoryKind);

                    const selectedClass = isSelected ? 'selected' : '';

                    headlinesHTML += `
                        <div class="newspaper-headline-item news-cat--${categoryKind} focusable ${selectedClass}" data-focus-key="news-item-${idx}" onclick="${sref}.selectNewspaperItem(${idx})">
                            <div class="news-headline-meta">
                                <span>${day} ${itemMonth.substring(0, 3).toUpperCase()} • ${timeStr}</span>
                                <span class="news-headline-cat">${categoryLabel}</span>
                            </div>
                            <div class="news-headline-text">
                                ${news.text}
                            </div>
                            ${news.location ? `
                            <div class="news-headline-loc">
                                ,  ${news.location.toUpperCase()}
                            </div>
                            ` : ''}
                        </div>
                    `;
                });
            }

            let articleHTML = "";
            if (selectedNews) {
                const newsDate = new Date(selectedNews.timestamp);
                const fullDateText = newsDate.toLocaleDateString(T('NewsSystem.ui.enUs'), {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }).replace(/\b20\d{2}\b/g, '2001');

                let effectsBox = "";
                const hasEffects = selectedNews.priceEffect !== 1 || selectedNews.occupancyEffect !== 1 || selectedNews.soulTendencyModifier !== 0;
                if (hasEffects) {
                    const pricePct = ((selectedNews.priceEffect - 1) * 100).toFixed(0);
                    const occupancyPct = ((selectedNews.occupancyEffect - 1) * 100).toFixed(0);
                    const soulMod = selectedNews.soulTendencyModifier || 0;

                    effectsBox = `
                        <div class="news-effects">
                            <h4 class="news-effects-title">
                                ${T('NewsSystem.ui.marketSoulInfluence')}
                            </h4>
                            <div class="news-effects-list">
                                ${selectedNews.priceEffect !== 1 ? `<div><strong>${T('NewsSystem.ui.propertyValues')}</strong> ${pricePct >= 0 ? '+' : ''}${pricePct}%</div>` : ''}
                                ${selectedNews.occupancyEffect !== 1 ? `<div><strong>${T('NewsSystem.ui.occupancyRates')}</strong> ${occupancyPct >= 0 ? '+' : ''}${occupancyPct}%</div>` : ''}
                                ${soulMod !== 0 ? `<div><strong>${T('NewsSystem.ui.soulAlignment')}</strong> ${soulMod >= 0 ? '+' : ''}${soulMod.toFixed(1)}%</div>` : ''}
                            </div>
                        </div>
                    `;
                }

                const detailedText = selectedNews.fullText || selectedNews.text;

                articleHTML = `
                    <div class="news-article">
                        <div class="news-article-title">
                            ${selectedNews.text}
                        </div>

                        <div class="news-article-meta">
                            <span>${fullDateText.toUpperCase()}</span>
                            ${selectedNews.location ? `<span>${selectedNews.location.toUpperCase()}</span>` : ''}
                        </div>

                        <div class="news-article-body">
                            ${selectedNews.location ? `<span class="news-article-place">[${selectedNews.location.toUpperCase()}]</span>` : ''}
                            ${detailedText}
                        </div>

                        ${effectsBox}
                    </div>
                `;
            } else {
                articleHTML = `
                    <div class="news-empty">
                        ${T('NewsSystem.ui.selectAnEntryTo')}
                    </div>
                `;
            }

            // One markup for both modes. The parchment look lives on the
            // classes below (theme.css, "The Hypernet Chronicle"); the OS
            // window restyles the same classes to XP chrome in hypernet.css,
            // so nothing here has to know which shell it is standing in.
            this._dndContainer.innerHTML = `
                <div class="cc-pockets-spread news-spread">
                    <!-- Vintage masthead banner, hidden in the OS window -->
                    <div class="newspaper-header">
                        <div class="news-masthead-title">${T('NewsSystem.ui.mastheadTitle')}</div>
                        <div class="news-masthead-rule">
                            <span>${T('News.ui.volumeNo', { no: monthIndex + 1 })}</span>
                            <span class="news-masthead-strap">${T('News.ui.masthead')}</span>
                            <span>${displayDate}</span>
                        </div>
                    </div>

                    <div class="news-body">
                        <!-- Left page: the headlines column -->
                        <div class="cc-page cc-page-left news-page">
                            <div class="page-header-bar">
                                <div class="back-button focusable" onclick="${sref}.popScene()">
                                    ${T('NewsSystem.ui.dismiss')}
                                </div>
                                <h2 class="title cc-subheader news-subheader">
                                    ${T('NewsSystem.ui.latestChronicles')}
                                </h2>
                            </div>

                            <!-- The archive search. A query reaches every month,
                                 so the navigator gives way to a result count
                                 while one is running. -->
                            <div class="news-search-row kb-only">
                                <input type="text" id="newspaper-search" class="news-search-input focusable"
                                       placeholder="${T('NewsSystem.ui.searchPlaceholder')}"
                                       aria-label="${T('NewsSystem.ui.searchPlaceholder')}"
                                       value="${escapeNewsHTML(query)}">
                                <div class="newspaper-nav-btn news-search-clear focusable${searching ? '' : ' disabled'}"
                                     onclick="${sref}.clearNewspaperSearch()">${T('NewsSystem.ui.clearSearch')}</div>
                            </div>

                            <!-- Month navigator -->
                            <div class="news-month-nav">
                                ${searching ? `
                                <span class="news-month-label news-search-label">${T.n('NewsSystem.ui.searchResults', newsList.length, { count: newsList.length })}</span>
                                ` : `
                                <div class="newspaper-nav-btn focusable" onclick="${sref}.changeNewspaperMonth(-1)">${T('News.ui.prev')}</div>
                                <span class="news-month-label">${monthName.toUpperCase()} 2001</span>
                                <div class="newspaper-nav-btn focusable" onclick="${sref}.changeNewspaperMonth(1)">${T('News.ui.next')}</div>
                                `}
                            </div>

                            <!-- Scrollable headlines list -->
                            <div id="newspaper-headlines-list" class="news-headline-list">
                                ${headlinesHTML}
                            </div>
                        </div>

                        <!-- Right page: the article -->
                        <div class="cc-page cc-page-right news-page">
                            <div class="cc-subheader news-subheader">
                                ${T('NewsSystem.ui.chronicleInDepth')}
                            </div>

                            ${articleHTML}

                            <div class="news-footer">
                                <span>${T('NewsSystem.ui.aDMonthW')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            this.bindNewspaperSearch();

            setTimeout(() => {
                if (this._dndContainer) {
                    const listEl = this._dndContainer.querySelector('#newspaper-headlines-list');
                    if (listEl) {
                        const selectedEl = listEl.querySelector('.selected');
                        if (selectedEl) {
                            selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                    }
                }
            }, 50);
        }

        // Every keystroke repaints the whole spread, which throws the box away
        // and takes the caret with it. The box is rebuilt with the query already
        // in it, so all that is left is to put the reader back where they were.
        bindNewspaperSearch() {
            if (!this._dndContainer) return;
            const input = this._dndContainer.querySelector('#newspaper-search');
            if (!input) return;

            input.addEventListener('input', () => this.onNewspaperSearch(input.value));
            // The map, the scene and the desktop's focus ring all read the
            // keyboard: while the reader is typing a headline into the box,
            // none of them should hear it.
            ['keydown', 'keyup', 'keypress'].forEach(type =>
                input.addEventListener(type, (e) => e.stopPropagation()));

            if (this._searchFocused) {
                input.focus();
                const at = this._searchCaret == null ? input.value.length : this._searchCaret;
                try { input.setSelectionRange(at, at); } catch (e) { /* not a text input */ }
            }
        }

        onNewspaperSearch(value) {
            if (!this._newsWindow) return;
            const input = this._dndContainer && this._dndContainer.querySelector('#newspaper-search');
            this._searchFocused = true;
            this._searchCaret = input ? input.selectionStart : null;
            if (this._newsWindow.setSearchQuery(value)) this.refreshUINewspaperDOM();
        }

        clearNewspaperSearch() {
            if (!this._newsWindow) return;
            this._searchFocused = false;
            this._searchCaret = null;
            if (this._newsWindow.setSearchQuery('')) {
                SoundManager.playCancel();
                this.refreshUINewspaperDOM();
            }
        }

        selectNewspaperItem(index) {
            if (this._newsWindow) {
                this._searchFocused = false;
                this._newsWindow.select(index);
                SoundManager.playOk();
                this.refreshUINewspaperDOM();
            }
        }

        changeNewspaperMonth(direction) {
            if (this._newsWindow) {
                this._newsWindow.changeMonth(direction);
                SoundManager.playCursor();
                this.refreshUINewspaperDOM();
            }
        }

        update() {
            // In OS app mode the Scene_HypernetOS focus ring drives keyboard/
            // controller navigation (headlines, PREV/NEXT and Dismiss are all
            // .focusable), so the scene must stay out of the input loop to avoid
            // double-processing (e.g. month jumping two at a time).
            if (this._isAppMode) return;

            super.update();

            if (this._dndContainer) {
                let moved = false;

                if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    const currentIndex = this._newsWindow.index();
                    const maxItems = this._newsWindow.maxItems();
                    if (maxItems > 0) {
                        const nextIndex = currentIndex < maxItems - 1 ? currentIndex + 1 : 0;
                        this._newsWindow.select(nextIndex);
                        moved = true;
                    }
                } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                    const currentIndex = this._newsWindow.index();
                    const maxItems = this._newsWindow.maxItems();
                    if (maxItems > 0) {
                        const prevIndex = currentIndex > 0 ? currentIndex - 1 : maxItems - 1;
                        this._newsWindow.select(prevIndex);
                        moved = true;
                    }
                }

                if (Input.isTriggered('left')) {
                    this._newsWindow.changeMonth(-1);
                    moved = true;
                } else if (Input.isTriggered('right')) {
                    this._newsWindow.changeMonth(1);
                    moved = true;
                }

                if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
                    // Cancel takes the query off first and the screen down
                    // second, which is what the Clear button beside the field
                    // does and the only way to reach it without a mouse.
                    if (this._newsWindow._searchQuery) {
                        this.clearNewspaperSearch();
                    } else {
                        SoundManager.playCancel();
                        this.popScene();
                    }
                }

                if (moved) {
                    this.refreshUINewspaperDOM();
                }
            }
        }

    }
    // Window_MonthHeader
    class Window_MonthHeader extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            const gameDate = getGameDateFromVariable();
            this._currentMonth = gameDate.month;
            this._currentYear = gameDate.year;
            this.refresh();
        }

        setCurrentMonth(month, year) {
            this._currentMonth = month;
            this._currentYear = year;
            this.refresh();
        }

        getCurrentMonth() {
            return this._currentMonth;
        }

        getCurrentYear() {
            return this._currentYear;
        }

        refresh() {
            this.contents.clear();
            this.drawMonthHeader();
        }

        drawMonthHeader() {
            const monthNames = T.list('NewsSystem.months');

            const monthText = `${monthNames[this._currentMonth]} 2001`;
            const textWidth = this.textWidth(monthText);
            const x = (this.contentsWidth() - textWidth) / 2;
            const y = 0;

            this.changeTextColor(ColorManager.systemColor());
            this.drawText(monthText, x, y, textWidth, 'center');

            // Draw navigation arrows
            const arrowY = y;
            const leftArrowText = '◀';
            const rightArrowText = '▶';

            this.changeTextColor(ColorManager.normalColor());
            this.drawText(leftArrowText, 20, arrowY);
            this.drawText(rightArrowText, this.contentsWidth() - 40, arrowY);

            // Draw help text
            const helpText = T('NewsSystem.ui.aDOrChange');
            this.changeTextColor(ColorManager.dimColor1());
            const helpWidth = this.textWidth(helpText);
            this.drawText(helpText, (this.contentsWidth() - helpWidth) / 2, y + this.lineHeight());
        }
    }

    // Window_NewsDetailed
    // Window_NewsDetailed - Fixed version
    // Window_NewsDetailed - Fixed version
    class Window_NewsDetailed extends Window_Selectable {
        initialize(rect) {
            super.initialize(rect);
            this._data = [];
            const gameDate = getGameDateFromVariable();
            this._currentMonth = gameDate.month;
            this._currentYear = gameDate.year;
            this._monthHeaderWindow = null;
            // A search reads the whole archive rather than the month on show:
            // an empty query is what makes the month navigator the filter.
            this._searchQuery = '';
            this.refresh();
            this.select(0);
        }

        setMonthHeaderWindow(window) {
            this._monthHeaderWindow = window;
        }

        processHandling() {
            if (this.isOpenAndActive()) {
                // Handle month navigation first - don't process other inputs during these
                if (Input.isTriggered('left')) {
                    this.changeMonth(-1);
                    SoundManager.playCursor();
                    return;
                } else if (Input.isTriggered('right')) {
                    this.changeMonth(1);
                    SoundManager.playCursor();
                    return;
                }

                // Let the parent class handle standard navigation to avoid double processing
                super.processHandling();
            }
        }

        // Override cursorUp to ensure proper scrolling
        cursorUp(wrap) {
            const index = this.index();
            const maxItems = this.maxItems();

            if (maxItems > 0 && index > 0) {
                this.select(index - 1);
                this.ensureCursorVisible();
            } else if (wrap && maxItems > 0) {
                this.select(maxItems - 1);
                this.ensureCursorVisible();
            }
        }

        // Override cursorDown to ensure proper scrolling
        cursorDown(wrap) {
            const index = this.index();
            const maxItems = this.maxItems();

            if (maxItems > 0 && index < maxItems - 1) {
                this.select(index + 1);
                this.ensureCursorVisible();
            } else if (wrap && maxItems > 0) {
                this.select(0);
                this.ensureCursorVisible();
            }
        }

        ensureCursorVisible() {
            const index = this.index();
            const topRow = this.topRow();
            const maxTopRow = Math.max(0, this.maxRows() - this.maxPageRows());

            if (index < topRow) {
                // Cursor is above visible area
                this.setTopRow(index);
            } else if (index >= topRow + this.maxPageRows()) {
                // Cursor is below visible area
                this.setTopRow(Math.min(index - this.maxPageRows() + 1, maxTopRow));
            }
        }

        // W and S used to be read here by browser key code, out of
        // Input._currentState - a table RMMZ keys by input NAME ("ok", "down"),
        // never by "KeyW", so the branch never once fired. The letters reach
        // this list the way every other screen gets them: the key mapper turns
        // them into up and down before a window ever sees them.

        changeMonth(direction) {
            const newMonth = this._currentMonth + direction;
            const currentDate = getGameDateAsJSDate();
            const january = new Date(this._currentYear, 0, 1);

            if (newMonth < 0) {
                this._currentMonth = 11;
                this._currentYear--;
                // Don't go before January of current year
                if (this._currentYear < currentDate.getFullYear()) {
                    this._currentYear = currentDate.getFullYear();
                    this._currentMonth = 0;
                }
            } else if (newMonth > 11) {
                this._currentMonth = 0;
                this._currentYear++;
                // Don't go beyond current date
                if (this._currentYear > currentDate.getFullYear()) {
                    this._currentYear = currentDate.getFullYear();
                    this._currentMonth = currentDate.getMonth();
                }
            } else {
                this._currentMonth = newMonth;
                // Don't go beyond current month
                if (this._currentYear === currentDate.getFullYear() &&
                    this._currentMonth > currentDate.getMonth()) {
                    this._currentMonth = currentDate.getMonth();
                }
            }

            if (this._monthHeaderWindow) {
                this._monthHeaderWindow.setCurrentMonth(this._currentMonth, this._currentYear);
            }

            this.refresh();
            this.select(0);
        }

        maxItems() {
            return this._data ? this._data.length : 0;
        }

        setLocationFilter(location) {
            this._locationFilter = location;
            this.refresh();
            this.select(0);
        }

        setSearchQuery(query) {
            const next = String(query || '').trim();
            if (next === this._searchQuery) return false;
            this._searchQuery = next;
            this.refresh();
            this.select(0);
            return true;
        }

        isSearching() {
            return !!this._searchQuery;
        }

        // Every word has to appear somewhere in the entry, in any order and in
        // any of its fields: a reader looking for "athens eurozone" should not
        // have to remember which half the headline put first.
        matchesSearch(news) {
            if (!this._searchQuery) return true;
            const hay = [
                news.text, news.fullText, news.location,
                news.isRealNews ? T('NewsSystem.ui.global') : T('NewsSystem.ui.' + (
                    news.category === 'positive' ? 'bullish' :
                    news.category === 'negative' ? 'bearish' :
                    news.category === 'surreal' ? 'surreal' : 'chronicle'))
            ].filter(Boolean).join(' ').toLowerCase();
            return this._searchQuery.toLowerCase().split(/\s+/)
                .every(word => hay.includes(word));
        }

        item() {
            return this.maxItems() > 0 ? this._data[this.index()] : null;
        }

        makeItemList() {
            ensureNewsManager();
            const allNews = $newsManager ? $newsManager.newsHistory : [];

            // A search reaches across the whole archive; without one the month
            // navigator is the filter, as it always was.
            const inScope = this._searchQuery
                ? allNews.filter(news => this.matchesSearch(news))
                : allNews.filter(news => {
                    const newsDate = new Date(news.timestamp);
                    return newsDate.getMonth() === this._currentMonth &&
                        newsDate.getFullYear() === this._currentYear;
                });

            if (this._locationFilter) {
                this._data = inScope.filter(news => news.location === this._locationFilter);
            } else {
                this._data = inScope;
            }

            // Sort by timestamp (most recent first), but if same day, sort by time
            this._data.sort((a, b) => {
                const dateA = new Date(a.timestamp);
                const dateB = new Date(b.timestamp);

                // If same day, sort by actual time
                if (dateA.toDateString() === dateB.toDateString()) {
                    return dateB.getTime() - dateA.getTime(); // Later times first
                }

                // Otherwise sort by date
                return dateB - dateA;
            });
        }

        drawItem(index) {
            const news = this._data[index];
            if (news) {
                const rect = this.itemLineRect(index);
                const newsDate = new Date(news.timestamp);
                const timeDiff = getGameDateAsJSDate() - newsDate;
                const hoursAgo = Math.floor(timeDiff / 3600000);

                // Format time display
                let timeText;
                if (news.scheduledTime) {
                    // Show scheduled time for real news
                    timeText = news.scheduledTime;
                } else if (hoursAgo === 0) {
                    timeText = t('justNow');
                } else if (hoursAgo < 24) {
                    timeText = `${hoursAgo}${t('hoursAgo')}`;
                } else {
                    timeText = `${Math.floor(hoursAgo / 24)}${t('daysAgo')}`;
                }

                this.changeTextColor(ColorManager.systemColor());
                this.drawText(timeText, rect.x, rect.y, 100);

                if (news.isRealNews) {
                    this.changeTextColor(ColorManager.textColor(6));
                } else if (news.category === 'positive') {
                    this.changeTextColor(ColorManager.powerUpColor());
                } else if (news.category === 'negative') {
                    this.changeTextColor(ColorManager.deathColor());
                } else if (news.category === 'surreal') {
                    this.changeTextColor(ColorManager.textColor(23));
                } else {
                    this.resetTextColor();
                }

                // Only show headline, not full description
                let headlineText = news.text;
                const maxChars = 50; // Increased since we're not showing description
                if (headlineText.length > maxChars) {
                    headlineText = headlineText.substring(0, maxChars) + "...";
                }
                const headlineX = rect.x + 110;
                const headlineWidth = rect.width - 110;
                this.drawText(headlineText, headlineX, rect.y, headlineWidth);
            }
        }

        refresh() {
            this.makeItemList();
            super.refresh();
        }
    }
    // New Window_NewsModal class - add this to your plugin
    // Window_NewsModal - Fixed version with navigation and scrolling
    class Window_NewsModal extends Window_Selectable {
        initialize(rect) {
            super.initialize(rect);
            this._newsItem = null;
            this._newsWindow = null;
            this._textScrollY = 0;
            this._maxScrollY = 0;
            this.createContents();
        }

        setNews(newsItem) {
            this._newsItem = newsItem;
            this._textScrollY = 0;
            this._maxScrollY = 0;
            this.refresh();
        }

        setNewsWindow(newsWindow) {
            this._newsWindow = newsWindow;
        }

        refresh() {
            this.contents.clear();
            if (this._newsItem) {
                this.drawNewsContent();
            }
        }

        // Helper function to check if location was properly identified
        isLocationIdentified(location) {
            if (!location) return false;

            // If the location came from the news item's location key, always show it
            if (this._newsItem && this._newsItem.location === location) {
                return true;
            }

            // Check if location is one of the valid locations from our lists
            const allLocations = [
                ...window.NewsSystemUtils.LOCATIONS.en,
                ...window.NewsSystemUtils.LOCATIONS.it,
                ...window.NewsSystemUtils.getLocations()
            ];

            // Also check special locations from LocationMatcher
            const specialLocations = T.pool('NewsSystem.specialLocations');

            const validLocations = [...allLocations, ...specialLocations];
            return validLocations.includes(location);
        }

        drawNewsContent() {
            const newsItem = this._newsItem;
            const padding = 10;
            let y = padding - this._textScrollY;
            let totalContentHeight = padding;

            // Draw timestamp
            const newsDate = new Date(newsItem.timestamp);
            const dateString = newsDate.toLocaleDateString().replace(newsDate.getFullYear(), '2001');
            const dateText = dateString + ' ' + (newsItem.scheduledTime || newsDate.toLocaleTimeString());

            if (y >= -this.lineHeight() && y < this.contentsHeight()) {
                this.changeTextColor(ColorManager.textColor(3));
                this.drawText(dateText, padding, Math.max(0, y), this.contentsWidth() - padding * 2);
            }
            y += this.lineHeight() + 5;
            totalContentHeight += this.lineHeight() + 5;

            // Draw location only if properly identified
            if (this.isLocationIdentified(newsItem.location)) {
                if (y >= -this.lineHeight() && y < this.contentsHeight()) {
                    this.changeTextColor(ColorManager.textColor(1));
                    this.drawText(newsItem.location, padding, Math.max(0, y), this.contentsWidth() - padding * 2);
                }
                y += this.lineHeight() + 15;
                totalContentHeight += this.lineHeight() + 15;
            } else {
                // Skip location display and just add some spacing
                y += 10;
                totalContentHeight += 10;
            }

            // Draw news content
            if (newsItem.isRealNews) {
                this.changeTextColor(ColorManager.textColor(6));
            } else if (newsItem.category === 'positive') {
                this.changeTextColor(ColorManager.powerUpColor());
            } else if (newsItem.category === 'negative') {
                this.changeTextColor(ColorManager.deathColor());
            } else if (newsItem.category === 'surreal') {
                this.changeTextColor(ColorManager.textColor(23));
            } else {
                this.resetTextColor();
            }

            const contentText = newsItem.fullText || newsItem.text;
            const wrappedText = this.wordWrapText(contentText);
            const lines = wrappedText.split('\n');

            for (const line of lines) {
                if (y >= -this.lineHeight() && y < this.contentsHeight()) {
                    this.drawText(line, padding, Math.max(0, y), this.contentsWidth() - padding * 2);
                }
                y += this.lineHeight();
                totalContentHeight += this.lineHeight();
            }

            // Calculate max scroll
            this._maxScrollY = Math.max(0, totalContentHeight - this.contentsHeight() + padding);

            // Draw navigation hints at the bottom
            const hintY = this.contentsHeight() - this.lineHeight() - 5;
            this.changeTextColor(ColorManager.dimColor1());
            const hintText = T('NewsSystem.ui.otherNewsScrollText');
            const hintWidth = this.textWidth(hintText);
            const hintX = (this.contentsWidth() - hintWidth) / 2;

            // Draw background for hint text
            this.contents.fillRect(0, hintY - 2, this.contentsWidth(), this.lineHeight() + 4, ColorManager.dimColor2());
            this.drawText(hintText, hintX, hintY, hintWidth);
        }

        wordWrapText(text) {
            if (!text) return "";

            const maxLineWidth = this.contentsWidth() - 20; // Account for padding
            const words = text.split(' ');
            let currentLine = '';
            let result = '';

            for (const word of words) {
                const testLine = currentLine.length > 0 ? currentLine + ' ' + word : word;
                if (this.textWidth(testLine) > maxLineWidth && currentLine.length > 0) {
                    result += currentLine + '\n';
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            result += currentLine;
            return result;
        }

        processHandling() {
            if (this.isOpenAndActive()) {
                if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
                    this.processCancel();
                } else if (Input.isTriggered('up')) {
                    this.navigateNews(-1);
                    SoundManager.playCursor();
                } else if (Input.isTriggered('down')) {
                    this.navigateNews(1);
                    SoundManager.playCursor();
                }
            }
        }

        navigateNews(direction) {
            if (!this._newsWindow) return;

            const currentIndex = this._newsWindow.index();
            const maxItems = this._newsWindow.maxItems();

            if (maxItems === 0) return;

            let newIndex;
            if (direction > 0) {
                // Navigate to next news (right arrow)
                newIndex = currentIndex < maxItems - 1 ? currentIndex + 1 : 0;
            } else {
                // Navigate to previous news (left arrow)
                newIndex = currentIndex > 0 ? currentIndex - 1 : maxItems - 1;
            }

            // Update the news window selection
            this._newsWindow.select(newIndex);
            this._newsWindow.ensureCursorVisible();

            // Get the new news item and display it
            const newNewsItem = this._newsWindow.item();
            if (newNewsItem) {
                this.setNews(newNewsItem);
            }
        }

        scrollText(direction) {
            if (this._maxScrollY === 0) return;

            const scrollAmount = this.lineHeight();
            const oldScrollY = this._textScrollY;

            if (direction > 0) {
                // Scroll down
                this._textScrollY = Math.min(this._maxScrollY, this._textScrollY + scrollAmount);
            } else {
                // Scroll up
                this._textScrollY = Math.max(0, this._textScrollY - scrollAmount);
            }

            // Only refresh if scroll position actually changed
            if (this._textScrollY !== oldScrollY) {
                this.refresh();
            }
        }
    }


    // i18n-ignore-start: search aliases, matched against article text in
    // lower case. These are lookup keys, never shown to the player.
    window.NewsSystemUtils.LocationMatcher = {
        // Comprehensive location mapping with variations and translations
        locationVariations: {
            en: {
                // European locations
                'Paris, France': ['paris', 'france', 'french capital', 'city of light'],
                'Rome, Italy': ['rome', 'roma', 'italy', 'italia', 'eternal city', 'italian capital'],
                'Barcelona, Spain': ['barcelona', 'spain', 'catalunya', 'catalonia', 'spanish'],
                'Berlin, Germany': ['berlin', 'germany', 'deutschland', 'german capital'],
                'Amsterdam, Netherlands': ['amsterdam', 'netherlands', 'holland', 'dutch'],
                'Prague, Czech Republic': ['prague', 'praha', 'czech republic', 'czechia'],
                'Vienna, Austria': ['vienna', 'wien', 'austria', 'austrian'],
                'Lisbon, Portugal': ['lisbon', 'lisboa', 'portugal', 'portuguese'],
                'Athens, Greece': ['athens', 'athina', 'greece', 'greek', 'hellenic'],
                'Budapest, Hungary': ['budapest', 'hungary', 'hungarian'],
                'Copenhagen, Denmark': ['copenhagen', 'kobenhavn', 'denmark', 'danish'],
                'Stockholm, Sweden': ['stockholm', 'sweden', 'swedish'],
                'Dublin, Ireland': ['dublin', 'ireland', 'irish'],
                'Brussels, Belgium': ['brussels', 'bruxelles', 'belgium', 'belgian'],
                'Warsaw, Poland': ['warsaw', 'warszawa', 'poland', 'polish'],
                'Zurich, Switzerland': ['zurich', 'schweiz', 'switzerland', 'swiss'],
                'Edinburgh, Scotland': ['edinburgh', 'scotland', 'scottish'],
                'Oslo, Norway': ['oslo', 'norway', 'norwegian'],
                'Helsinki, Finland': ['helsinki', 'finland', 'finnish'],
                'Venice, Italy': ['venice', 'venezia', 'italy', 'italia'],
                'Nice, France': ['nice', 'france', 'french riviera', 'cote d\'azur'],
                'Munich, Germany': ['munich', 'munchen', 'germany', 'bavaria', 'bavarian'],
                'Santorini, Greece': ['santorini', 'greece', 'greek islands', 'cyclades'],
                'Dubrovnik, Croatia': ['dubrovnik', 'croatia', 'croatian', 'adriatic'],
                'Reykjavik, Iceland': ['reykjavik', 'iceland', 'icelandic'],
                'Malta': ['malta', 'maltese', 'valletta'],
                'Luxembourg': ['luxembourg', 'luxembourgish'],
                'Monaco': ['monaco', 'monte carlo', 'monegasque'],
                'Ljubljana, Slovenia': ['ljubljana', 'slovenia', 'slovenian'],
                'Tallinn, Estonia': ['tallinn', 'estonia', 'estonian'],

                // Special locations
                'Vatican City': ['vatican', 'vatican city', 'holy see', 'pope', 'papal', 'pontiff', 'bishop of rome', 'catholic church'],
                'New York, USA': ['new york', 'manhattan', 'nyc', 'united nations', 'un headquarters', 'onu', 'big apple'],

                // Major world powers (renamed)
                'Washington, USA': ['washington', 'usa', 'united states', 'america', 'american', 'white house', 'pentagon', 'capitol'],
                'Moscow, USSR': ['moscow', 'russia', 'russian', 'ussr', 'soviet union', 'kremlin', 'red square'],
                'London, Britannia': ['london', 'britain', 'british', 'britannia', 'england', 'uk', 'united kingdom', 'westminster', 'downing street'],

                // Asian powers
                'Beijing, China': ['beijing', 'china', 'chinese', 'shanghai', 'hong kong', 'tiananmen', 'forbidden city'],
                'Tokyo, Japan': ['tokyo', 'japan', 'japanese', 'osaka', 'kyoto', 'mount fuji', 'nippon'],

                // Middle East
                'Jerusalem, Israel': ['jerusalem', 'israel', 'israeli', 'tel aviv'],
                'Gaza, Palestine': ['haifa', 'gaza', 'west bank'],
                'Tehran, Persia': ['tehran', 'iran', 'iranian', 'persia', 'persian', 'isfahan', 'shiraz'],
                'Baghdad, Iraq': ['baghdad', 'iraq', 'iraqi', 'mesopotamia', 'basra', 'kurdistan'],
                'Damascus, Syria': ['damascus', 'syria', 'syrian', 'aleppo', 'levant'],
                'Riyadh, Saudi Arabia': ['riyadh', 'saudi arabia', 'saudi', 'mecca', 'medina', 'jeddah'],
                'Cairo, Egypt': ['cairo', 'egypt', 'egyptian', 'alexandria', 'nile', 'giza'],
                'Istanbul, Turkey': ['istanbul', 'turkey', 'turkish', 'ankara', 'constantinople', 'bosphorus'],
                'Beirut, Lebanon': ['beirut', 'lebanon', 'lebanese', 'tripoli', 'cedar'],
                'Amman, Jordan': ['amman', 'jordan', 'jordanian', 'petra', 'dead sea'],
                'Kuwait City, Kuwait': ['kuwait', 'kuwaiti', 'kuwait city'],
                'Doha, Qatar': ['doha', 'qatar', 'qatari'],
                'Abu Dhabi, UAE': ['abu dhabi', 'dubai', 'uae', 'emirates', 'emirati'],

                // Balkans (under USSR influence)
                // Additional Middle Eastern countries
                'Manama, Bahrain': ['manama', 'bahrain', 'bahraini'],
                'Muscat, Oman': ['muscat', 'oman', 'omani'],
                'Sanaa, Yemen': ['sanaa', 'yemen', 'yemeni', 'aden'],
                'Yerevan, Armenia': ['yerevan', 'armenia', 'armenian'],
                'Baku, Azerbaijan': ['baku', 'azerbaijan', 'azerbaijani'],
                'Tbilisi, Georgia': ['tbilisi', 'georgia', 'georgian'],
                'Nicosia, Cyprus': ['nicosia', 'cyprus', 'cypriot'],

                // Africa - North
                'Tripoli, Libya': ['tripoli', 'libya', 'libyan', 'benghazi'],
                'Algiers, Algeria': ['algiers', 'algeria', 'algerian'],
                'Tunis, Tunisia': ['tunis', 'tunisia', 'tunisian'],
                'Rabat, Morocco': ['rabat', 'morocco', 'moroccan', 'casablanca', 'marrakech'],
                'Khartoum, Sudan': ['khartoum', 'sudan', 'sudanese'],
                'Juba, South Sudan': ['juba', 'south sudan', 'south sudanese'],

                // Africa - West
                'Dakar, Senegal': ['dakar', 'senegal', 'senegalese'],
                'Bamako, Mali': ['bamako', 'mali', 'malian'],
                'Ouagadougou, Burkina Faso': ['ouagadougou', 'burkina faso', 'burkinabe'],
                'Niamey, Niger': ['niamey', 'niger', 'nigerien'],
                'Abuja, Nigeria': ['abuja', 'nigeria', 'nigerian', 'lagos'],
                'Accra, Ghana': ['accra', 'ghana', 'ghanaian'],
                'Lome, Togo': ['lome', 'togo', 'togolese'],
                'Porto-Novo, Benin': ['porto novo', 'benin', 'beninese'],
                'Abidjan, Ivory Coast': ['abidjan', 'ivory coast', 'cote d ivoire', 'ivorian'],
                'Monrovia, Liberia': ['monrovia', 'liberia', 'liberian'],
                'Freetown, Sierra Leone': ['freetown', 'sierra leone'],
                'Conakry, Guinea': ['conakry', 'guinea', 'guinean'],
                'Bissau, Guinea-Bissau': ['bissau', 'guinea bissau'],
                'Praia, Cape Verde': ['praia', 'cape verde', 'cabo verde'],
                'Banjul, Gambia': ['banjul', 'gambia', 'gambian'],

                // Africa - Central
                'Yaounde, Cameroon': ['yaounde', 'cameroon', 'cameroonian'],
                'Bangui, Central African Republic': ['bangui', 'central african republic', 'car'],
                'Ndjamena, Chad': ['ndjamena', 'chad', 'chadian'],
                'Kinshasa, Democratic Republic of Congo': ['kinshasa', 'democratic republic of congo', 'drc', 'congo kinshasa'],
                'Brazzaville, Republic of Congo': ['brazzaville', 'republic of congo', 'congo brazzaville'],
                'Libreville, Gabon': ['libreville', 'gabon', 'gabonese'],
                'Malabo, Equatorial Guinea': ['malabo', 'equatorial guinea'],
                'Sao Tome, Sao Tome and Principe': ['sao tome', 'sao tome and principe'],

                // Africa - East
                'Addis Ababa, Ethiopia': ['addis ababa', 'ethiopia', 'ethiopian'],
                'Asmara, Eritrea': ['asmara', 'eritrea', 'eritrean'],
                'Djibouti': ['djibouti', 'djiboutian'],
                'Mogadishu, Somalia': ['mogadishu', 'somalia', 'somali'],
                'Nairobi, Kenya': ['nairobi', 'kenya', 'kenyan', 'mombasa'],
                'Kampala, Uganda': ['kampala', 'uganda', 'ugandan'],
                'Kigali, Rwanda': ['kigali', 'rwanda', 'rwandan'],
                'Bujumbura, Burundi': ['bujumbura', 'burundi', 'burundian'],
                'Dodoma, Tanzania': ['dodoma', 'tanzania', 'tanzanian', 'dar es salaam'],
                'Antananarivo, Madagascar': ['antananarivo', 'madagascar', 'malagasy'],
                'Port Louis, Mauritius': ['port louis', 'mauritius', 'mauritian'],
                'Victoria, Seychelles': ['victoria', 'seychelles'],
                'Moroni, Comoros': ['moroni', 'comoros', 'comorian'],

                // Africa - Southern
                'Luanda, Angola': ['luanda', 'angola', 'angolan'],
                'Lusaka, Zambia': ['lusaka', 'zambia', 'zambian'],
                'Harare, Zimbabwe': ['harare', 'zimbabwe', 'zimbabwean'],
                'Gaborone, Botswana': ['gaborone', 'botswana', 'batswana'],
                'Windhoek, Namibia': ['windhoek', 'namibia', 'namibian'],
                'Cape Town, South Africa': ['cape town', 'south africa', 'south african', 'johannesburg', 'pretoria'],
                'Maseru, Lesotho': ['maseru', 'lesotho'],
                'Mbabane, Eswatini': ['mbabane', 'eswatini', 'swaziland'],
                'Maputo, Mozambique': ['maputo', 'mozambique', 'mozambican'],
                'Lilongwe, Malawi': ['lilongwe', 'malawi', 'malawian'],

                // North America
                'Ottawa, Canada': ['ottawa', 'canada', 'canadian', 'toronto', 'vancouver', 'montreal'],
                'Mexico City, Mexico': ['mexico city', 'mexico', 'mexican', 'guadalajara'],
                'Guatemala City, Guatemala': ['guatemala city', 'guatemala', 'guatemalan'],
                'Belize City, Belize': ['belize city', 'belize', 'belizean'],
                'Tegucigalpa, Honduras': ['tegucigalpa', 'honduras', 'honduran'],
                'San Salvador, El Salvador': ['san salvador', 'el salvador', 'salvadoran'],
                'Managua, Nicaragua': ['managua', 'nicaragua', 'nicaraguan'],
                'San Jose, Costa Rica': ['san jose', 'costa rica', 'costa rican'],
                'Panama City, Panama': ['panama city', 'panama', 'panamanian'],

                // Caribbean
                'Havana, Cuba': ['havana', 'cuba', 'cuban'],
                'Kingston, Jamaica': ['kingston', 'jamaica', 'jamaican'],
                'Port-au-Prince, Haiti': ['port au prince', 'haiti', 'haitian'],
                'Santo Domingo, Dominican Republic': ['santo domingo', 'dominican republic', 'dominican'],
                'San Juan, Puerto Rico': ['san juan', 'puerto rico', 'puerto rican'],
                'Bridgetown, Barbados': ['bridgetown', 'barbados', 'barbadian'],
                'Port of Spain, Trinidad and Tobago': ['port of spain', 'trinidad and tobago', 'trinidadian'],
                'St. George\'s, Grenada': ['st georges', 'grenada', 'grenadian'],
                'Castries, Saint Lucia': ['castries', 'saint lucia', 'st lucia'],
                'Kingstown, Saint Vincent and the Grenadines': ['kingstown', 'saint vincent', 'st vincent'],
                'St. John\'s, Antigua and Barbuda': ['st johns', 'antigua', 'barbuda'],
                'Roseau, Dominica': ['roseau', 'dominica'],
                'Basseterre, Saint Kitts and Nevis': ['basseterre', 'saint kitts', 'nevis'],
                'Nassau, Bahamas': ['nassau', 'bahamas', 'bahamian'],

                // South America
                'Brasilia, Brazil': ['brasilia', 'brazil', 'brazilian', 'rio de janeiro', 'sao paulo'],
                'Buenos Aires, Argentina': ['buenos aires', 'argentina', 'argentinian'],
                'Santiago, Chile': ['santiago', 'chile', 'chilean'],
                'Lima, Peru': ['lima', 'peru', 'peruvian', 'machu picchu'],
                'La Paz, Bolivia': ['la paz', 'bolivia', 'bolivian', 'sucre'],
                'Asuncion, Paraguay': ['asuncion', 'paraguay', 'paraguayan'],
                'Montevideo, Uruguay': ['montevideo', 'uruguay', 'uruguayan'],
                'Bogota, Colombia': ['bogota', 'colombia', 'colombian', 'medellin'],
                'Caracas, Venezuela': ['caracas', 'venezuela', 'venezuelan'],
                'Georgetown, Guyana': ['georgetown', 'guyana', 'guyanese'],
                'Paramaribo, Suriname': ['paramaribo', 'suriname', 'surinamese'],
                'Cayenne, French Guiana': ['cayenne', 'french guiana'],
                'Quito, Ecuador': ['quito', 'ecuador', 'ecuadorian', 'galapagos'],

                // Oceania
                'Canberra, Australia': ['canberra', 'australia', 'australian', 'sydney', 'melbourne'],
                'Wellington, New Zealand': ['wellington', 'new zealand', 'kiwi', 'auckland'],
                'Port Moresby, Papua New Guinea': ['port moresby', 'papua new guinea', 'png'],
                'Suva, Fiji': ['suva', 'fiji', 'fijian'],
                'Apia, Samoa': ['apia', 'samoa', 'samoan'],
                'Nuku\'alofa, Tonga': ['nukualofa', 'tonga', 'tongan'],
                'Port Vila, Vanuatu': ['port vila', 'vanuatu'],
                'Honiara, Solomon Islands': ['honiara', 'solomon islands'],
                'Tarawa, Kiribati': ['tarawa', 'kiribati'],
                'Funafuti, Tuvalu': ['funafuti', 'tuvalu'],
                'Yaren, Nauru': ['yaren', 'nauru'],
                'Ngerulmud, Palau': ['ngerulmud', 'palau'],
                'Majuro, Marshall Islands': ['majuro', 'marshall islands'],
                'Palikir, Micronesia': ['palikir', 'micronesia'],

                // Balkans (under USSR influence - existing)
                'Belgrade, USSR': ['belgrade', 'serbia', 'serbian', 'yugoslavia', 'yugoslav'],
                'Zagreb, USSR': ['zagreb', 'croatia', 'croatian'],
                'Sarajevo, USSR': ['sarajevo', 'bosnia', 'bosnian', 'herzegovina'],
                'Skopje, USSR': ['skopje', 'macedonia', 'macedonian', 'north macedonia'],
                'Pristina, USSR': ['pristina', 'kosovo', 'kosovar'],
                'Podgorica, USSR': ['podgorica', 'montenegro', 'montenegrin'],
                'Tirana, USSR': ['tirana', 'albania', 'albanian'],
                'Sofia, USSR': ['sofia', 'bulgaria', 'bulgarian'],
                'Bucharest, USSR': ['bucharest', 'romania', 'romanian']
            },
            it: {
                // European locations
                'Parigi, Francia': ['parigi', 'francia', 'francese', 'paris', 'france'],
                'Roma, Italia': ['roma', 'italia', 'italiano', 'rome', 'italy'],
                'Barcellona, Spagna': ['barcellona', 'spagna', 'spagnolo', 'barcelona', 'spain', 'catalogna'],
                'Berlino, Germania': ['berlino', 'germania', 'tedesco', 'berlin', 'germany'],
                'Amsterdam, Paesi Bassi': ['amsterdam', 'paesi bassi', 'olanda', 'olandese', 'netherlands'],
                'Praga, Repubblica Ceca': ['praga', 'repubblica ceca', 'ceco', 'prague', 'czech'],
                'Vienna, Austria': ['vienna', 'austria', 'austriaco', 'wien'],
                'Lisbona, Portogallo': ['lisbona', 'portogallo', 'portoghese', 'lisbon', 'portugal'],
                'Atene, Grecia': ['atene', 'grecia', 'greco', 'athens', 'greece'],
                'Budapest, Ungheria': ['budapest', 'ungheria', 'ungherese', 'hungary'],
                'Copenaghen, Danimarca': ['copenaghen', 'danimarca', 'danese', 'copenhagen', 'denmark'],
                'Stoccolma, Svezia': ['stoccolma', 'svezia', 'svedese', 'stockholm', 'sweden'],
                'Dublino, Irlanda': ['dublino', 'irlanda', 'irlandese', 'dublin', 'ireland'],
                'Bruxelles, Belgio': ['bruxelles', 'belgio', 'belga', 'brussels', 'belgium'],
                'Varsavia, Polonia': ['varsavia', 'polonia', 'polacco', 'warsaw', 'poland'],
                'Zurigo, Svizzera': ['zurigo', 'svizzera', 'svizzero', 'zurich', 'switzerland'],
                'Edimburgo, Scozia': ['edimburgo', 'scozia', 'scozzese', 'edinburgh', 'scotland'],
                'Oslo, Norvegia': ['oslo', 'norvegia', 'norvegese', 'norway'],
                'Helsinki, Finlandia': ['helsinki', 'finlandia', 'finlandese', 'finland'],
                'Venezia, Italia': ['venezia', 'italia', 'italiano', 'venice', 'italy'],
                'Nizza, Francia': ['nizza', 'francia', 'francese', 'nice', 'france', 'costa azzurra'],
                'Monaco, Germania': ['monaco di baviera', 'germania', 'tedesco', 'munich', 'baviera'],
                'Santorini, Grecia': ['santorini', 'grecia', 'greco', 'greece', 'cicladi'],
                'Dubrovnik, Croazia': ['dubrovnik', 'croazia', 'croato', 'croatia', 'adriatico'],
                'Reykjavik, Islanda': ['reykjavik', 'islanda', 'islandese', 'iceland'],
                'Malta': ['malta', 'maltese', 'valletta'],
                'Lussemburgo': ['lussemburgo', 'luxembourg'],
                'Monaco': ['monaco', 'monte carlo', 'monegasco'],
                'Lubiana, Slovenia': ['lubiana', 'slovenia', 'sloveno', 'ljubljana'],
                'Tallinn, Estonia': ['tallinn', 'estonia', 'estone', 'estonia'],

                // Special locations

                // Major world powers (renamed)

                // Asian powers

                // Middle East
                'Kuwait City, Kuwait': ['kuwait', 'kuwaitiano', 'città del kuwait'],
                'Abu Dhabi, Emirati': ['abu dhabi', 'dubai', 'emirati arabi uniti', 'emirati', 'emiratino'],

                // Balkans (under USSR influence)
                // Paesi europei aggiuntivi
                'Riga, Lettonia': ['riga', 'lettonia', 'lettone', 'latvia', 'latvian'],
                'Vilnius, Lituania': ['vilnius', 'lituania', 'lituano', 'lithuania', 'lithuanian'],
                'Minsk, Bielorussia': ['minsk', 'bielorussia', 'bielorusso', 'belarus', 'belarusian'],
                'Kiev, Ucraina': ['kiev', 'kyiv', 'ucraina', 'ucraino', 'odessa', 'ukraine', 'ukrainian'],
                'Chisinau, Moldavia': ['chisinau', 'moldavia', 'moldavo', 'moldova', 'moldovan'],
                'San Marino': ['san marino', 'sanmarinese', 'sammarinese'],
                'Andorra la Vella, Andorra': ['andorra', 'andorrano', 'andorran'],
                'Vaduz, Liechtenstein': ['vaduz', 'liechtenstein'],

                // Località speciali
                'Città del Vaticano': ['vaticano', 'città del vaticano', 'santa sede', 'papa', 'papale', 'pontefice', 'vescovo di roma', 'chiesa cattolica', 'vatican', 'holy see'],
                'New York, USA': ['new york', 'manhattan', 'nyc', 'nazioni unite', 'sede onu', 'onu', 'grande mela', 'united nations'],

                // Grandi potenze mondiali
                'Washington, USA': ['washington', 'usa', 'stati uniti', 'america', 'americano', 'casa bianca', 'pentagono', 'campidoglio', 'united states', 'white house'],
                'Mosca, URSS': ['mosca', 'russia', 'russo', 'urss', 'unione sovietica', 'cremlino', 'piazza rossa', 'moscow', 'kremlin'],
                'Londra, Britannia': ['londra', 'gran bretagna', 'britannico', 'britannia', 'inghilterra', 'regno unito', 'westminster', 'downing street', 'london', 'britain'],

                // Potenze asiatiche
                'Pechino, Cina': ['pechino', 'cina', 'cinese', 'shanghai', 'hong kong', 'tiananmen', 'città proibita', 'beijing', 'china'],
                'Tokyo, Giappone': ['tokyo', 'giappone', 'giapponese', 'osaka', 'kyoto', 'monte fuji', 'nippon', 'japan'],

                // Paesi asiatici aggiuntivi
                'Seoul, Corea del Sud': ['seoul', 'corea del sud', 'coreano', 'busan', 'jeju', 'south korea'],
                'Pyongyang, Corea del Nord': ['pyongyang', 'corea del nord', 'rpdc', 'regno eremita', 'north korea', 'dprk'],
                'Nuova Delhi, India': ['nuova delhi', 'delhi', 'india', 'indiano', 'mumbai', 'bangalore', 'kolkata', 'new delhi'],
                'Islamabad, Pakistan': ['islamabad', 'pakistan', 'pakistano', 'karachi', 'lahore'],
                'Dhaka, Bangladesh': ['dhaka', 'bangladesh', 'bengalese', 'bangladeshi'],
                'Colombo, Sri Lanka': ['colombo', 'sri lanka', 'cingalese', 'ceylon'],
                'Kathmandu, Nepal': ['kathmandu', 'nepal', 'nepalese', 'himalaya'],
                'Thimphu, Bhutan': ['thimphu', 'bhutan', 'bhutanese'],
                'Male, Maldive': ['male', 'maldive', 'maldiviano', 'maldives'],
                'Bangkok, Thailandia': ['bangkok', 'thailandia', 'thai', 'siam', 'thailand'],
                'Hanoi, Vietnam': ['hanoi', 'vietnam', 'vietnamita', 'ho chi minh', 'saigon'],
                'Vientiane, Laos': ['vientiane', 'laos', 'laotiano'],
                'Phnom Penh, Cambogia': ['phnom penh', 'cambogia', 'cambogiano', 'khmer', 'cambodia'],
                'Yangon, Myanmar': ['yangon', 'myanmar', 'birmania', 'birmano', 'burma'],
                'Kuala Lumpur, Malesia': ['kuala lumpur', 'malesia', 'malese', 'malaysia'],
                'Singapore': ['singapore', 'singaporiano', 'singaporean'],
                'Giacarta, Indonesia': ['giacarta', 'indonesia', 'indonesiano', 'giava', 'bali', 'jakarta'],
                'Manila, Filippine': ['manila', 'filippine', 'filippino', 'cebu', 'philippines'],
                'Brunei': ['bandar seri begawan', 'brunei'],
                'Dili, Timor Est': ['dili', 'timor est', 'timor leste', 'east timor'],
                'Ulaanbaatar, Mongolia': ['ulaanbaatar', 'mongolia', 'mongolo', 'mongolian'],

                // Paesi dell'Asia centrale
                'Astana, Kazakistan': ['astana', 'nur sultan', 'kazakistan', 'kazako', 'almaty', 'kazakhstan'],
                'Tashkent, Uzbekistan': ['tashkent', 'uzbekistan', 'uzbeko', 'samarcanda', 'samarkand'],
                'Bishkek, Kirghizistan': ['bishkek', 'kirghizistan', 'kirghiso', 'kyrgyzstan'],
                'Dushanbe, Tagikistan': ['dushanbe', 'tagikistan', 'tagiko', 'tajikistan'],
                'Ashgabat, Turkmenistan': ['ashgabat', 'turkmenistan', 'turkmeno'],
                'Kabul, Afghanistan': ['kabul', 'afghanistan', 'afghano', 'afghan'],

                // Medio Oriente
                'Gerusalemme, Israele': ['gerusalemme', 'israele', 'israeliano', 'tel aviv', 'jerusalem', 'israel'],
                'Gaza, Palestina': ['haifa', 'gaza', 'cisgiordania', 'palestine', 'west bank'],
                'Teheran, Persia': ['teheran', 'iran', 'iraniano', 'persia', 'persiano', 'isfahan', 'shiraz', 'tehran'],
                'Baghdad, Iraq': ['baghdad', 'iraq', 'iracheno', 'mesopotamia', 'bassora', 'kurdistan', 'basra'],
                'Damasco, Siria': ['damasco', 'siria', 'siriano', 'aleppo', 'levante', 'damascus', 'syria'],
                'Riyadh, Arabia Saudita': ['riyadh', 'arabia saudita', 'saudita', 'mecca', 'medina', 'gedda', 'saudi arabia'],
                'Il Cairo, Egitto': ['il cairo', 'egitto', 'egiziano', 'alessandria', 'nilo', 'giza', 'cairo', 'egypt'],
                'Istanbul, Turchia': ['istanbul', 'turchia', 'turco', 'ankara', 'costantinopoli', 'bosforo', 'turkey'],
                'Beirut, Libano': ['beirut', 'libano', 'libanese', 'tripoli', 'cedro', 'lebanon'],
                'Amman, Giordania': ['amman', 'giordania', 'giordano', 'petra', 'mar morto', 'jordan'],
                'Città del Kuwait, Kuwait': ['kuwait', 'kuwaitiano', 'città del kuwait', 'kuwait city'],
                'Doha, Qatar': ['doha', 'qatar', 'qatariano', 'qatari'],
                'Abu Dhabi, Emirati Arabi Uniti': ['abu dhabi', 'dubai', 'eau', 'emirati', 'emiratino', 'uae', 'emirates'],

                // Paesi mediorientali aggiuntivi
                'Manama, Bahrein': ['manama', 'bahrein', 'bahreinita', 'bahrain'],
                'Mascate, Oman': ['mascate', 'oman', 'omanita', 'muscat'],
                'Sanaa, Yemen': ['sanaa', 'yemen', 'yemenita', 'aden'],
                'Yerevan, Armenia': ['yerevan', 'armenia', 'armeno', 'armenian'],
                'Baku, Azerbaigian': ['baku', 'azerbaigian', 'azero', 'azerbaijan'],
                'Tbilisi, Georgia': ['tbilisi', 'georgia', 'georgiano', 'georgian'],
                'Nicosia, Cipro': ['nicosia', 'cipro', 'cipriota', 'cyprus'],

                // Africa - Nord
                'Tripoli, Libia': ['tripoli', 'libia', 'libico', 'bengasi', 'libya', 'benghazi'],
                'Algeri, Algeria': ['algeri', 'algeria', 'algerino', 'algiers'],
                'Tunisi, Tunisia': ['tunisi', 'tunisia', 'tunisino', 'tunis'],
                'Rabat, Marocco': ['rabat', 'marocco', 'marocchino', 'casablanca', 'marrakech', 'morocco'],
                'Khartoum, Sudan': ['khartoum', 'sudan', 'sudanese'],
                'Juba, Sud Sudan': ['juba', 'sud sudan', 'sud sudanese', 'south sudan'],

                // Africa - Ovest
                'Dakar, Senegal': ['dakar', 'senegal', 'senegalese'],
                'Bamako, Mali': ['bamako', 'mali', 'maliano', 'malian'],
                'Ouagadougou, Burkina Faso': ['ouagadougou', 'burkina faso', 'burkinabe'],
                'Niamey, Niger': ['niamey', 'niger', 'nigerino', 'nigerien'],
                'Abuja, Nigeria': ['abuja', 'nigeria', 'nigeriano', 'lagos', 'nigerian'],
                'Accra, Ghana': ['accra', 'ghana', 'ghanese', 'ghanaian'],
                'Lomé, Togo': ['lomé', 'togo', 'togolese'],
                'Porto-Novo, Benin': ['porto novo', 'benin', 'beninese'],
                'Abidjan, Costa d\'Avorio': ['abidjan', 'costa d avorio', 'ivoriano', 'ivory coast'],
                'Monrovia, Liberia': ['monrovia', 'liberia', 'liberiano', 'liberian'],
                'Freetown, Sierra Leone': ['freetown', 'sierra leone', 'sierraleonese'],
                'Conakry, Guinea': ['conakry', 'guinea', 'guineano', 'guinean'],
                'Bissau, Guinea-Bissau': ['bissau', 'guinea bissau'],
                'Praia, Capo Verde': ['praia', 'capo verde', 'cabo verde', 'capoverdiano'],
                'Banjul, Gambia': ['banjul', 'gambia', 'gambiano', 'gambian'],

                // Africa - Centro
                'Yaoundé, Camerun': ['yaoundé', 'camerun', 'camerunese', 'yaounde', 'cameroon'],
                'Bangui, Repubblica Centrafricana': ['bangui', 'repubblica centrafricana', 'rca', 'central african republic'],
                'N\'Djamena, Ciad': ['ndjamena', 'ciad', 'ciadiano', 'chad'],
                'Kinshasa, Repubblica Democratica del Congo': ['kinshasa', 'repubblica democratica del congo', 'rdc', 'congo kinshasa', 'democratic republic of congo'],
                'Brazzaville, Repubblica del Congo': ['brazzaville', 'repubblica del congo', 'congo brazzaville', 'republic of congo'],
                'Libreville, Gabon': ['libreville', 'gabon', 'gabonese'],
                'Malabo, Guinea Equatoriale': ['malabo', 'guinea equatoriale', 'equatorial guinea'],
                'São Tomé, São Tomé e Príncipe': ['são tomé', 'são tomé e príncipe', 'sao tome'],

                // Africa - Est
                'Addis Abeba, Etiopia': ['addis abeba', 'etiopia', 'etiope', 'addis ababa', 'ethiopia'],
                'Asmara, Eritrea': ['asmara', 'eritrea', 'eritreo', 'eritrean'],
                'Gibuti': ['gibuti', 'gibutiano', 'djibouti'],
                'Mogadiscio, Somalia': ['mogadiscio', 'somalia', 'somalo', 'mogadishu', 'somali'],
                'Nairobi, Kenya': ['nairobi', 'kenya', 'keniota', 'mombasa', 'kenyan'],
                'Kampala, Uganda': ['kampala', 'uganda', 'ugandese', 'ugandan'],
                'Kigali, Ruanda': ['kigali', 'ruanda', 'ruandese', 'rwanda', 'rwandan'],
                'Bujumbura, Burundi': ['bujumbura', 'burundi', 'burundese', 'burundian'],
                'Dodoma, Tanzania': ['dodoma', 'tanzania', 'tanzaniano', 'dar es salaam', 'tanzanian'],
                'Antananarivo, Madagascar': ['antananarivo', 'madagascar', 'malgascio', 'malagasy'],
                'Port Louis, Mauritius': ['port louis', 'mauritius', 'mauriziano', 'mauritian'],
                'Victoria, Seychelles': ['victoria', 'seychelles', 'seicellese'],
                'Moroni, Comore': ['moroni', 'comore', 'comoriano', 'comoros'],

                // Africa - Sud
                'Luanda, Angola': ['luanda', 'angola', 'angolano', 'angolan'],
                'Lusaka, Zambia': ['lusaka', 'zambia', 'zambiano', 'zambian'],
                'Harare, Zimbabwe': ['harare', 'zimbabwe', 'zimbabwese'],
                'Gaborone, Botswana': ['gaborone', 'botswana', 'botswaniano'],
                'Windhoek, Namibia': ['windhoek', 'namibia', 'namibiano', 'namibian'],
                'Città del Capo, Sudafrica': ['città del capo', 'sudafrica', 'sudafricano', 'johannesburg', 'pretoria', 'cape town', 'south africa'],
                'Maseru, Lesotho': ['maseru', 'lesotho'],
                'Mbabane, Eswatini': ['mbabane', 'eswatini', 'swaziland'],
                'Maputo, Mozambico': ['maputo', 'mozambico', 'mozambicano', 'mozambique'],
                'Lilongwe, Malawi': ['lilongwe', 'malawi', 'malawiano', 'malawian'],

                // Nord America
                'Ottawa, Canada': ['ottawa', 'canada', 'canadese', 'toronto', 'vancouver', 'montreal', 'canadian'],
                'Città del Messico, Messico': ['città del messico', 'messico', 'messicano', 'guadalajara', 'mexico city', 'mexican'],
                'Città del Guatemala, Guatemala': ['città del guatemala', 'guatemala', 'guatemalteco', 'guatemala city'],
                'Belize City, Belize': ['belize city', 'belize', 'beliziano', 'belizean'],
                'Tegucigalpa, Honduras': ['tegucigalpa', 'honduras', 'honduregno', 'honduran'],
                'San Salvador, El Salvador': ['san salvador', 'el salvador', 'salvadoregno', 'salvadoran'],
                'Managua, Nicaragua': ['managua', 'nicaragua', 'nicaraguense', 'nicaraguan'],
                'San José, Costa Rica': ['san josé', 'costa rica', 'costaricano', 'costa rican'],
                'Città di Panama, Panama': ['città di panama', 'panama', 'panamense', 'panama city', 'panamanian'],

                // Caraibi
                'L\'Avana, Cuba': ['l avana', 'cuba', 'cubano', 'havana', 'cuban'],
                'Kingston, Giamaica': ['kingston', 'giamaica', 'giamaicano', 'jamaica', 'jamaican'],
                'Port-au-Prince, Haiti': ['port au prince', 'haiti', 'haitiano', 'haitian'],
                'Santo Domingo, Repubblica Dominicana': ['santo domingo', 'repubblica dominicana', 'dominicano', 'dominican republic'],
                'San Juan, Puerto Rico': ['san juan', 'porto rico', 'portoricano', 'puerto rico'],
                'Bridgetown, Barbados': ['bridgetown', 'barbados', 'barbadiano', 'barbadian'],
                'Port of Spain, Trinidad e Tobago': ['port of spain', 'trinidad e tobago', 'trinidadiano', 'trinidad and tobago'],
                'St. George\'s, Grenada': ['st georges', 'grenada', 'grenadino', 'grenadian'],
                'Castries, Santa Lucia': ['castries', 'santa lucia', 'saint lucia'],
                'Kingstown, Saint Vincent e Grenadine': ['kingstown', 'saint vincent', 'st vincent', 'grenadine'],
                'St. John\'s, Antigua e Barbuda': ['st johns', 'antigua', 'barbuda'],
                'Roseau, Dominica': ['roseau', 'dominica'],
                'Basseterre, Saint Kitts e Nevis': ['basseterre', 'saint kitts', 'nevis'],
                'Nassau, Bahamas': ['nassau', 'bahamas', 'bahamiano', 'bahamian'],

                // Sud America
                'Brasília, Brasile': ['brasília', 'brasile', 'brasiliano', 'rio de janeiro', 'san paolo', 'brasilia', 'brazil'],
                'Buenos Aires, Argentina': ['buenos aires', 'argentina', 'argentino', 'argentinian'],
                'Santiago, Cile': ['santiago', 'cile', 'cileno', 'chile', 'chilean'],
                'Lima, Perù': ['lima', 'perù', 'peruviano', 'machu picchu', 'peru', 'peruvian'],
                'La Paz, Bolivia': ['la paz', 'bolivia', 'boliviano', 'sucre', 'bolivian'],
                'Asunción, Paraguay': ['asunción', 'paraguay', 'paraguayano', 'paraguayan'],
                'Montevideo, Uruguay': ['montevideo', 'uruguay', 'uruguayano', 'uruguayan'],
                'Bogotá, Colombia': ['bogotá', 'colombia', 'colombiano', 'medellín', 'bogota', 'medellin'],
                'Caracas, Venezuela': ['caracas', 'venezuela', 'venezuelano', 'venezuelan'],
                'Georgetown, Guyana': ['georgetown', 'guyana', 'guyanese'],
                'Paramaribo, Suriname': ['paramaribo', 'suriname', 'surinamese'],
                'Cayenne, Guyana Francese': ['cayenne', 'guyana francese', 'french guiana'],
                'Quito, Ecuador': ['quito', 'ecuador', 'ecuadoriano', 'galapagos', 'ecuadorian'],

                // Oceania
                'Canberra, Australia': ['canberra', 'australia', 'australiano', 'sydney', 'melbourne', 'australian'],
                'Wellington, Nuova Zelanda': ['wellington', 'nuova zelanda', 'neozelandese', 'auckland', 'new zealand', 'kiwi'],
                'Port Moresby, Papua Nuova Guinea': ['port moresby', 'papua nuova guinea', 'png', 'papua new guinea'],
                'Suva, Figi': ['suva', 'figi', 'figiano', 'fiji', 'fijian'],
                'Apia, Samoa': ['apia', 'samoa', 'samoano', 'samoan'],
                'Nuku\'alofa, Tonga': ['nukualofa', 'tonga', 'tongano', 'tongan'],
                'Port Vila, Vanuatu': ['port vila', 'vanuatu'],
                'Honiara, Isole Salomone': ['honiara', 'isole salomone', 'solomon islands'],
                'Tarawa, Kiribati': ['tarawa', 'kiribati'],
                'Funafuti, Tuvalu': ['funafuti', 'tuvalu'],
                'Yaren, Nauru': ['yaren', 'nauru'],
                'Ngerulmud, Palau': ['ngerulmud', 'palau'],
                'Majuro, Isole Marshall': ['majuro', 'isole marshall', 'marshall islands'],
                'Palikir, Micronesia': ['palikir', 'micronesia'],

                // Balcani (sotto influenza URSS)
                'Belgrado, URSS': ['belgrado', 'serbia', 'serbo', 'jugoslavia', 'jugoslavo', 'belgrade', 'yugoslav'],
                'Zagabria, URSS': ['zagabria', 'croazia', 'croato', 'zagreb', 'croatia'],
                'Sarajevo, URSS': ['sarajevo', 'bosnia', 'bosniaco', 'erzegovina', 'bosnian', 'herzegovina'],
                'Skopje, URSS': ['skopje', 'macedonia', 'macedone', 'macedonia del nord', 'north macedonia'],
                'Pristina, URSS': ['pristina', 'kosovo', 'kosovaro', 'kosovar'],
                'Podgorica, URSS': ['podgorica', 'montenegro', 'montenegrino', 'montenegrin'],
                'Tirana, URSS': ['tirana', 'albania', 'albanese', 'albanian'],
                'Sofia, URSS': ['sofia', 'bulgaria', 'bulgaro', 'bulgarian'],
                'Bucarest, URSS': ['bucarest', 'romania', 'rumeno', 'bucharest', 'romanian']

            }
        },

        // Special priority rules for specific types of news
        specialLocationRules: {
            priority: [
                // Pope-related news always goes to Vatican unless specifically mentioned elsewhere
                {
                    keywords: ['pope', 'papa', 'pontiff', 'pontefice', 'papal', 'papale', 'vatican', 'vaticano', 'holy see', 'santa sede', 'bishop of rome', 'vescovo di roma'],
                    defaultLocation: {
                        en: 'Vatican City',
                        it: 'Città del Vaticano'
                    },
                    checkForOverride: true
                },
                // UN/ONU related news goes to New York
                {
                    keywords: ['united nations', 'nazioni unite', 'un headquarters', 'sede onu', 'un general assembly', 'assemblea generale onu', 'security council', 'consiglio di sicurezza'],
                    defaultLocation: {
                        en: 'New York, USA',
                        it: 'New York, USA'
                    },
                    checkForOverride: false
                }
            ]
        },

        // Enhanced location detection with special rules
        detectLocationFromText: function (title, description) {
            const lang = T('NewsSystem.ui.en');
            const fullText = ((title || '') + ' ' + (description || '')).toLowerCase();

            // Remove common punctuation and normalize text
            const normalizedText = fullText.replace(/[.,!?;:"'()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();

            // Check special priority rules first
            for (const rule of this.specialLocationRules.priority) {
                const hasKeyword = rule.keywords.some(keyword =>
                    new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i').test(normalizedText)
                );

                if (hasKeyword) {
                    if (rule.checkForOverride) {
                        // For pope news, check if another location is mentioned
                        const otherLocation = this.findNonDefaultLocation(normalizedText, rule.defaultLocation[lang], lang);
                        if (otherLocation) {
                            return otherLocation;
                        }
                    }
                    return rule.defaultLocation[lang];
                }
            }

            // Normal location detection
            const variations = this.locationVariations[lang];
            let bestMatch = null;
            let bestScore = 0;

            // Check each location and its variations
            for (const [location, variants] of Object.entries(variations)) {
                let score = 0;

                for (const variant of variants) {
                    // Exact word match gets highest score
                    const regex = new RegExp(`\\b${variant.toLowerCase()}\\b`, 'i');
                    if (regex.test(normalizedText)) {
                        score += variant.length * 2; // Longer matches get more weight
                    }
                    // Partial match gets lower score
                    else if (normalizedText.includes(variant.toLowerCase())) {
                        score += variant.length;
                    }
                }

                // Prefer longer location names for ties
                if (score > bestScore || (score === bestScore && location.length > (bestMatch?.length || 0))) {
                    bestScore = score;
                    bestMatch = location;
                }
            }

            // Return match only if we have a reasonable confidence
            return bestScore >= 3 ? bestMatch : null;
        },

        // Helper function to find alternative locations when special rules apply
        findNonDefaultLocation: function (normalizedText, defaultLocation, lang) {
            const variations = this.locationVariations[lang];

            for (const [location, variants] of Object.entries(variations)) {
                if (location === defaultLocation) continue; // Skip the default location

                for (const variant of variants) {
                    const regex = new RegExp(`\\b${variant.toLowerCase()}\\b`, 'i');
                    if (regex.test(normalizedText)) {
                        return location;
                    }
                }
            }

            return null;
        },

        // Function to get random location as fallback
        getRandomLocation: function () {
            const locations = window.NewsSystemUtils.getLocations();
            return locations[Math.floor(Math.random() * locations.length)];
        },

        // Main function to determine location for news item
        // Main function to determine location for news item
        determineLocation: function (newsItem) {
            // 1. Check if location key is explicitly provided and not empty (highest priority)
            if (newsItem.location && newsItem.location.trim() !== '') {
                return newsItem.location.trim();
            }

            // 2. Check if city is explicitly provided and not empty
            if (newsItem.city && newsItem.city.trim() !== '') {
                return newsItem.city.trim();
            }

            // 3. Try to detect location from title and description
            const title = realNewsText(newsItem.title);
            const description = realNewsText(newsItem.desc);

            const detectedLocation = this.detectLocationFromText(title, description);
            if (detectedLocation) {
                console.log(`NewsSystem: Detected location "${detectedLocation}" from text: "${title}"`);
                return detectedLocation;
            }

            // 4. Fallback to random location
            console.log(`NewsSystem: No location detected for "${title}", using random location`);
            return this.getRandomLocation();
        }
    }

    // Global instance
    let $newsManager = null;

    // Export for other plugins
    window.$newsManager = null;
    window.NewsManager = NewsManager;

    // Ensure News Manager exists
    function ensureNewsManager() {
        if (!$newsManager) {
            $newsManager = new NewsManager();

            // Check if we have saved data first
            const savedData = $gameSystem.newsSystemData;
            if (savedData && savedData.newsHistory && savedData.newsHistory.length > 0) {
                // Load existing data
                $newsManager.load();
            } else {
                // Only initialize if no saved data exists
                $newsManager.initialize();
            }

            window.$newsManager = $newsManager;
        }
    }

    // Plugin commands
    PluginManager.registerCommand(pluginName, 'checkNewsHistory', args => {
        ensureNewsManager();
        SceneManager.push(Scene_NewsHistory);
    });

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'app-news-history',
            name: 'News',
            icon: 189,
            launchFn: function() {
                ensureNewsManager();
                if (window.HypernetNewsApp) {
                    window.HypernetNewsApp.launch();
                } else {
                    SceneManager.push(Scene_NewsHistory);
                }
            },
            desktopShortcut: true
        });
    }

    // Note: Scene_HypernetOS.update() already pumps window.HypernetNewsApp.update()
    // directly (see HypernetOS.js), so no monkeypatch is needed here. Adding one
    // would double-pump the News app's update loop every frame while the OS is open.

    PluginManager.registerCommand(pluginName, 'forceNewsEvent', args => {
        ensureNewsManager();
        $newsManager.generateNewsEvent();
        window.skipLocalization = true;
        $gameMessage.add(t('newsEventMsg'));
        window.skipLocalization = false;
    });

    // Save/Load
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        if ($newsManager) {
            $newsManager.save();
        }
        return contents;
    };
    // i18n-ignore-end

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        // Don't automatically create and load - wait for ensureNewsManager to be called.
        // Stop the old instance's hourly interval first so timers do not stack across loads.
        if ($newsManager && typeof $newsManager.stopHourlyUpdates === 'function') {
            $newsManager.stopHourlyUpdates();
        }
        $newsManager = null;
        window.$newsManager = null;
    };

    // Export Scene for other plugins
    window.Scene_NewsHistory = Scene_NewsHistory;
    window.Window_MonthHeader = Window_MonthHeader;
    window.Window_NewsModal = Window_NewsModal;
})();