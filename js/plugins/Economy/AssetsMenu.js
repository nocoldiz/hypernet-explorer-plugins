/*:
 * @target MZ
 * @plugindesc Assets & Deeds v2.0.0 - Parchment portfolio overlay: towns, shops, properties, stocks, bank, loans, livestock.
 * @author Esoteric Heavy Industries
 * @help AssetsMenu.js
 *
 * Unified Deeds & Assets portfolio opened from the "Assets" command in the
 * main menu (CustomMainMenuLayout.js). Styled after ItemSystemInventoryUI.js as a
 * double-page parchment book-spread.
 *
 * Left page  : portfolio ledger summary (cash, vault assets, daily income, debt, net worth),
 *              category filter tabs, quick rent collection banner, and scrollable asset rows.
 * Right page : contextual deed and instrument inspector:
 *              - Stocks & equities: live price trend graph and position specs
 *              - Founded towns: Town Charter, population, house/shop counts, and rent collection
 *              - Commercial shops: Business Deed, register balance, and direct shop book launcher
 *              - Real estate & houses: Property Deed, occupancy, daily rent, and valuation
 *              - Livestock: species sprite, growth stage, produce status, collect/sell/pet actions
 *              - Stays & tenancies: days stepper and stay extension
 *              - Assembly diplomacy: delegation credentials and resignation
 *              - Banking & loans: deposit balance, liabilities, and repayment schedule
 *
 * Data sources (all read-only, actions mediated by their respective systems):
 *  - FurnitureSystem.js   : window.TownFounding (founded towns, rent collection)
 *  - ShopManagement.js    : window.ShopManagement (owned shops, shop books)
 *  - StockMarketSystem.js : $gameSystem.stockMarket (oil/soul shares + history)
 *  - RealEstateMarket.js  : $gameSystem.realEstateData (owned/rented properties)
 *  - ProceduralHouseSystem.js : window.ProceduralHouseSystem.listOwnedHouses()
 *  - AnimalGrowthSystem.js: window.AnimalGrowthSystem (livestock)
 *  - BankLoanSystem.js    : $gameSystem.getBankBalance/getLoanBalance/getLoanDueDate
 *  - ONUAssembly.js       : window.ONUAssembly (diplomatic posts)
 *  - RentSystem.js        : window.RentSystem (inn stays)
 *
 * Currency convention across the project: 100 gold = 1.00 EUR.
 */

