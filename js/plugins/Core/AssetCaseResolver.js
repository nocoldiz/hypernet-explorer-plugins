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
 * The engine's single "is this build encrypted" flag is not trusted either.
 * A build can end up holding "<name>.ogg_" while data/System.json says the audio
 * is plain, or the other way round, and then every affected file fails to load.
 * Each url is therefore checked on disk: whichever of "<name>.ogg" and
 * "<name>.ogg_" is really there is the one requested, and that same answer
 * decides whether the bytes are decrypted on the way in.
 *
 * Finally, a sound that cannot be loaded no longer stops the game. Stock
 * AudioManager.checkErrors throws a LoadError for any errored buffer, which puts
 * up the modal "Failed to load / Retry" screen - during a battle that is a
 * softlock, because retrying a file that is not there never succeeds. The
 * errored buffer is dropped and reported to the console instead, so the fight
 * carries on in silence.
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

    // Whether the file behind an already resolved url is the encrypted twin.
    // true: only "<name>.ext_" is on disk. false: "<name>.ext" is on disk.
    // null: neither, so the engine's own flag is as good an answer as any.
    const twins = Object.create(null);

    function isEncrypted(url) {
        const cached = twins[url];
        if (cached !== undefined) {
            return cached;
        }
        const rel = url.split("/").map(decode).join("/");
        const full = nodePath.join(gameRoot, rel);
        let answer = null;
        try {
            if (fs.existsSync(full)) {
                answer = false;
            } else if (fs.existsSync(full + "_")) {
                answer = true;
            }
        } catch (e) {
            answer = null;
        }
        twins[url] = answer;
        return answer;
    }

    // Every bitmap load funnels through here, whichever way it was requested:
    // ImageManager.loadBitmap, loadBitmapFromUrl or a bare Bitmap.load. The
    // body is the stock one with the global flag swapped for the disk answer.
    Bitmap.prototype._startLoading = function() {
        this._url = resolve(this._url);
        const found = isEncrypted(this._url);
        this._encrypted = found === null ? Utils.hasEncryptedImages() : found;
        this._image = new Image();
        this._image.onload = this._onLoad.bind(this);
        this._image.onerror = this._onError.bind(this);
        this._destroyCanvas();
        this._loadingState = "loading";
        if (this._encrypted) {
            this._startDecrypting();
        } else {
            this._image.src = this._url;
            if (this._image.width > 0) {
                this._image.onload = null;
                this._onLoad();
            }
        }
    };

    const bitmapOnLoad = Bitmap.prototype._onLoad;
    Bitmap.prototype._onLoad = function() {
        if (this._encrypted && !Utils.hasEncryptedImages()) {
            URL.revokeObjectURL(this._image.src);
        }
        bitmapOnLoad.call(this);
    };

    // WebAudio appends the "_" of an encrypted build here, so correct the url
    // just before that rather than after, and answer from disk while we are at
    // it: a build whose flag disagrees with its files loads either way.
    WebAudio.prototype._realUrl = function() {
        this._url = resolve(this._url);
        const found = isEncrypted(this._url);
        this._encrypted = found === null ? Utils.hasEncryptedAudio() : found;
        return this._url + (this._encrypted ? "_" : "");
    };

    WebAudio.prototype._readableBuffer = function() {
        if (this._encrypted) {
            return Utils.decryptArrayBuffer(this._data.buffer);
        }
        return this._data.buffer;
    };

    // A sound that will not load must not stop the game. Stock checkErrors
    // throws a LoadError, which is the modal Retry screen, which in a battle is
    // a softlock because the file is not going to appear on a retry.
    const reported = Object.create(null);

    AudioManager.checkErrors = function() {
        const drop = buffer => {
            if (!buffer || !buffer.isError()) {
                return false;
            }
            if (!reported[buffer.url]) {
                reported[buffer.url] = true;
                console.error(
                    "[AssetCaseResolver] " + buffer.url +
                        " could not be loaded; playing nothing instead."
                );
            }
            try {
                buffer.stop();
            } catch (e) {
                // A buffer that never loaded has nothing to stop.
            }
            return true;
        };
        for (const key of ["_bgmBuffer", "_bgsBuffer", "_meBuffer"]) {
            if (drop(this[key])) {
                this[key] = null;
            }
        }
        this._seBuffers = this._seBuffers.filter(buffer => !drop(buffer));
        this._staticBuffers = this._staticBuffers.filter(buffer => !drop(buffer));
    };

    window.AssetCaseResolver = { resolve: resolve, isEncrypted: isEncrypted };
})();
