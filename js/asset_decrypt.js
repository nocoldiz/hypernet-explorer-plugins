//=============================================================================
// asset_decrypt.js
//=============================================================================
/*
 * Runtime asset decryption bridge.
 *
 * The engine decrypts, on its own, everything that goes through Bitmap
 * (ImageManager) and WebAudio (AudioManager); see Utils.decryptArrayBuffer in
 * js/rmmz_core.js. This file covers the loading paths the engine knows nothing
 * about, which would otherwise break once img/ and audio/ are encrypted:
 *
 *   - url('img/...') inside linked stylesheets and inside injected <style> tags
 *   - inline styles and <img src="..."> produced through innerHTML
 *   - HTMLImageElement.src / HTMLMediaElement.src assignments
 *   - three.js texture loaders, which end up on HTMLImageElement.src
 *   - fs.readdir / existsSync / statSync / readFileSync scans of img/ and
 *     audio/, which filter on the plain file extension
 *
 * Encrypted assets are read straight off the disk, decrypted in memory and
 * handed to the page as blob: URLs, so no plaintext asset is ever written out.
 *
 * Must be loaded before js/main.js. This is the template, and the KEY below is
 * the placeholder tools/build/install_decrypt_shim.js replaces with the real
 * key as it copies the file into a build; on an unencrypted build nothing
 * resolves and every reference is left untouched.
 */

