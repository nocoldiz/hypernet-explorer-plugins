/*:
 * @target MZ
 * @plugindesc v1.0.0 Token Exchange app for HypernetOS. Converts euros into arcade tokens and back.
 * @author Omni-Lex
 *
 * @help
 * HypernetTokenExchange.js
 *
 * A desktop terminal for the arcade token economy: buy tokens with the party
 * wallet, or cash unused tokens back into euros. The rate is read from the
 * GoldTokenConverter plugin parameters, so both the in-world converter machine
 * and this app always quote the same price.
 *
 * Launch:
 *   window.HypernetOS.launchApp('app-token-exchange')
 *
 * Load AFTER HypernetOS.js.
 */

(() => {
    'use strict';

    const APP_ID = 'app-token-exchange';
    const WINDOW_ID = 'win-token-exchange';

    // Same source of truth as the physical converter machine.
    const converterParams = PluginManager.parameters('GoldTokenConverter');
    const TOKEN_ITEM_ID = Number(converterParams['tokenItemId']) || 124;
    const GOLD_PER_EURO = Number(converterParams['goldToEuroRate']) || 100;
    const TOKEN_PRICE_EURO = Number(converterParams['tokenPriceEuro']) || 3.5;
    const GOLD_PER_TOKEN = Math.max(1, Math.floor(GOLD_PER_EURO * TOKEN_PRICE_EURO));

    const QUICK_AMOUNTS = [1, 5, 10];

    function tokenItem() {
        return $dataItems ? $dataItems[TOKEN_ITEM_ID] : null;
    }

    function tokenCount() {
        const item = tokenItem();
        return item ? $gameParty.numItems(item) : 0;
    }

    function euros(gold) {
        return (gold / GOLD_PER_EURO).toFixed(2);
    }

    window.HypernetTokenExchange = {
        launch: function() {
            if (!window.HypernetOS || !window.HypernetOS.Syscalls) {
                console.error('HypernetOS core not loaded!');
                return;
            }
            if (!tokenItem()) {
                console.warn(`HypernetTokenExchange: token item ${TOKEN_ITEM_ID} is missing from the database.`);
                return;
            }

            let mode = 'buy';
            let amount = 1;

            const quickButtons = QUICK_AMOUNTS.map(n => `
                <button class="focusable" data-focus-key="hte-quick-${n}" data-quick="${n}" tabindex="0"
                        style="flex:1; padding:5px 0; font-size:14px; font-family:Tahoma,sans-serif; background:var(--xp-bg); border:1px solid var(--xp-ink-faint-3); cursor:pointer">
                    ${n}
                </button>`).join('');

            const contentHTML = `
                <div style="display:flex; flex-direction:column; height:100%; font-family:Tahoma,sans-serif; background:var(--xp-bg); overflow:hidden">
                    <div style="background:linear-gradient(135deg, var(--xp-navy-8) 0%, var(--xp-navy-7) 55%, var(--xp-sky) 100%); padding:11px 16px; display:flex; align-items:center; gap:12px; border-bottom:2px solid var(--xp-navy-6); flex-shrink:0">
                        <div>
                            <div style="color:var(--xp-gold); font-weight:bold; font-size:17px; letter-spacing:2px">${T('TokenExchange.banner')}</div>
                            <div style="color:#cfe6ff; font-size:13px; margin-top:2px">${T('TokenExchange.tagline')}</div>
                        </div>
                        <div style="margin-left:auto; text-align:right; color:#cfe6ff; font-size:13px; line-height:1.5">
                            ${T('TokenExchange.rate', { price: TOKEN_PRICE_EURO.toFixed(2) })}<br>${T('TokenExchange.atPar')}
                        </div>
                    </div>

                    <div style="display:flex; gap:1px; background:var(--xp-ink-pale-2); flex-shrink:0">
                        <div style="flex:1; background:var(--xp-white); padding:8px 14px">
                            <div style="font-size:13px; color:var(--xp-ink-soft); letter-spacing:1px">${T('TokenExchange.wallet')}</div>
                            <div id="hte-euro-balance" style="font-size:21px; font-weight:bold; color:var(--xp-navy-7)">&euro;0.00</div>
                        </div>
                        <div style="flex:1; background:var(--xp-white); padding:8px 14px">
                            <div style="font-size:13px; color:var(--xp-ink-soft); letter-spacing:1px">${T('TokenExchange.tokensHeld')}</div>
                            <div id="hte-token-balance" style="font-size:21px; font-weight:bold; color:#8B6914">0</div>
                        </div>
                    </div>

                    <div style="display:flex; gap:6px; padding:10px 14px 4px 14px; flex-shrink:0">
                        <button id="hte-mode-buy" class="focusable" data-focus-key="hte-mode-buy" tabindex="0"
                                style="flex:1; padding:7px 0; font-size:15px; font-weight:bold; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">
                            ${T('TokenExchange.buyTokens')}
                        </button>
                        <button id="hte-mode-sell" class="focusable" data-focus-key="hte-mode-sell" tabindex="0"
                                style="flex:1; padding:7px 0; font-size:15px; font-weight:bold; font-family:Tahoma,sans-serif; cursor:pointer; border:1px solid var(--xp-steel)">
                            ${T('TokenExchange.sellTokens')}
                        </button>
                    </div>

                    <div style="flex:1; padding:8px 14px 12px 14px; display:flex; flex-direction:column; gap:8px; overflow-y:auto">
                        <div style="background:var(--xp-white); border:1px solid #b5b5b5; padding:10px 12px">
                            <div id="hte-amount-label" style="font-size:14px; color:var(--xp-ink-5); margin-bottom:6px">${T('TokenExchange.tokensToBuy')}</div>
                            <div style="display:flex; align-items:center; gap:6px">
                                <button id="hte-minus" class="focusable" data-focus-key="hte-minus" tabindex="0"
                                        style="width:34px; padding:5px 0; font-size:17px; font-family:Tahoma,sans-serif; background:var(--xp-bg); border:1px solid var(--xp-ink-faint-3); cursor:pointer">-</button>
                                <div id="hte-amount" style="flex:1; text-align:center; font-size:24px; font-weight:bold; color:var(--xp-ink-3); background:var(--xp-off-white); border:1px solid var(--xp-silver-3); padding:3px 0">1</div>
                                <button id="hte-plus" class="focusable" data-focus-key="hte-plus" tabindex="0"
                                        style="width:34px; padding:5px 0; font-size:17px; font-family:Tahoma,sans-serif; background:var(--xp-bg); border:1px solid var(--xp-ink-faint-3); cursor:pointer">+</button>
                            </div>
                            <div style="display:flex; gap:5px; margin-top:7px">
                                ${quickButtons}
                                <button class="focusable" data-focus-key="hte-quick-max" data-quick="max" tabindex="0"
                                        style="flex:1; padding:5px 0; font-size:14px; font-family:Tahoma,sans-serif; background:var(--xp-bg); border:1px solid var(--xp-ink-faint-3); cursor:pointer">
                                    ${T('TokenExchange.max')}
                                </button>
                            </div>
                            <div id="hte-limit" style="font-size:13px; color:var(--xp-ink-faint); margin-top:6px">&nbsp;</div>
                        </div>

                        <div style="background:#f4f4ec; border:1px solid #c8c8b8; padding:10px 12px; display:flex; justify-content:space-between; align-items:center">
                            <div>
                                <div id="hte-summary-label" style="font-size:13px; color:var(--xp-ink-soft); letter-spacing:1px">${T('TokenExchange.youPay')}</div>
                                <div id="hte-summary-value" style="font-size:23px; font-weight:bold; color:var(--xp-red-4)">&euro;0.00</div>
                            </div>
                            <div style="text-align:right">
                                <div id="hte-receive-label" style="font-size:13px; color:var(--xp-ink-soft); letter-spacing:1px">${T('TokenExchange.youReceive')}</div>
                                <div id="hte-receive-value" style="font-size:23px; font-weight:bold; color:#1d6b2f">0</div>
                            </div>
                        </div>

                        <button id="hte-confirm" class="focusable" data-focus-key="hte-confirm" tabindex="0"
                                style="width:100%; padding:11px; background:linear-gradient(135deg, var(--xp-navy-7), var(--xp-sky)); color:var(--xp-gold); border:1px solid var(--xp-sky-3); font-size:16px; font-weight:bold; font-family:Tahoma,sans-serif; letter-spacing:1.5px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.3)">
                            ${T('TokenExchange.confirm')}
                        </button>
                    </div>

                    <div id="hte-status" style="border-top:1px solid var(--xp-ink-pale-2); padding:3px 10px; background:var(--xp-bg); font-size:13px; color:var(--xp-text-muted); flex-shrink:0">
                        ${T('TokenExchange.hint')}
                    </div>
                </div>`;

            const win = window.HypernetOS.Syscalls.createWindow({
                id: WINDOW_ID,
                title: T('TokenExchange.title'),
                contentHTML: contentHTML,
                width: 480,
                height: 470,
                icon: 191
            });

            const el = id => win.querySelector('#' + id);
            const euroBalance = el('hte-euro-balance');
            const tokenBalance = el('hte-token-balance');
            const buyTab = el('hte-mode-buy');
            const sellTab = el('hte-mode-sell');
            const amountLabel = el('hte-amount-label');
            const amountBox = el('hte-amount');
            const limitLine = el('hte-limit');
            const summaryLabel = el('hte-summary-label');
            const summaryValue = el('hte-summary-value');
            const receiveLabel = el('hte-receive-label');
            const receiveValue = el('hte-receive-value');
            const confirmBtn = el('hte-confirm');
            const statusLine = el('hte-status');

            function maxAmount() {
                return mode === 'buy'
                    ? Math.floor($gameParty.gold() / GOLD_PER_TOKEN)
                    : tokenCount();
            }

            function setStatus(text, isError) {
                statusLine.textContent = text;
                statusLine.style.color = isError ? '#8B1A00' : '#555';
            }

            // The whole panel is redrawn from state; only text and styles change,
            // so the OS focus ring never loses the element it was sitting on.
            function render() {
                const max = maxAmount();
                amount = max === 0 ? 0 : Math.max(1, Math.min(amount, max));

                euroBalance.innerHTML = '&euro;' + euros($gameParty.gold());
                tokenBalance.textContent = String(tokenCount());

                const paintTab = (tab, active) => {
                    tab.style.background = active ? 'linear-gradient(180deg,var(--xp-sky-2),var(--xp-navy-7))' : '#ece9d8';
                    tab.style.color = active ? '#ffffff' : '#333333';
                };
                paintTab(buyTab, mode === 'buy');
                paintTab(sellTab, mode === 'sell');

                const goldValue = amount * GOLD_PER_TOKEN;
                amountLabel.textContent = mode === 'buy'
                    ? T('TokenExchange.tokensToBuy') : T('TokenExchange.tokensToSell');
                amountBox.textContent = String(amount);
                limitLine.textContent = mode === 'buy'
                    ? T.n('TokenExchange.affordable', max, { price: TOKEN_PRICE_EURO.toFixed(2) })
                    : T.n('TokenExchange.held', max, { worth: euros(max * GOLD_PER_TOKEN) });

                if (mode === 'buy') {
                    summaryLabel.textContent = T('TokenExchange.youPay');
                    summaryValue.innerHTML = '&euro;' + euros(goldValue);
                    receiveLabel.textContent = T('TokenExchange.youReceive');
                    receiveValue.textContent = T.n('TokenExchange.tokenCount', amount);
                } else {
                    summaryLabel.textContent = T('TokenExchange.youGive');
                    summaryValue.textContent = T.n('TokenExchange.tokenCount', amount);
                    receiveLabel.textContent = T('TokenExchange.youReceive');
                    receiveValue.innerHTML = '&euro;' + euros(goldValue);
                }

                const usable = amount > 0;
                confirmBtn.style.opacity = usable ? '1' : '0.5';
                confirmBtn.style.cursor = usable ? 'pointer' : 'default';
            }

            function adjust(delta) {
                const max = maxAmount();
                if (max === 0) {
                    if (window.SoundManager) SoundManager.playBuzzer();
                    return;
                }
                const next = Math.max(1, Math.min(max, amount + delta));
                if (next === amount) {
                    if (window.SoundManager) SoundManager.playBuzzer();
                    return;
                }
                amount = next;
                if (window.SoundManager) SoundManager.playCursor();
                render();
            }

            function setAmount(value) {
                const max = maxAmount();
                if (max === 0) {
                    if (window.SoundManager) SoundManager.playBuzzer();
                    return;
                }
                amount = Math.max(1, Math.min(max, value));
                if (window.SoundManager) SoundManager.playCursor();
                render();
            }

            function setMode(next) {
                if (mode === next) return;
                mode = next;
                amount = Math.max(1, Math.min(amount, Math.max(1, maxAmount())));
                if (window.SoundManager) SoundManager.playCursor();
                setStatus(mode === 'buy'
                    ? T('TokenExchange.statusBuying')
                    : T('TokenExchange.statusSelling'), false);
                render();
            }

            function confirm() {
                const item = tokenItem();
                const max = maxAmount();
                if (!item || amount <= 0 || amount > max) {
                    if (window.SoundManager) SoundManager.playBuzzer();
                    setStatus(mode === 'buy' ? T('TokenExchange.notEnoughEuros')
                        : T('TokenExchange.notEnoughTokens'), true);
                    return;
                }

                const goldValue = amount * GOLD_PER_TOKEN;
                if (mode === 'buy') {
                    $gameParty.loseGold(goldValue);
                    $gameParty.gainItem(item, amount);
                    setStatus(T.n('TokenExchange.bought', amount, { total: euros(goldValue) }), false);
                } else {
                    $gameParty.loseItem(item, amount);
                    $gameParty.gainGold(goldValue);
                    setStatus(T.n('TokenExchange.sold', amount, { total: euros(goldValue) }), false);
                }

                if (window.SoundManager) SoundManager.playShop();
                amount = Math.min(amount, Math.max(1, maxAmount()));
                render();
            }

            buyTab.addEventListener('click', () => setMode('buy'));
            sellTab.addEventListener('click', () => setMode('sell'));
            el('hte-minus').addEventListener('click', () => adjust(-1));
            el('hte-plus').addEventListener('click', () => adjust(1));
            confirmBtn.addEventListener('click', confirm);

            win.querySelectorAll('[data-quick]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const raw = btn.dataset.quick;
                    setAmount(raw === 'max' ? maxAmount() : Number(raw));
                });
            });

            render();
        }
    };

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: T('TokenExchange.title'),
            icon: 191, // Arcade Token item icon
            desktopShortcut: true,
            launchFn: function() {
                window.HypernetTokenExchange.launch();
            }
        });
    }
})();
