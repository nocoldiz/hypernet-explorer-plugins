/*:
 * @target MZ
 * @plugindesc Alchemistry Menu System (Data/Logic), Recipe Book, Projects & Skill Checks v3.0
 * @author Omni-Lex
 *
 * @help AlchemistryMenu.js
 *
 * Business logic only: the recipe book, the three project benches, the
 * world-clock timer, the skill check and the plugin command. All DOM / scene
 * rendering lives in AlchemistryMenuUI.js, which MUST be listed AFTER this
 * file in the Plugin Manager.
 *
 * THE BENCH
 * ---------
 * Every recipe in js/db/Items/Alchemistry.json is unlocked and can be read at
 * any time: nothing is gated behind a class any more. A recipe is COPIED onto
 * one of PROJECT_SLOTS benches, and it is the bench that is edited and run, so
 * the same recipe can be set up two different ways at once and the recipe book
 * itself is never written to.
 *
 * WHETHER IT WORKS IS A SKILL CHECK
 * ---------------------------------
 * A recipe declares `requirements`, a list of { spec, level } where `spec` is
 * the English `name` key in js/db/Skills/Specialization.json (a lookup key,
 * never translated, the same rule the forge's <Craft:> tag follows) and
 * `level` is the minimum tier (1 Untrained .. 5 Master) wanted in it.
 *
 * Meeting EVERY requirement puts the failure chance at exactly 0%. Each tier
 * short of any one of them adds FAIL_PER_LEVEL to it, so a short-handed
 * alchemist can still try and will often ruin the batch. Tiers held ABOVE
 * what a recipe asks are not wasted: they pay out as extra product, one more
 * flask per OVER_PER_EXTRA surplus tiers, up to YIELD_MAX.
 *
 * TIME IS THE WORLD CLOCK
 * -----------------------
 * A step's `duration` is read as GAME MINUTES and the bench is timed against
 * TimeDateSystem's own clock (Variable 114), not against frames. A batch
 * therefore keeps cooking while the party walks, works a shift, fast travels
 * or sleeps, and finishes the moment the clock says it should.
 *
 * REPEATING
 * ---------
 * A bench set to repeat re-buys its reagents and starts itself again the
 * instant it finishes, and stands down (with a warning) when the pack can no
 * longer pay for a run. Every one of those events is announced through
 * ParchmentToast.
 *
 * Exposes on window:
 *   window.Scene_Alchemistry  , the scene constructor (UI extends it)
 *   window.AlchemistryI18n()  , the Alchemistry namespace, read live
 *   window.AlchemistryActions , action definitions (key -> needs item)
 *   window.Alchemistry        , the bench service (see the API block below)
 *
 * @command openMenu
 * @text Open Alchemistry Menu
 * @desc Opens the Alchemistry menu scene.
 */

