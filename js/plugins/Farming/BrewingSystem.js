/*:
 * @target MZ
 * @plugindesc Barrel Brewing/Fermentation System v1.0.0
 * @author Omni-Lex
 *
 * @command OpenBrewery
 * @text Open Brewery
 * @desc Opens the barrel brewing interface for the calling event's barrel.
 */

(() => {
    'use strict';

    // ---- Where the yield goes ----------------------------------------------
    // Straight to the party, unless they own a shop that deals in this sort of
    // thing, in which case the crate goes to that shop's warehouse - which is
    // what its production recipes eat - and the party is told. ShopManagement
    // owns the rule; with that plugin off this is a plain gainItem.
    function deliverFarmProduce(item, amount) {
        const SM = window.ShopManagement;
        if (SM && typeof SM.deliverProduce === 'function') {
            return SM.deliverProduce(item, amount);
        }
        if (window.$gameParty && item) $gameParty.gainItem(item, amount);
        return { toShop: 0, toParty: amount, shopId: null };
    }


    const GAME_TIME_VAR = 114;

    const STAGES = {
        PRIMARY:      'primary',
        SECONDARY:    'secondary',
        CONDITIONING: 'conditioning',
        READY:        'ready'
    };

    // Icon helper ,  scales the 512×384 IconSet to target size (copied from ApiarySystem pattern)
    const ic = (idx, sz = 20) => {
        const scale = sz / 32;
        const bw = Math.round(512 * scale), bh = Math.round(384 * scale);
        const x = (idx % 16) * sz, y = Math.floor(idx / 16) * sz;
        return `<span style="display:inline-block; width:${sz}px; height:${sz}px; background:url('img/system/IconSet.png') -${x}px -${y}px no-repeat; background-size:${bw}px ${bh}px; vertical-align:middle; margin-right:3px; image-rendering:pixelated; flex-shrink:0"></span>`;
    };

    // mulberry32 seeded RNG ,  deterministic, fast, good quality
    function mulberry32(seed) {
        return function () {
            seed |= 0;
            seed = (seed + 0x6D2B79F5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function getBarrelKey(mapId, eventId) {
        return `${mapId}_${eventId}`;
    }

    function getBarrelSeed(mapId, eventId) {
        return mapId * 10000 + eventId;
    }

    function getGameTimeMinutes() {
        return $gameVariables.value(GAME_TIME_VAR);
    }

    // Thin local copy of TimeDateSystem's getDateTimeFromMinutes ,  display only
    function dateTimeFromMinutes(minutes) {
        const base = new Date(2001, 0, 1, 10, 0, 0);
        base.setMinutes(base.getMinutes() + minutes);
        const h = base.getHours();
        const m = base.getMinutes();
        const months = T.list('Brewing.monthAbbr');
        const days = T.list('Brewing.dayAbbr');
        return {
            time24: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
            fullDate: `${days[base.getDay()]} ${base.getDate()} ${months[base.getMonth()]} ${base.getFullYear()}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        };
    }

    function formatTimeRemaining(totalMinutes) {
        const mins = Math.round(totalMinutes);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    }

    //=========================================================================
    // BrewingRecipeLoader
    //=========================================================================

    const BrewingRecipeLoader = {
        _recipes: null,
        load() {
            if (this._recipes) return Promise.resolve(this._recipes);
            return fetch('js/db/Items/brewingRecipes.json')
                .then(r => r.json())
                .then(data => { this._recipes = data; return data; });
        },
        get() { return this._recipes; },
        findById(id) { return (this._recipes || []).find(r => r.id === id) || null; },

        // brewingRecipes.json carries i18n keys ("Brewing.recipe.<id>.name")
        // rather than words, so a recipe reads in the player's language; a
        // value that resolves to nothing is shown as written, which keeps a
        // hand-added recipe legible.
        text(value) {
            if (!value) return '';
            const key = String(value);
            return T.has(key) ? T(key) : key;
        }
    };

    //=========================================================================
    // computeBarrelState
    //=========================================================================

    function computeBarrelState(savedData, currentMinutes) {
        const recipe = BrewingRecipeLoader.findById(savedData.recipeId);
        if (!recipe) return null;
        // A brewer who knows the recipe pitches better and holds temperature,
        // so the same wash comes round sooner (Brewing 49 / Distilling 570).
        const patience = window.SpecializationXP
            ? window.SpecializationXP.discount(recipe.spec || 'Brewing', 0.06, 0.75) : 1;
        const totalMinutes = (recipe.fermentHours || 0) * 60 * patience;
        const elapsedMinutes = currentMinutes - savedData.startMinutes;
        // Guard a 0/missing fermentHours: without it the division yields
        // Infinity/NaN progress and a barrel that never becomes ready.
        if (!(totalMinutes > 0)) {
            return { recipe, progress: 1, remainingMinutes: 0, stage: STAGES.READY };
        }
        const progress = Math.max(0, elapsedMinutes / totalMinutes);
        const remainingMinutes = Math.max(0, totalMinutes - elapsedMinutes);
        let stage;
        if (progress < 0.40)      stage = STAGES.PRIMARY;
        else if (progress < 0.75) stage = STAGES.SECONDARY;
        else if (progress < 1.00) stage = STAGES.CONDITIONING;
        else                      stage = STAGES.READY;
        return { recipe, progress, remainingMinutes, stage };
    }

    //=========================================================================
    // Scene_Brewery
    //=========================================================================

    class Scene_Brewery extends Scene_MenuBase {

        create() {
            super.create();
            // Name the skill this menu runs on while it is open.
            if (window.SpecBadge) window.SpecBadge.show('Brewing');  // i18n-ignore  Specialization.json id
            if (this._helpWindow) this._helpWindow.hide();

            this._mapId        = Scene_Brewery._pendingMapId   || $gameMap.mapId();
            this._eventId      = Scene_Brewery._pendingEventId || 0;
            this._currentBarrelKey = getBarrelKey(this._mapId, this._eventId);
            this._selectedIndex = 0;
            this._feedbackMsg   = '';
            this._feedbackTimer = 0;
            this._refreshTimer  = 0;
            this._recipes       = BrewingRecipeLoader.get() || [];

            if (!$gameSystem._brewingBarrels) $gameSystem._brewingBarrels = {};

            this._container = document.createElement('div');
            this._container.id = 'brewery-container';
            this._container.style.opacity = '0';
            this._container.style.transition = 'opacity 0.22s ease-out';
            this._container.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.onCancelAction();
            });
            document.body.appendChild(this._container);

            this.refreshUI();

            BrewingRecipeLoader.load()
                .then(recipes => {
                    this._recipes = recipes;
                    this._trySeedBarrel();
                    this.refreshUI();
                })
                .catch(err => {
                    console.error('[BrewingSystem] Failed to load recipes:', err);
                    this._feedbackMsg   = T('Brewing.loadError');
                    this._feedbackTimer = 240;
                    this.refreshUI();
                });

            setTimeout(() => { if (this._container) this._container.style.opacity = '1'; }, 16);
        }

        _trySeedBarrel() {
            const key     = this._currentBarrelKey;
            const barrels = $gameSystem._brewingBarrels;
            if (barrels[key]) return;                       // already tracked ,  skip
            const recipes = this._recipes;
            if (!recipes || recipes.length === 0) return;

            const seed = getBarrelSeed(this._mapId, this._eventId);
            const rng  = mulberry32(seed);
            if (rng() < 0.40) {
                const recipeIdx = Math.floor(rng() * recipes.length);
                const progress  = 0.05 + rng() * 0.90;     // 5% – 95% through
                const recipe    = recipes[recipeIdx];
                const fakeStart = getGameTimeMinutes() - Math.floor(progress * recipe.fermentHours * 60);
                barrels[key] = {
                    recipeId:     recipe.id,
                    startMinutes: fakeStart,
                    isPreSeeded:  true
                };
            }
        }

        terminate() {
            if (this._container) {
                this._container.remove();
                this._container = null;
            }
            super.terminate();
        }

        update() {
            super.update();

            if (this._feedbackTimer > 0) {
                this._feedbackTimer--;
                if (this._feedbackTimer === 0) {
                    this._feedbackMsg = '';
                    this.refreshUI();
                }
            }

            this._refreshTimer = (this._refreshTimer || 0) + 1;
            if (this._refreshTimer >= 60) {
                this._refreshTimer = 0;
                this.refreshBarrelProgress();
            }

            this.updateBreweryInput();
        }

        // Lightweight per-second update: only the progress bar width, percentage
        // and time-remaining text, reusing the DOM from the last full build. A
        // stage transition (or empty barrel) falls back to a full refreshUI().
        refreshBarrelProgress() {
            if (!this._container) return;
            const key       = this._currentBarrelKey;
            const savedData = ($gameSystem._brewingBarrels || {})[key] || null;
            if (!savedData) return; // empty barrel: nothing time-based to update
            const state = computeBarrelState(savedData, getGameTimeMinutes());
            if (!state) return;
            if (state.stage !== this._renderedStage) { this.refreshUI(); return; }

            const pct  = Math.min(100, state.progress * 100).toFixed(1);
            const fill = this._container.querySelector('.brewery-stage-fill');
            if (fill) fill.style.width = pct + '%';
            const pctLabel = this._container.querySelector('.brewery-stage-pct');
            if (pctLabel) pctLabel.textContent = pct + '%';
            const timeEl = this._container.querySelector('#brewery-time-remaining');
            if (timeEl) {
                timeEl.innerHTML = state.stage === STAGES.READY
                    ? `<span style="color:var(--text-cost-ok); font-weight:bold">${T('Brewing.ui.ready')}</span>`
                    : formatTimeRemaining(state.remainingMinutes);
            }
        }

        onCancelAction() {
            if (this._selectedIndex !== -1 && this._selectedIndex != null) {
                this._selectedIndex = -1;
                SoundManager.playCancel();
                this.refreshUI();
            } else {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        updateBreweryInput() {
            const count = this._recipes.length;
            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                this.onCancelAction();
            } else if (Input.isRepeated('up')) {
                if (count > 0) {
                    this._selectedIndex = this._selectedIndex === -1 ? count - 1 : (this._selectedIndex - 1 + count) % count;
                    SoundManager.playCursor();
                    this.refreshUI();
                }
            } else if (Input.isRepeated('down')) {
                if (count > 0) {
                    this._selectedIndex = this._selectedIndex === -1 ? 0 : (this._selectedIndex + 1) % count;
                    SoundManager.playCursor();
                    this.refreshUI();
                }
            } else if (Input.isTriggered('ok')) {
                if (this._selectedIndex !== -1) {
                    this.executeAction();
                }
            }
        }

        executeAction() {
            const key       = this._currentBarrelKey;
            const savedData = $gameSystem._brewingBarrels[key];

            if (savedData) {
                const state = computeBarrelState(savedData, getGameTimeMinutes());
                if (state && state.stage === STAGES.READY) {
                    this.harvestBarrel();
                } else {
                    this._feedbackMsg   = T('Brewing.stillFermenting');
                    this._feedbackTimer = 120;
                    SoundManager.playBuzzer();
                    this.refreshUI();
                }
            } else {
                if (this._recipes.length === 0) return;
                this.startBrewing(this._recipes[this._selectedIndex]);
            }
        }

        startBrewing(recipe) {
            const missing = [];
            for (const ing of recipe.ingredients) {
                const item = $dataItems[ing.item_id];
                if (!item) continue;
                const have = $gameParty.numItems(item);
                if (have < ing.quantity) {
                    missing.push(T('Brewing.missingLine', { item: item.name, need: ing.quantity, have: have }));
                }
            }
            if (missing.length > 0) {
                this._feedbackMsg   = T('Brewing.missing', { list: missing.join(', ') });
                this._feedbackTimer = 180;
                SoundManager.playBuzzer();
                this.refreshUI();
                return;
            }

            for (const ing of recipe.ingredients) {
                const item = $dataItems[ing.item_id];
                if (item) $gameParty.loseItem(item, ing.quantity);
            }

            $gameSystem._brewingBarrels[this._currentBarrelKey] = {
                recipeId:     recipe.id,
                startMinutes: getGameTimeMinutes()
            };

            this._feedbackMsg   = T('Brewing.started', { recipe: BrewingRecipeLoader.text(recipe.name) });
            this._feedbackTimer = 120;
            SoundManager.playOk();
            this.refreshUI();
        }

        harvestBarrel() {
            const key       = this._currentBarrelKey;
            const savedData = $gameSystem._brewingBarrels[key];
            if (!savedData) return;
            const recipe = BrewingRecipeLoader.findById(savedData.recipeId);
            if (!recipe) return;

            // Seed combines barrel identity with the exact brew start time so
            // each brew of the same barrel produces a different but deterministic yield
            const rng   = mulberry32(getBarrelSeed(this._mapId, this._eventId) + (savedData.startMinutes | 0));
            // The roll stays seeded (the same barrel always brews the same
            // batch); skill is applied to the result, never to the seed.
            const spec  = recipe.spec || 'Brewing';  // i18n-ignore  specialization id  // i18n-ignore  specialization id
            const skill = window.SpecializationXP
                ? window.SpecializationXP.multiplier(spec, 0.10) : 1;
            const gains = [];
            for (const out of recipe.output) {
                const item   = $dataItems[out.item_id];
                if (!item) continue;
                const rolled = out.min + Math.floor(rng() * (out.max - out.min + 1));
                const amount = Math.max(1, Math.round(rolled * skill));
                deliverFarmProduce(item, amount);
                // What came out of the barrel, in the party's diary (Diary.js).
                if (window.Diary) window.Diary.onCrafted('brew', item.name, amount);
                gains.push(`${item.name} ×${amount}`);
            }

            delete $gameSystem._brewingBarrels[key];
            this._feedbackMsg   = `Harvested: ${gains.join(', ')}`;
            this._feedbackTimer = 180;
            SoundManager.playUseItem();
            if (window.SpecializationXP) {
                window.SpecializationXP.awardCapped(spec, 2);
            }
            this.refreshUI();
        }

        refreshUI() {
            if (!this._container) return;

            const recipes    = this._recipes;
            const key        = this._currentBarrelKey;
            const barrels    = $gameSystem._brewingBarrels || {};
            const savedData  = barrels[key] || null;
            const nowMinutes = getGameTimeMinutes();
            const barrelState = savedData ? computeBarrelState(savedData, nowMinutes) : null;
            // Remember what stage the full DOM was built for, so the per-second
            // tick can tell a plain progress update from a stage transition.
            this._renderedStage = barrelState ? barrelState.stage : null;

            if (recipes.length > 0 && this._selectedIndex >= recipes.length) {
                this._selectedIndex = recipes.length - 1;
            }

            // ── Left page: recipe list ─────────────────────────────────────────
            let recipeListHTML = '';
            if (recipes.length === 0) {
                recipeListHTML = `<div style="font-size:0.984rem; color:var(--text-brown-medium); padding:8px 0">${T('Brewing.ui.loadingRecipes')}</div>`;
            } else {
                for (let i = 0; i < recipes.length; i++) {
                    const r       = recipes[i];
                    const focused = (i === this._selectedIndex);
                    const ingNames = r.ingredients.map(ing => {
                        const item = $dataItems[ing.item_id];
                        return item ? `${item.name} ×${ing.quantity}` : T('Brewing.itemNumbered', { id: ing.item_id, qty: ing.quantity });
                    }).join(', ');
                    recipeListHTML += `
                        <div class="brewery-recipe-row${focused ? ' focused' : ''}" data-idx="${i}">
                            <div class="brewery-recipe-name">${ic(r.icon, 18)} ${BrewingRecipeLoader.text(r.name)}<span class="brewery-recipe-time">${r.fermentHours}h</span></div>
                            <div class="brewery-recipe-meta">${ingNames}</div>
                            <div class="brewery-recipe-output">${ic(80, 13)} ${BrewingRecipeLoader.text(r.outputPreview)}</div>
                        </div>`;
                }
            }

            // Ingredient availability check (only when barrel is empty)
            let ingredientCheckHTML = '';
            if (!savedData && recipes.length > 0 && this._selectedIndex >= 0) {
                const sel    = recipes[this._selectedIndex];
                if (sel) {
                    const checks = sel.ingredients.map(ing => {
                    const item = $dataItems[ing.item_id];
                    if (!item) return '';
                    const have   = $gameParty.numItems(item);
                    const ok     = have >= ing.quantity;
                    const color  = ok ? '#27ae60' : '#c0392b';
                    const mkIcon = ok ? ic(87, 14) : ic(12, 14);
                    return `<div class="brewery-ingredient-check" style="color:${color}">${mkIcon} ${item.name} ×${ing.quantity} <span style="opacity:0.65; font-size:0.903rem">(have ${have})</span></div>`;
                }).join('');
                    ingredientCheckHTML = `
                        <div class="apiary-section" style="margin-top:14px">
                            <div class="apiary-section-title">${ic(105, 14)} ${T('Brewing.ui.ingredients')}</div>
                            ${checks}
                        </div>`;
                }
            }

            // ── Right page: barrel status ──────────────────────────────────────
            const feedbackHTML = this._feedbackMsg
                ? `<div class="apiary-feedback">${this._feedbackMsg}</div>` : '';

            let rightHTML = '';

            if (!barrelState) {
                // Empty barrel
                rightHTML = `
                    <h2 class="title" style="border:none; margin:0 0 14px 0; padding:0">${T('Brewing.ui.barrel')}</h2>
                    <div class="apiary-section">
                        <div class="apiary-section-title">${ic(210, 14)} ${T('Brewing.ui.status')}</div>
                        <div class="apiary-stat-row"><span>${T('Brewing.ui.state')}</span><span style="color:var(--text-brown-medium)">${T('Brewing.ui.empty')}</span></div>
                    </div>
                    <p style="font-size:0.96rem; color:var(--text-brown-medium); margin:10px 0 0 0">
                        ${T('Brewing.ui.selectRecipeHint')}
                    </p>
                    ${feedbackHTML}
                    <div class="apiary-actions">
                        <div class="apiary-action-btn" onclick="SceneManager._scene.executeAction()">${T('Brewing.ui.beginBrewing')}</div>
                        <div class="apiary-action-btn" onclick="SceneManager._scene.popScene()">${T('Brewing.ui.exit')}</div>
                    </div>`;
            } else {
                const { recipe, progress, remainingMinutes, stage } = barrelState;
                const pct = Math.min(100, progress * 100).toFixed(1);

                const stageInfo = {
                    [STAGES.PRIMARY]:      { text: T('Brewing.stage.primary'),      color: '#c0873f' },
                    [STAGES.SECONDARY]:    { text: T('Brewing.stage.secondary'),    color: '#d4aa1f' },
                    [STAGES.CONDITIONING]: { text: T('Brewing.stage.conditioning'), color: '#d4aa1f' },
                    [STAGES.READY]:        { text: T('Brewing.stage.ready'),        color: '#27ae60' }
                }[stage];

                const timeLabel = stage === STAGES.READY
                    ? `<span style="color:var(--text-cost-ok); font-weight:bold">${T('Brewing.ui.ready')}</span>`
                    : formatTimeRemaining(remainingMinutes);

                const startedLabel = savedData ? dateTimeFromMinutes(savedData.startMinutes).fullDate : ', ';

                const outputRowsHTML = recipe.output.map(out => {
                    const item = $dataItems[out.item_id];
                    if (!item) return '';
                    return `<div class="apiary-stat-row"><span>${ic(item.iconIndex, 16)} ${item.name}</span><span>${T('Brewing.units', { min: out.min, max: out.max })}</span></div>`;
                }).join('');

                const actionBtns = stage === STAGES.READY
                    ? `<div class="apiary-action-btn" onclick="SceneManager._scene.harvestBarrel()">${ic(340, 16)} ${T('Brewing.ui.harvest')}</div>
                       <div class="apiary-action-btn" onclick="SceneManager._scene.popScene()">${T('Brewing.ui.exit')}</div>`
                    : `<div class="apiary-action-btn" style="opacity:0.45; cursor:default; pointer-events:none">${T('Brewing.ui.fermenting')}</div>
                       <div class="apiary-action-btn" onclick="SceneManager._scene.popScene()">${T('Brewing.ui.exit')}</div>`;

                rightHTML = `
                    <h2 class="title" style="border:none; margin:0 0 14px 0; padding:0">${T('Brewing.ui.barrel')}</h2>
                    <div class="apiary-section">
                        <div class="apiary-section-title">${ic(210, 14)} ${T('Brewing.ui.fermentingTitle')}</div>
                        <div class="apiary-stat-row"><span>${T('Brewing.ui.recipe')}</span><span>${BrewingRecipeLoader.text(recipe.name)}</span></div>
                        <div class="apiary-stat-row"><span>${T('Brewing.ui.stage')}</span><span style="color:${stageInfo.color}; font-weight:bold">${stageInfo.text}</span></div>
                        <div style="margin:8px 0 4px">
                            <div class="brewery-stage-bar">
                                <div class="brewery-stage-fill" style="width:${pct}%"></div>
                            </div>
                            <div class="brewery-stage-pct" style="font-size:0.854rem; color:var(--text-brown-medium); text-align:right; margin-top:2px">${pct}%</div>
                        </div>
                        <div class="apiary-stat-row"><span>${T('Brewing.ui.timeRemaining')}</span><span id="brewery-time-remaining">${timeLabel}</span></div>
                        <div class="apiary-stat-row"><span>${T('Brewing.ui.started')}</span><span style="font-size:0.903rem">${startedLabel}</span></div>
                    </div>
                    <div class="apiary-section">
                        <div class="apiary-section-title">${ic(80, 14)} ${T('Brewing.ui.expectedOutput')}</div>
                        ${outputRowsHTML}
                    </div>
                    ${feedbackHTML}
                    <div class="apiary-actions">${actionBtns}</div>`;
            }

            // ── Assemble full HTML ─────────────────────────────────────────────
            this._container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page">
                        <div class="page-header-bar">
                            <div class="back-button" onclick="SceneManager._scene.popScene()">${T('Brewing.ui.back')}</div>
                            <h2 class="title">${T('Brewing.ui.brewery')}</h2>
                        </div>
                        <div class="apiary-section">
                            <div class="apiary-section-title">${ic(105, 14)} ${T('Brewing.ui.recipes')}</div>
                            <div id="brewery-recipe-list">${recipeListHTML}</div>
                        </div>
                        ${ingredientCheckHTML}
                    </div>
                    <div class="right-page">${rightHTML}</div>
                </div>`;

            // Click to select recipe, double-click to act
            this._container.querySelectorAll('.brewery-recipe-row').forEach(row => {
                row.addEventListener('click', () => {
                    const idx = parseInt(row.getAttribute('data-idx'));
                    if (idx !== this._selectedIndex) {
                        this._selectedIndex = idx;
                        SoundManager.playCursor();
                        this.refreshUI();
                    }
                });
                row.addEventListener('dblclick', () => {
                    this._selectedIndex = parseInt(row.getAttribute('data-idx'));
                    this.executeAction();
                });
            });
        }
    }

    Scene_Brewery._pendingMapId   = null;
    Scene_Brewery._pendingEventId = null;

    //=========================================================================
    // Plugin Command
    //=========================================================================

    PluginManager.registerCommand('BrewingSystem', 'OpenBrewery', function () {
        Scene_Brewery._pendingMapId   = $gameMap.mapId();
        Scene_Brewery._pendingEventId = this._eventId;
        if (!$gameSystem._brewingBarrels) $gameSystem._brewingBarrels = {};
        SceneManager.push(Scene_Brewery);
    });

})();
