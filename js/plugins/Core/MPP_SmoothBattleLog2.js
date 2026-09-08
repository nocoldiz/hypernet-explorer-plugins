//=============================================================================
// MPP_SmoothBattleLog2_VerticalScaleAnimation.js
//=============================================================================
// Copyright (c) 2018 Mokusei Penguin
// Modified to include color-coded names and vertical scale animation
// Released under the MIT license
// http://opensource.org/licenses/mit-license.php
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Change the display method and behavior of the battle log with name highlighting and vertical scale animation.
 * @author Mokusei Penguin (Modified)
 * @url
 *
 * @help [version 2.2]
 * This plugin is for RPG Maker MZ.
 * 
 * ▼ Overview
 *  - By making the battle log display method cumulative, sentences will not
 *    disappear immediately even if the log progresses quickly.
 *  - You can check the battle past log from the party command.
 *  - Character names are color-coded: All actors are blue and enemies are red.
 *  - Magic, ability, and item names appear in white.
 *  - Battle log has a vertical scale animation from the middle when appearing and disappearing.
 *  - Battle log starts hidden at the beginning of battle.
 * 
 * ▼ Log Type
 *  〇 all
 *   - The battle log window disappears after a certain amount of time has
 *     passed since the last log was displayed.
 *  〇 1-line
 *   - The logs are deleted in order from the log that has passed a certain
 *     period of time since it was displayed.
 *
 * @param Log Type
 * @desc 
 * @type select
 * @option all
 * @option 1-line
 * @default 1-line
 * 
 * @param Max Lines
 * @desc Maximum number of lines displayed in the battle log
 * @type number
 * @min 1
 * @default 10
 * 
 * @param Message Speed
 * @desc Battle log display speed, in frames held per line (higher = slower)
 * @type number
 * @default 14
 * 
 * @param View Duration
 * @desc Battle log display time
 * (0:Always displayed)
 * @type number
 * @default 150
 * 
 * @param Font Size
 * @desc The size of the characters in the battle log
 * @type number
 * @min 6
 * @default 18
 * 
 * @param Wait New Line?
 * @desc Whether or not there is a weight when a new log is added.
 * If it behaves strangely, enable it.
 * @type boolean
 * @default false
 * 
 * @param Start Messages On Log?
 * @desc Whether to display the battle start message in the log
 * @type boolean
 * @default false
 * 
 * @param Log Command
 * @desc Command name to display battle past log
 * (Hide when empty)
 * @default Battle Log
 * 
 * @param Animation Speed
 * @desc Speed of the vertical scale animation (higher = faster)
 * @type number
 * @min 1
 * @default 5
 *
 * @param Battle Log BG Opacity
 * @desc Opacity of the battle log background (0-100%)
 * @type number
 * @min 0
 * @max 100
 * @default 0
 *
 */

