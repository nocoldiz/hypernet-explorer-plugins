/*:
 * @target MZ
 * @plugindesc Automatically registers JSON files from js/db/ to global window objects.
 * @author Omni-Lex
 *
 * @help
 * This plugin scans the js/db/ directory and its subdirectories, loading all .json
 * files and registering them to namespaced window objects.
 *
 * Rules:
 * - Window object name = Folder name (e.g., js/db/Health/ -> window.Health)
 * - Property name = Filename without extension (e.g., BodyParts.json -> window.Health.BodyParts)
 *
 * Example:
 * js/db/WorldGen/Biomes.json -> window.WorldGen.Biomes
 *
 * ----------------------------------------------------------------------------
 * i18n
 * ----------------------------------------------------------------------------
 * This plugin also hosts window.T, the key-based resolver every other plugin
 * uses for its user-facing strings. It lives here because DataService is load
 * slot 2 of 279 and loads synchronously, so plugins that build const tables at
 * load time can already call it.
 *
 *   T('RentSystem.msg.notEnoughGold')          -> string
 *   T('Loot.msg.gained', { amount: 40 })       -> interpolated string
 *   T.list('TVBroadcast.em.refusal')           -> array of strings
 *   T.obj('Bestiary.tabs')                     -> object subtree
 *   T.n('Quest.daysLeft', 3)                   -> .one / .other by count
 *   T.has(key) / T.param(value, key) / T.reload()
 *
 * See docs/workflows/i18n-hardcoded-string-extraction.md.
 */

