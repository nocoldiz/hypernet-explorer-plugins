
/*
* @target MZ
* @plugindesc v1.4.0 - Premium bestiary-style Monster Collection with double-page parchment layout.
* @author Omni-Lex (Modified by OmniLex)
* @url
*
* @help
* =============================================================================
* Monster CD Collection System (bestiary Style by OmniLex) - Parchment Edition
* =============================================================================
* This plugin overlays a beautiful double-page tea-stained parchment book menu
* to track all encountered enemies.
*
* Left Page: Discovered creatures pockets with walking character animations.
* Right Page: Highly detailed creature portfolios with 3 custom alchemical tabs:
*   - Lexicon: portrait, description, D&D stats and element weaknesses/resists.
*   - Ecology: Biomes, time of day, blood types, weights, speeds, and abilities.
*   - Extraction: Harvester drops, percentage drop rates, and combat skills.
*
* Fully supports keyboard, mouse, and gamepad arrow navigation.
* Keeps original AsciiMode compatibility in tact.
*
* @param menuText
* @text CD Case Menu Text
* @desc Text displayed in the main menu for the CD Case option
* @default bestiary
*
* @command OpenBestiary
* @text Open bestiary
* @desc Opens the monster collection menu
*
* @command RevealEntries
* @text Reveal Entries
* @desc Marks a number of not-yet-discovered creatures as encountered in the bestiary.
*
* @arg amount
* @text Amount
* @type number
* @min 1
* @desc How many undiscovered creatures to reveal (lowest enemy IDs first).
* @default 1
*/

