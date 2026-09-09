/*:
 * @target MZ
 * @plugindesc v1.1.0 Control Panel settings app for HypernetOS.
 * @author Omni-Lex
 *
 * @help
 * HypernetControlPanel.js
 *
 * Launches Control Panel:
 * window.HypernetOS.launchApp('control-panel')
 *
 * Three pages. System Specs reads the machine the desktop is running on
 * (window.HypernetOS.Host: the Hyperdeck's fitted parts when the deck booted
 * the OS, a stock desktop of 2001 otherwise). Applets is the classic view,
 * every small program of the period as an icon. Desktop Wallpaper is the
 * wallpaper picker, kept as it was.
 */

(() => {
    'use strict';

    const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    window.HypernetControlPanel = {
        // The rows of the spec sheet, read off the host profile. Exposed so a
        // test can check the sheet moves with the machine.
        specRows: function() {
            const H = window.HypernetOS.Host;
            const p = H.profile();
            const st = window.HypernetOS.Kernel.getStats();
            const left = [
                [T('ControlPanel.processor'), T('ControlPanel.cpuLine', { name: p.cpu, mhz: H.fmtMhz(p.mhz) })],
                [T('ControlPanel.memory'), T('ControlPanel.ramLine', { total: p.ram, free: st.freeRAM })],
                [T('ControlPanel.graphics'), p.integrated && p.origin !== 'hyperdeck' ? T('ControlPanel.gpuIntegrated', { name: p.gpu, mb: p.vram }) : p.gpu],
                [T('ControlPanel.hardDrive'), T('ControlPanel.hddLine', { size: H.fmtMb(p.disk), used: H.fmtMb(H.diskUsedMb()) })],
                [T('ControlPanel.powerGrid'), p.origin === 'hyperdeck' ? p.power : T('ControlPanel.psuDesktop')]
            ];
            const right = p.origin === 'hyperdeck'
                ? [
                    [T('ControlPanel.performance'), T('HyperDeck.value.index', { n: p.index })],
                    [T('ControlPanel.thermals'), window.HyperDeck.summary().thermals],
                    [T('ControlPanel.endurance'), p.endurance],
                    [T('ControlPanel.uplink'), p.modem],
                    [T('ControlPanel.audio'), p.sound],
                    [T('ControlPanel.board'), p.board]
                ]
                : [
                    [T('ControlPanel.performance'), T('HyperDeck.value.index', { n: p.index })],
                    [T('ControlPanel.maker'), p.vendor + ' ' + p.model],
                    [T('ControlPanel.caseRow'), p.caseName],
                    [T('ControlPanel.uplink'), p.modem],
                    [T('ControlPanel.audio'), p.sound],
                    [T('ControlPanel.serial'), p.serial]
                ];
            return { left, right, profile: p };
        },

        launch: function() {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error("HypernetOS core not loaded!");
                return;
            }

            const id = 'app-hypernet-control-panel';
            const rows = this.specRows();
            const p = rows.profile;
            const rowHTML = list => list.map(([label, value]) => `
                                        <tr>
                                            <td  class="hn-style-0066">${label}</td>
                                            <td  class="hn-style-0065">${escapeHtml(value)}</td>
                                        </tr>`).join('');

            const contentHTML = `
                <div class="control-panel-container hn-style-0051" >
                    <!-- Tab Headers -->
                    <div class="cp-tabs hn-style-0052" >
                        <div class="cp-tab active focusable hn-style-0053" data-pane="general" tabindex="0" >${T('ControlPanel.tabSpecs')}</div>
                        <div class="cp-tab focusable hn-style-0054" data-pane="display" tabindex="0" >${T('ControlPanel.tabWallpaper')}</div>
                    </div>

                    <!-- Tab Contents -->
                    <div class="cp-content-box hn-style-0055" >

                        <!-- GENERAL TAB -->
                        <div class="cp-tab-pane hn-style-0056" id="pane-general" >
                            <div  class="hn-style-0057">
                                <div  class="hn-style-0058">${window.HypernetOS.getIconHTML(234, 48)}</div>
                                <div>
                                    <h3  class="hn-style-0059">${T('ControlPanel.systemProperties')}</h3>
                                    <div>${T('ControlPanel.environment')}</div>
                                    <div>${T('ControlPanel.version')}</div>
                                    <div class="cp-origin">${T('ControlPanel.runningOn', { machine: escapeHtml(p.origin === 'hyperdeck' ? p.model : p.vendor + ' ' + p.model), host: escapeHtml(window.HypernetOS.Host.hostname()) })}</div>
                                </div>
                            </div>

                            <div  class="hn-style-0060">
                                <!-- Column 1: System Specs -->
                                <div  class="hn-style-0061">
                                    <h4  class="hn-style-0062">${T('ControlPanel.hardwareSpecs')}</h4>
                                    <table  class="hn-style-0063">${rowHTML(rows.left)}
                                    </table>
                                </div>

                                <!-- Column 2: what the machine adds up to -->
                                <div  class="hn-style-0061">
                                    <h4  class="hn-style-0062">${T('ControlPanel.machineStats')}</h4>
                                    <table  class="hn-style-0063">${rowHTML(rows.right)}
                                    </table>
                                </div>
                            </div>
                            <div class="cp-actions">
                                <button class="xp-btn focusable" id="cp-sysdm" tabindex="0">${T('ControlPanel.openSysdm')}</button>
                                <button class="xp-btn focusable" id="cp-devmgmt" tabindex="0">${T('ControlPanel.openDevmgmt')}</button>
                                <button class="xp-btn focusable" id="cp-bios" tabindex="0">${T('HypernetOS.bios')}</button>
                            </div>
                        </div>

                        <!-- DISPLAY TAB -->
                        <div class="cp-tab-pane hn-style-0069" id="pane-display" >
                            <div>
                                <h3  class="hn-style-0070">${T('ControlPanel.selectBackground')}</h3>
                                <p  class="hn-style-0071">${T('ControlPanel.wallpaperHint')}</p>
                            </div>

                            <div  class="hn-style-0072">
                                <!-- Bliss Wallpaper -->
                                <div class="wp-card focusable hn-style-0073" id="wp-bliss" tabindex="0" >
                                    <div  class="hn-style-0074"></div>
                                    <span  class="hn-style-0075">${T('ControlPanel.wpBliss')}</span>
                                </div>

                                <!-- Classic Teal Wallpaper -->
                                <div class="wp-card focusable hn-style-0076" id="wp-teal" tabindex="0" >
                                    <div  class="hn-style-0077"></div>
                                    <span  class="hn-style-0075">${T('ControlPanel.wpTeal')}</span>
                                </div>

                                <!-- Cosmic Space Wallpaper -->
                                <div class="wp-card focusable hn-style-0076" id="wp-space" tabindex="0" >
                                    <div  class="hn-style-0078"></div>
                                    <span  class="hn-style-0075">${T('ControlPanel.wpSpace')}</span>
                                </div>

                                <!--  Gold Wallpaper -->
                                <div class="wp-card focusable hn-style-0076" id="wp-gold" tabindex="0" >
                                    <div  class="hn-style-0079"></div>
                                    <span  class="hn-style-0075">${T('ControlPanel.wpGold')}</span>
                                </div>
                            </div>
                            <div class="cp-actions">
                                <button class="xp-btn focusable" id="cp-desk" tabindex="0">${T('ControlPanel.openDesk')}</button>
                            </div>
                        </div>

                    </div>
                </div>
            `;

            const win = window.HypernetOS.WindowManager.createWindow({
                id: id,
                title: T('ControlPanel.title'),
                icon: 234, // gear settings icon
                width: 640,
                height: 480,
                contentHTML: contentHTML
            });

            // Tabs
            const tabs = Array.from(win.querySelectorAll('.cp-tab'));
            const panes = Array.from(win.querySelectorAll('.cp-tab-pane'));
            const showPane = name => {
                tabs.forEach(tab => {
                    const active = tab.dataset.pane === name;
                    tab.className = 'cp-tab focusable ' + (active ? 'active hn-style-0053' : 'hn-style-0054');
                });
                panes.forEach(paneEl => {
                    paneEl.style.display = paneEl.id === 'pane-' + name ? 'flex' : 'none';
                });
                if (name === 'display' && window.HypernetFileSystem) {
                    const currentWp = window.HypernetFileSystem.getRegistry('wallpaper', 'bliss');
                    win.querySelectorAll('.wp-card').forEach(card => {
                        card.style.borderColor = card.id === `wp-${currentWp}` ? '#0054e3' : '#ccc';
                    });
                }
            };
            tabs.forEach(tab => tab.addEventListener('click', e => { e.stopPropagation(); showPane(tab.dataset.pane); }));

            const link = (sel, appId) => {
                const el = win.querySelector(sel);
                if (el) el.addEventListener('click', e => { e.stopPropagation(); window.HypernetOS.launchApp(appId); });
            };
            link('#cp-sysdm', 'app-sysdm');
            link('#cp-devmgmt', 'app-devmgmt');
            link('#cp-bios', 'app-bios');
            link('#cp-desk', 'app-desk');

            // Wallpaper Card Click Handlers
            const wallpaperCards = win.querySelectorAll('.wp-card');
            wallpaperCards.forEach(card => {
                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const wallpaperName = card.id.replace('wp-', '');

                    if (window.HypernetFileSystem) {
                        window.HypernetFileSystem.setRegistry('wallpaper', wallpaperName);
                    }

                    // Highlight selected card
                    wallpaperCards.forEach(c => {
                        c.style.borderColor = c.id === card.id ? '#0054e3' : '#ccc';
                    });

                    if (window.SoundManager) SoundManager.playOk();
                });
            });
        }
    };

    // Register inside HypernetOS App registry
    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: 'control-panel',
            name: T('ControlPanel.title'),
            icon: 234,
            launchFn: function() {
                window.HypernetControlPanel.launch();
            },
            desktopShortcut: true
        });
    }

})();
