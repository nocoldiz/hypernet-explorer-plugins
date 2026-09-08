/*:
 * @target MZ
 * @plugindesc v1.0.0 File Explorer "My Computer" application for HypernetOS.
 * @author Omni-Lex
 * 
 * @help
 * HypernetMyComputer.js
 * 
 * Launches File Explorer:
 * window.HypernetOS.launchApp('my-computer')
 * 
 * Launches File Explorer pointing directly to My Documents:
 * window.HypernetOS.launchApp('my-documents')
 */

(() => {
    'use strict';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.HypernetMyComputer = {
        launch: function(initialPath = 'C:') {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) {
                console.error("HypernetOS core not loaded!");
                return;
            }

            const id = 'app-hypernet-my-computer';
            let currentPath = initialPath;
            let navHistory = [];

            const getExplorerHTML = () => {
                return `
                    <div class="explorer-container hn-style-0080" >
                        <!-- Navigation Toolbar -->
                        <div class="explorer-toolbar hn-style-0081" >
                            <button id="explorer-btn-back"  disabled class="hn-style-0082">
                                <span  class="hn-style-0083">←</span> ${T('MyComputer.back')}
                            </button>
                            <div  class="hn-style-0084"></div>
                            
                            <span  class="hn-style-0066">${T('MyComputer.address')}</span>
                            <input id="explorer-address-bar" type="text" value="${currentPath}"  / class="hn-style-0085">
                            
                            <button id="explorer-btn-go"  class="hn-style-0086">${T('MyComputer.go')}</button>
                        </div>

                        <!-- Main Split Body -->
                        <div class="explorer-body hn-style-0087" >
                            <!-- Sidebar Panel -->
                            <div class="explorer-sidebar hn-style-0088" >
                                <div class="explorer-sidebar-section hn-style-0089" >
                                    <div  class="hn-style-0090">${T('MyComputer.systemTasks')}</div>
                                    <div  class="hn-style-0091">
                                        <div class="explorer-side-link focusable hn-style-0092" id="side-link-comp" tabindex="0" >${T('MyComputer.myComputer')}</div>
                                        <div class="explorer-side-link focusable hn-style-0092" id="side-link-docs" tabindex="0" >${T('MyComputer.myDocuments')}</div>
                                        <div class="explorer-side-link focusable hn-style-0092" id="side-link-desk" tabindex="0" >${T('MyComputer.desktop')}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Content Display Grid -->
                            <div id="explorer-grid-display"  class="hn-style-0093"></div>
                        </div>
                    </div>
                `;
            };

            const win = window.HypernetOS.WindowManager.createWindow({
                id: id,
                title: T('MyComputer.myComputer'),
                icon: 86, // Computer icon
                width: 680,
                height: 480,
                contentHTML: getExplorerHTML()
            });

            const gridDisplay = win.querySelector('#explorer-grid-display');
            const addressBar = win.querySelector('#explorer-address-bar');
            const backBtn = win.querySelector('#explorer-btn-back');
            const goBtn = win.querySelector('#explorer-btn-go');
            
            const sideLinkComp = win.querySelector('#side-link-comp');
            const sideLinkDocs = win.querySelector('#side-link-docs');
            const sideLinkDesk = win.querySelector('#side-link-desk');

            const refreshGrid = () => {
                addressBar.value = currentPath;
                gridDisplay.innerHTML = '';

                // Handle Back Button State
                backBtn.disabled = navHistory.length === 0;
                backBtn.style.opacity = navHistory.length === 0 ? '0.5' : '1';

                // Check directory in File System
                if (!window.HypernetFileSystem) {
                    gridDisplay.innerHTML = `<div  class="hn-style-0094">${T('MyComputer.vfsError')}</div>`;
                    return;
                }

                const contents = window.HypernetFileSystem.readDir(currentPath);
                if (!contents) {
                    gridDisplay.innerHTML = `<div  class="hn-style-0095">${T('MyComputer.dirInvalid', { path: currentPath })}</div>`;
                    return;
                }

                contents.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'explorer-grid-item focusable';
                    itemEl.tabIndex = 0;
                    
                    // Style Explorer Item
                    itemEl.style.width = '75px';
                    itemEl.style.display = 'flex';
                    itemEl.style.flexDirection = 'column';
                    itemEl.style.alignItems = 'center';
                    itemEl.style.cursor = 'pointer';
                    itemEl.style.padding = '6px';
                    itemEl.style.border = '1px solid transparent';
                    itemEl.style.borderRadius = '3px';
                    itemEl.style.userSelect = 'none';

                    // Hover effects using standard JS event listeners
                    itemEl.addEventListener('mouseenter', () => {
                        itemEl.style.background = '#e5efff';
                        itemEl.style.borderColor = '#adcbf3';
                    });
                    itemEl.addEventListener('mouseleave', () => {
                        itemEl.style.background = 'transparent';
                        itemEl.style.borderColor = 'transparent';
                    });

                    // Icon selection: Folder vs File
                    const isFolder = item.type === 'directory';
                    // A stand-in executable wears the icon of the program it opens.
                    const ownerApp = item.app && window.HypernetOS._apps[item.app];
                    const iconHTML = window.HypernetOS.getIconHTML(isFolder ? 191 : (ownerApp ? ownerApp.icon : 190), 32);

                    itemEl.innerHTML = `
                        <div  class="hn-style-0096">
                            ${iconHTML}
                        </div>
                        <div  class="hn-style-0097">${escapeHtml(item.name)}</div>
                    `;

                    // Right click: open, send to the Recycle Bin, properties.
                    itemEl.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const CM = window.HypernetOS.ContextMenu;
                        const fs = window.HypernetFileSystem;
                        if (!CM) return;
                        const filePath = `${currentPath}/${item.name}`;
                        const items = [{ label: T('HypernetOS.context.open'), bold: true, action: () => openItem(item) }];
                        if (!isFolder) {
                            items.push({ separator: true });
                            items.push({ label: T('MyComputer.delete'), action: () => {
                                const go = () => { if (fs.recycle(filePath)) refreshGrid(); };
                                if (fs.getRegistry('recycleConfirm', true)) {
                                    window.HypernetOS.Dialog.confirm(T('MyComputer.deleteConfirm', { file: item.name }), T('MyComputer.deleteTitle')).then(ok => { if (ok) go(); });
                                } else go();
                            } });
                        }
                        items.push({ separator: true });
                        items.push({ label: T('HypernetOS.context.properties'), action: () => {
                            const node = fs.resolvePath(filePath);
                            const size = node && node.type === 'file' ? String(node.content || '').length : (fs.walk(filePath).length);
                            window.HypernetOS.Dialog.alert(T('MyComputer.propsBody', { name: item.name, type: isFolder ? T('MyComputer.typeFolder') : (item.mime || T('MyComputer.typeFile')), size: size, location: currentPath.replace(/\//g, '\\') }), T('MyComputer.propsTitle', { name: item.name }));
                        } });
                        CM.show(e.clientX, e.clientY, items);
                    });

                    // Single-click selection visual highlight (for premium feel)
                    itemEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const wasSelected = itemEl.dataset.selected === '1';
                        win.querySelectorAll('.explorer-grid-item').forEach(el => {
                            el.style.background = 'transparent';
                            el.style.borderColor = 'transparent';
                            el.dataset.selected = '';
                        });
                        itemEl.style.background = '#c5dcf7';
                        itemEl.style.borderColor = '#7f9db9';
                        itemEl.dataset.selected = '1';

                        // Open on a rapid second mouse click (classic double-click) OR
                        // on re-activating the already-selected item. The latter lets
                        // keyboard / controller users browse folders: Enter selects,
                        // Enter again opens, with no double-click timing to hit.
                        const now = Date.now();
                        const dblClick = itemEl.dataset.lastClick && (now - itemEl.dataset.lastClick) < 300;
                        if (dblClick || wasSelected) {
                            openItem(item);
                        }
                        itemEl.dataset.lastClick = now;
                    });

                    gridDisplay.appendChild(itemEl);
                });
            };

            const openItem = (item) => {
                const isFolder = item.type === 'directory';
                if (isFolder) {
                    navHistory.push(currentPath);
                    currentPath = currentPath === 'C:' ? `C:/${item.name}` : `${currentPath}/${item.name}`;
                    refreshGrid();
                    if (window.SoundManager) SoundManager.playCursor();
                } else {
                    // Open File! The OS decides which program owns the
                    // document (txt: Notepad, png: Pain, csv: Hexcel, md: Wyrd,
                    // a stand-in executable: its program) and shows its own
                    // "cannot open this file" box for anything else.
                    window.HypernetOS.openFile(`${currentPath}/${item.name}`);
                }
            };

            // Back Navigation
            backBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (navHistory.length > 0) {
                    currentPath = navHistory.pop();
                    refreshGrid();
                    if (window.SoundManager) SoundManager.playCursor();
                }
            });

            // Address bar Enter
            addressBar.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.stopPropagation();
                    navigateToAddress(addressBar.value);
                }
            });

            goBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToAddress(addressBar.value);
            });

            const navigateToAddress = (newPath) => {
                if (window.HypernetFileSystem && window.HypernetFileSystem.resolvePath(newPath)) {
                    navHistory.push(currentPath);
                    currentPath = newPath;
                    refreshGrid();
                } else {
                    window.HypernetOS.Dialog.error(T('MyComputer.dirNotFound', { path: newPath }), T('MyComputer.myComputer'));
                    addressBar.value = currentPath;
                }
            };

            // Sidebar Shortcuts
            sideLinkComp.addEventListener('click', (e) => {
                e.stopPropagation();
                navHistory.push(currentPath);
                currentPath = 'C:';
                refreshGrid();
            });
            sideLinkDocs.addEventListener('click', (e) => {
                e.stopPropagation();
                navHistory.push(currentPath);
                currentPath = 'C:/Documents';
                refreshGrid();
            });
            sideLinkDesk.addEventListener('click', (e) => {
                e.stopPropagation();
                navHistory.push(currentPath);
                currentPath = 'C:/Desktop';
                refreshGrid();
            });

            // Initial render
            refreshGrid();
        }
    };

    // Register applications in HypernetOS for My Computer and My Documents
    if (window.HypernetOS) {
        // My Computer
        window.HypernetOS.registerApp({
            id: 'my-computer',
            name: T('MyComputer.myComputer'),
            icon: 86,
            launchFn: function() {
                window.HypernetMyComputer.launch('C:');
            },
            desktopShortcut: true
        });

        // My Documents
        window.HypernetOS.registerApp({
            id: 'my-documents',
            name: T('MyComputer.myDocuments'),
            icon: 191,
            launchFn: function() {
                window.HypernetMyComputer.launch('C:/Documents');
            },
            desktopShortcut: true
        });
    }

})();
