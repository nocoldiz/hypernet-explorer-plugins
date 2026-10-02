//=============================================================================
// HookProfiler.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Opt-in per-plugin timing of the map update hooks, written to perf-log.txt
 * @author Assistant
 *
 * @help HookProfiler.js
 *
 * Tells which plugin is eating the frame. Every plugin in this game chains
 * onto the same handful of engine update methods (Scene_Map.update,
 * Game_Event.update, Sprite_Character.update ...), so a slow map shows up in
 * the DevTools profiler as one long anonymous chain. This plugin labels each
 * link of that chain with the plugin file that installed it and measures the
 * time spent in that link alone (SELF time: the time of the links it calls
 * further down the chain is subtracted).
 *
 * It must be the FIRST entry of js/plugins.js: it watches the methods before
 * any other plugin replaces them, and a hook assigned while a plugin file is
 * loading is labelled with that file (document.currentScript).
 *
 * Watched:
 *   Scene_Base.update, Scene_Map.update, Game_Map.update, Game_Event.update,
 *   Game_Player.update, Game_CharacterBase.update, Spriteset_Map.update,
 *   Sprite_Character.update, Window.update, Window_Base.update,
 *   Scene_Map.start, Scene_Map.onMapLoaded, Game_Player.performTransfer,
 *   SceneManager.updateMain, updateInputData, updateEffekseer, changeScene,
 *   SceneManager.renderScene (when a plugin defines it), Input.update,
 *   Input._pollGamepads, TouchInput.update, navigator.getGamepads, and
 *   Graphics._onTick, whose self time is the render plus the frame overhead.
 *   Every other requestAnimationFrame loop is timed too, one row per plugin
 *   that scheduled it (hook "requestAnimationFrame"); the engine's own loop
 *   is left out, it is Graphics._onTick.
 *
 * FRAME TIMING
 *   Each drawn frame is measured from one Graphics._onTick to the next (rAF
 *   to rAF). Its JS time is the update and render inside _onTick; the rest of
 *   the interval is "outside JS": other rAF loops, layout, paint, compositing,
 *   GPU wait and garbage collection. A frame that changed scene, loaded a map
 *   or wrote a report is left out of these figures and counted on its own.
 *
 * OVERHEAD
 *   At start the cost of one metered call is measured. The report header
 *   prints it, and the "adj ms/frame" column is the average minus
 *   calls x that cost, so a hook called hundreds of times a frame reads true.
 *
 * OFF BY DEFAULT, AND FREE WHEN OFF
 * The on/off decision is made once, when the plugin loads. When it is off
 * nothing is installed at all: every method stays a plain function and costs
 * exactly what it did before. Turning it on or off therefore takes effect
 * after a restart of the game.
 *
 * HOW TO TURN IT ON (any one of these, then restart the game)
 *   - Options > Experimental > Hook profiler (needs restart).
 *   - Press F8 to open the DevTools console and type
 *         HookProfiler.enable()
 *     HookProfiler.disable() turns it off again.
 *   - Start the game with the "perf" option in the URL (?perf), which
 *     Utils.isOptionValid("perf") reads.
 *
 * WHILE IT IS ON
 *   Every <frames> drawn frames (default 1800, about 30 seconds), or when you
 *   press Ctrl+F8, a table sorted by cost is appended to perf-log.txt in the
 *   game folder (next to debug-log.txt), printed with console.table, and a
 *   notice says so. The counters are then reset and collection goes on.
 *   It opens with a summary (fps, frame interval, JS and outside-JS time,
 *   interval histogram, load frames left out, overhead, top 10 rows).
 *   Columns: average self ms per frame, overhead-adjusted ms per frame, 95th
 *   percentile ms per frame, worst frame ms, and calls per frame.
 *   HookProfiler.dump() writes one on demand.
 *
 * Console API: HookProfiler.enable(), disable(), dump(), isOn().
 *
 * @param frames
 * @text Frames Per Report
 * @desc How many drawn frames are collected before a report is written.
 * @type number
 * @min 60
 * @default 1800
 *
 * @param logFile
 * @text Log File Name
 * @desc File name (relative to the game folder) the reports are appended to.
 * @type string
 * @default perf-log.txt
 */

