/*:
 * @target MZ
 * @plugindesc GalaxySim Trade - the star map's trading console: bulk trade of any item with the factions of Earth, Zeta Reticuli and Titania, priced off the stock market, and the pizza business with its own market, galley and daily routes.
 * @author nocoldiz
 *
 * @help
 * The rail's "Pizza" button opens the trading console. A "Trade" button joins
 * it on the rail, and on the world's catalog row, while the ship orbits a
 * world with factions to trade with: Earth, the Tourists' Zeta A II and
 * Zeta B II, and the Dargos' Titania.
 *
 * Everything bought goes into the Starship's cargo bay (VehicleStorage.js,
 * vehicle key "airship"), and everything sold comes out of it. The bay opens
 * from the console in the container window, to move things between it and the
 * pack.
 *
 * Trade: each faction on the world keeps a weekly stock of goods drawn from
 * the whole item database, three kinds of goods it deals in most. Prices are
 * the item's own, moved by its maker's share price on the stock market
 * (window.ItemCompany.priceIndex), by the standing the party has with the
 * faction, and by how much of that good has just changed hands with it. The
 * aliens buy Earth goods dear and sell their own dearer still.
 *
 * Pizza: a pizza is baked on a Pizza Base (item 2113, bought by the crate from
 * the galley into the cargo bay) with up to five toppings from any food in the
 * game, paid for in euros. Baked pizzas are cargo of the bay (goods, not
 * items) and sell on their own market: Earth, the Tourists, the Dargos and any
 * spaceport pay euros, a world with biosignatures pays in crafting materials.
 * The pizza market moves with its maker's (Hearthmill Foods) share price.
 * Routes bake and ship pizzas every in-game day on their own, buying their
 * bases under contract.
 *
 * Everything lives in $gameSystem._gxPizza. The logic is exposed as
 * window.GalaxySim.PizzaDelivery (window.GalaxySim.Trade is the same object)
 * so it can be tested without a renderer.
 *
 * Load after GalaxySim_Overlay and GalaxySim_Scene3D, before GalaxySim_Core.
 */

