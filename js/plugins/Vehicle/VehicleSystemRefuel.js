//=============================================================================
// VehicleSystemRefuel.js
// Version: 1.1.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Fast Travel Refuel System v1.1.0 (Standard MZ Style)
 * @author Omni-Lex
 * @version 1.1.0
 * @description Refueling UI using standard RPG Maker MZ window style and bars.
 *
 * @param fuelCapacity
 * @text Fuel Tank Capacity
 * @desc Maximum fuel capacity in liters (RV camper capacity)
 * @type number
 * @default 100
 * 
 * @param carFuelCapacity
 * @text Car Fuel Tank Capacity
 * @desc Maximum fuel capacity in liters (Car capacity)
 * @type number
 * @default 60
 *
 * @command ShowRefuelWindow
 * @text Show Refuel Window
 * @desc Opens the refueling window for car and camper.
 *
 * @command RefuelMax
 * @text Refuel Camper to Maximum
 * @desc Instantly refuels the camper to maximum capacity.
 *
 * @command RefuelCarMax
 * @text Refuel Car to Maximum
 * @desc Instantly refuels the car to maximum capacity.
 *
 * @help VehicleSystemRefuel.js (v1.1.0)
 *
 * This plugin provides the refueling UI for vehicles used in the 
 * Fast Travel System.
 *
 * It manages:
 * - Refueling menu (Standard MZ Window Style)
 * - Fuel levels for Car and Camper (using MZ Gauge bars)
 * - Fuel price calculations (based on Variable 53)
 *
 * Requirements:
 * - FastTravelSystem.js (optional but recommended for travel integration)
 */