(() => {
    "use strict";

    const PLUGIN_NAME = "HookProfiler";
    const FLAG_KEY = "hypernet.hookProfiler";
    const OPTION_SYMBOL = "hookProfiler";
    const params = (typeof PluginManager !== "undefined" && PluginManager.parameters)
        ? PluginManager.parameters(PLUGIN_NAME) : {};
    const WINDOW_FRAMES = Math.max(60, Number(params.frames) || 1800);
    const LOG_FILE = params.logFile || "perf-log.txt";
    // The per-frame samples a p95 is read from. A report is written every
    // WINDOW_FRAMES frames, so the ring only has to hold one window.
    const RING = Math.min(WINDOW_FRAMES, 3600);
    const DUMP_KEY = 119; // F8, with Ctrl held (ForceConsole takes plain F8)

    // Text is looked up when it is shown: this plugin loads before the
    // localization layer, so T does not exist yet while this file runs.
    function tr(key, args) {
        const full = PLUGIN_NAME + "." + key;
        return (typeof window !== "undefined" && typeof window.T === "function")
            ? window.T(full, args) : full;
    }

    //=========================================================================
    // The flag
    //=========================================================================
    function readFlag() {
        try { return window.localStorage.getItem(FLAG_KEY) === "1"; }
        catch (e) { return false; }
    }
    function writeFlag(on) {
        try {
            if (on) window.localStorage.setItem(FLAG_KEY, "1");
            else window.localStorage.removeItem(FLAG_KEY);
        } catch (e) { /* storage blocked: the flag simply does not stick */ }
    }
    function perfOption() {
        try {
            return typeof Utils !== "undefined" && typeof Utils.isOptionValid === "function"
                && Utils.isOptionValid("perf");
        } catch (e) { return false; }
    }
    const ON = readFlag() || perfOption();

    function notice(key, args) {
        const text = tr(key, args);
        try {
            if (window.ParchmentToast && typeof window.ParchmentToast.show === "function") {
                window.ParchmentToast.show(text, { severity: "info" });
            }
        } catch (e) { /* the console line below still says it */ }
        console.log("[HookProfiler] " + text);
    }

    //=========================================================================
    // The meter (only ever installed when ON)
    //=========================================================================
    const perf = (typeof performance !== "undefined" && performance && performance.now)
        ? performance : Date;
    const stats = [];               // every meter, in install order
    const byLabel = new Map();
    let childAcc = 0;               // time the wrappers below the current one took
    let mainDepth = 0;              // nesting of the SceneManager.updateMain chain
    let frames = 0;
    let lastFrame = null;
    let windowStart = 0;
    let overheadMs = 0;             // calibrated cost of one metered call

    // What a watched hook means to the frame clock, beyond its own row.
    const KIND_MAIN = 1;            // SceneManager.updateMain: a logic tick
    const KIND_TICK = 2;            // Graphics._onTick: one drawn frame (rAF callback)
    const KIND_LOAD = 3;            // a call means the frame is a load
    const KIND_SCENE = 4;           // a load when the scene object changed across the call
    const KINDS = {
        "SceneManager.updateMain": KIND_MAIN,
        "Graphics._onTick": KIND_TICK,
        "Scene_Map.start": KIND_LOAD,
        "Scene_Map.onMapLoaded": KIND_LOAD,
        "Game_Player.performTransfer": KIND_LOAD,
        "SceneManager.changeScene": KIND_SCENE
    };

    function pluginLabel(src) {
        let s = String(src || "");
        try { s = decodeURIComponent(s); } catch (e) { /* keep it raw */ }
        s = s.split("?")[0].split("#")[0].replace(/\\/g, "/");
        const at = s.lastIndexOf("/plugins/");
        s = at >= 0 ? s.slice(at + 9) : s.slice(s.lastIndexOf("/") + 1);
        return s.replace(/\.js$/i, "") || "unknown";
    }

    // The plugin file assigning a hook right now. While a plugin <script>
    // runs, document.currentScript is its tag; a hook assigned later, from a
    // callback, is traced back through the stack instead.
    function currentFile() {
        try {
            const cs = typeof document !== "undefined" ? document.currentScript : null;
            if (cs && cs.src) return pluginLabel(cs.src);
        } catch (e) { /* fall through to the stack */ }
        return stackLabel(false);
    }

    // The first plugin file on the call stack. With `libs` a stack holding no
    // plugin is labelled with its first script instead ("lib pixi").
    function stackLabel(libs) {
        let lib = null;
        try {
            const lines = String(new Error().stack || "").split("\n");
            for (const line of lines) {
                if (/HookProfiler\.js/.test(line)) continue;
                const m = line.match(/([^\s()]*\/plugins\/[^\s()]+?\.js)/);
                if (m) return pluginLabel(m[1]);
                if (libs && !lib) {
                    const l = line.match(/([^\s()@]+?\.js)(?::\d+)/);
                    if (l) lib = "lib " + pluginLabel(l[1]);
                }
            }
        } catch (e) { /* unknown */ }
        return lib || "unknown";
    }

    function newStat(label, file, hook) {
        return {
            label, file, hook,
            total: 0, calls: 0, max: 0, frameAcc: 0,
            ring: new Float64Array(RING), ringLen: 0, ringPos: 0,
            kind: KINDS[hook] || 0
        };
    }

    function makeStat(file, hook) {
        let label = file + " " + hook;
        if (byLabel.has(label)) {
            let n = 2;
            while (byLabel.has(label + " #" + n)) n++;
            label += " #" + n;
        }
        const s = newStat(label, file, hook);
        byLabel.set(label, s);
        stats.push(s);
        return s;
    }

    // A frame boundary is a change of FrameBudget's presented-frame counter
    // (Core/ParchmentToast.js), so the logic ticks that share one drawn frame
    // are added up together. Without it every updateMain is its own frame.
    function beginTick() {
        const fb = window.FrameBudget;
        if (fb && typeof fb.stats === "function") {
            const f = fb.stats().frame;
            if (f === lastFrame) return;
            if (lastFrame !== null) closeFrame();
            lastFrame = f;
            return;
        }
        if (lastFrame !== null) closeFrame();
        lastFrame = 0;
    }

    function closeFrame() {
        frames++;
        for (let i = 0; i < stats.length; i++) {
            const s = stats[i];
            const v = s.frameAcc;
            s.frameAcc = 0;
            s.total += v;
            if (v > s.max) s.max = v;
            s.ring[s.ringPos] = v;
            s.ringPos = (s.ringPos + 1) % RING;
            if (s.ringLen < RING) s.ringLen++;
        }
        if (frames >= WINDOW_FRAMES) dump("auto");
    }

    //=========================================================================
    // Frame timing: rAF to rAF, read off the outermost Graphics._onTick.
    // A drawn frame k runs from the start of tick k to the start of tick k+1;
    // its JS time is tick k's update + render, the rest of the interval is
    // spent outside this loop (other rAF loops, layout, paint, compositing,
    // GPU wait, GC). A frame whose tick changed scene, loaded a map or wrote
    // a report is kept out of the averages and counted on its own.
    //=========================================================================
    let tickDepth = 0;
    let tickSeq = 0;                // bumps on every drawn frame, read by the rAF meter
    let tickStart = -1;
    let tickJs = 0;
    let tickLoad = false;           // the open tick did load work
    let prevLoad = false;
    const ft = {
        n: 0, sumInt: 0, sumJs: 0, sumOut: 0, maxInt: 0, maxJs: 0, maxOut: 0,
        hist: [0, 0, 0, 0], loadN: 0, loadMs: 0,
        rInt: new Float64Array(RING), rJs: new Float64Array(RING), rOut: new Float64Array(RING),
        len: 0, pos: 0
    };
    const HIST_EDGES = [17, 34, 50];

    function recordFrame(interval, js, load) {
        if (load) { ft.loadN++; ft.loadMs += interval; return; }
        const out = Math.max(0, interval - js);
        ft.n++;
        ft.sumInt += interval; ft.sumJs += js; ft.sumOut += out;
        if (interval > ft.maxInt) ft.maxInt = interval;
        if (js > ft.maxJs) ft.maxJs = js;
        if (out > ft.maxOut) ft.maxOut = out;
        let b = 0;
        while (b < HIST_EDGES.length && interval > HIST_EDGES[b]) b++;
        ft.hist[b]++;
        ft.rInt[ft.pos] = interval; ft.rJs[ft.pos] = js; ft.rOut[ft.pos] = out;
        ft.pos = (ft.pos + 1) % RING;
        if (ft.len < RING) ft.len++;
    }

    function tickEnter(now) {
        tickSeq++;
        if (tickStart >= 0) recordFrame(now - tickStart, tickJs, prevLoad);
        tickStart = now;
        tickLoad = false;
    }

    function tickExit(now) {
        tickJs = now - tickStart;
        prevLoad = tickLoad;
    }

    function markLoad() { if (tickDepth > 0) tickLoad = true; }

    function resetFrameTiming() {
        ft.n = 0; ft.sumInt = 0; ft.sumJs = 0; ft.sumOut = 0;
        ft.maxInt = 0; ft.maxJs = 0; ft.maxOut = 0;
        ft.hist = [0, 0, 0, 0]; ft.loadN = 0; ft.loadMs = 0;
        ft.len = 0; ft.pos = 0;
    }

    function currentScene() {
        try { return typeof SceneManager !== "undefined" ? SceneManager._scene : null; }
        catch (e) { return null; }
    }

    function meter(fn, s) {
        const k = s.kind;
        const w = function () {
            if (k === KIND_MAIN && mainDepth++ === 0) beginTick();
            const t0 = perf.now();
            if (k === KIND_TICK && tickDepth++ === 0) tickEnter(t0);
            const scene0 = k === KIND_SCENE ? currentScene() : null;
            const saved = childAcc;
            childAcc = 0;
            try { return fn.apply(this, arguments); }
            finally {
                const t1 = perf.now();
                const total = t1 - t0;
                s.frameAcc += total - childAcc;
                s.calls++;
                childAcc = saved + total;
                if (k !== 0) {
                    if (k === KIND_MAIN) mainDepth--;
                    else if (k === KIND_TICK) { if (--tickDepth === 0) tickExit(t1); }
                    else if (k === KIND_LOAD) markLoad();
                    else if (k === KIND_SCENE && currentScene() !== scene0) markLoad();
                }
            }
        };
        w.__hookProfiled = s.label;
        w.__hookProfiledInner = fn;
        return w;
    }

    // Replaces owner[method] with an accessor: whatever function is assigned
    // to it from now on is wrapped and labelled with the plugin assigning it.
    // An assignment onto an instance or a subclass prototype (the setter runs
    // with `this` set to it) gets its own plain property, as it always did.
    function watch(owner, ownerName, method, engineLabel) {
        if (!owner) return false;
        const hook = ownerName + "." + method;
        const desc = Object.getOwnPropertyDescriptor(owner, method);
        let current = owner[method];
        if (typeof current === "function") current = meter(current, makeStat(engineLabel || "engine", hook));
        Object.defineProperty(owner, method, {
            configurable: true,
            enumerable: desc ? !!desc.enumerable : false,
            get() { return current; },
            set(fn) {
                if (this !== owner) {
                    Object.defineProperty(this, method, {
                        value: fn, writable: true, configurable: true, enumerable: true
                    });
                    return;
                }
                if (typeof fn !== "function" || fn.__hookProfiled) { current = fn; return; }
                current = meter(fn, makeStat(currentFile(), hook));
            }
        });
        return true;
    }

    //=========================================================================
    // Browser entry points: navigator.getGamepads and requestAnimationFrame
    //=========================================================================
    function watchGamepads() {
        const nav = typeof navigator !== "undefined" ? navigator : null;
        if (!nav || typeof nav.getGamepads !== "function") return false;
        const w = meter(nav.getGamepads, makeStat("browser", "navigator.getGamepads"));
        try {
            Object.defineProperty(nav, "getGamepads", { value: w, writable: true, configurable: true });
        } catch (e) { return false; }
        return nav.getGamepads === w;
    }

    // Every rAF loop other than the engine's own: each callback is timed and
    // labelled with the plugin that scheduled it. The label is read off the
    // stack once per callback function. A callback that ran a Graphics._onTick
    // is the engine loop (PIXI's ticker), already measured: it is not counted.
    function watchAnimationFrames() {
        const orig = window.requestAnimationFrame;
        if (typeof orig !== "function" || orig.__hookProfiled) return false;
        const labels = new WeakMap();
        const loops = new Map();
        const labelling = makeStat("profiler", "rAF labelling");
        const raf = function requestAnimationFrame(cb) {
            if (typeof cb !== "function") return orig.call(window, cb);
            const l0 = perf.now();
            let label = labels.get(cb);
            if (label === undefined) { label = stackLabel(true); labels.set(cb, label); }
            const lt = perf.now() - l0;
            labelling.frameAcc += lt;
            labelling.calls++;
            childAcc += lt;
            return orig.call(window, function (ts) {
                const seq = tickSeq;
                const t0 = perf.now();
                const saved = childAcc;
                childAcc = 0;
                try { return cb.call(this, ts); }
                finally {
                    const total = perf.now() - t0;
                    const self = total - childAcc;
                    childAcc = saved + total;
                    if (tickSeq === seq) {
                        let s = loops.get(label);
                        if (!s) { s = makeStat(label, "requestAnimationFrame"); loops.set(label, s); }
                        s.frameAcc += self;
                        s.calls++;
                    }
                }
            });
        };
        raf.__hookProfiled = "requestAnimationFrame";
        raf.__hookProfiledInner = orig;
        window.requestAnimationFrame = raf;
        return true;
    }

    // The wrapper's own cost: N empty calls through a meter against N bare
    // ones, best of a few rounds. The meter used here is not in the report.
    function calibrate() {
        const N = 20000;
        const bare = function () {};
        const w = meter(bare, newStat("calibration", "calibration", "calibration"));
        const savedAcc = childAcc;
        let best = Infinity;
        for (let r = 0; r < 3; r++) {
            let t0 = perf.now();
            for (let i = 0; i < N; i++) bare();
            const tb = perf.now() - t0;
            t0 = perf.now();
            for (let i = 0; i < N; i++) w();
            const tw = perf.now() - t0;
            best = Math.min(best, (tw - tb) / N);
        }
        childAcc = savedAcc;
        return Number.isFinite(best) ? Math.max(0, best) : 0;
    }

    //=========================================================================
    // The report
    //=========================================================================
    function pctOf(ring, n, q) {
        if (!n) return 0;
        const a = Array.from(ring.subarray(0, n)).sort((x, y) => x - y);
        return a[Math.floor(q * (n - 1))];
    }
    function p95(s) { return pctOf(s.ring, s.ringLen, 0.95); }

    function buildRows() {
        const f = Math.max(1, frames);
        return stats
            .filter(s => s.calls > 0)
            .map(s => {
                const avg = s.total / f;
                const calls = s.calls / f;
                return {
                    plugin: s.file,
                    hook: s.hook,
                    avg,
                    adj: Math.max(0, avg - calls * overheadMs),
                    p95: p95(s),
                    max: s.max,
                    calls
                };
            })
            .sort((a, b) => b.avg - a.avg);
    }

    function frameSummary(rows, wallMs) {
        const n = ft.n;
        const d = Math.max(1, n);
        const sumRows = (pred, key) => rows.filter(pred).reduce((a, r) => a + r[key], 0);
        const pads = rows.filter(r => r.hook === "navigator.getGamepads");
        return {
            drawn: n,
            fps: ft.sumInt > 0 ? 1000 * n / ft.sumInt : 0,
            wallFps: wallMs > 0 ? 1000 * (n + ft.loadN) / wallMs : 0,
            intAvg: ft.sumInt / d, intP95: pctOf(ft.rInt, ft.len, 0.95), intMax: ft.maxInt,
            jsAvg: ft.sumJs / d, jsP95: pctOf(ft.rJs, ft.len, 0.95), jsMax: ft.maxJs,
            outAvg: ft.sumOut / d, outP95: pctOf(ft.rOut, ft.len, 0.95), outMax: ft.maxOut,
            hist: ft.hist.slice(),
            loadN: ft.loadN, loadMs: ft.loadMs,
            rafMs: sumRows(r => r.hook === "requestAnimationFrame", "avg"),
            hookMs: sumRows(() => true, "avg"),
            callsPerFrame: sumRows(() => true, "calls"),
            padCalls: pads.reduce((a, r) => a + r.calls, 0),
            padMs: pads.reduce((a, r) => a + r.avg, 0),
            overheadMs
        };
    }

    function pad(v, w, right) {
        const s = String(v);
        if (s.length >= w) return s;
        const fill = " ".repeat(w - s.length);
        return right ? fill + s : s + fill;
    }

    function formatSummary(rows, sum) {
        const f = (v, d) => Number(v || 0).toFixed(d === undefined ? 2 : d);
        const total = Math.max(1, sum.drawn);
        const pc = c => c + " (" + f(100 * c / total, 0) + "%)";
        const out = [
            "Summary (drawn frames, load frames excluded)",
            "  fps: " + f(sum.fps, 1) + "   wall fps (all frames): " + f(sum.wallFps, 1) +
                "   drawn frames: " + sum.drawn,
            "  frame interval ms: avg " + f(sum.intAvg) + "  p95 " + f(sum.intP95) + "  max " + f(sum.intMax),
            "  JS in Graphics._onTick ms: avg " + f(sum.jsAvg) + "  p95 " + f(sum.jsP95) + "  max " + f(sum.jsMax),
            "  outside JS ms: avg " + f(sum.outAvg) + "  p95 " + f(sum.outP95) + "  max " + f(sum.outMax) +
                "   (other rAF loops: " + f(sum.rafMs, 3) + " ms/frame)",
            "  interval histogram: <=17ms " + pc(sum.hist[0]) + "  17-34ms " + pc(sum.hist[1]) +
                "  34-50ms " + pc(sum.hist[2]) + "  >50ms " + pc(sum.hist[3]),
            "  load frames excluded (scene change, map load, report): " + sum.loadN +
                ", " + f(sum.loadMs, 1) + " ms in total",
            "  attributed hook ms/frame: " + f(sum.hookMs, 3) +
                "   navigator.getGamepads: " + f(sum.padCalls) + " calls/frame, " + f(sum.padMs, 3) + " ms/frame",
            "  profiler overhead: " + f(sum.overheadMs, 5) + " ms/call, about " +
                f(sum.callsPerFrame * sum.overheadMs, 3) + " ms/frame over " + f(sum.callsPerFrame, 1) + " calls/frame",
            "  top 10 by overhead-adjusted ms/frame:"
        ];
        rows.slice().sort((a, b) => b.adj - a.adj).slice(0, 10).forEach((r, i) => {
            out.push("    " + pad(i + 1, 2, true) + ". " + r.plugin + " " + r.hook + "  " + f(r.adj, 3) +
                " ms  (avg " + f(r.avg, 3) + ", " + f(r.calls) + " calls/frame)");
        });
        return out;
    }

    function formatTable(rows, reason, wallMs, sum) {
        const head = ["plugin", "hook", "avg ms/frame", "adj ms/frame", "p95 ms", "max ms", "calls/frame"];
        const body = rows.map(r => [r.plugin, r.hook, r.avg.toFixed(3), r.adj.toFixed(3), r.p95.toFixed(3),
            r.max.toFixed(3), r.calls.toFixed(2)]);
        const widths = head.map((h, i) => Math.max(h.length, ...body.map(b => b[i].length)));
        const line = cells => cells.map((c, i) => pad(c, widths[i], i >= 2)).join("  ");
        let stamp = "";
        try { stamp = new Date().toISOString(); } catch (e) { /* no clock */ }
        const out = [
            "=".repeat(60),
            "HookProfiler " + stamp + "  reason: " + reason + "  frames: " + frames +
                "  wall: " + (wallMs / 1000).toFixed(1) + " s"
        ];
        formatSummary(rows, sum || frameSummary(rows, wallMs)).forEach(l => out.push(l));
        out.push("", line(head), widths.map(w => "-".repeat(w)).join("  "));
        body.forEach(b => out.push(line(b)));
        return out.join("\n") + "\n\n";
    }

    function nodeRequire(mod) {
        if (typeof require === "function") {
            try { return require(mod); } catch (e) { /* not available */ }
        }
        return null;
    }

    // Same folder ForceConsole.js writes debug-log.txt into.
    function logPath() {
        const path = nodeRequire("path");
        if (!path) return null;
        let base = "";
        try {
            if (typeof process !== "undefined" && process.mainModule) base = path.dirname(process.mainModule.filename);
        } catch (e) { /* fall through */ }
        if (!base) {
            try { if (typeof process !== "undefined" && process.cwd) base = process.cwd(); } catch (e) { /* none */ }
        }
        return path.join(base, LOG_FILE);
    }

    function writeLog(text) {
        const fs = nodeRequire("fs");
        const file = fs ? logPath() : null;
        if (!fs || !file) return null;
        try { fs.appendFileSync(file, text, "utf8"); return file; }
        catch (e) { console.warn("[HookProfiler] could not write " + file, e); return null; }
    }

    function resetWindow() {
        frames = 0;
        for (const s of stats) {
            s.total = 0; s.calls = 0; s.max = 0; s.frameAcc = 0;
            s.ringLen = 0; s.ringPos = 0;
        }
        resetFrameTiming();
        windowStart = perf.now();
    }

    function dump(reason) {
        if (!ON) { notice("notActive"); return null; }
        // Writing the report is work of its own: that frame is left out.
        markLoad();
        const wallMs = perf.now() - windowStart;
        const rows = buildRows();
        const sum = frameSummary(rows, wallMs);
        const text = formatTable(rows, reason || "manual", wallMs, sum);
        const file = writeLog(text);
        try {
            console.log("[HookProfiler]\n" + formatSummary(rows, sum).join("\n"));
            if (typeof console.table === "function") {
                console.table(rows.map(r => ({
                    plugin: r.plugin, hook: r.hook,
                    "avg ms/frame": +r.avg.toFixed(3), "adj ms/frame": +r.adj.toFixed(3),
                    "p95 ms": +r.p95.toFixed(3),
                    "max ms": +r.max.toFixed(3), "calls/frame": +r.calls.toFixed(2)
                })));
            }
        } catch (e) { /* the file still has it */ }
        notice(file ? "dumped" : "dumpedConsole", { frames, file: LOG_FILE });
        resetWindow();
        rows.summary = sum;
        return rows;
    }

    //=========================================================================
    // Install
    //=========================================================================
    if (ON) {
        overheadMs = calibrate();
        const protos = [
            ["Scene_Base", "update"], ["Scene_Map", "update"], ["Game_Map", "update"],
            ["Game_Event", "update"], ["Game_Player", "update"], ["Game_CharacterBase", "update"],
            ["Spriteset_Map", "update"], ["Sprite_Character", "update"],
            ["Scene_Map", "start"], ["Scene_Map", "onMapLoaded"], ["Game_Player", "performTransfer"]
        ];
        protos.forEach(([name, method]) => {
            const ctor = window[name];
            if (ctor && ctor.prototype) watch(ctor.prototype, name, method);
        });
        // Windows: only where the class has the method of its own, so an
        // inherited update is never metered twice.
        [["Window", "update"], ["Window_Base", "update"]].forEach(([name, method]) => {
            const ctor = window[name];
            if (ctor && ctor.prototype && Object.prototype.hasOwnProperty.call(ctor.prototype, method)) {
                watch(ctor.prototype, name, method);
            }
        });
        if (typeof SceneManager !== "undefined") {
            watch(SceneManager, "SceneManager", "updateMain");
            watch(SceneManager, "SceneManager", "renderScene");
            ["updateInputData", "updateEffekseer", "changeScene"].forEach(m => {
                if (typeof SceneManager[m] === "function") watch(SceneManager, "SceneManager", m);
            });
        }
        if (window.Input) {
            watch(window.Input, "Input", "update");
            watch(window.Input, "Input", "_pollGamepads");
        }
        if (window.TouchInput) watch(window.TouchInput, "TouchInput", "update");
        if (typeof Graphics !== "undefined") {
            watch(Graphics, "Graphics", "_onTick", "render");
        }
        watchGamepads();
        watchAnimationFrames();
        windowStart = perf.now();

        if (typeof document !== "undefined" && document.addEventListener) {
            document.addEventListener("keydown", (event) => {
                if (event.ctrlKey && !event.altKey && event.keyCode === DUMP_KEY) dump("Ctrl+F8");
            });
        }
    }

    //=========================================================================
    // Options entry (Experimental tab). GameOptions loads after this plugin,
    // so the entry is registered once the boot scene starts.
    //=========================================================================
    function registerOption() {
        const GO = window.GameOptions;
        if (!GO || typeof GO.registerOption !== "function") return;
        GO.registerOption(
            OPTION_SYMBOL,
            () => tr("option.label"),
            () => readFlag(),
            (value) => { if (value) api.enable(); else api.disable(); },
            "experimental",
            "boolean"
        );
        if (typeof GO.registerInspectExtra === "function") {
            GO.registerInspectExtra(OPTION_SYMBOL, () =>
                `<div class="inspect-bullet-item">${tr("option.desc")}</div>` +
                `<div class="inspect-bullet-item opt-note">${tr("option.restart")}</div>`);
        }
    }

    if (typeof Scene_Boot !== "undefined" && Scene_Boot.prototype) {
        const _Scene_Boot_start = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function () {
            try { registerOption(); } catch (e) { console.warn("[HookProfiler] option", e); }
            return _Scene_Boot_start.apply(this, arguments);
        };
    }

    const api = {
        enable() { writeFlag(true); notice(ON ? "alreadyOn" : "enabled"); return true; },
        disable() { writeFlag(false); notice(ON ? "disabled" : "alreadyOff"); return false; },
        dump() { return dump("manual"); },
        isOn() { return ON; },
        // For the tests: the meter's own state.
        _stats: stats,
        _closeFrame: closeFrame,
        _formatTable: formatTable,
        _pluginLabel: pluginLabel,
        _frameSummary() { return frameSummary(buildRows(), perf.now() - windowStart); },
        _overhead() { return overheadMs; },
        _setOverhead(ms) { overheadMs = Math.max(0, Number(ms) || 0); }
    };
    window.HookProfiler = api;
})();