(() => {
  "use strict";

  window.GalaxySim = window.GalaxySim || {};

  const T = (key, params) => (typeof window.T === "function"
    ? window.T("PizzaDelivery." + key, params) : key);

  // ---------------------------------------------------------------------------
  // Tuning. Gold is stored in cents: 100 = 1 euro.
  // ---------------------------------------------------------------------------
  const MAX_TOPPINGS = 5;
  const MAX_RECIPES = 8;          // custom pizzas kept besides the Margherita
  const MAX_ROUTES = 6;
  const MAX_CATCHUP_DAYS = 30;
  const TOPPING_FACTOR = 0.15;    // share of a topping's shop price in one unit
  const SAT_PRICE_DROP = 0.6;     // a saturated market pays 40% of the going rate
  const SAT_DECAY_PER_DAY = 0.15;
  const FREIGHT = 0.15;           // a route's cut, waived on Earth
  const ROUTE_SIZES = [10, 25, 50, 100];
  const BASE_LOTS = [10, 100, 1000];
  const BULK_DISCOUNT = 0.9;      // a hundred bases or more, 10% off
  const QTY_MAX = 9999;
  const FOOD_LIST_SHOWN = 40;
  const CARGO_LIST_SHOWN = 60;
  const MARGHERITA_ITEM = 536;
  const MARGHERITA_ID = "margherita";
  const BASE_ITEM = 2113;
  const PIZZA_GRAMS = 450;
  const HOLD = "airship";         // the Starship's cargo bay (VehicleStorage)
  const GOOD_PREFIX = "pizza:";   // i18n-ignore  goods key prefix

  // Trade with factions.
  const STOCK_ROWS = 24;
  const TRADE_CAPACITY = 200;     // units of one good that fill a faction's appetite for it
  const MARKET_FLOOR = 0.5;
  const MARKET_CEIL = 3.0;
  const REFUSE_BELOW = -40;
  // What a world asks for its own goods and pays for the party's, as a share
  // of the going price. The aliens pay well for anything from Earth.
  const TRADE_WORLDS = {
    earth:   { buy: 1.0, sell: 0.5 },
    tourist: { buy: 1.3, sell: 0.85 },
    dargos:  { buy: 1.5, sell: 1.1 },
    // A human colony (GalaxySim "Colonies"): its own goods cheap at the
    // source, Earth's bought gladly so far from home.
    colony:  { buy: 0.85, sell: 0.75 },
  };
  // What a colony stocks, by what it makes (GalaxySim colony.production): the
  // categories its shelf is drawn from, as Items.json <category:> names them.
  // i18n-ignore-start  category ids
  const COLONY_GOODS = {
    farming:    ["Food", "Farming", "Survival"],
    industrial: ["Component", "Tools", "Crafting"],
    mining:     ["Crafting", "Component", "Collectibles"],
    medical:    ["Medical", "Homeopathy", "Alchemistry"],
    arcane:     ["Magic", "Alchemistry", "Books"],
    military:   ["Combat", "Survival", "Tools"],
    cultural:   ["Books", "Collectibles", "Lifestyle"],
    frontier:   ["Survival", "Tools", "Food"],
  };
  // i18n-ignore-end
  // A colony trades as a house of its own, filed under an id no faction of
  // Factions.json reaches.
  const COLONY_TRADER_BASE = 100000;
  // Categories nobody trades by the crate.
  const UNTRADED = ["Vehicles", "BodyPart", "Diseases", "Monsters", "Trash", "Fertility"];  // i18n-ignore  category ids

  // What each kind of buyer is willing to pay for a pizza. `ceiling` is the
  // most one pizza fetches there before appeal and distance, whatever it cost
  // to bake. `capacity` is how many units take the market from fresh to
  // saturated.
  const KINDS = {
    earth:     { currency: "euro",     markup: 1.3, ceiling: 2500,  capacity: 2000 },
    spaceport: { currency: "euro",     markup: 1.6, ceiling: 4000,  capacity: 300 },
    tourist:   { currency: "euro",     markup: 2.2, ceiling: 12000, capacity: 600 },
    dargos:    { currency: "euro",     markup: 2.6, ceiling: 20000, capacity: 400 },
    life:      { currency: "material", markup: 1.8, ceiling: 6000,  capacity: 800 },
  };
  const KIND_ORDER = ["earth", "tourist", "dargos", "spaceport", "life"];

  // i18n-ignore-start
  // Record names, not display text: the systems and bodies as Systems.json
  // and NPCPolitics_Data.OFFWORLD_POWERS name them, the faction ids as
  // Factions.json holds them.
  const EARTH = { system: "Sol", body: "Earth" };
  const TOURIST_SYSTEMS = ["Zeta Reticuli A", "Zeta Reticuli B"];
  const DARGOS_SYSTEMS = ["Titania"];
  const OFFWORLD_POWERS = ["The Tourists", "The Dargos"];
  const TOURIST_FACTIONS = [51, 52, 53];
  const DARGOS_FACTIONS = [54];
  // i18n-ignore-end

  // Crafting materials a living world can pay with: 849-871, less the two
  // that are food (plant matter, raw meat).
  const MATERIAL_IDS = [];
  for (let id = 849; id <= 871; id++) if (id !== 858 && id !== 862) MATERIAL_IDS.push(id);

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function fnv1a(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function money(gold) {
    const PT = window.ParchmentToast;
    if (PT && typeof PT.money === "function") return PT.money(gold);
    return (Math.round(gold) / 100).toFixed(2);
  }

  function kg(grams) {
    const k = grams / 1000;
    return k >= 100 ? Math.round(k).toLocaleString() : k.toFixed(1);
  }

  function itemName(item) {
    if (!item) return "";
    try {
      return typeof window.translateText === "function" ? window.translateText(item.name) : item.name;
    } catch (e) {
      return item.name;
    }
  }

  function iconHtml(index) {
    const PT = window.ParchmentToast;
    return (index > 0 && PT && typeof PT.icon === "function") ? PT.icon(index) : "";
  }

  function categoryOf(item) {
    const m = /<category:\s*(\w+)>/i.exec((item && item.note) || "");
    return m ? m[1] : "";
  }

  function party() { return typeof $gameParty !== "undefined" ? $gameParty : null; }

  function gold() {
    const p = party();
    return p && typeof p.gold === "function" ? p.gold() : 0;
  }

  function today() {
    const TD = window.TimeDateSystem;
    if (TD && typeof TD.getGameTimeMinutes === "function") {
      const m = Number(TD.getGameTimeMinutes());
      if (isFinite(m)) return Math.floor(m / 1440);
    }
    return 0;
  }

  // The stock market's word on what an item is worth today, against the
  // price its maker listed at: 1 when there is no market or no maker.
  function marketIndex(item) {
    const IC = window.ItemCompany;
    if (!item || !IC || typeof IC.of !== "function" || typeof IC.priceIndex !== "function") return 1;
    try {
      const key = IC.of(item);
      const idx = key ? Number(IC.priceIndex(key)) : 1;
      return isFinite(idx) && idx > 0 ? clamp(idx, MARKET_FLOOR, MARKET_CEIL) : 1;
    } catch (e) {
      return 1;
    }
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  function state() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._gxPizza) {
      $gameSystem._gxPizza = {
        recipes: [],          // [{ id, name, toppings:[itemId] }]
        routes: [],           // [{ id, system, body, kind, dist, recipeId, units }]
        // "system|body" (a pizza market) or "trade|faction|item" (a good):
        // { sat, lastDay, credit }. A good's sat climbs as the party buys it
        // off the faction and falls below zero as the party sells it one.
        markets: {},
        stock: {},            // faction id -> { week, left: { itemId: units } }
        lastSettledDay: null,
        lastReport: null,
        nextId: 1,
      };
    }
    const S = $gameSystem._gxPizza;
    if (!S.stock) S.stock = {};
    return S;
  }

  // ---------------------------------------------------------------------------
  // The cargo bay (Vehicle/VehicleStorage.js)
  // ---------------------------------------------------------------------------
  const VS = () => window.VehicleStorage || null;
  const goodKey = (rid) => GOOD_PREFIX + rid;

  function cargoOf(rid) {
    const V = VS();
    return V ? V.goodsCount(HOLD, goodKey(rid)) : 0;
  }

  function cargoTotal() {
    const V = VS();
    if (!V) return 0;
    return V.goods(HOLD).filter((g) => g.key.indexOf(GOOD_PREFIX) === 0).reduce((s, g) => s + g.qty, 0);
  }

  function baseItem() { return ($dataItems && $dataItems[BASE_ITEM]) || null; }

  function basesAboard() {
    const V = VS();
    const b = baseItem();
    return V && b ? V.count(HOLD, b) : 0;
  }

  function weightOf(item) {
    const U = window.ItemSystemUtils;
    return U && typeof U.getItemWeight === "function" ? U.getItemWeight(item) : 0;
  }

  // ---------------------------------------------------------------------------
  // Food and recipes
  // ---------------------------------------------------------------------------
  function isFood(item) {
    if (!item || !item.name) return false;
    const U = window.ItemSystemUtils;
    if (U && typeof U.isFoodItem === "function" && U.isFoodItem(item)) return true;
    if (item.meta && String(item.meta.category || "").trim() === "Food") return true;
    return /<category:\s*Food>/i.test(item.note || "");
  }

  let _foodCache = null;
  function foods() {
    if (_foodCache && _foodCache.src === $dataItems) return _foodCache.list;
    const list = [];
    for (const item of ($dataItems || [])) if (isFood(item) && item.id !== BASE_ITEM) list.push(item);
    _foodCache = { src: $dataItems, list };
    return list;
  }

  function searchFoods(query) {
    const q = String(query || "").trim().toLowerCase();
    const all = foods();
    if (!q) return all;
    return all.filter((it) => itemName(it).toLowerCase().indexOf(q) >= 0 ||
      String(it.name).toLowerCase().indexOf(q) >= 0);
  }

  function calories(item) {
    const U = window.ItemSystemUtils;
    if (U && typeof U.getNutritionValue === "function") {
      const v = Number(U.getNutritionValue(item, "calories"));
      if (isFinite(v)) return v;
    }
    const m = /<calories:\s*(\d+)>/i.exec((item && item.note) || "");
    return m ? Number(m[1]) : 0;
  }

  // Unique food ids, at most five, the base excluded. Anything that is not a
  // food is dropped.
  function cleanToppings(ids) {
    const out = [];
    for (const raw of (ids || [])) {
      const id = Number(raw);
      if (id === BASE_ITEM || out.indexOf(id) >= 0) continue;
      if (!isFood($dataItems && $dataItems[id])) continue;
      out.push(id);
      if (out.length >= MAX_TOPPINGS) break;
    }
    return out;
  }

  function toppingCost(id) {
    const item = $dataItems && $dataItems[id];
    return item ? Math.round(Math.max(0, Number(item.price) || 0) * TOPPING_FACTOR) : 0;
  }

  // The toppings alone: what the galley pays in euros to bake one.
  function toppingsCost(toppings) {
    let c = 0;
    for (const id of (toppings || [])) c += toppingCost(id);
    return c;
  }

  // One base, at today's price.
  function basePrice() {
    const b = baseItem();
    return b ? Math.round((Number(b.price) || 0) * marketIndex(b)) : 300;
  }

  // What one unit is worth to make: a base and its toppings.
  function unitCost(toppings) {
    return basePrice() + toppingsCost(toppings);
  }

  function margheritaToppings() {
    const item = $dataItems && $dataItems[MARGHERITA_ITEM];
    const m = item && /<Recipe:\s*([^>]+)>/i.exec(item.note || "");
    if (!m) return [];
    return cleanToppings(m[1].split(",").map((s) => parseInt(s, 10)));
  }

  function recipes() {
    const S = state();
    const base = { id: MARGHERITA_ID, name: T("recipe.margherita"), toppings: margheritaToppings(), builtin: true };
    return [base].concat(S ? S.recipes : []);
  }

  function recipe(id) {
    return recipes().find((r) => r.id === id) || null;
  }

  function createRecipe(name, ids) {
    const S = state();
    if (!S) return { ok: false, reason: "noState" };
    if (S.recipes.length >= MAX_RECIPES) return { ok: false, reason: "tooManyRecipes" };
    if ((ids || []).length > MAX_TOPPINGS) return { ok: false, reason: "tooManyToppings" };
    const toppings = cleanToppings(ids);
    if (!toppings.length) return { ok: false, reason: "noToppings" };
    const label = String(name || "").trim().slice(0, 32) ||
      T("recipe.defaultName", { n: S.nextId });
    const r = { id: "p" + (S.nextId++), name: label, toppings };
    S.recipes.push(r);
    return { ok: true, recipe: r };
  }

  function deleteRecipe(id) {
    const S = state();
    if (!S) return { ok: false, reason: "noState" };
    const idx = S.recipes.findIndex((r) => r.id === id);
    if (idx < 0) return { ok: false, reason: "noRecipe" };
    if (cargoOf(id) > 0) return { ok: false, reason: "recipeInHold" };
    if (S.routes.some((r) => r.recipeId === id)) return { ok: false, reason: "recipeOnRoute" };
    S.recipes.splice(idx, 1);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Pizza markets
  // ---------------------------------------------------------------------------
  function sysName(sys) { return (sys && (sys.name || sys.id)) || ""; }

  function marketOf(sys, body) {
    if (!sys || !body) return null;
    const s = sysName(sys);
    let kind = null;
    if (s === EARTH.system && body.name === EARTH.body) kind = "earth";
    else if (TOURIST_SYSTEMS.indexOf(s) >= 0 && (body.landingLocations || []).length) kind = "tourist";
    else if (DARGOS_SYSTEMS.indexOf(s) >= 0 && body.name === s) kind = "dargos";
    // Every human spaceport buys pizza: the hand-drawn pads and every colony,
    // a colony even on a world that also carries life.
    else if (isHumanPort(body)) kind = "spaceport";
    else {
      const GS = window.GalaxySim;
      const alive = body.life === true ||
        (GS && typeof GS.planetHasLife === "function" && GS.planetHasLife(body));
      if (alive) kind = "life";
    }
    if (!kind) return null;
    const colony = colonyAt(body);
    return {
      kind,
      currency: KINDS[kind].currency,
      key: s + "|" + body.name,
      system: s,
      body: body.name,
      dist: distanceFactor(sys),
      colony: colony ? colony.id : null,
    };
  }

  function colonyAt(body) {
    const GS = window.GalaxySim;
    return (GS && typeof GS.colonyOf === "function") ? GS.colonyOf(body) : null;
  }

  function isHumanPort(body) {
    const GS = window.GalaxySim;
    if (GS && typeof GS.isHumanSpaceport === "function") return GS.isHumanSpaceport(body);
    return (body.landingLocations || []).length > 0;
  }

  // 1 at Sol, about 1.4 at Zeta Reticuli, about 1.7 out at Titania.
  function distanceFactor(sys) {
    const p = sys && sys.position;
    if (!p) return 1;
    const d = Math.sqrt((p.x || 0) ** 2 + (p.y || 0) ** 2 + (p.z || 0) ** 2);
    return isFinite(d) ? 1 + Math.log10(1 + d) * 0.25 : 1;
  }

  // A buyer's taste and, for a living world, what it pays with. Seeded on the
  // market's name, so the same world always wants the same thing.
  function prefsOf(key) {
    const list = foods();
    const h = fnv1a("pizza|" + key);
    const like = list.length ? list[h % list.length].id : 0;
    let dislike = list.length ? list[(h >>> 8) % list.length].id : 0;
    if (dislike === like && list.length > 1) dislike = list[((h >>> 8) + 1) % list.length].id;
    const mats = [];
    const n = 2 + (h >>> 16) % 2;
    for (let i = 0; mats.length < n && i < 16; i++) {
      const id = MATERIAL_IDS[fnv1a(key + "|mat|" + i) % MATERIAL_IDS.length];
      if (mats.indexOf(id) < 0) mats.push(id);
    }
    return { like, dislike, materials: mats };
  }

  // How much a buyer likes a pizza: 0.6 to 1.6.
  function appeal(rec, prefs) {
    if (!rec) return 1;
    const tops = rec.toppings || [];
    let cal = 0;
    for (const id of tops) cal += calories($dataItems && $dataItems[id]);
    let a = 1 + clamp(cal / 1500, 0, 1) * 0.2 + Math.max(0, tops.length - 1) * 0.05;
    if (prefs && tops.indexOf(prefs.like) >= 0) a += 0.25;
    if (prefs && tops.indexOf(prefs.dislike) >= 0) a -= 0.25;
    return clamp(a, 0.6, 1.6);
  }

  // The pizza market as a whole: its maker's share price on the stock market.
  function pizzaIndex() {
    return marketIndex($dataItems && $dataItems[MARGHERITA_ITEM]);
  }

  function marketState(key, day) {
    const S = state();
    if (!S.markets[key]) S.markets[key] = { sat: 0, lastDay: day, credit: 0 };
    const M = S.markets[key];
    // A market flooded by sales (positive) or emptied by purchases (a
    // faction's shelf, negative) settles back to fresh a little each day.
    if (day > M.lastDay) {
      const step = SAT_DECAY_PER_DAY * (day - M.lastDay);
      M.sat = M.sat > 0 ? Math.max(0, M.sat - step) : Math.min(0, M.sat + step);
      M.lastDay = day;
    }
    return M;
  }

  // The going rate for one unit on a fresh market.
  function basePriceOf(rec, market) {
    const K = KINDS[market.kind];
    const prefs = prefsOf(market.key);
    const raw = Math.min(unitCost(rec.toppings) * K.markup, K.ceiling);
    return raw * appeal(rec, prefs) * (market.dist || 1) * pizzaIndex();
  }

  // What `n` units fetch, sold one after the other into a filling market.
  function quote(rec, market, n, sat0) {
    const K = KINDS[market.kind];
    const p = basePriceOf(rec, market);
    let sat = sat0 || 0;
    let value = 0;
    for (let i = 0; i < n; i++) {
      value += p * (1 - SAT_PRICE_DROP * Math.min(1, sat));
      sat = Math.min(1, sat + 1 / K.capacity);
    }
    return { value: Math.round(value), sat };
  }

  // Hands the proceeds over: euros as gold, or materials for a living world
  // with whatever is left of a material's worth kept for the next sale.
  function payout(market, value, M) {
    const res = { gold: 0, items: {} };
    if (value <= 0) return res;
    const p = party();
    if (market.currency === "euro") {
      res.gold = value;
      if (p) p.gainGold(value);
      return res;
    }
    M = M || marketState(market.key, today());
    const mats = prefsOf(market.key).materials;
    const pool = value + (M.credit || 0);
    const share = pool / mats.length;
    let left = 0;
    for (const id of mats) {
      const price = Math.max(1, Number(($dataItems[id] || {}).price) || 1);
      const qty = Math.floor(share / price);
      left += share - qty * price;
      if (qty > 0) {
        res.items[id] = (res.items[id] || 0) + qty;
        if (p) p.gainItem($dataItems[id], qty);
      }
    }
    M.credit = Math.round(left);
    return res;
  }

  // ---------------------------------------------------------------------------
  // The ship
  // ---------------------------------------------------------------------------
  function dataManager() {
    const GS = window.GalaxySim;
    if (GS && typeof GS.getDataManager === "function") {
      try { return GS.getDataManager(); } catch (e) { return null; }
    }
    return null;
  }

  // The world the ship is parked over, and the market on it if it buys.
  function orbit() {
    const dm = dataManager();
    const ship = dm && dm.playerShip;
    if (!ship || ship.isMoving || !ship.currentPlanet) return null;
    const rec = typeof dm.resolveOrbitBody === "function"
      ? dm.resolveOrbitBody(ship.currentSystem, ship.currentPlanet) : null;
    if (!rec) return null;
    return { system: rec.system, body: rec.body, market: marketOf(rec.system, rec.body) };
  }

  // Bases by the crate, into the cargo bay. A hundred or more come cheaper.
  function buyBases(n) {
    const V = VS();
    const b = baseItem();
    n = Math.floor(Number(n) || 0);
    if (!V || !b) return { ok: false, reason: "noHold" };
    if (n <= 0) return { ok: false, reason: "nothing" };
    const each = Math.round(basePrice() * (n >= 100 ? BULK_DISCOUNT : 1));
    const fit = Math.min(n, V.room(HOLD, b));
    if (fit <= 0) return { ok: false, reason: "holdFull" };
    if (gold() < each * fit) return { ok: false, reason: "noFunds" };
    const put = V.add(HOLD, b, fit);
    party().loseGold(each * put);
    return { ok: true, units: put, cost: each * put };
  }

  // A pizza takes the place of its base in the bay and weighs a little more.
  function maxBake(rec) {
    const V = VS();
    const b = baseItem();
    if (!V || !b || !rec) return 0;
    const cost = toppingsCost(rec.toppings);
    const extra = Math.max(1, PIZZA_GRAMS - weightOf(b));
    const byWeight = Math.floor(V.freeGrams(HOLD) / extra);
    const byMoney = cost > 0 ? Math.floor(gold() / cost) : Infinity;
    return Math.max(0, Math.min(basesAboard(), byWeight, byMoney));
  }

  function goodMeta(rec) {
    const icon = $dataItems && $dataItems[MARGHERITA_ITEM] ? $dataItems[MARGHERITA_ITEM].iconIndex : 0;
    return { name: rec.name, iconIndex: icon, grams: PIZZA_GRAMS, category: "Food" };  // i18n-ignore  category id
  }

  function bake(recipeId, n) {
    const S = state();
    const V = VS();
    const rec = recipe(recipeId);
    const b = baseItem();
    n = Math.floor(Number(n) || 0);
    if (!S || !rec) return { ok: false, reason: "noRecipe" };
    if (!V || !b) return { ok: false, reason: "noHold" };
    if (n <= 0) return { ok: false, reason: "nothing" };
    if (basesAboard() < n) return { ok: false, reason: "noBases" };
    const cost = toppingsCost(rec.toppings) * n;
    if (gold() < cost) return { ok: false, reason: "noFunds" };
    V.remove(HOLD, b, n);
    const made = V.addGoods(HOLD, goodKey(rec.id), n, goodMeta(rec));
    if (made < n) V.add(HOLD, b, n - made);
    if (made <= 0) return { ok: false, reason: "holdFull" };
    party().loseGold(toppingsCost(rec.toppings) * made);
    return { ok: true, cost: toppingsCost(rec.toppings) * made, units: made };
  }

  function sell(recipeId, n, where) {
    const V = VS();
    const rec = recipe(recipeId);
    const o = where || orbit();
    if (!o || !o.market) return { ok: false, reason: "noBuyer" };
    if (!rec) return { ok: false, reason: "noRecipe" };
    if (!V) return { ok: false, reason: "noHold" };
    n = Math.min(Math.floor(Number(n) || 0), cargoOf(rec.id));
    if (n <= 0) return { ok: false, reason: "emptyHold" };
    const M = marketState(o.market.key, today());
    const q = quote(rec, o.market, n, M.sat);
    M.sat = q.sat;
    V.removeGoods(HOLD, goodKey(rec.id), n);
    const pay = payout(o.market, q.value, M);
    return { ok: true, units: n, value: q.value, gold: pay.gold, items: pay.items };
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------
  function openRoute(recipeId, units, where) {
    const S = state();
    const o = where || orbit();
    if (!o || !o.market) return { ok: false, reason: "noBuyer" };
    if (!recipe(recipeId)) return { ok: false, reason: "noRecipe" };
    if (S.routes.length >= MAX_ROUTES) return { ok: false, reason: "tooManyRoutes" };
    units = Math.floor(Number(units) || 0);
    if (units <= 0) return { ok: false, reason: "nothing" };
    if (S.lastSettledDay == null) S.lastSettledDay = today();
    const r = {
      id: "r" + (S.nextId++),
      system: o.market.system, body: o.market.body, kind: o.market.kind,
      dist: o.market.dist, recipeId, units,
    };
    S.routes.push(r);
    return { ok: true, route: r };
  }

  function closeRoute(id) {
    const S = state();
    const idx = S.routes.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    S.routes.splice(idx, 1);
    return true;
  }

  function routeMarket(r) {
    return {
      kind: r.kind, currency: KINDS[r.kind].currency, key: r.system + "|" + r.body,
      system: r.system, body: r.body, dist: r.dist || 1,
    };
  }

  // What a route clears in a day on a fresh market, net of baking and freight.
  function routeEstimate(r) {
    const rec = recipe(r.recipeId);
    if (!rec) return 0;
    const m = routeMarket(r);
    const fee = r.kind === "earth" ? 0 : FREIGHT;
    const value = quote(rec, m, r.units, marketState(m.key, today()).sat).value;
    return Math.round(value * (1 - fee)) - unitCost(rec.toppings) * r.units;
  }

  // Runs every day elapsed since the last call, at most thirty of them. A day
  // a route cannot pay its baking for is skipped, not owed. A route buys its
  // bases under contract and never touches the cargo bay.
  function settle(day) {
    const S = state();
    if (!S) return null;
    const now = day == null ? today() : day;
    if (S.lastSettledDay == null || !S.routes.length) { S.lastSettledDay = now; return null; }
    const elapsed = now - S.lastSettledDay;
    if (elapsed <= 0) return null;
    const days = Math.min(elapsed, MAX_CATCHUP_DAYS);
    const report = { days, units: 0, cost: 0, gold: 0, items: {}, skipped: 0 };
    const p = party();
    for (let d = now - days + 1; d <= now; d++) {
      for (const r of S.routes) {
        const rec = recipe(r.recipeId);
        if (!rec) continue;
        const cost = unitCost(rec.toppings) * r.units;
        if (gold() < cost) { report.skipped++; continue; }
        p.loseGold(cost);
        const m = routeMarket(r);
        const M = marketState(m.key, d);
        const q = quote(rec, m, r.units, M.sat);
        M.sat = q.sat;
        const fee = r.kind === "earth" ? 0 : FREIGHT;
        const pay = payout(m, Math.round(q.value * (1 - fee)), M);
        report.units += r.units;
        report.cost += cost;
        report.gold += pay.gold;
        for (const id in pay.items) report.items[id] = (report.items[id] || 0) + pay.items[id];
      }
    }
    S.lastSettledDay = now;
    S.lastReport = report;
    if (report.units || report.skipped) toastReport(report);
    return report;
  }

  function entriesOf(items) {
    return Object.keys(items || {}).map((id) => ({ id: Number(id), qty: items[id] }));
  }

  function toastReport(rep) {
    const PT = window.ParchmentToast;
    if (!PT || typeof PT.reward !== "function") return;
    const lines = [T("toast.routeLine", { days: rep.days, units: rep.units, cost: money(rep.cost) })];
    if (rep.skipped) lines.push(T("toast.routeSkipped", { n: rep.skipped }));
    PT.reward({ title: T("toast.routeTitle"), gold: rep.gold, entries: entriesOf(rep.items), lines });
  }

  // ---------------------------------------------------------------------------
  // Trade with the factions of a world
  // ---------------------------------------------------------------------------
  // The kind of trading world the ship orbits, or null: Earth, the Tourists'
  // two worlds, the Dargos' Titania.
  function tradeWorldOf(o) {
    if (o && o.market && o.market.colony) return "colony";
    const k = o && o.market && o.market.kind;
    return k && TRADE_WORLDS[k] ? k : null;
  }

  // The house a colony trades as: one per colony, named after it.
  function colonyTrader(colony) {
    if (!colony) return null;
    const id = COLONY_TRADER_BASE + (fnv1a("colony|" + colony.id) % 900000);
    _colonyTraders.set(id, colony);
    return { id, name: colony.name, colony: colony.id };
  }
  const _colonyTraders = new Map();
  function colonyOfTrader(fid) { return _colonyTraders.get(fid) || null; }

  function allFactions() {
    const F = typeof $gameFactions !== "undefined" ? $gameFactions : null;
    if (!F || typeof F.getAllFactions !== "function") return [];
    return (F.getAllFactions() || []).filter((f) => f && Number.isFinite(f.id));
  }

  // Who trades on a world. On Earth, one house for each power that holds
  // ground there: the first faction of that power. Off it, the factions of
  // the power that holds the world.
  function factionsAt(world) {
    if (world === "colony") {
      const o = orbit();
      const GS = window.GalaxySim;
      const colony = (o && o.market && o.market.colony && GS && GS.colonyById)
        ? GS.colonyById(o.market.colony) : null;
      const trader = colonyTrader(colony);
      return trader ? [trader] : [];
    }
    const all = allFactions();
    if (world === "tourist") return all.filter((f) => TOURIST_FACTIONS.indexOf(f.id) >= 0);
    if (world === "dargos") return all.filter((f) => DARGOS_FACTIONS.indexOf(f.id) >= 0);
    if (world !== "earth") return [];
    const seen = new Set();
    const out = [];
    for (const f of all.slice().sort((a, b) => a.id - b.id)) {
      const power = f.parentHyperpower;
      if (!power || OFFWORLD_POWERS.indexOf(power) >= 0 || seen.has(power)) continue;
      seen.add(power);
      out.push(f);
    }
    return out;
  }

  function factionName(f) {
    if (!f) return "";
    if (f.colony) return String(f.name);
    const FDM = window.FactionDataManager && window.FactionDataManager.instance;
    try {
      if (FDM && typeof FDM.t === "function") return FDM.t(f.name);
    } catch (e) { /* the raw key below */ }
    return typeof window.T === "function" ? window.T(f.name) : String(f.name);
  }

  function reputation(fid) {
    if (fid >= COLONY_TRADER_BASE) return 0;   // a colony keeps no standing
    const F = typeof $gameFactions !== "undefined" ? $gameFactions : null;
    const r = F && typeof F.getReputation === "function" ? Number(F.getReputation(fid)) : 0;
    return isFinite(r) ? r : 0;
  }

  let _tradeable = null;
  function tradeableItems() {
    if (_tradeable && _tradeable.src === $dataItems) return _tradeable.list;
    const list = [];
    for (const it of ($dataItems || [])) {
      if (!it || !it.name || !(Number(it.price) > 0) || it.itypeId !== 1) continue;
      if (it.id >= 1501 && it.id <= 1600) continue;
      const cat = categoryOf(it);
      if (!cat || UNTRADED.indexOf(cat) >= 0) continue;
      list.push(it);
    }
    _tradeable = { src: $dataItems, list };
    return list;
  }

  // The three kinds of goods a faction deals in most. A colony deals in what
  // it makes.
  function favouredOf(fid) {
    const colony = colonyOfTrader(fid);
    if (colony && COLONY_GOODS[colony.production]) return COLONY_GOODS[colony.production].slice();
    const cats = [];
    for (const it of tradeableItems()) { const c = categoryOf(it); if (cats.indexOf(c) < 0) cats.push(c); }
    cats.sort();
    const out = [];
    for (let i = 0; out.length < 3 && i < 12 && cats.length; i++) {
      const c = cats[fnv1a("fav|" + fid + "|" + i) % cats.length];
      if (out.indexOf(c) < 0) out.push(c);
    }
    return out;
  }

  // A faction's goods this week: two thirds from what it deals in most, the
  // rest from anything. The aliens lean to the dearer end of a shelf.
  function catalogue(fid, world, week) {
    const all = tradeableItems();
    if (!all.length) return [];
    const fav = favouredOf(fid);
    const pool = all.filter((it) => fav.indexOf(categoryOf(it)) >= 0);
    const out = [];
    const seen = new Set();
    for (let i = 0; out.length < STOCK_ROWS && i < STOCK_ROWS * 6; i++) {
      const h = fnv1a("stock|" + fid + "|" + week + "|" + i);
      const from = (pool.length && (h % 3) !== 0) ? pool : all;
      let it = from[(h >>> 4) % from.length];
      if (world !== "earth") {
        const alt = from[(h >>> 12) % from.length];
        if (alt && alt.price > it.price) it = alt;
      }
      if (!it || seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it.id);
    }
    return out;
  }

  function weekOf(day) { return Math.floor((day == null ? today() : day) / 7); }

  // How many of a good a faction has left to sell this week.
  function stockLeft(fid, world, itemId) {
    const S = state();
    const week = weekOf();
    let st = S.stock[fid];
    if (!st || st.week !== week) {
      st = S.stock[fid] = { week, left: {} };
      for (const id of catalogue(fid, world, week)) {
        const it = $dataItems[id];
        const base = clamp(Math.round(40000 / Math.max(1, it.price)), 5, 500);
        st.left[id] = Math.max(1, Math.round(base * (0.6 + (fnv1a("n|" + fid + "|" + id + "|" + week) % 80) / 100)));
      }
    }
    return itemId == null ? st.left : (st.left[itemId] || 0);
  }

  function tradeKey(fid, itemId) { return "trade|" + fid + "|" + itemId; }

  // Standing moves a price by up to a quarter either way.
  function standingFactor(fid, selling) {
    const r = clamp(reputation(fid), -100, 100) / 100;
    return selling ? 1 + r * 0.25 : 1 - r * 0.25;
  }

  // Buying n of a good: each unit dearer than the last as the faction's shelf
  // empties of it.
  function quoteBuy(fid, world, item, n) {
    const W = TRADE_WORLDS[world];
    const M = marketState(tradeKey(fid, item.id), today());
    let sat = M.sat, value = 0;
    const p = item.price * marketIndex(item) * W.buy * standingFactor(fid, false);
    for (let i = 0; i < n; i++) {
      value += p * (1 + 0.5 * Math.max(0, sat));
      sat = Math.min(1, sat + 1 / TRADE_CAPACITY);
    }
    return { value: Math.round(value), sat };
  }

  // Selling n: each unit worth less than the last as the faction fills up.
  function quoteSell(fid, world, item, n) {
    const W = TRADE_WORLDS[world];
    const M = marketState(tradeKey(fid, item.id), today());
    let sat = M.sat, value = 0;
    const p = item.price * marketIndex(item) * W.sell * standingFactor(fid, true);
    for (let i = 0; i < n; i++) {
      value += p * (1 - SAT_PRICE_DROP * clamp(-sat, 0, 1));
      sat = Math.max(-1, sat - 1 / TRADE_CAPACITY);
    }
    return { value: Math.round(value), sat };
  }

  // A trade worth something is noticed: a point of standing per 500 euros,
  // at most two a deal.
  function noteTrade(fid, value) {
    const F = typeof $gameFactions !== "undefined" ? $gameFactions : null;
    const pts = Math.min(2, Math.floor(value / 50000));
    // A colony is no faction of Factions.json: nobody keeps a standing for it.
    if (fid >= COLONY_TRADER_BASE) return;
    if (pts > 0 && F && typeof F.changeReputation === "function") {
      try { F.changeReputation(fid, pts); } catch (e) { /* standing is a bonus */ }
    }
  }

  function tradeWorldFor(fid) {
    if (fid >= COLONY_TRADER_BASE) return "colony";
    if (TOURIST_FACTIONS.indexOf(fid) >= 0) return "tourist";
    if (DARGOS_FACTIONS.indexOf(fid) >= 0) return "dargos";
    return "earth";
  }

  // The faction must be on the world the ship orbits.
  function tradeContext(fid, where) {
    const o = where || orbit();
    const world = tradeWorldOf(o);
    if (!world) return { reason: "noTradeWorld" };
    if (!factionsAt(world).some((f) => f.id === fid)) return { reason: "noFaction" };
    if (reputation(fid) <= REFUSE_BELOW) return { reason: "refused" };
    if (!VS()) return { reason: "noHold" };
    return { world };
  }

  function buyGoods(fid, itemId, n, where) {
    const ctx = tradeContext(fid, where);
    if (!ctx.world) return { ok: false, reason: ctx.reason };
    const item = $dataItems[itemId];
    n = Math.floor(Number(n) || 0);
    if (!item || n <= 0) return { ok: false, reason: "nothing" };
    const left = stockLeft(fid, ctx.world, itemId);
    if (left <= 0) return { ok: false, reason: "soldOut" };
    const want = Math.min(n, left, VS().room(HOLD, item));
    if (want <= 0) return { ok: false, reason: "holdFull" };
    const q = quoteBuy(fid, ctx.world, item, want);
    if (gold() < q.value) return { ok: false, reason: "noFunds" };
    const put = VS().add(HOLD, item, want);
    const cost = put === want ? q.value : quoteBuy(fid, ctx.world, item, put).value;
    party().loseGold(cost);
    stockLeft(fid, ctx.world)[itemId] = left - put;
    marketState(tradeKey(fid, itemId), today()).sat = quoteBuy(fid, ctx.world, item, put).sat;
    noteTrade(fid, cost);
    return { ok: true, units: put, cost };
  }

  function sellGoods(fid, itemId, n, where) {
    const ctx = tradeContext(fid, where);
    if (!ctx.world) return { ok: false, reason: ctx.reason };
    const item = $dataItems[itemId];
    n = Math.min(Math.floor(Number(n) || 0), item ? VS().count(HOLD, item) : 0);
    if (!item || n <= 0) return { ok: false, reason: "emptyHold" };
    const q = quoteSell(fid, ctx.world, item, n);
    VS().remove(HOLD, item, n);
    party().gainGold(q.value);
    marketState(tradeKey(fid, itemId), today()).sat = q.sat;
    noteTrade(fid, q.value);
    return { ok: true, units: n, value: q.value };
  }

  // Every item in the bay, with what this faction would give for one.
  function cargoItems() {
    const V = VS();
    return V ? V.items(HOLD).sort((a, b) => itemName(a.item).localeCompare(itemName(b.item))) : [];
  }

  // ---------------------------------------------------------------------------
  // The console (DOM, inside the star map overlay)
  // ---------------------------------------------------------------------------
  const ui = {
    tab: "market",
    qty: 10,
    sel: MARGHERITA_ID,
    draft: { name: "", toppings: [] },
    search: "",
    routeUnits: ROUTE_SIZES[0],
    faction: null,
    tradeMode: "buy",
    tradeSel: null,
    tradeSearch: "",
  };

  function isOpen(ov) {
    return !!(ov && ov.els && ov.els.pizza && window.UIPanel && window.UIPanel.isOpen(ov.els.pizza));
  }

  function open(ov, tab) {
    if (!ov || !ov.els.pizza) return;
    settle();
    if (!recipe(ui.sel)) ui.sel = MARGHERITA_ID;
    const o = orbit();
    if (tab) ui.tab = tab;
    else if (o && o.market && ui.tab !== "trade") ui.tab = "market";
    window.UIPanel.open(ov.els.pizza);
    ov._focusEl = null;
    render(ov);
  }

  function close(ov) {
    if (!isOpen(ov)) return;
    window.UIPanel.close(ov.els.pizza);
    ov._focusEl = null;
    ov._invalidateFocusables();
  }

  function btn(action, label, extra, cls) {
    return `<span class="gx-btn${cls ? " " + cls : ""} focusable" tabindex="0" data-action="${action}"` +
      `${extra || ""}>${label}</span>`;
  }

  function off(label) { return `<span class="gx-btn gx-disabled">${label}</span>`; }

  function toppingNames(rec) {
    return (rec.toppings || []).map((id) => esc(itemName($dataItems[id]))).join(", ");
  }

  function qtyRow(maxLabel) {
    const step = (d) => btn("pz-qty", (d > 0 ? "+" : "") + d, ` data-d="${d}"`);
    return `<div class="gx-pz-qty">${step(-100)}${step(-10)}${step(-1)}` +
      `<span class="gx-pz-qty-val">${ui.qty}</span>` +
      `${step(1)}${step(10)}${step(100)}${btn("pz-qty", maxLabel, ' data-d="max"')}</div>`;
  }

  function header() {
    const S = state();
    const V = VS();
    const used = V ? V.usedGrams(HOLD) : 0;
    const cap = V ? V.capacity(HOLD) : 0;
    const tabs = ["market", "kitchen", "routes", "trade"];
    return `<div class="gx-title">${T("title")}</div>` +
      `<div class="gx-muted">${T("status", { funds: money(gold()), used: kg(used), cap: kg(cap),
        pizzas: cargoTotal(), routes: S.routes.length })}</div>` +
      `<div class="gx-pz-tabs">` +
      tabs.map((t) => btn("pz-tab", T("tab." + t), ` data-tab="${t}"`, ui.tab === t ? "gx-on" : "")).join("") +
      (V ? btn("pz-cargo", T("cargoBay")) : "") +
      `</div><div class="gx-divider"></div>`;
  }

  function renderMarket() {
    const o = orbit();
    let h = "";
    if (!o) return `<div class="gx-muted">${T("market.notInOrbit")}</div>` +
      `<div class="gx-pz-note">${T("market.knownBuyers")}</div>`;
    if (!o.market) return `<div class="gx-muted">${T("market.noBuyers", { body: esc(o.body.name) })}</div>` +
      `<div class="gx-pz-note">${T("market.knownBuyers")}</div>`;
    const m = o.market;
    const prefs = prefsOf(m.key);
    const M = marketState(m.key, today());
    const pays = m.currency === "euro" ? T("market.paysEuros")
      : T("market.paysMaterials", { list: prefs.materials.map((id) => esc(itemName($dataItems[id]))).join(", ") });
    h += `<div class="gx-pz-head"><b>${esc(m.body)}</b> · ${T("kind." + m.kind)}</div>` +
      `<div class="gx-muted">${pays}</div>` +
      `<div class="gx-pz-note">${T("market.taste", {
        like: esc(itemName($dataItems[prefs.like])), dislike: esc(itemName($dataItems[prefs.dislike])) })}</div>` +
      `<div class="gx-pz-note">${T("market.index", { pct: Math.round(pizzaIndex() * 100) })}</div>` +
      `<div class="gx-pz-satrow"><span>${T("market.saturation")}</span>` +
      `<div class="gx-pz-bar"><div class="gx-pz-fill" style="--ui-bar-w:${Math.round(M.sat * 100)}%"></div></div>` +
      `<span>${Math.round(M.sat * 100)}%</span></div>`;
    h += `<div class="gx-pz-list">` + recipes().map((r) => {
      const unit = quote(r, m, 1, M.sat).value;
      const held = cargoOf(r.id);
      return `<div class="gx-pz-row${ui.sel === r.id ? " gx-pz-sel" : ""}">` +
        `<div class="gx-pz-main"><div class="gx-pz-name">${esc(r.name)}</div>` +
        `<div class="gx-pz-sub">${T("market.row", { held, price: money(unit) })}</div></div>` +
        btn("pz-sel", T("pick"), ` data-id="${esc(r.id)}"`, ui.sel === r.id ? "gx-on" : "") + `</div>`;
    }).join("") + `</div>`;
    const rec = recipe(ui.sel);
    const held = rec ? cargoOf(rec.id) : 0;
    const n = Math.min(ui.qty, held);
    const value = rec && n > 0 ? quote(rec, m, n, M.sat).value : 0;
    h += qtyRow(T("max"));
    h += `<div class="gx-actions">` +
      (n > 0 ? btn("pz-sell", T("market.sell", { n, value: money(value) }), "", "gx-land") : off(T("market.holdEmpty"))) +
      (held > 0 ? btn("pz-sell-all", T("market.sellAll", { n: held })) : "") + `</div>`;
    const S = state();
    h += `<div class="gx-divider"></div><div class="gx-pz-head">${T("routes.openHere")}</div>` +
      `<div class="gx-actions">` + ROUTE_SIZES.map((u) =>
        btn("pz-route-size", T("routes.perDay", { n: u }), ` data-n="${u}"`, ui.routeUnits === u ? "gx-on" : "")).join("") +
      (S.routes.length < MAX_ROUTES ? btn("pz-route-open", T("routes.open"), "", "gx-gold") : off(T("routes.full"))) +
      `</div>`;
    return h;
  }

  function renderKitchen() {
    const S = state();
    const b = baseItem();
    const bases = basesAboard();
    let h = `<div class="gx-pz-head">${T("kitchen.bases", { n: bases, price: money(basePrice()) })}</div>` +
      `<div class="gx-actions">` + BASE_LOTS.map((n) =>
        btn("pz-buy-bases", T("kitchen.buyBases", { n, cost: money(Math.round(basePrice() * (n >= 100 ? BULK_DISCOUNT : 1)) * n) }),
          ` data-n="${n}"`)).join("") + `</div>`;
    if (!b) h = "";
    h += `<div class="gx-pz-list">` + recipes().map((r) => {
      const held = cargoOf(r.id);
      return `<div class="gx-pz-row${ui.sel === r.id ? " gx-pz-sel" : ""}">` +
        `<div class="gx-pz-main"><div class="gx-pz-name">${esc(r.name)}</div>` +
        `<div class="gx-pz-sub">${toppingNames(r)}</div>` +
        `<div class="gx-pz-sub">${T("kitchen.row", { cost: money(toppingsCost(r.toppings)), held })}</div></div>` +
        btn("pz-sel", T("pick"), ` data-id="${esc(r.id)}"`, ui.sel === r.id ? "gx-on" : "") +
        (r.builtin ? "" : btn("pz-del", T("kitchen.delete"), ` data-id="${esc(r.id)}"`)) + `</div>`;
    }).join("") + `</div>`;
    const rec = recipe(ui.sel);
    const cost = rec ? toppingsCost(rec.toppings) * ui.qty : 0;
    h += qtyRow(T("max"));
    h += `<div class="gx-actions">` +
      (rec && bases >= ui.qty && gold() >= cost
        ? btn("pz-bake", T("kitchen.bake", { n: ui.qty, cost: money(cost) }), "", "gx-land")
        : off(bases < ui.qty ? T("kitchen.needBases", { n: ui.qty }) : T("kitchen.bake", { n: ui.qty, cost: money(cost) }))) +
      `</div>`;

    // The builder.
    const d = ui.draft;
    h += `<div class="gx-divider"></div><div class="gx-pz-head">${T("kitchen.newPizza")}</div>` +
      `<div class="gx-pz-builder"><input class="gx-pz-input focusable" data-action="pz-input" data-role="pz-name" ` +
      `maxlength="32" placeholder="${esc(T("kitchen.namePlaceholder"))}" value="${esc(d.name)}">` +
      `<div class="gx-pz-chips">` + (d.toppings.length ? d.toppings.map((id) => {
        const it = $dataItems[id];
        return btn("pz-untop", iconHtml(it.iconIndex) + esc(itemName(it)), ` data-id="${id}"`, "gx-pz-chip");
      }).join("") : `<span class="gx-muted">${T("kitchen.noToppings")}</span>`) + `</div>` +
      `<div class="gx-pz-sub">${T("kitchen.toppingCount", { n: d.toppings.length, max: MAX_TOPPINGS })} · ` +
      `${T("kitchen.unitCost", { cost: money(unitCost(d.toppings)) })}</div>` +
      `<input class="gx-pz-input focusable" data-action="pz-input" data-role="pz-search" ` +
      `placeholder="${esc(T("kitchen.searchPlaceholder"))}" value="${esc(ui.search)}">` +
      `<div class="gx-pz-foods" data-role="pz-foods">${renderFoods()}</div>` +
      `<div class="gx-actions">` +
      (d.toppings.length && S.recipes.length < MAX_RECIPES
        ? btn("pz-save", T("kitchen.save"), "", "gx-gold")
        : off(S.recipes.length >= MAX_RECIPES ? T("kitchen.tooMany") : T("kitchen.save"))) +
      `</div></div>`;
    return h;
  }

  function renderFoods() {
    const full = ui.draft.toppings.length >= MAX_TOPPINGS;
    const list = searchFoods(ui.search).slice(0, FOOD_LIST_SHOWN);
    if (!list.length) return `<span class="gx-muted">${T("kitchen.noFoods")}</span>`;
    return list.map((it) => {
      const label = iconHtml(it.iconIndex) + esc(itemName(it)) +
        ` <span class="gx-pz-price">+${money(toppingCost(it.id))}</span>`;
      return full || ui.draft.toppings.indexOf(it.id) >= 0
        ? `<span class="gx-btn gx-pz-food gx-disabled">${label}</span>`
        : btn("pz-top", label, ` data-id="${it.id}"`, "gx-pz-food");
    }).join("");
  }

  function renderRoutes() {
    const S = state();
    let h = `<div class="gx-pz-note">${T("routes.howTo")}</div>`;
    h += S.routes.length ? `<div class="gx-pz-list">` + S.routes.map((r) => {
      const rec = recipe(r.recipeId);
      const est = routeEstimate(r);
      return `<div class="gx-pz-row"><div class="gx-pz-main">` +
        `<div class="gx-pz-name">${esc(r.body)} · ${T("kind." + r.kind)}</div>` +
        `<div class="gx-pz-sub">${T("routes.row", { n: r.units, pizza: esc(rec ? rec.name : "?") })}</div>` +
        `<div class="gx-pz-sub">${T(est >= 0 ? "routes.estimateGain" : "routes.estimateLoss",
          { value: money(Math.abs(est)) })}</div></div>` +
        btn("pz-route-close", T("routes.close"), ` data-id="${esc(r.id)}"`) + `</div>`;
    }).join("") + `</div>` : `<div class="gx-muted">${T("routes.none")}</div>`;
    const rep = S.lastReport;
    if (rep) {
      h += `<div class="gx-divider"></div><div class="gx-pz-head">${T("routes.lastReport")}</div>` +
        `<div class="gx-pz-sub">${T("toast.routeLine", { days: rep.days, units: rep.units, cost: money(rep.cost) })}</div>` +
        (rep.gold ? `<div class="gx-pz-sub">${T("routes.earned", { value: money(rep.gold) })}</div>` : "") +
        entriesOf(rep.items).map((e) => `<div class="gx-pz-sub">${iconHtml($dataItems[e.id].iconIndex)}` +
          `${esc(itemName($dataItems[e.id]))} x${e.qty}</div>`).join("");
    }
    return h;
  }

  function renderTrade() {
    const o = orbit();
    const world = tradeWorldOf(o);
    if (!world) return `<div class="gx-muted">${T("trade.notHere")}</div>`;
    const factions = factionsAt(world);
    if (!factions.length) return `<div class="gx-muted">${T("trade.noFactions")}</div>`;
    if (!factions.some((f) => f.id === ui.faction)) ui.faction = factions[0].id;
    const fid = ui.faction;
    const rep = reputation(fid);
    let h = `<div class="gx-pz-head"><b>${esc(o.body.name)}</b> · ${T("kind." + world)}</div>` +
      `<div class="gx-actions gx-pz-wrap">` + factions.map((f) =>
        btn("pz-faction", esc(factionName(f)), ` data-id="${f.id}"`, f.id === fid ? "gx-on" : "")).join("") + `</div>` +
      `<div class="gx-pz-note">${T("trade.standing", { rep })} · ` +
      `${T("trade.deals", { list: favouredOf(fid).map((c) => esc(categoryLabel(c))).join(", ") })}</div>`;
    if (rep <= REFUSE_BELOW) return h + `<div class="gx-muted">${T("error.refused")}</div>`;
    h += `<div class="gx-pz-tabs">` +
      btn("pz-trade-mode", T("trade.buy"), ' data-tab="buy"', ui.tradeMode === "buy" ? "gx-on" : "") +
      btn("pz-trade-mode", T("trade.sell"), ' data-tab="sell"', ui.tradeMode === "sell" ? "gx-on" : "") + `</div>`;
    let rows = [];
    if (ui.tradeMode === "buy") {
      const left = stockLeft(fid, world);
      rows = Object.keys(left).map(Number).map((id) => ({ item: $dataItems[id], n: left[id] }))
        .filter((r) => r.item);
    } else {
      rows = cargoItems().map((e) => ({ item: e.item, n: e.qty }));
      const q = ui.tradeSearch.trim().toLowerCase();
      h += `<input class="gx-pz-input focusable" data-action="pz-input" data-role="pz-trade-search" ` +
        `placeholder="${esc(T("trade.searchPlaceholder"))}" value="${esc(ui.tradeSearch)}">`;
      if (q) rows = rows.filter((r) => itemName(r.item).toLowerCase().indexOf(q) >= 0);
      rows = rows.slice(0, CARGO_LIST_SHOWN);
    }
    if (!rows.some((r) => r.item.id === ui.tradeSel)) ui.tradeSel = rows.length ? rows[0].item.id : null;
    h += `<div class="gx-pz-list" data-role="pz-trade-list">` + (rows.length ? rows.map((r) => {
      const unit = ui.tradeMode === "buy" ? quoteBuy(fid, world, r.item, 1).value : quoteSell(fid, world, r.item, 1).value;
      return `<div class="gx-pz-row${ui.tradeSel === r.item.id ? " gx-pz-sel" : ""}">` +
        `<div class="gx-pz-main"><div class="gx-pz-name">${iconHtml(r.item.iconIndex)}${esc(itemName(r.item))}</div>` +
        `<div class="gx-pz-sub">${T(ui.tradeMode === "buy" ? "trade.rowBuy" : "trade.rowSell",
          { n: r.n, price: money(unit), kg: kg(weightOf(r.item)) })}</div></div>` +
        btn("pz-trade-sel", T("pick"), ` data-id="${r.item.id}"`, ui.tradeSel === r.item.id ? "gx-on" : "") + `</div>`;
    }).join("") : `<div class="gx-muted">${T(ui.tradeMode === "buy" ? "trade.noStock" : "trade.emptyBay")}</div>`) + `</div>`;
    const item = ui.tradeSel ? $dataItems[ui.tradeSel] : null;
    h += qtyRow(T("max"));
    if (item) {
      const n = ui.qty;
      if (ui.tradeMode === "buy") {
        const can = Math.min(n, stockLeft(fid, world, item.id), VS() ? VS().room(HOLD, item) : 0);
        const cost = can > 0 ? quoteBuy(fid, world, item, can).value : 0;
        h += `<div class="gx-actions">` + (can > 0
          ? btn("pz-trade-go", T("trade.buyGo", { n: can, item: esc(itemName(item)), cost: money(cost) }), "", "gx-land")
          : off(T("trade.cannotBuy"))) + `</div>`;
      } else {
        const can = Math.min(n, VS() ? VS().count(HOLD, item) : 0);
        const value = can > 0 ? quoteSell(fid, world, item, can).value : 0;
        h += `<div class="gx-actions">` + (can > 0
          ? btn("pz-trade-go", T("trade.sellGo", { n: can, item: esc(itemName(item)), value: money(value) }), "", "gx-land")
          : off(T("trade.cannotSell"))) + `</div>`;
      }
    }
    return h;
  }

  function categoryLabel(c) {
    const key = "Inventory.category." + c;
    return typeof window.T === "function" && window.T.has && window.T.has(key) ? window.T(key) : c;
  }

  function render(ov) {
    const el = ov.els.pizza;
    if (!el) return;
    const focusKey = ov._focusEl ? (ov._focusEl.getAttribute("data-action") + "|" +
      (ov._focusEl.getAttribute("data-id") || ov._focusEl.getAttribute("data-d") ||
        ov._focusEl.getAttribute("data-tab") || ov._focusEl.getAttribute("data-n") || "")) : null;
    const body = ui.tab === "kitchen" ? renderKitchen() : ui.tab === "routes" ? renderRoutes()
      : ui.tab === "trade" ? renderTrade() : renderMarket();
    el.innerHTML = `<div class="gx-pz-card">${header()}<div class="gx-pz-body">${body}</div>` +
      `<div class="gx-actions">${btn("pz-close", T("close"))}</div></div>`;
    ov._wire(el);
    wireInputs(ov);
    ov._invalidateFocusables();
    if (focusKey) {
      const [a, k] = focusKey.split("|");
      const sel = k ? `[data-action="${a}"][data-id="${k}"],[data-action="${a}"][data-d="${k}"],` +
        `[data-action="${a}"][data-tab="${k}"],[data-action="${a}"][data-n="${k}"]` : `[data-action="${a}"]`;
      const again = el.querySelector(sel);
      ov._focusEl = again || null;
      ov._applyFocusClass();
    }
  }

  // The text fields. Typing never reaches Input (Hotkeys' InputTyping guard),
  // so Enter and Esc hand the keyboard back by leaving the field.
  function wireInputs(ov) {
    const el = ov.els.pizza;
    el.querySelectorAll("input.gx-pz-input").forEach((inp) => {
      inp.onclick = (e) => { e.stopPropagation(); inp.focus(); };
      inp.onkeydown = (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); inp.blur(); } };
      const role = inp.getAttribute("data-role");
      inp.oninput = () => {
        if (role === "pz-name") { ui.draft.name = inp.value; return; }
        if (role === "pz-trade-search") { ui.tradeSearch = inp.value; inp.onblur = () => render(ov); return; }
        ui.search = inp.value;
        const box = el.querySelector('[data-role="pz-foods"]');
        if (box) { box.innerHTML = renderFoods(); ov._wire(box); ov._invalidateFocusables(); }
      };
    });
  }

  function say(text, severity) {
    const PT = window.ParchmentToast;
    if (PT && typeof PT.show === "function") PT.show(text, { severity: severity || "info" });
  }

  function failed(res) {
    say(T("error." + res.reason), "warning");
    if (window.SoundManager) SoundManager.playBuzzer();
  }

  function clampQty(v) { return clamp(Math.floor(v), 1, QTY_MAX); }

  // The most the selected thing can be moved in one go, for the Max button.
  function maxQty() {
    if (ui.tab === "market") return cargoOf(ui.sel);
    if (ui.tab === "kitchen") { const rec = recipe(ui.sel); return rec ? maxBake(rec) : 0; }
    if (ui.tab === "trade" && ui.tradeSel) {
      const world = tradeWorldOf(orbit());
      const item = $dataItems[ui.tradeSel];
      if (!world || !item || !VS()) return 0;
      if (ui.tradeMode === "sell") return VS().count(HOLD, item);
      const room = Math.min(stockLeft(ui.faction, world, item.id), VS().room(HOLD, item));
      let lo = 0, hi = room;
      while (lo < hi) {   // as many as the money covers, rising price and all
        const mid = Math.ceil((lo + hi) / 2);
        if (quoteBuy(ui.faction, world, item, mid).value <= gold()) lo = mid; else hi = mid - 1;
      }
      return lo;
    }
    return 1;
  }

  function handle(ov, el) {
    const a = el.getAttribute("data-action");
    const id = el.getAttribute("data-id");
    if (a === "pizza") { isOpen(ov) ? close(ov) : open(ov); return; }
    if (a === "pz-trade-open" || a === "cat-trade") {
      if (ov.setCatalogOpen && ov.isCatalogOpen && ov.isCatalogOpen()) ov.setCatalogOpen(false);
      open(ov, "trade");
      return;
    }
    if (a === "pz-close") { close(ov); return; }
    if (a === "pz-input") { el.focus(); return; }
    if (a === "pz-cargo") {
      close(ov);
      if (VS()) VS().open(HOLD);
      return;
    }
    if (window.SoundManager) SoundManager.playCursor();
    if (a === "pz-tab") ui.tab = el.getAttribute("data-tab");
    else if (a === "pz-sel") ui.sel = id;
    else if (a === "pz-qty") {
      const d = el.getAttribute("data-d");
      ui.qty = d === "max" ? clampQty(maxQty() || 1) : clampQty(ui.qty + Number(d));
    } else if (a === "pz-buy-bases") {
      const res = buyBases(Number(el.getAttribute("data-n")));
      if (!res.ok) failed(res);
      else say(T("toast.basesBought", { n: res.units, cost: money(res.cost) }), "good");
    } else if (a === "pz-bake") {
      const res = bake(ui.sel, ui.qty);
      if (!res.ok) failed(res);
      else say(T("toast.baked", { n: res.units, cost: money(res.cost) }), "good");
    } else if (a === "pz-sell" || a === "pz-sell-all") {
      const n = a === "pz-sell-all" ? cargoOf(ui.sel) : ui.qty;
      const res = sell(ui.sel, n);
      if (!res.ok) failed(res);
      else {
        const PT = window.ParchmentToast;
        if (PT && PT.reward) PT.reward({ title: T("toast.soldTitle"), gold: res.gold,
          entries: entriesOf(res.items), lines: [T("toast.soldLine", { n: res.units })] });
        if (window.SoundManager && SoundManager.playShop) SoundManager.playShop();
      }
    } else if (a === "pz-route-size") ui.routeUnits = Number(el.getAttribute("data-n")) || ROUTE_SIZES[0];
    else if (a === "pz-route-open") {
      const res = openRoute(ui.sel, ui.routeUnits);
      if (!res.ok) failed(res);
      else say(T("toast.routeOpened", { body: esc(res.route.body), n: res.route.units }), "good");
    } else if (a === "pz-route-close") closeRoute(id);
    else if (a === "pz-top") {
      const n = Number(id);
      if (ui.draft.toppings.length < MAX_TOPPINGS && ui.draft.toppings.indexOf(n) < 0) ui.draft.toppings.push(n);
    } else if (a === "pz-untop") {
      ui.draft.toppings = ui.draft.toppings.filter((t) => t !== Number(id));
    } else if (a === "pz-save") {
      const res = createRecipe(ui.draft.name, ui.draft.toppings);
      if (!res.ok) failed(res);
      else {
        ui.sel = res.recipe.id;
        ui.draft = { name: "", toppings: [] };
        say(T("toast.saved", { name: esc(res.recipe.name) }), "good");
      }
    } else if (a === "pz-del") {
      const res = deleteRecipe(id);
      if (!res.ok) failed(res);
      else if (ui.sel === id) ui.sel = MARGHERITA_ID;
    } else if (a === "pz-faction") { ui.faction = Number(id); ui.tradeSel = null; }
    else if (a === "pz-trade-mode") { ui.tradeMode = el.getAttribute("data-tab"); ui.tradeSel = null; }
    else if (a === "pz-trade-sel") ui.tradeSel = Number(id);
    else if (a === "pz-trade-go") {
      const res = ui.tradeMode === "buy" ? buyGoods(ui.faction, ui.tradeSel, ui.qty) : sellGoods(ui.faction, ui.tradeSel, ui.qty);
      if (!res.ok) failed(res);
      else {
        const name = itemName($dataItems[ui.tradeSel]);
        say(ui.tradeMode === "buy"
          ? T("toast.bought", { n: res.units, item: esc(name), cost: money(res.cost) })
          : T("toast.sold", { n: res.units, item: esc(name), value: money(res.value) }), "good");
        if (window.SoundManager && SoundManager.playShop) SoundManager.playShop();
      }
    }
    render(ov);
  }

  // ---------------------------------------------------------------------------
  // Hooks into the star map
  // ---------------------------------------------------------------------------
  // Whether the ship orbits a world with factions to trade with.
  function canTradeHere() { return !!tradeWorldOf(orbit()); }

  const OV = window.GalaxySim.Overlay && window.GalaxySim.Overlay.GalaxyOverlay;
  if (OV) {
    const _create = OV.prototype.create;
    OV.prototype.create = function () {
      _create.apply(this, arguments);
      const rail = this.els.catToggle;
      if (rail) {
        const after = this.els.bridgeBtn;
        const html = `<span class="gx-btn gx-pizza focusable" tabindex="0" data-action="pizza" ` +
          `data-role="pizza-btn" title="${esc(T("buttonTooltip"))}">${T("button")}</span>` +
          `<span class="gx-btn gx-trade focusable ui-closed" tabindex="0" data-action="pz-trade-open" ` +
          `data-role="trade-btn" title="${esc(T("tradeTooltip"))}">${T("tradeButton")}</span>`;
        if (after) after.insertAdjacentHTML("afterend", html);
        else rail.insertAdjacentHTML("beforeend", html);
        this.els.pizzaBtn = rail.querySelector('[data-role="pizza-btn"]');
        this.els.tradeBtn = rail.querySelector('[data-role="trade-btn"]');
        for (const b of [this.els.pizzaBtn, this.els.tradeBtn]) if (b) b.onclick = () => this._invoke(b);
      }
      const panel = document.createElement("div");
      panel.id = "gx-pizza";
      panel.className = "ui-closed";
      this.root.appendChild(panel);
      this.els.pizza = panel;
      this._invalidateFocusables();
      settle();
    };

    // The Trade button stands on the rail only while there is a world to
    // trade with below the ship.
    OV.prototype.setTradeOffered = function (on) {
      const el = this.els && this.els.tradeBtn;
      if (!el || !window.UIPanel) return;
      if (window.UIPanel.isOpen(el) === !!on) return;
      window.UIPanel.toggle(el, !!on);
      this._invalidateFocusables();
    };

    const _invoke = OV.prototype._invoke;
    OV.prototype._invoke = function (el) {
      const a = el && el.getAttribute && el.getAttribute("data-action");
      if (a === "pizza" || a === "cat-trade" || (a && a.indexOf("pz-") === 0)) { handle(this, el); return; }
      return _invoke.apply(this, arguments);
    };

    // The console is a modal like the servicing bay: the scene already gives
    // an open bay the focus ring and closes it on Esc, so the console answers
    // to the same two questions.
    const _isServiceOpen = OV.prototype.isServiceOpen;
    OV.prototype.isServiceOpen = function () {
      return isOpen(this) || _isServiceOpen.apply(this, arguments);
    };
    const _hideService = OV.prototype.hideService;
    OV.prototype.hideService = function () {
      if (isOpen(this)) { close(this); return; }
      return _hideService.apply(this, arguments);
    };
  }

  const SC = window.Scene_AdvancedStarMap3D;
  if (SC && SC.prototype) {
    // Kept in step with the ship the way the Bridge button is.
    const _refreshBridge = SC.prototype._refreshBridgeButton;
    SC.prototype._refreshBridgeButton = function () {
      if (_refreshBridge) _refreshBridge.apply(this, arguments);
      const ov = this._overlayUI;
      if (ov && ov.setTradeOffered) ov.setTradeOffered(canTradeHere());
    };

    // The catalog row of the world the ship orbits offers Trade when there
    // are factions on it.
    const _buildCatalog = SC.prototype._buildCatalog;
    SC.prototype._buildCatalog = function () {
      const tabs = _buildCatalog.apply(this, arguments);
      const o = orbit();
      if (!tradeWorldOf(o)) return tabs;
      const byId = new Map((this._catalogEntries || []).map((e) => [e.id, e]));
      for (const tab of (tabs || [])) {
        for (const g of (tab.groups || [])) {
          for (const it of (g.items || [])) {
            const e = byId.get(it.id);
            const name = e && e.data && e.data.name;
            if (e && e.kind === "planet" && name === o.body.name && sysName(e.system) === sysName(o.system)) it.trade = true;
          }
        }
      }
      return tabs;
    };
  }

  // Routes run off the clock wherever the party is.
  if (typeof Scene_Map !== "undefined" && Scene_Map.prototype) {
    const _start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
      if (_start) _start.apply(this, arguments);
      try { settle(); } catch (e) { console.warn("[PizzaDelivery] settle failed", e); }
    };
  }

  const API = {
    MAX_TOPPINGS, MAX_RECIPES, MAX_ROUTES, MAX_CATCHUP_DAYS, TOPPING_FACTOR, KINDS, KIND_ORDER,
    ROUTE_SIZES, MATERIAL_IDS, FREIGHT, BASE_ITEM, PIZZA_GRAMS, HOLD, TRADE_WORLDS, BULK_DISCOUNT,
    COLONY_GOODS, COLONY_TRADER_BASE,
    state, foods, searchFoods, isFood, cleanToppings, toppingCost, toppingsCost, unitCost, basePrice,
    recipes, recipe, createRecipe, deleteRecipe, marketIndex, pizzaIndex,
    marketOf, distanceFactor, prefsOf, appeal, marketState, basePriceOf, quote, payout,
    orbit, cargoOf, cargoTotal, basesAboard, buyBases, maxBake, bake, sell,
    openRoute, closeRoute, routeEstimate, settle, today,
    tradeWorldOf, factionsAt, factionName, favouredOf, catalogue, stockLeft, standingFactor,
    quoteBuy, quoteSell, buyGoods, sellGoods, cargoItems, canTradeHere,
    isOpen, open, close,
  };
  window.GalaxySim.PizzaDelivery = API;
  window.GalaxySim.Trade = API;
})();