(() => {
    'use strict';

    const pluginName = "Bestiary"; // i18n-ignore: plugin id

    // An ecology note-tag value, named for the panel. The value stays the id,
    // so an unlisted (modded) tag still reads as written.
    function ecologyLabel(group, id) {
        const key = 'Bestiary.' + group + '.' + String(id).toLowerCase();
        return T.has(key) ? T(key) : String(id);
    }

    let _statsI18n = null;
    let _enemiesI18n = null;

    const _loadStatsI18n = async () => {
        const lang = ConfigManager.language || 'en';
        const url = `js/i18n/${lang}/stats.json`;
        try {
            const response = await fetch(url);
            _statsI18n = await response.json();
        } catch (e) {
            console.error('Bestiary: Failed to load i18n data from ' + url, e);
            _statsI18n = {};
        }
    };

    const _loadEnemiesI18n = async () => {
        const lang = ConfigManager.language || 'en';
        const url = `js/i18n/${lang}/enemies.json`;
        try {
            const response = await fetch(url);
            _enemiesI18n = await response.json();
        } catch (e) {
            console.error('Bestiary: Failed to load enemies i18n from ' + url, e);
            _enemiesI18n = {};
        }
    };

    const _si18n = (key) => {
        if (_statsI18n && _statsI18n[key]) {
            return _statsI18n[key];
        }
        return key;
    };

    _loadStatsI18n();
    _loadEnemiesI18n();

    //=============================================================================
    // Custom Parameter Names (mapped to D&D standard)
    //=============================================================================
    const getShortParamName = function (paramId) {
        const shortParamNames = [
            _si18n("HP"),
            _si18n("MP"),
            _si18n("ATT"),
            _si18n("DEF"),
            _si18n("M.ATT"),
            _si18n("M.DEF"),
            _si18n("AGILITY"),
            _si18n("LUCK")
        ];
        return shortParamNames[paramId] || "???";
    };

    const getEnemyL10n = function (enemyId) {
        if (_enemiesI18n && _enemiesI18n[enemyId]) {
            return _enemiesI18n[enemyId];
        }
        return null;
    };

    // Some Enemies.json entries are pure organizational spacers used to divide
    // the database editor's list into level brackets (name "<-- 1-10 -->", note
    // <LevelBracket>). They are never assigned to any troop, so they should
    // never appear as a "discovered creature" - if one leaks into the
    // encountered list (e.g. via RevealEntries counting them as a reveal), it
    // occupies a slot in the bestiary list and throws off which card is which.
    const isDividerEnemy = function (enemy) {
        if (!enemy) return true;
        if (typeof enemy.name === "string" && enemy.name.startsWith("<--")) return true;
        if (/<LevelBracket>/i.test(enemy.note || "")) return true;
        // The petrodemon scratch slot is not a creature the world holds: it is
        // one reused entry rewritten per fight (BattleSystemEnhancedEncounters
        // section 17), so whatever is in it belongs to no bestiary page.
        if (enemy._bsePetrodemon) return true;
        return false;
    };

    // Default generation seed for the 3D portrait: the current world seed, so a
    // bestiary entry shows the creature as this world grew it. Falls back to the
    // canonical "esoteric" (baseline look) when no history seed exists yet.
    const worldGenSeed = function () {
        try {
            if (window.HistoryManager && typeof window.HistoryManager.getSeed === "function") {
                const s = window.HistoryManager.getSeed();
                if (s !== null && s !== undefined && s !== "") return String(s);
            }
        } catch (e) {}
        return "esoteric";
    };

    //=============================================================================
    // Game_System - For storing encountered monsters
    //=============================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize.call(this);
        this._usedMonstersInBattle = [];
        // The catalogue itself is NOT emptied here. It belongs to the world
        // rather than to the playthrough (WorldManager's bestiary.json), so a
        // new game started in a world opens the book its other savegames have
        // been filling in. The list is created lazily below instead.
    };

    Game_System.prototype.encounteredMonsters = function () {
        if (!this._encounteredMonsters) this._encounteredMonsters = [];
        return this._encounteredMonsters;
    };

    Game_System.prototype.markMonsterAsEncountered = function (enemyId) {
        // The sandbox already reads as having met everything, so recording
        // what it meets would only pour a throwaway session's creatures into
        // the world's own book, permanently.
        if (this._isSandboxMode) return;
        if (!this._encounteredMonsters) this._encounteredMonsters = [];
        if (!this._encounteredMonsters.includes(enemyId)) {
            this._encounteredMonsters.push(enemyId);
        }
    };

    Game_System.prototype.isMonsterEncountered = function (enemyId) {
        if ($gameSystem && $gameSystem._isSandboxMode) return true;
        if ($gameParty && $gameParty.leader() && $gameParty.leader().name() === "Test") return true; // i18n-ignore: playtest character name
        if ($gameActors && $gameActors.actor(1) && $gameActors.actor(1).name() === "Test") return true; // i18n-ignore: playtest character name
        return this.encounteredMonsters().includes(enemyId);
    };

    Game_System.prototype.resetUsedMonstersInBattle = function () {
        this._usedMonstersInBattle = [];
    };

    Game_System.prototype.markMonsterAsUsed = function (index) {
        if (!this._usedMonstersInBattle) this._usedMonstersInBattle = [];
        this._usedMonstersInBattle.push(index);
    };

    Game_System.prototype.isMonsterUsedInBattle = function (index) {
        if (!this._usedMonstersInBattle) this._usedMonstersInBattle = [];
        return this._usedMonstersInBattle.includes(index);
    };

    //=============================================================================
    // Register Plugin Commands
    //=============================================================================
    PluginManager.registerCommand(pluginName, "OpenBestiary", () => {
        SceneManager.push(Scene_CDCollection);
    });

    // Legacy command name kept for old events (Item: Bestiary).
    PluginManager.registerCommand(pluginName, "OpenCDCase", () => {
        SceneManager.push(Scene_CDCollection);
    });

    // Reveal a number of not-yet-discovered creatures (lowest enemy IDs first),
    // letting events grant bestiary knowledge as a reward without a battle.
    PluginManager.registerCommand(pluginName, "RevealEntries", args => {
        if (!$gameSystem) return;
        const amount = Math.max(0, parseInt(args.amount, 10) || 0);
        if (!amount) return;
        let revealed = 0;
        for (let id = 1; id < $dataEnemies.length && revealed < amount; id++) {
            const enemy = $dataEnemies[id];
            if (!enemy || enemy.id <= 0) continue;
            if (isDividerEnemy(enemy)) continue;
            if (!$gameSystem.encounteredMonsters().includes(id)) {
                $gameSystem.markMonsterAsEncountered(id);
                revealed++;
            }
        }
    });

    //=============================================================================
    // Add bestiary to Main Menu Command Lists
    //=============================================================================
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand(T('Bestiary.bestiary'), 'bestiary', true, 294);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('bestiary', this.commandBestiary.bind(this));
    };

    Scene_Menu.prototype.commandBestiary = function () {
        SceneManager.push(Scene_CDCollection);
    };

    //=============================================================================
    // Track enemy encounters to mark them as seen
    //=============================================================================
    const _Game_Enemy_setup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function (enemyId, x, y) {
        _Game_Enemy_setup.call(this, enemyId, x, y);
        if ($gameSystem) {
            $gameSystem.markMonsterAsEncountered(enemyId);
        }
    };

    const _Game_Troop_setup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function (troopId) {
        _Game_Troop_setup.call(this, troopId);
        this.members().forEach(enemy => {
            if (enemy) {
                $gameSystem.markMonsterAsEncountered(enemy.enemyId());
            }
        });
    };

    // =========================================================================
    // The 3D specimen viewer, shared by the codex page and the desktop app
    // =========================================================================
    // Builds a procedural Battler3D model on `canvas` under `entrySeed`, with
    // orbit / pan / zoom and the periodic attack, and returns its state; the
    // state is handed back to disposeBestiary3D(). One renderer per canvas,
    // released with its WebGL context when the view goes away.
    function buildBestiary3D(canvas, enemyData, archKey, entrySeed) {
        if (typeof THREE === 'undefined' || !window.Battler3D || !window.Battler3D.create) return null;
        if (!canvas) return null;
        const rect   = canvas.getBoundingClientRect();
        const width  = Math.max(1, Math.round(rect.width)  || 320);
        const height = Math.max(1, Math.round(rect.height) || 320);

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setSize(width, height, false);
        // Render at 1:1 device pixels. This is a small preview, so the hi-DPI
        // multiplier (up to 4x the fragment work on Retina screens) is the
        // single biggest cost here and buys almost nothing visually.
        renderer.setPixelRatio(1);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.1));
        const keyLight  = new THREE.DirectionalLight(0xfff2d0, 1.4); keyLight.position.set(3, 5, 4);   scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.7); fillLight.position.set(-3, -2, 2); scene.add(fillLight);

        const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 300);
        camera.position.set(0, 0, 8);

        const pivot = new THREE.Group();
        scene.add(pivot);

        const state = {
            renderer, canvas, scene, camera, pivot,
            model: null, rafId: 0, disposed: false, dragging: false, attackTimer: 0, frameAcc: 0,
            activeButton: -1, prev: { x: 0, y: 0 }, clock: new THREE.Clock(), listeners: {}
        };
        // Fake battler so the model uses its deterministic per-id look.
        // It answers enemy() too: a model whose look is rolled from its own
        // notebox rather than from its id (the petrodemon's <PetroSeed:>)
        // reads it off the data object, and would otherwise draw a stranger.
        const fakeBattler = { enemyId: () => enemyData.id, index: () => 0, enemy: () => enemyData };
        // Build under this entry's generation seed (world seed unless the
        // player re-rolled it). All seeded draws happen in the constructor, so
        // the global seed is restored immediately after create.
        const prevGenSeed = window.Battler3D.getGenSeed ? window.Battler3D.getGenSeed() : null;
        if (window.Battler3D.setGenSeed) window.Battler3D.setGenSeed(entrySeed);
        const battler = window.Battler3D.create(archKey, 0, 0, fakeBattler);
        if (window.Battler3D.setGenSeed && prevGenSeed != null) window.Battler3D.setGenSeed(prevGenSeed);
        if (!battler) {
            try { renderer.dispose(); } catch (e) {}
            try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
            return null;
        }

        Promise.resolve(battler.load(null, 0, 0, 0)).then(() => {
            if (state.disposed || !battler.model) return;
            try { battler.update(1 / 60); } catch (e) {}
            const box    = new THREE.Box3().setFromObject(battler.model);
            const size   = new THREE.Vector3(); box.getSize(size);
            const center = new THREE.Vector3(); box.getCenter(center);
            // Carry the centring offset on a parent holder rather than on the
            // model itself. The family idle animations rewrite
            // model.position.{x,y} every frame with an absolute value
            // (baseY + bob), so subtracting `center` straight from
            // model.position would be undone on the very next update() and the
            // model would drift off-centre (forcing a manual pan to recentre).
            // Offsetting the holder leaves the model's local position free for
            // the animation while pinning its geometric centre to the pivot
            // origin the camera looks at.
            const holder = new THREE.Group();
            holder.position.copy(center).multiplyScalar(-1);
            holder.add(battler.model);
            if (window.PSXShader) window.PSXShader.applyToObject(battler.model);
            pivot.add(holder);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const fitDist = maxDim / (2 * Math.tan((40 * Math.PI / 180) / 2));
            // Frame the model large in the viewport. The holder offset above
            // puts the model dead-centre at the origin; aim the camera straight
            // at it so it stays centred for every body plan, and keep a small
            // margin so the attack lunge never pushes it past the edge.
            camera.position.set(0, 0, fitDist * 1.2);
            camera.lookAt(0, 0, 0);
            state.model = battler;
            state.attackTimer = 1.2; // first attack shortly after it appears
        }).catch(() => {});

        // ── Mouse / touch controls (mirror the equipment 3D preview) ─────────
        const L = state.listeners;
        L.onDown = (e) => {
            if (e.button === 0 || e.button === 1) {
                state.activeButton = e.button; state.dragging = true;
                state.prev = { x: e.clientX, y: e.clientY };
                if (e.button === 1) e.preventDefault();
                canvas.classList.add('bestiary-3d-grabbing');
            }
        };
        L.onMove = (e) => {
            if (state.activeButton === -1) return;
            const dx = e.clientX - state.prev.x, dy = e.clientY - state.prev.y;
            if (state.activeButton === 0) {
                pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012;
            } else if (state.activeButton === 1) {
                const ps = 0.0035 * camera.position.z;
                camera.position.x -= dx * ps; camera.position.y += dy * ps;
            }
            state.prev = { x: e.clientX, y: e.clientY };
        };
        L.onUp = () => {
            state.activeButton = -1;
            state.dragging = false;
            canvas.classList.remove('bestiary-3d-grabbing');
        };
        L.onWheel = (e) => {
            e.preventDefault();
            camera.position.z = Math.max(1.5, Math.min(60, camera.position.z + e.deltaY * 0.012));
        };
        L.onAux = (e) => { if (e.button === 1) e.preventDefault(); };
        L.onCtx = (e) => e.preventDefault();
        L.onTStart = (e) => { if (e.touches.length === 1) { state.dragging = true; state.activeButton = 0; state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } };
        L.onTMove = (e) => {
            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - state.prev.x, dy = e.touches[0].clientY - state.prev.y;
                pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012;
                state.prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };
        L.onTEnd = () => { state.dragging = false; state.activeButton = -1; };

        canvas.addEventListener('mousedown',   L.onDown);
        canvas.addEventListener('mousemove',   L.onMove);
        window.addEventListener('mouseup',     L.onUp);
        canvas.addEventListener('wheel',       L.onWheel, { passive: false });
        canvas.addEventListener('auxclick',    L.onAux);
        canvas.addEventListener('contextmenu', L.onCtx);
        canvas.addEventListener('touchstart',  L.onTStart);
        canvas.addEventListener('touchmove',   L.onTMove);
        window.addEventListener('touchend',    L.onTEnd);

        const FRAME = 1 / 30; // cap the preview to ~30fps to halve GPU/CPU work
        const animate = () => {
            if (state.disposed) return;
            state.rafId = requestAnimationFrame(animate);
            state.frameAcc += Math.min(state.clock.getDelta(), 0.05);
            if (state.frameAcc < FRAME) return;
            const dt = state.frameAcc;
            state.frameAcc = 0;
            if (state.model) {
                // Periodically trigger a one-shot combat animation so the entry
                // shows the creature attacking (alternating skill / special).
                state.attackTimer -= dt;
                if (state.attackTimer <= 0 && state.model.currentAnimation === 'idle') {
                    const anim = (state.model.hasAnimation('specialattack') && Math.random() < 0.4)
                        ? 'specialattack' : 'attack';
                    try { state.model.playAnimation(anim, false); } catch (e) {}
                    state.attackTimer = 2.4 + Math.random() * 1.6;
                }
                try { state.model.update(dt); } catch (e) {}
            }
            // No automatic spin: the model holds its facing until the user drags.
            if (window.PSXShader) {
                window.PSXShader.render(renderer, scene, camera);
            } else {
                renderer.render(scene, camera);
            }
        };
        animate();
        return state;
    }

    function disposeBestiary3D(state) {
        const s = state;
        if (!s) return;
        s.disposed = true;
        cancelAnimationFrame(s.rafId);
        const L = s.listeners || {}, c = s.canvas;
        if (c) {
            c.removeEventListener('mousedown',   L.onDown);
            c.removeEventListener('mousemove',   L.onMove);
            c.removeEventListener('wheel',       L.onWheel);
            c.removeEventListener('auxclick',    L.onAux);
            c.removeEventListener('contextmenu', L.onCtx);
            c.removeEventListener('touchstart',  L.onTStart);
            c.removeEventListener('touchmove',   L.onTMove);
        }
        window.removeEventListener('mouseup',  L.onUp);
        window.removeEventListener('touchend', L.onTEnd);
        // dispose() leaves the WebGL context alive. The browser caps live
        // contexts and force-loses the OLDEST past the cap, which is the
        // game's own canvas: PIXI then silently stops rendering and the
        // picture freezes until the game is restarted. Release it, then swap
        // in a clean canvas node, since the element a context was lost on
        // can never host a new one.
        try { s.renderer.dispose(); } catch (e) {}
        try { if (s.renderer.forceContextLoss) s.renderer.forceContextLoss(); } catch (e) {}
        if (c && c.parentNode) c.parentNode.replaceChild(c.cloneNode(false), c);
    }

    window.BestiaryViewer3D = { build: buildBestiary3D, dispose: disposeBestiary3D };

    //=============================================================================
    // Scene_CDCollection (Parchment Codex Overlay)
    //=============================================================================
    class Scene_CDCollection extends Scene_MenuBase {
        isReady() {
            return _statsI18n !== null && _enemiesI18n !== null && super.isReady();
        }

        create() {
            super.create();

            // Deactivate and hide default canvas help windows
            if (this._helpWindow) { this._helpWindow.deactivate(); this._helpWindow.hide(); }

            this._monsterList = [];
            this._selectedIndex = 0;
            this._activeTab = 0; // 0: Lexicon, 1: Ecology, 2: Drops
            this._activeArea = 'list'; // 'list' or 'tabs'
            this._pageTab = 0; // Left-page pockets: 0 = Earth, 1 = Petrodemons, 2 = Aliens

            this._spriteAnimFrame = 1;
            this._spriteAnimTimer = 0;

            // Portrait view mode: 3D procedural model vs the walking sprite.
            this._show3DBestiary = (typeof THREE !== 'undefined' && window.Battler3D && !!window.Battler3D.create);
            // Per-enemy generation seed for the 3D portrait (world seed by default,
            // re-rollable from the button under the viewport).
            this._bestiaryGenSeeds = {};

            // The shared strip (UI/MenuSearchBar.js), asked for only what a
            // codex page can answer: a name, an archetype, a level.
            this._bestiaryBar = window.MenuSearchBar ? window.MenuSearchBar.create({
                id: 'bestiary',
                placeholder: T('Bestiary.searchPlaceholder'),
                sorts: ['name'],
                // Typing in the strip re-applies the filter and redraws, the same way every
                // other MenuSearchBar page does. This used to call a method that was never
                // written, so the first keystroke threw.
                onChange: () => {
                    this._selectedIndex = 0;
                    this.buildUIBestiaryData();
                    this.refreshUIBestiary();
                    if (this._bestiaryBar) this._bestiaryBar.restoreFocus();
                }
            }) : null;

            this.buildUIBestiaryData();
            this.initUIBestiaryDOM();
            this.refreshUIBestiary();
        }

        update() {
            this.updateUIBestiaryInput();
            this.updateUIBestiarySpriteAnimations();
            super.update();
        }

        terminate() {
            if (this._bestiaryBar) { this._bestiaryBar.dispose(); this._bestiaryBar = null; }
            this.cleanupBestiary3D();
            const container = document.getElementById("bestiary-container");
            if (container) container.remove();
            super.terminate();
        }

        // =============================================================================
        // 3D portrait viewer (procedural Battler3D model with orbit / pan / zoom)
        // =============================================================================

        // Seed bucket for a pockets entry. Alien species share a base enemy for
        // stats and archetype, so key them on their own species id instead.
        bestiarySeedKey(mon) {
            if (!mon) return "0";
            return mon.speciesKey ? String(mon.speciesKey) : String(mon.id);
        }

        // Generation seed used for this entry's 3D portrait. Starts on the world
        // seed and only changes when the player re-rolls it.
        bestiaryGenSeed(key) {
            if (!this._bestiaryGenSeeds) this._bestiaryGenSeeds = {};
            if (this._bestiaryGenSeeds[key] == null) {
                this._bestiaryGenSeeds[key] = worldGenSeed();
            }
            return this._bestiaryGenSeeds[key];
        }

        randomizeBestiaryGenSeed(key) {
            if (!this._bestiaryGenSeeds) this._bestiaryGenSeeds = {};
            this._bestiaryGenSeeds[key] = String(1 + Math.floor(Math.random() * 0x7ffffffe));
            return this._bestiaryGenSeeds[key];
        }

        // The entry's biological description. The English <En:> template is
        // combinatorial, so the same seed that grows the 3D specimen also picks
        // its wording: re-rolling the seed re-rolls the prose. Other languages
        // (and enemies without a template) keep the stored description.
        bestiaryDescription(mon, noteData) {
            const stored = noteData ? noteData.description : null;
            if (!mon || !mon.enemy || !window.EnemyDescription) return stored;
            const lang = ConfigManager.language || 'en';
            if (lang !== 'en') return stored;
            const id = mon.enemy.id;
            const template = window.EnemyDescription.rawDescription(id);
            if (!template) return stored;
            const seed = this.bestiaryGenSeed(this.bestiarySeedKey(mon));
            const resolved = window.EnemyDescription.resolve(
                template, 'enemy:' + id + ':' + (mon.enemy.name || '') + ':' + seed);
            return resolved || stored;
        }

        initBestiary3D(enemyData, archKey, seedKey) {
            this.cleanupBestiary3D();
            const canvas = document.getElementById('bestiary-3d-canvas');
            // Build under this entry's generation seed (world seed unless the
            // player re-rolled it).
            const entrySeed = this.bestiaryGenSeed(seedKey != null ? seedKey : String(enemyData.id));
            this._bestiary3D = buildBestiary3D(canvas, enemyData, archKey, entrySeed);
        }

        cleanupBestiary3D() {
            if (!this._bestiary3D) return;
            disposeBestiary3D(this._bestiary3D);
            this._bestiary3D = null;
        }

        buildUIBestiaryData() {
            // The three pages themselves are built by the shared service below,
            // so any other menu that wants to search the codex (the main menu's
            // search page) reads exactly the same three lists.
            this._earthList = window.BestiaryData.earth();
            this._petroList = window.BestiaryData.petrodemons();
            this._alienList = window.BestiaryData.aliens();

            if (this._pageTab == null) this._pageTab = 0;
            const page = this._pageTab === 2 ? this._alienList
                : (this._pageTab === 1 ? this._petroList : this._earthList);

            // Whatever the strip is asking for, applied to the open page.
            this._monsterList = this._bestiaryBar
                ? this._bestiaryBar.apply(page, mon => ({
                    name: mon.name,
                    category: (mon.noteData && mon.noteData.archetype) || '',
                    subtitle: (mon.noteData && mon.noteData.biome) || '',
                    level: mon.noteData && mon.noteData.level ? parseInt(mon.noteData.level, 10) : 0
                }))
                : page;
        }

        // Switch the left-page pockets between Earth, petrodemons and alien
        // species.
        switchBestiaryPageTab(tab) {
            if (tab === this._pageTab) return;
            this._pageTab = tab;
            this._selectedIndex = 0;
            this.buildUIBestiaryData();
            // A different page is a different list: the window starts at its top
            // again, and its row measurements are dropped with the key.
            const vp = document.getElementById("bestiary-list-viewport");
            if (vp) vp.scrollTop = 0;
            if (window.SoundManager) SoundManager.playCursor();
            this.refreshUIBestiary();
        }

        initUIBestiaryDOM() {
            if (!document.getElementById("bestiary-container")) {
                const container = document.createElement("div");
                container.id = "bestiary-container";
                document.body.appendChild(container);
            }
        }

        refreshUIBestiary() {
            const container = document.getElementById("bestiary-container");
            if (!container) return;

            // 1. Build the high-level double-page layout frame once if not already present
            if (!document.getElementById("bestiary-layout")) {
                container.innerHTML = `
                    <div class="book-spread" id="bestiary-layout">
                        <div class="left-page">
                            <div class="page-header-bar">
                              <div class="back-button focusable">
                                ${T('Bestiary.back')}
                              </div>

                              <h2 class="title">${T('Bestiary.bestiary')}</h2>
                            </div>
                            <div id="bestiary-search-slot"></div>
                            <div id="bestiary-page-tabs" class="backpack-tabs-row">
                              <div class="bestiary-page-tab backpack-tab focusable" data-page="0">${T('Bestiary.earth')}</div>
                              <div class="bestiary-page-tab backpack-tab focusable" data-page="1">${T('Bestiary.petrodemons')}</div>
                              <div class="bestiary-page-tab backpack-tab focusable" data-page="2">${T('Bestiary.aliens')}</div>
                            </div>
                            <div class="list-viewport" id="bestiary-list-viewport"></div>
                        </div>

                        <div class="right-page">
                            <div class="page-header-bar"></div>
                            <div id="bestiary-portfolio-container"></div>
                        </div>
                    </div>
                `;

                // Bind back button handler
                const backBtn = container.querySelector(".back-button");
                if (backBtn) {
                    backBtn.addEventListener("click", () => {
                        SoundManager.playCancel();
                        SceneManager.pop();

                    });
                }

                // Wheel scroll on list viewport regardless of focus
                container.addEventListener("wheel", (e) => {
                    e.preventDefault();
                    const viewport = document.getElementById("bestiary-list-viewport");
                    if (viewport) viewport.scrollTop += e.deltaY;
                }, { passive: false });

                // Earth / Petrodemons / Aliens page-tab clicks (wired once on the
                // persistent layout).
                container.querySelectorAll(".bestiary-page-tab").forEach(tabEl => {
                    tabEl.addEventListener("click", () => {
                        this.switchBestiaryPageTab(parseInt(tabEl.getAttribute("data-page"), 10));
                    });
                });
            }

            // The shared search + filter strip (UI/MenuSearchBar.js), sitting
            // under the title and over the Earth / Petrodemon / Alien tabs. Its
            // vocabulary is this menu's own: creatures have archetypes and
            // levels, not prices or item categories, so those controls are never
            // offered here. Rebuilt in place, then handed its caret back.
            const searchSlot = document.getElementById("bestiary-search-slot");
            if (searchSlot && this._bestiaryBar) {
                searchSlot.innerHTML = this._bestiaryBar.html();
                this._bestiaryBar.restoreFocus();
            }

            // Reflect the active page tab styling every refresh.
            document.querySelectorAll("#bestiary-page-tabs .bestiary-page-tab").forEach(tabEl => {
                const active = parseInt(tabEl.getAttribute("data-page"), 10) === this._pageTab;
                tabEl.classList.toggle("active", active);
            });

            // 2. The left pockets, windowed: a codex with every creature ever
            // met in it builds only the cards the page can show, and draws only
            // their sprites (UI/MenuVirtualList.js). That windowing is what used
            // to need an IntersectionObserver over a full list of canvases.
            const listViewport = document.getElementById("bestiary-list-viewport");
            if (listViewport) {
                if (this._monsterList.length > 0) {
                    this._selectedIndex = Math.max(0, Math.min(this._monsterList.length - 1, this._selectedIndex));
                }
                window.MenuVirtualList.render(listViewport, {
                    key: `${this._pageTab}|${this._bestiaryBar ? this._bestiaryBar.query : ''}`,
                    count: this._monsterList.length,
                    renderItem: idx => this.bestiaryCardHTML(this._monsterList[idx], idx),
                    emptyHTML: `<div class="bestiary-list-empty">${T('Bestiary.noMonstersEncountered')}</div>`,
                    onWindow: (win, from, to) => {
                        win.querySelectorAll(".monster-card").forEach(card => {
                            card.addEventListener("click", () => {
                                this._selectedIndex = parseInt(card.getAttribute("data-idx"));
                                this._activeArea = 'list';
                                SoundManager.playOk();
                                this.refreshUIBestiary();
                            });
                        });
                        for (let idx = from; idx < to; idx++) this.drawUIBestiaryCanvas(idx);
                    }
                });
            }

            // 4. Re-render only the right page portfolio (Creature Lexicon Tab Details)
            const portfolioContainer = document.getElementById("bestiary-portfolio-container");
            if (portfolioContainer) {
                let rightPageHTML = "";
                if (this._monsterList.length > 0) {
                    const mon = this._monsterList[this._selectedIndex];
                    const enemy = mon.enemy;
                    const noteData = mon.noteData;

                    // Resolve a procedural 3D archetype for this enemy (if any).
                    const archKey = (window.Battler3D && window.Battler3D.resolveKey)
                        ? window.Battler3D.resolveKey(enemy) : null;
                    const can3D = this._show3DBestiary && !!archKey;

                    // Portfolio Header info
                    const levelBadge = noteData.level ? `LV: ${noteData.level}` : "LV: ??";
                    const archBadge = noteData.archetype ? `<span class="ui-chip badge">${noteData.archetype}</span>` : "";

                    // Render tabs
                    const tabs = [
                        T('Bestiary.lexicon'),
                        T('Bestiary.ecology'),
                        T('Bestiary.extraction')
                    ];
                    let tabsHTML = `<div class="backpack-tabs portfolio-tabs">`;
                    tabs.forEach((tab, idx) => {
                        const activeClass = idx === this._activeTab ? "active selected" : "";
                        const focusedClass = (idx === this._activeTab && this._activeArea === 'tabs') ? "focused" : "";
                        tabsHTML += `<div class="backpack-tab portfolio-tab focusable ${activeClass} ${focusedClass}" tabindex="0" data-tab="${idx}">${tab}</div>`;
                    });
                    tabsHTML += `</div>`;

                    // Vitality: stats and elemental affinities, folded into
                    // the Lexicon page under the portrait.
                    const params = enemy.params || [0, 0, 0, 0, 0, 0, 0, 0];

                    let statsGridHTML = `<div class="stats-grid">`;
                    for (let i = 0; i < 8; i++) {




                        statsGridHTML += `
                            <div class="stat-card">
                                <span class="stat-label">${getShortParamName(i)}</span>
                                <span class="stat-val">${params[i]}</span>
                            </div>
                        `;
                    }
                    statsGridHTML += `</div>`;





                    // Calculate active element rate weaknesses
                    const elements = T.list('Bestiary.elements');
                    const rates = {};
                    for (let i = 1; i < elements.length; i++) {
                        rates[i] = 1.0;
                    }
                    if (enemy.traits) {
                        enemy.traits.forEach(trait => {
                            if (trait.code === 11) { // Element Rate
                                const elId = trait.dataId;
                                if (rates[elId] !== undefined) {
                                    rates[elId] *= trait.value;
                                }
                            }
                        });
                    }

                    let affinitiesGridHTML = "";
                    const activeRates = [];
                    for (let i = 1; i < elements.length; i++) {
                        if (rates[i] !== 1.0) {
                            activeRates.push({ name: elements[i], rate: rates[i] });
                        }
                    }

                    if (activeRates.length > 0) {
                        affinitiesGridHTML += `
                            <h4 class="affinities-header inspect-section-title">${T('Bestiary.elementalAffinities')}</h4>
                            <div class="affinities-grid">
                        `;
                        activeRates.forEach(obj => {
                            const valClass = obj.rate > 1.0 ? "weakness" : "resistance";
                            const formattedRate = obj.rate + "x";
                            affinitiesGridHTML += `
                                <div class="affinity-row">
                                    <span class="affinity-name">${obj.name}</span>
                                    <span class="affinity-val ${valClass}">${formattedRate}</span>
                                </div>
                            `;
                        });
                        affinitiesGridHTML += `</div>`;
                    } else {
                        affinitiesGridHTML += `
                            <h4 class="affinities-header inspect-section-title">${T('Bestiary.elementalAffinities')}</h4>
                            <p class="bestiary-none">${T('Bestiary.noElementalWeaknessOrResistance')}</p>
                        `;
                    }

                    // Render active tab contents. The card's action strip is
                    // collected as the tab is built, and printed last.
                    let contentHTML = "";
                    const actionButtons = [];
                    let seedNote = "";
                    if (this._activeTab === 0) {
                        // Tab 0: Lexicon / Portrait & Info
                        let imgHTML = `
                            <div class="bestiary-portrait-placeholder">${T('Bestiary.drawing')}</div>
                        `;

                        // Without a model the portrait is the creature's own
                        // walking sprite, blown up; the flat battler
                        // illustration it used to be retired with the 2D mode.
                        if (mon.character) {
                            imgHTML = `<canvas id="bestiary-portrait-sprite" class="portrait-sketch-image" width="192" height="192"></canvas>`;
                        }

                        // The seed re-roll is the page's only action, so it
                        // stands in the action strip at the foot of the card
                        // rather than floating over the picture. The "drag to
                        // rotate" caption is gone with the rest of the game's
                        // control hints.
                        if (can3D) {
                            // The seed this specimen was grown from (the world
                            // seed until the player rolls a new one).
                            actionButtons.push(
                                `<div id="bestiary-seed-reroll" class="inspect-btn focusable" tabindex="0">${T('Bestiary.randomizeSeed')}</div>`);
                            seedNote = `<div class="bestiary-seed-note">${T('Bestiary.seed')}: ${this.bestiaryGenSeed(this.bestiarySeedKey(mon))}</div>`;
                        }

                        const portraitInner = can3D
                            ? `<canvas id="bestiary-3d-canvas"></canvas>`
                            : imgHTML;

                        contentHTML = `
                            <div class="portrait-sketch${can3D ? ' portrait-sketch--3d' : ''}">
                                ${portraitInner}
                            </div>
                            ${seedNote}
                            <p class="portfolio-description ui-prose">${this.bestiaryDescription(mon, noteData) || (T('Bestiary.noBiologicalDescriptionRegistered'))}</p>
                            ${statsGridHTML}
                            ${affinitiesGridHTML}
                        `;
                    } else if (this._activeTab === 1) {
                        // Tab 1: Ecology / Biology specs list
                        let speedText = noteData.speed || "3";
                        const speedVal = parseInt(speedText);
                        if (speedVal <= 1) speedText = T('Bestiary.slower');
                        else if (speedVal === 2) speedText = T('Bestiary.slow');
                        else if (speedVal === 3) speedText = T('Bestiary.normal');
                        else if (speedVal === 4) speedText = T('Bestiary.fast');
                        else if (speedVal >= 5) speedText = T('Bestiary.faster');

                        const abilities = [];
                        if (noteData.talk) abilities.push(T('Bestiary.talk'));
                        if (noteData.climb) abilities.push(T('Bestiary.climb'));
                        if (noteData.floating) abilities.push(T('Bestiary.floating'));
                        const abilitiesText = abilities.length > 0 ? abilities.join(", ") : (T('Bestiary.none'));

                        // Behavioral role (Predator/Hunter/Prey/Neutral) with color coding
                        // Keys are the <Predator>/<Hunter>/... note tags; the word
                        // comes from Bestiary.behavior.<id>.
                        // The four trophic roles are a named ladder, so the
                        // step is a class and the stylesheet inks it.
                        const behaviorMap = {
                            Predator: { key: "Bestiary.behavior.predator", cls: "bestiary-role--predator" },
                            Hunter:   { key: "Bestiary.behavior.hunter",   cls: "bestiary-role--hunter" },
                            Prey:     { key: "Bestiary.behavior.prey",     cls: "bestiary-role--prey" },
                            Neutral:  { key: "Bestiary.behavior.neutral",  cls: "bestiary-role--neutral" }
                        };
                        const behaviorInfo = noteData.behavior ? behaviorMap[noteData.behavior] : null;
                        const behaviorText = behaviorInfo
                            ? `<span class="bestiary-role ${behaviorInfo.cls}">${T(behaviorInfo.key)}</span>`
                            : (T('Bestiary.unknown'));

                        // The 3 nations where this enemy is most commonly found,
                        // derived from the shared nation-seeded spawn frequency.
                        const bseHelpers = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
                        let rangeText = T('Bestiary.unknown');
                        if (bseHelpers && bseHelpers.getTopNationsForEnemy) {
                            const nations = bseHelpers.getTopNationsForEnemy(enemy.id, 3);
                            if (nations.length > 0) rangeText = nations.map(n => n.name).join(", ");
                        }

                        contentHTML = `
                            <div class="ui-fact-grid ecology-list">
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.trophicRole')}</span>
                                    <span class="ui-fact-val ecology-val">${behaviorText}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.naturalHabitat')}</span>
                                    <span class="ui-fact-val ecology-val">${window.BiomeNames.displayList(noteData.biome) || T('Bestiary.proceduralWorld')}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.commonTerritories')}</span>
                                    <span class="ui-fact-val ecology-val">${rangeText}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.dailyCycle')}</span>
                                    <span class="ui-fact-val ecology-val">${noteData.timeOfDay ? ecologyLabel('activity', noteData.timeOfDay) : T('Bestiary.fluid')}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.bloodComposition')}</span>
                                    <span class="ui-fact-val ecology-val">${noteData.bloodType ? ecologyLabel('blood', noteData.bloodType) : T('Bestiary.redStandard')}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.weightMass')}</span>
                                    <span class="ui-fact-val ecology-val">${noteData.weight || T('Bestiary.unknownWeight')}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.relativeSpeed')}</span>
                                    <span class="ui-fact-val ecology-val">${speedText}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.locomotion')}</span>
                                    <span class="ui-fact-val ecology-val">${noteData.movement || (T('Bestiary.terrestrial'))}</span>
                                </div>
                                <div class="ui-fact ecology-row">
                                    <span class="ui-fact-lbl ecology-lbl">${T('Bestiary.inherentAttributes')}</span>
                                    <span class="ui-fact-val ecology-val">${abilitiesText}</span>
                                </div>
                            </div>
                        `;
                    } else if (this._activeTab === 2) {
                        // Tab 2: Drops / Reagents harvesting, rewards and actions
                        let spoilsHTML = `
                            <div class="drops-section">
                                <h4 class="affinities-header inspect-section-title">${T('Bestiary.rewards')}</h4>
                                <div class="bestiary-spoils">
                                    <span>${T('Bestiary.exp')}: <span class="bestiary-spoil-exp">${enemy.exp}</span></span>
                                    <span>${T('Bestiary.gold')}: <span class="bestiary-spoil-gold">${enemy.gold / 100} €</span></span>
                                </div>
                            </div>
                        `;

                        // Drops harvest
                        let dropsHTML = `<div class="drops-section"><h4 class="affinities-header inspect-section-title">${T('Bestiary.harvestableReagents')}</h4>`;
                        const drops = enemy.dropItems.filter(drop => drop.kind > 0);
                        if (drops.length > 0) {
                            drops.forEach(drop => {
                                let item = null;
                                if (drop.kind === 1) item = $dataItems[drop.dataId];
                                if (drop.kind === 2) item = $dataWeapons[drop.dataId];
                                if (drop.kind === 3) item = $dataArmors[drop.dataId];

                                if (item) {
                                    const chance = Math.floor(100 / drop.denominator);
                                    const iconIdx = item.iconIndex;
                                    // The IconSet cell is data: it is handed to the
                                    // stylesheet as two custom properties.
                                    const iconStyle = `-${(iconIdx % 16) * 24}px|-${Math.floor(iconIdx / 16) * 24}px`;
                                    const rarity = window.ItemSystemUtils.getItemRarity(item);

                                    dropsHTML += `
                                        <div class="harvest-row">
                                            <div class="harvest-meta">
                                                <span class="harvest-icon" data-cell="${iconStyle}"></span>
                                                <span class="harvest-name ${window.ItemSystemUtils ? window.ItemSystemUtils.rarityClass(rarity) : ''}">${item.name}</span>
                                            </div>
                                            <span class="harvest-chance">${T('Bestiary.harvestChance', { chance: chance })}</span>
                                        </div>
                                    `;
                                }
                            });
                        } else {
                            dropsHTML += `<p class="bestiary-none">${T('Bestiary.noExtractableReagents')}</p>`;
                        }
                        dropsHTML += `</div>`;

                        // Action skills
                        let actionsHTML = `<div class="drops-section"><h4 class="affinities-header inspect-section-title">${T('Bestiary.combatAbilities')}</h4>`;
                        const actions = enemy.actions || [];
                        if (actions.length > 0) {
                            const skillIds = [...new Set(actions.map(a => a.skillId))];
                            skillIds.forEach(id => {
                                const skill = $dataSkills[id];
                                if (skill) {
                                    const iconIdx = skill.iconIndex;
                                    // The IconSet cell is data: it is handed to the
                                    // stylesheet as two custom properties.
                                    const iconStyle = `-${(iconIdx % 16) * 24}px|-${Math.floor(iconIdx / 16) * 24}px`;
                                    actionsHTML += `
                                        <div class="harvest-row">
                                            <div class="harvest-meta">
                                                <span class="harvest-icon" data-cell="${iconStyle}"></span>
                                                <span class="harvest-name harvest-name--skill">${skill.name}</span>
                                            </div>
                                        </div>
                                    `;
                                }
                            });
                        } else {
                            actionsHTML += `<p class="bestiary-none">${T('Bestiary.noCombatAbilitiesRegistered')}</p>`;
                        }
                        actionsHTML += `</div>`;

                        contentHTML = `
                            ${spoilsHTML}
                            ${dropsHTML}
                            ${actionsHTML}
                        `;
                    }

                    rightPageHTML = `
                        <div class="ui-detail portfolio">
                            <div class="ui-detail-head portfolio-header">
                                <div class="ui-detail-titles">
                                    <span class="portfolio-name">${mon.name}</span>
                                </div>
                                <div class="ui-chip-row portfolio-badges">
                                    <span class="ui-chip badge">${levelBadge}</span>
                                    ${archBadge}
                                </div>
                            </div>
                            ${tabsHTML}
                            <div class="ui-detail-scroll ui-scroll portfolio-content">
                                ${contentHTML}
                            </div>
                            ${actionButtons.length ? `<div class="inspect-actions">${actionButtons.join("")}</div>` : ""}
                        </div>
                    `;
                } else {
                    rightPageHTML = `<div class="ui-empty"><div class="ui-empty-text">${T('Bestiary.noMonstersEncountered')}</div></div>`;
                }

                // Tear down any previous 3D viewer before its canvas is removed.
                this.cleanupBestiary3D();
                portfolioContainer.innerHTML = rightPageHTML;

                // Every IconSet cell on the card, handed to the stylesheet.
                portfolioContainer.querySelectorAll(".harvest-icon[data-cell]").forEach(el => {
                    const [x, y] = String(el.dataset.cell).split("|");
                    el.style.setProperty("--icon-x", x);
                    el.style.setProperty("--icon-y", y);
                });

                // Bind tabs click dynamically (only on newly drawn tab elements)
                const tabElList = portfolioContainer.querySelectorAll(".portfolio-tab");
                tabElList.forEach(tab => {
                    tab.addEventListener("click", () => {
                        const tabId = parseInt(tab.getAttribute("data-tab"));
                        this._activeTab = tabId;
                        this._activeArea = 'tabs';
                        SoundManager.playOk();
                        this.refreshUIBestiary();
                    });
                });

                // Spin up the live model on the Info tab.
                if (this._monsterList.length > 0) {
                    const mon2 = this._monsterList[this._selectedIndex];
                    const seedKey2 = this.bestiarySeedKey(mon2);
                    const rerollBtn = portfolioContainer.querySelector("#bestiary-seed-reroll");
                    if (rerollBtn) {
                        rerollBtn.addEventListener("click", (e) => {
                            e.stopPropagation();
                            SoundManager.playOk();
                            this.randomizeBestiaryGenSeed(seedKey2);
                            this.refreshUIBestiary();
                        });
                    }
                    const archKey2 = (window.Battler3D && window.Battler3D.resolveKey)
                        ? window.Battler3D.resolveKey(mon2.enemy) : null;
                    if (this._activeTab === 0 && this._show3DBestiary && archKey2) {
                        this.initBestiary3D(mon2.enemy, archKey2, seedKey2);
                    } else if (this._activeTab === 0) {
                        this.drawBestiaryPortraitSprite(mon2);
                    }
                }
            }

            // 5. Draw canvas walking graphic for the selected row right away
            if (this._monsterList.length > 0) {
                this.drawUIBestiaryCanvas(this._selectedIndex);
            }
        }

        // One pocket card: the creature's sprite frame, its name, and the level
        // and archetype it was catalogued with.
        bestiaryCardHTML(mon, idx) {
            if (!mon) return "";
            const levelBadge = mon.noteData.level ? `LV: ${mon.noteData.level}` : "";
            const archetype = mon.noteData.archetype ? `| ${mon.noteData.archetype}` : "";
            const isSelected = idx === this._selectedIndex;
            const isFocused = isSelected && this._activeArea === 'list';
            return `
                <div class="monster-card${isSelected ? " selected" : ""}${isFocused ? " focused" : ""}" id="monster-card-${idx}" data-idx="${idx}">
                    <div class="monster-sprite-frame">
                        <canvas class="monster-sprite-canvas" id="bestiary-canvas-${idx}" data-idx="${idx}" width="32" height="32"></canvas>
                    </div>
                    <div class="monster-meta">
                        <span class="monster-name">${mon.name}</span>
                        <span class="monster-subtitle">${levelBadge} ${archetype}</span>
                    </div>
                </div>
            `;
        }

        // The Lexicon portrait when no 3D model stands in for the creature:
        // its walking sprite, facing the reader, drawn as large as the frame
        // allows without smoothing so the pixels stay pixels.
        drawBestiaryPortraitSprite(mon) {
            const canvas = document.getElementById('bestiary-portrait-sprite');
            if (!canvas || !mon || !mon.character) return;
            const bitmap = ImageManager.loadCharacter('Monsters/' + mon.character);
            bitmap.addLoadListener(() => {
                if (!canvas.isConnected) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const single = mon.character.startsWith('$');
                const pw = single ? bitmap.width / 3 : bitmap.width / 12;
                const ph = single ? bitmap.height / 4 : bitmap.height / 8;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.imageSmoothingEnabled = false;
                // Fit the frame inside the square without distorting it.
                const scale = Math.min(canvas.width / pw, canvas.height / ph);
                const dw = pw * scale;
                const dh = ph * scale;
                ctx.drawImage(bitmap.canvas, pw, 0, pw, ph,
                    (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
            });
        }

        // Helper to draw walking animation frames to character canvas
        drawUIBestiaryCanvas(idx) {
            const canvas = document.getElementById(`bestiary-canvas-${idx}`);
            if (!canvas) return;

            const mon = this._monsterList[idx];
            if (!mon) return;

            const charName = mon.character;
            if (charName) {
                const bitmap = ImageManager.loadCharacter('Monsters/' + charName);
                bitmap.addLoadListener(() => {
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.imageSmoothingEnabled = false;

                    const isSingle = charName.startsWith('$');
                    let pw, ph;
                    if (isSingle) {
                        pw = bitmap.width / 3;
                        ph = bitmap.height / 4;
                    } else {
                        pw = bitmap.width / 12;
                        ph = bitmap.height / 8;
                    }

                    const isSelected = idx === this._selectedIndex;
                    let patternFrame = 1; // Stand frame
                    if (isSelected) {
                        patternFrame = this._spriteAnimFrame;
                    }

                    const sx = patternFrame * pw;
                    const sy = 0; // Direction row: Facing down

                    ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, 0, 0, canvas.width, canvas.height);
                });
            } else {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'rgba(94,47,23,0.3)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            }
        }

        // Cycle 4-frame character walking animation
        updateUIBestiarySpriteAnimations() {
            this._spriteAnimTimer++;
            if (this._spriteAnimTimer >= 15) {
                this._spriteAnimTimer = 0;

                const frames = [0, 1, 2, 1];
                const curIdx = frames.indexOf(this._spriteAnimFrame);
                const nextIdx = (curIdx + 1) % 4;
                this._spriteAnimFrame = frames[nextIdx];

                // Redraw character canvas of only the selected row for performance
                if (this._monsterList.length > 0) {
                    this.drawUIBestiaryCanvas(this._selectedIndex);
                }
            }
        }

        // =============================================================================
        // Keyboard & Gamepad navigation inputs
        // =============================================================================
        updateUIBestiaryInput() {
            // While the search field has the keyboard, the cards must not move
            // under the caret and Escape must reach the field, not the scene.
            if (window.MenuSearchBar && window.MenuSearchBar.isTyping()) return;

            if (this._monsterList.length === 0) {
                if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    this.popScene();
                    SoundManager.playCancel();
                }
                return;
            }

            // L1/R1 cycle the right-page detail tabs from anywhere in the scene
            if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
                const dir = Input.isTriggered('pageup') ? -1 : 1;
                this._activeTab = (this._activeTab + dir + 3) % 3;
                SoundManager.playCursor();
                this.refreshUIBestiary();
                return;
            }

            if (this._activeArea === 'list') {
                if (Input.isRepeated('down')) {
                    this._selectedIndex = (this._selectedIndex + 1) % this._monsterList.length;
                    SoundManager.playCursor();
                    this.refreshUIBestiary();

                    // By index: the card moved onto is built only once the
                    // window reaches it (UI/MenuVirtualList.js).
                    const viewport = document.getElementById("bestiary-list-viewport");
                    if (viewport) window.MenuVirtualList.scrollToIndex(viewport, this._selectedIndex);
                } else if (Input.isRepeated('up')) {
                    this._selectedIndex = (this._selectedIndex - 1 + this._monsterList.length) % this._monsterList.length;
                    SoundManager.playCursor();
                    this.refreshUIBestiary();

                    // By index: the card moved onto is built only once the
                    // window reaches it (UI/MenuVirtualList.js).
                    const viewport = document.getElementById("bestiary-list-viewport");
                    if (viewport) window.MenuVirtualList.scrollToIndex(viewport, this._selectedIndex);
                } else if (Input.isRepeated('left')) {
                    this._activeArea = 'tabs';
                    this._activeTab = 2; // Focus rightmost tab (Extraction) on left page
                    SoundManager.playOk();
                    this.refreshUIBestiary();
                } else if (Input.isTriggered('ok')) {
                    this._activeArea = 'tabs';
                    this._activeTab = 0; // Focus first tab (Lexicon) on left page
                    SoundManager.playOk();
                    this.refreshUIBestiary();
                } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    this.popScene();
                    SoundManager.playCancel();
                }
            } else if (this._activeArea === 'tabs') {
                if (Input.isRepeated('right')) {
                    // The tabs never hand focus back to the list: right wraps
                    // around them and cancel leaves the book altogether.
                    this._activeTab = (this._activeTab + 1) % 3;
                    SoundManager.playCursor();
                    this.refreshUIBestiary();
                } else if (Input.isRepeated('left')) {
                    this._activeTab = (this._activeTab - 1 + 3) % 3;
                    SoundManager.playCursor();
                    this.refreshUIBestiary();
                } else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                    this.popScene();
                    SoundManager.playCancel();
                }
            }
        }

        // Notes parsed fields helper
        parseMonsterNotes(notes, enemyId) {
            const result = {
                level: null, description: null, character: null, archetype: null, biome: null,
                timeOfDay: null, bloodType: null, rarity: null, weight: null,
                speed: null, movement: null, talk: false, climb: false, floating: false,
                behavior: null
            };







            if (enemyId) {
                const l10n = getEnemyL10n(enemyId);
                const lang = ConfigManager.language || 'en';
                // English descriptions use combinatorial {a | b | c} inline text
                // resolved (seeded from the world seed) by EnemyDescription. Other
                // languages keep their i18n/<lang>/enemies.json translation.
                let desc = null;
                if (window.EnemyDescription && lang === 'en') {
                    desc = window.EnemyDescription.describe(enemyId);
                }
                if (!desc && l10n && l10n.description) {
                    desc = l10n.description;
                }
                if (desc) result.description = desc;
            }

            if (!notes) return result;

            const levelMatch = notes.match(/<Level:\s*(\d+)>/i);
            if (levelMatch) result.level = levelMatch[1];

            const charMatch = notes.match(/<Char:\s*([^>]+)>/i);
            if (charMatch) result.character = charMatch[1].trim();

            const archetypeMatch = notes.match(/<Archetype:\s*([^>]+)>/i);
            if (archetypeMatch) result.archetype = archetypeMatch[1].trim();

            const biomeMatch = notes.match(/<Biome:\s*([^>]+)>/i);
            if (biomeMatch) result.biome = biomeMatch[1].trim();

            // i18n-ignore-start: note-tag ids, named by ecologyLabel() on render
            if (notes.match(/<Nocturnal>/i)) result.timeOfDay = "Nocturnal";
            else if (notes.match(/<Diurnal>/i)) result.timeOfDay = "Diurnal";
            else if (notes.match(/<Crepuscular>/i)) result.timeOfDay = "Crepuscular";

            if (notes.match(/<GreenBlood>/i)) result.bloodType = "Green";
            else if (notes.match(/<BlueBlood>/i)) result.bloodType = "Blue";
            else if (notes.match(/<BlackBlood>/i)) result.bloodType = "Black";
            else if (notes.match(/<NoBlood>/i)) result.bloodType = "None";
            // i18n-ignore-end

            const rarityMatch = notes.match(/<Rarity:\s*([^>]+)>/i);
            if (rarityMatch) result.rarity = rarityMatch[1].trim();

            const weightMatch = notes.match(/<Weight:\s*([^>]+)>/i);
            if (weightMatch) result.weight = weightMatch[1].trim();

            const speedMatch = notes.match(/<Speed:\s*(\d+)>/i);
            if (speedMatch) result.speed = speedMatch[1];

            const movementMatch = notes.match(/<Movement:\s*([^>]+)>/i);
            if (movementMatch) result.movement = movementMatch[1].trim();

            if (notes.match(/<Talk>/i)) result.talk = true;
            if (notes.match(/<Climb>/i)) result.climb = true;
            if (notes.match(/<Floating>/i)) result.floating = true;

            // i18n-ignore-start: note-tag ids, keys into behaviorMap
            if (notes.match(/<Predator>/i)) result.behavior = "Predator";
            else if (notes.match(/<Hunter>/i)) result.behavior = "Hunter";
            else if (notes.match(/<Prey>/i)) result.behavior = "Prey";
            else if (notes.match(/<Neutral>/i)) result.behavior = "Neutral";
            // i18n-ignore-end

            return result;
        }
    }

    window.Scene_CDCollection = Scene_CDCollection;

    // =============================================================================
    // Shared bestiary service
    // =============================================================================
    // The codex's three pages as plain data: Earth (encountered database
    // creatures), Petrodemons (the ones the party has felled, read out of the
    // copy of its record the codex kept) and Aliens (discovered procedural
    // species, each keyed to a base enemy for stats and look but shown under its
    // procedural name). Scene_CDCollection draws these; the main menu's search
    // page searches them.
    const parseNotes = (note, enemyId) =>
        Scene_CDCollection.prototype.parseMonsterNotes.call(Scene_CDCollection.prototype, note, enemyId);

    // Every codex page is read as a book is read: by name, from A to Z, in the
    // player's own language.
    const byName = function (list) {
        return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    };

    window.BestiaryData = {
        parseNotes,

        earth() {
            const out = [];
            $dataEnemies.forEach(enemy => {
                if (!enemy || enemy.id <= 0 || isDividerEnemy(enemy)) return;
                if (!$gameSystem.isMonsterEncountered(enemy.id)) return;
                const l10n = getEnemyL10n(enemy.id);
                const noteData = parseNotes(enemy.note, enemy.id);
                out.push({
                    id: enemy.id,
                    name: l10n ? l10n.name : enemy.name,
                    battlerName: enemy.battlerName,
                    character: noteData.character,
                    enemy: enemy,
                    noteData: noteData
                });
            });
            return byName(out);
        },

        petrodemons() {
            const out = [];
            const codex = ($gameSystem.petrodemonCodex && $gameSystem.petrodemonCodex()) || [];
            codex.forEach(entry => {
                if (!entry || !entry.enemy) return;
                // Its own page, not whatever the scratch enemy slot holds now:
                // the description travels with the entry.
                const noteData = parseNotes(entry.enemy.note, 0);
                if (entry.description) noteData.description = entry.description;
                out.push({
                    id: entry.enemy.id,
                    name: entry.name,
                    battlerName: entry.enemy.battlerName,
                    character: noteData.character,
                    enemy: entry.enemy,
                    noteData: noteData,
                    isPetrodemon: true,
                    // Its look was rolled from its own seed, so that is what
                    // keeps its portrait its own.
                    speciesKey: 'petro:' + entry.seed
                });
            });
            return byName(out);
        },

        aliens() {
            const out = [];
            const disc = (window.GalaxySim && window.GalaxySim.getDiscoveredAlienSpecies)
                ? window.GalaxySim.getDiscoveredAlienSpecies() : [];
            disc.forEach(sp => {
                const enemy = $dataEnemies[sp.enemyId];
                if (!enemy || isDividerEnemy(enemy)) return;
                const noteData = parseNotes(enemy.note, sp.enemyId);
                out.push({
                    id: sp.enemyId,
                    name: sp.name,
                    battlerName: enemy.battlerName,
                    character: noteData.character,
                    enemy: enemy,
                    noteData: noteData,
                    isAlien: true,
                    speciesKey: sp.key
                });
            });
            return byName(out);
        }
    };

    //=============================================================================
    // Battle Integration & Initialization
    //=============================================================================
    const _BattleManager_initMembers = BattleManager.initMembers;
    BattleManager.initMembers = function () {
        _BattleManager_initMembers.call(this);
        $gameSystem.resetUsedMonstersInBattle();
    };

    // =============================================================================
    // Secondary ASCII Mode Fallback Compatibility
    // =============================================================================
    if (window.AsciiMode) {
        const _Scene_CDCollection_start = Scene_CDCollection.prototype.start;
        Scene_CDCollection.prototype.start = function () {
            _Scene_CDCollection_start.call(this);
            if (window.AsciiMode.active !== 0) {
                window.AsciiMode.createCanvas();
                if (window.AsciiMode.canvas) window.AsciiMode.canvas.hidden = false;

                const container = document.getElementById("bestiary-container");
                if (container) container.hidden = true;

                this._selectedCDIndex = 0;
                this._asciiMonsters = this._monsterList;
            }
        };

        const _Scene_CDCollection_terminate = Scene_CDCollection.prototype.terminate;
        Scene_CDCollection.prototype.terminate = function () {
            if (window.AsciiMode.canvas) {
                window.AsciiMode.canvas.hidden = true;
            }
            _Scene_CDCollection_terminate.call(this);
        };

        const _Scene_CDCollection_update = Scene_CDCollection.prototype.update;
        Scene_CDCollection.prototype.update = function () {
            if (window.AsciiMode.active !== 0) {
                this.updateAsciiBestiaryInput();
                this.renderAsciiBestiary();
                Scene_Base.prototype.update.call(this);
                return;
            }
            _Scene_CDCollection_update.call(this);
        };

        Scene_CDCollection.prototype.updateAsciiBestiaryInput = function () {
            const list = this._asciiMonsters;
            if (list.length === 0) {
                if (Input.isTriggered('cancel')) {
                    SceneManager.pop();
                    SoundManager.playCancel();
                }
                return;
            }

            if (Input.isRepeated('down')) {
                this._selectedCDIndex = (this._selectedCDIndex + 1) % list.length;
                SoundManager.playCursor();
            }
            if (Input.isRepeated('up')) {
                this._selectedCDIndex = (this._selectedCDIndex - 1 + list.length) % list.length;
                SoundManager.playCursor();
            }
            if (Input.isTriggered('cancel')) {
                SceneManager.pop();
                SoundManager.playCancel();
            }
        };

        Scene_CDCollection.prototype.renderAsciiBestiary = function () {
            const ctx = window.AsciiMode.context;
            if (!ctx) return;

            ctx.clearRect(0, 0, window.AsciiMode.canvas.width, window.AsciiMode.canvas.height);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, window.AsciiMode.canvas.width, window.AsciiMode.canvas.height);

            const fontSize = window.AsciiMode.fontSize;
            ctx.font = `${fontSize}px ${window.AsciiMode.fontFamily}`;

            // Header
            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'center';
            ctx.fillText("--- BESTIARY ---", window.AsciiMode.canvas.width / 2, 30);

            // List
            const list = this._asciiMonsters;
            const listY = 80;
            const listX = 50;
            const detailX = 400;

            ctx.textAlign = 'left';
            for (let i = 0; i < list.length; i++) {
                const monster = list[i];
                const y = listY + i * (fontSize + 10);

                if (i === this._selectedCDIndex) {
                    ctx.fillStyle = '#FF0000';
                    ctx.fillText(`> ${monster.name}`, listX, y);
                } else {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(`  ${monster.name}`, listX, y);
                }
            }

            // Details
            const selectedMonster = list[this._selectedCDIndex];
            if (selectedMonster) {
                this.renderAsciiMonsterDetails(selectedMonster.enemy, detailX, listY);
            }
        };

        Scene_CDCollection.prototype.renderAsciiMonsterDetails = function (enemy, x, y) {
            const ctx = window.AsciiMode.context;
            const fontSize = window.AsciiMode.fontSize;
            const lineHeight = fontSize + 6;
            let currentY = y;

            const l10n = getEnemyL10n(enemy.id);
            const name = l10n ? l10n.name : enemy.name;

            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'left';
            ctx.fillText(name, x, currentY);
            currentY += lineHeight;

            ctx.strokeStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.moveTo(x, currentY);
            ctx.lineTo(x + 300, currentY);
            ctx.stroke();
            currentY += 10;

            ctx.fillStyle = '#FFFFFF';

            // Draw Params
            const params = enemy.params || [0, 0, 0, 0, 0, 0, 0, 0];

            for (let i = 0; i < 8; i++) {
                const val = params[i];
                const label = getShortParamName(i);
                this.drawAsciiKeyValue(label, val.toString(), x, currentY);
                currentY += lineHeight;
            }

            currentY += 10;
            this.drawAsciiKeyValue("EXP", enemy.exp.toString(), x, currentY);
            currentY += lineHeight;
            this.drawAsciiKeyValue(T('Bestiary.gold'), (enemy.gold / 100).toString() + " €", x, currentY);
        };

        Scene_CDCollection.prototype.drawAsciiKeyValue = function (key, value, x, y) {
            const ctx = window.AsciiMode.context;
            ctx.fillStyle = '#00FFFF';
            ctx.fillText(key + ":", x, y);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(value, x + 100, y);
        };
    }


    // =========================================================================
    // Incanta 96: the bestiary as a desktop encyclopaedia
    // =========================================================================
    // The same three codex pages (Earth, petrodemons, aliens) read through a
    // mid-nineties multimedia encyclopaedia: a contents pane with a Find box
    // and an A to Z strip on the left, and on the right an article with a
    // title band, a media box holding the live 3D specimen, the biological
    // description and the fact tables. Every article's specimen is grown
    // from the world seed, and can be re-rolled from the media box.
    const INCANTA_APP_ID = 'app-bestiary-encarta';

    function incantaEsc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // The letters an A to Z strip needs for a list of names: every initial
    // that occurs, in order.
    function incantaLetters(names) {
        const seen = new Set();
        names.forEach(n => { const ch = String(n || '').charAt(0).toUpperCase(); if (ch) seen.add(/[A-Z]/.test(ch) ? ch : '#'); });
        return Array.from(seen).sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
    }

    function incantaFilter(list, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return list;
        return list.filter(m => String(m.name || '').toLowerCase().includes(q)
            || String((m.noteData && m.noteData.archetype) || '').toLowerCase().includes(q)
            || String((m.noteData && m.noteData.biome) || '').toLowerCase().includes(q));
    }

    window.IncantaBestiary = {
        letters: incantaLetters,
        filter: incantaFilter,
        _seeds: {},
        _view: null,

        seedFor: function(mon) {
            const key = mon.speciesKey ? String(mon.speciesKey) : String(mon.id);
            if (this._seeds[key] == null) this._seeds[key] = worldGenSeed();
            return this._seeds[key];
        },

        reroll: function(mon) {
            const key = mon.speciesKey ? String(mon.speciesKey) : String(mon.id);
            this._seeds[key] = String(1 + Math.floor(Math.random() * 0x7ffffffe));
            return this._seeds[key];
        },

        description: function(mon) {
            const stored = mon.noteData ? mon.noteData.description : null;
            if (!mon.enemy || !window.EnemyDescription) return stored;
            if ((ConfigManager.language || 'en') !== 'en') return stored;
            const template = window.EnemyDescription.rawDescription(mon.enemy.id);
            if (!template) return stored;
            const resolved = window.EnemyDescription.resolve(template, 'enemy:' + mon.enemy.id + ':' + (mon.enemy.name || '') + ':' + this.seedFor(mon));
            return resolved || stored;
        },

        pages: function() {
            return [
                { id: 'earth', label: T('Bestiary.earth'), list: window.BestiaryData.earth() },
                { id: 'petro', label: T('Bestiary.petrodemons'), list: window.BestiaryData.petrodemons() },
                { id: 'alien', label: T('Bestiary.aliens'), list: window.BestiaryData.aliens() }
            ];
        },

        articleHTML: function(mon, can3D) {
            const T_ = k => T('Bestiary.incanta.' + k);
            const enemy = mon.enemy, nd = mon.noteData || {};
            const params = enemy.params || [0, 0, 0, 0, 0, 0, 0, 0];
            const elements = T.list('Bestiary.elements');
            const rates = {};
            (enemy.traits || []).forEach(t => { if (t.code === 11) rates[t.dataId] = (rates[t.dataId] || 1) * t.value; });
            const affinities = Object.keys(rates).filter(k => rates[k] !== 1).map(k => `<tr><td>${incantaEsc(elements[k] || k)}</td><td class="${rates[k] > 1 ? 'weak' : 'resist'}">${rates[k]}x</td></tr>`).join('');

            const speedVal = parseInt(nd.speed || '3', 10);
            const speedText = speedVal <= 1 ? T('Bestiary.slower') : speedVal === 2 ? T('Bestiary.slow') : speedVal === 3 ? T('Bestiary.normal') : speedVal === 4 ? T('Bestiary.fast') : T('Bestiary.faster');
            const abilities = [nd.talk && T('Bestiary.talk'), nd.climb && T('Bestiary.climb'), nd.floating && T('Bestiary.floating')].filter(Boolean).join(', ') || T('Bestiary.none');
            const behaviorKey = nd.behavior ? 'Bestiary.behavior.' + String(nd.behavior).toLowerCase() : null;
            const bse = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
            let range = T('Bestiary.unknown');
            if (bse && bse.getTopNationsForEnemy) { const n = bse.getTopNationsForEnemy(enemy.id, 3); if (n.length) range = n.map(x => x.name).join(', '); }

            const drops = (enemy.dropItems || []).filter(d => d.kind > 0).map(d => {
                const item = d.kind === 1 ? $dataItems[d.dataId] : d.kind === 2 ? $dataWeapons[d.dataId] : $dataArmors[d.dataId];
                if (!item) return '';
                return `<tr><td>${incantaEsc(item.name)}</td><td>${Math.floor(100 / d.denominator)}%</td></tr>`;
            }).join('');

            const fact = (k, v) => `<tr><td>${T(k)}</td><td>${v}</td></tr>`;
            return `
                <div class="incanta-title-band">
                    <div class="incanta-title">${incantaEsc(mon.name)}</div>
                    <div class="incanta-subtitle">${incantaEsc(nd.archetype || '')}${nd.level ? ' &middot; LV ' + incantaEsc(nd.level) : ''}</div>
                </div>
                <div class="incanta-article">
                    <div class="incanta-media">
                        <div class="incanta-media-frame">
                            ${can3D ? '<canvas id="incanta-3d"></canvas>' : `<div class="incanta-no-media">${T_('noMedia')}</div>`}
                        </div>
                        <div class="incanta-caption">${T_('mediaCaption')}</div>
                        ${can3D ? `<div class="incanta-media-bar"><span>${T('Bestiary.seed')}: ${incantaEsc(this.seedFor(mon))}</span><button id="incanta-reroll" class="focusable">${T('Bestiary.randomizeSeed')}</button></div>` : ''}
                    </div>
                    <p class="incanta-lead">${incantaEsc(this.description(mon) || T('Bestiary.noBiologicalDescriptionRegistered'))}</p>
                    <h3>${T_('vitals')}</h3>
                    <table class="incanta-facts incanta-facts--grid"><tr>${params.map((v, i) => `<td><b>${incantaEsc(getShortParamName(i))}</b> ${v}</td>`).join('')}</tr></table>
                    <table class="incanta-facts">
                        ${fact('Bestiary.exp', enemy.exp)}
                        ${fact('Bestiary.gold', (enemy.gold / 100) + ' €')}
                    </table>
                    <h3>${T('Bestiary.ecology')}</h3>
                    <table class="incanta-facts">
                        ${fact('Bestiary.trophicRole', behaviorKey && T.has(behaviorKey) ? incantaEsc(T(behaviorKey)) : T('Bestiary.unknown'))}
                        ${fact('Bestiary.naturalHabitat', incantaEsc(window.BiomeNames.displayList(nd.biome) || T('Bestiary.proceduralWorld')))}
                        ${fact('Bestiary.commonTerritories', incantaEsc(range))}
                        ${fact('Bestiary.dailyCycle', nd.timeOfDay ? incantaEsc(ecologyLabel('activity', nd.timeOfDay)) : T('Bestiary.fluid'))}
                        ${fact('Bestiary.bloodComposition', nd.bloodType ? incantaEsc(ecologyLabel('blood', nd.bloodType)) : T('Bestiary.redStandard'))}
                        ${fact('Bestiary.weightMass', incantaEsc(nd.weight || T('Bestiary.unknownWeight')))}
                        ${fact('Bestiary.relativeSpeed', speedText)}
                        ${fact('Bestiary.locomotion', incantaEsc(nd.movement || T('Bestiary.terrestrial')))}
                        ${fact('Bestiary.inherentAttributes', abilities)}
                    </table>
                    <h3>${T('Bestiary.elementalAffinities')}</h3>
                    ${affinities ? `<table class="incanta-facts">${affinities}</table>` : `<p class="incanta-none">${T('Bestiary.noElementalWeaknessOrResistance')}</p>`}
                    <h3>${T('Bestiary.harvestableReagents')}</h3>
                    ${drops ? `<table class="incanta-facts">${drops}</table>` : `<p class="incanta-none">${T('Bestiary.none')}</p>`}
                </div>`;
        },

        launch: function() {
            const OS = window.HypernetOS;
            if (!OS || !OS.WindowManager) return;
            const T_ = (k, p) => T('Bestiary.incanta.' + k, p);
            const html = `
                <div class="incanta">
                    <div class="incanta-header">
                        <span class="incanta-brand">${T_('appName')}</span>
                        <span class="incanta-edition">${T_('edition')}</span>
                    </div>
                    <div class="incanta-body">
                        <div class="incanta-contents">
                            <div class="incanta-pages" id="incanta-pages"></div>
                            <div class="incanta-find"><input id="incanta-find" class="focusable" type="text" placeholder="${incantaEsc(T_('find'))}"></div>
                            <div class="incanta-letters" id="incanta-letters"></div>
                            <div class="incanta-list" id="incanta-list"></div>
                            <div class="incanta-count" id="incanta-count"></div>
                        </div>
                        <div class="incanta-page" id="incanta-page"></div>
                    </div>
                </div>`;
            const win = OS.WindowManager.createWindow({ id: INCANTA_APP_ID, title: T_('appName'), icon: 189, width: 860, height: 600, contentHTML: html });
            if (win._incantaBound) return;
            win._incantaBound = true;
            const q = s => win.querySelector(s);
            const st = { pages: this.pages(), page: 0, query: '', selected: null, view: null };
            const can3D = typeof THREE !== 'undefined' && !!(window.Battler3D && window.Battler3D.create);

            const dispose = () => { if (st.view) { disposeBestiary3D(st.view); st.view = null; } };

            const renderPages = () => {
                q('#incanta-pages').innerHTML = st.pages.map((p, i) => `<div class="incanta-tab focusable${i === st.page ? ' active' : ''}" tabindex="0" data-page="${i}">${incantaEsc(p.label)}</div>`).join('');
                q('#incanta-pages').querySelectorAll('.incanta-tab').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); st.page = parseInt(el.dataset.page, 10); renderPages(); renderList(); }));
            };

            const renderList = () => {
                const list = incantaFilter(st.pages[st.page].list, st.query);
                q('#incanta-letters').innerHTML = incantaLetters(list.map(m => m.name)).map(l => `<span class="incanta-letter focusable" tabindex="0" data-letter="${l}">${l}</span>`).join('');
                q('#incanta-letters').querySelectorAll('.incanta-letter').forEach(el => el.addEventListener('click', e => {
                    e.stopPropagation();
                    const row = q('#incanta-list').querySelector(`[data-letter="${el.dataset.letter}"]`);
                    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'start' });
                }));
                q('#incanta-list').innerHTML = list.map((m, i) => {
                    const ch = String(m.name || '').charAt(0).toUpperCase();
                    return `<div class="incanta-entry focusable${st.selected === m ? ' active' : ''}" tabindex="0" data-index="${i}" data-letter="${/[A-Z]/.test(ch) ? ch : '#'}">${incantaEsc(m.name)}</div>`;
                }).join('') || `<div class="incanta-empty">${T('Bestiary.noMonstersEncountered')}</div>`;
                q('#incanta-count').textContent = T_('count', { n: list.length });
                q('#incanta-list').querySelectorAll('.incanta-entry').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); show(list[parseInt(el.dataset.index, 10)]); }));
            };

            const show = (mon) => {
                dispose();
                st.selected = mon;
                q('#incanta-list').querySelectorAll('.incanta-entry').forEach(el => el.classList.remove('active'));
                const page = q('#incanta-page');
                if (!mon) { page.innerHTML = `<div class="incanta-welcome"><h2>${T_('welcomeTitle')}</h2><p>${T_('welcomeBody')}</p></div>`; return; }
                const archKey = window.Battler3D && window.Battler3D.resolveKey ? window.Battler3D.resolveKey(mon.enemy) : null;
                const has3D = can3D && !!archKey;
                page.innerHTML = this.articleHTML(mon, has3D);
                page.scrollTop = 0;
                renderList();
                if (has3D) {
                    const canvas = q('#incanta-3d');
                    st.view = buildBestiary3D(canvas, mon.enemy, archKey, this.seedFor(mon));
                    const btn = q('#incanta-reroll');
                    if (btn) btn.addEventListener('click', e => { e.stopPropagation(); this.reroll(mon); show(mon); });
                }
            };

            q('#incanta-find').addEventListener('input', e => { st.query = e.target.value; renderList(); });
            q('#incanta-find').addEventListener('keydown', e => e.stopPropagation());
            win.addEventListener('hypernet-closed', dispose);

            renderPages();
            renderList();
            show(null);
        }
    };

    function registerIncanta() {
        if (!window.HypernetOS || !window.HypernetOS.registerApp) return false;
        window.HypernetOS.registerApp({
            id: INCANTA_APP_ID,
            name: T('Bestiary.incanta.appName'),
            icon: 189,
            category: 'reference',
            launchFn: () => window.IncantaBestiary.launch(),
            desktopShortcut: true
        });
        return true;
    }
    if (!registerIncanta()) {
        const _Scene_Boot_create_incanta = Scene_Boot.prototype.create;
        Scene_Boot.prototype.create = function() {
            _Scene_Boot_create_incanta.call(this);
            registerIncanta();
        };
    }

})();