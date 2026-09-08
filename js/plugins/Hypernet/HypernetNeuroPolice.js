/*:
 * @target MZ
 * @plugindesc v1.0.0 N€police: self-reporting, bounty settlement, custody and hearings portal for HypernetOS.
 * @author Omni-Lex
 *
 * @help
 * HypernetNeuroPolice.js
 *
 * Adds the "N€police" application to the HypernetOS desktop, the public face of
 * the nEuroPolice bureau: the continental
 * police portal where a citizen can deal with their own criminal record without
 * waiting to be caught.
 *
 * Case File   - every charge on the record (CrimeSystem), with the fine each one
 *               carries. Charges can be settled one at a time or all at once;
 *               settling removes them from the record and lowers the bounty.
 * Self-Report - confess a crime the authorities have not registered yet. A
 *               self-filed charge is entered at half its usual fine, but it is a
 *               real charge: it raises the bounty until it is settled or served.
 * Custody     - turn yourself in (straight to the cells, bounty ground down by
 *               time served) or request a hearing before Eris (ErisTrial).
 *
 * Both custody actions leave the OS first, since the cells and the courtroom are
 * map-side. Launch directly:
 *   window.HypernetOS.launchApp('app-neuropolice')
 *
 * Load AFTER HypernetOS.js, CrimeSystem.js and ErisTrial.js.
 */