(function () {
    "use strict";

    var KEY = "45ac47c8df5aa9130d30c33fc966e8c2b3bb9fda4f2e6c1887c57404051e387e";

    var HEADER = [0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0];
    var MIME = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        ogg: "audio/ogg",
        m4a: "audio/mp4"
    };
    var ENCRYPTED_EXT = /\.(png|jpe?g|ogg|m4a)_$/i;
    var PLAIN_EXT = /\.(png|jpe?g|ogg|m4a)$/i;
    var ASSET_TAIL =
        "((?:img|audio)/[^\"'()<>\\\\?#]+?\\.(?:png|jpe?g|ogg|m4a))(?![A-Za-z0-9_])";
    var ASSET_URL_RE = new RegExp(
        "(?<![A-Za-z0-9_.\\-/])((?:\\.\\./)*)" + ASSET_TAIL,
        "gi"
    );

    // The same reference written out in full. UIPanel.assetUrl and CCArt.url
    // resolve every path against document.baseURI before it goes into a custom
    // property (a relative url() inside one resolves against the STYLESHEET
    // that reads it back, not against the page that wrote it), so every bust,
    // sprite, portrait and icon in the character creation wizard arrives here
    // already absolute. ASSET_URL_RE cannot see those: the "/" in front of
    // "img/" is exactly what its lookbehind refuses, so the whole wizard
    // painted nothing at all in an encrypted build.
    //
    // Only this document's own folder counts. A url under someone else's
    // origin names a file that is not on this disk and is left alone.
    function escapeRe(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    var ABS_URL_RES = (function () {
        var out = [];
        var base;
        try {
            base = String(document.baseURI || "").replace(/[^/]*$/, "");
        } catch (e) {
            base = "";
        }
        if (!base) {
            return out;
        }
        var spellings = [base];
        // UIPanel.escapeCssUrl writes the href unquoted, percent encoding what
        // an unquoted url() cannot carry. A game root holding a space or a
        // bracket therefore arrives in that form instead.
        var escaped = base.replace(/[()'"\s]/g, function (c) {
            return "%" + c.charCodeAt(0).toString(16).toUpperCase();
        });
        if (escaped !== base) {
            spellings.push(escaped);
        }
        for (var i = 0; i < spellings.length; i++) {
            out.push(new RegExp(escapeRe(spellings[i]) + ASSET_TAIL, "gi"));
        }
        return out;
    })();

    var keyBytes = [];
    for (var k = 0; k < 16; k++) {
        keyBytes.push(parseInt(KEY.substr(k * 2, 2), 16));
    }

    //-------------------------------------------------------------------------
    // Node bindings (NW.js). Captured before fs is patched further down.
    //-------------------------------------------------------------------------

    var nodeFs = null;
    var nodePath = null;
    var gameRoot = "";
    try {
        if (typeof require === "function" && typeof process === "object" && process.mainModule) {
            nodeFs = require("fs");
            nodePath = require("path");
            gameRoot = nodePath.dirname(process.mainModule.filename);
        }
    } catch (e) {
        nodeFs = null;
    }
    var rawReadFileSync = nodeFs ? nodeFs.readFileSync : null;

    //-------------------------------------------------------------------------
    // Decryption
    //-------------------------------------------------------------------------

    function decrypt(bytes) {
        if (!bytes || bytes.length < 16) {
            return null;
        }
        for (var i = 0; i < 16; i++) {
            if (bytes[i] !== HEADER[i]) {
                return null;
            }
        }
        var out = new Uint8Array(bytes.length - 16);
        out.set(bytes.subarray ? bytes.subarray(16) : bytes.slice(16));
        var n = Math.min(16, out.length);
        for (var j = 0; j < n; j++) {
            out[j] = out[j] ^ keyBytes[j];
        }
        return out;
    }

    function readRawSync(rel) {
        if (nodeFs) {
            var candidates = [rel];
            try {
                var decoded = decodeURIComponent(rel);
                if (decoded !== rel) {
                    candidates.push(decoded);
                }
            } catch (e) {
                // malformed escape, keep the raw form only
            }
            for (var i = 0; i < candidates.length; i++) {
                try {
                    return rawReadFileSync(nodePath.join(gameRoot, candidates[i]));
                } catch (e) {
                    // next candidate
                }
            }
            return null;
        }
        var xhr = new XMLHttpRequest();
        try {
            xhr.open("GET", rel, false);
            xhr.overrideMimeType("text/plain; charset=x-user-defined");
            xhr.send();
        } catch (e) {
            return null;
        }
        if (xhr.status >= 400) {
            return null;
        }
        var text = xhr.responseText;
        var bytes = new Uint8Array(text.length);
        for (var c = 0; c < text.length; c++) {
            bytes[c] = text.charCodeAt(c) & 0xff;
        }
        return bytes;
    }

    //-------------------------------------------------------------------------
    // Path helpers
    //-------------------------------------------------------------------------

    function normalize(path) {
        var parts = path.split("/");
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (!part || part === ".") {
                continue;
            }
            if (part === "..") {
                if (out.length === 0) {
                    return null;
                }
                out.pop();
            } else {
                out.push(part);
            }
        }
        return out.join("/");
    }

    //-------------------------------------------------------------------------
    // Blob URL cache
    //-------------------------------------------------------------------------

    var urlCache = Object.create(null);

    function blobUrlFor(rel) {
        if (rel in urlCache) {
            return urlCache[rel];
        }
        var match = typeof rel === "string" ? rel.match(PLAIN_EXT) : null;
        if (!match) {
            return null;
        }
        var url = null;
        var data = decrypt(readRawSync(rel + "_"));
        if (data) {
            var type = MIME[match[1].toLowerCase()] || "application/octet-stream";
            url = URL.createObjectURL(new Blob([data], { type: type }));
        }
        urlCache[rel] = url;
        return url;
    }

    //-------------------------------------------------------------------------
    // Text rewriting
    //-------------------------------------------------------------------------

    function mayContainAsset(text) {
        return (
            typeof text === "string" &&
            (text.indexOf("img/") >= 0 || text.indexOf("audio/") >= 0)
        );
    }

    // baseDir is the directory the text is relative to, as a path from the game
    // root ("" for the document itself, "css" for css/theme.css). A reference
    // that does not resolve to an encrypted file is left exactly as it was, so
    // links that are already dead stay dead instead of silently coming alive.
    function rewrite(text, baseDir) {
        if (!mayContainAsset(text)) {
            return text;
        }
        // An absolute reference already names its file from the game root, so
        // baseDir has nothing to say about it.
        for (var i = 0; i < ABS_URL_RES.length; i++) {
            text = text.replace(ABS_URL_RES[i], function (all, rel) {
                var resolved = normalize(rel);
                if (!resolved) {
                    return all;
                }
                return blobUrlFor(resolved) || all;
            });
        }
        return text.replace(ASSET_URL_RE, function (all, dots, rel) {
            var resolved = normalize((baseDir ? baseDir + "/" : "") + dots + rel);
            if (!resolved) {
                return all;
            }
            return blobUrlFor(resolved) || all;
        });
    }

    function rewriteDoc(text) {
        return rewrite(text, "");
    }

    //-------------------------------------------------------------------------
    // DOM patches
    //-------------------------------------------------------------------------

    function patchSetter(proto, prop, transform) {
        var desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (!desc || !desc.set) {
            return;
        }
        var setter = desc.set;
        Object.defineProperty(proto, prop, {
            get: desc.get,
            set: function (value) {
                setter.call(this, transform.call(this, value));
            },
            configurable: true,
            enumerable: desc.enumerable
        });
    }

    function asDocUrl(value) {
        return typeof value === "string" ? rewriteDoc(value) : value;
    }

    patchSetter(Element.prototype, "innerHTML", asDocUrl);
    patchSetter(Element.prototype, "outerHTML", asDocUrl);
    patchSetter(HTMLImageElement.prototype, "src", asDocUrl);
    patchSetter(HTMLMediaElement.prototype, "src", asDocUrl);
    if (window.HTMLSourceElement) {
        patchSetter(HTMLSourceElement.prototype, "src", asDocUrl);
    }

    var insertAdjacentHTML = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function (position, html) {
        return insertAdjacentHTML.call(this, position, asDocUrl(html));
    };

    var setAttribute = Element.prototype.setAttribute;
    var URL_ATTRS = { src: 1, style: 1, srcset: 1, poster: 1, background: 1 };
    Element.prototype.setAttribute = function (name, value) {
        if (URL_ATTRS[name] === 1) {
            value = asDocUrl(value);
        }
        return setAttribute.call(this, name, value);
    };

    // <style> content, whichever way it is filled in.
    patchSetter(Node.prototype, "textContent", function (value) {
        return this.tagName === "STYLE" ? asDocUrl(value) : value;
    });

    var appendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function (node) {
        if (this.tagName === "STYLE" && node && node.nodeType === 3) {
            node.data = asDocUrl(node.data);
        }
        return appendChild.call(this, node);
    };

    // Inline and scripted style declarations.
    var STYLE_PROPS = [
        "cssText",
        "background",
        "backgroundImage",
        "borderImage",
        "borderImageSource",
        "listStyleImage",
        "maskImage",
        "webkitMaskImage",
        "content",
        "cursor",
        "src"
    ];

    // Only cssText is a real accessor on CSSStyleDeclaration.prototype. Every
    // camel-cased CSS property is served by a named-property interceptor on the
    // declaration itself, so there is no descriptor to wrap and patchSetter
    // walks away from all ten of the others: "el.style.backgroundImage =
    // url('img/x.png')" reached the engine untouched and asked for a file that
    // no longer exists under that name. An accessor defined here is consulted
    // ahead of the interceptor (the interceptor stands down for a name the
    // prototype chain already answers), so the property behaves exactly as it
    // did, through the same setProperty/getPropertyValue pair Blink itself
    // uses, with the url rewritten on the way past.
    var cssPropertyName = function (prop) {
        var name = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
        return name.indexOf("webkit-") === 0 ? "-" + name : name;
    };

    var patchStyleProp = function (prop) {
        var desc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
        if (desc && desc.set) {
            patchSetter(CSSStyleDeclaration.prototype, prop, asDocUrl);
            return;
        }
        var css = cssPropertyName(prop);
        Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
            configurable: true,
            enumerable: false,
            get: function () {
                return this.getPropertyValue(css);
            },
            set: function (value) {
                var text = asDocUrl(value === null || value === undefined ? "" : String(value));
                var priority = "";
                // setProperty takes the priority apart from the value, where
                // the camel-cased setter takes it inside one string.
                var important = /^([\s\S]*?)\s*!\s*important\s*$/i.exec(text);
                if (important) {
                    text = important[1];
                    priority = "important";
                }
                this.setProperty(css, text, priority);
            }
        });
    };

    for (var s = 0; s < STYLE_PROPS.length; s++) {
        patchStyleProp(STYLE_PROPS[s]);
    }

    var setProperty = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
        return setProperty.call(this, name, asDocUrl(value), priority);
    };

    var insertRule = CSSStyleSheet.prototype.insertRule;
    CSSStyleSheet.prototype.insertRule = function (rule, index) {
        return insertRule.call(this, asDocUrl(rule), index);
    };

    //-------------------------------------------------------------------------
    // Linked stylesheets, which resolve their urls against their own location
    //-------------------------------------------------------------------------

    var scannedSheets = new WeakSet();

    function sheetBaseDir(sheet) {
        if (!sheet.href) {
            return "";
        }
        var base = document.baseURI.replace(/[^/]*$/, "");
        if (sheet.href.indexOf(base) !== 0) {
            return null;
        }
        return sheet.href.slice(base.length).replace(/[^/]*$/, "").replace(/\/$/, "");
    }

    function scanRules(rules, baseDir) {
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (rule.cssRules) {
                scanRules(rule.cssRules, baseDir);
            } else if (rule.style) {
                var text = rule.style.cssText;
                if (mayContainAsset(text)) {
                    var rewritten = rewrite(text, baseDir);
                    if (rewritten !== text) {
                        rule.style.cssText = rewritten;
                    }
                }
            }
        }
    }

    function scanStyleSheets(doc) {
        var sheets = doc.styleSheets;
        for (var i = 0; i < sheets.length; i++) {
            var sheet = sheets[i];
            if (scannedSheets.has(sheet)) {
                continue;
            }
            var baseDir = null;
            try {
                baseDir = sheetBaseDir(sheet);
                if (baseDir === null) {
                    continue;
                }
                scanRules(sheet.cssRules, baseDir);
            } catch (e) {
                continue;
            }
            scannedSheets.add(sheet);
        }
    }

    function scanThisDocument() {
        scanStyleSheets(document);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scanThisDocument);
    } else {
        scanThisDocument();
    }
    window.addEventListener("load", scanThisDocument);

    // A sheet can arrive long past window load: the theme is swapped from
    // inside the running game (GameOptions.applyTheme), and every DOM menu
    // brings its own <style> with it. Scanning only at load left those rules
    // pointing at the plain name the encryption pass had renamed, which is a
    // CSS-drawn IconSet glyph painting nothing. A sheet is scanned once, so a
    // rescan costs only what is new.
    var scanQueued = false;
    function queueScan() {
        if (scanQueued) {
            return;
        }
        scanQueued = true;
        var run = function () {
            scanQueued = false;
            scanThisDocument();
        };
        // A <link> that has only just been added has no cssRules yet, so the
        // scan waits for the frame the browser parses it in.
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(run);
        } else {
            setTimeout(run, 0);
        }
    }

    if (typeof MutationObserver === "function" && document.documentElement) {
        new MutationObserver(function (records) {
            for (var r = 0; r < records.length; r++) {
                var added = records[r].addedNodes;
                for (var n = 0; added && n < added.length; n++) {
                    var node = added[n];
                    var tag = node && node.tagName;
                    if (tag !== "LINK" && tag !== "STYLE") {
                        continue;
                    }
                    // A linked sheet is not readable until it has loaded.
                    if (tag === "LINK" && node.addEventListener) {
                        node.addEventListener("load", queueScan);
                    }
                    queueScan();
                    return;
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    //-------------------------------------------------------------------------
    // fs, for the plugins that scan img/ and audio/ directly
    //-------------------------------------------------------------------------

    if (nodeFs) {
        var unmask = function (name) {
            return typeof name === "string" && ENCRYPTED_EXT.test(name)
                ? name.slice(0, -1)
                : name;
        };

        var unmaskEntries = function (entries) {
            if (!Array.isArray(entries)) {
                return entries;
            }
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                if (typeof entry === "string") {
                    entries[i] = unmask(entry);
                } else if (entry && typeof entry.name === "string") {
                    try {
                        entry.name = unmask(entry.name);
                    } catch (e) {
                        // Dirent name is not writable on this runtime
                    }
                }
            }
            return entries;
        };

        // An asset path with no plain file on disk is retried with the "_"
        // suffix, so callers see the world as it was before encryption.
        var encryptedTwin = function (target) {
            if (typeof target !== "string" || !PLAIN_EXT.test(target)) {
                return null;
            }
            return target + "_";
        };

        var origReaddirSync = nodeFs.readdirSync;
        nodeFs.readdirSync = function () {
            return unmaskEntries(origReaddirSync.apply(this, arguments));
        };

        var origReaddir = nodeFs.readdir;
        nodeFs.readdir = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args[args.length - 1];
            if (typeof callback === "function") {
                args[args.length - 1] = function (err, entries) {
                    callback(err, err ? entries : unmaskEntries(entries));
                };
            }
            return origReaddir.apply(this, args);
        };

        var origExistsSync = nodeFs.existsSync;
        nodeFs.existsSync = function (target) {
            if (origExistsSync.apply(this, arguments)) {
                return true;
            }
            var twin = encryptedTwin(target);
            return twin ? origExistsSync.call(this, twin) : false;
        };

        var origStatSync = nodeFs.statSync;
        nodeFs.statSync = function (target) {
            try {
                return origStatSync.apply(this, arguments);
            } catch (e) {
                var twin = encryptedTwin(target);
                if (!twin) {
                    throw e;
                }
                return origStatSync.call(this, twin);
            }
        };

        var origReadFileSync = nodeFs.readFileSync;
        nodeFs.readFileSync = function (target) {
            try {
                return origReadFileSync.apply(this, arguments);
            } catch (e) {
                var twin = encryptedTwin(target);
                if (!twin) {
                    throw e;
                }
                var data = decrypt(origReadFileSync.call(this, twin));
                if (!data) {
                    throw e;
                }
                return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
            }
        };

        if (nodeFs.promises) {
            var promises = nodeFs.promises;

            var origPromiseReaddir = promises.readdir;
            promises.readdir = function () {
                return origPromiseReaddir.apply(this, arguments).then(unmaskEntries);
            };

            var origPromiseStat = promises.stat;
            promises.stat = function (target) {
                var self = this;
                var args = arguments;
                return origPromiseStat.apply(self, args).catch(function (err) {
                    var twin = encryptedTwin(target);
                    if (!twin) {
                        throw err;
                    }
                    return origPromiseStat.call(self, twin);
                });
            };

            var origPromiseReadFile = promises.readFile;
            promises.readFile = function (target) {
                var self = this;
                var args = arguments;
                return origPromiseReadFile.apply(self, args).catch(function (err) {
                    var twin = encryptedTwin(target);
                    if (!twin) {
                        throw err;
                    }
                    return origPromiseReadFile.call(self, twin).then(function (raw) {
                        var data = decrypt(raw);
                        if (!data) {
                            throw err;
                        }
                        return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
                    });
                });
            };
        }
    }

    //-------------------------------------------------------------------------

    window.AssetDecrypt = {
        url: blobUrlFor,
        rewrite: rewriteDoc,
        rescanStyleSheets: scanThisDocument
    };
})();
