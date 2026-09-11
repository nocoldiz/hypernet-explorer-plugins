#!/bin/bash
# ============================================================
# run_mac.sh - installs what the game needs on macOS, then runs it
#
# The build ships the Windows NW.js runtime (Game.exe and its DLLs), which
# macOS cannot use. This script sets a Mac up from nothing and starts the
# game on it:
#
#   1. Node.js, if the machine has none. Fetched as the official tarball
#      into <build>/.node and used from there, so nothing is installed
#      system-wide and no password is ever asked for. Set HX_NODE_BREW=1
#      to let Homebrew install it properly instead.
#   2. The NW.js runtime for this Mac, into <build>/.nwjs (about 127 MB,
#      once). NW.js takes a folder holding a package.json as its argument,
#      so nothing has to be repackaged: the build folder IS the app.
#   3. The game itself.
#
#   Run:  bash run_mac.sh
#   or:   chmod +x run_mac.sh && ./run_mac.sh
#
# run_mac.command (tools/build/) is the same launcher without the Node.js
# step, for a Mac that is already set up and wants a Finder double-click.
# This script lives at the project root and ships from there.
#
# Which runtime:
#   Apple Silicon  NW.js 0.82.0 osx-arm64  (0.48 predates arm64 builds)
#   Intel          NW.js 0.48.4 osx-x64    (the same version as Windows)
#
# Overrides, all optional:
#   HX_MODE=nw|browser            how to run it (default nw, browser is the
#                                 fallback when the runtime will not start)
#   HX_PORT=8081                  port for browser mode
#   HX_NODE_BREW=1                install Node.js with Homebrew instead of
#                                 keeping a private copy in the build folder
#   HX_NODE_VERSION=20.18.1       pin the Node.js version fetched
#   HX_SKIP_NODE=1                do not install Node.js at all
#   HX_NW_APP=/path/to/nwjs.app   use an NW.js runtime you already have
#   HX_NW_ARCH=x64|arm64          force an architecture (x64 runs under Rosetta 2)
#   HX_NW_VERSION=0.48.4          pin an NW.js version
#   HX_NW_SLUG=osx-x64            pin a download slug
#   HX_NW_HOME=/path              keep runtimes somewhere else
# ============================================================

set -u

GAME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

say()  { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

die() {
    printf 'ERROR: %s\n' "$*" >&2
    # A Finder double-click opens a Terminal window that closes on exit, so
    # hold it open long enough for the message to be read.
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
say " Hypernet Explorer - macOS setup and launcher"
say "============================================================"
say ""
say "Game folder : ${GAME_DIR}"

[ "$(uname -s)" = "Darwin" ] || die "this script is for macOS. On Linux run run_linux.sh, on Windows run Game.exe."

for f in package.json index.html js/main.js; do
    [ -f "${GAME_DIR}/${f}" ] || die "${GAME_DIR} does not look like the game folder (${f} is missing)."
done

if [ ! -w "${GAME_DIR}" ]; then
    warn "the game folder is not writable, so savegames and downloads will fail."
    warn "Copy it somewhere under your home folder and run this script from there."
fi

command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 \
    || die "neither curl nor wget is available, so nothing can be downloaded."

# --- Which architecture this Mac is -------------------------------------
ARCH="${HX_NW_ARCH:-}"
if [ -z "${ARCH}" ]; then
    case "$(uname -m)" in
        arm64)  ARCH="arm64" ;;
        x86_64)
            # A shell running under Rosetta 2 reports x86_64 on Apple Silicon.
            if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
                ARCH="arm64"
            else
                ARCH="x64"
            fi
            ;;
        *) die "unsupported architecture: $(uname -m)" ;;
    esac
fi

case "${ARCH}" in
    arm64|x64) ;;
    *) die "unknown HX_NW_ARCH '${ARCH}' (expected x64 or arm64)." ;;
esac

say "Machine     : macOS ${ARCH}"
say ""

# --- 1. Node.js ---------------------------------------------------------
NODE_HOME="${GAME_DIR}/.node"
NODE_VERSION="${HX_NODE_VERSION:-20.18.1}"
NODE_NAME="node-v${NODE_VERSION}-darwin-${ARCH}"

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
elif [ "${HX_NODE_BREW:-0}" = "1" ]; then
    say "--- Node.js: installing with Homebrew ---"
    if ! command -v brew >/dev/null 2>&1; then
        say "    Homebrew is not installed, fetching it first."
        say "    It will ask for your password, and it installs system-wide."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
            || die "the Homebrew installation failed. Run this script again without HX_NODE_BREW=1 to keep a private copy of Node.js instead."
        for p in /opt/homebrew/bin /usr/local/bin; do
            [ -x "${p}/brew" ] && eval "$("${p}/brew" shellenv)"
        done
    fi
    command -v brew >/dev/null 2>&1 || die "Homebrew installed but brew is not on the PATH. Open a new Terminal window and run this script again."
    brew install node || die "brew install node failed."
    say "    installed ($(node --version))"
