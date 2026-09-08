/*:
 * @target MZ
 * @plugindesc Title screen game updater. Downloads the public plugin repository and replaces the game files in the root folder.
 * @author Omni-Lex
 *
 * @param owner
 * @text Repository owner
 * @desc GitHub account that hosts the update repository.
 * @default nocoldiz
 *
 * @param repo
 * @text Repository name
 * @desc Name of the update repository. Its root mirrors the game root folder.
 * @default hypernet-explorer-plugins
 *
 * @param branch
 * @text Stable branch
 * @desc The branch the STABLE tab reads. Its history is the build list.
 * @default main
 *
 * @param unstableBranch
 * @text Unstable branch
 * @desc The branch the UNSTABLE tab reads. Leave it empty to drop the tab.
 * @default unstable
 *
 * @param fullDownloadUrl
 * @text Full download link
 * @desc Where a player is sent to download the whole game again after a major update.
 * @default https://drive.google.com/file/d/1p9vo_Rj5xB0Bx3QJogpShveB2z7vbJzk/view?usp=drive_link
 *
 * @param historySize
 * @text Builds per page
 * @type number
 * @min 5
 * @max 100
 * @desc How many past builds are listed at a time.
 * @default 20
 *
 * @param concurrency
 * @text Parallel downloads
 * @type number
 * @min 1
 * @max 16
 * @desc How many files are downloaded at the same time.
 * @default 5
 *
 * @param baseCommit
 * @text Build number origin
 * @desc Where the history starts. Builds are numbered by how many commits came after it, and only those later commits are listed.
 * @default b2092245d04a8c27bc652cb0326dfbd2198555ea
 *
 * @help TitleScreenGameUpdater.js
 * ============================================================================
 * Adds an UPDATES entry to the title screen that pulls the game files from a
 * public GitHub repository. The repository root mirrors the game root folder,
 * so js/plugins/Foo.js in the repository replaces js/plugins/Foo.js here.
 *
 * Downloading is enabled (DOWNLOADS_ENABLED = true): the screen checks the
 * branch, reports the latest build and what changed in it, and installs it on
 * request. Setting the flag to false turns it back into a read-only report
 * that fetches nothing and touches no local file.
 *
 * Two branches are offered, side by side as tabs at the head of the build list:
 * STABLE (the branch parameter, main) and UNSTABLE (the unstableBranch
 * parameter). Only one of them is read at a time, whichever tab is on, and the
 * choice is remembered in save/updater/state.json so a copy stays on the
 * channel it was put on. Each tab keeps its own build list, so switching back
 * and forth costs nothing after the first read; switching tabs starts the same
 * automatic update the screen runs when it opens, against the branch just
 * chosen. Every build carries its own commit hash whichever branch lists it, so
 * moving between the two is an ordinary switch: the files of the build picked
 * replace whatever is here.
 *
 * The branch on show is read as one history. Its commit history is the build
 * list: the newest build sits at the top and every past build under it, so a
 * player can install the latest one or go back to any earlier build. Older builds are
 * fetched a page at a time, and only the commits published after the numbering
 * origin (the baseCommit parameter) are listed. The origin itself is the floor
 * the numbering counts from, not a build to install, so it never appears; when
 * the branch has nothing newer than it the list is simply empty and the screen
 * says so.
 *
 * How an update runs
 *   Opening the screen runs one on its own: the branch is read, the newest
 *   build compared and, when it holds anything this copy lacks, downloaded and
 *   applied, all without a press. Esc stops it at any point and nothing outside
 *   save/updater/tmp has been touched until every file is down. The one thing
 *   it will not do by itself is cross a major update (below): there it stops
 *   after the comparison and says what has to be downloaded instead, since a
 *   patched copy is not a whole one.
 *
 *   Switching to a build by hand is a single action too. The player highlights
 *   it and confirms once, on the build itself or on the one button in the
 *   action list, and everything below happens without another press.
 *   1. The branch history is read from the GitHub API and the player picks a
 *      build. The newest one is picked and compared on opening the screen, so
 *      the button already knows how large the switch will be.
 *   2. Every file in that build is compared with the local one by git blob
 *      hash, so only files that really differ are downloaded, and only those
 *      count toward the download size. A text file whose only difference is
 *      CRLF line endings holds the same content as the LF blob the repository
 *      stores, so it is left alone as well. Going back to an older build works
 *      the same way, it just replaces newer files with the older ones. A build
 *      already compared skips this step and goes straight to the download.
 *   3. All of them are fetched into save/updater/tmp and verified against the
 *      hash the repository declared.
 *   4. Only once every file is downloaded and verified are they moved into
 *      place. The replaced files are copied to save/updater/backup/<time>
 *      first, and the three most recent backups are kept.
 *   5. The game must be closed and reopened for the new files to load. The
 *      updater warns the player and closes it for them; it never reloads in
 *      place, since that leaves some replaced files loaded from the old copy.
 *      A full-screen notice saying the game is closing to apply the update is
 *      held for a second first, so the window going away is plainly the update
 *      finishing rather than a crash.
 *
 *   A build that turns out to hold nothing this copy lacks stops after step 2
 *   and says so, and "Check this build" still compares a build without touching
 *   anything, for a player who wants to read the file list first.
 *
 * Nothing is ever deleted: files that exist here but not in the repository are
 * left alone, and so is everything under save/. Going back to an older build
 * therefore leaves behind any file that build never had.
 *
 * Major updates
 *   A build whose commit message says "major update" anywhere, in its name or
 *   in the notes under it, is one this patching cannot fully carry. It is still
 *   installed the ordinary way when the player asks for it, but the build list
 *   marks it, the build dossier says so and the title screen says so, all of
 *   them asking for the whole game to be downloaded again for full
 *   compatibility. The warning covers every build a switch crosses, not only
 *   the one being installed, and once a copy has taken one it keeps saying so
 *   (save/updater/state.json) until the player confirms on the updater screen
 *   that they have downloaded the game again.
 *
 *   A copy sitting behind a major update is the one case a patch cannot answer,
 *   so both screens offer the whole game instead of only naming it: a DOWNLOAD
 *   THE FULL GAME button, on the title screen under the update notice and in
 *   the updater's action list, opens the fullDownloadUrl parameter in the
 *   player's own browser. The automatic update stops there rather than patching
 *   across it on its own; the ordinary install is still offered under it for a
 *   player who wants the files anyway.
 *
 * The build number and the build name
 *   Whichever build is installed is also a number: how many commits on the
 *   branch came after the origin commit (the baseCommit parameter). It is read
 *   once per build from the compare API, kept in save/updater/state.json and
 *   handed to the title screen, which writes it into the third field of the
 *   version badge (0.0.<build>a). The same record keeps that build's commit
 *   message, which replaces whatever the version label said after the number,
 *   so the badge reads 0.0.<build>a - <the commit this copy sits on>. A copy
 *   that has never updated has neither and keeps the version string as written.
 *
 * Checking on launch
 *   The title screen calls GameUpdater.autoCheck() once per session. It reads
 *   the branch, and only compares local files when the newest build is not the
 *   one already recorded as installed, so an up-to-date copy costs one request.
 *   Everything it finds is reported through GameUpdater.autoResult(); nothing is
 *   downloaded and no local file is touched.
 *
 *   The answer is kept for the whole session, so entering the title again costs
 *   nothing, with one exception: coming back to the title after playing. A
 *   session can last hours and the branch may well have moved while it ran, so
 *   the first check made after any time on the map reads the branch afresh. A
 *   build already compared in this session is not compared again, since the
 *   files it was measured against have not changed, so that second read
 *   ordinarily costs the one request as well.
 *
 * Requires the desktop (NW.js) build. On the web build the command is hidden
 * because there is no local file system to write to.
 *
 * Controls
 *   Up / Down / W / S  , move between builds or actions
 *   Right / D          , enter the action list
 *   Left / A           , back to the build list
 *   PageUp / PageDown  , switch between the STABLE and UNSTABLE tabs
 *   OK / Enter         , switch to the highlighted build, or run the action
 *   Cancel / Esc       , back to the title (aborts a running download)
 * ============================================================================
 */

