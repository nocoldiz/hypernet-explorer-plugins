/*:
 * @target MZ
 * @plugindesc Vehicle Storage - every vehicle's own hold, sized to the vehicle: the Starship's cargo bay, the camper's lockers, the car's trunk, the boat's hold and the bike's basket.
 * @author nocoldiz
 *
 * @command openVehicleStorage
 * @text Open vehicle storage
 * @desc Opens a vehicle's own hold in the container window.
 *
 * @arg vehicle
 * @type select
 * @option airship
 * @option camper
 * @option car
 * @option boat
 * @option bike
 * @default camper
 *
 * @help
 * One answer to "what does this vehicle carry". Each vehicle the party owns
 * has a hold of its own, capped by weight in grams:
 *
 *   airship (the Starship)  cargo bay  10000 t
 *   camper                  lockers      350 kg
 *   car                     trunk         75 kg
 *   boat                    hold          40 kg
 *   bike                    basket        30 kg
 *
 * The broom and a ridden mount carry nothing.
 *
 * A hold is a container of ContainerSystem.js under the id vehicle_<key>, so
 * it is saved with the game and is never a world chest, and it opens in the
 * same container window (ContainerSystemUI.js) in its bulk mode: quantities
 * both ways, store all and take all.
 *
 * A hold can also carry GOODS: cargo that is not an item of the database,
 * such as the pizzas the Starship's galley bakes for delivery
 * (GalaxySim_PizzaDelivery.js). Goods weigh against the same capacity, are
 * listed beside the items and can be thrown out, but never go into the pack.
 *
 * window.VehicleStorage is the API every other plugin goes through:
 *   has(key), capacity(key), title(key), containerId(key)
 *   count(key, item), add(key, item, n), remove(key, item, n), items(key)
 *   addGoods(key, goodKey, n, meta), removeGoods(key, goodKey, n),
 *   goodsCount(key, goodKey), goods(key)
 *   usedGrams(key), freeGrams(key), fits(key, grams)
 *   stores()  the holds of every vehicle the party owns
 *   open(key)
 */

