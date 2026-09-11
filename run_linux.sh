#!/bin/bash
# ============================================================
# run_linux.sh - installs what the game needs on Linux, then runs it
#
# A build ships with the Windows NW.js runtime only, so on Linux this
# script sets the machine up from nothing and starts the game:
#
#   1. Node.js, if the machine has none. Fetched as the official tarball
#      into <build>/.node and used from there, so nothing is installed
#      system-wide and no sudo password is ever asked for.
#   2. The NW.js runtime for this machine, into <build>/.nwjs (about
#      120 MB, once). NW.js takes a folder holding a package.json as its
#      argument, so nothing has to be repackaged: the build folder IS
#      the app. There is no official NW.js linux-arm64 build, so on that
#      architecture (and any other non-x64 one) this falls back to
#      browser mode automatically.
#   3. The game itself: a real NW.js window where available, otherwise a
#      local static server with the system browser pointed at it.
#
#   Run:  bash run_linux.sh
#   or:   chmod +x run_linux.sh && ./run_linux.sh
#
# Overrides, all optional:
#   HX_MODE=nw|browser         how to run it (default nw where a runtime is
#                               available, browser everywhere else)
#   HX_PORT=8081                port for browser mode
#   HX_NODE_VERSION=20.18.1     pin the Node.js version fetched
#   HX_SKIP_NODE=1               do not install Node.js at all
#   HX_NW_BIN=/path/to/nw        use an NW.js runtime you already have
#   HX_NW_ARCH=x64                force an architecture
#   HX_NW_VERSION=0.48.4          pin an NW.js version
#   HX_NW_SLUG=linux-x64          pin a download slug
#   HX_NW_HOME=/path              keep runtimes somewhere else
# ============================================================

set -u

GAME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

say()  { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

die() {
    printf 'ERROR: %s\n' "$*" >&2
    if [ -t 0 ]; then
        printf '\nPress return to close.\n'
        read -r _ || true
    fi
    exit 1
}

fetch() {
    # fetch <url> <destination>
    if command -v curl >/dev/null 2>&1; then
        curl -fL --retry 3 --progress-bar -o "$2" "$1"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$2" "$1"
    else
        return 127
    fi
}

say "============================================================"
say " Hypernet Explorer - Linux setup and launcher"
say "============================================================"
say ""
say "Game folder : ${GAME_DIR}"

[ "$(uname -s)" = "Linux" ] || die "this script is for Linux. On macOS run run_mac.sh, on Windows run Game.exe."

for f in package.json index.html js/main.js; do
    [ -f "${GAME_DIR}/${f}" ] || die "${GAME_DIR} does not look like the game folder (${f} is missing)."
done

if [ ! -w "${GAME_DIR}" ]; then
    warn "the game folder is not writable, so savegames and downloads will fail."
    warn "Copy it somewhere under your home folder and run this script from there."
fi

command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 \
    || die "neither curl nor wget is available, so nothing can be downloaded."

# --- Which architecture this machine is ----------------------------------
ARCH="${HX_NW_ARCH:-}"
if [ -z "${ARCH}" ]; then
    case "$(uname -m)" in
        x86_64)  ARCH="x64" ;;
        aarch64) ARCH="arm64" ;;
        armv7l)  ARCH="armv7l" ;;
        *) ARCH="$(uname -m)" ;;
    esac
fi

say "Machine     : Linux ${ARCH}"
say ""

# --- 0. The asset case fix -------------------------------------------------
# Linux is the only platform the game runs on where "img/system/IconSet.png"
# and "img/system/Iconset.png" are two different files, so it is the only one
# where a case-only rename in the project can be fatal:
#
#     Failed to load: img/system/IconSet.png
#
# A build folder written on Windows never even sees such a rename. NTFS keeps
# the existing directory entry's spelling when a file is overwritten, so the
# encryptor puts the new bytes into the old name and the mismatch ships.
#
# js/plugins/Core/AssetCaseResolver.js resolves those paths against the real
# spelling on disk instead of renaming anything. Current builds ship it; this
# installs it into a folder built before it existed, so an old build folder
# runs here too.
PLUGIN_REL="js/plugins/Core/AssetCaseResolver.js"
PLUGINS_JS="${GAME_DIR}/js/plugins.js"

if [ ! -f "${GAME_DIR}/${PLUGIN_REL}" ] && [ -w "${GAME_DIR}/js/plugins" ]; then
    say "--- Installing the asset case fix (${PLUGIN_REL}) ---"
    mkdir -p "${GAME_DIR}/js/plugins/Core"
    cat > "${GAME_DIR}/${PLUGIN_REL}" <<'PLUGIN_EOF'