(() => {
    'use strict';

    const APP_ID = 'app-neuropolice';
    const APP_ICON = 88; // Silver Star (badge), per js/db/Sprites/Icons.json

    // Bounty and fines are stored in gold; the portal only ever talks in euros.
    const euros = (gold) => ((gold || 0) / 100).toFixed(2) + '€';

    const escapeHtml = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const iconHTML = (index, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(index, size) : '');

    function citizenName() {
        const leader = ($gameParty && $gameParty.leader) ? $gameParty.leader() : null;
        return leader ? leader.name() : T('NeuroPolice.unregisteredCitizen');
    }

    function crimes() {
        return (window.CrimeSystem && window.CrimeSystem.getCrimes) ? window.CrimeSystem.getCrimes() : [];
    }

    function totalBounty() {
        return (window.CrimeSystem && window.CrimeSystem.getTotalBounty) ? window.CrimeSystem.getTotalBounty() : 0;
    }

    function inPrison() {
        return !!(window.prisonManager && window.prisonManager.isInPrison && window.prisonManager.isInPrison());
    }

    // The cells and the courtroom both live on the map, so the portal signs the
    // player out of the OS and waits for Scene_Map before handing over.
    function leaveOSThen(fn) {
        if (SceneManager._scene instanceof Scene_Map) { fn(); return; }
        SceneManager.pop();
        const deadline = Date.now() + 8000;
        const wait = () => {
            if (SceneManager._scene instanceof Scene_Map && !SceneManager.isSceneChanging()) {
                fn();
                return;
            }
            if (Date.now() > deadline) return;
            requestAnimationFrame(wait);
        };
        requestAnimationFrame(wait);
    }

    function hasTrialCommand(commandName) {
        return !!(PluginManager._commands && PluginManager._commands['ErisTrial:' + commandName]);
    }

    function runTrialCommand(commandName) {
        if (!hasTrialCommand(commandName)) {
            console.warn('nEuroPolice: ErisTrial command "' + commandName + '" is not registered.');
            return;
        }
        PluginManager.callCommand(null, 'ErisTrial', commandName, {});
    }

    function playPaid() {
        if (!window.SoundManager) return;
        if (typeof SoundManager.playShop === 'function') SoundManager.playShop();
        else SoundManager.playOk();
    }

    // --- Styling ------------------------------------------------------------
    // Continental government portal circa 2001: institutional blue, flat panels.
    const S = {
        app: 'display:flex; flex-direction:column; height:100%; background:var(--xp-face-5); ' +
             "font-family:'Tahoma',sans-serif; font-size:15px; color:var(--xp-ink-2);",
        header: 'display:flex; align-items:center; gap:12px; padding:10px 14px; ' +
                'background:linear-gradient(to bottom,var(--xp-navy-3),var(--xp-navy-2)); color:var(--xp-white); border-bottom:2px solid var(--xp-navy-9);',
        nav: 'width:150px; flex-shrink:0; background:var(--xp-face-6); border-right:1px solid var(--xp-face-shade); padding:8px 0;',
        navItem: 'padding:9px 12px; cursor:pointer; border-left:4px solid transparent; user-select:none;',
        panel: 'flex:1; overflow-y:auto; padding:14px 16px; background:var(--xp-face-2); min-width:0;',
        status: 'display:flex; gap:16px; align-items:center; border-top:1px solid var(--xp-face-shade); ' +
                'padding:4px 10px; background:var(--xp-face-5); font-size:14px; color:var(--xp-ink-4);',
        card: 'background:var(--xp-white); border:1px solid var(--xp-face-3); border-radius:3px; padding:10px 12px; margin-bottom:8px;',
        btn: 'display:inline-block; padding:5px 12px; background:linear-gradient(to bottom,var(--xp-paper),#dcd8cc); ' +
             'border:1px solid var(--xp-face-4); border-radius:3px; cursor:pointer; font-size:15px; color:var(--xp-ink); user-select:none;',
        btnMain: 'display:inline-block; padding:6px 14px; background:linear-gradient(to bottom,#3a63b8,var(--xp-navy-3)); ' +
                 'border:1px solid var(--xp-navy-2); border-radius:3px; cursor:pointer; font-size:15px; color:var(--xp-white); ' +
                 'font-weight:bold; user-select:none;',
        btnDanger: 'display:inline-block; padding:6px 14px; background:linear-gradient(to bottom,var(--xp-red-2),var(--xp-red-3)); ' +
                   'border:1px solid #6b1f18; border-radius:3px; cursor:pointer; font-size:15px; color:var(--xp-white); ' +
                   'font-weight:bold; user-select:none;',
        note: 'color:var(--xp-ink-soft-2); font-size:14px; line-height:1.5;',
        h: 'margin:0 0 8px; font-size:17px; font-weight:bold; color:var(--xp-navy-2);'
    };

    const TABS = [
        { id: 'record', get label() { return T('NeuroPolice.tab.record'); } },
        { id: 'report', get label() { return T('NeuroPolice.tab.report'); } },
        { id: 'custody', get label() { return T('NeuroPolice.tab.custody'); } }
    ];

    window.HypernetNeuroPolice = {
        win: null,
        tab: 'record',
        message: null,      // transient line shown in the status bar
        reportFilter: '',

        launch: function() {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error('HypernetOS core not loaded!');
                return;
            }

            this.tab = 'record';
            this.message = null;
            this.reportFilter = '';

            const contentHTML = `
                <div style="${S.app}">
                    <div style="${S.header}">
                        <div style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.5))">${iconHTML(APP_ICON, 34)}</div>
                        <div style="flex:1; min-width:0">
                            <div style="font-size:17px; font-weight:bold; letter-spacing:0.5px">${T('NeuroPolice.banner')}</div>
                            <div style="font-size:13px; opacity:0.82">${T('NeuroPolice.subtitle')}</div>
                        </div>
                        <div id="np-status-pill" style="padding:4px 10px; font-size:14px; font-weight:bold"></div>
                    </div>
                    <div style="display:flex; flex:1; min-height:0">
                        <div id="np-nav" style="${S.nav}"></div>
                        <div id="np-panel" style="${S.panel}"></div>
                    </div>
                    <div style="${S.status}">
                        <span>${T('NeuroPolice.citizenLabel')} <b id="np-citizen"></b></span>
                        <span>${T('NeuroPolice.outstandingLabel')} <b id="np-outstanding"></b></span>
                        <span>${T('NeuroPolice.walletLabel')} <b id="np-wallet"></b></span>
                        <span id="np-message" style="margin-left:auto; color:var(--xp-navy-2)"></span>
                    </div>
                </div>
            `;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: APP_ID,
                title: T('NeuroPolice.appName'),
                icon: APP_ICON,
                width: 760,
                height: 520,
                contentHTML: contentHTML
            });
            this.win = win;

            this.renderNav();
            this.render();
        },

        // --- Chrome ---------------------------------------------------------

        renderNav: function() {
            const nav = this.win && this.win.querySelector('#np-nav');
            if (!nav) return;
            nav.innerHTML = '';
            TABS.forEach(tab => {
                const item = document.createElement('div');
                item.className = 'focusable';
                item.tabIndex = 0;
                item.id = 'np-tab-' + tab.id;
                const active = this.tab === tab.id;
                item.style.cssText = S.navItem +
                    (active ? 'background:var(--xp-face-2); border-left-color:var(--xp-navy-3); font-weight:bold;' : '');
                item.textContent = tab.label;
                item.addEventListener('mouseenter', () => { if (this.tab !== tab.id) item.style.background = '#e7e4d8'; });
                item.addEventListener('mouseleave', () => { if (this.tab !== tab.id) item.style.background = 'transparent'; });
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.tab === tab.id) return;
                    this.tab = tab.id;
                    this.message = null;
                    if (window.SoundManager) SoundManager.playCursor();
                    this.renderNav();
                    this.render();
                });
                nav.appendChild(item);
            });
        },

        renderStatusBar: function() {
            if (!this.win) return;
            const bounty = totalBounty();
            const pill = this.win.querySelector('#np-status-pill');
            if (pill) {
                const wanted = bounty > 0;
                pill.style.background = wanted ? '#c0392b' : '#2e7d32';
                pill.style.color = '#fff';
                pill.textContent = wanted ? T('NeuroPolice.wanted') : T('NeuroPolice.noCharges');
            }
            const set = (sel, text) => {
                const el = this.win.querySelector(sel);
                if (el) el.textContent = text;
            };
            set('#np-citizen', citizenName());
            set('#np-outstanding', euros(bounty));
            set('#np-wallet', euros($gameParty ? $gameParty.gold() : 0));
            set('#np-message', this.message || '');
        },

        say: function(text) {
            this.message = text;
            this.renderStatusBar();
        },

        render: function() {
            if (!this.win || !this.win.isConnected) return;
            const panel = this.win.querySelector('#np-panel');
            if (!panel) return;

            // Any pending dialog belongs to the view being replaced.
            const holder = this.win.querySelector('#np-confirm');
            if (holder) holder.innerHTML = '';

            if (this.tab === 'record') this.renderRecord(panel);
            else if (this.tab === 'report') this.renderSelfReport(panel);
            else this.renderCustody(panel);

            this.renderStatusBar();
        },

        button: function(label, style, id, onClick) {
            const b = document.createElement('div');
            b.className = 'focusable';
            b.tabIndex = 0;
            if (id) b.id = id;
            b.style.cssText = style;
            b.textContent = label;
            b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
            return b;
        },

        // --- Case File ------------------------------------------------------

        renderRecord: function(panel) {
            const list = crimes();
            const bounty = totalBounty();
            const gold = $gameParty ? $gameParty.gold() : 0;

            panel.innerHTML = `
                <h2 style="${S.h}">${T('NeuroPolice.record.heading', { name: escapeHtml(citizenName()) })}</h2>
                <div style="${S.note} margin-bottom:12px">
                    ${T('NeuroPolice.record.blurb')}
                </div>
                <div id="np-charges"></div>
                <div id="np-record-actions" style="margin-top:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap"></div>
            `;

            const holder = panel.querySelector('#np-charges');
            if (list.length === 0) {
                holder.innerHTML = `<div style="${S.card} color:var(--xp-ink-6)">${T('NeuroPolice.emptyFile')}</div>`;
            } else {
                list.forEach((crime, index) => {
                    const row = document.createElement('div');
                    row.style.cssText = S.card + ' display:flex; align-items:center; gap:12px;';
                    row.innerHTML = `
                        <div style="flex:1; min-width:0">
                            <div style="font-weight:bold">${escapeHtml(crime.name)}</div>
                            <div style="${S.note}">${T('NeuroPolice.filedOn', { date: escapeHtml(crime.timestamp || T('NeuroPolice.dateUnknown')) })}</div>
                        </div>
                        <div style="font-weight:bold; color:var(--xp-red-3); white-space:nowrap">${euros(crime.bounty)}</div>
                    `;
                    const affordable = gold >= (crime.bounty || 0);
                    row.appendChild(this.button(
                        affordable ? T('NeuroPolice.settle') : T('NeuroPolice.tooCostly'),
                        S.btn + (affordable ? '' : ' opacity:0.5; cursor:default;'),
                        'np-settle-' + index,
                        () => { if (affordable) this.settleCharge(index); else this.say(T('NeuroPolice.notEnoughMoney')); }
                    ));
                    holder.appendChild(row);
                });
            }

            const actions = panel.querySelector('#np-record-actions');
            if (list.length > 0) {
                actions.appendChild(this.button(T('NeuroPolice.settleEverything', { total: euros(bounty) }), S.btnMain, 'np-settle-all',
                    () => this.settleAll()));
                if (gold < bounty) {
                    actions.appendChild(this.button(T('NeuroPolice.settleAffordable'), S.btn, 'np-settle-partial',
                        () => this.settleAffordable()));
                    const short = document.createElement('span');
                    short.style.cssText = S.note;
                    short.textContent = T('NeuroPolice.shortBy', { amount: euros(bounty - gold) });
                    actions.appendChild(short);
                }
            }
        },

        settleCharge: function(index) {
            const list = crimes();
            const crime = list[index];
            if (!crime) return;
            const fine = crime.bounty || 0;
            if ($gameParty.gold() < fine) {
                if (window.SoundManager) SoundManager.playBuzzer();
                this.say(T('NeuroPolice.notEnoughMoney'));
                return;
            }
            $gameParty.loseGold(fine);
            window.CrimeSystem.removeCrime(index);
            playPaid();
            this.say(T('NeuroPolice.settled', { crime: crime.name, amount: euros(fine) }));
            this.render();
        },

        settleAll: function() {
            const bounty = totalBounty();
            if (bounty <= 0) { this.say(T('NeuroPolice.nothingToSettle')); return; }
            if ($gameParty.gold() < bounty) {
                if (window.SoundManager) SoundManager.playBuzzer();
                this.say(T('NeuroPolice.shortBy', { amount: euros(bounty - $gameParty.gold()) }));
                return;
            }
            $gameParty.loseGold(bounty);
            const count = crimes().length;
            while (crimes().length > 0) window.CrimeSystem.removeCrime(0);
            playPaid();
            this.say(T.n('NeuroPolice.recordCleared', count, { total: euros(bounty) }));
            this.render();
        },

        // Cheapest charges first, for as far as the wallet stretches.
        settleAffordable: function() {
            let paid = 0;
            let count = 0;
            for (;;) {
                const list = crimes();
                if (list.length === 0) break;
                let cheapest = -1;
                list.forEach((c, i) => {
                    if (cheapest === -1 || (c.bounty || 0) < (list[cheapest].bounty || 0)) cheapest = i;
                });
                const fine = list[cheapest].bounty || 0;
                if (fine > $gameParty.gold()) break;
                $gameParty.loseGold(fine);
                window.CrimeSystem.removeCrime(cheapest);
                paid += fine;
                count++;
            }
            if (count === 0) {
                if (window.SoundManager) SoundManager.playBuzzer();
                this.say(T('NeuroPolice.nothingAffordable'));
            } else {
                playPaid();
                this.say(T.n('NeuroPolice.chargesSettled', count, { total: euros(paid) }));
            }
            this.render();
        },

        // --- Self-Report ----------------------------------------------------

        renderSelfReport: function(panel) {
            panel.innerHTML = `
                <h2 style="${S.h}">${T('NeuroPolice.voluntaryDeclaration')}</h2>
                <div style="${S.note} margin-bottom:10px">
                    ${T('NeuroPolice.declarationBlurb')}
                </div>
                <input id="np-report-filter" type="text" placeholder="${T('NeuroPolice.searchOffences')}" value="${escapeHtml(this.reportFilter)}"
                       style="width:100%; box-sizing:border-box; padding:5px 8px; margin-bottom:10px; border:1px solid var(--xp-face-4); border-radius:2px; font-family:inherit; font-size:15px" />
                <div id="np-report-list"></div>
            `;

            const input = panel.querySelector('#np-report-filter');
            input.addEventListener('input', () => {
                this.reportFilter = input.value;
                this.renderReportList(panel);
            });

            this.renderReportList(panel);
        },

        renderReportList: function(panel) {
            const holder = panel.querySelector('#np-report-list');
            if (!holder) return;
            const presets = (window.CrimeSystem && window.CrimeSystem.getAllPresetCrimes)
                ? window.CrimeSystem.getAllPresetCrimes() : {};
            const filter = this.reportFilter.trim().toLowerCase();

            // Group by the preset's own category so the list reads like a charge sheet.
            const categories = {};
            Object.keys(presets).forEach(key => {
                const crime = presets[key];
                if (filter && crime.name.toLowerCase().indexOf(filter) === -1 &&
                    String(crime.category || '').toLowerCase().indexOf(filter) === -1) return;
                const cat = crime.category || 'Other';  // i18n-ignore  crime category id
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push({ key, crime });
            });

            const cats = Object.keys(categories);
            if (cats.length === 0) {
                holder.innerHTML = `<div style="${S.card} color:var(--xp-ink-6)">${T('NeuroPolice.noOffenceMatch')}</div>`;
                return;
            }

            holder.innerHTML = '';
            cats.forEach(cat => {
                const head = document.createElement('div');
                head.style.cssText = 'font-weight:bold; color:var(--xp-navy-2); margin:10px 0 4px; border-bottom:1px solid var(--xp-face-3);';
                head.textContent = cat;
                holder.appendChild(head);

                categories[cat].forEach(({ key, crime }) => {
                    const half = Math.floor((crime.bounty || 0) / 2);
                    const row = document.createElement('div');
                    row.style.cssText = S.card + ' display:flex; align-items:center; gap:12px; margin-bottom:5px; padding:7px 10px;';
                    row.innerHTML = `
                        <div style="flex:1; min-width:0">${escapeHtml(crime.name)}</div>
                        <div style="${S.note} white-space:nowrap">
                            <s>${euros(crime.bounty)}</s> &rarr; <b style="color:var(--xp-red-3)">${euros(half)}</b>
                        </div>
                    `;
                    row.appendChild(this.button(T('NeuroPolice.confess'), S.btn, 'np-confess-' + key,
                        () => this.confess(key, crime, half)));
                    holder.appendChild(row);
                });
            });
        },

        confess: function(key, crime, half) {
            if (!window.CrimeSystem) return;
            window.CrimeSystem.addCrime(crime.name + ' (self-reported)', half, key);
            if (window.SoundManager) SoundManager.playOk();
            this.say(T('NeuroPolice.declared', { crime: crime.name, amount: euros(half) }));
            this.renderStatusBar();
        },

        // --- Custody --------------------------------------------------------

        renderCustody: function(panel) {
            const bounty = totalBounty();
            const jailed = inPrison();
            const trialReady = hasTrialCommand('startTrial');
            const custodyReady = hasTrialCommand('skipToJail');

            panel.innerHTML = `
                <h2 style="${S.h}">${T('NeuroPolice.custodyHearings')}</h2>
                <div style="${S.note} margin-bottom:12px">
                    ${T('NeuroPolice.custodyBlurb', { bounty: euros(bounty) })}
                </div>
                <div id="np-custody-surrender" style="${S.card}">
                    <div style="font-weight:bold; margin-bottom:4px">${T('NeuroPolice.turnYourselfIn')}</div>
                    <div style="${S.note} margin-bottom:10px">
                        ${T('NeuroPolice.surrenderBlurb')}
                    </div>
                    <div id="np-surrender-action"></div>
                </div>
                <div id="np-custody-trial" style="${S.card}">
                    <div style="font-weight:bold; margin-bottom:4px">${T('NeuroPolice.requestHearing')}</div>
                    <div style="${S.note} margin-bottom:10px">
                        ${T('NeuroPolice.hearingBlurb')}
                    </div>
                    <div id="np-trial-action"></div>
                </div>
            `;

            const surrenderSlot = panel.querySelector('#np-surrender-action');
            const trialSlot = panel.querySelector('#np-trial-action');

            if (jailed) {
                const note = document.createElement('div');
                note.style.cssText = S.note;
                note.textContent = T('NeuroPolice.alreadyInCustody');
                surrenderSlot.appendChild(note);
                trialSlot.appendChild(note.cloneNode(true));
                return;
            }

            if (custodyReady) {
                surrenderSlot.appendChild(this.button(T('NeuroPolice.surrenderBtn'), S.btnDanger, 'np-surrender',
                    () => this.confirm(
                        T('NeuroPolice.surrenderConfirmTitle'),
                        T('NeuroPolice.surrenderConfirmBody', { bounty: euros(bounty) }),
                        T('NeuroPolice.surrenderOk'),
                        () => this.doSurrender()
                    )));
            } else {
                const note = document.createElement('div');
                note.style.cssText = S.note;
                note.textContent = T('NeuroPolice.bookingOffline');
                surrenderSlot.appendChild(note);
            }

            if (trialReady) {
                trialSlot.appendChild(this.button(T('NeuroPolice.requestHearing'), S.btnMain, 'np-trial',
                    () => this.confirm(
                        T('NeuroPolice.hearingConfirmTitle'),
                        bounty > 0
                            ? T('NeuroPolice.hearingConfirmBody', { bounty: euros(bounty) })
                            : T('NeuroPolice.hearingConfirmClean'),
                        T('NeuroPolice.requestOk'),
                        () => this.doTrial()
                    )));
            } else {
                const note = document.createElement('div');
                note.style.cssText = S.note;
                note.textContent = T('NeuroPolice.courtOffline');
                trialSlot.appendChild(note);
            }
        },

        // Modal holder: a sibling of the app content, hung off the OS window
        // itself, so a panel re-render never pulls the dialog out from under the
        // focus ring.
        confirmHolder: function() {
            if (!this.win) return null;
            let holder = this.win.querySelector('#np-confirm');
            if (!holder) {
                holder = document.createElement('div');
                holder.id = 'np-confirm';
                this.win.appendChild(holder);
            }
            return holder;
        },

        confirm: function(title, body, okLabel, onOk) {
            const holder = this.confirmHolder();
            if (!holder) { onOk(); return; }

            holder.innerHTML = `
                <div style="position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(20,25,40,0.45); display:flex; align-items:center; justify-content:center; z-index:10">
                    <div style="background:var(--xp-face-2); border:2px solid var(--xp-navy-2); border-radius:4px; width:380px; max-width:85%; box-shadow:0 8px 22px rgba(0,0,0,0.4)">
                        <div style="background:linear-gradient(to bottom,var(--xp-navy-3),var(--xp-navy-2)); color:var(--xp-white); padding:6px 10px; font-weight:bold">${escapeHtml(title)}</div>
                        <div style="padding:12px; line-height:1.5">${escapeHtml(body)}</div>
                        <div id="np-confirm-actions" style="padding:0 12px 12px; display:flex; gap:8px; justify-content:flex-end"></div>
                    </div>
                </div>
            `;

            const actions = holder.querySelector('#np-confirm-actions');
            actions.appendChild(this.button(T('NeuroPolice.cancel'), S.btn, 'np-confirm-cancel', () => {
                holder.innerHTML = '';
                if (window.SoundManager) SoundManager.playCancel();
            }));
            actions.appendChild(this.button(okLabel, S.btnDanger, 'np-confirm-ok', () => {
                holder.innerHTML = '';
                onOk();
            }));
        },

        doSurrender: function() {
            if (window.SoundManager) SoundManager.playOk();
            leaveOSThen(() => runTrialCommand('skipToJail'));
        },

        doTrial: function() {
            if (window.SoundManager) SoundManager.playOk();
            leaveOSThen(() => runTrialCommand('startTrial'));
        }
    };

    // Register the nEuroPolice application in HypernetOS.
    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: T('NeuroPolice.appName'),
            icon: APP_ICON,
            launchFn: function() {
                window.HypernetNeuroPolice.launch();
            },
            desktopShortcut: true
        });
    }

})();
