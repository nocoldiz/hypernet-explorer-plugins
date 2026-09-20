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
    // Grange: the holdings monitor, as a HypernetOS program
    //=========================================================================
    // Four systems keep the party's holdings and not one of them can be asked a
    // question from anywhere but the tile it stands on: a barrel is read at the
    // barrel, a hive at the hive, a plot at the plot. Grange is the telemetry
    // page for all four at once - what is ready, what is about to spoil, what
    // wants feeding - and it does none of the work. Bottling, harvesting,
    // smoking a hive and collecting an egg still happen on the spot, which is
    // the point: the console says whether the walk is worth making.
    const GRANGE_APP_ID = 'app-grange';
    const GRANGE_ICON = 288; // Leaf, per js/db/Sprites/Icons.json

    const GR = {
        app: "display:flex; flex-direction:column; height:100%; background:var(--xp-face-5); " +
             "font-family:'Tahoma',sans-serif; font-size:15px; color:var(--xp-ink-2);",
        header: "display:flex; align-items:center; gap:12px; padding:10px 14px; " +
                "background:linear-gradient(to bottom,var(--xp-green-3),var(--xp-green-2)); color:var(--xp-white); " +
                "border-bottom:2px solid var(--xp-green-7);",
        nav: "width:150px; flex-shrink:0; background:var(--xp-face-6); border-right:1px solid var(--xp-face-shade); padding:8px 0;",
        navItem: "padding:9px 12px; cursor:pointer; border-left:4px solid transparent; user-select:none;",
        panel: "flex:1; overflow-y:auto; padding:14px 16px; background:var(--xp-face-2); min-width:0;",
        status: "display:flex; gap:16px; align-items:center; border-top:1px solid var(--xp-face-shade); " +
                "padding:4px 10px; background:var(--xp-face-5); font-size:14px; color:var(--xp-ink-4);",
        card: "background:var(--xp-white); border:1px solid var(--xp-face-3); border-radius:3px; padding:10px 12px; margin-bottom:8px;",
        h: "margin:0 0 8px; font-size:17px; font-weight:bold; color:var(--xp-green-2);",
        note: "color:var(--xp-ink-soft-2); font-size:14px; line-height:1.5;",
        tile: "flex:1; min-width:104px; background:var(--xp-white); border:1px solid var(--xp-face-3); border-radius:3px; padding:8px 10px;",
        tileNum: "font-size:22px; font-weight:bold; line-height:1.2;",
        tileLbl: "font-size:13px; color:var(--xp-ink-soft-2); text-transform:uppercase; letter-spacing:0.4px;",
        table: "width:100%; border-collapse:collapse; font-size:14px;",
        th: "text-align:left; padding:4px 6px; border-bottom:1px solid var(--xp-face-shade); color:var(--xp-green-2); font-weight:bold;",
        td: "padding:4px 6px; border-bottom:1px solid #e6e3d8;",
    };

    const GRANGE_TABS = ['overview', 'cellar', 'apiary', 'fields', 'livestock'];

    const grIcon = (index, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(index, size || 16) : '');
    const grEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // A bar that reads as a number as well as a length: the percentage is
    // written on every row, so nothing here rests on the width alone.
    function grBar(pct, colour) {
        const p = Math.max(0, Math.min(100, Math.round(pct)));
        return `<span style="display:inline-block; width:90px; height:9px; background:#e3e0d4; border:1px solid #c9c5b6;
            border-radius:2px; vertical-align:middle; margin-right:6px">
            <span style="display:block; width:${p}%; height:100%; background:${colour || '#4c8339'}"></span></span>${p}%`;
    }

    // Every barrel this world has going, wherever it stands. A barrel is a
    // record under "<mapId>_<eventId>", so the console can name the place even
    // though it has never loaded that map.
    function listBarrels() {
        const barrels = ($gameSystem && $gameSystem._brewingBarrels) || {};
        const now = getGameTimeMinutes();
        const out = [];
        for (const key of Object.keys(barrels)) {
            const saved = barrels[key];
            if (!saved || !saved.recipeId) continue;
            const state = computeBarrelState(saved, now);
            if (!state) continue;   // recipes not loaded yet, or a recipe that went away
            const mapId = Number(String(key).split('_')[0]) || 0;
            out.push({
                key, mapId,
                where: (window.WorkSystem && window.WorkSystem.locationLabel)
                    ? window.WorkSystem.locationLabel(mapId) : String(mapId),
                recipe: state.recipe,
                name: BrewingRecipeLoader.text(state.recipe.name),
                icon: state.recipe.icon || 228,
                stage: state.stage,
                stageText: T('Brewing.stage.' + state.stage),
                progress: state.progress,
                pct: Math.min(100, Math.floor(state.progress * 100)),
                remaining: state.remainingMinutes,
                ready: state.stage === STAGES.READY,
                preSeeded: !!saved.isPreSeeded,
            });
        }
        out.sort((a, b) => b.progress - a.progress);
        return out;
    }

    function grPlots() {
        const PG = window.PlantGrowthSystem;
        try { return (PG && PG.listPlots) ? PG.listPlots() : []; }
        catch (e) { console.warn('[Grange] crops', e); return []; }
    }

    function grAnimals() {
        const AG = window.AnimalGrowthSystem;
        try { return (AG && AG.listOwnedAnimals) ? AG.listOwnedAnimals() : []; }
        catch (e) { console.warn('[Grange] livestock', e); return []; }
    }

    // The hive is a single colony on $gameSystem, and its report is a pure read:
    // the console never advances the simulation, so opening it cannot age bees.
    function grHive() {
        const complex = $gameSystem && $gameSystem.apiaryComplex;
        if (!complex || typeof complex.generateReport !== 'function') return null;
        try { return complex.generateReport(0); }
        catch (e) { console.warn('[Grange] apiary', e); return null; }
    }

    window.Grange = {
        win: null,
        tab: 'overview',

        launch() {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) return;
            const win = window.HypernetOS.WindowManager.createWindow({
                id: GRANGE_APP_ID,
                title: T('Brewing.grange.appName'),
                icon: GRANGE_ICON,
                width: 840,
                height: 560,
                contentHTML: `
                    <div style="${GR.app}">
                        <div style="${GR.header}">
                            <div style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.5))">${grIcon(GRANGE_ICON, 34)}</div>
                            <div style="flex:1; min-width:0">
                                <div style="font-size:17px; font-weight:bold; letter-spacing:0.5px">${T('Brewing.grange.appName')}</div>
                                <div style="font-size:13px; opacity:0.82">${T('Brewing.grange.subtitle')}</div>
                            </div>
                            <div id="gr-alert" style="padding:4px 10px; border-radius:10px; font-size:14px; font-weight:bold"></div>
                        </div>
                        <div style="display:flex; flex:1; min-height:0">
                            <div id="gr-nav" style="${GR.nav}"></div>
                            <div id="gr-panel" style="${GR.panel}"></div>
                        </div>
                        <div style="${GR.status}">
                            <span>${T('Brewing.grange.seasonLabel')} <b id="gr-season"></b></span>
                            <span id="gr-note" style="margin-left:auto">${T('Brewing.grange.readOnly')}</span>
                        </div>
                    </div>`
            });
            this.win = win;
            this.bind();
            this.render();
            // The recipe book is fetched, so a cellar opened on a cold start has
            // nothing to name its barrels with until the file lands.
            if (!BrewingRecipeLoader.get()) {
                BrewingRecipeLoader.load().then(() => this.render()).catch(() => {});
            }
        },

        bind() {
            if (!this.win || this.win.dataset.grBound) return;
            this.win.dataset.grBound = '1';
            this.win.addEventListener('click', ev => {
                const hit = ev.target.closest('[data-gr-tab]');
                if (!hit) return;
                ev.stopPropagation();
                if (this.tab === hit.dataset.grTab) return;
                this.tab = hit.dataset.grTab;
                if (window.SoundManager) SoundManager.playCursor();
                this.render();
            });
        },

        counts() {
            const barrels = listBarrels();
            const plots = grPlots();
            const animals = grAnimals();
            const hive = grHive();
            return {
                barrels, plots, animals, hive,
                barrelsReady: barrels.filter(b => b.ready).length,
                cropsRipe: plots.filter(p => p.ripe).length,
                cropsOutOfSeason: plots.filter(p => !p.inSeason && !p.ripe).length,
                produceReady: animals.filter(a => a.hasReady).length,
                honey: hive ? hive.resources.honey : 0,
            };
        },

        render() {
            if (!this.win || !this.win.isConnected) return;
            const c = this.counts();
            const nav = this.win.querySelector('#gr-nav');
            if (nav) {
                nav.innerHTML = GRANGE_TABS.map(tab => {
                    const on = this.tab === tab;
                    const n = tab === 'cellar' ? c.barrels.length
                        : tab === 'fields' ? c.plots.length
                        : tab === 'livestock' ? c.animals.length : null;
                    return `<div class="focusable" tabindex="0" id="gr-tab-${tab}" data-gr-tab="${tab}"
                        style="${GR.navItem}${on ? 'background:var(--xp-face-2); border-left-color:var(--xp-green-3); font-weight:bold;' : ''}">
                        ${grEsc(T('Brewing.grange.tab.' + tab))}${n == null ? '' : ' (' + n + ')'}</div>`;
                }).join('');
            }
            const panel = this.win.querySelector('#gr-panel');
            if (panel) {
                if (this.tab === 'overview') panel.innerHTML = this.overviewHTML(c);
                else if (this.tab === 'cellar') panel.innerHTML = this.cellarHTML(c.barrels);
                else if (this.tab === 'apiary') panel.innerHTML = this.apiaryHTML(c.hive);
                else if (this.tab === 'fields') panel.innerHTML = this.fieldsHTML(c.plots);
                else panel.innerHTML = this.livestockHTML(c.animals);
            }
            const waiting = c.barrelsReady + c.cropsRipe + c.produceReady;
            const alert = this.win.querySelector('#gr-alert');
            if (alert) {
                alert.style.background = waiting ? '#b04a00' : '#2e7d32';
                alert.style.color = '#fff';
                alert.textContent = waiting
                    ? T('Brewing.grange.waitingOnYou', { n: waiting })
                    : T('Brewing.grange.nothingWaiting');
            }
            const season = this.win.querySelector('#gr-season');
            if (season) season.textContent = T('Brewing.grange.season.' + this.season());
        },

        season() {
            // PlantGrowthSystem decides what season it is for a crop; the console
            // asks the same question the same way rather than inventing a second
            // answer out of the date string.
            if ($gameWeather && typeof $gameWeather.getSeason === 'function') {
                return String($gameWeather.getSeason()).toLowerCase();
            }
            return 'spring';
        },

        tile(value, label, colour) {
            return `<div style="${GR.tile}">
                <div style="${GR.tileNum} color:${colour || 'var(--xp-ink)'}">${grEsc(value)}</div>
                <div style="${GR.tileLbl}">${grEsc(label)}</div></div>`;
        },

        overviewHTML(c) {
            const jobs = [];
            for (const b of c.barrels) {
                if (b.ready) jobs.push({ icon: b.icon, text: T('Brewing.grange.job.barrel', { name: b.name, where: b.where }) });
            }
            for (const p of c.plots) {
                if (p.ripe) jobs.push({ icon: p.iconIndex, text: T('Brewing.grange.job.crop', { name: p.itemName, where: p.where }) });
            }
            for (const a of c.animals) {
                if (a.hasReady) {
                    const ready = a.produces.filter(pr => pr.ready).map(pr => pr.name).join(', ');
                    jobs.push({ icon: 0, text: T('Brewing.grange.job.produce', { animal: a.animalId, where: a.mapName, what: ready }) });
                }
            }
            if (c.hive && c.hive.colony.state && c.hive.colony.mood < 40) {
                jobs.push({ icon: 340, text: T('Brewing.grange.job.hiveUnhappy', { mood: c.hive.colony.mood }) });
            }
            const spoiling = c.plots.filter(p => !p.inSeason && !p.ripe);
            for (const p of spoiling) {
                jobs.push({ icon: p.iconIndex, text: T('Brewing.grange.job.outOfSeason', { name: p.itemName, where: p.where }) });
            }
            return `
                <h2 style="${GR.h}">${T('Brewing.grange.overviewTitle')}</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
                    ${this.tile(String(c.barrels.length), T('Brewing.grange.tile.barrels'))}
                    ${this.tile(String(c.barrelsReady), T('Brewing.grange.tile.barrelsReady'), '#b04a00')}
                    ${this.tile(String(c.plots.length), T('Brewing.grange.tile.plots'))}
                    ${this.tile(String(c.cropsRipe), T('Brewing.grange.tile.cropsRipe'), '#2e7d32')}
                    ${this.tile(String(c.animals.length), T('Brewing.grange.tile.animals'))}
                    ${this.tile(String(Math.floor(c.honey)), T('Brewing.grange.tile.honey'), '#c8922a')}
                </div>
                <h3 style="${GR.h}">${T('Brewing.grange.needsYou')}</h3>
                ${jobs.length ? `<div style="${GR.card}">${jobs.map(j =>
                    `<div style="padding:3px 0">${grIcon(j.icon)} ${grEsc(j.text)}</div>`).join('')}</div>`
                    : `<div style="${GR.card} ${GR.note}">${T('Brewing.grange.allQuiet')}</div>`}
                <div style="${GR.note}">${T('Brewing.grange.projectionNote')}</div>`;
        },

        cellarHTML(barrels) {
            if (!barrels.length) {
                return `<h2 style="${GR.h}">${T('Brewing.grange.tab.cellar')}</h2>
                    <div style="${GR.card} ${GR.note}">${T('Brewing.grange.noBarrels')}</div>`;
            }
            const rows = barrels.map(b => `<tr>
                <td style="${GR.td}">${grIcon(b.icon)} ${grEsc(b.name)}</td>
                <td style="${GR.td}">${grEsc(b.where)}</td>
                <td style="${GR.td}" ${b.ready ? 'data-ready="1"' : ''}>
                    <span style="color:${b.ready ? '#2e7d32' : 'var(--xp-ink-2)'}; font-weight:${b.ready ? 'bold' : 'normal'}">${grEsc(b.stageText)}</span></td>
                <td style="${GR.td}">${grBar(b.pct, b.ready ? '#2e7d32' : '#8a6d3b')}</td>
                <td style="${GR.td}">${b.ready ? T('Brewing.grange.now') : grEsc(formatTimeRemaining(b.remaining))}</td>
            </tr>`).join('');
            return `<h2 style="${GR.h}">${T('Brewing.grange.tab.cellar')}</h2>
                <div style="${GR.card} padding:6px 8px"><table style="${GR.table}">
                    <thead><tr>
                        <th style="${GR.th}">${T('Brewing.grange.colBrew')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colWhere')}</th>
                        <th style="${GR.th}">${T('Brewing.ui.stage')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colProgress')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colLeft')}</th>
                    </tr></thead><tbody>${rows}</tbody></table></div>
                <div style="${GR.note}">${T('Brewing.grange.cellarNote')}</div>`;
        },

        apiaryHTML(hive) {
            if (!hive) {
                return `<h2 style="${GR.h}">${T('Brewing.grange.tab.apiary')}</h2>
                    <div style="${GR.card} ${GR.note}">${T('Brewing.grange.noHive')}</div>`;
            }
            const pop = hive.population;
            const res = hive.resources;
            const castes = [
                [T('Apiary.caste.workers'), pop.adults.workers], [T('Apiary.caste.nurses'), pop.adults.nurses],
                [T('Apiary.caste.guards'), pop.adults.guards], [T('Apiary.caste.foragers'), pop.adults.foragers],
                [T('Apiary.caste.drones'), pop.adults.drones], [T('Apiary.caste.builders'), pop.adults.builders],
                [T('Apiary.caste.scouts'), pop.adults.scouts],
            ];
            const stores = [
                [T('Apiary.resource.honey'), res.honey], [T('Apiary.resource.pollen'), res.pollen],
                [T('Apiary.resource.royalJelly'), res.royalJelly], [T('Apiary.resource.wax'), res.wax],
                [T('Apiary.resource.propolis'), res.propolis], [T('Apiary.resource.water'), res.water],
            ];
            const row = ([label, value]) => `<tr><td style="${GR.td}">${grEsc(label)}</td>
                <td style="${GR.td} text-align:right">${grEsc(String(value))}</td></tr>`;
            return `<h2 style="${GR.h}">${T('Brewing.grange.tab.apiary')}</h2>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px">
                    ${this.tile(String(pop.total), T('Brewing.grange.tile.bees'))}
                    ${this.tile(String(hive.colony.mood), T('Brewing.grange.tile.mood'), hive.colony.mood < 40 ? '#c0392b' : '#2e7d32')}
                    ${this.tile(hive.colony.efficiency + '%', T('Brewing.grange.tile.efficiency'))}
                    ${this.tile(String(Math.floor(res.honey)), T('Brewing.grange.tile.honey'), '#c8922a')}
                </div>
                <div style="${GR.card}">
                    <b>${T('Brewing.grange.queen')}</b>
                    <div style="${GR.note}">${hive.queen.alive
                        ? T('Brewing.grange.queenAlive', { health: hive.queen.health, eggs: hive.queen.eggsLaid })
                        : T('Brewing.grange.queenDead')}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap">
                    <div style="${GR.card} flex:1; min-width:210px"><b>${T('Brewing.grange.castes')}</b>
                        <table style="${GR.table}"><tbody>${castes.map(row).join('')}</tbody></table></div>
                    <div style="${GR.card} flex:1; min-width:210px"><b>${T('Brewing.grange.stores')}</b>
                        <table style="${GR.table}"><tbody>${stores.map(row).join('')}</tbody></table></div>
                </div>
                <div style="${GR.note}">${T('Brewing.grange.hiveNote')}</div>`;
        },

        fieldsHTML(plots) {
            if (!plots.length) {
                return `<h2 style="${GR.h}">${T('Brewing.grange.tab.fields')}</h2>
                    <div style="${GR.card} ${GR.note}">${T('Brewing.grange.noPlots')}</div>`;
            }
            const rows = plots.map(p => `<tr>
                <td style="${GR.td}">${grIcon(p.iconIndex)} ${grEsc(p.itemName)}</td>
                <td style="${GR.td}">${grEsc(p.where)}</td>
                <td style="${GR.td}">${grBar(p.pct, p.ripe ? '#2e7d32' : (p.inSeason ? '#4c8339' : '#9c8d5f'))}</td>
                <td style="${GR.td}">${p.ripe ? `<b style="color:#2e7d32">${T('Brewing.grange.ripe')}</b>`
                    : p.inSeason ? T('Brewing.grange.daysLeft', { n: p.daysLeft })
                    : `<span style="color:#b04a00">${T('Brewing.grange.outOfSeason')}</span>`}</td>
                <td style="${GR.td}">${grEsc(p.yieldMin + '-' + p.yieldMax)}</td>
            </tr>`).join('');
            return `<h2 style="${GR.h}">${T('Brewing.grange.tab.fields')}</h2>
                <div style="${GR.card} padding:6px 8px"><table style="${GR.table}">
                    <thead><tr>
                        <th style="${GR.th}">${T('Brewing.grange.colCrop')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colWhere')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colProgress')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colLeft')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colYield')}</th>
                    </tr></thead><tbody>${rows}</tbody></table></div>
                <div style="${GR.note}">${T('Brewing.grange.fieldsNote')}</div>`;
        },

        livestockHTML(animals) {
            if (!animals.length) {
                return `<h2 style="${GR.h}">${T('Brewing.grange.tab.livestock')}</h2>
                    <div style="${GR.card} ${GR.note}">${T('Brewing.grange.noAnimals')}</div>`;
            }
            const rows = animals.map(a => {
                const produce = a.produces.length
                    ? a.produces.map(pr => pr.ready
                        ? `<b style="color:#2e7d32">${grEsc(pr.name)}</b>`
                        : `${grEsc(pr.name)} <span style="${GR.note}">${T('Brewing.grange.daysLeft', { n: pr.daysLeft })}</span>`).join('<br>')
                    : `<span style="${GR.note}">${T('Brewing.grange.noProduce')}</span>`;
                return `<tr>
                    <td style="${GR.td}">${grEsc(a.animalId)}<div style="${GR.note}">${grEsc(a.stageName)}</div></td>
                    <td style="${GR.td}">${grEsc(a.mapName)}</td>
                    <td style="${GR.td}">${a.stage === 'adult' ? T('Brewing.grange.grown')
                        : grBar(a.growthPct) + `<div style="${GR.note}">${T('Brewing.grange.daysLeft', { n: a.daysToAdult })}</div>`}</td>
                    <td style="${GR.td}">${produce}</td>
                </tr>`;
            }).join('');
            return `<h2 style="${GR.h}">${T('Brewing.grange.tab.livestock')}</h2>
                <div style="${GR.card} padding:6px 8px"><table style="${GR.table}">
                    <thead><tr>
                        <th style="${GR.th}">${T('Brewing.grange.colAnimal')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colWhere')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colGrowth')}</th>
                        <th style="${GR.th}">${T('Brewing.grange.colProduce')}</th>
                    </tr></thead><tbody>${rows}</tbody></table></div>
                <div style="${GR.note}">${T('Brewing.grange.livestockNote')}</div>`;
        },
    };

    // The holdings monitor is part of the brewery's own plugin, and it is what
    // a console asks about barrels from away.
    window.BrewingSystem = Object.assign(window.BrewingSystem || {}, {
        listBarrels: () => listBarrels(),
        barrelState: (saved, minutes) => computeBarrelState(saved, minutes == null ? getGameTimeMinutes() : minutes),
        STAGES,
    });

    if (window.HypernetOS && window.HypernetOS.registerApp) {
        window.HypernetOS.registerApp({
            id: GRANGE_APP_ID,
            name: T('Brewing.grange.appName'),
            icon: GRANGE_ICON,
            category: 'reference',
            launchFn: function () { window.Grange.launch(); },
            desktopShortcut: true,
        });
    }

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
