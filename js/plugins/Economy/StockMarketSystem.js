/*:
 * @target MZ
 * @plugindesc Stock Market System v4.0 - Advanced Multi-Asset Stock Trading Terminal with Complex Orders (Market, Limit, Stop-Loss, Take-Profit).
 * @author Omni-Lex & Antigravity
 * 
 * @param Initial Oil Price
 * @desc Starting price for oil stocks (in cents, e.g., 10000 = €100.00)
 * @default 10000
 * 
 * @param Initial SOUL Price
 * @desc Starting price for souls stocks (in cents, e.g., 66666 = €666.66)
 * @default 66666
 * 
 * @param SOUL Median Price
 * @desc Target median price for SOUL stocks that prices will gravitate towards (in cents)
 * @default 66666
 * 
 * @param Volatility
 * @desc Base volatility for stocks.
 * @default 0.2
 * 
 * @param Update Interval
 * @desc How often the stocks update in milliseconds
 * @default 2000
 * 
 * @param History Length
 * @desc Number of price points to keep in history
 * @default 60
 * 
 * @param Minimum Price
 * @desc A final safety floor for all stock prices (in cents).
 * @default 1000
 * 
 * @param Oil Shares Variable
 * @desc Variable ID to store OIL shares count (0 = disabled)
 * @default 51
 * 
 * @param Soul Shares Variable
 * @desc Variable ID to store SOUL shares count (0 = disabled)
 * @default 52
 * 
 * @param Soul Median Variable
 * @desc Variable ID to control SOUL median price (0 = disabled, uses plugin parameter)
 * @default 53
 * 
 * @command OpenStockMarket
 * @desc Opens the stock market screen
 * 
 * @command PumpMarket
 * @desc Triggers a sudden market surge across stocks
 * 
 * @command CrashMarket
 * @desc Triggers a market-wide crash
 */

