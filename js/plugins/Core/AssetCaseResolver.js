/*:
 * @target MZ
 * @plugindesc Resolves img/ and audio/ paths against the real on-disk spelling, so a case-only rename cannot break the game on Linux.
 * @author Omni-Lex
 *
 * @help
 * Windows and macOS do not care how an asset path is capitalised; Linux does.
 * That difference hides a whole class of breakage: rename img/system/Iconset.png
 * to img/system/IconSet.png in the project, and the game keeps working
 * everywhere it is developed, then dies on a Linux player's machine with
 *
 *     Failed to load: img/system/IconSet.png
 *
 * The rename does not have to be deliberate to bite, either. A build folder that
 * is written on Windows never picks a case-only rename up at all: NTFS keeps the
 * existing directory entry's spelling when a file is overwritten, so the
 * encryptor writes the new bytes into the *old* name and the mismatch ships.
 *
 * This plugin closes the gap at the point where the engine turns a url into a
 * request. Every path under img/ or audio/ is checked against the directory it
 * lives in, one segment at a time, and if the only difference is capitalisation
 * the real spelling is used instead. Anything that already resolves is passed
 * through untouched, so a path that is genuinely dead stays dead rather than
 * silently finding some other file.
 *
 * A corrected path is reported once, with the spelling found on disk, because
 * the mismatch is still a bug worth fixing in the project itself - this plugin
 * keeps it from being a crash while it is fixed.
 *
 * Encrypted builds are handled: assets on disk are "<name>.png_", whether or not
 * js/asset_decrypt.js has already stripped that suffix on the way out of
 * readdir.
 *
 * Load this first. It needs no parameters, and it does nothing in browser mode,
 * where there is no way to list a directory - there, paths must already match.
 *
 * Not covered: images that reach the page through CSS url(), <img src> or a
 * three.js texture loader in an encrypted build. Those are resolved inside
 * js/asset_decrypt.js, which is installed by the build and not reachable from a
 * plugin; the same lookup belongs in its readRawSync() if that path needs it.
 */

(() => {
    "use strict";

    // Node bindings, found the same way js/asset_decrypt.js finds them.
    let fs = null;
    let nodePath = null;
    let gameRoot = "";
    try {
        if (typeof require === "function" && typeof process === "object" && process.mainModule) {
            fs = require("fs");
            nodePath = require("path");
            gameRoot = nodePath.dirname(process.mainModule.filename);
        }
    } catch (e) {
        fs = null;
    }
    if (!fs) {
        // Browser mode: no directory listings, so nothing can be resolved.
        return;
    }

    const ASSET_PATH = /^(?:img|audio)\//;

    // Directory listings, keyed by path from the game root. A directory that
    // cannot be read is remembered as null so it is not stat-ed again.
    const listings = Object.create(null);

    function listing(dir) {
        const cached = listings[dir];
        if (cached !== undefined) {
            return cached;
        }
        let map = null;
        try {
            map = Object.create(null);
            for (const entry of fs.readdirSync(nodePath.join(gameRoot, dir))) {
                // "<name>.png_" in an encrypted build, already unmasked to
                // "<name>.png" if asset_decrypt.js got to readdir first.
                const name = entry.endsWith("_") ? entry.slice(0, -1) : entry;
                const key = name.toLowerCase();
                // First spelling wins, so a directory that really does hold two
                // names differing only in case keeps resolving to one of them
                // rather than flip-flopping.
                if (!(key in map)) {
                    map[key] = name;
                }
            }
        } catch (e) {
            map = null;
        }
        listings[dir] = map;
        return map;
    }

    function decode(segment) {
        try {
            return decodeURIComponent(segment);
        } catch (e) {
            // Malformed escape: compare the raw form instead.
            return segment;
        }
    }

    function exists(rel) {
        const full = nodePath.join(gameRoot, rel);
        try {
            // The encrypted twin counts: the engine asks for "x.png" and then
            // fetches "x.png_" itself.
            return fs.existsSync(full) || fs.existsSync(full + "_");
        } catch (e) {
            return false;
        }
    }

    const resolutions = Object.create(null);

    function resolve(url) {
        if (typeof url !== "string" || !ASSET_PATH.test(url)) {
            return url;
        }
        const cached = resolutions[url];
        if (cached !== undefined) {
            return cached;
        }

        let out = url;
        const decoded = url.split("/").map(decode);
        if (!exists(decoded.join("/"))) {
            // Walk the path, correcting whatever segment is only mis-cased.
            const real = [];
            let ok = true;
            for (const segment of decoded) {
                const here = real.join("/");
                const map = listing(here);
                const match = map ? map[segment.toLowerCase()] : undefined;
                if (match === undefined) {
                    ok = false;
                    break;
                }
                real.push(match);
            }
            if (ok && real.join("/") !== decoded.join("/")) {
                // Re-encode the way Utils.encodeURI does, keeping separators.
                out = real.map(encodeURIComponent).join("/");
                console.warn(
                    "[AssetCaseResolver] " + url + " does not exist; loading " +
                        real.join("/") + " instead. Fix the spelling in the project."
                );
            }
        }

        resolutions[url] = out;
        return out;
    }

    // Every bitmap load funnels through here, whichever way it was requested:
    // ImageManager.loadBitmap, loadBitmapFromUrl or a bare Bitmap.load.
    const bitmapStartLoading = Bitmap.prototype._startLoading;
    Bitmap.prototype._startLoading = function() {
        this._url = resolve(this._url);
        bitmapStartLoading.call(this);
    };

    // WebAudio appends the "_" of an encrypted build here, so correct the url
    // just before that rather than after.
    const audioRealUrl = WebAudio.prototype._realUrl;
    WebAudio.prototype._realUrl = function() {
        this._url = resolve(this._url);
        return audioRealUrl.call(this);
    };

    window.AssetCaseResolver = { resolve: resolve };
})();