(() => {
    'use strict';
    
    // Plugin Parameters
    const pluginName = 'MPP_SmoothBattleLog2_FadeEnhancements';
    const params = PluginManager.parameters(pluginName);
    
    const CONFIG = {
        logType: params['Log Type'] || '1-line',
        maxLines: 4,
        messageSpeed: Number(params['Message Speed'] || 14),
        fontSize: Number(params['Font Size'] || 18),
        viewDuration: -1,
        waitNewLine: params['Wait New Line?'] === 'true',
        startMessagesOnLog: params['Start Messages On Log?'] === 'true',
        logCommand: params['Log Command'] || '',
        animationSpeed: Number(params['Animation Speed'] || 8),
        battleLogBgOpacity: Number(params['Battle Log BG Opacity'] ?? 0),
        colors: {
            actor: 1,   // Bright gold for actors
            actor2: 4,  // Bright gold for Actor 2
            actor3: 5,  // Bright gold for Actor 3
            enemy: 2,   // Red for enemies
            item: 0     // White for ability/magic/item names
        }
    };
    
    // Element ID (1-9) → color index in colorMap (10-18)
    const ELEMENT_COLORS = {
        1: 10,  // Physical
        2: 11,  // Fire
        3: 12,  // Ice
        4: 13,  // Thunder
        5: 14,  // Water
        6: 15,  // Petro
        7: 16,  // Wind
        8: 17,  // Sacred
        9: 18   // Cursed
    };

    // Helper Functions
    // Canvas element + scale are cached; recomputed on window resize or when the
    // internal Graphics size changes, instead of getElementById +
    // getBoundingClientRect every battle frame.
    let _msgCanvasEl = null;
    let _msgScaleCache = null;
    window.addEventListener('resize', () => { _msgScaleCache = null; });

    function _msgGetScale() {
        if (_msgScaleCache &&
            _msgScaleCache.gw === Graphics.width &&
            _msgScaleCache.gh === Graphics.height) {
            return _msgScaleCache;
        }
        if (!_msgCanvasEl || !_msgCanvasEl.isConnected) {
            _msgCanvasEl = document.getElementById('gameCanvas');
        }
        if (!_msgCanvasEl) return { sx: 1, sy: 1, ox: 0, oy: 0, gw: 0, gh: 0 };
        const r = _msgCanvasEl.getBoundingClientRect();
        _msgScaleCache = {
            sx: r.width / Graphics.width,
            sy: r.height / Graphics.height,
            ox: r.left,
            oy: r.top,
            gw: Graphics.width,
            gh: Graphics.height
        };
        return _msgScaleCache;
    }

    // Writes a style property only when its value changed, tracking last-applied
    // values on a per-element cache. `important` uses setProperty with priority.
    function _setStyleIfChanged(el, prop, value, important) {
        const cache = el._sblStyleCache || (el._sblStyleCache = {});
        if (cache[prop] === value) return;
        cache[prop] = value;
        if (important) {
            el.style.setProperty(prop, value, 'important');
        } else {
            el.style[prop] = value;
        }
    }

    const BATTLELOG_COLOR_MAP = {
        0: '#FFFFFF',
        1: '#FFD700',  // bright gold, party members
        2: '#EF4444',  // red, enemies
        3: '#0ea5e9',
        4: '#FFD700',  // gold, actor2
        5: '#FFD700',  // gold, actor3
        6: '#d97706',
        7: '#4b5563',
        10: '#AAAAAA',
        11: '#FF6622',
        12: '#88CCFF',
        13: '#FFE030',
        14: '#4499FF',
        15: '#AA8855',
        16: '#77DD55',
        17: '#FFEEAA',
        18: '#BB44CC',
        23: '#4ade80',
        24: '#ef4444',
        25: '#a855f7',
    };

    function parseColorCodes(text) {
        let html = '';
        let lastIndex = 0;
        // Support both numeric palette indices (\c[3]) and raw hex colors (\c[#6C5CE7])
        const regex = /\\c\[(#[0-9A-Fa-f]{3,8}|\d+)\]/gi;
        let match;
        let openSpan = false;
        while ((match = regex.exec(text)) !== null) {
            const seg = text.substring(lastIndex, match.index);
            if (seg) html += seg;
            if (openSpan) { html += '</span>'; openSpan = false; }
            const token = match[1];
            if (token === '0' || token === '#ffffff' || token === '#FFFFFF') {
                // Color reset: just close span
                openSpan = false;
            } else {
                const color = token.charAt(0) === '#'
                    ? token
                    : (BATTLELOG_COLOR_MAP[parseInt(token, 10)] || BATTLELOG_COLOR_MAP[0]);
                html += `<span style="color:${color};">`;
                openSpan = true;
            }
            lastIndex = regex.lastIndex;
        }
        const tail = text.substring(lastIndex);
        if (tail) html += tail;
        if (openSpan) html += '</span>';
        return html;
    }

    // Enemy front-facing walking sprite cache for battle log
    const EnemySpriteCache = new class {
        constructor() {
            this._cache = new Map(); // key -> dataURL
            this._loading = new Set();
        }

        getCharInfoFromNote(note) {
            if (!note) return null;
            const match = note.match(/<Char:\s*([^>]+)>/i);
            if (!match) return null;
            const raw = match[1].trim();
            const parts = raw.split(',').map(s => s.trim());
            const charName = parts[0];
            const charIndex = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
            return { charName, charIndex };
        }

        getCharInfo(enemy) {
            if (!enemy) return null;
            if (typeof enemy.enemy === 'function') {
                const data = enemy.enemy();
                if (data && data.note) return this.getCharInfoFromNote(data.note);
            }
            if (enemy.note) {
                return this.getCharInfoFromNote(enemy.note);
            }
            if (enemy._enemyId && typeof $dataEnemies !== 'undefined' && $dataEnemies && $dataEnemies[enemy._enemyId]) {
                return this.getCharInfoFromNote($dataEnemies[enemy._enemyId].note);
            }
            return null;
        }

        getSpriteHtml(rawCode) {
            if (!rawCode) return '';
            const parts = rawCode.split(',').map(s => s.trim());
            const charName = parts[0];
            const charIndex = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
            const cacheKey = charName + (charIndex > 0 ? '_' + charIndex : '');
            const dataUrl = this._cache.get(cacheKey);
            if (dataUrl) {
                return `<img class="battlelog-enemy-sprite" src="${dataUrl}" style="display:inline-block; vertical-align:middle; width:1.25em; height:1.25em; object-fit:contain; image-rendering:pixelated; margin-right:4px;" />`;
            }
            this.loadChar(charName, charIndex);
            return '';
        }

        loadChar(charName, charIndex = 0) {
            if (!charName) return;
            const cacheKey = charName + (charIndex > 0 ? '_' + charIndex : '');
            if (this._cache.has(cacheKey) || this._loading.has(cacheKey)) return;
            this._loading.add(cacheKey);

            const filename = charName.includes('/') ? charName : ('Monsters/' + charName);
            let bitmap = ImageManager.loadCharacter(filename);
            let isFallback = false;

            const onReady = () => {
                try {
                    const img = bitmap.image || bitmap._image || bitmap.canvas;
                    const bw = bitmap.width || (img ? img.width : 0);
                    const bh = bitmap.height || (img ? img.height : 0);
                    if (bw > 0 && bh > 0) {
                        const baseName = charName.includes('/') ? charName.split('/').pop() : charName;
                        const isSingle = baseName.startsWith('$');
                        const pw = isSingle ? bw / 3 : bw / 12;
                        const ph = isSingle ? bh / 4 : bh / 8;

                        const sx = isSingle ? pw : ((charIndex % 4) * 3 + 1) * pw;
                        const sy = isSingle ? 0 : (Math.floor(charIndex / 4) * 4) * ph;
                        const sw = pw;
                        const sh = ph;

                        const canvas = document.createElement('canvas');
                        canvas.width = 32;
                        canvas.height = 32;
                        const ctx = canvas.getContext('2d');
                        ctx.imageSmoothingEnabled = false;

                        const scale = Math.min(32 / sw, 32 / sh);
                        const dw = Math.round(sw * scale);
                        const dh = Math.round(sh * scale);
                        const dx = Math.round((32 - dw) / 2);
                        const dy = Math.round((32 - dh) / 2);

                        const source = (img && img.complete && img.naturalWidth) ? img : (bitmap.canvas || img);
                        if (source) {
                            ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
                            const dataUrl = canvas.toDataURL();
                            this._cache.set(cacheKey, dataUrl);
                        }
                    }
                } catch (e) {
                    console.warn('EnemySpriteCache: failed to render enemy sprite:', charName, e);
                } finally {
                    this._loading.delete(cacheKey);
                }
            };

            const onError = () => {
                if (!isFallback && !charName.includes('/')) {
                    isFallback = true;
                    bitmap = ImageManager.loadCharacter(charName);
                    if (bitmap.isReady()) {
                        onReady();
                    } else {
                        bitmap.addLoadListener(onReady);
                        if (bitmap.addErrorListener) {
                            bitmap.addErrorListener(() => {
                                this._loading.delete(cacheKey);
                            });
                        }
                    }
                } else {
                    this._loading.delete(cacheKey);
                }
            };

            if (bitmap.isError && bitmap.isError()) {
                onError();
            } else if (bitmap.isReady()) {
                onReady();
            } else {
                bitmap.addLoadListener(onReady);
                if (bitmap.addErrorListener) {
                    bitmap.addErrorListener(onError);
                }
            }
        }
    }();

    // Enemy icon / walk sprite is disabled in battle log
    function enemySpriteTag(enemy) {
        return '';
    }

    // One indent step, shared by every line an action produces after its header.
    const REACTION_INDENT_PX = 26;

    //--- entry retention: begin ---
    // The board scales visible entries based on the number of battle party members
    // so it never overlaps the Party HUD cards above.
    const MAX_VISIBLE_ENTRIES = 3;
    const ENTRY_EXIT_MS = 320;

    function getMaxVisibleEntries() {
        if (typeof ConfigManager !== 'undefined' && ConfigManager.partyHud === false) {
            return 3;
        }
        if (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.battleMembers) {
            const memberCount = $gameParty.battleMembers().length;
            if (memberCount >= 4) return 1;
            if (memberCount >= 3) return 2;
            return 3;
        }
        return 3;
    }

    function isExitingEntry(el) {
        return !rootOrNull(el) && !!(el && el.dataset && el.dataset.battlelogExiting === '1');
    }

    function rootOrNull(el) {
        return !el;
    }

    // The entries that still count as shown. One on its way out keeps its box in
    // the DOM until its animation ends, but it is no longer one of the active entries.
    function liveEntries(root) {
        if (!root || !root.children) return [];
        return Array.prototype.filter.call(root.children, el => !isExitingEntry(el));
    }

    function slideEntryOff(el) {
        if (!el || isExitingEntry(el)) return;
        if (el.dataset) el.dataset.battlelogExiting = '1';
        if (el.classList) el.classList.add('battlelog-entry-out');
        const drop = () => { if (el.parentNode) el.parentNode.removeChild(el); };
        if (el.addEventListener) el.addEventListener('animationend', drop, { once: true });
        // The animation never firing (a hidden overlay, a reduced-motion browser)
        // must not leave the entry standing, so the timer has the last word.
        setTimeout(drop, ENTRY_EXIT_MS + 120);
    }

    // Keeps the DOM and the line arrays in step: an entry that slides off is
    // dropped from _lines in the same breath, so index i means the same entry in
    // both. Returns how many entries left.
    function pruneEntries(log) {
        const root = log && log._htmlBattleLogRoot;
        if (!root) return 0;
        const live = liveEntries(root);
        const maxEntries = getMaxVisibleEntries();
        const excess = live.length - maxEntries;
        if (excess > 0) {
            for (let i = 0; i < excess; i++) slideEntryOff(live[i]);
            if (log._lines) log._lines.splice(0, excess);
            if (log._lineToast) log._lineToast.splice(0, excess);
            if (log._lineTurnBreak) log._lineTurnBreak.splice(0, excess);
            // The rule that used to separate this entry from the one above it has
            // nothing above it any more.
            const top = live[excess];
            if (top && top.style) {
                top.style.borderTop = '';
                top.style.paddingTop = '';
                top.style.marginTop = '';
            }
        }
        return Math.max(0, live.length - Math.max(0, excess));
    }
    //--- entry retention: end ---

    // \crit[...] wraps a whole damage line, and that line already carries its own
    // bracketed escapes (\c[1], \i[64]), so the closing bracket has to be found by
    // counting depth. Stopping at the first ] left the raw "\c[1" on screen.
    function replaceCritTags(text) {
        const TAG = '\\crit[';
        const lower = text.toLowerCase();
        let out = '';
        let i = 0;
        for (;;) {
            const start = lower.indexOf(TAG, i);
            if (start < 0) return out + text.substring(i);
            out += text.substring(i, start);
            let depth = 1;
            let j = start + TAG.length;
            while (j < text.length) {
                if (text[j] === '[') depth++;
                else if (text[j] === ']' && --depth === 0) break;
                j++;
            }
            out += '<span class="battlelog-crit-text">' + text.substring(start + TAG.length, j) + '</span>';
            i = Math.min(j + 1, text.length);
        }
    }

    function parseBattleLogTextToHtml(text) {
        if (!text) return '';
        // Split multi-line entries (action header + per-reaction lines) into separate divs
        const segments = text.split('\n');
        // One walk sprite per creature per entry: the header introduces the
        // enemy, the lines under it are already speaking in pronouns.
        const seenSprites = new Set();
        let result = '';
        for (let i = 0; i < segments.length; i++) {
            let seg = segments[i];
            if (!seg || !seg.trim()) continue;

            // The mx value is legacy: every line of an action shares one indent step.
            const hasMx = /\\mx\[\d+\]/i.test(seg);
            seg = seg.replace(/\\mx\[\d+\]/gi, '');
            const indentPx = (i > 0 || hasMx) ? REACTION_INDENT_PX : 0;

            // Determine accent style for the background bar
            const isCrit = /\\crit\[/i.test(seg);
            let accentClass = '';
            if (isCrit) {
                accentClass = 'accent-crit' + (indentPx > 0 ? ' accent-reaction' : '');
            } else if (indentPx > 0) {
                accentClass = 'accent-reaction';
            } else if (/\\i\[/i.test(seg)) {
                accentClass = 'accent-skill';
            } else if (/\\c\[(1|4|5)\]/i.test(seg)) {
                accentClass = 'accent-actor';
            } else if (/\\c\[2\]/i.test(seg)) {
                accentClass = 'accent-enemy';
            }

            seg = replaceCritTags(seg);

            // Remove any enemy sprite codes: \enemysprite[charName]
            seg = seg.replace(/\\enemysprite\[[^\]]*\]/gi, '');

            // Replace icon codes: \i[123] - rendered inline before skill/item name
            seg = seg.replace(/\\i\[(\d+)\]/gi, (match, iconId) => {
                const idx = Number(iconId) || 0;
                const col = idx % 16;
                const row = Math.floor(idx / 16);
                const S = 1.25;
                return `<span class="battlelog-icon" style="display:inline-block; vertical-align:middle; width:${S}em; height:${S}em;` +
                    ` background-image:url('img/system/IconSet.png'); background-repeat:no-repeat;` +
                    ` background-size:${S * 16}em auto;` +
                    ` background-position:-${(S * col).toFixed(2)}em -${(S * row).toFixed(2)}em; image-rendering:pixelated; margin-right:5px; margin-left:2px; flex-shrink:0;"></span>`;
            });

            seg = seg
                .replace(/\\v\[\d+\]/gi, '')
                .replace(/\\n\[\d+\]/gi, '')
                .replace(/\\n/g, '<br/>')
                .replace(/\n/g, '<br/>');

            const styleAttr = indentPx > 0 ? ` style="margin-left:${indentPx}px;"` : '';
            result += `<div class="battlelog-bar ${accentClass}"${styleAttr}><div class="battlelog-line">${parseColorCodes(seg)}</div></div>`;
        }
        return result;
    }

    // Read a state's <Hex: #RRGGBB> color from its note (used to tint status words)
    function getStateHexColor(state) {
        if (!state || !state.note) return null;
        const m = state.note.match(/<Hex:\s*(#[0-9A-Fa-f]{3,8})>/i);
        return m ? m[1] : null;
    }

    const __base = (obj, prop) => {
        if (obj.hasOwnProperty(prop)) {
            return obj[prop];
        } else {
            const proto = Object.getPrototypeOf(obj);
            return function() { return proto[prop].apply(this, arguments); };
        }
    };
    // Character creation writes a character's gender with Game_Actor.setGender
    // (ActorCharacterFields.js). The gender variables 38-40 it used to live in
    // are gone, so nothing here reads a game variable any more. Null means the
    // battler is not a party member, so it has no gender to read.
    function _actorGender(battler) {
        if (!battler || !battler.isActor || !battler.isActor()) return null;
        return typeof battler.gender === 'function' ? battler.gender() : 0;
      }
      function _getStarIndex(subject) {
        const gender = _actorGender(subject);
        return gender === null ? 0 : gender;
      }
      function _replaceStars(text, subject) {
        const idx = _getStarIndex(subject);
        const table = { 0: 'o', 1: 'a', 2: '*', 3: '*' };
        const ch = table[idx] || 'o';
        return text.replace(/\*/g, ch);
      }
      
      
    //--- pronouns: begin ---
    // An entry names a battler once. Every tabbed line under that header calls it
    // by pronoun instead of repeating the name, which is what makes a block of
    // six reaction lines readable at a glance.
    //
    // Genders are the ids character creation writes: 0 male, 1 female,
    // 2 non-binary, 3 cocoon. Anything that is not a party member is an it.
    const GENDER_PRONOUN_KEY = { 0: 'he', 1: 'she', 2: 'they', 3: 'they' };
    const ENEMY_PRONOUN_KEY = 'it';

    function pronounKeyFor(battler) {
        if (!battler) return null;
        const gender = _actorGender(battler);
        if (gender === null) return ENEMY_PRONOUN_KEY;
        return GENDER_PRONOUN_KEY[gender] || GENDER_PRONOUN_KEY[2];
    }

    // form is 'subject', 'object' or 'possessive'. An empty answer means the
    // language was never given these words, and the name is left standing.
    function pronounWord(key, form) {
        if (typeof T !== 'function' || !key) return '';
        const path = 'BattleLog.pronouns.' + key + '.' + form;
        if (typeof T.has === 'function' && !T.has(path)) return '';
        const word = T(path);
        return (word && word !== path) ? word : '';
    }

    function capitalizeFirst(text) {
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    }

    function escapeForRegExp(text) {
        return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Every name the log may print for a battler still in the fight, longest
    // first so a name containing a shorter one is matched whole. Rebuilt when the
    // roster changes, since it is asked for on every reaction line.
    let _pronounRoster = null;
    let _pronounRosterSize = -1;

    function clearPronounRoster() {
        _pronounRoster = null;
        _pronounRosterSize = -1;
    }

    function pronounRoster() {
        const party = (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.battleMembers)
            ? $gameParty.battleMembers() : [];
        const troop = (typeof $gameTroop !== 'undefined' && $gameTroop && $gameTroop.members)
            ? $gameTroop.members() : [];
        const size = party.length * 1000 + troop.length;
        if (_pronounRoster && _pronounRosterSize === size) return _pronounRoster;

        const entries = [];
        const add = (battler, name) => {
            if (!name || String(name).length <= 1) return;
            if (entries.some(e => e.name === name)) return;
            entries.push({ name: String(name), key: pronounKeyFor(battler) });
        };
        for (const battler of party.concat(troop)) {
            if (!battler) continue;
            const names = [];
            if (typeof battler.name === 'function') names.push(battler.name());
            if (typeof battler.originalName === 'function') names.push(battler.originalName());
            for (const raw of names) {
                add(battler, raw);
                if (typeof window.translateText === 'function') add(battler, window.translateText(raw));
            }
        }
        entries.sort((a, b) => b.name.length - a.name.length);
        _pronounRoster = entries;
        _pronounRosterSize = size;
        return entries;
    }

    // What the entry being written has already named, and how many distinct
    // battlers each pronoun would stand for inside it.
    function newEntryMentions() {
        return { seen: new Map(), byKey: new Map() };
    }

    // Remembers every roster name this line used, so the next line down knows
    // which ones it is allowed to shorten.
    function recordMentions(mentions, text) {
        if (!mentions || !text) return;
        for (const entry of pronounRoster()) {
            if (mentions.seen.has(entry.name)) continue;
            if (!new RegExp(NAME_EDGE_BEFORE + escapeForRegExp(entry.name) + NAME_EDGE_AFTER).test(text)) continue;
            mentions.seen.set(entry.name, entry.key);
            mentions.byKey.set(entry.key, (mentions.byKey.get(entry.key) || 0) + 1);
        }
    }

    // A name is a whole word or it is not that battler: an actor called Ash is
    // not named by the word "Ashes".
    const NAME_EDGE_BEFORE = '(?<![A-Za-z0-9])';
    const NAME_EDGE_AFTER = '(?![A-Za-z0-9])';

    // The whole printed token for a name: its walk sprite, its colour escape, the
    // name, the colour reset, and an English possessive if one follows. Nothing of
    // the old token may survive the swap, or the line keeps a stray tag.
    function mentionPattern(name) {
        return '(?:\\\\enemysprite\\[[^\\]]*\\])?' +
               '(?:\\\\c\\[[^\\]]*\\])?' +
               NAME_EDGE_BEFORE + escapeForRegExp(name) + NAME_EDGE_AFTER +
               '(?:\\\\c\\[0\\])?' +
               '(?:\'s|’s)?';
    }

    // Names are always repeated in full for all actors and enemies; pronoun replacement is disabled.
    function pronounizeLine(text, mentions) {
        return text;
    }
    //--- pronouns: end ---

    // Optimize: Precompute triangular numbers for common values
    const TRI_CACHE_SIZE = 50;
    const triCache = Array(TRI_CACHE_SIZE).fill(0).map((_, i) => i * (i + 1) / 2);
    const formulaTri = n => {
        return n < TRI_CACHE_SIZE ? triCache[n] : n * (n + 1) / 2;
    };

    //-------------------------------------------------------------------------
    // ConfigManager - Battle Log BG Opacity Setting
    //-------------------------------------------------------------------------

    Object.defineProperty(ConfigManager, 'battleLogBgOpacity', {
        get: function() {
            return this._battleLogBgOpacity !== undefined ? this._battleLogBgOpacity : CONFIG.battleLogBgOpacity;
        },
        set: function(value) {
            this._battleLogBgOpacity = value;
        },
        configurable: true
    });

    Object.defineProperty(ConfigManager, 'battleLogSkillNames', {
        get: function() {
            return this._battleLogSkillNames !== undefined ? this._battleLogSkillNames : 0; // 0 = Skill Name, 1 = Skill Action
        },
        set: function(value) {
            this._battleLogSkillNames = value;
        },
        configurable: true
    });

    // 0 = Centered (top center of the screen, default), 1 = Classic (under the party HUD)
    Object.defineProperty(ConfigManager, 'battleLogPosition', {
        get: function() {
            return this._battleLogPosition !== undefined ? this._battleLogPosition : 0;
        },
        set: function(value) {
            this._battleLogPosition = value;
        },
        configurable: true
    });

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.battleLogBgOpacity = this.battleLogBgOpacity;
        config.battleLogSkillNames = this.battleLogSkillNames;
        config.battleLogPosition = this.battleLogPosition;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.battleLogBgOpacity = config.battleLogBgOpacity !== undefined ? config.battleLogBgOpacity : CONFIG.battleLogBgOpacity;
        this.battleLogSkillNames = config.battleLogSkillNames !== undefined ? config.battleLogSkillNames : 0;
        this.battleLogPosition = config.battleLogPosition !== undefined ? config.battleLogPosition : 0;
    };

    //-------------------------------------------------------------------------
    // Window_Options - Add Battle Log Options
    //-------------------------------------------------------------------------

    function _battleLogPositionText(value) {
        return value === 1
            ? (T('BattleLog.positionClassic') || 'Classic')
            : (T('BattleLog.positionCentered') || 'Centered');
    }

    if (window.GameOptions) {
        window.GameOptions.registerOption('battleLogBgOpacity', T('BattleLog.bgOpacity'), 
            () => ConfigManager.battleLogBgOpacity,
            (value) => ConfigManager.battleLogBgOpacity = value,
            'gameplay', 'custom',
            function(value) { return value + "%"; },
            function() { 
                const last = ConfigManager.battleLogBgOpacity;
                const value = Math.min(last + 10, 100);
                ConfigManager.battleLogBgOpacity = value;
                ConfigManager.save();
            },
            function() { 
                const last = ConfigManager.battleLogBgOpacity;
                const value = Math.max(last - 10, 0);
                ConfigManager.battleLogBgOpacity = value;
                ConfigManager.save();
            }
        );

        window.GameOptions.registerOption('battleLogSkillNames', T('BattleLog.skillNamesOption') || 'Skill Names',
            () => ConfigManager.battleLogSkillNames,
            (value) => ConfigManager.battleLogSkillNames = value,
            'gameplay', 'custom',
            function(value) { 
                return value === 1 ? (T('BattleLog.skillAction') || 'Skill Action') : (T('BattleLog.skillName') || 'Skill Name'); 
            },
            function() { 
                ConfigManager.battleLogSkillNames = ConfigManager.battleLogSkillNames === 1 ? 0 : 1;
                ConfigManager.save();
            },
            function() { 
                ConfigManager.battleLogSkillNames = ConfigManager.battleLogSkillNames === 1 ? 0 : 1;
                ConfigManager.save();
            }
        );

        window.GameOptions.registerOption('battleLogPosition', T('BattleLog.positionOption') || 'Battle Log Position',
            () => ConfigManager.battleLogPosition,
            (value) => ConfigManager.battleLogPosition = value,
            'gameplay', 'custom',
            function(value) { return _battleLogPositionText(value); },
            function() {
                ConfigManager.battleLogPosition = ConfigManager.battleLogPosition === 1 ? 0 : 1;
                ConfigManager.save();
            },
            function() {
                ConfigManager.battleLogPosition = ConfigManager.battleLogPosition === 1 ? 0 : 1;
                ConfigManager.save();
            }
        );
    } else {
        const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
        Window_Options.prototype.addGeneralOptions = function() {
            _Window_Options_addGeneralOptions.call(this);
            this.addCommand(T('BattleLog.bgOpacity'), "battleLogBgOpacity");
            this.addCommand(T('BattleLog.skillNamesOption') || "Skill Names", "battleLogSkillNames");
            this.addCommand(T('BattleLog.positionOption') || "Battle Log Position", "battleLogPosition");
        };

        const _Window_Options_statusText = Window_Options.prototype.statusText;
        Window_Options.prototype.statusText = function(index) {
            const symbol = this.commandSymbol(index);
            if (symbol === "battleLogBgOpacity") {
                return this.getConfigValue(symbol) + "%";
            }
            if (symbol === "battleLogSkillNames") {
                const val = this.getConfigValue(symbol);
                return val === 1 ? (T('BattleLog.skillAction') || 'Skill Action') : (T('BattleLog.skillName') || 'Skill Name');
            }
            if (symbol === "battleLogPosition") {
                return _battleLogPositionText(this.getConfigValue(symbol));
            }
            return _Window_Options_statusText.call(this, index);
        };

        const _Window_Options_processOk = Window_Options.prototype.processOk;
        Window_Options.prototype.processOk = function() {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === "battleLogBgOpacity") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, (value + 10) % 110);
                return;
            }
            if (symbol === "battleLogSkillNames") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, value === 1 ? 0 : 1);
                return;
            }
            if (symbol === "battleLogPosition") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, value === 1 ? 0 : 1);
                return;
            }
            _Window_Options_processOk.call(this);
        };

        const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
        Window_Options.prototype.cursorRight = function() {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === "battleLogBgOpacity") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, Math.min(value + 10, 100));
                return;
            }
            if (symbol === "battleLogSkillNames") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, value === 1 ? 0 : 1);
                return;
            }
            if (symbol === "battleLogPosition") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, value === 1 ? 0 : 1);
                return;
            }
            _Window_Options_cursorRight.call(this);
        };

        const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
        Window_Options.prototype.cursorLeft = function() {
            const index = this.index();
            const symbol = this.commandSymbol(index);
            if (symbol === "battleLogBgOpacity") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, Math.max(value - 10, 0));
                return;
            }
            if (symbol === "battleLogSkillNames") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, value === 1 ? 0 : 1);
                return;
            }
            if (symbol === "battleLogPosition") {
                const value = this.getConfigValue(symbol);
                this.changeValue(symbol, value === 1 ? 0 : 1);
                return;
            }
            _Window_Options_cursorLeft.call(this);
        };
    }

    //-------------------------------------------------------------------------
    // Game_Temp - Battle Log History Storage
    //-------------------------------------------------------------------------
    
    const _Game_Temp_initialize = Game_Temp.prototype.initialize;
    Game_Temp.prototype.initialize = function() {
        _Game_Temp_initialize.apply(this, arguments);
        this._battleLog = [];
    };

    Game_Temp.prototype.clearBattleLog = function() {
        this._battleLog = [];
    };

    Game_Temp.prototype.battleLog = function() {
        return this._battleLog;
    };

    Game_Temp.prototype.addBattleLog = function(text) {
        this._battleLog.push(text);
        if (this._battleLog.length > 100) this._battleLog.shift();
    };

    //-------------------------------------------------------------------------
    // Name Cache Systems - Optimize color-coding
    //-------------------------------------------------------------------------
    
    const SKILL_CATEGORY_COLORS = {
        Basic: '#66bbdd',
        MartialArts: '#fb923c',      // Warm orange
        Swordsmanship: '#38bdf8',    // Steel blue
        Bestial: '#d97706',          // Beast amber
        StatusMagic: '#c084fc',      // Lavender purple
        Pyromancy: '#f87171',        // Fire red
        Cryomancy: '#67e8f9',        // Ice cyan
        Electromancy: '#facc15',     // Lightning yellow
        Illusion: '#e879f9',         // Magenta
        Aeromancy: '#34d399',        // Wind emerald
        MetaMagic: '#a855f7',        // Arcane violet
        Geomancy: '#ca8a04',         // Earth ochre
        ChaosMagic: '#f43f5e',       // Crimson
        Idromancy: '#0ea5e9',        // Water blue
        HolyMagic: '#fef08a',        // Sacred gold
        AstralMagic: '#818cf8',      // Star indigo
        VoidMagic: '#8b5cf6',        // Deep purple
        Necromancy: '#a855f7',       // Cursed violet
        ForbiddenMagic: '#e11d48',   // Blood rose
        Convokation: '#fb7185',      // Summon coral
        Arcanism: '#6366f1',         // Arcane blue
        Pastoral: '#4ade80',         // Nature green
        PsychicAbilities: '#d946ef', // Psi pink
        Alchemistry: '#f59e0b',      // Amber
        Firearms: '#94a3b8',         // Gunmetal
        Hunting: '#16a34a',          // Forest green
        Cooking: '#fb923c',          // Warm orange
        Performance: '#f43f5e',      // Rose
        Leadership: '#eab308',       // Gold
        Tactical: '#3b82f6',         // Tactical blue
        Roguery: '#a78bfa',          // Stealth violet
        Augury: '#22d3ee',           // Mystical cyan
        Chronomancy: '#fcd34d',      // Time amber
        Dominion: '#9333ea',         // Royal purple
        Economy: '#eab308',          // Gold
        Healing: '#34d399',          // Soft healing green
        Mutation: '#a3e635',         // Toxic lime
        Oneiromancy: '#818cf8',      // Dream indigo
        Technomagical: '#06b6d4',    // Neon cyan
        Vocation: '#d97706'          // Bronze
    };

    function getSkillOrItemColor(item) {
        if (!item) return CONFIG.colors.item;
        // Check for category tag: <category:Name> in skill.note
        if (item.note) {
            const match = item.note.match(/<category:\s*([^>]+)>/i);
            if (match) {
                const cat = match[1].trim();
                if (SKILL_CATEGORY_COLORS[cat]) {
                    return SKILL_CATEGORY_COLORS[cat];
                }
            }
        }
        // Fall back to element color if defined
        const elementId = item.damage && item.damage.elementId;
        if (elementId !== undefined && ELEMENT_COLORS[elementId] !== undefined) {
            return ELEMENT_COLORS[elementId];
        }
        return CONFIG.colors.item;
    }

    // Cache for colored names - avoids repeated string replacements
    const NameColorCache = new class {
        constructor() {
            this.initialize();
        }
        
        initialize() {
            this._actorCache = new Map();
            this._enemyCache = new Map();
            this._abilityCache = new Map();
            this._initialized = false;
        }
        
        buildCache() {
            if (this._initialized) return;
            
            // Cache actor names
            if (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.battleMembers) {
                const actors = $gameParty.battleMembers();
                actors.forEach(actor => {
                    if (!actor || !actor.name()) return;
                    
                    const name = actor.name();
                    if (actor.actorId() === 2) {
                        this._actorCache.set(name, `\\c[${CONFIG.colors.actor2}]${name}\\c[0]`);
                    } else if (actor.actorId() === 3) {
                        this._actorCache.set(name, `\\c[${CONFIG.colors.actor3}]${name}\\c[0]`);
                    } else {
                        this._actorCache.set(name, `\\c[${CONFIG.colors.actor}]${name}\\c[0]`);
                    }
                });
            }
            
            // Cache troop enemy names
            if (typeof $gameTroop !== 'undefined' && $gameTroop && $gameTroop.members) {
                $gameTroop.members().forEach(enemy => {
                    if (!enemy) return;
                    const name = enemy.name ? enemy.name() : (enemy.name || '');
                    if (name) {
                        const translatedName = typeof window.translateText === 'function' ? window.translateText(name) : name;
                        this._enemyCache.set(name, `\\c[${CONFIG.colors.enemy}]${translatedName}\\c[0]`);
                    }
                });
            }
            
            // Cache skill and item names (color codes only, no icons for general replacement)
            const skills = (typeof $dataSkills !== 'undefined' && $dataSkills) ? $dataSkills.filter(skill => skill && skill.name) : [];
            const items = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems.filter(item => item && item.name) : [];
            
            [...skills, ...items].forEach(item => {
                if (!item || !item.name || item.name.length <= 1) return;
                const name = item.name;
                const color = getSkillOrItemColor(item);
                this._abilityCache.set(name, `\\c[${color}]${name}\\c[0]`);
            });
            
            this._initialized = true;
        }
        
        // Get the colored version of a name, or null if not found
        getColoredName(name) {
            if (this._actorCache.has(name)) return this._actorCache.get(name);
            if (this._enemyCache.has(name)) return this._enemyCache.get(name);
            if (this._abilityCache.has(name)) return this._abilityCache.get(name);
            return null;
        }
        
        // Get colored name for a specific entity
        getActorName(actor) {
            if (!actor) return '';
            const name = actor.name();
            const translatedName = typeof window.translateText === 'function' ? window.translateText(name) : name;
            
            let color = CONFIG.colors.actor;
            if (actor.actorId() === 2) color = CONFIG.colors.actor2;
            if (actor.actorId() === 3) color = CONFIG.colors.actor3;

            return `\\c[${color}]${translatedName}\\c[0]`;
        }
        
        getEnemyName(enemy) {
            if (!enemy) return '';
            const name = enemy.name ? enemy.name() : (enemy.name || '');
            const translatedName = typeof window.translateText === 'function' ? window.translateText(name) : name;
            return `\\c[${CONFIG.colors.enemy}]${translatedName}\\c[0]`;
        }
        
        getItemName(item) {
            if (!item) return '';
            const name = item.name;
            const translatedName = typeof window.translateText === 'function' ? window.translateText(name) : name;
            const color = getSkillOrItemColor(item);
            return `\\c[${color}]${translatedName}\\c[0]`;
        }
        
        refresh() {
            this.initialize();
            clearPronounRoster();
        }
    }();

    //-------------------------------------------------------------------------
    // BattleManager - Handle Start Messages
    //-------------------------------------------------------------------------
    const _Game_Enemy_setup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
    _Game_Enemy_setup.call(this, enemyId, x, y);
    // 0 = male (o), 1 = female (a)
    //this._gender = this._gender !== undefined ? this._gender : (Math.random() < 0.5 ? 0 : 1);
    };
    const _BattleManager_displayStartMessages = BattleManager.displayStartMessages;
    BattleManager.displayStartMessages = function() {
        if (!CONFIG.startMessagesOnLog) {
            _BattleManager_displayStartMessages.apply(this, arguments);
        }
    };

    BattleManager.displayStartMessagesOnLog = function() {
        // Initialize the name cache
        NameColorCache.buildCache();
        
        // Display enemy emergence with colored names
        for (const name of $gameTroop.enemyNames()) {
            const coloredName = NameColorCache.getColoredName(name) || 
                `\\c[${CONFIG.colors.enemy}]${name}\\c[0]`;
            this._logWindow.push('addText', TextManager.emerge.format(coloredName));
        }
        
        // Display initiative message if applicable
        const message = this.initiativeMessage();
        if (message) {
            this._logWindow.push('wait');
            this._logWindow.push('addText', message);
        }
    };

    BattleManager.initiativeMessage = function() {
        if (this._preemptive) {
            return TextManager.preemptive.format($gameParty.name());
        } else if (this._surprise) {
            return TextManager.surprise.format($gameParty.name());
        }
        return null;
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        _BattleManager_endBattle.apply(this, arguments);
        this._logWindow.clearSmoothBattleLog();
        // Clear name cache when battle ends
        NameColorCache.refresh();
    };

    //-------------------------------------------------------------------------
    // Window_Base - Process Escape Characters
    //-------------------------------------------------------------------------
    
    const _Window_Base_processEscapeCharacter = Window_Base.prototype.processEscapeCharacter;
    Window_Base.prototype.processEscapeCharacter = function(code, textState) {
        if (code === 'MX') {
            textState.x += this.obtainEscapeParam(textState);
        } else if (code === 'CHAR') {
            // Handle character image escape code
            const filename = this.obtainEscapeParam(textState);
            if (filename) {
                try {
                    const charImage = ImageManager.loadBitmap('img/characters/Monsters/', filename);
                    this.contents.blt(
                        charImage,
                        0, 0,                    // src x,y
                        48, 48,                  // src w,h (48x48 crop)
                        textState.x, textState.y, // dest x,y
                        48, 48                   // dest w,h
                    );
                    textState.x = 48;       // move text position
                } catch (error) {
                    console.warn('Character escape image not found:', filename);
                    // Use fallback image
                    try {
                        const fallbackImage = ImageManager.loadBitmap('img/busts/', '7');
                        this.contents.blt(
                            fallbackImage,
                            0, 0,
                            fallbackImage.width,
                            fallbackImage.height,
                            textState.x, textState.y,
                            36, 36
                        );
                        textState.x = 48;
                    } catch (fallbackError) {
                        console.warn('Fallback escape image also not found');
                    }
                }
            }
        } else {
            _Window_Base_processEscapeCharacter.apply(this, arguments);
        }
    };
    
    const _Window_Base_resetFontSettings = __base(Window_Base.prototype, 'resetFontSettings');
    Window_Base.prototype.resetFontSettings = function() {
        _Window_Base_resetFontSettings.apply(this, arguments);
        this.contents.fontSize = CONFIG.fontSize;
    };

    //-------------------------------------------------------------------------
    // Sprite_BattleLog - Individual Log Line Sprite
    //-------------------------------------------------------------------------
    
    function Sprite_BattleLog() {
        this.initialize(...arguments);
    }

    Sprite_BattleLog.prototype = Object.create(Sprite.prototype);
    Sprite_BattleLog.prototype.constructor = Sprite_BattleLog;

    Sprite_BattleLog.prototype.initialize = function(width, height) {
        Sprite.prototype.initialize.call(this);
        this.bitmap = new Bitmap(width, height);
        this._scrollXDuration = 0;
        this._viewDuration = -1;
    };

    // Optimize: Combined update logic for better performance
    Sprite_BattleLog.prototype.update = function(y, max) {
        Sprite.prototype.update.call(this);
        
        // Update durations
        if (this._scrollXDuration > 0) this._scrollXDuration--;
        if (this._viewDuration > 0) this._viewDuration--;
        
        // Calculate positions once
        const height = this.bitmap.height;
        const clampedY = y.clamp(0, max * height);
        
        // Update position
        this.x = this._scrollXDuration > 0 ? formulaTri(this._scrollXDuration) / 2 : 0;
        this.y = clampedY;
        
        // Update frame
        const fy = Math.max(-y, 0);
        this.setFrame(0, fy, this.bitmap.width, height - fy);
        
        // Update opacity - simplified calculation
        this.opacity = 255 - (this._scrollXDuration * 20);
    };

    Sprite_BattleLog.prototype.isPassed = function() {
        return this._viewDuration === 0;
    };

    Sprite_BattleLog.prototype.popup = function(scrollXDuration = 12) {
        this._scrollXDuration = scrollXDuration;
        if (CONFIG.logType === '1-line') {
            this._viewDuration = CONFIG.viewDuration || -1;
        }
    };

    //-------------------------------------------------------------------------
    // Window_BattleLog - Main Battle Log Window
    //-------------------------------------------------------------------------
    

    const _Window_BattleLog_initialize = Window_BattleLog.prototype.initialize;
    Window_BattleLog.prototype.initialize = function(rect) {
        // Full-width panel anchored to the left edge of the screen.
        const customHeight = this.fittingHeight(this.maxLines());
        const customX = 4;
        const customWidth = Math.max(520, Graphics.boxWidth - customX - 20);

        // Vertical offset compensation for game centering
        const yOffset = Math.floor((Graphics.height - Graphics.boxHeight) / 2);
        const pad = this.padding || 12;

        // The battle hotbar (BattleSystemEnhancedHUD.js) sits under the log; room for it
        // is reserved here so the two never overlap.
        const hotbarReserve = (window.BattleHotbar && window.BattleHotbar.reservedHeight) || 70;

        // Position above the hotbar at the bottom of the screen
        const customY = Graphics.height - customHeight - hotbarReserve - yOffset;

        const customRect = new Rectangle(customX, customY, customWidth, customHeight);
    
        _Window_BattleLog_initialize.call(this, customRect);

        this.frameVisible = false; // This line hides the window border.

        this._lines = [];
        this._lineToast = [];
        this._lineTurnBreak = [];
        this._pendingTurnBreak = false;

        this._clearDuration = 0;
        this._logScrollYDuration = 0;
        this._logScrollY = this.lineHeight();
        this.opacity = 0; // Completely transparent canvas window
        this.backOpacity = 0; // No background on canvas
        
        this._animationState = 'visible';
        this._originalHeight = customHeight;
        this._originalY = this.y;
        this.height = customHeight;
        this.visible = false;
    
        this.createLogSprites();
        this.drawBackground();
        
        NameColorCache.buildCache();

        // Remove stale overlay if present
        const old = document.getElementById('html-battlelog-overlay');
        if (old) old.remove();

        // Create the new HTML Battle Log overlay root
        const root = document.createElement('div');
        root.id = 'html-battlelog-overlay';
        root.style.cssText = 
            'position:fixed;display:none;z-index:400;pointer-events:none;' +
            'box-sizing:border-box;overflow:visible;' +
            'flex-direction:column;justify-content:flex-start;align-items:flex-start;' +
            'background:transparent;' +
            'border:none;' +
            'outline:none;' +
            'scroll-behavior:smooth;';
        this._htmlBattleLogRoot = root;
        document.body.appendChild(root);

        // Hide original sprites
        if (this._logSprites) {
            for (const sprite of this._logSprites) {
                sprite.visible = false;
            }
        }
    };

    // Main methods
    Window_BattleLog.prototype.maxLines = function() {
        return 50;
    };

    Window_BattleLog.prototype.messageSpeed = function() {
        return CONFIG.messageSpeed;
    };
    
    Window_BattleLog.prototype.createLogSprites = function() {
        this._logSprites = [];
        const width = this.itemWidth();
        const height = this.itemHeight();
        for (let i = 0; i <= 6; i++) {
            const sprite = new Sprite_BattleLog(width, height);
            this._logSprites[i] = sprite;
            this.addInnerChild(sprite);
        }
    };

    // Color coding utilities
    Window_BattleLog.prototype.colorCharacterNames = function(text) {
        if (!text) return text;

        let modifiedText = text;

        // Use live party members so names set after cache init (e.g. character creation) are caught
        if (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.battleMembers) {
            for (const actor of $gameParty.battleMembers()) {
                if (!actor || !actor.name() || actor.name().length <= 1) continue;
                const name = actor.name();
                let color = CONFIG.colors.actor;
                if (actor.actorId() === 2) color = CONFIG.colors.actor2;
                else if (actor.actorId() === 3) color = CONFIG.colors.actor3;
                try {
                    modifiedText = modifiedText.replace(
                        new RegExp(`\\b${name}\\b`, 'g'),
                        `\\c[${color}]${name}\\c[0]`
                    );
                } catch(e) {}
            }
        }

        return modifiedText;
    };

    // Text and layout handling
    Window_BattleLog.prototype.indentText = function(text) {
        return text;
    };
    
    Window_BattleLog.prototype.drawBackground = function() {
    };

    Window_BattleLog.prototype.backRect = function() {
        return new Rectangle(0, 0, this.innerWidth, this.innerHeight);
    };

    const _Window_BattleLog_lineRect = Window_BattleLog.prototype.lineRect;
    Window_BattleLog.prototype.lineRect = function(index) {
        const rect = _Window_BattleLog_lineRect.apply(this, arguments);
        rect.y = 0;
        return rect;
    };

    Window_BattleLog.prototype.drawLineText = function(index) {
    };

    const _Window_BattleLog_resetFontSettings = Window_BattleLog.prototype.resetFontSettings;
    Window_BattleLog.prototype.resetFontSettings = function() {
        _Window_BattleLog_resetFontSettings.apply(this, arguments);
        this.contents.outlineColor = 'rgba(0, 0, 0, 1)';
        this.contents.outlineWidth = 2;
    };

    Window_BattleLog.prototype.totalVisualLines = function() {
        if (!this._lines) return 0;
        let count = 0;
        for (const l of this._lines) {
            if (l) count += l.split('\n').length;
        }
        return count;
    };

    Window_BattleLog.prototype.scrollToBottom = function(smooth = true) {
        if (!this._htmlBattleLogRoot) return;
        const root = this._htmlBattleLogRoot;
        requestAnimationFrame(() => {
            if (!root) return;
            const targetScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
            if (smooth && typeof root.scrollTo === 'function') {
                root.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
            } else {
                root.scrollTop = targetScrollTop;
            }
        });
    };

    // Core functionality for log line management
    Window_BattleLog.prototype.addText = function(text, isToast) {
        if (typeof translateText === 'function') {
            text = translateText(text);
        }
        const coloredText = this.colorCharacterNames(text);
        const indentText = this.indentText(coloredText);

        if (!this._lines) this._lines = [];
        if (!this._lineToast) this._lineToast = [];
        if (!this._lineTurnBreak) this._lineTurnBreak = [];

        this._lines.push(indentText);
        this._lineToast.push(!!isToast);
        const isTurnBreak = !!this._pendingTurnBreak;
        this._lineTurnBreak.push(isTurnBreak);
        this._pendingTurnBreak = false;

        $gameTemp.addBattleLog(indentText);

        if (this._htmlBattleLogRoot) {
            const sc = _msgGetScale();
            const baseFontSize = CONFIG.fontSize || 18;
            const scaledFont = Math.round(baseFontSize * sc.sy * 0.9);

            const el = document.createElement('div');
            el.className = 'battlelog-line-container';
            el.style.position = 'relative';
            el.style.width = '100%';
            el.style.boxSizing = 'border-box';
            el.style.lineHeight = '1.35';
            el.style.fontWeight = 'bold';
            el.style.fontSize = scaledFont + 'px';
            el.innerHTML = parseBattleLogTextToHtml(indentText);

            if (isTurnBreak && liveEntries(this._htmlBattleLogRoot).length > 0) {
                el.style.borderTop = '1px solid rgba(255,255,255,0.22)';
                el.style.paddingTop = Math.round(4 * sc.sy) + 'px';
                el.style.marginTop = Math.round(8 * sc.sy) + 'px';
            }

            this._htmlBattleLogRoot.appendChild(el);

            // Only the action that just happened and the two before it stay.
            pruneEntries(this);

            this.scrollToBottom();
        }

        this.visible = true;
        this.openness = 255;
        this.wait();
        this._clearDuration = 0;
    };

    Window_BattleLog.prototype.addToast = function(text) {
        this.addText(text, true);
    };

    Window_BattleLog.prototype.appendToActionLine = function(text) {
        if (!this._lines || this._lines.length === 0) {
            this.addText(text);
            return;
        }
        if (typeof translateText === 'function') text = translateText(text);
        if (this._currentSubject) text = _replaceStars(text, this._currentSubject);
        text = colorizeLimbAndEntityNames(text);
        const indentTag = /\\mx\[/i.test(text) ? '' : '\\mx[28]';
        const lastIndex = this._lines.length - 1;
        const lineToAppend = indentTag + text;
        this._lines[lastIndex] += '\n' + lineToAppend;

        // Entries on their way out sit at the front, so the last child is still
        // the entry being written. Append only the new reaction element so the
        // existing action lines are not redrawn or re-animated.
        if (this._htmlBattleLogRoot && this._htmlBattleLogRoot.lastElementChild) {
            const temp = document.createElement('div');
            temp.innerHTML = parseBattleLogTextToHtml(lineToAppend);
            while (temp.firstChild) {
                this._htmlBattleLogRoot.lastElementChild.appendChild(temp.firstChild);
            }
        }

        this.scrollToBottom();
        this.wait();
        this._clearDuration = 0;
    };

    Window_BattleLog.prototype.shiftLine = function() {
    };

    Window_BattleLog.prototype.startScaleIn = function() {
    };
    
    Window_BattleLog.prototype.startScaleOut = function() {
    };
    
    Window_BattleLog.prototype.updateScaleAnimation = function() {
    };

    Window_BattleLog.prototype._calculateFixedLogY = function() {
        if (!window.PartyHud) return null;
        const overlay = window.PartyHud.overlay();
        if (!overlay || !overlay._el || !overlay._visible) return null;

        const yOffset = Math.floor((Graphics.height - Graphics.boxHeight) / 2);
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return null;
        const view = canvas.getBoundingClientRect();
        if (!(view.width > 0) || !(view.height > 0)) return null;
        const sy = view.height / Graphics.height;

        const cards = Array.from(overlay._cards.values());
        if (cards.length === 0) return null;

        const lastCard = cards[cards.length - 1];
        if (!lastCard || !lastCard.row) return null;
        const rect = lastCard.row.getBoundingClientRect();
        const bottom = (rect.bottom - view.top) / sy;

        return Math.max(0, bottom - yOffset + 6);
    };

    // Update methods
    const _Window_BattleLog_update = Window_BattleLog.prototype.update;
    Window_BattleLog.prototype.update = function() {
        const yOffset = Math.floor((Graphics.height - Graphics.boxHeight) / 2);
        const pad = this.padding || 12;

        const fixedY = this._calculateFixedLogY();
        if (fixedY !== null) {
            this._originalY = fixedY;
        } else {
            this._originalY = Math.max(0, 100 - yOffset);
        }
        this.y = this._originalY;

        let targetX = 4;
        try {
            const hudParams = PluginManager.parameters('UI/PartyHud');
            if (hudParams && hudParams['hudX']) {
                targetX = Number(hudParams['hudX']) || 4;
            }
        } catch (e) {
            targetX = 4;
        }
        if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
            targetX = Math.floor((Graphics.width - this.width) / 2);
        }
        this.x = targetX;
        
        _Window_BattleLog_update.apply(this, arguments);

        // Keep canvas elements invisible
        this.opacity = 0;
        this.backOpacity = 0;
        this.frameVisible = false;
        if (this._contentsBackSprite) {
            this._contentsBackSprite.visible = false;
        }
        if (this._logSprites) {
            for (const sprite of this._logSprites) {
                sprite.visible = false;
            }
        }

        // Update HTML Battle Log Overlay
        if (this._htmlBattleLogRoot) {
            const sc = _msgGetScale();
            const root = this._htmlBattleLogRoot;
            const hotbarReserve = (window.BattleHotbar && window.BattleHotbar.reservedHeight) || 75;
            // Centered (default) hangs the log from the top centre of the screen, in the free
            // lane between the party HUD on the left and the enemy bars on the right. Classic
            // keeps the old left aligned column under the party HUD cards.
            const centered = ConfigManager.battleLogPosition !== 1;
            const maxW = Math.round(Graphics.width * 0.52);
            const logW = Math.min(this.width, maxW);
            const leftPx = centered
                ? sc.ox + Math.floor((Graphics.width - logW) / 2) * sc.sx
                : sc.ox + this.x * sc.sx;
            const topPx = centered
                ? sc.oy + (yOffset + 8) * sc.sy
                : sc.oy + (this.y + yOffset) * sc.sy;
            _setStyleIfChanged(root, 'left', leftPx + 'px');

            // Available room is bounded by the hotbar below.
            const room = Math.max(60, (Graphics.height - hotbarReserve) * sc.sy - topPx - 6);

            _setStyleIfChanged(root, 'top', topPx + 'px');
            _setStyleIfChanged(root, 'width', ((centered ? logW : this.width) * sc.sx) + 'px');
            _setStyleIfChanged(root, 'maxWidth', Math.round(maxW * sc.sx) + 'px');
            _setStyleIfChanged(root, 'textAlign', centered ? 'center' : 'left');
            _setStyleIfChanged(root, 'maxHeight', room + 'px');
            _setStyleIfChanged(root, 'height', 'auto');
            _setStyleIfChanged(root, 'padding', Math.round(pad * sc.sy) + 'px ' + Math.round(pad * sc.sx) + 'px');
            _setStyleIfChanged(root, 'display',
                (this.visible && this._lines && this._lines.length > 0) ? 'flex' : 'none');
            _setStyleIfChanged(root, 'flexDirection', 'column');
            _setStyleIfChanged(root, 'justifyContent', 'flex-start');
            _setStyleIfChanged(root, 'alignItems', centered ? 'center' : 'flex-start');
            _setStyleIfChanged(root, 'overflowY', 'hidden');
            _setStyleIfChanged(root, 'overflowX', 'visible');

            const bgOpacity = (ConfigManager.battleLogBgOpacity !== undefined ? ConfigManager.battleLogBgOpacity : CONFIG.battleLogBgOpacity) / 100;
            root.style.setProperty('--battlelog-bar-alpha', bgOpacity.toString());
            _setStyleIfChanged(root, 'background', 'transparent');
            _setStyleIfChanged(root, 'border', 'none', true);
            _setStyleIfChanged(root, 'box-shadow', 'none', true);
            _setStyleIfChanged(root, 'outline', 'none', true);

        }
    };

    const _Window_BattleLog_destroy = Window_BattleLog.prototype.destroy;
    Window_BattleLog.prototype.destroy = function(options) {
        if (this._htmlBattleLogRoot && this._htmlBattleLogRoot.parentNode) {
            this._htmlBattleLogRoot.parentNode.removeChild(this._htmlBattleLogRoot);
        }
        this._htmlBattleLogRoot = null;
        if (typeof _Window_BattleLog_destroy === 'function') {
            _Window_BattleLog_destroy.call(this, options);
        }
    };

    Window_BattleLog.prototype.updateLogScroll = function() {};
    Window_BattleLog.prototype.updateLogSprites = function() {};
    Window_BattleLog.prototype._updateContentsBack = function() {};

    // Clear and reset methods
    const _Window_BattleLog_clear = Window_BattleLog.prototype.clear;
    Window_BattleLog.prototype.clear = function() {
        this._baseLineStack = [];
        this._pendingTurnBreak = false;
    };
    
    Window_BattleLog.prototype.clearSmoothBattleLog = function() {
        this._lines = [];
        this._lineToast = [];
        this._lineTurnBreak = [];
        this._pendingTurnBreak = false;
        this._entryMentions = null;
        if (this._htmlBattleLogRoot) {
            this._htmlBattleLogRoot.innerHTML = '';
            this._htmlBattleLogRoot.scrollTop = 0;
            this._htmlBattleLogRoot.style.display = 'none';
        }
    };

    // Called at the start of each battler's action
    Window_BattleLog.prototype.clearForNewAction = function() {
        this._pendingTurnBreak = true;
    };

    // Overrides for battle log behavior
    Window_BattleLog.prototype.waitForEffect = function() {};
    Window_BattleLog.prototype.startTurn = function() {};
    Window_BattleLog.prototype.popBaseLine = function() {
        if (this._baseLineStack) this._baseLineStack.pop();
    };

    const _Window_BattleLog_waitForNewLine = Window_BattleLog.prototype.waitForNewLine;
    Window_BattleLog.prototype.waitForNewLine = function() {
        if (CONFIG.waitNewLine) {
            _Window_BattleLog_waitForNewLine.apply(this, arguments);
        }
    };

    // Track action targets and mark new turn at the start of every action
    const _Window_BattleLog_startAction = Window_BattleLog.prototype.startAction;
    Window_BattleLog.prototype.startAction = function(subject, action, targets) {
        this._pendingTurnBreak = true;
        this._actionTargets = (targets && targets.length > 0) ? targets.slice() : [];
        _Window_BattleLog_startAction.apply(this, arguments);
    };

    // Battle action display with color coding - optimized
    const _Window_BattleLog_displayAction = Window_BattleLog.prototype.displayAction;
    Window_BattleLog.prototype.displayAction = function(subject, item) {
        this._currentSubject = subject;

        const numMethods = this._methods.length;

        // Get colored name directly from cache
        let subjectName;
        if (subject.isActor()) {
            subjectName = NameColorCache.getActorName(subject);
        } else {
            subjectName = NameColorCache.getEnemyName(subject);
        }

        const isBasicAttack = (DataManager.isSkill(item) && (item.id === (subject.attackSkillId ? subject.attackSkillId() : 1) || item.id === 1)) || (!DataManager.isSkill(item) && !DataManager.isItem(item));

        if (isBasicAttack) {
            this._pendingTurnBreak = true;
            let targetStr = '';
            if (this._actionTargets && this._actionTargets.length > 0) {
                // Multi-hit actions repeat the same battler once per hit; the
                // log names each distinct target only once.
                const seen = [];
                const targetNames = [];
                for (const t of this._actionTargets) {
                    if (!t || seen.includes(t)) continue;
                    seen.push(t);
                    targetNames.push(t.isActor() ? NameColorCache.getActorName(t) : NameColorCache.getEnemyName(t));
                }
                targetStr = ' ' + targetNames.join(', ');
            }
            let verb = typeof T === 'function' ? T('BattleLog.attacks') : '';
            if (!verb || verb === 'BattleLog.attacks') {
                verb = typeof T === 'function' ? T('BattleLog.hitsFor') : '';
            }
            if (!verb || verb === 'BattleLog.hitsFor') {
                verb = ConfigManager.language === 'it' ? ' attacca ' : ' attacks ';
            }
            if (!verb.startsWith(' ')) verb = ' ' + verb;
            if (!verb.endsWith(' ') && targetStr) verb = verb + ' ';
            const line = subjectName + verb + targetStr.trimStart() + '!';
            this.push("addText", line);
        } else if (DataManager.isSkill(item) || DataManager.isItem(item)) {
            // Get colored item name from cache
            const itemName = NameColorCache.getItemName(item);
            const startIcon = item.iconIndex ? `\\i[${item.iconIndex}] ` : '';
            this._pendingTurnBreak = true;

            // Check Skill Names option: 0 = Skill Name (default), 1 = Skill Action
            let line;
            if (ConfigManager.battleLogSkillNames === 1 && item.message1 && item.message1.trim()) {
                line = item.message1.format(subjectName, startIcon + itemName);
            } else {
                let verb = typeof T === 'function' ? T('BattleLog.uses') : '';
                if (!verb || verb === 'BattleLog.uses') {
                    verb = ConfigManager.language === 'it' ? ' usa ' : ' uses ';
                }
                if (!verb.startsWith(' ')) verb = ' ' + verb;
                if (!verb.endsWith(' ')) verb = verb + ' ';
                line = subjectName + verb + startIcon + itemName + '!';
            }
            this.push("addText", line);
        }
        
        if (this._methods.length === numMethods) {
            _Window_BattleLog_displayAction.apply(this, arguments);
        }
    };

    Window_BattleLog.prototype.refreshHtmlLines = function() {
        if (!this._lines || !this._htmlBattleLogRoot) return;
        // Index i is the same entry in both lists only once the ones sliding off
        // are left out, since those were already dropped from _lines.
        const children = liveEntries(this._htmlBattleLogRoot);
        const sc = _msgGetScale();
        const baseFontSize = CONFIG.fontSize || 18;
        const scaledFont = Math.round(baseFontSize * sc.sy * 0.9);
        for (let i = 0; i < this._lines.length && i < children.length; i++) {
            children[i].style.fontSize = scaledFont + 'px';
            children[i].innerHTML = parseBattleLogTextToHtml(this._lines[i]);
        }
    };
    // Resolve an embedded archetype i18n key (e.g. "enemyArchetypes.humanoid.head.msg").
    // Some parts (like the humanoid head) have no ".msg" entry, so getArchetypeText
    // echoes the raw key back. In that case fall back to the part's ".name", then to a
    // humanized last segment, so the part name always appears instead of the raw key.
    // Mirrors the enemy-side getPartDamageMsg fallback in Health_Monsters.js.
    function resolveArchetypeKey(key) {
        const tr = typeof window.getArchetypeText === 'function'
            ? window.getArchetypeText
            : (typeof translateText === 'function' ? translateText : (k => k));
        const resolved = v => v && v !== undefined && !/^enemyArchetypes\./.test(v);
        let v = tr(key);
        if (resolved(v) && v !== key) return v;
        // ".msg" missing → try the part's localized ".name"
        if (/\.msg$/.test(key)) {
            const nameKey = key.replace(/\.msg$/, '.name');
            v = tr(nameKey);
            if (resolved(v) && v !== nameKey) return v;
        }
        // Last resort: humanize the part segment (skip trailing "msg"/"name")
        const parts = key.split('.').filter(p => p !== 'msg' && p !== 'name');
        const seg = parts[parts.length - 1] || key;
        return seg.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function colorizeLimbAndEntityNames(text) {
        if (!text) return '';
        
        // 1. Colorize Actor Names in text if not already color-coded
        if (typeof $gameParty !== 'undefined' && $gameParty && $gameParty.battleMembers) {
            const actors = $gameParty.battleMembers();
            for (const actor of actors) {
                if (!actor || !actor.name || actor.name().length <= 1) continue;
                const name = actor.name();
                let color = CONFIG.colors.actor;
                if (actor.actorId() === 2) color = CONFIG.colors.actor2;
                else if (actor.actorId() === 3) color = CONFIG.colors.actor3;
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(?<!\\\\c\\[\\d+\\])${escaped}(?!\\\\c\\[0\\])`, 'g');
                text = text.replace(regex, `\\c[${color}]${name}\\c[0]`);
            }
        }

        // 2. Colorize Enemy Names in text if not already color-coded
        if (typeof $gameTroop !== 'undefined' && $gameTroop && $gameTroop.members) {
            const enemies = $gameTroop.members();
            const sortedNames = [];
            enemies.forEach(e => {
                if (!e) return;
                const n1 = e.name ? e.name() : '';
                const n2 = e.originalName ? e.originalName() : '';
                if (n1 && !sortedNames.includes(n1)) sortedNames.push(n1);
                if (n2 && !sortedNames.includes(n2)) sortedNames.push(n2);
            });
            sortedNames.sort((a, b) => b.length - a.length);
            for (const name of sortedNames) {
                if (!name) continue;
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(?<!\\\\c\\[\\d+\\])${escaped}(?!\\\\c\\[0\\])`, 'g');
                text = text.replace(regex, `\\c[${CONFIG.colors.enemy}]${name}\\c[0]`);
            }
        }

        // 3. Colorize severance / destruction verbs in purple (\c[25])
        const SEVER_VERB_REGEX = /\b(ripped off|crumbled|has been severed|severed|has been destroyed|destroyed|shattered|sliced off|blown off|torn off|broken off|strappat[oaie]|sbriciolat[oaie]|recis[oaie]|distrutt[oaie]|spezzat[oaie])(!?)/gi;
        text = text.replace(SEVER_VERB_REGEX, (match) => {
            return `\\c[25]${match}\\c[0]`;
        });

        return text;
    }

    const _Window_BattleLog_addText = Window_BattleLog.prototype.addText;
    Window_BattleLog.prototype.addText = function(text, isToast) {
      // Resolve embedded i18n dot-key paths before translating the full string
      // e.g. "enemyArchetypes.frog.tongue.msg" → "Tongue severed!" (player-hit part names)
      text = text.replace(/\benemyArchetypes(?:\.\w+)+/g, resolveArchetypeKey);
      if (typeof translateText === 'function') {
        text = translateText(text);
      }
      text = _replaceStars(text, this._currentSubject);
      text = colorizeLimbAndEntityNames(text);
      return _Window_BattleLog_addText.call(this, text, isToast);
    };
    
    // Damage display with colored names
    Window_BattleLog.prototype.displayMiss = function(target) {
        let fmt;
        if (target.result().physical) {
            fmt = target.isActor() ? TextManager.actorNoHit : TextManager.enemyNoHit;
        } else {
            fmt = TextManager.actionFailure;
        }
        
        // Get colored target name from cache
        let targetName = target.isActor() ? NameColorCache.getActorName(target) : NameColorCache.getEnemyName(target);
        this.push("appendToActionLine", fmt.format(targetName));
    };

    Window_BattleLog.prototype.displayEvasion = function(target) {
        let fmt;
        if (target.result().physical) {
            fmt = target.isActor() ? TextManager.actorDodge : TextManager.enemyDodge;
        } else {
            fmt = TextManager.actionFailure;
        }
        if (!fmt) fmt = T('BattleLog.dodged');
        let targetName = target.isActor() ? NameColorCache.getActorName(target) : NameColorCache.getEnemyName(target);

        this.push("appendToActionLine", fmt.format(targetName));
    };

    Window_BattleLog.prototype.displayFailure = function(target) {
        if (target.result().isHit() && !target.result().success) {
            let targetName = target.isActor() ? NameColorCache.getActorName(target) : NameColorCache.getEnemyName(target);
            this.push("appendToActionLine", TextManager.actionFailure.format(targetName));
        }
    };

    Window_BattleLog.prototype.displayCritical = function(target) {
        // Critical message is rendered inline on the damage line with dynamic shake and crimson glow
    };

    Window_BattleLog.prototype.displayHpDamage = function(target) {
        if (target.result().hpAffected) {
            if (target.result().hpDamage > 0 && !target.result().drain) {
                this.push("performDamage", target);
            }
            if (target.result().hpDamage < 0) {
                this.push("performRecovery", target);
            }
            let targetName = target.isActor() ? NameColorCache.getActorName(target) : NameColorCache.getEnemyName(target);

            // Get hit body part name if available
            let partName = '';
            if (target._lastHitPartName) {
                partName = target._lastHitPartName;
            } else if (target._lastHitPart && target._bodyParts && target._bodyParts[target._lastHitPart]) {
                partName = target._bodyParts[target._lastHitPart].name || target._lastHitPart;
            } else if (target._fxLastHitPart && target._bodyParts && target._bodyParts[target._fxLastHitPart]) {
                partName = target._bodyParts[target._fxLastHitPart].name || target._fxLastHitPart;
            }

            let displayName = targetName;
            if (partName && target.result().hpDamage > 0) {
                if (ConfigManager.language === 'it') {
                    displayName = targetName + ' (' + partName + ')';
                } else {
                    displayName = targetName + "'s " + partName;
                }
            }

            const result = target.result();
            const damage = result.hpDamage;
            const isActor = target.isActor();

            let text;
            if (damage > 0 && result.drain) {
                text = TextManager.actorDrain.format(displayName, TextManager.hp, damage);
            } else if (damage > 0) {
                if (result.critical) {
                    const dmgStr = isActor
                        ? TextManager.actorDamage.format(displayName, damage)
                        : TextManager.enemyDamage.format(displayName, damage);
                    text = `\\crit[${dmgStr} (CRITICAL!)]`;
                } else {
                    text = isActor
                        ? TextManager.actorDamage.format(displayName, damage)
                        : TextManager.enemyDamage.format(displayName, damage);
                }
            } else if (damage < 0) {
                text = isActor
                    ? TextManager.actorRecovery.format(targetName, TextManager.hp, -damage)
                    : TextManager.enemyRecovery.format(targetName, TextManager.hp, -damage);
            } else {
                text = isActor
                    ? TextManager.actorNoDamage.format(displayName)
                    : TextManager.enemyNoDamage.format(displayName);
            }
            this.push("appendToActionLine", text);
        }
    };

    Window_BattleLog.prototype._formatParamList = function(params) {
        if (params.length === 1) return params[0];
        if (params.length === 2) {
            return params[0] + T('BattleLog.listPair') + params[1];
        }
        return params.slice(0, -1).join(', ') + T('BattleLog.listLast') + params[params.length - 1];
    };

    Window_BattleLog.prototype.displayChangedBuffs = function(target) {
        const result = target.result();
        const isIt = ConfigManager.language === 'it';
        if (result.addedBuffs.length > 0) {
            const paramStr = this._formatParamList(result.addedBuffs.map(id => `\\c[23]${TextManager.param(id)}\\c[0]`));
            this.push('appendToActionLine', isIt ? paramStr + ' aumentati!' : paramStr + ' increased!');
        }
        if (result.addedDebuffs.length > 0) {
            const paramStr = this._formatParamList(result.addedDebuffs.map(id => `\\c[24]${TextManager.param(id)}\\c[0]`));
            this.push('appendToActionLine', isIt ? paramStr + ' diminuiti!' : paramStr + ' decreased!');
        }
        if (result.removedBuffs.length > 0) {
            const paramStr = this._formatParamList(result.removedBuffs.map(id => TextManager.param(id)));
            this.push('appendToActionLine', isIt ? paramStr + ' normalizzati!' : paramStr + ' restored!');
        }
    };

    // Color the status word(s) in added-state messages using the state's <Hex> color,
    // while keeping the battler's name in its own color. Replaces the default so the
    // message joins the action's reaction lines like damage/buff text.
    Window_BattleLog.prototype.displayAddedStates = function(target) {
        const result = target.result();
        const states = result.addedStateObjects();
        const targetName = target.isActor()
            ? NameColorCache.getActorName(target)
            : NameColorCache.getEnemyName(target);
        for (const state of states) {
            if (state.id === target.deathStateId()) {
                this.push("performCollapse", target);
            }
            let stateText = target.isActor() ? state.message1 : state.message2;
            if (!stateText) continue;
            if (typeof translateText === 'function') stateText = translateText(stateText);
            const hex = getStateHexColor(state);
            let line;
            if (hex) {
                // Tint everything except the name so "paralyzed", "frozen", etc. take the hex color
                const parts = stateText.split('%1');
                const before = parts[0] || '';
                const after = parts.slice(1).join('%1');
                line = (before ? `\\c[${hex}]${before}\\c[0]` : '')
                    + targetName
                    + (after ? `\\c[${hex}]${after}\\c[0]` : '');
            } else {
                line = stateText.format(targetName);
            }
            this.push("appendToActionLine", line);
            this.push("waitForEffect");
        }
    };

    // A state falling off is a reaction to the blow that removed it, so it joins
    // the action's block instead of starting a flush-left entry of its own.
    Window_BattleLog.prototype.displayRemovedStates = function(target) {
        const states = target.result().removedStateObjects();
        const targetName = target.isActor()
            ? NameColorCache.getActorName(target)
            : NameColorCache.getEnemyName(target);
        for (const state of states) {
            let text = state.message4;
            if (!text) continue;
            if (typeof translateText === 'function') text = translateText(text);
            this.push("appendToActionLine", text.format(targetName));
        }
    };

    const _Window_BattleLog_displayDeath = Window_BattleLog.prototype.displayDeath;
    Window_BattleLog.prototype.displayDeath = function(target) {
        _Window_BattleLog_displayDeath.apply(this, arguments);
    };

    Window_BattleLog.prototype.displayRegeneration = function(subject) {
        if (subject.result().hpDamage < 0) {
            const value = Math.abs(subject.result().hpDamage);
            
            // Get colored subject name from cache
            let subjectName;
            if (subject.isActor()) {
                subjectName = NameColorCache.getActorName(subject);
            } else {
                subjectName = NameColorCache.getEnemyName(subject);
            }
            
            // Format: "[Name] recovered [X] HP!"
            if(ConfigManager.language === 'it'){
                this.push("addText", subjectName + " recupera " + value + " HP!");
            }else{
                this.push("addText", subjectName + " recovered " + value + " HP!");

            }
        }
    };

    //-------------------------------------------------------------------------
    // Window_PastBattleLog - Log History Window
    //-------------------------------------------------------------------------
    
    function Window_PastBattleLog() {
        this.initialize(...arguments);
    }

    Window_PastBattleLog.prototype = Object.create(Window_Selectable.prototype);
    Window_PastBattleLog.prototype.constructor = Window_PastBattleLog;

    Window_PastBattleLog.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.openness = 0;
        this._data = [];
    };

    Window_PastBattleLog.prototype.maxItems = function() {
        return this._data.length;
    };

    // The history is drawn on a canvas window, which knows none of the escapes
    // the HTML board renders. Left in, they print as raw brackets, so the walk
    // sprite, the indent and the crit wrapper are taken off here.
    Window_PastBattleLog.prototype.stripLogMarkup = function(text) {
        // replaceCritTags is the one thing that knows where a crit wrapper ends,
        // so the wrapper is unwrapped with it and its markup taken off after.
        return replaceCritTags(String(text || ''))
            .replace(/<[^>]*>/g, '')
            .replace(/\\enemysprite\[[^\]]*\]/gi, '')
            .replace(/\\mx\[\d+\]/gi, '')
            .replace(/\n/g, ' ');
    };

    Window_PastBattleLog.prototype.drawItem = function(index) {
        const rect = this.itemLineRect(index);
        this.drawTextEx(this.stripLogMarkup(this._data[index]), rect.x, rect.y, rect.width);
    };

    Window_PastBattleLog.prototype.refresh = function() {
        this._data = $gameTemp.battleLog();
        Window_Selectable.prototype.refresh.call(this);
    };

    Window_PastBattleLog.prototype.selectBottom = function() {
        this.select(Math.max(this.maxItems() - 1, 0));
    };

    //-------------------------------------------------------------------------
    // Window_PartyCommand - Add Log Command
    //-------------------------------------------------------------------------
    
    const _Window_PartyCommand_makeCommandList = Window_PartyCommand.prototype.makeCommandList;
    Window_PartyCommand.prototype.makeCommandList = function() {
        _Window_PartyCommand_makeCommandList.apply(this, arguments);
        if (CONFIG.logCommand !== '') {
            this.addCommand(CONFIG.logCommand, 'pastLog');
        }
    };

    //-------------------------------------------------------------------------
    // Scene_Battle - Integration with Battle Scene
    //-------------------------------------------------------------------------
    
    const _Scene_Battle_isAnyInputWindowActive = Scene_Battle.prototype.isAnyInputWindowActive;
    Scene_Battle.prototype.isAnyInputWindowActive = function() {
        return _Scene_Battle_isAnyInputWindowActive.apply(this, arguments) ||
                this._pastLogWindow.active;
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        _Scene_Battle_terminate.apply(this, arguments);
        $gameTemp.clearBattleLog();
        // Clear name cache on battle termination
        NameColorCache.refresh();
    };

    const _Scene_Battle_createDisplayObjects = Scene_Battle.prototype.createDisplayObjects;
    Scene_Battle.prototype.createDisplayObjects = function() {
        _Scene_Battle_createDisplayObjects.apply(this, arguments);
        if (CONFIG.startMessagesOnLog) {
            BattleManager.displayStartMessagesOnLog();
        }
    };

    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.apply(this, arguments);
        this.createPastLogWindow();
    };

    Scene_Battle.prototype.logWindowRect = function() {
        const wx = -Math.floor((Graphics.width - Graphics.boxWidth) / 2);
        const wy = 0;
        const ww = Graphics.width;
        const wh = this.calcWindowHeight(CONFIG.maxLines, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.createPastLogWindow = function() {
        const rect = this.pastLogWindowRect();
        const pastLogWindow = new Window_PastBattleLog(rect);
        pastLogWindow.setHandler('cancel', this.onPastLogCancel.bind(this));
        this.addWindow(pastLogWindow);
        this._pastLogWindow = pastLogWindow;
    };

    Scene_Battle.prototype.pastLogWindowRect = function() {
        const wx = 0;
        const wy = 0;
        const ww = Graphics.boxWidth;
        const wh = this._statusWindow.y;
        return new Rectangle(wx, wy, ww, wh);
    };
    
    const _Scene_Battle_createPartyCommandWindow = Scene_Battle.prototype.createPartyCommandWindow;
    Scene_Battle.prototype.createPartyCommandWindow = function() {
        _Scene_Battle_createPartyCommandWindow.apply(this, arguments);
        const commandWindow = this._partyCommandWindow;
        commandWindow.setHandler('pastLog', this.commandPastLog.bind(this));
    };

    Scene_Battle.prototype.commandPastLog = function() {
        this._pastLogWindow.refresh();
        this._pastLogWindow.open();
        this._pastLogWindow.selectBottom();
        this._pastLogWindow.activate();
    };

    Scene_Battle.prototype.onPastLogCancel = function() {
        this._pastLogWindow.close();
        this._pastLogWindow.deactivate();
        this._partyCommandWindow.activate();
    };

    const _Scene_Battle_closeCommandWindows = Scene_Battle.prototype.closeCommandWindows;
    Scene_Battle.prototype.closeCommandWindows = function() {
        _Scene_Battle_closeCommandWindows.apply(this, arguments);
        this._pastLogWindow.close();
        this._pastLogWindow.deactivate();
    };

    // Do not hide the smooth battle log window when the help window is active (e.g. during skill/item selection)
    Scene_Battle.prototype.updateLogWindowVisibility = function() {
        this._logWindow.visible = true;
    };
    
    
})();