/*:
 * @target MZ
 * @plugindesc Resolves img/ and audio/ paths against the real on-disk spelling, so a case-only rename cannot break the game on Linux.
 * @author Omni-Lex
 *
 * @help
 * Fallback copy, written by run_linux.sh into a build folder that predates the
 * shipped plugin of the same name. See js/plugins/Core/AssetCaseResolver.js in
 * the project for the full account of what this is for.
 *
 * Every path under img/ or audio/ is checked against the directory it lives in,
 * one segment at a time; if the only difference is capitalisation, the real
 * spelling is used. Paths that already resolve are passed through untouched, so
 * a genuinely dead path stays dead instead of finding some other file.
 *
 * Does nothing in browser mode, where a directory cannot be listed.
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
PLUGIN_EOF
fi

# The plugin has to be listed to run, and first, so that it is in place before
# anything else asks for an image. Only touched when the entry is absent.
if [ -f "${GAME_DIR}/${PLUGIN_REL}" ] && [ -f "${PLUGINS_JS}" ] \
    && ! grep -q 'Core/AssetCaseResolver' "${PLUGINS_JS}"; then
    if [ -w "${PLUGINS_JS}" ]; then
        say "--- Registering the asset case fix in js/plugins.js ---"
        ENTRY='{"name":"Core/AssetCaseResolver","status":true,"description":"Resolves img/ and audio/ paths against the real on-disk spelling, so a case-only rename cannot break the game on Linux.","parameters":{}},'
        # Straight after the "[" that opens $plugins, and only the first one.
        if awk -v entry="${ENTRY}" '
            { print }
            !done && /^\[$/ { print entry; done = 1 }
            END { exit done ? 0 : 1 }
        ' "${PLUGINS_JS}" > "${PLUGINS_JS}.hxnew"; then
            mv "${PLUGINS_JS}.hxnew" "${PLUGINS_JS}"
        else
            rm -f "${PLUGINS_JS}.hxnew"
            warn "could not find where \$plugins opens in js/plugins.js; the asset case fix is installed but not enabled."
        fi
    else
        warn "js/plugins.js is not writable, so the asset case fix cannot be enabled."
    fi
fi

say ""

# --- 1. Node.js -----------------------------------------------------------
NODE_ARCH="${ARCH}"
NODE_HOME="${GAME_DIR}/.node"
NODE_VERSION="${HX_NODE_VERSION:-20.18.1}"
NODE_NAME="node-v${NODE_VERSION}-linux-${NODE_ARCH}"

# A private copy from an earlier run comes first, so the game folder is
# self-contained once it has been set up.
if [ -x "${NODE_HOME}/${NODE_NAME}/bin/node" ]; then
    PATH="${NODE_HOME}/${NODE_NAME}/bin:${PATH}"
    export PATH
fi

if [ "${HX_SKIP_NODE:-0}" = "1" ]; then
    say "--- Node.js: skipped (HX_SKIP_NODE=1) ---"
elif command -v node >/dev/null 2>&1; then
    say "--- Node.js: already here ($(node --version), $(command -v node)) ---"
else
    say "--- Node.js: fetching a private copy (about 40 MB, once) ---"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_NAME}.tar.gz"
    say "    ${URL}"

    TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hxnode.XXXXXX")" || die "could not make a temporary folder."
    trap 'rm -rf "${TMP_DIR}"' EXIT
    TAR="${TMP_DIR}/${NODE_NAME}.tar.gz"

    if ! fetch "${URL}" "${TAR}"; then
        rm -rf "${TMP_DIR}"
        trap - EXIT
        die "the Node.js download failed (no official build for linux-${NODE_ARCH}, or the connection dropped). Install Node.js yourself (apt/dnf/pacman, or https://nodejs.org) and run this script again, or set HX_SKIP_NODE=1 to skip browser mode's server."
    fi

    mkdir -p "${NODE_HOME}" || die "could not create ${NODE_HOME}."
    rm -rf "${NODE_HOME}/${NODE_NAME}"
    tar -xzf "${TAR}" -C "${NODE_HOME}" || die "could not unpack the Node.js archive."

    rm -rf "${TMP_DIR}"
    trap - EXIT

    [ -x "${NODE_HOME}/${NODE_NAME}/bin/node" ] || die "the Node.js archive did not contain bin/node."
    PATH="${NODE_HOME}/${NODE_NAME}/bin:${PATH}"
    export PATH
    say "    installed into ${NODE_HOME}/${NODE_NAME} ($(node --version))"
fi

say ""

# --- 2. The NW.js runtime --------------------------------------------------
# There is no official NW.js linux-arm64 (or anything but x64) build, so
# anything else is browser mode unless the caller points HX_NW_BIN at a
# runtime of their own.
DEF_VERSION="0.48.4"
DEF_SLUG="linux-x64"
NW_SUPPORTED=0
[ "${ARCH}" = "x64" ] && NW_SUPPORTED=1
[ -n "${HX_NW_BIN:-}" ] && NW_SUPPORTED=1

NW_VERSION="${HX_NW_VERSION:-$DEF_VERSION}"
NW_SLUG="${HX_NW_SLUG:-$DEF_SLUG}"
NW_NAME="nwjs-v${NW_VERSION}-${NW_SLUG}"
NW_HOME="${HX_NW_HOME:-${GAME_DIR}/.nwjs}"
NW_DIR="${NW_HOME}/${NW_NAME}"
NW_BIN="${HX_NW_BIN:-${NW_DIR}/nw}"

MODE="${HX_MODE:-nw}"
if [ "${MODE}" = "nw" ] && [ "${NW_SUPPORTED}" != "1" ]; then
    warn "no official NW.js build for linux-${ARCH}; falling back to browser mode. Set HX_NW_BIN to use a runtime you already have."
    MODE="browser"
fi

if [ "${MODE}" = "nw" ]; then
    say "--- NW.js runtime: ${NW_NAME} ---"

    if [ ! -x "${NW_BIN}" ]; then
        if [ -n "${HX_NW_BIN:-}" ]; then
            die "HX_NW_BIN is set but ${NW_BIN} is not there or is not executable."
        fi

        URL="https://dl.nwjs.io/v${NW_VERSION}/${NW_NAME}.tar.gz"
        say "    downloading (about 120 MB, once)"
        say "    ${URL}"

        TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hxnw.XXXXXX")" || die "could not make a temporary folder."
        trap 'rm -rf "${TMP_DIR}"' EXIT
        TAR="${TMP_DIR}/${NW_NAME}.tar.gz"

        fetch "${URL}" "${TAR}" \
            || die "the download failed. Check the connection, or fetch ${URL} by hand and unpack it into ${NW_DIR}."

        say ""
        say "    unpacking"
        mkdir -p "${TMP_DIR}/x" || die "could not make a temporary folder."
        tar -xzf "${TAR}" -C "${TMP_DIR}/x" || die "could not unpack the runtime archive."

        SRC_DIR_NW="$(find "${TMP_DIR}/x" -maxdepth 2 -name 'nw' -type f -print -quit)"
        [ -n "${SRC_DIR_NW}" ] || die "the archive did not contain an nw binary."
        SRC_DIR_NW="$(dirname "${SRC_DIR_NW}")"

        mkdir -p "${NW_HOME}" || die "could not create ${NW_HOME}."
        rm -rf "${NW_DIR}"
        mv "${SRC_DIR_NW}" "${NW_DIR}" || die "could not install the runtime into ${NW_DIR}."

        rm -rf "${TMP_DIR}"
        trap - EXIT
        say "    installed into ${NW_DIR}"
    else
        say "    already here"
    fi

    chmod +x "${NW_BIN}" 2>/dev/null || true

    if [ ! -x "${NW_BIN}" ]; then
        warn "${NW_BIN} is not executable, falling back to browser mode."
        MODE="browser"
    fi
fi

say ""

# --- 3. The game -----------------------------------------------------------
if [ "${MODE}" = "nw" ]; then
    say "--- Starting the game ---"
    say ""
    # Steam integration is a Windows-only native binding and switches itself
    # off here.
    exec "${NW_BIN}" "${GAME_DIR}" "$@"
fi

# Browser mode: the game is a web page, so a plain static server over the
# build folder is enough. Written out rather than fetched, so npm is never
# needed and the machine stays offline-capable once set up.
command -v node >/dev/null 2>&1 || die "browser mode needs Node.js, which is not installed. Run this script again without HX_SKIP_NODE=1, or install Node.js from your package manager."

PORT="${HX_PORT:-8081}"
SERVER_JS="${GAME_DIR}/.hx_server.js"

cat > "${SERVER_JS}" <<'SERVER_EOF'
// Static server for browser mode, written by run_linux.sh.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.argv[2] || 8081);
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.efkefc': 'application/octet-stream',
    '.wasm': 'application/wasm'
};

http.createServer((req, res) => {
    let rel;
    try {
        rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    } catch (e) {
        res.writeHead(400).end('Bad request');
        return;
    }
    if (rel === '/' || rel === '') rel = '/index.html';

    const file = path.join(root, rel);
    // Anything resolving outside the game folder is refused.
    if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
    }

    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) {
            res.writeHead(404).end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Content-Length': st.size,
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(file).pipe(res);
    });
}).listen(port, '127.0.0.1', () => {
    console.log('  serving ' + root);
    console.log('  http://localhost:' + port);
});
SERVER_EOF

say "--- Starting the game in your browser ---"
say ""
node "${SERVER_JS}" "${PORT}" &
SERVER_PID=$!
trap 'kill ${SERVER_PID} 2>/dev/null || true' EXIT INT TERM

sleep 2
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:${PORT}" >/dev/null 2>&1
elif command -v gnome-open >/dev/null 2>&1; then
    gnome-open "http://localhost:${PORT}" >/dev/null 2>&1
elif command -v kde-open >/dev/null 2>&1; then
    kde-open "http://localhost:${PORT}" >/dev/null 2>&1
else
    say "  open http://localhost:${PORT} yourself."
fi

say ""
say "  Press Ctrl+C to stop."
wait ${SERVER_PID}
