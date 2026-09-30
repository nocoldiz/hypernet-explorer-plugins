/*:
 * @target MZ
 * @plugindesc v1.0.0 Calendar app for HypernetOS: every nation's public holidays to 2100, quest deadlines and the party's own appointments.
 * @author Omni-Lex
 *
 * @help
 * HypernetCalendar.js
 *
 * A month-to-a-page calendar on the hyperdeck desktop, from January 2001 (the
 * day the clock starts) to December 2100. Every day shows:
 *
 *   - the public holidays of the nation picked in the header (the one the
 *     party stands in by default), or of every nation at once, read off
 *     window.PublicHolidays (Core/TimeDateSystem.js);
 *   - the elections due that day in that nation (NPCPolitics);
 *   - the deadline of every procedural quest the party has taken
 *     (window.ProceduralQuests);
 *   - the party's own appointments, set here with an hour and a line of text.
 *
 * An appointment is kept with the save ($gameSystem._calendarAppointments). On
 * the map a toast reminds the party of it when its day begins and again when
 * its hour comes.
 *
 * Launch:
 *   window.HypernetOS.launchApp('app-calendar')
 *   window.HypernetCalendar.launch()
 *
 * Load AFTER HypernetOS.js.
 */

(() => {
    'use strict';

    const APP_ID = 'app-calendar';
    const WINDOW_ID = 'win-calendar';
    const ICON = 189;
    const FIRST_YEAR = 2001;
    const ALL = '*';                     // i18n-ignore  the "every nation" choice
    const HERE = '';                     // the nation the party stands in
    const MAX_TEXT = 80;
    const REMIND_WINDOW = 180;           // minutes after its hour an appointment is still "now"

    const tr = (key, params) => T('HypernetCalendar.' + key, params);
    const PH = () => window.PublicHolidays;

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function nowMinute() {
        return (typeof $gameVariables !== 'undefined' && $gameVariables) ? ($gameVariables.value(114) || 0) : 0;
    }

    function hourLabel(h) { return String(h).padStart(2, '0') + ':00'; }

    function monthName(m) {
        const list = T.list ? T.list('TimeDate.months') : [];
        return (list && list[m - 1]) || String(m);
    }

    // ---- Appointments ----------------------------------------------------------

    const Appointments = {
        list() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
            if (!Array.isArray($gameSystem._calendarAppointments)) $gameSystem._calendarAppointments = [];
            return $gameSystem._calendarAppointments;
        },
        onDay(day) {
            const P = PH();
            if (!P) return [];
            return this.list().filter(a => P.dayOfMinute(a.minute) === day).sort((a, b) => a.minute - b.minute);
        },
        add(day, hour, text) {
            const P = PH();
            const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
            if (!P || !clean) return null;
            const minute = P.minuteOfDay(day) + Math.max(0, Math.min(23, hour | 0)) * 60;
            const list = this.list();
            const id = (list.reduce((m, a) => Math.max(m, a.id || 0), 0) || 0) + 1;
            const appt = { id, minute, text: clean, dayToast: false, hourToast: false };
            // An hour already gone needs no reminder.
            if (minute + REMIND_WINDOW <= nowMinute()) appt.dayToast = appt.hourToast = true;
            list.push(appt);
            return appt;
        },
        remove(id) {
            const list = this.list();
            const i = list.findIndex(a => a.id === id);
            if (i >= 0) list.splice(i, 1);
        },
        // Reminders on the map: the morning of the day, then the hour itself.
        remind() {
            const P = PH();
            if (!P || !window.ParchmentToast) return;
            const now = nowMinute();
            const today = P.todayIndex();
            for (const a of this.list()) {
                if (a.hourToast) continue;
                const day = P.dayOfMinute(a.minute);
                const hour = Math.round((a.minute - P.minuteOfDay(day)) / 60);
                if (now >= a.minute + REMIND_WINDOW) { a.dayToast = a.hourToast = true; continue; }
                if (now >= a.minute) {
                    a.dayToast = a.hourToast = true;
                    toast(tr('toast.now', { text: a.text, time: hourLabel(hour) }));
                } else if (!a.dayToast && day === today) {
                    a.dayToast = true;
                    toast(tr('toast.today', { text: a.text, time: hourLabel(hour) }));
                }
            }
        },
    };

    function toast(text) {
        try {
            window.ParchmentToast.show(text, { severity: 'info', title: tr('toast.title'), icon: ICON });
        } catch (_) { /* a reminder is never worth a crash */ }
    }

    // ---- What a day holds --------------------------------------------------------

    function questDeadlines(day) {
        const Q = window.ProceduralQuests;
        const P = PH();
        if (!Q || !P || typeof Q.activeQuests !== 'function') return [];
        let quests = [];
        try { quests = Q.activeQuests() || []; } catch (_) { quests = []; }
        return quests.filter(q => q && q.deadlineAt > 0 && P.dayOfMinute(q.deadlineAt) === day);
    }

    // Elections due that day in a nation: the hyperpower holding it and the
    // nation's own government.
    function electionsOn(country, day) {
        const Pol = window.NPCPolitics, P = PH();
        if (!Pol || !P || !country) return [];
        const out = [];
        const power = Pol.controllerOf ? Pol.controllerOf(country) : null;
        const pw = power && Pol.getPower ? Pol.getPower(power) : null;
        if (pw && pw.nextElectionMinute != null && P.dayOfMinute(pw.nextElectionMinute) === day) {
            out.push(tr('election.power', { election: Pol.electionLabelOf ? Pol.electionLabelOf(power) : '',
                power: window.WorldNames && window.WorldNames.power ? window.WorldNames.power(power) : power }));
        }
        const nation = Pol.getNation ? Pol.getNation(country) : null;
        if (nation && nation.nextElectionMinute != null && P.dayOfMinute(nation.nextElectionMinute) === day) {
            out.push(tr('election.nation', { nation: P.nationLabel(country) }));
        }
        return out;
    }

    // Holidays of one nation, or of every nation, on the days of a month:
    // Map(day -> [{ id, country }]).
    function holidaysOfMonth(choice, y, m) {
        const P = PH();
        const out = new Map();
        if (!P) return out;
        const first = P.dayIndexOf(y, m, 1), last = P.dayIndexOf(y, m + 1, 1) - 1;
        const countries = choice === ALL ? P.countries() : [choice || P.here()].filter(Boolean);
        for (const country of countries) {
            for (const h of P.inYear(country, y)) {
                if (h.day < first || h.day > last) continue;
                if (!out.has(h.day)) out.set(h.day, []);
                out.get(h.day).push({ id: h.id, country, scope: h.scope });
            }
        }
        return out;
    }

    // ---- The window ------------------------------------------------------------

    window.HypernetCalendar = {
        Appointments,
        holidaysOfMonth,
        questDeadlines,
        electionsOn,

        launch() {
            if (!window.HypernetOS || !window.HypernetOS.Syscalls) {
                console.error('HypernetOS core not loaded!');
                return;
            }
            const P = PH();
            if (!P) { console.warn('HypernetCalendar: window.PublicHolidays is missing.'); return; }

            const today = P.todayIndex();
            const t0 = P.dateOfDay(today);
            const state = { y: t0.y, m: t0.m, selected: today, nation: HERE };

            const contentHTML = `
                <div class="hcal" style="display:flex; flex-direction:column; height:100%; font-family:Tahoma,sans-serif; background:var(--xp-bg); overflow:hidden">
                    <div style="background:linear-gradient(135deg, var(--xp-navy-8) 0%, var(--xp-navy-7) 55%, var(--xp-sky) 100%); padding:8px 12px; display:flex; align-items:center; gap:6px; border-bottom:2px solid var(--xp-navy-6); flex-shrink:0; flex-wrap:wrap">
                        <button id="hcal-prev-year" class="focusable hcal-btn" data-focus-key="hcal-prev-year" tabindex="0" title="${escapeHtml(tr('prevYear'))}">&laquo;</button>
                        <button id="hcal-prev" class="focusable hcal-btn" data-focus-key="hcal-prev" tabindex="0" title="${escapeHtml(tr('prevMonth'))}">&lsaquo;</button>
                        <div id="hcal-title" style="color:var(--xp-white); font-weight:bold; font-size:18px; min-width:190px; text-align:center"></div>
                        <button id="hcal-next" class="focusable hcal-btn" data-focus-key="hcal-next" tabindex="0" title="${escapeHtml(tr('nextMonth'))}">&rsaquo;</button>
                        <button id="hcal-next-year" class="focusable hcal-btn" data-focus-key="hcal-next-year" tabindex="0" title="${escapeHtml(tr('nextYear'))}">&raquo;</button>
                        <button id="hcal-today" class="focusable hcal-btn" data-focus-key="hcal-today" tabindex="0">${escapeHtml(tr('today'))}</button>
                        <div style="margin-left:auto; display:flex; align-items:center; gap:4px">
                            <button id="hcal-nation-prev" class="focusable hcal-btn" data-focus-key="hcal-nation-prev" tabindex="0">&lsaquo;</button>
                            <select id="hcal-nation" class="focusable" data-focus-key="hcal-nation" tabindex="0" style="font-family:Tahoma,sans-serif; font-size:14px; max-width:230px; padding:2px"></select>
                            <button id="hcal-nation-next" class="focusable hcal-btn" data-focus-key="hcal-nation-next" tabindex="0">&rsaquo;</button>
                        </div>
                    </div>
                    <div style="display:flex; flex:1; min-height:0">
                        <div style="flex:3; display:flex; flex-direction:column; padding:6px; min-width:0">
                            <div id="hcal-weekdays" style="display:grid; grid-template-columns:repeat(7, 1fr); gap:2px; font-size:12px; color:var(--xp-ink-soft); text-align:center; margin-bottom:2px"></div>
                            <div id="hcal-grid" style="display:grid; grid-template-columns:repeat(7, 1fr); grid-template-rows:repeat(6, 1fr); gap:2px; flex:1; min-height:0"></div>
                        </div>
                        <div style="flex:2; border-left:1px solid var(--xp-ink-pale-2); display:flex; flex-direction:column; min-width:0; background:var(--xp-white)">
                            <div id="hcal-day-title" style="padding:8px 10px; font-weight:bold; font-size:15px; color:var(--xp-navy-7); border-bottom:1px solid var(--xp-ink-pale-2)"></div>
                            <div id="hcal-day-body" style="flex:1; overflow-y:auto; padding:6px 10px; font-size:13px; color:var(--xp-ink-3)"></div>
                            <div style="border-top:1px solid var(--xp-ink-pale-2); padding:6px 10px; background:var(--xp-off-white)">
                                <div style="font-size:12px; color:var(--xp-ink-soft); margin-bottom:4px">${escapeHtml(tr('newAppointment'))}</div>
                                <div style="display:flex; gap:4px">
                                    <select id="hcal-hour" class="focusable" data-focus-key="hcal-hour" tabindex="0" style="font-family:Tahoma,sans-serif; font-size:13px"></select>
                                    <input id="hcal-text" class="focusable" data-focus-key="hcal-text" tabindex="0" type="text" maxlength="${MAX_TEXT}" spellcheck="false"
                                           placeholder="${escapeHtml(tr('placeholder'))}" style="flex:1; min-width:0; font-family:Tahoma,sans-serif; font-size:13px; padding:2px 4px">
                                    <button id="hcal-add" class="focusable hcal-btn" data-focus-key="hcal-add" tabindex="0">${escapeHtml(tr('add'))}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="hcal-status" style="border-top:1px solid var(--xp-ink-pale-2); padding:3px 10px; background:var(--xp-bg); font-size:12px; color:var(--xp-text-muted); flex-shrink:0">&nbsp;</div>
                </div>
                <style>
                    #${WINDOW_ID} .hcal-btn { font-family:Tahoma,sans-serif; font-size:14px; padding:3px 8px; background:var(--xp-bg); border:1px solid var(--xp-ink-faint-3); cursor:pointer }
                    #${WINDOW_ID} .hcal-cell { background:var(--xp-white); border:1px solid var(--xp-silver-3); padding:2px 3px; overflow:hidden; cursor:pointer; display:flex; flex-direction:column; font-size:11px; min-height:0 }
                    #${WINDOW_ID} .hcal-cell.out { opacity:0.35 }
                    #${WINDOW_ID} .hcal-cell.weekend { background:var(--xp-off-white) }
                    #${WINDOW_ID} .hcal-cell.holiday { background:#fbeee0 }
                    #${WINDOW_ID} .hcal-cell.today { border:2px solid var(--xp-sky) }
                    #${WINDOW_ID} .hcal-cell.selected { outline:2px solid var(--xp-navy-7); outline-offset:-2px }
                    #${WINDOW_ID} .hcal-num { font-weight:bold; font-size:13px; color:var(--xp-ink-3) }
                    #${WINDOW_ID} .hcal-tag { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25 }
                    #${WINDOW_ID} .hcal-tag.hol { color:#8b3a00 }
                    #${WINDOW_ID} .hcal-tag.quest { color:var(--xp-red-4) }
                    #${WINDOW_ID} .hcal-tag.appt { color:var(--xp-navy-7) }
                    #${WINDOW_ID} .hcal-tag.vote { color:var(--xp-violet) }
                    #${WINDOW_ID} .hcal-section { font-weight:bold; margin:8px 0 3px; color:var(--xp-navy-7) }
                    #${WINDOW_ID} .hcal-row { display:flex; gap:6px; align-items:center; padding:2px 0 }
                    #${WINDOW_ID} .hcal-del { margin-left:auto; font-size:12px; padding:1px 6px }
                </style>`;

            const win = window.HypernetOS.Syscalls.createWindow({
                id: WINDOW_ID,
                title: tr('title'),
                contentHTML,
                width: 760,
                height: 520,
                icon: ICON,
            });
            if (!win || win.dataset.hcalReady) return;
            win.dataset.hcalReady = '1';

            const el = id => win.querySelector('#' + id);
            const grid = el('hcal-grid');

            // Weekday heads, Monday first.
            el('hcal-weekdays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(wd => `<div>${escapeHtml(tr('weekday.' + wd))}</div>`).join('');
            el('hcal-hour').innerHTML = Array.from({ length: 24 }, (_, h) =>
                `<option value="${h}"${h === 9 ? ' selected' : ''}>${hourLabel(h)}</option>`).join('');

            // The nation list: where the party stands, every nation at once, then
            // each nation by name.
            const nations = P.countries().slice().sort((a, b) => P.nationLabel(a).localeCompare(P.nationLabel(b)));
            const choices = [HERE, ALL].concat(nations);
            const choiceLabel = c => {
                if (c === HERE) { const here = P.here(); return tr('nationHere', { nation: here ? P.nationLabel(here) : tr('nowhere') }); }
                if (c === ALL) return tr('nationAll');
                return P.nationLabel(c);
            };
            el('hcal-nation').innerHTML = choices.map((c, i) => `<option value="${i}">${escapeHtml(choiceLabel(c))}</option>`).join('');

            const setStatus = text => { el('hcal-status').textContent = text || ' '; };
            const inRange = (y, m) => (y > FIRST_YEAR || (y === FIRST_YEAR && m >= 1)) && (y < P.LAST_YEAR || (y === P.LAST_YEAR && m <= 12));
            const nationOf = () => (state.nation === HERE ? P.here() : state.nation);

            function moveMonth(delta) {
                let y = state.y, m = state.m + delta;
                while (m < 1) { m += 12; y--; }
                while (m > 12) { m -= 12; y++; }
                if (!inRange(y, m)) { if (window.SoundManager) SoundManager.playBuzzer(); return; }
                state.y = y; state.m = m;
                state.selected = P.dayIndexOf(y, m, 1);
                if (window.SoundManager) SoundManager.playCursor();
                render();
            }

            function renderGrid() {
                const first = P.dayIndexOf(state.y, state.m, 1);
                const lead = (P.dateOfDay(first).weekday + 6) % 7;     // Monday first
                const start = first - lead;
                const holidays = holidaysOfMonth(state.nation === HERE ? P.here() : state.nation, state.y, state.m);
                const quests = new Map(), appts = new Map();
                for (let d = first; d < first + 31; d++) {
                    const q = questDeadlines(d); if (q.length) quests.set(d, q);
                    const a = Appointments.onDay(d); if (a.length) appts.set(d, a);
                }
                const country = nationOf();
                let html = '';
                for (let i = 0; i < 42; i++) {
                    const day = start + i;
                    const dt = P.dateOfDay(day);
                    const inMonth = dt.m === state.m;
                    const hol = inMonth ? (holidays.get(day) || []) : [];
                    const cls = ['hcal-cell'];
                    if (!inMonth) cls.push('out');
                    if (dt.weekday === 0 || dt.weekday === 6) cls.push('weekend');
                    if (hol.length) cls.push('holiday');
                    if (day === today) cls.push('today');
                    if (day === state.selected) cls.push('selected');
                    const tags = [];
                    if (hol.length) {
                        const label = state.nation === ALL
                            ? tr('nationsCount', { count: new Set(hol.map(h => h.country)).size })
                            : P.nameOf(hol[0].id) + (hol.length > 1 ? ' +' + (hol.length - 1) : '');
                        tags.push(`<div class="hcal-tag hol">${escapeHtml(label)}</div>`);
                    }
                    if (inMonth && state.nation !== ALL && electionsOn(country, day).length) tags.push(`<div class="hcal-tag vote">${escapeHtml(tr('tag.election'))}</div>`);
                    if (quests.has(day)) tags.push(`<div class="hcal-tag quest">${escapeHtml(tr('tag.deadline', { count: quests.get(day).length }))}</div>`);
                    if (appts.has(day)) tags.push(`<div class="hcal-tag appt">${escapeHtml(appts.get(day)[0].text)}</div>`);
                    html += `<div class="focusable ${cls.join(' ')}" data-day="${day}" data-focus-key="hcal-day-${i}" tabindex="0"><span class="hcal-num">${dt.d}</span>${tags.join('')}</div>`;
                }
                grid.innerHTML = html;
                grid.querySelectorAll('.hcal-cell.focusable').forEach(cell => {
                    cell.addEventListener('click', () => {
                        const day = Number(cell.dataset.day);
                        const dt = P.dateOfDay(day);
                        if (!inRange(dt.y, dt.m)) return;
                        state.selected = day;
                        if (dt.m !== state.m || dt.y !== state.y) { state.y = dt.y; state.m = dt.m; }
                        if (window.SoundManager) SoundManager.playCursor();
                        render();
                    });
                });
            }

            function renderDay() {
                const day = state.selected;
                const dt = P.dateOfDay(day);
                el('hcal-day-title').textContent = tr('dayTitle', {
                    weekday: tr('weekdayLong.' + dt.weekday), day: dt.d, month: monthName(dt.m), year: dt.y });
                const parts = [];

                // Holidays.
                const country = nationOf();
                if (state.nation === ALL) {
                    const byId = new Map();
                    for (const c of P.countries()) for (const h of P.forCountry(c, day)) {
                        if (!byId.has(h.id)) byId.set(h.id, []);
                        byId.get(h.id).push(P.nationLabel(c));
                    }
                    parts.push(`<div class="hcal-section">${escapeHtml(tr('section.holidays'))}</div>`);
                    if (!byId.size) parts.push(`<div>${escapeHtml(tr('none.holidays'))}</div>`);
                    for (const [id, list] of byId) {
                        parts.push(`<div class="hcal-row"><div><b>${escapeHtml(P.nameOf(id))}</b>: ${escapeHtml(list.sort().join(', '))}</div></div>`);
                    }
                } else {
                    const list = country ? P.forCountry(country, day) : [];
                    parts.push(`<div class="hcal-section">${escapeHtml(tr('section.holidaysIn', { nation: country ? P.nationLabel(country) : tr('nowhere') }))}</div>`);
                    if (!list.length) parts.push(`<div>${escapeHtml(tr('none.holidays'))}</div>`);
                    for (const h of list) {
                        const by = h.scope === 'power' && h.power
                            ? ' <i>(' + escapeHtml(window.WorldNames && window.WorldNames.power ? window.WorldNames.power(h.power) : h.power) + ')</i>' : '';
                        parts.push(`<div class="hcal-row"><div>${escapeHtml(P.nameOf(h.id))}${by}</div></div>`);
                    }
                    const votes = electionsOn(country, day);
                    if (votes.length) {
                        parts.push(`<div class="hcal-section">${escapeHtml(tr('section.elections'))}</div>`);
                        for (const v of votes) parts.push(`<div class="hcal-row"><div>${escapeHtml(v)}</div></div>`);
                    }
                }

                // Quest deadlines.
                const quests = questDeadlines(day);
                parts.push(`<div class="hcal-section">${escapeHtml(tr('section.deadlines'))}</div>`);
                if (!quests.length) parts.push(`<div>${escapeHtml(tr('none.deadlines'))}</div>`);
                for (const q of quests) {
                    const hour = new Date(2001, 0, 1, 10, 0, 0);
                    hour.setMinutes(hour.getMinutes() + q.deadlineAt);
                    parts.push(`<div class="hcal-row"><div>${escapeHtml(hourLabel(hour.getHours()))} ${escapeHtml(q.title || '')}</div></div>`);
                }

                // Appointments.
                const appts = Appointments.onDay(day);
                parts.push(`<div class="hcal-section">${escapeHtml(tr('section.appointments'))}</div>`);
                if (!appts.length) parts.push(`<div>${escapeHtml(tr('none.appointments'))}</div>`);
                for (const a of appts) {
                    const hour = Math.round((a.minute - P.minuteOfDay(day)) / 60);
                    parts.push(`<div class="hcal-row"><div>${escapeHtml(hourLabel(hour))} ${escapeHtml(a.text)}</div>
                        <button class="focusable hcal-btn hcal-del" data-focus-key="hcal-del-${a.id}" data-del="${a.id}" tabindex="0">${escapeHtml(tr('remove'))}</button></div>`);
                }
                const body = el('hcal-day-body');
                body.innerHTML = parts.join('');
                body.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
                    Appointments.remove(Number(btn.dataset.del));
                    if (window.SoundManager) SoundManager.playCancel();
                    setStatus(tr('status.removed'));
                    render();
                }));
            }

            function render() {
                el('hcal-title').textContent = monthName(state.m) + ' ' + state.y;
                el('hcal-nation').value = String(Math.max(0, choices.indexOf(state.nation)));
                renderGrid();
                renderDay();
            }

            function setNation(index) {
                const n = (index + choices.length) % choices.length;
                state.nation = choices[n];
                if (window.SoundManager) SoundManager.playCursor();
                render();
            }

            function addAppointment() {
                const input = el('hcal-text');
                const appt = Appointments.add(state.selected, Number(el('hcal-hour').value), input.value);
                if (!appt) {
                    if (window.SoundManager) SoundManager.playBuzzer();
                    setStatus(tr('status.empty'));
                    return;
                }
                input.value = '';
                if (window.SoundManager) SoundManager.playOk();
                setStatus(tr('status.added'));
                render();
            }

            el('hcal-prev').addEventListener('click', () => moveMonth(-1));
            el('hcal-next').addEventListener('click', () => moveMonth(1));
            el('hcal-prev-year').addEventListener('click', () => moveMonth(-12));
            el('hcal-next-year').addEventListener('click', () => moveMonth(12));
            el('hcal-today').addEventListener('click', () => {
                const t = P.dateOfDay(today);
                state.y = t.y; state.m = t.m; state.selected = today;
                if (window.SoundManager) SoundManager.playCursor();
                render();
            });
            el('hcal-nation').addEventListener('change', e => setNation(Number(e.target.value)));
            el('hcal-nation-prev').addEventListener('click', () => setNation(choices.indexOf(state.nation) - 1));
            el('hcal-nation-next').addEventListener('click', () => setNation(choices.indexOf(state.nation) + 1));
            el('hcal-add').addEventListener('click', addAppointment);
            el('hcal-text').addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); addAppointment(); }
            });

            render();
        },
    };

    // Reminders while the party walks the map.
    if (typeof Scene_Map !== 'undefined') {
        const _Scene_Map_update_calendar = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function () {
            _Scene_Map_update_calendar.call(this);
            if ((Graphics.frameCount % 120) === 40 && this.isActive && this.isActive()) Appointments.remind();
        };
    }

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: tr('title'),
            icon: ICON,
            category: 'office',
            desktopShortcut: true,
            launchFn: () => window.HypernetCalendar.launch(),
        });
    }
})();
