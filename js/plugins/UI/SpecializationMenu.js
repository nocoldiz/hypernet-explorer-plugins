/*:
 * @target MZ
 * @plugindesc Specializations menu: browses js/db/Skills/Specialization.json, 5-level tiers seeded by class and trait [Claude].
 * @author Esoteric Heavy Industries
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @command addSpecializationExp
 * @text Add Specialization EXP
 * @desc Adds experience points to one specialization. Type its name or its id;
 *       there are 800+ of them, so they are deliberately not listed.
 *
 * @arg spec
 * @text Specialization
 * @type string
 * @default
 * @desc Exact name (Haggling, Beekeeping, Playing Piano) or numeric id (127).
 *
 * @arg amount
 * @text Points
 * @type number
 * @min 1
 * @max 9999
 * @default 1
 * @desc Points to add. A tier costs 3, then 20, 45 and 90.
 *
 * @arg actorId
 * @text Actor
 * @type actor
 * @default 0
 * @desc Who earns it. Leave at 0 for the party leader, with the usual share to everyone watching.
 *
 * @arg soloist
 * @text Only that actor
 * @type boolean
 * @default false
 * @desc ON to give the points to that member alone, with no share to the rest of the party.
 *
 * @arg silent
 * @text Silent
 * @type boolean
 * @default false
 * @desc ON to bank the points without raising the level-up toast.
 *
 * @help SpecializationMenu.js
 *
 * Loads js/db/Skills/Specialization.json (800 real-life specializations, each
 * tagged with a governing stat) and renders a parchment book-spread scene:
 *   - Left page: a character switcher (like the Equip menu) plus the active
 *     member's specialization list. Specializations above Untrained are
 *     listed first, alphabetically; Untrained ones follow, also alphabetical.
 *     The filter row opens on "Trained", which hides the Untrained section
 *     entirely; "All" and the per-category tabs show the full list.
 *   - Right page: detail for the selected specialization - its tier name,
 *     a 5-pip level bar, and which classes/traits grant it a head start.
 *
 * Controls: L1/R1, TAB and left/right cycle the category tabs from anywhere
 * (the backpack works the same way); up/down walk the list; SHIFT (X on a pad)
 * changes companion; ESC, controller B and right click close the sheet.
 *
 * A specialization's level is the highest of:
 *   - trained level  (Game_Actor._specLevels[id], earned through play)
 *   - class bonus    (Specialization.json "classStart"[actor's class name])
 *   - trait bonus    (Specialization.json "traitStart"[selected trait slug])
 * so switching class or picking a trait immediately reflects in the sheet
 * without needing a one-time seeding step at character creation.
 *
 * The "Weapons" category holds one specialization per in-game weapon type,
 * tagged with a "wtypeId". Those are the proficiencies ItemSystemEquipment.js
 * reads to scale a weapon's stats, and they train through use: every battle
 * won feeds experience into the specialization of each equipped weapon
 * (Game_Actor#gainSpecializationExp), so an untrained weapon carried long
 * enough eventually becomes as effective as a class-issued one.
 *
 * Exposes window.Specializations (data access) and Game_Actor#specialization*
 * accessors for other plugins to read/train specializations.
 */