(function () {
    'use strict';

    const PLUGIN_NAME = 'TitleScreenGameUpdater';
    const params = PluginManager.parameters(PLUGIN_NAME);

    const OWNER        = String(params.owner || 'nocoldiz');
    const REPO         = String(params.repo || 'hypernet-explorer-plugins');
    const PAGE_SIZE    = Math.max(5, Math.min(100, Number(params.historySize) || 20));
    const CONCURRENCY  = Math.max(1, Math.min(16, Number(params.concurrency) || 5));
    // Build numbering counts the commits that came after this one.
    const BASE_COMMIT  = String(params.baseCommit || 'b2092245d04a8c27bc652cb0326dfbd2198555ea');

    // The two channels the tabs offer. A branch left empty in the parameters
    // simply has no tab, which is how a build that ships one branch only keeps
    // the screen it always had. `stable` is always present: it is the branch
    // every copy falls back to, including one whose saved channel no longer
    // names a branch this build knows.
    const CHANNELS = (function () {
        const list = [{ key: 'stable', branch: String(params.branch || 'main') }];
        const unstable = String(params.unstableBranch === undefined ? 'unstable' : params.unstableBranch).trim();
        if (unstable && unstable !== list[0].branch) list.push({ key: 'unstable', branch: unstable });
        return list;
    })();
    const DEFAULT_CHANNEL = 'stable';
    function channelBranch(key) {
        const found = CHANNELS.find(c => c.key === key);
        return (found || CHANNELS[0]).branch;
    }

    // Where a copy that cannot be patched the rest of the way is sent. It is
    // opened in the player's own browser, never in a window of the game's.
    const FULL_DOWNLOAD_URL = String(params.fullDownloadUrl ||
        'https://drive.google.com/file/d/1p9vo_Rj5xB0Bx3QJogpShveB2z7vbJzk/view?usp=drive_link'); // i18n-ignore: url

    const USER_AGENT  = 'HypernetExplorer-Updater';
    const TIMEOUT_MS  = 30000;
    const KEEP_BACKUPS = 3;
    // How many resolved build numbers the state file keeps, oldest dropped first.
    const KEEP_BUILD_NUMBERS = 60;
    // How much of a build's commit message the version badge can carry before it
    // starts crowding the corner of the title screen.
    const BUILD_NAME_MAX = 42;
    // How long the closing notice stands before the process actually goes.
    const CLOSING_NOTICE_MS = 1000;

    // Downloading and installing. Set this to false to leave the screen as a
    // read-only report of what the branch holds, touching no local file.
    const DOWNLOADS_ENABLED = true;

    // Paths the updater refuses to touch even if the repository ships them.
    const EXCLUDED = ['.gitignore', '.github/', 'save/'];

    // =========================================================================
    // Localisation
    // =========================================================================


    // The updater's copy lives in js/i18n/<lang>/plugins/GameUpdater.json.
    function getT() {
        return T.obj('GameUpdater');
    }
    function fmt(str) {
        const args = Array.prototype.slice.call(arguments, 1);
        return String(str).replace(/%(\d+)/g, (m, i) => {
            const v = args[Number(i) - 1];
            return v === undefined ? m : String(v);
        });
    }
    function esc(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function shortSha(sha) {
        return sha ? String(sha).slice(0, 7) : null;
    }
    // A commit message is a title and, under it, whatever the build wanted to
    // say about itself: the first is the build's name, the rest its changelog.
    function messageTitle(message) {
        return String(message || '').split('\n')[0].trim();
    }
    function messageBody(message) {
        return String(message || '').split('\n').slice(1).join('\n').trim();
    }

    // A build that says "major update" anywhere in its commit message is one
    // the file patch cannot fully carry: assets outside the repository, a
    // renamed or deleted file (nothing is ever deleted here) or an engine
    // change can leave a patched copy half on the old build. It is still
    // installed the ordinary way, but every screen that offers it says the
    // whole game should be downloaded again for full compatibility.
    const MAJOR_PATTERN = /major\s*[-_]?\s*update/i;
    function isMajorMessage(text) {
        return MAJOR_PATTERN.test(String(text || ''));
    }
    // Read over the whole message, title and changelog alike, so a build that
    // only mentions it in the notes under its name still counts.
    function isMajorCommit(commit) {
        return !!commit && (isMajorMessage(commit.message) || isMajorMessage(commit.body));
    }

    // Version strings compared field by field ("0.4.0a" against "0.5.3a"), with
    // the letter suffix of the last field as a final tiebreak. Returns a
    // negative number when `a` is older, 0 when they match, positive when it is
    // newer, and null when either side cannot be read as a version.
    const VERSION_PARTS = /^v?(\d+)\.(\d+)(?:\.(\d+))?([A-Za-z]*)/;
    function versionFields(text) {
        const m = String(text || '').trim().match(VERSION_PARTS);
        if (!m) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3] || 0), (m[4] || '').toLowerCase()];
    }
    function compareVersions(a, b) {
        const x = versionFields(a);
        const y = versionFields(b);
        if (!x || !y) return null;
        for (let i = 0; i < 3; i++) {
            if (x[i] !== y[i]) return x[i] - y[i];
        }
        if (x[3] === y[3]) return 0;
        return x[3] < y[3] ? -1 : 1;
    }

    function formatBytes(bytes) {
        const b = Number(bytes) || 0;
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function formatDate(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // =========================================================================
    // Environment
    // =========================================================================
    const hasNode = (function () {
        try {
            return typeof Utils !== 'undefined' && Utils.isNwjs() && typeof require === 'function';
        } catch (e) {
            return false;
        }
    })();

    let fs = null, nodePath = null, https = null, crypto = null;
    let BASE_DIR = '', WORK_DIR = '', TMP_DIR = '', BACKUP_DIR = '', STATE_FILE = '', HASH_FILE = '';

    if (hasNode) {
        try {
            fs       = require('fs');
            nodePath = require('path');
            https    = require('https');
            crypto   = require('crypto');
            BASE_DIR = resolveBaseDir();
            WORK_DIR   = nodePath.join(BASE_DIR, 'save', 'updater');
            TMP_DIR    = nodePath.join(WORK_DIR, 'tmp');
            BACKUP_DIR = nodePath.join(WORK_DIR, 'backup');
            STATE_FILE = nodePath.join(WORK_DIR, 'state.json');
            HASH_FILE  = nodePath.join(WORK_DIR, 'hashes.json');
        } catch (e) {
            console.warn(PLUGIN_NAME + ': node modules unavailable, updater disabled.', e);
            fs = null;
        }
    }

    function resolveBaseDir() {
        try {
            if (process.mainModule && process.mainModule.filename) {
                return nodePath.dirname(process.mainModule.filename);
            }
        } catch (e) { /* fall through */ }
        try {
            return nodePath.dirname(process.execPath);
        } catch (e) {
            return '.';
        }
    }

    const isAvailable = () => !!fs;

    // A plain window.open under NW.js spawns a bare in-app window with no
    // address bar and no way back, so the shell hands the link to the browser
    // the player actually uses. Every route is guarded: failing to open a page
    // must never throw out of a button press.
    function openExternal(url) {
        if (!url) return false;
        try {
            if (typeof nw !== 'undefined' && nw.Shell && nw.Shell.openExternal) {
                nw.Shell.openExternal(url);
                return true;
            }
        } catch (e) { /* not running under NW.js */ }
        try {
            if (typeof require === 'function') {
                const gui = require('nw.gui');
                if (gui && gui.Shell && gui.Shell.openExternal) {
                    gui.Shell.openExternal(url);
                    return true;
                }
            }
        } catch (e) { /* no nw.gui either */ }
        try {
            window.open(url, '_blank');
            return true;
        } catch (e) {
            console.warn(PLUGIN_NAME + ': could not open ' + url, e);
            return false;
        }
    }

    // =========================================================================
    // File helpers
    // =========================================================================
    function readFileAsync(file) {
        return new Promise((resolve, reject) => {
            fs.readFile(file, (err, data) => (err ? reject(err) : resolve(data)));
        });
    }
    function writeFileAsync(file, data) {
        return new Promise((resolve, reject) => {
            fs.writeFile(file, data, (err) => (err ? reject(err) : resolve()));
        });
    }
    function statAsync(file) {
        return new Promise((resolve) => {
            fs.stat(file, (err, st) => resolve(err ? null : st));
        });
    }
    function mkdirp(dir) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
        }
    }
    function rmrf(target) {
        try {
            if (!fs.existsSync(target)) return;
            if (fs.rmSync) {
                fs.rmSync(target, { recursive: true, force: true });
            } else {
                fs.rmdirSync(target, { recursive: true });
            }
        } catch (e) {
            console.warn(PLUGIN_NAME + ': could not remove ' + target, e);
        }
    }
    function moveFile(from, to) {
        mkdirp(nodePath.dirname(to));
        try {
            fs.renameSync(from, to);
        } catch (e) {
            // Different volume or a locked target: fall back to copy + unlink.
            fs.copyFileSync(from, to);
            try { fs.unlinkSync(from); } catch (e2) { /* leave the temp file */ }
        }
    }
    function readJson(file, fallback) {
        try {
            if (!fs.existsSync(file)) return fallback;
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            return fallback;
        }
    }
    function writeJson(file, data) {
        try {
            mkdirp(nodePath.dirname(file));
            fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.warn(PLUGIN_NAME + ': could not write ' + file, e);
        }
    }
    function blobSha(buffer) {
        const header = Buffer.from('blob ' + buffer.length + '\0', 'utf8');
        return crypto.createHash('sha1').update(Buffer.concat([header, buffer])).digest('hex');
    }

    // Git's own binary test: a NUL byte near the head of the file means the
    // bytes are data, not text, and must never be touched.
    function looksBinary(buffer) {
        const limit = Math.min(buffer.length, 8000);
        for (let i = 0; i < limit; i++) {
            if (buffer[i] === 0) return true;
        }
        return false;
    }

    // A text file checked out on Windows carries CRLF while the repository
    // stores LF, so the same content hashes differently and would be fetched
    // again on every single check. Hashing the LF form as well lets a file that
    // only differs in its line endings be recognised as the one we already have.
    function stripCR(buffer) {
        const out = Buffer.allocUnsafe(buffer.length);
        let n = 0;
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] === 13 && buffer[i + 1] === 10) continue;
            out[n++] = buffer[i];
        }
        return out.slice(0, n);
    }
    function sleepFrame() {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    // =========================================================================
    // The version this copy calls itself
    // =========================================================================
    // CHANGELOG.txt is the one place the version is written down, and it is a
    // tracked file like any other, so a copy that has updated already carries
    // the version of the build it now runs without a plugin parameter, an
    // i18n entry or a constant having to be edited anywhere.
    //
    // The version stands on the very first line of the file. When that line is
    // blank (a file that opens on a gap, an entry written above the header) the
    // first line further down that reads as a version is taken instead, so the
    // newest section still names the build. A copy shipped without the
    // changelog, or one whose changelog names no version at all, has none, and
    // whoever asked falls back to the version written in its own parameters.
    const CHANGELOG_FILE = 'CHANGELOG.txt'; // i18n-ignore: file name
    // "0.3.6a", "0.04a", "v1.2.0": two fields or three, with or without the
    // letter a release habit puts at the end. Nothing else on the line.
    const VERSION_LINE = /^v?(\d+\.\d+(?:\.\d+)?[A-Za-z]*)$/;
    // How far down the file a version header is still looked for, so a version
    // written in the prose of an entry is never mistaken for the header.
    const VERSION_SEARCH_LINES = 40;
    let _ownVersion; // undefined until read, null when there is none

    // Reads the changelog off the disk under NW.js and over the network on the
    // web build, where there is no file system to read. Both are guarded: a
    // missing changelog is an ordinary answer, not a failure.
    function readChangelogText() {
        if (fs && nodePath) {
            try {
                const file = nodePath.join(BASE_DIR, CHANGELOG_FILE);
                if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
            } catch (e) { /* fall through to the web read */ }
        }
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', CHANGELOG_FILE, false);
            xhr.send();
            // A file:// read answers with status 0 even when it worked.
            const ok = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText);
            if (ok) return xhr.responseText;
        } catch (e) { /* no changelog to read */ }
        return null;
    }

    function changelogVersion() {
        if (_ownVersion !== undefined) return _ownVersion;
        _ownVersion = null;
        const text = readChangelogText();
        if (text) {
            const lines = text.split(/\r?\n/, VERSION_SEARCH_LINES);
            for (let i = 0; i < lines.length; i++) {
                const found = String(lines[i]).trim().match(VERSION_LINE);
                if (found) { _ownVersion = found[1]; break; }
            }
        }
        return _ownVersion;
    }

    // The updater swaps CHANGELOG.txt in with the rest of the files, so both
    // reads above are stale the moment a build is applied: without this the
    // version badge, the news panel and the "which build am I on" answer all
    // keep naming the build that was running when the game started.
    function forgetChangelog() {
        _ownVersion = undefined;
        _sections = undefined;
    }

    // The whole changelog, section by section, newest first. The title screen's
    // news panel is the file read out loud: every section is a version header
    // followed by its entries, so it is parsed here rather than there, where the
    // file is already opened and its version header already recognised.
    //
    // An entry stands on one line ("- something happened"); a line under it that
    // is neither blank, nor another entry, nor a version header is a wrapped
    // continuation of the entry above and is joined back onto it. Anything
    // written above the first version header belongs to no section and is
    // dropped. A build shipped without a changelog answers with an empty list.
    //
    // A section long enough to be read in one sitting is written in groups, and
    // a group is headed by a line under a hash ("# the 3d world"). A heading is
    // handed back in the entry list where it stands, as { heading }, so a reader
    // walking the list keeps the order the file writes and can tell the two
    // apart; a reader that only wants the text can drop them.
    let _sections; // undefined until read
    function changelogSections() {
        if (_sections !== undefined) return _sections;
        _sections = [];
        const text = readChangelogText();
        if (!text) return _sections;
        let current = null;
        for (const raw of text.split(/\r?\n/)) {
            const line = String(raw).trim();
            if (!line) continue;
            const header = line.match(VERSION_LINE);
            if (header) {
                current = { version: header[1], entries: [] };
                _sections.push(current);
                continue;
            }
            if (!current) continue; // prose written above the first header
            const group = line.match(/^#+\s+(.*)$/);
            if (group) { current.entries.push({ heading: group[1].trim() }); continue; }
            const entry = line.match(/^[-*]\s+(.*)$/);
            if (entry) current.entries.push(entry[1].trim());
            else if (typeof current.entries[current.entries.length - 1] === 'string') {
                const last = current.entries.length - 1;
                current.entries[last] += ' ' + line;
            }
        }
        return _sections;
    }

    // A repository path is only accepted when it stays inside the game folder.
    function isSafePath(p) {
        if (!p || typeof p !== 'string') return false;
        if (p.indexOf('\0') >= 0) return false;
        if (p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) return false;
        if (p.split('/').some(seg => !seg || seg === '.' || seg === '..')) return false;
        return !EXCLUDED.some(ex => (ex.endsWith('/') ? p.startsWith(ex) : p === ex));
    }

    // =========================================================================
    // HTTP
    // =========================================================================
    function httpsGet(url, headers) {
        return new Promise((resolve, reject) => {
            const run = (target, depth) => {
                if (depth > 5) {
                    reject(new Error('too many redirects')); // i18n-ignore: diagnostic
                    return;
                }
                let parsed;
                try {
                    parsed = new URL(target);
                } catch (e) {
                    reject(new Error('bad url ' + target)); // i18n-ignore: diagnostic
                    return;
                }
                const req = https.get({
                    hostname: parsed.hostname,
                    path: parsed.pathname + parsed.search,
                    headers: Object.assign({
                        'User-Agent': USER_AGENT,
                        'Accept-Encoding': 'identity'
                    }, headers || {})
                }, (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.resume();
                        run(new URL(res.headers.location, target).href, depth + 1);
                        return;
                    }
                    const chunks = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => {
                        const body = Buffer.concat(chunks);
                        if (res.statusCode !== 200) {
                            const detail = body.length ? ', ' + body.toString('utf8').slice(0, 160) : '';
                            reject(new Error('HTTP ' + res.statusCode + detail));
                            return;
                        }
                        resolve(body);
                    });
                    res.on('error', reject);
                });
                req.on('error', reject);
                req.setTimeout(TIMEOUT_MS, () => {
                    req.destroy(new Error('request timed out')); // i18n-ignore: diagnostic
                });
            };
            run(url, 0);
        });
    }

    // i18n-ignore-start: HTTP headers, API paths and repository URLs
    async function githubApi(pathname) {
        const body = await httpsGet('https://api.github.com' + pathname, {
            'Accept': 'application/vnd.github+json'
        });
        return JSON.parse(body.toString('utf8'));
    }

    function rawUrl(sha, filePath) {
        const encoded = filePath.split('/').map(encodeURIComponent).join('/');
        return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/${encoded}`;
    }

    // =========================================================================
    // The closing notice
    // =========================================================================
    // Everything on screen at that point is about to go with the window, so the
    // notice is deliberately its own layer over all of it, plain enough to be
    // read in the second it stands for. It never throws: nothing here may come
    // between the update and the close it was asked for.
    function showClosingNotice() {
        try {
            if (typeof document === 'undefined' || !document.body) return;
            if (document.getElementById('gu-closing-notice')) return;
            const box = document.createElement('div');
            box.id = 'gu-closing-notice';
            box.textContent = getT().closingNotice || 'Closing the game to apply update';
            document.body.appendChild(box);
            requestAnimationFrame(() => { box.classList.add('gu-shown'); });
        } catch (e) {
            console.warn(PLUGIN_NAME + ': could not show the closing notice', e);
        }
    }

    // =========================================================================
    // GameUpdater, the model behind the scene
    // =========================================================================
    const GameUpdater = {
        REPO_URL: `https://github.com/${OWNER}/${REPO}`, // i18n-ignore-end

        _state: null,
        _hashes: null,
        _plans: {},          // commit sha -> last check result
        _channel: null,      // 'stable' | 'unstable', read from the state file
        // channel key -> { commits (newest first), page, end }. Each tab keeps
        // its own list, so going back to one already read costs no request.
        _history: {},
        _busy: false,
        _cancelled: false,
        _restartPending: false,
        _closing: false,     // the game is on its way out, notice already up
        _auto: null,         // last launch check result
        _autoPromise: null,
        _sessionPlayed: false, // something was played since the last branch read

        isAvailable,
        downloadsEnabled: () => DOWNLOADS_ENABLED,
        baseCommit: BASE_COMMIT,
        fullDownloadUrl: () => FULL_DOWNLOAD_URL,
        openFullDownload: () => openExternal(FULL_DOWNLOAD_URL),
        isMajorMessage,
        isMajorCommit,

        state() {
            if (!this._state) {
                const raw = readJson(STATE_FILE, null) || {};
                // The old file kept one entry per channel; keep whichever build
                // that player actually had so the screen does not read "never".
                let installed = raw.installed || null;
                if (installed && !installed.sha) {
                    installed = installed[raw.channel] || installed.stable || installed.unstable || null;
                }
                // Every build number is counted from the origin commit, so a
                // file written against a different origin holds numbers that no
                // longer mean anything: drop them and let them be asked again.
                const sameOrigin = raw.base === BASE_COMMIT;
                if (!sameOrigin && installed) installed = Object.assign({}, installed, { build: null });
                // A channel this build no longer offers (the unstable branch
                // taken out of the parameters, or a name from an older file)
                // falls back to the stable one rather than reading nothing.
                const channel = CHANNELS.some(c => c.key === raw.channel) ? raw.channel : DEFAULT_CHANNEL;
                this._state = {
                    base: BASE_COMMIT,
                    channel: channel,
                    installed: installed && installed.sha ? installed : null,
                    // sha -> how many commits came after the origin commit
                    builds: (sameOrigin && raw.builds && typeof raw.builds === 'object') ? raw.builds : {}
                };
            }
            return this._state;
        },
        saveState() {
            writeJson(STATE_FILE, this.state());
        },
        installedInfo() {
            return this.state().installed;
        },

        // ---------------------------------------------------------------------
        // Channels, the two branches the tabs offer
        // ---------------------------------------------------------------------

        // The tabs to draw, in the order they are drawn. One entry means the
        // build ships a single branch and the strip has nothing to switch
        // between, which is what the screen checks before drawing it at all.
        channels() {
            return CHANNELS.slice();
        },
        channel() {
            if (!this._channel) this._channel = this.state().channel || DEFAULT_CHANNEL;
            return this._channel;
        },
        // The branch behind the tab that is on: everything that reads GitHub
        // asks this rather than a constant, so one switch moves the whole
        // screen, the history, the checks and the raw file URLs alike.
        branchName() {
            return channelBranch(this.channel());
        },

        // Moving to the other tab. The build list, how far down it has been
        // read and the launch answer all belong to the branch that was on, so
        // they are put aside per channel rather than thrown away: a tab already
        // read comes back without a request. Comparisons (`_plans`) are kept
        // whole, since a plan is measured against a commit and the local files,
        // neither of which cares which branch happened to list it.
        setChannel(key) {
            const wanted = CHANNELS.some(c => c.key === key) ? key : DEFAULT_CHANNEL;
            if (wanted === this.channel()) return false;
            this._channel = wanted;
            this.state().channel = wanted;
            this.saveState();
            // The launch answer named the newest build of the branch that was
            // on, so it says nothing about this one until it is asked again.
            this._auto = null;
            this._autoPromise = null;
            return true;
        },

        // The list, page and end-of-history mark of one channel, made on first
        // use so a tab never read is simply empty rather than absent.
        _hist(key) {
            const ch = key || this.channel();
            if (!this._history[ch]) this._history[ch] = { commits: [], page: 0, end: false };
            return this._history[ch];
        },

        // ---------------------------------------------------------------------
        // Major updates, the builds a file patch cannot fully carry
        // ---------------------------------------------------------------------

        // Whether a build declares itself a major update. One listed in the
        // history is read there; one only ever compared carries the same text
        // on its plan.
        isMajorBuild(sha) {
            if (!sha) return false;
            return this._majorHere(this.commitInfo(sha) || this._plans[sha]);
        },

        // The newest build declaring a major update among the ones switching to
        // `sha` would cross: everything between the build this copy runs and the
        // one being offered, that one included. Going backwards counts the same,
        // since leaving a major build behind puts the copy just as far out of
        // step as arriving on one.
        //
        // A copy that has never updated cannot say which build it is on, only
        // that it is somewhere at or below the one being offered, so it is read
        // against the offered build and every build older than it that is
        // listed. That errs toward warning, which is the right way round: a copy
        // whose files already match has nothing to install and is never asked
        // this question, so the only copies it can over-warn are ones that are
        // genuinely behind.
        // A major build this copy has already caught up with is not ahead of
        // it. The version written in the shipped CHANGELOG.txt is what this
        // copy runs, so a major build published under an older or equal
        // version has been crossed already, whatever the install record says,
        // and the whole-game download it asks for is not owed any more.
        majorCrossedByVersion(commit) {
            return this.versionCaughtUp(commit);
        },

        // Whether a build was published under a version this copy already runs
        // or has passed. CHANGELOG.txt names the version of the files sitting
        // here, so a build whose own name reads as the same version, or an
        // older one, has nothing left to offer however the install record
        // reads: the launch notice stays silent for it, and a major update at
        // that version is not owed a whole-game download any more. A build
        // whose name is not a version at all (the ordinary "fix: ui") cannot
        // be placed this way and is always offered.
        versionCaughtUp(commit) {
            const own = this.gameVersion();
            if (!own || !commit) return false;
            const theirs = this._versionName(messageTitle(commit.message)) ||
                messageTitle(commit.message);
            const cmp = compareVersions(theirs, own);
            return cmp !== null && cmp <= 0;
        },
        // The build this copy already runs: its name reads as exactly the
        // version written in the shipped CHANGELOG.txt. There is nothing to
        // fetch from it, so no screen offers to install it.
        // A hotfix published under the same version ("0.6.3a hotfix 2") is a
        // later build than the plain one, so it is read by name rather than by
        // number here: only a build whose name IS this copy's version is the
        // one already running.
        isCurrentVersion(commit) {
            const own = this.gameVersion();
            if (!own || !commit) return false;
            const title = messageTitle(commit.message);
            // "0.6.0a MAJOR UPDATE" names a version too: the marker says what
            // kind of build it is, not which one.
            const marked = title.match(/^v?(\d+\.\d+(?:\.\d+)?[A-Za-z]*)\s*[–:,-]?\s*major\s*[-_]?\s*update$/i);
            const theirs = this._versionName(title) || (marked ? marked[1] : null);
            if (!theirs) return false;
            const norm = (v) => String(v).trim().replace(/^v/i, '').toLowerCase();
            return norm(theirs) === norm(own);
        },

        // The build this copy is running, found in the history by its version
        // when nothing has ever been installed by the updater: a copy shipped
        // or downloaded whole still knows which build it is, because its
        // changelog names it.
        currentVersionCommit() {
            const list = this.commits();
            for (const commit of list) {
                if (this.isCurrentVersion(commit)) return commit;
            }
            return null;
        },
        _majorHere(commit) {
            return isMajorCommit(commit) && !this.majorCrossedByVersion(commit);
        },

        majorAhead(sha) {
            if (!sha) return null;
            const list = this.commits();
            const target = list.findIndex(c => c.sha === sha);
            if (target < 0) {
                const lone = this.commitInfo(sha) || this._plans[sha];
                return this._majorHere(lone) ? lone : null;
            }
            const info = this.installedInfo();
            const from = info ? list.findIndex(c => c.sha === info.sha) : -1;
            const lo = from < 0 ? target : Math.min(target, from);
            const hi = from < 0 ? list.length - 1 : Math.max(target, from);
            for (let i = lo; i <= hi; i++) {
                if (i === from) continue;   // the build already running is not crossed
                if (this._majorHere(list[i])) return list[i];
            }
            return null;
        },

        // Whether the build this copy is running right now is the one that
        // crossed a major update. `info.major` is only ever set while the
        // installed build already IS that major build or has landed past it in
        // the same jump, which is exactly the case that needs no notice: the
        // copy is on (or beyond) the build in question either way, so there is
        // nothing left to ask the player to go and do.
        majorInstalled() {
            return false;
        },
        majorInstalledName() {
            const info = this.installedInfo();
            return (info && info.majorName) ? String(info.majorName) : null;
        },
        clearMajorNotice() {
            const info = this.installedInfo();
            if (!info || !info.major) return false;
            info.major = false;
            info.majorName = null;
            this.saveState();
            if (this._auto) this._auto.majorInstalled = false;
            return true;
        },

        // ---------------------------------------------------------------------
        // Build numbers, the count of commits made after the origin commit
        // ---------------------------------------------------------------------

        // The number of the build this copy is running, or null when it has
        // never updated and therefore cannot say which build it is.
        buildNumber() {
            const info = this.installedInfo();
            return info && typeof info.build === 'number' ? info.build : null;
        },
        knownBuildNumber(sha) {
            const cached = this.state().builds[sha];
            return typeof cached === 'number' ? cached : null;
        },

        // The name of the build this copy is running: the first line of its
        // commit message, which is what the branch calls that build. Null when
        // it has never updated and therefore cannot say which build it is.
        buildName() {
            const info = this.installedInfo();
            const name = info && info.name ? String(info.name).trim() : '';
            return name || null;
        },

        // A record written before names were kept, or one installed by a check
        // that found nothing to fetch, carries no name: take it from the history
        // as soon as the branch has been read.
        _nameInstalled() {
            const info = this.installedInfo();
            if (!info || info.name) return;
            const row = this.commitInfo(info.sha);
            if (!row || !row.message) return;
            info.name = row.message;
            this.saveState();
        },

        // Writes the build number into the third field of a version string
        // ("0.2.0a - experimental" -> "0.0.42a - experimental"). A copy with no
        // build number keeps the string exactly as it was written.
        applyBuildNumber(text) {
            const build = this.buildNumber();
            if (build === null) return text;
            const str = String(text === undefined || text === null ? '' : text);
            if (!/\d+\.\d+\.\d+/.test(str)) return str;
            return str.replace(/(\d+\.\d+\.)(\d+)/, (m, head) => head + build);
        },

        // A build whose commit message is itself a version ("0.0.3a", "v1.2.0")
        // already names the build outright. Returns that version, so the badge
        // can show it alone instead of hanging it off the shipped number as a
        // second version ("0.2.0a - 0.0.3a").
        //
        // A hotfix is published under the version it fixes rather than a new
        // one ("0.2.18a hotfix", "0.2.18a hotfix 2"), so the version alone is
        // not the whole name and dropping the rest would leave two builds
        // wearing the same badge. Both halves are read here and the badge says
        // "0.2.18a hotfix 2"; before this the message matched nothing and the
        // badge hung it off the shipped version as a second one
        // ("0.2.3a - 0.2.18a hotfix 2"), which is the label that broke.
        //
        // The version itself is two fields or three ("0.04a" was published as
        // well), and the marker may lead or follow it, with or without the
        // punctuation a commit habit puts between them.
        _versionName(name) {
            const str = String(name || '').trim();
            const VERSION = '(\\d+\\.\\d+(?:\\.\\d+)?[A-Za-z]*)';
            const FIX = '(hotfix|hot-fix|patch|hf)\\s*[.#]?\\s*(\\d+)?';
            const plain = str.match(new RegExp('^v?' + VERSION + '$', 'i'));
            if (plain) return plain[1];
            const trailing = str.match(new RegExp('^v?' + VERSION + '\\s*[\u2013:,-]?\\s*' + FIX + '$', 'i'));
            const leading  = trailing ? null
                : str.match(new RegExp('^' + FIX + '\\s*[\u2013:,-]?\\s*v?' + VERSION + '$', 'i'));
            if (trailing) return trailing[1] + ' hotfix' + (trailing[3] ? ' ' + trailing[3] : '');
            if (leading)  return leading[3] + ' hotfix' + (leading[2] ? ' ' + leading[2] : '');
            return null;
        },

        // Replaces whatever the version string says after the number with the
        // name of the build that is running ("0.0.42a - experimental" ->
        // "0.0.42a - feat: translation batch"), so the badge names the commit
        // this copy sits on. When that name is a version in its own right it
        // becomes the whole label instead. A copy with no build name keeps the
        // string as written, and so does one whose label carries no version
        // number.
        applyBuildName(text) {
            const name = this.buildName();
            if (!name) return text;
            const asVersion = this._versionName(name);
            if (asVersion) return asVersion;
            const str = String(text === undefined || text === null ? '' : text);
            const head = str.match(/^\s*\d+\.\d+(?:\.\d+)?[A-Za-z]*/);
            if (!head) return str;
            const trimmed = name.length > BUILD_NAME_MAX
                ? name.slice(0, BUILD_NAME_MAX - 1).replace(/\s+$/, '') + '…'
                : name;
            return head[0].trim() + ' - ' + trimmed;
        },

        // The version this copy calls itself, read off the newest section of
        // CHANGELOG.txt, or null when the build ships no changelog.
        gameVersion: changelogVersion,

        // Every version section of the shipped changelog, newest first, as
        // { version, entries }. What the title screen's news panel reads.
        changelogSections: changelogSections,

        // Both passes at once, which is all the title screen wants.
        //
        // A copy that names its own version in the changelog is believed: the
        // file travels with the build, so its version is already the version
        // that is running, and the build number is not written over its digits
        // the way it is over a version written into a plugin parameter years
        // ago. The build number is still reported in its own right on the
        // updater screen. Only the build name is added, so the badge keeps
        // saying which commit this copy sits on.
        versionLabel(text) {
            const own = this.gameVersion();
            if (own) return this.applyBuildName(own);
            return this.applyBuildName(this.applyBuildNumber(text));
        },

        // Asks the compare API how far a build sits from the origin commit. The
        // answer never changes for a given commit, so it is kept in the state
        // file and each build is only ever asked about once.
        async buildCountFor(sha) {
            if (!sha) return null;
            const known = this.knownBuildNumber(sha);
            if (known !== null) return known;

            let count;
            if (sha === BASE_COMMIT) {
                count = 0;
            } else {
                const cmp = await githubApi(
                    `/repos/${OWNER}/${REPO}/compare/${encodeURIComponent(BASE_COMMIT)}...${encodeURIComponent(sha)}` // i18n-ignore: api path
                );
                count = Number(cmp && cmp.ahead_by);
                if (!isFinite(count)) return null;
            }

            const st = this.state();
            st.builds[sha] = count;
            const keys = Object.keys(st.builds);
            while (keys.length > KEEP_BUILD_NUMBERS) delete st.builds[keys.shift()];
            // The installed record carries its own copy so the title screen can
            // number the badge without a single request.
            if (st.installed && st.installed.sha === sha) st.installed.build = count;
            this.saveState();
            return count;
        },

        // The one place the installed build is recorded, so its number is always
        // filled in from whatever the cache already knows. `major` is the build
        // whose major update THIS install crossed, when it crossed one; it is
        // not carried over from the previous record, so a build installed on
        // top of a major one (whether or not it is itself major) leaves this
        // copy running something more recent than the major build and the
        // notice has nothing left to say.
        _markInstalled(sha, date, name, major) {
            const st = this.state();
            const known = this.commitInfo(sha);
            st.installed = {
                sha: sha,
                date: date || null,
                at: Date.now(),
                build: this.knownBuildNumber(sha),
                // The commit message names the build on the version badge.
                name: name || (known ? known.message : null) || null,
                major: !!major,
                majorName: major ? (major.message || null) : null
            };
            this.saveState();
        },

        // ---------------------------------------------------------------------
        // Launch check, run once per session by the title screen
        // ---------------------------------------------------------------------
        autoResult() {
            return this._auto;
        },
        updateAvailable() {
            return !!(this._auto && this._auto.available);
        },
        autoPending() {
            return !!this._autoPromise && !this._auto;
        },

        // A session has been played since the branch was last read, so the next
        // check will read it again rather than answer from the cache. The title
        // screen asks so it can hold that second read back the way it holds the
        // first, instead of starting it while the screen is still building.
        recheckPending() {
            return this._sessionPlayed;
        },

        // Time on the map is the one thing that can leave the cached answer
        // stale: a session runs for hours and the branch may move under it.
        noteSessionPlayed() {
            this._sessionPlayed = true;
        },

        // Idempotent: every caller after the first gets the same promise, so the
        // branch is read once however many times the title screen is entered.
        // The exception is the first check after a session was played: that one
        // drops the cached answer and reads the branch again, which is what
        // makes coming back to the title from a game see a build published
        // while it was running.
        autoCheck() {
            if (this._sessionPlayed) {
                this._sessionPlayed = false;
                this._autoPromise = null;
                this._auto = null;
            }
            if (this._autoPromise) return this._autoPromise;
            this._autoPromise = this._runAutoCheck().catch((err) => {
                this._auto = { ran: true, available: false, error: err && err.message ? err.message : String(err) };
                return this._auto;
            });
            return this._autoPromise;
        },

        async _runAutoCheck() {
            if (!isAvailable()) {
                this._auto = { ran: true, available: false, error: 'no local file system' }; // i18n-ignore: diagnostic
                return this._auto;
            }

            await this.loadHistory(false);
            // The badge names the installed build, so fill the name in as soon
            // as the history that holds it is here.
            this._nameInstalled();
            const latest = this.commits()[0];
            // Nothing published after the origin: the copy being played is the
            // newest there is, so there is no update to raise.
            if (!latest) {
                this._auto = {
                    ran: true, available: false, latest: null, latestDate: null,
                    latestBuild: null, latestName: null, build: this.buildNumber(),
                    channel: this.channel(), branch: this.branchName(),
                    files: 0, bytes: 0, error: null,
                    major: false, majorName: null,
                    majorInstalled: this.majorInstalled()
                };
                return this._auto;
            }

            // A copy already recorded as running the newest build needs no file
            // comparison at all; anything else is measured against it.
            const installed = this.installedInfo();
            let plan = null;
            if (!installed || installed.sha !== latest.sha) {
                // A build already compared in this session was measured against
                // the files that are still here, so a second read of the branch
                // takes that answer rather than hashing the folder again.
                plan = this._plans[latest.sha] || await this.check(latest.sha);
            }

            let latestBuild = null;
            try {
                latestBuild = await this.buildCountFor(latest.sha);
                const now = this.installedInfo();
                if (now && now.sha !== latest.sha && typeof now.build !== 'number') {
                    await this.buildCountFor(now.sha);
                }
            } catch (e) {
                // Numbering is cosmetic: a failed compare must not cost the
                // player the update notice itself.
                console.warn(PLUGIN_NAME + ': could not resolve the build number', e);
            }

            // A major update anywhere between here and the newest build is the
            // one thing the notice has to say beyond its size, since taking it
            // means downloading the whole game again afterwards.
            const major = (plan && plan.changed.length) ? this.majorAhead(latest.sha) : null;

            // A build published under the version this copy already runs is
            // not an update, whatever its files say: a copy that downloaded
            // 0.6.0a whole still differs from the branch in generated and
            // rebuilt files, and offering it its own version back reads as a
            // second major update that is never done with.
            const caughtUp = this.versionCaughtUp(latest);

            this._auto = {
                ran: true,
                available: !!(plan && plan.changed.length) && !caughtUp,
                latest: latest.sha,
                latestDate: latest.date,
                latestBuild: latestBuild,
                // What the branch calls that build: the title screen offers the
                // update by name rather than by number.
                latestName: latest.message || null,
                build: this.buildNumber(),
                channel: this.channel(),
                branch: this.branchName(),
                files: plan ? plan.changed.length : 0,
                bytes: plan ? plan.bytes : 0,
                error: null,
                // The update waiting is (or crosses) a major one. A patch
                // cannot carry this copy the rest of the way, so the title
                // screen offers the whole game instead of the download.
                major: !!major,
                majorName: major ? (major.message || null) : null,
                fullDownloadUrl: FULL_DOWNLOAD_URL,
                // This copy already took one and has not been downloaded whole.
                majorInstalled: this.majorInstalled()
            };
            return this._auto;
        },
        isInstalled(sha) {
            if (!sha) return false;
            const info = this.installedInfo();
            if (info) return info.sha === sha;
            // Never updated from here, so the version is the only answer.
            const own = this.currentVersionCommit();
            return !!(own && own.sha === sha);
        },
        plan(sha) {
            return this._plans[sha] || null;
        },
        commits() {
            return this._hist().commits;
        },
        commitInfo(sha) {
            return this.commits().find(c => c.sha === sha) || null;
        },
        isLatest(sha) {
            const list = this.commits();
            return !!(list.length && sha && list[0].sha === sha);
        },
        // How far down the history a build sits, so an older one can say so.
        indexOf(sha) {
            return this.commits().findIndex(c => c.sha === sha);
        },
        historyExhausted() {
            return this._hist().end;
        },
        isBusy() {
            return this._busy;
        },
        needsRestart() {
            return this._restartPending;
        },
        cancel() {
            if (this._busy) this._cancelled = true;
        },

        hashes() {
            if (!this._hashes) this._hashes = readJson(HASH_FILE, {}) || {};
            return this._hashes;
        },
        saveHashes() {
            writeJson(HASH_FILE, this.hashes());
        },

        // Hashes of a local file, cached on size + mtime so repeat checks are
        // cheap. `shaLF` is what the same file hashes to once CRLF endings are
        // normalised away, which is the form the repository holds; it costs a
        // second pass over the bytes, so it is only computed when asked for.
        async localHash(relPath, st, withLF) {
            const cache = this.hashes();
            const hit = cache[relPath];
            if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs &&
                (!withLF || hit.shaLF !== undefined)) {
                return hit;
            }
            const buf = await readFileAsync(nodePath.join(BASE_DIR, relPath));
            const record = { size: st.size, mtimeMs: st.mtimeMs, sha: blobSha(buf) };
            if (withLF) {
                record.shaLF = looksBinary(buf) ? null : blobSha(stripCR(buf));
            }
            cache[relPath] = record;
            return record;
        },

        // ---------------------------------------------------------------------
        // History, the builds on the branch, newest first
        // ---------------------------------------------------------------------
        async loadHistory(more, onProgress) {
            const T = getT();
            const report = onProgress || function () {};
            // The branch is read once and held, so a switch made while a page
            // is in flight cannot land its rows in the other tab's list.
            const channel = this.channel();
            const branch = this.branchName();
            const hist = this._hist(channel);
            if (more && hist.end) return hist.commits;

            this._busy = true;
            this._cancelled = false;
            try {
                const page = more ? hist.page + 1 : 1;
                report({ phase: 'history', text: fmt(T.logHistory, branch) });

                const list = await githubApi(
                    `/repos/${OWNER}/${REPO}/commits?sha=${encodeURIComponent(branch)}&per_page=${PAGE_SIZE}&page=${page}` // i18n-ignore: api path
                );
                if (!Array.isArray(list)) throw new Error('branch ' + branch + ' not found'); // i18n-ignore: diagnostic

                // Only the builds published after the numbering origin are
                // listed. The origin itself is the floor the count starts from,
                // not a build to install, so the list stops just above it and
                // nothing older is ever offered.
                const rows = [];
                let reachedOrigin = false;
                for (const c of list) {
                    if (!c || !c.sha) continue;
                    if (c.sha === BASE_COMMIT) { reachedOrigin = true; break; }
                    const full = c.commit ? String(c.commit.message || '') : '';
                    rows.push({
                        sha: c.sha,
                        date: c.commit && c.commit.author ? c.commit.author.date : null,
                        author: c.commit && c.commit.author ? c.commit.author.name : '',
                        message: messageTitle(full),
                        // Everything the commit says under its first line: what
                        // the build dossier shows as that build's changelog.
                        body: messageBody(full)
                    });
                }

                if (!more) hist.commits = [];
                const seen = new Set(hist.commits.map(c => c.sha));
                for (const row of rows) {
                    if (!seen.has(row.sha)) hist.commits.push(row);
                }
                hist.page = page;
                hist.end  = reachedOrigin || list.length < PAGE_SIZE;

                // An empty list is a real answer, not a failure: the branch tip
                // is the origin itself, so nothing newer has been published.
                report({
                    phase: 'history',
                    text: hist.commits.length ? fmt(T.logHistoryFound, hist.commits.length) : T.logNoNewer,
                    ratio: 1
                });
                return hist.commits;
            } finally {
                this._busy = false;
            }
        },

        // ---------------------------------------------------------------------
        // Check, what does the chosen build hold that we do not
        // ---------------------------------------------------------------------
        async check(commitSha, onProgress) {
            const T = getT();
            const report = onProgress || function () {};
            if (!commitSha) return null;

            this._busy = true;
            this._cancelled = false;
            try {
                report({ phase: 'check', text: fmt(T.logChecking, shortSha(commitSha)) });

                // The history already carries the metadata; only a build reached
                // by some other route has to be looked up.
                let commit = this.commitInfo(commitSha);
                if (!commit) {
                    const raw = await githubApi(`/repos/${OWNER}/${REPO}/commits/${encodeURIComponent(commitSha)}`); // i18n-ignore: api path
                    if (!raw || !raw.sha) throw new Error('build ' + shortSha(commitSha) + ' not found'); // i18n-ignore: diagnostic
                    const full = raw.commit ? String(raw.commit.message || '') : '';
                    commit = {
                        sha: raw.sha,
                        date: raw.commit && raw.commit.author ? raw.commit.author.date : null,
                        author: raw.commit && raw.commit.author ? raw.commit.author.name : '',
                        message: messageTitle(full),
                        body: messageBody(full)
                    };
                }

                const tree = await githubApi(`/repos/${OWNER}/${REPO}/git/trees/${commit.sha}?recursive=1`); // i18n-ignore: api path
                if (tree.truncated) {
                    // A partial listing would quietly leave files behind, so refuse it.
                    throw new Error('the file listing came back truncated'); // i18n-ignore: diagnostic
                }
                const blobs = (tree.tree || []).filter(e => e.type === 'blob' && isSafePath(e.path));
                if (!blobs.length) throw new Error('the build holds no files we may write'); // i18n-ignore: diagnostic

                const changed = [];
                for (let i = 0; i < blobs.length; i++) {
                    if (this._cancelled) throw new Error('cancelled');
                    const entry = blobs[i];
                    const local = nodePath.join(BASE_DIR, entry.path);
                    const st = await statAsync(local);
                    const remoteSize = entry.size || 0;
                    if (!st || !st.isFile()) {
                        changed.push({ path: entry.path, sha: entry.sha, size: remoteSize, isNew: true });
                    } else if (st.size === remoteSize) {
                        // Same length: only the plain hash can make them equal.
                        const hash = await this.localHash(entry.path, st, false);
                        if (hash.sha !== entry.sha) {
                            changed.push({ path: entry.path, sha: entry.sha, size: remoteSize, isNew: false });
                        }
                    } else if (st.size > remoteSize) {
                        // Longer than the blob: it may be the very same text with
                        // CRLF endings, which is the only difference that makes a
                        // local file grow. Anything else really has changed.
                        const hash = await this.localHash(entry.path, st, true);
                        if (hash.shaLF !== entry.sha) {
                            changed.push({ path: entry.path, sha: entry.sha, size: remoteSize, isNew: false });
                        }
                    } else {
                        changed.push({ path: entry.path, sha: entry.sha, size: remoteSize, isNew: false });
                    }
                    if (i % 40 === 0) {
                        report({ phase: 'check', text: fmt(T.logCompare, i + 1, blobs.length), ratio: (i + 1) / blobs.length });
                        await sleepFrame();
                    }
                }
                this.saveHashes();

                const plan = {
                    branch: this.branchName(),
                    sha: commit.sha,
                    date: commit.date,
                    author: commit.author,
                    message: commit.message,
                    body: commit.body || '',
                    total: blobs.length,
                    changed: changed,
                    bytes: changed.reduce((sum, c) => sum + (c.size || 0), 0),
                    checkedAt: Date.now()
                };
                this._plans[commit.sha] = plan;

                report({
                    phase: 'checked',
                    text: changed.length
                        ? fmt(T.logFound, changed.length, shortSha(commit.sha))
                        : fmt(T.logUpToDate, shortSha(commit.sha)),
                    ratio: 1
                });

                // Nothing to fetch means this build is the one we are running.
                if (!changed.length) {
                    this._markInstalled(commit.sha, plan.date, plan.message);
                }
                return plan;
            } finally {
                this._busy = false;
            }
        },

        // ---------------------------------------------------------------------
        // Install, download everything first, replace only when all of it is here
        // ---------------------------------------------------------------------
        async install(commitSha, onProgress) {
            const T = getT();
            const plan = this._plans[commitSha];
            const report = onProgress || function () {};
            if (!DOWNLOADS_ENABLED) {
                report({ phase: 'blocked', text: T.downloadsOff });
                return null;
            }
            if (!plan || !plan.changed.length) return null;

            // What this switch crosses has to be read while the installed record
            // still names the build being left behind.
            const majorCrossed = this.majorAhead(plan.sha);

            this._busy = true;
            this._cancelled = false;
            try {
                rmrf(TMP_DIR);
                mkdirp(TMP_DIR);

                const queue = plan.changed.slice();
                const total = queue.length;
                let done = 0;
                let failure = null;

                const worker = async () => {
                    for (;;) {
                        if (failure || this._cancelled) return;
                        const entry = queue.shift();
                        if (!entry) return;
                        try {
                            const body = await httpsGet(rawUrl(plan.sha, entry.path));
                            const sha = blobSha(body);
                            if (sha !== entry.sha) {
                                throw new Error('checksum mismatch for ' + entry.path); // i18n-ignore: diagnostic
                            }
                            const dest = nodePath.join(TMP_DIR, entry.path);
                            mkdirp(nodePath.dirname(dest));
                            await writeFileAsync(dest, body);
                            done++;
                            report({
                                phase: 'download',
                                text: fmt(T.logDownload, done, total, entry.path),
                                ratio: done / total
                            });
                        } catch (e) {
                            failure = new Error(entry.path + ', ' + e.message);
                            return;
                        }
                    }
                };

                const workers = [];
                for (let i = 0; i < Math.min(CONCURRENCY, total); i++) workers.push(worker());
                await Promise.all(workers);

                if (failure) {
                    // Nothing has been touched outside the staging folder yet.
                    rmrf(TMP_DIR);
                    throw failure;
                }
                if (this._cancelled) {
                    rmrf(TMP_DIR);
                    report({ phase: 'cancelled', text: T.logCancel, ratio: 0 });
                    return null;
                }

                // Every file is on disk and verified: now swap them in.
                report({ phase: 'apply', text: T.logApplying, ratio: 1 });
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupRoot = nodePath.join(BACKUP_DIR, stamp);
                let backedUp = 0;

                for (const entry of plan.changed) {
                    const target = nodePath.join(BASE_DIR, entry.path);
                    const staged = nodePath.join(TMP_DIR, entry.path);
                    if (!fs.existsSync(staged)) continue;
                    if (fs.existsSync(target)) {
                        const backup = nodePath.join(backupRoot, entry.path);
                        mkdirp(nodePath.dirname(backup));
                        try {
                            fs.copyFileSync(target, backup);
                            backedUp++;
                        } catch (e) {
                            console.warn(PLUGIN_NAME + ': could not back up ' + entry.path, e);
                        }
                    }
                    moveFile(staged, target);

                    const st = await statAsync(target);
                    if (st) this.hashes()[entry.path] = { size: st.size, mtimeMs: st.mtimeMs, sha: entry.sha };
                }

                this.saveHashes();
                rmrf(TMP_DIR);
                this.pruneBackups();

                this._markInstalled(plan.sha, plan.date, plan.message, majorCrossed);
                // The badge is numbered from the state file, so the build just
                // installed is numbered now rather than on the next launch.
                try {
                    await this.buildCountFor(plan.sha);
                } catch (e) {
                    console.warn(PLUGIN_NAME + ': could not resolve the build number', e);
                }
                // A build that is now the one running is no longer an update.
                if (this._auto) {
                    this._auto.available = false;
                    this._auto.build = this.buildNumber();
                    this._auto.major = false;
                    this._auto.majorInstalled = this.majorInstalled();
                }

                // Every other plan was measured against the files we just
                // replaced, so they have to be checked again.
                this._plans = {};
                plan.changed = [];
                plan.bytes = 0;
                this._plans[plan.sha] = plan;
                this._restartPending = true;
                // CHANGELOG.txt is one of the files just swapped in.
                forgetChangelog();

                if (backedUp) {
                    report({ phase: 'apply', text: fmt(T.logBackup, 'save/updater/backup/' + stamp) });
                }
                report({ phase: 'done', text: T.logDone, ratio: 1 });
                if (majorCrossed) report({ phase: 'done', text: T.logMajor, ratio: 1 });
                return plan;
            } finally {
                this._busy = false;
            }
        },

        pruneBackups() {
            try {
                if (!fs.existsSync(BACKUP_DIR)) return;
                const entries = fs.readdirSync(BACKUP_DIR).sort();
                while (entries.length > KEEP_BACKUPS) {
                    rmrf(nodePath.join(BACKUP_DIR, entries.shift()));
                }
            } catch (e) {
                console.warn(PLUGIN_NAME + ': could not prune backups', e);
            }
        },

        // Closes the game outright rather than reloading it in place. A reload
        // picks up the replaced asset files but leaves anything node's own
        // module loader had already cached (a required plugin file among them)
        // reading from the old copy, so the only way every replaced file is
        // guaranteed to load is a real close, with the player reopening it.
        //
        // Whatever asked for the close, the last thing on screen is the same
        // full-screen notice, held for a second: the window disappearing under
        // the player is then plainly the update finishing and not a crash.
        restart() {
            if (this._closing) return;
            this._closing = true;
            showClosingNotice();
            setTimeout(() => this._quit(), CLOSING_NOTICE_MS);
        },

        _quit() {
            try {
                if (typeof nw !== 'undefined' && nw.App && typeof nw.App.quit === 'function') {
                    nw.App.quit();
                    return;
                }
            } catch (e) { /* fall through */ }
            try {
                if (typeof SceneManager !== 'undefined' && typeof SceneManager.exit === 'function') {
                    SceneManager.exit();
                    return;
                }
            } catch (e) { /* fall through */ }
            try { window.close(); } catch (e) { /* fall through */ }
        }
    };

    window.GameUpdater = GameUpdater;

    // Playing is what makes the cached branch answer old news: the map is where
    // a session spends its time, so entering it is the mark that the next visit
    // to the title has to read the branch again. Coming back from the options,
    // the credits or the updater screen itself rebuilds the title just the same
    // and is deliberately NOT marked, since nothing can have changed in the
    // second the player spent there.
    if (isAvailable() && typeof Scene_Map !== 'undefined') {
        const _sceneMapStart = Scene_Map.prototype.start;
        Scene_Map.prototype.start = function () {
            _sceneMapStart.call(this);
            GameUpdater.noteSessionPlayed();
        };
    }

    // =========================================================================
    // Input manager
    // =========================================================================
    const UpdaterInput = {
        _scene: null,
        _active: false,

        activate(scene) { this._scene = scene; this._active = true; },
        deactivate()    { this._active = false; this._scene = null; },

        update() {
            if (!this._active || !this._scene) return;
            const scene = this._scene;

            // WASD hold-repeat simulation, same shape as the mod manager screen.
            for (const dir of ['up', 'down', 'left', 'right']) {
                if (scene._wasdHeld[dir]) {
                    scene._wasdHoldFrames[dir]++;
                    const t = scene._wasdHoldFrames[dir];
                    if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
                        scene._wasdInput[dir] = true;
                    }
                } else {
                    scene._wasdHoldFrames[dir] = 0;
                }
            }

            const isUp    = Input.isRepeated('up')    || scene._wasdInput.up;
            const isDown  = Input.isRepeated('down')  || scene._wasdInput.down;
            const isLeft  = Input.isRepeated('left')  || scene._wasdInput.left;
            const isRight = Input.isRepeated('right') || scene._wasdInput.right;
            scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;

            if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                if (scene._isWorking()) {
                    SoundManager.playCancel();
                    scene._cancelWork();
                } else if (scene._section === 'actions') {
                    SoundManager.playCancel();
                    scene._section = 'builds';
                    scene._selectionChanged();
                } else {
                    SoundManager.playCancel();
                    SceneManager.pop();
                }
                return;
            }

            // The tabs sit above both panels, so their keys work from either
            // one rather than asking the player to walk back to the list first.
            if (Input.isTriggered('pageup'))   { scene._stepChannel(-1); return; }
            if (Input.isTriggered('pagedown')) { scene._stepChannel(1);  return; }

            if (scene._section === 'builds') {
                const total = GameUpdater.commits().length;
                if (isUp && scene._buildIndex > 0) {
                    scene._buildIndex--;
                    SoundManager.playCursor();
                    scene._selectionChanged();
                } else if (isDown && scene._buildIndex < total - 1) {
                    scene._buildIndex++;
                    SoundManager.playCursor();
                    scene._selectionChanged();
                } else if (isRight) {
                    scene._section = 'actions';
                    scene._actionIndex = 0;
                    SoundManager.playCursor();
                    scene._selectionChanged();
                }
                if (Input.isTriggered('ok')) scene._useSelectedBuild();
            } else {
                const actions = scene._actions();
                if (isUp && scene._actionIndex > 0) {
                    scene._actionIndex--;
                    SoundManager.playCursor();
                    scene._updateActionHighlight();
                } else if (isDown && scene._actionIndex < actions.length - 1) {
                    scene._actionIndex++;
                    SoundManager.playCursor();
                    scene._updateActionHighlight();
                } else if (isLeft) {
                    scene._section = 'builds';
                    SoundManager.playCursor();
                    scene._selectionChanged();
                }
                if (Input.isTriggered('ok')) {
                    const action = actions[scene._actionIndex];
                    if (action) scene._runAction(action.key);
                }
            }
        }
    };

    // =========================================================================
    // Scene_GameUpdater
    // =========================================================================
    class Scene_GameUpdater extends Scene_MenuBase {
        create() {
            super.create();

            this._wasdInput      = { up: false, down: false, left: false, right: false };
            this._wasdHeld       = { up: false, down: false, left: false, right: false };
            this._wasdHoldFrames = { up: 0,     down: 0,     left: 0,     right: 0     };

            this._wasdListener = (e) => {
                if (e.repeat) return;
                const k = e.key.toLowerCase();
                if (k === 'w') { this._wasdInput.up    = true; this._wasdHeld.up    = true; e.preventDefault(); }
                if (k === 's') { this._wasdInput.down  = true; this._wasdHeld.down  = true; e.preventDefault(); }
                if (k === 'a') { this._wasdInput.left  = true; this._wasdHeld.left  = true; e.preventDefault(); }
                if (k === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; e.preventDefault(); }
            };
            this._wasdUpListener = (e) => {
                const k = e.key.toLowerCase();
                if (k === 'w') { this._wasdHeld.up    = false; this._wasdHoldFrames.up    = 0; }
                if (k === 's') { this._wasdHeld.down  = false; this._wasdHoldFrames.down  = 0; }
                if (k === 'a') { this._wasdHeld.left  = false; this._wasdHoldFrames.left  = 0; }
                if (k === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
            };
            window.addEventListener('keydown', this._wasdListener);
            window.addEventListener('keyup',   this._wasdUpListener);

            this._buildIndex   = 0;
            this._section      = 'builds';
            this._actionIndex  = 0;
            // The automatic update runs once per opening, and once again for
            // each tab the player switches to.
            this._autoRan      = false;
            this._log          = [];
            this._progress     = null;
            this._status       = {};   // commit sha -> 'checking' | 'failed'
            // A switch is a compare and a download back to back, so the screen
            // stays busy across the gap between them.
            this._working      = false;
            this._cancelRequested = false;
            this._progressDirty = false;
            this._dom          = null; // the page, built once and then kept
            this._cache        = {};   // region key -> the markup already on screen

            this._container = document.createElement('div');
            this._container.id = 'game-updater-container';
            document.body.appendChild(this._container);

            this._refreshDOM();
            UpdaterInput.activate(this);
            setTimeout(() => { if (this._container) this._container.classList.add('gu-shown'); }, 16);

            // Opening the screen is itself the request for an update: the
            // branch is read and the newest build taken, without a press.
            this._autoStart();
        }

        update() {
            Scene_MenuBase.prototype.update.call(this);
            UpdaterInput.update();
            if (this._progressDirty) {
                this._progressDirty = false;
                this._updateProgressDOM();
            }
        }

        terminate() {
            if (this._wasdListener) {
                window.removeEventListener('keydown', this._wasdListener);
                window.removeEventListener('keyup',   this._wasdUpListener);
                this._wasdListener = this._wasdUpListener = null;
            }
            UpdaterInput.deactivate();
            if (this._container) {
                const c = this._container;
                c.classList.remove('gu-shown');
                c.classList.add('gu-closing');
                setTimeout(() => { if (c.parentNode) c.parentNode.removeChild(c); }, 200);
                this._container = null;
                this._dom = null;
                this._cache = {};
            }
            Scene_MenuBase.prototype.terminate.call(this);
        }

        // -- state -----------------------------------------------------------

        _selectedBuild() {
            const list = GameUpdater.commits();
            if (!list.length) return null;
            this._buildIndex = Math.max(0, Math.min(this._buildIndex, list.length - 1));
            return list[this._buildIndex];
        }

        // The model is idle for a moment between the compare and the download
        // of the same switch; to the player that is one running job.
        _isWorking() {
            return GameUpdater.isBusy() || this._working;
        }

        _cancelWork() {
            this._cancelRequested = true;
            GameUpdater.cancel();
        }

        _buildStatus(commit) {
            const T = getT();
            if (!commit) return { text: T.unchecked, cls: 'gu-badge--idle' };
            if (this._status[commit.sha] === 'checking') return { text: T.checking, cls: 'gu-badge--busy' };
            if (this._status[commit.sha] === 'failed')   return { text: T.failed,   cls: 'gu-badge--bad' };
            if (GameUpdater.isCurrentVersion(commit)) {
                return { text: T.upToDate, cls: 'gu-badge--ok' };
            }
            const plan = GameUpdater.plan(commit.sha);
            if (!plan) return { text: T.unchecked, cls: 'gu-badge--idle' };
            if (plan.changed.length) {
                // Going back down the list is a rollback, not an update.
                const older = GameUpdater.indexOf(commit.sha) > 0;
                return { text: older ? T.differs : T.available, cls: 'gu-badge--new' };
            }
            return { text: T.upToDate, cls: 'gu-badge--ok' };
        }

        // Switching to a build is one action: it compares the files and, when
        // any of them differ, downloads and applies them without asking again.
        _actions() {
            const T = getT();
            const commit = this._selectedBuild();
            const plan = commit ? GameUpdater.plan(commit.sha) : null;
            const list = [];
            if (this._isWorking()) {
                list.push({ key: 'cancel', label: T.actCancel });
                return list;
            }
            if (!isAvailable()) return list;
            // A copy behind a major update cannot be finished by patching, so
            // the whole game is offered above everything else. The ordinary
            // install stays under it: a player who wants the files anyway can
            // still take them, warned by the note that they are only half of it.
            if (this._majorPending() || GameUpdater.majorInstalled()) {
                list.push({ key: 'fullDownload', label: T.actFullDownload });
            }
            // Offered before the build list is even read, since it is the answer
            // to a notice that stands whatever the branch holds.
            if (GameUpdater.majorInstalled()) {
                list.push({ key: 'majorDone', label: T.actMajorDone });
            }
            if (!GameUpdater.commits().length) {
                list.push({ key: 'history', label: T.actHistory });
                return list;
            }
            // A build already known to match the files here has nothing to do,
            // so the one button is only offered while there is work in it.
            if (DOWNLOADS_ENABLED && !GameUpdater.isCurrentVersion(commit) &&
                !(plan && !plan.changed.length)) {
                const isRollback = GameUpdater.indexOf(commit.sha) > 0;
                const verb = isRollback ? T.actRollback : T.actInstall;
                // The size is only known once the build has been compared; an
                // unchecked one is switched to just the same, it simply cannot
                // say beforehand how much of it will come down.
                list.push({
                    key: 'switch',
                    label: (plan && plan.changed.length)
                        ? fmt('%1 (%2)', verb, formatBytes(plan.bytes))
                        : verb
                });
            }
            // Comparing without downloading stays available for a build nobody
            // has looked at yet, so its file list can be read first.
            if (!plan) list.push({ key: 'check', label: T.actCheck });
            if (!GameUpdater.historyExhausted()) {
                list.push({ key: 'more', label: T.actMore });
            }
            if (GameUpdater.needsRestart()) {
                list.push({ key: 'restart', label: T.actRestart });
            }
            return list;
        }

        // An empty list once the branch has been read means the newest build is
        // the origin, which is never listed, so the player already has it.
        _emptyText(T) {
            return GameUpdater.historyExhausted() ? T.noNewer : T.noBuilds;
        }

        _pushLog(text) {
            if (!text) return;
            if (this._log[this._log.length - 1] === text) return;
            this._log.push(text);
            if (this._log.length > 6) this._log.shift();
        }

        _onProgress(info) {
            if (!info) return;
            if (info.text) this._pushLog(info.text);
            this._progress = (typeof info.ratio === 'number') ? info.ratio : this._progress;
            this._progressDirty = true;
        }

        // -- actions ---------------------------------------------------------

        // OK on a build switches the game to it: comparing, downloading and
        // applying are one press, whether or not it has been checked before.
        _useSelectedBuild() {
            const commit = this._selectedBuild();
            if (!isAvailable() || this._isWorking() || !commit) return;
            const blocked = GameUpdater.isCurrentVersion(commit);
            this._runAction((DOWNLOADS_ENABLED && !blocked) ? 'switch' : 'check');
        }

        // Whether switching to the highlighted build would cross a major
        // update, i.e. whether this copy is behind one. That is the state
        // neither screen can answer with a patch.
        _majorPending() {
            const commit = this._selectedBuild();
            return !!(commit && GameUpdater.majorAhead(commit.sha));
        }

        // Opening the screen reads the build list and compares the newest
        // build against the files here, so the list can say straight away
        // whether an update is owed. Nothing is downloaded until the player
        // asks for it.
        //
        // Two things hold it back. A build already fetched and waiting only on
        // the game closing has nothing left to download; and the title screen's
        // own launch check may still be reading the branch, in which case this
        // takes that answer when it lands rather than asking GitHub the same
        // question a second time.
        _autoStart() {
            if (!isAvailable() || this._autoRan) return;
            this._autoRan = true;
            if (GameUpdater.needsRestart()) return;
            if (GameUpdater.autoPending()) {
                GameUpdater.autoCheck().then(() => {
                    if (SceneManager._scene !== this || !this._container) return;
                    this._refreshDOM();
                    this._autoRun();
                });
                return;
            }
            // A list already read for this tab (by the launch check, or by an
            // earlier visit to this screen) is the same list a fresh read would
            // return, so it is used as it stands.
            if (GameUpdater.commits().length) this._autoRun();
            else this._loadHistory(false, () => this._autoRun());
        }

        // Take the newest build of the branch on show: compare it, then install
        // whatever differs. The one thing this will not do is cross a major
        // update, which _runSwitch stops at because a patched copy is not a
        // whole one.
        _autoRun() {
            if (!isAvailable() || this._isWorking()) return;
            const latest = GameUpdater.commits()[0];
            if (!latest) return;
            this._buildIndex = 0;
            this._selectionChanged();
            // Opening the screen only asks the question: the newest build is
            // compared so the list can say whether anything is owed, and the
            // download waits for the player to ask for it.
            this._runAction('check');
        }

        // -- channels --------------------------------------------------------

        _stepChannel(delta) {
            const list = GameUpdater.channels();
            if (list.length < 2) return;
            const at = list.findIndex(c => c.key === GameUpdater.channel());
            const next = list[((at < 0 ? 0 : at) + delta + list.length) % list.length];
            this._switchChannel(next.key);
        }

        // Moving to the other tab reads that branch and takes its newest build
        // the same way opening the screen does, so choosing UNSTABLE is the
        // whole of switching to it rather than the first half.
        _switchChannel(key) {
            const T = getT();
            if (!isAvailable() || this._isWorking()) return;
            if (!GameUpdater.setChannel(key)) return;
            SoundManager.playOk();
            this._buildIndex  = 0;
            this._actionIndex = 0;
            this._section     = 'builds';
            this._status      = {};
            this._progress    = null;
            this._pushLog(fmt(T.logChannel, GameUpdater.branchName()));
            this._refreshDOM();
            this._autoRan = false;
            this._autoStart();
        }

        // `thenCheck` chains what happens once the list is in: a function is
        // called, anything else truthy runs the ordinary check. That is how
        // opening the screen answers "is there a new build" on its own.
        _loadHistory(more, thenCheck) {
            const T = getT();
            if (!isAvailable() || this._isWorking()) return;
            const before = GameUpdater.commits().length;
            this._progress = 0;
            this._refreshDOM();
            GameUpdater.loadHistory(more, (info) => this._onProgress(info))
                .then(() => {
                    this._progress = null;
                    if (more && GameUpdater.commits().length > before) {
                        this._buildIndex = before;
                    }
                    if (more && GameUpdater.commits().length === before) {
                        this._pushLog(T.logNoMore);
                    }
                    this._refreshDOM();
                    if (!thenCheck || !GameUpdater.commits().length) return;
                    if (typeof thenCheck === 'function') thenCheck();
                    else this._runAction('check');
                })
                .catch((err) => {
                    this._progress = null;
                    this._pushLog(fmt(T.logError, err.message));
                    this._refreshDOM();
                });
        }

        _runAction(key) {
            const T = getT();
            const commit = this._selectedBuild();

            if (key === 'cancel') {
                SoundManager.playCancel();
                this._cancelWork();
                return;
            }
            if (!isAvailable()) {
                SoundManager.playBuzzer();
                this._pushLog(T.noNode);
                this._refreshDOM();
                return;
            }
            if (this._isWorking()) return;

            if (key === 'history' || key === 'more') {
                SoundManager.playOk();
                this._loadHistory(key === 'more', key === 'history');
                return;
            }
            // The one thing this screen cannot do for the player: the whole
            // game is a download of its own, so the link goes to their browser.
            if (key === 'fullDownload') {
                SoundManager.playOk();
                GameUpdater.openFullDownload();
                this._pushLog(fmt(T.logFullDownload, GameUpdater.fullDownloadUrl()));
                this._refreshDOM();
                return;
            }
            if (key === 'restart') {
                SoundManager.playOk();
                this._pushLog(T.logClosing);
                this._refreshDOM();
                setTimeout(() => GameUpdater.restart(), 1400);
                return;
            }
            // The player says they have downloaded the game again, which is the
            // only thing that answers a major update.
            if (key === 'majorDone') {
                SoundManager.playOk();
                GameUpdater.clearMajorNotice();
                this._pushLog(T.logMajorCleared);
                // The button it was pressed on has just left the list.
                this._actionIndex = 0;
                this._refreshDOM();
                return;
            }
            if (!commit) {
                SoundManager.playBuzzer();
                return;
            }
            const sha = commit.sha;
            if (key === 'check') {
                SoundManager.playOk();
                this._status[sha] = 'checking';
                this._progress = 0;
                this._refreshDOM();
                GameUpdater.check(sha, (info) => this._onProgress(info))
                    .then(() => {
                        delete this._status[sha];
                        this._progress = null;
                        this._refreshDOM();
                    })
                    .catch((err) => {
                        this._status[sha] = 'failed';
                        this._progress = null;
                        this._pushLog(fmt(T.logError, err.message));
                        this._refreshDOM();
                    });
                return;
            }
            if (key === 'switch' || key === 'install') {
                if (!DOWNLOADS_ENABLED) {
                    SoundManager.playBuzzer();
                    this._pushLog(T.downloadsOff);
                    this._refreshDOM();
                    return;
                }
                SoundManager.playOk();
                this._runSwitch(sha);
            }
        }

        // The whole switch, in one press: compare the build with what is here,
        // then download and apply whatever differs. A build already compared
        // skips straight to the download, and one that holds nothing new simply
        // reports so.
        //
        // `auto` marks the run nobody asked for by name, the one opening the
        // screen or switching tab starts. That one stops short of installing
        // across a major update: patching a copy over one leaves it half on the
        // old build, and the only thing that finishes it is a download this
        // screen cannot do. The player is told so and the buttons under the
        // notice, the whole game first, are left for them to choose from.
        _runSwitch(sha, auto) {
            const T = getT();
            const onProgress = (info) => this._onProgress(info);
            const finish = () => {
                this._working = false;
                this._cancelRequested = false;
                this._progress = null;
                delete this._status[sha];
                this._actionIndex = 0;
                this._refreshDOM();
            };

            this._working = true;
            this._cancelRequested = false;
            this._status[sha] = 'checking';
            this._progress = 0;
            this._refreshDOM();

            const known = GameUpdater.plan(sha);
            const compared = known ? Promise.resolve(known) : GameUpdater.check(sha, onProgress);
            compared
                .then((plan) => {
                    delete this._status[sha];
                    if (this._cancelRequested) {
                        this._pushLog(T.logCancel);
                        return null;
                    }
                    // Nothing to fetch: the compare has already recorded this
                    // build as the one running.
                    if (!plan || !plan.changed.length) return null;
                    const major = auto ? GameUpdater.majorAhead(sha) : null;
                    if (major) {
                        this._pushLog(fmt(T.logMajorHold, major.message || shortSha(major.sha)));
                        this._pushLog(fmt(T.logFullDownloadHint, GameUpdater.fullDownloadUrl()));
                        return null;
                    }
                    this._progress = 0;
                    this._refreshDOM();
                    return GameUpdater.install(sha, onProgress);
                })
                .then(finish)
                .catch((err) => {
                    // A compare stopped by the player is not a failure: it is
                    // simply unanswered, so the badge goes back to unchecked.
                    const aborted = this._cancelRequested;
                    // A build that never got compared has no answer to show, so
                    // its badge says so; one that failed while downloading keeps
                    // the answer the compare gave and reports the error in the log.
                    if (!aborted && !GameUpdater.plan(sha)) this._status[sha] = 'failed';
                    else delete this._status[sha];
                    this._pushLog(aborted ? T.logCancel : fmt(T.logError, err.message));
                    this._working = false;
                    this._cancelRequested = false;
                    this._progress = null;
                    this._refreshDOM();
                });
        }

        // -- HTML ------------------------------------------------------------
        //
        // The page is built once and then kept: every refresh writes a region
        // only when that region's markup really changed, and the cursor itself
        // is a class on nodes that are never rebuilt. Moving through the list
        // therefore touches no innerHTML at all, so nothing flickers, no scroll
        // position is lost and no hover state is dropped underneath the mouse.

        _buildSkeleton(T) {
            this._container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page" id="gu-left-page">
                        <div class="page-header-bar">
                            <button class="back-button focusable" id="gu-back-btn">${T.back}</button>
                            <h2 class="title">${T.title}</h2>
                        </div>
                        <div class="backpack-tabs" id="gu-tabs"></div>
                        <div class="inspect-section-title" id="gu-build-header"></div>
                        <div class="ui-list ui-scroll" id="gu-build-list"></div>
                        <div class="gu-console">
                            <div class="gu-log ui-scroll" id="gu-log"></div>
                            <div class="gu-progress gu-progress--idle" id="gu-progress">
                                <div class="gu-progress-fill" id="gu-progress-fill"></div>
                            </div>
                        </div>
                        <div class="mod-hint-bar" id="gu-hint"></div>
                    </div>
                    <div class="right-page" id="gu-right-page">
                        <div class="ui-detail">
                            <div class="ui-detail-head">
                                <div class="ui-detail-titles">
                                    <h3 id="gu-name"></h3>
                                    <div class="ui-detail-sub" id="gu-status"></div>
                                </div>
                            </div>
                            <div class="ui-detail-scroll ui-scroll">
                                <div class="gu-note" id="gu-note" hidden></div>
                                <div class="inspect-spec-grid" id="gu-specs"></div>
                                <div class="gu-changelog" id="gu-changelog" hidden></div>
                                <div class="gu-files" id="gu-files" hidden></div>
                            </div>
                            <div class="inspect-actions" id="gu-actions"></div>
                        </div>
                    </div>
                </div>`;

            const q = (sel) => this._container.querySelector(sel);
            this._dom = {
                tabs:     q('#gu-tabs'),
                header:   q('#gu-build-header'),
                hint:     q('#gu-hint'),
                list:     q('#gu-build-list'),
                log:      q('#gu-log'),
                progress: q('#gu-progress'),
                fill:     q('#gu-progress-fill'),
                name:     q('#gu-name'),
                status:   q('#gu-status'),
                note:     q('#gu-note'),
                specs:    q('#gu-specs'),
                changelog: q('#gu-changelog'),
                actions:  q('#gu-actions'),
                files:    q('#gu-files')
            };
            this._cache = {};

            // The back button lives in the skeleton, so it is wired once.
            const back = q('#gu-back-btn');
            if (back) {
                back.addEventListener('click', () => {
                    SoundManager.playCancel();
                    if (this._isWorking()) this._cancelWork();
                    else SceneManager.pop();
                });
            }
        }

        // Writes a region only when its markup differs from what is on screen,
        // and says whether it had to.
        _setRegion(key, node, html) {
            if (!node || this._cache[key] === html) return false;
            this._cache[key] = html;
            node.innerHTML = html;
            return true;
        }

        // The channel strip. Two branches means two tabs; a build that ships a
        // single branch draws none at all, which is the screen as it was before
        // the unstable one existed.
        _tabsHTML(T) {
            const list = GameUpdater.channels();
            if (list.length < 2) return '';
            const label = { stable: T.tabStable, unstable: T.tabUnstable };
            const current = GameUpdater.channel();
            return list.map(ch => `
                <button class="backpack-tab focusable gu-tab${ch.key === current ? ' selected' : ''}" tabindex="0" data-channel="${esc(ch.key)}">
                    <span class="gu-tab-name">${esc(label[ch.key] || ch.key.toUpperCase())}</span>
                    <span class="gu-tab-branch">${esc(ch.branch)}</span>
                </button>`).join('');
        }

        _renderTabs(T) {
            const html = this._tabsHTML(T);
            if (this._setRegion('tabs', this._dom.tabs, html)) this._wireTabs();
            if (this._dom.tabs) this._dom.tabs.hidden = !html;
        }

        _wireTabs() {
            if (!this._dom.tabs) return;
            this._dom.tabs.querySelectorAll('.backpack-tab[data-channel]').forEach(btn => {
                btn.addEventListener('click', () => this._switchChannel(btn.dataset.channel));
            });
        }

        _buildListHTML(T) {
            const commits = GameUpdater.commits();
            if (!commits.length) {
                return `<div class="ui-empty"><div class="ui-empty-text">${esc(this._emptyText(T))}</div></div>`;
            }
            // Neither the cursor nor the check badge is in here: both are
            // applied to the standing nodes afterwards, so moving the cursor or
            // checking a build never rewrites a single row.
            return commits.map((commit, i) => {
                const tag = GameUpdater.isInstalled(commit.sha) ? T.tagInstalled
                    : (i === 0 ? T.tagLatest : '');
                // A major build wears its own mark, beside whichever of the two
                // above it already carries.
                const major = isMajorCommit(commit);
                const title = messageTitle(commit.message) || T.unknown;
                const name = GameUpdater._versionName(title) || title;
                const sub = [shortSha(commit.sha), formatDate(commit.date) || T.unknown, commit.author || '']
                    .filter(Boolean).join('  ·  ');
                return `
                    <div class="item-slot gu-build focusable" data-idx="${i}" tabindex="0">
                        <div class="item-slot-info">
                            <div class="item-slot-name">${esc(name)}</div>
                            <div class="item-slot-meta">${esc(sub)}</div>
                        </div>
                        ${major ? `<span class="ui-chip gu-chip--major">${esc(T.tagMajor)}</span>` : ''}
                        ${tag ? `<span class="ui-chip">${esc(tag)}</span>` : ''}
                        <span class="gu-badge"></span>
                    </div>`;
            }).join('');
        }

        _renderBuildList(T) {
            const node = this._dom.list;
            const html = this._buildListHTML(T);
            if (!node || this._cache.list === html) return;
            // A rebuilt list would otherwise jump back to the top under the
            // cursor, which reads as a flicker of its own.
            const top = node.scrollTop;
            this._cache.list = html;
            node.innerHTML = html;
            node.scrollTop = top;
            this._wireBuildRows();
        }

        _specsHTML(T) {
            const commit = this._selectedBuild();
            const plan = commit ? GameUpdater.plan(commit.sha) : null;
            const installed = GameUpdater.installedInfo();
            const position = commit ? GameUpdater.indexOf(commit.sha) : -1;

            const row = (label, value) => `
                <div class="inspect-spec-row">
                    <span class="inspect-spec-label">${esc(label)}</span>
                    <span class="inspect-spec-value">${esc(value)}</span>
                </div>`;

            let specs = '';
            specs += row(T.branch, GameUpdater.branchName());
            // What this copy calls itself, read off the changelog it shipped
            // with. A build without one simply has no row.
            const ownVersion = GameUpdater.gameVersion();
            if (ownVersion) specs += row(T.version, ownVersion);
            const ownCommit = installed ? null : GameUpdater.currentVersionCommit();
            specs += row(T.installed, installed
                ? `${shortSha(installed.sha)}  (${formatDate(installed.at ? new Date(installed.at).toISOString() : null) || T.unknown})`
                : (ownCommit
                    ? `${shortSha(ownCommit.sha)}  (${formatDate(ownCommit.date) || T.unknown})`
                    : T.never));
            // The number the version badge wears, when this copy knows it.
            const ownBuild = GameUpdater.buildNumber();
            if (ownBuild !== null) specs += row(T.buildNumber, ownBuild);
            if (commit) {
                specs += row(T.selected, shortSha(commit.sha));
                specs += row(T.committed, formatDate(commit.date) || T.unknown);
                if (commit.author) specs += row(T.author, commit.author);
                if (commit.message) specs += row(T.message, commit.message);
                specs += row(T.age, position <= 0 ? T.tagLatest : fmt(T.buildsBack, position));
            }
            if (plan) {
                specs += row(T.tracked, plan.total);
                specs += row(DOWNLOADS_ENABLED ? T.toUpdate : T.changedFiles, plan.changed.length);
                if (DOWNLOADS_ENABLED && plan.changed.length) specs += row(T.download, formatBytes(plan.bytes));
            }
            specs += `
                <div class="inspect-spec-row">
                    <span class="inspect-spec-label">${esc(T.source)}</span>
                    <span class="inspect-spec-value mod-path-value">${esc(GameUpdater.REPO_URL)}</span>
                </div>`;
            return specs;
        }

        // What the selected build says about itself, under its title: the body
        // of its commit message, one line per entry, with list markers turned
        // into bullets. A build whose message is a title alone shows nothing.
        _changelogHTML(T) {
            const commit = this._selectedBuild();
            const body = commit && commit.body ? String(commit.body) : '';
            if (!body.trim()) return '';
            const lines = body.split('\n').map(l => l.replace(/\s+$/, ''))
                .filter(l => l.trim().length);
            if (!lines.length) return '';
            return `
                <div class="inspect-section-title">${esc(T.changelog || T.message || '')}</div>
                ${lines.map(line => {
                    const item = /^\s*[-*•]\s+/.test(line);
                    const text = item ? line.replace(/^\s*[-*•]\s+/, '') : line.trim();
                    return `<div class="gu-changelog-line${item ? ' gu-changelog-line--item' : ''}">${esc(text)}</div>`;
                }).join('')}`;
        }

        _filesHTML(T) {
            const commit = this._selectedBuild();
            const plan = commit ? GameUpdater.plan(commit.sha) : null;
            if (!plan || !plan.changed.length) return '';
            const shown = plan.changed.slice(0, 60);
            const rest  = plan.changed.length - shown.length;
            return `
                <div class="inspect-section-title">${DOWNLOADS_ENABLED ? T.listHeader : T.listHeaderChanged}</div>
                ${shown.map(c => `<div class="gu-file-row"><span class="gu-file-flag">${c.isNew ? '+' : '~'}</span><span class="gu-file-path">${esc(c.path)}</span><span class="gu-file-size">${formatBytes(c.size)}</span></div>`).join('')}
                ${rest > 0 ? `<div class="gu-file-more">${fmt(T.andMore, rest)}</div>` : ''}`;
        }

        // Why the whole game has to be downloaded again: either the selected
        // build is a major update (or switching to it crosses one), or this copy
        // already took one and has not been downloaded whole since.
        _majorNote(T) {
            const commit = this._selectedBuild();
            const crossed = commit ? GameUpdater.majorAhead(commit.sha) : null;
            if (crossed) {
                return fmt(T.majorNote, crossed.message || shortSha(crossed.sha));
            }
            if (GameUpdater.majorInstalled()) {
                const info = GameUpdater.installedInfo();
                return fmt(T.majorInstalledNote,
                    GameUpdater.majorInstalledName() || shortSha(info && info.sha) || T.unknown);
            }
            // Nothing crossed and nothing taken: the caller drops the line.
            return '';
        }

        // Up to two lines: the major-update warning, which outranks everything
        // else because it is the one the player has to act on outside the game,
        // and whatever the state of the screen itself has to say.
        _noteState(T) {
            const commit = this._selectedBuild();
            const plan = commit ? GameUpdater.plan(commit.sha) : null;
            const position = commit ? GameUpdater.indexOf(commit.sha) : -1;
            const line = (text, cls) => `<div class="${cls}">${esc(text)}</div>`;
            const major = this._majorNote(T);

            let text = '';
            let bad = false;
            if (!isAvailable())                  { text = T.noNode; bad = true; }
            else if (!DOWNLOADS_ENABLED)         { text = T.downloadsOff; }
            else if (GameUpdater.needsRestart()) { text = T.restartNote; }
            // Installing an older build walks the game backwards; say so plainly.
            else if (position > 0 && plan && plan.changed.length) { text = T.olderNote; }

            // What the unstable tab is, said on the tab itself rather than only
            // in the help: these builds are published before they are tested.
            const unstable = GameUpdater.channel() === 'unstable' ? T.unstableNote : '';

            return {
                text: (major ? line(major, 'gu-note-line gu-note-line--major') : '') +
                      (unstable ? line(unstable, 'gu-note-line gu-note-line--unstable') : '') +
                      (text ? line(text, 'gu-note-line') : ''),
                bad: bad,
                major: !!major
            };
        }

        _renderInspect(T) {
            const commit = this._selectedBuild();
            const status = this._buildStatus(commit);
            const heading = commit ? fmt(T.buildName, shortSha(commit.sha)) : this._emptyText(T);

            this._setRegion('name', this._dom.name, esc(heading));
            this._setRegion('status', this._dom.status, status.text);
            this._setRegion('specs', this._dom.specs, this._specsHTML(T));

            const note = this._noteState(T);
            this._setRegion('note', this._dom.note, note.text);
            if (this._dom.note) {
                this._dom.note.hidden = !note.text;
                this._dom.note.classList.toggle('gu-note--bad', !!note.bad);
                this._dom.note.classList.toggle('gu-note--major', !!note.major);
            }

            const changelog = this._changelogHTML(T);
            if (this._setRegion('changelog', this._dom.changelog, changelog) && this._dom.changelog) {
                this._dom.changelog.scrollTop = 0;
            }
            if (this._dom.changelog) this._dom.changelog.hidden = !changelog;

            const files = this._filesHTML(T);
            if (this._setRegion('files', this._dom.files, files) && this._dom.files) {
                this._dom.files.scrollTop = 0;
            }
            if (this._dom.files) this._dom.files.hidden = !files;

            // The cursor is a class, so the button list only ever changes when
            // the actions themselves do.
            const actions = this._actions()
                .map(a => `<button class="inspect-btn focusable" data-action="${a.key}" tabindex="0">${esc(a.label)}</button>`)
                .join('');
            if (this._setRegion('actions', this._dom.actions, actions)) this._wireActions();
        }

        _refreshDOM() {
            if (!this._container) return;
            const T = getT();
            if (!this._dom) this._buildSkeleton(T);
            this._renderTabs(T);
            this._setRegion('header', this._dom.header, fmt(T.buildsOn, GameUpdater.branchName()));
            this._setRegion('hint', this._dom.hint, T.hint);
            this._renderBuildList(T);
            this._renderInspect(T);
            this._updateProgressDOM();
            this._updateBuildBadges();
            this._updateBuildHighlight();
            this._updateActionHighlight();
            this._scrollSelectedIntoView();
        }

        // The history is long enough to scroll, so the cursor has to drag the
        // list along with it.
        _scrollSelectedIntoView() {
            if (!this._dom || this._section !== 'builds') return;
            const node = this._dom.list.querySelector('.gu-build.selected');
            if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
        }

        // Progress ticks come in far faster than a full re-render can keep up
        // with, so they only touch the bar and the log.
        _updateProgressDOM() {
            if (!this._dom) return;
            const log = this._dom.log;
            const logHTML = this._log.map(line => `<div class="gu-log-line">${esc(line)}</div>`).join('');
            if (log && this._cache.log !== logHTML) {
                this._cache.log = logHTML;
                log.innerHTML = logHTML;
                log.scrollTop = log.scrollHeight;
            }
            const bar  = this._dom.progress;
            const fill = this._dom.fill;
            if (bar && fill) {
                const idle = this._progress === null || this._progress === undefined;
                bar.classList.toggle('gu-progress--idle', idle);
                const width = idle ? '0%' : Math.round(Math.max(0, Math.min(1, this._progress)) * 100) + '%';
                if (fill.style.width !== width) fill.style.width = width;
            }
        }

        // A build going from unchecked to checking to checked only moves its
        // own badge, so the row it sits in is left exactly where it is.
        _updateBuildBadges() {
            if (!this._dom) return;
            const commits = GameUpdater.commits();
            this._dom.list.querySelectorAll('.gu-build').forEach((node, i) => {
                const badge = node.querySelector('.gu-badge');
                if (!badge) return;
                const status = this._buildStatus(commits[i]);
                const cls = 'gu-badge ' + status.cls;
                if (badge.className !== cls) badge.className = cls;
                if (badge.textContent !== status.text) badge.textContent = status.text;
            });
        }

        _updateBuildHighlight() {
            if (!this._dom) return;
            this._dom.list.querySelectorAll('.gu-build').forEach((node, i) => {
                node.classList.toggle('selected', this._section === 'builds' && i === this._buildIndex);
            });
        }

        _updateActionHighlight() {
            if (!this._dom) return;
            this._dom.actions.querySelectorAll('.inspect-btn[data-action]').forEach((btn, i) => {
                btn.classList.toggle('selected', this._section === 'actions' && i === this._actionIndex);
            });
        }

        // Selecting a build leaves both lists standing: only the cursor classes
        // move and the inspect panel's own regions catch up.
        _selectionChanged() {
            if (!this._dom) return;
            this._updateBuildHighlight();
            this._renderInspect(getT());
            this._updateActionHighlight();
            this._scrollSelectedIntoView();
        }

        _wireBuildRows() {
            this._dom.list.querySelectorAll('.gu-build').forEach(node => {
                node.addEventListener('click', () => {
                    const idx = parseInt(node.dataset.idx, 10);
                    if (idx === this._buildIndex && this._section === 'builds') {
                        this._useSelectedBuild();
                    } else {
                        this._buildIndex = idx;
                        this._section = 'builds';
                        SoundManager.playCursor();
                        this._selectionChanged();
                    }
                });
            });
        }

        _wireActions() {
            this._dom.actions.querySelectorAll('.inspect-btn[data-action]').forEach((btn, i) => {
                btn.addEventListener('mouseover', () => {
                    // Hover steers only while the mouse is what is moving: a
                    // scrolled or rebuilt row slides under a resting pointer and
                    // fires this too (PointerSteering, Core/AnalogStickInput.js).
                    if (window.PointerSteering && !window.PointerSteering.isSteering()) return;
                    if (this._section !== 'actions') return;
                    this._actionIndex = i;
                    this._updateActionHighlight();
                });
                btn.addEventListener('click', () => {
                    this._section = 'actions';
                    this._actionIndex = i;
                    this._runAction(btn.dataset.action);
                });
            });
        }
    }

    window.Scene_GameUpdater = Scene_GameUpdater;

    // =========================================================================
    // Title screen entry, inserted just above EXIT
    // =========================================================================
    // The whole block is optional: with no local file system there is nothing to
    // update, and this plugin then adds no command, no handler and no scene to
    // the title screen at all. Disabling it in plugins.js has the same effect,
    // since everything the title screen borrows from here is read through
    // window.GameUpdater and guarded on the other side.
    if (isAvailable() && typeof Window_TitleCommand !== 'undefined' &&
        typeof Scene_Title !== 'undefined') {

        const _makeCommandList = Window_TitleCommand.prototype.makeCommandList;
        Window_TitleCommand.prototype.makeCommandList = function () {
            _makeCommandList.call(this);
            const at = this._list.findIndex(c => c.symbol === 'exitGame');
            const entry = { name: getT().menu, symbol: 'gameUpdater', enabled: true, ext: null };
            if (at >= 0) this._list.splice(at, 0, entry);
            else this._list.push(entry);
        };

        // Titlescreen.js draws its own DOM list from getTitleCommandText and maps
        // the clicked index straight onto the command window, so the entry has to
        // be spliced into BOTH lists at the very same relative place, i.e. this
        // wrap has to sit in the same position in the getTitleCommandText chain
        // that the makeCommandList wrap above sits in that chain. That means
        // patching here immediately, at load time, exactly like the
        // makeCommandList wrap does: a deferred patch (installed on first
        // createCommandWindow) used to run AFTER a later-loaded plugin
        // (TitleMenuCreditsSettings) had already wrapped getTitleCommandText,
        // which put Credits before Updates in the DOM overlay while
        // makeCommandList still had Updates before Credits in the real command
        // list - the overlay's click index then landed on the other entry's
        // handler. Titlescreen.js is guaranteed to have already defined the
        // base getTitleCommandText by the time this file runs (it loads
        // earlier in plugins.js), so the method is already there to wrap.
        if (typeof Scene_Title.prototype.getTitleCommandText === 'function') {
            const _getTitleCommandText = Scene_Title.prototype.getTitleCommandText;
            Scene_Title.prototype.getTitleCommandText = function () {
                const commands = _getTitleCommandText.call(this);
                const at = commands.findIndex(c => c.symbol === 'exitGame');
                const entry = { text: getT().menu, symbol: 'gameUpdater' };
                if (at >= 0) commands.splice(at, 0, entry);
                else commands.push(entry);
                return commands;
            };
        }

        const _createCommandWindow = Scene_Title.prototype.createCommandWindow;
        Scene_Title.prototype.createCommandWindow = function () {
            _createCommandWindow.call(this);
            this._commandWindow.setHandler('gameUpdater', this.commandGameUpdater.bind(this));
        };

        Scene_Title.prototype.commandGameUpdater = function () {
            SceneManager.push(Scene_GameUpdater);
        };
    }
})();
