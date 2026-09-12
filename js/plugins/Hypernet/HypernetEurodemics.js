/*:
 * @target MZ
 * @plugindesc v1.0.0 Eurodemics: the continental epidemic observatory for HypernetOS.
 * @author Omni-Lex
 *
 * @help
 * HypernetEurodemics.js
 *
 * Adds the "Eurodemics" application to the HypernetOS desktop: the public
 * terminal of the continental epidemic observatory, reading the live outbreak
 * ledger kept by window.EpidemicSystem (Health_DiseaseSystem.js).
 *
 * Situation - the headline figures (outbreaks running, people currently ill,
 *             dead, towns affected), the worst-hit towns, and a readout of
 *             wherever the party is standing right now, including whether
 *             anyone in it has caught something.
 * Outbreaks - every outbreak currently burning, each with its daily curve:
 *             one point per day, redrawn when the epidemic model advances at
 *             midnight, plus the town-by-town table behind the graph.
 * Archive   - outbreaks this world has already closed, and the epidemics and
 *             mass hysterias of the last century (HistorySimulator).
 *
 * The graph is deliberately two series on ONE axis: people currently ill and
 * people dead so far are both counts of people, so they share a scale honestly.
 * Both lines are labelled at their own end, and the same numbers appear in the
 * table below, so nothing is carried by colour alone.
 *
 * Launch directly:
 *   window.HypernetOS.launchApp('app-eurodemics')
 *
 * Load AFTER HypernetOS.js and Health_DiseaseSystem.js.
 */