(() => {
    'use strict';

    // i18n-ignore-start  must stay identical to js/db/Skills/Specialization.json
    // "levels", which is what the menu actually reads and displays
    const LEVEL_NAMES_FALLBACK = ["Untrained", "Beginner", "Intermediate", "Advanced", "Master"];
    // i18n-ignore-end

    // Columns on the left page, read off the grid that is drawn rather than
    // restated here: the handheld sheet narrows `.backpack-grid`, and a cursor
    // stepping by a stale 3 would walk diagonally on a Deck.
    function specCols() {
        return window.MenuVirtualList
            ? window.MenuVirtualList.columnsOf('#spec-list-content', 3) : 3;
    }

    // The filter row is ['Trained', 'All', ...categories]; the first two are the
    // menu's own tabs and the rest are category ids, which stay English because
    // the list is filtered on them. Only the label is localised.
    function categoryTabLabel(cat) {
        if (cat === 'Trained') return T('SpecMenu.ui.trained');
        if (cat === 'All') return T('SpecMenu.ui.all');
        return window.Specializations.categoryLabel(cat);
    }

    // Each of the two sections is read in two runs: the disciplines the game
    // actually does something with first, then the ones that are still only a
    // line on the sheet, under their own heading. The order inside each run is
    // whatever the caller settled on, and nothing is hidden: an unfinished
    // specialization is trained, spent on and inspected exactly as before.
    function splitSections(trained, untrained) {
        const done = list => list.filter(s => window.Specializations.isImplemented(s));
        const todo = list => list.filter(s => !window.Specializations.isImplemented(s));
        const section = { trained: done(trained), trainedTodo: todo(trained),
            untrained: done(untrained), untrainedTodo: todo(untrained) };
        section.order = [...section.trained, ...section.trainedTodo,
            ...section.untrained, ...section.untrainedTodo];
        return section;
    }

    // Experience needed to climb out of each level, indexed by current level.
    //
    // Weapons train through combat and stay deliberately slow: roughly one point
    // per battle won, so an untrained weapon reaches Intermediate (no stat
    // penalty) after 28 fights carrying it.
    const EXP_TO_NEXT_WEAPON = [0, 8, 20, 45, 90];
    // Everything else trains through doing the thing (see window.Specializations
    // .XP). The first tier is deliberately cheap - three goes at an activity and
    // it shows up on the sheet as Beginner - and the later ones are not.
    const EXP_TO_NEXT = [0, 3, 20, 45, 90];

    // =========================================================================
    // Data loader - window.Specializations
    // =========================================================================
    window.Specializations = {
        levels: LEVEL_NAMES_FALLBACK,
        levelsBase: LEVEL_NAMES_FALLBACK, // English tier names, the overlay keys
        categories: [],
        list: [],
        byId: new Map(),
        byName: new Map(),
        byWtype: new Map(),
        ready: false,

        async load() {
            try {
                const response = await fetch('js/db/Skills/Specialization.json');
                const json = await response.json();
                this.levelsBase = json.levels || LEVEL_NAMES_FALLBACK;
                this.levels = this.levelsBase;
                this.categories = json.categories || [];
                this.list = json.specializations || [];
                this.byId.clear();
                this.byName.clear();
                this.byWtype.clear();
                this.list.forEach(spec => {
                    this.byId.set(spec.id, spec);
                    this.byName.set(spec.name, spec);
                    if (spec.wtypeId) this.byWtype.set(spec.wtypeId, spec);
                });
                await this.loadI18n();
                this.ready = true;
                // The config can have resolved while those two fetches were in
                // flight, in which case the bank just read is the wrong one.
                this.syncI18n();
            } catch (e) {
                console.error('SpecializationMenu: failed to load Specialization.json', e);
            }
        },

        // What the player reads, from js/i18n/<lang>/Specializations.json. The
        // English `spec.name` in the db is a LOOKUP KEY (byName, and
        // xp.discount('Haggling') in ItemSystemShop), so it is never translated:
        // the display text lives here, keyed by id, and the level bank is
        // overlaid outright because level names are shown and never matched on.
        // Categories are NOT overlaid, they are the tab ids; use categoryLabel().
        i18n: null,
        i18nLang: null,     // language the bank in `i18n` was read for
        i18nVersion: 0,     // bumped on every swap, so callers can drop caches
        _i18nPending: null,

        activeLang() {
            return (window.ConfigManager && ConfigManager.language) || 'en';
        },

        async loadI18n(lang) {
            const target = lang || this.activeLang();
            let data = null;
            try {
                const res = await fetch(`js/i18n/${target}/Specializations.json`);
                if (res.ok) data = await res.json();
            } catch (e) { /* no bank for this language, English stands */ }
            // A language switch that raced ahead of this fetch owns the bank now.
            if (this.i18nLang !== null && this.activeLang() !== target) return;
            this.i18n = data;
            this.i18nLang = target;
            const base = Array.isArray(this.levelsBase) ? this.levelsBase : LEVEL_NAMES_FALLBACK;
            this.levels = (data && data.level) ? base.map(n => data.level[n] || n) : base;
            this.i18nVersion++;
        },

        // ConfigManager.language holds the plugin default until ConfigManager
        // .load() resolves in Scene_Boot - long after load() above has already
        // read a bank - and the player can switch language from the options at
        // any time after that. Every lookup compares the bank against the active
        // language and re-reads it when they differ, the way DataService's
        // i18nSync does. The re-read is async, so the call that notices still
        // answers from the old bank and the next redraw is in the new language;
        // ConfigManager.applyData below fires it at boot, before anything draws.
        syncI18n() {
            const lang = this.activeLang();
            if (!this.ready || lang === this.i18nLang || lang === this._i18nPending) return;
            this._i18nPending = lang;
            this.loadI18n(lang).then(() => {
                if (this._i18nPending === lang) this._i18nPending = null;
            });
        },

        levelName(level) {
            this.syncI18n();
            return this.levels[Math.max(0, Math.min(this.levels.length - 1, level - 1))] || this.levels[0];
        },

        // The category tab label. `categories` itself stays English, it is the id.
        categoryLabel(category) {
            this.syncI18n();
            const t = this.i18n && this.i18n.category && this.i18n.category[category];
            return t || category;
        },

        // Whether the discipline is actually wired into a game mechanic, or is
        // still only a line on the sheet. The db carries the flag ("implemented"
        // in Specialization.json); anything without one is read as implemented,
        // so an entry added later never silently drops into the unfinished pile.
        // Every list that shows specializations groups on this: the trained and
        // untrained runs alike, and the character creation board.
        isImplemented(spec) {
            const def = typeof spec === 'object' && spec ? spec
                : (this.byId.get(spec) || this.byName.get(spec));
            return !def || def.implemented !== false;
        },

        // The specialization's name as the player reads it. Takes a spec object,
        // an id or an English name, the same three things describe() takes.
        displayName(spec) {
            this.syncI18n();
            const def = typeof spec === 'object' && spec ? spec
                : (this.byId.get(spec) || this.byName.get(spec));
            if (!def) return typeof spec === 'string' ? spec : '';
            const t = this.i18n && this.i18n.spec && this.i18n.spec[def.id];
            return (t && t.name) || def.name;
        },

        // Weapon-type proficiency for a weapon type id, or null when the data
        // has not finished loading yet.
        forWtype(wtypeId) {
            return this.byWtype.get(wtypeId) || null;
        },

        // Points needed to leave `level`. A weapon proficiency uses the slow
        // combat table; passing the specialization (or its id/name) picks the
        // right one, and omitting it keeps the old activity-paced default.
        expToNext(level, spec) {
            const def = typeof spec === 'object' && spec ? spec
                : (spec != null ? (this.byId.get(spec) || this.byName.get(spec)) : null);
            const table = (def && def.wtypeId) ? EXP_TO_NEXT_WEAPON : EXP_TO_NEXT;
            return table[level] || 0;
        },

        // Neutral one-line definition, in the language being played.
        describe(spec) {
            this.syncI18n();
            const def = typeof spec === 'object' && spec ? spec
                : (this.byId.get(spec) || this.byName.get(spec));
            if (!def) return '';
            const t = this.i18n && this.i18n.spec && this.i18n.spec[def.id];
            return (t && t.description) || def.description || '';
        }
    };
    window.Specializations.load();

    // The saved language lands here, and it is the first point where the bank
    // read at plugin load (the plugin default, always English) can be wrong.
    const _ConfigManager_applyData_Spec = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData_Spec.call(this, config);
        window.Specializations.syncI18n();
    };

    // =========================================================================
    // Game_Actor accessors
    // =========================================================================

    // Trained level: only levels above Untrained (2-5) are ever stored, so a
    // fresh actor with no entry simply reads as Untrained (1).
    Game_Actor.prototype.specializationTrainedLevel = function (id) {
        if (!this._specLevels) this._specLevels = {};
        return this._specLevels[id] || 1;
    };

    Game_Actor.prototype.setSpecializationTrainedLevel = function (id, level) {
        if (!this._specLevels) this._specLevels = {};
        const clamped = Math.max(1, Math.min(5, level));
        if (clamped <= 1) {
            delete this._specLevels[id];
        } else {
            this._specLevels[id] = clamped;
        }
    };

    Game_Actor.prototype.specializationClassBonus = function (id) {
        const cls = this.currentClass();
        const spec = window.Specializations.byId.get(id);
        if (!cls || !spec || !spec.classStart) return 1;
        return spec.classStart[cls.name] || 1;
    };

    // actor._selectedTraits holds the raw Traits.json objects when the traits
    // were bound in TraitSelector.js, and bare trait ids when they were bound
    // on the character creation board. Either spelling is read here, and the
    // trait's "name" field is the i18n key "traits.<slug>.name". When several
    // traits name the same specialization, the most generous one counts.
    Game_Actor.prototype.specializationTraitBonus = function (id) {
        const spec = window.Specializations.byId.get(id);
        if (!spec || !spec.traitStart || !this._selectedTraits) return 1;
        const bank = (window.Health && window.Health.Traits) || [];
        let best = 1;
        this._selectedTraits.forEach(entry => {
            const trait = (entry && entry.name) ? entry : bank.find(t => String(t.id) === String(entry));
            const slug = trait && trait.name ? String(trait.name).split('.')[1] : null;
            const lvl = slug ? spec.traitStart[slug] : null;
            if (lvl && lvl > best) best = lvl;
        });
        return best;
    };

    // How much of a class/trait head start this character actually took. It is
    // normally all of it, and undefined means exactly that. Character creation
    // (CharacterCreationFull) lets a free level be handed back for a point
    // spent somewhere else, and this is where that trade is recorded.
    Game_Actor.prototype.specializationGrantKept = function (id) {
        return this._specGrantsKept ? this._specGrantsKept[id] : undefined;
    };

    // Pass null to take the whole grant again.
    Game_Actor.prototype.setSpecializationGrantKept = function (id, level) {
        if (!this._specGrantsKept) this._specGrantsKept = {};
        if (level == null) delete this._specGrantsKept[id];
        else this._specGrantsKept[id] = Math.max(1, Math.min(5, level));
    };

    Game_Actor.prototype.clearSpecializationGrantsKept = function () {
        this._specGrantsKept = {};
    };

    // The free head start the class and the traits are giving right now, as
    // taken: the full grant, or the part of it the character kept.
    Game_Actor.prototype.specializationGrantedLevel = function (id) {
        const granted = Math.max(
            this.specializationClassBonus(id),
            this.specializationTraitBonus(id)
        );
        const kept = this.specializationGrantKept(id);
        return kept == null ? granted : Math.min(granted, kept);
    };

    // Capping the grant deliberately leaves the trained level alone: signing a
    // head start away at creation is giving up something the character was
    // handed, not a promise never to learn the thing.
    Game_Actor.prototype.specializationLevel = function (id) {
        return Math.max(
            this.specializationTrainedLevel(id),
            this.specializationGrantedLevel(id)
        );
    };

    Game_Actor.prototype.specializationLevelName = function (id) {
        return window.Specializations.levelName(this.specializationLevel(id));
    };

    // Progress towards the next level, counted from the *effective* level so a
    // class-granted head start is never re-earned point by point.
    Game_Actor.prototype.specializationExp = function (id) {
        if (!this._specExp) this._specExp = {};
        return this._specExp[id] || 0;
    };

    Game_Actor.prototype.specializationExpToNext = function (id) {
        return window.Specializations.expToNext(this.specializationLevel(id), id);
    };

    // Returns the new level when the specialization advanced, 0 otherwise.
    Game_Actor.prototype.gainSpecializationExp = function (id, amount) {
        if (!id || !(amount > 0)) return 0;
        const level = this.specializationLevel(id);
        const needed = window.Specializations.expToNext(level, id);
        if (!needed) return 0; // already at Master
        if (!this._specExp) this._specExp = {};
        const total = this.specializationExp(id) + amount;
        if (total < needed) {
            this._specExp[id] = total;
            return 0;
        }
        this._specExp[id] = 0;
        this.setSpecializationTrainedLevel(id, level + 1);
        this.refresh();
        return level + 1;
    };

    // =========================================================================
    // window.SpecializationXP - the activity listener
    // -------------------------------------------------------------------------
    // The single entry point every other plugin uses to say "the party just did
    // this". Points go to the whole party, weighted: whoever is leading the
    // activity (the party leader by default) earns the full amount and everyone
    // else learns by watching, at a fraction of it. A tier gained raises a
    // top-left toast naming the member and the new tier.
    //
    //   window.SpecializationXP.award('Astronomy', 1);
    //   window.SpecializationXP.award('Mining', 2, { actor: someActor });
    //   const lvl = window.SpecializationXP.partyLevel('Farming'); // 1..5
    //   yield *= window.SpecializationXP.multiplier('Farming');    // 1.00..1.32
    //
    // Activities that run continuously (time spent in a menu, a long drive)
    // should call tick(), which only pays out once its interval has elapsed.
    // =========================================================================
    const ONLOOKER_SHARE = 0.35;     // what a party member picks up by watching
    const DEFAULT_PER_LEVEL = 0.08;  // bonus per tier above Untrained

    // Value-scaled awards (awardForValue). VALUE_BASE is the gold value of a
    // "notable" transaction, the one worth about a point. The curve is
    // logarithmic so a deal ten times larger teaches roughly one point more
    // rather than ten times as much, which is what stops a player learning
    // Haggling by buying and re-selling the same stack all afternoon.
    const VALUE_BASE = 500;          // 5.00 EUR
    // And a hard ceiling per specialization per in-game day on top of that, for
    // the same reason: doing a thing all day is not how anybody gets good.
    const DAILY_POINT_CAP = 6;
    const MINUTES_PER_DAY = 1440;    // Variable 114 is the world clock in minutes

    const SpecializationXP = {
        // Resolve a name / id / spec object to the data record.
        resolve(spec) {
            if (!spec) return null;
            if (typeof spec === 'object') return spec;
            const S = window.Specializations;
            return S.byId.get(spec) || S.byName.get(spec) || null;
        },

        // Give points for an activity. `opts.actor` names the member doing it
        // (defaults to the party leader); `opts.soloist` limits the award to
        // that member alone; `opts.shared` says everybody is doing it together
        // (swimming across a lake), so no one is a mere onlooker and the whole
        // party earns the full amount; `opts.silent` skips the toast and hands
        // the gained tiers back, for callers that want to group the level up
        // with their own notification (see MinigameFun). Returns the list of
        // tiers gained.
        award(spec, points, opts) {
            opts = opts || {};
            const def = this.resolve(spec);
            if (!def || !(points > 0) || typeof $gameParty === 'undefined' || !$gameParty) return [];
            const members = $gameParty.members ? $gameParty.members() : [];
            if (!members.length) return [];
            const lead = opts.actor || $gameParty.leader();
            const gained = [];
            members.forEach(actor => {
                if (!actor) return;
                const isLead = actor === lead;
                if (!isLead && opts.soloist) return;
                const share = (isLead || opts.shared) ? points : points * ONLOOKER_SHARE;
                const newLevel = actor.gainSpecializationExp(def.id, share);
                // `name` rides along on the record rather than on announce(),
                // so a caller that defers the toast (see CookingSystem) still
                // gets the label it asked for.
                if (newLevel) gained.push({ actor, spec: def, level: newLevel, name: opts.name || null });
            });
            if (!opts.silent) gained.forEach(g => this.announce(g));
            return gained;
        },

        // A continuous activity: pays `points` at most once every `seconds` of
        // real time, keyed so two different activities never share a clock.
        tick(spec, points, seconds, opts) {
            const def = this.resolve(spec);
            if (!def) return [];
            const key = def.id + '|' + ((opts && opts.key) || 'default');
            const now = Date.now();
            const last = this._clocks[key] || 0;
            if (now - last < (seconds || 30) * 1000) return [];
            this._clocks[key] = now;
            return this.award(def, points, opts);
        },
        _clocks: {},

        // One member's level in it, 1..5. A menu that names who is doing the
        // work (anything carrying the party switcher) reads this rather than
        // partyLevel: it is that member's hands on the job, not the party's
        // best pair. Falls back to the party reading when nobody is named.
        levelOf(actor, spec) {
            const def = this.resolve(spec);
            if (!def) return 1;
            if (!actor || !actor.specializationLevel) return this.partyLevel(def);
            return actor.specializationLevel(def.id);
        },

        // multiplier() / discount() for a named member.
        multiplierFor(actor, spec, perLevel) {
            const step = perLevel != null ? perLevel : DEFAULT_PER_LEVEL;
            return 1 + step * (this.levelOf(actor, spec) - 1);
        },

        discountFor(actor, spec, perLevel, floor) {
            const step = perLevel != null ? perLevel : DEFAULT_PER_LEVEL;
            const min = floor != null ? floor : 0.5;
            return Math.max(min, 1 - step * (this.levelOf(actor, spec) - 1));
        },

        // The best effective level anyone in the party has, 1..5. This is what
        // an activity checks when it wants to know if the party is any good at
        // something ("choosing the highest one").
        partyLevel(spec) {
            const def = this.resolve(spec);
            if (!def || typeof $gameParty === 'undefined' || !$gameParty) return 1;
            const members = $gameParty.members ? $gameParty.members() : [];
            return members.reduce(
                (best, a) => Math.max(best, a ? a.specializationLevel(def.id) : 1), 1);
        },

        // Which member is the party's best at it (for "who leads this job").
        bestMember(spec) {
            const def = this.resolve(spec);
            if (!def || typeof $gameParty === 'undefined' || !$gameParty) return null;
            let best = null;
            let bestLvl = 0;
            ($gameParty.members ? $gameParty.members() : []).forEach(a => {
                const lvl = a ? a.specializationLevel(def.id) : 0;
                if (lvl > bestLvl) { bestLvl = lvl; best = a; }
            });
            return best;
        },

        // 1.00 at Untrained up to 1.32 at Master (with the default 8% a tier):
        // the standard way an activity pays the party back for being trained.
        multiplier(spec, perLevel) {
            const step = perLevel != null ? perLevel : DEFAULT_PER_LEVEL;
            return 1 + step * (this.partyLevel(spec) - 1);
        },

        // The mirror of multiplier(), for costs rather than payouts: 1.00 at
        // Untrained down to 0.68 at Master with the default 8% a tier. A price,
        // a penalty and a difficulty are all things training should push down,
        // and `floor` is there so none of them can ever reach zero.
        discount(spec, perLevel, floor) {
            const step = perLevel != null ? perLevel : DEFAULT_PER_LEVEL;
            const min = floor != null ? floor : 0.5;
            return Math.max(min, 1 - step * (this.partyLevel(spec) - 1));
        },

        // Points earned from the gold value of a transaction: a bigger deal
        // teaches more, on the logarithmic curve described at VALUE_BASE. Goes
        // through the daily cap, because this is the award most worth farming.
        awardForValue(spec, goldAmount, opts) {
            const def = this.resolve(spec);
            if (!def || !(goldAmount > 0)) return [];
            const points = Math.max(0.25, Math.log10(1 + goldAmount / VALUE_BASE) + 0.25);
            return this.awardCapped(def, points, opts);
        },

        // award() with a ceiling on how much one specialization can be taught in
        // a single in-game day. The ledger is keyed off the monotonic world
        // clock (Variable 114) and lives on $gameSystem, so it survives a save
        // and resets when the day turns rather than when the session does.
        awardCapped(spec, points, opts) {
            const def = this.resolve(spec);
            if (!def || !(points > 0)) return [];
            if (typeof $gameSystem === 'undefined' || !$gameSystem) return [];
            const minutes = (typeof $gameVariables !== 'undefined' && $gameVariables)
                ? $gameVariables.value(114) : 0;
            const day = Math.floor(minutes / MINUTES_PER_DAY);
            if (!$gameSystem._specDailyLedger) $gameSystem._specDailyLedger = { day: -1, used: {} };
            const ledger = $gameSystem._specDailyLedger;
            if (ledger.day !== day) { ledger.day = day; ledger.used = {}; }
            const used = ledger.used[def.id] || 0;
            const grant = Math.min(points, Math.max(0, DAILY_POINT_CAP - used));
            if (grant <= 0) return [];
            ledger.used[def.id] = used + grant;
            return this.award(def, grant, opts);
        },

        // True once anyone in the party has left Untrained.
        trained(spec) { return this.partyLevel(spec) > 1; },

        // Every level up in the game is announced here, through the shared
        // notification service, so a weapon proficiency, a courtroom hour and a
        // night at the arcade all read the same way.
        announce(g) {
            if (!g || !g.actor || !g.spec) return;
            if (window.ParchmentToast && window.ParchmentToast.specUp) {
                window.ParchmentToast.specUp(g.actor, g.spec, g.level, { duration: 200, name: g.name || undefined });
            } else if (typeof $gameMessage !== 'undefined' && $gameMessage && !$gameMessage.isBusy()) {
                const name = (g.actor.name && g.actor.name()) || T('SpecializationMenu.someone');
                const label = g.name || g.spec.name;
                $gameMessage.add(`${name}: ${label} - ${window.Specializations.levelName(g.level)}`);
            }
            if (window.SoundManager && SoundManager.playLevelUp) SoundManager.playLevelUp();
            // A tier gained while the menu that taught it is still open should
            // show on its badge straight away.
            if (window.SpecBadge) window.SpecBadge.refresh();
        }
    };
    window.SpecializationXP = SpecializationXP;
    window.Specializations.XP = SpecializationXP;

    // =========================================================================
    // window.SkillSpecs - which specialization a battle skill runs on
    // -------------------------------------------------------------------------
    // A skill is a thing somebody practises, so using one trains the discipline
    // it belongs to and the discipline pays back into it: a boxer's Uppercut
    // trains Boxing and hits harder the better their Boxing is. The mapping is
    // data (js/db/Skills/SkillSpecs.json), resolved per skill and cached:
    // the skill's own name first, then its <category:> note tag, then its skill
    // type, so a skill added later is covered without touching this file.
    //
    //   window.SkillSpecs.forSkill(skill)          -> spec record or null
    //   window.SkillSpecs.levelFor(actor, skill)   -> 1..5
    //   window.SkillSpecs.multiplier(actor, skill) -> 1.00 .. 1.24
    //
    // Training is silent by design: the only thing the player ever sees is the
    // toast when a tier is actually gained.
    // =========================================================================
    const SKILL_PER_LEVEL = 0.06;   // damage / healing gained per tier above Untrained
    const SKILL_USE_POINTS = 1;     // ...taught by one use, through the daily cap

    const SkillSpecs = {
        rules: [],
        byCategory: {},
        byStype: {},
        ready: false,
        _cache: new Map(),

        async load() {
            try {
                const response = await fetch('js/db/Skills/SkillSpecs.json');
                const json = await response.json();
                this.rules = (json.byName || []).map(r => ({
                    rx: this.compile(r.match),
                    spec: r.spec
                })).filter(r => r.rx);
                this.byCategory = json.byCategory || {};
                this.byStype = json.byStype || {};
                this._cache.clear();
                this.ready = true;
            } catch (e) {
                console.error('SpecializationMenu: failed to load SkillSpecs.json', e);
            }
        },

        // Word boundaries are added here rather than written into the data,
        // where a backslash would collide with JSON's own escapes. Without them
        // "Thousand Fists" reads as earth magic (sand) and "Chair Shot" as wind.
        compile(pattern) {
            if (!pattern) return null;
            try {
                const alts = String(pattern).split('|').filter(Boolean)
                    .map(a => '\\b' + a);
                return new RegExp(alts.join('|'), 'i');
            } catch (e) {
                console.warn('SpecializationMenu: bad SkillSpecs pattern', pattern);
                return null;
            }
        },

        // Database names are written both ways ("Fire Breath", "FireBreath"),
        // so the CamelCase ones are split before matching.
        _words(name) {
            return String(name || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
        },

        _categoryOf(skill) {
            const m = skill.note ? skill.note.match(/<category:\s*(.+?)>/i) : null;
            return m ? m[1].trim() : null;
        },

        // The specialization record a skill belongs to, or null for the ones
        // that belong to nothing (Attack, Guard and the other engine basics).
        forSkill(skill) {
            if (!skill || !skill.id) return null;
            if (this._cache.has(skill.id)) return this._cache.get(skill.id);
            if (!this.ready || !window.Specializations.ready) return null;
            let name = null;
            const words = this._words(skill.name);
            for (const rule of this.rules) {
                if (rule.rx.test(words)) { name = rule.spec; break; }
            }
            if (!name) {
                const cat = this._categoryOf(skill);
                if (cat && Object.prototype.hasOwnProperty.call(this.byCategory, cat)) {
                    name = this.byCategory[cat];
                }
            }
            if (!name) name = this.byStype[String(skill.stypeId)] || null;
            const def = name ? (window.Specializations.byName.get(name) || null) : null;
            this._cache.set(skill.id, def);
            return def;
        },

        levelFor(actor, skill) {
            const def = this.forSkill(skill);
            if (!def || !actor || !actor.specializationLevel) return 1;
            return actor.specializationLevel(def.id);
        },

        // What being trained is worth on the numbers: 1.00 at Untrained up to
        // 1.24 at Master, applied to the skill's damage and its healing alike.
        multiplier(actor, skill) {
            return 1 + SKILL_PER_LEVEL * (this.levelFor(actor, skill) - 1);
        },

        // Using a skill is practising it. Capped per day like every other
        // activity, so a menu-cast skill cannot be spammed into mastery.
        train(actor, skill) {
            const def = this.forSkill(skill);
            if (!def || !actor) return [];
            return SpecializationXP.awardCapped(def, SKILL_USE_POINTS, { actor });
        }
    };
    window.SkillSpecs = SkillSpecs;
    SkillSpecs.load();

    // -------------------------------------------------------------------------
    // Engine hooks: one call per use in battle (BattleManager) and in the menu
    // (Scene_ItemBase), and one place where a skill's numbers are settled.
    // -------------------------------------------------------------------------
    const _Game_Battler_useItem = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function (item) {
        _Game_Battler_useItem.call(this, item);
        if (this.isActor && this.isActor() && DataManager.isSkill(item)) {
            try { SkillSpecs.train(this, item); } catch (e) { /* never break a turn */ }
        }
    };

    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        const value = _Game_Action_makeDamageValue.call(this, target, critical);
        const item = this.item();
        const subject = this.subject();
        if (!item || !subject || !subject.isActor || !subject.isActor()) return value;
        if (!DataManager.isSkill(item)) return value;
        const mult = SkillSpecs.multiplier(subject, item);
        if (mult === 1) return value;
        // Healing is a negative damage value, so the same multiplication makes
        // a trained healer heal more rather than less.
        return Math.round(value * mult);
    };

    // =========================================================================
    // window.SpecBadge - the live "what am I training" chip
    // -------------------------------------------------------------------------
    // Any menu or minigame whose outcome is decided by a specialization says so
    // on screen while it is open, so the player can see which skill is being
    // practised and how far along the party is. One chip per specialization,
    // hung under the page's party switcher (or, failing one, in the top right
    // corner of the open page) so it always lands inside the parchment border.
    //
    //   window.SpecBadge.show('Lockpicking');
    //   window.SpecBadge.show(['Cooking', 'Nutrition'], { el: overlayRoot });
    //   window.SpecBadge.hide();
    //
    // It cleans up after itself: the chips disappear when the scene changes, or
    // when the DOM overlay passed as `opts.el` leaves the document, so a caller
    // that forgets to hide() never leaves a badge stranded on screen.
    // =========================================================================
    const SpecBadge = {
        _el: null,
        _specs: [],
        _scene: null,
        _host: null,
        _actor: null,
        _anchorSel: null,
        _raf: null,
        _expireAt: 0,

        show(spec, opts) {
            opts = opts || {};
            const list = (Array.isArray(spec) ? spec : [spec])
                .map(s => SpecializationXP.resolve(s))
                .filter(Boolean);
            if (!list.length) {
                // Specialization.json loads asynchronously; a scene opening on
                // the first frame of a new game would otherwise show nothing.
                if (!window.Specializations.ready) {
                    setTimeout(() => this.show(spec, opts), 120);
                }
                return;
            }
            this._specs = list;
            this._scene = (typeof SceneManager !== 'undefined') ? SceneManager._scene : null;
            this._host = opts.el || null;
            // `actor` is the member the menu says is doing the work, from its
            // party switcher. Without one the chip reports the party.
            this._actor = opts.actor || null;
            // A page with no party switcher can name the element the chip
            // should hang under (its own header, say), so the badge never
            // lands on top of the title in the corner.
            this._anchorSel = opts.anchor || null;
            // A badge normally lives as long as the scene that raised it. On the
            // map nothing is "open", so a caller there (an overlay minigame, a
            // one-shot result) gets a timed chip instead of a permanent one.
            const onMap = typeof Scene_Map !== 'undefined' && this._scene instanceof Scene_Map;
            const ttl = opts.ttl != null ? opts.ttl : (onMap && !this._host ? 12000 : 0);
            this._expireAt = ttl > 0 ? Date.now() + ttl : 0;
            this._ensure();
            this._render();
            if (this._raf === null) this._raf = requestAnimationFrame(() => this._tick());
        },

        hide() {
            this._specs = [];
            this._scene = null;
            this._host = null;
            this._actor = null;
            this._anchorSel = null;
            this._expireAt = 0;
            if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
            this._el = null;
            if (this._raf !== null) {
                cancelAnimationFrame(this._raf);
                this._raf = null;
            }
        },

        // Re-read the levels (called on every level up, so a tier gained while
        // the menu is open is visible immediately).
        refresh() {
            if (this._specs.length) this._render();
        },

        _ensure() {
            if (this._el && document.body.contains(this._el)) return;
            document.querySelectorAll('#spec-badge-stack').forEach(e => e.remove());
            const el = document.createElement('div');
            el.id = 'spec-badge-stack';
            document.body.appendChild(el);
            this._el = el;
        },

        _render() {
            if (!this._el) return;
            const rows = this._specs.map(def => {
                // A menu that names who is doing the work reports that member's
                // own tier; anything else reports the party's best.
                const doer = this._actor;
                const level = doer
                    ? SpecializationXP.levelOf(doer, def)
                    : SpecializationXP.partyLevel(def);
                const name = window.Specializations.displayName(def);
                const holder = doer || (level > 1 ? SpecializationXP.bestMember(def) : null);
                const who = (holder && holder.name) ? holder.name() : '';
                return `<div class="spec-badge spec-badge--t${level}">` +
                    `<span class="spec-badge-name">${escapeHtml(name)}</span>` +
                    `<span class="spec-badge-level">${escapeHtml(window.Specializations.levelName(level))}</span>` +
                    (who ? `<span class="spec-badge-who">${escapeHtml(who)}</span>` : '') +
                    `</div>`;
            });
            // Callers refresh from their own redraw loops, so only touch the DOM
            // when something actually changed.
            const html = rows.join('');
            if (this._el.innerHTML !== html) this._el.innerHTML = html;
            this._sync();
        },

        // Where the chip hangs from. A book-spread page is headed by its party
        // switcher (the page titles were dropped, the tabs took their place), so
        // the badge hangs directly under those tabs, centred on them: it names
        // the tier of the member they pick. Failing a switcher it takes the top
        // right corner of the page. Anchoring on the canvas alone put it outside
        // the parchment border whenever the canvas is wider than the page drawn
        // on it, which is what pushed it off frame.
        _anchor(sx, sy) {
            const scope = (this._host && document.body.contains(this._host))
                ? this._host : document;
            const boxes = sel => Array.from(scope.querySelectorAll(sel))
                .map(el => ({ el, r: el.getBoundingClientRect() }))
                .filter(b => b.r.width > 0 && b.r.height > 0);

            if (this._anchorSel) {
                const a = boxes(this._anchorSel)[0];
                if (a) {
                    return {
                        right: a.r.right,
                        top: a.r.bottom + 6 * sy,
                        width: a.r.width
                    };
                }
            }

            const tabs = boxes('.companion-switcher')[0];
            if (tabs) {
                // The row is full width however its tabs are aligned, so centre
                // on what is actually drawn in it rather than on the row.
                const kids = Array.from(tabs.el.children)
                    .map(c => c.getBoundingClientRect())
                    .filter(b => b.width > 0);
                const left = kids.length ? Math.min(...kids.map(b => b.left)) : tabs.r.left;
                const right = kids.length ? Math.max(...kids.map(b => b.right)) : tabs.r.right;
                return {
                    center: (left + right) / 2,
                    top: tabs.r.bottom + 6 * sy,
                    width: Math.max(right - left, 240 * sx)
                };
            }
            const page = boxes('.book-spread')[0];
            const rect = page ? page.r : (this._host ? this._host.getBoundingClientRect() : null);
            if (rect && rect.width > 0) {
                return {
                    right: rect.right - 18 * sx,
                    top: rect.top + 14 * sy,
                    width: rect.width * 0.42
                };
            }
            return null;
        },

        // Track the canvas the same way the toast stack does, so the chips sit
        // inside the game frame at any resolution or aspect ratio. Anchored from
        // the LEFT and pulled back by its own width (right-aligned) or half of
        // it (centred): a `right` offset measured against the window hangs the
        // chip off the edge whenever the canvas is letterboxed or wider than the
        // viewport, which is what clipped the member's name.
        _sync() {
            const canvas = document.getElementById('gameCanvas');
            if (!canvas || !this._el) return;
            const r = canvas.getBoundingClientRect();
            const sx = r.width / Graphics.width;
            const sy = r.height / Graphics.height;
            const s = this._el.style;
            s.fontSize = Math.round(15 * sy) + 'px';
            const a = this._anchor(sx, sy);
            if (a && a.center != null) {
                s.transform = 'translateX(-50%)';
                s.alignItems = 'center';
                s.left = a.center + 'px';
                s.top = a.top + 'px';
                s.maxWidth = Math.max(120, a.width) + 'px';
                return;
            }
            s.transform = 'translateX(-100%)';
            s.alignItems = 'flex-end';
            if (a) {
                s.left = a.right + 'px';
                s.top = a.top + 'px';
                s.maxWidth = Math.max(120, Math.min(a.width, a.right - r.left - 24 * sx)) + 'px';
                return;
            }
            s.left = (r.left + r.width - 24 * sx) + 'px';
            s.top = (r.top + 24 * sy) + 'px';
            s.maxWidth = Math.max(120, r.width - 48 * sx) + 'px';
        },

        _tick() {
            this._raf = null;
            if (!this._specs.length) return;
            const sceneGone = typeof SceneManager !== 'undefined'
                && this._scene && SceneManager._scene !== this._scene;
            const hostGone = this._host && !document.body.contains(this._host);
            const expired = this._expireAt && Date.now() >= this._expireAt;
            if (sceneGone || hostGone || expired) {
                this.hide();
                return;
            }
            this._sync();
            this._raf = requestAnimationFrame(() => this._tick());
        }
    };
    window.SpecBadge = SpecBadge;

    // =========================================================================
    // Plugin command - Add Specialization EXP
    // -------------------------------------------------------------------------
    // For events that want to teach something directly: a tutor, a book, a
    // story beat. The specialization is typed in as a name or an id rather than
    // picked from a list, because there are 800+ of them.
    // =========================================================================
    const addSpecializationExp = args => {
        const raw = String(args.spec ?? '').trim();
        if (!raw) return;
        // Specialization.json loads asynchronously, so an event firing early
        // would otherwise find an empty index. Wait for it rather than fail.
        if (!window.Specializations.ready) {
            setTimeout(() => addSpecializationExp(args), 100);
            return;
        }
        // A bare number is an id, anything else is a name. byId is keyed by
        // number, so the lookup has to be done in that order.
        const asId = Number(raw);
        const def = (Number.isFinite(asId) && String(asId) === raw)
            ? window.Specializations.byId.get(asId)
            : window.Specializations.byName.get(raw);
        if (!def) {
            console.warn(`SpecializationMenu: no specialization named or numbered "${raw}".`);
            return;
        }
        const amount = Number(args.amount) || 0;
        if (amount <= 0) return;
        const actorId = Number(args.actorId) || 0;
        const actor = actorId > 0 && $gameActors ? $gameActors.actor(actorId) : null;
        SpecializationXP.award(def, amount, {
            actor: actor || undefined,
            soloist: String(args.soloist) === 'true',
            silent: String(args.silent) === 'true'
        });
    };

    // The plugin sits in a subfolder, so its registered name carries the path.
    // Both keys are bound so an event authored either way keeps working.
    PluginManager.registerCommand('SpecializationMenu', 'addSpecializationExp', addSpecializationExp);

    // =========================================================================
    // Shared character-switcher hint helper (idempotent across plugins)
    // =========================================================================
    if (!window.CharSwitcher) {
        window.CharSwitcher = {
            isControllerConnected() {
                const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                for (let i = 0; i < pads.length; i++) {
                    if (pads[i] && pads[i].connected) return true;
                }
                return false;
            },
            parts(memberCount) {
                if (!memberCount || memberCount <= 1) return { left: '', right: '' };
                if (this.isControllerConnected()) {
                    return {
                        left: '<span class="char-switch-hint">L</span>',
                        right: '<span class="char-switch-hint">R</span>'
                    };
                }
                return { left: '', right: '<span class="char-switch-hint">TAB</span>' };
            },
            inner(tabsRowHTML, memberCount) {
                const p = this.parts(memberCount);
                return p.left + tabsRowHTML + p.right;
            },
            wrap(tabsRowHTML, memberCount) {
                return `<div class="companion-switcher">${this.inner(tabsRowHTML, memberCount)}</div>`;
            },
            installTabKey(scene, onCycle) {
                if (scene._charSwitchTabListener) return;
                scene._charSwitchTabListener = (e) => {
                    if (e.key !== 'Tab') return;
                    e.preventDefault();
                    if (this.isControllerConnected()) return;
                    onCycle(e.shiftKey ? -1 : 1);
                };
                window.addEventListener('keydown', scene._charSwitchTabListener);
            },
            removeTabKey(scene) {
                if (scene._charSwitchTabListener) {
                    window.removeEventListener('keydown', scene._charSwitchTabListener);
                    scene._charSwitchTabListener = null;
                }
            }
        };
    }

    function escapeHtml(str) {
        return String(str ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    // =========================================================================
    // Scene_Specializations
    // =========================================================================
    class Scene_Specializations extends Scene_MenuBase {
        create() {
            super.create();

            const members = $gameParty.members();
            this._currentActorIndex = Math.max(0, members.indexOf($gameParty.menuActor()));
            this._actor = members[this._currentActorIndex] || members[0];
            this._listOrder = [];
            this._selectedIndex = 0;
            this._categoryTabs = ['Trained', 'All', ...window.Specializations.categories];  // i18n-ignore  category ids
            this._categoryIndex = 0;
            this._activeArea = 'categories'; // 'categories' | 'list'

            // The shared search + filter strip (UI/MenuSearchBar.js). With 800+
            // specializations on the sheet, typing a name is the only sane way
            // to reach one that is not already trained.
            this._specBar = window.MenuSearchBar ? window.MenuSearchBar.create({
                id: 'specializations',
                placeholder: T('SpecMenu.ui.searchPlaceholder'),
                sorts: ['name', 'level'],
                onChange: () => {
                    this._selectedIndex = 0;
                    this.refreshSpecDOM();
                    if (this._specBar) this._specBar.restoreFocus();
                }
            }) : null;

            // TAB cycles the category tabs here, the way L1/R1 do in the
            // backpack: the sheet is read one category at a time, so the tabs
            // are what the hand reaches for. The party moved onto SHIFT.
            // Forward only: SHIFT is the party key here, so Shift+TAB would
            // step back and change companion in the same breath. L1 and left
            // are the way back.
            this._specTabListener = (e) => {
                if (e.key !== 'Tab') return;
                e.preventDefault();
                this.cycleCategory(1);
            };
            window.addEventListener('keydown', this._specTabListener);

            this.initSpecDOM();
        }

        update() {
            super.update();
            if (!window.Specializations.ready) {
                if (this._pendingRefresh) return;
                this._pendingRefresh = true;
                const wait = () => {
                    if (window.Specializations.ready) {
                        this._pendingRefresh = false;
                        this.refreshSpecDOM();
                    } else {
                        setTimeout(wait, 50);
                    }
                };
                wait();
                return;
            }
            // A focused search field owns the keyboard (UI/MenuSearchBar.js).
            if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;
            this.updateSpecInput();
        }

        terminate() {
            if (this._specBar) { this._specBar.dispose(); this._specBar = null; }
            if (this._specTabListener) {
                window.removeEventListener('keydown', this._specTabListener);
                this._specTabListener = null;
            }
            const container = document.getElementById('specialization-container');
            if (container) container.remove();
            super.terminate();
        }

        // Wraps around, like the backpack's tab strip: the row is a loop, not a
        // list with two dead ends.
        cycleCategory(dir) {
            if (!window.Specializations.ready) return;
            const count = this._categoryTabs.length;
            if (count <= 1) return;
            this._categoryIndex = (this._categoryIndex + dir + count) % count;
            this._selectedIndex = 0;
            this._activeArea = 'categories';
            SoundManager.playCursor();
            this.refreshSpecDOM();
        }

        // One way out, whichever of ESC, controller B or right click asked for
        // it, and guarded so a right click that also reaches TouchInput does not
        // pop two scenes.
        closeMenu() {
            if (this._closing) return;
            this._closing = true;
            SoundManager.playCancel();
            this.popScene();
        }

        switchToPreviousCharacter() {
            const party = $gameParty.members();
            if (party.length <= 1) return;
            this._currentActorIndex = (this._currentActorIndex - 1 + party.length) % party.length;
            this._actor = party[this._currentActorIndex];
            this._selectedIndex = 0;
            SoundManager.playCursor();
            this.refreshSpecDOM();
        }

        switchToNextCharacter() {
            const party = $gameParty.members();
            if (party.length <= 1) return;
            this._currentActorIndex = (this._currentActorIndex + 1) % party.length;
            this._actor = party[this._currentActorIndex];
            this._selectedIndex = 0;
            SoundManager.playCursor();
            this.refreshSpecDOM();
        }

        initSpecDOM() {
            this._dndContainer = document.createElement('div');
            this._dndContainer.id = 'specialization-container';

            this._dndContainer.innerHTML = `
                <div class="book-spread">
                    <div class="left-page spec-page">
                        <div class="page-header-bar">
                            <div class="back-button focusable">${T('SpecMenu.ui.back')}</div>
                            <h2 class="title">${T('SpecMenu.ui.specializations')}</h2>
                        </div>
                        <div id="spec-search-slot"></div>
                        <div class="backpack-tabs spec-tab-row" id="spec-category-row"></div>
                        <div class="backpack-grid spec-grid" id="spec-list-content"></div>
                    </div>
                    <div class="right-page spec-page">
                        <div class="companion-switcher ui-switcher-row" id="spec-companion-row"></div>
                        <div class="ui-detail" id="spec-detail-content"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(this._dndContainer);

            this._dndContainer.querySelector('.back-button').addEventListener('click', (e) => {
                e.stopPropagation();
                SoundManager.playCancel();
                this.popScene();
            });

            // Right click closes the sheet. The press has to have started on
            // the overlay, so a drag that ends here does not count as one.
            this._rightClickStartedHere = false;
            this._dndContainer.addEventListener('mousedown', (e) => {
                if (e.button === 2) { this._rightClickStartedHere = true; e.stopPropagation(); }
            });
            this._dndContainer.addEventListener('mouseup', (e) => {
                if (e.button === 2) e.stopPropagation();
            });
            this._dndContainer.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!this._rightClickStartedHere) return;
                this._rightClickStartedHere = false;
                this.closeMenu();
            });

            const listBox = document.getElementById('spec-list-content');
            if (listBox) {
                listBox.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
            }

            this.refreshSpecDOM();

            setTimeout(() => {
                if (this._dndContainer) this._dndContainer.classList.add('is-visible');
            }, 16);
        }

        buildListOrder(actor) {
            const category = this._categoryTabs[this._categoryIndex] || 'Trained';  // i18n-ignore  category id
            // A typed query searches the whole book: the menu opens on "Trained",
            // and hiding the 800 untrained ones from a search would answer
            // "Beekeeping" with an empty page.
            const searching = !!(this._specBar && this._specBar.query.trim());
            const trainedOnly = category === 'Trained' && !searching;  // i18n-ignore  category id
            const trained = [];
            const untrained = [];
            window.Specializations.list.forEach(spec => {
                if (category !== 'All' && category !== 'Trained' && spec.category !== category) return;  // i18n-ignore  category ids
                if (actor.specializationLevel(spec.id) > 1) trained.push(spec);
                else if (!trainedOnly) untrained.push(spec);
            });
            // The search strip does the narrowing and the ordering when it is
            // there; the two sections keep their own order so a search still
            // reads "what you know" first and "what you could learn" after.
            if (this._specBar) {
                const describe = spec => ({
                    name: window.Specializations.displayName(spec),
                    category: spec.category,
                    subtitle: window.Specializations.describe(spec),
                    level: actor.specializationLevel(spec.id)
                });
                // One apply() over the whole list, so the strip's "showing N"
                // counts both sections; the two are split back out afterwards
                // keeping the order it settled on.
                const kept = this._specBar.apply([...trained, ...untrained], describe);
                const trainedSet = new Set(trained);
                const keptTrained = kept.filter(s => trainedSet.has(s));
                const keptUntrained = kept.filter(s => !trainedSet.has(s));
                return splitSections(keptTrained, keptUntrained);
            }
            trained.sort((a, b) => a.name.localeCompare(b.name));
            untrained.sort((a, b) => a.name.localeCompare(b.name));
            return splitSections(trained, untrained);
        }

        levelPipsHTML(level) {
            let html = '<div class="spec-pips">';
            for (let i = 1; i <= 5; i++) {
                html += `<span class="spec-pip ${i <= level ? 'spec-pip--filled' : ''}"></span>`;
            }
            html += '</div>';
            return html;
        }

        refreshSpecDOM() {
            if (!this._dndContainer || !window.Specializations.ready) return;
            const actor = this._actor;
            if (!actor) return;

            // Category tabs may only become known once Specialization.json
            // finishes loading, so recompute every refresh rather than once.
            this._categoryTabs = ['Trained', 'All', ...window.Specializations.categories];  // i18n-ignore  category ids
            if (this._categoryIndex >= this._categoryTabs.length) this._categoryIndex = 0;

            // Rebuilt in place with the page, then handed its caret back - but
            // only when the player was already typing in it. The page redraws on
            // every cursor move, and a field that grabs focus back each time
            // would swallow the arrow keys it just took them from.
            const searchSlot = document.getElementById('spec-search-slot');
            if (searchSlot && this._specBar) {
                const active = document.activeElement;
                const wasTyping = !!active && active.id === 'msb-input-' + this._specBar.id;
                searchSlot.innerHTML = this._specBar.html();
                if (wasTyping) this._specBar.restoreFocus();
            }

            const categoryRow = document.getElementById('spec-category-row');
            if (categoryRow) {
                let tabsHTML = '';
                this._categoryTabs.forEach((cat, idx) => {
                    const isSel = idx === this._categoryIndex;
                    const isFocused = isSel && this._activeArea === 'categories';
                    tabsHTML += `<div class="backpack-tab ${isSel ? 'active' : ''} ${isFocused ? 'selected' : ''}" data-cat-idx="${idx}">${escapeHtml(categoryTabLabel(cat))}</div>`;
                });
                // One badge, naming the device actually in hand: R1 on a pad,
                // TAB on a keyboard, never the three faces at once
                // (docs/task/ui_fixing.md, rule 9). Button faces, not prose.
                const turnKey = (Input.lastInputDevice && Input.lastInputDevice() === 'pad') ? 'R1' : 'TAB';  // i18n-ignore  button faces
                // The rail is built exactly as the backpack builds its own: the
                // chips in a .backpack-tabs-row inside .backpack-tabs, so a rail
                // that wraps to several lines spaces them the same way.
                categoryRow.innerHTML = `<div class="backpack-tabs-row">${tabsHTML}` +
                    `<span class="char-switch-hint">${turnKey}</span></div>`;
                categoryRow.querySelectorAll('.backpack-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const idx = parseInt(tab.getAttribute('data-cat-idx'), 10);
                        if (idx !== this._categoryIndex) {
                            this._categoryIndex = idx;
                            this._selectedIndex = 0;
                        }
                        this._activeArea = 'categories';
                        SoundManager.playCursor();
                        this.refreshSpecDOM();
                    });
                });
            }

            // Companion switcher
            const compRow = document.getElementById('spec-companion-row');
            if (compRow) {
                const members = $gameParty.members();
                if (members.length <= 1) {
                    compRow.style.display = 'none';
                    compRow.innerHTML = '';
                } else {
                    compRow.style.display = 'flex';
                    let tabs = '';
                    members.forEach((m, idx) => {
                        const sel = idx === this._currentActorIndex ? 'selected' : '';
                        tabs += `<div class="companion-tab ${sel}" data-actor-idx="${idx}">${escapeHtml(m.name())}</div>`;
                    });
                    // The party hint cannot be the shared L/R or TAB one any
                    // more: those cycle the categories here. SHIFT (X on a pad)
                    // takes the companions instead.
                    const partyKey = (Input.lastInputDevice && Input.lastInputDevice() === 'pad') ? 'X' : 'SHIFT';  // i18n-ignore  button faces
                    compRow.innerHTML = `<div class="companion-tabs-row">${tabs}</div><span class="char-switch-hint">${partyKey}</span>`;
                    compRow.querySelectorAll('.companion-tab').forEach(tab => {
                        tab.addEventListener('click', () => {
                            const idx = parseInt(tab.getAttribute('data-actor-idx'), 10);
                            if (idx !== this._currentActorIndex) {
                                this._currentActorIndex = idx;
                                this._actor = $gameParty.members()[idx];
                                this._selectedIndex = 0;
                                SoundManager.playCursor();
                                this.refreshSpecDOM();
                            }
                        });
                    });
                }
            }

            const sections = this.buildListOrder(actor);
            const { trained, trainedTodo, untrained, untrainedTodo, order } = sections;
            this._listOrder = order;
            if (this._selectedIndex >= order.length) this._selectedIndex = Math.max(0, order.length - 1);

            // A slot, not a boxed option: the backpack's frameless row, its
            // name on the first line and the governing stat with the pips on
            // the second, and a gold hairline on the one being read.
            const rowHTML = (spec, idx) => {
                const level = actor.specializationLevel(spec.id);
                const isSel = idx === this._selectedIndex && this._activeArea === 'list';
                return `
                    <div class="item-slot spec-slot ${isSel ? 'selected' : ''}" data-idx="${idx}">
                        <div class="item-slot-info">
                            <div class="item-slot-name">${escapeHtml(window.Specializations.displayName(spec))}</div>
                            <div class="item-slot-meta">
                                <span class="spec-slot-stat">${spec.stat}</span>
                                ${this.levelPipsHTML(level)}
                            </div>
                        </div>
                    </div>`;
            };

            // The page is a flat run of entries - section headings, the odd
            // note, and one entry per specialization - so the windowed list can
            // address it by index without caring which is which
            // (UI/MenuVirtualList.js). `_rowEntry` maps a place in the cursor's
            // own order back to its line, for scrolling onto a row that is not
            // currently built.
            // Headings and notes take a line of their own in the three-column
            // grid, so the slots after one stay in their columns.
            const header = (label) =>
                `<div class="inspect-section-title spec-group-title">${label}</div>`;
            const note = (label) =>
                `<div class="ui-empty-note spec-group-note">${label}</div>`;

            // A search answers with what it found, so it never prints "nothing
            // trained yet" under a heading the query itself emptied.
            const searching = !!(this._specBar && this._specBar.query.trim());
            const entries = [];
            const fullWidth = [];
            this._rowEntry = [];
            const pushFull = (fn) => { fullWidth[entries.length] = true; entries.push(fn); };
            const pushRow = (spec, orderIndex) => {
                this._rowEntry[orderIndex] = entries.length;
                entries.push(() => rowHTML(spec, orderIndex));
            };

            if (searching && !order.length) pushFull(() => note(T('SpecMenu.ui.noMatches')));
            // The cursor walks `order`, which is the four runs one after the
            // other, so each run is laid down at its own offset in that order.
            let at = 0;
            const run = (list, label) => {
                if (!list.length) return;
                if (label) pushFull(() => header(label));
                list.forEach(spec => pushRow(spec, at++));
            };
            if (trained.length + trainedTodo.length > 0 || !searching) {
                pushFull(() => header(T('SpecMenu.ui.trained')));
            }
            if (trained.length + trainedTodo.length === 0) {
                if (!searching) pushFull(() => note(T('SpecMenu.ui.noneTrained')));
            } else {
                run(trained, null);
                run(trainedTodo, T('SpecMenu.ui.notImplemented'));
            }
            if (untrained.length + untrainedTodo.length > 0) {
                pushFull(() => header(T('SpecMenu.ui.untrained')));
                run(untrained, null);
                run(untrainedTodo, T('SpecMenu.ui.notImplemented'));
            }

            const listBox = document.getElementById('spec-list-content');
            if (listBox) {
                window.MenuVirtualList.render(listBox, {
                    key: `${this._currentActorIndex}|${this._categoryIndex}|${this._specBar ? this._specBar.query : ''}`,
                    count: entries.length,
                    renderItem: idx => entries[idx](),
                    fullWidth: idx => !!fullWidth[idx],
                    // Walking the ladder moves one hairline. The rows on screen
                    // already say the rest, so they are left as they are rather
                    // than rebuilt and rebound a row at a time.
                    focus: {
                        index: this._selectedIndex,
                        selector: '.spec-slot',
                        classes: { selected: this._activeArea === 'list' ? this._selectedIndex : -1 }
                    },
                    onWindow: win => {
                        win.querySelectorAll('.spec-slot').forEach(row => {
                            row.addEventListener('click', () => {
                                this._selectedIndex = parseInt(row.getAttribute('data-idx'), 10);
                                this._activeArea = 'list';
                                SoundManager.playCursor();
                                this.refreshSpecDOM();
                            });
                        });
                    }
                });
            }

            document.getElementById('spec-detail-content').innerHTML = this.buildDetailHTML(actor, this._listOrder[this._selectedIndex]);
        }

        buildDetailHTML(actor, spec) {
            if (!spec) {
                return `<div class="ui-empty"><div class="ui-empty-text">${T('SpecMenu.ui.noneSelected')}</div></div>`;
            }

            const level = actor.specializationLevel(spec.id);
            const levelName = window.Specializations.levelName(level);

            // Training progress towards the next tier (weapon proficiencies
            // train through battle, the rest through play).
            let progressHTML = '';
            const needed = window.Specializations.expToNext(level, spec);
            if (needed) {
                // Onlooker shares are fractional (see SpecializationXP.award),
                // so the counter is rounded for reading.
                const have = Math.floor(actor.specializationExp(spec.id) * 10) / 10;
                const pct = Math.max(0, Math.min(100, Math.round((have / needed) * 100)));
                // The bar counts what has been earned inside this tier; the line
                // under it says what the next one still wants, rounded up so a
                // fractional onlooker share never reads as "0 more".
                const remaining = Math.max(0, Math.ceil((needed - have) * 10) / 10);
                const nextName = window.Specializations.levelName(level + 1);
                progressHTML = `
                    <div class="ui-section">
                        <div class="spec-progress-head">
                            <span>${T('SpecMenu.ui.towards', { level: escapeHtml(nextName) })}</span>
                            <span class="spec-progress-value">${have} / ${needed}</span>
                        </div>
                        <div class="spec-progress-track">
                            <div class="spec-progress-fill" style="width:${pct}%"></div>
                        </div>
                        <div class="spec-progress-note">${T('SpecMenu.ui.pointsToNext', { points: remaining, level: escapeHtml(nextName) })}</div>
                    </div>`;
            } else {
                progressHTML = `<div class="ui-section spec-progress-note">${T('SpecMenu.ui.mastered')}</div>`;
            }

            // Weapon proficiencies drive the equip-screen stat scaling, so spell
            // out what the current tier is worth in the field.
            let weaponHTML = '';
            if (spec.wtypeId) {
                const prof = window.WeaponProficiency;
                const mult = prof ? prof.multiplierForLevel(level) : 1;
                const pct = Math.round(mult * 100);
                const note = level < 3
                    ? T('SpecializationMenu.weapon.cut', { weapon: escapeHtml(window.Specializations.displayName(spec)), pct: pct })
                    : (level > 3
                        ? T('SpecializationMenu.weapon.raised', { weapon: escapeHtml(window.Specializations.displayName(spec)), pct: pct })
                        : T('SpecializationMenu.weapon.full', { weapon: escapeHtml(window.Specializations.displayName(spec)) }));
                weaponHTML = `
                    <div class="ui-section">
                        <div class="inspect-section-title">${T('SpecializationMenu.weapon.title')}</div>
                        <div class="ui-prose">${note}</div>
                        <div class="spec-progress-note">${T('SpecializationMenu.weapon.trains')}</div>
                    </div>`;
            }

            // The card is read in two columns: a label sits beside its answer
            // rather than at the far edge of the page (docs/task/ui_fixing.md).
            const facts = `
                <div class="inspect-spec-grid">
                    <div class="inspect-spec-row">
                        <span class="inspect-spec-label">${T('SpecMenu.ui.statLabel')}</span>
                        <span class="inspect-spec-value">${escapeHtml(spec.stat)}</span>
                    </div>
                    ${spec.category ? `
                    <div class="inspect-spec-row">
                        <span class="inspect-spec-label">${T('SpecMenu.ui.category')}</span>
                        <span class="inspect-spec-value">${escapeHtml(spec.category)}</span>
                    </div>` : ''}
                </div>`;

            return `
                <div class="ui-detail-head">
                    <div class="ui-detail-titles">
                        <h2 class="inspect-name">${escapeHtml(window.Specializations.displayName(spec))}</h2>
                        <div class="spec-tier-row">
                            <span class="spec-tier-name">${escapeHtml(levelName)}</span>
                            ${this.levelPipsHTML(level)}
                        </div>
                    </div>
                </div>
                <div class="ui-detail-scroll">
                    ${facts}
                    ${spec.description ? `<div class="ui-prose">${escapeHtml(spec.description)}</div>` : ''}
                    ${progressHTML}
                    ${weaponHTML}
                </div>
            `;
        }

        updateSpecInput() {
            // L1 / R1 cycle the category tabs from anywhere, as in the backpack.
            if (Input.isTriggered('pageup')) { this.cycleCategory(-1); return; }
            if (Input.isTriggered('pagedown')) { this.cycleCategory(1); return; }
            // The companions moved off the shoulders to make room for the tabs.
            if (Input.isTriggered('shift')) { this.switchToNextCharacter(); return; }

            // ESC, controller B and right click all mean the same thing: leave
            // the sheet, from whichever half of the spread the cursor sits in.
            if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
                this.closeMenu();
                return;
            }

            if (this._activeArea === 'categories') {
                // Up on the rail belongs to the rail; the list below is walked
                // as a grid and wants left and right for itself.
                if (Input.isTriggered('right') || Input.isRepeated('right')) { this.cycleCategory(1); return; }
                if (Input.isTriggered('left') || Input.isRepeated('left')) { this.cycleCategory(-1); return; }
                if (Input.isTriggered('down') || Input.isRepeated('down')) {
                    if (this._listOrder.length) {
                        this._activeArea = 'list';
                        SoundManager.playCursor();
                        this.refreshSpecDOM();
                    }
                } else if (Input.isTriggered('ok')) {
                    SoundManager.playOk();
                }
                return;
            }

            // 'list' area. The page is three across (.backpack-grid), so up and
            // down step a whole row and left and right step a column; the
            // cursor's own count has to match the stylesheet's track count or
            // Down lands on the wrong entry.
            if (!this._listOrder.length) return;

            const last = this._listOrder.length - 1;
            const moveTo = (idx) => {
                this._selectedIndex = Math.max(0, Math.min(last, idx));
                SoundManager.playCursor();
                this.refreshSpecDOM();
                this.scrollSelectedIntoView();
            };

            if (Input.isTriggered('down') || Input.isRepeated('down')) {
                if (this._selectedIndex < last) moveTo(this._selectedIndex + specCols());
            } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
                if (this._selectedIndex < last) moveTo(this._selectedIndex + 1);
            } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                if (this._selectedIndex > 0) moveTo(this._selectedIndex - 1);
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                if (this._selectedIndex >= specCols()) {
                    moveTo(this._selectedIndex - specCols());
                } else {
                    this._activeArea = 'categories';
                    SoundManager.playCursor();
                    this.refreshSpecDOM();
                }
            }
        }

        // By line, not by element: the row being moved onto is only in the DOM
        // once the viewport reaches it (UI/MenuVirtualList.js).
        scrollSelectedIntoView() {
            const listBox = document.getElementById('spec-list-content');
            const line = this._rowEntry ? this._rowEntry[this._selectedIndex] : undefined;
            if (listBox && line !== undefined) window.MenuVirtualList.scrollToIndex(listBox, line);
        }
    }

    window.Scene_Specializations = Scene_Specializations;
})();