(() => {
    "use strict";

    const pluginName = "VehicleStorage";
    const T = (key, params) => (typeof window.T === "function" ? window.T("VehicleStorage." + key, params) : key);

    // i18n-ignore-start  vehicle keys and container ids
    const SPECS = {
        airship: { grams: 10000000000, kind: "cargoBay" },  // 10,000 t
        camper:  { grams: 350000,  kind: "lockers" },
        car:     { grams: 75000,   kind: "trunk" },
        boat:    { grams: 40000,   kind: "hold" },
        bike:    { grams: 30000,   kind: "basket" },
    };
    // The voxel world calls the Starship by its model's name.
    const ALIASES = { starship: "airship" };
    const PREFIX = "vehicle_";
    // i18n-ignore-end

    const keyOf = (key) => {
        const k = String(key || "").toLowerCase();
        return ALIASES[k] || k;
    };

    function has(key) { return !!SPECS[keyOf(key)]; }
    function capacity(key) { const s = SPECS[keyOf(key)]; return s ? s.grams : 0; }
    function containerId(key) { return PREFIX + keyOf(key); }
    function title(key) {
        const k = keyOf(key);
        return has(k) ? T("title." + k) : "";
    }

    function weightOf(item) {
        const U = window.ItemSystemUtils;
        return U && typeof U.getItemWeight === "function" ? U.getItemWeight(item) : 0;
    }

    const CM = () => window.ContainerManager;
    const enc = (item) => (window.ItemUtils && window.ItemUtils.encodeKey ? window.ItemUtils.encodeKey(item) : String(item.id));
    const dec = (k) => (window.ItemUtils && window.ItemUtils.decodeKey ? window.ItemUtils.decodeKey(k) : $dataItems[Number(k)]);

    //-------------------------------------------------------------------------
    // Goods: cargo that is not a database item.
    //-------------------------------------------------------------------------
    function goodsBag(key) {
        if (typeof $gameSystem === "undefined" || !$gameSystem) return {};
        if (!$gameSystem._vehicleGoods) $gameSystem._vehicleGoods = {};
        const k = keyOf(key);
        if (!$gameSystem._vehicleGoods[k]) $gameSystem._vehicleGoods[k] = {};
        return $gameSystem._vehicleGoods[k];
    }

    function goods(key) {
        const bag = goodsBag(key);
        return Object.keys(bag).filter((g) => bag[g].qty > 0).map((g) => Object.assign({ key: g }, bag[g]));
    }

    function goodsCount(key, goodKey) {
        const g = goodsBag(key)[goodKey];
        return g ? g.qty : 0;
    }

    function goodsGrams(key) {
        return goods(key).reduce((s, g) => s + (g.grams || 0) * g.qty, 0);
    }

    // meta: { name, iconIndex, grams, category }. Returns how many went in.
    function addGoods(key, goodKey, n, meta) {
        if (!has(key)) return 0;
        const m = meta || {};
        const bag = goodsBag(key);
        const grams = Math.max(0, Number(m.grams != null ? m.grams : (bag[goodKey] && bag[goodKey].grams)) || 0);
        const room = grams > 0 ? Math.floor(freeGrams(key) / grams) : Infinity;
        const fit = Math.max(0, Math.min(Math.floor(n) || 0, room));
        if (!fit) return 0;
        const cur = bag[goodKey] || { qty: 0 };
        bag[goodKey] = {
            qty: cur.qty + fit,
            grams,
            name: m.name != null ? m.name : cur.name,
            iconIndex: m.iconIndex != null ? m.iconIndex : (cur.iconIndex || 0),
            category: m.category || cur.category || "Misc",
        };
        return fit;
    }

    function removeGoods(key, goodKey, n) {
        const bag = goodsBag(key);
        const g = bag[goodKey];
        if (!g) return 0;
        const out = Math.max(0, Math.min(g.qty, Math.floor(n) || 0));
        g.qty -= out;
        if (g.qty <= 0) delete bag[goodKey];
        return out;
    }

    //-------------------------------------------------------------------------
    // Items
    //-------------------------------------------------------------------------
    function bag(key) {
        const M = CM();
        return M ? M.getContainer(containerId(key)) : {};
    }

    function items(key) {
        const b = bag(key);
        const out = [];
        for (const k in b) {
            if (b[k] > 0) {
                const item = dec(k);
                if (item) out.push({ item, qty: b[k] });
            }
        }
        return out;
    }

    function count(key, item) {
        const M = CM();
        return M && item ? M.getItemAmount(containerId(key), enc(item), false) : 0;
    }

    function itemGrams(key) {
        return items(key).reduce((s, e) => s + weightOf(e.item) * e.qty, 0);
    }

    function usedGrams(key) { return itemGrams(key) + goodsGrams(key); }
    function freeGrams(key) { return Math.max(0, capacity(key) - usedGrams(key)); }
    function fits(key, grams) { return has(key) && grams <= freeGrams(key); }

    // How many of an item still fit.
    function room(key, item) {
        const w = weightOf(item);
        return w > 0 ? Math.floor(freeGrams(key) / w) : Infinity;
    }

    // Puts up to n in; returns how many went in.
    function add(key, item, n) {
        const M = CM();
        if (!M || !item || !has(key)) return 0;
        const fit = Math.max(0, Math.min(Math.floor(n) || 0, room(key, item)));
        if (fit) M.addItem(containerId(key), enc(item), fit, false);
        return fit;
    }

    function remove(key, item, n) {
        const M = CM();
        if (!M || !item) return 0;
        const out = Math.max(0, Math.min(count(key, item), Math.floor(n) || 0));
        if (out) M.removeItem(containerId(key), enc(item), out, false);
        return out;
    }

    //-------------------------------------------------------------------------
    // Ownership and the holds the party can reach
    //-------------------------------------------------------------------------
    function owns(key) {
        const k = keyOf(key);
        const VS = window.VehicleSystem || window.MergedVehicleSystem;
        if (VS && typeof VS.ownsVehicleKey === "function") return !!VS.ownsVehicleKey(k);
        if (window.VehiclePosition && window.VehiclePosition.owns) return !!window.VehiclePosition.owns(k);
        return false;
    }

    function stores() {
        return Object.keys(SPECS).filter(owns).map((k) => ({
            key: k, id: containerId(k), name: title(k), limit: capacity(k), goodsGrams: goodsGrams(k),
        }));
    }

    //-------------------------------------------------------------------------
    // The window: the container scene in its bulk mode, goods included.
    //-------------------------------------------------------------------------
    function goodsProvider(key) {
        return {
            list: () => goods(key),
            discard: (goodKey, n) => removeGoods(key, goodKey, n),
            grams: () => goodsGrams(key),
        };
    }

    function open(key) {
        const k = keyOf(key);
        if (!has(k) || !window.Scene_Container) { if (window.SoundManager) SoundManager.playBuzzer(); return false; }
        SceneManager.push(window.Scene_Container);
        SceneManager.prepareNextScene(containerId(k), false, capacity(k), {
            title: title(k), bulk: true, goods: goodsProvider(k),
        });
        return true;
    }

    PluginManager.registerCommand(pluginName, "openVehicleStorage", (args) => {
        open(args && args.vehicle);
    });

    window.VehicleStorage = {
        SPECS, keyOf, has, capacity, title, containerId,
        items, count, add, remove, room,
        goods, goodsCount, addGoods, removeGoods, goodsGrams,
        usedGrams, freeGrams, fits, owns, stores, open,
    };
})();
