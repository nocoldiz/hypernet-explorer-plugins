/*:
 * @target MZ
 * @plugindesc Sandbox Mode plugin with Wishing System. [Claude+GPT]
 * @author Omni-Lex
 *
 * @help
 * SandboxMode.js
 * 
 * Provides a UI for Sandbox operations: start battles, give items, common events, etc.
 * Also includes a Wishing System based on PSI (Luck).
 *
 * @command openWishingSystem
 * @text Open Wishing System
 * @desc Opens the random wishes menu
 */

(() => {
    // A canvas bitmap can only be handed a colour string, so the few labels
    // drawn onto one read the theme's token instead of naming a hex here.
    function cssColor(token, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        return value || fallback;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Load MapInfos so we can read map names
    const _Scene_Boot_loadSystemImages = Scene_Boot.prototype.loadSystemImages;
    Scene_Boot.prototype.loadSystemImages = function () {
        _Scene_Boot_loadSystemImages.call(this);
        DataManager.loadDataFile('$dataMapInfos', 'MapInfos.json');
    };

    // =========================================================================
    //  Map tree (Teleport Map category)
    //  Mirrors the RPG Maker editor's map list: maps nest through MapInfos
    //  parentId, siblings keep the editor's `order`, and any map with children
    //  acts as a folder. Folders all start closed; the open set lives for the
    //  session only (never saved), so every fresh boot opens fully collapsed.
    // =========================================================================
    const _mapTreeOpen = new Set();

    // Flat depth-first list of every map row: { id, name, depth, parentId,
    // childCount, path }. Ancestors are checked against _mapTreeOpen at render
    // time, so this only has to be rebuilt when the category is re-entered.
    function buildMapTreeRows() {
        const rows = [];
        if (!window.$dataMapInfos) return rows;

        const childrenOf = new Map();
        const byId = new Map();
        for (let i = 1; i < $dataMapInfos.length; i++) {
            const info = $dataMapInfos[i];
            if (!isRealEntry(info)) continue;
            byId.set(info.id, info);
            const parent = info.parentId || 0;
            if (!childrenOf.has(parent)) childrenOf.set(parent, []);
            childrenOf.get(parent).push(info);
        }
        // Maps whose parent was filtered out (or never existed) would otherwise
        // be unreachable: hang them off the root instead of dropping them.
        for (const parent of Array.from(childrenOf.keys())) {
            if (parent !== 0 && !byId.has(parent)) {
                if (!childrenOf.has(0)) childrenOf.set(0, []);
                childrenOf.get(0).push(...childrenOf.get(parent));
                childrenOf.delete(parent);
            }
        }

        const sortSiblings = (a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id;
        const visited = new Set();
        const walk = (parentId, depth, ancestors, pathNames) => {
            const siblings = (childrenOf.get(parentId) || []).slice().sort(sortSiblings);
            for (const info of siblings) {
                // Guard against a malformed parentId cycle looping forever.
                if (visited.has(info.id)) continue;
                visited.add(info.id);
                const kids = childrenOf.get(info.id) || [];
                rows.push({
                    id: info.id,
                    name: info.name,
                    depth: depth,
                    parentId: parentId,
                    childCount: kids.length,
                    ancestors: ancestors,
                    path: pathNames.join(" / ")
                });
                if (kids.length) {
                    walk(info.id, depth + 1, ancestors.concat(info.id), pathNames.concat(info.name));
                }
            }
        };
        walk(0, 0, [], []);
        return rows;
    }

    function isMapFolderOpen(mapId) {
        return _mapTreeOpen.has(mapId);
    }

    // A row shows only when every folder above it is open.
    function isMapRowVisible(row) {
        return !row.ancestors || row.ancestors.every(id => _mapTreeOpen.has(id));
    }

    // A wish now spends the orb that opened the sanctum, so a sandbox run is
    // stocked with orbs the first time it is recognised: five wishes to test
    // with, rather than one destiny per playthrough.
    const SANDBOX_WISH_ORB = 697;      // Wish-Granting Orb
    const SANDBOX_WISH_ORB_COUNT = 5;

    function grantSandboxWishOrbs() {
        if (!window.$gameSystem || !window.$gameParty || !window.$dataItems) return;
        if ($gameSystem._sandboxWishOrbsGiven) return;
        const orb = $dataItems[SANDBOX_WISH_ORB];
        if (!orb) return;
        $gameSystem._sandboxWishOrbsGiven = true;
        $gameParty.gainItem(orb, SANDBOX_WISH_ORB_COUNT);
    }

    // The vector gun is Em's in the story; the sandbox is for trying things, so
    // it is handed to the leader once and its screen opens with it. The gun's
    // own plugin owns which weapon that is and who may hold it.
    function grantSandboxVectorGun() {
        if (!window.VectorGun || !window.$gameSystem || !window.$gameParty) return;
        if ($gameSystem._sandboxVectorGunGiven) return;
        const gun = window.VectorGun.gunData();
        if (!gun) return;
        $gameSystem._sandboxVectorGunGiven = true;
        $gameParty.gainItem(gun, 1);
        const leader = $gameParty.leader();
        if (leader && leader.canEquip(gun)) leader.changeEquip(0, gun);
    }

    // Check if player name is Test (or Party) to enable Sandbox mode. Run from
    // both the pause menu AND every map start, so the "Party" full-randomize
    // override fires as soon as the name takes effect (character creation,
    // an in-game rename, ...) rather than only once the player opens the menu.
    function applySandboxNameOverrides() {
        const leader = $gameParty && $gameParty.leader();
        const leaderName = leader ? leader.name().toLowerCase() : "";
        if (leaderName === "test") {
            $gameSystem._isSandboxMode = true;
            // Build a random party from the arena party generator at a random level 1-99.
            // Only runs once per session (the guard prevents re-randomizing on every check).
            if (!$gameSystem._sandboxPartyGenerated && window.ArenaBattleHandler) {
                const randomLevel = Math.floor(Math.random() * 99) + 1;
                ArenaBattleHandler.buildRandomParty(randomLevel, randomLevel);
                $gameSystem._sandboxPartyGenerated = true;
            }
        } else if (leaderName === "party") {
            $gameSystem._isSandboxMode = true;
            // Build a full 3-member party through the character creator's own
            // randomization (npc:true sprite + name, random class, traits with
            // their equipment, class-compatible weapon + armor, starter skills)
            // at a single random level 1-20, plus a proper starting purse.
            // Only runs once per session.
            if (!$gameSystem._sandboxPartyGenerated && window.CharacterCreationParty) {
                const randomLevel = Math.floor(Math.random() * 20) + 1;
                window.CharacterCreationParty.randomizeFullParty(randomLevel, 3);
                $gameSystem._sandboxPartyGenerated = true;
            }
        }
        if ($gameSystem && $gameSystem._isSandboxMode) {
            grantSandboxWishOrbs();
            grantSandboxVectorGun();
        }
    }

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        if ($gameParty && $gameSystem) applySandboxNameOverrides();
        _Scene_Menu_createCommandWindow.call(this);
    };

    // Also checked on every map start (new game, load, scene return), so the
    // "Party" party-build fires without the player ever opening the menu.
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        if ($gameParty && $gameSystem) applySandboxNameOverrides();
        _Scene_Map_start.call(this);
    };

    // =========================================================================
    // Resources Loader
    // =========================================================================
    function loadUIResources() {


    }

    // =========================================================================
    //  Sandbox Category Mapping
    // =========================================================================
    const CATEGORIES = [
        // Shortcut to the sandbox hub map (same spot every sandbox run starts on).
        { name: "Go to Disk of Discord", symbol: "discord", icon: 88 },
        { name: "Start Battle", symbol: "battle", icon: 96 },
        { name: "Give Item/Equipment", symbol: "item", icon: 273 },
        { name: "Start Common Event", symbol: "event", icon: 191 },
        { name: "Teleport Map", symbol: "map", icon: 310 },
        { name: "Teleport to Planet", symbol: "planet", icon: 84 },
        // The 3D world, opened on any of the alien biomes without flying there:
        // one biome from pole to pole, walked on foot (see voxelPlanetBiomes).
        { name: "3D Planet Walk", symbol: "voxelplanet", icon: 245 },
        { name: "Variables", symbol: "variables", icon: 236 },
        { name: "Switches", symbol: "switches", icon: 84 },
        { name: "Player Attributes", symbol: "player", icon: 263 },
        { name: "Time & Environment", symbol: "environment", icon: 69 },
        { name: "Biology & Survival", symbol: "biology", icon: 265 },
        { name: "Economy & Assets", symbol: "economy", icon: 89 },
        { name: "Factions & Army", symbol: "faction", icon: 410 },
        { name: "World Generation", symbol: "world", icon: 245 },
        { name: "Minigames & Hobbies", symbol: "minigame", icon: 226 },
        { name: "Quick Actions", symbol: "macro", icon: 218 },
        { name: "Add/Remove Status", symbol: "status", icon: 104 },
        { name: "NPC Manipulation", symbol: "npc", icon: 82 },
        // The date board: pick the biome (and the mood) the evening runs in
        // instead of walking to one. Player-facing prose, so it carries a key.
        { nameKey: "ErisDate.sandbox.menu", symbol: "erisdate", icon: 84 },
        { name: "Skill Animation Test", symbol: "animtest", icon: 79 },
        // Direct openers for whole systems that had no sandbox hook before:
        // star map, bestiary, quest log, tech tree, history archive, thinker,
        // apiary, brewery, containers, work board and the online shop.
        { name: "Systems & Menus", symbol: "systems", icon: 231 },
        // Full Wishing Sanctum (same flow as the openWishingSystem command).
        { name: "Wishing System", symbol: "wish", icon: 87 }
    ];

    // =========================================================================
    //  The 3D world, opened on any alien biome
    // =========================================================================
    // The star map only offers the walk on a world the ship is actually in
    // orbit of. Here every alien biome in the game is a row, so a world of any
    // type can be stood on without flying to one first.
    function voxelPlanetBiomes() {
        const list = (window.WorldGen && window.WorldGen.Biomes) || [];
        return list.filter(b => b && typeof b.name === "string" && /^Alien/.test(b.name))
                   .sort((a, b) => a.name.localeCompare(b.name));
    }

    // What the row reads as: the biome's own display name where it has one,
    // and the raw name (minus the "Alien" it all shares) where it has not.
    function voxelPlanetLabel(biome) {
        if (window.BiomeNames) {
            const shown = window.BiomeNames.display(biome.name);
            if (shown && shown !== biome.name) return shown;
        }
        return biome.name.replace(/^Alien/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
    }

    // Open the 3D world on one. The planet a biome belongs to is looked up the
    // other way round - PlanetTypes says which biome each type wears - so the
    // sky, the gravity and the day length are that world's own rather than
    // Earth's. A type with no roster has nothing roaming it, which is the
    // honest answer for a rock.
    function startVoxelPlanetWalk(biomeName) {
        const VW = window.VoxelWorldSystem;
        if (!VW || !VW.startAlienWalk) return false;
        const biome = voxelPlanetBiomes().find(b => b.name === biomeName);
        if (!biome) return false;

        const GS = window.GalaxySim || null;
        const PT = (GS && GS.PlanetTypes) || {};
        const type = Object.keys(PT).find(k => PT[k] && PT[k].biome === biomeName) || null;

        let planet = { name: voxelPlanetLabel(biome), type: type || "rocky", moons: [] };
        let species = null;
        if (GS && type) {
            try {
                if (GS.planetHasLife && GS.planetHasLife(planet) && GS.alienSpeciesRoster) {
                    species = (GS.alienSpeciesRoster(planet) || [])
                        .map(sp => sp.enemyId).filter(id => id > 0);
                    if (!species.length) species = null;
                }
            } catch (e) { species = null; }
            try {
                if (GS.makeLandedDescriptor) planet = GS.makeLandedDescriptor(planet, {}) || planet;
            } catch (e) { /* the plain descriptor still names the place */ }
        }
        return !!VW.startAlienWalk(biome, planet, species);
    }

    // The readable name of a biome, through the one service that prints them,
    // falling back to the name the date itself puts on its own badge.
    function sandboxBiomeLabel(key) {
        if (!key) return "";
        if (window.BiomeNames) return window.BiomeNames.display(key);
        const eris = window.ErisDateSystem;
        return eris ? eris.biomeLabel(key) : String(key);
    }

    // A category label. Debug categories are written straight into the table;
    // one whose label is prose the player also reads elsewhere carries a key
    // instead, resolved when the page is drawn (the i18n tables are not loaded
    // yet when this table is built).
    function categoryName(cat) {
        if (!cat) return "";
        return cat.nameKey && window.T ? T(cat.nameKey) : cat.name;
    }

    // How many categories stand on one row of the left-page grid. Every index
    // the cursor carries is an index into sortedCategories(), so the grid and
    // the keyboard read the same order.
    const CATEGORY_COLUMNS = 3;

    // The categories in the order the page draws them: alphabetical by the name
    // the player actually reads, so a translated label sorts under its own
    // letter. Memoised per language, since resolving the keys costs a lookup
    // each and the order only moves when the language does.
    let _sortedCategories = null;
    let _sortedCategoriesLang = null;
    function sortedCategories() {
        const lang = ConfigManager ? ConfigManager.language : "en";
        if (_sortedCategories && _sortedCategoriesLang === lang) return _sortedCategories;
        _sortedCategoriesLang = lang;
        _sortedCategories = CATEGORIES.slice().sort((a, b) =>
            categoryName(a).localeCompare(categoryName(b), lang || undefined));
        return _sortedCategories;
    }

    // Where a category stands in the drawn order (0 when it is not listed, so a
    // stale symbol lands on the first tile rather than off the grid).
    function categoryIndexOf(symbol) {
        const idx = sortedCategories().findIndex(c => c.symbol === symbol);
        return idx < 0 ? 0 : idx;
    }

    // The category the sandbox opens on: the first entry of the authored table
    // (the Disk of Discord shortcut), wherever the alphabet has since put it.
    function defaultCategoryIndex() {
        return categoryIndexOf(CATEGORIES[0].symbol);
    }

    // =========================================================================
    //  Export Procedural Map (World Generation category)
    // -------------------------------------------------------------------------
    //  Writes one PNG per world square into `mapshot/` beside the game, named
    //  after the square's world coordinates, plus an index.json describing what
    //  each one is. The folder is gitignored: these are working pictures for
    //  looking at generation output, not assets.
    //
    //  A square is captured the only way a picture of a whole map can be taken:
    //  it has to be the loaded map. So the export walks the block one square at
    //  a time, generating and transferring to each in turn, and snapshots after
    //  the tilemap has drawn. OrangeMapshotMZ owns that drawing (it is what
    //  "mapshot" means in this project) and is used for it here rather than
    //  reimplemented.
    //
    //  Stitching is switched OFF for the run. A stitched window is up to nine
    //  squares laid into one map, and a picture of that filed under one square's
    //  coordinates would be a picture of eight others too.
    // =========================================================================

    // The block sizes offered, in squares per side. Odd, because the block is
    // centred on the square the party is standing on.
    const MAPSHOT_SIZES = [1, 3, 5, 9];
    let mapshotSize = 3;

    function mapshotSizeLabel() {
        const n = mapshotSize * mapshotSize;
        return `Mapshot Area: ${mapshotSize} x ${mapshotSize} (${n} square${n === 1 ? "" : "s"})`;
    }

    function cycleMapshotSize() {
        const i = MAPSHOT_SIZES.indexOf(mapshotSize);
        mapshotSize = MAPSHOT_SIZES[(i + 1) % MAPSHOT_SIZES.length];
    }

    // `mapshot/` beside the game's own directory, the same root ModManager reads
    // its mods out of. Null when there is no filesystem to write to (a browser
    // build), which is the one condition the caller has to refuse on.
    function mapshotDir() {
        if (!Utils.isNwjs()) return null;
        try {
            const path = require("path");
            return path.join(path.dirname(process.mainModule.filename), "mapshot");
        } catch (e) {
            return null;
        }
    }

    // The block of world squares to capture: mapshotSize per side, centred on
    // the party, clipped to the world map and walked in a boustrophedon so
    // consecutive squares are always neighbours.
    function mapshotBlock(centreX, centreY) {
        const reach = (mapshotSize - 1) / 2;
        // The world map is 256 squares each way. There is nowhere to read that
        // off at this point -- $dataMapInfos carries no dimensions and map 315
        // is not the loaded map -- and the rest of the generator assumes the
        // same number, so it is spelled once here and clipped against.
        const WORLD_SIDE = 256;

        const coords = [];
        for (let dx = -reach; dx <= reach; dx++) {
            const x = centreX + dx;
            if (x < 0 || x >= WORLD_SIDE) continue;
            const column = [];
            for (let dy = -reach; dy <= reach; dy++) {
                const y = centreY + dy;
                if (y < 0 || y >= WORLD_SIDE) continue;
                column.push({ x, y });
            }
            // Serpentine: every other column runs the other way, so the last
            // square of one column touches the first of the next.
            if ((dx + reach) % 2 === 1) column.reverse();
            coords.push(...column);
        }
        return coords;
    }

    // What the index records about a square. Everything here is read off the
    // procgen record the square was just built from, so it describes the picture
    // sitting next to it rather than whatever the party walked on afterwards.
    function mapshotRecord(x, y) {
        const pg = ($gameSystem && $gameSystem._procGenData) || {};
        const rec = {
            x, y,
            file: `${x},${y}.png`,
            biome: pg.currentBiome || null,
            tilesetId: pg.currentBiomeTileset || null,
            roadDirection: pg.currentRoadDirection || null,
            underBiome: pg.currentUnderBiome || null,
            displayAsBeach: !!pg.displayAsBeach,
            displayAsIsland: !!pg.displayAsIsland,
        };
        if (window.BiomeNames && rec.biome) {
            const shown = window.BiomeNames.display(rec.biome);
            if (shown && shown !== rec.biome) rec.name = shown;
        }
        return rec;
    }

    // Build the square at (x, y) and make it the loaded map. Answers false when
    // the generator could not resolve it, which is a square the export skips
    // rather than a run it abandons.
    function mapshotGoToSquare(x, y) {
        if (!$gameSystem.generateProceduralMap) return false;
        $gameVariables.setValue(43, x);
        $gameVariables.setValue(44, y);
        if (!$gameSystem.generateProceduralMap()) return false;
        const WM = window.WorldMapReturn;
        const procId = (WM && WM.procMapId) || 636;
        // The middle of the square, so nothing about where the party stands
        // depends on which direction the previous square was left in.
        const U = window.ProcGenUtils;
        const midX = Math.floor(((U && U.PROC_MAP_WIDTH) || 64) / 2);
        const midY = Math.floor(((U && U.PROC_MAP_HEIGHT) || 64) / 2);
        $gamePlayer.reserveTransfer(procId, midX, midY, 2, 0);
        return true;
    }

    // Write every layer OrangeMapshotMZ hands back for the current map. One
    // layer is the whole picture; more than one means the plugin is configured
    // to split them, and they are suffixed rather than overwriting each other.
    function mapshotWriteCurrent(dir, x, y, done) {
        const OM = window.OrangeMapshotMZ;
        const fs = require("fs");
        const path = require("path");
        let snaps = null;
        try {
            snaps = OM.getMapshot();
        } catch (e) {
            console.error(`[Mapshot] (${x},${y}) could not be drawn:`, e);
            return done(false);
        }
        if (!snaps || !snaps.length) return done(false);

        const ext = OM.fileExtension();
        const regex = OM.imageRegex();
        let pending = snaps.length;
        let ok = true;
        for (let i = 0; i < snaps.length; i++) {
            const suffix = snaps.length > 1 ? `_layer${i}` : "";
            const file = path.join(dir, `${x},${y}${suffix}${ext}`);
            const data = snaps[i].canvas
                .toDataURL(OM.imageType(), OM.imageQuality())
                .replace(regex, "");
            fs.writeFile(file, data, "base64", (err) => {
                if (err) {
                    ok = false;
                    console.error(`[Mapshot] (${x},${y}) could not be written:`, err);
                }
                if (--pending <= 0) done(ok);
            });
        }
    }

    // Is the export able to run at all? Answers the reason it is not, so the
    // caller can say it rather than failing silently.
    function mapshotBlocker() {
        if (!Utils.isNwjs()) return "Mapshots can only be written from the desktop build.";
        if (!window.OrangeMapshotMZ || !window.OrangeMapshotMZ.getMapshot) {
            return "OrangeMapshotMZ is not loaded, so no picture can be drawn.";
        }
        if (!mapshotDir()) return "The game folder could not be found.";
        const WM = window.WorldMapReturn;
        const procId = (WM && WM.procMapId) || 636;
        if (!$gameMap || $gameMap.mapId() !== procId) {
            return "Stand on a procedural map first: the export captures world squares.";
        }
        return null;
    }

    // A run is one at a time, and it survives the sandbox menu closing (the menu
    // is torn down before the first transfer), so its state lives here.
    let mapshotRun = null;

    function mapshotToast(text) {
        if (window.ParchmentToast && window.ParchmentToast.show) {
            window.ParchmentToast.show(text);
        } else {
            console.log(`[Mapshot] ${text}`);
        }
    }

    // Start an export centred on the party's square. Runs from Scene_Map, one
    // square per map load, and puts the party back where it started.
    function startMapshotExport() {
        const blocked = mapshotBlocker();
        if (blocked) { mapshotToast(blocked); return false; }
        if (mapshotRun) { mapshotToast("A mapshot export is already running."); return false; }

        const fs = require("fs");
        const path = require("path");
        const dir = mapshotDir();
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            mapshotToast("mapshot/ could not be created.");
            console.error("[Mapshot]", e);
            return false;
        }

        const homeX = $gameVariables.value(43);
        const homeY = $gameVariables.value(44);
        const coords = mapshotBlock(homeX, homeY);
        if (!coords.length) { mapshotToast("No world squares in that block."); return false; }

        const Stitch = window.ProcStitch;
        const wasDisabled = Stitch ? Stitch.isDisabled() : false;
        if (Stitch) Stitch.setDisabled(true);

        mapshotRun = {
            dir, coords, index: 0, written: 0, skipped: 0,
            homeX, homeY, wasDisabled,
            records: [],
            startedAt: Date.now(),
            // Set while a square is being waited on, so the map-loaded hook only
            // fires for a square this run asked for.
            awaiting: null,
        };
        mapshotToast(`Exporting ${coords.length} square${coords.length === 1 ? "" : "s"} to mapshot/`);
        mapshotNext();
        return true;
    }

    function mapshotNext() {
        const run = mapshotRun;
        if (!run) return;
        if (run.index >= run.coords.length) return mapshotFinish();

        const coord = run.coords[run.index++];
        run.awaiting = coord;
        if (!mapshotGoToSquare(coord.x, coord.y)) {
            run.awaiting = null;
            run.skipped++;
            console.warn(`[Mapshot] (${coord.x},${coord.y}) could not be generated; skipped`);
            mapshotNext();
        }
    }

    // Called once the transferred-to square has drawn. The extra frames are the
    // same wait the FullDebug sweep takes: the tilemap paints over a couple of
    // frames after the scene reports itself loaded, and a picture taken before
    // that is a picture of a half-drawn map.
    function mapshotOnSquareLoaded() {
        const run = mapshotRun;
        if (!run || !run.awaiting) return;
        const coord = run.awaiting;
        run.awaiting = null;
        const record = mapshotRecord(coord.x, coord.y);
        setTimeout(() => {
            if (!mapshotRun) return;
            const scene = SceneManager._scene;
            if (!scene || !scene._spriteset || !scene._spriteset._tilemap) {
                run.skipped++;
                console.warn(`[Mapshot] (${coord.x},${coord.y}) had no tilemap; skipped`);
                return mapshotNext();
            }
            mapshotWriteCurrent(run.dir, coord.x, coord.y, (ok) => {
                if (!mapshotRun) return;
                if (ok) { run.written++; run.records.push(record); }
                else run.skipped++;
                mapshotNext();
            });
        }, 300);
    }

    function mapshotFinish() {
        const run = mapshotRun;
        if (!run) return;
        mapshotRun = null;

        // The index is rewritten whole from what is on disk plus this run, so a
        // second export over the same folder extends it instead of replacing it.
        try {
            const fs = require("fs");
            const path = require("path");
            const file = path.join(run.dir, "index.json");
            let previous = [];
            if (fs.existsSync(file)) {
                try {
                    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
                    if (Array.isArray(parsed.squares)) previous = parsed.squares;
                } catch (e) { previous = []; }
            }
            const byCoord = new Map();
            for (const rec of previous) byCoord.set(`${rec.x},${rec.y}`, rec);
            for (const rec of run.records) byCoord.set(`${rec.x},${rec.y}`, rec);
            const squares = [...byCoord.values()].sort((a, b) => a.x - b.x || a.y - b.y);
            fs.writeFileSync(file, JSON.stringify({
                worldSeed: (window.ProcGenUtils && window.ProcGenUtils.getWorldSeed)
                    ? window.ProcGenUtils.getWorldSeed() : null,
                squares,
            }, null, 2), "utf8");
        } catch (e) {
            console.error("[Mapshot] index.json could not be written:", e);
        }

        const Stitch = window.ProcStitch;
        if (Stitch && !run.wasDisabled) Stitch.setDisabled(false);

        const secs = Math.round((Date.now() - run.startedAt) / 100) / 10;
        console.log(`[Mapshot] ${run.written} written, ${run.skipped} skipped, ${secs}s -> ${run.dir}`);
        mapshotToast(
            `Mapshot: ${run.written} written` +
            (run.skipped ? `, ${run.skipped} skipped` : "") + " to mapshot/"
        );

        // Home again, on the square the export was started from.
        mapshotGoToSquare(run.homeX, run.homeY);
    }

    // The one hook the run needs: every arrival on a procedural square while a
    // run is waiting for one is the square it was waiting for.
    const _Mapshot_Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Mapshot_Scene_Map_onMapLoaded.call(this);
        if (mapshotRun && mapshotRun.awaiting) mapshotOnSquareLoaded();
    };

    // The export, reachable from outside the menu that offers it: the same
    // entry point a plugin command or the console would want, and the seam
    // test/test_mapshot_export.js drives.
    window.SandboxMapshot = {
        start: startMapshotExport,
        // Why the export cannot run here, or null when it can.
        blocker: mapshotBlocker,
        // Where the pictures go.
        directory: mapshotDir,
        // The block of world squares an export centred on (x, y) would capture,
        // in the order it would walk them.
        block: mapshotBlock,
        size() { return mapshotSize; },
        setSize(n) { if (MAPSHOT_SIZES.includes(n)) mapshotSize = n; return mapshotSize; },
        sizes: MAPSHOT_SIZES.slice(),
        cycleSize: cycleMapshotSize,
        label: mapshotSizeLabel,
        running() { return !!mapshotRun; },
    };

    // =========================================================================
    //  NPC Manipulation actions (see Scene_SandboxMenu.applyNpcAction).
    //  A single flat list; each action runs against the current target scope
    //  (single facing NPC or every NPC on the map), toggled by the first entry.
    // =========================================================================
    const NPC_ACTIONS = [
        { id: "npc_target_toggle", name: "Target" },
        { id: "npc_mood_elated", name: "Mood: Elated (needs full)" },
        { id: "npc_mood_content", name: "Mood: Content" },
        { id: "npc_mood_miserable", name: "Mood: Miserable (needs empty)" },
        { id: "npc_romance_break", name: "Romance: Break up" },
        { id: "npc_romance_add", name: "Romance: Start dating (auto-pair)" },
        { id: "npc_orient_randomize", name: "Orientation: Randomize (recalc Kinsey)" },
        { id: "npc_orient_hetero", name: "Orientation: Heterosexual" },
        { id: "npc_orient_homo", name: "Orientation: Homosexual" },
        { id: "npc_orient_bi", name: "Orientation: Bisexual" },
        { id: "npc_orient_ace", name: "Orientation: Asexual" },
        { id: "npc_bounty_clear", name: "Bounty: Clear" },
        { id: "npc_bounty_add", name: "Bounty: +5,000" },
        { id: "npc_bounty_max", name: "Bounty: Max (99,999)" },
        { id: "npc_health_infect", name: "Health: Infect random disease" },
        { id: "npc_health_condition", name: "Health: Add random condition" },
        { id: "npc_health_cure", name: "Health: Cure all illnesses & conditions" },
        { id: "npc_body_remove", name: "Body: Sever random limb/organ" },
        { id: "npc_body_regen", name: "Body: Regenerate all parts" }
    ];

    // Cached orientation DB (mirrors NPCEmpathizeUI's private loader).
    let _sandboxOrientDb = null;
    function loadOrientationDb() {
        if (_sandboxOrientDb === null) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', 'js/db/NPC/Orientations.json', false);
                xhr.send();
                _sandboxOrientDb = (xhr.status === 200 || xhr.status === 0)
                    ? JSON.parse(xhr.responseText) : {};
            } catch (e) {
                console.warn('[SandboxMode] failed to load Orientations.json', e);
                _sandboxOrientDb = {};
            }
        }
        return _sandboxOrientDb;
    }

    // =========================================================================
    // UISandboxInputManager for Dual Pockets Navigation
    // =========================================================================
    class UISandboxInputManager {
        static init(container, scene) {
            this.container = container;
            this.scene = scene;
            this.active = false;
            this._categoryItems = [];
            this._actionItems = [];
        }

        // Cache the item NodeLists so update()/updateFocus() don't re-query the
        // DOM every frame; only re-run after a DOM rebuild (via activate()).
        static refreshCache() {
            this._categoryItems = Array.from(this.container.querySelectorAll('.category-item'));
            this._actionItems = Array.from(this.container.querySelectorAll('.action-item'));
        }

        static activate() {
            this.active = true;
            this.refreshCache();
            this.updateFocus();
        }

        static deactivate() {
            this.active = false;
        }

        static update() {
            if (!this.active) return;

            // A granted wish holds the sanctum on its card until the hold runs
            // out; any key or click dismisses it sooner. Nothing else is read,
            // so a second destiny can never be picked.
            if (this.scene._wishGranted) {
                const readable = Date.now() - (this.scene._wishGrantedAt || 0) > WISH_GRANT_GRACE;
                if (readable && (Input.isTriggered('ok') || Input.isTriggered('cancel') ||
                    TouchInput.isTriggered() || TouchInput.isCancelled())) {
                    this.scene.finishWish();
                }
                return;
            }

            const isWish = this.scene._isWishMode;
            const onLeft = this.scene._activeLeftFocus && !isWish;

            let moved = false;
            let list = [];
            let index = 0;

            if (onLeft) {
                list = this._categoryItems;
                index = this.scene._focusedCategoryIndex;
            } else {
                list = this._actionItems;
                index = this.scene._focusedActionIndex;
            }

            // Cancel (Esc/right-click) is checked before the empty-list guard so
            // the menu can always be backed out of, even when a search filters
            // every entry out of the active list.
            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                SoundManager.playCancel();
                if (isWish) {
                    this.scene.exitWish();
                } else if (onLeft) {
                    this.scene.popScene();
                } else {
                    this.scene._activeLeftFocus = true;
                    this.scene._focusedActionIndex = 0;
                    this.scene.refreshUIDOM();
                }
                return;
            }

            const len = list.length;
            if (len === 0) return;

            // The left page is a grid, so up/down step a whole row there while
            // the right page stays a single column; both are clamped rather than
            // wrapped on the grid, or a step down off the last row would land on
            // a different column.
            const step = onLeft ? CATEGORY_COLUMNS : 1;
            if (Input.isTriggered('down') || Input.isRepeated('down')) {
                index = onLeft ? Math.min(len - 1, index + step) : (index + 1) % len;
                moved = index !== (onLeft ? this.scene._focusedCategoryIndex : this.scene._focusedActionIndex);
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                index = onLeft ? Math.max(0, index - step) : (index - 1 + len) % len;
                moved = index !== (onLeft ? this.scene._focusedCategoryIndex : this.scene._focusedActionIndex);
            } else if (onLeft && (Input.isTriggered('right') || Input.isRepeated('right'))) {
                index = Math.min(len - 1, index + 1);
                moved = index !== this.scene._focusedCategoryIndex;
            } else if (onLeft && (Input.isTriggered('left') || Input.isRepeated('left'))) {
                index = Math.max(0, index - 1);
                moved = index !== this.scene._focusedCategoryIndex;
            } else if (Input.isTriggered('ok')) {
                const item = list[index];
                if (item) {
                    SoundManager.playOk();
                    item.click();
                }
                return;
            } else if (!onLeft && this.scene._listWindow._mode === "map" &&
                (Input.isTriggered('right') || Input.isTriggered('left'))) {
                // Teleport Map is a folder tree: left/right fold the branches
                // instead of doing nothing (OK still teleports to the map).
                this.scene.handleMapTreeArrow(Input.isTriggered('right') ? 1 : -1);
                return;
            }

            if (moved) {
                SoundManager.playCursor();
                this.scene._searchFocusActive = false;
                const searchInput = document.getElementById("sandbox-search");
                if (searchInput) searchInput.blur();

                if (onLeft) {
                    this.scene._focusedCategoryIndex = index;
                    const symbol = sortedCategories()[index].symbol;
                    this.scene._listWindow.setMode(symbol);
                    this.scene._focusedActionIndex = 0;
                    // Category change only affects the right-page actions list;
                    // rebuild just that instead of the whole overlay.
                    this.scene.refreshActionsListDOM();
                } else {
                    this.scene._focusedActionIndex = index;
                    this.updateFocus();
                }
            }
        }

        static updateFocus() {
            const isWish = this.scene._isWishMode;
            const onLeft = this.scene._activeLeftFocus && !isWish;

            const categoryList = this._categoryItems;
            categoryList.forEach((el, idx) => {
                if (onLeft && idx === this.scene._focusedCategoryIndex) {
                    el.classList.add('selected');
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.classList.remove('selected');
                }
            });

            const actionList = this._actionItems;
            actionList.forEach((el, idx) => {
                if (!onLeft && idx === this.scene._focusedActionIndex) {
                    el.classList.add('selected');
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.classList.remove('selected');
                }
            });
        }
    }

    // =========================================================================
    // Scene_SandboxMenu Parchment Overhaul
    // =========================================================================
    function Scene_SandboxMenu() {
        this.initialize(...arguments);
    }

    Scene_SandboxMenu.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_SandboxMenu.prototype.constructor = Scene_SandboxMenu;
    window.Scene_SandboxMenu = Scene_SandboxMenu;

    // How long the granted-wish card is held before the sanctum closes itself,
    // and how long it ignores input first (the press that picked the destiny is
    // still being read this frame). Any key or click closes it sooner after
    // that (see UISandboxInputManager.update).
    const WISH_GRANT_HOLD = 3200;
    const WISH_GRANT_GRACE = 500;

    Scene_SandboxMenu.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        // A wish is spent the moment it is granted: the sanctum shows what was
        // whispered and then closes. Without these the destinies list stayed on
        // screen after a grant and a single orb bought every wish in it.
        this._wishGranted = false;
        this._wishFinished = false;
        this._wishCloseTimer = null;
    };

    Scene_SandboxMenu.prototype.create = function () {
        loadUIResources();
        Scene_MenuBase.prototype.create.call(this);

        // Hide MZ legacy layers
        if (this._windowLayer) {
            this._windowLayer.visible = false;
        }
        if (this._cancelButton) {
            this._cancelButton.visible = false;
        }

        const startMode = $gameTemp._sandboxStartMode;
        this._isWishMode = startMode === "wish";

        this.createCommandWindow();
        this.createListWindow();

        if (this._isWishMode) {
            this._listWindow.setMode("wish");
            $gameTemp._sandboxStartMode = null;
            this._activeLeftFocus = false;
        } else {
            this._listWindow.setMode(CATEGORIES[0].symbol); // Default category
            this._activeLeftFocus = true;
        }

        this._focusedCategoryIndex = this._isWishMode ? 0 : defaultCategoryIndex();
        this._focusedActionIndex = 0;
        this._searchQuery = "";
        this._searchFocusActive = false;
        this._searchOpen = false;

        this.createUIDOM();
    };

    Scene_SandboxMenu.prototype.removeUIContainer = function () {
        if (this._dndContainer) {
            const container = this._dndContainer;
            container.style.transition = "opacity 0.2s ease-out";
            container.style.opacity = "0";
            container.style.pointerEvents = "none";
            setTimeout(() => {
                if (container && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 200);
            this._dndContainer = null;
        }
    };

    Scene_SandboxMenu.prototype.terminate = function () {
        Scene_MenuBase.prototype.terminate.call(this);
        UISandboxInputManager.deactivate();
        if (this._wishCloseTimer) {
            clearTimeout(this._wishCloseTimer);
            this._wishCloseTimer = null;
        }
        this.removeUIContainer();
    };

    Scene_SandboxMenu.prototype.createCommandWindow = function () {
        const rect = new Rectangle(0, 0, 0, 0);
        this._commandWindow = new Window_SandboxCommand(rect);
        this._commandWindow.visible = false;
        this.addWindow(this._commandWindow);
    };

    Scene_SandboxMenu.prototype.createListWindow = function () {
        const rect = new Rectangle(0, 0, 0, 0);
        this._listWindow = new Window_SandboxList(rect);
        this._listWindow.visible = false;
        this.addWindow(this._listWindow);
    };

    Scene_SandboxMenu.prototype.createUIDOM = function () {
        this._dndContainer = document.createElement('div');
        this._dndContainer.id = 'menu-container';
        // Right-click is the mouse cancel/close gesture (TouchInput.isCancelled),
        // so the native browser context menu must not open over the overlay.
        this._dndContainer.oncontextmenu = () => false;
        document.body.appendChild(this._dndContainer);

        // Mouse-wheel scrolling: move the selection cursor for whichever list the
        // pointer is over. The container element persists across refreshUIDOM()
        // (only its innerHTML is rebuilt), so this listener stays attached.
        this._wheelHandler = (e) => this.handleWheelScroll(e);
        this._dndContainer.addEventListener('wheel', this._wheelHandler, { passive: false });

        UISandboxInputManager.init(this._dndContainer, this);
        this.refreshUIDOM();
    };

    Scene_SandboxMenu.prototype.handleWheelScroll = function (e) {
        const dir = e.deltaY > 0 ? 1 : -1;
        const overCategories = e.target.closest && e.target.closest('.categories-list');
        const overActions = e.target.closest && e.target.closest('.actions-list-container');

        if (this._isWishMode) {
            // Wish mode only has the right-page destinies list.
            this.moveActionFocus(dir);
            e.preventDefault();
        } else if (overCategories) {
            this.moveCategoryFocus(dir);
            e.preventDefault();
        } else if (overActions) {
            this.moveActionFocus(dir);
            e.preventDefault();
        }
    };

    // Step the left-page category cursor (clamped, no wrap) and rebuild the
    // right-page actions list to match, mirroring keyboard navigation.
    Scene_SandboxMenu.prototype.moveCategoryFocus = function (dir) {
        if (this._isWishMode) return;
        const cats = sortedCategories();
        const len = cats.length;
        const idx = Math.max(0, Math.min(len - 1, this._focusedCategoryIndex + dir));
        if (idx === this._focusedCategoryIndex) return;
        this._activeLeftFocus = true;
        this._searchFocusActive = false;
        this._focusedCategoryIndex = idx;
        this._focusedActionIndex = 0;
        this._listWindow.setMode(cats[idx].symbol);
        SoundManager.playCursor();
        this.refreshActionsListDOM();
        UISandboxInputManager.updateFocus();
    };

    // Step the right-page action cursor (clamped, no wrap).
    Scene_SandboxMenu.prototype.moveActionFocus = function (dir) {
        const len = UISandboxInputManager._actionItems.length;
        if (len === 0) return;
        const idx = Math.max(0, Math.min(len - 1, this._focusedActionIndex + dir));
        if (idx === this._focusedActionIndex && this._activeLeftFocus === false) return;
        this._activeLeftFocus = false;
        this._searchFocusActive = false;
        this._focusedActionIndex = idx;
        SoundManager.playCursor();
        UISandboxInputManager.updateFocus();
    };

    Scene_SandboxMenu.prototype.refreshUIDOM = function () {
        if (!this._dndContainer) return;
        // A granted wish owns the page until the sanctum closes; nothing the
        // outcome itself triggers may redraw the destinies list under it.
        if (this._wishGranted) return;

        const useTranslation = ConfigManager.language === "it";
        const backBtnText = useTranslation ? "Indietro" : "Back";
        const wishTitle = useTranslation ? "Santuario dei Desideri" : "Wishing Sanctum";
        const sandboxTitle = useTranslation ? "Sandbox Alchemico" : " Sandbox";

        const isWish = this._isWishMode;

        // What the fauna is currently scaled to: the biome's band
        // (BattleSystemEnhancedEncounters, section 4b) plus the year-driven
        // spawn era.
        const BSEH = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
        const spawnEra = BSEH && BSEH.getSpawnEra ? BSEH.getSpawnEra() : null;
        const spawnModeLabel = BSEH && BSEH.getSpawnMode ? "Biome" : "?";
        const eraLabel = spawnEra
            ? `${Math.floor(spawnEra.year)}${spawnEra.eliteMin ? ` (Lv. ${spawnEra.eliteMin}+ mixed in)` : ""}`
            : "?";
        // The ground itself carries a level, and it is the one number that
        // explains what the map is pitched at. Print the whole measurement:
        // where the party began, how far out they are of how far they can get,
        // and what that lands on inside the gradient.
        // BSEH.describePlace() reports the same object to the console.
        let placeLabel = "";
        if (BSEH && BSEH.describePlace) {
            const p = BSEH.describePlace();
            placeLabel = p.offWorld
                ? "off Earth (the world it sits in decides)"
                : `Lv. ${p.placeLevel} (${p.floorLevel}-${p.ceilingLevel}), ` +
                  `${p.distance}/${p.maxDistance} tiles from ${p.anchor.x},${p.anchor.y}`;
        }

        let leftPageHTML = "";
        if (isWish) {
            leftPageHTML = `
                <div class="left-page sandbox-01">
                    <div>
                        <div class="page-header-bar sandbox-02">
                          <div class="back-button focusable sandbox-03" onclick="SoundManager.playCancel(); SceneManager._scene.exitWish()">
                            ${backBtnText}
                          </div>
                          <h2 class="title sandbox-04">${wishTitle}</h2>
                        </div>
                        
                        <div class="sandbox-05">
                            "Deep in the recesses of your consciousness, your psychic power (PSI) manifests as a desire to bend reality. Close your eyes, concentrate, and whisper your soul's true wish..."
                        </div>

                        <div class="sandbox-06">
                            <span class="sandbox-07">✦ ✦ ✦</span>
                        </div>
                    </div>

                    <div class="vitals-box sandbox-08">
                        <h4 class="sandbox-09">
                            Psychic Diagnostics
                        </h4>
                        <div class="sandbox-10">
                            <div class="sandbox-11">
                                <span class="sandbox-12">Party PSI (Luck):</span>
                                <span class="sandbox-13">${this.getMedianPartyPSI()}</span>
                            </div>
                            <div class="sandbox-11">
                                <span class="sandbox-12">Manifestation Rate:</span>
                                <span>${this.getMedianPartyPSI() >= 50 ? "Clear Mind (100%)" : (this.getMedianPartyPSI() >= 25 ? "Cryptic Whispers (50%)" : "Chaotic Murmurs (25%)")}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // The categories are tiles on a three-across grid, in alphabetical
            // order, so the whole table is read at a glance instead of scrolled
            // through. The cursor index is an index into that same order.
            let categoriesHTML = "";
            sortedCategories().forEach((cat, idx) => {
                categoriesHTML += `
                    <div class="category-item focusable sandbox-14" data-symbol="${cat.symbol}" data-index="${idx}" onclick="SceneManager._scene.selectCategoryByClick('${cat.symbol}', ${idx})">
                        <canvas class="cat-icon sandbox-15" width="20" height="20" data-icon="${cat.icon}"></canvas>
                        <span class="sandbox-16">${escapeHtml(categoryName(cat))}</span>
                    </div>
                `;
            });

            leftPageHTML = `
                <div class="left-page sandbox-01">
                    <div>
                        <div class="page-header-bar sandbox-17">
                          <div class="back-button focusable sandbox-03" onclick="SceneManager._scene.popScene()">
                            ${backBtnText}
                          </div>
                          <h2 class="title sandbox-04">${sandboxTitle}</h2>
                        </div>
                        <div class="categories-list sandbox-18" style="grid-template-columns:repeat(${CATEGORY_COLUMNS}, minmax(0, 1fr))">
                            ${categoriesHTML}
                        </div>
                    </div>

                    <div class="vitals-box sandbox-19">
                        <h4 class="sandbox-20">
                            <span>Sandbox Status</span>
                            <span class="sandbox-21" style="color:${$gamePlayer.isThrough() ? 'var(--text-cost-ok)' : 'var(--text-cost-bad)'}" onclick="SceneManager._scene.toggleCollisionUI()">
                                Collision: ${$gamePlayer.isThrough() ? 'OFF' : 'ON'}
                            </span>
                        </h4>
                        <div class="sandbox-22">
                            <div class="sandbox-11">
                                <span class="sandbox-12">Party Leader:</span>
                                <span>${$gameParty.leader() ? $gameParty.leader().name() : "None"} (Lv. ${$gameParty.leader() ? $gameParty.leader().level : 1})</span>
                            </div>
                            <div class="sandbox-11">
                                <span class="sandbox-12">Current Map:</span>
                                <span>ID ${$gameMap.mapId()} (${$gamePlayer.x}, ${$gamePlayer.y})</span>
                            </div>
                            <div class="sandbox-11">
                                <span class="sandbox-12">PSI (Luck):</span>
                                <span>${$gameParty.leader() ? $gameParty.leader().luk : 10}</span>
                            </div>
                            <div class="sandbox-11">
                                <span class="sandbox-12">Spawn:</span>
                                <span>${spawnModeLabel}, ${eraLabel}</span>
                            </div>
                            ${placeLabel ? `
                            <div class="sandbox-11">
                                <span class="sandbox-12">Place:</span>
                                <span>${placeLabel}</span>
                            </div>` : ""}
                        </div>
                    </div>
                </div>
            `;
        }

        const actionsHTML = this.buildActionsListHTML();

        const rightPageTitle = isWish ? "Destinies Whispered" : (categoryName(CATEGORIES.find(c => c.symbol === this._listWindow._mode)) || "Actions List");

        this._dndContainer.innerHTML = `
            <div class="book-spread">
                ${leftPageHTML}

                <div class="right-page sandbox-23">
                    <h2 class="title sandbox-24">${rightPageTitle}</h2>
                    
                    <div class="sandbox-25">
                        ${this.searchFieldHTML()}
                        
                        <div class="actions-list-container sandbox-26">
                            ${actionsHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Draw Left Page Icons if in Sandbox mode
        if (!isWish) {
            this.drawUICategoryIcons();
        }

        // Keep search cursor focus position intact
        const searchInput = document.getElementById("sandbox-search");
        if (searchInput && this._searchFocusActive) {
            searchInput.focus();
            searchInput.setSelectionRange(this._searchQuery.length, this._searchQuery.length);
        }

        UISandboxInputManager.activate();
    };

    // Build the (capped) actions list HTML. Rendering every matching row can
    // produce thousands of DOM nodes; cap at MAX_ACTION_ROWS and append a
    // "...N more" row so the overlay stays responsive.
    Scene_SandboxMenu.MAX_ACTION_ROWS = 200;
    Scene_SandboxMenu.prototype.buildActionsListHTML = function () {
        const filtered = this.getFilteredActions();
        if (filtered.length === 0) {
            return `<div class="sandbox-27">No matching outcomes.</div>`;
        }
        if (this._listWindow._mode === "map") return this.buildMapTreeHTML(filtered);
        const cap = Scene_SandboxMenu.MAX_ACTION_ROWS;
        const shown = Math.min(filtered.length, cap);
        let actionsHTML = "";
        for (let idx = 0; idx < shown; idx++) {
            const label = this.getActionLabel(filtered[idx]);
            actionsHTML += `
                    <div class="action-item focusable sandbox-28" data-index="${idx}" onclick="SceneManager._scene.selectActionByClick(${idx})">
                        <span class="sandbox-29">${label}</span>
                        <span class="sandbox-30">✦</span>
                    </div>
                `;
        }
        if (filtered.length > cap) {
            const more = filtered.length - cap;
            actionsHTML += `<div class="sandbox-31">...${more} more (refine your search)</div>`;
        }
        return actionsHTML;
    };

    // Render the map tree: one indented row per visible map, a ▸/▾ handle on
    // every map that has children (folders), the child count on the right, and
    // the folder path as a subtitle while searching (the search list is flat).
    Scene_SandboxMenu.prototype.buildMapTreeHTML = function (rows) {
        const cap = Scene_SandboxMenu.MAX_ACTION_ROWS;
        const shown = Math.min(rows.length, cap);
        const searching = !!this._searchQuery;
        let html = "";
        for (let idx = 0; idx < shown; idx++) {
            const row = rows[idx];
            const isFolder = row.childCount > 0;
            const open = isFolder && isMapFolderOpen(row.id);
            // Deep branches would push the label off the page; stop indenting
            // past 8 levels (the tree is only ~9 deep at its worst).
            const indent = searching ? 0 : Math.min(row.depth, 8) * 13;
            const handle = isFolder
                ? `<span class="map-toggle sandbox-32" onclick="event.stopPropagation(); SceneManager._scene.toggleMapFolder(${row.id})">${open ? "▾" : "▸"}</span>`
                : `<span class="sandbox-33">·</span>`;
            const label = String(row.id).padStart(3, '0') + ": " + row.name;
            const pathHTML = (searching && row.path)
                ? `<span class="sandbox-34">${escapeHtml(row.path)}</span>`
                : "";
            const rightHTML = isFolder
                ? `<span class="sandbox-35">${row.childCount}</span>`
                : `<span class="sandbox-30">✦</span>`;
            html += `
                    <div class="action-item focusable sandbox-36" data-index="${idx}" onclick="SceneManager._scene.selectActionByClick(${idx})" style="padding:6px 12px 6px ${12 + indent}px">
                        <span class="sandbox-37">
                            ${handle}
                            <span class="sandbox-38" style="font-weight:${isFolder ?"bold" : "500"}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(label)}</span>
                            ${pathHTML}
                        </span>
                        ${rightHTML}
                    </div>
                `;
        }
        if (rows.length > cap) {
            const more = rows.length - cap;
            html += `<div class="sandbox-31">...${more} more (refine your search)</div>`;
        }
        return html;
    };

    // Open / close a folder row, keeping the cursor on the folder itself.
    Scene_SandboxMenu.prototype.toggleMapFolder = function (mapId) {
        if (_mapTreeOpen.has(mapId)) {
            _mapTreeOpen.delete(mapId);
        } else {
            _mapTreeOpen.add(mapId);
        }
        SoundManager.playCursor();
        this._activeLeftFocus = false;
        this._searchFocusActive = false;
        this.refreshActionsListDOM();
        this.focusMapRow(mapId);
    };

    // Move the right-page cursor onto a given map id (no-op when it is hidden).
    Scene_SandboxMenu.prototype.focusMapRow = function (mapId) {
        const rows = this.getFilteredActions();
        const idx = rows.findIndex(row => row.id === mapId);
        if (idx < 0) return;
        this._focusedActionIndex = idx;
        UISandboxInputManager.updateFocus();
    };

    // Keyboard tree navigation, as in the editor's map list: right opens the
    // focused folder, left closes it, and left on a closed folder or a plain map
    // jumps up to its parent folder.
    Scene_SandboxMenu.prototype.handleMapTreeArrow = function (dir) {
        if (this._searchQuery) return; // the search list is flat, nothing to fold
        const rows = this.getFilteredActions();
        const row = rows[this._focusedActionIndex];
        if (!row || row.id < 0) return;
        const isFolder = row.childCount > 0;
        if (dir > 0) {
            if (isFolder && !isMapFolderOpen(row.id)) this.toggleMapFolder(row.id);
            return;
        }
        if (isFolder && isMapFolderOpen(row.id)) {
            this.toggleMapFolder(row.id);
            return;
        }
        if (row.parentId > 0) {
            SoundManager.playCursor();
            this.focusMapRow(row.parentId);
        }
    };

    // Rebuild only the right-page actions list (and its title) instead of the
    // whole two-page overlay. Used for search input and category cursor moves.
    Scene_SandboxMenu.prototype.refreshActionsListDOM = function () {
        if (!this._dndContainer || this._wishGranted) return;
        const container = this._dndContainer.querySelector('.actions-list-container');
        if (!container) { this.refreshUIDOM(); return; }
        container.innerHTML = this.buildActionsListHTML();

        const rightTitle = this._dndContainer.querySelector('.right-page > .title');
        if (rightTitle) {
            rightTitle.textContent = this._isWishMode
                ? "Destinies Whispered"
                : (categoryName(CATEGORIES.find(c => c.symbol === this._listWindow._mode)) || "Actions List");
        }

        // Keep search cursor focus position intact
        const searchInput = document.getElementById("sandbox-search");
        if (searchInput && this._searchFocusActive) {
            searchInput.focus();
            searchInput.setSelectionRange(this._searchQuery.length, this._searchQuery.length);
        }

        // Only action items were rebuilt; refresh their cache + focus highlight.
        UISandboxInputManager.refreshCache();
        UISandboxInputManager.updateFocus();
    };

    Scene_SandboxMenu.prototype.drawUICategoryIcons = function () {
        const canvases = this._dndContainer.querySelectorAll('.cat-icon');
        const iconSet = ImageManager.loadSystem('IconSet');

        const drawAll = () => {
            canvases.forEach(canvas => {
                const iconIndex = parseInt(canvas.getAttribute('data-icon'));
                const ctx = canvas.getContext('2d');
                if (ctx && iconIndex > 0) {
                    ctx.clearRect(0, 0, 20, 20);
                    ctx.imageSmoothingEnabled = false;

                    const sx = (iconIndex % 16) * 32;
                    const sy = Math.floor(iconIndex / 16) * 32;
                    ctx.drawImage(iconSet.canvas, sx, sy, 32, 32, 0, 0, 20, 20);
                }
            });
        };

        if (iconSet.isReady()) {
            drawAll();
        } else {
            iconSet.addLoadListener(drawAll);
        }
    };

    Scene_SandboxMenu.prototype.getFilteredActions = function () {
        const allData = this._listWindow._data || [];
        if (this._listWindow._mode === "map") return this.getFilteredMapRows(allData);
        if (!this._searchQuery) return allData;
        const query = this._searchQuery.toLowerCase();
        return allData.filter(item => {
            const label = this.getActionLabel(item).toLowerCase();
            return label.includes(query);
        });
    };

    // Teleport Map rows: with no search only the rows inside open folders show
    // (the tree, exactly as collapsed); typing a search flattens the whole tree
    // so any map can be reached without opening its folders first.
    Scene_SandboxMenu.prototype.getFilteredMapRows = function (rows) {
        if (!this._searchQuery) return rows.filter(isMapRowVisible);
        const query = this._searchQuery.toLowerCase();
        return rows.filter(row => (row.id + ": " + row.name).toLowerCase().includes(query));
    };

    Scene_SandboxMenu.prototype.getActionLabel = function (item) {
        if (this._listWindow._mode === "wish") {
            return item.wishingPhrase;
        }
        if (["discord", "macro", "player", "environment", "biology", "economy", "faction", "world", "minigame", "animtest", "npc", "systems", "erisdate"].includes(this._listWindow._mode)) {
            let suffix = "";
            if (item.id === "proc_debugger") {
                suffix = ` (${$gameSystem._isProceduralMapDebuggerActive ? "ON" : "OFF"})`;
            }
            if (item.id === "npc_target_toggle") {
                suffix = ` (${$gameSystem._sandboxNpcTargetAll ? "All on Map" : "Single / Facing"})`;
            }
            return item.name + suffix;
        }
        let prefix = String(item.id).padStart(3, '0') + ": ";
        if (item.type) {
            prefix = `[${item.type[0].toUpperCase()}] ` + prefix;
        }
        let suffix = "";
        if (this._listWindow._mode === "status" && $gameParty.leader() && $gameParty.leader().isStateAffected(item.id)) {
            suffix = " (Active)";
        }
        if (this._listWindow._mode === "switches") {
            suffix = ` (${$gameSwitches.value(item.id) ? "ON" : "OFF"})`;
        }
        if (this._listWindow._mode === "variables") {
            suffix = ` = ${$gameVariables.value(item.id)}`;
        }
        return prefix + item.name + suffix;
    };

    Scene_SandboxMenu.prototype.selectCategoryByClick = function (symbol, index) {
        this._focusedCategoryIndex = index;
        // The Wishing System "category" is not a list mode: clicking it opens the
        // full Wishing Sanctum (same layout as the openWishingSystem command),
        // returning to the sandbox categories when cancelled.
        if (symbol === "wish") {
            this.enterWishMode(true);
            return;
        }
        SoundManager.playOk();
        this._searchQuery = "";
        this._searchFocusActive = false;
        this._activeLeftFocus = false;
        this._focusedActionIndex = 0;
        this._listWindow.setMode(symbol);
        // Category change only swaps the right-page actions list; rebuild just
        // that instead of the whole two-page overlay. The field goes back to its
        // handle with the query it was holding, since refreshActionsListDOM
        // leaves that corner of the page alone.
        this._searchOpen = false;
        const searchSlot = document.getElementById("sandbox-search-field");
        if (searchSlot) searchSlot.outerHTML = this.searchFieldHTML();
        this.refreshActionsListDOM();
    };

    // Enter the Wishing Sanctum. When opened from within the sandbox (a click on
    // the Wishing System category) cancelling returns to the sandbox categories;
    // when opened via the openWishingSystem plugin command it pops the scene.
    Scene_SandboxMenu.prototype.enterWishMode = function (fromSandbox) {
        SoundManager.playOk();
        this._isWishMode = true;
        this._wishReturnToSandbox = !!fromSandbox;
        this._searchQuery = "";
        this._searchOpen = false;
        this._searchFocusActive = false;
        this._activeLeftFocus = false;
        this._focusedActionIndex = 0;
        // Reroll fresh destinies each time the sanctum is opened.
        this._listWindow._wishData = null;
        this._listWindow.setMode("wish");
        this.refreshUIDOM();
    };

    // Leave the Wishing Sanctum: back to the sandbox categories if we came from
    // there, otherwise close the whole sandbox scene.
    Scene_SandboxMenu.prototype.exitWish = function () {
        if (this._wishReturnToSandbox) {
            this._isWishMode = false;
            this._wishReturnToSandbox = false;
            this._searchQuery = "";
            this._searchOpen = false;
            this._searchFocusActive = false;
            this._activeLeftFocus = true;
            this._focusedCategoryIndex = defaultCategoryIndex();
            this._focusedActionIndex = 0;
            this._listWindow.setMode(CATEGORIES[0].symbol);
            this.refreshUIDOM();
        } else {
            this.popScene();
        }
    };

    // ---------------------------------------------------------------------
    //  Granting a wish
    // ---------------------------------------------------------------------
    // One visit to the sanctum answers one wish. The card below names what was
    // whispered and what answered it, the outcome lands as the card is dismissed
    // (a battle or a teleport needs the sanctum gone first), and the scene closes
    // behind it, so a spent orb cannot buy a second destiny.
    Scene_SandboxMenu.prototype.grantWish = function (item) {
        if (this._wishGranted) return;
        this._wishGranted = true;
        this._grantedWish = item;
        // The press or click that picked the destiny is still live this frame;
        // hold the card past it or it would dismiss itself instantly.
        this._wishGrantedAt = Date.now();
        SoundManager.playUseSkill();
        this.renderWishGranted(item);
        this._wishCloseTimer = setTimeout(() => this.finishWish(), WISH_GRANT_HOLD);
    };

    // The confirmation card: the phrase as it was whispered (scrambled by a low
    // PSI, exactly as it read on the list) and, underneath, the thing that
    // actually answered, spelled out in full.
    Scene_SandboxMenu.prototype.renderWishGranted = function (item) {
        if (!this._dndContainer) return;
        const phrase = item.wishingPhrase || item.name || "";
        this._dndContainer.innerHTML = `
            <div class="book-spread skill-fullpage">
                <div class="left-page sandbox-39">
                    <span class="sandbox-40">&#10022;</span>
                    <h2 class="title sandbox-04">${escapeHtml(T("Wish.granted.title"))}</h2>
                    <div class="sandbox-41">
                        ${escapeHtml(T("Wish.granted.whispered"))}
                    </div>
                    <div class="sandbox-42">
                        &ldquo;${escapeHtml(phrase)}&rdquo;
                    </div>
                    <div class="sandbox-43">
                        ${escapeHtml(T("Wish.granted.manifested", { outcome: item.name || "" }))}
                    </div>
                    <div class="sandbox-41">
                        ${escapeHtml(T("Wish.granted.spent"))}
                    </div>
                    <div class="sandbox-44">
                        ${escapeHtml(T("Wish.granted.close"))}
                    </div>
                </div>
            </div>
        `;
        // Nothing on the card is selectable; the cached rows are gone with it.
        UISandboxInputManager.refreshCache();
    };

    // Dismiss the card: apply the wish, then leave. Runs once, whether the hold
    // ran out or the player pressed through it.
    Scene_SandboxMenu.prototype.finishWish = function () {
        if (this._wishFinished) return;
        this._wishFinished = true;
        if (this._wishCloseTimer) {
            clearTimeout(this._wishCloseTimer);
            this._wishCloseTimer = null;
        }
        if (SceneManager._scene !== this) return;
        UISandboxInputManager.deactivate();
        this.applyWish(this._grantedWish);
        this.removeUIContainer();
        // A wish that starts a battle or moves the player has already asked for
        // the next scene; anything else leaves the sanctum on its own.
        if (!SceneManager.isSceneChanging()) this.popScene();
    };

    // What a granted wish actually does. The destinies list only ever whispers
    // items, states, troops and quick actions (see generateRandomWishes).
    Scene_SandboxMenu.prototype.applyWish = function (item) {
        if (!item) return;
        if (item.mode === "item") {
            const list = item.type === "weapon" ? $dataWeapons
                : item.type === "armor" ? $dataArmors : $dataItems;
            if (list[item.id]) $gameParty.gainItem(list[item.id], 1);
        } else if (item.mode === "status") {
            const actor = $gameParty.leader();
            if (actor) actor.addState(item.id);
        } else if (item.mode === "battle") {
            // The fight is the wish: leave the sanctum first and start it from
            // the map (as popAndRun does), so the party comes back to the world
            // once it is over instead of to a menu nobody asked for.
            this.popScene();
            setTimeout(() => {
                BattleManager.setup(item.id, true, false);
                $gamePlayer.makeEncounterCount();
                SceneManager.push(Scene_Battle);
            }, 150);
        } else if (item.mode === "macro") {
            // Quick actions run their own course; the ones that transfer the
            // player pop the scene themselves, which finishWish allows for.
            this.executeMacro(item.id);
        }
    };

    // Open an external scene / run a map-context plugin command: strip the
    // parchment overlay, drop back to the map, then fire the command a beat later
    // so it runs from Scene_Map (matching the main menu's spawnUIVehicle flow).
    Scene_SandboxMenu.prototype.popAndRun = function (plugin, command, args) {
        SoundManager.playOk();
        this.removeUIContainer();
        this.popScene();
        setTimeout(() => {
            if ($gameMap && $gameMap._interpreter) {
                PluginManager.callCommand($gameMap._interpreter, plugin, command, args || {});
            }
        }, 150);
    };

    Scene_SandboxMenu.prototype.selectActionByClick = function (index) {
        this._activeLeftFocus = false;
        this._focusedActionIndex = index;

        // Select matching action index in background dummy list window
        const filtered = this.getFilteredActions();
        const item = filtered[index];
        if (item) {
            const bgIdx = this._listWindow._data.indexOf(item);
            if (bgIdx >= 0) {
                this._listWindow.select(bgIdx);
                this.onListOk();
            }
        }
    };

    // The outcomes search wears the same collapsed handle as every other menu
    // (UI/MenuSearchBar.js): a magnifier at the top right of the list, and the
    // field itself only once it has been clicked. The handle is outside both
    // cursor lists, so the pad walks categories and outcomes and nothing else.
    Scene_SandboxMenu.prototype.searchFieldHTML = function () {
        const open = !!this._searchOpen || !!this._searchQuery;
        const handle = window.MenuSearchBar
            ? window.MenuSearchBar.toggleHTML('SceneManager._scene.toggleSearchField()', open)
            : '';
        const field = open
            ? `<div class="msb-field"><input class="sandbox-45" type="text" id="sandbox-search" placeholder="Search outcomes..." value="${escapeHtml(this._searchQuery)}" oninput="SceneManager._scene.handleSearchInput(this.value)"></div>`
            : '';
        return `<div class="msb msb-field-only${open ? '' : ' msb-collapsed'}" id="sandbox-search-field">${field}${handle}</div>`;
    };

    // Only the field's own corner is repainted: the list under it is rebuilt
    // separately, and only when closing actually dropped a query.
    Scene_SandboxMenu.prototype.toggleSearchField = function () {
        this._searchOpen = !this._searchOpen;
        const hadQuery = !!this._searchQuery;
        if (!this._searchOpen) this._searchQuery = "";
        this._searchFocusActive = this._searchOpen;
        this._focusedActionIndex = 0;
        const slot = document.getElementById("sandbox-search-field");
        if (slot) slot.outerHTML = this.searchFieldHTML();
        SoundManager.playCursor();
        if (this._searchOpen) {
            const input = document.getElementById("sandbox-search");
            if (input) input.focus();
        } else if (hadQuery) {
            this.refreshActionsListDOM();
        }
    };

    Scene_SandboxMenu.prototype.handleSearchInput = function (value) {
        this._searchQuery = value;
        this._searchFocusActive = true;
        this._focusedActionIndex = 0;
        // Search only affects the actions list; avoid rebuilding both pages.
        this.refreshActionsListDOM();
    };

    Scene_SandboxMenu.prototype.toggleCollisionUI = function () {
        this.commandCollision();
        this.refreshUIDOM();
    };

    Scene_SandboxMenu.prototype.commandCollision = function () {
        $gamePlayer._through = !$gamePlayer._through;
        SoundManager.playOk();
    };

    Scene_SandboxMenu.prototype.getMedianPartyPSI = function () {
        const lucks = $gameParty.members().map(actor => actor.luk);
        if (lucks.length === 0) return 10;
        lucks.sort((a, b) => a - b);
        const mid = Math.floor(lucks.length / 2);
        return lucks.length % 2 !== 0 ? lucks[mid] : (lucks[mid - 1] + lucks[mid]) / 2;
    };

    Scene_SandboxMenu.prototype.onListCancel = function () {
        this.popScene();
    };

    Scene_SandboxMenu.prototype.onListOk = function () {
        const item = this._listWindow.item();
        if (!item) return;

        // A whispered destiny is not an ordinary sandbox row: it is granted
        // once, shown, and then the sanctum closes on it.
        if (this._listWindow._mode === "wish") {
            this.grantWish(item);
            return;
        }

        const mode = this._listWindow._mode;

        if (mode === "battle") {
            // Remove DOM before transition
            this.removeUIContainer();
            BattleManager.setup(item.id, true, false);
            BattleManager.setEventCallback(function (n) {
                SceneManager.push(Scene_SandboxMenu);
            }.bind(this));
            $gamePlayer.makeEncounterCount();
            SceneManager.push(Scene_Battle);
        } else if (mode === "item") {
            if (item.type === "item") $gameParty.gainItem($dataItems[item.id], 1);
            if (item.type === "weapon") $gameParty.gainItem($dataWeapons[item.id], 1);
            if (item.type === "armor") $gameParty.gainItem($dataArmors[item.id], 1);
            SoundManager.playShop();
            this.refreshUIDOM();
        } else if (mode === "event") {
            this.removeUIContainer();
            $gameTemp.reserveCommonEvent(item.id);
            this.popScene();
        } else if (mode === "map") {
            if (item.id > 0) {
                this.removeUIContainer();
                $gamePlayer.reserveTransfer(item.id, 0, 0, 0, 0);
                this.popScene();
            } else {
                this.refreshUIDOM();
            }
        } else if (mode === "voxelplanet") {
            // Straight into the 3D world on that biome, on foot, with whatever
            // lives on a world of that type roaming it. The same door the star
            // map's own "walk it" offer goes through.
            if (item.id && startVoxelPlanetWalk(item.id)) {
                this.removeUIContainer();
                SoundManager.playOk();
                this.popScene();
            } else {
                SoundManager.playBuzzer();
                this.refreshUIDOM();
            }
        } else if (mode === "planet") {
            // Land on the procedural surface of the chosen planet type (reuses the
            // star map's Land flow: biome override, EVA suit, sky palette, etc.).
            if (item.id && window.GalaxySim && window.GalaxySim.enterPlanetSurface &&
                window.GalaxySim.enterPlanetSurface({ name: item.name, type: item.id, moons: [] })) {
                this.removeUIContainer();
                SoundManager.playOk();
                this.popScene();
            } else {
                SoundManager.playBuzzer();
                this.refreshUIDOM();
            }
        } else if (mode === "status") {
            const actor = $gameParty.leader();
            if (!actor) {
                this.refreshUIDOM();
                return;
            }
            if (actor.isStateAffected(item.id)) {
                actor.removeState(item.id);
            } else {
                actor.addState(item.id);
            }
            SoundManager.playUseSkill();
            this.refreshUIDOM();
        } else if (mode === "switches") {
            const val = $gameSwitches.value(item.id);
            $gameSwitches.setValue(item.id, !val);
            SoundManager.playOk();
            this.refreshUIDOM();
        } else if (mode === "variables") {
            const val = $gameVariables.value(item.id);
            const input = prompt(`Enter value for variable ${item.id} (${item.name}):`, val);
            if (input !== null) {
                const num = Number(input);
                if (!isNaN(num)) {
                    $gameVariables.setValue(item.id, num);
                    SoundManager.playOk();
                }
            }
            this.refreshUIDOM();
        } else if (mode === "erisdate") {
            this.startErisDate(item);
        } else if (["discord", "macro", "player", "environment", "biology", "economy", "faction", "world", "minigame", "animtest", "npc", "systems"].includes(mode)) {
            this.executeMacro(item.id);
        }
    };

    // Date board. The mood row cycles in place; every other row leaves the
    // sandbox and starts the evening from Scene_Map, the same way the
    // startDate plugin command runs it (see popAndRun).
    Scene_SandboxMenu.prototype.startErisDate = function (item) {
        const eris = window.ErisDateSystem;
        if (!eris || !item || !item.id || eris.isActive()) {
            SoundManager.playBuzzer();
            return;
        }

        if (item.id === "eris_mood") {
            // ...through the sixteen date moods and back to "rolled on the night".
            const moods = eris.moods();
            const next = moods.indexOf($gameSystem._sandboxErisMood) + 1;
            $gameSystem._sandboxErisMood = next < moods.length ? moods[next] : null;
            SoundManager.playOk();
            this._listWindow.refresh();
            this.refreshActionsListDOM();
            return;
        }

        // Null is "wherever the party is standing", which is what the plugin
        // command passes; "random" is a roll over the whole bank.
        let biome = null;
        if (item.id === "eris_random") biome = "random";
        else if (String(item.id).startsWith("eris_biome:")) biome = String(item.id).slice("eris_biome:".length);

        const mood = $gameSystem._sandboxErisMood;
        SoundManager.playOk();
        this.removeUIContainer();
        this.popScene();
        setTimeout(() => eris.start(biome, mood), 150);
    };

    Scene_SandboxMenu.prototype.executeMacro = function (id) {
        // NPC manipulation actions have their own handler and never redirect
        // out of the sandbox scene, so route them before the macro switch.
        if (typeof id === "string" && id.startsWith("npc_")) {
            this.applyNpcAction(id);
            return;
        }

        const gainItemByName = (type, name, amount) => {
            const list = type === 'weapon' ? $dataWeapons : type === 'item' ? $dataItems : $dataArmors;
            const itemObj = list.find(i => i && i.name === name);
            if (itemObj) $gameParty.gainItem(itemObj, amount);
        };

        let cleanupDOM = false;

        switch (id) {
            case "heal_all":
                $gameParty.members().forEach(actor => actor.recoverAll());
                SoundManager.playUseSkill();
                this.refreshUIDOM();
                break;
            case "devtools":
                SceneManager.showDevTools();
                this.refreshUIDOM();
                break;
            case "reload_game":
                cleanupDOM = true;
                SceneManager.reloadGame();
                break;
            case "init":
                $gameVariables.setValue(26, 21);
                $gameVariables.setValue(27, 21);
                $gameVariables.setValue(2, 100);
                $gameSwitches.setValue(9, true);
                $gameSwitches.setValue(27, true);
                $gameVariables.setValue(53, 66666);
                $gameParty.gainGold(1000000);
                if ($gameMap && $gameMap._interpreter) {
                    PluginManager.callCommand($gameMap._interpreter, "MarkovTextGenerator", "Generate Markov Name", {
                        "Database ID": "names", "Chain Order": "2", "Minimum Characters": "4", "Maximum Characters": "12",
                        "Use Word-Based Mode": "false", "Variable ID": "4", "Actor ID": "1", "Display In Message": "false"
                    });
                    PluginManager.callCommand($gameMap._interpreter, "CharacterSpriteGridSelector", "Select Random Sprite", { "Actor ID": "1" });
                }
                const allClasses = $dataClasses.filter(c => c && c.name);
                const randomClass = allClasses[Math.floor(Math.random() * allClasses.length)];
                $gameActors.actor(1).changeClass(randomClass.id, true);
                $gameVariables.setValue(52, 3);
                gainItemByName('weapon', 'Pistol', 1);
                gainItemByName('item', 'Fishing Rod', 1);
                gainItemByName('item', 'Energy Drink', 10);
                gainItemByName('item', 'Smelling Salts', 10);
                gainItemByName('item', 'Travel Journal', 1);
                gainItemByName('item', 'Star map', 1);
                gainItemByName('item', 'Bestiary', 1);
                gainItemByName('item', 'Raman probe', 1);
                gainItemByName('item', 'Diving suit', 1);
                gainItemByName('item', 'Shovel', 1);
                gainItemByName('item', 'Utensil Set', 1);
                gainItemByName('item', 'Local Map', 1);
                gainItemByName('item', 'Telescope', 1);
                $gameParty.gainItem($dataItems[134], 1); // Wireless Headphones

                $gameParty.gainItem($dataItems[94], 1); // Ki Strike EP:
                if ($dataItems[125]) $gameParty.gainItem($dataItems[125], 20);
                if ($gamePlayer) $gamePlayer.setOpacity(255);
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "playtest_boost":
                if (typeof applyPlaytestBonuses === 'function') {
                    applyPlaytestBonuses();
                    callCommonEventIfNeeded();
                }
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "base_items":
                const weapons = ['Mind Ripper Claws', 'Double-Barrel Pistol', 'Heavy Sniper', 'Tactical Crossbow', 'Iron Tonfa', 'Splitting Shuriken', 'Short Bow', 'Cestus', 'Short Spear', 'Battle Axe', 'Bronze Flail', 'Short Sword'];
                weapons.forEach(w => gainItemByName('weapon', w, 1));
                const items1 = ['Energy Drink', 'Gender Shake', 'Mana Tonic', 'Medical Spray'];
                items1.forEach(i => gainItemByName('item', i, 10));
                const items2 = ['Shovel', 'Diving suit', 'Fishing Rod', 'Travel Journal', 'Star map', 'Bestiary', 'Utensil Set', 'Local Map', 'Telescope'];
                items2.forEach(i => gainItemByName('item', i, 1));
                SoundManager.playShop();
                this.refreshUIDOM();
                break;
            case "materials":
                const mats = ['Energy Drink', 'Gender Shake', 'Mana Tonic', 'Medical Spray', 'Cigarette Pack', 'Nun Beer', 'Scroll of Destruction', 'Feather of Levitation', 'Shuriken', 'Caltrops', 'Frost Bomb', 'Morphine', 'Arcade Token', 'Salvaged steel', 'Lockpick', 'Titanium ore', 'Varlenia ore', 'Crystal', 'Glass', 'Wood', 'Leather', 'Cloth', 'Bone', 'Meat', 'Plant matter', 'Herb extract', 'Oil Flask', 'Acidic Solution', 'Arcane Essence', 'Ethereal Shard', 'Quantum Core', 'Circuit Board', 'Microchip', 'Battery Cell', 'Plastic Polymer', 'Composite Resin', 'Nanotube Module'];
                mats.forEach(i => gainItemByName('item', i, 10));
                gainItemByName('item', 'Fireball Scroll', 5);
                gainItemByName('item', 'Lightning Bolt Scroll', 5);
                SoundManager.playShop();
                this.refreshUIDOM();
                break;
            case "money":
                $gameParty.gainGold(1000000);
                SoundManager.playShop();
                this.refreshUIDOM();
                break;
            // Sandbox hub map: the same spot a Sandbox game starts on.
            case "goto_disk_discord":
                cleanupDOM = true;
                $gamePlayer.reserveTransfer(1421, 9, 9, 2, 0);
                this.popScene();
                break;
            case "teleport_down":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WorldMapReturn', 'goDown', {});
                this.popScene();
                break;
            case "teleport_debug":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'DebugMapTeleporter', 'openDebugMenu', {});
                this.popScene();
                break;
            case "vehicle_ret_camper":
                cleanupDOM = true;
                $gameSwitches.setValue(51, true);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'VehicleSystem', 'Return to Camper', {});
                this.popScene();
                break;
            case "vehicle_ret_car":
                cleanupDOM = true;
                $gameSwitches.setValue(64, true);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'VehicleSystem', 'Return to Car', {});
                this.popScene();
                break;
            case "vehicle_sum_camper":
                cleanupDOM = true;
                $gameSwitches.setValue(51, true);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'VehicleSystem', 'Summon Camper', {});
                this.popScene();
                break;
            case "vehicle_sum_car":
                cleanupDOM = true;
                $gameSwitches.setValue(64, true);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'VehicleSystem', 'Summon Car', {});
                this.popScene();
                break;
            case "sleep_inn":
                cleanupDOM = true;
                const sleepInnEv = $dataCommonEvents.find(e => e && e.name === "SleepInn");
                if (sleepInnEv) $gameTemp.reserveCommonEvent(sleepInnEv.id);
                this.popScene();
                break;
            case "sleep_camp":
                cleanupDOM = true;
                const sleepCampEv = $dataCommonEvents.find(e => e && e.name === "Sleep by the fire");
                if (sleepCampEv) $gameTemp.reserveCommonEvent(sleepCampEv.id);
                this.popScene();
                break;
            case "advance_time":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'TimeDateSystem', 'Pass Time', { "Hours": "4", "Minutes": "0" });
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "toggle_3d":
                cleanupDOM = true;
                const switchViewEv = $dataCommonEvents.find(e => e && e.name === "Switch view");
                if (switchViewEv) $gameTemp.reserveCommonEvent(switchViewEv.id);
                this.popScene();
                break;
            case "buy_troops":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'ArmyManager', 'Debug: Add 100 Random Troops', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "change_weather":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WeatherSystem', 'Force Weather Change', {});
                this.popScene();
                break;
            case "surgery":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'Health_ProstheticShop', 'OpenProstheticShop', {});
                this.popScene();
                break;
            case "death":
                cleanupDOM = true;
                $gameParty.members().forEach(actor => actor.setHp(0));
                const sentinel = $dataTroops.find(t => t && t.name.includes("Brass Sentinel Mk. IV"));
                if (sentinel) {
                    BattleManager.setup(sentinel.id, true, false);
                    BattleManager.setEventCallback(function () { SceneManager.push(Scene_SandboxMenu); }.bind(this));
                    SceneManager.push(Scene_Battle);
                } else {
                    this.refreshUIDOM();
                }
                break;
            case "test_battle":
                cleanupDOM = true;
                const goblin = $dataTroops.find(t => t && t.name.includes("Bell Goblin"));
                if (goblin) {
                    BattleManager.setup(goblin.id, true, true);
                    BattleManager.setEventCallback(function () { SceneManager.push(Scene_SandboxMenu); }.bind(this));
                    SceneManager.push(Scene_Battle);
                } else {
                    this.refreshUIDOM();
                }
                break;
            case "speed_1":
            case "speed_2":
            case "speed_3":
            case "speed_4":
            case "speed_5":
            case "speed_6":
                const speed = parseInt(id.split("_")[1]);
                if ($gamePlayer) $gamePlayer.setMoveSpeed(speed);
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "lvl_10":
            case "lvl_20":
            case "lvl_30":
            case "lvl_40":
            case "lvl_50":
            case "lvl_60":
            case "lvl_70":
            case "lvl_80":
            case "lvl_90":
            case "lvl_99":
                let lvl = 98;
                if (id !== "lvl_99") lvl = parseInt(id.split("_")[1]);
                $gameParty.members().forEach(actor => {
                    actor.changeLevel(actor.level + lvl, false);
                    actor.recoverAll();
                });
                SoundManager.playUseSkill();
                this.refreshUIDOM();
                break;

            // 1. Time, Weather, and Environment
            case "time_plus_1h":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'TimeDateSystem', 'Pass Time', { "Hours": "1", "Minutes": "0" });
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "time_plus_1d":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'TimeDateSystem', 'Pass Time', { "Hours": "24", "Minutes": "0" });
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "time_freeze":
                $gameSwitches.setValue(99, !$gameSwitches.value(99));
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "temp_plus":
                $gameVariables.setValue(61, $gameVariables.value(61) + 10);
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "temp_minus":
                $gameVariables.setValue(61, $gameVariables.value(61) - 10);
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "light_day":
                $gameVariables.setValue(60, 0);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'DynamicLightingSystem', 'Force Daylight', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "light_night":
                $gameVariables.setValue(60, 1);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'DynamicLightingSystem', 'Force Nighttime', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "weather_clear":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WeatherSystem', 'forceWeatherChange', { "Weather Type": "Clear" });
                this.popScene();
                break;
            case "weather_rain":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WeatherSystem', 'forceWeatherChange', { "Weather Type": "Rain" });
                this.popScene();
                break;
            case "weather_storm":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WeatherSystem', 'forceWeatherChange', { "Weather Type": "Storm" });
                this.popScene();
                break;
            case "weather_snow":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WeatherSystem', 'forceWeatherChange', { "Weather Type": "Snow" });
                this.popScene();
                break;

            // 2. Character Biology and Survival
            case "bio_heal_limbs":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'Health_Core', 'HealBodyParts', {});
                SoundManager.playUseSkill();
                this.refreshUIDOM();
                break;
            case "bio_cure_all":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'Health_BiologicSimulation', 'CureAll', {});
                SoundManager.playUseSkill();
                this.refreshUIDOM();
                break;
            case "bio_pregnancy":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'Health_BiologicSimulation', 'AdvancePregnancy', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "bio_prosthetics":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'Health_ProstheticShop', 'openProstheticShop', {});
                this.popScene();
                break;
            case "nut_max":
                $gameVariables.setValue(88, 100);
                $gameVariables.setValue(89, 100);
                $gameVariables.setValue(90, 100);
                $gameVariables.setValue(91, 100);
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "nut_zero_exhaust":
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "nut_overeat":
                if ($gameParty.leader()) $gameParty.leader().addState(41);
                SoundManager.playUseSkill();
                this.refreshUIDOM();
                break;

            // 3. Economy, Markets, and Assets
            case "econ_pump":
                $gameVariables.setValue(53, $gameVariables.value(53) + 100);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'StockMarketSystem', 'PumpMarket', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "econ_crash":
                $gameVariables.setValue(53, Math.max(0, $gameVariables.value(53) - 100));
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'StockMarketSystem', 'CrashMarket', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "econ_real_estate":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'RealEstateMarket', 'GrantAllProperties', {});
                SoundManager.playShop();
                this.refreshUIDOM();
                break;
            case "econ_rent":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'RealEstateMarket', 'checkDailyIncome', {});
                SoundManager.playShop();
                this.refreshUIDOM();
                break;
            case "econ_debt_wipe":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'BankLoanSystem', 'WipeDebt', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "econ_loan_max":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'BankLoanSystem', 'MaxLoan', {});
                SoundManager.playShop();
                this.refreshUIDOM();
                break;
            case "econ_deliveries":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'ShopManagement', 'CompleteDeliveries', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;

            // 4. Factions, Armies, and Politics
            case "army_spawn_100":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'ArmyManager', 'Debug: Add 100 Random Troops', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "army_coherence":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'ArmyManager', 'MaxCoherence', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "faction_rep_max":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'FactionDataManager', 'setReputation', { "Reputation": "100" });
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "faction_rep_min":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'FactionDataManager', 'setReputation', { "Reputation": "-100" });
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "crime_clear":
                $gameVariables.setValue(66, 0);
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "crime_max":
                $gameVariables.setValue(66, 99999);
                SoundManager.playOk();
                this.refreshUIDOM();
                break;

            // 5. Procedural Generation & World Maps
            // Generate a biome as a fresh procedural map (map 636) and teleport
            // straight into it via WorldMapReturn's startForcedBiome command.
            case "proc_village":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WorldMapReturn', 'startForcedBiome', { "Biome": "Village" });
                this.popScene();
                break;
            case "proc_dungeon":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WorldMapReturn', 'startForcedBiome', { "Biome": "Dungeon" });
                this.popScene();
                break;
            case "proc_crypt":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WorldMapReturn', 'startForcedBiome', { "Biome": "Crypt" });
                this.popScene();
                break;
            case "proc_sewer":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WorldMapReturn', 'startForcedBiome', { "Biome": "Sewer" });
                this.popScene();
                break;
            case "proc_cave":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WorldMapReturn', 'startForcedBiome', { "Biome": "Cave" });
                this.popScene();
                break;
            case "proc_city":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'WorldMapReturn', 'startForcedBiome', { "Biome": "City" });
                this.popScene();
                break;
            case "dung_boss":
                cleanupDOM = true;
                $gameVariables.setValue(17, 100);
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'DungeonFloorSystem', 'JumpToBoss', {});
                this.popScene();
                break;
            case "veh_fuel_max":
                // Fuel lives in the per-vehicle window.VehicleFuel store now, not
                // variables 65 / 71. Fill every tank to its (upgrade-aware) max.
                if (window.VehicleFuel) {
                    ['camper', 'car', 'bike', 'airship'].forEach(k =>
                        window.VehicleFuel.set(k, window.VehicleFuel.max(k)));
                }
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "proc_debugger":
                $gameSystem._isProceduralMapDebuggerActive = !$gameSystem._isProceduralMapDebuggerActive;
                SoundManager.playOk();
                this.refreshUIDOM();
                break;

            // 6. Minigames & Hobbies
            case "mini_tokens":
                if ($dataItems[125]) $gameParty.gainItem($dataItems[125], 999);
                else gainItemByName('item', 'Arcade Token', 999);
                SoundManager.playShop();
                this.refreshUIDOM();
                break;
            case "mini_frogger":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'ArcadeFrogger', 'start', {});
                this.popScene();
                break;
            case "mini_snake":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'ArcadeSnake', 'start', {});
                this.popScene();
                break;
            case "mini_pool":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'PoolGame', 'start', {});
                this.popScene();
                break;
            case "mini_lockpick":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'UnlockingBlocks', 'start', {});
                this.popScene();
                break;
            case "mini_surf":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'SurfingMiniGame', 'startSurfing', {});
                this.popScene();
                break;
            case "farm_miracle":
                if ($gameMap && $gameMap._interpreter) {
                    PluginManager.callCommand($gameMap._interpreter, 'PlantGrowthSystem', 'MiracleGrow', {});
                    PluginManager.callCommand($gameMap._interpreter, 'AnimalGrowthSystem', 'MiracleGrow', {});
                }
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "build_sandbox":
                cleanupDOM = true;
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'FurnitureSystem', 'openBuilderSandbox', {});
                this.popScene();
                break;

            // 7. Animation Test (one battle per skill, cast for real)
            // The run prints the real skill id of every cast, so a run that was
            // cut short is resumed by typing that id back in here.
            case "anim_test_start_id": {
                const lastSkill = satProgress.actor.last;
                const crashNote = lastSkill && lastSkill.skillId
                    ? `\nLast run reached skill ${lastSkill.skillId}; ${satStartSkillId} is the one before it, the last that played through.`
                    : "";
                const startInput = prompt(
                    `Start the animation test from which skill ID?\n(${SAT_FIRST_SKILL_ID} is the first real skill; ids below it are engine slots)${crashNote}`,
                    satStartSkillId
                );
                if (startInput !== null) {
                    const num = Math.floor(Number(startInput));
                    if (!isNaN(num) && num >= 1) {
                        satStartSkillId = num;
                        SoundManager.playOk();
                    } else {
                        SoundManager.playBuzzer();
                    }
                }
                // _data (and with it the row's label) is only rebuilt by the
                // list window itself, so refresh it before redrawing the DOM.
                this._listWindow.refresh();
                this.refreshUIDOM();
                break;
            }
            case "anim_test_all":
                if (startSkillAnimTest(40)) cleanupDOM = true;
                else this.refreshUIDOM();
                break;
            case "anim_test_fast":
                if (startSkillAnimTest(12)) cleanupDOM = true;
                else this.refreshUIDOM();
                break;

            // Same run from the other side: every enemy casting its own skills.
            case "anim_test_enemy_start_id": {
                const lastEnemy = satProgress.enemy.last;
                const crashNote = lastEnemy && lastEnemy.enemyId
                    ? `\nLast run reached enemy ${lastEnemy.enemyId} (skill ${lastEnemy.skillId}); ${satStartEnemyId} is the one before it, the last that played through.`
                    : "";
                const enemyInput = prompt(
                    `Start the enemy animation test from which enemy ID?${crashNote}`,
                    satStartEnemyId
                );
                if (enemyInput !== null) {
                    const num = Math.floor(Number(enemyInput));
                    if (!isNaN(num) && num >= 1) {
                        satStartEnemyId = num;
                        SoundManager.playOk();
                    } else {
                        SoundManager.playBuzzer();
                    }
                }
                this._listWindow.refresh();
                this.refreshUIDOM();
                break;
            }
            case "anim_test_enemy_all":
                if (startEnemyAnimTest(40)) cleanupDOM = true;
                else this.refreshUIDOM();
                break;
            case "anim_test_enemy_fast":
                if (startEnemyAnimTest(12)) cleanupDOM = true;
                else this.refreshUIDOM();
                break;

            // 8. Systems & Menus: open a whole subsystem's own scene/menu. Each
            // drops the parchment and defers to the map so the target command
            // runs from Scene_Map (see popAndRun). These return early because
            // popAndRun already tore down the overlay.
            case "sys_starmap":       this.popAndRun('GalaxySim_Core', 'OpenStarMap', {}); return;
            case "sys_bestiary":      this.popAndRun('Bestiary', 'OpenBestiary', {}); return;
            case "sys_questlog":      this.popAndRun('KanbanQuestLog', 'openQuestLog', {}); return;
            case "sys_questboard":    this.popAndRun('QuestBoardUI', 'openQuestBoard', {}); return;
            case "sys_pqgen":
                if (window.ProceduralQuests) window.ProceduralQuests.debugGenerateQuest();
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "sys_techtree":      this.popAndRun('ProceduralTechTree', 'openTechTree', {}); return;
            case "sys_history":       this.popAndRun('HistorySimulator', 'showHistoryLog', {}); return;
            case "sys_thinker":       this.popAndRun('ThinkerMenu', 'openThinkerMenu', {}); return;
            case "sys_apiary":        this.popAndRun('ApiarySystem', 'openApiary', {}); return;
            case "sys_brewery":       this.popAndRun('BrewingSystem', 'OpenBrewery', {}); return;
            case "sys_container":     this.popAndRun('ContainerSystem', 'openContainer', {}); return;
            case "sys_work":          this.popAndRun('WorkSystem', 'OpenWorkMenu', {}); return;
            case "sys_shop":          this.popAndRun('SearchableItemShop', 'OpenSearchableShop', {}); return;
            case "sys_news":          this.popAndRun('NewsSystem', 'forceNewsEvent', {}); return;

            // World-generation additions
            case "world_reveal_map":
                if ($gameMap && $gameMap._interpreter) PluginManager.callCommand($gameMap._interpreter, 'FOG_OF_WAR', 'revealEntireMap', {});
                SoundManager.playOk();
                this.refreshUIDOM();
                break;
            case "world_fly":         this.popAndRun('FlySystem', 'Fly', {}); return;

            // Mapshot export. The size row cycles in place; the export itself
            // has to run from Scene_Map, because every square it captures is a
            // map load and the overlay would be torn down under it anyway.
            case "mapshot_size":
                cycleMapshotSize();
                SoundManager.playCursor();
                this.refreshUIDOM();
                break;
            case "mapshot_export": {
                const blocked = mapshotBlocker();
                if (blocked) {
                    SoundManager.playBuzzer();
                    mapshotToast(blocked);
                    break;
                }
                SoundManager.playOk();
                // Leave the menu first, then start: the run drives map
                // transfers and needs the map scene to be the live one.
                this.removeUIContainer();
                this.popScene();
                setTimeout(startMapshotExport, 150);
                return;
            }
            case "world_dream":       this.popAndRun('DreamSystem', 'StartDream', {}); return;

            // Minigame additions
            case "mini_chess":        this.popAndRun('ChessGame', 'startChess', {}); return;
            case "mini_piano":        this.popAndRun('VisualPiano', 'openPiano', {}); return;
        }

        // Safely strip overlay container if macro redirects out of current scene
        if (cleanupDOM) {
            this.removeUIContainer();
        }
    };

    // =========================================================================
    //  NPC Manipulation handlers
    // =========================================================================

    // The NPC event directly in front of the player, or the nearest on-map NPC
    // as a fallback. Returns the event name (which is the NPC's society key).
    Scene_SandboxMenu.prototype._frontNpcName = function () {
        const reg = window.NPCSocietyRegistry;
        if (!reg || !$gamePlayer || !$gameMap) return null;
        const d  = $gamePlayer.direction();
        const fx = $gameMap.roundXWithDirection($gamePlayer.x, d);
        const fy = $gameMap.roundYWithDirection($gamePlayer.y, d);
        const front = $gameMap.eventsXy(fx, fy).find(e => reg.getProfile(e.event()?.name));
        if (front) return front.event().name;
        // Fallback: nearest on-map NPC controller (Manhattan distance).
        const ctrls = $gameSystem.getActiveNPCControllers?.() || [];
        let best = null, bestDist = Infinity;
        for (const c of ctrls) {
            if (!c.event || !reg.getProfile(c.eventName)) continue;
            const dist = Math.abs(c.event.x - $gamePlayer.x) + Math.abs(c.event.y - $gamePlayer.y);
            if (dist < bestDist) { bestDist = dist; best = c.eventName; }
        }
        return best;
    };

    // Resolve the current target set: every on-map NPC, or the single facing one.
    Scene_SandboxMenu.prototype._npcTargets = function () {
        const reg = window.NPCSocietyRegistry;
        if (!reg) return [];
        const out = [];
        if ($gameSystem._sandboxNpcTargetAll) {
            const ctrls = $gameSystem.getActiveNPCControllers?.() || [];
            const seen = new Set();
            for (const c of ctrls) {
                if (seen.has(c.eventName)) continue;
                const p = reg.getProfile(c.eventName);
                if (p) { out.push({ name: c.eventName, profile: p }); seen.add(c.eventName); }
            }
        } else {
            const nm = this._frontNpcName();
            const p  = nm ? reg.getProfile(nm) : null;
            if (p) out.push({ name: nm, profile: p });
        }
        return out;
    };

    // An on-map NPC (other than `selfName`) with no current partner, used to
    // auto-pair NPCs for the "Start dating" action.
    Scene_SandboxMenu.prototype._findFreePartner = function (selfName) {
        const reg = window.NPCSocietyRegistry;
        const LS  = window.NPCLifeSim;
        if (!reg || !LS) return null;
        const ctrls = $gameSystem.getActiveNPCControllers?.() || [];
        for (const c of ctrls) {
            if (c.eventName === selfName || !reg.getProfile(c.eventName)) continue;
            LS.ensureLifeRecord(c.eventName, reg.getProfile(c.eventName)?._homeGroupName);
            const rec = LS.getRecord(c.eventName);
            if (rec && !rec.partner) return c.eventName;
        }
        return null;
    };

    // Sever both sides of an NPC's current relationship (used by the break-up
    // action), logging the split on each partner's exPartners list.
    function _sandboxBreakup(rec, name) {
        const LS = window.NPCLifeSim;
        const partner = rec.partner;
        rec.exPartners = rec.exPartners || [];
        if (partner) rec.exPartners.push({ name: partner.name, external: !!partner.external, outcome: "broke up" });
        rec.partner = null;
        rec.partnerSinceMinute = null;
        rec.maritalStatus = "single";
        if (partner && !partner.external && LS) {
            const other = LS.getRecord(partner.name);
            if (other && other.partner && other.partner.name === name) {
                other.exPartners = other.exPartners || [];
                other.exPartners.push({ name, external: false, outcome: "broke up" });
                other.partner = null;
                other.partnerSinceMinute = null;
                other.maritalStatus = "single";
            }
        }
    }

    Scene_SandboxMenu.prototype.applyNpcAction = function (id) {
        if (id === "npc_target_toggle") {
            $gameSystem._sandboxNpcTargetAll = !$gameSystem._sandboxNpcTargetAll;
            SoundManager.playOk();
            this.refreshUIDOM();
            return;
        }

        const targets = this._npcTargets();
        if (!targets.length) {
            SoundManager.playBuzzer();
            if (window.ParchmentToast) {
                window.ParchmentToast.show($gameSystem._sandboxNpcTargetAll
                    ? "No NPCs on this map." : "No NPC in front of you.",
                    { severity: "warning", duration: 150 });
            }
            this.refreshUIDOM();
            return;
        }

        let applied = 0;
        for (const t of targets) {
            try { if (this._applyNpcActionOne(id, t.name, t.profile)) applied++; }
            catch (e) { console.warn("[SandboxMode] NPC action failed for", t.name, e); }
        }

        SoundManager.playUseSkill();
        if (window.ParchmentToast) {
            const label = (NPC_ACTIONS.find(a => a.id === id)?.name) || "NPC updated";
            const scope = $gameSystem._sandboxNpcTargetAll
                ? `${applied} NPC${applied === 1 ? "" : "s"}`
                : (targets[0]?.name || "NPC");
            const sev = applied > 0 ? "info" : "warning";
            window.ParchmentToast.show(`${label} , ${scope}`, { severity: sev, duration: 180 });
        }
        this.refreshUIDOM();
    };

    // Apply a single NPC action to one target. Returns true when it changed
    // something. Override fields (_orientOverride, _bioOverride) live on the
    // society profile and are read back by NPCEmpathizeUI.
    Scene_SandboxMenu.prototype._applyNpcActionOne = function (id, name, profile) {
        const LS = window.NPCLifeSim;
        const DS = window.DiseaseSystem;
        const nowMin = () => ($gameVariables ? $gameVariables.value(114) || 0 : 0);
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const ensureRec = () => {
            if (!LS) return null;
            LS.ensureLifeRecord(name, profile._homeGroupName);
            return LS.getRecord(name);
        };

        switch (id) {
            // ── Mood: needs drive the off-screen sim's behaviour + thoughts ──
            case "npc_mood_elated":
            case "npc_mood_content":
            case "npc_mood_miserable": {
                const v = id === "npc_mood_elated" ? 100 : id === "npc_mood_content" ? 75 : 5;
                ["hunger", "sleep", "hygiene", "social", "leisure"].forEach(k => { profile[k] = v; });
                profile.currentNeed = null;
                const thought = id === "npc_mood_miserable"
                    ? "Everything is falling apart..."
                    : id === "npc_mood_content" ? "Not a bad day at all." : "Life has never felt better!";
                profile.thoughts = profile.thoughts || [];
                profile.thoughts.unshift(thought);
                if (profile.thoughts.length > 8) profile.thoughts.length = 8;
                return true;
            }

            // ── Romance ──
            case "npc_romance_break": {
                const rec = ensureRec();
                if (!rec || !rec.partner) return false;
                _sandboxBreakup(rec, name);
                return true;
            }
            case "npc_romance_add": {
                const rec = ensureRec();
                if (!rec || rec.partner) return false;
                const partnerName = this._findFreePartner(name);
                if (!partnerName) return false;
                const minute = nowMin();
                rec.partner = { name: partnerName, external: false };
                rec.partnerSinceMinute = minute;
                rec.maritalStatus = "dating";
                LS.ensureLifeRecord(partnerName);
                const other = LS.getRecord(partnerName);
                if (other) {
                    other.partner = { name, external: false };
                    other.partnerSinceMinute = minute;
                    other.maritalStatus = "dating";
                }
                return true;
            }

            // ── Orientation (Kinsey follows the sexual entry automatically) ──
            case "npc_orient_hetero":
            case "npc_orient_homo":
            case "npc_orient_bi":
            case "npc_orient_ace": {
                const db = loadOrientationDb();
                const romKeyLike = frag => ((db.romantic || []).find(o => o.key && o.key.includes(frag))?.key) || null;
                const map = {
                    npc_orient_hetero: ["heterosexual", romKeyLike("hetero")],
                    npc_orient_homo:   ["homosexual",   romKeyLike("homo")],
                    npc_orient_bi:     ["bisexual",     romKeyLike("bi")],
                    npc_orient_ace:    ["asexual",      romKeyLike("aro")]
                };
                const [sexKey, romKey] = map[id];
                profile._orientOverride = profile._orientOverride || {};
                profile._orientOverride.sexualKey = sexKey;
                if (romKey) profile._orientOverride.romanticKey = romKey;
                return true;
            }
            case "npc_orient_randomize": {
                const db = loadOrientationDb();
                const s = (db.sexual   || []).length ? pick(db.sexual)   : null;
                const r = (db.romantic || []).length ? pick(db.romantic) : null;
                if (!s && !r) return false;
                profile._orientOverride = profile._orientOverride || {};
                if (s) profile._orientOverride.sexualKey   = s.key;
                if (r) profile._orientOverride.romanticKey = r.key;
                return true;
            }

            // ── Bounty ──
            case "npc_bounty_clear":
            case "npc_bounty_add":
            case "npc_bounty_max": {
                const rec = ensureRec();
                if (!rec) return false;
                if (id === "npc_bounty_clear")    rec.wantedBounty = 0;
                else if (id === "npc_bounty_max") rec.wantedBounty = 99999;
                else                              rec.wantedBounty = (rec.wantedBounty || 0) + 5000;
                return true;
            }

            // ── Health ──
            case "npc_health_infect": {
                if (!DS) return false;
                DS.ensureNpcMedicalHistory(name, profile);
                const pool = (DS.all() || []).filter(d => d && d.id);
                if (!pool.length) return false;
                return DS.infectNpc(profile, pick(pool).id);
            }
            case "npc_health_condition": {
                if (!DS) return false;
                DS.ensureNpcMedicalHistory(name, profile);
                const conds = (DS.allConditions() || []).filter(c => c && c.id);
                if (!conds.length) return false;
                const c = pick(conds);
                profile.conditions = profile.conditions || [];
                if (profile.conditions.some(x => (x.id != null ? x.id : x) === c.id)) return false;
                profile.conditions.push({ id: c.id, sinceMin: nowMin() });
                return true;
            }
            case "npc_health_cure": {
                const had = (profile.diseases && profile.diseases.length) ||
                            (profile.conditions && profile.conditions.length);
                profile.diseases = [];
                profile.conditions = [];
                return !!had;
            }

            // ── Body parts (display-side override read by the Biologics tab) ──
            case "npc_body_remove": {
                const parts = window.Health?.Archetypes?.[profile.archetype || "Humanoid"]?.parts;
                if (!parts) return false;
                profile._bioOverride = profile._bioOverride || {};
                const cuttable = Object.keys(parts).filter(k =>
                    !parts[k].vital && parts[k].canCutoff && !profile._bioOverride[k]?.missing);
                if (!cuttable.length) return false;
                profile._bioOverride[pick(cuttable)] = { missing: true };
                return true;
            }
            case "npc_body_regen": {
                const parts = window.Health?.Archetypes?.[profile.archetype || "Humanoid"]?.parts;
                if (!parts) return false;
                profile._bioOverride = profile._bioOverride || {};
                Object.keys(parts).forEach(k => { profile._bioOverride[k] = { missing: false, cond: 100 }; });
                return true;
            }
        }
        return false;
    };

    function isRealEntry(obj) {
        return obj && obj.name && !obj.name.startsWith('<');
    }

    // =========================================================================
    // Background Legacy Window Definitions (Bypassed but kept for Safety)
    // =========================================================================
    function Window_SandboxCommand() {
        this.initialize(...arguments);
    }
    Window_SandboxCommand.prototype = Object.create(Window_Command.prototype);
    Window_SandboxCommand.prototype.constructor = Window_SandboxCommand;
    Window_SandboxCommand.prototype.initialize = function (rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };
    Window_SandboxCommand.prototype.makeCommandList = function () {
        this.addCommand("Dummy", "dummy");
    };

    function Window_SandboxList() {
        this.initialize(...arguments);
    }
    Window_SandboxList.prototype = Object.create(Window_Selectable.prototype);
    Window_SandboxList.prototype.constructor = Window_SandboxList;
    Window_SandboxList.prototype.initialize = function (rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._data = [];
        this._mode = "";
    };
    Window_SandboxList.prototype.setMode = function (mode) {
        this._mode = mode;
        this.refresh();
    };
    Window_SandboxList.prototype.maxItems = function () {
        return this._data ? this._data.length : 0;
    };
    Window_SandboxList.prototype.item = function () {
        return this._data && this.index() >= 0 ? this._data[this.index()] : null;
    };
    Window_SandboxList.prototype.makeItemList = function () {
        this._data = [];
        if (this._mode === "battle") {
            for (let i = 1; i < $dataTroops.length; i++) {
                if (isRealEntry($dataTroops[i])) {
                    this._data.push({ id: i, name: $dataTroops[i].name });
                }
            }
        } else if (this._mode === "item") {
            for (let i = 1; i < $dataItems.length; i++) {
                if (isRealEntry($dataItems[i])) {
                    this._data.push({ type: "item", id: i, name: $dataItems[i].name });
                }
            }
            for (let i = 1; i < $dataWeapons.length; i++) {
                if (isRealEntry($dataWeapons[i])) {
                    this._data.push({ type: "weapon", id: i, name: $dataWeapons[i].name });
                }
            }
            for (let i = 1; i < $dataArmors.length; i++) {
                if (isRealEntry($dataArmors[i])) {
                    this._data.push({ type: "armor", id: i, name: $dataArmors[i].name });
                }
            }
        } else if (this._mode === "event") {
            for (let i = 1; i < $dataCommonEvents.length; i++) {
                if (isRealEntry($dataCommonEvents[i])) {
                    this._data.push({ id: i, name: $dataCommonEvents[i].name });
                }
            }
        } else if (this._mode === "map") {
            // Full depth-first map tree; the scene decides which rows are
            // currently visible (folders start closed) when it renders.
            if (window.$dataMapInfos) {
                this._data = buildMapTreeRows();
                if (!this._data.length) {
                    this._data.push({ id: -1, name: "No maps found!", depth: 0, parentId: 0, childCount: 0, ancestors: [], path: "" });
                }
            } else {
                this._data.push({ id: -1, name: "MapInfos not loaded!", depth: 0, parentId: 0, childCount: 0, ancestors: [], path: "" });
            }
        } else if (this._mode === "voxelplanet") {
            // Every alien biome the world generator knows about
            // (js/db/WorldGen/AlienBiomes.json, merged into WorldGen.Biomes by
            // DataService). Each one is a whole world in the 3D walk: its own
            // colours, its own furniture, its own sky.
            for (const b of voxelPlanetBiomes()) {
                this._data.push({ id: b.name, name: voxelPlanetLabel(b) });
            }
            if (!this._data.length) this._data.push({ id: null, name: "No alien biomes loaded!" });
        } else if (this._mode === "planet") {
            const PT = (window.GalaxySim && window.GalaxySim.PlanetTypes) || {};
            Object.keys(PT).forEach((key) => {
                const nm = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                this._data.push({ id: key, name: nm });
            });
            if (!this._data.length) this._data.push({ id: null, name: "PlanetTypes not loaded!" });
        } else if (this._mode === "status") {
            for (let i = 1; i < $dataStates.length; i++) {
                if (isRealEntry($dataStates[i])) {
                    this._data.push({ id: i, name: $dataStates[i].name });
                }
            }
        } else if (this._mode === "variables") {
            for (let i = 1; i < $dataSystem.variables.length; i++) {
                if ($dataSystem.variables[i]) {
                    this._data.push({ id: i, name: $dataSystem.variables[i] });
                }
            }
        } else if (this._mode === "switches") {
            for (let i = 1; i < $dataSystem.switches.length; i++) {
                if ($dataSystem.switches[i]) {
                    this._data.push({ id: i, name: $dataSystem.switches[i] });
                }
            }
        } else if (this._mode === "discord") {
            this._data = [
                { id: "goto_disk_discord", name: "Travel to the Disk of Discord" }
            ];
        } else if (this._mode === "macro") {
            this._data = [
                { id: "init", name: "Initialize Player" },
                { id: "playtest_boost", name: "Run Playtest Boost" },
                { id: "toggle_3d", name: "Toggle 3D Mode" },
                { id: "heal_all", name: "Heal All Party" },
                { id: "devtools", name: "Open DevTools" },
                { id: "reload_game", name: "Reload Game" },
                { id: "teleport_down", name: "Go Down (Underground)" },
                { id: "teleport_debug", name: "Debug Map Menu" },
                { id: "vehicle_ret_camper", name: "Return to Camper" },
                { id: "vehicle_ret_car", name: "Return to Car" },
                { id: "vehicle_sum_camper", name: "Summon Camper" },
                { id: "vehicle_sum_car", name: "Summon Car" },
                { id: "sleep_inn", name: "Sleep: Inn" },
                { id: "sleep_camp", name: "Sleep: Campfire" }
            ];
        } else if (this._mode === "player") {
            this._data = [
                { id: "base_items", name: "Give Base Item Set" },
                { id: "materials", name: "Give Material Set" },
                { id: "speed_1", name: "Set Speed 1" },
                { id: "speed_2", name: "Set Speed 2" },
                { id: "speed_3", name: "Set Speed 3" },
                { id: "speed_4", name: "Set Speed 4" },
                { id: "speed_5", name: "Set Speed 5" },
                { id: "speed_6", name: "Set Speed 6" },
                { id: "lvl_10", name: "Add Level +10" },
                { id: "lvl_20", name: "Add Level +20" },
                { id: "lvl_30", name: "Add Level +30" },
                { id: "lvl_40", name: "Add Level +40" },
                { id: "lvl_50", name: "Add Level +50" },
                { id: "lvl_60", name: "Add Level +60" },
                { id: "lvl_70", name: "Add Level +70" },
                { id: "lvl_80", name: "Add Level +80" },
                { id: "lvl_90", name: "Add Level +90" },
                { id: "lvl_99", name: "Add Level +99" },
                { id: "death", name: "Death (Brass Sentinel Mk. IV)" },
                { id: "test_battle", name: "Test Battle (Bell Goblin)" }
            ];
        } else if (this._mode === "environment") {
            this._data = [
                { id: "time_plus_1h", name: "Forward 1 Hour" },
                { id: "time_plus_1d", name: "Forward 1 Day" },
                { id: "time_freeze", name: "Toggle Freeze Time" },
                { id: "temp_plus", name: "+10 Degrees" },
                { id: "temp_minus", name: "-10 Degrees" },
                { id: "light_day", name: "Force Day" },
                { id: "light_night", name: "Force Night" },
                { id: "weather_clear", name: "Force Clear" },
                { id: "weather_rain", name: "Force Rain" },
                { id: "weather_storm", name: "Force Storm" },
                { id: "weather_snow", name: "Force Snow" }
            ];
        } else if (this._mode === "biology") {
            this._data = [
                { id: "bio_heal_limbs", name: "Full Heal Limbs & Organs" },
                { id: "bio_cure_all", name: "Cure Infections/Viruses" },
                { id: "bio_pregnancy", name: "Force Pregnancy Advance" },
                { id: "surgery", name: "Open Surgery Menu" },
                { id: "bio_prosthetics", name: "Open Prosthetics Shop" },
                { id: "nut_max", name: "Max Calories/Fat/Protein/Caff" },
                { id: "nut_zero_exhaust", name: "Zero Hunger/Sleep Exhaustion" },
                { id: "nut_overeat", name: "Trigger Overeating" }
            ];
        } else if (this._mode === "economy") {
            this._data = [
                { id: "money", name: "Give 1,000,000 Gold" },
                { id: "econ_pump", name: "Pump Stock Market" },
                { id: "econ_crash", name: "Crash Stock Market" },
                { id: "econ_real_estate", name: "Grant All Properties" },
                { id: "econ_rent", name: "Force Rent Collection" },
                { id: "econ_debt_wipe", name: "Wipe All Debt" },
                { id: "econ_loan_max", name: "Max Loan" },
                { id: "econ_deliveries", name: "Complete Deliveries" }
            ];
        } else if (this._mode === "faction") {
            this._data = [
                { id: "army_spawn_100", name: "Spawn 100 Troops" },
                { id: "army_coherence", name: "Max Coherence" },
                { id: "faction_rep_max", name: "Max Reputation All" },
                { id: "faction_rep_min", name: "Min Reputation All" },
                { id: "crime_clear", name: "Clear Wanted Level" },
                { id: "crime_max", name: "Max Wanted Level" }
            ];
        } else if (this._mode === "world") {
            this._data = [
                { id: "proc_village", name: "Force Village" },
                { id: "proc_city", name: "Force City" },
                { id: "proc_cave", name: "Force Cave" },
                { id: "proc_dungeon", name: "Generate Dungeon (Teleport)" },
                { id: "proc_crypt", name: "Generate Crypt (Teleport)" },
                { id: "proc_sewer", name: "Generate Sewer (Teleport)" },
                { id: "dung_boss", name: "Jump to Boss Floor" },
                { id: "veh_fuel_max", name: "Infinite Fuel (Max Refill)" },
                { id: "proc_debugger", name: "Toggle ProcGen Debugger" },
                { id: "mapshot_size", name: mapshotSizeLabel() },
                { id: "mapshot_export", name: "Export Procedural Map" },
                { id: "world_reveal_map", name: "Reveal Entire Map (Fog)" },
                { id: "world_fly", name: "Toggle Flight" },
                { id: "world_dream", name: "Enter Dream World" }
            ];
        } else if (this._mode === "minigame") {
            this._data = [
                { id: "mini_tokens", name: "Grant 999 Tokens" },
                { id: "mini_frogger", name: "Play Frogger" },
                { id: "mini_snake", name: "Play Snake" },
                { id: "mini_pool", name: "Play Pool" },
                { id: "mini_lockpick", name: "Play Lockpicking" },
                { id: "mini_surf", name: "Play Surfing" },
                { id: "mini_chess", name: "Play Chess" },
                { id: "mini_piano", name: "Play Piano" },
                { id: "farm_miracle", name: "Miracle Grow" },
                { id: "build_sandbox", name: "Open Builder (All Unlocked)" }
            ];
        } else if (this._mode === "systems") {
            this._data = [
                { id: "sys_starmap", name: "Open Star Map" },
                { id: "sys_bestiary", name: "Open Bestiary" },
                { id: "sys_questlog", name: "Open Quest Log" },
                { id: "sys_questboard", name: "Open Quest Board" },
                { id: "sys_pqgen", name: "Generate Procedural Quest" },
                { id: "sys_techtree", name: "Open Tech Tree" },
                { id: "sys_history", name: "Open History Archive" },
                { id: "sys_thinker", name: "Open Thinker Menu" },
                { id: "sys_apiary", name: "Open Apiary" },
                { id: "sys_brewery", name: "Open Brewery" },
                { id: "sys_container", name: "Open Container" },
                { id: "sys_work", name: "Open Work Board" },
                { id: "sys_shop", name: "Open Online Shop" },
                { id: "sys_news", name: "Force News Broadcast" }
            ];
        } else if (this._mode === "animtest") {
            this._data = [
                { id: "anim_test_start_id", name: satStartLabel() },
                { id: "anim_test_all", name: "Cast All Skills (1 Battle Each)" },
                { id: "anim_test_fast", name: "Cast All Skills (Fast)" },
                { id: "anim_test_enemy_start_id", name: satEnemyStartLabel() },
                { id: "anim_test_enemy_all", name: "Enemies Cast Own Skills (1 Battle Each)" },
                { id: "anim_test_enemy_fast", name: "Enemies Cast Own Skills (Fast)" }
            ];
        } else if (this._mode === "erisdate") {
            // First row cycles the mood the evening opens in (unset = the date
            // rolls its own), then the party's own biome, a random one, and
            // every biome ErisDateSystem has prose for, in name order.
            const eris = window.ErisDateSystem;
            if (eris) {
                const mood = $gameSystem._sandboxErisMood;
                const moodName = mood ? eris.moodLabel(mood) : T("ErisDate.sandbox.moodRandom");
                this._data.push({ id: "eris_mood", name: T("ErisDate.sandbox.mood", { mood: moodName }) });
                this._data.push({
                    id: "eris_here",
                    name: T("ErisDate.sandbox.here", { biome: sandboxBiomeLabel(eris.currentBiome()) })
                });
                this._data.push({ id: "eris_random", name: T("ErisDate.sandbox.random") });
                eris.biomes()
                    .map(key => ({ id: "eris_biome:" + key, name: sandboxBiomeLabel(key) }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach(row => this._data.push(row));
            }
        } else if (this._mode === "npc") {
            this._data = NPC_ACTIONS.map(a => ({ id: a.id, name: a.name }));
        } else if (this._mode === "wish") {
            if (!this._wishData) {
                this._wishData = this.generateRandomWishes();
            }
            this._data = this._wishData;
        }
    };
    Window_SandboxList.prototype.refresh = function () {
        this.makeItemList();
        Window_Selectable.prototype.refresh.call(this);
    };
    Window_SandboxList.prototype.generateRandomWishes = function () {
        const list = [];
        const psi = this.getMedianPartyPSI();
        const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

        const items = $dataItems.filter(isRealEntry);
        const weapons = $dataWeapons.filter(isRealEntry);
        const armors = $dataArmors.filter(isRealEntry);
        const troops = $dataTroops.filter(isRealEntry);
        const states = $dataStates.filter(isRealEntry);
        const macros = [
            { id: "init", name: "Setup: Initialize Player" },
            { id: "money", name: "Wealth: Give 1,000,000 Gold" },
            { id: "time_plus_1d", name: "Time: Forward 1 Day" },
            { id: "teleport_down", name: "Teleport: Go Down (Underground)" },
            { id: "bio_heal_limbs", name: "Health: Full Heal Limbs & Organs" },
            { id: "econ_pump", name: "Market: Pump Stock Market" }
        ];

        const availableTypes = [];
        if (items.length > 0) availableTypes.push("item");
        if (weapons.length > 0) availableTypes.push("weapon");
        if (armors.length > 0) availableTypes.push("armor");
        if (troops.length > 0) availableTypes.push("battle");
        if (states.length > 0) availableTypes.push("status");
        if (macros.length > 0) availableTypes.push("macro");

        for (let i = 0; i < 20; i++) {
            const type = getRandom(availableTypes);
            if (type === "item") {
                const item = getRandom(items);
                list.push({ mode: "item", type: "item", id: item.id, name: item.name });
            } else if (type === "weapon") {
                const weapon = getRandom(weapons);
                list.push({ mode: "item", type: "weapon", id: weapon.id, name: weapon.name });
            } else if (type === "armor") {
                const armor = getRandom(armors);
                list.push({ mode: "item", type: "armor", id: armor.id, name: armor.name });
            } else if (type === "macro") {
                const macro = getRandom(macros);
                list.push({ mode: "macro", id: macro.id, name: macro.name });
            } else if (type === "battle") {
                const troop = getRandom(troops);
                list.push({ mode: "battle", id: troop.id, name: troop.name });
            } else if (type === "status") {
                const state = getRandom(states);
                list.push({ mode: "status", id: state.id, name: state.name });
            }
        }

        list.forEach(entry => {
            entry.wishingPhrase = this.generateWishPhrase(entry, entry.mode, psi);
        });

        return list;
    };
    Window_SandboxList.prototype.getMedianPartyPSI = function () {
        const lucks = $gameParty.members().map(actor => actor.luk);
        if (lucks.length === 0) return 10;
        lucks.sort((a, b) => a - b);
        const mid = Math.floor(lucks.length / 2);
        return lucks.length % 2 !== 0 ? lucks[mid] : (lucks[mid - 1] + lucks[mid]) / 2;
    };
    Window_SandboxList.prototype.generateWishPhrase = function (entry, mode, psi) {
        const isCryptic = psi < 50;
        const isVeryCryptic = psi < 25;

        const verbsDirect = ["I wish for", "Grant me", "I desire", "Bring me"];
        const verbsCryptic = ["I seek the essence of", "My soul yearns for", "Manifest the", "I call upon the"];

        let name = entry.name;
        if (isVeryCryptic) name = this.scrambleString(name);

        const verb = isCryptic ?
            verbsCryptic[Math.floor(Math.random() * verbsCryptic.length)] :
            verbsDirect[Math.floor(Math.random() * verbsDirect.length)];

        return `${verb} ${name}.`;
    };
    Window_SandboxList.prototype.scrambleString = function (str) {
        const arr = str.split('');
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr.join('');
    };

    // =========================================================================
    // Core MZ Hooks & Scene bindings
    // =========================================================================
    window.Scene_SandboxMenu = Scene_SandboxMenu;

    PluginManager.registerCommand("SandboxMode", "openWishingSystem", args => {
        $gameTemp._sandboxStartMode = "wish";
        SceneManager.push(Scene_SandboxMenu);
    });

    const _Scene_SandboxMenu_update = Scene_SandboxMenu.prototype.update;
    Scene_SandboxMenu.prototype.update = function () {
        _Scene_SandboxMenu_update.call(this);
        UISandboxInputManager.update();
    };

    // =========================================================================
    // Sequential Skill Animation Test: one battle per skill.
    // -------------------------------------------------------------------------
    // The run opens a battle against a single enemy, forces the party leader to
    // cast the run's current skill (so the real animation, sound, damage popup
    // and battle log all play exactly as they would in a normal fight), ends
    // that battle as soon as the action resolves, then opens the next battle
    // with the NEXT skill against the NEXT enemy, until every skill was shown.
    // Each cast is logged with the skill name and the animation it uses, and
    // printed on screen too. Cancel (Esc / right click) stops the run.
    //
    // Two runs share this machinery, told apart by seq.mode:
    //   "actor" - every skill of the database, cast by the party leader.
    //   "enemy" - every enemy of the database casting ITS OWN skills (the ones
    //             on its action list), aimed at itself when the skill is a self
    //             buff/heal and at the party when it is offensive.
    // =========================================================================
    const SAT_START_WAIT   = 20;   // frames to let a fresh battle settle
    const SAT_START_LIMIT  = 240;  // give up waiting for the input phase
    const SAT_CAST_LIMIT   = 300;  // give up waiting for the forced action to start
    const SAT_ACTION_LIMIT = 900;  // hard cap on a single skill's action

    // Ids 1-31 are the engine/system skills (Attack, Guard, the stat attacks,
    // the blank slots) plus the first school divider, none of which are worth a
    // battle of their own, so the run opens on the first real school skill.
    const SAT_FIRST_SKILL_ID = 32;

    // Skill id the next run starts from, set from the sandbox menu. Every cast
    // is logged with its real skill id, so a run stopped halfway is resumed by
    // typing the last id back in instead of sitting through the earlier ones.
    let satStartSkillId = SAT_FIRST_SKILL_ID;
    // Enemy id the enemy-cast run starts from (same idea, one run per enemy).
    let satStartEnemyId = 1;

    // -------------------------------------------------------------------------
    // Crash-proof progress. A run of a few thousand battles will sooner or
    // later meet an animation that takes the game down with it, and by then
    // $gameTemp (and the console) are gone, so the point reached is written to
    // localStorage on every single cast instead. Two ids are kept per run:
    //   last - the cast that was starting when the record was written, i.e. the
    //          suspect if the game never came back.
    //   prev - the cast BEFORE it, the last one known to have played through,
    //          which is what the menu offers as the resume point.
    // -------------------------------------------------------------------------
    const SAT_PROGRESS_KEY = "SandboxMode.animTestProgress";
    let satProgress = { actor: { prev: null, last: null }, enemy: { prev: null, last: null } };

    function satSaveProgress() {
        try {
            window.localStorage.setItem(SAT_PROGRESS_KEY, JSON.stringify(satProgress));
        } catch (e) { /* no storage: the run still works, it just cannot resume */ }
    }

    function satLoadProgress() {
        try {
            const raw = window.localStorage.getItem(SAT_PROGRESS_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data) return;
            if (data.actor) satProgress.actor = data.actor;
            if (data.enemy) satProgress.enemy = data.enemy;
        } catch (e) { /* a broken record simply means "no resume point" */ }
    }

    // Written when a cast is fired, so the record survives whatever that cast
    // does to the game. `entry` is { skillId, enemyId }.
    function satRecordProgress(seq, entry) {
        const rec = seq.mode === "enemy" ? satProgress.enemy : satProgress.actor;
        rec.prev = rec.last;
        rec.last = entry;
        satSaveProgress();
    }

    function satClearProgress(mode) {
        satProgress[mode === "enemy" ? "enemy" : "actor"] = { prev: null, last: null };
        satSaveProgress();
    }

    satLoadProgress();
    // Reopen the menu on the safe id of the interrupted run rather than on the
    // start of the database.
    if (satProgress.actor.prev && satProgress.actor.prev.skillId) {
        satStartSkillId = satProgress.actor.prev.skillId;
    }
    if (satProgress.enemy.prev && satProgress.enemy.prev.enemyId) {
        satStartEnemyId = satProgress.enemy.prev.enemyId;
    }

    function satStartLabel() {
        const skill = $dataSkills && $dataSkills[satStartSkillId];
        const name = isRealEntry(skill) ? ` - ${skill.name}` : "";
        const last = satProgress.actor.last;
        const crash = last && last.skillId ? `  (last reached: ${last.skillId})` : "";
        return `Start From Skill ID: ${satStartSkillId}${name}${crash}`;
    }

    function satEnemyStartLabel() {
        const enemy = $dataEnemies && $dataEnemies[satStartEnemyId];
        const name = isRealEntry(enemy) ? ` - ${enemy.name}` : "";
        const last = satProgress.enemy.last;
        const crash = last && last.enemyId
            ? `  (last reached: enemy ${last.enemyId}, skill ${last.skillId})`
            : "";
        return `Start From Enemy ID: ${satStartEnemyId}${name}${crash}`;
    }

    // Skills worth showing: real entries that are usable in battle and actually
    // play an animation (animationId 0 means "no animation at all"). School
    // dividers such as "<-- MartialArts -->" are not real skills and are
    // dropped by isRealEntry, which rejects every name starting with "<".
    // `startId` is honoured as typed (down to id 1) so the engine slots can be
    // inspected too when they are asked for explicitly.
    function collectTestSkills(startId) {
        const from = Math.max(1, Math.floor(Number(startId)) || SAT_FIRST_SKILL_ID);
        const out = [];
        for (let i = from; i < $dataSkills.length; i++) {
            const s = $dataSkills[i];
            if (!isRealEntry(s)) continue;
            if (s.occasion !== 0 && s.occasion !== 1) continue; // not usable in battle
            if (!s.animationId) continue;                       // nothing to look at
            out.push(i);
        }
        return out;
    }

    function collectTestEnemies() {
        const out = [];
        for (let i = 1; i < $dataEnemies.length; i++) {
            if (isRealEntry($dataEnemies[i])) out.push(i);
        }
        return out;
    }

    // The skills an enemy actually owns: its action list, deduped and filtered
    // the same way the party run filters the database.
    function collectEnemyOwnSkills(enemyId) {
        const enemy = $dataEnemies[enemyId];
        if (!isRealEntry(enemy) || !enemy.actions) return [];
        const out = [];
        for (const action of enemy.actions) {
            const id = action && action.skillId;
            const skill = id ? $dataSkills[id] : null;
            if (!isRealEntry(skill)) continue;
            if (skill.occasion !== 0 && skill.occasion !== 1) continue;
            if (!skill.animationId) continue;
            if (out.includes(id)) continue;
            out.push(id);
        }
        return out;
    }

    // One entry per (enemy, own skill) pair, in database order, so the run
    // walks enemy by enemy through everything each of them can cast.
    function collectEnemySkillPairs(startEnemyId) {
        const from = Math.max(1, Math.floor(Number(startEnemyId)) || 1);
        const pairs = [];
        for (let i = from; i < $dataEnemies.length; i++) {
            for (const skillId of collectEnemyOwnSkills(i)) {
                pairs.push({ enemyId: i, skillId: skillId });
            }
        }
        return pairs;
    }

    // Scope 0 (none) and 7+ (allies / the user) point at the caster's own side,
    // so a self buff or a heal is shown on the enemy itself; anything else is
    // aimed at the party.
    function satTargetsOwnSide(skill) {
        return skill.scope === 0 || skill.scope >= 7;
    }

    // Current skill / enemy of the run, whichever mode it is in.
    function satSkillIdOf(seq) {
        return seq.mode === "enemy" ? seq.pairs[seq.index].skillId : seq.skills[seq.index];
    }

    function satEnemyIdOf(seq) {
        return seq.mode === "enemy"
            ? seq.pairs[seq.index].enemyId
            : seq.enemies[seq.enemyPos % seq.enemies.length];
    }

    function satLength(seq) {
        return seq.mode === "enemy" ? seq.pairs.length : seq.skills.length;
    }

    // Any troop with at least one real member, used as the base troop every
    // battle is set up with before its members are swapped for the test enemy.
    function firstValidTroopId() {
        for (let i = 1; i < $dataTroops.length; i++) {
            const t = $dataTroops[i];
            if (isRealEntry(t) && t.members && t.members.some(m => m.enemyId > 0)) return i;
        }
        return 0;
    }

    // "#402 "Fire Burst" [procedural/FireBurst]" for the log/on-screen line.
    function describeTestAnimation(animationId, subject) {
        let id = animationId;
        if (id < 0) id = subject && subject.attackAnimationId1 ? subject.attackAnimationId1() : 0;
        if (!id) return "(none)";
        const anim = $dataAnimations[id];
        if (!anim) return `#${id} (empty slot)`;
        const effect = anim.effectName ? ` [${anim.effectName}]` : "";
        const tag = animationId < 0 ? " (normal attack)" : "";
        return `#${id} "${anim.name || "(unnamed)"}"${effect}${tag}`;
    }

    // Replace the troop's members with one instance of `enemyId`, so each
    // battle of the run faces the next enemy of the database.
    function setSingleEnemyTroop(enemyId) {
        try {
            const x = Math.round(Graphics.boxWidth * 0.5);
            const y = Math.round(Graphics.boxHeight * 0.6);
            const enemy = new Game_Enemy(enemyId, x, y);
            $gameTroop._enemies = [enemy];
            $gameTroop.makeUniqueNames();
            return true;
        } catch (e) {
            console.warn(`[SkillAnimTest] Enemy ${enemyId} could not be spawned, keeping the base troop.`, e);
            return false;
        }
    }

    function beginAnimTestRun(seq) {
        $gameTemp._sandboxSkillAnimTest = seq;
        // The run is entered straight from the menu, so remember the map track
        // here: finishSkillAnimTest() puts it back when the run is over.
        BattleManager.saveBgmAndBgs();
        SceneManager.goto(Scene_Battle);
        return true;
    }

    function startSkillAnimTest(delay) {
        const skills = collectTestSkills(satStartSkillId);
        const enemies = collectTestEnemies();
        const baseTroopId = firstValidTroopId();
        if (skills.length === 0 || enemies.length === 0 || !baseTroopId) {
            console.warn(`[SkillAnimTest] Nothing to test from skill id ${satStartSkillId} on (no battle skills, enemies or troops found).`);
            SoundManager.playBuzzer();
            return false;
        }
        console.log(`[SkillAnimTest] Start at skill ${skills[0]} "${$dataSkills[skills[0]].name}" (requested id ${satStartSkillId}), ${skills.length} skills up to id ${skills[skills.length - 1]} over ${enemies.length} enemies, ${delay}f hold after each cast. Press Esc to stop.`);
        return beginAnimTestRun({
            active: true,
            mode: "actor",
            cancelled: false,
            pending: true,      // the next battle still needs its setup
            skills: skills,
            enemies: enemies,
            baseTroopId: baseTroopId,
            index: 0,
            enemyPos: 0,
            delay: delay,
            state: "wait",
            timer: SAT_START_WAIT,
            guard: 0,
            started: false
        });
    }

    // Same run, other side of the field: each enemy casts the skills of its own
    // action list, on itself when the skill is a self buff/heal and on the party
    // when it is offensive.
    function startEnemyAnimTest(delay) {
        const pairs = collectEnemySkillPairs(satStartEnemyId);
        const baseTroopId = firstValidTroopId();
        if (pairs.length === 0 || !baseTroopId) {
            console.warn(`[SkillAnimTest] Nothing to test from enemy id ${satStartEnemyId} on (no enemy with animated battle skills, or no troop found).`);
            SoundManager.playBuzzer();
            return false;
        }
        const first = pairs[0];
        const enemyCount = new Set(pairs.map(p => p.enemyId)).size;
        console.log(`[SkillAnimTest] Enemy run: start at enemy ${first.enemyId} "${$dataEnemies[first.enemyId].name}" (requested id ${satStartEnemyId}), ${pairs.length} casts over ${enemyCount} enemies, ${delay}f hold after each cast. Press Esc to stop.`);
        return beginAnimTestRun({
            active: true,
            mode: "enemy",
            cancelled: false,
            pending: true,
            pairs: pairs,
            baseTroopId: baseTroopId,
            index: 0,
            enemyPos: 0,
            delay: delay,
            state: "wait",
            timer: SAT_START_WAIT,
            guard: 0,
            started: false
        });
    }

    // Set up the battle for the run's current skill/enemy pair. Called from
    // Scene_Battle.create so the previous battle scene is fully gone by then.
    function prepareSkillAnimBattle(seq) {
        seq.pending = false;
        seq.state = "wait";
        seq.timer = SAT_START_WAIT;
        seq.guard = 0;
        seq.started = false;
        // The party stays fresh across the whole run so a self-damaging skill
        // or a stray enemy turn can never turn the test into a game over.
        $gameParty.members().forEach(a => { a.clearStates(); a.recoverAll(); a.clearActions(); });
        BattleManager.setEventCallback(null);
        BattleManager.setup(seq.baseTroopId, true, true);
        setSingleEnemyTroop(satEnemyIdOf(seq));
    }

    // Move on to the next skill/enemy pair, or close the run when done.
    function advanceSkillAnimTest() {
        const seq = $gameTemp._sandboxSkillAnimTest;
        if (!seq) return;
        if (seq.cancelled) {
            if (seq.mode === "enemy") {
                const pair = seq.pairs[seq.index];
                satStartEnemyId = pair.enemyId;
                console.log(`[SkillAnimTest] Stopped at enemy ${pair.enemyId}, skill ${pair.skillId}. Resume from that enemy via "Start From Enemy ID".`);
            } else {
                satStartSkillId = seq.skills[seq.index];
                console.log(`[SkillAnimTest] Stopped at skill ${seq.skills[seq.index]}. Resume from that id via "Start From Skill ID".`);
            }
            finishSkillAnimTest();
            return;
        }
        seq.index++;
        seq.enemyPos++;
        if (seq.index >= satLength(seq)) {
            console.log(`[SkillAnimTest] Finished, ${satLength(seq)} casts played.`);
            // A run that reached the end has no crash to resume from.
            satClearProgress(seq.mode);
            if (seq.mode === "enemy") satStartEnemyId = 1;
            else satStartSkillId = SAT_FIRST_SKILL_ID;
            finishSkillAnimTest();
            return;
        }
        seq.pending = true;
        SceneManager.goto(Scene_Battle);
    }

    function finishSkillAnimTest() {
        $gameTemp._sandboxSkillAnimTest = null;
        $gameParty.members().forEach(a => { a.clearStates(); a.recoverAll(); a.clearActions(); });
        BattleManager.replayBgmAndBgs();
        SceneManager.goto(Scene_SandboxMenu);
    }

    function isSkillAnimTestRunning() {
        const seq = $gameTemp && $gameTemp._sandboxSkillAnimTest;
        return !!(seq && seq.active);
    }

    // While the run is on, every battle end (abort, victory or defeat) chains
    // into the next battle instead of popping back to the map.
    const _BattleManager_updateBattleEnd_skillTest = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function () {
        if (isSkillAnimTestRunning()) {
            this._phase = "";
            this._escaped = false;
            advanceSkillAnimTest();
            return;
        }
        _BattleManager_updateBattleEnd_skillTest.call(this);
    };

    // The run drives the leader itself, so the input phase is kept plain: no
    // other plugin gets to auto-attack on the spot (1 actor vs the 1 test enemy)
    // and kill it before the skill fires.
    const _BattleManager_startInput_skillTest = BattleManager.startInput;
    BattleManager.startInput = function () {
        if (isSkillAnimTestRunning()) {
            this._phase = "input";
            this._inputting = true;
            this._currentActor = null;
            $gameParty.makeActions();
            $gameTroop.makeActions();
            return;
        }
        _BattleManager_startInput_skillTest.call(this);
    };

    // Wiping out the troop or the party mid-test just ends that battle: no
    // rewards screen, no death/respawn machinery, straight to the next skill.
    const _BattleManager_processVictory_skillTest = BattleManager.processVictory;
    BattleManager.processVictory = function () {
        if (isSkillAnimTestRunning()) { this.processAbort(); return; }
        _BattleManager_processVictory_skillTest.call(this);
    };

    // One continuous battle track for the whole run instead of a BGM restart
    // (and a map-BGM flash) on every single-skill battle.
    const _BattleManager_playBattleBgm_skillTest = BattleManager.playBattleBgm;
    BattleManager.playBattleBgm = function () {
        if (isSkillAnimTestRunning() && $gameTemp._sandboxSkillAnimTest.index > 0) return;
        _BattleManager_playBattleBgm_skillTest.call(this);
    };

    const _BattleManager_replayBgmAndBgs_skillTest = BattleManager.replayBgmAndBgs;
    BattleManager.replayBgmAndBgs = function () {
        if (isSkillAnimTestRunning()) return; // restored by finishSkillAnimTest()
        _BattleManager_replayBgmAndBgs_skillTest.call(this);
    };

    const _BattleManager_processDefeat_skillTest = BattleManager.processDefeat;
    BattleManager.processDefeat = function () {
        if (isSkillAnimTestRunning()) {
            console.log("[SkillAnimTest] The party went down to its own skill, reviving.");
            $gameParty.members().forEach(a => { a.clearStates(); a.recoverAll(); });
            this.processAbort();
            return;
        }
        _BattleManager_processDefeat_skillTest.call(this);
    };

    const _Scene_Battle_create_skillTest = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function () {
        const seq = $gameTemp._sandboxSkillAnimTest;
        if (seq && seq.active && seq.pending) prepareSkillAnimBattle(seq);
        _Scene_Battle_create_skillTest.call(this);
        if (seq && seq.active) this.createSkillAnimTestLabel();
    };

    const _Scene_Battle_update_skillTest = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update_skillTest.call(this);
        const seq = $gameTemp._sandboxSkillAnimTest;
        if (seq && seq.active) this.updateSkillAnimTest(seq);
    };

    Scene_Battle.prototype.createSkillAnimTestLabel = function () {
        const bitmap = new Bitmap(Graphics.width, 76);
        const sprite = new Sprite(bitmap);
        sprite.x = 0;
        sprite.y = 6;
        this.addChild(sprite);
        this._skillAnimTestLabel = sprite;
    };

    Scene_Battle.prototype.refreshSkillAnimTestLabel = function (line1, line2) {
        const sprite = this._skillAnimTestLabel;
        if (!sprite) return;
        const b = sprite.bitmap;
        b.clear();
        b.outlineColor = "rgba(0, 0, 0, 0.9)";
        b.outlineWidth = 5;
        b.fontSize = 22;
        b.textColor = cssColor('--accent-amber-glow', '#ffe9a8');
        b.drawText(line1, 0, 0, b.width, 32, "center");
        b.fontSize = 18;
        b.textColor = cssColor('--accent-frost-glow', '#cfe6ff');
        b.drawText(line2, 0, 34, b.width, 28, "center");
    };

    Scene_Battle.prototype.updateSkillAnimTest = function (seq) {
        if (seq.state !== "ending" && (Input.isTriggered("cancel") || TouchInput.isCancelled())) {
            seq.cancelled = true;
            seq.state = "ending";
            BattleManager.processAbort();
            return;
        }
        if (seq.state === "wait") {
            const phase = BattleManager._phase;
            const ready = phase === "input" || phase === "turn" || phase === "action";
            if (seq.timer > 0) { seq.timer--; return; }
            if (!ready) {
                // Never hang if some other battle plugin swallows the input phase.
                if (++seq.guard < SAT_START_LIMIT) return;
                console.warn("[SkillAnimTest] Battle never reached the input phase, skipping this skill.");
                seq.state = "ending";
                BattleManager.processAbort();
                return;
            }
            if (seq.mode === "enemy") this.castEnemyAnimTest(seq);
            else this.castSkillAnimTest(seq);
            return;
        }
        if (seq.state === "running") {
            seq.guard++;
            const busy = BattleManager._phase === "action" || BattleManager.isBusy();
            if (!seq.started) {
                // Only start timing once THIS skill is the action being played,
                // so an unrelated action can never cut the cast short.
                const action = BattleManager._action;
                const item = action && action.isSkill && action.isSkill() ? action.item() : null;
                if (item && item.id === satSkillIdOf(seq)) seq.started = true;
                else if (seq.guard < SAT_CAST_LIMIT) return;
                else {
                    console.warn(`[SkillAnimTest] Skill ${satSkillIdOf(seq)} never got its turn, moving on.`);
                    seq.state = "ending";
                    BattleManager.processAbort();
                    return;
                }
            }
            if (busy && seq.guard < SAT_ACTION_LIMIT) { seq.timer = seq.delay; return; }
            if (seq.timer > 0 && seq.guard < SAT_ACTION_LIMIT) { seq.timer--; return; }
            seq.state = "ending";
            BattleManager.processAbort();
        }
    };

    // Force the leader to cast the run's current skill on the test enemy.
    Scene_Battle.prototype.castSkillAnimTest = function (seq) {
        const skillId = satSkillIdOf(seq);
        const skill = $dataSkills[skillId];
        const actor = $gameParty.aliveMembers()[0] || $gameParty.members()[0];
        const enemies = $gameTroop.members();
        const targetIndex = Math.max(0, enemies.findIndex(e => e.isAlive()));
        if (!skill || !actor || enemies.length === 0) {
            console.warn(`[SkillAnimTest] Skipping skill ${skillId}: no caster or no enemy.`);
            seq.state = "ending";
            BattleManager.processAbort();
            return;
        }

        // Leave the input phase (forced actions are only processed from the
        // turn phase) and silence everyone else so only this skill plays.
        if (BattleManager._phase === "input" || BattleManager.isInputting()) {
            if (this.closeCommandWindows) this.closeCommandWindows();
            BattleManager.startTurn();
        }
        $gameParty.members().forEach(m => { if (m !== actor) m.clearActions(); });
        $gameTroop.members().forEach(e => e.clearActions());

        // Written before the cast, so it is on disk even if this very
        // animation is the one that takes the game down.
        satRecordProgress(seq, { skillId: skillId, enemyId: satEnemyIdOf(seq) });

        actor.forceAction(skillId, targetIndex);
        BattleManager.forceAction(actor);

        const enemyName = enemies[targetIndex] ? enemies[targetIndex].name() : "(none)";
        const animation = describeTestAnimation(skill.animationId, actor);
        // Every number printed here is a real database id (skill id, then the
        // animation id inside describeTestAnimation), never a run counter, so a
        // line can be read straight back into "Start From Skill ID".
        console.log(`[SkillAnimTest] skill ${skillId} "${skill.name}" | animation ${animation} | ${actor.name()} vs ${enemyName} | ${satLength(seq) - seq.index - 1} left`);
        this.refreshSkillAnimTestLabel(
            `skill ${skillId}  ${skill.name}`,
            `animation ${animation}  vs ${enemyName}`
        );

        seq.state = "running";
        seq.guard = 0;
        seq.started = false;
        seq.timer = seq.delay;
    };

    // Enemy run: the test enemy casts one of its own skills, on itself when the
    // skill points at its own side (self buff, heal, revive) and on the party
    // otherwise. The party never acts, so nothing but this cast is on screen.
    Scene_Battle.prototype.castEnemyAnimTest = function (seq) {
        const pair = seq.pairs[seq.index];
        const skillId = pair.skillId;
        const skill = $dataSkills[skillId];
        const enemy = $gameTroop.members()[0];
        const partyMembers = $gameParty.members();
        if (!skill || !enemy || partyMembers.length === 0) {
            console.warn(`[SkillAnimTest] Skipping enemy ${pair.enemyId} skill ${skillId}: no caster or no party.`);
            seq.state = "ending";
            BattleManager.processAbort();
            return;
        }

        if (BattleManager._phase === "input" || BattleManager.isInputting()) {
            if (this.closeCommandWindows) this.closeCommandWindows();
            BattleManager.startTurn();
        }
        $gameParty.members().forEach(m => m.clearActions());
        $gameTroop.members().forEach(e => e.clearActions());

        // Own-side scopes index into the troop (one member, so 0), the rest
        // index into the party.
        const onSelf = satTargetsOwnSide(skill);
        const aliveIndex = partyMembers.findIndex(m => m.isAlive());
        const targetIndex = onSelf ? 0 : Math.max(0, aliveIndex);
        const targetName = onSelf ? enemy.name() : partyMembers[targetIndex].name();

        // The enemy has to be able to pay for its own skill, and it must not be
        // sealed out of it by a state (recoverAll clears them and revives it).
        enemy.recoverAll();

        satRecordProgress(seq, { skillId: skillId, enemyId: pair.enemyId });

        enemy.forceAction(skillId, targetIndex);
        BattleManager.forceAction(enemy);

        const animation = describeTestAnimation(skill.animationId, enemy);
        console.log(`[SkillAnimTest] enemy ${pair.enemyId} "${enemy.name()}" | skill ${skillId} "${skill.name}" | animation ${animation} | on ${onSelf ? "itself" : targetName} | ${satLength(seq) - seq.index - 1} left`);
        this.refreshSkillAnimTestLabel(
            `enemy ${pair.enemyId}  ${enemy.name()}  casts  ${skill.name} (${skillId})`,
            `animation ${animation}  on ${onSelf ? "itself" : targetName}`
        );

        seq.state = "running";
        seq.guard = 0;
        seq.started = false;
        seq.timer = seq.delay;
    };

    // =========================================================================
    // Playtest Boost Integration (Preserved)
    // =========================================================================
    const goldAmount = 10000;
    const itemCount = 20;
    const skillCount = 30;

    function isTestPlayer() {
        if ($gameParty.allMembers().length > 0) {
            const actor = $gameParty.allMembers()[0];
            return actor.name().toLowerCase() === 'test';
        }
        return false;
    }

    function getRandomItems(count) {
        const items = [];
        const maxItems = $dataItems.length - 1;
        const maxWeapons = $dataWeapons.length - 1;
        const maxArmors = $dataArmors.length - 1;

        for (let i = 0; i < count; i++) {
            const itemType = Math.floor(Math.random() * 3);
            let itemId;
            let amount = Math.floor(Math.random() * 5) + 1;

            switch (itemType) {
                case 0:
                    itemId = Math.floor(Math.random() * maxItems) + 1;
                    if (isRealEntry($dataItems[itemId])) {
                        items.push({ type: 0, id: itemId, amount: amount });
                    }
                    break;
                case 1:
                    itemId = Math.floor(Math.random() * maxWeapons) + 1;
                    if (isRealEntry($dataWeapons[itemId])) {
                        items.push({ type: 1, id: itemId, amount: 1 });
                    }
                    break;
                case 2:
                    itemId = Math.floor(Math.random() * maxArmors) + 1;
                    if (isRealEntry($dataArmors[itemId])) {
                        items.push({ type: 2, id: itemId, amount: 1 });
                    }
                    break;
            }
        }
        return items;
    }

    function getRandomSkills(count) {
        const skills = [];
        const maxSkills = $dataSkills.length - 1;

        for (let i = 0; i < count; i++) {
            const skillId = Math.floor(Math.random() * maxSkills) + 1;
            if (isRealEntry($dataSkills[skillId]) && !skills.includes(skillId)) {
                skills.push(skillId);
            }
        }
        return skills;
    }

    function applyPlaytestBonuses() {
        if (!isTestPlayer()) return;

        console.log('Applying playtest bonuses (integrated from PlaytestBoost)...');
        $gameParty.gainGold(goldAmount);

        // Sandbox start-of-game endowment: a round million on hand plus a starter
        // stock portfolio (20 OIL shares in var 51, 20 SOUL shares in var 52) with
        // the stock market unlocked (switch 24) so the holdings are usable.
        $gameParty.gainGold(1000000);
        $gameVariables.setValue(51, 20);
        $gameVariables.setValue(52, 20);
        $gameSwitches.setValue(24, true);

        const baseItems = ['Fishing Rod', 'Travel Journal', 'Star map', 'Bestiary', 'Raman probe', 'Diving suit', 'Shovel', 'Utensil Set', 'Local Map', 'Telescope'];
        baseItems.forEach(name => {
            const itemObj = $dataItems.find(i => i && i.name === name);
            if (itemObj) $gameParty.gainItem(itemObj, 1);
        });
        if ($dataItems[125]) $gameParty.gainItem($dataItems[125], 20);

        const randomItems = getRandomItems(itemCount);
        randomItems.forEach(item => {
            switch (item.type) {
                case 0: $gameParty.gainItem($dataItems[item.id], item.amount); break;
                case 1: $gameParty.gainItem($dataWeapons[item.id], item.amount); break;
                case 2: $gameParty.gainItem($dataArmors[item.id], item.amount); break;
            }
        });

        if ($gameParty.allMembers().length > 0) {
            const actor = $gameParty.allMembers()[0];
            const startingSkills = [2, 3, 4, 10, 836, 837, 838, 839];

            startingSkills.forEach(skillId => {
                if ($dataSkills[skillId]) actor.learnSkill(skillId);
            });

            const randomSkills = getRandomSkills(skillCount);
            randomSkills.forEach(skillId => {
                if (!startingSkills.includes(skillId)) actor.learnSkill(skillId);
            });
        }
    }

    function callCommonEventIfNeeded() {
        if ($gameMap.mapId() !== 557) {
            setTimeout(() => {
                $gameTemp.reserveCommonEvent(149);
            }, 2000);
        }
    }

    function pickRandomIds(list, count) {
        const ids = [];
        for (let i = 1; i < list.length; i++) {
            if (isRealEntry(list[i])) ids.push(i);
        }
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        return ids.slice(0, count);
    }

    function grantAllSandboxItems() {
        const MATERIAL_AMOUNT = 9999;
        const ALCHEMISTRY_AMOUNT = 30;

        // 20 random weapons, armors, and items (instead of the full roster).
        pickRandomIds($dataWeapons, 20).forEach(id => $gameParty.gainItem($dataWeapons[id], 1));
        pickRandomIds($dataArmors, 20).forEach(id => $gameParty.gainItem($dataArmors[id], 1));
        pickRandomIds($dataItems, 20).forEach(id => $gameParty.gainItem($dataItems[id], Math.floor(Math.random() * 5) + 1));

        // Generous stock of crafting materials.
        const mats = ['Salvaged steel', 'Titanium ore', 'Varlenia ore', 'Crystal', 'Glass', 'Wood', 'Leather', 'Cloth', 'Bone', 'Meat', 'Plant matter', 'Herb extract', 'Oil Flask', 'Acidic Solution', 'Arcane Essence', 'Ethereal Shard', 'Quantum Core', 'Circuit Board', 'Microchip', 'Battery Cell', 'Plastic Polymer', 'Composite Resin', 'Nanotube Module'];
        mats.forEach(name => {
            const itemObj = $dataItems.find(it => it && it.name === name);
            if (itemObj) $gameParty.gainItem(itemObj, MATERIAL_AMOUNT);
        });

        // Generous stock of alchemistry reagents (items tagged <category: Alchemistry>).
        for (let i = 1; i < $dataItems.length; i++) {
            const item = $dataItems[i];
            if (isRealEntry(item) && item.note && /<category:\s*Alchemistry\s*>/i.test(item.note)) {
                $gameParty.gainItem(item, ALCHEMISTRY_AMOUNT);
            }
        }

        // Utility tools remain available so the sandbox stays playable.
        const grantTools = (list) => {
            for (let i = 1; i < list.length; i++) {
                const item = list[i];
                if (isRealEntry(item) && window.ItemSystemUtils && window.ItemSystemUtils.isToolsItem(item)) {
                    $gameParty.gainItem(item, 1);
                }
            }
        };
        grantTools($dataItems);

        const actor = $gameParty.leader();
        if (actor) {
            // Every <Esoteric> skill (Forbidden ones included), plus a handful
            // of random spells/skills from the rest of the roster.
            const esotericSkillIds = [];
            for (let i = 1; i < $dataSkills.length; i++) {
                const skill = $dataSkills[i];
                if (isRealEntry(skill) && skill.meta && skill.meta.Esoteric) {
                    actor.learnSkill(i);
                    esotericSkillIds.push(i);
                }
            }

            const randomSkills = getRandomSkills(20);
            randomSkills.forEach(skillId => {
                if (!esotericSkillIds.includes(skillId)) actor.learnSkill(skillId);
            });
        }
    }


    // Re-checked on every map load (not gated to "new game only") so the
    // bonus still lands whenever the leader ends up named Test, even if that
    // only becomes true after character creation. Map 557 is the creation
    // wizard's staging map, where the party isn't finalized yet, so it's
    // skipped rather than treated as a permanent disable.
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded.call(this);

        if ($gameSystem._playtestBonusApplied) return;
        if ($gameMap.mapId() === 557) return;

        setTimeout(() => {
            if (!$gameSystem._playtestBonusApplied && isTestPlayer()) {
                applyPlaytestBonuses();
                callCommonEventIfNeeded();
                // Grant all valid items/weapons/armor/skills for sandbox mode
                grantAllSandboxItems();
                $gameSystem._playtestBonusApplied = true;
            }
        }, 2000);
    };

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _Game_System_initialize.call(this);
        this._playtestBonusApplied = false;
    };
})();
