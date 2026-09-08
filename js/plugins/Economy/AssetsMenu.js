/*:
 * @target MZ
 * @plugindesc Assets Pockets v1.0.0 - Parchment portfolio overlay: properties, stocks, bank, loans + live oil/soul graph.
 * @author Esoteric Heavy Industries
 * @help AssetsMenu.js
 *
 * Adds a Scene_AssetsMenu opened from the "Assets" command in the main menu
 * (CustomMainMenuLayout.js). Styled after ItemSystemInventoryUI.js as a
 * double-page parchment book-spread.
 *
 * Left page  : portfolio summary (cash, bank, net worth, debt) + a scrollable
 *              pockets of every owned asset with its current vault value and the
 *              value it was bought for.
 * Right page : a live oil / soul-crystal price graph (mirrors the stock market)
 *              over the detail card of the selected asset.
 *
 * Data sources (all read-only):
 *  - StockMarketSystem.js : $gameSystem.stockMarket (oil/soul shares + history)
 *  - RealEstateMarket.js  : $gameSystem.realEstateData (owned properties)
 *  - ProceduralHouseSystem.js : window.ProceduralHouseSystem.listOwnedHouses()
 *  - BankLoanSystem.js    : $gameSystem.getBankBalance/getLoanBalance/getLoanDueDate
 *
 * Currency convention across the project: 100 gold = 1.00 EUR.
 *
 * Load AFTER StockMarketSystem, RealEstateMarket, ProceduralHouseSystem,
 * BankLoanSystem and CustomMainMenuLayout.
 */

