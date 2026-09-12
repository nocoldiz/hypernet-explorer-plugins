/*:
 * @target MZ
 * @plugindesc v1.0.0 TV Guide application for HypernetOS. Browses the channels and programs defined in js/db/WorldGen/TVTransmissions.json.
 * @author Omni-Lex
 *
 * @help
 * HypernetTVGuide.js
 *
 * Adds a "TV Guide" application to the HypernetOS desktop. It reads the
 * broadcast database (js/db/WorldGen/TVTransmissions.json) and lets the player
 * browse every channel, its cast and its programs. If the
 * RandomTVTransmissionGenerator (window.TVStudio) is present, selecting a
 * program plays its broadcast dialogue inline, one line every 2 seconds,
 * without leaving the OS.
 *
 * Launch directly:
 *   window.HypernetOS.launchApp('tv-guide')
 *
 * Load AFTER HypernetOS.js (and, for tuning, after
 * RandomTVTransmissionGenerator.js).
 */

(() => {
    'use strict';

    const DB_PATH = 'js/db/WorldGen/TVTransmissions.json';

    // TVTransmissions.json names its channels and programmes by i18n key
    // ("HypernetTVGuide.channel.<id>.name"); the listings themselves live in
    // js/i18n/<lang>/plugins/HypernetTVGuide.json. Anything unkeyed - a
    // transmission added at runtime - is shown as written.
    function tvText(value) {
        if (!value) return '';
        const key = String(value);
        return T.has(key) ? T(key) : key;
    }

    function channelName(ch) {
        return ch ? tvText(ch.name) : '';
    }

    function programTitle(p) {
        return p ? tvText(p.title) : '';
    }

    // Map the channel "color" field (RMMZ window text color index) to a CSS swatch.
    const COLOR_SWATCHES = {
        0: '#ffffff', 2: '#3aa0ff', 3: '#5fe07a', 4: '#ff6b6b',
        6: '#9b8cff', 8: '#3fbfb0', 14: '#7ad3ff', 17: '#bfa9ff', 18: '#ff4fa3',
        24: '#ff9f43'
    };
    function colorSwatch(color) {
        return COLOR_SWATCHES[color] || '#9aa0a6';
    }

    function loadDB() {
        // Prefer the generator's cached DB if it is loaded.
        if (window.TVStudio && typeof window.TVStudio.loadDB === 'function') {
            try { return window.TVStudio.loadDB(); } catch (e) { /* fall through */ }
        }
        if (window.WorldGen && window.WorldGen.TVTransmissions) {
            return window.WorldGen.TVTransmissions;
        }
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', DB_PATH, false);
            xhr.send();
            const db = xhr.status === 200 ? JSON.parse(xhr.responseText) : { channels: [] };
            if (!Array.isArray(db.channels)) db.channels = [];
            return db;
        } catch (e) {
            console.error('HypernetTVGuide: failed to load DB', e);
            return { channels: [] };
        }
    }

    window.HypernetTVGuide = {
        launch: function() {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error('HypernetOS core not loaded!');
                return;
            }

            const db = loadDB();
            const channels = db.channels || [];

            const id = 'app-hypernet-tv-guide';
            const contentHTML = `
                <div style="display:flex; flex-direction:column; height:100%; background:var(--xp-bg); font-family:'Tahoma',sans-serif; font-size:15px; color:var(--xp-black)">
                    <!-- Body: channel list + detail -->
                    <div style="display:flex; flex:1; min-height:0">
                        <!-- Channel list -->
                        <div id="tvguide-channel-list" style="width:230px; background:var(--xp-white); border-right:1px solid var(--xp-face-shade); overflow-y:auto; flex-shrink:0"></div>
                        <!-- Detail panel -->
                        <div id="tvguide-detail" style="flex:1; overflow-y:auto; padding:12px 16px; background:#f5f4ec"></div>
                    </div>
                    <!-- Status bar -->
                    <div id="tvguide-status" style="border-top:1px solid var(--xp-face-shade); padding:3px 8px; background:var(--xp-bg); font-size:14px; color:var(--xp-ink-5)"></div>
                </div>
            `;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: id,
                title: T('HypernetTVGuide.title'),
                icon: 223,
                width: 700,
                height: 480,
                contentHTML: contentHTML
            });

            const listEl = win.querySelector('#tvguide-channel-list');
            const detailEl = win.querySelector('#tvguide-detail');
            const statusEl = win.querySelector('#tvguide-status');

            statusEl.textContent = T('HypernetTVGuide.status', { channels: channels.length, map: db.studioMapId || '?', slots: (db.slotHours || []).length });

            if (channels.length === 0) {
                detailEl.innerHTML = `<div style="padding:20px; color:var(--xp-bad)">No transmissions found. ${DB_PATH} could not be loaded.</div>`;
                return;
            }

            const escapeHtml = (s) => String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // --- Inline broadcast playback (dialogue appears every 2 seconds) ---
            const LINE_DELAY_MS = 2000;
            let playToken = 0;          // bumped on every new playback to cancel old timers
            let playTimer = null;

            const stopPlayback = () => {
                playToken++;
                if (playTimer) { clearTimeout(playTimer); playTimer = null; }
            };

            const playProgram = (ch, p) => {
                stopPlayback();
                const dlg = detailEl.querySelector('#tvguide-dialogue');
                if (!dlg) return;
                dlg.innerHTML = '';

                let lines = [];
                if (window.TVStudio && typeof window.TVStudio.buildScript === 'function') {
                    try {
                        const script = window.TVStudio.buildScript(ch.id, p.id);
                        lines = (script && script.lines) || [];
                    } catch (e) { console.error('TV Guide: buildScript failed', e); }
                }
                if (!lines.length) {
                    dlg.innerHTML = `<div style="color:var(--xp-text-muted)">${T('HypernetTVGuide.noSignal')}</div>`;
                    return;
                }

                const swatch = colorSwatch(ch.color);
                const token = playToken;
                let i = 0;
                const showNext = () => {
                    // Bail out if a new playback started or the window was closed.
                    if (token !== playToken || !document.body.contains(dlg)) return;
                    if (i >= lines.length) {
                        const end = document.createElement('div');
                        end.style.cssText = 'text-align:center; color:var(--xp-ink-pale); font-size:13px; margin-top:8px;';
                        end.textContent = T('HypernetTVGuide.endOfTransmission');
                        dlg.appendChild(end);
                        dlg.scrollTop = dlg.scrollHeight;
                        return;
                    }
                    const ln = lines[i++];
                    const bubble = document.createElement('div');
                    bubble.style.cssText = 'margin:6px 0; padding:6px 9px; background:var(--xp-white); border:1px solid var(--xp-silver-4); border-left:3px solid ' + swatch + '; border-radius:3px;';
                    bubble.innerHTML =
                        `<div style="font-weight:bold; font-size:14px; color:var(--xp-ink-4); margin-bottom:2px">${escapeHtml(ln.speaker || channelName(ch))}</div>` +
                        `<div style="font-size:15px; color:var(--xp-black)">${escapeHtml(ln.text || '')}</div>`;
                    dlg.appendChild(bubble);
                    dlg.scrollTop = dlg.scrollHeight;
                    playTimer = setTimeout(showNext, LINE_DELAY_MS);
                };
                showNext();
            };

            const renderDetail = (ch) => {
                stopPlayback();
                const swatch = colorSwatch(ch.color);
                const canPlay = !!(window.TVStudio && typeof window.TVStudio.buildScript === 'function');
                const programs = (ch.programs || []).map(p => {
                    // Cast lives on the programme; a show without one is narrated.
                    const cast = (p.cast || []).map(m => escapeHtml(m.characterName || '')).filter(Boolean).join(', ') || T('HypernetTVGuide.narrator');
                    return `
                        <div class="tvguide-program${canPlay ? ' focusable' : ''}"${canPlay ? ' tabindex="0"' : ''} data-channel="${escapeHtml(ch.id)}" data-program="${escapeHtml(p.id)}"
                             style="display:flex; align-items:center; gap:8px; padding:8px 10px; margin:6px 0; background:var(--xp-white); border:1px solid var(--xp-silver-4); border-radius:3px; cursor:${canPlay ? 'pointer' : 'default'}">
                            <div style="flex:1; min-width:0">
                                <div style="font-weight:bold">${escapeHtml(programTitle(p))}</div>
                                <div style="font-size:14px; color:var(--xp-ink-soft)">${T('HypernetTVGuide.format')} ${escapeHtml(p.format || '?')} &nbsp;&middot;&nbsp; ${T('HypernetTVGuide.tone')} ${escapeHtml(p.tone || '?')}</div>
                                <div style="font-size:14px; color:var(--xp-text-muted)">${T('HypernetTVGuide.cast')} ${cast}</div>
                            </div>
                            ${canPlay ? `<span style="margin-left:auto; font-size:14px; color:var(--xp-ok-dark)">${T('HypernetTVGuide.watch')}</span>` : ''}
                        </div>`;
                }).join('');

                detailEl.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px">
                        <span style="width:16px; height:16px; border-radius:3px; border:1px solid var(--xp-ink-faint-2); background:${swatch}; display:inline-block"></span>
                        <h2 style="margin:0; font-size:19px">${escapeHtml(channelName(ch))}</h2>
                    </div>
                    <div style="font-size:14px; color:var(--xp-ink-soft); margin-bottom:10px">${T('HypernetTVGuide.tone')} ${escapeHtml(ch.tone || '?')}</div>
                    <div style="font-weight:bold; margin-bottom:2px; color:var(--xp-ink-4)">${T('HypernetTVGuide.programs')}</div>
                    ${programs || `<div style="color:var(--xp-text-muted)">${T('HypernetTVGuide.noPrograms')}</div>`}
                    <div style="font-weight:bold; margin:12px 0 2px; color:var(--xp-ink-4)">${T('HypernetTVGuide.transmission')}</div>
                    <div id="tvguide-dialogue" style="min-height:60px; max-height:220px; overflow-y:auto; padding:8px; background:#f0efe6; border:1px solid var(--xp-silver-4); border-radius:3px">
                        <div style="color:var(--xp-text-muted)">${T('HypernetTVGuide.tuneInHint')}</div>
                    </div>
                `;

                detailEl.querySelectorAll('.tvguide-program').forEach(row => {
                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (!canPlay) return;
                        const program = (ch.programs || []).find(pr => pr.id === row.dataset.program);
                        if (!program) return;
                        if (window.SoundManager) SoundManager.playOk();
                        detailEl.querySelectorAll('.tvguide-program').forEach(r => { r.style.background = '#ffffff'; });
                        row.style.background = '#e5efff';
                        playProgram(ch, program);
                    });
                });
            };

            let selectedId = null;
            const renderList = () => {
                listEl.innerHTML = '';
                channels.forEach(ch => {
                    const row = document.createElement('div');
                    row.className = 'focusable';
                    row.tabIndex = 0;
                    row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:pointer; border-bottom:1px solid #efeee6; user-select:none;';
                    row.innerHTML = `
                        <span style="width:12px; height:12px; border-radius:2px; border:1px solid var(--xp-ink-faint-2); background:${colorSwatch(ch.color)}; flex-shrink:0"></span>
                        <div style="flex:1; min-width:0">
                            <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(channelName(ch))}</div>
                            <div style="font-size:13px; color:var(--xp-text-muted)">${(ch.programs || []).length} programs</div>
                        </div>`;

                    const setSelected = () => {
                        selectedId = ch.id;
                        listEl.querySelectorAll('div[data-tvrow]').forEach(el => { el.style.background = 'transparent'; });
                        row.style.background = '#c5dcf7';
                    };
                    row.dataset.tvrow = ch.id;
                    row.addEventListener('mouseenter', () => { if (selectedId !== ch.id) row.style.background = '#e5efff'; });
                    row.addEventListener('mouseleave', () => { if (selectedId !== ch.id) row.style.background = 'transparent'; });
                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        setSelected();
                        renderDetail(ch);
                        if (window.SoundManager) SoundManager.playCursor();
                    });

                    listEl.appendChild(row);
                });
            };

            renderList();
            // Auto-select the first channel.
            const firstRow = listEl.querySelector('div[data-tvrow]');
            if (firstRow) firstRow.click();
        }
    };

    // Register the TV Guide application in HypernetOS.
    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'tv-guide',
            name: T('HypernetTVGuide.title'),
            icon: 223,
            launchFn: function() {
                window.HypernetTVGuide.launch();
            },
            desktopShortcut: true
        });
    }

})();
