//=============================================================================
// ForceConsole.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Forces the developer console to open in deployed games, plus F3 screenshots and auto error logging
 * @author Assistant
 *
 * @help ForceConsole.js
 *
 * This plugin forces the developer console (DevTools) to open automatically
 * when the game starts, even in deployed builds.
 *
 * Useful for debugging deployed games or testing in production-like environments.
 *
 * Additional features:
 * - Press F3 to capture a screenshot. Files are saved to the "screenshots"
 *   folder in the project root.
 * - All console errors and warnings (plus uncaught exceptions and unhandled
 *   promise rejections) are auto-written to a log file in the project root,
 *   including the stack trace.
 * - On game start a separator line of asterisks and a timestamp are written
 *   to the log file to mark a fresh session.
 * - Optionally re-enables RPG Maker's built-in CTRL noclip (hold CTRL to walk
 *   through walls and events) in deployed builds, where the engine normally
 *   gates it behind playtest mode.
 * - In playtest only: if Player 1 reaches the map with no character graphic,
 *   a random NPC sheet from js/db/WorldGen/NPCs.json is dealt to them so the
 *   party leader is never invisible while testing.
 *
 * @param autoOpen
 * @text Auto-Open Console
 * @desc Automatically open the console when the game starts
 * @type boolean
 * @default true
 *
 * @param openDetached
 * @text Open Detached
 * @desc Open the console in a separate window
 * @type boolean
 * @default false
 *
 * @param debugThrough
 * @text CTRL Noclip In Released Builds
 * @desc Hold CTRL to walk through walls/events outside playtest (the engine's own debug-through, ungated)
 * @type boolean
 * @default true
 *
 * @param screenshotFolder
 * @text Screenshot Folder
 * @desc Folder name (relative to project root) for F3 screenshots
 * @type string
 * @default screenshots
 *
 * @param logFile
 * @text Log File Name
 * @desc File name (relative to project root) for errors and warnings
 * @type string
 * @default debug-log.txt
 */

(() => {
    const pluginName = "ForceConsole";
    const parameters = PluginManager.parameters(pluginName);
    const autoOpen = parameters['autoOpen'] === 'true';
    const openDetached = parameters['openDetached'] === 'true';
    const debugThrough = parameters['debugThrough'] !== 'false';
    const screenshotFolder = parameters['screenshotFolder'] || 'screenshots';
    const logFileName = parameters['logFile'] || 'debug-log.txt';

    //=========================================================================
    // File system helpers
    //=========================================================================

    function nodeRequire(mod) {
        if (typeof require === 'function') {
            try { return require(mod); } catch (e) { /* not available */ }
        }
        return null;
    }

    function getBasePath() {
        const path = nodeRequire('path');
        if (!path) return '';
        try {
            if (typeof process !== 'undefined' && process.mainModule) {
                return path.dirname(process.mainModule.filename);
            }
        } catch (e) { /* fall through */ }
        try {
            if (typeof process !== 'undefined' && process.cwd) {
                return process.cwd();
            }
        } catch (e) { /* fall through */ }
        return '';
    }

    // 2026-06-23_14-30-15-123 (filesystem-safe, no colons)
    function fileStamp() {
        const d = new Date();
        const p = (n, l = 2) => String(n).padStart(l, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
            `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}` +
            `-${p(d.getMilliseconds(), 3)}`;
    }

    function logStamp() {
        try { return new Date().toISOString(); } catch (e) { return ''; }
    }

    //=========================================================================
    // Error / warning logging
    //=========================================================================

    let _fileLoggingEnabled = null;
    function isFileLoggingEnabled() {
        if (_fileLoggingEnabled === null) {
            _fileLoggingEnabled = !!(nodeRequire('fs') && nodeRequire('path'));
        }
        return _fileLoggingEnabled;
    }

    // Buffered logging: entries accumulate here and are flushed asynchronously
    // on a 2s timer (and synchronously on process exit) instead of doing a
    // synchronous appendFileSync per console.warn/error call.
    const _logBuffer = [];
    let _logFlushTimer = null;

    function flushLogBuffer(sync) {
        if (_logBuffer.length === 0) return;
        const fs = nodeRequire('fs');
        const path = nodeRequire('path');
        if (!fs || !path) {
            _logBuffer.length = 0;
            return;
        }
        const text = _logBuffer.join('\n') + '\n';
        _logBuffer.length = 0;
        try {
            const file = path.join(getBasePath(), logFileName);
            if (sync) {
                fs.appendFileSync(file, text, 'utf8');
            } else {
                fs.appendFile(file, text, 'utf8', (e) => {
                    // Use the original console to avoid recursion into our hook.
                    if (e && _originalConsoleWarn) _originalConsoleWarn.call(console, 'Could not write log:', e);
                });
            }
        } catch (e) {
            // Use the original console to avoid recursion into our hook.
            if (_originalConsoleWarn) _originalConsoleWarn.call(console, 'Could not write log:', e);
        }
    }

    function appendLog(text) {
        if (!isFileLoggingEnabled()) return;
        _logBuffer.push(text);
        if (!_logFlushTimer) {
            _logFlushTimer = setInterval(() => flushLogBuffer(false), 2000);
        }
    }

    if (typeof process !== 'undefined' && typeof process.on === 'function') {
        process.on('exit', () => flushLogBuffer(true));
    }

    function formatArg(arg) {
        if (arg instanceof Error) {
            return (arg.stack || (arg.name + ': ' + arg.message));
        }
        if (typeof arg === 'object' && arg !== null) {
            try { return JSON.stringify(arg); } catch (e) { return String(arg); }
        }
        return String(arg);
    }

    function captureStack() {
        try {
            const stack = new Error().stack || '';
            // Drop the first lines that point at this plugin's own helpers.
            return stack.split('\n').slice(3).join('\n');
        } catch (e) {
            return '';
        }
    }

    function logEntry(level, args, explicitStack) {
        // Skip stack capture and arg stringification entirely when file
        // logging is unavailable - the entry would be dropped anyway.
        if (!isFileLoggingEnabled()) return;
        const message = Array.prototype.map.call(args, formatArg).join(' ');
        const stack = explicitStack || captureStack();
        let entry = `[${logStamp()}] [${level}] ${message}`;
        if (stack && stack.trim()) entry += `\n${stack}`;
        appendLog(entry);
    }

    const _originalConsoleError = console.error;
    const _originalConsoleWarn = console.warn;

    console.error = function(...args) {
        _originalConsoleError.apply(console, args);
        logEntry('ERROR', args);
    };

    console.warn = function(...args) {
        _originalConsoleWarn.apply(console, args);
        logEntry('WARN', args);
    };

    // Uncaught exceptions
    if (typeof window !== 'undefined') {
        window.addEventListener('error', function(event) {
            const err = event.error || event.message;
            const stack = (event.error && event.error.stack) ||
                `${event.message} (${event.filename}:${event.lineno}:${event.colno})`;
            logEntry('UNCAUGHT', [err && err.message ? err.message : event.message], stack);
        });

        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', function(event) {
            const reason = event.reason;
            const stack = (reason && reason.stack) || '';
            logEntry('REJECTION', [reason && reason.message ? reason.message : reason], stack);
        });
    }

    //=========================================================================
    // A fatal error under a DOM overlay
    //=========================================================================
    // Every menu in this game is a DOM overlay standing over the game canvas,
    // and RMMZ answers an error it cannot survive by stopping the loop, cutting
    // the audio and drawing its error box ON THE CANVAS. With a menu open that
    // box is behind the parchment: the music has gone, nothing answers a key or
    // a click, nothing says why, and the only way out of the window is Alt+F4.
    // The box is the way out (it names the fault, and F5 reloads from it), so
    // when the game stops, every overlay comes down and the box is put on top
    // of whatever is left.
    function uncoverErrorScreen() {
        if (typeof document === 'undefined' || !document.body) return;
        const printer = document.getElementById('errorPrinter');
        for (const el of Array.from(document.body.children)) {
            if (el === printer || el.tagName === 'CANVAS' || el.tagName === 'SCRIPT') continue;
            el.style.display = 'none';
        }
        if (printer) {
            printer.style.zIndex = '2147483647';
            printer.style.pointerEvents = 'auto';
        }
    }

    if (typeof SceneManager !== 'undefined') {
        const _catchException = SceneManager.catchException;
        SceneManager.catchException = function(e) {
            _catchException.call(this, e);
            try { uncoverErrorScreen(); } catch (err) { /* nothing left to do */ }
        };

        const _onError = SceneManager.onError;
        SceneManager.onError = function(event) {
            _onError.call(this, event);
            try { uncoverErrorScreen(); } catch (err) { /* nothing left to do */ }
        };
    }

    // Session separator on game start
    appendLog('');
    appendLog('*'.repeat(60));
    appendLog(`[${logStamp()}] SESSION START`);
    appendLog('*'.repeat(60));

    //=========================================================================
    // F3 screenshot capture
    //=========================================================================

    function takeScreenshot() {
        const fs = nodeRequire('fs');
        const path = nodeRequire('path');
        if (!fs || !path) {
            console.warn('Screenshot unavailable: file system access not present.');
            return;
        }
        try {
            const dir = path.join(getBasePath(), screenshotFolder);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const bitmap = SceneManager.snap();
            const canvas = bitmap.canvas || bitmap._canvas;
            const dataUrl = canvas.toDataURL('image/png');
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

            const file = path.join(dir, `screenshot_${fileStamp()}.png`);
            fs.writeFileSync(file, base64, 'base64');
            console.log('Screenshot saved:', file);

            if (bitmap && bitmap.destroy) bitmap.destroy();
        } catch (e) {
            console.warn('Could not take screenshot:', e);
        }
    }

    // The camera items (Pocket Video Recorder, Digital Camera, Investigator's
    // Camera, Covert Recorder) take the same picture F3 does, so the capture is
    // published rather than kept private to the key handler.
    window.ForceConsole = window.ForceConsole || {};
    window.ForceConsole.takeScreenshot = takeScreenshot;

    //=========================================================================
    // Playtest: a Player 1 with no sprite gets one
    //=========================================================================

    // A playtest can reach the map with actor 1 holding no character graphic at
    // all: a test start that skipped character creation, a save written before
    // the creation wizard ran, an actor edited down to an empty sheet. The map
    // then draws nothing where the party leader stands, which reads as a broken
    // scene rather than a missing graphic. Deal that actor one of the ordinary
    // inhabitant sheets so testing always has a visible player.
    //
    // SpriteCatalog (Core/DataService.js) owns the pool: it reads
    // js/db/WorldGen/NPCs.json and already applies this world's beta, magic and
    // population answers, so a goblin world deals a goblin. The raw file is the
    // fallback for the case where the catalogue has not been built yet.
    // Playtest only, on purpose: a released build showing an empty leader is a
    // bug worth seeing rather than one worth papering over.
    function fillEmptyPlayerSprite() {
        if (!window.$gameTemp || !$gameTemp.isPlaytest()) return;
        const actor = window.$gameActors && $gameActors.actor(1);
        if (!actor || actor.characterName()) return;

        let key = (window.SpriteCatalog && window.SpriteCatalog.pickNpcKey)
            ? window.SpriteCatalog.pickNpcKey(Math.random())
            : null;
        if (!key) {
            const npcs = (window.WorldGen && window.WorldGen.NPCs) || null;
            const keys = npcs
                ? Object.keys(npcs).filter(k => npcs[k] && npcs[k].npc === true)
                : [];
            if (keys.length === 0) return;
            key = keys[Math.floor(Math.random() * keys.length)];
        }

        // "$" sheets are single-character (index 0 only); a standard sheet holds 8.
        const index = key.includes("$") ? 0 : Math.floor(Math.random() * 8);
        actor.setCharacterImage(key, index);
        if (window.$gamePlayer) $gamePlayer.refresh();
        console.log(`ForceConsole: Player 1 had no sprite, dealt ${key}#${index}`);
    }

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        try {
            fillEmptyPlayerSprite();
        } catch (e) {
            console.warn('Could not assign a fallback sprite to Player 1:', e);
        }
    };

    //=========================================================================
    // CTRL noclip outside playtest
    //=========================================================================

    // The engine's own debug-through (Game_Player#isDebugThrough) is gated behind
    // $gameTemp.isPlaytest(), so holding CTRL does nothing in a deployed build.
    // Drop the playtest half of the condition and keep the rest of the base
    // behaviour: passability, event collision and random encounters all already
    // consult isDebugThrough().
    if (debugThrough) {
        Game_Player.prototype.isDebugThrough = function() {
            return Input.isPressed("control");
        };
    }

    // NOTE: We intentionally do NOT override Utils.isNwjs here. Forcing it to always
    // return true breaks plain-browser deployments, where plugins gate require('fs')
    // (undefined in a browser) behind Utils.isNwjs() and would then throw. Leave the
    // real environment detection intact; this plugin only reports console output.

    // Open the console when the game starts
    if (autoOpen) {
        const _SceneManager_run = SceneManager.run;
        SceneManager.run = function(sceneClass) {
            _SceneManager_run.call(this, sceneClass);

            // Open the developer console
            if (typeof nw !== 'undefined' && nw.Window) {
                const win = nw.Window.get();
                if (openDetached) {
                    win.showDevTools('', () => {});
                } else {
                    win.showDevTools();
                }
            } else if (typeof require !== 'undefined') {
                // Alternative method using require
                try {
                    const gui = require('nw.gui');
                    const win = gui.Window.get();
                    if (openDetached) {
                        win.showDevTools('', () => {});
                    } else {
                        win.showDevTools();
                    }
                } catch (e) {
                    console.warn('Could not open DevTools:', e);
                }
            }
        };
    }

    // Add F8 key binding to toggle console
    const _SceneManager_onKeyDown = SceneManager.onKeyDown;
    SceneManager.onKeyDown = function(event) {
        if (_SceneManager_onKeyDown) {
            _SceneManager_onKeyDown.call(this, event);
        }

        if (!event.ctrlKey && !event.altKey && event.keyCode === 114) { // F3
            takeScreenshot();
        }

        if (!event.ctrlKey && !event.altKey && event.keyCode === 119) { // F8
            if (typeof nw !== 'undefined' && nw.Window) {
                const win = nw.Window.get();
                try {
                    if (win.isDevToolsOpen && win.isDevToolsOpen()) {
                        win.closeDevTools();
                    } else {
                        if (openDetached) {
                            win.showDevTools('', () => {});
                        } else {
                            win.showDevTools();
                        }
                    }
                } catch (e) {
                    console.warn('Could not toggle DevTools:', e);
                }
            }
        }
    };

})();