(function () {
  'use strict';

  // Extend RPG Maker's default gold cap (99,999,999). With 100 gold = €1 the
  // vanilla cap tops out at ~€1M, which the CEO start and share fortunes blow
  // straight through. Lift it to €10 billion so large portfolios cash out cleanly.
  const MAX_GOLD = 1000000000000; // 1e12 gold = €10,000,000,000
  const MAX_EXTEND_DAYS = 30;    // nights a stay can be paid on for in one go
  Game_Party.prototype.maxGold = function () { return MAX_GOLD; };

  // 100 gold = 1.00 EUR everywhere in the project.
  function euro(gold) {
    const g = Math.round(Number(gold) || 0);
    const neg = g < 0;
    const abs = Math.abs(g);
    const main = Math.floor(abs / 100);
    const cents = (abs % 100).toString().padStart(2, '0');
    return `${neg ? '-' : ''}€${main.toLocaleString()}.${cents}`;
  }

  function isItalian() {
    return ConfigManager.language === 'it';
  }

  // ===========================================================================
  // Asset gathering
  // ===========================================================================

  // Builds a flat, render-ready list of owned assets. Each entry:
  //   { cat, name, sub, value, bought, color, liability, details:[{label,val}] }
  // value/bought are in gold (cents). liability rows count negatively to net worth.
  function gatherAssets() {
    const it = isItalian();
    const assets = [];

    // --- Stocks ---
    const sm = $gameSystem && $gameSystem.stockMarket;
    if (sm && typeof sm.getOilShares === 'function') {
      const stocks = [
        { key: 'oil', name: 'OIL',
          shares: sm.getOilShares(), price: sm.getOilPrice(),
          bought: sm.getOilCostBasis ? sm.getOilCostBasis() : 0, color: 'var(--text-cost-ok)' },
        { key: 'souls', name: 'SOUL',
          shares: sm.getSoulsShares(), price: sm.getSoulsPrice(),
          bought: sm.getSoulsCostBasis ? sm.getSoulsCostBasis() : 0, color: 'var(--text-text-alt-19)' },
      ];
      stocks.forEach(s => {
        if (s.shares <= 0) return;
        const value = Math.round(s.shares * s.price);
        const hasBasis = s.bought > 0;
        assets.push({
          cat: T('Assets.ui.securities'),
          name: s.name,
          sub: `${s.shares} ${T('Assets.ui.shares')} @ ${euro(s.price)}`,
          value,
          bought: hasBasis ? s.bought : null,
          color: s.color,
          details: [
            { label: T('Assets.ui.shares2'), val: String(s.shares) },
            { label: T('Assets.ui.unitPrice'), val: euro(s.price) },
            { label: T('Assets.ui.vaultValue'), val: euro(value) },
            { label: T('Assets.ui.boughtValue'), val: hasBasis ? euro(s.bought) : (T('Assets.ui.untracked')) },
            ...(hasBasis ? [{ label: T('Assets.ui.profitLoss'),
              val: euro(value - s.bought), pnl: value - s.bought }] : []),
          ],
        });
      });
    }

    // --- Real estate (RealEstateMarket.js owned properties) ---
    const re = $gameSystem && $gameSystem.realEstateData;
    if (re && Array.isArray(re.properties) && Array.isArray(re.ownedProperties)) {
      re.ownedProperties.forEach(pid => {
        const prop = re.properties.find(p => p && p.id === pid);
        if (!prop) return;
        // Apply any active news price effects to derive the current vault value.
        let mult = 1;
        if (window.$newsManager && window.$newsManager.getActiveEffectsForLocation) {
          const effects = window.$newsManager.getActiveEffectsForLocation(prop.location) || [];
          effects.forEach(e => { mult *= (e.priceEffect || 1); });
        }
        const currentEuros = Math.floor(prop.price * mult);
        const value = currentEuros * 100;     // euros -> gold
        const bought = prop.price * 100;
        const rent = (prop.currentOccupants || 0) * (prop.rentPerOccupant || 0);
        assets.push({
          cat: T('Assets.ui.realEstate'),
          name: prop.name,
          sub: `${prop.location} • ${'★'.repeat(prop.stars)}`,
          value,
          bought,
          color: 'var(--text-brown-medium)',
          details: [
            { label: T('Assets.ui.type'), val: prop.type },
            { label: T('Assets.ui.location'), val: prop.location },
            { label: T('Assets.ui.rating'), val: `${'★'.repeat(prop.stars)}${'☆'.repeat(5 - prop.stars)}` },
            { label: T('Assets.ui.vaultValue'), val: euro(value) },
            { label: T('Assets.ui.bookValue'), val: euro(bought) },
            { label: T('Assets.ui.occupancy'), val: `${prop.currentOccupants || 0} / ${prop.maxOccupants}` },
            { label: T('Assets.ui.dailyRent'), val: `€${rent.toLocaleString()}` },
          ],
        });
      });
    }

    // --- Rented properties (RealEstateMarket.js - player is a tenant, not the
    //     owner; no vault value, just a recurring monthly cost that is charged
    //     on the 1st of each in-game month, or the tenancy is repossessed) ---
    if (re && Array.isArray(re.properties) && Array.isArray(re.rentedProperties)) {
      re.rentedProperties.forEach(pid => {
        const prop = re.properties.find(p => p && p.id === pid);
        if (!prop) return;
        // Mirrors RealEstateMarket.js's RENT_MONTHLY_RATE (3% of base price/month).
        const monthlyCost = Math.max(1, Math.round(prop.price * 0.03)) * 100; // gold
        assets.push({
          cat: T('Assets.ui.rentals'),
          name: prop.name,
          sub: `${prop.location} • ${'★'.repeat(prop.stars)} • ${T('Assets.ui.monthlyRent')}`,
          value: monthlyCost,
          bought: null,
          color: 'var(--text-caption-brown)',
          liability: true,
          details: [
            { label: T('Assets.ui.type'), val: prop.type },
            { label: T('Assets.ui.location'), val: prop.location },
            { label: T('Assets.ui.rating'), val: `${'★'.repeat(prop.stars)}${'☆'.repeat(5 - prop.stars)}` },
            { label: T('Assets.ui.monthlyRent2'), val: euro(monthlyCost) },
            { label: T('Assets.ui.status'), val: T('Assets.ui.rentedNotOwnedChargedEvery') },
          ],
        });
      });
    }

    // --- Rented rooms (RentSystem.js: a room taken in an inn is held by the
    //     day, and is listed here with the world square its building stands on
    //     and the tile of its own door, so the stay can be paid on from
    //     anywhere rather than from the doorway) ---
    if (window.RentSystem && typeof window.RentSystem.listRentals === 'function') {
      const stays = window.RentSystem.listRentals() || [];
      stays.forEach(r => {
        const room = r.roomName || T('Assets.ui.room');
        const name = r.placeName ? T('Assets.ui.roomAt', { room: room, place: r.placeName }) : room;
        const entrance = (r.x != null) ? `X:${r.x} Y:${r.y}` : '-';  // i18n-ignore  coordinate pair
        const world = (r.worldX != null) ? `${r.worldX},${r.worldY}` : '-';  // i18n-ignore  coordinate pair
        assets.push({
          cat: T('Assets.ui.stays'),
          name: name,
          sub: `${r.timeLeft} • ${euro(r.price)}/${T('Assets.ui.perDay')}`,
          value: 0,
          bought: null,
          color: 'var(--text-caption-brown)',
          rental: r,
          details: [
            { label: T('Assets.ui.location'), val: r.placeName || '-' },
            { label: T('Assets.ui.worldCoordinates'), val: world },
            { label: T('Assets.ui.entrance'), val: entrance },
            { label: T('Assets.ui.mapId'), val: String(r.mapId) },
            { label: T('Assets.ui.timeLeft'), val: r.timeLeft },
            { label: T('Assets.ui.daysPaid'), val: String(r.days) },
            { label: T('Assets.ui.dailyRate'), val: euro(r.price) },
          ],
        });
      });
    }

    // --- Procedural houses (ProceduralHouseSystem.js owned floors) ---
    if (window.ProceduralHouseSystem && typeof window.ProceduralHouseSystem.listOwnedHouses === 'function') {
      const houses = window.ProceduralHouseSystem.listOwnedHouses() || [];
      houses.forEach(h => {
        const floorTxt = h.floor > 0 ? ` • ${T('Assets.ui.floor')} ${h.floor}` : '';
        assets.push({
          cat: T('Assets.ui.properties'),
          name: `${h.mapName}${floorTxt}`,
          sub: `${T('Assets.ui.entrance')} X:${h.x} Y:${h.y}`,
          value: h.value,
          bought: h.value,
          color: 'var(--text-forest-green)',
          details: [
            { label: T('Assets.ui.entranceMap'), val: h.mapName },
            { label: T('Assets.ui.coordinates'), val: `X: ${h.x}, Y: ${h.y}` },
            { label: T('Assets.ui.floor'), val: String(h.floor) },
            { label: T('Assets.ui.mapId'), val: h.mapId != null ? String(h.mapId) : '-' },
            { label: T('Assets.ui.vaultValue'), val: euro(h.value) },
            { label: T('Assets.ui.boughtValue'), val: euro(h.value) },
          ],
        });
      });
    }

    // --- Companion residences (a recruited NPC's owned/resided procedural
    //     house, inherited on join - see NPCSystemParty.registerNPCHouse) ---
    if ($gameSystem && Array.isArray($gameSystem._npcInheritedHouses)) {
      $gameSystem._npcInheritedHouses.forEach(hh => {
        assets.push({
          cat: T('Assets.ui.residences'),
          name: hh.mapName || (T('Assets.ui.residence')),
          sub: T('Assets.ui.npcHome', { name: hh.npcName }),
          value: hh.value || 0,
          bought: 0,
          color: 'var(--text-forest-green)',
          details: [
            { label: T('Assets.ui.resident'), val: hh.npcName || '-' },
            { label: T('Assets.ui.map'), val: hh.mapName || '-' },
            { label: T('Assets.ui.mapId'), val: hh.mapId != null ? String(hh.mapId) : '-' },
            { label: T('Assets.ui.vaultValue'), val: euro(hh.value || 0) },
            { label: T('Assets.ui.buildRights'), val: T('Assets.ui.owner') },
          ],
        });
      });
    }

    // --- Company shareholdings (RealEstateMarket company exchange) ---
    if (window.AssetRegistry && typeof window.AssetRegistry.getHoldings === 'function') {
      const holdings = window.AssetRegistry.getHoldings() || [];
      holdings.forEach(c => {
        const pnl = c.value - c.costBasis;
        assets.push({
          cat: T('Assets.ui.equities'),
          name: c.name,
          sub: `${c.sharesOwned.toLocaleString()} ${T('Assets.ui.shares')} @ ${euro(c.price * 100)}`,
          value: c.value,
          bought: c.costBasis > 0 ? c.costBasis : null,
          color: c.color || 'var(--text-text-alt-19)',
          details: [
            { label: T('Assets.ui.sector'), val: c.sector || '-' },
            { label: T('Assets.ui.shares2'), val: c.sharesOwned.toLocaleString() },
            { label: T('Assets.ui.ownership'), val: `${c.ownershipPct.toFixed(2)}%` },
            { label: T('Assets.ui.unitPrice'), val: euro(c.price * 100) },
            { label: T('Assets.ui.vaultValue'), val: euro(c.value) },
            { label: T('Assets.ui.boughtValue'), val: c.costBasis > 0 ? euro(c.costBasis) : (T('Assets.ui.untracked')) },
            ...(c.costBasis > 0 ? [{ label: T('Assets.ui.profitLoss'), val: euro(pnl), pnl }] : []),
          ],
        });
      });
    }

    // --- Owned Places (registered Destinations) ---
    if (window.AssetRegistry && typeof window.AssetRegistry.getOwnedPlaces === 'function') {
      const places = window.AssetRegistry.getOwnedPlaces() || [];
      places.forEach(p => {
        const coords = p.base ? `X:${p.base.x} Y:${p.base.y}` : '-';
        // p.key is the Destinations.json key; the readable name of the place
        // lives in that entry's "name" field.
        const placeName = window.WorkSystem?.destinationName
          ? window.WorkSystem.destinationName(p.key) : p.key;
        assets.push({
          cat: T('Assets.ui.places'),
          name: placeName,
          sub: coords,
          value: p.value || 0,
          bought: null,
          color: 'var(--text-teal)',
          details: [
            { label: T('Assets.ui.location'), val: placeName },
            { label: T('Assets.ui.baseCoordinates'), val: coords },
            { label: T('Assets.ui.vaultValue'), val: euro(p.value || 0) },
          ],
        });
      });
    }

    // --- Livestock (AnimalGrowthSystem.js animals bought in the Build menu) ---
    if (window.AnimalGrowthSystem && typeof window.AnimalGrowthSystem.listOwnedAnimals === 'function') {
      const animals = window.AnimalGrowthSystem.listOwnedAnimals() || [];
      animals.forEach(a => {
        const produceRows = a.produces.map(p => ({
          label: p.name,
          val: p.ready
            ? (T('Assets.ui.ready'))
            : `${T('Assets.ui.in')} ${p.daysLeft} ${T('Assets.ui.d')} (×${p.yieldMin}–${p.yieldMax} / ${p.intervalDays}${T('Assets.ui.d')})`,
        }));
        assets.push({
          cat: T('Assets.ui.livestock'),
          name: `${a.animalId} (${a.stageName})`,
          sub: `${a.mapName} • X:${a.x} Y:${a.y}`,
          value: a.value,
          bought: a.paid > 0 ? a.paid : null,
          color: 'var(--text-gold-dark)',
          animal: a,
          details: [
            { label: T('Assets.ui.species'), val: a.animalId },
            { label: T('Assets.ui.stage'), val: a.stageName },
            { label: T('Assets.ui.location'), val: a.mapName },
            { label: T('Assets.ui.coordinates'), val: `X: ${a.x}, Y: ${a.y}` },
            { label: T('Assets.ui.saleValue'), val: euro(a.value) },
            { label: T('Assets.ui.boughtValue'), val: a.paid > 0 ? euro(a.paid) : (T('Assets.ui.untracked')) },
            ...(a.stage === 'baby'
              ? [{ label: T('Assets.ui.growth'), val: `${a.growthPct}% (${T('Assets.ui.adultIn')} ~${a.daysToAdult} ${T('Assets.ui.days')})` }]
              : []),
            ...(produceRows.length ? produceRows : [{ label: T('Assets.ui.produce'), val: T('Assets.ui.none') }]),
          ],
        });
      });
    }

    // --- Diplomatic posts (ONUAssembly.js seats at the assembly) ---
    // A seat is not a thing the party owns, it is a wage a member draws, so it
    // is listed at its yearly value and never counted as a saleable holding.
    if (window.ONUAssembly && typeof window.ONUAssembly.listPosts === 'function') {
      const posts = window.ONUAssembly.listPosts() || [];
      posts.forEach(p => {
        assets.push({
          cat: T('Assets.ui.diplomacy'),
          name: T('Assets.ui.diplomatFor', { faction: p.factionName }),
          sub: `${p.actorName} • ${p.standingLabel}`,
          value: p.weeklyPay * 52,
          bought: null,
          color: 'var(--text-navy)',
          diplomat: p,
          details: [
            { label: T('Assets.ui.delegate'), val: p.actorName },
            { label: T('Assets.ui.delegation'), val: p.factionName },
            ...(p.leader ? [{ label: T('Assets.ui.headOfDelegation'), val: p.leader }] : []),
            ...(p.sg ? [] : [{ label: T('Assets.ui.standing'), val: `${p.standingLabel} (${p.standing})` }]),
            { label: T('Assets.ui.weeklyStipend'), val: euro(p.weeklyPay) },
            { label: T('Assets.ui.annualValue'), val: euro(p.weeklyPay * 52) },
            { label: T('Assets.ui.weeksServed'), val: String(p.weeksServed) },
          ],
        });
      });
    }

    // --- Bank deposit ---
    if ($gameSystem && typeof $gameSystem.getBankBalance === 'function') {
      const bal = $gameSystem.getBankBalance();
      if (bal > 0) {
        assets.push({
          cat: T('Assets.ui.bank'),
          name: T('Assets.ui.bankDeposit'),
          sub: T('Assets.ui.savingsAccount'),
          value: bal,
          bought: bal,
          color: 'var(--text-amber-hint)',
          details: [
            { label: T('Assets.ui.balance'), val: euro(bal) },
          ],
        });
      }
    }

    // --- Loans (liability) ---
    if ($gameSystem && typeof $gameSystem.getLoanBalance === 'function') {
      const loan = $gameSystem.getLoanBalance();
      if (loan > 0) {
        const due = typeof $gameSystem.getLoanDueDate === 'function' ? $gameSystem.getLoanDueDate() : null;
        const curDay = $gameSystem._currentDay || 0;
        const daysLeft = due != null ? Math.max(0, due - curDay) : null;
        assets.push({
          cat: T('Assets.ui.liabilities'),
          name: T('Assets.ui.bankLoan'),
          sub: daysLeft != null ? `${T('Assets.ui.dueIn')} ${daysLeft} ${T('Assets.ui.days')}` : (T('Assets.ui.outstanding')),
          value: loan,
          bought: null,
          color: 'var(--text-cost-bad)',
          liability: true,
          details: [
            { label: T('Assets.ui.balanceOwed'), val: euro(loan) },
            ...(daysLeft != null ? [{ label: T('Assets.ui.daysRemaining'), val: String(daysLeft) }] : []),
          ],
        });
      }
    }

    return assets;
  }

  // ===========================================================================
  // Scene_AssetsMenu
  // ===========================================================================

  class Scene_AssetsMenu extends Scene_MenuBase {
    create() {
      super.create();
      this._selIndex = 0;
      this._btnIndex = -1;   // cursor over the selected asset's action buttons
      this._confirmResign = null; // actorId whose seat is one press from being given up
      this._extendDays = 1;  // nights the selected stay would be paid on for
      this._assets = [];
      this._catFilter = null; // null = every category, otherwise one category name
      this._lastOil = 0;
      this._lastSouls = 0;

      // WASD support (mirrors ItemSystemInventoryUI's robust listener approach).
      this._wasdQueued = { up: false, down: false };
      this._wasdListener = (event) => {
        if (event.repeat) return;
        const k = event.key.toLowerCase();
        if (k === 'w') { this._wasdQueued.up = true; event.preventDefault(); }
        if (k === 's') { this._wasdQueued.down = true; event.preventDefault(); }
      };
      window.addEventListener('keydown', this._wasdListener);

      this.createDOM();
    }

    createDOM() {
      this._container = document.createElement('div');
      this._container.id = 'menu-container';
      this._container.className = 'assets-fade';
      document.body.appendChild(this._container);

      // Right-click anywhere exits, like the other parchment overlays.
      this._rightClickStartedHere = false;
      this._container.addEventListener('mousedown', (e) => {
        if (e.button === 2) { this._rightClickStartedHere = true; e.stopPropagation(); }
      });
      this._container.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!this._rightClickStartedHere) return;
        this._rightClickStartedHere = false;
        SoundManager.playCancel();
        this.popScene();
      });

      this.refreshDOM();
      setTimeout(() => { if (this._container) this._container.classList.add('assets-fade-in'); }, 16);
    }

    refreshDOM() {
      if (!this._container) return;
      const it = isItalian();
      this._allAssets = gatherAssets();
      this._assets = this.filterAssets(this._allAssets);
      if (this._selIndex >= this._assets.length) this._selIndex = Math.max(0, this._assets.length - 1);
      this._btnIndex = -1;   // the rebuilt detail card starts with no button focused

      const sm = $gameSystem && $gameSystem.stockMarket;
      if (sm) { this._lastOil = sm.getOilPrice(); this._lastSouls = sm.getSoulsPrice(); }

      // Portfolio totals.
      const cash = $gameParty ? $gameParty.gold() : 0;
      let totalAssets = cash;
      let totalLiabilities = 0;
      this._allAssets.forEach(a => {
        if (a.liability) totalLiabilities += a.value; else totalAssets += a.value;
      });
      const netWorth = totalAssets - totalLiabilities;

      // ---- Left page: summary + pockets list ----
      // Facts, not plates: the four totals read as a label over its answer on
      // the page itself, the shape every other detail card in the game uses.
      const summaryCard = (lbl, val, tone) => `
        <div class="ui-fact">
          <span class="ui-fact-lbl">${lbl}</span>
          <span class="ui-fact-val assets-sum-val${tone}">${val}</span>
        </div>`;

      const summaryHTML = `
        <div class="ui-fact-grid assets-summary">
          ${summaryCard(T('Assets.ui.cash'), euro(cash), '')}
          ${summaryCard(T('Assets.ui.assets'), euro(totalAssets), ' assets-val--gain')}
          ${summaryCard(T('Assets.ui.debt'), euro(totalLiabilities), ' assets-val--loss')}
          ${summaryCard(T('Assets.ui.netWorth'), euro(netWorth), netWorth >= 0 ? ' assets-val--gain' : ' assets-val--loss')}
        </div>`;

      const tabsHTML = this.buildTabsHTML();

      let listHTML = '';
      if (this._assets.length === 0) {
        listHTML = `<div class="ui-empty"><div class="ui-empty-text">${T('Assets.ui.noAssetsOwnedYetAcquire')}</div></div>`;
      } else {
        let lastCat = null;
        this._assets.forEach((a, idx) => {
          if (a.cat !== lastCat) {
            lastCat = a.cat;
            listHTML += `<div class="assets-cat-header">${a.cat}</div>`;
          }
          const sel = idx === this._selIndex ? 'selected' : '';
          const valTone = a.liability ? 'assets-val--loss' : 'assets-val--gain';
          const sign = a.liability ? '-' : '';
          listHTML += `
            <div class="item-slot assets-row focusable ${sel}" data-tint="${a.color}" tabindex="0" onclick="SceneManager._scene.selectAsset(${idx})">
              <div class="assets-row-bar"></div>
              <div class="assets-row-info">
                <div class="assets-row-name">${a.name}</div>
                <div class="assets-row-sub">${a.sub}</div>
              </div>
              <div class="assets-row-vals">
                <span class="assets-row-val ${valTone}">${sign}${euro(a.value)}</span>
                ${a.bought != null ? `<span class="assets-row-bought">${T('Assets.ui.paid')} ${euro(a.bought)}</span>` : ''}
              </div>
            </div>`;
        });
      }

      const leftPageHTML = `
        <div class="left-page">
          <div class="page-header-bar">
            <div class="back-button" onclick="SceneManager._scene.popScene()">${T('Assets.ui.back')}</div>
            <h2 class="title">${T('Assets.ui.assets')}</h2>
          </div>
          ${tabsHTML}
          ${summaryHTML}
          <div class="ui-list ui-scroll assets-list" id="assets-list">${listHTML}</div>
        </div>`;

      // ---- Right page: live graph + selected detail ----
      const rightPageHTML = `
        <div class="right-page">
          <div class="assets-graph-box">
            <div class="inspect-section-title assets-graph-title">${T('Assets.ui.stockMarket')}</div>
            <canvas id="assets-graph" width="560" height="200"></canvas>
            <div class="assets-graph-legend">
              <div class="ui-chip assets-legend-item assets-legend--oil">OIL</div>
              <div class="ui-chip assets-legend-item assets-legend--soul">SOUL</div>
            </div>
          </div>
          <div class="ui-detail assets-detail" id="assets-detail">${this.buildDetailHTML()}</div>
        </div>`;

      this._container.innerHTML = `<div class="book-spread">${leftPageHTML}${rightPageHTML}</div>`;

      this.applyRowTints();
      this.paintGraph();
      this.paintAnimalSprite();
      this.scrollToSelected();
    }

    // The category strip: one tab per category actually held, plus "All".
    // L1 / R1 walk it, as they do on every tabbed page in the game.
    assetCategories() {
      const seen = [];
      (this._allAssets || []).forEach(a => { if (seen.indexOf(a.cat) < 0) seen.push(a.cat); });
      return seen;
    }

    filterAssets(list) {
      if (!this._catFilter) return list.slice();
      return list.filter(a => a.cat === this._catFilter);
    }

    buildTabsHTML() {
      const cats = this.assetCategories();
      if (cats.length < 2) return '';
      const tab = (label, key, on) =>
        `<div class="backpack-tab focusable${on ? ' selected' : ''}" tabindex="0"` +
        ` onclick="SceneManager._scene.setCategoryFilter(${key})">${label}</div>`;
      const html = [tab(T('Assets.ui.allCategories'), 'null', !this._catFilter)]
        .concat(cats.map(c => tab(c, JSON.stringify(c), this._catFilter === c)));
      return `<div class="backpack-tabs">${html.join('')}</div>`;
    }

    setCategoryFilter(cat) {
      if (this._catFilter === cat) return;
      this._catFilter = cat;
      this._selIndex = 0;
      SoundManager.playCursor();
      this.refreshDOM();
    }

    stepCategory(delta) {
      const cats = this.assetCategories();
      if (cats.length < 2) return false;
      const all = [null].concat(cats);
      const at = all.indexOf(this._catFilter);
      const next = all[((at < 0 ? 0 : at) + delta + all.length) % all.length];
      this.setCategoryFilter(next);
      return true;
    }

    // A row's kind stripe is data, so it is handed to the stylesheet as a
    // custom property rather than painted into the markup.
    applyRowTints() {
      if (!this._container) return;
      this._container.querySelectorAll('.assets-row[data-tint]').forEach(el => {
        el.style.setProperty('--assets-tint', el.dataset.tint || 'var(--text-text-alt-4)');
      });
    }

    buildDetailHTML() {
      const it = isItalian();
      const a = this._assets[this._selIndex];
      if (!a) {
        return `<div class="ui-empty"><div class="ui-empty-text">${T('Assets.ui.selectAnAssetFromThe')}</div></div>`;
      }
      const rows = a.details.map(d => {
        let tone = '';
        if (d.pnl !== undefined) tone = d.pnl >= 0 ? ' assets-val--gain' : ' assets-val--loss';
        return `<div class="inspect-spec-row">
          <span class="inspect-spec-label">${d.label}:</span>
          <span class="inspect-spec-value${tone}">${d.val}</span>
        </div>`;
      }).join('');
      return `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <h3 class="assets-detail-name">${a.name}</h3>
            <div class="assets-detail-cat">${a.cat}</div>
          </div>
        </div>
        <div class="ui-detail-scroll ui-scroll">
          ${a.animal ? this.buildAnimalPortraitHTML(a.animal) : ''}
          <div class="inspect-section-title">${T('Assets.ui.pocketsDetail')}</div>
          <div class="inspect-spec-grid">${rows}</div>
        </div>
        ${this.buildAssetActionsHTML(a)}`;
    }

    // Livestock gets its sprite drawn above the spec rows.
    buildAnimalPortraitHTML(animal) {
      return `<canvas class="ag-sprite-canvas" id="assets-animal-sprite"
        data-sprite="${animal.sprite}" data-stage="${animal.stage}"
        width="128" height="104"></canvas>`;
    }

    // Two asset classes can be acted on from here: livestock (collect what it
    // has made, sell it back, or take it out of the portfolio for good by
    // making it a pet) and a diplomatic seat (resign it). The buttons the
    // selected asset offers are declared once, in the order drawn: the markup,
    // the keyboard cursor and the pad confirm all read this one list.
    assetButtons(asset) {
      if (!asset) return [];
      if (asset.animal) {
        const animal = asset.animal;
        return [
          { key: 'collect', cls: '', label: T('Assets.ui.collect'), enabled: animal.hasReady },
          { key: 'sell', cls: ' assets-action--sell', label: `${T('Assets.ui.sell')} ${euro(animal.value)}`, enabled: true },
          { key: 'pet', cls: ' assets-action--pet', label: T('Assets.ui.makePet'), enabled: true },
        ];
      }
      if (asset.rental) {
        const rs = window.RentSystem;
        const days = this._extendDays;
        const cost = rs && typeof rs.extensionCost === 'function'
          ? rs.extensionCost(asset.rental.key, days) : asset.rental.price * days;
        const gold = $gameParty ? $gameParty.gold() : 0;
        return [
          { key: 'days-', cls: '', label: T('Assets.ui.fewerDays'), enabled: days > 1 },
          { key: 'days+', cls: '', label: T('Assets.ui.moreDays'), enabled: days < MAX_EXTEND_DAYS },
          {
            key: 'extend',
            cls: '',
            label: T('Assets.ui.extendStay', { days: days, cost: euro(cost) }),
            enabled: gold >= cost,
          },
        ];
      }
      if (asset.diplomat) {
        // Resigning is destructive and costly, so it asks once first.
        const armed = this._confirmResign === asset.diplomat.actorId;
        return [
          {
            key: 'resign',
            cls: ' assets-action--sell',
            label: armed ? T('Assets.ui.resignConfirm') : T('Assets.ui.resignPost'),
            enabled: true,
          },
        ];
      }
      return [];
    }

    buildAssetActionsHTML(asset) {
      const btns = this.assetButtons(asset);
      if (!btns.length) return '';
      const html = btns.map((b, i) => {
        const focus = i === this._btnIndex ? ' selected' : '';
        const dis = b.enabled ? '' : ' inspect-btn--disabled';
        const click = b.enabled
          ? ` onclick="SceneManager._scene.runAssetAction('${b.key}')"` : '';
        return `<div class="inspect-btn assets-action focusable${b.cls}${focus}${dis}" tabindex="0" data-btn="${i}"${click}>${b.label}</div>`;
      }).join('');
      return `<div class="inspect-actions assets-actions-row">${html}</div>`;
    }

    // Moves the button cursor over the enabled buttons of the selected asset.
    moveAssetButton(delta) {
      const a = this._assets[this._selIndex];
      const btns = this.assetButtons(a);
      const enabled = btns.map((b, i) => (b.enabled ? i : -1)).filter(i => i >= 0);
      if (enabled.length === 0) return false;
      const at = enabled.indexOf(this._btnIndex);
      const next = at < 0
        ? enabled[delta > 0 ? 0 : enabled.length - 1]
        : enabled[(at + delta + enabled.length) % enabled.length];
      this._btnIndex = next;
      SoundManager.playCursor();
      this.refreshAssetButtons();
      return true;
    }

    refreshAssetButtons() {
      if (!this._container) return;
      this._container.querySelectorAll('.assets-action').forEach(el => {
        el.classList.toggle('selected', Number(el.dataset.btn) === this._btnIndex);
      });
    }

    // Fires whichever button the cursor is on (pad / keyboard confirm).
    triggerAssetButton() {
      const a = this._assets[this._selIndex];
      const btn = this.assetButtons(a)[this._btnIndex];
      if (!btn || !btn.enabled) return false;
      this.runAssetAction(btn.key);
      return true;
    }

    runAssetAction(key) {
      const a = this._assets[this._selIndex];
      if (!a) return;
      if (a.animal) {
        const uid = a.animal.uid;
        if (key === 'collect') this.collectAnimal(uid);
        else if (key === 'sell') this.sellAnimal(uid);
        else if (key === 'pet') this.makeAnimalPet(uid);
        return;
      }
      if (a.rental) {
        if (key === 'days-') this.changeExtendDays(-1);
        else if (key === 'days+') this.changeExtendDays(1);
        else if (key === 'extend') this.extendStay(a.rental);
        return;
      }
      if (a.diplomat && key === 'resign') this.resignPost(a.diplomat);
    }

    // ---- Rented rooms ----

    // The stepper over the nights to pay for. Redrawn through the whole card,
    // since the price on the extend button moves with it.
    changeExtendDays(delta) {
      const next = Math.min(MAX_EXTEND_DAYS, Math.max(1, this._extendDays + delta));
      if (next === this._extendDays) { SoundManager.playBuzzer(); return; }
      this._extendDays = next;
      SoundManager.playCursor();
      const held = this._btnIndex;
      this.refreshDOM();
      this._btnIndex = held;
      this.refreshAssetButtons();
    }

    extendStay(rental) {
      const rs = window.RentSystem;
      const result = rs && typeof rs.extendRental === 'function'
        ? rs.extendRental(rental.key, this._extendDays) : null;
      if (!result) {
        SoundManager.playBuzzer();
        this.notify(T('Assets.ui.stayNotAfforded'));
        return;
      }
      SoundManager.playShop();
      this.notify(T('Assets.ui.stayExtended', { days: result.days, time: result.timeLeft }));
      this._extendDays = 1;
      this.refreshDOM();
    }

    // Giving up a seat costs a great deal of standing, so the first press only
    // arms the button and the second one goes through with it.
    resignPost(post) {
      if (this._confirmResign !== post.actorId) {
        this._confirmResign = post.actorId;
        SoundManager.playCursor();
        const held = this._btnIndex;
        this.refreshDOM();
        this._btnIndex = held;
        this.refreshAssetButtons();
        return;
      }
      this._confirmResign = null;
      if (window.ONUAssembly && window.ONUAssembly.resign(post.actorId)) {
        SoundManager.playOk();
      } else {
        SoundManager.playBuzzer();
      }
      this._btnIndex = -1;
      this.refreshDOM();
    }

    // Draws the sprite of the selected animal, if the detail card shows one.
    paintAnimalSprite() {
      const cv = this._container && this._container.querySelector('#assets-animal-sprite');
      if (!cv || !window.AnimalGrowthSystem) return;
      window.AnimalGrowthSystem.drawSpriteOnCanvas(cv, cv.dataset.sprite, cv.dataset.stage);
    }

    // ---- Livestock actions ----

    animalAt(uid) {
      return this._assets.find(a => a.animal && a.animal.uid === uid);
    }

    collectAnimal(uid) {
      const ags = window.AnimalGrowthSystem;
      if (!ags) return;
      const items = ags.collectFromPlacement(uid) || [];
      if (items.length === 0) { SoundManager.playBuzzer(); return; }
      SoundManager.playShop();
      const it = isItalian();
      const names = items.map(r => {
        const item = $dataItems[r.itemId];
        return `${item ? item.name : `#${r.itemId}`} ×${r.qty}`;
      }).join(', ');
      this.notify(`${T('Assets.ui.collected')}: ${names}`);
      this.refreshDOM();
    }

    sellAnimal(uid) {
      const ags = window.AnimalGrowthSystem;
      if (!ags) return;
      const sold = ags.sellPlacement(uid);
      if (!sold) { SoundManager.playBuzzer(); return; }
      SoundManager.playShop();
      const it = isItalian();
      this.notify(`${T('Assets.ui.sold')} ${sold.animalId} - ${euro(sold.value)}`);
      this.refreshDOM();
    }

    makeAnimalPet(uid) {
      const ags = window.AnimalGrowthSystem;
      if (!ags) return;
      const entry = this.animalAt(uid);
      const pet = ags.petPlacement(uid);
      if (!pet) { SoundManager.playBuzzer(); return; }
      SoundManager.playOk();
      const it = isItalian();
      const name = entry ? entry.animal.animalId : pet.name;
      this.notify(T('Assets.ui.nowAPet', { name: name }));
      this.refreshDOM();
    }

    notify(text) {
      if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
        window.ParchmentToast.show(text, { severity: 'info', duration: 180 });
      }
    }

    // The graph is drawn on a canvas, which cannot read a class. It reads the
    // theme's own tokens instead, so no ink on this page is a literal.
    token(name, fallback) {
      if (!this._container) return fallback;
      const v = getComputedStyle(this._container).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    }

    // Repaints the oil/soul trend graph from the shared stock-market history.
    paintGraph() {
      const canvas = this._container && this._container.querySelector('#assets-graph');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const sm = $gameSystem && $gameSystem.stockMarket;
      if (!sm || typeof sm.getOilHistory !== 'function') return;
      const oil = sm.getOilHistory() || [];
      const souls = sm.getSoulsHistory() || [];
      const all = [...oil, ...souls];
      if (all.length < 2) return;

      const min = Math.min(...all) * 0.92;
      const max = Math.max(...all) * 1.08;
      const padL = 56, padR = 14, padT = 14, padB = 16;

      ctx.strokeStyle = this.token('--border-primary-hover-translucent-15', 'transparent');
      ctx.lineWidth = 1;
      ctx.font = '9px Tahoma';
      ctx.fillStyle = this.token('--text-text-alt-4', 'currentColor');
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const gy = padT + (h - padT - padB) * (i / 4);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
        const v = max - (max - min) * (i / 4);
        ctx.fillText(euro(Math.round(v)), padL - 6, gy + 3);
      }

      const trend = (hist, color) => {
        if (!hist || hist.length < 2) return;
        const plotW = w - padL - padR, plotH = h - padT - padB;
        ctx.beginPath();
        hist.forEach((p, i) => {
          const px = padL + i * (plotW / (hist.length - 1));
          const py = padT + plotH - (((p - min) / (max - min)) * plotH || 0);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      };
      trend(oil, this.token('--text-cost-ok', 'currentColor'));
      trend(souls, this.token('--text-text-alt-19', 'currentColor'));
    }

    scrollToSelected() {
      const list = this._container && this._container.querySelector('#assets-list');
      if (!list) return;
      const sel = list.querySelector('.assets-row.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    selectAsset(idx) {
      if (idx < 0 || idx >= this._assets.length) return;
      SoundManager.playCursor();
      this._selIndex = idx;
      this._btnIndex = -1;   // a new asset starts with no button focused
      // Moving off an armed resign disarms it: the warning belongs to the row
      // it was raised on, not to the menu.
      this._confirmResign = null;
      // Only the detail panel needs to change on selection.
      const detail = this._container && this._container.querySelector('#assets-detail');
      if (detail) { detail.innerHTML = this.buildDetailHTML(); this.paintAnimalSprite(); }
      const list = this._container && this._container.querySelector('#assets-list');
      if (list) {
        list.querySelectorAll('.assets-row').forEach((el, i) => {
          el.classList.toggle('selected', i === this._selIndex);
        });
      }
      this.scrollToSelected();
    }

    moveSelection(delta) {
      if (this._assets.length === 0) return;
      const next = (this._selIndex + delta + this._assets.length) % this._assets.length;
      this.selectAsset(next);
    }

    update() {
      super.update();
      if (!this._container) return;

      // Keyboard / gamepad navigation.
      let handled = false;
      if (Input.isRepeated('down') || this._wasdQueued.down) { this.moveSelection(1); handled = true; }
      else if (Input.isRepeated('up') || this._wasdQueued.up) { this.moveSelection(-1); handled = true; }
      this._wasdQueued.up = this._wasdQueued.down = false;

      // Livestock and diplomatic seats carry actions: left/right walks the
      // selected asset's buttons and confirm fires the focused one.
      if (!handled && Input.isRepeated('right')) { handled = this.moveAssetButton(1); }
      else if (!handled && Input.isRepeated('left')) { handled = this.moveAssetButton(-1); }
      if (!handled && Input.isTriggered('pagedown')) { handled = this.stepCategory(1); }
      else if (!handled && Input.isTriggered('pageup')) { handled = this.stepCategory(-1); }
      if (!handled && Input.isTriggered('ok')) { handled = this.triggerAssetButton(); }

      if (!handled && (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled())) {
        SoundManager.playCancel();
        this.popScene();
        return;
      }

      // Live refresh: when the shared market ticks, repaint the graph and the
      // value columns in place without rebuilding the whole spread.
      const sm = $gameSystem && $gameSystem.stockMarket;
      if (sm && (sm.getOilPrice() !== this._lastOil || sm.getSoulsPrice() !== this._lastSouls)) {
        this.liveUpdate();
      }
    }

    // Refreshes prices/values in place: summary totals, pockets value columns,
    // detail panel and the trend graph. Falls back to a full rebuild only if the
    // asset set itself changed (e.g. a position was opened/closed while open).
    liveUpdate() {
      if (!this._container) return;
      this._allAssets = gatherAssets();
      this._assets = this.filterAssets(this._allAssets);
      const sm = $gameSystem && $gameSystem.stockMarket;
      if (sm) { this._lastOil = sm.getOilPrice(); this._lastSouls = sm.getSoulsPrice(); }

      const rows = this._container.querySelectorAll('.assets-row');
      if (rows.length !== this._assets.length) { this.refreshDOM(); return; }

      // Summary totals.
      const cash = $gameParty ? $gameParty.gold() : 0;
      let totalAssets = cash, totalLiabilities = 0;
      this._allAssets.forEach(a => {
        if (a.liability) totalLiabilities += a.value; else totalAssets += a.value;
      });
      const netWorth = totalAssets - totalLiabilities;
      const sumVals = this._container.querySelectorAll('.assets-sum-val');
      if (sumVals.length === 4) {
        sumVals[0].textContent = euro(cash);
        sumVals[1].textContent = euro(totalAssets);
        sumVals[2].textContent = euro(totalLiabilities);
        sumVals[3].textContent = euro(netWorth);
        sumVals[3].classList.toggle('assets-val--gain', netWorth >= 0);
        sumVals[3].classList.toggle('assets-val--loss', netWorth < 0);
      }

      // Pockets value columns.
      rows.forEach((row, i) => {
        const a = this._assets[i];
        if (!a) return;
        const valEl = row.querySelector('.assets-row-val');
        if (valEl) valEl.textContent = `${a.liability ? '-' : ''}${euro(a.value)}`;
      });

      // Detail card (selected asset values may have changed).
      const detail = this._container.querySelector('#assets-detail');
      if (detail) { detail.innerHTML = this.buildDetailHTML(); this.paintAnimalSprite(); }

      this.paintGraph();
    }

    terminate() {
      if (this._wasdListener) {
        window.removeEventListener('keydown', this._wasdListener);
        this._wasdListener = null;
      }
      if (this._container) {
        const c = this._container;
        c.classList.remove('assets-fade-in');
        c.classList.add('assets-fade-out');
        setTimeout(() => { if (c && c.parentNode) c.parentNode.removeChild(c); }, 200);
        this._container = null;
      }
      super.terminate();
    }
  }

  window.Scene_AssetsMenu = Scene_AssetsMenu;

})();