(() => {
    'use strict';

    // =========================================================================
    // Tuning
    // =========================================================================

    // How many benches run at once.
    const PROJECT_SLOTS = 3;

    // Failure chance per tier missing across ALL of a recipe's requirements,
    // and the ceiling it is clamped to. Nothing is ever hopeless and nothing
    // short of the full requirement is ever certain.
    const FAIL_PER_LEVEL = 0.18;
    const MAX_FAIL = 0.85;

    // Surplus tiers (held above what the recipe asks) needed for one extra
    // flask of product, and the most a single run can ever yield.
    const OVER_PER_EXTRA = 2;
    const YIELD_MAX = 4;

    // A step's `duration` in the recipe book is read as this many game minutes.
    const MINUTES_PER_DURATION = 1;

    // Specialization points paid for a run, to the member who did the work.
    const XP_SUCCESS = 2;
    const XP_FAILURE = 1;

    // =========================================================================
    // Static data shared with the UI layer
    // =========================================================================

    // Action keys are internal identifiers (never translated). `needsItem`
    // marks actions that prompt for a reagent before the step is added.
    const ALCHEMISTRY_ACTIONS = [
        { key: 'combine', needsItem: true  },
        { key: 'heat',    needsItem: false },
        { key: 'distill', needsItem: false },
        { key: 'filter',  needsItem: false },
        { key: 'wash',    needsItem: true  },
        { key: 'dry',     needsItem: false }
    ];

    // =========================================================================
    // Small shared helpers
    // =========================================================================

    function isSandbox() {
        return !!(typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._isSandboxMode);
    }

    // The world clock, in minutes. TimeDateSystem owns it; reading the variable
    // directly is the documented fallback for a save made before it loaded.
    function nowMinutes() {
        if (window.TimeDateSystem && window.TimeDateSystem.getGameTimeMinutes) {
            return window.TimeDateSystem.getGameTimeMinutes();
        }
        return (typeof $gameVariables !== 'undefined' && $gameVariables) ? ($gameVariables.value(114) || 0) : 0;
    }

    // A real, playable entry: the item database is padded with blanks and with
    // `<-- Category -->` divider rows, and neither may ever be handed over.
    function isRealItem(item) {
        return !!(item && item.name && item.name.trim() && !/^<--/.test(item.name));
    }

    function toast(text, severity, key) {
        if (!text) return;
        if (window.ParchmentToast) {
            window.ParchmentToast.show(text, { severity: severity || 'info', key: key });
        } else if (typeof $gameMessage !== 'undefined' && SceneManager._scene instanceof Scene_Map) {
            $gameMessage.add(text);
        }
    }

    // =========================================================================
    // The recipe book
    // =========================================================================

    // Parsed once per session rather than on every scene open / execute.
    let _recipeCache = null;
    let _recipePromise = null;

    function loadAlchemistryRecipes() {
        if (_recipeCache) return Promise.resolve(_recipeCache);
        if (_recipePromise) return _recipePromise;
        _recipePromise = fetch('js/db/Items/Alchemistry.json')
            .then(response => response.json())
            .then(recipes => {
                _recipeCache = Array.isArray(recipes) ? recipes : [];
                return _recipeCache;
            })
            .catch(err => {
                console.error('Alchemistry: failed to load the recipe book', err);
                _recipeCache = [];
                return _recipeCache;
            });
        return _recipePromise;
    }

    // Warm the book at boot so the scene never opens onto an empty bench.
    loadAlchemistryRecipes();

    // =========================================================================
    // window.Alchemistry, the bench service
    // =========================================================================

    const Alchemistry = {
        PROJECT_SLOTS,
        MINUTES_PER_DURATION,

        load: loadAlchemistryRecipes,
        isSandbox,
        isRealItem,
        nowMinutes,

        // ---- the book -------------------------------------------------------

        recipes() {
            return _recipeCache || [];
        },

        recipeById(id) {
            return this.recipes().find(r => r.id === id) || null;
        },

        // What the player reads. Recipe names are plain English in the data and
        // go through the shared runtime translator like every other data string.
        recipeName(recipe) {
            if (!recipe) return '';
            return window.translateText ? window.translateText(recipe.name) : recipe.name;
        },

        // Alphabetical by the name actually on screen, so the order is right in
        // whatever language the game is being read in.
        sorted(list) {
            return list.slice().sort((a, b) =>
                this.recipeName(a).localeCompare(this.recipeName(b)));
        },

        // ---- reagents -------------------------------------------------------

        reagentsOf(recipe) {
            return (recipe && recipe.required_ingredients) || [];
        },

        // Every item id the book calls for anywhere. Recipes reach past the
        // Alchemistry shelf (wood for spirit, bone for char, ore for iron), so
        // this is what the reagent picker offers on top of the shelf itself.
        bookReagentIds() {
            if (this._reagentIds && this._reagentIdsFor === this.recipes()) return this._reagentIds;
            const set = new Set();
            this.recipes().forEach(r => {
                this.reagentsOf(r).forEach(i => set.add(i.item_id));
                (r.steps || []).forEach(s => (s.ingredients || []).forEach(i => set.add(i.item_id)));
            });
            this._reagentIds = set;
            this._reagentIdsFor = this.recipes();
            return set;
        },

        // How many of a reagent the pack holds (sandbox pays for everything).
        held(itemId) {
            const item = $dataItems[itemId];
            if (!isRealItem(item)) return 0;
            return isSandbox() ? 99 : $gameParty.numItems(item);
        },

        // The bill, line by line, with what the party can cover against it.
        reagentRows(recipe) {
            return this.reagentsOf(recipe).map(ing => {
                const item = $dataItems[ing.item_id];
                const need = ing.quantity || 1;
                const have = this.held(ing.item_id);
                return { item, itemId: ing.item_id, need, have, ok: have >= need };
            }).filter(row => isRealItem(row.item));
        },

        hasReagents(recipe) {
            if (isSandbox()) return true;
            return this.reagentRows(recipe).every(row => row.ok);
        },

        // Take the bill out of the pack. Answers false without spending
        // anything when a single line cannot be covered.
        spendReagents(recipe) {
            if (isSandbox()) return true;
            const rows = this.reagentRows(recipe);
            if (!rows.every(row => row.ok)) return false;
            rows.forEach(row => $gameParty.loseItem(row.item, row.need));
            return true;
        },

        // ---- the skill check ------------------------------------------------

        requirementsOf(recipe) {
            return (recipe && recipe.requirements) || [];
        },

        // What this member's hands are worth on this recipe. `rows` reports
        // every requirement against the tier they actually hold, `failChance`
        // is 0 exactly when none is short, and `yield` is what one run pays.
        assess(actor, recipe) {
            const XP = window.SpecializationXP;
            const rows = this.requirementsOf(recipe).map(req => {
                const have = XP ? XP.levelOf(actor, req.spec) : 1;
                const need = req.level || 1;
                return {
                    spec: req.spec,
                    label: (window.Specializations && window.Specializations.displayName)
                        ? window.Specializations.displayName(req.spec) : req.spec,
                    need,
                    have,
                    ok: have >= need,
                    short: Math.max(0, need - have),
                    over: Math.max(0, have - need)
                };
            });
            const short = rows.reduce((sum, r) => sum + r.short, 0);
            const over  = rows.reduce((sum, r) => sum + r.over,  0);
            const failChance = short > 0 ? Math.min(MAX_FAIL, short * FAIL_PER_LEVEL) : 0;
            // Surplus only pays out on a recipe the member is fully qualified
            // for: being a Master of one half does not cover being short of the
            // other, it only stops the batch being ruined quite so often.
            const qty = short > 0 ? 1 : Math.min(YIELD_MAX, 1 + Math.floor(over / OVER_PER_EXTRA));
            return { rows, short, over, failChance, yield: qty, ok: short === 0 };
        },

        // ---- the benches ----------------------------------------------------

        // A bench is always one of PROJECT_SLOTS records, empty or loaded. The
        // shape is rebuilt (never patched) whenever a save carries the old
        // five-placeholder or recipe-per-project layout.
        emptyProject(n) {
            return {
                recipeId: null,
                name: T('Alchemistry.projectName', { n: n + 1 }),
                steps: [],
                required_ingredients: [],
                target_item_id: 0,
                actorId: null,
                repeat: false,
                startedAt: null,
                endsAt: null
            };
        },

        ensureProjects() {
            const sys = $gameSystem;
            if (!sys) return [];
            const list = sys._alchemistryProjects;
            const stale = !Array.isArray(list) || list.length !== PROJECT_SLOTS ||
                list.some(p => !p || !('recipeId' in p));
            if (stale) {
                sys._alchemistryProjects = [];
                for (let i = 0; i < PROJECT_SLOTS; i++) sys._alchemistryProjects.push(this.emptyProject(i));
                // Anything the old frame-counting timer left behind is void.
                sys._alchemistryTimer = 0;
                sys._alchemistryCurrentMatch = null;
                sys._alchemistryActiveProjectIndex = null;
                sys._currentAlchemistryProjectIndex = 0;
            }
            if (sys._currentAlchemistryProjectIndex == null) sys._currentAlchemistryProjectIndex = 0;
            return sys._alchemistryProjects;
        },

        projects() {
            return this.ensureProjects();
        },

        project(slot) {
            const list = this.projects();
            return list[slot] || null;
        },

        isEmpty(project) {
            return !project || (!project.recipeId && !project.steps.length);
        },

        isRunning(project) {
            return !!(project && project.endsAt != null);
        },

        // Copy a recipe onto a bench. The steps are cloned, so editing the
        // bench never writes back into the book.
        assignRecipe(slot, recipeId, actorId) {
            const project = this.project(slot);
            const recipe = this.recipeById(recipeId);
            if (!project || !recipe || this.isRunning(project)) return false;
            project.recipeId = recipe.id;
            project.name = recipe.name;
            project.target_item_id = recipe.target_item_id || 0;
            project.required_ingredients = this.reagentsOf(recipe).map(i => ({
                item_id: i.item_id, quantity: i.quantity || 1
            }));
            project.steps = (recipe.steps || []).map(s => ({
                action: String(s.action || '').toUpperCase(),
                ingredients: (s.ingredients || []).map(i => ({ item_id: i.item_id, quantity: i.quantity || 1 })),
                duration: s.duration || 10,
                temperature: s.temperature != null ? s.temperature : 25
            }));
            project.actorId = actorId != null ? actorId : project.actorId;
            project.repeat = false;
            project.startedAt = null;
            project.endsAt = null;
            return true;
        },

        clearProject(slot) {
            const project = this.project(slot);
            if (!project || this.isRunning(project)) return false;
            this.projects()[slot] = this.emptyProject(slot);
            return true;
        },

        // ---- running a bench ------------------------------------------------

        // How long the bench takes, in game minutes, from its own steps: an
        // edited bench is timed as edited, not as the book wrote it.
        durationOf(project) {
            if (!project) return 0;
            const total = (project.steps || []).reduce((sum, s) => sum + (s.duration || 0), 0);
            return Math.max(1, Math.round(total * MINUTES_PER_DURATION));
        },

        minutesLeft(project) {
            if (!this.isRunning(project)) return 0;
            return Math.max(0, project.endsAt - nowMinutes());
        },

        // The recipe a bench's steps actually spell out, which is what decides
        // the product. An edited bench that no longer matches anything makes
        // nothing, whatever recipe it started life as.
        matchOf(project) {
            if (!project || !project.steps || !project.steps.length) return null;
            return this.findMatchingRecipe(project.steps, this.recipes());
        },

        findMatchingRecipe(steps, recipes) {
            for (const recipe of recipes) {
                if ((recipe.steps || []).length !== steps.length) continue;
                let match = true;
                for (let i = 0; i < steps.length; i++) {
                    const recipeStep  = recipe.steps[i];
                    const projectStep = steps[i];
                    if (String(recipeStep.action).toUpperCase() !== String(projectStep.action).toUpperCase()) {
                        match = false; break;
                    }
                    const rIngs = recipeStep.ingredients || [];
                    const pIngs = projectStep.ingredients || [];
                    if (rIngs.length !== pIngs.length) { match = false; break; }
                    for (let j = 0; j < rIngs.length; j++) {
                        if (rIngs[j].item_id !== pIngs[j].item_id) { match = false; break; }
                    }
                    if (!match) break;
                }
                if (match) return recipe;
            }
            return null;
        },

        actorOf(project) {
            if (!project || project.actorId == null) return $gameParty.leader();
            const actor = $gameActors.actor(project.actorId);
            // A member who has left the party no longer works the bench.
            return ($gameParty.members().indexOf(actor) >= 0) ? actor : $gameParty.leader();
        },

        // Put a bench to work. Reagents are taken now, so a run in progress is
        // already paid for and cancelling is not a refund loophole.
        start(slot, opts) {
            opts = opts || {};
            const project = this.project(slot);
            if (!project || this.isRunning(project) || !project.steps.length) return false;
            const bill = { required_ingredients: project.required_ingredients };
            if (!this.hasReagents(bill)) {
                if (!opts.silent) toast(T('Alchemistry.toast.noReagents', { name: this.recipeName(project) }), 'warning');
                return false;
            }
            if (!this.spendReagents(bill)) return false;
            project.startedAt = nowMinutes();
            project.endsAt = project.startedAt + this.durationOf(project);
            if (!opts.silent) {
                toast(T('Alchemistry.toast.started', {
                    name: this.recipeName(project),
                    time: this.formatMinutes(this.durationOf(project))
                }), 'info');
            }
            return true;
        },

        // Finish a bench that the clock has run out on.
        finish(slot) {
            const project = this.project(slot);
            if (!project || !this.isRunning(project)) return;

            project.startedAt = null;
            project.endsAt = null;

            const actor = this.actorOf(project);
            const match = this.matchOf(project);
            const label = this.recipeName(project);

            if (!match) {
                // The steps on the bench do not spell out anything the book
                // knows: a ruined batch, and the reagents are gone with it.
                toast(T('Alchemistry.toast.failed', { name: label }), 'danger');
                SoundManager.playBuzzer();
                this.reward(actor, null, XP_FAILURE);
                this.afterRun(slot);
                return;
            }

            const odds = this.assess(actor, match);
            const ruined = Math.random() < odds.failChance;

            if (ruined) {
                toast(T('Alchemistry.toast.ruined', { name: label, who: actor ? actor.name() : '' }), 'danger');
                SoundManager.playBuzzer();
                this.reward(actor, match, XP_FAILURE);
                this.afterRun(slot);
                return;
            }

            const item = $dataItems[match.target_item_id];
            if (isRealItem(item)) {
                $gameParty.gainItem(item, odds.yield);
                if (window.Diary) window.Diary.onCrafted('alchemy', item.name, odds.yield);
                toast(T('Alchemistry.toast.completed', {
                    item: window.translateText ? window.translateText(item.name) : item.name,
                    qty: odds.yield
                }), 'good');
            } else {
                // A recipe whose product is not a real item still counts as run.
                toast(T('Alchemistry.toast.completedPlain', { name: label }), 'good');
            }
            SoundManager.playOk();
            this.reward(actor, match, XP_SUCCESS);
            this.afterRun(slot);
        },

        // Teach the member who did the work every trade the recipe asked for,
        // plus the bench's own Alchemy. Points go to them, not to the leader.
        reward(actor, recipe, points) {
            const XP = window.SpecializationXP;
            if (!XP) return;
            const opts = actor ? { actor } : {};
            XP.awardCapped('Alchemy', points, opts); // i18n-ignore: Specialization.json id
            this.requirementsOf(recipe).forEach(req => XP.awardCapped(req.spec, points, opts));
        },

        // A repeating bench re-buys and restarts itself; one that cannot pay
        // stands down and says so rather than silently going quiet.
        afterRun(slot) {
            const project = this.project(slot);
            if (!project || !project.repeat) return;
            const bill = { required_ingredients: project.required_ingredients };
            if (!this.hasReagents(bill)) {
                project.repeat = false;
                toast(T('Alchemistry.toast.repeatStopped', { name: this.recipeName(project) }), 'warning');
                return;
            }
            if (this.start(slot, { silent: true })) {
                toast(T('Alchemistry.toast.restarted', {
                    name: this.recipeName(project),
                    time: this.formatMinutes(this.durationOf(project))
                }), 'info');
            }
        },

        // Called every frame from the scene hook below: one variable read and a
        // comparison per bench, so a batch finishes on the world clock whether
        // the party is walking, working a shift, fast travelling or asleep.
        tick() {
            if (typeof $gameSystem === 'undefined' || !$gameSystem || !$gameSystem._alchemistryProjects) return;
            const list = $gameSystem._alchemistryProjects;
            if (!Array.isArray(list)) return;
            const now = nowMinutes();
            for (let i = 0; i < list.length; i++) {
                const p = list[i];
                if (p && p.endsAt != null && now >= p.endsAt) this.finish(i);
            }
        },

        // ---- presentation helpers shared with the UI ------------------------

        formatMinutes(minutes) {
            const m = Math.max(0, Math.round(minutes));
            const h = Math.floor(m / 60);
            const rest = m % 60;
            if (h <= 0) return T('Alchemistry.time.m', { m: rest });
            if (!rest)  return T('Alchemistry.time.h', { h: h });
            return T('Alchemistry.time.hm', { h: h, m: rest });
        },

        percent(fraction) {
            return Math.round((fraction || 0) * 100);
        }
    };

    window.Alchemistry = Alchemistry;

    // =========================================================================
    // Default project data initialization
    // =========================================================================

    // Lazy initialization of data when the main menu opens
    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function () {
        Alchemistry.ensureProjects();
        _Scene_Menu_create.call(this);
    };

    // =========================================================================
    // Scene_Alchemistry (base), logic only; DOM lives in the UI file
    // =========================================================================

    function Scene_Alchemistry() {
        this.initialize(...arguments);
    }

    Scene_Alchemistry.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Alchemistry.prototype.constructor = Scene_Alchemistry;

    Scene_Alchemistry.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_Alchemistry.prototype.create = function () {
        Alchemistry.ensureProjects();
        Scene_MenuBase.prototype.create.call(this);
        // Name the skill this menu runs on while it is open.
        if (window.SpecBadge) window.SpecBadge.show('Alchemy');  // i18n-ignore  Specialization.json id
    };

    // Convert a <Formula: ...> note tag into a subscript-rendered string.
    Scene_Alchemistry.prototype.getItemFormula = function (item) {
        if (!item || !item.note) return '';
        const match = item.note.match(/<Formula:\s*(.*?)>/);
        if (!match) return '';
        const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
        return match[1].replace(/\d/g, d => subscripts[parseInt(d, 10)]);
    };

    // Adding a step also adds what it consumes to the bench's bill: the bill is
    // what is paid at start, so a hand-edited bench that reaches for a reagent
    // it never declared would otherwise brew it out of nothing.
    Scene_Alchemistry.prototype.addStepToProject = function (slot, action, itemId) {
        const project = Alchemistry.project(slot);
        if (!project || Alchemistry.isRunning(project)) return;
        project.steps.push({
            action: String(action).toUpperCase(),
            ingredients: itemId ? [{ item_id: itemId, quantity: 1 }] : [],
            duration: 10,
            temperature: 25
        });
        if (itemId) {
            const line = project.required_ingredients.find(i => i.item_id === itemId);
            if (line) line.quantity = (line.quantity || 1) + 1;
            else project.required_ingredients.push({ item_id: itemId, quantity: 1 });
        }
    };

    // Emptying a bench empties its bill with it, or the next run would be
    // charged for reagents no step asks for any more.
    Scene_Alchemistry.prototype.clearProjectSteps = function (slot) {
        const project = Alchemistry.project(slot);
        if (!project || Alchemistry.isRunning(project)) return;
        project.steps = [];
        project.required_ingredients = [];
        project.recipeId = null;
        project.target_item_id = 0;
        project.repeat = false;
    };

    // =========================================================================
    // Background processing, driven by the world clock
    // =========================================================================

    const _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function () {
        _Scene_Base_update.call(this);
        Alchemistry.tick();
    };

    // =========================================================================
    // Exports + plugin command
    // =========================================================================

    window.Scene_Alchemistry  = Scene_Alchemistry;
    // A live read of the namespace, so the panel follows a language switch.
    window.AlchemistryI18n    = () => T.obj('Alchemistry');
    window.AlchemistryActions = ALCHEMISTRY_ACTIONS;

    PluginManager.registerCommand('AlchemistryMenu', 'openMenu', () => {
        SceneManager.push(Scene_Alchemistry);
    });
})();