(() => {
    'use strict';

    const APP_ID = 'app-eurodemics';
    const APP_ICON = 177; // Poison, per js/db/Sprites/Icons.json

    const ES = () => window.EpidemicSystem;
    const DS = () => window.DiseaseSystem;

    const escapeHtml = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const iconHTML = (index, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(index, size) : '');

    // Outbreak records are keyed by the town's Destinations.json key; the
    // terminal prints that entry's readable name.
    const placeName = (key) => (ES() && ES().placeName) ? ES().placeName(key) : String(key == null ? '' : key);

    // Thousands separators written out: toLocaleString follows the host locale
    // and would print "12.400" on half the machines this runs on.
    const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const pct = (v) => `${((Number(v) || 0) * 100).toFixed(2)}%`;

    // --- Palette -------------------------------------------------------------
    // Two categorical slots, validated for colour-vision deficiency against this
    // panel surface. Both are dark enough to be read as text as well as drawn
    // as a line, since each series names itself in its own colour; every figure
    // is repeated in the table besides.
    const C = {
        ill: '#1f66bd',
        dead: '#c2410c',
        grid: '#dcd9cd',
        axis: '#8c887c',
        ink: '#1b1b1b',
        inkSoft: '#5a5a5a',
        surface: '#ffffff',
    };

    // --- Styling -------------------------------------------------------------
    // A continental health bureau's terminal, circa 2001: institutional green,
    // flat panels, the same furniture as the other government portals.
    const S = {
        app: 'display:flex; flex-direction:column; height:100%; background:var(--xp-face-5); ' +
             "font-family:'Tahoma',sans-serif; font-size:15px; color:var(--xp-ink-2);",
        header: 'display:flex; align-items:center; gap:12px; padding:10px 14px; ' +
                'background:linear-gradient(to bottom,var(--xp-green-3),var(--xp-green-2)); color:var(--xp-white); border-bottom:2px solid var(--xp-green-7);',
        nav: 'width:152px; flex-shrink:0; background:var(--xp-face-6); border-right:1px solid var(--xp-face-shade); padding:8px 0;',
        navItem: 'padding:9px 12px; cursor:pointer; border-left:4px solid transparent; user-select:none;',
        panel: 'flex:1; overflow-y:auto; padding:14px 16px; background:var(--xp-face-2); min-width:0;',
        status: 'display:flex; gap:16px; align-items:center; border-top:1px solid var(--xp-face-shade); ' +
                'padding:4px 10px; background:var(--xp-face-5); font-size:14px; color:var(--xp-ink-4);',
        card: 'background:var(--xp-white); border:1px solid var(--xp-face-3); border-radius:3px; padding:10px 12px; margin-bottom:8px;',
        btn: 'display:inline-block; padding:5px 12px; background:linear-gradient(to bottom,var(--xp-paper),#dcd8cc); ' +
             'border:1px solid var(--xp-face-4); border-radius:3px; cursor:pointer; font-size:15px; color:var(--xp-ink); user-select:none;',
        h: 'margin:0 0 8px; font-size:17px; font-weight:bold; color:var(--xp-green-2);',
        note: 'color:var(--xp-ink-soft-2); font-size:14px; line-height:1.5;',
        tile: 'flex:1; min-width:96px; background:var(--xp-white); border:1px solid var(--xp-face-3); border-radius:3px; padding:8px 10px;',
        tileNum: 'font-size:22px; font-weight:bold; line-height:1.2;',
        tileLbl: 'font-size:13px; color:var(--xp-ink-soft-2); text-transform:uppercase; letter-spacing:0.4px;',
        table: 'width:100%; border-collapse:collapse; font-size:14px;',
        th: 'text-align:left; padding:4px 6px; border-bottom:1px solid var(--xp-face-shade); color:var(--xp-green-2); font-weight:bold;',
        td: 'padding:4px 6px; border-bottom:1px solid #e6e3d8;',
    };

    const TABS = [
        { id: 'situation', get label() { return T('Eurodemics.tab.situation'); } },
        { id: 'outbreaks', get label() { return T('Eurodemics.tab.outbreaks'); } },
        { id: 'archive', get label() { return T('Eurodemics.tab.archive'); } }
    ];

    // --- Chart ---------------------------------------------------------------
    // One point per day, straight from the outbreak's own history: no smoothing,
    // no interpolation, so the graph is exactly what the model resolved at each
    // midnight. Two series on one axis, both in people.
    const CHART = { w: 560, h: 190, padL: 46, padR: 62, padT: 12, padB: 26 };

    function buildChart(epidemic) {
        const history = (epidemic && epidemic.history) || [];
        if (history.length < 2) {
            return `<div style="${S.note} padding:18px 0">${T('Eurodemics.curveHint')}</div>`;
        }
        const { w, h, padL, padR, padT, padB } = CHART;
        const plotW = w - padL - padR;
        const plotH = h - padT - padB;

        const days = history.map(p => p[0]);
        const ill = history.map(p => p[1]);
        const dead = history.map(p => p[3]);
        const dayMin = days[0];
        const dayMax = days[days.length - 1];
        const span = Math.max(1, dayMax - dayMin);
        const peak = Math.max(1, Math.max.apply(null, ill), Math.max.apply(null, dead));
        // A rounded ceiling so the gridlines land on readable numbers.
        const step = Math.pow(10, Math.max(0, String(Math.round(peak)).length - 2));
        const top = Math.max(step, Math.ceil(peak / step) * step);

        const x = d => padL + ((d - dayMin) / span) * plotW;
        const y = v => padT + plotH - (Math.min(v, top) / top) * plotH;
        const path = series => series
            .map((v, i) => `${i ? 'L' : 'M'}${x(days[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

        const gridLines = [0, 0.5, 1].map(f => {
            const gy = padT + plotH - f * plotH;
            return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${padL + plotW}" y2="${gy.toFixed(1)}"
                     stroke="${C.grid}" stroke-width="1"/>
                    <text x="${padL - 6}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end"
                     font-size="9" fill="${C.inkSoft}">${num(top * f)}</text>`;
        }).join('');

        const lastIll = ill[ill.length - 1];
        const lastDead = dead[dead.length - 1];
        const endX = x(dayMax);
        // Direct labels at each line's own end: identity never rests on colour.
        // The two labels are nudged apart vertically so they stay readable when
        // both series finish at nearly the same height.
        const gap = Math.abs(y(lastIll) - y(lastDead)) < 12;
        const label = (value, text, color, dy) => `
            <circle cx="${endX.toFixed(1)}" cy="${y(value).toFixed(1)}" r="4" fill="${color}"
                    stroke="${C.surface}" stroke-width="2"/>
            <text x="${(endX + 7).toFixed(1)}" y="${(y(value) + dy).toFixed(1)}" font-size="10"
                  fill="${C.ink}" font-weight="bold">${escapeHtml(text)}</text>`;

        const dateOf = d => (ES() && ES().dateStr ? ES().dateStr(d)
            : T('Eurodemics.dayNumbered', { day: d }));

        return `
            <div style="display:flex; gap:14px; align-items:center; margin-bottom:2px">
              <span style="display:inline-flex; align-items:center; gap:5px; font-size:14px">
                <span style="width:14px; height:3px; background:${C.ill}; display:inline-block"></span>${T('Eurodemics.currentlyIll')}</span>
              <span style="display:inline-flex; align-items:center; gap:5px; font-size:14px">
                <span style="width:14px; height:3px; background:${C.dead}; display:inline-block"></span>${T('Eurodemics.deadSoFar')}</span>
              <span style="${S.note} margin-left:auto">${T('Eurodemics.chartFootnote')}</span>
            </div>
            <div id="ed-chart-wrap" style="position:relative; background:${C.surface}; border:1px solid var(--xp-face-3); border-radius:3px">
              <svg id="ed-chart" viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block"
                   data-daymin="${dayMin}" data-daymax="${dayMax}" data-padl="${padL}" data-plotw="${plotW}">
                ${gridLines}
                <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}"
                      stroke="${C.axis}" stroke-width="1"/>
                <line id="ed-crosshair" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}"
                      stroke="${C.axis}" stroke-width="1" stroke-dasharray="2,2" opacity="0"/>
                <path d="${path(ill)}" fill="none" stroke="${C.ill}" stroke-width="2"
                      stroke-linejoin="round" stroke-linecap="round"/>
                <path d="${path(dead)}" fill="none" stroke="${C.dead}" stroke-width="2"
                      stroke-linejoin="round" stroke-linecap="round"/>
                ${label(lastIll, num(lastIll), C.ill, gap ? -7 : 3)}
                ${label(lastDead, num(lastDead), C.dead, gap ? 11 : 3)}
                <text x="${padL}" y="${h - 8}" font-size="9" fill="${C.inkSoft}">${escapeHtml(dateOf(dayMin))}</text>
                <text x="${padL + plotW}" y="${h - 8}" font-size="9" fill="${C.inkSoft}"
                      text-anchor="end">${escapeHtml(dateOf(dayMax))}</text>
              </svg>
              <div id="ed-tip" style="position:absolute; display:none; pointer-events:none; background:#fffef7; border:1px solid var(--xp-face-4); border-radius:3px; padding:4px 7px; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,0.25); white-space:nowrap"></div>
            </div>`;
    }

    // Crosshair + readout. A line chart that cannot be interrogated is a picture.
    function attachChartHover(win, epidemic) {
        const svg = win.querySelector('#ed-chart');
        const wrap = win.querySelector('#ed-chart-wrap');
        const tip = win.querySelector('#ed-tip');
        const cross = win.querySelector('#ed-crosshair');
        if (!svg || !wrap || !tip || !cross) return;
        const history = (epidemic && epidemic.history) || [];
        if (history.length < 2) return;

        const dayMin = Number(svg.dataset.daymin);
        const dayMax = Number(svg.dataset.daymax);
        const padL = Number(svg.dataset.padl);
        const plotW = Number(svg.dataset.plotw);

        const move = (ev) => {
            const box = wrap.getBoundingClientRect();
            const scale = CHART.w / box.width;                 // viewBox units per screen px
            const vx = (ev.clientX - box.left) * scale;
            const f = Math.max(0, Math.min(1, (vx - padL) / plotW));
            const day = Math.round(dayMin + f * Math.max(1, dayMax - dayMin));
            let best = history[0];
            for (const point of history) {
                if (Math.abs(point[0] - day) < Math.abs(best[0] - day)) best = point;
            }
            const bx = padL + ((best[0] - dayMin) / Math.max(1, dayMax - dayMin)) * plotW;
            cross.setAttribute('x1', bx);
            cross.setAttribute('x2', bx);
            cross.setAttribute('opacity', '1');
            const dateOf = ES() && ES().dateStr ? ES().dateStr(best[0]) : `day ${best[0]}`;
            tip.innerHTML = `<b>${escapeHtml(dateOf)}</b><br>` +
                `<span style="color:${C.ill}">&#9632;</span> ${num(best[1])} ill ` +
                `<span style="color:${C.inkSoft}">(+${num(best[2])} new)</span><br>` +
                `<span style="color:${C.dead}">&#9632;</span> ${num(best[3])} dead`;
            tip.style.display = 'block';
            const px = bx / scale;
            tip.style.left = Math.min(box.width - tip.offsetWidth - 4, Math.max(0, px + 10)) + 'px';
            tip.style.top = '8px';
        };
        wrap.addEventListener('mousemove', move);
        wrap.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
            cross.setAttribute('opacity', '0');
        });
    }

    window.HypernetEurodemics = {
        win: null,
        tab: 'situation',
        selectedId: null,
        archiveId: null,
        lastDay: null,
        message: null,

        launch: function () {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error('HypernetOS core not loaded!');
                return;
            }
            this.tab = 'situation';
            this.selectedId = null;
            this.archiveId = null;
            this.message = null;

            // Resolve anything the clock skipped before the first paint.
            try { if (ES()) ES().catchUp(); } catch (e) { console.warn('[Eurodemics]', e); }

            const contentHTML = `
                <div style="${S.app}">
                    <div style="${S.header}">
                        <div style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.5))">${iconHTML(APP_ICON, 34)}</div>
                        <div style="flex:1; min-width:0">
                            <div style="font-size:17px; font-weight:bold; letter-spacing:0.5px">${T('Eurodemics.appName')}</div>
                            <div style="font-size:13px; opacity:0.82">${T('Eurodemics.subtitle')}</div>
                        </div>
                        <div id="ed-alert" style="padding:4px 10px; border-radius:10px; font-size:14px; font-weight:bold"></div>
                    </div>
                    <div style="display:flex; flex:1; min-height:0">
                        <div id="ed-nav" style="${S.nav}"></div>
                        <div id="ed-panel" style="${S.panel}"></div>
                    </div>
                    <div style="${S.status}">
                        <span>${T('Eurodemics.bulletinLabel')} <b id="ed-date"></b></span>
                        <span>${T('Eurodemics.outbreaksLabel')} <b id="ed-count"></b></span>
                        <span id="ed-message" style="margin-left:auto; color:var(--xp-green-2)"></span>
                    </div>
                </div>`;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: APP_ID,
                title: T('Eurodemics.appName'),
                icon: APP_ICON,
                width: 820,
                height: 560,
                contentHTML: contentHTML
            });
            this.win = win;

            this.renderNav();
            this.render();
            this.watchClock();
        },

        // --- Chrome ---------------------------------------------------------

        renderNav: function () {
            const nav = this.win && this.win.querySelector('#ed-nav');
            if (!nav) return;
            nav.innerHTML = '';
            TABS.forEach(tab => {
                const item = document.createElement('div');
                item.className = 'focusable';
                item.tabIndex = 0;
                item.id = 'ed-tab-' + tab.id;
                const active = this.tab === tab.id;
                item.style.cssText = S.navItem +
                    (active ? 'background:var(--xp-face-2); border-left-color:var(--xp-green-3); font-weight:bold;' : '');
                item.textContent = tab.label;
                item.addEventListener('mouseenter', () => { if (this.tab !== tab.id) item.style.background = '#e7e4d8'; });
                item.addEventListener('mouseleave', () => { if (this.tab !== tab.id) item.style.background = 'transparent'; });
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.tab === tab.id) return;
                    this.tab = tab.id;
                    if (window.SoundManager) SoundManager.playCursor();
                    this.renderNav();
                    this.render();
                });
                nav.appendChild(item);
            });
        },

        renderStatusBar: function () {
            if (!this.win) return;
            const stats = ES() ? ES().stats() : { active: 0, date: null, infected: 0 };
            const alert = this.win.querySelector('#ed-alert');
            if (alert) {
                const level = stats.active === 0 ? { t: 'NO ACTIVE ALERT', c: '#2e7d32' }
                    : stats.infected > 5000 ? { t: 'CONTINENTAL ALERT', c: '#c0392b' }
                    : { t: 'MONITORING', c: '#b04a00' };
                alert.style.background = level.c;
                alert.style.color = '#fff';
                alert.textContent = level.t;
            }
            const set = (sel, text) => {
                const el = this.win.querySelector(sel);
                if (el) el.textContent = text;
            };
            // In an empty world the observatory stopped reporting with
            // everything else, so the bulletin is dated the day it stopped
            // rather than left blank (window.HypernetOS.staleDate).
            const stale = window.HypernetOS && window.HypernetOS.staleDate
                ? window.HypernetOS.staleDate() : null;
            set('#ed-date', stale || stats.date || T('Eurodemics.awaitingReport'));
            set('#ed-count', T('Eurodemics.activeClosed', { active: stats.active, closed: stats.past }));
            set('#ed-message', this.message || '');
        },

        render: function () {
            if (!this.win || !this.win.isConnected) return;
            const panel = this.win.querySelector('#ed-panel');
            if (!panel) return;
            if (!ES()) {
                panel.innerHTML = `<div style="${S.card}">${T('Eurodemics.offline')}</div>`;
                return;
            }
            if (this.tab === 'situation') this.renderSituation(panel);
            else if (this.tab === 'outbreaks') this.renderOutbreaks(panel);
            else this.renderArchive(panel);
            this.renderStatusBar();
            this.lastDay = ES().dayIndex();
        },

        button: function (label, style, id, onClick) {
            const b = document.createElement('div');
            b.className = 'focusable';
            b.tabIndex = 0;
            if (id) b.id = id;
            b.style.cssText = style;
            b.textContent = label;
            b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
            return b;
        },

        // Re-draw when the model rolls over to a new day, so a window left open
        // while the game runs keeps up with the curve instead of going stale.
        watchClock: function () {
            const tick = () => {
                if (!this.win || !this.win.isConnected) return;   // window closed, stop
                const day = ES() ? ES().dayIndex() : null;
                if (day != null && day !== this.lastDay) this.render();
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        },

        // --- Situation ------------------------------------------------------

        renderSituation: function (panel) {
            const stats = ES().stats();
            const hotspots = ES().hotspots(8);
            const tile = (value, label, color) => `
                <div style="${S.tile}">
                    <div style="${S.tileNum} color:${color || C.ink}">${escapeHtml(value)}</div>
                    <div style="${S.tileLbl}">${escapeHtml(label)}</div>
                </div>`;

            const rows = hotspots.map(h => `
                <tr>
                    <td style="${S.td}">${escapeHtml(placeName(h.place))}</td>
                    <td style="${S.td} text-align:right">${num(h.infected)}</td>
                    <td style="${S.td} text-align:right">${num(h.population)}</td>
                    <td style="${S.td} text-align:right">${pct(h.prevalence)}</td>
                    <td style="${S.td}">${escapeHtml(h.outbreaks.map(e => e.diseaseName || ES().nameOf(e)).join(', '))}</td>
                </tr>`).join('');

            panel.innerHTML = `
                <h2 style="${S.h}">${T('Eurodemics.situationReport')}</h2>
                <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap">
                    ${tile(num(stats.active), T('Eurodemics.outbreaksRunning'))}
                    ${tile(num(stats.infected), T('Eurodemics.currentlyIll'), C.ill)}
                    ${tile(num(stats.dead), T('Eurodemics.deadActive'), C.dead)}
                    ${tile(num(stats.towns), T('Eurodemics.townsAffected'))}
                    ${tile(num(stats.totalDead), T('Eurodemics.deadAllRecords'), C.dead)}
                </div>
                <div id="ed-local"></div>
                <h3 style="${S.h} margin-top:14px">${T('Eurodemics.worstTowns')}</h3>
                ${hotspots.length ? `
                <div style="${S.card} padding:6px 8px">
                  <table style="${S.table}">
                    <thead><tr>
                      <th style="${S.th}">${T('Eurodemics.colTown')}</th><th style="${S.th} text-align:right">${T('Eurodemics.colIll')}</th>
                      <th style="${S.th} text-align:right">${T('Eurodemics.colPopulation')}</th>
                      <th style="${S.th} text-align:right">${T('Eurodemics.colShareIll')}</th>
                      <th style="${S.th}">${T('Eurodemics.colOutbreak')}</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>` : `<div style="${S.card} ${S.note}">${T('Eurodemics.nothingBurning')}</div>`}
            `;

            this.renderLocal(panel.querySelector('#ed-local'));
        },

        // What the terminal can tell the person actually holding it: where they
        // are, what is going around there, and who in the party already has it.
        renderLocal: function (holder) {
            if (!holder) return;
            const place = ES().currentPlace();
            const party = (window.$gameParty && $gameParty.members) ? $gameParty.members() : [];
            const ill = [];
            if (DS()) {
                for (const actor of party) {
                    for (const entry of DS().actorEntries(actor)) {
                        const disease = DS().getDisease(entry.id);
                        if (disease) ill.push(T('Eurodemics.illLine', { actor: actor.name(), disease: disease.name }));
                    }
                }
            }
            if (!place) {
                holder.innerHTML = `<div style="${S.card}"><b>${T('Eurodemics.yourPosition')}</b>
                    <div style="${S.note}">${T('Eurodemics.outsideNetwork')}</div>
                    ${ill.length ? `<div style="margin-top:6px">${T('Eurodemics.carriedByParty', { list: escapeHtml(ill.join('; ')) })}</div>` : ''}</div>`;
                return;
            }
            const live = ES().activeAt(place.key);
            const lines = live.map(e => {
                const site = e.sites[place.key];
                return `<div style="margin-top:4px"><b>${escapeHtml(ES().nameOf(e))}</b>
                    <div style="${S.note}">${T('Eurodemics.localLine', { ill: num(site.infected), residents: num(place.population),
                      share: pct(ES().prevalenceAt(place.key, e)), dead: num(site.dead) })}</div></div>`;
            }).join('');
            holder.innerHTML = `
                <div style="${S.card}">
                    <b>${T('Eurodemics.yourPositionAt', { place: escapeHtml(placeName(place.key)) })}</b>
                    ${live.length ? lines
                        : `<div style="${S.note}">${T('Eurodemics.noOutbreakHere')}</div>`}
                    ${ill.length ? `<div style="margin-top:8px; color:var(--xp-red-3)">${T('Eurodemics.carriedByParty', { list: escapeHtml(ill.join('; ')) })}</div>`
                        : `<div style="${S.note} margin-top:8px">${T('Eurodemics.nobodyIll')}</div>`}
                </div>`;
        },

        // --- Outbreaks ------------------------------------------------------

        renderOutbreaks: function (panel) {
            const active = ES().active();
            if (!active.length) {
                panel.innerHTML = `<h2 style="${S.h}">${T('Eurodemics.activeOutbreaks')}</h2>
                    <div style="${S.card} ${S.note}">${T('Eurodemics.noActiveOutbreaks')}</div>`;
                return;
            }
            if (!this.selectedId || !active.some(e => e.id === this.selectedId)) {
                this.selectedId = active[0].id;
            }
            panel.innerHTML = `
                <h2 style="${S.h}">${T('Eurodemics.activeOutbreaks')}</h2>
                <div id="ed-list" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px"></div>
                <div id="ed-detail"></div>`;

            const list = panel.querySelector('#ed-list');
            active.forEach(epidemic => {
                const on = epidemic.id === this.selectedId;
                const chip = this.button(
                    `${epidemic.diseaseName || ES().nameOf(epidemic)} - ${epidemic.origin}`,
                    S.btn + (on ? ' background:var(--xp-green-3); color:var(--xp-white); border-color:var(--xp-green-2); font-weight:bold;' : ''),
                    'ed-pick-' + epidemic.id,
                    () => {
                        this.selectedId = epidemic.id;
                        if (window.SoundManager) SoundManager.playCursor();
                        this.render();
                    });
                list.appendChild(chip);
            });

            this.renderDetail(panel.querySelector('#ed-detail'), ES().get(this.selectedId));
        },

        renderDetail: function (holder, epidemic) {
            if (!holder || !epidemic) return;
            const disease = DS() ? DS().getDisease(epidemic.diseaseId) : null;
            const hysteria = epidemic.kind === 'hysteria';
            const infected = Object.values(epidemic.sites)
                .reduce((n, site) => n + (site.infected || 0), 0);

            const siteRows = Object.entries(epidemic.sites)
                .sort((a, b) => (b[1].infected || 0) - (a[1].infected || 0))
                .map(([key, site]) => {
                    const place = ES().place(key);
                    return `<tr>
                        <td style="${S.td}">${escapeHtml(placeName(key))}</td>
                        <td style="${S.td} text-align:right">${num(site.infected || 0)}</td>
                        <td style="${S.td} text-align:right">${num(site.cases || 0)}</td>
                        <td style="${S.td} text-align:right">${num(site.dead || 0)}</td>
                        <td style="${S.td} text-align:right">${place ? num(place.population) : '&mdash;'}</td>
                    </tr>`;
                }).join('');

            holder.innerHTML = `
                <div style="${S.card}">
                    <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap">
                        <div style="font-size:17px; font-weight:bold">${escapeHtml(ES().nameOf(epidemic))}</div>
                        <span style="font-size:13px; padding:1px 7px; border-radius:8px; color:var(--xp-white); background:${hysteria ? '#6b4fa8' : '#1f6f5c'}">
                              ${hysteria ? T('Eurodemics.massHysteria') : T('Eurodemics.pathogen')}</span>
                        <span style="${S.note}">${T('Eurodemics.since', { date: escapeHtml(ES().dateStr(epidemic.startDay)) })}</span>
                    </div>
                    ${disease && disease.desc ? `<div style="${S.note} margin:4px 0 8px">${escapeHtml(disease.desc)}</div>` : ''}
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px">
                        <div style="${S.tile}"><div style="${S.tileNum} color:${C.ill}">${num(infected)}</div>
                            <div style="${S.tileLbl}">${T('Eurodemics.currentlyIll')}</div></div>
                        <div style="${S.tile}"><div style="${S.tileNum}">${num(epidemic.totals.cases)}</div>
                            <div style="${S.tileLbl}">${T('Eurodemics.casesInTotal')}</div></div>
                        <div style="${S.tile}"><div style="${S.tileNum} color:${C.dead}">${num(epidemic.totals.dead)}</div>
                            <div style="${S.tileLbl}">${T('Eurodemics.dead')}</div></div>
                        <div style="${S.tile}"><div style="${S.tileNum}">${Object.keys(epidemic.sites).length}</div>
                            <div style="${S.tileLbl}">${T('Eurodemics.townsReached')}</div></div>
                        <div style="${S.tile}"><div style="${S.tileNum}">${epidemic.r0}</div>
                            <div style="${S.tileLbl}">${T('Eurodemics.spreadRate')}</div></div>
                    </div>
                    ${buildChart(epidemic)}
                </div>
                <div style="${S.card} padding:6px 8px">
                    <table style="${S.table}">
                        <thead><tr>
                            <th style="${S.th}">${T('Eurodemics.colTown')}</th><th style="${S.th} text-align:right">${T('Eurodemics.colIllNow')}</th>
                            <th style="${S.th} text-align:right">${T('Eurodemics.colCases')}</th>
                            <th style="${S.th} text-align:right">${T('Eurodemics.dead')}</th>
                            <th style="${S.th} text-align:right">${T('Eurodemics.colPopulation')}</th>
                        </tr></thead>
                        <tbody>${siteRows}</tbody>
                    </table>
                </div>
                ${epidemic.log && epidemic.log.length ? `
                <div style="${S.card}">
                    <div style="font-weight:bold; margin-bottom:4px">${T('Eurodemics.bureauLog')}</div>
                    ${epidemic.log.slice(-6).reverse().map(entry =>
                        `<div style="${S.note}">${escapeHtml(ES().dateStr(entry.day))} &mdash; ${escapeHtml(ES().logTextOf(entry))}</div>`).join('')}
                </div>` : ''}`;

            attachChartHover(this.win, epidemic);
        },

        // --- Archive --------------------------------------------------------

        renderArchive: function (panel) {
            const past = ES().past();
            const historical = ES().historical();

            const pastRows = past.map(epidemic => `
                <tr class="focusable" tabindex="0" id="ed-arch-${escapeHtml(epidemic.id)}"
                    style="cursor:pointer; ${this.archiveId === epidemic.id ? 'background:#e7f0ec;' : ''}">
                    <td style="${S.td}">${escapeHtml(ES().nameOf(epidemic))}</td>
                    <td style="${S.td}">${escapeHtml(epidemic.kind === 'hysteria' ? 'hysteria' : 'pathogen')}</td>
                    <td style="${S.td}">${escapeHtml(ES().dateStr(epidemic.startDay))}</td>
                    <td style="${S.td}">${epidemic.endDay != null ? escapeHtml(ES().dateStr(epidemic.endDay)) : '&mdash;'}</td>
                    <td style="${S.td} text-align:right">${num(epidemic.totals.cases)}</td>
                    <td style="${S.td} text-align:right">${num(epidemic.totals.dead)}</td>
                </tr>`).join('');

            const histRows = historical.slice().reverse().map(record => `
                <tr>
                    <td style="${S.td}">${escapeHtml(record.name)}</td>
                    <td style="${S.td}">${escapeHtml(record.kind === 'hysteria' ? 'hysteria' : 'pathogen')}</td>
                    <td style="${S.td}">${escapeHtml(record.startDate)}</td>
                    <td style="${S.td}">${escapeHtml(record.endDate || '')}</td>
                    <td style="${S.td} text-align:right">${num(record.infected)}</td>
                    <td style="${S.td} text-align:right">${num(record.deaths)}</td>
                </tr>
                <tr><td colspan="6" style="${S.td} ${S.note} padding-top:0">
                    ${escapeHtml((record.places || []).map(placeName).join(', '))}</td></tr>`).join('');

            const head = (last) => `<thead><tr>
                <th style="${S.th}">${T('Eurodemics.colOutbreak')}</th><th style="${S.th}">${T('Eurodemics.colKind')}</th>
                <th style="${S.th}">${T('Eurodemics.colFrom')}</th><th style="${S.th}">${T('Eurodemics.colTo')}</th>
                <th style="${S.th} text-align:right">${T('Eurodemics.colCases')}</th>
                <th style="${S.th} text-align:right">${last}</th></tr></thead>`;

            panel.innerHTML = `
                <h2 style="${S.h}">${T('Eurodemics.archiveTitle')}</h2>
                <div style="${S.note} margin-bottom:10px">
                    ${T('Eurodemics.archiveBlurb')}
                </div>
                <h3 style="${S.h}">${T('Eurodemics.closedThisWorld')}</h3>
                ${past.length ? `<div style="${S.card} padding:6px 8px">
                    <table style="${S.table}">${head(T('Eurodemics.dead'))}<tbody>${pastRows}</tbody></table></div>`
                    : `<div style="${S.card} ${S.note}">${T('Eurodemics.nothingClosed')}</div>`}
                <div id="ed-arch-detail"></div>
                <h3 style="${S.h} margin-top:14px">${T('Eurodemics.lastCentury')}</h3>
                ${historical.length ? `<div style="${S.card} padding:6px 8px">
                    <table style="${S.table}">${head(T('Eurodemics.dead'))}<tbody>${histRows}</tbody></table></div>`
                    : `<div style="${S.card} ${S.note}">${T('Eurodemics.historyEmpty')}</div>`}`;

            past.forEach(epidemic => {
                const row = panel.querySelector('#ed-arch-' + epidemic.id);
                if (!row) return;
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.archiveId = this.archiveId === epidemic.id ? null : epidemic.id;
                    if (window.SoundManager) SoundManager.playCursor();
                    this.render();
                });
            });

            const detail = panel.querySelector('#ed-arch-detail');
            const chosen = past.find(e => e.id === this.archiveId);
            if (detail && chosen) {
                detail.innerHTML = `<div style="${S.card}">
                    <div style="font-weight:bold; margin-bottom:6px">${escapeHtml(ES().nameOf(chosen))}</div>
                    ${buildChart(chosen)}
                    <div style="${S.note} margin-top:6px">
                        ${T.n('Eurodemics.archive.reachedTowns', Object.keys(chosen.sites).length, { n: Object.keys(chosen.sites).length })}
                        ${escapeHtml(Object.keys(chosen.sites).map(placeName).join(', '))}
                    </div>
                </div>`;
                attachChartHover(this.win, chosen);
            }
        },
    };

    // Register the observatory terminal in HypernetOS.
    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: T('Eurodemics.appName'),
            icon: APP_ICON,
            launchFn: function () {
                window.HypernetEurodemics.launch();
            },
            desktopShortcut: true
        });
    }

})();