(() => {
    'use strict';

    const pluginName = 'VehicleSystemRefuel';
    const parameters = PluginManager.parameters(pluginName);
    // Fuel levels are managed per-vehicle in window.VehicleFuel (owned by the core
    // VehicleSystem), NOT in RPG Maker variables. Only capacities are read here.
    const fuelCapacity = parseInt(parameters['fuelCapacity']) || 100;
    const carFuelCapacity = parseInt(parameters['carFuelCapacity']) || 60;

    // Effective base capacity honoring the Expanded Tank upgrade (used only in the
    // legacy fallback path; window.VehicleFuel applies the upgrade itself).
    function upgradedCapacity(key, base) {
        return (window.VehicleUpgrades && window.VehicleUpgrades.effectiveMaxFuel)
            ? window.VehicleUpgrades.effectiveMaxFuel(key, base)
            : base;
    }

    // Global API for other plugins. The public surface is unchanged (FastTravel
    // and others call these), but storage now lives in the per-vehicle
    // window.VehicleFuel store instead of RPG Maker variables 65 / 71.
    window.VehicleSystemRefuel = {
        getFuelCapacity: () => fuelCapacity,
        getCarFuelCapacity: () => carFuelCapacity,

        // Effective capacities that honor the Expanded Tank upgrade (VehicleUpgrades).
        getMaxFuel: function() {
            return window.VehicleFuel ? window.VehicleFuel.max('camper')
                : upgradedCapacity('camper', fuelCapacity);
        },
        getCarMaxFuel: function() {
            return window.VehicleFuel ? window.VehicleFuel.max('car')
                : upgradedCapacity('car', carFuelCapacity);
        },

        getCurrentFuel: function() {
            return window.VehicleFuel ? window.VehicleFuel.get('camper') : 0;
        },

        getCurrentCarFuel: function() {
            return window.VehicleFuel ? window.VehicleFuel.get('car') : 0;
        },

        setCurrentFuel: function(amount) {
            if (window.VehicleFuel) window.VehicleFuel.set('camper', amount);
        },

        setCurrentCarFuel: function(amount) {
            if (window.VehicleFuel) window.VehicleFuel.set('car', amount);
        },

        getFuelPrice: function() {
            return $gameVariables.value(53) || 10;
        }
    };

    function goldToEuros(gold) {
        return (gold / 100).toFixed(2);
    }

    // Generic per-vehicle fuel access (keyed 'camper' | 'car' | ...) via the
    // per-vehicle store owned by VehicleSystem. The station now refuels ANY vehicle
    // the party owns, not just the hardcoded Car/Camper pair.
    function vehGet(key) { return window.VehicleFuel ? window.VehicleFuel.get(key) : 0; }
    function vehMax(key) { return window.VehicleFuel ? window.VehicleFuel.max(key) : 0; }
    function vehSet(key, v) { if (window.VehicleFuel) window.VehicleFuel.set(key, v); }

    // The owned vehicles that can be filled at a roadside pump, from VehicleSystem.
    function refuelableVehicles() {
        return (window.MergedVehicleSystem && window.MergedVehicleSystem.getRefuelableVehicles)
            ? window.MergedVehicleSystem.getRefuelableVehicles()
            : [];
    }

    // Plugin Commands
    const showRefuelWindowCommand = () => {
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.showRefuelWindow();
        }
    };
    PluginManager.registerCommand(pluginName, "ShowRefuelWindow", showRefuelWindowCommand);
    // Legacy key: older events invoke this command through FastTravelSystem.
    PluginManager.registerCommand("FastTravelSystem", "ShowRefuelWindow", showRefuelWindowCommand);

    PluginManager.registerCommand(pluginName, "RefuelMax", () => {
        window.VehicleSystemRefuel.setCurrentFuel(window.VehicleSystemRefuel.getMaxFuel());
    });

    PluginManager.registerCommand(pluginName, "RefuelCarMax", () => {
        window.VehicleSystemRefuel.setCurrentCarFuel(window.VehicleSystemRefuel.getCarMaxFuel());
    });

    //=============================================================================
    // Scene_Map Extensions, HTML Refuel Overlay
    //=============================================================================

    Scene_Map.prototype.showRefuelWindow = function () {
        if (this._refuelEl) return;
        this._rfView     = 'main';
        this._rfIdx      = 0;
        this._rfWaiting  = false;
        this._rfOptions  = [];
        this._rfVehicles = refuelableVehicles();
        this._rfRebuild();
    };

    // One selectable entry per owned, pump-refuelable vehicle. The station now
    // serves every vehicle the party owns, keyed by vehicle instead of the old
    // hardcoded Car (switch 64) / Camper (switch 51) pair.
    Scene_Map.prototype._rfBuildMainOptions = function () {
        const opts = (this._rfVehicles || []).map(v => ({
            type: 'select', key: v.key, label: T('Refuel.vehicleRefuel', { vehicle: v.name }), enabled: true
        }));
        opts.push({ type: 'exit', label: T('Refuel.exitStation'), enabled: true });
        return opts;
    };

    Scene_Map.prototype._rfBuildDetailOptions = function (key) {
        const VSR       = window.VehicleSystemRefuel;
        const curFuel   = vehGet(key);
        const maxCap    = vehMax(key);
        const fuelPrice = VSR.getFuelPrice();
        const maxRefuel = maxCap - curFuel;
        const opts      = [];

        if (maxRefuel > 0.1) {
            for (const liters of [5, 10, 25, 50]) {
                if (liters < maxRefuel) {
                    const cost = Math.floor(liters * fuelPrice);
                    opts.push({ type: 'refuel', label: T('Refuel.liters', { liters: liters }), liters,
                        cost, enabled: $gameParty.gold() >= cost });
                }
            }
            const cost = Math.floor(maxRefuel * fuelPrice);
            opts.push({ type: 'refuel', label: T('Refuel.fillTank', { liters: maxRefuel.toFixed(1) }),
                liters: maxRefuel, cost, enabled: $gameParty.gold() >= cost });
        }
        opts.push({ type: 'back', label: T('Refuel.back'), enabled: true, cost: 0, liters: 0 });
        return opts;
    };

    Scene_Map.prototype._rfRebuild = function () {
        if (this._refuelEl) { this._refuelEl.remove(); this._refuelEl = null; }
        // Refresh the owned-vehicle snapshot (fuel levels, ownership) each rebuild.
        this._rfVehicles = refuelableVehicles();
        this._rfOptions = this._rfView === 'main'
            ? this._rfBuildMainOptions()
            : this._rfBuildDetailOptions(this._rfView);
        if (this._rfIdx >= this._rfOptions.length) this._rfIdx = 0;

        const el = document.createElement('div');
        el.id        = 'refuel-container';
        el.className = 'book-spread';
        el.innerHTML = `
            <div class="left-page">${this._rfBuildLeft()}</div>
            <div class="right-page">${this._rfBuildRight()}</div>`;

        // Fullscreen centering wrapper (the .book-spread itself is position:relative
        // and would otherwise render in document flow, off-screen).
        const wrap = document.createElement('div');
        wrap.id = 'refuel-overlay';
        wrap.appendChild(el);
        document.body.appendChild(wrap);
        this._refuelEl = wrap;

        el.addEventListener('mouseover', ev => {
            const row = ev.target.closest('.rf-option-row');
            if (!row || this._rfWaiting) return;
            const i = parseInt(row.dataset.idx);
            if (!isNaN(i) && i !== this._rfIdx) {
                this._rfIdx = i;
                this._rfUpdateHighlight();
                this._rfUpdateRight();
            }
        });
        el.addEventListener('click', ev => {
            const row = ev.target.closest('.rf-option-row');
            if (!row || this._rfWaiting) return;
            const i = parseInt(row.dataset.idx);
            if (!isNaN(i)) { this._rfIdx = i; this._rfOnOk(); }
        });
    };

    Scene_Map.prototype._rfBuildLeft = function () {
        const isMain = this._rfView === 'main';
        let title = T('Refuel.selectVehicle');
        if (!isMain) {
            const v = (this._rfVehicles || []).find(x => x.key === this._rfView);
            title = T('Refuel.vehicleTitle', { vehicle: v ? v.name : T('Refuel.genericVehicle') });
        }
        const rows = this._rfOptions.map((opt, i) => {
            const sel  = i === this._rfIdx ? ' selected' : '';
            const dis  = opt.enabled ? '' : ' rf-disabled';
            const cost = opt.cost > 0 ? `<span class="rf-cost">€${goldToEuros(opt.cost)}</span>` : '';
            return `<div class="item-slot rf-option-row${sel}${dis}" data-idx="${i}">
                <span class="rf-label">${opt.label}</span>${cost}
            </div>`;
        }).join('');
        return `
            <div class="inspect-section-title">${T('Refuel.ui.fuelStation')}</div>
            <div class="inspect-name rf-subtitle">${title}</div>
            <div class="rf-option-list">${rows}</div>`;
    };

    Scene_Map.prototype._rfBuildRight = function () {
        const VSR = window.VehicleSystemRefuel;
        if (this._rfView === 'main') {
            const list = this._rfVehicles || [];
            let rows = '';
            if (!list.length) {
                rows = `<div class="inspect-spec-row rf-vehicle-row">
                    <span class="inspect-spec-label">${T('Refuel.ui.noVehicles')}</span>
                </div>`;
            } else {
                list.forEach(v => {
                    const pct = v.max > 0 ? Math.round(v.fuel / v.max * 100) : 0;
                    rows += `
                        <div class="inspect-spec-row rf-vehicle-row">
                            <span class="inspect-spec-label">${v.name}</span>
                            <span class="inspect-spec-value">${Math.floor(v.fuel)}L / ${v.max}L</span>
                        </div>
                        <div class="rf-fuel-bar-wrap">
                            <div class="rf-fuel-bar" style="width:${pct}%"></div>
                        </div>`;
                });
            }
            return `
                <div class="inspect-header"><span class="inspect-name">${T('Refuel.ui.fuelOverview')}</span></div>
                ${rows}
                <div class="inspect-spec-row rf-vehicle-row">
                    <span class="inspect-spec-label">${T('Refuel.ui.pricePerLitre')}</span>
                    <span class="inspect-spec-value">€${goldToEuros(VSR.getFuelPrice())}</span>
                </div>
                <div class="inspect-spec-row">
                    <span class="inspect-spec-label">${T('Refuel.ui.wallet')}</span>
                    <span class="inspect-spec-value">€${goldToEuros($gameParty.gold())}</span>
                </div>`;
        }
        const key    = this._rfView;
        const v      = (this._rfVehicles || []).find(x => x.key === key);
        const name   = v ? v.name : T('Refuel.genericVehicle');
        const fuel   = vehGet(key);
        const maxCap = vehMax(key);
        const pct    = maxCap > 0 ? Math.round(fuel / maxCap * 100) : 0;
        const opt    = this._rfOptions[this._rfIdx];
        const selRow = (opt && opt.cost > 0)
            ? `<div class="inspect-spec-row rf-selected-cost">
                   <span class="inspect-spec-label">${T('Refuel.ui.cost')}</span>
                   <span class="inspect-spec-value">€${goldToEuros(opt.cost)}</span>
               </div>` : '';
        return `
            <div class="inspect-header"><span class="inspect-name">${T('Refuel.ui.vehicleFuel', { name: name })}</span></div>
            <div class="inspect-spec-row">
                <span class="inspect-spec-label">${T('Refuel.ui.level')}</span>
                <span class="inspect-spec-value">${Math.floor(fuel)}L / ${maxCap}L</span>
            </div>
            <div class="rf-fuel-bar-wrap">
                <div class="rf-fuel-bar" style="width:${pct}%"></div>
            </div>
            <div class="inspect-spec-row rf-vehicle-row">
                <span class="inspect-spec-label">${T('Refuel.ui.pricePerLitre')}</span>
                <span class="inspect-spec-value">€${goldToEuros(VSR.getFuelPrice())}</span>
            </div>
            <div class="inspect-spec-row">
                <span class="inspect-spec-label">${T('Refuel.ui.wallet')}</span>
                <span class="inspect-spec-value">€${goldToEuros($gameParty.gold())}</span>
            </div>
            ${selRow}`;
    };

    Scene_Map.prototype._rfUpdateHighlight = function () {
        if (!this._refuelEl) return;
        this._refuelEl.querySelectorAll('.rf-option-row').forEach((el, i) => {
            el.classList.toggle('selected', i === this._rfIdx);
        });
    };

    Scene_Map.prototype._rfUpdateRight = function () {
        const rp = this._refuelEl && this._refuelEl.querySelector('.right-page');
        if (rp) rp.innerHTML = this._rfBuildRight();
    };

    Scene_Map.prototype._rfOnOk = function () {
        if (this._rfWaiting) return;
        const opt = this._rfOptions[this._rfIdx];
        if (!opt || !opt.enabled) { SoundManager.playBuzzer(); return; }
        SoundManager.playOk();

        if (this._rfView === 'main') {
            if (opt.type === 'exit') { this._rfClose(); return; }
            if (opt.type === 'select') {
                this._rfView = opt.key;
                this._rfIdx  = 0;
                this._rfRebuild();
            }
            return;
        }
        if (opt.type === 'back') {
            this._rfView = 'main';
            this._rfIdx  = 0;
            this._rfRebuild();
            return;
        }
        if (opt.type === 'refuel') {
            this._rfWaiting = true;
            const { liters, cost } = opt;
            const key = this._rfView;
            const v   = (this._rfVehicles || []).find(x => x.key === key);
            const vehicleName = v ? v.name.toLowerCase() : T('Refuel.genericVehicleLower');

            window.skipLocalization = true;
            $gameMessage.add(T('Refuel.confirmHeader'));
            $gameMessage.add(T('Refuel.confirmBody', { liters: liters.toFixed(1), vehicle: vehicleName, cost: goldToEuros(cost) }));
            $gameMessage.setChoices([T('Refuel.confirm'), T('Refuel.cancel')], 0, 1);
            $gameMessage.setChoiceCallback(n => {
                if (n === 0 && $gameParty.gold() >= cost) {
                    $gameParty.loseGold(cost);
                    vehSet(key, vehGet(key) + liters);
                    if (window.ParchmentToast) {
                      window.ParchmentToast.report([
                        T('Refuel.completeHeader'),
                        T('Refuel.added', { liters: liters.toFixed(1), vehicle: vehicleName })
                      ], {
                        severity: 'good'
                      });
                    }
                } else if (n === 0) {
                    if (window.ParchmentToast) {
                      window.ParchmentToast.show(T('Refuel.insufficientFunds'), {
                        severity: 'warning'
                      });
                    }
                }
                this._rfWaiting = false;
                this._rfRebuild();
            });
            window.skipLocalization = false;
        }
    };

    Scene_Map.prototype._rfClose = function () {
        if (this._refuelEl) { this._refuelEl.remove(); this._refuelEl = null; }
        $gamePlayer.setMovementLock(false);
    };

    Scene_Map.prototype.onRefuelCancel = function () {
        this._rfClose();
    };

    // Ensure the #refuel-container DOM node is removed on any scene teardown
    // (e.g. a map transfer while the refuel window is open), not just on manual
    // exit/cancel - otherwise it orphans into the next scene.
    const _Scene_Map_terminate_refuel = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        if (this._refuelEl) { this._rfClose(); }
        _Scene_Map_terminate_refuel.call(this);
    };

    const _Scene_Map_update_refuel = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_refuel.call(this);
        if (this._refuelEl && !this._rfWaiting) this._rfUpdateInput();
    };

    // Scene_Map's own updateCallMenu() reads Input 'menu' (Escape) and
    // TouchInput.isCancelled() (right click) in the SAME frame as the code
    // above, both of which the refuel window also reads to close itself, so
    // closing the window with Esc/right-click used to call the main menu too.
    // Suppressing isMenuEnabled while the window is open matches how every
    // other modal overlay (FastTravelSystem, ErisTrial, DreamSystem, ...)
    // keeps the menu from opening underneath it.
    const _Scene_Map_isMenuEnabled_refuel = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function () {
        if (this._refuelEl) return false;
        return _Scene_Map_isMenuEnabled_refuel.call(this);
    };

    Scene_Map.prototype._rfUpdateInput = function () {
        const len = this._rfOptions.length;
        if (Input.isRepeated('down') || Input.isRepeated('s')) {
            if (this._rfIdx < len - 1) {
                this._rfIdx++;
                SoundManager.playCursor();
                this._rfUpdateHighlight();
                this._rfUpdateRight();
                const sel = this._refuelEl.querySelector('.rf-option-row.selected');
                if (sel) sel.scrollIntoView({ block: 'nearest' });
            }
        } else if (Input.isRepeated('up') || Input.isRepeated('w')) {
            if (this._rfIdx > 0) {
                this._rfIdx--;
                SoundManager.playCursor();
                this._rfUpdateHighlight();
                this._rfUpdateRight();
                const sel = this._refuelEl.querySelector('.rf-option-row.selected');
                if (sel) sel.scrollIntoView({ block: 'nearest' });
            }
        } else if (Input.isTriggered('ok')) {
            this._rfOnOk();
        } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            SoundManager.playCancel();
            if (this._rfView !== 'main') {
                this._rfView = 'main';
                this._rfIdx  = 0;
                this._rfRebuild();
            } else {
                this._rfClose();
            }
        }
    };

})();