(() => {
    // Force StorageManager to use web mode if not in real NW.js
    const isRealNwjs = typeof process !== 'undefined' && process.versions && process.versions.nw;
    if (!isRealNwjs) {
        StorageManager.isLocalMode = function() { return false; };
        console.log("DataService: Forced StorageManager to web mode.");
    }

    // ── Registering a file, without reading it ───────────────────────────────
    //
    // There are a hundred and eighty odd JSON files under js/db and twelve and a
    // half megabytes of them, and a good many are never looked at in a whole
    // session: the biome snapshot and the ASCII tileset are read off disk by the
    // plugins that own them, the furniture catalogue is only wanted by somebody
    // buying furniture. Reading and parsing all of it before the title screen can
    // be drawn is time spent on data most players never touch.
    //
    // So a file is REGISTERED rather than loaded: the name goes on the window
    // object as an accessor, and the first thing to actually ask for it reads and
    // parses it, once. The read then replaces the accessor with the value it
    // produced, so every later use is a plain property again and costs nothing.
    //
    // Nothing that uses this needs to know. `window.WorldGen.Biomes` is still
    // `window.WorldGen.Biomes`, still enumerable, still assignable (NPCSystem
    // writes its own rosters over NPCPools, and the setter below lets it).
    let _registered = 0, _loaded = 0;

    function registerLazy(bucket, name, read) {
        const define = (value) => {
            Object.defineProperty(bucket, name, {
                configurable: true, enumerable: true, writable: true, value
            });
            return value;
        };
        Object.defineProperty(bucket, name, {
            configurable: true,
            enumerable: true,
            get() {
                _loaded++;
                let value = null;
                try {
                    value = read();
                } catch (e) {
                    console.error(`DataService: Failed to load ${name}: ${e.message}`);
                }
                return define(value);
            },
            set(v) { define(v); }
        });
        _registered++;
    }

    // How many files have actually been wanted so far. Useful from the console
    // when working out what a screen really needs.
    window.DataServiceStats = function () {
        return { registered: _registered, loaded: _loaded };
    };

    function parseJson(text, label) {
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        return JSON.parse(text);
    }

    function loadDatabase() {
        const fs = require('fs');
        const path = require('path');
        const DB_PATH = path.join(process.cwd(), 'js', 'db');

        if (!fs.existsSync(DB_PATH)) {
            console.warn(`DataService: DB path not found: ${DB_PATH}`);
            return;
        }

        const folders = fs.readdirSync(DB_PATH);

        folders.forEach(folder => {
            const folderPath = path.join(DB_PATH, folder);
            if (!fs.statSync(folderPath).isDirectory()) return;

            const windowName = folder;
            window[windowName] = window[windowName] || {};

            const files = fs.readdirSync(folderPath);
            files.forEach(file => {
                if (path.extname(file).toLowerCase() !== '.json') return;
                const filePath = path.join(folderPath, file);
                const fileName = path.basename(file, '.json');
                registerLazy(window[windowName], fileName,
                    () => parseJson(fs.readFileSync(filePath, 'utf8'), filePath));
            });
        });
        console.log(`DataService: registered ${_registered} files under js/db (read on first use).`);
    }

    function loadDatabaseBrowser() {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'js/db_manifest.json', false);
            xhr.send();
            if (xhr.status !== 200) {
                console.warn("DataService: Failed to load js/db_manifest.json. Running without pre-loaded DB.");
                return;
            }
            let manifestText = xhr.responseText;
            if (manifestText.charCodeAt(0) === 0xFEFF) {
                manifestText = manifestText.slice(1);
            }
            const manifest = JSON.parse(manifestText);
            
            // Registered, not fetched. A synchronous request blocks the page
            // outright, and there were a hundred and eighty of them here before
            // anything could be drawn; now each one is made only if its file is
            // ever actually asked for.
            for (const folder in manifest) {
                window[folder] = window[folder] || {};
                manifest[folder].forEach(file => {
                    const url = `js/db/${folder}/${file}`;
                    registerLazy(window[folder], file.replace('.json', ''), () => {
                        const req = new XMLHttpRequest();
                        req.open('GET', url, false);
                        req.send();
                        if (req.status !== 200) throw new Error(`HTTP ${req.status} for ${url}`);
                        return parseJson(req.responseText, url);
                    });
                });
            }
            console.log(`DataService: registered ${_registered} files under js/db (fetched on first use).`);
        } catch (e) {
            console.error("DataService: Browser loading failed", e);
        }
    }

    if (Utils.isNwjs()) {
        loadDatabase();
    } else {
        loadDatabaseBrowser();
    }

    // ── AlienBiomes.json → merged into window.WorldGen.Biomes ────────────────
    // Alien planet biomes (one per GalaxySim planet type, referencing the
    // recoloured tilesets from id 318 up) live in their own file so they stay
    // separate from the Earth biome catalogue, but the WorldGen biome registry
    // (getBiomeByName, feature parsing, battlebacks) only reads
    // window.WorldGen.Biomes. Append them in place (mutate, don't reassign) so
    // any plugin that already captured the Biomes array reference still sees them.
    if (window.WorldGen && Array.isArray(window.WorldGen.Biomes) &&
        Array.isArray(window.WorldGen.AlienBiomes)) {
        const known = new Set(window.WorldGen.Biomes.map(function (b) { return b.name; }));
        let added = 0;
        window.WorldGen.AlienBiomes.forEach(function (b) {
            if (b && b.name && !known.has(b.name)) {
                window.WorldGen.Biomes.push(b);
                known.add(b.name);
                added++;
            }
        });
        console.log("DataService: merged " + added + " alien biomes into WorldGen.Biomes.");
    }

    // ── window.WorldGen.HardcodedBiomeNames, derived from Destinations.json ──
    // The old js/db/WorldGen/HardcodedBiomeNames.json ("x,y" -> place name) was
    // a hand-maintained duplicate of the footprint every named place already
    // has to declare somewhere: it is retired, and every coordinate it held
    // now lives as that place's own `reservedTiles` array in
    // js/db/WorkSystem/Destinations.json (the same array FastTravelSystem
    // reads to walk a traveller through the place's own `entrance` instead of
    // dropping them on the open world tile). This block rebuilds the old flat
    // "x,y" -> Destinations.json KEY map at load time so every plugin that
    // still reads window.WorldGen.HardcodedBiomeNames[x+','+y] keeps working
    // unchanged.
    if (window.WorkSystem && window.WorkSystem.Destinations) {
        const flat = {};
        let tiles = 0;
        for (const key in window.WorkSystem.Destinations) {
            const entry = window.WorkSystem.Destinations[key];
            const reserved = entry && entry.reservedTiles;
            if (!Array.isArray(reserved)) continue;
            reserved.forEach(function (coord) {
                flat[coord] = key;
                tiles++;
            });
        }
        // A place that declares no `reservedTiles` still occupies the one world
        // square its `base` names - that is the tile the fast-travel system parks
        // a traveller on. Without it the square is anonymous, and everything gated
        // on "is this a named place?" (the "Visit <name>" travel menu above all)
        // skips it: a one-tile village like Lille or Le Havre sits on a Village
        // biome tile, and a plain settlement tile suppresses that menu entirely.
        //
        // Only places WITHOUT a footprint get this. Where `reservedTiles` exists it
        // is the authority and `base` is not dependably inside it (Amsterdam's base
        // is two squares south of its four reserved tiles; Middelburg's reads
        // "85,11" against a reserved "85,114"), so a base fill-in there would name
        // open countryside next door to the town.
        for (const key in window.WorkSystem.Destinations) {
            const entry = window.WorkSystem.Destinations[key];
            if (!entry || Array.isArray(entry.reservedTiles)) continue;
            const base = entry.base;
            if (!base || typeof base.x !== 'number' || typeof base.y !== 'number') continue;
            const coord = base.x + ',' + base.y;
            if (flat[coord]) continue;
            flat[coord] = key;
            tiles++;
        }
        window.WorldGen = window.WorldGen || {};
        window.WorldGen.HardcodedBiomeNames = flat;
        console.log("DataService: derived WorldGen.HardcodedBiomeNames from " +
            tiles + " Destinations.json reservedTiles.");
    }

    // ── The sprite catalogue: NPCs.json ─────────────────────────────────────
    // js/db/WorldGen/NPCs.json (window.WorldGen.NPCs) is the one record of every
    // character sheet the game knows. The old js/db/Sprites/SpritesAssociation.json
    // was folded into it and deleted; its sheets (the historical dossier sprites
    // and their skins) live here as npc:false entries.
    //
    //   { "Skab/!$Adept": { npc, aliens, busts, beta, animations,
    //                       Archetype, model, Gender, chars, color, classes,
    //                       markovDB } }
    //
    //   npc        the sheet may be dealt to a procedural inhabitant
    //   aliens     the sheet is not a person of this world. An alien is dealt at
    //              a rate, never out of the ordinary pool, see alienShare below.
    //   beta       the sheet is not in the original folder (img/characters/Skab/
    //              Originals). A beta sheet is browsable in the character grid but
    //              is kept out of every automatic pick unless the world was created
    //              with beta sprites enabled, see window.SpriteCatalog below.
    //   animations the sheet is an animation/pose sheet, not a 3x4 walk sheet
    //   model      a registered Battler3D key this sheet is portrayed by in place
    //              of a bust. Carried by every `animal` and `creature` sheet: a
    //              beast has no bust and never will, so the panels draw the 3D
    //              body named here (see NPCCreature.modelForSprite)
    //
    // Every bust plugin reads SpritesAssociation[spriteName][characterIndex] →
    // bustName, so the flat bust map is rebuilt here from the busts arrays and
    // published as window.Sprites.SpritesAssociation exactly as before.
    if (window.WorldGen && window.WorldGen.NPCs) {
        window.Sprites = window.Sprites || {};
        const rebuilt = {};
        for (const [key, val] of Object.entries(window.WorldGen.NPCs)) {
            rebuilt[key] = Array.isArray(val) ? val : (val.busts || []);
        }
        window.Sprites.SpritesAssociation = rebuilt;
        console.log("DataService: SpritesAssociation rebuilt from NPCs.json (" +
                    Object.keys(rebuilt).length + " entries).");
    }

    // ── window.SpriteCatalog ────────────────────────────────────────────────
    // The one place that answers "which character sheets may this world use?".
    //
    // A beta sheet is one that is not in the original folder: it is drawn, it is
    // in the game, and the character grid offers it for the player's own
    // character, but it is never dealt to anyone else. Nothing picks one on the
    // player's behalf, in any world.
    (function () {
        // Pools are rebuilt only when the beta answer changes, which happens at
        // most once per world activation.
        const poolCache = { all: null, stable: null, alienAll: null };

        // How often a rolled face belongs to somebody who is not from here. An
        // alien is a rare sight anywhere the ground is Earth's, in EVERY
        // population mode: a goblin world and a monster world have their own
        // off-worlders too, so the pool is never narrowed by the mode, only the
        // share is. Where the sky IS the place (a <Biome: Space> map: an orbital
        // station, a ship's deck) one face in five is theirs, and on a
        // hand-authored landing site on another world the human face is the
        // rarity. All three are shares of one draw, never a pool an alien sits
        // in. A travel interior is deliberately NOT one of them: a bus is a bus.
        const ALIEN_SHARE = 0.01;
        const ALIEN_SHARE_SPACE = 0.20;
        const ALIEN_SHARE_OFFWORLD = 0.90;

        // The share of a zombie world's crowd that is one of the dead walking
        // (WorldManager.populationMode "zombie"). The `zombie` sheets of
        // NPCs.json (the Zombies/ folder) are a pool of their own there, dealt
        // on the same single draw the aliens are: nine faces in ten are a
        // corpse still on its feet, the tenth is somebody who made it. Those
        // sheets stay in the ordinary pool of every OTHER world, where they are
        // simply one more face somebody can be wearing.
        const ZOMBIE_SHARE = 0.9;

        // The share of a crowd that is a goblin on ground the Goblin Horde
        // holds. A world does not have to be a goblin world for this: a
        // PROCEDURAL square standing in a nation the Horde rules is goblin
        // country of its own, and nine faces in ten dealt in its towns, its
        // villages, its farms and the houses opened out of them come off the
        // goblin half of the wardrobe (see goblinKeys / isGoblinHordeGround).
        // The tenth is anybody else who lives there, dealt off the ordinary
        // pool with the goblins taken out of it, so the share is exact.
        // An authored town is deliberately not part of it: a written place
        // keeps the cast it was written with, whoever rules the region it
        // stands in.
        const GOBLIN_SHARE = 0.9;

        // The hyperpower whose ground it is: keyed this way in Hyperpowers.json
        // and in the "controller" / "faction" fields of Countries.json.
        const GOBLIN_POWER = "Goblin Horde";   // i18n-ignore: Hyperpowers.json key

        // The square the horde answer was last worked out for, so the world is
        // asked once per square rather than once per face dealt. A conquest
        // while the party stands still is not seen until they move, which is
        // the granularity the crowd is dealt at anyway: the population pass
        // runs on arrival, not tile by tile.
        const hordeGround = { key: null, answer: false };

        // Varlenia, and the people who are from there. A sheet flagged
        // `varlenian` in NPCs.json is a Varlenian face, and a Varlenian face is
        // dealt on ONE ground only: a map whose own map group is Varlenia.
        // Nothing else counts, and that is the whole rule:
        //   - a procedural square standing in the country Varlenia does not,
        //     even though the world map paints Varlenia there. A square is
        //     generated the same way everywhere and reuses one map id, so
        //     letting the country answer put Varlenian faces in every dream,
        //     cave and roadside that square ever generated.
        //   - the Omega Tower does not, whatever floor it is on.
        //   - a shared map pool does not: a vehicle interior, a train carriage,
        //     any template every group borrows. The map is not in the group, so
        //     the sheets are not in its pool.
        // Everywhere else those sheets are simply not in the pool, so nobody is
        // ever dealt one by accident.
        const VARLENIA_GROUP = "Varlenia";   // i18n-ignore: MapGroups.json key
        const PROC_MAP_ID = 636;             // the one map id every procedural square reuses

        function db() {
            return (window.WorldGen && window.WorldGen.NPCs) || {};
        }

        // ── The retired joined sheets ───────────────────────────────────────
        // The 53 eight-character sheets that used to sit in the root of
        // img/characters were cut into single-character !$ sheets under
        // img/characters/NPCs/ and deleted. Every entry that came out of one
        // records where it came from in its `source` field ("People2#3"), so
        // the cut is its own migration table and nothing has to be listed here.
        //
        // Every map, prefab, actor and plugin parameter in the repository was
        // repointed when the sheets were cut, but a sheet name also travels in
        // things written BEFORE it: a world folder's npcs.json caches a
        // snapshot of each dealt NPC's event pages (poolCache), and a savegame
        // holds the party's own graphics. Those still name the joined sheet and
        // its cell, which is a 404 on every load. legacySheet() answers what a
        // (sheet, cell) pair is called now, and the hooks below apply it at the
        // moment a graphic is set, so stale data renders the right person
        // without the stored file being rewritten under the player.
        //
        // A cell the cut produced nothing for was a deliberately blank cell of
        // the joined sheet, and answers "" (no graphic), which is what it drew.
        let legacyIndex = null;
        function legacyMap() {
            if (legacyIndex) return legacyIndex;
            legacyIndex = {};
            for (const [key, entry] of Object.entries(db())) {
                const src = entry && typeof entry === "object" ? entry.source : null;
                if (typeof src !== "string") continue;
                const cut = src.lastIndexOf("#");
                if (cut <= 0) continue;
                const sheet = src.slice(0, cut);
                const cell = Number(src.slice(cut + 1));
                if (!Number.isFinite(cell)) continue;
                const slots = legacyIndex[sheet] || (legacyIndex[sheet] = {});
                if (slots[cell] === undefined) slots[cell] = key;
            }
            return legacyIndex;
        }

        // ── The folder moves and the renames ────────────────────────────────
        // A sheet also travels when it changes FOLDER rather than being cut in
        // two, and it travels again when it is RENAMED. Both have happened more
        // than once. The Varlenian sheets were lifted out of
        // img/characters/NPCs/ into img/characters/Varlenian/, so that folder
        // holds exactly what the `varlenian` flag marks and nothing else; the
        // pose sheets were gathered into img/characters/Animations/; the faces
        // NPCs/ held a second copy of were sorted out into Animals/, Creatures/,
        // Zombies/ and Mecha/; and a shelf of beasts was renamed off its sheet
        // number onto what it actually is (!$DogTail1 -> !$Dog1). Every map,
        // prefab and preset in the repository was repointed each time, but a
        // stored name records nothing about the folder or the spelling it was
        // written under, so a world folder's poolCache or a savegame written
        // before a move still names the old one - and a character sheet that
        // 404s is not a missing face, it is the modal "Failed to load / Retry"
        // screen thrown at the next scene that starts (ImageManager.isReady).
        //
        // The wardrobe answers all of it, so no table has to be kept in step
        // with the folders: a bare sheet name is unique across it, so the same
        // name in another folder is the same sheet moved, and the name minus
        // its trailing number is the family it was renamed inside.
        //
        // A name is only answered when the wardrobe does not know it AND it
        // stands in a folder the wardrobe ITSELF uses, which is what keeps a
        // name-only rule safe here: a door, a chest, a light, a monster and
        // img/characters/Skab/Originals (a second copy of most of the Skab
        // folder under the same sheet names) are none of them in the wardrobe,
        // so nothing of theirs is ever dragged out of its own folder by a name
        // that happens to match.
        //
        // The index is rebuilt when the wardrobe object itself is replaced,
        // which is what a mod adding sheets does (see ModManager), and never
        // otherwise.
        let sheetIndex = null;
        let sheetIndexOf = null;
        function wardrobeIndex() {
            const data = db();
            if (sheetIndex && sheetIndexOf === data) return sheetIndex;
            const bare = {}, family = {}, folders = {};
            for (const key of Object.keys(data)) {
                const cut = key.lastIndexOf("/");
                if (cut < 0) continue;
                folders[key.slice(0, cut + 1)] = true;
                const sheet = key.slice(cut + 1);
                if (bare[sheet] === undefined) bare[sheet] = key;
                const stem = sheet.replace(/\d+$/, "");
                (family[stem] || (family[stem] = [])).push(key);
            }
            for (const stem of Object.keys(family)) family[stem].sort();
            sheetIndex = { bare: bare, family: family, folders: folders };
            sheetIndexOf = data;
            return sheetIndex;
        }

        // The folder a stored name stands in, or null when it names no folder
        // at all or one the wardrobe does not use.
        function wardrobeFolder(name) {
            if (typeof name !== "string" || !name) return null;
            const cut = name.lastIndexOf("/");
            if (cut < 0) return null;
            const folder = name.slice(0, cut + 1);
            return wardrobeIndex().folders[folder] ? folder : null;
        }

        // A stable choice out of a list of sheets, so a name that has to be
        // answered with another face is answered with the SAME other face every
        // time: one lost NPC is one person, not a different one per session.
        function pickStable(keys, seed) {
            let h = 0;
            for (let i = 0; i < seed.length; i++) {
                h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
            }
            return keys[Math.abs(h) % keys.length];
        }

        // Where a stored sheet name lives now, or null when the name is one the
        // wardrobe still knows (which is every name written since the moves) or
        // one it was never asked about (a door, a chest, a monster).
        function movedSheet(name) {
            if (typeof name !== "string" || !name) return null;
            if (db()[name]) return null;
            if (!wardrobeFolder(name)) return null;
            const index = wardrobeIndex();
            const sheet = name.slice(name.lastIndexOf("/") + 1);
            if (index.bare[sheet]) return index.bare[sheet];
            const family = index.family[sheet.replace(/\d+$/, "")];
            return (family && family.length) ? pickStable(family, name) : null;
        }

        // ====================================================================
        // window.MagicNature , how much magic this world has
        // ====================================================================
        // Every real entry of Skills, Enemies, Weapons, Armors, Items, Classes
        // and States carries `<Nature: Magical>` or `<Nature: Mundane>` in its
        // notebox; Traits.json carries a `nature` field and NPCs.json a
        // `magical` boolean (all written by tools/nature/gen_nature_tags.js).
        // This is the ONE place that reads them, so no caller has to know the
        // tag's spelling or which of the three shapes a given table uses.
        //
        //   normal   , everything is allowed. `isFiltering()` is false and
        //              every caller short-circuits, so an ordinary world pays
        //              nothing at all for this.
        //   severed  , magic never happened: nothing Magical exists.
        //   unbound  , magic won: nothing Mundane is left.
        //
        // It is a SEPARATE axis from the alternate timeline (populationMode):
        // both are resolved independently and every combination is legal.
        //
        // The two answers are deliberately asymmetric in one place only, and
        // it is stated here rather than at each caller: a thing the party was
        // GIVEN is never taken away. Character creation's starting kit, a
        // quest reward already handed over and anything already in the pack
        // stay exactly as they are; the level decides what the world will
        // OFFER from now on, not what the party is holding.
        const NATURE_RE = /<Nature:\s*([A-Za-z]+)\s*>/i;
        window.MagicNature = {
            // "normal" | "severed" | "unbound"
            level() {
                const WM = window.WorldManager;
                if (!WM || typeof WM.magicalLevel !== "function") return "normal";
                return WM.magicalLevel();
            },

            // False in an ordinary world, which is the fast path every caller
            // tests first.
            isFiltering() {
                return this.level() !== "normal";
            },

            // Is a thing of this nature allowed here? Takes the string, since
            // there are THREE answers and not two:
            //
            //   magical , only in a world that has magic
            //   mundane , only in a world that does not. This is a narrow set
            //             on purpose: it means "could only exist BECAUSE there
            //             is no magic", which in practice is high technology,
            //             the thing a world of working spells never had to
            //             invent.
            //   both    , a rope, a hammer, a horse, a sword, a loaf of bread.
            //             Most of the world is this. It exists either way and
            //             is never filtered out by either level.
            //
            // A boolean is still accepted (true = magical) for the callers
            // that only ever have one.
            allows(nature) {
                const level = this.level();
                if (level === "normal") return true;
                const n = (nature === true) ? "magical"
                        : (nature === false) ? "mundane"
                        : String(nature || "").toLowerCase();
                if (n === "both" || !n) return true;
                return level === "severed" ? n !== "magical" : n !== "mundane";
            },

            // The nature of any RMMZ database entry (anything with a notebox):
            // "magical", "mundane", "both", or null where nothing is tagged,
            // which `allowsData` reads as "no opinion".
            natureOf(data) {
                const m = data && data.note ? String(data.note).match(NATURE_RE) : null;
                if (!m) return null;
                const raw = m[1].toLowerCase();
                if (raw === "magical" || raw === "both") return raw;
                return "mundane";
            },

            isMagicalData(data) {
                return this.natureOf(data) === "magical";
            },

            // The gate for a database entry: an item, weapon, armor, skill,
            // enemy, class or state. Untagged entries are always allowed.
            allowsData(data) {
                if (!this.isFiltering()) return true;
                const nature = this.natureOf(data);
                if (!nature) return true;
                return this.allows(nature);
            },

            // The gate for a trait out of js/db/Health/Traits.json, which
            // carries its answer as a field rather than in a notebox. Also
            // reads a disease, which carries the same `nature` field.
            //
            // ASYMMETRIC ON PURPOSE, and this is the one place it is decided:
            // a SEVERED world hides the magical traits, but an UNBOUND world
            // hides nothing. There are 183 mundane traits against 19 magical
            // ones, so applying the unbound rule here would cut a four-trait
            // character down to a choice of nineteen and make every character
            // in the world read the same. Being ordinary is not a thing magic
            // winning takes away from you.
            allowsTrait(trait) {
                if (this.level() !== "severed") return true;
                if (!trait || trait.nature === undefined) return true;
                return String(trait.nature).toLowerCase() !== "magical";
            },

            // Convenience for the item tables, which are handed ids.
            allowsItemId(id) { return this.allowsData($dataItems && $dataItems[id]); },
            allowsWeaponId(id) { return this.allowsData($dataWeapons && $dataWeapons[id]); },
            allowsArmorId(id) { return this.allowsData($dataArmors && $dataArmors[id]); },
            allowsEnemyId(id) { return this.allowsData($dataEnemies && $dataEnemies[id]); },
            allowsSkillId(id) { return this.allowsData($dataSkills && $dataSkills[id]); },
        };

        window.SpriteCatalog = {
            // What a cell of a retired joined sheet is called now, as
            // { name, index }, or null when the sheet was never one of them
            // (which is every sheet still on disk). The replacement is a
            // single-character !$ sheet, so the index is always 0.
            // A sheet that only changed folder keeps its cell, so that answer
            // carries the stored index through untouched.
            legacySheet(name, index) {
                if (typeof name !== "string" || !name) return null;
                const slots = legacyMap()[name];
                if (!slots) {
                    const moved = movedSheet(name);
                    if (!moved) return null;
                    const cell = Number(index);
                    return { name: moved, index: Number.isFinite(cell) ? cell : 0 };
                }
                const cell = Number(index);
                const key = slots[Number.isFinite(cell) ? cell : 0];
                return { name: key || "", index: 0 };
            },

            // Is this a sheet the wardrobe knows by that exact name? Every key
            // it holds is a file that is on disk (test/test_sprite_fallback.js
            // asserts it), so this is also the answer to "will this name load?"
            // for anything the wardrobe is responsible for.
            knowsSheet(name) {
                return !!db()[name];
            },

            // What to draw when a stored sheet name is not on disk AT ALL: the
            // load has already failed, so something has to stand in for it or
            // the scene puts up the Retry screen and the game stops.
            //
            // The wardrobe is asked first, because the file is usually not gone
            // but moved or renamed, and then a face is only ever stood in for a
            // face: a name that is not in one of the wardrobe's own folders is
            // left alone, since a door with a person drawn on it is worse than
            // a door with nothing on it. The stand-in is drawn from the lost
            // sheet's OWN folder where that folder is in the pool (a zombie is
            // replaced by a zombie, an animal by an animal), and it is picked
            // from the name, so the same lost sheet is always the same face.
            substituteSheet(name) {
                const now = this.legacySheet(name, 0);
                if (now && now.name && now.name !== name) return now.name;
                const folder = wardrobeFolder(name);
                if (!folder) return null;
                let pool = [];
                try {
                    pool = this.npcKeys() || [];
                } catch (e) {
                    pool = [];
                }
                if (!pool.length) {
                    const data = db();
                    pool = Object.keys(data).filter(k => {
                        const e = data[k];
                        return e && e.npc === true && e.beta !== true && e.vip !== true;
                    });
                }
                if (!pool.length) return null;
                const home = pool.filter(k => k.startsWith(folder));
                return pickStable(home.length ? home : pool, name);
            },

            // The full record for a sheet, or null when the sheet is unknown.
            entry(key) {
                const e = db()[key];
                return (e && typeof e === "object" && !Array.isArray(e)) ? e : null;
            },

            busts(key) {
                const e = this.entry(key);
                return (e && e.busts) || [];
            },

            // Not in the original folder: browsable, never dealt automatically
            // unless the world enabled beta sprites.
            isBeta(key) {
                const e = this.entry(key);
                return !!(e && e.beta === true);
            },

            // A named person's own face: the dossier sprites of the preset
            // characters and their skins. A VIP sheet is worn by the one
            // character it was drawn for and by nobody else, so it is in no
            // automatic pool and on no picker board.
            isVip(key) {
                const e = this.entry(key);
                return !!(e && e.vip === true);
            },

            // An animation/pose sheet rather than a walk sheet.
            isAnimated(key) {
                const e = this.entry(key);
                return !!(e && e.animations === true);
            },

            // Not a person of this world. Kept out of npcKeys() entirely: an
            // alien is only ever dealt through pickNpcKey's own roll.
            isAlien(key) {
                const e = this.entry(key);
                return !!(e && e.aliens === true);
            },

            // Whether a character sheet may be worn in this world's magic
            // level. The wardrobe carries a plain `magical` boolean per entry
            // (tools/nature/gen_nature_tags.js); see window.MagicNature.
            allowedInMagic(key, entry) {
                const MN = window.MagicNature;
                if (!MN || !MN.isFiltering()) return true;
                const e = entry || this.entry(key);
                return MN.allows(e && e.magical === true);
            },

            // Who this world is populated with, answered once at creation
            // (WorldManager.populationMode). Read here rather than stored, so a
            // world switched under a running session is never read stale.
            populationMode() {
                const WM = window.WorldManager;
                if (!WM || typeof WM.populationMode !== "function") return "normal";
                return WM.populationMode();
            },

            // The archetypes a world of PEOPLE is made of. A monster world is
            // defined as everything that is not one of these, so they are named
            // once, here, rather than at each caller: the sprite and bust
            // wardrobe, the creature-creation board and the enemies that roam
            // the map all read this one list. A two-headed one is still a
            // person, which is why DoubleHeadedHumanoid is on it.
            PEOPLE_ARCHETYPES: ["Humanoid", "DoubleHeadedHumanoid"],

            // Whether one wardrobe entry belongs in this world at all. This is
            // the single rule behind both the sprite a procedural inhabitant is
            // dealt and the bust that comes with it (a bust is a field of the
            // sheet's own entry, so gating the sheet gates the face with it).
            //
            //   goblin  , only goblins: the sheet says so in its own name.
            //             (Goblin is not an archetype, a goblin is a humanoid
            //             wearing a goblin's face.)
            //   monster , nothing that reads as a person: every archetype
            //             except Humanoid and DoubleHeadedHumanoid.
            //   normal  , everything, which is every world made before this
            //             option existed.
            //
            // An empty world is not filtered here: nothing is spawned in one at
            // all (NPCSystem refuses the spawn), and narrowing the wardrobe of
            // a world with nobody in it would only hide the player's own
            // character sheets from them.
            allowedInPopulation(key, entry, mode) {
                const m = mode || this.populationMode();
                if (m !== "goblin" && m !== "monster") return true;
                const e = entry || this.entry(key);
                const archetype = (e && e.Archetype) || "";
                if (m === "goblin") return this.isGoblinSheet(key, e);
                return !this.PEOPLE_ARCHETYPES.includes(archetype);
            },

            // The faces a narrowed world may wear, as a Set of bust names, or
            // null where every bust in the folder is fair game (normal and
            // empty worlds). The bust gallery reads the img/busts folder rather
            // than this file, so it cannot derive the answer itself: a bust
            // belongs to a world when some sheet that world allows lists it.
            // Falls back to null rather than an empty gallery if the wardrobe
            // has nothing to say, so a data gap is never a locked door.
            allowedBustNames(mode) {
                const m = mode || this.populationMode();
                const magic = (window.MagicNature && window.MagicNature.level()) || "normal";
                const narrowed = (m === "goblin" || m === "monster") || magic !== "normal";
                if (!narrowed) return null;
                const slot = "bustNames:" + m + ":" + magic;
                if (!poolCache[slot]) {
                    const data = db();
                    const names = new Set();
                    Object.keys(data).forEach(k => {
                        const e = data[k];
                        if (!e || !this.allowedInMagic(k, e)) return;
                        if (!this.allowedInPopulation(k, e, m)) return;
                        (e.busts || []).forEach(b => { if (b) names.add(String(b)); });
                    });
                    poolCache[slot] = names.size ? names : null;
                }
                return poolCache[slot] || null;
            },

            // Whether one bust file may be worn in this world.
            bustAllowedInPopulation(bustName, mode) {
                const m = mode || this.populationMode();
                const allowed = this.allowedBustNames(m);
                if (!allowed) return true;
                if (allowed.has(String(bustName))) return true;
                // A goblin world also takes any face that says so itself, so a
                // bust drawn for one but never wired to a sheet is still on it.
                return m === "goblin" &&
                       String(bustName).toLowerCase().includes("goblin");
            },

            // Every sheet that may be dealt to a procedural inhabitant. A beta
            // sheet (not in the original folder) is never in it: it is browsable
            // in the character grid, but nothing is ever dealt one on the
            // player's behalf. Aliens are never in it either: they are dealt by
            // pickNpcKey alone. Nor are the `creature` / `animal` entries: a
            // creature is never a person, it is dealt by NPCCreature's own (much
            // rarer) roll, see creatureKeys. Leaving them in here would deal a
            // stray dog or a Mimic at their flat share of the whole wardrobe
            // (well over a tenth of it for `animal` alone) on top of
            // NPCCreature's own roll, far more often than either is meant to
            // turn up.
            // The population mode is part of the cache key: a goblin world and
            // a normal one are two different pools off the same file, and the
            // cache outlives a world switch inside one session.
            // Where the pick is being made is part of the answer too: the
            // Varlenian sheets are in the pool on Varlenian ground and out of
            // it everywhere else (see isVarlenianPlace), which is why that
            // answer is part of the cache key rather than a filter on top.
            npcKeys(options) {
                const mode = (options && options.populationMode)
                    ? options.populationMode
                    : this.populationMode();
                // A monster world has no people in it at all. Nothing that is
                // neither `creature` nor `animal` is ever dealt there, so the
                // people pool is empty by definition and the whole crowd comes
                // off the two creature halves instead (see pickNpcKey).
                if (mode === "monster") return [];
                const magic = (window.MagicNature && window.MagicNature.level()) || "normal";
                const varlenia = (options && options.varlenia !== undefined)
                    ? !!options.varlenia
                    : this.isVarlenianPlace(options && options.mapId);
                // Ground the Goblin Horde holds is a pool of its own the same
                // way a world is: the goblins come off goblinKeys on a share of
                // the draw, so the people pool there is everybody else.
                const horde = !!(options && options.goblinLand);
                const slot = mode + ":" + magic + (varlenia ? ":varlenia" : "") +
                             (horde ? ":horde" : "");
                if (!poolCache[slot]) {
                    const data = db();
                    poolCache[slot] = Object.keys(data).filter(k => {
                        const e = data[k];
                        if (!e || e.npc !== true || e.aliens === true) return false;
                        if (e.creature === true || e.animal === true) return false;
                        if (e.beta === true || e.vip === true) return false;
                        if (e.varlenian === true && !varlenia) return false;
                        // A zombie world deals its dead off zombieKeys, on a
                        // share of the same draw, so the people pool there is
                        // the survivors alone.
                        if (mode === "zombie" && e.zombie === true) return false;
                        if (horde && this.isGoblinSheet(k, e)) return false;
                        if (!this.allowedInMagic(k, e)) return false;
                        return this.allowedInPopulation(k, e, mode);
                    });
                }
                return poolCache[slot];
            },

            // Is this sheet one of the dead walking? The `zombie` flag of
            // NPCs.json, which is the Zombies/ folder. Asked of a sheet NAME
            // (what an event carries), so anything holding a graphic can be
            // told apart from a person without knowing where it came from.
            isZombieSheet(key) {
                const e = this.entry(key);
                return !!(e && e.zombie === true);
            },

            // The zombie half of the wardrobe: the sheets a zombie world's
            // crowd is dealt from (see ZOMBIE_SHARE). Filtered exactly like the
            // ordinary pool, magic level included, so a severed world's dead
            // are only the ones that rose for some ordinary reason; when that
            // leaves nothing at all the pick simply falls back to the people
            // pool rather than emptying the streets.
            zombieKeys() {
                const magic = (window.MagicNature && window.MagicNature.level()) || "normal";
                const slot = "zombieAll:" + magic;
                if (!poolCache[slot]) {
                    const data = db();
                    poolCache[slot] = Object.keys(data).filter(k => {
                        const e = data[k];
                        if (!e || e.npc !== true || e.zombie !== true) return false;
                        if (e.creature === true || e.animal === true) return false;
                        if (e.beta === true || e.vip === true) return false;
                        return this.allowedInMagic(k, e);
                    });
                }
                return poolCache[slot];
            },

            // Is this sheet a goblin? The wardrobe spells it two ways and both
            // count: the Goblin archetype outright, and a sheet whose name says
            // so. It is the same rule a goblin world narrows its whole pool by
            // (allowedInPopulation), named here so the world and the Horde's
            // own ground cannot drift apart.
            isGoblinSheet(key) {
                return String(key).toLowerCase().includes("goblin");
            },

            // The goblin half of the wardrobe: the sheets the crowd of a
            // Horde-held square is dealt from (see GOBLIN_SHARE). Filtered
            // exactly like the ordinary pool, magic level included, and with
            // the risen ones left out: a dead goblin belongs to a zombie
            // world's own pool, not to a living town. When that leaves nothing
            // at all the pick simply falls back to the ordinary pool rather
            // than emptying the streets.
            goblinKeys() {
                const magic = (window.MagicNature && window.MagicNature.level()) || "normal";
                const slot = "goblinAll:" + magic;
                if (!poolCache[slot]) {
                    const data = db();
                    poolCache[slot] = Object.keys(data).filter(k => {
                        const e = data[k];
                        if (!e || e.npc !== true) return false;
                        if (e.creature === true || e.animal === true) return false;
                        if (e.beta === true || e.vip === true) return false;
                        if (e.aliens === true || e.zombie === true) return false;
                        if (!this.isGoblinSheet(k, e)) return false;
                        return this.allowedInMagic(k, e);
                    });
                }
                return poolCache[slot];
            },

            // Does the Goblin Horde hold the nation standing on this world
            // square? Read the way the encyclopedia reads it
            // (NPCEmpathize.getNation): the live timeline first, the shipped
            // Countries.json entry behind it, and a nation nobody controls that
            // sits in the Horde's own faction counts as theirs.
            goblinHordeHoldsSquare(x, y) {
                const gs = window.$gameSystem;
                if (!gs || typeof gs.getCountryFromWorldCoordinates !== "function") return false;
                const nation = gs.getCountryFromWorldCoordinates(x, y);
                if (!nation) return false;
                const hm = window.HistoryManager;
                const state = (hm && typeof hm.getNationState === "function" && nation.country)
                    ? hm.getNationState(nation.country) : null;
                const controller = (state && state.controller) || nation.controller || "Neutral"; // i18n-ignore: Countries.json controller id
                if (controller === GOBLIN_POWER) return true;
                const faction = (state && state.faction) || nation.faction || "Neutral"; // i18n-ignore: Countries.json faction id
                return controller === "Neutral" && faction === GOBLIN_POWER; // i18n-ignore: Countries.json controller id
            },

            // Is this map goblin country, i.e. is the crowd dealt here nine
            // tenths goblins? Two things have to be true, and both of them are
            // asked of the place rather than of the world:
            //   - the ground is PROCEDURAL: the reused square (its towns, its
            //     villages, its caves, its roofed interiors) or a house
            //     interior opened out of one. An authored map is never it.
            //   - the world square it stands on is held by the Horde.
            // An alien surface is never it either, whatever the world map
            // paints on the square its landing grid is addressed by: another
            // world is nobody's nation.
            isGoblinHordeGround(mapId) {
                const WMT = window.WorldMapTransfer;
                if (!WMT) return false;
                const here = (window.$gameMap && $gameMap.mapId) ? $gameMap.mapId() : NaN;
                const id = (mapId !== undefined && mapId !== null) ? Number(mapId) : here;
                if (!Number.isFinite(id)) return false;
                const houses = window.NPCSystem && window.NPCSystem.isHouseMap;
                if (id !== PROC_MAP_ID && !(houses && houses(id))) return false;
                if (id === here && WMT.isAlienSurface && WMT.isAlienSurface()) return false;
                const wc = (id === here)
                    ? (WMT.currentWorldCoords && WMT.currentWorldCoords())
                    : (WMT.worldCoordsForMap && WMT.worldCoordsForMap(id));
                if (!wc) return false;
                const key = id + ":" + wc.x + "," + wc.y;
                if (hordeGround.key !== key) {
                    hordeGround.key = key;
                    hordeGround.answer = this.goblinHordeHoldsSquare(wc.x, wc.y);
                }
                return hordeGround.answer;
            },

            // The alien half of the same wardrobe. The beta answer does NOT
            // apply here: it exists so a world is not populated with sheets
            // outside the original wardrobe by accident, and an alien is never
            // dealt by accident, only on the declared share below. Three of the
            // six alien sheets sit outside the original folder, and gating them
            // on it would leave two of the three Zeta castes unmeetable in
            // almost every world.
            // The population answer does not apply either: an off-worlder is
            // not one of this world's people, so no narrowing of the people
            // pool has anything to say about them. A goblin world, a monster
            // world and a zombie world all still get their rare alien, on the
            // same share of the same draw as anywhere else.
            alienKeys() {
                const magic = (window.MagicNature && window.MagicNature.level()) || "normal";
                const slot = "alienAll:" + magic;
                if (!poolCache[slot]) {
                    const data = db();
                    poolCache[slot] = Object.keys(data).filter(k => {
                        const e = data[k];
                        if (!e || e.npc !== true || e.aliens !== true) return false;
                        if (e.vip === true) return false;
                        // Every alien sheet is mundane by decree, so an unbound
                        // world has none of them and a severed one keeps all six.
                        return this.allowedInMagic(k, e);
                    });
                }
                return poolCache[slot];
            },

            // The creature half of the wardrobe: the sheets a NON-SENTIENT
            // inhabitant may be dealt. It is exactly the `creature` and
            // `animal` entries of NPCs.json , the Creatures/ and Animals/
            // folders , and nothing else. The Monsters/ folder is deliberately
            // not part of it: those sheets are what a fight is drawn with, and
            // an animal wearing one on a town street reads as an enemy the
            // party failed to notice. They come back only in a monster world,
            // where everything walking about is a monster anyway, and even then
            // they are added by NPCCreature rather than listed here.
            //
            // The beta answer does not apply (no creature sheet is beta) but
            // the magic level does, so a severed world keeps no magical beast.
            // The population mode does NOT apply either: a creature is never a
            // person, so no narrowing of the people pool has anything to say
            // about it, and a goblin world still has stray dogs in it.
            //
            // options.exterior (default true, permissive) gates the `animal`
            // half of the pool: a COW belongs on the street, not the landing of
            // somebody's staircase. The house pets are exempt , a dog, a cat, a
            // rabbit and the things people keep in a tank say `indoors: true`
            // on their own animalGrowth block and are dealt behind a door like
            // anybody else. The `creature` half (Mimic, Ghost, Zombie...) is
            // unaffected, those are as much at home indoors as out.
            //
            // options.half asks for one half alone, "creature" or "animal",
            // which is how a monster world deals its even split (pickNpcKey).
            // Left out, the answer is both halves as one pool.
            creatureKeys(options) {
                const exterior = (options && options.exterior !== undefined) ? !!options.exterior : true;
                const half = (options && options.half) || "both";
                const magic = (window.MagicNature && window.MagicNature.level()) || "normal";
                // A wild animal is met where its kind lives: every `animal:true`
                // entry lists its own biomes (animalGrowth.biomes) and is only
                // dealt in one of them, so a crab turns up on a beach and a goat
                // in the highlands. The biome is therefore part of the cache key.
                const biome = this.currentBiomeName() || "";
                const slot = "creatureAll:" + magic + ":" + (exterior ? "ext" : "int") +
                    ":" + half + ":" + biome;
                if (!poolCache[slot]) {
                    const data = db();
                    poolCache[slot] = Object.keys(data).filter(k => {
                        const e = data[k];
                        if (!e || e.npc !== true || e.vip === true) return false;
                        if (half !== "animal" && e.creature === true) return this.allowedInMagic(k, e);
                        if (half !== "creature" && e.animal === true &&
                            (exterior || e.animalGrowth?.indoors === true) &&
                            this.animalFitsBiome(e, biome)) return this.allowedInMagic(k, e);
                        return false;
                    });
                }
                return poolCache[slot];
            },

            // Where the party is standing, as a biome id. The procedural map
            // speaks first, then the map's own <Biome:> note, and anywhere with
            // neither (the world map, an authored interior) answers null, which
            // every caller reads as "no gate".
            currentBiomeName() {
                const proc = window.$gameSystem && $gameSystem._procGenData;
                const procMapId = window.WorldMapReturn ? window.WorldMapReturn.procMapId : PROC_MAP_ID;
                if (proc && proc.currentBiome && window.$gameMap && $gameMap.mapId() === procMapId) {
                    return proc.currentBiome;
                }
                const meta = window.$dataMap && $dataMap.meta && $dataMap.meta.Biome;
                if (typeof meta === "string" && meta.trim()) return meta.trim();
                return (proc && proc.currentBiome) || null;
            },

            // A sheet with no list of its own, and anywhere with no biome to
            // read, is left open: the gate narrows the wardrobe, never empties it.
            animalFitsBiome(entry, biome) {
                const list = entry && entry.animalGrowth && entry.animalGrowth.biomes;
                if (!Array.isArray(list) || !list.length) return true;
                if (!biome) return true;
                return list.indexOf(biome) >= 0;
            },

            // Is this Varlenian ground, i.e. may a Varlenian face be dealt here?
            // One answer only: the map's own group is Varlenia. A procedural
            // square is never Varlenian ground however the world map is painted
            // (every square shares map id 636, so the country answer put
            // Varlenian faces in every cave and dream that id ever generated),
            // the Omega Tower is not, and neither is any map borrowed by every
            // group at once, a vehicle interior or a train carriage among them:
            // a shared template belongs to no group, so it is never this one.
            isVarlenianPlace(mapId) {
                const id = (mapId !== undefined && mapId !== null)
                    ? Number(mapId)
                    : (window.$gameMap && $gameMap.mapId ? $gameMap.mapId() : NaN);
                if (!Number.isFinite(id) || id === PROC_MAP_ID) return false;

                const groups = (window.WorldGen && window.WorldGen.MapGroups) || null;
                const maps = groups && groups[VARLENIA_GROUP] && groups[VARLENIA_GROUP].maps;
                if (Array.isArray(maps) && maps.indexOf(id) >= 0) return true;
                return !!(window.NPCSystem && window.NPCSystem.findMapGroupByMap &&
                    window.NPCSystem.findMapGroupByMap(id) === VARLENIA_GROUP);
            },

            // A hand-authored landing site on a world that is not Earth. Asked
            // of GalaxySim, which is the only thing that knows where the ship
            // set the party down (an authored map says nothing about it itself).
            isOffworldSite(mapId) {
                const GS = window.GalaxySim;
                if (!GS || typeof GS.offworldLandingSite !== "function") return false;
                const site = GS.offworldLandingSite();
                if (!site) return false;
                const id = Number(mapId);
                return !Number.isFinite(id) || site.mapId === id;
            },

            // Is the map the party is standing on out in the sky itself? The
            // <Biome: Space> note tag, the same one the ship background reads
            // (GalaxySim_ShipBackground.isSpaceBiomeMap). Only the LOADED map
            // can answer it, since the tag lives in the map file.
            isSpaceBiomeMap(mapId) {
                const id = Number(mapId);
                const here = (window.$gameMap && $gameMap.mapId) ? $gameMap.mapId() : NaN;
                if (Number.isFinite(id) && Number.isFinite(here) && id !== here) return false;
                return !!(window.$dataMap && $dataMap.note &&
                    /<Biome:\s*Space\s*>/i.test($dataMap.note));
            },

            // The share of rolled faces that are alien where this pick is made.
            alienShare(options) {
                const mapId = (options && options.mapId !== undefined)
                    ? options.mapId
                    : (window.$gameMap && $gameMap.mapId ? $gameMap.mapId() : null);
                if (this.isOffworldSite(mapId)) return ALIEN_SHARE_OFFWORLD;
                return this.isSpaceBiomeMap(mapId) ? ALIEN_SHARE_SPACE : ALIEN_SHARE;
            },

            // Deal one sheet from a single draw r in [0,1). The draw is read as
            // an inverse CDF over the two pools rather than rolled twice, so a
            // caller holding one seeded float (which is every caller: an NPC's
            // face has to be the same face in every savegame of the world) still
            // gets both the exact share and a uniform pick inside the pool.
            // options: { mapId, filter }.
            // ── The world of chaos ─────────────────────────────────────
            // Every sheet in the wardrobe is fair game and nothing narrows it:
            // the crowd is drawn from people, animals, creatures, aliens, the
            // dead and the goblins alike. What each of those is WORTH is rolled
            // once per world, so one chaos world is overrun with animals and
            // the next with the dead, rather than every one of them settling on
            // the same average mix. Beta and VIP sheets stay out, exactly as
            // they do everywhere else: a face drawn for one person is still
            // that person's.
            chaosBuckets() {
                const slot = "chaos:buckets";
                if (!poolCache[slot]) {
                    const data = db();
                    const buckets = { people: [], animal: [], creature: [], zombie: [], goblin: [], alien: [] };
                    Object.keys(data).forEach(k => {
                        const e = data[k];
                        if (!e || e.npc !== true || e.beta === true || e.vip === true) return;
                        if (e.aliens === true) buckets.alien.push(k);
                        else if (e.animal === true) buckets.animal.push(k);
                        else if (e.creature === true) buckets.creature.push(k);
                        else if (e.zombie === true) buckets.zombie.push(k);
                        else if (this.isGoblinSheet(k)) buckets.goblin.push(k);
                        else buckets.people.push(k);
                    });
                    poolCache[slot] = buckets;
                }
                return poolCache[slot];
            },

            // One sheet for a chaos world, off the same single seeded float
            // every other pick is made from: the draw chooses the bucket by its
            // rolled weight and what is left of it chooses inside the bucket.
            chaosNpcKey(r, options) {
                const CW = window.ChaosWorld;
                if (!CW) return null;
                const opts = options || {};
                const buckets = this.chaosBuckets();
                const names = [];
                const weights = [];
                let total = 0;
                Object.keys(buckets).forEach(name => {
                    let list = buckets[name];
                    if (typeof opts.filter === "function") list = list.filter(opts.filter);
                    if (!list.length) return;
                    // Never zero: a bucket that exists is always reachable, it
                    // is only ever rare.
                    const w = 0.05 + CW.roll("npcmix:" + name) * 0.95;
                    names.push(list);
                    weights.push(w);
                    total += w;
                });
                if (!names.length) return null;
                let draw = (typeof r === "number" && r >= 0 && r < 1) ? r : Math.random();
                let acc = 0;
                for (let i = 0; i < names.length; i++) {
                    const share = weights[i] / total;
                    if (draw < acc + share || i === names.length - 1) {
                        const inner = Math.min(0.999999, Math.max(0, (draw - acc) / share));
                        const list = names[i];
                        return list[Math.min(list.length - 1, Math.floor(inner * list.length))];
                    }
                    acc += share;
                }
                return null;
            },

            pickNpcKey(r, options) {
                const opts = options || {};
                if (window.ChaosWorld && window.ChaosWorld.active()) {
                    const chaosKey = this.chaosNpcKey(r, opts);
                    if (chaosKey) return chaosKey;
                }
                const mode = opts.populationMode || this.populationMode();
                // Goblin country (see GOBLIN_SHARE). A world that already
                // answers for who its people are settles it instead: everybody
                // is a goblin in a goblin world, there are no people at all in
                // a monster one, and a zombie world's dead come first.
                const goblinLand = (mode === "goblin" || mode === "monster" || mode === "zombie")
                    ? false
                    : ((opts.goblinLand !== undefined)
                        ? !!opts.goblinLand
                        : this.isGoblinHordeGround(opts.mapId));
                let goblins = goblinLand ? this.goblinKeys() : [];
                // The goblins are taken out of the people pool only where
                // there are goblins to deal: every goblin sheet is magical, so
                // a severed world has none of them, and taking them out of a
                // pool nothing replaces them from would leave the Horde's own
                // towns with fewer goblins in them than anywhere else.
                let pool = this.npcKeys(goblins.length
                    ? Object.assign({}, opts, { goblinLand: true })
                    : opts);
                let aliens = this.alienKeys();
                let zombies = mode === "zombie" ? this.zombieKeys() : [];
                // A monster world's crowd is the two creature halves and
                // nothing else, dealt evenly: half of what walks about is a
                // `creature` sheet and half is an `animal` one, rather than the
                // flat draw over one pool that would make a world of stray dogs
                // out of the 106 animal sheets against 32 creature ones.
                let beasts = null;
                if (mode === "monster") {
                    beasts = {
                        creature: this.creatureKeys({ half: "creature", exterior: opts.exterior }),
                        animal: this.creatureKeys({ half: "animal", exterior: opts.exterior })
                    };
                }
                if (typeof opts.filter === "function") {
                    pool = pool.filter(opts.filter);
                    aliens = aliens.filter(opts.filter);
                    zombies = zombies.filter(opts.filter);
                    goblins = goblins.filter(opts.filter);
                    if (beasts) {
                        beasts.creature = beasts.creature.filter(opts.filter);
                        beasts.animal = beasts.animal.filter(opts.filter);
                    }
                }
                if (beasts) pool = beasts.creature.concat(beasts.animal);
                if (!pool.length && !aliens.length && !zombies.length && !goblins.length) return null;
                let draw = (typeof r === "number" && r >= 0 && r < 1) ? r : Math.random();
                // The dead come off the head of the draw in a zombie world, the
                // aliens and the survivors sharing what is left of it, so one
                // seeded float still deals the exact shares and a uniform pick
                // inside whichever pool it lands in.
                if (zombies.length) {
                    const zShare = (pool.length || aliens.length) ? ZOMBIE_SHARE : 1;
                    if (draw < zShare) {
                        return zombies[Math.min(zombies.length - 1,
                            Math.floor((draw / zShare) * zombies.length))];
                    }
                    draw = (draw - zShare) / (1 - zShare);
                }
                // And the Horde's own off the head of it on ground the Horde
                // holds, read the same way: the goblins are not in the people
                // pool there (npcKeys), so the two never overlap and the tenth
                // face is somebody else for certain.
                if (goblins.length) {
                    const gShare = (pool.length || aliens.length) ? GOBLIN_SHARE : 1;
                    if (draw < gShare) {
                        return goblins[Math.min(goblins.length - 1,
                            Math.floor((draw / gShare) * goblins.length))];
                    }
                    draw = (draw - gShare) / (1 - gShare);
                }
                const share = aliens.length ? (pool.length ? this.alienShare(opts) : 1) : 0;
                if (draw < share) {
                    return aliens[Math.min(aliens.length - 1, Math.floor((draw / share) * aliens.length))];
                }
                const rest = (draw - share) / (1 - share);
                // The even split, read off the same remaining draw: the first
                // half of it is a creature, the second an animal, and either
                // half standing empty leaves the whole of it to the other.
                if (beasts && beasts.creature.length && beasts.animal.length) {
                    const list = rest < 0.5 ? beasts.creature : beasts.animal;
                    const inner = rest < 0.5 ? rest * 2 : (rest - 0.5) * 2;
                    return list[Math.min(list.length - 1, Math.floor(inner * list.length))];
                }
                return pool[Math.min(pool.length - 1, Math.floor(rest * pool.length))];
            },

            // May the spawn systems deal this sheet in this world?
            isSpawnable(key) {
                const e = this.entry(key);
                return !!(e && e.npc === true && e.beta !== true && e.vip !== true);
            }
        };
    })();

    // ── Retired sheets are repointed the moment a graphic is set ────────────
    // One rule at the two doors every character graphic goes through, so a
    // world folder or a savegame written before the sheets were cut renders
    // the same people it always did. Game_CharacterBase.setImage covers every
    // map character (a transplanted NPC event, the player, a follower, a
    // vehicle) and Game_Actor.setCharacterImage the party's own graphics;
    // characterName() then answers the new name, so the bust lookups that read
    // it resolve too. ImageManager.loadCharacter is the backstop for a caller
    // that draws a stored name without going through either, where the cell is
    // not known and the sheet's first face has to stand for it.
    (function () {
        function repoint(name, index) {
            const SC = window.SpriteCatalog;
            return (SC && SC.legacySheet) ? SC.legacySheet(name, index) : null;
        }

        const _setImage = Game_CharacterBase.prototype.setImage;
        Game_CharacterBase.prototype.setImage = function (characterName, characterIndex) {
            const now = repoint(characterName, characterIndex);
            if (now) return _setImage.call(this, now.name, now.index);
            return _setImage.call(this, characterName, characterIndex);
        };

        const _setCharacterImage = Game_Actor.prototype.setCharacterImage;
        Game_Actor.prototype.setCharacterImage = function (characterName, characterIndex) {
            const now = repoint(characterName, characterIndex);
            if (now) return _setCharacterImage.call(this, now.name, now.index);
            return _setCharacterImage.call(this, characterName, characterIndex);
        };

        const _loadCharacter = ImageManager.loadCharacter;
        ImageManager.loadCharacter = function (filename) {
            const now = repoint(filename, 0);
            return _loadCharacter.call(this, now ? now.name : filename);
        };
    })();

    // ── A character sheet that is not there must not stop the game ──────────
    // Repointing above answers every name the wardrobe can account for. What is
    // left is the name it cannot: a sheet deleted outright, a mod that shipped
    // half its art, a file that failed to read. Stock RMMZ turns any one of them
    // into the modal "Failed to load / Retry" screen, and it does not do it
    // where the sprite is drawn - the errored bitmap simply sits in
    // ImageManager's cache until the NEXT scene asks isReady(), which is why a
    // face that has been quietly missing on the map since the world was walked
    // into puts the Retry screen up at the moment a battle starts. Retrying
    // never helps: the file is not going to appear.
    //
    // So a character bitmap that will not load is given another sheet to be
    // (SpriteCatalog.substituteSheet) and, if even that will not load, is
    // dropped from the cache with a line in the console. Nothing else changes:
    // an errored bitmap that is NOT a character sheet still throws, because a
    // missing tileset or window skin is a broken build, not a lost face.
    // The same rule as AssetCaseResolver's, which already does it for sound.
    (function () {
        if (typeof Bitmap !== "function" || !Bitmap.prototype || !ImageManager) return;

        const FOLDER = "img/characters/";
        const reported = Object.create(null);

        // The sheet name behind a bitmap url, or null when the url is not a
        // character sheet at all.
        function sheetOf(url) {
            if (typeof url !== "string" || !url.startsWith(FOLDER) || !url.endsWith(".png")) return null;
            const raw = url.slice(FOLDER.length, -4);
            return raw.split("/").map(part => {
                try { return decodeURIComponent(part); } catch (e) { return part; }
            }).join("/");
        }

        function urlOf(sheet) {
            const encode = (typeof Utils === "object" && Utils.encodeURI)
                ? Utils.encodeURI.bind(Utils)
                : encodeURIComponent;
            return FOLDER + encode(sheet) + ".png";
        }

        function report(message) {
            if (reported[message]) return;
            reported[message] = true;
            console.warn("[DataService] " + message);
        }

        // One substitution per bitmap: the stand-in is a sheet the wardrobe
        // knows, so if that will not load either the build is broken and there
        // is nothing left to try.
        const _onError = Bitmap.prototype._onError;
        Bitmap.prototype._onError = function () {
            const sheet = sheetOf(this._url);
            const SC = window.SpriteCatalog;
            if (sheet && SC && SC.substituteSheet && !this._sheetSubstituted) {
                const other = SC.substituteSheet(sheet);
                if (other && other !== sheet) {
                    this._sheetSubstituted = true;
                    report(sheet + " could not be loaded; drawing " + other + " instead.");
                    this._url = urlOf(other);
                    this._startLoading();
                    return;
                }
            }
            return _onError.call(this);
        };

        // Stock isReady() throws on the first errored bitmap it walks past. This
        // is the same walk with the character sheets taken out of the cache
        // instead, so the scene starts and the rest of the world is drawn.
        ImageManager.isReady = function () {
            for (const cache of [this._cache, this._system]) {
                for (const url in cache) {
                    const bitmap = cache[url];
                    if (bitmap.isError()) {
                        const sheet = sheetOf(url);
                        if (sheet) {
                            report(sheet + " is not on disk; nothing is drawn for it.");
                            delete cache[url];
                            continue;
                        }
                        this.throwLoadError(bitmap);
                    }
                    if (!bitmap.isReady()) return false;
                }
            }
            return true;
        };
    })();

    // ── Destinations.json → display names ───────────────────────────────────
    // Every entry in js/db/WorkSystem/Destinations.json carries a "name" field:
    // the readable form of the place ("GreenWitch" -> "Green Witch"). The object
    // key stays the identity used by every lookup, save record and event name
    // ("Teleport - <key>"), so anything shown to the player resolves the label
    // through here instead of printing the key. Unknown strings pass through, so
    // a place name saved before this field existed still reads correctly, and
    // the result goes through the localization layer like any other data string.
    (function () {
        const destNorm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
        let destIndex = null;
        let countryIndex = null;

        function buildIndex() {
            if (destIndex) return destIndex;
            destIndex = {};
            countryIndex = {};
            const dest = (window.WorkSystem && window.WorkSystem.Destinations) || {};
            for (const [key, data] of Object.entries(dest)) {
                const label = (data && typeof data.name === 'string' && data.name.trim()) || key;
                destIndex[destNorm(key)] = label;
                destIndex[destNorm(label)] = label;
                // Every entry also declares the nation the place stands in
                // ("country", plus the world-map region id as "nationId"), so a
                // town resolves to its real nation instead of a seeded one.
                if (data && data.country) {
                    const polity = { country: data.country, nationId: data.nationId ?? 0 };
                    countryIndex[destNorm(key)] = polity;
                    countryIndex[destNorm(label)] = polity;
                }
            }
            return destIndex;
        }

        window.WorkSystem = window.WorkSystem || {};

        // Readable name of a destination, from its key or from any spelling of it.
        window.WorkSystem.destinationName = function (key) {
            const raw = String(key == null ? '' : key);
            if (!raw) return raw;
            const label = buildIndex()[destNorm(raw)] || raw;
            return (typeof window.translateText === 'function') ? window.translateText(label) : label;
        };

        // The nation a destination belongs to, from its key or from any
        // spelling of it: { country, nationId }, or null for a place with no
        // declared nation (and for anything that is not a destination at all,
        // e.g. a "Proc:x,y" settlement key, which carries its own nationId).
        window.WorkSystem.destinationCountry = function (key) {
            const raw = String(key == null ? '' : key);
            if (!raw) return null;
            buildIndex();
            return countryIndex[destNorm(raw)] || null;
        };

        // Every destination label, in the order the file declares them.
        window.WorkSystem.destinationNames = function () {
            const dest = (window.WorkSystem && window.WorkSystem.Destinations) || {};
            return Object.keys(dest).map(window.WorkSystem.destinationName);
        };
    })();

    // ── i18n: key-based resolver for plugin strings ─────────────────────────
    // Plugin UI and dialogue strings live in js/i18n/<lang>/plugins/<Name>.json
    // and are addressed by key ("ErisTrial.verdict.guilty"). English is always
    // loaded as the fallback layer, so a missing or blank translation reads as
    // English rather than as a broken key.
    //
    // The plugins/ subfolder is deliberate: Hendrix_Localization discovers
    // js/i18n/<lang>/*.json non-recursively, so these keyed files stay out of
    // its English-source replacement map and cannot rewrite unrelated text.
    //
    // Interpolation substitutes {name} ONLY for names present in `params`.
    // Every other brace group passes through verbatim, which is what lets the
    // procedural grammars ({faction}, {a|b|c}) survive this layer untouched.
    // Namespace roots under js/i18n/<lang>/. `plugins` holds UI and system copy;
    // `conversations` holds the NPC dialogue banks and `lore` the database flavour
    // text (the <Lore:>/<En:> note tags), which are big enough that
    // mixing them into the same folder would bury everything else. Namespaces
    // are merged into one flat map, so a file name must be unique across roots.
    const I18N_SUBS = ['plugins', 'conversations', 'lore'];
    const I18N_FALLBACK = 'en';

    let _i18nBase = {};      // English layer, always present
    let _i18nOver = {};      // active language layer, empty when playing in en
    let _i18nCode = null;    // language the override layer was built from
    let _i18nManifest = null;
    const _i18nMissing = new Set();

    // A language folder is two hundred and sixty odd files and seven megabytes,
    // one per namespace, and a session never opens most of the screens they
    // belong to. Every lookup goes through the namespace first - T('Bestiary.x')
    // reads _i18nBase.Bestiary - so a namespace can be registered and read the
    // moment something asks for it, exactly as the js/db files are. Reading a
    // bank at load remains perfectly possible; it just is not done for the two
    // hundred nobody touches.
    function i18nReadFolderNw(lang) {
        const fs = require('fs');
        const path = require('path');
        const out = {};
        const seen = new Set();
        I18N_SUBS.forEach(function (sub) {
            const dir = path.join(process.cwd(), 'js', 'i18n', lang, sub);
            if (!fs.existsSync(dir)) return;
            fs.readdirSync(dir).forEach(function (file) {
                if (path.extname(file).toLowerCase() !== '.json') return;
                const ns = path.basename(file, '.json');
                if (seen.has(ns)) {
                    console.warn('DataService i18n: namespace "' + ns + '" declared in more than one folder.');
                    return;
                }
                seen.add(ns);
                const filePath = path.join(dir, file);
                registerLazy(out, ns, function () {
                    return parseJson(fs.readFileSync(filePath, 'utf8'), filePath);
                });
            });
        });
        return out;
    }

    function i18nManifest() {
        if (_i18nManifest) return _i18nManifest;
        _i18nManifest = {};
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'js/i18n_manifest.json', false);
            xhr.send();
            if (xhr.status === 200) {
                let text = xhr.responseText;
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                _i18nManifest = JSON.parse(text);
            }
        } catch (e) {
            console.warn('DataService i18n: no js/i18n_manifest.json, plugin strings will read as keys.');
        }
        return _i18nManifest;
    }

    function i18nReadFolderBrowser(lang) {
        const out = {};
        // Manifest entries carry their folder ("plugins/Titlescreen.json").
        // Registered, not fetched: a synchronous request blocks the page, and
        // there were two hundred and sixty of them here before anything could
        // be drawn.
        (i18nManifest()[lang] || []).forEach(function (file) {
            const ns = file.replace(/^.*\//, '').replace(/\.json$/i, '');
            const url = 'js/i18n/' + lang + '/' + file;
            registerLazy(out, ns, function () {
                const req = new XMLHttpRequest();
                req.open('GET', url, false);
                req.send();
                if (req.status !== 200) throw new Error('HTTP ' + req.status + ' for ' + url);
                return parseJson(req.responseText, url);
            });
        });
        return out;
    }

    const i18nReadFolder = Utils.isNwjs() ? i18nReadFolderNw : i18nReadFolderBrowser;

    // ConfigManager.language is only populated once ConfigManager.load() has run
    // in Scene_Boot, well after this plugin loads. Rather than wire a callback,
    // every lookup compares the active language against the layer it built and
    // rebuilds on change, which also makes runtime language switching automatic.
    function i18nSync() {
        const lang = String((typeof ConfigManager !== 'undefined' && ConfigManager.language) || I18N_FALLBACK);
        if (lang === _i18nCode) return;
        if (_i18nCode === null) _i18nBase = i18nReadFolder(I18N_FALLBACK);
        _i18nOver = (lang === I18N_FALLBACK) ? {} : i18nReadFolder(lang);
        _i18nCode = lang;
        _i18nMissing.clear();
    }

    function i18nDig(root, parts) {
        let cur = root;
        for (let i = 0; i < parts.length; i++) {
            if (cur === null || typeof cur !== 'object') return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function i18nWarn(key) {
        if (_i18nMissing.has(key)) return;
        _i18nMissing.add(key);
        if (Utils.isOptionValid('test')) {
            console.warn('i18n: missing key "' + key + '"');
        }
    }

    function i18nInterp(text, params) {
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, function (whole, name) {
            return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole;
        });
    }

    // Layer the active language over English value by value. A blank string in
    // the override means "not translated yet" and falls through to English, so
    // a freshly cloned language folder is a fully playable English game.
    function i18nMergeValue(base, over) {
        if (over === undefined) return base;
        if (typeof over === 'string') return over.trim() ? over : base;
        if (Array.isArray(over)) {
            const b = Array.isArray(base) ? base : [];
            const len = Math.max(b.length, over.length);
            const out = [];
            for (let i = 0; i < len; i++) out.push(i18nMergeValue(b[i], over[i]));
            return out;
        }
        if (typeof over === 'object') {
            const b = (base && typeof base === 'object' && !Array.isArray(base)) ? base : {};
            const out = {};
            Object.keys(b).forEach(function (k) { out[k] = b[k]; });
            Object.keys(over).forEach(function (k) { out[k] = i18nMergeValue(b[k], over[k]); });
            return out;
        }
        return over;
    }

    function T(key, params) {
        i18nSync();
        const parts = String(key).split('.');
        const over = i18nDig(_i18nOver, parts);
        if (typeof over === 'string' && over.trim()) return i18nInterp(over, params);
        const base = i18nDig(_i18nBase, parts);
        if (typeof base === 'string') return i18nInterp(base, params);
        i18nWarn(key);
        return key;
    }

    // Content banks. Falls back element by element, and honours an override
    // longer than English so a language may carry extra wording variants.
    T.list = function (key, params) {
        i18nSync();
        const parts = String(key).split('.');
        const base = i18nDig(_i18nBase, parts);
        const over = i18nDig(_i18nOver, parts);
        const baseArr = Array.isArray(base) ? base : null;
        const overArr = Array.isArray(over) ? over : null;
        if (!baseArr && !overArr) {
            i18nWarn(key);
            return [];
        }
        const len = Math.max(baseArr ? baseArr.length : 0, overArr ? overArr.length : 0);
        const out = [];
        for (let i = 0; i < len; i++) {
            const o = overArr ? overArr[i] : undefined;
            const b = baseArr ? baseArr[i] : undefined;
            const v = (typeof o === 'string' && o.trim()) ? o : b;
            if (typeof v === 'string') out.push(i18nInterp(v, params));
            else if (v !== undefined) out.push(v);
        }
        return out;
    };

    // A randomised POOL, not a list of distinct slots. Where T.list merges index
    // by index (so a short translation shows English in the gaps), a pool is
    // taken from the active language whole or not at all: a language may offer
    // 40 names where English offers 170 without English ones leaking in.
    // Use this for name banks and phrase pools; use T.list where each index
    // means something specific.
    T.pool = function (key) {
        i18nSync();
        const parts = String(key).split('.');
        const over = i18nDig(_i18nOver, parts);
        if (Array.isArray(over) && over.some(function (v) { return typeof v === 'string' && v.trim(); })) {
            return over.slice();
        }
        const base = i18nDig(_i18nBase, parts);
        if (Array.isArray(base)) return base.slice();
        i18nWarn(key);
        return [];
    };

    T.obj = function (key) {
        i18nSync();
        const parts = String(key).split('.');
        const base = i18nDig(_i18nBase, parts);
        const over = i18nDig(_i18nOver, parts);
        if (base === undefined && over === undefined) {
            i18nWarn(key);
            return {};
        }
        return i18nMergeValue(base, over);
    };

    T.n = function (key, count, params) {
        const p = Object.assign({ count: count }, params || {});
        const sub = count === 1 ? '.one' : '.other';
        return T.has(key + sub) ? T(key + sub, p) : T(key, p);
    };

    T.has = function (key) {
        i18nSync();
        const parts = String(key).split('.');
        return i18nDig(_i18nBase, parts) !== undefined ||
               i18nDig(_i18nOver, parts) !== undefined;
    };

    // Plugin-parameter defaults (js/plugins.js) are user-facing but live outside
    // the code. Pass the parameter value plus the key holding the shipped
    // default: an untouched parameter localises, one a player or mod edited
    // wins as written.
    T.param = function (value, key) {
        i18nSync();
        if (value === undefined || value === null || value === '') return T(key);
        const shipped = i18nDig(_i18nBase, String(key).split('.'));
        return (typeof shipped === 'string' && String(value) === shipped) ? T(key) : String(value);
    };

    T.reload = function () {
        _i18nCode = null;
        _i18nManifest = null;
        i18nSync();
    };

    T.language = function () {
        i18nSync();
        return _i18nCode;
    };

    // Every namespace there is, for the debug console and the key checker.
    // Listing them does not read them: a bank is read when a key in it is asked
    // for (see i18nReadFolderNw).
    T.namespaces = function () {
        i18nSync();
        return Object.keys(_i18nBase).sort();
    };

    window.T = T;
    window.I18N = T;
    // Callers that translate a data-driven name (an ideology, a trait entry) reach for
    // DataService.t and treat "the key came back unchanged" as untranslated, which is exactly
    // what T does. Only window.T was ever published, so those lookups always fell through.
    window.DataService = window.DataService || {};
    window.DataService.t = T;
    i18nSync();
    console.log('DataService: i18n resolver ready (' + T.namespaces().length + ' namespaces).');

    // ── Biome display names ─────────────────────────────────────────────────
    // A biome's `name` in Biomes.json is its identity, not its label: roads,
    // prefabs, enemy <Biome:> tags, battleback folders, map <Biome:> notes and
    // every generator branch match on it, so it can never be reworded. What the
    // player reads is resolved here instead, in this order:
    //
    //   1. a translation under the i18n key "Biomes.<id>", when the game is not
    //      being played in English;
    //   2. the biome's own `displayName` field, which is where an id that does
    //      not read as English is fixed ("ForestTropical" -> "Tropical Forest");
    //   3. the English "Biomes.<id>" entry, so a biome can be named from the
    //      i18n file alone (that file is also the translators' source list);
    //   4. the CamelCase split ("SpiritWoods" -> "Spirit Woods"), which is what
    //      most ids already amount to.
    //
    // `displayName` deliberately outranks the English i18n entry: editing
    // Biomes.json is how a biome is renamed, and an English copy of the name
    // sitting in front of the data file would silently ignore that edit.
    (function () {
        let index = null;
        let indexSize = -1;

        function biomeList() {
            return (window.WorldGen && Array.isArray(window.WorldGen.Biomes))
                ? window.WorldGen.Biomes : [];
        }

        // Rebuilt whenever the catalogue grows: the alien biomes are merged in
        // above, and a mod may append more after this plugin has run.
        function biomeIndex() {
            const list = biomeList();
            if (index && indexSize === list.length) return index;
            index = {};
            list.forEach(function (b) {
                if (b && b.name) index[String(b.name).toLowerCase()] = b;
            });
            indexSize = list.length;
            return index;
        }

        function splitCamel(id) {
            return String(id).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
        }

        function translated(id) {
            const key = 'Biomes.' + id;
            return (T.language() !== I18N_FALLBACK && T.has(key)) ? T(key) : null;
        }

        function english(id) {
            const key = 'Biomes.' + id;
            return T.has(key) ? T(key) : null;
        }

        window.BiomeNames = {
            // The readable name of one biome id. An id the catalogue does not
            // know still reads, through the CamelCase split, so a map note or a
            // mod naming an unlisted biome degrades instead of showing nothing.
            display: function (id) {
                const raw = String(id == null ? '' : id).trim();
                if (!raw) return '';
                const entry = biomeIndex()[raw.toLowerCase()];
                const name = entry ? entry.name : raw;
                return translated(name) ||
                       (entry && typeof entry.displayName === 'string' && entry.displayName.trim()
                           ? entry.displayName.trim() : null) ||
                       english(name) ||
                       splitCamel(name);
            },

            // A comma-separated list of ids ("Ice, Permafrost, ForestIce"), the
            // shape the enemy <Biome:> tag stores, resolved name by name.
            displayList: function (ids) {
                return String(ids == null ? '' : ids)
                    .split(',')
                    .map(function (s) { return window.BiomeNames.display(s); })
                    .filter(function (s) { return !!s; })
                    .join(', ');
            },

            // The Biomes.json entry behind an id, or null. Exposed so callers
            // that already need the record do not build a second index.
            entry: function (id) {
                const raw = String(id == null ? '' : id).trim();
                return raw ? (biomeIndex()[raw.toLowerCase()] || null) : null;
            }
        };
    })();

    // ── World proper nouns ──────────────────────────────────────────────────
    // A nation, a hyperpower, a faction and a historical leader are each stored
    // under their English name, because that name IS the id: the timeline, the
    // world folder, HistorySimulator's COUNTRIES table, Hyperpowers.json and
    // every wiki lookup match on it, so it can never be reworded. What a player
    // reads is resolved here, at the moment the name is drawn, out of
    // js/i18n/<lang>/plugins/WorldNames.json. Same rule as BiomeNames above and
    // as governmentLabel() in HistorySimulator: keep the id, lift the face.
    //
    // Faction names are deliberately NOT duplicated into that file. They already
    // live in js/i18n/<lang>/faction.json under the slug of their English name,
    // which is exactly what FactionDataManager reads, so the faction branch asks
    // it rather than growing a second copy to keep in step.
    (function () {
        // The tight slug (no separators) is the convention the rest of the world
        // data already uses: faction.json's keys and NPCPolitics' powerSlug().
        function slug(name) {
            return String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]+/g, '');
        }

        function look(kind, name) {
            const s = slug(name);
            if (!s) return null;
            const key = 'WorldNames.' + kind + '.' + s;
            return T.has(key) ? T(key) : null;
        }

        // How many leading words of a leader's name may be read as an office.
        // "Dean of Cardinals Francesco" is the longest in the shipped roster.
        const MAX_TITLE_WORDS = 4;

        // The set of English names worth scanning a finished sentence for, and
        // the label each one now reads as. Cached against the language and the
        // size of the noun export, so a read is two comparisons.
        let _mapLang = null, _mapSize = -1, _map = null, _re = null;
        let _anyLang = null, _any = new Map();

        function properNouns() {
            const out = [];
            const listed = window.HistorySimulator_PROPER_NOUNS;
            if (Array.isArray(listed)) out.push.apply(out, listed);
            // HistorySimulator's export only covers the nations its own timeline
            // moves (the European theatre); the full roster is Countries.json,
            // and an event may name any of it.
            const countries = window.WorldGen && window.WorldGen.Countries;
            if (Array.isArray(countries)) {
                for (const c of countries) if (c && c.country) out.push(c.country);
            }
            // Powers and nations the simulation invented after the static export
            // was built, plus their leaders, so a dynamic name localizes too.
            const hm = window.HistoryManager;
            if (hm) {
                const hp = (hm.getHyperpowers && hm.getHyperpowers()) || {};
                for (const name of Object.keys(hp)) {
                    out.push(name);
                    const data = hp[name] || {};
                    for (const l of (data.leaders || [])) if (l && l.name) out.push(l.name);
                    for (const l of (data.holy_leaders || [])) if (l && l.name) out.push(l.name);
                }
                const ns = (hm.getNationsState && hm.getNationsState()) || {};
                for (const name of Object.keys(ns)) {
                    out.push(name);
                    const c = ns[name] && ns[name].controller;
                    if (c && c !== 'Neutral') out.push(c);
                }
            }
            return out;
        }

        function buildMap() {
            const lang = T.language();
            const nouns = properNouns();
            if (_map && _mapLang === lang && _mapSize === nouns.length) return _map;
            _map = new Map();
            for (const name of nouns) {
                if (!name) continue;
                const label = window.WorldNames.any(name);
                if (label && label !== name) _map.set(name, label);
            }
            _mapLang = lang;
            _mapSize = nouns.length;
            // Longest first, so a multi-word name wins over its own substrings
            // ("Italy" must not eat the front of "Italy - Sicily"). The
            // lookarounds stand in for \b, which a name ending in ")" fails.
            const keys = Array.from(_map.keys()).sort(function (a, b) { return b.length - a.length; });
            _re = keys.length
                ? new RegExp('(?<![A-Za-z0-9])(' + keys.map(function (k) {
                      return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  }).join('|') + ')(?![A-Za-z0-9])', 'g')
                : null;
            return _map;
        }

        window.WorldNames = {
            slug: slug,

            // A nation as stored in COUNTRIES / Countries.json.
            nation: function (name) {
                const raw = String(name == null ? '' : name).trim();
                return raw ? (look('nation', raw) || raw) : '';
            },

            // A hyperpower / controller, as keyed in Hyperpowers.json.
            power: function (name) {
                const raw = String(name == null ? '' : name).trim();
                if (!raw) return '';
                // 'Neutral' is a controller id meaning "nobody", and reads through
                // History's own vocabulary wherever it is shown.
                return look('power', raw) || look('nation', raw) || raw;
            },

            // A faction by its English display name, through faction.json.
            faction: function (name) {
                const raw = String(name == null ? '' : name).trim();
                if (!raw) return '';
                const own = look('faction', raw);
                if (own) return own;
                const fdm = window.FactionDataManager && window.FactionDataManager.instance;
                if (fdm && typeof fdm.t === 'function') {
                    const path = 'factions.' + slug(raw) + '.name';
                    const label = fdm.t(path);
                    // .t() answers with the path it was given when it has no
                    // entry, which is not a name.
                    if (label && label !== path) return label;
                }
                return raw;
            },

            // A leader. The shipped roster (js/db/WorldGen/Leaders.json) is
            // listed name by name, because an office translates as a phrase and
            // not word by word: "Chief Engineer" is "Ingegnere Capo", so no
            // per-word rule can produce it. A politician composed at run time by
            // NPCPolitics is not in that roster, and falls through to the office
            // vocabulary in front of the person's own name, which is left alone.
            leader: function (name) {
                const raw = String(name == null ? '' : name).trim();
                if (!raw) return '';
                const whole = look('leader', raw);
                if (whole) return whole;
                const words = raw.split(/\s+/);
                for (let n = Math.min(MAX_TITLE_WORDS, words.length); n >= 1; n--) {
                    const office = look('title', words.slice(0, n).join(' '));
                    if (office) return (office + ' ' + words.slice(n).join(' ')).trim();
                }
                return raw;
            },

            // One office on its own ("Grand Vizier", "Comrade").
            title: function (name) {
                const raw = String(name == null ? '' : name).trim();
                return raw ? (look('title', raw) || raw) : '';
            },

            // A birthplace or hometown: a town if Destinations.json knows it,
            // otherwise a nation. Both spellings are stored in the same field by
            // the character dossiers and by NPCSociety's backstories.
            place: function (name) {
                const raw = String(name == null ? '' : name).trim();
                if (!raw) return '';
                if (window.WorkSystem && window.WorkSystem.destinationName) {
                    const town = window.WorkSystem.destinationName(raw);
                    if (town && town !== raw) return town;
                }
                return window.WorldNames.nation(raw);
            },

            // Whatever kind of world name this is, or the name itself. Used
            // where a record only says "a name" (event params, wiki links).
            // Memoized per language: HistorySimulator asks this of every string
            // param of every event it writes out, and the Historical Archive
            // draws thousands of them in one pass.
            any: function (name) {
                const raw = String(name == null ? '' : name).trim();
                if (!raw) return '';
                const lang = T.language();
                if (lang !== _anyLang) { _anyLang = lang; _any = new Map(); }
                let hit = _any.get(raw);
                if (hit === undefined) {
                    hit = look('nation', raw) || look('power', raw) ||
                          look('leader', raw) || window.WorldNames.faction(raw) || raw;
                    _any.set(raw, hit);
                }
                return hit;
            },

            // Every English world name a finished sentence may contain, mapped to
            // what it reads as now. Only the names that actually change are in it.
            map: function () { return buildMap(); },

            // Rewrite the world names inside prose that was composed in English.
            // This is the only path open to a record that stored its finished
            // sentence instead of the key it was written from.
            localize: function (text) {
                const raw = String(text == null ? '' : text);
                if (!raw) return raw;
                const map = buildMap();
                if (!_re || !map.size) return raw;
                return raw.replace(_re, function (m) { return map.get(m) || m; });
            }
        };
    })();
})();