else
    say "--- Node.js: fetching a private copy (about 40 MB, once) ---"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_NAME}.tar.gz"
    say "    ${URL}"

    TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hxnode.XXXXXX")" || die "could not make a temporary folder."
    trap 'rm -rf "${TMP_DIR}"' EXIT
    TAR="${TMP_DIR}/${NODE_NAME}.tar.gz"

    fetch "${URL}" "${TAR}" \
        || die "the Node.js download failed. Check the connection, or install Node.js yourself from https://nodejs.org and run this script again."

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

# --- 2. The NW.js runtime -----------------------------------------------
case "${ARCH}" in
    arm64) DEF_VERSION="0.82.0"; DEF_SLUG="osx-arm64" ;;
    x64)   DEF_VERSION="0.48.4"; DEF_SLUG="osx-x64" ;;
esac

NW_VERSION="${HX_NW_VERSION:-$DEF_VERSION}"
NW_SLUG="${HX_NW_SLUG:-$DEF_SLUG}"
NW_NAME="nwjs-v${NW_VERSION}-${NW_SLUG}"
NW_HOME="${HX_NW_HOME:-${GAME_DIR}/.nwjs}"
NW_DIR="${NW_HOME}/${NW_NAME}"
NW_APP="${HX_NW_APP:-${NW_DIR}/nwjs.app}"
NW_BIN="${NW_APP}/Contents/MacOS/nwjs"

MODE="${HX_MODE:-nw}"

if [ "${MODE}" = "nw" ]; then
    say "--- NW.js runtime: ${NW_NAME} ---"

    if [ ! -x "${NW_BIN}" ]; then
        if [ -n "${HX_NW_APP:-}" ]; then
            die "HX_NW_APP is set but ${NW_BIN} is not there."
        fi

        URL="https://dl.nwjs.io/v${NW_VERSION}/${NW_NAME}.zip"
        say "    downloading (about 127 MB, once)"
        say "    ${URL}"

        TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hxnw.XXXXXX")" || die "could not make a temporary folder."
        trap 'rm -rf "${TMP_DIR}"' EXIT
        ZIP="${TMP_DIR}/${NW_NAME}.zip"

        fetch "${URL}" "${ZIP}" \
            || die "the download failed. Check the connection, or fetch ${URL} by hand and unzip it into ${NW_DIR}."

        say ""
        say "    unpacking"
        # ditto, not unzip: it keeps the symlinks and permissions an .app
        # bundle is built out of.
        ditto -x -k "${ZIP}" "${TMP_DIR}/x" || die "could not unpack the runtime archive."

        APP_SRC="$(find "${TMP_DIR}/x" -maxdepth 3 -name 'nwjs.app' -type d -print -quit)"
        [ -n "${APP_SRC}" ] || die "the archive did not contain nwjs.app."

        mkdir -p "${NW_DIR}" || die "could not create ${NW_DIR}."
        rm -rf "${NW_DIR}/nwjs.app"
        ditto "${APP_SRC}" "${NW_DIR}/nwjs.app" || die "could not install the runtime into ${NW_DIR}."

        rm -rf "${TMP_DIR}"
        trap - EXIT
        say "    installed into ${NW_DIR}"
    else
        say "    already here"
    fi

    # --- Let macOS run it ------------------------------------------------
    chmod +x "${NW_BIN}" 2>/dev/null || true
    find "${NW_APP}/Contents" -type f -name 'nwjs*' -exec chmod +x {} + 2>/dev/null || true

    # Gatekeeper flags anything downloaded, which stops an unsigned bundle dead.
    xattr -dr com.apple.quarantine "${NW_APP}" 2>/dev/null || true

    # Apple Silicon refuses a binary carrying no signature at all; an ad-hoc
    # one is enough and costs nothing when the bundle is already signed.
    if [ "${ARCH}" = "arm64" ] && command -v codesign >/dev/null 2>&1; then
        if ! codesign --verify --quiet "${NW_APP}" 2>/dev/null; then
            say "    ad-hoc signing the runtime (Apple Silicon requires it)"
            codesign --force --deep --sign - "${NW_APP}" >/dev/null 2>&1 \
                || warn "ad-hoc signing failed. If the game will not start, run: codesign --force --deep --sign - \"${NW_APP}\""
        fi
    fi

    if [ ! -x "${NW_BIN}" ]; then
        warn "${NW_BIN} is not executable, falling back to browser mode."
        MODE="browser"
    fi
fi

say ""

# --- 3. The game --------------------------------------------------------
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
command -v node >/dev/null 2>&1 || die "browser mode needs Node.js, which is not installed. Run this script again without HX_SKIP_NODE=1."

PORT="${HX_PORT:-8081}"
SERVER_JS="${GAME_DIR}/.hx_server.js"

cat > "${SERVER_JS}" <<'SERVER_EOF'
// Static server for browser mode, written by run_mac.sh.
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
open "http://localhost:${PORT}" 2>/dev/null || say "  open http://localhost:${PORT} yourself."

say ""
say "  Press Ctrl+C to stop."
wait ${SERVER_PID}