(function () {
  'use strict';

  // Extend RPG Maker's default gold cap (99,999,999). With 100 gold = 1 EUR the
  // vanilla cap tops out at ~1M EUR, which large share fortunes and town networks
  // easily exceed. Lift it to 10 billion EUR so large portfolios cash out cleanly.
  const MAX_GOLD = 1000000000000; // 1e12 gold = 10,000,000,000 EUR
  const MAX_EXTEND_DAYS = 30;     // nights a stay can be paid on for in one go

  if (typeof Game_Party !== 'undefined' && Game_Party.prototype) {
    Game_Party.prototype.maxGold = function () { return MAX_GOLD; };
  }

  // 100 gold = 1.00 EUR everywhere in the project.
  function euro(gold) {
    const g = Math.round(Number(gold) || 0);
    const neg = g < 0;
    const abs = Math.abs(g);
    const main = Math.floor(abs / 100);
    const cents = (abs % 100).toString().padStart(2, '0');
    return `${neg ? '-' : ''}€${main.toLocaleString()}.${cents}`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
    ));
  }

  const T = (key, args) => (typeof window.T === 'function' ? window.T(key, args) : key);

  function isItalian() {
    return typeof ConfigManager !== 'undefined' && ConfigManager.language === 'it';
  }

  // ===========================================================================
  // Asset & Deed Gathering
  // ===========================================================================

  // Builds a flat, render-ready list of every holding:
  //   { cat, kind, name, sub, value, bought, color, liability, details:[{label,val,pnl}], ... }
  // value/bought are in gold cents. liability rows count negatively to net worth.
  function gatherAssets() {
    const assets = [];

    // --- 1. Founded Towns (window.TownFounding) ---
    if (window.TownFounding && typeof window.TownFounding.list === 'function') {
      const TF = window.TownFounding;
      const towns = TF.list() || [];
      towns.forEach(town => {
        if (!town) return;
        const residents = typeof TF.residents === 'function' ? TF.residents(town) : (town.residents || 0);
        const capacity = typeof TF.capacity === 'function' ? TF.capacity(town) : (town.capacity || 0);
        const rentPerDay = typeof TF.rentPerDay === 'function' ? TF.rentPerDay(town) : 0;
        const rentDue = typeof TF.rentDue === 'function' ? TF.rentDue(town) : 0;
        const where = T('Towns.deeds.square', { x: town.worldX, y: town.worldY }) +
          (town.planet ? ' ' + T('Towns.deeds.onPlanet', { planet: town.planet }) : '');
        const sub = `${where} • ${residents}/${capacity} ${T('Towns.deeds.colResidents')}`;
        const val = town.houseValue || (rentPerDay * 30);
        assets.push({
          cat: T('Towns.deeds.sectionTowns'),
          kind: 'town',
          name: town.name,
          sub,
          where,
          value: val,
          bought: val,
          rentPerDay,
          rentDue,
          residents,
          capacity,
          town,
          color: 'var(--text-amber-hint)',
          details: [
            { label: T('Towns.deeds.colWhere'), val: where },
            { label: T('Towns.deeds.colHouses'), val: String(town.houses || 0) },
            { label: T('Towns.deeds.colShops'), val: String(town.shops || 0) },
            { label: T('Towns.deeds.colResidents'), val: `${residents} / ${capacity}` },
            { label: T('Assets.ui.status'), val: residents >= capacity ? T('Towns.deeds.full') : T('Towns.deeds.growing') },
            { label: T('Assets.ui.dailyRent'), val: euro(rentPerDay) },
            ...(rentDue > 0 ? [{ label: T('Assets.ui.rentDue'), val: euro(rentDue), pnl: rentDue }] : []),
          ],
        });
      });
    }

    // --- 2. Commercial Shops (window.ShopManagement) ---
    if (window.ShopManagement && typeof window.ShopManagement.getShops === 'function') {
      const SM = window.ShopManagement;
      const shops = SM.getShops() || {};
      Object.keys(shops).forEach(id => {
        const shop = shops[id];
        if (!shop) return;
        const shopName = SM.shopDisplayName ? SM.shopDisplayName(shop) : (shop.name || id);
        const place = shop.location ? `${shop.location} • ` : '';
        const sub = `${place}${shop.category || T('Towns.deeds.colCategory')}`;
        const balance = shop.balance || 0;
        assets.push({
          cat: T('Towns.deeds.sectionShops'),
          kind: 'shop',
          name: shopName,
          sub,
          value: balance,
          bought: null,
          shop,
          color: 'var(--text-teal)',
          details: [
            ...(shop.location ? [{ label: T('Assets.ui.location'), val: shop.location }] : []),
            { label: T('Towns.deeds.colCategory'), val: shop.category || '-' },
            { label: T('Towns.deeds.colBalance'), val: euro(balance) },
            { label: T('Assets.ui.status'), val: T('Towns.deeds.manageShop') },
          ],
        });
      });
    }

    // --- 3. Real Estate (RealEstateMarket.js owned properties) ---
    const re = typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem.realEstateData;
    if (re && Array.isArray(re.properties) && Array.isArray(re.ownedProperties)) {
      re.ownedProperties.forEach(pid => {
        const prop = re.properties.find(p => p && p.id === pid);
        if (!prop) return;
        let mult = 1;
        if (window.$newsManager && window.$newsManager.getActiveEffectsForLocation) {
          const effects = window.$newsManager.getActiveEffectsForLocation(prop.location) || [];
          effects.forEach(e => { mult *= (e.priceEffect || 1); });
        }
        const currentEuros = Math.floor(prop.price * mult);
        const value = currentEuros * 100;
        const bought = prop.price * 100;
        const rentPerDay = (prop.currentOccupants || 0) * (prop.rentPerOccupant || 0) * 100;
        assets.push({
          cat: T('Towns.deeds.sectionHouses'),
          kind: 'realEstate',
          name: prop.name,
          sub: `${prop.location} • ${'★'.repeat(prop.stars)}`,
          value,
          bought,
          rentPerDay,
          color: 'var(--text-brown-medium)',
          details: [
            { label: T('Assets.ui.type'), val: prop.type },
            { label: T('Assets.ui.location'), val: prop.location },
            { label: T('Assets.ui.rating'), val: `${'★'.repeat(prop.stars)}${'☆'.repeat(5 - prop.stars)}` },
            { label: T('Assets.ui.vaultValue'), val: euro(value) },
            { label: T('Assets.ui.bookValue'), val: euro(bought) },
            { label: T('Assets.ui.occupancy'), val: `${prop.currentOccupants || 0} / ${prop.maxOccupants}` },
            { label: T('Assets.ui.dailyRent'), val: euro(rentPerDay) },
          ],
        });
      });
    }

    // --- 4. Procedural Houses (ProceduralHouseSystem.js owned floors) ---
    if (window.ProceduralHouseSystem && typeof window.ProceduralHouseSystem.listOwnedHouses === 'function') {
      const houses = window.ProceduralHouseSystem.listOwnedHouses() || [];
      houses.forEach(h => {
        const floorTxt = h.floor > 0 ? ` • ${T('Assets.ui.floor')} ${h.floor}` : '';
        assets.push({
          cat: T('Towns.deeds.sectionHouses'),
          kind: 'proceduralHouse',
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

    // --- 5. Companion Residences (inherited NPC procedural houses) ---
    if (typeof $gameSystem !== 'undefined' && $gameSystem && Array.isArray($gameSystem._npcInheritedHouses)) {
      $gameSystem._npcInheritedHouses.forEach(hh => {
        assets.push({
          cat: T('Towns.deeds.sectionHouses'),
          kind: 'residence',
          name: hh.mapName || T('Assets.ui.residence'),
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

    // --- 6. Livestock (AnimalGrowthSystem.js animals) ---
    if (window.AnimalGrowthSystem && typeof window.AnimalGrowthSystem.listOwnedAnimals === 'function') {
      const animals = window.AnimalGrowthSystem.listOwnedAnimals() || [];
      animals.forEach(a => {
        const produceRows = (a.produces || []).map(p => ({
          label: p.name,
          val: p.ready
            ? T('Assets.ui.ready')
            : `${T('Assets.ui.in')} ${p.daysLeft} ${T('Assets.ui.d')} (×${p.yieldMin}–${p.yieldMax} / ${p.intervalDays}${T('Assets.ui.d')})`,
        }));
        assets.push({
          cat: T('Towns.deeds.sectionAnimals'),
          kind: 'animal',
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
            { label: T('Assets.ui.boughtValue'), val: a.paid > 0 ? euro(a.paid) : T('Assets.ui.untracked') },
            ...(a.stage === 'baby'
              ? [{ label: T('Assets.ui.growth'), val: `${a.growthPct}% (${T('Assets.ui.adultIn')} ~${a.daysToAdult} ${T('Assets.ui.days')})` }]
              : []),
            ...(produceRows.length ? produceRows : [{ label: T('Assets.ui.produce'), val: T('Assets.ui.none') }]),
          ],
        });
      });
    }

    // --- 7. Stocks (StockMarketSystem.js) ---
    const sm = typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem.stockMarket;
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
          kind: 'stock',
          name: s.name,
          sub: `${s.shares} ${T('Assets.ui.shares')} @ ${euro(s.price)}`,
          value,
          bought: hasBasis ? s.bought : null,
          color: s.color,
          details: [
            { label: T('Assets.ui.shares2'), val: String(s.shares) },
            { label: T('Assets.ui.unitPrice'), val: euro(s.price) },
            { label: T('Assets.ui.vaultValue'), val: euro(value) },
            { label: T('Assets.ui.boughtValue'), val: hasBasis ? euro(s.bought) : T('Assets.ui.untracked') },
            ...(hasBasis ? [{ label: T('Assets.ui.profitLoss'), val: euro(value - s.bought), pnl: value - s.bought }] : []),
          ],
        });
      });
    }

    // --- 8. Company Equities (RealEstateMarket company exchange) ---
    if (window.AssetRegistry && typeof window.AssetRegistry.getHoldings === 'function') {
      const holdings = window.AssetRegistry.getHoldings() || [];
      holdings.forEach(c => {
        const pnl = c.value - c.costBasis;
        assets.push({
          cat: T('Assets.ui.equities'),
          kind: 'equity',
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
            { label: T('Assets.ui.boughtValue'), val: c.costBasis > 0 ? euro(c.costBasis) : T('Assets.ui.untracked') },
            ...(c.costBasis > 0 ? [{ label: T('Assets.ui.profitLoss'), val: euro(pnl), pnl }] : []),
          ],
        });
      });
    }

    // --- 9. Owned Places (registered Destinations) ---
    if (window.AssetRegistry && typeof window.AssetRegistry.getOwnedPlaces === 'function') {
      const places = window.AssetRegistry.getOwnedPlaces() || [];
      places.forEach(p => {
        const coords = p.base ? `X:${p.base.x} Y:${p.base.y}` : '-';
        const placeName = window.WorkSystem?.destinationName
          ? window.WorkSystem.destinationName(p.key) : p.key;
        assets.push({
          cat: T('Assets.ui.places'),
          kind: 'place',
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

    // --- 10. Rented Properties (RealEstateMarket tenant contracts) ---
    if (re && Array.isArray(re.properties) && Array.isArray(re.rentedProperties)) {
      re.rentedProperties.forEach(pid => {
        const prop = re.properties.find(p => p && p.id === pid);
        if (!prop) return;
        const monthlyCost = Math.max(1, Math.round(prop.price * 0.03)) * 100;
        assets.push({
          cat: T('Assets.ui.rentals'),
          kind: 'rental',
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

    // --- 11. Rented Rooms (RentSystem.js stays) ---
    if (window.RentSystem && typeof window.RentSystem.listRentals === 'function') {
      const stays = window.RentSystem.listRentals() || [];
      stays.forEach(r => {
        const room = r.roomName || T('Assets.ui.room');
        const name = r.placeName ? T('Assets.ui.roomAt', { room, place: r.placeName }) : room;
        const entrance = (r.x != null) ? `X:${r.x} Y:${r.y}` : '-';
        const world = (r.worldX != null) ? `${r.worldX},${r.worldY}` : '-';
        assets.push({
          cat: T('Assets.ui.stays'),
          kind: 'stay',
          name,
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

    // --- 12. Diplomatic Posts (ONUAssembly.js) ---
    if (window.ONUAssembly && typeof window.ONUAssembly.listPosts === 'function') {
      const posts = window.ONUAssembly.listPosts() || [];
      posts.forEach(p => {
        assets.push({
          cat: T('Assets.ui.diplomacy'),
          kind: 'diplomat',
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

    // --- 13. Bank Deposits ---
    if (typeof $gameSystem !== 'undefined' && $gameSystem && typeof $gameSystem.getBankBalance === 'function') {
      const bal = $gameSystem.getBankBalance();
      if (bal > 0) {
        assets.push({
          cat: T('Assets.ui.bank'),
          kind: 'bank',
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

    // --- 14. Bank Loans (liability) ---
    if (typeof $gameSystem !== 'undefined' && $gameSystem && typeof $gameSystem.getLoanBalance === 'function') {
      const loan = $gameSystem.getLoanBalance();
      if (loan > 0) {
        const due = typeof $gameSystem.getLoanDueDate === 'function' ? $gameSystem.getLoanDueDate() : null;
        const curDay = $gameSystem._currentDay || 0;
        const daysLeft = due != null ? Math.max(0, due - curDay) : null;
        assets.push({
          cat: T('Assets.ui.liabilities'),
          kind: 'loan',
          name: T('Assets.ui.bankLoan'),
          sub: daysLeft != null ? `${T('Assets.ui.dueIn')} ${daysLeft} ${T('Assets.ui.days')}` : T('Assets.ui.outstanding'),
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

  // Calculates financial summary across all held assets.
  function calculateFinancialTotals(allAssets) {
    const cash = typeof $gameParty !== 'undefined' && $gameParty ? $gameParty.gold() : 0;
    let totalAssets = cash;
    let totalLiabilities = 0;
    let dailyIncome = 0;
    let totalRentDue = 0;

    (allAssets || []).forEach(a => {
      if (a.liability) {
        totalLiabilities += a.value;
      } else {
        totalAssets += a.value;
      }
      if (a.rentPerDay) dailyIncome += a.rentPerDay;
      if (a.rentDue) totalRentDue += a.rentDue;
    });

    const netWorth = totalAssets - totalLiabilities;
    return { cash, totalAssets, totalLiabilities, dailyIncome, totalRentDue, netWorth };
  }

  // ===========================================================================
  // Scene_AssetsMenu
  // ===========================================================================

  const BaseScene = typeof Scene_MenuBase !== 'undefined' ? Scene_MenuBase : class {};

  class Scene_AssetsMenu extends BaseScene {
    create() {
      super.create();
      this._selIndex = 0;
      this._btnIndex = -1;
      this._confirmResign = null;
      this._extendDays = 1;
      this._assets = [];
      this._catFilter = null;
      this._lastOil = 0;
      this._lastSouls = 0;

      this._wasdQueued = { up: false, down: false };
      this._wasdListener = (event) => {
        if (event.repeat) return;
        const k = event.key.toLowerCase();
        if (k === 'w') { this._wasdQueued.up = true; event.preventDefault(); }
        if (k === 's') { this._wasdQueued.down = true; event.preventDefault(); }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', this._wasdListener);
      }

      this.createDOM();
    }

    createDOM() {
      if (typeof document === 'undefined') return;
      this._container = document.createElement('div');
      this._container.id = 'menu-container';
      this._container.className = 'assets-fade';
      document.body.appendChild(this._container);

      this._rightClickStartedHere = false;
      this._container.addEventListener('mousedown', (e) => {
        if (e.button === 2) { this._rightClickStartedHere = true; e.stopPropagation(); }
      });
      this._container.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!this._rightClickStartedHere) return;
        this._rightClickStartedHere = false;
        if (typeof SoundManager !== 'undefined') SoundManager.playCancel();
        this.popScene();
      });

      this.refreshDOM();
      setTimeout(() => { if (this._container) this._container.classList.add('assets-fade-in'); }, 16);
    }

    refreshDOM() {
      if (!this._container) return;
      this._allAssets = gatherAssets();
      this._assets = this.filterAssets(this._allAssets);
      if (this._selIndex >= this._assets.length) this._selIndex = Math.max(0, this._assets.length - 1);
      this._btnIndex = -1;

      const sm = typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem.stockMarket;
      if (sm) {
        this._lastOil = typeof sm.getOilPrice === 'function' ? sm.getOilPrice() : 0;
        this._lastSouls = typeof sm.getSoulsPrice === 'function' ? sm.getSoulsPrice() : 0;
      }

      const totals = calculateFinancialTotals(this._allAssets);

      // Left page summary cards
      const summaryCard = (lbl, val, tone) => `
        <div class="ui-fact">
          <span class="ui-fact-lbl">${lbl}</span>
          <span class="ui-fact-val assets-sum-val${tone}">${val}</span>
        </div>`;

      const quickCollectHTML = totals.totalRentDue > 0 ? `
        <div class="assets-quick-collect focusable" tabindex="0" onclick="SceneManager._scene?.collectAllRent?.()">
          <span class="assets-badge--due">●</span>
          <span>${T('Assets.ui.collectAllRent', { amount: euro(totals.totalRentDue) })}</span>
        </div>` : '';

      const summaryHTML = `
        <div class="ui-fact-grid assets-summary">
          ${summaryCard(T('Assets.ui.cash'), euro(totals.cash), '')}
          ${summaryCard(T('Assets.ui.assets'), euro(totals.totalAssets), ' assets-val--gain')}
          ${summaryCard(T('Assets.ui.dailyIncome'), `+${euro(totals.dailyIncome)}`, ' assets-val--gain')}
          ${summaryCard(T('Assets.ui.debt'), euro(totals.totalLiabilities), totals.totalLiabilities > 0 ? ' assets-val--loss' : '')}
          ${summaryCard(T('Assets.ui.netWorth'), euro(totals.netWorth), totals.netWorth >= 0 ? ' assets-val--gain' : ' assets-val--loss')}
        </div>
        ${quickCollectHTML}`;

      const tabsHTML = this.buildTabsHTML();

      // Left page assets list
      let listHTML = '';
      if (this._assets.length === 0) {
        const emptyMsg = this._catFilter
          ? T('Assets.ui.noHoldingsInCategory')
          : T('Assets.ui.noAssetsOwnedYetAcquire');
        listHTML = `<div class="ui-empty"><div class="ui-empty-text">${emptyMsg}</div></div>`;
      } else {
        let lastCat = null;
        this._assets.forEach((a, idx) => {
          if (!this._catFilter && a.cat !== lastCat) {
            lastCat = a.cat;
            listHTML += `<div class="assets-cat-header">${escapeHtml(a.cat)}</div>`;
          }
          const sel = idx === this._selIndex ? 'selected' : '';
          const valTone = a.liability ? 'assets-val--loss' : 'assets-val--gain';
          const sign = a.liability ? '-' : '';

          let badgeHTML = '';
          if (a.kind === 'town' && a.rentDue > 0) {
            badgeHTML = `<span class="assets-row-badge assets-badge--due">${euro(a.rentDue)}</span>`;
          } else if (a.animal && a.animal.hasReady) {
            badgeHTML = `<span class="assets-row-badge assets-badge--ready">${T('Assets.ui.ready')}</span>`;
          } else if (a.rentPerDay > 0) {
            badgeHTML = `<span class="assets-row-badge assets-badge--tag">+${euro(a.rentPerDay)}/d</span>`;
          }

          listHTML += `
            <div class="item-slot assets-row focusable ${sel}" data-tint="${a.color}" tabindex="0" onclick="SceneManager._scene?.selectAsset?.(${idx})">
              <div class="assets-row-bar"></div>
              <div class="assets-row-info">
                <div class="assets-row-name">${escapeHtml(a.name)}</div>
                <div class="assets-row-sub">${escapeHtml(a.sub)}</div>
              </div>
              <div class="assets-row-vals">
                <span class="assets-row-val ${valTone}">${sign}${euro(a.value)}</span>
                ${badgeHTML}
                ${a.bought != null && !badgeHTML ? `<span class="assets-row-bought">${T('Assets.ui.paid')} ${euro(a.bought)}</span>` : ''}
              </div>
            </div>`;
        });
      }

      const leftPageHTML = `
        <div class="left-page">
          <div class="page-header-bar">
            <div class="back-button" onclick="SceneManager._scene?.popScene?.()">${T('Assets.ui.back')}</div>
            <h2 class="title">${T('Assets.ui.titleCombined')}</h2>
          </div>
          ${tabsHTML}
          ${summaryHTML}
          <div class="ui-list ui-scroll assets-list" id="assets-list">${listHTML}</div>
        </div>`;

      // Right page contextual deck
      const rightPageHTML = `
        <div class="right-page">
          <div class="ui-detail assets-detail" id="assets-detail">${this.buildDetailHTML()}</div>
        </div>`;

      this._container.innerHTML = `<div class="book-spread">${leftPageHTML}${rightPageHTML}</div>`;

      this.applyRowTints();
      this.paintGraph();
      this.paintAnimalSprite();
      this.scrollToSelected();
    }

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
        ` onclick="SceneManager._scene?.setCategoryFilter?.(${key})">${escapeHtml(label)}</div>`;
      const html = [tab(T('Assets.ui.allCategories'), 'null', !this._catFilter)]
        .concat(cats.map(c => tab(c, JSON.stringify(c), this._catFilter === c)));
      return `<div class="backpack-tabs">${html.join('')}</div>`;
    }

    setCategoryFilter(cat) {
      if (this._catFilter === cat) return;
      this._catFilter = cat;
      this._selIndex = 0;
      if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
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

    applyRowTints() {
      if (!this._container) return;
      this._container.querySelectorAll('.assets-row[data-tint]').forEach(el => {
        el.style.setProperty('--assets-tint', el.dataset.tint || 'var(--text-text-alt-4)');
      });
    }

    buildDetailHTML() {
      const a = this._assets[this._selIndex];
      if (!a) {
        return `<div class="ui-empty"><div class="ui-empty-text">${T('Assets.ui.selectAnAssetFromThe')}</div></div>`;
      }

      // Title & category header
      const headerHTML = `
        <div class="ui-detail-head">
          <div class="ui-detail-titles">
            <div class="assets-detail-cat">${escapeHtml(a.cat)}</div>
            <h3 class="assets-detail-name">${escapeHtml(a.name)}</h3>
            <div class="assets-row-sub">${escapeHtml(a.sub)}</div>
          </div>
        </div>`;

      // Contextual visual section
      let visualHTML = '';
      if (a.kind === 'stock' || a.kind === 'equity') {
        visualHTML = `
          <div class="assets-graph-box">
            <div class="inspect-section-title assets-graph-title">${T('Assets.ui.stockMarket')}</div>
            <canvas id="assets-graph" width="560" height="190"></canvas>
            <div class="assets-graph-legend">
              <div class="ui-chip assets-legend-item assets-legend--oil">OIL</div>
              <div class="ui-chip assets-legend-item assets-legend--soul">SOUL</div>
            </div>
          </div>`;
      } else if (a.animal) {
        visualHTML = this.buildAnimalPortraitHTML(a.animal);
      }

      // Contextual section title for specs
      let sectionTitle = T('Assets.ui.pocketsDetail');
      if (a.kind === 'town') sectionTitle = T('Assets.ui.townCharter');
      else if (a.kind === 'shop') sectionTitle = T('Assets.ui.businessDeed');
      else if (a.kind === 'realEstate' || a.kind === 'proceduralHouse' || a.kind === 'residence') sectionTitle = T('Assets.ui.propertyDeed');
      else if (a.kind === 'animal') sectionTitle = T('Assets.ui.livestockRegister');
      else if (a.kind === 'stay' || a.kind === 'rental') sectionTitle = T('Assets.ui.tenancyAgreement');
      else if (a.kind === 'diplomat') sectionTitle = T('Assets.ui.diplomaticCredentials');
      else if (a.kind === 'bank' || a.kind === 'loan') sectionTitle = T('Assets.ui.bankingStatement');

      // Spec rows
      const rows = (a.details || []).map(d => {
        let tone = '';
        if (d.pnl !== undefined) tone = d.pnl >= 0 ? ' assets-val--gain' : ' assets-val--loss';
        return `<div class="inspect-spec-row">
          <span class="inspect-spec-label">${escapeHtml(d.label)}:</span>
          <span class="inspect-spec-value${tone}">${escapeHtml(d.val)}</span>
        </div>`;
      }).join('');

      return `
        ${headerHTML}
        <div class="ui-detail-scroll ui-scroll">
          ${visualHTML}
          <div class="inspect-section-title">${sectionTitle}</div>
          <div class="inspect-spec-grid">${rows}</div>
        </div>
        ${this.buildAssetActionsHTML(a)}`;
    }

    buildAnimalPortraitHTML(animal) {
      return `<canvas class="ag-sprite-canvas" id="assets-animal-sprite"
        data-sprite="${escapeHtml(animal.sprite)}" data-stage="${escapeHtml(animal.stage)}"
        width="128" height="104"></canvas>`;
    }

    assetButtons(asset) {
      if (!asset) return [];
      if (asset.kind === 'town') {
        return [
          {
            key: 'collectTown',
            cls: asset.rentDue > 0 ? ' assets-action--gain' : '',
            label: asset.rentDue > 0
              ? `${T('Towns.deeds.collect')} (${euro(asset.rentDue)})`
              : T('Towns.deeds.collect'),
            enabled: asset.rentDue > 0,
          },
        ];
      }
      if (asset.kind === 'shop') {
        return [
          {
            key: 'manageShop',
            cls: '',
            label: T('Towns.deeds.manageShop'),
            enabled: true,
          },
        ];
      }
      if (asset.animal) {
        const animal = asset.animal;
        return [
          { key: 'collect', cls: '', label: T('Assets.ui.collect'), enabled: !!animal.hasReady },
          { key: 'sell', cls: ' assets-action--sell', label: `${T('Assets.ui.sell')} ${euro(animal.value)}`, enabled: true },
          { key: 'pet', cls: ' assets-action--pet', label: T('Assets.ui.makePet'), enabled: true },
        ];
      }
      if (asset.rental) {
        const rs = window.RentSystem;
        const days = this._extendDays;
        const cost = rs && typeof rs.extensionCost === 'function'
          ? rs.extensionCost(asset.rental.key, days) : asset.rental.price * days;
        const gold = typeof $gameParty !== 'undefined' && $gameParty ? $gameParty.gold() : 0;
        return [
          { key: 'days-', cls: '', label: T('Assets.ui.fewerDays'), enabled: days > 1 },
          { key: 'days+', cls: '', label: T('Assets.ui.moreDays'), enabled: days < MAX_EXTEND_DAYS },
          {
            key: 'extend',
            cls: '',
            label: T('Assets.ui.extendStay', { days, cost: euro(cost) }),
            enabled: gold >= cost,
          },
        ];
      }
      if (asset.diplomat) {
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
          ? ` onclick="SceneManager._scene?.runAssetAction?.('${b.key}')"` : '';
        return `<div class="inspect-btn assets-action focusable${b.cls}${focus}${dis}" tabindex="0" data-btn="${i}"${click}>${b.label}</div>`;
      }).join('');
      return `<div class="inspect-actions assets-actions-row">${html}</div>`;
    }

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
      if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
      this.refreshAssetButtons();
      return true;
    }

    refreshAssetButtons() {
      if (!this._container) return;
      this._container.querySelectorAll('.assets-action').forEach(el => {
        el.classList.toggle('selected', Number(el.dataset.btn) === this._btnIndex);
      });
    }

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
      if (key === 'collectTown') {
        this.collectTownRent();
        return;
      }
      if (key === 'manageShop') {
        this.manageShop(a.shop);
        return;
      }
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

    collectTownRent() {
      const TF = window.TownFounding;
      if (!TF || typeof TF.collectRent !== 'function') return;
      const total = TF.collectRent();
      if (total > 0) {
        if (typeof SoundManager !== 'undefined') SoundManager.playShop();
        const amt = TF.formatMoney ? TF.formatMoney(total) : euro(total);
        this.notify(T('Towns.deeds.collected', { amount: amt }));
      } else {
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
        this.notify(T('Towns.deeds.nothingDue'));
      }
      this.refreshDOM();
    }

    collectAllRent() {
      this.collectTownRent();
    }

    manageShop(shop) {
      const SM = window.ShopManagement;
      if (!SM || typeof SM.openManagement !== 'function' || !shop) {
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
        return;
      }
      if (typeof SoundManager !== 'undefined') SoundManager.playOk();
      SM.openManagement(shop.id);
    }

    changeExtendDays(delta) {
      const next = Math.min(MAX_EXTEND_DAYS, Math.max(1, this._extendDays + delta));
      if (next === this._extendDays) {
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
        return;
      }
      this._extendDays = next;
      if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
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
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
        this.notify(T('Assets.ui.stayNotAfforded'));
        return;
      }
      if (typeof SoundManager !== 'undefined') SoundManager.playShop();
      this.notify(T('Assets.ui.stayExtended', { days: result.days, time: result.timeLeft }));
      this._extendDays = 1;
      this.refreshDOM();
    }

    resignPost(post) {
      if (this._confirmResign !== post.actorId) {
        this._confirmResign = post.actorId;
        if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
        const held = this._btnIndex;
        this.refreshDOM();
        this._btnIndex = held;
        this.refreshAssetButtons();
        return;
      }
      this._confirmResign = null;
      if (window.ONUAssembly && window.ONUAssembly.resign(post.actorId)) {
        if (typeof SoundManager !== 'undefined') SoundManager.playOk();
      } else {
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
      }
      this._btnIndex = -1;
      this.refreshDOM();
    }

    paintAnimalSprite() {
      const cv = this._container && this._container.querySelector('#assets-animal-sprite');
      if (!cv || !window.AnimalGrowthSystem || typeof window.AnimalGrowthSystem.drawSpriteOnCanvas !== 'function') return;
      window.AnimalGrowthSystem.drawSpriteOnCanvas(cv, cv.dataset.sprite, cv.dataset.stage);
    }

    animalAt(uid) {
      return this._assets.find(a => a.animal && a.animal.uid === uid);
    }

    collectAnimal(uid) {
      const ags = window.AnimalGrowthSystem;
      if (!ags) return;
      const items = ags.collectFromPlacement(uid) || [];
      if (items.length === 0) {
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
        return;
      }
      if (typeof SoundManager !== 'undefined') SoundManager.playShop();
      const names = items.map(r => {
        const item = typeof $dataItems !== 'undefined' && $dataItems ? $dataItems[r.itemId] : null;
        return `${item ? item.name : `#${r.itemId}`} ×${r.qty}`;
      }).join(', ');
      this.notify(`${T('Assets.ui.collected')}: ${names}`);
      this.refreshDOM();
    }

    sellAnimal(uid) {
      const ags = window.AnimalGrowthSystem;
      if (!ags) return;
      const sold = ags.sellPlacement(uid);
      if (!sold) {
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
        return;
      }
      if (typeof SoundManager !== 'undefined') SoundManager.playShop();
      this.notify(`${T('Assets.ui.sold')} ${sold.animalId} - ${euro(sold.value)}`);
      this.refreshDOM();
    }

    makeAnimalPet(uid) {
      const ags = window.AnimalGrowthSystem;
      if (!ags) return;
      const entry = this.animalAt(uid);
      const pet = ags.petPlacement(uid);
      if (!pet) {
        if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
        return;
      }
      if (typeof SoundManager !== 'undefined') SoundManager.playOk();
      const name = entry ? entry.animal.animalId : pet.name;
      this.notify(T('Assets.ui.nowAPet', { name }));
      this.refreshDOM();
    }

    notify(text) {
      if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
        window.ParchmentToast.show(text, { severity: 'info', duration: 180 });
      }
    }

    token(name, fallback) {
      if (!this._container || typeof getComputedStyle === 'undefined') return fallback;
      const v = getComputedStyle(this._container).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    }

    paintGraph() {
      const canvas = this._container && this._container.querySelector('#assets-graph');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const sm = typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem.stockMarket;
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
      if (sel && typeof sel.scrollIntoView === 'function') sel.scrollIntoView({ block: 'nearest' });
    }

    selectAsset(idx) {
      if (idx < 0 || idx >= this._assets.length) return;
      if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
      this._selIndex = idx;
      this._btnIndex = -1;
      this._confirmResign = null;

      const detail = this._container && this._container.querySelector('#assets-detail');
      if (detail) {
        detail.innerHTML = this.buildDetailHTML();
        this.paintGraph();
        this.paintAnimalSprite();
      }
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

      let handled = false;
      if (typeof Input !== 'undefined') {
        if (Input.isRepeated('down') || this._wasdQueued.down) { this.moveSelection(1); handled = true; }
        else if (Input.isRepeated('up') || this._wasdQueued.up) { this.moveSelection(-1); handled = true; }
        this._wasdQueued.up = this._wasdQueued.down = false;

        if (!handled && Input.isRepeated('right')) { handled = this.moveAssetButton(1); }
        else if (!handled && Input.isRepeated('left')) { handled = this.moveAssetButton(-1); }
        if (!handled && Input.isTriggered('pagedown')) { handled = this.stepCategory(1); }
        else if (!handled && Input.isTriggered('pageup')) { handled = this.stepCategory(-1); }
        if (!handled && Input.isTriggered('ok')) { handled = this.triggerAssetButton(); }

        const cancelTriggered = Input.isTriggered('cancel') || Input.isTriggered('escape') ||
          (typeof TouchInput !== 'undefined' && TouchInput.isCancelled());
        if (!handled && cancelTriggered) {
          if (typeof SoundManager !== 'undefined') SoundManager.playCancel();
          this.popScene();
          return;
        }
      }

      const sm = typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem.stockMarket;
      if (sm && typeof sm.getOilPrice === 'function') {
        if (sm.getOilPrice() !== this._lastOil || sm.getSoulsPrice() !== this._lastSouls) {
          this.liveUpdate();
        }
      }
    }

    liveUpdate() {
      if (!this._container) return;
      this._allAssets = gatherAssets();
      this._assets = this.filterAssets(this._allAssets);
      const sm = typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem.stockMarket;
      if (sm) {
        this._lastOil = typeof sm.getOilPrice === 'function' ? sm.getOilPrice() : 0;
        this._lastSouls = typeof sm.getSoulsPrice === 'function' ? sm.getSoulsPrice() : 0;
      }

      const rows = this._container.querySelectorAll('.assets-row');
      if (rows.length !== this._assets.length) { this.refreshDOM(); return; }

      const totals = calculateFinancialTotals(this._allAssets);
      const sumVals = this._container.querySelectorAll('.assets-sum-val');
      if (sumVals.length === 5) {
        sumVals[0].textContent = euro(totals.cash);
        sumVals[1].textContent = euro(totals.totalAssets);
        sumVals[2].textContent = `+${euro(totals.dailyIncome)}`;
        sumVals[3].textContent = euro(totals.totalLiabilities);
        sumVals[4].textContent = euro(totals.netWorth);
        sumVals[4].classList.toggle('assets-val--gain', totals.netWorth >= 0);
        sumVals[4].classList.toggle('assets-val--loss', totals.netWorth < 0);
      }

      rows.forEach((row, i) => {
        const a = this._assets[i];
        if (!a) return;
        const valEl = row.querySelector('.assets-row-val');
        if (valEl) valEl.textContent = `${a.liability ? '-' : ''}${euro(a.value)}`;
      });

      const detail = this._container.querySelector('#assets-detail');
      if (detail) {
        detail.innerHTML = this.buildDetailHTML();
        this.paintGraph();
        this.paintAnimalSprite();
      }
    }

    terminate() {
      if (this._wasdListener && typeof window !== 'undefined') {
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

  // Global exports
  window.Scene_AssetsMenu = Scene_AssetsMenu;
  window.AssetsMenu = {
    gatherAssets,
    euro,
    calculateFinancialTotals,
    escapeHtml,
  };

})();