(function () {
  "use strict";

  //=============================================================================
  // Plugin Parameters & Definitions
  //=============================================================================

  const pluginName = "StockMarketSystem";
  const parameters = PluginManager.parameters(pluginName);

  const initialOilPrice = Number(parameters["Initial Oil Price"]) || 10000;
  const initialSoulsPrice = Number(parameters["Initial SOUL Price"]) || 66666;
  const soulMedianDefault = Number(parameters["SOUL Median Price"]) || 66666;
  const baseVolatility = Number(parameters["Volatility"]) || 0.2;
  const updateInterval = Number(parameters["Update Interval"]) || 2000;
  const historyLength = Number(parameters["History Length"]) || 60;
  // How hard a continental outbreak leans on the market: infected people per
  // full point of negative sentiment, and the most it may ever be worth.
  const EPIDEMIC_DRAG_SCALE = 400000;
  const EPIDEMIC_DRAG_MAX = 0.6;
  const minimumPrice = Number(parameters["Minimum Price"]) || 1000;
  const oilSharesVariableId = Number(parameters["Oil Shares Variable"]) || 51;
  const soulSharesVariableId = Number(parameters["Soul Shares Variable"]) || 52;
  const soulMedianVariableId = Number(parameters["Soul Median Variable"]) || 53;

  //=============================================================================
  // Listed Assets
  //=============================================================================
  //
  // Two things are traded here. OIL and SOUL are the commodities the rest of
  // the economy prices off (fuel, shop mark-ups, the SOUL median variable), and
  // they keep the formulas and the wiring they have always had. Everything else
  // is a company the world already knows about: the listings are read straight
  // from js/db/WorldGen/Companies.json, the same register the Real Estate
  // market and the Assets pockets trade, so a share bought at the terminal is
  // the same share the party owns anywhere else.

  const COMMODITY_CONFIG = {
    oil: {
      id: "oil",
      symbol: "OIL",              // i18n-ignore  ticker
      sectorKey: "commodities",
      initialPrice: initialOilPrice,
      volatility: 0.28,
      minPrice: 2500,
      maxPrice: 90000,
      color: "#2ecc71",
      commodity: true
    },
    souls: {
      id: "souls",
      symbol: "SOUL",             // i18n-ignore  ticker
      sectorKey: "arcane",
      initialPrice: initialSoulsPrice,
      volatility: 0.16,
      minPrice: 5000,
      maxPrice: 150000,
      color: "#9b59b6",
      commodity: true
    }
  };

  // How jumpy a listing is, by the sector id carried in Companies.json.
  const SECTOR_VOLATILITY = {
    consumertech: 0.30,
    energy: 0.26,
    occult: 0.34,
    telecom: 0.24,
    industrial: 0.16,
    agriculture: 0.20,
    finance: 0.11,
    transport: 0.20,
    misc: 0.20
  };

  // Per-company market character: a house that lives or dies on a commodity
  // follows it (beta on the commodity's last move), and a few are jumpier than
  // their sector. Everything the player reads about them lives in the data.
  const COMPANY_MARKET_META = {
    "LimeCorp": { volatility: 0.42 },
    "LemonCorp": { volatility: 0.26 },
    "PetroDyne": { tracks: "oil", beta: 0.60 },
    "SoulForge": { tracks: "souls", beta: 0.55 },
    "HyperNet Systems": { volatility: 0.28 },       // i18n-ignore  company key
    "Ferro Steelworks": { tracks: "oil", beta: 0.20 },   // i18n-ignore  company key
    "Aether Logistics": { tracks: "oil", beta: -0.30 },  // i18n-ignore  company key
    "GreenWitch Organics": { volatility: 0.22 },    // i18n-ignore  company key
    "Vault Bank Holdings": { volatility: 0.11 }     // i18n-ignore  company key
  };

  // Filled by buildStocksConfig() once the database is loaded: the terminal is
  // built after Companies.json is on window.WorldGen, never at plugin load.
  const STOCKS_CONFIG = {};

  // Helper i18n
  const _smi18n = (path, vars) => {
    if (typeof T === "function") {
      const res = T('StockMarket.' + path, vars || {});
      if (res && !res.startsWith('StockMarket.')) return res;
    }
    return null;
  };

  //=============================================================================
  // Listing Builders
  //=============================================================================

  // Sector ids stay English in the data - the market sorts and matches on them -
  // so the label is looked up from the id, sharing the Real Estate register's
  // wording. Commodities carry their own two.
  function sectorLabel(sectorKey) {
    const key = String(sectorKey || 'misc').toLowerCase().replace(/[^a-z0-9]/g, '');
    const own = _smi18n('sectors.' + key);
    if (own) return own;
    const shared = 'RealEstate.sector.' + key;
    if (typeof T === "function" && T.has && T.has(shared)) return T(shared);
    return String(sectorKey || '');
  }

  // A listing's prose. Companies.json carries an i18n key rather than a
  // sentence; a company registered at runtime may carry plain prose.
  function listingText(value) {
    if (!value) return '';
    const key = String(value);
    if (typeof T === "function" && T.has && T.has(key)) return T(key);
    return key;
  }

  // Every company the world knows about, keyed as the share register keys them.
  function loreCompanyDefs() {
    const base = (window.WorldGen && window.WorldGen.Companies) || {};
    const defs = Object.assign({}, base);
    // Companies floated at runtime (plugin command, quests) list too.
    if (window.AssetRegistry && typeof window.AssetRegistry.getCompanies === "function" &&
        typeof $gameSystem !== "undefined" && $gameSystem) {
      try {
        for (const c of window.AssetRegistry.getCompanies()) {
          if (!defs[c.key]) {
            defs[c.key] = {
              name: c.name, sector: c.sector, sharePrice: c.basePrice,
              totalShares: c.totalShares, color: c.color, description: c.description
            };
          }
        }
      } catch (e) {}
    }
    return defs;
  }

  // A ticker for a listing: the one written in the data, else the first four
  // letters of its key.
  function companyTicker(key, def) {
    const written = def && def.ticker;
    const derived = String(key).replace(/[^A-Za-z0-9]/g, '').slice(0, 4);
    return String(written || derived || 'STK').toUpperCase();
  }

  // The stock id a company trades under: its key, flattened for use as a DOM
  // attribute and a save key.
  function companyStockId(key) {
    return String(key).replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'co';
  }

  function companyStockDef(key, def) {
    const baseEuros = Math.max(1, Number(def.sharePrice) || 1);
    const base = Math.round(baseEuros * 100);   // euros -> cents
    const sector = String(def.sector || 'Misc');  // i18n-ignore  sector id
    const meta = COMPANY_MARKET_META[key] || {};
    const sectorId = sector.toLowerCase().replace(/[^a-z0-9]/g, '');
    return {
      id: companyStockId(key),
      companyKey: key,
      symbol: companyTicker(key, def),
      name: def.name || key,
      sectorKey: sector,
      category: sectorLabel(sector),
      description: listingText(def.description),
      initialPrice: base,
      centerPrice: base,
      volatility: meta.volatility || SECTOR_VOLATILITY[sectorId] || 0.2,
      minPrice: Math.max(minimumPrice, Math.round(base * 0.3)),
      maxPrice: Math.round(base * 4),
      color: def.color || '#8b5a2b',
      totalShares: Math.max(0, Number(def.totalShares) || 0),
      tracks: meta.tracks || null,
      beta: meta.beta || 0
    };
  }

  // Rebuild the traded table: the two commodities first, then every listed
  // company. Returns the ids that were added.
  function buildStocksConfig() {
    const added = [];
    for (const [id, def] of Object.entries(COMMODITY_CONFIG)) {
      if (!STOCKS_CONFIG[id]) added.push(id);
      STOCKS_CONFIG[id] = Object.assign({}, def, {
        name: _smi18n('assets.' + id + '.name') || def.symbol,
        category: sectorLabel(def.sectorKey),
        description: _smi18n('assets.' + id + '.description') || ''
      });
    }
    const defs = loreCompanyDefs();
    for (const key of Object.keys(defs)) {
      const stock = companyStockDef(key, defs[key]);
      if (!STOCKS_CONFIG[stock.id]) added.push(stock.id);
      STOCKS_CONFIG[stock.id] = stock;
    }
    return added;
  }

  //=============================================================================
  // Money Formatting Helpers
  //=============================================================================

  function formatMoney(cents) {
    cents = Math.round(Number(cents) || 0);
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(cents);
    const euros = Math.floor(abs / 100);
    const centsPart = abs % 100;
    return `${sign}€${euros.toLocaleString()}.${centsPart.toString().padStart(2, "0")}`;
  }

  function getPlayerGoldInCents() {
    return $gameParty ? $gameParty.gold() : 0;
  }

  function goldToEurosForDisplay(gold) {
    return formatMoney(gold);
  }

  //=============================================================================
  // Variable Synchronization Helpers
  //=============================================================================

  function getOilSharesFromVariable() {
    if (oilSharesVariableId > 0 && typeof $gameVariables !== "undefined" && $gameVariables) {
      const value = $gameVariables.value(oilSharesVariableId);
      return Math.max(0, Number(value) || 0);
    }
    return 0;
  }

  function getSoulSharesFromVariable() {
    if (soulSharesVariableId > 0 && typeof $gameVariables !== "undefined" && $gameVariables) {
      const value = $gameVariables.value(soulSharesVariableId);
      return Math.max(0, Number(value) || 0);
    }
    return 0;
  }

  function getSoulMedianFromVariable() {
    if (soulMedianVariableId > 0 && typeof $gameVariables !== "undefined" && $gameVariables) {
      const value = $gameVariables.value(soulMedianVariableId);
      const medianValue = Number(value) || 0;
      return medianValue > 0 ? medianValue : soulMedianDefault;
    }
    return soulMedianDefault;
  }

  function setOilSharesVariable(shares) {
    if (oilSharesVariableId > 0 && typeof $gameVariables !== "undefined" && $gameVariables) {
      $gameVariables.setValue(oilSharesVariableId, shares);
    }
  }

  function setSoulSharesVariable(shares) {
    if (soulSharesVariableId > 0 && typeof $gameVariables !== "undefined" && $gameVariables) {
      $gameVariables.setValue(soulSharesVariableId, shares);
    }
  }

  //=============================================================================
  // Share Register Bridge
  //=============================================================================
  //
  // A company listing has no ledger of its own. Its shares live in the world's
  // share register (the Real Estate manager, reached through AssetRegistry),
  // which is what the Assets pockets show and where the CEO's founding stake is
  // written. The terminal reads that position before it prices anything and
  // writes it straight back after a fill, so both screens always agree.

  // `force` builds the register if it is not standing yet - what the terminal
  // does when the player opens it or trades. Without it the register is only
  // used if it already exists, so the price tick that runs everywhere in the
  // game never builds a property market behind the player's back.
  function shareRegister(force) {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    const reg = window.AssetRegistry;
    if (!reg || typeof reg.getPosition !== "function" || typeof reg.setPosition !== "function") return null;
    if (!force && typeof reg.isReady === "function" && !reg.isReady()) return null;
    return reg;
  }

  //=============================================================================
  // Stock Market System - Core Class
  //=============================================================================

  class StockMarketSystem {
    constructor() {
      this.initialize();
    }

    initialize() {
      this._stocks = {};
      this._shares = {};
      this._costBasis = {};
      this._history = {};
      this._candles = {}; // { [stockId]: [ { open, high, low, close } ] }
      this._orders = []; // Active Limit / Stop orders
      this._orderHistory = []; // Executed / Cancelled orders
      this._news = []; // Simulated live market headlines
      this._updateCounter = 0;
      this._lastUpdateTime = 0;
      this._sessionStartTime = Date.now();

      this._lastPctMove = {};   // last tick's move per stock, for tracking betas
      this._lastQuotedEuros = {}; // last per-share euro price written to the register

      // Build the traded table from the world's company register, then seed
      // every listing with a history.
      buildStocksConfig();
      for (const [id, def] of Object.entries(STOCKS_CONFIG)) {
        this._seedStock(id, def);
      }

      // Sync specific legacy fields
      this._oilShares = getOilSharesFromVariable();
      this._soulsShares = getSoulSharesFromVariable();
      this._shares.oil = this._oilShares;
      this._shares.souls = this._soulsShares;

      this._oilCostBasis = 0;
      this._soulsCostBasis = 0;
      this._oilHistory = this._history.oil;
      this._soulsHistory = this._history.souls;
      this._oilPrice = this._stocks.oil.currentPrice;
      this._soulsPrice = this._stocks.souls.currentPrice;

      this.generateInitialNews();
      this.loadWorldMarket();
      this.pullRegisterPositions();
    }

    // Seed one listing: its history, its opening price and its candles. Company
    // listings open on the price the share register already quotes, so a market
    // the party has been trading elsewhere does not jump when the terminal opens.
    _seedStock(id, def) {
      this._stocks[id] = { ...def };
      this._shares[id] = 0;
      this._costBasis[id] = 0;
      const quoted = this._registerPriceCents(id);
      const opening = quoted || def.initialPrice;
      this._history[id] = this.generateRandomHistory(opening, historyLength, id);
      this._stocks[id].currentPrice = this._history[id][this._history[id].length - 1];
      this._candles[id] = this.generateCandleHistory(this._history[id]);
    }

    // Pick up companies floated after this market was built (quest rewards, mods)
    // without disturbing the listings already trading. Called when the terminal
    // opens.
    refreshListings() {
      const added = buildStocksConfig();
      for (const id of added) {
        if (!this._history[id]) this._seedStock(id, STOCKS_CONFIG[id]);
      }
      // A listing's wording follows the player's language, which may have
      // changed since the market was built.
      for (const [id, def] of Object.entries(STOCKS_CONFIG)) {
        if (!this._stocks[id]) continue;
        this._stocks[id].name = def.name;
        this._stocks[id].category = def.category;
        this._stocks[id].description = def.description;
      }
      this.pullRegisterPositions();
      this.adoptRegisterQuotes();
    }

    // Open a company listing on the price the share register last quoted, the
    // first time this session looks at it: between sessions the Real Estate
    // screen drifts prices daily, and the terminal should not undo that.
    adoptRegisterQuotes() {
      for (const id of Object.keys(STOCKS_CONFIG)) {
        if (!this._stocks[id] || this._lastQuotedEuros[id] !== undefined) continue;
        const quoted = this._registerPriceCents(id, true);
        if (!quoted) continue;
        this._stocks[id].currentPrice = quoted;
        this._history[id][this._history[id].length - 1] = quoted;
        this._lastQuotedEuros[id] = Math.round(quoted / 100);
      }
    }

    // =========================================================================
    // Share register bridge
    // =========================================================================

    _companyKey(stockId) {
      const def = STOCKS_CONFIG[stockId];
      return def && def.companyKey ? def.companyKey : null;
    }

    // What the register quotes for a company listing, in cents. Null for the
    // commodities, which the terminal alone prices.
    _registerPriceCents(stockId, force) {
      const key = this._companyKey(stockId);
      const reg = key && shareRegister(force);
      if (!reg) return null;
      try {
        const pos = reg.getPosition(key);
        if (!pos) return null;
        return Math.round(Math.max(1, Number(pos.price) || 1) * 100);
      } catch (e) { return null; }
    }

    // Read every company position out of the register into the terminal.
    pullRegisterPositions() {
      const reg = shareRegister(true);
      if (!reg) return;
      for (const id of Object.keys(STOCKS_CONFIG)) {
        const key = this._companyKey(id);
        if (!key || !this._stocks[id]) continue;
        try {
          const pos = reg.getPosition(key);
          if (!pos) continue;
          this._shares[id] = Math.max(0, Math.floor(Number(pos.shares) || 0));
          this._costBasis[id] = Math.max(0, Math.round(Number(pos.costBasis) || 0));
        } catch (e) {}
      }
    }

    // Write a position back where the rest of the game reads it: the shares
    // variables for the commodities, the share register for a company.
    _pushPosition(stockId) {
      if (stockId === "oil") {
        this._oilShares = this._shares.oil;
        this._oilCostBasis = this._costBasis.oil;
        setOilSharesVariable(this._oilShares);
        return;
      }
      if (stockId === "souls") {
        this._soulsShares = this._shares.souls;
        this._soulsCostBasis = this._costBasis.souls;
        setSoulSharesVariable(this._soulsShares);
        return;
      }
      const key = this._companyKey(stockId);
      const reg = key && shareRegister(true);
      if (!reg) return;
      try {
        reg.setPosition(key, this._shares[stockId] || 0, Math.round(this._costBasis[stockId] || 0));
      } catch (e) {}
    }

    // Quote the terminal's price back to the register, in whole euros, so the
    // Assets pockets and the Real Estate screen value the same share the same way.
    _quoteToRegister(stockId, priceCents) {
      const key = this._companyKey(stockId);
      const reg = key && shareRegister();
      if (!reg || typeof reg.setCompanyPrice !== "function") return;
      const euros = Math.max(1, Math.round(priceCents / 100));
      if (this._lastQuotedEuros[stockId] === euros) return;
      try {
        reg.setCompanyPrice(key, euros);
        this._lastQuotedEuros[stockId] = euros;
      } catch (e) {}
    }

    // How many shares of a listing are still unissued. Commodities are unlimited.
    availableShares(stockId) {
      const def = STOCKS_CONFIG[stockId];
      if (!def || !def.companyKey || !def.totalShares) return Infinity;
      return Math.max(0, def.totalShares - (this._shares[stockId] || 0));
    }

    // The party's slice of a company, as a percentage. 0 for the commodities.
    ownershipPct(stockId) {
      const def = STOCKS_CONFIG[stockId];
      if (!def || !def.totalShares) return 0;
      return ((this._shares[stockId] || 0) / def.totalShares) * 100;
    }

    _worldMarketAvailable() {
      return !!(window.WorldManager && typeof window.WorldManager.getField === "function");
    }

    syncWorldMarket() {
      if (!this._worldMarketAvailable()) return;
      const WM = window.WorldManager;
      WM.setField("market", "oilPrice", this.getOilPrice());
      WM.setField("market", "soulsPrice", this.getSoulsPrice());
      WM.setField("market", "oilHistory", this._history.oil);
      WM.setField("market", "soulsHistory", this._history.souls);

      // Multi-stock pricing map
      const priceMap = {};
      const histMap = {};
      for (const [id, stock] of Object.entries(this._stocks)) {
        priceMap[id] = stock.currentPrice;
        histMap[id] = this._history[id];
      }
      WM.setField("market", "priceMap", priceMap);
      WM.setField("market", "histMap", histMap);
      WM.setField("market", "updateCounter", this._updateCounter);
    }

    loadWorldMarket() {
      if (!this._worldMarketAvailable()) return;
      const WM = window.WorldManager;
      const priceMap = WM.getField("market", "priceMap");
      const histMap = WM.getField("market", "histMap");

      if (histMap && typeof histMap === "object") {
        for (const [id, hist] of Object.entries(histMap)) {
          if (Array.isArray(hist) && hist.length && this._stocks[id]) {
            this._history[id] = hist.map(Number);
            const p = priceMap && priceMap[id] !== undefined ? Number(priceMap[id]) : this._history[id][this._history[id].length - 1];
            this._stocks[id].currentPrice = p;
            this._candles[id] = this.generateCandleHistory(this._history[id]);
          }
        }
      } else {
        const oilHist = WM.getField("market", "oilHistory");
        const soulHist = WM.getField("market", "soulsHistory");
        if (Array.isArray(oilHist) && oilHist.length) {
          this._history.oil = oilHist.map(Number);
          const p = WM.getField("market", "oilPrice");
          this._stocks.oil.currentPrice = p !== undefined ? Number(p) : this._history.oil[this._history.oil.length - 1];
        }
        if (Array.isArray(soulHist) && soulHist.length) {
          this._history.souls = soulHist.map(Number);
          const p = WM.getField("market", "soulsPrice");
          this._stocks.souls.currentPrice = p !== undefined ? Number(p) : this._history.souls[this._history.souls.length - 1];
        }
      }

      this._oilPrice = this._stocks.oil.currentPrice;
      this._soulsPrice = this._stocks.souls.currentPrice;
      this._oilHistory = this._history.oil;
      this._soulsHistory = this._history.souls;

      const uc = WM.getField("market", "updateCounter");
      if (uc !== undefined) this._updateCounter = Number(uc);
    }

    toJSON() {
      return {
        shares: this._shares,
        costBasis: this._costBasis,
        orders: this._orders,
        orderHistory: this._orderHistory.slice(-50),
        oilShares: this._shares.oil || 0,
        soulsShares: this._shares.souls || 0,
        oilCostBasis: this._costBasis.oil || 0,
        soulsCostBasis: this._costBasis.souls || 0,
      };
    }

    fromJSON(jsonObj) {
      if (!jsonObj) return;

      if (jsonObj.shares && typeof jsonObj.shares === "object") {
        for (const [id, qty] of Object.entries(jsonObj.shares)) {
          if (this._shares[id] !== undefined) this._shares[id] = Math.max(0, Number(qty) || 0);
        }
      }

      if (jsonObj.costBasis && typeof jsonObj.costBasis === "object") {
        for (const [id, basis] of Object.entries(jsonObj.costBasis)) {
          if (this._costBasis[id] !== undefined) this._costBasis[id] = Math.max(0, Number(basis) || 0);
        }
      }

      const variableOilShares = getOilSharesFromVariable();
      const variableSoulShares = getSoulSharesFromVariable();

      if (variableOilShares > 0) this._shares.oil = variableOilShares;
      else if (jsonObj.oilShares !== undefined) this._shares.oil = Number(jsonObj.oilShares);

      if (variableSoulShares > 0) this._shares.souls = variableSoulShares;
      else if (jsonObj.soulsShares !== undefined) this._shares.souls = Number(jsonObj.soulsShares);

      this._oilShares = this._shares.oil;
      this._soulsShares = this._shares.souls;
      this._oilCostBasis = jsonObj.oilCostBasis !== undefined ? Number(jsonObj.oilCostBasis) : (this._costBasis.oil || 0);
      this._soulsCostBasis = jsonObj.soulsCostBasis !== undefined ? Number(jsonObj.soulsCostBasis) : (this._costBasis.souls || 0);
      this._costBasis.oil = this._oilCostBasis;
      this._costBasis.souls = this._soulsCostBasis;

      setOilSharesVariable(this._oilShares);
      setSoulSharesVariable(this._soulsShares);

      if (Array.isArray(jsonObj.orders)) {
        this._orders = jsonObj.orders;
      }
      if (Array.isArray(jsonObj.orderHistory)) {
        this._orderHistory = jsonObj.orderHistory;
      }

      this.loadWorldMarket();
      // Company positions are the share register's to state, not the save's.
      this.pullRegisterPositions();
      this.syncWorldMarket();
    }

    update() {
      if (!this._lastUpdateTime) {
        this._lastUpdateTime = Date.now();
        return false;
      }
      if (Date.now() - this._lastUpdateTime >= updateInterval) {
        this._lastUpdateTime = Date.now();
        this.updatePrices();
        this.evaluateOpenOrders();
        return true;
      }
      return false;
    }

    updatePrices() {
      const WM = window.WorldManager;
      if (WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld()) return;

      // The commodities price first: the houses that live off them read the
      // move they just made.
      const ordered = Object.keys(STOCKS_CONFIG).sort((a, b) => {
        const ca = STOCKS_CONFIG[a].commodity ? 0 : 1;
        const cb = STOCKS_CONFIG[b].commodity ? 0 : 1;
        return ca - cb;
      });

      for (const id of ordered) {
        const def = STOCKS_CONFIG[id];
        if (!this._stocks[id]) continue;

        // A company's price may have moved outside the terminal - the daily
        // drift on the Real Estate screen - in which case that is where it
        // opens from.
        const quoted = this._registerPriceCents(id);
        let prevPrice = this._stocks[id].currentPrice;
        if (quoted && this._lastQuotedEuros[id] !== undefined &&
            Math.round(quoted / 100) !== this._lastQuotedEuros[id]) {
          prevPrice = quoted;
        }

        const newPrice = this.generateNewPrice(prevPrice, id, def);
        this._stocks[id].currentPrice = newPrice;
        this._lastPctMove[id] = prevPrice > 0 ? (newPrice - prevPrice) / prevPrice : 0;

        this._history[id].push(newPrice);
        if (this._history[id].length > historyLength) this._history[id].shift();

        // Update candlestick buffer
        this.updateCandle(id, prevPrice, newPrice);
        this._quoteToRegister(id, newPrice);
      }

      this._oilPrice = this._stocks.oil.currentPrice;
      this._soulsPrice = this._stocks.souls.currentPrice;
      this._oilHistory = this._history.oil;
      this._soulsHistory = this._history.souls;
      this._updateCounter++;

      // Periodically trigger a market event headline
      if (this._updateCounter % 15 === 0) {
        this.generateRandomHeadline();
      }

      this.syncWorldMarket();
    }

    generateNewPrice(currentPrice, stockType, def) {
      let newPrice;
      // Town mood plus whatever the continent is dying of, clamped to the same
      // -1..1 range the sentiment term has always been on.
      const mood = window.NPCWorldWeb?.marketSentiment?.() ?? 0;
      const sentiment = Math.max(-1, Math.min(1, mood + this._epidemicDrag()));

      if (stockType === "souls") {
        const targetPrice = getSoulMedianFromVariable();
        const reversionStrength = 0.08;
        const fluctuation = (Math.random() - 0.5) * (currentPrice * def.volatility * 0.4);
        const pullToMean = (targetPrice - currentPrice) * reversionStrength;
        newPrice = currentPrice + pullToMean + fluctuation;
      } else {
        const minPrice = def.minPrice || 2000;
        const maxPrice = def.maxPrice || 100000;
        // A company reverts to what it was floated at; OIL keeps the band
        // midpoint it has always walked around.
        const centerPrice = def.centerPrice || (minPrice + maxPrice) / 2;
        const reversionStrength = 0.008;

        const pullToCenter = (centerPrice - currentPrice) * reversionStrength;
        const randomWalk = (Math.random() - 0.5) * (currentPrice * def.volatility * 0.5);
        const sentimentDrift = currentPrice * 0.015 * sentiment;

        // A house that lives off a commodity follows it: refiners rise with
        // OIL, hauliers are squeezed by it.
        let commodityDrift = 0;
        if (def.tracks && def.beta) {
          const move = (this._lastPctMove && this._lastPctMove[def.tracks]) || 0;
          commodityDrift = currentPrice * move * def.beta;
        }

        let shock = 0;
        if (Math.random() < 0.04) {
          const upChance = 0.5 + sentiment * 0.25;
          shock = (Math.random() < upChance ? 1 : -1) * currentPrice * (0.08 + Math.random() * 0.12);
        }

        newPrice = currentPrice + pullToCenter + randomWalk + sentimentDrift + commodityDrift + shock;
        newPrice = Math.max(minPrice, Math.min(newPrice, maxPrice));
      }

      newPrice = Math.max(newPrice, minimumPrice);
      return Math.round(newPrice);
    }

    generateRandomHistory(basePrice, length, stockType) {
      const def = STOCKS_CONFIG[stockType] || { volatility: baseVolatility, minPrice: 1000, maxPrice: 100000 };
      const history = [];
      let currentPrice = basePrice;

      for (let i = 0; i < length; i++) {
        currentPrice = this.generateNewPrice(currentPrice, stockType, def);
        history.push(Math.round(currentPrice));
      }
      return history;
    }

    generateCandleHistory(history) {
      const candles = [];
      const step = 3;
      for (let i = 0; i < history.length; i += step) {
        const chunk = history.slice(i, i + step);
        if (chunk.length === 0) continue;
        const open = chunk[0];
        const close = chunk[chunk.length - 1];
        const high = Math.max(...chunk, Math.round(Math.max(open, close) * (1 + Math.random() * 0.01)));
        const low = Math.min(...chunk, Math.round(Math.min(open, close) * (1 - Math.random() * 0.01)));
        candles.push({ open, high, low, close });
      }
      return candles;
    }

    updateCandle(stockId, prevPrice, newPrice) {
      if (!this._candles[stockId]) this._candles[stockId] = [];
      const candles = this._candles[stockId];
      if (candles.length === 0 || this._updateCounter % 3 === 0) {
        candles.push({
          open: prevPrice,
          high: Math.max(prevPrice, newPrice),
          low: Math.min(prevPrice, newPrice),
          close: newPrice
        });
        if (candles.length > 30) candles.shift();
      } else {
        const last = candles[candles.length - 1];
        last.close = newPrice;
        last.high = Math.max(last.high, newPrice);
        last.low = Math.min(last.low, newPrice);
      }
    }

    // =========================================================================
    // Getters & API Compatibility
    // =========================================================================

    getOilPrice() { return this._stocks.oil.currentPrice; }
    getSoulsPrice() { return this._stocks.souls.currentPrice; }
    getOilShares() { return this._shares.oil || 0; }
    getSoulsShares() { return this._shares.souls || 0; }
    getOilHistory() { return this._history.oil; }
    getSoulsHistory() { return this._history.souls; }
    getOilCostBasis() { return Math.round(this._costBasis.oil || 0); }
    getSoulsCostBasis() { return Math.round(this._costBasis.souls || 0); }
    getCurrentSoulMedian() { return getSoulMedianFromVariable(); }

    getPrice(stockId) {
      return this._stocks[stockId] ? this._stocks[stockId].currentPrice : 0;
    }

    getShares(stockId) {
      return this._shares[stockId] || 0;
    }

    getCostBasis(stockId) {
      return Math.round(this._costBasis[stockId] || 0);
    }

    getHistory(stockId) {
      return this._history[stockId] || [];
    }

    getCandles(stockId) {
      return this._candles[stockId] || [];
    }

    getStock(stockId) {
      return this._stocks[stockId];
    }

    getAllStocks() {
      return Object.values(this._stocks);
    }

    getOpenOrders() {
      return this._orders;
    }

    getOrderHistory() {
      return this._orderHistory;
    }

    getNews() {
      return this._news;
    }

    getNetWorth() {
      let stockValue = 0;
      for (const [id, stock] of Object.entries(this._stocks)) {
        stockValue += (this._shares[id] || 0) * stock.currentPrice;
      }
      let escrowGold = 0;
      for (const ord of this._orders) {
        if (ord.status === "pending" && ord.side === "buy" && ord.escrowGold) {
          escrowGold += ord.escrowGold;
        }
      }
      return getPlayerGoldInCents() + stockValue + escrowGold;
    }

    getNetWorthFormatted() {
      return formatMoney(this.getNetWorth());
    }

    getTotalStockValue() {
      let stockValue = 0;
      for (const [id, stock] of Object.entries(this._stocks)) {
        stockValue += (this._shares[id] || 0) * stock.currentPrice;
      }
      return stockValue;
    }

    checkBankruptcy() { }

    syncWithVariables() {
      if (oilSharesVariableId > 0) {
        const variableOilShares = getOilSharesFromVariable();
        if (variableOilShares !== this._shares.oil) {
          this._shares.oil = Math.max(0, variableOilShares);
          this._oilShares = this._shares.oil;
        }
      }
      if (soulSharesVariableId > 0) {
        const variableSoulShares = getSoulSharesFromVariable();
        if (variableSoulShares !== this._shares.souls) {
          this._shares.souls = Math.max(0, variableSoulShares);
          this._soulsShares = this._shares.souls;
        }
      }
    }

    _trainOnRealizedProfit(revenueInGold, costBasis, sharesHeld, sharesSold) {
      if (!window.SpecializationXP) return;
      const avgCost = sharesHeld > 0 ? (costBasis || 0) / sharesHeld : 0;
      const profit = revenueInGold - avgCost * sharesSold;
      if (profit > 0) {
        window.SpecializationXP.awardForValue('Stock Trading', profit);
      }
    }

    // =========================================================================
    // Trading Operations: Market Orders & Limit Orders
    // =========================================================================

    buyStock(stockId, shares) {
      if (shares <= 0 || !this._stocks[stockId]) return false;
      // A company cannot sell more of itself than it floated.
      if (shares > this.availableShares(stockId)) return false;
      const price = this._stocks[stockId].currentPrice;
      const costInGold = Math.round(shares * price);

      if (costInGold <= $gameParty.gold()) {
        $gameParty.loseGold(costInGold);
        this._shares[stockId] = (this._shares[stockId] || 0) + shares;
        this._costBasis[stockId] = (this._costBasis[stockId] || 0) + costInGold;

        this._pushPosition(stockId);

        this.recordTrade({
          stockId,
          side: "buy",
          type: "market",
          shares,
          price,
          total: costInGold,
          pnl: 0
        });

        return true;
      }
      return false;
    }

    sellStock(stockId, shares) {
      if (shares <= 0 || !this._stocks[stockId]) return false;
      const currentShares = this._shares[stockId] || 0;
      if (shares <= currentShares) {
        const price = this._stocks[stockId].currentPrice;
        const revenueInGold = Math.round(shares * price);
        $gameParty.gainGold(revenueInGold);

        const basis = this._costBasis[stockId] || 0;
        const avgCost = currentShares > 0 ? basis / currentShares : 0;
        const realizedPnl = Math.round(revenueInGold - (avgCost * shares));

        this._trainOnRealizedProfit(revenueInGold, basis, currentShares, shares);

        this._costBasis[stockId] = currentShares > 0
          ? basis * (1 - shares / currentShares)
          : 0;
        this._shares[stockId] -= shares;

        this._pushPosition(stockId);

        this.recordTrade({
          stockId,
          side: "sell",
          type: "market",
          shares,
          price,
          total: revenueInGold,
          pnl: realizedPnl
        });

        return true;
      }
      return false;
    }

    // Direct legacy methods
    buyOil(shares) { return this.buyStock("oil", shares); }
    sellOil(shares) { return this.sellStock("oil", shares); }
    buySouls(shares) { return this.buyStock("souls", shares); }
    sellSouls(shares) { return this.sellStock("souls", shares); }

    // Place Advanced Orders (Limit, Stop-Loss, Take-Profit)
    placeOrder({ stockId, side, type, shares, targetPrice }) {
      if (!this._stocks[stockId] || shares <= 0 || targetPrice <= 0) return { success: false, reason: "Invalid order parameters" };

      const orderId = "ORD_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 4);

      if (side === "buy") {
        if (shares > this.availableShares(stockId)) {
          return { success: false, reason: _smi18n('errors.noFloat') || "" };
        }
        // Escrow funds for limit buy
        const totalEscrow = Math.round(shares * targetPrice);
        if ($gameParty.gold() < totalEscrow) {
          return { success: false, reason: "Insufficient gold for limit order escrow" };
        }
        $gameParty.loseGold(totalEscrow);

        const order = {
          id: orderId,
          stockId,
          side: "buy",
          type, // limit
          shares,
          targetPrice: Math.round(targetPrice),
          escrowGold: totalEscrow,
          escrowShares: 0,
          createdAt: Date.now(),
          status: "pending"
        };
        this._orders.push(order);
        return { success: true, order };
      } else {
        // Escrow shares for limit / stop / take-profit sell
        const availableShares = this._shares[stockId] || 0;
        if (availableShares < shares) {
          return { success: false, reason: "Insufficient shares available" };
        }
        this._shares[stockId] -= shares;

        this._pushPosition(stockId);

        const order = {
          id: orderId,
          stockId,
          side: "sell",
          type, // limit, stop_loss, take_profit
          shares,
          targetPrice: Math.round(targetPrice),
          escrowGold: 0,
          escrowShares: shares,
          createdAt: Date.now(),
          status: "pending"
        };
        this._orders.push(order);
        return { success: true, order };
      }
    }

    cancelOrder(orderId) {
      const idx = this._orders.findIndex(o => o.id === orderId && o.status === "pending");
      if (idx === -1) return false;

      const order = this._orders[idx];
      order.status = "cancelled";

      // Refund escrow
      if (order.side === "buy" && order.escrowGold > 0) {
        $gameParty.gainGold(order.escrowGold);
      } else if (order.side === "sell" && order.escrowShares > 0) {
        this._shares[order.stockId] = (this._shares[order.stockId] || 0) + order.escrowShares;
        this._pushPosition(order.stockId);
      }

      this._orders.splice(idx, 1);
      this._orderHistory.unshift({ ...order, closedAt: Date.now() });
      return true;
    }

    evaluateOpenOrders() {
      if (this._orders.length === 0) return;

      const remainingOrders = [];

      for (const order of this._orders) {
        if (order.status !== "pending") continue;

        const currentPrice = this._stocks[order.stockId].currentPrice;
        let shouldTrigger = false;

        if (order.side === "buy") {
          // Buy Limit: execute when market price is at or below target
          if (order.type === "limit" && currentPrice <= order.targetPrice) {
            shouldTrigger = true;
          }
        } else {
          // Sell Limit: execute when market price is at or above target
          if (order.type === "limit" && currentPrice >= order.targetPrice) {
            shouldTrigger = true;
          } else if (order.type === "take_profit" && currentPrice >= order.targetPrice) {
            shouldTrigger = true;
          } else if (order.type === "stop_loss" && currentPrice <= order.targetPrice) {
            shouldTrigger = true;
          }
        }

        if (shouldTrigger) {
          this.executeOrderFill(order, currentPrice);
        } else {
          remainingOrders.push(order);
        }
      }

      this._orders = remainingOrders;
    }

    executeOrderFill(order, fillPrice) {
      order.status = "filled";
      order.fillPrice = fillPrice;
      order.filledAt = Date.now();

      if (order.side === "buy") {
        const actualCost = Math.round(order.shares * fillPrice);
        const difference = order.escrowGold - actualCost;
        if (difference > 0) {
          $gameParty.gainGold(difference); // Refund favorable price improvement
        }

        this._shares[order.stockId] = (this._shares[order.stockId] || 0) + order.shares;
        this._costBasis[order.stockId] = (this._costBasis[order.stockId] || 0) + actualCost;

        this._pushPosition(order.stockId);

        this.recordTrade({
          stockId: order.stockId,
          side: "buy",
          type: order.type,
          shares: order.shares,
          price: fillPrice,
          total: actualCost,
          pnl: 0,
          orderId: order.id
        });
      } else {
        const revenue = Math.round(order.shares * fillPrice);
        $gameParty.gainGold(revenue);

        const currentShares = (this._shares[order.stockId] || 0) + order.shares;
        const basis = this._costBasis[order.stockId] || 0;
        const avgCost = currentShares > 0 ? basis / currentShares : 0;
        const realizedPnl = Math.round(revenue - (avgCost * order.shares));

        this._trainOnRealizedProfit(revenue, basis, currentShares, order.shares);

        this._costBasis[order.stockId] = currentShares > 0
          ? basis * (1 - order.shares / currentShares)
          : 0;

        this.recordTrade({
          stockId: order.stockId,
          side: "sell",
          type: order.type,
          shares: order.shares,
          price: fillPrice,
          total: revenue,
          pnl: realizedPnl,
          orderId: order.id
        });
      }

      this._orderHistory.unshift(order);
      if (this._orderHistory.length > 100) this._orderHistory.pop();

      // Trigger sound feedback if available
      try {
        if (typeof SoundManager !== "undefined" && SoundManager.playShop) {
          SoundManager.playShop();
        }
      } catch (e) {}
    }

    recordTrade(trade) {
      trade.id = "TRD_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 3);
      trade.time = Date.now();
      this._orderHistory.unshift(trade);
      if (this._orderHistory.length > 100) this._orderHistory.pop();
    }

    // =========================================================================
    // News & Market Sentiment
    // =========================================================================

    // A headline pool for a listing: its own if the data names one, else its
    // sector's, else the market-wide bank. Every line may name the company.
    _headlinePool(stockId) {
      const def = STOCKS_CONFIG[stockId];
      if (!def) return [];
      const params = { company: def.name, ticker: def.symbol };
      const keys = [];
      if (def.commodity) keys.push('headlines.' + stockId);
      else {
        keys.push('headlines.company.' + String(def.companyKey || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase());
        keys.push('headlines.sector.' + String(def.sectorKey || 'misc').toLowerCase().replace(/[^a-z0-9]/g, ''));
        keys.push('headlines.sector.misc');
      }
      for (const key of keys) {
        if (typeof T !== "function" || !T.has || !T.has('StockMarket.' + key)) continue;
        const pool = T.pool('StockMarket.' + key);
        if (pool && pool.length) {
          return pool.map(line => String(line)
            .replace(/\{company\}/g, params.company)
            .replace(/\{ticker\}/g, params.ticker));
        }
      }
      return [];
    }

    _headlineFor(stockId) {
      const pool = this._headlinePool(stockId);
      if (!pool.length) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // The ticker tape the terminal opens on: one line from each of a handful of
    // listings, the two commodities first.
    generateInitialNews() {
      this._news = [];
      const ids = Object.keys(STOCKS_CONFIG).sort((a, b) => {
        const ca = STOCKS_CONFIG[a].commodity ? 0 : 1;
        const cb = STOCKS_CONFIG[b].commodity ? 0 : 1;
        return ca - cb;
      }).slice(0, 4);

      ids.forEach((id, index) => {
        const text = this._headlineFor(id);
        if (!text) return;
        const minutes = index * 3;
        this._news.push({
          time: minutes === 0
            ? (_smi18n('news.justNow') || '')
            : (_smi18n('news.minutesAgo', { n: minutes }) || ''),
          tag: STOCKS_CONFIG[id].symbol,
          text
        });
      });
    }

    // The wire used to pick a listing uniformly at random and print a line
    // about it every fifteen ticks, unrelated to what any price had done: a
    // tape that moves for reasons and a wire that reports at random, on the
    // same screen. It reports the tape now - the biggest mover of the last
    // tick, with the move itself stated - so a player can read the news and
    // learn something about the prices instead of only about the flavour.
    generateRandomHeadline() {
      const stocks = Object.keys(STOCKS_CONFIG);
      if (!stocks.length) return;
      const chosen = this._biggestMover(stocks);
      const text = this._headlineFor(chosen);
      if (!text) return;

      const move = (this._lastPctMove && this._lastPctMove[chosen]) || 0;
      const note = Math.abs(move) >= 0.005
        ? _smi18n('news.moveNote', {
            sign: move > 0 ? '+' : '-',
            pct: Math.abs(move * 100).toFixed(1),
          })
        : '';

      this._news.unshift({
        time: _smi18n('news.justNow') || '',
        tag: STOCKS_CONFIG[chosen].symbol,
        text: note ? note + ' ' + text : text
      });
      if (this._news.length > 20) this._news.pop();
    }

    // Whichever listing moved furthest last tick, with a random pick among the
    // top few so a single volatile line does not own the wire, and a plain
    // random pick on a tick where nothing moved at all.
    _biggestMover(stocks) {
      const moved = stocks
        .map(id => ({ id, size: Math.abs((this._lastPctMove && this._lastPctMove[id]) || 0) }))
        .filter(x => x.size > 0)
        .sort((a, b) => b.size - a.size)
        .slice(0, 3);
      if (!moved.length) return stocks[Math.floor(Math.random() * stocks.length)];
      return moved[Math.floor(Math.random() * moved.length)].id;
    }

    // What the world outside the terminal is doing to it. NPCWorldWeb's town
    // mood was already priced in; a continental outbreak was not, even though
    // the same outbreak moves NPC mood, hiring and shop traffic. Every active
    // epidemic weighs on the market by how much of the continent it is running
    // through, floored so the worst plague in the book is a bad year and not a
    // permanent zero.
    _epidemicDrag() {
      const epi = window.EpidemicSystem;
      if (!epi || typeof epi.active !== 'function') return 0;
      try {
        let infected = 0;
        for (const outbreak of epi.active() || []) {
          for (const key of Object.keys(outbreak.sites || {})) {
            infected += (outbreak.sites[key] || {}).infected || 0;
          }
        }
        if (infected <= 0) return 0;
        return -Math.min(EPIDEMIC_DRAG_MAX, infected / EPIDEMIC_DRAG_SCALE);
      } catch (e) { return 0; }
    }

    // Debug / Sandbox hooks
    pumpMarket() {
      for (const [id, stock] of Object.entries(this._stocks)) {
        stock.currentPrice = Math.round(stock.currentPrice * (1.15 + Math.random() * 0.15));
        this._history[id].push(stock.currentPrice);
        this._quoteToRegister(id, stock.currentPrice);
      }
      this.syncWorldMarket();
    }

    crashMarket() {
      for (const [id, stock] of Object.entries(this._stocks)) {
        stock.currentPrice = Math.max(minimumPrice, Math.round(stock.currentPrice * (0.75 - Math.random() * 0.15)));
        this._history[id].push(stock.currentPrice);
        this._quoteToRegister(id, stock.currentPrice);
      }
      this.syncWorldMarket();
    }
  }


  //=============================================================================
  // Game_System Integration
  //=============================================================================

  const _Game_System_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function () {
    _Game_System_initialize.call(this);
    this.stockMarket = new StockMarketSystem();
  };

  const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;
  Game_System.prototype.onAfterLoad = function () {
    if (_Game_System_onAfterLoad) _Game_System_onAfterLoad.call(this);
    const saved = this.stockMarket;
    this.stockMarket = new StockMarketSystem();
    this.stockMarket.fromJSON(saved);
  };

  const _SM_DataManager_makeSaveContents = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    if ($gameSystem && $gameSystem.stockMarket && $gameSystem.stockMarket.syncWorldMarket) {
      $gameSystem.stockMarket.syncWorldMarket();
    }
    return _SM_DataManager_makeSaveContents.call(this);
  };

  const _SceneManager_updateScene = SceneManager.updateScene;
  SceneManager.updateScene = function () {
    _SceneManager_updateScene.call(this);
    if (
      this._scene &&
      $gameSystem &&
      $gameSystem.stockMarket &&
      $gameSystem.stockMarket.update &&
      $gameSystem.stockMarket.update() &&
      this._scene instanceof Scene_StockMarket
    ) {
      this._scene.refreshUIStock();
    }
  };

  const _Game_Variables_setValue = Game_Variables.prototype.setValue;
  Game_Variables.prototype.setValue = function (variableId, value) {
    _Game_Variables_setValue.call(this, variableId, value);
    if ($gameSystem && $gameSystem.stockMarket) {
      if (variableId === oilSharesVariableId || variableId === soulSharesVariableId) {
        $gameSystem.stockMarket.syncWithVariables();
      }
    }
  };


  // ============================================================================
  // HypernetStockApp Definition
  // ============================================================================
  window.HypernetStockApp = {
    appInstance: null,
    win: null,
    launch: function(params) {
      if (!window.HypernetWindowManager) return;
      
      const appTitle = "Stock Market";
      
      if (!this.win || !document.getElementById('app-stock-market')) {
        this.win = window.HypernetWindowManager.createWindow({
          id: 'app-stock-market',
          title: appTitle,
          icon: 229,
          width: 1040,
          height: 680,
          contentHTML: '<div id="stock-market-content" style="width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--xp-bg); overflow: hidden"></div>'
        });

        this.appInstance = new Scene_StockMarket();
        this.appInstance._isAppMode = true;
        this.appInstance.create();
        
        this.win.addEventListener('hypernet-closed', () => {
          if (this.appInstance) {
            this.appInstance.terminate();
            this.appInstance = null;
          }
          this.win = null;
        });
      } else {
        window.HypernetWindowManager.bringToFront(this.win);
      }
    },
    update: function() {
      if (this.appInstance && this.win) {
        if ($gameSystem && $gameSystem.stockMarket && $gameSystem.stockMarket.update()) {
          this.appInstance.refreshUIStock();
        }
        if (this.win.classList.contains('active')) {
          this.appInstance.update();
        }
      }
    }
  };

  // ============================================================================
  // Scene_StockMarket (Revamped Terminal UI)
  // ============================================================================

  class Scene_StockMarket extends Scene_MenuBase {
    constructor() {
      super();
      this._selectedStockId = 'oil';
      this._tradeSide = 'buy'; // 'buy' | 'sell'
      this._orderType = 'market'; // 'market' | 'limit' | 'stop_loss' | 'take_profit'
      this._chartMode = 'line'; // 'line' | 'candle'
      this._bottomTab = 'holdings'; // 'holdings' | 'orders' | 'history' | 'news'
      this._inputShares = 1;
      this._customTargetPrice = 0;
      this._prevPrices = {};
      this._toastMessage = null;
      this._toastTimer = 0;
    }

    create() {
      super.create();
      if (window.SpecBadge) window.SpecBadge.show('Stock Trading');

      this.createHelpWindow();
      if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }

      const stockMarket = $gameSystem.stockMarket;
      // Pick up any company floated since this market was built, and re-read the
      // party's positions out of the share register.
      stockMarket.refreshListings();
      if (!stockMarket.getStock(this._selectedStockId)) {
        const first = stockMarket.getAllStocks()[0];
        if (first) this._selectedStockId = first.id;
      }
      for (const stock of stockMarket.getAllStocks()) {
        this._prevPrices[stock.id] = stock.currentPrice;
      }
      this._customTargetPrice = stockMarket.getPrice(this._selectedStockId);

      this.initUIStockDOM();
      this.refreshUIStock();
    }

    update() {
      if (!this._isAppMode) {
        super.update();
        this.updateKeyboardShortcuts();
        this.updateStockFocusRing();
      }
      if (this._toastTimer > 0) {
        this._toastTimer--;
        if (this._toastTimer <= 0) {
          const toast = document.getElementById("sm-toast-notification");
          if (toast) toast.style.display = "none";
        }
      }
    }

    terminate() {
      if (window.CCNav) window.CCNav.detach(this);
      const container = document.getElementById("stock-container");
      if (container) container.remove();
      if (!this._isAppMode) super.terminate();
    }

    showToast(text, isError = false) {
      const toast = document.getElementById("sm-toast-notification");
      if (toast) {
        toast.textContent = text;
        toast.style.background = isError ? "linear-gradient(135deg, var(--xp-red-2), #e74c3c)" : "linear-gradient(135deg, var(--xp-green), #2ecc71)";
        toast.style.display = "block";
        this._toastTimer = 180;
      }
    }

    initUIStockDOM() {
      if (this._isAppMode) {
        const parent = document.getElementById("stock-market-content");
        if (parent) {
          parent.innerHTML = '';
          const container = document.createElement("div");
          container.id = "stock-container";
          container.style.width = "100%";
          container.style.height = "100%";
          container.style.display = "flex";
          container.style.flexDirection = "column";
          parent.appendChild(container);
          return;
        }
      }

      let container = document.getElementById("stock-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "stock-container";
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "100vw";
        container.style.height = "100vh";
        container.style.zIndex = "50";
        document.body.appendChild(container);
      }
    }

    refreshUIStock() {
      const container = document.getElementById("stock-container");
      if (!container) return;

      const sm = $gameSystem.stockMarket;
      const allStocks = sm.getAllStocks();
      const currentStock = sm.getStock(this._selectedStockId) || allStocks[0];
      const stockPrice = currentStock.currentPrice;
      const prevPrice = this._prevPrices[currentStock.id] || stockPrice;
      const deltaPrice = stockPrice - prevPrice;
      const pctChange = prevPrice > 0 ? (deltaPrice / prevPrice) * 100 : 0;
      const isUp = deltaPrice >= 0;

      // Make sure target price stays populated
      if (!this._customTargetPrice || this._customTargetPrice <= 0) {
        this._customTargetPrice = stockPrice;
      }

      // 1. Build Watchlist HTML (Left Column)
      let watchlistHTML = "";
      for (const stock of allStocks) {
        const price = stock.currentPrice;
        const prev = this._prevPrices[stock.id] || price;
        const delta = price - prev;
        const pct = prev > 0 ? (delta / prev) * 100 : 0;
        const up = delta >= 0;
        const selectedClass = stock.id === this._selectedStockId ? "sm-stock-card-selected" : "";
        const sharesOwned = sm.getShares(stock.id);

        watchlistHTML += `
          <div class="sm-stock-card focusable ${selectedClass}" data-stock-id="${stock.id}" tabindex="0">
            <div style="display:flex; justify-content:space-between; align-items:center">
              <div>
                <span class="sm-ticker-badge">${stock.symbol}</span>
                ${stock.name && stock.name !== stock.symbol ? `<span style="font-weight:bold; font-size:13px; color:#1a2a3a; margin-left:4px">${stock.name}</span>` : ''}
              </div>
              <div style="text-align:right">
                <div style="font-weight:bold; font-size:14px; color:var(--xp-blue-dark)">${formatMoney(price)}</div>
                <div style="font-size:11px; font-weight:bold; color:${up ? '#27ae60' : '#c0392b'}">
                  ${up ? '▲ +' : '▼ '}${pct.toFixed(2)}%
                </div>
              </div>
            </div>
            ${sharesOwned > 0 ? `<div style="font-size:11px; color:var(--xp-text-muted); margin-top:3px; display:flex; justify-content:space-between"><span>Holding: <b>${sharesOwned}</b> shares</span><span>${formatMoney(sharesOwned * price)}</span></div>` : ''}
          </div>
        `;
      }

      // 2. Build Order Book / Market Depth simulation
      const spread = Math.max(10, Math.round(stockPrice * 0.002));
      const asks = [
        { price: stockPrice + spread * 3, size: Math.floor(Math.random() * 80 + 20) },
        { price: stockPrice + spread * 2, size: Math.floor(Math.random() * 120 + 40) },
        { price: stockPrice + spread * 1, size: Math.floor(Math.random() * 190 + 80) }
      ];
      const bids = [
        { price: stockPrice - spread * 1, size: Math.floor(Math.random() * 200 + 70) },
        { price: stockPrice - spread * 2, size: Math.floor(Math.random() * 130 + 30) },
        { price: stockPrice - spread * 3, size: Math.floor(Math.random() * 90 + 15) }
      ];

      let orderBookHTML = `
        <div class="sm-orderbook-box">
          <div style="font-size:11px; font-weight:bold; color:var(--xp-ink-5); margin-bottom:4px; display:flex; justify-content:space-between">
            <span>LIVE ORDER BOOK</span>
            <span style="color:var(--xp-ink-faint)">SPREAD: ${formatMoney(spread * 2)}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px; font-size:11px">
            ${asks.reverse().map(a => `<div style="display:flex; justify-content:space-between; color:var(--xp-red-2); background:rgba(231,76,60,0.08); padding:1px 4px; border-radius:2px"><span>${formatMoney(a.price)}</span><span>${a.size} sh</span></div>`).join('')}
            <div style="display:flex; justify-content:space-between; font-weight:bold; padding:2px 4px; background:#eef4fb; border-top:1px dashed var(--xp-border); border-bottom:1px dashed var(--xp-border)">
              <span style="color:var(--xp-blue-dark)">MID: ${formatMoney(stockPrice)}</span>
              <span>MARKET</span>
            </div>
            ${bids.map(b => `<div style="display:flex; justify-content:space-between; color:var(--xp-green); background:rgba(39,174,96,0.08); padding:1px 4px; border-radius:2px"><span>${formatMoney(b.price)}</span><span>${b.size} sh</span></div>`).join('')}
          </div>
        </div>
      `;

      // 3. Trade Input calculations
      const sharesHeld = sm.getShares(this._selectedStockId);
      const playerGold = getPlayerGoldInCents();
      const unitTargetPrice = this._orderType === 'market' ? stockPrice : this._customTargetPrice;
      const totalEstimated = Math.round(this._inputShares * unitTargetPrice);
      const isBuy = this._tradeSide === 'buy';
      let isValid = true;
      let validationMsg = "";

      if (isBuy) {
        if (totalEstimated > playerGold) {
          isValid = false;
          validationMsg = "Insufficient liquid gold";
        }
      } else {
        if (this._inputShares > sharesHeld) {
          isValid = false;
          validationMsg = `Exceeds owned shares (${sharesHeld})`;
        }
      }

      // 4. Build Bottom Tab Content
      let bottomContentHTML = "";
      if (this._bottomTab === 'holdings') {
        const holdingsRows = allStocks.map(stk => {
          const qty = sm.getShares(stk.id);
          const basis = sm.getCostBasis(stk.id);
          const avgCost = qty > 0 ? Math.round(basis / qty) : 0;
          const currentVal = qty * stk.currentPrice;
          const pnl = qty > 0 ? (currentVal - basis) : 0;
          const pnlPct = basis > 0 ? ((currentVal - basis) / basis) * 100 : 0;
          const pnlColor = pnl >= 0 ? '#27ae60' : '#c0392b';

          return `
            <tr style="border-bottom:1px solid var(--xp-gray); ${qty > 0 ? 'background:var(--xp-white);' : 'opacity:0.6'}">
              <td style="padding:6px 8px; font-weight:bold; color:var(--xp-blue-dark)">${stk.symbol}</td>
              <td style="padding:6px 8px">${stk.name}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:bold">${qty}</td>
              <td style="padding:6px 8px; text-align:right">${avgCost > 0 ? formatMoney(avgCost) : '-'}</td>
              <td style="padding:6px 8px; text-align:right">${formatMoney(stk.currentPrice)}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:bold">${formatMoney(currentVal)}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:bold; color:${pnlColor}">
                ${qty > 0 ? `${pnl >= 0 ? '+' : ''}${formatMoney(pnl)} (${pnlPct.toFixed(1)}%)` : '-'}
              </td>
              <td style="padding:6px 8px; text-align:center">
                <button class="sm-btn-small focusable" data-action="quick-trade" data-stock="${stk.id}">Select</button>
                ${qty > 0 ? `<button class="sm-btn-small focusable" style="color:var(--xp-red-2)" data-action="quick-sell-all" data-stock="${stk.id}">Sell All</button>` : ''}
              </td>
            </tr>
          `;
        }).join('');

        bottomContentHTML = `
          <table style="width:100%; border-collapse:collapse; font-size:12px">
            <thead>
              <tr style="background:var(--xp-row-tint); border-bottom:2px solid var(--xp-border); color:var(--xp-blue-dark); text-align:left">
                <th style="padding:6px 8px">Symbol</th>
                <th style="padding:6px 8px">Asset Name</th>
                <th style="padding:6px 8px; text-align:right">Shares</th>
                <th style="padding:6px 8px; text-align:right">Avg Cost</th>
                <th style="padding:6px 8px; text-align:right">Market Price</th>
                <th style="padding:6px 8px; text-align:right">Total Value</th>
                <th style="padding:6px 8px; text-align:right">Unrealized P&L</th>
                <th style="padding:6px 8px; text-align:center">Actions</th>
              </tr>
            </thead>
            <tbody>${holdingsRows}</tbody>
          </table>
        `;
      } else if (this._bottomTab === 'orders') {
        const openOrders = sm.getOpenOrders();
        if (openOrders.length === 0) {
          bottomContentHTML = `<div style="padding:24px; text-align:center; color:var(--xp-ink-faint); font-size:13px">No active limit or stop orders. Place limit orders above to trade automatically at target prices.</div>`;
        } else {
          const orderRows = openOrders.map(ord => {
            const stock = sm.getStock(ord.stockId) || { symbol: ord.stockId };
            const curP = sm.getPrice(ord.stockId);
            const dist = curP > 0 ? (((curP - ord.targetPrice) / curP) * 100).toFixed(1) : 0;
            const sideColor = ord.side === 'buy' ? '#27ae60' : '#c0392b';

            return `
              <tr style="border-bottom:1px solid var(--xp-gray); background:var(--xp-white)">
                <td style="padding:6px 8px; font-weight:bold; color:var(--xp-blue-dark)">${ord.id}</td>
                <td style="padding:6px 8px; font-weight:bold">${stock.symbol}</td>
                <td style="padding:6px 8px; font-weight:bold; color:${sideColor}; text-transform:uppercase">${ord.side} ${ord.type.replace('_', ' ')}</td>
                <td style="padding:6px 8px; text-align:right">${ord.shares}</td>
                <td style="padding:6px 8px; text-align:right; font-weight:bold">${formatMoney(ord.targetPrice)}</td>
                <td style="padding:6px 8px; text-align:right">${formatMoney(curP)}</td>
                <td style="padding:6px 8px; text-align:right; color:var(--xp-text-muted)">${dist}% away</td>
                <td style="padding:6px 8px; text-align:right">${ord.escrowGold > 0 ? `Escrow: ${formatMoney(ord.escrowGold)}` : `${ord.escrowShares} sh escrowed`}</td>
                <td style="padding:6px 8px; text-align:center">
                  <button class="sm-btn-small focusable" style="color:var(--xp-red-2)" data-action="cancel-order" data-order-id="${ord.id}">Cancel</button>
                </td>
              </tr>
            `;
          }).join('');

          bottomContentHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:12px">
              <thead>
                <tr style="background:var(--xp-row-tint); border-bottom:2px solid var(--xp-border); color:var(--xp-blue-dark); text-align:left">
                  <th style="padding:6px 8px">Order ID</th>
                  <th style="padding:6px 8px">Symbol</th>
                  <th style="padding:6px 8px">Side & Type</th>
                  <th style="padding:6px 8px; text-align:right">Quantity</th>
                  <th style="padding:6px 8px; text-align:right">Target Price</th>
                  <th style="padding:6px 8px; text-align:right">Market Price</th>
                  <th style="padding:6px 8px; text-align:right">Distance</th>
                  <th style="padding:6px 8px; text-align:right">Held in Escrow</th>
                  <th style="padding:6px 8px; text-align:center">Action</th>
                </tr>
              </thead>
              <tbody>${orderRows}</tbody>
            </table>
          `;
        }
      } else if (this._bottomTab === 'history') {
        const historyList = sm.getOrderHistory();
        if (historyList.length === 0) {
          bottomContentHTML = `<div style="padding:24px; text-align:center; color:var(--xp-ink-faint); font-size:13px">No trading history recorded for this session.</div>`;
        } else {
          const histRows = historyList.slice(0, 30).map(t => {
            const stock = sm.getStock(t.stockId) || { symbol: t.stockId };
            const sideColor = t.side === 'buy' ? '#27ae60' : '#c0392b';
            const pnlColor = (t.pnl || 0) >= 0 ? '#27ae60' : '#c0392b';
            const timeStr = new Date(t.time || t.filledAt || Date.now()).toLocaleTimeString();

            return `
              <tr style="border-bottom:1px solid var(--xp-gray); background:var(--xp-white)">
                <td style="padding:5px 8px; color:var(--xp-ink-soft)">${timeStr}</td>
                <td style="padding:5px 8px; font-weight:bold">${stock.symbol}</td>
                <td style="padding:5px 8px; font-weight:bold; color:${sideColor}; text-transform:uppercase">${t.side} (${t.type || 'market'})</td>
                <td style="padding:5px 8px; text-align:right">${t.shares} sh</td>
                <td style="padding:5px 8px; text-align:right">${formatMoney(t.price || t.fillPrice || 0)}</td>
                <td style="padding:5px 8px; text-align:right; font-weight:bold">${formatMoney(t.total || ((t.shares || 0) * (t.fillPrice || 0)))}</td>
                <td style="padding:5px 8px; text-align:right; font-weight:bold; color:${pnlColor}">
                  ${t.side === 'sell' && t.pnl !== undefined ? `${t.pnl >= 0 ? '+' : ''}${formatMoney(t.pnl)}` : '-'}
                </td>
                <td style="padding:5px 8px; text-align:center"><span style="color:var(--xp-green); font-size:11px; font-weight:bold">FILLED</span></td>
              </tr>
            `;
          }).join('');

          bottomContentHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:12px">
              <thead>
                <tr style="background:var(--xp-row-tint); border-bottom:2px solid var(--xp-border); color:var(--xp-blue-dark); text-align:left">
                  <th style="padding:6px 8px">Time</th>
                  <th style="padding:6px 8px">Symbol</th>
                  <th style="padding:6px 8px">Action</th>
                  <th style="padding:6px 8px; text-align:right">Quantity</th>
                  <th style="padding:6px 8px; text-align:right">Execution Price</th>
                  <th style="padding:6px 8px; text-align:right">Total Volume</th>
                  <th style="padding:6px 8px; text-align:right">Realized Gain</th>
                  <th style="padding:6px 8px; text-align:center">Status</th>
                </tr>
              </thead>
              <tbody>${histRows}</tbody>
            </table>
          `;
        }
      } else if (this._bottomTab === 'news') {
        const newsItems = sm.getNews();
        bottomContentHTML = `
          <div style="display:flex; flex-direction:column; gap:6px; padding:6px">
            ${newsItems.map(n => `
              <div style="background:var(--xp-white); border:1px solid var(--xp-disabled); padding:8px 12px; border-radius:3px; display:flex; gap:10px; align-items:center">
                <span class="sm-ticker-badge">${n.tag}</span>
                <span style="font-size:11px; color:var(--xp-ink-faint); width:60px">${n.time}</span>
                <span style="font-size:13px; color:var(--xp-ink-3); flex:1">${n.text}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      // 5. Render Container Content
      container.innerHTML = `
        <style>
          #stock-container {
            font-family: 'Tahoma', 'Segoe UI', sans-serif !important;
            box-sizing: border-box;
            background: var(--xp-bg);
            color: var(--xp-ink);
            user-select: none;
          }
          #stock-container * { box-sizing: border-box; font-family: inherit; }
          .sm-header-bar {
            background: linear-gradient(180deg, var(--xp-navy-7) 0%, var(--xp-navy-8) 100%);
            color: var(--xp-white);
            padding: 8px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--xp-navy-6);
            flex-shrink: 0;
          }
          .sm-stat-pill {
            background: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.25);
            padding: 4px 10px;
            border-radius: 3px;
            display: flex;
            flex-direction: column;
            text-align: right;
          }
          .sm-stock-card {
            background: var(--xp-white);
            border: 1px solid var(--xp-border);
            border-radius: 3px;
            padding: 8px 10px;
            margin-bottom: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .sm-stock-card:hover {
            border-color: var(--xp-navy-7);
            background: var(--xp-row-tint-2);
          }
          .sm-stock-card-selected {
            border: 2px solid var(--xp-navy-7) !important;
            background: #eaf2fb !important;
            box-shadow: 0 0 6px rgba(11,83,148,0.3);
          }
          .sm-ticker-badge {
            background: var(--xp-navy-7);
            color: var(--xp-white);
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 2px;
            letter-spacing: 0.5px;
          }
          .sm-chart-box {
            background: var(--xp-white);
            border: 1px solid var(--xp-border);
            border-radius: 3px;
            display: flex;
            flex-direction: column;
            height: 230px;
            position: relative;
          }
          .sm-orderbook-box {
            background: var(--xp-near-white);
            border: 1px solid var(--xp-silver);
            border-radius: 3px;
            padding: 6px;
            margin-top: 6px;
          }
          .sm-tab-btn {
            padding: 5px 12px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            background: var(--xp-bg);
            border: 1px solid var(--xp-border);
            border-bottom: none;
            border-top-left-radius: 3px;
            border-top-right-radius: 3px;
            margin-right: 3px;
            color: var(--xp-ink-4);
          }
          .sm-tab-btn.active {
            background: var(--xp-white);
            border-bottom: 1px solid var(--xp-white);
            margin-bottom: -1px;
            color: var(--xp-navy-7);
          }
          .sm-action-btn {
            white-space: nowrap;
            background: var(--xp-bg);
            border: 1px solid var(--xp-border);
            border-radius: 2px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 11px;
            font-weight: bold;
          }
          .sm-action-btn:hover { background: var(--xp-row-tint); }
          .sm-btn-small {
            white-space: nowrap;
            background: var(--xp-white);
            border: 1px solid var(--xp-border);
            border-radius: 2px;
            padding: 2px 6px;
            font-size: 11px;
            cursor: pointer;
            font-weight: bold;
            margin: 0 2px;
          }
          .sm-btn-small:hover { background: var(--xp-row-tint); }
          .sm-order-type-btn {
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            padding: 5px 2px;
            font-size: 11px;
            font-weight: bold;
            border: 1px solid var(--xp-border);
            background: var(--xp-gray-light);
            cursor: pointer;
            text-align: center;
          }
          .sm-order-type-btn.active {
            background: var(--xp-navy-7);
            color: var(--xp-white);
            border-color: var(--xp-navy-7);
          }
        </style>

        <!-- Notification Toast -->
        <div id="sm-toast-notification" style="display:none; position:absolute; top:52px; right:20px; z-index:999; color:var(--xp-white); padding:8px 16px; border-radius:4px; font-weight:bold; font-size:13px; box-shadow:0 4px 12px rgba(0,0,0,0.3)"></div>

        <!-- Top Header Bar -->
        <div class="sm-header-bar">
          <div style="display:flex; align-items:center; gap:12px">
            <span style="font-size:18px; font-weight:bold; letter-spacing:1px; color:var(--xp-white)">STOCK MARKET</span>
            <span style="background:var(--xp-green); color:var(--xp-white); font-size:10px; font-weight:bold; padding:2px 8px; border-radius:10px">● LIVE MARKET OPEN</span>
            <span style="font-size:12px; color:var(--xp-sky-4)">Session Ticks: ${sm._updateCounter}</span>
          </div>
          <div style="display:flex; gap:10px">
            <div class="sm-stat-pill">
              <span style="font-size:10px; color:var(--xp-sky-4)">LIQUID GOLD</span>
              <span style="font-size:14px; font-weight:bold; color:var(--xp-white)">${goldToEurosForDisplay(playerGold)}</span>
            </div>
            <div class="sm-stat-pill">
              <span style="font-size:10px; color:var(--xp-sky-4)">PORTFOLIO STOCKS</span>
              <span style="font-size:14px; font-weight:bold; color:var(--xp-white)">${formatMoney(sm.getTotalStockValue())}</span>
            </div>
            <div class="sm-stat-pill">
              <span style="font-size:10px; color:var(--xp-sky-4)">NET WORTH</span>
              <span style="font-size:14px; font-weight:bold; color:#2ecc71">${sm.getNetWorthFormatted()}</span>
            </div>
          </div>
        </div>

        <!-- Main Body: 3-column Layout -->
        <div style="flex:1; display:flex; gap:8px; padding:8px; min-height:0; overflow:hidden">
          
          <!-- Column 1: Watchlist (Left) -->
          <div style="width:260px; background:var(--xp-white); border:1px solid var(--xp-border); border-radius:3px; display:flex; flex-direction:column; padding:8px">
            <div style="font-size:13px; font-weight:bold; color:var(--xp-blue-dark); border-bottom:1px solid var(--xp-border); padding-bottom:4px; margin-bottom:8px; display:flex; justify-content:space-between">
              <span>MARKET WATCHLIST</span>
              <span style="font-size:11px; color:var(--xp-ink-soft)">${_smi18n('ui.assetCount', { n: allStocks.length }) || allStocks.length}</span>
            </div>
            <div style="flex:1; overflow-y:auto; padding-right:2px">
              ${watchlistHTML}
            </div>
            <!-- Key Stats Box -->
            <div style="background:var(--xp-row-tint-2); border:1px solid var(--xp-steel-3); padding:6px 8px; border-radius:3px; margin-top:6px; font-size:11px">
              <div style="font-weight:bold; color:var(--xp-blue-dark); margin-bottom:3px">${currentStock.symbol} ASSET PROFILE</div>
              <div style="color:var(--xp-text-muted); line-height:1.3; margin-bottom:4px">${currentStock.description}</div>
              <div style="display:flex; justify-content:space-between"><span>${_smi18n('ui.category') || ''}</span><b>${currentStock.category}</b></div>
              <div style="display:flex; justify-content:space-between"><span>${_smi18n('ui.volatility') || ''}</span><b>${(currentStock.volatility * 100).toFixed(0)}%</b></div>
              ${currentStock.totalShares ? `
              <div style="display:flex; justify-content:space-between"><span>${_smi18n('ui.float') || ''}</span><b>${currentStock.totalShares.toLocaleString()}</b></div>
              <div style="display:flex; justify-content:space-between"><span>${_smi18n('ui.ownership') || ''}</span><b>${sm.ownershipPct(currentStock.id).toFixed(1)}%</b></div>` : ''}
            </div>
          </div>

          <!-- Column 2: Chart & Market Depth (Center) -->
          <div style="flex:1; display:flex; flex-direction:column; gap:8px; min-width:0">
            
            <!-- Chart Container -->
            <div class="sm-chart-box">
              <div style="padding:6px 10px; background:var(--xp-row-tint-2); border-bottom:1px solid var(--xp-silver-3); display:flex; justify-content:space-between; align-items:center">
                <div>
                  <span style="font-size:15px; font-weight:bold; color:var(--xp-blue-dark)">${currentStock.name}</span>
                  <span class="sm-ticker-badge" style="margin-left:6px">${currentStock.symbol}</span>
                  <span style="font-size:16px; font-weight:bold; margin-left:10px; color:var(--xp-ink)">${formatMoney(stockPrice)}</span>
                  <span style="font-size:12px; font-weight:bold; margin-left:6px; color:${isUp ? '#27ae60' : '#c0392b'}">
                    ${isUp ? '▲ +' : '▼ '}${formatMoney(Math.abs(deltaPrice))} (${pctChange.toFixed(2)}%)
                  </span>
                </div>
                <div style="display:flex; gap:4px">
                  <button class="sm-action-btn focusable ${this._chartMode === 'line' ? 'active' : ''}" data-action="toggle-chart" data-mode="line">Line & Area</button>
                  <button class="sm-action-btn focusable ${this._chartMode === 'candle' ? 'active' : ''}" data-action="toggle-chart" data-mode="candle">Candlestick</button>
                </div>
              </div>
              <div style="flex:1; position:relative; padding:4px">
                <canvas id="sm-chart-canvas" width="480" height="180" style="width:100%; height:100%; display:block"></canvas>
              </div>
            </div>

            <!-- Bottom Tabs Header & Tab Panel -->
            <div style="flex:1; background:var(--xp-white); border:1px solid var(--xp-border); border-radius:3px; display:flex; flex-direction:column; min-height:0">
              <div style="display:flex; background:var(--xp-bg); border-bottom:1px solid var(--xp-border); padding:4px 6px 0 6px">
                <button class="sm-tab-btn focusable ${this._bottomTab === 'holdings' ? 'active' : ''}" data-tab="holdings">Portafoglio / Holdings</button>
                <button class="sm-tab-btn focusable ${this._bottomTab === 'orders' ? 'active' : ''}" data-tab="orders">Open Orders (${sm.getOpenOrders().length})</button>
                <button class="sm-tab-btn focusable ${this._bottomTab === 'history' ? 'active' : ''}" data-tab="history">Trade History</button>
                <button class="sm-tab-btn focusable ${this._bottomTab === 'news' ? 'active' : ''}" data-tab="news">Market News Feed</button>
              </div>
              <div style="flex:1; overflow-y:auto; padding:6px">
                ${bottomContentHTML}
              </div>
            </div>

          </div>

          <!-- Column 3: Order Execution Console (Right) -->
          <div style="width:280px; flex:0 0 280px; box-sizing:border-box; overflow-x:hidden; background:var(--xp-white); border:1px solid var(--xp-border); border-radius:3px; display:flex; flex-direction:column; padding:10px">
            <div style="font-size:14px; font-weight:bold; color:var(--xp-blue-dark); border-bottom:1px solid var(--xp-border); padding-bottom:4px; margin-bottom:8px">
              ORDER PLACEMENT TERMINAL
            </div>

            <!-- Buy / Sell Mode Toggle -->
            <div style="display:flex; gap:4px; margin-bottom:8px">
              <button class="focusable" id="sm-side-buy" style="flex:1; padding:7px; font-weight:bold; font-size:13px; cursor:pointer; border:1px solid var(--xp-green); background:${isBuy ? '#27ae60' : '#f0f0f0'}; color:${isBuy ? '#fff' : '#27ae60'}; border-radius:2px">
                BUY / LONG
              </button>
              <button class="focusable" id="sm-side-sell" style="flex:1; padding:7px; font-weight:bold; font-size:13px; cursor:pointer; border:1px solid var(--xp-red-2); background:${!isBuy ? '#c0392b' : '#f0f0f0'}; color:${!isBuy ? '#fff' : '#c0392b'}; border-radius:2px">
                SELL / LIQUIDATE
              </button>
            </div>

            <!-- Order Type Selector -->
            <div style="margin-bottom:8px">
              <div style="font-size:11px; font-weight:bold; color:var(--xp-text-muted); margin-bottom:3px">ORDER EXECUTION TYPE</div>
              <div style="display:flex; gap:2px; flex-wrap:wrap">
                <button class="sm-order-type-btn focusable ${this._orderType === 'market' ? 'active' : ''}" data-type="market">Market</button>
                <button class="sm-order-type-btn focusable ${this._orderType === 'limit' ? 'active' : ''}" data-type="limit">Limit</button>
                <button class="sm-order-type-btn focusable ${this._orderType === 'stop_loss' ? 'active' : ''}" data-type="stop_loss">Stop Loss</button>
                <button class="sm-order-type-btn focusable ${this._orderType === 'take_profit' ? 'active' : ''}" data-type="take_profit">Take Profit</button>
              </div>
            </div>

            <!-- Limit / Trigger Price (shown for limit/stop/tp) -->
            ${this._orderType !== 'market' ? `
              <div style="background:var(--xp-row-tint-2); border:1px solid var(--xp-steel-3); padding:6px 8px; border-radius:3px; margin-bottom:8px">
                <div style="font-size:11px; font-weight:bold; color:var(--xp-blue-dark); margin-bottom:3px">
                  ${this._orderType === 'limit' ? 'LIMIT TARGET PRICE' : this._orderType === 'stop_loss' ? 'STOP TRIGGER PRICE' : 'TAKE PROFIT PRICE'}
                </div>
                <input type="number" id="sm-input-target-price" value="${Math.round(this._customTargetPrice / 100)}" step="1" style="width:100%; box-sizing:border-box; padding:3px 6px; font-weight:bold; font-size:13px; text-align:center; border:1px solid var(--xp-border)">
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-top:4px">
                  <button class="sm-btn-small focusable" style="flex:1; min-width:0" data-action="adjust-price" data-delta="-500">-5%</button>
                  <button class="sm-btn-small focusable" style="flex:1; min-width:0" data-action="adjust-price" data-delta="-100">-1%</button>
                  <button class="sm-btn-small focusable" style="flex:1; min-width:0" data-action="adjust-price" data-delta="100">+1%</button>
                  <button class="sm-btn-small focusable" style="flex:1; min-width:0" data-action="adjust-price" data-delta="500">+5%</button>
                </div>
                <div style="font-size:10px; color:var(--xp-text-muted); margin-top:3px; text-align:center">
                  Market Reference: <b>${formatMoney(stockPrice)}</b>
                </div>
              </div>
            ` : ''}

            <!-- Quantity Stepper & Presets -->
            <div style="margin-bottom:8px">
              <div style="font-size:11px; font-weight:bold; color:var(--xp-text-muted); margin-bottom:3px; display:flex; justify-content:space-between">
                <span>ORDER QUANTITY</span>
                <span>Available: <b>${isBuy ? goldToEurosForDisplay(playerGold) : `${sharesHeld} shares`}</b></span>
              </div>
              <input type="number" id="sm-input-qty" value="${this._inputShares}" min="1" max="99999" style="width:100%; box-sizing:border-box; padding:4px 6px; font-weight:bold; font-size:14px; text-align:center; border:1px solid var(--xp-border)">
              <div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap; margin-top:4px">
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="-10000" style="flex:1; min-width:0; padding:4px 2px">-10k</button>
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="-1000" style="flex:1; min-width:0; padding:4px 2px">-1k</button>
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="-10" style="flex:1; min-width:0; padding:4px 2px">-10</button>
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="-1" style="flex:1; min-width:0; padding:4px 2px">-1</button>
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="1" style="flex:1; min-width:0; padding:4px 2px">+1</button>
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="10" style="flex:1; min-width:0; padding:4px 2px">+10</button>
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="1000" style="flex:1; min-width:0; padding:4px 2px">+1k</button>
                <button class="sm-action-btn focusable" data-action="step-qty" data-step="10000" style="flex:1; min-width:0; padding:4px 2px">+10k</button>
              </div>
              <div style="display:flex; gap:3px; margin-top:4px; flex-wrap:wrap">
                <button class="sm-btn-small focusable" style="flex:1; min-width:38px" data-action="preset-qty" data-preset="1">+1</button>
                <button class="sm-btn-small focusable" style="flex:1; min-width:38px" data-action="preset-qty" data-preset="5">+5</button>
                <button class="sm-btn-small focusable" style="flex:1; min-width:38px" data-action="preset-qty" data-preset="25">+25</button>
                <button class="sm-btn-small focusable" style="flex:1; min-width:38px" data-action="preset-qty" data-preset="100">+100</button>
                <button class="sm-btn-small focusable" style="flex:1; min-width:38px" data-action="preset-qty" data-preset="1000">+1000</button>
                <button class="sm-btn-small focusable" style="flex:1; min-width:38px" data-action="preset-qty" data-preset="10000">+10000</button>
                <button class="sm-btn-small focusable" style="flex:1; min-width:38px" data-action="preset-qty" data-preset="max">MAX</button>
              </div>
            </div>

            <!-- Order Summary Card -->
            <div style="background:#f9f9f9; border:1px solid var(--xp-silver-3); padding:8px; border-radius:3px; font-size:12px; margin-bottom:8px">
              <div style="display:flex; justify-content:space-between; margin-bottom:3px">
                <span style="color:var(--xp-ink-soft)">Execution Rate:</span>
                <b>${formatMoney(unitTargetPrice)}</b>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:3px">
                <span style="color:var(--xp-ink-soft)">Order Quantity:</span>
                <b>${this._inputShares} shares</b>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:bold; border-top:1px dashed var(--xp-silver); padding-top:4px; margin-top:4px">
                <span style="color:var(--xp-blue-dark)">${isBuy ? 'Total Required:' : 'Estimated Proceeds:'}</span>
                <span style="color:${isBuy ? '#c0392b' : '#27ae60'}">${formatMoney(totalEstimated)}</span>
              </div>
            </div>

            <!-- Order Execution Button -->
            <button id="sm-execute-order-btn" class="focusable" style="width:auto; min-width:180px; align-self:center; padding:10px 26px; font-size:14px; font-weight:bold; cursor:${isValid ? 'pointer' : 'not-allowed'}; background:${isValid ? (isBuy ? 'linear-gradient(180deg, #2ecc71, var(--xp-green))' : 'linear-gradient(180deg, #e74c3c, var(--xp-red-2))') : '#ccc'}; color:var(--xp-white); border:1px solid ${isValid ? (isBuy ? '#1e8449' : '#922b21') : '#aaa'}; border-radius:3px; box-shadow:${isValid ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'}">
              ${isValid ? `PLACE ${isBuy ? 'BUY' : 'SELL'} ${this._orderType.toUpperCase().replace('_', ' ')} ORDER` : validationMsg.toUpperCase()}
            </button>

            <!-- Order Book Visual Depth in Console -->
            ${orderBookHTML}
          </div>

        </div>
      `;

      this.paintStockGraph();
      this.attachUIEventListeners(container);
    }

    attachUIEventListeners(container) {
      const sm = $gameSystem.stockMarket;

      // 1. Stock Card Selector
      const stockCards = container.querySelectorAll(".sm-stock-card");
      stockCards.forEach(card => {
        card.addEventListener("click", () => {
          const stockId = card.getAttribute("data-stock-id");
          if (stockId && stockId !== this._selectedStockId) {
            this._selectedStockId = stockId;
            this._customTargetPrice = sm.getPrice(stockId);
            SoundManager.playCursor();
            this.refreshUIStock();
          }
        });
      });

      // 2. Buy / Sell Toggle
      const btnBuy = container.querySelector("#sm-side-buy");
      if (btnBuy) {
        btnBuy.addEventListener("click", () => {
          this._tradeSide = 'buy';
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      }

      const btnSell = container.querySelector("#sm-side-sell");
      if (btnSell) {
        btnSell.addEventListener("click", () => {
          this._tradeSide = 'sell';
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      }

      // 3. Order Type Selector
      const typeBtns = container.querySelectorAll(".sm-order-type-btn");
      typeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          this._orderType = btn.getAttribute("data-type");
          if (this._orderType !== 'market' && (!this._customTargetPrice || this._customTargetPrice <= 0)) {
            this._customTargetPrice = sm.getPrice(this._selectedStockId);
          }
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      });

      // 4. Quantity Adjustments
      const qtyInput = container.querySelector("#sm-input-qty");
      if (qtyInput) {
        qtyInput.addEventListener("input", (e) => {
          this._inputShares = Math.max(1, parseInt(e.target.value) || 1);
        });
        qtyInput.addEventListener("change", () => {
          this.refreshUIStock();
        });
      }

      const qtySteps = container.querySelectorAll("[data-action='step-qty']");
      qtySteps.forEach(btn => {
        btn.addEventListener("click", () => {
          const step = parseInt(btn.getAttribute("data-step"));
          this._inputShares = Math.max(1, this._inputShares + step);
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      });

      const qtyPresets = container.querySelectorAll("[data-action='preset-qty']");
      qtyPresets.forEach(btn => {
        btn.addEventListener("click", () => {
          const preset = btn.getAttribute("data-preset");
          if (preset === 'max') {
            if (this._tradeSide === 'buy') {
              const price = this._orderType === 'market' ? sm.getPrice(this._selectedStockId) : this._customTargetPrice;
              const maxBuy = price > 0 ? Math.floor(getPlayerGoldInCents() / price) : 1;
              this._inputShares = Math.max(1, maxBuy);
            } else {
              this._inputShares = Math.max(1, sm.getShares(this._selectedStockId));
            }
          } else {
            this._inputShares = Math.max(1, parseInt(preset) || 1);
          }
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      });

      // 5. Price Adjustments for Limit / Stop
      const targetPriceInput = container.querySelector("#sm-input-target-price");
      if (targetPriceInput) {
        targetPriceInput.addEventListener("input", (e) => {
          this._customTargetPrice = Math.max(minimumPrice, Math.round(parseFloat(e.target.value) * 100) || minimumPrice);
        });
        targetPriceInput.addEventListener("change", () => {
          this.refreshUIStock();
        });
      }

      const priceAdjustBtns = container.querySelectorAll("[data-action='adjust-price']");
      priceAdjustBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const deltaBps = parseInt(btn.getAttribute("data-delta")); // basis points (100 = 1%)
          const curP = this._customTargetPrice || sm.getPrice(this._selectedStockId);
          this._customTargetPrice = Math.max(minimumPrice, Math.round(curP * (1 + deltaBps / 10000)));
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      });

      // 6. Bottom Tabs
      const tabBtns = container.querySelectorAll(".sm-tab-btn");
      tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          this._bottomTab = btn.getAttribute("data-tab");
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      });

      // 7. Chart Mode Toggle
      const chartBtns = container.querySelectorAll("[data-action='toggle-chart']");
      chartBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          this._chartMode = btn.getAttribute("data-mode");
          SoundManager.playCursor();
          this.refreshUIStock();
        });
      });

      // 8. Cancel Order & Quick Actions
      const cancelBtns = container.querySelectorAll("[data-action='cancel-order']");
      cancelBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const ordId = btn.getAttribute("data-order-id");
          if (ordId && sm.cancelOrder(ordId)) {
            SoundManager.playCancel();
            this.showToast(`Order ${ordId} cancelled. Escrow released.`);
            this.refreshUIStock();
          }
        });
      });

      const quickTradeBtns = container.querySelectorAll("[data-action='quick-trade']");
      quickTradeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const stkId = btn.getAttribute("data-stock");
          if (stkId) {
            this._selectedStockId = stkId;
            this._customTargetPrice = sm.getPrice(stkId);
            SoundManager.playCursor();
            this.refreshUIStock();
          }
        });
      });

      const quickSellAllBtns = container.querySelectorAll("[data-action='quick-sell-all']");
      quickSellAllBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const stkId = btn.getAttribute("data-stock");
          const shares = sm.getShares(stkId);
          if (shares > 0 && sm.sellStock(stkId, shares)) {
            SoundManager.playShop();
            this.showToast(`Liquidated all ${shares} shares of ${stkId.toUpperCase()}`);
            this.refreshUIStock();
          }
        });
      });

      // 9. Execute Order Button
      const executeBtn = container.querySelector("#sm-execute-order-btn");
      if (executeBtn) {
        executeBtn.addEventListener("click", () => {
          this.executeUIOrder();
        });
      }
    }

    executeUIOrder() {
      const sm = $gameSystem.stockMarket;
      const stockId = this._selectedStockId;
      const shares = this._inputShares;

      if (this._orderType === 'market') {
        if (this._tradeSide === 'buy') {
          if (sm.buyStock(stockId, shares)) {
            SoundManager.playShop();
            this.showToast(`Bought ${shares} shares of ${stockId.toUpperCase()} @ market price!`);
            this.refreshUIStock();
          } else {
            SoundManager.playBuzzer();
            this.showToast("Cannot execute buy order: insufficient gold", true);
          }
        } else {
          if (sm.sellStock(stockId, shares)) {
            SoundManager.playShop();
            this.showToast(`Sold ${shares} shares of ${stockId.toUpperCase()} @ market price!`);
            this.refreshUIStock();
          } else {
            SoundManager.playBuzzer();
            this.showToast("Cannot execute sell order: insufficient shares", true);
          }
        }
      } else {
        // Limit / Stop / Take Profit Order
        const targetPrice = this._customTargetPrice;
        const result = sm.placeOrder({
          stockId,
          side: this._tradeSide,
          type: this._orderType,
          shares,
          targetPrice
        });

        if (result.success) {
          SoundManager.playOk();
          this.showToast(`Placed ${this._tradeSide.toUpperCase()} ${this._orderType.toUpperCase()} order for ${shares} shares @ ${formatMoney(targetPrice)}`);
          this._bottomTab = 'orders';
          this.refreshUIStock();
        } else {
          SoundManager.playBuzzer();
          this.showToast(`Failed to place order: ${result.reason}`, true);
        }
      }
    }

    paintStockGraph() {
      const canvas = document.getElementById("sm-chart-canvas");
      if (!canvas) return;

      const box = canvas.parentElement;
      if (box) {
        canvas.width = box.clientWidth || 480;
        canvas.height = box.clientHeight || 180;
      }

      const ctx = canvas.getContext("2d");
      const sm = $gameSystem.stockMarket;
      const history = sm.getHistory(this._selectedStockId);
      const stock = sm.getStock(this._selectedStockId);
      if (!history || history.length === 0) return;

      const w = canvas.width;
      const h = canvas.height;
      const padL = 60;
      const padR = 15;
      const padT = 15;
      const padB = 22;

      ctx.clearRect(0, 0, w, h);

      // Min & Max calculations
      let min = Math.min(...history) * 0.96;
      let max = Math.max(...history) * 1.04;
      if (max - min < 100) { max += 50; min -= 50; }

      // Grid lines & price labels
      ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const gy = padT + (h - padT - padB) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();

        const priceLabelVal = max - (max - min) * (i / 4);
        ctx.fillStyle = "#666666";
        ctx.font = "10px Tahoma, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(formatMoney(Math.round(priceLabelVal)), padL - 6, gy + 3);
      }

      // Soul Median Target Reference Line (if viewing SOUL)
      if (this._selectedStockId === 'souls') {
        const median = sm.getCurrentSoulMedian();
        if (median >= min && median <= max) {
          const my = padT + (h - padT - padB) - (((median - min) / (max - min)) * (h - padT - padB));
          ctx.strokeStyle = "rgba(155, 89, 182, 0.6)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(padL, my);
          ctx.lineTo(w - padR, my);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(155, 89, 182, 0.9)";
          ctx.fillText("Median Target", w - padR - 5, my - 4);
        }
      }

      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      if (this._chartMode === 'candle') {
        // Draw Candlesticks
        const candles = sm.getCandles(this._selectedStockId);
        if (candles.length > 0) {
          const candleW = Math.max(3, Math.min(14, (plotW / candles.length) - 4));
          candles.forEach((c, idx) => {
            const cx = padL + (idx + 0.5) * (plotW / candles.length);
            const isGreen = c.close >= c.open;
            const candleColor = isGreen ? "#27ae60" : "#c0392b";

            const yHigh = padT + plotH - (((c.high - min) / (max - min)) * plotH);
            const yLow = padT + plotH - (((c.low - min) / (max - min)) * plotH);
            const yOpen = padT + plotH - (((c.open - min) / (max - min)) * plotH);
            const yClose = padT + plotH - (((c.close - min) / (max - min)) * plotH);

            // Wick
            ctx.strokeStyle = candleColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, yHigh);
            ctx.lineTo(cx, yLow);
            ctx.stroke();

            // Body
            ctx.fillStyle = candleColor;
            const topY = Math.min(yOpen, yClose);
            const bodyH = Math.max(2, Math.abs(yClose - yOpen));
            ctx.fillRect(cx - candleW / 2, topY, candleW, bodyH);
          });
        }
      } else {
        // Draw Smooth Area Line Chart
        const points = history.map((price, i) => {
          const px = padL + i * (plotW / (history.length - 1));
          const py = padT + plotH - (((price - min) / (max - min)) * plotH || 0);
          return { x: px, y: py };
        });

        // Line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

        const strokeColor = stock.color || "#0b5394";
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        // Area Fill
        ctx.lineTo(points[points.length - 1].x, padT + plotH);
        ctx.lineTo(points[0].x, padT + plotH);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, strokeColor + "33");
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fill();

        // Moving Average line (5-period SMA)
        if (history.length >= 5) {
          ctx.beginPath();
          ctx.strokeStyle = "#f39c12";
          ctx.lineWidth = 1.5;
          for (let i = 4; i < history.length; i++) {
            const sma = (history[i] + history[i-1] + history[i-2] + history[i-3] + history[i-4]) / 5;
            const sx = padL + i * (plotW / (history.length - 1));
            const sy = padT + plotH - (((sma - min) / (max - min)) * plotH || 0);
            if (i === 4) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
        }
      }
    }

    updateKeyboardShortcuts() {
      if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
        if (!this._isAppMode) {
          this.popScene();
          SoundManager.playCancel();
        }
      }
    }

    // Opened as a window inside the hyperdeck's desktop, the terminal is walked
    // by the OS focus ring, which is what every '.focusable' in this markup was
    // written for. Opened as a scene of its own - the terminal a broker's
    // office puts in front of you - nothing collected them, so a stock could
    // only be picked, an order only be placed, with a mouse. The shared DOM
    // ring (window.CCNav) walks the same controls here.
    updateStockFocusRing() {
      const container = document.getElementById("stock-container");
      if (!window.CCNav || !container) return;
      if (window.CCNav._root !== container) window.CCNav.attach(this, container, { boards: false });
      if (!window.CCNav.active()) window.CCNav.enter("right");
      if (window.CCNav.update()) return;
      window.CCNav.paint();
    }

    // No card board behind the ring here: the whole terminal IS the ring, so
    // stepping off its first control lands on the last rather than on nothing.
    onNavLeave() {
      if (window.CCNav) window.CCNav.enter("up");
    }

    createHelpWindow() {
      const rect = new Rectangle(0, this.mainAreaTop(), Graphics.boxWidth, this.calcWindowHeight(1, false));
      this._helpWindow = new Window_Help(rect);
      this.addWindow(this._helpWindow);
    }
  }

  window.Scene_StockMarket = Scene_StockMarket;


  // ============================================================================
  // STUB COMPATIBILITY WINDOW CLASSES
  // ============================================================================
  class Window_StockInfo extends Window_Base { refresh() { } }
  class Window_StockCommand extends Window_HorzCommand { makeCommandList() { } }
  class Window_StockSelection extends Window_Command { setMode() { } setTitle() { } }
  class Window_StockAmount extends Window_Command { setMode() { } setTitle() { } }


  // ============================================================================
  // PLUGIN COMMANDS & REGISTRATIONS
  // ============================================================================
  PluginManager.registerCommand(pluginName, "OpenStockMarket", () => {
    if ($gameSystem && !($gameSystem.stockMarket && $gameSystem.stockMarket.update)) {
      $gameSystem.stockMarket = new StockMarketSystem();
    }
    if (window.HypernetOS && window.HypernetStockApp && SceneManager._scene instanceof Scene_HypernetOS) {
      window.HypernetStockApp.launch();
    } else {
      SceneManager.push(Scene_StockMarket);
    }
  });

  PluginManager.registerCommand(pluginName, "PumpMarket", () => {
    if ($gameSystem && $gameSystem.stockMarket && $gameSystem.stockMarket.pumpMarket) {
      $gameSystem.stockMarket.pumpMarket();
    }
  });

  PluginManager.registerCommand(pluginName, "CrashMarket", () => {
    if ($gameSystem && $gameSystem.stockMarket && $gameSystem.stockMarket.crashMarket) {
      $gameSystem.stockMarket.crashMarket();
    }
  });

  function registerStockMarketApp() {
    if (!window.HypernetOS) return false;
    window.HypernetOS.registerApp({
      id: 'app-stock-market',
      name: "Stock Market",
      icon: 229,
      launchFn: function() {
        if ($gameSystem && !($gameSystem.stockMarket && $gameSystem.stockMarket.update)) {
          $gameSystem.stockMarket = new StockMarketSystem();
        }
        if (window.HypernetStockApp) {
          window.HypernetStockApp.launch();
        } else {
          SceneManager.push(Scene_StockMarket);
        }
      },
      desktopShortcut: true
    });
    return true;
  }

  if (!registerStockMarketApp()) {
    const _Scene_Boot_create = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
      _Scene_Boot_create.call(this);
      registerStockMarketApp();
    };
  }

  const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if (command === "OpenStockMarket") {
      if ($gameSystem && !($gameSystem.stockMarket && $gameSystem.stockMarket.update)) {
        $gameSystem.stockMarket = new StockMarketSystem();
      }
      if (window.HypernetOS && SceneManager._scene instanceof Scene_HypernetOS) {
        window.HypernetStockApp.launch();
      } else {
        SceneManager.push(Scene_StockMarket);
      }
    } else if (command === "PumpMarket") {
      if ($gameSystem && $gameSystem.stockMarket && $gameSystem.stockMarket.pumpMarket) {
        $gameSystem.stockMarket.pumpMarket();
      }
    } else if (command === "CrashMarket") {
      if ($gameSystem && $gameSystem.stockMarket && $gameSystem.stockMarket.crashMarket) {
        $gameSystem.stockMarket.crashMarket();
      }
    }
  };
})();